-- 0009 — a real construction queue.
--
-- `status` was CHECK (status IN ('queued', 'complete')), which allowed exactly
-- two states: building, or built. There was nowhere to put "queued but not
-- started", so a village could hold one order and refused every other.
--
-- Adam, 2026-08-22: "I want to be able to que as many jobs as possible then they
-- auto complete as the resources are available if you don't have them."
--
-- 'waiting' is the new state: the player has ordered it, the village has not
-- paid for it yet, and it starts the moment production covers the cost.
--
-- The one-active unique index is kept AS IS and is now doing real work: only one
-- job may be 'queued' per village, so the queue physically cannot build two
-- things at once however many orders are stacked behind it.
--
-- ⚠️ NOT REPLAY-SAFE. SQLite cannot alter a CHECK constraint, so this rebuilds
-- the table. store.ts runs it CONDITIONALLY after reading the live schema —
-- same mechanism as 0007 and 0008.

PRAGMA foreign_keys = OFF;

CREATE TABLE local_construction_jobs_queue_rebuild (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  village_id TEXT NOT NULL REFERENCES local_villages(id) ON DELETE CASCADE,
  building TEXT NOT NULL,
  target_level INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completes_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'waiting', 'complete'))
);

INSERT INTO local_construction_jobs_queue_rebuild
SELECT id, world_id, village_id, building, target_level, started_at, completes_at, status
FROM local_construction_jobs;

DROP TABLE local_construction_jobs;

ALTER TABLE local_construction_jobs_queue_rebuild RENAME TO local_construction_jobs;

CREATE UNIQUE INDEX IF NOT EXISTS local_construction_one_active_idx
  ON local_construction_jobs(village_id)
  WHERE status = 'queued';

PRAGMA foreign_keys = ON;
