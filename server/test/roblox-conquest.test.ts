// Conquest — battles slice C, through the real /api/roblox/* routes.
//
// The rule these tests exist to defend: a village can change hands, and it can
// only change hands the one way the spec allows. Noblemen who SURVIVE a WON,
// RESOLVED attack shake loyalty; at zero the settlement changes owner, resets
// to a fragile 25, and disperses its garrison. Nothing else moves it — not a
// defeat, not a retreat, not a Nobleman who died at the wall.
//
// The server half of this slice shipped inside commit 2d32422 (a commit
// labelled as a bugfix) with no tests at all. This file is that missing proof.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  armyUnitCount,
  BUILDINGS,
  emptyArmy,
  loyaltyDrop,
  LOYALTY_ON_CAPTURE,
  type BattlePlan,
} from "../../packages/game-core/src/index.ts";
import { createWorldHttpServer } from "../src/http.ts";
import { SharedWorldStore } from "../src/store.ts";

const KEY = "test-secret-key-0123456789abcdef";
const ATTACKER_ID = 990001;
const DEFENDER_ID = 990002;

const PLAN: BattlePlan = {
  entry: "West Ridge",
  troops: "Balanced Army",
  time: "Dawn",
  style: "Flanking Strike",
};

const MARCH_MS = 60;
const RETURN_MS = 60;
const AUTO_RESOLVE_MS = 200;

/** Enough to win at a walk and still have Noblemen standing afterwards. */
const OVERWHELMING = { ...emptyArmy(), spear: 400, sword: 150, archer: 120 };
const TOKEN_GARRISON = { ...emptyArmy(), spear: 12 };

/** Level-1 everything — a real village, with a development score above zero. */
function startingBuildings(): Record<string, number> {
  return Object.fromEntries(Object.keys(BUILDINGS).map((building) => [building, 1]));
}

type Ctx = {
  store: SharedWorldStore;
  advance: (ms: number) => void;
  session: (robloxUserId: number, name: string) => Promise<any>;
  state: (robloxUserId: number) => Promise<any>;
  command: (robloxUserId: number, commandId: string, expectedWorldVersion: number, command: unknown) => Promise<{ status: number; body: any }>;
};

async function withServer(run: (context: Ctx) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-conquest-"));
  let now = new Date("2026-08-22T09:00:00.000Z");
  const store = new SharedWorldStore(join(directory, "world.sqlite"), {
    now: () => now,
    marchDurationMs: MARCH_MS,
    returnDurationMs: RETURN_MS,
    autoResolveMs: AUTO_RESOLVE_MS,
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

function villageRow(context: Ctx, villageId: string) {
  return context.store.db.prepare(
    "SELECT kingdom_id, name, loyalty, is_capital, army_json FROM local_villages WHERE id = ?",
  ).get(villageId) as any;
}

function kingdomRow(context: Ctx, kingdomId: string) {
  return context.store.db.prepare(
    "SELECT alive, capital_village_id, villages_conquered, war_victory_points FROM local_kingdoms WHERE id = ?",
  ).get(kingdomId) as any;
}

/**
 * Pose both sides FIRST, then scout — a scout report is only usable while the
 * garrison it observed is still the garrison at the wall, so posing after
 * scouting would invalidate the intel the attack depends on.
 */
async function posedForConquest(context: Ctx, options: {
  loyalty: number;
  attackerHome?: Record<string, number>;
  defenderGarrison?: Record<string, number>;
}) {
  await context.session(ATTACKER_ID, "Attacker");
  const defenderSession = await context.session(DEFENDER_ID, "Defender");
  const opening = await context.state(ATTACKER_ID);
  const home = opening.world.villages.find((v: any) => v.kingdomId === opening.kingdom.id && v.isCapital);
  const target = opening.world.villages.find((v: any) => v.kingdomId === defenderSession.kingdomId);
  assert.ok(home && target, "both kingdoms hold a village");

  context.store.db.prepare("UPDATE local_villages SET army_json = ?, loyalty = ?, state_version = state_version + 1 WHERE id = ?")
    .run(JSON.stringify(options.defenderGarrison ?? TOKEN_GARRISON), options.loyalty, target.id);
  // Whatever the fixture asks for, plus a scout — an attack is refused
  // outright until this kingdom has laid eyes on the target.
  const attackerHome = { ...(options.attackerHome ?? { ...OVERWHELMING, noble: 4 }) };
  attackerHome.scout = (attackerHome.scout ?? 0) + 1;
  context.store.db.prepare("UPDATE local_villages SET army_json = ?, state_version = state_version + 1 WHERE id = ?")
    .run(JSON.stringify(attackerHome), home.id);

  const beforeScout = await context.state(ATTACKER_ID);
  const scout = await context.command(ATTACKER_ID, "c-scout", beforeScout.world.version, {
    type: "march.launch",
    payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "scout", army: { ...emptyArmy(), scout: 1 } },
  });
  assert.equal(scout.body.type, "command.accepted", `the scouts got away (${JSON.stringify(scout.body)})`);
  context.advance(MARCH_MS + 20);
  const scouted = await context.state(ATTACKER_ID);
  assert.ok(scouted.scoutReports.length > 0, "the scouts reported back");

  return {
    home,
    target,
    attackerKingdomId: opening.kingdom.id,
    defenderKingdomId: defenderSession.kingdomId,
    snapshot: scouted,
  };
}

/** Launch an unattended attack and let the server settle it from the plan. */
async function attackAndSettle(context: Ctx, commandId: string, home: any, target: any, army: Record<string, number>) {
  const before = await context.state(ATTACKER_ID);
  const launched = await context.command(ATTACKER_ID, commandId, before.world.version, {
    type: "march.launch",
    payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army, plan: PLAN },
  });
  assert.equal(launched.body.type, "command.accepted", `the attack launched (${JSON.stringify(launched.body)})`);
  context.advance(MARCH_MS + AUTO_RESOLVE_MS + 200);
  const settled = await context.state(ATTACKER_ID);
  const battle = settled.battleSessions.find((session: any) => session.status === "resolved");
  assert.ok(battle, "the server fought the battle nobody attended");
  const seed = String((context.store.db.prepare("SELECT seed FROM local_battle_sessions WHERE id = ?")
    .get(battle.id) as any).seed);
  return { settled, battle, seed };
}

// The numbers the rest of this file leans on, pinned as literals so that
// editing a constant is a test failure rather than a silent rule change.
test("the loyalty contract: drops land in 20-35, and the same seed always gives the same drop", () => {
  assert.equal(LOYALTY_ON_CAPTURE, 25, "spec SS5: a freshly taken village resets to 25");

  for (const seed of ["seed-alpha", "seed-beta", "9f2c1ab4de77", ""]) {
    for (let index = 0; index < 6; index += 1) {
      const drop = loyaltyDrop(seed, index);
      assert.ok(Number.isInteger(drop), `${seed}/${index} is a whole number`);
      assert.ok(drop >= 20 && drop <= 35, `${seed}/${index} drop ${drop} is inside 20-35`);
      assert.equal(drop, loyaltyDrop(seed, index), "the same seed and index never disagree with itself");
    }
  }

  // Golden values. A conquest must replay identically forever, so these are
  // allowed to change only as a deliberate, noticed decision.
  assert.equal(loyaltyDrop("seed-alpha", 0), 22);
  assert.equal(loyaltyDrop("seed-beta", 0), 23);
});

test("Noblemen who survive a won attack drop loyalty by a deterministic amount", async () => {
  await withServer(async (context) => {
    // Loyalty 100 against two Noblemen: the most they can take off is 70, so
    // the village survives this attack and we can read the exact arithmetic.
    const { home, target, defenderKingdomId } = await posedForConquest(context, {
      loyalty: 100,
      attackerHome: { ...OVERWHELMING, noble: 2 },
    });
    const { battle, seed } = await attackAndSettle(context, "c-drop", home, target, { ...OVERWHELMING, noble: 2 });

    assert.equal(battle.outcome.winner, "attacker");
    const survivingNobles = battle.outcome.attackerSurvivors.noble;
    assert.ok(survivingNobles >= 1, "at least one Nobleman lived to press the claim");

    let expected = 100;
    for (let index = 0; index < survivingNobles && expected > 0; index += 1) expected -= loyaltyDrop(seed, index);
    assert.ok(expected > 0, "this fixture is meant to leave the village standing");

    const after = villageRow(context, target.id);
    assert.equal(Number(after.loyalty), expected, "loyalty fell by exactly the seeded drop");
    assert.equal(String(after.kingdom_id), defenderKingdomId, "and it did not change hands");
  });
});

test("loyalty at zero transfers the village, resets it to 25, clears the garrison, and consumes exactly one Nobleman", async () => {
  await withServer(async (context) => {
    // Loyalty 20: the FIRST surviving Nobleman is guaranteed to take it to zero
    // or below, because the minimum drop is 20.
    const { home, target, attackerKingdomId, defenderKingdomId } = await posedForConquest(context, { loyalty: 20 });
    const { battle } = await attackAndSettle(context, "c-capture", home, target, { ...OVERWHELMING, noble: 4 });

    const survivingNobles = battle.outcome.attackerSurvivors.noble;
    assert.ok(survivingNobles >= 1, "at least one Nobleman lived to press the claim");

    const after = villageRow(context, target.id);
    assert.equal(String(after.kingdom_id), attackerKingdomId, "the village belongs to the attacker now");
    // The literal, deliberately: asserting against LOYALTY_ON_CAPTURE would
    // pass no matter what the constant were changed to.
    assert.equal(Number(after.loyalty), 25, "a freshly taken village sits at a fragile 25");
    assert.equal(Number(after.is_capital), 0, "and it is nobody's capital");
    assert.equal(armyUnitCount(JSON.parse(String(after.army_json))), 0, "the beaten garrison dispersed");

    // Exactly one Nobleman is spent seating the new lord; the rest ride home.
    const returning = (await context.state(ATTACKER_ID)).marches.find((m: any) => m.kind === "return");
    assert.ok(returning, "the rest of the army is on the road home");
    assert.equal(returning.army.noble, survivingNobles - 1, "one Nobleman stayed behind as the new lord");

    const scoreboard = kingdomRow(context, attackerKingdomId);
    assert.equal(Number(scoreboard.villages_conquered), 1, "the conquest is on the attacker's record");
    assert.ok(Number(scoreboard.war_victory_points) > 0, "and it scored");

    // A conquest announces itself rather than making clients diff for it.
    const events = context.store.readEvents(context.store.worldIdForKingdom(attackerKingdomId), 0);
    const conquered = events.find((event: any) => event.type === "village.conquered") as any;
    assert.ok(conquered, "a village.conquered event was published");
    assert.equal(conquered.payload.fromKingdomId, defenderKingdomId);
    assert.equal(conquered.payload.toKingdomId, attackerKingdomId);
  });
});

test("a DEFEAT with Noblemen aboard moves nothing", async () => {
  await withServer(async (context) => {
    // A wall of defenders against a token raiding party carrying one Nobleman.
    const raidingParty = { ...emptyArmy(), spear: 3, noble: 1 };
    const { home, target, defenderKingdomId } = await posedForConquest(context, {
      loyalty: 20,
      defenderGarrison: { ...emptyArmy(), spear: 500, sword: 300, archer: 200 },
      attackerHome: raidingParty,
    });
    const { battle } = await attackAndSettle(context, "c-defeat", home, target, raidingParty);

    assert.equal(battle.outcome.winner, "defender", "this attack was meant to fail");
    const after = villageRow(context, target.id);
    assert.equal(Number(after.loyalty), 20, "a losing Nobleman shakes nothing");
    assert.equal(String(after.kingdom_id), defenderKingdomId, "and the village is still theirs");
    assert.equal(Number(kingdomRow(context, defenderKingdomId).alive), 1);
  });
});

test("a RETREAT with Noblemen aboard moves nothing", async () => {
  await withServer(async (context) => {
    const { home, target, defenderKingdomId } = await posedForConquest(context, { loyalty: 20 });

    const before = await context.state(ATTACKER_ID);
    await context.command(ATTACKER_ID, "c-retreat-launch", before.world.version, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: { ...OVERWHELMING, noble: 4 }, plan: PLAN },
    });
    context.advance(MARCH_MS + 20);

    // Show up, look at the walls, and walk away before the deadline.
    const arrived = await context.state(ATTACKER_ID);
    const march = arrived.marches.find((m: any) => m.kind === "attack" && m.status === "awaiting_battle");
    assert.ok(march, "the army is at the walls");
    const report = arrived.scoutReports.find((r: any) => r.targetVillageId === target.id);
    const opened = await context.command(ATTACKER_ID, "c-retreat-open", arrived.world.version, {
      type: "battle.open",
      payload: { marchId: march.id, targetVillageVersion: report.targetVillageVersion, plan: PLAN },
    });
    assert.equal(opened.body.type, "command.accepted", `the battle opened (${JSON.stringify(opened.body)})`);

    const inBattle = await context.state(ATTACKER_ID);
    const retreated = await context.command(ATTACKER_ID, "c-retreat-go", inBattle.world.version, {
      type: "battle.retreat",
      payload: { battleId: inBattle.battleSessions[0].id, sequence: 1, atMs: 4_000 },
    });
    assert.equal(retreated.body.type, "command.accepted", `the retreat was accepted (${JSON.stringify(retreated.body)})`);
    assert.equal((await context.state(ATTACKER_ID)).battleSessions[0].status, "retreated");

    const after = villageRow(context, target.id);
    assert.equal(Number(after.loyalty), 20, "a Nobleman who turns around shakes nothing");
    assert.equal(String(after.kingdom_id), defenderKingdomId, "and the village is still theirs");
  });
});

test("taking a kingdom's last village kills the kingdom", async () => {
  await withServer(async (context) => {
    // A fresh kingdom holds exactly one village: its capital.
    const { home, target, attackerKingdomId, defenderKingdomId } = await posedForConquest(context, { loyalty: 20 });
    await attackAndSettle(context, "c-lastvillage", home, target, { ...OVERWHELMING, noble: 4 });

    assert.equal(String(villageRow(context, target.id).kingdom_id), attackerKingdomId, "they lost it");
    assert.equal(Number(kingdomRow(context, defenderKingdomId).alive), 0, "a realm with no ground left is dead");
  });
});

test("taking a capital re-seats the loser's capital on what they still hold", async () => {
  await withServer(async (context) => {
    const { home, target, defenderKingdomId } = await posedForConquest(context, { loyalty: 20 });

    // Give the defender somewhere to fall back to.
    const refugeId = "village-defender-refuge";
    context.store.db.prepare(`
      INSERT INTO local_villages(
        id, world_id, kingdom_id, name, x, y, is_capital, loyalty,
        resources_json, buildings_json, army_json, state_version
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 100, ?, ?, ?, 0)
    `).run(
      refugeId, target.worldId, defenderKingdomId, "Last Refuge", target.x + 6, target.y + 6,
      JSON.stringify({ wood: 100, stone: 100, iron: 100 }),
      JSON.stringify(startingBuildings()),
      JSON.stringify(emptyArmy()),
    );
    assert.equal(Number(villageRow(context, target.id).is_capital), 1, "the target really is their capital");

    await attackAndSettle(context, "c-capital", home, target, { ...OVERWHELMING, noble: 4 });

    assert.equal(Number(villageRow(context, refugeId).is_capital), 1, "the refuge is the new capital");
    const loser = kingdomRow(context, defenderKingdomId);
    assert.equal(String(loser.capital_village_id), refugeId, "and the kingdom row agrees");
    assert.equal(Number(loser.alive), 1, "they still hold ground, so they are still in the war");
  });
});

test("the conquered village is no longer fogged for its new owner", async () => {
  await withServer(async (context) => {
    const { home, target, attackerKingdomId } = await posedForConquest(context, { loyalty: 20 });

    // Before: a foreign village reads as a silhouette — zeroed levels.
    const fogged = (await context.state(ATTACKER_ID)).world.villages.find((v: any) => v.id === target.id);
    assert.equal(fogged.buildings.hq, 0, "foreign ground leaks no building levels");

    await attackAndSettle(context, "c-fog", home, target, { ...OVERWHELMING, noble: 4 });

    const owned = (await context.state(ATTACKER_ID)).world.villages.find((v: any) => v.id === target.id);
    assert.equal(owned.kingdomId, attackerKingdomId, "it is in my realm now");
    assert.ok(owned.buildings.hq > 0, "and I can read its real levels");
    assert.equal(owned.loyalty, 25);

    // The loser now reads their lost village as fog.
    const lost = (await context.state(DEFENDER_ID)).world.villages.find((v: any) => v.id === target.id);
    assert.equal(lost.buildings.hq, 0, "the old owner is on the outside now");
  });
});
