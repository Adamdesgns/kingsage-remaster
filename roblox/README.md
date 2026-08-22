# Roblox client — "The World Is the Game" (working title only)

⚠️ **Ship-name rule:** nothing player-facing may say "KingsAge" — that name
belongs to the original 2008 game's owners. It is an internal working title.
The published experience gets its own original name (spec §10, not yet chosen).

This is the 3D window onto the world server in `../server`. It holds no
authority and saves nothing: every action round-trips
Roblox server → HTTP → world server (spec: `../docs/superpowers/specs/2026-08-20-roblox-world-is-the-game-design.md`).

## Dev loop (local, Studio)

1. **Start the world server** (from repo root, PowerShell):
   ```powershell
   $env:PORT = '4178'; $env:KINGSAGE_ROBLOX_KEY = 'dev-secret-local-0001'; npm run start:world
   ```
   `roblox\start-dev.ps1` does this and more — it also sets
   `KINGSAGE_AUTO_RESOLVE_MS=25000` so an unattended attack settles inside a
   recording, and `KINGSAGE_DEV_SEED_NOBLES=5` so the conquest path can be
   walked at all. **Both are DEV ONLY and unset in production**; seeding
   Noblemen never changes a rule, only the starting garrison of a throwaway
   world. Without it, conquest needs 3-5 Noblemen at 900s and ~2800/3000/3500
   each, which no play session can sit through.
   Ports 4174/4177 may host older long-running processes — leave them alone; this work uses 4178.
2. **Give Roblox the secret:** copy `src/server/SecretConfig.example.luau` to
   `src/server/SecretConfig.luau` (gitignored) and set the same key.
3. **Serve the project:** `rojo serve roblox` (from repo root; same Rojo used by
   Blockshore — see `C:\Users\steam\Projects\apps\blockshore\roblox\README.md`).
4. **In Studio:** open the dev place, connect the Rojo plugin, Accept sync.
   Game Settings → Security → **Allow HTTP Requests** must be ON.
5. **F5 to play.** Studio's HttpService may call `http://127.0.0.1:4178`;
   published Roblox servers cannot — a public place needs the VPS deploy
   (outside slice one).

## Testing rules (hard-won, from Blockshore)

- ⚠️ **NEVER test service internals from the Studio command bar.** `require`
  there returns a second, uninitialised copy of every module and even
  workspace scans from it have reported false zeros. Two sessions were burned
  on confident FAILs against a working game. Test through gameplay, the HUD,
  in-game admin commands, or `scripts/evidence-run.luau` pasted as a real
  ServerScript.
- Drills live in `../docs/superpowers/drills-slice-one.md`,
  `drills-scouting.md`, `drills-battles.md`, `drills-battle-scene.md` and
  `drills-conquest.md` — run them, record results with dates. **Twenty-five are
  written; nine carry dated PASS lines.**
- ✅ **The Luau gates DO run.** Earlier notes here said Lune was not installed
  on this PC. That was wrong — the session that checked had a stale PATH. Lune
  0.10.5 is installed via winget and is on the user PATH; a shell opened before
  it was added will not see it, which is what caused the false conclusion.
  - `npm run check:luau` — compiles all 21 Luau files with the real compiler.
  - `npm run check:luau-rules` — **RUNS** the pure shared Luau and asserts the
    rules both the Roblox server and the war table depend on: what musters on
    an attack, the army table that ships to the world server, the recruit
    presets, the attack-plan axes. It is mutation-checked.
  - `npm run test:luau` runs both.

  This matters more than it sounds. The Node suites drive the world server's
  HTTP routes and never execute a line of Luau — which is exactly how an empty
  `villageId` shipped to every command in slice A. Anything pure belongs in
  `scripts/rules-check.luau`.

## Layout

- `default.project.json` — Rojo tree (server/client/shared, streaming enabled)
- `src/server/` — ApiClient (only HTTP speaker), WorldSession (join + 10s
  batched heartbeat), SettlementBuilder (region renderer: own villages full,
  foreign ones fog silhouettes), CommandService (idempotent build / recruit /
  scout march), WarTable
- `src/client/` — HUD (resources, queues AND marches on one countdown ticker),
  war table camera with its **Village** and **War** tabs (scout targets, attack
  planning, marches, scout and battle reports), the battle view, failure banners
- `src/client/BattleScene.luau` — the battle scene. CLIENT-side on purpose:
  nothing it builds replicates, so a couple of hundred soldiers cost the
  network nothing, and every client seeds its randomness from the battle's own
  seed so everyone sees the same fight with no syncing
- `src/shared/BattleConfig.luau` — every number the scene renders by, including
  the ADAPTIVE budget that stands in for the phone measurement nobody has taken
- `spike.project.json` + `spike/` — standalone 200-troop performance spike

## The battle rule

The world server's Gate D maths is the outcome authority. The battle scene is a
RENDERING of that maths and decides nothing: no frame rate, no device, no cull
can move a single casualty. That is what makes the adaptive fidelity budget in
`BattleConfig` safe — a phone that cannot draw 200 soldiers draws fewer, and
the result is identical. While a battle is `open` the scene kills nobody,
because nothing has been decided yet.

## The fog rule

Foreign villages arrive from the world server with `resources`, `buildings`
and `army` zeroed (`server/src/store.ts`, `getSnapshot`). Nothing on the Roblox
side may present those zeros as observations, and nothing may display a
neighbour's real numbers except a scout report the player earned. The offline
test `server/test/roblox-scouting.test.ts` pins this: the snapshot that
delivers a report still shows the scouted village fogged.
