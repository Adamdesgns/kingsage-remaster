# KingsAge / Tribal Wars mechanics — research findings

**Date:** 2026-08-22 · **Status:** RESEARCH, not a decision
**Method:** four parallel research agents (one spawned a fifth to cross-check
siege formulas), each required to cite primary sources, cross-check two
independent sources per finding, tag every claim CONFIRMED / LIKELY /
UNCERTAIN, and say **"not found"** rather than invent a number.

> **Primary source note.** KingsAge's own help pages are *still live* on the
> surviving world servers (`s1`–`s33`, `-en` and `-de`). Everything tagged
> "KingsAge CONFIRMED" below comes from Gameforge's own `help.php`, not a fan
> wiki. Tribal Wars fills the gaps: KingsAge is a near-exact reimplementation
> of the 2008-era Tribal Wars engine, with re-tuned constants.
>
> **The single most important caveat:** InnoGames has never published the
> combat script. The German official wiki says so outright — *"nur die
> Entwickler kennen das genaue Kampfskript."* Everything quantitative below is
> community reverse-engineering that **reproduces the official charts exactly**.
> Treat it as excellent, verified reconstruction — not as source code.

---

## 1. THE COMBAT MODEL — three parallel battles, not one comparison

**CONFIRMED** (official DE wiki, `Das_neue_Kampfsystem`, plus a second source).

Tribal Wars runs two different systems. The *old* one (2 classes, single pass,
weighted average) is used on worlds without archers. The *new* one runs
wherever archers exist. **KingsAge ships archers (Long-bow) and publishes three
defence values, so the new system is the one to build.**

The defending army is **never collapsed into one number**. It is cloned into
three fractional sub-armies and fights three independent battles at once.

```
CLASS(unit) ∈ { INFANTRY, CAVALRY, ARCHER }

each round:
  # 1. attacker's strength per class, after modifiers
  A[c] = Σ over units of class c:  count × attack × morale × (1 + luck)
  share[c] = A[c] / (A[INF] + A[CAV] + A[ARC])
             ^^^ SPLIT IS BY ATTACK VALUE — not population, not headcount

  # 2. the WHOLE defending army is cloned into three fractional sub-armies
  D[c] = ( Σ over ALL defending units: count × share[c] × defence_vs_c )
           × wallFactor × nightBonus
         + baseDefence × share[c]

  # 3. three INDEPENDENT battles, resolved in parallel
  if A[c] >= D[c]:  attackerLoss[c] = (D[c]/A[c])^1.5 ; defenderLoss[c] = 1
  else:             defenderLoss[c] = (A[c]/D[c])^1.5 ; attackerLoss[c] = 1

  # 4. apply
  attacking units of class c lose attackerLoss[c]
  each defending unit loses Σ over c of ( share[c] × defenderLoss[c] )

  # 5. if BOTH sides still have troops → recompute shares from the
  #    SURVIVORS and fight another round
```

**Casualty exponent is 1.5. CONFIRMED two ways**, from sources that state it in
algebraically different forms:

- Official DE wiki: `defenceLost = A / √(D/A)`, then `fraction = defenceLost/D`.
  Expands to `(A/D)^1.5`. Their worked example: 388,212 vs 985,185 → 24.74%.
  `0.394047^1.5 = 0.247358`. Exact match.
- Cheesasaurus: `(loser/winner)^(1/2) / (winner/loser)` — the same thing.

⚠️ A search summary claimed the exponent is 0.5. That is a misreading of the
second form. **It is 1.5.**

⚠️ The "30% / 50% / 20%" split quoted in some places is the DE wiki's **worked
example output**, not a game constant.

**Rounds are real.** The wiki's example runs two: round 1 kills all 1,170 axes
while the cavalry and mounted archers win their sub-battles; round 2 recomputes
shares from the survivors (96%/4%) and re-splits the surviving defenders.

### Battle phase order — CONFIRMED (KingsAge help, verbatim)

1. Damaging the town wall (rams)
2. Battle of the spies
3. Normal troop battle
4. Damaging buildings (trebuchets)
5. Conquests and pillaging

---

## 2. THE KINGSAGE ROSTER — full stats

**CONFIRMED** from Gameforge's live help. Internal IDs are inherited verbatim
from Tribal Wars, which is the strongest available evidence for class
assignment. Combat stats are identical across every world sampled (s1, s2, s5,
s15, s18, s20); **only speed changes**, by the world-speed divisor.

| KA id | Name | Atk | vs Inf | vs Cav | vs Arch | Speed | Haul | Pop | Class (inferred) |
|---|---|---|---|---|---|---|---|---|---|
| `farmer` | Farmer's militia | 20 | 40 | 30 | 5 | 20 | 5 | 1 | Infantry |
| `spear` | Squire | 50 | 100 | 200 | 300 | 18 | 25 | 1 | Infantry |
| `sword` | Templar | 100 | 300 | 100 | 200 | 22 | 15 | 1 | Infantry |
| `axe` | Berserker | 350 | 70 | 50 | 50 | 18 | 10 | 1 | Infantry |
| `bow` | Long-bow | 150 | 400 | 150 | 100 | 18 | 10 | 1 | **Archer** |
| `spy` | Spy | 1 | 10 | 5 | 7 | 9 | 0 | 2 | (own phase) |
| `light` | Crusader | 900 | 200 | 300 | 300 | 10 | 80 | 4 | Cavalry |
| `heavy` | Black knight | 600 | 1500 | 1000 | 1000 | 11 | 50 | 6 | Cavalry |
| `ram` | Battering ram | 100 | 100 | 200 | 20 | 30 | 0 | 5 | Infantry |
| `kata` | Trebuchet | 500 | 400 | 100 | 200 | 30 | 0 | 8 | Infantry |
| `snob` | Count | 100 | 300 | 100 | 200 | 35 | 0 | 100 | Infantry |

Costs (wood / clay / iron) and training time, from the same source:

| Unit | Cost | Train | Research cost |
|---|---|---|---|
| Farmer's militia | 3 / 10 / 7 | 0:00:28 | 10/10/10 |
| Squire | 10 / 20 / 30 | 0:01:45 | 20/20/30 |
| Templar | 30 / 10 / 80 | 0:02:15 | 40/40/60 |
| Berserker | 40 / 50 / 50 | 0:02:00 | 720/500/630 |
| Long-bow | 80 / 160 / 80 | 0:02:30 | 480/570/630 |
| Spy | 40 / 60 / 60 | 0:04:30 | 570/630/610 |
| Crusader | 100 / 100 / 300 | 0:10:30 | 2100/1800/2400 |
| Black knight | 100 / 300 / 500 | 0:15:00 | 3500/3600/3700 |
| Battering ram | 100 / 500 / 200 | 0:35:00 | 1800/1400/1200 |
| Trebuchet | 200 / 600 / 200 | 0:50:00 | 3000/2500/1600 |
| Count | 100000 / 120000 / 80000 | 5:00:00 | none (Residence) |

⚠️ **`class` assignment for KingsAge is NOT FOUND** in any source. The table
above infers it from the inherited Tribal Wars unit IDs. This is the single
biggest inference in this document and should be labelled as such wherever it
is used.

⚠️ **A genuine oddity in KingsAge's own numbers:** the Squire's flavour text
says it defends against mounted units, but its published archer-defence (300)
*exceeds* its cavalry-defence (200). Either the flavour text or the table is
wrong in the source game. Decide deliberately; do not copy the confusion.

**KingsAge has no mounted archer and no paladin**, and adds one unit with no
Tribal Wars counterpart (`farmer`). Its stats are a genuine rebalance of Tribal
Wars, not a copy.

---

## 3. THE WALL

**KingsAge: `wallFactor = 1.04 ^ level`** — 100% at L0 → **220%** at L20.
CONFIRMED from KingsAge's own per-level table; 19 of 20 levels match the model
exactly (L3 differs by 1, a rounding artifact), and the endpoints match its
stated *"goes from 100% (Level 0) to 220% (Level 20)."*

**Tribal Wars: `1.037 ^ level`** — 207% at L20. CONFIRMED by table and by
published formula.

**These are genuinely different games, not a source conflict.** For a KingsAge
remaster, use **1.04**.

**Base defence (a village with zero troops):** `20 + 50 × wallLevel`
(L0 = 20 → L20 = 1020). **CONFIRMED for Tribal Wars** (dedicated official DE
wiki page with the full table). **NOT FOUND for KingsAge** — its help never
mentions base defence at all.

This is why a lone noble dies against an empty village. Luck and morale scale
base defence; **the night bonus does not**.

⚠️ **UNCERTAIN:** whether `wallFactor` *also* multiplies base defence. One
source's formula implies it does; no source states it. Do not assume.

**Destroying the wall does not remove base defence** — at L0 there is still a
floor of 20. CONFIRMED.

---

## 4. SIEGE — rams and trebuchets

Both are the same formula with a different constant. **CONFIRMED** — verified
against 30/30 rows of the official catapult chart, seven aggregate anchors, and
two live battle reports from a defended village.

```
levelsDestroyed = round( effectiveUnits / (K × 1.09 ^ targetLevel) )

  RAMS:        K = 4,  targetLevel = wall level at the START of the attack
  TREBUCHETS:  K = 3,  targetLevel = building level at the START of the attack
```

`targetLevel` is **fixed at the pre-attack level for the whole attack** — it
does not decay as levels fall. That is exactly why sending siege in waves is
far cheaper than one lump.

### Rams hit the wall TWICE

**Pre-battle (temporary — this is the wall the battle is scored against):**
```
drop = round(rams / (4 × 1.09^wallLevel))
battleWall = max(wallLevel − drop, ceil(wallLevel / 2))     # HALF-CAP, rounds UP
```
The half-cap is CONFIRMED verbatim: a level 19 wall floors at 10, not 9.

**Post-battle (permanent — no cap, can reach 0):**
```
attacker won:  effective = ramsSent + ramsSurviving
attacker lost: effective = ramsSent × defenderLossFraction
drop = round(effective / (4 × 1.09^wallLevel))              # ORIGINAL level
```

⚠️ Getting the "original level" part backwards would make razing a level-20
wall cost ~93 rams instead of the correct **219**.

**Rams die at exactly the same rate as every other attacking unit.** No special
rule — proven from real reports where rams, axes and cavalry all lost 30.6%.

### Trebuchets never affect the current battle

Building damage resolves **after** the troop battle. CONFIRMED verbatim. So a
trebuchet, unlike a ram, cannot help you win the fight you are in.

Rules: one target building chosen at send time; only the target's **level**
matters, not which building it is; HQ / Farm / Warehouse floor at level 1; if
the target does not exist, trebuchets damage nothing and do not retarget.

⚠️ **NOT FOUND:** trebuchet scaling against a *defended* village. Every
published chart assumes an empty village, so the data cannot distinguish two
plausible models. Determine empirically.

---

## 5. MODIFIERS

| Modifier | KingsAge | Confidence |
|---|---|---|
| **Luck** | −25% … +25%, attacker's view, multiplies attack power | CONFIRMED |
| **Morale** | Always on. `min(1, 3 × defenderPoints / attackerPoints + 0.30)`, floor **30%** | CONFIRMED (range) / LIKELY (formula, inherited) |
| **Night bonus** | Defenders get **×2 defence, 00:00–08:00**. Not vs spies, not vs abandoned settlements, not on base defence. Evaluated on **arrival** | CONFIRMED |
| **Research** | **NO combat multiplier.** One-time binary unlock to train a unit. KingsAge has no Smithy | CONFIRMED |
| **Memorial** | **+50% fortification.** Buildable only when every building is maxed. Also softens Counts | CONFIRMED |
| **Support stacking** | *"There is no limit to the amount of troops that can support a settlement"* | CONFIRMED |
| **Outlawed** | Opt-in: nobody with >10× your points may attack you — but if *you* attack, you lose it for 2 months | CONFIRMED |

Morale is worth reading twice: a giant attacking a small player fights at a
**third** strength. For a 13+ audience that is a safety mechanic as much as a
balance one.

**Luck distribution:** the generator is a Mersenne Twister ("highly uniformly
distributed"), but the mapping onto [−25, +25] is **NOT published**. Uniform is
the safe choice; do not claim it as documented.

---

## 6. MARCH SPEED

**CONFIRMED.** Speed is *minutes per field*; lower is faster.

```
distance = sqrt(dx² + dy²)                       # Euclidean, fractional
speed    = baseMinutesPerField / worldSpeed / unitSpeed
time     = distance × max(speed over EVERY unit in the army)
```

- **The army moves at its slowest unit.** CONFIRMED both games.
- Diagonals cost nothing extra — troops march the direct line. CONFIRMED.
  (That the metric is literally Euclidean is LIKELY, not stated outright.)
- **KingsAge base speeds are byte-identical to Tribal Wars'** — proven
  empirically: worlds s1/s5 show the raw values, s15/s18 exactly half (speed 2),
  s20 exactly a quarter (speed 4).
- Return trip is the same duration. CONFIRMED for TW, assumed for KingsAge.
- **Creeping espionage** (KingsAge only): a spy sent this way is invisible to
  the defender but *"clearly slowed down."* Slowdown factor NOT FOUND.

---

## 7. CONQUEST — KingsAge replaced loyalty entirely

**This is the finding that most affects what we already built.**

Tribal Wars uses loyalty 0–100, −20 to −35 per attack, +1/hr regen, reset to 25.
**KingsAge used that too, until version 0.1.18 (August 2009**, per the official
changelog**), when it was replaced by "Realm of Power" / "Machtbereich."**

| | Tribal Wars (Nobleman) | KingsAge (Count) |
|---|---|---|
| Scale | 0–100 fixed | 0 → **the settlement's point score**, capped 10,000 |
| Reduction | random 20–35 **per attack** | random **2,250–2,750** per surviving Count |
| With defender's Memorial | — | random **1,750–2,250** |
| Per-attack cap | none | **never more than 50% of maximum** |
| Effective per attack | 1 noble | 1 Count |
| Regeneration | +1/hr × world speed | **+1% of maximum per hour** |
| Capture at | ≤ 0 | 0 |
| After capture | 25 | **30% of maximum** |
| Building | Academy | **Residence** (+ Goldsmith for armour) |

**The 50%-of-maximum cap is the elegant part** — it means **you always need at
least two Counts**, no matter how small the target. The 2,250–2,750 roll only
starts to matter above ~5,500 max. That is a much better rule than ours, where
one lucky roll can take a village.

**The Count must survive.** KingsAge states a hard rule that differs from
Tribal Wars: **the Count dies when 50% of the attacker's units have died**, or
if it was sent alone.

⚠️ **NOT FOUND: the Goldsmith's golden-armour cost curve.** Confirmed that each
successive Count's armour costs more; the actual numbers live only on the
in-game Goldsmith screen. Needs a live account to obtain.

⚠️ Contradiction, resolved by era: the v0.1.18 changelog says Realm of Power
regenerates "360 an hour"; current live help says "1% of the maximum per hour."
These are different eras. **Use 1%.**

---

## 8. ABANDONED SETTLEMENTS — the on-ramp, and it is official

**CONFIRMED, KingsAge help verbatim:**

> "Abandoned settlements are like normal settlements, except they are
> controlled by robbers and not by players. **Robbers continue to develop the
> settlements, build buildings and units and increase their maximum number of
> points.**"

And decisively, from the new-player protection rules:

> "Conquest protection is also preserved even if a player is in phase 2 and has
> conquered an abandoned settlement."

**So in KingsAge, taking an abandoned settlement is explicitly designed as your
first conquest** — the rules carve it out so it does *not* burn your beginner
conquest immunity, whereas attacking a real player ends that protection at once.

Also: no night bonus and no morale penalty applies when the defender is an
abandoned settlement.

**Tribal Wars players do the opposite** — community guides advise skipping
barbarian villages for a real player village of 1,500–2,500 points. That is a
genuine design divergence between the two games, not a contradiction.

---

## 9. WHAT THIS MEANS FOR WHAT WE ALREADY BUILT

| We built | Actually is | Verdict |
|---|---|---|
| Loyalty 100, −20/35, reset 25 | **Tribal Wars'** system | KingsAge replaced it in 2009 |
| Troop research levels 1–10, +8% each | **Tribal Wars'** 10-level system | KingsAge has **no** combat research |
| Wall +8% per level (linear) | Neither | KingsAge is `1.04^level` |
| Single flat power sum | **Neither game** | Both split by class |
| One defence number per troop | **Neither game** | Both publish 2–3 |
| Rams with no wall interaction | **Neither game** | Rams hit the wall twice |
| No unit speed | **Neither game** | Speed is per-unit, army moves at slowest |
| 8 troops | KingsAge has **11** | +Militia, Black knight, Trebuchet |

Our combat model is not a simplified KingsAge. It is a **different, simpler
game** that shares KingsAge's economy curves.

---

## 10. THE OPEN QUESTIONS RESEARCH COULD NOT CLOSE

Listed so nobody later mistakes a gap for a decision:

1. **KingsAge unit class assignment** — inferred from inherited Tribal Wars
   unit IDs, never published. The biggest inference in this document.
2. **KingsAge base defence numbers** — Tribal Wars' `20 + 50×wall` is
   confirmed; KingsAge never mentions base defence.
3. **Whether wallFactor multiplies base defence** — no source states it.
4. **The Goldsmith armour cost curve** — needs a live account.
5. **Trebuchet scaling against a defended village** — undocumented in both.
6. **The exact casualty script** — reverse-engineered, reproduces every
   official chart, but never published by InnoGames.
7. **Luck's exact distribution mapping.**
8. **Count maximum travel radius** — a per-world setting, not published.

---

## Sources

**KingsAge (Gameforge, primary — still live):**
`s1/s2/s5/s15/s18/s20/s33-en.kingsage.gameforge.com/help.php` — `m=units`,
`m=units&sub=battle`, `&sub=conquer`, `&sub=support`, `&sub=espionage`,
`&sub=attack`, `m=buildings`, `m=player&sub=points`, `m=villages`,
`m=worldinfo`, `m=map`; German originals at `s1-de`; official changelog at
`forum.kingsage.gameforge.com/forum/thread/210-changelogs-history-of-game-updates/`

**Tribal Wars (InnoGames, official):**
`help.die-staemme.de/wiki/` — `Das_neue_Kampfsystem`, `Das_alte_Kampfsystem`,
`Kampfsystem_Fortgeschritten`, `Grundverteidigung`, `Infanterie`, `Kavallerie`,
`Bogenbeschuss`, `Techlevel`, `Moral`, `Nachtbonus`, `Katapult`, `Rammbock`,
`Geschwindigkeit`
`help.tribalwars.net/wiki/` — `Battles`, `Units`, `Wall`, `Charts`,
`Tech_systems`, `World_settings`, `Gold_coins`, `Package_System`, `Academy`
`support.innogames.com/kb/TribalWars/` — articles 1179, 1194, 1195, 1196, 1197,
1198, 1201, 1203, 1204, 252, 439

**Community (cross-check only):**
Cheesasaurus' ram guide (tw.gamers411.net), tribalwars.net / .us / .co.uk /
die-staemme.de forums, tw-wiki.weebly.com, plemiona-planer.pl,
tribalwars.fandom.com
