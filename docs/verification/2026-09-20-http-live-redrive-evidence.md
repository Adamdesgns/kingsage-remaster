# HTTP-only live re-drive of the 2026-08-29 audit exercise: evidence

**Date:** 2026-09-20 · **Executed by:** [Cursor] (cloud; model: Claude Fable 5.1) · **Owner of record:** Adam · **Reviewer owed:** Claude (per matrix §7)
**Matrix task:** `docs/verification/2026-09-17-full-game-acceptance-matrix.md` §7, row 2 — "Re-drive the 2026-08-29 scratch-DB HTTP exercise on `main @ 9b478db` (link, snapshot, build queue, replay, restart)". Historical exercise of record: `docs/audits/kingsage-functionality-audit.md` §2 "Live exercise", taken at `c9e1e5c`.
**Rows advanced:** A1, B1, B7, C1, C2, and the **server half** of A2. Each row in the matrix now says exactly which sub-claims this run covers and which still rest on unit tests alone.
**SHA executed:** `21b917b` on `cursor/http-live-redrive-40e9` (= B10a tip `19bf897` + `scripts/http-live-redrive.mjs`). `git diff --stat 9b478db 21b917b -- server/ packages/` is **empty**, so the world server and shared rules under test are byte-identical to **`main @ 9b478db`**.
**Environment:** cloud Linux, Node `v22.14.0`, `sqlite3 3.45.1`. No hosting, no Studio, no PC, no phone.
**Result: PASS — 14/14 steps, exit 0.** Wall time 12 min 1 s (`04:54:21Z` → `05:06:22Z`), dominated by the real 720 s construction timer. No timers were shortened; no dev seed knobs were set.

## Why this exists

Two earlier attempts at this task (Cursor runs `bc-ba850307…` and `bc-a61ac079…`) errored before running anything. The first wrote a 629-line, 11-step script with ~13 minutes of real waits and died mid-review without executing it, committing, or opening a PR. This run kept the script to the audit's own step list, executed it first with the long wait skipped (12/13 PASS in 51 s — see "Honesty notes"), committed it, then ran the full recorded drill below.

## What this proves, and what it does not

Proves, at `21b917b`, against a disposable world over raw HTTP:

- **A1** — a new Roblox UserId is linked and claims a seat (`created:true`); the same UserId again is an idempotent rejoin (`created:false`, identical `playerId`/`kingdomId`); a second UserId gets a different player and seat; a wrong or missing `x-kingsage-key` is refused with 401 `BAD_KEY` and writes no link row. Rejoin also holds **after a server restart**.
- **B1** — the snapshot is the seeded 50×50 fixture: `world-7c7d5ae2`, seed `gate-b-emberfall`, 10 villages / 10 kingdoms (2 human-claimed open seats, 4 AI, 4 freeholds). A **second fresh database** on another port seeds the identical world id, seed and settlement id/coordinate layout.
- **B7** — after a graceful SIGTERM (exit 0) and 50 s down, a restart on the same file brings back the same identities, the same construction job (id and `completesAt` unchanged), the same inbox row count, and **the pre-restart `commandId` replays to the byte-identical stored result** without creating a second job.
- **A2 (server half)** — the post-restart `/api/roblox/state` pull is rebuilt from the database alone: jobs, army, notifications and version all present with no client-side cache involved. The Roblox client re-rendering from that pull is **not** covered here (Studio).
- **C1** — `villageEconomy` equals the game-core formulas at the village's levels (28/h each, storage 1464, population 232); the fractional carry is persisted in `local_village_economy`; and `whole + carry == baseline + 28/h × elapsed − spent` holds to <1e-6 for wood, stone and iron both across the 50 s offline window (step 12) and over the 11.7-minute construction wait (step 13: +5 whole units each, exactly `floor(28 × 0.1945 h)`).
- **C2** — `village.build.queue` timber: exact cost {75, 90, 60} deducted; timer 720 s = `buildingDurationSeconds(timber, 1, 1)`; exact replay is byte-identical with no duplicate job or inbox row; stale `expectedWorldVersion` → 409 `WORLD_VERSION_CONFLICT`; another player → 409 `FORBIDDEN`, both for a foreign village and for replaying a foreign `commandId`; **level 1 → 2 landed with its notification stamped exactly at `completesAt`** (observed 24 ms later, the poll interval) and production moved 28 → 33/h. Offline catch-up shown live for a recruit job: 1 militia queued at 45 s completed at its `completesAt` while **no server was running**, and materialized on restart with its notification stamped at that exact time.

Does **not** prove: the warehouse-cap branch of accrual (hours away at 28/h — unit tests only); prerequisite refusals or any building other than timber; queue stacking (seen live in B10a, not here); kill -9 / WAL recovery (B8 — the stop here is graceful); anything Roblox-side (A2 client half, B6, G1 — Studio prerequisite); rate limits (H1 — six commands per player, well under 30/min). Does not touch any real world: DB path is an absolute `mkdtemp` under `/tmp`, the key is a throwaway literal, ports are 4221/4222, and inherited `KINGSAGE_*` env is stripped so no AI tick or dev seed can move the world.

## How to rerun

```bash
node scripts/http-live-redrive.mjs                                    # expect exit 0, "HTTP re-drive PASS (14/14 steps PASS)", ~14 min
REDRIVE_SKIP_CONSTRUCTION_WAIT=1 node scripts/http-live-redrive.mjs   # 12/14 in under a minute; steps 13–14 report SKIPPED, never PASS
```

`REDRIVE_PORT` overrides the port (default 4221; the determinism twin uses port+1). The script re-execs itself under `--experimental-strip-types` because the expected numbers are imported straight from `packages/game-core/src/economy.ts` — the same source the server uses, so a drifted formula fails the drill rather than being copied into it. The scratch directory is removed on PASS and kept (path printed) on FAIL.

## Step table

| Step | What it drives | Result | Key evidence |
|---|---|---|---|
| 1 | Health check; wrong key; missing key | **PASS** | `/api/health` 200 `{"ok":true,"service":"kingsage-world","contractVersion":1}`; both refusals 401 `BAD_KEY`; `roblox_players` still 0 rows |
| 2 | **A1** link / idempotent rejoin / second seat | **PASS** | P1 `created:true` → `kingdom-1`; P1 again `created:false`, same `playerId`; P2 `created:true` → `kingdom-2`; 2 link rows |
| 3 | **B1** snapshot + determinism twin | **PASS** | 50×50, 10/10, seats `{"freehold":4,"human":2,"ai":4}`; twin DB on 4222: same `world-7c7d5ae2` / `gate-b-emberfall` / layout |
| 4 | **C1** economy formulas + baseline | **PASS** | server `{28,28,28}/h`, storage 1464, population 0/232 == formulas at all-level-1; baseline `{1200,1000,800}`, carry 0.000591 at `04:54:21.769Z` |
| 5 | **C2** `village.build.queue` timber | **PASS** | `command.accepted`, version 2 → 3; resources 1200/1000/800 → 1125/910/740 (= −75/−90/−60); timer 720 000 ms exactly |
| 6 | Idempotent replay | **PASS** | response byte-identical; 1 construction row, 1 inbox row, version still 3 |
| 7 | Stale `expectedWorldVersion` | **PASS** | 409 `WORLD_VERSION_CONFLICT`, `currentWorldVersion: 3` |
| 8 | Ownership | **PASS** | P2 → P1's village: 409 `FORBIDDEN` "does not own that village"; P2 replaying P1's id: 409 `FORBIDDEN` "belongs to another player"; still 1 job row |
| 9 | `village.recruit.queue` militia ×1 | **PASS** | `command.accepted`, version 4; cost {15, 10, 5}; timer 45 000 ms exactly; `completesAt 04:55:07.052Z` |
| 10 | **B7 / A2 (server)** graceful restart | **PASS** | SIGTERM exit 0 at `04:54:22.070Z`; restart `04:55:12.086Z`; health 200; rejoin `created:false` same ids; job identical; inbox 4 → 4; replay byte-identical; 1 job row |
| 11 | Offline catch-up | **PASS** | militia 0 → 1; `recruitment@04:55:07.052Z: 1 Farmer's Militia joined the army.` — `createdAt == completesAt`; row `complete`; version 4 → 5 (exactly one bump) |
| 12 | **C1** accrual across downtime | **PASS** | 0.014037 h: totals `1110.393618 / 900.393618 / 735.393618` == formula, carry persisted, 0 whole units (as expected at 28/h) |
| 13 | **C1** accrual over the long wait | **PASS** | 0.194540 h: +5 wood / +5 stone / +5 iron whole units, carry 0.447711; totals match to <1e-6 |
| 14 | **C2** completion at exact time | **PASS** | timber 1 → 2 observed `05:06:22.035Z` vs `completesAt 05:06:22.011Z`; `construction@05:06:22.011Z: Timber Camp reached level 2.`; row `complete`; wood 28 → 33/h; version 6 |

## Gate sanity at this tip (same session, cloud image)

| Gate | Result |
|---|---|
| `npm run check:types` | **clean** (after `npm install` at root for `@types/node` and a `--no-save` `typescript@7.0.2` into `mobile-rebuild/` — the image ships neither; nothing committed) |
| `npm run test:core` | **92/92, 0 fail** |
| `npm run test:server` | **114/114, 0 fail, 0 skipped** with Lune 0.10.5 on `PATH` (downloaded to `/tmp`; without it: 115 tests · 112 pass · 3 skipped — the cross-language contract test) |
| `npm run test:luau` | 31 files syntax-clean · **72 rules, 0 failed** · 7 spike-sim checks, 0 failed |

No `server/`, `packages/`, or `roblox/` code changed on this branch; the gates are sanity, not a claim of new coverage.

## Honesty notes

- **The first smoke run failed at step 3 on a wrong assumption of mine**, not the server's: the determinism compare included village *names*, and claiming an open seat renames its village after the player (`"Redrive Two's Realm Keep"` vs `"Open Seat 2"` in the twin). The compare now uses id + coordinates only; names are recorded as player data. The second smoke run (`REDRIVE_SKIP_CONSTRUCTION_WAIT=1`) passed 12/13 in 51 s. Step 13 (long-wait accrual) was then added so the recorded run proves whole units landing, not just the fraction; the recorded run below is the first and only full run of the final script.
- Step 12's "whole units gained +0" is the correct outcome at 28/h over 50 s (0.39 of a unit); it proves the carry and the offline clock, not the whole-unit path — that is why step 13 exists.
- `Persistent local database:` appears un-prefixed in the log because the server prints both banner lines in one stdout chunk; cosmetic.
- Model of record: Claude Fable 5.1 (cloud). No secrets: the key is a throwaway literal, never reused.

## Run record — recorded drill (exit 0)

Verbatim output of `node scripts/http-live-redrive.mjs` at `21b917b`, minus Node's two `ExperimentalWarning` preamble lines. UUIDs are per-run and disposable.

```text
# HTTP-only live re-drive (audit §2 exercise, current tip)
date: 2026-09-20T04:54:21.515Z
sha: 21b917b
node: v22.14.0
sqlite3: 3.45.1 2024-01-30 16:01:20 e876e51a0ed5c5b3126f52e532044363a014bc594cfefa87ffb5b82257ccalt1 (64-bit)
scratch: /tmp/kingsmarch-redrive-FH6kEs
db: /tmp/kingsmarch-redrive-FH6kEs/world.sqlite
port: 4221

## Step 1 — health check, then the key wall (bad key and missing key both 401)
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-redrive-FH6kEs/world.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_BIND=127.0.0.1 PORT=4221 node --experimental-strip-types src/index.ts &)
  [server:4221] KingSage shared world listening at http://127.0.0.1:4221/?world=shared
Persistent local database: /tmp/kingsmarch-redrive-FH6kEs/world.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":920001,"displayName":"Intruder"} -> 401 {"error":{"code":"BAD_KEY","message":"Invalid key."}}
POST /api/roblox/state {"robloxUserIds":[920001]} -> 401 {"error":{"code":"BAD_KEY","message":"Invalid key."}}
$ sqlite3 <db> "SELECT count(*) FROM roblox_players;"
  0
  -> exit 0
[step 1] PASS — health 200 {"ok":true,"service":"kingsage-world","contractVersion":1}; wrong key 401 BAD_KEY; missing key 401 BAD_KEY; no link rows created by the refused calls

## Step 2 — A1 — /api/roblox/session: new player linked + seat claimed; same UserId again is an idempotent rejoin; a second UserId gets a different seat
POST /api/roblox/session {"robloxUserId":920001,"displayName":"Redrive One"} -> 200 {"playerId":"player-4340b618-9562-4cb3-a97a-050ac30efe15","kingdomId":"kingdom-1","created":true,"contractVersion":1}
POST /api/roblox/session {"robloxUserId":920001,"displayName":"Redrive One (rejoin)"} -> 200 {"playerId":"player-4340b618-9562-4cb3-a97a-050ac30efe15","kingdomId":"kingdom-1","created":false,"contractVersion":1}
POST /api/roblox/session {"robloxUserId":920002,"displayName":"Redrive Two"} -> 200 {"playerId":"player-9641cd28-6924-410b-9095-0f653eb9af86","kingdomId":"kingdom-2","created":true,"contractVersion":1}
$ sqlite3 <db> "SELECT roblox_user_id || '->' || player_id FROM roblox_players ORDER BY roblox_user_id;"
  920001->player-4340b618-9562-4cb3-a97a-050ac30efe15
  920002->player-9641cd28-6924-410b-9095-0f653eb9af86
  -> exit 0
[step 2] PASS — P1 created:true (player-4340b618-9562-4cb3-a97a-050ac30efe15 / kingdom-1); P1 again created:false, same ids; P2 created:true, different player + kingdom; 2 link rows

## Step 3 — B1 — /api/roblox/state snapshot: 50×50 seeded world, 10 settlements, and a second fresh DB seeds the identical world
POST /api/roblox/state {"robloxUserIds":[920001,920002]} -> 200 (26814 bytes; states: 920001,920002)
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-redrive-FH6kEs/twin.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_BIND=127.0.0.1 PORT=4222 node --experimental-strip-types src/index.ts &)
  [server:4222] KingSage shared world listening at http://127.0.0.1:4222/?world=shared
Persistent local database: /tmp/kingsmarch-redrive-FH6kEs/twin.sqlite
POST /api/roblox/session {"robloxUserId":920001,"displayName":"Twin"} -> 200 {"playerId":"player-eaf464bf-917e-4bb1-96b2-fbb02cc5e938","kingdomId":"kingdom-1","created":true,"contractVersion":1}
POST /api/roblox/state {"robloxUserIds":[920001]} -> 200 (13354 bytes; states: 920001)
$ kill -TERM <twin server pid 3064>
  -> twin server exited (code 0, signal null) at 2026-09-20T04:54:22.003Z
world: id=world-7c7d5ae2 seed=gate-b-emberfall version=2 seats={"freehold":4,"human":2,"ai":4}
settlements: village-1-capital@19,33 "Redrive One's Realm Keep" | village-2-capital@28,12 "Redrive Two's Realm Keep" | village-3-capital@4,41 "Warlord Kaas Hold" | village-4-capital@39,14 "Ember Crown Hold" | village-5-capital@29,36 "Verdant Pact Hold" | village-6-capital@16,22 "The Ashen Court Hold" | village-freehold-1@45,35 "Millers Rest" | village-freehold-2@11,11 "Thornhollow" | village-freehold-3@18,44 "Saltmarsh Freehold" | village-freehold-4@45,26 "Crowfoot Landing"
[step 3] PASS — world world-7c7d5ae2 seed gate-b-emberfall: 50×50, 10 villages/10 kingdoms ({"freehold":4,"human":2,"ai":4}); P1 village village-1-capital (19,33), P2 village village-2-capital; a second fresh DB on port 4222 seeded the identical id/seed/settlement layout

## Step 4 — C1 — villageEconomy matches the shared economy formulas at the village's levels; record the accrual baseline
buildings: {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
villageEconomy (server): {"villageId":"village-1-capital","productionPerHour":{"wood":28,"stone":28,"iron":28},"storageCapacity":1464,"populationUsed":0,"populationCapacity":232}
villageEconomy (formula): {"productionPerHour":{"wood":28,"stone":28,"iron":28},"storageCapacity":1464,"populationCapacity":232}
$ sqlite3 <db> "SELECT e.last_materialized_at || '|' || e.resource_carry_json || '|' || v.resources_json FROM local_village_economy e JOIN local_villages v ON v.id = e.village_id WHERE e.village_id = 'village-1-capital';"
  2026-09-20T04:54:21.769Z|{"wood":0.000591111111111111,"stone":0.000591111111111111,"iron":0.000591111111111111}|{"wood":1200,"stone":1000,"iron":800}
  -> exit 0
baseline: resources {"wood":1200,"stone":1000,"iron":800}, carry {"wood":0.000591111111111111,"stone":0.000591111111111111,"iron":0.000591111111111111}, last_materialized_at 2026-09-20T04:54:21.769Z
[step 4] PASS — production {"wood":28,"stone":28,"iron":28}/h, storage 1464, population 0/232 — all equal to the game-core formulas at levels {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}; baseline recorded

## Step 5 — C2 — village.build.queue timber: accepted, exact cost deducted, server timer = buildingDurationSeconds
POST /api/roblox/commands {"robloxUserId":920001,"commandId":"redrive-build-timber-1","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"timber"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"redrive-build-timber-1","worldVersion":3,"constructionJob":{"id":"construction-7b835e24-f244-46b5-8b21-8d8fdbd6b6ae","villageId":"village-1-capital","building":"timber","targetLevel":2,"startedAt":"2026-09-20T04:54:22.011Z","completesAt":"2026-09-20T05:06:22.011Z"}}}
POST /api/roblox/state {"robloxUserIds":[920001]} -> 200 (13638 bytes; states: 920001)
state after build: {"worldVersion":3,"playerId":"player-4340b618-9562-4cb3-a97a-050ac30efe15","kingdomId":"kingdom-1","villageId":"village-1-capital","resources":{"wood":1125,"stone":910,"iron":740},"timber":1,"militia":0,"constructionJobs":[{"id":"construction-7b835e24-f244-46b5-8b21-8d8fdbd6b6ae","building":"timber","targetLevel":2,"completesAt":"2026-09-20T05:06:22.011Z"}],"recruitmentJobs":[],"notifications":[]}
POST /api/roblox/state {"robloxUserIds":[920001]} -> 200 (13638 bytes; states: 920001)
[step 5] PASS — redrive-build-timber-1 → command.accepted, worldVersion 3; cost {"wood":75,"stone":90,"iron":60} deducted; job construction-7b835e24-f244-46b5-8b21-8d8fdbd6b6ae timer 720s (startedAt 2026-09-20T04:54:22.011Z → completesAt 2026-09-20T05:06:22.011Z)

## Step 6 — exact replay of the same commandId returns the stored result — same job id, no duplicate, world version unchanged
POST /api/roblox/commands {"robloxUserId":920001,"commandId":"redrive-build-timber-1","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"timber"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"redrive-build-timber-1","worldVersion":3,"constructionJob":{"id":"construction-7b835e24-f244-46b5-8b21-8d8fdbd6b6ae","villageId":"village-1-capital","building":"timber","targetLevel":2,"startedAt":"2026-09-20T04:54:22.011Z","completesAt":"2026-09-20T05:06:22.011Z"}}}
POST /api/roblox/state {"robloxUserIds":[920001]} -> 200 (13638 bytes; states: 920001)
$ sqlite3 <db> "SELECT count(*) FROM local_construction_jobs;"
  1
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  1
  -> exit 0
[step 6] PASS — replay byte-identical to the original response; still 1 job (construction-7b835e24-f244-46b5-8b21-8d8fdbd6b6ae), 1 inbox row, world version 3

## Step 7 — stale expectedWorldVersion → WORLD_VERSION_CONFLICT
POST /api/roblox/commands {"robloxUserId":920001,"commandId":"redrive-stale-version","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"timber"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"redrive-stale-version","code":"WORLD_VERSION_CONFLICT","message":"The world changed before this command was applied.","currentWorldVersion":3}}
[step 7] PASS — 409 command.rejected WORLD_VERSION_CONFLICT, currentWorldVersion 3 reported back

## Step 8 — second player's build into player 1's village → FORBIDDEN; second player replaying player 1's commandId → FORBIDDEN
POST /api/roblox/commands {"robloxUserId":920002,"commandId":"redrive-cross-owner","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"timber"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"redrive-cross-owner","code":"FORBIDDEN","message":"The player does not own that village.","currentWorldVersion":3}}
POST /api/roblox/commands {"robloxUserId":920002,"commandId":"redrive-build-timber-1","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"timber"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"redrive-build-timber-1","code":"FORBIDDEN","message":"That command ID belongs to another player.","currentWorldVersion":3}}
$ sqlite3 <db> "SELECT count(*) FROM local_construction_jobs;"
  1
  -> exit 0
[step 8] PASS — cross-owner build 409 FORBIDDEN ("The player does not own that village."); foreign replay 409 FORBIDDEN ("That command ID belongs to another player."); still 1 job row

## Step 9 — village.recruit.queue 1 militia (45s at Barracks 1): accepted, cost deducted, timer = troopTrainingDurationSeconds
POST /api/roblox/state {"robloxUserIds":[920001]} -> 200 (13638 bytes; states: 920001)
POST /api/roblox/commands {"robloxUserId":920001,"commandId":"redrive-recruit-militia-1","expectedWorldVersion":3,"command":{"type":"village.recruit.queue","payload":{"villageId":"village-1-capital","troop":"militia","quantity":1}}} -> 200 {"type":"command.accepted","payload":{"commandId":"redrive-recruit-militia-1","worldVersion":4,"recruitmentJob":{"id":"recruitment-a2611e41-0941-452d-b9a8-6eb02cfd42e8","villageId":"village-1-capital","troop":"militia","quantity":1,"startedAt":"2026-09-20T04:54:22.052Z","completesAt":"2026-09-20T04:55:07.052Z"}}}
POST /api/roblox/state {"robloxUserIds":[920001]} -> 200 (13838 bytes; states: 920001)
state after recruit: {"worldVersion":4,"playerId":"player-4340b618-9562-4cb3-a97a-050ac30efe15","kingdomId":"kingdom-1","villageId":"village-1-capital","resources":{"wood":1110,"stone":900,"iron":735},"timber":1,"militia":0,"constructionJobs":[{"id":"construction-7b835e24-f244-46b5-8b21-8d8fdbd6b6ae","building":"timber","targetLevel":2,"completesAt":"2026-09-20T05:06:22.011Z"}],"recruitmentJobs":[{"id":"recruitment-a2611e41-0941-452d-b9a8-6eb02cfd42e8","troop":"militia","quantity":1,"completesAt":"2026-09-20T04:55:07.052Z"}],"notifications":[]}
[step 9] PASS — redrive-recruit-militia-1 → command.accepted; cost {"wood":15,"stone":10,"iron":5}; job recruitment-a2611e41-0941-452d-b9a8-6eb02cfd42e8 timer 45s, completesAt 2026-09-20T04:55:07.052Z; army militia still 0

## Step 10 — B7/A2 — graceful stop; stay down past the recruit's completesAt; restart on the same DB: version, job, identity and idempotency record all survive
POST /api/roblox/state {"robloxUserIds":[920001]} -> 200 (13838 bytes; states: 920001)
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  4
  -> exit 0
$ kill -TERM <world server pid 3051>
  -> world server exited (code 0, signal null) at 2026-09-20T04:54:22.070Z
GET /api/health -> connection refused (ECONNREFUSED)
server down; sleeping 50s so the militia's completesAt (2026-09-20T04:55:07.052Z) passes while nothing is running
restarting at 2026-09-20T04:55:12.086Z
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-redrive-FH6kEs/world.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_BIND=127.0.0.1 PORT=4221 node --experimental-strip-types src/index.ts &)
  [server:4221] KingSage shared world listening at http://127.0.0.1:4221/?world=shared
Persistent local database: /tmp/kingsmarch-redrive-FH6kEs/world.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":920001,"displayName":"Redrive One (after restart)"} -> 200 {"playerId":"player-4340b618-9562-4cb3-a97a-050ac30efe15","kingdomId":"kingdom-1","created":false,"contractVersion":1}
POST /api/roblox/state {"robloxUserIds":[920001]} -> 200 (13804 bytes; states: 920001)
state before stop: {"worldVersion":4,"playerId":"player-4340b618-9562-4cb3-a97a-050ac30efe15","kingdomId":"kingdom-1","villageId":"village-1-capital","resources":{"wood":1110,"stone":900,"iron":735},"timber":1,"militia":0,"constructionJobs":[{"id":"construction-7b835e24-f244-46b5-8b21-8d8fdbd6b6ae","building":"timber","targetLevel":2,"completesAt":"2026-09-20T05:06:22.011Z"}],"recruitmentJobs":[{"id":"recruitment-a2611e41-0941-452d-b9a8-6eb02cfd42e8","troop":"militia","quantity":1,"completesAt":"2026-09-20T04:55:07.052Z"}],"notifications":[]}
state after restart: {"worldVersion":5,"playerId":"player-4340b618-9562-4cb3-a97a-050ac30efe15","kingdomId":"kingdom-1","villageId":"village-1-capital","resources":{"wood":1110,"stone":900,"iron":735},"timber":1,"militia":1,"constructionJobs":[{"id":"construction-7b835e24-f244-46b5-8b21-8d8fdbd6b6ae","building":"timber","targetLevel":2,"completesAt":"2026-09-20T05:06:22.011Z"}],"recruitmentJobs":[],"notifications":["recruitment@2026-09-20T04:55:07.052Z: 1 Farmer's Militia joined the army."]}
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  4
  -> exit 0
POST /api/roblox/commands {"robloxUserId":920001,"commandId":"redrive-build-timber-1","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"timber"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"redrive-build-timber-1","worldVersion":3,"constructionJob":{"id":"construction-7b835e24-f244-46b5-8b21-8d8fdbd6b6ae","villageId":"village-1-capital","building":"timber","targetLevel":2,"startedAt":"2026-09-20T04:54:22.011Z","completesAt":"2026-09-20T05:06:22.011Z"}}}
$ sqlite3 <db> "SELECT count(*) FROM local_construction_jobs;"
  1
  -> exit 0
[step 10] PASS — SIGTERM exit 0; down 50s; restart /api/health 200; P1 rejoin created:false same ids; construction job construction-7b835e24-f244-46b5-8b21-8d8fdbd6b6ae identical (completesAt 2026-09-20T05:06:22.011Z); inbox rows 4 unchanged; replay of redrive-build-timber-1 after restart byte-identical to the original

## Step 11 — offline catch-up — the recruit that came due while the server was down completed at exactly its completesAt, with its notification
$ sqlite3 <db> "SELECT status FROM local_recruitment_jobs WHERE id = 'recruitment-a2611e41-0941-452d-b9a8-6eb02cfd42e8';"
  complete
  -> exit 0
[step 11] PASS — militia 0 → 1 with no server running at 2026-09-20T04:55:07.052Z; notification "1 Farmer's Militia joined the army." createdAt == completesAt; row complete; world version 4 → 5

## Step 12 — C1 — offline accrual + fractional carry: whole + carry == baseline + production×hours − spent, across the restart
$ sqlite3 <db> "SELECT e.last_materialized_at || '|' || e.resource_carry_json || '|' || v.resources_json FROM local_village_economy e JOIN local_villages v ON v.id = e.village_id WHERE e.village_id = 'village-1-capital';"
  2026-09-20T04:55:12.301Z|{"wood":0.3936177777777778,"stone":0.3936177777777778,"iron":0.3936177777777778}|{"wood":1110,"stone":900,"iron":735}
  -> exit 0
accrual after restart: 0.014037 h elapsed at {"wood":28,"stone":28,"iron":28}/h; {"wood":{"whole":1110,"carry":0.393618,"expectedTotal":1110.393618,"actualTotal":1110.393618},"stone":{"whole":900,"carry":0.393618,"expectedTotal":900.393618,"actualTotal":900.393618},"iron":{"whole":735,"carry":0.393618,"expectedTotal":735.393618,"actualTotal":735.393618}}
[step 12] PASS — 0.0140 h elapsed (incl. 50s offline): whole units gained wood +0, stone +0, iron +0; fractional carry persisted in local_village_economy; totals match 28/h per resource to <1e-6

## Step 13 — C1 — whole resource units land at exactly 28/h over the construction wait (checked just before the upgrade changes the rate)
waiting 650s (server running) until 20s before the timber job completes
POST /api/roblox/state {"robloxUserIds":[920001]} -> 200 (13804 bytes; states: 920001)
$ sqlite3 <db> "SELECT e.last_materialized_at || '|' || e.resource_carry_json || '|' || v.resources_json FROM local_village_economy e JOIN local_villages v ON v.id = e.village_id WHERE e.village_id = 'village-1-capital';"
  2026-09-20T05:06:02.113Z|{"wood":0.4477111111111269,"stone":0.4477111111111269,"iron":0.4477111111111269}|{"wood":1115,"stone":905,"iron":740}
  -> exit 0
accrual before upgrade: 0.194540 h elapsed at {"wood":28,"stone":28,"iron":28}/h; {"wood":{"whole":1115,"carry":0.447711,"expectedTotal":1115.447711,"actualTotal":1115.447711},"stone":{"whole":905,"carry":0.447711,"expectedTotal":905.447711,"actualTotal":905.447711},"iron":{"whole":740,"carry":0.447711,"expectedTotal":740.447711,"actualTotal":740.447711}}
[step 13] PASS — 0.1945 h since baseline: whole units gained wood +5, stone +5, iron +5 (28/h each), carry {"wood":0.4477111111111269,"stone":0.4477111111111269,"iron":0.4477111111111269}; whole + carry matches the formula to <1e-6

## Step 14 — C2 — construction completes at exactly its completesAt (2026-09-20T05:06:22.011Z), level rises, production follows
waiting 20s for the timber job to come due (server running the whole time)
POST /api/roblox/state {"robloxUserIds":[920001]} -> 200 (13760 bytes; states: 920001)
state after completion (observed 2026-09-20T05:06:22.035Z): {"worldVersion":6,"playerId":"player-4340b618-9562-4cb3-a97a-050ac30efe15","kingdomId":"kingdom-1","villageId":"village-1-capital","resources":{"wood":1115,"stone":905,"iron":740},"timber":2,"militia":1,"constructionJobs":[],"recruitmentJobs":[],"notifications":["construction@2026-09-20T05:06:22.011Z: Timber Camp reached level 2.","recruitment@2026-09-20T04:55:07.052Z: 1 Farmer's Militia joined the army."]}
$ sqlite3 <db> "SELECT status FROM local_construction_jobs WHERE id = 'construction-7b835e24-f244-46b5-8b21-8d8fdbd6b6ae';"
  complete
  -> exit 0
[step 14] PASS — timber 1 → 2 observed 2026-09-20T05:06:22.035Z (completesAt 2026-09-20T05:06:22.011Z); notification "Timber Camp reached level 2." createdAt == completesAt; wood production 28 → 33/h
$ kill -TERM <world server pid 3480>
  -> world server exited (code 0, signal null) at 2026-09-20T05:06:22.053Z

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
- step 11: PASS
- step 12: PASS
- step 13: PASS
- step 14: PASS
HTTP re-drive PASS (14/14 steps PASS)
scratch dir removed: /tmp/kingsmarch-redrive-FH6kEs
```
