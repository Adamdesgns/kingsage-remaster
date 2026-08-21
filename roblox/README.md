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
- Drills live in `../docs/superpowers/drills-slice-one.md` — run them, record
  results with dates.

## Layout

- `default.project.json` — Rojo tree (server/client/shared, streaming enabled)
- `src/server/` — ApiClient (only HTTP speaker), WorldSession (join + 10s
  batched heartbeat), SettlementBuilder (grey-box village from live state),
  CommandService (idempotent build/recruit), WarTable
- `src/client/` — HUD, timers (display-only, from server timestamps), war
  table camera, failure banners
- `spike.project.json` + `spike/` — standalone 200-troop performance spike
