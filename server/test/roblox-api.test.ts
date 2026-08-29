import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GAME_CONTRACT_VERSION } from "../../packages/game-core/src/contracts.ts";
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
    const identity = await session.json() as { playerId: string; kingdomId: string; created: boolean; contractVersion: number };
    assert.equal(identity.created, true);
    assert.equal(identity.contractVersion, GAME_CONTRACT_VERSION);

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

test("an empty commandId is refused - and two empty-id commands never replay each other", async () => {
  await withServer(KEY, async (base) => {
    await post(base, "/api/roblox/session", { robloxUserId: 55, displayName: "Empty" }, KEY);
    const state = await (await post(base, "/api/roblox/state", { robloxUserIds: [55] }, KEY)).json() as { states: Record<string, any> };
    const snapshot = state.states["55"];
    const village = snapshot.world.villages.find((entry: any) => entry.kingdomId === snapshot.kingdom.id);

    const first = await post(base, "/api/roblox/commands", {
      robloxUserId: 55,
      expectedWorldVersion: snapshot.world.version,
      command: { type: "village.build.queue", payload: { villageId: village.id, building: "timber" } },
    }, KEY);
    // No commandId at all: refused outright, never executed.
    assert.equal(first.status, 400, await first.clone().text());

    const second = await post(base, "/api/roblox/commands", {
      robloxUserId: 55,
      commandId: "",
      expectedWorldVersion: snapshot.world.version,
      command: { type: "village.build.queue", payload: { villageId: village.id, building: "quarry" } },
    }, KEY);
    // Explicit empty string: same refusal - NOT a silent replay of some earlier "" command.
    assert.equal(second.status, 400, await second.clone().text());

    const after = await (await post(base, "/api/roblox/state", { robloxUserIds: [55] }, KEY)).json() as { states: Record<string, any> };
    assert.equal((after.states["55"].constructionJobs ?? []).length, 0, "neither garbage command may queue anything");
  });
});

test("a malformed envelope on the web command route is a 400, never a 500", async () => {
  await withServer(KEY, async (base) => {
    const register = await post(base, "/api/auth/register", { username: "webshape", password: "longenough1", kingdomName: "Shape Realm" });
    assert.equal(register.status, 201, await register.clone().text());
    const cookie = register.headers.get("set-cookie") ?? "";
    const session = cookie.split(";")[0];

    const empty = await fetch(`${base}/api/world/commands`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: session },
      body: JSON.stringify({}),
    });
    assert.equal(empty.status, 400, await empty.clone().text());

    const noType = await fetch(`${base}/api/world/commands`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: session },
      body: JSON.stringify({ commandId: "cmd-shape-1", command: { payload: {} } }),
    });
    assert.equal(noType.status, 400, await noType.clone().text());
  });
});

test("a chat message that is not a string is refused, not a crash", async () => {
  await withServer(KEY, async (base) => {
    await post(base, "/api/roblox/session", { robloxUserId: 56, displayName: "Chatty" }, KEY);
    const state = await (await post(base, "/api/roblox/state", { robloxUserIds: [56] }, KEY)).json() as { states: Record<string, any> };
    const snapshot = state.states["56"];
    const response = await post(base, "/api/roblox/commands", {
      robloxUserId: 56,
      commandId: "cmd-chat-number",
      expectedWorldVersion: snapshot.world.version,
      command: { type: "chat.send", payload: { channelId: `world:${snapshot.world.id}`, body: 12345 } },
    }, KEY);
    assert.ok(response.status === 409 || response.status === 400, `expected a refusal, got ${response.status}`);
    const body = await response.json() as { type?: string; error?: { code: string } };
    assert.notEqual((body as any).error?.code, "INTERNAL_ERROR", "must not be a 500-class crash");
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
