# G-02 opening decisions for Adam

**Date:** 2026-09-10  
**Author:** [Cursor]  
**Status:** recommendations only. Silence is not approval. No Phase 2 persistence or tutorial code is started.

Read with the [opening specification](../superpowers/specs/2026-09-07-player-first-opening.md) and [decision register](2026-09-07-player-first-decisions.md). Tuning numbers stay in the opening spec; this file only asks for yes/no on the contracts required before G-02.

Phase 2 implementation still waits on G-01 (Studio / phone / unfamiliar-player / Adam) **and** Adam’s answers below.

## Recommend accepting for Phase 2 build

These are reversible if playtests show they feel wrong. Player-facing consequence is listed so a “yes” is informed.

| ID | Recommendation | What the player sees if accepted |
|---|---|---|
| D-01 | Accept `opening-v1` as specified: 12 Squires / 8 Long-bows / 4 Crusaders once; first recruit is one Farmer’s Militia; practice armies stay 18 / 14 / 10 and separate. | The city starts with a visible guard. The player can train one cheap militia. They cannot replace Long-bows or Crusaders until normal buildings exist. Practice losses never spend that guard. |
| D-02 storage | Store the shield on the **kingdom**, with no expiry timestamp, removed only after an accepted confirmed first **player** attack. Practice and the NPC survey leave it on. | Every new city shows an active shield. Nothing the tutorial does takes it off. |
| D-08 | Fresh cities only; never seat a newcomer in a developed AI holding. Proposed test cap **32** human-founded cities. Seventh newcomer in a fixture with AI/Freeholds still gets a blank city. | Player 7 is not handed someone else’s developed town. A full world says so and retries; it does not create a half-account. |
| D-09 | Short return 3–5 minutes and longer return 15–25 minutes as **design targets to measure**, using only implemented actions (inspect jobs, one legal build/recruit, practice, survey, Hall board). | Coming back always has a next useful thing. No daily-streak punishment and no fake “collect” button. |
| D-10 | Keep ordinary production and unlocks. Opening spend example remains 90 wood / 100 stone / 65 iron after the crate. No upkeep and no new currency. | The first session spends real stock at real timers. Waiting uses practice and the city, not a paid skip. |

**Ask:** Reply “accept D-01/D-02-storage/D-08/D-09/D-10 as recommended” or name the single row to change.

## D-02 / OPEN-21 — the one rule that needs you

Locked today: every fresh human kingdom starts shielded; shielded targets cannot be attacked; a shield ends only after an accepted first player attack.

In an all-new world every human target is shielded, so nobody can make that first attack. Timed expiry, voluntary “drop my shield,” and unprotected starters are **not** allowed by this recommendation.

**Recommendation:** a **mutual first-war challenge**.

1. Player A names Player B and confirms “this starts real war and drops both shields if accepted.”
2. Player B must accept the same challenge. An unwilling protected player cannot be hit.
3. The server accepts one paired first attack (intel, army, and confirmation bound together). That accepted attack is what removes the shields — not a toggle and not a timer.
4. If either side cancels before acceptance, or the command is rejected, both shields stay on and no troops leave.
5. A lost success response recovers the same accepted march and removed shields; it does not launch a second attack.
6. Practice, NPC survey, and ordinary city work never qualify.

The outgoing-scout proposal still only solves “you need a scout report before attacking.” It does **not** replace this pairing rule.

**Ask (smallest necessary question):** Do you accept the mutual first-war challenge as the only way two shielded newcomers may begin PvP?

Until you answer, real PvP and G-05 stay closed. The safe shielded opening can still be designed; it must not invent another removal path.

## Not asked now

Final name, shop, clans, seasons, D-03 last-city recovery, D-04 eleven-unit mapping, and D-05 conquest stay later. D-06’s Phase 1 teaching rule is recorded separately: **open gate only**.
