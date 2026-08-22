-- 0007 — Freeholds: abandoned settlements as the first rung.
--
-- `seat_kind` was CHECK (seat_kind IN ('human', 'ai')). Freeholds need a third
-- value, and SQLite cannot alter a CHECK constraint in place — the table has to
-- be rebuilt.
--
-- ⚠️ THIS FILE IS NOT REPLAY-SAFE ON ITS OWN and must never be added to the
-- unconditional loop in migrate(). Every other migration in this directory is
-- written with IF NOT EXISTS and re-runs harmlessly on every boot; this one
-- drops and renames a table. migrate() therefore reads the live schema and only
-- executes this when the old constraint is still present. See store.ts.

PRAGMA foreign_keys = OFF;

CREATE TABLE local_kingdoms_freehold_rebuild (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES local_worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  seat_kind TEXT NOT NULL CHECK (seat_kind IN ('human', 'ai', 'freehold')),
  controller_player_id TEXT REFERENCES local_players(id) ON DELETE SET NULL,
  capital_village_id TEXT NOT NULL,
  troop_levels_json TEXT NOT NULL,
  war_victory_points INTEGER NOT NULL DEFAULT 0,
  villages_conquered INTEGER NOT NULL DEFAULT 0,
  alive INTEGER NOT NULL DEFAULT 1
);

INSERT INTO local_kingdoms_freehold_rebuild
SELECT id, world_id, name, color, seat_kind, controller_player_id,
       capital_village_id, troop_levels_json, war_victory_points,
       villages_conquered, alive
FROM local_kingdoms;

DROP TABLE local_kingdoms;

ALTER TABLE local_kingdoms_freehold_rebuild RENAME TO local_kingdoms;

CREATE INDEX IF NOT EXISTS local_kingdoms_world_seat_idx
  ON local_kingdoms(world_id, seat_kind, controller_player_id);

PRAGMA foreign_keys = ON;
