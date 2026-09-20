#!/usr/bin/env node
// C2 — the building ladder over HTTP: every prerequisite rule at its
// threshold, the queue limit, and three buildings that are not the Timber Camp
// completing on a real clock.
//
// Matrix row C2 ("13 building types: costs, prereqs, queue stacking, server
// timers, offline catch-up") in
// docs/verification/2026-09-17-full-game-acceptance-matrix.md carries live
// evidence for ONE completed building type (timber, 720 s) and ONE
// prerequisite refusal (a Rampart at Headquarters 1). Its row says plainly:
// "the other prerequisite rules and completion of any building other than
// timber NOT exercised live". This drill is that exercise, HTTP-only: no
// Studio, no PC, no phone, no hosting.
//
// The six gated buildings (Rampart, Smithy, Market, Stable, Workshop, Academy)
// need standing levels a fresh village cannot reach in minutes, so the ladder
// rides KINGSAGE_DEV_SEED_LEVEL - production code in server/src/index.ts,
// documented DEV ONLY, which raises every non-Freehold building to one level
// at world creation, clamped to each building's own maximum. Each rung is a
// separate disposable world; the same knob is what a Studio drill would use.
// What the knob cannot do is also recorded: at the first level where the
// Academy's prerequisite (Headquarters 10) is met, the knob has already
// clamped the Academy to its maximum of 3, so the Academy's ACCEPTANCE path
// stays tests-only and the drill says so rather than pretending.
//
// Worlds:
//   L1  (port base)     a fresh world at fixture levels: the six refusals at
//                       standing level 1, three orders (Quarry, Warehouse,
//                       Farm) in three villages, prerequisites judged on
//                       STANDING levels (a queued Headquarters does not count),
//                       the 10-order queue limit, and - 12 to 14 minutes later
//                       - all three completions plus the chained starts.
//   L2, L3, L5, L8, L10 one rung each: the buildings whose gate opens at that
//                       level are accepted, the rest still name the exact
//                       missing prerequisite; Freeholds stay at fixture levels.
//   L99 (maxed)         all 13 buildings refuse INVALID_COMMAND "already at its
//                       maximum level"; the snapshot shows each at its own cap.
//
// Expected prerequisite messages and maximum levels are HARD-CODED below from
// a reading of packages/game-core/src/economy.ts, so the drill is an oracle
// rather than the server checked against itself. Cost, duration, production
// and storage NUMBERS are imported from game-core, as the re-drive did.
//
// Same posture as the other drills in scripts/: throwaway worlds in a fresh
// mkdtemp directory, throwaway key, non-4178 ports, inherited KINGSAGE_* env
// stripped (then the seed knob set explicitly, per world). Needs only Node 22
// + the sqlite3 CLI. ~15 min, almost all of it the real Farm timer (840 s).
//
//   node scripts/c2-building-ladder-drill.mjs                        # exit 0 = every step PASS
//   LADDER_SKIP_COMPLETION_WAIT=1 node scripts/c2-building-ladder-drill.mjs   # step 12 reports SKIPPED, not claimed
//   LADDER_PORT=4251 node scripts/c2-building-ladder-drill.mjs        # L1 on 4251, rungs on 4252-4257
//
// Every request, response and shell command is printed so the output can be
// pasted into a dated docs/verification/ note verbatim.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The cost/duration numbers come from packages/game-core (TypeScript), so this
// script needs the same flag the server runs under. Re-exec once if the caller
// forgot it, so `node scripts/c2-building-ladder-drill.mjs` just works.
if (!process.execArgv.includes("--experimental-strip-types")) {
  const rerun = spawnSync(process.execPath, ["--experimental-strip-types", ...process.argv.slice(1)], { stdio: "inherit" });
  process.exit(rerun.status ?? 1);
}

const { buildingCost, buildingDurationSeconds, populationCapacity, productionPerHour, storageCapacity } =
  await import("../packages/game-core/src/economy.ts");

// ---------------------------------------------------------------- the oracle
// Hand-copied from packages/game-core/src/economy.ts BUILDINGS. If someone
// changes a prerequisite or a cap there, this drill fails on the message -
// which is the point: the rules on record must be the rules that run.
const MAX_LEVEL = { hq: 20, timber: 25, quarry: 25, iron: 25, farm: 30, warehouse: 30, barracks: 25, wall: 20, smithy: 10, stable: 20, workshop: 15, academy: 3, market: 20 };
const NAME = { hq: "Headquarters", timber: "Timber Camp", quarry: "Stone Quarry", iron: "Iron Mine", farm: "Farm", warehouse: "Warehouse", barracks: "Barracks", wall: "Rampart", smithy: "Smithy", stable: "Stable", workshop: "Workshop", academy: "Academy", market: "Market" };
const ALL_BUILDINGS = Object.keys(MAX_LEVEL);
// The six gated buildings and the FIRST prerequisite each names when a world
// is seeded uniformly at level L (every building = min(L, its cap)):
//   wall     { hq: 2 }
//   smithy   { hq: 3, barracks: 3 }
//   market   { hq: 3, warehouse: 3 }
//   stable   { barracks: 5, smithy: 1 }
//   workshop { hq: 8, smithy: 5 }
//   academy  { hq: 10, smithy: 5 }   (Academy caps at 3, so at L10 it is maxed)
const GATED = ["wall", "smithy", "market", "stable", "workshop", "academy"];
function expectedRefusal(building, level) {
  const at = (b) => Math.min(level, MAX_LEVEL[b]);
  if (at(building) >= MAX_LEVEL[building]) return { code: "INVALID_COMMAND", message: `${NAME[building]} is already at its maximum level.` };
  const rules = { wall: [["hq", 2]], smithy: [["hq", 3], ["barracks", 3]], market: [["hq", 3], ["warehouse", 3]], stable: [["barracks", 5], ["smithy", 1]], workshop: [["hq", 8], ["smithy", 5]], academy: [["hq", 10], ["smithy", 5]] };
  for (const [need, needLevel] of rules[building] ?? []) {
    if (at(need) < needLevel) return { code: "PREREQUISITE_MISSING", message: `Requires ${NAME[need]} level ${needLevel}.` };
  }
  return null; // accepted
}
const BUILD_QUEUE_LIMIT = 10; // server/src/store.ts
const FIXTURE_LEVELS = { hq: 1, timber: 1, quarry: 1, iron: 1, farm: 1, warehouse: 1, barracks: 1, wall: 1, academy: 0, stable: 0, workshop: 0, smithy: 0, market: 0 };
const FIXTURE_RESOURCES = { wood: 1200, stone: 1000, iron: 800 };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = join(repoRoot, "server");
const basePort = Number(process.env.LADDER_PORT ?? 4251);
const skipCompletionWait = process.env.LADDER_SKIP_COMPLETION_WAIT === "1";
// Throwaway key for throwaway worlds. Not a secret; never reused anywhere.
const robloxKey = "ladder-throwaway-key-0001";

const scratch = mkdtempSync(join(tmpdir(), "kingsmarch-ladder-"));
const results = [];
const TOTAL_STEPS = 12;
const servers = new Map(); // port -> child

const log = (line = "") => process.stdout.write(`${line}\n`);
const step = (n, title) => { log(""); log(`## Step ${n} — ${title}`); };
function record(n, ok, detail) { results.push({ step: n, ok, detail }); log(`[step ${n}] ${ok ? "PASS" : "FAIL"} — ${detail}`); }
function fail(n, detail) { record(n, false, detail); throw new Error(`step ${n} failed: ${detail}`); }
function expect(n, condition, detail) { if (!condition) fail(n, detail); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shorten = (text, max = 400) => (text.length > max ? `${text.slice(0, max)}… (${text.length} bytes)` : text);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function sqlite(dbPath, sql) {
  const run = spawnSync("sqlite3", [dbPath, sql], { encoding: "utf8" });
  log(`$ sqlite3 <db> ${JSON.stringify(sql)}`);
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
  if (out) log(out.split("\n").map((l) => `  ${l}`).join("\n"));
  log(`  -> exit ${run.status}`);
  return (run.stdout ?? "").trim();
}

async function request(port, method, path, body, { key = robloxKey, quiet = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (key !== null) headers["x-kingsage-key"] = key;
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    if (!quiet) log(`${method} ${path} -> connection refused (${error.cause?.code ?? error.message})`);
    return { status: 0, json: null, text: "" };
  }
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  if (!quiet) log(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ""} -> ${response.status} ${shorten(text)}`);
  return { status: response.status, json, text };
}

function startServer(port, dbPath, { seedLevel } = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("KINGSAGE_")) env[k] = v;
  Object.assign(env, { KINGSAGE_DATABASE_PATH: dbPath, KINGSAGE_ROBLOX_KEY: robloxKey, KINGSAGE_BIND: "127.0.0.1", PORT: String(port) });
  if (seedLevel !== undefined) env.KINGSAGE_DEV_SEED_LEVEL = String(seedLevel);
  log(`$ (cd server && KINGSAGE_DATABASE_PATH=${dbPath} KINGSAGE_ROBLOX_KEY=<throwaway>${seedLevel !== undefined ? ` KINGSAGE_DEV_SEED_LEVEL=${seedLevel}` : ""} KINGSAGE_BIND=127.0.0.1 PORT=${port} node --experimental-strip-types src/index.ts &)`);
  const child = spawn(process.execPath, ["--experimental-strip-types", "src/index.ts"], { cwd: serverRoot, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => log(`  [server:${port}] ${String(chunk).trimEnd()}`));
  child.stderr.on("data", (chunk) => { const text = String(chunk).trimEnd(); if (!text.includes("ExperimentalWarning") && !text.includes("--trace-warnings")) log(`  [server:${port}:err] ${text}`); });
  child.exited = new Promise((done) => child.once("exit", (code, signal) => done({ code, signal })));
  child.port = port;
  servers.set(port, child);
  return child;
}

async function waitForHealth(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const probe = await request(port, "GET", "/api/health", undefined, { key: null, quiet: true });
    if (probe.status === 200) return probe;
    await sleep(200);
  }
  throw new Error(`no /api/health 200 from port ${port} within ${timeoutMs}ms`);
}

async function stopServer(port, label) {
  const child = servers.get(port);
  if (!child) return;
  servers.delete(port);
  if (child.exitCode !== null || child.signalCode !== null) return;
  log(`$ kill -TERM <${label} pid ${child.pid}>`);
  child.kill("SIGTERM");
  const outcome = await Promise.race([child.exited, sleep(10_000).then(() => ({ code: null, signal: "TIMEOUT" }))]);
  if (outcome.signal === "TIMEOUT") { child.kill("SIGKILL"); await child.exited; }
  log(`  -> ${label} exited (code ${outcome.code}, signal ${outcome.signal}) at ${new Date().toISOString()}`);
}

async function pullState(port, ids, { quiet = false } = {}) {
  const result = await request(port, "POST", "/api/roblox/state", { robloxUserIds: ids }, { quiet: true });
  if (result.status !== 200) throw new Error(`/api/roblox/state -> ${result.status} ${result.text}`);
  if (!quiet) log(`POST /api/roblox/state {"robloxUserIds":${JSON.stringify(ids)}} -> 200 (${result.text.length} bytes; states: ${Object.keys(result.json.states).join(",") || "none"})`);
  return result.json;
}

function ownVillage(state) {
  const village = state.world.villages.find((v) => v.kingdomId === state.kingdom.id);
  if (!village) throw new Error("no village belongs to the player's kingdom");
  return village;
}

async function link(port, player) {
  const res = await request(port, "POST", "/api/roblox/session", { robloxUserId: player.userId, displayName: player.name });
  if (res.status !== 200 || res.json.created !== true) throw new Error(`link ${player.tag}: ${res.status} ${res.text}`);
  player.playerId = res.json.playerId;
  player.kingdomId = res.json.kingdomId;
  const state = (await pullState(port, [player.userId], { quiet: true })).states[String(player.userId)];
  player.villageId = ownVillage(state).id;
  return state;
}

// The world version is global and every accepted order (by anyone) bumps it,
// so each command reads the current version first rather than guessing.
async function order(port, player, commandId, building, { quiet = false } = {}) {
  const version = (await pullState(port, [player.userId], { quiet: true })).states[String(player.userId)].world.version;
  const body = { robloxUserId: player.userId, commandId, expectedWorldVersion: version, command: { type: "village.build.queue", payload: { villageId: player.villageId, building } } };
  const res = await request(port, "POST", "/api/roblox/commands", body, { quiet });
  return { ...res, body };
}

function villageRow(dbPath, villageId) {
  const raw = sqlite(dbPath, `SELECT v.resources_json || '|' || v.buildings_json || '|' || e.last_materialized_at || '|' || e.resource_carry_json FROM local_villages v JOIN local_village_economy e ON e.village_id = v.id WHERE v.id = '${villageId}';`);
  const [resources, buildings, lastMaterializedAt, carry] = raw.split("|");
  return { resources: JSON.parse(resources), buildings: JSON.parse(buildings), lastMaterializedAt, carry: JSON.parse(carry) };
}

function jobRows(dbPath, villageId) {
  const raw = sqlite(dbPath, `SELECT id || '|' || building || '|' || target_level || '|' || status || '|' || started_at || '|' || completes_at FROM local_construction_jobs WHERE village_id = '${villageId}' ORDER BY rowid;`);
  return raw.split("\n").filter(Boolean).map((line) => { const [id, building, targetLevel, status, startedAt, completesAt] = line.split("|"); return { id, building, targetLevel: Number(targetLevel), status, startedAt, completesAt }; });
}

// Exact cost check with a little room for the 28/h trickle: production can
// land a whole unit between the pull before and the pull after an order.
function expectCostDeducted(n, label, before, after, cost) {
  for (const kind of ["wood", "stone", "iron"]) {
    const delta = after[kind] - before[kind];
    expect(n, delta >= -cost[kind] && delta <= -cost[kind] + 2, `${label}: ${kind} moved ${delta}, cost is ${cost[kind]}`);
  }
}

// Run one rung of the ladder: a fresh world seeded at `level`. The buildings
// whose gate OPENS at this rung (refused at the previous rung, accepted now)
// are ordered once each from their own player - two players, so an accepted
// order in one village does not park the next as 'waiting' in the same one -
// and every still-gated building is ordered once to read its refusal.
async function rung(n, level, prevLevel, port) {
  const dbPath = join(scratch, `ladder-l${level}.sqlite`);
  const expected = Object.fromEntries(GATED.map((b) => [b, expectedRefusal(b, level)]));
  const accepted = GATED.filter((b) => expected[b] === null && expectedRefusal(b, prevLevel) !== null);
  const refused = GATED.filter((b) => expected[b] !== null);
  expect(n, accepted.length >= 1 && accepted.length <= 2, `rung L${level} opens ${accepted.length} gates; the drill expects 1 or 2`);
  step(n, `world L${level} — KINGSAGE_DEV_SEED_LEVEL=${level}: ${accepted.map((b) => NAME[b]).join(" and ")} accepted (gate opens at this rung); ${refused.map((b) => `${NAME[b]} → ${expected[b].code} "${expected[b].message}"`).join("; ")}; Freeholds untouched`);
  expect(n, !existsSync(dbPath), `scratch DB already exists at ${dbPath}`);
  startServer(port, dbPath, { seedLevel: level });
  const h = await waitForHealth(port);
  log(`GET /api/health -> ${h.status} ${h.text}`);
  const players = [{ userId: 950000 + level * 10 + 1, name: `Ladder ${level} A`, tag: "a" }, { userId: 950000 + level * 10 + 2, name: `Ladder ${level} B`, tag: "b" }];
  const states = [];
  for (const p of players) states.push(await link(port, p));
  const seeded = ownVillage(states[0]).buildings;
  const expectedLevels = Object.fromEntries(ALL_BUILDINGS.map((b) => [b, Math.min(level, MAX_LEVEL[b])]));
  log(`seeded levels (player a): ${JSON.stringify(seeded)}`);
  expect(n, ALL_BUILDINGS.every((b) => seeded[b] === expectedLevels[b]), `seeded levels ${JSON.stringify(seeded)} != min(${level}, cap) ${JSON.stringify(expectedLevels)}`);
  expect(n, same(ownVillage(states[0]).resources, FIXTURE_RESOURCES), `the knob touched the starting resources: ${JSON.stringify(ownVillage(states[0]).resources)}`);
  const freeholds = sqlite(dbPath, "SELECT v.buildings_json FROM local_villages v JOIN local_kingdoms k ON k.id = v.kingdom_id WHERE k.seat_kind = 'freehold' ORDER BY v.id;").split("\n").filter(Boolean).map((j) => JSON.parse(j));
  expect(n, freeholds.length > 0 && freeholds.every((b) => b.hq === 1 && b.wall === 0 && b.barracks === 0 && b.timber === 1), `Freeholds were seeded: ${JSON.stringify(freeholds)}`);
  const inboxBefore = Number(sqlite(dbPath, "SELECT count(*) FROM local_command_inbox;"));
  const report = [];
  // Refusals first (they leave the world untouched), then acceptances, one
  // per player so each accepted order is the ONLY order in its village.
  for (const building of refused) {
    const res = await order(port, players[0], `ladder-l${level}-${building}`, building);
    expect(n, res.status === 409 && res.json?.type === "command.rejected" && res.json.payload.code === expected[building].code && res.json.payload.message === expected[building].message,
      `${NAME[building]} at L${level}: expected 409 ${expected[building].code} "${expected[building].message}", got ${res.status} ${res.text}`);
    report.push(`${NAME[building]} → 409 ${res.json.payload.code} "${res.json.payload.message}"`);
  }
  const jobsAfterRefusals = Number(sqlite(dbPath, "SELECT count(*) FROM local_construction_jobs;"));
  expect(n, jobsAfterRefusals === 0, `refusals created ${jobsAfterRefusals} job rows`);
  for (const [i, building] of accepted.entries()) {
    const player = players[i % players.length];
    const before = villageRow(dbPath, player.villageId);
    const res = await order(port, player, `ladder-l${level}-${building}`, building);
    expect(n, res.status === 200 && res.json?.type === "command.accepted" && res.json.payload.constructionJob?.building === building && res.json.payload.constructionJob.targetLevel === seeded[building] + 1,
      `${NAME[building]} at L${level} should be accepted to level ${seeded[building] + 1}: ${res.status} ${res.text}`);
    const job = res.json.payload.constructionJob;
    const rows = jobRows(dbPath, player.villageId);
    const row = rows.find((r) => r.id === job.id);
    expect(n, row, `accepted job ${job.id} not in local_construction_jobs`);
    const cost = buildingCost(building, seeded[building]);
    const affordable = ["wood", "stone", "iron"].every((k) => before.resources[k] >= cost[k]);
    const after = villageRow(dbPath, player.villageId);
    if (affordable) {
      const durationS = buildingDurationSeconds(building, seeded[building], seeded.hq);
      expect(n, row.status === "queued", `${NAME[building]} affordable at ${JSON.stringify(cost)} but row status is ${row.status}`);
      expect(n, (Date.parse(job.completesAt) - Date.parse(job.startedAt)) / 1000 === durationS, `${NAME[building]} timer ${(Date.parse(job.completesAt) - Date.parse(job.startedAt)) / 1000}s != buildingDurationSeconds ${durationS}s`);
      expectCostDeducted(n, `${NAME[building]} at L${level}`, before.resources, after.resources, cost);
      report.push(`${NAME[building]} → accepted ${seeded[building]}→${seeded[building] + 1}, queued, cost ${JSON.stringify(cost)} deducted, timer ${durationS}s`);
    } else {
      // Unaffordable at the fixture's 1200/1000/800: the order is accepted and
      // parked 'waiting' - queueing is free, building is not (Adam's rule).
      expect(n, row.status === "waiting", `${NAME[building]} costs ${JSON.stringify(cost)} > ${JSON.stringify(before.resources)} so it should be 'waiting', row status is ${row.status}`);
      expect(n, job.completesAt === job.startedAt, `a waiting job should carry the placeholder completesAt == startedAt: ${JSON.stringify(job)}`);
      expect(n, same(after.resources, before.resources), `a waiting order charged the village: ${JSON.stringify(before.resources)} → ${JSON.stringify(after.resources)}`);
      report.push(`${NAME[building]} → accepted ${seeded[building]}→${seeded[building] + 1} but WAITING unpaid (cost ${JSON.stringify(cost)} exceeds ${JSON.stringify(before.resources)}; nothing deducted)`);
    }
  }
  const orders = accepted.length + refused.length;
  const inboxAfter = Number(sqlite(dbPath, "SELECT count(*) FROM local_command_inbox;"));
  expect(n, inboxAfter - inboxBefore === orders, `expected ${orders} inbox rows for ${orders} orders, got ${inboxAfter - inboxBefore}`);
  await stopServer(port, `world L${level} server`);
  record(n, true, `levels = min(${level}, cap) for all 13, resources untouched, ${freeholds.length} Freeholds still at fixture levels; ${report.join("; ")}; ${orders} inbox rows`);
}

async function main() {
  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
  log(`# C2 — the building ladder over HTTP (current tip)`);
  log(`date: ${new Date().toISOString()}`);
  log(`sha: ${sha}`);
  log(`node: ${process.version}`);
  log(`sqlite3: ${spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).stdout.trim()}`);
  log(`scratch: ${scratch}`);
  log(`ports: L1=${basePort} (fixture levels, completions) rungs L2..L99=${basePort + 1}..${basePort + 6}`);
  if (skipCompletionWait) log(`mode: LADDER_SKIP_COMPLETION_WAIT=1 — step 12 will be SKIPPED, not claimed`);

  // ================================================================ world L1
  const portL1 = basePort;
  const dbL1 = join(scratch, "ladder-l1.sqlite");
  const P1 = { userId: 950001, name: "Ladder One", tag: "p1" };
  const P2 = { userId: 950002, name: "Ladder Two", tag: "p2" };
  const P3 = { userId: 950003, name: "Ladder Three", tag: "p3" };

  // ------------------------------------------------------------------ 1
  step(1, "world L1 — fresh disposable world at fixture levels; three players linked; the snapshot's economy equals the formulas at those levels");
  expect(1, !existsSync(dbL1), `scratch DB already exists at ${dbL1}`);
  startServer(portL1, dbL1);
  const h1 = await waitForHealth(portL1);
  log(`GET /api/health -> ${h1.status} ${h1.text}`);
  expect(1, h1.json?.ok === true && h1.json?.service === "kingsage-world", `unexpected health body ${h1.text}`);
  const s1 = await link(portL1, P1);
  await link(portL1, P2);
  await link(portL1, P3);
  for (const p of [P1, P2, P3]) log(`${p.tag}: ${p.playerId} / ${p.kingdomId} / ${p.villageId}`);
  const v1 = ownVillage(s1);
  log(`p1 buildings: ${JSON.stringify(v1.buildings)}; resources ${JSON.stringify(v1.resources)}`);
  expect(1, same(v1.buildings, FIXTURE_LEVELS), `fixture levels are ${JSON.stringify(v1.buildings)}`);
  expect(1, same(v1.resources, FIXTURE_RESOURCES), `fixture resources are ${JSON.stringify(v1.resources)}`);
  const econ1 = s1.villageEconomy.find((e) => e.villageId === v1.id);
  log(`p1 villageEconomy: ${JSON.stringify(econ1)}`);
  expect(1, econ1.storageCapacity === storageCapacity(1) && econ1.populationCapacity === populationCapacity(1) && econ1.productionPerHour.stone === productionPerHour(1), `economy ${JSON.stringify(econ1)} does not match the formulas at level 1`);
  record(1, true, `health 200; p1/p2/p3 linked to ${P1.kingdomId}/${P2.kingdomId}/${P3.kingdomId}; buildings ${JSON.stringify(v1.buildings)}; storage ${econ1.storageCapacity}, population cap ${econ1.populationCapacity}, production ${JSON.stringify(econ1.productionPerHour)}/h — the formulas at level 1`);

  // ------------------------------------------------------------------ 2
  step(2, "world L1 — every gated building at STANDING level 1 is refused with the exact missing prerequisite; an unknown building type is INVALID_COMMAND; all seven stored, nothing built, nothing charged, world version unchanged; replay byte-identical");
  const before2 = villageRow(dbL1, P1.villageId);
  const version2 = (await pullState(portL1, [P1.userId], { quiet: true })).states[String(P1.userId)].world.version;
  const refusals = {};
  for (const building of GATED) {
    const want = expectedRefusal(building, 1);
    const res = await order(portL1, P1, `ladder-l1-${building}`, building);
    expect(2, res.status === 409 && res.json?.type === "command.rejected" && res.json.payload.code === want.code && res.json.payload.message === want.message,
      `${NAME[building]} at level 1: expected 409 ${want.code} "${want.message}", got ${res.status} ${res.text}`);
    refusals[building] = res;
  }
  const bogus = await order(portL1, P1, "ladder-l1-castle", "castle");
  expect(2, bogus.status === 409 && bogus.json?.payload?.code === "INVALID_COMMAND" && bogus.json.payload.message === "Unknown building type.", `unknown building: ${bogus.status} ${bogus.text}`);
  const inbox2 = Number(sqlite(dbL1, "SELECT count(*) FROM local_command_inbox;"));
  expect(2, inbox2 === GATED.length + 1, `expected ${GATED.length + 1} stored rejections, inbox holds ${inbox2}`);
  expect(2, sqlite(dbL1, "SELECT count(*) FROM local_construction_jobs;") === "0", "a refusal created a job row");
  const after2 = villageRow(dbL1, P1.villageId);
  expect(2, same(after2.resources, before2.resources), `refusals moved resources ${JSON.stringify(before2.resources)} → ${JSON.stringify(after2.resources)}`);
  const versionAfter2 = (await pullState(portL1, [P1.userId], { quiet: true })).states[String(P1.userId)].world.version;
  expect(2, versionAfter2 === version2, `refusals moved the world version ${version2} → ${versionAfter2}`);
  const replay = await request(portL1, "POST", "/api/roblox/commands", refusals.academy.body);
  expect(2, replay.status === 409 && replay.text === refusals.academy.text, `replay of the Academy refusal differs: ${replay.text}`);
  expect(2, Number(sqlite(dbL1, "SELECT count(*) FROM local_command_inbox;")) === inbox2, "replay added an inbox row");
  record(2, true, `${GATED.map((b) => `${NAME[b]} → "${refusals[b].json.payload.message}"`).join("; ")}; castle → 409 INVALID_COMMAND "Unknown building type."; inbox ${inbox2} rows, 0 jobs, resources ${JSON.stringify(after2.resources)} unchanged, world version ${version2} unchanged; Academy refusal replayed byte-identically`);

  // ------------------------------------------------------------------ 3
  step(3, "world L1 — three buildings that are not the Timber Camp: Stone Quarry (p1), Warehouse (p2), Farm (p3) — each accepted at its exact level-1 cost with its own server timer");
  const orders3 = [[P1, "quarry"], [P2, "warehouse"], [P3, "farm"]];
  const jobs3 = {};
  const baselines = {};
  const summary3 = [];
  for (const [player, building] of orders3) {
    const before = villageRow(dbL1, player.villageId);
    baselines[player.tag] = before;
    const res = await order(portL1, player, `ladder-l1-${player.tag}-${building}`, building);
    expect(3, res.status === 200 && res.json?.type === "command.accepted" && res.json.payload.constructionJob?.building === building && res.json.payload.constructionJob.targetLevel === 2, `${NAME[building]} for ${player.tag}: ${res.status} ${res.text}`);
    const job = res.json.payload.constructionJob;
    const cost = buildingCost(building, 1);
    const durationS = buildingDurationSeconds(building, 1, 1);
    expect(3, (Date.parse(job.completesAt) - Date.parse(job.startedAt)) / 1000 === durationS, `${NAME[building]} timer ${(Date.parse(job.completesAt) - Date.parse(job.startedAt)) / 1000}s != ${durationS}s`);
    const after = villageRow(dbL1, player.villageId);
    expectCostDeducted(3, `${NAME[building]} for ${player.tag}`, before.resources, after.resources, cost);
    const row = jobRows(dbL1, player.villageId).find((r) => r.id === job.id);
    expect(3, row?.status === "queued", `${NAME[building]} row status ${row?.status}`);
    jobs3[player.tag] = { ...job, cost, durationS, building };
    summary3.push(`${NAME[building]} (${player.tag}) cost ${JSON.stringify(cost)} timer ${durationS}s completesAt ${job.completesAt}`);
  }
  record(3, true, summary3.join("; "));

  // ------------------------------------------------------------------ 4
  step(4, "world L1 — prerequisites are judged on STANDING levels: p1 queues a Headquarters upgrade (parked 'waiting' behind the Quarry, unpaid, absent from the snapshot's constructionJobs), and a Rampart is still refused 'Requires Headquarters level 2.'");
  const before4 = villageRow(dbL1, P1.villageId);
  const hqOrder = await order(portL1, P1, "ladder-l1-p1-hq", "hq");
  expect(4, hqOrder.status === 200 && hqOrder.json?.type === "command.accepted" && hqOrder.json.payload.constructionJob.building === "hq" && hqOrder.json.payload.constructionJob.targetLevel === 2, `hq order: ${hqOrder.status} ${hqOrder.text}`);
  const hqJob = hqOrder.json.payload.constructionJob;
  expect(4, hqJob.completesAt === hqJob.startedAt, `a waiting order should carry the placeholder completesAt == startedAt: ${JSON.stringify(hqJob)}`);
  const rows4 = jobRows(dbL1, P1.villageId);
  expect(4, rows4.length === 2 && rows4[0].building === "quarry" && rows4[0].status === "queued" && rows4[1].building === "hq" && rows4[1].status === "waiting", `expected quarry queued + hq waiting, got ${JSON.stringify(rows4)}`);
  const after4 = villageRow(dbL1, P1.villageId);
  expect(4, same(after4.resources, before4.resources), `a waiting order charged the village: ${JSON.stringify(before4.resources)} → ${JSON.stringify(after4.resources)}`);
  const snap4 = (await pullState(portL1, [P1.userId])).states[String(P1.userId)];
  const snapJobs = snap4.constructionJobs.filter((j) => j.villageId === P1.villageId);
  log(`snapshot constructionJobs for p1: ${JSON.stringify(snapJobs.map((j) => `${j.building}→${j.targetLevel}`))} (the 'waiting' Headquarters is not listed — the snapshot query selects status = 'queued' only; recorded, not judged)`);
  expect(4, snapJobs.length === 1 && snapJobs[0].building === "quarry", `snapshot lists ${JSON.stringify(snapJobs)}`);
  expect(4, ownVillage(snap4).buildings.hq === 1, `standing hq is ${ownVillage(snap4).buildings.hq}`);
  const wallAgain = await order(portL1, P1, "ladder-l1-wall-hq-queued", "wall");
  expect(4, wallAgain.status === 409 && wallAgain.json?.payload?.code === "PREREQUISITE_MISSING" && wallAgain.json.payload.message === "Requires Headquarters level 2.", `wall with hq queued: ${wallAgain.status} ${wallAgain.text}`);
  record(4, true, `hq order accepted → target 2, row 'waiting' behind the queued Quarry, placeholder completesAt == startedAt, nothing deducted (${JSON.stringify(after4.resources)}), not in the snapshot's constructionJobs; standing hq still 1; Rampart → 409 PREREQUISITE_MISSING "${wallAgain.json.payload.message}"`);

  // ------------------------------------------------------------------ 5
  step(5, `world L1 — the queue limit: p3 stacks Farm orders behind the running one until the village holds ${BUILD_QUEUE_LIMIT}; each stacks one level higher; only the first was paid; the ${BUILD_QUEUE_LIMIT + 1}th is 409 QUEUE_FULL`);
  const before5 = villageRow(dbL1, P3.villageId);
  const stacked = [];
  for (let i = 2; i <= BUILD_QUEUE_LIMIT; i += 1) {
    const res = await order(portL1, P3, `ladder-l1-p3-farm-${String(i).padStart(2, "0")}`, "farm", { quiet: i > 2 && i < BUILD_QUEUE_LIMIT });
    expect(5, res.status === 200 && res.json?.type === "command.accepted" && res.json.payload.constructionJob.targetLevel === i + 1, `farm order #${i}: ${res.status} ${res.text}`);
    stacked.push(res.json.payload.constructionJob.targetLevel);
  }
  log(`farm orders #2–#${BUILD_QUEUE_LIMIT} accepted with targetLevel ${stacked.join(", ")} (#3–#${BUILD_QUEUE_LIMIT - 1} not printed)`);
  const full = await order(portL1, P3, `ladder-l1-p3-farm-${BUILD_QUEUE_LIMIT + 1}`, "farm");
  expect(5, full.status === 409 && full.json?.payload?.code === "QUEUE_FULL" && full.json.payload.message === `That village is already holding ${BUILD_QUEUE_LIMIT} construction orders.`, `order #${BUILD_QUEUE_LIMIT + 1}: ${full.status} ${full.text}`);
  const rows5 = jobRows(dbL1, P3.villageId);
  const statuses5 = rows5.map((r) => r.status);
  const targets5 = rows5.map((r) => r.targetLevel);
  log(`p3 job rows: ${rows5.map((r) => `${r.building}→${r.targetLevel} ${r.status}`).join(", ")}`);
  expect(5, rows5.length === BUILD_QUEUE_LIMIT && statuses5[0] === "queued" && statuses5.slice(1).every((s) => s === "waiting"), `expected 1 queued + ${BUILD_QUEUE_LIMIT - 1} waiting, got ${statuses5.join(",")}`);
  expect(5, targets5.join(",") === Array.from({ length: BUILD_QUEUE_LIMIT }, (_, i) => i + 2).join(","), `target levels ${targets5.join(",")}`);
  const after5 = villageRow(dbL1, P3.villageId);
  expect(5, same(after5.resources, before5.resources), `stacking waiting orders charged the village: ${JSON.stringify(before5.resources)} → ${JSON.stringify(after5.resources)}`);
  const secondFarmRow = rows5[1];
  record(5, true, `${BUILD_QUEUE_LIMIT - 1} more Farm orders accepted, targets 3..${BUILD_QUEUE_LIMIT + 1}; #${BUILD_QUEUE_LIMIT + 1} → 409 QUEUE_FULL "${full.json.payload.message}"; rows: 1 queued + ${BUILD_QUEUE_LIMIT - 1} waiting, targets 2..${BUILD_QUEUE_LIMIT + 1} in order; resources ${JSON.stringify(after5.resources)} unchanged since the first Farm was paid`);

  // ================================================================ the ladder (while L1's timers run)
  await rung(6, 2, 1, basePort + 1);
  await rung(7, 3, 2, basePort + 2);
  await rung(8, 5, 3, basePort + 3);
  await rung(9, 8, 5, basePort + 4);

  // ------------------------------------------------------------------ 10
  step(10, "world L10 — KINGSAGE_DEV_SEED_LEVEL=10: the Academy's prerequisite (Headquarters 10) is met for the first time, but the same knob has held the Academy at its cap of 3 since L3, so the order is INVALID_COMMAND 'already at its maximum level' — the Academy's acceptance path cannot be shown with this knob and is NOT claimed; the Smithy (cap 10) is maxed the same way; Rampart still accepted (unpaid)");
  {
    const level = 10;
    const port = basePort + 5;
    const dbPath = join(scratch, `ladder-l${level}.sqlite`);
    startServer(port, dbPath, { seedLevel: level });
    const h = await waitForHealth(port);
    log(`GET /api/health -> ${h.status} ${h.text}`);
    const pa = { userId: 950101, name: "Ladder 10 A", tag: "a" };
    const sa = await link(port, pa);
    const seeded = ownVillage(sa).buildings;
    log(`seeded levels: ${JSON.stringify(seeded)}`);
    expect(10, seeded.hq === 10 && seeded.academy === 3 && seeded.smithy === 10 && seeded.wall === 10, `unexpected seeded levels ${JSON.stringify(seeded)}`);
    const academy = await order(port, pa, "ladder-l10-academy", "academy");
    expect(10, academy.status === 409 && academy.json?.payload?.code === "INVALID_COMMAND" && academy.json.payload.message === "Academy is already at its maximum level.", `academy at L10: ${academy.status} ${academy.text}`);
    const smithy = await order(port, pa, "ladder-l10-smithy", "smithy");
    expect(10, smithy.status === 409 && smithy.json?.payload?.code === "INVALID_COMMAND" && smithy.json.payload.message === "Smithy is already at its maximum level.", `smithy at L10: ${smithy.status} ${smithy.text}`);
    const before = villageRow(dbPath, pa.villageId);
    const wall = await order(port, pa, "ladder-l10-wall", "wall");
    expect(10, wall.status === 200 && wall.json?.payload?.constructionJob?.targetLevel === 11, `wall at L10: ${wall.status} ${wall.text}`);
    const wallCost = buildingCost("wall", 10);
    const wallRow = jobRows(dbPath, pa.villageId).find((r) => r.id === wall.json.payload.constructionJob.id);
    expect(10, wallRow?.status === "waiting" && same(villageRow(dbPath, pa.villageId).resources, before.resources), `wall at L10 costs ${JSON.stringify(wallCost)}; row ${JSON.stringify(wallRow)}`);
    await stopServer(port, "world L10 server");
    record(10, true, `hq 10, smithy 10 (cap), academy 3 (cap): Academy → 409 INVALID_COMMAND "${academy.json.payload.message}"; Smithy → 409 INVALID_COMMAND "${smithy.json.payload.message}"; Rampart 10→11 accepted but waiting unpaid (cost ${JSON.stringify(wallCost)}). The Academy's prerequisite-satisfied acceptance stays tests-only.`);
  }

  // ------------------------------------------------------------------ 11
  step(11, "world L99 — KINGSAGE_DEV_SEED_LEVEL=99: every building sits at its own cap; all 13 orders → 409 INVALID_COMMAND 'already at its maximum level'; 13 stored rejections, 0 jobs");
  {
    const port = basePort + 6;
    const dbPath = join(scratch, "ladder-l99.sqlite");
    startServer(port, dbPath, { seedLevel: 99 });
    const h = await waitForHealth(port);
    log(`GET /api/health -> ${h.status} ${h.text}`);
    const pa = { userId: 950991, name: "Ladder Max", tag: "a" };
    const sa = await link(port, pa);
    const seeded = ownVillage(sa).buildings;
    log(`seeded levels: ${JSON.stringify(seeded)}`);
    expect(11, ALL_BUILDINGS.every((b) => seeded[b] === MAX_LEVEL[b]), `maxed world levels ${JSON.stringify(seeded)} != caps ${JSON.stringify(MAX_LEVEL)}`);
    const messages = [];
    for (const [i, building] of ALL_BUILDINGS.entries()) {
      const res = await order(port, pa, `ladder-l99-${building}`, building, { quiet: i > 0 && i < ALL_BUILDINGS.length - 1 });
      expect(11, res.status === 409 && res.json?.payload?.code === "INVALID_COMMAND" && res.json.payload.message === `${NAME[building]} is already at its maximum level.`, `${NAME[building]} at cap: ${res.status} ${res.text}`);
      messages.push(res.json.payload.message);
    }
    log(`13 refusals: ${messages.join(" | ")}`);
    expect(11, sqlite(dbPath, "SELECT count(*) FROM local_command_inbox;") === "13", "expected 13 inbox rows");
    expect(11, sqlite(dbPath, "SELECT count(*) FROM local_construction_jobs;") === "0", "a maxed order created a job");
    await stopServer(port, "world L99 server");
    record(11, true, `levels ${JSON.stringify(seeded)} = every cap; 13 × 409 INVALID_COMMAND "<Name> is already at its maximum level."; inbox 13, jobs 0`);
  }

  // ------------------------------------------------------------------ 12
  step(12, "world L1 — three non-timber completions on the real clock: Quarry 1→2 (stone 28→33/h) and the waiting Headquarters starts at exactly that instant, paid; Warehouse 1→2 (storage 1464→1786); Farm 1→2 (population cap 232→269) and Farm 2→3 starts at exactly that instant at the level-2 cost; notifications stamped at completesAt; p2's resources reconcile to the formula");
  if (skipCompletionWait) {
    results.push({ step: 12, ok: null, detail: "SKIPPED (LADDER_SKIP_COMPLETION_WAIT=1) — not claimed" });
    log("[step 12] SKIPPED — LADDER_SKIP_COMPLETION_WAIT=1");
    return;
  }
  const summary12 = [];
  // whole + carry must equal baseline + production × hours − everything paid.
  // `rates` gives each resource's per-hour rate before and after `switchAt`
  // (a completed Quarry changes the stone rate at exactly its completesAt).
  // The read is one SELECT, but drainConstructionQueues() accrues a village
  // with waiting orders in two UPDATEs outside a transaction every 500 ms, so
  // a read landing between them is re-taken (and said so) before judging.
  async function reconcile(player, baseline, paid, { switchAt, rates }) {
    let now; let report; let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt += 1) {
      if (attempt > 1) { log(`(re-reading ${player.tag}'s row: the previous read straddled an accrual write)`); await sleep(300); }
      now = villageRow(dbL1, player.villageId);
      const t0 = Date.parse(baseline.lastMaterializedAt);
      const tn = Date.parse(now.lastMaterializedAt);
      const ts = switchAt ? Date.parse(switchAt) : tn;
      report = {};
      ok = true;
      for (const kind of ["wood", "stone", "iron"]) {
        const [before, after] = rates[kind];
        const produced = (before * Math.max(0, Math.min(ts, tn) - t0) + after * Math.max(0, tn - ts)) / 3_600_000;
        const expected = baseline.resources[kind] + baseline.carry[kind] + produced - paid.reduce((sum, cost) => sum + cost[kind], 0);
        const actual = now.resources[kind] + now.carry[kind];
        report[kind] = { whole: now.resources[kind], carry: Number(now.carry[kind].toFixed(6)), expectedTotal: Number(expected.toFixed(6)), actualTotal: Number(actual.toFixed(6)) };
        if (Math.abs(expected - actual) >= 1e-6) ok = false;
      }
    }
    const hours = (Date.parse(now.lastMaterializedAt) - Date.parse(baseline.lastMaterializedAt)) / 3_600_000;
    log(`${player.tag} reconciliation over ${hours.toFixed(6)} h, paid ${JSON.stringify(paid)}${switchAt ? `, stone ${rates.stone[0]}/h until ${switchAt} then ${rates.stone[1]}/h` : ` at ${rates.wood[0]}/h`}: ${JSON.stringify(report)}`);
    expect(12, ok, `${player.tag}: whole + carry does not reconcile: ${JSON.stringify(report)}`);
  }
  async function awaitCompletion(player, job, predicate) {
    const waitMs = Date.parse(job.completesAt) - Date.now();
    log(`waiting ${Math.max(0, Math.round(waitMs / 1000))}s for ${NAME[job.building]} (${player.tag}) to come due at ${job.completesAt} (server running the whole time)`);
    if (waitMs > 0) await sleep(waitMs);
    const deadline = Date.parse(job.completesAt) + 10_000;
    while (Date.now() < deadline) {
      const s = (await pullState(portL1, [player.userId], { quiet: true })).states[String(player.userId)];
      if (predicate(s)) return { state: s, observedAt: new Date().toISOString() };
      await sleep(500);
    }
    fail(12, `${NAME[job.building]} for ${player.tag} did not complete within 10s of ${job.completesAt}`);
  }
  // Quarry (p1) - and the chained Headquarters start.
  const q = jobs3.p1;
  const qDone = await awaitCompletion(P1, q, (s) => ownVillage(s).buildings.quarry === 2);
  const qVillage = ownVillage(qDone.state);
  const qEcon = qDone.state.villageEconomy.find((e) => e.villageId === P1.villageId);
  const qNote = qDone.state.notifications.find((n) => n.kind === "construction" && n.message === "Stone Quarry reached level 2.");
  log(`p1 after quarry (observed ${qDone.observedAt}): buildings ${JSON.stringify(qVillage.buildings)}, production ${JSON.stringify(qEcon.productionPerHour)}, notification ${JSON.stringify(qNote)}`);
  expect(12, qNote && qNote.createdAt === q.completesAt, `quarry notification ${JSON.stringify(qNote)} not stamped at ${q.completesAt}`);
  expect(12, qEcon.productionPerHour.stone === productionPerHour(2) && qEcon.productionPerHour.wood === productionPerHour(1), `production after quarry ${JSON.stringify(qEcon.productionPerHour)}`);
  const rows12a = jobRows(dbL1, P1.villageId);
  const hqRow = rows12a.find((r) => r.building === "hq");
  const hqCost = buildingCost("hq", 1);
  const hqDurationS = buildingDurationSeconds("hq", 1, 1);
  expect(12, rows12a.find((r) => r.building === "quarry")?.status === "complete", `quarry row ${JSON.stringify(rows12a)}`);
  expect(12, hqRow?.status === "queued" && hqRow.startedAt === q.completesAt && (Date.parse(hqRow.completesAt) - Date.parse(hqRow.startedAt)) / 1000 === hqDurationS, `chained hq should start at ${q.completesAt} for ${hqDurationS}s: ${JSON.stringify(hqRow)}`);
  const hqInSnapshot = qDone.state.constructionJobs.find((j) => j.id === hqRow.id);
  expect(12, hqInSnapshot && hqInSnapshot.startedAt === q.completesAt, `chained hq missing from the snapshot now that it is queued: ${JSON.stringify(qDone.state.constructionJobs)}`);
  // p1 paid the Quarry at order time and the Headquarters at the chain start;
  // stone ran at 28/h until the Quarry's completesAt and 33/h after it.
  const r1 = productionPerHour(1);
  await reconcile(P1, baselines.p1, [q.cost, hqCost], { switchAt: q.completesAt, rates: { wood: [r1, r1], stone: [r1, productionPerHour(2)], iron: [r1, r1] } });
  summary12.push(`Quarry 1→2 observed ${qDone.observedAt} (completesAt ${q.completesAt}); stone ${productionPerHour(1)}→${qEcon.productionPerHour.stone}/h; notification "${qNote.message}" at completesAt; Headquarters 1→2 started at exactly ${hqRow.startedAt} for ${hqDurationS}s, cost ${JSON.stringify(hqCost)} paid; p1 resources reconcile to <1e-6`);

  // Warehouse (p2).
  const w = jobs3.p2;
  const wDone = await awaitCompletion(P2, w, (s) => ownVillage(s).buildings.warehouse === 2);
  const wEcon = wDone.state.villageEconomy.find((e) => e.villageId === P2.villageId);
  const wNote = wDone.state.notifications.find((n) => n.kind === "construction" && n.message === "Warehouse reached level 2.");
  log(`p2 after warehouse (observed ${wDone.observedAt}): buildings ${JSON.stringify(ownVillage(wDone.state).buildings)}, storage ${wEcon.storageCapacity}, notification ${JSON.stringify(wNote)}`);
  expect(12, wNote && wNote.createdAt === w.completesAt, `warehouse notification ${JSON.stringify(wNote)} not stamped at ${w.completesAt}`);
  expect(12, wEcon.storageCapacity === storageCapacity(2) && storageCapacity(2) === 1786 && wEcon.productionPerHour.wood === productionPerHour(1), `storage after warehouse ${wEcon.storageCapacity}`);
  expect(12, jobRows(dbL1, P2.villageId).every((r) => r.status === "complete"), "warehouse row not complete");
  // p2 paid once and its rates never changed.
  await reconcile(P2, baselines.p2, [w.cost], { rates: { wood: [r1, r1], stone: [r1, r1], iron: [r1, r1] } });
  summary12.push(`Warehouse 1→2 observed ${wDone.observedAt} (completesAt ${w.completesAt}); storage ${storageCapacity(1)}→${wEcon.storageCapacity}; notification at completesAt; p2 resources reconcile to <1e-6`);

  // Farm (p3) - and the chained second Farm at the level-2 cost.
  const f = jobs3.p3;
  const fDone = await awaitCompletion(P3, f, (s) => ownVillage(s).buildings.farm === 2);
  const fEcon = fDone.state.villageEconomy.find((e) => e.villageId === P3.villageId);
  const fNote = fDone.state.notifications.find((n) => n.kind === "construction" && n.message === "Farm reached level 2.");
  log(`p3 after farm (observed ${fDone.observedAt}): buildings ${JSON.stringify(ownVillage(fDone.state).buildings)}, population cap ${fEcon.populationCapacity}, notification ${JSON.stringify(fNote)}`);
  expect(12, fNote && fNote.createdAt === f.completesAt, `farm notification ${JSON.stringify(fNote)} not stamped at ${f.completesAt}`);
  expect(12, fEcon.populationCapacity === populationCapacity(2) && populationCapacity(2) === 269, `population cap after farm ${fEcon.populationCapacity}`);
  const rows12c = jobRows(dbL1, P3.villageId);
  const farm2 = rows12c.find((r) => r.id === secondFarmRow.id);
  const farm2Cost = buildingCost("farm", 2);
  const farm2DurationS = buildingDurationSeconds("farm", 2, 1);
  log(`p3 job rows: ${rows12c.map((r) => `${r.building}→${r.targetLevel} ${r.status}${r.status === "queued" ? ` ${r.startedAt}→${r.completesAt}` : ""}`).join(", ")}`);
  expect(12, rows12c[0].status === "complete" && farm2?.status === "queued" && farm2.targetLevel === 3 && farm2.startedAt === f.completesAt && (Date.parse(farm2.completesAt) - Date.parse(farm2.startedAt)) / 1000 === farm2DurationS, `chained Farm 2→3 should start at ${f.completesAt} for ${farm2DurationS}s: ${JSON.stringify(farm2)}`);
  expect(12, rows12c.filter((r) => r.status === "waiting").length === BUILD_QUEUE_LIMIT - 2, `expected ${BUILD_QUEUE_LIMIT - 2} still waiting`);
  // p3 paid the first Farm at order time and the second at the chain start.
  await reconcile(P3, baselines.p3, [f.cost, farm2Cost], { rates: { wood: [r1, r1], stone: [r1, r1], iron: [r1, r1] } });
  summary12.push(`Farm 1→2 observed ${fDone.observedAt} (completesAt ${f.completesAt}); population cap ${populationCapacity(1)}→${fEcon.populationCapacity}; notification at completesAt; Farm 2→3 started at exactly ${farm2.startedAt} for ${farm2DurationS}s at the level-2 cost ${JSON.stringify(farm2Cost)}; ${BUILD_QUEUE_LIMIT - 2} orders still waiting; p3 resources reconcile to <1e-6`);
  record(12, true, summary12.join(" || "));
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  log("");
  log(`LADDER DRILL FAILED: ${error.message}`);
} finally {
  for (const port of [...servers.keys()]) await stopServer(port, `world server on ${port}`);
  log("");
  log("## Result");
  for (const r of results) log(`- step ${r.step}: ${r.ok === null ? "SKIPPED" : r.ok ? "PASS" : "FAIL"}`);
  const passed = results.filter((r) => r.ok === true).length;
  const failed = results.filter((r) => r.ok === false).length;
  const skipped = results.filter((r) => r.ok === null).length;
  const verdict = exitCode === 0 && failed === 0 && passed + skipped === TOTAL_STEPS ? "PASS" : "FAIL";
  log(`C2 building ladder drill ${verdict} (${passed}/${TOTAL_STEPS} steps PASS${skipped ? `, ${skipped} SKIPPED` : ""})`);
  if (verdict === "PASS") {
    rmSync(scratch, { recursive: true, force: true });
    log(`scratch dir removed: ${scratch}`);
  } else {
    log(`scratch dir kept for inspection: ${scratch}`);
  }
  process.exit(verdict === "PASS" ? 0 : 1);
}
