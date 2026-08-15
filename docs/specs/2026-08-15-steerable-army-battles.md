# Steerable Army Battles — Phase 2A

## Goal

Turn KingsAge's existing combat overlay into a playable mobile army scene without
turning every soldier into a directly controlled character or replacing the living
world simulation.

## Player control

- An attacking army is organized into three formations: **Vanguard**, **Archers**, and
  **Riders**.
- Soldiers choose and attack targets automatically.
- The player selects one formation and taps the battlefield to move its rally point.
- Formation placement affects a capped command bonus: coordinated contact, safe ranged
  spacing, and a wide cavalry flank are rewarded.
- Defending armies remain automatic and watchable. Village layout becomes the player's
  defensive control layer in the later visual-village phase.

## Retreat

- Retreat orders every surviving formation toward the home edge.
- Before contact, an army can withdraw cleanly.
- After contact, enemies continue attacking during disengagement and pursuit.
- Retreat completes only after the living formations reach safety (with a bounded
  fallback so a battle cannot hang).
- Returning troops continue through the existing world-map march system, preserving the
  rule that each troop exists in exactly one place.

## Technical shape

- Combat totals remain authoritative in `m.you` and `m.foe`; formation state only stores
  group membership, field position, target position, and engagement state.
- `battleRound()` remains the casualty engine. Field position gates when rounds can
  happen and supplies only a capped multiplier, so the Phase 1 balance model remains
  recognizable.
- `battleControl` is transient and excluded with the rest of battle-phase march state
  from local saves.
- The sandbox includes **Preview squad battle** for immediate manual testing.

## Verified 2026-08-15

- Inline JavaScript parses successfully and `git diff --check` passes.
- Mobile browser test at 390×844 showed all three selectable formations.
- Tapping the battlefield moved the selected formation's rally point.
- A pre-contact retreat returned all 33 preview troops with zero combat rounds.
- A retreat after contact stayed active for multiple rounds and returned 15 of 33 troops.
- A normal preview battle reached victory and the world-map return action.
- Browser console reported zero errors.

## Next playtest

Adam should play several real raids and judge whether steering feels useful rather than
busy. Tune formation speed, engagement range, command bonus, and pursuit losses from that
feel test before adding sound or richer art.
