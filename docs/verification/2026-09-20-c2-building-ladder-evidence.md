# C2 — the building ladder over HTTP: every prerequisite rule at its threshold, the queue limit, three non-timber completions on a real clock: evidence

**Date:** 2026-09-20 · **Executed by:** [Cursor] (cloud; model: Claude Fable 5.1) · **Owner of record:** Adam · **Reviewer owed:** Claude (per matrix §7)
**Matrix row:** `docs/verification/2026-09-17-full-game-acceptance-matrix.md` **C2** (13 building types: costs, prereqs, queue stacking, server timers, offline catch-up). Before this run the row carried current-tip live evidence for **one completed building type** (Timber Camp, 720 s, re-drive `21b917b`) and **one prerequisite refusal** (a Rampart at Headquarters 1, B8 drill `69b7548`), and said in so many words: "the other prerequisite rules and completion of any building other than timber NOT exercised live". The matrix's §7 list of HTTP-only claims still resting on tests alone named this slice second.
**Why it was still open:** the six gated buildings (Rampart, Smithy, Market, Stable, Workshop, Academy) need standing levels a fresh village cannot reach in minutes, and the other twelve building types each take 720 s or more to complete. `server/test/build-queue.test.ts` covers the rules against a fake clock; nothing had driven them over the wire.
**How the ladder was reached:** `KINGSAGE_DEV_SEED_LEVEL` — production code in `server/src/index.ts` / `server/src/store.ts`, documented **DEV ONLY**, which raises every non-Freehold building to one level at world creation, clamped to each building's own cap. One disposable world per rung (L2, L3, L5, L8, L10, L99); the fixture-level world (L1) carries the refusals at level 1, the queue limit, and the three real-clock completions. The knob is the same one a Studio drill would use; the drill also checks what it must not do (Freeholds stay at fixture levels, starting resources untouched).
**SHA executed:** `11f14d6` on `cursor/c2-building-ladder-drill-6ff7` (= [PR #15](https://github.com/Adamdesgns/kingsage-remaster/pull/15) tip `35095c7` + `scripts/c2-building-ladder-drill.mjs`). `git diff 9b478db 11f14d6 -- server/ packages/ roblox/` is **empty**, so the world server under test is byte-identical to **`main @ 9b478db`**.
**Environment:** cloud Linux, Node `v22.14.0`, `sqlite3 3.45.1`. No hosting, no Studio, no PC, no phone.
**Result: PASS — 12/12 steps, exit 0.** Wall time 14 min 0.5 s (`06:09:34.176Z` → `06:23:34.702Z`) — effectively the Farm's real 840 s timer, inside which the Quarry (720 s) and Warehouse (780 s) also ran and all six ladder worlds were driven (steps 6–11 took 3.5 s in total). No timers were shortened; no clock was faked.

## What this proves, and what it does not

Proves, at `11f14d6`, against seven disposable worlds over raw HTTP (`/api/roblox/session`, `/state`, `/commands`) with the SQLite files read directly for the facts the API does not expose:

- **Every prerequisite rule, refused with the exact missing prerequisite, at standing level 1** (step 2): Rampart → "Requires Headquarters level 2."; Smithy → "Requires Headquarters level 3."; Market → "Requires Headquarters level 3."; Stable → "Requires Barracks level 5."; Workshop → "Requires Headquarters level 8."; Academy → "Requires Headquarters level 10." — all 409 `command.rejected` `PREREQUISITE_MISSING`, all seven (with an unknown building type → 409 `INVALID_COMMAND` "Unknown building type.") **stored** in the inbox, 0 job rows, resources and world version unchanged, the Academy refusal **replayed byte-identically**. The expected messages are hard-coded in the drill from a reading of `packages/game-core/src/economy.ts`, so this is an oracle, not the server checked against itself.
- **Every gate opening at its threshold** (steps 6–9): at L2 the Rampart is accepted (2→3, **paid** 180/270/90, **timer 1382 s** = `buildingDurationSeconds`) while Smithy/Market still say HQ 3, Stable says Barracks 5, Workshop HQ 8, Academy HQ 10; at L3 Smithy and Market are accepted (Market 3→4 paid 810/713/486, timer 2070 s) while Stable/Workshop still refuse; at L5 the Stable is accepted while the Workshop still says HQ 8; at L8 the Workshop is accepted. Each rung: all 13 seeded levels equal `min(L, cap)`, starting resources untouched by the knob, and **the 4 Freeholds sit at fixture levels** (hq 1, wall 0, barracks 0) — the knob's "never seeds a Freehold" guarantee, shown live at five levels.
- **Queueing is free, building is not** (steps 4, 5, 7–10): an accepted order the village cannot pay for is stored `waiting` with **nothing deducted** and a placeholder `completesAt == startedAt` (Smithy 3→4 at 1124/1054/983, Stable 5→6 at 3550/2840/2130, Workshop 8→9 at 22 795/19 946/17 096, Rampart 10→11 at 4613/6920/2307 — all against the fixture's 1200/1000/800); an affordable order behind a running one is also `waiting`, unpaid (the Headquarters in step 4).
- **Prerequisites are judged on STANDING levels** (step 4): with a Headquarters 1→2 order sitting `waiting`, a Rampart is still refused "Requires Headquarters level 2." A queued upgrade does not count.
- **The queue limit and stacking** (step 5): nine more Farm orders behind the running one are accepted with `targetLevel` 3, 4, …, 11 (each stacks one level higher than the last, as `alreadyQueued` promises); the 11th → 409 `QUEUE_FULL` "That village is already holding 10 construction orders."; rows: 1 `queued` + 9 `waiting`, targets 2..11 in order; only the first Farm was paid.
- **Every building at its cap refuses** (steps 10, 11): at L99 all 13 buildings sit at their own caps (hq 20, timber/quarry/iron 25, farm/warehouse 30, barracks 25, wall 20, smithy 10, stable 20, workshop 15, academy 3, market 20) and all 13 orders → 409 `INVALID_COMMAND` "<Name> is already at its maximum level."; 13 stored, 0 jobs.
- **Three buildings that are not the Timber Camp complete at exactly their `completesAt`** (step 12): **Stone Quarry** 1→2 at 720 s (stone production 28 → 33/h), **Warehouse** 1→2 at 780 s (storage capacity 1464 → 1786), **Farm** 1→2 at 840 s (population capacity 232 → 269), each observed within 120 ms of its instant with the server running, each with a `construction` notification whose `createdAt` **equals** `completesAt` and a row marked `complete`.
- **A completion starts the next order at the instant it finished, not "now"** (step 12): the `waiting` Headquarters started at **exactly** the Quarry's `completesAt` for 1080 s (`buildingDurationSeconds("hq", 1, 1)`) with 140/124/109 paid then; the second Farm (target 3) started at exactly the first Farm's `completesAt` for 1008 s (`buildingDurationSeconds("farm", 2, 1)`) **at the level-2 cost** 95/84/63, with 8 orders still `waiting`.
- **The books balance across all of it** (step 12): for each of the three villages, `whole + fractional carry == baseline + production × hours − everything paid` to <1e-6 — for p1 with stone at 28/h until the Quarry's `completesAt` and 33/h after it (the accrual up to the completion instant is done at the old rate, the new rate applies from that instant), for p2 and p3 at a flat 28/h.

Does **not** prove: **the Academy's acceptance path** — at the first level where its prerequisite (Headquarters 10) is met, the same uniform knob has held the Academy at its cap of 3 since L3, so an Academy order at L3, L5, L8 and L10 is `INVALID_COMMAND` "already at its maximum level" rather than accepted; the prerequisite-satisfied Academy order stays **tests-only** (step 10 records this rather than pretending). **Completion of the nine other types** (Timber Camp done at `21b917b`; Iron Mine, Headquarters, Barracks, Rampart, Smithy, Stable, Workshop, Academy, Market never completed live — the Headquarters and the second Farm were *started* live here, not finished; the Rampart at L2 and Market at L3 were *started* on 1382 s / 2070 s timers in worlds the drill then stopped). **Offline catch-up for construction** (the redrive showed it for a recruit; every completion here happened with the server running). **Anything the Roblox client renders** (Studio). **Whether the numbers are right** — costs, caps, prerequisites and timers are certified as *the coded numbers running*, not as good design. Does not touch any real world: DB paths are absolute `mkdtemp` files under `/tmp`, the key is a throwaway literal, ports are 4251–4257, inherited `KINGSAGE_*` env is stripped before the seed knob is set per world.

Two observations recorded and **not judged**: (1) the `/api/roblox/state` snapshot's `constructionJobs` lists `status = 'queued'` rows only, so a `waiting` order — free, stored, and acknowledged with `command.accepted` — is **invisible to the client** until it starts (matrix C3 already says client queue detail is PARTIAL); (2) the `command.accepted` payload for a `waiting` order carries the placeholder `completesAt == startedAt`, which a client that trusts the payload would read as an instantly-finished job.

## How to rerun

```bash
node scripts/c2-building-ladder-drill.mjs                                   # expect exit 0, "C2 building ladder drill PASS (12/12 steps PASS)", ~14 min
LADDER_SKIP_COMPLETION_WAIT=1 node scripts/c2-building-ladder-drill.mjs     # steps 1–11 in ~5 s; step 12 reports SKIPPED, not claimed
LADDER_PORT=4251 node scripts/c2-building-ladder-drill.mjs                  # L1 on 4251, rungs L2/L3/L5/L8/L10/L99 on 4252–4257
```

Needs Node 22 and the `sqlite3` CLI. The scratch directory is removed on PASS and kept (path printed) on FAIL. Expected prerequisite messages and caps are literals at the top of the script; cost/duration/production/storage numbers are imported from `packages/game-core/src/economy.ts` (the drill re-execs itself under `--experimental-strip-types` for that). If someone changes a prerequisite, a cap or the queue limit, the drill fails on the message or the count — which is the point.

## Step table

| Step | World | What it drives | Result | Key evidence |
|---|---|---|---|---|
| 1 | L1 | Fresh world at fixture levels; p1/p2/p3 linked | **PASS** | health 200; levels hq/timber/quarry/iron/farm/warehouse/barracks/wall 1, rest 0; storage 1464, population cap 232, 28/h each |
| 2 | L1 | **Six prerequisite refusals at standing level 1** + unknown type; stored, nothing built, replay | **PASS** | 6 × 409 `PREREQUISITE_MISSING` with the exact "Requires … level N."; castle → 409 `INVALID_COMMAND`; inbox 7, jobs 0, resources/version unchanged; Academy replay byte-identical |
| 3 | L1 | Quarry (p1), Warehouse (p2), Farm (p3) accepted at level-1 cost with their own timers | **PASS** | 98/75/60 · 720 s; 87/73/58 · 780 s; 65/58/44 · 840 s — all deducted, all `queued` |
| 4 | L1 | **Standing vs queued**: HQ order `waiting` unpaid; Rampart still refused | **PASS** | hq row `waiting`, placeholder `completesAt == startedAt`, not in snapshot; Rampart → "Requires Headquarters level 2." |
| 5 | L1 | **Queue limit** 10 and level stacking | **PASS** | Farm #2–#10 accepted, targets 3..11; #11 → 409 `QUEUE_FULL`; 1 queued + 9 waiting; only the first paid |
| 6 | L2 | Rampart opens; five still gated; Freeholds untouched | **PASS** | Rampart 2→3 paid 180/270/90, timer 1382 s; Smithy/Market → HQ 3, Stable → Barracks 5, Workshop → HQ 8, Academy → HQ 10 |
| 7 | L3 | Smithy and Market open | **PASS** | Smithy 3→4 accepted but `waiting` unpaid (1124/1054/983); Market 3→4 paid 810/713/486, timer 2070 s; Stable → Barracks 5; Workshop → HQ 8; Academy already at cap 3 |
| 8 | L5 | Stable opens | **PASS** | Stable 5→6 accepted, `waiting` unpaid (3550/2840/2130); Workshop → HQ 8; Academy at cap |
| 9 | L8 | Workshop opens | **PASS** | Workshop 8→9 accepted, `waiting` unpaid (22 795/19 946/17 096); Academy at cap |
| 10 | L10 | HQ 10 reached — Academy and Smithy already capped by the knob | **PASS** | Academy → `INVALID_COMMAND` "already at its maximum level."; Smithy likewise; Rampart 10→11 accepted `waiting`. **Academy acceptance NOT claimed** |
| 11 | L99 | Every building at its cap | **PASS** | 13 × 409 `INVALID_COMMAND`; levels = every cap; inbox 13, jobs 0 |
| 12 | L1 | **Three real-clock completions + two chained starts + reconciliation** | **PASS** | Quarry at `06:21:34.571Z` (stone 33/h; HQ started that instant, 1080 s, 140/124/109 paid); Warehouse at `06:22:34.592Z` (storage 1786); Farm at `06:23:34.612Z` (pop cap 269; Farm→3 started that instant, 1008 s, 95/84/63 paid); notifications at `completesAt`; p1/p2/p3 whole + carry match to <1e-6 |

## Gate sanity at this tip (same session, cloud image)

| Gate | Result |
|---|---|
| `npm run check:types` | **clean** (after `npm install` at root for `@types/node` and a `--no-save` `typescript@7.0.2` into `mobile-rebuild/` — the image ships neither; nothing committed) |
| `npm run test:core` | **92/92, 0 fail** |
| `npm run test:server` | **114/114, 0 fail, 0 skipped** with Lune 0.10.5 on `PATH` (downloaded to `/tmp`) |
| `npm run test:luau` | 31 files syntax-clean · **72 rules, 0 failed** · 7 spike-sim checks, 0 failed |

No `server/`, `packages/`, or `roblox/` code changed on this branch; the gates are sanity, not a claim of new coverage.

## Honesty notes

- **The first smoke run (skip mode) failed at step 7 on a counting mistake of mine**, not the server's: a rung orders only the gates that open at that rung plus the still-refused buildings, but the inbox check expected all six gated buildings. The oracle itself was already right about something I had not planned for — at L3 the Academy is `INVALID_COMMAND` "already at its maximum level", because the uniform knob holds it at its cap of 3 from L3 on — and the server agreed. The count was fixed, the step-10 wording was corrected from "clamped at L10" to "held at its cap since L3", the skip-mode run passed 11/11 (+1 SKIPPED), and the script was committed. **The recorded run below is the first full run of the committed script** (step 12 had never executed before it).
- **The dev seed knob is a stimulus, not a shortcut past the rule under test.** It sets *standing levels*; the prerequisite check, the max-level check, the cost, the timer and the queue are all the production code path, run over HTTP against those levels. The drill also checks the knob's own stated limits (Freeholds and starting resources untouched). The one thing the knob cannot do — show the Academy accepted — is recorded as NOT claimed rather than worked around.
- **"Accepted but waiting unpaid" is a PASS against the code as written**, not a judgement that it is right: `queueConstructionCore` charges when a job *starts* (Adam's rule, per the source comment), so an order the village can never afford at the fixture's resources is accepted and parked. Whether a 22 795-wood Workshop order should be *acceptable* at 1200 wood is a design question this drill does not answer.
- **Step 12's reconciliation re-reads a village's row if the read straddles an accrual write** (`drainConstructionQueues` runs two UPDATEs outside a transaction every 500 ms for villages with waiting orders). The log prints a line whenever that happens; in the recorded run it never did — every reconciliation matched on the first read.
- Costs are `base × factor^currentLevel` (a level-1 Quarry costs 98/75/60, not the 65/50/40 base), consistent with the re-drive's timber 75/90/60. The world-server prints `Persistent local database:` un-prefixed once per world because both banner lines arrive in one stdout chunk; cosmetic, as in the earlier drills.
- Model of record: Claude Fable 5.1 (cloud). No secrets: the key is a throwaway literal, never reused. The two `ExperimentalWarning` lines Node prints before the drill's own header are omitted from the record below; nothing else is.

## Run record — recorded drill (exit 0)

Verbatim output of `node scripts/c2-building-ladder-drill.mjs` at `11f14d6`. UUIDs are per-run and disposable. The `#3–#9 not printed` and `13 refusals:` lines are the drill's own summaries of requests it chose not to echo in full.

```text
# C2 — the building ladder over HTTP (current tip)
date: 2026-09-20T06:09:34.176Z
sha: 11f14d6
node: v22.14.0
sqlite3: 3.45.1 2024-01-30 16:01:20 e876e51a0ed5c5b3126f52e532044363a014bc594cfefa87ffb5b82257ccalt1 (64-bit)
scratch: /tmp/kingsmarch-ladder-VVZNYX
ports: L1=4251 (fixture levels, completions) rungs L2..L99=4252..4257

## Step 1 — world L1 — fresh disposable world at fixture levels; three players linked; the snapshot's economy equals the formulas at those levels
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-ladder-VVZNYX/ladder-l1.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_BIND=127.0.0.1 PORT=4251 node --experimental-strip-types src/index.ts &)
  [server:4251] KingSage shared world listening at http://127.0.0.1:4251/?world=shared
Persistent local database: /tmp/kingsmarch-ladder-VVZNYX/ladder-l1.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":950001,"displayName":"Ladder One"} -> 200 {"playerId":"player-480c687a-2224-4673-bbbe-9e28505b36db","kingdomId":"kingdom-1","created":true,"contractVersion":1}
POST /api/roblox/session {"robloxUserId":950002,"displayName":"Ladder Two"} -> 200 {"playerId":"player-f06d7007-6430-4d7c-b3a1-a99eec89c6f9","kingdomId":"kingdom-2","created":true,"contractVersion":1}
POST /api/roblox/session {"robloxUserId":950003,"displayName":"Ladder Three"} -> 200 {"playerId":"player-c39acbb7-9ee1-49c3-a27b-848f543982eb","kingdomId":"kingdom-3","created":true,"contractVersion":1}
p1: player-480c687a-2224-4673-bbbe-9e28505b36db / kingdom-1 / village-1-capital
p2: player-f06d7007-6430-4d7c-b3a1-a99eec89c6f9 / kingdom-2 / village-2-capital
p3: player-c39acbb7-9ee1-49c3-a27b-848f543982eb / kingdom-3 / village-3-capital
p1 buildings: {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}; resources {"wood":1200,"stone":1000,"iron":800}
p1 villageEconomy: {"villageId":"village-1-capital","productionPerHour":{"wood":28,"stone":28,"iron":28},"storageCapacity":1464,"populationUsed":0,"populationCapacity":232}
[step 1] PASS — health 200; p1/p2/p3 linked to kingdom-1/kingdom-2/kingdom-3; buildings {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}; storage 1464, population cap 232, production {"wood":28,"stone":28,"iron":28}/h — the formulas at level 1

## Step 2 — world L1 — every gated building at STANDING level 1 is refused with the exact missing prerequisite; an unknown building type is INVALID_COMMAND; all seven stored, nothing built, nothing charged, world version unchanged; replay byte-identical
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:09:34.442Z|{"wood":0.0004822222222222222,"stone":0.0004822222222222222,"iron":0.0004822222222222222}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950001,"commandId":"ladder-l1-wall","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l1-wall","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 2.","currentWorldVersion":3}}
POST /api/roblox/commands {"robloxUserId":950001,"commandId":"ladder-l1-smithy","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"smithy"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l1-smithy","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 3.","currentWorldVersion":3}}
POST /api/roblox/commands {"robloxUserId":950001,"commandId":"ladder-l1-market","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"market"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l1-market","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 3.","currentWorldVersion":3}}
POST /api/roblox/commands {"robloxUserId":950001,"commandId":"ladder-l1-stable","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"stable"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l1-stable","code":"PREREQUISITE_MISSING","message":"Requires Barracks level 5.","currentWorldVersion":3}}
POST /api/roblox/commands {"robloxUserId":950001,"commandId":"ladder-l1-workshop","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"workshop"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l1-workshop","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 8.","currentWorldVersion":3}}
POST /api/roblox/commands {"robloxUserId":950001,"commandId":"ladder-l1-academy","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"academy"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l1-academy","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 10.","currentWorldVersion":3}}
POST /api/roblox/commands {"robloxUserId":950001,"commandId":"ladder-l1-castle","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"castle"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l1-castle","code":"INVALID_COMMAND","message":"Unknown building type.","currentWorldVersion":3}}
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  7
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_construction_jobs;"
  0
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:09:34.536Z|{"wood":0.001213333333333333,"stone":0.001213333333333333,"iron":0.001213333333333333}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950001,"commandId":"ladder-l1-academy","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"academy"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l1-academy","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 10.","currentWorldVersion":3}}
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  7
  -> exit 0
[step 2] PASS — Rampart → "Requires Headquarters level 2."; Smithy → "Requires Headquarters level 3."; Market → "Requires Headquarters level 3."; Stable → "Requires Barracks level 5."; Workshop → "Requires Headquarters level 8."; Academy → "Requires Headquarters level 10."; castle → 409 INVALID_COMMAND "Unknown building type."; inbox 7 rows, 0 jobs, resources {"wood":1200,"stone":1000,"iron":800} unchanged, world version 3 unchanged; Academy refusal replayed byte-identically

## Step 3 — world L1 — three buildings that are not the Timber Camp: Stone Quarry (p1), Warehouse (p2), Farm (p3) — each accepted at its exact level-1 cost with its own server timer
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:09:34.552Z|{"wood":0.0013377777777777774,"stone":0.0013377777777777774,"iron":0.0013377777777777774}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950001,"commandId":"ladder-l1-p1-quarry","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"quarry"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"ladder-l1-p1-quarry","worldVersion":4,"constructionJob":{"id":"construction-9d069320-5907-4aae-9069-36b99848b10d","villageId":"village-1-capital","building":"quarry","targetLevel":2,"startedAt":"2026-09-20T06:09:34.571Z","completesAt":"2026-09-20T06:21:34.571Z"}}}
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1102,"stone":925,"iron":740}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:09:34.568Z|{"wood":0.0014622222222222217,"stone":0.0014622222222222217,"iron":0.0014622222222222217}
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-1-capital' ORDER BY rowid;"
  construction-9d069320-5907-4aae-9069-36b99848b10d|quarry|2|queued|2026-09-20T06:09:34.571Z|2026-09-20T06:21:34.571Z
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-2-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:09:34.568Z|{"wood":0.0014622222222222217,"stone":0.0014622222222222217,"iron":0.0014622222222222217}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950002,"commandId":"ladder-l1-p2-warehouse","expectedWorldVersion":4,"command":{"type":"village.build.queue","payload":{"villageId":"village-2-capital","building":"warehouse"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"ladder-l1-p2-warehouse","worldVersion":5,"constructionJob":{"id":"construction-45956cec-7e54-427d-8abe-61a45a5d456f","villageId":"village-2-capital","building":"warehouse","targetLevel":2,"startedAt":"2026-09-20T06:09:34.592Z","completesAt":"2026-09-20T06:22:34.592Z"}}}
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-2-capital';"
  {"wood":1113,"stone":927,"iron":742}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:09:34.587Z|{"wood":0.0016099999999999995,"stone":0.0016099999999999995,"iron":0.0016099999999999995}
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-2-capital' ORDER BY rowid;"
  construction-45956cec-7e54-427d-8abe-61a45a5d456f|warehouse|2|queued|2026-09-20T06:09:34.592Z|2026-09-20T06:22:34.592Z
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-3-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:09:34.587Z|{"wood":0.0016099999999999995,"stone":0.0016099999999999995,"iron":0.0016099999999999995}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950003,"commandId":"ladder-l1-p3-farm","expectedWorldVersion":5,"command":{"type":"village.build.queue","payload":{"villageId":"village-3-capital","building":"farm"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"ladder-l1-p3-farm","worldVersion":6,"constructionJob":{"id":"construction-4f7a3e08-eca4-456e-85e2-f681778459ec","villageId":"village-3-capital","building":"farm","targetLevel":2,"startedAt":"2026-09-20T06:09:34.612Z","completesAt":"2026-09-20T06:23:34.612Z"}}}
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-3-capital';"
  {"wood":1135,"stone":942,"iron":756}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:09:34.609Z|{"wood":0.0017811111111111105,"stone":0.0017811111111111105,"iron":0.0017811111111111105}
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-3-capital' ORDER BY rowid;"
  construction-4f7a3e08-eca4-456e-85e2-f681778459ec|farm|2|queued|2026-09-20T06:09:34.612Z|2026-09-20T06:23:34.612Z
  -> exit 0
[step 3] PASS — Stone Quarry (p1) cost {"wood":98,"stone":75,"iron":60} timer 720s completesAt 2026-09-20T06:21:34.571Z; Warehouse (p2) cost {"wood":87,"stone":73,"iron":58} timer 780s completesAt 2026-09-20T06:22:34.592Z; Farm (p3) cost {"wood":65,"stone":58,"iron":44} timer 840s completesAt 2026-09-20T06:23:34.612Z

## Step 4 — world L1 — prerequisites are judged on STANDING levels: p1 queues a Headquarters upgrade (parked 'waiting' behind the Quarry, unpaid, absent from the snapshot's constructionJobs), and a Rampart is still refused 'Requires Headquarters level 2.'
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1102,"stone":925,"iron":740}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:09:34.609Z|{"wood":0.0017811111111111105,"stone":0.0017811111111111105,"iron":0.0017811111111111105}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950001,"commandId":"ladder-l1-p1-hq","expectedWorldVersion":6,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"hq"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"ladder-l1-p1-hq","worldVersion":7,"constructionJob":{"id":"construction-fca3748a-b8ea-478a-9e5f-969d00f59dd7","villageId":"village-1-capital","building":"hq","targetLevel":2,"startedAt":"2026-09-20T06:09:34.632Z","completesAt":"2026-09-20T06:09:34.632Z"}}}
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-1-capital' ORDER BY rowid;"
  construction-9d069320-5907-4aae-9069-36b99848b10d|quarry|2|queued|2026-09-20T06:09:34.571Z|2026-09-20T06:21:34.571Z
  construction-fca3748a-b8ea-478a-9e5f-969d00f59dd7|hq|2|waiting|2026-09-20T06:09:34.632Z|2026-09-20T06:09:34.632Z
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1102,"stone":925,"iron":740}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:09:34.627Z|{"wood":0.0019211111111111104,"stone":0.0019211111111111104,"iron":0.0019211111111111104}
  -> exit 0
POST /api/roblox/state {"robloxUserIds":[950001]} -> 200 (13693 bytes; states: 950001)
snapshot constructionJobs for p1: ["quarry→2"] (the 'waiting' Headquarters is not listed — the snapshot query selects status = 'queued' only; recorded, not judged)
POST /api/roblox/commands {"robloxUserId":950001,"commandId":"ladder-l1-wall-hq-queued","expectedWorldVersion":7,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l1-wall-hq-queued","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 2.","currentWorldVersion":7}}
[step 4] PASS — hq order accepted → target 2, row 'waiting' behind the queued Quarry, placeholder completesAt == startedAt, nothing deducted ({"wood":1102,"stone":925,"iron":740}), not in the snapshot's constructionJobs; standing hq still 1; Rampart → 409 PREREQUISITE_MISSING "Requires Headquarters level 2."

## Step 5 — world L1 — the queue limit: p3 stacks Farm orders behind the running one until the village holds 10; each stacks one level higher; only the first was paid; the 11th is 409 QUEUE_FULL
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-3-capital';"
  {"wood":1135,"stone":942,"iron":756}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:09:34.662Z|{"wood":0.0021933333333333327,"stone":0.0021933333333333327,"iron":0.0021933333333333327}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950003,"commandId":"ladder-l1-p3-farm-02","expectedWorldVersion":7,"command":{"type":"village.build.queue","payload":{"villageId":"village-3-capital","building":"farm"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"ladder-l1-p3-farm-02","worldVersion":8,"constructionJob":{"id":"construction-84b22f61-118b-40c4-840f-ff919a2c5a8b","villageId":"village-3-capital","building":"farm","targetLevel":3,"startedAt":"2026-09-20T06:09:34.694Z","completesAt":"2026-09-20T06:09:34.694Z"}}}
POST /api/roblox/commands {"robloxUserId":950003,"commandId":"ladder-l1-p3-farm-10","expectedWorldVersion":15,"command":{"type":"village.build.queue","payload":{"villageId":"village-3-capital","building":"farm"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"ladder-l1-p3-farm-10","worldVersion":16,"constructionJob":{"id":"construction-bc14676c-6b9b-4e7b-a68f-71ba3fdea241","villageId":"village-3-capital","building":"farm","targetLevel":11,"startedAt":"2026-09-20T06:09:34.865Z","completesAt":"2026-09-20T06:09:34.865Z"}}}
farm orders #2–#10 accepted with targetLevel 3, 4, 5, 6, 7, 8, 9, 10, 11 (#3–#9 not printed)
POST /api/roblox/commands {"robloxUserId":950003,"commandId":"ladder-l1-p3-farm-11","expectedWorldVersion":16,"command":{"type":"village.build.queue","payload":{"villageId":"village-3-capital","building":"farm"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l1-p3-farm-11","code":"QUEUE_FULL","message":"That village is already holding 10 construction orders.","currentWorldVersion":16}}
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-3-capital' ORDER BY rowid;"
  construction-4f7a3e08-eca4-456e-85e2-f681778459ec|farm|2|queued|2026-09-20T06:09:34.612Z|2026-09-20T06:23:34.612Z
  construction-84b22f61-118b-40c4-840f-ff919a2c5a8b|farm|3|waiting|2026-09-20T06:09:34.694Z|2026-09-20T06:09:34.694Z
  construction-5e551226-5b8e-4ea9-aa3a-6c5084a0fd44|farm|4|waiting|2026-09-20T06:09:34.718Z|2026-09-20T06:09:34.718Z
  construction-c7dc8eb7-724e-49c1-8edc-60c830998d05|farm|5|waiting|2026-09-20T06:09:34.733Z|2026-09-20T06:09:34.733Z
  construction-84368b73-4f0a-4e1e-9b6d-343ac172f79a|farm|6|waiting|2026-09-20T06:09:34.755Z|2026-09-20T06:09:34.755Z
  construction-b7716956-be33-49c0-92bd-c76453144c4a|farm|7|waiting|2026-09-20T06:09:34.782Z|2026-09-20T06:09:34.782Z
  construction-e737c4be-5358-492b-bebc-7504d704c87d|farm|8|waiting|2026-09-20T06:09:34.806Z|2026-09-20T06:09:34.806Z
  construction-2913a505-1cd0-40c5-83c9-2b5cc3754be8|farm|9|waiting|2026-09-20T06:09:34.829Z|2026-09-20T06:09:34.829Z
  construction-1bf6842d-d2d5-4a11-86bb-299e5399e670|farm|10|waiting|2026-09-20T06:09:34.847Z|2026-09-20T06:09:34.847Z
  construction-bc14676c-6b9b-4e7b-a68f-71ba3fdea241|farm|11|waiting|2026-09-20T06:09:34.865Z|2026-09-20T06:09:34.865Z
  -> exit 0
p3 job rows: farm→2 queued, farm→3 waiting, farm→4 waiting, farm→5 waiting, farm→6 waiting, farm→7 waiting, farm→8 waiting, farm→9 waiting, farm→10 waiting, farm→11 waiting
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-3-capital';"
  {"wood":1135,"stone":942,"iron":756}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:09:34.886Z|{"wood":0.003935555555555558,"stone":0.003935555555555558,"iron":0.003935555555555558}
  -> exit 0
[step 5] PASS — 9 more Farm orders accepted, targets 3..11; #11 → 409 QUEUE_FULL "That village is already holding 10 construction orders."; rows: 1 queued + 9 waiting, targets 2..11 in order; resources {"wood":1135,"stone":942,"iron":756} unchanged since the first Farm was paid

## Step 6 — world L2 — KINGSAGE_DEV_SEED_LEVEL=2: Rampart accepted (gate opens at this rung); Smithy → PREREQUISITE_MISSING "Requires Headquarters level 3."; Market → PREREQUISITE_MISSING "Requires Headquarters level 3."; Stable → PREREQUISITE_MISSING "Requires Barracks level 5."; Workshop → PREREQUISITE_MISSING "Requires Headquarters level 8."; Academy → PREREQUISITE_MISSING "Requires Headquarters level 10."; Freeholds untouched
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-ladder-VVZNYX/ladder-l2.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_DEV_SEED_LEVEL=2 KINGSAGE_BIND=127.0.0.1 PORT=4252 node --experimental-strip-types src/index.ts &)
  [server:4252] KingSage shared world listening at http://127.0.0.1:4252/?world=shared
Persistent local database: /tmp/kingsmarch-ladder-VVZNYX/ladder-l2.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":950021,"displayName":"Ladder 2 A"} -> 200 {"playerId":"player-8514374a-53c3-46e5-a2ec-66e19c91eb5d","kingdomId":"kingdom-1","created":true,"contractVersion":1}
POST /api/roblox/session {"robloxUserId":950022,"displayName":"Ladder 2 B"} -> 200 {"playerId":"player-a4c90d23-dac4-4804-ae3c-21c8914bc560","kingdomId":"kingdom-2","created":true,"contractVersion":1}
seeded levels (player a): {"hq":2,"timber":2,"quarry":2,"iron":2,"farm":2,"warehouse":2,"barracks":2,"wall":2,"academy":2,"stable":2,"workshop":2,"smithy":2,"market":2}
$ sqlite3 <db> "SELECT v.buildings_json FROM local_villages v JOIN local_kingdoms k ON k.id = v.kingdom_id WHERE k.seat_kind = 'freehold' ORDER BY v.id;"
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  0
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950021,"commandId":"ladder-l2-smithy","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"smithy"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l2-smithy","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 3.","currentWorldVersion":2}}
POST /api/roblox/commands {"robloxUserId":950021,"commandId":"ladder-l2-market","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"market"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l2-market","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 3.","currentWorldVersion":2}}
POST /api/roblox/commands {"robloxUserId":950021,"commandId":"ladder-l2-stable","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"stable"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l2-stable","code":"PREREQUISITE_MISSING","message":"Requires Barracks level 5.","currentWorldVersion":2}}
POST /api/roblox/commands {"robloxUserId":950021,"commandId":"ladder-l2-workshop","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"workshop"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l2-workshop","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 8.","currentWorldVersion":2}}
POST /api/roblox/commands {"robloxUserId":950021,"commandId":"ladder-l2-academy","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"academy"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l2-academy","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 10.","currentWorldVersion":2}}
$ sqlite3 <db> "SELECT count(*) FROM local_construction_jobs;"
  0
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":2,"timber":2,"quarry":2,"iron":2,"farm":2,"warehouse":2,"barracks":2,"wall":2,"academy":2,"stable":2,"workshop":2,"smithy":2,"market":2}|2026-09-20T06:09:35.394Z|{"wood":0.002740833333333333,"stone":0.002740833333333333,"iron":0.002740833333333333}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950021,"commandId":"ladder-l2-wall","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"ladder-l2-wall","worldVersion":3,"constructionJob":{"id":"construction-1465205b-d6da-4b3b-9967-e47040d78aa4","villageId":"village-1-capital","building":"wall","targetLevel":3,"startedAt":"2026-09-20T06:09:35.412Z","completesAt":"2026-09-20T06:32:37.412Z"}}}
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-1-capital' ORDER BY rowid;"
  construction-1465205b-d6da-4b3b-9967-e47040d78aa4|wall|3|queued|2026-09-20T06:09:35.412Z|2026-09-20T06:32:37.412Z
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1020,"stone":730,"iron":710}|{"hq":2,"timber":2,"quarry":2,"iron":2,"farm":2,"warehouse":2,"barracks":2,"wall":2,"academy":2,"stable":2,"workshop":2,"smithy":2,"market":2}|2026-09-20T06:09:35.407Z|{"wood":0.0028599999999999997,"stone":0.0028599999999999997,"iron":0.0028599999999999997}
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  6
  -> exit 0
$ kill -TERM <world L2 server pid 3388>
  -> world L2 server exited (code 0, signal null) at 2026-09-20T06:09:35.436Z
[step 6] PASS — levels = min(2, cap) for all 13, resources untouched, 4 Freeholds still at fixture levels; Smithy → 409 PREREQUISITE_MISSING "Requires Headquarters level 3."; Market → 409 PREREQUISITE_MISSING "Requires Headquarters level 3."; Stable → 409 PREREQUISITE_MISSING "Requires Barracks level 5."; Workshop → 409 PREREQUISITE_MISSING "Requires Headquarters level 8."; Academy → 409 PREREQUISITE_MISSING "Requires Headquarters level 10."; Rampart → accepted 2→3, queued, cost {"wood":180,"stone":270,"iron":90} deducted, timer 1382s; 6 inbox rows

## Step 7 — world L3 — KINGSAGE_DEV_SEED_LEVEL=3: Smithy and Market accepted (gate opens at this rung); Stable → PREREQUISITE_MISSING "Requires Barracks level 5."; Workshop → PREREQUISITE_MISSING "Requires Headquarters level 8."; Academy → INVALID_COMMAND "Academy is already at its maximum level."; Freeholds untouched
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-ladder-VVZNYX/ladder-l3.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_DEV_SEED_LEVEL=3 KINGSAGE_BIND=127.0.0.1 PORT=4253 node --experimental-strip-types src/index.ts &)
  [server:4253] KingSage shared world listening at http://127.0.0.1:4253/?world=shared
Persistent local database: /tmp/kingsmarch-ladder-VVZNYX/ladder-l3.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":950031,"displayName":"Ladder 3 A"} -> 200 {"playerId":"player-04f688ca-879c-48e7-b51a-955425d33d95","kingdomId":"kingdom-1","created":true,"contractVersion":1}
POST /api/roblox/session {"robloxUserId":950032,"displayName":"Ladder 3 B"} -> 200 {"playerId":"player-4b174c42-84e7-4bd6-83e1-4dbea9bee15d","kingdomId":"kingdom-2","created":true,"contractVersion":1}
seeded levels (player a): {"hq":3,"timber":3,"quarry":3,"iron":3,"farm":3,"warehouse":3,"barracks":3,"wall":3,"academy":3,"stable":3,"workshop":3,"smithy":3,"market":3}
$ sqlite3 <db> "SELECT v.buildings_json FROM local_villages v JOIN local_kingdoms k ON k.id = v.kingdom_id WHERE k.seat_kind = 'freehold' ORDER BY v.id;"
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  0
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950031,"commandId":"ladder-l3-stable","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"stable"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l3-stable","code":"PREREQUISITE_MISSING","message":"Requires Barracks level 5.","currentWorldVersion":2}}
POST /api/roblox/commands {"robloxUserId":950031,"commandId":"ladder-l3-workshop","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"workshop"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l3-workshop","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 8.","currentWorldVersion":2}}
POST /api/roblox/commands {"robloxUserId":950031,"commandId":"ladder-l3-academy","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"academy"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l3-academy","code":"INVALID_COMMAND","message":"Academy is already at its maximum level.","currentWorldVersion":2}}
$ sqlite3 <db> "SELECT count(*) FROM local_construction_jobs;"
  0
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":3,"timber":3,"quarry":3,"iron":3,"farm":3,"warehouse":3,"barracks":3,"wall":3,"academy":3,"stable":3,"workshop":3,"smithy":3,"market":3}|2026-09-20T06:09:35.912Z|{"wood":0.0025016666666666664,"stone":0.0025016666666666664,"iron":0.0025016666666666664}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950031,"commandId":"ladder-l3-smithy","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"smithy"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"ladder-l3-smithy","worldVersion":3,"constructionJob":{"id":"construction-0a33529f-c1a9-413e-8ab3-766d943e3279","villageId":"village-1-capital","building":"smithy","targetLevel":4,"startedAt":"2026-09-20T06:09:35.932Z","completesAt":"2026-09-20T06:09:35.932Z"}}}
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-1-capital' ORDER BY rowid;"
  construction-0a33529f-c1a9-413e-8ab3-766d943e3279|smithy|4|waiting|2026-09-20T06:09:35.932Z|2026-09-20T06:09:35.932Z
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":3,"timber":3,"quarry":3,"iron":3,"farm":3,"warehouse":3,"barracks":3,"wall":3,"academy":3,"stable":3,"workshop":3,"smithy":3,"market":3}|2026-09-20T06:09:35.929Z|{"wood":0.0026811111111111107,"stone":0.0026811111111111107,"iron":0.0026811111111111107}
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-2-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":3,"timber":3,"quarry":3,"iron":3,"farm":3,"warehouse":3,"barracks":3,"wall":3,"academy":3,"stable":3,"workshop":3,"smithy":3,"market":3}|2026-09-20T06:09:35.929Z|{"wood":0.0026811111111111107,"stone":0.0026811111111111107,"iron":0.0026811111111111107}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950032,"commandId":"ladder-l3-market","expectedWorldVersion":3,"command":{"type":"village.build.queue","payload":{"villageId":"village-2-capital","building":"market"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"ladder-l3-market","worldVersion":4,"constructionJob":{"id":"construction-c3bfa020-60bd-4387-a411-5b0205822404","villageId":"village-2-capital","building":"market","targetLevel":4,"startedAt":"2026-09-20T06:09:35.980Z","completesAt":"2026-09-20T06:44:05.980Z"}}}
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-2-capital' ORDER BY rowid;"
  construction-c3bfa020-60bd-4387-a411-5b0205822404|market|4|queued|2026-09-20T06:09:35.980Z|2026-09-20T06:44:05.980Z
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-2-capital';"
  {"wood":390,"stone":287,"iron":314}|{"hq":3,"timber":3,"quarry":3,"iron":3,"farm":3,"warehouse":3,"barracks":3,"wall":3,"academy":3,"stable":3,"workshop":3,"smithy":3,"market":3}|2026-09-20T06:09:35.962Z|{"wood":0.003029444444444444,"stone":0.003029444444444444,"iron":0.003029444444444444}
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  5
  -> exit 0
$ kill -TERM <world L3 server pid 3406>
  -> world L3 server exited (code 0, signal null) at 2026-09-20T06:09:36.005Z
[step 7] PASS — levels = min(3, cap) for all 13, resources untouched, 4 Freeholds still at fixture levels; Stable → 409 PREREQUISITE_MISSING "Requires Barracks level 5."; Workshop → 409 PREREQUISITE_MISSING "Requires Headquarters level 8."; Academy → 409 INVALID_COMMAND "Academy is already at its maximum level."; Smithy → accepted 3→4 but WAITING unpaid (cost {"wood":1124,"stone":1054,"iron":983} exceeds {"wood":1200,"stone":1000,"iron":800}; nothing deducted); Market → accepted 3→4, queued, cost {"wood":810,"stone":713,"iron":486} deducted, timer 2070s; 5 inbox rows

## Step 8 — world L5 — KINGSAGE_DEV_SEED_LEVEL=5: Stable accepted (gate opens at this rung); Workshop → PREREQUISITE_MISSING "Requires Headquarters level 8."; Academy → INVALID_COMMAND "Academy is already at its maximum level."; Freeholds untouched
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-ladder-VVZNYX/ladder-l5.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_DEV_SEED_LEVEL=5 KINGSAGE_BIND=127.0.0.1 PORT=4254 node --experimental-strip-types src/index.ts &)
  [server:4254] KingSage shared world listening at http://127.0.0.1:4254/?world=shared
Persistent local database: /tmp/kingsmarch-ladder-VVZNYX/ladder-l5.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":950051,"displayName":"Ladder 5 A"} -> 200 {"playerId":"player-68e46b97-f3f6-48cf-ac10-836e1f7ca066","kingdomId":"kingdom-1","created":true,"contractVersion":1}
POST /api/roblox/session {"robloxUserId":950052,"displayName":"Ladder 5 B"} -> 200 {"playerId":"player-910a3bdb-c092-4f6e-a0f5-811138d27d24","kingdomId":"kingdom-2","created":true,"contractVersion":1}
seeded levels (player a): {"hq":5,"timber":5,"quarry":5,"iron":5,"farm":5,"warehouse":5,"barracks":5,"wall":5,"academy":3,"stable":5,"workshop":5,"smithy":5,"market":5}
$ sqlite3 <db> "SELECT v.buildings_json FROM local_villages v JOIN local_kingdoms k ON k.id = v.kingdom_id WHERE k.seat_kind = 'freehold' ORDER BY v.id;"
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  0
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950051,"commandId":"ladder-l5-workshop","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"workshop"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l5-workshop","code":"PREREQUISITE_MISSING","message":"Requires Headquarters level 8.","currentWorldVersion":2}}
POST /api/roblox/commands {"robloxUserId":950051,"commandId":"ladder-l5-academy","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"academy"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l5-academy","code":"INVALID_COMMAND","message":"Academy is already at its maximum level.","currentWorldVersion":2}}
$ sqlite3 <db> "SELECT count(*) FROM local_construction_jobs;"
  0
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":5,"timber":5,"quarry":5,"iron":5,"farm":5,"warehouse":5,"barracks":5,"wall":5,"academy":3,"stable":5,"workshop":5,"smithy":5,"market":5}|2026-09-20T06:09:36.464Z|{"wood":0.0032355555555555558,"stone":0.0032355555555555558,"iron":0.0032355555555555558}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950051,"commandId":"ladder-l5-stable","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"stable"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"ladder-l5-stable","worldVersion":3,"constructionJob":{"id":"construction-a7c61bbc-d60a-44e4-9d4f-1fbffd187ae4","villageId":"village-1-capital","building":"stable","targetLevel":6,"startedAt":"2026-09-20T06:09:36.486Z","completesAt":"2026-09-20T06:09:36.486Z"}}}
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-1-capital' ORDER BY rowid;"
  construction-a7c61bbc-d60a-44e4-9d4f-1fbffd187ae4|stable|6|waiting|2026-09-20T06:09:36.486Z|2026-09-20T06:09:36.486Z
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":5,"timber":5,"quarry":5,"iron":5,"farm":5,"warehouse":5,"barracks":5,"wall":5,"academy":3,"stable":5,"workshop":5,"smithy":5,"market":5}|2026-09-20T06:09:36.483Z|{"wood":0.0035100000000000005,"stone":0.0035100000000000005,"iron":0.0035100000000000005}
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  3
  -> exit 0
$ kill -TERM <world L5 server pid 3427>
  -> world L5 server exited (code 0, signal null) at 2026-09-20T06:09:36.507Z
[step 8] PASS — levels = min(5, cap) for all 13, resources untouched, 4 Freeholds still at fixture levels; Workshop → 409 PREREQUISITE_MISSING "Requires Headquarters level 8."; Academy → 409 INVALID_COMMAND "Academy is already at its maximum level."; Stable → accepted 5→6 but WAITING unpaid (cost {"wood":3550,"stone":2840,"iron":2130} exceeds {"wood":1200,"stone":1000,"iron":800}; nothing deducted); 3 inbox rows

## Step 9 — world L8 — KINGSAGE_DEV_SEED_LEVEL=8: Workshop accepted (gate opens at this rung); Academy → INVALID_COMMAND "Academy is already at its maximum level."; Freeholds untouched
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-ladder-VVZNYX/ladder-l8.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_DEV_SEED_LEVEL=8 KINGSAGE_BIND=127.0.0.1 PORT=4255 node --experimental-strip-types src/index.ts &)
  [server:4255] KingSage shared world listening at http://127.0.0.1:4255/?world=shared
Persistent local database: /tmp/kingsmarch-ladder-VVZNYX/ladder-l8.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":950081,"displayName":"Ladder 8 A"} -> 200 {"playerId":"player-b9b807bb-695c-4fc6-bde0-1c62881d530d","kingdomId":"kingdom-1","created":true,"contractVersion":1}
POST /api/roblox/session {"robloxUserId":950082,"displayName":"Ladder 8 B"} -> 200 {"playerId":"player-c289cbe6-c895-412c-8186-f36494cf7144","kingdomId":"kingdom-2","created":true,"contractVersion":1}
seeded levels (player a): {"hq":8,"timber":8,"quarry":8,"iron":8,"farm":8,"warehouse":8,"barracks":8,"wall":8,"academy":3,"stable":8,"workshop":8,"smithy":8,"market":8}
$ sqlite3 <db> "SELECT v.buildings_json FROM local_villages v JOIN local_kingdoms k ON k.id = v.kingdom_id WHERE k.seat_kind = 'freehold' ORDER BY v.id;"
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":0,"wall":0,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  0
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950081,"commandId":"ladder-l8-academy","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"academy"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l8-academy","code":"INVALID_COMMAND","message":"Academy is already at its maximum level.","currentWorldVersion":2}}
$ sqlite3 <db> "SELECT count(*) FROM local_construction_jobs;"
  0
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":8,"timber":8,"quarry":8,"iron":8,"farm":8,"warehouse":8,"barracks":8,"wall":8,"academy":3,"stable":8,"workshop":8,"smithy":8,"market":8}|2026-09-20T06:09:36.949Z|{"wood":0.005226666666666667,"stone":0.005226666666666667,"iron":0.005226666666666667}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950081,"commandId":"ladder-l8-workshop","expectedWorldVersion":2,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"workshop"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"ladder-l8-workshop","worldVersion":3,"constructionJob":{"id":"construction-0d248ed0-0928-46de-99bb-eaba813ed084","villageId":"village-1-capital","building":"workshop","targetLevel":9,"startedAt":"2026-09-20T06:09:36.969Z","completesAt":"2026-09-20T06:09:36.969Z"}}}
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-1-capital' ORDER BY rowid;"
  construction-0d248ed0-0928-46de-99bb-eaba813ed084|workshop|9|waiting|2026-09-20T06:09:36.969Z|2026-09-20T06:09:36.969Z
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":8,"timber":8,"quarry":8,"iron":8,"farm":8,"warehouse":8,"barracks":8,"wall":8,"academy":3,"stable":8,"workshop":8,"smithy":8,"market":8}|2026-09-20T06:09:36.966Z|{"wood":0.0056233333333333335,"stone":0.0056233333333333335,"iron":0.0056233333333333335}
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  2
  -> exit 0
$ kill -TERM <world L8 server pid 3445>
  -> world L8 server exited (code 0, signal null) at 2026-09-20T06:09:36.991Z
[step 9] PASS — levels = min(8, cap) for all 13, resources untouched, 4 Freeholds still at fixture levels; Academy → 409 INVALID_COMMAND "Academy is already at its maximum level."; Workshop → accepted 8→9 but WAITING unpaid (cost {"wood":22795,"stone":19946,"iron":17096} exceeds {"wood":1200,"stone":1000,"iron":800}; nothing deducted); 2 inbox rows

## Step 10 — world L10 — KINGSAGE_DEV_SEED_LEVEL=10: the Academy's prerequisite (Headquarters 10) is met for the first time, but the same knob has held the Academy at its cap of 3 since L3, so the order is INVALID_COMMAND 'already at its maximum level' — the Academy's acceptance path cannot be shown with this knob and is NOT claimed; the Smithy (cap 10) is maxed the same way; Rampart still accepted (unpaid)
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-ladder-VVZNYX/ladder-l10.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_DEV_SEED_LEVEL=10 KINGSAGE_BIND=127.0.0.1 PORT=4256 node --experimental-strip-types src/index.ts &)
  [server:4256] KingSage shared world listening at http://127.0.0.1:4256/?world=shared
Persistent local database: /tmp/kingsmarch-ladder-VVZNYX/ladder-l10.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":950101,"displayName":"Ladder 10 A"} -> 200 {"playerId":"player-0d3607f8-3b67-4333-ac6f-d3ca78dd3995","kingdomId":"kingdom-1","created":true,"contractVersion":1}
seeded levels: {"hq":10,"timber":10,"quarry":10,"iron":10,"farm":10,"warehouse":10,"barracks":10,"wall":10,"academy":3,"stable":10,"workshop":10,"smithy":10,"market":10}
POST /api/roblox/commands {"robloxUserId":950101,"commandId":"ladder-l10-academy","expectedWorldVersion":1,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"academy"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l10-academy","code":"INVALID_COMMAND","message":"Academy is already at its maximum level.","currentWorldVersion":1}}
POST /api/roblox/commands {"robloxUserId":950101,"commandId":"ladder-l10-smithy","expectedWorldVersion":1,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"smithy"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l10-smithy","code":"INVALID_COMMAND","message":"Smithy is already at its maximum level.","currentWorldVersion":1}}
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":10,"timber":10,"quarry":10,"iron":10,"farm":10,"warehouse":10,"barracks":10,"wall":10,"academy":3,"stable":10,"workshop":10,"smithy":10,"market":10}|2026-09-20T06:09:37.232Z|{"wood":0.002108333333333333,"stone":0.002108333333333333,"iron":0.002108333333333333}
  -> exit 0
POST /api/roblox/commands {"robloxUserId":950101,"commandId":"ladder-l10-wall","expectedWorldVersion":1,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"wall"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"ladder-l10-wall","worldVersion":2,"constructionJob":{"id":"construction-f2868ce3-4e63-4d65-a2fe-c8670b266b67","villageId":"village-1-capital","building":"wall","targetLevel":11,"startedAt":"2026-09-20T06:09:37.249Z","completesAt":"2026-09-20T06:09:37.249Z"}}}
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-1-capital' ORDER BY rowid;"
  construction-f2868ce3-4e63-4d65-a2fe-c8670b266b67|wall|11|waiting|2026-09-20T06:09:37.249Z|2026-09-20T06:09:37.249Z
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":10,"timber":10,"quarry":10,"iron":10,"farm":10,"warehouse":10,"barracks":10,"wall":10,"academy":3,"stable":10,"workshop":10,"smithy":10,"market":10}|2026-09-20T06:09:37.245Z|{"wood":0.002523611111111111,"stone":0.002523611111111111,"iron":0.002523611111111111}
  -> exit 0
$ kill -TERM <world L10 server pid 3463>
  -> world L10 server exited (code 0, signal null) at 2026-09-20T06:09:37.269Z
[step 10] PASS — hq 10, smithy 10 (cap), academy 3 (cap): Academy → 409 INVALID_COMMAND "Academy is already at its maximum level."; Smithy → 409 INVALID_COMMAND "Smithy is already at its maximum level."; Rampart 10→11 accepted but waiting unpaid (cost {"wood":4613,"stone":6920,"iron":2307}). The Academy's prerequisite-satisfied acceptance stays tests-only.

## Step 11 — world L99 — KINGSAGE_DEV_SEED_LEVEL=99: every building sits at its own cap; all 13 orders → 409 INVALID_COMMAND 'already at its maximum level'; 13 stored rejections, 0 jobs
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-ladder-VVZNYX/ladder-l99.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_DEV_SEED_LEVEL=99 KINGSAGE_BIND=127.0.0.1 PORT=4257 node --experimental-strip-types src/index.ts &)
  [server:4257] KingSage shared world listening at http://127.0.0.1:4257/?world=shared
Persistent local database: /tmp/kingsmarch-ladder-VVZNYX/ladder-l99.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":950991,"displayName":"Ladder Max"} -> 200 {"playerId":"player-3d805199-9ff5-41d2-aa0c-903ed992409d","kingdomId":"kingdom-1","created":true,"contractVersion":1}
seeded levels: {"hq":20,"timber":25,"quarry":25,"iron":25,"farm":30,"warehouse":30,"barracks":25,"wall":20,"academy":3,"stable":20,"workshop":15,"smithy":10,"market":20}
POST /api/roblox/commands {"robloxUserId":950991,"commandId":"ladder-l99-hq","expectedWorldVersion":1,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"hq"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l99-hq","code":"INVALID_COMMAND","message":"Headquarters is already at its maximum level.","currentWorldVersion":1}}
POST /api/roblox/commands {"robloxUserId":950991,"commandId":"ladder-l99-market","expectedWorldVersion":1,"command":{"type":"village.build.queue","payload":{"villageId":"village-1-capital","building":"market"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"ladder-l99-market","code":"INVALID_COMMAND","message":"Market is already at its maximum level.","currentWorldVersion":1}}
13 refusals: Headquarters is already at its maximum level. | Timber Camp is already at its maximum level. | Stone Quarry is already at its maximum level. | Iron Mine is already at its maximum level. | Farm is already at its maximum level. | Warehouse is already at its maximum level. | Barracks is already at its maximum level. | Rampart is already at its maximum level. | Smithy is already at its maximum level. | Stable is already at its maximum level. | Workshop is already at its maximum level. | Academy is already at its maximum level. | Market is already at its maximum level.
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox;"
  13
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_construction_jobs;"
  0
  -> exit 0
$ kill -TERM <world L99 server pid 3477>
  -> world L99 server exited (code 0, signal null) at 2026-09-20T06:09:37.656Z
[step 11] PASS — levels {"hq":20,"timber":25,"quarry":25,"iron":25,"farm":30,"warehouse":30,"barracks":25,"wall":20,"academy":3,"stable":20,"workshop":15,"smithy":10,"market":20} = every cap; 13 × 409 INVALID_COMMAND "<Name> is already at its maximum level."; inbox 13, jobs 0

## Step 12 — world L1 — three non-timber completions on the real clock: Quarry 1→2 (stone 28→33/h) and the waiting Headquarters starts at exactly that instant, paid; Warehouse 1→2 (storage 1464→1786); Farm 1→2 (population cap 232→269) and Farm 2→3 starts at exactly that instant at the level-2 cost; notifications stamped at completesAt; p2's resources reconcile to the formula
waiting 717s for Stone Quarry (p1) to come due at 2026-09-20T06:21:34.571Z (server running the whole time)
p1 after quarry (observed 2026-09-20T06:21:34.686Z): buildings {"hq":1,"timber":1,"quarry":2,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}, production {"wood":28,"stone":33,"iron":28}, notification {"id":"notification-0ce71a08-5afc-4edd-b4c5-0f67a88acab5","kind":"construction","message":"Stone Quarry reached level 2.","createdAt":"2026-09-20T06:21:34.571Z"}
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-1-capital' ORDER BY rowid;"
  construction-9d069320-5907-4aae-9069-36b99848b10d|quarry|2|complete|2026-09-20T06:09:34.571Z|2026-09-20T06:21:34.571Z
  construction-fca3748a-b8ea-478a-9e5f-969d00f59dd7|hq|2|queued|2026-09-20T06:21:34.571Z|2026-09-20T06:39:34.571Z
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-1-capital';"
  {"wood":967,"stone":806,"iron":636}|{"hq":1,"timber":1,"quarry":2,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:21:34.677Z|{"wood":0.6023099999999924,"stone":0.6024572222222144,"iron":0.6023099999999924}
  -> exit 0
p1 reconciliation over 0.200035 h, paid [{"wood":98,"stone":75,"iron":60},{"wood":140,"stone":124,"iron":109}], stone 28/h until 2026-09-20T06:21:34.571Z then 33/h: {"wood":{"whole":967,"carry":0.60231,"expectedTotal":967.60231,"actualTotal":967.60231},"stone":{"whole":806,"carry":0.602457,"expectedTotal":806.602457,"actualTotal":806.602457},"iron":{"whole":636,"carry":0.60231,"expectedTotal":636.60231,"actualTotal":636.60231}}
waiting 60s for Warehouse (p2) to come due at 2026-09-20T06:22:34.592Z (server running the whole time)
p2 after warehouse (observed 2026-09-20T06:22:34.663Z): buildings {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":2,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}, storage 1786, notification {"id":"notification-c3c76406-454d-431e-872a-872272efd146","kind":"construction","message":"Warehouse reached level 2.","createdAt":"2026-09-20T06:22:34.592Z"}
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-2-capital' ORDER BY rowid;"
  construction-45956cec-7e54-427d-8abe-61a45a5d456f|warehouse|2|complete|2026-09-20T06:09:34.592Z|2026-09-20T06:22:34.592Z
  -> exit 0
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-2-capital';"
  {"wood":1119,"stone":933,"iron":748}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":2,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:22:34.655Z|{"wood":0.0688055555555663,"stone":0.0688055555555663,"iron":0.0688055555555663}
  -> exit 0
p2 reconciliation over 0.216691 h, paid [{"wood":87,"stone":73,"iron":58}] at 28/h: {"wood":{"whole":1119,"carry":0.068806,"expectedTotal":1119.068806,"actualTotal":1119.068806},"stone":{"whole":933,"carry":0.068806,"expectedTotal":933.068806,"actualTotal":933.068806},"iron":{"whole":748,"carry":0.068806,"expectedTotal":748.068806,"actualTotal":748.068806}}
waiting 60s for Farm (p3) to come due at 2026-09-20T06:23:34.612Z (server running the whole time)
p3 after farm (observed 2026-09-20T06:23:34.682Z): buildings {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":2,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}, population cap 269, notification {"id":"notification-c070adfb-04c3-417c-abd8-85243c34091b","kind":"construction","message":"Farm reached level 2.","createdAt":"2026-09-20T06:23:34.612Z"}
$ sqlite3 <db> "SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = 'village-3-capital' ORDER BY rowid;"
  construction-4f7a3e08-eca4-456e-85e2-f681778459ec|farm|2|complete|2026-09-20T06:09:34.612Z|2026-09-20T06:23:34.612Z
  construction-84b22f61-118b-40c4-840f-ff919a2c5a8b|farm|3|queued|2026-09-20T06:23:34.612Z|2026-09-20T06:40:22.612Z
  construction-5e551226-5b8e-4ea9-aa3a-6c5084a0fd44|farm|4|waiting|2026-09-20T06:09:34.718Z|2026-09-20T06:09:34.718Z
  construction-c7dc8eb7-724e-49c1-8edc-60c830998d05|farm|5|waiting|2026-09-20T06:09:34.733Z|2026-09-20T06:09:34.733Z
  construction-84368b73-4f0a-4e1e-9b6d-343ac172f79a|farm|6|waiting|2026-09-20T06:09:34.755Z|2026-09-20T06:09:34.755Z
  construction-b7716956-be33-49c0-92bd-c76453144c4a|farm|7|waiting|2026-09-20T06:09:34.782Z|2026-09-20T06:09:34.782Z
  construction-e737c4be-5358-492b-bebc-7504d704c87d|farm|8|waiting|2026-09-20T06:09:34.806Z|2026-09-20T06:09:34.806Z
  construction-2913a505-1cd0-40c5-83c9-2b5cc3754be8|farm|9|waiting|2026-09-20T06:09:34.829Z|2026-09-20T06:09:34.829Z
  construction-1bf6842d-d2d5-4a11-86bb-299e5399e670|farm|10|waiting|2026-09-20T06:09:34.847Z|2026-09-20T06:09:34.847Z
  construction-bc14676c-6b9b-4e7b-a68f-71ba3fdea241|farm|11|waiting|2026-09-20T06:09:34.865Z|2026-09-20T06:09:34.865Z
  -> exit 0
p3 job rows: farm→2 complete, farm→3 queued 2026-09-20T06:23:34.612Z→2026-09-20T06:40:22.612Z, farm→4 waiting, farm→5 waiting, farm→6 waiting, farm→7 waiting, farm→8 waiting, farm→9 waiting, farm→10 waiting, farm→11 waiting
$ sqlite3 <db> "SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = 'village-3-capital';"
  {"wood":1046,"stone":864,"iron":699}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":2,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|2026-09-20T06:23:34.677Z|{"wood":0.5356433333333295,"stone":0.5356433333333295,"iron":0.5356433333333295}
  -> exit 0
p3 reconciliation over 0.233358 h, paid [{"wood":65,"stone":58,"iron":44},{"wood":95,"stone":84,"iron":63}] at 28/h: {"wood":{"whole":1046,"carry":0.535643,"expectedTotal":1046.535643,"actualTotal":1046.535643},"stone":{"whole":864,"carry":0.535643,"expectedTotal":864.535643,"actualTotal":864.535643},"iron":{"whole":699,"carry":0.535643,"expectedTotal":699.535643,"actualTotal":699.535643}}
[step 12] PASS — Quarry 1→2 observed 2026-09-20T06:21:34.686Z (completesAt 2026-09-20T06:21:34.571Z); stone 28→33/h; notification "Stone Quarry reached level 2." at completesAt; Headquarters 1→2 started at exactly 2026-09-20T06:21:34.571Z for 1080s, cost {"wood":140,"stone":124,"iron":109} paid; p1 resources reconcile to <1e-6 || Warehouse 1→2 observed 2026-09-20T06:22:34.663Z (completesAt 2026-09-20T06:22:34.592Z); storage 1464→1786; notification at completesAt; p2 resources reconcile to <1e-6 || Farm 1→2 observed 2026-09-20T06:23:34.682Z (completesAt 2026-09-20T06:23:34.612Z); population cap 232→269; notification at completesAt; Farm 2→3 started at exactly 2026-09-20T06:23:34.612Z for 1008s at the level-2 cost {"wood":95,"stone":84,"iron":63}; 8 orders still waiting; p3 resources reconcile to <1e-6
$ kill -TERM <world server on 4251 pid 3357>
  -> world server on 4251 exited (code 0, signal null) at 2026-09-20T06:23:34.702Z

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
C2 building ladder drill PASS (12/12 steps PASS)
scratch dir removed: /tmp/kingsmarch-ladder-VVZNYX
```
