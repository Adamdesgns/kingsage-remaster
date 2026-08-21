# Slice-one drills — written procedures + results log

> **Live evidence, 2026-08-21 (recorded on video):** first real Studio play
> session ran the full loop — `session open for Dadisaking86 (kingdom
> kingdom-5, created=true)`, grey-box settlement built from live state, HUD
> showing real resources (Wood 1389 / Stone 1374 / Iron 1404), a REAL
> accepted `village.build.queue` command with its server countdown on screen
> ("Timber Camp → Lv 2 — 10:33"), self-driving demo tour active. Recording:
> 95s captured by Claude via ffmpeg, delivered to Adam. The five formal
> drills below remain to be run as written.

Every drill gets a dated PASS/FAIL line with the actual observation when run.
Evidence, not vibes. The automated half lives in `roblox/scripts/evidence-run.luau`
(paste as a ServerScript — **never** the Studio command bar; see its header).

**Setup for all drills:** world server up (`$env:PORT='4178';
$env:KINGSAGE_ROBLOX_KEY='dev-secret-local-0001'; npm run start:world`),
`roblox/src/server/SecretConfig.luau` holding the same key, Studio place from
`rojo build roblox` or `rojo serve`, HttpService enabled, F5.

## Drill 1 — Wall-clock across rejoin (done-criterion a)

1. F5, walk to the Timber Camp, trigger its prompt (or use the war table).
2. Note the queue row's countdown (e.g. "Timber Camp → Lv 2 — 4:37").
3. Stop the play session (Shift+F5). Wait ≥60 seconds by a real clock.
4. F5 again. Read the same queue row.

**Expected:** remaining time shrank by ≈ the elapsed wall time (±10s heartbeat
tolerance). If the wait exceeded the build duration, the building's grey box is
TALLER and the level label rose — while nobody was in-game.

- Result: _NOT YET RUN_

## Drill 2 — Restart loses nothing (done-criterion b)

1. With at least one queue running and known resource numbers on the HUD,
   end the play session completely; also kill and restart `rojo serve`.
2. F5 / rejoin.

**Expected:** the same kingdom, same building levels, same queue (advanced by
the elapsed time), same resources (plus any production). No duplicate
settlement, no re-founding (server logs `created=false`).

- Result: _NOT YET RUN_

## Drill 3 — Double-tap charges once (done-criterion c)

1. Note wood/stone/iron on the HUD.
2. Hammer one building's Upgrade (prompt or table button) 5× as fast as possible.

**Expected:** exactly ONE new queue entry; resources drop by ONE upgrade's
cost; every extra attempt gets a rejection toast (queue-full or version
conflict), never a second charge. (The API layer's replay guarantee is also
proven by `server/test/roblox-api.test.ts`.)

- Result: _NOT YET RUN_

## Drill 4 — Sabotage: stop the world server mid-session (spec §8/§9)

1. While playing, Ctrl+C the world server process.
2. Within ~20s (two heartbeats): prompts grey out (not triggerable), the
   "Reconnecting to the realm…" banner appears.
3. Press a war-table button → toast "Reconnecting to the realm…", and nothing
   is posted (server is down; verify no charge after restart).
4. Restart the world server.

**Expected:** banner clears within a heartbeat, prompts re-enable, one fresh
pull trues the HUD, zero progress lost, zero double-spend.

- Result: _NOT YET RUN_

## Drill 5 — Phone reality check (mobile baseline)

1. Publish the dev place PRIVATE (no name/branding beyond grey boxes).
2. On the mid-range test phone: join, watch the holding scene resolve, walk
   every street, trigger one prompt, use the war table, read the HUD.

**Expected:** playable and readable; record join-to-settlement seconds here.

- Result: _NOT YET RUN_

## Spike — 200 troops on the phone (spec §5)

Covered by `roblox/spike.project.json`; record numbers in
`docs/superpowers/spike-200-troops.md`.

- Result: _NOT YET RUN_
