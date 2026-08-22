# Battles Slice B — "attend the battle" — Kingsmarch working title

> Spec authority: `docs/superpowers/specs/2026-08-20-roblox-world-is-the-game-design.md` §5.
> Predecessor: `2026-08-21-roblox-battles-slice-a.md` (the attack round-trip), executed.

**Goal:** the fight becomes a place you can stand in. An army at the walls can
be joined, watched, and commanded — a couple of hundred bodies on the field,
squads that move where you send them, and an ending that is exactly what the
world server computed. A battle you missed replays from the same seed.

## The gate this slice was held behind, and what changed

Slice A deliberately stopped short of the 3D fight because the 200-troop spike
has **still never been measured on a phone**, and the handoff calls that
measurement the gate on "the battle slice's fidelity assumptions". Adam asked
for slice B anyway, with the measurement still missing. That is his call and
this is built to it — but the missing number is handled, not ignored:

- **The budget is adaptive.** `BattleConfig` starts at `MAX_SOLDIERS = 200`,
  samples its own frame time every two seconds, and culls rendered bodies by
  `CULL_STEP` until it holds `TARGET_FPS`, never below `MIN_SOLDIERS`. A phone
  that cannot carry 200 quietly carries what it can instead of stuttering.
- **Nothing rendered can change an outcome.** The maths is Gate D on the world
  server and arrives finished. Culling changes the picture only. This is what
  makes shipping before the measurement safe rather than reckless.
- **When the measurement happens it is a config change, not a rebuild:** set
  `MAX_SOLDIERS`, confirm `MIN_SOLDIERS` is survivable, done.

## Design

### The movie is client-side and decides nothing

`roblox/src/client/BattleScene.luau` is a **client** module. Nothing it builds
is replicated, so two hundred soldiers cost the network nothing, and every
client seeds its own randomness from `battle.seed` — so everyone watching sees
the same fight with no syncing at all. It inherits the three rules the spike
proved: no Humanoids, six anchored parts per soldier, one
`workspace:BulkMoveTo` per frame for the whole field.

### Two phases, split exactly where the maths is

- While the battle is **open**, nobody dies. The armies form up, advance, and
  fight. Nothing has been decided, so the scene must not pretend otherwise.
- The moment it is **resolved** or **retreated**, the outcome exists: each side
  fells the same share of bodies that the outcome killed of real units, in the
  seeded roster order, and the loser routs off the field.

That split is the honest reading of spec §5's "the math and the movie are
separate", and it makes the live view and the replay literally the same code.

### Squads

Three orderable squads — **vanguard, archers, riders** — because those ARE the
world server's `CommandSquadId` values; a fourth name here would be an order
the realm refuses. Each splits into up to `BLOCKS_PER_SQUAD` blocks on the
field, which is what puts a dozen-odd moving formations on screen while keeping
the command vocabulary honest. Troop types map to squads in `BattleConfig`;
anything unlisted marches with the vanguard so a new troop can never fall off
the field.

### Commands the Roblox layer gains

`battleOpen`, `battleOrder`, `battleResolve`, `battleRetreat` in
`CommandService`, all through the existing idempotent envelope. Battle commands
act on a battle rather than a village, so the village-ownership guard is scoped
to the kinds that leave a village. Order sequence numbers are counted locally
(the snapshot can be a heartbeat stale) and corrected from the realm's own
refusal, which names the number it wants.

## The defect this slice had to fix first

**Attending was impossible in any world where time moves.**

`battle.open` required the scout report's `targetVillageVersion` to equal the
village's current `state_version`. But `accrueVillage` bumps `state_version`
every time a village earns a single log of wood — so a report went "stale"
within minutes of being written no matter what the defender did. An attacker
who showed up would be refused; an attacker who did not show up still got their
battle fought by the slice-A deadline. Exactly backwards from "showing up
matters" (spec §5). Frozen-clock tests hid it completely, because nothing
accrues when time does not move.

**Fixed** by `intelIsCurrent`: the player must hold the report they claim (its
version is the receipt), and what that report actually promised — the garrison
and the wall an attack is planned around — must still be true. Resources earned
in the meantime change nothing an attacker planned for, and loot is taken from
whatever is in the barn when the fight ends anyway.

## What gets built

1. `shared/BattleConfig.luau` — the fidelity budget, adaptive thresholds, squad
   definitions, field geometry, order-space mapping.
2. `shared/Config.luau` — `TILE_STUDS` and `WALL_HALF` move here so the scene
   forms up on the same ground `SettlementBuilder` placed the village on.
3. `client/BattleScene.luau` — build, tick, order, resolve, tear down.
4. `client/init.client.luau` — the battle call banner, the battle panel (squad
   buttons, charge, fall back, leave), tap-to-order via a ground-plane
   intersection, and a **Watch it play out** button on every battle report.
5. `server/CommandService.luau` — the four battle commands.
6. `server/src/store.ts` — `intelIsCurrent`; `BattleSessionState` gains
   `attackerArmy`, `defenderArmy` and `acceptedOrders`, without which a client
   cannot draw a battle that has not been decided yet.
7. `demo/DemoTour.client.luau` — the tour now attends: opens the battle, takes
   the field, issues three real squad orders, calls the charge, and watches the
   ending. One press of Play carries slice B on camera.

## Verification

`npm run test:core` 19/19, `npm run test:roblox-layer` 29/29 (6 new in
`server/test/roblox-attend.test.ts`), `npm run test:gate-d` 43/43, all four gate
checkers, `rojo build` clean. ⚠️ `npm run check:luau` still cannot run — Lune is
not installed on this PC.

Studio drills: `docs/superpowers/drills-battle-scene.md`.

## Out of scope, and named so nobody thinks it shipped

**Conquest and the celebration.** Taking a village — noblemen, loyalty, a
settlement changing hands, and the big skippable spectacle spec §5 asks for —
is slice C. Nothing here transfers ownership.

Also still open: the phone measurement itself (`spike-200-troops.md` does not
exist), the VPS deploy, and the art pass.
