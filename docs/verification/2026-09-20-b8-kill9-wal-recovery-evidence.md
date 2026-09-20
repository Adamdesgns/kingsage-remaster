# B8 — killed-process (SIGKILL) WAL recovery drill: evidence

**Date:** 2026-09-20 · **Executed by:** [Cursor] (cloud; model: Claude Fable 5.1) · **Owner of record:** Adam · **Reviewer owed:** Claude (per matrix §7)
**Matrix task:** `docs/verification/2026-09-17-full-game-acceptance-matrix.md` §7, row 3 — "Write the kill-9 WAL recovery test the audit describes in §13.2". Audit text of record: `docs/audits/kingsage-functionality-audit.md` §13 item 2, "hard-kill mid-write with a live WAL, reopen, assert integrity — the only way real drill servers have ever stopped, and untested."
**Row advanced:** **B8** (was NOT RUN, "no test exists"). Also adds one live sub-claim to **C2**: a prerequisite refusal (`PREREQUISITE_MISSING`, "Requires Headquarters level 2." for a Rampart order at Headquarters 1) was exercised over HTTP and its stored rejection replayed byte-identically after the kill.
**SHA executed:** `69b7548` on `cursor/b8-kill9-wal-drill-37b7` (= [PR #13](https://github.com/Adamdesgns/kingsage-remaster/pull/13) tip `00b8c8e` + `scripts/b8-kill9-wal-recovery-drill.mjs`). `git diff 9b478db 69b7548 -- server/ packages/` is **empty**, so the world server and shared rules under test are byte-identical to **`main @ 9b478db`**.
**Environment:** cloud Linux, Node `v22.14.0`, `sqlite3 3.45.1`. No hosting, no Studio, no PC, no phone.
**Result: PASS — 11/11 steps, exit 0.** Wall time 47 s (`05:22:05Z` → `05:22:52Z`), dominated by the real 45 s recruit timer. No timers were shortened; no dev seed knobs were set.

## What this proves, and what it does not

Proves, at `69b7548`, against a disposable world over raw HTTP:

- **The process died by `SIGKILL` with a live WAL.** Two players issued construction and recruitment commands concurrently as fast as the server answered (18 requests in ~80 ms); on the 8th accepted command the server was `kill -KILL`ed. No shutdown hook ran (`exit code null, signal SIGKILL`). At that instant `world.sqlite` was a 4096-byte header and **`world.sqlite-wal` was 1 470 872 bytes** — every table, the fixture, and every command lived only in the WAL.
- **Control: the main file alone holds nothing.** A copy of `world.sqlite` taken without its `-wal`/`-shm` has **0 tables** (`no such table: local_command_inbox`). So the restart that follows is a genuine WAL recovery, not a re-read of an already-checkpointed file. (Same phenomenon the B10a drill's naive-`cp` negative control hit.)
- **The server is the first opener after the kill and recovers cleanly.** `/api/health` 200; `PRAGMA integrity_check` = `ok`; `PRAGMA foreign_key_check` empty; `journal_mode` still `wal`.
- **Durability of everything acknowledged.** All **17** commands the clients received an answer to — 8 `command.accepted` and 9 stored rejections (7 `WORLD_VERSION_CONFLICT`, 2 `PREREQUISITE_MISSING`) — **replay byte-identically** (status and body) from `local_command_inbox` after the restart.
- **Atomicity of the one in-flight command.** `b8-p2-09` had been sent and got no response (`UND_ERR_SOCKET`). After recovery it is **wholly absent**: no inbox row, no job row, and the inbox count equals exactly the 17 acknowledged commands. Nothing half-written.
- **Job tables equal the ledger.** 6 construction rows (1 `queued`, 5 `waiting`) and 2 recruitment rows — each id and `completes_at` matches an accepted command's payload; no job row exists that no accepted command created. World version after restart (10) equals the highest accepted version before the kill.
- **Resources reconcile to the formula.** Per village, `whole + carry == baseline + 28/h × elapsed − charged` to <1e-6, where "charged" is exactly the recruit plus the *first* construction order (the other five are `waiting` and unpaid, as the queue rule says): p1 charged {90, 100, 65}, p2 charged {15, 10, 5}.
- **Timers survive the kill.** Both militia recruits (queued 45 s before the kill) completed at **exactly** their `completesAt`, notifications stamped to match, rows `complete`; a fresh recruit order per player was accepted afterwards — the world is writable again.

Does **not** prove: **power loss.** `SIGKILL` discards the process, not the kernel's page cache, so fsync durability (SQLite `synchronous` behaviour under a real crash) is outside this drill — that needs a VM or a plug, not a signal. It also does not prove the kill landed *inside* a `COMMIT` syscall: the in-flight command was absent afterwards, which is consistent with the kill landing anywhere before its commit; the drill records what happened rather than steering it. Also not covered here: kill during battle settlement or march arrival (audit M3 names "kill -9 mid-battle-settle" — the write path is the same `BEGIN IMMEDIATE … COMMIT`, but no battle was in progress); anything Roblox-side. Does not touch any real world: DB path is an absolute `mkdtemp` under `/tmp`, the key is a throwaway literal, port is 4231, and inherited `KINGSAGE_*` env is stripped.

## How to rerun

```bash
node scripts/b8-kill9-wal-recovery-drill.mjs        # expect exit 0, "B8 kill -9 / WAL recovery drill PASS (11/11 steps PASS)", ~50 s
B8_KILL_AFTER_ACCEPTED=3 node scripts/b8-kill9-wal-recovery-drill.mjs   # kill earlier in the burst
B8_PORT=4231 node scripts/b8-kill9-wal-recovery-drill.mjs
```

The script re-execs itself under `--experimental-strip-types` because the expected costs and production rates are imported straight from `packages/game-core/src/economy.ts` — the same source the server uses. The scratch directory is removed on PASS and kept (path printed) on FAIL. Step 4 will **FAIL** the drill if the main file already holds the committed state (i.e. a checkpoint ran before the kill), because then the run would not have exercised WAL recovery; a PASS there is a precondition, not a formality.

## Step table

| Step | What it drives | Result | Key evidence |
|---|---|---|---|
| 1 | Fresh world, two players linked, baselines | **PASS** | health 200; p1 `kingdom-1`/`village-1-capital`, p2 `kingdom-2`/`village-2-capital`; world version 2; `local_village_economy` baselines read |
| 2 | Concurrent burst + `SIGKILL` on the 8th accept | **PASS** | 18 requests: 8 accepted (6 construction, 2 recruitment), 9 stored rejections, 1 in flight; `kill -KILL` at `05:22:05.877Z`; exit `signal SIGKILL` |
| 3 | Dead process, live WAL | **PASS** | health `ECONNREFUSED`; main 4096 B, **-wal 1 470 872 B**, -shm 32 768 B |
| 4 | **Control** — main file without WAL | **PASS** | orphan copy: `no such table: local_command_inbox`, **0 tables**; live server had 17 acknowledged commands |
| 5 | Restart as first opener; integrity | **PASS** | health 200; `integrity_check` = `ok`; `foreign_key_check` empty; `journal_mode` = `wal` |
| 6 | Identity | **PASS** | both rejoins `created:false`, same `playerId`/`kingdomId`; same villages |
| 7 | Durability of acknowledged commands | **PASS** | **17/17 replays byte-identical** (8 accepted + 9 rejected); inbox 17 rows |
| 8 | Atomicity of in-flight command | **PASS** | `b8-p2-09` absent — no inbox row; inbox count == acknowledged |
| 9 | Job tables == ledger; version monotone | **PASS** | 6 construction (1 queued, 5 waiting) + 2 recruitment rows, ids and `completes_at` match; no orphans; version 10 → 10 |
| 10 | Resource conservation | **PASS** | p1 charged {90,100,65}, p2 {15,10,5}; totals match to <1e-6 for wood/stone/iron in both villages |
| 11 | Timers after the kill; world writable | **PASS** | both militia at exactly `completesAt` (`05:22:50.769Z`, `05:22:50.789Z`); rows `complete`; fresh recruits accepted (versions 13, 14) |

## Gate sanity at this tip (same session, cloud image)

| Gate | Result |
|---|---|
| `npm run check:types` | **clean** (after `npm install` at root for `@types/node` and a `--no-save` `typescript@7.0.2` into `mobile-rebuild/` — the image ships neither; nothing committed) |
| `npm run test:core` | **92/92, 0 fail** |
| `npm run test:server` | **114/114, 0 fail, 0 skipped** with Lune 0.10.5 on `PATH` (downloaded to `/tmp`; without it: 115 tests · 112 pass · 3 skipped — the cross-language contract test) |
| `npm run test:luau` | 31 files syntax-clean · **72 rules, 0 failed** · 7 spike-sim checks, 0 failed |

No `server/`, `packages/`, or `roblox/` code changed on this branch; the gates are sanity, not a claim of new coverage.

## Honesty notes

- **The interleave is lopsided and deterministic.** p1's loop wins every version race, so p1 lands 8 accepts while p2 collects 7 `WORLD_VERSION_CONFLICT` rejections and one accept. Both smoke run and recorded run produced the identical ledger shape. That is a property of two clients racing one global world version, not a fault; the rejections are stored inbox rows and are part of the durability check.
- **Only one request was in flight at the kill**, and it was absent afterwards. A run where the in-flight command turns out *present* (kill after its `COMMIT`, before the response was written to the socket) is equally a PASS by step 8's rule; this run did not produce that case.
- **The smoke run** (same script before its one wording change, at `00b8c8e`, `05:20:36Z`) also passed 11/11 with the same shape; the recorded run below is at the committed script SHA.
- `-wal` grew from 943 512 B (fixture + schema) to 1 470 872 B during the ~80 ms burst — each accepted command writes an event row plus a village snapshot. After restart it was 1 483 232 B: recovery does not checkpoint; the server keeps appending.
- `Persistent local database:` appears un-prefixed once in the log because the server prints both banner lines in one stdout chunk; cosmetic.
- Model of record: Claude Fable 5.1 (cloud). No secrets: the key is a throwaway literal, never reused.

## Run record — recorded drill (exit 0)

Verbatim output of `node scripts/b8-kill9-wal-recovery-drill.mjs` at `69b7548`, minus Node's two `ExperimentalWarning` preamble lines. UUIDs are per-run and disposable.

```text
# B8 — SIGKILL / WAL recovery drill (current tip)
date: 2026-09-20T05:22:05.298Z
sha: 69b7548
node: v22.14.0
sqlite3: 3.45.1 2024-01-30 16:01:20 e876e51a0ed5c5b3126f52e532044363a014bc594cfefa87ffb5b82257ccalt1 (64-bit)
scratch: /tmp/kingsmarch-b8-Uz70yj
db: /tmp/kingsmarch-b8-Uz70yj/world.sqlite
port: 4231
kill after: 8 accepted commands

## Step 1 — fresh disposable world: health 200, two players linked, baseline snapshot and economy rows recorded
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-b8-Uz70yj/world.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_BIND=127.0.0.1 PORT=4231 node --experimental-strip-types src/index.ts &)
  [server:4231] KingSage shared world listening at http://127.0.0.1:4231/?world=shared
Persistent local database: /tmp/kingsmarch-b8-Uz70yj/world.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":930001,"displayName":"Kill Nine One"} -> 200 {"playerId":"player-fbcc055c-94a6-4383-80e1-9fad88cc08df","kingdomId":"kingdom-1","created":true,"contractVersion":1}
POST /api/roblox/session {"robloxUserId":930002,"displayName":"Kill Nine Two"} -> 200 {"playerId":"player-35fdca72-ec35-4787-8f8f-91541f89c487","kingdomId":"kingdom-2","created":true,"contractVersion":1}
POST /api/roblox/state {"robloxUserIds":[930001,930002]} -> 200 (26834 bytes; states: 930001,930002)
$ sqlite3 <db> "SELECT e.last_materialized_at || '|' || e.resource_carry_json || '|' || v.resources_json FROM local_village_economy e JOIN local_villages v ON v.id = e.village_id WHERE e.village_id = 'village-1-capital';"
  2026-09-20T05:22:05.748Z|{"wood":0.0016877777777777776,"stone":0.0016877777777777776,"iron":0.0016877777777777776}|{"wood":1200,"stone":1000,"iron":800}
  -> exit 0
p1: player-fbcc055c-94a6-4383-80e1-9fad88cc08df / kingdom-1 / village-1-capital levels {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0} baseline {"lastMaterializedAt":"2026-09-20T05:22:05.748Z","carry":{"wood":0.0016877777777777776,"stone":0.0016877777777777776,"iron":0.0016877777777777776},"resources":{"wood":1200,"stone":1000,"iron":800}}
$ sqlite3 <db> "SELECT e.last_materialized_at || '|' || e.resource_carry_json || '|' || v.resources_json FROM local_village_economy e JOIN local_villages v ON v.id = e.village_id WHERE e.village_id = 'village-2-capital';"
  2026-09-20T05:22:05.748Z|{"wood":0.0016877777777777776,"stone":0.0016877777777777776,"iron":0.0016877777777777776}|{"wood":1200,"stone":1000,"iron":800}
  -> exit 0
p2: player-35fdca72-ec35-4787-8f8f-91541f89c487 / kingdom-2 / village-2-capital levels {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0} baseline {"lastMaterializedAt":"2026-09-20T05:22:05.748Z","carry":{"wood":0.0016877777777777776,"stone":0.0016877777777777776,"iron":0.0016877777777777776},"resources":{"wood":1200,"stone":1000,"iron":800}}
files before burst: main 4096 bytes, -wal 943512 bytes, -shm 32768 bytes
[step 1] PASS — health 200; p1 player-fbcc055c-94a6-4383-80e1-9fad88cc08df/kingdom-1/village-1-capital; p2 player-35fdca72-ec35-4787-8f8f-91541f89c487/kingdom-2/village-2-capital; world version 2; baselines recorded from local_village_economy

## Step 2 — burst — both players issue their plan concurrently, each retrying on WORLD_VERSION_CONFLICT; SIGKILL the moment the 8th accepted command comes back
b8-p1-01: accepted militia×1 -> version 3, job recruitment-ef212794-93b6-4f21-8bf0-c1f47466d63d completesAt 2026-09-20T05:22:50.769Z
b8-p2-01: 409 WORLD_VERSION_CONFLICT (expected 2, current 3) -> retry with a new id
b8-p1-02: 409 PREREQUISITE_MISSING "Requires Headquarters level 2."
b8-p2-02: accepted militia×1 -> version 4, job recruitment-54e83037-9368-48e1-8a77-4c95d33eb382 completesAt 2026-09-20T05:22:50.789Z
b8-p1-03: 409 WORLD_VERSION_CONFLICT (expected 3, current 4) -> retry with a new id
b8-p2-03: 409 PREREQUISITE_MISSING "Requires Headquarters level 2."
b8-p1-04: accepted timber -> version 5, job construction-f0ce3187-3e37-470b-bddf-7bc16b742e8f completesAt 2026-09-20T05:34:05.806Z
b8-p2-04: 409 WORLD_VERSION_CONFLICT (expected 4, current 5) -> retry with a new id
b8-p1-05: accepted quarry -> version 6, job construction-5c55dba0-5532-4b7d-bf29-d17dd20cd7f4 completesAt 2026-09-20T05:22:05.816Z (waiting)
b8-p2-05: 409 WORLD_VERSION_CONFLICT (expected 5, current 6) -> retry with a new id
b8-p1-06: accepted iron -> version 7, job construction-5ead9dc5-84d9-4ea8-88f6-98939124b09a completesAt 2026-09-20T05:22:05.827Z (waiting)
b8-p2-06: 409 WORLD_VERSION_CONFLICT (expected 6, current 7) -> retry with a new id
b8-p1-07: accepted farm -> version 8, job construction-825ba1f2-7a02-45e9-8b0c-e06ec5abd067 completesAt 2026-09-20T05:22:05.842Z (waiting)
b8-p2-07: 409 WORLD_VERSION_CONFLICT (expected 7, current 8) -> retry with a new id
b8-p1-08: accepted warehouse -> version 9, job construction-065c1aac-07f6-46e9-b77f-e04061c3dc57 completesAt 2026-09-20T05:22:05.858Z (waiting)
b8-p2-08: 409 WORLD_VERSION_CONFLICT (expected 8, current 9) -> retry with a new id
b8-p1-09: accepted hq -> version 10, job construction-e95ea196-806e-4757-b180-a786375c8703 completesAt 2026-09-20T05:22:05.875Z (waiting)
$ kill -KILL <world server pid 2291>   # at 2026-09-20T05:22:05.877Z, after 8 accepted commands
b8-p2-09: no response (UND_ERR_SOCKET) -> in-flight
  -> world server exited (code null, signal SIGKILL) at 2026-09-20T05:22:05.883Z
ledger: 18 requests — 8 accepted, 9 rejected {"WORLD_VERSION_CONFLICT":7,"PREREQUISITE_MISSING":2}, 1 in flight at the kill, 0 never reached the server
[step 2] PASS — 18 requests from 2 players; 8 accepted (6 construction, 2 recruitment), 9 stored rejections {"WORLD_VERSION_CONFLICT":7,"PREREQUISITE_MISSING":2} incl. "Requires Headquarters level 2."; SIGKILL at 2026-09-20T05:22:05.877Z; 1 request(s) in flight with no response; server exited signal SIGKILL

## Step 3 — the process is gone, nothing answers, and a live -wal is left behind (no shutdown hook ran)
GET /api/health -> no response (ECONNREFUSED)
files at kill: main 4096 bytes, -wal 1470872 bytes, -shm 32768 bytes
[step 3] PASS — health ECONNREFUSED; -wal 1470872 bytes and -shm 32768 bytes left on disk; nothing has opened the database since the kill

## Step 4 — control — the main file copied WITHOUT its -wal lacks the committed state, so what follows is a WAL recovery, not a re-read of a checkpointed file
$ cp <db> <orphan>   # main file only; -wal and -shm deliberately not copied
$ sqlite3 <orphan> "SELECT count(*) FROM local_command_inbox;"
  Error: in prepare, no such table: local_command_inbox
  -> exit 1
$ sqlite3 <orphan> "SELECT count(*) FROM sqlite_master WHERE type = 'table';"
  0
  -> exit 0
[step 4] PASS — main-file-only copy: no readable inbox (Error: in prepare, no such table: local_command_inbox), 0 tables; the live server had 17 responded commands — the committed state was in the -wal

## Step 5 — restart on the same files as the FIRST opener since the kill: health 200, integrity_check ok, foreign_key_check empty, still WAL mode
restarting at 2026-09-20T05:22:05.888Z
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-b8-Uz70yj/world.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_BIND=127.0.0.1 PORT=4231 node --experimental-strip-types src/index.ts &)
  [server:4231] KingSage shared world listening at http://127.0.0.1:4231/?world=shared
  [server:4231] Persistent local database: /tmp/kingsmarch-b8-Uz70yj/world.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
$ sqlite3 <db> "PRAGMA integrity_check;"
  ok
  -> exit 0
$ sqlite3 <db> "PRAGMA foreign_key_check;"
  -> exit 0
$ sqlite3 <db> "PRAGMA journal_mode;"
  wal
  -> exit 0
files after restart: main 4096 bytes, -wal 1483232 bytes, -shm 32768 bytes
[step 5] PASS — health 200 after restart; PRAGMA integrity_check = ok; foreign_key_check empty; journal_mode wal

## Step 6 — identity — both players rejoin as created:false with the same player, kingdom and village ids
POST /api/roblox/session {"robloxUserId":930001,"displayName":"Kill Nine One (after kill)"} -> 200 {"playerId":"player-fbcc055c-94a6-4383-80e1-9fad88cc08df","kingdomId":"kingdom-1","created":false,"contractVersion":1}
POST /api/roblox/session {"robloxUserId":930002,"displayName":"Kill Nine Two (after kill)"} -> 200 {"playerId":"player-35fdca72-ec35-4787-8f8f-91541f89c487","kingdomId":"kingdom-2","created":false,"contractVersion":1}
POST /api/roblox/state {"robloxUserIds":[930001,930002]} -> 200 (27442 bytes; states: 930001,930002)
p1 after restart: {"worldVersion":10,"playerId":"player-fbcc055c-94a6-4383-80e1-9fad88cc08df","kingdomId":"kingdom-1","villageId":"village-1-capital","resources":{"wood":1110,"stone":900,"iron":735},"militia":0,"constructionJobs":["timber→2"],"recruitmentJobs":["militia×1@2026-09-20T05:22:50.769Z"],"notifications":[]}
p2 after restart: {"worldVersion":10,"playerId":"player-35fdca72-ec35-4787-8f8f-91541f89c487","kingdomId":"kingdom-2","villageId":"village-2-capital","resources":{"wood":1185,"stone":990,"iron":795},"militia":0,"constructionJobs":[],"recruitmentJobs":["militia×1@2026-09-20T05:22:50.789Z"],"notifications":[]}
[step 6] PASS — both rejoins created:false with identical player/kingdom ids; villages village-1-capital, village-2-capital still owned

## Step 7 — durability — every command the clients got an answer to (17: accepted AND rejected) replays byte-identically from the inbox
replayed 17/17 responded commands: every status and body byte-identical to the pre-kill response
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  17
  -> exit 0
[step 7] PASS — 17/17 replays byte-identical (8 accepted, 9 rejected); inbox holds 17 rows

## Step 8 — atomicity — each of the 1 in-flight command(s) is either wholly present (inbox row + its job) or wholly absent
$ sqlite3 <db> "SELECT result_json FROM local_command_inbox WHERE command_id = 'b8-p2-09';"
  -> exit 0
b8-p2-09: absent (no inbox row) — the kill landed before its commit
[step 8] PASS — b8-p2-09: absent (no inbox row) — the kill landed before its commit; inbox row count equals responded + committed in-flight

## Step 9 — job tables equal the ledger — every durable accepted job is on disk with its completes_at, and no job exists that no accepted command created; world version never went backwards
$ sqlite3 <db> "SELECT id || '|' || completes_at || '|' || status FROM local_construction_jobs ORDER BY id;"
  construction-065c1aac-07f6-46e9-b77f-e04061c3dc57|2026-09-20T05:22:05.858Z|waiting
  construction-5c55dba0-5532-4b7d-bf29-d17dd20cd7f4|2026-09-20T05:22:05.816Z|waiting
  construction-5ead9dc5-84d9-4ea8-88f6-98939124b09a|2026-09-20T05:22:05.827Z|waiting
  construction-825ba1f2-7a02-45e9-8b0c-e06ec5abd067|2026-09-20T05:22:05.842Z|waiting
  construction-e95ea196-806e-4757-b180-a786375c8703|2026-09-20T05:22:05.875Z|waiting
  construction-f0ce3187-3e37-470b-bddf-7bc16b742e8f|2026-09-20T05:34:05.806Z|queued
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || completes_at || '|' || status FROM local_recruitment_jobs ORDER BY id;"
  recruitment-54e83037-9368-48e1-8a77-4c95d33eb382|2026-09-20T05:22:50.789Z|queued
  recruitment-ef212794-93b6-4f21-8bf0-c1f47466d63d|2026-09-20T05:22:50.769Z|queued
  -> exit 0
[step 9] PASS — 6 construction + 2 recruitment rows, each matching an accepted command's id and completesAt (statuses: 1 queued, 5 waiting); no orphan job rows; highest accepted version before the kill 10, world version after restart 10

## Step 10 — resources reconcile — per village, whole + carry == baseline + production × hours − what the durable STARTED jobs charged (waiting jobs are unpaid), to <1e-6
$ sqlite3 <db> "SELECT e.last_materialized_at || '|' || e.resource_carry_json || '|' || v.resources_json FROM local_village_economy e JOIN local_villages v ON v.id = e.village_id WHERE e.village_id = 'village-1-capital';"
  2026-09-20T05:22:06.113Z|{"wood":0.0045266666666666676,"stone":0.0045266666666666676,"iron":0.0045266666666666676}|{"wood":1110,"stone":900,"iron":735}
  -> exit 0
p1: charged militia×1 {"wood":15,"stone":10,"iron":5}, timber→2 {"wood":75,"stone":90,"iron":60} = {"wood":90,"stone":100,"iron":65}; 0.000101 h at {"wood":28,"stone":28,"iron":28}/h; {"wood":{"whole":1110,"carry":0.004527,"expectedTotal":1110.004527,"actualTotal":1110.004527},"stone":{"whole":900,"carry":0.004527,"expectedTotal":900.004527,"actualTotal":900.004527},"iron":{"whole":735,"carry":0.004527,"expectedTotal":735.004527,"actualTotal":735.004527}}
$ sqlite3 <db> "SELECT e.last_materialized_at || '|' || e.resource_carry_json || '|' || v.resources_json FROM local_village_economy e JOIN local_villages v ON v.id = e.village_id WHERE e.village_id = 'village-2-capital';"
  2026-09-20T05:22:06.108Z|{"wood":0.004487777777777778,"stone":0.004487777777777778,"iron":0.004487777777777778}|{"wood":1185,"stone":990,"iron":795}
  -> exit 0
p2: charged militia×1 {"wood":15,"stone":10,"iron":5} = {"wood":15,"stone":10,"iron":5}; 0.000100 h at {"wood":28,"stone":28,"iron":28}/h; {"wood":{"whole":1185,"carry":0.004488,"expectedTotal":1185.004488,"actualTotal":1185.004488},"stone":{"whole":990,"carry":0.004488,"expectedTotal":990.004488,"actualTotal":990.004488},"iron":{"whole":795,"carry":0.004488,"expectedTotal":795.004488,"actualTotal":795.004488}}
[step 10] PASS — both villages: whole + carry equals baseline + production × elapsed − charged costs to <1e-6; only the first construction order and the recruit were charged, as the queue rule says

## Step 11 — timers survive the kill — each durable recruit lands at exactly its completesAt with its notification, and the world takes a new command afterwards
waiting 47s for the last recruit (2026-09-20T05:22:50.789Z) to come due
POST /api/roblox/state {"robloxUserIds":[930001,930002]} -> 200 (27374 bytes; states: 930001,930002)
$ sqlite3 <db> "SELECT status FROM local_recruitment_jobs WHERE id = 'recruitment-ef212794-93b6-4f21-8bf0-c1f47466d63d';"
  complete
  -> exit 0
p1: militia 1; "1 Farmer's Militia joined the army." createdAt 2026-09-20T05:22:50.769Z == completesAt 2026-09-20T05:22:50.769Z
POST /api/roblox/state {"robloxUserIds":[930001]} -> 200 (13816 bytes; states: 930001)
POST /api/roblox/commands {"robloxUserId":930001,"commandId":"b8-p1-after-kill-1","expectedWorldVersion":12,"command":{"type":"village.recruit.queue","payload":{"villageId":"village-1-capital","troop":"militia","quantity":1}}} -> 200 {"type":"command.accepted","payload":{"commandId":"b8-p1-after-kill-1","worldVersion":13,"recruitmentJob":{"id":"recruitment-a508cf0d-a0ab-46fb-ba41-17d9cdecaf20","villageId":"village-1-capital","troop":"militia","quantity":1,"startedAt":"2026-09-20T05:22:52.826Z","completesAt":"2026-09-20T05:23:37.826Z"}}}
$ sqlite3 <db> "SELECT status FROM local_recruitment_jobs WHERE id = 'recruitment-54e83037-9368-48e1-8a77-4c95d33eb382';"
  complete
  -> exit 0
p2: militia 1; "1 Farmer's Militia joined the army." createdAt 2026-09-20T05:22:50.789Z == completesAt 2026-09-20T05:22:50.789Z
POST /api/roblox/state {"robloxUserIds":[930002]} -> 200 (13610 bytes; states: 930002)
POST /api/roblox/commands {"robloxUserId":930002,"commandId":"b8-p2-after-kill-1","expectedWorldVersion":13,"command":{"type":"village.recruit.queue","payload":{"villageId":"village-2-capital","troop":"militia","quantity":1}}} -> 200 {"type":"command.accepted","payload":{"commandId":"b8-p2-after-kill-1","worldVersion":14,"recruitmentJob":{"id":"recruitment-b78c4f9e-c000-4441-b73c-614fe10e8218","villageId":"village-2-capital","troop":"militia","quantity":1,"startedAt":"2026-09-20T05:22:52.839Z","completesAt":"2026-09-20T05:23:37.839Z"}}}
[step 11] PASS — 2 recruit(s) completed at exactly their completesAt after the kill, notifications stamped to match, rows complete; a fresh recruit order per player was accepted afterwards
$ kill -TERM <world server pid 2306>
  -> world server exited (code 0, signal null) at 2026-09-20T05:22:52.850Z

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
B8 kill -9 / WAL recovery drill PASS (11/11 steps PASS)
scratch dir removed: /tmp/kingsmarch-b8-Uz70yj
```
