# Slice 4 — "The living square" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Market row dressing + four villagers walking one route set that hugs the street edges, despawning during a battle at home and during mourning (power loss above a floor, at most once per cooldown) — at the commander's quality bar, inside hard part budgets.

**Architecture:** Two pure shared specs (Lune-audited, the proven pattern): `VillagerSpec.luau` (4 archetypes × exactly 12 frame parts + ≤3-part prop; CharacterStyle's wool/leather palette as RGB; route waypoints hugging street edges; the mourning decision as a PURE function) and `MarketRowSpec.luau` (3 stalls + hanging goods + bread rack, ≤120 static parts). Villagers render CLIENT-side (Paddock pattern: owner-only by construction, zero replication, one BulkMoveTo, parked beyond 120 studs). The market row is static server-built dressing in SettlementBuilder's market branch (placed only where full detail renders, so fog shells stay shells).

## Global Constraints

- Slice table row 4 verbatim: "market row + 4 villagers (commander costume pipeline), one route set hugging street edges, despawn during battle and mourning, mourning floor + cooldown. Gate: 30-second watch test with a kid; tween-CPU phone test." The kid watch test and the phone test need Adam — DEFERRED to the morning, recorded in the handback; everything buildable tonight is built.
- Budgets: villagers 4 × (12 + 3) = 60 ≤ 150 (design cap for 10); market row ≤ 120. Everything anchored, CanCollide=false, zero scripts, no Humanoids, no randomness.
- Red team #5: villagers despawn during ANY open battle at their settlement; mourning requires a REAL power loss above a floor (MOURNING_FLOOR = 5 power), lasts MOURNING_SECONDS = 3600, retriggers at most once per MOURNING_COOLDOWN = 1800. Mourning is detected from LIVE snapshot deltas (a fresh join mid-mourning shows villagers — single-snapshot data cannot carry direction; recorded honestly).
- Routes: rectangular loop on the street shoulders (|x| between 10 and 16, z between −50 and 140), stops at the market front and the square. Rules-check asserts every waypoint stays on the shoulder band — the ground-truth-at-build-time discipline.
- Branch `feat/slice4-living-square` stacked on slice 3. All three gates before done.

### Task 1: `VillagerSpec.luau` + rules
- Archetypes `goodwife | laborer | baker | fishmonger`: `frameSpecs(archetype)` exactly 12 parts (skirt/tunic, torso layer, collar, head, kerchief/hood/cap, 2 arms, 2 legs (or skirt-and-feet), belt/apron, 2 detail layers per archetype), `propSpecs(archetype)` ≤3 (basket / bundle / bread board / fish crate). Palette: CharacterStyle RGBs (WOOL_HOOD 103,81,58 · WOOL_HOSE 76,69,57 · LEATHER 82,52,30 · LEATHER_LIGHT 121,79,42) plus WorldStyle-adjacent wool dyes as literals.
- `VillagerSpec.route(index)`: per-villager phase offset on ONE shared loop of ~8 waypoints on the shoulder band; walk speed constant.
- `VillagerSpec.updateMourning(state, powerNow, nowSeconds)` PURE: state = {lastPower, mourningUntil, cooldownUntil}; a drop ≥ MOURNING_FLOOR while past cooldownUntil sets mourningUntil = now+3600, cooldownUntil = now+3600+1800.
- `VillagerSpec.shouldHide(state, battleOpenAtHome, nowSeconds)`.
- Rules: per-archetype part counts (12 and ≤3, total 60 ≤ 150); waypoints on the shoulder band; no math.random; mourning scenario script (drop 4 → no mourning; drop 5 → mourning 1h; second drop during cooldown → no re-trigger; after cooldown → re-trigger); battle-at-home always hides.

### Task 2: `Villagers.luau` (client) + wiring + rules
- Paddock pattern verbatim: folder `VillageFolk`, build from spec, per-frame BulkMoveTo walking the loop (constant speed, facing along the leg, brief stops at market/square), 120-stud park.
- `Villagers.update(snapshot, nowSeconds)`: my capital village; count = 4 when farm level ≥ 1 else 0; maintain mourning state from village.realmOfPower deltas; hide during battleOpenAtHome (defenderVillageId == mine, status open) or mourning.
- Wire beside `Paddock.update`. Rules: init.client references Villagers.update; renderer draws only via VillagerSpec; a rule that the battle-at-home check reads `defenderVillageId`.

### Task 3: `MarketRowSpec.luau` + SettlementBuilder market branch + rules
- Spec: 3 stalls (posts, awning slabs, table, crates, produce blocks), hanging goods bar, bread rack — counted ≤120. SettlementBuilder's market `decorateBuilding` branch places them via a small placeSpec adapter into its `add()` idiom, with the same construction assert.
- Rules: spec count ≤120; SettlementBuilder market branch references MarketRowSpec; every spec part anchored vocabulary.

### Task 4: Verify + close
- Gates; Studio look: villagers walking the street edges with props, market row dressed; command-bar drill: drop my own realmOfPower? (cannot from client — instead unit-level mourning proof stays in Lune rules; battle-despawn provable live by opening a battle AT my village? I am never my own defender in this world — recorded as rules-proven only.) HANDBACK; vault; push.
