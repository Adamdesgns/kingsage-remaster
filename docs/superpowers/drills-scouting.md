# Scouting drills — written procedures + results log

Companion to `drills-slice-one.md` for the scouting slice
(`plans/2026-08-21-roblox-scouting-slice.md`). Every drill gets a dated
PASS/FAIL line with the actual observation when run. Evidence, not vibes.

The automated half that CAN be checked from inside a running server lives in
`roblox/scripts/evidence-run.luau` (paste as a ServerScript — **never** the
Studio command bar). Everything below is by hand because it is UI and feel,
which no server script can see.

**Hands-free shortcut for S1–S3.** The self-driving demo tour
(`roblox/demo/DemoTour.client.luau`, demo place only) now runs the whole
scouting leg by itself: it opens the war table, switches to the War tab, sends
a real scout at the nearest neighbour, wanders while the HUD countdown runs,
and comes back to the table for the report card. So **one press of Play
produces video of S1–S3** with nobody at the keyboard — which matters, because
three slices in a row have now stalled waiting for a human to tap something.
It sends the scout through the same RemoteFunction the button calls (a script
cannot fire another script's `Button.Activated`), so the command path and every
view are real and only the finger is simulated. S4–S6 still need hands.

**Setup:** as slice one — world server up on 4178 with
`KINGSAGE_ROBLOX_KEY=dev-secret-local-0001`, `SecretConfig.luau` matching,
Rojo synced, Play (the ▶ button; F5 is a brightness key on Adam's laptop).

The offline half of this slice is already proven and does not need Studio:
`npm run test:roblox-layer` → 16/16, including a test that the same snapshot
which carries a scout report still shows that village fogged.

---

## Drill S1 — The War tab tells the truth about neighbours

1. Walk to the war table, trigger it, tap **War**.
2. Read the header, the target list, and every row.

**Expected:** header reads `SEND SCOUTS · N on hand` where N matches the
starting garrison (the fixture starts each village with 4 scouts). Every
foreign village in the world is listed, nearest first, each showing its name,
its owning realm, and a tile distance. **No row anywhere shows a foreign
building level, resource amount, or troop count** — that is the fog, and it
must hold before any report exists.

- Result: _NOT YET RUN_

## Drill S2 — Sending scouts costs real scouts

1. From the War tab, tap **Scout** on the nearest neighbour.
2. Watch the toast, the header count, the War tab, and the HUD queue panel.

**Expected:** toast *"Scouts are away."*; the on-hand count drops by exactly
one on the next sync (≤10s); a countdown row appears under **ON THE MARCH**
reading `Scouts → <village> — m:ss`, and the same march also appears in the
HUD queue panel on the right. Both countdowns tick down together.

- Result: _NOT YET RUN_

## Drill S3 — The report is the only intel

1. Wait for the march countdown to reach zero (scout marches are short:
   `max(8, 8 + distance*0.8)` seconds).
2. Read the toast, then the **SCOUT REPORTS** section.

**Expected:** toast *"Scouts are back from &lt;village&gt;."* exactly once. A
report card shows the target's name and realm, its real garrison listed troop
by troop (zero-count troops omitted, never printed as "0"), its real
Wood/Stone/Iron, its real Rampart and Headquarters levels, and an age
(`just now` → `N min ago`). The march row flips to `Scouts returning from
<village>` with a fresh countdown.

Then check the fog again: **nothing outside that card** — not the target list,
not the world, not the silhouette — shows any of those numbers.

- Result: _NOT YET RUN_

## Drill S4 — Double-tap cannot send two waves

1. Hammer the same **Scout** button five times as fast as possible.

**Expected:** exactly ONE march, on-hand scouts drop by exactly one. The
extra taps either return the first result silently or say *"Still carrying out
your last order."* — never a second departure, never a second charge. (The
server-side half of this is already covered offline: a replayed commandId
returns the stored result and sends no second wave.)

- Result: _NOT YET RUN_

## Drill S5 — Out of scouts is honest, not broken

1. Send scouts until the village has none left (or seed it to zero).
2. Open the War tab.

**Expected:** every target's button reads `—` and greys; tapping one toasts
*"No scouts in this village — recruit some first."* and sends nothing. A note
explains scouts are trained at a Stable level 1, and a **Recruit 2 Scouts**
row appears. With no Stable built, tapping it shows the world server's own
refusal (*"Requires Stable level 1."*) — the client never invents that message
and never pretends the order went through.

- Result: _NOT YET RUN_

## Drill S6 — Reconnect does not replay history

1. With at least one scout report already in hand, leave the place and rejoin.

**Expected:** the reports are still there in the War tab, and **no** "Scouts
are back from…" toasts fire on arrival — the toast fires only for a report id
the client has genuinely not seen before, and the first snapshot after a join
seeds that set silently.

- Result: _NOT YET RUN_
