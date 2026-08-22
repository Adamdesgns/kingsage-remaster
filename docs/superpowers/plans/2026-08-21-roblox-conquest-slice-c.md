# Conquest — battles slice C (the last mechanic)

> REQUIRED SUB-SKILL: superpowers:executing-plans. Spec authority:
> `docs/superpowers/specs/2026-08-20-roblox-world-is-the-game-design.md`
> §5 (surrender + celebration) and §1 (world domination, one settlement at a time).

**Goal:** A village can change hands. Noblemen ride with a winning attack,
loyalty falls, and at zero the settlement becomes yours — with the big
skippable celebration the spec asks for, and the world visibly re-drawn
around your new holding.

**Why now:** every other rung is built. Slice A made attacks land and
garrisons surrender; slice B made the fight watchable. Nothing yet transfers
ownership, so "take over the world one settlement at a time" is still a
promise. This closes it.

## Rules (locked here so the code and the tests agree)

1. **Only a winning, resolved attack can shake loyalty.** Retreats and defeats
   never move it. Nobles that die in the fight never count — only survivors.
2. **Each surviving Nobleman drops loyalty by 20–35**, derived deterministically
   from the battle seed (`loyaltyDrop` in game-core, same `hashFraction` the
   combat math already uses). Same battle → same drop, forever, on any replay.
3. **Loyalty ≤ 0 → the village changes hands.** It joins the attacker's
   kingdom, loyalty resets to **25** (freshly conquered villages are fragile
   and can be taken straight back), and its surviving garrison disperses.
4. **One Nobleman is consumed** to seat the new lord; he does not march home.
   Every other survivor, the loot, and any surrendered troops still return.
5. **Scoring:** the attacker gains `conquestWarVictoryPoints(...)` — the
   anti-farming helper that has sat unused in contracts since Gate A — and
   `villages_conquered + 1`.
6. **Losing a capital re-seats it:** if the taken village was the defender's
   capital and they still hold others, the oldest remaining becomes the new
   capital. **A kingdom with no villages left is dead** (`alive = 0`).
7. **A conquest is its own event** (`village.conquered`) carrying the village,
   both kingdom ids and names, so clients can react rather than diff.

## Server (`server/`)

- `packages/game-core/src/warfare.ts`: export `loyaltyDrop(seed, index)` and
  `LOYALTY_ON_CAPTURE = 25`.
- `server/src/store.ts` → inside `settleBattle`, after the garrison is
  updated and before the homeward march is written: `applyConquest(...)`.
  It must run in the SAME transaction as the rest of the settlement, so a
  village can never half-change-hands.
- Tests `server/test/roblox-conquest.test.ts` (through the real routes where
  possible, store-level where the fixture must be posed):
  1. nobles that survive a win drop loyalty by a deterministic amount;
  2. loyalty at zero transfers the village, resets to 25, clears the garrison,
     consumes exactly one noble;
  3. a defeat or retreat with nobles aboard moves nothing;
  4. taking a kingdom's last village kills the kingdom;
  5. taking a capital re-seats the loser's capital;
  6. the conquered village is no longer fogged for its new owner (it appears
     in their snapshot with real levels).

## Roblox (`roblox/`)

- `src/shared/Config.luau`: celebration timings.
- `src/client/init.client.luau`: on each sync, if a village id is newly in my
  owned set (and I have seen a snapshot before — never on the join seed), fire
  **`Celebration.play(villageName)`**.
- `src/client/Celebration.luau` (new): the spectacle, and it must obey the
  spec — **big, skippable, non-blocking**:
  - a banner headline ("<Village> is yours"), gold on dark, that animates in;
  - fireworks: pooled parts launched and burst over the keep, no Humanoids,
    hard-capped, all cleaned up;
  - a loot shower of tumbling coins near the war table;
  - a "Skip" button, and it never blocks input, movement, or prompts;
  - auto-clears after ~8s; skipping clears instantly and cancels the pool.
- `src/server/SettlementBuilder.luau` already re-renders by ownership every
  sync, so the taken settlement becomes a full walkable holding on its own —
  verify, do not rebuild.

## Verification

- `npm run test:gate-d`, `npm run test:roblox-layer`, and the new conquest
  tests green.
- `npm run check:luau` (all files compile) and both `rojo build`s.
- Drills appended to `docs/superpowers/drills-battles.md` (C1–C4), including
  the one that matters: **conquer, then walk in through the gate you just
  took.**
