# HANDBACK — Phase A: "fully functioning"

Branch: `feat/fully-functional-phase-a` (from `main` @ `c9e1e5c`).
Written 2026-08-29, evening session, on Adam's word ("Ok let's get it
fully functioning so we can see what it can do"). Plan:
`docs/superpowers/plans/2026-08-29-fully-functional-phase-a.md`. Executes
the critical path of `docs/audits/kingsage-functionality-audit.md`
(same session). Supersedes the slice-4 handback that stood here — that
one's claim "never committed to main" had gone stale anyway (slice 4 is
`main~1`); its content lives on in git history.

## Built (every item test-first; gate counts below)

- **Empty/malformed commandIds die at the door** (audit 8.5): both command
  routes require a 1–128 char string id and a typed command object (400),
  the store guards the same as defence-in-depth, and a non-string chat
  body refuses instead of crashing. Before: an integration that forgot
  commandId had every later command silently "accepted" as a replay of
  its first.
- **Retreat exposure is the battle's own clock** (8.4): `atMs` is derived
  server-side from `opened_at`; the client field is ignored and no longer
  sent. `atMs=0` no longer buys 88% survivors.
- **Fog covers realm power and herds** (8.3): snapshots zero
  `realmOfPower(+Max)` / `horses(+Max)` for foreign villages; the scout
  report now carries `observedRealmOfPower` (+ derived max) — migration
  **0011**, conditional per the 0008–0010 pattern.
- **The event stream is fogged per reader** (8.2): one
  `filterEventForKingdom` drops private events (marches, scout reports,
  queue orders, battles you're not in) for other readers and fogs the
  village inside public ones, failing closed on unknown event types.
  Replay route and live SSE both go through it.
- **Sequential sieges** (8.1, the P0): at most one open battle per
  village. Attended open against a held field → `SIEGE_IN_PROGRESS`; a
  deadline firing during someone's open battle waits a 30s beat and
  retries. Three-scenario test proves loot conservation and
  survivors-not-copies. Before: two attackers each fought the FULL
  garrison and looted the same stock twice.
- **Rate limits** (12.4): token bucket, injectable clock.
  register+login 5/min/address (429), roblox commands 30/min/player
  (refused in the `command.rejected` shape the client already renders).
  The state heartbeat is deliberately never limited.
- **`march.cancel`**: an OUTBOUND march you own turns for home from where
  it stands; the walk back costs what the walk out cost. Arrived =
  `MARCH_COMMITTED`; rivals = `FORBIDDEN`; replays return the stored
  result.
- **Open seats** (11.4 / Grok handback deviation): migration **0012**
  widens `seat_kind` with `'open'` (table rebuild per 0007; backfill by
  the seed's naming rule, proven against a fabricated pre-0012 DB).
  findOpenSeat hands out the two fresh seats first, then named kingdoms
  (capacity still 6); **the AI tick never develops an open seat**.
- **The AI is ON in the dev loop**: `start-dev.ps1` sets
  `KINGSAGE_AI_TICK_MS=45000`. Live drill (scratch world, 2s tick, zero
  player action): all four named kingdoms queued farm upgrades + 12
  Squires within seconds; the open seat got nothing.
- **The snapshot carries a `troopCatalog`** (server-built: costs,
  population, prerequisites, research levels + next step) so the client
  renders numbers from server truth — no Luau mirror of economy.ts.
- **Roblox client wiring**: full 11-troop recruitment picker with costs,
  prerequisites and an x1/x5/x25 batch cycle (Counts stay
  one-at-a-time); **Smithy research section** (the server path existed
  with NO interface); **Recall** on outbound marches (two-tap armed);
  **THE HERALD** — the realm's notifications finally render (they were
  written to the DB and shown to nobody).
- **Hosting is config** (11.1): `KINGSAGE_BIND` (default loopback);
  SecretConfig gains optional `BASE_URL`; a missing secret warns loudly
  once a minute instead of silently hanging every player (8.6).
- **Docs truth pass**: AI-TEAM-BRIEFING's dead "80/81 known fail"
  instruction replaced with the real bar; README now says the Roblox game
  is the product; `docs/ops/vps-runbook.md` written (Adam's 15-minute
  part listed first; everything else is SSH-runnable).

## Gates (all green, run on this branch)

- `npm run check:types` — clean.
- `npm run test:server` — **114/114** (baseline was 97; +17 new).
- `npm run test:core` — 92/92.
- `npm run test:luau` — syntax + **72 rules** (63 + 9 new, the recruit
  clamp rule mutation-checked live) + 7 spike sims.

## Not built / honest limits

- **No live Studio look at the new village-tab and war-tab UI yet.** The
  Luau compiles and 9 rules pin the wiring, but no human (or demo run)
  has seen the recruit picker, research rows, Recall or Herald rendered.
  That is the next Studio session's first job.
- Phase B (the VPS itself) needs Adam's account + card; runbook is ready.
- Retention/pruning of events/inbox/notifications still unbounded (audit
  P2) — deliberately out of Phase A scope.
- Trebuchets and night bonus remain wired-to-nothing stubs; alliances /
  market / trade remain missing — Phase C+ scope, listed in the audit's
  §14 build order. Adam's nine §16 decisions still stand open.
- The rate-limit defaults (5/min auth, 30/min commands) are judgment
  calls, tunable via injection; nobody has played against them yet.
- `contracts.test.ts:21` still pins the fixture's nominal two-human
  seats (the store overwrites them to 'open' now) — left alone: it tests
  the fixture, and the new freeholds tests pin the world.

## How to run

- Dev loop: `roblox/start-dev.ps1 -Fresh` — now boots a LIVING world
  (AI on). Everything else unchanged.
- Full gates: `npm run check:types && npm run test:server && npm run
  test:core && npm run test:luau`.
- Hosting: `docs/ops/vps-runbook.md`.
