# 01 — Project and Design Context

## Player fantasy

You are a lord of a single settlement in a persistent medieval world. You walk
your own streets, order your own buildings, raise your own army, and take
territory from other players one settlement at a time. The long game is
world domination; the short game is the walk from your gate to your barracks.

## "The World Is the Game" — LOCKED

The promise is that the world is not a menu. Every important building is a real
place you walk to. The strategy layer (the war table) is a convenience *inside*
the world, not a replacement for it.

## Target audience and maturity — LOCKED

Teen medieval war, approximately **13+, Moderate-leaning**. The tone may be
gritty and weighty. **No gore.** Casualties are represented by soldiers falling
and routing, never by injury detail.

## Core gameplay loop — CURRENTLY IMPLEMENTED

1. Found a kingdom (a seat is claimed on the shared world server).
2. Queue construction; resources accrue on a timer whether or not you are online.
3. Train troops at the Barracks.
4. Scout a neighbouring settlement from the war table.
5. Attack it. Battles resolve on the server whether you attend or not.
6. Press a claim with Counts across multiple attacks until the settlement changes
   hands.

## Walkable world and war table

- The settlement is walkable from spawn. **CURRENTLY IMPLEMENTED.**
- The war table is a physical object inside the settlement with a
  ProximityPrompt. Activating it swaps to an overhead camera and opens a panel
  with three tabs: Village, War, Map. **CURRENTLY IMPLEMENTED.**

## Region-world structure — CURRENTLY IMPLEMENTED

One Roblox server renders a region containing **10 settlements**: 6 player-seat
capitals and 4 Freeholds (abandoned settlements). Between them is deterministic
wilderness — a tiled ground plane and ~1,850 trees. Settlements are placed on a
50×50 tile grid at 220 studs per tile, with a guaranteed minimum separation of
8 tiles (1,760 studs).

## Battle presentation

- Outcomes are decided by deterministic server-side combat. **CURRENTLY
  IMPLEMENTED.**
- Roblox renders the fight. **CURRENTLY IMPLEMENTED** as `BattleScene.luau`:
  overhead camera, two armies of anchored primitive bodies, three orderable
  squads, Charge / Fall back, and a same-seed replay.
- **The battle scene decides nothing.** While a battle is open nobody dies; the
  server resolves it and the scene then fells the same share of bodies.

## Current slice and later slices

| Slice | Status |
|---|---|
| Walkable grey-box settlement + war table + live economy loop | **CURRENTLY IMPLEMENTED** |
| Region world with wilderness | **CURRENTLY IMPLEMENTED** |
| Scouting, battles, battle scene, conquest | **CURRENTLY IMPLEMENTED** |
| Real KingsAge combat migration (6 slices) | **CURRENTLY IMPLEMENTED** |
| Horses / first profession | **CURRENTLY IMPLEMENTED** (server + core; no trade) |
| Market and player trade | **TARGETED BUT NOT BUILT** |
| Production battle art | **TARGETED BUT NOT BUILT** |
| Empire UI (multi-settlement) | **TARGETED BUT NOT BUILT** |
| Final art | **TARGETED BUT NOT BUILT** |

## Technical constraints that materially affect visuals

1. **The Roblox client is a window, not an authority.** All state comes from an
   external Node/TypeScript world server over HTTP. The client renders what a
   snapshot says and may not invent state.
2. **Geometry is generated at runtime in Luau from primitives.** There are no
   imported meshes anywhere in the project. Every building, wall, tree and
   soldier is `Instance.new("Part")` with a `Color3` and an `Enum.Material`.
3. **StreamingEnabled is on** (`MinRadius 512`, `TargetRadius 2048`). Distant
   settlements are ~2,300+ studs away and will stream out.
4. **Battle bodies must be cheap.** Six anchored parts per soldier, no Humanoids,
   one `workspace:BulkMoveTo` per frame.
5. **Phone is a first-class target.** No phone measurement has ever been taken.

## The 17 locked decisions

Recorded verbatim in `12-LOCKED-DECISIONS-AND-OPEN-QUESTIONS.md`.

## Decisions that have been explicitly overridden

These matter to an auditor because the code still contains their fossils:

1. **Recruitment across four buildings → one.** Adam: *"They all need to be
   trained in 1 place... The barracks is always where troops are trained."*
2. **Kingdoms starting with a free army → starting with nothing.** Adam: *"I
   should start with no troops if I'm starting the game from beginning to
   finish."*
3. **Buildings growing taller with level → growing wider.** Adam: *"that's
   retarded to build them tall."*
4. **Villagers/NPC crowd → removed entirely.** Adam: *"I never said anything
   about villagers."* They were never requested; the agent inferred them.
5. **Floating building labels → removed → reinstated small.** Both instructions
   were correct; the fault was label *size*, not naming.
6. **Auto-planning villages → player-ordered queue.** Adam: *"you still have to
   que it. it does not que itself... that way you can build it how you want to."*

## Unresolved implementation questions

See `12-LOCKED-DECISIONS-AND-OPEN-QUESTIONS.md`. The largest is the **night
bonus** (a fixed server-time window versus a per-player window), which is built
to default to the source game's behaviour precisely so the decision remains open.


## Status vocabulary used throughout this package

Every claim in this package carries one of these tags. They are not decorative;
an auditor should treat an untagged claim as an error in this document.

| Tag | Meaning |
|---|---|
| **CURRENTLY IMPLEMENTED** | Exists in the build at this commit and runs. |
| **FUNCTIONAL BUT PLACEHOLDER** | Works, but the visuals/copy are stand-ins. |
| **GREY-BOX** | Deliberately untextured primitive geometry standing in for art. |
| **TARGETED BUT NOT BUILT** | Named in an approved design doc; no code exists. |
| **EXPERIMENTAL** | Built to answer a question, not to ship. |
| **LOCKED** | A decision Adam has made that is not open for redesign. |
| **PROPOSED** | Written down, awaiting Adam's ruling. |
| **UNKNOWN** | Nobody has measured or checked it. Say so rather than guess. |
