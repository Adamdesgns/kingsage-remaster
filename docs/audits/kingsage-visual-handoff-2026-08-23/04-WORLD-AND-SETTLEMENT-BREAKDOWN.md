# 04 — World and Settlement Breakdown

## Region

| Fact | Value |
|---|---|
| World grid | 50 × 50 tiles |
| Studs per tile | 220 |
| Region span (10 settlements) | ~9,540 × 7,780 studs |
| Settlements | 10 (6 capitals + 4 Freeholds) |
| Minimum separation | 8 tiles = 1,760 studs (enforced in `fixture.ts`) |
| Ground | Tiled `Part`s under Roblox's 2,048-stud part limit |
| Trees | ~1,851 |

**Measured nearest-neighbour distances from one seeded world** (village-1 at
tile 19,33):

| Distance (studs) | Settlement |
|---|---|
| 2,297 | Verdant Pact Hold |
| 2,430 | Saltmarsh Freehold |
| 2,508 | The Ashen Court Hold |
| 3,740 | Warlord Kaas Hold |
| 5,026 – 6,069 | five more |

**Streaming implication — this is a real problem.** `StreamingTargetRadius` is
2,048. The nearest neighbour is 2,297 studs away. **Foreign settlements are
beyond the streaming radius and will not be visible from your own walls.** The
world map tab exists precisely because of this.

## Settlement footprint — CURRENTLY IMPLEMENTED

| Element | Value |
|---|---|
| Wall ring | 400 × 400 studs (`WALL_HALF = 200`) |
| Ground plate | 440 × 440 studs |
| Gate | South face, 22-stud opening |
| Spawn | `WALL_HALF - 16` from centre, just inside the gate |
| Main street | Runs north from the gate to the keep |

## Building layout — verbatim from source

```lua
local LAYOUT: { [string]: Vector3 } = {
	hq = Vector3.new(0, 0, 20),
	market = Vector3.new(-64, 0, 106),
	warehouse = Vector3.new(64, 0, 106),
	barracks = Vector3.new(128, 0, 52),
	stable = Vector3.new(132, 0, -8),
	workshop = Vector3.new(128, 0, -68),
	smithy = Vector3.new(64, 0, -118),
	timber = Vector3.new(-128, 0, 52),
	quarry = Vector3.new(-132, 0, -8),
	iron = Vector3.new(-128, 0, -68),
	farm = Vector3.new(-64, 0, -118),
	academy = Vector3.new(0, 0, -134),
	wall = Vector3.new(-64, 0, 166),
}
```

Read as a compass: the keep (`hq`) sits just north of centre; **military**
(barracks, stable, workshop, smithy) on the **east**; **economy** (timber,
quarry, iron, farm) on the **west**; **civic** (market, warehouse) on the
**south** flanking the gate; **academy** at the **north** edge.

**Assessment (opinion):** this is a symmetric grid, not a designed town. It has
no organic streets, no plaza, no hierarchy of approach, and both sides mirror
each other exactly.

## Walking times — CALCULATED, NOT MEASURED

Default Roblox `WalkSpeed` is 16 studs/second.

| Route | Distance | Time |
|---|---|---|
| Gate → keep | ~185 studs | ~12 s |
| Gate → barracks | ~200 studs | ~13 s |
| Keep → academy | ~155 studs | ~10 s |
| Full width of settlement | 400 studs | ~25 s |

## War table placement

**UNKNOWN from source reading alone.** `WarTable.luau` places it; an auditor
should verify its position visually. It is bound to the capital's settlement
model.

## Landmarks, skyline, sightlines

- **Landmarks:** the keep (34 studs) and academy (26) are the tallest structures;
  corner towers (25) mark the perimeter. That is the entire landmark vocabulary.
- **Skyline:** flat. Everything else is 11–18 studs.
- **Sightlines:** the main street runs gate→keep, which is the one deliberate
  sightline in the settlement.
- **Navigation:** by building label (fades at 130 studs) and by the two streets.
  **There are no signs, no minimap, and no compass.**

## Empty areas

**Substantial.** The wall ring is 400 × 400 = 160,000 sq studs. The 13 building
footprints total roughly 20,000 sq studs. **Approximately 85–88% of the
settlement interior is empty grass.** This is the most likely cause of a
"nothing here" impression.

## Terrain

Flat. No hills, no elevation change, no water, no rock. `Part`-based, not
Roblox Terrain.

## Region exits / settlement-to-region transition

There is **no transition**. You simply walk out of the gate onto the region
floor and keep walking. There is no boundary, no gate-out event, no loading, and
no visual signal that you have left your settlement. **`NOT BUILT`** as a
designed moment.

## Overhead map

An **in-game world map exists** as the war table's Map tab (added 2026-08-23):
all 10 settlements as dots on a gridded 50×50 field, gold for yours, grey for
Freeholds, kingdom colour for others, plus a distance-sorted list.

**A labelled overhead diagram of the settlement itself is `NOT BUILT`**, and
this agent cannot produce one from a screenshot. The `LAYOUT` table above is the
factual substitute; an auditor can plot it directly.
