-- Battles slice A: an attack carries the plan it will be fought under, and
-- an attack whose owner never shows up resolves itself instead of parking an
-- army outside a wall forever.
--
-- A separate table rather than columns on local_marches on purpose: migrate()
-- re-runs every migration on every boot, and SQLite has no
-- "ALTER TABLE ... ADD COLUMN IF NOT EXISTS". CREATE TABLE IF NOT EXISTS is
-- the only shape that is safe to replay, which is the pattern every migration
-- here already follows.
CREATE TABLE IF NOT EXISTS local_march_plans (
  march_id TEXT PRIMARY KEY REFERENCES local_marches(id) ON DELETE CASCADE,
  -- The four-axis BattlePlan chosen when the attack was launched. NULL is
  -- impossible; an attack launched without one stores UNPLANNED_ATTACK_PLAN.
  plan_json TEXT NOT NULL,
  -- Stamped when the march ARRIVES, not when it launches: the deadline is
  -- "how long the attacker has to show up at the walls", not travel time.
  -- NULL while the march is still on the road.
  auto_resolve_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_local_march_plans_auto_resolve
  ON local_march_plans(auto_resolve_at);
