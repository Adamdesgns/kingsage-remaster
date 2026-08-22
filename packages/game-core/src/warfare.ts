import { TROOPS, TROOP_ORDER } from "./economy.ts";
import {
  attackByClass,
  defenceByClass,
  resolveBattleKingsAge,
  type ByClass,
  type Force,
} from "./combat.ts";
import {
  emptyArmy,
  type Army,
  type BattleOutcome,
  type BattlePlan,
  type ResourceStock,
  type TroopLevels,
  type TroopType,
} from "./contracts.ts";

const BEST_PLAN: BattlePlan = {
  entry: "West Ridge",
  troops: "Balanced Army",
  time: "Dawn",
  style: "Flanking Strike",
};

/**
 * The plan an attack is fought under when its owner never chose one. A blunt
 * frontal assault at midday: what "nobody gave orders" should look like. Used
 * only by server-side auto-resolution of an unattended attack, so an army can
 * never be stranded outside a wall forever waiting for a human.
 */
export const UNPLANNED_ATTACK_PLAN: BattlePlan = {
  entry: "Main Breach",
  troops: "Balanced Army",
  time: "Midday",
  style: "Full Assault",
};

/**
 * How many times stronger the attacker must be before a beaten defender
 * yields instead of dying. PROPOSED (battles slice A) - tune here, not in
 * logic.
 */
export const SURRENDER_POWER_RATIO = 3;

export function isValidArmy(army: Army): boolean {
  return TROOP_ORDER.every((troop) => Number.isInteger(army[troop]) && army[troop] >= 0);
}

export function armyUnitCount(army: Army): number {
  return TROOP_ORDER.reduce((total, troop) => total + army[troop], 0);
}

export function armyPower(army: Army, levels: TroopLevels, stance: "attack" | "defense"): number {
  return TROOP_ORDER.reduce((total, troop) => {
    const base = stance === "attack" ? TROOPS[troop].attack : TROOPS[troop].defense;
    return total + army[troop] * base * (1 + Math.max(0, levels[troop] - 1) * 0.08);
  }, 0);
}

export function armyCarry(army: Army): number {
  return TROOP_ORDER.reduce((total, troop) => total + army[troop] * TROOPS[troop].carry, 0);
}

export function addArmies(left: Army, right: Army): Army {
  return TROOP_ORDER.reduce((sum, troop) => {
    sum[troop] = left[troop] + right[troop];
    return sum;
  }, emptyArmy());
}

export function subtractArmy(available: Army, leaving: Army): Army | null {
  if (!isValidArmy(leaving) || armyUnitCount(leaving) < 1) return null;
  const remaining = emptyArmy();
  for (const troop of TROOP_ORDER) {
    if (leaving[troop] > available[troop]) return null;
    remaining[troop] = available[troop] - leaving[troop];
  }
  return remaining;
}

export function battlePlanScore(plan: BattlePlan): number {
  return Number(plan.entry === BEST_PLAN.entry)
    + Number(plan.troops === BEST_PLAN.troops)
    + Number(plan.time === BEST_PLAN.time)
    + Number(plan.style === BEST_PLAN.style);
}

export function marchDurationSeconds(distance: number, kind: "scout" | "attack" | "support" | "return"): number {
  const base = kind === "scout" ? 8 : kind === "return" ? 10 : 12;
  return Math.max(base, Math.round(base + Math.max(0, distance) * (kind === "scout" ? 0.8 : 1.2)));
}

function hashFraction(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function scaleArmy(army: Army, survivorRatio: number, seed: string): Army {
  const safeRatio = clamp(survivorRatio, 0, 1);
  return TROOP_ORDER.reduce((survivors, troop, index) => {
    const exact = army[troop] * safeRatio;
    const fraction = hashFraction(`${seed}:${troop}:${index}`);
    survivors[troop] = Math.min(army[troop], Math.floor(exact) + (fraction < exact % 1 ? 1 : 0));
    return survivors;
  }, emptyArmy());
}

export function armyCasualties(original: Army, survivors: Army): Army {
  return TROOP_ORDER.reduce((losses, troop) => {
    losses[troop] = Math.max(0, original[troop] - survivors[troop]);
    return losses;
  }, emptyArmy());
}

export function calculateLoot(resources: ResourceStock, carryingArmy: Army): ResourceStock {
  let capacity = armyCarry(carryingArmy);
  const loot: ResourceStock = { wood: 0, stone: 0, iron: 0 };
  for (const resource of ["wood", "stone", "iron"] as const) {
    const taken = Math.min(Math.floor(resources[resource] * 0.25), capacity);
    loot[resource] = Math.max(0, taken);
    capacity -= loot[resource];
  }
  return loot;
}

/**
 * Spec SS5's surrender mechanic: "if the defender surrenders, the attacker
 * absorbs their surviving troops... intimidation over annihilation can pay in
 * soldiers."
 *
 * A beaten defender yields when the attack was overwhelming - the attacker
 * won, someone is left alive to yield, and attacker power was at least
 * SURRENDER_POWER_RATIO times the defender's. Deterministic, no RNG, and it
 * returns only troops that already survived, so the rule can never manufacture
 * soldiers or make under-committing profitable.
 */
export function surrenderYield(input: {
  winner: "attacker" | "defender";
  attackerPower: number;
  defenderPower: number;
  defenderSurvivors: Army;
}): Army {
  if (input.winner !== "attacker") return emptyArmy();
  if (armyUnitCount(input.defenderSurvivors) < 1) return emptyArmy();
  if (!Number.isFinite(input.attackerPower) || !Number.isFinite(input.defenderPower)) return emptyArmy();
  if (input.defenderPower <= 0) return emptyArmy();
  if (input.attackerPower < input.defenderPower * SURRENDER_POWER_RATIO) return emptyArmy();
  return { ...input.defenderSurvivors };
}

/**
 * The share of a routed garrison that lays down arms instead of dying, once the
 * attack was overwhelming enough to make surrender the obvious choice.
 * [OURS] - tune here, not in logic.
 */
export const SURRENDER_PRISONER_SHARE = 0.25;

/**
 * Prisoners, after slice 1b.
 *
 * The old rule collected the defender's SURVIVORS. That worked against a flat
 * power sum, which left a beaten garrison partly intact. The real KingsAge
 * engine does not: when the attacker wins a sub-battle the defenders in it are
 * wiped, so an overwhelming win leaves nobody standing and `surrenderYield`
 * quietly became unreachable - it could only ever fire on a NARROW win, which
 * is precisely the fight where a garrison would not surrender.
 *
 * So prisoners now come out of the dead. Men who would have been killed lay
 * down arms instead; they are removed from the casualty list and march home
 * with the attacker. The world still never gains a soldier - the same men are
 * merely counted once, on the other side. That preserves the designed intent
 * ("intimidation over annihilation can pay in soldiers") under maths that
 * would otherwise have deleted it.
 */
function takePrisoners(defenderCasualties: Army, share: number): Army {
  return TROOP_ORDER.reduce((prisoners, troop) => {
    prisoners[troop] = Math.floor(Math.max(0, defenderCasualties[troop]) * share);
    return prisoners;
  }, emptyArmy());
}

/**
 * Spec SS1's long game: "take over the world one settlement at a time."
 *
 * Every Nobleman who SURVIVES a winning attack shakes the target's loyalty.
 * The size of the shake is derived from the battle seed, so a conquest is as
 * deterministic and as replayable as the fight that earned it - the same
 * battle always produces the same drop, on the server and in any replay.
 */
export const LOYALTY_DROP_MIN = 20;
export const LOYALTY_DROP_MAX = 35;
export const LOYALTY_ON_CAPTURE = 25;

export function loyaltyDrop(seed: string, index: number): number {
  const span = LOYALTY_DROP_MAX - LOYALTY_DROP_MIN;
  return LOYALTY_DROP_MIN + Math.floor(hashFraction(`${seed}:noble:${index}`) * (span + 1));
}

/**
 * Armour, as a single defence multiplier. [OURS - Adam, 2026-08-22]
 *
 * KingsAge has NO combat research, so our troop levels 1-10 had no home in the
 * new model until Adam's Smithy ruling gave them one: they are armour, and
 * armour is defence only. Attack stays purely about what you brought.
 *
 * Averaged across the troops actually STANDING in the garrison, so upgrading
 * armour for units you do not field buys nothing.
 */
function armourMultiplier(defender: Army, levels: TroopLevels): number {
  let units = 0;
  let weighted = 0;
  for (const troop of TROOP_ORDER) {
    const count = defender[troop];
    if (count <= 0) continue;
    units += count;
    weighted += count * (1 + Math.max(0, levels[troop] - 1) * 0.08);
  }
  return units > 0 ? weighted / units : 1;
}

function toForce(army: Army): Force {
  return TROOP_ORDER.reduce((force, troop) => {
    force[troop] = army[troop];
    return force;
  }, {} as Force);
}

function toArmy(counts: Record<string, number>): Army {
  return TROOP_ORDER.reduce((army, troop) => {
    army[troop] = Math.max(0, counts[troop] ?? 0);
    return army;
  }, emptyArmy());
}

/**
 * The live battle path, now running the REAL KingsAge engine.
 *
 * Before slice 1b this was a flat power sum: one attack number against one
 * defence number. That is neither KingsAge nor Tribal Wars - both split the
 * battle by unit class - and it is why every troop in this game was
 * interchangeable. With a single defence number the only question a player ever
 * had to answer was "how much attack can I afford", and the answer was always
 * Axemen.
 *
 * What survives from the old model, because it is OURS and not the source
 * game's: the battle plan, the order bonus for showing up and commanding, the
 * seeded variance, the loot rule and the surrender rule. Those multiply the
 * attack; the class maths decides the fight.
 */
export function resolveBattle(input: {
  attacker: Army;
  defender: Army;
  attackerLevels: TroopLevels;
  defenderLevels: TroopLevels;
  defenderWallLevel: number;
  defenderResources: ResourceStock;
  plan: BattlePlan;
  acceptedOrders: number;
  seed: string;
}): BattleOutcome {
  const planScore = battlePlanScore(input.plan);
  const planFactor = 0.96 + planScore * 0.235;
  const orderBonus = Math.min(0.12, Math.max(0, input.acceptedOrders) * 0.02);
  const variance = 0.94 + hashFraction(input.seed) * 0.12;

  // Everything the commander contributes scales ATTACK. Nothing here touches
  // the class split itself - a good plan does not turn cavalry into infantry.
  const attackMultiplier = planFactor * (1 + orderBonus) * variance;
  const armour = armourMultiplier(input.defender, input.defenderLevels);

  const attackerForce = toForce(input.attacker);
  const defenderForce = toForce(input.defender);

  const result = resolveBattleKingsAge({
    attacker: attackerForce,
    defender: defenderForce,
    wallLevel: input.defenderWallLevel,
    nightBonus: false,
    morale: attackMultiplier,
    luck: 0,
    defenceMultiplier: armour,
  });

  const attackerSurvivors = toArmy(result.attackerSurvivors);
  const defenderSurvivors = toArmy(result.defenderSurvivors);
  const attackerWon = result.winner === "attacker";
  const loot = attackerWon
    ? calculateLoot(input.defenderResources, attackerSurvivors)
    : { wood: 0, stone: 0, iron: 0 };

  // Power figures for the surrender rule only. The engine never collapses the
  // three defences into one, so this weights them the way the battle did -
  // by the attacker's own class shares.
  const raw = attackByClass(attackerForce);
  const totalAttack = (raw.infantry + raw.cavalry + raw.archer) * attackMultiplier;
  const shares: ByClass = totalAttack > 0
    ? {
      infantry: (raw.infantry * attackMultiplier) / totalAttack,
      cavalry: (raw.cavalry * attackMultiplier) / totalAttack,
      archer: (raw.archer * attackMultiplier) / totalAttack,
    }
    : { infantry: 1, cavalry: 0, archer: 0 };
  const facedRaw = defenceByClass({
    defender: defenderForce,
    shares,
    wallLevel: input.defenderWallLevel,
    nightBonus: false,
  });
  const facedDefence = (facedRaw.infantry + facedRaw.cavalry + facedRaw.archer) * armour;

  let defenderCasualties = armyCasualties(input.defender, defenderSurvivors);

  // Surrender. Try the standing-survivors rule first - it still fires on the
  // narrow wins the engine leaves partly intact - and fall back to taking
  // prisoners out of the casualties when the rout was total.
  let yielded = surrenderYield({
    winner: result.winner,
    attackerPower: totalAttack,
    defenderPower: facedDefence,
    defenderSurvivors,
  });
  const overwhelming = result.winner === "attacker"
    && facedDefence > 0
    && totalAttack >= facedDefence * SURRENDER_POWER_RATIO;
  if (overwhelming && armyUnitCount(yielded) < 1) {
    yielded = takePrisoners(defenderCasualties, SURRENDER_PRISONER_SHARE);
    // A prisoner is not also a corpse. Taking them off the casualty list is
    // what keeps the settlement's bookkeeping honest, because the store
    // removes casualties AND prisoners from the garrison.
    defenderCasualties = TROOP_ORDER.reduce((remaining, troop) => {
      remaining[troop] = Math.max(0, defenderCasualties[troop] - yielded[troop]);
      return remaining;
    }, emptyArmy());
  }

  return {
    winner: result.winner,
    attackerSurvivors,
    defenderSurvivors,
    attackerCasualties: armyCasualties(input.attacker, attackerSurvivors),
    defenderCasualties,
    loot,
    planScore,
    orderBonus,
    yielded,
  };
}

export function retreatSurvivors(army: Army, atMs: number, acceptedOrders: number, seed: string): Army {
  const exposure = Math.min(0.38, Math.max(0, atMs) / 180_000);
  const coordination = Math.min(0.08, Math.max(0, acceptedOrders) * 0.01);
  return scaleArmy(army, clamp(0.88 - exposure + coordination, 0.5, 0.92), `${seed}:retreat`);
}

export function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
