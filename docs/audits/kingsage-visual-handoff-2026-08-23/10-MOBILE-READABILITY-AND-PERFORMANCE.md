# 10 — Mobile Readability and Performance

## The honest headline

**No performance measurement of any kind has ever been taken for this project,
on any device, at any time.**

Not on desktop. Not on a phone. Not in Studio. There is no FPS figure, no memory
figure, no frame-time figure, no part count taken from a running session.

Everything in this document is either a **static count derived from source** or
marked `NEVER MEASURED`.

## Required measurements — all missing

| Measurement | Value |
|---|---|
| Test device | **NEVER MEASURED** |
| Device model | **NEVER MEASURED** |
| Graphics setting | **NEVER MEASURED** |
| Resolution | **NEVER MEASURED** |
| Player count | **NEVER MEASURED** |
| Troop count achieved | **NEVER MEASURED** |
| Average FPS | **NEVER MEASURED** |
| Low FPS | **NEVER MEASURED** |
| Memory | **NEVER MEASURED** |
| Client frame time | **NEVER MEASURED** |
| Server frame time | **NEVER MEASURED** |
| Network observations | **NEVER MEASURED** |
| Load time | **NEVER MEASURED** |
| Streaming defects | **NEVER MEASURED** |

**Drill C5 — "the 200-troop phone measurement" — has been written down and owed
since 2026-08-21 and has never been run.** It is the single oldest outstanding
item in the project.

## What IS known: static counts derived from source

These are calculated from the generating code, **not observed in a session**.

### Region (per server)

| Item | Count | Derivation |
|---|---|---|
| Ground tiles | 20 | `Config.groundTiles` over ~9,540 × 7,780 studs |
| Trees | ~1,851 | 9% hit rate over a 60-stud grid |
| Parts per tree | 4 | trunk + 3 canopy tiers |
| **Tree parts total** | **~7,404** | |

### Your own settlement (full render)

| Item | Approx parts |
|---|---|
| Ground, walls, merlons, towers, gatehouse, streets, spawn | ~120 |
| 13 buildings × (floor + 4 wall pieces + lintel + step + 2 roof wedges + ridge + ~4 windows + optional 4 posts/2 rails/chimney) | ~250–320 |
| Outbuildings at high level (4 per building × 13 × 3 parts) | up to ~150 |
| **Settlement total** | **~500–600** |

### Foreign settlements (shell render)

~9 settlements × ~10 parts = **~90 parts**, and all are beyond the streaming
radius in practice.

### Battle scene

| Item | Value |
|---|---|
| Parts per soldier | 6 |
| Starting soldier cap | 200 |
| **Parts at cap** | **1,200** |
| Movement | one `workspace:BulkMoveTo` per frame |
| Adaptive floor | 40 soldiers (240 parts) |

### Whole-world estimate

**~8,000–9,000 parts** with one settlement fully rendered. **This is an
estimate from source, never verified in a session.**

### Other counts

| Item | Count |
|---|---|
| Mesh count | **0** |
| Active animation count | **0** |
| Particle count | 0 idle; up to 260 during the conquest celebration (hard cap) |
| Light count | **0** — no `PointLight`/`SpotLight` anywhere |
| Transparency-heavy areas | Glass windows (1–5 per building face); billboard labels |

## StreamingEnabled settings — CURRENTLY IMPLEMENTED

| Property | Value |
|---|---|
| `StreamingEnabled` | `true` |
| `StreamingMinRadius` | 512 |
| `StreamingTargetRadius` | 2048 |

**Known consequence, derived not observed:** the nearest foreign settlement in a
seeded world is 2,297 studs away — **beyond the 2,048 target radius**. Foreign
settlements will not be visible from your own walls.

## Mobile readability

**NEVER TESTED.** No mobile-specific layout exists. Specific concerns, all
unverified:

1. War-table panel is a **fixed 340 px** with no responsive behaviour.
2. Panel rows are **36 px** tall; platform guidance is ~44 px minimum for touch.
3. `TextScaled = true` is used widely, so text size depends on container size.
4. Building labels are 13 pt at up to 130 studs.
5. The battle scene expects three squad buttons plus Charge and Fall back on the
   same screen as the field.

## Desktop versus phone evidence

**Neither exists.** No screenshots have been captured on any device. Nothing in
this package may be described as a phone test.

## `performance-evidence/`

The folder exists and is **empty**, which is the true state of the project.
