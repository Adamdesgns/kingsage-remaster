# Kingsmarch — Road to Fully Functional (2026-08-23 → ~2026-09-20)

> The month of work between "feature-complete and audited" (today) and
> "fully functional game the family plays every day, ready to publish
> private." Owner column says who is SUITED to the work, not who is
> assigned — Adam routes packages to bots by writing/pointing them at a
> handoff. Every package obeys `docs/AI-TEAM-BRIEFING.md`.
>
> Owner key: **BOT** = external agent on a feature branch (Grok / Codex /
> Cursor), well-fenced + test-gated. **CLAUDE** = needs Studio eyes, live
> verification, integration, or judgment. **ADAM** = account, device, money
> or taste decisions no bot can make.

## Week 1 — the world fights back, and the phone truth

| # | Package | Owner | Status / handoff |
|---|---|---|---|
| 1.1 | Scripted AI kingdom tick (build/recruit/scout/raid-back, no conquest, env-gated) | BOT | `HANDOFF-2026-08-23-ai-kingdoms-grok.md` — ACTIVE tonight |
| 1.2 | Test debt: repair the stale `roblox-luau-contract.test.ts` fixture; add `@types/node` coverage for `server/src` | BOT | `HANDOFF-2026-08-23-test-debt.md` — ACTIVE tonight |
| 1.3 | Slice 0: measure 200-soldier drill + settlement on Adam's real phone, dated PASS/FAIL | ADAM + CLAUDE | needs Adam's phone, ~20 min |
| 1.4 | Review + merge overnight branches; live-verify AI tick against a fresh world | CLAUDE | mornings |

## Week 2 — the battle is a place (design doc slices 1–2)

| # | Package | Owner | Status |
|---|---|---|---|
| 2.1 | Battlefield ground language + squad banners (≤129 parts, zero scripts) | CLAUDE | design approved, budget-tested |
| 2.2 | Attend-on-foot: commander spawns on field, overhead one tap away, first battle defaults overhead | CLAUDE | server cap rule is BOT-able |
| 2.3 | Server: view-neutral 5-order cap + deadline +3 min + disconnect semantics | BOT | handoff to write |
| 2.4 | RALLY order: walk-speed clamp server-side, heartbeat batched into state pull | BOT server / CLAUDE client | handoff to write |
| 2.5 | Balance check: cavalry under the NEW class engine (is it worth its horse?) | BOT | pure game-core analysis + tests |

## Week 3 — the settlement lives (slices 3–4) and the economy opens

| # | Package | Owner | Status |
|---|---|---|---|
| 3.1 | Paddock + herd display (zero shows zero) | CLAUDE | design approved |
| 3.2 | Market row dressing + 4 villagers on the commander costume pipeline, battle/mourning despawn + cooldown | CLAUDE | design approved; kill criterion applies |
| 3.3 | Alliances v1: schema exists — create/join/leave, member list at the war table | BOT server / CLAUDE client | needs a design mini-pass first |
| 3.4 | Trade v1: resource send between allied villages (the brief's donation ask; first rung of the economy track) | BOT server / CLAUDE client | depends on 3.3 |
| 3.5 | Smithy research UI (server path exists, no interface) | CLAUDE | small |
| 3.6 | Visual polish debt: RoadWear near-black discs, gold gate shield placeholder, commander back-side darkness, follow-camera in walls on tour legs | CLAUDE | audit findings 2026-08-23 |

## Week 4 — other people can play it

| # | Package | Owner | Status |
|---|---|---|---|
| 4.1 | Host the world server publicly (free tier or Tailscale Funnel) | ADAM account + CLAUDE | deferred by choice today; required for kids' devices |
| 4.2 | Publish private + maturity questionnaire + kids' Play permissions (allowlist already shipped) | ADAM + CLAUDE | Studio is signed in |
| 4.3 | Two-client fog/respawn drill (owner + visitor) — the last unrun field gate | ADAM + kid + CLAUDE | doubles as first family test |
| 4.4 | THE NAME. It cannot ship as "KingsAge" — pick Kingsmarch/Emberfall/other, collision + handle sweep | ADAM | blocks any public anything |
| 4.5 | Session/server-size targets (brief marks OPEN) + HttpService budget check under N players | BOT analysis | informs 4.1 sizing |

## Parked (needs new evidence or Adam's appetite)

- Positional combat (squads that stand somewhere) — the real ceiling on
  battle control; big engine change, own design pass.
- Defender-side battle attendance; knockdown (rejected until positions
  exist); conversion ceremony + mounted silhouettes (await 2.5).
- Monetization: locked NO. Do not propose.

## Definition of "fully functional"

1. A kid on their own device, on their own account, joins the private
   world, gets attacked by a scripted kingdom while offline, comes back,
   scouts, retakes ground, and conquers a Freehold — no dev tools, no PC.
2. Every field gate has a dated PASS: phone perf, two-client fog, AI-tick
   live drill.
3. The game has its real name.
