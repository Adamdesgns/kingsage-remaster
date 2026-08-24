# Fresh-chat handoff — 2026-08-24 (post bot-fleet morning review)

> For the next Claude session. Read this, then the session-start ritual
> (vault `Open Loops.md`, hub `KingsAge Remaster.md`, last two Dailies).
> Any OTHER assistant starts at `docs/AI-TEAM-BRIEFING.md` instead — that
> file is binding for the whole fleet and this handoff sits on top of it.

## Where the repo stands

- Repo: `C:\Users\steam\Projects\apps\kingsage-remaster`, branch `main`,
  tip `2a12fdd`, **fully pushed**. Working tree clean except untracked
  `server/server/data/` (throwaway capture DBs from the 08-23 audit; the
  `KINGSAGE_DATABASE_PATH` quirk resolves relative to `server/`).
- Gates on main: `npm run test:server` **89 pass / 0 fail** (the old
  stale-fixture failure is FIXED); `npm run check:types` clean over
  game-core AND server/src (run `npm install` at repo root once —
  `@types/node` is a root devDependency now); `npm run test:luau` 21/21
  (needs Lune; it's at `~/.local/bin/lune` and via winget packages).
- **One unmerged branch: `origin/feat/battlefield-banners-boxie`** — HELD,
  not rejected. Uncommissioned but honest work on roadmap package 2.1
  (battlefield ground + squad banners, 70/129 parts, 14 added gate rules,
  35/35 pass on that branch). Its own handback says the visual read is
  unverified. **Next action: open it in Studio, attend a battle, judge the
  look; merge or bounce.** Review worktree pattern from 08-24: worktree +
  copy `mobile-rebuild/node_modules/{typescript,@typescript}` for tsc.

## What happened 08-23 → 08-24 (compressed)

1. **Full game audit passed live** (Adam: "full war everything"): scout →
   attack → attended battle with squad orders → resolution → real
   two-wave Realm-of-Power conquest of Saltmarsh Freehold. All four
   matching-angle captures (overview/street/gate/war room) verified.
2. **Fixes shipped from the audit + Adam's first play session** (all on
   main, pushed): `homewardArmy` TDZ crash that killed the world server on
   every battle settle; demo tour couldn't reach the sealed keep's war
   table (doorway waypoints; also added a gate-exterior camera beat);
   stale-intel client mirror that refused nearly every battle attend
   (server's substance check is the only judge now); war-table panel
   contrast (was faded-looking; now readable, live buttons look live).
3. **Kids' allowlist shipped**: `Config.ALLOWED_PLAYERS` — Adam
   11141646980 (Dadisaking86), Keegan 1767398786 (Adamsaking), Orion
   5405597651 (OrionTheDestroyer15), Aria 4751547102 (Airasecret).
   Server-entry kick for anyone else; empty list or Studio always passes.
4. **Design pass, red-teamed** (`docs/design/2026-08-23-battle-horses-
   living-city.md`): battle presence / paddock / living square. Binding
   plan is the bottom section. Knockdown REJECTED (server has no unit
   positions — any "near/flank" design is unbuildable; recorded open
   question: positional combat). CANONICAL-BRIEF corrected (flat power
   sum died 08-22; Freehold on-ramp proven live).
5. **The AI fleet exists**: Adam runs Cursor, ChatGPT/Codex, Claude, Grok
   bots. `docs/AI-TEAM-BRIEFING.md` is the binding briefing (CLAUDE.md /
   AGENTS.md at root are pointers). `docs/ROADMAP-2026-08.md` maps the
   month to "fully functional", every package owner-typed BOT/CLAUDE/ADAM.
6. **Overnight round 1 reviewed and merged 08-24**: `feat/test-debt-robob`
   (contract fixture on Realm of Power with mutation-check evidence +
   types over server/src) and `feat/ai-kingdoms` (Grok: env-gated
   deterministic AI kingdom tick through EXTRACTED player command cores —
   `queueConstruction` / `queueRecruitment` / `launchMarchCore` in
   store.ts; one merge conflict resolved in Grok's favor, it subsumed
   robob's type guard). Live-verified: fresh world, all six AI seats
   queued Farm→2 within seconds, Freeholds untouched, nobles never march.
   Handbacks filed under `docs/handbacks/`.

## The AI kingdom tick (how to run it)

`KINGSAGE_AI_TICK_MS=60000` before starting the world server enables it;
unset = server identical to before. Not yet wired into
`roblox/start-dev.ps1` (offered to Adam, no answer yet). Accepted quirk:
unclaimed open seats are `seat_kind='ai'`, so the tick develops them until
a player claims them (fine for the family world; real design question
before any public world — it's in the grok handback's open doubts).

## Open items, in order

1. **Studio look at boxie's banners branch** → merge or bounce (CLAUDE).
2. **Slice 0: the phone measure** — 200-soldier drill + settlement on
   Adam's real phone, dated PASS/FAIL (ADAM+CLAUDE, ~20 min). Everything
   visual is sized by this; it has NEVER run.
3. **Adam owes**: slice-order approval on the design plan; **THE NAME**
   (can never ship as "KingsAge"; lane: Kingsmarch/Emberfall/Realmfall).
4. **Next bot-feedable packages** (write handoffs on demand): 2.3 server
   order-cap/deadline rules, 2.4 RALLY server side, 2.5 cavalry balance
   under the new engine, 4.5 HttpService budget analysis.
5. **Visual polish debt** (CLAUDE, from the audit): near-black RoadWear
   discs (SettlementBuilder.luau ~333), placeholder gold gate shield,
   commander dark from behind, follow-camera burying itself on tour legs.
6. **Week 4**: hosting (kids on own devices — Adam deferred, PC-only for
   now), private publish + questionnaire + Play permissions, two-client
   fog/respawn gate.

## Dev loop reminders

- `powershell -ExecutionPolicy Bypass -File roblox\start-dev.ps1 -Play`
  — world server on 4178 + the NORMAL place (no self-driving tour).
  `-Fresh` for a new world (seeds only apply at creation).
- Demo/capture workflow, beat timings, Studio focus quirks: Claude memory
  `kingsage-capture-workflow.md` (project memory dir).
- Place files bake scripts — rebuild via rojo after any Luau change
  (start-dev does it every launch).
- Ports: always verify 4178 clear before claiming the server stopped;
  only ever kill `node.exe` running `index.ts`.
- Adam pushes nothing himself; Claude does all git. This session had
  standing push approval — a NEW session should confirm before pushing.

## Vault

Daily 08-23 and 08-24 are current; hub `status`/`next` updated 08-24
morning (next: boxie Studio check, Slice 0, Adam's approvals). Open Loops
row 165 carries the full thread. `node Projects\tools\vault-check\check.mjs`
verifies the git claims if in doubt.
