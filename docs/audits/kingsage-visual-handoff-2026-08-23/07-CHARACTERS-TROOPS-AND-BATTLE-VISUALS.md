# 07 — Characters, Troops and Battle Visuals

## Player avatar — FUNCTIONAL BUT PLACEHOLDER

The **default Roblox avatar, entirely untouched.** No armour, no tabard, no
costume, no team colour, no scaling. A player appears in whatever their Roblox
account wears.

**This is a significant visual-identity issue for a medieval game** and has
never been addressed.

## NPCs — NOT BUILT

There are none. Villagers were briefly added on 2026-08-23 and removed the same
day at Adam's instruction: *"I never said anything about villagers."*

## Troop types — 11, data only

Defined in `packages/game-core/src/combat.ts`. **They have no world
representation outside the battle scene.** You cannot see your garrison standing
in your settlement.

| Id | Display name | Class |
|---|---|---|
| `militia` | Farmer's Militia | infantry |
| `spear` | Squire | infantry |
| `sword` | Templar | infantry |
| `axe` | Berserker | infantry |
| `archer` | Long-bow | archer |
| `scout` | Spy | cavalry |
| `lightCavalry` | Crusader | cavalry |
| `heavyCavalry` | Black Knight | cavalry |
| `ram` | Battering Ram | infantry |
| `trebuchet` | Trebuchet | infantry |
| `noble` | Count | infantry |

⚠️ **These display names are taken from the original KingsAge.** See
`09-ASSET-PIPELINE-AND-PROVENANCE.md`.

## Battle soldier model — EXPERIMENTAL / GREY-BOX

Source: `roblox/src/client/BattleScene.luau`, `roblox/src/shared/BattleConfig.luau`.

| Property | Value |
|---|---|
| Parts per soldier | **6** |
| Rig | **None.** No Humanoid, no `Motor6D`, no joints |
| Animation | **None.** Per-frame CFrame movement |
| Movement | `workspace:BulkMoveTo` — one call per frame for all soldiers |
| Walk speed | 7 studs/sec |
| Engage distance | 5 studs |
| Swing period | 0.4 s |
| Fall duration | 1.2 s |
| Rout speed | 12 studs/sec |

## Squad organisation — CURRENTLY IMPLEMENTED

Three squads which **are** the three combat classes:

| Squad | Contains | Colour |
|---|---|---|
| Vanguard | militia, spear, sword, axe, ram, trebuchet, noble | `(150,60,55)` red |
| Archers | archer | `(150,120,55)` amber |
| Riders | scout, lightCavalry, heavyCavalry | `(120,70,140)` purple |

Blocks per squad: 3. Minimum soldiers per block: 6. Field depth between start
lines: 90 studs.

## Friendly / enemy identification

By **squad colour** for your own troops. The defender's colour treatment is
**UNKNOWN without visual verification**.

## Distance-based simplification — CURRENTLY IMPLEMENTED

Adaptive culling: starts at `MAX_SOLDIERS = 200`, samples its own frame time
over a 2-second window, and culls in steps of 20 until it holds
`TARGET_FPS = 30`, with a floor of `MIN_SOLDIERS = 40`.

**This is safe only because rendering decides nothing** — the server has already
determined casualties. A culled soldier is a soldier you cannot see, not a
soldier who did not fight.

## Morale, surrender, casualty presentation

| Element | Status |
|---|---|
| Casualties | Soldiers fall over 1.2 s. **No gore.** |
| Rout | Losers flee at 12 studs/sec |
| Morale feedback | **NOT BUILT** as a visual |
| Surrender feedback | **NOT BUILT** as a visual — resolves server-side only |

## Battle camera — CURRENTLY IMPLEMENTED

`CameraType.Scriptable`, overhead, centred `FIELD_DEPTH/2 + 12` studs beyond the
defender's wall.

## Replay — CURRENTLY IMPLEMENTED

Any battle can be replayed from its seed. Live and replay share the same code
path, which is why they cannot diverge.

## Conquest celebration — CURRENTLY IMPLEMENTED, NEVER OBSERVED

`Celebration.luau`: banner, 12 firework shells at 0.45 s intervals, 16 sparks
each, 36 coins, 8-second duration, hard cap of 260 parts, Skip button. Bursts
around **the player**, not the conquered settlement, because settlements are
thousands of studs apart.

**Nobody has ever seen it run.**

## The 200-troop experiment

`roblox/spike/` — **EXPERIMENTAL**. Drill C5, the phone measurement, has
**never been run**. `MAX_SOLDIERS = 200` is a starting guess, not a measurement.
See `10-MOBILE-READABILITY-AND-PERFORMANCE.md`.
