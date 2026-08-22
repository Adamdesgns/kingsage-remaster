# Kingsmarch — Combat and the Army (design spec)

**Date:** 2026-08-22 · **Status:** DRAFT, awaiting Adam
**Evidence:** `docs/design/2026-08-22-kingsage-mechanics-research.md`
**Brief:** `docs/design/CANONICAL-BRIEF.md`
**Decision on record:** Adam, 2026-08-22 — *"I want the exact troops setup they
used and the mechanics: we'll use that as a base."*

> **Confidence discipline.** Every rule below carries a tag:
> **[CONFIRMED]** — from Gameforge's or InnoGames' own documentation.
> **[INFERRED]** — reconstructed; reproduces official data but never published.
> **[OURS]** — a decision we are making, not something we found.
> **[SIM]** — to be measured in KingsAge's in-game battle simulator before we
> commit to it.
>
> Nothing here is implemented. This spec exists to be argued with.

---

## 1. What changes, in one paragraph

Kingsmarch's combat is currently a flat power sum — one total against another —
which makes troop composition decoration and leaves five of eight troops
pointless. KingsAge does something fundamentally different: it splits the
attacking army into **three classes**, clones the defending army into three
fractional copies, and fights **three independent battles in parallel, in
rounds**. This spec adopts that model, the eleven-unit roster that goes with
it, the wall and siege rules that make walls and rams matter, and the "Realm of
Power" conquest system that replaced loyalty in 2009.

---

## 2. The roster — eleven units

**[CONFIRMED]** stats, from Gameforge's live help. Combat values are identical
across every KingsAge world sampled; only speed varies by world speed.

| id | Name | Class | Atk | vs Inf | vs Cav | vs Arch | Speed | Haul | Pop |
|---|---|---|---|---|---|---|---|---|---|
| `militia` | Farmer's Militia | Infantry | 20 | 40 | 30 | 5 | 20 | 5 | 1 |
| `spear` | Squire | Infantry | 50 | 100 | 200 | 300 | 18 | 25 | 1 |
| `sword` | Templar | Infantry | 100 | 300 | 100 | 200 | 22 | 15 | 1 |
| `axe` | Berserker | Infantry | 350 | 70 | 50 | 50 | 18 | 10 | 1 |
| `archer` | Long-bow | **Archer** | 150 | 400 | 150 | 100 | 18 | 10 | 1 |
| `scout` | Spy | — | 1 | 10 | 5 | 7 | 9 | 0 | 2 |
| `lightCavalry` | Crusader | Cavalry | 900 | 200 | 300 | 300 | 10 | 80 | 4 |
| `heavyCavalry` | Black Knight | Cavalry | 600 | 1500 | 1000 | 1000 | 11 | 50 | 6 |
| `ram` | Battering Ram | Infantry | 100 | 100 | 200 | 20 | 30 | 0 | 5 |
| `trebuchet` | Trebuchet | Infantry | 500 | 400 | 100 | 200 | 30 | 0 | 8 |
| `noble` | Count | Infantry | 100 | 300 | 100 | 200 | 35 | 0 | 100 |

Costs (wood / stone / iron) and training time — **[CONFIRMED]**:

| Unit | Cost | Train | Research |
|---|---|---|---|
| Farmer's Militia | 3 / 10 / 7 | 0:00:28 | 10 / 10 / 10 |
| Squire | 10 / 20 / 30 | 0:01:45 | 20 / 20 / 30 |
| Templar | 30 / 10 / 80 | 0:02:15 | 40 / 40 / 60 |
| Berserker | 40 / 50 / 50 | 0:02:00 | 720 / 500 / 630 |
| Long-bow | 80 / 160 / 80 | 0:02:30 | 480 / 570 / 630 |
| Spy | 40 / 60 / 60 | 0:04:30 | 570 / 630 / 610 |
| Crusader | 100 / 100 / 300 | 0:10:30 | 2100 / 1800 / 2400 |
| Black Knight | 100 / 300 / 500 | 0:15:00 | 3500 / 3600 / 3700 |
| Battering Ram | 100 / 500 / 200 | 0:35:00 | 1800 / 1400 / 1200 |
| Trebuchet | 200 / 600 / 200 | 0:50:00 | 3000 / 2500 / 1600 |
| Count | 100000 / 120000 / 80000 | 5:00:00 | — (Residence) |

**Class assignment is [INFERRED]** from unit IDs KingsAge inherited from Tribal
Wars. KingsAge never published it. **[SIM]** — this is the first thing the
simulator settles.

### Naming and ID decisions **[OURS]**

- **Keep our internal ids** where the role is identical: `scout` (Spy), `noble`
  (Count), `spear`, `sword`, `axe`, `ram`. That preserves 86 existing hardcoded
  references across the scouting and conquest slices at zero cost.
- **Three ids are new:** `militia`, `heavyCavalry`, `trebuchet`. Our existing
  `archer` keeps its id and simply becomes the Archer *class* — KingsAge calls
  the same unit `bow`, but the id is ours to choose and changing it would cost
  references for nothing.
- **Display names are KingsAge's.** "Templar", "Berserker", "Crusader",
  "Black Knight", "Squire" are common medieval terms and carry no rights. Only
  the *name KingsAge* is off limits.
- ⚠️ **Keep KingsAge's Squire numbers verbatim, including the oddity.** Its
  flavour text says it stops mounted units, but its archer-defence (300)
  exceeds its cavalry-defence (200). We copy the numbers, not the flavour text
  — and we write our own description that matches the numbers.

### The happy accident

Our battle scene already has exactly **three orderable squads** — vanguard,
archers, riders — chosen in slice B to match the server's `CommandSquadId`
vocabulary. Those map **one-to-one onto infantry / archer / cavalry**. The
squads stop being cosmetic and become the actual combat classes, which also
resolves the spec §5 tension ("~10–20 squads") in the right direction: three
*classes* that mean something, subdivided into many visual formations.

---

## 3. Combat — three parallel battles

**[CONFIRMED]** (official DE wiki, `Das_neue_Kampfsystem`) — this is the "new"
system, used on any world with archers. KingsAge has archers, so this is ours.

```
each round:
  # 1. attacker strength per class, after modifiers
  A[c] = Σ over attacking units of class c:
           count × attack × morale × (1 + luck)
  share[c] = A[c] / (A[INF] + A[CAV] + A[ARC])
             ^^^ split by ATTACK VALUE. Not population. Not headcount.

  # 2. the WHOLE defending army is cloned into three fractional sub-armies
  D[c] = ( Σ over ALL defending units: count × share[c] × defence_vs_c )
           × wallFactor × nightBonus
         + baseDefence × share[c]

  # 3. three INDEPENDENT battles, in parallel
  for c in {INF, CAV, ARC}:
    if A[c] >= D[c]:  attackerLoss[c] = (D[c]/A[c])^1.5 ; defenderLoss[c] = 1
    else:             defenderLoss[c] = (A[c]/D[c])^1.5 ; attackerLoss[c] = 1

  # 4. apply
  attacking units of class c lose attackerLoss[c]
  every defending unit loses Σ over c of ( share[c] × defenderLoss[c] )

  # 5. if BOTH sides still hold troops, recompute shares from the SURVIVORS
  #    and fight another round
```

- **The three defence values are never collapsed into one number.**
- **Casualty exponent is 1.5** **[CONFIRMED]** two independent ways.
- **Rounds are real** **[CONFIRMED]** — the official worked example runs two.
- **[OURS]** cap rounds at **10** to bound server work. In practice battles
  converge in 1–3; a cap only ever bites on a near-perfect stalemate. **[SIM]**
  confirm the real engine has no lower cap.
- **[OURS]** ties (`A[c] == D[c]`) resolve to the **defender**. The real script
  is unpublished; a defender-favouring tie is the conventional and safer choice.

### Battle phase order **[CONFIRMED]**

1. Rams damage the wall (temporary)
2. Spies fight their own battle
3. The main troop battle
4. Trebuchets damage buildings
5. Conquest and pillaging

Our current model does step 3 only. All five become real.

---

## 4. The wall

**[CONFIRMED]** KingsAge: `wallFactor = 1.04 ^ wallLevel` — 100% at level 0
rising to **220%** at level 20. (Tribal Wars uses 1.037 / 207%. Genuinely
different games; we take KingsAge's.)

Our current wall is `1 + 0.08 × level`, which is linear and reaches 260% at
level 20 — stronger than either source game, and wrong in shape.

**Base defence** — a settlement defends itself with no troops at all:

```
baseDefence = 20 + 50 × wallLevel        # level 0 → 20, level 20 → 1020
```

**[CONFIRMED for Tribal Wars]**, **NOT FOUND for KingsAge** — its help never
mentions base defence. **[SIM]** — simulate an empty village at several wall
levels and read the floor directly.

Base defence is split across the three classes by the same `share[c]`. Luck and
morale scale it; **the night bonus does not** **[CONFIRMED]**. Destroying a
wall to level 0 leaves the floor of 20 **[CONFIRMED]** — which is why a lone
Count dies attacking an empty settlement.

⚠️ **[SIM]** Whether `wallFactor` also multiplies base defence is undocumented.
Do not assume.

---

## 5. Siege

Both siege units share one formula with a different constant **[CONFIRMED]** —
verified against 30/30 rows of the official chart and two live battle reports.

```
levelsDestroyed = round( effectiveUnits / (K × 1.09 ^ targetLevel) )
  RAMS       K = 4, targetLevel = wall level at the START of the attack
  TREBUCHETS K = 3, targetLevel = building level at the START of the attack
```

`targetLevel` is **fixed at the pre-attack level for the whole attack** — it
does not decay as levels fall. This is why waves are cheaper than one lump, and
it is a real strategic texture we get for free.

### Rams hit the wall twice **[CONFIRMED]**

```
# before the battle — temporary; THIS is the wall the battle is scored against
drop       = round(rams / (4 × 1.09^wallLevel))
battleWall = max(wallLevel − drop, ceil(wallLevel / 2))      # half-cap, rounds UP

# after the battle — permanent, no cap, can reach 0
attacker won:  effective = ramsSent + ramsSurviving
attacker lost: effective = ramsSent × defenderLossFraction
drop     = round(effective / (4 × 1.09^wallLevel))           # ORIGINAL level
newWall  = max(wallLevel − drop, 0)
```

Rams die at the same rate as every other attacking unit — no special rule
**[CONFIRMED]**.

### Trebuchets never affect the current battle **[CONFIRMED]**

Building damage resolves *after* the troop battle. One target chosen at send
time; only the target's **level** matters, not which building it is; HQ, Farm
and Warehouse floor at level 1; if the target does not exist, nothing is
damaged and they do not retarget.

⚠️ **[SIM]** Trebuchet scaling against a *defended* village is undocumented in
both games — every published chart assumes an empty village.

---

## 6. Modifiers

| Modifier | Rule | Tag |
|---|---|---|
| **Luck** | −25%…+25%, attacker's view, multiplies attack power. Uniform. | [CONFIRMED] range, [OURS] uniform mapping |
| **Morale** | `min(1, 3 × defenderPoints / attackerPoints + 0.30)`, floor 30%. Always on. Attacker only. Never applies to spies or abandoned settlements. | [CONFIRMED] range, [INFERRED] formula |
| **Night bonus** | Defenders ×2. **See §10 — this needs a decision.** | [CONFIRMED] in source game |
| **Research** | **No combat multiplier.** One-time unlock to train a unit. | [CONFIRMED] |
| **Memorial** | +50% fortification. Buildable only when every building is maxed. Also softens Counts. | [CONFIRMED] |
| **Support** | Defends with own stats, benefits from host's wall and Memorial. **No stacking limit.** | [CONFIRMED] |

**Morale matters more than it looks.** A giant attacking a small player fights
at a *third* strength. On a 13+ platform that is a safety mechanic as much as a
balance one, and it is why Kingsmarch does not need a separate anti-bullying
rule for raiding.

**Research becomes a pure unlock.** We currently have troop levels 1–10 at +8%
combat each — that is Tribal Wars' system, not KingsAge's. **[OURS]** Drop the
combat multiplier; keep the research *gate* — you must research a unit once
before you can train it, at the building that trains it (see §10.3). Research
is a one-time cost per unit type per kingdom, not a per-village level.

---

## 7. March speed

**[CONFIRMED]**

```
distance = sqrt(dx² + dy²)                       # Euclidean, fractional
speed    = baseMinutesPerField / worldSpeed
time     = distance × max(speed over EVERY unit in the army)
```

**The army marches at its slowest unit.** Our current model ignores composition
entirely. This single rule creates the raid-versus-siege distinction: a
Crusader column moves at 10, a Trebuchet column at 30, a Count at 35.

**[OURS]** `worldSpeed` becomes a config constant so a Roblox session can be
tuned without touching unit data. Our current base march is 12s + 1.2s/tile;
KingsAge's raw numbers are minutes-per-field on a much slower game. **[SIM]**
not needed — this is purely our tuning choice, and it should be set from a real
Roblox session, not from a browser game's pacing.

---

## 8. Settlement points — a new system we do not have

Realm of Power scales to a settlement's **point score**, and we have no such
thing. We have `warVictoryPoints`, which is a kingdom-level PvP score and
unrelated.

**[CONFIRMED]** KingsAge awards points per building level — 20 per level for
most buildings, 10 per level for Hide / Farm / Stable, 100 per level for the
Residence, 1000 flat for the Memorial. A settlement's score is the sum, and
**can never exceed 10,000**.

Player total = sum of settlement points + 2,500 per settlement beyond the first.

**[OURS]** Our buildings cap at levels 20–30 where KingsAge's reach 50, so a
straight copy of the per-level values would leave our settlements far short of
10,000. Scale the per-level award so that a fully-maxed Kingsmarch settlement
lands at 10,000, preserving the cap that Realm of Power depends on. Exact
values to be derived once, in code, with a test that pins the maximum.

---

## 9. Conquest — Realm of Power

**[CONFIRMED]** KingsAge replaced loyalty in version 0.1.18 (August 2009). What
we built is Tribal Wars'.

| | We built (Tribal Wars) | KingsAge |
|---|---|---|
| Scale | 0–100 fixed | 0 → settlement points, capped 10,000 |
| Reduction | 20–35 per surviving noble | **2,250–2,750** per surviving Count |
| vs Memorial | — | 1,750–2,250 |
| Per-attack cap | none | **never more than 50% of maximum** |
| Effective per attack | all nobles | **one Count** |
| Regeneration | none | **+1% of maximum per hour** |
| Capture at | ≤ 0 | 0 |
| After capture | 25 | **30% of maximum** |
| Building | Academy | Residence + Goldsmith |

**The 50% cap is the best rule in the whole system.** It guarantees a
settlement **always takes at least two separate attacks**, however small it is.
Ours can be taken by one lucky roll. It also means only one Count per attack
matters, so stacking Counts into a single march is wasted — you must commit
across time, which is what makes conquest a campaign instead of a purchase.

**The Count dies when 50% of the attacking army dies** **[CONFIRMED]**, or if
sent alone. Escort matters.

**Regeneration makes defence active.** A settlement left alone recovers 1% of
maximum per hour, so a stalled campaign genuinely loses ground. Our current
loyalty never recovers.

⚠️ **NOT FOUND: the Goldsmith's armour cost curve.** Each successive Count's
armour costs more; the numbers live only on the in-game Goldsmith screen and
need days of building to reach. **[OURS]** Ship a placeholder escalation —
`cost × 1.5^(counts already produced)` — clearly marked as ours, and replace it
if we ever obtain the real curve.

---

## 10. Two decisions that are genuinely ours

### 10.1 The night bonus

**[CONFIRMED]** KingsAge doubles defence between 00:00 and 08:00 server time.
That works in a browser game you check twice a day. On Roblox — global players,
short sessions — "you cannot meaningfully be attacked for a third of the day"
is a different and probably worse thing, and it hands a large advantage to
whoever happens to live in the server's timezone.

**[OURS] Recommendation:** adopt Tribal Wars' *newer* solution — each player
picks their own 8-hour protected window, visible on their profile, changeable
with a long cooldown. It keeps the protection that makes offline play fair
without making it a timezone lottery. **This needs Adam's ruling.**

### 10.2 Abandoned settlements

**[CONFIRMED]** In KingsAge these are run by robbers who *actively build and
grow*, and the rules explicitly carve them out: taking one **does not burn**
beginner conquest protection, while attacking a real player does.

So they are the designed first conquest — the "first rung" our game currently
lacks. This is not a nice-to-have; it is how the source game onboards.

**[OURS]** Adopt them, and adopt the protection carve-out with them. Name them
**Freeholds**. ⚠️ Our store currently renames two open player seats "Unclaimed
Hold", which will read as the same thing — rename those to **Open Seats**.

---

## 10.3 Which buildings train what **[OURS]**

KingsAge trains every unit at the Barracks, keeps conquest in a **Residence**,
and makes Count-armour in a **Goldsmith**. It has no Smithy at all. We have a
Barracks, Stable, Workshop, Academy, Smithy and Market — all of them real
places a player can walk into.

Adopting KingsAge's building layout wholesale would strand four buildings we
have already built and rendered. So:

| Unit | Trained at | Note |
|---|---|---|
| Militia, Squire, Templar, Berserker, Long-bow | **Barracks** | as KingsAge |
| Spy, Crusader, Black Knight | **Stable** | ours — KingsAge uses Barracks |
| Battering Ram, Trebuchet | **Workshop** | ours |
| Count | **Academy** | our Academy plays KingsAge's Residence |
| Count's armour | **Smithy** | our Smithy plays KingsAge's Goldsmith |

This keeps every building we have, gives each a distinct job, and preserves the
one rule that matters: **the conquest unit and its escalating armour cost live
behind separate, expensive buildings.**

## 11. Migration — what this touches

| Area | Change | Size |
|---|---|---|
| `economy.ts` TROOPS | Replace 8 with 11; three defence values, speed, haul | Table swap |
| `warfare.ts` `armyPower` | Delete. Replaced by per-class strength | Rewrite |
| `warfare.ts` `resolveBattle` | Five phases, three parallel sub-battles, rounds | Rewrite |
| Wall | `1 + 0.08L` → `1.04^L`, plus base defence | Small |
| Siege | New: ram double-pass, trebuchet post-battle | New |
| March | Speed per unit, army at slowest | Small |
| Points | New settlement point score | New |
| Conquest | Loyalty → Realm of Power | Rewrite |
| Freeholds | New world generation + protection rules | New |
| Roblox `Buildings.luau` | Mirror the new table | Table swap |
| War table | Recruitment for 11 units; report shows the class breakdown | Medium |
| Battle scene | Squads become the real classes | Small — already aligned |
| Tests | Every warfare test re-derived | Large |

**`scout` and `noble` keep their ids**, so the scouting and conquest slices —
86 hardcoded references — survive untouched.

**This is not one slice.** Suggested order, each independently shippable:
1. Roster + three-class combat + wall (server only, no client change)
2. Recruitment for all 11 (client)
3. Siege — rams and trebuchets
4. Settlement points + Realm of Power
5. Freeholds
6. March speed, night bonus

---

## 12. Acceptance tests

1. **No dominance.** No unit is beaten by another on every efficiency axis
   across all three defence types.
2. **Counters bite.** A pure-cavalry army loses to a garrison it out-totals on
   raw attack, when that garrison is cavalry-defence heavy. Same for infantry
   and archers.
3. **Shares are by attack value**, not population — a 1-population Berserker
   (350 atk) contributes more share than a 6-population Black Knight (600 atk)
   per unit of population.
4. **Rounds terminate.** No battle exceeds the round cap; a stalemate resolves.
5. **Rams:** pre-battle reduction is capped at half the wall, rounded up;
   post-battle uses the ORIGINAL wall level; zero rams reproduces the old wall.
6. **Trebuchets never change a battle outcome** — same battle result with and
   without them, only building levels differ afterwards.
7. **Wall:** `1.04^20 = 2.19` within rounding; empty settlement still defends.
8. **Speed:** an army containing a Trebuchet marches at 30, not at its
   Crusaders' 10.
9. **Realm of Power:** one attack can never remove more than 50% of maximum; a
   settlement therefore always needs at least two attacks; regeneration
   restores 1% of max per hour.
10. **Count dies** when 50% of the attacking army dies, and a dead Count moves
    nothing.
11. **Freeholds:** taking one preserves beginner protection; attacking a player
    ends it.
12. **Simulator parity [SIM]:** for ten recorded KingsAge simulator results,
    our engine produces the same winner and casualty figures within rounding.

Test 12 is the one that matters. Everything else checks we implemented what we
wrote down; test 12 checks we wrote down the right thing.

---

## 13. Open questions for Adam

1. **Night bonus** — fixed 00:00–08:00 like KingsAge, or a per-player chosen
   window? (§10.1. My recommendation: per-player.)
2. **Do we keep KingsAge's Squire numbers** even though its own flavour text
   contradicts them? (My recommendation: yes, keep the numbers, rewrite the
   description.)
3. **Research** — confirm dropping the 1–10 combat multiplier for a pure
   unlock gate, matching KingsAge.
4. **Scale** — KingsAge's buildings reach level 50 and ours 20–30. Keep our
   caps and rescale points, or raise our caps to match? (My recommendation:
   keep ours, rescale points.)
5. **Buildings** — §10.3 maps KingsAge's Residence and Goldsmith onto our
   Academy and Smithy so nothing we built is stranded. Confirm.
6. **Slice order** — §11 proposes six. Confirm or reorder.

---

## 14. What the simulator settles

Once the account is live, these stop being inferences:

| Question | Method |
|---|---|
| Unit class assignment | Send a pure single-class army; see which defence value moves |
| Base defence exists / its value | Simulate against an empty settlement at wall 0, 5, 10, 20 |
| Does wallFactor multiply base defence | Compare the above against the formula |
| Casualty exponent is 1.5 | Compare predicted vs actual survivor counts |
| Wall factor 1.04^L | Vary wall level only, hold armies constant |
| Round cap | Construct a near-stalemate and count the rounds |
| Trebuchets vs a defended village | Vary defenders, hold trebuchets constant |

**Until then, every [INFERRED] and [SIM] tag above stands.** We can start
building §11 step 1 against the confirmed parts — the roster and the three-class
structure are both CONFIRMED — but the constants stay provisional.
