# HANDBACK — Slice 3: "The herd"

Branch: `feat/slice3-the-herd` (stacked on `feat/slice2-rally` on
`feat/slice1-field-is-a-place`). Never committed to `main`. Written
2026-08-29, same overnight session, Adam's standing word. Plan:
`docs/superpowers/plans/2026-08-29-slice3-the-herd.md`. Slices 1 and 2
have their own handbacks in their branches' history.

## Built

- **`PaddockSpec.luau`** (shared, pure, Lune-audited — the
  BattlefieldDressing discipline): a horse is exactly TEN anchored parts
  (barrel, chest, hindquarters, raked neck, head, muzzle, two leg slabs,
  tail, mane), coats from a four-entry bay/chestnut palette cycled by
  index — no randomness anywhere in the module (rules-check greps for
  `math.random`). `displayCount = ceil(herd/12)` clamped 0..8: **zero
  shows zero** (the red team's exact fix), eleven real horses never read
  as an empty paddock, garbage in ⇒ empty paddock out.
- **`Paddock.luau`** (client, the BattleScene pattern): the owner's
  client draws its own herd from its own snapshot — nothing replicates,
  foreign settlements stay fog shells by construction, a phone pays only
  for what its player owns. One `BulkMoveTo` per frame moves the whole
  herd; deterministic per-index waypoint triangles inside the stable's
  existing paddock strip; grazing pauses; tail flick; everything parked
  beyond 120 studs (the villager LOD rule, applied a slice early).
  Rebuilds only when the DISPLAYED count or village changes — a herd of
  72 and a herd of 80 are both six horses, and six horses do not blink.
- Rules-check grew to **55**: budget (8 × 10 = exactly 80 ≤ BUDGET,
  mutation-checked — an 11th part fails the gate), the display-count
  table from the design row, waypoint bounds for all eight indexes,
  determinism grep, and renderer-only-draws-what-the-spec-counts.

## Verified live in Studio (2026-08-29, human eyes)

Stable Level 14, herd 72/72 ⇒ six horses on the grass between the
building face and the existing rails, alongside the trough and hay bale.
Two fixed-camera frames seconds apart show changed poses/positions —
they amble, they do not teleport, and they stay inside the rails. One
polish iteration was made after the first look: coats brightened ~40
points (the first palette read as one black mass in the stable's shade)
and grazing slots widened to 8-stud spacing (a horse is ~9 studs long;
7-stud slots overlapped into a blob).

## Not built (deliberate — deferred by the red-team table)

- Conversion ceremony, mounted battle silhouettes (await the cavalry
  balance check), chickens, day/night.

## Gates (run 2026-08-29, branch tip)

- `npm run test:server` — 97/97 (unchanged; this slice is client+shared)
- `npm run check:types` — clean
- `npm run test:luau` — 26 files, **55 rules**, 7 sim checks, 0 failed

## How to run

```bash
npm run test:luau
powershell -ExecutionPolicy Bypass -File roblox\start-dev.ps1 -Fresh -Play
```

Walk past the Stable. If the panel says HORSES 0, the grass is empty —
that is the feature working, not failing.

## Open doubts

- The horses live in the stable's roof shadow at most times of day; the
  brightened coats read, but Adam may want them a shade lighter still, or
  the paddock strip nudged out of the shadow line. 30-second morning look.
- Herd display changes only on displayed-count boundaries (by design). If
  Adam recruits 12 cavalry in one sitting he will see one horse walk off
  the grass at most — the "herd visibly thins" promise holds at the dozen
  scale, not per animal.
