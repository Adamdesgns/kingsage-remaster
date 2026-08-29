-- 0011 — scouts observe realm power.
--
-- Audit 2026-08-29 finding 8.3: snapshots leaked every foreign settlement's
-- exact realm power and herd size for free, which voided the scouting
-- economy. The fix fogs those fields in every snapshot — so the scout report
-- becomes the ONE honest way to learn how firmly a settlement holds itself.
-- The observed maximum is derived from observed_buildings at read time and
-- needs no column; the current value is dynamic state and is recorded here.
--
-- ⚠️ NOT REPLAY-SAFE: ALTER TABLE ADD COLUMN throws on the second run and
-- migrate() replays everything. store.ts runs this CONDITIONALLY after reading
-- the live schema — same mechanism as 0008, 0009 and 0010.

ALTER TABLE local_scout_reports ADD COLUMN observed_realm_of_power INTEGER NOT NULL DEFAULT 0;
