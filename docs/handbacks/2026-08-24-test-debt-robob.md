# HANDBACK — package 1.2 test debt (feat/test-debt-robob)

Handoff executed: `docs/HANDOFF-2026-08-23-test-debt.md`.
Started from `main` (`373b3ff`). Did not touch `feat/ai-kingdoms`. Did not edit `packages/game-core`.

## Built

### Task 1 — stale `roblox-luau-contract.test.ts`

The failing fixture still seeded `loyalty = 20` and expected a one-wave capture reset to 25. Realm of Power replaced that: maximum is `settlementPoints(buildings)`, one Count acts per attack, one attack never removes more than 50% of maximum, and a captured settlement resets to `REALM_OF_POWER_ON_CAPTURE` (0.3) of that maximum.

Repair (as prescribed):
- Seed `realm_of_power = 1` (and `realm_of_power_at`) on the target so one surviving Count finishes the campaign.
- Keep the real Luau→HTTP path: `musterViaLuau` still builds the army; `/api/roblox/commands` still accepts it.
- After the fight, assert ownership transfer **and** `Math.max(1, Math.round(capturedMax * REALM_OF_POWER_ON_CAPTURE))`.
- `capturedMax` is read from the village's **post-battle** `buildings_json`. The Luau muster includes rams; `applyConquest` scores the settlement after `ramWallAfterBattle` may raze the wall. Asserting pre-fight points (293 → expected 88) disagrees with the store (257 → 77). That is the same formula the server uses, not a number tweak.

Source of truth used, not rewritten: `packages/game-core/src/combat.ts` `REALM_OF_POWER_ON_CAPTURE` and `settlementPoints()`.

Lune 0.10.5 was installed on this machine (`~/.local/bin/lune`) so the contract test actually runs. It is not committed.

### Task 2 — `check:types` covers `server/src`

- Added `@types/node@26.2.0` as the one new root `devDependency` (handoff: pin to the Node major the world server runs).
- `tsconfig.check.json` now includes `server/src/**/*.ts` and `"types": ["node"]`.
- `scripts/check-types.mjs` no longer prints the "server/src is NOT covered" caveat.
- Root `package-lock.json` added so `npm install` at the repo root gets the types. `tsc` is still borrowed from `mobile-rebuild/node_modules`.
- Root `.gitignore` now includes `node_modules/` so the new root install is not committed.

Type-level fixes in `server/src/store.ts` only:
1. Import `TroopLevels` (used by `applyConquest`, never imported — `--experimental-strip-types` hid it).
2. Narrow the leftover command to `village.build.queue` before reading `payload.building` / `payload.villageId`. tsc cannot narrow after `.includes()` on war-command types. Alliance commands in `GameCommand` are already rejected by the allowlist above; this guard makes that path typed. Unreachable leftover types now get the same "not active yet" rejection as the allowlist.

No `any` sprinkled. No `@ts-ignore` / `@ts-expect-error`.

## Mutation check (Task 1)

Required honest test: the repaired contract must fail if conquest is deleted.

1. Temporarily replaced `conquest = this.applyConquest(...)` in `SharedWorldStore` with `{ captured: false, nobleConsumed: 0, villageName: "" }` so `applyConquest` never fires.
2. `node --experimental-strip-types --test test/roblox-luau-contract.test.ts` **failed**:
   - `the village changed hands — a Luau-built army completed a conquest end to end`
   - expected `kingdom-1`, actual `kingdom-2`
3. Restored `this.applyConquest(...)`.
4. Same test then passed (2/2). Full suite after restore: **81/81**, 0 skipped.

The test is not a number-until-green gate. Deleting capture leaves the village on the defender.

## Suppressed type errors

None.

## Suspected real bugs surfaced by tsc

None that change live behavior.

The fallthrough after chat / war / recruit / research assumed the remainder was `village.build.queue`. That was a type hole, not a runtime bug on the current allowlist (`alliance.*` is rejected as "not active yet" before the fallthrough). Listed so review can see the new explicit guard.

`TroopLevels` missing from the import list would have been a `ReferenceError` if that name were ever evaluated as a value; it is only used as a type parameter to `parseJson<TroopLevels>`, which strip-types erases. Still a real gap for `tsc`.

## How to run

```bash
# Lune must be on PATH or the contract test skips (it must not skip for this package).
# This environment: ~/.local/bin/lune (v0.10.5). Adam's PC already has it.
npm install                 # root: @types/node
npm --prefix mobile-rebuild install   # tsc, if not already present
npm run test:server         # 81/81 with Lune
npm run check:types         # game-core + server/src, no "NOT covered" note
npm run test:luau           # if Lune is on PATH
```

This environment's `node --version` is **v22.14.0**. Types are pinned to **26.2.0** per the handoff ("the server runs Node 26"). `packages/game-core` engines still say `>=22.6`.

## Not built

- Package 1.1 AI kingdoms.
- No Roblox client authority. World server remains authoritative.
- No `packages/game-core` edits.
- No schema / migrations.
- Lune is installed on this agent VM only, not in the repo.

## Gate output (this branch, after restore)

`npm run test:server` (Lune 0.10.5 on PATH — contract tests **ran**, did not skip):

```
1..81
# tests 81
# suites 0
# pass 81
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2459.853476
```

`npm run check:types`:

```
Type check passed: packages/game-core/src and server/src are type-clean.
```

`npm run test:luau` (optional, Lune available):

```
---- 23 files checked, 0 failed ----
---- 21 rules checked, 0 failed ----
```

## Open doubts

- Whether CI images have Lune. Without it, `test:server` will skip the two contract tests (loud skip, not a silent pass) and the count will not be 81/81.
- Whether Adam's machine / CI runs Node 26 as the handoff says. This VM is Node 22. If 26-only typings ever disagree with 22, the pin should move — not silently.
