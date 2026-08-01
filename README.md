# KingsAge Reforged

A mobile-first, single-file prototype of **KingsAge** — a Tribal Wars / Travian-style
kingdom-builder and conquest game. This is a **Phase 0 feel-test**: everything runs in
one self-contained HTML file, with time compressed to **60×** so you can experience the
full build → recruit → raid → conquer loop in minutes instead of days.

## Play it

Open [`index.html`](index.html) directly in any modern browser (desktop or mobile) — no
build step, no server, no dependencies. Your progress **auto-saves** to the device via
`localStorage`, so you can pick up where you left off.

## What's in the prototype

- **Village management** — upgrade Headquarters, resource buildings (Timber Camp, Clay
  Quarry, Iron Mine), Farm (population cap), Warehouse (storage), Barracks, Rampart, and
  Academy, each with its own cost curve and construction queue.
- **Army** — recruit eight unit types (Spearman, Swordsman, Axeman, Archer, Scout, Light
  Cavalry, Battering Ram, Nobleman), gated by Barracks/Academy level and population.
- **World map** — a 15×15 continent of barbarian camps, terrain, and a rival stronghold.
  **Scout** camps to reveal garrisons, **raid** them for loot, and **watch the animated
  battle** play out round by round (retreat to save survivors).
- **Conquest** — build an Academy, train **Noblemen**, and grind a camp's **loyalty** to
  zero on a winning attack to annex it as a **second village**. Manage and **reinforce**
  your villages across the map.
- **Enemy waves** — **Warlord Kaas** periodically marches on your capital. Scout, defend,
  and eventually **conquer his stronghold** to end the raids and **win the realm**.
- **Sandbox / cheats** — a bottom-right 🛠️ button opens God mode (∞ resources), 100×
  build/train speed, and instant tools to stress-test every mechanic.

## Continuing the project

[`docs/HANDOFF.md`](docs/HANDOFF.md) is the full context document for anyone (human or
AI agent) picking up the work: architecture, the `S` state model, config/tuning tables,
a function map, how each system works, conventions/gotchas, and the roadmap toward an
eventual multiplayer backend.

> Note: the handoff references two companion docs — `KingsAge_Reforged_Plan.md` and
> `KingsAge_Reforged_Backend_Spec.md` — that are not yet in this repo.

## Status

Prototype only — mechanics and balancing are exploratory and subject to change.
