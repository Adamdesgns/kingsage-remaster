import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BUILD_QUEUE_LIMIT, SharedWorldStore, type SessionPlayer } from "../src/store.ts";

function world() {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-queue-"));
  let now = new Date("2026-08-23T06:00:00.000Z");
  const store = new SharedWorldStore(join(directory, "world.sqlite"), { now: () => now });
  const account = store.register({ username: "queuer", password: "correct-horse-battery", kingdomName: "Queue" });
  const village = store.getSnapshot(account.player).world.villages
    .find((v) => v.kingdomId === account.player.kingdomId)!;
  return {
    store,
    player: account.player,
    villageId: village.id,
    advance(ms: number) { now = new Date(now.getTime() + ms); },
    /** Give the village enough to pay for `n` cheap upgrades. */
    fund(amount: number) {
      const row = store.db.prepare("SELECT resources_json FROM local_villages WHERE id = ?").get(village.id) as any;
      const resources = JSON.parse(row.resources_json);
      resources.wood = resources.stone = resources.iron = amount;
      store.db.prepare("UPDATE local_villages SET resources_json = ? WHERE id = ?").run(JSON.stringify(resources), village.id);
    },
    queue(building: string, id: string) {
      const snapshot = store.getSnapshot(account.player);
      return store.applyCommand(account.player as SessionPlayer, {
        contractVersion: 1,
        commandId: id,
        worldId: snapshot.world.id,
        actorPlayerId: account.player.id,
        expectedWorldVersion: snapshot.world.version,
        issuedAt: snapshot.serverTime,
        command: { type: "village.build.queue", payload: { villageId: village.id, building } },
      } as any);
    },
    jobs() {
      return store.db.prepare(
        "SELECT building, target_level, completes_at, status FROM local_construction_jobs WHERE village_id = ? AND status != 'complete' ORDER BY rowid",
      ).all(village.id) as any[];
    },
    levels() {
      const row = store.db.prepare("SELECT buildings_json FROM local_villages WHERE id = ?").get(village.id) as any;
      return JSON.parse(row.buildings_json);
    },
    cleanup() { store.close(); rmSync(directory, { recursive: true, force: true }); },
  };
}

test("you can queue several upgrades at once", () => {
  // Adam: "I want to be able to que as many jobs as possible then they auto
  // complete as the resources are available." One-at-a-time was the whole
  // complaint - the village refused a second order before he had built
  // anything.
  const w = world();
  try {
    w.fund(50_000);
    for (const [index, building] of ["timber", "quarry", "iron"].entries()) {
      const result = w.queue(building, `q-${index}`);
      assert.equal(result.type, "command.accepted", `${building} was refused: ${JSON.stringify(result)}`);
    }
    assert.equal(w.jobs().length, 3);
  } finally {
    w.cleanup();
  }
});

test("only the front job is actually building; the rest wait their turn", () => {
  const w = world();
  try {
    w.fund(50_000);
    w.queue("timber", "h-0");
    w.queue("quarry", "h-1");
    w.queue("iron", "h-2");
    const jobs = w.jobs();
    assert.equal(jobs[0].status, "queued", "the front job should be under way");
    assert.equal(jobs[1].status, "waiting", "the second job must not run in parallel");
    assert.equal(jobs[2].status, "waiting");
  } finally {
    w.cleanup();
  }
});

test("queueing the same building twice stacks the levels", () => {
  // Two Timber Camp orders must mean level 2 THEN level 3 - not level 2 twice,
  // which would silently throw the second upgrade away.
  const w = world();
  try {
    w.fund(50_000);
    w.queue("timber", "s-0");
    w.queue("timber", "s-1");
    const jobs = w.jobs();
    assert.equal(jobs[0].target_level, 2);
    assert.equal(jobs[1].target_level, 3);
  } finally {
    w.cleanup();
  }
});

test("a job you cannot afford waits instead of being refused", () => {
  // The rule Adam set: queue it now, it starts when the resources arrive.
  // "but you still need to get the resources" - so it waits, it is not free.
  const w = world();
  try {
    w.fund(0);
    const result = w.queue("timber", "poor-0");
    assert.equal(result.type, "command.accepted", "a queue you cannot pay for yet is still a legitimate queue");
    const jobs = w.jobs();
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].status, "waiting", "it must not start before it is paid for");
  } finally {
    w.cleanup();
  }
});

test("a waiting job starts by itself once production covers it", () => {
  const w = world();
  try {
    w.fund(0);
    w.queue("timber", "wait-0");
    assert.equal(w.jobs()[0].status, "waiting");

    // Let the village earn. Production is passive, so time is the only input.
    w.advance(6 * 60 * 60 * 1000);
    w.store.getSnapshot(w.player); // any read materialises the world

    assert.equal(w.jobs()[0].status, "queued", "the village saved up and never started the job it was holding");
  } finally {
    w.cleanup();
  }
});

test("the queue drains on its own, one job after another", () => {
  const w = world();
  try {
    w.fund(50_000);
    w.queue("timber", "d-0");
    w.queue("quarry", "d-1");
    w.advance(24 * 60 * 60 * 1000);
    w.store.getSnapshot(w.player);

    const levels = w.levels();
    assert.equal(levels.timber, 2, "the first job never finished");
    assert.equal(levels.quarry, 2, "the second job never started after the first finished");
  } finally {
    w.cleanup();
  }
});

test("the queue has a limit, and says so", () => {
  const w = world();
  try {
    w.fund(500_000);
    for (let index = 0; index < BUILD_QUEUE_LIMIT; index += 1) {
      assert.equal(w.queue("timber", `lim-${index}`).type, "command.accepted", `job ${index} refused`);
    }
    const overflow = w.queue("timber", "lim-over") as any;
    assert.equal(overflow.type, "command.rejected");
    assert.equal(overflow.payload.code, "QUEUE_FULL");
    assert.match(overflow.payload.message, new RegExp(String(BUILD_QUEUE_LIMIT)), "the refusal should name the limit");
  } finally {
    w.cleanup();
  }
});
