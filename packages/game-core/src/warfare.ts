import { TROOPS, TROOP_ORDER } from "./economy.ts";
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
  const attackerPower = Math.max(1, armyPower(input.attacker, input.attackerLevels, "attack") * planFactor * (1 + orderBonus) * variance);
  const defenderPower = Math.max(1, armyPower(input.defender, input.defenderLevels, "defense") * (1 + Math.max(0, input.defenderWallLevel) * 0.08) * (2 - variance));
  const attackerWon = attackerPower >= defenderPower;
  const attackerLossRatio = attackerWon
    ? clamp((defenderPower / attackerPower) * 0.42, 0.12, 0.55)
    : clamp((defenderPower / attackerPower) * 0.72, 0.6, 0.96);
  const defenderLossRatio = attackerWon
    ? clamp((attackerPower / defenderPower) * 0.68, 0.55, 0.95)
    : clamp((attackerPower / defenderPower) * 0.32, 0.08, 0.5);
  const attackerSurvivors = scaleArmy(input.attacker, 1 - attackerLossRatio, `${input.seed}:attacker`);
  const defenderSurvivors = scaleArmy(input.defender, 1 - defenderLossRatio, `${input.seed}:defender`);
  const loot = attackerWon ? calculateLoot(input.defenderResources, attackerSurvivors) : { wood: 0, stone: 0, iron: 0 };
  const winner = attackerWon ? ("attacker" as const) : ("defender" as const);
  return {
    winner,
    attackerSurvivors,
    defenderSurvivors,
    attackerCasualties: armyCasualties(input.attacker, attackerSurvivors),
    defenderCasualties: armyCasualties(input.defender, defenderSurvivors),
    loot,
    planScore,
    orderBonus,
    yielded: surrenderYield({ winner, attackerPower, defenderPower, defenderSurvivors }),
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
