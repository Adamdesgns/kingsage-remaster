# Kingsmarch player-first roadmap

**Locked by Adam:** 2026-09-04
**Revision:** 2, 2026-09-07; planning revision authorized after the thoroughness audit
**Audience:** ages 9 and up, with phone as the baseline
**Current build:** Phase 1 practice siege on `feat/practice-siege-codex`
**Release state:** local development only; this roadmap does not authorize a push, merge, deployment, Roblox publication, or paid product.

This roadmap replaces the earlier teen-only and no-monetization product assumptions. The server-authority, persistent-world, on-foot city, mobile-baseline, region-world, no-gore, and working-title decisions remain in force.

## How to use this revision

This is the delivery map. The [opening-game specification](../superpowers/specs/2026-09-07-player-first-opening.md) defines Phase 2's proposed template, exact tutorial actions, costs, timers, persistence, and acceptance. The [decision register](2026-09-07-player-first-decisions.md) records what is locked, which defaults are proposed, who decides, and when evidence is required. Numeric starter balance and new defeat/conquest rules are proposals until the relevant decision is recorded; permission to write these documents is not a claim that those mechanics are implemented or playtested.

Latest explicit owner decisions take precedence. This roadmap records the September 4 product overrides; the canonical brief preserves architectural constraints. The opening specification governs its bounded phase only, and the decision register prevents proposals being mistaken for owner decisions. Older dated audits and status paragraphs are historical evidence; current source determines what exists. A disagreement must be reconciled explicitly, never settled by silently choosing an older document.

### Current evidence, not future capability

- Existing production combat is a separate system with eleven troop types, research, horses, return marches, loot, and Count/Realm-of-Power conquest. Phase 3 is a transition from that system, not a wiring-only task.
- The practice engine and Roblox connection are locally committed at 535447d. The September 4 continuation observed one actual local Roblox request, a FORT HELD result, casualties, and ordered reasons after a temporary rendering correction.
- Five local Luau source/check files contain the later display fixes. Their Luau suite and Rojo build passed on September 4, but the rebuilt Studio check was interrupted by Adam. They remain uncommitted at this revision's starting checkpoint. Route-drawing acceptance on a real phone, child comprehension, and the final captioned recording remain open.
- The [200-soldier phone drill](../superpowers/spike-200-troops.md) records a real-phone PASS on August 28. That is separate from settlement and practice-planner acceptance. Do not reset an already-earned test or generalize it to untested interfaces.
- The [hosting runbook](../ops/vps-runbook.md) already exists. This planning pass did not inspect the live deployment, Creator Dashboard, or running apps; current availability, account eligibility, and cost must be checked at the relevant gate.

## Product promise

Every player receives a small city that feels like home. They learn it by walking through it, meeting its people, building it, defending it, and eventually commanding attacks from a scout's map. War drives the world, but friendship, collecting, city life, trading, events, and peaceful work give players reasons to stay between battles.

The game should be understandable without Adam or a developer explaining it. Every major action must be taught in the game, show its cost and consequence before commitment, and explain its result afterward.

## Locked product decisions

1. **Ages 9+ and no gore.** Language, feedback, menus, failure states, and combat presentation must work for a capable nine-year-old without talking down to older players.
2. **Every new player owns a city.** They start at the lowest useful level with a small starter army and enough resources to complete the opening lesson. World population must grow beyond the current fixed six-seat limit before public release.
3. **Beginner shield.** A new city cannot be attacked while the player learns. Practice and NPC tutorial fights do not remove it. There is no automatic time expiry under the locked rule. The shield ends only when the server accepts the player's deliberately confirmed first real player attack, with an unmistakable warning. A failed launch leaves protection intact. Support, trade, cancellation, ownership changes, and recovery edge cases must pass D-02 before their systems are enabled.
4. **A guided first day.** A named Steward meets the player, introduces the city, and sends them through short actions at real buildings. Building guides explain what each place does. The lesson ends with a risk-free practice siege and a clear invitation to continue playing.
5. **Command-map warfare.** A scout brings a readable fort map. The attacker assigns three squads, draws routes, chooses objectives, and commits a plan. The defender receives warning when the rules allow it, saves a defense plan, and issues defensive priorities. The external server alone calculates the result.
6. **Fortifications are real systems.** Walls, gatehouses, archer towers, barricades, rally points, reserve squads, and keep doors must change routes, timing, casualties, or objectives. A decoration cannot pretend to be a defense.
7. **A complete capture has stages.** The intended real siege progresses through approach, outer defenses, gate or breach, courtyard, keep doors, and capture. Each stage needs counterplay and an understandable reason for success or failure.
8. **Saved defense works offline.** A Defense Captain follows the player's saved plan when they are away. Replays show what happened and what the player could change next time.
9. **World and clan communication.** Offer Roblox-supported world and clan communication to eligible players, respecting age, parental, regional, blocking, and privacy restrictions. Clan membership does not guarantee chat access between every member. Joining, learning, roles, and cooperation must remain usable without chat. Define same-instance versus cross-instance reach before promising a world-wide channel; no external-server chat bypass is allowed.
10. **Clans are places and identities.** Players can create or join a clan, view its profile and roster, see roles, share a clan channel, and later cooperate at a clan war table. Membership and permissions are server-authoritative.
11. **The Great Hall is the civic meeting place.** An alcohol-free venue for guides, notices, recruitment actions, and city celebrations within the strategy game. A minimum useful Hall belongs in the opening; richer social activities arrive later. Review actual activities, props, layout, title, and description against the intended audience rather than assuming the absence of alcohol settles classification.
12. **The Tourney Grounds host spectacles.** Jousting, contests, and automated shows are earned future content. Players can participate, spectate, and represent their city or clan.
13. **NPCs make the city legible.** Important buildings have a named guide who explains the building, shows the next useful action, and can repeat the lesson. NPCs may offer short contextual tasks; they do not become an endless scripted quest-chain requirement.
14. **Cosmetics fund expression.** A future store can sell armor appearances, outfits, banners, emotes, mounts, and city decoration. Purchases must not increase combat power or bypass the strategy game. Exact products, prices, parental safeguards, and Roblox policy checks need a separate approval before implementation.
15. **Peaceful play comes later, but belongs in the same economy.** Farming, mining, lumber work, smithing, stable work, crafting, caravans, and NPC camps can support players who prefer gathering, making, trading, or exploration. Their goods must matter to cities and armies.
16. **No invisible outcomes.** Every battle, job, purchase, defense, and timed action needs a status, completion signal, and plain-language result. A player must never wonder whether a button worked.

## The first-player journey

The first session is one connected story, targeted at roughly 12–18 minutes:

1. **Arrival:** the player appears at their city gate under a visible beginner shield. The Steward welcomes them by name and points out the keep, resource buildings, barracks, war table, Great Hall, and city gate.
2. **Make the city work:** claim the one-time founding supply allocation, learn that normal resources accrue automatically, start one affordable normal-speed upgrade, and see where its timer lives. The upgrade can complete while later lessons are underway; there is no hidden speed-up or repeated collection reward.
3. **Meet the starter guard:** visit the Barracks guide, inspect the once-granted troops, recruit one legally available low-tier unit, and learn the three practice roles. The supplied practice armies are separate from the persistent starter army; their labels do not silently bypass normal unit prerequisites.
4. **Prepare the walls:** visit the Defense Captain, inspect the gate and towers, and save the bounded training-defense preset introduced in Phase 2. Demonstrate its actual training effect. Do not claim it protects a real city until the Phase 3 defender system consumes it.
5. **Read the scout map:** the Scout explains tower range, obstacles, objectives, and how drawing a different route changes exposure.
6. **Practice siege:** draw all three routes, attack the training fort, watch the diagrammatic replay, and receive two or three reasons for the outcome.
7. **Return home:** the Steward explains the shield and offers only implemented goals: improve the city, practice again, visit the Hall's working NPC services, or complete the Scout's safe survey. The survey is a new bounded Phase 2 activity, not an armed march, a real scout report, or the future NPC-camp economy. A later Freehold expedition needs its own eligibility and risk explanation.

The player can skip repeated explanations, replay every lesson, and ask each building guide “What should I do here?” at any time.

Each step has a server-observed completion, a saved checkpoint, and a resume path in the opening specification. A lost response cannot duplicate a grant or spend; revisiting a lesson does not repeat its reward. Tutorial progress must tolerate actions completed early, disconnection at any step, and a player choosing to practice again before advancing. Chat, audio, purchases, and another player being online are never prerequisites.

### A useful return visit

Phase 2 must also support a proposed 3–5 minute return visit and a 15–25 minute longer session. These are design targets to measure, not promises or retention results. A short visit reviews completed jobs, checks resources and troop replenishment, and starts one useful affordable action. A longer visit includes practice with an explainable tactical change, safe exploration/survey, or another building lesson. A player waiting for an upgrade can continue these activities rather than stare at a countdown.

No infinite survey reward, compulsory daily streak, paid timer skip, or forced PvP is added to fill idle time. The wider professions, trading, and Tourney Grounds remain later systems. If the bounded loop cannot sustain a return visit, the alpha stays a labeled playtest instead of being called a complete game.

## Siege model

### Attacker decisions

- Choose which scouted target to attack.
- Review only information the scout actually discovered.
- Assign Vanguard, Archers, and Riders to different entry routes and objectives.
- Draw or adjust each route on a touch-safe map.
- Decide whether to neutralize towers, force the gate, clear the barricade, protect siege equipment, or rush the keep.
- Commit once the game explains travel time, shield consequence, and what is at risk.

### Defender decisions

- Save a default Defense Captain plan while online.
- Prioritize a gate, tower, wall section, courtyard, or keep.
- Place limited barricades and rally points in legal slots.
- Assign defender squads to hold, intercept, reserve, or counterattack roles.
- If online during the warning window, adjust orders before the plan locks.
- Review the same honest replay and reasons as the attacker afterward.

### Defense kit, introduced in layers

| Defense | What it changes | Attacker counterplay |
|---|---|---|
| Walls | Block direct entry and increase breach time | Route to gate, bring siege units later, or attack a known weak section |
| Gatehouse | Controls the main entry and protects the gate | Disable covering towers, concentrate Vanguard, or choose another approach |
| Archer towers | Create visible ranged exposure zones | Route around range, attack a tower first, or screen with another squad |
| Barricades | Slow a lane and hold attackers under fire | Scout their positions, clear them, or redirect before committing |
| Ditch or moat | Slows specific approaches | Use the bridge/gate route or later engineering support |
| Rally points | Improve defenders assigned nearby | Distract, isolate, or overwhelm that area |
| Reserve squad | Responds after the attacker reveals the main push | Split the attack, feint, or disable the command point later |
| Sally gate | Enables a limited defender counterattack | Watch the flank and assign Riders to intercept |
| Keep doors | Final capture objective | Preserve enough strength through earlier stages to break or force surrender |

Each defense needs a visible map symbol, a deterministic rule, a scoutable state, and a replay reason before it can ship.

### Required before real-army integration

- **Compatibility:** D-04 must map every existing troop type into the new command model, including empty/partial squads, spies, Counts, rams, trebuchets, horses, research, existing orders, and return survivors. Record keep/replace/retire for each old rule.
- **Victory versus ownership:** D-05 separates battle victory, loot, damage, claim progress, occupation, and ownership transfer. Keep-door success does not automatically remove the existing Count/multiple-attack conquest rules.
- **Entry semantics:** D-06 resolves gate and destroyed-tower entry before the training fort teaches those routes. Current configuration contains tower-breach vocabulary while the resolver permits entry only through an open gate. Prove the chosen rule in source, display, and reasons; a victory animation is not evidence of a traversable opening.
- **Lifecycle:** D-07 defines scouted → drafted → committed → marching → warned → locked → resolving → returning → reported. For every state, specify legal edits/cancellation, authoritative deadlines, the captured army/defense/intel revision, disconnect behavior, and resolution after restart.
- **Concurrency:** cover simultaneous attackers, changing owners, completed buildings, reinforcement/army departure while marching, last-second defense changes, and accepted commands with lost replies. One accepted action produces one spend and one result.
- **Rule upgrades:** record battle/layout/plan/replay versions. Either finish old battles before release or retain their historical rules; do not re-resolve a stored battle under whichever code happens to run later.
- **Defeat and return:** D-03 must define a viable protected restart after last-city loss, retained identity/tutorial/cosmetics, what economic progress is lost, and anti-farming protections. This is a proposed recovery direction requiring approval before PvP; permanent starter-capital immunity is not silently introduced.

## Delivery order

### Phase 0 — Trustworthy foundation

**Goal:** preserve the audited server-authority foundation and close integrity failures before public traffic.

- Keep the current audit-fix branch isolated until review.
- Retain fixes for concurrent battle integrity, fog leaks, server-derived retreat timing, command ID validation, missing-secret failure, and command rate limiting.
- Prove Roblox build, Studio behavior, two-client ownership/fog, and a real phone baseline before a public claim.
- Establish backups, health checks, logging, and recoverable hosting before inviting players.
- Check the actual Creator Dashboard audience eligibility and approved family-test access before scheduling children. Record the target maturity and communication capabilities; current policy sources and their recheck gate live in D-11.
- Inventory external user data, retention, deletion/anonymization, and backup restoration behavior. Assign moderation/support and alert ownership before outside users depend on persistent cities.
- Set a proposed alpha capacity and monthly spend ceiling, then validate them. Reuse existing hosting work; do not buy or reconfigure a provider as a planning shortcut.

**Exit:** no known critical integrity defect; server and core tests clean; Roblox gates clean; relevant Studio/phone evidence recorded; audience/test route documented. The external-alpha gate below must also pass before outside players depend on the new persistent opening. Phase 0 is an ongoing dependency, not an assumption that all earlier defects or release obligations are closed.

### Phase 1 — Practice siege vertical slice **(building now)**

**Goal:** prove that route drawing is understandable and affects the result.

- One fixed fort, one fixed NPC defense plan, and three fixed attacker squads.
- Gate, west/east archer towers, barricade, and keep doors.
- Touch/mouse route drawing with Undo and Clear.
- External-server deterministic resolution and phase replay with reasons.
- No resources, rewards, settlement mutation, conquest, alerts, or schema migration.

**Exit:** a player can draw three routes, submit them, see tower/obstacle causality, explain why the fort held or fell, reset, and try again. Show a successful plan, a meaningful failed plan, and an otherwise identical attempt where changing one tactical choice changes a predicted result. Resolve the gate/tower teaching mismatch first. Prove drawing/scrolling, invalid input, target changes, loss of connection, retry, reset, readable replay, and no practice reward/world mutation. Apply the measurable evidence standard below; preserve Phase 1's stateless boundary.

### Phase 2 — The beginning of the game

**Goal:** make a new player's first session self-explanatory.

- Steward-guided arrival and replayable tutorial steps.
- Starter city, starter resources, and three starter squads.
- Atomic fresh-city admission, a once-only grant, and a designed full-capacity response. Never silently hand newcomers developed AI holdings. Keep NPC lands nonclaimable through admission. A bounded alpha must admit at least the seventh fresh identity in its capacity test.
- Visible beginner shield and server-enforced shield rules.
- Building guides at Keep, Storehouse, resource buildings, Barracks, Smithy, War Table, gate, Great Hall, and later Market/Stable.
- Clear action feedback, timers, costs, queue state, and completion notifications.
- Risk-free practice siege as the tutorial finale.
- Minimum real tutorial dependencies: a working Hall guide, one saved training-defense preset with a demonstrated effect, and the safe Scout survey. These are not the later clan/social hub, live defense placements, or armed NPC camps.
- Persisted tutorial checkpoints, interrupted-action recovery, existing-player migration, and the useful return-session loop.

**Specification:** [Player-first opening](../superpowers/specs/2026-09-07-player-first-opening.md). Proposed starter quantities/timers have one source there, not duplicated across guides. D-01, D-02, D-08, D-09, D-10, D-11, and D-13 must be resolved to the degree required by the planned increment before implementing it.

**Exit:** a fresh player completes the opening without outside explanation and can name their next useful action.

### External-alpha gate — after the opening, before real PvP

This gate is required even if a prior version of the game already has hosting or publication. Earlier deployment is not proof of this revision's compatibility or readiness.

| Check | Required evidence |
|---|---|
| Audience | Actual account/experience eligibility and permitted tester access checked; no assumed universal chat or private-place access |
| Persistent state | Repeat/concurrent joins, interrupted grants, jobs completing offline, schema migration of existing cities, and restore after restart |
| Recovery | Backup restored into an isolated environment; declared data-loss/recovery targets and a named response owner |
| Operations | Database-aware readiness, useful alerts, maintenance behavior, record retention, capacity measurement, and approved cost ceiling |
| Release compatibility | Matching server/client revisions; old-client rejection or compatibility; old battles drained or versioned; practical rollback procedure |
| Moderation and data | Shared-text inventory, filtering and safe failure, reports/removal, external-data erasure/anonymization procedure, and support owner |
| Human evidence | Completed first-session/return-session trials and real-device matrix with failures recorded honestly |

No numeric performance target, cost ceiling, recovery target, or audience check is marked passed without its named evidence. Release, purchase, publication, and live-data changes still require Adam's explicit approval.

### Phase 3 — Real attack and home defense

**Goal:** turn the practice language into fair asynchronous PvP.

- Scout maps generated from real, permission-safe intel.
- Server-side route resolution integrated with real armies and travel.
- Defense Captain with saved legal placements and priorities.
- Incoming-attack warning and plan-lock rules.
- Staged gate/courtyard/keep capture and server-calculated fortification effects.
- Honest battle replay, reports, recovery, and protection against immediate beginner loss.
- The first accepted, explicitly confirmed real player attack removes the beginner shield. D-02 must first solve the all-new-world case where every possible human target is still protected; do not invent expiry or another removal exception while implementing it.
- Approved D-02 through D-07: first-war entry and protection, defeat/re-entry, eleven-unit compatibility, battle versus conquest semantics, fort entry, state timing, and historic-rule compatibility. Apply the external-alpha gate before enabling new real-army commands.

**Exit:** two players can attack and defend one settlement, including an offline defender, without client authority or unexplained outcomes.

### Phase 4 — Clans and communication

**Goal:** give players durable groups and cooperative reasons to return.

- Roblox-filtered world and clan channels with mute/report/moderation paths.
- Prove supported cross-instance reach and communication eligibility before building a universal world/clan chat promise. Membership, invitations, notices, donations, and cooperation work without freeform chat.
- Clan creation, name rules, profile, banner, description, roster, roles, invitations, join/leave, and ownership transfer.
- Clan notice board and online status that respects privacy.
- Reinforcement/support marches, resource donations, and shared scout intel after permission design.
- Clan war table and co-command roles after solo siege proves fun.
- Define permission changes, immediate loss of access on kick/leave, absent leaders, blocking, spam limits, filtered stored text, and moderator removal. Do not carry private intel or messages to a user who has lost access.

**Exit:** a clan can form, communicate safely, understand its membership, and cooperate on one server-authoritative goal.

### Phase 5 — A city players want to inhabit

**Goal:** make the time between timers and battles enjoyable.

- Great Hall social hub, clan recruiting, notices, celebrations, and NPC stories.
- Expand the minimum Phase 2 Hall; do not rebuild it as an unrelated system. Keep audience classification consistent with actual activities and presentation.
- Player/city profile with achievements, heraldry, favorite outfit, and selected public stats.
- Cosmetic inventory and outfit preview.
- Fair cosmetic shop for armor appearances, clothing, banners, emotes, mounts, and city decoration after product and policy review.
- Tourney Grounds with scheduled automated shows, spectating, jousting, archery, races, and seasonal city festivals.
- Daily/weekly goals that reward play variety without punishing missed days.
- Before shop code, approve D-14's ownership, verified receipts, duplicate protection, interrupted purchase recovery, current pricing, and support rules. Proposed first scope is guaranteed-price, non-tradable cosmetics without paid randomness; it is not a confirmed catalog or purchase authorization.

**Exit:** players can spend a session socializing, customizing, spectating, or competing without starting a war.

### Phase 6 — Peaceful professions and player economy

**Goal:** make non-war specialists valuable to the same persistent world.

- Gathering: farming, mining, lumber, and NPC-camp exploration.
- Professions: smithing, stable work/horse breeding, crafting, hauling, and merchant play.
- Market listings, direct safe trade, caravans, supply risk, and provenance for valuable goods.
- Clan and city demand connects peaceful production to defense and campaigns.
- Anti-bot, anti-duplication, and age-appropriate trade protections before live economy rollout.
- Model sources and spending, offline production caps, stock loss/recovery, trade fees, donation restrictions, alternate-account farming, and item provenance. Keep paid cosmetic ownership separate from ordinary resource markets unless a later approved policy explicitly connects them.

**Exit:** a player can progress and become useful through production and trade without conquering a city.

### Phase 7 — Realm life and long-term war

**Goal:** support a living world that can grow, resolve, and begin again.

- Expand the world/region boundaries and safe placement established in Phase 2. Large-scale distribution comes here; basic identity-linked city admission and a defined capacity response do not wait for this phase.
- Terrain and geography that affect scouting, routes, caravans, and war.
- Clan campaigns, alliances, diplomacy, territory, and shared objectives.
- World victory, seasons, reset/legacy rules, history, monuments, and returning-player recovery.
- Expand the operations, moderation, support, metrics, capacity, and incident systems already required by the external-alpha gate. They are not first introduced here.

**Exit:** the world can admit new players, sustain communities, reach a fair conclusion, preserve history, and start another era.

## Build rules for every phase

- The external world server decides all game outcomes and owns persistent state.
- A client-submitted route, timer, position, price, reward, or battle result is a request, never truth.
- Phone readability and touch targets are acceptance criteria, not polish.
- New schema requires a migration; stateless prototypes should avoid schema changes.
- Every meaningful rule needs a deletion-sensitive test.
- Every interface must show loading, success, failure, retry, and offline states.
- Any system involving children, chat, purchases, profiles, or trading receives an official Roblox policy and safety review immediately before implementation because platform rules can change.
- No push, merge, deploy, publication, public repo, real purchase, or paid service happens without Adam's explicit approval.

### Evidence standard for each exit

Every phase records the tested source revision, setup, environment, expected behavior, observed behavior, evidence location, and unresolved failures. Code tests, Studio simulation, real phone input, and first-time-player comprehension are separate evidence columns.

- **Usability proposal:** five unfamiliar testers spanning the intended younger audience and an older player; at least four complete the phase's actual flow without coaching and explain one tactical improvement. G-01 tests practice completion and safe-army understanding; G-03 adds the complete opening, next city action, and shield comprehension after Phase 2 is built. D-13 and the opening specification define the relevant checks. Define help consistently, record completion time/errors/abandonment, and retain failures. This is a small usability gate, not statistical proof of retention. Confirm permitted access before inviting children.
- **Phone baseline:** 320px and 390px logical layouts plus named real devices, including a weaker device where available. Verify readable copy, non-color squad cues, 44px-or-larger controls, finger obstruction, gesture/scroll arbitration, orientation/background interruption, and saved-plan retry. A tap-to-waypoint alternative is a candidate if the drawing test demonstrates a need, not a removal of route strategy.
- **Replay:** label battle outcome and ownership separately; allow review at the player's pace, with skip/review controls and clear non-audio reasons. Preserve authentic phase order; a captioned movie is supporting evidence, not proof of comprehension.
- **Reliability:** duplicate submissions, accepted response loss, simultaneous actions, outage/restart, stale ownership/permissions, migration, and offline progression. Practice remains harmless and its controlled persistence probe remains separate from normal economy accrual.
- **Return loop:** observe both short and longer return sessions, whether the player finds a useful action, and whether waits create a dead end. Record no-chat and low-population cases.

### Audit closure map

| September 7 audit gap | Binding planning location | Due before |
|---|---|---|
| Tutorial dependencies and impossible recruitment | Opening specification; D-01 | Phase 2 implementation |
| Shield contradiction and edge cases | Locked rule 3; D-02 | Persistent onboarding / any qualifying hostile action |
| Last-city defeat/re-entry | D-03 | Real PvP |
| Army compatibility, capture, fort entry, timing | Siege prerequisites; D-04–D-07 | Entry semantics before Phase 1 acceptance; remaining items before Phase 3 |
| Six seats and world/region boundaries | Phase 2 admission; D-08 | New-city implementation |
| Second session and economy | Opening specification; D-09–D-10 | External alpha / later economic extensions |
| Audience, communication, Hall classification | Phase 0; D-11 | Tester access and affected shared features |
| Recovery, moderation, external data, cost | External-alpha gate; D-12 | Outside persistent play |
| Human understanding and actual phone input | Evidence standard; D-13 | Respective phase acceptance |
| Shop/trade integrity | D-14 | Purchase/trade implementation |
| Later scope and conflicting status documents | This revision and canonical-brief current notice; D-15 | Before the dependent phase |

## Decisions deliberately left open

These need evidence or Adam's judgment later; the team should not invent them during Phase 1:

- Final game name.
- Large-scale server/region sizes, season length, and world win condition. A bounded Phase 2 capacity and minimal world/region contract are required earlier under D-08.
- There is no timed beginner-shield expiry in the locked plan. D-02 contains remaining action/recovery cases, not permission to invent expiration.
- Warning duration and offline timing must be settled under D-07 before real-PvP implementation.
- Clan size, role names, age/privacy visibility, and leadership succession.
- Shop catalog, prices, purchase limits, refund/support flow, and whether trading cosmetics is allowed.
- Exact job controls and how active play compares with offline production.
- Final art direction and full-game animation/device budgets; retain the recorded 200-soldier phone result and measure new scenes separately.
- Public release date and current hosting readiness/capacity/cost. The existing VPS/runbook choice is not reopened merely because an old note lists it as undecided.

## Immediate work queue

1. Review this revision, the opening specification, and decisions due before Phase 2. Record acceptance or corrections to proposed tuning/rules before dependent gameplay implementation.
2. Resume the paused Phase 1 checkpoint only when Adam returns computer control. Inspect current apps first; do not assume the September 4 server/place is still running.
3. Reconcile D-06's gate/tower teaching rule, verify the saved display fixes in the rebuilt place, and finish all-three-route, invalid-plan, reset/retry, phone, and human-understanding evidence.
4. Preserve the existing core/server/type/Luau/build checks, rerunning those relevant to any code changes. Record the honest captioned practice walkthrough after stability; it is not the unbuilt full-day live-game journey.
5. Obtain Adam's Phase 1 judgment. Then implement the separately scoped Phase 2 increments from the opening specification after their due decisions are recorded.
6. Pass the external-alpha gate and settle combat/recovery decisions before connecting the new route language to real armies and ownership. Merge, push, deployment, publication, purchases, and live-world changes retain their explicit approval boundaries.
