# Gate A — Online-World Foundation Result

**Completed locally:** 2026-08-16

**Roadmap gate:** Days 1–3, Foundation and contracts

**Release state:** local only; not pushed or deployed

## Outcome

Gate A is complete. KingSage now has a versioned shared contract that the client, future server and automated tests can build against without treating the browser as the source of truth.

The existing mobile combat implementation remains in place. Scout and Plan were extracted from the large prototype into owned game modules, while the original `index.html` strategy simulation remains byte-for-byte untouched by this gate.

## Delivered

- `packages/game-core/src/contracts.ts` — world, kingdom, village, building, army, troop-level, battle-plan, command and event contracts.
- `packages/game-core/src/fixture.ts` — deterministic 50×50 fixture with two human kingdoms and four clearly labeled AI kingdoms.
- `packages/game-core/test/contracts.test.ts` — deterministic fixture, versioned command, coordinate, troop-level and War Victory Point tests.
- `server/db/migrations/0001_gate_a_world.sql` — authoritative Postgres schema for worlds, players, kingdoms, villages, buildings, armies, troop research, queues, marches, battles, alliances, chat, arena scores, conquest records, idempotent commands and ordered events.
- `server/contracts/command-protocol.md` — transactional command, reconnect and deterministic battle protocol.
- `mobile-rebuild/src/game/prototype-data.ts` — shared campaign data and pure planning-score rules.
- `mobile-rebuild/src/game/CampaignSetup.tsx` — mobile Scout and Plan screens behind a stable callback boundary.
- `scripts/check-gate-a.mjs` — static architecture guard for the gate.
- Root `package.json` — one-command Gate A verification.

## Progression decisions now frozen in the contract

- A new kingdom begins with a level-1 Barracks and basic level-1 troops.
- Stable, Workshop, Smithy, Academy and Market provide the later progression ladder.
- Each troop family has a kingdom-wide level from 1–10.
- Conquering a village awards War Victory Points based on development, defenses, capital status and the relative strength of the target.
- Repeated ownership swapping cannot repeatedly score the same conqueror/village pair.
- War Victory Points feed world standings and seasonal global arena rank.
- Global, world and alliance chat messages carry server-derived kingdom and arena identity; the browser cannot claim its own rank.

## Verification

Passed locally:

- `npm run test:gate-a`
- five shared-core tests
- protected mobile runtime integrity check across 28 files
- TypeScript compilation and Vite production build
- Gate A architecture/schema checker
- `git diff --check`
- `index.html` has no Gate A diff

The build still reports the existing large Phaser chunk warning. That is a performance task, not a Gate A correctness failure.

Not yet verified:

- The Postgres migration has not been applied because Gate B has not selected or started the online runtime.
- Two-session persistence, authentication, WebSockets and reconnect recovery belong to Gate B.
- A new live browser regression could not run after the previously running local preview stopped serving. No development server was restarted without Adam's instruction.

## Next move

Gate B should implement one authoritative persistent world from these frozen contracts: account creation, world entry, permanent kingdom placement, ordered commands, reconnect recovery and clearly labeled AI seats. The acceptance test is two independent browser sessions seeing the same world and surviving both client and server restarts.
