import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildingCost, emptyArmy } from "../../packages/game-core/src/index.ts";
import { createWorldHttpServer } from "../src/http.ts";
import {
  AI_DEFENSIVE_INFANTRY,
  AI_GARRISON_POP_PER_HQ,
  runAiKingdomTick,
  scheduleAiKingdomTick,
} from "../src/ai.ts";
import { SharedWorldStore } from "../src/store.ts";

type Clock = { now: Date; store: SharedWorldStore };

function openWorld(label: string, now = new Date("2026-08-24T12:00:00.000Z")): Clock & {
  directory: string;
  worldId: string;
  advance(ms: number): void;
  cleanup(): void;
} {
  const directory = mkdtempSync(join(tmpdir(), `kingsage-ai-${label}-`));
  const clock: { now: Date } = { now };
  const store = new SharedWorldStore(join(directory, "world.sqlite"), {
    now: () => clock.now,
    buildDurationMs: 60_000,
    recruitDurationMs: 60_000,
    marchDurationMs: 60_000,
  });
  const world = store.db.prepare("SELECT id FROM local_worlds").get() as { id: string };
  return {
    now: clock.now,
    store,
    directory,
    worldId: world.id,
    advance(ms: number) { clock.now = new Date(clock.now.getTime() + ms); },
    cleanup() { store.close(); rmSync(directory, { recursive: true, force: true }); },
  };
}

function aiVillages(store: SharedWorldStore) {
  return store.db.prepare(`
    SELECT v.id, v.kingdom_id, k.name, v.resources_json, v.buildings_json, v.army_json, v.state_version
    FROM local_villages v
    JOIN local_kingdoms k ON k.id = v.kingdom_id
    WHERE k.seat_kind = 'ai'
    ORDER BY k.id, v.id
  `).all() as Array<{
    id: string;
    kingdom_id: string;
    name: string;
    resources_json: string;
    buildings_json: string;
    army_json: string;
    state_version: number;
  }>;
}

function villageNamed(store: SharedWorldStore, name: string) {
  const row = aiVillages(store).find((village) => village.name === name);
  assert.ok(row, `expected AI kingdom ${name}`);
  return row;
}

function setResources(store: SharedWorldStore, villageId: string, resources: { wood: number; stone: number; iron: number }) {
  store.db.prepare("UPDATE local_villages SET resources_json = ? WHERE id = ?")
    .run(JSON.stringify(resources), villageId);
}

function impoverishAi(store: SharedWorldStore) {
  for (const village of aiVillages(store)) setResources(store, village.id, { wood: 0, stone: 0, iron: 0 });
}

function setArmy(store: SharedWorldStore, villageId: string, army: Record<string, number>) {
  store.db.prepare("UPDATE local_villages SET army_json = ? WHERE id = ?")
    .run(JSON.stringify({ ...emptyArmy(), ...army }), villageId);
}

function constructionJobs(store: SharedWorldStore, villageId: string) {
  return store.db.prepare(
    "SELECT building, target_level, status FROM local_construction_jobs WHERE village_id = ? AND status != 'complete' ORDER BY rowid",
  ).all(villageId) as Array<{ building: string; target_level: number; status: string }>;
}

function recruitmentJobs(store: SharedWorldStore, villageId: string) {
  return store.db.prepare(
    "SELECT troop, quantity, status FROM local_recruitment_jobs WHERE village_id = ? AND status = 'queued' ORDER BY rowid",
  ).all(villageId) as Array<{ troop: string; quantity: number; status: string }>;
}

function villageSnapshot(store: SharedWorldStore, villageId: string) {
  const row = store.db.prepare(
    "SELECT resources_json, buildings_json, army_json, state_version FROM local_villages WHERE id = ?",
  ).get(villageId) as {
    resources_json: string;
    buildings_json: string;
    army_json: string;
    state_version: number;
  };
  return {
    ...row,
    jobs: constructionJobs(store, villageId),
    recruits: recruitmentJobs(store, villageId),
    marches: store.db.prepare("SELECT kind, target_village_id, army_json FROM local_marches WHERE from_village_id = ? ORDER BY id")
      .all(villageId),
  };
}

function claimPlayer(store: SharedWorldStore, suffix: string) {
  return store.register({
    username: `ai_${suffix}`,
    password: `ai-${suffix}-password`,
    kingdomName: `${suffix} March`,
  });
}

function humanVillage(store: SharedWorldStore, kingdomId: string) {
  const row = store.db.prepare("SELECT id, kingdom_id, name FROM local_villages WHERE kingdom_id = ?")
    .get(kingdomId) as { id: string; kingdom_id: string; name: string };
  assert.ok(row, "claimed kingdom has a village");
  return row;
}

function insertAttack(
  store: SharedWorldStore,
  worldId: string,
  input: { id: string; attackerKingdomId: string; fromVillageId: string; targetVillageId: string; at: string },
) {
  store.db.prepare(`
    INSERT INTO local_marches(
      id, world_id, kingdom_id, from_village_id, target_village_id, kind, status,
      army_json, loot_json, departed_at, arrives_at, battle_id
    ) VALUES (?, ?, ?, ?, ?, 'attack', 'complete', ?, '{"wood":0,"stone":0,"iron":0}', ?, ?, NULL)
  `).run(
    input.id,
    worldId,
    input.attackerKingdomId,
    input.fromVillageId,
    input.targetVillageId,
    JSON.stringify({ ...emptyArmy(), axe: 1 }),
    input.at,
    input.at,
  );
}

function insertScoutReport(
  store: SharedWorldStore,
  worldId: string,
  input: {
    id: string;
    kingdomId: string;
    fromVillageId: string;
    targetVillageId: string;
    targetName: string;
    targetKingdomName: string;
    observedArmy: Record<string, number>;
    observedBuildings: Record<string, number>;
    at: string;
  },
) {
  const marchId = `${input.id}-march`;
  store.db.prepare(`
    INSERT INTO local_marches(
      id, world_id, kingdom_id, from_village_id, target_village_id, kind, status,
      army_json, loot_json, departed_at, arrives_at, battle_id
    ) VALUES (?, ?, ?, ?, ?, 'scout', 'complete', ?, '{"wood":0,"stone":0,"iron":0}', ?, ?, NULL)
  `).run(
    marchId,
    worldId,
    input.kingdomId,
    input.fromVillageId,
    input.targetVillageId,
    JSON.stringify({ ...emptyArmy(), scout: 1 }),
    input.at,
    input.at,
  );
  store.db.prepare(`
    INSERT INTO local_scout_reports(
      id, march_id, world_id, kingdom_id, target_village_id, target_village_version, target_village_name,
      target_kingdom_name, observed_army_json, observed_resources_json, observed_buildings_json, layout_json, created_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, '{"wood":0,"stone":0,"iron":0}', ?, '{}', ?)
  `).run(
    input.id,
    marchId,
    worldId,
    input.kingdomId,
    input.targetVillageId,
    input.targetName,
    input.targetKingdomName,
    JSON.stringify({ ...emptyArmy(), ...input.observedArmy }),
    JSON.stringify(input.observedBuildings),
    input.at,
  );
}

async function listenAndClose(app: ReturnType<typeof createWorldHttpServer>): Promise<void> {
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  await app.close();
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

test("1. tick disabled: unset KINGSAGE_AI_TICK_MS never schedules; calling nothing changes nothing", async () => {
  const previous = process.env.KINGSAGE_AI_TICK_MS;
  delete process.env.KINGSAGE_AI_TICK_MS;
  const world = openWorld("disabled");
  try {
    let intervalCalls = 0;
    const timer = scheduleAiKingdomTick(world.store, {
      env: { ...process.env },
      setIntervalFn: ((handler: () => void, ms: number) => {
        intervalCalls += 1;
        assert.ok(ms > 0, "interval must not be scheduled at all when unset");
        return { unref() {}, handler };
      }) as typeof setInterval,
    });
    assert.equal(timer, undefined, "scheduleAiKingdomTick must return nothing when the env var is unset");
    assert.equal(intervalCalls, 0, "setInterval must not be called when the env var is unset");

    const app = createWorldHttpServer({ store: world.store, materializeIntervalMs: 60_000 });
    assert.equal(app.aiTickScheduled, false, "HTTP server must not start an AI timer when the env var is unset");
    await listenAndClose(app);

    const subject = villageNamed(world.store, "Warlord Kaas");
    const before = villageSnapshot(world.store, subject.id);
    // Deliberately do not call runAiKingdomTick.
    const after = villageSnapshot(world.store, subject.id);
    assert.deepEqual(after, before, "the world must be byte-identical if the tick is never invoked");
  } finally {
    restoreEnv("KINGSAGE_AI_TICK_MS", previous);
    world.cleanup();
  }
});

test("1b. HTTP server schedules the AI tick only when KINGSAGE_AI_TICK_MS is set", async () => {
  const previous = process.env.KINGSAGE_AI_TICK_MS;
  process.env.KINGSAGE_AI_TICK_MS = "60000";
  const world = openWorld("scheduled");
  try {
    let capturedMs: number | undefined;
    const timer = scheduleAiKingdomTick(world.store, {
      setIntervalFn: ((handler: () => void, ms: number) => {
        capturedMs = ms;
        return { unref() {}, handler };
      }) as typeof setInterval,
    });
    assert.ok(timer, "a positive KINGSAGE_AI_TICK_MS must start a timer");
    assert.equal(capturedMs, 60_000);

    const app = createWorldHttpServer({ store: world.store, materializeIntervalMs: 60_000 });
    assert.equal(app.aiTickScheduled, true, "HTTP hook must honour the env var");
    await listenAndClose(app);
  } finally {
    restoreEnv("KINGSAGE_AI_TICK_MS", previous);
    world.cleanup();
  }
});

test("2. BUILD: a poor AI village queues nothing; an affordable one queues exactly one real job", () => {
  const world = openWorld("build");
  try {
    impoverishAi(world.store);
    const poor = villageNamed(world.store, "Ember Crown");
    const rich = villageNamed(world.store, "Warlord Kaas");
    const starting = { wood: 1_200, stone: 1_000, iron: 800 };
    setResources(world.store, rich.id, starting);
    const beforeVersion = (villageSnapshot(world.store, rich.id).state_version);

    const actions = runAiKingdomTick(world.store, world.worldId, world.now);
    assert.equal(constructionJobs(world.store, poor.id).length, 0, "a village that cannot pay must not queue");
    assert.equal(
      actions.some((action) => action.villageId === poor.id),
      false,
      "the poor village must not take any action",
    );

    const jobs = constructionJobs(world.store, rich.id);
    assert.equal(jobs.length, 1, "an affordable village queues exactly one job");
    assert.equal(jobs[0].building, "farm", "Farm is first on the build priority list");
    assert.equal(jobs[0].status, "queued", "the job must start through the real queue, not wait unpaid");
    assert.ok(actions.some((action) => action.type === "build" && action.villageId === rich.id && action.building === "farm"));

    const after = world.store.db.prepare("SELECT resources_json, state_version FROM local_villages WHERE id = ?")
      .get(rich.id) as { resources_json: string; state_version: number };
    const resources = JSON.parse(after.resources_json);
    const cost = buildingCost("farm", 1);
    assert.equal(resources.wood, starting.wood - cost.wood, "wood must be deducted by the real build cost");
    assert.equal(resources.stone, starting.stone - cost.stone);
    assert.equal(resources.iron, starting.iron - cost.iron);
    assert.equal(after.state_version, beforeVersion + 1, "state_version must bump on the real village write");
  } finally {
    world.cleanup();
  }
});

test("3. RECRUIT: below-target garrison recruits through the real path; at-target does not", () => {
  const world = openWorld("recruit");
  try {
    impoverishAi(world.store);
    const below = villageNamed(world.store, "Warlord Kaas");
    const held = villageNamed(world.store, "Ember Crown");
    // Spear costs 50/30/10; cheapest building upgrade from L1 is Farm at 65/58/44.
    // So this purse can recruit and cannot build — otherwise BUILD would win.
    const purse = { wood: 50, stone: 30, iron: 10 };
    setResources(world.store, below.id, purse);
    setArmy(world.store, below.id, {});
    setResources(world.store, held.id, purse);
    setArmy(world.store, held.id, { [AI_DEFENSIVE_INFANTRY]: AI_GARRISON_POP_PER_HQ });

    const actions = runAiKingdomTick(world.store, world.worldId, world.now);
    const recruited = recruitmentJobs(world.store, below.id);
    assert.equal(recruited.length, 1, "a village below its garrison target must recruit");
    assert.equal(recruited[0].troop, AI_DEFENSIVE_INFANTRY);
    assert.equal(recruited[0].quantity, 1, "the batch is what the village can actually pay for");
    assert.ok(actions.some((action) => action.type === "recruit" && action.villageId === below.id));

    const after = world.store.db.prepare("SELECT resources_json FROM local_villages WHERE id = ?")
      .get(below.id) as { resources_json: string };
    assert.deepEqual(JSON.parse(after.resources_json), { wood: 0, stone: 0, iron: 0 }, "recruit must charge the real troop cost");

    assert.equal(recruitmentJobs(world.store, held.id).length, 0, "at-target garrison must not recruit");
    assert.equal(actions.some((action) => action.villageId === held.id && action.type === "recruit"), false);
  } finally {
    world.cleanup();
  }
});

test("4. SCOUT: an attacked AI kingdom scouts its attacker; an unattacked one does not", () => {
  const world = openWorld("scout");
  try {
    const player = claimPlayer(world.store, "scout");
    const attacker = humanVillage(world.store, player.player.kingdomId);
    impoverishAi(world.store);
    const attacked = villageNamed(world.store, "Warlord Kaas");
    const quiet = villageNamed(world.store, "Ember Crown");
    setArmy(world.store, attacked.id, { scout: 2 });
    setArmy(world.store, quiet.id, { scout: 2 });
    insertAttack(world.store, world.worldId, {
      id: "march-hit-kaas",
      attackerKingdomId: player.player.kingdomId,
      fromVillageId: attacker.id,
      targetVillageId: attacked.id,
      at: "2026-08-24T11:00:00.000Z",
    });

    const actions = runAiKingdomTick(world.store, world.worldId, world.now);
    const scouted = world.store.db.prepare(
      "SELECT kind, target_village_id, army_json FROM local_marches WHERE kingdom_id = ? AND kind = 'scout' AND status = 'outbound'",
    ).all(attacked.kingdom_id) as Array<{ kind: string; target_village_id: string; army_json: string }>;
    assert.equal(scouted.length, 1, "the attacked kingdom must launch a scout");
    assert.equal(scouted[0].target_village_id, attacker.id);
    assert.equal(JSON.parse(scouted[0].army_json).scout, 1);
    assert.ok(actions.some((action) => action.type === "scout" && action.villageId === attacked.id && action.targetVillageId === attacker.id));

    const quietMarches = world.store.db.prepare(
      "SELECT id FROM local_marches WHERE kingdom_id = ? AND kind = 'scout'",
    ).all(quiet.kingdom_id);
    assert.equal(quietMarches.length, 0, "an unattacked AI kingdom must not scout");
    assert.equal(actions.some((action) => action.villageId === quiet.id && action.type === "scout"), false);
  } finally {
    world.cleanup();
  }
});

test("5. RAID: weak reported defense launches with noble = 0; strong defense does not", () => {
  const world = openWorld("raid");
  try {
    const player = claimPlayer(world.store, "raid");
    const attacker = humanVillage(world.store, player.player.kingdomId);
    impoverishAi(world.store);
    const raider = villageNamed(world.store, "Warlord Kaas");
    const held = villageNamed(world.store, "Ember Crown");
    const defaultBuildings = JSON.parse(
      (world.store.db.prepare("SELECT buildings_json FROM local_villages WHERE id = ?").get(raider.id) as { buildings_json: string }).buildings_json,
    );
    setArmy(world.store, raider.id, { axe: 20, noble: 4 });
    setArmy(world.store, held.id, { axe: 20, noble: 4 });
    insertAttack(world.store, world.worldId, {
      id: "march-hit-raider",
      attackerKingdomId: player.player.kingdomId,
      fromVillageId: attacker.id,
      targetVillageId: raider.id,
      at: "2026-08-24T11:00:00.000Z",
    });
    insertAttack(world.store, world.worldId, {
      id: "march-hit-held",
      attackerKingdomId: player.player.kingdomId,
      fromVillageId: attacker.id,
      targetVillageId: held.id,
      at: "2026-08-24T11:00:00.000Z",
    });
    insertScoutReport(world.store, world.worldId, {
      id: "report-weak",
      kingdomId: raider.kingdom_id,
      fromVillageId: raider.id,
      targetVillageId: attacker.id,
      targetName: attacker.name,
      targetKingdomName: "raid March",
      observedArmy: {},
      observedBuildings: defaultBuildings,
      at: "2026-08-24T11:30:00.000Z",
    });
    insertScoutReport(world.store, world.worldId, {
      id: "report-strong",
      kingdomId: held.kingdom_id,
      fromVillageId: held.id,
      targetVillageId: attacker.id,
      targetName: attacker.name,
      targetKingdomName: "raid March",
      observedArmy: { spear: 8_000 },
      observedBuildings: defaultBuildings,
      at: "2026-08-24T11:30:00.000Z",
    });

    const actions = runAiKingdomTick(world.store, world.worldId, world.now);
    const raids = world.store.db.prepare(
      "SELECT army_json, target_village_id FROM local_marches WHERE kingdom_id = ? AND kind = 'attack' AND status = 'outbound'",
    ).all(raider.kingdom_id) as Array<{ army_json: string; target_village_id: string }>;
    assert.equal(raids.length, 1, "weak reported defense must launch a raid");
    assert.equal(raids[0].target_village_id, attacker.id);
    const launched = JSON.parse(raids[0].army_json);
    assert.equal(launched.noble, 0, "the AI must never send Noblemen");
    assert.equal(launched.axe, 20);
    const home = JSON.parse(
      (world.store.db.prepare("SELECT army_json FROM local_villages WHERE id = ?").get(raider.id) as { army_json: string }).army_json,
    );
    assert.equal(home.noble, 4, "Counts stay home");
    assert.ok(actions.some((action) => action.type === "raid" && action.villageId === raider.id && action.army.noble === 0));

    const heldRaids = world.store.db.prepare(
      "SELECT id FROM local_marches WHERE kingdom_id = ? AND kind = 'attack' AND status = 'outbound'",
    ).all(held.kingdom_id);
    assert.equal(heldRaids.length, 0, "strong reported defense must not launch");
    assert.equal(actions.some((action) => action.villageId === held.id && action.type === "raid"), false);
  } finally {
    world.cleanup();
  }
});

test("6. Priority: a village that can both build and recruit builds only", () => {
  const world = openWorld("priority");
  try {
    impoverishAi(world.store);
    const village = villageNamed(world.store, "Warlord Kaas");
    setResources(world.store, village.id, { wood: 1_200, stone: 1_000, iron: 800 });
    setArmy(world.store, village.id, {});

    const actions = runAiKingdomTick(world.store, world.worldId, world.now);
    const own = actions.filter((action) => action.villageId === village.id);
    assert.equal(own.length, 1, "one action per village per tick");
    assert.equal(own[0].type, "build");
    assert.equal(constructionJobs(world.store, village.id).length, 1);
    assert.equal(recruitmentJobs(world.store, village.id).length, 0, "recruit must not run on the same tick as build");
  } finally {
    world.cleanup();
  }
});

test("7. Determinism: two runs over identical DB state with identical now produce identical actions", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  const first = openWorld("det-a", now);
  const second = openWorld("det-b", now);
  try {
    const actionsA = runAiKingdomTick(first.store, first.worldId, now);
    const actionsB = runAiKingdomTick(second.store, second.worldId, now);
    assert.ok(actionsA.length > 0, "the tick must actually do something or this test is a no-op");
    assert.deepEqual(actionsA, actionsB);
    assert.equal(first.worldId, second.worldId);
  } finally {
    first.cleanup();
    second.cleanup();
  }
});
