# Kingsmarch player-first roadmap

**Locked by Adam:** 2026-09-04
**Audience:** ages 9 and up, with phone as the baseline
**Current build:** Phase 1 practice siege on `feat/practice-siege-codex`
**Release state:** local development only; this roadmap does not authorize a push, merge, deployment, Roblox publication, or paid product.

This roadmap replaces the earlier teen-only and no-monetization product assumptions. The server-authority, persistent-world, on-foot city, mobile-baseline, region-world, no-gore, and working-title decisions remain in force.

## Product promise

Every player receives a small city that feels like home. They learn it by walking through it, meeting its people, building it, defending it, and eventually commanding attacks from a scout's map. War drives the world, but friendship, collecting, city life, trading, events, and peaceful work give players reasons to stay between battles.

The game should be understandable without Adam or a developer explaining it. Every major action must be taught in the game, show its cost and consequence before commitment, and explain its result afterward.

## Locked product decisions

1. **Ages 9+ and no gore.** Language, feedback, menus, failure states, and combat presentation must work for a capable nine-year-old without talking down to older players.
2. **Every new player owns a city.** They start at the lowest useful level with a small starter army and enough resources to complete the opening lesson. World population must grow beyond the current fixed six-seat limit before public release.
3. **Beginner shield.** A new city cannot be attacked while the player learns. Practice and NPC tutorial fights do not remove it. The shield ends only after the player deliberately confirms their first real player attack, with an unmistakable warning.
4. **A guided first day.** A named Steward meets the player, introduces the city, and sends them through short actions at real buildings. Building guides explain what each place does. The lesson ends with a risk-free practice siege and a clear invitation to continue playing.
5. **Command-map warfare.** A scout brings a readable fort map. The attacker assigns three squads, draws routes, chooses objectives, and commits a plan. The defender receives warning when the rules allow it, saves a defense plan, and issues defensive priorities. The external server alone calculates the result.
6. **Fortifications are real systems.** Walls, gatehouses, archer towers, barricades, rally points, reserve squads, and keep doors must change routes, timing, casualties, or objectives. A decoration cannot pretend to be a defense.
7. **A complete capture has stages.** The intended real siege progresses through approach, outer defenses, gate or breach, courtyard, keep doors, and capture. Each stage needs counterplay and an understandable reason for success or failure.
8. **Saved defense works offline.** A Defense Captain follows the player's saved plan when they are away. Replays show what happened and what the player could change next time.
9. **World and clan communication.** Use Roblox-filtered communication. Players get a world channel and a private clan channel. No custom unfiltered chat is allowed.
10. **Clans are places and identities.** Players can create or join a clan, view its profile and roster, see roles, share a clan channel, and later cooperate at a clan war table. Membership and permissions are server-authoritative.
11. **The Great Hall is the social home.** This is the tavern-like meeting place without alcohol. It hosts players, guides, clan recruiting, notices, and city celebrations.
12. **The Tourney Grounds host spectacles.** Jousting, contests, and automated shows are earned future content. Players can participate, spectate, and represent their city or clan.
13. **NPCs make the city legible.** Important buildings have a named guide who explains the building, shows the next useful action, and can repeat the lesson. NPCs may offer short contextual tasks; they do not become an endless scripted quest-chain requirement.
14. **Cosmetics fund expression.** A future store can sell armor appearances, outfits, banners, emotes, mounts, and city decoration. Purchases must not increase combat power or bypass the strategy game. Exact products, prices, parental safeguards, and Roblox policy checks need a separate approval before implementation.
15. **Peaceful play comes later, but belongs in the same economy.** Farming, mining, lumber work, smithing, stable work, crafting, caravans, and NPC camps can support players who prefer gathering, making, trading, or exploration. Their goods must matter to cities and armies.
16. **No invisible outcomes.** Every battle, job, purchase, defense, and timed action needs a status, completion signal, and plain-language result. A player must never wonder whether a button worked.

## The first-player journey

The first session is one connected story, targeted at roughly 12–18 minutes:

1. **Arrival:** the player appears at their city gate under a visible beginner shield. The Steward welcomes them by name and points out the keep, resource buildings, barracks, war table, Great Hall, and city gate.
2. **Make the city work:** collect one ready resource, start one short upgrade, and see where its timer lives.
3. **Raise the starter guard:** visit the Barracks guide, recruit the three starter squads, and learn the difference between Vanguard, Archers, and Riders.
4. **Prepare the walls:** visit the Defense Captain, inspect the gate and towers, then save one simple defensive priority.
5. **Read the scout map:** the Scout explains tower range, obstacles, objectives, and how drawing a different route changes exposure.
6. **Practice siege:** draw all three routes, attack the training fort, watch the diagrammatic replay, and receive two or three reasons for the outcome.
7. **Return home:** the Steward explains the shield and asks the player to choose their next goal: improve the city, practice again, meet players in the Great Hall, or scout an NPC camp.

The player can skip repeated explanations, replay every lesson, and ask each building guide “What should I do here?” at any time.

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

## Delivery order

### Phase 0 — Trustworthy foundation

**Goal:** preserve the audited server-authority foundation and close integrity failures before public traffic.

- Keep the current audit-fix branch isolated until review.
- Retain fixes for concurrent battle integrity, fog leaks, server-derived retreat timing, command ID validation, missing-secret failure, and command rate limiting.
- Prove Roblox build, Studio behavior, two-client ownership/fog, and a real phone baseline before a public claim.
- Establish backups, health checks, logging, and recoverable hosting before inviting players.

**Exit:** no known P0 integrity defect; server and core tests clean; Roblox gates clean; Studio and phone evidence recorded.

### Phase 1 — Practice siege vertical slice **(building now)**

**Goal:** prove that route drawing is understandable and affects the result.

- One fixed fort, one fixed NPC defense plan, and three fixed attacker squads.
- Gate, west/east archer towers, barricade, and keep doors.
- Touch/mouse route drawing with Undo and Clear.
- External-server deterministic resolution and phase replay with reasons.
- No resources, rewards, settlement mutation, conquest, alerts, or schema migration.

**Exit:** a player can draw three routes, submit them, see tower/obstacle causality, understand why the fort held or fell, reset, and try again.

### Phase 2 — The beginning of the game

**Goal:** make a new player's first session self-explanatory.

- Steward-guided arrival and replayable tutorial steps.
- Starter city, starter resources, and three starter squads.
- Visible beginner shield and server-enforced shield rules.
- Building guides at Keep, Storehouse, resource buildings, Barracks, Smithy, War Table, gate, Great Hall, and later Market/Stable.
- Clear action feedback, timers, costs, queue state, and completion notifications.
- Risk-free practice siege as the tutorial finale.

**Exit:** a fresh player completes the opening without outside explanation and can name their next useful action.

### Phase 3 — Real attack and home defense

**Goal:** turn the practice language into fair asynchronous PvP.

- Scout maps generated from real, permission-safe intel.
- Server-side route resolution integrated with real armies and travel.
- Defense Captain with saved legal placements and priorities.
- Incoming-attack warning and plan-lock rules.
- Staged gate/courtyard/keep capture and server-calculated fortification effects.
- Honest battle replay, reports, recovery, and protection against immediate beginner loss.
- First-real-attack confirmation removes the beginner shield.

**Exit:** two players can attack and defend one settlement, including an offline defender, without client authority or unexplained outcomes.

### Phase 4 — Clans and communication

**Goal:** give players durable groups and cooperative reasons to return.

- Roblox-filtered world and clan channels with mute/report/moderation paths.
- Clan creation, name rules, profile, banner, description, roster, roles, invitations, join/leave, and ownership transfer.
- Clan notice board and online status that respects privacy.
- Reinforcement/support marches, resource donations, and shared scout intel after permission design.
- Clan war table and co-command roles after solo siege proves fun.

**Exit:** a clan can form, communicate safely, understand its membership, and cooperate on one server-authoritative goal.

### Phase 5 — A city players want to inhabit

**Goal:** make the time between timers and battles enjoyable.

- Great Hall social hub, clan recruiting, notices, celebrations, and NPC stories.
- Player/city profile with achievements, heraldry, favorite outfit, and selected public stats.
- Cosmetic inventory and outfit preview.
- Fair cosmetic shop for armor appearances, clothing, banners, emotes, mounts, and city decoration after product and policy review.
- Tourney Grounds with scheduled automated shows, spectating, jousting, archery, races, and seasonal city festivals.
- Daily/weekly goals that reward play variety without punishing missed days.

**Exit:** players can spend a session socializing, customizing, spectating, or competing without starting a war.

### Phase 6 — Peaceful professions and player economy

**Goal:** make non-war specialists valuable to the same persistent world.

- Gathering: farming, mining, lumber, and NPC-camp exploration.
- Professions: smithing, stable work/horse breeding, crafting, hauling, and merchant play.
- Market listings, direct safe trade, caravans, supply risk, and provenance for valuable goods.
- Clan and city demand connects peaceful production to defense and campaigns.
- Anti-bot, anti-duplication, and age-appropriate trade protections before live economy rollout.

**Exit:** a player can progress and become useful through production and trade without conquering a city.

### Phase 7 — Realm life and long-term war

**Goal:** support a living world that can grow, resolve, and begin again.

- More players and cities through sharding/regions and safe new-city placement.
- Terrain and geography that affect scouting, routes, caravans, and war.
- Clan campaigns, alliances, diplomacy, territory, and shared objectives.
- World victory, seasons, reset/legacy rules, history, monuments, and returning-player recovery.
- Live operations, moderation/admin tools, support, backups, metrics, capacity tests, and incident recovery.

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

## Decisions deliberately left open

These need evidence or Adam's judgment later; the team should not invent them during Phase 1:

- Final game name.
- Exact server size, region size, season length, and world win condition.
- Exact beginner shield duration if the player never attacks.
- How much warning an online defender receives and how offline timing stays fair.
- Clan size, role names, age/privacy visibility, and leadership succession.
- Shop catalog, prices, purchase limits, refund/support flow, and whether trading cosmetics is allowed.
- Exact job controls and how active play compares with offline production.
- Art direction, animation budget, and real-phone troop budget.
- Hosting provider and public release date.

## Immediate work queue

1. Finish and test the Phase 1 pure deterministic siege resolver.
2. Add the stateless authenticated server command without touching the world database.
3. Add the touch-safe Roblox practice map, route controls, submit flow, phase replay, and plain reasons.
4. Run the full core, server, type, Luau, and Rojo build gates.
5. Prove the flow in Studio, then record the requested captioned full walkthrough once the interface is stable enough to teach rather than confuse.
6. Review Phase 1 with Adam before connecting it to real armies, cities, shields, or rewards.
