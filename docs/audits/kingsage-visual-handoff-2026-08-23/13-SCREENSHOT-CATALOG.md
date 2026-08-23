# 13 — Screenshot Catalog

## Status: ALL 37 SCREENSHOTS ARE MISSING

**None of the required screenshots exist in this package, and none were
fabricated.**

### Why

The agent that assembled this package has **no access to a display, to Roblox
Studio's viewport, or to any screen-capture facility**. It reads source, runs
tests, queries the world database and reads Roblox's log files. It cannot see
the game.

Three screenshots were shared by Adam during development conversation, but they
exist only in that conversation — not as files on disk — so they could not be
included here.

**This is the largest single gap in the package** and it can be closed in one
Studio session.

## Catalog

| Filename | What it should show | Where to stand | Status |
|---|---|---|---|
| `01-spawn-wide-desktop.png` | Gate spawn, wide | Settlement gate, looking north up the main street | **NOT CAPTURED** |
| `02-spawn-player-eye-desktop.png` | Gate spawn, eye level | Character height at the spawn point | **NOT CAPTURED** |
| `03-keep-approach-desktop.png` | Main street approaching the keep | Halfway up the main street | **NOT CAPTURED** |
| `04-keep-exterior-desktop.png` | Keep exterior | Facing the keep doorway | **NOT CAPTURED** |
| `05-keep-interior-desktop.png` | Keep interior | Standing inside the keep | **NOT CAPTURED** |
| `06-war-table-wide-desktop.png` | War table, wide | Wherever WarTable.luau places it | **NOT CAPTURED** |
| `07-war-table-close-desktop.png` | War table, close | At the prompt | **NOT CAPTURED** |
| `08-main-street-forward.png` | Main street, gate to keep | Standing at the gate | **NOT CAPTURED** |
| `09-main-street-reverse.png` | Main street, keep to gate | Standing at the keep | **NOT CAPTURED** |
| `10-barracks-exterior.png` | Barracks exterior | East side of the settlement | **NOT CAPTURED** |
| `11-barracks-interior.png` | Barracks interior | Inside the Barracks | **NOT CAPTURED** |
| `12-economy-buildings-wide.png` | Economy cluster | West side: timber, quarry, iron, farm | **NOT CAPTURED** |
| `13-resource-building-close.png` | One resource building close | At the Timber Camp doorway | **NOT CAPTURED** |
| `14-housing-street.png` | Housing street | NOT BUILT - there is no housing | **NOT CAPTURED** |
| `15-wall-and-gate-interior.png` | Wall and gate from inside | Just inside the gate | **NOT CAPTURED** |
| `16-wall-and-gate-exterior.png` | Wall and gate from outside | Outside the gate looking back | **NOT CAPTURED** |
| `17-settlement-overhead.png` | Settlement overhead | War-table camera or a free camera above | **NOT CAPTURED** |
| `18-settlement-skyline.png` | Settlement skyline | From outside the wall at ground level | **NOT CAPTURED** |
| `19-region-exit.png` | Region exit | NOT BUILT as a designed moment - capture open wilderness instead | **NOT CAPTURED** |
| `20-building-interaction-ui.png` | Building ProximityPrompt | At any building | **NOT CAPTURED** |
| `21-construction-queue-ui.png` | Construction queue | Queue several builds first | **NOT CAPTURED** |
| `22-recruitment-ui.png` | Recruitment | At the Barracks prompt | **NOT CAPTURED** |
| `23-war-table-ui.png` | War table panel | Village tab open | **NOT CAPTURED** |
| `24-attack-planning-ui.png` | Attack planning | War tab, scouted target | **NOT CAPTURED** |
| `25-command-pending-ui.png` | Command pending | NOT BUILT | **NOT CAPTURED** |
| `26-command-success-ui.png` | Command success | After a successful upgrade | **NOT CAPTURED** |
| `27-command-failure-ui.png` | Command failure | Press Upgrade on a maxed building | **NOT CAPTURED** |
| `28-reconnect-ui.png` | Reconnect | NOT BUILT | **NOT CAPTURED** |
| `29-mobile-spawn.png` | Mobile spawn | Real phone, not emulation | **NOT CAPTURED** |
| `30-mobile-street.png` | Mobile street | Real phone | **NOT CAPTURED** |
| `31-mobile-building-ui.png` | Mobile building UI | Real phone | **NOT CAPTURED** |
| `32-mobile-war-table.png` | Mobile war table | Real phone | **NOT CAPTURED** |
| `33-battle-200-troops-wide.png` | 200-troop battle wide | Requires an attended battle | **NOT CAPTURED** |
| `34-battle-formation-close.png` | Battle formation close | During a battle | **NOT CAPTURED** |
| `35-battle-phone-evidence.png` | Battle on a phone | Real phone - this is drill C5 | **NOT CAPTURED** |
| `36-worst-looking-current-area.png` | Worst-looking area | Adam's judgement | **NOT CAPTURED** |
| `37-best-looking-current-area.png` | Best-looking area | Adam's judgement | **NOT CAPTURED** |

## How to capture these

1. Launch the playable place:
   `powershell -ExecutionPolicy Bypass -File roblox\start-dev.ps1 -Play -Fresh`
   The `-Fresh` flag is required or you will photograph a stale world.
2. Press the ▶ button (F5 is a brightness key on Adam's laptop).
3. Use Windows **Win+Shift+S** or Studio's own capture. **Crop out unrelated
   desktop windows.**
4. Save into `screenshots/` using the exact filenames above.
5. For the four mobile shots, use a **real phone** joined to the session. Studio's
   device emulator is NOT a phone test and must not be labelled as one.

## For each captured screenshot, record

- filename
- capture location
- camera position or description
- device (desktop / exact phone model)
- graphics setting
- build commit (`3c88874` at time of writing)
- what it proves
- known limitation

## Screenshots that cannot exist yet

| Filename | Reason |
|---|---|
| `14-housing-street.png` | **NOT BUILT** — the game has no housing buildings |
| `19-region-exit.png` | **NOT BUILT** — there is no designed transition; you simply walk out |
| `25-command-pending-ui.png` | **NOT BUILT** — no pending state exists |
| `28-reconnect-ui.png` | **NOT BUILT** — no reconnect UI exists |
| `33/34/35 battle shots` | Require an attended battle against a scouted target; possible but not yet done |
