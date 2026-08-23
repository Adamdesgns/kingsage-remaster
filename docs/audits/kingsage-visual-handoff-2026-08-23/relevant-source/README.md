# relevant-source/

Small, essential, **secret-free** configuration and visual-system files copied at
commit `3c88874`. Larger files are referenced by path rather than duplicated —
see `../14-FILE-AND-CODE-MAP.md`.

| File | Why it is here |
|---|---|
| `default.project.json` | The playable place: Lighting and streaming properties |
| `demo.project.json` | The demo place (adds the self-driving tour) |
| `Config.luau` | `WALL_HALF`, `TILE_STUDS`, part-size limit, ground tiler, celebration caps |
| `BattleConfig.luau` | Soldier budget, squads, field geometry |
| `Buildings.luau` | Display names, presets, attack-plan axes |
| `WorldStyle.luau` | **The entire visual system**: palette, materials, lighting |
| `init.server.luau` | Server entry point; shows the `pcall` guard around styling |

## Deliberately NOT copied

- `SecretConfig.luau` — contains the world-server shared secret (gitignored)
- `SettlementBuilder.luau` (~740 lines) and `init.client.luau` (~1,150 lines) —
  read them in the repository at the commit above
- Any `.rbxlx` — build artefacts, regenerable with `rojo build`
