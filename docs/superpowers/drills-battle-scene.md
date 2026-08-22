# Battle-scene drills (slice B) — written procedures + results log

For `plans/2026-08-21-roblox-battles-slice-b.md`. Dated PASS/FAIL with the
actual observation when run. Evidence, not vibes.

**These drills carry the measurement the project has been missing.** The
200-troop spike has never been measured on a phone, so slice B ships with an
adaptive budget instead of a known one. Drill C5 is where that number finally
gets written down — run it and put the result in
`docs/superpowers/spike-200-troops.md`.

**Hands-free shortcut.** The demo tour attends by itself: opens the battle,
takes the field, issues three real squad orders, calls the charge, and watches
the ending. `roblox\start-dev.ps1` then Play covers C1–C4.

Offline half, already green: `npm run test:roblox-layer` 29/29 (6 on the
attend loop), `npm run test:core` 19/19, `npm run test:gate-d` 43/43.

---

## Drill C1 — The call to the field

1. Send an attack. Wait for the countdown to run out.

**Expected:** a red banner appears under the resource bar — *"⚔ Your army waits
at &lt;village&gt;"*. Tapping it opens the battle; the banner then reads *"Take
the field at &lt;village&gt;"* and tapping again drops you into the overhead
battle camera. The same army also shows in the War tab's ON THE MARCH section
with a **Take field** button.

- Result: _NOT YET RUN_

## Drill C2 — Two armies, and nobody dies yet

1. Take the field and just watch for thirty seconds.

**Expected:** two coloured armies (red attacker from the south, blue defender at
the gate) in blocks, walking toward each other, meeting in the middle and
swinging. **No casualties at all** — the battle is still open, so nothing has
been decided and the scene must not pretend. The panel counts *"0 orders
carried (+0%)"* and shows how many bodies are on the field.

- Result: _NOT YET RUN_

## Drill C3 — Orders move squads and buy a bonus

1. Tap **Vanguard**, then tap a spot on the ground. Repeat for Archers and
   Riders, at different spots.

**Expected:** each tap toasts *"Order carried."*, the named squad's blocks walk
to where you tapped keeping their spacing, and the panel's counter climbs —
*"3 orders carried (+6%)"*. Orders after the twelfth stop adding bonus (the cap)
but are still accepted.

- Result: _NOT YET RUN_

## Drill C4 — The ending is the maths, not the movie

1. Tap **Charge**. Watch.
2. Then step off, open the War tab, and hit **Watch it play out** on the report.

**Expected:** on the charge, bodies fall on both sides in proportion to the
casualties, the loser routs off the field, and the battle report card matches
what you just watched — same verdict, same losses. The replay plays the same
fight from the same seed. **If the numbers on the card and the bodies on the
field ever disagree, that is a real bug: the card is right.**

- Result: _NOT YET RUN_

## Drill C5 — THE MEASUREMENT (this is the one that has been owed for weeks)

1. Publish the demo place PRIVATE and join from a real mid-range phone.
2. Get into a battle with a large army on both sides.
3. Watch the body count in the panel while the fight runs.

**Record, in `docs/superpowers/spike-200-troops.md`:** the phone model, the
starting body count, whether the adaptive budget culled (the panel's count
drops when it does), where it settled, and whether it stayed watchable. Then
set `BattleConfig.MAX_SOLDIERS` from the result.

**Expected:** it holds at or above `MIN_SOLDIERS` (40) and never stutters —
because when it cannot hold `TARGET_FPS` (30) it culls instead. If it settles
near 40 on a normal phone, that is a finding worth acting on, not a number to
quietly lower.

- Result: _NOT YET RUN_

## Drill C6 — Falling back, and the intel rule

1. Open a battle and tap **Fall back** instead of charging.
2. Separately: scout a village, wait a long while (let its barns fill), then
   send an attack and try to take the field.

**Expected:** the retreat toasts *"Falling back."*, survivors come home, and the
defender's garrison is untouched. And the second case **opens fine** — a
defender merely earning resources is not a reason to re-scout. Reinforcing
their garrison IS: that refuses with *"They have changed since your report —
scout again before you commit."*

- Result: _NOT YET RUN_
