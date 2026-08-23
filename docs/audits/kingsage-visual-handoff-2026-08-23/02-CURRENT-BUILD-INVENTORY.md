# 02 — Current Build Inventory

Derived by reading source. **Nothing here was verified by looking at the game.**

## Places

| Name | Project file | Built to | Status |
|---|---|---|---|
| WorldGameDev | `roblox/default.project.json` | `roblox/WorldGame-dev.rbxlx` | **CURRENTLY IMPLEMENTED** — the playable place |
| WorldGameDemo | `roblox/demo.project.json` | `roblox/WorldGame-demo.rbxlx` | **CURRENTLY IMPLEMENTED** — identical plus `DemoTour`, a self-driving tour that steers the character with `Humanoid:MoveTo`. Not playable by hand. |
| TroopSpike | `roblox/spike.project.json` | `roblox/TroopSpike.rbxlx` | **EXPERIMENTAL** — the 200-troop performance spike |

**Neither place has ever been published to Roblox.** There is no experience ID.

## Settlements — CURRENTLY IMPLEMENTED

10 per world, generated deterministically from a seed:

| Kind | Count | Garrison at seed | Notes |
|---|---|---|---|
| Player-seat capitals | 6 | empty in production | `seat_kind = 'ai'` until claimed |
| Freeholds | 4 | 10 Squires, no wall | abandoned settlements; the designed first conquest |

Rendered two ways:
- **Full render** — your own settlement: walls, towers, gatehouse, streets, all
  13 building plots, war table.
- **Shell render** — any foreign settlement: wall ring, a single keep massing
  block, a banner post, a name label. Deliberately leaks no levels (fog of war).

## Buildings — 13 types, all CURRENTLY IMPLEMENTED as GREY-BOX+

Every building is generated at runtime from primitives. There are **no meshes**.

`DataModel` path: `Workspace/Settlements/Settlement_<villageId>/B_<building>`
Source: `roblox/src/server/SettlementBuilder.luau`

| Building | Interaction | Status |
|---|---|---|
| Headquarters (`hq`) | Upgrade prompt | **GREY-BOX** |
| Timber Camp (`timber`) | Upgrade prompt | **GREY-BOX** |
| Stone Quarry (`quarry`) | Upgrade prompt | **GREY-BOX** |
| Iron Mine (`iron`) | Upgrade prompt | **GREY-BOX** |
| Farm (`farm`) | Upgrade prompt | **GREY-BOX** |
| Warehouse (`warehouse`) | Upgrade prompt | **GREY-BOX** |
| Barracks (`barracks`) | Upgrade + Recruit prompts | **GREY-BOX** |
| Rampart (`wall`) | Upgrade prompt | **GREY-BOX** |
| Smithy (`smithy`) | Upgrade prompt | **GREY-BOX** |
| Stable (`stable`) | Upgrade prompt | **GREY-BOX** |
| Workshop (`workshop`) | Upgrade prompt | **GREY-BOX** |
| Academy (`academy`) | Upgrade prompt | **GREY-BOX** |
| Market (`market`) | Upgrade prompt | **GREY-BOX** — building exists; trade does not |

## Interiors — CURRENTLY IMPLEMENTED, EMPTY

As of commit `3c88874`, buildings are **hollow shells you can walk into**: four
walls, a floor, and a doorway made from two piers under a lintel (Roblox parts
cannot have holes, so the opening is the absence of parts).

**There is nothing inside any of them.** No furniture, no props, no NPC, no
interior lighting, no reason to enter. `NOT BUILT`.

## Roads, walls, gate — CURRENTLY IMPLEMENTED

| Element | Detail |
|---|---|
| Main street | 18 studs wide, runs the depth of the settlement |
| Cross street | 18 studs wide |
| Curtain wall | 15 studs high, 5 thick, crenellated (merlons every 9 studs) |
| Corner towers | 4, cylindrical, 16 wide × 25 tall, ball roof cap |
| Gatehouse | 2 towers + arch above head height; 22-stud opening; banner; two timber gate posts |
| Gate spawn | `SpawnLocation`, 10×10, invisible, inside the gate |

## Terrain and wilderness — CURRENTLY IMPLEMENTED

- **No Roblox Terrain is used anywhere.** The ground is Parts.
- Region floor: tiled `Part`s (`RegionGround1..N`), grass material, sized under
  Roblox's 2,048-stud part limit.
- Trees: ~1,850, each a trunk plus three stacked canopy boxes, height varied
  deterministically. **GREY-BOX.**

## Props

`NOT BUILT`. There are no barrels, carts, fences, crates, market stalls,
torches, banners on buildings, or any set dressing beyond the gate banner.

## Characters and troops

| Item | Status |
|---|---|
| Player avatar | Default Roblox avatar, untouched. **FUNCTIONAL BUT PLACEHOLDER** |
| NPCs | `NOT BUILT` |
| Battle soldiers | 6 anchored parts each, no Humanoid. **EXPERIMENTAL / GREY-BOX** |
| Villagers | **REMOVED** on Adam's instruction, 2026-08-23 |

## Animation

`NOT BUILT` in the conventional sense. There are no `Animation` or
`AnimationTrack` objects anywhere. Battle motion is per-frame CFrame movement of
anchored parts via `BulkMoveTo`.

## Particle effects

| Effect | Where | Status |
|---|---|---|
| Conquest celebration (fireworks, coin shower) | `roblox/src/client/Celebration.luau` | **CURRENTLY IMPLEMENTED**, client-only, capped at 260 parts. **Never observed running.** |

No other particles exist. No smoke from chimneys, no dust, no weather.

## Sound

`NOT BUILT`. There is **no audio of any kind** in the project — no music, no
ambience, no UI sound, no battle sound.

## Lighting — CURRENTLY IMPLEMENTED (first pass, 2026-08-23)

`roblox/src/server/WorldStyle.luau` plus `Lighting` properties in the two
project files. Before 2026-08-23 there was **no lighting configuration at all**.

## Camera

| Camera | Source | Status |
|---|---|---|
| Default character camera | Roblox default | **CURRENTLY IMPLEMENTED** |
| War-table overhead | `init.client.luau`, `CameraType.Scriptable` | **CURRENTLY IMPLEMENTED** |
| Battle camera | `BattleScene.luau`, `CameraType.Scriptable` | **CURRENTLY IMPLEMENTED** |

## Interface

See `06-UI-UX-INVENTORY.md`.

## Icons

`NOT BUILT` as image assets. The UI uses **Unicode characters** as icons
(e.g. `♜ ♣ ◆ ⬟ ⌁ ▤ ⚔ ▥ ⚒ ♞ ◈ ♛ ◎`) defined in `packages/game-core/src/economy.ts`.
There is not one `ImageLabel` or uploaded decal in the project.

## War-table elements

| Element | Status |
|---|---|
| Physical table object with prompt | **CURRENTLY IMPLEMENTED** |
| Overhead camera swap | **CURRENTLY IMPLEMENTED** |
| Village tab | **CURRENTLY IMPLEMENTED** |
| War tab (scout/attack/reports) | **CURRENTLY IMPLEMENTED** |
| Map tab (world map) | **CURRENTLY IMPLEMENTED** — added 2026-08-23 |

## Battle experiment

`roblox/spike/` — the 200-troop spike. **EXPERIMENTAL.** Its result was never
recorded; `BattleConfig.MAX_SOLDIERS = 200` is a starting guess with adaptive
culling, not a measurement.
