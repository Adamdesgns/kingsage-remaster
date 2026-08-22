import {
  GAME_CONTRACT_VERSION,
  WORLD_SIZE,
  assertCoordinate,
  emptyArmy,
  initialTroopLevels,
  type BuildingLevels,
  type KingdomState,
  type PlayerId,
  type VillageState,
  type WorldState,
} from "./contracts.ts";

const COLORS = ["#f0c057", "#62b7dc", "#d85f55", "#6cc58a", "#a882d8", "#d28b55"] as const;
const AI_NAMES = ["Warlord Kaas", "Ember Crown", "Verdant Pact", "The Ashen Court"] as const;

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRng(seed: string) {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function defaultBuildings(): BuildingLevels {
  return {
    hq: 1,
    timber: 1,
    quarry: 1,
    iron: 1,
    farm: 1,
    warehouse: 1,
    barracks: 1,
    wall: 1,
    academy: 0,
    stable: 0,
    workshop: 0,
    smithy: 0,
    market: 0,
  };
}

function startingArmy() {
  return emptyArmy();
}

function selectCapitalSites(seed: string, count: number): Array<{ x: number; y: number }> {
  const random = makeRng(seed);
  const sites: Array<{ x: number; y: number }> = [];
  let attempts = 0;
  while (sites.length < count && attempts < 10_000) {
    attempts += 1;
    const candidate = {
      x: 4 + Math.floor(random() * (WORLD_SIZE - 8)),
      y: 4 + Math.floor(random() * (WORLD_SIZE - 8)),
    };
    if (sites.every((site) => Math.hypot(site.x - candidate.x, site.y - candidate.y) >= 8)) sites.push(candidate);
  }
  if (sites.length !== count) throw new Error(`Unable to place ${count} deterministic kingdom capitals`);
  return sites;
}

export type TwoPlayerFixtureOptions = {
  seed?: string;
  worldId?: string;
  createdAt?: string;
  players?: readonly [
    { id: PlayerId; kingdomName: string },
    { id: PlayerId; kingdomName: string },
  ];
};

export function createTwoPlayerWorldFixture(options: TwoPlayerFixtureOptions = {}): WorldState {
  const seed = options.seed ?? "gate-a-2026-08-16";
  const worldId = options.worldId ?? `world-${hashSeed(seed).toString(16)}`;
  const createdAt = options.createdAt ?? "2026-08-16T12:00:00.000Z";
  const players = options.players ?? [
    { id: "player-adam", kingdomName: "Crown of Adam" },
    { id: "player-rival", kingdomName: "Northwatch" },
  ];
  const sites = selectCapitalSites(seed, 2 + AI_NAMES.length);
  const kingdoms: KingdomState[] = [];
  const villages: VillageState[] = [];

  for (let index = 0; index < sites.length; index += 1) {
    const human = index < players.length ? players[index] : null;
    const kingdomId = `kingdom-${index + 1}`;
    const villageId = `village-${index + 1}-capital`;
    const site = sites[index];
    assertCoordinate(site.x, site.y);
    kingdoms.push({
      id: kingdomId,
      worldId,
      name: human?.kingdomName ?? AI_NAMES[index - players.length],
      color: COLORS[index],
      seatKind: human ? "human" : "ai",
      controllerPlayerId: human?.id ?? null,
      capitalVillageId: villageId,
      allianceId: null,
      troopLevels: initialTroopLevels(),
      warVictoryPoints: 0,
      villagesConquered: 0,
      alive: true,
    });
    villages.push({
      id: villageId,
      worldId,
      kingdomId,
      name: human ? `${human.kingdomName} Keep` : `${AI_NAMES[index - players.length]} Hold`,
      x: site.x,
      y: site.y,
      isCapital: true,
      loyalty: 100,
      resources: { wood: 1_200, stone: 1_000, iron: 800 },
      buildings: defaultBuildings(),
      army: startingArmy(),
      stateVersion: 0,
    });
  }

  return {
    id: worldId,
    contractVersion: GAME_CONTRACT_VERSION,
    version: 0,
    name: "Gate A — Emberfall",
    seed,
    width: WORLD_SIZE,
    height: WORLD_SIZE,
    status: "active",
    createdAt,
    kingdoms,
    villages,
  };
}
