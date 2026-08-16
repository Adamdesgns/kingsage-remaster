# KingsAge Reforged

A mobile-first, single-file prototype of **KingsAge** — a Tribal Wars / Travian-style
kingdom-builder and conquest game. This is a **Phase 0 feel-test**: everything runs in
one self-contained HTML file, with time compressed to **60×** so you can experience the
full build → recruit → raid → conquer loop in minutes instead of days.

## Play it

Open [`index.html`](index.html) directly in any modern browser (desktop or mobile) — no
build step, no server, no dependencies. Your progress **auto-saves** to the device via
`localStorage`, so you can pick up where you left off.

## What's in the prototype (Phase 1 — Big World)

- **A living 50×50 continent** — generated terrain that reads like real geography: ocean
  coasts, mountain ranges, forests, and plains. Drag to pan, zoom three levels, jump
  anywhere from the tappable mini-map.
- **14 AI kingdoms that actually play** — they grow, found villages, raid each other,
  capture territory, and absorb weaker realms. Borders shift on the mini-map whether you
  act or not. **Warlord Kaas** starts hostile and hunts your capital.
- **Map-based targeting, never matchmaking** — every opponent is a persistent kingdom at
  a fixed place on the map. Scout the exact village you want, judge its garrison, and hit
  it. Grudges are geographic.
- **Alliances** — threatened kingdoms forge pacts; you can propose your own through the
  Diplomacy panel. Allies never raid each other and lend defensive strength nearby.
- **Terrain matters** — forests slow marches and shelter defenders (+15% defense);
  mountains and water shape march routes.
- **Village management & armies** — the full build/recruit loop: nine buildings with cost
  curves, eight unit types, population and storage caps, and playable army scenes. Select
  Vanguard, Archers, or Riders, tap the battlefield to steer that squad, and sound a
  retreat that must physically escape under enemy pressure.
- **Conquest** — train **Noblemen** to grind loyalty and annex villages. Topple a
  kingdom's **capital** and the whole realm shatters.
- **Win the world, then found the next** — control **40% of the land** (or fell every
  rival) to conquer the world; then generate a fresh continent and build your record in
  the **Hall of Legends**.
- **Sandbox / cheats** — a bottom-right 🛠️ button opens God mode, speed multipliers,
  world fast-forward, and instant tools to stress-test every mechanic.

## Continuing the project

[`docs/HANDOFF.md`](docs/HANDOFF.md) is the full context document for anyone (human or
AI agent) picking up the work: architecture, the `S` state model, config/tuning tables,
a function map, how each system works, conventions/gotchas, and the roadmap toward an
eventual multiplayer backend.

Current design lives in
[`docs/specs/2026-08-02-big-world-update-design.md`](docs/specs/2026-08-02-big-world-update-design.md)
(Phase 1: the living world — shipped; Phase 2: Clash-of-Clans-style visual village — next),
with the build plan in [`docs/plans/2026-08-02-big-world-phase1.md`](docs/plans/2026-08-02-big-world-phase1.md).

The current path from these prototypes to a persistent world shared by real players is
the [`30-Day Complete Online World Roadmap`](docs/plans/2026-08-16-30-day-complete-game-roadmap.md).
It defines the complete-game v1 contract, six parallel agent lanes, daily integration
discipline, eight acceptance gates, and a closed-alpha target of **2026-09-14**.

> Note: the handoff references two companion docs — `KingsAge_Reforged_Plan.md` and
> `KingsAge_Reforged_Backend_Spec.md` — that were lost with the original chat session.
> The backend spec will be rewritten before multiplayer work begins.

## Status

**Phase 2A — Steerable Army Battles** is implemented locally. The game remains a
prototype; mechanics and balancing are exploratory and subject to change.

**Gate B — First Persistent Shared World** is also complete locally. The React/Phaser
phone client now has account registration/login, permanent human and AI kingdom seats,
durable server-owned state, timed Barracks construction, world chat, and connected
World / Village / Army / War / Chat navigation. `npm run test:gate-b` verifies the
shared contracts, protected mobile build, two-session isolation, idempotent commands,
event delivery, and database restart recovery. Nothing has been pushed or deployed.

**Gate C — Persistent Economy Core** is complete locally. The shared world now has a
visual tappable village, original compounding KingSage economy rules, offline resource
production, storage and population caps, prerequisite-driven building progression,
separate server-timed construction and recruitment queues, eight recruitable troop
families, kingdom-wide research levels 1–10 and return notifications. `npm run
test:gate-c` includes a simulated seven-day close/reconnect for two kingdoms. Saved
defensive placement remains tied to the next authoritative scouting/warfare slice.
