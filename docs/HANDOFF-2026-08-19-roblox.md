# KingsAge → Roblox — chat handoff, 2026-08-19 evening

Read this first in a fresh chat. Code beats this note; then fix the note. It was
written mid-brainstorm: the design is HALF-PRESENTED and NOT yet approved, no
spec file exists, no code has been written.

## What Adam decided (in order, all confirmed in chat)

1. **KingsAge gets remade on Roblox.** His words: "we're able to make much more
   advanced games on roblox — let's make the Kingsage remake on the roblox
   platform." Reconfirmed with "wouldn't it be better on roblox?!"
2. **He'll pay a few dollars a month for an always-on world server.** This was
   the fork: DataStore-only vs real server. He chose the server after having
   DataStore's two limits explained (no queries, and nothing runs when nobody
   plays — so offline attacks are impossible without one).
3. **Roblox becomes the ONLY client.** The GitHub Pages web game gets frozen as
   an archive. No dual-client world, no separate web world.
4. **Slice one = the village loop, grey-box, on real server state.** Join →
   server knows you by Roblox UserId → your real village in 3D → tap, queue,
   pay → leave → return later → the SERVER counted the time. Battles and the
   world map are explicitly later slices. Chosen over "one 3D battle" and
   "world map" options.
5. **Architecture A: Roblox is a window; the existing world server decides
   everything.** Every tap: Roblox client → Roblox server → HTTP API → back.
   No local authority, no state cache in slice one. B (client cache + sync) is
   a later optimization only if feel demands it; C (Roblox-native/DataStore)
   was rejected.
6. **Login and chat code get retired**, and Adam okayed it: Roblox UserId
   replaces Gate B's passwords/sessions; Roblox moderated chat replaces the
   custom world chat (platform requirement, not a choice).

## Where the brainstorm stands (superpowers:brainstorming, mid-flight)

Design sections 1 (slice-one scope + done-criteria) and 2 (three pieces, one
boundary) were presented in chat; Adam asked for this handoff BEFORE approving
them. Still to present: data flow, failure handling, testing. Then: write the
spec to `docs/superpowers/specs/2026-08-19-roblox-village-slice-design.md`,
self-review, Adam reviews, then superpowers:writing-plans. Do not touch code
before that gate.

Key design points already stated to Adam (keep them unless he changes course):
- Done-criteria for slice one: (a) queue advances by wall-clock across a quit/
  rejoin; (b) a Roblox server restart loses nothing; (c) a double-tap charges
  ONCE (idempotent commands — same class of bug just fixed in Blockshore's
  ledger, design it in).
- The Roblox server script is the only HTTP speaker, holds the shared secret,
  holds no authority, and loses nothing if it dies.
- The API is the EXISTING Gate A ordered/idempotent command-event contract with
  a new thin layer: Roblox UserId ↔ kingdom mapping + per-request secret.
  Roblox is a second consumer, not a new protocol.
- World is built procedurally in code (Rojo → Studio), not hand-placed in the
  editor; the editor's role is a few modular art pieces later. Grey-box first.

## The repo this lands on

- `C:\Users\steam\Projects\apps\kingsage-remaster` → github.com/Adamdesgns/
  kingsage-remaster (public), branch `main`, **9 commits ahead of origin,
  UNPUSHED** — includes ALL of Gates A–D (`426156a`…`3611d17`). Flagged to
  Adam; push before anything else. There's also an untracked `.clip-site/`.
- What Gates A–D already give us (built by Codex, 2026-08-16, all local):
  shared TypeScript contracts, versioned ordered/idempotent commands + events,
  Postgres schema (SQLite in dev), village economy with original KingsAge cost
  curves, construction/recruitment/research queues, troop levels 1–10, scout →
  plan → battle → return warfare loop, WVP. Tests pass per the vault hub note.
- Vault hub: `kepano-obsidian\KingsAge Remaster.md` (frontmatter `next` is now
  stale — it still says phone warfare loop; update it when the spec lands).
- The old 30-day closed-alpha roadmap (Aug 16–Sep 14) predates the Roblox
  pivot. Treat it as source material, not the plan.

## What dies, what lives (tell the next chat so it doesn't "fix" things)

- DIES: Gate B auth (salted passwords, HTTP-only sessions) — Roblox UserId is
  identity. DIES: custom world chat — Roblox moderated chat is mandatory.
  The Phaser battle scenes and mobile-rebuild client become reference, not
  shipping code.
- LIVES: the world server, the command/event protocol, the economy rules, the
  deterministic combat math, Postgres schema. That server IS the product; the
  entire point of architecture A is that Gates A–D barely change.

## Roblox-side facts the next chat needs (hard-won today, in Blockshore)

- Workflow that works: repo Luau + `rojo serve` → cloud place in Studio →
  Accept sync → F5 to test → Alt+P publish. Studio start page's recents are
  LOCAL files; open the CLOUD place from Experiences.
- **The Studio command bar does not share module state with running server
  scripts** — `require` there returns a second, uninitialised copy, and even
  workspace scans from it gave false zeros (claimed 0 ProximityPrompts in a
  world visibly full of them). Test service internals via in-game admin
  commands, the HUD, or gameplay — never command-bar requires. This burned two
  sessions' worth of false FAILs; it's documented at the top of
  `blockshore/roblox/scripts/evidence-run.luau`.
- Studio auto-updates kill computer-use grants (path changes per version) and
  Rojo connections; `open_application` can't launch the new path — front the
  existing window via SetForegroundWindow (blockshore scratchpad front2.ps1
  pattern) or ask Adam.
- Adam's accounts: Roblox owner **Dadisaking86**; boys are Adamsaking +
  OrionTheDestroyer15 (see blockshore Config.ESTATE).
- HttpService must be enabled in Game Settings for the API calls; budget ~500
  req/min per server — fine for a strategy game, but batch state pulls anyway.

## Open questions the next chat must NOT silently decide

- VPS choice/provider and deploy story for the world server (Adam only agreed
  to "a few bucks a month" — nothing picked).
- Secret management for game-server → API auth (where it lives on Roblox side;
  likely a Secrets store or config the repo never contains).
- Whether slice one lives in a NEW Roblox place + new repo dir, or inside the
  kingsage-remaster repo with a `roblox/` dir like Blockshore. (Blockshore's
  layout is the working precedent.)
- Kid-safety posture: Blockshore's word-ban discipline (no weapon/violence
  vocabulary) is a BLOCKSHORE rule. KingsAge is a war game — Adam has said
  nothing about audience/rating for the Roblox version. Ask before importing or
  discarding those constraints; it changes art, copy, and marketing.
- Monetization: never discussed. Do not add any.

## Context from the same day (Blockshore, separate project, still open)

Blockshore update 17 is unpublished: HOME→vault + economy verified through
RESERVE and the restart/reservation fix proven, but the seven plumbing steps /
first real payout were never run, so the queued-wage and replay-requeue fixes
are unexercised. Live is v8. Adam knows. Don't let KingsAge quietly bury it —
it's one 60-second in-game task plus Alt+P away from publishable.

## Rules that must hold (house rules, all repos)

Vault rituals: session-end Daily note bullet (`**[Claude]**`), project hub
frontmatter update, Dev Log line, Open Loops row. Append-only next to Codex's
entries. Push needs no extra approval on this repo (already public + pushed
before); creating any NEW public repo needs Adam's explicit OK. Claude does all
git. Never enter Adam's PIN/passwords. Propose, then execute.
