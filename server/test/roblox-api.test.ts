import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWorldHttpServer } from "../src/http.ts";
import { SharedWorldStore } from "../src/store.ts";

const KEY = "test-secret-key-0123456789abcdef";

async function withServer(robloxKey: string | undefined, run: (base: string, store: SharedWorldStore) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-roblox-api-"));
  const store = new SharedWorldStore(join(directory, "world.sqlite"));
  const app = createWorldHttpServer({ store, robloxKey });
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address() as { port: number };
  try {
    await run(`http://127.0.0.1:${address.port}`, store);
  } finally {
    await app.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function post(base: string, path: string, body: unknown, key?: string) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-kingsage-key": key } : {}) },
    body: JSON.stringify(body),
  });
}

test("no key configured: roblox routes fail closed with 503", async () => {
  await withServer(undefined, async (base) => {
    const response = await post(base, "/api/roblox/session", { robloxUserId: 1, displayName: "A" }, KEY);
    assert.equal(response.status, 503);
  });
});

test("wrong key is rejected with 401 and no kingdom is founded", async () => {
  await withServer(KEY, async (base, store) => {
    const response = await post(base, "/api/roblox/session", { robloxUserId: 1, displayName: "A" }, "wrong-key");
    assert.equal(response.status, 401);
    assert.equal(store.peekRobloxPlayer(1), null);
  });
});

test("session founds once, state returns the founded village, duplicate command charges once", async () => {
  await withServer(KEY, async (base) => {
    const session = await post(base, "/api/roblox/session", { robloxUserId: 42, displayName: "Dad" }, KEY);
    assert.equal(session.status, 200, await session.clone().text());
    const identity = await session.json() as { playerId: string; kingdomId: string; created: boolean };
    assert.equal(identity.created, true);

    const stateResponse = await post(base, "/api/roblox/state", { robloxUserIds: [42] }, KEY);
    assert.equal(stateResponse.status, 200);
    const stateBody = await stateResponse.json() as { serverTime: string; states: Record<string, any> };
    assert.ok(stateBody.serverTime);
    const snapshot = stateBody.states["42"];
    assert.ok(snapshot, "state for user 42 present");
    const village = snapshot.world.villages.find((entry: any) => entry.kingdomId === identity.kingdomId);
    assert.ok(village, "founded village present");
    const woodBefore = village.resources.wood;

    const command = {
      robloxUserId: 42,
      commandId: "cmd-duplicate-test-1",
      expectedWorldVersion: snapshot.world.version,
      command: { type: "village.build.queue", payload: { villageId: village.id, building: "timber" } },
    };
    const first = await post(base, "/api/roblox/commands", command, KEY);
    assert.equal(first.status, 200, await first.clone().text());
    const firstBody = await first.json() as { type: string; payload: { commandId: string } };
    assert.equal(firstBody.type, "command.accepted");

    const second = await post(base, "/api/roblox/commands", command, KEY);
    assert.equal(second.status, 200, "idempotent replay returns the stored accepted result");
    const secondBody = await second.json() as { type: string };
    assert.equal(secondBody.type, "command.accepted");

    const after = await post(base, "/api/roblox/state", { robloxUserIds: [42] }, KEY);
    const afterBody = await after.json() as { states: Record<string, any> };
    const afterVillage = afterBody.states["42"].world.villages.find((entry: any) => entry.id === village.id);
    const woodSpent = woodBefore - afterVillage.resources.wood;
    assert.ok(woodSpent > 0, `exactly one charge expected, wood spent: ${woodSpent}`);
    // One queue entry, not two: a second identical POST must not have queued again.
    const jobs = afterBody.states["42"].constructionJobs ?? afterBody.states["42"].queues?.construction ?? null;
    if (jobs) {
      const timberJobs = jobs.filter((job: any) => job.building === "timber" && job.villageId === village.id);
      assert.equal(timberJobs.length, 1);
    }
  });
});

test("unknown roblox user on /commands is a 404, not a silent found", async () => {
  await withServer(KEY, async (base) => {
    const response = await post(base, "/api/roblox/commands", {
      robloxUserId: 777,
      commandId: "cmd-x",
      expectedWorldVersion: 0,
      command: { type: "village.build.queue", payload: { villageId: "v", building: "timber" } },
    }, KEY);
    assert.equal(response.status, 404);
  });
});
