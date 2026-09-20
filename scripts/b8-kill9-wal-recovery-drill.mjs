#!/usr/bin/env node
// B8 — killed-process (SIGKILL) WAL recovery drill.
//
// The audit (docs/audits/kingsage-functionality-audit.md §13.2) names this as
// the one way real drill servers have actually died and the one thing never
// tested: hard-kill the world server with a live -wal, reopen, assert
// integrity. Matrix row B8 in
// docs/verification/2026-09-17-full-game-acceptance-matrix.md says
// "NOT RUN (no test exists)". This script is that drill, HTTP-only.
//
// Two linked players fire construction and recruitment commands at the
// server as fast as it answers; on the Nth accepted command the server is
// SIGKILLed (no shutdown hook can run). Then, before anything else opens the
// database: the -wal must be non-empty, and a copy of the main file WITHOUT
// its -wal must be missing the committed state (so the restart really is a
// WAL recovery, not a read of an already-checkpointed file). The server is
// restarted as the first opener, and every command whose response the
// clients received must replay byte-identically; every command that was in
// flight when the kill landed must be either wholly present or wholly absent;
// the job tables must equal the ledger; resources must reconcile to the
// formula; the queued recruit must still land at exactly its completesAt.
//
// What this does NOT simulate: power loss. SIGKILL discards the process, not
// the kernel's page cache, so fsync durability is outside this drill.
//
// Same posture as scripts/http-live-redrive.mjs: throwaway world in a fresh
// mkdtemp directory, throwaway key, non-4178 port, inherited KINGSAGE_* env
// stripped. Needs only Node 22 + the sqlite3 CLI. ~1 minute.
//
//   node scripts/b8-kill9-wal-recovery-drill.mjs                  # exit 0 = every step PASS
//   B8_PORT=4231 B8_KILL_AFTER_ACCEPTED=8 node scripts/b8-kill9-wal-recovery-drill.mjs
//
// Every request, response and shell command is printed so the output can be
// pasted into a dated docs/verification/ note verbatim.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Expected costs and rates come straight from packages/game-core (TypeScript),
// so this script needs the same flag the server runs under.
if (!process.execArgv.includes("--experimental-strip-types")) {
  const rerun = spawnSync(process.execPath, ["--experimental-strip-types", ...process.argv.slice(1)], { stdio: "inherit" });
  process.exit(rerun.status ?? 1);
}

const { buildingCost, productionPerHour, troopCost } = await import("../packages/game-core/src/economy.ts");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = join(repoRoot, "server");
const port = Number(process.env.B8_PORT ?? 4231);
const base = `http://127.0.0.1:${port}`;
const killAfterAccepted = Number(process.env.B8_KILL_AFTER_ACCEPTED ?? 8);
// Throwaway key for a throwaway world. Not a secret; never reused anywhere.
const robloxKey = "b8-throwaway-key-0001";
const PLAYERS = [
  { userId: 930001, name: "Kill Nine One", tag: "p1" },
  { userId: 930002, name: "Kill Nine Two", tag: "p2" },
];
// Per player: one recruit (only one recruitment order may be active per
// village), one Rampart (needs Headquarters 2 → PREREQUISITE_MISSING, a stored
// rejection), then exactly BUILD_QUEUE_LIMIT (10) construction orders. Only
// the first construction order is charged — the rest wait, unpaid, until the
// village can pay — so the ledger knows exactly which jobs cost anything.
const PLAN = [
  { type: "village.recruit.queue", troop: "militia", quantity: 1 },
  { type: "village.build.queue", building: "wall" },
  ...["timber", "quarry", "iron", "farm", "warehouse", "hq", "barracks", "timber", "quarry", "farm"].map((building) => ({ type: "village.build.queue", building })),
];
// Command rate limit is 30/min/player; the plan is 12 requests plus
// conflict retries, so a hard cap keeps a pathological interleave honest
// (a 429 is not stored in the inbox and would muddy the replay step).
const MAX_REQUESTS_PER_PLAYER = 28;

const scratch = mkdtempSync(join(tmpdir(), "kingsmarch-b8-"));
const dbPath = join(scratch, "world.sqlite");
const orphanPath = join(scratch, "orphan-main-file-only.sqlite");
const results = [];
let server = null;
const TOTAL_STEPS = 11;

const log = (line = "") => process.stdout.write(`${line}\n`);
const step = (n, title) => { log(""); log(`## Step ${n} — ${title}`); };
function record(n, ok, detail) { results.push({ step: n, ok, detail }); log(`[step ${n}] ${ok ? "PASS" : "FAIL"} — ${detail}`); }
function fail(n, detail) { record(n, false, detail); throw new Error(`step ${n} failed: ${detail}`); }
function expect(n, condition, detail) { if (!condition) fail(n, detail); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sqlite(sql, path = dbPath) {
  const run = spawnSync("sqlite3", [path, sql], { encoding: "utf8" });
  log(`$ sqlite3 <${path === dbPath ? "db" : "orphan"}> ${JSON.stringify(sql)}`);
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
  if (out) log(out.split("\n").map((l) => `  ${l}`).join("\n"));
  log(`  -> exit ${run.status}`);
  return { stdout: (run.stdout ?? "").trim(), stderr: (run.stderr ?? "").trim(), status: run.status };
}

function shorten(text, max = 400) {
  return text.length > max ? `${text.slice(0, max)}… (${text.length} bytes)` : text;
}

async function request(method, path, body, { key = robloxKey, quiet = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (key !== null) headers["x-kingsage-key"] = key;
  let response;
  try {
    response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    const code = error.cause?.code ?? error.cause?.message ?? error.message;
    if (!quiet) log(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ""} -> no response (${code})`);
    return { status: 0, json: null, text: "", errorCode: code };
  }
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  if (!quiet) log(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ""} -> ${response.status} ${shorten(text)}`);
  return { status: response.status, json, text };
}

async function pullState(ids) {
  const result = await request("POST", "/api/roblox/state", { robloxUserIds: ids }, { quiet: true });
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
    militia: village.army.militia,
    constructionJobs: state.constructionJobs.map((j) => `${j.building}→${j.targetLevel}${j.completesAt === j.startedAt ? " (waiting)" : ""}`),
    recruitmentJobs: state.recruitmentJobs.map((j) => `${j.troop}×${j.quantity}@${j.completesAt}`),
    notifications: state.notifications.map((n) => `${n.kind}@${n.createdAt}: ${n.message}`),
  };
}

function startServer() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith("KINGSAGE_")) env[key] = value;
  Object.assign(env, { KINGSAGE_DATABASE_PATH: dbPath, KINGSAGE_ROBLOX_KEY: robloxKey, KINGSAGE_BIND: "127.0.0.1", PORT: String(port) });
  log(`$ (cd server && KINGSAGE_DATABASE_PATH=${dbPath} KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_BIND=127.0.0.1 PORT=${port} node --experimental-strip-types src/index.ts &)`);
  const child = spawn(process.execPath, ["--experimental-strip-types", "src/index.ts"], { cwd: serverRoot, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => log(`  [server:${port}] ${String(chunk).trimEnd()}`));
  child.stderr.on("data", (chunk) => { const text = String(chunk).trimEnd(); if (!text.includes("ExperimentalWarning") && !text.includes("--trace-warnings")) log(`  [server:${port}:err] ${text}`); });
  child.exited = new Promise((done) => child.once("exit", (code, signal) => done({ code, signal })));
  return child;
}

async function waitForHealth(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const probe = await request("GET", "/api/health", undefined, { key: null, quiet: true });
    if (probe.status === 200) return probe;
    await sleep(200);
  }
  throw new Error(`no /api/health 200 from ${base} within ${timeoutMs}ms`);
}

async function stopServer(child, label) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  log(`$ kill -TERM <${label} pid ${child.pid}>`);
  child.kill("SIGTERM");
  const outcome = await Promise.race([child.exited, sleep(10_000).then(() => ({ code: null, signal: "TIMEOUT" }))]);
  if (outcome.signal === "TIMEOUT") { child.kill("SIGKILL"); await child.exited; }
  log(`  -> ${label} exited (code ${outcome.code}, signal ${outcome.signal}) at ${new Date().toISOString()}`);
}

function fileSize(path) {
  return existsSync(path) ? statSync(path).size : null;
}

// One statement, so whole resources and the fractional carry come from the
// same instant — a materialize tick between two reads would skew the check.
function economyRow(villageId) {
  const raw = sqlite(`SELECT e.last_materialized_at || '|' || e.resource_carry_json || '|' || v.resources_json FROM local_village_economy e JOIN local_villages v ON v.id = e.village_id WHERE e.village_id = '${villageId}';`).stdout;
  const [lastMaterializedAt, carryJson, resourcesJson] = raw.split("|");
  return { lastMaterializedAt, carry: JSON.parse(carryJson), resources: JSON.parse(resourcesJson) };
}

function commandBody(player, entry, expectedWorldVersion, commandId) {
  const payload = entry.type === "village.recruit.queue"
    ? { villageId: player.villageId, troop: entry.troop, quantity: entry.quantity }
    : { villageId: player.villageId, building: entry.building };
  return { robloxUserId: player.userId, commandId, expectedWorldVersion, command: { type: entry.type, payload } };
}

async function main() {
  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
  log(`# B8 — SIGKILL / WAL recovery drill (current tip)`);
  log(`date: ${new Date().toISOString()}`);
  log(`sha: ${sha}`);
  log(`node: ${process.version}`);
  log(`sqlite3: ${spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).stdout.trim()}`);
  log(`scratch: ${scratch}`);
  log(`db: ${dbPath}`);
  log(`port: ${port}`);
  log(`kill after: ${killAfterAccepted} accepted commands`);

  // ------------------------------------------------------------------ 1
  step(1, "fresh disposable world: health 200, two players linked, baseline snapshot and economy rows recorded");
  expect(1, !existsSync(dbPath), `scratch DB already exists at ${dbPath}`);
  server = startServer();
  const h = await waitForHealth();
  log(`GET /api/health -> ${h.status} ${h.text}`);
  expect(1, h.json?.ok === true && h.json?.service === "kingsage-world", `unexpected health body ${h.text}`);
  for (const player of PLAYERS) {
    const link = await request("POST", "/api/roblox/session", { robloxUserId: player.userId, displayName: player.name });
    expect(1, link.status === 200 && link.json.created === true, `link ${player.tag}: ${link.status} ${link.text}`);
    player.playerId = link.json.playerId;
    player.kingdomId = link.json.kingdomId;
  }
  const pull0 = await pullState(PLAYERS.map((p) => p.userId));
  for (const player of PLAYERS) {
    const state = pull0.states[String(player.userId)];
    expect(1, state, `no state for ${player.tag}`);
    const village = ownVillage(state);
    player.villageId = village.id;
    player.levels = village.buildings;
    player.production = { wood: productionPerHour(village.buildings.timber), stone: productionPerHour(village.buildings.quarry), iron: productionPerHour(village.buildings.iron) };
    player.baseline = economyRow(village.id);
    player.startVersion = state.world.version;
    log(`${player.tag}: ${player.playerId} / ${player.kingdomId} / ${village.id} levels ${JSON.stringify(village.buildings)} baseline ${JSON.stringify(player.baseline)}`);
  }
  const worldVersion0 = pull0.states[String(PLAYERS[0].userId)].world.version;
  const walBefore = fileSize(`${dbPath}-wal`);
  log(`files before burst: main ${fileSize(dbPath)} bytes, -wal ${walBefore} bytes, -shm ${fileSize(`${dbPath}-shm`)} bytes`);
  record(1, true, `health 200; ${PLAYERS.map((p) => `${p.tag} ${p.playerId}/${p.kingdomId}/${p.villageId}`).join("; ")}; world version ${worldVersion0}; baselines recorded from local_village_economy`);

  // ------------------------------------------------------------------ 2
  step(2, `burst — both players issue their plan concurrently, each retrying on WORLD_VERSION_CONFLICT; SIGKILL the moment the ${killAfterAccepted}th accepted command comes back`);
  const ledger = [];
  let accepted = 0;
  let killedAt = null;
  const killServer = () => {
    if (killedAt) return;
    killedAt = new Date().toISOString();
    log(`$ kill -KILL <world server pid ${server.pid}>   # at ${killedAt}, after ${accepted} accepted commands`);
    server.kill("SIGKILL");
  };
  async function runPlayer(player) {
    let version = player.startVersion;
    let seq = 0;
    let planIndex = 0;
    while (planIndex < PLAN.length && seq < MAX_REQUESTS_PER_PLAYER) {
      if (killedAt) break;
      const entry = PLAN[planIndex];
      seq += 1;
      const body = commandBody(player, entry, version, `b8-${player.tag}-${String(seq).padStart(2, "0")}`);
      const row = { player, body, entry, sentAt: new Date().toISOString(), outcome: null, status: 0, text: "", json: null };
      ledger.push(row);
      const res = await request("POST", "/api/roblox/commands", body, { quiet: true });
      row.status = res.status;
      row.text = res.text;
      row.json = res.json;
      if (res.status === 0) {
        row.outcome = res.errorCode === "ECONNREFUSED" ? "unsent" : "in-flight";
        row.errorCode = res.errorCode;
        log(`${row.body.commandId}: no response (${res.errorCode}) -> ${row.outcome}${killedAt ? "" : " (server not yet killed!)"}`);
        break;
      }
      if (res.status === 429) fail(2, `${row.body.commandId} hit the command rate limit; the plan must stay under 30/min/player`);
      const code = res.json?.payload?.code;
      if (res.status === 200 && res.json?.type === "command.accepted") {
        row.outcome = "accepted";
        version = res.json.payload.worldVersion;
        accepted += 1;
        planIndex += 1;
        const job = res.json.payload.constructionJob ?? res.json.payload.recruitmentJob;
        log(`${row.body.commandId}: accepted ${entry.type === "village.build.queue" ? entry.building : `${entry.troop}×${entry.quantity}`} -> version ${version}, job ${job.id} completesAt ${job.completesAt}${job.completesAt === job.startedAt ? " (waiting)" : ""}`);
        if (accepted >= killAfterAccepted) killServer();
      } else if (code === "WORLD_VERSION_CONFLICT") {
        row.outcome = "rejected";
        version = res.json.payload.currentWorldVersion;
        log(`${row.body.commandId}: 409 WORLD_VERSION_CONFLICT (expected ${body.expectedWorldVersion}, current ${version}) -> retry with a new id`);
      } else if (res.status === 409) {
        row.outcome = "rejected";
        planIndex += 1;
        log(`${row.body.commandId}: 409 ${code} "${res.json.payload.message}"`);
      } else {
        fail(2, `${row.body.commandId}: unexpected ${res.status} ${res.text}`);
      }
    }
  }
  await Promise.all(PLAYERS.map(runPlayer));
  expect(2, killedAt, `the burst finished without reaching ${killAfterAccepted} accepted commands (${accepted} accepted)`);
  const exit = await Promise.race([server.exited, sleep(10_000).then(() => ({ code: null, signal: "TIMEOUT" }))]);
  log(`  -> world server exited (code ${exit.code}, signal ${exit.signal}) at ${new Date().toISOString()}`);
  const responded = ledger.filter((r) => r.outcome === "accepted" || r.outcome === "rejected");
  const inFlight = ledger.filter((r) => r.outcome === "in-flight");
  const unsent = ledger.filter((r) => r.outcome === "unsent");
  const acceptedRows = ledger.filter((r) => r.outcome === "accepted");
  const rejectedCodes = ledger.filter((r) => r.outcome === "rejected").reduce((acc, r) => ({ ...acc, [r.json.payload.code]: (acc[r.json.payload.code] ?? 0) + 1 }), {});
  log(`ledger: ${ledger.length} requests — ${acceptedRows.length} accepted, ${responded.length - acceptedRows.length} rejected ${JSON.stringify(rejectedCodes)}, ${inFlight.length} in flight at the kill, ${unsent.length} never reached the server`);
  const prereq = ledger.find((r) => r.outcome === "rejected" && r.json.payload.code === "PREREQUISITE_MISSING");
  expect(2, exit.signal === "SIGKILL", `expected the server to die by SIGKILL, got code ${exit.code} signal ${exit.signal}`);
  expect(2, acceptedRows.length >= killAfterAccepted, `only ${acceptedRows.length} accepted`);
  expect(2, prereq, "no PREREQUISITE_MISSING refusal recorded (the Rampart order should need Headquarters 2)");
  record(2, true, `${ledger.length} requests from 2 players; ${acceptedRows.length} accepted (${acceptedRows.filter((r) => r.entry.type === "village.build.queue").length} construction, ${acceptedRows.filter((r) => r.entry.type === "village.recruit.queue").length} recruitment), ${responded.length - acceptedRows.length} stored rejections ${JSON.stringify(rejectedCodes)} incl. "${prereq.json.payload.message}"; SIGKILL at ${killedAt}; ${inFlight.length} request(s) in flight with no response; server exited signal ${exit.signal}`);

  // ------------------------------------------------------------------ 3
  step(3, "the process is gone, nothing answers, and a live -wal is left behind (no shutdown hook ran)");
  const downProbe = await request("GET", "/api/health", undefined, { key: null });
  expect(3, downProbe.status === 0, "server still answering after SIGKILL");
  const walAtKill = fileSize(`${dbPath}-wal`);
  const shmAtKill = fileSize(`${dbPath}-shm`);
  log(`files at kill: main ${fileSize(dbPath)} bytes, -wal ${walAtKill} bytes, -shm ${shmAtKill} bytes`);
  expect(3, walAtKill !== null && walAtKill > 0, `-wal missing or empty (${walAtKill}) — the kill did not leave uncheckpointed frames behind`);
  expect(3, shmAtKill !== null, "-shm missing");
  record(3, true, `health ECONNREFUSED; -wal ${walAtKill} bytes and -shm ${shmAtKill} bytes left on disk; nothing has opened the database since the kill`);

  // ------------------------------------------------------------------ 4
  step(4, "control — the main file copied WITHOUT its -wal lacks the committed state, so what follows is a WAL recovery, not a re-read of a checkpointed file");
  copyFileSync(dbPath, orphanPath);
  log(`$ cp <db> <orphan>   # main file only; -wal and -shm deliberately not copied`);
  const orphanInbox = sqlite("SELECT count(*) FROM local_command_inbox;", orphanPath);
  const orphanCount = orphanInbox.status === 0 && orphanInbox.stdout !== "" ? Number(orphanInbox.stdout) : null;
  const orphanTables = sqlite("SELECT count(*) FROM sqlite_master WHERE type = 'table';", orphanPath);
  const orphanSummary = orphanCount === null ? `no readable inbox (${orphanInbox.stderr || "no tables"})` : `${orphanCount} inbox rows`;
  expect(4, orphanCount === null || orphanCount < responded.length, `orphan copy already holds ${orphanCount} inbox rows ≥ ${responded.length} responded commands — the WAL was checkpointed before the kill, so this run would not exercise WAL recovery`);
  record(4, true, `main-file-only copy: ${orphanSummary}, ${orphanTables.stdout || "0"} tables; the live server had ${responded.length} responded commands — the committed state was in the -wal`);

  // ------------------------------------------------------------------ 5
  step(5, "restart on the same files as the FIRST opener since the kill: health 200, integrity_check ok, foreign_key_check empty, still WAL mode");
  log(`restarting at ${new Date().toISOString()}`);
  server = startServer();
  const h5 = await waitForHealth();
  log(`GET /api/health -> ${h5.status} ${h5.text}`);
  const integrity = sqlite("PRAGMA integrity_check;");
  expect(5, integrity.stdout === "ok", `integrity_check: ${integrity.stdout || integrity.stderr}`);
  const fk = sqlite("PRAGMA foreign_key_check;");
  expect(5, fk.stdout === "" && fk.status === 0, `foreign_key_check reported: ${fk.stdout}`);
  const mode = sqlite("PRAGMA journal_mode;");
  expect(5, mode.stdout === "wal", `journal_mode is ${mode.stdout}`);
  log(`files after restart: main ${fileSize(dbPath)} bytes, -wal ${fileSize(`${dbPath}-wal`)} bytes, -shm ${fileSize(`${dbPath}-shm`)} bytes`);
  record(5, true, `health 200 after restart; PRAGMA integrity_check = ok; foreign_key_check empty; journal_mode wal`);

  // ------------------------------------------------------------------ 6
  step(6, "identity — both players rejoin as created:false with the same player, kingdom and village ids");
  for (const player of PLAYERS) {
    const relink = await request("POST", "/api/roblox/session", { robloxUserId: player.userId, displayName: `${player.name} (after kill)` });
    expect(6, relink.status === 200 && relink.json.created === false && relink.json.playerId === player.playerId && relink.json.kingdomId === player.kingdomId, `${player.tag} identity changed: ${relink.text}`);
  }
  const pull6 = await pullState(PLAYERS.map((p) => p.userId));
  for (const player of PLAYERS) {
    const d = digest(pull6.states[String(player.userId)]);
    expect(6, d.villageId === player.villageId, `${player.tag} village changed to ${d.villageId}`);
    log(`${player.tag} after restart: ${JSON.stringify(d)}`);
  }
  record(6, true, `both rejoins created:false with identical player/kingdom ids; villages ${PLAYERS.map((p) => p.villageId).join(", ")} still owned`);

  // ------------------------------------------------------------------ 7
  step(7, `durability — every command the clients got an answer to (${responded.length}: accepted AND rejected) replays byte-identically from the inbox`);
  let replayed = 0;
  for (const row of responded) {
    const replay = await request("POST", "/api/roblox/commands", row.body, { quiet: true });
    expect(7, replay.status === row.status && replay.text === row.text, `${row.body.commandId} replay differs: ${replay.status} ${replay.text} vs original ${row.status} ${row.text}`);
    replayed += 1;
  }
  log(`replayed ${replayed}/${responded.length} responded commands: every status and body byte-identical to the pre-kill response`);
  const inboxCount = Number(sqlite("SELECT count(*) FROM local_command_inbox;").stdout);
  record(7, true, `${replayed}/${responded.length} replays byte-identical (${acceptedRows.length} accepted, ${responded.length - acceptedRows.length} rejected); inbox holds ${inboxCount} rows`);

  // ------------------------------------------------------------------ 8
  step(8, `atomicity — each of the ${inFlight.length} in-flight command(s) is either wholly present (inbox row + its job) or wholly absent`);
  const durableAccepted = [...acceptedRows];
  const inFlightReport = [];
  for (const row of inFlight) {
    const stored = sqlite(`SELECT result_json FROM local_command_inbox WHERE command_id = '${row.body.commandId}';`).stdout;
    if (stored === "") {
      inFlightReport.push(`${row.body.commandId}: absent (no inbox row) — the kill landed before its commit`);
      continue;
    }
    const result = JSON.parse(stored);
    const replay = await request("POST", "/api/roblox/commands", row.body, { quiet: true });
    expect(8, replay.text === stored, `${row.body.commandId} replay ${replay.text} differs from stored ${stored}`);
    if (result.type === "command.accepted") {
      const job = result.payload.constructionJob ?? result.payload.recruitmentJob;
      const table = result.payload.constructionJob ? "local_construction_jobs" : "local_recruitment_jobs";
      const jobRow = sqlite(`SELECT completes_at FROM ${table} WHERE id = '${job.id}';`).stdout;
      expect(8, jobRow === job.completesAt, `${row.body.commandId} committed its inbox row but its job ${job.id} is ${jobRow === "" ? "missing" : `at ${jobRow}`}`);
      row.json = result;
      durableAccepted.push(row);
      inFlightReport.push(`${row.body.commandId}: present — accepted, job ${job.id} on disk, replay identical`);
    } else {
      inFlightReport.push(`${row.body.commandId}: present — rejected ${result.payload.code}, replay identical`);
    }
  }
  for (const line of inFlightReport) log(line);
  expect(8, inboxCount === responded.length + inFlightReport.filter((l) => l.includes("present")).length, `inbox has ${inboxCount} rows but the ledger accounts for ${responded.length} responded + ${inFlightReport.filter((l) => l.includes("present")).length} committed in-flight`);
  record(8, true, inFlight.length === 0 ? "no request was in flight at the kill (nothing to check); inbox row count equals the responded ledger" : `${inFlightReport.join("; ")}; inbox row count equals responded + committed in-flight`);

  // ------------------------------------------------------------------ 9
  step(9, "job tables equal the ledger — every durable accepted job is on disk with its completes_at, and no job exists that no accepted command created; world version never went backwards");
  const expectedConstruction = new Map();
  const expectedRecruitment = new Map();
  for (const row of durableAccepted) {
    const cj = row.json.payload.constructionJob;
    const rj = row.json.payload.recruitmentJob;
    if (cj) expectedConstruction.set(cj.id, cj);
    if (rj) expectedRecruitment.set(rj.id, rj);
  }
  const onDiskConstruction = sqlite("SELECT id || '|' || completes_at || '|' || status FROM local_construction_jobs ORDER BY id;").stdout.split("\n").filter(Boolean);
  const onDiskRecruitment = sqlite("SELECT id || '|' || completes_at || '|' || status FROM local_recruitment_jobs ORDER BY id;").stdout.split("\n").filter(Boolean);
  expect(9, onDiskConstruction.length === expectedConstruction.size, `construction rows ${onDiskConstruction.length} != ${expectedConstruction.size} durable accepted construction commands`);
  expect(9, onDiskRecruitment.length === expectedRecruitment.size, `recruitment rows ${onDiskRecruitment.length} != ${expectedRecruitment.size} durable accepted recruitment commands`);
  for (const line of onDiskConstruction) {
    const [id, completesAt, status] = line.split("|");
    const job = expectedConstruction.get(id);
    expect(9, job, `construction row ${id} was never accepted by any command`);
    expect(9, completesAt === job.completesAt, `construction ${id} completes_at ${completesAt} != accepted ${job.completesAt}`);
    expect(9, status === (job.completesAt === job.startedAt ? "waiting" : "queued"), `construction ${id} status ${status} unexpected`);
  }
  for (const line of onDiskRecruitment) {
    const [id, completesAt] = line.split("|");
    const job = expectedRecruitment.get(id);
    expect(9, job, `recruitment row ${id} was never accepted by any command`);
    expect(9, completesAt === job.completesAt, `recruitment ${id} completes_at ${completesAt} != accepted ${job.completesAt}`);
  }
  const maxAcceptedVersion = Math.max(...durableAccepted.map((r) => r.json.payload.worldVersion));
  const versionNow = pull6.states[String(PLAYERS[0].userId)].world.version;
  expect(9, versionNow >= maxAcceptedVersion, `world version ${versionNow} after restart is below the highest accepted version ${maxAcceptedVersion}`);
  record(9, true, `${onDiskConstruction.length} construction + ${onDiskRecruitment.length} recruitment rows, each matching an accepted command's id and completesAt (statuses: ${onDiskConstruction.filter((l) => l.endsWith("|queued")).length} queued, ${onDiskConstruction.filter((l) => l.endsWith("|waiting")).length} waiting); no orphan job rows; highest accepted version before the kill ${maxAcceptedVersion}, world version after restart ${versionNow}`);

  // ------------------------------------------------------------------ 10
  step(10, "resources reconcile — per village, whole + carry == baseline + production × hours − what the durable STARTED jobs charged (waiting jobs are unpaid), to <1e-6");
  for (const player of PLAYERS) {
    const spent = { wood: 0, stone: 0, iron: 0 };
    const charged = [];
    for (const row of durableAccepted.filter((r) => r.player === player)) {
      const cj = row.json.payload.constructionJob;
      const rj = row.json.payload.recruitmentJob;
      let cost = null;
      if (cj && cj.completesAt !== cj.startedAt) cost = buildingCost(cj.building, cj.targetLevel - 1);
      if (rj) cost = troopCost(rj.troop, rj.quantity);
      if (!cost) continue;
      charged.push(`${cj ? `${cj.building}→${cj.targetLevel}` : `${rj.troop}×${rj.quantity}`} ${JSON.stringify(cost)}`);
      for (const kind of ["wood", "stone", "iron"]) spent[kind] += cost[kind];
    }
    const now = economyRow(player.villageId);
    const hours = (Date.parse(now.lastMaterializedAt) - Date.parse(player.baseline.lastMaterializedAt)) / 3_600_000;
    const report = {};
    for (const kind of ["wood", "stone", "iron"]) {
      const expected = player.baseline.resources[kind] + player.baseline.carry[kind] + player.production[kind] * hours - spent[kind];
      const actual = now.resources[kind] + now.carry[kind];
      report[kind] = { whole: now.resources[kind], carry: Number(now.carry[kind].toFixed(6)), expectedTotal: Number(expected.toFixed(6)), actualTotal: Number(actual.toFixed(6)) };
      expect(10, Math.abs(expected - actual) < 1e-6, `${player.tag} ${kind}: expected total ${expected}, actual ${actual} (charged ${JSON.stringify(spent)})`);
    }
    log(`${player.tag}: charged ${charged.join(", ")} = ${JSON.stringify(spent)}; ${hours.toFixed(6)} h at ${JSON.stringify(player.production)}/h; ${JSON.stringify(report)}`);
  }
  record(10, true, `both villages: whole + carry equals baseline + production × elapsed − charged costs to <1e-6; only the first construction order and the recruit were charged, as the queue rule says`);

  // ------------------------------------------------------------------ 11
  step(11, "timers survive the kill — each durable recruit lands at exactly its completesAt with its notification, and the world takes a new command afterwards");
  const recruits = durableAccepted.filter((r) => r.json.payload.recruitmentJob);
  expect(11, recruits.length > 0, "no durable recruitment job to wait for");
  const lastDue = Math.max(...recruits.map((r) => Date.parse(r.json.payload.recruitmentJob.completesAt)));
  const waitMs = lastDue + 2_000 - Date.now();
  log(`waiting ${Math.max(0, Math.round(waitMs / 1000))}s for the last recruit (${new Date(lastDue).toISOString()}) to come due`);
  if (waitMs > 0) await sleep(waitMs);
  const pull11 = await pullState(PLAYERS.map((p) => p.userId));
  for (const row of recruits) {
    const job = row.json.payload.recruitmentJob;
    const state = pull11.states[String(row.player.userId)];
    const village = ownVillage(state);
    expect(11, village.army.militia === job.quantity, `${row.player.tag} militia ${village.army.militia}, expected ${job.quantity}`);
    const note = state.notifications.find((n) => n.kind === "recruitment");
    expect(11, note && note.createdAt === job.completesAt, `${row.player.tag} recruitment notification ${JSON.stringify(note)} not stamped at ${job.completesAt}`);
    expect(11, sqlite(`SELECT status FROM local_recruitment_jobs WHERE id = '${job.id}';`).stdout === "complete", `${row.player.tag} recruit row not complete`);
    log(`${row.player.tag}: militia ${village.army.militia}; "${note.message}" createdAt ${note.createdAt} == completesAt ${job.completesAt}`);
    // The other player's fresh order (or a production tick) may have moved
    // the version since the pull; one retry at the reported version is the
    // same thing a client does.
    let version = (await pullState([row.player.userId])).states[String(row.player.userId)].world.version;
    let fresh = await request("POST", "/api/roblox/commands", commandBody(row.player, PLAN[0], version, `b8-${row.player.tag}-after-kill-1`));
    if (fresh.status === 409 && fresh.json?.payload?.code === "WORLD_VERSION_CONFLICT") {
      version = fresh.json.payload.currentWorldVersion;
      fresh = await request("POST", "/api/roblox/commands", commandBody(row.player, PLAN[0], version, `b8-${row.player.tag}-after-kill-2`));
    }
    expect(11, fresh.status === 200 && fresh.json.type === "command.accepted", `${row.player.tag} post-recovery recruit refused: ${fresh.status} ${fresh.text}`);
  }
  record(11, true, `${recruits.length} recruit(s) completed at exactly their completesAt after the kill, notifications stamped to match, rows complete; a fresh recruit order per player was accepted afterwards`);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  log("");
  log(`B8 DRILL FAILED: ${error.message}`);
} finally {
  await stopServer(server, "world server");
  log("");
  log("## Result");
  for (const r of results) log(`- step ${r.step}: ${r.ok ? "PASS" : "FAIL"}`);
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const verdict = exitCode === 0 && failed === 0 && passed === TOTAL_STEPS ? "PASS" : "FAIL";
  log(`B8 kill -9 / WAL recovery drill ${verdict} (${passed}/${TOTAL_STEPS} steps PASS)`);
  if (verdict === "PASS") {
    rmSync(scratch, { recursive: true, force: true });
    log(`scratch dir removed: ${scratch}`);
  } else {
    log(`scratch dir kept for inspection: ${scratch}`);
  }
  process.exit(verdict === "PASS" ? 0 : 1);
}
