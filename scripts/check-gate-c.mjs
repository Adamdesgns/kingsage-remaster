import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const required = [
  ["packages/game-core/src/economy.ts", ["BUILDINGS", "TROOPS", "buildingRequirementProblem", "troopResearchCost"]],
  ["server/db/migrations/0003_gate_c_economy.sql", ["local_village_economy", "local_recruitment_jobs", "local_research_jobs"]],
  ["server/src/store.ts", ["materializeDueJobs", "queueRecruitment", "queueResearch", "VillageEconomy"]],
  ["mobile-rebuild/src/game/SharedWorld.tsx", ["village-scene", "gate-c-army-roster", "research-grid", "QueueClock"]],
  ["server/test/gate-c.test.ts", ["seven days offline", "independent completed queues"]],
];

for (const [path, markers] of required) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  for (const marker of markers) assert.ok(source.includes(marker), `${path} is missing ${marker}`);
}

console.log("Gate C economy, progression, and persistent queue boundaries are present.");
