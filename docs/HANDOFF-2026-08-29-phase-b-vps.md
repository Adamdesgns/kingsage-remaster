# HANDOFF — Phase B: put the world on the internet

> For the next chat (any assistant, but this is Claude-shaped work: SSH,
> git, live verification). Binding rules: `docs/AI-TEAM-BRIEFING.md`.
> Written 2026-08-29 late evening; Adam said "do it tomorrow."

## Where things stand (all verified, not aspirational)

- **Phase A is MERGED to `main` (`3e0e971`) and pushed.** Every audit
  P0/P1 fixed test-first, AI kingdoms on in the dev loop, full client
  wiring (recruit picker / research / Recall / Herald), hosting-as-config.
  Gates on the merged tip: **server 114/114, core 92/92, types clean,
  luau 72 rules + 7 sims.** Details: `HANDBACK.md` (repo root).
- **The audit that drives everything:**
  `docs/audits/kingsage-functionality-audit.md` — §14 is the build order,
  §16 the nine decisions only Adam can make.
- **Adam chose VPS hosting (DigitalOcean, $6/mo droplet).** Account
  created 2026-08-29, **payment method added** (Adam confirmed).
- **Driving DigitalOcean's dashboard via the Chrome extension FAILED** —
  their SPA never reaches document-idle in the connected Chrome, so every
  screenshot/click times out. Two stuck tabs at
  `cloud.digitalocean.com/droplets/new` may still be open in Adam's
  Chrome; closing them is fine. Possible cause: Adam's logged-in session
  may live in his default browser (Edge?), not the connected Chrome.
  **Do not burn another hour on the UI — the API path is chosen.**

## Next session, in order

1. **Ask Adam for a DigitalOcean API token** (he was already asked;
   pick up there):
   https://cloud.digitalocean.com/account/api/tokens → Generate New
   Token → name `kingsage`, 90 days, **Full Access** → paste in chat.
   Keep it in a LOCAL file outside the repo (e.g.
   `C:\Users\steam\.kingsage\do-token`, chmod-equivalent private), never
   in git, never echoed back into chat.
2. **Create the droplet via API** (Adam approved the $6/mo spend
   2026-08-29 — "I'll click buy" then delegated via the token path;
   still say what you're creating before you create it):
   - NYC region, `ubuntu-24-04-x64`, size `s-1vcpu-1gb` ($6),
   - SSH key: the public key at `C:\Users\steam\.ssh\kingsage_do.pub`
     (keypair generated 2026-08-29, comment `kingsage-world@adams-pc`;
     private key `~/.ssh/kingsage_do`). Register the key via API first,
     then create the droplet with it. No root password anywhere.
3. **Run `docs/ops/vps-runbook.md` over SSH** (`ssh -i
   ~/.ssh/kingsage_do root@<ip>`): Node 24, kingsage user, clone repo,
   generate the production `KINGSAGE_ROBLOX_KEY` on the box, systemd
   unit, Caddy, backup cron, **restore drill once**, verify
   `/api/health` and a full link→build round-trip against the live URL.
   Production sets `KINGSAGE_AI_TICK_MS=45000` and NO dev-seed knobs.
4. **Domain:** Adam still owes a Porkbun purchase (any cheap TLD).
   Without it Caddy can't do TLS — don't expose the bare HTTP port; wait
   for the domain rather than shipping the key over plaintext.
5. **Point Roblox at it:** edit the gitignored
   `roblox/src/server/SecretConfig.luau` → `KEY = <production key>`,
   `BASE_URL = "https://<domain>"`. Publish PRIVATE (roadmap 4.2), enable
   Allow HTTP Requests in Game Settings.
6. **Studio look** (owed from Phase A): the new village-tab recruit
   picker, Smithy research rows, Recall button, and THE HERALD have
   **never been seen rendered** — eyeball them before the kids do.
   `roblox/start-dev.ps1 -Fresh` boots a living world (AI on).

## Standing gates before any "done"

`npm run check:types` · `npm run test:server` (114+) · `npm run
test:core` (92+) · `npm run test:luau` (72 rules) — all clean, no
exceptions; the briefing's old "80/81 known fail" note is dead.

## Adam still owes (don't nag, just know)

API token + Porkbun domain (blocks 2–5 above) · Studio/kid/phone tests
(slice 4 + Phase A UI) · THE NAME (blocks anything public) · the audit
§16 design decisions (conquest pacing at real timers, endgame, world
capacity beyond 6 seats, trebuchet/night-bonus wiring, post-capture
window, AI-vs-open-seat already resolved in code).

## Hard rules that bit this session (so they don't bite yours)

- Adam owns spend, publish, push-to-main, and every purchase
  confirmation. Never enter payment details or passwords into any field
  — the SSH-key path exists precisely to avoid a root password.
- Never commit secrets; `SecretConfig.luau` stays gitignored; the dev
  key `dev-secret-local-0001` is not the production key.
- The vault is the cross-assistant memory: log to `Daily/`, update the
  [[KingsAge Remaster]] hub + Open Loops when you move anything.
