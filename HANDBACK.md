# HANDBACK — package 1.1 AI kingdom tick

Branch: `feat/ai-kingdoms`  
Handoff: `docs/HANDOFF-2026-08-23-ai-kingdoms-grok.md`

## What shipped

- `server/src/ai.ts` exports `runAiKingdomTick(store, worldId, now)`.
- One action per `seat_kind='ai'` village per tick, first applicable of:
  **BUILD → RECRUIT → SCOUT → RAID BACK**.
- Scheduling is off unless `KINGSAGE_AI_TICK_MS` is a positive number.
  `createWorldHttpServer` hooks the same interval pattern as `materializeDueJobs`.
- Player command cores were extracted in `server/src/store.ts` and reused:
  `queueVillageBuild`, `queueVillageRecruit`, `launchVillageMarch`.
  Costs, queue rules, troop gates, and march creation are not duplicated.
- Determinism: the tick takes `now: Date`. Decision logic does not call
  `Date.now()` or `Math.random()`. Incoming-attack recency is compared to `now`.
- Noblemen are never sent on a raid (`noble = 0`; Counts stay home).
- Tests 1–7 (plus 1b for the HTTP hook) live in `server/test/ai-kingdoms.test.ts`.

## What was not built (out of scope, as specified)

- Noblemen / conquest
- Freehold AI
- AI-vs-AI wars (the tick only scouts/raids a kingdom that already attacked it)
- Schema changes, new dependencies, `roblox/` edits, `packages/game-core` edits
- Canned taunt notifications, alliances, LLM/personality text, difficulty settings
- `npm run test:luau` — not run; this package did not touch `roblox/`

## Heuristic choices (handoff left these as examples)

- **Garrison target:** `HQ level × 12` population of **Squires** (`spear`).
  That is the Barracks' basic wall infantry (role: "Holds a wall against horse").
  Farmer's Militia was not used.
- **Recruit batch:** the deficit, capped by what the village can pay and the
  1–100 recruit-order limit. A village that can only afford one Squire recruits one.
- **BUILD** only starts a job it can pay for now. A poor village queues nothing
  (it does not leave unpaid `waiting` jobs).
- **Reported defense** uses game-core only:
  `armyPower(observed, initialTroopLevels(), "defense") * wallFactor(wall) + baseDefence(wall)`.
- **Mustered attack power:** `armyPower` on the home army with `noble` forced to 0.
- **Raid composition:** every home troop except Counts.

## Deviations / things to know

1. **Unclaimed open seats are `seat_kind='ai'`.** `seedWorld()` stamps every
   non-Freehold capital as `ai` until a player claims it. The tick therefore
   also develops Frontier March / open seats. The handoff said iterate
   `seat_kind='ai'`; I did not invent a name filter. If those seats should stay
   untouched until claimed, that is a one-line exclusion after review.
2. **`HANDBACK.md` is at repo root**, as the handoff requires, even though the
   scope lock otherwise says `server/src` and `server/test` only.
3. **`createWorldHttpServer` now returns `aiTickScheduled`.** Extra field;
   existing `{ server, close }` callers are unchanged.
4. **`check:types`** was not runnable in this environment (no `tsc` under
   `node_modules` or `mobile-rebuild/node_modules`). The script exits non-zero
   when skipped. I did not touch `packages/game-core`.

## How to run locally

```
KINGSAGE_AI_TICK_MS=60000
```

Then the existing `roblox/start-dev.ps1` flow. Unset the variable and the
server is the same as today — no AI timer.

```
npm run test:server
```

## Test results (this environment, 2026-08-24)

```
npm run test:server
# tests 90
# pass 87
# fail 0
# skipped 3
```

- All 8 new tests in `server/test/ai-kingdoms.test.ts` passed
  (handoff 1–7 plus 1b for the HTTP schedule hook).
- Pre-existing tests that passed before still passed.
- The 3 skips are `roblox-luau-contract.test.ts` because Lune is not on PATH
  here. The briefing's known 1-fail (`roblox-luau-contract`) was not run and
  was not touched. On a machine with Lune, expect the same pre-existing
  80 pass / 1 fail, plus these new tests all passing.
- `npm run test:luau` skipped (no `roblox/` changes).
- `npm run check:types` skipped — no TypeScript compiler installed here.

## Open doubts

- Should unclaimed `seat_kind='ai'` seats be excluded so a new player does not
  inherit a village the tick already built?
- Is Squire (`spear`) the intended defensive recruit, or Farmer's Militia?
- RAID currently sends scouts with the combat column (they have attack 1).
  Fine by the "never include Noblemen" rail; say if spies should stay home.
- Incoming-attack detection uses `kind='attack'` marches plus battle rows
  where the AI is defender. A march that already flipped to `return` after
  battle is still visible via the battle row.
