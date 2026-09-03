# Local Studio playtest checkpoint — 2026-09-03

Adam authorized setup/playtesting, then stopped the session: "Stop we'll do it tomorrow."

## Completed

- Built `roblox/WorldGame-dev.rbxlx` from audit-fix commit `9bbbb6a`. SHA-256: `6281419B68896F1A8483D6C7F674FF023E00F5D4F1D6612B15C22A275B022E5C`.
- Started a disposable world at `http://127.0.0.1:4178`, process 70416. Health answered `{ ok: true, service: kingsage-world, contractVersion: 1 }`.
- Database: `C:\Users\steam\OneDrive\Documents\ChatGPT\Kingmarch\playtest-2026-09-03\world-20260903-175446.sqlite`. Session metadata and stdout/stderr logs are beside it. Local dev key only; no production credentials or commands.
- Fixture: building level 14, 120 axe, 3 scouts, 5 Counts; 25-second battle auto-resolution and 45-second AI tick. These are existing development seed settings, not proof of production starting balance.
- Opened the exact development place in Studio and pressed Play. Observed the player in the rendered town with live resource HUD and WORLD 1 / EMBERFALL / DADISAKING86'S REALM label. No war-table commands or ownership drills had been executed when Adam stopped.
- Studio auto-updated during normal launch to `version-9fe94fb0e9d84c25`. Recovery files were left alone. A misdirected accessibility click opened Delete confirmation; No was selected, then Ignore. Nothing was deleted.
- Fixed two test-tool defects found during setup: launcher now stops on native Rojo invocation errors; evidence script now expects one war table per owned detailed settlement rather than one per player. Controlled launcher failures and the real denied-executable case stop with no false success/app launch; real BuildOnly succeeds; 34 Luau syntax files and diff checks pass.

## Paused state

The local server and Studio play session were left running at Adam's stop request. No additional UI input or gameplay was performed afterward. They may have been closed by the user before resuming; inspect fresh process/window state first. Existing production world and main branch are unchanged. Nothing merged, pushed or deployed.

## Resume

1. Confirm branch/head, this worktree, current Studio window and local port's actual owner. Use session.json/logs to identify the disposable world; do not reuse or kill an unrelated server.
2. Continue in the normal dev place, not DemoTour. Approach the keep from its south entrance and use the E war-table prompt.
3. Verify cavalry prices and 1/5/25 batches, rejection-safe conversion, horse growth, scout report age/Realm of Power, then a second owned holding's commands.
4. Run two-client ownership/fog transfer checks. Studio may use negative player IDs, while the backend intentionally rejects them. If encountered, use a strictly local fixture identity adapter or authenticated clients; do not relax production validation.
5. Check 320/390 presentation and a real phone; full-game device performance remains unverified. No phone pass is implied by the desktop join.
6. Release remains separately approval-gated, after client acceptance. Follow the audit-fix verification record for backup, old-battle drain and matching live server/client build.

## Useful commands

- Build only: `powershell -NoProfile -ExecutionPolicy Bypass -File roblox/start-dev.ps1 -BuildOnly -Play`.
- Build directly: `rojo build roblox/default.project.json -o roblox/WorldGame-dev.rbxlx`.
- Health: `Invoke-RestMethod http://127.0.0.1:4178/api/health`.
- The generic `-Fresh` launcher can stop a server on 4178; inspect its ownership before using it. This session launched its own node server explicitly, hidden, with an absolute scratch database path.
