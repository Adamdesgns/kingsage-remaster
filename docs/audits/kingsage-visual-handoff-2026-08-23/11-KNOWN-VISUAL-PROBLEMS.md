# 11 — Known Visual Problems

Ranked by impact. **Observed** means seen in a screenshot Adam supplied or
proven from source/logs. **Opinion** is the archivist's assessment and is
labelled as such.

---

## Tier 1 — blocks the game reading as a game

### 1. No performance evidence at all — OBSERVED (absence)
Never measured on any device. The 200-troop target is a guess. Every visual
decision is being made without knowing what the phone can carry.

### 2. ~85–88% of the settlement interior is empty grass — OBSERVED (calculated)
The wall ring is 400 × 400 studs; the 13 building footprints total roughly
20,000 of 160,000 sq studs. Nothing occupies the remainder: no props, no fences,
no market stalls, no wells, no crops.

### 3. Building interiors are completely empty — OBSERVED
Buildings became enterable on 2026-08-23 and contain nothing at all. There is no
reason to walk into any of them, which directly undercuts *"every important
building is a real place."*

### 4. No audio whatsoever — OBSERVED
Not one `Sound` object. Silence is a significant part of why a build feels
unfinished.

### 5. No animation whatsoever — OBSERVED
No `Animation` objects. Battle soldiers slide rather than walk.

---

## Tier 2 — generic or unreadable

### 6. Player avatar is the untouched Roblox default — OBSERVED
No armour, tabard or costume. A medieval war game where the lord wears whatever
their Roblox account wears.

### 7. Buildings within a material group look interchangeable — OPINION
Four wall materials across 13 buildings. Barracks (64×28) and Stable (58×26) are
both long low halls; the four economy buildings are near-identical boxes.

### 8. Floating labels do nearly all the identification work — OPINION
No icons in world, no signage, no functional props. Remove labels and most
buildings become unidentifiable.

### 9. Foreign settlements are invisible in practice — OBSERVED (calculated)
Nearest neighbour 2,297 studs; streaming target radius 2,048.

### 10. The settlement layout is a symmetric grid, not a town — OPINION
Perfect mirror symmetry, two straight streets crossing at the centre, no plaza,
no landmark hierarchy beyond the keep being tallest.

### 11. Flat terrain — OBSERVED
No elevation, water, rock or variation anywhere. Roblox Terrain is not used at
all.

---

## Tier 3 — UI and polish

### 12. No UI theme or tokens — OBSERVED
Every colour is a hard-coded `Color3.fromRGB` at its call site. No shared style.

### 13. Dead controls — OBSERVED
A building at maximum level still shows a live "Upgrade" button that the server
refuses. Adam hit exactly this: *"none of this is useable from the war table."*

### 14. No mobile layout — OBSERVED
Fixed 340 px panel, 36 px rows, `TextScaled` throughout, never tested.

### 15. Missing UI states — OBSERVED
No loading screen, no reconnecting indicator, no pending-command feedback, no
stale-state warning. The game appears frozen during any server delay.

### 16. Weak information hierarchy — OPINION
Every row in the Village tab has equal weight.

### 17. Typography is unsystematised — OBSERVED
Two fonts, sizes chosen per call site, `TextScaled` used widely.

---

## Tier 4 — historical defects worth knowing (all now FIXED)

These are listed because they show the failure pattern, not because they are
open:

| Defect | Consequence | Status |
|---|---|---|
| Region ground built as a single 9,540 × 7,780 part | Exceeded Roblox's 2,048 limit, so **the world had no floor for two days**. Nothing errored. | **FIXED** `6a9b6cd` |
| `Lighting.Technology` set from a script | Threw, killed the whole server script, player fell to death repeatedly | **FIXED** `7aa5a40` |
| Buildings 48 studs tall | Read as monuments, not buildings | **FIXED** `6c479b4` |
| Labels 220 px with no distance limit | Stacked into an unreadable wall of text | **FIXED** `6c479b4` |
| Villagers added that were never requested | "what are all these sticks" | **REMOVED** `6c479b4` |
| `start-dev.ps1 -Fresh` silently reusing a stale world | Adam played four-hour-old code and saw none of the day's work | **FIXED** `58610c3` |

**The pattern in every one of these: something reported success for work it had
not done.** An auditor should assume this pattern may still be present in
untested areas.

---

## Intellectual-property risk

See `09-ASSET-PIPELINE-AND-PROVENANCE.md`. Summary: the name cannot ship, the
unit names are the original game's, and the complete combat balance tables were
transcribed verbatim from the original's help pages.
