# Audit: what we actually still need to know

**Replaces `2026-08-22-simulator-run-sheet.md`, which was written against a tool
that does not exist.** Adam called that out; he was right. This document is the
corrected answer to "what do we actually need, and where does it come from".

---

## The correction that prompted this

The spec, the handoff and the run sheet all assumed **KingsAge has an in-game
battle simulator** that "takes up to 500,000 defending units and needs no troops
or buildings". Chased down:

- **The research document — the one with real citations — never mentions a
  simulator anywhere.** Not once.
- The official KingsAge help index has no simulator entry.
- Adam, logged into a live account on `s51-us`, could not find one.
- "500,000 defending units, no troops or buildings needed" is a precise
  description of **Tribal Wars' simulator**.

So an earlier session imported a Tribal Wars tool into a KingsAge document
**without a source** — the same wrong-game error that put a Tribal Wars combat
model in this game, committed one layer up, in the very document written to fix
it. Every `[SIM]` tag in the combat spec inherited that assumption.

**Lesson, and it is the same one as the three defects on 2026-08-22: an
uncited claim in our own docs is not evidence.** The research document earned
trust by citing sources. The spec's `[SIM]` plan did not, and nobody checked.

---

## What we now KNOW, from public pages, with no account at all

Both of these were reachable the whole time. Nobody had to log into anything.

### 1. Every unit's real numbers — CONFIRMED

Source: the official KingsAge units help page
(`https://s15-en.kingsage.gameforge.com/help.php?m=units`). It gives **three
separate defence values per unit**, which independently confirms the whole
three-class structure.

| Unit | Attack | vs Infantry | vs Cavalry | vs Archer |
|---|---|---|---|---|
| Farmer's militia | 20 | 40 | 30 | 5 |
| Squire | 50 | 100 | 200 | 300 |
| Templar | 100 | 300 | 100 | 200 |
| Berserker | 350 | 70 | 50 | 50 |
| Long-bow | 150 | 400 | 150 | 100 |
| Spy | 1 | 10 | 5 | 7 |
| Crusader | 900 | 200 | 300 | 300 |
| Black knight | 600 | 1500 | 1000 | 1000 |
| Battering ram | 100 | 100 | 200 | 20 |
| Trebuchet | 500 | 400 | 100 | 200 |
| Count | 100 | 300 | 100 | 200 |

**`combat.ts` matches this table exactly, all eleven units, every number.**

### 2. The unit class assignment — CONFIRMED, and it was never really unknowable

Source: the official InnoGames unit-type article
(`support.innogames.com/kb/TribalWars/en_DK/4433`), the same engine family the
spec's combat formula already came from.

- **Infantry:** Spear, Sword, Axe, siege (Ram, Catapult), Nobleman, Militia
- **Cavalry:** Scout, Light cavalry, Heavy cavalry, Paladin
- **Archers:** Archer, Mounted archer

This was billed as "the single biggest inference in the design" and "the first
thing the simulator settles". It took one search.

**Ten of our eleven were inferred correctly. One was wrong: the Spy.** We had it
outside combat entirely, so a garrison of 500 Spies defended with nothing but
the base floor — an empty-looking village that is not empty. Fixed, with a test.

---

## What is STILL genuinely unknown — and whether it blocks anything

| # | Unknown | Blocks what | Severity |
|---|---|---|---|
| 1 | **Base defence value.** `20 + 50 x wallLevel` is Tribal Wars'; KingsAge's help never mentions base defence. | Only attacks on near-empty settlements. Swamped by any real garrison. | **Low** |
| 2 | **Does `wallFactor` multiply base defence?** Undocumented in both games. | Same narrow case as #1. | **Low** |
| 3 | **Trebuchet vs a *defended* village.** Every published chart assumes an empty one. | Siege — spec slice 3. | **Medium, later** |
| 4 | **Goldsmith golden-armour cost curve.** Lives only on an in-game screen needing a built Residence. | Economy, far off. | **Low, later** |
| 5 | **Return-march slowdown** for an army carrying loot. Help says "clearly slowed down"; no factor given. | March timing polish. | **Low** |
| 6 | **Round cap.** We chose 10 `[OURS]`. | Nothing — real battles converge in 1–3. | **None** |

**Conclusion: nothing on this list blocks the build.** Every item is either a
narrow edge case, or belongs to a slice we have not started. The combat rewrite
can proceed on confirmed numbers all the way through.

---

## How the remaining unknowns get settled, if we ever care

Not by a simulator. By **real battle reports from Adam's live account** — which
is strictly better evidence anyway, because it is the actual running engine
rather than a tool's model of it. It costs playing time rather than clicks, so
it is worth doing only when one of the six above starts to matter.

The one worth an early look is #1/#2, and one real attack on an empty
settlement settles both at once.

---

## What this changes in the spec

- **Section 14 "What the simulator settles" is void.** Replaced by a pointer here.
- **Acceptance test 12 (simulator parity) cannot be run as written.** It was the
  test billed as "the one that matters". Its intent survives — check our engine
  against the real one — but the instrument has to be recorded battle reports.
- **The `[SIM]` tag now means "unmeasured", not "awaiting a simulator run".**
  Six items carry it; none block slice 1.
