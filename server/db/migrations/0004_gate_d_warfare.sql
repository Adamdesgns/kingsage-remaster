PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS local_marches (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  kingdom_id TEXT NOT NULL REFERENCES local_kingdoms(id) ON DELETE CASCADE,
  from_village_id TEXT NOT NULL REFERENCES local_villages(id) ON DELETE CASCADE,
  target_village_id TEXT NOT NULL REFERENCES local_villages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('scout', 'attack', 'support', 'return')),
  status TEXT NOT NULL CHECK (status IN ('outbound', 'awaiting_battle', 'returning', 'complete')),
  army_json TEXT NOT NULL,
  loot_json TEXT NOT NULL DEFAULT '{"wood":0,"stone":0,"iron":0}',
  departed_at TEXT NOT NULL,
  arrives_at TEXT NOT NULL,
  battle_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_local_marches_status_arrival
  ON local_marches(status, arrives_at);

CREATE INDEX IF NOT EXISTS idx_local_marches_kingdom_status
  ON local_marches(kingdom_id, status, arrives_at);

CREATE TABLE IF NOT EXISTS local_scout_reports (
  id TEXT PRIMARY KEY,
  march_id TEXT NOT NULL UNIQUE REFERENCES local_marches(id) ON DELETE CASCADE,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  kingdom_id TEXT NOT NULL REFERENCES local_kingdoms(id) ON DELETE CASCADE,
  target_village_id TEXT NOT NULL REFERENCES local_villages(id) ON DELETE CASCADE,
  target_village_version INTEGER NOT NULL,
  target_village_name TEXT NOT NULL,
  target_kingdom_name TEXT NOT NULL,
  observed_army_json TEXT NOT NULL,
  observed_resources_json TEXT NOT NULL,
  observed_buildings_json TEXT NOT NULL,
  layout_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_scout_reports_kingdom_target
  ON local_scout_reports(kingdom_id, target_village_id, created_at DESC);

CREATE TABLE IF NOT EXISTS local_battle_sessions (
  id TEXT PRIMARY KEY,
  march_id TEXT NOT NULL UNIQUE REFERENCES local_marches(id) ON DELETE CASCADE,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  attacker_kingdom_id TEXT NOT NULL REFERENCES local_kingdoms(id) ON DELETE CASCADE,
  defender_kingdom_id TEXT NOT NULL REFERENCES local_kingdoms(id) ON DELETE CASCADE,
  attacker_village_id TEXT NOT NULL REFERENCES local_villages(id) ON DELETE CASCADE,
  defender_village_id TEXT NOT NULL REFERENCES local_villages(id) ON DELETE CASCADE,
  defender_village_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'retreated')),
  plan_json TEXT NOT NULL,
  seed TEXT NOT NULL,
  attacker_army_json TEXT NOT NULL,
  defender_army_json TEXT NOT NULL,
  attacker_levels_json TEXT NOT NULL,
  defender_levels_json TEXT NOT NULL,
  defender_wall_level INTEGER NOT NULL,
  defender_resources_json TEXT NOT NULL,
  outcome_json TEXT,
  opened_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_local_battle_sessions_attacker_status
  ON local_battle_sessions(attacker_kingdom_id, status, opened_at DESC);

CREATE TABLE IF NOT EXISTS local_battle_orders (
  battle_id TEXT NOT NULL REFERENCES local_battle_sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  squad TEXT NOT NULL CHECK (squad IN ('vanguard', 'archers', 'riders')),
  x REAL NOT NULL,
  y REAL NOT NULL,
  at_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (battle_id, sequence)
);

PRAGMA optimize;
