import test from "node:test";
import assert from "node:assert/strict";

import { BUILDINGS, BUILDING_ORDER, SETTLEMENT_POINTS_CAP, settlementPoints } from "../src/economy.ts";
import {
  REALM_OF_POWER_ATTACK_CAP,
  REALM_OF_POWER_DROP_MAX,
  REALM_OF_POWER_DROP_MIN,
  REALM_OF_POWER_ON_CAPTURE,
  applyRealmOfPower,
  countSurvivesEscort,
  realmOfPowerRegen,
} from "../src/combat.ts";
import type { BuildingLevels } from "../src/contracts.ts";

function levels(fill: (max: number) => number): BuildingLevels {
  return BUILDING_ORDER.reduce((out, id) => {
    out[id] = fill(BUILDINGS[id].maxLevel);
    return out;
  }, {} as BuildingLevels);
}

test("a fully built settlement scores exactly the cap", () => {
  // Realm of Power scales to the settlement's points, so the cap is load-
  // bearing: it is what makes the 50% per-attack rule mean the same thing
  // everywhere. Our buildings reach 20-30 where KingsAge's reach 50, so the
  // per-level award is scaled rather than copied [OURS].
  assert.equal(settlementPoints(levels((max) => max)), SETTLEMENT_POINTS_CAP);
});

test("an empty settlement scores nothing, and points never exceed the cap", () => {
  assert.equal(settlementPoints(levels(() => 0)), 0);
  assert.ok(settlementPoints(levels((max) => max * 10)) <= SETTLEMENT_POINTS_CAP);
});

test("one attack can never remove more than half the maximum", () => {
  // [CONFIRMED] and the best rule in the whole system.
  const maximum = 10_000;
  const result = applyRealmOfPower({ current: maximum, maximum, survivingCounts: 1, seed: "cap" });
  assert.ok(result.value >= maximum / 2, `one attack took it to ${result.value}`);
});

test("a settlement therefore ALWAYS takes at least two attacks", () => {
  // However small it is. Ours could be taken by one lucky roll.
  for (const maximum of [200, 1_000, 4_000, 10_000]) {
    const first = applyRealmOfPower({ current: maximum, maximum, survivingCounts: 1, seed: `two-${maximum}` });
    assert.ok(first.value > 0, `a settlement worth ${maximum} fell to a single attack`);
  }
});

test("stacking Counts into one march is wasted", () => {
  // [CONFIRMED] only one Count per attack matters, so conquest must be
  // committed across TIME - which is what makes it a campaign and not a
  // purchase.
  const maximum = 10_000;
  const one = applyRealmOfPower({ current: maximum, maximum, survivingCounts: 1, seed: "stack" });
  const five = applyRealmOfPower({ current: maximum, maximum, survivingCounts: 5, seed: "stack" });
  assert.equal(five.value, one.value);
  assert.equal(five.countConsumed, 1, "an attack should never spend more than one Count");
});

test("a Count who did not survive moves nothing", () => {
  const maximum = 10_000;
  const result = applyRealmOfPower({ current: maximum, maximum, survivingCounts: 0, seed: "dead" });
  assert.equal(result.value, maximum);
  assert.equal(result.countConsumed, 0);
});

test("the drop sits in KingsAge's band and is deterministic", () => {
  for (let index = 0; index < 40; index += 1) {
    const result = applyRealmOfPower({ current: 10_000, maximum: 10_000, survivingCounts: 1, seed: `band-${index}` });
    const drop = 10_000 - result.value;
    assert.ok(drop >= REALM_OF_POWER_DROP_MIN && drop <= REALM_OF_POWER_DROP_MAX, `drop ${drop} outside the band`);
  }
  const a = applyRealmOfPower({ current: 9_000, maximum: 10_000, survivingCounts: 1, seed: "same" });
  const b = applyRealmOfPower({ current: 9_000, maximum: 10_000, survivingCounts: 1, seed: "same" });
  assert.equal(a.value, b.value, "the same battle must always give the same drop");
});

test("a settlement left alone recovers, so a stalled campaign loses ground", () => {
  // [CONFIRMED] +1% of maximum per hour. Ours never recovered at all, which
  // made defence entirely passive.
  assert.equal(realmOfPowerRegen({ current: 5_000, maximum: 10_000, hours: 1 }), 5_100);
  assert.equal(realmOfPowerRegen({ current: 5_000, maximum: 10_000, hours: 10 }), 6_000);
  assert.equal(realmOfPowerRegen({ current: 9_950, maximum: 10_000, hours: 100 }), 10_000, "regen must not overshoot");
});

test("a taken settlement is fragile, not fresh", () => {
  // [CONFIRMED] 30% of maximum, so the taker can be taken straight back.
  assert.equal(REALM_OF_POWER_ON_CAPTURE, 0.3);
  assert.equal(realmOfPowerRegen({ current: 10_000 * REALM_OF_POWER_ON_CAPTURE, maximum: 10_000, hours: 0 }), 3_000);
});

test("the Count dies when half the escort dies", () => {
  // [CONFIRMED] escort matters, and a Count sent alone never arrives.
  assert.equal(countSurvivesEscort({ sent: 100, survived: 60 }), true);
  // [CONFIRMED] "the Count dies when 50% of the attacking army dies" - so at
  // exactly half lost he is dead. The boundary is stated in the source, not
  // left to whoever reads the comparison next.
  assert.equal(countSurvivesEscort({ sent: 100, survived: 51 }), true);
  assert.equal(countSurvivesEscort({ sent: 100, survived: 50 }), false);
  assert.equal(countSurvivesEscort({ sent: 0, survived: 0 }), false, "a Count sent alone is a dead Count");
});

test("the per-attack cap is a share, not a number", () => {
  assert.equal(REALM_OF_POWER_ATTACK_CAP, 0.5);
});
