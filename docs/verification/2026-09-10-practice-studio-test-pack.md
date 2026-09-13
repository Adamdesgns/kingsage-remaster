# Practice siege Studio / phone test pack

**Date:** 2026-09-10; evidence updated 2026-09-11; reconciliation 2026-09-12; boot runbook 2026-09-13
**Author:** [Cursor]
**Code source of truth now:** `cursor/practice-touch-scroll-da9e` @ `bdcef2e` (PR #8). Full SHA `bdcef2e7c16a6fa83215d2c34a0e2e07bf449bfd`.
**Source revision last observed in Studio:** `cursor/practice-phase1-d06-c4e2` @ `41d541e` (code increment `01e173f`). That Play is **older than the scroll fix**.
**Source revision that adds the touch-scroll helper:** `bdcef2e` contains `roblox/src/client/TouchScroll.luau` with wheel event position and one-finger drag ownership. Rebuild the place from **this** SHA before judging scroll. Re-record the place hash if the file is rebuilt.
**Place:** `roblox/WorldGame-dev.rbxlx` built from `roblox/default.project.json`.
**Server for Play:** isolated loopback world on `127.0.0.1:4178` with a **fresh disposable** SQLite file. Do not use the live world.

**Morgan, PC was shut down:** start at the [2026-09-13 Studio boot runbook](2026-09-13-morgan-studio-boot-runbook.md) — exact `bdcef2e` load, `-BuildOnly -Play`, health GET, inspect-before-kill, **S-07 then S-03**.

This pack is for Adam / Morgan when computer control and a physical phone are available. Cloud/Cursor cannot operate Studio or a phone. **G-01 stays open.** S-01 was observed in Studio Play on 2026-09-11 on `41d541e` with **Adam-assisted navigation** after the list would not wheel-scroll. That is **not** an independent bot PASS and is **not** acceptance of `bdcef2e`. Written record: [2026-09-11 S-01 note](2026-09-11-practice-studio-s01.md). Branch map and S-03 live assertions: [2026-09-12 reconciliation](2026-09-12-practice-branch-reconciliation.md).

Pinned plans live in `packages/game-core/src/practice-siege-fixtures.ts`. Do not invent a different “winning” route after seeing a result.

## Setup (inspect first; do not kill unknown apps)

1. Look at what is already running. If Studio, a world server, or port 4178 is already in use, **ask or inspect before changing it**. Do not kill unknown apps.
2. **Build the development place only** (does not start a world server or Studio):

   ```powershell
   powershell -ExecutionPolicy Bypass -File roblox/start-dev.ps1 -BuildOnly -Play
   ```

   That writes `roblox/WorldGame-dev.rbxlx` from `roblox/default.project.json`. Production credentials must stay excluded.

3. **Do not use `start-dev.ps1` without `-BuildOnly` for this pack** unless you have already confirmed port 4178 is free or is *this* disposable world. Without `-BuildOnly` the script:
   - starts AI ticks at **45 seconds** (`KINGSAGE_AI_TICK_MS=45000`);
   - may **reuse an existing 4178 world** (“world server already running — reusing the EXISTING world”);
   - with `-Fresh` will stop only this project’s `node.exe *index.ts*` listener, then create a new DB. Still not the live world.

4. Preferred isolated world for Play (fresh disposable DB, key `dev-secret-local-0001`, bind `127.0.0.1:4178`). Exact start + inspect commands: [boot runbook](2026-09-13-morgan-studio-boot-runbook.md). Health GET `http://127.0.0.1:4178/api/health` must return `{ok:true, service:"kingsage-world", contractVersion:1}`.
5. In Studio: open that development place, HTTP requests on, Play. **S-07 first, then S-03.** S-09 is a physical phone. G-02 is Adam-written. Neither is an emulator pass.

## Teaching copy to read before drawing

The planner must show, in readable 14px-class text:

- `Practice army — your city troops are safe.`
- `Clearing a tower stops its arrows. Only an opened gate lets anyone inside.`
- A full-width control **Try without a gate team**.

If either teaching line is missing, stop. Do not continue a comprehension study on stale teaching.

## Scenarios

Record for each: date, commit SHA, place hash if known, observed outcome, casualties, first two or three reasons, device, and a screenshot/video path **outside** the repo (continue the 2026-09-04 proof folder or a new dated folder).

| ID | Player action | Expected server result |
|---|---|---|
| S-01 Reset teaching plan | Open War → Practice siege. **Do not redraw.** Tap **Try this plan**. | **FORT TAKEN**. Losses **5 / 5 / 4**. Gate opens. All three squads enter through the open gate. Outcome line: `Training only. Your city troops and stock did not change.` |
| S-02 Three drawn routes | **Reset all routes**. Manually draw Vanguard through GATE, Archers through WEST then GATE, Riders through EAST then GATE. Submit. | Same family as S-01 if the drawn points match the teaching defaults. If the line wanders through tower range longer, casualties may rise, but squads enter **only** if they cross at the opened gate. |
| S-03 No-gate-team failure | From the teaching drawings (Reset if needed). Tap **Try without a gate team**. Do not redraw. Submit. | **Before submit:** emphasized line `No squad is opening the gate. Crossing the gate mark is not enough.`; status `No squad is opening the gate. Everyone will be stopped at the wall. Try this plan, then reset and compare.` **After submit:** outcome banner **FORT HELD** (not TAKEN). Losses **Vanguard 8 · Archers 7 · Riders 5**. Revealed reasons include `No squad was sent to open the gate.` and three `{Vanguard\|Archers\|Riders} reached x 50, but the gate is the only way in and it was closed or missed.` lines **even though the drawings still cross x 50**. No squad enters. Full live checklist: [reconciliation S-03](2026-09-12-practice-branch-reconciliation.md#s-03-live-studio-assertions-current-build). |
| S-04 One-target causality | Run S-01, then S-03, without changing any drawn points. | The **only** tactical change is Vanguard’s target: Gate → Keep. Same routes, same `guardGate` defense. First: TAKEN 5 / 5 / 4. Second: HELD 8 / 7 / 5. Do **not** use the retired `holdKeep` Rider x-50 vs x-40 pair — the planner cannot submit that. Optional freehand miss-the-gate (`PRACTICE_LOSING_CLOSED_GATE_PLAN`) is extra geometry, not this row. |
| S-05 Invalid input | Enter a decimal or backtracking route (or clear a route so it misses its target). Submit. | No server success card. Status names the squad and the problem. Routes remain editable. |
| S-06 Reset / retry / interrupt / skip / previous | Submit, then Reset or Back before the result returns. Submit again after a rejected plan. On a later success, tap **Show all reasons**, then **Previous reason** until a later line disappears. Step back to the start: Previous hides; Show all remains. | Late results must not resurrect. Retry sends again. Reset restores the teaching defaults (Vanguard target Gate). Skip reveals every reason immediately. Previous steps back one reason. Outcome still says training-only / city unchanged. |
| S-07 Drawing vs scrolling | On phone (or Studio touch emulation if that is all that exists): (1) On Village and War, drag starting on a 44px action row and also use the mouse wheel. (2) Open Practice siege; drag starting on **Try this plan** / teaching copy to reach the board and back. (3) Draw with one finger; try a second finger on squad/target/submit. | **Run this row first on `bdcef2e`.** List must move for wheel and for a finger-style drag that starts on a button (the button must not fire). Drawing still pauses panel scroll and resumes on lift. A second finger cannot change squad, target, or submit, and cannot steal the drag. The 2026-09-11 emulator session could not wheel-scroll and needed a drag; that is the bug this row now re-checks. Full live checklist: [boot runbook S-07](2026-09-13-morgan-studio-boot-runbook.md#5-s-07-first--drawing-vs-scrolling-touchscroll). |
| S-08 320 / 390 layouts | Studio emulator or window at 320px and 390px wide. | All action buttons ≥ 44px, including **Try without a gate team**, **Show all reasons**, and **Previous reason** (the last two appear after a result). Teaching copy wraps. Squads still read Vanguard, Archers, Riders. Color is not the only squad cue (V / A / R letters). |
| S-09 Physical phone | Repeat S-01, S-03, S-05, S-06, S-07 on a real phone, including a weaker device if available. | Same rules. **Adam writes this row.** A desktop pointer or Studio emulator at phone width is **not** this row. |
| S-10 Stateless boundary | Do **not** diff an actively ticking normal world. Run the existing probe from repo root: `npm run check:practice-persistence`. | Probe uses a disposable DB, AI off. Expect HTTP 200/200/200 + 400, identical replay, durable DB/WAL/rows unchanged. Practice does not grant troops/resources or bump world version. |

## What this pack cannot close

- Unfamiliar-player understanding (D-13 / G-01): five testers, at least four complete unaided and explain one target/route change; all understand practice troops are not city troops.
- Adam’s fun/acceptance judgment.
- Captioned walkthrough: record only from an actual observed Play session after S-01 through S-06 are stable.
- Phase 2 opening, shield, real PvP, clans, shop.
- D-02 / OPEN-21: still waiting on Adam’s yes/no for the mutual first-war challenge. Do not invent a shield solution during this pack.

## Honest labels

| Evidence | Status 2026-09-12 |
|---|---|
| Source review + automated tests on `bdcef2e` | Fresh cloud rerun recorded in HANDBACK for `cursor/practice-pack-reconcile-dfeb` |
| S-01 Studio Play (iPhone XR emulator 896×414, **`41d541e` only**) | **PASS on that older tip, Adam-assisted.** FORT TAKEN; losses 5 / 5 / 4; training-only line present. Reaching Practice siege needed Adam’s help because the list would not wheel-scroll. **Not** an independent bot PASS. **Not** a `bdcef2e` result. See [S-01 note](2026-09-11-practice-studio-s01.md). |
| S-01 live Studio on `bdcef2e` | **NOT RUN** |
| S-02 Studio | **NOT RUN** |
| S-03 Studio | **NOT RUN** — automated pin is FORT HELD 8/7/5; live checklist in the reconciliation note |
| S-04 Studio | **NOT RUN** |
| S-05 Studio | **NOT RUN** |
| S-06 Studio | **NOT RUN** |
| S-07 Studio on `bdcef2e` (`TouchScroll`) | **NOT RUN** — required next acceptance. Exact checks in the [boot runbook](2026-09-13-morgan-studio-boot-runbook.md). Do not reuse the 2026-09-11 scroll-failure session as a pass. |
| S-08 Studio 320/390 | **NOT RUN** |
| S-09 physical phone | **NOT RUN** — **Adam-written, physical phone only.** A desktop pointer or Studio emulator at phone width is **not** this row |
| S-10 persistence probe | Automated; see HANDBACK for this rerun |
| Unfamiliar-player understanding (G-01) | **not verified** — the only Studio S-01 needed coaching to reach the planner |
| Two-client ownership/privacy | not required to close practice teaching; still **not verified** for the wider game |
| G-01 | **open** — Adam-assisted S-01 on `41d541e` is not enough |
| G-02 opening-design answers | **open** — **Adam-written only; not an emulator pass.** Yes/no on `docs/plans/2026-09-10-opening-decisions-for-adam.md`. Silence is not approval. Green gates do not start Phase 2. |
