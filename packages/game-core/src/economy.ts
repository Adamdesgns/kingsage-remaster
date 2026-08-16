import type { Army, BuildingLevels, BuildingType, ResourceStock, TroopType } from "./contracts.ts";

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
  attack: number;
  defense: number;
  carry: number;
  recruiter: "barracks" | "stable" | "workshop" | "academy";
  recruiterLevel: number;
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

export const TROOP_ORDER: readonly TroopType[] = ["spear", "sword", "axe", "archer", "scout", "lightCavalry", "ram", "noble"];

export const TROOPS: Record<TroopType, TroopDefinition> = {
  spear: { id: "spear", name: "Spearman", plural: "Spearmen", icon: "♠", role: "Front-line defense", cost: { wood: 50, stone: 30, iron: 10 }, population: 1, baseSeconds: 120, attack: 10, defense: 25, carry: 25, recruiter: "barracks", recruiterLevel: 1 },
  sword: { id: "sword", name: "Swordsman", plural: "Swordsmen", icon: "†", role: "Armored infantry", cost: { wood: 30, stone: 30, iron: 70 }, population: 1, baseSeconds: 180, attack: 25, defense: 30, carry: 15, recruiter: "barracks", recruiterLevel: 3 },
  axe: { id: "axe", name: "Axeman", plural: "Axemen", icon: "⚒", role: "Heavy assault", cost: { wood: 60, stone: 30, iron: 40 }, population: 1, baseSeconds: 150, attack: 40, defense: 10, carry: 10, recruiter: "barracks", recruiterLevel: 3 },
  archer: { id: "archer", name: "Archer", plural: "Archers", icon: "➹", role: "Ranged support", cost: { wood: 100, stone: 30, iron: 60 }, population: 1, baseSeconds: 220, attack: 15, defense: 40, carry: 10, recruiter: "barracks", recruiterLevel: 5 },
  scout: { id: "scout", name: "Scout", plural: "Scouts", icon: "⌖", role: "Reconnaissance", cost: { wood: 50, stone: 50, iron: 20 }, population: 2, baseSeconds: 90, attack: 0, defense: 2, carry: 0, recruiter: "stable", recruiterLevel: 1 },
  lightCavalry: { id: "lightCavalry", name: "Light Cavalry", plural: "Light Cavalry", icon: "♞", role: "Fast flanking", cost: { wood: 125, stone: 100, iron: 250 }, population: 4, baseSeconds: 360, attack: 130, defense: 30, carry: 80, recruiter: "stable", recruiterLevel: 3 },
  ram: { id: "ram", name: "Battering Ram", plural: "Battering Rams", icon: "◫", role: "Wall breaking", cost: { wood: 300, stone: 200, iron: 200 }, population: 5, baseSeconds: 480, attack: 2, defense: 20, carry: 0, recruiter: "workshop", recruiterLevel: 1 },
  noble: { id: "noble", name: "Nobleman", plural: "Noblemen", icon: "♛", role: "Village conquest", cost: { wood: 2800, stone: 3000, iron: 3500 }, population: 25, baseSeconds: 900, attack: 25, defense: 35, carry: 0, recruiter: "academy", recruiterLevel: 1 },
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

export function troopRequirementProblem(troop: TroopType, levels: BuildingLevels): string | null {
  const definition = TROOPS[troop];
  if (levels[definition.recruiter] < definition.recruiterLevel) return `Requires ${BUILDINGS[definition.recruiter].name} level ${definition.recruiterLevel}.`;
  return null;
}

export function troopCost(troop: TroopType, quantity: number): ResourceStock {
  return scaleResources(TROOPS[troop].cost, Math.max(0, Math.floor(quantity)));
}

export function troopTrainingDurationSeconds(troop: TroopType, quantity: number, levels: BuildingLevels): number {
  const definition = TROOPS[troop];
  const recruiterLevel = levels[definition.recruiter];
  const speedFactor = Math.pow(0.95, Math.max(0, recruiterLevel - 1));
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
