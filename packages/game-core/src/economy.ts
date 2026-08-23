import { TROOP_IDS } from "./contracts.ts";
import type { Army, BuildingLevels, BuildingType, ResourceStock, TroopType } from "./contracts.ts";
import { UNITS } from "./combat.ts";

export type BuildingDefinition = {
  id: BuildingType;
  name: string;
  shortName: string;
  icon: string;
  description: string;
  maxLevel: number;
  baseCost: ResourceStock;
  costFactor: number;
  baseSeconds: number;
  timeFactor: number;
  prerequisite?: Partial<Record<BuildingType, number>>;
};

export type TroopDefinition = {
  id: TroopType;
  name: string;
  plural: string;
  icon: string;
  role: string;
  cost: ResourceStock;
  population: number;
  baseSeconds: number;
  /** Mirrors combat.UNITS. Never hand-written - see makeTroop(). */
  attack: number;
  /** Defence vs infantry. The full three-value spread lives in combat.UNITS. */
  defense: number;
  carry: number;
  /**
   * [OURS - Adam, 2026-08-22] "The barracks is always where troops are
   * trained." Always "barracks"; kept as a field so the war table can keep
   * asking rather than assuming.
   */
  recruiter: "barracks";
  /**
   * The buildings that must be STANDING before this troop appears in the
   * Barracks list. Function is unified, fiction stays distributed: the Stable,
   * Workshop and Academy are things you can see in the settlement, not menus
   * you walk to.
   */
  requires?: Partial<Record<BuildingType, number>>;
  /** Barracks level required. The one gate that is not another building. */
  barracksLevel: number;
};

export const BUILDING_ORDER: readonly BuildingType[] = [
  "hq", "timber", "quarry", "iron", "farm", "warehouse", "barracks",
  "wall", "smithy", "stable", "workshop", "academy", "market",
];

export const BUILDINGS: Record<BuildingType, BuildingDefinition> = {
  hq: { id: "hq", name: "Headquarters", shortName: "Keep", icon: "♜", description: "Speeds every construction order.", maxLevel: 20, baseCost: { wood: 90, stone: 80, iron: 70 }, costFactor: 1.55, baseSeconds: 900, timeFactor: 1.2 },
  timber: { id: "timber", name: "Timber Camp", shortName: "Timber", icon: "♣", description: "Produces wood while the world keeps running.", maxLevel: 25, baseCost: { wood: 50, stone: 60, iron: 40 }, costFactor: 1.5, baseSeconds: 600, timeFactor: 1.2 },
  quarry: { id: "quarry", name: "Stone Quarry", shortName: "Quarry", icon: "◆", description: "Produces stone for walls and buildings.", maxLevel: 25, baseCost: { wood: 65, stone: 50, iron: 40 }, costFactor: 1.5, baseSeconds: 600, timeFactor: 1.2 },
  iron: { id: "iron", name: "Iron Mine", shortName: "Iron", icon: "⬟", description: "Produces iron for advanced troops and research.", maxLevel: 25, baseCost: { wood: 75, stone: 65, iron: 70 }, costFactor: 1.5, baseSeconds: 700, timeFactor: 1.2 },
  farm: { id: "farm", name: "Farm", shortName: "Farm", icon: "⌁", description: "Raises the population limit for troops.", maxLevel: 30, baseCost: { wood: 45, stone: 40, iron: 30 }, costFactor: 1.45, baseSeconds: 700, timeFactor: 1.2 },
  warehouse: { id: "warehouse", name: "Warehouse", shortName: "Stores", icon: "▤", description: "Raises the storage limit for every resource.", maxLevel: 30, baseCost: { wood: 60, stone: 50, iron: 40 }, costFactor: 1.45, baseSeconds: 650, timeFactor: 1.2 },
  barracks: { id: "barracks", name: "Barracks", shortName: "Barracks", icon: "⚔", description: "Recruits infantry and improves infantry training speed.", maxLevel: 25, baseCost: { wood: 200, stone: 170, iron: 90 }, costFactor: 1.4, baseSeconds: 1800, timeFactor: 1.18 },
  wall: { id: "wall", name: "Rampart", shortName: "Wall", icon: "▥", description: "Strengthens every defender in this village.", maxLevel: 20, baseCost: { wood: 80, stone: 120, iron: 40 }, costFactor: 1.5, baseSeconds: 1000, timeFactor: 1.2, prerequisite: { hq: 2 } },
  smithy: { id: "smithy", name: "Smithy", shortName: "Smithy", icon: "⚒", description: "Unlocks kingdom-wide troop research through level 10.", maxLevel: 10, baseCost: { wood: 320, stone: 300, iron: 280 }, costFactor: 1.52, baseSeconds: 1500, timeFactor: 1.2, prerequisite: { hq: 3, barracks: 3 } },
  stable: { id: "stable", name: "Stable", shortName: "Stable", icon: "♞", description: "Recruits scouts and fast cavalry.", maxLevel: 20, baseCost: { wood: 500, stone: 400, iron: 300 }, costFactor: 1.48, baseSeconds: 1900, timeFactor: 1.2, prerequisite: { barracks: 5, smithy: 1 } },
  workshop: { id: "workshop", name: "Workshop", shortName: "Siege", icon: "◈", description: "Builds rams for breaking fortified villages.", maxLevel: 15, baseCost: { wood: 800, stone: 700, iron: 600 }, costFactor: 1.52, baseSeconds: 2400, timeFactor: 1.22, prerequisite: { hq: 8, smithy: 5 } },
  academy: { id: "academy", name: "Academy", shortName: "Academy", icon: "♛", description: "Trains Noblemen who can conquer villages.", maxLevel: 3, baseCost: { wood: 1400, stone: 1600, iron: 1200 }, costFactor: 1.7, baseSeconds: 3000, timeFactor: 1.25, prerequisite: { hq: 10, smithy: 5 } },
  market: { id: "market", name: "Market", shortName: "Market", icon: "◎", description: "Prepares resource exchange and alliance coordination.", maxLevel: 20, baseCost: { wood: 250, stone: 220, iron: 150 }, costFactor: 1.48, baseSeconds: 1300, timeFactor: 1.2, prerequisite: { hq: 3, warehouse: 3 } },
};

/** The single roster list. Defined in contracts.ts so `emptyArmy()` shares it. */
export const TROOP_ORDER: readonly TroopType[] = TROOP_IDS;

/**
 * Combat stats come from `combat.UNITS` and are never restated here. Before
 * this, economy carried its own attack/defense numbers that nothing read after
 * slice 1b - a maintainer could have tuned them all day and changed nothing.
 */
function makeTroop(
  id: TroopType,
  economy: {
    plural: string;
    icon: string;
    role: string;
    cost: ResourceStock;
    baseSeconds: number;
    barracksLevel: number;
    requires?: Partial<Record<BuildingType, number>>;
  },
): TroopDefinition {
  const unit = UNITS[id];
  return {
    id,
    name: unit.name,
    plural: economy.plural,
    icon: economy.icon,
    role: economy.role,
    cost: economy.cost,
    population: unit.population,
    baseSeconds: economy.baseSeconds,
    attack: unit.attack,
    defense: unit.defInfantry,
    carry: unit.carry,
    recruiter: "barracks",
    requires: economy.requires,
    barracksLevel: economy.barracksLevel,
  };
}

/**
 * ⚠️ **Costs and training times are OURS, not KingsAge's** [OURS].
 *
 * KingsAge's own numbers are confirmed and written down in the combat spec, and
 * we deliberately do NOT use them: a Count costs 100,000 wood there, in a world
 * whose buildings reach level 50 and whose warehouses scale to match. Ours cap
 * at 20-30. Pasting KingsAge's costs into our economy would make a Count
 * literally unbuildable, so the existing eight keep the costs already balanced
 * for this world and the three new units are priced onto the same curve.
 *
 * The COMBAT numbers are KingsAge's exactly. It is only the economy that is
 * rescaled, and spec section 13 item 4 records that as an open decision.
 */
export const TROOPS: Record<TroopType, TroopDefinition> = {
  militia: makeTroop("militia", {
    plural: "Farmer's Militia", icon: "⚑", role: "Levy - cheap bodies, quickly",
    cost: { wood: 15, stone: 10, iron: 5 }, baseSeconds: 45, barracksLevel: 1,
  }),
  spear: makeTroop("spear", {
    plural: "Squires", icon: "♠", role: "Holds a wall against horse",
    cost: { wood: 50, stone: 30, iron: 10 }, baseSeconds: 120, barracksLevel: 1,
  }),
  sword: makeTroop("sword", {
    plural: "Templars", icon: "†", role: "Holds a wall against foot",
    cost: { wood: 30, stone: 30, iron: 70 }, baseSeconds: 180, barracksLevel: 3,
  }),
  axe: makeTroop("axe", {
    plural: "Berserkers", icon: "⚒", role: "The attacking infantry",
    cost: { wood: 60, stone: 30, iron: 40 }, baseSeconds: 150, barracksLevel: 3,
    requires: { smithy: 1 },
  }),
  archer: makeTroop("archer", {
    plural: "Long-bows", icon: "➹", role: "Holds a wall against foot, at range",
    cost: { wood: 100, stone: 30, iron: 60 }, baseSeconds: 220, barracksLevel: 5,
    requires: { smithy: 1 },
  }),
  scout: makeTroop("scout", {
    plural: "Spies", icon: "⌖", role: "Reconnaissance",
    cost: { wood: 50, stone: 50, iron: 20 }, baseSeconds: 90, barracksLevel: 1,
    requires: { stable: 1 },
  }),
  lightCavalry: makeTroop("lightCavalry", {
    plural: "Crusaders", icon: "♞", role: "The hardest hitter in the game",
    cost: { wood: 125, stone: 100, iron: 250 }, baseSeconds: 360, barracksLevel: 3,
    requires: { stable: 3 },
  }),
  heavyCavalry: makeTroop("heavyCavalry", {
    plural: "Black Knights", icon: "♘", role: "Defends against everything, at a price",
    cost: { wood: 200, stone: 300, iron: 450 }, baseSeconds: 600, barracksLevel: 8,
    requires: { stable: 10, smithy: 3 },
  }),
  ram: makeTroop("ram", {
    plural: "Battering Rams", icon: "◫", role: "Brings the wall down before the battle",
    cost: { wood: 300, stone: 200, iron: 200 }, baseSeconds: 480, barracksLevel: 5,
    requires: { workshop: 1 },
  }),
  trebuchet: makeTroop("trebuchet", {
    plural: "Trebuchets", icon: "◭", role: "Breaks buildings, never the battle",
    cost: { wood: 500, stone: 400, iron: 300 }, baseSeconds: 900, barracksLevel: 10,
    requires: { workshop: 5 },
  }),
  noble: makeTroop("noble", {
    plural: "Counts", icon: "♛", role: "Presses a claim on a settlement",
    cost: { wood: 2800, stone: 3000, iron: 3500 }, baseSeconds: 900, barracksLevel: 10,
    requires: { academy: 1 },
  }),
};

export function scaleResources(base: ResourceStock, factor: number): ResourceStock {
  return { wood: Math.round(base.wood * factor), stone: Math.round(base.stone * factor), iron: Math.round(base.iron * factor) };
}

export function buildingCost(building: BuildingType, currentLevel: number): ResourceStock {
  const definition = BUILDINGS[building];
  return scaleResources(definition.baseCost, Math.pow(definition.costFactor, Math.max(0, currentLevel)));
}

export function buildingDurationSeconds(building: BuildingType, currentLevel: number, headquartersLevel: number): number {
  const definition = BUILDINGS[building];
  return Math.max(1, Math.round(definition.baseSeconds * Math.pow(definition.timeFactor, Math.max(0, currentLevel)) * Math.pow(0.96, Math.max(0, headquartersLevel - 1))));
}

export function productionPerHour(level: number): number {
  return level <= 0 ? 0 : Math.round(28 * Math.pow(1.17, level - 1));
}

export function storageCapacity(level: number): number {
  return Math.round(1200 * Math.pow(1.22, Math.max(0, level)));
}

export function populationCapacity(level: number): number {
  return Math.round(200 * Math.pow(1.16, Math.max(0, level)));
}

export function buildingRequirementProblem(building: BuildingType, levels: BuildingLevels): string | null {
  const definition = BUILDINGS[building];
  if (levels[building] >= definition.maxLevel) return `${definition.name} is already at maximum level.`;
  for (const [requiredBuilding, requiredLevel] of Object.entries(definition.prerequisite ?? {}) as Array<[BuildingType, number]>) {
    if (levels[requiredBuilding] < requiredLevel) return `Requires ${BUILDINGS[requiredBuilding].name} level ${requiredLevel}.`;
  }
  return null;
}

/**
 * Everything trains at the Barracks [OURS - Adam, 2026-08-22], so a troop is
 * gated by the Barracks level PLUS whatever buildings must be standing. The
 * Barracks is checked first: it is the place you are standing, so "your
 * Barracks is too small" is the more useful sentence than "go build a Stable".
 */
export function troopRequirementProblem(troop: TroopType, levels: BuildingLevels): string | null {
  const definition = TROOPS[troop];
  if (levels.barracks < definition.barracksLevel) {
    return `Requires ${BUILDINGS.barracks.name} level ${definition.barracksLevel}.`;
  }
  for (const [building, required] of Object.entries(definition.requires ?? {})) {
    const have = levels[building as BuildingType] ?? 0;
    if (have < required) return `Requires ${BUILDINGS[building as BuildingType].name} level ${required}.`;
  }
  return null;
}

export function troopCost(troop: TroopType, quantity: number): ResourceStock {
  return scaleResources(TROOPS[troop].cost, Math.max(0, Math.floor(quantity)));
}

export function troopTrainingDurationSeconds(troop: TroopType, quantity: number, levels: BuildingLevels): number {
  const definition = TROOPS[troop];
  // Training speed comes from the Barracks, because that is where the training
  // happens. A big Stable houses horses; it does not drill men faster.
  const speedFactor = Math.pow(0.95, Math.max(0, levels.barracks - 1));
  return Math.max(1, Math.round(definition.baseSeconds * Math.max(1, Math.floor(quantity)) * speedFactor));
}

export function armyPopulation(army: Army): number {
  return TROOP_ORDER.reduce((total, troop) => total + army[troop] * TROOPS[troop].population, 0);
}

export function researchRequirementProblem(troop: TroopType, targetLevel: number, levels: BuildingLevels): string | null {
  if (!Number.isInteger(targetLevel) || targetLevel < 2 || targetLevel > 10) return "Troop research levels run from 2 through 10.";
  if (troop === "noble" && levels.academy < 1) return "Requires Academy level 1.";
  const smithyRequired = Math.max(1, targetLevel - 1);
  if (levels.smithy < smithyRequired) return `Requires Smithy level ${smithyRequired}.`;
  return null;
}

export function troopResearchCost(troop: TroopType, targetLevel: number): ResourceStock {
  return scaleResources(TROOPS[troop].cost, 3 * Math.pow(Math.max(2, targetLevel), 1.65));
}

export function troopResearchDurationSeconds(targetLevel: number, academyLevel: number): number {
  return Math.max(60, Math.round(600 * Math.pow(Math.max(2, targetLevel), 1.7) * Math.pow(0.96, Math.max(0, academyLevel - 1))));
}

export function canAfford(resources: ResourceStock, cost: ResourceStock): boolean {
  return resources.wood >= cost.wood && resources.stone >= cost.stone && resources.iron >= cost.iron;
}
