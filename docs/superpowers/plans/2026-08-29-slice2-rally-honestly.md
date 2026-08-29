# Slice 2 — "RALLY, honestly" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rally order whose engagement point follows the attending commander — position fed through the EXISTING batched state pull (zero new request budget), server-clamped to walking speed (teleport spoofing rejected and logged), frozen on disconnect, restored on rejoin, standard order weight, zero outcome consequence.

**Architecture:** Rally = a normal field order (counts against `BATTLE_ORDER_CAP`, standard 0.02 bonus weight) whose stored `x,y` the world server keeps refreshed while the commander stands on the field. The Roblox server reads the commander's replicated character position itself (no new client channel to spoof), maps it to order space with the same shared geometry the scene uses, and rides it into the `/api/roblox/state` body it already posts. The world server validates each update against a shared walk-speed clamp before touching the row. Positions never enter `resolveBattle` — the slice-1 determinism gate stands watch.

**Tech Stack:** Node + node:test; Luau/Lune; no schema changes (rally updates rewrite the existing order row's x,y; last-update clock lives in server memory and degrades safe on restart).

## Global Constraints

- Design authority: red-team slice table row 2: "rally order with walk-speed clamp, heartbeat batched into state pull, disconnect semantics (cap reverts in one tick, issued orders stand, rejoin restores)". Gate: "spoof-rejection + budget-under-load tests".
- Red team #2 verbatim: commander position is a client claim; RALLY ships only with a server-side walk-speed clamp on position deltas (teleport spoofing rejected and logged), sold as a carried order whose engagement point follows you — standard bonus weight.
- Red team #6 verbatim: the heartbeat rides the existing batched state pull — zero new HttpService request budget.
- No schema changes. No new outcome inputs (determinism gate from slice 1 must stay green untouched).
- Cap note (recorded in slice 1): the cap is a flat 5 per open battle and orders are rows — so "issued orders stand" holds by construction and there is no separate unattended cap to "revert"; disconnect semantics here mean rally TRACKING stops within one heartbeat and rejoin restores it without burning a new order.
- Geometry (shared, already in BattleConfig): FIELD_WIDTH 120, FIELD_DEPTH 90, order span = (FIELD_WIDTH/2+30)*2 = 180 studs ↔ ORDER_SPACE 5000 ⇒ ≈27.8 units/stud. Commander WalkSpeed 16 studs/s ≈ 444 units/s. Clamp: `BATTLE_RALLY_CLAMP = 700` order-units/second (walk × 1.5 headroom); parity-tested TS↔Luau like ORDER_CAP.
- Branch: continue on `feat/slice1-field-is-a-place`? NO — new branch `feat/slice2-rally` off the slice-1 branch (slice 2 depends on slice 1's cap + on-foot work; Adam merges them in order or together).
- Gates before done: test:server, check:types, test:luau (roblox touched).

---

### Task 1: Shared `BATTLE_RALLY_CLAMP` with parity

**Files:** Modify `packages/game-core/src/warfare.ts`, `roblox/src/shared/BattleConfig.luau`, `server/test/roster-parity.test.ts`.

**Interfaces:** Produces `export const BATTLE_RALLY_CLAMP = 700;` (order-units/sec) and `BattleConfig.RALLY_CLAMP = 700`.

- [ ] Step 1: parity test (same pattern as ORDER_CAP — regex `BattleConfig\.RALLY_CLAMP\s*=\s*(\d+)` vs import). Run: FAIL.
- [ ] Step 2: add both constants with the derivation comment (walk 16 studs/s × ≈27.8 units/stud × 1.5 headroom, rounded). Run: PASS. Commit `feat: shared BATTLE_RALLY_CLAMP with text-parity gate`.

### Task 2: World server — rally updates ride the state pull

**Files:** Modify `server/src/http.ts` (`/api/roblox/state` handler), `server/src/store.ts` (new public method `applyRallyUpdate`), `server/test/roblox-attend.test.ts`.

**Interfaces:** State POST body gains optional `rallies: [{ robloxUserId, battleId, sequence, x, y }]` (array, ≤200). For each entry, `store.applyRallyUpdate(robloxUserId, entry, now)`:
- battle must exist, be `open`, and belong to the caller's kingdom (attacker) — else ignore silently (a stale rally after resolve is normal, not an attack);
- the order row (battle_id, sequence) must exist — else ignore;
- x,y clamped to [0, ORDER_SPACE];
- movement clamp: keep an in-memory `Map<battleId:sequence, {x,y,atMs}>` seeded from the row on first sight (at = now, permissive first sample — documented: a restart forgets the clock, never the position); allowed = BATTLE_RALLY_CLAMP × Δseconds (min Δ 0.05s); a delta beyond allowed is REJECTED: row untouched, memory untouched, `console.warn` "[rally] rejected teleport-sized move ..." — the log IS the spoof audit;
- within clamp: `UPDATE local_battle_orders SET x=?, y=? WHERE battle_id=? AND sequence=?` + memory refresh. No worldVersion bump (a rally step is not a world event; the attacker's own movie tracks locally).

- [ ] Step 1: failing tests (extend roblox-attend, reuse harness):

```ts
test("a rally position walks - it does not teleport", async () => {
  // open battle, issue order 1 (the rally), then:
  // (a) POST state with rallies moving +30 units after 1s advance -> row x changes
  // (b) POST state with rallies moving +4000 units after 0.1s -> row unchanged
  // read the row via (store as any).db
});
test("rally updates die with the battle", async () => {
  // resolve the battle, then a rally update for its order -> row unchanged, 200 OK
});
```

- [ ] Step 2: run — FAIL (no `rallies` handling). Implement. Run full gates. Commit `feat: rally rides the state pull - walk-clamped, spoof-logged, dies with the battle`.

### Task 3: Roblox server — the honest position source

**Files:** Modify `roblox/src/server/WorldSession.luau` (heartbeat body), `roblox/src/server/CommandService.luau` (new request kind `battleRally`), `roblox/scripts/rules-check.luau`.

**Interfaces:**
- `CommandService` gains kind `battleRally` `{battleId, squad}`: if that squad already has a live rally registration → re-register only (rejoin path, no new order, message "Rallying <squad> to your position."); else behave exactly like `battleOrder` at the commander's CURRENT field position (mirror cap check included) AND register `{player, battleId, sequence, squad}` in a module-level rally table the heartbeat reads.
- WorldSession's heartbeat loop: for each registered rally whose player has a character on the field of an open battle, compute order-space x,y from the character's `HumanoidRootPart.Position` using THE SAME formula as `BattleScene.orderSquad` (shared helper `BattleConfig.toOrderSpace(worldPoint, center)` — extract it into BattleConfig so client and server cannot drift; BattleScene refactored to call it) and attach `rallies = {...}` to the SAME `ApiClient.post("/api/roblox/state", ...)` body. PlayerRemoving clears that player's registrations (freeze-on-disconnect); battle no longer open clears them.

- [ ] Step 1: failing rules (rules-check):
  - `the rally heartbeat rides the existing state pull` — text: `rallies` appears inside the same `ApiClient.post("/api/roblox/state"` call in WorldSession (and `ApiClient.post` call-count in the file has not grown — count occurrences, must stay 2);
  - `client and server map the field through one shared toOrderSpace` — BattleConfig defines `toOrderSpace`, BattleScene.orderSquad references it, WorldSession references it;
  - `battleRally re-registers instead of double-spending the cap` — text: the battleRally branch checks the registration table before issuing a new order.
- [ ] Step 2: run — FAIL. Implement (extract toOrderSpace into BattleConfig as a pure function `(worldX, worldZ, centerX, centerZ) -> (x, y)`; loadWithRobloxStubs already lets Lune load BattleConfig, keep it Vector3-free). Run test:luau — green. Commit `feat: roblox server feeds rally from the replicated character through the shared field mapping`.

### Task 4: Client — the RALLY button and the following movie

**Files:** Modify `roblox/src/client/init.client.luau` (panel button), `roblox/src/client/BattleScene.luau` (local rally tracking of the commander), `roblox/scripts/rules-check.luau` (one rule).

- On-foot only (`onFoot == true`), live, iAttack: the bar shows `Rally` as a 7th button (width 1/7 when on foot, 1/6 otherwise): sends `invokeQueue({kind="battleRally", battleId, squad=selectedSquad})`. Locally, `BattleScene.rallySquad(squadId)` marks that squad to retarget every tick to the commander's current position (same block-offset math as orderSquad); `BattleScene.stopRally()` on exit/overhead? NO — rally keeps following while on foot AND when overhead (the order stands; the movie follows the last known commander position — the commander's body remains on the field only while onFoot, so: rally tracking follows the CHARACTER while it stands on the field; toggling to overhead freezes the local target where the commander stood, matching the server's frozen row).
- Rule: `the rally button exists only where the commander does` — text rule: the Rally barButton construction sits inside the `onFoot` branch.

- [ ] Step 1: rule FAIL → implement → luau green. Commit `feat: RALLY - the squad fights toward wherever you stand`.

### Task 5: Verification

- [ ] All three gates green (server now ≥97, luau ≥50 rules).
- [ ] Live Studio: attend on foot, Rally the vanguard, WALK — squad follows; toggle overhead — target freezes; return on foot — follows again; server log shows zero teleport rejections during honest play; command-bar teleport of the character mid-rally → world-server log shows the rejected move and the row holds.
- [ ] HANDBACK update; vault; push `feat/slice2-rally`.

## Self-Review

- Slice row coverage: rally order (T3/T4), walk-speed clamp (T2), heartbeat batched into state pull (T2/T3 + budget rule), disconnect semantics (T3 PlayerRemoving freeze; rejoin re-register without cap spend; orders stand = rows persist) — covered. "Cap reverts in one tick" is subsumed by the flat-cap record from slice 1 (documented in Global Constraints).
- Spoof gate: T2 test (b) + live teleport check in T5. Budget gate: rules-check call-count pin in T3.
- Types: `BATTLE_RALLY_CLAMP`/`RALLY_CLAMP`, `applyRallyUpdate`, `toOrderSpace`, `battleRally`, `rallySquad` consistent across tasks.
