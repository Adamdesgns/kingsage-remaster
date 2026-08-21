import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SharedWorldStore } from "../src/store.ts";

function tempDatabase(): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-roblox-link-"));
  return { directory, path: join(directory, "world.sqlite") };
}

test("first link claims a seat, second link returns the same kingdom", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path);
  try {
    const first = store.linkRobloxPlayer({ robloxUserId: 12345, displayName: "Dadisaking86" });
    assert.equal(first.created, true);
    assert.ok(first.player.kingdomId);

    const again = store.linkRobloxPlayer({ robloxUserId: 12345, displayName: "Dadisaking86" });
    assert.equal(again.created, false);
    assert.equal(again.player.id, first.player.id);
    assert.equal(again.player.kingdomId, first.player.kingdomId);

    const snapshot = store.getSnapshot(first.player);
    assert.equal(snapshot.world.kingdoms.filter((kingdom) => kingdom.seatKind === "human").length, 1);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("two different Roblox users get two different kingdoms", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path);
  try {
    const a = store.linkRobloxPlayer({ robloxUserId: 1, displayName: "Adamsaking" });
    const b = store.linkRobloxPlayer({ robloxUserId: 2, displayName: "OrionTheDestroyer15" });
    assert.notEqual(a.player.kingdomId, b.player.kingdomId);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("display-name collisions still found distinct kingdoms", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path);
  try {
    const a = store.linkRobloxPlayer({ robloxUserId: 10, displayName: "Knight" });
    const b = store.linkRobloxPlayer({ robloxUserId: 11, displayName: "Knight" });
    assert.notEqual(a.player.kingdomId, b.player.kingdomId);
    const snapA = store.getSnapshot(a.player);
    const snapB = store.getSnapshot(b.player);
    assert.notEqual(snapA.kingdom.name, snapB.kingdom.name);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("web accounts cannot squat roblox usernames", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path);
  try {
    // The roblox: namespace is unreachable from the web path...
    assert.throws(
      () => store.register({ username: "roblox:5", password: "password-123", kingdomName: "Squat Crown" }),
      (error: any) => error?.code === "INVALID_USERNAME",
    );
    // ...and the closest legal lookalike does not collide with a real link.
    store.register({ username: "roblox_5", password: "password-123", kingdomName: "Lookalike Crown" });
    const linked = store.linkRobloxPlayer({ robloxUserId: 5, displayName: "RealFive" });
    assert.equal(linked.created, true);
    assert.equal(linked.player.username, "roblox:5");
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("three identical display names found three distinct kingdom names", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path);
  try {
    const names = new Set<string>();
    for (const userId of [21, 22, 23]) {
      const linked = store.linkRobloxPlayer({ robloxUserId: userId, displayName: "Bob" });
      const snapshot = store.getSnapshot(linked.player);
      assert.ok(snapshot.kingdom.name.length <= 32, snapshot.kingdom.name);
      names.add(snapshot.kingdom.name.toLowerCase());
    }
    assert.equal(names.size, 3);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("world full: linking past the open AI seats fails with WORLD_FULL", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path);
  try {
    // The deterministic fixture seeds 6 kingdoms, all starting as open AI seats.
    for (let index = 0; index < 6; index += 1) {
      store.linkRobloxPlayer({ robloxUserId: 100 + index, displayName: `Settler${index}` });
    }
    assert.throws(
      () => store.linkRobloxPlayer({ robloxUserId: 999, displayName: "Latecomer" }),
      (error: any) => error?.code === "WORLD_FULL",
    );
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});
