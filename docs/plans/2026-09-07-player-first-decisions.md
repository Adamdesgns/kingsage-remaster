# Kingsmarch player-first decisions and release gates

**Date:** 2026-09-07

**Planning owner:** Adam; drafted by Codex

**Status:** audit follow-up and implementation decision register

**Scope:** documentation only. No new mechanic, account setting, hosting purchase, deployment, merge, push, or Roblox publication is authorized by this file.

Read with the [revised roadmap](2026-09-04-player-first-roadmap.md) and [Phase 2 opening specification](../superpowers/specs/2026-09-07-player-first-opening.md). The roadmap owns product direction; the opening specification owns the proposed starter values and step-by-step lesson. This register owns unresolved decisions, their deadlines, and the evidence needed to clear them. Do not copy tuning values into this file.

The September 4 owner decisions remain in force: ages 9+, no gore, phone baseline, on-foot cities, the hybrid War Table, external-server authority, offline resolution, a city for each newcomer, beginner protection, and cosmetic-only monetization. The practice prototype remains stateless, reward-free, and separate from real battles. The audit did not approve replacing the existing conquest system.

## Status and responsibility

| Status | Meaning |
|---|---|
| **Locked** | An existing owner decision. Change only with an explicit new owner decision. It does not mean the feature exists or has passed testing. |
| **Proposed default** | A concrete recommendation ready for review. It is not silently promoted to an owner decision by appearing in a specification. |
| **Evidence gate** | Required proof or a technical contract is still missing. A passing build cannot substitute for the named evidence. |
| **Later** | Intentionally deferred, with a deadline before the dependent feature. |

Adam owns product choices, budget, audience, and release approval. Codex owns this planning revision. For future implementation and verification, “engineering owner” means the implementer explicitly assigned to that phase; no additional team member or ongoing service is assumed. The release record must name an actual person responsible for monitoring, moderation, and support before those duties become live.

A decision's **Due before** is the deadline for settling its design and implementation contract. Runtime evidence listed alongside it is produced after the relevant build and required at that feature's exit or release gate; it is not a demand to demonstrate unbuilt behavior before coding. Audience and operational readiness must precede outside invitations; the unfamiliar-player study then supplies the understanding evidence.

## Decision register

### D-01 — Opening grant and lesson dependencies

**Status:** Proposed default

**Owner:** Adam for tuning; Phase 2 engineering owner for implementation

**Due before:** Phase 2 persistence and tutorial implementation

**Acceptance/evidence:** one approved opening-spec revision; cost/unlock arithmetic; interrupted and repeated onboarding tests; an unaided first-player recording.

Use the opening specification's exact fresh-city template, once-only resources and troop grant, and one legally recruitable unit. Inspect the granted guard and its three group labels; do not tell players that all three troop classes are normally recruitable from the initial buildings. A founding gift is an explicit exception, not a hidden global unlock or a refill on reconnect. Practice squads remain a separate, unlimited training fixture.

Pull only the tutorial's minimum dependencies forward: a saved defense preference with an honest demonstration, a civic Great Hall guide, and an available safe scout objective. Evaluate existing Freeholds as scenery or future targets; the Phase 2 survey must not accidentally launch a hostile march or promise repeatable resource rewards. Every offered “next goal” must lead to usable content. Deeper defenses, Hall social features, and camps remain later work.

### D-02 — Beginner shield

**Status:** Locked for the owner rule below; remaining edge cases are open

**Owner:** Adam for edge-case policy; Phase 2/3 engineering owner for enforcement

**Due before:** Phase 2 shield storage; all war-related edge cases before Phase 3

**Acceptance/evidence:** approved state-transition table and server tests for accepted, rejected, duplicate, cancelled, and interrupted requests.

The shield has **no automatic time expiry**. It ends only after a deliberately confirmed first real player attack. Practice and tutorial NPC activity leave it intact. Changing this rule requires Adam's explicit decision; “shield duration” is not an ordinary tuning option.

The recommended transaction boundary is a successfully accepted qualifying PvP launch. Confirmation alone is not success. Rejection or loss of connection before acceptance cannot spend the shield; a lost success response must recover the existing result rather than issue another launch. The server must validate the target's protection and the attacker's state together.

The opening specification proposes kingdom-wide coverage, restricted war assistance, no restoration after an accepted attack, and a bounded outgoing-scout rule. These are ready for review, not ratified. Its scout proposal permits ordinary scouting of an unprotected player, because the current real attack requires an owned scout report; banning every outgoing scout would otherwise make a first attack impossible. Resolve the protected-scout advantage or specify a complete alternative before enabling that path. Phase 2 exposes only the harmless NPC survey.

**Unresolved first-war blocker:** in a new world where every human kingdom has a shield, rejecting every attack on a protected player while removing protection only after an accepted attack leaves no legal first attacker. An existing unprotected opponent is not guaranteed, and the outgoing-scout proposal does not solve this case. Before G-05, Adam must approve a complete way for willing players to begin war that is reconciled with the locked protection rule, including confirmation, intel, simultaneous acceptance, and cancellation behavior. Do not silently add time expiry or voluntary shield removal. Test a world containing only fresh protected humans; real PvP stays unavailable until the approved path works.

Still settle before real war: hostile scouting, reinforcement, resource donations, cancelled accepted marches, targets changing owner, additional cities, simultaneous inbound attacks, and whether protection applies to the player or individual city. Ratify the storage scope before Phase 2 persistence. Unsupported war actions remain unavailable until their rules are adopted and enforced. Do not restore a spent shield simply because a player reconnects or repeats a lesson.

### D-03 — Losing the final city

**Status:** Proposed default

**Owner:** Adam; Phase 3 engineering owner prepares the recovery contract

**Due before:** any player can lose their last settlement

**Acceptance/evidence:** owner-approved defeat/re-entry rules and a complete loss → return → viable next action drill, including repeat-loss abuse and reconnect cases.

Recommend a guaranteed viable protected restart after final-city defeat, preserving player identity, tutorial progress, and cosmetic ownership. This is a new recovery recommendation, **not an approved permanent immunity rule**, and it must not turn an ordinary login into a new founding grant.

The contract must specify when recovery becomes available; what happens to clan membership, achievements, troops, resources, horses, queues, and buildings; where the new city is placed; and how the player understands the loss. Distinguish the original once-only founding grant from any separately authorized recovery provision. Prevent deliberate defeat, alt-account transfers, and repeated restarting from producing tradable surplus. The exact protection/recovery package remains Adam's decision. Current final-city elimination is not silently rewritten by this plan.

### D-04 — Eleven troop types and three command squads

**Status:** Evidence gate

**Owner:** Phase 3 engineering owner, with Adam reviewing gameplay changes

**Due before:** connecting route resolution to real armies

**Acceptance/evidence:** approved keep/replace/retire matrix, migration examples, paired old/new battle fixtures, and cross-language agreement tests.

The real game already has eleven troop types; the practice resolver has three fixed squads. These are not interchangeable army formats. Create a compatibility matrix covering every row below, with a final disposition, player-visible effect, migration, and required test. Every disposition is presently **undecided**; existing behavior stays in place until a replacement is approved.

| Existing behavior to account for | Required decision |
|---|---|
| Infantry, archers, mounted troops and their counters | Which real units join each drawn squad; whether squad roles are fixed or selected |
| Full-garrison attack selection | Whether partial armies are allowed; minimum force and empty-squad behavior |
| Spies, Counts, rams, trebuchets | Separate roles, accompanying units, or squad membership; no unit silently disappears |
| Research, wall levels, horses and cavalry conversion | How each modifier and owned asset affects dispatch, losses, survivors, and return |
| Orders, charge/attendance effects, surrender and defection | Keep, replace, or retire each with an explicit fairness reason |
| Loot, casualty rounding, march speed and returning survivors | Accounting through all stages, including zero survivors and duplicate processing |

Do not turn illustrated soldier positions into server authority. Route geometry can inform deterministic squad calculations without making client frame rate or animation determine combat.

### D-05 — Winning the battle versus owning the settlement

**Status:** Proposed default pending a conquest decision

**Owner:** Adam; Phase 3 engineering owner drafts examples

**Due before:** teaching or implementing real capture

**Acceptance/evidence:** approved conquest flow with examples for raid, won battle without conquest, successful claim, ownership transfer, and final-city loss.

Keep the existing Count/Realm-of-Power conquest behavior as the current baseline while reviewing the new siege design. A keep-door victory must not automatically become ownership transfer. Adam still needs to decide whether staged siege victory precedes, feeds, or replaces the existing multi-attack claim system.

Report tactical victory, loot, damage, claim progress, ownership transfer, and survivor return separately. Practice wording must say the training fort fell or held; it grants no real city. The real contract must also explain repairs, unfinished building/recruitment queues, resources, horse ownership, allied troops, and marches already heading to a captured settlement. No migration or retroactive removal of earned progress is implied.

### D-06 — Gate, tower, and breach meaning

**Status:** Evidence gate

**Owner:** Phase 1 engineering owner; Adam reviews any expanded mechanic

**Due before:** declaring Phase 1 instructional proof complete

**Acceptance/evidence:** one consistent rule in map symbols, route validation, resolver, reasons, tutorial, and controlled route-change tests.

The audit found a teaching mismatch: practice guidance implies tower-opening routes, while the current resolver admits squads through an opened gate. Choose and state the actual entry rule. Destroying a tower must not be presented as making a traversable breach unless the server models that breach. Fix the teaching to match the bounded prototype or explicitly design and verify the new rule; neither interpretation should be assumed by a future implementer.

For later defenses, define legal access, timing, exposure, clear/disabled states, and counterplay before adding their map icon. A gate, wall, barricade, or keep door is only a gameplay feature when it changes the calculation and the replay can explain how.

### D-07 — Siege lifecycle, retries, and rules versions

**Status:** Evidence gate

**Owner:** Phase 3 engineering owner; Adam decides timing/fairness policy

**Due before:** persistent route-based marches or editable defenses used in real sieges

**Acceptance/evidence:** approved lifecycle table, deterministic concurrency/restart tests, and a deployment-compatibility rehearsal.

Specify `scouted → drafted → committed → marching → warned → locked → resolving → returning → reported`, including any intentionally combined or skipped states. For each state record the authoritative timestamp, legal edits/cancellation, intel and defense revision, force snapshot, resource commitment, player status message, and recovery after disconnect. Warning duration and defense-lock timing remain product decisions; do not invent them while wiring the UI.

Required cases: two attacks arrive together; defender construction completes or an army leaves during travel; a target changes owner; a defense edit meets the lock deadline; an accepted command loses its reply; and a server restarts across a deadline. A repeated request must return its recorded outcome without charging, launching, or resolving again.

Version real siege rules, layouts, plans, and replay events deliberately. Decide whether a deployment drains old battles first or retains their old resolver. Define old-client behavior, migration preflight and backups, rollback compatibility, and reconciliation of in-flight actions. Transport contract version alone does not answer those questions.

### D-08 — World, region, and fresh-city admission

**Status:** Evidence gate

**Owner:** Phase 2 engineering owner; Adam approves capacity and placement policy

**Due before:** the first persistent newcomer cohort

**Acceptance/evidence:** topology/admission contract; seventh-newcomer, simultaneous-join, repeat-join, capacity, existing-account, and recovery fixtures.

Define the persistent world, geographic region, and Roblox server instance separately. Specify reconnect placement, joining friends, visiting cities, region transfer, multi-city navigation, remote march authority, public map data, and owner-only detail. The existing region-world direction remains locked; a coordinate grid is not evidence of supported population.

Every accepted newcomer receives the approved fresh template, never a developed AI seat relabelled as new. Allocate a single city and founding grant atomically per eligible identity, including simultaneous joins. Keep designated NPC land out of the admission pool. Define existing-player migration, the full-region response, and the bounded test capacity. If the approved capacity is reached, give an honest unavailable/retry result before creating a half-account. Large-world growth remains later; undefined admission does not.

### D-09 — A useful return session

**Status:** Proposed default

**Owner:** Adam and the Phase 2 gameplay owner

**Due before:** the opening is offered as a complete early-game loop

**Acceptance/evidence:** short and longer return-session scripts, timed against actual production/travel rates, observed with shield intact and no other players online.

Use the opening specification's session budgets. A short visit should reveal completed work, allow one useful city/army action, and leave a clear next step. A longer session should support a safe scout or practice goal and an explainable improvement while other work runs. State the maximum unavoidable wait and a real activity during it. No daily streak loss, forced PvP, mandatory chat, or future profession system is needed to make this initial loop useful. Test the second visit rather than inferring retention from tutorial completion.

### D-10 — Early economy and later production

**Status:** Proposed default for the opening; deeper tuning Later

**Owner:** Adam for progression; engineering owner for accounting and simulations

**Due before:** Phase 2 rewards/production tuning; donation and market rules before Phases 4/6

**Acceptance/evidence:** resource flow sheet for new, returning, defeated, shielded, and established players; duplicate/replay abuse cases; documented waiting-time and recovery budgets.

Preserve existing ordinary production and troop prerequisites unless a named change is approved. The opening specification owns starter amounts and tutorial costs. Distinguish production, founding grants, one-time lesson rewards, loot, trade, and purchases as resource sources; record building, training, upkeep if introduced, repair, and market costs as sinks. Do not quietly add upkeep or a new currency.

Measure offline caps, warehouse overflow, population capacity, time to replenish losses, and runaway growth. Before donations, define eligible participants, protection interactions, transfer limits, and anti-farming controls. Before professions, decide how active work supplements or replaces automatic production without making passive city owners or peaceful specialists pointless. Paid cosmetic entitlements remain separate from ordinary resource transfers until D-14 is approved.

### D-11 — Audience, communication, and civic life

**Status:** Evidence gate

**Owner:** Adam for account/audience decisions; assigned engineering and moderation owners for proof

**Due before:** scheduling outside playtests; again before shared-text and clan features

**Acceptance/evidence:** current dashboard eligibility and permitted test-audience record; content review; communication capability matrix; two-instance delivery/privacy tests.

Official Roblox documentation was checked on 2026-09-07. The Kids/Select framework is actively rolling out; documentation does **not** establish Adam's account eligibility. Inspect the actual Creator Dashboard before scheduling the intended audience. Record the eligible Limited/Playtesters or public route and recheck before publication. No fee, subscription, account change, or publication is authorized here. [Roblox audience requirements](https://create.roblox.com/docs/production/publishing/kids-and-select)

World/clan communication must respect each participant's platform permissions. Define same-server, platform-wide, and private-clan reach explicitly; prove supported behavior instead of relaying unrestricted chat through the external server. Joining a clan does not guarantee chat access. Tutorial, membership, roles, and game actions must work with chat unavailable; joining, leaving, kicking, and blocking must immediately affect access. Conversations use Roblox's supported chat path. [Chat system guidelines](https://create.roblox.com/docs/chat/guidelines)

Any tactical presets are finite game actions, not an alternate unrestricted conversation system. Validate the current filtering, display, count, and rate requirements when implementing them. [Preset requirements](https://create.roblox.com/docs/chat/preset-system-guidelines)

Keep the Great Hall an activity-led civic place in the strategy game. Review its actual activities, layout, props, name, and description together. Alcohol-free wording alone does not establish maturity eligibility. Define combat casualties, sound, injury depiction, and frequency before the art pass; answer the questionnaire from the actual content. [Content maturity definitions](https://create.roblox.com/docs/production/promotion/content-maturity)

### D-12 — Minimum live operations, privacy, and moderation

**Status:** Evidence gate

**Owner:** Adam names the operating/support owner; engineering owner supplies drills and runbooks

**Due before:** outside players depend on persistent cities; text controls before the first shared editable field

**Acceptance/evidence:** completed external-alpha gate with named owners, budget and capacity ceilings, a dated restore drill, and a tested account-data workflow.

Use the [existing VPS runbook](../ops/vps-runbook.md) as a starting point. Required additions or live proof are:

- Database-aware readiness, actionable logs, monitored backups, alert delivery, and tested restoration to a clean environment. A responding process is not enough.
- A monthly spending ceiling, bounded player/settlement load, disk-growth and event-retention limits, and behavior when those limits are approached.
- Maintenance, clean shutdown, pending-action recovery, deployment order, rollback, secret rotation, and account/world repair. Record what recovery can lose and how long it may take; Adam approves those limits before use.
- An inventory of stored user data, minimum collection, access controls, retention, deletion/anonymization intake, and backup-restore handling. Include external SQLite, logs, exports, histories, and later economic records; explain legitimate retained records rather than promising unconditional deletion of everything. [External-data responsibilities](https://create.roblox.com/docs/production/publishing/RTBF-and-creators)
- An inventory of every shared user-text field, author identity, filtering on display/retrieval, safe behavior when filtering fails, edit limits, reporting/removal, and a responsible moderator. Stored city/clan names, notices, and external-server text need deliberate handling too. Start heraldry with curated components. [Text filtering](https://create.roblox.com/docs/ui/text-filtering)

The release record must name who handles an incident or player report and how to reach them. Do not put these minimum duties behind the final realm-life phase or assume an unattended developer machine is recoverable hosting.

### D-13 — Learnability, device, and honest evidence

**Status:** Evidence gate

**Owner:** assigned playtest/engineering owner; Adam reviews the release claim

**Due before:** completing Phase 1 and Phase 2; rerun relevant cases after changes

**Acceptance/evidence:** build-tagged automated results, actual Studio/device recordings, and observed first-time-player outcomes with every unresolved blocker listed.

Use the opening specification's proposed cohort size, with phase-appropriate tasks. For G-01, at least four of five unfamiliar testers complete the practice flow without coaching and explain one changed route's effect; all understand that supplied practice forces do not spend city troops. Full-opening completion, finding a next city action, and understanding the beginner shield belong to G-03 after Phase 2 is built. Record help requests, invalid submissions, abandonment, elapsed time, and whether the player predicts and explains the changed result. Show a meaningful failed plan, a successful plan, and controlled tactical causality. A small usability sample is not proof of broad retention.

The device matrix must include real phone input, finger obstruction, drawing versus scrolling, accidental taps, target selection, readable errors, interruption, reset/retry, and plan preservation after recoverable network errors. Identify squads by text/shape as well as color; provide replay pacing controls. Test a waypoint alternative if drawing proves inaccessible. Preserve earlier [phone troop-drill evidence](../superpowers/spike-200-troops.md), while recognizing it does not verify the new planner or full city.

Keep automated tests, rendered Studio behavior, real-device behavior, and external-player understanding as separate evidence categories. None can be marked passed because another passed.

### D-14 — Cosmetic purchases and trading

**Status:** Later, with a Proposed default for the first shop

**Owner:** Adam approves products/prices; assigned engineering owner proves entitlement and trade safety

**Due before:** Phase 5 shop implementation or any paid item entering Phase 6 trade

**Acceptance/evidence:** separately approved shop specification, current policy review, duplicate/interrupted purchase drills, and entitlement recovery across conquest and seasons.

Recommend fixed-price, non-tradable cosmetics with no paid randomness for the first shop. This is narrower than the eventual vision and remains a recommendation. Cosmetic-only power balance is already locked.

Specify product type, current displayed price, confirmation and parental safeguards, permanent entitlement ownership, authenticated grant handling, repeat receipt protection, reconnect recovery, and support. A completed purchase prompt does not prove payment; verification belongs on the supported server path. [Developer product guidance](https://create.roblox.com/docs/production/monetization/developer-products)

Before trade, approve provenance, eligible participants, scam protections, both-sided confirmation, atomic exchange, and recovery if either participant disconnects. Keep paid goods distinct from generated game goods. Recheck current player-specific purchase/trade restrictions before designing any paid-item market; this roadmap does not authorize one.

### D-15 — Intentionally later decisions

**Status:** Later

**Owner:** Adam, supported by the assigned phase owner

**Due before:** each dependent implementation or public claim

**Acceptance/evidence:** dated decision in the relevant feature specification, with measurable scope and updated release gates.

| Decision | Last responsible point |
|---|---|
| Final name and brand clearance | Before publication or marketing under a final name |
| Final art/animation style and production asset budget | Before the asset pass; readable Phase 1 symbols and a measured phone budget are needed sooner |
| Clan size, titles, succession and visibility | Before Phase 4 membership persistence and public profiles |
| Complete shop catalog and prices | Before D-14's separate product approval |
| Professions, active/passive balance and caravan risk | Before Phase 6 economic implementation |
| Large-world capacity, diplomacy, seasons and victory | Before Phase 7; minimum Phase 2 topology/admission is D-08 |
| World reset, legacy/history and returning-player treatment | Before the first season/reset; final-city recovery is earlier under D-03 |
| Public release date | After audience, hosting, recovery, device and current-build gates have evidence |

## Release gate register

All gates below are **open** at this planning revision. An existing test or earlier drill can satisfy part of a gate only when its scope and build still match. “Required” does not mean “already done.”

| Gate | Status | Owner | Due before | Required acceptance/evidence |
|---|---|---|---|---|
| G-01 Practice understanding | Evidence gate | Phase 1 engineering/playtest owner | Phase 2 opening implementation | D-06 and D-13: correct entry teaching; three routes; accepted/rejected plans; reset/retry; meaningful success/failure; route-causality proof; real phone and unfamiliar-player evidence |
| G-02 Opening design contract | Evidence gate | Adam + Phase 2 engineering owner | Phase 2 persistence/tutorial build | D-01, D-02, D-08, D-09, D-10: reviewed opening spec, exact budget/unlocks, one-time grants, shield contract, fresh admission, migration and return-session behavior |
| G-03 Complete safe opening | Evidence gate | Phase 2 engineering/playtest owner | Calling the opening complete | Arrival → city action → guard/recruitment → practice → safe scout → useful return visit; no prerequisite depends on unavailable later content; interrupted sessions resume correctly |
| G-04 External persistent alpha | Evidence gate | Adam + named operating owner | Outside users rely on saved cities | D-11, D-12, D-13: audience access, named support/moderation, measured load/cost, database-aware readiness, clean restore, maintenance/restart, data handling and real device evidence |
| G-05 Real PvP | Evidence gate | Adam + Phase 3 engineering owner | Players can spend real forces or lose cities under new sieges | D-02 through D-08: approved combat/capture/recovery/timing contracts; shield and snapshot races; ownership/privacy; deterministic concurrency; duplicate/lost-response recovery; migration and rules-version compatibility; online/offline defender drills |
| G-06 Shared identity and cooperation | Evidence gate | Phase 4 engineering/moderation owner | Clan communication, profiles, donations | D-10 through D-12: supported channel reach and permission checks, no-chat usability, shared-text inventory/filtering, reporting, role revocation, economic-transfer abuse cases |
| G-07 Shop and economy release | Evidence gate | Adam + assigned engineering/support owner | Purchases or player trading | D-10 and D-14: approved product/economy rules, verified entitlements, provenance, interrupted transaction recovery, support and current policy checks |

Every gate record must contain: date; tested commit/build and environment; scenario and expected outcome; evidence path; actual result; device/load/audience limits; reviewer; and remaining blockers. Failed cases remain failed until new evidence closes them. Missing proof is recorded as **not verified**, never inferred from source or a successful build.

Completing a gate prepares a concrete release decision for Adam. It does not authorize publication, a paid service, deployment, push, or merge.

## Source boundaries

Current implementation references include [combat and conquest rules](../../packages/game-core/src/combat.ts), [live warfare](../../packages/game-core/src/warfare.ts), [economy/unlocks](../../packages/game-core/src/economy.ts), [world store](../../server/src/store.ts), and [practice resolver](../../packages/game-core/src/practice-siege.ts). They are evidence of current behavior, not proof of the new roadmap's completion. The [canonical brief](../design/CANONICAL-BRIEF.md) carries the enduring architecture locks; its dated status snapshots must not override fresh code or the revised roadmap's delivery status.

Official Roblox sources linked in D-11, D-12, and D-14 were read on **2026-09-07**. They are a planning baseline and must be refreshed at the named implementation/release gates. No Creator Dashboard, age eligibility, account configuration, policy approval, live hosting, moderation capability, or purchase path was verified by this document revision.
