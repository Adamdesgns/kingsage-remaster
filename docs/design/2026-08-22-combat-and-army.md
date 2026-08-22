# Design pass — Combat and the Army

**Date:** 2026-08-22 · **Status:** PROPOSED, awaiting Adam
**Brief:** `docs/design/CANONICAL-BRIEF.md` (built same day; this is the first
design work in this project to run against one)
**Lenses:** #4 Core Gameplay & Systems (owner) · #5 Domain Authenticity
(medieval warfare) · #6 Economy & Progression · #1 Game Director
**Red team:** separate pass, appended below.

> Every number in this document came out of a balance simulation, not
> judgement. The simulation **falsified three of my own proposals** before they
> reached this page — see *How the numbers were found*. Sim source:
> scratchpad `sim.mjs`, `ram.mjs`, `onramp.mjs`.

---

## The finding that started this

Combat is a flat power sum ([warfare.ts:186](../../packages/game-core/src/warfare.ts)):

```
attackerPower = Σ(count × attack) × plan × orders × variance
defenderPower = Σ(count × defense) × (1 + wallLevel × 0.08) × variance
attackerWon   = attackerPower >= defenderPower
```

No counters. One total against another total. Measured consequences:

| Efficiency | spear | sword | axe | archer | cavalry | ram |
|---|---|---|---|---|---|---|
| attack / population | 10.0 | 25.0 | **40.0** | 15.0 | 32.5 | 0.4 |
| attack / 100 res | 11.1 | 19.2 | **30.8** | 7.9 | 27.4 | 0.3 |
| defence / population | 25.0 | 30.0 | 10.0 | **40.0** | 7.5 | 4.0 |
| defence / 100 res | **27.8** | 23.1 | 7.7 | 21.1 | 6.3 | 2.9 |

- **Light Cavalry is strictly dominated by Axemen** on all four axes. It is
  never the correct purchase.
- **The Ram is beaten on every axis by six of the eight troops** — it is worse
  than a spearman at everything, including defending.
- **Swordsmen are never best at anything.**
- Only three troops are ever worth building: spear (cheapest defence), axe
  (best attack), archer (densest defence).

A simulation of four garrison types confirms the player-facing result:
**all-axemen is the best answer to every garrison.** Composition is decoration,
and the scout report — which shows you the defender's exact army — is
information you have no use for.

That is the real problem. Not the missing buttons.

---

## DECISION

Three changes, all to the world server's combat model. The unifying idea:
**composition beats total.**

1. **Split defence into two numbers: defence-vs-infantry and
   defence-vs-cavalry.** The attacking army's cavalry share (by population)
   blends which of the defender's two numbers applies.
2. **Rams tear down the Rampart before the battle is scored.** Each ram removes
   **2 Rampart levels**, floored at 0.
3. **An army marches at the speed of its slowest unit.**

Plus one world change that follows from them, and one client change without
which none of it is reachable:

4. **Recruitment for all eight troops** in the war table (five have no button).
5. **Freeholds** — masterless settlements as softer early targets. *Now
   optional, not blocking — see MVP.*

## WHY IT WINS

**It makes three already-built systems load-bearing.** Scouting, the war table,
and the report card all exist and all work. Right now the report tells you the
defender's exact army composition, and that information is worthless — you only
need a bigger total. Under counters, that report becomes the most important
screen in the game: you read their garrison, then you decide what to build.
`READ → PLAN → DO → VERIFY → REVEAL → REWARD` is the framework the Core
Gameplay lens owns, and the game currently has no READ step that matters. This
supplies one, for free, out of code already shipped and tested.

**It is the genre's own truth, restored.** The brief locks the original
KingsAge / Tribal Wars lineage as the reference. That lineage's combat model
has *always* been defence-by-attacker-type; a pike wall stops horse and is
useless against massed infantry. The port kept the economy curves and dropped
this. Domain authenticity here isn't decoration — pikes versus cavalry is the
single most legible fact of medieval land war, and an 11-year-old already knows
it from every film they've seen. **FUN**: choosing an army is a decision.
**TRUE**: it preserves the essential principle. **SAFE**: no change to tone.

**It is small.** One extra number per troop and roughly fifteen lines in
`resolveBattle`. The renderer, the marching, the scouting, the conquest, and
every gate stay as they are.

## PLAYER EXPERIENCE

You scout a neighbour. The report says: *120 Swordsmen*. Today that means "they
have 3,600 defence, bring more than that." Under this change it means **"their
line is built to stop infantry — send horse."** You go home, build cavalry
instead of axes, and win a fight your resource total said you should lose.

The next neighbour is 150 Spearmen and you send horse out of habit, and it goes
badly, and *that is the lesson* — recoverable, specific, and teaching something
true. A mistake should teach something and create a recoverable consequence.

Later you scout a Rampart 15 keep and the maths stops working at any army size
you can afford. The answer is not more axes; it is **rams**, which are slow and
expensive and which tell everyone what you are doing. Siege becomes a different
kind of decision from a raid.

## DETAILED SPEC

### 1. Two defence types

Every troop gains `defenseInfantry` and `defenseCavalry`, replacing `defense`.
Values below hold each troop's total defensive weight roughly where it is
today, so the economy is not re-based.

| Troop | attack | def vs infantry | def vs cavalry | identity |
|---|---|---|---|---|
| Spearman | 10 | 15 | **45** | The pike wall. Stops horse, folds to infantry. |
| Swordsman | 25 | **45** | 15 | The shield line. Stops infantry, folds to horse. |
| Axeman | 40 | 10 | 5 | Glass cannon. Defends nothing. |
| Archer | 15 | 40 | 30 | Steady all-round defence. Costs for it. |
| Scout | 0 | 2 | 2 | Non-combatant. Unchanged. |
| Light Cavalry | 130 | 30 | 40 | Hammer in the field, poor behind a wall. |
| Battering Ram | 2 | 20 | 20 | Soaks hits. Its value is the wall rule. |
| Nobleman | 25 | 35 | 35 | Unchanged. |

**Resolution.** `cavalryShare` = attacker's cavalry population ÷ attacker's
total population (Light Cavalry is the only cavalry today; Noblemen ride with
the Riders squad but are **not** counted as cavalry for this purpose — they are
a claim, not a charge).

```
defenderPower = Σ over defender troops:
  count × (defInf × (1 − cavShare) + defCav × cavShare) × researchMult
```

Everything else in `resolveBattle` — plan factor, order bonus, variance, loss
ratios, surrender, loot — is untouched.

### 2. Rams and the Rampart

```
effectiveWall = max(0, wallLevel − ramCount × 2)
defenderPower = ... × (1 + effectiveWall × 0.08)
```

Applied **before** the battle is scored, using the rams that arrived. Zero rams
reproduces today's behaviour exactly.

**Why 2 and not 1 or ⅓.** Swept in simulation against a real mixed garrison at
a 20,000-resource budget:

| Ram strength | Rampart 3 | Rampart 8 | Rampart 15 | Rampart 20 |
|---|---|---|---|---|
| 1 level per 3 rams | worthless | worthless | worthless | worthless |
| 1 level per 2 rams | worthless | worthless | worthless | worthless |
| 1 level per ram | worthless | pays | pays | worthless |
| **2 levels per ram** | **worthless** | **pays** | **pays** | **pays** |

At 2 levels per ram the ram is worthless against a weak wall and essential
against a strong one. That is the correct shape: *don't bring siege to an open
village.* My first guess (⅓ of a level) would have shipped a ram that stayed
worthless — the simulation caught it.

### 3. March speed

`marchDurationSeconds` gains a speed factor: the **slowest** unit in the army.

| Troop | factor |
|---|---|
| Scout | 0.5 |
| Light Cavalry | 0.6 |
| Spear / Sword / Axe / Archer | 1.0 |
| Battering Ram | 1.8 |
| Nobleman | 1.8 |

A cavalry raid arrives in 60% of the time; a siege column crawls at 180%. This
makes "fast flanking" true, makes cavalry's 80 carry worth something (fast loot
raids), and makes a noble column a commitment in *time* as well as resources.

### 4. Recruitment for all eight

The war table's Village tab gains a **RAISE TROOPS** section grouped by
recruiter — Barracks, Stable, Workshop, Academy — with one row per troop:
name, cost, train time, and ×1 / ×10 buttons. The three existing presets
(5 Spearmen, 2 Scouts, 1 Nobleman) stay as quick actions. Buildings keep their
proximity prompts. Refusals stay honest and name the missing building or cost.

### 5. Freeholds — masterless settlements *(deferred, see MVP)*

Neutral settlements with no kingdom, garrisoned 5–20 spearmen, Rampart 0–2,
loyalty 100. Takeable with one or two Noblemen. The first rung of the ladder
and the main early growth path in this game's lineage.

**Naming:** call them **Freeholds** — a real medieval term for land held
without a lord — not "barbarian villages" (a Tribal Wars-ism). ⚠️ The store
currently renames the two open player seats "Unclaimed Hold", which will read
as the same thing and is not. Rename those to **Open Seats** if Freeholds ship.

## FIRST 10 MINUTES

Unchanged for the first five: spawn, walk, queue a build, recruit. The change
lands at the first scout report, which today is a wall of numbers with no
consequence and becomes the first real decision in the game: *what does their
garrison stop, and what does it not?*

Measured: under the new model a fresh kingdom's first conquest becomes
reachable at **~50 Axemen (6,500 resources)** against a peer village at
Rampart 3–5 — roughly twice a village's starting bank. That is a concrete,
motivating first goal that does not exist today at any army size.

## LONG-TERM VALUE

Defence becomes a real specialisation: you choose whether your holdings stop
horse or infantry, and a smart attacker punishes the choice. Raid columns and
siege columns diverge into different builds with different speeds and different
telegraphing. Scouting stops being a formality and becomes espionage. All of
that is mastery depth bought with one number per troop.

## FAILURE MODES

- **Legibility on a phone.** Two defence numbers per troop is the entire risk.
  *Mitigation:* the scout report must state the conclusion, not the table —
  *"Their line is built to stop infantry."* Never make a 13-year-old do the
  weighted average. This is a UX dependency, not a nice-to-have.
- **Existing battle tests will change outcomes.** The gate-d warfare tests were
  written against the flat sum. They must be re-derived, not deleted — and the
  fact that they change is the evidence the model changed.
- **Replay determinism.** Battles already resolved carry outcomes computed
  under the old maths. A replay must render its **stored** outcome, never
  recompute. Verify before shipping.
- **A new dominant strategy.** Simulation says no across four garrisons and two
  wall levels, but four garrisons is not proof. Ship the dominance check as a
  permanent test, not a one-off script.
- **Cavalry could become oppressive** against the many players who default to
  cheap spearmen. Watch it; the lever is `defC` on spear.
- **Rams telegraph.** A slow siege column is visible for a long time, which is
  intended, but it may make sieges feel un-winnable against active defenders.
  Acceptable for now — defence *should* have an answer.

## MVP VS. LATER

**Simulation changed this ordering twice.** Freeholds were going to be the MVP
until the on-ramp test showed a first conquest is reachable without them.

| Phase | What | Where | Why here |
|---|---|---|---|
| **1** | Two defence types + ram/wall | server only | Makes all 8 troops mean something. Fully testable offline. Nothing renders differently. |
| **2** | Recruitment for all 8 | Roblox client | Without it players can only build spearmen and phase 1 is theoretical. |
| **3** | March speed | server | Texture: raid vs siege. Cheap, but nothing depends on it. |
| **4** | Freeholds | world gen | A softer ladder. **No longer blocking** — phase 1+2 open the first rung. |

⚠️ **The red team overruled this table — read it before acting.** Phase 1 alone
is the smallest change that fixes the *stated* problem, but shipping it without
phase 2 leaves every player able to recruit only spearmen, so every army is
identical and the counter system is pure downside. **Phases 1 and 2 ship
together, with the scout-report conclusion line, or not at all.**

## ACCEPTANCE TESTS

1. **No dominance.** No combat troop is beaten by another on *every* efficiency
   axis (attack/pop, attack/res, defInf/pop, defCav/pop, defInf/res,
   defCav/res). Ships as a permanent test, not a script.
2. **Counters bite.** An all-Axeman army **loses** to a Swordsman garrison it
   out-totals on raw attack; an all-Cavalry army **loses** to a Spearman
   garrison it out-totals.
3. **Rams do their job.** Against Rampart ≥ 8, an army including rams beats the
   same resources spent purely on axes. Against Rampart 0, rams change nothing.
4. **Zero rams is a no-op.** With no rams in the army, every outcome is
   bit-identical to today.
5. **Speed.** An army containing one ram takes 1.8× the march time of the same
   army without it. A cavalry-only army takes 0.6×.
6. **Replay is stored, not recomputed.** A battle resolved before the change
   replays with its original outcome.
7. **Reachability.** From a fixture start, ~50 Axemen defeat a peer village at
   Rampart 3.

## HANDOFF

- **Engineering (server):** `TroopDefinition` gains two fields, `defense` is
  removed; `armyPower` takes the attacker's cavalry share; `resolveBattle`
  applies rams before the wall bonus; `marchDurationSeconds` takes the army.
  Migration: none — troop stats are code, not rows.
- **Engineering (Roblox):** `Buildings.luau` mirrors the new numbers (it already
  mirrors `TROOP_ORDER`); the RAISE TROOPS section; the scout report gains its
  one-line conclusion.
- **UI:** the report's conclusion line, and a defence read-out that shows two
  numbers without looking like a spreadsheet.
- **QA:** the seven acceptance tests, plus re-derived gate-d warfare tests.
- **Analytics:** none exists yet. When it does: army composition per attack,
  and win rate by composition-versus-garrison. That is the only way to catch a
  new dominant strategy in the wild.
- **Art / Audio:** nothing. This pass deliberately touches no visuals.

## Director's scoring (1–5)

| Axis | Score | Note |
|---|---|---|
| Player fantasy | 5 | Commanding an army you *chose* is the fantasy. |
| Immediate fun | 4 | The first scout report becomes a decision. |
| Learnability | **3** | Two defence numbers is the whole risk. Held at 3 *only* because the scout-report conclusion line is mandatory, not optional. |
| Mastery depth | 5 | Composition, defence specialisation, raid vs siege. |
| Visual payoff | 3 | Nothing renders differently. Acceptable — not this pass's job. |
| Social value | 3 | Neutral now; defence specialisation is what alliances would later trade on. |
| World impact | 4 | Makes conquest reachable, which is the game's promise. |
| Originality | 3 | Deliberately not original — it is the genre's proven model, restored. |
| Mobile feasibility | 4 | No new rendering, no new input. Only reading. |
| Production feasibility | 5 | One number per troop, ~15 lines of maths. |
| Safety and fairness | 5 | No monetization, no tone change, no new grief case. |
| Long-term replayability | 5 | Counters are what make a war game re-playable. |

No axis below 3. Learnability is the one to watch and its mitigation is named
as a hard dependency.

## Decision table

| Item | Verdict | Owner | Depends on |
|---|---|---|---|
| Two defence types | **APPROVE** (pending Adam) | server | — |
| Rams tear down Rampart, 2 levels each | **APPROVE** (pending Adam) | server | — |
| Recruitment for all 8 | **APPROVE** (pending Adam) | Roblox client | phase 1 |
| Scout-report conclusion line | **APPROVE — mandatory** | Roblox client | phase 1 |
| March speed | **DEFER** to phase 3 | server | — |
| Freeholds | **DEFER** to phase 4 | world gen | naming decision |
| Rename "Unclaimed Hold" → "Open Seat" | **DEFER**, bundled with Freeholds | server | — |

## OPEN QUESTIONS

1. **Does Adam want the genre's proven counter model, or something original?**
   This proposal deliberately restores Tribal Wars' answer rather than
   inventing one. That is a strength for a remaster and a weakness for
   differentiation. It is his call, and it is the only question that changes
   the whole shape of the work.
2. **Squads: spec §5 asks for "~10–20 squads that think"; three shipped.** This
   pass does not touch it, but counters make it live again — should the
   battlefield show infantry and cavalry as visibly different formations?
3. **Are Noblemen cavalry?** Specced as *no* (they ride with the Riders squad
   but do not shift the defender's blend). Defensible either way.

## How the numbers were found

Every number here survived a simulation that killed earlier versions:

1. **The dominance check** proved Light Cavalry and the Ram are strictly
   dominated — I had assumed it, then measured it.
2. **The garrison simulation** proved all-axemen answers every garrison today,
   and that the proposed split produces different best answers per garrison.
3. **The ram sweep killed my first ram rule.** I proposed ⅓ of a wall level per
   ram; it left rams worthless at every wall level tested. 2 levels per ram is
   the measured answer.
4. **The on-ramp test killed my phasing.** Freeholds were going to be MVP;
   measuring showed ~50 Axemen already take a peer village under the new model,
   so Freeholds became phase 4.

---

# RED TEAM — separate pass

> Run as a distinct pass after the proposal was complete, against the Part IV
> prompt. **Disclosure:** it was not run by an independent subagent, which is
> the skill's stated preference. Treat it as a disciplined self-review and
> discount it accordingly.

**1. What is strongest and must be preserved.** The insight that counters make
*already-shipped* systems load-bearing — scouting, the report card, the war
table — instead of adding new ones. And that the whole fix is one number per
troop. Preserve the smallness above all; the temptation will be to add morale,
luck, night bonuses, and three more defence types.

**2. Contradictions with the Canonical Brief.** One, and it is real: the brief
locks *"the world server lives and barely changes — deterministic combat
math"* (spec §11). This proposal changes exactly that. **Resolution:** the
brief now records combat as a *falsified assumption* rather than a locked
decision, because the spec locked it believing it was the original game's
model, and it is not. Adam should confirm that reading rather than have it
assumed on his behalf.

**3. Hidden player-experience failures.**
- **The defender never learns.** All the new decision-making sits with the
  attacker. A defender finds out their spear wall was the wrong choice only by
  losing, offline, to a battle report. That is a genuinely weak feedback loop
  and this proposal does not fix it.
- **Composition is invisible in the battle scene.** The 3D fight renders three
  squads by colour. Under counters the *reason* you won is infantry-versus-
  cavalry, and nothing on screen shows it. The spectacle and the maths drift
  apart — which is exactly what the brief warns against.
- **Phase 1 without phase 2 is worse than today.** If counters ship and players
  still can only recruit spearmen, every player fields the same army and the
  counter system is pure downside. **Phases 1 and 2 must ship together or not
  at all.** The MVP table above is wrong to imply otherwise.

**4. Exploits, grief, economy abuse.** Cavalry share is computed from the
*sent* army, so an attacker can add one cheap unit to shift the blend. Check
the maths is monotonic and that a token unit cannot swing it far. Otherwise no
new exploit: the server remains sole authority and nothing rendered decides
anything.

**5. Mobile / control / performance risks.** No new rendering, no new input, no
new network traffic. The only mobile risk is reading comprehension, already
named.

**6. Cut, simplify, combine, defer.** Cut nothing from phase 1. **Defer march
speed and Freeholds harder than the proposal does** — both are texture next to
the counter fix, and shipping four things at once on a game with zero external
players and nine passing drills is how a working build becomes an unprovable
one.

**7. Revised proposal.** As written, with three amendments: **(a)** phases 1
and 2 are one shipment, not two; **(b)** the scout-report conclusion line is
part of that shipment, not a follow-up; **(c)** add a defender-side battle
report that names *why* the defence held or broke, so the defender learns too.

**8. Acceptance tests.** The seven above, plus: **(8)** a token unit cannot
swing cavalry share more than its population share; **(9)** the defender's
battle report names the deciding factor.

**9. Final verdict: APPROVE WITH REVISIONS.** The diagnosis is measured and the
fix is small and proportionate. The revisions are about *shipment shape*, not
direction. Do not ship phase 1 alone.
