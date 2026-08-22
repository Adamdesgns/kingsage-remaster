> # ⚠️ VOID - DO NOT USE
>
> **Written against a tool that does not exist.** There is no KingsAge battle
> simulator; the description in this sheet was Tribal Wars' simulator, imported
> without a source. Kept only so the mistake stays visible in history.
>
> **Read `2026-08-22-what-we-actually-need.md` instead.** The two things this
> sheet set out to measure were on public pages all along, and one of its
> assumptions - that the Spy sits outside combat - was an actual bug.

# KingsAge battle-simulator run sheet

**Purpose.** Convert the `[INFERRED]` and `[SIM]` tags in
`docs/superpowers/specs/2026-08-22-combat-and-army-design.md` into measured
facts, using the in-game simulator on a live KingsAge account
(`s51-us.kingsage.gameforge.com`). The simulator needs **no troops and no
buildings** and accepts up to 500,000 defending units, so every run below is
free and instant.

**Rule for this document:** record what the simulator *says*, verbatim, in the
RESULT column. Do not round, do not interpret in the same pass. Interpretation
happens after all runs are in.

## Settings that must be identical on every run unless stated

| Setting | Value | Why |
|---|---|---|
| Wall level | **0** | Removes the `1.04^L` multiplier |
| Luck | **0%** | Luck is ±25% noise; it would corrupt every reading |
| Morale | **100%** | Morale floors attack at 30%; must be neutral |
| Night bonus | **OFF** | Doubles defence |
| Attacker | **pure single unit** | With one class, 100% of the defence lands in one sub-battle — the whole point |

---

## Block 1 — Unit class assignment (the biggest inference in the spec)

**What it settles.** KingsAge never published which units count as infantry,
cavalry or archer for defence purposes. The spec infers it from unit IDs
inherited from Tribal Wars. This block *measures* it.

**The probe.** The Squire is the ideal defender: its three defence values are
`100 / 200 / 300` (infantry / cavalry / archer) — a clean 1 : 2 : 3 spread, so
the three hypotheses produce three obviously different battles.

**Fixed defender for all of block 1: `1000 Squires`, empty village otherwise.**

Attacker counts are chosen so total attack ≈ **200,000**, which is exactly the
*cavalry* hypothesis. That makes the reading unmistakable by eye:

- attacker **wins with light losses** → the unit is **INFANTRY** (defence 100k)
- attacker **barely survives / mutual annihilation** → **CAVALRY** (defence 200k)
- attacker **loses** → **ARCHER** (defence 300k)

| # | Attacker | Count | Attack total | Spec says | RESULT (survivors both sides) | Verdict |
|---|---|---|---|---|---|---|
| 1.1 | Farmer's Militia | 10,000 | 200,000 | Infantry | | |
| 1.2 | Squire | 4,000 | 200,000 | Infantry | | |
| 1.3 | Templar | 2,000 | 200,000 | Infantry | | |
| 1.4 | Berserker | 572 | 200,200 | Infantry | | |
| 1.5 | Long-bow | 1,333 | 199,950 | **Archer** | | |
| 1.6 | Crusader | 222 | 199,800 | **Cavalry** | | |
| 1.7 | Black Knight | 333 | 199,800 | **Cavalry** | | |
| 1.8 | Battering Ram | 2,000 | 200,000 | Infantry | | |
| 1.9 | Trebuchet | 400 | 200,000 | Infantry | | |
| 1.10 | Count | 2,000 | 200,000 | Infantry | | |

⚠️ If the simulator caps Counts, drop 1.10 to whatever it allows and scale the
defender down by the same factor.

---

## Block 2 — Does the three-parallel-battles model actually hold?

**What it settles.** Block 1 assumes the model. This block *tests* it. It is the
single most load-bearing claim in the whole research document — if it is wrong,
the combat rewrite is wrong.

**Run 2.1.** Attacker: **572 Berserkers + 333 Black Knights** (200,200 infantry
attack + 199,800 cavalry attack ≈ 50/50 share). Defender: **1000 Squires**.

The model predicts the defender is *cloned* — not divided — into two sub-armies
weighted by the attacker's attack share, and two battles resolve in parallel:

- infantry battle: 200,200 attack vs 500 Squires × 100 = **50,000** defence
- cavalry battle: 199,800 attack vs 500 Squires × 200 = **100,000** defence

A flat-power model would instead read one defence number and give a visibly
different answer. **Record the exact survivor counts of all three unit types.**

**Run 2.2.** Same, but **80/20** by attack value: 916 Berserkers (320,600) +
133 Black Knights (79,800). Confirms the split tracks attack *share* and is not
simply even.

---

## Block 3 — Base defence of a settlement

**What it settles.** Research found base defence **NOT FOUND** for KingsAge.
This is why a lone Count dies against an empty village.

Defender: **completely empty village, wall 0.** Ladder the attacker until the
losses bracket the value.

| # | Attacker | RESULT | Reading |
|---|---|---|---|
| 3.1 | 1 Berserker (350 atk) | | dies → base defence > 350 |
| 3.2 | 10 Berserkers (3,500) | | |
| 3.3 | 100 Berserkers (35,000) | | losses here solve for it directly |
| 3.4 | 1,000 Berserkers (350,000) | | |

With attack `A` > base defence `B`, the attacker should lose `(B/A)^1.5` of its
force. Run 3.3 or 3.4 gives enough precision to solve for `B`.

---

## Block 4 — The wall

**What it settles.** We built `1 + 0.08×L` (linear). Research says `1.04^L`
(220% at L20). Also ⚠️ **UNCERTAIN:** whether the wall multiplies *base* defence
as well as troop defence.

| # | Setup | RESULT | Reading |
|---|---|---|---|
| 4.1 | 100 Berserkers vs 1000 Squires, **wall 0** | | baseline |
| 4.2 | same, **wall 20** | | defence should be ×2.191 (`1.04^20`) |
| 4.3 | same, **wall 10** | | should be ×1.480 (`1.04^10`) |
| 4.4 | 100 Berserkers vs **empty** village, **wall 0** | | = run 3.3 |
| 4.5 | 100 Berserkers vs **empty** village, **wall 20** | | **if losses rise, the wall multiplies base defence too** |

Runs 4.4/4.5 are the pair that settles the UNCERTAIN flag. They are cheap and
nobody has ever measured them.

---

## Block 5 — Modifiers, confirm-only

Only run these if the simulator exposes the toggles.

| # | Question | Setup |
|---|---|---|
| 5.1 | Night bonus doubles defence? | run 4.1 with night bonus ON; expect defence ×2 |
| 5.2 | Luck range is ±25%? | run 4.1 at luck −25% and +25%; read the swing |
| 5.3 | Morale floor is 30%? | if morale is enterable, set 30% and confirm attack ×0.30 |

---

## What the simulator canNOT answer

Do not waste a session hunting for these — they need the *game*, not the
simulator:

- **Goldsmith golden-armour cost curve.** Confirmed that each successive Count's
  armour costs more; the numbers live only on the in-game Goldsmith screen and
  need a built Residence. Long-term.
- **Trebuchet scaling against a defended village.** Trebuchets never affect the
  current battle, so the simulator is silent by design. Needs the in-game
  building-damage chart.
- **Return-march slowdown factor** for a victorious army carrying loot.
  Described in help as "clearly slowed down"; factor NOT FOUND.

---

## After the runs

1. Fill the RESULT columns verbatim.
2. Re-tag the spec: every measured rule moves `[INFERRED]`/`[SIM]` → `[MEASURED]`.
3. Any run that contradicts the research document gets written up as a defect
   against the research, not quietly folded in.
