import test from "node:test";
import assert from "node:assert/strict";

import { UNITS, UNIT_ORDER, attackByClass, wallFactor, defenceByClass, resolveBattleKingsAge, armySpeed } from "../src/combat.ts";

test("the roster carries all eleven KingsAge units", () => {
  assert.equal(UNIT_ORDER.length, 11);
});

test("attack value is grouped by the attacking unit's class", () => {
  // 572 Berserkers (infantry, 350 attack) + 333 Black Knights (cavalry, 600).
  const shares = attackByClass({ axe: 572, heavyCavalry: 333 });

  assert.equal(shares.infantry, 572 * 350);
  assert.equal(shares.cavalry, 333 * 600);
  assert.equal(shares.archer, 0);
});

test("the wall is exponential, not linear: 1.04^20 is 220% at level 20", () => {
  assert.equal(wallFactor(0), 1);
  assert.ok(Math.abs(wallFactor(20) - 2.1911) < 0.0001);
  assert.ok(Math.abs(wallFactor(10) - 1.4802) < 0.0001);
});

test("the defending army is CLONED into three sub-armies, never divided", () => {
  // 1000 Squires (def 100 inf / 200 cav / 300 arch) behind no wall, against an
  // attacker split 50/50 infantry/cavalry by attack value.
  const defence = defenceByClass({
    defender: { spear: 1000 },
    shares: { infantry: 0.5, cavalry: 0.5, archer: 0 },
    wallLevel: 0,
    nightBonus: false,
  });

  // Each sub-battle faces HALF the army at that class's defence value. The
  // same 1000 Squires appear in both battles - that is the cloning.
  assert.equal(defence.infantry, 1000 * 0.5 * 100 + 20 * 0.5);
  assert.equal(defence.cavalry, 1000 * 0.5 * 200 + 20 * 0.5);
  assert.equal(defence.archer, 0);
});

test("an empty settlement still defends itself", () => {
  // Why a lone Count dies attacking nobody. [CONFIRMED] the floor survives a
  // razed wall; [SIM] the 20 + 50xL curve itself is Tribal Wars' and unmeasured
  // for KingsAge.
  const defence = defenceByClass({
    defender: {},
    shares: { infantry: 1, cavalry: 0, archer: 0 },
    wallLevel: 0,
    nightBonus: false,
  });
  assert.equal(defence.infantry, 20);
});

test("the night bonus doubles troop defence but never the base floor", () => {
  const day = defenceByClass({ defender: { spear: 100 }, shares: { infantry: 1, cavalry: 0, archer: 0 }, wallLevel: 0, nightBonus: false });
  const night = defenceByClass({ defender: { spear: 100 }, shares: { infantry: 1, cavalry: 0, archer: 0 }, wallLevel: 0, nightBonus: true });

  assert.equal(day.infantry, 100 * 100 + 20);
  assert.equal(night.infantry, 100 * 100 * 2 + 20);
});

test("the winner of a sub-battle loses (loser/winner)^1.5 of its force", () => {
  // The reference run: 572 Berserkers (200,200 infantry attack) against 1000
  // Squires behind no wall. Defence = 1000 x 100 + 20 = 100,020.
  // Attacker loss = (100020/200200)^1.5 = 0.35309 -> 202 dead, 370 home.
  const result = resolveBattleKingsAge({
    attacker: { axe: 572 },
    defender: { spear: 1000 },
    wallLevel: 0,
  });

  assert.equal(result.winner, "attacker");
  assert.equal(result.defenderSurvivors.spear ?? 0, 0);
  assert.equal(result.attackerSurvivors.axe, 370);
});

test("a losing attacker is wiped and the defender pays the exponent instead", () => {
  // Same defenders, a tenth of the attackers: 57 Berserkers = 19,950 attack
  // against 100,020 defence. Defender loses (19950/100020)^1.5 = 0.08906.
  const result = resolveBattleKingsAge({
    attacker: { axe: 57 },
    defender: { spear: 1000 },
    wallLevel: 0,
  });

  assert.equal(result.winner, "defender");
  assert.equal(result.attackerSurvivors.axe, 0);
  assert.equal(result.defenderSurvivors.spear, 910);
});

test("a tie resolves to the defender", () => {
  // [OURS] The real script is unpublished. A defender-favouring tie is the
  // conventional and safer choice - it can never hand out a free conquest.
  const result = resolveBattleKingsAge({
    attacker: { militia: 1 },   // 20 attack
    defender: {},               // base defence at wall 0 is exactly 20
    wallLevel: 0,
  });

  assert.equal(result.winner, "defender");
  assert.equal(result.attackerSurvivors.militia, 0);
});

test("counters bite: identical raw attack, opposite outcome, decided by class", () => {
  // This is the whole reason for the rewrite. Under the old flat-power model
  // these two armies were interchangeable - same attack total, same result,
  // so the only question a player ever had was "how much attack can I afford".
  const garrison = { spear: 1000 };   // 100 vs infantry, 200 vs cavalry

  const infantry = resolveBattleKingsAge({
    attacker: { axe: 515 },           // 180,250 attack, INFANTRY
    defender: garrison,
    wallLevel: 0,
  });
  const cavalry = resolveBattleKingsAge({
    attacker: { lightCavalry: 200 },  // 180,000 attack, CAVALRY
    defender: garrison,
    wallLevel: 0,
  });

  assert.equal(infantry.winner, "attacker");
  assert.equal(cavalry.winner, "defender");
});

test("shares are by attack value, not by population", () => {
  // A 1-population Berserker (350 atk) commands more of the battle than a
  // 6-population Black Knight (600 atk) per unit of population spent.
  const shares = attackByClass({ axe: 6, heavyCavalry: 1 });
  assert.equal(shares.infantry, 2100);   // 6 population -> 2100 attack
  assert.equal(shares.cavalry, 600);     // 6 population -> 600 attack
  assert.ok(shares.infantry > shares.cavalry);
});

test("an army marches at its slowest unit", () => {
  // Crusaders ride at 10, but a Trebuchet in the baggage train pins the whole
  // column to 30.
  assert.equal(armySpeed({ lightCavalry: 500 }), 10);
  assert.equal(armySpeed({ lightCavalry: 500, trebuchet: 1 }), 30);
  assert.equal(armySpeed({}), 0);
});

test("morale floors a giant's attack on a small player", () => {
  // At 30% morale the same army brings 30% of its attack value.
  const full = resolveBattleKingsAge({ attacker: { axe: 400 }, defender: { spear: 1000 }, wallLevel: 0, morale: 1 });
  const crushed = resolveBattleKingsAge({ attacker: { axe: 400 }, defender: { spear: 1000 }, wallLevel: 0, morale: 0.3 });

  assert.equal(full.winner, "attacker");      // 140,000 vs 100,020
  assert.equal(crushed.winner, "defender");   //  42,000 vs 100,020
});

test("rounds terminate: a near-perfect stalemate still resolves", () => {
  const result = resolveBattleKingsAge({
    attacker: { axe: 286 },
    defender: { spear: 1000 },
    wallLevel: 0,
  });
  assert.ok(result.rounds <= 10, `expected <= 10 rounds, got ${result.rounds}`);
});

test("a mixed outcome fights a second round from the survivors", () => {
  // [CONFIRMED] rounds are real - the official worked example runs two.
  // 300 Berserkers (105,000 infantry) + 50 Crusaders (45,000 cavalry) = 150,000
  // against 1000 Squires: enough to beat their 100,000 infantry defence but not
  // their 200,000 cavalry defence. The riders die, the foot wins, and because
  // BOTH sides still hold troops the shares are recomputed and it goes again.
  const result = resolveBattleKingsAge({
    attacker: { axe: 300, lightCavalry: 50 },
    defender: { spear: 1000 },
    wallLevel: 0,
  });

  assert.equal(result.rounds, 2);
  assert.equal(result.attackerSurvivors.lightCavalry, 0);
  assert.ok(result.attackerSurvivors.axe > 0);
  assert.equal(result.winner, "attacker");
});

test("the wall changes who wins, on the real exponential curve", () => {
  // 1100 Berserkers = 385,000 vs 1000 Squires' 100,000 infantry defence.
  // At wall 20 that defence becomes 100,000 x 1.04^20 = 219,112 - still lost.
  // Push the wall's work far enough and the same army fails.
  const open = resolveBattleKingsAge({ attacker: { axe: 300 }, defender: { spear: 1000 }, wallLevel: 0 });
  const walled = resolveBattleKingsAge({ attacker: { axe: 300 }, defender: { spear: 1000 }, wallLevel: 20 });

  assert.equal(open.winner, "attacker");    // 105,000 vs 100,020
  assert.equal(walled.winner, "defender");  // 105,000 vs 219,132
});

test("a garrison of Spies is not a free village", () => {
  // [CONFIRMED] official InnoGames unit-type article: the Scout is CAVALRY.
  // We had it excluded from combat entirely, which made 500 Spies defend with
  // nothing but the base floor - an empty-looking village that is not empty.
  assert.equal(UNITS.scout.combatClass, "cavalry");

  const defence = defenceByClass({
    defender: { scout: 500 },
    shares: { infantry: 0, cavalry: 1, archer: 0 },
    wallLevel: 0,
    nightBonus: false,
  });
  assert.equal(defence.cavalry, 500 * 5 + 20);
});
