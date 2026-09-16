# HANDBACK — FORT HELD now explains itself; G-01 still open

**Updated:** 2026-09-16 by [Cursor] (cloud). **Working branch:** `cursor/practice-fort-held-slice-08e7` off `cursor/practice-touch-scroll-da9e` @ `bdcef2e` (PR #8 line).
**Owner direction (Adam via Morgan):** gameplay/UX progress over verification theater; Studio/test pack not this slice's concern. The Bench and BotDOOR untouched.

## What this slice is

The no-gate-team path (test-pack S-03) was investigated first. The game logic was **already correct**: `PRACTICE_NO_GATE_TEAM_PLAN` resolves `defenderWin`, losses 8 / 7 / 5, ten ordered events. What was wrong was the explanation layer:

1. Every blocked squad read `…reached x 50, but the gate is the only way in and it was closed or missed.` The resolver knows which. In the one-tap lesson the lines *do* cross x 50, so "missed" was actively misleading — the exact confusion S-03 exists to teach.
2. The FORT HELD card had no one-line cause. A player had to sit through ten reason cards (or tap Show all) to learn *why* they lost.
3. `Losses: Vanguard 8 · Archers 7 · Riders 5` had no denominators and no defender line, so a held fort read as unexplained numbers.
4. `Try without a gate team` silently replaced any hand-drawn routes with the teaching defaults; its status did not say so.

## Changed and why

**`packages/game-core/src/practice-siege.ts`** (server authority; the rule lives once, here)
- Blocked-at-wall copy now names the actual case: reached the gate but nobody was sent to open it / gate team too small to open it / crossed elsewhere and hit solid wall while the gate was open / crossed elsewhere and the gate stayed closed.
- New `headline: string` on `PracticeSiegeResult`, derived from the same resolution state: `No squad was sent to open the gate, so every squad was stopped at the wall.` · `The gate team was too small to open the gate…` · `The gate opened at x 50, but every route crossed the wall somewhere else.` · `N squads got inside, but too few attackers reached the keep doors to take it.` · win: `The gate opened, 3 squads got inside, and 28 attackers reached the keep doors.`
- Additive only. Pinned fixture numbers unchanged (TAKEN 5 / 5 / 4, HELD 8 / 7 / 5). The Roblox bridge forwards `payload.practiceSiege` intact, so no bridge change was needed.

**`roblox/src/client/PracticeSiege.luau`** (renders; decides nothing)
- Outcome card: `Why: <headline>` under the banner (only when the realm sent one), `Losses: Vanguard 8 of 18 · Archers 7 of 14 · Riders 5 of 10` using `fixedForces.attacker`, and `Defenders: 10 of 43 fell.` from `defenderCasualties.total` / `fixedForces.defender`. A result without those fields still renders the old plain line.
- `loadNoGateTeam` status: `Teaching routes loaded with one change: Vanguard now aims for the keep, so no squad is opening the gate. The lines still cross the gate mark, but everyone will be stopped at the wall. Try this plan, then Reset and compare.`

**Checks** — `packages/game-core/test/practice-siege.test.ts` pins the headline and the four wall-copy variants on the fixtures and on two constructed plans (too-small gate team; missed open gate). `roblox/scripts/practice-client-check.luau` gains the first scenario that renders **FORT HELD** at all (the old stub always returned a win) plus a no-optional-fields fallback scenario: 12 → **14** planner scenarios.

**Docs** — test pack S-01 / S-03 expected copy updated to the new lines; the 2026-09-11 S-01 PASS frame shows the older bare numbers and is labelled as such.

## Not changed

- No geometry, forces, defense plans, or fixtures. No schema, migration, or command name. No `BattleScene`, Bench, or BotDOOR files. `TouchScroll.luau` was re-read against `PracticeSiege` and `init.client.luau` for remaining jank; nothing found at source level that could be fixed honestly without a device, so it is untouched.
- Phase 2 / D-02 / OPEN-21: not started.

## Checks on this tip (cloud; Lune 0.10.5 and TypeScript 5.9.3 installed for the run, not committed)

| Command | Result |
|---|---|
| `npm run check:types` | pass |
| `npm run test:core` | **105** passed, 0 failed (was 104) |
| `npm run test:server` | 139 passed, 0 failed (includes the real Luau contract) |
| `npm run test:luau` | 42 syntax files; 72 rules; 7 simulations; 25 connections; 6 client audits; 272 practice contracts; 28 bridge; **14** planner scenarios; 54 wiring; 11 touch-scroll; 0 failed |
| `npm run check:practice-persistence` | exit 0; HTTP 200/200/200 + 400; identical replay; durable DB/WAL/rows unchanged |
| Rojo build | **not run** — `rojo` not in this image |
| Studio Play / phone | **not verified**. No PASS or FAIL is claimed for any pack row. |

## Exact next action

1. **Adam:** rebuild `WorldGame-dev.rbxlx` (`start-dev.ps1 -BuildOnly -Play`), then S-03: the FORT HELD card should show the `Why:` line, `8 of 18 · 7 of 14 · 5 of 10`, and `Defenders: 10 of 43 fell.`; the wall reasons should say `reached the gate at x 50, but no squad was sent to open it`. S-07 on the rebuilt place is still owed from the previous continuation.
2. Everything else in the 2026-09-11 handback below still stands (G-01, G-02, D-02).

---

# Previous handback — scroll fix reviewed on the PC, Rojo-built, two input defects fixed; G-01 still open

**Updated:** 2026-09-11 evening by [Cursor] on Adam's PC. **Working branch:** `cursor/practice-touch-scroll-da9e` (PR #8) off `cursor/practice-phase1-d06-c4e2` @ `41d541e`.
**Base PR line:** draft PR #7 (`cursor/practice-phase1-d06-c4e2` → `feat/practice-siege-codex`).

## Current milestone

Phase 1 practice siege. D-06 teaching and a playable success / failure / one-target comparison remain in source. Adam + Morgan observed **S-01 PASS** in Studio Play on `41d541e`. The cloud continuation below added the war-table / planner scroll helper; this PC continuation reviewed it against real Roblox input semantics, fixed two defects, ran every gate **including the Rojo build the cloud could not run**, and rebuilt `roblox/WorldGame-dev.rbxlx` so Adam can open Studio and run S-07 / S-03 / S-04 directly. **G-01 is not closed.** Phase 2 and D-02 / OPEN-21 were not started.

## PC continuation (2026-09-11 evening) — what changed and why

Two defects in `TouchScroll.luau` found by reading it against Roblox's input model, neither visible to the runtime stubs as they stood:

1. **Wheel hit-test used `UserInputService:GetMouseLocation()`**, which is raw screen pixels. `GuiObject.AbsolutePosition` and `InputObject.Position` share the *inset-adjusted* space (the same convention `PracticeSiege` uses for the RouteCanvas hit-test, proven live on 2026-09-04). With the top-bar inset (~58px) the wheel would have missed the top band of the list and hit a phantom band below it. Now the wheel event's own `Position.X/Y` is used; `GetMouseLocation` minus `GuiService:GetGuiInset()` is only a fallback when the event carries no position.
2. **No input identity during a drag.** Any touch `InputChanged` steered the list and any touch `InputBegan` restarted the drag and re-armed the buttons. Two fingers would jitter the list and could re-enable a tap under the first finger — the exact S-07 second-finger case. The helper now remembers the `InputObject` that began the drag; only that touch (or `MouseMovement` for a `MouseButton1` drag) steers or ends it, and a second `InputBegan` during a drag is ignored.

Also: `Body.ElasticBehavior` changed `Always` → `Never`. The helper clamps `CanvasPosition` on every move; native elastic overshoot would fight that clamp at both ends and jitter under a finger.

Two new deletion-sensitive stub checks pin both fixes (`check:touch-scroll` is now **11** checks): a wheel event over the list must scroll even when `GetMouseLocation` points outside it, and only the finger that began a drag may steer or end it.

**Built place:** `roblox/WorldGame-dev.rbxlx`, 418,456 bytes, SHA256 `D6CAE1131EC3A66ADB4BAB97EB2B6D54F86FE7E193A4E1B5B76E736BD200AFEC`, built with `start-dev.ps1 -BuildOnly -Play` from this tip. Verified the file contains the `TouchScroll` module, the `steersDrag` / `wheelPointer` fixes and `ElasticBehavior.Never`, and contains no production URL. Studio was **not** running at build time; nothing was Play-tested. The fresh AI-off loopback world on `127.0.0.1:4178` (PID 20752, `practice-pr7-20260910-170938.sqlite`) is still up and healthy — reuse it, do not start a second one.

## Checks on this PC (tip of this continuation)

| Command | Result |
|---|---|
| `npm run check:types` | pass |
| `npm run test:core` | 104 passed, 0 failed |
| `npm run test:server` | 139 passed, 0 failed |
| `npm run test:luau` | 42 syntax files; 72 rules; 7 simulations; 25 connections; 6 client audits; 272 practice contracts; 28 bridge; 12 planner scenarios; 54 wiring; **11** touch-scroll; 0 failed |
| `npm run check:practice-persistence` | exit 0; disposable HTTP 200/200/200 + 400; identical replay; durable rows unchanged |
| `start-dev.ps1 -BuildOnly -Play` (Rojo 7.6.1) | **pass** — place rebuilt, fix present in the file |
| Studio Play of `TouchScroll` | **not verified** |
| Physical phone | **not verified** |

## Exact next action

1. **Adam:** open `roblox/WorldGame-dev.rbxlx` (already rebuilt from this tip), HTTP requests on, iPhone XR emulator, Play against the running `127.0.0.1:4178` world. **S-07:** mouse wheel over the War list scrolls it; a drag that starts on a button row scrolls without firing the button; a second finger during a drag does nothing. Then **S-03** (Try without a gate team → FORT HELD 8 / 7 / 5) and **S-04** if time. Record results in `docs/verification/` outside the repo's proof rule as before. None of that closes G-01.
2. **Adam (still blocks G-01):** S-09 on a real phone; unfamiliar-player study; acceptance.
3. **Adam (blocks G-02 / real PvP):** answer the two asks in `docs/plans/2026-09-10-opening-decisions-for-adam.md`.

---

# Previous handback — S-01 Studio PASS recorded; touch-scroll fix in source; G-01 still open

**Updated:** 2026-09-11 by [Cursor] (cloud). **Working branch:** `cursor/practice-touch-scroll-da9e` off `cursor/practice-phase1-d06-c4e2` @ `41d541e`.
**Base PR line:** draft PR #7 (`cursor/practice-phase1-d06-c4e2` → `feat/practice-siege-codex`).

## Current milestone (cloud, 2026-09-11)

Phase 1 practice siege. D-06 teaching and a playable success / failure / one-target comparison remain in source. Adam + Morgan observed **S-01 PASS** in Studio Play on the previous tip. This continuation records that evidence honestly and fixes the war-table / planner scroll blocker that stopped them reaching Practice siege. **G-01 is not closed.** Phase 2 and D-02 / OPEN-21 were not started.

## Implemented versus verified

| Behavior | Implemented | Verified |
|---|---|---|
| Open-gate-only entry; towers stop fire, they do not breach the wall | Yes | Automated resolver + Luau teaching/default-route checks. |
| S-01 Reset teaching plan (no redraw, Try this plan) | Yes | **Studio PASS 2026-09-11** on `41d541e`, iPhone XR emulator 896×414: FORT TAKEN; losses 5 / 5 / 4; `Training only. Your city troops and stock did not change.` See [S-01 note](docs/verification/2026-09-11-practice-studio-s01.md). |
| Default Reset plan visits towers, then enters through the gate | Yes | Contract: Luau defaults === `PRACTICE_WINNING_GATE_PLAN`. S-02 freehand redraw **not run**. |
| Planner copy: practice army is separate; gate-only teaching | Yes | Luau client-check at 320/390. S-01 frame showed the training-only outcome line. |
| One-tap failure lesson (`Try without a gate team`) | Yes | Luau lesson + contract. **S-03 Studio not run.** |
| Playable causality: same drawings, only Vanguard target Gate → Keep | Yes | Core pin TAKEN **5 / 5 / 4** vs HELD **8 / 7 / 5**. **S-04 Studio not run.** |
| Skip + Previous replay | Yes | Luau planner scenarios. **S-06 Studio not run.** |
| Invalid input, reset/retry, late-result cancel, second-finger guards | Yes | Existing Luau planner scenarios. **S-05 / S-07 Studio not run.** |
| War-table / planner touch and wheel scroll through action buttons | Yes (this continuation) | Luau `check:touch-scroll` (9 checks). **Studio / phone not verified** on the new helper. |
| Stateless practice command | Yes | This tip: `check:practice-persistence` HTTP 200/200/200 + 400; identical replay; durable DB/WAL/rows unchanged. |
| Physical phone, unfamiliar players, Adam acceptance, captioned walkthrough | Test pack updated | **not verified**. Reaching Practice siege required Adam’s help because the list would not wheel-scroll. |
| Phase 2 opening / shield / fresh cities | Not started | G-02 recommendations only. D-02 mutual first-war still waiting on Adam. |

## Checks this continuation

Cloud agent. Lune 0.10.5 installed to `~/.local/bin/lune` for this run (not committed). TypeScript is whatever this image already has.

| Command | Result |
|---|---|
| `npm run check:types` | pass — game-core/server type-clean |
| `npm run test:core` | 104 passed, 0 failed |
| `npm run test:server` | 139 passed, 0 failed |
| `npm run test:luau` | 42 syntax files; 72 rules; 7 simulations; 25 connections; 6 client audits; 272 practice contracts; 28 bridge; 12 planner scenarios; 54 wiring; **9** touch-scroll; 0 failed |
| `npm run check:practice-persistence` | disposable HTTP 200/200/200 + 400; identical replay; durable DB/WAL/rows unchanged |
| Rojo development build | **not run** — `rojo` is not installed in this cloud image |
| Studio Play of the new `TouchScroll` helper | **not verified** |
| Physical phone | **not verified** |

## Evidence paths

- Fixtures: `packages/game-core/src/practice-siege-fixtures.ts` — do not invent a different winning route
- S-01 observed record: `docs/verification/2026-09-11-practice-studio-s01.md`
- Studio/phone script: `docs/verification/2026-09-10-practice-studio-test-pack.md`
- Scroll helper: `roblox/src/client/TouchScroll.luau`
- G-02 asks: `docs/plans/2026-09-10-opening-decisions-for-adam.md`

## Pending decisions and gates

- **G-01** open: S-01 emulator PASS is on the record. Still owed: S-03+ Studio, physical phone, unfamiliar-player study, Adam acceptance.
- **G-02** open: accept or correct D-01 / D-02-storage / D-08 / D-09 / D-10; separately answer the mutual first-war challenge for D-02 / OPEN-21. Silence is not approval.
- **D-02 first-war** still unresolved. Do not implement timed expiry, voluntary shield drop, or unprotected starters.
- No merge to `main`, deploy, publish, Roblox spend, or computer control.

## Exact next action

1. **Adam:** Rebuild `WorldGame-dev.rbxlx` from this continuation (`-BuildOnly -Play`). On the iPhone XR emulator, confirm S-07: wheel and a drag that starts on a button both move Village / War / the practice planner. Then run S-03 (and S-04 if time). Do not treat that as G-01 closed.
2. **Adam (still blocks G-01):** S-09 on a real phone; unfamiliar-player study; acceptance.
3. **Adam (blocks G-02 / real PvP):** Answer the two asks in `docs/plans/2026-09-10-opening-decisions-for-adam.md`.
4. Next engineering increment after those: only then Phase 2 founding/tutorial, still without an invented PvP shield rule.

Other assistants’ notes below are dated history and were not rewritten.

---

# Previous handback — Phase 1 local implementation complete; G-01 still needs Adam

**Updated:** 2026-09-10 by [Cursor]. **Working branch:** `cursor/practice-phase1-d06-c4e2` off `feat/practice-siege-codex` @ `add2cd2`.  
**Tip:** `77392b5` on `cursor/practice-phase1-d06-c4e2` (code `01e173f`).

## Current milestone (2026-09-10)

Phase 1 practice siege. D-06 teaching and a **playable** success / failure / one-target comparison are in source. G-01 is **not** closed. Phase 2 and D-02 / OPEN-21 were not started.

## Implemented versus verified (2026-09-10)

| Behavior | Implemented | Verified |
|---|---|---|
| Open-gate-only entry; towers stop fire, they do not breach the wall | Yes | Automated resolver + Luau teaching/default-route checks. Studio **not verified**. |
| Default Reset plan visits towers on the approach, then enters through the gate | Yes | Contract: Luau defaults === `PRACTICE_WINNING_GATE_PLAN` and all three `enteredFort` |
| Planner copy: practice army is separate; “Only an opened gate lets anyone inside.” | Yes | Luau client-check at 320/390. Rendered Studio **not verified**. |
| One-tap failure lesson (`Try without a gate team`) | Yes | Luau lesson + contract: `noGateTeamRequest` === `PRACTICE_NO_GATE_TEAM_PLAN`. Studio **not verified**. |
| Playable causality: same drawings, only Vanguard target Gate → Keep | Yes | Core pin TAKEN **5 / 5 / 4** vs HELD **8 / 7 / 5**. Retired unplayable `holdKeep` Rider pair. |
| Skip + Previous replay; training-only outcome line | Yes | Luau planner scenarios, including 320px targets. Studio **not verified**. |
| Invalid input, reset/retry, late-result cancel, second-finger guards | Yes | Existing Luau planner scenarios. Studio **not verified**. |
| Stateless practice command | Yes | `check:practice-persistence` rerun on this tip: HTTP 200/200/200 + 400; identical replay; durable DB/WAL/rows unchanged. |
| September 4 HUD sibling / CanvasGroup / prompt-lifecycle fixes | Preserved from `add2cd2` | Source + Luau wiring/audit. Rebuilt-place visual **not verified**. |
| Physical phone, unfamiliar players, Adam acceptance, captioned walkthrough | Test pack tightened | **not verified** |
| Phase 2 opening / shield / fresh cities | Not started | G-02 recommendations only. D-02 mutual first-war still waiting on Adam. |

## Checks that continuation

Cloud agent, Lune 0.10.5 at `~/.local/bin/lune`. TypeScript 5.9.3 is in this environment only (not committed). Reran on tip `85a167c` / code `01e173f`:

| Command | Result |
|---|---|
| `npm run check:types` | pass — game-core/server type-clean |
| `npm run test:core` | 104 passed, 0 failed |
| `npm run test:server` | 139 passed, 0 failed |
| `npm run test:luau` | 40 syntax files; 72 rules; 7 simulations; 25 connections; 6 client audits; 272 practice contracts; 28 bridge; **12** planner scenarios; 54 wiring; 0 failed |
| `npm run check:practice-persistence` | disposable HTTP 200/200/200 + 400; identical replay; durable DB/WAL/rows unchanged |
| Rojo development build | **not run** — `rojo` is not installed in this cloud image |
| `git diff --check` | clean at commit |

Studio Play, physical phone, two-client privacy, and unfamiliar-player understanding: **not verified** as of that handback. S-01 was later observed on 2026-09-11; see the current section above.

Those 2026-09-10 evidence paths, gate notes, and “run S-01 first” next actions are superseded by the 2026-09-11 section above (S-01 is now observed; scroll rebuild is the next Studio check).

Other assistants’ notes below are dated history and were not rewritten.

---

# Previous handback — Roadmap audited and opening specified; Studio testing paused

**Updated:** 2026-09-07 by Codex. **Branch:** `feat/practice-siege-codex`. **Source baseline:** `535447d`, plus five pre-existing uncommitted Luau source/check fixes. This checkpoint supersedes the status summaries below; retain them as dated history.

## Current authorized work

Adam requested a thorough audit before implementation, then said “do it” to revising the roadmap and preparing a concrete Phase 2 specification. This continuation changes planning and evidence documents only. It does not implement the opening or return computer control: Adam paused the September 4 Studio session with Escape and said he would return control later.

## Planning deliverables

- [Revised player-first roadmap](docs/plans/2026-09-04-player-first-roadmap.md): retains the owner direction, repairs the phase dependencies, moves fresh-city admission forward, adds an external-alpha gate, and maps the audit findings to decisions and acceptance evidence.
- [Phase 2 opening specification](docs/superpowers/specs/2026-09-07-player-first-opening.md): proposed founding template, exact normal costs/timers, nine tutorial steps, once-only receipts, shield transitions, saved training defense, safe NPC survey, migration/reconnect behavior, return sessions, and twenty-one acceptance scenarios plus device/player checks.
- [Decision and release-gate register](docs/plans/2026-09-07-player-first-decisions.md): fifteen decisions and seven open gates with owners, deadlines, and proof requirements. Proposed starter tuning, shield edges, recovery, capacity, and combat/conquest changes remain distinguishable from owner locks.
- [Canonical brief](docs/design/CANONICAL-BRIEF.md) and [AI team briefing](docs/AI-TEAM-BRIEFING.md): current planning pointers and corrections for existing visuals, research UI, phone troop evidence, and hosting documentation.

The opening proposes 12 Squires, 8 Long-bows and 4 Crusaders as a once-only gift while preserving normal recruitment prerequisites. The exact values live in the opening specification. The no-expiry shield lock is preserved; outgoing scouting of unprotected players is a proposed edge rule because existing real attacks require a scout report. None of these proposals is implemented by this documentation revision.

D-02 also records an unresolved first-war blocker: an all-new world has no unprotected human target, so the current protection/first-attack combination cannot initiate PvP. A complete owner-approved willing-player entry rule is required before real war; the safe shielded opening can be built after its own design gate without inventing an expiry exception.

## Actual practice checkpoint

The earlier “no Studio access/no observed result” statements below became stale during the September 4 continuation. Studio was reached, the War → Practice path was used, and one real Roblox-to-external-server request displayed **FORT HELD**, losses **11 / 7 / 5**, and ordered reasons. That observed run used a temporary runtime HUD-layer correction and one manually redrawn Vanguard route; it is not proof of the final rebuilt source, drawing all three routes, or phone control. The [verification continuation](docs/verification/2026-09-04-practice-siege-wiring.md) records the limits and remaining checks.

Five source/check files already differed from `535447d` when the September 7 planning revision began: `roblox/scripts/client-audit-check.luau`, `roblox/scripts/practice-client-check.luau`, `roblox/scripts/practice-wiring-check.luau`, `roblox/src/client/PracticeSiege.luau`, and `roblox/src/client/init.client.luau`. They contain September 4 HUD layering, clipping, row order, prompt-lifecycle fixes and related checks. They were preserved byte for byte and excluded from the planning commit. Their matching rebuilt-place visual acceptance remains open.

Recorded September 4 checks after those fixes passed: 40 Luau syntax files, 72 rules, 7 simulations, 25 connection checks, 6 client scenarios, 272 practice contract checks, 28 bridge checks, 8 planner scenarios, and 54 wiring checks; the normal Rojo development build also passed. These are historical results, not reruns during the documentation revision. A three-second capture smoke test exists; the requested captioned walkthrough does not.

Proof files remain outside the repository under `C:\Users\steam\OneDrive\Documents\ChatGPT\Kingmarch\practice-siege-proof-2026-09-04`. The actual result frame is `03-server-result-first-run.jpg`; `02-war-table.png` does not show an opened table and must not be used as proof of that interaction.

## Exact next steps

1. Review the opening's proposed tuning and D-01/D-02/D-08 design choices with Adam before Phase 2 persistence/tutorial work.
2. When Adam explicitly returns computer control, inspect the current local Studio/server state and finish Phase 1 from the matching development build. Do not relaunch, kill, or reconfigure apps on the strength of old process IDs.
3. Settle D-06 gate-versus-tower entry teaching; prove three drawn routes, objectives, valid success/failure, one-route causality, invalid feedback, reset/retry, 320/390 layouts, and real-phone input. Recheck any changed source with its relevant gates.
4. Capture the honest captioned **practice** walkthrough, obtain the unfamiliar-player/Adam review, and close G-01. The full city tutorial, real sieges, clans, and shop remain future work.
5. Only then implement the approved opening contract in the ordered steps of its specification. External play, real PvP, purchases, merge, push, deployment, and publication have separate explicit gates.

No gameplay source, app process, live configuration, or remote was changed during the planning revision. Existing local source work remains uncommitted; this checkpoint does not claim a clean working tree or current hosted readiness.

---

# Previous handback — Practice siege connected; Studio access pending

**Date:** 2026-09-04. **Branch:** `feat/practice-siege-codex`. **Continuation of:** `36758fb`, still based on unmerged/unpushed `09cf525`.

The practice planner is now connected to the War tab and the authenticated server command. It collects three bounded integer routes, preserves target turns, displays tower ranges and ordered server reasons, and supports reset/retry. The separate bridge returns practice results and rejection messages without live snapshot/version/battle changes. Shared validation and actual TypeScript/Luau contract tests prevent vocabulary/geometry drift. Closing/resetting cancels late results; active strokes survive heartbeats and reject conflicting second-finger controls.

**Verified:** types; 101 core tests; 138 server tests; 40 Luau syntax files, 72 rules, 7 simulations, 25 connection checks, 5 existing client scenarios, 272 practice contract checks, 28 bridge checks, 7 planner scenarios, 48 wiring checks; isolated Rojo dev build; clean diff; real HTTP/durable-byte no-mutation probe. Full details, corrections and hash evidence: [practice siege verification](docs/verification/2026-09-04-practice-siege-wiring.md).

**Not verified:** Studio play, rendered layout, real touch/device behavior, child comprehension, or gameplay recording. The interactive launch returned `Computer Use app approval timed out`; no screenshot or in-game request was observed. A fresh local server was left on loopback 4178 and health passed. The ignored normal place is `roblox/WorldGame-dev.rbxlx`; its fresh ignored database is `server/data/practice-studio-6bdbf5e57e50421f93ab92fa9b6380cc.sqlite`. Recheck processes and access before resuming; do not use the older audit place/database by mistake.

**Next:** obtain Studio app access, open that local development place, Play and prove War → Practice siege with all three drawn routes, target changes, ordered events/reasons, rejected input, reset/retry and phone layouts. Then record the honest captioned practice walkthrough and obtain Adam's hands-on judgment. No merge, push, deployment, Roblox publication or live-world changes without Adam. The broader locked roadmap remains future work.

**New/changed in this continuation:** `package.json`; `roblox/src/client/PracticeSiege.luau`; `roblox/src/client/init.client.luau`; `roblox/src/server/CommandService.luau`; `roblox/src/shared/PracticeSiegeConfig.luau`; four `roblox/scripts/practice-*-check.luau` gates; `scripts/verify-practice-persistence.mjs`; `server/test/practice-siege-luau-contract.test.ts`; this handback and its linked verification document. No schema, migration, production battle code, secret, or live connection configuration changed.

---

# Previous handback — Player-first roadmap and practice siege checkpoint

**Date:** 2026-09-04
**Branch:** `feat/practice-siege-codex`
**Base:** `09cf525` on `feat/audit-fixes-codex`, which is itself unmerged and unpushed
**Owner authorization:** Adam said “Start,” then “Lock this roadmap in and keep working until you need me.”
**Release boundary:** local only; no merge, push, deploy, publication, live-world change, or purchase.

## What Adam locked

The dated roadmap at `docs/plans/2026-09-04-player-first-roadmap.md` is now the product direction. It records ages 9+, a starter city and army for every new player, a beginner shield until the first deliberately confirmed real attack, a guided first session, functional map-command sieges and saved defenses, world/clan communication, clan profiles and rosters, the Great Hall social hub, Tourney Grounds, building-guide NPCs, cosmetic expression, and later peaceful jobs/economy. `docs/design/CANONICAL-BRIEF.md` now carries the owner overrides for ages 9+ and future cosmetic-only monetization.

## Built in this checkpoint

- A versioned, JSON-safe, deterministic TypeScript practice-siege resolver in `packages/game-core/src/practice-siege.ts`.
- Three squads draw 0–100 integer-grid routes through a fixed fort with a gate, two archer towers, a barricade, and keep doors.
- Routes, chosen objectives, tower exposure, tower-clearing order, wall entry, the barricade, and the saved defense priority materially affect casualties or outcome.
- Strict request validation rejects missing/extra keys, wrong versions/plans/objectives, decimals, out-of-map points, backward routes, duplicate points, missed objectives, and routes that do not finish at the keep.
- A stateless authenticated `practice.siege.resolve` Roblox HTTP command. It uses the existing key, linked identity, command-shape guard, and rate limiter, then resolves before `store.applyCommand`, so it writes no inbox row and mutates no world data.
- Clear `command.rejected` validation responses with `INVALID_PRACTICE_SIEGE`.
- A shared Luau vocabulary/geometry module and an unconnected touch-first `PracticeSiege.luau` planner module. They compile and are preserved for continuation.

## Not built yet

- The Roblox planner is **not wired** into `CommandService.luau` or `init.client.luau`; there is no Practice button at the War Table and no in-game request can reach the server yet.
- No Roblox rule/runtime tests specifically exercise route drawing, the command bridge, 320/390 layouts, result replay, or clear rejection copy.
- No Studio interaction, two-client drill, real-phone check, or visual acceptance was performed.
- No tutorial, starter-city allocation, beginner shield, saved player defense, incoming attack, real-army integration, clans/chat, Great Hall, NPC guides, store, shows, or jobs were implemented. They are roadmap work, not current behavior.
- The requested full-day captioned walkthrough video was not recorded. Record it only after the interface is connected and stable enough to teach honestly.

## Verification completed

- `npm run check:types` — pass.
- `npm run test:core` — 101/101 pass, including 9 practice-siege tests.
- `npm run test:server` — 135/135 pass, including 5 practice API tests. The first sandboxed run reached 133/134 and failed only because Windows denied spawning Lune; the approved outside-sandbox rerun passed clean.
- `npm run test:luau` — pass: 36 syntax files, 72 rules, 7 spike simulations, 25 connection checks, and 5 client audit scenarios. These existing rules compile the two new modules but do not prove the new UI behavior.
- `rojo build roblox/default.project.json -o .tmp/practice-siege-dev.rbxlx` — pass after creating the ignored `.tmp` output directory.
- Focused core suite — 9/9 pass. Focused server suite — 5/5 pass.
- `git diff --check` — pass before handback update.

## Exact next steps

1. Review `PracticeSiegeConfig.luau` and `PracticeSiege.luau` against the TypeScript contract; keep the coordinate system at integer 0–100 and the command name `practice.siege.resolve`.
2. Add a non-village `practiceSiege` request to `CommandService.luau`. Forward `{version, routes, objectives, defensePlan}` and return `body.payload.practiceSiege`; surface `command.rejected.payload.message` unchanged.
3. Add a Practice entry inside the existing War Table and mount the planner from `init.client.luau` without changing `BattleScene` or the production battle path.
4. Add deletion-sensitive Luau checks for request vocabulary, route validation, no `BattleScene` dependency, 44px controls, 320/390 layout, accepted replay, and rejected-plan copy.
5. Run all gates and the Rojo build again.
6. Start an isolated local world server and Studio only when continuing the test. Prove drawing all three routes, submitting, seeing ordered phase events/reasons, reset/retry, and no world-resource/version mutation.
7. After Studio acceptance, capture the requested captioned walkthrough. Keep it labeled as practice until the real-city tutorial and attacks exist.
8. Ask Adam before any merge into the audit-fix branch, GitHub push, VPS deploy, or Roblox publication.

## Files created or changed in this checkpoint

- `docs/plans/2026-09-04-player-first-roadmap.md`
- `docs/superpowers/specs/2026-09-04-practice-siege-prototype.md`
- `docs/design/CANONICAL-BRIEF.md`
- `packages/game-core/src/practice-siege.ts`
- `packages/game-core/test/practice-siege.test.ts`
- `packages/game-core/src/contracts.ts`
- `packages/game-core/src/index.ts`
- `server/src/http.ts`
- `server/test/practice-siege-api.test.ts`
- `roblox/src/shared/PracticeSiegeConfig.luau`
- `roblox/src/client/PracticeSiege.luau`
- `HANDBACK.md`

---

# Previous handback — September audit fixes

Branch: `feat/audit-fixes-codex`. Base: main `9b478db`.
Adam authorized implementation with **“Do it.”** Work is local and ready for integration review. No merge, push, live deployment or publication was performed.

## Built

- Hosted defaults reject retired web account/world/static routes.
- Separate development/demo and production Roblox targets, with an executable transport policy and development credential exclusion.
- Fractional horse production, rejection-safe cavalry conversion, siege asset guards, preserved wall upgrades, correct captured-home return routing, and living-seat eligibility.
- Full private war tables in all owned holdings.
- Fresh-start AI reconnaissance preparation and retaliation.
- Accurate cavalry costs, growing/wrapped mobile rows with 44 px actions, and observed conquest-strength reports.

## Verification

**130 server tests, 92 core tests, type checking, 34 Luau files, 72 rules, 7 troop simulations, 25 connection checks and 5 UI/binding scenarios all pass.** Four Rojo targets and credential-exclusion proof pass. Independent review found no remaining blocker in the reviewed fixes.

Full evidence and exact live checks: [docs/verification/2026-09-03-audit-fixes.md](docs/verification/2026-09-03-audit-fixes.md).

## Files

Server:
- `server/src/http.ts`, `server/src/store.ts`, `server/src/ai.ts`
- `server/db/migrations/0013_horse_fraction.sql`
- New `server/test/audit-store-integrity.test.ts`, `ai-fresh-retaliation.test.ts`, `deployment-boundary.test.ts`
- Existing `server/test/gate-b.test.ts`, `rate-limit.test.ts`, `roblox-api.test.ts` narrowly updated for explicit legacy harnesses/true conversion costs

Roblox:
- `roblox/src/server/ApiClient.luau`, new `ConnectionPolicy.luau`, `SecretConfig.example.luau`, `WarTable.luau`, `SettlementBuilder.luau`
- `roblox/src/client/init.client.luau`
- `roblox/default.project.json`, `demo.project.json`, new `live.project.json`, `start-dev.ps1`
- New `roblox/scripts/connection-check.luau`, `client-audit-check.luau`; existing `rules-check.luau` updated

Checks/docs:
- `package.json`, `README.md`, `roblox/README.md`, `docs/ops/vps-runbook.md`, this handback and the verification record

## Decisions and limits

Open sieges block new defender spending/departures while preserving paid work and arrivals. Fallen-home returns travel onward to a remaining owned holding; eliminated realms receive explicit loss notifications. Dead kingdoms do not become joinable seats. Migration 0013 preserves existing whole horses and has been exercised only against disposable local databases.

The new UI is source/runtime-stub verified, **not yet visually accepted in Studio or on a real phone**. Full-game/two-client play remains the next gate. Default/demo builds are local-only; production must use `live.project.json` after separate release approval.

No world capacity/lifecycle, alliances or trade scope was added. Main and the live world remain unchanged.

## Studio checkpoint — 2026-09-03

Adam authorized the local playtest, then stopped for tomorrow. The isolated server answers health and the exact development place successfully joined and rendered its town/resource HUD in Studio. No war-table, two-client or phone acceptance pass is claimed. Server/Studio were left running at the stop. Two playtest-tool fixes prevent false build success and count secondary-holding war tables correctly. See [the resume checkpoint](docs/verification/2026-09-03-studio-playtest-checkpoint.md).
