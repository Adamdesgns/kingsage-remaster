import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILDINGS,
  armyPopulation,
  buildingCost,
  buildingRequirementProblem,
  populationCapacity,
  productionPerHour,
  researchRequirementProblem,
  storageCapacity,
  troopRequirementProblem,
  type BuildingLevels,
} from "../src/index.ts";
import { emptyArmy } from "../src/contracts.ts";

function levels(update: Partial<BuildingLevels> = {}): BuildingLevels {
  return {
    hq: 1, timber: 1, quarry: 1, iron: 1, farm: 1, warehouse: 1, barracks: 1,
    wall: 1, academy: 0, stable: 0, workshop: 0, smithy: 0, market: 0, ...update,
  };
}

test("the remaster economy preserves the original compounding building rhythm", () => {
  assert.deepEqual(buildingCost("barracks", 1), { wood: 280, stone: 238, iron: 126 });
  assert.deepEqual(buildingCost("timber", 1), { wood: 75, stone: 90, iron: 60 });
  assert.equal(productionPerHour(1), 28);
  assert.equal(storageCapacity(1), 1464);
  assert.equal(populationCapacity(1), 232);
});

test("the progression ladder gates advanced buildings and troop families", () => {
  assert.equal(buildingRequirementProblem("smithy", levels()), "Requires Headquarters level 3.");
  assert.equal(buildingRequirementProblem("smithy", levels({ hq: 3, barracks: 3 })), null);
  assert.equal(troopRequirementProblem("scout", levels()), "Requires Stable level 1.");
  assert.equal(troopRequirementProblem("scout", levels({ stable: 1 })), null);
  assert.equal(researchRequirementProblem("spear", 2, levels()), "Requires Smithy level 1.");
  assert.equal(researchRequirementProblem("spear", 2, levels({ smithy: 1 })), null);
  assert.equal(BUILDINGS.academy.maxLevel, 3);
});

test("population is derived from authoritative troop definitions", () => {
  const army = { ...emptyArmy(), spear: 10, scout: 2, lightCavalry: 3, ram: 1, noble: 1 };
  assert.equal(armyPopulation(army), 10 + 4 + 12 + 5 + 25);
});
