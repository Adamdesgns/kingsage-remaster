# Scouting Slice ("slice three") Implementation Plan — Kingsmarch working title

> Spec authority: `docs/superpowers/specs/2026-08-20-roblox-world-is-the-game-design.md`
> (deterministic scout → plan → battle → return warfare).
> Predecessors: `2026-08-21-roblox-slice-one.md`, `2026-08-21-roblox-region-slice.md` — both executed.

**Goal:** You can walk to your war table, pick one of the fog silhouettes you
can see across the wilderness, send real scouts at it, watch them travel on a
countdown, and read back what they found — the only way in the game to learn a
foreign village's strength.

**Architecture:** Roblox-side only. The world server already implements the
entire scout path and needs no changes:

- `march.launch` with `kind: "scout"` (validated: scouts only, foreign target,
  troops actually present, deducted from the departure village).
- `materializeDueMarches` writes a `ScoutReportState` on arrival, flips the
  march to `returning`, and inserts a `scout` notification.
- `getSnapshot` already fogs every foreign village — `resources` zeroed,
  `buildings` all zero, `army` empty — for the requesting kingdom.
  **Verified by reading `server/src/store.ts` before writing any of this:**
  there is no intel leak to close, and therefore the scout report is genuinely
  the only source of a neighbour's real numbers.
- `snapshot.marches` and `snapshot.scoutReports` are already in the payload the
  Roblox server receives and pushes to the client.

So this slice is: **new player-facing verbs and views over data already in hand.**

## The fog rule this slice must not break

The client already receives fogged foreign villages. Nothing here may infer or
display a foreign level, resource or troop count from anything other than a
scout report the player earned. The report carries its own `createdAt` and the
`targetVillageVersion` it was taken at — old intel is shown with its age, never
silently refreshed.

## What gets built

1. **Shared (`src/shared/Buildings.luau`)**
   - `TROOP_ORDER` (mirrors game-core's order) so reports list troops the same
     way everywhere.
   - `SCOUT_PRESET` — troop/quantity/label bound together, same discipline as
     `RECRUIT_PRESET`: the button cannot lie about what it dispatches.

2. **`src/server/CommandService.luau`**
   - `kind = "scout"` request → `march.launch` command. Fingerprint
     `scout:<from>:<target>:<qty>` so all four existing double-tap layers cover
     it unchanged.
   - Pre-flight refusals that are honest and local (no wasted round trip):
     target must be a village in the snapshot, must not be ours, and the
     departure village must actually hold that many scouts. Anything else is
     the world server's call, and its message is what the player sees.
   - `kind = "recruit"` gains an explicit troop allow-list (it already accepted
     a troop string from the client; now it validates it).

3. **`src/client/init.client.luau`** — the war table grows two tabs.
   - **Village** — the existing build rows + recruit preset, unchanged.
   - **War** — three stacked sections:
     - *Send scouts*: every foreign village in the snapshot, with its owning
       kingdom and map distance, and a Send button. Header shows scouts on
       hand; at zero it says so and offers the scout recruit preset instead.
     - *On the march*: `snapshot.marches` with live countdowns to `arrivesAt`
       (display-only, server clock, same ticker discipline as the HUD queues).
     - *Scout reports*: newest first, each showing target, kingdom, observed
       army (non-zero troops only), resources, Rampart/HQ levels, and age.
   - A toast fires once when a report id the client has not seen before appears.

4. **`server/test/roblox-scouting.test.ts`** — the whole loop through the real
   `/api/roblox/*` routes, not the store directly:
   - scout march accepted, departure village's scouts decrement;
   - on arrival the report shows the target's REAL army while the same
     snapshot's `world.villages` entry for it is still fogged to zeros;
   - a replayed `commandId` does not send a second wave;
   - scouts you do not have are refused;
   - `attack` without a report is still refused `SCOUT_REQUIRED`.

5. **`roblox/scripts/evidence-run.luau`** — assert the war-table surface exists
   and that no foreign village model carries level information, plus the
   by-hand scouting drill printed for whoever is at the keyboard.

## Verification

- `npm run test:roblox-layer` and `npm run test:gate-d` green.
- ⚠️ `npm run check:luau` needs Lune, which is **not installed on this PC**
  (checked: no `lune`, no rokit/aftman, only `rojo` from winget). The Luau
  syntax gate therefore cannot run locally and this slice's Luau is
  hand-checked only until Lune is installed or Studio parses it. Say so in the
  handoff rather than implying a gate ran.
- In Studio, by hand: send scouts at a neighbour, watch the countdown, read the
  report, confirm the numbers match what the world server shows.

## Out of scope (next rungs)

Attack marches and the battle slice; the 200-troop phone measurement; a
world-side scouting verb (a scout hut you walk to) rather than a table button.
