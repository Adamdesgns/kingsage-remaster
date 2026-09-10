# Kingsmarch Phase 2 — player-first opening specification

**Date:** 2026-09-07

**Status:** implementation proposal, revised after the roadmap audit; documentation only

**Owner:** Adam; drafted by Codex

**Applies to:** the safe opening loop after the Phase 1 practice experiment passes its acceptance gate

**Related documents:** [player-first roadmap](../../plans/2026-09-04-player-first-roadmap.md), [decision register](../../plans/2026-09-07-player-first-decisions.md)

This specification turns the opening into a sequence an implementation team can build and test. It does not claim that starter grants, shields, new-city admission, the tutorial, saved defense, or the NPC survey exist in the current runtime. Adam approved the roadmap revision and preparation of this specification. New numbers, named NPCs, capacity limits, and detailed mechanics below are **PROPOSED v1 tuning**, not separately ratified balance decisions or playtested facts. Decisions D-01 through D-13 in the decision register identify the gates before implementation or exposure to players.

The intended first session is 12–18 minutes of active play, including short walks and reading, without outside coaching. The lesson remains useful when nobody else is online, chat is unavailable, sound is muted, or the player leaves and returns. A slow reader is never failed or rushed. The time target is a usability hypothesis, not a countdown or a reward condition.

## 1. Outcome and scope

A new player finishes with one functioning city, one visible beginner shield, a small permanent founding guard, one completed city improvement, one legally recruited unit, a saved defense preference demonstrated in practice, and a useful next action. They have submitted a three-route practice plan, read an explanation of its result, and received one safe NPC survey report. They can explain that practice soldiers are supplied separately and that a real player attack has different consequences.

Phase 2 includes:

- Atomic new-city founding: identity, city, initial stock, founding guard, shield, and tutorial record are created together or not at all.
- Short on-foot guidance at real city locations, with the war table near the arrival path.
- A single real supply claim, a normal construction order, and a normal recruitment order.
- A minimal Defense Captain interface: save a supported priority and see its effect in a safe demonstration.
- A minimal Great Hall: a usable civic meeting place, Steward, and current next-goal board. Completion never requires another player, a chat message, or a clan.
- One guaranteed safe NPC survey with a timer and report, available in the opening rather than deferred to professions.
- Authoritative progression receipts, resumable help, command uncertainty handling, and acceptance evidence.

This phase does not add route-based real PvP, conquest changes, a full defense placement editor, clans, cross-server communication, a shop, trade, jobs, tournaments, paid hosting, publication, or a season reset. Existing legacy warfare is not silently converted to the practice engine. New opening participants must remain protected from live hostile actions until the shield rules and the separate PvP entry gate are implemented and verified.

## 2. Source baseline and changes required

The following were checked in the feature worktree on 2026-09-07. Source is the baseline for current behavior; this document describes intended changes.

| Current source | Verified baseline | Consequence for Phase 2 |
|---|---|---|
| [`fixture.ts`](../../../packages/game-core/src/fixture.ts) | Eight useful buildings start at level 1; advanced buildings start at 0; initial stock is 1,200 wood / 1,000 stone / 800 iron; armies are empty | Add an explicit new-player template and founding receipt; do not describe the existing fixture as already granting troops |
| [`economy.ts`](../../../packages/game-core/src/economy.ts) | Recruitment and upgrades have real costs, times, prerequisites, and population limits | Use normal legal starter actions, with exact costs shown before commitment |
| [`contracts.ts`](../../../packages/game-core/src/contracts.ts), [`combat.ts`](../../../packages/game-core/src/combat.ts) | Eleven persistent troop types coexist with three command squad IDs | Squad labels are not replacement unit definitions or a complete combat migration |
| [`horses.ts`](../../../packages/game-core/src/horses.ts) | Light cavalry converts from Berserkers plus horses; heavy cavalry from Templars plus horses; direct training is not the intended cavalry path | A founding mounted-unit gift must be explicit; recruitment still needs the normal buildings, foot soldiers, and horses |
| [`practice-siege.ts`](../../../packages/game-core/src/practice-siege.ts) | Stateless practice supplies 18 Vanguard / 14 Archers / 10 Riders and supports gate, crossfire, and keep defense plans | Practice consumes no permanent troops and cannot be used to mint soldiers or resources |
| [`store.ts`](../../../server/src/store.ts), `findOpenSeat` / `linkRobloxPlayer` | Admission first claims an open seat, then can claim an AI-developed seat; the fixed fixture eventually returns `WORLD_FULL` | Introduce safe allocation for genuinely new cities; no arbitrary AI takeover as a fallback |
| [`fixture.ts`](../../../packages/game-core/src/fixture.ts), [`store.ts`](../../../server/src/store.ts) | Four Freeholds are actual conquerable settlements, initially guarded by ten Squires; actual scouting requires a Spy and actual attacks require scout intel | A required safe survey cannot quietly become a real scout march, raid, or conquest lesson |

The implementation must recheck these seams at its actual starting commit. This document is not permission to overwrite unrelated work, reset a durable development profile, or set dev-seed overrides to make the tutorial appear feasible.

## 3. Exact proposed founding template

Template identifier: `opening-v1`. Values in this section are **PROPOSED v1 tuning**. Use one shared server-side definition and cross-language contract checks for anything mirrored in Luau. The client never supplies quantities, building levels, bonuses, or a chosen template version.

### 3.1 City and economy

| Field | Proposed value | Why / constraint |
|---|---|---|
| Owned settlements | 1 fresh capital | Must be allocated to this identity, not inherited from an arbitrary AI realm |
| Buildings at level 1 | `hq`, `timber`, `quarry`, `iron`, `farm`, `warehouse`, `barracks`, `wall` | Retains the current lowest useful fixture; existing wall is a starting asset, not a newly queued upgrade bypassing its prerequisite |
| Buildings at level 0 | `smithy`, `stable`, `workshop`, `academy`, `market` | Their ordinary progression remains intact |
| Initial spendable stock | Wood 1,100; stone 1,000; iron 800 | Leaves a real claimable resource for the collection lesson |
| One founding supply crate | Wood 100; stone 0; iron 0 | Part of the initial budget, not an additional recurring reward |
| Total opening stock budget | Wood 1,200; stone 1,000; iron 800 | Equal to the current fixture budget before passive production and spending |
| Spare horses | 0 | Mounted founding units arrive equipped; no free breeding stock or stable unlock |
| Troop research | Normal initial level 1 for every troop type | No hidden research advantage |
| Queues / marches / battles | Empty | No inherited jobs, depleted garrison, incoming war, or surprise liability |
| Shield | Active; no expiration timestamp | Removed only by an accepted, explicitly confirmed first attack on a human-controlled player kingdom |
| Tutorial | `opening-v1`, arrival available, no completed milestones | Created in the same founding transaction |

Current level-1 warehouse capacity is 1,464 of each resource; farm capacity is 232 population. Current level-1 production is 28 of each resource per hour. These are derived from `storageCapacity`, `populationCapacity`, and `productionPerHour`, not new balance constants. The UI explains that production is automatic, including while offline, subject to storage. Opening a resource panel must not award an imaginary collection bonus.

The supply claim is a one-time transfer recorded by the external server. A full warehouse cannot silently consume it: credit what fits and retain the remainder as claimable stock, or reject with a clear capacity reason. The proposed first implementation credits only what fits and keeps the unclaimed remainder. Progress records the first positive claim; later replay says it was already collected. The supply cannot be traded or transferred before claiming, and is not recreated by reconnect, tutorial replay, city rename, kingdom loss, or a client reset.

### 3.2 Founding guard and the three squad names

| Opening squad presentation | Permanent founding units | Count | Population |
|---|---|---:|---:|
| Vanguard | Squires, persistent ID `spear` | 12 | 12 |
| Archers | Long-bows, persistent ID `archer` | 8 | 8 |
| Riders | Crusaders, persistent ID `lightCavalry` | 4 | 16 |
| Total | All other persistent troop counts are zero | 24 | 36 |

**This is a proposed, deliberate founding-gift exception.** The eight Long-bows and four already-mounted Crusaders are granted once; the city cannot recruit replacements until it meets normal progression requirements. No additional horses or Berserkers are consumed at grant time because the gift is the completed mounted unit. The transaction verifies the template's population, valid troop IDs, and nonnegative integer values before it can found a city.

The Barracks shows each troop's ordinary lock reason. In the present rules, Long-bows need Barracks 5 and Smithy 1; Crusaders need Barracks 3 and Stable 3, plus the conversion's source soldiers and horses. Phase 2 does not lower those gates or enable direct cavalry training. The guide says: “This guard came with your city. Improve your buildings to train more of these soldiers.” This statement and the replenishment wait must be tested with children; gifts that feel irreplaceable are a balance risk before real PvP.

The first actual recruitment is **one Farmer's Militia**, legal at Barracks 1, costing 15 wood / 10 stone / 5 iron and taking 45 server seconds. Afterward the permanent garrison contains 25 units using 37 population. The UI may show the additional militia in the Vanguard group for the opening roster, but does not introduce an army-assignment algorithm or decide where every later troop belongs.

The practice fort separately supplies **18 / 14 / 10** fixed practice soldiers. Its banner must state “Practice army — your city troops are safe.” Losses, survivors, route speed, and power in that mode never update the city garrison. Counts must remain visibly different where appropriate; do not overwrite either roster merely to make numbers match.

The full eleven-type-to-three-squad combat mapping, partial-army selection, siege-unit handling, and research interaction remain D-04 prerequisites for real PvP integration. This opening presentation is not that migration.

### 3.3 Founding and migration constraints

One founding receipt is allowed per authenticated Roblox identity for the current persistent world. The identity has a stable lifetime founding-history marker so deleting a tutorial row, renaming a kingdom, losing all settlements, or creating a replacement kingdom cannot qualify it as a first-ever founder. A future new era or protected recovery may intentionally award a separate package, but only under its explicitly approved D-03/D-15 rules and a distinct audited reason.

Existing players keep their current cities, troops, jobs, horses, resources, and battle histories. Adding the schema must not silently add the founding gift or reset their shield state. They may opt into replayable explanations and stateless practice without receiving a new city or inventory. A separate migration must explicitly classify any existing test accounts chosen to receive the new opening; use a disposable test world for routine verification. Existing-player protection during a real rollout is a documented migration decision, not “all old rows count as beginners.”

## 4. Tutorial sequence and receipts

Guides use short written instructions with optional audio. Working names are **Steward Rowan**, **Captain Elin**, and **Scout Toma**; these are placeholders, not locked character designs. Each step shows one primary action, its destination, and “Help again.” The player remains on foot; guidance must not depend on a developer teleport or invisible auto-completion.

Time figures below are proposed active-play budgets. Normal server timers continue while the player completes other steps. A slower player can take longer; faster players can inspect the report or repeat practice instead of waiting at an empty panel.

| Step / active budget | Prerequisite | Player action | Cost | Server time / completion fact | Result shown | Interruption and resume |
|---|---|---|---|---|---|---|
| 0. Arrival, 1 minute | Founding committed; owner snapshot available | Meet the Steward; find the shield, city name, and return-home affordance | None | No countdown; arrival acknowledgement is non-reward progress | “This is your city. Your shield is active.” | Failed founding shows retry without an empty city; reconnect returns the existing receipt and owner city |
| 1. Supplies, 1 minute | Positive unclaimed founding supply exists, or a prior claim receipt | Walk to Stores and claim the founding crate; inspect wood/stone/iron | None | Immediate server transaction, subject to capacity; receipt says exact credited amount | “100 wood added,” or actual partial amount and remainder; automatic production is explained separately | Reuse the same command ID after uncertain response; never award twice; an already-claimed crate advances to the receipt view |
| 2. First improvement, 1 minute | Timber 1; construction slot available; enough stock | Queue Timber Camp 1 → 2 and locate its timer | 75 wood / 90 stone / 60 iron | 720 seconds at HQ 1 under current shared rules; store actual start/due timestamps | Cost deducted, order ID, queued/running state, remaining time; continue the lesson while it runs | Attach the lesson to that exact order, not any client countdown; reconnect reopens its live state; already-completed equivalent progress is recognized |
| 3. Meet the guard, 1–2 minutes | Founding guard receipt; Barracks accessible | Inspect all three group labels; recruit one Farmer's Militia | 15 wood / 10 stone / 5 iron | 45 seconds at Barracks 1; normal queue rules | Gift explanation, actual troop counts, one training order and completion message | If unit already finished, show its receipt; never queue another automatically; lost response queries the original order |
| 4. Prepare a defense, 1 minute | Owner city and supported preset version | At the Captain, save “Guard the gate”; inspect gate versus keep priorities in the safe demo | None | Immediate version-checked save; practice comparison remains reversible | Saved priority, version, and a visible example of the changed defender distribution | Unknown preset rejected without losing saved selection; refresh on conflict, ask player to save again if intent changed |
| 5. Read the map, 1 minute | War table accessible; Phase 1 layout and entry rules settled | Scout explains one tower range, one blocked boundary, one objective, and the three supplied practice squads | None | No waiting timer | A legend that matches the actual resolver; objective and permitted entry are distinct | Replay explanations without resetting earlier work; no mandatory audio or quiz reward |
| 6. Practice, 3–5 minutes | Valid fixed fort / practice force available | Draw all three routes, select objectives, submit, inspect two or three server reasons; try one change if needed | None; zero city troops at risk | Request resolves on the external server; animation duration has no effect on result | Fort held/fell, supplied-force casualties, ordered reasons, reset/retry, and a change to try next | Invalid plan remains editable; transient failure preserves routes; accepted-result uncertainty retries the same request; no double spending exists in practice |
| 7. Safe survey, 1–2 minutes including start/read | Scout guide available; guaranteed safe survey destination | Send the NPC survey party; inspect its short report when ready | None; no player troops or horses used | 90 server seconds from accepted start; ready status persists until read | Explicit “NPC survey — no combat”; landmark description, travel/status lesson, one suggested next action | Start is once per mission; duplicate start returns the same mission; ready report survives disconnect, restart, or destination ownership change |
| 8. Opening result and next goal, 1–2 minutes | Initial orders have a terminal status; practice result and survey are readable | Return to Steward/Great Hall, inspect finished work, choose next useful action | No additional compulsory spend | Complete when required facts are satisfied; do not depend on elapsed client time | Timber 2 result, militia receipt, shield still active, saved priority, and chosen next action | Construction may still be running for a fast reader: show the exact remaining time and useful activities, not a fake “done”; resume later at remaining facts |

Steps 3–7 may proceed while the first construction runs. The guide can send the 90-second survey before a second practice attempt so its timer has useful overlap. The nominal active budgets total roughly 11–16 minutes; the normal 12-minute improvement starting after arrival gives a practical 14–18 minute target when completion is included. Confirm actual timing in playtests; do not reduce normal construction or grant resources invisibly to force a target duration.

Opening mandatory spending totals **90 wood / 100 stone / 65 iron**, leaving **1,110 / 900 / 735** after the full crate claim, before passive production or optional actions. The ordinary economy must calculate the actual balance; these values are an audit example, not a second client ledger.

If a player spends the needed stock elsewhere or fills a queue voluntarily, the guide shows the real problem and offers a legal path back: inspect the active order, choose an already-completed equivalent lesson, or wait for ordinary production with a visible estimate. Do not silently cancel their order, refund resources, issue another crate, or leave a disabled button without explanation. The default guided path does not spend required resources elsewhere.

Tutorial explanations can be skipped or replayed. Completion milestones that imply actual world behavior must come from accepted commands or durable state. Read acknowledgements may be ordinary non-reward user preferences; they are not evidence of comprehension. No premium item, resource grant, or unlocked hostility depends solely on a client claim that a lesson was read.

## 5. Minimum safe NPC content and Great Hall

The existing Freeholds are real targets. They have finite availability, can change owners, and involve real losses and conquest rules. They are not a guaranteed safe mission for every joining player. A starter city without a Stable cannot train its own Spy; gifting one would still not guarantee a safe, current target or a shared-world report.

**Proposed Phase 2 mission: “Survey the old road.”** The Scout's NPC party checks a publicly visible landmark and returns a short orientation report. This is new Phase 2 work, a small part of the opening rather than the full camps/quest system. It consumes no permanent army, causes no combat, produces no tradeable reward or combat intel, and cannot capture anything. It records a server-timed mission and a report-ready state.

- Prefer an existing Freehold as a named public landmark only if one remains appropriate and its identity/name are permitted public data. The report is a public survey, never a current hidden garrison/building/horse report. Do not add it to real scout intel or let it satisfy the attack prerequisite.
- If all Freeholds are claimed, absent, distant, or unsafe, use a guaranteed training landmark beside the city's safe approach. Joining player seven and later must still have content. Choosing this fallback must not create a new conquerable settlement.
- The mission's accepted destination and harmless report version are fixed at start. If an optional Freehold landmark changes ownership before completion, the report says it surveyed the public road and that the nearby settlement's status changed; it does not imply that attacking it is safe.
- The NPC party is presentation. The external server's accepted start and due time determine completion even when no Roblox instance is rendering it. Client animation, player movement, and UI claims cannot accelerate it.
- Replay is allowed as orientation; it never recreates a one-time reward because this mission has none. Real scouts, tactical intel, raids, and capture remain distinct later actions with prerequisites and costs.

The Great Hall's Phase 2 minimum is a reachable, readable civic space with the Steward and next-goal board. The player may meet others there under supported platform settings, but the lesson must work in an empty server and with communication disabled. No clan recruit button, notice posting, purchase offer, or contest may appear as usable until that feature exists. Static owner-authored NPC guidance is enough for this phase; user-authored notices wait for filtering and moderation design.

## 6. Saved defense: a small honest first step

Phase 2 saves a **versioned preference**, not a collection of free defenses. The proposed minimum is one selected preset from `guardGate` and `holdKeep`, with `guardGate` initially suggested. The server validates the preset ID, version, and city ownership. There are no draggable walls, purchased slots, reserve counts invented by the client, or unimplemented tower upgrades in this interface.

Make the preference meaningful immediately through the safe Defense Captain demonstration: use the same fixed practice fort and identical attacker plan, apply the selected supported defense preset, and show the changed defender distribution and resulting events. A tested sample must produce a relevant difference; the UI cannot call a saved text label a working defense system. The existing practice engine's `guardGate` and `holdKeep` plans provide a bounded candidate, subject to Phase 1 causality acceptance.

The demonstration is labelled “Practice defense.” The city card may show “Preferred order saved,” but must not claim that the current legacy live battle engine obeys the preset. Before real PvP is enabled for opening participants, Phase 3 must implement how legal city assets produce a real defense, how its saved version is used offline, and when edits lock. If the live engine cannot use a selected preference yet, the interface says so clearly and the PvP gate stays closed. See D-04 through D-07.

## 7. Beginner shield contract

**Locked rule:** no timed expiry; practice/NPC tutorial activity does not remove protection; the first explicitly confirmed and accepted real player attack removes it. **Proposed edge defaults pending D-02:** kingdom-wide scope, scouting/support restrictions, confirmation binding, migration handling, and no restoration after an accepted attack. Those details below are intended acceptance criteria once adopted, not additional owner decisions already made.

The shield is persistent server state scoped to the owning kingdom, covering its owned settlements while eligible. This avoids a loophole where a protected owner uses an unprotected satellite to attack while keeping the capital immune. There is **no time-based expiry**. Practice, the safe NPC survey, ordinary building/recruiting, and non-hostile tutorial actions leave it active.

The authoritative transition is:

`active → removed(first accepted, explicitly confirmed attack on a human-controlled player kingdom)`

It is atomic with accepting the real march and reserving/departing the troops. The server binds the confirmation to the source, target, ownership classification, army/plan, and current consequence. Clicking a confirmation is not the transition; an invalid, unaffordable, stale, forbidden, timed-out-before-acceptance, or otherwise rejected command leaves protection intact. A response lost after acceptance must recover the accepted result and removed shield, not invite another attack or restore protection.

| Attempt while shielded | Required result |
|---|---|
| Practice, tutorial survey, help replay | Allowed; no shield change |
| Real attack targeting a protected player | Rejected before troops or shield change, including AI/controller paths |
| Foreign hostile scout against a protected city | Rejected; retain public fog-safe shell only |
| Shielded player scouts an unprotected player's city | Proposed later-PvP default: ordinary server-validated scouting is allowed, with actual Spy requirements, travel, and losses; shield remains active. Phase 2 exposes only the harmless NPC survey |
| Support, troop transfer, intel sharing, or donations that let a protected player materially assist a player war | Unavailable in Phase 2; reject server-side if an exposed generic path exists; decide future rules before enabling |
| A real attack against a currently non-player NPC target | Does not remove the shield by the locked rule, but remains outside this safe tutorial and subject to later target/progression gates |
| Target becomes player-controlled between planning and acceptance | Revalidate and require a fresh explicit player-attack confirmation; never reclassify silently |
| Accepted first player attack later cancelled, fails, returns, or finds target changed | Shield stays removed; no free hostile attempt followed by restored immunity |
| Disconnect, device change, tutorial restart, rename, character death | No shield change |
| Last-city loss or new era | Separate approved recovery/era policy; not a route to recreating the original beginner gift or shield |

The outgoing-scout default preserves a possible first-war path: the current real attack command requires a genuine owned scout report. Banning every outgoing scout while also allowing shield removal only after an accepted attack would make those requirements circular. Before enabling real PvP, D-02 must review the protected-scout advantage and either adopt this bounded rule or supply another complete, explicitly designed path. The harmless NPC survey never satisfies the real report requirement, and no scout of a protected city is permitted by this proposal.

Phase 2 builds and tests the enforcement seam, but the new player's “Attack player” flow remains unavailable until the real-PvP gate has settled troop mapping, conquest, defeat/recovery, warning/lock timing, and safe operations. The learning copy can explain the future consequence without presenting a working button early. A test-only server harness may exercise the shield-removal seam without opening gameplay to players.

**D-02 blocker before real PvP:** if all human kingdoms are newly founded and protected, these rules offer no legal first player attack: every target is protected, and only an accepted attack can remove a shield. The proposed outgoing-scout rule solves the report prerequisite only when an unprotected opponent already exists. Existing-account migration is not a guaranteed solution for a fresh world. Adam must approve a complete willing-player entry rule and explicitly reconcile it with beginner protection before this specification can govern real war. Do not invent automatic expiry, an unprotected starter, or a voluntary-removal exception during implementation. The safe Phase 2 opening can remain shielded while that later rule is unresolved.

Incoming attacks must be checked at acceptance and resolution using the agreed lifecycle rules. On migration, do not newly protect a city with an existing accepted siege and then drop the battle without a defined recovery path. The opening rollout uses new founders in a safe test world; existing-war migration is a separate gate.

## 8. Fresh-city allocation and capacity

This phase needs admission beyond the fixed six claimable fixture kingdoms. It does not require infinite worlds or a final realm architecture.

Use a configured finite founding budget and deterministic legal site selection in the external world service. **Proposed test cap: 32 human-founded cities in one test world**, excluding AI/Freehold settlements. This is a functional test limit, not a measured Roblox concurrency promise or a public capacity recommendation. Increase it only after measured load and region-rendering evidence; no silent cost or host expansion.

For each new authenticated identity:

1. Look up an existing mapping inside the same transaction that will create a founder. If one exists, return it unchanged. An earlier preflight lookup does not replace this check.
2. Verify that the world permits admission, the human founding budget is available, and a legal vacant plot exists. Use deterministic candidate order seeded from world configuration, not unseeded random choices inside rules.
3. Reserve one plot atomically. Proposed initial minimum separation is eight world tiles from any existing settlement, matching the fixture's capital spacing candidate; also require a safe traversable arrival/road location and that the region can render the city. If no legal site exists, fail cleanly even when the numeric cap has space.
4. Create the authenticated player mapping, kingdom, capital, initial economy/army, supply entitlement, shield, tutorial state, and founding receipt as one transaction. Enforce uniqueness of identity, capital ownership, and occupied world coordinate with database constraints.
5. Publish notifications only after commit. If a response is lost, the identity lookup returns the same founded city and receipt. A retry never occupies a second plot or receives another gift.

Concurrent distinct founders cannot receive the same plot; concurrent requests for one identity cannot create two kingdoms. A transaction failure rolls back every dependent row and reservation. Queue capacity and plot capacity are separate reasons. “World full” must show a retry/rejoin explanation without signing the player into an unfinished city or taking a developed AI settlement.

Admission retains the persistent **world** as the authority boundary and **region** as geographic grouping. A Roblox **server instance** is a temporary rendering/interaction host for a region, not a separate owning copy of the world. Joining another instance must restore the same identity and city. Exact friend-join routing, region occupancy, and region dimensions need D-08 implementation decisions before external testing; they must not fork player state. Multi-city ownership remains supported in the persistent model even though this opening grants only one city.

## 9. State, commands, and migration design

The following are conceptual contracts to be finalized against the existing schema and command envelope during implementation. They are not SQL migrations, new live endpoints, or client-authoritative storage.

| Durable record | Minimum facts / constraints |
|---|---|
| Founding receipt | Identity, world, kingdom/city IDs, template version, granted quantities, entitlement remainder, accepted time, unique grant reason |
| Opening progress | Identity + world + tutorial version, acknowledged explanation IDs, authoritative milestone references, selected next goal, state version |
| Shield | Owner identity/kingdom, active/removed state, removal reason, accepted command/march ID and time when removed; no expiration |
| Defense preference | City, supported preset/version, saved version, accepted command and time; no promise of live integration until Phase 3 |
| Safe survey | Identity, mission ID/version, accepted destination/report classification, start/due/completion facts, ready/read state |
| Command receipt | Existing deduplication envelope plus payload intent and durable result references; same ID cannot be reused for different intent |

Suggested opening progress states are `notStarted → inProgress → readyToFinish → complete`. Explanation acknowledgement, construction, recruitment, practice, and survey are independent milestones with durable references rather than one brittle “current screen number.” Returning after an upgrade finishes must reconcile the underlying order before deciding which prompt to show. Completion is a conjunction of the required facts; a replay uses a separate presentation cursor and does not erase them.

Suggested survey states are `available → accepted → ready → read`. Acceptance fixes `dueAt`; ticking or a read after due time can complete it idempotently. Restart recovery and overdue completion use the injected server time. Read/read-again is not another mission acceptance.

For practice completion, preserve the existing `practice.siege.resolve` endpoint's stateless/no-world-mutation contract. A future, separate authenticated opening command can validate and recompute the submitted practice plan with the same pure resolver, then store only a tutorial milestone/result digest. Do not add persistent side effects to the practice endpoint or copy its mathematical rules into the tutorial. A cheap “I read it” acknowledgement is acceptable for help text, but a milestone claiming a valid submitted plan must use a real validated plan/result. No troop or resource rewards attach to that milestone.

All authoritative commands use the current authenticated external command path; Roblox's server is the HTTP bridge and the client renders/asks. A server response supplies costs, remaining requirements, state versions, accepted times, and durable IDs. UserId, result, elapsed time, ownership, reward amount, command order, and final outcome are never trusted from client payloads. Client route drafts and local help preferences may be transient UI state; they cannot replace the external ledger.

Use explicit migrations under `server/db/migrations/`, migration replay tests, and an old-database fixture. Default existing rows conservatively; record whether a row was migrated or newly founded. Back up and restore a representative database before any deployment. Never run test migrations against the user's active world simply to obtain a screenshot. Architecture and schema review must precede implementation of the new writes.

### 9.1 Loading, failure, and uncertain acceptance

Every action has idle, pending, accepted, rejected, offline, and uncertain-result states where relevant. While pending, the button shows what is happening and blocks duplicate intent without freezing navigation. A failed HTTP response is not proof the command failed to commit. Retry uses the same ID and intent; a new ID is issued only for a consciously new action after reconciliation.

If a version conflicts, reload the owner's state and show what changed. Do not overwrite a newer defense save or send an attack using a new target's ownership without reconfirming the changed consequence. If a practice response arrives after reset, close, or a newer submission, request tokens prevent it from replacing the current draft or replay. Preserve an invalid draft and show a field-specific correction.

Ordinary reconnect should restore accepted construction, recruitment, shield, supply remainder, defense preference, survey, and milestone references. Persisting an unfinished route draft across devices is outside Phase 2's minimum; if a draft is only on the current device, label the limitation and never say it was submitted. A reconnect during an accepted practice/tutorial submission retrieves or recomputes its deterministic result without a second reward or troop spend.

## 10. The second session

The opening should end with useful things that are actually available, not a menu advertising six future phases.

| Visit | Proposed active session | Concrete available actions and end state |
|---|---|---|
| Short return | 3–5 minutes | Inspect completed construction/training and automatic production; inspect storage/population headroom; queue one affordable legal improvement or recruit; reread the survey or one battle reason; leave with one clear pending action |
| Longer return | 15–25 minutes | Improve one practice route and compare its result under the same fixed defense; switch and demonstrate a supported defense priority; inspect the next Barracks/Smithy/Stable prerequisite and start the next affordable step; visit the Hall guide for a useful goal |

The goal board is server-state-aware: no “train Archers” while prerequisites are missing, no “collect” when supply is empty, no claim that automatic resources have stopped because the player did not tap a button. It can say “Improve Barracks toward level 3” with the actual current cost and prerequisite. If insufficient stock exists, show the estimate under current production and storage caps. A waiting player can still practice and inspect their city; no streak, daily-reset punishment, or payment offer is needed.

The early-economy review must check that the founding guard's eventual replacement, the route toward advanced unlocks, and waiting time remain understandable. The safe opening does not prove a sustainable economy or retention. Phase 2 exit requires useful return actions; real-war readiness additionally needs D-10 economy/recovery evidence.

## 11. Acceptance matrix

Run relevant automated checks only after implementation; this document does not assert their results. Tests must fail when the behavior is removed. Preserve the existing type/core/server/Luau gates where affected, and distinguish pure rules, actual HTTP/database tests, Studio interaction, two-client privacy, and physical-phone evidence.

| ID | Scenario | Observable pass condition |
|---|---|---|
| OPEN-01 | Fresh identity | Exactly one city, receipt, shield, template, supply entitlement, and opening state; army 12/8/4 and population 36; no advanced building unlocks or spare horses |
| OPEN-02 | Ten concurrent link requests for the same identity; retry after simulated lost response | One mapping/kingdom/city, one plot and grant; all accepted retries reconcile to the same receipt |
| OPEN-03 | Seven distinct new identities join a seeded test world with AI and Freeholds already present | Seventh gets a genuinely fresh city under cap; every old AI/Freehold owner, army, and buildings remain unchanged; no coincident plots |
| OPEN-04 | Last two available slots and three concurrent identities; separately test exhausted legal plots | Exactly two new cities for slot case; clean actionable refusal for excess; no partial players, stolen seats, leaked supply, or reused plots; plot exhaustion names its separate condition |
| OPEN-05 | Claim supply; resend same command; send another claim; test full/part-full storage | Total credited supply never exceeds 100 wood; receipt/remainder correct; opening replay cannot recreate it; full storage loses no entitlement |
| OPEN-06 | Execute only the compulsory economy actions with production disabled in the test clock | After full claim and deductions stock is 1,110 / 900 / 735; Timber order is 720 seconds at HQ 1; militia order is 45 seconds; no unrequested speedups |
| OPEN-07 | Try recruiting Archers / converting Crusaders at the founding buildings; finish militia | Normal locks hold; no hidden free replacement path; militia ends at 25 total units / 37 population; supported unlock progression remains unchanged |
| OPEN-08 | Disconnect before acceptance, after commit-before-response, and after due time for construction/recruitment | No extra deduction or order; accepted orders finish exactly once; tutorial resumes from their actual states, not from a client timer |
| OPEN-09 | Tutorial replay, another device, renamed city, removed tutorial row in a migration fixture, and replacement kingdom | No second founding package; no silent reset of world state or removed shield; corrupt/missing progress is recoverable without treating identity as new |
| OPEN-10 | Each attempted attack/scout/support path against a shielded city, including AI command path | Enforcement occurs on the external server, no reserved troops or leaked private details, and the shield stays active |
| OPEN-11 | Invalid first-player attack confirmation, stale ownership classification, rejected army, same-ID/different-payload attack | No removal on rejection; changed consequence requires confirmation; identity and command intent cannot be substituted |
| OPEN-12 | Accepted first-player attack with lost response; later cancellation or failed outcome | Exactly one march and one shield transition with linked receipt; accepted removal survives reconnect and cancellation |
| OPEN-13 | Practice plus NPC survey and help replay | Permanent inventory, ownership, shield, and combat intel are unchanged except explicit tutorial/survey progress records; stateless practice endpoint remains stateless |
| OPEN-14 | Two saved defense versions race; attempt foreign-city save; demonstrate gate/keep with one fixed attack | Reject unauthorized save; preserve newer version; a validated comparative sample shows the changed distribution and meaningful event/casualty difference; no false live-defense claim |
| OPEN-15 | Survey at server restart, early client completion attempt, duplicate start, read twice, all Freeholds already claimed | One authoritative 90-second mission/result, no hidden combat intel or rewards, guaranteed safe fallback; completion independent of client rendering |
| OPEN-16 | Practice valid winner, valid failure, one-route controlled change, missing/decimal/out-of-bounds/oversized plan, reset during request | Proper reasoned result or useful validation; request mutation cannot invent an outcome; invalid input remains fixable; stale callback cannot overwrite reset/newer plan |
| OPEN-17 | Two Roblox clients, one foreign city, owner switching instances | Own city/private progress only; no foreign garrison/defense leak through shared Workspace, snapshots, events, or survey; same city restored across instances |
| OPEN-18 | Upgrade already queued, prerequisite action already complete, voluntary optional spending, storage cap | Guide reconciles real state and presents a legal next action; no forced cancellation/refund/free grant; no stuck mandatory empty button |
| OPEN-19 | Old-database migration, repeat migration, crash/rollback fixture, backup restore | Existing identities/assets/jobs preserved; new constraints hold; no grants from migration; restore/restart preserves accepted commands and progress |
| OPEN-20 | Tutorial finished with no other players, communication disabled, and sound off | Every required step works using readable UI/NPC guidance; no chat prompt, social dependency, or audio-only instruction blocks progress |
| OPEN-21 | Before real PvP: a new world with two or more fresh protected human kingdoms and no unprotected human opponent | Demonstrate the separately approved willing-player first-war path, including intel, confirmation, simultaneous acceptance and cancellation, without attacking an unwilling protected player; gate remains blocked until D-02 supplies that rule |

For OPEN-16 and the player study, pin exact versioned route fixtures and expected server outcomes after Phase 1's entry semantics are settled. Require one winning plan, one losing plan with a teachable reason, and one comparison that changes exactly one route while holding force/defense/objectives fixed. Record the actual result, casualties, and decisive event before the study; do not pick a different rule after seeing an inconvenient outcome. Do not promise a particular sample victory until it is observed against the pinned resolver.

**Pinned 2026-09-10 [Cursor], after D-06 `openGateOnly`:** use `PRACTICE_WINNING_GATE_PLAN` (FORT TAKEN, losses 5 / 5 / 4), `PRACTICE_LOSING_CLOSED_GATE_PLAN` (FORT HELD, losses 8 / 7 / 5, freehand miss-the-gate), and `practiceCausalityPair()` — identical drawings, only Vanguard target changes from gate to keep (`PRACTICE_NO_GATE_TEAM_PLAN`, FORT HELD, losses 8 / 7 / 5, `objectiveSkipped` on the gate, three `blockedAtWall` even at x 50). The planner cannot submit a `holdKeep` Rider-crossing pair; that older pin is retired. Source: `packages/game-core/src/practice-siege-fixtures.ts`. Studio observation of those numbers remains **not verified**.

### 11.1 Device and understanding gate

Check both **320-pixel and 390-pixel-wide** layouts in the available emulator/window tools, then run the whole opening on at least one physical phone in the intended lower-powered range. Record model, OS, resolution/orientation, touch input, build, local/hosted environment, and network conditions. A desktop pointer at phone width is layout evidence, not proof of finger control or performance. Existing troop-drill evidence remains useful but cannot stand in for this planner or complete city loop.

Verify that fingers do not hide objective confirmation; map drawing does not accidentally scroll the page; scrolling does not create routes; tower/route/squad meanings do not depend only on color; button targets, text, errors and timers remain readable; all three squads can be selected and edited; interruptions preserve committed work; and a slow replay can be paused, stepped, or reread. For a shaky drawn line, the route simplifier must preserve the intended objective and cannot quietly turn a safe route into a different strategic instruction. Any assist or accessible route alternative must submit the same validated plan format and must not change combat math.

**Proposed initial usability gate:** five unfamiliar testers spread across the intended age range and devices, including at least one age-appropriate younger tester and one physical-phone participant. Use whatever supervised access Roblox currently permits; verify audience eligibility before invitations. Record per-step time, coaching/help requests, input errors, invalid plans, abandonment, and whether the tester can explain the shield and one tactical improvement. Do not collect unnecessary child-identifying data, chat transcripts, or recordings without the applicable consent and retention decision.

At least four of five should complete the opening without facilitator coaching, identify one real next action, correctly explain why their changed practice route helped or hurt, and explain that practice losses do not spend their city army. All five must be able to find the shield consequence before a hypothetical real attack; any belief that “practice removes the shield” or “buying gives combat strength” is a blocking comprehension defect. These thresholds are a small formative test, not proof of broad retention or statistical certainty. Record failures openly and revise the lesson before repeating with new unfamiliar testers.

## 12. Implementation sequence and release gate

After the proposed tuning and D-01/D-02/D-08 choices are ratified for implementation:

1. Finish Phase 1 visual/input/causality proof; preserve its fixed-force, stateless boundary.
2. Review the schema/command contracts and implement new founding allocation, receipts, supply, and shield enforcement in an isolated branch with migration/duplicate/concurrency tests.
3. Implement normal-action tutorial reconciliation and the minimum on-foot guides. Use the real construction/recruitment paths, not dev seeds or parallel economy rules.
4. Add saved-priority practice demonstration and guaranteed harmless NPC survey with their durable states.
5. Add the state-aware return-goal board and test every empty/error/offline/resume case before polishing the script.
6. Run relevant code checks, real HTTP/database negative cases, Studio/two-client privacy tests, 320/390 layouts, and physical-phone control/performance checks.
7. Meet D-11/D-12 audience, moderation, privacy, hosting, backup restoration, support, and capacity requirements before the small outside-player study. Local Studio testing alone does not open external access.
8. Record observed results and update the roadmap's evidence/status. Review with Adam before connecting the opening to real PvP or expanding to later phases.

Phase 2 is complete only when its safe opening and return loop work from a truly fresh profile and a resumed one, under the acceptance matrix, with evidence that a new player understands them. No code, migration, production data, app process, purchase, publish setting, or remote was changed by writing this specification.
