# Kingsmarch (Roblox) — chat handoff, 2026-08-22

Supersedes `HANDOFF-2026-08-21-kingsmarch.md`. That file is still accurate for
slices one through B; read it second, not first.

# ═══ START HERE ═══

**Game:** Kingsmarch — the KingsAge remaster, rebuilt on Roblox against a
Node/TypeScript world server that holds all authority.
**Repo:** `C:\Users\steam\Projects\apps\kingsage-remaster`, branch `main`,
tip `08ef218`, everything pushed.
**Never ship the name "KingsAge"** — it belongs to the 2008 original's owners.
"Kingsmarch" is Adam's provisional working title.

## The one thing to do first

**Press Play in Studio.** It is already open, the world server is already
running, and the world is already seeded. Everything below is downstream of
whether the built game actually works, and **nobody has ever confirmed it does
for the conquest slice.**

Drills `docs/superpowers/drills-conquest.md` D1–D7 are written and **zero have
run**. One press of the ▶ button covers D1–D3 hands-free via the self-driving
demo tour. (F5 is a brightness key on Adam's laptop — use the ▶ button or Fn+F5.)

## Environment as left (2026-08-22 16:44)

Everything is UP and ready. Do not restart it unless it has died:

- **World server LISTENING on 4178**, fresh seeded world at
  `server/data/kingsage-drill-20260822-164344.sqlite`, with
  `KINGSAGE_ROBLOX_KEY=dev-secret-local-0001`,
  `KINGSAGE_AUTO_RESOLVE_MS=25000`, `KINGSAGE_DEV_SEED_NOBLES=5`.
- **5 Noblemen seeded in all 6 villages** — verified by reading the DB.
- **Studio open** (PID 27076) on `roblox/WorldGame-demo.rbxlx`, the demo variant
  with the self-driving tour.
- **rojo is NOT running.** The place was built from source; connect the Rojo
  plugin mid-session if you need live sync.
- Adam's older dev world (`kingsage-local.sqlite`, his Dadisaking86 kingdom) is
  untouched on disk and WAL-checkpointed.

To restart from cold:

```
powershell -ExecutionPolicy Bypass -File roblox\start-dev.ps1 -Fresh
```

⚠️ **`-Fresh` is REQUIRED for the conquest drills.** `seedWorld()` returns early
when a world already exists, so `KINGSAGE_DEV_SEED_NOBLES` only fires at world
*creation*. Against an existing world the NOBLEMEN section reads 0, the demo
tour sends an ordinary raid, and conquest never fires — **with nothing on screen
explaining why.** `-Fresh` uses a new timestamped DB and leaves the old world
alone.

## What happened today, shortest version

1. **Conquest (slice C) shipped and merged** — a village can finally change
   hands. That completed every mechanic the approved spec asked for.
2. **A fatal bug was caught in that work** before it ever ran (below).
3. **Then the whole combat model was found to be from the wrong game.**

---

## State: feature-complete, and now knowingly built on the wrong maths

**Conquest is done and merged** (`df258a1`). The server half already existed and
was tested, but it was **unreachable code** — noblemen could never ride and
nothing could recruit one. Now: a war-table NOBLEMEN section, conquest as an
explicit declaration, and `Celebration.luau` (banner, fireworks, coins, Skip).

**Green at `08ef218`:** 22 Luau files compile, 16 shared Luau rules, 19 core +
55 server + 41 Roblox-layer tests, four gate checkers, three Rojo builds.

**But:** research today established that our combat model is **not a simplified
KingsAge — it is a different, simpler game** that shares KingsAge's economy
curves. See "The research" below. Nothing has been re-implemented; all of that
is design, awaiting Adam.

---

## Three defects found today, all of the same family

Every one was invisible offline and would have cost a Studio session. This is
the dominant failure mode of this project — **write it down and check for it.**

1. **`Celebration.luau` asked for `ReplicatedStorage:WaitForChild("Shared")`.**
   Rojo maps that folder as **`WorldShared`**. `WaitForChild` with no timeout
   yields *forever*, so `require(script:WaitForChild("Celebration"))` on line 28
   of `init.client.luau` would have blocked permanently and taken **the entire
   HUD** down with it. Mine was the only `"Shared"` against six correct
   `"WorldShared"`. Fixed in `bd3d957`.
2. **The dev-seed knob only fires at world creation** — so the drills would have
   failed silently against the existing DB. Fixed with `-Fresh` (`49eb08c`).
3. **`start-dev.ps1` claimed "world server started" when it had not.** A
   `-Fresh` edit landed inside a multi-line `Start-Process -ArgumentList`
   statement, leaving a dangling comma. A `[ScriptBlock]::Create` parse check
   **passed**, because the file was still syntactically valid. Fixed in
   `08ef218`; the script now polls port 4178 and exits non-zero rather than
   lying.

**The lessons, stated plainly:**
- **Parsing is not running.** A clean parse proves nothing about behaviour.
- **A script that reports success unconditionally is worse than one that
  crashes.** Same defect class as the invisible refused orders from the first
  Studio run.
- Never edit inside a multi-line statement you have not read to its end.

### New gate built in response

`roblox/scripts/rules-check.luau` gained a **WIRING** section that reads the
Rojo project files and asserts every `ReplicatedStorage:WaitForChild` name is
either mapped there or created in code, and that every `script:WaitForChild` in
an init script has a sibling module file. **Proven against defect 1:** with it
reintroduced, `check:luau` PASSES and `rojo build` PASSES while the wiring gate
names the file and the folder it wanted.

---

## The Luau gates — both run, and one RUNS the code

**Correction carried forward: Lune was installed all along.** Earlier handoffs
said it was missing; that session had a stale PATH. Both gates work from any
fresh terminal:

- `npm run check:luau` — compiles all 22 Luau files with the real compiler.
- `npm run check:luau-rules` — **executes** the pure shared Luau and asserts 16
  rules, including the exact army table that ships to the world server.
- `npm run test:luau` runs both.

**Why this mattered:** the Node suites drive HTTP routes and never execute a
line of Luau, which is exactly how an empty `villageId` shipped to every command
in slice A. There is now also
`server/test/roblox-luau-contract.test.ts` — it asks the real Luau what army it
builds and hands that to the real routes, where it completes a conquest end to
end. Mutation-checked: renaming a troop in Luau alone leaves `check:luau`
passing and blind while both new gates fail.

---

## The research — our combat came from the wrong game

Full evidence: **`docs/design/2026-08-22-kingsage-mechanics-research.md`**.
Four parallel agents against **Gameforge's still-live KingsAge help pages**
(`s1`–`s33`, `-en` and `-de`), each required to cross-check two sources, tag
every claim CONFIRMED / LIKELY / UNCERTAIN, and say *"not found"* rather than
invent. Eight unanswerable questions are listed so nobody mistakes a gap for a
decision.

**The load-bearing finding: a KingsAge battle is three battles at once.** The
defending army is cloned into three fractional sub-armies, split by the
attacker's **attack-value** share per class (infantry / cavalry / archer), and
three independent battles resolve **in parallel, in rounds**, each losing
`(loser/winner)^1.5`. The three defence values are never collapsed into one.

| We built | Actually is |
|---|---|
| Flat power sum, one defence number | **Neither game.** Both split by class |
| Loyalty 100, −20/35, reset 25 | **Tribal Wars.** KingsAge replaced it in 2009 |
| Troop research 1–10, +8% each | **Tribal Wars.** KingsAge has no combat research |
| Wall `1 + 0.08×L` linear | KingsAge is `1.04^L` (220% at L20) |
| Rams with no wall interaction | Rams hit the wall **twice** |
| No unit speed | Army marches at its **slowest** unit |
| 8 troops | KingsAge has **11** |

Other confirmed mechanics: night bonus **doubles** defence 00:00–08:00; morale
floors a giant's attack on a small player at **30%**; trebuchets never affect
the current battle; **abandoned settlements are the official on-ramp** — taking
one preserves beginner conquest protection while attacking a player ends it.

**Conquest in real KingsAge is "Realm of Power"**: scales to the settlement's
point score (cap 10,000), 2,250–2,750 per surviving Count, **capped at 50% of
maximum per attack so a conquest ALWAYS needs at least two Counts**, regenerates
1% of max per hour, resets to 30% on capture.

---

## Design produced today — all awaiting Adam, none implemented

Read in this order:

1. **`docs/design/CANONICAL-BRIEF.md`** — built today. The
   `roblox-design-team` skill requires it and **it never existed**; five slices
   were built and five design calls made without one.
2. **`docs/superpowers/specs/2026-08-22-combat-and-army-design.md`** — the
   11-unit roster, three-class combat, wall, siege, march speed, settlement
   points, Realm of Power. **Every rule tagged CONFIRMED / INFERRED / OURS /
   SIM.** Migration is **six independently shippable slices**, not one.
3. **`docs/design/2026-08-22-economy-and-roles.md`** — horses, trade, donation.
4. `docs/design/2026-08-22-combat-and-army.md` — the earlier design-team pass.
   **Largely superseded** by the research; keep it for the dominance analysis
   (Light Cavalry is *strictly* dominated by Axemen on all four efficiency axes;
   the Ram is beaten on every axis by six of eight troops).

### Adam's rulings today, do not reopen

- *"I want the exact troops setup they used and the mechanics: we'll use that as
  a base."*
- **One place to train.** *"I'm not visiting 4 places to train an army. The
  barracks is always where troops are trained. The smith is to upgrade their
  armor, the stables is to add horses to the troops to create cavalry."*
  → Function unified, fiction distributed. The Stable/Smithy/Workshop/Academy
  are prerequisites you can see standing in the settlement, **not menus**.
- **Horses are bred**, and the Stable ships with its breeding pair. This makes
  cavalry **rate-limited instead of cash-limited**.
- **Vision expanded:** *"Think like KingsAge / World of Warcraft but inside
  Roblox. Fully functioning economy and more to do than just war... Some people
  might just prefer to become horse breeders and sell to warlords who protect
  them."* → We take WoW's **professions and player economy**, explicitly **not**
  its themepark (no quests, dungeons or raid tiers — that needs a content
  factory we do not have).
- **Trade and donation are wanted.** Trade is ratio-bounded so alt-farming
  cannot be *expressed*; donation is one-way and therefore **alliance-gated**.

### Roughly nine decisions await Adam

Seven have a written recommendation and can proceed unless he objects. Two
genuinely need him:

1. **The night bonus.** KingsAge doubles defence 00:00–08:00 server time. On
   Roblox that is a timezone lottery. Recommendation: a per-player 8-hour
   window. **His call.**
2. **Step 0 — run the drills.** Needs his hands.

---

## What is still owed

- **Drills D1–D7 (conquest) — zero run.** The environment is up for exactly this.
- **Drill C5 — the 200-troop phone measurement.** Still the only thing needing a
  phone. `BattleConfig.MAX_SOLDIERS` is set from it.
- Drills S4–S6, B4–B6, C6 and the by-eye halves.
- **Troops have still never been seen drawn.**
- **The KingsAge battle simulator.** Adam said he would create an account; his
  last message before the handoff request was "done", **which was never
  clarified — ask him whether that meant the account exists.** The simulator
  takes up to 500,000 defending units, needs no troops or buildings, and would
  convert the spec's [INFERRED] tags into measured facts — above all the **unit
  class assignment, which KingsAge never published.** He logs in himself; never
  take his password.
- VPS deploy, name vetting, first art pass.

## Environment traps (carried forward, all still true)

- **Never test service internals from the Studio command bar** — it returns a
  second, uninitialised copy of every module and prints confident false failures.
- **Studio can go windowless** — alive and foregrounded with every window
  invisible. Kill it, `rojo build` fresh, relaunch from the newest
  `%LOCALAPPDATA%\Roblox\Versions\**\RobloxStudioBeta.exe`. On Auto-Recovery
  click **Ignore**, never Delete (it may wipe Blockshore's recovery files).
- **`math.trunc` does not exist in Luau.**
- **Adam is usually NOT at the PC** — he works from his phone. He has denied
  computer-use access several times; **do not keep asking.** Prefer log watchers
  and ffmpeg recording (`gdigrab -i "title=<exact Studio window title>"`).
- **Check which place a Studio process has open before killing it** — one may be
  Blockshore. Use `Get-CimInstance Win32_Process` and read the command line.
- `.clip-site/` in the repo root is a **separate nested git repo** from Aug 15,
  unrelated to this project. Leave it.

## House rules

Vault rituals every session: Daily bullet (`**[Claude]**`), project hub
frontmatter, Dev Log line, **Open Loops row 163** — that row is the only thing
Codex can read, so it carries the durable story. Append beside Codex's entries,
never rewrite. Run `node Projects\tools\vault-check\check.mjs` — this repo is
now mapped in it and verifies clean. Claude does all git; pushing needs no extra
approval. **Propose, then execute.** Never enter Adam's PIN or passwords.
