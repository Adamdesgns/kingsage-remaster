import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  BUILDINGS,
  GAME_CONTRACT_VERSION,
  TROOPS,
  TROOP_ORDER,
  armyPopulation,
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
  type CommandEnvelope,
  type GameCommand,
  type KingdomState,
  type PlayerArenaStanding,
  type ResourceStock,
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
  kind: "construction" | "recruitment" | "research";
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
  now?: () => Date;
};

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
  readonly now: () => Date;
  private readonly listeners = new Set<(event: StoredWorldEvent) => void>();

  constructor(databasePath: string, options: StoreOptions = {}) {
    this.db = new DatabaseSync(databasePath);
    this.buildDurationMs = options.buildDurationMs ?? 0;
    this.recruitDurationMs = options.recruitDurationMs;
    this.researchDurationMs = options.researchDurationMs;
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
    for (const [version, filename] of [[2, "0002_gate_b_local_sqlite.sql"], [3, "0003_gate_c_economy.sql"]] as const) {
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

  register(input: { username: string; password: string; kingdomName: string }): { token: string; player: SessionPlayer } {
    const username = normalizeUsername(input.username);
    const kingdomName = normalizeKingdomName(input.kingdomName);
    if (input.password.length < 8 || input.password.length > 128) {
      throw new StoreError("INVALID_PASSWORD", "Password must be 8–128 characters.", 400);
    }

    const existing = this.db.prepare("SELECT 1 FROM local_players WHERE username = ?").get(username);
    if (existing) throw new StoreError("USERNAME_TAKEN", "That username is already registered.", 409);
    const kingdomNameTaken = this.db.prepare("SELECT 1 FROM local_kingdoms WHERE name = ? COLLATE NOCASE").get(kingdomName);
    if (kingdomNameTaken) throw new StoreError("KINGDOM_NAME_TAKEN", "That kingdom name already exists in this world.", 409);

    const playerId = `player-${randomUUID()}`;
    const salt = randomBytes(16);
    const digest = passwordDigest(input.password, salt);
    const createdAt = this.now().toISOString();
    let kingdomId = "";
    const published: StoredWorldEvent[] = [];

    this.withTransaction(() => {
      const seat = this.db.prepare(`
        SELECT id, world_id, capital_village_id
        FROM local_kingdoms
        WHERE controller_player_id IS NULL AND seat_kind = 'ai'
        ORDER BY id
        LIMIT 1
      `).get() as DbRow | undefined;
      if (!seat) throw new StoreError("WORLD_FULL", "This alpha world has no open kingdom seats.", 409);
      kingdomId = String(seat.id);
      const worldId = String(seat.world_id);
      const villageId = String(seat.capital_village_id);

      this.db.prepare(`
        INSERT INTO local_players(id, username, password_salt, password_hash, kingdom_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(playerId, username, salt.toString("hex"), digest.toString("hex"), kingdomId, createdAt);
      this.db.prepare(`
        UPDATE local_kingdoms
        SET controller_player_id = ?, seat_kind = 'human', name = ?
        WHERE id = ?
      `).run(playerId, kingdomName, kingdomId);
      this.db.prepare("UPDATE local_villages SET name = ?, state_version = state_version + 1 WHERE id = ?")
        .run(`${kingdomName} Keep`, villageId);
      const worldVersion = this.incrementWorldVersion(worldId);
      const event = this.insertEvent(worldId, worldVersion, "kingdom.claimed", {
        kingdomId,
        playerId,
        kingdomName,
      });
      published.push(event);
    });

    const token = this.createSession(playerId);
    this.publish(published);
    return { token, player: { id: playerId, username, kingdomId } };
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

  getSnapshot(player: SessionPlayer): SharedWorldSnapshot {
    this.materializeDueJobs();
    const kingdomRow = this.db.prepare("SELECT * FROM local_kingdoms WHERE id = ?").get(player.kingdomId) as DbRow | undefined;
    if (!kingdomRow) throw new StoreError("KINGDOM_NOT_FOUND", "The player's kingdom no longer exists.", 404);
    const worldId = String(kingdomRow.world_id);
    const world = this.readWorld(worldId);
    const kingdom = world.kingdoms.find((candidate) => candidate.id === player.kingdomId);
    if (!kingdom) throw new StoreError("KINGDOM_NOT_FOUND", "The player's kingdom is missing from its world.", 404);
    const jobs = (this.db.prepare(`
      SELECT id, village_id, building, target_level, started_at, completes_at
      FROM local_construction_jobs WHERE world_id = ? AND status = 'queued'
      ORDER BY completes_at
    `).all(worldId) as DbRow[]).map((row) => ({
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
      villageEconomy: world.villages.map((village) => this.readVillageEconomy(village)),
      constructionJobs: jobs,
      recruitmentJobs: this.readRecruitmentJobs(worldId),
      researchJobs: this.readResearchJobs(worldId),
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
    if (!["village.build.queue", "village.recruit.queue", "kingdom.research.queue", "chat.send"].includes(envelope.command.type)) {
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
      const villages = this.db.prepare("SELECT id FROM local_villages").all() as DbRow[];
      for (const village of villages) this.accrueVillage(String(village.id), now);
    });
    this.publish(published);
    return published;
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

  private worldIdForKingdom(kingdomId: string): string {
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
