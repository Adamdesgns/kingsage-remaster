# HANDBACK — B8 mid-settle SIGKILL drill

Branch: `cursor/b8-mid-settle-kill-1e7a` (stacked on PR #18
`cursor/battle-settle-http-drill-58fc` @ `e6a4204`).
Written 2026-09-20. Owner: Adam. Model: Grok / Cursor Models (cloud).
Draft PR: https://github.com/Adamdesgns/kingsage-remaster/pull/19

The Phase A root HANDBACK this file replaces is still in git history on
`main` / PR #18. This file is the handback for **this** branch.

## Built

- `scripts/b8-mid-settle-kill-drill.mjs` — 10-step HTTP drill. One
  disposable world, one attended Freehold fight, `battle.resolve` then
  `SIGKILL`, restart, all-or-nothing across session / march / plan /
  defender / war points / both notifications / both events / inbox.
- `docs/verification/2026-09-20-b8-mid-settle-kill-evidence.md` —
  what it proves / does not prove, honesty notes, verbatim run record.
- `docs/verification/2026-09-17-full-game-acceptance-matrix.md` —
  **revision 10**.

No `server/`, `packages/`, or `roblox/` changes.
`git diff 9b478db HEAD -- server/ packages/ roblox/` is empty.

## Not built

- Power loss (a pulled plug). SIGKILL is not that.
- Conquest (`KINGSAGE_DEV_SEED_NOBLES`). The mid-settle drill was not
  too fragile to ship; conquest stays the next HTTP slice.
- `battle.retreat`, rams, an unattended auto-resolve kill, Studio, hosting.
- A kill proven to land *inside* the `COMMIT` syscall. The drill records
  where it landed.

## Result (honest)

**PASS 10/10, exit 0** at `8bb89fa`. Wall time 38.5 s.

This recorded run is **SETTLED** and the HTTP **200 arrived before the
kill**. `resolved_at` is 4 ms before the SIGKILL line. That is the
weaker mid-settle landing (wholly present after the client already had
the body). I did not re-run to shop for an `ECONNRESET`.

Smokes, both PASS 10/10:

| Delay | Landing | HTTP |
|---|---|---|
| 0 ms (`bec4c78`) | UNSETTLED | in-flight |
| 8 ms (`bec4c78` + env) | SETTLED | `ECONNRESET` |
| 8 ms (`8bb89fa`, recorded) | SETTLED | 200 |

Half-settled was never observed.

## How to run

```bash
node scripts/b8-mid-settle-kill-drill.mjs
# expect exit 0, "B8 mid-settle kill drill PASS (10/10 steps PASS)", ~40 s
```

## Gates this session (cloud image)

| Gate | Result |
|---|---|
| `npm run check:types` | clean (tsc/`@types/node` installed locally, not committed) |
| `npm run test:core` | 92/92 |
| `npm run test:server` | 114/114 |
| `npm run test:luau` | 72 rules, 0 failed (Lune 0.10.5 fetched to `/tmp`) |

## Open doubts

- 8 ms is a steering knob. A loaded box may need a different delay to
  see SETTLED+in-flight. Both legal landings remain PASS.
- Claude's review of the record is owed (matrix §7). None is invented here.
