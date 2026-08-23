# KingsAge visual redesign — 2026-08-23

This package records the visual target and the source changes that implement it.
The three target images are direction-setting renders based on live Roblox Studio
screenshots; they are not screenshots of shipped code.

## Approved direction

KingsAge should read as a **fortified working settlement**, not a field of level-
scaled blocks. The playable world keeps its gate-to-keep axis and authoritative
gameplay, while the visual layer uses:

- correctly sloped, modular roofs with human-scale windows and timber framing;
- compact streets, courtyards and job-specific yards instead of unused grass;
- a landmark keep and gate with restrained red-and-gold heraldry and warm light;
- one readable physical campaign table inside the keep;
- an asset-free playable commander in practical 12th-14th century wool, mail and
  leather details, with modern catalogue clothing and accessories removed;
- a slim resource strip and an idle queue pill that leave the world visible;
- native Roblox prompts for keyboard, gamepad and touch compatibility.

## Design targets

- `design-targets/01-settlement-overview-target.png`
- `design-targets/02-gameplay-hud-target.png`
- `design-targets/03-war-table-target.png`

The implementation intentionally stays simpler than the renders. Geometry must be
deterministic, streamable, performant on a real phone, and buildable from Roblox
parts and modest meshes. The target is the hierarchy, silhouettes, density,
materials and UI footprint—not photorealism or one-for-one prop density.

## Before evidence

`before/` contains seven 2550×1223 captures from the live Studio build before the
redesign. They cover the player-scale main street, settlement overview, keep,
economy district, gate and war room.

## Per-player settlement fog

Every village keeps one fixed, fog-safe shell in Workspace. Detailed geometry,
level attributes and prompts remain in a server-only `ServerStorage` source. When
the source changes, the server clones it only into the owner's private
`PlayerGui`; that owner then clones it locally into Workspace and hides the paired
shell. Foreign clients never receive the detailed model, rather than merely
making a replicated copy transparent.

The locally reconstructed prompts call the existing `QueueCommand` path, where
both the Roblox server and world server still validate ownership. The war-table
prompt opens the same local table view. A transparent, level-free Workspace spawn
anchor remains because Roblox `RespawnLocation` must reference Workspace; it
contains only the already-public village id and gate position.

## Verification status

- `npm run test:luau`: **PASS** — 24/24 Luau files compile and 21/21 shared
  behaviour rules pass.
- `npm run check:types`: **PASS** for the existing `packages/game-core/src`
  coverage. The command continues to note that `server/src` is not included
  because the repo does not have `@types/node` installed.
- `npm run test:server`: **80/81 PASS**. The sole failure is the existing
  end-to-end Luau conquest fixture in `roblox-luau-contract.test.ts`; it also
  fails when run alone. This redesign changes neither `server/` nor
  `roblox/src/shared/Buildings.luau`, the files exercised by that fixture.
- `git diff --check`: **PASS**.
- Roblox Studio proof is still pending. Studio opened to a `Login Failed`
  dialog on 2026-08-23, so no after image is represented as verified yet.

## Acceptance

The pass is only visually accepted when the updated build has matching-angle after
captures for the main street, elevated settlement, gate and war room. Code checks
must pass first. The same pass must inspect the commander costume on both R6 and R15
for a clear face and normal movement, animations, scale and camera. A real-phone
join/walk/prompt/table check and the existing 200-troop performance drill remain
separate gates; desktop screenshots cannot replace them.
The fog layer also needs a two-client Studio/private-server check: the owner sees
detail and working prompts, while the visitor sees only the shell and can walk it
without invisible collisions or prompt flashes.
