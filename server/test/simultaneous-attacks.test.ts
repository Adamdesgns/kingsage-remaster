// Two armies on one village (audit 2026-08-29 finding 8.1, P0).
//
// Before the fix, each opened battle froze the FULL garrison and the FULL
// resource stock: the defenders fought twice at full strength and both
// attackers looted 25% of the same pile - resources duplicated out of thin
// air. The rule now is sequential sieges: at most one open battle per
// village, the second army waits at the walls, and when its turn comes it
// fights the survivors over what is left.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { armyUnitCount, emptyArmy, type BattlePlan } from "../../packages/game-core/src/index.ts";
import { createWorldHttpServer } from "../src/http.ts";
import { SharedWorldStore } from "../src/store.ts";
import { garrisonEveryVillage } from "./garrison.ts";

const KEY = "test-secret-key-0123456789abcdef";
const ATTACKER_A = 880001;
const ATTACKER_B = 880002;
const DEFENDER = 880003;

const PLAN: BattlePlan = { entry: "West Ridge", troops: "Balanced Army", time: "Dawn", style: "Flanking Strike" };
const MARCH_MS = 60;
const AUTO_RESOLVE_MS = 5_000;

type Ctx = {
  store: SharedWorldStore;
  advance: (ms: number) => void;
  session: (id: number, name: string) => Promise<any>;
  state: (id: number) => Promise<any>;
  command: (id: number, commandId: string, version: number, command: unknown) => Promise<{ status: number; body: any }>;
};

async function withServer(run: (context: Ctx) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-simul-"));
  let now = new Date("2026-08-29T12:00:00.000Z");
  const store = new SharedWorldStore(join(directory, "world.sqlite"), {
    now: () => now,
    marchDurationMs: MARCH_MS,
    returnDurationMs: MARCH_MS,
    autoResolveMs: AUTO_RESOLVE_MS,
  });
  garrisonEveryVillage(store);
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
      store,
      advance: (ms) => { now = new Date(now.getTime() + ms); },
      session: async (robloxUserId, displayName) => (await post("/api/roblox/session", { robloxUserId, displayName })).json(),
      state: async (robloxUserId) => {
        const payload = await (await post("/api/roblox/state", { robloxUserIds: [robloxUserId] })).json();
        return payload.states[String(robloxUserId)];
      },
      command: async (robloxUserId, commandId, expectedWorldVersion, command) => {
        const response = await post("/api/roblox/commands", { robloxUserId, commandId, expectedWorldVersion, command });
        return { status: response.status, body: await response.json() };
      },
    });
  } finally {
    await app.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Scout from `attackerId`, then launch an attack, leaving it on the road. */
async function scoutThenAttack(context: Ctx, attackerId: number, prefix: string, targetId: string) {
  const opening = await context.state(attackerId);
  const home = opening.world.villages.find((v: any) => v.kingdomId === opening.kingdom.id && v.isCapital);
  await context.command(attackerId, `${prefix}-scout`, opening.world.version, {
    type: "march.launch",
    payload: { fromVillageId: home.id, targetVillageId: targetId, kind: "scout", army: { ...emptyArmy(), scout: 1 } },
  });
  context.advance(MARCH_MS + 10);
  const scouted = await context.state(attackerId);
  const report = scouted.scoutReports.find((r: any) => r.targetVillageId === targetId);
  assert.ok(report, `${prefix}: scouts reported`);
  await context.command(attackerId, `${prefix}-attack`, scouted.world.version, {
    type: "march.launch",
    payload: { fromVillageId: home.id, targetVillageId: targetId, kind: "attack", army: { ...emptyArmy(), spear: 20, sword: 8, archer: 6 }, plan: PLAN },
  });
  return { home, report };
}

test("two armies on one village fight in turn - the garrison dies once and the loot is conserved", async () => {
  await withServer(async (context) => {
    await context.session(ATTACKER_A, "First Sword");
    await context.session(ATTACKER_B, "Second Sword");
    const defenderSession = await context.session(DEFENDER, "Held Ground");

    const opening = await context.state(ATTACKER_A);
    const target = opening.world.villages.find((v: any) => v.kingdomId === defenderSession.kingdomId);
    const defenderStart = (await context.state(DEFENDER)).world.villages.find((v: any) => v.id === target.id);
    const startingStock = defenderStart.resources;
    const startingGarrison = armyUnitCount(defenderStart.army);

    await scoutThenAttack(context, ATTACKER_A, "sa", target.id);
    await scoutThenAttack(context, ATTACKER_B, "sb", target.id);

    // Both marches arrive, both deadlines blow, everything settles.
    context.advance(MARCH_MS + AUTO_RESOLVE_MS + 60_000);
    await context.state(ATTACKER_A);

    const battleA = (await context.state(ATTACKER_A)).battleSessions[0];
    const battleB = (await context.state(ATTACKER_B)).battleSessions[0];
    assert.ok(battleA?.outcome, "attacker A's battle settled");
    assert.ok(battleB?.outcome, "attacker B's battle settled");

    // The battles happened in turn, not against copies: the second battle's
    // frozen garrison is the first battle's survivors, not the full muster.
    const first = new Date(battleA.openedAt) <= new Date(battleB.openedAt) ? battleA : battleB;
    const second = first === battleA ? battleB : battleA;
    assert.equal(
      armyUnitCount(second.defenderArmy),
      armyUnitCount(first.outcome.defenderSurvivors),
      "the second army fights the survivors of the first battle",
    );
    assert.ok(armyUnitCount(second.defenderArmy) < startingGarrison, "the garrison cannot be at full strength twice");

    // Loot conservation: what both armies carried off cannot exceed what
    // the village held when the first sword was drawn.
    for (const kind of ["wood", "stone", "iron"] as const) {
      const carried = Number(first.outcome.loot[kind]) + Number(second.outcome.loot[kind]);
      assert.ok(
        carried <= Number(startingStock[kind]),
        `${kind}: ${carried} looted from a stock of ${startingStock[kind]} - resources must not duplicate`,
      );
    }
  });
});

test("a deadline that fires during an attended siege waits its turn instead of fighting a copy", async () => {
  await withServer(async (context) => {
    await context.session(ATTACKER_A, "First Sword");
    await context.session(ATTACKER_B, "Second Sword");
    const defenderSession = await context.session(DEFENDER, "Held Ground");

    const opening = await context.state(ATTACKER_A);
    const target = opening.world.villages.find((v: any) => v.kingdomId === defenderSession.kingdomId);
    const defenderStart = (await context.state(DEFENDER)).world.villages.find((v: any) => v.id === target.id);
    const startingStock = defenderStart.resources;
    const startingGarrison = armyUnitCount(defenderStart.army);

    const { report: reportA } = await scoutThenAttack(context, ATTACKER_A, "da", target.id);
    await scoutThenAttack(context, ATTACKER_B, "db", target.id);
    context.advance(MARCH_MS + 10);

    // A attends: the battle opens and buys the +3 minute grace.
    const stateA = await context.state(ATTACKER_A);
    const marchA = stateA.marches.find((m: any) => m.kind === "attack" && m.status === "awaiting_battle");
    const openedA = await context.command(ATTACKER_A, "da-open", stateA.world.version, {
      type: "battle.open",
      payload: { marchId: marchA.id, targetVillageVersion: reportA.targetVillageVersion, plan: PLAN },
    });
    assert.equal(openedA.body.type, "command.accepted", JSON.stringify(openedA.body));

    // B's auto-resolve deadline blows while A's battle is still open.
    context.advance(AUTO_RESOLVE_MS + 1_000);
    const during = await context.state(ATTACKER_B);
    const battleDuring = during.battleSessions.find((b: any) => b.attackerKingdomId === during.kingdom.id);
    assert.ok(!battleDuring?.outcome, "B's battle must not settle while A holds the field");

    // A's grace expires; the realm settles A. B waits out its retry beat
    // (up to SIEGE_RETRY_MS after the field clears) and then fights.
    context.advance(200_000);
    await context.state(ATTACKER_A);
    context.advance(31_000);
    await context.state(ATTACKER_B);
    const battleA = (await context.state(ATTACKER_A)).battleSessions[0];
    const battleB = (await context.state(ATTACKER_B)).battleSessions[0];
    assert.ok(battleA?.outcome, "A settled");
    assert.ok(battleB?.outcome, "B settled after the field cleared");
    assert.equal(
      armyUnitCount(battleB.defenderArmy),
      armyUnitCount(battleA.outcome.defenderSurvivors),
      "B fought A's survivors, not a copy of the garrison",
    );
    assert.ok(armyUnitCount(battleB.defenderArmy) < startingGarrison);
    for (const kind of ["wood", "stone", "iron"] as const) {
      const carried = Number(battleA.outcome.loot[kind]) + Number(battleB.outcome.loot[kind]);
      assert.ok(carried <= Number(startingStock[kind]), `${kind} must not duplicate`);
    }
  });
});

test("an attended battle.open against a village under siege is refused until the field clears", async () => {
  await withServer(async (context) => {
    await context.session(ATTACKER_A, "First Sword");
    await context.session(ATTACKER_B, "Second Sword");
    const defenderSession = await context.session(DEFENDER, "Held Ground");

    const opening = await context.state(ATTACKER_A);
    const target = opening.world.villages.find((v: any) => v.kingdomId === defenderSession.kingdomId);

    const { report: reportA } = await scoutThenAttack(context, ATTACKER_A, "oa", target.id);
    const { report: reportB } = await scoutThenAttack(context, ATTACKER_B, "ob", target.id);
    context.advance(MARCH_MS + 10);

    const stateA = await context.state(ATTACKER_A);
    const marchA = stateA.marches.find((m: any) => m.kind === "attack" && m.status === "awaiting_battle");
    assert.ok(marchA, "attacker A stands at the walls");
    const openedA = await context.command(ATTACKER_A, "oa-open", stateA.world.version, {
      type: "battle.open",
      payload: { marchId: marchA.id, targetVillageVersion: reportA.targetVillageVersion, plan: PLAN },
    });
    assert.equal(openedA.body.type, "command.accepted", JSON.stringify(openedA.body));

    const stateB = await context.state(ATTACKER_B);
    const marchB = stateB.marches.find((m: any) => m.kind === "attack" && m.status === "awaiting_battle");
    assert.ok(marchB, "attacker B stands at the walls");
    const refused = await context.command(ATTACKER_B, "ob-open-early", stateB.world.version, {
      type: "battle.open",
      payload: { marchId: marchB.id, targetVillageVersion: reportB.targetVillageVersion, plan: PLAN },
    });
    assert.equal(refused.body.payload?.code, "SIEGE_IN_PROGRESS", JSON.stringify(refused.body));

    // A settles; the field clears; B's army is still waiting and may now open.
    const resolved = await context.command(ATTACKER_A, "oa-resolve", (await context.state(ATTACKER_A)).world.version, {
      type: "battle.resolve",
      payload: { battleId: openedA.body.payload.battle.id },
    });
    assert.equal(resolved.body.type, "command.accepted");

    const stateB2 = await context.state(ATTACKER_B);
    const marchB2 = stateB2.marches.find((m: any) => m.kind === "attack" && m.status === "awaiting_battle");
    assert.ok(marchB2, "B's march must still be waiting, not consumed");
    const openedB = await context.command(ATTACKER_B, "ob-open", stateB2.world.version, {
      type: "battle.open",
      payload: { marchId: marchB2.id, targetVillageVersion: reportB.targetVillageVersion, plan: PLAN },
    });
    // Fresh intel may be required after the field changed - either an accept
    // or a stale-report refusal is honest here; what may NOT happen is a
    // second concurrent siege. If it opened, it must face the survivors.
    if (openedB.body.type === "command.accepted") {
      const battleA = openedA.body.payload.battle;
      const battleB = openedB.body.payload.battle;
      assert.ok(
        armyUnitCount(battleB.defenderArmy) <= armyUnitCount(battleA.defenderArmy),
        "B fights what A left standing",
      );
    } else {
      assert.equal(openedB.body.payload.code, "STALE_SCOUT_REPORT");
    }
  });
});
