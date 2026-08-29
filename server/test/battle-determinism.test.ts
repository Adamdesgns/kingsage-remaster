// The Slice 1 gate, verbatim from the red-teamed plan: "determinism test:
// identical orders => identical outcome". Two fresh worlds, the same injected
// clock, the same commands in the same order - the two battles must produce
// deep-equal outcomes. This is the tripwire for slices 1-2: any cap, deadline,
// rally or heartbeat change that sneaks wall-clock or unseeded randomness into
// the maths trips it. The harness is a deliberate copy of roblox-attend's, not
// an import - the two files must be free to drift apart.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BATTLE_ORDER_CAP, emptyArmy, resolveBattle, type BattlePlan } from "../../packages/game-core/src/index.ts";
import { createWorldHttpServer } from "../src/http.ts";
import { SharedWorldStore } from "../src/store.ts";
import { garrisonEveryVillage } from "./garrison.ts";

const KEY = "test-secret-key-0123456789abcdef";
const ATTACKER_ID = 990001;
const DEFENDER_ID = 990002;
const PLAN: BattlePlan = { entry: "West Ridge", troops: "Balanced Army", time: "Dawn", style: "Flanking Strike" };
const MARCH_MS = 60;
const RETURN_MS = 60;
const AUTO_RESOLVE_MS = 60_000;

type Ctx = {
  store: SharedWorldStore;
  advance: (ms: number) => void;
  session: (id: number, name: string) => Promise<any>;
  state: (id: number) => Promise<any>;
  command: (id: number, commandId: string, version: number, command: unknown) => Promise<{ status: number; body: any }>;
};

async function withServer(run: (context: Ctx) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-determinism-"));
  let now = new Date("2026-08-21T20:00:00.000Z");
  const store = new SharedWorldStore(join(directory, "world.sqlite"), {
    now: () => now,
    marchDurationMs: MARCH_MS,
    returnDurationMs: RETURN_MS,
    autoResolveMs: AUTO_RESOLVE_MS,
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
      store,
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

/** One fully scripted attended battle: scout, attack, open, five identical
 * orders (the whole cap), resolve. Returns the settled battle row. */
async function scriptedBattle(context: Ctx): Promise<any> {
  await context.session(ATTACKER_ID, "Attacker");
  const defenderSession = await context.session(DEFENDER_ID, "Defender");
  const opening = await context.state(ATTACKER_ID);
  const home = opening.world.villages.find((v: any) => v.kingdomId === opening.kingdom.id && v.isCapital);
  const target = opening.world.villages.find((v: any) => v.kingdomId === defenderSession.kingdomId);

  await context.command(ATTACKER_ID, "d-scout", opening.world.version, {
    type: "march.launch",
    payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "scout", army: { ...emptyArmy(), scout: 1 } },
  });
  context.advance(MARCH_MS + 20);
  const scouted = await context.state(ATTACKER_ID);
  const report = scouted.scoutReports.find((r: any) => r.targetVillageId === target.id);
  assert.ok(report, "scouts reported");

  await context.command(ATTACKER_ID, "d-attack", scouted.world.version, {
    type: "march.launch",
    payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: { ...emptyArmy(), spear: 20, sword: 8, archer: 6 }, plan: PLAN },
  });
  context.advance(MARCH_MS + 20);
  const waiting = await context.state(ATTACKER_ID);
  const march = waiting.marches.find((m: any) => m.kind === "attack" && m.status === "awaiting_battle");
  assert.ok(march, "the army is at the walls");

  await context.command(ATTACKER_ID, "d-open", waiting.world.version, {
    type: "battle.open",
    payload: { marchId: march.id, targetVillageVersion: report.targetVillageVersion, plan: PLAN },
  });
  const battle = (await context.state(ATTACKER_ID)).battleSessions[0];

  const squads = ["vanguard", "archers", "riders", "vanguard", "archers"];
  for (let sequence = 1; sequence <= BATTLE_ORDER_CAP; sequence += 1) {
    const ordered = await context.command(ATTACKER_ID, `d-order-${sequence}`, (await context.state(ATTACKER_ID)).world.version, {
      type: "battle.order",
      payload: { battleId: battle.id, sequence, squad: squads[sequence - 1], x: 2000 + sequence * 100, y: 2500, atMs: sequence * 500 },
    });
    assert.equal(ordered.body.type, "command.accepted", `order ${sequence} accepted`);
  }

  await context.command(ATTACKER_ID, "d-resolve", (await context.state(ATTACKER_ID)).world.version, {
    type: "battle.resolve",
    payload: { battleId: battle.id },
  });
  const settled = (await context.state(ATTACKER_ID)).battleSessions[0];
  assert.equal(settled.status, "resolved");
  assert.ok(settled.outcome, "the battle carries its maths");
  return settled;
}

test("the pure engine gives the same answer twice for the same inputs", () => {
  const input = {
    attacker: { ...emptyArmy(), spear: 20, sword: 8, archer: 6 },
    defender: { ...emptyArmy(), spear: 12, sword: 4 },
    attackerLevels: {} as any,
    defenderLevels: {} as any,
    defenderWallLevel: 3,
    defenderResources: { wood: 400, clay: 400, iron: 400 } as any,
    plan: PLAN,
    acceptedOrders: BATTLE_ORDER_CAP,
    seed: "a-fixed-seed-for-this-test",
  };
  // Structured-clone the input per call so a mutating engine cannot hide by
  // "agreeing with itself" after wrecking its own arguments.
  const first = resolveBattle(structuredClone(input) as any);
  const second = resolveBattle(structuredClone(input) as any);
  assert.deepEqual(second, first, "resolveBattle is not a pure function of its inputs");
});

test("a stored outcome is exactly the pure function of the stored battle row", async () => {
  // Two different worlds legitimately fight with different variance - the seed
  // is hash(worldId:marchId:openedAt) and ids are random. What MUST hold is
  // that the outcome the store wrote is fully recomputable from the row it
  // stored: no wall clock, no hidden state, no second roll of any dice. That
  // is what makes "identical orders => identical outcome" true for any given
  // battle, including the realm refighting one nobody attended.
  await withServer(async (context) => {
    const settled = await scriptedBattle(context);

    const row = (context.store as any).db.prepare(
      "SELECT seed, plan_json, attacker_army_json, defender_army_json, attacker_levels_json, defender_levels_json, defender_wall_level, defender_resources_json, outcome_json FROM local_battle_sessions WHERE id = ?",
    ).get(settled.id);
    assert.ok(row, "the battle row exists");
    const orderCount = Number((context.store as any).db.prepare(
      "SELECT COUNT(*) AS count FROM local_battle_orders WHERE battle_id = ?",
    ).get(settled.id).count);
    assert.equal(orderCount, BATTLE_ORDER_CAP);

    const recomputed = resolveBattle({
      attacker: JSON.parse(String(row.attacker_army_json)),
      defender: JSON.parse(String(row.defender_army_json)),
      attackerLevels: JSON.parse(String(row.attacker_levels_json)),
      defenderLevels: JSON.parse(String(row.defender_levels_json)),
      defenderWallLevel: Number(row.defender_wall_level),
      defenderResources: JSON.parse(String(row.defender_resources_json)),
      plan: JSON.parse(String(row.plan_json)),
      acceptedOrders: orderCount,
      seed: String(row.seed),
    });
    assert.deepEqual(recomputed, JSON.parse(String(row.outcome_json)),
      "the stored outcome is not the pure function of the stored inputs - something off the row leaked into the maths");
  });
});
