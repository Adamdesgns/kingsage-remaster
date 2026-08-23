-- 0010 — horses.
--
-- Horses are a village resource, not a unit: they do not fight and cannot
-- march. They accrue from Stable level and are spent converting foot soldiers
-- into cavalry.
--
-- `horses_at` is the last moment the herd was brought up to date, the same
-- lazy-accrual shape resources already use — a world nobody looked at for a
-- week must not owe a week of timer work.
--
-- ⚠️ NOT REPLAY-SAFE: ALTER TABLE ADD COLUMN throws on the second run and
-- migrate() replays everything. store.ts runs this CONDITIONALLY after reading
-- the live schema — same mechanism as 0008 and 0009.

ALTER TABLE local_villages ADD COLUMN horses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE local_villages ADD COLUMN horses_at TEXT;
