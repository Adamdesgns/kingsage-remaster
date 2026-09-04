# Kingsmarch practice siege prototype

**Date:** 2026-09-04
**Owner direction:** Start the smallest honest version of the scout-map siege direction.
**Status:** Approved local prototype on `feat/practice-siege-codex`; no release or live-world change.

This is Phase 1 of the locked [player-first roadmap](../../plans/2026-09-04-player-first-roadmap.md).

## Purpose

Prove one question before redesigning the main war loop: can an ages-9+ player understand a fort from a scout map, draw three useful routes, and see those routes change a deterministic siege result?

This is a practice fight. It spends no resources, grants no rewards, changes no settlement, and does not replace current production battles. The external world server remains authoritative. Roblox renders the map and collects input; it never decides the outcome.

## Player loop

1. Open **Practice siege** from the War tab.
2. See one fully scouted training fort: a gate, west and east archer towers, one barricade, and keep doors.
3. Draw one route for each squad: Vanguard, Archers, and Riders. Routes snap to the 0–100 practice grid and accept at most six points.
4. Submit the complete plan once. The external server validates it and resolves it with the shared deterministic practice engine.
5. Watch a short phase replay and read why the fort held or fell. The same request always returns the same result.
6. Reset and try another plan.

## Honest tactics

- Route coordinates must affect tower exposure, obstacles, objectives, casualties, and victory.
- A route through an active tower's range is more costly than an otherwise equal route outside it.
- Reaching and disabling a tower must affect later exposure in the deterministic phase order.
- The gate and keep doors have explicit strength. A route that never reaches them cannot win.
- The saved defender plan must name its priorities and affect the result.
- Every accepted result includes short reason strings tied to the actual calculation.
- No outcome may depend on client frame rate, click speed, wall clock, or unseeded randomness.

## Prototype boundaries

- One fixed fort and fixed practice armies.
- Three attacker squads only.
- One saved NPC defense plan. The data shape may support more, but the UI does not need a picker yet.
- No active human defender, incoming-attack alert, clan co-commanding, paid item, reward, live march, conquest, building damage persistence, or world schema migration.
- The current production battle path stays intact.
- Phone is the baseline. Drawing works with mouse and touch, has Undo/Clear, and never requires chat or sound.
- Keep the replay diagrammatic: paths, defense ranges, phase state, and readable reasons matter more than soldier count.

## Wire contract

Add a new authenticated Roblox command named `practice.siege.resolve`. Its payload is the versioned pure-core request. It is stateless and does not increment world version. The accepted event returns the pure-core result. The Roblox server validates and forwards the request through the existing command service; only the external server imports the resolver.

The request and response use shared TypeScript types. The Luau mirror must be constrained in one shared module and covered by the existing cross-language/rules gates. Unknown squads, objectives, defense plans, extra route points, non-integers, and out-of-range coordinates are rejected with a clear code.

## Acceptance

- Focused core tests prove determinism, validation, route causality, tower causality, obstacle causality, defense-plan causality, and understandable reasons.
- Server tests prove authenticated access, statelessness, identical replay, malformed-plan rejection, and no resource/world-version change.
- Luau gates prove the request vocabulary and phone-safe layout constraints.
- Rojo development build succeeds without including `SecretConfig.luau`.
- Studio proof must show a player drawing all three routes, receiving a server result, and understanding one reason. Static gates or a Rojo build do not count as that proof.

## Later if the prototype is fun

Integrate the route model into real scouted settlements, add saved player defenses and incoming warnings, then stage gate/courtyard/keep conquest. Shared clan command and persistent damage remain later decisions.
