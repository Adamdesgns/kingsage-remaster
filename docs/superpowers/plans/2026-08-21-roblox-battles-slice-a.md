# Battles Slice A — "the attack round-trip" — Kingsmarch working title

> Spec authority: `docs/superpowers/specs/2026-08-20-roblox-world-is-the-game-design.md` §5 (Battles).
> Predecessors, all executed: slice one, region slice, scouting slice.

**Goal:** you can plan an attack at the war table on a village you scouted,
send it, and get back a battle report you can read — casualties both ways,
loot, verdict — **without needing to be online when it lands.**

## Why this is slice A and not "battles"

Spec §5 wants three things: a 200-troop 3D battle, live squad command when you
attend, and server resolution with a replay when you don't. The handoff is
explicit that the 200-troop spike **has never been measured on a phone**, and
that this measurement "gates the battle slice's fidelity assumptions." Building
the 3D battle before that number exists is how Blockshore's economy V1 ended up
built-and-never-run.

So this slice deliberately ships the half that needs no phone number and no
frame budget:

- **In:** attack planning at the table, the attack march, server-side
  resolution that cannot strand, the surrender mechanic, and a readable battle
  report on both sides.
- **Out, and stated so nobody thinks it shipped:** the 3D battle scene, live
  squad orders during a battle, the replay, and conquest (taking a village).
  Those are **Battles slice B**, gated on `docs/superpowers/spike-200-troops.md`
  existing with real phone numbers in it.

## What the world server already does (verified by reading, not assumed)

`applyWarCommand` in `server/src/store.ts` already implements the whole
warfare chain: `march.launch` kind `attack` (refused without a scout report),
arrival flipping the march to `awaiting_battle`, `battle.open` (refused on a
stale report), sequenced `battle.order` squad commands worth up to +12%,
`battle.retreat`, and `battle.resolve` running `resolveBattle` — deterministic
math, seeded, no runtime RNG. `finishBattle` applies defender casualties, loot,
war victory points, and turns the march into a `return`.

## The three real gaps this slice closes

### 1. An unattended attack strands forever

`battle.resolve` is a **player command**. An attack that arrives while its
owner is offline sits in `awaiting_battle` with the army parked outside the
walls and nothing ever resolving it. Spec §5: *"If offline, the server resolves
it from the plan and stats… Offline attacks work; showing up matters."*

**Fix — the plan moves to launch time.** Spec §5 says attacks are *designed at
the war table* (troops, formation, approach lane, timing), which is when you
send them, not when they land. So:

- `march.launch` kind `attack` carries its `plan` (the same four fields
  `battle.open` already validates). Stored in a new table
  `local_march_plans(march_id, plan_json, auto_resolve_at)` — a new table, not
  an `ALTER TABLE`, because `migrate()` re-runs every migration on every boot
  and SQLite has no `ADD COLUMN IF NOT EXISTS`.
- On arrival the server stamps `auto_resolve_at = arrival + AUTO_RESOLVE_MS`.
- `materializeDueBattles` (new, called from the same materialize pass that
  already ticks jobs and marches) opens and resolves any `awaiting_battle`
  march past its deadline **using the stored plan and zero accepted orders** —
  you were not there, so you get no command bonus. Showing up still matters.
- `battle.open` keeps working exactly as it does for attendance, and may
  reuse the stored plan.

### 2. There is no surrender mechanic

Spec §5 leaves the condition to be designed here. **PROPOSED, deterministic,
no RNG:**

> A defeated defender **yields** instead of dying when the attack was
> overwhelming: the attacker won, the defender has at least one survivor, and
> attacker power was at least `SURRENDER_POWER_RATIO` (3×) the defender's.
> On a yield, the defender's surviving garrison is **removed from the village
> and added to the attacker's returning army**.

Why 3× and why survivors-only: it makes intimidation pay in soldiers exactly
as the spec asks, it can never be better for the attacker to under-commit, and
it can never manufacture troops — every yielded soldier is one that already
existed and is simply moved. The threshold is a named constant, tunable
without touching logic.

### 3. Nothing in the game shows you what happened

**Not a server gap — checked before claiming one.** `readBattleSessions`
already returns every battle where the kingdom was attacker *or* defender, and
`finishBattle` already notifies both sides. The whole outcome — verdict, both
casualty lists, loot, plan score, order bonus — is in
`snapshot.battleSessions[].outcome` and nothing on Roblox reads it. That is
this gap: a client-side one. The War tab grows a **BATTLE REPORTS** section
that renders it for attacker and defender alike.

## What gets built

**Server (`server/`, `packages/game-core/`)**

1. `packages/game-core/src/contracts.ts` — `march.launch` payload gains an
   optional `plan`; new `MarchPlan` alias; `BattleOutcome` gains `yielded`
   (the army absorbed on a surrender, empty when none).
2. `packages/game-core/src/warfare.ts` — `surrenderYield(...)`: the rule above,
   pure and unit-tested.
3. `server/db/migrations/0006_battles_slice_a.sql` — `local_march_plans`.
4. `server/src/store.ts` — plan stored at launch, `auto_resolve_at` stamped on
   arrival, `materializeDueBattles`, surrender applied in `finishBattle`.

**Roblox (`roblox/`)**

5. `CommandService` — `kind = "attack"`: refuses locally when the target has no
   scout report the player holds, builds the `march.launch` with the plan.
6. `Buildings.luau` — `ATTACK_PLAN_OPTIONS` (the four axes and their legal
   values, mirroring `BattlePlan`) and an `ATTACK_PRESET` army.
7. Client War tab — scouted targets grow an **Attack** button, a compact plan
   picker (four rows, tap to cycle), and a **BATTLE REPORTS** section with
   verdict, both casualty lists, loot, and any troops that yielded.
8. Demo tour — after a report lands, plans and sends a real attack, so one
   press of Play carries the whole chain on camera.

**Tests**

9. `packages/game-core/test/` — surrender rule: fires at 3×, does not at 2.9×,
   never invents troops, empty when the attacker loses.
10. `server/test/roblox-battles.test.ts` — through the real `/api/roblox/*`
    routes: attack refused without a report; attack with a plan accepted;
    **an attack whose owner never returns still resolves itself** and the army
    comes home; a defender sees the battle they were in; a yield moves troops
    and conserves the total; a replayed commandId sends one wave.

## Verification

`npm run test:core`, `npm run test:roblox-layer`, `npm run test:gate-d`, and
all four gate checkers. ⚠️ `npm run check:luau` still cannot run — Lune is not
installed on this PC. Say so; do not imply it ran.

Studio drills go in `docs/superpowers/drills-battles.md`, and the demo tour
covers the unattended path hands-free.
