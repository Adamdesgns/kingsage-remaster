import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [contracts, fixture, schema, protocol, prototype, campaignSetup, prototypeData] = await Promise.all([
  read("packages/game-core/src/contracts.ts"),
  read("packages/game-core/src/fixture.ts"),
  read("server/db/migrations/0001_gate_a_world.sql"),
  read("server/contracts/command-protocol.md"),
  read("mobile-rebuild/src/Prototype.tsx"),
  read("mobile-rebuild/src/game/CampaignSetup.tsx"),
  read("mobile-rebuild/src/game/prototype-data.ts"),
]);

const failures = [];
const requireText = (source, needle, location) => {
  if (!source.includes(needle)) failures.push(`${location} is missing: ${needle}`);
};

for (const table of [
  "player_profiles",
  "worlds",
  "world_members",
  "kingdoms",
  "villages",
  "village_buildings",
  "village_armies",
  "kingdom_troop_levels",
  "construction_jobs",
  "recruitment_jobs",
  "research_jobs",
  "marches",
  "battle_sessions",
  "battle_orders",
  "alliances",
  "alliance_members",
  "chat_channels",
  "chat_messages",
  "arena_seasons",
  "player_arena_scores",
  "village_conquests",
  "command_inbox",
  "world_events",
]) requireText(schema, `CREATE TABLE ${table}`, "PostgreSQL migration");

for (const command of [
  "village.build.queue",
  "village.recruit.queue",
  "kingdom.research.queue",
  "march.launch",
  "battle.open",
  "battle.order",
  "battle.retreat",
  "alliance.create",
  "alliance.join",
  "alliance.leave",
  "chat.send",
]) {
  requireText(contracts, `\"${command}\"`, "shared contracts");
  requireText(protocol, `\`${command}\``, "command protocol");
}
for (const invariant of [
  "SELECT ... FOR UPDATE",
  "WORLD_VERSION_CONFLICT",
  "server replays the deterministic shared simulation",
  "allows a kingdom to score a specific village only once per world",
]) requireText(protocol, invariant, "command protocol");

requireText(contracts, "GAME_CONTRACT_VERSION = 1", "shared contracts");
requireText(contracts, "conquestWarVictoryPoints", "shared contracts");
requireText(fixture, "createTwoPlayerWorldFixture", "deterministic fixture");
requireText(prototype, 'from "./game/CampaignSetup"', "mobile prototype");
requireText(prototypeData, 'from "../../../packages/game-core/src/contracts"', "prototype data boundary");
requireText(campaignSetup, "function PlanningScreen", "campaign setup module");
if (prototype.includes("function PlanningScreen")) failures.push("PlanningScreen still lives in the integration shell");
if (prototype.includes("function ScoutScreen")) failures.push("ScoutScreen still lives in the integration shell");

if (failures.length) {
  console.error("Gate A architecture check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Gate A architecture check passed: shared contracts, authoritative schema/protocol, deterministic fixture, and client module boundaries are present.");
}
