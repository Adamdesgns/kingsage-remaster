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

- **Game name:** Kingsmarch *(working title, explicitly provisional — Adam,
  2026-08-21. It can **never** ship as "KingsAge": that name belongs to the
  2008 original's owners. Runner-up lane: Emberfall / Realmfall. Full vetting —
  Roblox search collisions, trademark sweep, handles — happens before any
  publish or marketing.)*

- **One-sentence promise:** A persistent medieval war world where your kingdom
  is a *place* you walk, not a menu you read — and you take the world one
  settlement at a time.

- **Target ages:** ~13+.

- **Maturity target:** Roblox "Moderate"-leaning. Grittier palette and
  weightier combat than Blockshore; **no gore** (platform cap regardless).
  **Blockshore's kid-safe word-ban explicitly does NOT apply to this game.**
  Knowingly accepts the younger-audience tradeoff on a young-skewing platform.

- **Supported devices:** Roblox on phone, tablet, desktop. **Mobile is the
  baseline** — every interaction must stay readable and responsive on a
  lower-powered phone.

- **Visual style words:** Medieval, grounded, weighty, martial. Currently
  grey-box by design (spec §7). *No art pass has ever been scheduled.*

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
  **50+ settlements per player is a supported requirement.**

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

- **Premium products:** **None. Monetization has never been discussed and is
  deliberately absent from the approved design.** Do not propose any without
  Adam raising it first.

- **Session target:** *Not established.* **OPEN.**

- **Server size target:** *Not established.* Constraint of record: Roblox
  HttpService allows ~500 requests/min per server, respected by batching one
  state pull per heartbeat for everyone on the server. **OPEN.**

- **Current build status (2026-08-22):** **Feature-complete against the
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

- **Existing art/assets:** **None.** Grey parts with floating labels. Soldiers
  are six anchored parts each, tinted by squad, with no Humanoid — a
  performance rule from the 200-troop spike, not a placeholder rig.

- **Known technical constraints:**
  - **Architecture A — Roblox is a window.** The world server holds ALL
    authority. The Roblox server script is the only HTTP speaker, holds the
    shared secret, and holds no authority.
  - **No Humanoids for mass troops** — Roblox's character brain dies at
    ~50–100 instances.
  - **The math and the movie are separate.** No device's frame rate may ever
    change an outcome.
  - The 200-troop budget has **never been measured on a phone**; the battle
    scene ships an adaptive budget instead of a known one.
  - Published Roblox servers cannot reach `127.0.0.1` — a public place needs
    the VPS deploy, which is not done.

- **Current retention or playtest data:** **None.** Zero external players. No
  telemetry. 9 of 25 written drills carry dated PASS lines.

- **Current milestone:** Between VERTICAL SLICE and ALPHA. Every core system
  exists and is server-authoritative; none has been played by anyone but its
  author.

## Decisions already locked

Do not reopen these without new evidence.

1. **Roblox is the only client.** The GitHub Pages web game is frozen.
2. **A paid always-on world server holds all authority** — chosen specifically
   so offline attacks work.
3. **Architecture A** (Roblox is a window; no local authority, no state cache).
4. **Roblox UserId replaces auth; Roblox moderated chat replaces world chat.**
5. **On foot from day one**, with the C-hybrid war table.
6. **Region world** — chosen over settlements-as-islands and over one seamless
   landmass.
7. **Audience is teen (~13+), Moderate-leaning, no gore.**
8. **The name can never be "KingsAge."**
9. **No monetization.**
10. **The world server lives and barely changes** — command/event protocol,
    economy rules, schema.

## Questions still open

**Blocking the combat/army pass (2026-08-22):**

- **The "deterministic combat math" the spec locked as *lives, barely changes*
  turns out to be a flat power sum** — one total versus another, with no troop
  counters. Under it, Axemen strictly dominate Light Cavalry on both
  attack-per-population and attack-per-resource; "fast flanking" cavalry has no
  speed system at all; and Battering Rams have **zero** wall interaction
  despite wall-breaking being their entire stated role. This brief records that
  as a **falsified assumption**, not a locked decision.
- **There is no on-ramp.** Every village in the fixture carries an identical
  garrison behind an identical wall, so a fresh kingdom loses every attack it
  can afford. "Take over the world one settlement at a time" currently has no
  first rung.

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

- Session target and server size target.
- VPS provider, deploy story, and secret management.
- Art direction — no pass has ever been scheduled. Claude's standing (unapproved)
  suggestion is a **silhouette pass** (distinct shape/roof/colour per building,
  so a Timber Camp reads as one without its label) before any mesh work.
- Alliances and the Market: schema and building exist, neither is built.
- Smithy research is reachable on the server and has no interface.
