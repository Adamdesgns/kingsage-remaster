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
  type BattlePlan,
} from "../../packages/game-core/src/index.ts";
import { createWorldHttpServer } from "../src/http.ts";
import {
  REALM_OF_POWER_ATTACK_CAP,
  REALM_OF_POWER_ON_CAPTURE,
  applyRealmOfPower,
  settlementPoints,
} from "../../packages/game-core/src/index.ts";
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

/** Mirrors how posedForConquest stores a share, so tests read one rule. */
function poseValue(maximum: number, share: number): number {
  return Math.max(1, Math.round(maximum * share));
}

function villageRow(context: Ctx, villageId: string) {
  return context.store.db.prepare(
    "SELECT kingdom_id, name, realm_of_power, is_capital, army_json FROM local_villages WHERE id = ?",
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
/**
 * Realm of Power replaced loyalty (spec section 9). These fixtures used to pose
 * a 0-100 loyalty; they now pose a SHARE of the settlement's own maximum, which
 * is what the real track scales to. `share: 1` is an untouched settlement.
 */
async function posedForConquest(context: Ctx, options: {
  share: number;
  attackerHome?: Record<string, number>;
  defenderGarrison?: Record<string, number>;
}) {
  await context.session(ATTACKER_ID, "Attacker");
  const defenderSession = await context.session(DEFENDER_ID, "Defender");
  const opening = await context.state(ATTACKER_ID);
  const home = opening.world.villages.find((v: any) => v.kingdomId === opening.kingdom.id && v.isCapital);
  const target = opening.world.villages.find((v: any) => v.kingdomId === defenderSession.kingdomId);
  assert.ok(home && target, "both kingdoms hold a village");

  const targetMax = settlementPoints(JSON.parse(String((context.store.db
    .prepare("SELECT buildings_json FROM local_villages WHERE id = ?").get(target.id) as any).buildings_json)));
  context.store.db.prepare("UPDATE local_villages SET army_json = ?, realm_of_power = ?, realm_of_power_at = ?, state_version = state_version + 1 WHERE id = ?")
    .run(
      JSON.stringify(options.defenderGarrison ?? TOKEN_GARRISON),
      Math.max(1, Math.round(targetMax * options.share)),
      new Date(Date.now()).toISOString(),
      target.id,
    );
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
    targetMax,
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
// The numbers the rest of this file leans on, pinned as literals so that
// editing a constant is a test failure rather than a silent rule change.
test("the Realm of Power contract: one Count, half at most, and it grows back", () => {
  // ⚠️ REPLACES "the loyalty contract". Loyalty was Tribal Wars': 0-100, 20-35
  // per noble, uncapped, no regeneration, reset to 25. KingsAge replaced all of
  // it in 2009. `loyaltyDrop` and `LOYALTY_ON_CAPTURE` are GONE rather than
  // left lying around - dead rules are how a maintainer tunes a number for an
  // hour and changes nothing.
  assert.equal(REALM_OF_POWER_ON_CAPTURE, 0.3, "a taken settlement sits at 30% of maximum");
  assert.equal(REALM_OF_POWER_ATTACK_CAP, 0.5, "one attack can never take more than half");

  const maximum = 10_000;
  for (const seed of ["seed-alpha", "seed-beta", "9f2c1ab4de77", ""]) {
    const first = applyRealmOfPower({ current: maximum, maximum, survivingCounts: 1, seed });
    const drop = maximum - first.value;
    assert.ok(Number.isInteger(drop), `${seed} drop is a whole number`);
    assert.ok(drop >= 2_250 && drop <= 2_750, `${seed} drop ${drop} is inside 2250-2750`);
    assert.equal(
      applyRealmOfPower({ current: maximum, maximum, survivingCounts: 1, seed }).value,
      first.value,
      "the same seed never disagrees with itself",
    );
  }

  // A settlement ALWAYS needs at least two attacks, however small.
  const tiny = 100;
  assert.ok(applyRealmOfPower({ current: tiny, maximum: tiny, survivingCounts: 9, seed: "swarm" }).value > 0);
});

test("a surviving Count shakes the Realm of Power by a deterministic amount", async () => {
  await withServer(async (context) => {
    // An untouched settlement against two Counts: only ONE of them can act, and
    // it can take at most half, so the settlement survives and the arithmetic
    // is readable.
    const { home, target, targetMax, defenderKingdomId } = await posedForConquest(context, {
      share: 1,
      attackerHome: { ...OVERWHELMING, noble: 2 },
    });
    const { battle, seed } = await attackAndSettle(context, "c-drop", home, target, { ...OVERWHELMING, noble: 2 });

    assert.equal(battle.outcome.winner, "attacker");
    assert.ok(battle.outcome.attackerSurvivors.noble >= 1, "at least one Count lived to press the claim");

    const expected = applyRealmOfPower({
      current: targetMax,
      maximum: targetMax,
      survivingCounts: battle.outcome.attackerSurvivors.noble,
      seed,
    });
    assert.ok(expected.value > 0, "this fixture is meant to leave the settlement standing");
    assert.equal(expected.countConsumed, 1, "two Counts rode; only one may act");

    const after = villageRow(context, target.id);
    assert.equal(Number(after.realm_of_power), expected.value, "the hold fell by exactly the seeded drop");
    assert.equal(String(after.kingdom_id), defenderKingdomId, "and it did not change hands");
  });
});

test("a Realm of Power at zero transfers the village, resets it to 30% of maximum, clears the garrison, and spends exactly one Count", async () => {
  await withServer(async (context) => {
    // Posed low enough that the FIRST surviving Count is guaranteed to take it
    // to zero, because the minimum drop is 2,250 and the per-attack cap only
    // bites above that.
    const { home, target, targetMax, attackerKingdomId, defenderKingdomId } = await posedForConquest(context, { share: 0.05 });
    const { battle } = await attackAndSettle(context, "c-capture", home, target, { ...OVERWHELMING, noble: 4 });

    const survivingNobles = battle.outcome.attackerSurvivors.noble;
    assert.ok(survivingNobles >= 1, "at least one Nobleman lived to press the claim");

    const after = villageRow(context, target.id);
    assert.equal(String(after.kingdom_id), attackerKingdomId, "the village belongs to the attacker now");
    // Computed from the maximum, but the SHARE is the literal: asserting
    // against REALM_OF_POWER_ON_CAPTURE alone would pass whatever it changed to.
    assert.equal(
      Number(after.realm_of_power),
      Math.max(1, Math.round(targetMax * 0.3)),
      "a freshly taken settlement sits at a fragile 30% of maximum",
    );
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
    const { home, target, targetMax, defenderKingdomId } = await posedForConquest(context, {
      share: 0.2,
      defenderGarrison: { ...emptyArmy(), spear: 500, sword: 300, archer: 200 },
      attackerHome: raidingParty,
    });
    const { battle } = await attackAndSettle(context, "c-defeat", home, target, raidingParty);

    assert.equal(battle.outcome.winner, "defender", "this attack was meant to fail");
    const after = villageRow(context, target.id);
    assert.equal(Number(after.realm_of_power), poseValue(targetMax, 0.2), "a losing Count shakes nothing");
    assert.equal(String(after.kingdom_id), defenderKingdomId, "and the village is still theirs");
    assert.equal(Number(kingdomRow(context, defenderKingdomId).alive), 1);
  });
});

test("a RETREAT with Noblemen aboard moves nothing", async () => {
  await withServer(async (context) => {
    const { home, target, targetMax, defenderKingdomId } = await posedForConquest(context, { share: 0.2 });

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
    assert.equal(Number(after.realm_of_power), poseValue(targetMax, 0.2), "a Count who turns around shakes nothing");
    assert.equal(String(after.kingdom_id), defenderKingdomId, "and the village is still theirs");
  });
});

test("taking a kingdom's last village kills the kingdom", async () => {
  await withServer(async (context) => {
    // A fresh kingdom holds exactly one village: its capital.
    const { home, target, targetMax, attackerKingdomId, defenderKingdomId } = await posedForConquest(context, { share: 0.2 });
    await attackAndSettle(context, "c-lastvillage", home, target, { ...OVERWHELMING, noble: 4 });

    assert.equal(String(villageRow(context, target.id).kingdom_id), attackerKingdomId, "they lost it");
    assert.equal(Number(kingdomRow(context, defenderKingdomId).alive), 0, "a realm with no ground left is dead");
  });
});

test("taking a capital re-seats the loser's capital on what they still hold", async () => {
  await withServer(async (context) => {
    const { home, target, targetMax, defenderKingdomId } = await posedForConquest(context, { share: 0.2 });

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
    const { home, target, targetMax, attackerKingdomId } = await posedForConquest(context, { share: 0.2 });

    // Before: a foreign village reads as a silhouette — zeroed levels.
    const fogged = (await context.state(ATTACKER_ID)).world.villages.find((v: any) => v.id === target.id);
    assert.equal(fogged.buildings.hq, 0, "foreign ground leaks no building levels");

    await attackAndSettle(context, "c-fog", home, target, { ...OVERWHELMING, noble: 4 });

    const owned = (await context.state(ATTACKER_ID)).world.villages.find((v: any) => v.id === target.id);
    assert.equal(owned.kingdomId, attackerKingdomId, "it is in my realm now");
    assert.ok(owned.buildings.hq > 0, "and I can read its real levels");
    assert.equal(owned.realmOfPower, Math.max(1, Math.round(targetMax * REALM_OF_POWER_ON_CAPTURE)),
      "a freshly taken settlement reads as fragile to its new owner");

    // The loser now reads their lost village as fog.
    const lost = (await context.state(DEFENDER_ID)).world.villages.find((v: any) => v.id === target.id);
    assert.equal(lost.buildings.hq, 0, "the old owner is on the outside now");
  });
});

/**
 * Re-scout the target so a follow-up attack is legal. A conquest needs three
 * to five Noblemen and a village only holds so many, so real campaigns arrive
 * in waves — and every wave changes the garrison the last report described.
 */
async function scoutAgain(context: Ctx, home: any, target: any, tag: string) {
  context.store.db.prepare(
    "UPDATE local_villages SET army_json = json_set(army_json, '$.scout', 1), state_version = state_version + 1 WHERE id = ?",
  ).run(home.id);
  const before = await context.state(ATTACKER_ID);
  const scout = await context.command(ATTACKER_ID, `c-rescout-${tag}`, before.world.version, {
    type: "march.launch",
    payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "scout", army: { ...emptyArmy(), scout: 1 } },
  });
  assert.equal(scout.body.type, "command.accepted", `wave ${tag} re-scouted (${JSON.stringify(scout.body)})`);
  context.advance(MARCH_MS + 20);
}

test("a settlement at full strength falls to a campaign of waves, and the hold persists between them", async () => {
  await withServer(async (context) => {
    // The loop a real player walks: loyalty 100, one Nobleman per wave, each
    // wave chipping 20-35 off what the last one left. Nothing in the suite
    // covered this before — every other conquest test either poses loyalty low
    // enough for a single Nobleman or lands the whole claim in one attack. If
    // loyalty did not persist across attacks, conquest would be unreachable in
    // play no matter how many Noblemen a kingdom could afford.
    //
    // A Nobleman can DIE at the wall even in a walkover, and a wave that buries
    // its Nobleman moves nothing. That is the rule, not a flake, so each wave
    // is checked against the survivors it actually had rather than against an
    // assumption that every wave lands.
    const { home, target, targetMax, attackerKingdomId, defenderKingdomId } = await posedForConquest(context, {
      share: 1,
      attackerHome: { ...OVERWHELMING, noble: 6 },
    });

    let hold = targetMax;
    let captured = false;
    let landedWaves = 0;

    for (let wave = 1; wave <= 10 && !captured; wave += 1) {
      if (wave > 1) await scoutAgain(context, home, target, String(wave));
      // A fresh escort and a fresh token garrison each wave: the rule under
      // test is Realm of Power, not attrition.
      context.store.db.prepare("UPDATE local_villages SET army_json = ?, state_version = state_version + 1 WHERE id = ?")
        .run(JSON.stringify({ ...OVERWHELMING, noble: 1, scout: 1 }), home.id);
      context.store.db.prepare("UPDATE local_villages SET army_json = ?, state_version = state_version + 1 WHERE id = ?")
        .run(JSON.stringify(TOKEN_GARRISON), target.id);

      const { battle, seed } = await attackAndSettle(context, `c-wave-${wave}`, home, target, { ...OVERWHELMING, noble: 1 });
      assert.equal(battle.outcome.winner, "attacker", `wave ${wave} won at the wall`);

      const survivors = Number(battle.outcome.attackerSurvivors.noble ?? 0);
      const expected = applyRealmOfPower({ current: hold, maximum: targetMax, survivingCounts: survivors, seed });

      const after = villageRow(context, target.id);
      if (expected.value <= 0) {
        captured = true;
        landedWaves += 1;
        assert.equal(String(after.kingdom_id), attackerKingdomId, `wave ${wave} took the settlement`);
        assert.equal(Number(after.realm_of_power), Math.max(1, Math.round(targetMax * REALM_OF_POWER_ON_CAPTURE)),
          "a taken settlement resets to a fragile 30% of maximum");
        break;
      }

      assert.equal(Number(after.realm_of_power), expected.value,
        `wave ${wave} moved the hold by exactly what its Count was worth`);
      assert.equal(String(after.kingdom_id), defenderKingdomId, `wave ${wave} did not take it early`);
      if (survivors > 0) {
        landedWaves += 1;
        assert.ok(Number(after.realm_of_power) < hold, `wave ${wave} with a surviving Count must move the hold`);
      } else {
        assert.equal(Number(after.realm_of_power), hold, `wave ${wave} buried its Count, so nothing moved`);
      }
      hold = Number(after.realm_of_power);
    }

    assert.ok(captured, "a sustained campaign eventually takes the settlement");
    // ⚠️ The old assertion here was "3-5 waves", which was LOYALTY's shape
    // (100 points against a 20-35 drop). Realm of Power gives a different and
    // better answer, and it is worth stating because it is not obvious:
    //
    // The per-attack cap is 50% of MAXIMUM, so from full it is always exactly
    // two attacks - unless the settlement is developed enough for KingsAge's
    // 2,250-2,750 band to bite instead, which needs 4,500+ points. A starting
    // settlement is worth 294, so early conquest is a clean two-wave campaign
    // and a well-built one costs four. Developed ground is genuinely harder to
    // take, which falls out of the rules rather than being tuned in.
    assert.ok(landedWaves >= 2,
      `${landedWaves} Count(s) pressed the claim; the cap guarantees at least two`);
    assert.ok(landedWaves <= 5, `${landedWaves} waves is more than any settlement should need`);
  });
});

test("DEV seeding is off by default, and when set only adds Noblemen", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-seed-"));
  try {
    const plain = new SharedWorldStore(join(directory, "plain.sqlite"), {});
    const plainVillages = plain.db.prepare("SELECT army_json FROM local_villages").all() as any[];
    assert.ok(plainVillages.length > 0, "the fixture built a world");
    for (const row of plainVillages) {
      assert.equal(JSON.parse(row.army_json).noble ?? 0, 0,
        "a production boot never seeds a Nobleman — conquest must be earned");
    }
    const plainFirst = JSON.parse(plainVillages[0].army_json);
    plain.close();

    const seeded = new SharedWorldStore(join(directory, "seeded.sqlite"), { devSeedNobles: 4 });
    const seededVillages = seeded.db.prepare("SELECT army_json FROM local_villages").all() as any[];
    for (const row of seededVillages) {
      assert.equal(JSON.parse(row.army_json).noble, 4, "the knob seeds every village");
    }
    const seededFirst = JSON.parse(seededVillages[0].army_json);
    // Everything that is not a Nobleman must be untouched, or the knob would be
    // quietly rebalancing a world the other tests depend on.
    for (const troop of Object.keys(plainFirst)) {
      if (troop === "noble") continue;
      assert.equal(seededFirst[troop], plainFirst[troop], `${troop} was left alone`);
    }
    assert.equal(armyUnitCount(seededFirst), armyUnitCount(plainFirst) + 4, "it added exactly four units");
    seeded.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
