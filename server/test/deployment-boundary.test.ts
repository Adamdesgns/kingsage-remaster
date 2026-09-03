import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorldHttpServer } from "../src/http.ts";
import { SharedWorldStore } from "../src/store.ts";

const KEY = "deployment-boundary-test-key";

test("hosted defaults cannot admit or act through retired web routes, even with an existing cookie", async () => {
  const store = new SharedWorldStore(":memory:");
  // Model a cookie that predates the switch to Roblox-only admission.
  const previous = store.register({ username: "oldweb", password: "longenough1", kingdomName: "Old Web" });
  const app = createWorldHttpServer({ store, robloxKey: KEY });
  await new Promise<void>((done) => app.server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const before = store.db.prepare("SELECT COUNT(*) AS n FROM local_players").get();
  try {
    for (const [method, path] of [
      ["POST", "/api/auth/register"], ["POST", "/api/auth/login"], ["POST", "/api/auth/logout"],
      ["GET", "/api/session"], ["GET", "/api/world/snapshot"], ["GET", "/api/world/events"],
      ["GET", "/api/world/stream"], ["POST", "/api/world/commands"], ["GET", "/"],
    ]) {
      const response = await fetch(base + path, {
        method,
        headers: { "content-type": "application/json", cookie: `kingsage_session=${previous.token}` },
        ...(method === "POST" ? { body: JSON.stringify({ username: "outsider", password: "longenough1", kingdomName: "Outsider" }) } : {}),
      });
      assert.equal(response.status, 404, `${method} ${path} must remain closed`);
      await response.text();
    }
    assert.deepEqual(store.db.prepare("SELECT COUNT(*) AS n FROM local_players").get(), before);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM local_command_inbox").get()?.n, 0);
    assert.equal((await fetch(base + "/api/health")).status, 200);
    const denied = await fetch(base + "/api/roblox/session", { method: "POST" });
    assert.equal(denied.status, 401);
    const allowed = await fetch(base + "/api/roblox/session", {
      method: "POST", headers: { "content-type": "application/json", "x-kingsage-key": KEY },
      body: JSON.stringify({ robloxUserId: 8123, displayName: "Allowed" }),
    });
    assert.equal(allowed.status, 200);
    assert.ok(store.peekRobloxPlayer(8123));
  } finally {
    await app.close();
    store.close();
  }
});

test("missing hosted key fails closed without exposing web registration", async () => {
  const store = new SharedWorldStore(":memory:");
  const app = createWorldHttpServer({ store });
  await new Promise<void>((done) => app.server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    assert.equal((await fetch(base + "/api/auth/register", { method: "POST" })).status, 404);
    assert.equal((await fetch(base + "/api/roblox/session", { method: "POST" })).status, 503);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM local_players").get()?.n, 0);
  } finally {
    await app.close();
    store.close();
  }
});

test("even an authenticated unknown Roblox route cannot fall back to archived static UI", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kingsmarch-static-boundary-"));
  writeFileSync(join(directory, "index.html"), "ARCHIVED_WEB_TEST_MARKER");
  const store = new SharedWorldStore(":memory:");
  const app = createWorldHttpServer({ store, robloxKey: KEY, staticRoot: directory });
  await new Promise<void>((done) => app.server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    const response = await fetch(base + "/api/roblox/unknown", { headers: { "x-kingsage-key": KEY } });
    assert.equal(response.status, 404);
    assert.ok(!(await response.text()).includes("ARCHIVED_WEB_TEST_MARKER"));
  } finally {
    await app.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
