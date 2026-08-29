// Rate limits on the door (audit finding 12.4: there were none anywhere -
// six scripted registrations exhausted the world's seats, and login ran
// event-loop-blocking scrypt as fast as the wire could carry requests).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWorldHttpServer } from "../src/http.ts";
import { createRateLimiter } from "../src/rate-limit.ts";
import { SharedWorldStore } from "../src/store.ts";

const KEY = "test-secret-key-0123456789abcdef";

test("the bucket refuses past its limit and refills as the clock moves", () => {
  let at = 0;
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => at });
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), false, "the fourth call inside the window is refused");
  assert.equal(limiter.allow("b"), true, "keys are independent");
  at += 20_000; // a third of the window refills one token
  assert.equal(limiter.allow("a"), true, "the window slides - time restores the allowance");
  assert.equal(limiter.allow("a"), false);
});

async function withServer(
  options: { authRateLimit?: ReturnType<typeof createRateLimiter>; commandRateLimit?: ReturnType<typeof createRateLimiter> },
  run: (base: string) => Promise<void>,
) {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-ratelimit-"));
  const store = new SharedWorldStore(join(directory, "world.sqlite"));
  const app = createWorldHttpServer({ store, robloxKey: KEY, ...options });
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address() as { port: number };
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await app.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

const post = (base: string, path: string, body: unknown, key?: string) => fetch(`${base}${path}`, {
  method: "POST",
  headers: { "content-type": "application/json", ...(key ? { "x-kingsage-key": key } : {}) },
  body: JSON.stringify(body),
});

test("registration is throttled per address before it can drain the world's seats", async () => {
  let at = 0;
  const authRateLimit = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => at });
  await withServer({ authRateLimit }, async (base) => {
    for (let index = 0; index < 3; index += 1) {
      const response = await post(base, "/api/auth/register", {
        username: `throttle_${index}`, password: "longenough1", kingdomName: `Throttle ${index}`,
      });
      assert.equal(response.status, 201, await response.clone().text());
    }
    const refused = await post(base, "/api/auth/register", {
      username: "throttle_over", password: "longenough1", kingdomName: "Throttle Over",
    });
    assert.equal(refused.status, 429);
    const body = await refused.json() as { error: { code: string } };
    assert.equal(body.error.code, "RATE_LIMITED");

    // Login shares the same door.
    const login = await post(base, "/api/auth/login", { username: "throttle_0", password: "longenough1" });
    assert.equal(login.status, 429, "login rides the same per-address allowance");

    at += 120_000;
    const later = await post(base, "/api/auth/login", { username: "throttle_0", password: "longenough1" });
    assert.equal(later.status, 200, "time restores the door");
  });
});

test("roblox commands are throttled per player - and the heartbeat never is", async () => {
  const commandRateLimit = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => 0 });
  await withServer({ commandRateLimit }, async (base) => {
    await post(base, "/api/roblox/session", { robloxUserId: 91, displayName: "Spammy" }, KEY);
    const state = await (await post(base, "/api/roblox/state", { robloxUserIds: [91] }, KEY)).json() as { states: Record<string, any> };
    const snapshot = state.states["91"];
    const village = snapshot.world.villages.find((v: any) => v.kingdomId === snapshot.kingdom.id);

    const buildings = ["timber", "quarry", "iron"];
    const results: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      const fresh = await (await post(base, "/api/roblox/state", { robloxUserIds: [91] }, KEY)).json() as { states: Record<string, any> };
      const response = await post(base, "/api/roblox/commands", {
        robloxUserId: 91,
        commandId: `rl-cmd-${index}`,
        expectedWorldVersion: fresh.states["91"].world.version,
        command: { type: "village.build.queue", payload: { villageId: village.id, building: buildings[index] } },
      }, KEY);
      results.push(response.status);
      if (index === 2) {
        const body = await response.json() as { type: string; payload: { code: string; message: string } };
        assert.equal(body.type, "command.rejected");
        assert.equal(body.payload.code, "RATE_LIMITED");
        assert.ok(body.payload.message.length > 0, "the refusal carries player-readable copy");
      }
    }
    assert.deepEqual(results.slice(0, 2), [200, 200]);
    assert.equal(results[2], 429, "the third distinct command inside the window is refused");

    // The 10s heartbeat must never be starved by a spammy neighbour: state
    // pulls stay unlimited (they also carried the limiter's own lookups above).
    for (let index = 0; index < 10; index += 1) {
      const pulse = await post(base, "/api/roblox/state", { robloxUserIds: [91] }, KEY);
      assert.equal(pulse.status, 200);
    }
  });
});
