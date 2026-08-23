# 08 — Lighting, VFX, Animation and Audio

## Lighting — CURRENTLY IMPLEMENTED (first pass, 2026-08-23)

| Setting | Value | Where set |
|---|---|---|
| Technology | `Future` | **Place property** in both `.project.json` files |
| ClockTime | 15.6 (mid-afternoon) | `WorldStyle.luau` |
| GeographicLatitude | 24 | `WorldStyle.luau` |
| Brightness | 2.6 | `WorldStyle.luau` |
| Ambient | `(88,84,96)` | `WorldStyle.luau` |
| OutdoorAmbient | `(112,116,132)` | `WorldStyle.luau` |
| ExposureCompensation | 0.18 | `WorldStyle.luau` |
| GlobalShadows | true | `WorldStyle.luau` |
| ShadowSoftness | 0.35 | `WorldStyle.luau` |
| EnvironmentDiffuseScale | 0.55 | `WorldStyle.luau` |
| EnvironmentSpecularScale | 0.35 | `WorldStyle.luau` |

⚠️ **`Lighting.Technology` must never be set from a script.** A normal script
lacks the `RobloxScript` capability and the assignment throws. On 2026-08-23
this took the entire game down: the styling call sat unguarded at the top of the
server entry point, so when it threw, `WorldSession`, `SettlementBuilder`,
`CommandService` and `WarTable` never loaded. The player spawned at the world
origin over open sky and fell to their death repeatedly. Two gate rules in
`roblox/scripts/rules-check.luau` now prevent regression, and the styling call is
wrapped in `pcall`.

## Day/night — NOT BUILT

`ClockTime` is a fixed constant. There is **no day/night cycle**. The night
combat bonus exists as *game logic* (`isNightBonusActive`) but has **no visual
representation whatsoever** — the sky does not change.

## Atmosphere and post-processing — CURRENTLY IMPLEMENTED

| Effect | Settings |
|---|---|
| `Atmosphere` | Density 0.34, Offset 0.1, Colour `(206,202,190)`, Decay `(122,130,148)`, Glare 0.28, Haze 1.6 |
| `Sky` | SunAngularSize 12, MoonAngularSize 9, StarCount 1200 |
| `BloomEffect` | Intensity 0.5, Size 22, Threshold 1.7 |
| `ColorCorrectionEffect` | Brightness 0.02, Contrast 0.16, Saturation 0.12, warm tint |
| `SunRaysEffect` | Intensity 0.06, Spread 0.9 |

`Sky` uses **Roblox's default skybox textures** — no custom sky has been made.

## Interior lighting — NOT BUILT

There are no `PointLight`, `SpotLight` or `SurfaceLight` objects anywhere.
Building interiors are lit only by what comes through the doorway and windows.

## Torch / fire treatment — NOT BUILT

No torches, braziers, hearths or fire anywhere. Chimneys exist as geometry but
emit no smoke.

## Weather — NOT BUILT

## VFX inventory

| Effect | Status |
|---|---|
| Conquest celebration (fireworks + coin shower) | **CURRENTLY IMPLEMENTED**, never observed |
| Building-completion effect | **NOT BUILT** |
| Recruitment effect | **NOT BUILT** |
| Command-confirmation effect | **NOT BUILT** (text toast only) |
| Battle effects (impacts, dust, blood) | **NOT BUILT** — and blood must never be added (13+, no gore) |
| Loot spectacle | **PARTIAL** — coins in the celebration only |
| Camera effects (shake, tilt) | **NOT BUILT** |

## Animation — NOT BUILT

There is **not one `Animation` or `AnimationTrack` object in the project.**

- Player characters use Roblox's default animation set.
- Battle soldiers are anchored parts moved by CFrame each frame — they slide
  rather than walk.
- No UI motion, no tweens, no easing anywhere.

## Audio — NOT BUILT

**There is no audio of any kind in this project.** No music, no ambience, no UI
sound, no footsteps, no battle sound, no building sound. Not one `Sound` object
exists.

## Final-intent versus temporary

| Element | Verdict |
|---|---|
| Lighting / atmosphere / post-processing values | **First pass, one day old.** Direction is deliberate; specific values are unevaluated. |
| Fixed mid-afternoon time | **Temporary** — a day/night cycle is implied by the night-bonus mechanic |
| Default Roblox skybox | **Temporary** |
| Conquest celebration | **Final-intent in shape** (big, skippable, non-blocking), placeholder in art |
| Everything else | **Not built** |
