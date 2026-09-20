# B10a — local disposable backup/restore drill: evidence

**Date:** 2026-09-17 · **Executed by:** [Cursor] (cloud; model: Claude Fable 5.1) · **Owner of record:** Adam · **Reviewer owed:** Claude (per matrix row B10a)
**Matrix row:** `docs/verification/2026-09-17-full-game-acceptance-matrix.md` B10a · **Procedure of record:** `docs/ops/vps-runbook.md` "Backups" + "Restore drill"
**SHA executed:** `38610e0` on `cursor/b10a-local-restore-drill` (= matrix tip `3673a9a` + the drill script). `git diff 9b478db 38610e0 -- server/ packages/` is **empty**, so the world server under test is byte-identical to **`main @ 9b478db`**.
**Environment:** cloud Linux, Node `v22.14.0`, `sqlite3 3.45.1`. No hosting, no Studio, no PC.
**Result: PASS — 6/6 steps, exit 0.** Negative control (naive copy instead of `VACUUM INTO`) **fails at step 3, exit 1**, as it must.

## What this proves, and what it does not

Proves: the runbook's `sqlite3 <db> "VACUUM INTO '<backup>'"`, taken **while the WAL-mode server is running**, produces a complete, consistent copy; and the runbook's restore steps (stop → copy backup over the DB → delete `-wal`/`-shm` → start) bring the world back to **exactly** the backed-up state — first job and world version present, the later job and version gone — with `/api/health` 200 and the restored server accepting new writes.

Also proves the drill discriminates: the runbook's warned-against mistake (plain `cp` of the main file, `-wal` left behind) yields a backup with **no tables at all** (main file 4096 bytes; the whole schema still lived in the 943 512-byte `-wal`). The runbook's "restores a near-empty world" warning is, on this build, an understatement.

Does **not** prove: B10b (hosted cron backup landing in `/home/kingsage/backups`, restore on the real box) — still MISSING, gated on H6. Does not prove B8 (kill -9 recovery): the stop in step 5 is a graceful SIGTERM. Does not touch any real world: DB path is an absolute `mkdtemp` under `/tmp`, key is throwaway, port is 4199, `KINGSAGE_*` inherited env is stripped so no AI tick or dev seed can move the world on its own.

## How to rerun

```bash
node scripts/b10a-local-restore-drill.mjs                                   # expect exit 0, "B10a PASS (6/6 steps)"
B10A_NEGATIVE_CONTROL=naive-copy node scripts/b10a-local-restore-drill.mjs  # expect exit 1, FAIL at step 3
```

`B10A_PORT` overrides the port (default 4199). The scratch directory is removed on PASS and kept (path printed) on FAIL.

## Run record — real drill (exit 0)

Verbatim output of `node scripts/b10a-local-restore-drill.mjs` at `38610e0`. UUIDs are per-run and disposable.

| Step | Matrix text | Result | Key evidence |
|---|---|---|---|
| 1 | Start the world server on a fresh `KINGSAGE_DATABASE_PATH`, throwaway `KINGSAGE_ROBLOX_KEY`, non-4178 port | **PASS** | `/api/health` 200 `{"ok":true,"service":"kingsage-world","contractVersion":1}`; fresh DB 4096 bytes |
| 2 | `/api/roblox/session` + one `village.build.queue` so the DB has a job and an inbox row | **PASS** | session `created:true`; `b10a-job-1-timber` → `command.accepted`; state A = version **2**, one timber job; live DB: 1 inbox row, 1 construction job |
| 3 | `sqlite3 <db> "VACUUM INTO '<backup>'"` **while the server is running** (WAL mode) | **PASS** | `-wal` 943 512 bytes live; `PRAGMA journal_mode` = `wal`; `VACUUM INTO` exit 0; backup 258 048 bytes, `integrity_check` ok, 1 inbox row, timber job; server still 200 |
| 4 | Queue a second command so live state diverges from the backup | **PASS** | `b10a-job-2-quarry` → `command.accepted`; state B = version **3**; job rows `timber:queued`, `quarry:waiting`; inbox 2 rows; backup still 1 inbox row |
| 5 | Stop the server, copy the backup over the DB, delete `-wal`/`-shm`, restart | **PASS** | SIGTERM exit code 0; sidecars already checkpointed away, `rm -f` both; restored file's inbox = `b10a-job-1-timber` only; restart `/api/health` 200 |
| 6 | `/api/health` 200 and a `/api/roblox/state` pull showing the **first** job and world version, not the second | **PASS** | state C = version **2**, same timber job id as state A; no quarry; inbox holds only job 1; `local_construction_jobs` = `timber:queued`; a fresh post-restore command is `command.accepted` |

Note on step 4: the state pull's `constructionJobs` lists only `status='queued'` jobs (`store.ts` snapshot query); a second build behind a running one is stored `waiting` and does not appear in the pull. The pull-visible divergence is therefore the world version (2 → 3); the table rows prove the second job. The first run of the script assumed two jobs in the pull and failed at step 4 on that wrong assumption (game behaved correctly; script fixed before the recorded run). Recorded for honesty — that failure was the script's, not the server's.

```text
# B10a local backup/restore drill
date: 2026-09-17T14:36:21.884Z
sha: 38610e0
node: v22.14.0
sqlite3: 3.45.1 2024-01-30 16:01:20 e876e51a0ed5c5b3126f52e532044363a014bc594cfefa87ffb5b82257ccalt1 (64-bit)
scratch: /tmp/kingsmarch-b10a-rCFxjj
db: /tmp/kingsmarch-b10a-rCFxjj/world.sqlite
port: 4199

## Step 1 — start the world server on a fresh KINGSAGE_DATABASE_PATH, throwaway key, non-4178 port
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-b10a-rCFxjj/world.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_BIND=127.0.0.1 PORT=4199 node --experimental-strip-types src/index.ts &)
  [server:err] (node:2792) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
  [server:err] (node:2792) ExperimentalWarning: SQLite is an experimental feature and might change at any time
  [server] KingSage shared world listening at http://127.0.0.1:4199/?world=shared
Persistent local database: /tmp/kingsmarch-b10a-rCFxjj/world.sqlite
[step 1] PASS — /api/health 200 {"ok":true,"service":"kingsage-world","contractVersion":1}; fresh DB created at /tmp/kingsmarch-b10a-rCFxjj/world.sqlite (4096 bytes)

## Step 2 — /api/roblox/session + one village.build.queue so the DB has a job and an inbox row
POST /api/roblox/session -> 200 {"playerId":"player-277aafc3-bf62-4b8c-a01c-6e0d68b53226","kingdomId":"kingdom-1","created":true,"contractVersion":1}
POST /api/roblox/commands b10a-job-1-timber -> 200 command.accepted
state pull A (after job 1): {"worldVersion":2,"constructionJobs":[{"id":"construction-23d4f5de-04e9-4eaf-8170-e7c27b2b0d33","building":"timber","targetLevel":2}]}
$ sqlite3 /tmp/kingsmarch-b10a-rCFxjj/world.sqlite "SELECT count(*) FROM local_command_inbox;"
  1
  -> exit 0
$ sqlite3 /tmp/kingsmarch-b10a-rCFxjj/world.sqlite "SELECT count(*) FROM local_construction_jobs;"
  1
  -> exit 0
[step 2] PASS — job 1 accepted; state A = {"worldVersion":2,"constructionJobs":[{"id":"construction-23d4f5de-04e9-4eaf-8170-e7c27b2b0d33","building":"timber","targetLevel":2}]}; live DB has 1 inbox row, 1 construction job

## Step 3 — sqlite3 VACUUM INTO while the server is running (WAL mode)
live journal files before backup: /tmp/kingsmarch-b10a-rCFxjj/world.sqlite-wal (943512 bytes); /tmp/kingsmarch-b10a-rCFxjj/world.sqlite-shm (32768 bytes)
$ sqlite3 /tmp/kingsmarch-b10a-rCFxjj/world.sqlite "PRAGMA journal_mode;"
  wal
  -> exit 0
$ sqlite3 /tmp/kingsmarch-b10a-rCFxjj/world.sqlite "VACUUM INTO '/tmp/kingsmarch-b10a-rCFxjj/world-backup.sqlite'"
  -> exit 0
$ sqlite3 /tmp/kingsmarch-b10a-rCFxjj/world-backup.sqlite "PRAGMA integrity_check;"
  ok
  -> exit 0
$ sqlite3 /tmp/kingsmarch-b10a-rCFxjj/world-backup.sqlite "SELECT count(*) FROM local_command_inbox;"
  1
  -> exit 0
$ sqlite3 /tmp/kingsmarch-b10a-rCFxjj/world-backup.sqlite "SELECT building FROM local_construction_jobs;"
  timber
  -> exit 0
[step 3] PASS — backup written while live: /tmp/kingsmarch-b10a-rCFxjj/world-backup.sqlite (258048 bytes); integrity ok; backup holds 1 inbox row + the timber job; server still up (/api/health 200)

## Step 4 — queue a second command so live state diverges from the backup
POST /api/roblox/commands b10a-job-2-quarry -> 200 command.accepted
state pull B (after job 2, live, diverged): {"worldVersion":3,"constructionJobs":[{"id":"construction-23d4f5de-04e9-4eaf-8170-e7c27b2b0d33","building":"timber","targetLevel":2}]}
$ sqlite3 /tmp/kingsmarch-b10a-rCFxjj/world.sqlite "SELECT count(*) FROM local_command_inbox;"
  2
  -> exit 0
$ sqlite3 /tmp/kingsmarch-b10a-rCFxjj/world.sqlite "SELECT building || ':' || status FROM local_construction_jobs ORDER BY started_at;"
  timber:queued
  quarry:waiting
  -> exit 0
$ sqlite3 /tmp/kingsmarch-b10a-rCFxjj/world-backup.sqlite "SELECT count(*) FROM local_command_inbox;"
  1
  -> exit 0
[step 4] PASS — live state diverged: version 2 -> 3; job rows 1 -> 2 (timber queued, quarry waiting); inbox rows 1 -> 2; backup still holds 1 inbox row

## Step 5 — stop the server, copy the backup over the DB, delete -wal/-shm, restart
$ kill -TERM <server pid>
  -> server exited (code 0, signal null)
journal files after graceful stop: /tmp/kingsmarch-b10a-rCFxjj/world.sqlite-wal (absent); /tmp/kingsmarch-b10a-rCFxjj/world.sqlite-shm (absent)
$ cp /tmp/kingsmarch-b10a-rCFxjj/world-backup.sqlite /tmp/kingsmarch-b10a-rCFxjj/world.sqlite
$ rm -f /tmp/kingsmarch-b10a-rCFxjj/world.sqlite-wal  (already absent)
$ rm -f /tmp/kingsmarch-b10a-rCFxjj/world.sqlite-shm  (already absent)
$ sqlite3 /tmp/kingsmarch-b10a-rCFxjj/world.sqlite "SELECT command_id FROM local_command_inbox ORDER BY received_at;"
  b10a-job-1-timber
  -> exit 0
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-b10a-rCFxjj/world.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_BIND=127.0.0.1 PORT=4199 node --experimental-strip-types src/index.ts &)
  [server:err] (node:2814) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
  [server:err] (node:2814) ExperimentalWarning: SQLite is an experimental feature and might change at any time
  [server] KingSage shared world listening at http://127.0.0.1:4199/?world=shared
Persistent local database: /tmp/kingsmarch-b10a-rCFxjj/world.sqlite
[step 5] PASS — server stopped (code 0, signal null); backup copied over DB; sidecars removed; restarted, /api/health 200

## Step 6 — /api/health 200 and a state pull showing the FIRST job and world version, not the second
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
state pull C (after restore): {"worldVersion":2,"constructionJobs":[{"id":"construction-23d4f5de-04e9-4eaf-8170-e7c27b2b0d33","building":"timber","targetLevel":2}]}
state pull A (before backup):  {"worldVersion":2,"constructionJobs":[{"id":"construction-23d4f5de-04e9-4eaf-8170-e7c27b2b0d33","building":"timber","targetLevel":2}]}
$ sqlite3 /tmp/kingsmarch-b10a-rCFxjj/world.sqlite "SELECT command_id FROM local_command_inbox ORDER BY received_at;"
  b10a-job-1-timber
  -> exit 0
$ sqlite3 /tmp/kingsmarch-b10a-rCFxjj/world.sqlite "SELECT building || ':' || status FROM local_construction_jobs ORDER BY started_at;"
  timber:queued
  -> exit 0
POST /api/roblox/commands b10a-post-restore-probe -> 200 command.accepted
[step 6] PASS — restored world = state A exactly (version 2, jobs ["timber"]); second job (version 3, quarry) gone; inbox holds only b10a-job-1-timber; restored server accepts new writes
$ kill -TERM <server pid>
  -> server exited (code 0, signal null)

## Result
- step 1: PASS
- step 2: PASS
- step 3: PASS
- step 4: PASS
- step 5: PASS
- step 6: PASS
B10a PASS (6/6 steps)
scratch dir removed: /tmp/kingsmarch-b10a-rCFxjj
```

Process exit code: **0**.

## Run record — negative control (exit 1, expected)

`B10A_NEGATIVE_CONTROL=naive-copy node scripts/b10a-local-restore-drill.mjs` at `38610e0`, 2026-09-17T14:36:22Z. Steps 1–2 identical to the real drill (version 2, one timber job, `-wal` 943 512 bytes). Step 3 excerpt:

```text
$ cp /tmp/kingsmarch-b10a-MPe0vf/world.sqlite /tmp/kingsmarch-b10a-MPe0vf/world-backup.sqlite   # NEGATIVE CONTROL: naive copy, no -wal
$ sqlite3 /tmp/kingsmarch-b10a-MPe0vf/world-backup.sqlite "PRAGMA integrity_check;"
  ok
  -> exit 0
$ sqlite3 /tmp/kingsmarch-b10a-MPe0vf/world-backup.sqlite "SELECT count(*) FROM local_command_inbox;"
  Error: in prepare, no such table: local_command_inbox
  -> exit 1
$ sqlite3 /tmp/kingsmarch-b10a-MPe0vf/world-backup.sqlite "SELECT building FROM local_construction_jobs;"
  Error: in prepare, no such table: local_construction_jobs
  -> exit 1
[step 3] FAIL — backup content wrong: inbox= jobs=

DRILL FAILED: step 3 failed: backup content wrong: inbox= jobs=
...
B10a FAIL (2/6 steps)
```

Process exit code: **1**. Note `integrity_check` says `ok` on an empty-schema file — integrity alone would not have caught this; the content checks did. The scratch directory was deleted after inspection.

## Gates on this branch (same session, same image)

Nothing under `server/`, `packages/`, or `roblox/` changed on this branch, so these are sanity runs, not new claims:

| Gate | Result | Note |
|---|---|---|
| `npm run check:types` | **clean**, exit 0 | After `npm install` at root (`@types/node`) and in `mobile-rebuild/` (`typescript`) — this image ships neither; the gate refuses to pass silently without them, which is correct. |
| `npm run test:server` | **115 tests · 112 pass · 0 fail · 3 skipped**, exit 0 | The 3 skips are the Lune cross-language contract test (`CROSS-LANGUAGE CONTRACT SKIPPED — Lune is not on PATH`). Lune is not installed on this image; the matrix §1 run on 2026-09-17 had it and reported 0 skipped. Not a regression — no Luau or server code moved — but this session did **not** re-execute that contract. |
| `npm run test:core`, `npm run test:luau` | not run this session | Not touched by this branch; §1 numbers stand as recorded. |

## Boundaries honored

- Disposable world only: `mkdtemp` under `/tmp`, throwaway key `b10a-throwaway-key-0001` (not a secret), port 4199, never `server/data/`, never the 4178 dev world, never a hosted box. Nothing under `server/` was modified.
- No new live pass is claimed for any row other than B10a. B7 (graceful restart persistence) was *exercised* along the way — step 5 is a graceful stop/start and the first job survived it — but the matrix's B7 acceptance asks for the 2026-08-29 exercise re-driven (link, snapshot, build queue, replay, restart); that is a separate §7 task and B7 stays **live NOT RUN** on the current tip.
- B10b stays MISSING/gated on H6. D-02/OPEN-21 and every other §4 line stay DECISION-HELD; nothing here answers them.
- No merge, no push to `main`, no force-push. This note rides a draft PR on `cursor/b10a-local-restore-drill`.
