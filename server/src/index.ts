import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorldHttpServer } from "./http.ts";
import { SharedWorldStore } from "./store.ts";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = resolve(process.env.KINGSAGE_DATABASE_PATH ?? joinDefaultDatabase(serverRoot));
const staticRoot = resolve(process.env.KINGSAGE_STATIC_ROOT ?? `${serverRoot}/../mobile-rebuild/dist/client`);
const port = Number(process.env.PORT ?? 4174);

function joinDefaultDatabase(root: string): string {
  return `${root}/data/kingsage-local.sqlite`;
}

mkdirSync(dirname(databasePath), { recursive: true });
const store = new SharedWorldStore(databasePath);
const app = createWorldHttpServer({ store, staticRoot, robloxKey: process.env.KINGSAGE_ROBLOX_KEY });

app.server.listen(port, "127.0.0.1", () => {
  console.log(`KingSage shared world listening at http://127.0.0.1:${port}/?world=shared`);
  console.log(`Persistent local database: ${databasePath}`);
});

async function shutdown(): Promise<void> {
  await app.close();
  store.close();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
