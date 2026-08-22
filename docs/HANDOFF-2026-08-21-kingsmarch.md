# Kingsmarch (Roblox) — chat handoff, 2026-08-21

# ═══ START HERE ═══

**Game:** Kingsmarch — the KingsAge remaster, rebuilt on Roblox against a
Node/TypeScript world server that holds all authority.
**Repo:** `C:\Users\steam\Projects\apps\kingsage-remaster`, branch `main`,
tip `8e5f909`, everything pushed.
**Never ship the name "KingsAge"** — it belongs to the 2008 original's owners.
"Kingsmarch" is Adam's provisional working title.

## The one thing to resolve before writing more code

**The `roblox-design-team` skill was never used, and this game has no Canonical
Project Brief.** The skill (`~/.claude/skills/roblox-design-team/`) says to use
it *before approving anything for building*, and its first instruction is to
load `docs/design/CANONICAL-BRIEF.md` from the game's repo — **which does not
exist here.** Its own rule for that case: say so and build the brief with Adam
first, don't design against an imagined brief. That did not happen.

Five design calls were therefore made solo and have had no specialist lens and
no red team. They all work and are proven, but each one shapes how the game
plays:

1. **An attack musters the entire fighting garrison** — no partial army
   selection. Chosen for simplicity.
2. **Three orderable squads** (vanguard / archers / riders) where spec §5 asks
   for "~10–20 squads that think". Justified by matching the server's
   `CommandSquadId` vocabulary — but that is a spec tension resolved unilaterally.
3. **Surrender at 3× power**, and the defender's survivors defect to the
   attacker. Marked PROPOSED; nobody reviewed it.
4. **A two-minute deadline** after which the server fights your battle without you.
5. **The unplanned-attack fallback plan**, and the new intel-currency rule
   (report matches garrison + wall, rather than village version).

**Adam was asked which he wants first — build the Canonical Brief, or run the
design team over just those five — and has not answered yet. Get that answer
before building further.** Do not rip out working code; validate or adjust it.

## State: it RAN, for the first time

Four slices are built, pushed, and — as of 2026-08-21 22:10–22:15 — **proven in
Studio**: village loop, region world, scouting, the attack round-trip (slice A),
and the battle scene (slice B). One press of Play, self-driving tour, nobody at
the keyboard: scout → attack → open battle → three squad orders → charge, every
command accepted, all confirmed in the world database.

**Nine of eighteen drills now carry dated PASS lines** (S1–S3, B1–B2, C1–C4) in
`docs/superpowers/drills-*.md`.

Getting there cost two fatal defects that no offline test could have found, both
fixed in `2d32422` — players **spawned in the void and fell forever**, and every
village command **posted an empty `villageId`**. Full write-ups below.

## What is still owed

- **Drill C5 — the 200-troop phone measurement.** The only thing that needs a
  phone. `BattleConfig.MAX_SOLDIERS` is set from it. Until then the budget is
  adaptive (starts 200, culls to hold 30fps, floor 40) which is safe *only*
  because rendering decides nothing.
- Drills S4–S6, B4–B6, C6, and the "read it with your eyes" half of C2/C4.
- **Troops have never been seen.** The battle scene builds six-part anchored
  soldiers and the maths is confirmed, but nobody has watched the bodies draw.
  Cheapest outstanding check.
- ~~`npm run check:luau` cannot run — Lune is not installed.~~ **WRONG, corrected
  2026-08-22.** Lune 0.10.5 *is* installed and on the user PATH; the session
  that checked had a stale PATH and concluded from `where lune` that it was
  missing. Both Luau gates run: `npm run check:luau` (21 files compile) and the
  new `npm run check:luau-rules` (14 shared rules, RUN not just parsed).
- Conquest (slice C), VPS deploy, name vetting, art.

## Slice C — CONQUEST (2026-08-22) — offline-proven, Studio-unproven

Plan: `docs/superpowers/plans/2026-08-21-roblox-conquest-slice-c.md` (Codex's).
Drills: `docs/superpowers/drills-conquest.md` (**D1-D7**, none run yet — D1-D6
are C-numbered in the plan but C1-C6 already belong to the battle scene).

**The server half was already done and, unusually, already tested** — eight
tests in `server/test/roblox-conquest.test.ts` covering all six of the plan's
requirements plus two more. `applyConquest` in `store.ts` transfers the village
inside the settlement transaction, resets loyalty to 25, disperses the garrison,
consumes one Nobleman, re-seats a lost capital and kills a landless kingdom.

**But none of it could ever fire from a play session.** Two blockers, now gone:

1. `ATTACK_MUSTER_EXCLUDES` kept Noblemen home on *every* attack, so a march
   could never carry one. `applyConquest` was unreachable code.
2. There was no way to recruit a Nobleman — the war table had presets for
   spearmen and scouts only.

What shipped:

- `Buildings.mustersOnAttack` / `Buildings.musterFrom` — the muster rule AND
  the army construction now live in ONE shared function that the Roblox server
  dispatches from and the war table counts with. It was about to become a third
  mirrored copy, and mirrored copies are how a button promises one army while
  another marches.
- Conquest is an **explicit declaration**, never inferred: only a request that
  literally says `withNobles = true` conscripts one. A nil or a truthy string
  reads as a raid. The nobleman count is in the double-tap fingerprint, so a
  raid and a conquest on the same target are different intents.
- War table **NOBLEMEN** section: count on hand, Recruit 1 Nobleman, and a
  Raid/Conquest toggle. **Flipping the toggle disarms an armed attack** — the
  second tap must never inherit a meaning the first did not arm.
- `client/Celebration.luau` — banner, fireworks, coin shower, Skip. Client-only
  so it costs the network nothing; no Humanoids, one `BulkMoveTo` per frame, a
  hard part ceiling, and a generation counter so Skip kills shells still waiting
  to burst. Only the Skip button is `Active`, so it never eats a prompt tap. It
  bursts around the PLAYER, not the conquered keep — villages are thousands of
  studs apart, so bursting over the keep would make winning look like empty sky.
- The client fires it when a village id is **newly** in the owned set, never on
  the join seed, so a rejoin does not replay every conquest ever made.

**New offline coverage that did not exist before:**

- `roblox/scripts/rules-check.luau` — the first Luau in this project ever
  *executed* by a test. Fourteen shared rules including the exact army table
  that ships to the world server. Mutation-checked: making Noblemen ride on
  every raid fails it 2/14 and exits 1.
- A **wave campaign** test. Nothing covered it: every existing conquest test
  either posed loyalty low enough for one Nobleman or landed the claim in a
  single attack, so nothing proved loyalty *persists between attacks* — which
  conquest depends on entirely. It does, and a campaign lands in 3-5.

**Verified:** 21 Luau files compile, 14 rules pass, 19 core, 53 server, 39
roblox-layer (x3 clean), all four gate checkers, all three rojo builds.
**Not verified:** anything in Studio. D1-D7 are unrun.

### ⚠️ The open design question this slice uncovered

**A fresh kingdom cannot conquer anyone, and there is no on-ramp.**

Conquest needs 3-5 Noblemen (loyalty 100, 20-35 off per survivor) at 2800/3000/
3500 and 900s each, behind an Academy. That is a fine genre-standard commitment
curve. The problem is the target: **every fixture village carries the identical
30 spear / 12 sword / 10 archer garrison behind an identical wall** — including
the two the store renames "Unclaimed Hold", which are just open player seats,
not weak neutrals. A starting army attacking a peer *loses* (proven live:
*"Defeat. 2 survivors are returning home."*).

So "take over the world one settlement at a time" has no first rung. Tribal
Wars solves this with barbarian villages. **This is a design-team question, not
a call to make solo** — it is exactly the kind of decision the handoff already
flags five of. Flagged, not decided.

Meanwhile `KINGSAGE_DEV_SEED_NOBLES` (dev only, unset in production, tested
both ways) seeds Noblemen so the path can be *walked* and proven.
`start-dev.ps1` sets it to 5.

## What it looks like today

Grey boxes with floating labels, by design (spec §7). Villages, buildings, walls,
gate, war table and fog silhouettes are all real and correctly placed from map
coordinates. No art pass has ever been scheduled. Claude's suggestion, not yet
approved: a **silhouette pass** (distinct shape/roof/colour per building so a
Timber Camp reads as one without its label) before any mesh work — cheap, and it
stops the game looking like a debug scene. That is a design-team question.

## Environment as left (2026-08-21 22:20)

- World server **running on 4178** with `KINGSAGE_ROBLOX_KEY=dev-secret-local-0001`
  and `KINGSAGE_AUTO_RESOLVE_MS=25000`, logging to
  `%TEMP%\kingsage-world.log`. Migration 0006 is applied to the live dev DB.
- `rojo serve` **running on 34872** (demo project), Studio connected to it.
- Studio open on `roblox/WorldGame-demo.rbxlx`; the play session is **stopped**.
- Ports 4174/4177 host older processes — leave them alone.

⚠️ `docs/superpowers/plans/2026-08-21-roblox-conquest-slice-c.md` appeared during
that session and was **not written by Claude** — almost certainly Codex. It got
swept into a docs commit by a broad `git add docs`. Nothing was overwritten, but
treat it as Codex's and do not rewrite it.

## New environment traps from the live run

- **Studio can go windowless**: alive and foregrounded, every window reporting
  invisible, with a stuck "Lighting Technology Migration" dialog. Screen-control
  clicks are refused because nothing clickable is in front. Recovery: kill it,
  `rojo build` the place fresh, relaunch from the newest
  `%LOCALAPPDATA%\Roblox\Versions\**\RobloxStudioBeta.exe`, and click
  **Ignore** on Auto-Recovery (never Delete).
- **Connect the Rojo plugin mid-session** rather than rebuilding the .rbxlx
  Studio has open — that is what made the debug loop fast.
- **A refused order used to be invisible** (3-second toast, nothing in Output).
  Every order now logs itself accepted or refused with the village it named.
  Keep that; it turned an unexplainable dead session into a 5-minute diagnosis.

## Where to read (in order)

1. This START HERE block.
2. `docs/superpowers/specs/2026-08-20-roblox-world-is-the-game-design.md` — the
   approved design, authority for every rule.
3. The four executed plans in `docs/superpowers/plans/` (slice one, region,
   scouting, battles A, battles B).
4. `docs/superpowers/drills-*.md` — what has and has not been proven, with dates.
5. `roblox/README.md` — dev loop and Studio traps.
6. Everything below this block — the detailed history of each slice.

# ═══ END START HERE ═══

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

## FIRST FULL STUDIO RUN — 2026-08-21, 22:10–22:15 (Claude drove, screen access granted)

**It ran.** One press of Play, the self-driving tour, nobody at the keyboard —
scout → attack → open battle → three squad orders → charge, all accepted by the
world server, all confirmed in the database afterwards.

```
22:11:28 accepted scout          22:12:35 accepted battleOrder (x3)
22:12:00 accepted attack         22:12:48 accepted battleResolve
22:12:30 accepted battleOpen     22:13:27 refused build: cannot afford  (a real game rule)
```

Database after the run: scout report on Ember Crown Keep observing **30
spearmen** while world state still showed it fogged; battle **resolved**,
winner defender, **orderBonus 0.06 from 3 orders** — exactly what the offline
test predicted; notification *"Defeat. 2 survivors are returning home."*;
return march complete. The War tab listed all five neighbours nearest-first
with tile distances correct to the tile, every row marked *not scouted*, no
foreign level or count anywhere.

Results are logged per drill in `drills-scouting.md`, `drills-battles.md` and
`drills-battle-scene.md`. Passed: **S1, S2, S3, B1, B2 (scouted half), C1, C2,
C3, C4 (maths half)**. Still owed: S4–S6, B4–B6, C5 (**the phone
measurement**), C6, and every "read it with your eyes" half.

### Two fatal defects, neither findable offline (fixed in `2d32422`)

1. **Every player spawned in the void and fell forever.** The region is placed
   from map coordinates, so it sits thousands of studs from the origin — the
   ground spans X 620..8840, Z 2380..9280 and Roblox's default spawn is
   (0,0,0), outside it. The arrival teleport was best-effort and latched
   `teleported[player] = true` BEFORE it ran, so a character that was not ready
   yet was stranded permanently. Nothing else could happen: you cannot `MoveTo`
   a falling avatar. Arrival is now reliable and a rescue loop returns anyone
   under the world to their gate.
2. **Every village command posted an empty `villageId`.** A regression from the
   battles-slice-A type narrowing: the find-and-replace that swapped
   `request.villageId` for a local also rewrote the line it had just injected,
   leaving `local villageId = villageId or ""` — a self-reference resolving to
   nil. Every build, recruit, scout and attack sent `""` and the world server
   correctly refused it. **Offline tests could never catch this**: they call the
   API directly and never go through `CommandService`.

### And the reason the second one took so long

A refused order used to be invisible — a three-second toast and nothing in
Output. A whole play session could pass with NOTHING reaching the realm and no
way to tell why. **Every order now logs itself, accepted or refused, with the
village it named.** That single line is what turned an unexplained dead session
into a five-minute diagnosis.

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
