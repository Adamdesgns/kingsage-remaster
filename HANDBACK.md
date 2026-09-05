# HANDBACK — Practice siege connected; Studio access pending

**Date:** 2026-09-04. **Branch:** `feat/practice-siege-codex`. **Continuation of:** `36758fb`, still based on unmerged/unpushed `09cf525`.

The practice planner is now connected to the War tab and the authenticated server command. It collects three bounded integer routes, preserves target turns, displays tower ranges and ordered server reasons, and supports reset/retry. The separate bridge returns practice results and rejection messages without live snapshot/version/battle changes. Shared validation and actual TypeScript/Luau contract tests prevent vocabulary/geometry drift. Closing/resetting cancels late results; active strokes survive heartbeats and reject conflicting second-finger controls.

**Verified:** types; 101 core tests; 138 server tests; 40 Luau syntax files, 72 rules, 7 simulations, 25 connection checks, 5 existing client scenarios, 272 practice contract checks, 28 bridge checks, 7 planner scenarios, 48 wiring checks; isolated Rojo dev build; clean diff; real HTTP/durable-byte no-mutation probe. Full details, corrections and hash evidence: [practice siege verification](docs/verification/2026-09-04-practice-siege-wiring.md).

**Not verified:** Studio play, rendered layout, real touch/device behavior, child comprehension, or gameplay recording. The interactive launch returned `Computer Use app approval timed out`; no screenshot or in-game request was observed. A fresh local server was left on loopback 4178 and health passed. The ignored normal place is `roblox/WorldGame-dev.rbxlx`; its fresh ignored database is `server/data/practice-studio-6bdbf5e57e50421f93ab92fa9b6380cc.sqlite`. Recheck processes and access before resuming; do not use the older audit place/database by mistake.

**Next:** obtain Studio app access, open that local development place, Play and prove War → Practice siege with all three drawn routes, target changes, ordered events/reasons, rejected input, reset/retry and phone layouts. Then record the honest captioned practice walkthrough and obtain Adam's hands-on judgment. No merge, push, deployment, Roblox publication or live-world changes without Adam. The broader locked roadmap remains future work.

**New/changed in this continuation:** `package.json`; `roblox/src/client/PracticeSiege.luau`; `roblox/src/client/init.client.luau`; `roblox/src/server/CommandService.luau`; `roblox/src/shared/PracticeSiegeConfig.luau`; four `roblox/scripts/practice-*-check.luau` gates; `scripts/verify-practice-persistence.mjs`; `server/test/practice-siege-luau-contract.test.ts`; this handback and its linked verification document. No schema, migration, production battle code, secret, or live connection configuration changed.

---

# Previous handback — Player-first roadmap and practice siege checkpoint

**Date:** 2026-09-04
**Branch:** `feat/practice-siege-codex`
**Base:** `09cf525` on `feat/audit-fixes-codex`, which is itself unmerged and unpushed
**Owner authorization:** Adam said “Start,” then “Lock this roadmap in and keep working until you need me.”
**Release boundary:** local only; no merge, push, deploy, publication, live-world change, or purchase.

## What Adam locked

The dated roadmap at `docs/plans/2026-09-04-player-first-roadmap.md` is now the product direction. It records ages 9+, a starter city and army for every new player, a beginner shield until the first deliberately confirmed real attack, a guided first session, functional map-command sieges and saved defenses, world/clan communication, clan profiles and rosters, the Great Hall social hub, Tourney Grounds, building-guide NPCs, cosmetic expression, and later peaceful jobs/economy. `docs/design/CANONICAL-BRIEF.md` now carries the owner overrides for ages 9+ and future cosmetic-only monetization.

## Built in this checkpoint

- A versioned, JSON-safe, deterministic TypeScript practice-siege resolver in `packages/game-core/src/practice-siege.ts`.
- Three squads draw 0–100 integer-grid routes through a fixed fort with a gate, two archer towers, a barricade, and keep doors.
- Routes, chosen objectives, tower exposure, tower-clearing order, wall entry, the barricade, and the saved defense priority materially affect casualties or outcome.
- Strict request validation rejects missing/extra keys, wrong versions/plans/objectives, decimals, out-of-map points, backward routes, duplicate points, missed objectives, and routes that do not finish at the keep.
- A stateless authenticated `practice.siege.resolve` Roblox HTTP command. It uses the existing key, linked identity, command-shape guard, and rate limiter, then resolves before `store.applyCommand`, so it writes no inbox row and mutates no world data.
- Clear `command.rejected` validation responses with `INVALID_PRACTICE_SIEGE`.
- A shared Luau vocabulary/geometry module and an unconnected touch-first `PracticeSiege.luau` planner module. They compile and are preserved for continuation.

## Not built yet

- The Roblox planner is **not wired** into `CommandService.luau` or `init.client.luau`; there is no Practice button at the War Table and no in-game request can reach the server yet.
- No Roblox rule/runtime tests specifically exercise route drawing, the command bridge, 320/390 layouts, result replay, or clear rejection copy.
- No Studio interaction, two-client drill, real-phone check, or visual acceptance was performed.
- No tutorial, starter-city allocation, beginner shield, saved player defense, incoming attack, real-army integration, clans/chat, Great Hall, NPC guides, store, shows, or jobs were implemented. They are roadmap work, not current behavior.
- The requested full-day captioned walkthrough video was not recorded. Record it only after the interface is connected and stable enough to teach honestly.

## Verification completed

- `npm run check:types` — pass.
- `npm run test:core` — 101/101 pass, including 9 practice-siege tests.
- `npm run test:server` — 135/135 pass, including 5 practice API tests. The first sandboxed run reached 133/134 and failed only because Windows denied spawning Lune; the approved outside-sandbox rerun passed clean.
- `npm run test:luau` — pass: 36 syntax files, 72 rules, 7 spike simulations, 25 connection checks, and 5 client audit scenarios. These existing rules compile the two new modules but do not prove the new UI behavior.
- `rojo build roblox/default.project.json -o .tmp/practice-siege-dev.rbxlx` — pass after creating the ignored `.tmp` output directory.
- Focused core suite — 9/9 pass. Focused server suite — 5/5 pass.
- `git diff --check` — pass before handback update.

## Exact next steps

1. Review `PracticeSiegeConfig.luau` and `PracticeSiege.luau` against the TypeScript contract; keep the coordinate system at integer 0–100 and the command name `practice.siege.resolve`.
2. Add a non-village `practiceSiege` request to `CommandService.luau`. Forward `{version, routes, objectives, defensePlan}` and return `body.payload.practiceSiege`; surface `command.rejected.payload.message` unchanged.
3. Add a Practice entry inside the existing War Table and mount the planner from `init.client.luau` without changing `BattleScene` or the production battle path.
4. Add deletion-sensitive Luau checks for request vocabulary, route validation, no `BattleScene` dependency, 44px controls, 320/390 layout, accepted replay, and rejected-plan copy.
5. Run all gates and the Rojo build again.
6. Start an isolated local world server and Studio only when continuing the test. Prove drawing all three routes, submitting, seeing ordered phase events/reasons, reset/retry, and no world-resource/version mutation.
7. After Studio acceptance, capture the requested captioned walkthrough. Keep it labeled as practice until the real-city tutorial and attacks exist.
8. Ask Adam before any merge into the audit-fix branch, GitHub push, VPS deploy, or Roblox publication.

## Files created or changed in this checkpoint

- `docs/plans/2026-09-04-player-first-roadmap.md`
- `docs/superpowers/specs/2026-09-04-practice-siege-prototype.md`
- `docs/design/CANONICAL-BRIEF.md`
- `packages/game-core/src/practice-siege.ts`
- `packages/game-core/test/practice-siege.test.ts`
- `packages/game-core/src/contracts.ts`
- `packages/game-core/src/index.ts`
- `server/src/http.ts`
- `server/test/practice-siege-api.test.ts`
- `roblox/src/shared/PracticeSiegeConfig.luau`
- `roblox/src/client/PracticeSiege.luau`
- `HANDBACK.md`

---

# Previous handback — September audit fixes

Branch: `feat/audit-fixes-codex`. Base: main `9b478db`.
Adam authorized implementation with **“Do it.”** Work is local and ready for integration review. No merge, push, live deployment or publication was performed.

## Built

- Hosted defaults reject retired web account/world/static routes.
- Separate development/demo and production Roblox targets, with an executable transport policy and development credential exclusion.
- Fractional horse production, rejection-safe cavalry conversion, siege asset guards, preserved wall upgrades, correct captured-home return routing, and living-seat eligibility.
- Full private war tables in all owned holdings.
- Fresh-start AI reconnaissance preparation and retaliation.
- Accurate cavalry costs, growing/wrapped mobile rows with 44 px actions, and observed conquest-strength reports.

## Verification

**130 server tests, 92 core tests, type checking, 34 Luau files, 72 rules, 7 troop simulations, 25 connection checks and 5 UI/binding scenarios all pass.** Four Rojo targets and credential-exclusion proof pass. Independent review found no remaining blocker in the reviewed fixes.

Full evidence and exact live checks: [docs/verification/2026-09-03-audit-fixes.md](docs/verification/2026-09-03-audit-fixes.md).

## Files

Server:
- `server/src/http.ts`, `server/src/store.ts`, `server/src/ai.ts`
- `server/db/migrations/0013_horse_fraction.sql`
- New `server/test/audit-store-integrity.test.ts`, `ai-fresh-retaliation.test.ts`, `deployment-boundary.test.ts`
- Existing `server/test/gate-b.test.ts`, `rate-limit.test.ts`, `roblox-api.test.ts` narrowly updated for explicit legacy harnesses/true conversion costs

Roblox:
- `roblox/src/server/ApiClient.luau`, new `ConnectionPolicy.luau`, `SecretConfig.example.luau`, `WarTable.luau`, `SettlementBuilder.luau`
- `roblox/src/client/init.client.luau`
- `roblox/default.project.json`, `demo.project.json`, new `live.project.json`, `start-dev.ps1`
- New `roblox/scripts/connection-check.luau`, `client-audit-check.luau`; existing `rules-check.luau` updated

Checks/docs:
- `package.json`, `README.md`, `roblox/README.md`, `docs/ops/vps-runbook.md`, this handback and the verification record

## Decisions and limits

Open sieges block new defender spending/departures while preserving paid work and arrivals. Fallen-home returns travel onward to a remaining owned holding; eliminated realms receive explicit loss notifications. Dead kingdoms do not become joinable seats. Migration 0013 preserves existing whole horses and has been exercised only against disposable local databases.

The new UI is source/runtime-stub verified, **not yet visually accepted in Studio or on a real phone**. Full-game/two-client play remains the next gate. Default/demo builds are local-only; production must use `live.project.json` after separate release approval.

No world capacity/lifecycle, alliances or trade scope was added. Main and the live world remain unchanged.

## Studio checkpoint — 2026-09-03

Adam authorized the local playtest, then stopped for tomorrow. The isolated server answers health and the exact development place successfully joined and rendered its town/resource HUD in Studio. No war-table, two-client or phone acceptance pass is claimed. Server/Studio were left running at the stop. Two playtest-tool fixes prevent false build success and count secondary-holding war tables correctly. See [the resume checkpoint](docs/verification/2026-09-03-studio-playtest-checkpoint.md).
