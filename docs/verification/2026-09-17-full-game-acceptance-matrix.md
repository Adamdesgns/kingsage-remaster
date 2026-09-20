# Kingsmarch — full-game acceptance matrix

**Date:** 2026-09-17 · **Author:** [Cursor] (cloud; model: Claude Fable 5) · **Coordinator:** Morgan Sterling · **Owner of record:** Adam
**Commissioned by:** the 2026-09-16 games-completion handoff (Adam authorized turning Kingsmarch "100%" into finite, owner-visible acceptance rows).
**Revision 2 (2026-09-17, Codex document review):** [Cursor] (cloud; model: Claude Fable 5.1). Docs-only corrections: A1/A2/B1/B6/B7/C1/C2 now carry the historical date + SHA of their live evidence and say **NOT RUN** for current-tip live acceptance; dependency IDs that resolved to nothing (`O1`, `J1`) now point at real rows (H6, F1); external IDs (`G-05`, `D-13`) are labeled as such; §5 counts are stated explicitly and match the tables; B10 is split into a local drill (B10a) and hosted operational restore (B10b). **No gate was rerun and no new live pass is claimed in this revision** — §1 numbers are still the revision-1 runs.
**Revision 3 (2026-09-17, B10a executed):** [Cursor] (cloud; model: Claude Fable 5.1). **One new current-tip live PASS: B10a**, run at `38610e0` (`cursor/b10a-local-restore-drill` = `3673a9a` + `scripts/b10a-local-restore-drill.mjs`; `server/` byte-identical to `main @ 9b478db`), evidence in `docs/verification/2026-09-17-b10a-local-restore-evidence.md`. Rows touched: B10a, §5 counts, §6, §7, M8. No other row changed status; B10b stays MISSING; §4 untouched.
**Revision 4 (2026-09-20, HTTP-only live re-drive executed):** [Cursor] (cloud; model: Claude Fable 5.1). The §7 task "re-drive the 2026-08-29 scratch-DB HTTP exercise" was **run at `21b917b`** (`cursor/http-live-redrive-40e9` = `19bf897` + `scripts/http-live-redrive.mjs`; `server/` and `packages/` byte-identical to `main @ 9b478db`), 14/14 steps PASS, exit 0, evidence in `docs/verification/2026-09-20-http-live-redrive-evidence.md`. Rows now carrying **current-tip live PASS: A1, B1, B7, C1, C2, and the server half of A2**. A2's Roblox-side reconcile, B6, E10, F6, G1 remain historical-only (Studio). §5 counts, §6, §7 updated to match. No other row changed status; §4 untouched.
**Revision 5 (2026-09-20, B8 kill -9 / WAL recovery drill executed):** [Cursor] (cloud; model: Claude Fable 5.1). The §7 task "write the kill-9 WAL recovery test" was **run at `69b7548`** (`cursor/b8-kill9-wal-drill-37b7` = [PR #13](https://github.com/Adamdesgns/kingsage-remaster/pull/13) tip `00b8c8e` + `scripts/b8-kill9-wal-recovery-drill.mjs`; `server/` and `packages/` byte-identical to `main @ 9b478db`), 11/11 steps PASS, exit 0, evidence in `docs/verification/2026-09-20-b8-kill9-wal-recovery-evidence.md`. **B8 moves from NOT RUN to PASS (current-tip live, SIGKILL only — power loss is not simulated and the row says so).** C2 gains one live sub-claim (a `PREREQUISITE_MISSING` refusal). §5 counts, §6, §7, M3 updated to match. No other row changed status; **no Studio row moved**; §4 untouched.
**Scope:** the **intended game** — not only the practice slice. One file Adam can open to see exactly what is done, what is missing, and who owes what.

**Code baselines this matrix is pinned to (both re-gated in this session — see §1):**

| Line | Tip | What it is |
|---|---|---|
| `main` | `9b478db` | The intended game. Includes the 2026-08-29 Phase A merge (audit P0/P1 fixes, full recruit picker, research UI, Recall, the Herald, AI tick in dev loop, hosting-as-config). |
| Practice line | `cursor/practice-fort-held-slice-08e7` @ `0b7a34a` ([PR #10](https://github.com/Adamdesgns/kingsage-remaster/pull/10), draft) | Current practice-siege candidate. Stack: `main` → `feat/practice-siege-codex` @ `add2cd2` → [PR #7](https://github.com/Adamdesgns/kingsage-remaster/pull/7) @ `41d541e` → [PR #8](https://github.com/Adamdesgns/kingsage-remaster/pull/8) @ `bdcef2e` → [PR #9](https://github.com/Adamdesgns/kingsage-remaster/pull/9) docs / [PR #10](https://github.com/Adamdesgns/kingsage-remaster/pull/10) code. None merged; merge is Claude's call on Adam's word. |

**Reconciliation note (no duplicated work):** PRs #7/#8/#9/#10 were inspected before writing this. #7 = Phase 1 teaching lesson; #8 = touch-scroll fix (`TouchScroll.luau` — **not on `main`**); #9 = docs/runbook reconciliation on `bdcef2e`; #10 = FORT HELD explanation slice on `bdcef2e`, the newest code tip. This matrix duplicates none of them; it maps them.

## How to read the status column

- **IMPLEMENTED** — the code exists at the named SHA.
- **TESTED** — automated tests current at that SHA fail if the behavior is deleted (this repo's honesty bar).
- **VERIFIED LIVE** — dated live evidence (Studio session, live HTTP exercise) at a named SHA.
- **PARTIAL** — some of the row works; the notes say which part.
- **BROKEN** — exists but confirmed wrong.
- **MISSING** — not built at all.
- **NOT RUN** — the acceptance evidence for the **current** tip does not exist. Older evidence is labeled historical and does not transfer.
- **BLOCKED** — cannot advance without the named gate (a device, a human, an account, or Adam's word).
- **DECISION-HELD** — waiting on Adam's explicit yes/no. Nobody may invent the answer.

A row may carry both: **VERIFIED LIVE (historical: date, SHA)** for the code claim *and* **live NOT RUN** for the current tip. The historical label never certifies `9b478db`; it only says the behavior was once exercised live, and where.

Honest-evidence rules inherited from the briefing and the 2026-09-16 handoff: historical gate numbers (core 104 / server 139 / scroll 11 as previously recorded, the 2026-08-23 Studio audit, the 2026-08-29 audit's scratch-DB HTTP exercise at `c9e1e5c`, the 2026-09-11 assisted S-01) are **history, not current results**. Every claim below either carries current evidence or says NOT RUN.

**Dependency IDs:** every cross-reference in the Owner/Notes columns is a row id in this file (A1…H9, S-01…S-10, G-01/G-02, M1…M8, or a §4 decision id). Audit section numbers are written `§7.x`/`§16.x`. Two ids from the practice line's opening-decisions doc are quoted where the source text uses them and are marked *(external)*; they are not rows here.

**Exact prerequisite for any Studio row below** (replaces the earlier blanket "Adam's PC gates"): a Windows machine with Roblox Studio and Rojo installed and a checkout of the named tip — in practice Adam's PC ("Bot Door"), operated either by Adam at the keyboard or by an agent in a granted computer-control session (the 2026-09-11 evening PC follow-up was one such session). Steps: `powershell -ExecutionPolicy Bypass -File roblox/start-dev.ps1 -BuildOnly -Play` → `roblox/WorldGame-dev.rbxlx`; a disposable world server on `127.0.0.1:4178` with key `dev-secret-local-0001` (`KINGSAGE_DATABASE_PATH` pointing at a fresh file; **never** the 4178 world already running); `SecretConfig.luau` from the example; Studio **Allow HTTP Requests** ON; `/api/health` returns `{ok:true, service:"kingsage-world", contractVersion:1}` before Play. Cloud agents cannot do this; a PC session can. Rows that need a **physical phone** (S-09, G4) additionally need Adam's device and are marked so.

---

## 1. Gate health — rerun in THIS session (2026-09-17, cloud Linux, Node 22.14, Lune 0.10.5)

| Gate | `main` @ `9b478db` | Practice tip @ `0b7a34a` |
|---|---|---|
| `npm run check:types` | **clean** | **clean** |
| `npm run test:core` | **92/92, 0 fail** | **105/105, 0 fail** |
| `npm run test:server` | **114/114, 0 fail, 0 skipped** (Lune contract test executed) | **139/139, 0 fail, 0 skipped** |
| `npm run test:luau` | 72 rules + 7 spike sims + syntax, **0 failed** | 42 syntax · 72 rules · 7 sims · 25 connections · 6 client audits · 272 practice contracts · 28 bridge · 14 planner scenarios · 54 wiring · 11 touch-scroll — **0 failed** |
| `npm run check:practice-persistence` | n/a (script exists only on practice line) | **exit 0** — disposable DB, `defenderWin`, identical replay, durable rows unchanged |
| Rojo place build / Studio Play / phone | **NOT RUN** — not possible from cloud; needs the PC session described in "Exact prerequisite for any Studio row" above | **NOT RUN** — same |

These are fresh runs, not quotes of the PR #10 handback. All Luau "scenario" checks are runtime stubs by their own admission — they are **not** Studio or visual proof.

---

## 2. The intended game — feature acceptance rows

Evidence pointers are `file:line` at `main @ 9b478db` unless another SHA is named. "Audit" = `docs/audits/kingsage-functionality-audit.md` (2026-08-29, taken at `c9e1e5c`); rows below are **reconciled against the four commits `main` has gained since** — several audit findings are now fixed and say so.

### 2A. Account, session, identity

| # | Acceptance row | Status | Owner | Evidence | Notes |
|---|---|---|---|---|---|
| A1 | Roblox UserId → account link, auto-create, idempotent rejoin | IMPLEMENTED + TESTED (current, §1); **VERIFIED LIVE (current tip, 2026-09-20, `21b917b`)** — re-drive steps 1–2: new UserId → `created:true` + seat `kingdom-1`; same UserId again → `created:false`, identical `playerId`/`kingdomId`; second UserId → different player + seat; wrong/missing key → 401 `BAD_KEY` with no link row written | — (done; Cursor ran it) / Claude reviews the record | `docs/verification/2026-09-20-http-live-redrive-evidence.md` steps 1–2, 10; `scripts/http-live-redrive.mjs`; `server/src/store.ts` link path; roblox-link tests | Server under test byte-identical to `main @ 9b478db`. Rejoin also re-verified **after a server restart** (step 10). |
| A2 | Reconnect reconciles fully from server authority (no client cache) | IMPLEMENTED + TESTED (current, §1); **server half VERIFIED LIVE (current tip, 2026-09-20, `21b917b`)** — after a graceful stop/restart the same UserId rejoins to the same player/kingdom and the full `/api/roblox/state` snapshot (jobs, army, notifications, version) is rebuilt from the DB alone; Roblox-side reconcile (client re-rendering from that pull): VERIFIED LIVE **historical** (2026-08-23 Studio audit), current-tip **NOT RUN** | — (server half done) / Morgan (Roblox-side reconcile in Studio, prerequisite above) | Evidence note steps 10–11; `roblox/src/server/WorldSession.luau` | Architecture A honored in code and now re-shown live on the server side at this tip. The client half still needs the Studio prerequisite. |
| A3 | Kick/seat race: a non-allowlisted player cannot claim a seat before the kick lands | BROKEN (known, P2) | Cursor | Audit §8.7; `roblox/src/server/init.server.luau` vs `WorldSession.luau` | Unfixed by Phase A. Needs a two-client drill to prove the fix. |
| A4 | Ban / moderation / player-reset tooling | MISSING | Cursor (build) / Adam (policy) | Audit §10.11 | Nothing exists. |

### 2B. World model, persistence, world lifecycle

| # | Acceptance row | Status | Owner | Evidence | Notes |
|---|---|---|---|---|---|
| B1 | Seeded deterministic world (50×50 fixture, 10 settlements) | IMPLEMENTED + TESTED (current, §1); **VERIFIED LIVE (current tip, 2026-09-20, `21b917b`)** — re-drive step 3: snapshot pull shows `world-7c7d5ae2` seed `gate-b-emberfall`, 50×50, 10 villages / 10 kingdoms (2 open seats claimed as human, 4 AI, 4 freehold); a **second fresh DB** on another port seeded the identical world id, seed and settlement id/coordinate layout | — (done; Cursor ran it) / Claude reviews | Evidence note step 3; `packages/game-core/src/fixture.ts` | Single world only. Open-seat villages are renamed after the claiming player, so names are player data, not fixture data. |
| B2 | Open seats: new players get a fresh start; AI never develops open seats | IMPLEMENTED + TESTED | — (done) | `1ed8d73`, migration `0012_open_seats.sql`, `server/test/freeholds.test.ts` + `ai-kingdoms.test.ts` | Resolves the audit's AI/open-seat overlap **in code**. |
| B3 | World capacity beyond 6 seats / settlement founding / `WORLD_FULL` story | MISSING + DECISION-HELD | Adam (shape) → Cursor | Audit §7.B, §16.2 | The world can only shrink. "50+ settlements per player" (CANONICAL-BRIEF) is unserved. |
| B4 | World lifecycle: win condition, world end, reset, seasons/shards | MISSING + DECISION-HELD | Adam (endgame shape, §16.8) → Cursor | Audit §7.B; `WorldStatus` declared in `contracts.ts`, never written | Archived prototype's 40% dominance + world cycling is the candidate design, unadopted. |
| B5 | Terrain affecting marches/defence | MISSING | Adam (whether at all) | Audit §7.B; existed only in archived `index.html` | Euclidean distance + slowest-unit pace is the whole story today. |
| B6 | Freeholds on-ramp (conquerable first rung) | IMPLEMENTED + TESTED (current, §1); VERIFIED LIVE **historical** (2026-08-23 Studio audit — Saltmarsh Freehold two-wave conquest at dev pacing; exact SHA not recorded in the repo, pre-`373b3ff`; record: `docs/HANDOFF-2026-08-24-fresh-chat.md`); current-tip live **NOT RUN** | — (code) / Morgan (Studio, prerequisite above) | `fixture.ts`; freeholds tests | The only live proof is Studio-side and predates Phase A; nothing since has conquered a Freehold live. |
| B7 | Restart persistence: jobs, versions, idempotency survive a **graceful** restart | IMPLEMENTED + TESTED (current, §1 — `gate-b`/`gate-c` restart tests); **VERIFIED LIVE (current tip, 2026-09-20, `21b917b`)** — re-drive step 10: SIGTERM exit 0, 50 s down, restart on the same DB: `/api/health` 200; same player/kingdom/village ids; the construction job (id, `completesAt`) identical; inbox row count unchanged; **replay of the pre-restart `commandId` returns the byte-identical stored result** and creates no second job | — (done; Cursor ran it) / Claude reviews | Evidence note step 10; audit §2 (historical) | Graceful only — B8 is the hard-kill case (kill -9 now PASS at `69b7548`, revision 5; power loss still NOT RUN). |
| B8 | Killed-process (kill -9 / power loss) WAL recovery | **PASS for kill -9 (current-tip live, 2026-09-20, `69b7548`)** — 11/11 steps, exit 0: two players burst 18 commands in ~80 ms, server `SIGKILL`ed on the 8th accept with `world.sqlite` a 4096-byte header and **1.47 MB of uncheckpointed `-wal`**; control copy of the main file without its WAL has **0 tables**; server restarted as first opener → `integrity_check` ok, `foreign_key_check` empty; **all 17 acknowledged commands (8 accepted + 9 stored rejections) replay byte-identically**; the 1 in-flight command is wholly absent (no inbox row, no job); job tables equal the ledger (6 construction, 2 recruitment, no orphans); resources reconcile to <1e-6; both 45 s recruits still landed at exactly `completesAt`. Repeatable: `node scripts/b8-kill9-wal-recovery-drill.mjs`. **Power loss NOT RUN** — SIGKILL discards the process, not the kernel page cache; fsync durability needs a VM/plug drill, not a signal | — (kill -9 done; Cursor ran it) / Claude reviews the record / power-loss: Claude (VPS session, after H6) | `docs/verification/2026-09-20-b8-kill9-wal-recovery-evidence.md` (verbatim log, ledger, file sizes, both state pulls); `scripts/b8-kill9-wal-recovery-drill.mjs`; audit §13.2 | Server under test byte-identical to `main @ 9b478db`. Not covered: kill during battle settlement / march arrival (audit M3's "kill -9 mid-battle-settle" — same `BEGIN IMMEDIATE … COMMIT` path, but no battle was in progress); the drill records where the kill landed rather than steering it (this run: before the in-flight commit). |
| B9 | Retention/pruning: events, inbox, notifications, battle rows | MISSING | Cursor | Only `DELETE` in store.ts is logout (`store.ts:891`) | Unbounded growth; deliberately out of Phase A scope. |
| B10a | **Local** backup + restore drill on a disposable world (proves the runbook's `VACUUM INTO` backup and the restore steps actually round-trip a WAL-mode SQLite world) | **PASS (current-tip live, 2026-09-17, `38610e0`)** — 6/6 steps, exit 0; negative control (naive `cp` instead of `VACUUM INTO`) FAILS at step 3 as it must. Repeatable: `node scripts/b10a-local-restore-drill.mjs` | — (done; Cursor ran it) / Claude reviews the record | `docs/verification/2026-09-17-b10a-local-restore-evidence.md` (verbatim log, both state pulls, exit codes); `scripts/b10a-local-restore-drill.mjs`; procedure: `docs/ops/vps-runbook.md` "Backups" + "Restore drill" | Server under test is byte-identical to `main @ 9b478db` (`git diff 9b478db 38610e0 -- server/` empty). Restored world came back at version **2** with the first (timber) job; the live world had reached version **3** with a second (quarry) job, which was gone after restore. Naive copy left a backup with **no tables** (schema still in the 943 KB `-wal`) — the runbook warning is real. Needs only Node 22 + `sqlite3` CLI. Drill as specified: (1) start the world server on a fresh `KINGSAGE_DATABASE_PATH` (path resolves relative to `server/`), throwaway `KINGSAGE_ROBLOX_KEY`, non-4178 port; (2) `/api/roblox/session` + one `village.build.queue` so the DB has a job and an inbox row; (3) `sqlite3 <db> "VACUUM INTO '<backup>'"` **while the server is running** (WAL mode — that is the point); (4) queue a second command so live state diverges from the backup; (5) stop the server, copy the backup over the DB, delete `-wal`/`-shm`, restart; (6) `/api/health` 200 and a `/api/roblox/state` pull showing the **first** job and world version, not the second. Record date, SHA, exact commands, and both state pulls in a dated `docs/verification/` note. Passing this does **not** close B10b. |
| B10b | **Hosted** operational restore: cron backup landing in `/home/kingsage/backups`, restore drill on the real box, `/api/health` + state pull after | MISSING (runbook written, never executed on a box) | Claude (VPS session) / Adam (box) | `docs/ops/vps-runbook.md` | Blocked behind hosting (H6). B10a passing (2026-09-17) means the procedure itself is proven locally; the hosted drill is now a repeat on real infrastructure, not a first try. Still not run. |

### 2C. Economy, buildings, recruitment, research

| # | Acceptance row | Status | Owner | Evidence | Notes |
|---|---|---|---|---|---|
| C1 | Resource production, warehouse caps, fractional carry, offline accrual | IMPLEMENTED + TESTED (current, §1); **VERIFIED LIVE (current tip, 2026-09-20, `21b917b`) for production, fractional carry and offline accrual** — re-drive steps 4, 12, 13: `villageEconomy` equals the game-core formulas at the village's levels (28/h, storage 1464, population 232); `whole + carry == baseline + 28/h × elapsed − spent` holds to <1e-6 for all three resources, both across a 50 s server-down window and over the 11+ minute construction wait, with whole units landing at the formula rate; **warehouse cap enforcement NOT hit live** (would need hours of accrual — unit-tested only) | — (done; Cursor ran it) / Claude reviews | Evidence note steps 4, 12, 13; `economy.ts`; gate-c tests | The cap branch of `accrueVillage` is the one part of this row still resting on tests alone. |
| C2 | 13 building types: costs, prereqs, queue stacking, server timers, offline catch-up | IMPLEMENTED + TESTED (current, §1); **VERIFIED LIVE (current tip, 2026-09-20, `21b917b`) for cost, server timer, exact-time completion, idempotent replay, stale-version conflict and ownership** — re-drive steps 5–8, 14: `village.build.queue` timber deducted exactly {75, 90, 60}; timer 720 s = `buildingDurationSeconds`; replay byte-identical with no duplicate row; stale `expectedWorldVersion` → 409 `WORLD_VERSION_CONFLICT`; other player → 409 `FORBIDDEN` (both for a foreign village and a foreign `commandId`); **level 1 → 2 landed with its notification stamped exactly at `completesAt`** and production moved 28 → 33/h. Offline catch-up shown live for a *recruit* job (step 11: militia completed at its `completesAt` while the server was down); queue stacking shown live in B10a (quarry `waiting`) and again in B8 (5 `waiting` orders behind 1 `queued`, unpaid until they start); **one prerequisite refusal exercised live in B8 (`69b7548`): a Rampart order at Headquarters 1 → 409 `PREREQUISITE_MISSING` "Requires Headquarters level 2.", stored and replayed byte-identically after a kill**. **The other prerequisite rules and completion of any building other than timber NOT exercised live** (unit-tested; B8 *queued* timber, quarry, iron, farm, warehouse, hq orders but only timber has ever completed live) | — (done; Cursor ran it) / Claude reviews | Evidence note steps 5–8, 11, 14; B8 evidence note step 2; build-queue tests; audit §6.1 (historical) | One building completed live at this tip, as in the 2026-08-29 exercise. |
| C3 | Build-queue cancel + client shows building costs/prereqs/queue detail | MISSING (cancel) / PARTIAL (client detail) | Cursor | Audit §7.C | Phase A fixed the *recruit* side only. |
| C4 | Full 11-troop recruitment from Roblox with server-truth costs/prereqs (troopCatalog) | IMPLEMENTED + TESTED, **not seen rendered** | Morgan/Adam (Studio look) | `1b104df`; `server/test/roblox-api.test.ts`; 9 new Luau rules | Supersedes the audit's "3 presets" finding. No human has ever seen this UI. |
| C5 | Smithy research reachable from Roblox (was server-only) | IMPLEMENTED + TESTED, **not seen rendered** | Morgan/Adam (Studio look) | `1b104df`; rules-check entries | Supersedes audit "DISCONNECTED". |
| C6 | Population cap is an invariant (recruit-over-cap via marched-out army) | BROKEN (known, P2) | Cursor | Audit §8.8; `store.ts` counts garrison+queued only | Unfixed by Phase A. |
| C7 | Player-to-player trade / market behavior / resource transfer | MISSING | Cursor (after F1) | Audit §7.D; Market building is a costed façade (§9) | The brief's second progression track has **no mechanics at all**. Blocked by alliances for donation (per brief). |
| C8 | Horses: production, cap, cavalry conversion | IMPLEMENTED + TESTED | — (done) | `horses.ts`; both horses test files | |
| C9 | Horses tradeable + raidable (the design's stated point of scarcity) | MISSING | Cursor (needs C7; raidable is a design call) | `horses.ts:18,33` admits it; settleBattle never touches herds | Silently inherited on conquest today. |

### 2D. Map, fog, intel

| # | Acceptance row | Status | Owner | Evidence | Notes |
|---|---|---|---|---|---|
| D1 | Fog of war in snapshots covers ALL fields incl. realm power + herds | IMPLEMENTED + TESTED (fixed since audit) | — (done) | `5b18b36`, migration 0011, `roblox-scouting.test.ts` | Audit §8.3 closed. |
| D2 | Event stream fogged per reader (no free scouting off the wire) | IMPLEMENTED + TESTED (fixed since audit) | — (done) | `5cbb67c`; `gate-b.test.ts` | Audit §8.2 closed. |
| D3 | Scout-before-attack + intel freshness enforced | IMPLEMENTED + TESTED | — (done) | `store.ts` gates; battle tests | |
| D4 | Interactive map (pan/zoom/tap targeting, marches drawn) | PARTIAL | Cursor | Audit §7.F — map tab is display-only dots; targeting works via distance-sorted lists | Phone usability of the lists NOT RUN. |

### 2E. Marches, combat, conquest

| # | Acceptance row | Status | Owner | Evidence | Notes |
|---|---|---|---|---|---|
| E1 | March launch: server-mustered army, slowest-unit pace, duplicate/outage-proof | IMPLEMENTED + TESTED | — (done) | `store.ts`; `roblox-battles.test.ts` | |
| E2 | March cancel/recall (server + two-tap Roblox Recall) | IMPLEMENTED + TESTED, **not seen rendered** | Morgan/Adam (Studio look) | `189fa23` + `march-cancel.test.ts`; UI in `1b104df` | Supersedes audit "no cancellation". |
| E3 | Support/reinforcement marches (cooperative defence) | MISSING | Cursor (after F1) | Audit §7.G — schema exists, path refuses | No cooperative play of any kind exists. |
| E4 | Deterministic class-vs-class combat: counters, wall, rams, surrender, conservation | IMPLEMENTED + TESTED | — (done) | `combat.ts`; `battle-determinism.test.ts` | |
| E5 | Attended battle: orders capped, cosmetic positions, retreat exposure server-derived | IMPLEMENTED + TESTED (atMs fixed since audit) | — (done) | `7580daa` | Audit §8.4 closed — a client cannot buy survivors. |
| E6 | Simultaneous sieges: second army fights survivors, loot conserved | IMPLEMENTED + TESTED (fixed since audit) | — (done) | `0c8604c`; `simultaneous-attacks.test.ts` (3 scenarios) | Audit §8.1 (the P0) closed; also resolves decision §16.5 as "sequential". |
| E7 | Night bonus wired into live battles | BROKEN (tested stub, wired to `false`) + DECISION-HELD | Adam (§16.6 wire-or-delete) → Cursor | `warfare.ts` call sites | False completion signal until decided. |
| E8 | Trebuchets damage a chosen building | BROKEN (stub — damage fn never called) + DECISION-HELD | Adam (§16.6) → Cursor | `combat.ts` `trebuchetDamage` | Currently a 500-attack infantry unit that slows the march. |
| E9 | Spy-vs-spy counter-intel phase | MISSING | Adam (whether at all) | Audit §7.H | |
| E10 | Realm-of-Power multi-wave conquest, transfer, aftermath | IMPLEMENTED + TESTED + VERIFIED LIVE (dev pacing, 2026-08-23, historical) | — (done) | `roblox-conquest.test.ts:430+` walks a live-HTTP campaign | Best-tested subsystem in the repo. |
| E11 | Conquest at **production** pacing has been played by a human | NOT RUN + DECISION-HELD | Adam (§16.3 keep/tune) | Audit §7.I — every live walk used dev seed knobs | 3–5 Counts × 900s × ~9k resources, never humanly paced. |
| E12 | Post-capture protection window | DECISION-HELD | Adam (§16.4) | Audit §7.I | Intended fragility or a window — do not invent. |

### 2F. Multiplayer, social, living world

| # | Acceptance row | Status | Owner | Evidence | Notes |
|---|---|---|---|---|---|
| F1 | Alliances: create/join/roles/war/peace/shared intel | MISSING | Cursor (schema→behavior→UI, audit stage 5) | Contract types rejected `INVALID_COMMAND` at the store allowlist | Blocks trade/donation (C7) per the brief. |
| F2 | Diplomacy / war-peace states | MISSING | Cursor (after F1) | Audit §10.2 | |
| F3 | Player-to-player chat | IMPLEMENTED (platform) | — (done by lock #4) | Roblox moderated chat is the locked answer | Custom world chat retired; alliance channel waits on F1. |
| F4 | Two-client ownership/privacy drill (visitor sees shells + zeroed everything) | NOT RUN | Morgan (execution) / Adam (second device if needed) | Named in audit M2 and the 2026-09-16 handoff | Fog is tested server-side (D1/D2); the *drill* has never been run. |
| F5 | AI kingdoms: module (BUILD→RECRUIT→SCOUT→RAID, deterministic, player command paths) | IMPLEMENTED + TESTED | — (done) | `server/src/ai.ts`; `ai-kingdoms.test.ts` | |
| F6 | AI enabled where people actually play | IMPLEMENTED (dev loop) + VERIFIED LIVE (scratch drill 2026-08-29, historical) | — (done for dev) | `b7bad45` — `start-dev.ps1` sets `KINGSAGE_AI_TICK_MS=45000`; HANDBACK.md drill | Production enablement rides the VPS runbook (H6). |
| F7 | AI conquest / AI-vs-AI / Freehold behavior / offline catch-up | MISSING / PARTIAL | Cursor (audit stage 6) | Audit §7.K | AI resumes but does not catch up; never conquers. |
| F8 | Notifications delivered in-game (the Herald) | IMPLEMENTED + TESTED, **not seen rendered** | Morgan/Adam (Studio look) | `1b104df`; Luau rule "the herald renders the realm's notifications" | Supersedes audit "notifications never reach Roblox". Read/unread state still MISSING. |
| F9 | Battle/scout reports render with archive/retention | PARTIAL | Cursor | Audit §7.M — capped 5/4, no archive, no read state | |

### 2G. Roblox client & mobile baseline

| # | Acceptance row | Status | Owner | Evidence | Notes |
|---|---|---|---|---|---|
| G1 | Core-loop screens (village, war table, battle scene, reports, holding, error states) | IMPLEMENTED + TESTED (Luau gates) + VERIFIED LIVE only at 2026-08-23 audit (historical) | Morgan/Adam (current Studio pass owed) | `roblox/src/client/`; audit §7.N | Everything merged since 2026-08-29 (recruit picker, research, Recall, Herald) has **never been seen rendered** — named "the next Studio session's first job" in HANDBACK.md. |
| G2 | War-table touch/wheel scroll works on mobile | IMPLEMENTED + TESTED on practice line only; **NOT on `main`**; Studio NOT RUN | Claude (merge decision) / Morgan (S-07) | `TouchScroll.luau` @ `bdcef2e` (PR #8); 11 touch-scroll stub checks | The 2026-09-11 session that could not wheel-scroll is the bug, not a pass. Merging PR #8's line is the path to fixing this on `main`. |
| G3 | Touch targets ≥ 44px on busiest buttons | PARTIAL (fixed in practice UI; audit found sub-44px elsewhere) | Cursor | Audit §7.N; practice 320/390 checks | |
| G4 | Phone performance measured (200-troop budget, real device) | NOT RUN + BLOCKED (physical phone = Adam) | Adam (measurement) / Cursor (instrument done) | `feat/slice0-phone-measure` instrument; audit §7.Q | The repo's #1 self-declared unknown. `MAX_SOLDIERS=200` is an assumption. |
| G5 | Army/garrison management view, settings surface | MISSING | Cursor | Audit §7.N | |

### 2H. Security & operations (the "anyone can reach it" wall)

| # | Acceptance row | Status | Owner | Evidence | Notes |
|---|---|---|---|---|---|
| H1 | Rate limits: auth 5/min/address, commands 30/min/player | IMPLEMENTED + TESTED (fixed since audit) | — (done) | `3508b92`; `rate-limit.test.ts` | Defaults untuned by real play. |
| H2 | commandId validated (1–128 char string; no silent-replay trap) | IMPLEMENTED + TESTED (fixed since audit) | — (done) | Phase A; audit §8.5 closed | |
| H3 | Per-player auth to the world server (today: one shared key = act-as-anyone) | MISSING (accepted on loopback; **P0 the day it is hosted**) | Cursor (design) / Claude (review) | Audit §12.1 | Must land with or before H6 exposure. |
| H4 | Missing-secret failure is loud, not an infinite hang | IMPLEMENTED (fixed since audit) | — (done) | Phase A: warns loudly once a minute; audit §8.6 closed | |
| H5 | Health endpoint touches the DB; session cookie `Secure`; session sweep | MISSING (all three) | Cursor | `http.ts:154-157` is still a static literal | Small, audit-listed hardening. |
| H6 | Hosting: reachable world server (VPS, TLS, systemd, backups) | BLOCKED (Adam: DigitalOcean API token + Porkbun domain) → then Claude runs the runbook | Adam → Claude | `docs/HANDOFF-2026-08-29-phase-b-vps.md`; `docs/ops/vps-runbook.md`; bind/base-URL already config (`13127d9`) | **The load-bearing blocker**: until this, nobody but Adam's household can play at all. |
| H7 | CI running the full gates on every PR | MISSING | Cursor | Audit §7.P | All gates are green (§1); nothing runs them automatically. |
| H8 | Gates decoupled from the frozen `mobile-rebuild` zombie | MISSING | Cursor | Audit §11.2 — `check-types.mjs` borrows its tsc; gate scripts grep it; server serves its dist | Standing gate-breakage risk. |
| H9 | Shippable name (can never be "KingsAge") | DECISION-HELD | Adam (§16.9) | CANONICAL-BRIEF | Blocks anything public, including the VPS place going beyond private. |

---

## 3. Practice slice — S-01…S-10 mapped, honestly

Pack of record: `docs/verification/2026-09-10-practice-studio-test-pack.md` (practice line; latest copy at `0b7a34a`, which also updated S-01/S-03 expected copy — FORT HELD now carries a `Why:` headline, loss denominators `8 of 18 · 7 of 14 · 5 of 10`, and `Defenders: 10 of 43 fell.`). Studio rows must be judged on a place rebuilt from **`0b7a34a`** (or, minimum, `bdcef2e` for S-07). **Historical results do not certify this tip**: the 2026-09-11 S-01 PASS was on older `41d541e` and needed Adam-assisted navigation past the scroll bug.

| Row | What it proves | Current-tip status | Owner | Evidence |
|---|---|---|---|---|
| S-01 Reset teaching plan (FORT TAKEN 5/5/4) | The one-tap win teaches | **NOT RUN** on `0b7a34a`/`bdcef2e` | Morgan (Studio) | Automated pin green (§1). Historical assisted PASS on `41d541e` only — not transferable. |
| S-02 Three drawn routes | Freehand drawing works | **NOT RUN** | Morgan (Studio) | — |
| S-03 No-gate-team failure (FORT HELD 8/7/5 + why) | The lesson's causality | **NOT RUN** live | Morgan (Studio) | Automated pins green incl. new headline/denominators (PR #10; §1). Live checklist: 2026-09-12 reconciliation note (practice line). |
| S-04 One-target causality (Gate→Keep only change) | Same routes, different outcome | **NOT RUN** live | Morgan (Studio) | Automated causality pin green. |
| S-05 Invalid input | Rejection names squad + problem | **NOT RUN** live | Morgan (Studio) | Automated planner checks green (probe rejection text verified §1). |
| S-06 Reset / retry / interrupt / reasons | No resurrected results | **NOT RUN** live | Morgan (Studio) | Automated planner checks green. |
| S-07 Drawing vs scrolling (TouchScroll) | The 2026-09-11 scroll bug is fixed | **NOT RUN** — the named **next required acceptance**, first row to run | Morgan (Studio, boot runbook on practice line) | 11 touch-scroll stub checks green (§1). |
| S-08 320/390 layouts | ≥44px targets, wrapping, V/A/R cues | **NOT RUN** live | Morgan (Studio) | Automated 320/390 checks green. |
| S-09 Physical phone | Real-device truth | **NOT RUN** + BLOCKED (physical phone; **Adam-written only** — emulation is explicitly not this row) | Adam | — |
| S-10 Stateless boundary probe | Practice grants nothing durable | **PASS (current)** — rerun this session on `0b7a34a`, exit 0 | — (done, repeatable) | §1 persistence probe. |
| G-01 Five unfamiliar players (D-13 *(external — practice-line opening-decisions doc)*) | Comprehension unaided | **OPEN** + BLOCKED (humans) | Adam (recruits testers) / Morgan (protocol) | One assisted S-01 does not count. |
| G-02 Opening-design contract | D-01/D-02-storage/D-08/D-09/D-10 + first-war rule | **DECISION-HELD** (Adam-written only; silence is not approval) | Adam | `docs/plans/2026-09-10-opening-decisions-for-adam.md` (practice line). |

---

## 4. Unresolved design choices (nobody may invent these)

| ID | Question | Status | Notes |
|---|---|---|---|
| **D-02 / OPEN-21** | How do two shielded newcomers ever begin PvP? Recommendation on record: **mutual first-war challenge** (both confirm; one paired accepted attack removes both shields; no timers, no toggles). | **DECISION-HELD — Adam's yes/no. This matrix records the question and deliberately does not answer it.** | Until answered, real PvP and G-05 *(external — the practice line's opening-decisions doc uses this id; it is not a row here)* stay closed. Timed expiry / voluntary drop / unshielded starters are not allowed paths. |
| §16.2 | World capacity & placement after 6 seats (bigger fixture / founding / multiple worlds) | DECISION-HELD | Shapes B3. |
| §16.3 | Conquest pacing at production timers | DECISION-HELD | E11. |
| §16.4 | Post-capture protection window | DECISION-HELD | E12. |
| §16.6 | Trebuchets & night bonus: wire or delete | DECISION-HELD | E7/E8 are false signals until decided. |
| §16.8 | World endgame (adopt archived 40% dominance + cycling?) | DECISION-HELD | B4. |
| §16.9 | The name | DECISION-HELD | Blocks anything public. |
| §16.1 hosting / §16.5 sieges / §16.7 AI-vs-open-seats | — | **RESOLVED** since the audit | Hosting: DO VPS chosen, account + payment ready (token/domain still owed → H6). Sieges: sequential, in code (`0c8604c`). Open seats: in code (`1ed8d73`). |
| Five solo design calls | Muster-all armies; 3 squads vs spec's ~10–20; surrender at 3×; 2-minute deadline; unplanned-attack fallback | OPEN (design review never done) | They work and are tested; none validated as *design*. |
| D-01 / D-08 / D-09 / D-10 | Opening contract recommendations | DECISION-HELD (bundled with G-02) | Reversible; recommendations recorded 2026-09-10. |

---

## 5. What "100%" actually means — milestone scoreboard

The audit's binary milestones (§15), scored today. **All eight are unmet: 0 met, 3 PARTIAL (M3, M4, M6), 5 NO (M1, M2, M5, M7, M8).** This is the finite list Adam asked for.

**Artifact counts (revision 2, so the summary matches the tables):** §2 holds **63 feature rows** (A 4 · B 11 incl. B10a/B10b · C 9 · D 4 · E 12 · F 9 · G 5 · H 9); §3 holds **12 practice rows** (S-01…S-10, G-01, G-02); §4 holds **10 decision lines**, of which 1 is RESOLVED and 1 is OPEN design review, the rest DECISION-HELD. Rows carrying a **current-tip live PASS: 9** (S-10 on `0b7a34a`; B10a on `38610e0`, revision 3; **A1, B1, B7, C1, C2 and the server half of A2 on `21b917b`, revision 4** — C1 minus the warehouse-cap branch, C2 for one completed building type, as their rows say; **B8 on `69b7548`, revision 5** — kill -9 only, power loss not simulated). Rows carrying a **VERIFIED LIVE that is historical only: 5** (A2's Roblox-side half, B6, E10, F6, G1) — none of them certifies `9b478db`; all five need the Studio prerequisite. Everything else Studio- or device-dependent is NOT RUN.

| Milestone | One-line test | Met? | What stands in the way (rows above) |
|---|---|---|---|
| M1 Hosted | Fresh phone on cellular joins the published private place; wrong key gets 401; rapid registrations throttled | **NO** | H6 (Adam token/domain), H3, H5 |
| M2 Loop for real people | A kid on their own device: scout → offline auto-resolve → in-game report → recruit an axe → cancel a march; two-client fog drill passes | **NO** | H6, F4, G1 Studio pass, G4 |
| M3 Persistent world | Concurrent sieges conserved (✅ done in code); kill-9 consistent; 7th player gets a designed answer | **PARTIAL** — E6 done; B8 kill-9 drill PASS at `69b7548` (build/recruit writes; the audit's "mid-battle-settle" variant and power loss not run) | B8 (battle-settle variant, power loss), B3 |
| M4 Depth | Research from Roblox raises a level (✅ built, unseen); trebuchet hits a building; night attack means something | **PARTIAL** | C5 Studio look, E7, E8 |
| M5 Social | Alliance, reinforcement, 500-wood transfer | **NO** | F1, E3, C7 |
| M6 Living world | 24h AI activity with zero Roblox servers, visible on return | **PARTIAL** — F5/F6 built; long-run drill NOT RUN | F7, hosted long-run |
| M7 Endgame | A world is won and a new one opens without filesystem surgery | **NO** | B4 |
| M8 Ops | Restore drill; DB-touching health check; CI blocks a red PR | **NO** — B10a done (local), the rest untouched | B10b (after H6), H5, H7 |

Plus the practice slice's own bar: S-01…S-08 Studio on `0b7a34a`, S-09 phone (Adam), G-01 humans, G-02 decisions — §3.

---

## 6. Boundaries honored this turn

- **No Studio live runs** — they need the PC session spelled out under "Exact prerequisite for any Studio row" (Studio + Rojo + a checkout of the tip, on Adam's PC or in a granted computer-control session); every Studio-dependent row above says NOT RUN rather than borrowing history.
- **No BotDOOR live matrix** — the BotDOOR host/adapter reconciliation and its held-input STOP/focus-loss matrix live outside this repo and stay a separate task; nothing here depends on it.
- **No local backup/restore drill run either** (revisions 1–2) — B10a was written up as the next assigned execution task, not claimed. **Revision 3: B10a has now been run** (`38610e0`, PASS, evidence note linked in the row); it is the only live claim added since, and it certifies the local procedure, not the hosted one.
- **Revision 4: the HTTP-only re-drive has been run** (`21b917b`, 14/14 PASS, evidence note linked in §7). It certifies the world server's HTTP surface at this tip for the rows named above and nothing Roblox-side: no Studio row moved, B6 did not move, and the rows say which sub-claims (warehouse cap, prerequisite refusals, 12 other building types, kill -9) are still tests-only.
- **Revision 5: the B8 kill -9 drill has been run** (`69b7548`, 11/11 PASS, evidence note linked in the row). It certifies SIGKILL recovery of the world server's SQLite WAL at this tip and nothing more: power loss is not simulated, no battle was in progress at the kill, and nothing Roblox-side moved. Of the sub-claims listed in the revision-4 line, kill -9 and one prerequisite refusal are now live; warehouse cap and the other building types are still tests-only.
- **No merge, no push to `main`, no secrets** — this file rides a draft PR on its own branch.
- Historical numbers (core 104 / server 139 / scroll 11, the 2026-08-23 audit run, the 2026-08-29 `c9e1e5c` HTTP exercise, assisted S-01) are labeled historical everywhere they appear, with date and SHA.

## 7. Next execution tasks this matrix assigns (no purchase, no PC required)

| Task | Owner | Closes / advances | Needs |
|---|---|---|---|
| ~~Run B10a (local backup + restore drill) and file a dated `docs/verification/` note~~ **DONE 2026-09-17** (`38610e0`, PASS; `docs/verification/2026-09-17-b10a-local-restore-evidence.md`) — Claude's review of the record still owed | Cursor (ran) / Claude (review) | B10a closed; B10b de-risked | Rerun any time: `node scripts/b10a-local-restore-drill.mjs` |
| ~~Re-drive the 2026-08-29 scratch-DB HTTP exercise on `main @ 9b478db` (link, snapshot, build queue, replay, restart)~~ **DONE 2026-09-20** (`21b917b`, 14/14 PASS; `docs/verification/2026-09-20-http-live-redrive-evidence.md`) — Claude's review of the record still owed | Cursor (ran) / Claude (review) | Current-tip live evidence for A1, A2 (server half), B1, B7, C1, C2 — recorded in those rows | Rerun any time: `node scripts/http-live-redrive.mjs` (~14 min, real timers) |
| ~~Write the kill-9 WAL recovery test the audit describes in §13.2~~ **DONE 2026-09-20** (`69b7548`, 11/11 PASS; `docs/verification/2026-09-20-b8-kill9-wal-recovery-evidence.md`) — delivered as a repeatable drill script, not a `server/test` case, so `server/` stays byte-identical to `main`; Claude's review of the record still owed | Cursor (ran) / Claude (review) | B8 closed for kill -9; power loss and the mid-battle-settle variant remain open on the row | Rerun any time: `node scripts/b8-kill9-wal-recovery-drill.mjs` (~50 s, real 45 s recruit timer) |
| Extend the B8 drill so the kill lands during battle settlement (audit M3's exact wording) | Cursor | B8 (battle-settle variant), M3 | Needs a scouted target and a march in flight before the kill — dev seed knobs or a longer script; no Studio, no PC |

Everything else that is NOT RUN waits on the Studio prerequisite (§ "How to read"), a physical phone (Adam), hosting (H6), humans (G-01), or a decision (§4).
