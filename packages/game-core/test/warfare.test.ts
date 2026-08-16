import assert from "node:assert/strict";
import test from "node:test";
import {
  addArmies,
  armyUnitCount,
  battlePlanScore,
  emptyArmy,
  initialTroopLevels,
  resolveBattle,
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
