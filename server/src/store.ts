import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  BUILDINGS,
  GAME_CONTRACT_VERSION,
  TROOPS,
  TROOP_ORDER,
  addArmies,
  armyCasualties,
  armyPopulation,
  armyUnitCount,
  battlePlanScore,
  distanceBetween,
  emptyArmy,
  isValidArmy,
  marchDurationSeconds,
  resolveBattle,
  retreatSurvivors,
  UNPLANNED_ATTACK_PLAN,
  subtractArmy,
  buildingCost,
  buildingDurationSeconds,
  buildingRequirementProblem,
  canAfford,
  createTwoPlayerWorldFixture,
  populationCapacity,
  productionPerHour,
  researchRequirementProblem,
  storageCapacity,
  troopCost,
  troopResearchCost,
  troopResearchDurationSeconds,
  troopRequirementProblem,
  troopTrainingDurationSeconds,
  type Army,
  type BuildingLevels,
  type BuildingType,
  type BattleOutcome,
  type BattlePlan,
  type BattleSessionState,
  type CommandEnvelope,
  type GameCommand,
  type KingdomState,
  type MarchState,
  type PlayerArenaStanding,
  type ResourceStock,
  type ScoutReportState,
  type TroopType,
  type VillageState,
  type WorldState,
} from "../../packages/game-core/src/index.ts";

type DbRow = Record<string, unknown>;

type PlayerRow = {
  id: string;
  username: string;
  kingdom_id: string | null;
};

export type SessionPlayer = {
  id: string;
  username: string;
  kingdomId: string;
};

export type ConstructionJob = {
  id: string;
  villageId: string;
  building: BuildingType;
  targetLevel: number;
  startedAt: string;
  completesAt: string;
};

export type RecruitmentJob = {
  id: string;
  villageId: string;
  troop: TroopType;
  quantity: number;
  startedAt: string;
  completesAt: string;
};

export type ResearchJob = {
  id: string;
  kingdomId: string;
  villageId: string;
  troop: TroopType;
  targetLevel: number;
  startedAt: string;
  completesAt: string;
};

export type VillageEconomy = {
  villageId: string;
  productionPerHour: ResourceStock;
  storageCapacity: number;
  populationUsed: number;
  populationCapacity: number;
};

export type KingdomNotification = {
  id: string;
  kind: "construction" | "recruitment" | "research" | "scout" | "battle" | "march";
  message: string;
  createdAt: string;
};

export type WorldChatMessage = {
  id: string;
  playerId: string;
  kingdomId: string;
  username: string;
  kingdomName: string;
  arenaTier: string;
  body: string;
  sentAt: string;
};

export type SharedWorldSnapshot = {
  snapshotVersion: number;
  serverTime: string;
  player: SessionPlayer;
  kingdom: KingdomState;
  arena: PlayerArenaStanding;
  world: WorldState;
  villageEconomy: VillageEconomy[];
  constructionJobs: ConstructionJob[];
  recruitmentJobs: RecruitmentJob[];
  researchJobs: ResearchJob[];
  marches: MarchState[];
  scoutReports: ScoutReportState[];
  battleSessions: BattleSessionState[];
  notifications: KingdomNotification[];
  chatMessages: WorldChatMessage[];
};

export type StoredWorldEvent = {
  worldId: string;
  worldVersion: number;
  eventSequence: number;
  type: string;
  payload: unknown;
  createdAt: string;
};

export type CommandResult =
  | {
      type: "command.accepted";
      payload: {
        commandId: string;
        worldVersion: number;
        constructionJob?: ConstructionJob;
        recruitmentJob?: RecruitmentJob;
        researchJob?: ResearchJob;
        march?: MarchState;
        scoutReport?: ScoutReportState;
        battle?: BattleSessionState;
      };
    }
  | {
      type: "command.rejected";
      payload: {
        commandId: string;
        code: string;
        message: string;
        currentWorldVersion: number;
      };
    };

type StoreOptions = {
  buildDurationMs?: number;
  recruitDurationMs?: number;
  researchDurationMs?: number;
  marchDurationMs?: number;
  returnDurationMs?: number;
  /**
   * How long an arrived attack waits at the walls for its owner before the
   * server fights it without them. Tests shorten it; production wants it long
   * enough that showing up is a real choice.
   */
  autoResolveMs?: number;
  now?: () => Date;
};

/**
 * Two minutes at the walls. Long enough that a player who is in the world can
 * get to the table and attend; short enough that an attack is never a parked
 * army the owner has to remember to finish.
 */
const DEFAULT_AUTO_RESOLVE_MS = 120_000;

const BUILDING_TYPES = Object.keys(BUILDINGS) as BuildingType[];
const TROOP_TYPES = TROOP_ORDER as readonly TroopType[];
const RESOURCE_KINDS = ["wood", "stone", "iron"] as const;

function parseJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

function passwordDigest(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 64);
}

function sessionTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isValidBattlePlan(plan: unknown): plan is BattlePlan {
  if (!plan || typeof plan !== "object") return false;
  const candidate = plan as BattlePlan;
  return ["West Ridge", "Main Breach", "East Woods"].includes(candidate.entry)
    && ["Vanguard Heavy", "Balanced Army", "Cavalry Wing"].includes(candidate.troops)
    && ["Dawn", "Midday", "Night"].includes(candidate.time)
    && ["Siege Push", "Flanking Strike", "Full Assault"].includes(candidate.style);
}

function arenaTier(points: number): PlayerArenaStanding["tier"] {
  if (points >= 20_000) return "Legend";
  if (points >= 10_000) return "Crown";
  if (points >= 5_000) return "Gold";
  if (points >= 2_000) return "Silver";
  if (points >= 500) return "Bronze";
  return "Unranked";
}

function normalizeUsername(value: string): string {
  const username = value.trim();
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    throw new StoreError("INVALID_USERNAME", "Username must be 3–24 letters, numbers, or underscores.", 400);
  }
  return username;
}

function normalizeKingdomName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 32) {
    throw new StoreError("INVALID_KINGDOM_NAME", "Kingdom name must be 3–32 characters.", 400);
  }
  return name;
}

export class StoreError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "StoreError";
    this.code = code;
    this.status = status;
  }
}

export class SharedWorldStore {
  readonly db: DatabaseSync;
  readonly buildDurationMs: number;
  readonly recruitDurationMs?: number;
  readonly researchDurationMs?: number;
  readonly marchDurationMs?: number;
  readonly returnDurationMs?: number;
  readonly autoResolveMs: number;
  readonly now: () => Date;
  private readonly listeners = new Set<(event: StoredWorldEvent) => void>();

  constructor(databasePath: string, options: StoreOptions = {}) {
    this.db = new DatabaseSync(databasePath);
    this.buildDurationMs = options.buildDurationMs ?? 0;
    this.recruitDurationMs = options.recruitDurationMs;
    this.researchDurationMs = options.researchDurationMs;
    this.marchDurationMs = options.marchDurationMs;
    this.returnDurationMs = options.returnDurationMs;
    this.autoResolveMs = options.autoResolveMs ?? DEFAULT_AUTO_RESOLVE_MS;
    this.now = options.now ?? (() => new Date());
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.migrate();
    this.seedWorld();
    this.ensureEconomyRows();
  }

  close(): void {
    this.db.close();
  }

  subscribe(listener: (event: StoredWorldEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(events: StoredWorldEvent[]): void {
    for (const event of events) {
      for (const listener of this.listeners) listener(event);
    }
  }

  private migrate(): void {
    for (const [version, filename] of [[2, "0002_gate_b_local_sqlite.sql"], [3, "0003_gate_c_economy.sql"], [4, "0004_gate_d_warfare.sql"], [5, "0005_roblox_identity.sql"], [6, "0006_battles_slice_a.sql"]] as const) {
      const migrationPath = fileURLToPath(new URL(`../db/migrations/${filename}`, import.meta.url));
      this.db.exec(readFileSync(migrationPath, "utf8"));
      this.db.prepare("INSERT OR IGNORE INTO local_schema_migrations(version, applied_at) VALUES (?, ?)").run(version, this.now().toISOString());
    }
  }

  private seedWorld(): void {
    const existing = Number((this.db.prepare("SELECT COUNT(*) AS count FROM local_worlds").get() as DbRow).count);
    if (existing > 0) return;

    const createdAt = this.now().toISOString();
    const fixture = createTwoPlayerWorldFixture({ seed: "gate-b-emberfall", createdAt });
    this.withTransaction(() => {
      this.db.prepare(`
        INSERT INTO local_worlds(id, contract_version, version, name, seed, width, height, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(fixture.id, fixture.contractVersion, fixture.version, "World 1 — Emberfall", fixture.seed, fixture.width, fixture.height, fixture.status, fixture.createdAt);

      const insertKingdom = this.db.prepare(`
        INSERT INTO local_kingdoms(
          id, world_id, name, color, seat_kind, controller_player_id, capital_village_id,
          troop_levels_json, war_victory_points, villages_conquered, alive
        ) VALUES (?, ?, ?, ?, 'ai', NULL, ?, ?, ?, ?, ?)
      `);
      for (const [index, kingdom] of fixture.kingdoms.entries()) {
        const initialName = index < 2 ? `Frontier March ${index + 1}` : kingdom.name;
        insertKingdom.run(
          kingdom.id,
          kingdom.worldId,
          initialName,
          kingdom.color,
          kingdom.capitalVillageId,
          JSON.stringify(kingdom.troopLevels),
          kingdom.warVictoryPoints,
          kingdom.villagesConquered,
          kingdom.alive ? 1 : 0,
        );
      }

      const insertVillage = this.db.prepare(`
        INSERT INTO local_villages(
          id, world_id, kingdom_id, name, x, y, is_capital, loyalty,
          resources_json, buildings_json, army_json, state_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const [index, village] of fixture.villages.entries()) {
        insertVillage.run(
          village.id,
          village.worldId,
          village.kingdomId,
          index < 2 ? `Unclaimed Hold ${index + 1}` : village.name,
          village.x,
          village.y,
          village.isCapital ? 1 : 0,
          village.loyalty,
          JSON.stringify(village.resources),
          JSON.stringify(village.buildings),
          JSON.stringify(village.army),
          village.stateVersion,
        );
      }
    });
  }

  private ensureEconomyRows(): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO local_village_economy(village_id, last_materialized_at, resource_carry_json, layout_json)
      SELECT id, ?, '{"wood":0,"stone":0,"iron":0}', '{}' FROM local_villages
    `).run(this.now().toISOString());
  }

  // Shared seat-claim mechanics. register() and linkRobloxPlayer() MUST found
  // kingdoms identically or web- and Roblox-founded kingdoms drift apart
  // structurally; every claim change goes through these two helpers.
  private findOpenSeat(): { kingdomId: string; worldId: string; villageId: string } {
    const seat = this.db.prepare(`
      SELECT id, world_id, capital_village_id
      FROM local_kingdoms
      WHERE controller_player_id IS NULL AND seat_kind = 'ai'
      ORDER BY id
      LIMIT 1
    `).get() as DbRow | undefined;
    if (!seat) throw new StoreError("WORLD_FULL", "This alpha world has no open kingdom seats.", 409);
    return { kingdomId: String(seat.id), worldId: String(seat.world_id), villageId: String(seat.capital_village_id) };
  }

  private occupySeat(seat: { kingdomId: string; worldId: string; villageId: string }, playerId: string, kingdomName: string): StoredWorldEvent {
    this.db.prepare(`
      UPDATE local_kingdoms
      SET controller_player_id = ?, seat_kind = 'human', name = ?
      WHERE id = ?
    `).run(playerId, kingdomName, seat.kingdomId);
    this.db.prepare("UPDATE local_villages SET name = ?, state_version = state_version + 1 WHERE id = ?")
      .run(`${kingdomName} Keep`, seat.villageId);
    const worldVersion = this.incrementWorldVersion(seat.worldId);
    return this.insertEvent(seat.worldId, worldVersion, "kingdom.claimed", {
      kingdomId: seat.kingdomId,
      playerId,
      kingdomName,
    });
  }

  private kingdomNameTaken(name: string): boolean {
    return this.db.prepare("SELECT 1 FROM local_kingdoms WHERE name = ? COLLATE NOCASE").get(name) !== undefined;
  }

  register(input: { username: string; password: string; kingdomName: string }): { token: string; player: SessionPlayer } {
    const username = normalizeUsername(input.username);
    const kingdomName = normalizeKingdomName(input.kingdomName);
    if (input.password.length < 8 || input.password.length > 128) {
      throw new StoreError("INVALID_PASSWORD", "Password must be 8–128 characters.", 400);
    }

    const existing = this.db.prepare("SELECT 1 FROM local_players WHERE username = ?").get(username);
    if (existing) throw new StoreError("USERNAME_TAKEN", "That username is already registered.", 409);
    if (this.kingdomNameTaken(kingdomName)) {
      throw new StoreError("KINGDOM_NAME_TAKEN", "That kingdom name already exists in this world.", 409);
    }

    const playerId = `player-${randomUUID()}`;
    const salt = randomBytes(16);
    const digest = passwordDigest(input.password, salt);
    const createdAt = this.now().toISOString();
    let kingdomId = "";
    const published: StoredWorldEvent[] = [];

    this.withTransaction(() => {
      const seat = this.findOpenSeat();
      kingdomId = seat.kingdomId;
      this.db.prepare(`
        INSERT INTO local_players(id, username, password_salt, password_hash, kingdom_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(playerId, username, salt.toString("hex"), digest.toString("hex"), kingdomId, createdAt);
      published.push(this.occupySeat(seat, playerId, kingdomName));
    });

    const token = this.createSession(playerId);
    this.publish(published);
    return { token, player: { id: playerId, username, kingdomId } };
  }

  linkRobloxPlayer(input: { robloxUserId: number; displayName: string }): { player: SessionPlayer; created: boolean } {
    const robloxUserId = Math.trunc(input.robloxUserId);
    if (!Number.isFinite(robloxUserId) || robloxUserId <= 0) {
      throw new StoreError("INVALID_ROBLOX_USER", "robloxUserId must be a positive integer.", 400);
    }
    const existing = this.peekRobloxPlayer(robloxUserId);
    if (existing) return { player: existing, created: false };

    // Base name is capped at 20 so every generated candidate stays inside
    // normalizeKingdomName's 32-char ceiling ("'s Realm 99" adds 11).
    const baseName = String(input.displayName ?? "").replace(/[^A-Za-z0-9 _-]/g, "").replace(/\s+/g, " ").trim().slice(0, 20).trim() || `Ruler ${robloxUserId % 100000}`;
    const playerId = `player-${randomUUID()}`;
    // The ':' namespace is un-squattable: normalizeUsername rejects ':' on the
    // web register path, so no web account can ever pre-claim this username.
    const username = `roblox:${robloxUserId}`;
    const createdAt = this.now().toISOString();
    let kingdomId = "";
    const published: StoredWorldEvent[] = [];

    this.withTransaction(() => {
      const seat = this.findOpenSeat();
      kingdomId = seat.kingdomId;

      let kingdomName = "";
      const candidates = [`${baseName}'s Realm`];
      for (let suffix = 2; suffix <= 99; suffix += 1) candidates.push(`${baseName}'s Realm ${suffix}`);
      for (const candidate of candidates) {
        if (!this.kingdomNameTaken(candidate)) {
          kingdomName = candidate;
          break;
        }
      }
      if (!kingdomName) kingdomName = normalizeKingdomName(`Realm ${playerId.slice(7, 15)}`);

      this.db.prepare(`
        INSERT INTO local_players(id, username, password_salt, password_hash, kingdom_id, created_at)
        VALUES (?, ?, '', '', ?, ?)
      `).run(playerId, username, kingdomId, createdAt);
      this.db.prepare("INSERT INTO roblox_players(roblox_user_id, player_id, created_at) VALUES (?, ?, ?)")
        .run(robloxUserId, playerId, createdAt);
      published.push(this.occupySeat(seat, playerId, normalizeKingdomName(kingdomName)));
    });

    this.publish(published);
    return { player: { id: playerId, username, kingdomId }, created: true };
  }

  peekRobloxPlayer(robloxUserId: number): SessionPlayer | null {
    const row = this.db.prepare(`
      SELECT p.id, p.username, p.kingdom_id
      FROM roblox_players r JOIN local_players p ON p.id = r.player_id
      WHERE r.roblox_user_id = ?
    `).get(Math.trunc(robloxUserId)) as DbRow | undefined;
    return row ? { id: String(row.id), username: String(row.username), kingdomId: String(row.kingdom_id) } : null;
  }

  login(input: { username: string; password: string }): { token: string; player: SessionPlayer } {
    const username = normalizeUsername(input.username);
    const row = this.db.prepare(`
      SELECT id, username, kingdom_id, password_salt, password_hash
      FROM local_players WHERE username = ?
    `).get(username) as DbRow | undefined;
    if (!row) throw new StoreError("INVALID_LOGIN", "Username or password is incorrect.", 401);
    const expected = Buffer.from(String(row.password_hash), "hex");
    const actual = passwordDigest(input.password, Buffer.from(String(row.password_salt), "hex"));
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new StoreError("INVALID_LOGIN", "Username or password is incorrect.", 401);
    }
    const player = {
      id: String(row.id),
      username: String(row.username),
      kingdomId: String(row.kingdom_id),
    };
    return { token: this.createSession(player.id), player };
  }

  logout(token: string): void {
    this.db.prepare("DELETE FROM local_sessions WHERE token_hash = ?").run(sessionTokenHash(token));
  }

  authenticate(token: string | undefined): SessionPlayer | null {
    if (!token) return null;
    const row = this.db.prepare(`
      SELECT p.id, p.username, p.kingdom_id
      FROM local_sessions s
      JOIN local_players p ON p.id = s.player_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(sessionTokenHash(token), this.now().toISOString()) as PlayerRow | undefined;
    if (!row?.kingdom_id) return null;
    return { id: row.id, username: row.username, kingdomId: row.kingdom_id };
  }

  private createSession(playerId: string): string {
    const token = randomBytes(32).toString("base64url");
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    this.db.prepare(`
      INSERT INTO local_sessions(token_hash, player_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(sessionTokenHash(token), playerId, expiresAt.toISOString(), createdAt.toISOString());
    return token;
  }

  getSnapshot(player: SessionPlayer, options: { skipMaterialize?: boolean } = {}): SharedWorldSnapshot {
    if (!options.skipMaterialize) this.materializeDueJobs();
    const kingdomRow = this.db.prepare("SELECT * FROM local_kingdoms WHERE id = ?").get(player.kingdomId) as DbRow | undefined;
    if (!kingdomRow) throw new StoreError("KINGDOM_NOT_FOUND", "The player's kingdom no longer exists.", 404);
    const worldId = String(kingdomRow.world_id);
    const fullWorld = this.readWorld(worldId);
    const kingdom = fullWorld.kingdoms.find((candidate) => candidate.id === player.kingdomId);
    if (!kingdom) throw new StoreError("KINGDOM_NOT_FOUND", "The player's kingdom is missing from its world.", 404);
    const world: WorldState = {
      ...fullWorld,
      villages: fullWorld.villages.map((village) => village.kingdomId === player.kingdomId ? village : {
        ...village,
        resources: { wood: 0, stone: 0, iron: 0 },
        buildings: Object.fromEntries(BUILDING_TYPES.map((building) => [building, 0])) as BuildingLevels,
        army: emptyArmy(),
      }),
    };
    const jobs = (this.db.prepare(`
      SELECT id, village_id, building, target_level, started_at, completes_at
      FROM local_construction_jobs
      WHERE world_id = ? AND status = 'queued'
        AND village_id IN (SELECT id FROM local_villages WHERE kingdom_id = ?)
      ORDER BY completes_at
    `).all(worldId, player.kingdomId) as DbRow[]).map((row) => ({
      id: String(row.id),
      villageId: String(row.village_id),
      building: String(row.building) as BuildingType,
      targetLevel: Number(row.target_level),
      startedAt: String(row.started_at),
      completesAt: String(row.completes_at),
    }));
    const chatMessages = (this.db.prepare(`
      SELECT id, player_id, kingdom_id, username, kingdom_name, arena_tier, body, sent_at
      FROM local_chat_messages WHERE world_id = ?
      ORDER BY sent_at DESC, id DESC LIMIT 50
    `).all(worldId) as DbRow[]).reverse().map((row) => ({
      id: String(row.id),
      playerId: String(row.player_id),
      kingdomId: String(row.kingdom_id),
      username: String(row.username),
      kingdomName: String(row.kingdom_name),
      arenaTier: String(row.arena_tier),
      body: String(row.body),
      sentAt: String(row.sent_at),
    }));
    return {
      snapshotVersion: world.version,
      serverTime: this.now().toISOString(),
      player,
      kingdom,
      arena: {
        playerId: player.id,
        seasonId: "season-1",
        warVictoryPoints: kingdom.warVictoryPoints,
        worldWins: 0,
        villagesConquered: kingdom.villagesConquered,
        tier: arenaTier(kingdom.warVictoryPoints),
      },
      world,
      villageEconomy: fullWorld.villages.filter((village) => village.kingdomId === player.kingdomId).map((village) => this.readVillageEconomy(village)),
      constructionJobs: jobs,
      recruitmentJobs: this.readRecruitmentJobs(worldId).filter((job) => fullWorld.villages.some((village) => village.id === job.villageId && village.kingdomId === player.kingdomId)),
      researchJobs: this.readResearchJobs(worldId).filter((job) => job.kingdomId === player.kingdomId),
      marches: this.readMarches(player.kingdomId),
      scoutReports: this.readScoutReports(player.kingdomId),
      battleSessions: this.readBattleSessions(player.kingdomId),
      notifications: (this.db.prepare(`
        SELECT id, kind, message, created_at FROM local_kingdom_notifications
        WHERE kingdom_id = ? ORDER BY created_at DESC, id DESC LIMIT 12
      `).all(player.kingdomId) as DbRow[]).map((row) => ({
        id: String(row.id),
        kind: String(row.kind) as KingdomNotification["kind"],
        message: String(row.message),
        createdAt: String(row.created_at),
      })),
      chatMessages,
    };
  }

  readEvents(worldId: string, sinceVersion: number): StoredWorldEvent[] {
    return (this.db.prepare(`
      SELECT world_id, world_version, event_sequence, event_type, payload_json, created_at
      FROM local_world_events
      WHERE world_id = ? AND world_version > ?
      ORDER BY world_version, event_sequence
    `).all(worldId, sinceVersion) as DbRow[]).map((row) => ({
      worldId: String(row.world_id),
      worldVersion: Number(row.world_version),
      eventSequence: Number(row.event_sequence),
      type: String(row.event_type),
      payload: parseJson(row.payload_json),
      createdAt: String(row.created_at),
    }));
  }

  applyCommand(player: SessionPlayer, envelope: CommandEnvelope): CommandResult {
    const duplicate = this.db.prepare("SELECT player_id, result_json FROM local_command_inbox WHERE command_id = ?")
      .get(envelope.commandId) as DbRow | undefined;
    if (duplicate) {
      if (String(duplicate.player_id) !== player.id) {
        return this.reject(envelope.commandId, "FORBIDDEN", "That command ID belongs to another player.", this.currentWorldVersion(envelope.worldId));
      }
      return parseJson<CommandResult>(duplicate.result_json);
    }

    if (envelope.contractVersion !== GAME_CONTRACT_VERSION) {
      return this.storeRejected(player, envelope, "INVALID_CONTRACT", "The client contract version is not supported.");
    }
    if (envelope.actorPlayerId !== player.id) {
      return this.storeRejected(player, envelope, "FORBIDDEN", "The command actor does not match the authenticated player.");
    }
    if (envelope.worldId !== this.worldIdForKingdom(player.kingdomId)) {
      return this.storeRejected(player, envelope, "FORBIDDEN", "The player does not belong to that world.");
    }
    if (!["village.build.queue", "village.recruit.queue", "kingdom.research.queue", "march.launch", "battle.open", "battle.order", "battle.retreat", "battle.resolve", "chat.send"].includes(envelope.command.type)) {
      return this.storeRejected(player, envelope, "INVALID_COMMAND", "This world command is not active yet.");
    }

    this.materializeDueJobs();
    let result!: CommandResult;
    const published: StoredWorldEvent[] = [];
    this.withTransaction(() => {
      const currentVersion = this.currentWorldVersion(envelope.worldId);
      if (currentVersion !== envelope.expectedWorldVersion) {
        result = this.reject(envelope.commandId, "WORLD_VERSION_CONFLICT", "The world changed before this command was applied.", currentVersion);
        this.insertCommand(player, envelope, result);
        return;
      }

      if (envelope.command.type === "chat.send") {
        const body = envelope.command.payload.body.trim().replace(/\s+/g, " ");
        if (envelope.command.payload.channelId !== `world:${envelope.worldId}` || body.length < 1 || body.length > 280) {
          result = this.reject(envelope.commandId, "INVALID_COMMAND", "World chat messages must contain 1–280 characters.", currentVersion);
          this.insertCommand(player, envelope, result);
          return;
        }
        const kingdomRow = this.db.prepare("SELECT name, war_victory_points FROM local_kingdoms WHERE id = ? AND controller_player_id = ?")
          .get(player.kingdomId, player.id) as DbRow | undefined;
        if (!kingdomRow) {
          result = this.reject(envelope.commandId, "FORBIDDEN", "The player does not control a kingdom in this world.", currentVersion);
          this.insertCommand(player, envelope, result);
          return;
        }
        const message: WorldChatMessage = {
          id: `message-${randomUUID()}`,
          playerId: player.id,
          kingdomId: player.kingdomId,
          username: player.username,
          kingdomName: String(kingdomRow.name),
          arenaTier: arenaTier(Number(kingdomRow.war_victory_points)),
          body,
          sentAt: this.now().toISOString(),
        };
        this.db.prepare(`
          INSERT INTO local_chat_messages(id, world_id, player_id, kingdom_id, username, kingdom_name, arena_tier, body, sent_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(message.id, envelope.worldId, message.playerId, message.kingdomId, message.username, message.kingdomName, message.arenaTier, message.body, message.sentAt);
        const worldVersion = this.incrementWorldVersion(envelope.worldId);
        published.push(this.insertEvent(envelope.worldId, worldVersion, "chat.message", { message }));
        result = { type: "command.accepted", payload: { commandId: envelope.commandId, worldVersion } };
        this.insertCommand(player, envelope, result);
        return;
      }

      if (["march.launch", "battle.open", "battle.order", "battle.retreat", "battle.resolve"].includes(envelope.command.type)) {
        result = this.applyWarCommand(player, envelope, currentVersion, published);
        this.insertCommand(player, envelope, result);
        return;
      }

      if (envelope.command.type === "village.recruit.queue") {
        result = this.queueRecruitment(player, envelope, envelope.command.payload, currentVersion, published);
        this.insertCommand(player, envelope, result);
        return;
      }

      if (envelope.command.type === "kingdom.research.queue") {
        result = this.queueResearch(player, envelope, envelope.command.payload, currentVersion, published);
        this.insertCommand(player, envelope, result);
        return;
      }

      const payload = envelope.command.payload;
      if (!BUILDING_TYPES.includes(payload.building)) {
        result = this.reject(envelope.commandId, "INVALID_COMMAND", "Unknown building type.", currentVersion);
        this.insertCommand(player, envelope, result);
        return;
      }
      const villageRow = this.db.prepare(`
        SELECT v.*, k.controller_player_id
        FROM local_villages v
        JOIN local_kingdoms k ON k.id = v.kingdom_id
        WHERE v.id = ? AND v.world_id = ?
      `).get(payload.villageId, envelope.worldId) as DbRow | undefined;
      if (!villageRow || String(villageRow.controller_player_id) !== player.id) {
        result = this.reject(envelope.commandId, "FORBIDDEN", "The player does not own that village.", currentVersion);
        this.insertCommand(player, envelope, result);
        return;
      }
      const queued = this.db.prepare("SELECT 1 FROM local_construction_jobs WHERE village_id = ? AND status = 'queued'")
        .get(payload.villageId);
      if (queued) {
        result = this.reject(envelope.commandId, "QUEUE_FULL", "That village already has an active construction job.", currentVersion);
        this.insertCommand(player, envelope, result);
        return;
      }

      const resources = parseJson<ResourceStock>(villageRow.resources_json);
      const buildings = parseJson<BuildingLevels>(villageRow.buildings_json);
      const currentLevel = buildings[payload.building];
      const prerequisiteProblem = buildingRequirementProblem(payload.building, buildings);
      if (prerequisiteProblem) {
        result = this.reject(envelope.commandId, "PREREQUISITE_MISSING", prerequisiteProblem, currentVersion);
        this.insertCommand(player, envelope, result);
        return;
      }
      const cost = buildingCost(payload.building, currentLevel);
      if (!canAfford(resources, cost)) {
        result = this.reject(envelope.commandId, "INSUFFICIENT_RESOURCES", "The village cannot afford that upgrade.", currentVersion);
        this.insertCommand(player, envelope, result);
        return;
      }
      resources.wood -= cost.wood;
      resources.stone -= cost.stone;
      resources.iron -= cost.iron;
      const startedAt = this.now();
      const durationMs = this.buildDurationMs || buildingDurationSeconds(payload.building, currentLevel, buildings.hq) * 1000;
      const job: ConstructionJob = {
        id: `construction-${randomUUID()}`,
        villageId: payload.villageId,
        building: payload.building,
        targetLevel: currentLevel + 1,
        startedAt: startedAt.toISOString(),
        completesAt: new Date(startedAt.getTime() + durationMs).toISOString(),
      };
      this.db.prepare("UPDATE local_villages SET resources_json = ?, state_version = state_version + 1 WHERE id = ?")
        .run(JSON.stringify(resources), payload.villageId);
      this.db.prepare(`
        INSERT INTO local_construction_jobs(id, world_id, village_id, building, target_level, started_at, completes_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')
      `).run(job.id, envelope.worldId, job.villageId, job.building, job.targetLevel, job.startedAt, job.completesAt);
      const worldVersion = this.incrementWorldVersion(envelope.worldId);
      const village = this.readVillage(payload.villageId);
      published.push(this.insertEvent(envelope.worldId, worldVersion, "village.changed", { village, constructionJob: job }));
      result = { type: "command.accepted", payload: { commandId: envelope.commandId, worldVersion, constructionJob: job } };
      this.insertCommand(player, envelope, result);
    });
    this.publish(published);
    return result;
  }

  private applyWarCommand(
    player: SessionPlayer,
    envelope: CommandEnvelope,
    currentVersion: number,
    published: StoredWorldEvent[],
  ): CommandResult {
    const command = envelope.command;
    if (command.type === "march.launch") {
      const { fromVillageId, targetVillageId, kind, army, plan: launchPlan } = command.payload;
      if (!isValidArmy(army) || armyUnitCount(army) < 1 || !["scout", "attack"].includes(kind)) {
        return this.reject(envelope.commandId, "INVALID_ARMY", "Send a valid scout or attack formation with at least one troop.", currentVersion);
      }
      if (kind === "scout" && (army.scout < 1 || TROOP_TYPES.some((troop) => troop !== "scout" && army[troop] > 0))) {
        return this.reject(envelope.commandId, "INVALID_ARMY", "Scouting marches may contain scouts only.", currentVersion);
      }
      if (kind === "attack" && TROOP_TYPES.every((troop) => TROOPS[troop].attack === 0 || army[troop] === 0)) {
        return this.reject(envelope.commandId, "INVALID_ARMY", "An attack needs at least one combat troop.", currentVersion);
      }
      if (kind === "attack" && !this.db.prepare("SELECT 1 FROM local_scout_reports WHERE kingdom_id = ? AND target_village_id = ? LIMIT 1").get(player.kingdomId, targetVillageId)) {
        return this.reject(envelope.commandId, "SCOUT_REQUIRED", "Scout this village before committing an attack march.", currentVersion);
      }
      // The plan is chosen when the attack is DESIGNED (spec SS5: at the war
      // table), not when it lands — otherwise an attack whose owner is offline
      // on arrival has no orders to be fought under and strands forever.
      if (launchPlan !== undefined && !isValidBattlePlan(launchPlan)) {
        return this.reject(envelope.commandId, "INVALID_PLAN", "The attack plan contains an unknown order.", currentVersion);
      }
      const from = this.ownedVillageRow(player, envelope.worldId, fromVillageId);
      const target = this.db.prepare("SELECT * FROM local_villages WHERE id = ? AND world_id = ?").get(targetVillageId, envelope.worldId) as DbRow | undefined;
      if (!from) return this.reject(envelope.commandId, "FORBIDDEN", "The player does not own the departure village.", currentVersion);
      if (!target || String(target.kingdom_id) === player.kingdomId || targetVillageId === fromVillageId) {
        return this.reject(envelope.commandId, "INVALID_TARGET", "Choose a foreign village in this world.", currentVersion);
      }
      const remaining = subtractArmy(parseJson<Army>(from.army_json), army);
      if (!remaining) return this.reject(envelope.commandId, "INSUFFICIENT_TROOPS", "Those troops are not available in the departure village.", currentVersion);
      const departedAt = this.now();
      const distance = distanceBetween({ x: Number(from.x), y: Number(from.y) }, { x: Number(target.x), y: Number(target.y) });
      const durationMs = this.marchDurationMs ?? marchDurationSeconds(distance, kind) * 1000;
      const march: MarchState = {
        id: `march-${randomUUID()}`,
        worldId: envelope.worldId,
        kingdomId: player.kingdomId,
        fromVillageId,
        targetVillageId,
        kind,
        status: "outbound",
        army,
        loot: { wood: 0, stone: 0, iron: 0 },
        departedAt: departedAt.toISOString(),
        arrivesAt: new Date(departedAt.getTime() + durationMs).toISOString(),
        battleId: null,
      };
      this.db.prepare("UPDATE local_villages SET army_json = ?, state_version = state_version + 1 WHERE id = ?")
        .run(JSON.stringify(remaining), fromVillageId);
      this.db.prepare(`
        INSERT INTO local_marches(id, world_id, kingdom_id, from_village_id, target_village_id, kind, status, army_json, loot_json, departed_at, arrives_at, battle_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(march.id, march.worldId, march.kingdomId, march.fromVillageId, march.targetVillageId, march.kind, march.status, JSON.stringify(march.army), JSON.stringify(march.loot), march.departedAt, march.arrivesAt);
      if (kind === "attack") {
        // auto_resolve_at stays NULL until the march ARRIVES: the deadline is
        // how long the attacker has at the walls, not how long the road is.
        this.db.prepare("INSERT INTO local_march_plans(march_id, plan_json, auto_resolve_at) VALUES (?, ?, NULL)")
          .run(march.id, JSON.stringify(launchPlan ?? UNPLANNED_ATTACK_PLAN));
      }
      const worldVersion = this.incrementWorldVersion(envelope.worldId);
      published.push(this.insertEvent(envelope.worldId, worldVersion, "march.changed", { march, village: this.readVillage(fromVillageId) }));
      return { type: "command.accepted", payload: { commandId: envelope.commandId, worldVersion, march } };
    }

    if (command.type === "battle.open") {
      const marchRow = this.attackMarchRow(String(command.payload.marchId), envelope.worldId, player.kingdomId);
      if (!marchRow || String(marchRow.kind) !== "attack" || String(marchRow.status) !== "awaiting_battle") {
        return this.reject(envelope.commandId, "MARCH_NOT_READY", "That attack has not reached the target or already entered battle.", currentVersion);
      }
      if (!this.db.prepare(`
        SELECT 1 FROM local_scout_reports
        WHERE kingdom_id = ? AND target_village_id = ? AND target_village_version = ? LIMIT 1
      `).get(player.kingdomId, String(marchRow.target_village_id), command.payload.targetVillageVersion)) {
        return this.reject(envelope.commandId, "STALE_SCOUT_REPORT", "The defender changed after your report. Scout again before opening battle.", currentVersion);
      }
      const plan = command.payload.plan;
      if (!isValidBattlePlan(plan)) {
        return this.reject(envelope.commandId, "INVALID_PLAN", "The attack plan contains an unknown order.", currentVersion);
      }
      const battleId = this.openBattleSession(envelope.worldId, String(command.payload.marchId), marchRow, player.kingdomId, plan);
      const worldVersion = this.incrementWorldVersion(envelope.worldId);
      const battle = this.readBattle(battleId)!;
      published.push(this.insertEvent(envelope.worldId, worldVersion, "battle.started", { battle }));
      return { type: "command.accepted", payload: { commandId: envelope.commandId, worldVersion, battle } };
    }

    if (command.type === "battle.order") {
      const battle = this.db.prepare("SELECT status, attacker_kingdom_id FROM local_battle_sessions WHERE id = ? AND world_id = ?")
        .get(command.payload.battleId, envelope.worldId) as DbRow | undefined;
      const nextSequence = Number((this.db.prepare("SELECT COUNT(*) AS count FROM local_battle_orders WHERE battle_id = ?").get(command.payload.battleId) as DbRow).count) + 1;
      if (!battle || String(battle.attacker_kingdom_id) !== player.kingdomId || String(battle.status) !== "open") {
        return this.reject(envelope.commandId, "BATTLE_CLOSED", "That battle is not accepting field orders.", currentVersion);
      }
      const { sequence, squad, x, y, atMs } = command.payload;
      if (sequence !== nextSequence || !["vanguard", "archers", "riders"].includes(squad)
        || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 5000 || y > 5000
        || !Number.isInteger(atMs) || atMs < 0 || atMs > 600_000) {
        return this.reject(envelope.commandId, "INVALID_ORDER", `The next valid battle order is sequence ${nextSequence}.`, currentVersion);
      }
      this.db.prepare("INSERT INTO local_battle_orders(battle_id, sequence, squad, x, y, at_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(command.payload.battleId, sequence, squad, x, y, atMs, this.now().toISOString());
      return { type: "command.accepted", payload: { commandId: envelope.commandId, worldVersion: currentVersion } };
    }

    if (command.type === "battle.retreat") {
      const row = this.battleResolutionRow(command.payload.battleId, envelope.worldId, player.kingdomId);
      if (!row || String(row.status) !== "open") return this.reject(envelope.commandId, "BATTLE_CLOSED", "That battle can no longer retreat.", currentVersion);
      const acceptedOrders = Number(row.order_count);
      if (command.payload.sequence !== acceptedOrders + 1 || !Number.isInteger(command.payload.atMs) || command.payload.atMs < 0 || command.payload.atMs > 600_000) {
        return this.reject(envelope.commandId, "INVALID_ORDER", `The retreat must use sequence ${acceptedOrders + 1}.`, currentVersion);
      }
      const attacker = parseJson<Army>(row.attacker_army_json);
      const defender = parseJson<Army>(row.defender_army_json);
      const survivors = retreatSurvivors(attacker, command.payload.atMs, acceptedOrders, String(row.seed));
      const outcome = {
        winner: "defender" as const,
        attackerSurvivors: survivors,
        defenderSurvivors: defender,
        attackerCasualties: armyCasualties(attacker, survivors),
        defenderCasualties: emptyArmy(),
        loot: { wood: 0, stone: 0, iron: 0 },
        planScore: battlePlanScore(parseJson(row.plan_json)),
        orderBonus: Math.min(0.12, acceptedOrders * 0.02),
        // Nobody yields to an army that ran away.
        yielded: emptyArmy(),
      };
      return this.finishBattle(envelope, row, outcome, "retreated", published);
    }

    if (command.type === "battle.resolve") {
      const row = this.battleResolutionRow(command.payload.battleId, envelope.worldId, player.kingdomId);
      if (!row || String(row.status) !== "open") return this.reject(envelope.commandId, "BATTLE_CLOSED", "That battle has already ended.", currentVersion);
      const outcome = resolveBattle({
        attacker: parseJson(row.attacker_army_json),
        defender: parseJson(row.defender_army_json),
        attackerLevels: parseJson(row.attacker_levels_json),
        defenderLevels: parseJson(row.defender_levels_json),
        defenderWallLevel: Number(row.defender_wall_level),
        defenderResources: parseJson(row.defender_resources_json),
        plan: parseJson(row.plan_json),
        acceptedOrders: Number(row.order_count),
        seed: String(row.seed),
      });
      return this.finishBattle(envelope, row, outcome, "resolved", published);
    }

    return this.reject(envelope.commandId, "INVALID_COMMAND", "That warfare command is not active.", currentVersion);
  }

  private queueRecruitment(
    player: SessionPlayer,
    envelope: CommandEnvelope,
    payload: Extract<GameCommand, { type: "village.recruit.queue" }>["payload"],
    currentVersion: number,
    published: StoredWorldEvent[],
  ): CommandResult {
    if (!TROOP_TYPES.includes(payload.troop) || !Number.isInteger(payload.quantity) || payload.quantity < 1 || payload.quantity > 100) {
      return this.reject(envelope.commandId, "INVALID_COMMAND", "Recruitment orders must contain 1–100 valid troops.", currentVersion);
    }
    const villageRow = this.ownedVillageRow(player, envelope.worldId, payload.villageId);
    if (!villageRow) return this.reject(envelope.commandId, "FORBIDDEN", "The player does not own that village.", currentVersion);
    if (this.db.prepare("SELECT 1 FROM local_recruitment_jobs WHERE village_id = ? AND status = 'queued'").get(payload.villageId)) {
      return this.reject(envelope.commandId, "QUEUE_FULL", "That village already has an active recruitment order.", currentVersion);
    }
    const resources = parseJson<ResourceStock>(villageRow.resources_json);
    const buildings = parseJson<BuildingLevels>(villageRow.buildings_json);
    const army = parseJson<Army>(villageRow.army_json);
    const prerequisiteProblem = troopRequirementProblem(payload.troop, buildings);
    if (prerequisiteProblem) return this.reject(envelope.commandId, "PREREQUISITE_MISSING", prerequisiteProblem, currentVersion);
    const cost = troopCost(payload.troop, payload.quantity);
    if (!canAfford(resources, cost)) return this.reject(envelope.commandId, "INSUFFICIENT_RESOURCES", "The village cannot afford that recruitment order.", currentVersion);
    const usedPopulation = armyPopulation(army) + this.queuedPopulation(payload.villageId);
    if (usedPopulation + TROOPS[payload.troop].population * payload.quantity > populationCapacity(buildings.farm)) {
      return this.reject(envelope.commandId, "POPULATION_FULL", "Upgrade the Farm before recruiting that many troops.", currentVersion);
    }
    for (const kind of RESOURCE_KINDS) resources[kind] -= cost[kind];
    const startedAt = this.now();
    const durationMs = this.recruitDurationMs ?? troopTrainingDurationSeconds(payload.troop, payload.quantity, buildings) * 1000;
    const job: RecruitmentJob = {
      id: `recruitment-${randomUUID()}`,
      villageId: payload.villageId,
      troop: payload.troop,
      quantity: payload.quantity,
      startedAt: startedAt.toISOString(),
      completesAt: new Date(startedAt.getTime() + durationMs).toISOString(),
    };
    this.updateVillageResources(payload.villageId, resources);
    this.db.prepare(`
      INSERT INTO local_recruitment_jobs(id, world_id, village_id, troop, quantity, started_at, completes_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')
    `).run(job.id, envelope.worldId, job.villageId, job.troop, job.quantity, job.startedAt, job.completesAt);
    const worldVersion = this.incrementWorldVersion(envelope.worldId);
    published.push(this.insertEvent(envelope.worldId, worldVersion, "recruitment.queued", { villageId: payload.villageId, recruitmentJob: job }));
    return { type: "command.accepted", payload: { commandId: envelope.commandId, worldVersion, recruitmentJob: job } };
  }

  private queueResearch(
    player: SessionPlayer,
    envelope: CommandEnvelope,
    payload: Extract<GameCommand, { type: "kingdom.research.queue" }>["payload"],
    currentVersion: number,
    published: StoredWorldEvent[],
  ): CommandResult {
    if (!TROOP_TYPES.includes(payload.troop)) return this.reject(envelope.commandId, "INVALID_COMMAND", "Unknown troop research.", currentVersion);
    const villageRow = this.ownedVillageRow(player, envelope.worldId, payload.villageId);
    if (!villageRow) return this.reject(envelope.commandId, "FORBIDDEN", "The player does not own that village.", currentVersion);
    if (this.db.prepare("SELECT 1 FROM local_research_jobs WHERE kingdom_id = ? AND status = 'queued'").get(player.kingdomId)) {
      return this.reject(envelope.commandId, "QUEUE_FULL", "That kingdom already has active troop research.", currentVersion);
    }
    const kingdomRow = this.db.prepare("SELECT troop_levels_json FROM local_kingdoms WHERE id = ?").get(player.kingdomId) as DbRow;
    const troopLevels = parseJson<Record<TroopType, number>>(kingdomRow.troop_levels_json);
    if (payload.targetLevel !== troopLevels[payload.troop] + 1) {
      return this.reject(envelope.commandId, "INVALID_COMMAND", `The next ${TROOPS[payload.troop].name} research level is ${troopLevels[payload.troop] + 1}.`, currentVersion);
    }
    const resources = parseJson<ResourceStock>(villageRow.resources_json);
    const buildings = parseJson<BuildingLevels>(villageRow.buildings_json);
    const prerequisiteProblem = researchRequirementProblem(payload.troop, payload.targetLevel, buildings);
    if (prerequisiteProblem) return this.reject(envelope.commandId, "PREREQUISITE_MISSING", prerequisiteProblem, currentVersion);
    const cost = troopResearchCost(payload.troop, payload.targetLevel);
    if (!canAfford(resources, cost)) return this.reject(envelope.commandId, "INSUFFICIENT_RESOURCES", "The village cannot fund that research.", currentVersion);
    for (const kind of RESOURCE_KINDS) resources[kind] -= cost[kind];
    const startedAt = this.now();
    const durationMs = this.researchDurationMs ?? troopResearchDurationSeconds(payload.targetLevel, buildings.academy) * 1000;
    const job: ResearchJob = {
      id: `research-${randomUUID()}`,
      kingdomId: player.kingdomId,
      villageId: payload.villageId,
      troop: payload.troop,
      targetLevel: payload.targetLevel,
      startedAt: startedAt.toISOString(),
      completesAt: new Date(startedAt.getTime() + durationMs).toISOString(),
    };
    this.updateVillageResources(payload.villageId, resources);
    this.db.prepare(`
      INSERT INTO local_research_jobs(id, world_id, kingdom_id, village_id, troop, target_level, started_at, completes_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued')
    `).run(job.id, envelope.worldId, job.kingdomId, job.villageId, job.troop, job.targetLevel, job.startedAt, job.completesAt);
    const worldVersion = this.incrementWorldVersion(envelope.worldId);
    published.push(this.insertEvent(envelope.worldId, worldVersion, "research.queued", { researchJob: job }));
    return { type: "command.accepted", payload: { commandId: envelope.commandId, worldVersion, researchJob: job } };
  }

  private battleResolutionRow(battleId: string, worldId: string, kingdomId: string): DbRow | undefined {
    return this.db.prepare(`
      SELECT b.*, m.from_village_id, m.target_village_id, v.state_version AS current_defender_version,
        (SELECT COUNT(*) FROM local_battle_orders o WHERE o.battle_id = b.id) AS order_count
      FROM local_battle_sessions b
      JOIN local_marches m ON m.id = b.march_id
      JOIN local_villages v ON v.id = b.defender_village_id
      WHERE b.id = ? AND b.world_id = ? AND b.attacker_kingdom_id = ?
    `).get(battleId, worldId, kingdomId) as DbRow | undefined;
  }

  /** The attack march joined to everything a battle needs from its target. */
  private attackMarchRow(marchId: string, worldId: string, kingdomId: string): DbRow | undefined {
    return this.db.prepare(`
      SELECT m.*, v.state_version AS defender_version, v.kingdom_id AS defender_kingdom_id,
        v.army_json AS defender_army_json, v.resources_json AS defender_resources_json,
        v.buildings_json AS defender_buildings_json
      FROM local_marches m JOIN local_villages v ON v.id = m.target_village_id
      WHERE m.id = ? AND m.world_id = ? AND m.kingdom_id = ?
    `).get(marchId, worldId, kingdomId) as DbRow | undefined;
  }

  /**
   * Freeze a battle: both armies, both troop level sets, the wall and the
   * defender's stores as they stand right now. Shared by the player opening a
   * battle they are attending and by the server fighting one they are not, so
   * an unattended battle can never be scored off different numbers.
   */
  private openBattleSession(worldId: string, marchId: string, marchRow: DbRow, attackerKingdomId: string, plan: BattlePlan): string {
    const attackerKingdom = this.db.prepare("SELECT troop_levels_json FROM local_kingdoms WHERE id = ?").get(attackerKingdomId) as DbRow;
    const defenderKingdom = this.db.prepare("SELECT troop_levels_json FROM local_kingdoms WHERE id = ?").get(String(marchRow.defender_kingdom_id)) as DbRow;
    const defenderBuildings = parseJson<BuildingLevels>(marchRow.defender_buildings_json);
    const openedAt = this.now().toISOString();
    const battleId = `battle-${randomUUID()}`;
    const seed = createHash("sha256").update(`${worldId}:${marchId}:${openedAt}`).digest("hex").slice(0, 24);
    this.db.prepare(`
      INSERT INTO local_battle_sessions(
        id, march_id, world_id, attacker_kingdom_id, defender_kingdom_id, attacker_village_id, defender_village_id,
        defender_village_version, status, plan_json, seed, attacker_army_json, defender_army_json,
        attacker_levels_json, defender_levels_json, defender_wall_level, defender_resources_json, outcome_json, opened_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)
    `).run(
      battleId, marchId, worldId, attackerKingdomId, String(marchRow.defender_kingdom_id),
      String(marchRow.from_village_id), String(marchRow.target_village_id), Number(marchRow.defender_version), JSON.stringify(plan), seed,
      String(marchRow.army_json), String(marchRow.defender_army_json), String(attackerKingdom.troop_levels_json),
      String(defenderKingdom.troop_levels_json), defenderBuildings.wall, String(marchRow.defender_resources_json), openedAt,
    );
    this.db.prepare("UPDATE local_marches SET battle_id = ? WHERE id = ?").run(battleId, marchId);
    return battleId;
  }

  /**
   * Attacks whose owner never showed up. Spec SS5: "If offline, the server
   * resolves it from the plan and stats... Offline attacks work; showing up
   * matters." Showing up still matters because attendance is the only way to
   * earn the accepted-orders bonus — the server gives whatever orders were
   * actually issued, which for an absent commander is none.
   *
   * Deliberately does NOT re-check scout-report freshness the way battle.open
   * does: that rule stops a PLAYER attacking on stale intel, and applying it
   * here would strand the army all over again for a defender who simply built
   * something while the march was on the road.
   */
  private materializeDueBattles(now: Date, published: StoredWorldEvent[]): void {
    const due = this.db.prepare(`
      SELECT m.id AS march_id, m.world_id, m.kingdom_id, m.battle_id, p.plan_json
      FROM local_marches m JOIN local_march_plans p ON p.march_id = m.id
      WHERE m.status = 'awaiting_battle' AND p.auto_resolve_at IS NOT NULL AND p.auto_resolve_at <= ?
      ORDER BY p.auto_resolve_at, m.id
    `).all(now.toISOString()) as DbRow[];
    for (const entry of due) {
      const worldId = String(entry.world_id);
      const kingdomId = String(entry.kingdom_id);
      const marchId = String(entry.march_id);
      const storedPlan = parseJson<BattlePlan>(entry.plan_json);
      const plan = isValidBattlePlan(storedPlan) ? storedPlan : UNPLANNED_ATTACK_PLAN;
      let battleId = entry.battle_id ? String(entry.battle_id) : null;
      if (!battleId) {
        const marchRow = this.attackMarchRow(marchId, worldId, kingdomId);
        if (!marchRow) continue;
        battleId = this.openBattleSession(worldId, marchId, marchRow, kingdomId, plan);
        const worldVersion = this.incrementWorldVersion(worldId);
        published.push(this.insertEvent(worldId, worldVersion, "battle.started", { battle: this.readBattle(battleId) }));
      }
      const row = this.battleResolutionRow(battleId, worldId, kingdomId);
      if (!row || String(row.status) !== "open") continue;
      const outcome = resolveBattle({
        attacker: parseJson(row.attacker_army_json),
        defender: parseJson(row.defender_army_json),
        attackerLevels: parseJson(row.attacker_levels_json),
        defenderLevels: parseJson(row.defender_levels_json),
        defenderWallLevel: Number(row.defender_wall_level),
        defenderResources: parseJson(row.defender_resources_json),
        plan: parseJson(row.plan_json),
        acceptedOrders: Number(row.order_count),
        seed: String(row.seed),
      });
      this.settleBattle(worldId, row, outcome, "resolved", published);
    }
  }

  /**
   * Apply an outcome to the world: defender losses, loot, war points, the
   * surrender absorption, the homeward march, both notifications, the event.
   * Takes a worldId rather than an envelope so the SERVER can settle a battle
   * nobody attended (materializeDueBattles) through exactly the same path a
   * player command uses - one settlement rule, not two.
   */
  private settleBattle(
    worldId: string,
    row: DbRow,
    outcome: BattleOutcome,
    status: "resolved" | "retreated",
    published: StoredWorldEvent[],
  ): { battle: BattleSessionState; march: MarchState; worldVersion: number } {
    const resolvedAt = this.now();
    const loot = outcome.loot;
    const yieldedCount = armyUnitCount(outcome.yielded);
    if (status === "resolved") {
      const currentDefender = this.db.prepare("SELECT army_json, resources_json FROM local_villages WHERE id = ?")
        .get(String(row.defender_village_id)) as DbRow;
      const defenderArmy = parseJson<Army>(currentDefender.army_json);
      for (const troop of TROOP_TYPES) {
        // Casualties AND anyone who laid down arms leave the garrison. Both are
        // floored at zero against the CURRENT army, which may have changed
        // while the march was on the road.
        defenderArmy[troop] = Math.max(0, defenderArmy[troop] - outcome.defenderCasualties[troop] - outcome.yielded[troop]);
      }
      const defenderResources = parseJson<ResourceStock>(currentDefender.resources_json);
      for (const kind of RESOURCE_KINDS) defenderResources[kind] = Math.max(0, defenderResources[kind] - loot[kind]);
      this.db.prepare("UPDATE local_villages SET army_json = ?, resources_json = ?, state_version = state_version + 1 WHERE id = ?")
        .run(JSON.stringify(defenderArmy), JSON.stringify(defenderResources), String(row.defender_village_id));
      if (outcome.winner === "attacker") {
        const points = Math.max(10, armyUnitCount(outcome.defenderCasualties) * 3);
        this.db.prepare("UPDATE local_kingdoms SET war_victory_points = war_victory_points + ? WHERE id = ?")
          .run(points, String(row.attacker_kingdom_id));
      }
    }
    const from = this.db.prepare("SELECT x, y FROM local_villages WHERE id = ?").get(String(row.attacker_village_id)) as DbRow;
    const target = this.db.prepare("SELECT x, y FROM local_villages WHERE id = ?").get(String(row.defender_village_id)) as DbRow;
    const distance = distanceBetween({ x: Number(from.x), y: Number(from.y) }, { x: Number(target.x), y: Number(target.y) });
    const returnMs = this.returnDurationMs ?? marchDurationSeconds(distance, "return") * 1000;
    const arrivesAt = new Date(resolvedAt.getTime() + returnMs).toISOString();
    // Whoever yielded marches home WITH the attacker, so the world never loses
    // or gains a soldier across a surrender - they change side, that is all.
    const homewardArmy = status === "resolved" ? addArmies(outcome.attackerSurvivors, outcome.yielded) : outcome.attackerSurvivors;
    this.db.prepare("UPDATE local_battle_sessions SET status = ?, outcome_json = ?, resolved_at = ? WHERE id = ?")
      .run(status, JSON.stringify(outcome), resolvedAt.toISOString(), String(row.id));
    this.db.prepare("UPDATE local_marches SET status = 'returning', kind = 'return', army_json = ?, loot_json = ?, arrives_at = ? WHERE id = ?")
      .run(JSON.stringify(homewardArmy), JSON.stringify(loot), arrivesAt, String(row.march_id));
    // The march is settled; its plan deadline must never fire again.
    this.db.prepare("UPDATE local_march_plans SET auto_resolve_at = NULL WHERE march_id = ?").run(String(row.march_id));
    const surrenderNote = yieldedCount > 0 ? ` ${yieldedCount} of their troops surrendered and march with you.` : "";
    const attackerMessage = status === "retreated"
      ? `${armyUnitCount(outcome.attackerSurvivors)} troops withdrew and are returning home.`
      : outcome.winner === "attacker"
        ? `Victory. ${armyUnitCount(outcome.attackerSurvivors)} survivors are returning with ${loot.wood + loot.stone + loot.iron} resources.${surrenderNote}`
        : `Defeat. ${armyUnitCount(outcome.attackerSurvivors)} survivors are returning home.`;
    const defenderMessage = status === "retreated"
      ? "The attacking army withdrew from your walls."
      : outcome.winner === "attacker"
        ? (yieldedCount > 0
          ? `Your village defenses were defeated and ${yieldedCount} of your troops surrendered.`
          : "Your village defenses were defeated.")
        : "Your garrison held the village.";
    this.insertNotification(worldId, String(row.attacker_kingdom_id), "battle", attackerMessage, resolvedAt.toISOString());
    this.insertNotification(worldId, String(row.defender_kingdom_id), "battle", defenderMessage, resolvedAt.toISOString());
    const worldVersion = this.incrementWorldVersion(worldId);
    const battle = this.readBattle(String(row.id))!;
    const march = this.readMarch(String(row.march_id))!;
    published.push(this.insertEvent(worldId, worldVersion, status === "retreated" ? "battle.retreated" : "battle.resolved", { battle, march }));
    return { battle, march, worldVersion };
  }

  private finishBattle(
    envelope: CommandEnvelope,
    row: DbRow,
    outcome: BattleOutcome,
    status: "resolved" | "retreated",
    published: StoredWorldEvent[],
  ): CommandResult {
    const { battle, march, worldVersion } = this.settleBattle(envelope.worldId, row, outcome, status, published);
    return { type: "command.accepted", payload: { commandId: envelope.commandId, worldVersion, battle, march } };
  }

  materializeDueJobs(): StoredWorldEvent[] {
    const now = this.now();
    const due = [
      ...(this.db.prepare(`
        SELECT id, world_id, village_id, building AS item, target_level AS amount, completes_at, 'construction' AS kind
        FROM local_construction_jobs WHERE status = 'queued' AND completes_at <= ?
      `).all(now.toISOString()) as DbRow[]),
      ...(this.db.prepare(`
        SELECT id, world_id, village_id, troop AS item, quantity AS amount, completes_at, 'recruitment' AS kind
        FROM local_recruitment_jobs WHERE status = 'queued' AND completes_at <= ?
      `).all(now.toISOString()) as DbRow[]),
      ...(this.db.prepare(`
        SELECT id, world_id, village_id, kingdom_id, troop AS item, target_level AS amount, completes_at, 'research' AS kind
        FROM local_research_jobs WHERE status = 'queued' AND completes_at <= ?
      `).all(now.toISOString()) as DbRow[]),
    ].sort((left, right) => String(left.completes_at).localeCompare(String(right.completes_at)) || String(left.id).localeCompare(String(right.id)));
    const published: StoredWorldEvent[] = [];
    this.withTransaction(() => {
      for (const job of due) {
        const villageId = String(job.village_id);
        const worldId = String(job.world_id);
        this.accrueVillage(villageId, new Date(String(job.completes_at)));
        const row = this.db.prepare("SELECT kingdom_id, buildings_json, army_json FROM local_villages WHERE id = ?").get(villageId) as DbRow;
        const kingdomId = String(job.kingdom_id ?? row.kingdom_id);
        let eventType = "village.changed";
        let message = "";
        if (String(job.kind) === "construction") {
          const buildings = parseJson<BuildingLevels>(row.buildings_json);
          const building = String(job.item) as BuildingType;
          buildings[building] = Number(job.amount);
          this.db.prepare("UPDATE local_villages SET buildings_json = ?, state_version = state_version + 1 WHERE id = ?")
            .run(JSON.stringify(buildings), villageId);
          this.db.prepare("UPDATE local_construction_jobs SET status = 'complete' WHERE id = ?").run(String(job.id));
          message = `${BUILDINGS[building].name} reached level ${job.amount}.`;
        } else if (String(job.kind) === "recruitment") {
          const army = parseJson<Army>(row.army_json);
          const troop = String(job.item) as TroopType;
          army[troop] += Number(job.amount);
          this.db.prepare("UPDATE local_villages SET army_json = ?, state_version = state_version + 1 WHERE id = ?")
            .run(JSON.stringify(army), villageId);
          this.db.prepare("UPDATE local_recruitment_jobs SET status = 'complete' WHERE id = ?").run(String(job.id));
          eventType = "recruitment.completed";
          message = `${job.amount} ${Number(job.amount) === 1 ? TROOPS[troop].name : TROOPS[troop].plural} joined the army.`;
        } else {
          const kingdomRow = this.db.prepare("SELECT troop_levels_json FROM local_kingdoms WHERE id = ?").get(kingdomId) as DbRow;
          const levels = parseJson<Record<TroopType, number>>(kingdomRow.troop_levels_json);
          const troop = String(job.item) as TroopType;
          levels[troop] = Number(job.amount);
          this.db.prepare("UPDATE local_kingdoms SET troop_levels_json = ? WHERE id = ?").run(JSON.stringify(levels), kingdomId);
          this.db.prepare("UPDATE local_research_jobs SET status = 'complete' WHERE id = ?").run(String(job.id));
          eventType = "troop.level.changed";
          message = `${TROOPS[troop].plural} reached kingdom level ${job.amount}.`;
        }
        this.insertNotification(worldId, kingdomId, String(job.kind) as KingdomNotification["kind"], message, String(job.completes_at));
        const worldVersion = this.incrementWorldVersion(worldId);
        published.push(this.insertEvent(worldId, worldVersion, eventType, {
          village: this.readVillage(villageId),
          completedJobId: String(job.id),
          message,
        }));
      }
      this.materializeDueMarches(now, published);
      // After marches, so an attack that arrives already past its deadline
      // (a long server outage) settles in the very same pass.
      this.materializeDueBattles(now, published);
      const villages = this.db.prepare("SELECT id FROM local_villages").all() as DbRow[];
      for (const village of villages) this.accrueVillage(String(village.id), now);
    });
    this.publish(published);
    return published;
  }

  private materializeDueMarches(now: Date, published: StoredWorldEvent[]): void {
    const due = this.db.prepare(`
      SELECT * FROM local_marches
      WHERE status IN ('outbound', 'returning') AND arrives_at <= ?
      ORDER BY arrives_at, id
    `).all(now.toISOString()) as DbRow[];
    for (const row of due) {
      const marchId = String(row.id);
      const worldId = String(row.world_id);
      const kingdomId = String(row.kingdom_id);
      const status = String(row.status);
      const kind = String(row.kind);
      if (status === "returning") {
        const village = this.db.prepare("SELECT army_json, resources_json FROM local_villages WHERE id = ?").get(String(row.from_village_id)) as DbRow;
        const army = addArmies(parseJson(village.army_json), parseJson(row.army_json));
        const resources = parseJson<ResourceStock>(village.resources_json);
        const loot = parseJson<ResourceStock>(row.loot_json);
        for (const resource of RESOURCE_KINDS) resources[resource] += loot[resource];
        this.db.prepare("UPDATE local_villages SET army_json = ?, resources_json = ?, state_version = state_version + 1 WHERE id = ?")
          .run(JSON.stringify(army), JSON.stringify(resources), String(row.from_village_id));
        this.db.prepare("UPDATE local_marches SET status = 'complete' WHERE id = ?").run(marchId);
        const message = `${armyUnitCount(parseJson(row.army_json))} troops returned to ${this.readVillage(String(row.from_village_id)).name}.`;
        this.insertNotification(worldId, kingdomId, "march", message, String(row.arrives_at));
        const worldVersion = this.incrementWorldVersion(worldId);
        published.push(this.insertEvent(worldId, worldVersion, "march.completed", { march: this.readMarch(marchId), village: this.readVillage(String(row.from_village_id)), message }));
        continue;
      }

      if (kind === "attack") {
        this.db.prepare("UPDATE local_marches SET status = 'awaiting_battle' WHERE id = ?").run(marchId);
        // The clock at the walls starts on ARRIVAL. Marches launched before
        // this slice existed carry no plan row, so give them one here rather
        // than leaving them stranded with no deadline at all.
        const deadline = new Date(new Date(String(row.arrives_at)).getTime() + this.autoResolveMs).toISOString();
        this.db.prepare(`
          INSERT INTO local_march_plans(march_id, plan_json, auto_resolve_at) VALUES (?, ?, ?)
          ON CONFLICT(march_id) DO UPDATE SET auto_resolve_at = excluded.auto_resolve_at
        `).run(marchId, JSON.stringify(UNPLANNED_ATTACK_PLAN), deadline);
        const worldVersion = this.incrementWorldVersion(worldId);
        const march = this.readMarch(marchId)!;
        published.push(this.insertEvent(worldId, worldVersion, "march.arrived", { march }));
        continue;
      }

      if (kind === "scout") {
        const target = this.db.prepare(`
          SELECT v.*, k.name AS kingdom_name, e.layout_json
          FROM local_villages v
          JOIN local_kingdoms k ON k.id = v.kingdom_id
          JOIN local_village_economy e ON e.village_id = v.id
          WHERE v.id = ?
        `).get(String(row.target_village_id)) as DbRow;
        const report: ScoutReportState = {
          id: `scout-report-${randomUUID()}`,
          marchId,
          worldId,
          kingdomId,
          targetVillageId: String(row.target_village_id),
          targetVillageVersion: Number(target.state_version),
          targetVillageName: String(target.name),
          targetKingdomName: String(target.kingdom_name),
          observedArmy: parseJson(target.army_json),
          observedResources: parseJson(target.resources_json),
          observedBuildings: parseJson(target.buildings_json),
          layout: parseJson(target.layout_json),
          createdAt: String(row.arrives_at),
        };
        this.db.prepare(`
          INSERT INTO local_scout_reports(
            id, march_id, world_id, kingdom_id, target_village_id, target_village_version, target_village_name,
            target_kingdom_name, observed_army_json, observed_resources_json, observed_buildings_json, layout_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          report.id, report.marchId, report.worldId, report.kingdomId, report.targetVillageId, report.targetVillageVersion,
          report.targetVillageName, report.targetKingdomName, JSON.stringify(report.observedArmy), JSON.stringify(report.observedResources),
          JSON.stringify(report.observedBuildings), JSON.stringify(report.layout), report.createdAt,
        );
        const from = this.db.prepare("SELECT x, y FROM local_villages WHERE id = ?").get(String(row.from_village_id)) as DbRow;
        const distance = distanceBetween({ x: Number(from.x), y: Number(from.y) }, { x: Number(target.x), y: Number(target.y) });
        const returnMs = this.returnDurationMs ?? marchDurationSeconds(distance, "return") * 1000;
        this.db.prepare("UPDATE local_marches SET status = 'returning', arrives_at = ? WHERE id = ?")
          .run(new Date(now.getTime() + returnMs).toISOString(), marchId);
        this.insertNotification(worldId, kingdomId, "scout", `Scout report ready: ${report.targetVillageName}.`, report.createdAt);
        const worldVersion = this.incrementWorldVersion(worldId);
        published.push(this.insertEvent(worldId, worldVersion, "scout.report.ready", { report, march: this.readMarch(marchId) }));
      }
    }
  }

  private accrueVillage(villageId: string, target: Date): void {
    const row = this.db.prepare(`
      SELECT v.resources_json, v.buildings_json, e.last_materialized_at, e.resource_carry_json
      FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = ?
    `).get(villageId) as DbRow | undefined;
    if (!row) return;
    const last = new Date(String(row.last_materialized_at));
    const elapsedHours = Math.max(0, target.getTime() - last.getTime()) / 3_600_000;
    if (elapsedHours <= 0) return;
    const resources = parseJson<ResourceStock>(row.resources_json);
    const buildings = parseJson<BuildingLevels>(row.buildings_json);
    const carry = parseJson<ResourceStock>(row.resource_carry_json);
    const cap = storageCapacity(buildings.warehouse);
    const production: ResourceStock = {
      wood: productionPerHour(buildings.timber),
      stone: productionPerHour(buildings.quarry),
      iron: productionPerHour(buildings.iron),
    };
    let changed = false;
    for (const kind of RESOURCE_KINDS) {
      if (resources[kind] >= cap) {
        resources[kind] = cap;
        carry[kind] = 0;
        continue;
      }
      const generated = carry[kind] + production[kind] * elapsedHours;
      const whole = Math.floor(generated);
      const accepted = Math.min(whole, cap - resources[kind]);
      resources[kind] += accepted;
      carry[kind] = resources[kind] >= cap ? 0 : generated - whole;
      changed ||= accepted > 0;
    }
    if (changed) {
      this.db.prepare("UPDATE local_villages SET resources_json = ?, state_version = state_version + 1 WHERE id = ?")
        .run(JSON.stringify(resources), villageId);
    }
    this.db.prepare("UPDATE local_village_economy SET last_materialized_at = ?, resource_carry_json = ? WHERE village_id = ?")
      .run(target.toISOString(), JSON.stringify(carry), villageId);
  }

  private readVillageEconomy(village: VillageState): VillageEconomy {
    return {
      villageId: village.id,
      productionPerHour: {
        wood: productionPerHour(village.buildings.timber),
        stone: productionPerHour(village.buildings.quarry),
        iron: productionPerHour(village.buildings.iron),
      },
      storageCapacity: storageCapacity(village.buildings.warehouse),
      populationUsed: armyPopulation(village.army) + this.queuedPopulation(village.id),
      populationCapacity: populationCapacity(village.buildings.farm),
    };
  }

  private queuedPopulation(villageId: string): number {
    return (this.db.prepare("SELECT troop, quantity FROM local_recruitment_jobs WHERE village_id = ? AND status = 'queued'").all(villageId) as DbRow[])
      .reduce((total, row) => total + TROOPS[String(row.troop) as TroopType].population * Number(row.quantity), 0);
  }

  private readRecruitmentJobs(worldId: string): RecruitmentJob[] {
    return (this.db.prepare(`
      SELECT id, village_id, troop, quantity, started_at, completes_at
      FROM local_recruitment_jobs WHERE world_id = ? AND status = 'queued' ORDER BY completes_at
    `).all(worldId) as DbRow[]).map((row) => ({
      id: String(row.id),
      villageId: String(row.village_id),
      troop: String(row.troop) as TroopType,
      quantity: Number(row.quantity),
      startedAt: String(row.started_at),
      completesAt: String(row.completes_at),
    }));
  }

  private readResearchJobs(worldId: string): ResearchJob[] {
    return (this.db.prepare(`
      SELECT id, kingdom_id, village_id, troop, target_level, started_at, completes_at
      FROM local_research_jobs WHERE world_id = ? AND status = 'queued' ORDER BY completes_at
    `).all(worldId) as DbRow[]).map((row) => ({
      id: String(row.id),
      kingdomId: String(row.kingdom_id),
      villageId: String(row.village_id),
      troop: String(row.troop) as TroopType,
      targetLevel: Number(row.target_level),
      startedAt: String(row.started_at),
      completesAt: String(row.completes_at),
    }));
  }

  private mapMarch(row: DbRow): MarchState {
    return {
      id: String(row.id),
      worldId: String(row.world_id),
      kingdomId: String(row.kingdom_id),
      fromVillageId: String(row.from_village_id),
      targetVillageId: String(row.target_village_id),
      kind: String(row.kind) as MarchState["kind"],
      status: String(row.status) as MarchState["status"],
      army: parseJson(row.army_json),
      loot: parseJson(row.loot_json),
      departedAt: String(row.departed_at),
      arrivesAt: String(row.arrives_at),
      battleId: row.battle_id ? String(row.battle_id) : null,
    };
  }

  private readMarch(marchId: string): MarchState | null {
    const row = this.db.prepare("SELECT * FROM local_marches WHERE id = ?").get(marchId) as DbRow | undefined;
    return row ? this.mapMarch(row) : null;
  }

  private readMarches(kingdomId: string): MarchState[] {
    return (this.db.prepare("SELECT * FROM local_marches WHERE kingdom_id = ? ORDER BY departed_at DESC, id DESC LIMIT 30")
      .all(kingdomId) as DbRow[]).map((row) => this.mapMarch(row));
  }

  private mapScoutReport(row: DbRow): ScoutReportState {
    return {
      id: String(row.id),
      marchId: String(row.march_id),
      worldId: String(row.world_id),
      kingdomId: String(row.kingdom_id),
      targetVillageId: String(row.target_village_id),
      targetVillageVersion: Number(row.target_village_version),
      targetVillageName: String(row.target_village_name),
      targetKingdomName: String(row.target_kingdom_name),
      observedArmy: parseJson(row.observed_army_json),
      observedResources: parseJson(row.observed_resources_json),
      observedBuildings: parseJson(row.observed_buildings_json),
      layout: parseJson(row.layout_json),
      createdAt: String(row.created_at),
    };
  }

  private readScoutReports(kingdomId: string): ScoutReportState[] {
    return (this.db.prepare("SELECT * FROM local_scout_reports WHERE kingdom_id = ? ORDER BY created_at DESC, id DESC LIMIT 20")
      .all(kingdomId) as DbRow[]).map((row) => this.mapScoutReport(row));
  }

  private mapBattle(row: DbRow): BattleSessionState {
    return {
      id: String(row.id),
      marchId: String(row.march_id),
      worldId: String(row.world_id),
      attackerKingdomId: String(row.attacker_kingdom_id),
      defenderKingdomId: String(row.defender_kingdom_id),
      attackerVillageId: String(row.attacker_village_id),
      defenderVillageId: String(row.defender_village_id),
      status: String(row.status) as BattleSessionState["status"],
      plan: parseJson(row.plan_json),
      seed: String(row.seed),
      openedAt: String(row.opened_at),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
      outcome: row.outcome_json ? parseJson(row.outcome_json) : null,
    };
  }

  private readBattle(battleId: string): BattleSessionState | null {
    const row = this.db.prepare("SELECT * FROM local_battle_sessions WHERE id = ?").get(battleId) as DbRow | undefined;
    return row ? this.mapBattle(row) : null;
  }

  private readBattleSessions(kingdomId: string): BattleSessionState[] {
    return (this.db.prepare(`
      SELECT * FROM local_battle_sessions
      WHERE attacker_kingdom_id = ? OR defender_kingdom_id = ?
      ORDER BY opened_at DESC, id DESC LIMIT 20
    `).all(kingdomId, kingdomId) as DbRow[]).map((row) => this.mapBattle(row));
  }

  private ownedVillageRow(player: SessionPlayer, worldId: string, villageId: string): DbRow | undefined {
    return this.db.prepare(`
      SELECT v.*, k.controller_player_id FROM local_villages v
      JOIN local_kingdoms k ON k.id = v.kingdom_id
      WHERE v.id = ? AND v.world_id = ? AND k.controller_player_id = ?
    `).get(villageId, worldId, player.id) as DbRow | undefined;
  }

  private updateVillageResources(villageId: string, resources: ResourceStock): void {
    this.db.prepare("UPDATE local_villages SET resources_json = ?, state_version = state_version + 1 WHERE id = ?")
      .run(JSON.stringify(resources), villageId);
  }

  private insertNotification(
    worldId: string,
    kingdomId: string,
    kind: KingdomNotification["kind"],
    message: string,
    createdAt: string,
  ): void {
    this.db.prepare(`
      INSERT INTO local_kingdom_notifications(id, world_id, kingdom_id, kind, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`notification-${randomUUID()}`, worldId, kingdomId, kind, message, createdAt);
  }

  private readWorld(worldId: string): WorldState {
    const row = this.db.prepare("SELECT * FROM local_worlds WHERE id = ?").get(worldId) as DbRow | undefined;
    if (!row) throw new StoreError("WORLD_NOT_FOUND", "World not found.", 404);
    const kingdoms = (this.db.prepare("SELECT * FROM local_kingdoms WHERE world_id = ? ORDER BY id").all(worldId) as DbRow[])
      .map((kingdom) => this.mapKingdom(kingdom));
    const villages = (this.db.prepare("SELECT * FROM local_villages WHERE world_id = ? ORDER BY id").all(worldId) as DbRow[])
      .map((village) => this.mapVillage(village));
    return {
      id: String(row.id),
      contractVersion: GAME_CONTRACT_VERSION,
      version: Number(row.version),
      name: String(row.name),
      seed: String(row.seed),
      width: 50,
      height: 50,
      status: String(row.status) as WorldState["status"],
      createdAt: String(row.created_at),
      kingdoms,
      villages,
    };
  }

  private readVillage(villageId: string): VillageState {
    const row = this.db.prepare("SELECT * FROM local_villages WHERE id = ?").get(villageId) as DbRow | undefined;
    if (!row) throw new StoreError("VILLAGE_NOT_FOUND", "Village not found.", 404);
    return this.mapVillage(row);
  }

  private mapKingdom(row: DbRow): KingdomState {
    return {
      id: String(row.id),
      worldId: String(row.world_id),
      name: String(row.name),
      color: String(row.color),
      seatKind: String(row.seat_kind) as KingdomState["seatKind"],
      controllerPlayerId: row.controller_player_id ? String(row.controller_player_id) : null,
      capitalVillageId: String(row.capital_village_id),
      allianceId: null,
      troopLevels: parseJson(row.troop_levels_json),
      warVictoryPoints: Number(row.war_victory_points),
      villagesConquered: Number(row.villages_conquered),
      alive: Boolean(row.alive),
    };
  }

  private mapVillage(row: DbRow): VillageState {
    return {
      id: String(row.id),
      worldId: String(row.world_id),
      kingdomId: String(row.kingdom_id),
      name: String(row.name),
      x: Number(row.x),
      y: Number(row.y),
      isCapital: Boolean(row.is_capital),
      loyalty: Number(row.loyalty),
      resources: parseJson(row.resources_json),
      buildings: parseJson(row.buildings_json),
      army: parseJson(row.army_json),
      stateVersion: Number(row.state_version),
    };
  }

  private storeRejected(player: SessionPlayer, envelope: CommandEnvelope, code: string, message: string): CommandResult {
    const result = this.reject(envelope.commandId, code, message, this.currentWorldVersion(envelope.worldId));
    this.withTransaction(() => this.insertCommand(player, envelope, result));
    return result;
  }

  private reject(commandId: string, code: string, message: string, currentWorldVersion: number): CommandResult {
    return { type: "command.rejected", payload: { commandId, code, message, currentWorldVersion } };
  }

  private insertCommand(player: SessionPlayer, envelope: CommandEnvelope, result: CommandResult): void {
    this.db.prepare(`
      INSERT INTO local_command_inbox(command_id, world_id, player_id, request_json, result_json, received_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(envelope.commandId, envelope.worldId, player.id, JSON.stringify(envelope), JSON.stringify(result), this.now().toISOString());
  }

  private insertEvent(worldId: string, worldVersion: number, type: string, payload: unknown): StoredWorldEvent {
    const event: StoredWorldEvent = {
      worldId,
      worldVersion,
      eventSequence: 0,
      type,
      payload,
      createdAt: this.now().toISOString(),
    };
    this.db.prepare(`
      INSERT INTO local_world_events(world_id, world_version, event_sequence, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(event.worldId, event.worldVersion, event.eventSequence, event.type, JSON.stringify(event.payload), event.createdAt);
    return event;
  }

  private incrementWorldVersion(worldId: string): number {
    const updated = this.db.prepare("UPDATE local_worlds SET version = version + 1 WHERE id = ? RETURNING version")
      .get(worldId) as DbRow | undefined;
    if (!updated) throw new StoreError("WORLD_NOT_FOUND", "World not found.", 404);
    return Number(updated.version);
  }

  private currentWorldVersion(worldId: string): number {
    const row = this.db.prepare("SELECT version FROM local_worlds WHERE id = ?").get(worldId) as DbRow | undefined;
    return row ? Number(row.version) : 0;
  }

  worldIdForKingdom(kingdomId: string): string {
    const row = this.db.prepare("SELECT world_id FROM local_kingdoms WHERE id = ?").get(kingdomId) as DbRow | undefined;
    if (!row) throw new StoreError("KINGDOM_NOT_FOUND", "Kingdom not found.", 404);
    return String(row.world_id);
  }

  private withTransaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
