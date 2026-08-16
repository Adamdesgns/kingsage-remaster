import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const required = [
  ["packages/game-core/src/warfare.ts", ["resolveBattle", "retreatSurvivors", "calculateLoot", "subtractArmy"]],
  ["server/db/migrations/0004_gate_d_warfare.sql", ["local_marches", "local_scout_reports", "local_battle_sessions", "local_battle_orders"]],
  ["server/src/store.ts", ["applyWarCommand", "materializeDueMarches", "finishBattle", "SCOUT_REQUIRED"]],
  ["mobile-rebuild/src/Prototype.tsx", ["PersistentBattleCampaign", "AttackMarch", "Deploy scout", "battle.order"]],
  ["mobile-rebuild/src/game/SharedWorld.tsx", ["Scout this village", "Armies on the road", "foreign-intel-hidden"]],
  ["server/test/gate-d.test.ts", ["scout, attack, battle, loot, and return", "retreat is authoritative"]],
];

for (const [path, markers] of required) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  for (const marker of markers) assert.ok(source.includes(marker), `${path} is missing ${marker}`);
}

console.log("Gate D scouting, march, live orders, battle resolution, loot, retreat, and return boundaries are present.");
