# 06 — UI and UX Inventory

Source: `roblox/src/client/init.client.luau` (~1,100 lines), plus
`BattleScene.luau` and `Celebration.luau`.

**All UI is constructed in code.** There is no `StarterGui` layout, no theme
file, no design tokens, and no shared component library. Colours and sizes are
hard-coded inline at each call site.

## Screens and states

| # | Screen / state | Status | Notes |
|---|---|---|---|
| 1 | Resource HUD (Wood / Stone / Iron) | **CURRENTLY IMPLEMENTED** | Top of screen |
| 2 | Construction queue readout | **CURRENTLY IMPLEMENTED** | Top-right; shows "No work queued" when idle |
| 3 | Building interaction (ProximityPrompt) | **CURRENTLY IMPLEMENTED** | "Upgrade" / building name |
| 4 | Recruitment prompt at Barracks | **CURRENTLY IMPLEMENTED** | Preset-driven |
| 5 | War table — Village tab | **CURRENTLY IMPLEMENTED** | Horses, 13 buildings, Upgrade buttons |
| 6 | War table — War tab | **CURRENTLY IMPLEMENTED** | Scouts, neighbours, attack plan, marches, reports, noblemen |
| 7 | War table — Map tab | **CURRENTLY IMPLEMENTED** | Added 2026-08-23 |
| 8 | Attack planning (4 axes) | **CURRENTLY IMPLEMENTED** | Entry / troops / time / style |
| 9 | Two-tap attack arming | **CURRENTLY IMPLEMENTED** | Arms for 6s, disarms on conquest toggle |
| 10 | Scout reports | **CURRENTLY IMPLEMENTED** | Army, resources, buildings of target |
| 11 | Battle reports | **CURRENTLY IMPLEMENTED** | Outcome cards, replay offer |
| 12 | Battle scene HUD (3 squads, Charge, Fall back) | **CURRENTLY IMPLEMENTED** | `BattleScene.luau` |
| 13 | Conquest celebration | **CURRENTLY IMPLEMENTED** | `Celebration.luau`; **never observed** |
| 14 | "Step away from the table" exit | **CURRENTLY IMPLEMENTED** | |
| 15 | Command rejected toast | **CURRENTLY IMPLEMENTED** | Server refusal text shown verbatim |
| 16 | Command accepted feedback | **CURRENTLY IMPLEMENTED** | Logged + state refresh |
| 17 | Session / connection status | **CURRENTLY IMPLEMENTED** | `status: connecting` printed; UI surface unverified |
| 18 | Outdated-version modal | **CURRENTLY IMPLEMENTED** | `outdatedModal` exists in source |
| 19 | Empire management (multi-settlement) | **NOT BUILT** | |
| 20 | Formations UI | **NOT BUILT** | Three fixed squads only |
| 21 | Incoming-attack warning | **NOT BUILT** | |
| 22 | Surrender UI | **NOT BUILT** | Surrender resolves server-side, no UI |
| 23 | Loading screen | **NOT BUILT** | |
| 24 | "Realm is waking" state | **NOT BUILT** as a distinct screen |
| 25 | Pending-command spinner | **NOT BUILT** |
| 26 | Reconnecting UI | **NOT BUILT** | Retry backoff exists in `Config.SESSION_RETRY_SECONDS`; no UI |
| 27 | Stale-state indicator | **NOT BUILT** |
| 28 | Disabled-interaction styling | **NOT BUILT** | A maxed building still shows a live "Upgrade" button |
| 29 | Empty-state copy | **PARTIAL** | Some sections have notes; not systematic |
| 30 | Error state | **PARTIAL** | Toast only |
| 31 | Mobile HUD | **NOT BUILT** | No mobile-specific layout exists |
| 32 | Controller focus / gamepad | **NOT BUILT** |
| 33 | Tooltips | **NOT BUILT** |
| 34 | Settings | **NOT BUILT** |

## Measured UI facts

| Property | Value |
|---|---|
| War-table panel | 340 px wide, `1, -120` tall, at (8, 84) |
| Panel background | `Color3.fromRGB(15,15,22)` @ 0.15 transparency |
| Tab bar | 36 px tall, three tabs at 1/3 width each |
| Tab active / inactive | `(55,65,90)` / `(28,28,36)` |
| Tab font | `GothamBold`, `TextScaled = true` |
| Building label | 120 × 20 px, `Merriweather` 13, fades at 130 studs |
| Upgrade button colour | `(50,70,50)` |
| Recruit row colour | `(40,30,30)` |
| Map canvas | 300 × 300 px |

## Touch targets

**UNKNOWN / likely inadequate.** Panel rows are 36 px tall in a 340 px panel.
Apple and Google both recommend ~44 px minimum. **No mobile testing has been
done**, and no layout adapts to screen size.

## Information hierarchy

**Assessment (opinion):** weak. Every row in the Village tab is the same weight,
so a maxed building and an affordable upgrade look identical. There is no
grouping, no separation of "can act" from "cannot", and no visual priority.

## Known problems

1. **No theme.** Every colour is a magic number at a call site.
2. **`TextScaled` used widely** — text size varies by container, which will
   behave unpredictably on a phone.
3. **Dead controls.** A building at max level still renders an "Upgrade" button
   that the server will refuse.
4. **No mobile layout at all.**
5. **No loading/reconnect/pending states**, so the game appears frozen during
   any server delay.
