# Gate B — First Persistent Shared World Result

**Completed locally:** 2026-08-16

**Roadmap gate:** Days 4–7, First real shared world

**Release state:** local only; not pushed or deployed

## Outcome

Gate B is complete locally. Two authenticated accounts can hold different permanent kingdom seats in the same deterministic world, observe the same ordered state, receive committed events and reconnect after the database and service are closed and reopened.

The phone client is now one connected experience rather than an isolated map. Its permanent navigation reaches World, Village, Army, War and Chat. War opens the existing Scout → Plan → live Outer Wall Battle flow and provides a return path to the shared world.

## Delivered

- Salted `scrypt` password hashes and opaque HTTP-only cookie sessions.
- Permanent human kingdom claims; all unclaimed seats stay clearly labeled AI.
- Durable local SQLite adapter behind the frozen canonical Postgres contract.
- Authoritative shared snapshots, expected-world-version conflicts and globally idempotent command IDs.
- Server-timed Barracks construction with resource deduction, committed events and restart recovery.
- Authenticated event replay plus a live Server-Sent Events reconnect stream.
- Functional world chat with server-derived kingdom name and arena tier.
- Connected phone navigation:
  - **World:** geographic 50×50 map and permanent human/AI targets.
  - **Village:** resources, full building ladder and Barracks construction.
  - **Army:** troop counts, roles and kingdom-wide levels.
  - **War:** Scout → Plan → Battle → Retreat/return.
  - **Chat:** live shared world channel.

## Acceptance evidence

- `npm run test:gate-b` passes.
- Five shared-core tests pass.
- Seven world-server tests pass, including two isolated cookie sessions, unique names, idempotent build commands, server-derived chat identity, timed jobs and database close/reopen persistence.
- Protected mobile runtime integrity passes across all 28 locked files.
- TypeScript and the production mobile build pass.
- Browser QA passed World → Village → Army → Chat send → War → inspect all four defenses → Plan → live Outer Wall Battle → Retreat → Scout → shared world.
- Fresh browser console error check returned zero errors.
- Adam's first phone run proved account claim, two human seats, AI labels, correct level-scaled Barracks costs and server-timed persistence. It also exposed the missing navigation; that build was correctly rejected and the connected shell above replaced it.
- The original `index.html` blob is unchanged from `HEAD`.

The existing Phaser chunk still triggers Vite's greater-than-500-kB warning. This is a known performance task, not a Gate B correctness failure.

## Local database decision

This PC has no Postgres or Docker service. Gate B therefore uses Node's built-in SQLite adapter for local proof and automated restart testing without opening a cloud account. `server/db/migrations/0001_gate_a_world.sql` remains the production Postgres schema. Moving the store to hosted Postgres is a deployment/runtime task and does not permit weakening the shared command contract.

## Known boundaries

- Nothing is hosted; the current service is reachable only through the local Codex preview.
- The acceptance fixture contains six kingdom seats. Larger world capacity and player-controlled world selection still need the hosted runtime.
- Gate C owns full construction/recruitment queues, production accrual, visual placement and troop research effects.
- Gate D owns authoritative marches and server-replayed battle casualties; the connected Outer Wall is still the existing client battle prototype.
- Chat currently implements the world channel. Global moderation and alliance chat remain in the social gate.
- The older 4174 test process was not force-stopped because Adam's open tabs were actively connected. The corrected build was verified separately; replacing that running process still requires an explicit restart approval.

## Next move

Gate C turns the persistent foundation into the full build-and-grow game: visual village placement, all building prerequisites, resource production/storage, construction and recruitment queues, troop research levels 1–10, defenses and notification recovery.
