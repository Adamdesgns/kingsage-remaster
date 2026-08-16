import assert from "node:assert/strict";
import test from "node:test";

import {
  GAME_CONTRACT_VERSION,
  WORLD_SIZE,
  assertCoordinate,
  conquestWarVictoryPoints,
  createTwoPlayerWorldFixture,
  emptyArmy,
  makeCommandEnvelope,
} from "../src/index.ts";

test("the Gate A fixture is deterministic", () => {
  const first = createTwoPlayerWorldFixture({ seed: "same-seed" });
  const second = createTwoPlayerWorldFixture({ seed: "same-seed" });
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.villages.map(({ x, y }) => ({ x, y })), createTwoPlayerWorldFixture({ seed: "different-seed" }).villages.map(({ x, y }) => ({ x, y })));
});

test("the fixture contains two humans and clearly labeled AI seats", () => {
  const world = createTwoPlayerWorldFixture();
  assert.equal(world.contractVersion, GAME_CONTRACT_VERSION);
  assert.equal(world.width, WORLD_SIZE);
  assert.equal(world.height, WORLD_SIZE);
  assert.equal(world.kingdoms.filter(({ seatKind }) => seatKind === "human").length, 2);
  assert.equal(world.kingdoms.filter(({ seatKind }) => seatKind === "ai").length, 4);
  assert.equal(new Set(world.kingdoms.map(({ capitalVillageId }) => capitalVillageId)).size, world.kingdoms.length);
  assert.equal(new Set(world.villages.map(({ x, y }) => `${x},${y}`)).size, world.villages.length);
  for (const village of world.villages) {
    assertCoordinate(village.x, village.y);
    assert.equal(world.kingdoms.some(({ id }) => id === village.kingdomId), true);
  }
});

test("command envelopes freeze contract and concurrency metadata", () => {
  const envelope = makeCommandEnvelope({
    commandId: "command-1",
    worldId: "world-1",
    actorPlayerId: "player-adam",
    expectedWorldVersion: 7,
    issuedAt: "2026-08-16T12:00:00.000Z",
    command: {
      type: "march.launch",
      payload: {
        fromVillageId: "village-1",
        targetVillageId: "village-2",
        kind: "attack",
        army: { ...emptyArmy(), spear: 20, archer: 10 },
      },
    },
  });
  assert.equal(envelope.contractVersion, 1);
  assert.equal(envelope.expectedWorldVersion, 7);
  assert.equal(envelope.command.type, "march.launch");
  assert.equal(envelope.command.payload.army.spear, 20);
});

test("coordinates outside the persistent world are rejected", () => {
  assert.doesNotThrow(() => assertCoordinate(0, WORLD_SIZE - 1));
  assert.throws(() => assertCoordinate(-1, 0), RangeError);
  assert.throws(() => assertCoordinate(WORLD_SIZE, 0), RangeError);
  assert.throws(() => assertCoordinate(2.5, 4), RangeError);
});

test("troops begin at level one and conquest points resist weak-target farming", () => {
  const world = createTwoPlayerWorldFixture();
  assert.equal(world.kingdoms.every(({ troopLevels }) => Object.values(troopLevels).every((level) => level === 1)), true);
  const evenFight = conquestWarVictoryPoints({ developmentLevel: 12, defensePower: 500, isCapital: false, attackerRealmPower: 1_000, defenderRealmPower: 1_000 });
  const farmedWeakVillage = conquestWarVictoryPoints({ developmentLevel: 12, defensePower: 500, isCapital: false, attackerRealmPower: 4_000, defenderRealmPower: 300 });
  const defendedCapital = conquestWarVictoryPoints({ developmentLevel: 12, defensePower: 500, isCapital: true, attackerRealmPower: 1_000, defenderRealmPower: 1_200 });
  assert.ok(farmedWeakVillage < evenFight);
  assert.ok(defendedCapital > evenFight);
  assert.ok(farmedWeakVillage >= 25);
});
