import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { FREEHOLD_COUNT, armyUnitCount } from "../../packages/game-core/src/index.ts";
import { SharedWorldStore } from "../src/store.ts";

function tempStore() {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-freehold-"));
  const store = new SharedWorldStore(join(directory, "world.sqlite"));
  return { store, cleanup: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("a seeded world persists Freeholds as their own seat kind", () => {
  const { store, cleanup } = tempStore();
  try {
    const rows = store.db.prepare("SELECT id, name, seat_kind FROM local_kingdoms WHERE seat_kind = 'freehold'").all();
    assert.equal(rows.length, FREEHOLD_COUNT);
  } finally {
    cleanup();
  }
});

test("no player is ever seated into a Freehold", () => {
  // findOpenSeat() claims `seat_kind = 'ai'`. Before Freeholds had their own
  // kind, adding them to the world would have handed the fifth player an
  // abandoned settlement as their kingdom - seating them inside the thing the
  // game wants them to conquer.
  const { store, cleanup } = tempStore();
  try {
    const openSeats = Number((store.db.prepare(
      "SELECT COUNT(*) AS count FROM local_kingdoms WHERE seat_kind IN ('open', 'ai') AND controller_player_id IS NULL",
    ).get() as { count: number }).count);

    for (let index = 0; index < openSeats; index += 1) {
      store.register({ username: `freeholder_${index}`, password: "correct-horse-battery", kingdomName: `Kingdom ${index}` });
    }

    const seated = store.db.prepare(
      "SELECT id FROM local_kingdoms WHERE controller_player_id IS NOT NULL AND id LIKE 'freehold-%'",
    ).all();
    assert.equal(seated.length, 0, "a player was seated into a Freehold");

    // And the world is genuinely full at that point - Freeholds do not pad the
    // seat count.
    assert.throws(
      () => store.register({ username: "one_too_many", password: "correct-horse-battery", kingdomName: "Latecomer" }),
      /WORLD_FULL|no open kingdom seats/i,
    );
  } finally {
    cleanup();
  }
});

test("a Freehold garrison survives the seed intact", () => {
  const { store, cleanup } = tempStore();
  try {
    const row = store.db.prepare(
      "SELECT army_json, buildings_json FROM local_villages WHERE id = 'village-freehold-1'",
    ).get() as { army_json: string; buildings_json: string };
    assert.ok(row, "freehold village was not seeded");
    const army = JSON.parse(row.army_json);
    const buildings = JSON.parse(row.buildings_json);
    assert.ok(army.spear > 0, "a Freehold with no garrison is a free village");
    assert.equal(buildings.wall, 0, "a Freehold behind a wall is not a first rung");
  } finally {
    cleanup();
  }
});

test("dev seeding never arms a Freehold", () => {
  // The dev knobs exist so a Studio drill can walk a path that would otherwise
  // take hours of real training. Seeding the TARGET as well as the attacker
  // defeats the point - and worse, it is invisible: the drill just loses and
  // nothing on screen says why. That is exactly how 2026-08-22's conquest run
  // was lost, at 875 attack against 1,828 defence.
  const directory = mkdtempSync(join(tmpdir(), "kingsage-devseed-"));
  const store = new SharedWorldStore(join(directory, "world.sqlite"), {
    devSeedNobles: 5,
    devSeedArmy: { axe: 60 },
  });
  try {
    const freehold = store.db.prepare("SELECT army_json FROM local_villages WHERE id = 'village-freehold-1'")
      .get() as { army_json: string };
    const army = JSON.parse(freehold.army_json);
    assert.equal(army.noble ?? 0, 0, "a Freehold was handed Counts");
    assert.equal(army.axe ?? 0, 0, "a Freehold was handed an offensive army");
    assert.ok(army.spear > 0, "and it still has the garrison that makes it a real first rung");

    // A player capital DOES get both, which is the point of the knobs.
    const capital = store.db.prepare("SELECT army_json FROM local_villages WHERE id = 'village-1-capital'")
      .get() as { army_json: string };
    const capitalArmy = JSON.parse(capital.army_json);
    assert.equal(capitalArmy.noble, 5);
    assert.equal(capitalArmy.axe, 60);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("with no dev knobs set, a kingdom still starts with nothing", () => {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-nodevseed-"));
  const store = new SharedWorldStore(join(directory, "world.sqlite"));
  try {
    const capital = store.db.prepare("SELECT army_json FROM local_villages WHERE id = 'village-1-capital'")
      .get() as { army_json: string };
    assert.equal(armyUnitCount(JSON.parse(capital.army_json)), 0, "production must never hand out troops");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a fresh world seats fresh starts first: two open seats, then four named kingdoms", () => {
  const { store, cleanup } = tempStore();
  try {
    const open = store.db.prepare("SELECT id FROM local_kingdoms WHERE seat_kind = 'open' ORDER BY id").all() as Array<{ id: string }>;
    const named = store.db.prepare("SELECT id FROM local_kingdoms WHERE seat_kind = 'ai' ORDER BY id").all() as Array<{ id: string }>;
    assert.equal(open.length, 2, "two fresh-start seats");
    assert.equal(named.length, 4, "four named AI kingdoms");

    const first = store.register({ username: "fresh_one", password: "correct-horse-battery", kingdomName: "Fresh One" });
    const second = store.register({ username: "fresh_two", password: "correct-horse-battery", kingdomName: "Fresh Two" });
    const openIds = new Set(open.map((row) => row.id));
    assert.ok(openIds.has(first.player.kingdomId), "the first player gets a fresh start, not a developed kingdom");
    assert.ok(openIds.has(second.player.kingdomId), "so does the second");

    const third = store.register({ username: "fresh_three", password: "correct-horse-battery", kingdomName: "Fresh Three" });
    assert.ok(
      named.some((row) => row.id === third.player.kingdomId),
      "with the fresh starts taken, the third player inherits a named kingdom",
    );
  } finally {
    cleanup();
  }
});

test("an old-schema world migrates: the placeholder seats become 'open' without touching anyone else", () => {
  // Fabricate a pre-0012 database by hand: schema through 0007 (the freehold
  // rebuild), one unclaimed placeholder seat, one named AI kingdom.
  const directory = mkdtempSync(join(tmpdir(), "kingsage-openmigrate-"));
  const path = join(directory, "world.sqlite");
  try {
    const raw = new DatabaseSync(path);
    for (const file of ["0002_gate_b_local_sqlite.sql", "0003_gate_c_economy.sql", "0004_gate_d_warfare.sql", "0005_roblox_identity.sql", "0006_battles_slice_a.sql", "0007_freeholds.sql"]) {
      raw.exec(readFileSync(new URL(`../db/migrations/${file}`, import.meta.url), "utf8"));
    }
    raw.prepare("INSERT INTO local_worlds(id, contract_version, version, name, seed, width, height, status, created_at) VALUES (?, 1, 1, ?, ?, 50, 50, 'active', ?)")
      .run("world-old", "Old World", "old-seed", "2026-08-01T00:00:00.000Z");
    const insertKingdom = raw.prepare(
      "INSERT INTO local_kingdoms(id, world_id, name, color, seat_kind, controller_player_id, capital_village_id, troop_levels_json, war_victory_points, villages_conquered, alive) VALUES (?, 'world-old', ?, '#333333', 'ai', NULL, ?, '{}', 0, 0, 1)",
    );
    insertKingdom.run("kingdom-old-1", "Frontier March 1", "village-old-1");
    insertKingdom.run("kingdom-old-2", "Warlord Kaas", "village-old-2");
    raw.close();

    const store = new SharedWorldStore(path);
    try {
      const schema = store.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'local_kingdoms'").get() as { sql: string };
      assert.ok(String(schema.sql).includes("'open'"), "the seat_kind constraint now admits 'open'");
      const frontier = store.db.prepare("SELECT seat_kind FROM local_kingdoms WHERE id = 'kingdom-old-1'").get() as { seat_kind: string };
      assert.equal(frontier.seat_kind, "open", "the unclaimed placeholder was backfilled to 'open'");
      const named = store.db.prepare("SELECT seat_kind FROM local_kingdoms WHERE id = 'kingdom-old-2'").get() as { seat_kind: string };
      assert.equal(named.seat_kind, "ai", "the named AI kingdom is untouched");
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
