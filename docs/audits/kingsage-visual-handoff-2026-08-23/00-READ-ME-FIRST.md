# 00 — READ ME FIRST

**Package:** KingsAge (Roblox) visual-audit evidence handoff
**Prepared:** 2026-08-23
**Prepared by:** Claude (Opus 5), acting as archivist. Evidence collection only.

---

## The single most important thing to know before you start

**This package contains NO SCREENSHOTS.** Every one of the 37 required
screenshots is recorded as `NOT CAPTURED` in `13-SCREENSHOT-CATALOG.md`.

The reason is not oversight. The agent assembling this package has **no access
to a display, to Roblox Studio's viewport, or to any screen-capture facility**.
It can read the repository, run the test suites, read the world database and
read Roblox's own log files — and it has done all of those — but it cannot see
the game. Screenshots must be captured by Adam.

`13-SCREENSHOT-CATALOG.md` contains exact capture instructions for all 37 shots
so that this gap can be closed in one Studio session.

**An auditor should treat the visual claims in this package as
source-derived, not eye-verified.** Where this document says a building has a
pitched roof, that is because the code that builds the roof was read. It is not
because anyone looked at it.

---

## Repository facts

| | |
|---|---|
| Repository | https://github.com/Adamdesgns/kingsage-remaster |
| Visibility | **UNKNOWN to this agent.** Verify before assuming you can clone it. |
| Branch | `main` |
| Commit SHA | `3c888746d22ed0dec04149a93c52d4abdd43546e` |
| Short SHA | `3c88874` |
| Working tree | **CLEAN** at time of capture |
| Local path | `C:\Users\steam\Projects\apps\kingsage-remaster` (not accessible to the auditor) |
| Roblox experience / place ID | **NOT PUBLISHED.** The game has never been uploaded to Roblox. It exists only as a local `.rbxlx` built from source by Rojo. There is no experience ID to share. |

## Current development milestone

The project describes itself in slices. At this commit:

- Slices one through C (walkable settlement, region world, scouting, battles A
  and B, conquest) are **CURRENTLY IMPLEMENTED** on the server and in code.
- A six-slice combat migration to real KingsAge mechanics is **CURRENTLY
  IMPLEMENTED** (roster, three-class combat, siege, Realm of Power, Freeholds,
  march speed).
- The visual layer received its **first art pass on 2026-08-23** — the same day this
  package was prepared. Before that day the game had *no lighting configuration
  at all* and every surface was one of three greys.

**The visual work is hours old. Judge it as a first pass, not as a considered
art direction.**

## What is included

- Written inventories derived by reading source at commit `3c88874`.
- Verbatim configuration excerpts (palette, materials, lighting, geometry specs).
- A file and code map with exact paths.
- An honest IP provenance review.
- Test and gate evidence.

## What is NOT included, and why

| Missing | Why |
|---|---|
| All 37 screenshots | The agent cannot see a screen. See above. |
| Any performance measurement | **Never taken.** The 200-troop mobile test (drill C5) has never been run on any device. |
| Reference images | The project has never collected any. `reference-images/` is empty and that is the true state. |
| Video | None exists at this commit. |
| `SecretConfig.luau` | Contains the world-server shared secret. Excluded deliberately; it is gitignored. |
| `.env` / credentials / tokens | None are present in this package. |

## How to review this package

1. Read this file.
2. Read `KINGSAGE-VISUAL-AUDIT-HANDOFF.md` — the consolidated document. It is
   self-sufficient for beginning an audit.
3. Use the numbered files for depth on any section.
4. Treat `11-KNOWN-VISUAL-PROBLEMS.md` as the project's own admission list, not
   as a complete audit — that is what you are being asked to produce.

## What you must NOT assume

- **Do not assume anything has been seen.** See the screenshot note above.
- **Do not assume the art is intentional.** Almost all of it is grey-box or a
  first pass from one day.
- **Do not assume performance is acceptable.** It has never been measured.
- **Do not assume the name "KingsAge" is usable.** It is not. See
  `09-ASSET-PIPELINE-AND-PROVENANCE.md`; this is the single largest risk in the
  package.
- **Do not reopen locked architecture.** See `12-LOCKED-DECISIONS-AND-OPEN-QUESTIONS.md`.


## Status vocabulary used throughout this package

Every claim in this package carries one of these tags. They are not decorative;
an auditor should treat an untagged claim as an error in this document.

| Tag | Meaning |
|---|---|
| **CURRENTLY IMPLEMENTED** | Exists in the build at this commit and runs. |
| **FUNCTIONAL BUT PLACEHOLDER** | Works, but the visuals/copy are stand-ins. |
| **GREY-BOX** | Deliberately untextured primitive geometry standing in for art. |
| **TARGETED BUT NOT BUILT** | Named in an approved design doc; no code exists. |
| **EXPERIMENTAL** | Built to answer a question, not to ship. |
| **LOCKED** | A decision Adam has made that is not open for redesign. |
| **PROPOSED** | Written down, awaiting Adam's ruling. |
| **UNKNOWN** | Nobody has measured or checked it. Say so rather than guess. |
