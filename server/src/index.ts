import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorldHttpServer } from "./http.ts";
import { SharedWorldStore } from "./store.ts";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = resolve(process.env.KINGSAGE_DATABASE_PATH ?? joinDefaultDatabase(serverRoot));
const staticRoot = resolve(process.env.KINGSAGE_STATIC_ROOT ?? `${serverRoot}/../mobile-rebuild/dist/client`);
const port = Number(process.env.PORT ?? 4174);
// How long an arrived attack waits at the walls for its commander before the
// server fights it without them. Overridable so a demo recording does not have
// to sit through the production wait; unset means the store's own default.
const rawAutoResolve = Number(process.env.KINGSAGE_AUTO_RESOLVE_MS);
const autoResolveMs = Number.isFinite(rawAutoResolve) && rawAutoResolve > 0 ? rawAutoResolve : undefined;
// DEV ONLY: seed Noblemen into every village so the conquest path can actually
// be walked in a Studio session. A conquest needs three to five of them, at
// 900s each, which no recording can sit through. Unset in production.
const rawSeedNobles = Number(process.env.KINGSAGE_DEV_SEED_NOBLES);
const devSeedNobles = Number.isFinite(rawSeedNobles) && rawSeedNobles > 0 ? rawSeedNobles : undefined;

// DEV ONLY, and a TEST FIXTURE rather than a game rule: an offensive army so a
// Studio drill can fight without sitting through real training first. A kingdom
// genuinely starts with nothing now, which is right for the game and useless
// for a ten-minute recording.
//
// Format: "axe:60,scout:2" — troop id, colon, count, comma separated.
// Never fires unless the variable is set, and never touches a Freehold.
function parseDevSeedArmy(raw: string | undefined): Record<string, number> | undefined {
  if (!raw) return undefined;
  const army: Record<string, number> = {};
  for (const entry of raw.split(",")) {
    const [troop, count] = entry.split(":");
    const parsed = Number(count);
    if (troop && Number.isFinite(parsed) && parsed > 0) army[troop.trim()] = Math.floor(parsed);
  }
  return Object.keys(army).length > 0 ? army : undefined;
}
const devSeedArmy = parseDevSeedArmy(process.env.KINGSAGE_DEV_SEED_ARMY);

function joinDefaultDatabase(root: string): string {
  return `${root}/data/kingsage-local.sqlite`;
}

mkdirSync(dirname(databasePath), { recursive: true });
const store = new SharedWorldStore(databasePath, { autoResolveMs, devSeedNobles, devSeedArmy });
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
