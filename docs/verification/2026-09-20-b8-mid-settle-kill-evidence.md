# B8 — mid-settle SIGKILL (battle.resolve in flight): evidence

**Date:** 2026-09-20 · **Executed by:** [Cursor] (cloud; model: Grok / Cursor Models) · **Owner of record:** Adam · **Reviewer owed:** Claude (per matrix §7)
**Matrix task:** `docs/verification/2026-09-17-full-game-acceptance-matrix.md` §7 — "Extend the B8 drill so the kill lands during battle settlement (audit M3's exact wording)". Recipe of record: `docs/verification/2026-09-20-battle-settle-evidence.md` ("The B8 mid-settle recipe"). Audit text: `docs/audits/kingsage-functionality-audit.md` §15 M3, "kill -9 mid-battle-settle + restart leaves a consistent world".
**Row advanced:** **B8** mid-battle-settle variant (was NOT RUN). Power loss still NOT RUN. Conquest still NOT RUN.
**SHA executed:** `8bb89fa` on `cursor/b8-mid-settle-kill-1e7a` (= [PR #18](https://github.com/Adamdesgns/kingsage-remaster/pull/18) tip `e6a4204` + `scripts/b8-mid-settle-kill-drill.mjs`). `git diff 9b478db 8bb89fa -- server/ packages/ roblox/` is **empty**, so the world server under test is byte-identical to **`main @ 9b478db`**.
**Environment:** cloud Linux, Node `v22.14.0`, `sqlite3 3.45.1`. No hosting, no Studio, no PC, no phone.
**Result: PASS — 10/10 steps, exit 0.** Wall time 38.5 s (`13:37:47.279Z` → `13:38:25.771Z`), dominated by the real 12 s Spy and 25 s attack. No timer was shortened. No `KINGSAGE_AUTO_RESOLVE_MS` override.

## What this proves, and what it does not

Proves, at `8bb89fa`, against a disposable world over raw HTTP:

- **A battle was open, then `battle.resolve` was in the air, then the process died by `SIGKILL`.** One attacker (Roblox door) scouted Saltmarsh Freehold, sent 10 Berserkers, opened the battle with the report's version and the best plan, snapshotted the unsettle ledger, fired `battle.resolve`, and `kill -KILL`ed the server 8 ms after that request left the client. Exit `code null, signal SIGKILL`. No shutdown hook ran.
- **On restart the settlement is all-or-nothing.** This recorded run is **SETTLED**: session `resolved` with `outcome_json` present; march `returning`/`return` carrying 9 Berserkers + 2 Squire prisoners and 90 wood; `auto_resolve_at` NULL; Freehold garrison emptied and stock 400→310 wood; war points 0→24; both battle notifications present; `battle.started` 1 / `battle.resolved` 1 / `village.conquered` 0; the resolve `commandId` in the inbox. Nothing half-written.
- **The stored outcome is the shared rule.** `outcome_json` == game-core `resolveBattle(frozen inputs)` byte-for-byte. Replay of the pre-kill `commandId` is byte-identical. A fresh `battle.resolve` → 409 `BATTLE_CLOSED`. A militia recruit after the kill is accepted — the world is writable.
- **Integrity after the kill.** Restart as first opener: `/api/health` 200; `PRAGMA integrity_check` = `ok`; `foreign_key_check` empty; `journal_mode` still `wal`. Identity: rejoin `created:false`, same player/kingdom/village.

Does **not** prove: **that this recorded run's kill landed inside the settle transaction.** It did not. `resolved_at` is `13:38:25.461Z`; the SIGKILL line is `13:38:25.465Z`; the HTTP 200 arrived before/with the kill (`# response arrived before/with the kill`). Settle had **committed and the client had the body** before the process died. That is the weaker of the two legal landings (wholly present). A smoke at the same 8 ms delay, one commit earlier, produced the stronger landing: SETTLED + `ECONNRESET` (after COMMIT, before the socket write). A smoke at 0 ms produced UNSETTLED + in-flight (before COMMIT). Half-settled was never observed. The drill records where the kill landed rather than claiming it sat inside `COMMIT`. Also not proven: **power loss** (SIGKILL is not a pulled plug); **WAL-recovery-from-an-empty-main-file** (after a real scout + attack the `-wal` is 1.68 MB and a checkpoint may already have run — that claim stays with `69b7548`); **conquest** (no Count rode); `battle.retreat`; rams; an unattended auto-resolve kill; anything Roblox-side. Does not touch any real world: absolute `mkdtemp` DB under `/tmp`, throwaway key, port 4271, inherited `KINGSAGE_*` stripped before the seed knob is set, preflight refuses if anything already answers on the port.

## How to rerun

```bash
node scripts/b8-mid-settle-kill-drill.mjs                 # expect exit 0, "B8 mid-settle kill drill PASS (10/10 steps PASS)", ~40 s
B8_SETTLE_PORT=4271 node scripts/b8-mid-settle-kill-drill.mjs
B8_SETTLE_KILL_DELAY_MS=0 node scripts/b8-mid-settle-kill-drill.mjs   # often UNSETTLED (kill on flush, before COMMIT)
```

Needs Node 22 and the `sqlite3` CLI. The scratch directory is removed on PASS and kept (path printed) on FAIL. The 8 ms default delay is a **steering knob**, stated in the script: 0 ms usually dies before COMMIT; 8 ms has been observed to let settle COMMIT. Both landings are PASS; HALF is FAIL. `resolveBattle` / `calculateLoot` / `marchDurationSeconds` are imported from `packages/game-core` (the drill re-execs itself under `--experimental-strip-types`).

## Step table

| Step | What it drives | Result | Key evidence |
|---|---|---|---|
| 1 | Fresh world, P1 linked, Freehold unarmed | **PASS** | health 200; p1 `kingdom-1`/`village-1-capital`; Freehold `village-freehold-3` 10 Squires wall 0 400/350/250; 11.0454 tiles |
| 2 | Spy, server running | **PASS** | report at `13:37:59.640Z` = arrivesAt; F v0; still fogged |
| 3 | Attack + `battle.open`; pre-settle snapshot | **PASS** | session `open`; grace `openedAt + 180000 ms`; ledger unsettle (0 points, 1 started / 0 resolved, no resolve inbox row) |
| 4 | `battle.resolve` + SIGKILL 8 ms after flush | **PASS** | HTTP **200** (body arrived); SIGKILL `13:38:25.465Z`; exit `signal SIGKILL` |
| 5 | Dead process; file sizes | **PASS** | health no response; main 4096 B, **-wal 1 685 112 B**, -shm 32 768 B |
| 6 | Restart as first opener; integrity | **PASS** | health 200; `integrity_check` ok; `foreign_key_check` empty; `journal_mode` wal |
| 7 | Identity | **PASS** | rejoin `created:false`; same ids |
| 8 | All-or-nothing classification | **PASS** | **SETTLED** — every settle column present, none of the open columns; Freehold still `freehold-3` |
| 9 | Oracle, replay, closure | **PASS** | outcome == `resolveBattle(frozen)`; loot 90 wood; +24 points; homeward `{spear:2,axe:9}`; replay byte-identical; `BATTLE_CLOSED` |
| 10 | World writable | **PASS** | militia recruit accepted (version 9) |

## Gate sanity at this tip (same session, cloud image)

| Gate | Result |
|---|---|
| `npm run check:types` | **clean** (after `npm install` at root for `@types/node` and a `--no-save` `typescript` into `mobile-rebuild/` — the image ships neither; nothing committed) |
| `npm run test:core` | **92/92, 0 fail** |
| `npm run test:server` | **114/114, 0 fail, 0 skipped** with Lune 0.10.5 on `PATH` (downloaded to `/tmp`) |
| `npm run test:luau` | 31 files syntax-clean · **72 rules, 0 failed** · 7 spike-sim checks, 0 failed |

No `server/`, `packages/`, or `roblox/` code changed on this branch; the gates are sanity, not a claim of new coverage.

## Honesty notes

- **This recorded run is the weaker mid-settle landing.** The client got the 200. `resolved_at` (`13:38:25.461Z`) is 4 ms before the SIGKILL line (`13:38:25.465Z`). I did not re-run to shop for an `ECONNRESET`. The first run of `8bb89fa` is the record.
- **Two smokes preceded it, both PASS 10/10, different landings.** Smoke at `B8_SETTLE_KILL_DELAY_MS=0` (`bec4c78`): HTTP in-flight, **UNSETTLED**, post-restart `battle.resolve` accepted and then matched the oracle. Smoke at `B8_SETTLE_KILL_DELAY_MS=8` (same script, env override, still `bec4c78`): HTTP `ECONNRESET`, **SETTLED**, replay byte-identical. That is why the default became 8 ms (`8bb89fa`). The 8 ms knob is steering, not a fake clock.
- **We never observed HALF.** The invariant the recipe asked for — one transaction, so a mix of present and absent settle columns is a bug — held on every run.
- **`SIGKILL at unknown` in step 4's summary is a reporting race**, not a missing kill. The kill line is in the log (`13:38:25.465Z`); the summary string captured `killedAt` before the 8 ms timer assigned it. Fixed on the branch after this run; the recorded log is not rewritten.
- **This is not the B8 WAL-recovery claim.** Main file 4096 B + 1.68 MB `-wal` after a real scout and attack is expected; a checkpoint may already have run. WAL recovery from an empty main file stays with `69b7548`.
- **The seed army is a stimulus.** It puts troops in a village that would otherwise have none; the Freehold guarantee is checked live in step 1. Settlement, the oracle, replay and the all-or-nothing columns ran in the production path over HTTP.
- Cosmetic: `Persistent local database:` prints un-prefixed once because both banner lines arrive in one stdout chunk. The two `ExperimentalWarning` lines Node prints before the header are omitted below; nothing else is.
- Model of record: Grok / Cursor Models (cloud). No secrets: the key is a throwaway literal, never reused.

## Run record — recorded drill (exit 0)

Verbatim output of `node scripts/b8-mid-settle-kill-drill.mjs` at `8bb89fa`, minus Node's two `ExperimentalWarning` preamble lines. UUIDs are per-run and disposable.

```text
# B8 — mid-settle SIGKILL drill (current tip)
date: 2026-09-20T13:37:47.279Z
sha: 8bb89fa
node: v22.14.0
sqlite3: 3.45.1 2024-01-30 16:01:20 e876e51a0ed5c5b3126f52e532044363a014bc594cfefa87ffb5b82257ccalt1 (64-bit)
scratch: /tmp/kingsmarch-b8-settle-GsDyot
db: /tmp/kingsmarch-b8-settle-GsDyot/world.sqlite
port: 4271
kill delay after request flush: 8 ms

## Step 1 — fresh disposable world with KINGSAGE_DEV_SEED_ARMY; P1 linked through the Roblox door; nearest Freehold holds only the fixture's 10 Squires behind no wall
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-b8-settle-GsDyot/world.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_DEV_SEED_ARMY=axe:20,spear:10,scout:3,ram:1 KINGSAGE_BIND=127.0.0.1 PORT=4271 node --experimental-strip-types src/index.ts &)   # world server
  [server] KingSage shared world listening at http://127.0.0.1:4271/?world=shared
Persistent local database: /tmp/kingsmarch-b8-settle-GsDyot/world.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":980001,"displayName":"Settle Kill One"} -> 200 {"playerId":"player-3f76e89a-9b0f-4094-8cc4-d2afc46249b2","kingdomId":"kingdom-1","created":true,"contractVersion":1}
p1: player-3f76e89a-9b0f-4094-8cc4-d2afc46249b2 / kingdom-1 / village-1-capital
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || state_version || '|' || kingdom_id || '|' || name FROM local_villages WHERE id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|1|kingdom-1|Settle Kill One's Realm Keep
  -> exit 0
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || state_version || '|' || kingdom_id || '|' || name FROM local_villages WHERE id = 'village-freehold-3';"
  {"wood":400,"stone":350,"iron":250}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|216|0|freehold-3|Saltmarsh Freehold
  -> exit 0
p1 home village-1-capital at (19,33); nearest Freehold village-freehold-3 "Saltmarsh Freehold" (freehold-3) at (18,44), 11.0454 tiles; scout 12s; attack 25s
[step 1] PASS — health 200; p1 player-3f76e89a-9b0f-4094-8cc4-d2afc46249b2/kingdom-1/village-1-capital; seed {"spear":10,"axe":20,"scout":3,"ram":1}; Freehold village-freehold-3 "Saltmarsh Freehold" {"spear":10} wall 0 {"wood":400,"stone":350,"iron":250}; 11.0454 tiles

## Step 2 — one Spy to the Freehold, server running: report stamped at arrivesAt, army/wall/stock equal the row, target still fogged
POST /api/roblox/commands {"robloxUserId":980001,"commandId":"b8-settle-p1-scout","expectedWorldVersion":1,"command":{"type":"march.launch","payload":{"fromVillageId":"village-1-capital","targetVillageId":"village-freehold-3","kind":"scout","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} -> 200 {"type":"command.accepted","payload":{"commandId":"b8-settle-p1-scout","worldVersion":2,"march":{"id":"march-e14a816d-1492-4828-a9ec-afabc52d1b11","worldId":"world-7c7d5ae2","kingdomId":"kingdom-1","fromVillageId":"village-1-capital","targetVillageId":"village-freehold-3","kind":"scout","status":"outbound","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavy… (578 bytes)
waiting 13s for the Spy (due 2026-09-20T13:37:59.640Z)
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || state_version || '|' || kingdom_id || '|' || name FROM local_villages WHERE id = 'village-freehold-3';"
  {"wood":400,"stone":350,"iron":250}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|216|0|freehold-3|Saltmarsh Freehold
  -> exit 0
[step 2] PASS — Spy arrived 2026-09-20T13:37:59.640Z; report stamped there; F {"spear":10} wall 0 {"wood":400,"stone":350,"iron":250} v0; still fogged

## Step 3 — 10 Berserkers launched at the Freehold; at the walls battle.open accepted with the report's version and the best plan; session open; pre-settle ledger snapshotted
POST /api/roblox/commands {"robloxUserId":980001,"commandId":"b8-settle-p1-attack","expectedWorldVersion":3,"command":{"type":"march.launch","payload":{"fromVillageId":"village-1-capital","targetVillageId":"village-freehold-3","kind":"attack","army":{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} -> 200 {"type":"command.accepted","payload":{"commandId":"b8-settle-p1-attack","worldVersion":4,"march":{"id":"march-9a18a8fc-1629-455d-8146-f627f8ee1557","worldId":"world-7c7d5ae2","kingdomId":"kingdom-1","fromVillageId":"village-1-capital","targetVillageId":"village-freehold-3","kind":"attack","status":"outbound","army":{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"he… (581 bytes)
waiting 25s for march-9a18a8fc-1629-455d-8146-f627f8ee1557 to reach 'awaiting_battle' at 2026-09-20T13:38:25.362Z (server running)
POST /api/roblox/commands {"robloxUserId":980001,"commandId":"b8-settle-p1-open","expectedWorldVersion":6,"command":{"type":"battle.open","payload":{"marchId":"march-9a18a8fc-1629-455d-8146-f627f8ee1557","targetVillageVersion":0,"plan":{"entry":"West Ridge","troops":"Balanced Army","time":"Dawn","style":"Flanking Strike"}}}} -> 200 {"type":"command.accepted","payload":{"commandId":"b8-settle-p1-open","worldVersion":7,"battle":{"id":"battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd","marchId":"march-9a18a8fc-1629-455d-8146-f627f8ee1557","worldId":"world-7c7d5ae2","attackerKingdomId":"kingdom-1","defenderKingdomId":"freehold-3","attackerVillageId":"village-1-capital","defenderVillageId":"village-freehold-3","status":"open","plan":{… (903 bytes)
$ sqlite3 <db> "SELECT b.status || '|' || b.seed || '|' || b.plan_json || '|' || b.attacker_army_json || '|' || b.defender_army_json || '|' || b.attacker_levels_json || '|' || b.defender_levels_json || '|' || b.defender_wall_level || '|' || b.defender_resources_json || '|' || coalesce(b.outcome_json, 'NULL') || '|' || b.opened_at || '|' || coalesce(b.resolved_at, 'NULL') || '|' || b.defender_village_version || '|' || (SELECT count(*) FROM local_battle_orders o WHERE o.battle_id = b.id) || '|' || b.march_id || '|' || b.defender_kingdom_id FROM local_battle_sessions b WHERE b.id = 'battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd';"
  open|b31030005d25a2fddc438d38|{"entry":"West Ridge","troops":"Balanced Army","time":"Dawn","style":"Flanking Strike"}|{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|{"militia":0,"spear":10,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|{"militia":1,"spear":1,"sword":1,"axe":1,"archer":1,"scout":1,"lightCavalry":1,"heavyCavalry":1,"ram":1,"trebuchet":1,"noble":1}|{"militia":1,"spear":1,"sword":1,"axe":1,"archer":1,"scout":1,"lightCavalry":1,"heavyCavalry":1,"ram":1,"trebuchet":1,"noble":1}|0|{"wood":400,"stone":350,"iron":250}|NULL|2026-09-20T13:38:25.403Z|NULL|0|0|march-9a18a8fc-1629-455d-8146-f627f8ee1557|freehold-3
  -> exit 0
$ sqlite3 <db> "SELECT plan_json || '|' || coalesce(auto_resolve_at, 'NULL') FROM local_march_plans WHERE march_id = 'march-9a18a8fc-1629-455d-8146-f627f8ee1557';"
  {"entry":"Main Breach","troops":"Balanced Army","time":"Midday","style":"Full Assault"}|2026-09-20T13:41:25.403Z
  -> exit 0
$ sqlite3 <db> "SELECT b.status || '|' || b.seed || '|' || b.plan_json || '|' || b.attacker_army_json || '|' || b.defender_army_json || '|' || b.attacker_levels_json || '|' || b.defender_levels_json || '|' || b.defender_wall_level || '|' || b.defender_resources_json || '|' || coalesce(b.outcome_json, 'NULL') || '|' || b.opened_at || '|' || coalesce(b.resolved_at, 'NULL') || '|' || b.defender_village_version || '|' || (SELECT count(*) FROM local_battle_orders o WHERE o.battle_id = b.id) || '|' || b.march_id || '|' || b.defender_kingdom_id FROM local_battle_sessions b WHERE b.id = 'battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd';"
  open|b31030005d25a2fddc438d38|{"entry":"West Ridge","troops":"Balanced Army","time":"Dawn","style":"Flanking Strike"}|{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|{"militia":0,"spear":10,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|{"militia":1,"spear":1,"sword":1,"axe":1,"archer":1,"scout":1,"lightCavalry":1,"heavyCavalry":1,"ram":1,"trebuchet":1,"noble":1}|{"militia":1,"spear":1,"sword":1,"axe":1,"archer":1,"scout":1,"lightCavalry":1,"heavyCavalry":1,"ram":1,"trebuchet":1,"noble":1}|0|{"wood":400,"stone":350,"iron":250}|NULL|2026-09-20T13:38:25.403Z|NULL|0|0|march-9a18a8fc-1629-455d-8146-f627f8ee1557|freehold-3
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || loot_json || '|' || departed_at || '|' || arrives_at || '|' || coalesce(battle_id, 'NULL') FROM local_marches WHERE id = 'march-9a18a8fc-1629-455d-8146-f627f8ee1557';"
  march-9a18a8fc-1629-455d-8146-f627f8ee1557|attack|awaiting_battle|{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|{"wood":0,"stone":0,"iron":0}|2026-09-20T13:38:00.362Z|2026-09-20T13:38:25.362Z|battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd
  -> exit 0
$ sqlite3 <db> "SELECT plan_json || '|' || coalesce(auto_resolve_at, 'NULL') FROM local_march_plans WHERE march_id = 'march-9a18a8fc-1629-455d-8146-f627f8ee1557';"
  {"entry":"Main Breach","troops":"Balanced Army","time":"Midday","style":"Full Assault"}|2026-09-20T13:41:25.403Z
  -> exit 0
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || state_version || '|' || kingdom_id || '|' || name FROM local_villages WHERE id = 'village-freehold-3';"
  {"wood":400,"stone":350,"iron":250}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|216|0|freehold-3|Saltmarsh Freehold
  -> exit 0
$ sqlite3 <db> "SELECT war_victory_points FROM local_kingdoms WHERE id = 'kingdom-1';"
  0
  -> exit 0
$ sqlite3 <db> "SELECT kind || '|' || created_at || '|' || message FROM local_kingdom_notifications WHERE kingdom_id = 'kingdom-1' ORDER BY created_at, rowid;"
  scout|2026-09-20T13:37:59.640Z|Scout report ready: Saltmarsh Freehold.
  march|2026-09-20T13:38:17.017Z|1 troops returned to Settle Kill One's Realm Keep.
  -> exit 0
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || state_version || '|' || kingdom_id || '|' || name FROM local_villages WHERE id = 'village-freehold-3';"
  {"wood":400,"stone":350,"iron":250}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|216|0|freehold-3|Saltmarsh Freehold
  -> exit 0
$ sqlite3 <db> "SELECT kind || '|' || created_at || '|' || message FROM local_kingdom_notifications WHERE kingdom_id = 'freehold-3' ORDER BY created_at, rowid;"
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_world_events WHERE event_type = 'battle.started';"
  1
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_world_events WHERE event_type = 'battle.resolved';"
  0
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_world_events WHERE event_type = 'village.conquered';"
  0
  -> exit 0
$ sqlite3 <db> "SELECT result_json FROM local_command_inbox WHERE command_id = 'b8-settle-p1-resolve';"
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox WHERE 1=1;"
  3
  -> exit 0
pre-settle: session open outcome=null resolvedAt=null; march awaiting_battle/attack loot {"wood":0,"stone":0,"iron":0} arrives 2026-09-20T13:38:25.362Z; auto_resolve_at 2026-09-20T13:41:25.403Z; F army {"spear":10} stock {"wood":400,"stone":350,"iron":250} kingdom freehold-3; points 0; battle.started 1 battle.resolved 0; inbox resolve empty; inbox 3 rows
[step 3] PASS — attack march-9a18a8fc-1629-455d-8146-f627f8ee1557 at walls 2026-09-20T13:38:25.389Z; opened battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd at 2026-09-20T13:38:25.403Z, seed b31030005d25a2fddc438d38, grace 2026-09-20T13:41:25.403Z (180000 ms); pre-settle snapshotted (open, no outcome, awaiting_battle, auto set, F still {"spear":10}, 0 points, 1 started / 0 resolved, no resolve inbox row)

## Step 4 — fire battle.resolve and SIGKILL the moment the request has left this process; record the HTTP outcome and that the process died by SIGKILL
firing b8-settle-p1-resolve at world version 7; SIGKILL on request flush
POST /api/roblox/commands {"robloxUserId":980001,"commandId":"b8-settle-p1-resolve","expectedWorldVersion":7,"command":{"type":"battle.resolve","payload":{"battleId":"battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"b8-settle-p1-resolve","worldVersion":8,"battle":{"id":"battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd","marchId":"march-9a18a8fc-1629-455d-8146-f627f8ee1557","worldId":"world-7c7d5ae2","attackerKingdomId":"kingdom-1","defenderKingdomId":"freehold-3","attackerVillageId":"village-1-capital","defenderVillageId":"village-freehold-3","status":"resolved","… (2286 bytes)   # response arrived before/with the kill
$ kill -KILL <world server pid 3066>   # at 2026-09-20T13:38:25.465Z, resolve request flushed, +8ms
  -> world server exited (code null, signal SIGKILL) at 2026-09-20T13:38:25.469Z
[step 4] PASS — SIGKILL at unknown; HTTP responded 200; server exited signal SIGKILL

## Step 5 — the process is gone and nothing answers; file sizes recorded (a checkpoint after the scout/attack is allowed — this is not the WAL-recovery claim)
GET /api/health -> no response (ECONNREFUSED)
files at kill: main 4096 bytes, -wal 1685112 bytes, -shm 32768 bytes
[step 5] PASS — health no response; main 4096 B, -wal 1685112 B, -shm 32768 B; nothing has opened the live database since the kill

## Step 6 — restart on the same files as the FIRST opener since the kill: health 200, integrity_check ok, foreign_key_check empty, still WAL mode
restarting at 2026-09-20T13:38:25.470Z
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-b8-settle-GsDyot/world.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_DEV_SEED_ARMY=axe:20,spear:10,scout:3,ram:1 KINGSAGE_BIND=127.0.0.1 PORT=4271 node --experimental-strip-types src/index.ts &)   # world server (after kill)
  [server] KingSage shared world listening at http://127.0.0.1:4271/?world=shared
Persistent local database: /tmp/kingsmarch-b8-settle-GsDyot/world.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
$ sqlite3 <db> "PRAGMA integrity_check;"
  ok
  -> exit 0
$ sqlite3 <db> "PRAGMA foreign_key_check;"
  -> exit 0
$ sqlite3 <db> "PRAGMA journal_mode;"
  wal
  -> exit 0
files after restart: main 4096 bytes, -wal 1697472 bytes, -shm 32768 bytes
[step 6] PASS — health 200 after restart; PRAGMA integrity_check = ok; foreign_key_check empty; journal_mode wal

## Step 7 — identity — P1 rejoins as created:false with the same player, kingdom and village ids
POST /api/roblox/session {"robloxUserId":980001,"displayName":"Settle Kill One (after kill)"} -> 200 {"playerId":"player-3f76e89a-9b0f-4094-8cc4-d2afc46249b2","kingdomId":"kingdom-1","created":false,"contractVersion":1}
[step 7] PASS — rejoin created:false; same player-3f76e89a-9b0f-4094-8cc4-d2afc46249b2/kingdom-1/village-1-capital

## Step 8 — all-or-nothing — every settle column is wholly present or wholly absent; a mix is a half-settled battle and a real bug
$ sqlite3 <db> "SELECT b.status || '|' || b.seed || '|' || b.plan_json || '|' || b.attacker_army_json || '|' || b.defender_army_json || '|' || b.attacker_levels_json || '|' || b.defender_levels_json || '|' || b.defender_wall_level || '|' || b.defender_resources_json || '|' || coalesce(b.outcome_json, 'NULL') || '|' || b.opened_at || '|' || coalesce(b.resolved_at, 'NULL') || '|' || b.defender_village_version || '|' || (SELECT count(*) FROM local_battle_orders o WHERE o.battle_id = b.id) || '|' || b.march_id || '|' || b.defender_kingdom_id FROM local_battle_sessions b WHERE b.id = 'battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd';"
  resolved|b31030005d25a2fddc438d38|{"entry":"West Ridge","troops":"Balanced Army","time":"Dawn","style":"Flanking Strike"}|{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|{"militia":0,"spear":10,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|{"militia":1,"spear":1,"sword":1,"axe":1,"archer":1,"scout":1,"lightCavalry":1,"heavyCavalry":1,"ram":1,"trebuchet":1,"noble":1}|{"militia":1,"spear":1,"sword":1,"axe":1,"archer":1,"scout":1,"lightCavalry":1,"heavyCavalry":1,"ram":1,"trebuchet":1,"noble":1}|0|{"wood":400,"stone":350,"iron":250}|{"winner":"attacker","attackerSurvivors":{"militia":0,"spear":0,"sword":0,"axe":9,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0},"defenderSurvivors":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0},"attackerCasualties":{"militia":0,"spear":0,"sword":0,"axe":1,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0},"defenderCasualties":{"militia":0,"spear":8,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0},"loot":{"wood":90,"stone":0,"iron":0},"planScore":4,"orderBonus":0,"yielded":{"militia":0,"spear":2,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}|2026-09-20T13:38:25.403Z|2026-09-20T13:38:25.461Z|0|0|march-9a18a8fc-1629-455d-8146-f627f8ee1557|freehold-3
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || loot_json || '|' || departed_at || '|' || arrives_at || '|' || coalesce(battle_id, 'NULL') FROM local_marches WHERE id = 'march-9a18a8fc-1629-455d-8146-f627f8ee1557';"
  march-9a18a8fc-1629-455d-8146-f627f8ee1557|return|returning|{"militia":0,"spear":2,"sword":0,"axe":9,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|{"wood":90,"stone":0,"iron":0}|2026-09-20T13:38:00.362Z|2026-09-20T13:38:48.461Z|battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd
  -> exit 0
$ sqlite3 <db> "SELECT plan_json || '|' || coalesce(auto_resolve_at, 'NULL') FROM local_march_plans WHERE march_id = 'march-9a18a8fc-1629-455d-8146-f627f8ee1557';"
  {"entry":"Main Breach","troops":"Balanced Army","time":"Midday","style":"Full Assault"}|NULL
  -> exit 0
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || state_version || '|' || kingdom_id || '|' || name FROM local_villages WHERE id = 'village-freehold-3';"
  {"wood":310,"stone":350,"iron":250}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|216|1|freehold-3|Saltmarsh Freehold
  -> exit 0
$ sqlite3 <db> "SELECT war_victory_points FROM local_kingdoms WHERE id = 'kingdom-1';"
  24
  -> exit 0
$ sqlite3 <db> "SELECT kind || '|' || created_at || '|' || message FROM local_kingdom_notifications WHERE kingdom_id = 'kingdom-1' ORDER BY created_at, rowid;"
  scout|2026-09-20T13:37:59.640Z|Scout report ready: Saltmarsh Freehold.
  march|2026-09-20T13:38:17.017Z|1 troops returned to Settle Kill One's Realm Keep.
  battle|2026-09-20T13:38:25.461Z|Victory. 9 survivors are returning with 90 resources. 2 of their troops surrendered and march with you.
  -> exit 0
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || state_version || '|' || kingdom_id || '|' || name FROM local_villages WHERE id = 'village-freehold-3';"
  {"wood":310,"stone":350,"iron":250}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|216|1|freehold-3|Saltmarsh Freehold
  -> exit 0
$ sqlite3 <db> "SELECT kind || '|' || created_at || '|' || message FROM local_kingdom_notifications WHERE kingdom_id = 'freehold-3' ORDER BY created_at, rowid;"
  battle|2026-09-20T13:38:25.461Z|Your village defenses were defeated and 2 of your troops surrendered.
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_world_events WHERE event_type = 'battle.started';"
  1
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_world_events WHERE event_type = 'battle.resolved';"
  1
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_world_events WHERE event_type = 'village.conquered';"
  0
  -> exit 0
$ sqlite3 <db> "SELECT result_json FROM local_command_inbox WHERE command_id = 'b8-settle-p1-resolve';"
  {"type":"command.accepted","payload":{"commandId":"b8-settle-p1-resolve","worldVersion":8,"battle":{"id":"battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd","marchId":"march-9a18a8fc-1629-455d-8146-f627f8ee1557","worldId":"world-7c7d5ae2","attackerKingdomId":"kingdom-1","defenderKingdomId":"freehold-3","attackerVillageId":"village-1-capital","defenderVillageId":"village-freehold-3","status":"resolved","plan":{"entry":"West Ridge","troops":"Balanced Army","time":"Dawn","style":"Flanking Strike"},"seed":"b31030005d25a2fddc438d38","attackerArmy":{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0},"defenderArmy":{"militia":0,"spear":10,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0},"acceptedOrders":0,"openedAt":"2026-09-20T13:38:25.403Z","resolvedAt":"2026-09-20T13:38:25.461Z","outcome":{"winner":"attacker","attackerSurvivors":{"militia":0,"spear":0,"sword":0,"axe":9,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0},"defenderSurvivors":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0},"attackerCasualties":{"militia":0,"spear":0,"sword":0,"axe":1,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0},"defenderCasualties":{"militia":0,"spear":8,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0},"loot":{"wood":90,"stone":0,"iron":0},"planScore":4,"orderBonus":0,"yielded":{"militia":0,"spear":2,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}},"march":{"id":"march-9a18a8fc-1629-455d-8146-f627f8ee1557","worldId":"world-7c7d5ae2","kingdomId":"kingdom-1","fromVillageId":"village-1-capital","targetVillageId":"village-freehold-3","kind":"return","status":"returning","army":{"militia":0,"spear":2,"sword":0,"axe":9,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0},"loot":{"wood":90,"stone":0,"iron":0},"departedAt":"2026-09-20T13:38:00.362Z","arrivesAt":"2026-09-20T13:38:48.461Z","battleId":"battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd"}}}
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox WHERE 1=1;"
  4
  -> exit 0
post-restart: session resolved outcome=present resolvedAt=2026-09-20T13:38:25.461Z; march returning/return army {"spear":2,"axe":9} loot {"wood":90,"stone":0,"iron":0} arrives 2026-09-20T13:38:48.461Z; auto_resolve_at null; F army {} stock {"wood":310,"stone":350,"iron":250} kingdom freehold-3 realm 216; points 24; battle.started 1 battle.resolved 1 village.conquered 0; inbox resolve present; inbox 4 rows
classification: SETTLED flags {"sessionDone":true,"sessionOpen":false,"marchDone":true,"marchOpen":false,"planDone":true,"planOpen":false,"armyDone":true,"armyOpen":false,"pointsDone":true,"pointsOpen":false,"notesDone":true,"notesOpen":false,"eventDone":true,"eventOpen":false,"inboxDone":true,"inboxOpen":false,"attackerBattleNotes":1,"defenderBattleNotes":1}
[step 8] PASS — SETTLED: kill landed after the response (settle had committed; weaker mid-settle, still all-or-nothing); session resolved; march returning/return; auto_resolve_at null; F army {}; points 24; battle notes attacker+1 defender+1; battle.resolved 1; inbox resolve present

## Step 9 — follow-through — if SETTLED: stored outcome == resolveBattle(frozen) byte-for-byte, inbox replay identical, a fresh resolve → BATTLE_CLOSED; if UNSETTLED: no inbox row, a post-restart resolve is accepted and then matches the oracle
POST /api/roblox/commands {"robloxUserId":980001,"commandId":"b8-settle-p1-resolve","expectedWorldVersion":7,"command":{"type":"battle.resolve","payload":{"battleId":"battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"b8-settle-p1-resolve","worldVersion":8,"battle":{"id":"battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd","marchId":"march-9a18a8fc-1629-455d-8146-f627f8ee1557","worldId":"world-7c7d5ae2","attackerKingdomId":"kingdom-1","defenderKingdomId":"freehold-3","attackerVillageId":"village-1-capital","defenderVillageId":"village-freehold-3","status":"resolved","… (2286 bytes)
POST /api/roblox/commands {"robloxUserId":980001,"commandId":"b8-settle-p1-resolve-again","expectedWorldVersion":8,"command":{"type":"battle.resolve","payload":{"battleId":"battle-e490cdb4-f3e1-4cec-bbd0-0ca81e1dabfd"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"b8-settle-p1-resolve-again","code":"BATTLE_CLOSED","message":"That battle has already ended.","currentWorldVersion":8}}
[step 9] PASS — SETTLED follow-through: outcome == oracle (attacker, loot {"wood":90,"stone":0,"iron":0}, +24 points); march homeward {"spear":2,"axe":9} due 2026-09-20T13:38:48.461Z; replay byte-identical; BATTLE_CLOSED

## Step 10 — the world is writable after the kill — a fresh militia recruit is accepted
POST /api/roblox/commands {"robloxUserId":980001,"commandId":"b8-settle-p1-after-kill-recruit","expectedWorldVersion":8,"command":{"type":"village.recruit.queue","payload":{"villageId":"village-1-capital","troop":"militia","quantity":1}}} -> 200 {"type":"command.accepted","payload":{"commandId":"b8-settle-p1-after-kill-recruit","worldVersion":9,"recruitmentJob":{"id":"recruitment-c0f3e14f-b00e-4a68-bf64-32cccbfffce2","villageId":"village-1-capital","troop":"militia","quantity":1,"startedAt":"2026-09-20T13:38:25.759Z","completesAt":"2026-09-20T13:39:10.759Z"}}}
[step 10] PASS — fresh militia recruit accepted after the kill (job recruitment-c0f3e14f-b00e-4a68-bf64-32cccbfffce2, completesAt 2026-09-20T13:39:10.759Z); landing this run: SETTLED, HTTP responded
$ kill -TERM <world server (teardown) pid 3095>
  -> world server (teardown) exited (code 0, signal null) at 2026-09-20T13:38:25.771Z

## Result
- step 1: PASS
- step 2: PASS
- step 3: PASS
- step 4: PASS
- step 5: PASS
- step 6: PASS
- step 7: PASS
- step 8: PASS
- step 9: PASS
- step 10: PASS
B8 mid-settle kill drill PASS (10/10 steps PASS)
scratch dir removed: /tmp/kingsmarch-b8-settle-GsDyot

```
