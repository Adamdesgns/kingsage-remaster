# Practice siege wiring verification — 2026-09-04

**Scope:** local continuation of `36758fb` on `feat/practice-siege-codex`; based on unmerged `09cf525`. No merge, push, deployment, Roblox publication, or production request.

## Implemented

The current War tab opens a **Practice siege** planner. Its existing `QueueCommand` RemoteFunction carries `{kind: "practiceSiege", version, routes, objectives, defensePlan}`. The Roblox server validates through `PracticeSiegeConfig`, strips the local `kind`, and sends `practice.siege.resolve` to the existing authenticated endpoint. Accepted `payload.practiceSiege` and rejected `payload.message` pass through unchanged. Practice bypasses village ownership, live snapshot refresh, world-version repair, and battle-order repair; identity/online status, in-flight protection, and repeat protection remain.

The planner displays the fixed fort, tower ranges, starting flags, objectives, routes, ordered events, and server-provided reasons. Touch and mouse samples snap to whole grid coordinates and reduce to at most six route points while retaining the selected target. Editing invalidates the old result. Reset/closing invalidates pending callbacks and replay tasks. A world heartbeat cannot destroy an active stroke; a completed stroke refreshes stale result cards. A second finger cannot change squad, objective, edit, or submit during a stroke. Scrolling pauses during drawing and resumes on release; panel scroll survives replay refreshes but not navigation to a different page.

The shared Luau validator now accepts the complete v1 defense vocabulary while keeping `guardGate` as the UI default, rejects extra keys and malformed/sparse routes, and uses named fort geometry constrained against the TypeScript resolver.

## Passed evidence

| Command | Result |
|---|---|
| `npm run check:types` | game-core/server clean |
| `npm run test:core` | 101 passed, 0 failed |
| `npm run test:server` | 138 passed, 0 failed, 0 skipped; includes three real Luau/TypeScript contract tests |
| `npm run test:luau` | 40 syntax files, 72 existing rules, 7 simulations, 25 connection checks, 5 existing client scenarios, 272 practice contract checks, 28 bridge checks, 7 planner scenarios, 48 wiring checks; zero failures |
| `npm run check:practice-persistence` | real loopback HTTP accepted/repeat/changed-plan/rejected-plan requests; all rows and durable DB/WAL bytes unchanged |
| `powershell -ExecutionPolicy Bypass -File roblox/start-dev.ps1 -BuildOnly -Play` | Rojo development build passed; production credentials excluded |
| `git diff --check` | clean |

Contract mutation probes failed when validation, version, integer, target-contact, or backtracking guards were removed. Wiring mutation probes failed when the Practice entry, drawing guard, scroll restore, actual remote invocation, mounting branch, or exit cancellation was removed. These were in-memory mutations; temporary probe scripts were removed.

The planner gate executes the real module with UI/input/task doubles. The wiring gate executes extracted real `init.client.luau` functions and callbacks together. Neither is Roblox rendering or physical-touch proof.

### Durable-state probe

The probe creates a new temporary persistent database, links its test identity, checkpoints SQLite, and takes its baseline **after** joining. AI is off and materialization is delayed during the measured requests. The main database and WAL are compared byte for byte; every persisted table is also compared. SQLite's transient shared-memory coordination index is not claimed as durable game state. The temporary server and database are closed/removed after the probe.

Final probe: HTTP 200/200/200 and controlled 400; repeated request returned an identical response; 11 ordered events; `defenderWin`; clear decimal-coordinate rejection. SHA-256 values from this disposable run:

- Main DB: `27cf7ef8bed579a5e21163c66849a007bad4ae0ec13b989af0fb406906292ee1`
- Empty WAL: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- Persisted rows: `388812c0c28fc3dfb549bce5ee1574d88523a80f0bef8b115bdf8fdb3c706b65`

Fresh run hashes can differ because creating a player creates identifiers. Each run compares its own exact before/after bytes.

## Failed attempts and corrections

- Sandboxed Lune and Rojo launches returned Access denied. Narrowly approved runs with the installed executables passed. No product assertion was waived.
- Early planner test-double fixes: default instance name, mounting the scrolling frame, matching existing player-facing validation wording, and mounting before testing a submit. These were harness errors, not claimed game failures.
- The new two-finger check found a real missed Submit guard: it finished an active stroke. Submit now waits until drawing ends, and the check passes.
- Independent review found changing squads mid-stroke and stale result cards after release. Guards and release refresh were added before final verification.

## Studio checkpoint and remaining gate

No old Studio or loopback 4178 listener was running at session start. A new isolated world was started on `127.0.0.1:4178`, using the development-only key and a fresh database:

`server/data/practice-studio-6bdbf5e57e50421f93ab92fa9b6380cc.sqlite`

Health returned `{ok:true, service:"kingsage-world", contractVersion:1}`. The normal development place is `roblox/WorldGame-dev.rbxlx` (SHA-256 `2bd309f62a9b860f5997eb4aba5cc4c3c98caf638519a8f919367de5015b6fb6`). Both the generated place and database are ignored, not source deliverables.

A shell launch created a `RobloxStudioBeta` process (observed PID 33688, title RobloxStudio), but Computer Use returned no Studio window. The supported interactive launch then returned **`Computer Use app approval timed out`**. No game input, Play, screenshot, route drawing, or Roblox HTTP request was observed. Do not call this playable or visually accepted yet. Runtime process/window state must be checked again before resuming.

The local world server was left ready for the pending access/playtest step. No running preexisting app was killed or reconfigured. Studio launch/access state remains unverified.

After app access is granted: open the development place, Play, use War → Practice siege, draw all three routes, change targets, submit, inspect ordered reasons, test invalid feedback/reset/retry and 320/390 emulator layouts. Then do physical-phone acceptance and Adam's comprehension/fun review. Record the captioned practice walkthrough only from actual observed gameplay. The full-day real-game walkthrough, tutorial, beginner shield, starter cities/armies, human defenses, clans/chat, social areas, store, and jobs remain unbuilt or unverified as recorded in the locked roadmap.
