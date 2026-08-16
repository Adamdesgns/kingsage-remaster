# Gate D player warfare result — 2026-08-16

## Outcome

The selected foreign village now drives one persistent player-warfare loop from the shared map through scouting, planning, travel, live squad orders, server-resolved combat and the survivors' return. The work is local only; nothing was pushed or deployed and the original root remaster remains untouched.

## Player-facing loop

- A player taps a foreign village on the 50 × 50 map and chooses **Scout this village**. The War button uses the selected foreign village, or the nearest available foreign target when the capital is selected.
- Foreign garrison, wall and resources stay hidden on the world snapshot until an actual scout arrives.
- One real Scout leaves the home army, travels on server time, produces a stored report, and then returns home.
- The report names the target kingdom and village and reveals the observed wall, troop families, garrison total and resources before attack planning unlocks.
- The four-part plan still controls entry, formation, time and attack style. Its quality now affects the authoritative battle calculation.
- Beginning the assault removes the chosen combat army from the village, creates a stored march and waits for its server arrival before the Phaser battlefield opens.
- Tapping a squad and then a battlefield position stores ordered, sequenced field commands. Retreat is a real server command and costs troops according to time under fire.
- Victory, defeat and retreat all produce stored casualty lists. Victories take carry-limited loot and award War Victory Points.
- Survivors and loot remain unavailable while the return march is active, then merge back into the source village exactly once. The Army screen shows active march state and arrival clocks.

## Authoritative boundaries

- `packages/game-core/src/warfare.ts` owns army validation, power, plan advantage, deterministic casualties, carry capacity, loot, retreat survival and travel timing.
- `server/db/migrations/0004_gate_d_warfare.sql` stores marches, scout reports, battle sessions and ordered field commands with indexes matching active arrival and player-history reads.
- The client never submits a winner, casualty count, survivor count, loot amount or War Victory Point award.
- Troops are subtracted transactionally when a march launches and added back only after its stored return arrival.
- Battle resolution subtracts casualties from the current defender garrison so unrelated production or reinforcements are not overwritten.
- Foreign economy, construction, recruitment and research state is removed from ordinary player snapshots; scouting is the intended intelligence path.

## Verification

- `npm run test:gate-d` passes.
- Shared rules cover invalid/oversized armies, plan advantage, deterministic battle resolution and deterministic retreat.
- World-service tests cover two-account scouting, troop departure, report creation, attack arrival, ordered battle, server victory, loot, WVP, return completion and retreat losses.
- Existing authentication, persistent seats, chat, economy, build, recruitment, research and offline materialization tests remain green.
- Protected mobile runtime integrity, strict TypeScript, Vite production build and Gate A/B/C/D boundary checks pass.

## Deliberately next

- Player-edited defensive layouts remain the next warfare expansion; the schema already snapshots a layout with every scout report.
- Village conquest needs surviving Noblemen, loyalty damage, ownership transfer, capital rules and WVP scaling before it is safe to turn on.
- Battle art currently represents the first Outer Wall scene. Lower Ward and Citadel need the same authoritative session connection rather than cosmetic scene chaining.
- Default travel and balance values are alpha values and need Adam's first complete phone play-through before expanding the campaign.
