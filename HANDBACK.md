# HANDBACK — Week 2.1 battlefield dressing + squad banners

Branch: `feat/battlefield-banners-boxie` (from `main` at `373b3ff`). Never committed to `main`.

## Built

- **Battlefield ground language** in the existing client `BattleScene` (the grey-box field already existed). The single bare grass slab is replaced by a counted spec of anchored parts:
  - cobble road down the field toward the defender gate (−Z), with shoulders and wear
  - WorldStyle grass plate
  - shoulder / edge dirt
  - 6 trees and 12 rocks, all on the field **edges** (not in the fight corridor)
- **Squad banners:** Vanguard / Archers / Riders each get one banner, squad tint on the cloth, **3 parts** (pole, cloth, finial). Always 3 banners even if a squad has no bodies.
- **Shared spec** `roblox/src/shared/BattlefieldDressing.luau` — pure Luau, no Roblox APIs — so Lune can count parts the same way `Config.groundTiles` proves the region floor.
- **WarTable-style gates:**
  - construction asserts + `VisualPartBudget` / `VisualPartCount` on `FieldDressing` and `SquadBanners`
  - 14 new checks in `roblox/scripts/rules-check.luau`
  - evidence-run requires the shared module (BattleScene is client-only; a server script cannot see those parts)

## Not built (out of scope — 2.2+)

- Commander spawn on the field / attend-on-foot
- Overhead-default / RALLY / 5-order cap / deadline +3 min
- Horses, paddock, villagers, market row
- Server, `packages/game-core`, AI tick, test-debt, `roblox-luau-contract.test.ts`

## Part counts (analytic, from the spec Lune actually runs)

| Bucket | Count | Ceiling |
|---|---:|---:|
| Field dressing | **61** | 120 |
| Squad banners | **9** (3×3) | 9 |
| Combined | **70** | 129 |

All specs: `className = Part`, `anchored = true`, `canCollide = false`. Zero Script / LocalScript / Humanoid.

Breakdown: grass 15, road 11, dirt 5, tree 18 (6 trunks), rock 12.

## Deviations

- Banners **follow** the first living attacker soldier of that squad via the existing `BulkMoveTo` tick — not a Script on the instance. If that squad has no living body, the banner stays at its attacker-baseline home. This is the honest reading of "each squad carries one banner" without adding scripts.
- WorldStyle palette RGB is **copied as number triples** into the shared spec so Lune can run it. A rules-check lock fails if WorldStyle or the dressing module drops those numbers.
- Did **not** add evidence-run walks of `workspace.BattleScene`. That folder is created on the client and does not exist for the server evidence script. The shared spec is the analytic stand-in.

## Tests run

- `npm run test:luau` — **PASS**. 24/24 files compile; 35/35 rules (21 existing + 14 new). Lune 0.10.5 installed for this run (`~/.local/bin/lune`); it was not on the image PATH.
- Mutation: a fourth banner part made `squad banners are 3 squads × 3 parts` and `each orderable squad carries a 3-part tinted banner` FAIL (12 parts). Reverted; gate green again.
- `npm run test:server` — **not run** (did not touch `server/`).
- `npm run check:types` — **not run** (did not touch TypeScript).
- No Studio play. No phone measure. Visual read of the dressed field is **unverified** in a live client.

## How to run

```bash
# from repo root; needs `lune` on PATH
npm run test:luau
```

In Studio: existing attend-battle path. The field should show cobble + edge trees/rocks and three tinted banners. Rojo maps `src/shared/BattlefieldDressing.luau` into `ReplicatedStorage.WorldShared` automatically.

## Open doubts

- Slice 0 (200-soldier drill on Adam's real phone) has still never run. This slice adds 70 parts on top of the existing soldier budget; the adaptive soldier cull is unchanged.
- Banner follow tracks one soldier, so it can hop when that body falls. A centroid would be smoother; not done because it is not required for the budget or the read.
- 61 dressing parts is a handful, not a dense landscape. There is room under 120 if a live look says the field is still too bare.
- I have not seen this in Studio. The code path is real (BattleScene already built the grey field); the movie is not a stub. Live placement taste is Claude/Adam.
