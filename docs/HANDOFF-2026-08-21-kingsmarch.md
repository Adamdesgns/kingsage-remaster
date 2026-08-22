# Kingsmarch (Roblox) — chat handoff, 2026-08-21

Read this first in a fresh chat. Code beats this note; then fix the note.
Everything below is committed and pushed on `main` (tip `7f474c9`). The design
gate is CLOSED — the spec is approved and slice one is built, reviewed, and
proven live on video. This is now ordinary forward development.

## The one-line state

The village loop is real and running on the authoritative world server; the
region world, scouting, the attack round-trip (battles slice A) and the battle
scene itself (battles slice B) have all shipped — **every one of them
offline-verified and NONE of them ever run in Studio**. Eighteen drills are
written across four files and zero have been run. The next rung is conquest
(slice C), but the thing actually owed is one press of Play.

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
4. `docs/superpowers/plans/2026-08-21-roblox-scouting-slice.md` — executed.
5. `docs/superpowers/plans/2026-08-21-roblox-battles-slice-a.md` — executed.
6. `docs/superpowers/plans/2026-08-21-roblox-battles-slice-b.md` — executed;
   its "Out of scope" section defines slice C (conquest + celebration).
7. `roblox/README.md` — the dev loop and the Studio traps.
8. This file's "next moves" section.

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

## Scouting slice (added 2026-08-21 night) — offline-proven, Studio-unproven

Plan: `docs/superpowers/plans/2026-08-21-roblox-scouting-slice.md`.
Drills: `docs/superpowers/drills-scouting.md` (S1–S6, none run yet).

**The world server needed no changes.** `march.launch` with `kind: "scout"`,
`materializeDueMarches` writing `ScoutReportState`, and the fog in
`getSnapshot` were all already there and correct — checked by reading before
writing anything. This slice is new verbs and views over data already in hand.

- `shared/Buildings.luau` — `TROOP_ORDER` (mirrors game-core), `SCOUT_PRESET`,
  `SCOUT_PARTY`, `troopName()`.
- `server/CommandService.luau` — `kind = "scout"` builds the `march.launch`
  command with a scouts-only army; fingerprint `scout:<from>:<target>:<qty>`
  so all four existing double-tap layers cover it unchanged. Local honest
  refusals (unknown target, own village, not enough scouts) save a round trip;
  everything else stays the world server's call.
- `client/init.client.luau` — the war table now has **Village** and **War**
  tabs. War shows scouts on hand, every foreign village nearest-first with
  realm and tile distance, live march countdowns, and report cards (real army
  troop-by-troop, resources, Rampart/HQ, age). Marches also appear in the HUD
  queue panel. One toast per genuinely new report, seeded silently on join so
  a rejoin never replays history.
- `server/test/roblox-scouting.test.ts` — 6 tests through the real
  `/api/roblox/*` routes. The load-bearing one: **the same snapshot that
  carries a scout report still shows that village fogged.**

- `demo/DemoTour.client.luau` — the self-driving tour now scouts too: opens
  the table, switches to War, sends a real scout at the nearest neighbour,
  wanders while the HUD countdown runs, returns for the report card. **One
  press of Play now produces video of drills S1–S3 with nobody at the
  keyboard** — the point, since three slices running have stalled on a human
  tap. It goes through the same RemoteFunction the button calls (a script
  cannot fire another script's `Button.Activated`), so the command path and
  every view are real and only the finger is simulated. The one piece of
  product code this needed is a labelled QA hook: a `DemoTab` attribute on the
  HUD ScreenGui switches the war-table tab. Nothing in the real game sets it
  and it carries no authority. It also never spends a village's last scout.

**Verified:** `npm run test:roblox-layer` 16/16, `npm run test:gate-d` 30/30
plus all four gate checkers. **Not verified:** anything in Studio, and the
Luau syntax gate (see the trap below).

**Defect found and fixed in passing:** `CommandService` used `math.trunc`,
which is not in Luau's math library — the recruit path would have thrown and
been swallowed by the `pcall` in `CommandService.queue`, surfacing to the
player as *"The realm didn't answer."* Replaced with `math.floor` (identical
here, since quantities are clamped ≥ 1). It was the only use in either Roblox
repo. Worth confirming in Studio that recruiting now works, since it may never
have.

## Battles slice A (added 2026-08-21 night) — offline-proven, Studio-unproven

Plan: `docs/superpowers/plans/2026-08-21-roblox-battles-slice-a.md`.
Drills: `docs/superpowers/drills-battles.md` (B1–B6, none run yet).

**This is the attack round-trip, NOT the battle scene.** No 3D fight, no live
squad orders, no replay, no conquest — those are slice B and stay gated on the
200-troop phone measurement, exactly as the "next moves" order says. What
slice A delivers: plan an attack on a village you scouted, send it, and get a
readable result whether or not you are online when it lands.

Three real gaps closed on the world server (`7578c2a`):

1. **An unattended attack used to strand forever.** `battle.resolve` is a
   player command, so an attack that arrived while its owner was offline
   parked an army outside a wall with nothing to resolve it. The plan now
   travels with the march (spec §5: attacks are *designed at the war table*,
   which is launch time), stored in a new `local_march_plans` table — a new
   table, not `ALTER TABLE`, because `migrate()` replays every migration on
   every boot and SQLite has no `ADD COLUMN IF NOT EXISTS`. On arrival the
   server stamps a deadline (`autoResolveMs`, default 2 min, env
   `KINGSAGE_AUTO_RESOLVE_MS`); `materializeDueBattles` opens and resolves
   anything past it. Showing up still matters: an absent commander issues no
   orders and so earns no order bonus. No plan at all falls back to
   `UNPLANNED_ATTACK_PLAN`, which deliberately does not score full marks.
2. **No surrender mechanic.** PROPOSED and deterministic: a beaten defender
   yields when the attacker won, someone survived to yield, and attacker power
   was ≥ `SURRENDER_POWER_RATIO` (3×) the defender's. Survivors leave the
   garrison and march home with the attacker. It cannot manufacture a soldier
   and never makes under-committing profitable. A token 2-man garrison is
   simply wiped — the 95% loss cap leaves nobody to yield, which is the rule
   working, not a bug.
3. **`finishBattle` was split** into `settleBattle(worldId, …)` plus a thin
   command wrapper, so the server settling an unattended battle goes through
   the identical path a player command does. One settlement rule, not two.

Roblox side (`12c72a2`): every neighbour row carries **Scout** and **Attack**;
attack is refused locally without a report and takes two taps (an attack
musters every fighting troop in the village — scouts and noblemen stay home);
an **ATTACK PLAN** section cycles the four axes from shared
`ATTACK_PLAN_AXES`, and `CommandService` rebuilds the plan from those same
axes rather than trusting the client's table; a **BATTLE REPORTS** section
renders what was already in the snapshot and nothing was reading — correct
from the defending side too. The demo tour now runs the whole chain, and
`start-dev.ps1` sets `KINGSAGE_AUTO_RESOLVE_MS=25000` so an unattended attack
settles inside a recording.

**Checked before claiming a defect:** `readBattleSessions` already returns
battles where the kingdom was attacker *or* defender, and both sides were
already notified. That gap was client-side only.

**Verified:** `npm run test:core` 19/19 (8 new, the surrender rule),
`npm run test:roblox-layer` 23/23 (7 new, the round-trip through the real API
routes), `npm run test:gate-d` 37/37, all four gate checkers, `rojo build`
clean. The pre-existing gate-d warfare test passes unchanged — that is the
evidence the refactor kept behaviour. **Not verified:** anything in Studio,
and the Luau gate (Lune still missing).

## Battles slice B (added 2026-08-21 night) — offline-proven, Studio-unproven

Plan: `docs/superpowers/plans/2026-08-21-roblox-battles-slice-b.md`.
Drills: `docs/superpowers/drills-battle-scene.md` (C1–C6, none run yet).

**Adam asked for this with the 200-troop phone measurement still missing.** It
is built to that: the budget is ADAPTIVE rather than guessed.
`shared/BattleConfig.luau` starts at `MAX_SOLDIERS = 200`, samples its own
frame time every two seconds, and culls rendered bodies until it holds
`TARGET_FPS`, never below `MIN_SOLDIERS = 40`. That is safe **only** because
nothing rendered can change an outcome — the maths is Gate D on the world
server and arrives finished. When the measurement finally happens it is a
config change, not a rebuild; drill C5 is written to capture it and to write
`docs/superpowers/spike-200-troops.md`.

- `client/BattleScene.luau` — a CLIENT module, so nothing it builds replicates
  and 200 soldiers cost the network nothing; every client seeds its randomness
  from `battle.seed`, so everyone sees the same fight with no syncing. Three
  rules inherited from the spike: no Humanoids, six anchored parts per soldier,
  ONE `workspace:BulkMoveTo` per frame for the whole field.
- **Two phases, split exactly where the maths is.** While a battle is `open`
  NOBODY dies — nothing has been decided, so the scene must not pretend. The
  moment it resolves, each side fells the same share of bodies the outcome
  killed, in seeded roster order, and the loser routs. Live view and replay are
  therefore literally the same code.
- **Three orderable squads** — vanguard / archers / riders — because those ARE
  the world server's `CommandSquadId` values; a fourth name would be an order
  the realm refuses. Each splits into up to `BLOCKS_PER_SQUAD` blocks, which is
  what puts a dozen-odd formations on the field.
- `CommandService` gains `battleOpen` / `battleOrder` / `battleResolve` /
  `battleRetreat`. Battle commands act on a battle, not a village, so the
  village-ownership guard is now scoped to the kinds that leave a village.
  Order sequence numbers are counted locally and corrected from the realm's own
  refusal, which names the number it wants.
- `BattleSessionState` gains `attackerArmy`, `defenderArmy` and
  `acceptedOrders` — without them a client cannot draw a battle that has not
  been decided yet, and cannot show that attending earned anything.
- `TILE_STUDS` / `WALL_HALF` moved into `shared/Config.luau` so the field forms
  up on the same ground `SettlementBuilder` put the village on.
- The demo tour now ATTENDS: opens the battle, takes the field, issues three
  real squad orders, calls the charge, watches the ending. One Play press
  carries slice B on camera (a `DemoBattle` attribute hook, twin of `DemoTab`).

### The defect slice B had to fix before it could work at all

**Attending was impossible in any world where time moves.** `battle.open`
required the scout report's `targetVillageVersion` to equal the village's
current `state_version` — but `accrueVillage` bumps `state_version` every time
a village earns a single log of wood. A report went "stale" within minutes no
matter what the defender did, so an attacker who **showed up** was refused
while one who **did not** still got their battle fought by the slice-A
deadline. Exactly backwards from spec §5's "showing up matters". Frozen-clock
tests hid it completely, because nothing accrues when time does not move.

`intelIsCurrent` replaces version equality: you must hold the report you claim
(its version is the receipt), and what that report promised — the garrison and
the wall an attack is planned around — must still be true. Resources earned
meanwhile change nothing an attacker planned for. Both halves are tested.

**Verified:** `npm run test:core` 19/19, `npm run test:roblox-layer` 29/29,
`npm run test:gate-d` 43/43, all four gate checkers, and all three Rojo
projects build. **Not verified:** anything in Studio, and the Luau gate.

**NOT in slice B, named so nobody assumes it shipped:** conquest and the
celebration — taking a village, noblemen, loyalty, the skippable spectacle.
That is slice C.

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
- The **entire scouting slice** in Studio: drills S1–S6 in
  `docs/superpowers/drills-scouting.md`. Its offline half is green, but no
  human has tapped the War tab.
- The **entire battles slice A** in Studio: drills B1–B6 in
  `docs/superpowers/drills-battles.md`. Same story — offline green, unplayed.
- The **entire battle scene (slice B)** in Studio: drills C1–C6 in
  `docs/superpowers/drills-battle-scene.md`. **C5 is the 200-troop phone
  measurement** — the number this project has owed for weeks.
- **The Luau syntax gate did not run for the scouting slice.** Lune is not
  installed on this PC (checked: no `lune`, no rokit, no aftman — only `rojo`
  from winget), so `npm run check:luau` cannot execute here. The Luau in this
  slice is hand-checked only until Lune is installed or Studio parses it.

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
  failures. Use gameplay, the HUD, or the evidence-run script. (A real
  ServerScript is fine: `evidence-run.luau` now requires `Buildings` that way.)
- **Lune is not installed on this PC**, so `npm run check:luau` cannot run
  here even though the repo advertises it. Only `rojo` is present (winget).
  Say the gate did not run rather than implying it did.
- **`math.trunc` does not exist in Luau.** It was in `CommandService` and would
  have thrown inside a `pcall`, showing the player "The realm didn't answer."
  Use `math.floor`/`math.round`; Blockshore's Luau never uses `math.trunc`
  either.
- **Adam is usually NOT at the PC** — he works from his phone. Anything that
  needs a keypress or a screen-control grant will sit unanswered for hours.
  He has denied computer-use access three times; do not keep asking. Prefer
  log-file watchers (Monitor) + ffmpeg recording, which need no grant:
  `gdigrab -i "title=<exact Studio window title>"`. ffmpeg lives under
  `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\...\bin\ffmpeg.exe`.
- Verify a recording actually contains gameplay (extract a frame) before
  sending it — the first attempt captured an idle editor.

## Next moves, in order

1. **Run the scouting drills in Studio** (`docs/superpowers/drills-scouting.md`,
   S1–S6, ~10 minutes). The slice is built and offline-green; nothing about how
   it FEELS is known. The fixture starts each village with 4 scouts, so S1–S4
   work immediately with no Stable. Install Lune while you are at it so
   `npm run check:luau` can gate Luau again.
2. **Measure the phone budget** and write `docs/superpowers/spike-200-troops.md`
   — now drill C5, which measures the REAL battle scene rather than the
   standalone spike. `BattleConfig.MAX_SOLDIERS` is set from the result.
3. **Battles slice C — conquest and the celebration.** Noblemen, loyalty, a
   village actually changing hands, and the big skippable spectacle spec §5
   asks for. Nothing so far transfers ownership. `conquestWarVictoryPoints`
   already exists in game-core and nothing calls it.
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
