// Attending a battle (slice B) through the real /api/roblox/* routes: open it,
// command squads, call the charge or fall back. The scene that renders all this
// is client-side and decides nothing — these tests are the part that can be
// proven without a screen.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { armyUnitCount, BATTLE_ORDER_CAP, emptyArmy, type BattlePlan } from "../../packages/game-core/src/index.ts";
import { createWorldHttpServer } from "../src/http.ts";
import { SharedWorldStore } from "../src/store.ts";
import { garrisonEveryVillage } from "./garrison.ts";

const KEY = "test-secret-key-0123456789abcdef";
const ATTACKER_ID = 990001;
const DEFENDER_ID = 990002;

const PLAN: BattlePlan = { entry: "West Ridge", troops: "Balanced Army", time: "Dawn", style: "Flanking Strike" };

const MARCH_MS = 60;
const RETURN_MS = 60;
const AUTO_RESOLVE_MS = 60_000; // long: these tests are about NOT letting it fire

type Ctx = {
  store: SharedWorldStore;
  advance: (ms: number) => void;
  session: (id: number, name: string) => Promise<any>;
  state: (id: number) => Promise<any>;
  command: (id: number, commandId: string, version: number, command: unknown) => Promise<{ status: number; body: any }>;
};

async function withServer(run: (context: Ctx) => Promise<void>, autoResolveMs = AUTO_RESOLVE_MS) {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-attend-"));
  let now = new Date("2026-08-21T20:00:00.000Z");
  const store = new SharedWorldStore(join(directory, "world.sqlite"), {
    now: () => now,
    marchDurationMs: MARCH_MS,
    returnDurationMs: RETURN_MS,
    autoResolveMs,
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

/** Scout, attack, and advance until the army is standing at the walls. */
async function armyAtTheWalls(context: Ctx, prefix: string) {
  await context.session(ATTACKER_ID, "Attacker");
  const defenderSession = await context.session(DEFENDER_ID, "Defender");
  const opening = await context.state(ATTACKER_ID);
  const home = opening.world.villages.find((v: any) => v.kingdomId === opening.kingdom.id && v.isCapital);
  const target = opening.world.villages.find((v: any) => v.kingdomId === defenderSession.kingdomId);

  await context.command(ATTACKER_ID, `${prefix}-scout`, opening.world.version, {
    type: "march.launch",
    payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "scout", army: { ...emptyArmy(), scout: 1 } },
  });
  context.advance(MARCH_MS + 20);
  const scouted = await context.state(ATTACKER_ID);
  const report = scouted.scoutReports.find((r: any) => r.targetVillageId === target.id);
  assert.ok(report, "scouts reported");

  await context.command(ATTACKER_ID, `${prefix}-attack`, scouted.world.version, {
    type: "march.launch",
    payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: { ...emptyArmy(), spear: 20, sword: 8, archer: 6 }, plan: PLAN },
  });
  context.advance(MARCH_MS + 20);
  const waiting = await context.state(ATTACKER_ID);
  const march = waiting.marches.find((m: any) => m.kind === "attack" && m.status === "awaiting_battle");
  assert.ok(march, "the army is at the walls");
  return { home, target, march, report, snapshot: waiting };
}

test("attending: open, command three squads, call the charge", async () => {
  await withServer(async (context) => {
    const { march, report } = await armyAtTheWalls(context, "a1");

    const opened = await context.command(ATTACKER_ID, "a1-open", (await context.state(ATTACKER_ID)).world.version, {
      type: "battle.open",
      payload: { marchId: march.id, targetVillageVersion: report.targetVillageVersion, plan: PLAN },
    });
    assert.equal(opened.status, 200);
    assert.equal(opened.body.type, "command.accepted");

    let snapshot = await context.state(ATTACKER_ID);
    const battle = snapshot.battleSessions[0];
    assert.equal(battle.status, "open");
    // Everything the scene needs to draw a fight that has not been decided yet.
    assert.ok(armyUnitCount(battle.attackerArmy) > 0, "the battle row carries the attacking army");
    assert.ok(armyUnitCount(battle.defenderArmy) > 0, "and the defending one");
    assert.equal(battle.acceptedOrders, 0);
    assert.equal(battle.outcome, null, "nothing is decided while it is open");

    const squads = ["vanguard", "archers", "riders"];
    for (let index = 0; index < squads.length; index += 1) {
      const result = await context.command(ATTACKER_ID, `a1-order-${index}`, (await context.state(ATTACKER_ID)).world.version, {
        type: "battle.order",
        payload: { battleId: battle.id, sequence: index + 1, squad: squads[index], x: 2500, y: 2500 + index * 100, atMs: 1000 * (index + 1) },
      });
      assert.equal(result.body.type, "command.accepted", `order ${index + 1} accepted`);
    }

    snapshot = await context.state(ATTACKER_ID);
    assert.equal(snapshot.battleSessions[0].acceptedOrders, 3, "the client can see what attending earned");

    const charged = await context.command(ATTACKER_ID, "a1-resolve", snapshot.world.version, {
      type: "battle.resolve",
      payload: { battleId: battle.id },
    });
    assert.equal(charged.body.type, "command.accepted");

    const settled = (await context.state(ATTACKER_ID)).battleSessions[0];
    assert.equal(settled.status, "resolved");
    assert.ok(settled.outcome, "the maths exists now, and only now");
    // Three orders, capped 2% each: this is what showing up bought.
    assert.ok(Math.abs(settled.outcome.orderBonus - 0.06) < 1e-9, `orderBonus was ${settled.outcome.orderBonus}`);
  });
});

test("orders must be in sequence, and the refusal says which number is next", async () => {
  await withServer(async (context) => {
    const { march, report } = await armyAtTheWalls(context, "a2");
    await context.command(ATTACKER_ID, "a2-open", (await context.state(ATTACKER_ID)).world.version, {
      type: "battle.open",
      payload: { marchId: march.id, targetVillageVersion: report.targetVillageVersion, plan: PLAN },
    });
    const battle = (await context.state(ATTACKER_ID)).battleSessions[0];

    const jumped = await context.command(ATTACKER_ID, "a2-jump", (await context.state(ATTACKER_ID)).world.version, {
      type: "battle.order",
      payload: { battleId: battle.id, sequence: 7, squad: "vanguard", x: 100, y: 100, atMs: 500 },
    });
    assert.equal(jumped.status, 409);
    assert.equal(jumped.body.payload.code, "INVALID_ORDER");
    assert.match(jumped.body.payload.message, /sequence 1\b/, "the realm names the number it wants");
  });
});

test("falling back saves survivors and costs the defender nothing", async () => {
  await withServer(async (context) => {
    const { home, target, march, report } = await armyAtTheWalls(context, "a3");
    await context.command(ATTACKER_ID, "a3-open", (await context.state(ATTACKER_ID)).world.version, {
      type: "battle.open",
      payload: { marchId: march.id, targetVillageVersion: report.targetVillageVersion, plan: PLAN },
    });
    const battle = (await context.state(ATTACKER_ID)).battleSessions[0];
    const defenderBefore = (await context.state(DEFENDER_ID)).world.villages.find((v: any) => v.id === target.id);

    const pulled = await context.command(ATTACKER_ID, "a3-retreat", (await context.state(ATTACKER_ID)).world.version, {
      type: "battle.retreat",
      payload: { battleId: battle.id, sequence: 1, atMs: 4_000 },
    });
    assert.equal(pulled.body.type, "command.accepted");

    const settled = (await context.state(ATTACKER_ID)).battleSessions[0];
    assert.equal(settled.status, "retreated");
    assert.equal(settled.outcome.winner, "defender");
    assert.ok(armyUnitCount(settled.outcome.attackerSurvivors) > 0, "pulling out early saves troops");
    assert.deepEqual(settled.outcome.loot, { wood: 0, stone: 0, iron: 0 });

    const defenderAfter = (await context.state(DEFENDER_ID)).world.villages.find((v: any) => v.id === target.id);
    assert.equal(armyUnitCount(defenderAfter.army), armyUnitCount(defenderBefore.army), "a garrison that was never fought loses nobody");

    context.advance(RETURN_MS + 50);
    const homeAfter = (await context.state(ATTACKER_ID)).world.villages.find((v: any) => v.id === home.id);
    assert.ok(armyUnitCount(homeAfter.army) > 0, "the survivors came home");
  });
});

test("a defender who merely earned resources does not invalidate your intel", async () => {
  // state_version bumps on every resource tick (accrueVillage). Enforcing
  // version equality would make attending impossible in a world where time
  // moves, while an absent attacker still got their battle fought by the
  // deadline — backwards from "showing up matters".
  await withServer(async (context) => {
    const { march, report } = await armyAtTheWalls(context, "a4");

    // Hours pass at the walls: the defender's barns fill, nothing else changes.
    context.advance(4 * 60 * 60 * 1000);
    const soaked = await context.state(ATTACKER_ID);
    const targetNow = soaked.world.villages.find((v: any) => v.id === march.targetVillageId);
    assert.ok(targetNow, "the village is still there");

    // The version HAS moved — that is the whole point of the test.
    assert.notEqual(targetNow.stateVersion, report.targetVillageVersion, "accrual moved state_version");

    const opened = await context.command(ATTACKER_ID, "a4-open", soaked.world.version, {
      type: "battle.open",
      payload: { marchId: march.id, targetVillageVersion: report.targetVillageVersion, plan: PLAN },
    });
    assert.equal(opened.body.type, "command.accepted", "resources earned are not a change worth re-scouting");
    // A generous deadline, or the server would have settled it without us and
    // the test would be measuring the wrong refusal.
  }, 12 * 60 * 60 * 1000);
});

test("a defender who reinforced the garrison DOES invalidate your intel", async () => {
  await withServer(async (context) => {
    const { march, report } = await armyAtTheWalls(context, "a5");

    context.store.db.prepare("UPDATE local_villages SET army_json = ?, state_version = state_version + 1 WHERE id = ?")
      .run(JSON.stringify({ ...emptyArmy(), spear: 400 }), String(march.targetVillageId));

    const refused = await context.command(ATTACKER_ID, "a5-open", (await context.state(ATTACKER_ID)).world.version, {
      type: "battle.open",
      payload: { marchId: march.id, targetVillageVersion: report.targetVillageVersion, plan: PLAN },
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.payload.code, "STALE_SCOUT_REPORT");
  });
});

test("a report you do not hold is not intel", async () => {
  await withServer(async (context) => {
    const { march } = await armyAtTheWalls(context, "a6");
    const refused = await context.command(ATTACKER_ID, "a6-open", (await context.state(ATTACKER_ID)).world.version, {
      type: "battle.open",
      payload: { marchId: march.id, targetVillageVersion: 99_999, plan: PLAN },
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.payload.code, "STALE_SCOUT_REPORT");
  });
});

test("a field order is not refused because the world ticked underneath it", async () => {
  // Found live on 2026-08-22: the demo tour issued three orders and only ONE
  // landed. The other two came back WORLD_VERSION_CONFLICT, because the world
  // version bumps every time any village earns a log of wood - so an order sent
  // a moment after the client read state is refused for a reason that has
  // nothing to do with the battle.
  //
  // Same defect family as the slice-B `state_version` bug: an optimistic check
  // guarding against staleness that a live economy makes stale by itself.
  await withServer(async (context) => {
    const { march, report } = await armyAtTheWalls(context, "a9");
    await context.command(ATTACKER_ID, "a9-open", (await context.state(ATTACKER_ID)).world.version, {
      type: "battle.open",
      payload: { marchId: march.id, targetVillageVersion: report.targetVillageVersion, plan: PLAN },
    });
    const battle = (await context.state(ATTACKER_ID)).battleSessions[0];
    const current = (await context.state(ATTACKER_ID)).world.version;

    // Deliberately stale: pretend the client read the world several ticks ago.
    const stale = current - 3;
    const ordered = await context.command(ATTACKER_ID, "a9-stale-order", stale, {
      type: "battle.order",
      payload: { battleId: battle.id, sequence: 1, squad: "vanguard", x: 100, y: 100, atMs: 500 },
    });

    assert.equal(ordered.body.type, "command.accepted",
      `a live battle order must not be refused for a world tick (${JSON.stringify(ordered.body)})`);
  });
});

test("but a stale march is still refused, because that one really is stale", async () => {
  // The exemption must be NARROW. Launching troops depends on the world state
  // the player was looking at; ordering a squad inside a battle does not.
  await withServer(async (context) => {
    const { march } = await armyAtTheWalls(context, "a10");
    const current = (await context.state(ATTACKER_ID)).world.version;
    const refused = await context.command(ATTACKER_ID, "a10-stale-march", current - 3, {
      type: "battle.open",
      payload: { marchId: march.id, targetVillageVersion: 1, plan: PLAN },
    });
    assert.equal(refused.body.payload.code, "WORLD_VERSION_CONFLICT",
      "only live field orders are exempt - everything else still guards on the world version");
  });
});

test("the sixth field order is refused - the cap is the server's, not the panel's", async () => {
  await withServer(async (context) => {
    const { march, report } = await armyAtTheWalls(context, "a9");
    await context.command(ATTACKER_ID, "a9-open", (await context.state(ATTACKER_ID)).world.version, {
      type: "battle.open",
      payload: { marchId: march.id, targetVillageVersion: report.targetVillageVersion, plan: PLAN },
    });
    const battle = (await context.state(ATTACKER_ID)).battleSessions[0];

    for (let sequence = 1; sequence <= BATTLE_ORDER_CAP; sequence += 1) {
      const accepted = await context.command(ATTACKER_ID, `a9-order-${sequence}`, (await context.state(ATTACKER_ID)).world.version, {
        type: "battle.order",
        payload: { battleId: battle.id, sequence, squad: "vanguard", x: 2500, y: 2500, atMs: sequence * 100 },
      });
      assert.equal(accepted.body.type, "command.accepted", `order ${sequence} of ${BATTLE_ORDER_CAP} must land`);
    }

    const sixth = await context.command(ATTACKER_ID, "a9-order-over", (await context.state(ATTACKER_ID)).world.version, {
      type: "battle.order",
      payload: { battleId: battle.id, sequence: BATTLE_ORDER_CAP + 1, squad: "vanguard", x: 2500, y: 2500, atMs: 999 },
    });
    assert.equal(sixth.status, 409);
    assert.equal(sixth.body.payload.code, "ORDER_CAP_REACHED");

    // The count the outcome maths reads stays at the cap.
    assert.equal((await context.state(ATTACKER_ID)).battleSessions[0].acceptedOrders, BATTLE_ORDER_CAP);
  });
});
