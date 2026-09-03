-- Preserve partial horse production between ticks and across restarts.
-- Conditional in store.ts; existing whole animals and timestamps are unchanged.
ALTER TABLE local_villages ADD COLUMN horses_fraction REAL NOT NULL DEFAULT 0
  CHECK (horses_fraction >= 0 AND horses_fraction < 1);
