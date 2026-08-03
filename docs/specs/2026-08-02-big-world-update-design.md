# KingsAge Reforged — Big World Update (Design Spec)

*Approved by Adam 2026-08-02. This is the design for the next major version of the
single-file prototype (`index.html`). It turns the 15×15 single-rival sandbox into a
living, multi-kingdom world — the single-player proving ground for the eventual
real-multiplayer game, where every AI kingdom seat is taken by a real player.*

---

## Vision & scope

- **Long-term goal:** a complete game thousands of people play. Kingdoms are
  player-created, alliances are between real humans, and multiple worlds run at once —
  when a world is won, a new one opens.
- **This build:** the exact same world and rules, with **AI stand-ins in the player
  seats**. Everything built here (terrain, map UI, kingdom behavior, alliances, victory,
  world cycle) carries forward unchanged to the server version; only "who controls a
  kingdom" changes.
- **Form factor unchanged:** one self-contained HTML file, vanilla JS, no dependencies,
  mobile-first (390px), all state in the global `S` object.

## 1. The world (terrain generation)

- **50×50 tile continent** generated from the seeded PRNG (`rnd()`), so worlds are
  reproducible per seed.
- Must **look like real geography**: ocean surrounding a continent, coastlines, mountain
  ranges, forests, lakes/rivers, plains. Value-noise heightmap + moisture pass,
  implemented inline (no libraries).
- **Terrain has light gameplay effects:**
  - Water and mountain peaks: impassable — cannot be targeted or built on; march travel
    cost routes around/over-penalizes them (simple cost adjustment, not full pathfinding).
  - Forest: slightly slower marches, small defender bonus.
  - Plains: fastest movement.
- Villages/camps only spawn on buildable land → kingdoms cluster in valleys and coasts,
  which is what makes the map read as a world.
- The playable world can effectively **grow as it's conquered** — starting kingdoms
  occupy part of the continent; expansion pushes into unsettled land.

## 2. The map screen

- **Pan/drag** navigation (touch drag on phone), **zoom** (pinch + buttons).
- **Mini-map** overlay showing the whole continent with kingdom-colored territory;
  tap to jump the viewport.
- **Viewport rendering:** only the visible chunk of tiles is fully rendered/updated so a
  50×50 world stays smooth on a phone. `renderMap()` stays on-demand; march tokens keep
  animating via `renderMarchTokens()`.
- Existing tile interactions (tap → scout / raid / reinforce / village menu) unchanged.

## 3. Living AI kingdoms

- **~15 starting kingdoms** (a starting population, not a cap — the real game's count is
  however many players join). Each has a name, color, capital, and villages.
- Kingdoms **actually play the game** on the same rules/curves as the player:
  - Economies grow; they upgrade and train on the same cost/time tables.
  - They **expand**: found/conquer new villages into unsettled land.
  - They **raid each other**; winners absorb losers over time, so borders shift on the
    mini-map and mid-game produces a few large kingdoms instead of 15 small ones.
  - They treat the player as just another kingdom: scout/raid decisions are based on
    relative strength; weak neighbors avoid provoking the strong.
- **Warlord Kaas** becomes one aggressive kingdom among many (flavor retained).
- AI runs inside the same `tick()` loop, driven by the same state shapes — deliberately
  the same structure a future authoritative server would run.

## 4. Alliances

- **AI↔AI:** kingdoms form pacts; blocs are visible on the mini-map (shared-hue borders
  or badge). Allies don't raid each other and may send support when one is attacked.
- **Player↔AI:** the player can propose an alliance to a neighbor (acceptance based on
  relative strength/history); allies don't raid each other and send help when one is
  attacked. Player can break an alliance (reputation/aggro consequence kept simple).
- Alliance rules written here are the ones real players will use later.

## 5. Victory & the world cycle

- New **Realm standings** view: every kingdom's share of the world (territory %).
- **Win = 40% world control, or all rival capitals fallen.** Victory screen; player may
  keep playing to paint the map.
- **"Found a New World"** on victory: generates a brand-new continent (fresh seed, fresh
  kingdoms). The finished world is recorded in a **Hall of Legends** (world name/seed,
  days to win, final stats) — a per-player legacy across worlds.
- Losing: unchanged from today — rivals farm you but do not eliminate you (YAGNI).
- Server-version mapping: multiple live worlds players choose from; a world closes when
  won and new worlds open. Same rule, real people.

## 6. Persistence & migration safety

- Save format bumps to **v2** (`kingsage_reforged_save_v2`). Old v1 saves are not
  migrated — a fresh world is generated (prototype-acceptable).
- Hall of Legends persists across worlds in the save.
- All state remains in `S`; no un-serializable state in the DOM.

## 7. Testing

- Drive the file in a browser at **390×844**, assert **zero page errors**.
- Screenshot-verify: terrain looks like a continent, mini-map, pan/zoom, a
  borders-shift time-lapse (let AI kingdoms run at high speed), an alliance forming,
  and the victory → new-world flow.
- Sandbox/cheat panel must keep working (it's the testing surface) — extend it with
  world tools where useful (e.g. fast-forward world, reveal all, force victory).

## 8. Presentation direction — "KingsAge meets Clash of Clans / Boom Beach"

Adam's art/feel target (added mid-design): the game should look and feel like a modern
mobile builder, not a menu app.

- **Visual village scene (Phase 2):** you *see* your village — buildings placed on
  terrain that visually grow with level, tap a building to upgrade, troops/villagers
  ambient-animate. CoC-style **layout editing**: where you place walls and defensive
  structures matters when you're attacked; defense battles are staged on your own
  village scene. (Boom Beach maps to what Phase 1 builds: marching out from your base
  across a big world map.)
- **Game-feel polish everywhere:** juicy buttons, animated numbers, transitions.
- **Mechanics line:** adopt CoC/Boom Beach's *great mechanics* — layout-defense,
  watchable staged attacks, satisfying progression — but explicitly **NOT random
  matchmaking**: every target is found on the world map. Opponents are persistent
  kingdoms at fixed locations you scout, pick, and can return to. Also skip the
  shields/gems/timers monetization loop. Army marches, raids, and loyalty conquest
  stay the KingsAge identity.
- **Possible 3D future:** because all rules live in `S` and the DOM is a projection of
  it, the renderer can later be swapped (e.g. WebGL/3D) without rewriting game logic.
  Keep that separation strict.

## Build phasing

1. **Phase 1 — The World (this spec's §1–7):** terrain continent, pan/zoom + mini-map,
   living kingdoms, alliances, victory + world cycle. Build now.
2. **Phase 2 — The Village (§8):** visual village scene, layout editing,
   staged defense battles, polish pass.
3. **Phase 3 — Beyond:** deeper mechanics, possible 3D renderer, then the
   real-multiplayer backend (separate spec, to be rewritten — original was lost).

## Out of scope (Phase 1)

- Real accounts, server, networking (that's the backend project).
- Player elimination / capital loss.
- Full pathfinding around terrain (cost model only).
- Diplomacy beyond alliances (trade, NAPs, messaging).
- Visual village scene / layout defense (Phase 2).
- 3D rendering (future option only).
