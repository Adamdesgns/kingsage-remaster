# Kingsmarch audit fixes — verification, 2026-09-03

Branch: `feat/audit-fixes-codex`, based on main `9b478db`.
Implementation approved by Adam: **“Do it.”** This authorizes the local audit fixes; it does not authorize merge, push, hosting changes or publication.

## Result

All twelve audit findings have corresponding local changes. They are verified by executable regression/contract checks where possible. F11's actual rendered appearance and all current Studio/phone behavior remain live acceptance checks.

| Finding | Implemented behavior | Evidence |
|---|---|---|
| F1 legacy admission | Hosted factory defaults close legacy accounts, cookies, streams, commands and static pages | 3 deployment-boundary tests; existing protocol tests explicitly opt in |
| F2 dev/live mix | Dev/demo exclude SecretConfig, use a local key and loopback only in Studio; production uses the separate live project only when published | 25 connection checks execute real ApiClient with stubbed services; build marker proof |
| F3 horse growth | Durable fractional carry survives frequent updates, restart and Stable upgrades; capacity discards excess | Store tests, migration 0013 |
| F4 refused conversions | Population validation completes before units/horses are spent | Refused-order regression preserves assets/jobs/version |
| F5 battle duplication | Open sieges block departures and new spending; already-paid work, reinforcements and production survive | Spending/marching, restart, AI-path and wall-upgrade regressions |
| F6 captured-home return | Troops/loot travel onward to a remaining holding; a fully eliminated realm gets an explicit loss notification | Return tests cover both ownership outcomes, loot and route geometry |
| F7 dead seats | Only living kingdoms with owned capitals are claimable | Stale/dead-capital regression |
| F8 secondary holdings | Every owned settlement gets a private war table bound to its own village | 50-holding fan-out, secondary command callbacks, transfer revocation |
| F9 fresh AI | Attacked empty-start AI builds prerequisites, pays to train a spy, scouts and can retaliate | Production-start regression, no injected AI scouts |
| F10 cavalry prices | Catalog/rows state consumed infantry and horses; resource conversion cost is zero | Catalog test and x1/x5/x25 UI scenarios |
| F11 phone rows | Wrapped text owns a separate row; cards grow; actions are at least 44 px; map scales to panel width | 320/390 layout constraint scenarios; actual Studio render still owed |
| F12 conquest intelligence | Scout cards show observed Realm of Power/max and report age | Missing/zero/known data UI scenarios |

## Commands and results

- `node --experimental-strip-types --test test/*.test.ts` from server: **130/130 pass**.
- `node --experimental-strip-types --test packages/game-core/test/*.test.ts`: **92/92 pass**.
- `node scripts/check-types.mjs`: game-core/server pass.
- `lune run roblox/scripts/syntax-check.luau`: **34/34 files pass**.
- `lune run roblox/scripts/rules-check.luau`: **72/72 pass**.
- `lune run roblox/scripts/spike-sim-check.luau`: **7/7 pass**.
- `lune run roblox/scripts/connection-check.luau`: **25/25 pass**.
- `lune run roblox/scripts/client-audit-check.luau`: **5/5 scenarios pass**.
- Normal/demo build-only launchers both succeed without starting servers or Studio.
- Rojo default, demo, live and spike builds pass. A temporary fake credential marker appears only in the live artifact; dev/demo/spike exclude it. The marker source and fake live artifact were removed afterward. No real production credential entered this worktree.
- Independent reviews covered store conservation, migration, returned-march routing, HTTP boundaries and connection/build policy. Identified issues were fixed before final gates.
- Initial sandbox-only full server invocation could not execute installed Lune (`EPERM`); the final run with execution permission passed without skips.
- Existing installed dependencies are reused through ignored node_modules junctions. No packages were installed or changed.

## Gameplay decisions made to close the defects

- A village under an open siege cannot begin training/research/spending or send troops away until the battle ends. Construction orders can wait. Already-paid work and arrivals remain valid.
- If an army reaches a captured home, it spends real additional travel time reaching an owned capital/holding. If no holding remains, the return completes with an explicit loss record; it never gifts assets to the conqueror.
- The six-seat model remains. Dead seats are refused instead of silently creating new kingdoms.
- Development and production are separate build targets; the production target intentionally cannot run live-world HTTP in Studio.

## Live acceptance still required

No running app was launched/stopped/reconfigured and no live world command was sent.

1. Use the isolated normal dev place against a local test world. Verify both capital and conquered-village war tables; recruit/research/scout/attack from the second holding and confirm the named village actually changes.
2. Check 320/390 phone presentation in Studio and a real phone: long cost text, batch sizes, buttons, scroll reachability, report age and Realm of Power.
3. With two clients, take a holding while its old owner has the table open; confirm the panel closes and private detail transfers correctly. Test respawn.
4. Verify siege refusal messages and post-siege queue resume in the player UI.
5. Recheck full-settlement performance on real devices. The historical isolated troop spike is not full-game performance evidence.
6. After separate release approval, back up the hosted database, allow old open battles to finish, deploy the tested server and publish its matching private live client. Verify legacy routes return 404, the real admission loop works and horses grow under normal polling. Do not reuse dev/demo as the published live game.

## Deferred product scope

World capacity expansion, re-entry/endgame/reset/new worlds, alliances/trade/donations, and remaining night/trebuchet integrations were not part of this approved bug-fix pass. Production permissions, backups and restore drills were not rerun.
