# Conquest drills (slice C) — written procedures + results log

For `plans/2026-08-21-roblox-conquest-slice-c.md`. Dated PASS/FAIL with the
actual observation when run. Evidence, not vibes.

Drills are numbered **D1–D7** because C1–C6 already belong to the battle scene
(`drills-battle-scene.md`).

**Offline half, already green** — and unusually complete for a slice this size:

| Gate | Result |
|---|---|
| `npm run test:roblox-layer` | 39/39, of which **10 are conquest** |
| `npm run test:gate-d` | 19 core + 53 server + all four checkers |
| `npm run check:luau` | 21 files compile |
| `npm run check:luau-rules` | 14 shared rules, incl. the army that marches |

**Lune works.** Earlier handoffs say it is not installed on this PC. That was
wrong — the session that checked had a stale PATH. `npm run check:luau` runs
from any fresh terminal, and `check:luau-rules` now RUNS the shared Luau rather
than only parsing it.

**Hands-free shortcut — and you MUST use `-Fresh`:**

```powershell
powershell -ExecutionPolicy Bypass -File roblox\start-dev.ps1 -Fresh
```

`-Fresh` starts the world server against a brand-new database file. **Without it
these drills fail silently.** `seedWorld()` returns early when a world already
exists, so `KINGSAGE_DEV_SEED_NOBLES=5` only takes effect at world *creation* —
against the existing dev world the NOBLEMEN section reads 0, the demo tour sends
an ordinary raid, and conquest never fires. Verified 2026-08-22: a fresh world
seeds 5 Noblemen into all 6 villages; the pre-existing dev world has 0.

`-Fresh` leaves your existing dev world untouched on disk — it simply points the
server at a new timestamped file. Then one press of Play walks D1–D3 with nobody
at the keyboard.

---

## What a conquest costs — read this before running anything

Conquest is a **long commitment by design**, and the drills below will feel
wrong if you expect otherwise:

- A village starts at **loyalty 100**.
- Each Nobleman who **survives a won attack** knocks off **20–35**, seeded from
  the battle, so a replay always gives the same number.
- Therefore a village takes **3–5 landed Noblemen** — usually across several
  waves, because a village can only hold so many at once.
- A Nobleman costs **2800 wood / 3000 stone / 3500 iron** and **900s**, and
  needs an **Academy level 1**. One is consumed outright when the village falls.
- Loyalty **persists between attacks**, which is what makes waves work. This is
  proven offline: *"a village at full loyalty falls to a campaign of waves."*

⚠️ **A fresh kingdom cannot conquer anybody yet.** Every fixture village —
including the two renamed "Unclaimed Hold" — carries the same 30 spear / 12
sword / 10 archer garrison behind the same wall, so a starting army attacking a
peer **loses** (the 2026-08-21 live run: *"Defeat. 2 survivors are returning
home."*). That is why the dev seed knob exists. Whether the game should have a
weak neutral on-ramp is an open design question — see the handoff.

---

## Drill D1 — A nobleman can be raised at all

1. `roblox\start-dev.ps1`, press Play.
2. Walk to the war table, open it, switch to the **War** tab.
3. Find the **NOBLEMEN** section.

**PASS when:** the section shows a count on hand. With the dev seed it reads
`NOBLEMEN · 5 on hand`. With the knob unset it reads `0` and offers
**Recruit 1 Nobleman**, and pressing it either queues or gives an honest
refusal naming the Academy or the cost — never "The realm didn't answer."

**FAIL if:** the section is missing, the count disagrees with the Village tab's
army, or a refusal is silent.

Result: **2026-08-22 — PARTIAL (server side PASS, by-eye half unverified).**
Adam pressed Play; the self-driving tour ran unattended. The world database
confirms the home village held **5 Noblemen** and that the tour read them, so
the seed and the count are real. **What is NOT verified is the NOBLEMEN section
itself** — the tour drives commands, not the war-table UI, and nobody has
recorded what the panel showed. Still needs eyes.

---

## Drill D2 — Declaring a conquest changes what marches

1. In the **War** tab with Noblemen on hand, read the toggle row. It should say
   **"Raid: noblemen stay home."**
2. Press **Ride**. It becomes **"Conquest: noblemen ride,"** the note changes to
   the loyalty explanation, and every neighbour's attack button relabels from
   **Attack** to **Conquer** (and turns gold).
3. Read the **ATTACK PLAN** note. It must now say a nobleman rides.
4. Press **Conquer** on a scouted village. Read the toast.

**PASS when:** the arming toast names both numbers — *"Tap again to send N
troops and M nobleman at X — this is a conquest."* — and the button reads
**CONQUER?**.

**FAIL if:** the toggle does not change the button, the counts disagree with the
NOBLEMEN and muster numbers, or the toast still says a plain raid.

Result: **2026-08-22 — PASS (command path), by-eye half unverified.**
The tour sent `march.launch` with `withNobles = true`, and the world server
recorded the marching army as **`noble: 5`** alongside 30 spear / 12 sword /
10 archer. `command.accepted`. **This is the first time in this project's life
that the conquest path has been reached in a live session** — before slice C it
was unreachable code, because `ATTACK_MUSTER_EXCLUDES` kept Noblemen home on
every attack. The declaration travels and the muster obeys it.
**Unverified:** the arming toast wording and the Attack→Conquer relabel.

---

## Drill D3 — Arming does not survive a change of meaning

**This is the one that protects a 9,000-resource unit from a fat finger.**

1. With Noblemen on hand and the toggle **off**, press **Attack** on a target
   (it arms, reading **SEND?**).
2. Without tapping again, press **Ride** to turn conquest on.

**PASS when:** the attack **disarms** — the button goes back to reading
**Conquer**, not **CONQUER?**. The second tap must never inherit a meaning the
first tap did not arm.

**FAIL if:** the button still reads SEND?/CONQUER? and one more tap sends
Noblemen the player armed a raid for.

Result: **2026-08-22 — FAIL, and the cause is arithmetic, not code.**
The conquest attack landed and resolved: **winner `defender`**. All five
Noblemen died, the target's loyalty stayed at **100**, and no village changed
hands. `applyConquest` was never reached because it is gated on
`outcome.winner === "attacker"`.

**Why it lost, measured from the live rows:**

| | attack | defence |
|---|---|---|
| Attacker: 30 spear, 12 sword, 10 archer, 5 noble | **875** | — |
| Defender: same garrison + 4 scouts + 5 noble, wall 1 | — | **1,828** |

Ratio **0.48** — it could not have won under any plan or dice.

**The root cause is that an attack musters the whole garrison, and the garrison
is made of defensive troops.** Spearmen defend at 25 and attack at 10; archers
defend at 40 and attack at 15. Sending the village's whole army at a mirror-image
village means sending defensive units on offence against their own better half.
Every fixture village carries the identical stack, so this is structural, not
bad luck.

**Two things this rules OUT as the cause:**
1. **Not the seeded Noblemen.** They added 175 of the defender's 1,828. Removing
   them entirely still leaves 1,631 against 875.
2. **Not the old combat model.** Re-run through the new `combat.ts` engine, the
   same armies still lose (4,700 attack vs 8,644 infantry defence). The
   three-class rewrite does not rescue a defensive army sent on offence — and it
   should not.

**What WOULD take that village, per the new engine:** **60 Berserkers + 5 Counts
wins and brings 2 Counts home.** 120 brings 4 home. That is an achievable
starting army, and it is the shape of the answer: conquest needs an *offensive*
army, not a bigger one.

**Recommended fix before the next Play press:** give the dev world's home village
an offensive stack (Berserkers) rather than a mirror of the defensive fixture,
so D5 can actually complete on camera. This is a dev-seed change only. — loyalty never moved, because the battle was lost before loyalty could be touched. Blocked behind D5. — requires a human at the toggle. The tour never arms a
raid and then flips conquest on, so the disarm rule is untested in play.

---

## Drill D4 — Loyalty falls, and says so

1. Send a conquest at a village you have scouted and can beat.
2. Let it land (attend it, or let the deadline settle it).
3. Read the notification and the **BATTLE REPORTS** section.

**PASS when:** on a win with a surviving Nobleman, the realm reports
*"Loyalty in X fell to N"* — and N is **below 100 and above 0** the first time.
A second wave lowers it again from where the first left it, rather than
restarting at 100.

**FAIL if:** loyalty resets between attacks (waves would then be pointless), or
a **defeat** or a **retreat** moves it at all.

Result: _not yet run_

---

## Drill D5 — The village changes hands, and the celebration fires

1. Keep sending waves until loyalty reaches zero.

**PASS when, all of it:**
- a gold banner animates in reading **"<Village> is yours"**;
- fireworks burst and coins tumble around you;
- **a Skip button is present**, and pressing it clears everything instantly —
  banner, fireworks and coins, with no stragglers bursting afterwards;
- if you do not skip, it clears itself after about 8 seconds;
- **it never blocks you**: you can walk, and a ProximityPrompt under the banner
  still triggers, while it is playing.

**FAIL if:** anything survives the Skip, the banner eats a prompt tap, the
camera moves, or the character freezes.

Result: _not yet run_

---

## Drill D6 — Walk in through the gate you just took

**The drill the plan calls the one that matters.**

1. After D5, wait one heartbeat (10s) for the next sync.
2. Walk to the village you took.

**PASS when:** it has re-rendered from a fog silhouette into a **full walkable
holding** — real buildings with prompts, its wall, its gate — and the war
table's Village tab can select it. The War tab no longer lists it as a foreign
target.

**FAIL if:** it stays a silhouette, keeps zero prompts, or still appears as
somebody else's village after a sync.

Result: _not yet run_

---

## Drill D7 — Rejoining does not replay the party

1. After conquering, leave the session and rejoin.

**PASS when:** the celebration does **not** fire on join. You already own the
village; the join snapshot is a statement of what you hold, not news.

**FAIL if:** the banner plays again for a village you took minutes ago — the
ownership seed is broken and every rejoin will replay your whole history.

Result: _not yet run_

---

## Run log

**2026-08-22, ~17:33–17:39 — first conquest run.** Adam pressed Play; the
self-driving tour ran unattended against the seeded world
(`kingsage-drill-20260822-164344.sqlite`). Evidence read directly from the world
database, not from the screen.

**What the server recorded:** 4 marches (3 scout, all `complete`; 1 attack that
became a battle), 3 stored scout reports, 1 battle `resolved`, 13 commands.

**Headline: the conquest command path works end to end; the battle was lost.**

**Two defects found in passing, neither previously known:**
1. **`battle.order` rejected with `WORLD_VERSION_CONFLICT`.** The tour issued
   three field orders; only ONE landed (`orderBonus 0.02` confirms it). One was
   refused because the world version ticked between reading and sending, and the
   next was refused `BATTLE_CLOSED`. **This is the same family as the
   `state_version` defect fixed in slice B** — an optimistic-concurrency check
   rejecting a legitimate order because the world moved underneath it. A player
   giving orders in a live battle will hit this.
2. **`village.build.queue` refused `QUEUE_FULL` three times.** The tour re-queues
   blindly while a job is running. Harmless, but it is noise in the log that
   would mask a real refusal.

