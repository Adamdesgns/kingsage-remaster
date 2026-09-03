# HANDBACK — September audit fixes

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
