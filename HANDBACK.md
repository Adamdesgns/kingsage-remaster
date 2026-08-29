# HANDBACK — Slice 4: "The living square"

Branch: `feat/slice4-living-square` (top of the stack:
slice1 → slice2 → slice3 → this). Never committed to `main`. Written
2026-08-29, end of the overnight session, Adam's standing word. Plan:
`docs/superpowers/plans/2026-08-29-slice4-living-square.md`. Slices 1–3
carry their own handbacks in their branches' history.

## Built

- **`VillagerSpec.luau`** (pure, Lune-audited): a 12-part layered-costume
  frame in CharacterStyle's own wool-and-leather palette (values copied as
  literals, the WorldStyle lock pattern) — kirtle, over-layer, apron,
  collar, head, headwear, sleeves, legs, shoes, belt. Four archetypes
  (goodwife, laborer, baker, fishmonger), each with the ≤3-part prop that
  explains the walk (basket, timber bundle, bread board, fish crate).
  60 parts total against the 150 design cap.
- **One shared route loop on the street shoulders** (|x| 10–16), market
  corner to the yards, quarter-phase offsets so four people never read as
  a parade. Rules-check asserts every waypoint stays on the shoulder band
  — a route edit that drifts into the road fails the gate.
- **Mourning as a pure function**, proven by a scripted Lune scenario:
  a real loss (floor 5 realm-of-power in one observed step) empties the
  streets for an hour; no re-trigger inside the 30-min cooldown; an open
  battle at MY village hides everyone regardless ("the baker's boy does
  not stroll through a siege" is literally a rule name).
- **`Villagers.luau`** (client, Paddock pattern): owner-only by
  construction, zero replication, one BulkMoveTo per frame, corner
  pauses, parked when the camera leaves the village.
- **`MarketRowSpec.luau` + SettlementBuilder placement**: three trade
  stalls (greengrocer, root-seller, fishmonger — different awning dyes
  and goods), hanging-goods bar, baker's rack — 39 parts against the 120
  budget, placed with its own assert. The existing 170-part architecture
  gate correctly REFUSED the first build (market hit 171); row parts are
  tagged and excluded from that count so both budgets keep meaning
  something. The old two-box market stalls are superseded.

## Verified live in Studio (2026-08-29, human eyes)

- Villagers exist, spread along the loop, and MOVE (positions differ
  across screenshots minutes apart); the laborer's timber bundle reads at
  a glance.
- The market row renders: three awninged stalls with produce, skirted
  tables, crates — and a villager walked past the stalls on the shoulder
  during the look, which is the whole slice in one frame.

## Deferred to Adam (the slice's own gates)

- **The 30-second kid watch test** ("what are they doing?" answerable per
  villager) and the **tween-CPU phone test** need Adam and a real phone.
  The build is ready for both; the slice is NOT closed until they pass.

## Honest limits

- Mourning direction needs two observations, so a fresh join mid-mourning
  shows villagers until the next real loss. Server-side mourning state
  would fix it at the cost of new server state — deliberately not built.
- Battle-despawn and mourning are proven by the Lune scenario, not live
  (I cannot be my own defender in this world, and the client cannot lower
  its own realm power). The decision function is shared and pure; the
  live path through it is three lines.
- The route reads as "walking the green between street and lots" in wide
  shots — the shoulders are grass. If Adam wants them ON the cobbles, the
  band constants are one edit inside the gated bounds.

## Gates (run 2026-08-29, branch tip)

- `npm run test:server` — 97/97 · `npm run check:types` — clean
- `npm run test:luau` — 26 files, **63 rules**, 7 sim checks, 0 failed

## How to run

```bash
npm run test:luau
powershell -ExecutionPolicy Bypass -File roblox\start-dev.ps1 -Fresh -Play
```

Walk out of the keep: the market street is dressed and four people are
about their errands. Lose a real fight and the square goes quiet for an
hour — that part, take the gate's word for until the morning look.
