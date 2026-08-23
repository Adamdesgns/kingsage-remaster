-- 0008 — Realm of Power replaces loyalty.
--
-- `loyalty` was a 0-100 Tribal Wars track. Realm of Power runs 0 → the
-- settlement's own point score (max 10,000), so the range, the reduction, the
-- cap, the regeneration and the post-capture value are all different numbers
-- from a different game. Reusing the old column would have left every reader
-- believing a 4,200 was a percentage.
--
-- ⚠️ NOT REPLAY-SAFE. `ALTER TABLE ... ADD COLUMN` throws "duplicate column" on
-- the second run, and migrate() replays every migration in the unconditional
-- loop. This file is executed CONDITIONALLY from store.ts, which checks the
-- live schema first — same mechanism as 0007.

ALTER TABLE local_villages ADD COLUMN realm_of_power INTEGER NOT NULL DEFAULT 0;
ALTER TABLE local_villages ADD COLUMN realm_of_power_at TEXT;
