#!/usr/bin/env node
// B10a — local disposable backup/restore drill.
//
// Runs the six numbered steps from the B10a row of
// docs/verification/2026-09-17-full-game-acceptance-matrix.md against a
// throwaway world in a fresh temp directory. Proves that the VPS runbook's
// `VACUUM INTO` backup, taken WHILE the WAL-mode server is running, restores
// to exactly the state it captured — first job present, second job gone.
//
// Needs only Node 22 and the `sqlite3` CLI. Never touches server/data or any
// real player DB: the database path is absolute and lives under os.tmpdir().
//
//   node scripts/b10a-local-restore-drill.mjs            # exit 0 = all six steps PASS
//   B10A_PORT=4211 node scripts/b10a-local-restore-drill.mjs
//
// Every shell command, its exit code, and both state digests are printed so
// the output can be pasted into a dated docs/verification/ note verbatim.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = join(repoRoot, "server");
const port = Number(process.env.B10A_PORT ?? 4199);
const base = `http://127.0.0.1:${port}`;
// Throwaway key for a throwaway world. Not a secret; never reused anywhere.
const robloxKey = "b10a-throwaway-key-0001";
const robloxUserId = 910001;
// B10A_NEGATIVE_CONTROL=naive-copy swaps step 3's VACUUM INTO for a plain
// `cp` of the main DB file (the mistake the runbook warns about). The drill
// is expected to FAIL in that mode; a PASS there would mean the drill proves
// nothing.
const negativeControl = process.env.B10A_NEGATIVE_CONTROL === "naive-copy";

const scratch = mkdtempSync(join(tmpdir(), "kingsmarch-b10a-"));
const dbPath = join(scratch, "world.sqlite");
const backupPath = join(scratch, "world-backup.sqlite");

const results = [];
let server = null;

function log(line = "") {
  process.stdout.write(`${line}\n`);
}

function step(n, title) {
  log("");
  log(`## Step ${n} — ${title}`);
}

function record(n, ok, detail) {
  results.push({ step: n, ok, detail });
  log(`[step ${n}] ${ok ? "PASS" : "FAIL"} — ${detail}`);
}

function fail(n, detail) {
  record(n, false, detail);
  throw new Error(`step ${n} failed: ${detail}`);
}

function sh(cmd, args) {
  const shown = [cmd, ...args.map((a) => (/[\s'"]/.test(a) ? JSON.stringify(a) : a))].join(" ");
  const run = spawnSync(cmd, args, { encoding: "utf8" });
  const code = run.status ?? -1;
  log(`$ ${shown}`);
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
  if (out) log(out.split("\n").map((l) => `  ${l}`).join("\n"));
  log(`  -> exit ${code}`);
  return { code, stdout: (run.stdout ?? "").trim() };
}

function sqlite(path, sql) {
  return sh("sqlite3", [path, sql]);
}

async function post(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kingsage-key": robloxKey },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: response.status, json };
}

async function health() {
  try {
    const response = await fetch(`${base}/api/health`);
    return { status: response.status, json: await response.json() };
  } catch {
    return { status: 0, json: null };
  }
}

async function pullState() {
  const result = await post("/api/roblox/state", { robloxUserIds: [robloxUserId] });
  if (result.status !== 200) throw new Error(`/api/roblox/state -> ${result.status} ${JSON.stringify(result.json)}`);
  const state = result.json.states[String(robloxUserId)];
  if (!state) throw new Error("state pull returned no entry for the drill player");
  return state;
}

function digest(state) {
  return {
    worldVersion: state.world.version,
    constructionJobs: state.constructionJobs.map((job) => ({ id: job.id, building: job.building, targetLevel: job.targetLevel })),
  };
}

function startServer() {
  const env = {};
  // A clean environment: an inherited KINGSAGE_AI_TICK_MS or dev seed would
  // mutate the world on its own and blur the step-6 comparison.
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("KINGSAGE_")) env[key] = value;
  }
  Object.assign(env, {
    KINGSAGE_DATABASE_PATH: dbPath,
    KINGSAGE_ROBLOX_KEY: robloxKey,
    KINGSAGE_BIND: "127.0.0.1",
    PORT: String(port),
  });
  log(`$ (cd server && KINGSAGE_DATABASE_PATH=${dbPath} KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_BIND=127.0.0.1 PORT=${port} node --experimental-strip-types src/index.ts &)`);
  const child = spawn(process.execPath, ["--experimental-strip-types", "src/index.ts"], { cwd: serverRoot, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => log(`  [server] ${String(chunk).trimEnd()}`));
  child.stderr.on("data", (chunk) => log(`  [server:err] ${String(chunk).trimEnd()}`));
  child.exitCode0 = new Promise((done) => child.once("exit", (code, signal) => done({ code, signal })));
  return child;
}

async function waitForHealth(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const probe = await health();
    if (probe.status === 200) return probe;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not answer /api/health within ${timeoutMs}ms`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return { code: child?.exitCode ?? null, signal: null };
  log("$ kill -TERM <server pid>");
  child.kill("SIGTERM");
  const outcome = await Promise.race([
    child.exitCode0,
    new Promise((r) => setTimeout(() => r({ code: null, signal: "TIMEOUT" }), 10_000)),
  ]);
  if (outcome.signal === "TIMEOUT") {
    child.kill("SIGKILL");
    await child.exitCode0;
  }
  log(`  -> server exited (code ${outcome.code}, signal ${outcome.signal})`);
  return outcome;
}

function fileNote(path) {
  return existsSync(path) ? `${path} (${statSync(path).size} bytes)` : `${path} (absent)`;
}

async function main() {
  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
  log(`# B10a local backup/restore drill`);
  log(`date: ${new Date().toISOString()}`);
  log(`sha: ${sha}`);
  log(`node: ${process.version}`);
  log(`sqlite3: ${spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).stdout.trim()}`);
  log(`scratch: ${scratch}`);
  log(`db: ${dbPath}`);
  log(`port: ${port}`);
  if (negativeControl) log(`mode: NEGATIVE CONTROL (naive copy instead of VACUUM INTO) — expected outcome is FAIL`);

  // ---------------------------------------------------------------- step 1
  step(1, "start the world server on a fresh KINGSAGE_DATABASE_PATH, throwaway key, non-4178 port");
  if (existsSync(dbPath)) fail(1, `scratch DB already exists at ${dbPath}`);
  server = startServer();
  const h1 = await waitForHealth();
  if (h1.json?.ok !== true || h1.json?.service !== "kingsage-world") fail(1, `unexpected health body ${JSON.stringify(h1.json)}`);
  record(1, true, `/api/health 200 ${JSON.stringify(h1.json)}; fresh DB created at ${fileNote(dbPath)}`);

  // ---------------------------------------------------------------- step 2
  step(2, "/api/roblox/session + one village.build.queue so the DB has a job and an inbox row");
  const session = await post("/api/roblox/session", { robloxUserId, displayName: "B10a Drill" });
  log(`POST /api/roblox/session -> ${session.status} ${JSON.stringify(session.json)}`);
  if (session.status !== 200 || session.json.created !== true) fail(2, `session link failed: ${session.status}`);
  const before = await pullState();
  const village = before.world.villages.find((v) => v.kingdomId === before.kingdom.id);
  if (!village) fail(2, "no founded village in the first state pull");
  const cmd1 = {
    robloxUserId,
    commandId: "b10a-job-1-timber",
    expectedWorldVersion: before.world.version,
    command: { type: "village.build.queue", payload: { villageId: village.id, building: "timber" } },
  };
  const r1 = await post("/api/roblox/commands", cmd1);
  log(`POST /api/roblox/commands ${cmd1.commandId} -> ${r1.status} ${r1.json.type}`);
  if (r1.status !== 200 || r1.json.type !== "command.accepted") fail(2, `first command not accepted: ${JSON.stringify(r1.json)}`);
  const stateA = digest(await pullState());
  log(`state pull A (after job 1): ${JSON.stringify(stateA)}`);
  const inboxLive1 = sqlite(dbPath, "SELECT count(*) FROM local_command_inbox;");
  const jobsLive1 = sqlite(dbPath, "SELECT count(*) FROM local_construction_jobs;");
  if (stateA.constructionJobs.length !== 1 || stateA.constructionJobs[0].building !== "timber") fail(2, `expected exactly one timber job, got ${JSON.stringify(stateA.constructionJobs)}`);
  if (inboxLive1.stdout !== "1" || jobsLive1.stdout !== "1") fail(2, `expected 1 inbox row + 1 job row, got inbox=${inboxLive1.stdout} jobs=${jobsLive1.stdout}`);
  record(2, true, `job 1 accepted; state A = ${JSON.stringify(stateA)}; live DB has 1 inbox row, 1 construction job`);

  // ---------------------------------------------------------------- step 3
  step(3, "sqlite3 VACUUM INTO while the server is running (WAL mode)");
  const walBefore = fileNote(`${dbPath}-wal`);
  log(`live journal files before backup: ${walBefore}; ${fileNote(`${dbPath}-shm`)}`);
  if (!existsSync(`${dbPath}-wal`)) fail(3, "no -wal file next to the live DB — the server is not in WAL mode, which is the case this drill exists to prove");
  const journal = sqlite(dbPath, "PRAGMA journal_mode;");
  if (journal.stdout !== "wal") fail(3, `journal_mode reported '${journal.stdout}', expected 'wal'`);
  if (negativeControl) {
    // Deliberately the WRONG backup: the runbook's warned-against naive copy
    // of the main file only, -wal left behind. The drill must then FAIL.
    log(`$ cp ${dbPath} ${backupPath}   # NEGATIVE CONTROL: naive copy, no -wal`);
    copyFileSync(dbPath, backupPath);
  } else {
    const vacuum = sqlite(dbPath, `VACUUM INTO '${backupPath}'`);
    if (vacuum.code !== 0) fail(3, `VACUUM INTO exited ${vacuum.code}`);
  }
  const integrity = sqlite(backupPath, "PRAGMA integrity_check;");
  const inboxBackup = sqlite(backupPath, "SELECT count(*) FROM local_command_inbox;");
  const jobsBackup = sqlite(backupPath, "SELECT building FROM local_construction_jobs;");
  if (integrity.stdout !== "ok") fail(3, `backup integrity_check: ${integrity.stdout}`);
  if (inboxBackup.stdout !== "1" || jobsBackup.stdout !== "timber") fail(3, `backup content wrong: inbox=${inboxBackup.stdout} jobs=${jobsBackup.stdout}`);
  if (existsSync(`${backupPath}-wal`)) fail(3, "backup unexpectedly has a -wal sidecar");
  record(3, true, `backup written while live: ${fileNote(backupPath)}; integrity ok; backup holds 1 inbox row + the timber job; server still up (/api/health ${(await health()).status})`);

  // ---------------------------------------------------------------- step 4
  step(4, "queue a second command so live state diverges from the backup");
  const cmd2 = {
    robloxUserId,
    commandId: "b10a-job-2-quarry",
    expectedWorldVersion: stateA.worldVersion,
    command: { type: "village.build.queue", payload: { villageId: village.id, building: "quarry" } },
  };
  const r2 = await post("/api/roblox/commands", cmd2);
  log(`POST /api/roblox/commands ${cmd2.commandId} -> ${r2.status} ${r2.json.type}`);
  if (r2.status !== 200 || r2.json.type !== "command.accepted") fail(4, `second command not accepted: ${JSON.stringify(r2.json)}`);
  const stateB = digest(await pullState());
  log(`state pull B (after job 2, live, diverged): ${JSON.stringify(stateB)}`);
  const inboxLive2 = sqlite(dbPath, "SELECT count(*) FROM local_command_inbox;");
  // The snapshot lists only `queued` (running) jobs; a second build behind a
  // running one sits `waiting` and is visible in the table, not the pull. So
  // the pull's divergence signal is the world version; the rows prove the job.
  const jobsLive2 = sqlite(dbPath, "SELECT building || ':' || status FROM local_construction_jobs ORDER BY started_at;");
  if (!(stateB.worldVersion > stateA.worldVersion)) fail(4, `world version did not advance: ${JSON.stringify(stateB)}`);
  if (inboxLive2.stdout !== "2") fail(4, `expected 2 live inbox rows, got ${inboxLive2.stdout}`);
  if (jobsLive2.stdout !== "timber:queued\nquarry:waiting") fail(4, `expected timber queued + quarry waiting, got ${JSON.stringify(jobsLive2.stdout)}`);
  const inboxBackupAfter = sqlite(backupPath, "SELECT count(*) FROM local_command_inbox;");
  if (inboxBackupAfter.stdout !== "1") fail(4, `backup changed after live write: inbox=${inboxBackupAfter.stdout}`);
  record(4, true, `live state diverged: version ${stateA.worldVersion} -> ${stateB.worldVersion}; job rows 1 -> 2 (timber queued, quarry waiting); inbox rows 1 -> 2; backup still holds 1 inbox row`);

  // ---------------------------------------------------------------- step 5
  step(5, "stop the server, copy the backup over the DB, delete -wal/-shm, restart");
  const stopped = await stopServer(server);
  server = null;
  log(`journal files after graceful stop: ${fileNote(`${dbPath}-wal`)}; ${fileNote(`${dbPath}-shm`)}`);
  log(`$ cp ${backupPath} ${dbPath}`);
  copyFileSync(backupPath, dbPath);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${dbPath}${suffix}`;
    log(`$ rm -f ${sidecar}  (${existsSync(sidecar) ? "existed, removed" : "already absent"})`);
    rmSync(sidecar, { force: true });
  }
  const restoredInbox = sqlite(dbPath, "SELECT command_id FROM local_command_inbox ORDER BY received_at;");
  if (restoredInbox.stdout !== cmd1.commandId) fail(5, `restored DB inbox is '${restoredInbox.stdout}', expected only '${cmd1.commandId}'`);
  server = startServer();
  const h5 = await waitForHealth();
  record(5, true, `server stopped (code ${stopped.code}, signal ${stopped.signal}); backup copied over DB; sidecars removed; restarted, /api/health ${h5.status}`);

  // ---------------------------------------------------------------- step 6
  step(6, "/api/health 200 and a state pull showing the FIRST job and world version, not the second");
  const h6 = await health();
  log(`GET /api/health -> ${h6.status} ${JSON.stringify(h6.json)}`);
  if (h6.status !== 200 || h6.json?.ok !== true) fail(6, `health after restore: ${h6.status}`);
  const stateC = digest(await pullState());
  log(`state pull C (after restore): ${JSON.stringify(stateC)}`);
  log(`state pull A (before backup):  ${JSON.stringify(stateA)}`);
  const sameVersion = stateC.worldVersion === stateA.worldVersion;
  const sameJobs = JSON.stringify(stateC.constructionJobs) === JSON.stringify(stateA.constructionJobs);
  const noQuarry = !stateC.constructionJobs.some((job) => job.building === "quarry");
  const inboxAfter = sqlite(dbPath, "SELECT command_id FROM local_command_inbox ORDER BY received_at;");
  const jobsAfter = sqlite(dbPath, "SELECT building || ':' || status FROM local_construction_jobs ORDER BY started_at;");
  if (!sameVersion) fail(6, `world version after restore ${stateC.worldVersion} != pre-backup ${stateA.worldVersion} (live had reached ${stateB.worldVersion})`);
  if (!sameJobs || !noQuarry) fail(6, `restored jobs ${JSON.stringify(stateC.constructionJobs)} != state A ${JSON.stringify(stateA.constructionJobs)}`);
  if (inboxAfter.stdout !== cmd1.commandId) fail(6, `inbox after restore '${inboxAfter.stdout}', second command should be gone`);
  if (jobsAfter.stdout !== "timber:queued") fail(6, `construction_jobs after restore ${JSON.stringify(jobsAfter.stdout)}, expected only timber:queued`);
  // Sanity: the restored server is alive for writes too, not just reads.
  const r3 = await post("/api/roblox/commands", { ...cmd2, commandId: "b10a-post-restore-probe", expectedWorldVersion: stateC.worldVersion });
  log(`POST /api/roblox/commands b10a-post-restore-probe -> ${r3.status} ${r3.json.type}`);
  if (r3.status !== 200 || r3.json.type !== "command.accepted") fail(6, `restored server refused a fresh command: ${JSON.stringify(r3.json)}`);
  record(6, true, `restored world = state A exactly (version ${stateC.worldVersion}, jobs ${JSON.stringify(stateC.constructionJobs.map((j) => j.building))}); second job (version ${stateB.worldVersion}, quarry) gone; inbox holds only ${cmd1.commandId}; restored server accepts new writes`);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  log("");
  log(`DRILL FAILED: ${error.message}`);
} finally {
  await stopServer(server);
  log("");
  log("## Result");
  for (const r of results) log(`- step ${r.step}: ${r.ok ? "PASS" : "FAIL"}`);
  const passed = results.filter((r) => r.ok).length;
  const verdict = exitCode === 0 && passed === 6 ? "PASS" : "FAIL";
  log(`B10a ${verdict} (${passed}/6 steps)`);
  if (verdict === "PASS") {
    rmSync(scratch, { recursive: true, force: true });
    log(`scratch dir removed: ${scratch}`);
  } else {
    log(`scratch dir kept for inspection: ${scratch}`);
  }
  process.exit(verdict === "PASS" ? 0 : 1);
}
