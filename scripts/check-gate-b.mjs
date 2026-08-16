import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "server/src/store.ts",
  "server/src/http.ts",
  "server/db/migrations/0002_gate_b_local_sqlite.sql",
  "server/test/gate-b.test.ts",
  "mobile-rebuild/src/game/SharedWorld.tsx",
];

const failures = requiredFiles.filter((file) => !existsSync(file)).map((file) => `Missing ${file}`);
const store = readFileSync("server/src/store.ts", "utf8");
const http = readFileSync("server/src/http.ts", "utf8");
const client = readFileSync("mobile-rebuild/src/game/SharedWorld.tsx", "utf8");

for (const [label, source, patterns] of [
  ["world store", store, ["scryptSync", "local_command_inbox", "expectedWorldVersion", "materializeDueJobs", "KINGDOM_NAME_TAKEN", "local_chat_messages"]],
  ["HTTP boundary", http, ["/api/auth/register", "/api/world/snapshot", "/api/world/commands", "/api/world/stream"]],
  ["shared-world client", client, ["Claim your kingdom", "EventSource", "makeCommandEnvelope", "Upgrade Barracks", "WorldNavigation", "ArmyView", "ChatView"]],
]) {
  for (const pattern of patterns) {
    if (!source.includes(pattern)) failures.push(`${label} is missing ${pattern}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Gate B architecture check passed: account auth, durable world storage, ordered commands, realtime reconnect, and phone world UI are present.");
}
