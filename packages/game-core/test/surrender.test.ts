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
  // ⚠️ This used to assert `yielded[troop] <= defenderSurvivors[troop]`, which
  // encoded the OLD rule that prisoners come from the men left standing. Slice
  // 1b broke that on purpose: the real engine wipes a beaten sub-army, so a
  // rout leaves no survivors and prisoners now come out of the casualties.
  //
  // The assertion is replaced by the property it was really protecting - that
  // the rule can never invent a soldier - which is stronger and survives the
  // change of mechanism.
  for (const troop of Object.keys(outcome.yielded) as (keyof typeof outcome.yielded)[]) {
    const started = troop === "spear" ? 6 : 0;
    assert.equal(
      outcome.defenderCasualties[troop] + outcome.defenderSurvivors[troop] + outcome.yielded[troop],
      started,
      `${troop}: a defender was created or lost`,
    );
  }
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

test("an overwhelming win takes prisoners out of the dead, not out of thin air", () => {
  // The new engine wipes a beaten sub-army, so after slice 1b there are no
  // "survivors" left for the old surrender rule to collect - it had quietly
  // become dead code. The DESIGNED intent survives: intimidation over
  // annihilation pays in soldiers. Prisoners are now taken from the men who
  // would otherwise have died, so the world still never gains a soldier.
  const outcome = resolveBattle({
    attacker: { ...emptyArmy(), axe: 400 },
    defender: { ...emptyArmy(), spear: 60 },
    attackerLevels: initialTroopLevels(),
    defenderLevels: initialTroopLevels(),
    defenderWallLevel: 0,
    defenderResources: { wood: 0, stone: 0, iron: 0 },
    plan: UNPLANNED_ATTACK_PLAN,
    acceptedOrders: 0,
    seed: "prisoners",
  });

  assert.equal(outcome.winner, "attacker");
  const yielded = armyUnitCount(outcome.yielded);
  assert.ok(yielded > 0, "a hopeless garrison should yield rather than die to the last man");

  // Conservation: every defender is accounted for exactly once.
  const started = 60;
  const dead = armyUnitCount(outcome.defenderCasualties);
  const left = armyUnitCount(outcome.defenderSurvivors);
  assert.equal(dead + left + yielded, started, "a defender was created or lost");
});
