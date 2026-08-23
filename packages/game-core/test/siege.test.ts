import test from "node:test";
import assert from "node:assert/strict";

import {
  battleWallLevel,
  ramWallAfterBattle,
  siegeLevelsDestroyed,
  trebuchetDamage,
} from "../src/combat.ts";

test("the siege formula is one formula with two constants", () => {
  // [CONFIRMED] levelsDestroyed = round(units / (K x 1.09^targetLevel))
  // Rams K=4 against wall 20: 4 x 1.09^20 = 22.418, so 100 rams take 4 levels.
  assert.equal(siegeLevelsDestroyed(100, 4, 20), 4);
  assert.equal(siegeLevelsDestroyed(1000, 4, 20), 45);
  // Trebuchets K=3 against a level-10 building: 3 x 1.09^10 = 7.102.
  assert.equal(siegeLevelsDestroyed(50, 3, 10), 7);
  assert.equal(siegeLevelsDestroyed(0, 4, 20), 0);
});

test("rams knock the wall down BEFORE the battle, capped at half", () => {
  // The battle is scored against this temporary wall, not the standing one.
  assert.equal(battleWallLevel(20, 100), 16);
  // The half-cap rounds UP, so a wall can never be flattened by rams alone
  // before the fight - 20 -> 10 no matter how many rams arrive.
  assert.equal(battleWallLevel(20, 100_000), 10);
  // Odd levels round the cap up: half of 5 is 2.5, so the floor is 3.
  assert.equal(battleWallLevel(5, 100_000), 3);
});

test("zero rams reproduce the wall exactly", () => {
  // The regression that matters: siege must be invisible when nobody brought
  // any. Every battle in the game runs through this path.
  for (const level of [0, 1, 5, 10, 20]) {
    assert.equal(battleWallLevel(level, 0), level, `wall ${level} moved with no rams`);
  }
});

test("the permanent wall drop is scored against the ORIGINAL level", () => {
  // [CONFIRMED] targetLevel is fixed at the pre-attack level for the whole
  // attack - it does not decay as levels fall. This is why waves are cheaper
  // than one lump, and it is real strategy we get for free.
  //
  // Won: effective = sent + surviving. 100 sent, 60 home -> 160 / 22.418 = 7.
  assert.equal(ramWallAfterBattle({ wallLevel: 20, ramsSent: 100, ramsSurviving: 60, attackerWon: true, defenderLossFraction: 1 }), 13);
  // Lost: effective = sent x defenderLossFraction. 100 x 0.5 = 50 -> 2 levels.
  assert.equal(ramWallAfterBattle({ wallLevel: 20, ramsSent: 100, ramsSurviving: 0, attackerWon: false, defenderLossFraction: 0.5 }), 18);
});

test("the permanent drop has no half-cap and can raze a wall to nothing", () => {
  assert.equal(ramWallAfterBattle({ wallLevel: 5, ramsSent: 10_000, ramsSurviving: 10_000, attackerWon: true, defenderLossFraction: 1 }), 0);
});

test("a wall razed to zero still leaves a settlement defending itself", () => {
  // [CONFIRMED] the base-defence floor of 20 survives a destroyed wall, which
  // is why a lone Count dies attacking an empty village.
  assert.equal(battleWallLevel(0, 5_000), 0);
});

test("trebuchets floor the buildings a settlement cannot live without", () => {
  // [CONFIRMED] HQ, Farm and Warehouse floor at level 1 - a settlement can be
  // wrecked but never deleted.
  assert.equal(trebuchetDamage({ building: "hq", level: 10, trebuchets: 500 }), 1);
  assert.equal(trebuchetDamage({ building: "farm", level: 10, trebuchets: 500 }), 1);
  assert.equal(trebuchetDamage({ building: "warehouse", level: 10, trebuchets: 500 }), 1);
  // Everything else can be taken to nothing.
  assert.equal(trebuchetDamage({ building: "barracks", level: 10, trebuchets: 500 }), 0);
});

test("a trebuchet aimed at a building that is not there does nothing", () => {
  // [CONFIRMED] they do not retarget. Aiming at an Academy nobody built wastes
  // the whole wave, which is a real cost of bad scouting.
  assert.equal(trebuchetDamage({ building: "academy", level: 0, trebuchets: 500 }), 0);
});
