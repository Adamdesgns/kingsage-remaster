// A real loopback HTTP probe against a disposable persistent world. This is
// disk/API evidence, not Studio, client rendering, or production evidence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createWorldHttpServer } from "../server/src/http.ts";
import { SharedWorldStore } from "../server/src/store.ts";

const temporaryRoot = resolve(tmpdir());
const directory = mkdtempSync(join(temporaryRoot, "kingsmarch-practice-disk-"));
const database = join(directory, "practice.sqlite");
const key = "dev-secret-local-0001";
process.env.KINGSAGE_AI_TICK_MS = "0";
const store = new SharedWorldStore(database, { now: () => new Date("2026-09-04T12:00:00.000Z") });
const app = createWorldHttpServer({ store, robloxKey: key, materializeIntervalMs: 3_600_000 });
assert.equal(app.aiTickScheduled, false);
await new Promise((done) => app.server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${app.server.address().port}`;
const request = {
  version: 1,
  routes: {
    vanguard: [{ x: 50, y: 5 }, { x: 50, y: 34 }, { x: 50, y: 88 }],
    archers: [{ x: 10, y: 5 }, { x: 28, y: 34 }, { x: 28, y: 48 }, { x: 50, y: 88 }],
    riders: [{ x: 90, y: 5 }, { x: 72, y: 34 }, { x: 72, y: 48 }, { x: 50, y: 88 }],
  },
  objectives: { vanguard: "gate", archers: "westTower", riders: "eastTower" },
  defensePlan: "guardGate",
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function disk() {
  // SQLite's shm file is a transient coordination index; durable writes are
  // the main database and write-ahead log, both compared byte for byte here.
  return Object.fromEntries(["", "-wal"].map((suffix) => [suffix || "database",
    existsSync(database + suffix) ? readFileSync(database + suffix) : null]));
}
function logical() {
  const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return JSON.stringify(tables.map(({ name }) => ({ name,
    rows: store.db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all() })));
}
async function post(path, body) {
  const response = await fetch(base + path, { method: "POST", headers: {
    "content-type": "application/json", "x-kingsage-key": key,
  }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function attempt(id, payload) {
  return post("/api/roblox/commands", { robloxUserId: 994209, commandId: id,
    expectedWorldVersion: -999, command: { type: "practice.siege.resolve", payload } });
}
try {
  const joined = await post("/api/roblox/session", { robloxUserId: 994209, displayName: "Disk probe" });
  assert.equal(joined.status, 200);
  store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const beforeDisk = disk();
  const beforeLogical = logical();
  const first = await attempt("disk-repeat", request);
  const repeated = await attempt("disk-repeat", request);
  assert.equal(first.status, 200);
  assert.deepEqual(repeated, first);
  const malformed = structuredClone(request);
  malformed.routes.archers[0].x = 10.5;
  const refused = await attempt("disk-rejected", malformed);
  assert.equal(refused.status, 400);
  assert.equal(refused.body.payload.code, "INVALID_PRACTICE_SIEGE");
  const changed = structuredClone(request);
  changed.defensePlan = "towerCrossfire";
  const alternate = await attempt("disk-alternate", changed);
  assert.equal(alternate.status, 200);
  assert.notDeepEqual(alternate.body.payload.practiceSiege, first.body.payload.practiceSiege);
  const afterDisk = disk();
  assert.deepEqual(afterDisk, beforeDisk, "practice changed durable database bytes");
  assert.equal(logical(), beforeLogical, "practice changed persisted rows");
  console.log(JSON.stringify({
    evidence: "disposable loopback HTTP and durable SQLite bytes; not Studio",
    accepted: [first.status, repeated.status, alternate.status], rejected: refused.status,
    identicalReplay: true, allPersistentRowsUnchanged: true, durableFilesUnchanged: true,
    databaseSha256: hash(afterDisk.database),
    walSha256: afterDisk["-wal"] === null ? null : hash(afterDisk["-wal"]),
    persistentRowsSha256: hash(beforeLogical),
    phaseEvents: first.body.payload.practiceSiege.phaseEvents.length,
    outcome: first.body.payload.practiceSiege.outcome,
    rejection: refused.body.payload.message,
  }, null, 2));
} finally {
  await app.close();
  store.close();
  // Verify the absolute cleanup target remains our newly created temp folder.
  assert(resolve(directory).startsWith(temporaryRoot + sep));
  assert(directory.includes("kingsmarch-practice-disk-"));
  rmSync(directory, { recursive: true, force: true });
}
