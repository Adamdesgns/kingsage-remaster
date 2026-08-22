export const GAME_CONTRACT_VERSION = 1 as const;
export const WORLD_SIZE = 50 as const;

export type ContractVersion = typeof GAME_CONTRACT_VERSION;
export type WorldId = string;
export type PlayerId = string;
export type KingdomId = string;
export type VillageId = string;
export type AllianceId = string;
export type MarchId = string;
export type BattleId = string;
export type CommandId = string;

export type ResourceType = "wood" | "stone" | "iron";
export type ResourceStock = Record<ResourceType, number>;

export type BuildingType =
  | "hq"
  | "timber"
  | "quarry"
  | "iron"
  | "farm"
  | "warehouse"
  | "barracks"
  | "wall"
  | "academy"
  | "stable"
  | "workshop"
  | "smithy"
  | "market";

export type BuildingLevels = Record<BuildingType, number>;

export type TroopType =
  | "spear"
  | "sword"
  | "axe"
  | "archer"
  | "scout"
  | "lightCavalry"
  | "ram"
  | "noble";

export type Army = Record<TroopType, number>;
export type TroopLevels = Record<TroopType, number>;
export type CommandSquadId = "vanguard" | "archers" | "riders";

export type BattlePlan = {
  entry: "West Ridge" | "Main Breach" | "East Woods";
  troops: "Vanguard Heavy" | "Balanced Army" | "Cavalry Wing";
  time: "Dawn" | "Midday" | "Night";
  style: "Siege Push" | "Flanking Strike" | "Full Assault";
};

export type WorldStatus = "forming" | "active" | "won" | "archived" | "paused";
/**
 * "ai" is an OPEN PLAYER SEAT, not a robot opponent - `findOpenSeat()` claims
 * exactly these. "freehold" is an abandoned settlement: never claimable, always
 * conquerable, and the designed first rung for a kingdom that starts with no
 * troops. Adding it to this union is what keeps a new player from being seated
 * INTO the thing they are supposed to take.
 */
export type SeatKind = "human" | "ai" | "freehold";
export type ChatChannelKind = "global" | "world" | "alliance";

export type WorldState = {
  id: WorldId;
  contractVersion: ContractVersion;
  version: number;
  name: string;
  seed: string;
  width: typeof WORLD_SIZE;
  height: typeof WORLD_SIZE;
  status: WorldStatus;
  createdAt: string;
  kingdoms: KingdomState[];
  villages: VillageState[];
};

export type KingdomState = {
  id: KingdomId;
  worldId: WorldId;
  name: string;
  color: string;
  seatKind: SeatKind;
  controllerPlayerId: PlayerId | null;
  capitalVillageId: VillageId;
  allianceId: AllianceId | null;
  troopLevels: TroopLevels;
  warVictoryPoints: number;
  villagesConquered: number;
  alive: boolean;
};

export type PlayerArenaStanding = {
  playerId: PlayerId;
  seasonId: string;
  warVictoryPoints: number;
  worldWins: number;
  villagesConquered: number;
  tier: "Unranked" | "Bronze" | "Silver" | "Gold" | "Crown" | "Legend";
};

export type VillageState = {
  id: VillageId;
  worldId: WorldId;
  kingdomId: KingdomId;
  name: string;
  x: number;
  y: number;
  isCapital: boolean;
  loyalty: number;
  resources: ResourceStock;
  buildings: BuildingLevels;
  army: Army;
  stateVersion: number;
};

export type MarchKind = "scout" | "attack" | "support" | "return";
export type MarchStatus = "outbound" | "awaiting_battle" | "returning" | "complete";
export type BattleStatus = "open" | "resolved" | "retreated";

export type MarchState = {
  id: MarchId;
  worldId: WorldId;
  kingdomId: KingdomId;
  fromVillageId: VillageId;
  targetVillageId: VillageId;
  kind: MarchKind;
  status: MarchStatus;
  army: Army;
  loot: ResourceStock;
  departedAt: string;
  arrivesAt: string;
  battleId: BattleId | null;
};

export type ScoutReportState = {
  id: string;
  marchId: MarchId;
  worldId: WorldId;
  kingdomId: KingdomId;
  targetVillageId: VillageId;
  targetVillageVersion: number;
  targetVillageName: string;
  targetKingdomName: string;
  observedArmy: Army;
  observedResources: ResourceStock;
  observedBuildings: BuildingLevels;
  layout: Record<string, { x: number; y: number }>;
  createdAt: string;
};

export type BattleOutcome = {
  winner: "attacker" | "defender";
  attackerSurvivors: Army;
  defenderSurvivors: Army;
  attackerCasualties: Army;
  defenderCasualties: Army;
  loot: ResourceStock;
  planScore: number;
  orderBonus: number;
  /**
   * Troops the defender surrendered rather than lost: they leave the village
   * and march home with the attacker. Empty unless the surrender rule fired
   * (see `surrenderYield`). Never invents soldiers - every unit here is a
   * survivor that already existed.
   */
  yielded: Army;
};

export type BattleSessionState = {
  id: BattleId;
  marchId: MarchId;
  worldId: WorldId;
  attackerKingdomId: KingdomId;
  defenderKingdomId: KingdomId;
  attackerVillageId: VillageId;
  defenderVillageId: VillageId;
  status: BattleStatus;
  plan: BattlePlan;
  seed: string;
  /**
   * The armies as they stood when the battle was frozen. Both sides are safe
   * to send: a battle is only ever in the snapshot of a kingdom that fought
   * it, and by the time it opens the two armies are standing in front of each
   * other. Without these a client cannot render the fight while it is still
   * open, because the outcome (which carries survivors and casualties) does
   * not exist yet.
   */
  attackerArmy: Army;
  defenderArmy: Army;
  /**
   * Squad orders the world server has accepted for this battle. Each is worth
   * a capped +2% to the attacker, so this is also the honest answer to "does
   * attending actually do anything".
   */
  acceptedOrders: number;
  openedAt: string;
  resolvedAt: string | null;
  outcome: BattleOutcome | null;
};

export type GameCommand =
  | { type: "village.build.queue"; payload: { villageId: VillageId; building: BuildingType } }
  | { type: "village.recruit.queue"; payload: { villageId: VillageId; troop: TroopType; quantity: number } }
  | { type: "kingdom.research.queue"; payload: { villageId: VillageId; troop: TroopType; targetLevel: number } }
  | { type: "march.launch"; payload: { fromVillageId: VillageId; targetVillageId: VillageId; kind: Exclude<MarchKind, "return">; army: Army; plan?: BattlePlan } }
  | { type: "battle.open"; payload: { marchId: MarchId; targetVillageVersion: number; plan: BattlePlan } }
  | { type: "battle.order"; payload: { battleId: BattleId; sequence: number; squad: CommandSquadId; x: number; y: number; atMs: number } }
  | { type: "battle.retreat"; payload: { battleId: BattleId; sequence: number; atMs: number } }
  | { type: "battle.resolve"; payload: { battleId: BattleId } }
  | { type: "alliance.create"; payload: { name: string } }
  | { type: "alliance.join"; payload: { allianceId: AllianceId } }
  | { type: "alliance.leave"; payload: { allianceId: AllianceId } }
  | { type: "chat.send"; payload: { channelId: string; body: string } };

export type CommandEnvelope<TCommand extends GameCommand = GameCommand> = {
  contractVersion: ContractVersion;
  commandId: CommandId;
  worldId: WorldId;
  actorPlayerId: PlayerId;
  expectedWorldVersion: number;
  issuedAt: string;
  command: TCommand;
};

export type GameEvent =
  | { type: "command.accepted"; payload: { commandId: CommandId; worldVersion: number } }
  | { type: "command.rejected"; payload: { commandId: CommandId; code: string; message: string; currentWorldVersion: number } }
  | { type: "village.changed"; payload: { village: VillageState } }
  | { type: "march.changed"; payload: { marchId: MarchId; kind: MarchKind; arrivesAt: string } }
  | { type: "battle.started"; payload: { battleId: BattleId; seed: string; attackerVillageId: VillageId; defenderVillageId: VillageId } }
  | { type: "battle.resolved"; payload: { battleId: BattleId; winnerKingdomId: KingdomId; attackerSurvivors: Army; defenderSurvivors: Army } }
  | { type: "troop.level.changed"; payload: { kingdomId: KingdomId; troop: TroopType; level: number } }
  | { type: "war-points.awarded"; payload: { kingdomId: KingdomId; villageId: VillageId; points: number; total: number } }
  | { type: "chat.message"; payload: { channelId: string; playerId: PlayerId; kingdomId: KingdomId | null; body: string; sentAt: string } }
  | { type: "world.won"; payload: { winnerKingdomId: KingdomId; wonAt: string; territoryPercent: number } };

export function emptyArmy(): Army {
  return {
    spear: 0,
    sword: 0,
    axe: 0,
    archer: 0,
    scout: 0,
    lightCavalry: 0,
    ram: 0,
    noble: 0,
  };
}

export function initialTroopLevels(): TroopLevels {
  return {
    spear: 1,
    sword: 1,
    axe: 1,
    archer: 1,
    scout: 1,
    lightCavalry: 1,
    ram: 1,
    noble: 1,
  };
}

export function conquestWarVictoryPoints(input: {
  developmentLevel: number;
  defensePower: number;
  isCapital: boolean;
  attackerRealmPower: number;
  defenderRealmPower: number;
}): number {
  const development = Math.max(1, Math.floor(input.developmentLevel));
  const defense = Math.max(0, Math.floor(input.defensePower));
  const base = 100 + development * 10 + Math.min(300, Math.floor(defense / 5)) + (input.isCapital ? 500 : 0);
  const relativeStrength = input.defenderRealmPower / Math.max(1, input.attackerRealmPower);
  const antiFarmModifier = Math.min(1.5, Math.max(0.25, relativeStrength));
  return Math.max(25, Math.round(base * antiFarmModifier));
}

export function makeCommandEnvelope<TCommand extends GameCommand>(input: Omit<CommandEnvelope<TCommand>, "contractVersion">): CommandEnvelope<TCommand> {
  return { contractVersion: GAME_CONTRACT_VERSION, ...input };
}

export function assertCoordinate(x: number, y: number): void {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= WORLD_SIZE || y >= WORLD_SIZE) {
    throw new RangeError(`World coordinate ${x},${y} is outside ${WORLD_SIZE}x${WORLD_SIZE}`);
  }
}
