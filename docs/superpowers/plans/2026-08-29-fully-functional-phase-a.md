# Fully Functional — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every P0/P1 integrity hole from the 2026-08-29 functionality audit, turn the AI kingdoms on, wire the missing client paths, and make hosting a config change — so Phase B (VPS + publish private) is a 15-minute job and the roadmap's Definition of Fully Functional is reachable.

**Architecture:** All fixes live where authority lives (server/store, shared contracts); the Roblox layer only gains UI over commands that already exist or are added here. Every behavior lands test-first per the briefing's honest-reporting bar. No schema change without a migration following the `server/db/migrations/` pattern (one is needed: open seats).

**Tech Stack:** Node `--experimental-strip-types` + `node:sqlite` (server), shared TS in `packages/game-core`, Luau via Rojo (roblox), Lune gates.

**Audit of record:** `docs/audits/kingsage-functionality-audit.md` (findings §8, §12; critical path §14). Adam approved Phase A scope + VPS hosting 2026-08-29 evening.

## Global Constraints

- Branch `feat/fully-functional-phase-a`; **never commit to `main`** — merge is a separate Adam-gated step.
- Gates before any "done": `npm run check:types` clean; `npm run test:server` (baseline 97/97) + new tests; `npm run test:core` (92/92); `npm run test:luau` whenever `roblox/` is touched.
- Determinism: no unseeded randomness or wall-clock reads inside game logic; `now` is a parameter.
- No duplicated rules — shared constants live in `packages/game-core` and mirror to Luau with parity gates.
- Every claimed behavior gets a test that fails when the behavior is deleted.
- Plain-English refusal copy in the client (house voice: "the realm…").

---

### Task 1: Reject garbage commandIds and malformed envelopes

**Files:**
- Modify: `server/src/store.ts` (top of `applyCommand`, ~line 967)
- Modify: `server/src/http.ts:208-214` (web commands route), `:266-281` (roblox commands route)
- Test: `server/test/roblox-api.test.ts` (append)

**Why (audit §8.5):** `String(body.commandId ?? "")` lets an integration that forgets commandId get every later command silently "accepted" as a replay of its first — failure that looks like success. Missing commandId on the web route binds `undefined` into a prepared statement → 500.

**Behavior:** `applyCommand` rejects (`INVALID_COMMAND`, message "commandId must be a non-empty string.") when `commandId` is not a string of 1–128 chars. The web route validates envelope shape before casting: `command` must be an object with a string `type`; otherwise 400 `INVALID_CONTRACT`, never a 500.

- [ ] Write failing tests: empty commandId rejected; two different commands with empty ids do NOT replay each other; web route with `{}` body → 400 not 500; `chat.send` with numeric body → 400/409 not 500.
- [ ] Run to verify failures (`npm run test:server`).
- [ ] Implement the guard in `applyCommand` (before the inbox lookup) + a `validateEnvelopeShape` helper in http.ts used by both command routes.
- [ ] Gates green; commit `fix: refuse empty commandIds and malformed envelopes instead of replaying or crashing`.

### Task 2: Retreat exposure time is the server's clock, not the client's

**Files:**
- Modify: `server/src/store.ts` (battle.retreat handler ~1417, battle.resolve ~1442)
- Modify: `roblox/src/server/CommandService.luau:371-388` (stop trusting request.atMs)
- Test: `server/test/roblox-attend.test.ts` (append)

**Why (audit §8.4):** client-supplied `atMs` feeds `retreatSurvivors` exposure — `atMs=0` yields 88% survivors vs as low as 50%. Both layers already store `openedAt`.

**Behavior:** the server computes `atMs = clamp(now - battle.openedAt, 0, 600_000)` for retreat/resolve and ignores any client value (field stays accepted for wire compat, unused). Roblox CommandService stops sending it.

- [ ] Failing test: open a battle, advance the store clock 3 minutes, send retreat with `atMs: 0` — stored outcome must use ~180000, not 0 (assert survivors match the server-derived exposure).
- [ ] Implement server-side derivation; delete the client field read.
- [ ] `battle-determinism.test.ts` must still pass (outcome remains a pure function of the stored row — `at_ms` is stored at settle).
- [ ] Gates + `test:luau`; commit `fix: retreat exposure is derived from the battle's own clock - a client cannot buy survivors`.

### Task 3: Complete the fog — realm power and horses are intel, not free

**Files:**
- Modify: `server/src/store.ts:880-888` (getSnapshot fog block), `:2234-2258` (scout report write), `mapVillage` consumers as needed
- Modify: `packages/game-core/src/contracts.ts` (ScoutReportState: add `observedRealmOfPower`, `observedRealmOfPowerMax`)
- Test: `server/test/roblox-scouting.test.ts` (append)

**Why (audit §8.3):** foreign villages leak exact `realmOfPower(+Max)` and `horses(+Max)` — the most valuable conquest intel, free.

**Behavior:** foreign villages in a snapshot show `realmOfPower: 0, realmOfPowerMax: 0, horses: 0, horsesMax: 0`. Scouting now records observed realm power in the report (so conquest planning still works — through scouting, as designed).

- [ ] Failing test: unscouted foreign village has all four fields zeroed; after a scout, the *report* carries observed realm power but the world snapshot stays fogged.
- [ ] Implement fog + report fields (migration NOT needed: scout reports store `observed_*` JSON columns — verify; if a new column is required, follow the 0007 conditional pattern in a migration `0011`).
- [ ] Check the Roblox client renders nothing that breaks when foreign horses read 0 (Paddock is owner-only by construction — confirm).
- [ ] Gates; commit `fix: fog covers realm power and herds - conquest intel now costs a scout`.

### Task 4: The event stream wears the same fog as the snapshot

**Files:**
- Modify: `server/src/store.ts:951-965` (`readEvents`), subscribe path `http.ts:197-199`
- Modify: `server/src/http.ts:176-206` (pass the requesting player through)
- Test: `server/test/gate-b.test.ts` (amend the delivery assertion), new fog assertions

**Why (audit §8.2):** every mutation publishes the unfogged village; `/api/world/events?since=0` hands any session the whole world's exact state. `gate-b.test.ts:230` currently locks the leak in.

**Behavior:** events are fogged per requesting player at read/stream time (delivery unchanged — the *payload* village passes through the same fogging as `getSnapshot`; foreign construction/recruitment job details are stripped). Roblox path is unaffected (uses per-player snapshots).

- [ ] Failing test: player B reads events after player A builds — B still receives `village.changed` but the embedded village has zeroed resources/buildings/army/realm/horses; A reading the same events sees their own true values.
- [ ] Implement `fogEventForPlayer(event, player)` reusing the snapshot fog helper (extract it — no duplicated rules).
- [ ] Amend `gate-b.test.ts:230` to assert delivery AND fogging.
- [ ] Gates; commit `fix: the event stream is fogged per reader - watching the wire is no longer free scouting`.

### Task 5: One siege at a time — the loot-duplication fix

**Files:**
- Modify: `server/src/store.ts` — `openBattleSession` (~1668), `materializeDueBattles` (~1703), `battle.open` handler (~1359)
- Test: new `server/test/simultaneous-attacks.test.ts`

**Why (audit §8.1, P0):** two battles opened on one village each freeze the full garrison + full stock; garrison fights twice at full strength, loot is duplicated.

**Behavior (sequential sieges):** invariant — at most one open `battle_session` per village. A second attack arriving while a battle is open stays `awaiting_battle` with its `auto_resolve_at` pushed to `settledBattle + AUTO_RESOLVE_MS`; an attended `battle.open` against a village under siege is rejected `SIEGE_IN_PROGRESS` with the plain message "Another army holds the field — wait for their battle to end." When the open battle settles, the queued march's snapshot freezes the *post-battle* village.

- [ ] Failing test A: two attacks arrive in one window; total loot across both outcomes ≤ the village's starting stock; the second battle's defender snapshot equals the post-battle-one garrison.
- [ ] Failing test B: attended `battle.open` during an open siege → `SIEGE_IN_PROGRESS`; after settle, it opens fine.
- [ ] Failing test C: restart between the two settlements changes nothing (materialize order already marches-then-battles).
- [ ] Implement the guard + deadline push.
- [ ] Gates; commit `fix: one siege at a time - a second army fights the survivors, not a copy of the garrison`.

### Task 6: Rate limiting at the door

**Files:**
- Create: `server/src/rate-limit.ts` (small token-bucket, injectable clock)
- Modify: `server/src/http.ts` (auth routes per-IP; roblox commands per robloxUserId)
- Test: new `server/test/rate-limit.test.ts`

**Why (audit §12.4):** registration is unthrottled against 6 world seats; login is unthrottled against event-loop-blocking scrypt; one exploiter can drain a place's HttpService budget via distinct-command spam.

**Behavior:** `/api/auth/register` + `/login`: 5 requests/min/IP → 429 `RATE_LIMITED`. `/api/roblox/commands`: 30 commands/min per robloxUserId → 409 `RATE_LIMITED` ("The realm needs a breath — try again in a moment."). In-memory, per-process (fine: single-process is the deployment); clock injected for tests.

- [ ] Failing tests: 6th register in a minute → 429; 31st command → refused; window slides (advance injected clock → allowed again); heartbeat `/api/roblox/state` is NOT limited.
- [ ] Implement; wire into `createWorldHttpServer` options with defaults on.
- [ ] Gates; commit `feat: rate limits on the door - seats, scrypt and the HTTP budget can no longer be drained`.

### Task 7: `march.cancel` — a misclicked army can turn around

**Files:**
- Modify: `packages/game-core/src/contracts.ts` (add `{ type: "march.cancel"; payload: { marchId: MarchId } }`)
- Modify: `server/src/store.ts` (allowlist ~986 + handler)
- Test: `server/test/march-cancel.test.ts`

**Behavior:** cancel is valid only on an **outbound** march you own that has not arrived. The march flips to `returning` from its current progress: `arrives_at = now + elapsed` (walk back the way you came), army+any nobles intact, no loot. Arrived/awaiting_battle/returning marches refuse (`MARCH_COMMITTED`, "They can see the walls — there is no turning back now."). Idempotent via the command inbox like everything else.

- [ ] Failing tests: cancel mid-flight returns the army after the mirrored travel time; cancel after arrival refused; cancelling someone else's march refused FORBIDDEN; replayed cancel commandId is a no-op second time.
- [ ] Implement handler using the same `withTransaction` + world-version pattern as launch.
- [ ] Gates; commit `feat: march.cancel - an outbound army can be recalled until the walls are in sight`.

### Task 8: Open seats — fresh starts first, and the AI leaves them alone

**Files:**
- Create: `server/db/migrations/0011_open_seats.sql` (widen `seat_kind` CHECK to `('human','ai','freehold','open')`, table-rebuild per the 0007 pattern; backfill `seat_kind='open'` where kingdom name LIKE 'Frontier March %' AND controller IS NULL)
- Modify: `server/src/store.ts` — conditional `migrateOpenSeats()` (schema-fact check, like `migrateFreeholdSeatKind`), `seedWorld` (~565: stamp the two placeholder seats `'open'` directly), `findOpenSeat` (~649: `WHERE controller_player_id IS NULL AND seat_kind IN ('open','ai') ORDER BY CASE seat_kind WHEN 'open' THEN 0 ELSE 1 END, id`)
- Modify: `server/src/ai.ts:116-123` (`listAiVillages`: only `seat_kind = 'ai'` — which now excludes open seats by definition)
- Test: `server/test/freeholds.test.ts` + `server/test/ai-kingdoms.test.ts` (append)

**Why (audit §11.4, Grok handback deviation):** unclaimed open seats are `seat_kind='ai'`, so the enabled AI would develop the seats new players claim; and each join currently deletes an AI opponent.

**Behavior:** players claim the two fresh `open` seats first, then named AI kingdoms (capacity stays 6); the AI tick never acts for an `open` seat; `WORLD_FULL` unchanged at 7.

- [ ] Failing tests: fresh world has exactly 2 `open` + 4 `ai` seats; first two links land on the open seats; third link inherits a named AI kingdom; `runAiKingdomTick` takes zero actions for open-seat villages; an old-schema DB migrates (rebuild-and-backfill test like the 0007 one).
- [ ] Implement migration + conditional runner + seed + selection order + AI filter.
- [ ] Gates; commit `feat: open seats - new players get a fresh start and the AI develops only its own kingdoms`.

### Task 9: Turn the world on — the AI tick runs in the dev loop

**Files:**
- Modify: `roblox/start-dev.ps1:83` (add `KINGSAGE_AI_TICK_MS='45000'`)
- Modify: `docs/AI-TEAM-BRIEFING.md` (current-state note)
- Test: live drill (manual, logged): fresh world, tick on, observe AI build/recruit rows appear without any player action

**Behavior:** every dev world has living kingdoms. 45s tick at family scale (design cadence question stays open for production; env-tunable).

- [ ] Add the env line; boot a fresh scratch world; after 3+ ticks assert via the HTTP API (read-only) that at least one AI kingdom has a construction job or recruitment underway with resources deducted.
- [ ] Record the drill (date, world, observed rows) in the HANDBACK.
- [ ] Commit `feat: the dev loop wakes the AI kingdoms - the world fights back by default`.

### Task 10: Real recruitment — all eleven troops, costs on the button

**Files:**
- Modify: `roblox/src/shared/Buildings.luau` (troop metadata: cost/pop lines already mirrored? verify; add what the UI needs)
- Modify: `roblox/src/client/init.client.luau` (village tab: replace the preset rows with a troop list — name, cost, have-count, quantity stepper 1/5/25, queue rows)
- Modify: `roblox/src/server/CommandService.luau` (accept any `Buildings.TROOP_ORDER` troop + quantity 1..100, validated against the server snapshot as today)
- Test: `roblox/scripts/rules-check.luau` (new rules: every TROOP_ORDER entry renders a recruit row spec; quantity clamp mirrors the server's 1..100), `server/test/roster-parity.test.ts` still green

**Behavior:** the three presets are superseded by a full picker; refusals keep riding the server round-trip (costs shown are advisory display, never authority).

- [ ] Rules-first: add the failing Luau rules, then build the UI to satisfy them.
- [ ] `test:luau` + full gates; live Studio look deferred to the phase's Studio pass (recorded honestly).
- [ ] Commit `feat: the barracks takes real orders - all eleven troops recruitable with costs in view`.

### Task 11: Smithy research reaches the game

**Files:**
- Modify: `roblox/src/server/CommandService.luau` (new kind `research` → `kingdom.research.queue`, validated: troop in TROOP_ORDER, targetLevel = current+1)
- Modify: `roblox/src/client/init.client.luau` (Smithy section in the village tab: per-troop level + "Research to L(n+1)" button; visible when smithy > 0)
- Test: rules-check additions (research kind exists and maps to the server command; a troop the server can't research is refused client-side copy present); server path already tested

**Behavior:** the server's fully-working research path (audit: DISCONNECTED) becomes reachable.

- [ ] Rules-first; implement; gates + `test:luau`.
- [ ] Commit `feat: smithy research has an interface - kingdom troop levels reachable from the game`.

### Task 12: Notifications reach the player

**Files:**
- Modify: `roblox/src/client/init.client.luau` (a "Herald" feed on the war table: renders `snapshot.notifications` (server caps 12), newest first; unseen-count badge seeded silently on first snapshot like reports)
- Test: rules-check additions (notification kinds map to display lines; first-snapshot seeding rule mirrors seenReports pattern)

**Why (audit §M):** every "X has fallen", "Your Count fell" line is written to the DB and never shown in Roblox.

- [ ] Rules-first; implement; gates + `test:luau`.
- [ ] Commit `feat: the herald - the realm's notifications finally reach the player who earned them`.

### Task 13: March cancel in the client

**Files:**
- Modify: `roblox/src/server/CommandService.luau` (kind `marchCancel` → `march.cancel`; march must be mine + outbound per my snapshot)
- Modify: `roblox/src/client/init.client.luau` (outbound march rows get "Recall" with the two-tap arm pattern)
- Test: rules-check (recall only offered on outbound; arm pattern constant shared)

- [ ] Rules-first; implement; gates + `test:luau`.
- [ ] Commit `feat: recall - the client can turn an outbound army around`.

### Task 14: Hosting is configuration

**Files:**
- Modify: `server/src/index.ts` (`KINGSAGE_BIND` env, default `127.0.0.1`)
- Modify: `roblox/src/server/ApiClient.luau` + `SecretConfig.example.luau` (optional `BASE_URL` in SecretConfig overrides `Config.API_BASE`; missing-secret failure gets a visible server warn loop instead of a silent hang — audit §8.6)
- Test: `server/test/rate-limit.test.ts`-style boot test asserting bind default unchanged; rules-check: ApiClient reads base URL from exactly one place

- [ ] Implement; gates + `test:luau`.
- [ ] Commit `feat: bind and base URL are config - hosting no longer means editing source`.

### Task 15: Truth pass + VPS runbook

**Files:**
- Modify: `docs/AI-TEAM-BRIEFING.md` (gates: 97/97 baseline + this branch's additions; remove the stale 80/81 instruction), `HANDBACK.md` (superseded note), root `README.md` (points at the Roblox game; web prototype clearly archived)
- Create: `docs/ops/vps-runbook.md` — Hetzner/DO smallest box, Ubuntu LTS, node install, `git clone`, systemd unit (env: PORT, KINGSAGE_BIND=0.0.0.0 behind caddy, KINGSAGE_ROBLOX_KEY from `openssl rand -hex 24`, KINGSAGE_AI_TICK_MS), Caddy TLS reverse proxy, nightly `VACUUM INTO` backup cron + restore drill, health check via `/api/health`, deploy-update script. Adam's steps (account + card + domain-or-IP) listed separately and first.

- [ ] Write; verify every command in the runbook against the actual repo layout; commit `docs: the truth pass and the VPS runbook - phase B is a checklist, not a project`.

---

**Definition of done for Phase A:** all gates green (types, server suite ≥ baseline+new, core 92/92, luau rules expanded), the live AI drill logged, HANDBACK.md written on this branch (built / not built / deviations / how to run / open doubts), nothing merged to `main`.
