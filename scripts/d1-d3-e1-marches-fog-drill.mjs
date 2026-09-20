#!/usr/bin/env node
// D1–D3 / E1 — fog, scouting and the march over HTTP: what a rival can see,
// what a scout report is the only way to learn, the scout-before-attack gate,
// intel freshness, and a march that is server-mustered, paced by its slowest
// unit, replay-proof and outage-proof — all on a real clock.
//
// Matrix rows in docs/verification/2026-09-17-full-game-acceptance-matrix.md:
//   D1  Fog of war in snapshots covers ALL fields incl. realm power + herds
//   D2  Event stream fogged per reader (no free scouting off the wire)
//   D3  Scout-before-attack + intel freshness enforced
//   E1  March launch: server-mustered army, slowest-unit pace, duplicate/outage-proof
// All four were IMPLEMENTED + TESTED and had never been driven over the wire;
// revision 7's §7 list named them together ("need scouts and a march in
// flight"). This drill is that exercise, HTTP-only: no Studio, no PC, no
// phone, no hosting, no battle.
//
// Why this and not C1's warehouse cap (the slice the hand-off preferred): the
// cap cannot be reached honestly in a cheap run. At fixture levels a village
// holds 1200 wood against a 1464 cap and earns 28/h, so the first resource
// reaches the cap after (1464 − 1200) / 28 = 9.43 h of real accrual.
// KINGSAGE_DEV_SEED_LEVEL makes it WORSE at every rung, because storage grows
// 1.22× per Warehouse level while production grows 1.17× per producer level
// (L2: 17.8 h; L10: 65.8 h; L99: 385 h). No knob seeds resources. The only
// short cut is rewinding `last_materialized_at` in the stopped DB, which is a
// simulation and would have to be labelled one. So the cap stays tests-only
// and this drill takes the next slice on the list.
//
// A fresh village has no troops (Adam, 2026-08-22), so scouts and attackers
// ride KINGSAGE_DEV_SEED_ARMY — production code in server/src/index.ts,
// documented DEV ONLY and "a TEST FIXTURE rather than a game rule": it adds the
// same army to every non-Freehold village at world creation. The drill checks
// the knob's own promise (Freeholds stay unarmed) and then runs every rule
// under test — fog, gate, muster, pace, replay, recovery, event filtering,
// freshness — through the production code path over the wire. The seed army
// is deliberately distinctive (20 Berserkers, 10 Squires, 3 Spies, 1 Ram) so a
// fogged zero can never be mistaken for a real garrison.
//
// Three readers: two Roblox-linked players (P1 attacks, P2 is the target) on
// the /api/roblox/* routes, and one web-registered player W (the "watcher") on
// the cookie routes — the event stream (/api/world/events, /api/world/stream)
// only exists on the web door, so D2 can only be shown from there.
//
// Expected march durations, distances and settlement points are imported from
// packages/game-core (the shared rule), as the other drills import costs and
// timers. Expected refusal codes and messages are hard-coded from a reading of
// server/src/store.ts, so the drill is an oracle rather than the server
// checked against itself.
//
// Same posture as the other drills in scripts/: a throwaway world in a fresh
// mkdtemp directory, a throwaway key, a non-4178 port, inherited KINGSAGE_*
// env stripped (then the seed knob set explicitly). Needs only Node 22 + the
// sqlite3 CLI. A few minutes, all of it real march timers.
//
//   node scripts/d1-d3-e1-marches-fog-drill.mjs           # exit 0 = every step PASS
//   MARCH_PORT=4261 node scripts/d1-d3-e1-marches-fog-drill.mjs
//
// Every request, response and shell command is printed so the output can be
// pasted into a dated docs/verification/ note verbatim.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.execArgv.includes("--experimental-strip-types")) {
  const rerun = spawnSync(process.execPath, ["--experimental-strip-types", ...process.argv.slice(1)], { stdio: "inherit" });
  process.exit(rerun.status ?? 1);
}

const { GAME_CONTRACT_VERSION, emptyArmy } = await import("../packages/game-core/src/contracts.ts");
const { distanceBetween, marchDurationSeconds, UNPLANNED_ATTACK_PLAN } = await import("../packages/game-core/src/warfare.ts");
const { settlementPoints } = await import("../packages/game-core/src/economy.ts");
const { UNITS } = await import("../packages/game-core/src/combat.ts");
const { FREEHOLD_GARRISON } = await import("../packages/game-core/src/fixture.ts");

// ---------------------------------------------------------------- the oracle
// Hand-copied from server/src/store.ts. If someone changes a refusal, this
// drill fails on the message - which is the point.
const MSG = {
  SCOUT_REQUIRED: "Scout this village before committing an attack march.",
  INVALID_TARGET: "Choose a foreign village in this world.",
  INVALID_ARMY_MIXED: "Scouting marches may contain scouts only.",
  INVALID_ARMY_KIND: "Send a valid scout or attack formation with at least one troop.",
  INSUFFICIENT_TROOPS: "Those troops are not available in the departure village.",
  FORBIDDEN_MARCH: "That march does not answer to you.",
  MARCH_COMMITTED: "They can see the walls — there is no turning back now.",
  STALE_SCOUT_REPORT: "The defender changed after your report. Scout again before opening battle.",
};
const DEFAULT_AUTO_RESOLVE_MS = 120_000; // server/src/store.ts
const SEED_ARMY = { axe: 20, spear: 10, scout: 3, ram: 1 }; // KINGSAGE_DEV_SEED_ARMY below
const SEED_ARMY_ENV = "axe:20,spear:10,scout:3,ram:1";
const FIXTURE_RESOURCES = { wood: 1200, stone: 1000, iron: 800 };
const TROOPS = Object.keys(emptyArmy());
const FOG_ZERO_FIELDS = ["realmOfPower", "realmOfPowerMax", "horses", "horsesMax"];
const PRIVATE_EVENT_TYPES = ["march.changed", "march.arrived", "march.completed", "scout.report.ready", "recruitment.queued", "research.queued", "battle.started", "battle.retreated", "battle.resolved"];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = join(repoRoot, "server");
const port = Number(process.env.MARCH_PORT ?? 4261);
// Throwaway key for a throwaway world. Not a secret; never reused anywhere.
const robloxKey = "marches-throwaway-key-0001";

const scratch = mkdtempSync(join(tmpdir(), "kingsmarch-marches-"));
const dbPath = join(scratch, "world.sqlite");
const results = [];
const TOTAL_STEPS = 10;
let server = null;

const log = (line = "") => process.stdout.write(`${line}\n`);
const step = (n, title) => { log(""); log(`## Step ${n} — ${title}`); };
function record(n, ok, detail) { results.push({ step: n, ok, detail }); log(`[step ${n}] ${ok ? "PASS" : "FAIL"} — ${detail}`); }
function fail(n, detail) { record(n, false, detail); throw new Error(`step ${n} failed: ${detail}`); }
function expect(n, condition, detail) { if (!condition) fail(n, detail); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shorten = (text, max = 400) => (text.length > max ? `${text.slice(0, max)}… (${text.length} bytes)` : text);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const army = (partial) => ({ ...emptyArmy(), ...partial });
const addArmies = (a, b) => Object.fromEntries(TROOPS.map((t) => [t, (a[t] ?? 0) + (b[t] ?? 0)]));
const subArmies = (a, b) => Object.fromEntries(TROOPS.map((t) => [t, (a[t] ?? 0) - (b[t] ?? 0)]));
const compact = (a) => JSON.stringify(Object.fromEntries(TROOPS.filter((t) => a[t]).map((t) => [t, a[t]])));
const ms = (iso) => Date.parse(iso);
const secondsBetween = (a, b) => (ms(b) - ms(a)) / 1000;

function sqlite(sql) {
  const run = spawnSync("sqlite3", [dbPath, sql], { encoding: "utf8" });
  log(`$ sqlite3 <db> ${JSON.stringify(sql)}`);
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
  if (out) log(out.split("\n").map((l) => `  ${l}`).join("\n"));
  log(`  -> exit ${run.status}`);
  return (run.stdout ?? "").trim();
}

async function request(method, path, body, { key = robloxKey, cookie, quiet = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (key !== null && !cookie) headers["x-kingsage-key"] = key;
  if (cookie) headers.cookie = cookie;
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    if (!quiet) log(`${method} ${path} -> connection refused (${error.cause?.code ?? error.message})`);
    return { status: 0, json: null, text: "", headers: new Headers() };
  }
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  if (!quiet) log(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ""}${cookie ? " (web session cookie)" : ""} -> ${response.status} ${shorten(text)}`);
  return { status: response.status, json, text, headers: response.headers };
}

function startServer(label = "world server") {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("KINGSAGE_")) env[k] = v;
  Object.assign(env, { KINGSAGE_DATABASE_PATH: dbPath, KINGSAGE_ROBLOX_KEY: robloxKey, KINGSAGE_BIND: "127.0.0.1", PORT: String(port), KINGSAGE_DEV_SEED_ARMY: SEED_ARMY_ENV });
  log(`$ (cd server && KINGSAGE_DATABASE_PATH=${dbPath} KINGSAGE_ROBLOX_KEY=<throwaway> KINGSAGE_DEV_SEED_ARMY=${SEED_ARMY_ENV} KINGSAGE_BIND=127.0.0.1 PORT=${port} node --experimental-strip-types src/index.ts &)   # ${label}`);
  const child = spawn(process.execPath, ["--experimental-strip-types", "src/index.ts"], { cwd: serverRoot, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => log(`  [server] ${String(chunk).trimEnd()}`));
  child.stderr.on("data", (chunk) => { const text = String(chunk).trimEnd(); if (!text.includes("ExperimentalWarning") && !text.includes("--trace-warnings")) log(`  [server:err] ${text}`); });
  child.exited = new Promise((done) => child.once("exit", (code, signal) => done({ code, signal })));
  child.startedAt = new Date().toISOString();
  server = child;
  return child;
}

async function waitForHealth(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const probe = await request("GET", "/api/health", undefined, { key: null, quiet: true });
    if (probe.status === 200) return probe;
    await sleep(100);
  }
  throw new Error(`no /api/health 200 from port ${port} within ${timeoutMs}ms`);
}

async function stopServer(label = "world server") {
  const child = server;
  if (!child) return null;
  server = null;
  if (child.exitCode !== null || child.signalCode !== null) return null;
  log(`$ kill -TERM <${label} pid ${child.pid}>`);
  child.kill("SIGTERM");
  const outcome = await Promise.race([child.exited, sleep(10_000).then(() => ({ code: null, signal: "TIMEOUT" }))]);
  if (outcome.signal === "TIMEOUT") { child.kill("SIGKILL"); await child.exited; }
  const at = new Date().toISOString();
  log(`  -> ${label} exited (code ${outcome.code}, signal ${outcome.signal}) at ${at}`);
  return at;
}

// ------------------------------------------------------------ the two doors
async function pullState(player, { quiet = false } = {}) {
  const result = await request("POST", "/api/roblox/state", { robloxUserIds: [player.userId] }, { quiet: true });
  if (result.status !== 200) throw new Error(`/api/roblox/state -> ${result.status} ${result.text}`);
  const state = result.json.states[String(player.userId)];
  if (!quiet) log(`POST /api/roblox/state {"robloxUserIds":[${player.userId}]} -> 200 (${result.text.length} bytes; marches ${state.marches.length}, scoutReports ${state.scoutReports.length}, notifications ${state.notifications.length})`);
  return state;
}

async function webSnapshot(player, { quiet = false } = {}) {
  const result = await request("GET", "/api/world/snapshot", undefined, { cookie: player.cookie, quiet: true });
  if (result.status !== 200) throw new Error(`/api/world/snapshot -> ${result.status} ${result.text}`);
  if (!quiet) log(`GET /api/world/snapshot (web session cookie) -> 200 (${result.text.length} bytes; marches ${result.json.marches.length}, scoutReports ${result.json.scoutReports.length})`);
  return result.json;
}

async function webEvents(player, since = 0) {
  const result = await request("GET", `/api/world/events?since=${since}`, undefined, { cookie: player.cookie, quiet: true });
  if (result.status !== 200) throw new Error(`/api/world/events -> ${result.status} ${result.text}`);
  const types = result.json.events.map((e) => e.type);
  log(`GET /api/world/events?since=${since} (web session cookie) -> 200 currentWorldVersion ${result.json.currentWorldVersion}; ${types.length} events: ${JSON.stringify(types)}`);
  return result.json;
}

function ownVillage(state) {
  const village = state.world.villages.find((v) => v.kingdomId === state.kingdom.id);
  if (!village) throw new Error("no village belongs to the player's kingdom");
  return village;
}

async function link(player) {
  const res = await request("POST", "/api/roblox/session", { robloxUserId: player.userId, displayName: player.name });
  if (res.status !== 200 || res.json.created !== true) throw new Error(`link ${player.tag}: ${res.status} ${res.text}`);
  player.playerId = res.json.playerId;
  player.kingdomId = res.json.kingdomId;
  const state = await pullState(player, { quiet: true });
  player.villageId = ownVillage(state).id;
  player.snapshot = () => pullState(player, { quiet: true });
  return state;
}

async function registerWeb(player) {
  const res = await request("POST", "/api/auth/register", { username: player.username, password: player.password, kingdomName: player.kingdomName });
  if (res.status !== 201) throw new Error(`register ${player.tag}: ${res.status} ${res.text}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  player.cookie = setCookie.split(";")[0];
  log(`  set-cookie: ${setCookie.replace(/=[^;]+/, "=<session token>")}`);
  player.playerId = res.json.player.id;
  player.kingdomId = res.json.player.kingdomId;
  const snap = await webSnapshot(player, { quiet: true });
  player.villageId = ownVillage(snap).id;
  player.worldId = snap.world.id;
  player.snapshot = () => webSnapshot(player, { quiet: true });
  return snap;
}

// The world version is global and moves with every accepted command (by
// anyone) and every march arrival, so each command reads the current version
// first. A conflict that still slips in (a march landing between the read and
// the write) is logged and retried once under a suffixed commandId - the
// refused id stays in the inbox, so it cannot be reused.
async function command(player, commandId, cmd, { quiet = false, retry = true } = {}) {
  const version = (await player.snapshot()).world.version;
  let body; let res;
  if (player.cookie) {
    body = { contractVersion: GAME_CONTRACT_VERSION, commandId, worldId: player.worldId, actorPlayerId: player.playerId, expectedWorldVersion: version, issuedAt: new Date().toISOString(), command: cmd };
    res = await request("POST", "/api/world/commands", body, { cookie: player.cookie, quiet });
  } else {
    body = { robloxUserId: player.userId, commandId, expectedWorldVersion: version, command: cmd };
    res = await request("POST", "/api/roblox/commands", body, { quiet });
  }
  if (retry && res.status === 409 && res.json?.payload?.code === "WORLD_VERSION_CONFLICT") {
    log(`(WORLD_VERSION_CONFLICT on ${commandId}: the world moved between the version read and the write; retrying once as ${commandId}-retry)`);
    return command(player, `${commandId}-retry`, cmd, { quiet, retry: false });
  }
  return { ...res, body, sentAt: new Date().toISOString() };
}

const launch = (player, id, kind, targetVillageId, force, extra = {}) =>
  command(player, id, { type: "march.launch", payload: { fromVillageId: player.villageId, targetVillageId, kind, army: army(force), ...extra } });

// ----------------------------------------------------------------- the DB
function villageRow(villageId) {
  const raw = sqlite(`SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || horses || '|' || state_version || '|' || name FROM local_villages WHERE id = '${villageId}';`);
  const [resources, buildings, armyJson, realmOfPower, horses, stateVersion, name] = raw.split("|");
  return { resources: JSON.parse(resources), buildings: JSON.parse(buildings), army: JSON.parse(armyJson), realmOfPower: Number(realmOfPower), horses: Number(horses), stateVersion: Number(stateVersion), name };
}

function marchRows(kingdomId) {
  const raw = sqlite(`SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || departed_at || '|' || arrives_at || '|' || target_village_id FROM local_marches WHERE kingdom_id = '${kingdomId}' ORDER BY rowid;`);
  return raw.split("\n").filter(Boolean).map((line) => { const [id, kind, status, armyJson, departedAt, arrivesAt, targetVillageId] = line.split("|"); return { id, kind, status, army: JSON.parse(armyJson), departedAt, arrivesAt, targetVillageId }; });
}

const count = (table, where = "1=1") => Number(sqlite(`SELECT count(*) FROM ${table} WHERE ${where};`));

function isFogged(village) {
  return Object.values(village.resources).every((v) => v === 0)
    && Object.values(village.buildings).every((v) => v === 0)
    && TROOPS.every((t) => village.army[t] === 0)
    && FOG_ZERO_FIELDS.every((f) => village[f] === 0);
}

function fogReport(village) {
  return `resources ${JSON.stringify(village.resources)}, buildings all ${Object.values(village.buildings).every((v) => v === 0) ? "0" : JSON.stringify(village.buildings)}, army ${compact(village.army) === "{}" ? "empty" : compact(village.army)}, realmOfPower ${village.realmOfPower}/${village.realmOfPowerMax}, horses ${village.horses}/${village.horsesMax}`;
}

// A live SSE reader on /api/world/stream. Collects every pushed event until
// closed; the `ready` frame is the server saying the replay is done.
async function openStream(player, since) {
  const controller = new AbortController();
  const response = await fetch(`http://127.0.0.1:${port}/api/world/stream?since=${since}`, { headers: { cookie: player.cookie }, signal: controller.signal });
  log(`GET /api/world/stream?since=${since} (web session cookie, ${player.tag}) -> ${response.status} ${response.headers.get("content-type")}`);
  const stream = { events: [], ready: null, closed: false };
  let readyResolve;
  stream.readyPromise = new Promise((r) => { readyResolve = r; });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  stream.pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = frame.split("\n");
          const name = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
          const data = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
          if (!data) continue;
          const parsed = JSON.parse(data);
          if (name === "ready") { stream.ready = parsed; readyResolve(parsed); } else stream.events.push(parsed);
        }
      }
    } catch (error) {
      if (error.name !== "AbortError") throw error;
    }
  })();
  stream.close = async () => { controller.abort(); stream.closed = true; await stream.pump.catch(() => {}); };
  return stream;
}

// ------------------------------------------------------------------ main
async function main() {
  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
  log(`# D1–D3 / E1 — fog, scouting and the march over HTTP (current tip)`);
  log(`date: ${new Date().toISOString()}`);
  log(`sha: ${sha}`);
  log(`node: ${process.version}`);
  log(`sqlite3: ${spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).stdout.trim()}`);
  log(`scratch: ${scratch}`);
  log(`port: ${port}`);

  const P1 = { userId: 960001, name: "March One", tag: "p1" };
  const P2 = { userId: 960002, name: "March Two", tag: "p2" };
  const W = { username: "watcher", password: "Correct-Horse-9", kingdomName: "The Watchers", tag: "w" };
  const seed = army(SEED_ARMY);

  // ------------------------------------------------------------------ 1
  step(1, "fresh disposable world with KINGSAGE_DEV_SEED_ARMY; P1 and P2 linked through the Roblox door, W registered through the web door; every non-Freehold village holds exactly the seed army, every Freehold only the fixture's own 10 Squires");
  expect(1, !existsSync(dbPath), `scratch DB already exists at ${dbPath}`);
  startServer();
  const h1 = await waitForHealth();
  log(`GET /api/health -> ${h1.status} ${h1.text}`);
  expect(1, h1.json?.ok === true && h1.json?.service === "kingsage-world", `unexpected health body ${h1.text}`);
  const s1 = await link(P1);
  await link(P2);
  await registerWeb(W);
  for (const p of [P1, P2, W]) log(`${p.tag}: ${p.playerId} / ${p.kingdomId} / ${p.villageId}`);
  // Re-pulled after every seat is claimed: a claim renames the seat's village
  // ("Open Seat 2" → "<kingdom> Keep"), and the notifications quote that name.
  const s1b = await P1.snapshot();
  const home = ownVillage(s1);
  const target = s1b.world.villages.find((v) => v.id === P2.villageId);
  expect(1, same(home.army, seed), `p1's own army ${compact(home.army)} != seed ${compact(seed)} (a fresh village has no troops; the seed adds exactly these)`);
  expect(1, same(home.resources, FIXTURE_RESOURCES), `seed touched resources: ${JSON.stringify(home.resources)}`);
  const armed = sqlite("SELECT k.seat_kind || '|' || v.id || '|' || v.army_json FROM local_villages v JOIN local_kingdoms k ON k.id = v.kingdom_id ORDER BY v.id;").split("\n").filter(Boolean).map((l) => { const [seatKind, id, a] = l.split("|"); return { seatKind, id, army: JSON.parse(a) }; });
  const freeholds = armed.filter((r) => r.seatKind === "freehold");
  const others = armed.filter((r) => r.seatKind !== "freehold");
  // A Freehold keeps the fixture's own garrison (10 Squires); the seed adds nothing to it.
  expect(1, freeholds.length === 4 && freeholds.every((r) => same(r.army, FREEHOLD_GARRISON)), `Freeholds do not hold exactly the fixture garrison ${compact(FREEHOLD_GARRISON)}: ${JSON.stringify(freeholds.map((r) => [r.id, compact(r.army)]))}`);
  expect(1, others.length === 6 && others.every((r) => same(r.army, seed)), `a non-Freehold village does not hold the seed army: ${JSON.stringify(others.map((r) => [r.id, compact(r.army)]))}`);
  const distance = distanceBetween(home, target);
  log(`p1 home ${home.id} at (${home.x},${home.y}); p2 target ${target.id} "${target.name}" at (${target.x},${target.y}); distance ${distance.toFixed(4)} tiles`);
  log(`expected march times over that distance: scout ${marchDurationSeconds(distance, "scout", army({ scout: 1 }))}s (Spy speed ${UNITS.scout.speed}), attack of Berserkers ${marchDurationSeconds(distance, "attack", army({ axe: 10 }))}s (speed ${UNITS.axe.speed}), attack of Berserkers + 1 Ram ${marchDurationSeconds(distance, "attack", army({ axe: 5, ram: 1 }))}s (Ram speed ${UNITS.ram.speed}), scouts' return ${marchDurationSeconds(distance, "return", army({ scout: 1 }))}s`);
  record(1, true, `health 200; p1 → ${P1.kingdomId}, p2 → ${P2.kingdomId}, w → ${W.kingdomId}; seed army ${compact(seed)} on all 6 non-Freehold villages, 4 Freeholds at the fixture's ${compact(FREEHOLD_GARRISON)} (the knob added nothing), resources untouched; p1↔p2 distance ${distance.toFixed(4)} tiles`);

  // ------------------------------------------------------------------ 2
  step(2, "D1 — fog in the snapshot, all three readers, both doors: every foreign village reads zero in resources, all 13 buildings, all 11 troops, realmOfPower, realmOfPowerMax, horses and horsesMax while the DB row holds real numbers; the owner's own village equals its row");
  const p2Row = villageRow(P2.villageId);
  expect(2, same(p2Row.resources, FIXTURE_RESOURCES) && p2Row.buildings.hq === 1 && same(p2Row.army, seed) && p2Row.realmOfPower >= 1, `p2's row is not what the fog must hide: ${JSON.stringify(p2Row)}`);
  const fogSummary = [];
  for (const reader of [P1, P2, W]) {
    const snap = await reader.snapshot();
    const foreign = snap.world.villages.filter((v) => v.kingdomId !== reader.kingdomId);
    const own = snap.world.villages.filter((v) => v.kingdomId === reader.kingdomId);
    expect(2, foreign.length === 9 && own.length === 1, `${reader.tag} sees ${foreign.length} foreign + ${own.length} own villages`);
    const leaks = foreign.filter((v) => !isFogged(v));
    expect(2, leaks.length === 0, `${reader.tag} sees unfogged foreign villages: ${JSON.stringify(leaks.map((v) => [v.id, fogReport(v)]))}`);
    expect(2, foreign.every((v) => typeof v.name === "string" && Number.isInteger(v.x) && Number.isInteger(v.y) && typeof v.kingdomId === "string"), `${reader.tag}: a fogged village lost its place on the map`);
    const row = villageRow(reader.villageId);
    expect(2, same(own[0].resources, row.resources) && same(own[0].buildings, row.buildings) && same(own[0].army, row.army) && own[0].realmOfPower === row.realmOfPower && own[0].realmOfPowerMax === settlementPoints(row.buildings), `${reader.tag}'s own village differs from its row: ${JSON.stringify(own[0])} vs ${JSON.stringify(row)}`);
    expect(2, snap.marches.length === 0 && snap.scoutReports.length === 0, `${reader.tag} starts with marches/reports`);
    const p2View = snap.world.villages.find((v) => v.id === P2.villageId);
    log(`${reader.tag} (${reader.cookie ? "web" : "roblox"} door) sees ${foreign.length} foreign villages fogged; p2's village as ${reader.tag} sees it: ${reader.tag === "p2" ? "own — " : ""}${fogReport(p2View)}`);
    fogSummary.push(`${reader.tag}: 9 foreign fogged, own equals row`);
  }
  record(2, true, `${fogSummary.join("; ")}; p2's row meanwhile: resources ${JSON.stringify(p2Row.resources)}, hq ${p2Row.buildings.hq}, army ${compact(p2Row.army)}, realm_of_power ${p2Row.realmOfPower}`);

  // ------------------------------------------------------------------ 3
  step(3, "D3 — the gate and the shape checks, all refused and stored: an attack on a village nobody scouted → SCOUT_REQUIRED; own village as target → INVALID_TARGET; a scout march with Squires in it → INVALID_ARMY; kind 'support' → INVALID_ARMY; more Spies than the village holds → INSUFFICIENT_TROOPS; nothing leaves home, no march row, world version unchanged; SCOUT_REQUIRED replayed byte-identically");
  const before3 = villageRow(P1.villageId);
  const version3 = (await P1.snapshot()).world.version;
  const inbox3 = count("local_command_inbox");
  const refusals = [
    ["blind", () => launch(P1, "march-p1-attack-blind", "attack", P2.villageId, { axe: 10 }), "SCOUT_REQUIRED", MSG.SCOUT_REQUIRED],
    ["self", () => launch(P1, "march-p1-scout-self", "scout", P1.villageId, { scout: 1 }), "INVALID_TARGET", MSG.INVALID_TARGET],
    ["mixed", () => launch(P1, "march-p1-scout-mixed", "scout", P2.villageId, { scout: 1, spear: 5 }), "INVALID_ARMY", MSG.INVALID_ARMY_MIXED],
    ["support", () => launch(P1, "march-p1-support", "support", P2.villageId, { spear: 5 }), "INVALID_ARMY", MSG.INVALID_ARMY_KIND],
    ["too-many", () => launch(P1, "march-p1-scout-4", "scout", P2.villageId, { scout: SEED_ARMY.scout + 1 }), "INSUFFICIENT_TROOPS", MSG.INSUFFICIENT_TROOPS],
  ];
  const got3 = {};
  for (const [label, send, code, message] of refusals) {
    const res = await send();
    expect(3, res.status === 409 && res.json?.type === "command.rejected" && res.json.payload.code === code && res.json.payload.message === message, `${label}: expected 409 ${code} "${message}", got ${res.status} ${res.text}`);
    got3[label] = res;
  }
  expect(3, count("local_command_inbox") - inbox3 === refusals.length, `expected ${refusals.length} stored rejections`);
  expect(3, count("local_marches") === 0, "a refusal created a march row");
  const after3 = villageRow(P1.villageId);
  expect(3, same(after3.army, before3.army), `refusals moved troops: ${compact(before3.army)} → ${compact(after3.army)}`);
  expect(3, (await P1.snapshot()).world.version === version3, "refusals moved the world version");
  const replay3 = await request("POST", "/api/roblox/commands", got3.blind.body);
  expect(3, replay3.status === 409 && replay3.text === got3.blind.text, `SCOUT_REQUIRED replay differs: ${replay3.text}`);
  expect(3, count("local_command_inbox") - inbox3 === refusals.length, "replay added an inbox row");
  record(3, true, `${refusals.map(([label, , code]) => `${label} → 409 ${code} "${got3[label].json.payload.message}"`).join("; ")}; ${refusals.length} inbox rows, 0 march rows, army ${compact(after3.army)} unchanged, world version ${version3} unchanged; SCOUT_REQUIRED replayed byte-identically`);

  // ------------------------------------------------------------------ 4
  step(4, "E1 — p1 sends one Spy at p2's village: accepted, the march row and the snapshot agree, the Spy has left the village (server-mustered), arrivesAt − departedAt equals marchDurationSeconds(distance, 'scout', {scout:1}) from game-core; the same commandId replayed with a stale world version returns the byte-identical result and launches nothing");
  const before4 = villageRow(P1.villageId);
  const scoutRes = await launch(P1, "march-p1-scout-p2", "scout", P2.villageId, { scout: 1 });
  expect(4, scoutRes.status === 200 && scoutRes.json?.type === "command.accepted" && scoutRes.json.payload.march?.kind === "scout" && scoutRes.json.payload.march.status === "outbound", `scout launch: ${scoutRes.status} ${scoutRes.text}`);
  const scoutMarch = scoutRes.json.payload.march;
  const scoutExpectedS = marchDurationSeconds(distance, "scout", army({ scout: 1 }));
  expect(4, secondsBetween(scoutMarch.departedAt, scoutMarch.arrivesAt) === scoutExpectedS, `scout timer ${secondsBetween(scoutMarch.departedAt, scoutMarch.arrivesAt)}s != ${scoutExpectedS}s`);
  expect(4, same(scoutMarch.army, army({ scout: 1 })) && same(scoutMarch.loot, { wood: 0, stone: 0, iron: 0 }) && scoutMarch.battleId === null, `march payload ${JSON.stringify(scoutMarch)}`);
  const after4 = villageRow(P1.villageId);
  expect(4, same(after4.army, subArmies(before4.army, army({ scout: 1 }))), `muster: village army ${compact(before4.army)} → ${compact(after4.army)}`);
  const rows4 = marchRows(P1.kingdomId);
  expect(4, rows4.length === 1 && rows4[0].id === scoutMarch.id && rows4[0].status === "outbound" && rows4[0].arrivesAt === scoutMarch.arrivesAt && same(rows4[0].army, scoutMarch.army), `march rows ${JSON.stringify(rows4)}`);
  const snap4 = await pullState(P1);
  expect(4, snap4.marches.length === 1 && snap4.marches[0].id === scoutMarch.id && same(snap4.marches[0], scoutMarch) && ownVillage(snap4).army.scout === SEED_ARMY.scout - 1, `snapshot marches ${JSON.stringify(snap4.marches)}`);
  const inbox4 = count("local_command_inbox");
  const replay4 = await request("POST", "/api/roblox/commands", scoutRes.body);
  expect(4, replay4.status === 200 && replay4.text === scoutRes.text, `replay differs: ${replay4.text}`);
  expect(4, count("local_marches") === 1 && count("local_command_inbox") === inbox4 && villageRow(P1.villageId).army.scout === SEED_ARMY.scout - 1, "the replay launched a second wave or charged a second Spy");
  const p2View4 = await P2.snapshot();
  expect(4, p2View4.marches.length === 0 && p2View4.scoutReports.length === 0 && ownVillage(p2View4).army.scout === SEED_ARMY.scout, "p2 can see p1's march or lost a Spy");
  record(4, true, `scout ${scoutMarch.id} outbound, departed ${scoutMarch.departedAt}, arrives ${scoutMarch.arrivesAt} (${scoutExpectedS}s = 8 + ${distance.toFixed(4)} × 0.8 × ${UNITS.scout.speed}/18, rounded); village Spies ${before4.army.scout} → ${after4.army.scout} at launch; replay with expectedWorldVersion ${scoutRes.body.expectedWorldVersion} byte-identical, still 1 march row, still ${after4.army.scout} Spies; p2 sees no march, no report, all ${SEED_ARMY.scout} of its Spies`);

  // ------------------------------------------------------------------ 5
  step(5, "E1 — outage-proof: the server is stopped while the Spy is on the road and stays down past arrivesAt; while down the DB row is frozen (still 'outbound', no report); after the restart the very first pull carries the scout report stamped with the ORIGINAL arrivesAt, the march is 'returning', and the launch commandId still replays byte-identically");
  await sleep(1_000);
  const stoppedAt = await stopServer();
  expect(5, ms(stoppedAt) < ms(scoutMarch.arrivesAt), `the server stopped at ${stoppedAt}, after the Spy's ${scoutMarch.arrivesAt} — the outage did not straddle the arrival`);
  const frozen = marchRows(P1.kingdomId);
  expect(5, frozen.length === 1 && frozen[0].status === "outbound" && frozen[0].arrivesAt === scoutMarch.arrivesAt, `march row moved while the server was down: ${JSON.stringify(frozen)}`);
  expect(5, count("local_scout_reports") === 0, "a scout report appeared with no server running");
  const downFor = ms(scoutMarch.arrivesAt) + 2_500 - Date.now();
  log(`server down; waiting ${Math.max(0, Math.round(downFor / 1000))}s so the Spy's arrivesAt ${scoutMarch.arrivesAt} passes with nobody home to record it`);
  if (downFor > 0) await sleep(downFor);
  const frozenStill = marchRows(P1.kingdomId);
  expect(5, frozenStill[0].status === "outbound" && count("local_scout_reports") === 0, `something materialized the march while down: ${JSON.stringify(frozenStill)}`);
  startServer("world server (restart, same DB)");
  const restartedAt = new Date().toISOString();
  const h5 = await waitForHealth();
  log(`GET /api/health -> ${h5.status} ${h5.text} (restart requested ${restartedAt})`);
  const first5 = await pullState(P1);
  const pulledAt = new Date().toISOString();
  const report = first5.scoutReports.find((r) => r.marchId === scoutMarch.id);
  expect(5, report, `no scout report for ${scoutMarch.id} after the restart: ${JSON.stringify(first5.scoutReports)}`);
  expect(5, report.createdAt === scoutMarch.arrivesAt, `report createdAt ${report.createdAt} != the Spy's arrivesAt ${scoutMarch.arrivesAt} (catch-up must stamp the arrival, not 'now')`);
  const returning = first5.marches.find((m) => m.id === scoutMarch.id);
  expect(5, returning?.status === "returning" && returning.departedAt === scoutMarch.departedAt, `march after restart ${JSON.stringify(returning)}`);
  const returnS = marchDurationSeconds(distance, "return", army({ scout: 1 }));
  const returnLegStart = ms(returning.arrivesAt) - returnS * 1000;
  // Observed, not judged: the homeward leg is measured from the moment the
  // server caught up, not from the arrival the report itself is stamped with.
  expect(5, returnLegStart >= ms(restartedAt) - 1_000 && returnLegStart <= ms(pulledAt) + 1, `return leg start ${new Date(returnLegStart).toISOString()} is outside the restart window ${restartedAt}..${pulledAt}`);
  const lateBy = ((returnLegStart - ms(scoutMarch.arrivesAt)) / 1000).toFixed(3);
  log(`return leg: arrivesAt ${returning.arrivesAt} − ${returnS}s = ${new Date(returnLegStart).toISOString()}, i.e. the homeward walk began ${lateBy}s AFTER the arrival it reported (the leg is measured from catch-up, not from the arrival; observed, not judged)`);
  const note5 = first5.notifications.find((n) => n.kind === "scout" && n.message === `Scout report ready: ${target.name}.`);
  expect(5, note5 && note5.createdAt === scoutMarch.arrivesAt, `scout notification ${JSON.stringify(note5)} not stamped at ${scoutMarch.arrivesAt}`);
  const replay5 = await request("POST", "/api/roblox/commands", scoutRes.body);
  expect(5, replay5.status === 200 && replay5.text === scoutRes.text, `post-restart replay differs: ${replay5.text}`);
  expect(5, count("local_marches") === 1 && count("local_scout_reports") === 1, "the post-restart replay launched or reported again");
  record(5, true, `stopped ${stoppedAt} (Spy due ${scoutMarch.arrivesAt}); row frozen 'outbound' with no report for the whole outage; restarted ${restartedAt}; first pull: report ${report.id} createdAt == arrivesAt exactly, notification "${note5.message}" at arrivesAt, march 'returning' (homeward ${returnS}s leg began ${lateBy}s after the arrival — observed, not judged); launch replay byte-identical; 1 march, 1 report`);

  // ------------------------------------------------------------------ 6
  step(6, "D1 — the report is the only way past the fog: observedArmy / observedBuildings / observedRealmOfPower equal p2's DB row (the distinctive seed army, not zeros), observedResources within the 28/h trickle, targetVillageVersion equals the row; in the SAME snapshot p2's village is still fogged; p2 has no report, no march, no notification, and every Spy");
  const row6 = villageRow(P2.villageId);
  expect(6, same(report.observedArmy, row6.army) && same(report.observedArmy, seed), `observedArmy ${compact(report.observedArmy)} != row ${compact(row6.army)}`);
  expect(6, same(report.observedBuildings, row6.buildings), `observedBuildings ${JSON.stringify(report.observedBuildings)} != row ${JSON.stringify(row6.buildings)}`);
  expect(6, ["wood", "stone", "iron"].every((k) => Math.abs(report.observedResources[k] - row6.resources[k]) <= 1), `observedResources ${JSON.stringify(report.observedResources)} vs row ${JSON.stringify(row6.resources)}`);
  expect(6, report.observedRealmOfPower >= 1 && report.observedRealmOfPowerMax === settlementPoints(row6.buildings) && report.observedRealmOfPower <= report.observedRealmOfPowerMax, `realm power ${report.observedRealmOfPower}/${report.observedRealmOfPowerMax} vs settlementPoints ${settlementPoints(row6.buildings)}`);
  expect(6, report.targetVillageVersion === row6.stateVersion && report.targetVillageName === row6.name && report.targetVillageId === P2.villageId, `report identity ${JSON.stringify([report.targetVillageVersion, report.targetVillageName])} vs row ${JSON.stringify([row6.stateVersion, row6.name])}`);
  const stillFogged = first5.world.villages.find((v) => v.id === P2.villageId);
  expect(6, isFogged(stillFogged), `the snapshot that carries the report un-fogged the target: ${fogReport(stillFogged)}`);
  log(`report ${report.id}: observedArmy ${compact(report.observedArmy)}, observedBuildings ${JSON.stringify(report.observedBuildings)}, observedResources ${JSON.stringify(report.observedResources)}, realm power ${report.observedRealmOfPower}/${report.observedRealmOfPowerMax}, targetVillageVersion ${report.targetVillageVersion}; same snapshot's world.villages entry for ${P2.villageId}: ${fogReport(stillFogged)}`);
  const p2View6 = await P2.snapshot();
  expect(6, p2View6.marches.length === 0 && p2View6.scoutReports.length === 0 && p2View6.notifications.length === 0 && same(ownVillage(p2View6).army, seed), `p2's view after being scouted: marches ${p2View6.marches.length}, reports ${p2View6.scoutReports.length}, notifications ${JSON.stringify(p2View6.notifications)}, army ${compact(ownVillage(p2View6).army)}`);
  record(6, true, `report equals p2's row: army ${compact(report.observedArmy)}, buildings hq ${report.observedBuildings.hq}/wall ${report.observedBuildings.wall}, resources within 1 of ${JSON.stringify(row6.resources)}, realm power ${report.observedRealmOfPower}/${report.observedRealmOfPowerMax} (= settlementPoints), version ${report.targetVillageVersion}; the same snapshot still fogs the village to zeros; p2 sees no march, no report, no notification (nothing tells a village it was scouted — observed, not judged) and holds all ${SEED_ARMY.scout} Spies`);

  // ------------------------------------------------------------------ 7
  step(7, "D2 + E1 — the event stream wears the reader's fog: W's /api/world/events?since=0 carries the public kingdom.claimed rows and none of p1's march or report events although the DB holds them; a live /api/world/stream for W receives nothing when p1 launches two attacks (Berserkers alone; Berserkers + one Ram, paced by the Ram) and receives W's own march.changed the moment W scouts; both attacks are accepted only because p2 was scouted; muster and troop conservation hold");
  const events7 = await webEvents(W, 0);
  const privateSeen = events7.events.filter((e) => PRIVATE_EVENT_TYPES.includes(e.type));
  expect(7, privateSeen.length === 0, `W's replay leaks private events: ${JSON.stringify(privateSeen.map((e) => e.type))}`);
  const claimed = events7.events.filter((e) => e.type === "kingdom.claimed");
  expect(7, claimed.length === 3 && same(claimed.map((e) => e.payload.kingdomId).sort(), [P1.kingdomId, P2.kingdomId, W.kingdomId].sort()), `kingdom.claimed events ${JSON.stringify(claimed.map((e) => e.payload))}`);
  const foreignVillageEvents = events7.events.filter((e) => e.payload?.village && e.payload.village.kingdomId !== W.kingdomId);
  expect(7, foreignVillageEvents.every((e) => isFogged(e.payload.village)), `a foreign village rode an event unfogged: ${JSON.stringify(foreignVillageEvents.map((e) => [e.type, fogReport(e.payload.village)]))}`);
  const privateInDb = Number(sqlite("SELECT count(*) FROM local_world_events WHERE event_type IN ('march.changed','scout.report.ready');"));
  expect(7, privateInDb >= 2, `the DB should hold p1's march.changed (launch, arrival→returning) and scout.report.ready rows, has ${privateInDb}`);
  const wStream = await openStream(W, events7.currentWorldVersion);
  await Promise.race([wStream.readyPromise, sleep(3_000)]);
  expect(7, wStream.ready && wStream.events.length === 0, `stream not ready or replayed events past since=${events7.currentWorldVersion}: ${JSON.stringify(wStream.events.map((e) => e.type))}`);
  log(`W's stream ready: ${JSON.stringify(wStream.ready)}`);

  const before7 = villageRow(P1.villageId);
  const attackA = await launch(P1, "march-p1-attack-axes", "attack", P2.villageId, { axe: 10 });
  expect(7, attackA.status === 200 && attackA.json?.payload?.march?.kind === "attack" && attackA.json.payload.march.status === "outbound", `attack A: ${attackA.status} ${attackA.text}`);
  const A = attackA.json.payload.march;
  const aExpectedS = marchDurationSeconds(distance, "attack", army({ axe: 10 }));
  expect(7, secondsBetween(A.departedAt, A.arrivesAt) === aExpectedS, `attack A timer ${secondsBetween(A.departedAt, A.arrivesAt)}s != ${aExpectedS}s`);
  const attackB = await launch(P1, "march-p1-attack-axes-ram", "attack", P2.villageId, { axe: 5, ram: 1 });
  expect(7, attackB.status === 200 && attackB.json?.payload?.march?.status === "outbound", `attack B: ${attackB.status} ${attackB.text}`);
  const B = attackB.json.payload.march;
  const bExpectedS = marchDurationSeconds(distance, "attack", army({ axe: 5, ram: 1 }));
  expect(7, secondsBetween(B.departedAt, B.arrivesAt) === bExpectedS && bExpectedS > aExpectedS, `attack B timer ${secondsBetween(B.departedAt, B.arrivesAt)}s != ${bExpectedS}s (must exceed A's ${aExpectedS}s: the Ram sets the pace)`);
  const after7 = villageRow(P1.villageId);
  expect(7, same(after7.army, subArmies(before7.army, army({ axe: 15, ram: 1 }))), `muster: ${compact(before7.army)} → ${compact(after7.army)}`);
  const inFlight7 = marchRows(P1.kingdomId).filter((m) => m.status !== "complete").reduce((sum, m) => addArmies(sum, m.army), emptyArmy());
  expect(7, same(addArmies(after7.army, inFlight7), seed), `conservation: home ${compact(after7.army)} + in flight ${compact(inFlight7)} != seed ${compact(seed)}`);
  const plans = sqlite(`SELECT march_id || '|' || plan_json || '|' || coalesce(auto_resolve_at, 'NULL') FROM local_march_plans WHERE march_id IN ('${A.id}','${B.id}') ORDER BY rowid;`).split("\n").filter(Boolean);
  expect(7, plans.length === 2 && plans.every((p) => p.endsWith("|NULL") && p.includes(JSON.stringify(UNPLANNED_ATTACK_PLAN))), `march plans ${JSON.stringify(plans)} (no plan given → UNPLANNED_ATTACK_PLAN; auto_resolve_at NULL until arrival)`);
  await sleep(1_500);
  expect(7, wStream.events.length === 0, `W's live stream received p1's launches: ${JSON.stringify(wStream.events.map((e) => e.type))}`);
  log(`W's live stream 1.5 s after p1's two launches: ${wStream.events.length} events`);
  const wScout = await launch(W, "march-w-scout-p2", "scout", P2.villageId, { scout: 1 });
  expect(7, wScout.status === 200 && wScout.json?.payload?.march?.kind === "scout", `W's scout via /api/world/commands: ${wScout.status} ${wScout.text}`);
  const wMarch = wScout.json.payload.march;
  const wDistance = distanceBetween(ownVillage(await W.snapshot()), target);
  expect(7, secondsBetween(wMarch.departedAt, wMarch.arrivesAt) === marchDurationSeconds(wDistance, "scout", army({ scout: 1 })), `W's scout timer ${secondsBetween(wMarch.departedAt, wMarch.arrivesAt)}s over ${wDistance.toFixed(4)} tiles`);
  await sleep(1_500);
  const own7 = wStream.events.filter((e) => e.type === "march.changed" && e.payload.march?.id === wMarch.id);
  expect(7, own7.length === 1 && same(own7[0].payload.march, wMarch) && wStream.events.length === 1, `W's live stream after its own launch: ${JSON.stringify(wStream.events.map((e) => [e.type, e.payload.march?.id]))}`);
  log(`W's live stream 1.5 s after W's own launch: ${wStream.events.length} event — ${own7[0].type} for ${own7[0].payload.march.id} (army ${compact(own7[0].payload.march.army)}, village ${own7[0].payload.village?.id})`);
  const events7b = await webEvents(W, 0);
  const marchEvents7b = events7b.events.filter((e) => e.type === "march.changed");
  expect(7, marchEvents7b.length === 1 && marchEvents7b[0].payload.march.id === wMarch.id && events7b.events.every((e) => !PRIVATE_EVENT_TYPES.includes(e.type) || e.payload.march?.kingdomId === W.kingdomId), `W's replay after its launch: ${JSON.stringify(events7b.events.filter((e) => PRIVATE_EVENT_TYPES.includes(e.type)).map((e) => [e.type, e.payload.march?.kingdomId]))}`);
  const p1View7 = await P1.snapshot();
  expect(7, p1View7.marches.length === 3 && p1View7.marches.every((m) => m.kingdomId === P1.kingdomId), `p1's snapshot lists ${p1View7.marches.length} marches: ${JSON.stringify(p1View7.marches.map((m) => [m.id, m.kingdomId]))}`);
  const totalPrivate = Number(sqlite("SELECT count(*) FROM local_world_events WHERE event_type IN ('march.changed','march.arrived','march.completed','scout.report.ready');"));
  await wStream.close();
  record(7, true, `W's replay: ${events7.events.length} events, ${claimed.length} kingdom.claimed, 0 private, while the DB held ${privateInDb} private rows; A ${A.id} ${aExpectedS}s (12 + ${distance.toFixed(4)} × 1.2 × 18/18), B ${B.id} ${bExpectedS}s (… × ${UNITS.ram.speed}/18 — the Ram sets the pace); both accepted because p2 was scouted; Berserkers ${before7.army.axe} → ${after7.army.axe}, Rams ${before7.army.ram} → ${after7.army.ram}; home + in flight = seed; plans UNPLANNED with auto_resolve_at NULL; W's live stream: 0 events for p1's two launches, exactly its own march.changed for ${wMarch.id}; W's replay shows only its own march; p1's snapshot lists only p1's 3 marches; ${totalPrivate} private event rows in the DB by now`);

  // ------------------------------------------------------------------ 8
  step(8, "E2 (server half, observed) — p1 recalls attack B while it is outbound: the row turns 'returning' from where it stood and the walk back costs exactly what the walk out had cost; p2's attempt to recall p1's attack A → FORBIDDEN; A keeps marching");
  const cancelB = await command(P1, "march-p1-cancel-b", { type: "march.cancel", payload: { marchId: B.id } });
  expect(8, cancelB.status === 200 && cancelB.json?.payload?.march?.status === "returning", `cancel B: ${cancelB.status} ${cancelB.text}`);
  const Bc = cancelB.json.payload.march;
  const walkedOutS = secondsBetween(B.departedAt, Bc.departedAt);
  const walkBackS = secondsBetween(Bc.departedAt, Bc.arrivesAt);
  expect(8, Math.abs(walkedOutS - walkBackS) < 0.0005 && walkBackS > 0 && walkBackS < bExpectedS, `walk out ${walkedOutS}s vs walk back ${walkBackS}s`);
  const rowB = marchRows(P1.kingdomId).find((m) => m.id === B.id);
  expect(8, rowB.status === "returning" && rowB.departedAt === Bc.departedAt && rowB.arrivesAt === Bc.arrivesAt && same(rowB.army, army({ axe: 5, ram: 1 })), `B's row ${JSON.stringify(rowB)}`);
  const note8 = (await P1.snapshot()).notifications.find((n) => n.kind === "march" && n.message === "6 troops turned for home.");
  expect(8, note8 && note8.createdAt === Bc.departedAt, `recall notification ${JSON.stringify(note8)}`);
  const forbidden = await command(P2, "march-p2-cancel-p1-a", { type: "march.cancel", payload: { marchId: A.id } });
  expect(8, forbidden.status === 409 && forbidden.json?.payload?.code === "FORBIDDEN" && forbidden.json.payload.message === MSG.FORBIDDEN_MARCH, `p2 recalling A: ${forbidden.status} ${forbidden.text}`);
  const rowA = marchRows(P1.kingdomId).find((m) => m.id === A.id);
  expect(8, rowA.status === "outbound" && rowA.arrivesAt === A.arrivesAt, `A moved: ${JSON.stringify(rowA)}`);
  record(8, true, `B recalled at ${Bc.departedAt}: ${walkedOutS.toFixed(3)}s out → 'returning' with a ${walkBackS.toFixed(3)}s walk back, due ${Bc.arrivesAt}; notification "${note8.message}" at the recall instant; p2's recall of A → 409 FORBIDDEN "${forbidden.json.payload.message}"; A still outbound, due ${A.arrivesAt}`);

  // ------------------------------------------------------------------ 9
  step(9, "D3 — freshness at the walls: A arrives and waits ('awaiting_battle'; auto_resolve_at = arrivesAt + 120 s exactly; recall → MARCH_COMMITTED); battle.open with a version p1 never held → STALE_SCOUT_REPORT; p2 then sends one Spy out (its garrison changes); battle.open with the EXACT version the report carries → STALE_SCOUT_REPORT too; no battle session exists. The acceptance path of battle.open is NOT exercised — that is the battle-settle slice");
  const waitA = ms(A.arrivesAt) - Date.now();
  log(`waiting ${Math.max(0, Math.round(waitA / 1000))}s for attack A to reach the walls at ${A.arrivesAt} (server running)`);
  if (waitA > 0) await sleep(waitA);
  let atWalls = null;
  for (const deadline = ms(A.arrivesAt) + 10_000; Date.now() < deadline;) {
    const s = await P1.snapshot();
    const m = s.marches.find((x) => x.id === A.id);
    if (m?.status === "awaiting_battle") { atWalls = { snapshot: s, march: m, observedAt: new Date().toISOString() }; break; }
    await sleep(250);
  }
  expect(9, atWalls, `A did not reach 'awaiting_battle' within 10 s of ${A.arrivesAt}`);
  log(`A at the walls (observed ${atWalls.observedAt}): ${JSON.stringify(atWalls.march)}`);
  const autoResolveAt = sqlite(`SELECT auto_resolve_at FROM local_march_plans WHERE march_id = '${A.id}';`);
  expect(9, ms(autoResolveAt) - ms(A.arrivesAt) === DEFAULT_AUTO_RESOLVE_MS, `auto_resolve_at ${autoResolveAt} is not arrivesAt + ${DEFAULT_AUTO_RESOLVE_MS} ms`);
  const committed = await command(P1, "march-p1-cancel-a-late", { type: "march.cancel", payload: { marchId: A.id } });
  expect(9, committed.status === 409 && committed.json?.payload?.code === "MARCH_COMMITTED" && committed.json.payload.message === MSG.MARCH_COMMITTED, `late recall: ${committed.status} ${committed.text}`);
  const wrongVersion = await command(P1, "battle-p1-open-wrong-version", { type: "battle.open", payload: { marchId: A.id, targetVillageVersion: report.targetVillageVersion + 1000, plan: UNPLANNED_ATTACK_PLAN } });
  expect(9, wrongVersion.status === 409 && wrongVersion.json?.payload?.code === "STALE_SCOUT_REPORT" && wrongVersion.json.payload.message === MSG.STALE_SCOUT_REPORT, `battle.open with an unheld version: ${wrongVersion.status} ${wrongVersion.text}`);
  const p2Before9 = villageRow(P2.villageId);
  const p2Scout = await launch(P2, "march-p2-scout-p1", "scout", P1.villageId, { scout: 1 });
  expect(9, p2Scout.status === 200 && p2Scout.json?.payload?.march?.kind === "scout", `p2's scout: ${p2Scout.status} ${p2Scout.text}`);
  const p2After9 = villageRow(P2.villageId);
  expect(9, p2After9.army.scout === p2Before9.army.scout - 1 && !same(p2After9.army, report.observedArmy), `p2's garrison did not change: ${compact(p2Before9.army)} → ${compact(p2After9.army)}`);
  const rightVersion = await command(P1, "battle-p1-open-right-version", { type: "battle.open", payload: { marchId: A.id, targetVillageVersion: report.targetVillageVersion, plan: UNPLANNED_ATTACK_PLAN } });
  expect(9, rightVersion.status === 409 && rightVersion.json?.payload?.code === "STALE_SCOUT_REPORT" && rightVersion.json.payload.message === MSG.STALE_SCOUT_REPORT, `battle.open with the report's own version after the garrison changed: ${rightVersion.status} ${rightVersion.text}`);
  expect(9, count("local_battle_sessions") === 0, "a battle session was opened");
  const rowA9 = marchRows(P1.kingdomId).find((m) => m.id === A.id);
  expect(9, rowA9.status === "awaiting_battle" && same(rowA9.army, army({ axe: 10 })), `A after the refusals ${JSON.stringify(rowA9)}`);
  const p2View9 = await P2.snapshot();
  log(`p2's view with 10 Berserkers at its walls: marches ${p2View9.marches.length} (its own Spy), battleSessions ${p2View9.battleSessions.length}, notifications ${JSON.stringify(p2View9.notifications.map((n) => n.message))} (nothing tells the defender an army has arrived — the march.arrived event is the attacker's; observed, not judged)`);
  record(9, true, `A awaiting_battle at ${atWalls.observedAt} (due ${A.arrivesAt}); auto_resolve_at ${autoResolveAt} = arrivesAt + 120 s; recall → 409 MARCH_COMMITTED; battle.open @version ${report.targetVillageVersion + 1000} → 409 STALE_SCOUT_REPORT; p2's Spies ${p2Before9.army.scout} → ${p2After9.army.scout}; battle.open @version ${report.targetVillageVersion} (the report's own) → 409 STALE_SCOUT_REPORT "${rightVersion.json.payload.message}"; 0 battle sessions; A still at the walls with 10 Berserkers`);

  // ------------------------------------------------------------------ 10
  step(10, "conservation and the way home: p1's Spy and recalled B come home at exactly their arrivesAt with 'march.completed' notifications stamped there; W's Spy reports and turns home, and W's event replay carries its own scout.report.ready; home + in flight = seed for p1 and W throughout; the world is stopped before A's auto_resolve_at so no battle is fought");
  const homecomings = [[P1, scoutMarch.id, "1 troops returned"], [P1, B.id, "6 troops returned"]];
  const summary10 = [];
  for (const [player, marchId, prefix] of homecomings) {
    const row = marchRows(player.kingdomId).find((m) => m.id === marchId);
    const due = row.arrivesAt; // for a 'returning' or 'complete' row this is the homecoming instant
    const wait = ms(due) - Date.now();
    if (wait > 0) { log(`waiting ${Math.round(wait / 1000)}s for ${marchId} (${row.kind}, ${row.status}) due home at ${due}`); await sleep(wait + 700); }
    const snap = await player.snapshot();
    const m = snap.marches.find((x) => x.id === marchId);
    expect(10, m?.status === "complete", `${marchId} not complete after ${due}: ${JSON.stringify(m)}`);
    const note = snap.notifications.find((n) => n.kind === "march" && n.message.startsWith(prefix));
    expect(10, note && note.createdAt === due, `homecoming notification for ${marchId}: ${JSON.stringify(note)} (expected createdAt ${due})`);
    summary10.push(`${marchId} complete, "${note.message}" at ${note.createdAt}`);
  }
  const wRow = marchRows(W.kingdomId).find((m) => m.id === wMarch.id);
  const wWait = ms(wMarch.arrivesAt) - Date.now();
  if (wRow.status === "outbound" && wWait > 0) { log(`waiting ${Math.round(wWait / 1000)}s for W's Spy to reach p2 at ${wMarch.arrivesAt}`); await sleep(wWait + 700); }
  const wEvents = await webEvents(W, 0);
  const wReportEvent = wEvents.events.find((e) => e.type === "scout.report.ready");
  expect(10, wReportEvent && wReportEvent.payload.report.kingdomId === W.kingdomId && wReportEvent.payload.report.marchId === wMarch.id, `W's replay has no scout.report.ready for its own Spy: ${JSON.stringify(wReportEvent?.payload?.report)}`);
  const wReport = wReportEvent.payload.report;
  expect(10, wReport.createdAt === wMarch.arrivesAt, `W's report createdAt ${wReport.createdAt} != its Spy's arrivesAt ${wMarch.arrivesAt}`);
  // W's Spy and p2's own Spy (step 9) race: whichever left/arrived first
  // decides whether W saw all three of p2's Spies or two. Both are honest;
  // the drill records which it was rather than guessing the order.
  const sawBefore = same(wReport.observedArmy, seed);
  const sawAfter = same(wReport.observedArmy, p2After9.army);
  expect(10, sawBefore || sawAfter, `W's observedArmy ${compact(wReport.observedArmy)} matches neither p2's garrison before its Spy left (${compact(seed)}) nor after (${compact(p2After9.army)})`);
  const wSaw = sawBefore ? `${compact(wReport.observedArmy)} — W's Spy arrived at ${wReport.createdAt}, before p2's own Spy left at ${p2Scout.json.payload.march.departedAt}` : `${compact(wReport.observedArmy)} — W's Spy arrived at ${wReport.createdAt}, after p2's own Spy left at ${p2Scout.json.payload.march.departedAt}`;
  log(`W's report: observedArmy ${wSaw}`);
  expect(10, wEvents.events.filter((e) => PRIVATE_EVENT_TYPES.includes(e.type)).every((e) => (e.payload.march?.kingdomId ?? e.payload.report?.kingdomId) === W.kingdomId), `W's replay carries someone else's private event: ${JSON.stringify(wEvents.events.filter((e) => PRIVATE_EVENT_TYPES.includes(e.type)).map((e) => [e.type, e.payload.march?.kingdomId ?? e.payload.report?.kingdomId]))}`);
  const p1Home = villageRow(P1.villageId);
  const p1Flight = marchRows(P1.kingdomId).filter((m) => m.status !== "complete").reduce((sum, m) => addArmies(sum, m.army), emptyArmy());
  expect(10, same(addArmies(p1Home.army, p1Flight), seed) && same(p1Flight, army({ axe: 10 })), `p1 conservation: home ${compact(p1Home.army)} + in flight ${compact(p1Flight)} != seed`);
  const wHome = villageRow(W.villageId);
  const wFlight = marchRows(W.kingdomId).filter((m) => m.status !== "complete").reduce((sum, m) => addArmies(sum, m.army), emptyArmy());
  expect(10, same(addArmies(wHome.army, wFlight), seed), `W conservation: home ${compact(wHome.army)} + in flight ${compact(wFlight)} != seed`);
  const p1Reports = count("local_scout_reports", `kingdom_id = '${P1.kingdomId}'`);
  const wReports = count("local_scout_reports", `kingdom_id = '${W.kingdomId}'`);
  expect(10, p1Reports === 1 && wReports === 1, `reports p1 ${p1Reports}, W ${wReports}`);
  const stoppedAt10 = await stopServer("world server (before A's auto_resolve_at)");
  expect(10, ms(stoppedAt10) < ms(autoResolveAt), `the server outlived A's auto_resolve_at ${autoResolveAt}`);
  expect(10, count("local_battle_sessions") === 0, "a battle was fought after all");
  const finalA = marchRows(P1.kingdomId).find((m) => m.id === A.id);
  record(10, true, `${summary10.join("; ")}; W's report event: kingdom ${W.kingdomId}, createdAt == its Spy's arrivesAt, observedArmy ${compact(wReport.observedArmy)} (${sawBefore ? "all three of p2's Spies still home" : "p2 minus the Spy it had sent"}); p1 home ${compact(p1Home.army)} + at the walls ${compact(p1Flight)} = seed; W home ${compact(wHome.army)} + in flight ${compact(wFlight)} = seed; 1 report each; server stopped ${stoppedAt10}, ${((ms(autoResolveAt) - ms(stoppedAt10)) / 1000).toFixed(1)}s before A's auto_resolve_at ${autoResolveAt}; A left '${finalA.status}'; 0 battle sessions`);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  log("");
  log(`MARCHES DRILL FAILED: ${error.message}`);
} finally {
  await stopServer("world server (teardown)");
  log("");
  log("## Result");
  for (const r of results) log(`- step ${r.step}: ${r.ok ? "PASS" : "FAIL"}`);
  const passed = results.filter((r) => r.ok === true).length;
  const failed = results.filter((r) => r.ok === false).length;
  const verdict = exitCode === 0 && failed === 0 && passed === TOTAL_STEPS ? "PASS" : "FAIL";
  log(`D1–D3/E1 marches + fog drill ${verdict} (${passed}/${TOTAL_STEPS} steps PASS)`);
  if (verdict === "PASS") {
    rmSync(scratch, { recursive: true, force: true });
    log(`scratch dir removed: ${scratch}`);
  } else {
    log(`scratch dir kept for inspection: ${scratch}`);
  }
  process.exit(verdict === "PASS" ? 0 : 1);
}
