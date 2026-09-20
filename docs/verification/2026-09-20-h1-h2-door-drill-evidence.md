# H1 / H2 — the door at production defaults, on a real clock: evidence

**Date:** 2026-09-20 · **Executed by:** [Cursor] (cloud; model: Claude Fable 5.1) · **Owner of record:** Adam · **Reviewer owed:** Claude (per matrix §7)
**Matrix rows:** `docs/verification/2026-09-17-full-game-acceptance-matrix.md` **H1** (rate limits: auth 5/min/address, commands 30/min/player) and **H2** (commandId validated 1–128 chars; no silent-replay trap). Both were **IMPLEMENTED + TESTED** and nothing more. Also the local half of milestone **M1**'s one-line test ("wrong key gets 401; rapid registrations throttled") and the audit's finding **12.4** ("six scripted registrations exhausted the world's seats").
**Why this was still open:** `server/test/rate-limit.test.ts` proves the bucket *mechanism* with **injected** limits of 3 and 2 against a **fake** clock. The 5 and 30 that `node src/index.ts` actually runs with are literals in `server/src/http.ts` (not configurable), and the real-time refill (one auth attempt per 12 s, one command per 2 s) had never been driven. The contract-shape guard (`requireCommandShape`) likewise had unit coverage only.
**SHA executed:** `03a9f41` on `cursor/h1-h2-door-drill-0901` (= [PR #14](https://github.com/Adamdesgns/kingsage-remaster/pull/14) tip `4a5b9fb` + `scripts/h1-h2-door-drill.mjs`). `git diff 9b478db 03a9f41 -- server/ packages/ roblox/` is **empty**, so the world server under test is byte-identical to **`main @ 9b478db`**.
**Environment:** cloud Linux, Node `v22.14.0`, `sqlite3 3.45.1`. No hosting, no Studio, no PC, no phone.
**Result: PASS — 10/10 steps, exit 0.** Wall time 78 s (`05:50:12Z` → `05:51:30Z`), of which 73 s is waiting for the real clock to refill the auth door (12.5 s + 60.5 s). No limits were injected; no clock was faked.

## What this proves, and what it does not

Proves, at `03a9f41`, against three disposable worlds over raw HTTP:

- **H1 — the auth door at 5/min per address, counting attempts not successes.** From one address: registrations #1, #2, #4, #5 → 201 and a wrong-password login #3 → 401 were all answered on their merits; **attempt #6, a registration, → 429 `RATE_LIMITED` "Too many attempts — try again in a minute." while two seats (`kingdom-5`, `kingdom-6`) were still unclaimed** — the door, not the world, said no; attempt #7, a *correct* login, → 429 too (one door for both routes). 4 players, 4 sessions; the refused calls wrote nothing.
- **H1 — keyed per source address.** The same login from `127.0.0.2` → 200 in the same second that `127.0.0.1` → 429.
- **H1 — real-clock refill, both ends of the window.** 12.5 s later exactly one login passed and the next was refused; 60.5 s later five passed and the sixth was refused — the whole allowance came back, so the refusal copy ("try again in a minute") is literally true.
- **H1 — the command door at 30/min per player.** 30 well-formed commands in 214 ms (1 accepted militia recruit, 29 stored `PREREQUISITE_MISSING` Rampart refusals) all answered on merit; **#31 and #32 → 429 `command.rejected` `RATE_LIMITED` "The realm needs a breath — try again in a moment."** with `currentWorldVersion: 0`. Inbox held exactly 30 rows: **a 429 stores nothing.**
- **H1 — what the door exempts, as coded.** During p1's refusal 10 heartbeat pulls (`/api/roblox/state`) → 200; p2's first command was judged on merit (409 `PREREQUISITE_MISSING`); p1 was still 429. Separately, 8 rapid `/api/roblox/session` rejoins and 12 rapid state pulls took no 429 — the per-address door covers `/api/auth/*` only and the state heartbeat is deliberately unlimited (`http.ts` says so).
- **H1 — a throttled commandId is not poisoned.** 2.6 s after the last refusal, the once-429'd `door-p1-31` was resent, judged on merit (409 `PREREQUISITE_MISSING`), stored byte-identically, and the very next p1 command was 429 again. Refusal at the door leaves no memory that a later replay could trip over.
- **H2 — the contract-shape guard.** 10 malformed envelopes died at the door: missing / empty / 129-char / numeric `commandId` → 400 `INVALID_CONTRACT`; missing / array / non-string-type `command` → 400 `INVALID_CONTRACT`; non-JSON body and JSON-array body → 400 `INVALID_JSON`; a 1 000 193-byte body → 413 `BODY_TOO_LARGE`. An unlinked `robloxUserId` with a well-formed envelope → 404 `UNKNOWN_ROBLOX_USER`. Inbox 0 rows afterwards. A **128-char** `commandId` (the boundary) passed the door and was judged on merit. And because the 30-command allowance was still whole after these 10 probes, **malformed requests cost the player nothing** (the shape check runs before the door).
- **The no-key posture.** A server started with `KINGSAGE_ROBLOX_KEY` unset: `/api/health` 200; `/api/roblox/session` (with and without a key), `/state`, `/commands` → 503 `ROBLOX_DISABLED` "Roblox API is not configured."; `roblox_players` 0 rows; the web door still registers (201). The Roblox surface is off, not hanging or 500ing.

Does **not** prove: **H3** — one shared key still acts as anyone, and step 6 shows the consequence plainly: the Roblox link route is *not* throttled, so a leaked key can claim seats as fast as the wire carries requests (that is H3's problem to solve, and it is a P0 the day the server is hosted, as the matrix already says). Anything **behind a reverse proxy or TLS** — there the address the door keys on would be the proxy's unless it forwards the client address, which is an H6 runbook concern this drill cannot reach. The **Roblox-side handling** of a 429 (`WorldSession.luau` showing "The realm needs a breath" to a player) — Studio. That **5 and 30 are the right numbers** — "untuned by real play" stays true; this drill certifies that the coded numbers are the running numbers, not that they are good. Two observations recorded and **not judged**: the 429 carries **no `Retry-After` header**, and the session cookie has **no `Secure` flag** (H5 already says MISSING). Does not touch any real world: DB paths are absolute `mkdtemp` files under `/tmp`, the key and password are throwaway literals, ports are 4241–4243, inherited `KINGSAGE_*` env is stripped.

## How to rerun

```bash
node scripts/h1-h2-door-drill.mjs                  # expect exit 0, "H1/H2 door drill PASS (10/10 steps PASS)", ~80 s
DOOR_PORT=4241 node scripts/h1-h2-door-drill.mjs   # world A on 4241, B on 4242, C on 4243
```

Needs Node 22 and the `sqlite3` CLI. Step 3 binds the client to `127.0.0.2`; Linux routes all of `127/8` to loopback, so this works on any Linux box — on a host that cannot bind a second loopback address the step fails and says so rather than skipping. The scratch directory is removed on PASS and kept (path printed) on FAIL. The expected limits are constants at the top of the script mirroring the literals in `server/src/http.ts`; if someone changes the server's numbers the drill fails on the count, which is the point.

## Step table

| Step | World | What it drives | Result | Key evidence |
|---|---|---|---|---|
| 1 | A | Fresh world; first registration (attempt 1 of 5) | **PASS** | health 200; `door_one` 201 → `kingdom-1`; cookie `HttpOnly; SameSite=Lax` (no `Secure`); `/api/session` 200 with it |
| 2 | A | **H1** auth door at 5/min, attempts not successes | **PASS** | #2 201, #3 wrong password 401, #4 201, #5 201; **#6 registration 429**, #7 correct login 429; 4 players, 4 sessions; seats `kingdom-5`, `kingdom-6` unclaimed; no `Retry-After` |
| 3 | A | **H1** per-address keying | **PASS** | login from `127.0.0.2` → 200; from `127.0.0.1` → 429 same second |
| 4 | A | **H1** real-clock refill | **PASS** | +12.5 s: 200 then 429; +60.5 s: 200 ×5 then 429 |
| 5 | B | **H2** contract-shape guard; unlinked user | **PASS** | 7 × 400 `INVALID_CONTRACT`, 2 × 400 `INVALID_JSON`, 1 × 413 `BODY_TOO_LARGE` (1 000 193 B); 404 `UNKNOWN_ROBLOX_USER`; inbox 0 |
| 6 | B | Routes the door exempts, as coded | **PASS** | 8 rapid rejoins 200 `created:false`; 12 rapid state pulls 200 |
| 7 | B | **H1** command door at 30/min; 429 stores nothing | **PASS** | 30 in 214 ms: 1 accepted + 29 stored 409; 128-char id passed the door; #31, #32 → 429 `command.rejected` `RATE_LIMITED`; inbox 30; 1 recruitment job |
| 8 | B | Heartbeat exempt; per-player independence | **PASS** | 10 state pulls 200 during refusal; p2 409 `PREREQUISITE_MISSING`; p1 still 429 |
| 9 | B | **H1** refill at 1 per 2 s; refused id not poisoned | **PASS** | +2.6 s: `door-p1-31` → 409 `PREREQUISITE_MISSING`, stored byte-identically; next → 429; inbox 32 |
| 10 | C | No `KINGSAGE_ROBLOX_KEY` | **PASS** | health 200; session/state/commands 503 `ROBLOX_DISABLED`; `roblox_players` 0; web register 201 |

## Gate sanity at this tip (same session, cloud image)

| Gate | Result |
|---|---|
| `npm run check:types` | **clean** (after `npm install` at root for `@types/node` and a `--no-save` `typescript@7.0.2` into `mobile-rebuild/` — the image ships neither; nothing committed) |
| `npm run test:core` | **92/92, 0 fail** |
| `npm run test:server` | **114/114, 0 fail, 0 skipped** with Lune 0.10.5 on `PATH` (downloaded to `/tmp`) |
| `npm run test:luau` | 31 files syntax-clean · **72 rules, 0 failed** · 7 spike-sim checks, 0 failed |

No `server/`, `packages/`, or `roblox/` code changed on this branch; the gates are sanity, not a claim of new coverage.

## Honesty notes

- **The first smoke run failed at step 2 on a wrong assumption of mine**, not the server's: I had written the drill as if the fixture had two claimable seats, so the third registration was expected to be 409 `WORLD_FULL`; it was 201 → `kingdom-3`. `findOpenSeat()` hands out the 2 open seats and then the 4 AI seats through one helper shared by web registration and Roblox linking (six seats in all). The step was rewritten around that fact into the audit's own scenario — a registration burst — and is stronger for it: the sixth attempt is refused *with seats still open*. The second smoke run (same steps as the recorded run, before the last wording change) passed 10/10 in 78 s; the recorded run below is the first run of the committed script.
- **Step 2 counts the wrong-password 401 as an attempt** deliberately: the door is on attempts, which is what stops a scrypt-driven login flood, and the drill shows it (attempt #7, a correct login, is refused because #3 was spent on a bad one).
- **Step 6 is a PASS against the code as written, not a judgement that the design is right.** An unthrottled key-gated link route is exactly what H3 exists to fix; the row text now says so.
- **The 128-char commandId in step 7 is one of the 30**, so the burst also covers the guard's upper boundary from the inside; the 129-char probe in step 5 covers it from the outside.
- The world-B server prints `Persistent local database:` un-prefixed once because both banner lines arrive in one stdout chunk; cosmetic. The throwaway password appears in plain text in the record; it is a literal in the script, guards nothing, and is not a secret.
- Model of record: Claude Fable 5.1 (cloud). No secrets: the key and password are throwaway literals, never reused.

## Run record — recorded drill (exit 0)

Verbatim output of `node scripts/h1-h2-door-drill.mjs` at `03a9f41`. UUIDs are per-run and disposable.

```text
# H1/H2 — the door at production defaults (current tip)
date: 2026-09-20T05:50:12.177Z
sha: 03a9f41
node: v22.14.0
sqlite3: 3.45.1 2024-01-30 16:01:20 e876e51a0ed5c5b3126f52e532044363a014bc594cfefa87ffb5b82257ccalt1 (64-bit)
scratch: /tmp/kingsmarch-door-2LlP2W
ports: A=4241 (auth door) B=4242 (command door) C=4243 (no key)
door as coded: auth 5/60s per address (1 token per 12s), commands 30/60s per player (1 token per 2s)

## Step 1 — world A — fresh disposable world; first registration (attempt 1 of the address's 5) succeeds and sets the session cookie
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-door-2LlP2W/door-a.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_BIND=127.0.0.1 PORT=4241 node --experimental-strip-types src/index.ts &)
  [server:4241] KingSage shared world listening at http://127.0.0.1:4241/?world=shared
  [server:4241] Persistent local database: /tmp/kingsmarch-door-2LlP2W/door-a.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/auth/register {"username":"door_one","password":"door-drill-password-1","kingdomName":"Door Realm One"} -> 201 {"player":{"id":"player-02f137d7-9b52-4f69-b8c4-1dad4e98f1ea","username":"door_one","kingdomId":"kingdom-1"}}
Set-Cookie: kingsage_session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000
GET /api/session -> 200 {"player":{"id":"player-02f137d7-9b52-4f69-b8c4-1dad4e98f1ea","username":"door_one","kingdomId":"kingdom-1"}}
[step 1] PASS — health 200; register door_one 201 → kingdom-1; cookie HttpOnly + SameSite=Lax (no Secure flag — H5 says MISSING; recorded, not judged here); /api/session 200 with it

## Step 2 — world A — the per-address auth door at 5/min: attempts 2–5 (registrations and a wrong-password login) are answered on their merits; attempt 6, a registration, is 429 while seats remain — the door, not the world, said no; attempt 7, a correct login, is 429 too (one door for both routes)
$ sqlite3 <db> "SELECT count(*) FROM local_kingdoms WHERE controller_player_id IS NULL AND seat_kind IN ('open','ai');"
  5
  -> exit 0
POST /api/auth/register {"username":"door_two","password":"door-drill-password-1","kingdomName":"Door Realm Two"} -> 201 {"player":{"id":"player-8721de7a-5f96-416a-a4a9-584b320adaee","username":"door_two","kingdomId":"kingdom-2"}}
POST /api/auth/login {"username":"door_one","password":"wrong-password-xx"} -> 401 {"error":{"code":"INVALID_LOGIN","message":"Username or password is incorrect."}}
POST /api/auth/register {"username":"door_three","password":"door-drill-password-1","kingdomName":"Door Realm Three"} -> 201 {"player":{"id":"player-cee6576b-c51b-4fa1-8708-07f393e441f4","username":"door_three","kingdomId":"kingdom-3"}}
POST /api/auth/register {"username":"door_four","password":"door-drill-password-1","kingdomName":"Door Realm Four"} -> 201 {"player":{"id":"player-9513c0a5-6d28-49b9-9fa1-d9fc767dd9ef","username":"door_four","kingdomId":"kingdom-4"}}
POST /api/auth/register {"username":"door_five","password":"door-drill-password-1","kingdomName":"Door Realm Five"} -> 429 {"error":{"code":"RATE_LIMITED","message":"Too many attempts — try again in a minute."}}
POST /api/auth/login {"username":"door_one","password":"door-drill-password-1"} -> 429 {"error":{"code":"RATE_LIMITED","message":"Too many attempts — try again in a minute."}}
$ sqlite3 <db> "SELECT username FROM local_players ORDER BY username;"
  door_four
  door_one
  door_three
  door_two
  -> exit 0
$ sqlite3 <db> "SELECT id FROM local_kingdoms WHERE controller_player_id IS NULL AND seat_kind IN ('open','ai') ORDER BY id;"
  kingdom-5
  kingdom-6
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_sessions;"
  4
  -> exit 0
attempts through the door: #1 register door_one → 201; #2 register door_two → 201; #3 login door_one WRONG password → 401; #4 register door_three → 201; #5 register door_four → 201; #6 register door_five (6th attempt) → 429; #7 login door_one correct (7th attempt) → 429
[step 2] PASS — attempts 1–5 answered on merit (201, 201, 401, 201, 201 — the wrong-password 401 counted like the rest); attempt 6 (registration) and 7 (correct login) both 429 RATE_LIMITED "Too many attempts — try again in a minute."; 4 players, 4 sessions, seats kingdom-5, kingdom-6 still unclaimed — the door stopped the burst two seats before the world ran out; no Retry-After header on the 429 (recorded, not judged)

## Step 3 — world A — the door is keyed per source ADDRESS: the same login from 127.0.0.2 is allowed while 127.0.0.1 is still refused
POST /api/auth/login {"username":"door_one","password":"door-drill-password-1"} (from 127.0.0.2) -> 200 {"player":{"id":"player-02f137d7-9b52-4f69-b8c4-1dad4e98f1ea","username":"door_one","kingdomId":"kingdom-1"}}
POST /api/auth/login {"username":"door_one","password":"door-drill-password-1"} -> 429 {"error":{"code":"RATE_LIMITED","message":"Too many attempts — try again in a minute."}}
[step 3] PASS — 127.0.0.2 login 200 (its own bucket); 127.0.0.1 login 429 in the same second

## Step 4 — world A — a REAL clock refills the door: 12s restores exactly one attempt; a full minute restores all 5
waiting 12.5s (one token = 12s at 5/60s) …
POST /api/auth/login {"username":"door_one","password":"door-drill-password-1"} -> 200 {"player":{"id":"player-02f137d7-9b52-4f69-b8c4-1dad4e98f1ea","username":"door_one","kingdomId":"kingdom-1"}}
POST /api/auth/login {"username":"door_one","password":"door-drill-password-1"} -> 429 {"error":{"code":"RATE_LIMITED","message":"Too many attempts — try again in a minute."}}
waiting 60.5s for the full window ("try again in a minute") …
6 rapid logins after the minute -> 200, 200, 200, 200, 200, 429
[step 4] PASS — after 12.5s exactly one login passed (200) and the next was 429; after 60.5s: 5 logins 200, the 6th 429 — the whole allowance came back
$ kill -TERM <world A server pid 2877>
  -> world A server exited (code 0, signal null) at 2026-09-20T05:51:26.119Z

## Step 5 — world B — H2: the contract-shape guard at /api/roblox/commands: malformed envelopes die at the door with 400, an oversize body with 413, an unlinked user with 404; none reaches the inbox
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-door-2LlP2W/door-b.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_BIND=127.0.0.1 PORT=4242 node --experimental-strip-types src/index.ts &)
  [server:4242] KingSage shared world listening at http://127.0.0.1:4242/?world=shared
Persistent local database: /tmp/kingsmarch-door-2LlP2W/door-b.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":940001,"displayName":"Door One"} -> 200 {"playerId":"player-ce30bc3e-70a6-4bf6-96d8-61f5e707b896","kingdomId":"kingdom-1","created":true,"contractVersion":1}
POST /api/roblox/session {"robloxUserId":940002,"displayName":"Door Two"} -> 200 {"playerId":"player-4d1b903c-2a28-42eb-8022-e1b55dbfbb39","kingdomId":"kingdom-2","created":true,"contractVersion":1}
POST /api/roblox/state {"robloxUserIds":[940001,940002]} -> 200 (26784 bytes; states: 940001,940002)
p1: player-ce30bc3e-70a6-4bf6-96d8-61f5e707b896 / kingdom-1 / village-1-capital, world version 2
p2: player-4d1b903c-2a28-42eb-8022-e1b55dbfbb39 / kingdom-2 / village-2-capital, world version 2
POST /api/roblox/commands {"robloxUserId":940001,"expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 400 {"error":{"code":"INVALID_CONTRACT","message":"commandId must be a non-empty string of at most 128 characters."}}
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 400 {"error":{"code":"INVALID_CONTRACT","message":"commandId must be a non-empty string of at most 128 characters."}}
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 400 {"error":{"code":"INVALID_CONTRACT","message":"commandId must be a non-empty string of at most 128 characters."}}
POST /api/roblox/commands {"robloxUserId":940001,"commandId":12345,"expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 400 {"error":{"code":"INVALID_CONTRACT","message":"commandId must be a non-empty string of at most 128 characters."}}
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"door-shape-probe","expectedWorldVersion":2} -> 400 {"error":{"code":"INVALID_CONTRACT","message":"command must be an object with a string type."}}
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"door-shape-probe","expectedWorldVersion":2,"command":["village.build.queue"]} -> 400 {"error":{"code":"INVALID_CONTRACT","message":"command must be an object with a string type."}}
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"door-shape-probe","expectedWorldVersion":2,"command":{"type":7,"payload":{}}} -> 400 {"error":{"code":"INVALID_CONTRACT","message":"command must be an object with a string type."}}
POST /api/roblox/commands <body is not JSON: 16 bytes> -> 400 {"error":{"code":"INVALID_JSON","message":"Request body must be a JSON object."}}
POST /api/roblox/commands <body is a JSON array: 7 bytes> -> 400 {"error":{"code":"INVALID_JSON","message":"Request body must be a JSON object."}}
POST /api/roblox/commands <body over 1 MB: 1000193 bytes> -> 413 {"error":{"code":"BODY_TOO_LARGE","message":"Request body exceeds 1 MB."}}
POST /api/roblox/commands {"robloxUserId":949999,"commandId":"door-unknown-user","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 404 {"error":{"code":"UNKNOWN_ROBLOX_USER","message":"Call /api/roblox/session first."}}
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  0
  -> exit 0
[step 5] PASS — 10 malformed envelopes refused at the door (no commandId → 400 INVALID_CONTRACT; empty commandId → 400 INVALID_CONTRACT; 129-char commandId → 400 INVALID_CONTRACT; numeric commandId → 400 INVALID_CONTRACT; no command → 400 INVALID_CONTRACT; command is an array → 400 INVALID_CONTRACT; command.type not a string → 400 INVALID_CONTRACT; body is not JSON → 400 INVALID_JSON; body is a JSON array → 400 INVALID_JSON; body over 1 MB → 413 BODY_TOO_LARGE); unlinked user 404 UNKNOWN_ROBLOX_USER; inbox 0 rows — nothing refused at the door was stored

## Step 6 — world B — the routes the door deliberately does NOT cover: /api/roblox/session (key-gated link) and /api/roblox/state (heartbeat) take rapid repeats without a 429
8 rapid /api/roblox/session rejoins for 940001 -> 200, 200, 200, 200, 200, 200, 200, 200
12 rapid /api/roblox/state pulls -> 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200
[step 6] PASS — 8 rapid rejoins all 200 created:false and 12 rapid state pulls all 200 — as coded: the per-address door covers /api/auth/* only, the Roblox link rides the shared key (H3 territory), and the heartbeat is never limited

## Step 7 — world B — the per-player command door at 30/min: 30 well-formed commands are answered on merit (200 or stored 409), the 31st and 32nd are 429 command.rejected RATE_LIMITED and are NOT stored
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"door-p1-01","expectedWorldVersion":2,"command":{"type":"village.recruit.queue","payload":{"villageId":"village-1-capital","troop":"militia","quantity":1}}} -> 200 {"type":"command.accepted","payload":{"commandId":"door-p1-01","worldVersion":3,"recruitmentJob":{"id":"recruitment-8b7b6e07-59fc-4dbd-8721-8b566af24502","villageId":"village-1-capital","troop":"militia","quantity":1,"startedAt":"2026-09-20T05:51:26.641Z","completesAt":"2026-09-20T05:52:11.641Z"}}}
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"door-p1-02-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"door-p1-02-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 2.","currentWorldVersion":3}}
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"door-p1-30","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"door-p1-30","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 2.","currentWorldVersion":3}}
30 commands in 214 ms: {"accepted":1,"PREREQUISITE_MISSING":29} (#1 accepted; #2 with a 128-char commandId PREREQUISITE_MISSING; #3–#29 not printed, outcomes: 409 PREREQUISITE_MISSING)
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"door-p1-31","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 429 {"type":"command.rejected","payload":{"commandId":"door-p1-31","code":"RATE_LIMITED","message":"The realm needs a breath — try again in a moment.","currentWorldVersion":0}}
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"door-p1-32","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 429 {"type":"command.rejected","payload":{"commandId":"door-p1-32","code":"RATE_LIMITED","message":"The realm needs a breath — try again in a moment.","currentWorldVersion":0}}
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  30
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox WHERE command_id IN ('door-p1-31', 'door-p1-32');"
  0
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_recruitment_jobs;"
  1
  -> exit 0
[step 7] PASS — 30 commands in 214 ms all answered on merit {"accepted":1,"PREREQUISITE_MISSING":29} — so the 10 malformed probes of step 5 cost nothing; #31 and #32 → 429 command.rejected RATE_LIMITED "The realm needs a breath — try again in a moment." (currentWorldVersion 0); inbox 30 rows, refused ids absent, 1 recruitment job

## Step 8 — world B — while p1 is refused: the heartbeat still answers, p2's door is independent, and p1 is still refused
10 /api/roblox/state pulls during p1's refusal -> 200, 200, 200, 200, 200, 200, 200, 200, 200, 200
POST /api/roblox/commands {"robloxUserId":940002,"commandId":"door-p2-01","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-2-capital","building":"wall"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"door-p2-01","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 2.","currentWorldVersion":3}}
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"door-p1-33","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 429 {"type":"command.rejected","payload":{"commandId":"door-p1-33","code":"RATE_LIMITED","message":"The realm needs a breath — try again in a moment.","currentWorldVersion":0}}
[step 8] PASS — 10 heartbeat pulls 200 during the refusal; p2's first command answered on merit (409 PREREQUISITE_MISSING "Requires Headquarters level 2."); p1 still 429

## Step 9 — world B — a REAL clock refills p1's door at one command per 2s, and a commandId that was refused 429 is NOT remembered as a rejection: resent, it is judged on merit and stored
waiting 2.6s (one token = 2s at 30/60s; bucket last touched 72 ms ago) …
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"door-p1-31","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"door-p1-31","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 2.","currentWorldVersion":3}}
$ sqlite3 <db> "SELECT result_json FROM local_command_inbox WHERE command_id = 'door-p1-31';"
  {"type":"command.rejected","payload":{"commandId":"door-p1-31","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 2.","currentWorldVersion":3}}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"door-p1-34","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 429 {"type":"command.rejected","payload":{"commandId":"door-p1-34","code":"RATE_LIMITED","message":"The realm needs a breath — try again in a moment.","currentWorldVersion":0}}
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  32
  -> exit 0
[step 9] PASS — after 2.6s the once-refused door-p1-31 was answered on merit (409 PREREQUISITE_MISSING) and stored byte-identically; the next p1 command was 429 again; inbox 32 rows
$ kill -TERM <world B server pid 2892>
  -> world B server exited (code 0, signal null) at 2026-09-20T05:51:29.583Z

## Step 10 — world C — started with NO KINGSAGE_ROBLOX_KEY: health is 200 and the web door works, but every /api/roblox route refuses 503 ROBLOX_DISABLED whatever key is presented, and links nothing
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-door-2LlP2W/door-c.sqlite # KINGSAGE_ROBLOX_KEY deliberately unset KINGSAGE_BIND=127.0.0.1 PORT=4243 node --experimental-strip-types src/index.ts &)
  [server:4243] KingSage shared world listening at http://127.0.0.1:4243/?world=shared
  [server:4243] Persistent local database: /tmp/kingsmarch-door-2LlP2W/door-c.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":940001,"displayName":"Door One"} -> 503 {"error":{"code":"ROBLOX_DISABLED","message":"Roblox API is not configured."}}
POST /api/roblox/session {"robloxUserId":940001,"displayName":"Door One"} -> 503 {"error":{"code":"ROBLOX_DISABLED","message":"Roblox API is not configured."}}
POST /api/roblox/state {"robloxUserIds":[940001]} -> 503 {"error":{"code":"ROBLOX_DISABLED","message":"Roblox API is not configured."}}
POST /api/roblox/commands {"robloxUserId":940001,"commandId":"door-c-01","expectedWorldVersion":1,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 503 {"error":{"code":"ROBLOX_DISABLED","message":"Roblox API is not configured."}}
$ sqlite3 <db> "SELECT count(*) FROM roblox_players;"
  0
  -> exit 0
POST /api/auth/register {"username":"door_web","password":"door-drill-password-1","kingdomName":"Door Web Realm"} -> 201 {"player":{"id":"player-89bc4393-0e39-4c36-a906-9f7e713272b5","username":"door_web","kingdomId":"kingdom-1"}}
[step 10] PASS — health 200; /api/roblox/session (with and without a key), /state and /commands all 503 ROBLOX_DISABLED "Roblox API is not configured."; roblox_players 0 rows; the web door still registers (201) — the Roblox surface is off, not broken
$ kill -TERM <world server pid 2909>
  -> world server exited (code 0, signal null) at 2026-09-20T05:51:30.059Z

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
H1/H2 door drill PASS (10/10 steps PASS)
scratch dir removed: /tmp/kingsmarch-door-2LlP2W
```
