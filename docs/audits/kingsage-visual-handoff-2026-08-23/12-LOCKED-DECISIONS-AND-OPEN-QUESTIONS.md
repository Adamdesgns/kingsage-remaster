# 12 — Locked Decisions and Open Questions

## LOCKED — do not reopen

1. **Roblox is the only client.**
2. **The existing world server is the single source of truth.**
3. **Roblox is a secure window into that world** — the client never decides state.
4. **"The World Is the Game."**
5. **Players walk their settlement streets from day one.** Adam's decision; not open.
6. **Every important building is a real place.**
7. **The keep contains a war table** for overhead management.
8. **Each Roblox server renders a region** of multiple settlements and walkable wilderness.
9. **Battles support hundreds of lightweight troops.**
10. **Gate D deterministic combat decides outcomes; Roblox performs the battle visually.**
11. **Battles support offline resolution/replay and attended live squad commands.**
12. **Teen medieval war, ~13+, Moderate-leaning.**
13. **Gritty and weighty is allowed; gore is not.**
14. **Slice one is a walkable grey-box settlement, war table, and live-server economy loop.**
15. **Wilderness, production battle art, empire UI and final art are later slices.**
16. **The 200-troop mobile experiment is separate and early.**
17. **No monetization system is designed or approved.**

### Additional locked rulings made during development

18. **One place to train.** The Barracks trains everything; Stable/Smithy/
    Workshop/Academy are prerequisites you can see standing, not menus.
19. **A kingdom starts with no troops.**
20. **Horses are bred, not bought**, and cavalry is converted from a soldier plus
    a horse.
21. **Buildings grow wider with level, never taller.**
22. **Doorless entryways.** No doors to open anywhere.
23. **Everything is scaled off the Roblox character.**
24. **The name "KingsAge" can never ship.**

## Genuinely open questions

### Visual direction — none of these have been decided

1. **Final art-direction thesis.** There is no written thesis. The current look
   is one day old and was assembled reactively.
2. **Realism versus stylisation.** Undecided. Current build is untextured
   primitives with Roblox built-in materials — stylised by default, not by choice.
3. **Historical period and fantasy level.** Undecided. Unit names imply
   crusades-era Europe; no fantasy elements exist.
4. **Faction visual identity.** Kingdom colours exist as data
   (`#f0c057`, `#62b7dc`, `#d85f55`, `#6cc58a`, `#a882d8`, `#d28b55`) but appear
   only on a foreign banner post. No heraldry, no tabards, no shields.
5. **Final palette.** The current one is a first pass.
6. **Final typography.** No type system exists.
7. **Building-level evolution.** Currently footprint + outbuildings. Whether a
   level-20 building should look *materially different* rather than *bigger* is
   undecided.
8. **Troop proportions.** Six anchored parts. Whether troops should be
   recognisable soldiers or abstract markers is undecided.
9. **Terrain density.** Currently 9% tree coverage and nothing else.
10. **Weather.** Not built, not decided.
11. **Day/night.** Not built. The night combat bonus exists in logic with no
    visual counterpart.
12. **Final UI style.** No theme exists.
13. **Naming and IP strategy.** *"Kingsmarch"* is provisional and unvetted.

### One open gameplay question with visual consequences

**The night bonus.** KingsAge doubles defence 00:00–08:00 server time, which on
Roblox is a timezone lottery. The mechanism is built to accept a per-player
window and **defaults to the source game's behaviour** so the decision stays
open. Whichever is chosen has a visual requirement — the player must be able to
see when they are protected — and that UI is `NOT BUILT`.
