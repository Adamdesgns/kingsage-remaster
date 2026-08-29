// march.cancel - a misclicked army can turn around (audit: MISSING; a
// 900-second Count march was unrecallable). The rule: an OUTBOUND march you
// own turns for home from where it stands - the walk back costs what the
// walk out cost so far. An army that can see the walls is committed.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { armyUnitCount, emptyArmy } from "../../packages/game-core/src/index.ts";
import { createWorldHttpServer } from "../src/http.ts";
import { SharedWorldStore } from "../src/store.ts";
import { garrisonEveryVillage } from "./garrison.ts";

const KEY = "test-secret-key-0123456789abcdef";
const OWNER = 660001;
const RIVAL = 660002;

const MARCH_MS = 10_000;

type Ctx = {
  advance: (ms: number) => void;
  session: (id: number, name: string) => Promise<any>;
  state: (id: number) => Promise<any>;
  command: (id: number, commandId: string, version: number, command: unknown) => Promise<{ status: number; body: any }>;
};

async function withServer(run: (context: Ctx) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-cancel-"));
  let now = new Date("2026-08-29T15:00:00.000Z");
  const store = new SharedWorldStore(join(directory, "world.sqlite"), {
    now: () => now,
    marchDurationMs: MARCH_MS,
    returnDurationMs: MARCH_MS,
  });
  garrisonEveryVillage(store);
  const app = createWorldHttpServer({ store, robloxKey: KEY });
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kingsage-key": KEY },
    body: JSON.stringify(body),
  });
  try {
    await run({
      advance: (ms) => { now = new Date(now.getTime() + ms); },
      session: async (robloxUserId, displayName) => (await post("/api/roblox/session", { robloxUserId, displayName })).json(),
      state: async (robloxUserId) => {
        const payload = await (await post("/api/roblox/state", { robloxUserIds: [robloxUserId] })).json();
        return payload.states[String(robloxUserId)];
      },
      command: async (robloxUserId, commandId, expectedWorldVersion, command) => {
        const response = await post("/api/roblox/commands", { robloxUserId, commandId, expectedWorldVersion, command });
        return { status: response.status, body: await response.json() };
      },
    });
  } finally {
    await app.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

async function launchScout(context: Ctx, userId: number, prefix: string) {
  const opening = await context.state(userId);
  const home = opening.world.villages.find((v: any) => v.kingdomId === opening.kingdom.id && v.isCapital);
  const target = opening.world.villages.find((v: any) => v.kingdomId !== opening.kingdom.id);
  await context.command(userId, `${prefix}-launch`, opening.world.version, {
    type: "march.launch",
    payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "scout", army: { ...emptyArmy(), scout: 2 } },
  });
  const after = await context.state(userId);
  const march = after.marches.find((m: any) => m.status === "outbound");
  assert.ok(march, "march is on the road");
  return { home, target, march, snapshot: after };
}

test("an outbound march recalled mid-road walks back the way it came", async () => {
  await withServer(async (context) => {
    await context.session(OWNER, "Recaller");
    const { home, march, snapshot } = await launchScout(context, OWNER, "mc1");
    const homeArmyAfterLaunch = armyUnitCount(
      snapshot.world.villages.find((v: any) => v.id === home.id).army,
    );

    // 4 seconds into a 10-second march.
    context.advance(4_000);
    const cancelled = await context.command(OWNER, "mc1-cancel", (await context.state(OWNER)).world.version, {
      type: "march.cancel",
      payload: { marchId: march.id },
    });
    assert.equal(cancelled.body.type, "command.accepted", JSON.stringify(cancelled.body));

    const turning = await context.state(OWNER);
    const turned = turning.marches.find((m: any) => m.id === march.id);
    assert.equal(turned.status, "returning", "the march turned for home");

    // The walk back costs what the walk out cost: ~4s, not the full 10.
    context.advance(4_500);
    const backHome = await context.state(OWNER);
    const done = backHome.marches.find((m: any) => m.id === march.id);
    assert.equal(done?.status ?? "complete", "complete", "the army is home after the mirrored travel time");
    const homeArmyNow = armyUnitCount(backHome.world.villages.find((v: any) => v.id === home.id).army);
    assert.equal(homeArmyNow, homeArmyAfterLaunch + 2, "both scouts came home - nobody was created or lost");
  });
});

test("an army that reached the walls is committed - and rivals cannot recall it either", async () => {
  await withServer(async (context) => {
    await context.session(OWNER, "Recaller");
    await context.session(RIVAL, "Meddler");
    const { march } = await launchScout(context, OWNER, "mc2");

    // A rival cannot touch it at all.
    const meddled = await context.command(RIVAL, "mc2-meddle", (await context.state(RIVAL)).world.version, {
      type: "march.cancel",
      payload: { marchId: march.id },
    });
    assert.equal(meddled.body.payload?.code, "FORBIDDEN", JSON.stringify(meddled.body));

    // Arrived: committed.
    context.advance(MARCH_MS + 1_000);
    const arrivedState = await context.state(OWNER);
    const refused = await context.command(OWNER, "mc2-late", arrivedState.world.version, {
      type: "march.cancel",
      payload: { marchId: march.id },
    });
    assert.equal(refused.body.payload?.code, "MARCH_COMMITTED", JSON.stringify(refused.body));

    // And a replayed cancel of a genuinely cancelled march does nothing twice.
    const again = await context.command(OWNER, "mc2-late", (await context.state(OWNER)).world.version, {
      type: "march.cancel",
      payload: { marchId: march.id },
    });
    assert.equal(again.body.payload?.code, "MARCH_COMMITTED", "the stored refusal replays verbatim");
  });
});
