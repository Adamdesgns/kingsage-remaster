# KingSage authoritative world service

Gate A freezes the server boundary before a hosting provider or web framework is selected.

- `db/migrations/0001_gate_a_world.sql` is the PostgreSQL source of truth for persistent worlds.
- `contracts/command-protocol.md` defines authentication, idempotency, ordering, reconnects and deterministic battle validation.
- Shared command, event and state types live in `../packages/game-core` and are imported by both client and server work.

The browser never writes these tables directly. A trusted world service authenticates the player, serializes commands per world, applies game-core rules inside a transaction and publishes committed events.

Gate B selects the runtime/host and implements this boundary without changing it casually. A contract change requires a new `GAME_CONTRACT_VERSION` and migration notes.

## Gate B local runtime

Gate B now includes an executable zero-dependency Node service in `src/`. It uses Node's built-in SQLite adapter for the local proof because this PC has no Postgres or Docker service. The production Postgres contract in `db/migrations/0001_gate_a_world.sql` remains canonical; the SQLite migration is an adapter for local development and automated restart tests, not a silent production database change.

The local service provides salted `scrypt` password hashes, opaque HTTP-only cookie sessions, permanent seat claims, a shared snapshot, ordered/idempotent build commands, server-time construction completion, replayable world events and an authenticated Server-Sent Events stream. It also serves the built mobile client from the same origin.

After `npm --prefix mobile-rebuild run build`, run `npm run start:world` from the repository root. The shared-world entry is `http://127.0.0.1:4174/?world=shared`.
