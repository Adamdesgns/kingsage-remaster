// The scouting loop as the Roblox layer actually experiences it: through the
// real /api/roblox/* routes, not the store directly. The point these tests
// defend is that a scout report is the ONLY way a player learns a neighbour's
// strength — the same snapshot that carries the report still shows that
// village fogged.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { emptyArmy } from "../../packages/game-core/src/contracts.ts";
import { createWorldHttpServer } from "../src/http.ts";
import { SharedWorldStore } from "../src/store.ts";

const KEY = "test-secret-key-0123456789abcdef";
const USER_ID = 770001;

type Clock = { advance: (ms: number) => void };

async function withServer(
  run: (context: {
    base: string;
    store: SharedWorldStore;
    clock: Clock;
    session: () => Promise<any>;
    state: () => Promise<any>;
    command: (commandId: string, expectedWorldVersion: number, command: unknown) => Promise<{ status: number; body: any }>;
  }) => Promise<void>,
) {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-scouting-"));
  let now = new Date("2026-08-21T12:00:00.000Z");
  const store = new SharedWorldStore(join(directory, "world.sqlite"), {
    now: () => now,
    marchDurationMs: 1_000,
    returnDurationMs: 1_000,
  });
  const app = createWorldHttpServer({ store, robloxKey: KEY });
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;

  const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kingsage-key": KEY },
    body: JSON.stringify(body),
  });

  try {
    await run({
      base,
      store,
      clock: { advance: (ms) => { now = new Date(now.getTime() + ms); } },
      session: async () => (await post("/api/roblox/session", { robloxUserId: USER_ID, displayName: "Scout Tester" })).json(),
      state: async () => {
        const payload = await (await post("/api/roblox/state", { robloxUserIds: [USER_ID] })).json();
        return payload.states[String(USER_ID)];
      },
      command: async (commandId, expectedWorldVersion, command) => {
        const response = await post("/api/roblox/commands", { robloxUserId: USER_ID, commandId, expectedWorldVersion, command });
        return { status: response.status, body: await response.json() };
      },
    });
  } finally {
    await app.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function homeAndTarget(snapshot: any) {
  const home = snapshot.world.villages.find((village: any) => village.kingdomId === snapshot.kingdom.id && village.isCapital);
  const target = snapshot.world.villages.find((village: any) => village.kingdomId !== snapshot.kingdom.id);
  assert.ok(home, "the linked kingdom has a capital");
  assert.ok(target, "the fixture world has a foreign village to scout");
  return { home, target };
}

test("foreign villages arrive fogged, and only a scout report lifts it", async () => {
  await withServer(async ({ store, clock, session, state, command }) => {
    await session();
    const opening = await state();
    const { home, target } = homeAndTarget(opening);

    // Fog, before anything is scouted: the neighbour is visible as a place,
    // but every number about it reads empty.
    assert.equal(target.army.spear, 0);
    assert.equal(target.resources.wood, 0);
    assert.equal(target.buildings.hq, 0);

    // Give the target a distinctive garrison so the report cannot accidentally
    // match the fogged zeros.
    store.db.prepare("UPDATE local_villages SET army_json = ? WHERE id = ?")
      .run(JSON.stringify({ ...emptyArmy(), spear: 41, archer: 7, scout: 3 }), target.id);

    const launched = await command("scout-1", opening.world.version, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "scout", army: { ...emptyArmy(), scout: 1 } },
    });
    assert.equal(launched.status, 200);
    assert.equal(launched.body.type, "command.accepted");

    // The scout physically left home.
    const marching = await state();
    const homeMarching = marching.world.villages.find((village: any) => village.id === home.id);
    assert.equal(homeMarching.army.scout, home.army.scout - 1);
    assert.equal(marching.marches.length, 1);
    assert.equal(marching.marches[0].kind, "scout");
    assert.equal(marching.marches[0].status, "outbound");
    assert.equal(marching.scoutReports.length, 0, "no intel before the scouts arrive");

    clock.advance(1_100);
    const scouted = await state();
    const report = scouted.scoutReports.find((candidate: any) => candidate.targetVillageId === target.id);
    assert.ok(report, "a report lands when the scouts arrive");
    assert.equal(report.observedArmy.spear, 41);
    assert.equal(report.observedArmy.archer, 7);
    assert.equal(report.targetVillageName, target.name);
    assert.ok(report.observedBuildings.hq >= 1, "the report carries real building levels");

    // THE POINT: same snapshot, same village — still fogged in world state.
    const stillFogged = scouted.world.villages.find((village: any) => village.id === target.id);
    assert.equal(stillFogged.army.spear, 0, "world state must never leak the garrison");
    assert.equal(stillFogged.buildings.hq, 0, "world state must never leak building levels");

    // And the scouts turn for home rather than vanishing.
    assert.equal(scouted.marches.find((march: any) => march.id === report.marchId)?.status, "returning");
  });
});

test("a replayed scout commandId does not send a second wave", async () => {
  await withServer(async ({ session, state, command }) => {
    await session();
    const opening = await state();
    const { home, target } = homeAndTarget(opening);
    const payload = {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "scout", army: { ...emptyArmy(), scout: 1 } },
    };

    const first = await command("scout-replay", opening.world.version, payload);
    assert.equal(first.body.type, "command.accepted");
    const afterFirst = await state();
    const scoutsAfterFirst = afterFirst.world.villages.find((village: any) => village.id === home.id).army.scout;

    // Same commandId, deliberately stale world version: idempotency must win
    // before the version check ever runs.
    const replay = await command("scout-replay", opening.world.version, payload);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.type, "command.accepted");

    const afterReplay = await state();
    assert.equal(afterReplay.world.villages.find((village: any) => village.id === home.id).army.scout, scoutsAfterFirst);
    assert.equal(afterReplay.marches.length, 1, "one command, one march");
  });
});

test("scouts you do not have are refused, and nothing leaves home", async () => {
  await withServer(async ({ session, state, command }) => {
    await session();
    const opening = await state();
    const { home, target } = homeAndTarget(opening);

    const refused = await command("scout-too-many", opening.world.version, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "scout", army: { ...emptyArmy(), scout: home.army.scout + 5 } },
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.type, "command.rejected");
    assert.equal(refused.body.payload.code, "INSUFFICIENT_TROOPS");

    const after = await state();
    assert.equal(after.world.villages.find((village: any) => village.id === home.id).army.scout, home.army.scout);
    assert.equal(after.marches.length, 0);
  });
});

test("a scout march carrying anything but scouts is refused", async () => {
  await withServer(async ({ session, state, command }) => {
    await session();
    const opening = await state();
    const { home, target } = homeAndTarget(opening);

    const refused = await command("scout-mixed", opening.world.version, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "scout", army: { ...emptyArmy(), scout: 1, spear: 5 } },
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.payload.code, "INVALID_ARMY");
  });
});

test("an attack on a village nobody scouted is refused", async () => {
  await withServer(async ({ session, state, command }) => {
    await session();
    const opening = await state();
    const { home, target } = homeAndTarget(opening);

    const refused = await command("attack-blind", opening.world.version, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: { ...emptyArmy(), spear: 10 } },
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.payload.code, "SCOUT_REQUIRED");
  });
});

test("your own village is never a scouting target", async () => {
  await withServer(async ({ session, state, command }) => {
    await session();
    const opening = await state();
    const { home } = homeAndTarget(opening);

    const refused = await command("scout-self", opening.world.version, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: home.id, kind: "scout", army: { ...emptyArmy(), scout: 1 } },
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.payload.code, "INVALID_TARGET");
  });
});
