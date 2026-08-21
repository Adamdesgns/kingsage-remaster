# Region Slice ("slice two") Implementation Plan — Kingsmarch working title

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.
> Spec authority: `docs/superpowers/specs/2026-08-20-roblox-world-is-the-game-design.md` §4 (region world).

**Goal:** The world's OTHER settlements become real places: every village in the
snapshot renders at its map-derived position with walkable wilderness between
them — walk out your gate, cross the forest, stand at a neighbor's walls.
Foreign settlements are fog-of-war silhouettes (no levels, no prompts).

**Architecture:** Pure Roblox-side rendering change; the world server already
sends every village (with foreign buildings/resources zeroed by fog) in the
snapshot. No new endpoints, no HTTP changes, no server-side work.

## Global Constraints (inherited from slice one — all still binding)

- Never ship the name "KingsAge"; "Kingsmarch" is the provisional working title.
- No authority on Roblox; display only ever renders confirmed server state.
- Foreign fog: a player must never learn a foreign village's levels/resources
  from the world render (the server zeroes them; the renderer must not imply).
- Mobile baseline; StreamingEnabled carries the region scale.

## Design (locks the altitude finding from the review)

1. **Map-derived positions replace session slots.** Village world position =
   `(village.x * TILE, 0, village.y * TILE)` with `TILE = 220` studs (50×50
   grid → ~11k-stud region; streaming handles it). Positions are now durable
   world facts — the review's "settlement positions are session artifacts"
   finding dies here.
2. **Render every village in the snapshot, keyed by villageId** (not by
   player): the world fixture always has 6 villages, so even a solo player
   immediately has neighbors to walk to.
   - **Own villages** (kingdomId == player's): full detail — 13 buildings,
     prompts, war table, gate spawn + RespawnLocation (existing renderer).
   - **Foreign villages:** silhouette shell — ground, wall ring, gate gap, one
     generic keep massing (fixed size, NO level information), name post
     showing village name + owning kingdom's name and color. No prompts, no
     spawn, nothing interactable.
   - Owner-online wins: a village renders full while its owner is in this
     Roblox server, shell otherwise (downgrade on PlayerRemoving).
3. **Wilderness:** one large grass plane spanning the region bounds (+200-stud
   margin) at y=-2 under everything, plus deterministic tree blocks (simple
   green-on-brown two-part trees) scattered by a hash of grid coordinates —
   no randomness at runtime (deterministic re-render), no Humanoids, cheap
   parts, CastShadow off.
4. **Unchanged:** WorldSession, CommandService, WarTable (binds to own
   settlement), HUD, demo tour, spike.

## Files

- Rewrite: `roblox/src/server/SettlementBuilder.luau` (village-keyed registry,
  TILE positioning, foreign shell renderer, wilderness)
- Modify: `roblox/src/server/init.server.luau` (feed full snapshots)
- Modify: `roblox/scripts/evidence-run.luau` (region checks below)
- Modify: `roblox/README.md` + `docs/superpowers/drills-slice-one.md` pointer

## Done-criteria / verification

1. Syntax gate (`npm run check:luau`) + `rojo build` both projects green.
2. Evidence-run additions: settlement count equals snapshot village count;
   every foreign settlement has zero ProximityPrompts and no building models
   with a Level attribute > 0 visible; own settlement retains 13 + prompts;
   all settlements sit at `(x*220, y*220)` per their snapshot coords.
3. Studio drill (queued for Adam / granted session): walk from own gate to a
   neighbor's gate across wilderness; confirm the neighbor shows name + walls
   but no levels or prompts; rejoin → identical positions.
