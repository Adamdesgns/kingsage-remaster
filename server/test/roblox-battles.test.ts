// Battles slice A through the real /api/roblox/* routes. The rule these tests
// exist to defend: an attack can never strand. Whether or not its owner ever
// comes back, the army fights, settles, and marches home.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { armyUnitCount, emptyArmy, type BattlePlan } from "../../packages/game-core/src/index.ts";
import { createWorldHttpServer } from "../src/http.ts";
import { SharedWorldStore } from "../src/store.ts";
import { garrisonEveryVillage } from "./garrison.ts";

const KEY = "test-secret-key-0123456789abcdef";
const ATTACKER_ID = 880001;
const DEFENDER_ID = 880002;

const GOOD_PLAN: BattlePlan = {
  entry: "West Ridge",
  troops: "Balanced Army",
  time: "Dawn",
  style: "Flanking Strike",
};

const MARCH_MS = 60;
const RETURN_MS = 60;
const AUTO_RESOLVE_MS = 200;

type Ctx = {
  store: SharedWorldStore;
  advance: (ms: number) => void;
  session: (robloxUserId: number, name: string) => Promise<any>;
  state: (robloxUserId: number) => Promise<any>;
  command: (robloxUserId: number, commandId: string, expectedWorldVersion: number, command: unknown) => Promise<{ status: number; body: any }>;
};

async function withServer(run: (context: Ctx) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-battles-"));
  let now = new Date("2026-08-21T18:00:00.000Z");
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

/** Link both players, scout the defender, and hand back the two villages. */
async function twoKingdomsWithIntel(context: Ctx) {
  await context.session(ATTACKER_ID, "Attacker");
  const defenderSession = await context.session(DEFENDER_ID, "Defender");
  const opening = await context.state(ATTACKER_ID);
  const home = opening.world.villages.find((v: any) => v.kingdomId === opening.kingdom.id && v.isCapital);
  const target = opening.world.villages.find((v: any) => v.kingdomId === defenderSession.kingdomId);
  assert.ok(home && target, "both kingdoms hold a village");

  const scout = await context.command(ATTACKER_ID, "b-scout", opening.world.version, {
    type: "march.launch",
    payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "scout", army: { ...emptyArmy(), scout: 1 } },
  });
  assert.equal(scout.body.type, "command.accepted");
  context.advance(MARCH_MS + 20);
  const scouted = await context.state(ATTACKER_ID);
  assert.ok(scouted.scoutReports.length > 0, "the scouts reported back");
  return { home, target, defenderKingdomId: defenderSession.kingdomId, snapshot: scouted };
}

test("an attack whose owner never comes back still fights, settles, and marches home", async () => {
  await withServer(async (context) => {
    const { home, target, snapshot } = await twoKingdomsWithIntel(context);

    const attackArmy = { ...emptyArmy(), spear: 20, sword: 8, archer: 6 };
    const launched = await context.command(ATTACKER_ID, "b-attack", snapshot.world.version, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: attackArmy, plan: GOOD_PLAN },
    });
    assert.equal(launched.status, 200);
    assert.equal(launched.body.type, "command.accepted");

    // Arrival: the army is at the walls, waiting for a commander who is gone.
    context.advance(MARCH_MS + 20);
    const waiting = await context.state(ATTACKER_ID);
    const waitingMarch = waiting.marches.find((m: any) => m.kind === "attack");
    assert.equal(waitingMarch?.status, "awaiting_battle");
    assert.equal(waiting.battleSessions.length, 0, "nothing is fought before the deadline");

    // Deadline passes. NO player command is ever issued from here on.
    context.advance(AUTO_RESOLVE_MS + 50);
    const settled = await context.state(ATTACKER_ID);
    assert.equal(settled.battleSessions.length, 1, "the server fought it");
    const battle = settled.battleSessions[0];
    assert.equal(battle.status, "resolved");
    assert.ok(battle.outcome, "a resolved battle carries its outcome");
    assert.equal(battle.plan.entry, GOOD_PLAN.entry, "fought under the plan chosen at launch");
    assert.equal(battle.outcome.orderBonus, 0, "an absent commander earns no order bonus");

    const returning = settled.marches.find((m: any) => m.kind === "return");
    assert.ok(returning, "the survivors are on their way home");
    assert.equal(returning.status, "returning");

    // And they actually arrive.
    context.advance(RETURN_MS + 50);
    const home2 = (await context.state(ATTACKER_ID)).world.villages.find((v: any) => v.id === home.id);
    assert.ok(armyUnitCount(home2.army) > 0, "somebody made it back");
  });
});

test("an attack that arrives during a long outage settles in the same pass", async () => {
  await withServer(async (context) => {
    const { home, target, snapshot } = await twoKingdomsWithIntel(context);
    await context.command(ATTACKER_ID, "b-outage", snapshot.world.version, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: { ...emptyArmy(), spear: 20, sword: 8 }, plan: GOOD_PLAN },
    });

    // Nobody asks the server anything for a long time — travel AND the whole
    // wait at the walls elapse before a single state pull.
    context.advance(MARCH_MS + AUTO_RESOLVE_MS + 5_000);
    const settled = await context.state(ATTACKER_ID);
    assert.equal(settled.battleSessions.length, 1);
    assert.equal(settled.battleSessions[0].status, "resolved");
    assert.ok(!settled.marches.some((m: any) => m.status === "awaiting_battle"), "no army is left parked");
  });
});

test("the defender sees the battle they were in", async () => {
  await withServer(async (context) => {
    const { home, target, snapshot } = await twoKingdomsWithIntel(context);
    await context.command(ATTACKER_ID, "b-defender-view", snapshot.world.version, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: { ...emptyArmy(), spear: 20, sword: 8 }, plan: GOOD_PLAN },
    });
    context.advance(MARCH_MS + AUTO_RESOLVE_MS + 200);
    await context.state(ATTACKER_ID);

    const defenderState = await context.state(DEFENDER_ID);
    assert.equal(defenderState.battleSessions.length, 1, "the defender can read the battle at their own walls");
    assert.equal(defenderState.battleSessions[0].defenderVillageId, target.id);
    assert.ok(
      defenderState.notifications.some((n: any) => n.kind === "battle"),
      "and was told about it",
    );
  });
});

test("an overwhelming attack takes prisoners, and no soldier is created or lost", async () => {
  await withServer(async (context) => {
    const { home, target, snapshot } = await twoKingdomsWithIntel(context);

    // A garrison big enough that somebody is left standing to surrender, and
    // an army that dwarfs it. (A token two-man garrison is simply wiped out —
    // the loss cap leaves no survivors to yield, which is the rule working.)
    context.store.db.prepare("UPDATE local_villages SET army_json = ? WHERE id = ?")
      .run(JSON.stringify({ ...emptyArmy(), spear: 60 }), target.id);
    context.store.db.prepare("UPDATE local_villages SET army_json = ? WHERE id = ?")
      .run(JSON.stringify({ ...emptyArmy(), spear: 400, sword: 150, archer: 120 }), home.id);

    const attackArmy = { ...emptyArmy(), spear: 400, sword: 150, archer: 120 };
    const launched = await context.command(ATTACKER_ID, "b-surrender", (await context.state(ATTACKER_ID)).world.version, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: attackArmy, plan: GOOD_PLAN },
    });
    assert.equal(launched.body.type, "command.accepted");

    context.advance(MARCH_MS + AUTO_RESOLVE_MS + 200);
    const settled = await context.state(ATTACKER_ID);
    const outcome = settled.battleSessions[0].outcome;
    assert.equal(outcome.winner, "attacker");
    const yielded = armyUnitCount(outcome.yielded);
    assert.ok(yielded > 0, "a hopeless garrison surrenders rather than dying to the last man");

    // Conservation: everyone who yielded left the village and is on the road.
    const returning = settled.marches.find((m: any) => m.kind === "return");
    assert.equal(armyUnitCount(outcome.attackerSurvivors) + yielded, armyUnitCount(returning.army));

    // Read the defender's own (unfogged) view: the yielded troops are gone
    // from their garrison, not duplicated into two armies at once.
    const defenderView = await context.state(DEFENDER_ID);
    const garrison = defenderView.world.villages.find((v: any) => v.id === target.id);
    assert.equal(garrison.kingdomId, defenderView.kingdom.id, "the defender still holds the village - this slice does not conquer");
    assert.equal(
      armyUnitCount(garrison.army),
      60 - armyUnitCount(outcome.defenderCasualties) - yielded,
      "casualties and prisoners both left the garrison, and nothing else did",
    );

    context.advance(RETURN_MS + 50);
    const after = await context.state(ATTACKER_ID);
    const homeAfter = after.world.villages.find((v: any) => v.id === home.id);
    assert.ok(armyUnitCount(homeAfter.army) >= yielded, "the prisoners actually arrived");
  });
});

test("a plan the war table could not have produced is refused at launch", async () => {
  await withServer(async (context) => {
    const { home, target, snapshot } = await twoKingdomsWithIntel(context);
    const refused = await context.command(ATTACKER_ID, "b-bad-plan", snapshot.world.version, {
      type: "march.launch",
      payload: {
        fromVillageId: home.id,
        targetVillageId: target.id,
        kind: "attack",
        army: { ...emptyArmy(), spear: 10 },
        plan: { ...GOOD_PLAN, entry: "Through The Sewers" },
      },
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.payload.code, "INVALID_PLAN");
    assert.equal((await context.state(ATTACKER_ID)).marches.filter((m: any) => m.kind === "attack").length, 0);
  });
});

test("an attack launched with no plan at all still resolves rather than stranding", async () => {
  await withServer(async (context) => {
    const { home, target, snapshot } = await twoKingdomsWithIntel(context);
    // No `plan` key: exactly what a pre-slice-A client (or gate-d) sends.
    const launched = await context.command(ATTACKER_ID, "b-no-plan", snapshot.world.version, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: { ...emptyArmy(), spear: 20, sword: 8 } },
    });
    assert.equal(launched.body.type, "command.accepted");

    context.advance(MARCH_MS + AUTO_RESOLVE_MS + 200);
    const settled = await context.state(ATTACKER_ID);
    assert.equal(settled.battleSessions.length, 1);
    assert.equal(settled.battleSessions[0].status, "resolved");
    assert.equal(settled.battleSessions[0].plan.style, "Full Assault", "fought under the documented unplanned fallback");
  });
});

test("a replayed attack commandId sends one wave, not two", async () => {
  await withServer(async (context) => {
    const { home, target, snapshot } = await twoKingdomsWithIntel(context);
    const payload = {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: { ...emptyArmy(), spear: 12 }, plan: GOOD_PLAN },
    };
    const first = await context.command(ATTACKER_ID, "b-replay", snapshot.world.version, payload);
    assert.equal(first.body.type, "command.accepted");
    const replay = await context.command(ATTACKER_ID, "b-replay", snapshot.world.version, payload);
    assert.equal(replay.body.type, "command.accepted");

    const after = await context.state(ATTACKER_ID);
    assert.equal(after.marches.filter((m: any) => m.kind === "attack").length, 1);
  });
});

test("rams leave the wall down after they go home", async () => {
  await withServer(async (context) => {
    const { home, target } = await twoKingdomsWithIntel(context);

    // A wall worth breaking, and an army that will win so the rams count twice.
    context.store.db.prepare("UPDATE local_villages SET buildings_json = json_set(buildings_json, '$.wall', 20), army_json = ?, state_version = state_version + 1 WHERE id = ?")
      .run(JSON.stringify({ ...emptyArmy(), spear: 20 }), target.id);
    const siegeArmy = { ...emptyArmy(), axe: 400, ram: 200 };
    context.store.db.prepare("UPDATE local_villages SET army_json = ? WHERE id = ?")
      .run(JSON.stringify(siegeArmy), home.id);

    const before = JSON.parse(String((context.store.db
      .prepare("SELECT buildings_json FROM local_villages WHERE id = ?")
      .get(target.id) as any).buildings_json)).wall;
    assert.equal(before, 20, "test setup did not raise the wall");

    const launched = await context.command(ATTACKER_ID, "b-siege", (await context.state(ATTACKER_ID)).world.version, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: siegeArmy, plan: GOOD_PLAN },
    });
    assert.equal(launched.body.type, "command.accepted");

    context.advance(MARCH_MS + AUTO_RESOLVE_MS + 200);
    const settled = await context.state(ATTACKER_ID);
    assert.equal(settled.battleSessions[0].outcome.winner, "attacker");

    const after = JSON.parse(String((context.store.db
      .prepare("SELECT buildings_json FROM local_villages WHERE id = ?")
      .get(target.id) as any).buildings_json)).wall;

    assert.ok(after < before, `the wall stayed at ${after} after 200 rams won at it`);
    assert.ok(after >= 0, "a wall cannot go negative");
  });
});

test("an attack with no rams leaves the wall exactly where it stood", async () => {
  // The regression that matters most: every ordinary battle runs this path.
  await withServer(async (context) => {
    const { home, target } = await twoKingdomsWithIntel(context);
    context.store.db.prepare("UPDATE local_villages SET buildings_json = json_set(buildings_json, '$.wall', 12), army_json = ?, state_version = state_version + 1 WHERE id = ?")
      .run(JSON.stringify({ ...emptyArmy(), spear: 20 }), target.id);
    const army = { ...emptyArmy(), axe: 400 };
    context.store.db.prepare("UPDATE local_villages SET army_json = ? WHERE id = ?").run(JSON.stringify(army), home.id);

    const launched = await context.command(ATTACKER_ID, "b-no-siege", (await context.state(ATTACKER_ID)).world.version, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army, plan: GOOD_PLAN },
    });
    assert.equal(launched.body.type, "command.accepted");
    context.advance(MARCH_MS + AUTO_RESOLVE_MS + 200);

    const after = JSON.parse(String((context.store.db
      .prepare("SELECT buildings_json FROM local_villages WHERE id = ?")
      .get(target.id) as any).buildings_json)).wall;
    assert.equal(after, 12, "a battle with no siege moved the wall");
  });
});
