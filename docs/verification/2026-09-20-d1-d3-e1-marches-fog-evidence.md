# D1–D3 / E1 — fog, scouting and the march over HTTP: what a rival sees, what only a Spy learns, the scout-before-attack gate, intel freshness, and a march that is mustered, paced, replay-proof and outage-proof on a real clock: evidence

**Date:** 2026-09-20 · **Executed by:** [Cursor] (cloud; model: Claude Fable 5.1) · **Owner of record:** Adam · **Reviewer owed:** Claude (per matrix §7)
**Matrix rows:** `docs/verification/2026-09-17-full-game-acceptance-matrix.md` **D1** (fog of war in snapshots covers ALL fields incl. realm power + herds), **D2** (event stream fogged per reader), **D3** (scout-before-attack + intel freshness enforced), **E1** (march launch: server-mustered army, slowest-unit pace, duplicate/outage-proof). All four stood at IMPLEMENTED + TESTED with no live evidence of any date; revision 7's §7 list named them together as "need scouts and a march in flight". **E2**'s server half (recall) is exercised on the way and recorded as an observation, not claimed as E2 (E2's open item is the Roblox rendering).
**Why not C1's warehouse cap (the slice the hand-off preferred):** it cannot be reached honestly in a cheap run, and the arithmetic says so. At fixture levels a village holds 1200 wood against `storageCapacity(1) = 1464` and earns `productionPerHour(1) = 28`/h, so the first resource touches the cap after (1464 − 1200) / 28 = **9.43 h** of real accrual (stone 16.6 h, iron 23.7 h). `KINGSAGE_DEV_SEED_LEVEL` makes it **worse at every rung**, because storage grows 1.22× per Warehouse level while production grows 1.17× per producer level: L2 → 17.8 h, L3 → 25.8 h, L5 → 39.3 h, L10 → 65.8 h, L25 → 141.8 h, L99 → 385 h. No knob seeds resources; the only other way to bring resources in is loot from a settled battle (a different slice). The one short cut — rewinding `last_materialized_at` in the stopped DB — would be a simulation and would have to be labelled one, which the hand-off ruled out. So C1's cap branch stays tests-only and its row is not touched; this note takes the next slice on revision 7's list instead.
**How the marches were possible:** a fresh village has no troops (Adam, 2026-08-22), so the drill rides `KINGSAGE_DEV_SEED_ARMY=axe:20,spear:10,scout:3,ram:1` — production code in `server/src/index.ts` / `server/src/store.ts`, documented **DEV ONLY** and "a TEST FIXTURE rather than a game rule", which adds the same army to every non-Freehold village at world creation and never touches a Freehold. The seed is deliberately distinctive so a fogged zero can never be mistaken for a garrison. Every rule under test — the fog, the gate, muster, pace, replay, recovery, the event filter, freshness — ran in the production code path over the wire against those troops; the knob's own promise (Freeholds keep only the fixture's 10 Squires) was checked live.
**SHA executed:** `6e5c9bc` on `cursor/d1-d3-e1-marches-fog-drill-d1ee` (= [PR #16](https://github.com/Adamdesgns/kingsage-remaster/pull/16) tip `6ade713` + `scripts/d1-d3-e1-marches-fog-drill.mjs`). `git diff 9b478db 6e5c9bc -- server/ packages/ roblox/` is **empty**, so the world server under test is byte-identical to **`main @ 9b478db`**.
**Environment:** cloud Linux, Node `v22.14.0`, `sqlite3 3.45.1`. No hosting, no Studio, no PC, no phone. **No battle was fought.**
**Result: PASS — 10/10 steps, exit 0.** Wall time 59.4 s (`06:50:07.247Z` → `06:51:06.665Z`), all of it real march timers over the fixture's 22.85-tile p1↔p2 distance (Spy 17 s out / 24 s back, Berserkers 39 s, Berserkers + Ram 58 s). No timers were shortened; no clock was faked; the one outage was a real SIGTERM with the process gone for 18.5 s.

## What this proves, and what it does not

Proves, at `6e5c9bc`, against one disposable world over raw HTTP — the Roblox door (`/api/roblox/session`, `/state`, `/commands`) for the two players who march and the web door (`/api/auth/register`, `/api/world/snapshot`, `/api/world/commands`, `/api/world/events`, `/api/world/stream`) for a third, "watcher" kingdom — with the SQLite file read directly for the facts the API hides on purpose:

- **D1 — the fog is total and it is a filter, not empty data** (step 2): for all three readers, on both doors, every one of the 9 foreign villages reads **zero** in resources, all 13 building levels, all 11 troop counts, `realmOfPower`, `realmOfPowerMax`, `horses` and `horsesMax`, and keeps only its place on the map (name, coordinates, owner); meanwhile the same villages' DB rows hold 1200/1000/800, hq 1, the 34-troop seed army and realm power 294. Each reader's own village equals its row exactly.
- **D1 — the report is the only way past it** (steps 5, 6): after the Spy arrives, p1's `scoutReports[0]` carries `observedArmy` = p2's row exactly (the distinctive `{spear:10, axe:20, scout:3, ram:1}`), `observedBuildings` = the row, `observedResources` within the 28/h trickle of the row, `observedRealmOfPower` 294 of `observedRealmOfPowerMax` 294 (= `settlementPoints(buildings)`), `targetVillageVersion` = the row's `state_version`; and **in the same snapshot** p2's `world.villages` entry is still all zeros. p2, scouted, sees no march, no report, no notification, and every Spy.
- **D3 — the gate** (step 3): an attack on a village nobody scouted → 409 `SCOUT_REQUIRED` "Scout this village before committing an attack march.", stored, replayed byte-identically, nothing left home. Alongside it: own village as target → `INVALID_TARGET`; a "scout" march carrying Squires → `INVALID_ARMY` "Scouting marches may contain scouts only."; kind `support` → `INVALID_ARMY`; 4 Spies from a village holding 3 → `INSUFFICIENT_TROOPS`. Five stored rejections, 0 march rows, army and world version unchanged. The expected codes and messages are literals in the drill from a reading of `server/src/store.ts`, so this is an oracle, not the server checked against itself.
- **D3 — the gate opens only after the report** (step 7): the same attacker's two attack marches on the same village are **accepted** once the report exists.
- **D3 — freshness at the walls** (step 9): with 10 Berserkers `awaiting_battle`, `battle.open` claiming a report version p1 never held → 409 `STALE_SCOUT_REPORT`; then p2 sends one of its own Spies out (garrison 3 → 2 Spies) and `battle.open` claiming **the exact version the report carries** → 409 `STALE_SCOUT_REPORT` "The defender changed after your report. Scout again before opening battle." **0 rows in `local_battle_sessions`** — the check refused before anything opened.
- **E1 — server-mustered** (steps 4, 7): the Spy leaves the village row at the instant of acceptance (3 → 2 in the DB and the next snapshot); the two attacks take 15 Berserkers and the Ram (20 → 5, 1 → 0); at every checkpoint **home + in flight = the seed army** for p1 and for W (step 10: p1 home `{spear:10, axe:10, scout:3, ram:1}` + at the walls `{axe:10}`; W home minus one Spy + one Spy returning).
- **E1 — paced by the slowest unit, from game-core** (steps 4, 7): over 22.8473 tiles the Spy's `arrivesAt − departedAt` is exactly **17 s** = `marchDurationSeconds(d, "scout", {scout:1})` (8 + d × 0.8 × 9/18, rounded); 10 Berserkers **39 s** (12 + d × 1.2 × 18/18); 5 Berserkers + 1 Ram **58 s** (× 30/18 — the Ram sets the pace); the Spy's homeward leg **24 s** (10 + d × 1.2 × 9/18). The attack rows carry `UNPLANNED_ATTACK_PLAN` and `auto_resolve_at` **NULL** until arrival ("the clock at the walls starts on arrival").
- **E1 — duplicate-proof** (steps 4, 5): the launch `commandId` replayed with a stale `expectedWorldVersion` → 200, byte-identical body, still 1 march row, still 2 Spies; replayed again **after the restart** → still byte-identical, still 1 march, 1 report.
- **E1 — outage-proof** (step 5): SIGTERM 1.0 s after launch, 15.95 s before the Spy's `arrivesAt`; the DB row stays `outbound` with the original `arrives_at` and **no report row** for the whole 18.5 s the process is gone (checked before and after the arrival instant passes — a march is data, not a timer); on restart the **first** `/api/roblox/state` pull carries the report with `createdAt == arrivesAt` **exactly** and the `scout` notification stamped there too, and the march is `returning`.
- **D2 — the event stream wears the reader's fog** (steps 7, 10): W's `/api/world/events?since=0` returns the 3 public `kingdom.claimed` rows and **none** of p1's `march.changed` / `scout.report.ready` rows while `local_world_events` holds them (2 at the time, 5 later); a **live** `/api/world/stream` opened for W receives its `ready` frame and then **nothing** when p1 launches two attacks, and receives exactly W's own `march.changed` (full army, own village) the moment W scouts; W's replay later carries W's own `scout.report.ready` (report `kingdomId` = W, `createdAt` = its Spy's `arrivesAt`) and still nothing of p1's; p1's Roblox snapshot lists only p1's marches.
- **E2, server half — observed** (steps 8, 9): recalling the Berserkers+Ram attack 3.065 s out turns the row `returning` with `departedAt` = the recall instant and a **3.065 s** walk back (the walk back costs what the walk out had cost), notification "6 troops turned for home." stamped at the recall; p2 recalling p1's march → 409 `FORBIDDEN` "That march does not answer to you."; recalling an army at the walls → 409 `MARCH_COMMITTED`.
- **Homecomings land on their instant** (step 10): the Spy and the recalled column are `complete` with "1 troops returned…" / "6 troops returned…" notifications whose `createdAt` **equals** the row's `arrives_at`.

Does **not** prove: **any battle** — the acceptance path of `battle.open`, settlement, loot, conquest, the mid-settle kill (B8's open variant) all stay tests-only or historical; the world was stopped **119.8 s before** the waiting attack's `auto_resolve_at` and `local_battle_sessions` was empty at teardown. **A march arriving while the server is down for an *attack*** (only the scout's arrival was caught up offline). **The scout's own arrival with the server running** (it happened during the outage by design; W's Spy arrived with the server up and its report is stamped at its `arrivesAt`, but that is one data point). **Anything the Roblox client renders** (Studio) — the war table, Recall, the Herald, fog shells. **Whether the numbers are right** — 8 s / 12 s bases, 0.8 / 1.2 per tile, unit speeds, the 120 s auto-resolve are certified as *the coded numbers running*, not as good design. Does not touch any real world: the DB is an absolute `mkdtemp` path under `/tmp`, the key is a throwaway literal, the port is 4261, inherited `KINGSAGE_*` env is stripped before the seed knob is set.

Three observations recorded and **not judged**: (1) **the homeward leg after an offline arrival is measured from catch-up, not from the arrival** — the report and notification are stamped at the true `arrivesAt`, but the Spy's `returning` leg began 2.725 s after it, i.e. at the instant the restarted server caught up (`store.ts` `materializeDueMarches` sets `arrives_at = now + returnMs` for the return leg while stamping the report with `row.arrives_at`); construction chaining does the opposite (C2 ladder: the next order starts at the exact completion instant). (2) **nothing tells a village it was scouted** — p2 has no notification and no event after p1's report lands. (3) **nothing tells a defender an army is at its walls** — with 10 Berserkers `awaiting_battle` at p2's village, p2's snapshot shows no notification and `battleSessions` 0; the `march.arrived` event passes the fog filter for the *attacker's* kingdom only (`filterEventForKingdom`). Whether a defender should learn of a scout or a siege before the battle is a design question this drill does not answer.

## How to rerun

```bash
node scripts/d1-d3-e1-marches-fog-drill.mjs               # expect exit 0, "D1–D3/E1 marches + fog drill PASS (10/10 steps PASS)", ~60 s
MARCH_PORT=4261 node scripts/d1-d3-e1-marches-fog-drill.mjs
```

Needs Node 22 and the `sqlite3` CLI. The scratch directory is removed on PASS and kept (path printed) on FAIL. Expected refusal codes/messages and the 120 s auto-resolve are literals at the top of the script; march durations, distances, settlement points, the unplanned battle plan and the Freehold garrison are imported from `packages/game-core` (the drill re-execs itself under `--experimental-strip-types` for that). If someone changes a refusal, a unit speed, a march base or the fog rule, the drill fails on the message or the number — which is the point. The drill reads the world version immediately before every command and would log and retry once (under a suffixed `commandId`) if a march landing between the read and the write produced a `WORLD_VERSION_CONFLICT`; in the recorded run that never happened.

## Step table

| Step | Row | What it drives | Result | Key evidence |
|---|---|---|---|---|
| 1 | — | Fresh world with the seed army; p1/p2 linked (Roblox), W registered (web) | **PASS** | seed `{spear:10, axe:20, scout:3, ram:1}` on all 6 non-Freehold villages; 4 Freeholds at the fixture's `{spear:10}`; resources untouched; p1↔p2 22.8473 tiles |
| 2 | D1 | **Snapshot fog, three readers, both doors** | **PASS** | 9 foreign villages all-zero in 8 fields for p1, p2, W; own village = DB row; p2's row holds 1200/1000/800, hq 1, the seed army, realm power 294 |
| 3 | D3 | **Gate + shape refusals**, stored, nothing moves, replay | **PASS** | `SCOUT_REQUIRED`, `INVALID_TARGET`, `INVALID_ARMY` ×2, `INSUFFICIENT_TROOPS`; 5 inbox rows, 0 marches; version 3 unchanged; byte-identical replay |
| 4 | E1 | **Scout launch**: muster, pace, replay | **PASS** | 17 s = `marchDurationSeconds`; Spies 3 → 2 at once; replay with stale version byte-identical, 1 march; p2 sees nothing |
| 5 | E1 | **Outage across the arrival**: SIGTERM, frozen row, restart, catch-up, replay | **PASS** | down `06:50:08.754Z` → `06:50:27.224Z` (Spy due `06:50:24.707Z`); report `createdAt == arrivesAt`; notification at `arrivesAt`; `returning`; post-restart replay byte-identical; homeward leg began 2.725 s after arrival (observed) |
| 6 | D1 | **Report vs row; same snapshot still fogged**; p2 unaware | **PASS** | observedArmy = seed = row; buildings = row; resources within 1; realm power 294/294; version 1; fogged entry all zeros; p2: 0 marches, 0 reports, 0 notifications, 3 Spies |
| 7 | D2, D3, E1 | **Event replay + live SSE fog**; two attacks accepted post-scout; **Ram sets the pace**; muster; conservation | **PASS** | W replay: 3 `kingdom.claimed`, 0 private vs 2 private rows in DB; live stream: 0 events for p1's launches, exactly W's own `march.changed`; A 39 s, B 58 s; Berserkers 20 → 5, Ram 1 → 0; home + in flight = seed; plans UNPLANNED, `auto_resolve_at` NULL |
| 8 | E2 (obs.) | **Recall** outbound; foreign recall refused | **PASS** | B: 3.065 s out → 3.065 s back, `returning`; "6 troops turned for home." at the recall; p2 → 409 `FORBIDDEN`; A untouched |
| 9 | D3 | **At the walls**: `awaiting_battle`, `auto_resolve_at`, `MARCH_COMMITTED`, **freshness** ×2, no battle | **PASS** | observed 46 ms after `arrivesAt`; `auto_resolve_at` = arrivesAt + 120 s; recall → `MARCH_COMMITTED`; unheld version → `STALE_SCOUT_REPORT`; p2 Spies 3 → 2; report's own version → `STALE_SCOUT_REPORT`; 0 battle sessions |
| 10 | E1, D2 | **Homecomings at their instant**; W's own report event; conservation; stop before auto-resolve | **PASS** | "1 troops returned…" and "6 troops returned…" at `arrives_at`; W's `scout.report.ready` own-kingdom, `createdAt` = its `arrivesAt`, observedArmy = all three of p2's Spies (W's Spy arrived 14.6 s before p2's left — recorded, not assumed); p1 home + `{axe:10}` = seed; W home + `{scout:1}` = seed; stopped 119.8 s before `auto_resolve_at`; 0 battle sessions |

## Gate sanity at this tip (same session, cloud image)

| Gate | Result |
|---|---|
| `npm run check:types` | **clean** (after `npm install` at root for `@types/node` and a `--no-save` `typescript@7.0.2` into `mobile-rebuild/` — the image ships neither; nothing committed) |
| `npm run test:core` | **92/92, 0 fail** |
| `npm run test:server` | **114/114, 0 fail, 0 skipped** with Lune 0.10.5 on `PATH` (downloaded to `/tmp`) |
| `npm run test:luau` | 31 files syntax-clean · **72 rules, 0 failed** · 7 spike-sim checks, 0 failed |

No `server/`, `packages/`, or `roblox/` code changed on this branch; the gates are sanity, not a claim of new coverage.

## Honesty notes

- **Two smoke runs failed on my oracle, not the server, before the script was committed.** (a) I asserted Freeholds would hold *no* army; they hold the fixture's own `FREEHOLD_GARRISON` of 10 Squires, which the seed knob correctly leaves alone — the check now imports that constant. (b) I asserted the notification text against the target's name from p1's *first* snapshot, taken before p2 had claimed its seat, so it read "Open Seat 2" instead of "March Two's Realm Keep"; the drill now re-pulls after every seat is claimed. A third smoke run passed 9/10 and failed step 10 on a race I had predicted in the code comments and then asserted the wrong side of: W's Spy reached p2 *before* p2 sent its own Spy out, so W's report showed three Spies, not two. The drill now accepts either order and **records which one happened** rather than guessing. The fourth smoke run passed 10/10; the script was then committed and **the recorded run below is the first run of the committed script**.
- **The seed army is a stimulus, not a shortcut past any rule under test.** It puts troops in villages that would otherwise have none; the fog, the scout gate, muster, pace, idempotency, recovery, the event filter and the freshness check are all the production code path, run over HTTP against those troops. The knob's stated limit (Freeholds untouched) is checked live in step 1.
- **The `battle.open` acceptance path was deliberately not driven.** Opening a battle starts the settlement path, which is the B8 "mid-battle-settle" variant and a slice of its own; the drill stops the world 119.8 s before the waiting attack would auto-resolve and proves `local_battle_sessions` is empty. The 10 Berserkers were left `awaiting_battle` in a world that no longer exists.
- **The freshness refusal with the *right* version is the meaningful one.** A wrong version is refused because no such report exists; the report's own version is refused because `intelIsCurrent` compares the observed garrison and wall against the defender's current row and one Spy had left. Both are `STALE_SCOUT_REPORT` with the same message; the drill shows both and says which is which.
- **Timers were checked to the millisecond against the shared rule, not against the server's own numbers**: `marchDurationSeconds` is imported from `packages/game-core/src/warfare.ts`, which is also what `store.ts` calls — so this proves the server uses the shared rule with the real army and distance, not that the rule is right.
- **The 500 ms materialize interval and the state route both call `materializeDueJobs`**, so "the first pull after restart carries the report" is true whichever fired first; the report's `createdAt` comes from the march row's `arrives_at`, not from the clock, which is the claim.
- Cosmetic: the world-server prints `Persistent local database:` un-prefixed once per start because both banner lines arrive in one stdout chunk, as in the earlier drills; in step 10 the p1 march rows are printed twice because the homecoming loop re-reads them per march. Neither affects a verdict.
- Model of record: Claude Fable 5.1 (cloud). No secrets: the key is a throwaway literal, never reused; W's password is a throwaway literal in the script. The two `ExperimentalWarning` lines Node prints before the drill's own header are omitted from the record below; nothing else is.

## Run record — recorded drill (exit 0)

Verbatim output of `node scripts/d1-d3-e1-marches-fog-drill.mjs` at `6e5c9bc`. UUIDs, the session token and the scratch path are per-run and disposable; the drill masks the session token itself. Long `command.accepted` bodies are shortened by the drill at 400 bytes (the full march object is then printed from the DB row on the next line).

```text
# D1–D3 / E1 — fog, scouting and the march over HTTP (current tip)
date: 2026-09-20T06:50:07.247Z
sha: 6e5c9bc
node: v22.14.0
sqlite3: 3.45.1 2024-01-30 16:01:20 e876e51a0ed5c5b3126f52e532044363a014bc594cfefa87ffb5b82257ccalt1 (64-bit)
scratch: /tmp/kingsmarch-marches-Wg46I3
port: 4261

## Step 1 — fresh disposable world with KINGSAGE_DEV_SEED_ARMY; P1 and P2 linked through the Roblox door, W registered through the web door; every non-Freehold village holds exactly the seed army, every Freehold only the fixture's own 10 Squires
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-marches-Wg46I3/world.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_DEV_SEED_ARMY=axe:20,spear:10,scout:3,ram:1 KINGSAGE_BIND=127.0.0.1 PORT=4261 node --experimental-strip-types src/index.ts &)   # world server
  [server] KingSage shared world listening at http://127.0.0.1:4261/?world=shared
Persistent local database: /tmp/kingsmarch-marches-Wg46I3/world.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1}
POST /api/roblox/session {"robloxUserId":960001,"displayName":"March One"} -> 200 {"playerId":"player-209f8662-1bea-42e2-9148-2d77cb960cc8","kingdomId":"kingdom-1","created":true,"contractVersion":1}
POST /api/roblox/session {"robloxUserId":960002,"displayName":"March Two"} -> 200 {"playerId":"player-1897a2b5-9567-4901-9116-85da531e308f","kingdomId":"kingdom-2","created":true,"contractVersion":1}
POST /api/auth/register {"username":"watcher","password":"Correct-Horse-9","kingdomName":"The Watchers"} -> 201 {"player":{"id":"player-462bbb17-8ed2-4bdd-a012-64a9497587b5","username":"watcher","kingdomId":"kingdom-3"}}
  set-cookie: kingsage_session=<session token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000
p1: player-209f8662-1bea-42e2-9148-2d77cb960cc8 / kingdom-1 / village-1-capital
p2: player-1897a2b5-9567-4901-9116-85da531e308f / kingdom-2 / village-2-capital
w: player-462bbb17-8ed2-4bdd-a012-64a9497587b5 / kingdom-3 / village-3-capital
$ sqlite3 <db> "SELECT k.seat_kind || '|' || v.id || '|' || v.army_json FROM local_villages v JOIN local_kingdoms k ON k.id = v.kingdom_id ORDER BY v.id;"
  human|village-1-capital|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}
  human|village-2-capital|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}
  human|village-3-capital|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}
  ai|village-4-capital|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}
  ai|village-5-capital|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}
  ai|village-6-capital|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}
  freehold|village-freehold-1|{"militia":0,"spear":10,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}
  freehold|village-freehold-2|{"militia":0,"spear":10,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}
  freehold|village-freehold-3|{"militia":0,"spear":10,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}
  freehold|village-freehold-4|{"militia":0,"spear":10,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}
  -> exit 0
p1 home village-1-capital at (19,33); p2 target village-2-capital "March Two's Realm Keep" at (28,12); distance 22.8473 tiles
expected march times over that distance: scout 17s (Spy speed 9), attack of Berserkers 39s (speed 18), attack of Berserkers + 1 Ram 58s (Ram speed 30), scouts' return 24s
[step 1] PASS — health 200; p1 → kingdom-1, p2 → kingdom-2, w → kingdom-3; seed army {"spear":10,"axe":20,"scout":3,"ram":1} on all 6 non-Freehold villages, 4 Freeholds at the fixture's {"spear":10} (the knob added nothing), resources untouched; p1↔p2 distance 22.8473 tiles

## Step 2 — D1 — fog in the snapshot, all three readers, both doors: every foreign village reads zero in resources, all 13 buildings, all 11 troops, realmOfPower, realmOfPowerMax, horses and horsesMax while the DB row holds real numbers; the owner's own village equals its row
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-2-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|1|March Two's Realm Keep
  -> exit 0
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|1|March One's Realm Keep
  -> exit 0
p1 (roblox door) sees 9 foreign villages fogged; p2's village as p1 sees it: resources {"wood":0,"stone":0,"iron":0}, buildings all 0, army empty, realmOfPower 0/0, horses 0/0
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-2-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|1|March Two's Realm Keep
  -> exit 0
p2 (roblox door) sees 9 foreign villages fogged; p2's village as p2 sees it: own — resources {"wood":1200,"stone":1000,"iron":800}, buildings all {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}, army {"spear":10,"axe":20,"scout":3,"ram":1}, realmOfPower 294/294, horses 0/0
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-3-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|1|The Watchers Keep
  -> exit 0
w (web door) sees 9 foreign villages fogged; p2's village as w sees it: resources {"wood":0,"stone":0,"iron":0}, buildings all 0, army empty, realmOfPower 0/0, horses 0/0
[step 2] PASS — p1: 9 foreign fogged, own equals row; p2: 9 foreign fogged, own equals row; w: 9 foreign fogged, own equals row; p2's row meanwhile: resources {"wood":1200,"stone":1000,"iron":800}, hq 1, army {"spear":10,"axe":20,"scout":3,"ram":1}, realm_of_power 294

## Step 3 — D3 — the gate and the shape checks, all refused and stored: an attack on a village nobody scouted → SCOUT_REQUIRED; own village as target → INVALID_TARGET; a scout march with Squires in it → INVALID_ARMY; kind 'support' → INVALID_ARMY; more Spies than the village holds → INSUFFICIENT_TROOPS; nothing leaves home, no march row, world version unchanged; SCOUT_REQUIRED replayed byte-identically
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|1|March One's Realm Keep
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox WHERE 1=1;"
  0
  -> exit 0
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"march-p1-attack-blind","expectedWorldVersion":3,"command":{"type":"march.launch","payload":{"fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"attack","army":{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} -> 409 {"type":"command.rejected","payload":{"commandId":"march-p1-attack-blind","code":"SCOUT_REQUIRED","message":"Scout this village before committing an attack march.","currentWorldVersion":3}}
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"march-p1-scout-self","expectedWorldVersion":3,"command":{"type":"march.launch","payload":{"fromVillageId":"village-1-capital","targetVillageId":"village-1-capital","kind":"scout","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} -> 409 {"type":"command.rejected","payload":{"commandId":"march-p1-scout-self","code":"INVALID_TARGET","message":"Choose a foreign village in this world.","currentWorldVersion":3}}
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"march-p1-scout-mixed","expectedWorldVersion":3,"command":{"type":"march.launch","payload":{"fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"scout","army":{"militia":0,"spear":5,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} -> 409 {"type":"command.rejected","payload":{"commandId":"march-p1-scout-mixed","code":"INVALID_ARMY","message":"Scouting marches may contain scouts only.","currentWorldVersion":3}}
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"march-p1-support","expectedWorldVersion":3,"command":{"type":"march.launch","payload":{"fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"support","army":{"militia":0,"spear":5,"sword":0,"axe":0,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} -> 409 {"type":"command.rejected","payload":{"commandId":"march-p1-support","code":"INVALID_ARMY","message":"Send a valid scout or attack formation with at least one troop.","currentWorldVersion":3}}
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"march-p1-scout-4","expectedWorldVersion":3,"command":{"type":"march.launch","payload":{"fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"scout","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":4,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} -> 409 {"type":"command.rejected","payload":{"commandId":"march-p1-scout-4","code":"INSUFFICIENT_TROOPS","message":"Those troops are not available in the departure village.","currentWorldVersion":3}}
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox WHERE 1=1;"
  5
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_marches WHERE 1=1;"
  0
  -> exit 0
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|1|March One's Realm Keep
  -> exit 0
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"march-p1-attack-blind","expectedWorldVersion":3,"command":{"type":"march.launch","payload":{"fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"attack","army":{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} -> 409 {"type":"command.rejected","payload":{"commandId":"march-p1-attack-blind","code":"SCOUT_REQUIRED","message":"Scout this village before committing an attack march.","currentWorldVersion":3}}
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox WHERE 1=1;"
  5
  -> exit 0
[step 3] PASS — blind → 409 SCOUT_REQUIRED "Scout this village before committing an attack march."; self → 409 INVALID_TARGET "Choose a foreign village in this world."; mixed → 409 INVALID_ARMY "Scouting marches may contain scouts only."; support → 409 INVALID_ARMY "Send a valid scout or attack formation with at least one troop."; too-many → 409 INSUFFICIENT_TROOPS "Those troops are not available in the departure village."; 5 inbox rows, 0 march rows, army {"spear":10,"axe":20,"scout":3,"ram":1} unchanged, world version 3 unchanged; SCOUT_REQUIRED replayed byte-identically

## Step 4 — E1 — p1 sends one Spy at p2's village: accepted, the march row and the snapshot agree, the Spy has left the village (server-mustered), arrivesAt − departedAt equals marchDurationSeconds(distance, 'scout', {scout:1}) from game-core; the same commandId replayed with a stale world version returns the byte-identical result and launches nothing
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|1|March One's Realm Keep
  -> exit 0
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"march-p1-scout-p2","expectedWorldVersion":3,"command":{"type":"march.launch","payload":{"fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"scout","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} -> 200 {"type":"command.accepted","payload":{"commandId":"march-p1-scout-p2","worldVersion":4,"march":{"id":"march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f","worldId":"world-7c7d5ae2","kingdomId":"kingdom-1","fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"scout","status":"outbound","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCa… (576 bytes)
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":2,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|2|March One's Realm Keep
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = 'kingdom-1' ORDER BY rowid;"
  march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f|scout|outbound|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:07.707Z|2026-09-20T06:50:24.707Z|village-2-capital
  -> exit 0
POST /api/roblox/state {"robloxUserIds":[960001]} -> 200 (13949 bytes; marches 1, scoutReports 0, notifications 0)
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox WHERE 1=1;"
  6
  -> exit 0
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"march-p1-scout-p2","expectedWorldVersion":3,"command":{"type":"march.launch","payload":{"fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"scout","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} -> 200 {"type":"command.accepted","payload":{"commandId":"march-p1-scout-p2","worldVersion":4,"march":{"id":"march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f","worldId":"world-7c7d5ae2","kingdomId":"kingdom-1","fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"scout","status":"outbound","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCa… (576 bytes)
$ sqlite3 <db> "SELECT count(*) FROM local_marches WHERE 1=1;"
  1
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_command_inbox WHERE 1=1;"
  6
  -> exit 0
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":2,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|2|March One's Realm Keep
  -> exit 0
[step 4] PASS — scout march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f outbound, departed 2026-09-20T06:50:07.707Z, arrives 2026-09-20T06:50:24.707Z (17s = 8 + 22.8473 × 0.8 × 9/18, rounded); village Spies 3 → 2 at launch; replay with expectedWorldVersion 3 byte-identical, still 1 march row, still 2 Spies; p2 sees no march, no report, all 3 of its Spies

## Step 5 — E1 — outage-proof: the server is stopped while the Spy is on the road and stays down past arrivesAt; while down the DB row is frozen (still 'outbound', no report); after the restart the very first pull carries the scout report stamped with the ORIGINAL arrivesAt, the march is 'returning', and the launch commandId still replays byte-identically
$ kill -TERM <world server pid 3267>
  -> world server exited (code 0, signal null) at 2026-09-20T06:50:08.754Z
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = 'kingdom-1' ORDER BY rowid;"
  march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f|scout|outbound|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:07.707Z|2026-09-20T06:50:24.707Z|village-2-capital
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_scout_reports WHERE 1=1;"
  0
  -> exit 0
server down; waiting 18s so the Spy's arrivesAt 2026-09-20T06:50:24.707Z passes with nobody home to record it
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = 'kingdom-1' ORDER BY rowid;"
  march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f|scout|outbound|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:07.707Z|2026-09-20T06:50:24.707Z|village-2-capital
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_scout_reports WHERE 1=1;"
  0
  -> exit 0
$ (cd server && KINGSAGE_DATABASE_PATH=/tmp/kingsmarch-marches-Wg46I3/world.sqlite KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_DEV_SEED_ARMY=axe:20,spear:10,scout:3,ram:1 KINGSAGE_BIND=127.0.0.1 PORT=4261 node --experimental-strip-types src/index.ts &)   # world server (restart, same DB)
  [server] KingSage shared world listening at http://127.0.0.1:4261/?world=shared
Persistent local database: /tmp/kingsmarch-marches-Wg46I3/world.sqlite
GET /api/health -> 200 {"ok":true,"service":"kingsage-world","contractVersion":1} (restart requested 2026-09-20T06:50:27.224Z)
POST /api/roblox/state {"robloxUserIds":[960001]} -> 200 (14905 bytes; marches 1, scoutReports 1, notifications 1)
return leg: arrivesAt 2026-09-20T06:50:51.432Z − 24s = 2026-09-20T06:50:27.432Z, i.e. the homeward walk began 2.725s AFTER the arrival it reported (the leg is measured from catch-up, not from the arrival; observed, not judged)
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"march-p1-scout-p2","expectedWorldVersion":3,"command":{"type":"march.launch","payload":{"fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"scout","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} -> 200 {"type":"command.accepted","payload":{"commandId":"march-p1-scout-p2","worldVersion":4,"march":{"id":"march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f","worldId":"world-7c7d5ae2","kingdomId":"kingdom-1","fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"scout","status":"outbound","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCa… (576 bytes)
$ sqlite3 <db> "SELECT count(*) FROM local_marches WHERE 1=1;"
  1
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_scout_reports WHERE 1=1;"
  1
  -> exit 0
[step 5] PASS — stopped 2026-09-20T06:50:08.754Z (Spy due 2026-09-20T06:50:24.707Z); row frozen 'outbound' with no report for the whole outage; restarted 2026-09-20T06:50:27.224Z; first pull: report scout-report-b8b02cf8-dd3d-4fdd-a901-fbfdee855452 createdAt == arrivesAt exactly, notification "Scout report ready: March Two's Realm Keep." at arrivesAt, march 'returning' (homeward 24s leg began 2.725s after the arrival — observed, not judged); launch replay byte-identical; 1 march, 1 report

## Step 6 — D1 — the report is the only way past the fog: observedArmy / observedBuildings / observedRealmOfPower equal p2's DB row (the distinctive seed army, not zeros), observedResources within the 28/h trickle, targetVillageVersion equals the row; in the SAME snapshot p2's village is still fogged; p2 has no report, no march, no notification, and every Spy
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-2-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|1|March Two's Realm Keep
  -> exit 0
report scout-report-b8b02cf8-dd3d-4fdd-a901-fbfdee855452: observedArmy {"spear":10,"axe":20,"scout":3,"ram":1}, observedBuildings {"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}, observedResources {"wood":1200,"stone":1000,"iron":800}, realm power 294/294, targetVillageVersion 1; same snapshot's world.villages entry for village-2-capital: resources {"wood":0,"stone":0,"iron":0}, buildings all 0, army empty, realmOfPower 0/0, horses 0/0
[step 6] PASS — report equals p2's row: army {"spear":10,"axe":20,"scout":3,"ram":1}, buildings hq 1/wall 1, resources within 1 of {"wood":1200,"stone":1000,"iron":800}, realm power 294/294 (= settlementPoints), version 1; the same snapshot still fogs the village to zeros; p2 sees no march, no report, no notification (nothing tells a village it was scouted — observed, not judged) and holds all 3 Spies

## Step 7 — D2 + E1 — the event stream wears the reader's fog: W's /api/world/events?since=0 carries the public kingdom.claimed rows and none of p1's march or report events although the DB holds them; a live /api/world/stream for W receives nothing when p1 launches two attacks (Berserkers alone; Berserkers + one Ram, paced by the Ram) and receives W's own march.changed the moment W scouts; both attacks are accepted only because p2 was scouted; muster and troop conservation hold
GET /api/world/events?since=0 (web session cookie) -> 200 currentWorldVersion 5; 3 events: ["kingdom.claimed","kingdom.claimed","kingdom.claimed"]
$ sqlite3 <db> "SELECT count(*) FROM local_world_events WHERE event_type IN ('march.changed','scout.report.ready');"
  2
  -> exit 0
GET /api/world/stream?since=5 (web session cookie, w) -> 200 text/event-stream; charset=utf-8
W's stream ready: {"worldVersion":5}
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":2,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|2|March One's Realm Keep
  -> exit 0
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"march-p1-attack-axes","expectedWorldVersion":5,"command":{"type":"march.launch","payload":{"fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"attack","army":{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} -> 200 {"type":"command.accepted","payload":{"commandId":"march-p1-attack-axes","worldVersion":6,"march":{"id":"march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f","worldId":"world-7c7d5ae2","kingdomId":"kingdom-1","fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"attack","status":"outbound","army":{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"he… (581 bytes)
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"march-p1-attack-axes-ram","expectedWorldVersion":6,"command":{"type":"march.launch","payload":{"fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"attack","army":{"militia":0,"spear":0,"sword":0,"axe":5,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}}}} -> 200 {"type":"command.accepted","payload":{"commandId":"march-p1-attack-axes-ram","worldVersion":7,"march":{"id":"march-48d8a787-e31c-438e-8c4a-37d07f6ff995","worldId":"world-7c7d5ae2","kingdomId":"kingdom-1","fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"attack","status":"outbound","army":{"militia":0,"spear":0,"sword":0,"axe":5,"archer":0,"scout":0,"lightCavalry":0,… (584 bytes)
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":5,"archer":0,"scout":2,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|294|0|4|March One's Realm Keep
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = 'kingdom-1' ORDER BY rowid;"
  march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f|scout|returning|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:07.707Z|2026-09-20T06:50:51.432Z|village-2-capital
  march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f|attack|outbound|{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:27.487Z|2026-09-20T06:51:06.487Z|village-2-capital
  march-48d8a787-e31c-438e-8c4a-37d07f6ff995|attack|outbound|{"militia":0,"spear":0,"sword":0,"axe":5,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|2026-09-20T06:50:27.500Z|2026-09-20T06:51:25.500Z|village-2-capital
  -> exit 0
$ sqlite3 <db> "SELECT march_id || '|' || plan_json || '|' || coalesce(auto_resolve_at, 'NULL') FROM local_march_plans WHERE march_id IN ('march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f','march-48d8a787-e31c-438e-8c4a-37d07f6ff995') ORDER BY rowid;"
  march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f|{"entry":"Main Breach","troops":"Balanced Army","time":"Midday","style":"Full Assault"}|NULL
  march-48d8a787-e31c-438e-8c4a-37d07f6ff995|{"entry":"Main Breach","troops":"Balanced Army","time":"Midday","style":"Full Assault"}|NULL
  -> exit 0
W's live stream 1.5 s after p1's two launches: 0 events
POST /api/world/commands {"contractVersion":1,"commandId":"march-w-scout-p2","worldId":"world-7c7d5ae2","actorPlayerId":"player-462bbb17-8ed2-4bdd-a012-64a9497587b5","expectedWorldVersion":7,"issuedAt":"2026-09-20T06:50:29.018Z","command":{"type":"march.launch","payload":{"fromVillageId":"village-3-capital","targetVillageId":"village-2-capital","kind":"scout","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} (web session cookie) -> 200 {"type":"command.accepted","payload":{"commandId":"march-w-scout-p2","worldVersion":8,"march":{"id":"march-6e685f37-ebc8-46d3-8112-0554ec96efb2","worldId":"world-7c7d5ae2","kingdomId":"kingdom-3","fromVillageId":"village-3-capital","targetVillageId":"village-2-capital","kind":"scout","status":"outbound","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCav… (575 bytes)
W's live stream 1.5 s after W's own launch: 1 event — march.changed for march-6e685f37-ebc8-46d3-8112-0554ec96efb2 (army {"scout":1}, village village-3-capital)
GET /api/world/events?since=0 (web session cookie) -> 200 currentWorldVersion 8; 4 events: ["kingdom.claimed","kingdom.claimed","kingdom.claimed","march.changed"]
$ sqlite3 <db> "SELECT count(*) FROM local_world_events WHERE event_type IN ('march.changed','march.arrived','march.completed','scout.report.ready');"
  5
  -> exit 0
[step 7] PASS — W's replay: 3 events, 3 kingdom.claimed, 0 private, while the DB held 2 private rows; A march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f 39s (12 + 22.8473 × 1.2 × 18/18), B march-48d8a787-e31c-438e-8c4a-37d07f6ff995 58s (… × 30/18 — the Ram sets the pace); both accepted because p2 was scouted; Berserkers 20 → 5, Rams 1 → 0; home + in flight = seed; plans UNPLANNED with auto_resolve_at NULL; W's live stream: 0 events for p1's two launches, exactly its own march.changed for march-6e685f37-ebc8-46d3-8112-0554ec96efb2; W's replay shows only its own march; p1's snapshot lists only p1's 3 marches; 5 private event rows in the DB by now

## Step 8 — E2 (server half, observed) — p1 recalls attack B while it is outbound: the row turns 'returning' from where it stood and the walk back costs exactly what the walk out had cost; p2's attempt to recall p1's attack A → FORBIDDEN; A keeps marching
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"march-p1-cancel-b","expectedWorldVersion":8,"command":{"type":"march.cancel","payload":{"marchId":"march-48d8a787-e31c-438e-8c4a-37d07f6ff995"}}} -> 200 {"type":"command.accepted","payload":{"commandId":"march-p1-cancel-b","worldVersion":9,"march":{"id":"march-48d8a787-e31c-438e-8c4a-37d07f6ff995","worldId":"world-7c7d5ae2","kingdomId":"kingdom-1","fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"attack","status":"returning","army":{"militia":0,"spear":0,"sword":0,"axe":5,"archer":0,"scout":0,"lightCavalry":0,"heavy… (578 bytes)
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = 'kingdom-1' ORDER BY rowid;"
  march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f|scout|returning|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:07.707Z|2026-09-20T06:50:51.432Z|village-2-capital
  march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f|attack|outbound|{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:27.487Z|2026-09-20T06:51:06.487Z|village-2-capital
  march-48d8a787-e31c-438e-8c4a-37d07f6ff995|attack|returning|{"militia":0,"spear":0,"sword":0,"axe":5,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|2026-09-20T06:50:30.565Z|2026-09-20T06:50:33.630Z|village-2-capital
  -> exit 0
POST /api/roblox/commands {"robloxUserId":960002,"commandId":"march-p2-cancel-p1-a","expectedWorldVersion":9,"command":{"type":"march.cancel","payload":{"marchId":"march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"march-p2-cancel-p1-a","code":"FORBIDDEN","message":"That march does not answer to you.","currentWorldVersion":9}}
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = 'kingdom-1' ORDER BY rowid;"
  march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f|scout|returning|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:07.707Z|2026-09-20T06:50:51.432Z|village-2-capital
  march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f|attack|outbound|{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:27.487Z|2026-09-20T06:51:06.487Z|village-2-capital
  march-48d8a787-e31c-438e-8c4a-37d07f6ff995|attack|returning|{"militia":0,"spear":0,"sword":0,"axe":5,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|2026-09-20T06:50:30.565Z|2026-09-20T06:50:33.630Z|village-2-capital
  -> exit 0
[step 8] PASS — B recalled at 2026-09-20T06:50:30.565Z: 3.065s out → 'returning' with a 3.065s walk back, due 2026-09-20T06:50:33.630Z; notification "6 troops turned for home." at the recall instant; p2's recall of A → 409 FORBIDDEN "That march does not answer to you."; A still outbound, due 2026-09-20T06:51:06.487Z

## Step 9 — D3 — freshness at the walls: A arrives and waits ('awaiting_battle'; auto_resolve_at = arrivesAt + 120 s exactly; recall → MARCH_COMMITTED); battle.open with a version p1 never held → STALE_SCOUT_REPORT; p2 then sends one Spy out (its garrison changes); battle.open with the EXACT version the report carries → STALE_SCOUT_REPORT too; no battle session exists. The acceptance path of battle.open is NOT exercised — that is the battle-settle slice
waiting 36s for attack A to reach the walls at 2026-09-20T06:51:06.487Z (server running)
A at the walls (observed 2026-09-20T06:51:06.533Z): {"id":"march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f","worldId":"world-7c7d5ae2","kingdomId":"kingdom-1","fromVillageId":"village-1-capital","targetVillageId":"village-2-capital","kind":"attack","status":"awaiting_battle","army":{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0},"loot":{"wood":0,"stone":0,"iron":0},"departedAt":"2026-09-20T06:50:27.487Z","arrivesAt":"2026-09-20T06:51:06.487Z","battleId":null}
$ sqlite3 <db> "SELECT auto_resolve_at FROM local_march_plans WHERE march_id = 'march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f';"
  2026-09-20T06:53:06.487Z
  -> exit 0
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"march-p1-cancel-a-late","expectedWorldVersion":13,"command":{"type":"march.cancel","payload":{"marchId":"march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f"}}} -> 409 {"type":"command.rejected","payload":{"commandId":"march-p1-cancel-a-late","code":"MARCH_COMMITTED","message":"They can see the walls — there is no turning back now.","currentWorldVersion":13}}
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"battle-p1-open-wrong-version","expectedWorldVersion":13,"command":{"type":"battle.open","payload":{"marchId":"march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f","targetVillageVersion":1001,"plan":{"entry":"Main Breach","troops":"Balanced Army","time":"Midday","style":"Full Assault"}}}} -> 409 {"type":"command.rejected","payload":{"commandId":"battle-p1-open-wrong-version","code":"STALE_SCOUT_REPORT","message":"The defender changed after your report. Scout again before opening battle.","currentWorldVersion":13}}
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-2-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|1|March Two's Realm Keep
  -> exit 0
POST /api/roblox/commands {"robloxUserId":960002,"commandId":"march-p2-scout-p1","expectedWorldVersion":13,"command":{"type":"march.launch","payload":{"fromVillageId":"village-2-capital","targetVillageId":"village-1-capital","kind":"scout","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}}}} -> 200 {"type":"command.accepted","payload":{"commandId":"march-p2-scout-p1","worldVersion":14,"march":{"id":"march-7e0c17ab-8231-46f4-ac86-0d824d1ff155","worldId":"world-7c7d5ae2","kingdomId":"kingdom-2","fromVillageId":"village-2-capital","targetVillageId":"village-1-capital","kind":"scout","status":"outbound","army":{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyC… (577 bytes)
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-2-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":2,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|2|March Two's Realm Keep
  -> exit 0
POST /api/roblox/commands {"robloxUserId":960001,"commandId":"battle-p1-open-right-version","expectedWorldVersion":14,"command":{"type":"battle.open","payload":{"marchId":"march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f","targetVillageVersion":1,"plan":{"entry":"Main Breach","troops":"Balanced Army","time":"Midday","style":"Full Assault"}}}} -> 409 {"type":"command.rejected","payload":{"commandId":"battle-p1-open-right-version","code":"STALE_SCOUT_REPORT","message":"The defender changed after your report. Scout again before opening battle.","currentWorldVersion":14}}
$ sqlite3 <db> "SELECT count(*) FROM local_battle_sessions WHERE 1=1;"
  0
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = 'kingdom-1' ORDER BY rowid;"
  march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f|scout|complete|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:07.707Z|2026-09-20T06:50:51.432Z|village-2-capital
  march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f|attack|awaiting_battle|{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:27.487Z|2026-09-20T06:51:06.487Z|village-2-capital
  march-48d8a787-e31c-438e-8c4a-37d07f6ff995|attack|complete|{"militia":0,"spear":0,"sword":0,"axe":5,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|2026-09-20T06:50:30.565Z|2026-09-20T06:50:33.630Z|village-2-capital
  -> exit 0
p2's view with 10 Berserkers at its walls: marches 1 (its own Spy), battleSessions 0, notifications [] (nothing tells the defender an army has arrived — the march.arrived event is the attacker's; observed, not judged)
[step 9] PASS — A awaiting_battle at 2026-09-20T06:51:06.533Z (due 2026-09-20T06:51:06.487Z); auto_resolve_at 2026-09-20T06:53:06.487Z = arrivesAt + 120 s; recall → 409 MARCH_COMMITTED; battle.open @version 1001 → 409 STALE_SCOUT_REPORT; p2's Spies 3 → 2; battle.open @version 1 (the report's own) → 409 STALE_SCOUT_REPORT "The defender changed after your report. Scout again before opening battle."; 0 battle sessions; A still at the walls with 10 Berserkers

## Step 10 — conservation and the way home: p1's Spy and recalled B come home at exactly their arrivesAt with 'march.completed' notifications stamped there; W's Spy reports and turns home, and W's event replay carries its own scout.report.ready; home + in flight = seed for p1 and W throughout; the world is stopped before A's auto_resolve_at so no battle is fought
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = 'kingdom-1' ORDER BY rowid;"
  march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f|scout|complete|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:07.707Z|2026-09-20T06:50:51.432Z|village-2-capital
  march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f|attack|awaiting_battle|{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:27.487Z|2026-09-20T06:51:06.487Z|village-2-capital
  march-48d8a787-e31c-438e-8c4a-37d07f6ff995|attack|complete|{"militia":0,"spear":0,"sword":0,"axe":5,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|2026-09-20T06:50:30.565Z|2026-09-20T06:50:33.630Z|village-2-capital
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = 'kingdom-1' ORDER BY rowid;"
  march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f|scout|complete|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:07.707Z|2026-09-20T06:50:51.432Z|village-2-capital
  march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f|attack|awaiting_battle|{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:27.487Z|2026-09-20T06:51:06.487Z|village-2-capital
  march-48d8a787-e31c-438e-8c4a-37d07f6ff995|attack|complete|{"militia":0,"spear":0,"sword":0,"axe":5,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|2026-09-20T06:50:30.565Z|2026-09-20T06:50:33.630Z|village-2-capital
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = 'kingdom-3' ORDER BY rowid;"
  march-6e685f37-ebc8-46d3-8112-0554ec96efb2|scout|returning|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:29.026Z|2026-09-20T06:51:25.357Z|village-2-capital
  -> exit 0
GET /api/world/events?since=0 (web session cookie) -> 200 currentWorldVersion 14; 5 events: ["kingdom.claimed","kingdom.claimed","kingdom.claimed","march.changed","scout.report.ready"]
W's report: observedArmy {"spear":10,"axe":20,"scout":3,"ram":1} — W's Spy arrived at 2026-09-20T06:50:52.026Z, before p2's own Spy left at 2026-09-20T06:51:06.581Z
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-1-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":10,"archer":0,"scout":3,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|6|March One's Realm Keep
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = 'kingdom-1' ORDER BY rowid;"
  march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f|scout|complete|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:07.707Z|2026-09-20T06:50:51.432Z|village-2-capital
  march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f|attack|awaiting_battle|{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:27.487Z|2026-09-20T06:51:06.487Z|village-2-capital
  march-48d8a787-e31c-438e-8c4a-37d07f6ff995|attack|complete|{"militia":0,"spear":0,"sword":0,"axe":5,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|2026-09-20T06:50:30.565Z|2026-09-20T06:50:33.630Z|village-2-capital
  -> exit 0
$ sqlite3 <db> "SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = 'village-3-capital';"
  {"wood":1200,"stone":1000,"iron":800}|{"hq":1,"timber":1,"quarry":1,"iron":1,"farm":1,"warehouse":1,"barracks":1,"wall":1,"academy":0,"stable":0,"workshop":0,"smithy":0,"market":0}|{"militia":0,"spear":10,"sword":0,"axe":20,"archer":0,"scout":2,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|294|0|2|The Watchers Keep
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = 'kingdom-3' ORDER BY rowid;"
  march-6e685f37-ebc8-46d3-8112-0554ec96efb2|scout|returning|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:29.026Z|2026-09-20T06:51:25.357Z|village-2-capital
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_scout_reports WHERE kingdom_id = 'kingdom-1';"
  1
  -> exit 0
$ sqlite3 <db> "SELECT count(*) FROM local_scout_reports WHERE kingdom_id = 'kingdom-3';"
  1
  -> exit 0
$ kill -TERM <world server (before A's auto_resolve_at) pid 3300>
  -> world server (before A's auto_resolve_at) exited (code 0, signal null) at 2026-09-20T06:51:06.665Z
$ sqlite3 <db> "SELECT count(*) FROM local_battle_sessions WHERE 1=1;"
  0
  -> exit 0
$ sqlite3 <db> "SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = 'kingdom-1' ORDER BY rowid;"
  march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f|scout|complete|{"militia":0,"spear":0,"sword":0,"axe":0,"archer":0,"scout":1,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:07.707Z|2026-09-20T06:50:51.432Z|village-2-capital
  march-b9e9d553-f60d-44ba-8931-38ec4fe9e74f|attack|awaiting_battle|{"militia":0,"spear":0,"sword":0,"axe":10,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":0,"trebuchet":0,"noble":0}|2026-09-20T06:50:27.487Z|2026-09-20T06:51:06.487Z|village-2-capital
  march-48d8a787-e31c-438e-8c4a-37d07f6ff995|attack|complete|{"militia":0,"spear":0,"sword":0,"axe":5,"archer":0,"scout":0,"lightCavalry":0,"heavyCavalry":0,"ram":1,"trebuchet":0,"noble":0}|2026-09-20T06:50:30.565Z|2026-09-20T06:50:33.630Z|village-2-capital
  -> exit 0
[step 10] PASS — march-305ab3d6-90f0-42b9-ac97-be68ab4ad78f complete, "1 troops returned to March One's Realm Keep." at 2026-09-20T06:50:51.432Z; march-48d8a787-e31c-438e-8c4a-37d07f6ff995 complete, "6 troops returned to March One's Realm Keep." at 2026-09-20T06:50:33.630Z; W's report event: kingdom kingdom-3, createdAt == its Spy's arrivesAt, observedArmy {"spear":10,"axe":20,"scout":3,"ram":1} (all three of p2's Spies still home); p1 home {"spear":10,"axe":10,"scout":3,"ram":1} + at the walls {"axe":10} = seed; W home {"spear":10,"axe":20,"scout":2,"ram":1} + in flight {"scout":1} = seed; 1 report each; server stopped 2026-09-20T06:51:06.665Z, 119.8s before A's auto_resolve_at 2026-09-20T06:53:06.487Z; A left 'awaiting_battle'; 0 battle sessions

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
D1–D3/E1 marches + fog drill PASS (10/10 steps PASS)
scratch dir removed: /tmp/kingsmarch-marches-Wg46I3
```
