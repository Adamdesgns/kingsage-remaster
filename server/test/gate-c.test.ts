import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { makeCommandEnvelope, type GameCommand } from "../../packages/game-core/src/contracts.ts";
import { storageCapacity } from "../../packages/game-core/src/economy.ts";
import { SharedWorldStore, type SessionPlayer } from "../src/store.ts";

function tempDatabase(): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-gate-c-"));
  return { directory, path: join(directory, "world.sqlite") };
}

function register(store: SharedWorldStore, suffix: string) {
  return store.register({ username: `gatec_${suffix}`, password: `gate-c-${suffix}-password`, kingdomName: `Gate C ${suffix}` });
}

function command(store: SharedWorldStore, player: SessionPlayer, gameCommand: GameCommand, id: string) {
  const snapshot = store.getSnapshot(player);
  return store.applyCommand(player, makeCommandEnvelope({
    commandId: id,
    worldId: snapshot.world.id,
    actorPlayerId: player.id,
    expectedWorldVersion: snapshot.world.version,
    issuedAt: snapshot.serverTime,
    command: gameCommand,
  }));
}

function setVillageState(store: SharedWorldStore, villageId: string, update: { resources?: number; buildings?: Record<string, number> }) {
  const row = store.db.prepare("SELECT resources_json, buildings_json FROM local_villages WHERE id = ?").get(villageId) as Record<string, unknown>;
  const resources = JSON.parse(String(row.resources_json));
  const buildings = JSON.parse(String(row.buildings_json));
  if (update.resources) resources.wood = resources.stone = resources.iron = update.resources;
  Object.assign(buildings, update.buildings ?? {});
  store.db.prepare("UPDATE local_villages SET resources_json = ?, buildings_json = ? WHERE id = ?")
    .run(JSON.stringify(resources), JSON.stringify(buildings), villageId);
}

test("seven days offline materializes production and respects warehouse capacity", () => {
  const temp = tempDatabase();
  let now = new Date("2026-08-16T12:00:00.000Z");
  const store = new SharedWorldStore(temp.path, { now: () => now });
  try {
    const account = register(store, "offline");
    const before = store.getSnapshot(account.player);
    const village = before.world.villages.find((candidate) => candidate.kingdomId === account.player.kingdomId)!;
    now = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const after = store.getSnapshot(account.player);
    const grown = after.world.villages.find((candidate) => candidate.id === village.id)!;
    const cap = storageCapacity(grown.buildings.warehouse);
    assert.deepEqual(grown.resources, { wood: cap, stone: cap, iron: cap });
    assert.ok(Object.values(grown.resources).every((amount) => amount >= 0 && amount <= cap));
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("building prerequisites are authoritative and completion cannot run twice", () => {
  const temp = tempDatabase();
  let now = new Date("2026-08-16T12:00:00.000Z");
  const store = new SharedWorldStore(temp.path, { now: () => now, buildDurationMs: 1_000 });
  try {
    const account = register(store, "builder");
    const village = store.getSnapshot(account.player).world.villages.find((candidate) => candidate.kingdomId === account.player.kingdomId)!;
    const blocked = command(store, account.player, { type: "village.build.queue", payload: { villageId: village.id, building: "smithy" } }, "blocked-smithy");
    assert.equal(blocked.type, "command.rejected");
    if (blocked.type === "command.rejected") assert.equal(blocked.payload.code, "PREREQUISITE_MISSING");
    setVillageState(store, village.id, { resources: 20_000, buildings: { hq: 3, barracks: 3 } });
    assert.equal(command(store, account.player, { type: "village.build.queue", payload: { villageId: village.id, building: "smithy" } }, "build-smithy").type, "command.accepted");
    now = new Date(now.getTime() + 1_001);
    store.materializeDueJobs();
    store.materializeDueJobs();
    const after = store.getSnapshot(account.player);
    assert.equal(after.world.villages.find((candidate) => candidate.id === village.id)?.buildings.smithy, 1);
    assert.equal(after.constructionJobs.length, 0);
    assert.equal(after.notifications.filter((notice) => notice.kind === "construction").length, 1);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("recruitment reserves population and completes into the army exactly once", () => {
  const temp = tempDatabase();
  let now = new Date("2026-08-16T12:00:00.000Z");
  const store = new SharedWorldStore(temp.path, { now: () => now, recruitDurationMs: 1_000 });
  try {
    const account = register(store, "recruiter");
    const before = store.getSnapshot(account.player);
    const village = before.world.villages.find((candidate) => candidate.kingdomId === account.player.kingdomId)!;
    const populationBefore = before.villageEconomy.find((entry) => entry.villageId === village.id)!.populationUsed;
    assert.equal(command(store, account.player, { type: "village.recruit.queue", payload: { villageId: village.id, troop: "spear", quantity: 5 } }, "recruit-five").type, "command.accepted");
    const queued = store.getSnapshot(account.player);
    assert.equal(queued.villageEconomy.find((entry) => entry.villageId === village.id)?.populationUsed, populationBefore + 5);
    now = new Date(now.getTime() + 1_001);
    store.materializeDueJobs();
    store.materializeDueJobs();
    const after = store.getSnapshot(account.player);
    assert.equal(after.world.villages.find((candidate) => candidate.id === village.id)?.army.spear, village.army.spear + 5);
    assert.equal(after.recruitmentJobs.length, 0);
    assert.equal(after.notifications.filter((notice) => notice.kind === "recruitment").length, 1);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("smithy research raises kingdom troop level and survives reconnect", () => {
  const temp = tempDatabase();
  let now = new Date("2026-08-16T12:00:00.000Z");
  let store = new SharedWorldStore(temp.path, { now: () => now, researchDurationMs: 1_000 });
  try {
    const account = register(store, "scholar");
    const village = store.getSnapshot(account.player).world.villages.find((candidate) => candidate.kingdomId === account.player.kingdomId)!;
    setVillageState(store, village.id, { resources: 20_000, buildings: { smithy: 1 } });
    assert.equal(command(store, account.player, { type: "kingdom.research.queue", payload: { villageId: village.id, troop: "spear", targetLevel: 2 } }, "research-spear-two").type, "command.accepted");
    now = new Date(now.getTime() + 1_001);
    store.close();
    store = new SharedWorldStore(temp.path, { now: () => now, researchDurationMs: 1_000 });
    const restored = store.authenticate(account.token)!;
    const after = store.getSnapshot(restored);
    assert.equal(after.kingdom.troopLevels.spear, 2);
    assert.equal(after.researchJobs.length, 0);
    assert.equal(after.notifications.filter((notice) => notice.kind === "research").length, 1);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("two kingdoms return after a simulated week with independent completed queues", () => {
  const temp = tempDatabase();
  let now = new Date("2026-08-16T12:00:00.000Z");
  let store = new SharedWorldStore(temp.path, { now: () => now, buildDurationMs: 24 * 60 * 60 * 1000 });
  try {
    const first = register(store, "weekone");
    const second = register(store, "weektwo");
    const firstVillage = store.getSnapshot(first.player).world.villages.find((candidate) => candidate.kingdomId === first.player.kingdomId)!;
    const secondVillage = store.getSnapshot(second.player).world.villages.find((candidate) => candidate.kingdomId === second.player.kingdomId)!;
    assert.equal(command(store, first.player, { type: "village.build.queue", payload: { villageId: firstVillage.id, building: "timber" } }, "week-first-timber").type, "command.accepted");
    assert.equal(command(store, second.player, { type: "village.build.queue", payload: { villageId: secondVillage.id, building: "timber" } }, "week-second-timber").type, "command.accepted");
    store.close();
    now = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    store = new SharedWorldStore(temp.path, { now: () => now, buildDurationMs: 24 * 60 * 60 * 1000 });
    const firstAfter = store.getSnapshot(store.authenticate(first.token)!);
    const secondAfter = store.getSnapshot(store.authenticate(second.token)!);
    assert.equal(firstAfter.world.villages.find((candidate) => candidate.id === firstVillage.id)?.buildings.timber, 2);
    assert.equal(secondAfter.world.villages.find((candidate) => candidate.id === secondVillage.id)?.buildings.timber, 2);
    assert.equal(firstAfter.constructionJobs.length, 0);
    assert.equal(secondAfter.constructionJobs.length, 0);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});
