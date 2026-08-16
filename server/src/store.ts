import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  GAME_CONTRACT_VERSION,
  createTwoPlayerWorldFixture,
  type BuildingLevels,
  type BuildingType,
  type CommandEnvelope,
  type GameCommand,
  type KingdomState,
  type PlayerArenaStanding,
  type ResourceStock,
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
  player: SessionPlayer;
  kingdom: KingdomState;
  arena: PlayerArenaStanding;
  world: WorldState;
  constructionJobs: ConstructionJob[];
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
  now?: () => Date;
};

const BUILDING_TYPES: BuildingType[] = [
  "hq",
  "timber",
  "quarry",
  "iron",
  "farm",
  "warehouse",
  "barracks",
  "wall",
  "academy",
  "stable",
  "workshop",
  "smithy",
  "market",
];

const BUILD_BASE_COST: Record<BuildingType, ResourceStock> = {
  hq: { wood: 180, stone: 160, iron: 80 },
  timber: { wood: 120, stone: 90, iron: 35 },
  quarry: { wood: 110, stone: 100, iron: 40 },
  iron: { wood: 130, stone: 110, iron: 30 },
  farm: { wood: 100, stone: 85, iron: 35 },
  warehouse: { wood: 140, stone: 120, iron: 55 },
  barracks: { wood: 180, stone: 120, iron: 80 },
  wall: { wood: 100, stone: 220, iron: 90 },
  academy: { wood: 360, stone: 320, iron: 260 },
  stable: { wood: 280, stone: 220, iron: 180 },
  workshop: { wood: 340, stone: 300, iron: 230 },
  smithy: { wood: 250, stone: 240, iron: 220 },
  market: { wood: 200, stone: 180, iron: 110 },
};

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

function buildCost(building: BuildingType, currentLevel: number): ResourceStock {
  const scale = Math.pow(1.45, Math.max(0, currentLevel - 1));
  const base = BUILD_BASE_COST[building];
  return {
    wood: Math.round(base.wood * scale),
    stone: Math.round(base.stone * scale),
    iron: Math.round(base.iron * scale),
  };
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
  readonly now: () => Date;
  private readonly listeners = new Set<(event: StoredWorldEvent) => void>();

  constructor(databasePath: string, options: StoreOptions = {}) {
    this.db = new DatabaseSync(databasePath);
    this.buildDurationMs = options.buildDurationMs ?? 15_000;
    this.now = options.now ?? (() => new Date());
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.migrate();
    this.seedWorld();
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
    const migrationPath = fileURLToPath(new URL("../db/migrations/0002_gate_b_local_sqlite.sql", import.meta.url));
    this.db.exec(readFileSync(migrationPath, "utf8"));
    this.db.prepare("INSERT OR IGNORE INTO local_schema_migrations(version, applied_at) VALUES (2, ?)").run(this.now().toISOString());
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
      constructionJobs: jobs,
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
    if (envelope.command.type !== "village.build.queue" && envelope.command.type !== "chat.send") {
      return this.storeRejected(player, envelope, "INVALID_COMMAND", "Gate B currently accepts build-queue and world-chat commands.");
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
      const cost = buildCost(payload.building, currentLevel);
      if (resources.wood < cost.wood || resources.stone < cost.stone || resources.iron < cost.iron) {
        result = this.reject(envelope.commandId, "INSUFFICIENT_RESOURCES", "The village cannot afford that upgrade.", currentVersion);
        this.insertCommand(player, envelope, result);
        return;
      }
      resources.wood -= cost.wood;
      resources.stone -= cost.stone;
      resources.iron -= cost.iron;
      const startedAt = this.now();
      const job: ConstructionJob = {
        id: `construction-${randomUUID()}`,
        villageId: payload.villageId,
        building: payload.building,
        targetLevel: currentLevel + 1,
        startedAt: startedAt.toISOString(),
        completesAt: new Date(startedAt.getTime() + this.buildDurationMs).toISOString(),
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

  materializeDueJobs(): StoredWorldEvent[] {
    const due = this.db.prepare(`
      SELECT id, world_id, village_id, building, target_level
      FROM local_construction_jobs
      WHERE status = 'queued' AND completes_at <= ?
      ORDER BY completes_at, id
    `).all(this.now().toISOString()) as DbRow[];
    if (due.length === 0) return [];
    const published: StoredWorldEvent[] = [];
    this.withTransaction(() => {
      for (const job of due) {
        const villageId = String(job.village_id);
        const worldId = String(job.world_id);
        const row = this.db.prepare("SELECT buildings_json FROM local_villages WHERE id = ?").get(villageId) as DbRow;
        const buildings = parseJson<BuildingLevels>(row.buildings_json);
        buildings[String(job.building) as BuildingType] = Number(job.target_level);
        this.db.prepare("UPDATE local_villages SET buildings_json = ?, state_version = state_version + 1 WHERE id = ?")
          .run(JSON.stringify(buildings), villageId);
        this.db.prepare("UPDATE local_construction_jobs SET status = 'complete' WHERE id = ?").run(String(job.id));
        const worldVersion = this.incrementWorldVersion(worldId);
        published.push(this.insertEvent(worldId, worldVersion, "village.changed", {
          village: this.readVillage(villageId),
          completedConstructionId: String(job.id),
        }));
      }
    });
    this.publish(published);
    return published;
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
