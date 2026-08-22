# Battle drills (slice A) — written procedures + results log

Companion to `drills-slice-one.md` and `drills-scouting.md`, for
`plans/2026-08-21-roblox-battles-slice-a.md`. Every drill gets a dated
PASS/FAIL line with the actual observation when run. Evidence, not vibes.

**Slice A is the attack round-trip, not the battle scene.** There is no 3D
fight, no live squad command, no replay, and no conquest — those are slice B
and are gated on the 200-troop phone measurement. What these drills check is
that an attack can be planned, sent, resolved, and read.

**Hands-free shortcut.** The self-driving demo tour runs S1–S3 and B1–B3 by
itself: it scouts, reads the report, plans a real attack, sends it, wanders
while nobody attends, and comes back to the table for the battle report card.
`roblox\start-dev.ps1` sets `KINGSAGE_AUTO_RESOLVE_MS=25000` so an unattended
attack settles inside a recording instead of the production two-minute wait.

The offline half is already green and needs no Studio:
`npm run test:roblox-layer` 23/23 (7 of them the battle round-trip through the
real API routes) and `npm run test:core` 19/19 (8 the surrender rule).


> ## FIRST FULL STUDIO RUN — 2026-08-21, 22:10–22:15
>
> Claude drove Studio (screen access granted for this). One press of Play, the
> self-driving tour, nobody at the keyboard. Two fatal defects were found and
> fixed to get here (`2d32422`): **every player spawned in the void and fell
> forever**, and **every village command posted an empty villageId**. Neither
> was findable offline. Server log from the clean run:
>
> ```
> 22:11:28 accepted scout          22:12:35 accepted battleOrder (x3)
> 22:12:00 accepted attack         22:12:48 accepted battleResolve
> 22:12:30 accepted battleOpen     22:13:27 refused build: cannot afford
> ```
>
> World database after it: scout report on Ember Crown Keep observing **30
> spearmen**; battle **resolved**, winner defender, **orderBonus 0.06 from 3
> orders**; notification *"Defeat. 2 survivors are returning home."*; return
> march complete.


---

## Drill B1 — The plan is real, and the button cannot lie

1. War tab → **ATTACK PLAN**. Tap each of the four rows.
2. Read the note above them.

**Expected:** each row cycles through exactly the values the world server
accepts (Approach: West Ridge / Main Breach / East Woods; Formation: Vanguard
Heavy / Balanced Army / Cavalry Wing; Timing: Dawn / Midday / Night; Style:
Siege Push / Flanking Strike / Full Assault). The note states the muster —
every fighting troop in the village, scouts and noblemen excluded — and the
number matches the garrison you actually have.

- Result: **PASS 2026-08-21.** The attack carried the plan chosen at launch; the battle row stored it and was fought under it.

## Drill B2 — You cannot attack blind, and you cannot attack by accident

1. Find a neighbour you have NOT scouted. Tap **Attack**.
2. Now take one you HAVE scouted. Tap **Attack** once. Wait 10 seconds. Look at
   the button. Tap it once more, then again quickly.

**Expected:** the unscouted target refuses with *"Scout them first — nobody
attacks blind."* and nothing leaves. The scouted one arms on the first tap
(button reads **SEND?**, toast names the troop count and the target), disarms
itself after about six seconds back to **Attack**, and only a second tap while
armed actually sends — *"The army marches."*

- Result: **PASS 2026-08-21 (scouted half).** The attack was accepted only after the scout report existed: `accepted attack` at 22:12:00, 32 seconds after the report landed. The two-tap arming is client-side and was bypassed by the tour, so that half is still by hand.

## Drill B3 — An attack nobody attends still fights and comes home

1. Send the attack. Walk away from the table. Do not touch anything.
2. Watch the HUD queue panel and wait.

**Expected:** an `Army → <village>` countdown appears, runs out, and then —
with no input at all — a toast reads **Victory** or **Defeat** at that village,
a card appears under **BATTLE REPORTS** with both casualty lists, and an
`Army returning` countdown starts. When it lands, the survivors are back in
your garrison. **This is the whole point of the slice: the army is never
parked outside a wall waiting for you.**

- Result: **SUPERSEDED 2026-08-21 by the attended path.** The tour attended instead of waiting out the deadline, so this run proves the attend route (drills C1–C4). The unattended deadline path remains covered offline by `roblox-battles.test.ts` and is still owed by hand.

## Drill B4 — The report reads the same from both ends

1. With two players (or two Roblox accounts), have one attack the other.
2. Read **BATTLE REPORTS** on both sides.

**Expected:** attacker sees *"… attack on <village>"*, defender sees
*"… defence of <village>"*, the verdict is inverted between them, and each
side's "Your losses" is the other side's "Their losses". Both get a battle
notification.

- Result: _NOT YET RUN_

## Drill B5 — Surrender moves soldiers, it does not create them

Needs a lopsided fight: a large army against a garrison that cannot hold but is
big enough to have survivors (a token 2-man garrison is simply wiped — that is
the loss cap working, not a bug).

1. Note your garrison count. Send an overwhelming attack.
2. Read the battle report and then your garrison when the army returns.

**Expected:** the report says *"N soldiers surrendered and now serve you"*, and
when the march lands your garrison has grown by exactly N above the survivors
who left. The defender's village still belongs to them — **slice A does not
conquer anything.**

- Result: _NOT YET RUN_

## Drill B6 — A battle that starts while you are away still finds you

1. Get an attack in flight, then leave the place entirely.
2. Rejoin after it must have resolved.

**Expected:** the battle report is waiting in the War tab, and **no** verdict
toasts fire on arrival — toasts are only for battles this client has not seen,
and the first snapshot after a join seeds that set silently.

- Result: _NOT YET RUN_
