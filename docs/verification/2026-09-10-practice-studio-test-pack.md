# Practice siege Studio / phone test pack

**Date:** 2026-09-10  
**Author:** [Cursor]  
**Source revision to test:** tip of `cursor/practice-phase1-d06-c4e2` — code increment `01e173f` (`feat: make practice failure a one-tap no-gate-team lesson`). Re-record the SHA if this file moves again.  
**Place:** `roblox/WorldGame-dev.rbxlx` built from `roblox/default.project.json`.  
**Server for Play:** isolated loopback world on `127.0.0.1:4178` with a **fresh disposable** SQLite file. Do not use the live world.

This pack is for Adam when computer control and a physical phone are available. Cloud/Cursor cannot operate Studio or a phone. Until those runs exist, **G-01 stays open**.

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

4. Preferred isolated world for Play (fresh disposable DB, key `dev-secret-local-0001`, bind `127.0.0.1:4178`). Health must return `{ok:true, service:"kingsage-world", contractVersion:1}`.
5. In Studio: open that development place, HTTP requests on, Play.

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
| S-03 No-gate-team failure | From the teaching drawings (Reset if needed). Tap **Try without a gate team**. Do not redraw. Submit. | Banner: `No squad is opening the gate. Crossing the gate mark is not enough.` **FORT HELD**. Losses **8 / 7 / 5**. Reasons include `No squad was sent to open the gate` and three `gate is the only way in` / blocked-at-wall lines **even though the lines still cross x 50**. |
| S-04 One-target causality | Run S-01, then S-03, without changing any drawn points. | The **only** tactical change is Vanguard’s target: Gate → Keep. Same routes, same `guardGate` defense. First: TAKEN 5 / 5 / 4. Second: HELD 8 / 7 / 5. Do **not** use the retired `holdKeep` Rider x-50 vs x-40 pair — the planner cannot submit that. Optional freehand miss-the-gate (`PRACTICE_LOSING_CLOSED_GATE_PLAN`) is extra geometry, not this row. |
| S-05 Invalid input | Enter a decimal or backtracking route (or clear a route so it misses its target). Submit. | No server success card. Status names the squad and the problem. Routes remain editable. |
| S-06 Reset / retry / interrupt / skip / previous | Submit, then Reset or Back before the result returns. Submit again after a rejected plan. On a later success, tap **Show all reasons**, then **Previous reason** until a later line disappears. Step back to the start: Previous hides; Show all remains. | Late results must not resurrect. Retry sends again. Reset restores the teaching defaults (Vanguard target Gate). Skip reveals every reason immediately. Previous steps back one reason. Outcome still says training-only / city unchanged. |
| S-07 Drawing vs scrolling | On phone (or Studio touch emulation if that is all that exists): draw with one finger; try a second finger on squad/target/submit. | Panel scroll pauses while drawing and resumes on lift. A second finger cannot change squad, target, or submit. |
| S-08 320 / 390 layouts | Studio emulator or window at 320px and 390px wide. | All action buttons ≥ 44px, including **Try without a gate team**, **Show all reasons**, and **Previous reason** (the last two appear after a result). Teaching copy wraps. Squads still read Vanguard, Archers, Riders. Color is not the only squad cue (V / A / R letters). |
| S-09 Physical phone | Repeat S-01, S-03, S-05, S-06, S-07 on a real phone, including a weaker device if available. | Same rules. A desktop pointer at phone width is **not** this row. |
| S-10 Stateless boundary | Do **not** diff an actively ticking normal world. Run the existing probe from repo root: `npm run check:practice-persistence`. | Probe uses a disposable DB, AI off. Expect HTTP 200/200/200 + 400, identical replay, durable DB/WAL/rows unchanged. Practice does not grant troops/resources or bump world version. |

## What this pack cannot close

- Unfamiliar-player understanding (D-13 / G-01): five testers, at least four complete unaided and explain one target/route change; all understand practice troops are not city troops.
- Adam’s fun/acceptance judgment.
- Captioned walkthrough: record only from an actual observed Play session after S-01 through S-06 are stable.
- Phase 2 opening, shield, real PvP, clans, shop.
- D-02 / OPEN-21: still waiting on Adam’s yes/no for the mutual first-war challenge. Do not invent a shield solution during this pack.

## Honest labels

| Evidence | Status until Adam runs this pack |
|---|---|
| Source review + automated tests | Recorded in HANDBACK for this continuation |
| Actual Studio behavior | **not verified** |
| Physical-phone input | **not verified** |
| Unfamiliar-player understanding | **not verified** |
| Two-client ownership/privacy | not required to close practice teaching; still **not verified** for the wider game |
