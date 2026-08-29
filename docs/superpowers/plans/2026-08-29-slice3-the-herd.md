# Slice 3 — "The herd" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grazing horses in the Stable's existing paddock, count scaling with the real herd — `displayCount = clamp(herd/12, 0, 8)`, zero shows zero — inside a hard ≤80-part budget, ambling by tween, no Humanoids, no physics, no replication.

**Architecture:** A pure shared spec (`PaddockSpec.luau`, boxie/BattlefieldDressing pattern — Lune counts the same parts Studio draws) plus a CLIENT-side renderer (`Paddock.luau`, BattleScene pattern): the owner's client draws its own herd from its own snapshot, so nothing replicates, foreign settlements stay fog shells by construction, and the phone pays only for what its player owns. Refresh on StateChanged when the displayed count changes.

**Tech Stack:** Luau + Lune rules; TweenService ambling; geometry anchored to the stable lot (`at (115,0,-60) yaw -90`, footprint 58×26, paddock strip in front: local z 14.5..20.5, rails at front+8).

## Global Constraints

- Slice table row 3 verbatim: "paddock + grazing horses, display = clamp(herd/12, **0**, 8) — zero shows zero. Gate: part audit ≤80."
- Fractional herds round UP (`math.ceil(horses / 12)` then clamp 0..8): zero still shows zero, and a stable with 11 real horses does not display an empty paddock. Recorded as the interpretation of the design's integer-less formula.
- Horse: exactly 10 anchored parts (body, chest, hindquarters, neck, head, muzzle, 2 leg pairs, tail, mane), `CanCollide=false`, zero scripts, no Humanoid. 8 × 10 = 80 = the whole budget; the paddock STRUCTURE (posts/rails/trough/hay) already exists in SettlementBuilder and is not this slice's spend.
- Determinism: no `math.random` — amble waypoints derive from horse index; tween durations fixed per index. (`Random.new(seed)` also acceptable, but index-derivation needs no seed plumbing.)
- WorldStyle-adjacent palette (bay/chestnut/dark tones as RGB in the spec, boxie-style constants), grey-box-plus rule: silhouette over detail.
- Branch `feat/slice3-the-herd` stacked on `feat/slice2-rally`. Gates: all three suites.

### Task 1: `roblox/src/shared/PaddockSpec.luau` + rules
- `PaddockSpec.HORSE_PARTS = 10`, `PaddockSpec.MAX_DISPLAY = 8`, `PaddockSpec.BUDGET = 80`
- `PaddockSpec.displayCount(horses): number` — ceil/12, clamp 0..8, floor non-finite to 0
- `PaddockSpec.horseSpecs(index): { PartSpec }` — 10 parts, offsets/sizes/colors/materials as pure data (same PartSpec vocabulary as BattlefieldDressing: name/sx..sz/ox..oz/r,g,b/material/shape)
- `PaddockSpec.waypoints(index): { {x: number, z: number} }` — 3 grazing points inside the paddock strip, derived from index (no randomness)
- Rules (failing first): 8 × horseSpecs = exactly 80 ≤ BUDGET; every spec anchored-vocabulary part (no Script/Humanoid possible by construction — assert names/shapes only); displayCount(0)=0, (1)=1, (11)=1, (12)=1, (13)=2, (96)=8, (10000)=8; `PaddockSpec` contains no `math.random`; waypoints stay within the paddock strip bounds for all 8 indexes.

### Task 2: `roblox/src/client/Paddock.luau` + wiring + rules
- `Paddock.update(snapshot)`: find MY capital village (kingdomId match, isCapital); herd = village.horses; count = displayCount; if count ≠ rendered count or village changed → rebuild folder `workspace.PaddockHerd` (client-only); place horses at their first waypoints around the stable lot CFrame (`villageOrigin * CFrame.new(115,0,-60) * CFrame.Angles(0, rad(-90), 0)`, strip local z 14.5..20.5, x −14..14); start amble: per horse, TweenService CFrame tween to next waypoint (walk 8–12s per leg by index), tail-flick tween loop.
- init.client: call `Paddock.update` from the existing StateChanged/snapshot-apply path.
- Rules: init.client references `Paddock.update`; Paddock builds only via `PaddockSpec` (no local part tables); construction audit function asserts ≤ BUDGET at runtime (assertPropFolder pattern).

### Task 3: Verify + close
- Gates. Studio: stable at level 14 with a stocked herd (72/72 seen in panel earlier → display 6) — horses visible, ambling, tails flicking; herd math spot-check vs panel count; part count attribute ≤80. HANDBACK, vault, push.
