#!/usr/bin/env node
// The battle itself, over HTTP: battle.open's acceptance, field orders,
// battle.resolve, the server fighting an attack nobody attended at exactly
// auto_resolve_at, settlement (casualties, prisoners, loot, war points), the
// homeward march carrying the loot, and the loot landing in the attacker's
// barn - the first honest route to resources arriving from OUTSIDE a village.
//
// Matrix rows in docs/verification/2026-09-17-full-game-acceptance-matrix.md:
//   E4  Deterministic class-vs-class combat: counters, wall, surrender, conservation
//   E5  Attended battle: orders capped, retreat exposure server-derived (orders half)
//   E6  Simultaneous sieges: second army fights survivors, loot conserved
//   B6  Freeholds on-ramp (fought live for the first time since 2026-08-23; NOT conquered)
//   C1  resources arriving as loot (the cap branch stays untouched)
//   D3  battle.open's ACCEPTANCE path (revision 8 drove only its refusals)
//   M2  "offline auto-resolve" clause, server half
// All of it was IMPLEMENTED + TESTED and never driven over the wire; revision
// 8's §7 list named "the battle itself" as the next slice, starting where the
// marches drill stopped (an attack awaiting_battle with auto_resolve_at set,
// 119.8 s short of it). This drill is that slice, HTTP-only: no Studio, no PC,
// no phone, no hosting. The B8 mid-settle kill is NOT here (follow-up).
//
// Three armies from one attacker, two targets:
//   A  5 Squires  + the war table's best plan  → a player's seeded capital.
//      Never attended. Auto-resolves at arrivesAt + 120 s as a DEFEAT (a
//      wall-1 garrison of 34 crushes 5 Squires): total wipe, no loot, the
//      defender's garrison thinned by the casualties, the defender told.
//   B  10 Berserkers, no plan at launch      → the nearest Freehold (10 Squires,
//      wall 0). ATTENDED: battle.open accepted with the report's version and
//      the best plan, five field orders, battle.resolve. Overwhelming win:
//      prisoners taken, loot to the survivors' carry, war points, the
//      column home with the loot, the barn fuller by exactly that.
//   C  5 Squires, no plan                    → the same Freehold, arriving
//      beside B. battle.open while B's battle is open → SIEGE_IN_PROGRESS;
//      after B strips the garrison → STALE_SCOUT_REPORT; auto-resolves as an
//      unattended VICTORY over an empty garrison, looting what B left.
//
// The oracle: every settled battle's stored outcome is recomputed by the
// drill with game-core's own resolveBattle from the battle row's frozen
// inputs (both armies, both level sets, the wall, the stock, the plan, the
// order count, the seed) and must match BYTE FOR BYTE - so this proves the
// server settles with the shared rule and nothing else. Loot, war points,
// return timers, the seed derivation and the grace deadline are recomputed
// independently. Refusal codes and messages are literals from a reading of
// server/src/store.ts. Whether the numbers are GOOD is not judged.
//
// Troops ride KINGSAGE_DEV_SEED_ARMY (production DEV-ONLY knob; a fresh
// village has no troops). Readers: the attacker P1 on the Roblox door, the
// defender D and a watcher W on the web door (the event stream only exists
// there, and the defender's view of a battle it did not start is the point).
//
// Same posture as the other drills: throwaway world in a mkdtemp dir,
// throwaway key, non-4178 port, inherited KINGSAGE_* stripped. Needs Node 22
// + the sqlite3 CLI. About four and a half minutes, all real timers (the two
// 120 s waits at the walls are the drill).
//
//   node scripts/battle-settle-drill.mjs           # exit 0 = every step PASS
//   BATTLE_PORT=4262 node scripts/battle-settle-drill.mjs

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.execArgv.includes("--experimental-strip-types")) {
  const rerun = spawnSync(process.execPath, ["--experimental-strip-types", ...process.argv.slice(1)], { stdio: "inherit" });
  process.exit(rerun.status ?? 1);
}

const { GAME_CONTRACT_VERSION, emptyArmy } = await import("../packages/game-core/src/contracts.ts");
const { distanceBetween, marchDurationSeconds, resolveBattle, calculateLoot, battlePlanScore, armyUnitCount, addArmies: addArmiesCore, UNPLANNED_ATTACK_PLAN, BATTLE_ORDER_CAP } = await import("../packages/game-core/src/warfare.ts");
const { FREEHOLD_GARRISON } = await import("../packages/game-core/src/fixture.ts");

// ---------------------------------------------------------------- the oracle
// Hand-copied from server/src/store.ts. If someone changes a refusal, this
// drill fails on the message - which is the point.
const MSG = {
  INVALID_PLAN: "The attack plan contains an unknown order.",
  MARCH_NOT_READY: "That attack has not reached the target or already entered battle.",
  STALE_SCOUT_REPORT: "The defender changed after your report. Scout again before opening battle.",
  SIEGE_IN_PROGRESS: "Another army holds the field — wait for their battle to end.",
  BATTLE_CLOSED_ORDER: "That battle is not accepting field orders.",
  BATTLE_CLOSED_RESOLVE: "That battle has already ended.",
  ORDER_CAP: `A battle accepts at most ${BATTLE_ORDER_CAP} field orders.`,
  INVALID_ORDER: (n) => `The next valid battle order is sequence ${n}.`,
  HELD: "Your garrison held the village.",
};
const DEFAULT_AUTO_RESOLVE_MS = 120_000; // store.ts
const ATTENDED_GRACE_MS = 3 * 60_000;    // store.ts
const GOOD_PLAN = { entry: "West Ridge", troops: "Balanced Army", time: "Dawn", style: "Flanking Strike" }; // warfare.ts BEST_PLAN (score 4)
const SEED_ARMY = { axe: 20, spear: 10, scout: 3, ram: 1 };
const SEED_ARMY_ENV = "axe:20,spear:10,scout:3,ram:1";
const FIXTURE_RESOURCES = { wood: 1200, stone: 1000, iron: 800 };
const FREEHOLD_RESOURCES = { wood: 400, stone: 350, iron: 250 };
const TROOPS = Object.keys(emptyArmy());
const RESOURCES = ["wood", "stone", "iron"];
const PRIVATE_EVENT_TYPES = ["march.changed", "march.arrived", "march.completed", "scout.report.ready", "recruitment.queued", "research.queued", "battle.started", "battle.retreated", "battle.resolved"];
const BATTLE_EVENT_TYPES = ["battle.started", "battle.retreated", "battle.resolved"];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = join(repoRoot, "server");
const port = Number(process.env.BATTLE_PORT ?? 4262);
// Throwaway key for a throwaway world. Not a secret; never reused anywhere.
const robloxKey = "battle-throwaway-key-0001";

const scratch = mkdtempSync(join(tmpdir(), "kingsmarch-battle-"));
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
const sumRes = (r) => r.wood + r.stone + r.iron;
const addRes = (a, b) => Object.fromEntries(RESOURCES.map((k) => [k, a[k] + b[k]]));
const subRes = (a, b) => Object.fromEntries(RESOURCES.map((k) => [k, a[k] - b[k]]));
const ms = (iso) => Date.parse(iso);
const secondsBetween = (a, b) => (ms(b) - ms(a)) / 1000;
// The economy trickles 28/h into a level-1 village (one whole unit every
// ~128 s), so any resource comparison spanning real seconds allows for it.
const withinTrickle = (actual, expected, slack = 1) => RESOURCES.every((k) => actual[k] >= expected[k] && actual[k] <= expected[k] + slack);

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
  child.stderr.on("data", (chunk) => {
    for (const line of String(chunk).trimEnd().split("\n")) {
      if (line.includes("ExperimentalWarning") || line.includes("--trace-warnings")) continue;
      log(`  [server:err] ${line}`);
    }
  });
  child.exited = new Promise((done) => child.once("exit", (code, signal) => done({ code, signal })));
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
  if (!quiet) log(`POST /api/roblox/state {"robloxUserIds":[${player.userId}]} -> 200 (${result.text.length} bytes; marches ${state.marches.length}, scoutReports ${state.scoutReports.length}, battleSessions ${state.battleSessions.length}, notifications ${state.notifications.length})`);
  return state;
}

async function webSnapshot(player, { quiet = false } = {}) {
  const result = await request("GET", "/api/world/snapshot", undefined, { cookie: player.cookie, quiet: true });
  if (result.status !== 200) throw new Error(`/api/world/snapshot -> ${result.status} ${result.text}`);
  if (!quiet) log(`GET /api/world/snapshot (web session cookie, ${player.tag}) -> 200 (${result.text.length} bytes; marches ${result.json.marches.length}, battleSessions ${result.json.battleSessions.length}, notifications ${result.json.notifications.length})`);
  return result.json;
}

async function webEvents(player, since = 0) {
  const result = await request("GET", `/api/world/events?since=${since}`, undefined, { cookie: player.cookie, quiet: true });
  if (result.status !== 200) throw new Error(`/api/world/events -> ${result.status} ${result.text}`);
  const types = result.json.events.map((e) => e.type);
  log(`GET /api/world/events?since=${since} (web session cookie, ${player.tag}) -> 200 currentWorldVersion ${result.json.currentWorldVersion}; ${types.length} events: ${JSON.stringify(types)}`);
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
  player.snapshot = (opts) => pullState(player, { quiet: true, ...opts });
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
  player.snapshot = (opts) => webSnapshot(player, { quiet: true, ...opts });
  return snap;
}

// The world version moves with every accepted command and every arrival, so
// each command reads the current version first; a conflict that still slips
// in is logged and retried once under a suffixed commandId. `version` lets a
// step send a deliberately stale version instead (the field-order exemption).
async function command(player, commandId, cmd, { quiet = false, retry = true, version } = {}) {
  const expected = version ?? (await player.snapshot()).world.version;
  let body; let res;
  if (player.cookie) {
    body = { contractVersion: GAME_CONTRACT_VERSION, commandId, worldId: player.worldId, actorPlayerId: player.playerId, expectedWorldVersion: expected, issuedAt: new Date().toISOString(), command: cmd };
    res = await request("POST", "/api/world/commands", body, { cookie: player.cookie, quiet });
  } else {
    body = { robloxUserId: player.userId, commandId, expectedWorldVersion: expected, command: cmd };
    res = await request("POST", "/api/roblox/commands", body, { quiet });
  }
  if (retry && version === undefined && res.status === 409 && res.json?.payload?.code === "WORLD_VERSION_CONFLICT") {
    log(`(WORLD_VERSION_CONFLICT on ${commandId}: the world moved between the version read and the write; retrying once as ${commandId}-retry)`);
    return command(player, `${commandId}-retry`, cmd, { quiet, retry: false });
  }
  return { ...res, body, sentAt: new Date().toISOString() };
}

const launch = (player, id, kind, targetVillageId, force, extra = {}) =>
  command(player, id, { type: "march.launch", payload: { fromVillageId: player.villageId, targetVillageId, kind, army: army(force), ...extra } });
const open = (player, id, marchId, targetVillageVersion, plan) =>
  command(player, id, { type: "battle.open", payload: { marchId, targetVillageVersion, plan } });
const order = (player, id, battleId, sequence, squad, x, y, atMs, opts) =>
  command(player, id, { type: "battle.order", payload: { battleId, sequence, squad, x, y, atMs } }, opts);

function expectRefusal(n, res, label, code, message) {
  expect(n, res.status === 409 && res.json?.type === "command.rejected" && res.json.payload.code === code && res.json.payload.message === message, `${label}: expected 409 ${code} "${message}", got ${res.status} ${res.text}`);
  return `${label} → 409 ${code}`;
}

// ----------------------------------------------------------------- the DB
function villageRow(villageId) {
  const raw = sqlite(`SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || state_version || '|' || kingdom_id || '|' || name FROM local_villages WHERE id = '${villageId}';`);
  const [resources, buildings, armyJson, realmOfPower, stateVersion, kingdomId, name] = raw.split("|");
  return { resources: JSON.parse(resources), buildings: JSON.parse(buildings), army: JSON.parse(armyJson), realmOfPower: Number(realmOfPower), stateVersion: Number(stateVersion), kingdomId, name };
}

function marchRows(kingdomId) {
  const raw = sqlite(`SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || loot_json || '|' || departed_at || '|' || arrives_at || '|' || coalesce(battle_id, 'NULL') FROM local_marches WHERE kingdom_id = '${kingdomId}' ORDER BY rowid;`);
  return raw.split("\n").filter(Boolean).map((line) => { const [id, kind, status, armyJson, lootJson, departedAt, arrivesAt, battleId] = line.split("|"); return { id, kind, status, army: JSON.parse(armyJson), loot: JSON.parse(lootJson), departedAt, arrivesAt, battleId: battleId === "NULL" ? null : battleId }; });
}

function planRow(marchId) {
  const raw = sqlite(`SELECT plan_json || '|' || coalesce(auto_resolve_at, 'NULL') FROM local_march_plans WHERE march_id = '${marchId}';`);
  const [plan, autoResolveAt] = raw.split("|");
  return { plan: JSON.parse(plan), autoResolveAt: autoResolveAt === "NULL" ? null : autoResolveAt };
}

// Everything a battle was frozen with, straight from the row - the inputs
// the oracle recomputes the outcome from.
function battleRow(battleId) {
  const raw = sqlite(`SELECT b.status || '|' || b.seed || '|' || b.plan_json || '|' || b.attacker_army_json || '|' || b.defender_army_json || '|' || b.attacker_levels_json || '|' || b.defender_levels_json || '|' || b.defender_wall_level || '|' || b.defender_resources_json || '|' || coalesce(b.outcome_json, 'NULL') || '|' || b.opened_at || '|' || coalesce(b.resolved_at, 'NULL') || '|' || b.defender_village_version || '|' || (SELECT count(*) FROM local_battle_orders o WHERE o.battle_id = b.id) || '|' || b.march_id || '|' || b.defender_kingdom_id FROM local_battle_sessions b WHERE b.id = '${battleId}';`);
  if (!raw) return null;
  const [status, seed, plan, attackerArmy, defenderArmy, attackerLevels, defenderLevels, wall, defenderResources, outcome, openedAt, resolvedAt, defenderVersion, orderCount, marchId, defenderKingdomId] = raw.split("|");
  return { status, seed, plan: JSON.parse(plan), attackerArmy: JSON.parse(attackerArmy), defenderArmy: JSON.parse(defenderArmy), attackerLevels: JSON.parse(attackerLevels), defenderLevels: JSON.parse(defenderLevels), wall: Number(wall), defenderResources: JSON.parse(defenderResources), outcomeJson: outcome === "NULL" ? null : outcome, openedAt, resolvedAt: resolvedAt === "NULL" ? null : resolvedAt, defenderVersion: Number(defenderVersion), orderCount: Number(orderCount), marchId, defenderKingdomId };
}

function oracleOutcome(row) {
  return resolveBattle({ attacker: row.attackerArmy, defender: row.defenderArmy, attackerLevels: row.attackerLevels, defenderLevels: row.defenderLevels, defenderWallLevel: row.wall, defenderResources: row.defenderResources, plan: row.plan, acceptedOrders: row.orderCount, seed: row.seed });
}

const count = (table, where = "1=1") => Number(sqlite(`SELECT count(*) FROM ${table} WHERE ${where};`));
const warPoints = (kingdomId) => Number(sqlite(`SELECT war_victory_points FROM local_kingdoms WHERE id = '${kingdomId}';`));
const notificationsFor = (kingdomId) => sqlite(`SELECT kind || '|' || created_at || '|' || message FROM local_kingdom_notifications WHERE kingdom_id = '${kingdomId}' ORDER BY created_at, rowid;`).split("\n").filter(Boolean).map((l) => { const [kind, createdAt, ...rest] = l.split("|"); return { kind, createdAt, message: rest.join("|") }; });

function isFogged(village) {
  return Object.values(village.resources).every((v) => v === 0) && Object.values(village.buildings).every((v) => v === 0) && TROOPS.every((t) => village.army[t] === 0) && village.realmOfPower === 0 && village.realmOfPowerMax === 0;
}

// A live SSE reader on /api/world/stream. Collects every pushed event until
// closed; the `ready` frame is the server saying the replay is done.
const openStreams = [];
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
          if (name === "ready") { stream.ready = parsed; readyResolve(parsed); } else stream.events.push({ ...parsed, receivedAt: new Date().toISOString() });
        }
      }
    } catch (error) {
      // An abort is the drill closing the stream; anything else (the server
      // going away under a failing run) is recorded, not thrown - the verdict
      // comes from the steps, and the teardown must still run.
      if (error.name !== "AbortError") { stream.error = String(error?.cause ?? error); log(`  [stream ${player.tag}] ended: ${stream.error}`); }
    }
  })();
  stream.close = async () => { controller.abort(); stream.closed = true; await stream.pump.catch(() => {}); };
  openStreams.push(stream);
  return stream;
}

// Wait for a march to reach a status, polling the owner's snapshot (a state
// pull materializes due work, as the 500 ms interval also does).
async function waitForMarchStatus(player, marchId, status, dueIso, graceMs = 10_000) {
  const wait = ms(dueIso) - Date.now();
  if (wait > 0) { log(`waiting ${Math.max(0, Math.round(wait / 1000))}s for ${marchId} to reach '${status}' at ${dueIso} (server running)`); await sleep(wait); }
  for (const deadline = ms(dueIso) + graceMs; Date.now() < deadline;) {
    const snap = await player.snapshot();
    const m = snap.marches.find((x) => x.id === marchId);
    if (m?.status === status) return { snapshot: snap, march: m, observedAt: new Date().toISOString() };
    await sleep(250);
  }
  return null;
}

// ------------------------------------------------------------------ main
async function main() {
  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
  log(`# The battle over HTTP — battle.open, field orders, battle.resolve, auto-resolve at the deadline, settlement, loot home (current tip)`);
  log(`date: ${new Date().toISOString()}`);
  log(`sha: ${sha}`);
  log(`node: ${process.version}`);
  log(`sqlite3: ${spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).stdout.trim()}`);
  log(`scratch: ${scratch}`);
  log(`port: ${port}`);

  const P1 = { userId: 970001, name: "Battle One", tag: "p1" };
  const D = { username: "defender", password: "Correct-Horse-9", kingdomName: "The Held Walls", tag: "d" };
  const W = { username: "watcher", password: "Correct-Horse-9", kingdomName: "The Watchers", tag: "w" };
  const seed = army(SEED_ARMY);
  const ARMY_A = army({ spear: 5 });
  const ARMY_B = army({ axe: 10 });
  const ARMY_C = army({ spear: 5 });

  // ------------------------------------------------------------------ 1
  step(1, "fresh disposable world with KINGSAGE_DEV_SEED_ARMY; P1 (the attacker) linked through the Roblox door, D (the defender) and W (a watcher) registered through the web door; D's capital holds the seed army, the nearest Freehold to P1 holds only the fixture's 10 Squires behind no wall with the fixture's poorer stock");
  expect(1, !existsSync(dbPath), `scratch DB already exists at ${dbPath}`);
  // A stale server on the port would answer /api/health for a world that is
  // not this one; refuse to start rather than drill the wrong world.
  const squatter = await request("GET", "/api/health", undefined, { key: null, quiet: true });
  expect(1, squatter.status === 0, `something already answers on port ${port} (${squatter.status} ${squatter.text}); stop it or set BATTLE_PORT`);
  startServer();
  const h1 = await waitForHealth();
  log(`GET /api/health -> ${h1.status} ${h1.text}`);
  expect(1, h1.json?.ok === true && h1.json?.service === "kingsage-world", `unexpected health body ${h1.text}`);
  await link(P1);
  await registerWeb(D);
  await registerWeb(W);
  for (const p of [P1, D, W]) log(`${p.tag}: ${p.playerId} / ${p.kingdomId} / ${p.villageId}`);
  const s1 = await P1.snapshot();
  const home = ownVillage(s1);
  const dVillage = s1.world.villages.find((v) => v.id === D.villageId);
  const freeholds = s1.world.villages.filter((v) => v.kingdomId.startsWith("freehold-"));
  expect(1, freeholds.length === 4, `expected 4 Freeholds, saw ${freeholds.length}`);
  const F = freeholds.map((v) => ({ v, d: distanceBetween(home, v) })).sort((a, b) => a.d - b.d)[0].v;
  const homeRow = villageRow(P1.villageId);
  const dRow = villageRow(D.villageId);
  const fRow = villageRow(F.id);
  expect(1, same(homeRow.army, seed) && same(homeRow.resources, FIXTURE_RESOURCES), `p1's row ${JSON.stringify(homeRow)}`);
  expect(1, same(dRow.army, seed) && dRow.buildings.wall === 1 && same(dRow.resources, FIXTURE_RESOURCES), `d's row ${JSON.stringify(dRow)}`);
  expect(1, same(fRow.army, FREEHOLD_GARRISON) && fRow.buildings.wall === 0 && same(fRow.resources, FREEHOLD_RESOURCES) && fRow.kingdomId === F.kingdomId, `Freehold row ${JSON.stringify(fRow)} (the seed knob must not arm a Freehold; wall 0, 400/350/250 per fixture.ts)`);
  const dD = distanceBetween(home, dVillage);
  const dF = distanceBetween(home, F);
  const attackA_s = marchDurationSeconds(dD, "attack", ARMY_A);
  const attackB_s = marchDurationSeconds(dF, "attack", ARMY_B);
  const attackC_s = marchDurationSeconds(dF, "attack", ARMY_C);
  log(`p1 home ${home.id} at (${home.x},${home.y}); D's capital ${dVillage.id} "${dVillage.name}" at (${dVillage.x},${dVillage.y}), ${dD.toFixed(4)} tiles; nearest Freehold ${F.id} "${F.name}" (${F.kingdomId}) at (${F.x},${F.y}), ${dF.toFixed(4)} tiles`);
  log(`expected: scout to D ${marchDurationSeconds(dD, "scout", army({ scout: 1 }))}s, scout to F ${marchDurationSeconds(dF, "scout", army({ scout: 1 }))}s; attack A (5 Squires → D) ${attackA_s}s; attack B (10 Berserkers → F) ${attackB_s}s; attack C (5 Squires → F) ${attackC_s}s; auto-resolve ${DEFAULT_AUTO_RESOLVE_MS / 1000}s after arrival; battle.open grace +${ATTENDED_GRACE_MS / 1000}s`);
  record(1, true, `health 200; p1 → ${P1.kingdomId} (Roblox door), d → ${D.kingdomId} (web), w → ${W.kingdomId} (web); p1 and D hold the seed ${compact(seed)} behind wall 1 with ${JSON.stringify(FIXTURE_RESOURCES)}; Freehold ${F.id} "${F.name}" holds ${compact(FREEHOLD_GARRISON)} behind wall ${fRow.buildings.wall} with ${JSON.stringify(fRow.resources)}; p1→D ${dD.toFixed(4)} tiles, p1→F ${dF.toFixed(4)} tiles`);

  // ------------------------------------------------------------------ 2
  step(2, "two Spies out (to D and to the Freehold), both arriving with the server RUNNING: each report's createdAt equals its Spy's arrivesAt exactly and equals the target's row (the Freehold's 10 Squires, wall 0, 400/350/250); the same snapshot still fogs both targets to zeros");
  const scoutD = await launch(P1, "battle-p1-scout-d", "scout", D.villageId, { scout: 1 });
  const scoutF = await launch(P1, "battle-p1-scout-f", "scout", F.id, { scout: 1 });
  expect(2, scoutD.status === 200 && scoutF.status === 200, `scouts: ${scoutD.status} ${scoutD.text} / ${scoutF.status} ${scoutF.text}`);
  const mD = scoutD.json.payload.march; const mF = scoutF.json.payload.march;
  const lastArrival = ms(mD.arrivesAt) > ms(mF.arrivesAt) ? mD.arrivesAt : mF.arrivesAt;
  const wait2 = ms(lastArrival) + 700 - Date.now();
  log(`waiting ${Math.max(0, Math.round(wait2 / 1000))}s for both Spies (due ${mD.arrivesAt} and ${mF.arrivesAt})`);
  if (wait2 > 0) await sleep(wait2);
  const s2 = await P1.snapshot();
  const reportD = s2.scoutReports.find((r) => r.marchId === mD.id);
  const reportF = s2.scoutReports.find((r) => r.marchId === mF.id);
  expect(2, reportD && reportF, `reports missing: ${JSON.stringify(s2.scoutReports.map((r) => r.marchId))}`);
  expect(2, reportD.createdAt === mD.arrivesAt && reportF.createdAt === mF.arrivesAt, `report stamps ${reportD.createdAt}/${reportF.createdAt} vs arrivals ${mD.arrivesAt}/${mF.arrivesAt}`);
  const dRow2 = villageRow(D.villageId); const fRow2 = villageRow(F.id);
  expect(2, same(reportD.observedArmy, dRow2.army) && reportD.observedBuildings.wall === 1 && reportD.targetVillageVersion === dRow2.stateVersion, `D's report ${JSON.stringify(reportD)} vs row ${JSON.stringify(dRow2)}`);
  expect(2, same(reportF.observedArmy, FREEHOLD_GARRISON) && reportF.observedBuildings.wall === 0 && withinTrickle(reportF.observedResources, FREEHOLD_RESOURCES) && reportF.targetVillageVersion === fRow2.stateVersion && reportF.targetKingdomName === F.name, `F's report ${JSON.stringify(reportF)} vs row ${JSON.stringify(fRow2)}`);
  expect(2, isFogged(s2.world.villages.find((v) => v.id === D.villageId)) && isFogged(s2.world.villages.find((v) => v.id === F.id)), "the snapshot carrying the reports un-fogged a target");
  log(`report on D: army ${compact(reportD.observedArmy)}, wall ${reportD.observedBuildings.wall}, version ${reportD.targetVillageVersion}; report on F: army ${compact(reportF.observedArmy)}, wall ${reportF.observedBuildings.wall}, resources ${JSON.stringify(reportF.observedResources)}, version ${reportF.targetVillageVersion}, kingdom "${reportF.targetKingdomName}"`);
  record(2, true, `Spies arrived ${mD.arrivesAt} (D) and ${mF.arrivesAt} (F) with the server up; both reports stamped exactly at arrivesAt; D: ${compact(reportD.observedArmy)} wall 1 v${reportD.targetVillageVersion}; F: ${compact(reportF.observedArmy)} wall 0 ${JSON.stringify(reportF.observedResources)} v${reportF.targetVillageVersion}; both targets still fogged in the same snapshot`);

  // ------------------------------------------------------------------ 3
  step(3, "three attacks launched: a plan the war table could not produce → INVALID_PLAN at launch (nothing leaves); A = 5 Squires with the best plan → D; B = 10 Berserkers with no plan → F; C = 5 Squires with no plan → F; plan rows carry the launch plan (A) or UNPLANNED (B, C) with auto_resolve_at NULL; muster and conservation hold");
  const before3 = villageRow(P1.villageId);
  const badPlan = await launch(P1, "battle-p1-attack-bad-plan", "attack", D.villageId, { spear: 5 }, { plan: { ...GOOD_PLAN, entry: "Through The Sewers" } });
  const r3 = [expectRefusal(3, badPlan, "bad plan at launch", "INVALID_PLAN", MSG.INVALID_PLAN)];
  expect(3, count("local_marches", "kind = 'attack'") === 0 && same(villageRow(P1.villageId).army, before3.army), "the refused launch moved troops or made a row");
  const launchA = await launch(P1, "battle-p1-attack-a", "attack", D.villageId, { spear: 5 }, { plan: GOOD_PLAN });
  const launchB = await launch(P1, "battle-p1-attack-b", "attack", F.id, { axe: 10 });
  const launchC = await launch(P1, "battle-p1-attack-c", "attack", F.id, { spear: 5 });
  for (const [label, res] of [["A", launchA], ["B", launchB], ["C", launchC]]) expect(3, res.status === 200 && res.json?.payload?.march?.kind === "attack" && res.json.payload.march.status === "outbound", `attack ${label}: ${res.status} ${res.text}`);
  const A = launchA.json.payload.march; const B = launchB.json.payload.march; const C = launchC.json.payload.march;
  expect(3, secondsBetween(A.departedAt, A.arrivesAt) === attackA_s && secondsBetween(B.departedAt, B.arrivesAt) === attackB_s && secondsBetween(C.departedAt, C.arrivesAt) === attackC_s, `timers A ${secondsBetween(A.departedAt, A.arrivesAt)} B ${secondsBetween(B.departedAt, B.arrivesAt)} C ${secondsBetween(C.departedAt, C.arrivesAt)} vs ${attackA_s}/${attackB_s}/${attackC_s}`);
  const plans3 = { A: planRow(A.id), B: planRow(B.id), C: planRow(C.id) };
  expect(3, same(plans3.A.plan, GOOD_PLAN) && plans3.A.autoResolveAt === null, `A's plan row ${JSON.stringify(plans3.A)}`);
  expect(3, same(plans3.B.plan, UNPLANNED_ATTACK_PLAN) && same(plans3.C.plan, UNPLANNED_ATTACK_PLAN) && plans3.B.autoResolveAt === null && plans3.C.autoResolveAt === null, `B/C plan rows ${JSON.stringify([plans3.B, plans3.C])}`);
  const after3 = villageRow(P1.villageId);
  expect(3, same(after3.army, subArmies(before3.army, army({ spear: 10, axe: 10 }))), `muster ${compact(before3.army)} → ${compact(after3.army)}`);
  const inFlight3 = marchRows(P1.kingdomId).filter((m) => m.status !== "complete").reduce((s, m) => addArmies(s, m.army), emptyArmy());
  expect(3, same(addArmies(after3.army, inFlight3), seed), `conservation: home ${compact(after3.army)} + in flight ${compact(inFlight3)} != seed`);
  record(3, true, `${r3.join("; ")}, no row, army unchanged; A ${A.id} ${attackA_s}s (plan ${JSON.stringify(GOOD_PLAN)} stored, auto NULL); B ${B.id} ${attackB_s}s and C ${C.id} ${attackC_s}s (UNPLANNED stored, auto NULL); home ${compact(after3.army)} + in flight ${compact(inFlight3)} = seed`);

  // ------------------------------------------------------------------ 4
  step(4, "B and C at the Freehold's walls (auto_resolve_at = arrivesAt + 120 s each); battle.open refusals in order — a scout march → MARCH_NOT_READY, W opening p1's march → MARCH_NOT_READY, an unknown plan → INVALID_PLAN; then battle.open of B ACCEPTED with the report's version and the best plan: a session 'open' whose frozen inputs equal the Freehold's row, seed = sha256(worldId:marchId:openedAt)[:24], auto_resolve_at pushed to openedAt + 180 s, the march carries battleId; battle.open of C → SIEGE_IN_PROGRESS; nothing fought yet");
  const dueF = ms(B.arrivesAt) > ms(C.arrivesAt) ? B.arrivesAt : C.arrivesAt;
  const atWallsB = await waitForMarchStatus(P1, B.id, "awaiting_battle", dueF);
  expect(4, atWallsB, `B did not reach 'awaiting_battle' within 10 s of ${B.arrivesAt}`);
  const atWallsC = await waitForMarchStatus(P1, C.id, "awaiting_battle", C.arrivesAt);
  expect(4, atWallsC, `C did not reach 'awaiting_battle' within 10 s of ${C.arrivesAt}`);
  const planB4 = planRow(B.id); const planC4 = planRow(C.id);
  expect(4, ms(planB4.autoResolveAt) - ms(B.arrivesAt) === DEFAULT_AUTO_RESOLVE_MS && ms(planC4.autoResolveAt) - ms(C.arrivesAt) === DEFAULT_AUTO_RESOLVE_MS, `deadlines B ${planB4.autoResolveAt} C ${planC4.autoResolveAt}`);
  const r4 = [];
  r4.push(expectRefusal(4, await open(P1, "battle-p1-open-scout-march", mF.id, reportF.targetVillageVersion, GOOD_PLAN), "open a scout march", "MARCH_NOT_READY", MSG.MARCH_NOT_READY));
  r4.push(expectRefusal(4, await open(W, "battle-w-open-p1-b", B.id, reportF.targetVillageVersion, GOOD_PLAN), "W opens p1's march", "MARCH_NOT_READY", MSG.MARCH_NOT_READY));
  r4.push(expectRefusal(4, await open(P1, "battle-p1-open-b-bad-plan", B.id, reportF.targetVillageVersion, { ...GOOD_PLAN, style: "Cavalry Charge" }), "unknown plan", "INVALID_PLAN", MSG.INVALID_PLAN));
  expect(4, count("local_battle_sessions") === 0, "a refusal opened a battle");
  const fRow4 = villageRow(F.id);
  const openB = await open(P1, "battle-p1-open-b", B.id, reportF.targetVillageVersion, GOOD_PLAN);
  expect(4, openB.status === 200 && openB.json?.type === "command.accepted" && openB.json.payload.battle?.status === "open", `battle.open B: ${openB.status} ${openB.text}`);
  const battleB = openB.json.payload.battle;
  const rowB4 = battleRow(battleB.id);
  expect(4, rowB4.status === "open" && rowB4.outcomeJson === null && rowB4.resolvedAt === null, `session row ${JSON.stringify(rowB4)}`);
  expect(4, same(rowB4.attackerArmy, ARMY_B) && same(rowB4.defenderArmy, fRow4.army) && rowB4.wall === fRow4.buildings.wall && withinTrickle(rowB4.defenderResources, fRow4.resources) && rowB4.defenderVersion >= fRow4.stateVersion && rowB4.defenderVersion <= fRow4.stateVersion + 1 && same(rowB4.plan, GOOD_PLAN), `frozen inputs ${JSON.stringify(rowB4)} vs F's row ${JSON.stringify(fRow4)}`);
  const expectedSeed = createHash("sha256").update(`${s1.world.id}:${B.id}:${rowB4.openedAt}`).digest("hex").slice(0, 24);
  expect(4, rowB4.seed === expectedSeed && battleB.seed === expectedSeed, `seed ${rowB4.seed} != sha256("${s1.world.id}:${B.id}:${rowB4.openedAt}")[:24] = ${expectedSeed}`);
  const planB4b = planRow(B.id);
  // The grace is 180 s from the instant of acceptance, which store.ts reads
  // with a second now() after the session's opened_at - so the deadline may
  // sit a millisecond or two past opened_at + 180 s (observed on the first
  // recorded run: +1 ms). Never earlier, never a different grace.
  const graceMs = ms(planB4b.autoResolveAt) - ms(rowB4.openedAt);
  expect(4, graceMs >= ATTENDED_GRACE_MS && graceMs < ATTENDED_GRACE_MS + 100 && ms(planB4b.autoResolveAt) > ms(planB4.autoResolveAt), `grace: auto_resolve_at ${planB4b.autoResolveAt} vs openedAt ${rowB4.openedAt} + 180 s (${graceMs} ms; was ${planB4.autoResolveAt})`);
  expect(4, same(planB4b.plan, UNPLANNED_ATTACK_PLAN), `the march's plan row changed on open: ${JSON.stringify(planB4b.plan)} (observed: the session carries the opened plan, the march row keeps the launch plan)`);
  const marchB4 = marchRows(P1.kingdomId).find((m) => m.id === B.id);
  expect(4, marchB4.status === "awaiting_battle" && marchB4.battleId === battleB.id, `B's row after open ${JSON.stringify(marchB4)}`);
  expect(4, same(villageRow(F.id).army, fRow4.army), "opening a battle moved the garrison");
  r4.push(expectRefusal(4, await open(P1, "battle-p1-open-c-siege", C.id, reportF.targetVillageVersion, GOOD_PLAN), "open C while B's battle is open", "SIEGE_IN_PROGRESS", MSG.SIEGE_IN_PROGRESS));
  expect(4, count("local_battle_sessions") === 1 && planRow(C.id).autoResolveAt === planC4.autoResolveAt, "the SIEGE_IN_PROGRESS refusal opened a session or moved C's deadline");
  const s4 = await P1.snapshot();
  expect(4, s4.battleSessions.length === 1 && s4.battleSessions[0].id === battleB.id && s4.battleSessions[0].status === "open" && s4.battleSessions[0].acceptedOrders === 0 && same(s4.battleSessions[0].defenderArmy, FREEHOLD_GARRISON), `p1's battleSessions ${JSON.stringify(s4.battleSessions)}`);
  record(4, true, `B at the walls ${atWallsB.observedAt} (due ${B.arrivesAt}), C ${atWallsC.observedAt} (due ${C.arrivesAt}), deadlines = arrivesAt + 120 s; ${r4.slice(0, 3).join("; ")}; B opened → ${battleB.id} 'open' at ${rowB4.openedAt}, frozen: attacker ${compact(rowB4.attackerArmy)} vs ${compact(rowB4.defenderArmy)} behind wall ${rowB4.wall} over ${JSON.stringify(rowB4.defenderResources)} (= F's row), plan ${JSON.stringify(GOOD_PLAN)} (score ${battlePlanScore(GOOD_PLAN)}), seed ${rowB4.seed} = sha256(world:march:openedAt)[:24]; auto_resolve_at ${planB4.autoResolveAt} → ${planB4b.autoResolveAt} (openedAt + ${graceMs} ms = 180 s from acceptance, ${graceMs - ATTENDED_GRACE_MS} ms after opened_at + 180 s); march.battleId set; ${r4[3]}; 1 session, F's garrison untouched`);

  // ------------------------------------------------------------------ 5
  step(5, "E5 — field orders on the open battle: sequences 1 and 2 accepted; sequence 5 out of turn → INVALID_ORDER; W's order on p1's battle → BATTLE_CLOSED; an order sent with a deliberately STALE expectedWorldVersion is still accepted (live field orders are exempt from the world-version check); sequences 3–5 accepted; the 6th → ORDER_CAP_REACHED; acceptedOrders 5 in the snapshot; orders do not move the world version or the garrison");
  const version5 = (await P1.snapshot()).world.version;
  const r5 = [];
  const o1 = await order(P1, "battle-p1-order-1", battleB.id, 1, "vanguard", 2500, 1200, 1000);
  const o2 = await order(P1, "battle-p1-order-2", battleB.id, 2, "archers", 1800, 900, 4000);
  expect(5, o1.status === 200 && o1.json?.type === "command.accepted" && o2.status === 200 && o2.json?.type === "command.accepted", `orders 1/2: ${o1.status} ${o1.text} / ${o2.status} ${o2.text}`);
  r5.push(expectRefusal(5, await order(P1, "battle-p1-order-5-early", battleB.id, 5, "riders", 3000, 3000, 6000), "sequence 5 after 2", "INVALID_ORDER", MSG.INVALID_ORDER(3)));
  r5.push(expectRefusal(5, await order(W, "battle-w-order-3", battleB.id, 3, "riders", 3000, 3000, 6000), "W orders p1's battle", "BATTLE_CLOSED", MSG.BATTLE_CLOSED_ORDER));
  const stale = await order(P1, "battle-p1-order-3-stale-version", battleB.id, 3, "riders", 3000, 3000, 6000, { version: 1 });
  expect(5, stale.status === 200 && stale.json?.type === "command.accepted" && stale.body.expectedWorldVersion === 1, `order 3 with expectedWorldVersion 1 (world at ${version5}): ${stale.status} ${stale.text}`);
  const o4 = await order(P1, "battle-p1-order-4", battleB.id, 4, "vanguard", 2600, 1500, 9000);
  const o5 = await order(P1, "battle-p1-order-5", battleB.id, 5, "archers", 1900, 1100, 12000);
  expect(5, o4.status === 200 && o5.status === 200 && o4.json?.type === "command.accepted" && o5.json?.type === "command.accepted", `orders 4/5: ${o4.status} / ${o5.status}`);
  r5.push(expectRefusal(5, await order(P1, "battle-p1-order-6", battleB.id, 6, "riders", 3100, 2900, 15000), "6th order", "ORDER_CAP_REACHED", MSG.ORDER_CAP));
  expect(5, count("local_battle_orders", `battle_id = '${battleB.id}'`) === BATTLE_ORDER_CAP, `order rows != ${BATTLE_ORDER_CAP}`);
  const s5 = await P1.snapshot();
  expect(5, s5.battleSessions[0].acceptedOrders === BATTLE_ORDER_CAP && s5.battleSessions[0].status === "open", `snapshot battle ${JSON.stringify(s5.battleSessions[0])}`);
  expect(5, s5.world.version === version5, `orders moved the world version ${version5} → ${s5.world.version}`);
  expect(5, same(villageRow(F.id).army, FREEHOLD_GARRISON) && battleRow(battleB.id).status === "open", "orders fought something");
  record(5, true, `orders 1, 2 accepted; ${r5[0]} "${MSG.INVALID_ORDER(3)}"; ${r5[1]}; order 3 with expectedWorldVersion 1 against world version ${version5} → 200 accepted (field-order exemption); orders 4, 5 accepted; ${r5[2]} "${MSG.ORDER_CAP}"; ${BATTLE_ORDER_CAP} order rows, acceptedOrders ${s5.battleSessions[0].acceptedOrders}; world version ${version5} unchanged; battle still 'open', garrison untouched`);

  // ------------------------------------------------------------------ 6
  step(6, "E4/E6/B6 — battle.resolve of B: the stored outcome equals game-core resolveBattle(frozen inputs) BYTE FOR BYTE; attacker wins; prisoners taken from an overwhelmed garrison; loot = calculateLoot(frozen stock, survivors); the Freehold's row loses casualties + prisoners and the loot; war points += max(10, 3 × casualties); the march turns 'returning'/'return' carrying survivors + prisoners and the loot, due at resolvedAt + the return leg for THAT column; auto_resolve_at NULL; both notifications stamped at resolvedAt; replay byte-identical; then BATTLE_CLOSED ×2, MARCH_NOT_READY; and battle.open of C with the report's own version → STALE_SCOUT_REPORT because the battle changed the garrison");
  const fBefore6 = villageRow(F.id);
  const pointsBefore6 = warPoints(P1.kingdomId);
  const resolveB = await command(P1, "battle-p1-resolve-b", { type: "battle.resolve", payload: { battleId: battleB.id } });
  expect(6, resolveB.status === 200 && resolveB.json?.type === "command.accepted" && resolveB.json.payload.battle?.status === "resolved" && resolveB.json.payload.march?.status === "returning", `battle.resolve B: ${resolveB.status} ${resolveB.text}`);
  const settledB = resolveB.json.payload.battle;
  const marchB6 = resolveB.json.payload.march;
  const rowB6 = battleRow(battleB.id);
  expect(6, rowB6.status === "resolved" && rowB6.orderCount === BATTLE_ORDER_CAP && rowB6.resolvedAt !== null, `row ${JSON.stringify(rowB6)}`);
  const oracleB = oracleOutcome(rowB6);
  expect(6, rowB6.outcomeJson === JSON.stringify(oracleB), `stored outcome differs from resolveBattle(frozen inputs):\n  stored ${rowB6.outcomeJson}\n  oracle ${JSON.stringify(oracleB)}`);
  expect(6, same(settledB.outcome, oracleB), "the snapshot's outcome differs from the row's");
  log(`outcome B (stored == oracle): winner ${oracleB.winner}; attacker ${compact(rowB6.attackerArmy)} → survivors ${compact(oracleB.attackerSurvivors)} (casualties ${compact(oracleB.attackerCasualties)}); defender ${compact(rowB6.defenderArmy)} → survivors ${compact(oracleB.defenderSurvivors)}, casualties ${compact(oracleB.defenderCasualties)}, yielded ${compact(oracleB.yielded)}; loot ${JSON.stringify(oracleB.loot)}; planScore ${oracleB.planScore}; orderBonus ${oracleB.orderBonus}`);
  expect(6, oracleB.winner === "attacker" && oracleB.planScore === 4 && oracleB.orderBonus === 0.1, `B was meant to be an attended win with the best plan and 5 orders: ${JSON.stringify([oracleB.winner, oracleB.planScore, oracleB.orderBonus])}`);
  expect(6, armyUnitCount(oracleB.yielded) > 0, "10 Berserkers under the best plan against 10 Squires behind no wall should be overwhelming (≥ 3×) and take prisoners");
  expect(6, same(oracleB.loot, calculateLoot(rowB6.defenderResources, oracleB.attackerSurvivors)) && sumRes(oracleB.loot) > 0, `loot ${JSON.stringify(oracleB.loot)} != calculateLoot(frozen stock, survivors)`);
  expect(6, TROOPS.every((t) => oracleB.defenderCasualties[t] + oracleB.defenderSurvivors[t] + oracleB.yielded[t] === rowB6.defenderArmy[t]) && TROOPS.every((t) => oracleB.attackerSurvivors[t] + oracleB.attackerCasualties[t] === rowB6.attackerArmy[t]), "conservation inside the outcome (dead + standing + yielded = fought)");
  const fAfter6 = villageRow(F.id);
  expect(6, same(fAfter6.army, subArmies(subArmies(fBefore6.army, oracleB.defenderCasualties), oracleB.yielded)), `F's garrison ${compact(fBefore6.army)} → ${compact(fAfter6.army)}, expected minus casualties ${compact(oracleB.defenderCasualties)} and prisoners ${compact(oracleB.yielded)}`);
  expect(6, withinTrickle(fAfter6.resources, subRes(fBefore6.resources, oracleB.loot)) && fAfter6.stateVersion > fBefore6.stateVersion && fAfter6.kingdomId === F.kingdomId, `F's stock ${JSON.stringify(fBefore6.resources)} → ${JSON.stringify(fAfter6.resources)} (loot ${JSON.stringify(oracleB.loot)}); still ${fAfter6.kingdomId}`);
  const expectedPointsB = Math.max(10, armyUnitCount(oracleB.defenderCasualties) * 3);
  expect(6, warPoints(P1.kingdomId) - pointsBefore6 === expectedPointsB, `war points ${pointsBefore6} → ${warPoints(P1.kingdomId)}, expected +${expectedPointsB}`);
  const homeward = addArmiesCore(oracleB.attackerSurvivors, oracleB.yielded);
  const rowMarchB6 = marchRows(P1.kingdomId).find((m) => m.id === B.id);
  expect(6, rowMarchB6.status === "returning" && rowMarchB6.kind === "return" && same(rowMarchB6.army, homeward) && same(rowMarchB6.loot, oracleB.loot) && same(marchB6.army, homeward) && same(marchB6.loot, oracleB.loot), `B's march row ${JSON.stringify(rowMarchB6)} vs homeward ${compact(homeward)} + loot ${JSON.stringify(oracleB.loot)}`);
  const returnB_s = marchDurationSeconds(dF, "return", homeward);
  expect(6, secondsBetween(rowB6.resolvedAt, rowMarchB6.arrivesAt) === returnB_s, `return leg ${secondsBetween(rowB6.resolvedAt, rowMarchB6.arrivesAt)}s != marchDurationSeconds(${dF.toFixed(4)}, 'return', ${compact(homeward)}) = ${returnB_s}s`);
  expect(6, planRow(B.id).autoResolveAt === null, "auto_resolve_at not cleared after settlement");
  const victoryMsg = `Victory. ${armyUnitCount(oracleB.attackerSurvivors)} survivors are returning with ${sumRes(oracleB.loot)} resources. ${armyUnitCount(oracleB.yielded)} of their troops surrendered and march with you.`;
  const p1Notes6 = notificationsFor(P1.kingdomId);
  const fNotes6 = notificationsFor(F.kingdomId);
  const p1Victory = p1Notes6.find((n) => n.kind === "battle" && n.message === victoryMsg);
  const fDefeated = fNotes6.find((n) => n.kind === "battle" && n.message === `Your village defenses were defeated and ${armyUnitCount(oracleB.yielded)} of your troops surrendered.`);
  expect(6, p1Victory && p1Victory.createdAt === rowB6.resolvedAt, `attacker notification: ${JSON.stringify(p1Notes6.filter((n) => n.kind === "battle"))} (expected "${victoryMsg}" at ${rowB6.resolvedAt})`);
  expect(6, fDefeated && fDefeated.createdAt === rowB6.resolvedAt, `Freehold's notification: ${JSON.stringify(fNotes6)}`);
  expect(6, count("local_world_events", "event_type = 'village.conquered'") === 0 && count("local_world_events", "event_type = 'battle.resolved'") === 1 && count("local_world_events", "event_type = 'battle.started'") === 1, "events: expected one battle.started, one battle.resolved, no conquest (no Count rode)");
  const inbox6 = count("local_command_inbox");
  const replay6 = await request("POST", "/api/roblox/commands", resolveB.body);
  expect(6, replay6.status === 200 && replay6.text === resolveB.text && count("local_command_inbox") === inbox6, `battle.resolve replay differs or stored again: ${replay6.text}`);
  expect(6, same(villageRow(F.id).army, fAfter6.army) && warPoints(P1.kingdomId) - pointsBefore6 === expectedPointsB, "the replay settled the battle twice");
  const r6 = [];
  r6.push(expectRefusal(6, await command(P1, "battle-p1-resolve-b-again", { type: "battle.resolve", payload: { battleId: battleB.id } }), "resolve again", "BATTLE_CLOSED", MSG.BATTLE_CLOSED_RESOLVE));
  r6.push(expectRefusal(6, await order(P1, "battle-p1-order-after", battleB.id, 6, "riders", 3000, 3000, 20000), "order after settlement", "BATTLE_CLOSED", MSG.BATTLE_CLOSED_ORDER));
  r6.push(expectRefusal(6, await open(P1, "battle-p1-open-b-again", B.id, reportF.targetVillageVersion, GOOD_PLAN), "open B again", "MARCH_NOT_READY", MSG.MARCH_NOT_READY));
  r6.push(expectRefusal(6, await open(P1, "battle-p1-open-c-stale", C.id, reportF.targetVillageVersion, GOOD_PLAN), "open C with the report's own version after B thinned the garrison", "STALE_SCOUT_REPORT", MSG.STALE_SCOUT_REPORT));
  const planC6 = planRow(C.id);
  expect(6, planC6.autoResolveAt === planC4.autoResolveAt && marchRows(P1.kingdomId).find((m) => m.id === C.id).status === "awaiting_battle" && count("local_battle_sessions") === 1, `C after the refusals: ${JSON.stringify(planC6)}`);
  record(6, true, `battle ${battleB.id} resolved at ${rowB6.resolvedAt}: stored outcome == resolveBattle(frozen) byte-for-byte; winner attacker; ${compact(rowB6.attackerArmy)} → ${compact(oracleB.attackerSurvivors)} standing; defender ${compact(rowB6.defenderArmy)} → ${compact(oracleB.defenderCasualties)} dead, ${compact(oracleB.yielded)} surrendered, ${compact(oracleB.defenderSurvivors) === "{}" ? "none" : compact(oracleB.defenderSurvivors)} standing; loot ${JSON.stringify(oracleB.loot)} = calculateLoot (carry ${armyUnitCount(oracleB.attackerSurvivors) * 10}); F's row: army ${compact(fBefore6.army)} → ${compact(fAfter6.army)}, stock ${JSON.stringify(fBefore6.resources)} → ${JSON.stringify(fAfter6.resources)}, still ${fAfter6.kingdomId}; war points +${expectedPointsB}; march → 'returning' kind 'return' with ${compact(homeward)} and the loot, due ${rowMarchB6.arrivesAt} (= resolvedAt + ${returnB_s}s); auto_resolve_at NULL; "${victoryMsg}" and "${fDefeated.message}" at resolvedAt; replay byte-identical, nothing settled twice; ${r6.join("; ")}; C still awaiting, deadline ${planC6.autoResolveAt} unchanged`);

  // ------------------------------------------------------------------ 7
  step(7, "C1 (loot route) — B's column comes home at exactly its arrivesAt: the village army gains survivors + prisoners, the barn gains exactly the loot (plus at most the 28/h trickle), the notification is stamped at arrivesAt, the march is 'complete' — resources arrived from OUTSIDE a village for the first time over the wire");
  const homeBefore7 = villageRow(P1.villageId);
  const homecomingB = await waitForMarchStatus(P1, B.id, "complete", rowMarchB6.arrivesAt);
  expect(7, homecomingB, `B not 'complete' within 10 s of ${rowMarchB6.arrivesAt}`);
  const homeAfter7 = villageRow(P1.villageId);
  expect(7, same(homeAfter7.army, addArmies(homeBefore7.army, homeward)), `army ${compact(homeBefore7.army)} + ${compact(homeward)} != ${compact(homeAfter7.army)}`);
  expect(7, withinTrickle(homeAfter7.resources, addRes(homeBefore7.resources, oracleB.loot)), `resources ${JSON.stringify(homeBefore7.resources)} + loot ${JSON.stringify(oracleB.loot)} → ${JSON.stringify(homeAfter7.resources)}`);
  const returnedMsg = `${armyUnitCount(homeward)} troops returned to ${homeAfter7.name}.`;
  const note7 = homecomingB.snapshot.notifications.find((n) => n.kind === "march" && n.message === returnedMsg);
  expect(7, note7 && note7.createdAt === rowMarchB6.arrivesAt, `homecoming notification ${JSON.stringify(note7)} (expected "${returnedMsg}" at ${rowMarchB6.arrivesAt})`);
  const ownView7 = ownVillage(homecomingB.snapshot);
  expect(7, same(ownView7.resources, homeAfter7.resources) && same(ownView7.army, homeAfter7.army), "the snapshot's own village differs from the row");
  record(7, true, `B home at ${rowMarchB6.arrivesAt} (observed ${homecomingB.observedAt}); army ${compact(homeBefore7.army)} → ${compact(homeAfter7.army)} (+${compact(homeward)}: survivors and prisoners); barn ${JSON.stringify(homeBefore7.resources)} → ${JSON.stringify(homeAfter7.resources)} (+${JSON.stringify(oracleB.loot)} loot, within the trickle); "${returnedMsg}" at arrivesAt; march 'complete'`);

  // ------------------------------------------------------------------ 8
  step(8, "the server fights the two attacks nobody attended: a pull 1.5 s before A's deadline shows nothing fought and both still 'awaiting_battle'; then at auto_resolve_at each opens and settles in ONE pass (opened_at and resolved_at milliseconds apart, ≥ the deadline, delay recorded); A under the plan chosen at LAUNCH with 0 orders → DEFEAT (total wipe, no loot, D's garrison minus the casualties, D told 'Your garrison held the village.', D's live stream received battle.started + battle.resolved); C under UNPLANNED → VICTORY over the garrison B emptied, looting the stock B left (frozen stock == F's row after B); both outcomes == the oracle byte-for-byte");
  const planA8 = planRow(A.id); const planC8 = planRow(C.id);
  expect(8, planA8.autoResolveAt && ms(planA8.autoResolveAt) - ms(A.arrivesAt) === DEFAULT_AUTO_RESOLVE_MS, `A's deadline ${JSON.stringify(planA8)} (A due ${A.arrivesAt})`);
  const firstDeadline = ms(planA8.autoResolveAt) < ms(planC8.autoResolveAt) ? planA8.autoResolveAt : planC8.autoResolveAt;
  const lastDeadline = ms(planA8.autoResolveAt) < ms(planC8.autoResolveAt) ? planC8.autoResolveAt : planA8.autoResolveAt;
  const dEvents8 = await webEvents(D, 0);
  const dStream = await openStream(D, dEvents8.currentWorldVersion);
  await Promise.race([dStream.readyPromise, sleep(3_000)]);
  expect(8, dStream.ready, "D's stream never sent ready");
  const preWait = ms(firstDeadline) - 1_500 - Date.now();
  if (preWait > 0) { log(`waiting ${Math.round(preWait / 1000)}s until 1.5 s before the first deadline ${firstDeadline}`); await sleep(preWait); }
  const pre8 = await P1.snapshot();
  const preAt = new Date().toISOString();
  expect(8, ms(preAt) < ms(firstDeadline) && pre8.battleSessions.length === 1 && pre8.marches.filter((m) => m.status === "awaiting_battle").length === 2 && count("local_battle_sessions") === 1, `before the deadline (${preAt}): sessions ${pre8.battleSessions.length}, awaiting ${pre8.marches.filter((m) => m.status === "awaiting_battle").length}`);
  log(`${preAt}: 1 session (B, resolved), A and C still 'awaiting_battle'; first deadline ${firstDeadline}`);
  const settledAt = {};
  for (const deadline = ms(lastDeadline) + 10_000; Date.now() < deadline;) {
    const snap = await P1.snapshot();
    const seen = new Date().toISOString();
    for (const id of [A.id, C.id]) { const m = snap.marches.find((x) => x.id === id); if (m?.status === "returning" && !settledAt[id]) settledAt[id] = { snapshot: snap, march: m, observedAt: seen }; }
    if (settledAt[A.id] && settledAt[C.id]) break;
    await sleep(250);
  }
  expect(8, settledAt[A.id] && settledAt[C.id], `not both settled within 10 s of ${lastDeadline}: ${JSON.stringify(Object.keys(settledAt))}`);
  const summaries8 = [];
  const settled = {};
  for (const [label, M, plan, expectedWinner] of [["A", A, GOOD_PLAN, "defender"], ["C", C, UNPLANNED_ATTACK_PLAN, "attacker"]]) {
    const m = settledAt[M.id].march;
    const row = battleRow(m.battleId);
    // Opened and settled in the same materialize pass; the two stamps are
    // separate now() reads inside it, so they may differ by a millisecond or
    // two (observed, recorded below), never by a deadline.
    const passGapMs = ms(row.resolvedAt) - ms(row.openedAt);
    expect(8, row && row.status === "resolved" && passGapMs >= 0 && passGapMs < 100, `${label}: session ${JSON.stringify(row)} (an unattended battle must open and settle in one pass; opened ${row?.openedAt}, resolved ${row?.resolvedAt})`);
    const planRowNow = planRow(M.id);
    const deadlineIso = label === "A" ? planA8.autoResolveAt : planC8.autoResolveAt;
    const delayMs = ms(row.openedAt) - ms(deadlineIso);
    expect(8, delayMs >= 0 && delayMs < 2_000, `${label}: fought at ${row.openedAt}, deadline ${deadlineIso} (delay ${delayMs} ms)`);
    expect(8, same(row.plan, plan) && row.orderCount === 0, `${label}: plan ${JSON.stringify(row.plan)} orders ${row.orderCount}`);
    const oracle = oracleOutcome(row);
    expect(8, row.outcomeJson === JSON.stringify(oracle), `${label}: stored outcome differs from the oracle:\n  stored ${row.outcomeJson}\n  oracle ${JSON.stringify(oracle)}`);
    expect(8, oracle.winner === expectedWinner && oracle.orderBonus === 0 && oracle.planScore === battlePlanScore(plan), `${label}: ${JSON.stringify([oracle.winner, oracle.orderBonus, oracle.planScore])}`);
    expect(8, row.seed === createHash("sha256").update(`${s1.world.id}:${M.id}:${row.openedAt}`).digest("hex").slice(0, 24), `${label}: seed derivation`);
    expect(8, planRowNow.autoResolveAt === null && m.status === "returning" && m.kind === "return", `${label}: plan ${JSON.stringify(planRowNow)}, march ${JSON.stringify(m)}`);
    const homewardX = addArmiesCore(oracle.attackerSurvivors, oracle.yielded);
    expect(8, same(m.army, homewardX) && same(m.loot, oracle.loot) && secondsBetween(row.resolvedAt, m.arrivesAt) === marchDurationSeconds(label === "A" ? dD : dF, "return", homewardX), `${label}: homeward ${JSON.stringify(m)} vs ${compact(homewardX)} / ${JSON.stringify(oracle.loot)}`);
    log(`outcome ${label} (stored == oracle): opened ${row.openedAt}, resolved ${row.resolvedAt} (${passGapMs} ms later, same pass; ${delayMs} ms after the deadline ${deadlineIso}); winner ${oracle.winner}; attacker ${compact(row.attackerArmy)} → ${compact(oracle.attackerSurvivors) === "{}" ? "nobody" : compact(oracle.attackerSurvivors)}; defender ${compact(row.defenderArmy) === "{}" ? "empty garrison" : compact(row.defenderArmy)} → casualties ${compact(oracle.defenderCasualties)}, yielded ${compact(oracle.yielded)}; wall ${row.wall}; stock ${JSON.stringify(row.defenderResources)}; loot ${JSON.stringify(oracle.loot)}; plan ${JSON.stringify(row.plan)} (score ${oracle.planScore}), orders 0`);
    settled[label] = { row, oracle, march: m, delayMs, passGapMs, homeward: homewardX };
  }
  // A: the defeat at D's walls.
  const dRow8 = villageRow(D.villageId);
  expect(8, same(settled.A.row.defenderArmy, seed) && settled.A.row.wall === 1, `A fought ${compact(settled.A.row.defenderArmy)} behind wall ${settled.A.row.wall}, expected the seed garrison`);
  expect(8, armyUnitCount(settled.A.oracle.attackerSurvivors) === 0 && sumRes(settled.A.oracle.loot) === 0 && armyUnitCount(settled.A.oracle.yielded) === 0, `A's defeat: ${JSON.stringify(settled.A.oracle)}`);
  expect(8, same(dRow8.army, subArmies(seed, settled.A.oracle.defenderCasualties)) && withinTrickle(dRow8.resources, FIXTURE_RESOURCES, 3), `D's row ${JSON.stringify(dRow8)} vs seed minus ${compact(settled.A.oracle.defenderCasualties)}`);
  const dSnap8 = await D.snapshot();
  const dBattle = dSnap8.battleSessions.find((b) => b.id === settled.A.march.battleId);
  expect(8, dSnap8.battleSessions.length === 1 && dBattle?.status === "resolved" && dBattle.defenderVillageId === D.villageId && same(dBattle.outcome, settled.A.oracle), `D's battleSessions ${JSON.stringify(dSnap8.battleSessions.map((b) => [b.id, b.status, b.defenderVillageId]))}`);
  const dHeld = dSnap8.notifications.find((n) => n.kind === "battle" && n.message === MSG.HELD);
  expect(8, dHeld && dHeld.createdAt === settled.A.row.resolvedAt, `D's notification ${JSON.stringify(dSnap8.notifications)}`);
  const defeatMsg = `Defeat. 0 survivors are returning home.`;
  const p1Defeat = notificationsFor(P1.kingdomId).find((n) => n.kind === "battle" && n.message === defeatMsg);
  expect(8, p1Defeat && p1Defeat.createdAt === settled.A.row.resolvedAt, `p1's defeat notification missing: expected "${defeatMsg}" at ${settled.A.row.resolvedAt}`);
  await sleep(1_000);
  const dLive = dStream.events.filter((e) => BATTLE_EVENT_TYPES.includes(e.type));
  expect(8, dLive.length === 2 && dLive[0].type === "battle.started" && dLive[1].type === "battle.resolved" && dLive.every((e) => e.payload.battle.id === settled.A.march.battleId), `D's live stream battle events ${JSON.stringify(dLive.map((e) => [e.type, e.payload.battle?.id]))}`);
  expect(8, dStream.events.every((e) => BATTLE_EVENT_TYPES.includes(e.type) || !PRIVATE_EVENT_TYPES.includes(e.type)), `D's live stream carried someone else's private event: ${JSON.stringify(dStream.events.map((e) => e.type))}`);
  log(`D's live stream: ${dStream.events.length} events ${JSON.stringify(dStream.events.map((e) => [e.type, e.receivedAt]))} — battle.started and battle.resolved for ${settled.A.march.battleId} (the defender learns of the battle the instant it is fought)`);
  await dStream.close();
  // C: the unattended victory over what B left.
  expect(8, same(settled.C.row.defenderArmy, fAfter6.army) && armyUnitCount(settled.C.row.defenderArmy) === 0 && settled.C.row.wall === 0, `C's frozen defender ${compact(settled.C.row.defenderArmy)} behind wall ${settled.C.row.wall} is not the empty garrison B left`);
  expect(8, withinTrickle(settled.C.row.defenderResources, fAfter6.resources, 2), `C's frozen stock ${JSON.stringify(settled.C.row.defenderResources)} vs F's row after B ${JSON.stringify(fAfter6.resources)} (loot conserved: C loots what B left)`);
  expect(8, same(settled.C.oracle.loot, calculateLoot(settled.C.row.defenderResources, settled.C.oracle.attackerSurvivors)) && sumRes(settled.C.oracle.loot) > 0 && sumRes(addRes(settled.C.oracle.loot, oracleB.loot)) <= sumRes(FREEHOLD_RESOURCES), `C's loot ${JSON.stringify(settled.C.oracle.loot)}`);
  const fRow8 = villageRow(F.id);
  expect(8, withinTrickle(fRow8.resources, subRes(settled.C.row.defenderResources, settled.C.oracle.loot)) && armyUnitCount(fRow8.army) === 0 && fRow8.kingdomId === F.kingdomId, `F's row after C ${JSON.stringify(fRow8)}`);
  const expectedPointsC = Math.max(10, armyUnitCount(settled.C.oracle.defenderCasualties) * 3);
  expect(8, warPoints(P1.kingdomId) === pointsBefore6 + expectedPointsB + expectedPointsC, `war points ${warPoints(P1.kingdomId)} != ${pointsBefore6} + ${expectedPointsB} + ${expectedPointsC}`);
  const s8 = await P1.snapshot();
  expect(8, s8.arena.warVictoryPoints === warPoints(P1.kingdomId) && s8.battleSessions.length === 3 && s8.battleSessions.every((b) => b.status === "resolved"), `p1's arena/battles ${JSON.stringify([s8.arena.warVictoryPoints, s8.battleSessions.map((b) => b.status)])}`);
  const victoryC = `Victory. ${armyUnitCount(settled.C.oracle.attackerSurvivors)} survivors are returning with ${sumRes(settled.C.oracle.loot)} resources.`;
  const p1VictoryC = notificationsFor(P1.kingdomId).find((n) => n.kind === "battle" && n.message === victoryC);
  expect(8, p1VictoryC && p1VictoryC.createdAt === settled.C.row.resolvedAt, `C's victory notification missing: expected "${victoryC}"`);
  expect(8, count("local_battle_sessions", "status = 'open'") === 0 && count("local_marches", "status = 'awaiting_battle'") === 0, "something is still parked");
  record(8, true, `pre-deadline pull ${preAt}: nothing fought; A fought ${settled.A.row.openedAt} = ${settled.A.delayMs} ms after ${planA8.autoResolveAt}, resolved_at ${settled.A.passGapMs} ms after opened_at (same pass), plan from launch ${JSON.stringify(GOOD_PLAN)}, 0 orders, outcome == oracle: DEFEAT, all 5 Squires dead, no loot, D's garrison ${compact(seed)} → ${compact(dRow8.army)} (casualties ${compact(settled.A.oracle.defenderCasualties)}); D sees the battle in its own snapshot, "${MSG.HELD}" at resolvedAt, live stream got battle.started + battle.resolved; p1 "${defeatMsg}"; C fought ${settled.C.row.openedAt} = ${settled.C.delayMs} ms after ${planC8.autoResolveAt} (settled ${settled.C.passGapMs} ms later), UNPLANNED, outcome == oracle: VICTORY over the empty garrison B left, frozen stock ${JSON.stringify(settled.C.row.defenderResources)} = F's row after B, loot ${JSON.stringify(settled.C.oracle.loot)}, survivors ${compact(settled.C.oracle.attackerSurvivors)}; F's row now ${JSON.stringify(fRow8.resources)}, garrison empty, still ${fRow8.kingdomId}; war points ${pointsBefore6} + ${expectedPointsB} + ${expectedPointsC} = ${warPoints(P1.kingdomId)} (= arena.warVictoryPoints); "${victoryC}"; 0 open, 0 awaiting`);

  // ------------------------------------------------------------------ 9
  step(9, "D2 for battles — W's replay (uninvolved) carries no battle, march or scout event while the DB holds three battle.started and three battle.resolved; D's replay carries exactly the two events of the battle at its own walls and nothing of B or C; p1's snapshot lists all three battles");
  const wEvents = await webEvents(W, 0);
  const wLeak = wEvents.events.filter((e) => PRIVATE_EVENT_TYPES.includes(e.type));
  expect(9, wLeak.length === 0, `W's replay leaks: ${JSON.stringify(wLeak.map((e) => e.type))}`);
  const dEvents = await webEvents(D, 0);
  const dBattleEvents = dEvents.events.filter((e) => BATTLE_EVENT_TYPES.includes(e.type));
  expect(9, dBattleEvents.length === 2 && dBattleEvents.every((e) => e.payload.battle.id === settled.A.march.battleId && e.payload.battle.defenderKingdomId === D.kingdomId) && dEvents.events.filter((e) => PRIVATE_EVENT_TYPES.includes(e.type)).length === 2, `D's replay private events ${JSON.stringify(dEvents.events.filter((e) => PRIVATE_EVENT_TYPES.includes(e.type)).map((e) => [e.type, e.payload.battle?.id]))}`);
  const started = count("local_world_events", "event_type = 'battle.started'"); const resolved = count("local_world_events", "event_type = 'battle.resolved'");
  expect(9, started === 3 && resolved === 3, `DB holds ${started} battle.started / ${resolved} battle.resolved`);
  const p1Battles = (await P1.snapshot()).battleSessions;
  expect(9, p1Battles.length === 3 && same(p1Battles.map((b) => b.id).sort(), [battleB.id, settled.A.march.battleId, settled.C.march.battleId].sort()), `p1's battles ${JSON.stringify(p1Battles.map((b) => b.id))}`);
  record(9, true, `W: ${wEvents.events.length} events, 0 private (${JSON.stringify([...new Set(wEvents.events.map((e) => e.type))])}) while the DB holds ${started} battle.started + ${resolved} battle.resolved; D: exactly battle.started + battle.resolved for ${settled.A.march.battleId} (its own walls), nothing of B or C; p1's snapshot lists all 3 battles`);

  // ------------------------------------------------------------------ 10
  step(10, "the way home and the ledger: A's empty column (0 troops — observed) and C's survivors land at exactly their arrivesAt with notifications stamped there; C's loot lands in the barn; p1's final army = seed − every casualty + the prisoners, with the two Spies home; p1's barn = fixture + loot B + loot C (within the trickle); D and the Freehold reconcile; 3 sessions all 'resolved', every deadline NULL; the world is stopped");
  const summary10 = [];
  // Whichever column is due first is checked first, so the "before" row for
  // the second one is read before the second lands.
  const homecomings = [["A", A], ["C", C]].map(([label, M]) => [label, M, marchRows(P1.kingdomId).find((m) => m.id === M.id)]).sort((x, y) => ms(x[2].arrivesAt) - ms(y[2].arrivesAt));
  for (const [label, M, row] of homecomings) {
    const before = villageRow(P1.villageId);
    const homecoming = await waitForMarchStatus(P1, M.id, "complete", row.arrivesAt);
    expect(10, homecoming, `${label} not 'complete' within 10 s of ${row.arrivesAt}`);
    const after = villageRow(P1.villageId);
    expect(10, same(after.army, addArmies(before.army, row.army)) && withinTrickle(after.resources, addRes(before.resources, row.loot)), `${label}: home ${JSON.stringify(before)} + ${JSON.stringify(row)} → ${JSON.stringify(after)}`);
    const msg = `${armyUnitCount(row.army)} troops returned to ${after.name}.`;
    const note = homecoming.snapshot.notifications.find((n) => n.kind === "march" && n.message === msg);
    expect(10, note && note.createdAt === row.arrivesAt, `${label}: notification ${JSON.stringify(note)} (expected "${msg}" at ${row.arrivesAt})`);
    summary10.push(`${label} home at ${row.arrivesAt} with ${compact(row.army) === "{}" ? "nobody" : compact(row.army)} and ${JSON.stringify(row.loot)}, "${msg}"`);
  }
  const scoutsHome = marchRows(P1.kingdomId).filter((m) => [mD.id, mF.id].includes(m.id));
  expect(10, scoutsHome.length === 2 && scoutsHome.every((m) => m.status === "complete"), `Spies ${JSON.stringify(scoutsHome)}`);
  const finalHome = villageRow(P1.villageId);
  const allCasualties = [settled.A.oracle, oracleB, settled.C.oracle].reduce((s, o) => addArmies(s, o.attackerCasualties), emptyArmy());
  const allPrisoners = [settled.A.oracle, oracleB, settled.C.oracle].reduce((s, o) => addArmies(s, o.yielded), emptyArmy());
  const expectedFinalArmy = addArmies(subArmies(seed, allCasualties), allPrisoners);
  expect(10, same(finalHome.army, expectedFinalArmy) && marchRows(P1.kingdomId).every((m) => m.status === "complete"), `p1's final army ${compact(finalHome.army)} != seed − casualties ${compact(allCasualties)} + prisoners ${compact(allPrisoners)} = ${compact(expectedFinalArmy)}`);
  const expectedBarn = addRes(addRes(FIXTURE_RESOURCES, oracleB.loot), settled.C.oracle.loot);
  expect(10, withinTrickle(finalHome.resources, expectedBarn, 3), `p1's barn ${JSON.stringify(finalHome.resources)} vs fixture + loot ${JSON.stringify(expectedBarn)}`);
  const finalD = villageRow(D.villageId); const finalF = villageRow(F.id);
  expect(10, same(finalD.army, subArmies(seed, settled.A.oracle.defenderCasualties)) && withinTrickle(finalD.resources, FIXTURE_RESOURCES, 3), `D final ${JSON.stringify(finalD)}`);
  expect(10, armyUnitCount(finalF.army) === 0 && withinTrickle(finalF.resources, subRes(subRes(FREEHOLD_RESOURCES, oracleB.loot), settled.C.oracle.loot), 3) && finalF.kingdomId === F.kingdomId, `F final ${JSON.stringify(finalF)}`);
  const sessions = sqlite("SELECT id || '|' || status || '|' || attacker_kingdom_id || '|' || defender_kingdom_id FROM local_battle_sessions ORDER BY opened_at;").split("\n").filter(Boolean);
  expect(10, sessions.length === 3 && sessions.every((s) => s.split("|")[1] === "resolved") && count("local_march_plans", "auto_resolve_at IS NOT NULL") === 0, `sessions ${JSON.stringify(sessions)}`);
  const worldDead = TROOPS.reduce((n, t) => n + allCasualties[t] + settled.A.oracle.defenderCasualties[t] + oracleB.defenderCasualties[t] + settled.C.oracle.defenderCasualties[t], 0);
  const stoppedAt = await stopServer("world server (teardown)");
  record(10, true, `${summary10.join("; ")}; both Spies home; p1 final army ${compact(finalHome.army)} = seed ${compact(seed)} − casualties ${compact(allCasualties)} + prisoners ${compact(allPrisoners)}; p1 barn ${JSON.stringify(finalHome.resources)} = fixture + loot B ${JSON.stringify(oracleB.loot)} + loot C ${JSON.stringify(settled.C.oracle.loot)} (within the trickle); D ${compact(finalD.army)}; Freehold empty, ${JSON.stringify(finalF.resources)}, still ${finalF.kingdomId}; ${worldDead} soldiers died in the world across three battles, ${armyUnitCount(allPrisoners)} changed sides, none were invented; 3 sessions resolved, 0 deadlines pending; server stopped ${stoppedAt}`);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  log("");
  log(`BATTLE-SETTLE DRILL FAILED: ${error.message}`);
} finally {
  for (const stream of openStreams) if (!stream.closed) await stream.close();
  await stopServer("world server (teardown)");
  log("");
  log("## Result");
  for (const r of results) log(`- step ${r.step}: ${r.ok ? "PASS" : "FAIL"}`);
  const passed = results.filter((r) => r.ok === true).length;
  const failed = results.filter((r) => r.ok === false).length;
  const verdict = exitCode === 0 && failed === 0 && passed === TOTAL_STEPS ? "PASS" : "FAIL";
  log(`battle-settle drill ${verdict} (${passed}/${TOTAL_STEPS} steps PASS)`);
  if (verdict === "PASS") {
    rmSync(scratch, { recursive: true, force: true });
    log(`scratch dir removed: ${scratch}`);
  } else {
    log(`scratch dir kept for inspection: ${scratch}`);
  }
  process.exit(verdict === "PASS" ? 0 : 1);
}
