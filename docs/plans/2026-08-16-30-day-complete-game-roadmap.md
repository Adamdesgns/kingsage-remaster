# KingSage — 30-Day Complete Online World Roadmap

**Created:** 2026-08-16  
**Target:** a closed, persistent online alpha by 2026-09-14  
**Direction:** KingSage strategy and world rules with the new Direction 3 mobile presentation and real-time army battles

## The promise

At the end of this roadmap, KingSage is not a battle clip or disconnected prototype. It is one complete game loop played in a persistent world shared by real people:

1. Create an account and enter a named world.
2. Own a kingdom and village at a permanent location on the world map.
3. Build, gather resources, recruit troops, scout neighbors, plan attacks and march armies.
4. Fight interactive army battles using squad selection, tap-to-steer orders and retreat.
5. Join alliances, communicate, support allies, raid enemies and conquer territory.
6. Grow from one village into a realm.
7. Win a world through territorial dominance or fallen rival capitals.
8. Record the finished world in the Hall of Legends and begin the next world.

The game can continue for years because worlds, kingdoms, alliances and conflicts generate the long arc. We do not need years of hand-authored missions.

## What already exists

The current repository contains two proven halves:

- `index.html` contains the complete Phase 1 strategy simulation: a 50×50 generated continent, 14 active AI kingdoms, villages, resources, nine buildings, eight troop types, recruitment, scouting, marching, alliances, conquest, standings, world victory, new-world generation and local saves.
- `mobile-rebuild` contains the selected mobile direction: Scout → Plan → Battle, original battle and troop art, Phaser combat, 40 player troops versus 46 defenders, individual movement/targeting/health/damage/death, projectiles, reinforcements, a destructible gate, squad steering, pause and retreat.

The job is to preserve those working rules, separate them into maintainable modules, put the world state on an authoritative server and connect every player to the same truth.

## Definition of “complete game v1”

The 30-day target includes:

- Mobile-first browser game installable as a PWA.
- Real accounts and persistent player profiles.
- Multiple named worlds with a fixed player capacity.
- Real players occupying kingdom seats; clearly labeled AI kingdoms fill empty seats during alpha.
- Permanent world-map positions; no random matchmaking.
- Visual village with placement, upgrading, production and defenses.
- Resource economy, queues, storage, population and research.
- A real base-building ladder: every kingdom begins with a level-1 Barracks and basic infantry, then builds the Stable, Workshop, Smithy, Academy and Market to unlock stronger systems.
- Eight troop types grouped into battlefield squads, each with kingdom-wide levels 1–10 earned through research.
- Scouting, attack planning, marches, reinforcements and retreat.
- Three complete real battle environments: Outer Wall, Lower Ward and Citadel.
- Asynchronous attacks against a stored defender layout and garrison.
- Alliances, alliance chat, support marches and diplomacy.
- Village conquest, capital defeat, 40% world victory and world cycling.
- Hall of Legends and player history across worlds.
- War Victory Points from conquered villages, with world standings, seasonal global arena ranks and rank titles shown in chat.
- Global, world and alliance chat with server-derived kingdom and arena identity.
- Server-authoritative state, admin controls, backups, audit events and basic abuse protection.
- Automated tests for economy, marches, combat results, conquest and world victory.
- A closed alpha that can support at least 50 simultaneous human accounts in one world.

The target does not include app-store packaging, payments, voice chat, thousands of simultaneous players in one world, 3D free-camera graphics or a finished commercial content catalog. Those come after the complete loop is proven.

## Technical shape

### Client

- Continue the React + TypeScript mobile client in `mobile-rebuild`.
- Keep Phaser as the battle renderer and input layer.
- Split the current prototype into screens and game systems instead of growing one large component.
- The client sends commands and renders server events; it does not own resources, timers, troop counts, conquest or victory.

### Shared rules

- Extract pure TypeScript rules for resources, buildings, troops, marching, scouting, battle calculations, loyalty and victory.
- Both the server and test suite use the same rules.
- Battles use a server-issued seed and force snapshot. The client records squad orders; the authoritative rules replay/validate the result before saving losses or conquest.

### Online world

- A TypeScript service owns each world's ordered command queue.
- Postgres stores accounts, worlds, kingdoms, villages, layouts, armies, marches, alliances, messages and event history.
- WebSockets deliver map changes, march arrivals, chat and battle notifications.
- Every mutating command includes the player, world and expected state version to prevent double spending and conflicting updates.
- Background workers resolve construction, recruitment, marches, AI turns and world victory from timestamps rather than requiring the app to remain open.

### Release discipline

- The original `index.html` remains preserved as the rules reference and rapid simulation harness until feature parity is proven.
- Work happens in scoped branches/worktrees. One integration owner controls shared contracts and merges.
- No agent edits the same feature files concurrently.
- Every merge must include tests and a playable acceptance path.
- Nothing reaches the current public GitHub Pages game until Adam explicitly approves the release candidate.

## Agent lanes

Six lanes can run continuously without colliding:

| Lane | Owns | Cannot change without integration approval |
|---|---|---|
| Integration lead | contracts, module boundaries, merge order, release build | gameplay numbers owned by other lanes |
| World server | accounts, persistence, world commands, timers, WebSockets, AI seats | Phaser rendering |
| Village/economy | buildings, resources, layout, queues, research, recruitment | network protocol |
| Warfare | scouting, marches, battle rules, three Phaser scenes, casualties, conquest | account/auth code |
| Social/world | alliances, diplomacy, chat, support, standings, world cycle | combat internals |
| QA/live operations | fixtures, bots, load tests, admin tools, backups, mobile acceptance | feature behavior without an approved defect |

Art/content agents operate from asset briefs and write only to assigned asset folders. They never change gameplay code.

## Thirty-day timeline

### Days 1–3 — Foundation and contracts · Aug 16–18

**Goal:** make parallel work safe.

- Freeze the v1 definition in this document.
- Inventory the state and rules in `index.html`; map every rule to a shared TypeScript module.
- Split `mobile-rebuild/src/Prototype.tsx` into route, scouting, planning, battle and HUD modules without changing behavior.
- Define versioned commands/events: build, recruit, scout, march, support, battle, retreat, alliance and conquer.
- Define the Postgres schema and migrations.
- Create deterministic fixtures for one world, two humans and several AI seats.
- Establish worktrees, ownership and merge order for all lanes.

**Gate A:** existing Outer Wall battle and the original world simulation still pass unchanged; two agents can build against frozen shared contracts without touching the same files.

### Days 4–7 — First real shared world · Aug 19–22

**Goal:** two people can enter the same persistent world.

- Add account creation, login and player profile.
- Create/join world flow and permanent kingdom placement.
- Move world generation, kingdom ownership and timestamps to the server.
- Render the authoritative 50×50 map in the mobile client.
- Add ordered world commands, state versions and reconnect recovery.
- Add AI-controlled empty seats using the existing kingdom behavior.
- Add admin world reset, time acceleration and account inspection for testing.

**Gate B:** two independent browser sessions see the same world, own different kingdoms, observe the same map changes and recover correctly after server/client restarts.

### Days 8–12 — Village, economy and progression · Aug 23–27

**Goal:** the persistent build-and-grow loop works without combat.

- Build the visual village scene and placement grid.
- Port all nine buildings, costs, prerequisites, production, storage and population.
- Add construction and recruitment queues resolved from server time.
- Add eight troop types, kingdom-wide troop levels 1–10, Smithy/Academy research queues and clear upgrade effects.
- Preserve the KingSage/Warcraft progression rhythm: basic Barracks army first, then Stable cavalry, Workshop siege, Academy nobles and Market coordination.
- Add village defenses and saved defense layouts.
- Add player inventory/army views and notifications.
- Add economy invariants: no negative resources, no duplicated troops, no double-completed queues.

**Gate C:** two accounts can grow for a simulated seven days, close their browsers, return and find every resource, building and queue correct.

### Days 13–17 — World warfare · Aug 28–Sep 1

**Goal:** one player can scout and attack another player from the world map.

- Connect scouting to the real defender village layout and garrison snapshot.
- Connect entry position, troop mix, time and attack style to authoritative battle inputs.
- Convert the current Phaser combat rules into deterministic shared simulation rules.
- Keep Phaser responsible for animation and squad commands.
- Add server-issued battle sessions, order logs, validation, casualties and loot.
- Add marches, support, return trips and incoming-attack alerts.
- Add loyalty, Noblemen, village conquest and capital defeat.

**Gate D:** Account A scouts Account B, plans an attack, marches, fights, loses real troops, returns with server-recorded loot and cannot forge a better result from the browser.

### Days 18–21 — Complete battle campaign · Sep 2–5

**Goal:** every important attack is a real battle scene.

- Finish Lower Ward as a distinct battlefield with new lanes, objectives and defenders.
- Finish Citadel as the final multi-stage assault.
- Add defense towers, walls, gates, traps and target priorities as data-driven objects.
- Add battle speed, reconnect/replay, pause rules and retreat consequences.
- Carry survivors and injuries between battle stages.
- Add victory/defeat reports and replays viewable by attacker and defender.
- Balance early, mid and capital battles using automated simulations plus phone playtests.

**Gate E:** a three-stage capital attack can be completed from scouting through Citadel victory, with all losses and conquest reflected correctly in the shared world.

### Days 22–24 — Alliances and the world of people · Sep 6–8

**Goal:** players need each other.

- Create, join, leave and manage alliances.
- Add global, world and alliance chat plus the world event feed.
- Show server-derived War Victory rank/tier beside names in arena standings and chat.
- Add support marches and ally defense.
- Add diplomacy, non-aggression state and alliance standings.
- Add map presence indicators without exposing private activity.
- Add reporting, mute/block and administrator moderation basics.
- Clearly label AI kingdoms and allow new humans to claim eligible AI seats between protected world phases.

**Gate F:** at least five test accounts can form two alliances, coordinate support and fight over persistent territory without state conflicts.

### Days 25–27 — World victory and years-long progression · Sep 9–11

**Goal:** the game has an ending that creates the next beginning.

- Finish realm standings and territory calculation on the server.
- Award deterministic War Victory Points for village/capital conquest, reduce weak-target rewards, prevent repeat scoring from traded villages and update the seasonal global arena.
- Trigger victory at 40% control or all rival capitals fallen.
- Freeze and archive completed worlds.
- Record Hall of Legends results and player history.
- Open the next world while keeping legacy achievements.
- Add world-speed configuration so alpha worlds last days, standard worlds last months and future epic worlds can last longer.
- Add rotating world modifiers and seeded maps so new worlds do not play identically.

**Gate G:** automated players can run an accelerated world from creation through victory, archive it and enter a second world without corrupting player history.

### Days 28–30 — Hardening and closed alpha · Sep 12–14

**Goal:** release a complete game to invited players.

- Run bot load tests above the 50-player alpha target.
- Test simultaneous builds, marches, attacks, chats and reconnects.
- Verify authorization on every command; test forged ownership, duplicate requests and impossible resources.
- Add database backups and prove a restore into a clean environment.
- Add health checks, error reporting, world metrics and an emergency world pause.
- Complete iPhone/Android browser QA, accessibility basics, loading/retry states and installable PWA behavior.
- Run a full human acceptance test from signup through conquest and next-world entry.
- Fix launch blockers only; log polish separately.
- Prepare the closed-alpha release candidate and wait for Adam's explicit push/deploy approval.

**Gate H:** invited players can play the complete loop from their phones; no known defect can lose a kingdom, duplicate resources, assign another player's army or prevent world recovery.

## Daily operating rhythm

- Start: integration owner publishes the day's contracts, dependency order and acceptance target.
- During the day: agents work only inside owned modules/worktrees and leave machine-readable tests with every feature.
- Every four hours: integration pass, build, automated tests and conflict check.
- End of day: one playable vertical path is verified on a phone-sized viewport; status, blockers and next commands are written to the repo and shared vault.
- Failed gates stop downstream feature expansion until repaired. Cosmetic polish never blocks server correctness.

## Compelling progression loop

“Addictive” means the player always has a meaningful next decision, not that the game uses paid skips or punishing dark patterns.

- **Minutes:** collect, place, queue, research and inspect the map.
- **One session:** scout a target, adjust the plan, fight and bring survivors/loot home.
- **One day:** finish buildings, unlock a troop family, improve troop levels and coordinate alliance support.
- **One week:** conquer villages, climb War Victory standings and become strategically important to the world.
- **One world:** win territory, defeat capitals, earn an arena result and enter the Hall of Legends.
- **Across worlds:** permanent profile history, seasonal arena rank and new seeded maps keep the rivalry alive without erasing what the player accomplished.

## Scoreboard

| Date | Required proof | Status |
|---|---|---|
| Aug 18 | modular client + frozen commands/schema | **Passed locally Aug 16** — contracts, deterministic fixture, schema/protocol and extracted Scout/Plan modules; live server migration remains Gate B |
| Aug 22 | two accounts in one persistent world | **Passed locally Aug 16** — isolated accounts, permanent seats, shared ordered commands, chat/events and database restart recovery; hosting remains release-gated |
| Aug 27 | server-owned visual village/economy | Not started |
| Sep 1 | real player-to-player scout/march/battle | Not started |
| Sep 5 | Outer Wall + Lower Ward + Citadel complete | Outer Wall complete |
| Sep 8 | alliances/chat/support working | Not started |
| Sep 11 | world victory/archive/new world proven | Single-player rules exist |
| Sep 14 | hardened closed-alpha release candidate | Not started |

## The first implementation move

Do not start six agents by handing each one the whole repository. The first three-day foundation prevents fast parallel work from turning into merge damage.

The kickoff task is:

> Extract and freeze the shared game contracts, split the mobile prototype into owned modules, define the server schema/command protocol and create the deterministic two-player world fixture—without changing the verified Outer Wall behavior or the existing public game.

Once Gate A passes, the six lanes can run continuously against stable boundaries.
