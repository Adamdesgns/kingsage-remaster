# KINGSAGE — VISUAL AUDIT HANDOFF (CONSOLIDATED)

**Prepared:** 2026-08-23 · **Commit:** `3c888746d22ed0dec04149a93c52d4abdd43546e` · **Branch:** `main`
**Repository:** https://github.com/Adamdesgns/kingsage-remaster
**Working tree at capture:** CLEAN

This single document contains the essential content of all sixteen numbered
files. An auditor can begin work from this file alone.

**Labelling convention used throughout: FACT, ASSUMPTION and RECOMMENDATION are
marked explicitly. Anything unmarked is a FACT read from source at the commit
above.**

---

## 1. Executive summary

KingsAge is a Roblox medieval strategy MMO built against an external
Node/TypeScript world server that holds all authority. The Roblox client is a
window into that world: it renders what a snapshot says and decides nothing.

**The simulation is substantially complete and tested. The game's appearance is
approximately one day old.**

- **92 core + 79 server tests pass**, plus 23 Luau files compiling, 21 executable
  Luau rules, and 4 architecture gate checkers.
- The combat model was rebuilt on 2026-08-22 to match the real KingsAge — three
  parallel class battles, `1.04^level` wall, siege, Realm of Power conquest.
- **The visual layer received its first art pass on 2026-08-23**, the same day
  this package was prepared. Before that, the project had *no lighting
  configuration at all* and every surface was one of three greys.
- **The region had no ground plane for two days** because it was built as a
  single part exceeding Roblox's 2,048-stud limit. Nothing errored.

**FACT: nobody has ever measured this game's performance on any device.**
**FACT: no screenshots exist in this package; the assembling agent cannot see a screen.**

---

## 2. What currently exists

| Area | State |
|---|---|
| Walkable settlement (400 × 400 studs) with walls, towers, gatehouse, 2 streets | **IMPLEMENTED** |
| 13 building types, hollow and enterable through doorless openings | **IMPLEMENTED, GREY-BOX** |
| Region of 10 settlements (6 capitals + 4 Freeholds) with tiled ground and ~1,850 trees | **IMPLEMENTED, GREY-BOX** |
| War table: Village / War / Map tabs, overhead camera | **IMPLEMENTED** |
| Build queue (10 deep, pays as resources arrive) | **IMPLEMENTED** |
| Scouting, attacks, offline battle resolution, replay | **IMPLEMENTED** |
| Battle scene: 3 orderable squads, adaptive 200-soldier budget | **IMPLEMENTED, EXPERIMENTAL** |
| Conquest by Realm of Power | **IMPLEMENTED** — never observed |
| Horses: bred at the Stable, cavalry converted from soldier + horse | **IMPLEMENTED** |
| Lighting, atmosphere, palette, materials | **IMPLEMENTED, ONE DAY OLD** |

## 3. What is placeholder

- **All world geometry** — untextured Roblox primitives, no meshes anywhere.
- **All UI** — no theme, no tokens; every colour hard-coded at its call site.
- **All icons** — Unicode glyphs (`♜ ♣ ◆ ⬟ ⚔ ♞ ♛`), not images.
- **Typography** — two built-in fonts, sizes chosen per call site, `TextScaled`
  used widely.
- **Player avatar** — the untouched Roblox default.
- **Roads, trees, terrain** — grey-box.

## 4. What is planned but NOT BUILT

Market and player trade · empire/multi-settlement UI · production battle art ·
interiors of any kind · props and set dressing · NPCs · **all audio** · **all
animation** · day/night cycle · weather · loading, reconnect and pending-command
states · mobile layout · tooltips · settings · housing buildings · a designed
settlement-to-region transition.

## 5. Locked design decisions

Roblox is the only client · the world server is the single source of truth ·
Roblox is a window into it · "The World Is the Game" · players walk their
streets from day one · every important building is a real place · the keep
contains the war table · each server renders a region · battles support hundreds
of troops · deterministic combat decides, Roblox performs · offline resolution
and replay · teen ~13+ Moderate-leaning · gritty but **no gore** · slice one is a
walkable grey-box settlement · wilderness/battle art/empire UI/final art are
later · the 200-troop experiment is separate · **no monetization is designed or
approved**.

Added during development: one place to train (Barracks) · kingdoms start with no
troops · horses are bred and cavalry is converted · **buildings grow wider, never
taller** · **doorless entryways** · **everything scaled off the Roblox character**
· **the name "KingsAge" can never ship**.

## 6. Current visual thesis

**FACT: there is no written art-direction thesis.**

What exists is an implicit direction one day old: warm late-afternoon light,
a narrow medieval palette, Roblox built-in materials chosen per building type,
pitched roofs with overhangs, and every dimension expressed in Roblox characters
(~5 studs). Whether this is *the* direction has never been decided.

## 7. Current visual inconsistencies

1. UI colours are magic numbers at ~40 call sites; world colours are centralised.
2. Two fonts with per-call-site sizing and heavy `TextScaled`.
3. Four wall materials across 13 buildings, so buildings look interchangeable in
   groups.
4. Unicode icons in data are never rendered in the world.
5. Kingdom colours exist as data but appear only on a foreign banner post.

## 8. World and building inventory

**Region:** 50 × 50 tiles at 220 studs/tile; 10 settlements; minimum separation 8
tiles (1,760 studs); ~9,540 × 7,780 studs spanned; 20 ground tiles; ~1,851 trees.
No Roblox Terrain is used anywhere.

**Settlement:** 400 × 400 studs. Keep north of centre; military east (barracks,
stable, workshop, smithy); economy west (timber, quarry, iron, farm); civic south
(market, warehouse); academy north. Two straight streets crossing at the centre.
Curtain wall 15 studs high with merlons every 9; four cylindrical corner towers;
gatehouse with a 22-stud opening.

**ASSUMPTION (calculated, not observed): roughly 85–88% of the settlement
interior is empty grass.** 13 building footprints total ~20,000 of 160,000 sq studs.

**Buildings:** footprints 32×28 to 64×28; wall heights 11–34 studs; each has a
floor, three solid walls, a front of two piers under a lintel leaving a doorless
opening, a pitched roof with overhang and ridge beam, 1–5 glass windows per face,
optional timber framing and chimney, and up to 4 outbuildings at high level.
**Level widens the footprint; it never increases height.**

**Interiors are completely empty.**

## 9. UI inventory

Implemented: resource HUD · construction-queue readout · building prompts ·
recruitment prompt · war table (Village/War/Map) · attack planning on four axes ·
two-tap attack arming · scout reports · battle reports · battle HUD with three
squads plus Charge and Fall back · conquest celebration · rejection toasts ·
outdated-version modal.

Not built: empire UI · formations · incoming-attack warning · surrender UI ·
loading · "realm is waking" · pending-command · reconnecting · stale-state ·
disabled-control styling · **mobile HUD** · controller focus · tooltips · settings.

Measured: panel 340 px wide; rows 36 px; tabs 36 px tall at 1/3 width; building
labels 120 × 20 px, `Merriweather` 13, fading at 130 studs; map canvas 300 × 300.

**ASSUMPTION: 36 px rows are below the ~44 px platform guidance for touch.**

## 10. Troop and battle presentation

11 unit types exist as data. **Troops have no representation in the settlement
at all** — you cannot see your garrison.

In battle: 6 anchored parts per soldier, **no Humanoid, no rig, no animation**;
movement by one `workspace:BulkMoveTo` per frame; three squads that *are* the
three combat classes (vanguard/archers/riders) with distinct colours; adaptive
budget from 200 soldiers down to a floor of 40 to hold 30 FPS; casualties fall
over 1.2 s with **no gore**; losers rout at 12 studs/sec; any battle replays from
its seed.

## 11. Lighting, VFX, animation and audio

**Lighting:** `Technology = Future` (a place property — it *cannot* be set from a
script), ClockTime 15.6, Brightness 2.6, GlobalShadows on, ShadowSoftness 0.35,
plus Atmosphere (Haze 1.6), Bloom, ColorCorrection and SunRays.

**No day/night cycle.** The night combat bonus exists in logic with no visual
counterpart. **No interior lights, no torches, no fire, no weather, no smoke.**

**VFX:** only the conquest celebration (12 shells, 36 coins, 260-part cap,
8 seconds, skippable) — **never observed running**.

**Animation: none exists in the project.** Not one `Animation` object.

**Audio: none exists in the project.** Not one `Sound` object.

## 12. Mobile and performance evidence

**FACT: none. Nothing has ever been measured on any device.**

Static counts derived from source (ASSUMPTION — never verified in a session):
~7,400 tree parts · ~500–600 parts for a fully rendered settlement · ~90 parts
for foreign shells · 1,200 parts at the 200-soldier battle cap ·
**~8,000–9,000 parts total** · 0 meshes · 0 animations · 0 lights · particles
only during the celebration.

`StreamingEnabled` true, `MinRadius` 512, `TargetRadius` 2048.
**Consequence: the nearest foreign settlement is 2,297 studs away — beyond the
target radius, so neighbours will not be visible from your walls.**

Drill C5, the 200-troop phone measurement, was written on 2026-08-21 and has
**never been run.** It is the oldest outstanding item in the project.

## 13. Asset provenance and IP risks

**No imported assets of any kind exist.** All geometry is generated at runtime in
Luau from Roblox primitives with built-in materials. Zero meshes, zero textures,
zero uploaded images, zero sounds, zero custom fonts. Nothing needs a licence.

**No original KingsAge logos, artwork, UI, icons, maps, music, sound effects or
screenshots are present.**

### The three real IP exposures

1. **The name "KingsAge" — HIGH.** Used in the repository name, URL, code, docs,
   database filenames, environment variables and npm package names. Already
   accepted as unusable. The provisional replacement "Kingsmarch" has had only a
   light collision search and **no legal vetting**.

2. **The 11 unit display names — MEDIUM.** Farmer's Militia, Squire, Templar,
   Berserker, Long-bow, Spy, Crusader, Black Knight, Battering Ram, Trebuchet,
   Count are the original game's names, adopted deliberately on the reasoning
   that they are common medieval terms. **That reasoning has never been reviewed
   by anyone qualified.**

3. **The complete combat balance tables — MEDIUM/HIGH, and easily missed.**
   Every unit's attack and three defence values, the `1.04^level` wall, the `1.5`
   casualty exponent, the Realm of Power constants (2,250–2,750 band, 50% cap,
   1%/hour regeneration, 30% on capture) and the siege formula were **transcribed
   verbatim from Gameforge's live KingsAge help pages on 2026-08-22.** Costs and
   training times were deliberately *not* copied.

**RECOMMENDATION: the final game should take a new name and an original visual
identity, and the unit roster should be renamed. The name is already accepted as
unusable; the unit names and the copied balance tables have not been consciously
decided and should be put to Adam explicitly.**

## 14. Screenshot index

**ALL 37 REQUIRED SCREENSHOTS ARE `NOT CAPTURED`.** The assembling agent has no
access to a display or capture facility. Nothing was fabricated. Exact filenames,
camera positions and capture instructions are in `13-SCREENSHOT-CATALOG.md`;
the set can be completed in one Studio session.

Four of them **cannot** exist yet because the features are not built:
`14-housing-street` (no housing), `19-region-exit` (no designed transition),
`25-command-pending-ui`, `28-reconnect-ui`.

## 15. Relevant code and file map

| Path | Role |
|---|---|
| `roblox/src/server/WorldStyle.luau` | **The entire visual system** — palette, materials, lighting |
| `roblox/src/server/SettlementBuilder.luau` | All world geometry (~740 lines) |
| `roblox/src/shared/Config.luau` | Settlement size, tile scale, part-size limit, ground tiler |
| `roblox/src/client/init.client.luau` | All UI and the war-table camera (~1,150 lines) |
| `roblox/src/client/BattleScene.luau` | Battle rendering |
| `roblox/src/shared/BattleConfig.luau` | Soldier budget and squads |
| `roblox/default.project.json` | The playable place; Lighting and streaming properties |
| `roblox/scripts/rules-check.luau` | 21 executable gate rules |
| `packages/game-core/src/combat.ts` | Roster, three-class combat, Realm of Power |

Full map with omissions and reasons: `14-FILE-AND-CODE-MAP.md`.

## 16. Known limitations of this package

1. No screenshots (agent cannot see a screen).
2. No performance data (never measured).
3. No reference images (project has never collected any).
4. No settlement map image — the `LAYOUT` table is the factual substitute.
5. War-table placement unverified without a visual check.
6. All visual claims are **source-derived, not eye-verified**.

## 17. Open visual decisions

Art-direction thesis · realism vs stylisation · historical period and fantasy
level · faction visual identity · final palette · final typography · how a
building should evolve with level · troop proportions and whether soldiers should
be recognisable · terrain density · weather · day/night · final UI style ·
**naming and IP strategy**.

## 18. Questions for Adam

1. **Name.** Is "Kingsmarch" the name, and will it be legally vetted before any
   art is commissioned around it?
2. **Unit names.** Keep the original game's 11 unit names, or rename them now
   while nothing depends on them?
3. **Balance tables.** Are you comfortable shipping a verbatim transcription of
   another game's combat numbers, or should they be re-derived?
4. **Art direction.** Stylised low-poly, or a heavier realistic look? This
   decides whether primitives can carry the game or meshes are required.
5. **Budget.** Are you willing to buy or commission models, or must everything
   remain code-generated?
6. **Emptiness.** 85–88% of the settlement is grass. Shrink the walls, or fill it
   with props and secondary buildings?
7. **Interiors.** Should buildings be enterable at all if there is nothing
   inside, or should the doorways be closed until there is?
8. **Night bonus.** Fixed server window or per-player window? It needs a visual
   either way.
9. **Phone.** When can drill C5 be run? Every visual decision is currently being
   made blind to the device budget.

## 19. Instructions for the receiving auditor

1. **Do not assume anything has been seen.** Ask for the screenshot set before
   drawing conclusions about how it *looks*; this package tells you how it is
   *built*.
2. **Judge the visual layer as one day old**, and the simulation as mature.
3. **Do not reopen locked architecture** — streets from day one, the war-table
   hybrid, region worlds, mass battles, and the server-authoritative design are
   settled. Section 5 lists them.
4. **Do treat the IP section as urgent.** It is the only item that can invalidate
   art work done later.
5. **Distinguish grey-box from bad.** Most of this is deliberately untextured.
   The useful audit is about *direction, hierarchy, readability and scale*, not
   about missing textures.
6. **Separate observed problems from opinions** in your response, the way
   `11-KNOWN-VISUAL-PROBLEMS.md` attempts to.
7. **Be concrete about what to build first.** The project's own view is that
   emptiness, interiors, audio and animation are the four largest gaps.
