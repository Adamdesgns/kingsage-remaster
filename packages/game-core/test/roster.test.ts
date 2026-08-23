import test from "node:test";
import assert from "node:assert/strict";

import { TROOPS, TROOP_ORDER } from "../src/economy.ts";
import { UNITS, UNIT_ORDER } from "../src/combat.ts";

test("every unit the combat engine knows is a unit you can build", () => {
  // The engine shipped with 11 units while the game could only recruit 8, so
  // three of them existed only in battle maths nobody could reach.
  assert.deepEqual([...TROOP_ORDER].sort(), [...UNIT_ORDER].sort());
});

test("combat stats have ONE source of truth", () => {
  // economy.TROOPS used to carry its own attack/defense numbers. After slice 1b
  // combat.UNITS decides every fight, so those fields were decorative - tuning
  // them would have changed nothing, silently. They must agree by construction.
  for (const id of UNIT_ORDER) {
    assert.equal(TROOPS[id].attack, UNITS[id].attack, `${id} attack drifted`);
    assert.equal(TROOPS[id].carry, UNITS[id].carry, `${id} carry drifted`);
    assert.equal(TROOPS[id].population, UNITS[id].population, `${id} population drifted`);
  }
});

test("everything trains at the Barracks - Adam's ruling", () => {
  // "The barracks is always where troops are trained. The smith is to upgrade
  // their armor, the stables is to add horses." Function unified, fiction
  // distributed: the other buildings are prerequisites you can see standing in
  // the settlement, not menus you have to walk to.
  for (const id of TROOP_ORDER) {
    assert.equal(TROOPS[id].recruiter, "barracks", `${id} still trains somewhere else`);
  }
});

test("the buildings that matter still gate the troops that need them", () => {
  // Unified does not mean free: a Crusader still needs a Stable standing.
  assert.ok((TROOPS.lightCavalry.requires?.stable ?? 0) > 0, "cavalry without a Stable");
  assert.ok((TROOPS.heavyCavalry.requires?.stable ?? 0) > 0, "heavy cavalry without a Stable");
  assert.ok((TROOPS.ram.requires?.workshop ?? 0) > 0, "siege without a Workshop");
  assert.ok((TROOPS.trebuchet.requires?.workshop ?? 0) > 0, "siege without a Workshop");
  assert.ok((TROOPS.noble.requires?.academy ?? 0) > 0, "a Count without an Academy");
  // The Militia is the floor: it must need nothing but the Barracks itself.
  assert.deepEqual(TROOPS.militia.requires ?? {}, {});
});
