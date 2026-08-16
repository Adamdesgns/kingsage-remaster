import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildingCost } from "../../packages/game-core/src/economy.ts";
import { makeCommandEnvelope } from "../../packages/game-core/src/contracts.ts";
import { createWorldHttpServer } from "../src/http.ts";
import { SharedWorldStore } from "../src/store.ts";

function tempDatabase(): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-gate-b-"));
  return { directory, path: join(directory, "world.sqlite") };
}

function registration(store: SharedWorldStore, suffix: string) {
  return store.register({
    username: `player_${suffix}`,
    password: `kingdom-${suffix}-password`,
    kingdomName: `${suffix} Crown`,
  });
}

test("two accounts claim permanent seats in the same deterministic world", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path);
  try {
    const first = registration(store, "one");
    const second = registration(store, "two");
    const firstSnapshot = store.getSnapshot(first.player);
    const secondSnapshot = store.getSnapshot(second.player);

    assert.equal(firstSnapshot.world.id, secondSnapshot.world.id);
    assert.notEqual(first.player.kingdomId, second.player.kingdomId);
    assert.equal(firstSnapshot.world.kingdoms.filter((kingdom) => kingdom.seatKind === "human").length, 2);
    assert.equal(firstSnapshot.world.kingdoms.filter((kingdom) => kingdom.seatKind === "ai").length, 4);
    assert.equal(firstSnapshot.kingdom.name, "one Crown");
    assert.equal(secondSnapshot.kingdom.name, "two Crown");
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("kingdom names stay unique across human and AI seats", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path);
  try {
    assert.throws(
      () => store.register({ username: "duplicate_name", password: "duplicate-password", kingdomName: "Ember Crown" }),
      (error: any) => error?.code === "KINGDOM_NAME_TAKEN",
    );
    const first = registration(store, "unique");
    assert.throws(
      () => store.register({ username: "second_unique", password: "another-password", kingdomName: "unique Crown" }),
      (error: any) => error?.code === "KINGDOM_NAME_TAKEN",
    );
    assert.equal(store.getSnapshot(first.player).kingdom.name, "unique Crown");
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("an authoritative build command is idempotent and visible to the other account", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path, { buildDurationMs: 60_000 });
  try {
    const first = registration(store, "alpha");
    const second = registration(store, "bravo");
    const before = store.getSnapshot(first.player);
    const village = before.world.villages.find((candidate) => candidate.kingdomId === first.player.kingdomId)!;
    const envelope = makeCommandEnvelope({
      commandId: "command-build-barracks",
      worldId: before.world.id,
      actorPlayerId: first.player.id,
      expectedWorldVersion: before.world.version,
      issuedAt: new Date().toISOString(),
      command: { type: "village.build.queue", payload: { villageId: village.id, building: "barracks" } },
    });

    const accepted = store.applyCommand(first.player, envelope);
    const replayed = store.applyCommand(first.player, envelope);
    assert.deepEqual(replayed, accepted);
    assert.equal(accepted.type, "command.accepted");

    const otherView = store.getSnapshot(second.player);
    const changedVillage = otherView.world.villages.find((candidate) => candidate.id === village.id)!;
    assert.equal(otherView.world.version, before.world.version + 1);
    assert.equal(changedVillage.resources.wood, village.resources.wood - buildingCost("barracks", village.buildings.barracks).wood);
    assert.equal(otherView.constructionJobs.length, 1);
    assert.equal(store.readEvents(before.world.id, before.world.version).at(-1)?.type, "village.changed");
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("world chat derives identity and rank from the authenticated kingdom", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path);
  try {
    const first = registration(store, "speaker");
    const second = registration(store, "listener");
    const before = store.getSnapshot(first.player);
    const command = makeCommandEnvelope({
      commandId: "command-world-chat",
      worldId: before.world.id,
      actorPlayerId: first.player.id,
      expectedWorldVersion: before.world.version,
      issuedAt: new Date().toISOString(),
      command: { type: "chat.send", payload: { channelId: `world:${before.world.id}`, body: "Rally at the western ridge." } },
    });
    assert.equal(store.applyCommand(first.player, command).type, "command.accepted");
    assert.deepEqual(store.applyCommand(first.player, command), store.applyCommand(first.player, command));
    const listenerView = store.getSnapshot(second.player);
    assert.equal(listenerView.chatMessages.at(-1)?.body, "Rally at the western ridge.");
    assert.equal(listenerView.chatMessages.at(-1)?.kingdomName, "speaker Crown");
    assert.equal(listenerView.chatMessages.at(-1)?.arenaTier, "Unranked");
    assert.equal(listenerView.chatMessages.at(-1)?.playerId, first.player.id);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("sessions and world changes survive a complete database reconnect", () => {
  const temp = tempDatabase();
  let store = new SharedWorldStore(temp.path, { buildDurationMs: 60_000 });
  try {
    const account = registration(store, "durable");
    const before = store.getSnapshot(account.player);
    const village = before.world.villages.find((candidate) => candidate.kingdomId === account.player.kingdomId)!;
    store.applyCommand(account.player, makeCommandEnvelope({
      commandId: "command-before-restart",
      worldId: before.world.id,
      actorPlayerId: account.player.id,
      expectedWorldVersion: before.world.version,
      issuedAt: new Date().toISOString(),
      command: { type: "village.build.queue", payload: { villageId: village.id, building: "barracks" } },
    }));
    store.close();

    store = new SharedWorldStore(temp.path, { buildDurationMs: 60_000 });
    const restoredPlayer = store.authenticate(account.token);
    assert.deepEqual(restoredPlayer, account.player);
    const restored = store.getSnapshot(restoredPlayer!);
    assert.equal(restored.world.version, before.world.version + 1);
    assert.equal(restored.constructionJobs[0]?.building, "barracks");
    assert.equal(restored.world.villages.find((candidate) => candidate.id === village.id)?.resources.wood, village.resources.wood - buildingCost("barracks", village.buildings.barracks).wood);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("completed construction materializes from server time after reconnect", () => {
  const temp = tempDatabase();
  let current = new Date("2026-08-16T20:00:00.000Z");
  const store = new SharedWorldStore(temp.path, { buildDurationMs: 1_000, now: () => current });
  try {
    const account = registration(store, "timer");
    const before = store.getSnapshot(account.player);
    const village = before.world.villages.find((candidate) => candidate.kingdomId === account.player.kingdomId)!;
    store.applyCommand(account.player, makeCommandEnvelope({
      commandId: "command-timed-build",
      worldId: before.world.id,
      actorPlayerId: account.player.id,
      expectedWorldVersion: before.world.version,
      issuedAt: current.toISOString(),
      command: { type: "village.build.queue", payload: { villageId: village.id, building: "barracks" } },
    }));
    current = new Date(current.getTime() + 1_001);
    store.materializeDueJobs();
    const after = store.getSnapshot(account.player);
    assert.equal(after.world.villages.find((candidate) => candidate.id === village.id)?.buildings.barracks, 2);
    assert.equal(after.constructionJobs.length, 0);
    assert.equal(after.world.version, before.world.version + 2);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("the HTTP boundary keeps two cookie sessions isolated and streams committed events", async () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path, { buildDurationMs: 60_000 });
  const app = createWorldHttpServer({ store });
  await new Promise<void>((resolveListen) => app.server.listen(0, "127.0.0.1", resolveListen));
  const address = app.server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  async function registerHttp(suffix: string): Promise<string> {
    const response = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `http_${suffix}`, password: `http-${suffix}-password`, kingdomName: `HTTP ${suffix}` }),
    });
    assert.equal(response.status, 201);
    return String(response.headers.get("set-cookie")).split(";")[0];
  }

  try {
    const firstCookie = await registerHttp("one");
    const secondCookie = await registerHttp("two");
    const firstSnapshotResponse = await fetch(`${base}/api/world/snapshot`, { headers: { Cookie: firstCookie } });
    const secondSnapshotResponse = await fetch(`${base}/api/world/snapshot`, { headers: { Cookie: secondCookie } });
    const firstSnapshot = await firstSnapshotResponse.json() as any;
    const secondSnapshot = await secondSnapshotResponse.json() as any;
    assert.equal(firstSnapshot.world.id, secondSnapshot.world.id);
    assert.notEqual(firstSnapshot.player.kingdomId, secondSnapshot.player.kingdomId);

    const village = firstSnapshot.world.villages.find((candidate: any) => candidate.kingdomId === firstSnapshot.player.kingdomId);
    const command = makeCommandEnvelope({
      commandId: "http-build-command",
      worldId: firstSnapshot.world.id,
      actorPlayerId: firstSnapshot.player.id,
      expectedWorldVersion: firstSnapshot.world.version,
      issuedAt: new Date().toISOString(),
      command: { type: "village.build.queue", payload: { villageId: village.id, building: "barracks" } },
    });
    const commandResponse = await fetch(`${base}/api/world/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: firstCookie },
      body: JSON.stringify(command),
    });
    assert.equal(commandResponse.status, 200);

    const eventsResponse = await fetch(`${base}/api/world/events?since=${firstSnapshot.world.version}`, { headers: { Cookie: secondCookie } });
    const events = await eventsResponse.json() as any;
    assert.equal(events.events.at(-1)?.type, "village.changed");

    const abort = new AbortController();
    const streamResponse = await fetch(`${base}/api/world/stream?since=${firstSnapshot.world.version}`, {
      headers: { Cookie: secondCookie },
      signal: abort.signal,
    });
    const chunk = await streamResponse.body!.getReader().read();
    abort.abort();
    assert.match(new TextDecoder().decode(chunk.value), /village\.changed/);
  } finally {
    await app.close();
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});
