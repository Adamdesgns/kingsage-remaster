# HANDBACK — Slice 2: "RALLY, honestly"

Branch: `feat/slice2-rally` (stacked on `feat/slice1-field-is-a-place`).
Never committed to `main`. Written 2026-08-29, same overnight session as
slice 1, on Adam's standing word. Plan:
`docs/superpowers/plans/2026-08-29-slice2-rally-honestly.md`. Slice 1's
handback lives in that branch's history (`d30cd4a`) — read it first.

## Built

- **`BATTLE_RALLY_CLAMP = 700`** order-units/sec shared TS↔Luau with the
  same text-parity gate as ORDER_CAP. Derived: WalkSpeed 16 × ~27.8
  units/stud × 1.5 headroom.
- **Rally rides the state pull** (red team #6 — zero new request budget):
  `/api/roblox/state` accepts an optional `rallies` array; the store's
  `applyRallyUpdate` walk-clamps each step against an in-memory pace clock
  (restart forgets the clock, never the position — fails safe), rejects
  and LOGS teleport-sized moves, ignores anything stale (a rally arriving
  after resolve is the normal end of every rally), and rewrites the
  existing order row's x,y — no schema change, no worldVersion bump.
- **Banked time capped at 3s**: at the 10s heartbeat cadence an uncapped
  Δt × clamp would allow the whole field in one step. Caught during
  implementation, test-first.
- **The Roblox server is the position source**: it reads the commander's
  replicated character itself (no new client channel to spoof) and maps it
  through **one shared `BattleConfig.toOrderSpace`** — BattleScene's
  tap-to-order and the heartbeat can no longer drift apart (rules-check
  pins both call sites; ApiClient.post("/api/roblox/state") count is
  pinned at 2 so the budget can never quietly grow).
- **`battleRally` command kind**: first tap issues a normal `battle.order`
  at the commander's field position (standard weight, counts against the
  cap) then registers heartbeat tracking; a re-tap on an already-rallied
  squad RE-REGISTERS instead of spending another order (the rejoin path).
  PlayerRemoving clears the registration — disconnect freezes the rally at
  its last accepted position; the order stands.
- **Client**: Rally button exists ONLY on foot (rules-check gated — a
  rally from the overhead view would be a position claim with no body
  behind it); the local movie retargets the rallied squad to the commander
  every frame. Positions never touch the maths — slice 1's determinism
  gate stands unchanged.

## Verified live in Studio (2026-08-29, contested battles, human eyes)

- Rally tapped on foot at The Ashen Court Hold (197 units): landed as
  order 1 (+2%), vanguard visibly turned and followed the walking
  commander; the SERVER row tracked the walk across heartbeats
  (y 5000 → 4335 across samples) and froze at resolve.
- Spoof drill at Warlord Kaas Hold: rally placed, then the character
  teleported ~160 studs across the field via the command bar. The world
  server rejected it on three consecutive heartbeats —
  `[rally] rejected teleport-sized move ... 4870 units in 3.00s (allowed
  2100)` — and the row held at the pre-teleport position. Honest walking
  produced zero rejections all night.

## Not built (deliberate)

- No "cap reverts to 3" on disconnect: slice 1 recorded that the cap is a
  flat 5 per open battle and orders are rows, so "issued orders stand"
  holds by construction; disconnect semantics here are freeze + rejoin
  re-register, per the plan's Global Constraints.
- Defender-side rally, positional combat: out of scope (deferred by the
  red team).

## Known quirk (recorded, not fixed)

Tap-ordering a squad that is currently rallying still SENDS the order
(spends cap) but the local movie overrides its target on the next frame —
the player pays for an order they cannot see land. Small fix candidates:
clear `rallySquadId` on manual order of the same squad, or swallow the tap
with a toast. Left for the morning review because either choice is a UX
decision.

## Gates (run 2026-08-29, branch tip)

- `npm run test:server` — **97/97** (+3: rally clamp parity, walk/teleport
  /banked-time, dies-with-battle)
- `npm run check:types` — clean
- `npm run test:luau` — **50 rules**, 7 sim checks, 0 failed

## How to run

```bash
npm run test:server && npm run check:types && npm run test:luau
powershell -ExecutionPolicy Bypass -File roblox\start-dev.ps1 -Fresh -Play
```

Attend a battle, WALK THE FIELD, tap RALLY, and walk — the squad fights
toward wherever you stand. Watch the world-server window for `[rally]`
lines if you try to cheat.

## Open doubts

- The 10s heartbeat makes the server record follow in 10s steps; the local
  movie is instant. Fine for the record's honesty; if a future multiplayer
  spectator should SEE the rally move live, the cadence (Config.
  HEARTBEAT_SECONDS) is the knob, at real HTTP cost.
- Dev-world note: verification battles kept auto-resolving mid-drill until
  the world server was run with `KINGSAGE_AUTO_RESOLVE_MS=180000`; the
  25s default in start-dev.ps1 is tuned for demo recordings, not manual
  play. Worth a flag someday.
