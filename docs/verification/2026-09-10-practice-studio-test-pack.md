# Practice siege Studio / phone test pack

**Date:** 2026-09-10  
**Author:** [Cursor]  
**Source revision to test:** the commit that lands this file on `cursor/practice-phase1-d06-c4e2` (re-record the SHA after checkout).  
**Place:** `roblox/WorldGame-dev.rbxlx` built from `roblox/default.project.json`.  
**Server:** isolated loopback world on `127.0.0.1:4178` with a **fresh disposable** SQLite file. Do not use the active world.

This pack is for Adam when computer control and a physical phone are available. Cloud/Cursor cannot operate Studio or a phone. Until those runs exist, G-01 remains **not verified**.

Pinned plans live in `packages/game-core/src/practice-siege-fixtures.ts`. Do not invent a different “winning” route after seeing a result.

## Setup (inspect first; do not kill unknown apps)

1. Confirm no unexpected Studio or world-server process is already using the intended place/port. If Adam already has a session, ask before changing it.
2. From repo root, start an isolated world (AI off if the start script allows it; otherwise use a fresh database and accept that economy ticks are not practice mutations):
   - Key: `dev-secret-local-0001`
   - Bind: `127.0.0.1:4178`
   - Database: new file under `server/data/`, never the live world.
3. Health must return `{ok:true, service:"kingsage-world", contractVersion:1}`.
4. Build the development place: `powershell -ExecutionPolicy Bypass -File roblox/start-dev.ps1 -BuildOnly -Play` on Adam’s PC, or the documented Rojo development build. Production credentials must stay excluded.
5. In Studio: open that development place, HTTP requests on, Play.

## Teaching copy to read before drawing

The planner must show, in readable 14px-class text:

- `Practice army — your city troops are safe.`
- `Clearing a tower stops its arrows. Only an opened gate lets anyone inside.`

If either line is missing, stop. Do not continue a comprehension study on stale teaching.

## Scenarios

Record for each: date, commit SHA, place hash if known, observed outcome, casualties, first two or three reasons, device, and a screenshot/video path **outside** the repo (continue the 2026-09-04 proof folder or a new dated folder).

| ID | Player action | Expected server result |
|---|---|---|
| S-01 Reset teaching plan | Open War → Practice siege. Do not redraw. Submit. | **FORT TAKEN**. Losses **5 / 5 / 4**. Gate opens. All three squads enter through the open gate. Towers are cleared, then the keep falls. |
| S-02 Three drawn routes | Reset. Manually draw Vanguard through GATE, Archers through WEST then GATE, Riders through EAST then GATE. Submit. | Same family as S-01 if the drawn points match the teaching defaults. If the player’s line wanders through tower range longer, casualties may rise, but all three must still enter **only** if they cross at the gate. |
| S-03 Closed-gate failure | Reset. Change Vanguard target to Keep. Draw all three routes **past** the towers / left and right wall, missing the gate opening (x 44–56). Submit. | **FORT HELD**. Reasons include `No squad was sent to open the gate` and three `gate is the only way in` blocks. Clearing towers must **not** let anyone inside. |
| S-04 One-route causality | Use the pinned pair: first Rider route through the open gate (x 50), then an otherwise identical plan whose Rider crossing is x 40. Same objectives and `holdKeep` defense. | First: **FORT TAKEN**, Rider enter, losses **5 / 4 / 2**. Second: **FORT HELD**, Riders blocked at the wall, losses **11 / 8 / 5**. The only tactical change is the Rider crossing. |
| S-05 Invalid input | Enter a decimal or backtracking route (or clear a route so it misses its target). Submit. | No server success card. Status names the squad and the problem. Routes remain editable. |
| S-06 Reset / retry / interrupt | Submit, then Reset or Back before the result returns. Submit again after a rejected plan. | Late results must not resurrect. Retry sends again. Reset restores the teaching defaults. |
| S-07 Drawing vs scrolling | On phone (or Studio touch emulation if that is all that exists): draw with one finger; try a second finger on squad/target/submit. | Panel scroll pauses while drawing and resumes on lift. A second finger cannot change squad, target, or submit. |
| S-08 320 / 390 layouts | Studio emulator or window at 320px and 390px wide. | All action buttons ≥ 44px. Teaching copy wraps and stays readable. Squads still read Vanguard, Archers, Riders. Color is not the only squad cue (V / A / R letters). |
| S-09 Physical phone | Repeat S-01, S-03, S-05, S-07 on a real phone, including a weaker device if available. | Same rules. A desktop pointer at phone width is **not** this row. |
| S-10 Stateless boundary | After S-01, inspect the isolated database with the existing `npm run check:practice-persistence` probe, or a new disposable probe. | Practice does not grant troops/resources or bump world version. Do not diff an actively ticking normal world. |

## What this pack cannot close

- Unfamiliar-player understanding (D-13 / G-01): five testers, at least four complete unaided and explain one route change; all understand practice troops are not city troops.
- Adam’s fun/acceptance judgment.
- Captioned walkthrough: record only from an actual observed Play session after S-01 through S-06 are stable.
- Phase 2 opening, shield, real PvP, clans, shop.

## Honest labels

| Evidence | Status until Adam runs this pack |
|---|---|
| Source review + automated tests | Recorded in HANDBACK for this continuation |
| Actual Studio behavior | **not verified** |
| Physical-phone input | **not verified** |
| Unfamiliar-player understanding | **not verified** |
| Two-client ownership/privacy | not required to close practice teaching; still **not verified** for the wider game |
