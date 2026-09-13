# Morgan Studio boot runbook — `bdcef2e` (S-07 then S-03)

**Date:** 2026-09-13  
**Author:** [Cursor] (cloud; AlienAdam PC was shut down — this is a cold-boot script)  
**For:** Morgan on Adam’s PC, then Adam / Codex review  
**Code to Play:** `cursor/practice-touch-scroll-da9e` @ **`bdcef2e7c16a6fa83215d2c34a0e2e07bf449bfd`** (open PR #8)  
**Repo:** https://github.com/Adamdesgns/kingsage-remaster  
**Place to open:** `roblox/WorldGame-dev.rbxlx`  
**This increment:** documentation only. No gameplay source change. No merge. No Roblox publish. No Phase 2.

Cloud cannot operate Studio or a phone. Automated gates already recorded on this tree are **not** a Studio PASS.

Read this file first. The pack matrix lives in [2026-09-10 test pack](2026-09-10-practice-studio-test-pack.md). Branch map: [2026-09-12 reconciliation](2026-09-12-practice-branch-reconciliation.md). S-01 history: [2026-09-11 note](2026-09-11-practice-studio-s01.md).

## Do not launder

| Claim | Truth |
|---|---|
| S-01 on `41d541e` (2026-09-11) | **Adam-assisted** Studio PASS: FORT TAKEN, losses 5 / 5 / 4, training-only line. Reaching Practice siege needed Adam because the list would not wheel-scroll. **Not** an independent bot PASS. **Does not transfer** to `bdcef2e`. |
| S-01 / S-07 / S-03 on `bdcef2e` | **NOT RUN** in Studio. |
| Green `npm` gates | Recorded. **Not** Studio PASS. **Not** G-01 closed. **Not** permission to start Phase 2. |
| **S-09** | **Physical phone only.** Adam writes the result. A Studio emulator or desktop pointer at phone width is **not** this row. |
| **G-02** | **Adam-written answers only.** See `docs/plans/2026-09-10-opening-decisions-for-adam.md`. Silence is not approval. Not an emulator pass. |

The 2026-09-11 evening leftover world (PID 20752, `practice-pr7-20260910-170938.sqlite`) **died with the PC**. Do not look for that process. After boot, inspect what is actually running.

## 0. Inspect first — do not kill unknowns

After Windows is up, look before you start or stop anything.

```powershell
Get-NetTCPConnection -LocalPort 4178 -State Listen -ErrorAction SilentlyContinue |
  Format-Table LocalAddress, LocalPort, State, OwningProcess -AutoSize
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -match 'RobloxStudio|node' } |
  Select-Object ProcessId, Name, CommandLine
```

Rules:

- If Studio, a world server, or **:4178** is already in use, **identify the owner** (window title, command line, database path). Do **not** kill an unknown Studio or `:4178` process.
- The pack uses **4178**. Leave 4174 / 4177 alone.
- Do **not** run `roblox/start-dev.ps1` without `-BuildOnly` unless you have already confirmed 4178 is free or is *this* disposable pack world. Without `-BuildOnly` the script may reuse an existing 4178 listener and starts AI at 45 seconds.
- `-Fresh` may stop only this project’s `node.exe *index.ts*` listener. It still must not be used against an unidentified owner.

If 4178 is already a healthy disposable pack world (health JSON below, AI off, scratch SQLite), reuse it. If you cannot tell, leave it and ask Adam.

## 1. Load this exact revision

From the repo root (`kingsage-remaster`):

```powershell
git fetch origin cursor/practice-touch-scroll-da9e
git checkout --detach bdcef2e7c16a6fa83215d2c34a0e2e07bf449bfd
git rev-parse HEAD
git log -1 --oneline
```

`git rev-parse HEAD` must print `bdcef2e7c16a6fa83215d2c34a0e2e07bf449bfd`.  
`git log -1 --oneline` must be `bdcef2e fix: touch scroll uses event position and owns one finger per drag`.

Do **not** Play `41d541e`, `0f3625a`, `main`, or a leftover `WorldGame-dev.rbxlx` from an older tip.

This runbook itself lives on docs branch `cursor/practice-pack-reconcile-dfeb` (draft PR #9). That branch is docs-only on top of `bdcef2e`. **Play the detached `bdcef2e` checkout**, not the docs tip, so the place hash matches the code SHA.

## 2. Build the development place only

Does **not** start a world server and does **not** launch Studio:

```powershell
powershell -ExecutionPolicy Bypass -File roblox/start-dev.ps1 -BuildOnly -Play
```

That is `rojo build roblox/default.project.json -o roblox/WorldGame-dev.rbxlx`. Production credentials stay excluded.

Confirm the file is this tip:

```powershell
Select-String -Path roblox\WorldGame-dev.rbxlx -Pattern 'TouchScroll|steersDrag|wheelPointer|ElasticBehavior' |
  Select-Object -First 15
Get-FileHash roblox\WorldGame-dev.rbxlx -Algorithm SHA256
```

You must see `TouchScroll`, event-`Position` / `wheelPointer`, one-finger `steersDrag`, and `ElasticBehavior` Never. Record the new SHA-256 (a rebuild is a new hash). The 2026-09-11 PC rebuild of this same tip was SHA256 `D6CAE1131EC3A66ADB4BAB97EB2B6D54F86FE7E193A4E1B5B76E736BD200AFEC` (418,456 bytes) — reuse that file only if you prove it is still this SHA and still contains those strings.

## 3. Disposable world + health

Preferred pack world: loopback **`127.0.0.1:4178`**, **fresh disposable** SQLite, key `dev-secret-local-0001`, **AI off**. Do not use the live world. `KINGSAGE_DATABASE_PATH` resolves relative to `server/`.

Only if step 0 showed **nothing listening on 4178**:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$env:PORT = '4178'
$env:KINGSAGE_BIND = '127.0.0.1'
$env:KINGSAGE_ROBLOX_KEY = 'dev-secret-local-0001'
$env:KINGSAGE_AI_TICK_MS = '0'
$env:KINGSAGE_DATABASE_PATH = "data/practice-studio-$stamp.sqlite"
npm run start:world
```

Keep that window open. Then:

```powershell
Invoke-RestMethod http://127.0.0.1:4178/api/health
```

or:

```powershell
curl.exe -s http://127.0.0.1:4178/api/health
```

**Must** be exactly:

```json
{"ok":true,"service":"kingsage-world","contractVersion":1}
```

If health is anything else, **stop**. Do not Play.

## 4. Studio Play

1. Open **`roblox/WorldGame-dev.rbxlx`** (the file from step 2). Not demo. Not live.
2. Game Settings → Security → **Allow HTTP Requests** = ON.
3. Device emulator: iPhone XR landscape **896×414** is acceptable for **S-07 and S-03 only**.
4. Press Play. Development speaks only to `http://127.0.0.1:4178`.

Record outside the repo (continue the dated Kingmarch proof folder): date, `bdcef2e`, place SHA-256, health JSON, device, and a short clip per row.

## 5. S-07 first — drawing vs scrolling (`TouchScroll`)

This is why `bdcef2e` exists. The 2026-09-11 emulator session is the **failure** (no wheel-scroll; Adam had to help). Do not reuse that session as a pass.

Pinned helper: `roblox/src/client/TouchScroll.luau` (10px drag threshold, 48px wheel step, one owning `InputObject`, no-op on `RouteCanvas` / `ScrollingEnabled == false`).

### Player steps

1. Village tab. Hover the list Body. Use the **mouse wheel**. Then start a finger-style drag **on a 44px action row** (not a gap).
2. War tab. Repeat wheel and a drag that starts on a 44px action row. Practice siege is the first War action — you should be able to reach it by scrolling, not only by Adam spotting it.
3. Open **Practice siege**. Drag starting on **Try this plan** and on the teaching copy until the board is in view, then drag back.
4. Draw with **one** finger on the board (`RouteCanvas`).
5. While that finger is down, put a **second** finger on a squad button, a target, and **Try this plan**.

### Must see (PASS)

| Check | Exact expectation |
|---|---|
| Wheel on Village | List **moves**. Native `ScrollingFrame` wheel is dead under touch emulation; this helper must write `CanvasPosition`. |
| Wheel on War | Same. |
| Drag starting on a 44px button (Village and War) | List **moves**. The button **does not fire**. |
| Practice: drag from **Try this plan** / teaching copy | Panel scrolls to the board and back. |
| One-finger draw | A route is drawn. Panel scroll **pauses** while drawing and **resumes on lift**. |
| Second finger | Must **not** change squad, target, or submit. Must **not** steal the drag. |
| Scrollbar | Body scrollbar stays visible (10px). |

### FAIL

- Wheel does nothing over the list.
- A drag that starts on a button opens the row / fires **Try this plan** / changes squad instead of scrolling.
- Drawing also scrolls the panel, or scroll stays dead after lift.
- A second finger steers the list, re-arms a tap, changes squad/target, or submits.

S-07 PASS on the emulator is **not** S-09 and **not** G-01 closed.

## 6. S-03 next — no-gate-team failure

Source of truth: `PRACTICE_NO_GATE_TEAM_PLAN` in `packages/game-core/src/practice-siege-fixtures.ts`. Resolver pin: `defenderWin`, casualties `{ vanguard: 8, archers: 7, riders: 5, total: 20 }`. Player-facing losses line is formatted in `PracticeSiege.luau`.

Do **not** redraw. Do **not** invent a different losing route.

### Player steps

1. Still in **Practice siege** (War → Practice siege if you backed out).
2. If the board is dirty, tap **Reset all routes** so you have the teaching defaults.
3. Tap **Try without a gate team**. Do not touch the board.
4. Confirm the three drawings are unchanged (Vanguard down x 50; Archers west-then-gate; Riders east-then-gate). Only Vanguard’s target changed: Gate → Keep.
5. Read the copy in the table below. If a standing teaching line is missing, **stop** — the place is stale.
6. Tap **Try this plan**.

### Must see before submit

| Surface | Exact copy |
|---|---|
| Teaching line (14px, emphasized) | `No squad is opening the gate. Crossing the gate mark is not enough.` |
| Status | `No squad is opening the gate. Everyone will be stopped at the wall. Try this plan, then reset and compare.` |
| Standing teaching | `Practice army — your city troops are safe.` |
| Standing teaching | `Clearing a tower stops its arrows. Only an opened gate lets anyone inside.` |
| Control | Full-width **Try without a gate team** still present |

### Must see after the server result

| Surface | Exact expectation |
|---|---|
| Outcome banner | **FORT HELD** (not FORT TAKEN) |
| Training line | `Training only. Your city troops and stock did not change.` |
| Losses | `Losses: Vanguard 8 · Archers 7 · Riders 5` |
| Gate explanation | A revealed reason reads `No squad was sent to open the gate.` |
| Wall explanations | Three blocked-at-wall lines, one per squad: `Vanguard reached x 50, but the gate is the only way in and it was closed or missed.` / `Archers reached x 50, but the gate is the only way in and it was closed or missed.` / `Riders reached x 50, but the gate is the only way in and it was closed or missed.` — **even though every line still crosses x 50**. |
| Entry | No squad enters. Nobody is described as following a route through an open gate. |

**FAIL** if the banner is FORT TAKEN, if losses are not 8 / 7 / 5, if the gate-skip reason is missing, or if a squad enters through the gate.

Optional same session: **S-04** — Reset / **Try this plan** (no redraw) → FORT TAKEN, losses 5 / 5 / 4, then this row again. The only tactical change is Vanguard’s target. Do not use the retired `holdKeep` Rider x-50 vs x-40 pair.

## 7. What this run does **not** close

| ID | Who / where | Why it is not this Play |
|---|---|---|
| **S-09** | Adam, **physical phone** | Repeat S-01, S-03, S-05, S-06, S-07 on a real device (weaker phone if available). Emulator PASS is not S-09. |
| **G-02** | Adam, **written** | Yes/no on D-01 / D-02-storage / D-08 / D-09 / D-10 and the mutual first-war ask in `docs/plans/2026-09-10-opening-decisions-for-adam.md`. Not a Studio row. |
| G-01 | Unfamiliar-player study + Adam acceptance | One emulator S-07 / S-03 does not close it. |
| S-02, S-05, S-06, S-08 | Later Studio | Still unrun. Not required to start this boot. |
| Phase 2 / merge / publish | Adam only | Explicitly out of scope. |

## 8. Automated gates already on this tree (not Studio)

Recorded 2026-09-12 on the `bdcef2e` tree (Lune 0.10.5, TypeScript 5.9.3). This 2026-09-13 increment did not change gameplay source and did not re-run them.

| Command | Result |
|---|---|
| `npm run check:types` | pass — game-core/server type-clean |
| `npm run test:core` | 104 passed, 0 failed |
| `npm run test:server` | 139 passed, 0 failed |
| `npm run test:luau` | 42 syntax; 72 rules; 7 simulations; 25 connections; 6 client audits; 272 contracts; 28 bridge; 12 planner; 54 wiring; **11 touch-scroll**; 0 failed |
| `npm run check:practice-persistence` | HTTP 200/200/200 + 400; identical replay; durable DB/WAL/rows unchanged |
| Rojo / `start-dev.ps1 -BuildOnly` | PC continuation already rebuilt this tip. Cloud image has no Rojo. |
| Studio Play of `TouchScroll` (S-07) | **NOT RUN** |
| S-03 live Studio | **NOT RUN** |
| Physical phone (S-09) | **NOT RUN** |
| G-02 | **NOT RUN** — Adam-written |

**Green automated gates ≠ Studio PASS.**
