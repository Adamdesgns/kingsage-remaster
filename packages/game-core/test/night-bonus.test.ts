import test from "node:test";
import assert from "node:assert/strict";

import {
  NIGHT_BONUS_HOURS,
  NIGHT_BONUS_MULTIPLIER,
  DEFAULT_NIGHT_WINDOW_START,
  isNightBonusActive,
} from "../src/combat.ts";

test("the night bonus covers eight hours and doubles defence", () => {
  assert.equal(NIGHT_BONUS_HOURS, 8);
  assert.equal(NIGHT_BONUS_MULTIPLIER, 2);
});

test("KingsAge's own window is reproduced exactly when the start is zero", () => {
  // [CONFIRMED] 00:00-08:00. Setting every settlement's window to 0 gives the
  // source game's behaviour, so the per-player option is a POLICY switch rather
  // than a different mechanic.
  for (const hour of [0, 1, 5, 7]) {
    assert.equal(isNightBonusActive({ hour, windowStart: 0 }), true, `${hour}:00 should be night`);
  }
  for (const hour of [8, 12, 19, 23]) {
    assert.equal(isNightBonusActive({ hour, windowStart: 0 }), false, `${hour}:00 should be day`);
  }
});

test("a window that crosses midnight still works", () => {
  // 22:00-06:00 is the obvious pick for a lot of players, and it wraps.
  assert.equal(isNightBonusActive({ hour: 23, windowStart: 22 }), true);
  assert.equal(isNightBonusActive({ hour: 2, windowStart: 22 }), true);
  assert.equal(isNightBonusActive({ hour: 5, windowStart: 22 }), true);
  assert.equal(isNightBonusActive({ hour: 6, windowStart: 22 }), false);
  assert.equal(isNightBonusActive({ hour: 21, windowStart: 22 }), false);
});

test("every hour of the day is night for exactly one third of the clock", () => {
  // Whatever window a player picks, they get eight hours - never more.
  for (let windowStart = 0; windowStart < 24; windowStart += 1) {
    let nightHours = 0;
    for (let hour = 0; hour < 24; hour += 1) {
      if (isNightBonusActive({ hour, windowStart })) nightHours += 1;
    }
    assert.equal(nightHours, NIGHT_BONUS_HOURS, `window starting ${windowStart} gave ${nightHours} hours`);
  }
});

test("a nonsense window is clamped rather than trusted", () => {
  assert.equal(isNightBonusActive({ hour: 0, windowStart: -5 }), true);
  assert.equal(isNightBonusActive({ hour: 0, windowStart: 99 }), true);
});

test("the default window is KingsAge's, so nothing changes until Adam rules", () => {
  assert.equal(DEFAULT_NIGHT_WINDOW_START, 0);
});
