import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWorldHttpServer } from "../src/http.ts";
import { createRateLimiter } from "../src/rate-limit.ts";
import { SharedWorldStore } from "../src/store.ts";

const KEY = "practice-test-secret-0123456789";
const USER_ID = 994201;
const GOOD_REQUEST = {
  version: 1,
  routes: {
    vanguard: [{ x: 50, y: 5 }, { x: 50, y: 34 }, { x: 50, y: 88 }],
    archers: [{ x: 10, y: 5 }, { x: 28, y: 34 }, { x: 28, y: 48 }, { x: 50, y: 88 }],
    riders: [{ x: 90, y: 5 }, { x: 72, y: 34 }, { x: 72, y: 48 }, { x: 50, y: 88 }],
  },
  objectives: { vanguard: "gate", archers: "westTower", riders: "eastTower" },
  defensePlan: "guardGate",
};

async function withServer(
  run: (context: { base: string; store: SharedWorldStore }) => Promise<void>,
  commandRateLimit?: ReturnType<typeof createRateLimiter>,
  legacyWebEnabled = false,
) {
  const directory = mkdtempSync(join(tmpdir(), "kingsmarch-practice-api-"));
  const store = new SharedWorldStore(join(directory, "world.sqlite"), { now: () => new Date("2026-09-04T12:00:00.000Z") });
  const app = createWorldHttpServer({ store, robloxKey: KEY, commandRateLimit, legacyWebEnabled });
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address() as { port: number };
  try { await run({ base: `http://127.0.0.1:${address.port}`, store }); }
  finally { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
}

function post(base: string, path: string, body: unknown, key = KEY) {
  return fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-kingsage-key": key }, body: JSON.stringify(body) });
}

function command(commandId: string, request: unknown = GOOD_REQUEST, expectedWorldVersion = -999) {
  return { robloxUserId: USER_ID, commandId, expectedWorldVersion, command: { type: "practice.siege.resolve", payload: request } };
}

function databaseFact(store: SharedWorldStore): string {
  const tables = (store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>);
  return JSON.stringify(tables.map(({ name }) => ({ name, rows: store.db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all() })));
}

test("a linked Roblox player resolves practice twice identically without touching persistent state", async () => {
  await withServer(async ({ base, store }) => {
    await post(base, "/api/roblox/session", { robloxUserId: USER_ID, displayName: "Practitioner" });
    const before = databaseFact(store);
    const worldVersionBefore = (store.db.prepare("SELECT version FROM local_worlds ORDER BY id LIMIT 1").get() as { version: number }).version;
    const first = await post(base, "/api/roblox/commands", command("practice-repeat"));
    const second = await post(base, "/api/roblox/commands", command("practice-repeat"));
    assert.equal(first.status, 200, await first.clone().text());
    assert.equal(second.status, 200, await second.clone().text());
    const firstBody = await first.json() as any;
    const secondBody = await second.json() as any;
    assert.deepEqual(secondBody, firstBody);
    assert.equal(firstBody.type, "command.accepted");
    assert.equal(firstBody.payload.commandId, "practice-repeat");
    assert.equal(firstBody.payload.practiceSiege.mode, "practice");
    assert.deepEqual(firstBody.payload.practiceSiege.validated, GOOD_REQUEST);
    assert.ok(firstBody.payload.practiceSiege.reasons.length > 0);
    assert.equal(databaseFact(store), before, "practice must not write even an idempotency-inbox row");
    assert.equal(firstBody.payload.worldVersion, worldVersionBefore, "worldVersion is informational compatibility data, not a practice mutation");
    assert.equal((store.db.prepare("SELECT version FROM local_worlds ORDER BY id LIMIT 1").get() as { version: number }).version, worldVersionBefore);
  });
});

test("practice still requires the Roblox key and a linked Roblox identity", async () => {
  await withServer(async ({ base, store }) => {
    const badKey = await post(base, "/api/roblox/commands", command("bad-key"), "wrong-key");
    assert.equal(badKey.status, 401);
    assert.equal(store.peekRobloxPlayer(USER_ID), null);
    const unknown = await post(base, "/api/roblox/commands", command("unknown"));
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json() as any).error.code, "UNKNOWN_ROBLOX_USER");
  });
});

test("invalid practice input is a controlled 400 and writes nothing", async () => {
  await withServer(async ({ base, store }) => {
    await post(base, "/api/roblox/session", { robloxUserId: USER_ID, displayName: "Practitioner" });
    const before = databaseFact(store);
    const malformed = structuredClone(GOOD_REQUEST) as any;
    malformed.routes.vanguard.push({ x: 50, y: 89 }, { x: 50, y: 90 }, { x: 50, y: 91 }, { x: 50, y: 92 });
    const response = await post(base, "/api/roblox/commands", command("invalid-practice", malformed));
    assert.equal(response.status, 400, await response.clone().text());
    const body = await response.json() as any;
    assert.equal(body.type, "command.rejected");
    assert.equal(body.payload.code, "INVALID_PRACTICE_SIEGE");
    assert.match(body.payload.message, /routes\.vanguard/);
    assert.equal(databaseFact(store), before);

    const decimal = structuredClone(GOOD_REQUEST) as any;
    decimal.routes.archers[0].x = 10.5;
    const decimalResponse = await post(base, "/api/roblox/commands", command("decimal-practice", decimal));
    assert.equal(decimalResponse.status, 400, await decimalResponse.clone().text());
    const decimalBody = await decimalResponse.json() as any;
    assert.equal(decimalBody.type, "command.rejected");
    assert.equal(decimalBody.payload.code, "INVALID_PRACTICE_SIEGE");
    assert.match(decimalBody.payload.message, /whole grid|integer/i);
    assert.equal(databaseFact(store), before, "a decimal route cannot leave an inbox or world mutation");
  });
});

test("practice uses the command limiter but ignores a stale world version", async () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
  await withServer(async ({ base }) => {
    await post(base, "/api/roblox/session", { robloxUserId: USER_ID, displayName: "Practitioner" });
    const accepted = await post(base, "/api/roblox/commands", command("practice-stale", GOOD_REQUEST, -999_999));
    assert.equal(accepted.status, 200, await accepted.clone().text());
    const limited = await post(base, "/api/roblox/commands", command("practice-limited"));
    assert.equal(limited.status, 429);
    assert.equal((await limited.json() as any).payload.code, "RATE_LIMITED");
  }, limiter);
});

test("the retired web command path cannot invoke the stateless practice resolver", async () => {
  await withServer(async ({ base, store }) => {
    const account = store.register({ username: "legacy_practice", password: "long-enough-password", kingdomName: "Legacy Practice" });
    const cookie = `kingsage_session=${encodeURIComponent(account.token)}`;
    const worldId = store.worldIdForKingdom(account.player.kingdomId);
    const response = await fetch(`${base}/api/world/commands`, {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ contractVersion: 1, commandId: "legacy-practice", worldId, actorPlayerId: account.player.id,
        expectedWorldVersion: 1, issuedAt: "2026-09-04T12:00:00.000Z", command: { type: "practice.siege.resolve", payload: GOOD_REQUEST } }),
    });
    // Legacy routes are disabled in production; even an explicitly enabled
    // test surface would still reach the store allowlist and refuse this type.
    assert.equal(response.status, 409);
    assert.equal((await response.json() as any).payload.code, "INVALID_COMMAND");
  }, undefined, true);
});
