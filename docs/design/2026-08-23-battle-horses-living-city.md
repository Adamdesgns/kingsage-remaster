# Kingsmarch — Battle Presence, Visible Horses, Living Settlement

> Design-team pass 2026-08-23, triggered by Adam's first real play session:
> *"that battle scene is weak as fuck and has zero control. I would like to
> join the fight myself honestly. I still see no horses. we have no npc's —
> we need a flowing city inside our gates with a market food etc."*
>
> Lenses: Core Gameplay (#4), World Design (#2), Domain Authenticity (#5),
> Tech Art & Performance (#10). Red-teamed per Part IV before presentation.
> Canonical brief: `CANONICAL-BRIEF.md`.
> Status: RED-TEAMED AND REVISED — the binding plan is the
> **RED-TEAM OUTCOME AND REVISED PLAN** section at the bottom; the draft
> above it is kept as the record of what the review changed.

---

## DECISION

One coherent direction: **make the war physical**. Three workstreams that
share a single thesis — everything the database already knows becomes
something you can stand next to.

- **A. Commander on the field.** Attending a battle puts your actual
  commander ON the battlefield, on foot among your squads. Being there in
  person raises your order cap from 3 to 5 and unlocks RALLY (a squad
  fights toward wherever you personally stand). The realm waits for a
  commander who is present — the battle deadline extends while you are on
  the field. All bonuses stay server-validated numbers flowing through the
  existing order pipeline; your sword swing is feedback, never math.
- **B. Horses you can see.** A paddock at the Stable showing real grazing
  horses (display count scales with the herd), and cavalry conversion as a
  visible ceremony: a horse is led out, the Berserker mounts, and a
  Crusader rides a lap before joining the garrison. Riders squads render
  mounted on the battlefield.
- **C. A settlement that breathes.** Ambient villagers at the commander's
  own quality bar (layered wool costume pieces, not stick figures), walking
  real routes between the well, the market row, the ovens and the yards; a
  dressed market street with stalls, produce and bread; population that
  visibly scales with the Farm and reacts to war (villagers vanish indoors
  when the settlement was recently shaken).

## WHY IT WINS

- It is the brief's own core fantasy, delivered late: *"watch hundreds of
  soldiers fight it out in front of you over ground you chose"* — and its
  expansion, *"your kingdom is a place you walk, not a menu you read."*
  Today the settlement is a beautiful empty stage and the battle is a
  spreadsheet with a camera. These three workstreams are the same fix at
  three scales.
- It converts the game's biggest measured weakness (the audit called the
  battle scene "the weakest visual in the game") into its marquee moment.
- It respects every locked decision: Architecture A stays intact (server
  math, client movie), no Humanoids appear anywhere, mobile budgets are
  named per feature, on-foot play becomes MORE meaningful rather than less.
- Horses close a loop the economy already runs: the Stable breeds them, the
  panel nags about them, cavalry consumes them — and the player has never
  seen one. Seeing the herd IS seeing your wealth (domain truth: a medieval
  lord's paddock was his bank statement).

## PLAYER EXPERIENCE

**Battle (A).** The banner still calls you to the field — but now clicking
it teleports your commander to your army's edge of the battlefield, boots
on the grass, camera at your shoulder (the overhead command view remains
one tap away — the C-hybrid rule, applied to battle). Your three squads are
drawn up in formation around you at readable scale. You walk the line.
Tapping a squad then tapping ground still orders it; standing WITH a squad
and choosing RALLY makes it fight toward you as you move — the strongest
order in the game, and it requires being somewhere dangerous. Arrows land
near you, a knockdown staggers you for seconds (no death, no gore), and
while you are down your rally is silent. Win, and the rout happens around
you; you stand in it.

**Horses (B).** Walk past the Stable: a rail-fenced paddock, four to eight
horses grazing, tails flicking. Recruit a Crusader and the nearest horse is
led to the mounting rail; a soldier swings up and rides one lap before the
pair trots to the barracks yard. The herd visibly thins as your cavalry
grows — the stable-full nag in the panel now has a picture attached.

**Settlement (C).** Walk out of the keep at midday: a baker's boy crosses
the square with a basket, two women talk at the well, a fishmonger calls at
the market row, a cart of hay stands by the granary, chickens peck between
the planters, oven smoke drifts over the roofs. Come home from a lost
battle and the square is silent, shutters closed — the world knows.

## DETAILED SPEC

### A. Commander on the field

- **Placement:** battles already occur at the defender's real village in
  the region world. Attend teleports the commander to a spawn anchor at the
  attacker's baseline (existing battlefield origin + fixed offset). Leaving
  the field (button or walking off the boundary) returns you home via the
  existing exit path.
- **Order cap:** server accepts up to 5 orders when the attacking player's
  commander is attending in person, 3 otherwise (today's cap). Attendance
  is a server fact (the battleOpen session + a presence heartbeat), never a
  client claim.
- **RALLY:** a new order type `rally` carrying the commander's field
  position, validated server-side against the battlefield bounds. The
  ordered squad's engagement point tracks the rally position while the
  commander stands (server samples position on the same cadence as
  existing battle ticks). Bonus weight identical to a normal carried order
  — presence buys you cap and expressiveness, not multipliers.
- **Knockdown:** when the server's battle tick has the enemy locally
  dominant near the commander's sampled position, it flags a knockdown
  (3–5s). Client plays the stagger; during it, rally position is frozen.
  No health bar, no death, no gore — teen-rating safe.
- **Deadline:** the unattended two-minute realm-resolve stays. While the
  attacker's commander is present, the deadline extends to a hard cap of
  10 minutes (server-enforced), then the realm resolves as today. This
  formally revises solo design call #4 (brief, "never reviewed" list).
- **Battlefield ground:** the bare slab gets the settlement's own ground
  language — cobble road running to the defender's gate, grass, shoulder
  dirt, a handful of trees and rocks at the edges (≤120 parts, all
  anchored, zero scripts). The defender's real walls already stand in
  frame; the field finally looks like the approach to them.
- **Readability:** squad formations tighten (blocks of 4-wide files),
  each squad carries one banner part (squad tint, 3 parts) so Vanguard /
  Archers / Riders read at phone distance. Unit scale is unchanged — the
  1,200-part worst case is untouched; banners add ≤9 parts.

### B. Horses

- **Paddock:** rail fence + gate at the Stable's yard (~40 parts), horse
  display count = clamp(herd/12, 2, 8). Horse model: 10 parts, anchored,
  idle amble between 3 waypoints by tween, tail-flick tween. No Humanoid,
  no physics. ≤80 additional parts at cap.
- **Conversion ceremony:** on cavalry recruit completion (existing server
  event), one 12-second client-side sequence: horse tweens to rail,
  soldier block-figure mounts (pre-posed swap), one lap, exit to barracks.
  Purely cosmetic; queue multiple recruits → ceremonies coalesce (one lap
  per batch, counter toast for the rest).
- **Mounted battle silhouettes:** Riders squad units render as horse+rider
  (10 parts vs 6). Budget guard: mounted rendering only while the Riders
  squad is ≤40 units on the field; above that, today's 6-part silhouette
  with a pennant. Worst case stays ≤1,200 parts by construction.

### C. Living settlement

- **Villager rig:** the commander costume system (CharacterStyle) already
  builds era-correct layered figures — reuse its pieces on a fixed 12-part
  frame (no Humanoid, tween locomotion). Four archetypes at launch:
  goodwife, laborer, baker, fishmonger — wool palette from WorldStyle,
  varied by dye. THIS is the answer to the stick-villager failure: the
  quality bar is "same pipeline as the commander," not "new art."
- **Routes:** villagers walk fixed waypoint loops (well ↔ market ↔ ovens ↔
  yards), tween-based, ground-truthed against the street layout at build
  time (the same Structure-anchor discipline the demo tour now uses).
  Collision off — they yield to nothing and nothing yields to them; routes
  keep to street edges so they never block the player.
- **Count:** clamp(Farm level ÷ 2, 4, 10) villagers. Each ≤12 parts + one
  carried prop (≤3 parts): ≤150 parts at cap.
- **Market row:** the existing Market building gets a dressed street face:
  3 stalls (awning, table, crates, produce), hanging goods, a bread rack
  (~120 parts, static). One vendor villager anchors there on route.
- **Ambient life:** 4 chickens (3 parts each, peck-tween), hay cart, well
  bucket, oven smoke (one existing-budget particle emitter). ≤40 parts.
- **War-reactive state:** if the settlement's realm_of_power was reduced in
  the last hour (server fact already in the snapshot), villagers despawn
  and shutters (existing window parts, color swap) close. Recovery is
  automatic with regeneration. Zero new server state.
- **LOD/perf:** all villager tweens pause beyond 120 studs from the
  player camera; everything anchored; zero scripts per NPC (one shared
  scheduler). Owner-side only — foreign settlements stay fog shells, so no
  multiplication across the region.

## FIRST 10 MINUTES

A new player's first walk from gate to keep now passes a working market,
people, and a paddock with horses — the "rule a real place" promise lands
before the first menu. Their first attended battle puts them ON the field
with a banner behind them. Nothing new to learn: the same tap-squad,
tap-ground orders, plus one RALLY button with their own body as the cursor.

## LONG-TERM VALUE

- RALLY is a skill ceiling: positioning your body against the battle's flow
  is mastery no menu can flatten (Core Gameplay's "separate mastery from
  raw repetition").
- The herd and the crowd are progression made visible — Farm and Stable
  levels finally SHOW. This also lays the physical stage for the brief's
  intended economy track (horse breeders selling to warlords need a
  paddock a buyer can walk to).
- War-reactive villagers make every defeat legible at home — retention by
  meaning, not by timer.

## FAILURE MODES

- **Presence exploited as stalling:** attacker attends, hides at field
  edge for 10 minutes to delay a defender's reinforcement timing. Mitigated:
  hard 10-min cap, and knockdown-freeze punishes camping the fight line.
  Watch in playtest.
- **RALLY makes the other orders pointless:** if tracking-your-body always
  beats a placed order, the game collapses to follow-the-leader. Mitigated:
  identical bonus weight, and rally freezes during knockdown. Acceptance
  test below.
- **Battlefield dressing hides the fight on a phone:** trees/rocks occlude
  tiny units. Mitigated: dressing confined to field edges; formation
  banners carry the read.
- **Villagers read as creepy or cheap:** tween figures with no faces can
  uncanny-valley. Mitigated: commander-pipeline costumes, small count,
  purposeful routes with props (a basket explains a walk). Kill criterion:
  if a 30-second watch reads "mannequins," cut archetypes to 2 and double
  the prop/dressing budget instead — the market can carry life that bodies
  can't.
- **Part budgets on real phones:** the 200-soldier drill has NEVER run on
  a phone (brief constraint), and this adds ~400 parts of settlement life.
  Gate below makes the phone measurement a ship/no-ship condition.
- **Ceremony spam:** recruiting 20 Crusaders must not queue 20 laps —
  coalescing rule in spec.

## MVP VS. LATER

- **MVP (one slice each, this order):**
  1. Battlefield ground + banners + commander-on-field with RALLY and the
     5-order cap (A without knockdown).
  2. Paddock + herd display (B without ceremony; mounted silhouettes only
     if the budget math holds on first measure).
  3. Market row dressing + 4 villagers on one route set (C without
     war-reaction or day rhythm).
- **Later:** knockdown, conversion ceremony, mounted riders at scale,
  war-reactive shutters, day/night route sets, defender-side attendance
  (both commanders on one field — needs its own design pass), chickens.

## ACCEPTANCE TESTS

1. Attend a battle: commander spawns on the field; order cap reads 5;
   RALLY tracks the commander within one battle tick; leaving the field
   drops the cap to 3 for further orders. All server-logged.
2. A battle attended in person and one left to the realm produce identical
   outcomes when identical orders are given — presence buys cap and
   expressiveness only (run the deterministic-outcome test twice).
3. Phone measure: the 200-soldier drill + full settlement life pass
   ≥30fps on Adam's actual phone, measured, dated. Ship/no-ship.
4. RALLY-only play does not dominate: scripted comparison battle where 5
   placed orders vs 5 rally-follows differ by ≤ the existing order-bonus
   spread.
5. The herd display equals clamp(horses/12, 2, 8) at Stable levels 1, 14,
   and full; recruiting cavalry visibly reduces it within one heartbeat.
6. 30-second unprompted watch of the square (Adam + one kid): "what are
   they doing?" answerable for every visible villager.
7. All part budgets audited by the existing analytic budget tests
   (WarTable-style): field dressing ≤120, banners ≤9, paddock ≤80,
   villagers ≤150, market ≤120, ambient ≤40.

## HANDOFF

- **Engineering (server):** order-cap rule + rally order type + presence
  heartbeat + deadline extension in world server command validation;
  battle tick samples rally position. Schema: none (orders table already
  generic). Tests: cap gating, rally bounds, deadline cap, determinism.
- **Engineering (Roblox):** field spawn anchor + return path; RALLY UI
  (one button when attending); battlefield dressing in BattleScene;
  paddock/ceremony in SettlementBuilder + Stable hook; villager scheduler
  module + CharacterStyle reuse; war-reactive flag read from snapshot.
- **Art:** none — everything reuses WorldStyle palette and CharacterStyle
  pieces (the locked grey-box-plus rule stands).
- **QA:** acceptance tests above; the phone measure is the gate.
- **Analytics:** none new (no telemetry exists; playtest is Adam + kids).

## OPEN QUESTIONS

1. Defender-side attendance (both players on one field) — deliberately
   deferred; needs its own pass for griefing and pacing.
2. Does knockdown ship in MVP or later? (Spec'd for later; Adam may want
   the danger day one.)
3. The 10-minute attended cap — Adam may want shorter for kid sessions.

---

**Next concrete decision Adam needs to make:** approve the MVP order
(battlefield first, then horses, then villagers) or reorder it — and
answer open question #2 (knockdown in MVP or later).

---

# RED-TEAM OUTCOME AND REVISED PLAN (2026-08-23)

A fresh red-team pass (Part IV, separate agent) returned **REVISE**, with
one finding that kills a centerpiece and several that reshape the rest.

## What the red team was right about

1. **Knockdown is unbuildable.** It needs the server to know where units
   stand, and the engine resolves class totals — no unit has a position.
   Building it from client geometry would violate Architecture A. **CUT**,
   not deferred. Recorded as an open question: positional combat.
2. **Commander position is a client claim.** Roblox movement is
   client-authoritative. RALLY ships only with a server-side walk-speed
   clamp on position deltas (teleport spoofing rejected and logged), and is
   sold honestly: a carried order whose engagement point follows you —
   standard bonus weight, no hidden positional consequence.
3. **Device capability must not gate outcome levers.** The 5-order cap now
   attaches to *attending the battle scene at all* (overhead view counts),
   not to walking the field — a phone player in command view earns the same
   cap as a desktop player on foot.
4. **Measure the phone FIRST.** The 200-soldier drill has never run on real
   hardware. It becomes Slice 0 — before one new part is placed.
5. **Grief vectors need floors and caps:** deadline extension trimmed to
   +3 minutes (not 10); mourning shutters require a real power loss above a
   floor, at most once per cooldown window; villagers despawn during any
   active battle at their settlement (the baker's boy does not stroll
   through a siege).
6. **The heartbeat rides the existing batched state pull** — zero new
   HttpService request budget.
7. **First-ever battle defaults to the overhead view** — shoulder camera is
   the worst view to learn squad orders in.

## Where the red team relied on stale facts (brief now corrected)

- The "flat power sum" and "cavalry strictly dominated" findings predate
  the 2026-08-22 combat migration — the real class-battle engine with
  counters shipped that evening, and the Freehold on-ramp is live (proven
  by conquest in today's audit). The corrected brief records both. What
  remains true and load-bearing for THIS design: **units have no
  positions**, so presence must be honest theater plus order capacity, and
  the deeper "control" ceiling is a future positional-combat decision.
- Cavalry ceremony stays deferred on scope, but its blocker is now "verify
  cavalry balance under the new engine," not "the unit is worthless."

## The revised slice plan (the binding one)

| # | Slice | Contents | Gate |
|---|---|---|---|
| 0 | Phone baseline | 200-soldier drill + current settlement on Adam's real phone, dated PASS/FAIL | ship/no-ship for everything below |
| 1 | The field is a place | battlefield ground language (≤120 parts), squad banners (≤9), attend-on-foot with commander spawn, overhead one tap away, first battle defaults overhead, order cap 5 while attending (view-neutral), deadline +3 min | determinism test: identical orders ⇒ identical outcome |
| 2 | RALLY, honestly | rally order with walk-speed clamp, heartbeat batched into state pull, disconnect semantics (cap reverts in one tick, issued orders stand, rejoin restores) | spoof-rejection + budget-under-load tests |
| 3 | The herd | paddock + grazing horses, display = clamp(herd/12, **0**, 8) — zero shows zero | part audit ≤80 |
| 4 | The living square | market row + 4 villagers (commander costume pipeline), one route set hugging street edges, despawn during battle and mourning, mourning floor + cooldown | 30-second watch test with a kid; tween-CPU phone test |

Deferred, in order of likely return: conversion ceremony + mounted
silhouettes (after a cavalry balance check), defender-side attendance
(own design pass), knockdown (only if positional combat ever exists),
day/night route sets, war-reactive shutters polish, chickens.

## Director scores (1–5, revised plan)

Player fantasy **5** · Immediate fun **4** · Learnability **4** · Mastery
depth **3** (rally is honest but shallow until positional combat — named,
accepted) · Visual payoff **5** · Social value **3** (defender attendance
deferred — named, accepted) · World impact **4** · Originality **4** ·
Mobile feasibility **3** (pending Slice 0 — that is what Slice 0 is for) ·
Production feasibility **4** · Safety & fairness **4** · Long-term
replayability **3** (hinges on the positional-combat decision). No axis
below 3.

## Decision table

| Item | Verdict | Owner | Depends on |
|---|---|---|---|
| Slice 0 phone measure | APPROVE | Adam's phone + Claude | nothing |
| Slices 1–2 (battle) | APPROVE pending Slice 0 | Claude | Slice 0 PASS |
| Slice 3 (paddock) | APPROVE pending Slice 0 | Claude | Slice 0 PASS |
| Slice 4 (square) | APPROVE pending Slice 0 | Claude | Slice 0 PASS |
| Knockdown | REJECT (unbuildable under locked architecture) | — | positional combat, if ever |
| Cavalry ceremony | DEFER | design team | cavalry balance check under new engine |
| Defender attendance | DEFER | design team | own red-teamed pass |
| Positional combat | OPEN QUESTION | Adam + design team | new evidence / appetite |

**The single riskiest assumption to test next:** that the current build
already holds 30fps with 200 soldiers on Adam's actual phone. Slice 0
tests exactly that, first.
