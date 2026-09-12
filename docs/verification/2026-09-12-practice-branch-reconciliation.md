# Practice-siege PR #7 / #8 reconciliation — 2026-09-12

**Author:** [Cursor] (cloud; Morgan Sterling coordinates; Adam / Codex final review only)  
**Working branch:** `cursor/practice-pack-reconcile-dfeb` (docs + fresh gate rerun)  
**Code source of truth:** `cursor/practice-touch-scroll-da9e` @ **`bdcef2e7c16a6fa83215d2c34a0e2e07bf449bfd`**  
**Repo:** https://github.com/Adamdesgns/kingsage-remaster  
**Open PR #8:** https://github.com/Adamdesgns/kingsage-remaster/pull/8  
**Draft PR #7:** https://github.com/Adamdesgns/kingsage-remaster/pull/7  
**Release boundary:** no merge to `main`, no Roblox publish, no deploy. This note does **not** start Phase 2.

This note reconciles the two open practice PRs with current remote heads, maps the Studio pack, and tells Morgan exactly which revision to load for **S-07 then S-03**.

## Remote heads (fetched 2026-09-12)

| Ref | Full SHA | Role |
|---|---|---|
| `cursor/practice-touch-scroll-da9e` | `bdcef2e7c16a6fa83215d2c34a0e2e07bf449bfd` | PR **#8** head. Continue this line. Do not invent a second scroll fix. |
| `cursor/practice-phase1-d06-c4e2` | `41d541e9cabc5c6006b1e9f57fd17be39aaa7b6d` | Draft PR **#7** head. Parent of #8. |
| `feat/practice-siege-codex` | `add2cd2c76eb20cb54ef290ba00ceb3e1c437948` | PR #7 base. Do not reopen. |
| `main` | `9b478db8333a330b2bb309e9b3c01896ebf6c255` | Unchanged. Do not merge. |

Local checkout of this docs branch starts at the same `bdcef2e` tree. Remote #7 and #8 heads already match those SHAs. Nothing to rebase for this reconciliation.

## Stack (continue #8)

```
main @ 9b478db
  └─ feat/practice-siege-codex @ add2cd2
       └─ PR #7 draft: cursor/practice-phase1-d06-c4e2 @ 41d541e
            └─ PR #8 open: cursor/practice-touch-scroll-da9e @ bdcef2e
                 └─ this docs branch: cursor/practice-pack-reconcile-dfeb
```

- **PR #7** is the Phase 1 teaching / no-gate-team lesson (code increment `01e173f`, tip `41d541e`). Keep it draft. Do not cherry-pick it again onto a new branch.
- **PR #8** already contains #7 plus `roblox/src/client/TouchScroll.luau` (`14496f0`), then the wheel-position / one-finger-ownership fix (`bdcef2e`). **Continue #8.**
- PR #8’s earlier description still mentioned rebuild-from-`0f3625a` and 9 touch-scroll checks. That is stale. The live tip is **`bdcef2e`** with **11** `check:touch-scroll` checks.

## What must pass on the current build (`bdcef2e`)

Pinned teaching results stay in `packages/game-core/src/practice-siege-fixtures.ts`. Do not invent a new winning route after seeing a result.

| Pack ID | Player action / meaning | Status on current build |
|---|---|---|
| **S-01** | War → Practice siege. Do not redraw. **Try this plan.** Expect **FORT TAKEN**, losses **5 / 5 / 4**, gate opens, all three squads enter, `Training only. Your city troops and stock did not change.` | Automated pin exists. Live Studio on `bdcef2e`: **NOT RUN**. The 2026-09-11 PASS is on older **`41d541e`** and needed **Adam-assisted navigation**. That is **not** an independent bot PASS and does not transfer to this tip. |
| **S-02** | Reset, then freehand Vanguard through GATE, Archers WEST then GATE, Riders EAST then GATE. | Live Studio **NOT RUN**. Same family as S-01 only if drawings match the teaching defaults. |
| **S-03** | From teaching drawings, **Try without a gate team**, do not redraw, submit. Expect **FORT HELD**, losses **8 / 7 / 5**, no-gate explanation. | Automated pin exists. Live Studio **NOT RUN**. Exact assertions in the next section. |
| **S-04** | Run S-01 then S-03 without changing drawings. Only Vanguard target changes Gate → Keep. | Automated causality pin exists. Live Studio **NOT RUN**. |
| **S-05** | Decimal / backtracking / missed-target submit. | Automated Luau planner checks exist. Live Studio **NOT RUN**. |
| **S-06** | Reset / retry / interrupt / **Show all reasons** / **Previous reason**. | Automated Luau planner checks exist. Live Studio **NOT RUN**. |
| **S-07** | Village + War: wheel and a drag that starts on a 44px action row both move the list. Practice: drag from **Try this plan** / teaching copy to the board and back. Draw with one finger; a second finger must not change squad, target, or submit. | Source + 11 Luau stub checks. Live Studio on `bdcef2e` is the **next required acceptance** and is **NOT RUN**. The 2026-09-11 emulator session is the bug, not the fix. |
| **S-08** | 320px and 390px: action buttons ≥ 44px, teaching wraps, squads read Vanguard / Archers / Riders with V / A / R letters. | Automated 320/390 client checks exist. Live Studio **NOT RUN**. |
| **S-09** | Repeat S-01, S-03, S-05, S-06, S-07 on a **physical phone**. | **NOT a desktop-emulator pass.** **NOT RUN.** |
| **S-10** | `npm run check:practice-persistence` on a disposable DB. | Automated probe. Fresh result recorded in HANDBACK for this rerun. |
| **G-01** | Unfamiliar-player understanding + Adam acceptance. Five testers; at least four complete unaided and explain one target/route change; all understand practice troops are not city troops. | **OPEN.** One Adam-assisted S-01 on `41d541e` does not close it. |
| **G-02** | Opening-design contract: D-01 / D-02-storage / D-08 / D-09 / D-10 plus the mutual first-war rule. | **NOT a desktop-emulator pass.** Adam yes/no only. See `docs/plans/2026-09-10-opening-decisions-for-adam.md`. Silence is not approval. Green automated gates do **not** start Phase 2. |

## S-03 live Studio assertions (current build)

Run this **after** S-07 on the rebuilt `bdcef2e` place. Reset first if the board is dirty. Do not redraw.

### Player steps

1. War → **Practice siege**.
2. If routes are not the teaching defaults, tap **Reset all routes**.
3. Tap **Try without a gate team**. Do not touch the board.
4. Confirm the planner still shows the same three drawings (Vanguard down x 50; Archers west-then-gate; Riders east-then-gate). Only Vanguard’s target changed: Gate → Keep.
5. Tap **Try this plan**.

### Must see before submit

| Surface | Exact copy |
|---|---|
| Teaching line (14px, emphasized) | `No squad is opening the gate. Crossing the gate mark is not enough.` |
| Status | `No squad is opening the gate. Everyone will be stopped at the wall. Try this plan, then reset and compare.` |
| Standing teaching | `Practice army — your city troops are safe.` |
| Standing teaching | `Clearing a tower stops its arrows. Only an opened gate lets anyone inside.` |
| Control | Full-width **Try without a gate team** still present |

If either standing teaching line is missing, **stop**. The place is stale.

### Must see after the server result

| Surface | Exact expectation |
|---|---|
| Outcome banner | **FORT HELD** (not FORT TAKEN) |
| Training line | `Training only. Your city troops and stock did not change.` |
| Losses | `Losses: Vanguard 8 · Archers 7 · Riders 5` |
| Gate explanation | A revealed reason reads `No squad was sent to open the gate.` |
| Wall explanations | Three blocked-at-wall lines, one per squad: `{Vanguard\|Archers\|Riders} reached x 50, but the gate is the only way in and it was closed or missed.` — **even though every line still crosses x 50**. |
| Entry | No squad enters. Nobody is described as following a route through an open gate. |

Pinned fixture: `PRACTICE_NO_GATE_TEAM_PLAN`. Resolver pin: `defenderWin`, casualties `{ vanguard: 8, archers: 7, riders: 5, total: 20 }`.

**FAIL** if the banner is FORT TAKEN, if losses are not 8/7/5, if the gate-skip reason is missing, or if a squad is described as entering through the gate.

S-04 (same session, no redraw) is the comparison: Reset / Try this plan → FORT TAKEN 5/5/4, then this row again. The only tactical change is Vanguard’s target. Do not use the retired `holdKeep` Rider x-50 vs x-40 pair.

## How to load this exact revision in Studio

Cloud / this agent cannot operate Studio or a phone. Adam or Morgan on the PC:

1. Check out **`bdcef2e`** on `cursor/practice-touch-scroll-da9e` (PR #8). Do not Play an older `41d541e` or `0f3625a` place and call it this tip.
2. Inspect what is already running. If Studio, a world server, or port **4178** is already in use, do not kill unknown apps.
3. Rebuild the development place only:

   ```powershell
   powershell -ExecutionPolicy Bypass -File roblox/start-dev.ps1 -BuildOnly -Play
   ```

   That writes `roblox/WorldGame-dev.rbxlx` from `roblox/default.project.json`. Production credentials stay excluded.
4. Confirm the rebuilt file contains `TouchScroll` (wheel event `Position`, one-finger drag ownership, `Body.ElasticBehavior` Never). The 2026-09-11 PC rebuild of this same tip was SHA256 `D6CAE1131EC3A66ADB4BAB97EB2B6D54F86FE7E193A4E1B5B76E736BD200AFEC` (418,456 bytes). A new rebuild will have a new hash; record it. Do not Play a place built from `0f3625a`.
5. Preferred world: isolated loopback `127.0.0.1:4178`, **fresh disposable** SQLite, key `dev-secret-local-0001`, AI off for the pack. Health must return `{ok:true, service:"kingsage-world", contractVersion:1}`. Do not use the live world. Do not run `start-dev.ps1` without `-BuildOnly` unless 4178 is confirmed to be *this* disposable world.
6. Studio: open that development place, HTTP requests on, Play.
7. Device for the first pass: iPhone XR landscape emulator is acceptable for **S-07 and S-03**. It is **not** S-09 and **not** G-02.

### Order

1. **S-07** (this tip’s reason to exist): Village and War — wheel over the list moves it; a drag that starts on a button row moves the list and does not fire the button; Practice siege — drag from **Try this plan** / teaching copy to reach the board and back; draw with one finger; a second finger does nothing to squad, target, or submit.
2. **S-03** using the assertions above.
3. **S-04** if time.
4. **S-09** only on a physical phone. A desktop pointer at phone width is not S-09.
5. Do not close G-01 from emulator rows. Do not start Phase 2 because automated gates are green.

## Honest S-01 caveat (do not launder this)

On 2026-09-11, Adam + Morgan observed S-01 on **`41d541e`** / `WorldGame-dev.rbxlx` / iPhone XR 896×414: FORT TAKEN, losses 5/5/4, training-only line. Written record: [2026-09-11 S-01 note](2026-09-11-practice-studio-s01.md).

That session **could not wheel-scroll**. A finger-style drag was required, and reaching Practice siege needed **Adam’s help**. Treat it as **Adam-assisted navigation**, not an independent bot PASS, and not evidence for `bdcef2e`.

## Remaining blockers for Morgan’s live Studio pack run

1. Rebuild and Play **`bdcef2e`**, not `41d541e`.
2. Fresh **S-07** acceptance of `TouchScroll` (wheel, button-start drag, one-finger ownership, drawing still owns `RouteCanvas`).
3. Fresh **S-03** (and S-04 if time) on that same Play.
4. S-02, S-05, S-06, S-08 still unrun in Studio on any tip.
5. **S-09** physical phone — separate from emulator.
6. Unfamiliar-player study (G-01).
7. Adam fun/acceptance and a captioned walkthrough only after S-01–S-06 are stable on the rebuilt place.
8. **G-02** waits on Adam’s written answers. Not a Studio row. Not authorization for Phase 2.

## Automated gates (this cloud rerun, Lune 0.10.5, TypeScript 5.9.3)

Rerun on the `bdcef2e` tree after the documentation edits. Commands were executed in this image; the output was read before writing these numbers.

| Command | Result |
|---|---|
| `npm run check:types` | pass — game-core/server type-clean |
| `npm run test:core` | 104 passed, 0 failed |
| `npm run test:server` | 139 passed, 0 failed |
| `npm run test:luau` | 42 syntax; 72 rules; 7 simulations; 25 connections; 6 client audits; 272 contracts; 28 bridge; 12 planner; 54 wiring; **11 touch-scroll**; 0 failed |
| `npm run check:practice-persistence` | HTTP 200/200/200 + 400; identical replay; durable DB/WAL/rows unchanged |
| Rojo / `start-dev.ps1 -BuildOnly` | **not run** — `rojo` is not installed in this cloud image |
| Studio Play of `TouchScroll` (S-07) | **NOT RUN** |
| S-03 live Studio | **NOT RUN** |
| Physical phone (S-09) | **NOT RUN** — not an emulator pass |
| G-02 | **NOT RUN** — not an emulator pass |

Green automated gates are not G-01 closed and are not permission to start Phase 2.
