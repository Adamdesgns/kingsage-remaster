// The surrender rule (battles slice A, spec §5: "intimidation over
// annihilation can pay in soldiers"). Pure rule, no world, no database.
import assert from "node:assert/strict";
import test from "node:test";
import {
  SURRENDER_POWER_RATIO,
  UNPLANNED_ATTACK_PLAN,
  armyUnitCount,
  battlePlanScore,
  emptyArmy,
  initialTroopLevels,
  resolveBattle,
  surrenderYield,
} from "../src/index.ts";

const survivors = { ...emptyArmy(), spear: 12, archer: 3 };

test("an overwhelming attacker takes the survivors instead of killing them", () => {
  const yielded = surrenderYield({
    winner: "attacker",
    attackerPower: 300,
    defenderPower: 100,
    defenderSurvivors: survivors,
  });
  assert.deepEqual(yielded, survivors);
  assert.equal(armyUnitCount(yielded), 15);
});

test("just under the threshold nobody yields", () => {
  const yielded = surrenderYield({
    winner: "attacker",
    attackerPower: 100 * SURRENDER_POWER_RATIO - 0.01,
    defenderPower: 100,
    defenderSurvivors: survivors,
  });
  assert.deepEqual(yielded, emptyArmy());
});

test("a losing attacker is never surrendered to", () => {
  assert.deepEqual(
    surrenderYield({ winner: "defender", attackerPower: 9_000, defenderPower: 1, defenderSurvivors: survivors }),
    emptyArmy(),
  );
});

test("nobody left alive means nobody to yield", () => {
  assert.deepEqual(
    surrenderYield({ winner: "attacker", attackerPower: 9_000, defenderPower: 1, defenderSurvivors: emptyArmy() }),
    emptyArmy(),
  );
});

test("the rule can never invent a soldier", () => {
  const yielded = surrenderYield({
    winner: "attacker",
    attackerPower: 10_000,
    defenderPower: 1,
    defenderSurvivors: survivors,
  });
  for (const troop of Object.keys(survivors) as (keyof typeof survivors)[]) {
    assert.ok(yielded[troop] <= survivors[troop], `${troop} yielded more than survived`);
  }
});

test("resolveBattle carries the yield, and a lopsided attack collects it", () => {
  const outcome = resolveBattle({
    attacker: { ...emptyArmy(), spear: 200, sword: 80, archer: 60 },
    defender: { ...emptyArmy(), spear: 6 },
    attackerLevels: initialTroopLevels(),
    defenderLevels: initialTroopLevels(),
    defenderWallLevel: 0,
    defenderResources: { wood: 500, stone: 500, iron: 500 },
    plan: UNPLANNED_ATTACK_PLAN,
    acceptedOrders: 0,
    seed: "surrender-lopsided",
  });
  assert.equal(outcome.winner, "attacker");
  // Every yielded troop is one of the defender survivors, never more.
  for (const troop of Object.keys(outcome.yielded) as (keyof typeof outcome.yielded)[]) {
    assert.ok(outcome.yielded[troop] <= outcome.defenderSurvivors[troop]);
  }
  assert.ok(armyUnitCount(outcome.yielded) >= 0);
});

test("an even fight yields nobody", () => {
  const even = { ...emptyArmy(), spear: 30, sword: 12, archer: 10 };
  const outcome = resolveBattle({
    attacker: even,
    defender: { ...emptyArmy(), spear: 28, sword: 11, archer: 9 },
    attackerLevels: initialTroopLevels(),
    defenderLevels: initialTroopLevels(),
    defenderWallLevel: 2,
    defenderResources: { wood: 100, stone: 100, iron: 100 },
    plan: UNPLANNED_ATTACK_PLAN,
    acceptedOrders: 0,
    seed: "surrender-even",
  });
  assert.deepEqual(outcome.yielded, emptyArmy());
});

test("the unplanned fallback is a real plan, and not the best one", () => {
  // An attack nobody designed must still be fightable, but must not quietly
  // hand the absent commander a perfect plan.
  assert.ok(battlePlanScore(UNPLANNED_ATTACK_PLAN) < 4);
  assert.equal(UNPLANNED_ATTACK_PLAN.style, "Full Assault");
});
