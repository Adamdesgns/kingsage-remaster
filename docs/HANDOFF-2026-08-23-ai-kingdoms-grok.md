# HANDOFF: AI Kingdom Behavior Tick ("the world fights back")

> Written 2026-08-23 for an external AI agent (Grok) working overnight,
> unsupervised, on this repository. Everything you need is in this file and
> the repo. The repo owner is Adam (GitHub: Adamdesgns); Claude reviews your
> branch in the morning. **Read this whole file before writing any code.**

## The one-sentence job

Make the four AI kingdoms actually play: on a server-side tick they build,
recruit, scout, and raid by simple deterministic rules — through the same
rule functions players use, gated behind an env var, proven by tests.

## Hard rules (violating any of these gets the branch rejected)

1. **Branch `feat/ai-kingdoms`. Never commit to `main`. Never force-push.**
2. **Touch ONLY `server/src/**` and `server/test/**`** (or wherever the
   existing server tests live — follow the existing layout). Do not touch
   `roblox/`, `packages/game-core/`, `docs/`, place files, or CI/config.
3. **No schema changes.** Design the tick stateless: every decision derives
   from rows that already exist (villages, buildings, army, marches, queue,
   battle history via notifications/marches). If you believe you need a new
   table, you have mis-scoped — simplify the heuristic instead.
4. **No new dependencies.** Node built-ins only, matching the existing code.
5. **The tick is OFF unless `KINGSAGE_AI_TICK_MS` is set.** Unset means the
   server behaves byte-for-byte as today. Every existing test must pass
   without setting it.
6. **Determinism.** The tick entry takes `now: Date` as a parameter. No
   `Date.now()` / `Math.random()` inside decision logic — if you need
   variety, derive it from a seeded hash the way `store.ts` already seeds
   battles (search for `seed` in `settleBattle`/`applyRealmOfPower`).
7. **Reuse the real rule paths.** AI actions must go through the same cost
   checks, queue rules, and march creation the store already implements for
   players. If an existing method demands a player identity, extract its
   core into a shared private method and call that from both paths — never
   duplicate a rule. Duplicated rules are how this project's worst bugs
   happened.
8. **Honest reporting.** This project's dominant recorded failure mode is
   code that reports success while doing nothing. Every behavior you claim
   must have a test that FAILS if the behavior is deleted. No test, no
   claim.

## Repo orientation

- `server/src/store.ts` — SQLite store; ALL game authority lives here.
  Big file; read the sections you touch, especially `seedWorld()`,
  `materializeDueJobs()` / `materializeDuePass()`, march/battle handling,
  and the command handlers (`build`, `recruit`, `scout`, `attack`).
- `server/src/http.ts` — HTTP layer; a timer already calls
  `materializeDueJobs` periodically (~line 113). Your tick hooks in the
  same way, from `index.ts`/`http.ts`, on its own interval.
- `server/src/index.ts` — entry point.
- `packages/game-core/` — shared rules (combat, economy, fixture). Read
  freely, change nothing.
- AI kingdoms: seeded by `seedWorld()` from
  `packages/game-core/src/fixture.ts` — 4 kingdoms with `seat_kind='ai'`
  (Warlord Kaas, Ember Crown, Verdant Pact, The Ashen Court), plus 4
  `seat_kind='freehold'` settlements (never AI-driven — Freeholds are the
  players' first conquest rung and must stay passive) and 2 open seats.
- **Quirk:** `KINGSAGE_DATABASE_PATH` resolves relative to `server/`, so
  relative paths nest. Tests use their own fixtures; follow the existing
  test patterns.

## Commands and gates

```
npm install            # once, repo root
npm run test:server    # node test runner. CURRENTLY 80 pass / 1 fail —
                       # the 1 failure is roblox-luau-contract.test.ts, a
                       # known-stale fixture that predates Realm of Power.
                       # It is NOT yours to fix and NOT yours to break:
                       # the bar is "still exactly 80/81, plus your new
                       # tests all passing."
npm run check:types    # tsc gate on packages/game-core (server/src is not
                       # covered — keep your code type-clean anyway; it
                       # runs under --experimental-strip-types, which
                       # ERASES types without checking them)
```

`npm run test:luau` needs Lune and Studio-side files — you are not touching
`roblox/`, so you may skip it; say so honestly in your summary if you do.

## The design (already reviewed — build this, not your own idea)

New module `server/src/ai.ts` exporting `runAiKingdomTick(store, worldId,
now)` plus a scheduling hook in the server entry:

- Interval from `KINGSAGE_AI_TICK_MS` (unset = never scheduled). Each pass
  iterates AI kingdoms (`seat_kind='ai'`) and runs the priority list below
  for each of that kingdom's villages. One action per village per tick
  keeps AI progress slow and legible.

Priority list (first applicable action wins):

1. **BUILD** — if the village build queue is empty and a building upgrade
   is affordable, queue the lowest-level building among this priority:
   Farm → Warehouse → resource buildings (lowest first) → Barracks →
   Rampart → HQ → everything else lowest-first. Use the existing build
   command core (costs, queue mechanics).
2. **RECRUIT** — maintain a defensive garrison target scaled by HQ level
   (e.g., `HQ level × 12` population worth of the basic defensive
   infantry the Barracks offers). Below target and affordable → recruit a
   batch through the existing recruit path. Choose troop types that exist
   in `packages/game-core` — read the roster, don't guess names.
3. **SCOUT** — if this kingdom was attacked since its last scout action
   (derive from marches/battle rows targeting its villages) and it has
   scouts, scout the most recent attacker's nearest village through the
   real scout path.
4. **RAID BACK** — if it holds a scout report on a village belonging to a
   kingdom that attacked it, and its musterable attack power is at least
   1.5× the reported defense (compute with the real combat tables from
   game-core — never invent numbers), launch an attack march through the
   real attack path. **Never include Noblemen: the AI must not conquer
   player settlements in v1.** This is a deliberate safety rail for young
   players; Adam flips it later, not you.

Explicitly out of scope (do not build): AI-vs-AI wars, AI conquest of
anyone, Freehold behavior, alliance logic, any LLM/personality text, any
Roblox client change, difficulty settings, and anything touching the
Roblox HTTP contract. Canned taunt notifications are also out — the
notification text pipeline feeds the Roblox client and has a platform
filtering requirement you cannot verify from here.

## Required tests (each must fail if its behavior is removed)

1. Tick disabled: `KINGSAGE_AI_TICK_MS` unset ⇒ scheduling never starts;
   calling nothing changes nothing.
2. BUILD: a poor AI village queues nothing; an affordable one queues
   exactly one job through the real queue (resources actually deducted,
   `state_version` bumped).
3. RECRUIT: below-target garrison recruits through the real path; at-target
   garrison does not.
4. SCOUT: an attacked AI kingdom scouts its attacker; an unattacked one
   does not.
5. RAID: with a report showing weak defense, a march launches with
   `noble = 0` always; with strong defense, no march.
6. Priority: a village that can both build and recruit builds only (one
   action per village per tick).
7. Determinism: two runs over identical DB state with identical `now`
   produce identical actions.

## Definition of done

- Branch `feat/ai-kingdoms` pushed, containing `server/src/ai.ts`, the
  scheduling hook, and the tests above.
- `npm run test:server`: exactly the pre-existing 80/81 plus ALL your new
  tests passing. Nothing else modified.
- A `HANDBACK.md` at repo root on your branch: what you built, what you
  did NOT build, every deviation from this spec with its reason, how to
  run it locally (`KINGSAGE_AI_TICK_MS=60000` + the existing
  `roblox/start-dev.ps1` flow), and anything you are unsure about. Honesty
  over polish — an accurate "I didn't get to X" is worth more than a
  claimed feature that doesn't exist.

## Morning review

Claude diffs the branch against this spec, runs the gates clean-room, and
live-tests the tick against a fresh seeded world before anything merges.
Nothing you push reaches `main` or the kids' game without that review.
