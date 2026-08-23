# 09 — Asset Pipeline and Provenance

## Summary in one line

**This project contains no imported art assets of any kind.** Every visible
object is generated at runtime in Luau from Roblox primitives with built-in
materials. There is nothing to license and nothing downloaded.

## Pipeline

| Question | Answer |
|---|---|
| Geometry built in Studio? | **No.** Nothing is authored in the Studio viewport. |
| Generated with Luau? | **Yes — all of it.** `Instance.new("Part")` / `"WedgePart"` |
| Imported from Blender? | **No.** No `.fbx`, `.obj`, or `.blend` exists in the repo. |
| Obtained elsewhere? | **No.** No Toolbox models, no marketplace assets. |
| Meshes | **Zero.** No `MeshPart`, no `SpecialMesh`, no mesh IDs. |
| Textures | **Zero uploaded.** Only Roblox built-in `Enum.Material` surfaces. |
| Decals / images | **Zero.** Not one `ImageLabel` or `Decal`. |
| Sounds | **Zero.** |
| Animations | **Zero.** |
| Custom fonts | **Zero.** `Merriweather` and `GothamBold` are Roblox built-ins. |

## Conventions

| Convention | State |
|---|---|
| Naming | Consistent in code: `B_<building>`, `Settlement_<villageId>`, `RegionGround<n>`, `WallN/W/E/S1/S2`, `Merlon`, `Tower`, `GateTower`, `GateArch`, `Structure`, `Roof`, `Ridge`, `Window`, `Post`, `Rail`, `Chimney`, `Annex`, `Floor`, `Lintel`, `Step` |
| Scale | **Explicit and documented** — everything derived from the ~5-stud Roblox character |
| Pivots | Roblox default (part centre). Not managed. |
| Collision | Roblox default. `CanCollide = false` set on labels/canopies/decor. Buildings are solid-walled and enterable through the doorway gap. |
| Modular kits | **NOT BUILT.** Buildings are parameterised by a spec table rather than assembled from a kit. |
| UV / texture rules | **N/A** — no textures |
| Material reuse | **Yes**, centralised in `WorldStyle.MATERIAL` |
| LOD strategy | **NOT BUILT** for the world. Battle scene has adaptive culling only. |
| Quality tiers | **NOT BUILT** |

## Asset manifest

| Asset | Type | Source | Creator | License | Roblox ID | Source path | Usage | Status | Replacement risk |
|---|---|---|---|---|---|---|---|---|---|
| All settlement geometry | Runtime primitives | Generated | This project | Owned | n/a | `roblox/src/server/SettlementBuilder.luau` | World | GREY-BOX | None |
| Palette & materials | Config | Authored | This project | Owned | n/a | `roblox/src/server/WorldStyle.luau` | World | First pass | None |
| Battle soldiers | Runtime primitives | Generated | This project | Owned | n/a | `roblox/src/client/BattleScene.luau` | Battle | GREY-BOX | None |
| Celebration VFX | Runtime primitives | Generated | This project | Owned | n/a | `roblox/src/client/Celebration.luau` | Conquest | Placeholder | None |
| Fonts (`Merriweather`, `GothamBold`) | Font | Roblox built-in | Roblox | Roblox platform terms | n/a | UI code | UI | Placeholder | None |
| Materials (Cobblestone, Brick, Slate, …) | Material | Roblox built-in | Roblox | Roblox platform terms | n/a | `WorldStyle.luau` | World | In use | None |
| Default skybox | Sky | Roblox built-in | Roblox | Roblox platform terms | n/a | runtime | Sky | Placeholder | None |
| UI icons | Unicode glyphs | Text characters | n/a | n/a | n/a | `packages/game-core/src/economy.ts` | UI | Placeholder | None |

**No unverified third-party material is present.**

---

# ⚠️ INTELLECTUAL PROPERTY REVIEW — THE LARGEST RISK IN THIS PACKAGE

## What is NOT used

Confirmed absent from the repository: original KingsAge **logos, artwork, UI
graphics, icons, maps, music, sound effects, screenshots, and building or unit
artwork**. None of these exist in the project at all, because the project has no
imported assets whatsoever.

## What IS used, and it is substantial

### 1. The name "KingsAge" — HIGH RISK

- Repository name: `kingsage-remaster`
- Repository URL: `github.com/Adamdesgns/kingsage-remaster`
- Used throughout code, docs, database filenames, environment variables
  (`KINGSAGE_*`), and npm package names (`@kingsage/game-core`).

The project already records that this name **cannot ship**: *"Never ship the
name 'KingsAge' — it belongs to the 2008 original's owners."* A provisional
working title, **"Kingsmarch"**, was chosen on 2026-08-21 and has had only a
light collision search. **It has not been legally vetted.**

### 2. Unit display names — MEDIUM RISK

The 11 unit names shown to players — Farmer's Militia, Squire, Templar,
Berserker, Long-bow, Spy, Crusader, Black Knight, Battering Ram, Trebuchet,
Count — **are the original KingsAge unit names**, adopted deliberately.

The project's own reasoning, recorded in the spec: *"'Templar', 'Berserker',
'Crusader', 'Black Knight', 'Squire' are common medieval terms and carry no
rights. Only the name KingsAge is off limits."*

**That reasoning is plausible for individual words but has not been reviewed by
anyone qualified.** The risk is not any single word; it is that the *complete
set*, in the same roles, alongside the same statistics, reads as a reproduction
of a specific game's unit roster.

### 3. Game statistics copied verbatim — MEDIUM/HIGH RISK, AND EASILY MISSED

This is the item most likely to be overlooked by a visual auditor and is
recorded here deliberately.

**Every combat number in this game is copied exactly from KingsAge's published
help pages**, transcribed on 2026-08-22 from Gameforge's live servers:

- All 11 units' attack values and their three defence values.
- The wall formula `1.04 ^ level`.
- The casualty exponent `1.5`.
- Realm of Power: the 2,250–2,750 band, the 50% per-attack cap, 1%/hour
  regeneration, 30% on capture.
- The siege formula `round(units / (K × 1.09 ^ level))`.
- Unit speeds, carry capacities and populations.

Costs and training times were **deliberately NOT copied** — they are rescaled
for this game's smaller building caps, and the source says so explicitly.

**Assessment (opinion, flagged): facts and numbers are generally not
copyrightable, but a wholesale transcription of one game's complete balance
tables — combined with its unit names and its name — is a materially different
proposition from being "inspired by" it. This warrants a real legal opinion, not
a developer's judgement.**

### 4. Mechanics and structure — LOW RISK

Game mechanics are not protected by copyright. Being a Tribal-Wars-style
strategy game is not itself an issue.

## Recommendation to the auditor (labelled as recommendation)

The final Roblox game **should adopt a new name and a completely original visual
identity**, and should treat the unit roster as a naming exercise still to be
done. The name is already accepted as unusable; the unit names and the copied
balance tables are the parts that have *not* been consciously decided and should
be put in front of Adam explicitly.
