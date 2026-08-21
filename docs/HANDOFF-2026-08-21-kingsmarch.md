# Kingsmarch (Roblox) — chat handoff, 2026-08-21

Read this first in a fresh chat. Code beats this note; then fix the note.
Everything below is committed and pushed on `main` (tip `8ef704f`). The design
gate is CLOSED — the spec is approved and slice one is built, reviewed, and
proven live on video. This is now ordinary forward development.

## The one-line state

The village loop is real and running on the authoritative world server; the
region world (neighbors + wilderness + fog) shipped today; the next rung is
**scouting from the war table**, then battles.

## Names and identity

- The game is **"Kingsmarch"** — Adam's working title, chosen 2026-08-21 and
  explicitly provisional ("probably change it later, not even a big deal").
  Runners-up: Emberfall (already the seed world's name in Gate B), Realmfall.
- **It can NEVER ship as "KingsAge"** — that belongs to the 2008 original's
  owners (same playbook as JARVIS → KEORIS). The repo/folder keeps the old
  name; nothing player-facing may. Full name vetting (Roblox search,
  trademark, handles) happens before any publish or marketing.

## Where to start reading

1. `docs/superpowers/specs/2026-08-20-roblox-world-is-the-game-design.md` —
   the approved design ("The World Is the Game"). Authority for every rule.
2. `docs/superpowers/plans/2026-08-21-roblox-slice-one.md` — executed.
3. `docs/superpowers/plans/2026-08-21-roblox-region-slice.md` — executed.
4. `roblox/README.md` — the dev loop and the Studio traps.
5. This file's "next moves" section.

## What exists and works (verified, not assumed)

**Server (`server/`, Node + TypeScript + node:test + SQLite dev store):**
- Roblox identity: migration `0005_roblox_identity.sql`,
  `store.linkRobloxPlayer()` claims one seat per Roblox UserId, forever.
  Web `register()` and this path share `findOpenSeat`/`occupySeat` so both
  found kingdoms identically.
- Secret-authed `/api/roblox/session | state | commands`, gated structurally
  (`path.startsWith("/api/roblox/")` → `requireRobloxKey`), so a future route
  cannot forget the check. Fail-closed without the key.
- Commands are the existing Gate A idempotent envelope; a replayed commandId
  returns the stored result (never a second charge).
- Tests: `npm run test:gate-d` (24 server + 11 core + gate checks) and
  `npm run test:roblox-layer` (10 focused). All green at `8ef704f`.

**Roblox (`roblox/`, Rojo + Luau):**
- `ApiClient` — the only HTTP speaker; bounded transport retries; an HTTP
  answer is final. `postFull` exposes status; `post` is the simple form.
- `WorldSession` — session on join (plus a sweep for players already present),
  ONE batched 10s heartbeat chunked at 50 ids, honest connecting/online/
  offline status, clock offset anchored to `workspace:GetServerTimeNow()`.
  A 4xx (e.g. WORLD_FULL) stops retrying and says so honestly.
- `SettlementBuilder` — REGION renderer: every village in the snapshot at
  `(x*220, y*220)`; own villages full (13 buildings, prompts, gate spawn +
  `RespawnLocation`), foreign ones fog silhouettes (walls + generic keep +
  kingdom banner, **zero prompts, zero level info**); deterministic wilderness
  forest. Exports `greyPart`/`labelFor` as the shared part factory.
- `CommandService` — build/recruit from prompts and war-table buttons, with
  LAYERED double-tap protection: per-player in-flight lock, 2s same-intent
  window, commandId reuse for transport, and a version-conflict retry that
  only fires for cross-player bumps. Auth errors never leak to players.
- `WarTable` — slab at the keep; prompt lifts the client camera into the
  overhead command view and carries `villageId`.
- `src/client/init.client.luau` — HUD (resources, queue rows with
  display-only countdowns), toasts, table panel (rebuilds on every sync),
  holding scene / reconnect banner / outdated-version modal.
- `src/shared/Buildings.luau` + `TimeUtil.luau` — single source for building
  order/names (mirrors game-core), the recruit preset, and ISO parsing.
- `spike/` — 200-troop no-Humanoid battle place with a client FPS meter.
- `demo/` + `demo.project.json` — self-driving tour that plays the game for a
  camera (walks, orders a real upgrade, recruits, uses the table, loops).
- `scripts/evidence-run.luau` — DataModel-only harness (⚠️ never the Studio
  command bar) that now also asserts the foreign fog never leaks.
- `scripts/syntax-check.luau` — `npm run check:luau`, compiles all 17 Luau
  files with the real compiler via Lune. Rojo alone never parses them.

## Proven live (2026-08-21, on video)

A real Studio session founded `Dadisaking86` → `kingdom-5`, built the
settlement from live state, showed real resources (Wood 1389 / Stone 1374 /
Iron 1404), accepted a real `village.build.queue` and displayed its server
countdown ("Timber Camp → Lv 2 — 10:33"), with the demo tour driving. 95s
recorded via ffmpeg and delivered to Adam. Evidence noted at the top of
`docs/superpowers/drills-slice-one.md`.

## What is NOT proven yet

- The five formal drills in `docs/superpowers/drills-slice-one.md`
  (wall-clock across rejoin, restart, double-tap, sabotage, phone) — written,
  not yet run as written.
- The 200-troop spike has never been MEASURED on a phone (numbers doc
  `docs/superpowers/spike-200-troops.md` does not exist yet). This gates the
  battle slice's fidelity assumptions.
- The region world has not been walked in Studio yet — it was built after the
  recording; the currently-open Studio window still holds the older build.

## How to run it (the loop that works)

```
powershell -ExecutionPolicy Bypass -File roblox\start-dev.ps1
```
Starts the world server on **4178** (`KINGSAGE_ROBLOX_KEY=dev-secret-local-0001`),
rebuilds `WorldGame-demo.rbxlx`, and opens the CURRENT Studio. Then press
**Play** (F5 is a brightness key on Adam's laptop — use the ▶ button or Fn+F5).

- `roblox/src/server/SecretConfig.luau` (gitignored) must hold the same key;
  copy `SecretConfig.example.luau` if it's missing.
- HttpEnabled is baked into the project files — no Game Settings step.
- Ports 4174/4177 may host older processes: leave them alone.

## Environment traps (hard-won, do not relearn)

- **Studio auto-updates kill the running Studio AND stale the file
  association.** Always launch by finding the newest
  `%LOCALAPPDATA%\Roblox\Versions\**\RobloxStudioBeta.exe` (start-dev.ps1
  does). An "Auto-Recovery" dialog after a crash: click **Ignore** (never
  Delete — it wipes recovery files that may belong to Blockshore).
- **Never test service internals from the Studio command bar** — it returns a
  second, uninitialised copy of every module and prints confident false
  failures. Use gameplay, the HUD, or the evidence-run script.
- **Adam is usually NOT at the PC** — he works from his phone. Anything that
  needs a keypress or a screen-control grant will sit unanswered for hours.
  He has denied computer-use access three times; do not keep asking. Prefer
  log-file watchers (Monitor) + ffmpeg recording, which need no grant:
  `gdigrab -i "title=<exact Studio window title>"`. ffmpeg lives under
  `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\...\bin\ffmpeg.exe`.
- Verify a recording actually contains gameplay (extract a frame) before
  sending it — the first attempt captured an idle editor.

## Next moves, in order

1. **Scouting from the war table (in progress, nothing written yet).** The
   server already has everything: `march.launch` with `kind: "scout"` →
   `MarchState` → `ScoutReportState` (target name, observed army/resources/
   buildings) in the snapshot. Roblox side needs: a target list in the table
   panel (foreign villages from the snapshot), a "Send scout" command, a
   marches panel showing travel countdowns, and a report view. The village's
   `army.scout` count is the gate — if the fixture starts with zero scouts,
   recruit-a-scout must exist first (check `packages/game-core/src` fixture
   and `troopRequirementProblem`).
2. **Measure the 200-troop spike on a phone**, write
   `docs/superpowers/spike-200-troops.md`. Publish the spike place PRIVATE.
3. **Battles slice** — the design's biggest piece: march → attend live or get
   a 3D replay, Gate D math as the authority, surrender absorbs the
   defender's troops, and a big skippable conquest celebration.
4. **VPS pick + deploy** (~$5/mo, always-on) and secret management. Until
   then only Studio can reach the world server; published Roblox servers
   cannot call 127.0.0.1.
5. Formal drills + first art pass (teen medieval, ~13+) whenever they fit.

## House rules that still apply

Vault rituals every session: Daily bullet (`**[Claude]**`), project hub
frontmatter, Dev Log line, Open Loops row (KingsAge row is **163**).
Append-only beside Codex's entries. Claude does all git; pushing this repo
needs no extra approval. Propose, then execute. Never enter Adam's
PIN/passwords.
