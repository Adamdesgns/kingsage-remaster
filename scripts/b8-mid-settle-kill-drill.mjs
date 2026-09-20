#!/usr/bin/env node
// B8 mid-settle kill — SIGKILL while battle.resolve is in flight.
//
// The battle-settle drill (scripts/battle-settle-drill.mjs, PR #18) left this
// as the named follow-up. Audit M3 / matrix §7: "kill -9 mid-battle-settle".
// Recipe (docs/verification/2026-09-20-battle-settle-evidence.md): leave a
// battle open with battle.resolve one HTTP call away; fire it; SIGKILL before
// the response; on restart the world is all-or-nothing across the session,
// the march, the plan deadline, the defender's row, war points, both
// notifications and the two events. One BEGIN IMMEDIATE … COMMIT in
// applyWarCommand, so a half-settled battle is a real bug.
//
// This is NOT the B8 WAL-recovery drill (already PASS at 69b7548). After a
// real scout + attack the main file is usually checkpointed; we do not claim
// an uncheckpointed -wal. We claim atomicity of settlement under SIGKILL.
//
// The kill is steered only as far as "the resolve request has left this
// process". Where it lands — before COMMIT (wholly absent) or after COMMIT
// and before the socket write (wholly present) or after the response
// (wholly present, weaker) — is recorded, not forced. HALF fails.
//
// One disposable world. One attacker on the Roblox door. One attack: 10
// Berserkers at the nearest Freehold (fixture 10 Squires, wall 0). Troops
// ride KINGSAGE_DEV_SEED_ARMY. No orders, no second army, no conquest, no
// Studio, no hosting. Real march timers (~12 s scout, ~25 s attack).
//
//   node scripts/b8-mid-settle-kill-drill.mjs
//   B8_SETTLE_PORT=4271 node scripts/b8-mid-settle-kill-drill.mjs
//   B8_SETTLE_KILL_DELAY_MS=0 node scripts/b8-mid-settle-kill-drill.mjs   # often UNSETTLED
//   B8_SETTLE_KILL_DELAY_MS=8 node scripts/b8-mid-settle-kill-drill.mjs   # default; observed SETTLED in-flight

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.execArgv.includes("--experimental-strip-types")) {
  const rerun = spawnSync(process.execPath, ["--experimental-strip-types", ...process.argv.slice(1)], { stdio: "inherit" });
  process.exit(rerun.status ?? 1);
}

const { emptyArmy } = await import("../packages/game-core/src/contracts.ts");
const {
  distanceBetween,
  marchDurationSeconds,
  resolveBattle,
  calculateLoot,
  armyUnitCount,
  addArmies: addArmiesCore,
  UNPLANNED_ATTACK_PLAN,
} = await import("../packages/game-core/src/warfare.ts");
const { FREEHOLD_GARRISON } = await import("../packages/game-core/src/fixture.ts");

const GOOD_PLAN = { entry: "West Ridge", troops: "Balanced Army", time: "Dawn", style: "Flanking Strike" };
const SEED_ARMY = { axe: 20, spear: 10, scout: 3, ram: 1 };
const SEED_ARMY_ENV = "axe:20,spear:10,scout:3,ram:1";
const FIXTURE_RESOURCES = { wood: 1200, stone: 1000, iron: 800 };
const FREEHOLD_RESOURCES = { wood: 400, stone: 350, iron: 250 };
const ATTENDED_GRACE_MS = 3 * 60_000;
const TROOPS = Object.keys(emptyArmy());
const RESOURCES = ["wood", "stone", "iron"];
const ZERO_LOOT = { wood: 0, stone: 0, iron: 0 };
const RESOLVE_ID = "b8-settle-p1-resolve";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = join(repoRoot, "server");
const port = Number(process.env.B8_SETTLE_PORT ?? 4271);
// 0 ms (kill on flush) usually dies before COMMIT — wholly UNSETTLED, still
// a valid all-or-nothing landing. 8 ms has been observed to let settle
// COMMIT and then die before the socket write — wholly SETTLED, in-flight
// present. That is the stronger mid-settle case; the drill accepts both.
const killDelayMs = Number(process.env.B8_SETTLE_KILL_DELAY_MS ?? 8);
const robloxKey = "b8-settle-throwaway-key-0001";

const scratch = mkdtempSync(join(tmpdir(), "kingsmarch-b8-settle-"));
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
const compact = (a) => JSON.stringify(Object.fromEntries(TROOPS.filter((t) => a[t]).map((t) => [t, a[t]])));
const sumRes = (r) => r.wood + r.stone + r.iron;
const subRes = (a, b) => Object.fromEntries(RESOURCES.map((k) => [k, a[k] - b[k]]));
const subArmies = (a, b) => Object.fromEntries(TROOPS.map((t) => [t, (a[t] ?? 0) - (b[t] ?? 0)]));
const ms = (iso) => Date.parse(iso);
const secondsBetween = (a, b) => (ms(b) - ms(a)) / 1000;
const withinTrickle = (actual, expected, slack = 1) => RESOURCES.every((k) => actual[k] >= expected[k] && actual[k] <= expected[k] + slack);
const fileSize = (path) => (existsSync(path) ? statSync(path).size : null);

function sqlite(sql) {
  const run = spawnSync("sqlite3", [dbPath, sql], { encoding: "utf8" });
  log(`$ sqlite3 <db> ${JSON.stringify(sql)}`);
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
  if (out) log(out.split("\n").map((l) => `  ${l}`).join("\n"));
  log(`  -> exit ${run.status}`);
  return (run.stdout ?? "").trim();
}

async function request(method, path, body, { key = robloxKey, quiet = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (key !== null) headers["x-kingsage-key"] = key;
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    const code = error.cause?.code ?? error.message;
    if (!quiet) log(`${method} ${path} -> no response (${code})`);
    return { status: 0, json: null, text: "", errorCode: code };
  }
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  if (!quiet) log(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ""} -> ${response.status} ${shorten(text)}`);
  return { status: response.status, json, text };
}

function startServer(label = "world server") {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("KINGSAGE_")) env[k] = v;
  Object.assign(env, {
    KINGSAGE_DATABASE_PATH: dbPath,
    KINGSAGE_ROBLOX_KEY: robloxKey,
    KINGSAGE_BIND: "127.0.0.1",
    PORT: String(port),
    KINGSAGE_DEV_SEED_ARMY: SEED_ARMY_ENV,
  });
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
  if (child.exitCode !== null || child.signalCode !== null) {
    log(`  -> ${label} already exited (code ${child.exitCode}, signal ${child.signalCode})`);
    return null;
  }
  log(`$ kill -TERM <${label} pid ${child.pid}>`);
  child.kill("SIGTERM");
  const outcome = await Promise.race([child.exited, sleep(10_000).then(() => ({ code: null, signal: "TIMEOUT" }))]);
  if (outcome.signal === "TIMEOUT") { child.kill("SIGKILL"); await child.exited; }
  const at = new Date().toISOString();
  log(`  -> ${label} exited (code ${outcome.code}, signal ${outcome.signal}) at ${at}`);
  return at;
}

async function pullState(player, { quiet = false } = {}) {
  const result = await request("POST", "/api/roblox/state", { robloxUserIds: [player.userId] }, { quiet: true });
  if (result.status !== 200) throw new Error(`/api/roblox/state -> ${result.status} ${result.text}`);
  const state = result.json.states[String(player.userId)];
  if (!quiet) log(`POST /api/roblox/state {"robloxUserIds":[${player.userId}]} -> 200 (${result.text.length} bytes; marches ${state.marches.length}, scoutReports ${state.scoutReports.length}, battleSessions ${state.battleSessions.length}, notifications ${state.notifications.length})`);
  return state;
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

async function command(player, commandId, cmd, { retry = true } = {}) {
  const expected = (await player.snapshot()).world.version;
  const body = { robloxUserId: player.userId, commandId, expectedWorldVersion: expected, command: cmd };
  let res = await request("POST", "/api/roblox/commands", body);
  if (retry && res.status === 409 && res.json?.payload?.code === "WORLD_VERSION_CONFLICT") {
    log(`(WORLD_VERSION_CONFLICT on ${commandId}: retrying once as ${commandId}-retry)`);
    return command(player, `${commandId}-retry`, cmd, { retry: false });
  }
  return { ...res, body, sentAt: new Date().toISOString() };
}

const launch = (player, id, kind, targetVillageId, force, extra = {}) =>
  command(player, id, { type: "march.launch", payload: { fromVillageId: player.villageId, targetVillageId, kind, army: army(force), ...extra } });
const open = (player, id, marchId, targetVillageVersion, plan) =>
  command(player, id, { type: "battle.open", payload: { marchId, targetVillageVersion, plan } });

function villageRow(villageId) {
  const raw = sqlite(`SELECT resources_json || '|' || buildings_json || '|' || army_json || '|' || realm_of_power || '|' || state_version || '|' || kingdom_id || '|' || name FROM local_villages WHERE id = '${villageId}';`);
  const [resources, buildings, armyJson, realmOfPower, stateVersion, kingdomId, name] = raw.split("|");
  return { resources: JSON.parse(resources), buildings: JSON.parse(buildings), army: JSON.parse(armyJson), realmOfPower: Number(realmOfPower), stateVersion: Number(stateVersion), kingdomId, name };
}

function marchRow(marchId) {
  const raw = sqlite(`SELECT id || '|' || kind || '|' || status || '|' || army_json || '|' || loot_json || '|' || departed_at || '|' || arrives_at || '|' || coalesce(battle_id, 'NULL') FROM local_marches WHERE id = '${marchId}';`);
  const [id, kind, status, armyJson, lootJson, departedAt, arrivesAt, battleId] = raw.split("|");
  return { id, kind, status, army: JSON.parse(armyJson), loot: JSON.parse(lootJson), departedAt, arrivesAt, battleId: battleId === "NULL" ? null : battleId };
}

function planRow(marchId) {
  const raw = sqlite(`SELECT plan_json || '|' || coalesce(auto_resolve_at, 'NULL') FROM local_march_plans WHERE march_id = '${marchId}';`);
  const [plan, autoResolveAt] = raw.split("|");
  return { plan: JSON.parse(plan), autoResolveAt: autoResolveAt === "NULL" ? null : autoResolveAt };
}

function battleRow(battleId) {
  const raw = sqlite(`SELECT b.status || '|' || b.seed || '|' || b.plan_json || '|' || b.attacker_army_json || '|' || b.defender_army_json || '|' || b.attacker_levels_json || '|' || b.defender_levels_json || '|' || b.defender_wall_level || '|' || b.defender_resources_json || '|' || coalesce(b.outcome_json, 'NULL') || '|' || b.opened_at || '|' || coalesce(b.resolved_at, 'NULL') || '|' || b.defender_village_version || '|' || (SELECT count(*) FROM local_battle_orders o WHERE o.battle_id = b.id) || '|' || b.march_id || '|' || b.defender_kingdom_id FROM local_battle_sessions b WHERE b.id = '${battleId}';`);
  if (!raw) return null;
  const [status, seed, plan, attackerArmy, defenderArmy, attackerLevels, defenderLevels, wall, defenderResources, outcome, openedAt, resolvedAt, defenderVersion, orderCount, marchId, defenderKingdomId] = raw.split("|");
  return { status, seed, plan: JSON.parse(plan), attackerArmy: JSON.parse(attackerArmy), defenderArmy: JSON.parse(defenderArmy), attackerLevels: JSON.parse(attackerLevels), defenderLevels: JSON.parse(defenderLevels), wall: Number(wall), defenderResources: JSON.parse(defenderResources), outcomeJson: outcome === "NULL" ? null : outcome, openedAt, resolvedAt: resolvedAt === "NULL" ? null : resolvedAt, defenderVersion: Number(defenderVersion), orderCount: Number(orderCount), marchId, defenderKingdomId };
}

function oracleOutcome(row) {
  return resolveBattle({
    attacker: row.attackerArmy,
    defender: row.defenderArmy,
    attackerLevels: row.attackerLevels,
    defenderLevels: row.defenderLevels,
    defenderWallLevel: row.wall,
    defenderResources: row.defenderResources,
    plan: row.plan,
    acceptedOrders: row.orderCount,
    seed: row.seed,
  });
}

const count = (table, where = "1=1") => Number(sqlite(`SELECT count(*) FROM ${table} WHERE ${where};`));
const warPoints = (kingdomId) => Number(sqlite(`SELECT war_victory_points FROM local_kingdoms WHERE id = '${kingdomId}';`));
const notificationsFor = (kingdomId) => sqlite(`SELECT kind || '|' || created_at || '|' || message FROM local_kingdom_notifications WHERE kingdom_id = '${kingdomId}' ORDER BY created_at, rowid;`).split("\n").filter(Boolean).map((l) => {
  const [kind, createdAt, ...rest] = l.split("|");
  return { kind, createdAt, message: rest.join("|") };
});

function isFogged(village) {
  return Object.values(village.resources).every((v) => v === 0) && Object.values(village.buildings).every((v) => v === 0) && TROOPS.every((t) => village.army[t] === 0);
}

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

function snapshotLedger(battleId, marchId, defenderVillageId, attackerKingdomId) {
  return {
    session: battleRow(battleId),
    march: marchRow(marchId),
    plan: planRow(marchId),
    defender: villageRow(defenderVillageId),
    points: warPoints(attackerKingdomId),
    attackerNotes: notificationsFor(attackerKingdomId),
    defenderNotes: notificationsFor(villageRow(defenderVillageId).kingdomId),
    startedEvents: count("local_world_events", "event_type = 'battle.started'"),
    resolvedEvents: count("local_world_events", "event_type = 'battle.resolved'"),
    conqueredEvents: count("local_world_events", "event_type = 'village.conquered'"),
    inboxResolve: sqlite(`SELECT result_json FROM local_command_inbox WHERE command_id = '${RESOLVE_ID}';`),
    inboxCount: count("local_command_inbox"),
  };
}

function classifySettle(before, after) {
  const sessionDone = after.session.status === "resolved" && after.session.outcomeJson !== null && after.session.resolvedAt !== null;
  const sessionOpen = after.session.status === "open" && after.session.outcomeJson === null && after.session.resolvedAt === null;
  const marchDone = after.march.status === "returning" && after.march.kind === "return";
  const marchOpen = after.march.status === "awaiting_battle" && after.march.kind === "attack" && same(after.march.loot, ZERO_LOOT) && after.march.arrivesAt === before.march.arrivesAt && after.march.battleId === before.march.battleId;
  const planDone = after.plan.autoResolveAt === null;
  const planOpen = after.plan.autoResolveAt !== null && after.plan.autoResolveAt === before.plan.autoResolveAt;
  const armyDone = !same(after.defender.army, before.defender.army);
  const armyOpen = same(after.defender.army, before.defender.army);
  const pointsDone = after.points > before.points;
  const pointsOpen = after.points === before.points;
  const attackerBattleNotes = after.attackerNotes.filter((n) => n.kind === "battle").length - before.attackerNotes.filter((n) => n.kind === "battle").length;
  const defenderBattleNotes = after.defenderNotes.filter((n) => n.kind === "battle").length - before.defenderNotes.filter((n) => n.kind === "battle").length;
  const notesDone = attackerBattleNotes >= 1 && defenderBattleNotes >= 1;
  const notesOpen = attackerBattleNotes === 0 && defenderBattleNotes === 0;
  const eventDone = after.resolvedEvents === before.resolvedEvents + 1;
  const eventOpen = after.resolvedEvents === before.resolvedEvents;
  const inboxDone = after.inboxResolve !== "";
  const inboxOpen = after.inboxResolve === "";
  const flags = {
    sessionDone, sessionOpen, marchDone, marchOpen, planDone, planOpen,
    armyDone, armyOpen, pointsDone, pointsOpen, notesDone, notesOpen,
    eventDone, eventOpen, inboxDone, inboxOpen,
    attackerBattleNotes, defenderBattleNotes,
  };
  const done = [sessionDone, marchDone, planDone, armyDone, pointsDone, notesDone, eventDone, inboxDone];
  const open = [sessionOpen, marchOpen, planOpen, armyOpen, pointsOpen, notesOpen, eventOpen, inboxOpen];
  let kind = "HALF";
  if (done.every(Boolean) && open.every((v) => !v)) kind = "SETTLED";
  if (open.every(Boolean) && done.every((v) => !v)) kind = "UNSETTLED";
  return { kind, flags };
}

function fireResolveAndKill(body) {
  return new Promise((resolvePromise) => {
    const payload = JSON.stringify(body);
    const box = { killedAt: null };
    const killOnce = () => {
      if (box.killedAt || !server || (server.exitCode !== null || server.signalCode !== null)) return;
      const go = () => {
        if (box.killedAt || !server || (server.exitCode !== null || server.signalCode !== null)) return;
        box.killedAt = new Date().toISOString();
        log(`$ kill -KILL <world server pid ${server.pid}>   # at ${box.killedAt}, resolve request flushed${killDelayMs ? `, +${killDelayMs}ms` : ""}`);
        server.kill("SIGKILL");
      };
      if (killDelayMs > 0) setTimeout(go, killDelayMs);
      else go();
    };
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: "/api/roblox/commands",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-kingsage-key": robloxKey,
        "content-length": Buffer.byteLength(payload),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-JSON */ }
        log(`POST /api/roblox/commands ${JSON.stringify(body)} -> ${res.statusCode} ${shorten(text)}   # response arrived before/with the kill`);
        resolvePromise({ status: res.statusCode, json, text, outcome: "responded", killedAt: box.killedAt });
      });
    });
    req.on("error", (error) => {
      const code = error.code ?? error.message;
      log(`POST /api/roblox/commands ${JSON.stringify(body)} -> no response (${code}) -> in-flight`);
      resolvePromise({ status: 0, json: null, text: "", errorCode: code, outcome: "in-flight", killedAt: box.killedAt });
    });
    req.on("finish", killOnce);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
  log(`# B8 — mid-settle SIGKILL drill (current tip)`);
  log(`date: ${new Date().toISOString()}`);
  log(`sha: ${sha}`);
  log(`node: ${process.version}`);
  log(`sqlite3: ${spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).stdout.trim()}`);
  log(`scratch: ${scratch}`);
  log(`db: ${dbPath}`);
  log(`port: ${port}`);
  log(`kill delay after request flush: ${killDelayMs} ms`);

  const P1 = { userId: 980001, name: "Settle Kill One", tag: "p1" };
  const seed = army(SEED_ARMY);
  const ARMY = army({ axe: 10 });

  // ------------------------------------------------------------------ 1
  step(1, "fresh disposable world with KINGSAGE_DEV_SEED_ARMY; P1 linked through the Roblox door; nearest Freehold holds only the fixture's 10 Squires behind no wall");
  expect(1, !existsSync(dbPath), `scratch DB already exists at ${dbPath}`);
  const squatter = await request("GET", "/api/health", undefined, { key: null, quiet: true });
  expect(1, squatter.status === 0, `something already answers on port ${port} (${squatter.status} ${squatter.text}); stop it or set B8_SETTLE_PORT`);
  startServer();
  const h1 = await waitForHealth();
  log(`GET /api/health -> ${h1.status} ${h1.text}`);
  expect(1, h1.json?.ok === true && h1.json?.service === "kingsage-world", `unexpected health body ${h1.text}`);
  await link(P1);
  log(`p1: ${P1.playerId} / ${P1.kingdomId} / ${P1.villageId}`);
  const s1 = await P1.snapshot();
  const home = ownVillage(s1);
  const freeholds = s1.world.villages.filter((v) => v.kingdomId.startsWith("freehold-"));
  expect(1, freeholds.length === 4, `expected 4 Freeholds, saw ${freeholds.length}`);
  const F = freeholds.map((v) => ({ v, d: distanceBetween(home, v) })).sort((a, b) => a.d - b.d)[0].v;
  const homeRow = villageRow(P1.villageId);
  const fRow = villageRow(F.id);
  expect(1, same(homeRow.army, seed) && same(homeRow.resources, FIXTURE_RESOURCES), `p1's row ${JSON.stringify(homeRow)}`);
  expect(1, same(fRow.army, FREEHOLD_GARRISON) && fRow.buildings.wall === 0 && same(fRow.resources, FREEHOLD_RESOURCES), `Freehold row ${JSON.stringify(fRow)} (the seed knob must not arm a Freehold)`);
  const dF = distanceBetween(home, F);
  const attack_s = marchDurationSeconds(dF, "attack", ARMY);
  const scout_s = marchDurationSeconds(dF, "scout", army({ scout: 1 }));
  log(`p1 home ${home.id} at (${home.x},${home.y}); nearest Freehold ${F.id} "${F.name}" (${F.kingdomId}) at (${F.x},${F.y}), ${dF.toFixed(4)} tiles; scout ${scout_s}s; attack ${attack_s}s`);
  record(1, true, `health 200; p1 ${P1.playerId}/${P1.kingdomId}/${P1.villageId}; seed ${compact(seed)}; Freehold ${F.id} "${F.name}" ${compact(FREEHOLD_GARRISON)} wall 0 ${JSON.stringify(FREEHOLD_RESOURCES)}; ${dF.toFixed(4)} tiles`);

  // ------------------------------------------------------------------ 2
  step(2, "one Spy to the Freehold, server running: report stamped at arrivesAt, army/wall/stock equal the row, target still fogged");
  const scout = await launch(P1, "b8-settle-p1-scout", "scout", F.id, { scout: 1 });
  expect(2, scout.status === 200 && scout.json?.payload?.march, `scout: ${scout.status} ${scout.text}`);
  const mScout = scout.json.payload.march;
  const wait2 = ms(mScout.arrivesAt) + 700 - Date.now();
  log(`waiting ${Math.max(0, Math.round(wait2 / 1000))}s for the Spy (due ${mScout.arrivesAt})`);
  if (wait2 > 0) await sleep(wait2);
  const s2 = await P1.snapshot();
  const report = s2.scoutReports.find((r) => r.marchId === mScout.id);
  expect(2, report, `no report for ${mScout.id}`);
  expect(2, report.createdAt === mScout.arrivesAt, `report stamp ${report.createdAt} != arrivesAt ${mScout.arrivesAt}`);
  const fRow2 = villageRow(F.id);
  expect(2, same(report.observedArmy, FREEHOLD_GARRISON) && report.observedBuildings.wall === 0 && withinTrickle(report.observedResources, FREEHOLD_RESOURCES) && report.targetVillageVersion === fRow2.stateVersion, `report ${JSON.stringify(report)} vs row ${JSON.stringify(fRow2)}`);
  expect(2, isFogged(s2.world.villages.find((v) => v.id === F.id)), "the snapshot carrying the report un-fogged the Freehold");
  record(2, true, `Spy arrived ${mScout.arrivesAt}; report stamped there; F ${compact(report.observedArmy)} wall 0 ${JSON.stringify(report.observedResources)} v${report.targetVillageVersion}; still fogged`);

  // ------------------------------------------------------------------ 3
  step(3, "10 Berserkers launched at the Freehold; at the walls battle.open accepted with the report's version and the best plan; session open; pre-settle ledger snapshotted");
  const launchA = await launch(P1, "b8-settle-p1-attack", "attack", F.id, { axe: 10 });
  expect(3, launchA.status === 200 && launchA.json?.payload?.march?.status === "outbound", `attack: ${launchA.status} ${launchA.text}`);
  const A = launchA.json.payload.march;
  expect(3, secondsBetween(A.departedAt, A.arrivesAt) === attack_s, `timer ${secondsBetween(A.departedAt, A.arrivesAt)} != ${attack_s}`);
  const atWalls = await waitForMarchStatus(P1, A.id, "awaiting_battle", A.arrivesAt);
  expect(3, atWalls, `attack did not reach awaiting_battle within 10 s of ${A.arrivesAt}`);
  const openA = await open(P1, "b8-settle-p1-open", A.id, report.targetVillageVersion, GOOD_PLAN);
  expect(3, openA.status === 200 && openA.json?.payload?.battle?.status === "open", `battle.open: ${openA.status} ${openA.text}`);
  const battle = openA.json.payload.battle;
  const rowOpen = battleRow(battle.id);
  expect(3, rowOpen.status === "open" && rowOpen.outcomeJson === null && rowOpen.resolvedAt === null, `session ${JSON.stringify(rowOpen)}`);
  expect(3, same(rowOpen.attackerArmy, ARMY) && same(rowOpen.defenderArmy, FREEHOLD_GARRISON) && rowOpen.wall === 0 && same(rowOpen.plan, GOOD_PLAN), `frozen inputs ${JSON.stringify(rowOpen)}`);
  const expectedSeed = createHash("sha256").update(`${s1.world.id}:${A.id}:${rowOpen.openedAt}`).digest("hex").slice(0, 24);
  expect(3, rowOpen.seed === expectedSeed, `seed ${rowOpen.seed} != ${expectedSeed}`);
  const planOpen = planRow(A.id);
  const graceMs = ms(planOpen.autoResolveAt) - ms(rowOpen.openedAt);
  expect(3, graceMs >= ATTENDED_GRACE_MS && graceMs < ATTENDED_GRACE_MS + 100, `grace ${graceMs} ms from openedAt`);
  const before = snapshotLedger(battle.id, A.id, F.id, P1.kingdomId);
  expect(3, before.startedEvents === 1 && before.resolvedEvents === 0 && before.conqueredEvents === 0 && before.inboxResolve === "" && before.points === 0, `pre-settle ledger already looks settled: ${JSON.stringify({ started: before.startedEvents, resolved: before.resolvedEvents, inbox: before.inboxResolve, points: before.points })}`);
  log(`pre-settle: session ${before.session.status} outcome=${before.session.outcomeJson} resolvedAt=${before.session.resolvedAt}; march ${before.march.status}/${before.march.kind} loot ${JSON.stringify(before.march.loot)} arrives ${before.march.arrivesAt}; auto_resolve_at ${before.plan.autoResolveAt}; F army ${compact(before.defender.army)} stock ${JSON.stringify(before.defender.resources)} kingdom ${before.defender.kingdomId}; points ${before.points}; battle.started ${before.startedEvents} battle.resolved ${before.resolvedEvents}; inbox resolve empty; inbox ${before.inboxCount} rows`);
  record(3, true, `attack ${A.id} at walls ${atWalls.observedAt}; opened ${battle.id} at ${rowOpen.openedAt}, seed ${rowOpen.seed}, grace ${planOpen.autoResolveAt} (${graceMs} ms); pre-settle snapshotted (open, no outcome, awaiting_battle, auto set, F still ${compact(before.defender.army)}, 0 points, 1 started / 0 resolved, no resolve inbox row)`);

  // ------------------------------------------------------------------ 4
  step(4, "fire battle.resolve and SIGKILL the moment the request has left this process; record the HTTP outcome and that the process died by SIGKILL");
  const expectedVersion = (await P1.snapshot()).world.version;
  const resolveBody = { robloxUserId: P1.userId, commandId: RESOLVE_ID, expectedWorldVersion: expectedVersion, command: { type: "battle.resolve", payload: { battleId: battle.id } } };
  log(`firing ${RESOLVE_ID} at world version ${expectedVersion}; SIGKILL on request flush`);
  const flushed = fireResolveAndKill(resolveBody);
  const httpOutcome = await flushed;
  const exit = await Promise.race([server.exited, sleep(10_000).then(() => ({ code: null, signal: "TIMEOUT" }))]);
  log(`  -> world server exited (code ${exit.code}, signal ${exit.signal}) at ${new Date().toISOString()}`);
  expect(4, exit.signal === "SIGKILL", `expected SIGKILL, got code ${exit.code} signal ${exit.signal}`);
  expect(4, httpOutcome.outcome === "responded" || httpOutcome.outcome === "in-flight", `unexpected HTTP outcome ${httpOutcome.outcome}`);
  record(4, true, `SIGKILL at ${httpOutcome.killedAt ?? "unknown"}; HTTP ${httpOutcome.outcome}${httpOutcome.outcome === "responded" ? ` ${httpOutcome.status}` : ` (${httpOutcome.errorCode})`}; server exited signal SIGKILL`);

  // ------------------------------------------------------------------ 5
  step(5, "the process is gone and nothing answers; file sizes recorded (a checkpoint after the scout/attack is allowed — this is not the WAL-recovery claim)");
  const down = await request("GET", "/api/health", undefined, { key: null });
  expect(5, down.status === 0, "server still answering after SIGKILL");
  const mainAtKill = fileSize(dbPath);
  const walAtKill = fileSize(`${dbPath}-wal`);
  const shmAtKill = fileSize(`${dbPath}-shm`);
  log(`files at kill: main ${mainAtKill} bytes, -wal ${walAtKill} bytes, -shm ${shmAtKill} bytes`);
  expect(5, mainAtKill !== null && walAtKill !== null, "database files missing after the kill");
  record(5, true, `health no response; main ${mainAtKill} B, -wal ${walAtKill} B, -shm ${shmAtKill} B; nothing has opened the live database since the kill`);

  // ------------------------------------------------------------------ 6
  step(6, "restart on the same files as the FIRST opener since the kill: health 200, integrity_check ok, foreign_key_check empty, still WAL mode");
  log(`restarting at ${new Date().toISOString()}`);
  startServer("world server (after kill)");
  const h6 = await waitForHealth();
  log(`GET /api/health -> ${h6.status} ${h6.text}`);
  expect(6, h6.json?.ok === true, `health after restart ${h6.text}`);
  const integrity = sqlite("PRAGMA integrity_check;");
  expect(6, integrity === "ok", `integrity_check: ${integrity}`);
  const fk = sqlite("PRAGMA foreign_key_check;");
  expect(6, fk === "", `foreign_key_check reported: ${fk}`);
  const mode = sqlite("PRAGMA journal_mode;");
  expect(6, mode === "wal", `journal_mode is ${mode}`);
  log(`files after restart: main ${fileSize(dbPath)} bytes, -wal ${fileSize(`${dbPath}-wal`)} bytes, -shm ${fileSize(`${dbPath}-shm`)} bytes`);
  record(6, true, `health 200 after restart; PRAGMA integrity_check = ok; foreign_key_check empty; journal_mode wal`);

  // ------------------------------------------------------------------ 7
  step(7, "identity — P1 rejoins as created:false with the same player, kingdom and village ids");
  const relink = await request("POST", "/api/roblox/session", { robloxUserId: P1.userId, displayName: `${P1.name} (after kill)` });
  expect(7, relink.status === 200 && relink.json.created === false && relink.json.playerId === P1.playerId && relink.json.kingdomId === P1.kingdomId, `identity changed: ${relink.text}`);
  const s7 = await P1.snapshot();
  expect(7, ownVillage(s7).id === P1.villageId, `village changed to ${ownVillage(s7).id}`);
  record(7, true, `rejoin created:false; same ${P1.playerId}/${P1.kingdomId}/${P1.villageId}`);

  // ------------------------------------------------------------------ 8
  step(8, "all-or-nothing — every settle column is wholly present or wholly absent; a mix is a half-settled battle and a real bug");
  const after = snapshotLedger(battle.id, A.id, F.id, P1.kingdomId);
  log(`post-restart: session ${after.session.status} outcome=${after.session.outcomeJson ? "present" : "NULL"} resolvedAt=${after.session.resolvedAt}; march ${after.march.status}/${after.march.kind} army ${compact(after.march.army)} loot ${JSON.stringify(after.march.loot)} arrives ${after.march.arrivesAt}; auto_resolve_at ${after.plan.autoResolveAt}; F army ${compact(after.defender.army)} stock ${JSON.stringify(after.defender.resources)} kingdom ${after.defender.kingdomId} realm ${after.defender.realmOfPower}; points ${after.points}; battle.started ${after.startedEvents} battle.resolved ${after.resolvedEvents} village.conquered ${after.conqueredEvents}; inbox resolve ${after.inboxResolve ? "present" : "absent"}; inbox ${after.inboxCount} rows`);
  expect(8, after.session !== null, "battle session row missing after restart");
  expect(8, after.defender.kingdomId === before.defender.kingdomId && after.conqueredEvents === 0, `conquest moved the village or wrote village.conquered (${after.defender.kingdomId}, events ${after.conqueredEvents}) — no Count rode`);
  expect(8, after.startedEvents === 1, `battle.started count ${after.startedEvents} (open already committed; must survive)`);
  const classified = classifySettle(before, after);
  log(`classification: ${classified.kind} flags ${JSON.stringify(classified.flags)}`);
  if (classified.kind === "UNSETTLED") {
    expect(8, withinTrickle(after.defender.resources, before.defender.resources, 2), `unsettled but F stock moved beyond trickle: ${JSON.stringify(before.defender.resources)} → ${JSON.stringify(after.defender.resources)}`);
  }
  expect(8, classified.kind !== "HALF", `HALF-SETTLED battle — mix of present and absent columns: ${JSON.stringify(classified.flags)}; session ${after.session.status}/${after.session.resolvedAt}; march ${after.march.status}/${after.march.kind}; auto ${after.plan.autoResolveAt}; points ${before.points}→${after.points}; resolved events ${before.resolvedEvents}→${after.resolvedEvents}; inbox ${after.inboxResolve ? "present" : "absent"}`);
  const landing = httpOutcome.outcome === "responded"
    ? "kill landed after the response (settle had committed; weaker mid-settle, still all-or-nothing)"
    : classified.kind === "SETTLED"
      ? "kill landed after COMMIT, before the response (in-flight present)"
      : "kill landed before COMMIT (in-flight absent)";
  record(8, true, `${classified.kind}: ${landing}; session ${after.session.status}; march ${after.march.status}/${after.march.kind}; auto_resolve_at ${after.plan.autoResolveAt}; F army ${compact(after.defender.army)}; points ${after.points}; battle notes attacker+${classified.flags.attackerBattleNotes} defender+${classified.flags.defenderBattleNotes}; battle.resolved ${after.resolvedEvents}; inbox resolve ${after.inboxResolve ? "present" : "absent"}`);

  // ------------------------------------------------------------------ 9
  step(9, "follow-through — if SETTLED: stored outcome == resolveBattle(frozen) byte-for-byte, inbox replay identical, a fresh resolve → BATTLE_CLOSED; if UNSETTLED: no inbox row, a post-restart resolve is accepted and then matches the oracle");
  if (classified.kind === "SETTLED") {
    const oracle = oracleOutcome(after.session);
    expect(9, after.session.outcomeJson === JSON.stringify(oracle), `stored outcome differs from resolveBattle(frozen):\n  stored ${after.session.outcomeJson}\n  oracle ${JSON.stringify(oracle)}`);
    const homeward = addArmiesCore(oracle.attackerSurvivors, oracle.yielded);
    expect(9, same(after.march.army, homeward) && same(after.march.loot, oracle.loot), `march army/loot ${compact(after.march.army)} ${JSON.stringify(after.march.loot)} != homeward ${compact(homeward)} loot ${JSON.stringify(oracle.loot)}`);
    const return_s = marchDurationSeconds(dF, "return", homeward);
    expect(9, secondsBetween(after.session.resolvedAt, after.march.arrivesAt) === return_s, `return leg ${secondsBetween(after.session.resolvedAt, after.march.arrivesAt)} != ${return_s}`);
    expect(9, same(after.defender.army, subArmies(subArmies(before.defender.army, oracle.defenderCasualties), oracle.yielded)), `F army ${compact(after.defender.army)} != before minus casualties/prisoners`);
    expect(9, withinTrickle(after.defender.resources, subRes(before.defender.resources, oracle.loot), 2), `F stock ${JSON.stringify(after.defender.resources)} vs ${JSON.stringify(before.defender.resources)} minus loot ${JSON.stringify(oracle.loot)}`);
    const expectedPoints = Math.max(10, armyUnitCount(oracle.defenderCasualties) * 3);
    expect(9, after.points - before.points === expectedPoints, `points ${before.points} → ${after.points}, expected +${expectedPoints}`);
    expect(9, same(oracle.loot, calculateLoot(after.session.defenderResources, oracle.attackerSurvivors)), `loot ${JSON.stringify(oracle.loot)} != calculateLoot`);
    const stored = after.inboxResolve;
    const replay = await request("POST", "/api/roblox/commands", resolveBody);
    expect(9, replay.status === 200 && replay.text === stored, `replay differs: ${replay.status} ${replay.text} vs stored ${stored}`);
    if (httpOutcome.outcome === "responded") {
      expect(9, httpOutcome.text === stored, `pre-kill response ${httpOutcome.text} != stored inbox ${stored}`);
    }
    const again = await command(P1, "b8-settle-p1-resolve-again", { type: "battle.resolve", payload: { battleId: battle.id } });
    expect(9, again.status === 409 && again.json?.payload?.code === "BATTLE_CLOSED", `fresh resolve after SETTLED: ${again.status} ${again.text}`);
    record(9, true, `SETTLED follow-through: outcome == oracle (${oracle.winner}, loot ${JSON.stringify(oracle.loot)}, +${expectedPoints} points); march homeward ${compact(homeward)} due ${after.march.arrivesAt}; replay byte-identical; BATTLE_CLOSED`);
  } else {
    expect(9, after.inboxResolve === "", "UNSETTLED but the resolve command has an inbox row");
    const resolveAfter = await command(P1, "b8-settle-p1-resolve-after-kill", { type: "battle.resolve", payload: { battleId: battle.id } });
    expect(9, resolveAfter.status === 200 && resolveAfter.json?.type === "command.accepted" && resolveAfter.json.payload.battle?.status === "resolved", `post-restart resolve: ${resolveAfter.status} ${resolveAfter.text}`);
    const settled = snapshotLedger(battle.id, A.id, F.id, P1.kingdomId);
    const oracle = oracleOutcome(settled.session);
    expect(9, settled.session.outcomeJson === JSON.stringify(oracle), `post-restart stored outcome differs from oracle:\n  stored ${settled.session.outcomeJson}\n  oracle ${JSON.stringify(oracle)}`);
    const homeward = addArmiesCore(oracle.attackerSurvivors, oracle.yielded);
    expect(9, settled.march.status === "returning" && same(settled.march.army, homeward) && settled.plan.autoResolveAt === null, `post-restart march/plan ${JSON.stringify(settled.march)} ${JSON.stringify(settled.plan)}`);
    expect(9, settled.resolvedEvents === 1 && settled.points > before.points, `post-restart events/points ${settled.resolvedEvents}/${settled.points}`);
    record(9, true, `UNSETTLED follow-through: no inbox row for ${RESOLVE_ID}; post-restart resolve accepted; outcome == oracle (${oracle.winner}, loot ${JSON.stringify(oracle.loot)}); march returning ${compact(homeward)}; auto_resolve_at NULL; world not stuck`);
  }

  // ------------------------------------------------------------------ 10
  step(10, "the world is writable after the kill — a fresh militia recruit is accepted");
  let version = (await P1.snapshot()).world.version;
  let fresh = await request("POST", "/api/roblox/commands", {
    robloxUserId: P1.userId,
    commandId: "b8-settle-p1-after-kill-recruit",
    expectedWorldVersion: version,
    command: { type: "village.recruit.queue", payload: { villageId: P1.villageId, troop: "militia", quantity: 1 } },
  });
  if (fresh.status === 409 && fresh.json?.payload?.code === "WORLD_VERSION_CONFLICT") {
    version = fresh.json.payload.currentWorldVersion;
    fresh = await request("POST", "/api/roblox/commands", {
      robloxUserId: P1.userId,
      commandId: "b8-settle-p1-after-kill-recruit-2",
      expectedWorldVersion: version,
      command: { type: "village.recruit.queue", payload: { villageId: P1.villageId, troop: "militia", quantity: 1 } },
    });
  }
  expect(10, fresh.status === 200 && fresh.json?.type === "command.accepted" && fresh.json.payload.recruitmentJob, `post-recovery recruit refused: ${fresh.status} ${fresh.text}`);
  record(10, true, `fresh militia recruit accepted after the kill (job ${fresh.json.payload.recruitmentJob.id}, completesAt ${fresh.json.payload.recruitmentJob.completesAt}); landing this run: ${classified.kind}, HTTP ${httpOutcome.outcome}`);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  log("");
  log(`B8 MID-SETTLE DRILL FAILED: ${error.message}`);
} finally {
  await stopServer("world server (teardown)");
  log("");
  log("## Result");
  for (const r of results) log(`- step ${r.step}: ${r.ok ? "PASS" : "FAIL"}`);
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const verdict = exitCode === 0 && failed === 0 && passed === TOTAL_STEPS ? "PASS" : "FAIL";
  log(`B8 mid-settle kill drill ${verdict} (${passed}/${TOTAL_STEPS} steps PASS)`);
  if (verdict === "PASS") {
    rmSync(scratch, { recursive: true, force: true });
    log(`scratch dir removed: ${scratch}`);
  } else {
    log(`scratch dir kept for inspection: ${scratch}`);
  }
  process.exit(verdict === "PASS" ? 0 : 1);
}
