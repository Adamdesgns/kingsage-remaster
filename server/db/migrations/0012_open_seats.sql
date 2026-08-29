-- 0012 — open seats: fresh starts for new players, and an AI that leaves
-- them alone.
--
-- Before this, the two unclaimed placeholder seats were seat_kind='ai',
-- indistinguishable from the four named AI kingdoms. Two consequences the
-- 2026-08-29 audit called out: the (env-gated) AI tick would develop the
-- very seats a new player is about to claim, and there was no way to give
-- fresh starts priority over inheriting a named kingdom.
--
-- `seat_kind` gains a fourth value, 'open'. findOpenSeat() claims 'open'
-- seats first, then named 'ai' kingdoms (capacity stays six); the AI tick
-- acts only for seat_kind='ai'.
--
-- SQLite cannot alter a CHECK constraint in place — table rebuild, same as
-- 0007.
--
-- ⚠️ THIS FILE IS NOT REPLAY-SAFE ON ITS OWN and must never be added to the
-- unconditional loop in migrate(). migrate() reads the live schema and only
-- executes this while the constraint text lacks 'open'. See store.ts.

PRAGMA foreign_keys = OFF;

CREATE TABLE local_kingdoms_open_rebuild (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  seat_kind TEXT NOT NULL CHECK (seat_kind IN ('human', 'ai', 'freehold', 'open')),
  controller_player_id TEXT REFERENCES local_players(id) ON DELETE SET NULL,
  capital_village_id TEXT NOT NULL,
  troop_levels_json TEXT NOT NULL,
  war_victory_points INTEGER NOT NULL DEFAULT 0,
  villages_conquered INTEGER NOT NULL DEFAULT 0,
  alive INTEGER NOT NULL DEFAULT 1
);

INSERT INTO local_kingdoms_open_rebuild
SELECT id, world_id, name, color, seat_kind, controller_player_id,
       capital_village_id, troop_levels_json, war_victory_points,
       villages_conquered, alive
FROM local_kingdoms;

DROP TABLE local_kingdoms;

ALTER TABLE local_kingdoms_open_rebuild RENAME TO local_kingdoms;

CREATE INDEX IF NOT EXISTS local_kingdoms_world_seat_idx
  ON local_kingdoms(world_id, seat_kind, controller_player_id);

-- Backfill: the placeholder seats seedWorld() renamed are recognisable by
-- the name it gave them and by never having been claimed. Named AI kingdoms
-- and everything a player already holds are untouched.
UPDATE local_kingdoms
SET seat_kind = 'open'
WHERE seat_kind = 'ai'
  AND controller_player_id IS NULL
  AND name LIKE 'Frontier March %';

PRAGMA foreign_keys = ON;
