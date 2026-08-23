# 14 — File and Code Map

Repository: `https://github.com/Adamdesgns/kingsage-remaster`
Branch: `main` · Commit: `3c888746d22ed0dec04149a93c52d4abdd43546e`

**If the repository is accessible to you, read it there rather than relying on
the excerpts in this package.** Only small essential configuration files are
duplicated into `relevant-source/`.

## Visual and world code — the files an art auditor cares about

| Path | Lines | What it decides |
|---|---|---|
| `roblox/src/server/WorldStyle.luau` | ~155 | **Palette, materials, lighting, atmosphere, post-processing.** The single source of visual truth. |
| `roblox/src/server/SettlementBuilder.luau` | ~740 | Every settlement, building, wall, tower, gate, street, tree and the region floor. All geometry is generated here. |
| `roblox/src/shared/Config.luau` | ~78 | `WALL_HALF` (settlement size), `TILE_STUDS`, `MAX_PART_STUDS`, `groundTiles()`, celebration caps |
| `roblox/src/client/init.client.luau` | ~1,150 | All HUD and war-table UI, the overhead camera, every colour and font in the interface |
| `roblox/src/client/BattleScene.luau` | ~430 | Battle rendering, soldier bodies, squads, battle camera |
| `roblox/src/client/Celebration.luau` | ~200 | Conquest fireworks and coin shower |
| `roblox/src/shared/BattleConfig.luau` | ~70 | Soldier budget, squad definitions, field geometry |
| `roblox/src/shared/Buildings.luau` | ~120 | Building and troop display names, recruit presets, attack-plan axes |
| `roblox/src/server/WarTable.luau` | — | Places the war-table object |
| `roblox/src/server/WorldSession.luau` | — | Session lifecycle, snapshot delivery |
| `roblox/src/server/CommandService.luau` | — | Player commands to the world server |
| `roblox/src/server/init.server.luau` | ~30 | Server entry point; applies styling under `pcall` |

## Rojo project files

| Path | Builds | Notes |
|---|---|---|
| `roblox/default.project.json` | `WorldGame-dev.rbxlx` | **The playable place.** Contains `Lighting` and `Workspace` streaming properties. |
| `roblox/demo.project.json` | `WorldGame-demo.rbxlx` | Adds `DemoTour` — self-driving, steers the character |
| `roblox/spike.project.json` | `TroopSpike.rbxlx` | 200-troop experiment |

## Gates (how visual regressions are caught)

| Path | What it checks |
|---|---|
| `roblox/scripts/syntax-check.luau` | Compiles all 23 Luau files with the real compiler |
| `roblox/scripts/rules-check.luau` | **21 executable rules**, including: no ground tile exceeds Roblox's part limit; tiles cover the region with no gap; nothing writes `Lighting.Technology` from a script; the server entry point guards its styling |
| `server/test/roster-parity.test.ts` | Client troop list matches the server's; every troop is in exactly one battle squad |

## Simulation code (context, not visual)

| Path | What it decides |
|---|---|
| `packages/game-core/src/combat.ts` | 11-unit roster, three-class combat, wall, siege, Realm of Power, night bonus |
| `packages/game-core/src/economy.ts` | Buildings, costs, production, settlement points, troop definitions and **UI icon glyphs** |
| `packages/game-core/src/horses.ts` | Breeding and cavalry conversion |
| `packages/game-core/src/fixture.ts` | World generation: settlement placement, Freeholds |
| `server/src/store.ts` | ~2,000 lines. Authoritative world state, snapshots, all commands |

## Design documents worth reading

| Path | Why |
|---|---|
| `docs/design/CANONICAL-BRIEF.md` | The approved brief |
| `docs/superpowers/specs/2026-08-22-combat-and-army-design.md` | The combat spec with CONFIRMED/INFERRED/OURS/SIM tags |
| `docs/design/2026-08-22-economy-and-roles.md` | Horses, trade, professions |
| `docs/design/2026-08-22-what-we-actually-need.md` | What is measured vs assumed |
| `docs/HANDOFF-2026-08-22-kingsmarch.md` | Previous session handoff |

## Deliberately omitted from this package

| Path | Reason |
|---|---|
| `roblox/src/server/SecretConfig.luau` | **Contains the world-server shared secret.** Gitignored. |
| `server/node_modules/` | ~57 MB of dependencies |
| `server/data/*.sqlite` | World databases; contain no secrets but are large and irrelevant to a visual audit |
| `roblox/*.rbxlx` | Built artefacts, regenerable from source with `rojo build` |
| `.clip-site/` | An unrelated nested git repository |
