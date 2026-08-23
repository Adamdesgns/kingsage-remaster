# 05 — Buildings and Interiors

**No screenshots exist.** Every statement below is read from
`roblox/src/server/SettlementBuilder.luau` at commit `3c88874`.

## How a building is constructed (all 13 share this)

1. **Floor** — stone slab, 1 stud thick.
2. **Three solid walls** — back, left, right; 1.5 studs thick.
3. **Front wall as two piers** either side of an 8-stud gap, with a lintel above
   9 studs. **The doorway is the absence of parts** — Roblox parts cannot have
   holes. This is a LOCKED instruction: *"do not give me doors to open. Leave it
   a doorless entry way."*
4. **Doorstep** outside the opening.
5. **Pitched roof** — two `WedgePart` slopes, 6-stud overhang, timber ridge beam.
6. **Windows** — 1–5 glass panes per long face at 60% wall height.
7. **Timber framing** (some types) — corner posts and a mid rail.
8. **Chimney** (some types).
9. **Outbuildings** — one per 4 levels, max 4, ringed around the main structure.
10. **Label** — 120×20 billboard, fades at 130 studs.
11. **ProximityPrompt** — "Upgrade", 22-stud reach.

## Per-building table

| Building | Footprint (studs) | Wall h | Roof | Material | Roof material | Timbered | Chimney |
|---|---|---|---|---|---|---|---|
| Headquarters | 38 × 38 | 34 | 14 | Cobblestone | Slate | no | yes |
| Academy | 34 × 34 | 26 | 12 | Cobblestone (warm) | Slate | no | no |
| Barracks | 64 × 28 | 15 | 9 | Brick | Slate (tile colour) | yes | yes |
| Stable | 58 × 26 | 13 | 8 | WoodPlanks | Grass (thatch) | yes | no |
| Workshop | 44 × 32 | 15 | 9 | Brick | Slate | yes | no |
| Smithy | 32 × 28 | 14 | 8 | Cobblestone | Slate | no | yes |
| Warehouse | 48 × 36 | 18 | 10 | Sandstone | Slate | yes | no |
| Market | 44 × 36 | 13 | 8 | Sandstone | Slate | yes | no |
| Farm | 54 × 38 | 12 | 8 | Sandstone | Grass (thatch) | yes | yes |
| Timber Camp | 48 × 30 | 12 | 8 | WoodPlanks | Grass (thatch) | no | no |
| Stone Quarry | 44 × 30 | 11 | 7 | Cobblestone | Slate | no | no |
| Iron Mine | 44 × 30 | 11 | 7 | Cobblestone | Slate | no | yes |
| Rampart plot | 34 × 24 | 13 | 8 | Cobblestone | Slate | no | no |

## Construction-level variation — CURRENTLY IMPLEMENTED

- Footprint scales by `1 + min(level, 20) × 0.010` — a level-20 building is 20%
  wider than a level-1 one.
- Outbuildings: `floor(level / 4)`, capped at 4.
- **Height does NOT change with level.** This is a deliberate reversal:
  previously height was `6 + 2 × level`, which made a level-30 Farm a 66-stud
  tower. Adam: *"that's retarded to build them tall."*
- An unbuilt plot (level 0) renders as a dirt rectangle with four corner stakes
  and a label reading "— empty plot".

## Interiors

**`NOT BUILT`.** Buildings are hollow and enterable, and there is **nothing
inside any of them**: no furniture, no props, no NPC, no interior light source,
no functional interaction that requires entering. The ProximityPrompt is on the
exterior.

The keep is the most serious case: the design says *"the keep contains a war
table"*, and the war table is placed by `WarTable.luau`, but whether it is
actually inside the keep model is **UNKNOWN** without visual verification.

## How a player recognises a building's purpose

| Cue | Present? |
|---|---|
| Floating label with name and level | **Yes** — fades at 130 studs |
| Distinct silhouette | **Partially** — footprint and height differ; the Barracks (64×28) and Stable (58×26) are both long low halls and will be hard to tell apart |
| Distinct material | **Partially** — 4 wall materials across 13 buildings, so buildings share looks in groups |
| Distinct roof | **Partially** — 2 roof materials (slate, thatch) |
| Icon | **No** — Unicode icons exist in data but are not rendered in the world |
| Signage | **No** |
| Functional props (anvil, cart, sacks) | **No** |

**Assessment (opinion, flagged as such):** without labels, a player probably
cannot identify most buildings. The label is doing nearly all the work, which is
the opposite of the stated intent that *"every important building is a real
place"*.

## Phone readability

**UNKNOWN.** Never tested on a device.

## Known problems

1. Interiors are empty — no reason to walk in.
2. Buildings within a material group look interchangeable.
3. No props, so nothing communicates function.
4. Whether the war table is inside the keep is unverified.
