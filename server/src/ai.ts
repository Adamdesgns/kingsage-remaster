import {
  BUILDING_ORDER,
  BUILDINGS,
  UNPLANNED_ATTACK_PLAN,
  armyPower,
  baseDefence,
  buildingCost,
  buildingRequirementProblem,
  canAfford,
  distanceBetween,
  emptyArmy,
  initialTroopLevels,
  troopCost,
  wallFactor,
  type Army,
  type BuildingLevels,
  type BuildingType,
  type ResourceStock,
  type TroopLevels,
  type TroopType,
} from "../../packages/game-core/src/index.ts";
import type { CommandResult, SharedWorldStore } from "./store.ts";

/** Population of Squires the AI wants on the wall: HQ level × this. */
export const AI_GARRISON_POP_PER_HQ = 12;

/** Basic defensive infantry the Barracks offers from level 1 (Squire). */
export const AI_DEFENSIVE_INFANTRY: TroopType = "spear";

const RESOURCE_BUILDINGS: readonly BuildingType[] = ["timber", "quarry", "iron"];
const PRIORITY_SINGLETONS: readonly BuildingType[] = ["farm", "warehouse", "barracks", "wall", "hq"];

export type AiVillageAction =
  | { type: "build"; kingdomId: string; villageId: string; building: BuildingType }
  | { type: "recruit"; kingdomId: string; villageId: string; troop: TroopType; quantity: number }
  | { type: "scout"; kingdomId: string; villageId: string; targetVillageId: string }
  | { type: "raid"; kingdomId: string; villageId: string; targetVillageId: string; army: Army };

type VillageRow = {
  id: string;
  kingdomId: string;
  x: number;
  y: number;
  resources: ResourceStock;
  buildings: BuildingLevels;
  army: Army;
};

type IncomingAttack = {
  attackerKingdomId: string;
  atMs: number;
};

function parseJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

function accepted(result: CommandResult): boolean {
  return result.type === "command.accepted";
}

export function readAiTickIntervalMs(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const raw = env.KINGSAGE_AI_TICK_MS;
  if (raw === undefined || raw === "") return undefined;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  return ms;
}

export function primaryWorldId(store: SharedWorldStore): string | undefined {
  const row = store.db.prepare("SELECT id FROM local_worlds ORDER BY created_at, id LIMIT 1").get() as
    | { id: string }
    | undefined;
  return row?.id;
}

/**
 * Start the AI interval only when `KINGSAGE_AI_TICK_MS` is set to a positive
 * number. Unset (or invalid) means the server behaves as it did before this
 * package — no extra timer, no extra work.
 */
export function scheduleAiKingdomTick(
  store: SharedWorldStore,
  options: {
    env?: NodeJS.ProcessEnv;
    setIntervalFn?: typeof setInterval;
    now?: () => Date;
    worldId?: string;
  } = {},
): ReturnType<typeof setInterval> | undefined {
  const ms = readAiTickIntervalMs(options.env ?? process.env);
  if (ms === undefined) return undefined;
  const worldId = options.worldId ?? primaryWorldId(store);
  if (!worldId) return undefined;
  const start = options.setIntervalFn ?? setInterval;
  const timer = start(() => {
    runAiKingdomTick(store, worldId, options.now?.() ?? new Date());
  }, ms);
  if (timer && typeof timer === "object" && "unref" in timer && typeof timer.unref === "function") {
    timer.unref();
  }
  return timer;
}

export function runAiKingdomTick(store: SharedWorldStore, worldId: string, now: Date): AiVillageAction[] {
  store.materializeDueJobs();
  const actions: AiVillageAction[] = [];
  const villages = listAiVillages(store, worldId);
  for (const village of villages) {
    const action = actForVillage(store, worldId, village, now);
    if (action) actions.push(action);
  }
  return actions;
}

function listAiVillages(store: SharedWorldStore, worldId: string): VillageRow[] {
  const rows = store.db.prepare(`
    SELECT v.id, v.kingdom_id, v.x, v.y, v.resources_json, v.buildings_json, v.army_json
    FROM local_villages v
    JOIN local_kingdoms k ON k.id = v.kingdom_id
    WHERE k.world_id = ? AND k.seat_kind = 'ai' AND k.alive = 1
    ORDER BY k.id, v.id
  `).all(worldId) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    kingdomId: String(row.kingdom_id),
    x: Number(row.x),
    y: Number(row.y),
    resources: parseJson<ResourceStock>(row.resources_json),
    buildings: parseJson<BuildingLevels>(row.buildings_json),
    army: parseJson<Army>(row.army_json),
  }));
}

function actForVillage(
  store: SharedWorldStore,
  worldId: string,
  village: VillageRow,
  now: Date,
): AiVillageAction | undefined {
  const built = tryBuild(store, worldId, village);
  if (built) return built;
  const recruited = tryRecruit(store, worldId, village);
  if (recruited) return recruited;
  const scouted = tryScout(store, worldId, village, now);
  if (scouted) return scouted;
  return tryRaid(store, worldId, village, now);
}

function pendingBuildCount(store: SharedWorldStore, villageId: string): number {
  const row = store.db.prepare(`
    SELECT COUNT(*) AS count FROM local_construction_jobs
    WHERE village_id = ? AND status IN ('queued', 'waiting')
  `).get(villageId) as { count: number };
  return Number(row.count);
}

function canStartUpgrade(buildings: BuildingLevels, resources: ResourceStock, building: BuildingType): boolean {
  const level = buildings[building] ?? 0;
  if (level >= BUILDINGS[building].maxLevel) return false;
  if (buildingRequirementProblem(building, buildings)) return false;
  return canAfford(resources, buildingCost(building, level));
}

function pickBuild(buildings: BuildingLevels, resources: ResourceStock): BuildingType | undefined {
  for (const building of ["farm", "warehouse"] as const) {
    if (canStartUpgrade(buildings, resources, building)) return building;
  }
  const resourcesReady = RESOURCE_BUILDINGS
    .filter((building) => canStartUpgrade(buildings, resources, building))
    .sort((left, right) => (buildings[left] - buildings[right]) || left.localeCompare(right));
  if (resourcesReady[0]) return resourcesReady[0];
  for (const building of ["barracks", "wall", "hq"] as const) {
    if (canStartUpgrade(buildings, resources, building)) return building;
  }
  const rest = BUILDING_ORDER
    .filter((building) => !PRIORITY_SINGLETONS.includes(building) && !RESOURCE_BUILDINGS.includes(building))
    .filter((building) => canStartUpgrade(buildings, resources, building))
    .sort((left, right) => (buildings[left] - buildings[right]) || left.localeCompare(right));
  return rest[0];
}

function tryBuild(store: SharedWorldStore, worldId: string, village: VillageRow): AiVillageAction | undefined {
  if (pendingBuildCount(store, village.id) > 0) return undefined;
  const building = pickBuild(village.buildings, village.resources);
  if (!building) return undefined;
  if (!accepted(store.queueVillageBuild(worldId, village.id, building))) return undefined;
  return { type: "build", kingdomId: village.kingdomId, villageId: village.id, building };
}

function queuedDefensiveCount(store: SharedWorldStore, villageId: string): number {
  const row = store.db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS quantity
    FROM local_recruitment_jobs
    WHERE village_id = ? AND status = 'queued' AND troop = ?
  `).get(villageId, AI_DEFENSIVE_INFANTRY) as { quantity: number };
  return Number(row.quantity);
}

function maxAffordable(troop: TroopType, resources: ResourceStock): number {
  const cost = troopCost(troop, 1);
  const by = (kind: keyof ResourceStock) => cost[kind] <= 0 ? 100 : Math.floor(resources[kind] / cost[kind]);
  return Math.max(0, Math.min(100, by("wood"), by("stone"), by("iron")));
}

function tryRecruit(store: SharedWorldStore, worldId: string, village: VillageRow): AiVillageAction | undefined {
  const target = Math.max(0, (village.buildings.hq ?? 0) * AI_GARRISON_POP_PER_HQ);
  const current = village.army[AI_DEFENSIVE_INFANTRY] + queuedDefensiveCount(store, village.id);
  const deficit = target - current;
  if (deficit < 1) return undefined;
  const quantity = Math.min(deficit, maxAffordable(AI_DEFENSIVE_INFANTRY, village.resources));
  if (quantity < 1) return undefined;
  if (!accepted(store.queueVillageRecruit(worldId, village.id, AI_DEFENSIVE_INFANTRY, quantity))) return undefined;
  return { type: "recruit", kingdomId: village.kingdomId, villageId: village.id, troop: AI_DEFENSIVE_INFANTRY, quantity };
}

function incomingAttacks(store: SharedWorldStore, kingdomId: string, now: Date): IncomingAttack[] {
  const cutoff = now.getTime();
  const fromMarches = (store.db.prepare(`
    SELECT m.kingdom_id AS attacker_kingdom_id, m.departed_at AS at
    FROM local_marches m
    WHERE m.kind = 'attack'
      AND m.target_village_id IN (SELECT id FROM local_villages WHERE kingdom_id = ?)
    ORDER BY m.departed_at DESC, m.id DESC
  `).all(kingdomId) as Array<{ attacker_kingdom_id: string; at: string }>)
    .map((row) => ({ attackerKingdomId: String(row.attacker_kingdom_id), atMs: Date.parse(String(row.at)) }))
    .filter((row) => Number.isFinite(row.atMs) && row.atMs <= cutoff);

  const fromBattles = (store.db.prepare(`
    SELECT attacker_kingdom_id, opened_at AS at
    FROM local_battle_sessions
    WHERE defender_kingdom_id = ?
    ORDER BY opened_at DESC, id DESC
  `).all(kingdomId) as Array<{ attacker_kingdom_id: string; at: string }>)
    .map((row) => ({ attackerKingdomId: String(row.attacker_kingdom_id), atMs: Date.parse(String(row.at)) }))
    .filter((row) => Number.isFinite(row.atMs) && row.atMs <= cutoff);

  return [...fromMarches, ...fromBattles].sort((left, right) => right.atMs - left.atMs || left.attackerKingdomId.localeCompare(right.attackerKingdomId));
}

function lastScoutAtMs(store: SharedWorldStore, kingdomId: string): number {
  const march = store.db.prepare(`
    SELECT departed_at AS at FROM local_marches
    WHERE kingdom_id = ? AND kind = 'scout'
    ORDER BY departed_at DESC, id DESC LIMIT 1
  `).get(kingdomId) as { at: string } | undefined;
  const report = store.db.prepare(`
    SELECT created_at AS at FROM local_scout_reports
    WHERE kingdom_id = ?
    ORDER BY created_at DESC, id DESC LIMIT 1
  `).get(kingdomId) as { at: string } | undefined;
  const times = [march?.at, report?.at]
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  return times.length > 0 ? Math.max(...times) : Number.NEGATIVE_INFINITY;
}

function nearestVillageId(
  store: SharedWorldStore,
  kingdomId: string,
  from: { x: number; y: number },
): string | undefined {
  const rows = store.db.prepare("SELECT id, x, y FROM local_villages WHERE kingdom_id = ? ORDER BY id")
    .all(kingdomId) as Array<{ id: string; x: number; y: number }>;
  let best: { id: string; distance: number } | undefined;
  for (const row of rows) {
    const distance = distanceBetween({ x: from.x, y: from.y }, { x: Number(row.x), y: Number(row.y) });
    if (!best || distance < best.distance || (distance === best.distance && row.id < best.id)) {
      best = { id: String(row.id), distance };
    }
  }
  return best?.id;
}

function tryScout(
  store: SharedWorldStore,
  worldId: string,
  village: VillageRow,
  now: Date,
): AiVillageAction | undefined {
  if (village.army.scout < 1) return undefined;
  const attacks = incomingAttacks(store, village.kingdomId, now);
  if (attacks.length === 0) return undefined;
  const latest = attacks[0];
  if (latest.atMs <= lastScoutAtMs(store, village.kingdomId)) return undefined;
  const targetVillageId = nearestVillageId(store, latest.attackerKingdomId, village);
  if (!targetVillageId) return undefined;
  const army = { ...emptyArmy(), scout: 1 };
  if (!accepted(store.launchVillageMarch(worldId, village.kingdomId, {
    fromVillageId: village.id,
    targetVillageId,
    kind: "scout",
    army,
  }))) return undefined;
  return { type: "scout", kingdomId: village.kingdomId, villageId: village.id, targetVillageId };
}

function troopLevels(store: SharedWorldStore, kingdomId: string): TroopLevels {
  const row = store.db.prepare("SELECT troop_levels_json FROM local_kingdoms WHERE id = ?").get(kingdomId) as
    | { troop_levels_json: string }
    | undefined;
  return row ? parseJson<TroopLevels>(row.troop_levels_json) : initialTroopLevels();
}

function musterableArmy(army: Army): Army {
  return { ...army, noble: 0 };
}

function reportedDefense(observedArmy: Army, observedBuildings: BuildingLevels): number {
  const troopDefense = armyPower(observedArmy, initialTroopLevels(), "defense");
  const wall = observedBuildings.wall ?? 0;
  return troopDefense * wallFactor(wall) + baseDefence(wall);
}

function tryRaid(
  store: SharedWorldStore,
  worldId: string,
  village: VillageRow,
  now: Date,
): AiVillageAction | undefined {
  const attackers = [...new Set(incomingAttacks(store, village.kingdomId, now).map((row) => row.attackerKingdomId))];
  if (attackers.length === 0) return undefined;
  const army = musterableArmy(village.army);
  const attackPower = armyPower(army, troopLevels(store, village.kingdomId), "attack");
  if (attackPower <= 0) return undefined;

  const reports = store.db.prepare(`
    SELECT r.target_village_id, r.observed_army_json, r.observed_buildings_json, r.created_at, v.kingdom_id AS target_kingdom_id
    FROM local_scout_reports r
    JOIN local_villages v ON v.id = r.target_village_id
    WHERE r.kingdom_id = ?
    ORDER BY r.created_at DESC, r.id DESC
  `).all(village.kingdomId) as Array<{
    target_village_id: string;
    observed_army_json: string;
    observed_buildings_json: string;
    target_kingdom_id: string;
  }>;

  for (const report of reports) {
    if (!attackers.includes(String(report.target_kingdom_id))) continue;
    const defense = reportedDefense(
      parseJson<Army>(report.observed_army_json),
      parseJson<BuildingLevels>(report.observed_buildings_json),
    );
    if (attackPower < defense * 1.5) continue;
    if (!accepted(store.launchVillageMarch(worldId, village.kingdomId, {
      fromVillageId: village.id,
      targetVillageId: String(report.target_village_id),
      kind: "attack",
      army,
      plan: UNPLANNED_ATTACK_PLAN,
    }))) continue;
    return {
      type: "raid",
      kingdomId: village.kingdomId,
      villageId: village.id,
      targetVillageId: String(report.target_village_id),
      army,
    };
  }
  return undefined;
}
