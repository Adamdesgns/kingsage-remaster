# Kingsmarch (Roblox) — chat handoff, 2026-08-23

Supersedes `HANDOFF-2026-08-22-kingsmarch.md`. That file is accurate for
everything up to the conquest slice; read it second, not first.

# ═══ START HERE ═══

**Game:** Kingsmarch — the KingsAge remaster, rebuilt on Roblox against a
Node/TypeScript world server that holds all authority.
**Repo:** `C:\Users\steam\Projects\apps\kingsage-remaster`, branch `main`,
tip `b2dbe79`, everything pushed, tree clean.
**Never ship the name "KingsAge"** — it belongs to the 2008 original's owners.

## The one thing to understand before doing anything else

**The simulation is mature and tested. The game is not yet something you would
want to look at, and that gap is the whole story of this session.**

Twenty-eight commits landed. The entire six-slice combat migration shipped, the
economy grew a real build queue and a horse profession, and then Adam pressed
Play and found the world had **no floor at all** — and had not had one for two
days. Everything after that was visual work driven by him telling me, screenshot
by screenshot, what was wrong.

**Adam's standing instruction, given late in the session and not negotiable:**

> *"I'm not accepting a low quality anything. You will get this right."*

## Environment as left

- **World server LISTENING on 4178** (pid 30384), world
  `server/data/kingsage-drill-20260823-104347.sqlite`
- **Studio open** (pid 36072) on `roblox/WorldGame-dev.rbxlx` — the PLAYABLE
  place, not the demo
- **rojo is NOT running** and does not need to be. The place is built from
  source. The Rojo plugin warns that it cannot connect; that warning is
  harmless and Adam asked about it — it only matters if you want live sync.

To restart:

```
powershell -ExecutionPolicy Bypass -File roblox\start-dev.ps1 -Play -Fresh
```

- **`-Play`** builds `default.project.json` → `WorldGame-dev.rbxlx`, the place
  you can actually control. **Without it you get the DEMO place, whose
  `DemoTour` calls `Humanoid:MoveTo` on your character in a loop and fights you
  for the controls.** Adam hit this: *"It won't let me look straight just up and
  down."*
- **`-Fresh`** is required whenever you want to see new content. It now stops a
  stale server itself; before today it silently reused one.
- The script seeds `KINGSAGE_DEV_SEED_LEVEL=14`, `KINGSAGE_DEV_SEED_ARMY=axe:120,scout:3`,
  `KINGSAGE_DEV_SEED_NOBLES=5`. **All three are TEST FIXTURES and are named as
  such** — Adam explicitly asked to be told when something is for a test.

---

## What shipped

### The whole combat migration — all six slices

The game now runs **real KingsAge mechanics**, not the Tribal Wars model it was
built on:

- **Three parallel class battles.** The defending army is *cloned* into three
  fractional sub-armies split by the attacker's attack-value share; each resolves
  at `(loser/winner)^1.5` over real rounds.
- **11 units**, all buildable, all trained at the Barracks (Adam's ruling), with
  the other buildings as visible prerequisites.
- **Siege:** rams hit the wall twice — a temporary drop before the fight capped
  at half, then a permanent uncapped drop scored against the *original* level.
  Trebuchets damage buildings and never open the wall.
- **Realm of Power** replaces loyalty. One Count acts per attack; no attack takes
  more than 50% of maximum, so conquest **always** needs at least two attacks;
  settlements regenerate 1%/hour.
- **Freeholds** — abandoned settlements, the designed first rung.
- **March speed** — an army moves at its slowest unit.

### Economy

- **Build queue**: up to 10 orders, charged when a job *starts*, draining by
  itself and catching up correctly across offline time.
- **Kingdoms start with NO troops** (Adam's ruling).
- **Horses**: the Stable arrives with a breeding pair, breeds on a timer capped
  by level, and **cavalry is converted, not trained** — a Crusader is a Berserker
  plus a horse. That makes cavalry rate-limited instead of cash-limited.

### The visual layer — one day old, and the live issue

- **Lighting exists for the first time.** There was none. Future technology
  (set as a *place property*), mid-afternoon sun, real shadows, atmosphere,
  bloom, colour grade. All in `roblox/src/server/WorldStyle.luau`.
- **Buildings are buildings**: per-type materials and roofs, stone footings,
  pitched roofs with ridge beams, windows, chimneys, timber framing.
- **Hollow and enterable** through doorless openings — the front wall is two
  piers under a lintel, because Roblox parts cannot have holes.
- **Everything is scaled off the character** (~5 studs): doorway 9, cottage wall
  12, keep 34, settlement 400 across.
- **Level widens a building; it never makes it taller.**
- **World map** at the war table — because neighbours are 2,300+ studs away and
  the streaming radius is 2,048, so they are *never* visible from your walls.

---

## Five defects that would each have cost a session

Every one reported success while doing nothing. **This is the project's dominant
failure mode and it has now happened five more times.**

1. **The region had no floor for two days.** `RegionGround` was one part sized
   9,540 × 7,780 studs; Roblox refuses anything over 2,048 per axis, so it was
   never created. The build printed its tree count and carried on. Adam played
   over a void. Fixed by tiling (`6a9b6cd`), with three gate rules.
2. **`Lighting.Technology` cannot be set from a script.** It threw, and because
   the styling call sat unguarded at the top of `init.server.luau`, the *entire
   server script* died — no remotes, no settlement, spawn at origin, fall, die,
   repeat. Fixed (`7aa5a40`); styling is now `pcall`-guarded and two rules
   prevent regression.
3. **`-Fresh` silently did nothing** when a server already held 4178. Adam played
   four-hour-old code and saw none of the day's work. Fixed (`58610c3`).
4. **Field orders were being dropped.** The world version bumps whenever any
   village earns wood, so `battle.order` was refused for reasons unrelated to the
   battle — only 1 of 3 orders landed in the live drill. Fixed (`963d09f`).
5. **`emptyArmy()` hardcoded 8 troop keys** while the roster grew to 11, so
   armies came back with undefined counts and battles computed `NaN`. TypeScript
   would have caught it — the project runs `--experimental-strip-types`, which
   *erases* types without checking them. Fixed, and a type-check gate added
   (`b8bbb19`).

**New gates, all mutation-checked** (break the thing, prove the old gates stay
blind, prove the new one names it): `check:types`, `roster-parity.test.ts`, and
five new rules in `rules-check.luau` (now 21).

---

## The drills DID run

Adam pressed Play. Read from the world database, not the screen:

- **D2 PASSES on the command path** — and it is the first time this project has
  ever reached the conquest path in a live session. The tour sent
  `withNobles=true` and the server recorded `noble: 5` on the marching army.
- **D5 FAILED**, and the cause is arithmetic: attacker 875 attack vs defender
  1,828. **An attack musters the whole garrison, and a garrison is defensive
  troops** — Squires defend at 25 and attack at 10. Not the seeded nobles (175 of
  1,828) and not the old combat model (the same armies lose under the new engine
  too).

Recorded with dated lines in `docs/superpowers/drills-conquest.md`.

---

## What is owed, in the order it matters

1. **The visual layer.** Adam's last several messages were all about how it
   looks. He has seen: buildings too big, giant overlapping labels, stick
   villagers he never asked for, dead Upgrade buttons. All fixed, **none of it
   confirmed by him yet.** Press Play and ask.
2. **The external visual audit.** A complete evidence package was built this
   session: `docs/audits/kingsage-visual-audit-package.zip` (59 KB) for upload to
   ChatGPT/Codex. **Its largest gap is that all 37 screenshots are `NOT
   CAPTURED`** — I cannot see a screen. One Studio session closes it; exact
   filenames and camera positions are in `13-SCREENSHOT-CATALOG.md`.
3. **Drill C5 — the 200-troop phone measurement.** Owed since 2026-08-21, never
   run. **No performance number exists for this project on any device.**
4. **The Market**, so horses can move between players. Without it the horse
   profession has no buyer and the "breeder sells to warlords" design cannot
   happen.
5. **Interiors.** Buildings are enterable and completely empty. Nothing inside
   any of them.
6. **~85–88% of the settlement is empty grass.** Either shrink the walls or fill
   it. This is probably why it reads as unfinished.
7. **No audio and no animation exist at all.** Not one `Sound`, not one
   `Animation` object.
8. **The night bonus** — still Adam's call. Built to default to KingsAge's
   behaviour so the decision stays open.

---

## Traps

- **`-Play` or you get the self-driving demo** that steals your controls.
- **`-Fresh` or you are looking at an old world.**
- **Parsing is not running.** A clean `[ScriptBlock]::Create` and a clean
  `check:luau` both prove nothing about behaviour. Verify by outcome.
- **`lune` is NOT on the default shell PATH.** It lives at
  `AppData/Local/Microsoft/WinGet/Packages/Lune.Lune_*/lune.exe`. Run it by full
  path rather than reporting a gate that never executed.
- **Roblox parts cap at 2,048 studs per axis.** Nothing errors when you exceed
  it; the part simply never appears.
- **`Lighting.Technology` cannot be set from a script.** Place property only.
- **Cosmetics must never be load-bearing.** Guard any styling call.
- **Check which place a Studio process has open before killing it** — one may be
  Blockshore.
- **`.clip-site/` is an unrelated nested git repo.** Now gitignored. Never
  `git add -A` without looking.
- **Adam is usually NOT at the PC** — he works from his phone, and he has denied
  computer-use access. Do not keep asking.

## Corrections carried forward

- **There is no KingsAge battle simulator.** The claim was Tribal Wars' simulator
  imported without a source. Both things it was meant to settle were on public
  pages needing no login. See `docs/design/2026-08-22-what-we-actually-need.md`.
- **The Spy is CAVALRY**, not excluded from combat. Ten of eleven inferred
  classes were right; that one was a real bug.
- **Adam revoked the tone/apology protocol** on 2026-08-23: *"NEVER ASK ME FOR AN
  APOLOGY AGAIN. That was a mistake on my part."* His global `CLAUDE.md` has been
  updated. Take the hit and keep working — and check whether he is right on the
  facts first, because on 2026-08-23 he was.

## House rules

Vault rituals every session: Daily bullet (`**[Claude]**`), project hub
frontmatter, Dev Log line, **Open Loops row 163**. Append beside Codex's entries,
never rewrite. Run `node Projects\tools\vault-check\check.mjs`. Claude does all
git; pushing needs no extra approval. **Propose, then execute.** Never enter
Adam's PIN or passwords.
