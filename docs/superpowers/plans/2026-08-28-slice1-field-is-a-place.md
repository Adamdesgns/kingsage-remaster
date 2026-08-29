# Slice 1 — "The field is a place" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an attended battle happen in a real place: dressed ground and squad banners on the field, the commander standing on it, overhead view one tap away (and the default), a server-enforced 5-order cap, and a +3-minute deadline extension for an opened battle — with a determinism gate proving none of it changes outcomes.

**Architecture:** Server (`server/src/store.ts`) stays the only authority: the order cap and deadline extension are store rules with tests. The Luau client mirrors the cap number via `BattleConfig.ORDER_CAP`, kept honest by a text-parity test (roster-parity pattern — no Lune escape hatch). All field visuals are client-side anchored parts counted analytically by the shared `BattlefieldDressing` spec (from `feat/battlefield-banners-boxie`, merged forward across the SoldierBuild refactor).

**Tech Stack:** Node `--experimental-strip-types` + node:test; Luau via Lune (`npm run test:luau`); Rojo; Roblox Studio for the live look.

## Global Constraints

- Design authority: `docs/design/2026-08-23-battle-horses-living-city.md` **RED-TEAM OUTCOME** section only. Slice 1 row: "battlefield ground language (≤120 parts), squad banners (≤9), attend-on-foot with commander spawn, overhead one tap away, first battle defaults overhead, order cap 5 while attending (view-neutral), deadline +3 min. Gate: determinism test: identical orders ⇒ identical outcome."
- Architecture A is locked: server math, client movie. No client input may change an outcome except through accepted commands.
- No Humanoids for units. All dressing parts: `Part`, anchored, `CanCollide=false`, zero scripts.
- Field dressing ≤120 parts; banners ≤9 (3 squads × 3). Boxie's analytic counts: dressing 61, banners 9.
- No schema changes. The cap and deadline use existing tables (`local_battle_orders` count; `local_march_plans.auto_resolve_at`).
- Determinism: no unseeded randomness, no wall-clock in game logic (`now` is injected).
- Gates before any "done": `npm run test:server` (89/89 + new), `npm run check:types`, `npm run test:luau` (mandatory — `roblox/` is touched).
- Branch: `feat/slice1-field-is-a-place` off `main` (df6c59a). Never commit to `main`.
- ATTENDANCE FACT (design note): field orders can only exist after `battle.open` (there is no unattended order path), and the red team made the cap view-neutral. So the honest implementation is **one cap: 5 accepted orders per battle**. The "3 unattended" number in the pre-red-team draft has no server counterpart to gate and is not built. Record this in the HANDBACK.
- The existing `orderBonus = min(0.12, n*0.02)` formula is NOT touched; with n ≤ 5 the effective max becomes 0.10. Do not "fix" the 0.12 ceiling — changing the formula changes recorded battle outcomes.

---

### Task 1: Merge boxie's dressing + banners across the SoldierBuild refactor

**Files:**
- Modify: `roblox/src/client/BattleScene.luau` (merge conflict expected — main refactored it for SoldierBuild)
- Modify: `roblox/scripts/rules-check.luau` (merge: main's spike rules + boxie's 14 dressing rules)
- Create (from branch): `roblox/src/shared/BattlefieldDressing.luau`, `roblox/scripts/evidence-run.luau` additions, `HANDBACK.md` (will be rewritten in Task 9)

**Interfaces:**
- Produces: `BattlefieldDressing` module in ReplicatedStorage.WorldShared (rojo maps `src/shared` automatically); BattleScene builds dressing + 3 banners inside its `folder` on `start`, banners tracked in the existing per-frame bulk move.

- [ ] **Step 1: Branch and merge**

```bash
git checkout -b feat/slice1-field-is-a-place main
git merge origin/feat/battlefield-banners-boxie
```

Expected: conflicts in `roblox/src/client/BattleScene.luau` and `roblox/scripts/rules-check.luau` (both edited on main since `373b3ff`).

- [ ] **Step 2: Resolve `rules-check.luau`** — keep BOTH rule sets (main's spike/SoldierBuild rules AND boxie's 14 dressing rules). Union, no rule dropped. Run `git diff --stat` to sanity-check nothing else conflicted.

- [ ] **Step 3: Resolve `BattleScene.luau`** — read `git show origin/feat/battlefield-banners-boxie:roblox/src/client/BattleScene.luau` and port its dressing/banner hunks into the refactored file: the `BattlefieldDressing` require at top, the build call inside `start` (after ground creation, same `folder`, same `center`, seeded from the battle seed), and the banner-follow update inside the bulk-move section of `tick`. The banner rule from boxie's HANDBACK is binding: banner follows the first living attacker soldier of its squad via the existing `BulkMoveTo` batch, stays at attacker-baseline home if the squad has no living body, zero scripts on instances.

- [ ] **Step 4: Run gates**

```bash
npm run test:luau
npm run test:server
npm run check:types
```

Expected: luau = all files compile, main's 27 rules + boxie's 14 = 41+ rules pass, 7 sim checks pass. Server 89/89. Types clean.

- [ ] **Step 5: Mutation-check the merge did not lobotomize the gates** — temporarily add a 4th banner part in `BattlefieldDressing.luau`, expect the banner-count rules to FAIL, revert, expect green. (Boxie proved this pre-merge; prove it survived the merge.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: merge battlefield dressing + squad banners across SoldierBuild refactor (slice 1)"
```

---

### Task 2: Shared ORDER_CAP constant with cross-language parity

**Files:**
- Modify: `packages/game-core/src/warfare.ts` (export the constant), `packages/game-core/src/index.ts` (re-export)
- Modify: `roblox/src/shared/BattleConfig.luau`
- Modify: `server/test/roster-parity.test.ts` (add parity test — same no-Lune text-parity pattern)

**Interfaces:**
- Produces: `export const BATTLE_ORDER_CAP = 5;` (game-core) and `BattleConfig.ORDER_CAP = 5` (Luau). Tasks 3, 5, 7 consume these names exactly.

- [ ] **Step 1: Write the failing parity test** in `server/test/roster-parity.test.ts`:

```ts
test("the client's order cap is the server's order cap", () => {
  const source = luauSource("BattleConfig.luau");
  const match = /BattleConfig\.ORDER_CAP\s*=\s*(\d+)/.exec(source);
  assert.ok(match, "BattleConfig.ORDER_CAP not found - the client cannot show orders remaining");
  assert.equal(Number(match[1]), BATTLE_ORDER_CAP);
});
```

Add `BATTLE_ORDER_CAP` to the game-core import at the top of the file.

- [ ] **Step 2: Run: `npm run test:server` — expect FAIL** (no export, no Luau constant).
- [ ] **Step 3: Implement.** In `warfare.ts` (near the orderBonus doc):

```ts
/**
 * The most field orders one battle accepts. Presence buys capacity and
 * expressiveness, never multipliers (design 2026-08-23, red-team revised:
 * view-neutral - attending the scene at all earns the full cap).
 */
export const BATTLE_ORDER_CAP = 5;
```

Re-export from `index.ts`. In `BattleConfig.luau` (near ORDER_SPACE):

```lua
-- The most field orders one battle accepts. Mirrors game-core
-- BATTLE_ORDER_CAP; roster-parity reads this line as text. Server-authoritative.
BattleConfig.ORDER_CAP = 5
```

- [ ] **Step 4: Run `npm run test:server` and `npm run test:luau` — expect PASS.**
- [ ] **Step 5: Commit** — `feat: shared BATTLE_ORDER_CAP constant with text-parity gate`

---

### Task 3: Server enforces the cap on battle.order

**Files:**
- Modify: `server/src/store.ts` (the `command.type === "battle.order"` block, ~line 1323)
- Modify: `server/test/roblox-attend.test.ts` (new test using the existing `withServer` harness)

**Interfaces:**
- Consumes: `BATTLE_ORDER_CAP` from game-core (store.ts already imports from `../../packages/game-core/src/index.ts` — add to that import).
- Produces: rejection code `ORDER_CAP_REACHED`, message `` `A battle accepts at most ${BATTLE_ORDER_CAP} field orders.` `` Task 5's mirror copies this wording.

- [ ] **Step 1: Failing test** (in roblox-attend.test.ts, after the existing order tests — reuse its helpers to open a battle):

```ts
test("the sixth field order is refused - the cap is the server's", async () => {
  await withServer(async ({ session, state, command, advance }) => {
    // ...same open-battle preamble as the existing "live battle order" test...
    for (let i = 1; i <= 5; i++) {
      const ok = await command(ATTACKER_ID, `order-${i}`, version, {
        type: "battle.order",
        payload: { battleId, sequence: i, squad: "vanguard", x: 2500, y: 2500, atMs: i * 100 },
      });
      assert.equal(ok.body.type, "command.accepted", `order ${i} must land`);
    }
    const sixth = await command(ATTACKER_ID, "order-6", version, {
      type: "battle.order",
      payload: { battleId, sequence: 6, squad: "vanguard", x: 2500, y: 2500, atMs: 700 },
    });
    assert.equal(sixth.body.payload.code, "ORDER_CAP_REACHED");
    // and the accepted count the outcome reads stays 5
  });
});
```

(Adapt the preamble literally from the existing passing order test in the same file; squad ids come from BattleConfig — use the id the existing test uses.)

- [ ] **Step 2: Run: `npm run test:server` — expect FAIL** (sixth order is accepted today).
- [ ] **Step 3: Implement** in the battle.order block, right after the BATTLE_CLOSED check:

```ts
if (nextSequence > BATTLE_ORDER_CAP) {
  return this.reject(envelope.commandId, "ORDER_CAP_REACHED",
    `A battle accepts at most ${BATTLE_ORDER_CAP} field orders.`, currentVersion);
}
```

- [ ] **Step 4: Run full `npm run test:server` — expect all green** (watch the existing multi-order tests: if any issues >5 orders it must be updated deliberately, not silenced — check first, there should be none).
- [ ] **Step 5: Commit** — `feat: server refuses field orders past BATTLE_ORDER_CAP`

---

### Task 4: battle.open extends the realm deadline by +3 minutes

**Files:**
- Modify: `server/src/store.ts` (battle.open acceptance block ~line 1316, after `openBattleSession`)
- Modify: `server/test/roblox-attend.test.ts`

**Interfaces:**
- Produces: constant `ATTENDED_GRACE_MS = 3 * 60_000` in store.ts (module scope, documented). No schema change: it rewrites `local_march_plans.auto_resolve_at`.

- [ ] **Step 1: Failing test:**

```ts
test("opening the battle buys +3 minutes before the realm resolves it", async () => {
  await withServer(async ({ session, state, command, advance, store }) => {
    // preamble: march lands, battle NOT auto-resolved yet (short AUTO_RESOLVE)
    // open the battle, then advance past the ORIGINAL deadline:
    advance(AUTO_RESOLVE);            // past original auto_resolve_at
    store.tick();                      // (use the same advance/settle path the deadline tests in this file use)
    // battle must still be open - attendance bought time
    // then advance a further 3 minutes:
    advance(3 * 60_000);
    store.tick();
    // now the realm resolves it exactly as an unattended battle
  });
}, /* pass a short autoResolveMs via withServer's second arg */);
```

(Write it against the file's real deadline-test helpers — there is at least one existing auto-resolve test in this file or `roblox-battles.test.ts` to copy the settle-path call from. Assert on battle `status` read via `state()`.)

- [ ] **Step 2: Run — expect FAIL** (battle resolves at the original deadline).
- [ ] **Step 3: Implement** in the battle.open acceptance, after `openBattleSession(...)`:

```ts
// Showing up buys time to command: one +3min extension, server-enforced.
// battle.open happens at most once per march, so this cannot be farmed.
const graceUntil = new Date(this.now().getTime() + ATTENDED_GRACE_MS).toISOString();
this.db.prepare(`
  UPDATE local_march_plans SET auto_resolve_at = MAX(auto_resolve_at, ?) WHERE march_id = ?
`).run(graceUntil, String(command.payload.marchId));
```

(SQLite MAX over ISO strings is correct because the format is lexicographic; mirror however the file already compares these — if it compares in JS elsewhere, read the row, compare in JS, write back.)

- [ ] **Step 4: Run full test:server — green.**
- [ ] **Step 5: Commit** — `feat: battle.open extends the auto-resolve deadline by 3 minutes`

---

### Task 5: Luau mirror — client refuses order #6 with a human sentence

**Files:**
- Modify: `roblox/src/server/CommandService.luau` (the `battleOrder` branch)
- Modify: `roblox/scripts/rules-check.luau` (one new rule)

**Interfaces:**
- Consumes: `BattleConfig.ORDER_CAP` (Task 2).

- [ ] **Step 1: Write the failing rule** in rules-check.luau (text rule, same style as existing ones): `CommandService's battleOrder branch must reference BattleConfig.ORDER_CAP` — asserting the literal text `BattleConfig.ORDER_CAP` appears in the battleOrder handler region, so the mirror can never hardcode a drifting number.
- [ ] **Step 2: `npm run test:luau` — expect that rule FAIL.**
- [ ] **Step 3: Implement** in CommandService.luau, in `battleOrder` after `nextSequence` is computed:

```lua
if sequence > BattleConfig.ORDER_CAP then
    return nil, nil, string.format("A battle accepts at most %d field orders.", BattleConfig.ORDER_CAP)
end
```

(`BattleConfig` is already required at the top of the file — verify; add the require if not.)

- [ ] **Step 4: `npm run test:luau` — green.** Server remains authoritative; this is UX-mirror only.
- [ ] **Step 5: Commit** — `feat: client mirror refuses field orders past ORDER_CAP`

---

### Task 6: Determinism gate — identical orders ⇒ identical outcome, twice

**Files:**
- Create: `server/test/battle-determinism.test.ts`

- [ ] **Step 1: Write the test** — run the SAME scripted battle in two fresh stores with the same injected clock and identical commands (open, five identical orders, resolve), and `assert.deepEqual` the two `outcome` payloads. Use the `withServer` harness copied from roblox-attend.test.ts (extract nothing — copy the harness into this file so the test stands alone; both files' harnesses may drift apart and that is fine).
- [ ] **Step 2: Run — expect PASS immediately** (the engine is already seeded off `worldId:marchId:openedAt` and the clock is injected). This test is the tripwire for slices 1–2: any future rally/heartbeat/cap change that sneaks nondeterminism in trips it. If it FAILS now, STOP — that is a real pre-existing bug; report it before continuing.
- [ ] **Step 3: Commit** — `test: determinism gate - identical orders produce identical outcomes`

---

### Task 7: Attend on foot — commander spawn, overhead default, one-tap toggle, orders-left line

**Files:**
- Modify: `roblox/src/client/init.client.luau` (`enterBattle`/`exitBattle`, battle panel)
- Modify: `roblox/src/client/BattleScene.luau` (expose `BattleScene.footAnchor(): Vector3`)
- Modify: `roblox/scripts/rules-check.luau` (rules: overhead is the default; foot anchor sits on the attacker baseline)

**Interfaces:**
- Produces: `BattleScene.footAnchor()` = `center + Vector3.new(0, 3, BattleConfig.FIELD_DEPTH / 2 + 10)` (attacker side is +Z: attacker blocks form at `center + FIELD_DEPTH/2` facing π). Consumed only by init.client.

Design rules implemented here, verbatim from the plan table: "attend-on-foot with commander spawn, overhead one tap away, first battle defaults overhead". Default = ALWAYS overhead on entry (which trivially covers the first battle); WALK THE FIELD is one tap; a second tap returns overhead.

- [ ] **Step 1: Luau rules first** (failing): (a) `enterBattle sets the camera Scriptable overhead before any on-foot option` — text rule asserting the Scriptable+CFrame lines still exist in enterBattle; (b) `the walk-the-field toggle teleports through BattleScene.footAnchor, not a hand-typed offset` — assert `BattleScene.footAnchor` is referenced in init.client.luau; (c) `footAnchor stands on the attacker baseline` — pure-math check requiring the shared constants (FIELD_DEPTH) relation if expressible; otherwise text rule on the formula.
- [ ] **Step 2: `npm run test:luau` — new rules FAIL.**
- [ ] **Step 3: Implement.** In BattleScene.luau:

```lua
function BattleScene.footAnchor(): Vector3
	local scene = state
	if not scene then
		return Vector3.zero
	end
	-- The attacker's edge of the field (+Z), three studs up so the drop is safe.
	return scene.center + Vector3.new(0, 3, BattleConfig.FIELD_DEPTH / 2 + 10)
end
```

In init.client.luau: module-level `local onFoot = false` and `local preBattleCFrame: CFrame? = nil`. In `enterBattle` (existing overhead lines stay the default); add to the battle panel a toggle button (same styling as the panel's existing buttons):

```lua
-- WALK THE FIELD <-> OVERHEAD: view is presentation only; orders and cap
-- are identical in both (red-team rule: device/view never gates a lever).
local function setOnFoot(wanted: boolean)
	onFoot = wanted
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if wanted and root then
		preBattleCFrame = preBattleCFrame or root.CFrame
		root.CFrame = CFrame.new(BattleScene.footAnchor(), BattleScene.center())
		camera.CameraType = Enum.CameraType.Custom
	else
		local center = BattleScene.center()
		camera.CameraType = Enum.CameraType.Scriptable
		camera.CFrame = CFrame.lookAt(center + Vector3.new(0, 118, 128), center)
	end
end
```

`exitBattle` additionally restores: if `preBattleCFrame` and root exist, `root.CFrame = preBattleCFrame`, then `preBattleCFrame = nil; onFoot = false` (existing `camera.CameraType = Custom` line stays). Ground-tap ordering already works in both views (`fieldPointFrom` uses the live camera).

Orders-left: the battle panel's status line (the "Pick a squad…" text) appends `string.format(" Orders left: %d.", math.max(0, BattleConfig.ORDER_CAP - acceptedOrders))` where `acceptedOrders` comes off the battle row already in the snapshot (`battle.acceptedOrders`).

- [ ] **Step 4: Run `npm run test:luau` — green. Then all three gates.**
- [ ] **Step 5: Commit** — `feat: attend on foot - commander spawn, overhead default, one-tap toggle, orders-left`

---

### Task 8: Live Studio verification (the movie is the deliverable)

- [ ] **Step 1:** Kill the stale world server on 4178 (days old, predates all of this); start fresh via `roblox/start-dev.ps1` equivalent: build current branch DB/server, `rojo build roblox/*.project.json` for the dev place (use the same project file start-dev.ps1 uses — read it first).
- [ ] **Step 2:** In Studio (screen permission granted): open the dev place, play, march on a target, attend the battle. Verify with eyes: cobble road + edge trees/rocks + three tinted banners; overhead default; WALK THE FIELD drops the commander at the attacker line facing the fight; toggle back; six order attempts → sixth refused with the sentence; orders-left counts down; leaving restores position.
- [ ] **Step 3:** Screenshot evidence. Any visual wrongness = fix before Task 9; a broken movie does not ship on a green gate.

---

### Task 9: Close out

- [ ] **Step 1:** Rewrite `HANDBACK.md` for the slice branch: built / not built (the "3 unattended cap" deliberately not built — attendance is the only order path; recorded), deviations, how to run, doubts.
- [ ] **Step 2:** Full gates one final time; update `docs/design/2026-08-23-battle-horses-living-city.md` slice table status? NO — the design doc is the plan of record, not a status board; status lives in the vault hub. Skip.
- [ ] **Step 3:** Push branch. NOT merged to main — merge is Adam's word in the morning review.
- [ ] **Step 4:** Vault: Daily bullets, hub `next`, Open Loops (new row or 165 continuation).

## Self-Review

- Spec coverage: dressing+banners (T1), cap (T2/3/5), view-neutral+overhead default+on-foot (T7), deadline +3 (T4), determinism gate (T6), part audits (T1 rules), live look (T8). The slice-table row is fully covered. "3 otherwise" consciously not built — documented in Global Constraints and HANDBACK.
- Types: `BATTLE_ORDER_CAP` (TS) / `BattleConfig.ORDER_CAP` (Luau) / `BattleScene.footAnchor()` consistent across tasks.
- Placeholders: Task 1 step 3 and Task 4 step 1 point at real branch/file content to copy from rather than inventing code that would drift — the executor reads those sources at execution time. Everything else carries its code.
