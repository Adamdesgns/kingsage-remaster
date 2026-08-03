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
  curves, eight unit types, population and storage caps, watchable round-by-round battles
  with retreat.
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

> Note: the handoff references two companion docs — `KingsAge_Reforged_Plan.md` and
> `KingsAge_Reforged_Backend_Spec.md` — that were lost with the original chat session.
> The backend spec will be rewritten before multiplayer work begins.

## Status

Prototype only — mechanics and balancing are exploratory and subject to change.
