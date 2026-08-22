import test from "node:test";
import assert from "node:assert/strict";

import { createTwoPlayerWorldFixture } from "../src/fixture.ts";
import { FREEHOLD_COUNT, FREEHOLD_GARRISON } from "../src/fixture.ts";
import { armyPower, armyUnitCount } from "../src/warfare.ts";
import { initialTroopLevels } from "../src/contracts.ts";

test("a new world contains Freeholds", () => {
  // [CONFIRMED] KingsAge's own on-ramp: abandoned settlements are the designed
  // first conquest. Now that a kingdom starts with no troops, they are the only
  // thing a new player could ever take.
  const world = createTwoPlayerWorldFixture();
  const freeholds = world.kingdoms.filter((k) => k.seatKind === "freehold");
  assert.equal(freeholds.length, FREEHOLD_COUNT);
  assert.ok(FREEHOLD_COUNT > 0);
});

test("a Freehold is not a claimable player seat", () => {
  // findOpenSeat() claims `seat_kind = 'ai'`. If a Freehold were an AI seat, a
  // new player would be seated INTO the thing they are supposed to conquer.
  const world = createTwoPlayerWorldFixture();
  for (const kingdom of world.kingdoms) {
    if (kingdom.seatKind !== "freehold") continue;
    assert.equal(kingdom.controllerPlayerId, null);
    assert.notEqual(kingdom.seatKind, "ai");
  }
});

test("a Freehold garrison is beatable by an army a new player can field", () => {
  // The whole point of the first rung: reachable, not free. A starting kingdom
  // has NO troops, so this has to be beatable by an early barracks army.
  const world = createTwoPlayerWorldFixture();
  const freeholdKingdomIds = new Set(
    world.kingdoms.filter((k) => k.seatKind === "freehold").map((k) => k.id),
  );
  const villages = world.villages.filter((v) => freeholdKingdomIds.has(v.kingdomId));
  assert.ok(villages.length > 0);

  const levels = initialTroopLevels();
  // ~25 Axemen is a realistic first offensive army from a level-3 barracks.
  const earlyArmy = { spear: 0, sword: 0, axe: 25, archer: 0, scout: 0, lightCavalry: 0, ram: 0, noble: 0 };
  const attack = armyPower(earlyArmy, levels, "attack");

  for (const village of villages) {
    const defence = armyPower(village.army, levels, "defense") * (1 + village.buildings.wall * 0.08);
    assert.ok(
      attack > defence,
      `Freehold ${village.name} defends at ${defence.toFixed(0)} but an early army only attacks at ${attack.toFixed(0)}`,
    );
    // Reachable, but not empty - it must still cost something to take.
    assert.ok(armyUnitCount(village.army) > 0, "a Freehold with no garrison is a free village, not a first rung");
  }
});

test("Freeholds carry a garrison, not a fortress", () => {
  assert.ok(armyUnitCount(FREEHOLD_GARRISON) > 0);
});
