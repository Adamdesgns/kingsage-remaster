# KingSage mobile rebuild — design QA

## Evidence

- Selected visual direction: `qa/selected-direction-3.png` (853 × 1844)
- Verified implementation state: `qa/battle-outer-wall.png` (274 × 592, cropped from the template-owned iPhone preview)
- Side-by-side comparison input: `qa/reference-comparison.png` (1147 × 1260)
- Battle art: `public/art/battle-1-outer-wall.png`, `battle-2-lower-ward.png`, and `battle-3-citadel.png`

## Visual comparison

The combined comparison preserves the selected direction's portrait siege composition, readable blue army, warm stone and fire palette, compact top status HUD, and bottom formation command bar. The implementation adds the requested player-facing controls: direct formation markers, plan readout, enemy objective, three-scene campaign status, and a functional retreat action.

Intentional differences from the source mock:

- The single mock battle is now the first of three connected scenes.
- The battlefield contains larger armies and explicit formation selection markers rather than a decorative movement arrow.
- The command bar uses generated original KingSage troop portraits and live troop counts.
- Planning choices affect command strength, orders required, army composition, and losses between scenes.

No broken crops, placeholder art, horizontal overflow, unreadable labels, or missing primary controls were found in the final mobile state.

## Interaction verification

- Changed time of attack from Dawn to Night; the selected state updated and command strength changed from High to Steady.
- Began the assault from the planning screen.
- Selected Vanguard directly on the battlefield.
- Tapped a battlefield destination; the formation moved and progress advanced from 28% to 52%.
- Completed the Outer Wall objective and advanced to Battle 2, Lower Ward.
- Opened and resumed the pause menu.
- Used Retreat and confirmed return to the planning screen.
- Browser console warnings/errors: 0.
- `npm run build`: passed.
- Protected mobile runtime integrity check: passed (28 files).

## QA history

1. Initial functional build matched the selected 3D siege direction but the attack-plan summary did not change with the player's choices.
2. Added strategic plan scoring, dynamic summary text, variable field-order requirements, troop composition changes, and scene-to-scene losses.
3. Rebuilt and repeated the primary mobile interaction path with no runtime errors.
4. Captured the final selected-formation state and compared it with the visual source in one side-by-side image.

final result: passed
