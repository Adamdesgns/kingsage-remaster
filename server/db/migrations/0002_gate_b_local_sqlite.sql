PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS local_schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_players (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  kingdom_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES local_players(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_worlds (
  id TEXT PRIMARY KEY,
  contract_version INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  seed TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width = 50),
  height INTEGER NOT NULL CHECK (height = 50),
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_kingdoms (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  seat_kind TEXT NOT NULL CHECK (seat_kind IN ('human', 'ai')),
  controller_player_id TEXT REFERENCES local_players(id) ON DELETE SET NULL,
  capital_village_id TEXT NOT NULL,
  troop_levels_json TEXT NOT NULL,
  war_victory_points INTEGER NOT NULL DEFAULT 0,
  villages_conquered INTEGER NOT NULL DEFAULT 0,
  alive INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS local_kingdoms_world_seat_idx
  ON local_kingdoms(world_id, seat_kind, controller_player_id);

CREATE TABLE IF NOT EXISTS local_villages (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  kingdom_id TEXT NOT NULL REFERENCES local_kingdoms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  x INTEGER NOT NULL CHECK (x BETWEEN 0 AND 49),
  y INTEGER NOT NULL CHECK (y BETWEEN 0 AND 49),
  is_capital INTEGER NOT NULL,
  loyalty INTEGER NOT NULL,
  resources_json TEXT NOT NULL,
  buildings_json TEXT NOT NULL,
  army_json TEXT NOT NULL,
  state_version INTEGER NOT NULL DEFAULT 0,
  UNIQUE (world_id, x, y)
);

CREATE TABLE IF NOT EXISTS local_construction_jobs (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  village_id TEXT NOT NULL REFERENCES local_villages(id) ON DELETE CASCADE,
  building TEXT NOT NULL,
  target_level INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completes_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'complete'))
);

CREATE UNIQUE INDEX IF NOT EXISTS local_construction_one_active_idx
  ON local_construction_jobs(village_id)
  WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS local_command_inbox (
  command_id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  request_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_world_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  world_version INTEGER NOT NULL,
  event_sequence INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (world_id, world_version, event_sequence)
);

CREATE INDEX IF NOT EXISTS local_world_events_reconnect_idx
  ON local_world_events(world_id, world_version, event_sequence);

CREATE TABLE IF NOT EXISTS local_chat_messages (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES local_players(id) ON DELETE CASCADE,
  kingdom_id TEXT NOT NULL REFERENCES local_kingdoms(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  kingdom_name TEXT NOT NULL,
  arena_tier TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 280),
  sent_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS local_chat_messages_world_time_idx
  ON local_chat_messages(world_id, sent_at, id);
