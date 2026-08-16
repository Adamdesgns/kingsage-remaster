# Gate C economy core result — 2026-08-16

## Outcome

The persistent shared world now has a complete server-owned build-and-grow loop. This milestone was implemented and verified locally; nothing was pushed or deployed and the original `index.html` game remains untouched.

## Player-facing loop

- The Village screen is now a visual, tappable capital rather than a building list.
- All 13 structures show their current level, next cost, real duration, prerequisite, strategic effect and maximum level.
- Wood, stone and iron display production per hour and warehouse capacity.
- Farm population includes home troops plus troops already committed to recruitment.
- The Army screen supports separate Recruit and Research modes, order sizes of 1, 5 or 10, unlock explanations, costs, active timers and kingdom-wide troop levels.
- Barracks infantry leads into Smithy research, Stable cavalry, Workshop siege, Academy nobles and Market coordination.
- Completed construction, recruitment and research create recovery notifications when the player returns.

## Authoritative rules

- `packages/game-core/src/economy.ts` ports the original KingSage compounding costs, production, storage, population and eight troop definitions into shared pure TypeScript rules.
- `server/db/migrations/0003_gate_c_economy.sql` adds offline materialization state plus recruitment, research and notification records.
- The world service accrues whole resources from elapsed server time, carries fractions without losing them, respects warehouse caps and advances every due job exactly once.
- Build, recruitment and research commands authenticate village ownership, reserve resources/population transactionally, enforce prerequisites and remain protected by expected world versions and idempotent command IDs.
- Production is materialized at a job's completion timestamp before the new building level takes effect, then advances from that point to the current server time.

## Verification

- `npm run test:gate-c` passes.
- 8 shared-rule tests pass.
- 12 world-service tests pass, including a simulated seven-day close/reconnect for two independent kingdoms.
- Protected mobile runtime integrity, strict TypeScript, Vite production build and Gate A/B/C static boundaries pass.
- Internal iPhone browser QA covered account claim, visual village entry, building selection, real resource deduction, an 18-minute Headquarters queue, a simultaneous five-Spearman recruitment queue, population reservation, lock explanations and the research ladder.
- Fresh browser error log: zero errors.

## Still owned by the larger Gate C/D transition

- The village scene has a stable visual layout, but player-edited defensive placement is not yet saved. That work should be connected directly to the authoritative defender snapshot rather than added as cosmetic drag state.
- Default timings and prices preserve the old strategy rhythm but still need balancing from real play data.
- The running preview on port 4174 was not force-restarted; Adam's open phone tabs remain connected to the older service. The corrected build was verified on an isolated internal port.

## Next move

Connect the world-map target to an authoritative scout report, saved defender layout and stored garrison, then launch a real server-recorded march into the existing Scout → Plan → Phaser battle flow.
