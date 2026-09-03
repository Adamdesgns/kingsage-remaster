import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { armyUnitCount, emptyArmy, horseCapacity, populationCapacity, ramWallAfterBattle, troopResearchCost, type GameCommand } from "../../packages/game-core/src/index.ts";
import { SharedWorldStore, type SessionPlayer } from "../src/store.ts";

const PLAN = { entry: "West Ridge", troops: "Balanced Army", time: "Dawn", style: "Flanking Strike" } as const;

function world(path = ":memory:") {
  let now = new Date("2026-09-03T12:00:00.000Z");
  let serial = 0;
  const options = { now: () => now, marchDurationMs: 100, returnDurationMs: 1000, autoResolveMs: 120_000, buildDurationMs: 500, recruitDurationMs: 500 };
  let store = new SharedWorldStore(path, options);
  const attacker = store.linkRobloxPlayer({ robloxUserId: 99001, displayName: "Audit Attacker" }).player;
  const defender = store.linkRobloxPlayer({ robloxUserId: 99002, displayName: "Audit Defender" }).player;
  const own = (player: SessionPlayer) => store.getSnapshot(player).world.villages.find((v) => v.kingdomId === player.kingdomId)!;
  const a = own(attacker), d = own(defender);
  function setVillage(id: string, patch: { army?: Record<string, number>; buildings?: Record<string, number>; horses?: number; resources?: Record<string, number> }) {
    const row = store.db.prepare("SELECT * FROM local_villages WHERE id = ?").get(id) as any;
    store.db.prepare("UPDATE local_villages SET army_json = ?, buildings_json = ?, resources_json = ?, horses = ?, horses_at = ? WHERE id = ?").run(
      JSON.stringify({ ...JSON.parse(row.army_json), ...patch.army }), JSON.stringify({ ...JSON.parse(row.buildings_json), ...patch.buildings }),
      JSON.stringify(patch.resources ?? JSON.parse(row.resources_json)), patch.horses ?? row.horses, now.toISOString(), id,
    );
  }
  setVillage(a.id, { army: { ...emptyArmy(), axe: 400, scout: 10 }, resources: { wood: 1000, stone: 1000, iron: 1000 } });
  setVillage(d.id, { army: { ...emptyArmy(), spear: 20, scout: 20 }, buildings: { barracks: 10, smithy: 5, stable: 5 }, horses: 20, resources: { wood: 1000, stone: 1000, iron: 1000 } });
  function command(player: SessionPlayer, command: GameCommand): any {
    const snapshot = store.getSnapshot(player);
    return store.applyCommand(player, { contractVersion: 1, commandId: `audit-${++serial}`, worldId: snapshot.world.id,
      actorPlayerId: player.id, expectedWorldVersion: snapshot.world.version, issuedAt: now.toISOString(), command });
  }
  function accepted(player: SessionPlayer, value: GameCommand): any {
    const result = command(player, value);
    assert.equal(result.type, "command.accepted", JSON.stringify(result));
    return result.payload;
  }
  const advance = (ms: number) => { now = new Date(now.getTime() + ms); };
  function openBattle(extraArmy: Record<string, number> = {}) {
    accepted(attacker, { type: "march.launch", payload: { fromVillageId: a.id, targetVillageId: d.id, kind: "scout", army: { ...emptyArmy(), scout: 1 } } });
    advance(101);
    const report = store.getSnapshot(attacker).scoutReports[0];
    const attack = accepted(attacker, { type: "march.launch", payload: { fromVillageId: a.id, targetVillageId: d.id, kind: "attack", army: { ...emptyArmy(), axe: 400, ...extraArmy }, plan: PLAN } });
    advance(101);
    return accepted(attacker, { type: "battle.open", payload: { marchId: attack.march.id, targetVillageVersion: report.targetVillageVersion, plan: PLAN } }).battle;
  }
  return { get store() { return store; }, attacker, defender, a, d, own, setVillage, command, accepted, advance, openBattle,
    restart() { store.close(); store = new SharedWorldStore(path, options); }, close() { store.close(); } };
}

test("horse breeding retains fractions across frequent snapshots and stable upgrades", () => {
  const frequent = world(), idle = world();
  try {
    for (const w of [frequent, idle]) w.setVillage(w.d.id, { buildings: { stable: 3 }, horses: 0 });
    for (let tick = 0; tick < 360; tick++) { frequent.advance(10_000); frequent.own(frequent.defender); }
    idle.advance(3_600_000);
    assert.equal(frequent.own(frequent.defender).horses, 1);
    assert.equal(frequent.own(frequent.defender).horses, idle.own(idle.defender).horses);
    // The remaining 0.2 of a horse survives an upgrade; only future time earns the new rate.
    frequent.setVillage(frequent.d.id, { buildings: { stable: 4 } });
    frequent.advance(1_800_000);
    assert.equal(frequent.own(frequent.defender).horses, 2);
  } finally { frequent.close(); idle.close(); }
});

test("horse fractional production survives restart, migrates existing databases, and does not bank at capacity", () => {
  const directory = mkdtempSync(join(tmpdir(), "kingsmarch-audit-herd-"));
  const w = world(join(directory, "world.sqlite"));
  try {
    // Exercise the actual pre-fix schema upgrade, preserving whole animals.
    const columns = w.store.db.prepare("PRAGMA table_info(local_villages)").all() as any[];
    if (columns.some((c) => c.name === "horses_fraction")) w.store.db.exec("ALTER TABLE local_villages DROP COLUMN horses_fraction");
    w.store.db.exec("DELETE FROM local_schema_migrations WHERE version = 13");
    w.restart();
    w.setVillage(w.d.id, { buildings: { stable: 3 }, horses: 0 });
    w.advance(1_800_000); w.own(w.defender); w.restart();
    w.advance(1_800_000);
    assert.equal(w.own(w.defender).horses, 1);
    w.advance(100 * 3_600_000);
    assert.equal(w.own(w.defender).horses, horseCapacity(3));
    w.setVillage(w.d.id, { horses: horseCapacity(3) - 1 });
    w.advance(10_000);
    assert.equal(w.own(w.defender).horses, horseCapacity(3) - 1, "time spent full cannot be redeemed after spending");
  } finally { w.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("a refused cavalry conversion preserves paid soldiers, horses, jobs and world version", () => {
  const w = world();
  try {
    w.setVillage(w.d.id, { army: { ...emptyArmy(), axe: populationCapacity(1) }, buildings: { farm: 1 } });
    const before = w.store.getSnapshot(w.defender), village = w.own(w.defender);
    const result = w.command(w.defender, { type: "village.recruit.queue", payload: { villageId: w.d.id, troop: "lightCavalry", quantity: 1 } });
    assert.equal(result.payload.code, "POPULATION_FULL");
    const after = w.store.getSnapshot(w.defender);
    assert.deepEqual(w.own(w.defender).army, village.army);
    assert.equal(w.own(w.defender).horses, village.horses);
    assert.equal(after.recruitmentJobs.length, 0);
    assert.equal(after.world.version, before.world.version);
  } finally { w.close(); }
});

test("an open battle prevents spending its frozen stock or marching its frozen defenders away", () => {
  const w = world();
  try {
    const battle = w.openBattle(), before = w.own(w.defender);
    for (const command of [
      { type: "village.recruit.queue", payload: { villageId: w.d.id, troop: "spear", quantity: 19 } },
      { type: "kingdom.research.queue", payload: { villageId: w.d.id, troop: "spear", targetLevel: 2 } },
      { type: "march.launch", payload: { fromVillageId: w.d.id, targetVillageId: w.a.id, kind: "scout", army: { ...emptyArmy(), scout: 20 } } },
    ] as GameCommand[]) assert.equal(w.command(w.defender, command).payload.code, "SIEGE_IN_PROGRESS");
    assert.deepEqual(w.own(w.defender).resources, before.resources);
    assert.deepEqual(w.own(w.defender).army, before.army);
    const settled = w.accepted(w.attacker, { type: "battle.resolve", payload: { battleId: battle.id } });
    for (const kind of ["wood", "stone", "iron"] as const) assert.equal(w.own(w.defender).resources[kind] + settled.march.loot[kind], before.resources[kind]);
    assert.equal(settled.battle.outcome.yielded.scout + settled.battle.outcome.defenderCasualties.scout + w.own(w.defender).army.scout, 20);
  } finally { w.close(); }
});

test("sieges retain completed recruitment and returning troops; construction waits and resumes after retreat", () => {
  const w = world();
  try {
    w.accepted(w.defender, { type: "village.recruit.queue", payload: { villageId: w.d.id, troop: "spear", quantity: 2 } });
    w.accepted(w.defender, { type: "march.launch", payload: { fromVillageId: w.d.id, targetVillageId: w.a.id, kind: "scout", army: { ...emptyArmy(), scout: 5 } } });
    const battle = w.openBattle();
    const queued = w.accepted(w.defender, { type: "village.build.queue", payload: { villageId: w.d.id, building: "timber" } });
    const job = () => w.store.db.prepare("SELECT status FROM local_construction_jobs WHERE id = ?").get(queued.constructionJob.id) as any;
    assert.equal(job().status, "waiting");
    w.advance(1100);
    const during = w.own(w.defender);
    assert.equal(during.army.spear, 22, "training already paid for still arrives");
    assert.equal(during.army.scout, 20, "returning scouts are retained");
    assert.equal(job().status, "waiting", "automatic queue drain must not spend the frozen stock");
    w.accepted(w.attacker, { type: "battle.retreat", payload: { battleId: battle.id, sequence: 1, atMs: 0 } });
    w.own(w.defender);
    assert.equal(job().status, "queued", "construction resumes after siege closes");
    assert.equal(w.own(w.defender).army.spear, 22);
  } finally { w.close(); }
});

test("already-open battles keep their mutation guard after a process restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "kingsmarch-audit-siege-"));
  const w = world(join(directory, "world.sqlite"));
  try {
    w.openBattle(); w.restart();
    const result = w.command(w.defender, { type: "village.recruit.queue", payload: { villageId: w.d.id, troop: "spear", quantity: 19 } });
    assert.equal(result.payload.code, "SIEGE_IN_PROGRESS");
    assert.equal(w.own(w.defender).resources.wood, 1000);
  } finally { w.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("the AI's shared recruitment and departure paths obey the same siege guard", () => {
  const w = world();
  try {
    w.openBattle();
    const snapshot = w.store.getSnapshot(w.defender);
    assert.equal(w.store.queueVillageRecruit(snapshot.world.id, w.d.id, "spear", 19).payload.code, "SIEGE_IN_PROGRESS");
    const launch = w.store.launchVillageMarch(snapshot.world.id, w.defender.kingdomId, { fromVillageId: w.d.id, targetVillageId: w.a.id, kind: "scout", army: { ...emptyArmy(), scout: 20 } });
    assert.equal(launch.payload.code, "SIEGE_IN_PROGRESS");
  } finally { w.close(); }
});

test("a wall upgrade completed during battle survives the siege's frozen wall damage", () => {
  const w = world();
  try {
    w.setVillage(w.a.id, { army: { ram: 1 } });
    w.setVillage(w.d.id, { buildings: { wall: 1, hq: 2 } });
    w.accepted(w.defender, { type: "village.build.queue", payload: { villageId: w.d.id, building: "wall" } });
    const battle = w.openBattle({ ram: 1 });
    w.advance(600);
    assert.equal(w.own(w.defender).buildings.wall, 2);
    const settled = w.accepted(w.attacker, { type: "battle.resolve", payload: { battleId: battle.id } });
    const outcome = settled.battle.outcome;
    const oldWallAfterDamage = ramWallAfterBattle({ wallLevel: 1, ramsSent: 1, ramsSurviving: outcome.attackerSurvivors.ram,
      attackerWon: outcome.winner === "attacker", defenderLossFraction: armyUnitCount(outcome.defenderCasualties) / armyUnitCount(battle.defenderArmy) });
    assert.equal(w.own(w.defender).buildings.wall, 2 - (1 - oldWallAfterDamage), "damage applies to the current wall without deleting its earned upgrade");
  } finally { w.close(); }
});

for (const eliminated of [false, true]) test(`returning armies never reinforce a captured home (${eliminated ? "eliminated" : "another holding remains"})`, () => {
  const w = world();
  try {
    const launch = w.accepted(w.attacker, { type: "march.launch", payload: { fromVillageId: w.a.id, targetVillageId: w.d.id, kind: "scout", army: { ...emptyArmy(), scout: 4 } } });
    w.advance(101); w.own(w.attacker);
    const loot = { wood: 99, stone: 88, iron: 77 };
    w.store.db.prepare("UPDATE local_marches SET loot_json = ? WHERE id = ?").run(JSON.stringify(loot), launch.march.id);
    const fallback = w.store.db.prepare("SELECT id FROM local_villages WHERE kingdom_id NOT IN (?, ?) ORDER BY id LIMIT 1").get(w.attacker.kingdomId, w.defender.kingdomId) as any;
    if (!eliminated) w.store.db.prepare("UPDATE local_villages SET kingdom_id = ?, is_capital = 1, army_json = ?, resources_json = ? WHERE id = ?").run(w.attacker.kingdomId, JSON.stringify(emptyArmy()), JSON.stringify({ wood: 0, stone: 0, iron: 0 }), fallback.id);
    w.store.db.prepare("UPDATE local_villages SET kingdom_id = ?, army_json = ? WHERE id = ?").run(w.defender.kingdomId, JSON.stringify(emptyArmy()), w.a.id);
    const conqueredBefore = w.store.db.prepare("SELECT army_json, resources_json FROM local_villages WHERE id = ?").get(w.a.id) as any;
    w.advance(1001); w.store.materializeDueJobs();
    let march = w.store.db.prepare("SELECT * FROM local_marches WHERE id = ?").get(launch.march.id) as any;
    if (!eliminated) {
      assert.equal(march.status, "returning");
      assert.equal(march.from_village_id, fallback.id);
      assert.equal(march.target_village_id, w.a.id, "the new homeward leg starts at the captured home");
      assert.deepEqual(JSON.parse(march.loot_json), loot, "the detour retains carried resources");
      w.advance(1001); w.store.materializeDueJobs();
      assert.equal(JSON.parse((w.store.db.prepare("SELECT army_json FROM local_villages WHERE id = ?").get(fallback.id) as any).army_json).scout, 4);
      assert.deepEqual(JSON.parse((w.store.db.prepare("SELECT resources_json FROM local_villages WHERE id = ?").get(fallback.id) as any).resources_json), loot);
    } else {
      assert.equal(march.status, "complete");
      assert.match(w.store.getSnapshot(w.attacker).notifications[0].message, /lost|no settlement/i);
    }
    const captured = w.store.db.prepare("SELECT army_json, resources_json FROM local_villages WHERE id = ?").get(w.a.id) as any;
    assert.deepEqual(captured, conqueredBefore, "the conqueror must receive neither troops nor carried resources");
  } finally { w.close(); }
});

test("new players skip fallen kingdoms and stale capital pointers without renaming another player's holding", () => {
  const w = world();
  try {
    const seats = w.store.db.prepare("SELECT id, capital_village_id FROM local_kingdoms WHERE seat_kind = 'ai' AND controller_player_id IS NULL ORDER BY id").all() as any[];
    w.store.db.prepare("UPDATE local_kingdoms SET alive = 0 WHERE id = ?").run(seats[0].id);
    w.store.db.prepare("UPDATE local_villages SET kingdom_id = ? WHERE id = ?").run(w.attacker.kingdomId, seats[0].capital_village_id);
    w.store.db.prepare("UPDATE local_villages SET kingdom_id = ? WHERE id = ?").run(w.attacker.kingdomId, seats[1].capital_village_id);
    const before = w.store.db.prepare("SELECT name FROM local_villages WHERE id = ?").get(seats[0].capital_village_id);
    for (let index = 0; index < 2; index++) {
      const linked = w.store.linkRobloxPlayer({ robloxUserId: 99100 + index, displayName: `New Player ${index}` }).player;
      assert.ok(![seats[0].id, seats[1].id].includes(linked.kingdomId));
    }
    assert.throws(() => w.store.linkRobloxPlayer({ robloxUserId: 99200, displayName: "World Full" }), /no open kingdom seats/);
    assert.deepEqual(w.store.db.prepare("SELECT name FROM local_villages WHERE id = ?").get(seats[0].capital_village_id), before);
  } finally { w.close(); }
});

test("troop catalog quotes cavalry conversion inputs while keeping research economics unchanged", () => {
  const w = world();
  try {
    const catalog = w.store.getSnapshot(w.defender).troopCatalog;
    for (const [troop, from] of [["lightCavalry", "axe"], ["heavyCavalry", "sword"]] as const) {
      const row = catalog.find((entry) => entry.troop === troop)!;
      assert.deepEqual(row.cost, { wood: 0, stone: 0, iron: 0 });
      assert.deepEqual((row as any).conversion, { from, soldiersPerUnit: 1, horsesPerUnit: 1 });
      assert.deepEqual(row.nextResearch!.cost, troopResearchCost(troop, 2));
    }
    assert.equal((catalog.find((entry) => entry.troop === "spear") as any).conversion, null);
  } finally { w.close(); }
});
