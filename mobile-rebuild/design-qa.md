# KingSage mobile rebuild — design QA

## Evidence

- Selected visual direction: `qa/selected-direction-3.png` (853 × 1844)
- Verified scouting state: `qa/scout-outer-wall.png` (282 × 614, cropped from the template-owned iPhone preview)
- Scouting comparison input: `qa/scout-reference-comparison.png` (1150 × 1300)
- Verified implementation state: `qa/battle-outer-wall.png` (274 × 592, cropped from the template-owned iPhone preview)
- Side-by-side comparison input: `qa/reference-comparison.png` (1147 × 1260)
- Battle art: `public/art/battle-1-outer-wall.png`, `battle-2-lower-ward.png`, and `battle-3-citadel.png`
- Live combat state: `qa/live-outer-wall.png` (393 × 852, exact CSS-pixel capture of the template-owned iPhone screen)
- Live combat comparison input: `qa/live-battle-reference-comparison.png` (826 × 930)
- Live combat art: `public/art/outer-wall-empty.png`, `outer-wall-breached.png`, `unit-vanguard.png`, `unit-archer.png`, `unit-rider.png`, and `unit-defender.png`

## Visual comparison

The combined comparison preserves the selected direction's portrait siege composition, readable blue army, warm stone and fire palette, compact top status HUD, and bottom formation command bar. The implementation adds the requested player-facing controls: direct formation markers, plan readout, enemy objective, three-scene campaign status, and a functional retreat action.

The scouting comparison uses the same battlefield art and phone viewport as combat. The reconnaissance layer keeps the close siege composition visible while adding four readable defense markers, a threat/counter dossier, lane risks, and one gated primary action. The dark teal and copper interface continues the selected direction without obscuring the target layout.

Intentional differences from the source mock:

- The single mock battle is now the first of three connected scenes.
- The battlefield contains larger armies and explicit formation selection markers rather than a decorative movement arrow.
- The command bar uses generated original KingSage troop portraits and live troop counts.
- Planning choices affect command strength, orders required, army composition, and losses between scenes.
- Scouting is a new required state before planning; it reuses the real Outer Wall battlefield rather than presenting a separate abstract map.
- The finished Outer Wall scene is a real-time Phaser simulation rather than a short staged transition: 40 player troops fight a 46-defender garrison, including two reinforcement waves.
- Every live unit has individual health, movement, target selection, attack timing, damage, death, and crowd separation. Archers and towers fire visible projectiles; melee units lunge; the gate has 2,000 HP and changes to a breached scene when destroyed.

No broken crops, placeholder art, horizontal overflow, unreadable labels, or missing primary controls were found in the final mobile state.

## Interaction verification

- Identified all four defenses on the actual Outer Wall layout; the counter advanced from 0/4 to 4/4 and the attack-plan action unlocked.
- Selected East Woods during scouting; the planning screen opened with `4 defenses mapped` and East Woods already selected as the entry position.
- Used Review battlefield; the completed scouting state and selected lane were preserved when returning to the map.
- Reopened the plan and launched Battle 1; the selected lane, Dawn timing, and Flanking Strike appeared in the live order ribbon.
- Changed time of attack from Dawn to Night; the selected state updated and command strength changed from High to Steady.
- Began the assault from the planning screen.
- Selected a squad directly on the battlefield and from the persistent command bar.
- Tapped a battlefield destination; only the selected squad redirected while the remaining army continued fighting.
- Ran the full enlarged fight to victory in 38 seconds: all 46 defenders cleared, the gate destroyed, and 25 of 40 player troops survived.
- Opened and resumed the pause menu.
- Used Retreat and confirmed the live units withdrew before returning to the planning screen.
- Browser console warnings/errors: 0.
- `npm run build`: passed.
- Protected mobile runtime integrity check: passed (28 files).
- Build warning: Phaser currently ships in the initial bundle, producing Vite's chunk-size warning; this is a performance follow-up, not a functional failure.

## QA history

1. Initial functional build matched the selected 3D siege direction but the attack-plan summary did not change with the player's choices.
2. Added strategic plan scoring, dynamic summary text, variable field-order requirements, troop composition changes, and scene-to-scene losses.
3. Rebuilt and repeated the primary mobile interaction path with no current runtime errors; the only captured console error was a transient Vite hot-reload mismatch while the PlanningScreen signature changed, cleared by a full reload.
4. Captured the final selected-formation state and compared it with the visual source in one side-by-side image.
5. Added scouting, captured the completed 4/4 state, and compared it beside the selected direction at the same portrait gameplay scale.
6. Replaced the staged battle transition with a live Phaser combat scene and original transparent troop assets.
7. Increased the opening assault from 28 troops/34 total defenders to 40 troops/46 total defenders after the first exact-size comparison showed the force still read too small.
8. Rebuilt, captured the exact 393 × 852 live phone state, compared it beside the selected direction, and completed a fresh 38-second victory run with no browser errors.

final result: passed
