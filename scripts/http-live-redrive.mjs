#!/usr/bin/env node
// HTTP-only live re-drive of the 2026-08-29 audit's scratch-DB exercise
// (docs/audits/kingsage-functionality-audit.md §2 "Live exercise"), run against
// the CURRENT tip so matrix rows A1, A2 (server half), B1, B7, C1 and C2 in
// docs/verification/2026-09-17-full-game-acceptance-matrix.md can carry
// current-tip live evidence instead of a historical label.
//
// Same posture as scripts/b10a-local-restore-drill.mjs: a throwaway world in a
// fresh mkdtemp directory, a throwaway key, a non-4178 port, inherited
// KINGSAGE_* env stripped so no AI tick or dev seed can move the world. Needs
// only Node 22 + the sqlite3 CLI. No Studio, no PC, no hosting.
//
//   node scripts/http-live-redrive.mjs                       # exit 0 = every step PASS (~14 min: real timers)
//   REDRIVE_SKIP_CONSTRUCTION_WAIT=1 node scripts/http-live-redrive.mjs   # skip the 12-minute timber wait (steps 13-14 report SKIPPED, exit 0)
//   REDRIVE_PORT=4221 node scripts/http-live-redrive.mjs
//
// Every request, response and shell command is printed so the output can be
// pasted into a dated docs/verification/ note verbatim.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The expected numbers come straight from packages/game-core (TypeScript), so
// this script needs the same flag the server runs under. Re-exec once if the
// caller forgot it, so `node scripts/http-live-redrive.mjs` just works.
if (!process.execArgv.includes("--experimental-strip-types")) {
  const rerun = spawnSync(process.execPath, ["--experimental-strip-types", ...process.argv.slice(1)], { stdio: "inherit" });
  process.exit(rerun.status ?? 1);
}

const {
  buildingCost,
  buildingDurationSeconds,
  populationCapacity,
  productionPerHour,
  storageCapacity,
  troopCost,
  troopTrainingDurationSeconds,
} = await import("../packages/game-core/src/economy.ts");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = join(repoRoot, "server");
const port = Number(process.env.REDRIVE_PORT ?? 4221);
const skipConstructionWait = process.env.REDRIVE_SKIP_CONSTRUCTION_WAIT === "1";
// Throwaway key for a throwaway world. Not a secret; never reused anywhere.
const robloxKey = "redrive-throwaway-key-0001";
const P1 = 920001;
const P2 = 920002;

const scratch = mkdtempSync(join(tmpdir(), "kingsmarch-redrive-"));
const dbPath = join(scratch, "world.sqlite");
const results = [];
let server = null;
let twin = null;

const log = (line = "") => process.stdout.write(`${line}\n`);
const step = (n, title) => { log(""); log(`## Step ${n} — ${title}`); };
function record(n, ok, detail) { results.push({ step: n, ok, detail }); log(`[step ${n}] ${ok ? "PASS" : "FAIL"} — ${detail}`); }
function fail(n, detail) { record(n, false, detail); throw new Error(`step ${n} failed: ${detail}`); }
function expect(n, condition, detail) { if (!condition) fail(n, detail); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sqlite(sql) {
  const run = spawnSync("sqlite3", [dbPath, sql], { encoding: "utf8" });
  log(`$ sqlite3 <db> ${JSON.stringify(sql)}`);
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
  if (out) log(out.split("\n").map((l) => `  ${l}`).join("\n"));
  log(`  -> exit ${run.status}`);
  return (run.stdout ?? "").trim();
}

async function request(method, path, body, { key = robloxKey, base = `http://127.0.0.1:${port}`, quiet = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (key !== null) headers["x-kingsage-key"] = key;
  let response;
  try {
    response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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

function shorten(text, max = 400) {
  return text.length > max ? `${text.slice(0, max)}… (${text.length} bytes)` : text;
}

async function pullState(ids, opts) {
  const result = await request("POST", "/api/roblox/state", { robloxUserIds: ids }, { quiet: true, ...opts });
  if (result.status !== 200) throw new Error(`/api/roblox/state -> ${result.status} ${result.text}`);
  log(`POST /api/roblox/state {"robloxUserIds":${JSON.stringify(ids)}} -> 200 (${result.text.length} bytes; states: ${Object.keys(result.json.states).join(",") || "none"})`);
  return result.json;
}

function ownVillage(state) {
  const village = state.world.villages.find((v) => v.kingdomId === state.kingdom.id);
  if (!village) throw new Error("no village belongs to the player's kingdom");
  return village;
}

function digest(state) {
  const village = ownVillage(state);
  return {
    worldVersion: state.world.version,
    playerId: state.player.id,
    kingdomId: state.kingdom.id,
    villageId: village.id,
    resources: village.resources,
    timber: village.buildings.timber,
    militia: village.army.militia,
    constructionJobs: state.constructionJobs.map((j) => ({ id: j.id, building: j.building, targetLevel: j.targetLevel, completesAt: j.completesAt })),
    recruitmentJobs: state.recruitmentJobs.map((j) => ({ id: j.id, troop: j.troop, quantity: j.quantity, completesAt: j.completesAt })),
    notifications: state.notifications.map((n) => `${n.kind}@${n.createdAt}: ${n.message}`),
  };
}

function startServer(database, listenPort) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith("KINGSAGE_")) env[key] = value;
  Object.assign(env, { KINGSAGE_DATABASE_PATH: database, KINGSAGE_ROBLOX_KEY: robloxKey, KINGSAGE_BIND: "127.0.0.1", PORT: String(listenPort) });
  log(`$ (cd server && KINGSAGE_DATABASE_PATH=${database} KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_BIND=127.0.0.1 PORT=${listenPort} node --experimental-strip-types src/index.ts &)`);
  const child = spawn(process.execPath, ["--experimental-strip-types", "src/index.ts"], { cwd: serverRoot, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => log(`  [server:${listenPort}] ${String(chunk).trimEnd()}`));
  child.stderr.on("data", (chunk) => { const text = String(chunk).trimEnd(); if (!text.includes("ExperimentalWarning") && !text.includes("--trace-warnings")) log(`  [server:${listenPort}:err] ${text}`); });
  child.exited = new Promise((done) => child.once("exit", (code, signal) => done({ code, signal })));
  return child;
}

async function waitForHealth(base, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const probe = await request("GET", "/api/health", undefined, { key: null, base, quiet: true });
    if (probe.status === 200) return probe;
    await sleep(200);
  }
  throw new Error(`no /api/health 200 from ${base} within ${timeoutMs}ms`);
}

async function stopServer(child, label) {
  if (!child || child.exitCode !== null) return { code: child?.exitCode ?? null, signal: null };
  log(`$ kill -TERM <${label} pid ${child.pid}>`);
  child.kill("SIGTERM");
  const outcome = await Promise.race([child.exited, sleep(10_000).then(() => ({ code: null, signal: "TIMEOUT" }))]);
  if (outcome.signal === "TIMEOUT") { child.kill("SIGKILL"); await child.exited; }
  log(`  -> ${label} exited (code ${outcome.code}, signal ${outcome.signal}) at ${new Date().toISOString()}`);
  return outcome;
}

// One statement, so whole resources and the fractional carry come from the
// same instant — a materialize tick between two reads would skew the check.
function economyRow(villageId) {
  const raw = sqlite(`SELECT e.last_materialized_at || '|' || e.resource_carry_json || '|' || v.resources_json FROM local_village_economy e JOIN local_villages v ON v.id = e.village_id WHERE e.village_id = '${villageId}';`);
  const [lastMaterializedAt, carryJson, resourcesJson] = raw.split("|");
  return { lastMaterializedAt, carry: JSON.parse(carryJson), resources: JSON.parse(resourcesJson) };
}

// C1 invariant: whole resources + fractional carry must equal the baseline plus
// production × elapsed hours minus what was spent, for every resource kind.
// This is exactly what accrueVillage() promises, checked from outside.
function accrualCheck(n, label, baseline, now, spent, production) {
  const hours = (Date.parse(now.economy.lastMaterializedAt) - Date.parse(baseline.economy.lastMaterializedAt)) / 3_600_000;
  const report = {};
  for (const kind of ["wood", "stone", "iron"]) {
    const expected = baseline.resources[kind] + baseline.economy.carry[kind] + production[kind] * hours - spent[kind];
    const actual = now.resources[kind] + now.economy.carry[kind];
    report[kind] = { whole: now.resources[kind], carry: Number(now.economy.carry[kind].toFixed(6)), expectedTotal: Number(expected.toFixed(6)), actualTotal: Number(actual.toFixed(6)) };
    expect(n, Math.abs(expected - actual) < 1e-6, `${label}: ${kind} accrual off — expected total ${expected}, actual ${actual}`);
  }
  log(`accrual ${label}: ${hours.toFixed(6)} h elapsed at ${JSON.stringify(production)}/h; ${JSON.stringify(report)}`);
  return hours;
}

async function main() {
  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
  const base = `http://127.0.0.1:${port}`;
  log(`# HTTP-only live re-drive (audit §2 exercise, current tip)`);
  log(`date: ${new Date().toISOString()}`);
  log(`sha: ${sha}`);
  log(`node: ${process.version}`);
  log(`sqlite3: ${spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).stdout.trim()}`);
  log(`scratch: ${scratch}`);
  log(`db: ${dbPath}`);
  log(`port: ${port}`);
  if (skipConstructionWait) log(`mode: REDRIVE_SKIP_CONSTRUCTION_WAIT=1 — step 13 will be SKIPPED, not claimed`);

  // ------------------------------------------------------------------ 1
  step(1, "health check, then the key wall (bad key and missing key both 401)");
  expect(1, !existsSync(dbPath), `scratch DB already exists at ${dbPath}`);
  server = startServer(dbPath, port);
  const h = await waitForHealth(base);
  log(`GET /api/health -> ${h.status} ${h.text}`);
  expect(1, h.json?.ok === true && h.json?.service === "kingsage-world" && h.json?.contractVersion === 1, `unexpected health body ${h.text}`);
  const badKey = await request("POST", "/api/roblox/session", { robloxUserId: P1, displayName: "Intruder" }, { key: "wrong-key" });
  expect(1, badKey.status === 401 && badKey.json?.error?.code === "BAD_KEY", `bad key should be 401 BAD_KEY, got ${badKey.status} ${badKey.text}`);
  const noKey = await request("POST", "/api/roblox/state", { robloxUserIds: [P1] }, { key: null });
  expect(1, noKey.status === 401 && noKey.json?.error?.code === "BAD_KEY", `missing key should be 401 BAD_KEY, got ${noKey.status} ${noKey.text}`);
  expect(1, sqlite("SELECT count(*) FROM roblox_players;") === "0", "a rejected request must not have linked anyone");
  record(1, true, `health 200 ${h.text}; wrong key 401 BAD_KEY; missing key 401 BAD_KEY; no link rows created by the refused calls`);

  // ------------------------------------------------------------------ 2  (A1)
  step(2, "A1 — /api/roblox/session: new player linked + seat claimed; same UserId again is an idempotent rejoin; a second UserId gets a different seat");
  const link1 = await request("POST", "/api/roblox/session", { robloxUserId: P1, displayName: "Redrive One" });
  expect(2, link1.status === 200 && link1.json.created === true && link1.json.contractVersion === 1, `first link: ${link1.status} ${link1.text}`);
  const relink1 = await request("POST", "/api/roblox/session", { robloxUserId: P1, displayName: "Redrive One (rejoin)" });
  expect(2, relink1.status === 200 && relink1.json.created === false, `rejoin should be created:false, got ${relink1.text}`);
  expect(2, relink1.json.playerId === link1.json.playerId && relink1.json.kingdomId === link1.json.kingdomId, `rejoin returned a different identity: ${link1.text} vs ${relink1.text}`);
  const link2 = await request("POST", "/api/roblox/session", { robloxUserId: P2, displayName: "Redrive Two" });
  expect(2, link2.status === 200 && link2.json.created === true, `second player link: ${link2.status} ${link2.text}`);
  expect(2, link2.json.playerId !== link1.json.playerId && link2.json.kingdomId !== link1.json.kingdomId, `second player shares identity with the first: ${link2.text}`);
  const links = sqlite("SELECT roblox_user_id || '->' || player_id FROM roblox_players ORDER BY roblox_user_id;");
  expect(2, links.split("\n").length === 2, `expected exactly 2 link rows, got ${JSON.stringify(links)}`);
  record(2, true, `P1 created:true (${link1.json.playerId} / ${link1.json.kingdomId}); P1 again created:false, same ids; P2 created:true, different player + kingdom; 2 link rows`);

  // ------------------------------------------------------------------ 3  (B1)
  step(3, "B1 — /api/roblox/state snapshot: 50×50 seeded world, 10 settlements, and a second fresh DB seeds the identical world");
  const pull0 = await pullState([P1, P2]);
  const s1 = pull0.states[String(P1)];
  const s2 = pull0.states[String(P2)];
  expect(3, s1 && s2, "state pull did not return both linked players");
  expect(3, s1.world.width === 50 && s1.world.height === 50, `world is ${s1.world.width}×${s1.world.height}`);
  expect(3, s1.world.villages.length === 10 && s1.world.kingdoms.length === 10, `expected 10 villages + 10 kingdoms, got ${s1.world.villages.length}/${s1.world.kingdoms.length}`);
  const seatKinds = s1.world.kingdoms.reduce((acc, k) => ({ ...acc, [k.seatKind]: (acc[k.seatKind] ?? 0) + 1 }), {});
  const v1 = ownVillage(s1);
  const v2 = ownVillage(s2);
  expect(3, v1.id !== v2.id, "both players own the same village");
  // Names are excluded: claiming an open seat renames it after the player.
  const layout = (state) => state.world.villages.map((v) => `${v.id}@${v.x},${v.y}`).sort().join(" | ");
  const worldId = s1.world.id;
  // Determinism: a second, unrelated fresh DB must seed the same map.
  const twinDb = join(scratch, "twin.sqlite");
  const twinPort = port + 1;
  const twinBase = `http://127.0.0.1:${twinPort}`;
  twin = startServer(twinDb, twinPort);
  await waitForHealth(twinBase);
  const twinLink = await request("POST", "/api/roblox/session", { robloxUserId: P1, displayName: "Twin" }, { base: twinBase });
  expect(3, twinLink.status === 200, `twin link failed ${twinLink.text}`);
  const twinState = (await pullState([P1], { base: twinBase })).states[String(P1)];
  const sameLayout = layout(twinState) === layout(s1);
  const sameWorldId = twinState.world.id === worldId && twinState.world.seed === s1.world.seed;
  await stopServer(twin, "twin server");
  twin = null;
  expect(3, sameLayout && sameWorldId, `twin world differs: ${twinState.world.id}/${twinState.world.seed} [${layout(twinState)}] vs ${worldId}/${s1.world.seed} [${layout(s1)}]`);
  log(`world: id=${worldId} seed=${s1.world.seed} version=${s1.world.version} seats=${JSON.stringify(seatKinds)}`);
  log(`settlements: ${s1.world.villages.map((v) => `${v.id}@${v.x},${v.y} "${v.name}"`).join(" | ")}`);
  record(3, true, `world ${worldId} seed ${s1.world.seed}: 50×50, 10 villages/10 kingdoms (${JSON.stringify(seatKinds)}); P1 village ${v1.id} (${v1.x},${v1.y}), P2 village ${v2.id}; a second fresh DB on port ${twinPort} seeded the identical id/seed/settlement layout`);

  // ------------------------------------------------------------------ 4  (C1)
  step(4, "C1 — villageEconomy matches the shared economy formulas at the village's levels; record the accrual baseline");
  const econ1 = s1.villageEconomy.find((e) => e.villageId === v1.id);
  expect(4, econ1, "no villageEconomy entry for the player's village");
  const expectedEcon = {
    productionPerHour: { wood: productionPerHour(v1.buildings.timber), stone: productionPerHour(v1.buildings.quarry), iron: productionPerHour(v1.buildings.iron) },
    storageCapacity: storageCapacity(v1.buildings.warehouse),
    populationCapacity: populationCapacity(v1.buildings.farm),
  };
  log(`buildings: ${JSON.stringify(v1.buildings)}`);
  log(`villageEconomy (server): ${JSON.stringify(econ1)}`);
  log(`villageEconomy (formula): ${JSON.stringify(expectedEcon)}`);
  expect(4, JSON.stringify(econ1.productionPerHour) === JSON.stringify(expectedEcon.productionPerHour), "productionPerHour differs from 28×1.17^(L−1)");
  expect(4, econ1.storageCapacity === expectedEcon.storageCapacity && econ1.populationCapacity === expectedEcon.populationCapacity, "storage/population capacity differs from formula");
  const baselineRow = economyRow(v1.id);
  const baseline = { resources: baselineRow.resources, economy: baselineRow };
  log(`baseline: resources ${JSON.stringify(baseline.resources)}, carry ${JSON.stringify(baseline.economy.carry)}, last_materialized_at ${baseline.economy.lastMaterializedAt}`);
  record(4, true, `production ${JSON.stringify(econ1.productionPerHour)}/h, storage ${econ1.storageCapacity}, population ${econ1.populationUsed}/${econ1.populationCapacity} — all equal to the game-core formulas at levels ${JSON.stringify(v1.buildings)}; baseline recorded`);

  // ------------------------------------------------------------------ 5  (C2)
  step(5, "C2 — village.build.queue timber: accepted, exact cost deducted, server timer = buildingDurationSeconds");
  const buildCmd = { robloxUserId: P1, commandId: "redrive-build-timber-1", expectedWorldVersion: s1.world.version, command: { type: "village.build.queue", payload: { villageId: v1.id, building: "timber" } } };
  const build = await request("POST", "/api/roblox/commands", buildCmd);
  expect(5, build.status === 200 && build.json.type === "command.accepted", `build not accepted: ${build.status} ${build.text}`);
  const afterBuild = digest((await pullState([P1])).states[String(P1)]);
  const cost = buildingCost("timber", v1.buildings.timber);
  const durationMs = buildingDurationSeconds("timber", v1.buildings.timber, v1.buildings.hq) * 1000;
  log(`state after build: ${JSON.stringify(afterBuild)}`);
  expect(5, afterBuild.constructionJobs.length === 1 && afterBuild.constructionJobs[0].building === "timber" && afterBuild.constructionJobs[0].targetLevel === v1.buildings.timber + 1, `expected one timber job to level ${v1.buildings.timber + 1}`);
  const job = (await pullState([P1])).states[String(P1)].constructionJobs[0];
  expect(5, Date.parse(job.completesAt) - Date.parse(job.startedAt) === durationMs, `job timer ${Date.parse(job.completesAt) - Date.parse(job.startedAt)}ms != ${durationMs}ms`);
  for (const kind of ["wood", "stone", "iron"]) {
    // Production may have landed a whole unit or two between the two pulls.
    const delta = afterBuild.resources[kind] - v1.resources[kind];
    expect(5, delta >= -cost[kind] && delta <= -cost[kind] + 2, `${kind} moved ${delta}, cost is ${cost[kind]}`);
  }
  expect(5, afterBuild.worldVersion === s1.world.version + 1, `world version ${s1.world.version} -> ${afterBuild.worldVersion}, expected +1`);
  const spent = { ...cost };
  record(5, true, `${buildCmd.commandId} → command.accepted, worldVersion ${afterBuild.worldVersion}; cost ${JSON.stringify(cost)} deducted; job ${job.id} timer ${durationMs / 1000}s (startedAt ${job.startedAt} → completesAt ${job.completesAt})`);

  // ------------------------------------------------------------------ 6  (idempotency)
  step(6, "exact replay of the same commandId returns the stored result — same job id, no duplicate, world version unchanged");
  const replay = await request("POST", "/api/roblox/commands", buildCmd);
  expect(6, replay.status === 200 && replay.text === build.text, `replay differs: ${replay.status} ${replay.text} vs original ${build.text}`);
  const afterReplay = digest((await pullState([P1])).states[String(P1)]);
  expect(6, afterReplay.worldVersion === afterBuild.worldVersion, `replay moved the world version ${afterBuild.worldVersion} -> ${afterReplay.worldVersion}`);
  expect(6, afterReplay.constructionJobs.length === 1 && afterReplay.constructionJobs[0].id === job.id, `replay changed the job list: ${JSON.stringify(afterReplay.constructionJobs)}`);
  expect(6, sqlite("SELECT count(*) FROM local_construction_jobs;") === "1", "replay inserted a second construction row");
  expect(6, sqlite("SELECT count(*) FROM local_command_inbox;") === "1", "replay inserted a second inbox row");
  record(6, true, `replay byte-identical to the original response; still 1 job (${job.id}), 1 inbox row, world version ${afterReplay.worldVersion}`);

  // ------------------------------------------------------------------ 7  (stale version)
  step(7, "stale expectedWorldVersion → WORLD_VERSION_CONFLICT");
  const stale = await request("POST", "/api/roblox/commands", { ...buildCmd, commandId: "redrive-stale-version", expectedWorldVersion: s1.world.version });
  expect(7, stale.status === 409 && stale.json.type === "command.rejected" && stale.json.payload.code === "WORLD_VERSION_CONFLICT", `expected 409 WORLD_VERSION_CONFLICT, got ${stale.status} ${stale.text}`);
  expect(7, stale.json.payload.currentWorldVersion === afterReplay.worldVersion, `conflict reported currentWorldVersion ${stale.json.payload.currentWorldVersion}`);
  record(7, true, `409 command.rejected WORLD_VERSION_CONFLICT, currentWorldVersion ${stale.json.payload.currentWorldVersion} reported back`);

  // ------------------------------------------------------------------ 8  (ownership)
  step(8, "second player's build into player 1's village → FORBIDDEN; second player replaying player 1's commandId → FORBIDDEN");
  const cross = await request("POST", "/api/roblox/commands", { robloxUserId: P2, commandId: "redrive-cross-owner", expectedWorldVersion: afterReplay.worldVersion, command: { type: "village.build.queue", payload: { villageId: v1.id, building: "timber" } } });
  expect(8, cross.status === 409 && cross.json.payload.code === "FORBIDDEN", `expected 409 FORBIDDEN, got ${cross.status} ${cross.text}`);
  const steal = await request("POST", "/api/roblox/commands", { ...buildCmd, robloxUserId: P2 });
  expect(8, steal.status === 409 && steal.json.payload.code === "FORBIDDEN", `replaying another player's commandId should be FORBIDDEN, got ${steal.status} ${steal.text}`);
  expect(8, sqlite("SELECT count(*) FROM local_construction_jobs;") === "1", "a forbidden command created a construction row");
  record(8, true, `cross-owner build 409 FORBIDDEN ("${cross.json.payload.message}"); foreign replay 409 FORBIDDEN ("${steal.json.payload.message}"); still 1 job row`);

  // ------------------------------------------------------------------ 9  (recruit)
  step(9, "village.recruit.queue 1 militia (45s at Barracks 1): accepted, cost deducted, timer = troopTrainingDurationSeconds");
  const preRecruit = (await pullState([P1])).states[String(P1)];
  const recruitCmd = { robloxUserId: P1, commandId: "redrive-recruit-militia-1", expectedWorldVersion: preRecruit.world.version, command: { type: "village.recruit.queue", payload: { villageId: v1.id, troop: "militia", quantity: 1 } } };
  const recruit = await request("POST", "/api/roblox/commands", recruitCmd);
  expect(9, recruit.status === 200 && recruit.json.type === "command.accepted", `recruit not accepted: ${recruit.status} ${recruit.text}`);
  const afterRecruitState = (await pullState([P1])).states[String(P1)];
  const afterRecruit = digest(afterRecruitState);
  log(`state after recruit: ${JSON.stringify(afterRecruit)}`);
  expect(9, afterRecruit.recruitmentJobs.length === 1 && afterRecruit.recruitmentJobs[0].troop === "militia" && afterRecruit.recruitmentJobs[0].quantity === 1, `expected one militia×1 job, got ${JSON.stringify(afterRecruit.recruitmentJobs)}`);
  const rjob = afterRecruitState.recruitmentJobs[0];
  const recruitMs = troopTrainingDurationSeconds("militia", 1, v1.buildings) * 1000;
  expect(9, Date.parse(rjob.completesAt) - Date.parse(rjob.startedAt) === recruitMs, `recruit timer ${Date.parse(rjob.completesAt) - Date.parse(rjob.startedAt)}ms != ${recruitMs}ms`);
  const rcost = troopCost("militia", 1);
  for (const kind of ["wood", "stone", "iron"]) {
    const delta = afterRecruit.resources[kind] - ownVillage(preRecruit).resources[kind];
    expect(9, delta <= -rcost[kind] + 2 && delta >= -rcost[kind], `${kind} moved ${delta}, militia cost is ${rcost[kind]}`);
    spent[kind] += rcost[kind];
  }
  expect(9, afterRecruit.militia === 0, `militia already in the army before training: ${afterRecruit.militia}`);
  record(9, true, `${recruitCmd.commandId} → command.accepted; cost ${JSON.stringify(rcost)}; job ${rjob.id} timer ${recruitMs / 1000}s, completesAt ${rjob.completesAt}; army militia still 0`);

  // ------------------------------------------------------------------ 10 (B7 + A2 server half)
  step(10, "B7/A2 — graceful stop; stay down past the recruit's completesAt; restart on the same DB: version, job, identity and idempotency record all survive");
  const preStop = digest((await pullState([P1])).states[String(P1)]);
  const inboxBefore = sqlite("SELECT count(*) FROM local_command_inbox;");
  const stopped = await stopServer(server, "world server");
  server = null;
  expect(10, stopped.code === 0, `graceful stop exited ${stopped.code}/${stopped.signal}, expected code 0`);
  const downProbe = await request("GET", "/api/health", undefined, { key: null });
  expect(10, downProbe.status === 0, "server still answering after SIGTERM");
  const downUntil = Date.parse(rjob.completesAt) + 5_000;
  const downMs = Math.max(0, downUntil - Date.now());
  log(`server down; sleeping ${Math.round(downMs / 1000)}s so the militia's completesAt (${rjob.completesAt}) passes while nothing is running`);
  await sleep(downMs);
  log(`restarting at ${new Date().toISOString()}`);
  server = startServer(dbPath, port);
  const h10 = await waitForHealth(base);
  log(`GET /api/health -> ${h10.status} ${h10.text}`);
  const relinkAfter = await request("POST", "/api/roblox/session", { robloxUserId: P1, displayName: "Redrive One (after restart)" });
  expect(10, relinkAfter.status === 200 && relinkAfter.json.created === false && relinkAfter.json.playerId === link1.json.playerId && relinkAfter.json.kingdomId === link1.json.kingdomId, `identity did not survive restart: ${relinkAfter.text}`);
  const postRestartState = (await pullState([P1])).states[String(P1)];
  const postRestart = digest(postRestartState);
  log(`state before stop: ${JSON.stringify(preStop)}`);
  log(`state after restart: ${JSON.stringify(postRestart)}`);
  expect(10, postRestart.playerId === preStop.playerId && postRestart.kingdomId === preStop.kingdomId && postRestart.villageId === preStop.villageId, "player/kingdom/village identity changed across restart");
  expect(10, postRestart.constructionJobs.length === 1 && JSON.stringify(postRestart.constructionJobs[0]) === JSON.stringify(preStop.constructionJobs[0]), `construction job changed across restart: ${JSON.stringify(postRestart.constructionJobs)} vs ${JSON.stringify(preStop.constructionJobs)}`);
  expect(10, postRestart.worldVersion >= preStop.worldVersion, `world version went backwards ${preStop.worldVersion} -> ${postRestart.worldVersion}`);
  expect(10, sqlite("SELECT count(*) FROM local_command_inbox;") === inboxBefore, "inbox row count changed across restart");
  const replayAfter = await request("POST", "/api/roblox/commands", buildCmd);
  expect(10, replayAfter.status === 200 && replayAfter.text === build.text, `replay after restart differs: ${replayAfter.text} vs ${build.text}`);
  expect(10, sqlite("SELECT count(*) FROM local_construction_jobs;") === "1", "replay after restart created a second construction row");
  record(10, true, `SIGTERM exit 0; down ${Math.round(downMs / 1000)}s; restart /api/health 200; P1 rejoin created:false same ids; construction job ${job.id} identical (completesAt ${job.completesAt}); inbox rows ${inboxBefore} unchanged; replay of ${buildCmd.commandId} after restart byte-identical to the original`);

  // ------------------------------------------------------------------ 11 (offline catch-up)
  step(11, "offline catch-up — the recruit that came due while the server was down completed at exactly its completesAt, with its notification");
  expect(11, postRestart.recruitmentJobs.length === 0, `recruit job still queued after its completesAt: ${JSON.stringify(postRestart.recruitmentJobs)}`);
  expect(11, postRestart.militia === 1, `army militia is ${postRestart.militia}, expected 1`);
  const recruitNote = postRestartState.notifications.find((n) => n.kind === "recruitment");
  expect(11, recruitNote, `no recruitment notification; have ${JSON.stringify(postRestart.notifications)}`);
  expect(11, recruitNote.createdAt === rjob.completesAt, `recruitment notification stamped ${recruitNote.createdAt}, job completesAt ${rjob.completesAt}`);
  expect(11, /joined the army\.$/.test(recruitNote.message), `unexpected notification text "${recruitNote.message}"`);
  expect(11, sqlite(`SELECT status FROM local_recruitment_jobs WHERE id = '${rjob.id}';`) === "complete", "recruit row not marked complete");
  expect(11, postRestart.worldVersion === preStop.worldVersion + 1, `expected exactly one version bump for the completion, got ${preStop.worldVersion} -> ${postRestart.worldVersion}`);
  record(11, true, `militia 0 → 1 with no server running at ${rjob.completesAt}; notification "${recruitNote.message}" createdAt == completesAt; row complete; world version ${preStop.worldVersion} → ${postRestart.worldVersion}`);

  // ------------------------------------------------------------------ 12 (C1 accrual across downtime)
  step(12, "C1 — offline accrual + fractional carry: whole + carry == baseline + production×hours − spent, across the restart");
  const nowRow = economyRow(v1.id);
  const nowEcon = { resources: nowRow.resources, economy: nowRow };
  const hours12 = accrualCheck(12, "after restart", baseline, nowEcon, spent, econ1.productionPerHour);
  const wholeGained = ["wood", "stone", "iron"].map((k) => `${k} +${nowEcon.resources[k] - baseline.resources[k] + spent[k]}`).join(", ");
  record(12, true, `${hours12.toFixed(4)} h elapsed (incl. ${Math.round(downMs / 1000)}s offline): whole units gained ${wholeGained}; fractional carry persisted in local_village_economy; totals match 28/h per resource to <1e-6`);

  // ------------------------------------------------------------------ 13 (C1 over the long wait)
  step(13, "C1 — whole resource units land at exactly 28/h over the construction wait (checked just before the upgrade changes the rate)");
  if (skipConstructionWait) {
    results.push({ step: 13, ok: null, detail: "SKIPPED (REDRIVE_SKIP_CONSTRUCTION_WAIT=1) — not claimed" });
    log("[step 13] SKIPPED — REDRIVE_SKIP_CONSTRUCTION_WAIT=1");
  } else {
    const preUpgradeMs = Date.parse(job.completesAt) - 20_000 - Date.now();
    log(`waiting ${Math.max(0, Math.round(preUpgradeMs / 1000))}s (server running) until 20s before the timber job completes`);
    if (preUpgradeMs > 0) await sleep(preUpgradeMs);
    await pullState([P1]);
    const lateRow = economyRow(v1.id);
    const hours13 = accrualCheck(13, "before upgrade", baseline, { resources: lateRow.resources, economy: lateRow }, spent, econ1.productionPerHour);
    const gained = ["wood", "stone", "iron"].map((k) => `${k} +${lateRow.resources[k] - baseline.resources[k] + spent[k]}`).join(", ");
    expect(13, lateRow.resources.wood - baseline.resources.wood + spent.wood >= Math.floor(28 * hours13) - 1, `wood gained ${lateRow.resources.wood - baseline.resources.wood + spent.wood} over ${hours13} h, expected about ${Math.floor(28 * hours13)}`);
    record(13, true, `${hours13.toFixed(4)} h since baseline: whole units gained ${gained} (28/h each), carry ${JSON.stringify(lateRow.carry)}; whole + carry matches the formula to <1e-6`);
  }

  // ------------------------------------------------------------------ 14 (construction completion)
  step(14, `C2 — construction completes at exactly its completesAt (${job.completesAt}), level rises, production follows`);
  if (skipConstructionWait) {
    results.push({ step: 14, ok: null, detail: "SKIPPED (REDRIVE_SKIP_CONSTRUCTION_WAIT=1) — not claimed" });
    log("[step 14] SKIPPED — REDRIVE_SKIP_CONSTRUCTION_WAIT=1");
  } else {
    const waitMs = Date.parse(job.completesAt) - Date.now();
    log(`waiting ${Math.max(0, Math.round(waitMs / 1000))}s for the timber job to come due (server running the whole time)`);
    if (waitMs > 0) await sleep(waitMs);
    let done = null;
    const deadline = Date.parse(job.completesAt) + 10_000;
    while (Date.now() < deadline) {
      const s = (await pullState([P1])).states[String(P1)];
      if (s.constructionJobs.length === 0 && ownVillage(s).buildings.timber === v1.buildings.timber + 1) { done = s; break; }
      await sleep(500);
    }
    expect(14, done, "timber job did not complete within 10s of its completesAt");
    const observedAt = new Date().toISOString();
    const doneDigest = digest(done);
    log(`state after completion (observed ${observedAt}): ${JSON.stringify(doneDigest)}`);
    const buildNote = done.notifications.find((n) => n.kind === "construction");
    expect(14, buildNote && buildNote.createdAt === job.completesAt, `construction notification ${JSON.stringify(buildNote)} not stamped at completesAt ${job.completesAt}`);
    expect(14, buildNote.message === `Timber Camp reached level ${v1.buildings.timber + 1}.`, `unexpected text "${buildNote.message}"`);
    expect(14, sqlite(`SELECT status FROM local_construction_jobs WHERE id = '${job.id}';`) === "complete", "construction row not marked complete");
    const econDone = done.villageEconomy.find((e) => e.villageId === v1.id);
    expect(14, econDone.productionPerHour.wood === productionPerHour(v1.buildings.timber + 1), `wood production ${econDone.productionPerHour.wood}/h after upgrade, expected ${productionPerHour(v1.buildings.timber + 1)}`);
    record(14, true, `timber ${v1.buildings.timber} → ${v1.buildings.timber + 1} observed ${observedAt} (completesAt ${job.completesAt}); notification "${buildNote.message}" createdAt == completesAt; wood production ${econ1.productionPerHour.wood} → ${econDone.productionPerHour.wood}/h`);
  }
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  log("");
  log(`RE-DRIVE FAILED: ${error.message}`);
} finally {
  await stopServer(twin, "twin server");
  await stopServer(server, "world server");
  log("");
  log("## Result");
  for (const r of results) log(`- step ${r.step}: ${r.ok === null ? "SKIPPED" : r.ok ? "PASS" : "FAIL"}`);
  const passed = results.filter((r) => r.ok === true).length;
  const failed = results.filter((r) => r.ok === false).length;
  const skipped = results.filter((r) => r.ok === null).length;
  const verdict = exitCode === 0 && failed === 0 && passed + skipped === 14 ? "PASS" : "FAIL";
  log(`HTTP re-drive ${verdict} (${passed}/14 steps PASS${skipped ? `, ${skipped} SKIPPED` : ""})`);
  if (verdict === "PASS") {
    rmSync(scratch, { recursive: true, force: true });
    log(`scratch dir removed: ${scratch}`);
  } else {
    log(`scratch dir kept for inspection: ${scratch}`);
  }
  process.exit(verdict === "PASS" ? 0 : 1);
}
