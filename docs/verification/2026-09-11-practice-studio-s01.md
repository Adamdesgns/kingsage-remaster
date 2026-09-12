# Practice siege Studio pack — S-01 observed; G-01 still open

**Date:** 2026-09-11
**Recorded by:** [Cursor], from Adam + Morgan’s Studio pack on Bot Door / iPhone XR emulator.
**Observed source:** `cursor/practice-phase1-d06-c4e2` tip `41d541e` (code increment `01e173f`).
**Place:** `roblox/WorldGame-dev.rbxlx`.
**Device:** Studio device emulator, iPhone XR landscape **896×414**. Not a physical phone.

This note records what was actually seen. It does **not** close G-01.

## S-01 — observed PASS

Adam + Morgan ran **S-01 Reset teaching plan** in Studio Play: War → Practice siege, no redraw, **Try this plan**.

Observed result panel:

- Banner: **FORT TAKEN**
- Losses: **Vanguard 5 / Archers 5 / Riders 4**
- Training-only line present: `Training only. Your city troops and stock did not change.`

That matches the pinned `PRACTICE_WINNING_GATE_PLAN` fixture. Do not invent a different winning route from this frame.

A captured result-panel image from that run was provided in the agent thread. Keep Studio proof outside the repo (continue the dated Kingmarch proof folder). This file is the written record, not the screenshot store.

## Scroll blocker seen on the same session

The war-table list **did not scroll with the mouse wheel** on the iPhone XR emulator. A finger-style drag was required. That blocked reaching **Practice siege** until Adam helped.

Root cause in source (investigated after the session, not proven live on the new build):

1. Studio device emulation treats the viewport as a touch device, so native `ScrollingFrame` mouse-wheel is ignored.
2. The War / Village / practice Body is packed with Active `TextButton`s. Native drag-to-scroll only sees the tiny gaps and labels; a drag that starts on a 44px action row is eaten by the button.

Client fix on the continuation branch: `roblox/src/client/TouchScroll.luau` writes `CanvasPosition` for wheel and for a drag that starts on a button, suppresses that click after the drag threshold, and stays out of `RouteCanvas` drawing / `ScrollingEnabled == false`. The Body scrollbar is 10px and stays visible. **This fix is source + Luau-stub verified, not Studio-verified.**

**PC follow-up, 2026-09-11 evening ([Cursor] on Adam's PC):** the helper was reviewed against Roblox input semantics and two defects were fixed before any Studio run — the wheel hit-test used raw-screen `GetMouseLocation` against inset-space `AbsolutePosition`, and drags had no input identity so a second finger could steer the list or re-arm buttons. `Body.ElasticBehavior` is now `Never` so native overshoot cannot fight the helper's clamp. `check:touch-scroll` is 11 checks. The dev place was rebuilt with Rojo from that tip (SHA256 `D6CAE113…AFEC`). Still **not Studio-verified**; see `HANDBACK.md`.

Adam mitigation until the rebuilt place is Play-tested: drag on the list (not only the wheel); look for the thicker gold scrollbar. Practice siege is the first War-tab action, not a Village-tab row.

## Remaining pack rows — still not verified

| ID | Status after 2026-09-11 |
|---|---|
| S-01 | **Studio PASS** on `41d541e` / iPhone XR emulator 896×414 |
| S-02 | not run |
| S-03 | not run |
| S-04 | not run |
| S-05 | not run |
| S-06 | not run |
| S-07 | not run (drawing vs scrolling). The scroll helper is new; re-check after rebuild. |
| S-08 | not run |
| S-09 | **not verified** — physical phone was not used |
| S-10 | automated persistence probe; rerun on the continuation tip |

Unfamiliar-player understanding was **not** verified. Coaching was required to reach Practice siege. That is evidence G-01 stays open, not evidence it closed.

## What this does not authorize

- Closing G-01
- Phase 2 opening / shield / real PvP / clans / shop
- Any D-02 / OPEN-21 first-war rule
- Merge to `main`, deploy, publish, or Roblox live
