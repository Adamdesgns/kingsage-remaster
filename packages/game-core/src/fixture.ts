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
const FREEHOLD_NAMES = ["Millers Rest", "Thornhollow", "Saltmarsh Freehold", "Crowfoot Landing"] as const;

/**
 * [CONFIRMED] KingsAge runs abandoned settlements as the official on-ramp:
 * taking one does NOT burn beginner conquest protection, while attacking a real
 * player does. Named **Freeholds** here [OURS].
 *
 * They matter more to us than to the source game. A kingdom now starts with no
 * troops at all, and every player capital carries an identical garrison - so
 * without Freeholds there is literally nothing in the world a new player can
 * take, and "take over the world one settlement at a time" has no first rung.
 */
export const FREEHOLD_COUNT = FREEHOLD_NAMES.length;

/**
 * Reachable, but never free. A first rung has to cost something or it teaches
 * the player nothing about war. Ten Squires defend at 250 against an early
 * Berserker army attacking at ~1000, so it is a comfortable first win and a
 * real one.
 */
export const FREEHOLD_GARRISON = { ...emptyArmy(), spear: 10 };

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
  // One draw for every settlement in the world, so no Freehold lands on a capital.
  const sites = selectCapitalSites(seed, 2 + AI_NAMES.length + FREEHOLD_COUNT);
  const kingdoms: KingdomState[] = [];
  const villages: VillageState[] = [];

  // Capitals only. `sites` also carries Freehold sites on the end, so this must
  // NOT walk sites.length - doing so invents nameless kingdoms.
  const capitalCount = players.length + AI_NAMES.length;
  for (let index = 0; index < capitalCount; index += 1) {
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
      realmOfPower: 0, // filled below from the settlement's own points
      realmOfPowerMax: 0,
      horses: 0,
      horsesMax: 0,
      resources: { wood: 1_200, stone: 1_000, iron: 800 },
      buildings: defaultBuildings(),
      army: startingArmy(),
      stateVersion: 0,
    });
  }

  // Freeholds: abandoned settlements, never a claimable seat, always conquerable.
  for (let index = 0; index < FREEHOLD_COUNT; index += 1) {
    const kingdomId = `freehold-${index + 1}`;
    const villageId = `village-freehold-${index + 1}`;
    const site = sites[2 + AI_NAMES.length + index];
    assertCoordinate(site.x, site.y);
    kingdoms.push({
      id: kingdomId,
      worldId,
      name: FREEHOLD_NAMES[index],
      color: "#8d8578",
      seatKind: "freehold",
      controllerPlayerId: null,
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
      name: FREEHOLD_NAMES[index],
      x: site.x,
      y: site.y,
      isCapital: true,
      realmOfPower: 0, // filled below from the settlement's own points
      realmOfPowerMax: 0,
      horses: 0,
      horsesMax: 0,
      // Poorer than a player capital - nobody has been running it.
      resources: { wood: 400, stone: 350, iron: 250 },
      buildings: { ...defaultBuildings(), wall: 0, barracks: 0 },
      army: { ...FREEHOLD_GARRISON },
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
