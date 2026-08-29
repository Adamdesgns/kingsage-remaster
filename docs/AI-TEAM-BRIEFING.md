# AI TEAM BRIEFING — read before touching this repository

> Binding for EVERY AI assistant working here — Claude, Codex/ChatGPT,
> Cursor, Grok, or anything else Adam points at this repo. Task-specific
> handoffs in `docs/` sit ON TOP of this briefing; they never override it.
> Owner: Adam (GitHub `Adamdesgns`).

## What this is

A Roblox medieval war game (working title **Kingsmarch** — it can NEVER
ship under the name "KingsAge"; that name belongs to the 2008 original's
owners). A persistent world where your kingdom is a place you walk, not a
menu you read, and you take the world one settlement at a time.

Design source of truth: `docs/design/CANONICAL-BRIEF.md` — read it before
any design-adjacent work. Its "Decisions already locked" section is law;
do not reopen locked decisions.

## Architecture (locked — violating this gets work rejected)

- **The external world server (`server/`) holds ALL authority.** SQLite
  store, Node with `--experimental-strip-types` (types are ERASED, not
  checked — `npm run check:types` exists because of that).
- **Roblox is a window.** The Roblox server script (`roblox/src/server/`)
  is the only HTTP speaker and holds no authority. The client
  (`roblox/src/client/`) renders and asks; it never decides.
- **The math and the movie are separate.** No device's frame rate may ever
  change a game outcome. Combat resolves server-side as class totals —
  units have NO positions; any design needing "near"/"flank" is
  unbuildable today.
- **No Humanoids for mass units** (Roblox dies at ~50-100). Soldiers are
  six anchored parts; part budgets are tested analytically.
- **Mobile is the baseline.** Owner-only detail: foreign settlements stay
  fog shells; private detail rides PlayerGui, never shared Workspace.
- Shared rules live in `packages/game-core/` (combat, economy, fixture).
  The Luau and TypeScript sides must never drift — cross-language contract
  tests exist because a mirror drifting is this repo's classic bug.

## Working rules

1. **Branches.** Work on `feat/<topic>` (agents other than Claude: suffix
   your name, e.g. `feat/ai-kingdoms-grok`). **Never commit to `main`**
   — `main` integration is Claude's job, after review, on Adam's word.
2. **Gates before any "done" claim:**
   - `npm run test:server` — must pass **clean, zero failures** (114 tests
     as of 2026-08-29 and growing; the old "80/81 with a known-stale Luau
     contract fixture" note is DEAD — that test was repaired and merged on
     `feat/test-debt-robob`. If it fails now, that is a real regression).
   - `npm run test:core` — clean (92+).
   - `npm run check:types` — must stay clean.
   - `npm run test:luau` — needs Lune; mandatory if you touched `roblox/`;
     if you skip it, say so. 72 rules as of 2026-08-29.
3. **Honest reporting.** This project's dominant recorded failure mode is
   code that reports success while doing nothing (a world with no floor
   shipped this way). Every claimed behavior needs a test that fails when
   the behavior is deleted. "I didn't get to X" is respected; a false
   "done" is not.
4. **No duplicated rules.** If two places need one rule, extract it —
   mirrored copies are how a button promised one army while another
   marched.
5. **No schema changes** without an explicit migration following the
   existing `server/db/migrations/` pattern — and prefer stateless designs
   that need none.
6. **Determinism.** No unseeded randomness or wall-clock reads inside game
   logic; take `now` as a parameter, seed variety like the store seeds
   battles.
7. **Secrets.** Never commit keys. `SecretConfig.luau` is local;
   `SecretConfig.example.luau` is the template. Dev world-server key is
   `dev-secret-local-0001` and is not a real secret.
8. **Quirk:** `KINGSAGE_DATABASE_PATH` resolves relative to `server/`.
9. **Hand back honestly.** Finish with a `HANDBACK.md` on your branch:
   built / not built / deviations with reasons / how to run / open doubts.

## Current state (2026-08-29)

- Feature-complete vs the approved spec; full game loop (scout → attack →
  battle → two-wave Realm-of-Power conquest) proven live in a Studio audit
  2026-08-23; battle-horses slices 1–4 merged 2026-08-29. Kids'
  private-realm allowlist is in `Config.ALLOWED_PLAYERS`.
- **Full functionality audit 2026-08-29:**
  `docs/audits/kingsage-functionality-audit.md` — the honest map of what
  works, what's stubbed, and what's missing. Read it before claiming any
  system exists or doesn't.
- Server runs locally on port 4178 (`roblox/start-dev.ps1` is the
  one-double-click dev loop, **AI kingdoms ON at a 45s tick**). Published
  Roblox servers cannot reach 127.0.0.1 — hosting is Phase B (VPS chosen
  by Adam 2026-08-29; runbook at `docs/ops/vps-runbook.md`); bind and
  base URL are config (`KINGSAGE_BIND`, SecretConfig `BASE_URL`).
- Active plan: `docs/superpowers/plans/2026-08-29-fully-functional-phase-a.md`.

## Who's who

- **Adam** — owner, final word on everything. Plain English, no jargon
  walls. Never push `main` or publish anything without his explicit word.
- **Claude** — integration, review, `main`, git/GitHub, live Studio
  verification.
- **Codex/ChatGPT, Cursor, Grok** — feature branches against written
  handoffs, reviewed before merge.
