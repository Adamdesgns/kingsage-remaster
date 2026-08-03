# Big World Update — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. All work happens in ONE file (`index.html`) — execute inline, do NOT parallelize tasks across subagents (they would collide in the same file).

**Goal:** Turn the 15×15 single-rival prototype into a 50×50 real-terrain continent with ~15 living AI kingdoms, alliances, dominance victory, and a world cycle — per `docs/specs/2026-08-02-big-world-update-design.md`.

**Architecture:** Everything stays in the single self-contained `index.html` (inline CSS + vanilla JS, globals on `window`, all state in `S`). New systems slot into the existing `tick()` loop and `render()` projection. The battle engine already generalizes both sides via `youTbl`/`foeTbl`, so kingdom garrisons made of real `T` units fight through it unchanged.

**Tech Stack:** Vanilla JS/HTML/CSS, one file, zero dependencies. Canvas only for the mini-map. Testing via the in-app Browser pane at 390×844.

## Global Constraints

- One file: `index.html`. No build step, no package.json, no external resources.
- Mobile-first: verify at 390×844; touch targets and `env(safe-area-inset-bottom)` respected.
- All state serializable in `S`; DOM is a projection. Globals by design.
- Troop invariant: a troop exists in exactly one place (village `army` OR march `units`/`you`).
- Determinism: world gen and AI decisions use the seeded `rnd()` LCG, never `Math.random()`.
- `renderMap()` stays on-demand (structural changes only); per-tick animation only in `renderMarchTokens()`.
- Save format: v2 (`kingsage_reforged_save_v2`); v1 saves ignored (fresh world).
- Cheat panel must keep working — it's the test surface.
- After each task: reload in Browser pane, zero console errors, screenshot-check, commit.

## Existing-code landmarks (all in index.html)

- Hardcoded grid size to eliminate: `y*15+x` in `sendRaid` (L422), `sendScout` (L432), `doScout` (L438), `enterBattle` (L459); `repeat(15,46px)` in `renderMap` (L729); token math `35+x*49` in `renderMarchTokens` (L750); `N=15` in `genMap` (L323).
- Single-rival system to replace: `S.rival`, `spawnEnemyWave` (L446), rival branches in `genMap`/`conquer`/`renderRealm`/`saveGame`.
- `#mapWrap` is already `overflow:auto` + touch scroll — native pan is nearly free.

---

### Task 1: World constants, indexing helpers, terrain generation

**Files:** Modify `index.html` (config section ~L246, map CSS ~L83-99, `genMap` L320-338, all `y*15+x` call sites, `renderMap`, `renderMarchTokens`)

**Interfaces produced (later tasks rely on these exact names):**
- `const W = 50` — world side length.
- `const idx = (x,y) => y*W+x`, `const tileAt = (x,y) => S.map[idx(x,y)]` — the ONLY way to address tiles from now on.
- `const TILE = () => currently-rendered tile pixel size` (Task 2 owns zoom; Task 1 can hardcode 46).
- `noise2(nx,ny)` — seeded 2-octave value noise in [0,1], deterministic per `S.seed` snapshot.
- `genWorld()` — replaces `genMap()`: fills `S.map` (50×50), assigns `tile.terrain ∈ {'water','plain','forest','hill','mountain'}`, sets `tile.buildable` (plain/forest/hill land), places player capital on buildable land near center, scatters ~40 barbarian camps on buildable land (density scaled from today's 15/225).
- `BUILDABLE = t => t==='plain'||t==='forest'||t==='hill'`.

**Terrain algorithm (implement exactly):**
1. Snapshot a gen-seed; value-noise lattice = hash of (cellX,cellY,genSeed) → [0,1]; bilinear-interpolate; 2 octaves (freq 1/12 and 1/5, weights .7/.3).
2. `h(x,y) = noise - edgeFalloff` where `edgeFalloff = Math.pow(dist(x,y → center)/ (W*0.55), 2.2)` → guarantees ocean border, continent center.
3. Classify: `h<0.30` water · `<0.34` coastal plain forced 'plain' · then moisture noise (second lattice): `h>0.72` mountain, `h>0.58` hill, else moisture>0.55 forest else plain. Tune thresholds until screenshot reads as continent with ranges/forests (~55-65% land).
4. Lakes come free (inland `h<0.30` pockets). Rivers: skip (YAGNI, spec allows).

**Steps:**
- [ ] Add `W/idx/tileAt/BUILDABLE/noise2`, write `genWorld()`, delete `genMap()`/`terrainOf()`, update `boot()`.
- [ ] Replace every `y*15+x` and `S.map[m.ty*15+m.tx]` with `tileAt(...)`; `renderMap` grid → `repeat(${W},46px)`; token math → `35+x*49` stays valid only while tile+gap=49 (Task 2 parameterizes).
- [ ] Add `.tile.mountain` CSS (grey-brown, e.g. `linear-gradient(145deg,#6a6250,#3f3a2e)`) and distinct water/deep-water shading.
- [ ] Home spawn: nearest buildable tile to (25,25); camps: rejection-sample buildable tiles, min distance 2.2 from home, `def` scaled by distance as today.
- [ ] Keep `S.rival`/Kaas working for now exactly as-is (one strong camp far from home) — Task 3 replaces it. `S.home` no longer fixed {7,7}: set from spawn.
- [ ] Verify in Browser pane (390×844): boot fresh (clear localStorage), zero console errors, screenshot the map — MUST read as a continent (ocean rim, mountain clusters, forest regions). Raid+scout a camp end-to-end still works.
- [ ] Commit: `feat: 50x50 generated continent terrain (value noise, ocean rim, mountains)`

### Task 2: Map viewport — pan, zoom, mini-map

**Files:** Modify `index.html` (map CSS, `#tab-map` markup, `renderMap`, `renderMarchTokens`)

**Interfaces produced:**
- `let ZOOM = 1` with levels `{0:16px, 1:30px, 2:46px}` tile size; `const TILE = () => [16,30,46][ZOOM]`, gap fixed 3px → token spacing = `TILE()+3`.
- `renderMinimap()` — draws a `<canvas id="minimap">` (140×140) from `S.map`: terrain base colors + owner-colored dots (Task 3 adds kingdom colors; until then gold=you, red=rival, brown=camps). Called whenever `renderMap()` runs.
- `centerMapOn(x,y)` — scrolls `#mapWrap` so tile (x,y) is centered.

**Steps:**
- [ ] Pan = native scroll of `#mapWrap` (already works). Give `#mapWrap` a fixed height (`min(62vh, 520px)`) so the world scrolls inside it.
- [ ] Zoom buttons (➕/➖ overlay, top-right of `#mapWrap`, position:sticky) set `ZOOM`, re-run `renderMap()` preserving scroll center. All tile-size/co-ord CSS derives from `TILE()` (set as inline style / CSS var `--tile` on `#map`). At ZOOM 0 hide tile coords/garrison text (unreadable).
- [ ] `renderMarchTokens`: replace `35+x*49` with `pad + x*(TILE()+3) + TILE()/2` (pad=12 map padding).
- [ ] Mini-map canvas floats bottom-left inside `#mapWrap` (sticky), semi-transparent border; tap/click → `centerMapOn` the tapped world coords; draw a viewport rectangle showing current scroll window.
- [ ] 🏰 "home" button next to zoom buttons → `centerMapOn(S.home.x, S.home.y)`; call once at boot.
- [ ] Verify at 390×844: pan by drag, zoom all 3 levels, minimap jump, viewport rect tracks scrolling, march tokens animate at correct positions at every zoom. Zero errors; screenshots at each zoom.
- [ ] Commit: `feat: map viewport — pan, 3-level zoom, tappable mini-map`

### Task 3: Kingdoms — data model, world spawn, player interaction

**Files:** Modify `index.html` (state ~L303, `genWorld`, raid/scout/battle glue, `renderMap`/`renderMinimap`, `conquer`)

**Interfaces produced:**
- `S.kingdoms = [k0, k1, ...]` where `k = {id, name, color, capital:{x,y}, alive:true, aggr:0-1, relations:{[kid]:-100..100}, allianceId:null}`. **`S.kingdoms[0]` is the player** (`name:'You'`, color `'#f0c057'`).
- New tile type `'kv'` (kingdom village): `{type:'kv', kid, name, capitalOf:kid|null, pow, garrison:{T-units}, res, cap, regen, loyalty, recon}`. Garrison uses REAL `T` unit keys (e.g. `{spear:40,axe:25,archer:15,lcav:5}`) so `enterBattle` runs with `m.foeTbl=T` (add: when target tile is `'kv'`, set `foeTbl=T`).
- `kingdomOf = kid => S.kingdoms[kid]`
- `villagesOf(kid)` — array of map tiles with `.kid===kid` (player villages excluded; player's are `S.villages`).
- `territoryCounts()` — returns `{[kid]: tileCount}` by nearest-owned-village claim within radius 3 (computed on demand, not stored). Player counts via own/home tiles.
- `KNAMES`, `KCOLORS` — 15+ entries; distinct hues, readable on dark map.

**Steps:**
- [ ] Spawn in `genWorld()`: 14 AI kingdoms + player. Capital sites: rejection-sample buildable tiles ≥7 tiles apart and ≥8 from player home. Each AI kingdom: capital `kv` (pow ~80-140, higher for far ones) + 1-2 nearby village `kv`s (pow ~40-80). Garrison composition from pow: `spear pow*.5, axe pow*.25, archer pow*.2, lcav pow*.05` (round, min 1 spear). Loot res/cap/regen like barb camps ×1.6.
- [ ] **Kaas becomes kingdom 1** (`name:'Warlord Kaas'`, `aggr:0.95`, red-black color); delete `S.rival`, `rivalDefeated`, rival branches in genWorld/renderRealm. `spawnEnemyWave()` → `kingdomRaid(k, targetTile)` generalization: any kingdom can send an `incoming` march at the player (uses same units-from-pow formula; `enemyName=k.name`). Waves now come from hostile kingdoms whose capital is nearest the player (Task 4 drives frequency; until then keep the current timer calling `kingdomRaid(kingdoms[1], capitalTile)`).
- [ ] Tiles/minimap: `kv` tiles render 🏯 with 2px `box-shadow` ring in kingdom color; capital gets 👑 corner mark; minimap dots in kingdom colors.
- [ ] Player interaction: tapping a `kv` opens the existing `openRaid` modal (works: scout → `recon`, raid → battle vs T-garrison, nobles drop loyalty). `conquer(tile)` when `type==='kv'`: village leaves the kingdom (tile becomes yours as today); if it was the capital, `k.alive=false` and its remaining villages convert to barb camps at 60% pow ("the kingdom shatters") + log line.
- [ ] Save v2 NOW (before shapes multiply): `SAVE_KEY='kingsage_reforged_save_v2'`; add `kingdoms` to save/applySave; delete `rivalXY` handling.
- [ ] Verify: fresh boot → 15 colored kingdoms spread across continent (screenshot map + minimap), scout then raid a kingdom village (battle vs real units plays), conquer one via cheats (grantNobles + grantTroops), kill a capital → kingdom shatters. Zero errors.
- [ ] Commit: `feat: 15 kingdoms on the map — colored territories, raidable T-unit garrisons, capitals, save v2`

### Task 4: Living world — kingdom AI (grow, expand, war, absorb)

**Files:** Modify `index.html` (`tick()`, new AI section after ENEMY WAVES)

**Interfaces produced:**
- `aiTick()` — called from `tick()` at most once per 2000ms real (`S.nextAiAt` timestamp). Iterates living AI kingdoms; each acts on its own cooldown (`k.nextActAt`, 20-60s real scaled by `1/aggr`).
- `aiResolve(attackerPow, defenderPow, defTerrain)` — deterministic-ish instant battle math for AI-vs-AI (no UI): power ratio + `rnd()` luck ±15% + forest-defense ×1.15; returns `{atkLoss, defLoss, win}` fractions. Powers are `pow` scalars, garrisons re-derived from pow after.
- `worldLog(msg)` — `log('info', ...)` prefixed 🌍 so world events are visible in Reports.

**Kingdom actions (choose one per act, weighted by personality):**
1. **Grow** (always, passive): every aiTick, each `kv.pow += growthRate*dt` (growthRate ≈ 0.8/min real at start, ×0.5 for shattered-adjacent balance); garrison re-derived from pow on demand (store pow, derive garrison lazily when scouted/attacked — keeps garrison shape consistent).
2. **Expand** (weight `1-aggr`): if kingdom has < 5 villages and a buildable, unclaimed tile exists within 4 of any of its villages → found new `kv` (pow 30) there; `worldLog` it.
3. **Raid** (weight `aggr`): pick target = weakest `kv`/player village within 8 tiles of any own village, excluding allies (Task 5) and kingdoms with relations > 40. If target is **player**: send a REAL `incoming` march via `kingdomRaid` (existing defense battle flow; cap frequency: ≥90s between any-kingdom player raids, strength scaled to `0.4-0.8 × player realmPoints/10`). If AI-vs-AI: `aiResolve` instantly; loser pow −defLoss, winner −atkLoss; on win by >2× margin: **capture** — tile.kid changes, `worldLog('⚔️ X seized Y from Z')`; capital captured → absorb: all loser villages → winner, `loser.alive=false`, `worldLog('👑 X has absorbed Z!')`.
4. **Relations drift**: raids set attacker↔defender relations −30; time heals +1/min toward 0.
- [ ] Implement the above; wire `aiTick()` into `tick()`; delete the old fixed `S.nextEnemyAt` wave timer (raid action #3 replaces it).
- [ ] `renderMap()`/`renderMinimap()` refresh: `aiTick` sets `S.worldDirty=true` on any structural change (new village, capture, absorb); the existing 400ms watcher in `boot()` also re-renders when `worldDirty` (reset after render). Player-facing raids keep the alert strip working.
- [ ] Cheat: add `⏩ Fast-forward world 10 min` button → loop `aiTick` with simulated dt; and `noWaves` now suppresses AI raids on the PLAYER only.
- [ ] Verify: fresh boot, fast-forward ×3 → screenshot minimap before/after: borders MUST have shifted (captures/absorptions in Reports log). Player still gets raided (alert strip). Zero errors. Sanity: no kingdom exceeds ~12 villages; world doesn't collapse to one color in 10 min.
- [ ] Commit: `feat: living kingdoms — growth, expansion, AI wars, capture and absorb`

### Task 5: Alliances

**Files:** Modify `index.html` (AI section, `openRaid`/new diplomacy modal, minimap)

**Interfaces produced:**
- `S.alliances = [{id, name, members:[kid,...]}]`; `allianceOf = kid => S.alliances.find(a=>a.members.includes(kid))||null`; `areAllied = (a,b) => !!al && same alliance`.
- `proposeAlliance(kid)` (player→AI): accept if `relations[player] > -20 && playerPow/kPow between 0.4 and 2.5` else refuse with toast reason. Join their alliance or form new 2-member one (`name` from a small list: 'The Accord', 'Iron Pact', ...).
- `breakAlliance()` — leaves alliance, relations −50 with ex-members.

**Steps:**
- [ ] AI formation in `aiTick`: un-allied kingdom threatened (any kingdom within 8 tiles with pow > 1.8×) seeks nearest similar-size (0.5-2×) un-allied/neutral kingdom → forms/joins alliance; `worldLog('🤝 X and Y have formed The Accord')`. Cap alliance size 4. Allies: never raid each other; ally defense: `aiResolve` defender gets ×1.25 when an ally village is within 6 (they "send support").
- [ ] Player alliance effects: allied kingdoms never raid you; when you're raided, an allied kingdom within 6 of the target adds +25% defense (shown in battle meta as `🤝 ally support`); raiding your OWN ally auto-breaks the pact first (confirm dialog).
- [ ] Diplomacy UI: `kv` tap modal gets a `🤝 Diplomacy` button → small modal: kingdom name/pow estimate/relations word (Hostile/Wary/Neutral/Warm), Propose Alliance / Break Alliance buttons.
- [ ] Visuals: allied-to-you kingdoms get green ring accent on tiles; minimap draws alliance blocs (thin white outline linking member dots is overkill — instead: legend row under minimap listing alliances by colored dots). Realm tab lists alliances.
- [ ] Save: `alliances` + `relations` in save v2 payload.
- [ ] Verify: fast-forward until an AI pact logs; propose alliance to a Warm kingdom (accepted), get raided by third party → ally-support line appears; break pact → relations drop. Screenshot diplomacy modal. Zero errors.
- [ ] Commit: `feat: alliances — AI pacts, player diplomacy, ally defense support`

### Task 6: Realm standings, dominance victory, world cycle + Hall of Legends

**Files:** Modify `index.html` (`renderRealm`, `showVictory`, save section, `boot`)

**Interfaces produced:**
- `standings()` — sorted `[{kid,name,color,pct,alive}]` from `territoryCounts()` (pct of claimed land tiles).
- `checkVictory()` — in `tick()` (throttled 5s): win when player pct ≥ 40 OR every AI capital captured/shattered. Sets `S.won`, calls `showVictory()` once.
- `newWorld()` — pushes `{world:S.worldNum, name:S.worldName, days, realmPoints, pctAtWin, savedAt}` onto `S.legends`, bumps `S.worldNum`, regenerates: fresh seed, `genWorld()`, starter village, keeps `S.legends`+`worldNum`+cheats; saves immediately.
- `S.worldName` — generated (`'World '+worldNum` + flavor name from list, e.g. "W2 — Emberfall").

**Steps:**
- [ ] Realm tab: standings table (color dot, name, %, alliance tag, 💀 for dead kingdoms), player row highlighted; goal line `Control 40% of the continent — currently X%`. Hall of Legends card below (from `S.legends`, `'No worlds conquered yet'` empty state).
- [ ] `showVictory()` rewrite: world name, stats (days, villages, pct, raids repelled), two buttons: `Continue your reign` and `🌍 Found a New World` → confirm → `newWorld()`.
- [ ] `legends`, `worldNum`, `worldName` in save v2; `applySave` restores them.
- [ ] Verify: cheat-force territory (add cheat `👑 Force victory check` granting enough conquests OR temporarily assert via console `territory` math), victory screen shows, Found a New World → different continent (screenshot proves different terrain), legends row present, old-world progress gone, save survives reload. Zero errors.
- [ ] Commit: `feat: dominance victory (40%), realm standings, world cycle with Hall of Legends`

### Task 7: Terrain gameplay effects, polish, full verify, deploy

**Files:** Modify `index.html`, `README.md`

**Steps:**
- [ ] Travel cost: `travelFactor(fromX,fromY,tx,ty)` — sample 8 points along the line; factor per terrain `{plain:1, forest:1.25, hill:1.5, water:2.2, mountain:2.8}`, average → multiply travel time in `sendRaid/sendScout/sendSupport/kingdomRaid`. Water/mountain tiles themselves untargetable (no camps/kv spawn there already; also guard `openRaid`).
- [ ] Forest defense: in `battleRound`, defender-side ×1.15 when defending tile (`m.tile` attack-mode) is forest; show `🌲` in battle meta. (Player-defense tiles are villages on buildable land — apply if capital tile terrain is forest too.)
- [ ] About panel + README: rewrite for the new world (kingdoms, alliances, 40% goal, worlds). Update topbar subtitle to `Phase 1 · Big World`.
- [ ] FULL regression at 390×844, fresh boot: build/train/queues, scout/raid barb, raid kv, defense battle, reinforce, conquer via nobles, alliance propose/see AI pact, fast-forward border shifts, victory→new world, save/reload mid-everything, all cheats. Zero console errors throughout. Screenshots: continent, zoomed map, minimap, battle, diplomacy, standings, victory.
- [ ] Also load the LIVE Pages URL after push to confirm deploy.
- [ ] Commit: `feat: terrain travel costs + forest defense; Phase 1 polish` then push `main` (auto-deploys), verify https://adamdesgns.github.io/kingsage-remaster/ serves the new build.

---

## Self-review notes

- Spec §1 terrain→T1/T7, §2 map UI→T2, §3 kingdoms→T3/T4, §4 alliances→T5, §5 victory/cycle→T6, §6 save v2→T3/T6, §7 testing→every task + T7. Rivers explicitly skipped (spec: "YAGNI-able"). §8 (CoC village) is Phase 2 — not in this plan.
- Garrison-from-pow lazy derivation (T4) must match the composition formula in T3 — single helper `garrisonFromPow(pow)` used by both.
- `noWaves` semantic change (player-raid suppression) noted in T4.
