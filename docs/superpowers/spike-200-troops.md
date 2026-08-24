# Slice 0 — the 200-troop phone measure

**Status: instrument READY, measurement NOT TAKEN.**
Created 2026-08-24. `BattleConfig.MAX_SOLDIERS` is still an unmeasured guess
until the results table at the bottom has a dated row in it.

This is the file `BattleConfig.luau` has been pointing at for weeks
("that is a finding to record in spike-200-troops.md, not a number to lower").

---

## What this measures, and what it cannot

Slice 0 in `docs/design/2026-08-23-battle-horses-living-city.md` asks for two
things on Adam's real phone: **the 200-soldier drill** and **the current
settlement**. They have different blockers, and only one of them is blocked.

| Half | Runnable on a phone today? | Why |
|---|---|---|
| 200-soldier drill | **YES** | `roblox/spike.project.json` speaks no HTTP — it needs nothing but Roblox |
| Settlement walkthrough | **No** | the real game reads `http://127.0.0.1:4178` (`shared/Config.luau`), and a published Roblox server cannot reach Adam's PC. Waits on roadmap 4.1 hosting |

The drill is the load-bearing half. The design doc names it directly: *"the
single riskiest assumption to test next: that the current build already holds
30fps with 200 soldiers on Adam's actual phone."*

## Why the spike can be trusted as the instrument

Until 2026-08-24 the spike drew plain `SmoothPlastic` boxes while the real
battle drew fabric, metal and wood — so a spike PASS would have been a floor,
not a measurement. It now draws the **same army the game draws**, and that is
enforced rather than remembered. `roblox/scripts/rules-check.luau` fails if:

- either the battle scene or the spike stops requiring shared `SoldierBuild`
- either one keeps a private copy of the soldier build
- the spike hardcodes its population instead of `BattleConfig.MAX_SOLDIERS`
- the spike builds soldiers server-side (the real game builds them on the
  client, so nothing replicates — a server-built spike would bill the phone for
  1,200 parts of replication the game never sends)
- the spike starts speaking HTTP (that is what keeps it phone-runnable at all)
- the spike reads a `BattleConfig` field that does not exist — a typo there
  reads as `nil`, the soldiers never march, and the spike reports a beautiful
  frame rate **for a still photograph**

All six were mutation-checked on 2026-08-24: each one was deliberately broken
and the matching rule fired.

## How to run it

**Build and publish (needs Studio, on the PC):**

```bash
rojo build roblox/spike.project.json -o roblox/TroopSpike.rbxlx
```

Then open `roblox/TroopSpike.rbxlx` in Studio, press Play once to confirm the
soldiers march and the meter reads, and publish it **private**
(File → Publish to Roblox As…). Private is not optional — the name question
(roadmap 4.4) is still open and nothing ships publicly before it is answered.

**Measure (on the phone):**

1. Join the place on the real phone.
2. Wait for the `WARMING UP` line to clear — the first 3 seconds are excluded
   on purpose, so shader and part streaming cannot libel the phone.
3. Wait until the detail line says `IN CONTACT`. A marching number is not the
   measurement; the clash is.
4. Read the three lines and write them into the table below.

The bottom line is written to be read aloud with no interpretation:

- `PASS — holds 30 fps at 200 soldiers`
- `FAIL — under 30 fps; about N soldiers is this budget`

## What to do with the answer

- **PASS** → set nothing; `MAX_SOLDIERS = 200` is now measured rather than
  guessed. Slices 1–4 of the design plan are unblocked.
- **FAIL** → set `BattleConfig.MAX_SOLDIERS` to the number the meter names.
  If that number is **below `MIN_SOLDIERS` (40)**, do NOT lower `MIN_SOLDIERS`
  to make it fit — under 40 the fight stops reading as an army. That case is a
  finding about the whole battle-presence design, and it goes back to Adam.

Either way the game keeps working in the meantime: the real scene culls
adaptively toward `TARGET_FPS` on its own. Slice 0 replaces a guess with
evidence; it does not rescue a broken build.

---

## Results

| Date | Device | Soldiers | Parts | avg fps | worst-1% | In contact? | Verdict |
|---|---|---|---|---|---|---|---|
| _(none yet)_ | | | | | | | |

> The instrument was built 2026-08-24 and its gates pass, but **nobody has read
> it on a phone yet.** Until a dated row sits above, every visual number in this
> project is still a guess, and this file must not be cited as a PASS.
