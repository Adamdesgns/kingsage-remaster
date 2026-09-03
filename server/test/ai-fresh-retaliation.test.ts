import assert from "node:assert/strict";
import test from "node:test";
import { emptyArmy, troopCost } from "../../packages/game-core/src/index.ts";
import { runAiKingdomTick } from "../src/ai.ts";
import { SharedWorldStore } from "../src/store.ts";

test("an attacked production-start AI earns its first spy and scouts before raiding", () => {
  let now = new Date("2026-09-03T12:00:00.000Z");
  const store = new SharedWorldStore(":memory:", { now: () => now });
  try {
    const worldId = String(store.db.prepare("SELECT id FROM local_worlds").get()!.id);
    const human = store.linkRobloxPlayer({ robloxUserId: 980001, displayName: "Attacker" }).player;
    const home = String(store.db.prepare("SELECT id FROM local_villages WHERE kingdom_id = ?").get(human.kingdomId)!.id);
    const ai = store.db.prepare(`
      SELECT v.id, v.kingdom_id, v.army_json, v.buildings_json FROM local_villages v
      JOIN local_kingdoms k ON k.id = v.kingdom_id WHERE k.seat_kind = 'ai' ORDER BY k.id LIMIT 1
    `).get()!;
    const villageId = String(ai.id);
    const kingdomId = String(ai.kingdom_id);
    assert.deepEqual(JSON.parse(String(ai.army_json)), emptyArmy());
    assert.equal(JSON.parse(String(ai.buildings_json)).stable, 0);

    // The incoming attack is the fixture's only injected event. The AI receives
    // no troops, buildings, resources, scout reports, or shortened job timers.
    store.db.prepare(`
      INSERT INTO local_marches(id, world_id, kingdom_id, from_village_id, target_village_id,
        kind, status, army_json, loot_json, departed_at, arrives_at, battle_id)
      VALUES ('provocation', ?, ?, ?, ?, 'attack', 'complete', ?, ?, ?, ?, NULL)
    `).run(worldId, human.kingdomId, home, villageId, JSON.stringify({ ...emptyArmy(), spear: 1 }),
      JSON.stringify({ wood: 0, stone: 0, iron: 0 }), now.toISOString(), now.toISOString());

    let recruitedSpy = false;
    let sentScout = false;
    let raided = false;
    for (let hour = 0; hour < 24 * 14 && !raided; hour += 1) {
      now = new Date(now.getTime() + 3_600_000);
      store.materializeDueJobs();
      const before = JSON.parse(String(store.db.prepare("SELECT resources_json FROM local_villages WHERE id = ?").get(villageId)!.resources_json));
      const actions = runAiKingdomTick(store, worldId, now);
      assert.equal(new Set(actions.map((action) => action.villageId)).size, actions.length,
        "a village must never take two actions in one tick");
      const action = actions.find((entry) => entry.villageId === villageId);
      if (action?.type === "recruit" && action.troop === "scout") {
        recruitedSpy = true;
        assert.equal(action.quantity, 1);
        const after = JSON.parse(String(store.db.prepare("SELECT resources_json FROM local_villages WHERE id = ?").get(villageId)!.resources_json));
        const cost = troopCost("scout", 1);
        assert.deepEqual(after, { wood: before.wood - cost.wood, stone: before.stone - cost.stone, iron: before.iron - cost.iron });
        runAiKingdomTick(store, worldId, now);
        assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM local_recruitment_jobs WHERE village_id = ? AND troop = 'scout'").get(villageId)!.n, 1,
          "another tick during training must not buy a duplicate spy");
      }
      if (action?.type === "scout") {
        assert.ok(recruitedSpy, "the first scout must have been trained through the real recruitment path");
        assert.equal(action.targetVillageId, home);
        sentScout = true;
      }
      if (action?.type === "raid") {
        assert.ok(sentScout, "the AI must send a scout before its first raid");
        assert.ok(store.db.prepare("SELECT 1 FROM local_scout_reports WHERE kingdom_id = ? AND target_village_id = ?").get(kingdomId, home),
          "the real scout must have arrived and supplied a report");
        assert.equal(action.targetVillageId, home);
        raided = true;
      }
    }
    assert.ok(recruitedSpy, "an attacked AI must train a spy from the untouched production start");
    assert.ok(sentScout, "that spy must reach the scouting command path");
    assert.ok(raided, "the AI must be able to retaliate against the weak attacker it scouted");
  } finally {
    store.close();
  }
});
