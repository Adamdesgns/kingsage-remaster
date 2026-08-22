import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { emptyArmy, makeCommandEnvelope, type GameCommand } from "../../packages/game-core/src/index.ts";
import { SharedWorldStore, type SessionPlayer } from "../src/store.ts";
import { garrisonEveryVillage } from "./garrison.ts";

function tempDatabase(): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-gate-d-"));
  return { directory, path: join(directory, "world.sqlite") };
}

function issue(store: SharedWorldStore, player: SessionPlayer, command: GameCommand, id: string) {
  const snapshot = store.getSnapshot(player);
  return store.applyCommand(player, makeCommandEnvelope({
    commandId: id,
    worldId: snapshot.world.id,
    actorPlayerId: player.id,
    expectedWorldVersion: snapshot.world.version,
    issuedAt: snapshot.serverTime,
    command,
  }));
}

test("a two-kingdom scout, attack, battle, loot, and return loop preserves troops", () => {
  const temp = tempDatabase();
  let now = new Date("2026-08-16T12:00:00.000Z");
  const store = new SharedWorldStore(temp.path, { now: () => now, marchDurationMs: 1_000, returnDurationMs: 1_000 });
  garrisonEveryVillage(store);
  try {
    const attacker = store.register({ username: "gate_d_attacker", password: "gate-d-attacker", kingdomName: "Gate D Vanguard" });
    const defender = store.register({ username: "gate_d_defender", password: "gate-d-defender", kingdomName: "Gate D Bastion" });
    const opening = store.getSnapshot(attacker.player);
    const home = opening.world.villages.find((village) => village.kingdomId === attacker.player.kingdomId)!;
    const target = opening.world.villages.find((village) => village.kingdomId === defender.player.kingdomId)!;
    const originalHomeArmy = home.army;
    store.db.prepare("UPDATE local_villages SET army_json = ? WHERE id = ?")
      .run(JSON.stringify({ ...emptyArmy(), spear: 18, sword: 4, archer: 4, scout: 2 }), target.id);

    const scoutArmy = { ...emptyArmy(), scout: 1 };
    assert.equal(issue(store, attacker.player, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "scout", army: scoutArmy },
    }, "gate-d-scout").type, "command.accepted");
    assert.equal(store.getSnapshot(attacker.player).world.villages.find((village) => village.id === home.id)?.army.scout, originalHomeArmy.scout - 1);

    now = new Date(now.getTime() + 1_001);
    const scouted = store.getSnapshot(attacker.player);
    const report = scouted.scoutReports.find((candidate) => candidate.targetVillageId === target.id)!;
    assert.equal(report.observedArmy.spear, 18);
    assert.equal(scouted.marches.find((march) => march.id === report.marchId)?.status, "returning");

    const attackArmy = { ...emptyArmy(), spear: 30, sword: 12, archer: 10 };
    const launch = issue(store, attacker.player, {
      type: "march.launch",
      payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: attackArmy },
    }, "gate-d-attack");
    assert.equal(launch.type, "command.accepted");
    assert.equal(store.getSnapshot(attacker.player).world.villages.find((village) => village.id === home.id)?.army.spear, 0);

    now = new Date(now.getTime() + 1_001);
    const arrived = store.getSnapshot(attacker.player);
    const attackMarch = arrived.marches.find((march) => march.kind === "attack")!;
    assert.equal(attackMarch.status, "awaiting_battle");
    const opened = issue(store, attacker.player, {
      type: "battle.open",
      payload: {
        marchId: attackMarch.id,
        targetVillageVersion: report.targetVillageVersion,
        plan: { entry: "West Ridge", troops: "Balanced Army", time: "Dawn", style: "Flanking Strike" },
      },
    }, "gate-d-open");
    assert.equal(opened.type, "command.accepted");
    const battleId = store.getSnapshot(attacker.player).battleSessions[0].id;
    for (const [index, squad] of (["vanguard", "archers", "riders"] as const).entries()) {
      assert.equal(issue(store, attacker.player, {
        type: "battle.order",
        payload: { battleId, sequence: index + 1, squad, x: 400 + index * 50, y: 600, atMs: 5_000 + index * 1_000 },
      }, `gate-d-order-${index + 1}`).type, "command.accepted");
    }
    assert.equal(issue(store, attacker.player, { type: "battle.resolve", payload: { battleId } }, "gate-d-resolve").type, "command.accepted");
    const resolved = store.getSnapshot(attacker.player);
    const battle = resolved.battleSessions.find((candidate) => candidate.id === battleId)!;
    assert.equal(battle.status, "resolved");
    assert.equal(battle.outcome?.winner, "attacker");
    assert.ok(Object.values(battle.outcome!.loot).some((amount) => amount > 0));
    assert.equal(resolved.marches.find((march) => march.id === attackMarch.id)?.status, "returning");

    now = new Date(now.getTime() + 1_001);
    const returned = store.getSnapshot(attacker.player);
    const finalHome = returned.world.villages.find((village) => village.id === home.id)!;
    assert.equal(returned.marches.find((march) => march.id === attackMarch.id)?.status, "complete");
    assert.ok(finalHome.army.spear > 0 && finalHome.army.spear < originalHomeArmy.spear);
    assert.equal(finalHome.army.scout, originalHomeArmy.scout);
    assert.ok(returned.kingdom.warVictoryPoints > 0);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("retreat is authoritative and returns only surviving troops", () => {
  const temp = tempDatabase();
  let now = new Date("2026-08-16T12:00:00.000Z");
  const store = new SharedWorldStore(temp.path, { now: () => now, marchDurationMs: 1, returnDurationMs: 1 });
  garrisonEveryVillage(store);
  try {
    const attacker = store.register({ username: "gate_d_retreat", password: "gate-d-retreat", kingdomName: "Gate D Retreat" });
    const defender = store.register({ username: "gate_d_hold", password: "gate-d-defender", kingdomName: "Gate D Hold" });
    const snapshot = store.getSnapshot(attacker.player);
    const home = snapshot.world.villages.find((village) => village.kingdomId === attacker.player.kingdomId)!;
    const target = snapshot.world.villages.find((village) => village.kingdomId === defender.player.kingdomId)!;
    issue(store, attacker.player, { type: "march.launch", payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "scout", army: { ...emptyArmy(), scout: 1 } } }, "retreat-scout");
    now = new Date(now.getTime() + 2);
    const report = store.getSnapshot(attacker.player).scoutReports[0];
    const sent = { ...emptyArmy(), spear: 20 };
    issue(store, attacker.player, { type: "march.launch", payload: { fromVillageId: home.id, targetVillageId: target.id, kind: "attack", army: sent } }, "retreat-attack");
    now = new Date(now.getTime() + 2);
    const march = store.getSnapshot(attacker.player).marches.find((candidate) => candidate.kind === "attack")!;
    issue(store, attacker.player, { type: "battle.open", payload: { marchId: march.id, targetVillageVersion: report.targetVillageVersion, plan: { entry: "Main Breach", troops: "Vanguard Heavy", time: "Midday", style: "Full Assault" } } }, "retreat-open");
    const battleId = store.getSnapshot(attacker.player).battleSessions[0].id;
    issue(store, attacker.player, { type: "battle.retreat", payload: { battleId, sequence: 1, atMs: 60_000 } }, "retreat-now");
    const ended = store.getSnapshot(attacker.player).battleSessions[0];
    assert.equal(ended.status, "retreated");
    assert.ok(ended.outcome!.attackerSurvivors.spear < sent.spear);
    assert.ok(ended.outcome!.attackerSurvivors.spear > 0);
    assert.deepEqual(ended.outcome!.loot, { wood: 0, stone: 0, iron: 0 });
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});
