# KingSage authoritative world service

Gate A freezes the server boundary before a hosting provider or web framework is selected.

- `db/migrations/0001_gate_a_world.sql` is the PostgreSQL source of truth for persistent worlds.
- `contracts/command-protocol.md` defines authentication, idempotency, ordering, reconnects and deterministic battle validation.
- Shared command, event and state types live in `../packages/game-core` and are imported by both client and server work.

The browser never writes these tables directly. A trusted world service authenticates the player, serializes commands per world, applies game-core rules inside a transaction and publishes committed events.

Gate B selects the runtime/host and implements this boundary without changing it casually. A contract change requires a new `GAME_CONTRACT_VERSION` and migration notes.
