# Kingsmarch — Canonical Project Brief

> The single source of truth handed to every design specialist alongside their
> assignment. Built 2026-08-22 from **approved, documented sources only** —
> `docs/superpowers/specs/2026-08-20-roblox-world-is-the-game-design.md` (the
> approved design, authority for every rule), the shipped code, and the vault's
> decision record. Nothing here is invented. Anything not established by those
> sources is marked **ASSUMPTION** or lives in *Questions still open*.
>
> The `roblox-design-team` skill requires this file before any deep design
> work. It did not exist for the first five slices; five design calls were made
> without it and are listed under *Questions still open*.

---

## Current planning notice — 2026-09-07

Adam authorized revision of the player-first roadmap and a concrete opening-game specification after the thoroughness audit. Read the [roadmap v2](../plans/2026-09-04-player-first-roadmap.md), [opening specification](../superpowers/specs/2026-09-07-player-first-opening.md), and [decision register](../plans/2026-09-07-player-first-decisions.md) together. The roadmap records the September 4 owner overrides; proposed tuning and new defeat/conquest rules are explicitly marked in the linked documents. They are not implemented features or automatic overrides of existing combat.

Latest explicit owner decisions govern intent; source governs current capability; dated verification governs observed evidence. Architecture locks below remain in force. Older snapshots are historical and must not be used to override the current planning set. A future implementation needs the decisions due for that increment, not every distant shop/season detail.

Current local baseline: practice connection commit 535447d plus five uncommitted Luau display/check fixes from the September 4 playtest. One real local Roblox practice request/result was observed before Adam paused control. The final rebuilt Studio, real-phone planner, comprehension, and captioned practice recording remain unfinished. This September 7 revision changes planning documents only and does not refresh running-app or production state.

- **Game name:** Kingsmarch *(working title, explicitly provisional — Adam,
  2026-08-21. It can **never** ship as "KingsAge": that name belongs to the
  2008 original's owners. Runner-up lane: Emberfall / Realmfall. Full vetting —
  Roblox search collisions, trademark sweep, handles — happens before any
  publish or marketing.)*

- **One-sentence promise:** A persistent medieval war world where your kingdom
  is a *place* you walk, not a menu you read — and you take the world one
  settlement at a time.

- **Target ages:** ages 9 and up. **Owner override, 2026-09-04.** The game
  must be understandable by a capable nine-year-old while retaining strategic
  depth for older players.

- **Maturity target:** age-appropriate medieval conflict with weight and clear
  stakes, **no gore**, and communication suitable for ages 9+. **Owner
  override, 2026-09-04.** Current Roblox maturity and communication policies
  must be checked again before public release.

- **Supported devices:** Roblox on phone, tablet, desktop. **Mobile is the
  baseline** — every interaction must stay readable and responsive on a
  lower-powered phone.

- **Visual style words:** Medieval, grounded, weighty, martial. Settlement,
  owner-detail, HUD, and soldier visuals now exist in source; the old grey-box-only
  statement is superseded. Final visual direction and full-game device acceptance
  remain separate design/evidence tasks.

- **Reference games:** The original KingsAge (2008) and its Tribal Wars
  lineage — persistent map, scout→plan→march→battle→loot, conquest by
  Noblemen, world domination over months.

- **References to avoid copying:** Any protected franchise's map, missions,
  branding, characters, interface, audio, or art direction. The original
  KingsAge's **name** above all.

- **World premise:** A persistent region world. Each Roblox server instance
  hosts a region — several settlements with walkable wilderness between them.
  You can walk to a neighbour's gates and see their walls. Farther settlements
  are reached through the war table map. Settlements are database rows; the
  Gate A fixture is 50×50 (2,500 plots) and the schema scales past it.
  **50+ settlements per player is a long-term design requirement, not a measured
  capacity claim.** Fresh-city admission, bounded alpha capacity, and world/region
  identity must be specified before Phase 2; larger scale remains later.

- **Core player fantasy:** Rule a real place. Walk your own streets, plan war
  from your own table, and watch hundreds of soldiers fight it out in front of
  you over ground you chose.

- **Core player fantasy — expanded 2026-08-22 (Adam):** *"Let's think like
  KingsAge / World of Warcraft but inside Roblox. Fully functioning economy and
  more to do than just war — but that is the entire point of the game. Take over
  the world. Some people might just prefer to become horse breeders and sell to
  warlords who protect them."*

  **War is the point of the world; it is not the only thing to do in it.** The
  headline fantasy stays world domination one settlement at a time. Underneath
  it sits a player-driven economy where a player can specialise — breed horses,
  work iron, run caravans — and prosper by supplying the people who fight,
  without ever fielding an army themselves.

  **Which half of WoW this means, precisely:** its *professions and
  player-driven economy* — the auction house, gathering, crafting, specialists
  who never raid. **Not** its themepark content pipeline: no quest chains, no
  dungeons, no raid tiers, no scripted story. Those need a content factory we do
  not have and will not have. The economy half needs systems, which we can
  build.

- **The roles are emergent, not features.** "Horse breeder protected by a
  warlord" is not something to implement. It appears on its own the moment three
  conditions hold: something only some players can make, a way to move it
  between players, and a maker who cannot defend it alone. Build those three and
  the protection racket, the caravan escort and the supply war write themselves.
  Build "protection contracts" as a feature and it dies.

- **Core loop:**
  `WALK YOUR HOLDING → BUILD & RECRUIT → SCOUT A NEIGHBOUR → PLAN AN ATTACK →
  MARCH → FIGHT (attend or let the realm resolve it) → LOOT / TAKE THE
  SETTLEMENT → HOLD MORE GROUND → REPEAT`

- **Control model:** **On foot from day one** — an explicit Adam override of
  the design team's overhead-first recommendation; the friction cost is
  accepted and mitigated by short walks and a war table near spawn.
  **C-hybrid:** standing at the war table lifts the camera into an overhead
  command view; step away and you are back on your boots. Every building is
  also a real place — proximity interactions do the same commands the table
  does. *The table is convenience; the world is the game.*

- **Launch "trades" (this game's equivalent — the things a player DOES):**
  building, recruiting, scouting, marching, commanding a live battle,
  conquering. All six are built.

- **Social features:** Roblox moderated chat (platform requirement; the custom
  world chat was retired). Alliances exist in the schema; the Market building
  says it "prepares" alliance coordination. **Neither is built.**
  **Adam, 2026-08-22: trade and donation are wanted** — see
  `2026-08-22-economy-and-roles.md`. Donation is alliance-gated, so alliances
  become a prerequisite rather than a someday.

- **Progression model:** Village buildings (13 types, levels), armour upgrades
  at the Smithy (defence only, per Adam 2026-08-22), army size, and settlements
  held. War Victory Points and `villages_conquered` are tracked. **A second,
  parallel track is now intended: economic specialisation** — a player who
  never conquers anything should still have somewhere to go.

- **Soft currency:** Wood, Stone, Iron. Produced by Timber Camp / Stone Quarry
  / Iron Mine, capped by Warehouse, and spent on buildings and troops.
  Population is capped by the Farm.

- **Premium products:** **Future cosmetic expression only. Owner override,
  2026-09-04.** Adam requested a store for armor appearances and outfits.
  Banners, emotes, mounts, and city decoration are valid later candidates.
  Purchases must not add combat power. Products, prices, parental safeguards,
  and current Roblox policy require a separately approved design before build.

- **Session target:** 12–18 minutes for the guided opening (September 4 roadmap).
  Proposed return-session targets and exact tutorial pacing live in the opening
  specification; neither is a measured retention result.

- **Server size target:** *Not established.* Constraint of record: Roblox
  HttpService allows ~500 requests/min per server, respected by batching one
  state pull per heartbeat for everyone on the server. **OPEN.**

- **Historical build status (2026-08-22; not current acceptance):** **Feature-complete against the
  approved spec.** Five slices built, merged and pushed on `main`: the village
  loop, the region world, scouting, the attack round-trip, the live battle
  scene, and conquest. One full self-driving Studio run on 2026-08-21 proved
  scout → attack → battle → squad orders → charge end to end. **Nothing from
  the conquest slice has been seen in Studio.** Gates: 22 Luau files compile,
  16 shared Luau rules, 19 core + 55 server + 41 Roblox-layer tests, four gate
  checkers, three Rojo builds.

- **Current map/build files:** `roblox/default.project.json` (dev),
  `demo.project.json` (self-driving tour), `spike.project.json` (200-troop
  performance spike). World server in `server/`, shared rules in
  `packages/game-core/`.

- **Existing art/assets:** Current source includes settlement/HQ/war-table
  construction and shared soldier rendering. The no-Humanoid mass-troop constraint
  remains. This is existing local content, not a claim that every visual or device
  gate is complete.

- **Known technical constraints:**
  - **Architecture A — Roblox is a window.** The world server holds ALL
    authority. The Roblox server script is the only HTTP speaker, holds the
    shared secret, and holds no authority.
  - **No Humanoids for mass troops** — Roblox's character brain dies at
    ~50–100 instances.
  - **The math and the movie are separate.** No device's frame rate may ever
    change an outcome.
  - The [200-soldier drill](../superpowers/spike-200-troops.md) records a real-phone
    PASS on August 28. It does not prove the full settlement or practice planner;
    measure each new workload separately.
  - Published Roblox servers cannot reach `127.0.0.1`. Hosting has an existing
    [VPS runbook](../ops/vps-runbook.md); verify actual deployment, matching code,
    account eligibility, capacity, recovery, and cost before release. This planning
    update did not inspect or change the live environment.

- **Retention and comprehension:** No measured player-first opening or practice
  comprehension study is recorded in the current planning set. Historical Studio
  and troop-spike phone evidence exists; do not turn it into a retention claim.

- **Current milestone:** Existing war game plus a locally connected practice
  prototype. The broader player-first opening, shield, city admission, new live
  defense, clans, and later economy still require scoped implementation/acceptance.

## Decisions already locked

Do not reopen these without new evidence.

1. **Roblox is the only client.** The GitHub Pages web game is frozen.
2. **A paid always-on world server holds all authority** — chosen specifically
   so offline attacks work.
3. **Architecture A** (Roblox is a window; no local authority, no state cache).
4. **Roblox UserId is the player identity; Roblox-supported moderated communication
   replaces the retired custom external-world chat.** World/clan features must
   respect actual participant eligibility; D-11 defines the technical proof gate.
5. **On foot from day one**, with the C-hybrid war table.
6. **Region world** — chosen over settlements-as-islands and over one seamless
   landmass.
7. **Audience is ages 9+, strategically deep, and no gore.** Updated by Adam
   2026-09-04.
8. **The name can never be "KingsAge."**
9. **Future monetization is cosmetic expression only; no combat power.** The
   exact store remains unapproved. Updated by Adam 2026-09-04.
10. **Preserve the existing authoritative world and proven invariants.** New
    persistent features require explicit migrations and compatibility plans;
    the player-first roadmap does not authorize casually replacing economy or
    conquest rules. Version or drain in-flight battles before a rules transition.

## Questions still open

**Blocking the combat/army pass (2026-08-22):**

- **RESOLVED 2026-08-22 (recorded 2026-08-23): the flat power sum is gone.**
  The real KingsAge engine shipped the same day this brief was written
  (`b1f8183`…`bfa28f3`): three parallel class battles with counters at
  `(loser/winner)^1.5`, the `1.04^level` wall, rams that hit the wall, march
  at slowest unit, and Realm of Power conquest. The old cavalry-domination
  finding predates the migration and is void; cavalry balance under the NEW
  engine has not been re-measured. **What still does not exist: unit
  positions.** The server resolves class totals — no unit stands anywhere.
  Any design that needs "near," "flank," or "local" is unbuildable today.
- **RESOLVED 2026-08-22/23: the on-ramp exists.** Four Freeholds
  (abandoned, lightly-held settlements) ship in every world as the designed
  first rung. Proven live 2026-08-23: a two-wave Realm-of-Power conquest of
  Saltmarsh Freehold completed in the full-game audit.

**Never reviewed — the five solo design calls** made across slices with no
specialist lens and no red team. They work and are proven; none has been
validated as *design*:

1. An attack musters the entire fighting garrison — no partial army selection.
2. **Three** orderable squads, where spec §5 asks for "~10–20 squads that
   think." A spec tension resolved unilaterally.
3. Surrender at 3× power, with the defender's survivors defecting. Marked
   PROPOSED; nobody reviewed it.
4. A two-minute deadline after which the realm fights your battle without you.
5. The unplanned-attack fallback plan, and the intel-currency rule.

**Structural:**

- The opening has a session target; server size and real return-session pacing
  require D-08/D-09 evidence.
- Hosting readiness, deployment compatibility, recovery, cost, and secret management;
  reuse the established provider/runbook rather than treating the old question as new.
- Final art direction and readable building silhouettes; existing visual work is
  preserved, while new scenes still require their own acceptance.
- Alliances and the Market: schema and building exist, neither is built.
- Smithy research has a client interface in source; current rendered behavior and
  phone acceptance still need verification for the tested build.
