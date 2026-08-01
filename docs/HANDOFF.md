# KingsAge Reforged — Handoff for a New Claude Code Session

*Read this first. It gives a fresh session everything needed to continue the project without re-deriving context. Written for an AI coding agent picking up the work.*

---

## 0. TL;DR

We are modernizing the dead 2008 browser strategy game **KingsAge** (a Tribal Wars–style medieval war MMO). The current deliverable is a **fully playable single-player game in one self-contained HTML file** (no build step, no dependencies, mobile-first). A separate written **spec** designs the eventual multiplayer server. Your job continues from a working, tested game.

**The entire codebase is one file:** `KingsAge_Reforged_Prototype.html` (~800 lines, inline CSS + vanilla JS, zero libraries). Open it in a browser and it runs. Everything below describes that file.

> ⚠️ **This workspace is ephemeral.** A new session starts with an empty filesystem. The user must **attach `KingsAge_Reforged_Prototype.html`** (and ideally `KingsAge_Reforged_Backend_Spec.md` + `KingsAge_Reforged_Plan.md`) to the new session. This handoff doc + the HTML file together are the complete context.

---

## 1. Project files (deliverables produced so far)

| File | What it is |
|---|---|
| `KingsAge_Reforged_Prototype.html` | **The game.** Single-file, self-contained, playable. This is the code you work on. |
| `KingsAge_Reforged_Plan.md` | Product/modernization plan (vision, what to keep/fix, tech direction, roadmap). Context, not code. |
| `KingsAge_Reforged_Backend_Spec.md` | Build-ready spec for the future **multiplayer backend** (authoritative server, Postgres schema, scheduler, deterministic combat, API, scaling). Read this before doing any server work. |
| `KingsAge_Reforged_HANDOFF.md` | This document. |

---

## 2. How to run and test

**Run:** open the HTML file in any browser. It boots immediately (`boot()` at the bottom).

**Test (how the current code was verified — reuse this):** headless Chromium via Playwright. Chromium is preinstalled at `/opt/pw-browsers/chromium`. Pattern used throughout:

```js
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport:{width:390,height:844} }); // phone-sized
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file:///path/KingsAge_Reforged_Prototype.html');
// Drive it by calling globals directly, e.g.:
await page.evaluate(() => { S.cheats.god = true; upgrade('barracks'); });
```

Because all game state (`S`) and functions are globals on `window`, tests poke them directly and assert on `S`. **Always test on a 390px viewport** (mobile is the target) and **always assert zero `pageerror`s**. Take screenshots (`page.screenshot`) and actually look at them — several bugs were visual-only.

There is **no build, no bundler, no package.json.** Do not add one unless the task explicitly requires leaving single-file form.

---

## 3. Architecture of the single-file game

Three inline `<section>` "tabs" (Village / Army / Map) plus a Reports tab, a bottom nav, and overlay DOM injected at runtime (raid modal, battle scene, victory screen, cheat panel). One data object `S` holds all state. One `tick()` runs on `setInterval(…, 250ms)`; one `render()` rebuilds the DOM from `S` each tick. **All logic is client-side and authoritative locally** — this is a single-player game, not a client for a server (that's the future backend spec).

Flow: `boot()` → build starting village + map → `setInterval(tick,250)`. Each `tick()`: accrue resources, advance build/train queues, maybe spawn an enemy wave, advance marches (arrivals → battles), step the active battle, then `render()`.

Time is compressed by `const SPEED = 60` (1 real second ≈ 60 game seconds) so a "1-hour" build finishes in ~60s. All durations are `real_seconds = game_seconds / SPEED`.

---

## 4. State model

### `S` (global game state)
```
S = {
  villages: [village, …],   // villages[0] is always the capital
  active: 0,                // index of currently-managed village
  marches: [march, …],      // all in-flight armies (yours + enemy)
  map: [tile, …],           // 15×15 grid, row-major (index = y*15 + x)
  home: {x,y},              // capital coords (== villages[0] coords)
  rival: tile|null,         // Warlord Kaas's stronghold tile; null once conquered
  rivalDefeated, won,       // booleans
  wavesRepelled, wave,      // counters
  nextEnemyAt,              // timestamp for next enemy wave
  lastTick, seed,           // loop clock; deterministic PRNG seed
  cheats: { god, trainMult, buildMult, noWaves }   // sandbox
}
```

### village (from `makeVillage(name,x,y,capital)`)
```
{ id, name, x, y, capital:bool,
  res:  {wood, stone, iron},
  b:    {hq,timber,quarry,iron,farm,wh,barracks,wall,academy},  // building levels
  army: {spear,sword,axe,archer,scout,lcav,ram,noble},          // home garrison
  buildQ: [ {key, targetLvl, dur, ends} ],   // ends=0 until it's the active job
  trainQ: [ {key, dur, ends} ] }
```

### tile (in `S.map`)
```
{ x, y, type:'empty'|'home'|'own'|'barb'|'rival', terrain, name,
  res, cap, regen,            // loot (barb/rival)
  garrison:{barbUnit:qty},    // persistent — depletes when you defeat it
  loyalty:0..100, recon,      // conquest + fog-of-war
  vid }                       // owned-village id (type 'own'/'home')
```

### march (in `S.marches`) — shape depends on `phase`
```
owner:'me'|'enemy', type:'raid'|'scout'|'support',
fromVid, fromX, fromY, tx, ty, toVid(support), name, units:{}, carry,
depart, arrive, travel, phase:
  'out'|'scout'|'scoutback'|'support'|'incoming'|'battle'|'back'
// when phase==='battle', extra fields: mode:'attack'|'defense',
//   you, foe, youTbl, foeTbl, startYou, startFoe, round, nextRound,
//   outcomeReady, result, tile, morale, fx, haul, stolen, defV, enemyName
```

**Invariant to preserve:** a troop is in exactly one place — a village's `army`, or an in-flight march's `units`/`you`. This keeps population accounting correct. Don't break it.

---

## 5. Config / tuning tables (top of the `<script>`)

- **`B`** — buildings. Each: `{name, ico, max, desc, base:{wood,stone,iron}, time, cf, tf, info(l)}`. `cf`=cost factor, `tf`=time factor (both `^level`). `BORDER` = display order.
- **`T`** — units: `spear, sword, axe, archer, scout, lcav, ram, noble`. Each: `{name, ico, fig(color), cost, pop, time, atk, def, speed(min/tile), carry, req(barracks lvl)}`. `noble` also needs `academy≥1`. `TORDER` = display order.
- **`BARB`** — barbarian garrison units: `raider, bowman, brute` (`atk`/`def` only).
- Curve fns: `prod(l)`, `storeCap(l)`, `popCap(l)`, `costOf(k,lvl)`, `buildTime(v,k,lvl)`, `trainTime(t)`.

**These tables are the balance knobs.** Changing `SPEED`, a unit's `time`/`cost`/`atk`, `B[x].base`, or the curve exponents retunes the whole game. The eventual server extracts these into a shared config package (see backend spec §13).

---

## 6. Function map (by section, in file order)

- **Loop/economy:** `tick()`, `startNextBuild(v)`, `startNextTrain(v)`, `materialize`-style accrual is inline in `tick()`.
- **Actions:** `canAfford`, `pay`, `queuedLevel`, `upgrade(k)`, `train(k)`.
- **Raiding/scouting:** `openRaid(tile)`, `fillAll`, `closeModal`, `sendRaid(x,y)`, `sendScout(x,y)`, `doScout(m)`, `returnScouts(m)`.
- **Enemy:** `spawnEnemyWave()`.
- **Battle engine (shared attack+defense):** `enterBattle(m)` (your raid arrives), `startDefense(m)` (enemy raid arrives), `sideOffense`, `sideDefense`, `killFraction`, `battleRound(m)`, `goodEnd(m)`, `badEnd(m)`, `doRetreat()`, `conquer(tile)`, `returnArmy(m)`.
- **Battle UI:** `openBattle`, `closeBattle`, `figs`, `soldier` (SVG), `buildBattleDOM`, `renderBattle`, `rosterRows`, `floatNum`.
- **Reinforcements:** `openVillageMenu(v)`, `openReinforce(toId)`, `fillSup`, `sendSupport(toId)`, `doSupport(m)`.
- **Score/victory:** `realmPoints()`, `showVictory()`, `renderRealm()`.
- **Render (rebuild DOM from `S`):** `render()` calls `renderVillageBar, renderRes, renderBuildings, renderBuildQueue, renderTroops, renderTrainQueue, renderArmy, renderMarches, renderMarchTokens, renderLog, renderBadges, renderAlert, renderRealm`. `setActive(i)` switches village. `renderMap()` is called on demand (map is not rebuilt every tick; march tokens are moved via `renderMarchTokens`).
- **Sandbox/cheats:** `openCheats`, `cheatHTML`, `refreshCheats`, `cheatBadge`, `finishQueues`, `grantTroops`, `grantNobles`, `maxBuildings`, `revealAll`, `spawnWaveNow`, `conquerNearest`.
- **Save/load:** `SAVE_KEY`, `saveGame(silent)`, `loadGame()`, `applySave(d)`, `resetGame()`, `autosave()`. `boot()` auto-loads a save if present.

---

## 7. Systems — how each works (so you don't reverse-engineer)

- **Economy:** resources accrue per tick (`res += rate*dt`, clamped to warehouse cap). Farm sets population cap; `popUsed(v)` sums home army + training + this village's in-flight troops.
- **Queues:** build/train are arrays; only the front job counts down (`ends` timestamp); `tick()` completes due jobs and starts the next. Build queue capped at 5.
- **Marches:** created by `sendRaid/sendScout/sendSupport`/`spawnEnemyWave`. `tick()` transitions them by phase and arrival time. Travel time = `distance * slowestUnit.speed * 60 / SPEED`.
- **Combat (`battleRound`)** is round-based, deterministic-ish via `rnd()`. Attacker offense vs defender defense, scaled by **morale** (defense only; protects the weaker side) and **luck** (±, per round), with **rampart** multiplying defender defense. Casualties are a fraction of each side per round; ends when a side hits 0 or (attack only) the player retreats.
- **Attack vs defense modes:** the same engine runs both. `you`/`foe` generalize the two sides; `mode` picks who is attacker/defender for morale/wall. Your raid: `enterBattle`. Enemy raid on you: `startDefense` (your `army` defends; retreat disabled).
- **Battle scene** is a full-screen overlay (`buildBattleDOM`/`renderBattle`): tug-of-war strength bar, SVG soldier ranks that thin out, floating casualty numbers, live rosters, and Retreat (attack only).
- **Scouting:** send scouts → `doScout` snapshots the camp's garrison+loot into `tile.recon` (fog-of-war reveals it), scouts return.
- **Conquest:** camps have persistent `garrison` (depletes when beaten) and `loyalty`. A won attack containing surviving **noblemen** drops loyalty ~20–35 each; ≤0 → `conquer(tile)` turns it into a new owned village. **Warlord Kaas's stronghold** is a stronger camp; conquering it stops enemy waves and triggers `showVictory()` (win condition).
- **Multi-village:** `S.villages[]` + `S.active`; village chips in the header (`renderVillageBar`) switch active. Each village builds/trains/defends independently. Raids launch from the active village. Enemy waves target the capital.
- **Reinforcements:** tap an owned village on the map → `openVillageMenu` → send troops (`sendSupport`) that merge into its garrison on arrival.
- **Sandbox (🛠️ button, `S.cheats`):** God mode (∞ resources via `res=1e9` each tick, no pop cap, free `pay`/`canAfford`), `trainMult`/`buildMult` (divide durations), no-waves toggle, and instant tools. This is the user's testing surface — keep it working when you change systems.
- **Save/load:** `localStorage` (`kingsage_reforged_save_v1`), autosaves every 15s, wrapped in try/catch (fails silently in sandboxed previews; works when the file is opened directly). `applySave` rebases all timestamps by elapsed real time and re-links `S.rival` to the saved map tile. **Battle-phase marches are excluded from saves.**

---

## 8. Conventions & gotchas

- **Vanilla only.** No frameworks, no external scripts, no CSS files — everything inline in the one HTML file. `localStorage` is the only browser storage used (guarded by try/catch; do **not** assume it exists).
- **Globals by design.** `S` and all functions are on `window` so tests and the cheat panel can call them. Keep new gameplay functions global.
- **`render()` is called every tick** and rebuilds most panels via `innerHTML`. Don't stash un-serializable state in the DOM; the DOM is a projection of `S`.
- **`renderMap()` is NOT called every tick** (perf) — only on structural changes (village count, selection, conquest). Moving army dots is `renderMarchTokens()` inside `render()`. If you add map state that must animate, update it in `renderMarchTokens` or call `renderMap()` explicitly.
- **Mobile first.** Test at 390px. Touch targets, the bottom nav (`env(safe-area-inset-bottom)`), and the fixed alert/FAB positions matter.
- **Determinism:** `rnd()` is a seeded LCG off `S.seed`. `Date.now()` is used for wall-clock timers (fine on the client; the server spec replaces this with authoritative time).
- **Known limitation — retreat:** in this single-player build, retreat is a live mid-battle button. The backend spec redesigns it as a "commit window" recall because networked combat resolves server-side (see spec §5.5). Don't port the live-button behavior to a server.
- **Save portability:** progress is per-browser (localStorage). No cross-device sync — that needs the backend.

---

## 9. How to extend (common tasks)

- **Add a unit:** add an entry to `T`, append its key to `TORDER`, set `req` (barracks level) or `academy`. Rendering, training, raiding, and combat pick it up automatically.
- **Add a building:** add to `B`, append to `BORDER`, add the level field to `makeVillage(...).b`, and give it an effect (production/cap/pop/combat) where those are computed.
- **Add a tab:** add a `<section id="tab-x">`, a nav `<button data-tab="x">`, a `render` function, and wire it into `render()`/`switchTab()`.
- **Retune balance:** edit `T`/`B`/curve fns/`SPEED`. Use the sandbox's speed multipliers to fast-forward while testing.

---

## 10. Deploy (the user wants this hosted)

**Constraint discovered:** this sandbox's outbound network is allowlisted and **blocks Netlify** (`api.netlify.com` and `app.netlify.com` both refuse — 403 CONNECT), Vercel, Surge, and Cloudflare. **GitHub IS reachable** (`api.github.com` → 200). So from this environment:

- **Netlify direct push is impossible** (network-blocked). Don't retry it.
- **GitHub Pages is viable** *if the user provides a GitHub personal access token* (classic, `repo` scope). Flow via `api.github.com`: `POST /user/repos` (public) → `PUT /repos/{owner}/{repo}/contents/index.html` (base64 the HTML) → `POST /repos/{owner}/{repo}/pages` (source = main branch) → poll until `https://{owner}.github.io/{repo}/` is live (~30–60s).
- **DIY (no token):** user drags the HTML onto **app.netlify.com/drop** from a browser → instant URL. Simplest if they'd rather not share a token.

It's a single static file, so any static host works; there is nothing to build.

---

## 11. Roadmap / suggested next work

Ordered by value. Pick up wherever the user directs.

1. **Prototype polish (client, quick wins):** in-game tutorial/first-hour quest chain, sound, richer map (bigger world, zoom), an AI that actually defends camps and expands, balance passes using the sandbox.
2. **Persistence upgrade:** export/import save as a code/file for cross-device (still client-only).
3. **Multiplayer backend (the big one):** implement from `KingsAge_Reforged_Backend_Spec.md`. Start at **M0/M1** (auth + one world + lazy-economy service). The spec's §13 migration table maps every current client function to its server equivalent. Two non-negotiables from the spec: the server is the only authority, and the world advances via a durable queue of scheduled, deterministic commands.

---

## 12. What "done" looked like at handoff

The game is feature-complete for single-player and tested (no console errors, mobile viewport): economy, build/train queues, scouting with fog-of-war, watchable attack **and** defense battles with retreat, loyalty-based conquest, multiple villages with switching, reinforcements between villages, a rival lord that raids you, a win condition (defeat Warlord Kaas), realm score, a sandbox cheat panel (God mode + 100× speeds + instant tools), and localStorage save/resume. The multiplayer server is spec'd but not built. Continue from here.
