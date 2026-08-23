/**
 * KingsAge combat — the real thing.
 *
 * Everything here is derived from `docs/superpowers/specs/
 * 2026-08-22-combat-and-army-design.md`, which in turn comes from Gameforge's
 * still-live KingsAge help pages. The engine our game shipped with was a flat
 * power sum: a *different, simpler game* that happened to share KingsAge's
 * economy curves. This module replaces the maths, not the fiction.
 *
 * Tag discipline is carried over from the spec and MUST be preserved:
 *   [CONFIRMED] — stated by an official source, cross-checked twice.
 *   [INFERRED]  — reconstructed; reproduces official data but never published.
 *   [OURS]      — our decision, owed to nobody.
 *   [SIM]       — awaiting measurement in the live KingsAge battle simulator.
 */

export type CombatClass = "infantry" | "cavalry" | "archer";

export type UnitId =
  | "militia" | "spear" | "sword" | "axe" | "archer" | "scout"
  | "lightCavalry" | "heavyCavalry" | "ram" | "trebuchet" | "noble";

export type UnitDefinition = {
  id: UnitId;
  name: string;
  /**
   * [INFERRED] — and this is the single biggest inference in the whole design.
   * KingsAge never published which units defend as which class; this table is
   * reconstructed from the unit IDs KingsAge inherited from Tribal Wars.
   *
   * [CONFIRMED] by the official InnoGames unit-type article, which assigns
   * every unit in this engine family: infantry = Spear/Sword/Axe/siege/Noble/
   * Militia, cavalry = Scout/Light cavalry/Heavy cavalry, archers = Archer.
   * Ten of our eleven were inferred correctly; the Spy was not - we had it
   * outside combat entirely, so a garrison of Spies defended with nothing.
   *
   * The Spy ALSO fights its own battle before the main one (spec phase 2).
   * That phase is not built yet; being cavalry here is the defensive half.
   *
   * [SIM] Run block 1 of `docs/design/2026-08-22-simulator-run-sheet.md` to
   * replace this column with measured fact. Correcting a unit is a one-line
   * change here and nowhere else — that is deliberate.
   */
  combatClass: CombatClass | null;
  attack: number;
  defInfantry: number;
  defCavalry: number;
  defArcher: number;
  /** Minutes per tile. HIGHER IS SLOWER. An army marches at its maximum. */
  speed: number;
  carry: number;
  population: number;
};

/** [CONFIRMED] every number below except `combatClass`. */
export const UNITS: Record<UnitId, UnitDefinition> = {
  militia:      { id: "militia",      name: "Farmer's Militia", combatClass: "infantry", attack:  20, defInfantry:   40, defCavalry:   30, defArcher:    5, speed: 20, carry:  5, population:   1 },
  spear:        { id: "spear",        name: "Squire",           combatClass: "infantry", attack:  50, defInfantry:  100, defCavalry:  200, defArcher:  300, speed: 18, carry: 25, population:   1 },
  sword:        { id: "sword",        name: "Templar",          combatClass: "infantry", attack: 100, defInfantry:  300, defCavalry:  100, defArcher:  200, speed: 22, carry: 15, population:   1 },
  axe:          { id: "axe",          name: "Berserker",        combatClass: "infantry", attack: 350, defInfantry:   70, defCavalry:   50, defArcher:   50, speed: 18, carry: 10, population:   1 },
  archer:       { id: "archer",       name: "Long-bow",         combatClass: "archer",   attack: 150, defInfantry:  400, defCavalry:  150, defArcher:  100, speed: 18, carry: 10, population:   1 },
  scout:        { id: "scout",        name: "Spy",              combatClass: "cavalry",  attack:   1, defInfantry:   10, defCavalry:    5, defArcher:    7, speed:  9, carry:  0, population:   2 },
  lightCavalry: { id: "lightCavalry", name: "Crusader",         combatClass: "cavalry",  attack: 900, defInfantry:  200, defCavalry:  300, defArcher:  300, speed: 10, carry: 80, population:   4 },
  heavyCavalry: { id: "heavyCavalry", name: "Black Knight",     combatClass: "cavalry",  attack: 600, defInfantry: 1500, defCavalry: 1000, defArcher: 1000, speed: 11, carry: 50, population:   6 },
  ram:          { id: "ram",          name: "Battering Ram",    combatClass: "infantry", attack: 100, defInfantry:  100, defCavalry:  200, defArcher:   20, speed: 30, carry:  0, population:   5 },
  trebuchet:    { id: "trebuchet",    name: "Trebuchet",        combatClass: "infantry", attack: 500, defInfantry:  400, defCavalry:  100, defArcher:  200, speed: 30, carry:  0, population:   8 },
  noble:        { id: "noble",        name: "Count",            combatClass: "infantry", attack: 100, defInfantry:  300, defCavalry:  100, defArcher:  200, speed: 35, carry:  0, population: 100 },
};

export const UNIT_ORDER: readonly UnitId[] = [
  "militia", "spear", "sword", "axe", "archer", "scout",
  "lightCavalry", "heavyCavalry", "ram", "trebuchet", "noble",
];

/** A force. Absent units are zero, so callers write only what they brought. */
export type Force = Partial<Record<UnitId, number>>;

export type ByClass = { infantry: number; cavalry: number; archer: number };

/**
 * Step 1 of the round: attacker strength per class.
 *
 * [CONFIRMED] The split is by ATTACK VALUE — not population, not headcount.
 * That distinction is load-bearing: a 1-population Berserker (350 attack)
 * commands more of the battle than a 6-population Black Knight per unit of
 * population spent.
 */
export function attackByClass(force: Force): ByClass {
  const totals: ByClass = { infantry: 0, cavalry: 0, archer: 0 };
  for (const id of UNIT_ORDER) {
    const count = force[id] ?? 0;
    if (count <= 0) continue;
    const unit = UNITS[id];
    if (unit.combatClass === null) continue; // Spies fight their own battle.
    totals[unit.combatClass] += count * unit.attack;
  }
  return totals;
}

/**
 * [CONFIRMED] KingsAge: `1.04 ^ level` — 100% at level 0 rising to 220% at
 * level 20.
 *
 * Our shipped wall was `1 + 0.08 x level`: linear, reaching 260% at level 20,
 * which is stronger than either source game AND wrong in shape. Tribal Wars
 * uses 1.037; we take KingsAge's 1.04 because that is the game we are copying.
 */
export function wallFactor(wallLevel: number): number {
  return Math.pow(1.04, Math.max(0, wallLevel));
}

/**
 * [CONFIRMED for Tribal Wars], [SIM] for KingsAge — its help never mentions
 * base defence at all. A settlement defends itself with no troops in it, which
 * is precisely why a lone Count dies attacking an empty village.
 *
 * [CONFIRMED] razing the wall to 0 leaves the floor of 20 standing.
 */
export function baseDefence(wallLevel: number): number {
  return 20 + 50 * Math.max(0, wallLevel);
}

/** [CONFIRMED] The night bonus doubles defence between 00:00 and 08:00. */
export const NIGHT_BONUS_MULTIPLIER = 2;

/**
 * Step 2 of the round — and the heart of the whole system.
 *
 * The defending army is **cloned**, not divided. Every defender appears in all
 * three sub-battles, weighted by the attacker's attack-value share for that
 * class, and defends with its stat *against that class*. The three defence
 * values are never collapsed into one number, which is exactly what our old
 * flat-power model did.
 *
 * [CONFIRMED] the night bonus scales troop defence but NOT the base floor.
 * [SIM] whether `wallFactor` also multiplies the base floor is undocumented —
 * runs 4.4/4.5 of the simulator run sheet settle it. Until then we follow the
 * official pseudocode literally: it does not.
 */
export function defenceByClass(input: {
  defender: Force;
  shares: ByClass;
  wallLevel: number;
  nightBonus: boolean;
}): ByClass {
  const wall = wallFactor(input.wallLevel);
  const night = input.nightBonus ? NIGHT_BONUS_MULTIPLIER : 1;
  const floor = baseDefence(input.wallLevel);

  const result: ByClass = { infantry: 0, cavalry: 0, archer: 0 };
  for (const combatClass of ["infantry", "cavalry", "archer"] as const) {
    const share = input.shares[combatClass];
    if (share <= 0) continue;

    let troops = 0;
    for (const id of UNIT_ORDER) {
      const count = input.defender[id] ?? 0;
      if (count <= 0) continue;
      const unit = UNITS[id];
      if (unit.combatClass === null) continue; // Spies fight their own battle.
      const versus = combatClass === "infantry" ? unit.defInfantry
        : combatClass === "cavalry" ? unit.defCavalry
        : unit.defArcher;
      troops += count * share * versus;
    }
    result[combatClass] = troops * wall * night + floor * share;
  }
  return result;
}

/**
 * [OURS] Cap rounds to bound server work. Real battles converge in 1-3; the cap
 * only ever bites on a near-perfect stalemate.
 * [SIM] confirm the real engine has no lower cap.
 */
export const MAX_ROUNDS = 10;

/** [CONFIRMED] two independent ways. The exponent is not a tuning knob. */
export const CASUALTY_EXPONENT = 1.5;

export type BattleSide = "attacker" | "defender";

export type KingsAgeBattleResult = {
  winner: BattleSide;
  rounds: number;
  attackerSurvivors: Record<UnitId, number>;
  defenderSurvivors: Record<UnitId, number>;
  attackerCasualties: Record<UnitId, number>;
  defenderCasualties: Record<UnitId, number>;
};

function toCounts(force: Force): Record<UnitId, number> {
  return UNIT_ORDER.reduce((out, id) => {
    out[id] = Math.max(0, force[id] ?? 0);
    return out;
  }, {} as Record<UnitId, number>);
}

/**
 * Survivors round to NEAREST, never above what was sent.
 *
 * Flooring looks safer and is not. A single Count who loses 5% of himself
 * floors to zero and dies in a battle he barely fought - and conquest rides on
 * Counts arriving in ones and twos, so flooring silently makes conquest
 * unreachable in play. It punishes exactly the small elite stacks the game is
 * built around, on every single battle, in the attacker's disfavour.
 *
 * Nearest is unbiased instead of biased, and the `Math.min` keeps the property
 * that actually matters: the engine can never return more soldiers than were
 * sent.
 */
function settle(counts: Record<UnitId, number>, sent: Record<UnitId, number>): Record<UnitId, number> {
  return UNIT_ORDER.reduce((out, id) => {
    out[id] = Math.min(sent[id], Math.max(0, Math.round(counts[id])));
    return out;
  }, {} as Record<UnitId, number>);
}

function fightingUnits(counts: Record<UnitId, number>): number {
  return UNIT_ORDER.reduce(
    (total, id) => (UNITS[id].combatClass === null ? total : total + counts[id]),
    0,
  );
}

/**
 * A KingsAge battle is three battles at once.
 *
 * The defending army is cloned into three fractional sub-armies split by the
 * ATTACKER's attack-value share per class. Three independent battles resolve in
 * parallel, in rounds, each side losing `(loser/winner)^1.5`. The three defence
 * values are never collapsed into one.
 *
 * This is the mechanic our shipped engine got wrong, and getting it wrong is
 * what made every troop interchangeable: with one flat defence number, the only
 * question a player ever had to answer was "how much attack can I afford", and
 * the answer was always Axemen.
 */
export function resolveBattleKingsAge(input: {
  attacker: Force;
  defender: Force;
  wallLevel: number;
  nightBonus?: boolean;
  /** [CONFIRMED] floors a giant's attack on a small player at 30%. */
  morale?: number;
  /** [CONFIRMED] +/-25%. Pass 0 for a deterministic battle. */
  luck?: number;
  /**
   * Armour. [OURS, Adam 2026-08-22] The Smithy upgrades armour, so our troop
   * levels scale DEFENCE ONLY - attack stays purely about what you brought.
   * KingsAge itself has no combat research; this is the system Adam's Smithy
   * ruling rescued rather than deleted.
   */
  defenceMultiplier?: number;
}): KingsAgeBattleResult {
  const attackerStart = toCounts(input.attacker);
  const defenderStart = toCounts(input.defender);
  let attacker = { ...attackerStart };
  let defender = { ...defenderStart };

  const morale = input.morale ?? 1;
  const luck = input.luck ?? 0;
  const modifier = morale * (1 + luck);

  let rounds = 0;
  while (rounds < MAX_ROUNDS && fightingUnits(attacker) > 0) {
    rounds += 1;

    const raw = attackByClass(attacker);
    const attack: ByClass = {
      infantry: raw.infantry * modifier,
      cavalry: raw.cavalry * modifier,
      archer: raw.archer * modifier,
    };
    const totalAttack = attack.infantry + attack.cavalry + attack.archer;
    if (totalAttack <= 0) break;

    const shares: ByClass = {
      infantry: attack.infantry / totalAttack,
      cavalry: attack.cavalry / totalAttack,
      archer: attack.archer / totalAttack,
    };
    const rawDefence = defenceByClass({
      defender,
      shares,
      wallLevel: input.wallLevel,
      nightBonus: input.nightBonus ?? false,
    });
    const armour = input.defenceMultiplier ?? 1;
    const defence: ByClass = {
      infantry: rawDefence.infantry * armour,
      cavalry: rawDefence.cavalry * armour,
      archer: rawDefence.archer * armour,
    };

    // Three independent battles, resolved in parallel off the SAME snapshot.
    //
    // NOTE for anyone tempted to simplify this: `share[c]` appears on BOTH
    // sides, so it cancels in the win/lose comparison -
    //   A[c] = share[c] x totalAttack
    //   D[c] = share[c] x (fullArmyDefence_vs_c x wall x night + base)
    // which means each sub-battle really asks "total attack vs the WHOLE
    // garrison's defence at this class". The split does not decide who wins a
    // sub-battle; it decides how heavily each sub-battle weighs in the
    // casualties. Both facts matter and neither is obvious. Do not "optimise"
    // the share out - the casualty weighting needs it.
    const attackerLoss: ByClass = { infantry: 0, cavalry: 0, archer: 0 };
    let defenderLossFraction = 0;
    for (const combatClass of ["infantry", "cavalry", "archer"] as const) {
      const a = attack[combatClass];
      const d = defence[combatClass];
      if (a <= 0) continue;
      if (a > d) {
        // [OURS] strictly greater - a tie resolves to the defender.
        attackerLoss[combatClass] = Math.pow(d / a, CASUALTY_EXPONENT);
        defenderLossFraction += shares[combatClass] * 1;
      } else {
        attackerLoss[combatClass] = 1;
        defenderLossFraction += shares[combatClass] * Math.pow(a / d, CASUALTY_EXPONENT);
      }
    }

    const survivingDefenderFraction = Math.max(0, 1 - defenderLossFraction);
    for (const id of UNIT_ORDER) {
      const unit = UNITS[id];
      if (unit.combatClass !== null) {
        attacker[id] = attacker[id] * (1 - attackerLoss[unit.combatClass]);
        defender[id] = defender[id] * survivingDefenderFraction;
      }
    }

    if (fightingUnits(defender) < 1 || fightingUnits(attacker) < 1) break;
  }

  const attackerSurvivors = settle(attacker, attackerStart);
  const defenderSurvivors = settle(defender, defenderStart);
  // The attacker must clear the field AND still be standing on it. An attacker
  // wiped out by an empty settlement's base defence has taken nothing - both
  // sides at zero is a defender hold, not a conquest.
  const attackerHolds = fightingUnits(attackerSurvivors) > 0;
  const fieldCleared = fightingUnits(defenderSurvivors) < 1;
  const winner: BattleSide = attackerHolds && fieldCleared ? "attacker" : "defender";

  return {
    winner,
    rounds,
    attackerSurvivors,
    defenderSurvivors,
    attackerCasualties: UNIT_ORDER.reduce((out, id) => {
      out[id] = attackerStart[id] - attackerSurvivors[id];
      return out;
    }, {} as Record<UnitId, number>),
    defenderCasualties: UNIT_ORDER.reduce((out, id) => {
      out[id] = defenderStart[id] - defenderSurvivors[id];
      return out;
    }, {} as Record<UnitId, number>),
  };
}

/**
 * [CONFIRMED] An army marches at its SLOWEST unit. Speed is minutes per tile,
 * so the column is pinned by the maximum.
 *
 * This is a real strategic texture we currently do not have: a Trebuchet in the
 * baggage train (30) drags a Crusader raid (10) to a third of its pace, which
 * is why siege goes in its own wave.
 */
export function armySpeed(force: Force): number {
  return UNIT_ORDER.reduce(
    (slowest, id) => ((force[id] ?? 0) > 0 ? Math.max(slowest, UNITS[id].speed) : slowest),
    0,
  );
}

// ---------------------------------------------------------------------------
// Siege
// ---------------------------------------------------------------------------

/**
 * [CONFIRMED] Both siege units share ONE formula with a different constant,
 * verified against 30/30 rows of the official chart and two live battle
 * reports:
 *
 *   levelsDestroyed = round( units / (K x 1.09 ^ targetLevel) )
 *
 * `targetLevel` is fixed at the PRE-ATTACK level for the whole attack - it does
 * not decay as levels fall. That is why waves are cheaper than one lump, and it
 * is real strategic texture we get for free rather than having to invent.
 */
export const RAM_CONSTANT = 4;
export const TREBUCHET_CONSTANT = 3;
export const SIEGE_LEVEL_BASE = 1.09;

export function siegeLevelsDestroyed(units: number, constant: number, targetLevel: number): number {
  if (units <= 0) return 0;
  const resistance = constant * Math.pow(SIEGE_LEVEL_BASE, Math.max(0, targetLevel));
  return Math.round(units / resistance);
}

/**
 * The wall the battle is actually scored against. [CONFIRMED] Rams hit twice,
 * and this is the first hit: temporary, capped at half the wall, rounding UP.
 *
 * The cap is what stops rams alone from deciding a siege - no quantity of them
 * opens a level-20 wall below 10 for the fight itself. Flattening it takes
 * winning first, which is the second hit.
 */
export function battleWallLevel(wallLevel: number, rams: number): number {
  const standing = Math.max(0, wallLevel);
  if (rams <= 0) return standing;
  const drop = siegeLevelsDestroyed(rams, RAM_CONSTANT, standing);
  return Math.max(standing - drop, Math.ceil(standing / 2));
}

/**
 * The second hit: permanent, uncapped, and it can take a wall to zero.
 *
 * [CONFIRMED] A winning attacker counts each ram twice - once for arriving and
 * once for surviving - while a beaten one still does damage in proportion to
 * how much of the garrison it took with it.
 *
 * Scored against the ORIGINAL wall level, never the temporarily-dropped one.
 */
export function ramWallAfterBattle(input: {
  wallLevel: number;
  ramsSent: number;
  ramsSurviving: number;
  attackerWon: boolean;
  defenderLossFraction: number;
}): number {
  const standing = Math.max(0, input.wallLevel);
  const effective = input.attackerWon
    ? Math.max(0, input.ramsSent) + Math.max(0, input.ramsSurviving)
    : Math.max(0, input.ramsSent) * Math.min(1, Math.max(0, input.defenderLossFraction));
  const drop = siegeLevelsDestroyed(effective, RAM_CONSTANT, standing);
  return Math.max(standing - drop, 0);
}

/**
 * Buildings a settlement cannot live without. [CONFIRMED] these floor at level
 * 1 - a settlement can be wrecked but never deleted.
 */
export const INDESTRUCTIBLE_BUILDINGS: readonly string[] = ["hq", "farm", "warehouse"];

/**
 * [CONFIRMED] Trebuchets resolve AFTER the troop battle and never change its
 * outcome. One target is chosen at send time; only the target's LEVEL matters,
 * not which building it is; and they do not retarget, so a wave aimed at an
 * Academy nobody built is simply wasted. That is a real cost of bad scouting.
 *
 * Returns the building's NEW level.
 *
 * [SIM] Scaling against a DEFENDED village is undocumented in both games -
 * every published chart assumes an empty one - so this treats the trebuchets
 * that survived the battle as the ones that fire. Recorded as unmeasured.
 */
export function trebuchetDamage(input: {
  building: string;
  level: number;
  trebuchets: number;
}): number {
  const standing = Math.max(0, input.level);
  if (standing <= 0) return 0; // Nothing there. They do not retarget.
  const drop = siegeLevelsDestroyed(input.trebuchets, TREBUCHET_CONSTANT, standing);
  const floor = INDESTRUCTIBLE_BUILDINGS.includes(input.building) ? 1 : 0;
  return Math.max(standing - drop, floor);
}

// ---------------------------------------------------------------------------
// Realm of Power — KingsAge's conquest track
// ---------------------------------------------------------------------------

/**
 * [CONFIRMED] KingsAge replaced loyalty in version 0.1.18 (August 2009). What
 * this game shipped with is **Tribal Wars'** loyalty: 0-100, 20-35 per
 * surviving noble, no cap, no regeneration, reset to 25. Every one of those
 * numbers belongs to a different game.
 *
 * Realm of Power scales to the settlement's own point score instead, which is
 * why `settlementPoints()` had to exist first.
 */
export const REALM_OF_POWER_DROP_MIN = 2_250;
export const REALM_OF_POWER_DROP_MAX = 2_750;

/**
 * **The best rule in the whole system.** One attack can never remove more than
 * half the maximum, so a settlement ALWAYS takes at least two separate attacks
 * however small it is - ours could be taken by one lucky roll.
 *
 * It also means only ONE Count per attack matters: stacking them into a single
 * march is wasted. Conquest must be committed across TIME, which is what makes
 * it a campaign instead of a purchase.
 */
export const REALM_OF_POWER_ATTACK_CAP = 0.5;

/** [CONFIRMED] A taken settlement sits at 30% of maximum - fragile, not fresh. */
export const REALM_OF_POWER_ON_CAPTURE = 0.3;

/**
 * [CONFIRMED] +1% of maximum per hour. This is what makes defence ACTIVE: a
 * stalled campaign genuinely loses ground. Our loyalty never recovered, so an
 * attacker could take a year over it at no cost.
 */
export const REALM_OF_POWER_REGEN_PER_HOUR = 0.01;

function seedFraction(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

/** Deterministic from the battle seed, so a replay always tells the same story. */
export function realmOfPowerDrop(seed: string): number {
  const span = REALM_OF_POWER_DROP_MAX - REALM_OF_POWER_DROP_MIN;
  return REALM_OF_POWER_DROP_MIN + Math.floor(seedFraction(`${seed}:realm`) * (span + 1));
}

export function applyRealmOfPower(input: {
  current: number;
  maximum: number;
  survivingCounts: number;
  seed: string;
}): { value: number; countConsumed: number } {
  const current = Math.max(0, input.current);
  const maximum = Math.max(0, input.maximum);
  if (input.survivingCounts < 1 || maximum <= 0) return { value: current, countConsumed: 0 };

  // One Count, however many rode. See REALM_OF_POWER_ATTACK_CAP.
  const drop = Math.min(realmOfPowerDrop(input.seed), Math.floor(maximum * REALM_OF_POWER_ATTACK_CAP));
  return { value: Math.max(0, current - drop), countConsumed: 1 };
}

export function realmOfPowerRegen(input: { current: number; maximum: number; hours: number }): number {
  const maximum = Math.max(0, input.maximum);
  const recovered = Math.max(0, input.current) + maximum * REALM_OF_POWER_REGEN_PER_HOUR * Math.max(0, input.hours);
  return Math.min(maximum, Math.round(recovered));
}

/**
 * [CONFIRMED] The Count dies when 50% of the attacking army dies, and a Count
 * sent alone never arrives. Escort matters, which is the rule that stops
 * conquest from being a lone expensive unit walking into an empty field.
 *
 * `sent` and `survived` count the ESCORT - every attacking unit that is not the
 * Count himself.
 */
export function countSurvivesEscort(input: { sent: number; survived: number }): boolean {
  if (input.sent <= 0) return false;
  return input.survived > input.sent * 0.5;
}
