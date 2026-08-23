# 03 — Current Visual System

**Critical caveat: this entire system is ONE DAY OLD.** It was created on
2026-08-23. Before that the project had no lighting configuration and every
surface was `Enum.Material.Concrete` in one of three greys. Judge it as a first
pass.

All of it lives in one file so it cannot drift building by building:
`roblox/src/server/WorldStyle.luau`.

## Palette — CURRENTLY IMPLEMENTED, deliberate

Verbatim from source:

```lua
WorldStyle.PALETTE = {
	-- Structure
	stone        = Color3.fromRGB(168, 160, 146),
	stoneDark    = Color3.fromRGB(122, 116, 106),
	stoneWarm    = Color3.fromRGB(186, 172, 148),
	plaster      = Color3.fromRGB(216, 206, 184),
	timber       = Color3.fromRGB(92, 66, 44),
	timberLight  = Color3.fromRGB(126, 92, 60),
	-- Roofs
	roofTile     = Color3.fromRGB(122, 62, 48),
	roofSlate    = Color3.fromRGB(78, 80, 88),
	thatch       = Color3.fromRGB(178, 148, 88),
	-- Ground and detail
	grass        = Color3.fromRGB(104, 130, 74),
	dirt         = Color3.fromRGB(126, 104, 78),
	road         = Color3.fromRGB(146, 134, 112),
	iron         = Color3.fromRGB(74, 74, 78),
	banner       = Color3.fromRGB(150, 44, 44),
	window       = Color3.fromRGB(58, 48, 40),}
```

**Assessment (labelled as opinion, not fact):** the palette is deliberate and
narrow, which is the right instinct. It has never been evaluated against a
reference.

## Materials — CURRENTLY IMPLEMENTED, deliberate

```lua
WorldStyle.MATERIAL = {
	stone   = Enum.Material.Cobblestone,
	block   = Enum.Material.Brick,
	plaster = Enum.Material.Sandstone,
	timber  = Enum.Material.WoodPlanks,
	roof    = Enum.Material.Slate,
	thatch  = Enum.Material.Grass,
	road    = Enum.Material.Ground,
	grass   = Enum.Material.Grass,
	iron    = Enum.Material.Metal,
	cloth   = Enum.Material.Fabric,
	glass   = Enum.Material.Glass,}
```

Every material is a **Roblox built-in**. No custom textures, no
`SurfaceAppearance`, no PBR maps, no uploaded images.

## Lighting — CURRENTLY IMPLEMENTED, deliberate

`Lighting.Technology = Future` is set as a **place property** in
`roblox/default.project.json` and `roblox/demo.project.json`. It cannot be set
from a script; attempting to do so previously crashed the entire server.

Script-set values, verbatim:

```lua
	Lighting.Ambient = Color3.fromRGB(88, 84, 96)
	Lighting.OutdoorAmbient = Color3.fromRGB(112, 116, 132)
	Lighting.Brightness = 2.6
	Lighting.ClockTime = 15.6 -- mid-afternoon: shadows long enough to read depth
	Lighting.GeographicLatitude = 24
	Lighting.ExposureCompensation = 0.18
	Lighting.EnvironmentDiffuseScale = 0.55
	Lighting.EnvironmentSpecularScale = 0.35
	Lighting.GlobalShadows = true
	Lighting.ShadowSoftness = 0.35
	Lighting.FogEnd = 100000 -- Atmosphere handles distance instead
```

Post-processing and atmosphere created at runtime: `Atmosphere` (Density 0.34,
Haze 1.6), `Sky` (SunAngularSize 12), `BloomEffect` (Intensity 0.5),
`ColorCorrectionEffect` (Contrast 0.16, Saturation 0.12, warm tint),
`SunRaysEffect` (Intensity 0.06).

## Terrain materials

**None.** Roblox Terrain is not used. Ground is `Part`s with `Enum.Material.Grass`.

## Building proportions — CURRENTLY IMPLEMENTED, deliberate

Every dimension is expressed against the Roblox character (~5 studs):

| Element | Studs | Characters |
|---|---|---|
| Doorway | 9 | 1.8 |
| Cottage wall | 12 | 2.4 |
| Barracks wall | 15 | 3.0 |
| Curtain wall | 15 | 3.0 |
| Corner tower | 25 | 5.0 |
| Keep | 34 | 6.8 |
| Settlement across | 400 | 80 |

Verbatim spec table:

```lua
local SPEC: { [string]: BuildingSpec } = {
	hq        = spec(38, 38, 34, 14, PALETTE.stone,       MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, true),
	academy   = spec(34, 34, 26, 12, PALETTE.stoneWarm,   MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, false),
	barracks  = spec(64, 28, 15,  9, PALETTE.stoneDark,   MATERIAL.block,   PALETTE.roofTile,  MATERIAL.roof,   true,  true),
	stable    = spec(58, 26, 13,  8, PALETTE.timberLight, MATERIAL.timber,  PALETTE.thatch,    MATERIAL.thatch, true,  false),
	workshop  = spec(44, 32, 15,  9, PALETTE.stoneDark,   MATERIAL.block,   PALETTE.roofTile,  MATERIAL.roof,   true,  false),
	smithy    = spec(32, 28, 14,  8, PALETTE.stoneDark,   MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, true),
	warehouse = spec(48, 36, 18, 10, PALETTE.plaster,     MATERIAL.plaster, PALETTE.roofTile,  MATERIAL.roof,   true,  false),
	market    = spec(44, 36, 13,  8, PALETTE.plaster,     MATERIAL.plaster, PALETTE.roofTile,  MATERIAL.roof,   true,  false),
	farm      = spec(54, 38, 12,  8, PALETTE.plaster,     MATERIAL.plaster, PALETTE.thatch,    MATERIAL.thatch, true,  true),
	timber    = spec(48, 30, 12,  8, PALETTE.timberLight, MATERIAL.timber,  PALETTE.thatch,    MATERIAL.thatch, false, false),
	quarry    = spec(44, 30, 11,  7, PALETTE.stone,       MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, false),
	iron      = spec(44, 30, 11,  7, PALETTE.stoneDark,   MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, true),
	wall      = spec(34, 24, 13,  8, PALETTE.stone,       MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, false),
}
```

## Shape language — CURRENTLY IMPLEMENTED

- **Walls:** four sides, 1.5 studs thick, with a floor. Buildings are hollow.
- **Doors:** there are none. The front wall is two piers under a lintel, leaving
  a doorless opening. This is a **LOCKED** instruction from Adam.
- **Roofs:** two `WedgePart` slopes with a 6-stud overhang plus a timber ridge
  beam. Slate for stone buildings, tile for brick, thatch (grass material) for
  farm/stable/timber.
- **Windows:** `Enum.Material.Glass` panes with 0.15 reflectance, 1–5 per face,
  spaced by building width.
- **Timber framing:** corner posts and a mid rail on types flagged `timbered`.
- **Chimneys:** on hq, barracks, smithy, farm, iron.

## Roads and paths — CURRENTLY IMPLEMENTED

Two `Part` strips, `Enum.Material.Ground`, 18 studs wide, crossing at the centre.
No junctions, no kerbs, no variation. **GREY-BOX.**

## Foliage — GREY-BOX

Trees only. Trunk + three stacked boxes. No grass detail, no bushes, no rocks,
no flowers, no variation in species.

## Props and signage

`NOT BUILT`. One gate banner exists. No signage of any kind.

## Typography — FUNCTIONAL BUT PLACEHOLDER

| Use | Font | Size |
|---|---|---|
| Building labels | `Enum.Font.Merriweather` | 13 |
| UI panels | `Enum.Font.GothamBold` and Roblox defaults | mixed / `TextScaled` |

**There is no type system.** Sizes are chosen per call site. This is the single
most obviously placeholder part of the visual system.

## Icons — FUNCTIONAL BUT PLACEHOLDER

Unicode glyphs only. No image assets.

## UI colours, buttons, panels — FUNCTIONAL BUT PLACEHOLDER

Hard-coded `Color3.fromRGB` values inline at each call site in
`init.client.luau`. Examples: panel `(15,15,22)` at 0.15 transparency, tab
active `(55,65,90)`, tab inactive `(28,28,36)`, upgrade button `(50,70,50)`,
recruit row `(40,30,30)`.

**There is no theme file, no token set, and no shared UI style.** This is
inconsistent by construction and should be treated as placeholder throughout.

## Animations

**None.** No `Animation` objects, no tweens on world geometry. UI has no motion.

## VFX

Only the conquest celebration (`Celebration.luau`). **Never observed running.**

## Audio identity

**None. `NOT BUILT`.**

---

## Summary of which choices are what

| Area | Verdict |
|---|---|
| Palette, materials, lighting, atmosphere | **Deliberate**, one day old, unevaluated |
| Building proportions | **Deliberate**, explicitly derived from character scale |
| Shape language (walls/roofs/doorways) | **Deliberate** |
| Roads, foliage, terrain | **Placeholder / grey-box** |
| Typography | **Placeholder, inconsistent** |
| Icons | **Placeholder** (Unicode) |
| UI colour and layout | **Placeholder, inconsistent, no tokens** |
| Animation, VFX, audio | **Not built** |
