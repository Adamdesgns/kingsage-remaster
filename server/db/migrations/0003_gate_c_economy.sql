PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS local_village_economy (
  village_id TEXT PRIMARY KEY REFERENCES local_villages(id) ON DELETE CASCADE,
  last_materialized_at TEXT NOT NULL,
  resource_carry_json TEXT NOT NULL DEFAULT '{"wood":0,"stone":0,"iron":0}',
  layout_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS local_recruitment_jobs (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  village_id TEXT NOT NULL REFERENCES local_villages(id) ON DELETE CASCADE,
  troop TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
  started_at TEXT NOT NULL,
  completes_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'complete'))
);

CREATE UNIQUE INDEX IF NOT EXISTS local_recruitment_one_active_idx
  ON local_recruitment_jobs(village_id)
  WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS local_research_jobs (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  kingdom_id TEXT NOT NULL REFERENCES local_kingdoms(id) ON DELETE CASCADE,
  village_id TEXT NOT NULL REFERENCES local_villages(id) ON DELETE CASCADE,
  troop TEXT NOT NULL,
  target_level INTEGER NOT NULL CHECK (target_level BETWEEN 2 AND 10),
  started_at TEXT NOT NULL,
  completes_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'complete'))
);

CREATE UNIQUE INDEX IF NOT EXISTS local_research_one_active_idx
  ON local_research_jobs(kingdom_id)
  WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS local_kingdom_notifications (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  kingdom_id TEXT NOT NULL REFERENCES local_kingdoms(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS local_kingdom_notifications_recent_idx
  ON local_kingdom_notifications(kingdom_id, created_at DESC, id DESC);
