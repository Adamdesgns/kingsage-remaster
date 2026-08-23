import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BREEDING_PAIR, horseCapacity } from "../../packages/game-core/src/index.ts";
import { SharedWorldStore, type SessionPlayer } from "../src/store.ts";

function world() {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-horses-"));
  let now = new Date("2026-08-23T06:00:00.000Z");
  const store = new SharedWorldStore(join(directory, "world.sqlite"), { now: () => now });
  const account = store.register({ username: "breeder", password: "correct-horse-battery", kingdomName: "Herd" });
  const village = store.getSnapshot(account.player).world.villages
    .find((v) => v.kingdomId === account.player.kingdomId)!;
  return {
    store,
    player: account.player as SessionPlayer,
    villageId: village.id,
    advance(ms: number) { now = new Date(now.getTime() + ms); },
    setVillage(update: { buildings?: Record<string, number>; army?: Record<string, number>; horses?: number }) {
      const row = store.db.prepare("SELECT buildings_json, army_json FROM local_villages WHERE id = ?").get(village.id) as any;
      const buildings = { ...JSON.parse(row.buildings_json), ...(update.buildings ?? {}) };
      const army = { ...JSON.parse(row.army_json), ...(update.army ?? {}) };
      store.db.prepare("UPDATE local_villages SET buildings_json = ?, army_json = ?, resources_json = ?, state_version = state_version + 1 WHERE id = ?")
        .run(JSON.stringify(buildings), JSON.stringify(army), JSON.stringify({ wood: 500_000, stone: 500_000, iron: 500_000 }), village.id);
      if (update.horses !== undefined) {
        store.db.prepare("UPDATE local_villages SET horses = ?, horses_at = ? WHERE id = ?")
          .run(update.horses, now.toISOString(), village.id);
      }
    },
    row() {
      return store.db.prepare("SELECT horses, army_json FROM local_villages WHERE id = ?").get(village.id) as any;
    },
    recruit(troop: string, quantity: number, id: string) {
      const snapshot = store.getSnapshot(account.player);
      return store.applyCommand(account.player as SessionPlayer, {
        contractVersion: 1, commandId: id, worldId: snapshot.world.id,
        actorPlayerId: account.player.id, expectedWorldVersion: snapshot.world.version,
        issuedAt: snapshot.serverTime,
        command: { type: "village.recruit.queue", payload: { villageId: village.id, troop, quantity } },
      } as any) as any;
    },
    cleanup() { store.close(); rmSync(directory, { recursive: true, force: true }); },
  };
}

test("a Stable brings its breeding pair with it", () => {
  const w = world();
  try {
    assert.equal(Number(w.row().horses), 0, "no Stable, no horses");
    w.setVillage({ buildings: { stable: 1 } });
    w.store.getSnapshot(w.player);
    assert.equal(Number(w.row().horses), BREEDING_PAIR, "building a Stable must stock it");
  } finally {
    w.cleanup();
  }
});

test("the herd grows on its own, and stops at what the Stable holds", () => {
  const w = world();
  try {
    w.setVillage({ buildings: { stable: 3 }, horses: 0 });
    w.advance(10 * 60 * 60 * 1000);
    w.store.getSnapshot(w.player);
    const grown = Number(w.row().horses);
    assert.ok(grown > 0, "ten hours of breeding produced nothing");

    w.advance(1000 * 60 * 60 * 1000);
    w.store.getSnapshot(w.player);
    assert.equal(Number(w.row().horses), horseCapacity(3), "the herd grew past what the Stable can hold");
  } finally {
    w.cleanup();
  }
});

test("a Crusader is a Berserker plus a horse", () => {
  const w = world();
  try {
    w.setVillage({ buildings: { stable: 5, barracks: 10, smithy: 5 }, army: { axe: 20 }, horses: 10 });
    const before = w.row();
    const result = w.recruit("lightCavalry", 4, "conv-1");
    assert.equal(result.type, "command.accepted", JSON.stringify(result));

    const after = w.row();
    assert.equal(Number(after.horses), Number(before.horses) - 4, "four riders should cost four horses");
    assert.equal(JSON.parse(after.army_json).axe, 16, "four riders should cost four Berserkers");
  } finally {
    w.cleanup();
  }
});

test("no horses, no cavalry - and the refusal says the word horses", () => {
  // The whole profession lives in this message. "Insufficient resources" would
  // hide it completely.
  const w = world();
  try {
    w.setVillage({ buildings: { stable: 5, barracks: 10, smithy: 5 }, army: { axe: 500 }, horses: 0 });
    const result = w.recruit("lightCavalry", 10, "conv-2");
    assert.equal(result.type, "command.rejected");
    assert.match(String(result.payload.message), /horse/i, `refusal did not mention horses: ${result.payload.message}`);
  } finally {
    w.cleanup();
  }
});

test("no soldiers, no cavalry either", () => {
  const w = world();
  try {
    w.setVillage({ buildings: { stable: 5, barracks: 10, smithy: 5 }, army: { axe: 0 }, horses: 50 });
    const result = w.recruit("lightCavalry", 10, "conv-3");
    assert.equal(result.type, "command.rejected");
    assert.match(String(result.payload.message), /Berserker|soldier/i);
  } finally {
    w.cleanup();
  }
});

test("infantry is unaffected - it still trains from resources", () => {
  const w = world();
  try {
    w.setVillage({ buildings: { barracks: 10, smithy: 5 }, army: {}, horses: 0 });
    assert.equal(w.recruit("axe", 5, "inf-1").type, "command.accepted", "horses must not gate infantry");
  } finally {
    w.cleanup();
  }
});
