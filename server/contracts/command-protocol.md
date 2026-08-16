# KingSage command and event protocol — v1

## Authority

The world service is the only authority for resources, buildings, queues, troops, marches, battle snapshots, casualties, loot, loyalty, ownership, alliances and victory. Clients render a snapshot plus committed events and may optimistically animate, but a client value never becomes true merely because the browser sent it.

The shared TypeScript source is `packages/game-core/src/contracts.ts`. Every envelope carries `contractVersion: 1`.

## Command envelope

```json
{
  "contractVersion": 1,
  "commandId": "01J...",
  "worldId": "019...",
  "actorPlayerId": "019...",
  "expectedWorldVersion": 412,
  "issuedAt": "2026-08-16T18:00:00.000Z",
  "command": {
    "type": "march.launch",
    "payload": {
      "fromVillageId": "019...",
      "targetVillageId": "019...",
      "kind": "attack",
      "army": { "spear": 20, "sword": 0, "axe": 0, "archer": 10, "scout": 0, "lightCavalry": 0, "ram": 0, "noble": 0 }
    }
  }
}
```

`actorPlayerId` is repeated in the envelope for auditing, but authentication wins. If the session player and envelope actor differ, reject the command.

## Supported Gate A commands

- `village.build.queue`
- `village.recruit.queue`
- `kingdom.research.queue`
- `march.launch`
- `battle.open`
- `battle.order`
- `battle.retreat`
- `alliance.create`
- `alliance.join`
- `alliance.leave`
- `chat.send`

Adding a command requires a shared contract type, authorization rule, deterministic transition, database transaction test and at least one emitted event.

## Transaction algorithm

For every mutating command, the service performs this exact sequence:

1. Authenticate the session and resolve its player ID.
2. Validate the JSON envelope and contract version.
3. Begin a database transaction.
4. Insert `command_inbox.command_id`. If it already exists, return its stored result without applying the command again.
5. Lock the target `worlds` row with `SELECT ... FOR UPDATE` so commands for one world are serialized.
6. Compare `expectedWorldVersion` with `worlds.version`. Reject stale commands with the current version and no partial writes.
7. Prove ownership/membership from database rows; never trust a submitted kingdom or village owner.
8. Materialize due queues and marches up to the authoritative server timestamp.
9. Apply the shared game-core transition and all invariant checks.
10. Increment `worlds.version` exactly once.
11. Append one or more `world_events` at that version with increasing `event_sequence`.
12. Store the accepted or rejected result in `command_inbox` and commit.
13. Publish committed events over the world's realtime channel after commit.

## Idempotency and conflicts

- `commandId` is globally unique and retained. Retrying the same ID returns the original response.
- A new command ID with an old `expectedWorldVersion` receives `WORLD_VERSION_CONFLICT` and the current version.
- Queue completions and march arrivals use unique job/march IDs and status transitions inside the same world lock.
- Quantities are non-negative integers. A troop moves from exactly one village army into exactly one march in one transaction.
- Resources are checked and deducted in the same transaction that creates a build or recruitment job.

## Accepted response

```json
{
  "type": "command.accepted",
  "payload": { "commandId": "01J...", "worldVersion": 413 }
}
```

## Rejected response

```json
{
  "type": "command.rejected",
  "payload": {
    "commandId": "01J...",
    "code": "WORLD_VERSION_CONFLICT",
    "message": "The world changed before this command was applied.",
    "currentWorldVersion": 413
  }
}
```

Other stable codes include `UNAUTHENTICATED`, `FORBIDDEN`, `INVALID_CONTRACT`, `INVALID_COMMAND`, `INSUFFICIENT_RESOURCES`, `INSUFFICIENT_TROOPS`, `QUEUE_FULL`, `TARGET_CHANGED`, `BATTLE_SEQUENCE_CONFLICT` and `WORLD_PAUSED`.

## Progression and War Victory Points

- A new kingdom begins with a level-1 Barracks and basic infantry. Stable, Workshop, Smithy, Academy and Market are built through the same authoritative resource/queue rules as every other building.
- Barracks/Stable/Workshop levels unlock unit families and improve training capacity. Smithy/Academy prerequisites gate kingdom-wide troop research.
- Every troop type begins at level 1 and can research through level 10. The server reads `kingdom_troop_levels`; the client cannot submit attack, defense or health values.
- A village conquest awards War Victory Points from development, defending power, capital status and relative realm strength using the shared deterministic formula.
- `village_conquests` allows a kingdom to score a specific village only once per world. Recapturing a village already scored by that kingdom awards zero, preventing two accounts from trading one village repeatedly.
- Weak targets apply a severe relative-strength reduction; defended capitals pay the largest award.
- Points update the kingdom's world score and the controlling player's active arena season in the same conquest transaction.
- Global, world and alliance chat messages display the sender's server-derived arena tier. Rank/tier is never accepted from a chat payload.

## Snapshot and reconnect

1. Client requests a world snapshot and receives `snapshotVersion`.
2. Client subscribes to the world's event channel from that version.
3. Server sends events strictly ordered by `(world_version, event_sequence)`.
4. If retained events do not cover the requested version, server returns `SNAPSHOT_REQUIRED` and the client fetches a new snapshot.
5. Reconnect never repeats a local mutation automatically with a new command ID. It retries the original ID or asks the player to issue a fresh command against current state.

## Battle authority

Interactive battle is not trusted client combat.

1. `battle.open` locks the arriving march and current defender village version.
2. Server creates a `battle_sessions` row containing a server seed, attacker snapshot, defender snapshot, plan and rules version.
3. The client renders those values in Phaser and submits sequential `battle.order` or `battle.retreat` commands.
4. Orders must have the next exact sequence number, valid squad, bounded coordinates and monotonic battle time.
5. When the battle ends, the server replays the deterministic shared simulation from the stored seed and order log.
6. Only the replay result writes casualties, loot, loyalty, return marches or conquest.
7. Defender layout and garrison are versioned. A changed target produces `TARGET_CHANGED` before the session begins, never midway through a validated battle.

Closed alpha may stream the replay through one world worker, but the contract must not be weakened into accepting a client-submitted winner or casualty total.

## Realtime channels

- `world:{worldId}` — public map changes, marches visible to the receiving player, standings and world events.
- `player:{playerId}` — private scouting, incoming attacks, queue completions and command results.
- `alliance:{allianceId}` — alliance chat, support and alliance events.
- `battle:{battleId}` — battle session state and accepted order sequence.

Every delivered event includes its committed world version. Chat has its own message sequence but still checks active alliance membership at send and read time.
