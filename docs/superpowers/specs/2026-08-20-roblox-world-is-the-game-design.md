# KingsAge on Roblox — "The World Is the Game" (design spec)

Date: 2026-08-20. Approved section-by-section by Adam in the 2026-08-20 design
session. This spec supersedes the design half of
`docs/HANDOFF-2026-08-19-roblox.md` (its decisions are folded in here; its
workflow notes and Studio gotchas remain valid). Next step after Adam approves
this document: an implementation plan (superpowers:writing-plans). No game code
before that gate.

---

## 1. Vision

**The World Is the Game.** KingsAge returns as a persistent medieval war world
on Roblox where your kingdom is a *place*, not a menu. You walk your own
streets from day one. You rule from a war table in your keep. Your neighbors
are real settlements across real wilderness you can march through. Battles are
hundreds of soldiers fighting in front of you, decided by troop stats and your
attack plan. The long game is world domination, one settlement at a time —
strong players holding 50+ settlements, original-KingsAge scale.

The brain of the game already exists: the Gates A–D world server (shared
TypeScript contracts, versioned ordered/idempotent commands, Postgres schema,
original KingsAge economy curves, construction/recruitment/research queues,
troop levels 1–10, deterministic scout→plan→battle→return warfare, WVP).
Roblox is a brand-new 3D body on that brain. The old web client is frozen as an
archive; its 2D art does not carry over.

## 2. Platform and architecture (carried from 2026-08-19, confirmed)

1. **Roblox is the ONLY client.** The GitHub Pages web game is frozen.
2. **A paid always-on world server** (~few $/month VPS) holds all authority.
   Chosen over DataStore-only specifically so offline attacks work.
3. **Architecture A — Roblox is a window.** Every player action round-trips
   Roblox client → Roblox server script → HTTP → world server → back. The
   Roblox server script is the only HTTP speaker, holds the shared secret,
   holds no authority, and loses nothing if it dies. No local authority, no
   state cache in slice one. (Client-side caching is a later optimization only
   if feel demands it.)
4. **Roblox UserId replaces Gate B auth** (passwords/sessions retire). **Roblox
   moderated chat replaces the custom world chat** (platform requirement). The
   world server gains one new thin layer: a UserId ↔ kingdom mapping (first
   join auto-founds a settlement) plus per-request secret auth. The API remains
   the existing Gate A command/event contract — Roblox is a second consumer,
   not a new protocol.
5. **HttpService budget** (~500 req/min per Roblox server) is respected by
   batching: one state pull per heartbeat for everyone on the server, not one
   per player.

## 3. Control model: walk the streets, rule from the table

- **On foot from day one.** The player is an avatar in their settlement's
  streets. This was an explicit override of the design team's
  overhead-first recommendation; the friction cost is accepted and mitigated
  by design (short walks, war table near spawn).
- **C-hybrid:** inside the keep stands the **war table**. Standing at it lifts
  the camera into an overhead command view — queue anything, see every timer,
  later plan attacks and manage the empire. Step away and you're back on your
  boots.
- **Every building is also a real place.** Walk into the barracks to recruit,
  the builder's yard to queue an upgrade — proximity interactions at the
  building do the same commands the table does. The table is convenience; the
  world is the game.

## 4. World structure: region world

- Each Roblox server instance hosts a **region** of the world map: several
  settlements with walkable wilderness (forest, roads, river) between them.
  You can physically walk to a neighbor's gates and see their walls with your
  own eyes. (Mounts/faster travel: not discussed; not in this design.)
- Farther settlements are reached via the war table map; travel = loading a
  different region.
- Chosen over settlements-as-islands (never walking toward an enemy) and over
  one seamless landmass (streaming/server-boundary cost too high).
- **Scale:** settlements are database rows. The Gate A world fixture is 50×50
  (2,500 plots) and the schema scales beyond it. 50+ settlements per player is
  a supported requirement. Roblox only ever renders the region under your
  boots; the war table manages the rest (an empire "what needs me" UI is a
  later slice).

## 5. Battles

- **A couple hundred bot troops fighting on screen, outcome from troop stats +
  attack strategy.** Feasible on Roblox under three engineering rules:
  1. **No Humanoids for troops.** Lightweight animated models moved in bulk
     (AnimationController-style rigs, batched movement). Roblox's standard
     character brain dies at ~50–100 instances; mass-battle games render
     hundreds by skipping it.
  2. **The math and the movie are separate.** Gate D's deterministic combat
     engine on the world server is the outcome authority. The 3D battle is a
     rendering of that math; no device's frame rate ever changes a result.
  3. **Squads think, individuals perform.** ~10–20 squads make decisions
     (advance, flank, hold); individual soldiers play local theater. Player
     orders are squad orders — the Phaser prototype's tap-formation /
     tap-destination command feel, ported to 3D.
- **Both battle modes:** attacks are designed at the war table (troops,
  formations, approach lane, timing). If the attacker is online when it lands,
  they attend and command squads live. If offline, the server resolves it from
  the plan and stats, producing a watchable 3D replay. Offline attacks work;
  showing up matters.
- **Surrender mechanic:** if the defender surrenders, the attacker absorbs
  their surviving troops. The surrender condition (odds/morale threshold,
  offline auto-yield) is designed in the battles slice. Principle:
  intimidation over annihilation can pay in soldiers.
- **Conquest celebration:** every settlement capture triggers a big,
  skippable, non-blocking spectacle — banners over the keep, fireworks, army
  parade, loot shower. The quality bar: it should delight an 11-year-old's
  eyes. (Noted tension: the game is rated teen; this is a spectacle bar, not
  an audience change — revisit the rating if Adam wants 11-year-olds actually
  playing.)
- **Early de-risk:** a one-day grey-box performance spike — 200 dummy troops
  marching and swinging, measured in FPS on a mid-range phone — runs early,
  before any battle system is built on top.

## 6. Audience and content rating

**Teen medieval war (~13+, Roblox "Moderate"-leaning).** Grittier palette and
weightier combat than Blockshore; no gore (platform cap regardless).
Blockshore's kid-safe word-ban explicitly does NOT apply to this game. This
matches the original KingsAge's vibe and knowingly accepts the
younger-audience tradeoff on a young-skewing platform.

## 7. Slice one (approved scope)

**A walkable grey-box settlement + war table + the full economy loop on live
server state.**

- Join → world server maps your UserId to your kingdom (auto-founding on first
  join) → your settlement is built as grey-box 3D from your real server state
  (a level-3 barracks on the server is a level-3 grey box in the world).
- Do everything both ways: proximity interactions at buildings AND the war
  table's overhead view. Same commands underneath.
- Every action: one idempotent HTTP command; the world updates only on server
  confirmation. A slow heartbeat (~10s, batched) keeps timers honest;
  countdowns tick locally for display only, computed from server timestamps.
- Leave → nothing to save. The server counts wall-clock time.
- **Done-criteria (unchanged):** (a) a queue advances by wall-clock across a
  quit/rejoin; (b) a Roblox server restart loses nothing; (c) a double-tap
  charges once.
- **Deliberately NOT in slice one:** wilderness/neighbors, battles, art,
  empire UI, monetization. The 200-troop perf spike runs early as its own
  experiment alongside the slice.

## 8. Failure handling (approved)

One rule everywhere: **never pretend, never charge without world-server
confirmation.**

- **Unreachable at join:** a "realm is waking…" holding scene with automatic
  retries. Never render invented or stale state.
- **Command timeout:** the Roblox server retries the same commandId (safe by
  idempotency — worst case the world server answers "already did that one").
  If retries fail: "The realm didn't answer — nothing was spent," and nothing
  changes.
- **Mid-session drop:** the world stays walkable, prompts grey out, a
  reconnect banner shows; commands are blocked while disconnected; on
  reconnect one fresh pull trues everything up.
- **Roblox server crash/restart:** stateless by design; rejoin = exact
  kingdom.
- **World server restart/deploy:** timers are timestamps in Postgres, so even
  a minutes-long outage costs nobody progress.
- **Contract version mismatch:** caught by the contractVersion field on the
  first call → "The kingdom has been updated — rejoin to get the new version."
- **Bad/missing secret:** world server fails closed; players see only
  "unreachable," never why.

## 9. Testing (approved)

1. **Server rules offline:** all new rules (surrender, UserId mapping) get
   tests in the existing Gate A–D suites first — seconds to run, no Roblox.
2. **API layer via plain HTTP:** scripted requests prove bad-secret rejection,
   unknown-UserId auto-founding, and duplicate-command charges-once.
3. **In-game evidence runs** on the Blockshore harness pattern — **never via
   the Studio command bar** (it hands back second, uninitialized module copies
   and reports false failures; documented in Blockshore's
   `roblox/scripts/evidence-run.luau`). All checks via gameplay, HUD, or
   in-game admin commands.
4. **Done-criteria as drills:** written, repeatable procedures for the
   wall-clock rejoin check, the restart check, and the double-tap check.
5. **Phone reality checks:** the grey-box slice played on a real phone (join
   time, tap targets, table readability); the 200-troop spike reported in FPS
   on mid-range hardware; plus one deliberate sabotage drill — stop the world
   server mid-session and watch the honesty guarantees actually happen.

## 10. Open implementation questions (decided at planning, not silently)

- **VPS provider + deploy story** for the world server. Constraint: a few
  dollars a month, always on.
- **Secret management** for Roblox-server → API auth (likely Roblox Secrets
  store or config the repo never contains).
- **Repo layout:** recommendation is a `roblox/` dir inside kingsage-remaster
  (Blockshore's working precedent) over a new repo/place split. Not yet
  decided.
- **Monetization: none.** Never discussed, deliberately absent from this
  design.

## 11. What dies, what lives (carried forward)

- **Dies:** Gate B password/session auth; custom world chat; the Phaser battle
  scenes and mobile-rebuild client become reference material, not shipping
  code; the pre-pivot 30-day closed-alpha roadmap is source material only.
- **Lives:** the world server and everything in it — command/event protocol,
  economy rules, deterministic combat math, Postgres schema. That server IS
  the product; the point of architecture A is that Gates A–D barely change.
