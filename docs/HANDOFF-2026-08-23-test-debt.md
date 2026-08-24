# HANDOFF: Test Debt — stale conquest fixture + server type coverage

> Written 2026-08-23 for an external AI agent (Codex/ChatGPT or Cursor)
> working overnight, unsupervised. **Read `docs/AI-TEAM-BRIEFING.md`
> first — it is binding and this handoff sits on top of it.** Small,
> surgical, two tasks. Branch: `feat/test-debt-<yourname>`.

## Task 1 — repair the one known-failing server test

`npm run test:server` is 80 pass / 1 fail. The failure is deliberate
history, not flake: the cross-language contract test
(`roblox-luau-contract.test.ts`, in the server test directory) was written
for the pre-2026-08-22 loyalty system. It seeds an obsolete `loyalty = 20`
style target and expects a ONE-wave capture. Current rules are **Realm of
Power**: a settlement's maximum is its own point score, one Count acts per
attack, no single attack removes more than 50% of maximum, so conquest
ALWAYS takes at least two attacks, and a captured settlement resets to 30%.

**The prescribed repair** (recorded in the 2026-08-23 handoff notes —
follow it rather than inventing another): start the target already
weakened by seeding `realm_of_power = 1` on the target village, run the
attack wave through the REAL Luau→HTTP path the test already exercises
(that cross-language seam is the entire point of this test — do not
shortcut it), and assert the capture plus the post-capture reset to 30% of
the settlement's maximum.

Rules:
- Do not weaken what the test proves: the Luau side must still build the
  army, the server must still accept it, and the conquest must complete
  end-to-end. If you only changed numbers until green, you failed.
- Verify the 30%-of-maximum figure against the actual constant in
  `packages/game-core` (search for the Realm of Power / capture reset
  logic) — assert against the source of truth, not a hardcoded 30 if the
  code derives it.
- Mutation check (required, describe it in HANDBACK.md): temporarily break
  the capture path (e.g., make `applyConquest` never fire) and confirm
  your repaired test FAILS, then restore.

## Task 2 — real type coverage for `server/src`

`npm run check:types` currently covers only `packages/game-core` and
prints: "server/src is NOT covered — it needs @types/node". The server
runs under `--experimental-strip-types`, which ERASES types without
checking them — this repo has already shipped a NaN-army bug and a
`homewardArmy` temporal-dead-zone crash that tsc would have caught.

- Add `@types/node` as a devDependency (this is the ONE permitted new
  dependency; pin it to match the Node major in use — check `node
  --version` guidance in the repo/scripts, the server runs Node 26).
- Extend the existing type-check config (see `tsconfig.check.json` and the
  `check:types` script) to include `server/src`.
- Fix the type errors it surfaces. Rules: fixes must be type-level or
  trivially-safe corrections. If a surfaced error reveals a REAL behavior
  bug, do not silently change behavior — fix the types around it, and list
  the suspected bug prominently in HANDBACK.md for review.
- No `any` sprinkling, no `@ts-ignore`/`@ts-expect-error` unless truly
  unavoidable — each one used must be listed in HANDBACK.md with why.
- The gate must end up: `npm run check:types` clean over BOTH game-core
  and server/src, with no "NOT covered" caveat left in its output.

## Definition of done

- Branch pushed with both tasks (or one, honestly labeled, if the other
  proved larger than this handoff believed — explain in HANDBACK.md).
- `npm run test:server`: **81/81**.
- `npm run check:types`: clean, covering server/src.
- `npm run test:luau`: untouched territory, but run it if Lune is
  available and report the result either way.
- `HANDBACK.md` at repo root on your branch: what changed, the mutation
  check evidence for Task 1, every suppressed type error with its reason,
  and any suspected real bugs the types surfaced.
