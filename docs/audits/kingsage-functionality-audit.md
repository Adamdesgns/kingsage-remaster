# Kingsmarch — Full Functionality Audit

**Date:** 2026-08-29 · **Branch:** `main` @ `c9e1e5c` (worktree clean) · **Auditor:** Claude (Lead Systems Auditor)
**Method:** read-only code inspection, full test-gate runs, and a live end-to-end exercise of the world server against a scratch database. No production code was modified. No production database exists to touch — every database in this repo is a local dev artifact.

---

## 1. EXECUTIVE VERDICT

**What this project currently is:** a genuinely server-authoritative vertical slice of a KingsAge-style war game, playable end to end — join, build, recruit, scout, attack, attend the battle, conquer — by one to six players **in Roblox Studio on the developer's PC only**. The authority architecture is real, not aspirational: I booted the world server cold, drove the actual Roblox HTTP path with raw requests, and watched idempotent replay, optimistic-version conflicts, cross-player `FORBIDDEN`, bad-key 401, restart recovery, and server-timed build/recruit completion all behave correctly. The war engine (class-vs-class combat, rams, surrender, Realm-of-Power multi-wave conquest) is deterministic, atomic, and covered by 189 green tests that would genuinely fail if the behavior were deleted.

**What it is not:** a persistent-world MMO, or anything a player who is not Adam can currently play. Three walls stand between the slice and the intended world:

1. **Nobody can reach it.** The server binds `127.0.0.1` in source ([index.ts:57](../../server/src/index.ts)), the Roblox client hardcodes `http://127.0.0.1:4178` ([Config.luau:2](../../roblox/src/shared/Config.luau)), and there is zero hosting, deploy, CI, backup, or logging infrastructure anywhere in the repo. Published Roblox servers cannot reach loopback — the repo's own README says so. This is a **known, deliberately deferred** decision (roadmap 4.1), but it is the load-bearing blocker for everything.
2. **The world is six seats and shrinking.** One fixed world, 10 settlements, 6 claimable kingdom seats, `WORLD_FULL` at player 7, no way to found a settlement, no win condition, no reset, no second world. The world can only concentrate, never grow.
3. **The social and living-world half does not exist.** Alliances, market, trade, reinforcements, diplomacy: type declarations and a dead Postgres migration — every alliance command is rejected `INVALID_COMMAND` at the server allowlist ([store.ts:986](../../server/src/store.ts)). The AI kingdoms are built, tested, and deterministic — and **have never run outside their own test file**, because nothing anywhere sets `KINGSAGE_AI_TICK_MS`, including the dev loop everyone uses.

**Distance from a functioning persistent-world MMO:** the single-player-loop foundation is roughly done and unusually well-tested. What remains is (a) hosting + transport hardening, (b) world capacity and lifecycle, (c) the multiplayer/social layer, (d) turning the AI on. That is months of work, but it is *buildable* work on a foundation that will hold it — the locked architecture is honored in the code, not just in the docs.

---

## 2. AUDIT SCOPE AND METHOD

**Read in full or in load-bearing part:** `docs/AI-TEAM-BRIEFING.md`, `docs/design/CANONICAL-BRIEF.md`, `docs/ROADMAP-2026-08.md`, `README.md`, `AGENTS.md`, `HANDBACK.md`, all handoffs/handbacks, `server/src/*` (store.ts 2,611 lines, http.ts, index.ts, ai.ts), all 10 migrations, `server/contracts/command-protocol.md`, `packages/game-core/src/*` (7 modules), all 27 test files, all of `roblox/src/*` (14,655 lines total across the three runtimes), `roblox/scripts/*` (Lune gates), `roblox/start-dev.ps1`, all three Rojo projects, `scripts/*.mjs`, and the archived `index.html` / `mobile-rebuild/` surface. Four parallel read-only audit passes covered: server authority core; Roblox layer; combat/movement/conquest/AI/social; world model/ops/tests/archive.

**Ran (all green):**

| Command | Result |
|---|---|
| `npm run check:types` | clean (game-core + server/src) |
| `npm run test:server` | **97/97 pass** (incl. the formerly-stale Luau contract test, via Lune 0.10.5) |
| `npm run test:core` | **92/92 pass** |
| `npm run test:luau` | syntax check, 63-rule rules-check, 7-check spike-sim — all pass |

**Live exercise (scratch DB in the session scratchpad, port 4179, throwaway key — no repo data touched):**
health check → bad-key 401 → `/api/roblox/session` link (new player, seat claimed) → `/api/roblox/state` snapshot → `village.build.queue` accepted (12-min server timer) → **exact replay returned the stored result, same job id, no duplicate** → stale `expectedWorldVersion` → `WORLD_VERSION_CONFLICT` → second player's build into player 1's village → `FORBIDDEN` → **server killed and restarted on the same DB: world version, job, player id, and the idempotency record all survived; replay after restart still returned the original stored result** → `village.recruit.queue` 2 spears → recruitment completed at exactly its `completesAt` with a "2 Squires joined the army" notification → construction completed at exactly its `completesAt` ("Timber Camp reached level 2").

**Could not verify (and why):** live Studio behavior (no Studio automation in this session — the Roblox client layer is assessed from code plus the repo's own Lune gates and dated drill records); phone performance (the repo's own instrument exists but the measurement is Adam's, per HANDOFF-2026-08-28); the AI tick as a live system (nothing enables it — enabling it would have been a config change, out of audit scope); killed-process WAL recovery (would require deliberately hard-killing a server mid-write; safe test described in §13); concurrency under simultaneous requests (no test exists; safe test described in §13).

---

## 3. SOURCE OF TRUTH

**Governing hierarchy, as the repo itself declares it:**

1. `docs/AI-TEAM-BRIEFING.md` — binding for all agents (architecture locks, gates, honest-reporting bar).
2. `docs/design/CANONICAL-BRIEF.md` — design truth; its "Decisions already locked" section is law.
3. `docs/superpowers/specs/2026-08-20-roblox-world-is-the-game-design.md` — the approved design behind the brief.
4. `server/contracts/command-protocol.md` — the command/event protocol (partially web-era; see conflicts).
5. `docs/ROADMAP-2026-08.md` — current month plan.
6. Task handoffs in `docs/` — sit on top, never override.

**Conflicts between the audit brief's locked decisions and the repository (reported, not silently resolved):**

| Audit-brief lock | Repository reality | Verdict |
|---|---|---|
| "PostgreSQL is the authoritative source of world state" | **SQLite (`node:sqlite`) is the intentional authoritative store.** `0001_gate_a_world.sql` is Postgres and is *never executed* — [server/README.md](../../server/README.md) explicitly frames the SQLite adapter as chosen "because this PC has no Postgres or Docker service," and migration `0002` is literally named `gate_b_local_sqlite`. | **Intentionally superseded** for the current phase. The Postgres schema survives as a frozen design contract — and has drifted from the live schema (it has alliances, `player_capacity 50`, world lifecycle columns; the SQLite runtime has none of them). |
| "The world runs continuously on a paid, always-on backend" | Decided (CANONICAL-BRIEF lock #2) but **not implemented** — deferred by choice (roadmap 4.1). Server is loopback-only. | Decision stands; implementation missing. |
| All other locks (Roblox-only client, web game archived, Roblox-is-a-window, idempotent commands, UserId auth, deterministic server authority, Adam's authority) | Honored in code, verified in this audit. | Hold. |

**Documents that now misreport reality (fix the note, not the code):**

- `docs/AI-TEAM-BRIEFING.md:44-47` — tells every agent to expect "80 pass / 1 fail" with a known-stale Luau contract test. **That test was repaired and merged** (branch `feat/test-debt-robob`, ancestor of `main`); the suite is 97/97. A binding doc instructing agents to tolerate a failure that no longer exists will mask a real regression of exactly that test.
- `HANDBACK.md:4` — says slice 4 was "never committed to `main`". Its tip is literally `main~1`. **Every branch, local and remote, is fully merged into `main`** (verified per-branch with `git rev-list --left-right --count`); nine stale branch refs remain unpruned.
- Root `README.md` — still describes the archived web prototype as the product.
- `server/contracts/command-protocol.md` — the authoritative-transaction section matches the code, but the Phaser/battle-streaming and realtime-channel sections describe the retired web client; the per-player/alliance event channels it specifies were never built (and their absence is now a security finding, §12.1).
- `contracts.test.ts:21` asserts the fixture's "two human seats" while [store.ts:565](../../server/src/store.ts) deliberately overwrites both to `'ai'` open seats — the test pins the fixture, not the world players see.

---

## 4. REPOSITORY AND RUNTIME MAP

| Component | Path | Owns | Status |
|---|---|---|---|
| **World server** (the authority) | `server/src/` — store.ts (2,611 L), http.ts, index.ts, ai.ts | ALL game state: accounts, seats, economy, queues, marches, battles, conquest, events, notifications. SQLite via `node:sqlite`, WAL, `BEGIN IMMEDIATE` transactions, zero runtime deps, `--experimental-strip-types`. | Live-verified this audit |
| **Shared rules** | `packages/game-core/src/` — combat, warfare, economy, horses, contracts, fixture | Pure deterministic game math + the command/event contract types. Consumed by server and (via parity tests) mirrored in Luau. | 92/92 tests |
| **Roblox server script** | `roblox/src/server/` — WorldSession, CommandService, ApiClient, SettlementBuilder, WarTable | The only HTTP speaker; holds the shared secret (gitignored `SecretConfig.luau`, never in git history); batches one state pull per 10s for the whole server; validates and forwards commands; holds no authority. | Code-verified |
| **Roblox client** | `roblox/src/client/` — init.client.luau (2,618 L), BattleScene, Paddock, Villagers, Celebration | Rendering and asking only. HUD, village/war-table UI, battle scene (no Humanoids, one BulkMoveTo/frame), owner-only detail via PlayerGui. | Code-verified |
| **Shared Luau** | `roblox/src/shared/` — Config, Buildings, BattleConfig, TimeUtil, specs | Mirrors of game-core constants; cross-language drift guarded by `rules-check.luau` (63 executed rules) + `roster-parity.test.ts` + `roblox-luau-contract.test.ts` (the one true TS↔Luau seam test). | Gates green |
| **Lune gates** | `roblox/scripts/` | Syntax compile, 63 executed rules, spike simulation check, muster CLI bridge, manual evidence-run checklist. | Green |
| **Gate scripts** | `scripts/` | `check-types.mjs` (real, fails closed); `check-gate-{a..d}.mjs` (substring greps — shallow). | — |
| **Archived web game** | `index.html` (117 KB, frozen 08-15) | Nothing. Inert. But it contains terrain, 14 AI kingdoms, alliances, 40% dominance victory, world cycling — features designed there and never ported. | Reference only |
| **Archived phone client** | `mobile-rebuild/` (frozen 08-16) | **Not inert:** `test:gate-a` builds it, `check-types.mjs` borrows its `tsc`, four gate scripts grep its source, and the server serves its `dist/` as default static root — while it imports live game-core it no longer understands (no Realm of Power, no 11-unit roster, no horses). A standing gate-breakage risk. | Load-bearing zombie |
| **AI kingdoms** | `server/src/ai.ts` + test | One action per AI village per tick: BUILD→RECRUIT→SCOUT→RAID, same command paths as players, deterministic, env-gated. | Built, tested, **never enabled** |

---

## 5. CURRENT PLAYABLE LOOP

**Framing 1 — a real player on their own device (the product's definition):** **nothing works.** Step 0 fails: a published Roblox server cannot reach `127.0.0.1`, so the join handshake never completes and the player sits on the holding screen forever. The last fully working step for a remote player is *none*.

**Framing 2 — on the dev PC, in Studio, via `start-dev.ps1` (the current reality):** the loop below, verified by code, tests, and (steps 2–11) my live HTTP exercise:

1. **Join** → allowlist gate (published only) → auto-link by UserId ✅
2. **Account found-or-created**, idempotent relink, seat claimed from the fixed 6-seat map ✅ *(live-verified)*
3. **World state loads** — full fogged snapshot, one 10s batched pull per server ✅ *(live-verified)*
4. **Resources generate** — 28×1.17^(L−1)/hr, warehouse cap, fractional carry, offline accrual ✅ *(live-verified)*
5. **Build** — cost/prereq validated server-side, queued job, server timer, completes on time, notification written ✅ *(live-verified end to end, including across a server restart)*
6. **Recruit** — server-verified; **but the Roblox UI only exposes 3 hardcoded presets** (5 Squires / 2 Spies / 1 Count). 8 of 11 troops are unrecruitable from Roblox ✅/⚠️
7. **Recruitment survives disconnect/restart** ✅ *(live-verified for restart; jobs are DB rows with absolute timestamps)*
8. **Select a target** — via distance-sorted settlement lists (the map tab's dots are display-only) ✅
9. **Scout → attack** — scout-before-attack enforced, army mustered from the *server's* snapshot, march timed by slowest unit ✅ *(97/97 tests, incl. real HTTP round-trips)*
10. **Combat resolves deterministically** — attended (+2% per order, max 5) or auto-resolved after the deadline; outcome is a pure function of the stored battle row ✅
11. **Casualties/loot applied, report created** — one transaction; both sides see the battle session ✅
12. **Conquest** — 2–5 Realm-of-Power waves, one Count consumed per wave, ownership transfer, fog flip, capital re-seat, kingdom death ✅ *(the repo's best test walks a full multi-wave campaign)* — **but** at production pacing this needs 3–5 Counts at 900s and ~9,000 resources each; every live walk of conquest so far used dev seed knobs.
13. **Reconnect shows correct state** ✅ (nothing persists Roblox-side by design; full reconcile from snapshot)
14. **Survives duplicate requests and restarts** ✅ *(live-verified)*

**The last step that genuinely works without developer intervention:** on the dev PC, **everything through step 13** — with the honest caveats that recruitment is preset-bound, conquest pacing has only ever been walked with dev seeds, and "without developer intervention" still means "the developer's PC is running the server." In plain English: **Adam's family can play a complete war campaign in Studio on Adam's machine today; nobody else on Earth can play at all.**

---

## 6. END-TO-END FLOW TRACES

The fifteen questions from the audit brief, answered for the four load-bearing commands. Evidence cites are `file:line` on `main` @ `c9e1e5c`.

### 6.1 `village.build.queue` (live-traced this audit)

1. **Begins:** village tab "Upgrade" row, `init.client.luau:1685-1797`, or proximity prompt (client-local).
2. **Client validation:** none beyond UI state — correct under Architecture A; client never decides.
3. **Roblox server validation:** `CommandService.luau:403-437` — online status, identity+snapshot present, `ownsVillage` against the *server-held* snapshot; building id typed but not whitelisted (server catches it).
4. **HTTP request:** `POST /api/roblox/commands` with `x-kingsage-key` header; fresh GUID `commandId` per attempt; body carries `robloxUserId` set by the Roblox *server* from `player.UserId` (`WorldSession.luau:242`) — never client-supplied.
5. **Contract:** envelope assembled server-side at `http.ts:270-277`; contract version checked `store.ts:977-979`. (Envelope *shape* is not schema-validated — finding §12.4.)
6. **Authorization:** key gate `http.ts:127-129`; ownership `store.ts:1157-1165` — live-verified: second player got `FORBIDDEN`.
7. **DB change:** resources deducted + `local_construction_jobs` row in one `BEGIN IMMEDIATE` transaction; world version +1; event + inbox row committed together.
8. **Idempotency:** `local_command_inbox` PK; replay returns the stored result verbatim — live-verified, including after restart.
9. **Timeout:** `ApiClient.postFull` retries the identical payload 3× (same commandId → safe); "The realm didn't answer — nothing was spent."
10. **Roblox retry:** same-commandId transport retries are idempotent; a *new* attempt gets a new GUID (deliberate; see §12.6 on rejected-command replay semantics).
11. **Server restart:** live-verified — job, version, and inbox record all survive; timers materialize on next read.
12. **Result:** JSON accepted/rejected; accepted triggers an immediate one-player refetch (`CommandService.luau:492`).
13. **UI reconcile:** snapshot push replaces local state wholesale; countdowns render from server ISO timestamps + Roblox synced-clock offset — a wrong phone clock cannot bend a timer.
14. **Failure display:** toast with honest copy; offline banner after 2 failed heartbeats; commands refused at source while offline.
15. **After reconnect:** correct — live-verified for server restart; client holds no authoritative cache.

### 6.2 `march.launch` (attack) — test-verified

Scout-purity and scout-before-attack gates (`store.ts:1282,1288`); army mustered from the server's snapshot via shared `Buildings.musterFrom` — the client never sends troop counts; troops leave the garrison in the same transaction that creates the march; arrival flips `awaiting_battle` and stamps `auto_resolve_at` *on arrival*; a march that both arrives and blows its deadline during an outage settles in one pass (`roblox-battles.test.ts:138`); replayed commandId sends one wave, not two (`:261`). **No cancellation path exists** (§10).

### 6.3 `battle.open` / `battle.order` / `battle.retreat` — test-verified

Open re-checks intel freshness, freezes attacker/defender snapshots + seed, buys a hard +3 min grace (`MAX`, unfarmable). Orders: strict next-sequence, squad whitelist, 5-order cap server-side; squad/x/y are cosmetic — only the *count* of orders feeds the math (+2% each, max +10%), so attendance cannot corrupt determinism (`battle-determinism.test.ts:145` recomputes a stored outcome from its row and deep-equals it). Orders/retreat are exempt from the world-version check with a stronger substitute guard (sequence + ownership + open status) — narrow and correct. **Exception: the client-supplied `atMs` on retreat changes survivor math — finding §12.3.**

### 6.4 Conquest (Realm of Power) — test-verified

Seeded drop 2,250–2,750 capped at 50% of max per attack (≥2 waves always), exactly one Count consumed per wave regardless of how many rode, Count survives only if >50% of escort lives, +1%/hr regeneration, capture resets to 30% of max, garrison wiped, buildings and (silently) horses inherited, capital re-seat or kingdom death, `village.conquered` event, fog flip both directions. `roblox-conquest.test.ts:430-503` walks a real multi-wave campaign over live HTTP.

---

## 7. FULL-WORLD COMPLETENESS MATRIX

Statuses use the required labels. "Tests" = the repo's own suites (97 server + 92 core, all green). P-column = priority per §Priority System.

| System | Intended behavior | Current status | Evidence | What works | What is missing or broken | Dependencies | P | Verification needed |
|---|---|---|---|---|---|---|---|---|
| **A. Roblox UserId auth + account** | UserId → account, auto-create, rejoin | **VERIFIED WORKING** | store.ts:716-761; roblox-link tests; live exercise | Link, idempotent rejoin, name dedupe, `roblox:` namespace un-squattable | Kick/session race can claim a seat for a kicked player; no ban/moderation/reset tooling | — | P2 | Two-client kick race drill |
| A. Session recovery / reconnect | Full reconcile from authority | **VERIFIED WORKING** | WorldSession.luau:287-295; live restart test | Nothing cached Roblox-side by design | Stale snapshot renders behind offline banner; no in-flight button state | — | P3 | — |
| A. Exploit resistance (Roblox surface) | Client never decides | **PARTIAL** | CommandService.luau:403-465 | 1 real remote, thorough validation, rally walk-clamp | Retreat `atMs` client authority (§12.3); no per-player command rate limit | — | P1 | Studio exploit drill |
| **B. Persistent world / creation** | Seeded deterministic world | **VERIFIED WORKING** | fixture.ts:103-211; seedWorld store.ts:533 | One 50×50 world, 10 settlements, deterministic | Single world only; 3 separate singletons block multi-world | — | P2 | — |
| B. New-player placement | Place new players with room to grow | **PARTIAL** | store.ts:649-675 | First-come claim of 6 fixed seats | No placement algorithm, no founding, `WORLD_FULL` at 7 with no user-facing story; each join deletes an AI opponent | World design decision | **P1** | — |
| B. Terrain / geography | Terrain affecting marches/defence | **MISSING** | zero hits repo-wide; existed in archived index.html | Euclidean distance + slowest-unit pace | No terrain, no pathfinding, no map features | Design decision | P3 | — |
| B. World lifecycle (win/age/reset/shards) | Worlds end, reset, scale | **MISSING** | WorldStatus declared contracts.ts:63, never written | War Victory Points accumulate | No win check, no reset (dev reset = new .sqlite file), no seasons | Postgres-era schema has it; SQLite runtime doesn't | **P1** | — |
| B. Freeholds (on-ramp) | Conquerable first rung | **VERIFIED WORKING** | fixture.ts:18-36; both freeholds test files | Seeded, un-seatable, dev-seed-proof, beatable | — | — | — | — |
| **C. Buildings/queues** | 13 types, levels, prereqs, costs, queue, offline | **VERIFIED WORKING** | economy.ts; build-queue tests; live exercise | Queue stacking, waiting jobs self-start, drains unattended, offline catch-up at completion timestamps | No cancel; client shows no costs/prereqs/queue detail (first job + "+N" only) | — | P2 | — |
| **D. Economy core** | Produce/cap/spend, no dupes | **VERIFIED WORKING** | economy.ts:192-202; store.ts:2273-2314; gate-c tests | Caps, fractional carry, 7-day offline test, atomic spend | Population cap leaks while armies march (recruit-over-cap on return); overflow discarded (correct) | — | P2 | Concurrency test (§13) |
| D. Trading / market / transfers | Player-driven economy (the brief's second track) | **MISSING** | horses.ts:18,33 admit it; no trade command exists | Market is a buildable building that does nothing | No trade table, no transfer, no offer — nothing for one player to give another | Alliances (donation is alliance-gated per brief) | **P1** | — |
| **E. Recruitment** | Full roster, queues, offline | **PARTIAL** | store.ts:1468+; live exercise; init.client.luau:1168 | Server path verified live; population reserved by queued jobs | Roblox UI = 3 presets; 8/11 troops unrecruitable; no queue view, no cancel | — | **P1** (client) | — |
| E. Research (Smithy) | Kingdom troop levels 1–10 | **DISCONNECTED** | store.ts:1556-1560 works; zero Roblox path | Server command implemented + tested | No `research` kind in CommandService, no UI — unreachable from the game | — | P2 | — |
| E. Horses | Scarce, tradeable, raidable cavalry input | **PARTIAL** | horses.ts; both horses test files; Paddock.luau | Production, cap, conversion (1 soldier + 1 horse), herd display | Not tradeable (no market), not raidable (settleBattle never touches herd), silently inherited on conquest | Market | P2 | — |
| **F. Map & targeting** | Navigate, discover, target | **PARTIAL** | init.client.luau:1267-1355 | Distance-sorted lists work for targeting; fog enforced | Map tab is 300px of non-clickable dots; no pan/zoom/marches drawn | — | P2 | Phone usability test |
| F. Fog of war | Intel only by scouting | **BROKEN** (two leaks) | store.ts:882-887 vs 2529-2547; readEvents 951-965 | Resources/buildings/army correctly zeroed in snapshots | `realmOfPower(+Max)` and `horses(+Max)` pass through unfogged; **event stream leaks entire unfogged villages to any authenticated web session** | — | **P1** | Add fog tests for all fields + events |
| **G. Marches** | Launch, travel, arrive, return, recover | **VERIFIED WORKING** | store.ts:1270-1339, 2182-2271; roblox-battles tests | Slowest-unit pace, outage catch-up, duplicate-arrival-proof | **No cancellation** (a misclicked Count march is unrecallable); **support marches refused despite schema** — no reinforcement path in the game | — | P2 / **P1** (support) | — |
| **H. Combat** | Deterministic class engine | **VERIFIED WORKING** | combat.ts:239-358; battle-determinism test | Class splits, counters, wall, rams (both effects), surrender/prisoner conservation, atomic settle | **Night bonus: STUB** (tested, wired to `false`); **trebuchets: STUB** (damage fn never called — currently expensive infantry); spy-vs-spy phase missing | — | P2/P3 | — |
| H. Simultaneous attacks | Concurrent sieges resolve fairly | **BROKEN** | openBattleSession store.ts:1668-1688; settle 1748+ | Each battle individually correct | Two attackers each freeze the full garrison + full stock: garrison fights twice at full strength, **loot is duplicated**. Zero tests. | — | **P0** (integrity) | Write the two-attacker test (§13) |
| **I. Conquest** | Multi-wave RoP, transfer, aftermath | **VERIFIED WORKING** | store.ts:1877-2015; roblox-conquest:430-503 | Best-tested area in the repo; see §6.4 | No post-capture protection window (recapture same pass possible — may be intended "fragile, not fresh"); horses inherit silently | — | P2 (decision) | — |
| **J. Alliances / diplomacy** | Create/join/roles/war/peace/shared intel | **MISSING** | Commands exist in contracts.ts:231-233, rejected at store.ts:986; tables only in the never-run Postgres file | Nothing | Everything; alliance chat channel declared, hard-rejected | Blocks trade/donation per brief | **P1** | — |
| **K. AI kingdoms** | The world fights back | **EXISTS — NOT VERIFIED** (live) / module VERIFIED | ai.ts; ai-kingdoms.test.ts (8 tests incl. determinism) | BUILD→RECRUIT→SCOUT→RAID, same command paths as players, deterministic, honest Grok handback matches code | **Never enabled anywhere** — `KINGSAGE_AI_TICK_MS` set by nothing incl. start-dev.ps1; open seats are `seat_kind='ai'` so the AI develops seats players will claim; AI ships its scouts into raids; no conquest/Freehold/AI-vs-AI; no offline catch-up (resumes only) | Hosting (to matter) | **P1** | Enable in dev loop, live drill vs fresh world (roadmap 1.4) |
| **L. Timers/queues/offline sim** | World advances with zero Roblox servers | **VERIFIED WORKING** | materializeDueJobs store.ts:2092-2180; 500ms poll http.ts:115; live exercise | Lazy catch-up pinned to completion timestamps; queue chains at `completes_at` not "now"; marches-then-battles ordering; restart-proven | Recovery starts only at first read/tick (constructor doesn't materialize); 12-pass ceiling per call; **no killed-process WAL recovery test** — and hard-kill is how every drill server has actually died (live -wal files on 14 drill DBs) | — | P2 | Kill-9 recovery test (§13) |
| **M. Reports & notifications** | Reports reach the player; read state; retention | **PARTIAL** | store.ts:2471-2482; grep of roblox/ | Scout + battle reports render in Roblox (capped 5/4, no archive); notifications written for every event | **Notifications never reach the Roblox client** — zero references in roblox/; no read/unread state anywhere; no retention: the only DELETE in 2,611 lines is logout — events/inbox/notifications grow forever | — | **P1** (delivery) / P2 | — |
| M. Player-to-player communication | Moderated chat | **PARTIAL** | store.ts:1020-1052 | World-channel `chat.send` implemented server-side | No Roblox surface (platform chat is the locked answer; custom world chat retired — fine); alliance channel rejected | — | P3 | — |
| **N. Roblox client** | Full playable window, mobile baseline | **PARTIAL** | init.client.luau (full read); §5 | Village/scout/attack/battle/reports/holding/error states all real; server-timestamp timers; touch path exists; honest failure copy | No army mgmt, no settings, no alliance/market/research UI, 3 recruit presets; sub-44px touch targets on the busiest buttons; walk-only war-table entry; **phone perf never measured** (the repo's #1 self-declared unknown) | — | P1/P2 | Slice-0 phone measurement (Adam) |
| **O. Security & trust** | Server authority, no spoof/replay/dup | **PARTIAL** | §12 | Ownership checks complete on every mutating command (traced exhaustively); key gate structural; secret never in git history; rally anti-teleport | Shared key = act-as-anyone god token; event-stream fog bypass; retreat `atMs`; empty-commandId collision; **zero rate limiting**; unbounded replay window | Hosting makes these live | **P0** at hosting time | §13 tests |
| **P. Reliability & ops** | Deployable, observable, recoverable | **MISSING** | Exhaustive negative sweep (no CI/Docker/deploy/backup/log config anywhere) | start-dev.ps1 is genuinely careful; graceful SIGINT shutdown | Loopback bind **in source**; health endpoint is a static literal (reports ok on a corrupt DB); 4 console calls into a terminal window; no backups (WAL never checkpointed — a naive file copy restores a near-empty world); no CI | — | **P0** (for the product to exist) | — |
| **Q. Performance & scale** | Known budgets under load | **EXISTS — NOT VERIFIED** | spike project; BattleConfig; HttpService batching | 200-troop spike instrument + sim check; 1 pull/10s/server respects the ~500 req/min budget; snapshot windowing | No load tests; no DB index audit under volume; `MAX_SOLDIERS=200` is an assumption until the phone measurement; per-command refetch amplifies HTTP use | — | P2 | Phone measure; N-player HTTP budget analysis (roadmap 4.5) |
| **R. Testing** | Trustworthy gates | **PARTIAL** (strong core, known holes) | §13 | 189 green tests, property-based, anti-drift gates, cross-language seam test, mutation-checked repairs | **Zero concurrency tests** (the most serious gap); no killed-process recovery; no load; thin authz coverage; gate-a..d scripts are substring greps (two assert *test titles*); mobile-rebuild is a hard gate dependency | — | P1 | §13 list |

---

## 8. VERIFIED FAILURES

Each of these was confirmed in code by direct reading; none is speculation. Severity = player impact once real players exist.

### 8.1 Loot duplication under simultaneous attacks — **P0**
- **Impact:** duplicated resources; a coordinated pair farms double loot from one target while its garrison bleeds only once.
- **Repro:** two kingdoms each scout village V; both launch attacks arriving in the same window; both battles open before either settles. Each `openBattleSession` ([store.ts:1668-1688](../../server/src/store.ts)) freezes the *full* garrison and *full* stock; each settle subtracts casualties/loot floored at zero against *current* values.
- **Expected:** the second battle fights the survivors and loots the remainder.
- **Actual:** both fight the full garrison; both loot 25% of the same frozen stock.
- **Owner:** store battle settlement. **Deps:** none. **Coverage:** zero tests mention concurrent attacks.

### 8.2 Event stream bypasses fog of war — **P0 once hosted; latent today**
- **Impact:** the scouting economy is void — any authenticated session reads every rival's exact resources, buildings, army, and march timings.
- **Repro:** `GET /api/world/events?since=0` with any session cookie. Every mutation publishes the **unfogged** village (`store.ts:1266, 2165-2169, 2003-2012`); `readEvents` ([store.ts:951-965](../../server/src/store.ts)) filters only by world+version; `gate-b.test.ts:230` currently *locks the leak in* by asserting cross-player delivery.
- **Expected:** the protocol's own per-player/alliance channels (command-protocol.md:135-138) — specified, never built.
- **Note:** the Roblox path uses per-player snapshots (fogged), so today's Studio family play is unaffected; the web routes are the exposure.

### 8.3 Snapshot fog leaks four fields — **P1**
- **Impact:** exact conquest progress (`realmOfPower`/`Max`) and herd size of every foreign settlement, free, without scouting — the single most valuable intel in the conquest game.
- **Repro:** any snapshot; compare `store.ts:882-887` (zeroes resources/buildings/army only) with `mapVillage` `store.ts:2529-2547`. `roblox-conquest.test.ts:396` only asserts `buildings.hq === 0`.

### 8.4 Client authority over retreat survivor math (`atMs`) — **P1**
- **Impact:** an exploiter retreats with 88% survivors where an honest player gets as low as 50%.
- **Repro:** fire `QueueCommand {kind="battleRetreat", battleId=…, atMs=0}`. Client computes `atMs` (`init.client.luau:1881-1887, 2133`); both servers only clamp to 0..600000; `retreatSurvivors` (`warfare.ts:415-419`) scales exposure by it.
- **Expected:** derive `atMs` server-side from the battle's own `openedAt`, which both layers already store.

### 8.5 Empty/unvalidated `commandId` — **P1**
- **Impact:** an integration that omits `commandId` gets its first command executed and **every subsequent command silently "accepted" as a replay** — failure that looks like success, this repo's named nemesis.
- **Repro:** `POST /api/roblox/commands` without `commandId` twice with different commands: `http.ts:271` coerces to `""`; the inbox PK stores it; the second returns the first's stored result. On the web route, a missing id binds `undefined` into the prepared statement → 500.

### 8.6 Missing-secret failure is an invisible infinite hang — **P1 (setup trap)**
- **Impact:** a fresh clone (SecretConfig.luau is gitignored) builds a place where every player sits on "The realm is waking…" forever; only the Output window warns.
- **Repro:** delete `SecretConfig.luau`, start dev loop. `NO_SECRET` yields no HTTP status → the 4xx early-return is skipped → endless session retry (`WorldSession.luau:223-274`).

### 8.7 Kick/seat race — **P2**
- Non-allowlisted `PlayerAdded` can still fire the first `/api/roblox/session` before the kick lands, permanently claiming one of six seats for a player who was never allowed in (`init.server.luau:25-44` vs `WorldSession.luau:233-237`).

### 8.8 Population cap not an invariant — **P2**
- March out, recruit to cap, army returns over the farm limit with no re-check (`store.ts:2325` counts garrison+queued only). Not free troops; still a broken invariant.

---

## 9. STUBS, MOCKS, AND FALSE COMPLETION SIGNALS

- **Night bonus** — 55 lines of tested logic; every live call site passes `nightBonus: false` (`warfare.ts:344, 373`). Looks done in the test suite; does nothing in the game.
- **Trebuchets** — `trebuchetDamage` (`combat.ts:457-467`) is called by nothing but its own tests. In the live game a trebuchet is a 500-attack infantry unit that slows your march.
- **Market building** — buildable, costed, upgradeable, and dressed with a beautiful three-stall street (slice 4); its description says it "prepares" exchange. **There is no trade command in the entire contract.** The prettiest false-completion signal in the repo.
- **Alliance commands** — present in the shared contract types and *required present* by `check-gate-a.mjs:55-57` — while the server rejects all three as `INVALID_COMMAND`. The gate literally enforces the existence of the stub.
- **`EnterTable` and `Toast` remotes + the server prompt path** — dead: prompts live in ServerStorage/PlayerGui clones and never raise server `PromptTriggered`, so `CommandService.luau:590-615` and `init.server.luau:60-71` are no-ops the client correctly reimplements locally.
- **`/api/health`** — static literal; healthy verdict on a corrupt database.
- **`check-gate-c/d.mjs`** — assert that *test titles* exist as substrings; circular, not behavioral.
- **`support` march kind, `alliance` chat channel, `WorldStatus` lifecycle states, Postgres `player_capacity 50`** — schema/type declarations with no behavior behind them.
- **AI-tick "the world fights back"** — module fully built and tested; **has never executed outside its test file** (nothing sets `KINGSAGE_AI_TICK_MS`).
- **`contracts.test.ts:21`** — pins "two human seats" that the store deliberately overwrites; tests the fixture, not the world.

---

## 10. MISSING WORLD SYSTEMS

No meaningful implementation found after repository-wide search:

1. **Hosting/deployment** (the product blocker) — no config of any kind; loopback bind in source.
2. **Alliances, diplomacy, war/peace states** — nothing behind the types.
3. **Trade / market behavior / resource transfer between players** — nothing.
4. **Reinforcement (support marches)** — schema exists, path refuses; no cooperative play of any kind.
5. **March cancellation** — no command, no UI.
6. **World lifecycle** — no win condition, no world end, no reset, no seasons, no shards.
7. **Settlement founding / world growth** — the settlement count can only shrink.
8. **New-player placement beyond 6 fixed seats** — `WORLD_FULL` is the entire story.
9. **Terrain** — zero references (existed in the archived web prototype; never ported).
10. **Notification delivery to Roblox, read/unread state, report retention/archive.**
11. **Moderation/admin tooling** — no bans, no player reset, no world-repair tools.
12. **Observability & backups** — no logging destination, no metrics, no backup/restore.
13. **Rate limiting** — none, anywhere.
14. **Research UI** (server path exists — DISCONNECTED rather than missing).

---

## 11. ARCHITECTURAL RISKS

1. **Loopback-only is baked into source, not config** (`index.ts:57`, `Config.luau:2`). Hosting is a code change plus a secret-distribution story that doesn't exist yet (no production key path; dev key in three tracked files as cleartext).
2. **The frozen `mobile-rebuild` client is a hard dependency of every gate** — `test:gate-a` builds it, `check-types.mjs` borrows its compiler, gate scripts grep it, the server serves its dist. It imports live game-core it no longer understands. Any future game-core change must keep a dead React app compiling or all gates fail for an unrelated reason. This is the repo's own "mirrored copies drift" nemesis, institutionalized.
3. **Six seats and a fixed world quietly contradict the product.** "50+ settlements per player is a supported requirement" (CANONICAL-BRIEF) vs. 10 settlements total, ever.
4. **The dormant AI + open-seats-are-AI overlap:** when the AI *is* enabled, it will develop the very seats new players claim (flagged in the Grok handback, unresolved), and every human join deletes an AI opponent — at 6/6 humans the "world that fights back" has nobody left to fight with except four Freeholds.
5. **`local_schema_migrations` is a write-only log**; conditional migrations read the live schema (good instinct) but nothing wraps migration sets in a transaction — a half-applied 0009-style rebuild reads as "done."
6. **Unbounded growth with no pruning** — events, inbox, notifications, battle rows grow forever; `readEvents(worldId, 0)` is unbounded.
7. **`withTransaction` non-reentrancy** is an undocumented invariant one refactor away from a crash.
8. **Stale binding docs** (AI-TEAM-BRIEFING's 80/81, HANDBACK's "never on main") actively misdirect the agent workforce this repo depends on.

**Positive risk note:** the audit brief's fear — "Roblox-only persistence creep" — is absent. No DataStores, no client authority (one `atMs` exception), no local caches of record. Architecture A is real.

---

## 12. SECURITY AND EXPLOIT RISKS

Ranked; §8 items cross-referenced.

1. **One shared secret = act as every player** (`http.ts:266-281`): `/api/roblox/commands` and `/state` take the acting `robloxUserId` from the body, gated only by `x-kingsage-key`. No per-player token, HMAC, nonce, or expiry; a captured body replays forever (modulo commandId). Safe today on loopback + gitignored secret (verified never in git history); becomes the crown-jewels risk the day the server is hosted. The Roblox-server side does its half right (UserId read server-side, secret in ServerScriptService only).
2. **Event-stream fog bypass** (§8.2) and **snapshot field leaks** (§8.3).
3. **Retreat `atMs`** (§8.4) — the single confirmed client-authority-over-outcome hole.
4. **No rate limiting anywhere** — unthrottled registration (6 scripted POSTs exhaust the world's seats), unthrottled login against *synchronous* scrypt (event-loop-blocking CPU DoS), unthrottled commands (one Roblox exploiter can drain the whole place's ~500 req/min HttpService budget via distinct-command spam + per-accept refetch).
5. **Empty commandId** (§8.5); envelope shape unvalidated on the web route (crafted bodies → 500s).
6. **Rejected commands burn their commandId forever** — the protocol's "retry the original ID" is unimplementable after a rejection; the Roblox client sidesteps with fresh GUIDs, making its retry semantics not-idempotent by design. Works, but fragile.
7. Minor: session cookie lacks `Secure`; expired sessions never swept; static-root `startsWith` boundary lacks a trailing separator; `PRAGMA foreign_keys=OFF` not restored if migration 0009 throws mid-file.
8. **What's genuinely solid:** ownership checks on every mutating command (traced exhaustively — no gap found); timing-safe key compare failing closed (503 when unconfigured); structural key gate on the whole `/api/roblox/` prefix; rally anti-teleport walk-clamp with spoof logging; no secrets in logs; child allowlist (belt-and-braces atop Roblox private-experience permissions).

---

## 13. TEST COVERAGE GAPS

What exists is unusually good: property-based core tests, conservation laws, tests that encode the dated historical bug they prevent, three real anti-drift gates (check-types, rules-check.luau's 63 executed rules, the TS↔Luau muster seam test), and end-to-end HTTP conquest campaigns. What must be added before the game can be trusted with real players:

1. **Concurrency (the #1 gap — zero tests exist):** two simultaneous commands against one world; two attacks arriving on one village in one window (would catch §8.1); duplicate-command race from two processes; `busy_timeout` under contention.
2. **Killed-process recovery:** hard-kill mid-write with a live WAL, reopen, assert integrity — the only way real drill servers have ever stopped, and untested.
3. **Fog completeness:** every field of a foreign village in snapshots *and* in every event payload (would catch §8.2/§8.3 and force the per-player event channel).
4. **Authz negatives:** actor mismatch, cross-world command, commandId theft (code paths exist, untested); path traversal; body cap; empty commandId (should become a 400, then be tested).
5. **Client reconnect mid-stream:** drop and resume SSE across the `since` boundary; Roblox session retry path (untested in any language).
6. **Load:** N-player HttpService budget math (roadmap 4.5); snapshot cost at settlement counts beyond 10.
7. **The phone measurement** — the repo's own instrument, still unrun; `MAX_SOLDIERS=200` is an assumption.
8. **Retire the circular gates:** check-gate-c/d asserting test titles; contracts.test.ts:21's stale two-humans pin; gate-a requiring stub alliance commands to exist.

---

## 14. CRITICAL-PATH BUILD ORDER

Dependency-aware; each stage gates the next. Stages 1–3 produce the audit brief's "functioning persistent-world vertical slice"; 4–9 expand it into the intended world.

**Stage 1 — Foundational infrastructure (the game exists off this PC):**
1. Configurable bind + hosted world server (Tailscale Funnel or small VPS — Adam's account decision, roadmap 4.1), production secret generation/distribution, `Config.API_BASE` from configuration.
2. Transport hardening *before* exposure: rate limiting on `/api/auth/*` and commands; reject empty/non-string commandId; envelope schema validation; `Secure` cookie.
3. Fix the two fog holes (event filtering per player + the four leaked snapshot fields) and the `atMs` derivation — small, surgical, and they void whole subsystems if left.
4. Ops floor: DB-touching health check, file logging, a `VACUUM INTO` backup script + restore drill, and CI running the existing 189 tests.
5. Decouple the gates from `mobile-rebuild` (own tsc devDependency; retire the greps) so future work can't be broken by a frozen app.

**Stage 2 — First complete playable loop, for real people:**
6. Publish private; two-client fog/respawn drill (roadmap 4.2/4.3); slice-0 phone measurement; fix the kick/seat race.
7. Client completeness for the loop that exists: real recruitment UI (all 11 troops + queue view), army/garrison view, notification delivery, march cancel.
8. Conquest pacing decision at production timers (the loop has only been walked dev-seeded).

**Stage 3 — Persistent multiplayer world:**
9. Concurrency + kill-recovery tests, then the simultaneous-attack fix (§8.1).
10. World capacity: more seats and/or settlement founding, a real `WORLD_FULL` story, new-player placement policy (Adam design decision).
11. Data hygiene: retention/pruning, session sweep.

**Stage 4 — Strategic depth:** research UI (server path already done); night bonus + trebuchet wiring or deletion; support marches; terrain decision.

**Stage 5 — Alliances and social:** alliances v1 (schema→behavior→UI, roadmap 3.3), then trade/donation (3.4) — this unlocks the horse-economy design's missing two-thirds.

**Stage 6 — AI world simulation:** enable the tick in the dev loop, live drill, resolve the open-seat overlap, then AI conquest/Freehold behavior and offline catch-up policy.

**Stage 7 — Conquest & endgame:** win condition, world lifecycle, reset/next-world story (design exists in the archived prototype: 40% dominance + world cycling + Hall of Legends).

**Stage 8 — Operational readiness:** metrics, monitoring, world-repair tooling, moderation/admin, restore drills, deploy-order/compatibility policy.

**Stage 9 — Visual/experiential refinement:** silhouette pass (Claude's standing unapproved suggestion), touch-target sizing, map interactivity, polish debt from the 08-23 audit.

---

## 15. MILESTONE ACCEPTANCE TESTS

Objective, binary, and runnable:

- **M1 (hosted):** from a phone on cellular, a fresh allowlisted account joins the published private place, gets a seat, queues a build, kills the app, returns after the timer, and sees the completed building. Meanwhile `curl` with a wrong key gets 401 and 20 rapid registrations get throttled.
- **M2 (loop for real people):** a kid on their own device completes scout → attack → auto-resolve while offline → returns → reads the battle report **as a notification in-game** → recruits an axe (not a preset) → cancels a march. The two-client fog drill passes: the visitor sees shells and zeroed everything (including realm power and horses) for the owner's village, in snapshot *and* event stream.
- **M3 (persistent world):** two simultaneous attacks on one village produce conserved loot (sum ≤ stock) and sequential garrisons; `kill -9` mid-battle-settle + restart leaves a consistent world (test asserts totals); a 7th player gets a designed answer, not a 409.
- **M4 (depth):** a research order placed from Roblox raises a troop level; a trebuchet attack damages a chosen building; a night attack meets doubled defence.
- **M5 (social):** player A creates an alliance, invites B, B reinforces A's village with a support march, and the garrison defends with the combined force; A sends B 500 wood.
- **M6 (living world):** with zero Roblox servers connected for 24h, an enabled AI kingdom has built, recruited, and raided back a player who hit it — visible in the player's reports on return; determinism test still green.
- **M7 (endgame):** a world reaches its win condition, is marked `won`, and a new world opens without a filesystem operation.
- **M8 (ops):** restore-from-backup drill recovers yesterday's world on a clean machine; the health check fails when the DB file is corrupted; CI blocks a PR that breaks any of the 189+ tests.

---

## 16. DECISIONS REQUIRED FROM ADAM

Only the ones that materially shape the game (routine engineering above is Claude-resolvable):

1. **Hosting** (roadmap 4.1, blocks everything): which account/provider — Tailscale Funnel (free, family-scale) vs small VPS. Money + account decision.
2. **World capacity & placement:** is 6 seats/1 world acceptable through family alpha, and what is the intended story after that — bigger fixture, settlement founding, or multiple worlds? This decides Stage 3's shape.
3. **Conquest pacing at production timers:** 3–5 Counts × 900s × ~9k resources has never been humanly played. Keep, tune, or keep dev-seeding for the family phase?
4. **Post-capture vulnerability:** a just-taken settlement (30% RoP) can be re-taken immediately. Intended fragility or does it need a protection window?
5. **Simultaneous attacks** (§8.1 fix shape): should the second arrival fight the survivors (sequential sieges) — recommended — or is some shared-siege design wanted?
6. **Trebuchets & night bonus:** wire them in (trebuchet needs a target-building picker in the attack UI; night bonus needs a timezone story) or delete them for now? Half-wired features are false signals.
7. **AI-vs-player-seat overlap:** when the tick goes live, should AI development of unclaimed "open seats" stop (new players inherit a fresh start) or continue (new players inherit a developed kingdom)?
8. **World endgame:** adopt the archived prototype's 40% dominance + world cycling, or a different end condition? (Stage 7 needs the answer, not the work, yet.)
9. **The name** (roadmap 4.4) — still blocks anything public.

---

## 17. FINAL SCORECARD (0–5)

| Area | Score | Evidence in one sentence |
|---|---|---|
| Architecture | **4** | Architecture A is genuinely implemented and traced end to end; docked for the source-baked loopback bind and the frozen client wired into every gate. |
| Persistence | **4** | SQLite authority with WAL + IMMEDIATE transactions survived my live kill-and-restart with jobs, versions, and idempotency records intact; no backups and unbounded growth keep it from 5. |
| Core loop | **4** | Join→build→recruit→scout→attack→battle→conquer all exist server-authoritatively (steps through recruit live-verified, the rest test-verified); conquest has only ever been paced with dev seeds. |
| Economy | **3** | Production, caps, fractional carry, and 7-day offline accrual are verified; the population-cap leak and the total absence of any player-to-player exchange cap it. |
| Buildings | **4** | 13 types with queue stacking, self-starting waiting jobs, and completion-timestamp chaining, live-verified; no cancel and a costs-blind client UI. |
| Recruitment | **3** | The server path is complete and live-verified, but the Roblox UI exposes 3 presets of 11 troops and research is unreachable entirely. |
| Map | **2** | Targeting works through distance-sorted lists and fog is enforced in snapshots, but the map itself is 300px of unclickable dots and two fog fields leak. |
| Movement | **3** | Marches are duplicate-proof and outage-proof with slowest-unit pacing, but there is no cancellation and no support/reinforcement path at all. |
| Combat | **4** | A deterministic, atomic, conservation-tested class engine with rams and surrender; docked for the dead night-bonus/trebuchet wiring and the untested simultaneous-attack loot duplication. |
| Conquest | **4** | Realm-of-Power multi-wave conquest is the best-tested subsystem in the repo, proven over live HTTP; the post-capture window and horse inheritance are undecided design, not defects. |
| Alliances | **0** | Three contract types rejected by the server allowlist and a Postgres table nothing executes — no behavior exists. |
| AI world simulation | **2** | A well-built, deterministic, honestly-handed-back module that has never once executed outside its own test file because nothing enables it. |
| Roblox client | **3** | The core loop's screens are real, reconciled from authority, and honest about failure, but army management, research, notifications, settings, and the social surfaces are absent and the phone was never measured. |
| Security | **2** | Ownership checks are exhaustive and the secret hygiene is clean, but one shared key impersonates anyone, the event stream un-fogs the world, `atMs` is client authority, and nothing is rate-limited. |
| Reliability | **2** | Restart recovery is real and tested gracefully, but killed-process recovery — the only way servers here actually die — is untested, and there is no monitoring to notice. |
| Operations | **1** | A genuinely careful dev script and nine env vars are the entire ops story: no hosting, no CI, no backups, no logs, no metrics. |
| Testing | **4** | 189 green, largely property-based tests with three real anti-drift gates and mutation-checked repairs; zero concurrency/load coverage and grep-gates keep it from 5. |
| **Overall world completeness** | **2** | A verified authoritative vertical slice for six players on one PC; the persistent, social, living, reachable world around it is designed but not built. |

---

*Audit artifacts: scratch DB and state captures live in the session scratchpad (outside the repo). Nothing in the repo was modified except the creation of this report. Tests run: `check:types`, `test:server` (97/97), `test:core` (92/92), `test:luau` (all green), plus the live HTTP exercise described in §2.*
