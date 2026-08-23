import assert from "node:assert/strict";
import test from "node:test";
import {
  addArmies,
  armyUnitCount,
  battlePlanScore,
  emptyArmy,
  initialTroopLevels,
  resolveBattle,
  UNPLANNED_ATTACK_PLAN,
  battleWallLevel,
  retreatSurvivors,
  subtractArmy,
} from "../src/index.ts";

test("troops cannot be duplicated or sent with invalid counts", () => {
  const home = { ...emptyArmy(), spear: 30, archer: 10 };
  const sent = { ...emptyArmy(), spear: 20, archer: 5 };
  const remaining = subtractArmy(home, sent)!;
  assert.deepEqual(addArmies(remaining, sent), home);
  assert.equal(subtractArmy(home, { ...sent, spear: 31 }), null);
  assert.equal(subtractArmy(home, { ...emptyArmy(), spear: -1 }), null);
});

test("a fully scouted plan materially improves an otherwise close assault", () => {
  const attacker = { ...emptyArmy(), spear: 30, sword: 12, archer: 10 };
  const defender = { ...emptyArmy(), spear: 22, sword: 8, archer: 7 };
  const strongPlan = { entry: "West Ridge", troops: "Balanced Army", time: "Dawn", style: "Flanking Strike" } as const;
  const poorPlan = { entry: "Main Breach", troops: "Vanguard Heavy", time: "Midday", style: "Full Assault" } as const;
  const common = {
    attacker,
    defender,
    attackerLevels: initialTroopLevels(),
    defenderLevels: initialTroopLevels(),
    defenderWallLevel: 1,
    defenderResources: { wood: 1000, stone: 800, iron: 600 },
    acceptedOrders: 4,
    seed: "close-fight",
  };
  const strong = resolveBattle({ ...common, plan: strongPlan });
  const poor = resolveBattle({ ...common, plan: poorPlan });
  assert.equal(battlePlanScore(strongPlan), 4);
  assert.equal(strong.winner, "attacker");
  assert.ok(armyUnitCount(strong.attackerSurvivors) > armyUnitCount(poor.attackerSurvivors));
  assert.ok(Object.values(strong.loot).some((amount) => amount > 0));
});

test("battle resolution and retreat are deterministic", () => {
  const army = { ...emptyArmy(), spear: 40, archer: 10 };
  const input = {
    attacker: army,
    defender: { ...emptyArmy(), spear: 20 },
    attackerLevels: initialTroopLevels(),
    defenderLevels: initialTroopLevels(),
    defenderWallLevel: 1,
    defenderResources: { wood: 500, stone: 500, iron: 500 },
    plan: { entry: "West Ridge", troops: "Balanced Army", time: "Dawn", style: "Flanking Strike" } as const,
    acceptedOrders: 3,
    seed: "deterministic",
  };
  assert.deepEqual(resolveBattle(input), resolveBattle(input));
  assert.deepEqual(retreatSurvivors(army, 45_000, 2, "retreat"), retreatSurvivors(army, 45_000, 2, "retreat"));
});

test("the live battle path decides by unit class, not a flat power sum", () => {
  // Slice 1b: resolveBattle now runs the real KingsAge engine. Two armies with
  // the SAME raw attack against the SAME garrison, differing only in class -
  // under the old flat power sum they were interchangeable.
  const levels = initialTroopLevels();
  const defender = { ...emptyArmy(), spear: 1000 }; // 100 vs infantry, 200 vs cavalry
  const shared = {
    defender,
    attackerLevels: levels,
    defenderLevels: levels,
    defenderWallLevel: 0,
    defenderResources: { wood: 100, stone: 100, iron: 100 },
    plan: UNPLANNED_ATTACK_PLAN,
    acceptedOrders: 0,
    seed: "class-matters",
  };

  const foot = resolveBattle({ ...shared, attacker: { ...emptyArmy(), axe: 400 } });
  const horse = resolveBattle({ ...shared, attacker: { ...emptyArmy(), lightCavalry: 156 } });

  assert.equal(foot.winner, "attacker", "Berserkers should break a Squire wall");
  assert.equal(horse.winner, "defender", "Squires are built to stop cavalry");
});

test("armour raises defence without touching attack", () => {
  const defender = { ...emptyArmy(), spear: 1000 };
  const attacker = { ...emptyArmy(), axe: 400 };
  const shared = {
    attacker,
    defender,
    attackerLevels: initialTroopLevels(),
    defenderWallLevel: 0,
    defenderResources: { wood: 0, stone: 0, iron: 0 },
    plan: UNPLANNED_ATTACK_PLAN,
    acceptedOrders: 0,
    seed: "armour",
  };
  const bare = resolveBattle({ ...shared, defenderLevels: initialTroopLevels() });
  const armoured = resolveBattle({
    ...shared,
    defenderLevels: Object.fromEntries(Object.keys(initialTroopLevels()).map((t) => [t, 10])) as any,
  });

  assert.equal(bare.winner, "attacker");
  assert.equal(armoured.winner, "defender", "ten levels of armour should hold a wall the bare garrison lost");
});

test("rams open the wall for the battle they arrive with", () => {
  // Both armies carry the SAME total attack (~230,000), so the only difference
  // is that one brought rams and knocked the wall from 20 down to 11 before a
  // blow was struck. Same plan, same seed: the wall is the whole story.
  const shared = {
    defender: { ...emptyArmy(), spear: 1400 },
    attackerLevels: initialTroopLevels(),
    defenderLevels: initialTroopLevels(),
    defenderWallLevel: 20,
    defenderResources: { wood: 0, stone: 0, iron: 0 },
    plan: UNPLANNED_ATTACK_PLAN,
    acceptedOrders: 0,
    seed: "rams-open-the-way",
  };

  const noRams = resolveBattle({ ...shared, attacker: { ...emptyArmy(), axe: 657 } });
  const withRams = resolveBattle({ ...shared, attacker: { ...emptyArmy(), axe: 600, ram: 200 } });

  assert.equal(noRams.winner, "defender", "a level-20 wall should hold against foot alone");
  assert.equal(withRams.winner, "attacker", "the same attack behind rams should get in");
});

test("trebuchets do not open the wall, however many arrive", () => {
  // [CONFIRMED] Trebuchets damage BUILDINGS, after the battle. They fight like
  // any other unit while they are there - 500 attack each, which is a lot - but
  // they must never do a ram's job.
  //
  // Tested by equivalence rather than by contriving a loss: 200 trebuchets and
  // 286 Berserkers carry the same ~100,000 infantry attack, so if trebuchets
  // left the wall alone the two armies must reach the same verdict. Rams with
  // matched attack do NOT - that is the test above, and the contrast is the
  // point.
  const shared = {
    defender: { ...emptyArmy(), spear: 1400 },
    attackerLevels: initialTroopLevels(),
    defenderLevels: initialTroopLevels(),
    defenderWallLevel: 20,
    defenderResources: { wood: 0, stone: 0, iron: 0 },
    plan: UNPLANNED_ATTACK_PLAN,
    acceptedOrders: 0,
    seed: "siege-equivalence",
  };

  const withTrebuchets = resolveBattle({ ...shared, attacker: { ...emptyArmy(), axe: 600, trebuchet: 200 } });
  const matchedFoot = resolveBattle({ ...shared, attacker: { ...emptyArmy(), axe: 886 } });

  assert.equal(withTrebuchets.winner, matchedFoot.winner,
    "trebuchets changed the verdict, which means they opened the wall");
  // And the wall itself is untouched by anything that is not a ram.
  assert.equal(battleWallLevel(20, 0), 20);
});
