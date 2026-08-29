# HANDBACK — Slice 1: "The field is a place"

Branch: `feat/slice1-field-is-a-place` (from `main` at `df6c59a`). Never
committed to `main`. Written 2026-08-29, overnight session on Adam's word
("keep working build all night"). Plan executed:
`docs/superpowers/plans/2026-08-28-slice1-field-is-a-place.md`.

## Built

- **Boxie's dressing + banners merged forward** across the SoldierBuild
  refactor (`fdfa565`). Kept main's shared soldier body; salvaged only the
  dressing helpers. All 14 of boxie's rules survive; banner budget gate
  re-mutation-checked post-merge (4th banner part → 2 rules fail, revert →
  green). Boxie's analytic counts stand: dressing 61/120, banners 9/9.
- **`BATTLE_ORDER_CAP = 5`** in game-core, mirrored as
  `BattleConfig.ORDER_CAP` with a no-Lune text-parity test (roster-parity
  pattern) so the numbers cannot drift (`5fb69bb`).
- **Server enforces the cap**: 6th field order → 409 `ORDER_CAP_REACHED`
  (`048736b`). The orderBonus formula untouched; reachable max is now 0.10.
- **`battle.open` extends the realm deadline +3 minutes** (hard, once per
  march by construction; SQLite `MAX(auto_resolve_at, now+3min)`)
  (`161b538`).
- **Client mirror refuses order 6 locally** with the same sentence, gated
  by a rules-check that the mirror reads `BattleConfig.ORDER_CAP` and never
  a hand-typed number (`249e7d6`). Verified live: 5 orders accepted
  server-side (`accepted battleOrder (x5)` in Output), 6th tap never sent.
- **Attend on foot** (`c6a6a5c`): `BattleScene.footAnchor()` derived from
  shared field geometry (attacker baseline +Z, one step back, 3 studs up);
  panel gains "Walk the field"/"Overhead" toggle; overhead is the
  unconditional entry view; `exitBattle` restores the commander's
  pre-battle position; panel heading counts "N left" against the cap.
- **Determinism gate** (`1788fbf`): resolveBattle is pure (same input
  twice ⇒ deep-equal), and a stored outcome is recomputable from nothing
  but the stored battle row + order count.

## Verified live in Studio (2026-08-29, fresh dev world, human eyes)

Full loop played: scout → attack → attend → 5 orders → charge → victory →
leave. Seen working: cobble road to the defender's gate with wear discs and
edge trees; three tinted squad banners tracking their squads; overhead
default; WALK THE FIELD dropping the commander at the attacker baseline
facing the fight; tap-ground orders from the on-foot view; orders-left
counting 5→0; the 6th order stopped client-side; commander restored to the
war room on exit with the loot arriving home.

## Not built (deliberate)

- The draft design's "3 orders unattended" cap: field orders can only exist
  through an opened battle (there is no unattended order path), and the red
  team made the cap view-neutral — so ONE cap of 5 is the honest
  implementation. Recorded in the plan's Global Constraints.
- Nothing else from Slices 2–4 (rally, heartbeat, horses, villagers).

## Found during verification — AND FIXED (`6da8416`)

**Every client `battleOpen` since commit `9467e02` was refused as stale
intel.** That commit removed the mirror's pre-judging stale check and
deleted `local reportVersion = ...` with it, while the payload four lines
down still said `targetVillageVersion = reportVersion`. Undefined Luau
global → nil → key absent from payload → world server reads NaN → report
lookup matches no row → `intelIsCurrent` false, forever, for everyone.
Raw HTTP with a real version worked, which is what isolated it. Fixed by
reinstating the local; gated by a new rules-check pinning the definition
to the payload's use (46 rules now). **Re-verified live post-fix:** banner
tap 1 opened a contested battle at Saltmarsh Freehold (139 units on the
field, real defenders), tap 2 took the field, on-foot walk + Victory —
the whole loop through the real client UI with no HTTP crutch. This also
retires the earlier "walkover" doubt: the contested battle rendered and
resolved correctly.

Also worth knowing: dev worlds auto-resolve unattended battles in 25s
(`start-dev.ps1`), which is too tight to attend by hand through remote
screenshots; verification ran the same world with
`KINGSAGE_AUTO_RESOLVE_MS=180000`.

## Gates (run 2026-08-29, tip `c6a6a5c`)

- `npm run test:server` — **94/94** (was 89; +5 new: parity, cap, deadline,
  determinism ×2)
- `npm run check:types` — clean
- `npm run test:luau` — 26 files compile, **45 rules**, 7 sim checks, 0
  failed

## How to run

```bash
npm run test:server && npm run check:types && npm run test:luau
powershell -ExecutionPolicy Bypass -File roblox\start-dev.ps1 -Fresh -Play
```

Then in Studio: march on a neighbour, tap the battle banner twice, and the
field is a place.

## Open doubts

- None blocking. The gates are green (server 94/94, types clean, luau 46
  rules + 7 sim checks after the fix), and both an empty-garrison and a
  contested battle have been played through live.
