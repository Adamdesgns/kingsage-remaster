# HANDOFF: Slice 0 — publish TroopSpike + take the phone measurement

> Written 2026-08-28 for the NEXT CLAUDE SESSION (a normal interactive
> chat). **Read `docs/AI-TEAM-BRIEFING.md` first — it is binding and this
> sits on top of it.** The previous session was a scheduled-type run whose
> permission system refused Studio computer-use four times ("can't be
> approved during a scheduled run") — that is the ONLY reason this handoff
> exists. A normal chat can request Studio access; do that first thing.

## State when this was written

- Branch: `feat/slice0-phone-measure`, checked out locally, pushed, tip
  `480e5aa` (2 commits ahead of `origin/main`). Working tree clean except
  untracked `server/server/` (throwaway capture DBs, ignore).
- All gates green and verified this afternoon: `test:server` 89/0,
  `check:types` clean, `test:luau` = 26 files / 27 rules / **7 sim
  checks** (the sim harness `roblox/scripts/spike-sim-check.luau` is new —
  it loads the real spike client headlessly and proves the armies march,
  clash and die; it is wired into `test:luau`).
- `roblox/TroopSpike.rbxlx` was rebuilt from this branch at ~16:35 on
  08-28 and **Roblox Studio is (or was) open with it**, sitting at the
  **Publish Experience dialog**. Adam may or may not have already clicked
  Create — CHECK before assuming. If Studio was closed in between,
  reopen `roblox/TroopSpike.rbxlx` (rebuild first if the branch moved:
  `rojo build roblox/spike.project.json -o roblox/TroopSpike.rbxlx`).
- A stale world server listens on port 4178 from days ago (node PID was
  23392). Irrelevant to the spike (it speaks no HTTP). Leave it unless
  Adam says otherwise.

## What the spike is

The Slice 0 phone measure — ship/no-ship gate for every visual slice in
`docs/design/2026-08-23-battle-horses-living-city.md`. Full context,
procedure, and the honesty rules live in
`docs/superpowers/spike-200-troops.md`. Read it before acting. Short
version: it renders `BattleConfig.MAX_SOLDIERS` (200) soldiers from the
SAME shared `SoldierBuild` the real battle uses, client-side, no HTTP,
and shows an on-screen meter whose bottom line literally says PASS or
FAIL. It can be published and joined from a phone with no world server.

## Tasks, in order

1. **Request Studio computer-use access** (normal chats can). Take a
   screenshot before assuming any state.
2. **Publish, if Adam didn't already finish it.** The dialog values:
   Name `TroopSpike`, description empty, Creator Me, Devices as-is
   (Phone checked), **Data Sharing OFF** (Adam's call, already agreed),
   Team Create either way → Create. It publishes PRIVATE by default —
   private is mandatory; the name question (roadmap 4.4) is open and
   NOTHING ships public.
   - If it was already published, don't publish a second copy — use
     "Update existing experience…" if a republish is ever needed.
3. **Run it once in Studio (F5).** Two armies — red vs blue, mail and
   spears, NOT plastic boxes — must march, clash, swing, and fall, with
   the meter reading at top. This is the first time any human eyes see
   it run; the previous session could only prove it headlessly. If
   anything is wrong, STOP and report; do not publish a broken
   instrument.
4. **Kids as testers** (Adam asked for this explicitly): Game Settings →
   Permissions → Collaborators → add with **Play** access:
   `Adamsaking` (Keegan), `OrionTheDestroyer15` (Orion), `Airasecret`
   (Aria). They must be on Adam's friends list to appear in search.
   The spike has no allowlist logic of its own — Permissions is the only
   gate, and it must stay locked to Adam + these three.
5. **The measurement.** Adam (and optionally each kid) joins on a real
   phone, waits past `WARMING UP`, waits for `IN CONTACT`, and reads out:
   avg fps, worst-1% ms, and the PASS/FAIL line. One row per device in
   the Results table of `docs/superpowers/spike-200-troops.md`, dated,
   with device model. **The weakest family device is the number that
   matters.**
6. **Act on the answer** (rules already written in spike-200-troops.md):
   PASS → `MAX_SOLDIERS = 200` stands, now measured; Slices 1–4 unblock.
   FAIL → set `BattleConfig.MAX_SOLDIERS` to the meter's number; if that
   number is below `MIN_SOLDIERS` (40), do NOT lower MIN_SOLDIERS — that
   outcome goes back to Adam as a design finding.
7. **Close out:** commit the results row (and any MAX_SOLDIERS change)
   to this branch, run all gates, push. Merge to `main` only on Adam's
   word, per the briefing. Vault ritual: Daily bullet, hub
   `status`/`next`, Open Loops row 165.

## Honesty bar (repo rule 3, restated because it bit before)

The results table row must contain numbers read off a real phone screen
by a human. No estimate, no Studio-desktop number in a phone row, no
"probably fine". A Studio-run frame rate may be recorded ONLY in a row
clearly labeled as the desktop, and it does not satisfy Slice 0. If the
measurement doesn't happen, the table stays empty and Slice 0 stays open
— say so in the handback rather than dressing it up.

## Also pending in this repo (don't pick these up unless Adam says)

- `feat/battlefield-banners-boxie` — held, needs a Studio look at a
  battle, then merge/bounce (same Studio session is a good moment).
- Adam owes: slice-order approval, THE NAME.
- Bot handoffs for roadmap 2.3 / 2.4 / 2.5 / 4.5 — offered, not yet
  commissioned.
