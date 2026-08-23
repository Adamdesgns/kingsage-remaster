import test from "node:test";
import assert from "node:assert/strict";

import {
  BREEDING_PAIR,
  accrueHorses,
  horseCapacity,
  horsesPerHour,
  cavalryConversion,
  planConversion,
} from "../src/horses.ts";

test("a Stable arrives with its breeding pair", () => {
  // [Adam, 2026-08-22] horses are BRED. Buying your first pair creates a dead
  // end: you save up, build an expensive Stable, cannot afford horses, and own
  // a building that does nothing. It would also gate a new system behind the
  // Market, which does not exist. A stable with no horses is not a stable.
  assert.equal(BREEDING_PAIR, 2);
});

test("no Stable, no horses", () => {
  assert.equal(horsesPerHour(0), 0);
  assert.equal(horseCapacity(0), 0);
});

test("horses come slowly at first and compound with the Stable", () => {
  // Cavalry has to stay elite. A level 1 Stable is roughly ten horses a day -
  // enough to feel real, nowhere near enough to field cavalry as your army.
  assert.ok(horsesPerHour(1) > 0 && horsesPerHour(1) < 1);
  assert.ok(horsesPerHour(20) > horsesPerHour(10));
  assert.ok(horsesPerHour(10) > horsesPerHour(1));
});

test("the stable can only hold so many, so horses must be used or wasted", () => {
  // The cap is the pressure that creates a market. A breeder at capacity is
  // losing production every hour they do not sell or spend, which is what makes
  // "sell to warlords" something you WANT rather than something we ask you to
  // do.
  assert.ok(horseCapacity(20) > horseCapacity(1));
  assert.equal(accrueHorses({ horses: horseCapacity(5), stableLevel: 5, hours: 100 }), horseCapacity(5));
});

test("time is the only input - you cannot buy your way to cavalry", () => {
  // The whole point: cavalry is RATE-limited, not cash-limited. A rich player
  // cannot turn a big bank into 500 Crusaders, because the horses do not exist
  // yet.
  // Kept under the Stable's capacity on purpose - past the cap BOTH readings
  // are the cap, which is the cap working rather than time failing.
  const afterFourHours = accrueHorses({ horses: 0, stableLevel: 10, hours: 4 });
  const afterEightHours = accrueHorses({ horses: 0, stableLevel: 10, hours: 8 });
  assert.ok(afterEightHours > afterFourHours, "waiting longer must be the only way to get more");
  assert.ok(afterEightHours < horseCapacity(10), "this case is meant to stay under the cap");
});

test("accrual never goes backwards or invents a horse", () => {
  assert.equal(accrueHorses({ horses: 5, stableLevel: 3, hours: 0 }), 5);
  assert.equal(accrueHorses({ horses: 5, stableLevel: 3, hours: -10 }), 5);
  assert.equal(accrueHorses({ horses: 5, stableLevel: 0, hours: 100 }), 5, "a razed Stable does not kill the herd");
});

test("horses are whole animals", () => {
  for (const hours of [0.5, 1.3, 7.7]) {
    const horses = accrueHorses({ horses: 0, stableLevel: 4, hours });
    assert.ok(Number.isInteger(horses), `${hours}h gave ${horses}`);
  }
});

test("cavalry cannot be trained from nothing - it is converted", () => {
  // [Adam] "the stables is to add horses to the troops to create cavalry."
  // A Crusader is a soldier you already hold, plus a horse. That single rule is
  // what makes cavalry rate-limited, and it is why raiding a Stable hurts for
  // weeks rather than minutes.
  assert.equal(cavalryConversion("lightCavalry")?.from, "axe");
  assert.equal(cavalryConversion("heavyCavalry")?.from, "sword");
  assert.equal(cavalryConversion("axe"), null, "infantry is not converted from anything");
  assert.equal(cavalryConversion("noble"), null);
});

test("a conversion consumes exactly one soldier and one horse each", () => {
  const plan = planConversion({ unit: "lightCavalry", quantity: 5, soldiers: 40, horses: 12 });
  assert.equal(plan.converted, 5);
  assert.equal(plan.soldiersUsed, 5);
  assert.equal(plan.horsesUsed, 5);
  assert.equal(plan.shortfall, null);
});

test("horses are the binding constraint, and the refusal says so", () => {
  // The moment a player feels this is the moment a breeder becomes worth
  // knowing. It has to name the horse, not mumble about resources.
  const plan = planConversion({ unit: "lightCavalry", quantity: 50, soldiers: 400, horses: 6 });
  assert.equal(plan.converted, 6);
  assert.equal(plan.shortfall, "horses");
});

test("but you still need the soldiers", () => {
  const plan = planConversion({ unit: "heavyCavalry", quantity: 50, soldiers: 3, horses: 900 });
  assert.equal(plan.converted, 3);
  assert.equal(plan.shortfall, "soldiers");
});

test("a conversion never invents a rider", () => {
  const plan = planConversion({ unit: "lightCavalry", quantity: 10, soldiers: 0, horses: 0 });
  assert.equal(plan.converted, 0);
  assert.equal(plan.soldiersUsed, 0);
  assert.equal(plan.horsesUsed, 0);
});
