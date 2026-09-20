#!/usr/bin/env node
// H1 / H2 — the door over HTTP, at PRODUCTION defaults, on a REAL clock.
//
// Matrix rows H1 (rate limits: auth 5/min/address, commands 30/min/player)
// and H2 (commandId validated at the door) in
// docs/verification/2026-09-17-full-game-acceptance-matrix.md are
// "IMPLEMENTED + TESTED" and nothing more. server/test/rate-limit.test.ts
// proves the mechanism with INJECTED limits of 3 and 2 against a FAKE clock;
// the 5 and 30 that `node src/index.ts` actually runs with (literals in
// server/src/http.ts, not configurable) and the real-time refill have never
// been exercised. Milestone M1's "rapid registrations throttled" is the same
// claim. This drill is that exercise, HTTP-only: no Studio, no PC, no phone,
// no hosting.
//
// Web registrations and Roblox links claim from the same six seats (2 open +
// 4 AI, one shared helper), and a registration burst is the audit's own
// scenario for this door, so the drill keeps the two doors in separate
// disposable worlds - three in all:
//   A (port 4241)  the per-address auth door: /api/auth/register + /login
//   B (port 4242)  the per-player command door, the contract-shape guard, the
//                  unknown-user refusal, and the routes that are deliberately
//                  NOT throttled (the state heartbeat, the key-gated link)
//   C (port 4243)  a server started with NO KINGSAGE_ROBLOX_KEY: every
//                  /api/roblox route must refuse with 503, not hang or 500
//
// What this does NOT prove: per-player auth (H3 - one shared key still acts
// as anyone), anything under TLS or behind a reverse proxy (the address the
// door keys on would then be the proxy's - a hosting concern for H6), the
// Roblox-side handling of a 429 (Studio), or that 5 and 30 are the RIGHT
// numbers ("untuned by real play" stays true).
//
// Same posture as the other drills in scripts/: throwaway worlds in a fresh
// mkdtemp directory, throwaway key, non-4178 ports, inherited KINGSAGE_* env
// stripped. Needs only Node 22 + the sqlite3 CLI. ~90 s, of which ~75 s is
// waiting for the real clock to refill the auth door.
//
//   node scripts/h1-h2-door-drill.mjs                  # exit 0 = every step PASS
//   DOOR_PORT=4241 node scripts/h1-h2-door-drill.mjs   # A on 4241, B on 4242, C on 4243
//
// Every request, response and shell command is printed so the output can be
// pasted into a dated docs/verification/ note verbatim.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The production door, as server/src/http.ts hard-codes it. If someone
// changes the literals there, this drill fails on the count - which is the
// point: the numbers on record must be the numbers that run.
const AUTH_LIMIT = 5;
const COMMAND_LIMIT = 30;
const WINDOW_MS = 60_000;
const AUTH_TOKEN_MS = WINDOW_MS / AUTH_LIMIT;       // one auth attempt refills every 12 s
const COMMAND_TOKEN_MS = WINDOW_MS / COMMAND_LIMIT; // one command refills every 2 s

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = join(repoRoot, "server");
const basePort = Number(process.env.DOOR_PORT ?? 4241);
// Throwaway key for throwaway worlds. Not a secret; never reused anywhere.
const robloxKey = "door-throwaway-key-0001";
const PASSWORD = "door-drill-password-1";
const P1 = { userId: 940001, name: "Door One", tag: "p1" };
const P2 = { userId: 940002, name: "Door Two", tag: "p2" };

const scratch = mkdtempSync(join(tmpdir(), "kingsmarch-door-"));
const results = [];
const TOTAL_STEPS = 10;
let server = null;

const log = (line = "") => process.stdout.write(`${line}\n`);
const step = (n, title) => { log(""); log(`## Step ${n} — ${title}`); };
function record(n, ok, detail) { results.push({ step: n, ok, detail }); log(`[step ${n}] ${ok ? "PASS" : "FAIL"} — ${detail}`); }
function fail(n, detail) { record(n, false, detail); throw new Error(`step ${n} failed: ${detail}`); }
function expect(n, condition, detail) { if (!condition) fail(n, detail); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shorten = (text, max = 300) => (text.length > max ? `${text.slice(0, max)}… (${text.length} bytes)` : text);
const ordinal = (n) => { const s = ["th", "st", "nd", "rd"]; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };

function sqlite(dbPath, sql) {
  const run = spawnSync("sqlite3", [dbPath, sql], { encoding: "utf8" });
  log(`$ sqlite3 <db> ${JSON.stringify(sql)}`);
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
  if (out) log(out.split("\n").map((l) => `  ${l}`).join("\n"));
  log(`  -> exit ${run.status}`);
  return { stdout: (run.stdout ?? "").trim(), stderr: (run.stderr ?? "").trim(), status: run.status };
}

// node:http rather than fetch so the SOURCE address can be chosen (step 3
// keys the door on 127.0.0.2) and so a raw non-JSON body can be sent (step 5).
function request(port, method, path, body, { key = robloxKey, cookie, localAddress, rawBody, quiet = false, label } = {}) {
  const payload = rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body);
  const headers = { "content-type": "application/json" };
  if (key !== null) headers["x-kingsage-key"] = key;
  if (cookie) headers.cookie = cookie;
  if (payload !== undefined) headers["content-length"] = Buffer.byteLength(payload);
  const shown = label ?? (rawBody !== undefined ? `<raw ${Buffer.byteLength(rawBody)} bytes>` : body === undefined ? "" : JSON.stringify(body));
  const from = localAddress ? ` (from ${localAddress})` : "";
  return new Promise((done) => {
    const req = httpRequest({ host: "127.0.0.1", port, method, path, headers, localAddress }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-JSON */ }
        if (!quiet) log(`${method} ${path}${shown ? ` ${shown}` : ""}${from} -> ${res.statusCode} ${shorten(text)}`);
        done({ status: res.statusCode, json, text, headers: res.headers });
      });
    });
    req.on("error", (error) => {
      if (!quiet) log(`${method} ${path}${shown ? ` ${shown}` : ""}${from} -> no response (${error.code ?? error.message})`);
      done({ status: 0, json: null, text: "", errorCode: error.code ?? error.message, headers: {} });
    });
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function startServer(port, dbPath, { withKey = true } = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("KINGSAGE_")) env[k] = v;
  Object.assign(env, { KINGSAGE_DATABASE_PATH: dbPath, KINGSAGE_BIND: "127.0.0.1", PORT: String(port) });
  if (withKey) env.KINGSAGE_ROBLOX_KEY = robloxKey;
  log(`$ (cd server && KINGSAGE_DATABASE_PATH=${dbPath} ${withKey ? "KINGSAGE_ROBLOX_KEY=<throwaway>" : "# KINGSAGE_ROBLOX_KEY deliberately unset"} KINGSAGE_BIND=127.0.0.1 PORT=${port} node --experimental-strip-types src/index.ts &)`);
  const child = spawn(process.execPath, ["--experimental-strip-types", "src/index.ts"], { cwd: serverRoot, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => log(`  [server:${port}] ${String(chunk).trimEnd()}`));
  child.stderr.on("data", (chunk) => { const text = String(chunk).trimEnd(); if (!text.includes("ExperimentalWarning") && !text.includes("--trace-warnings")) log(`  [server:${port}:err] ${text}`); });
  child.exited = new Promise((done) => child.once("exit", (code, signal) => done({ code, signal })));
  child.port = port;
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

async function stopServer(child, label) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  log(`$ kill -TERM <${label} pid ${child.pid}>`);
  child.kill("SIGTERM");
  const outcome = await Promise.race([child.exited, sleep(10_000).then(() => ({ code: null, signal: "TIMEOUT" }))]);
  if (outcome.signal === "TIMEOUT") { child.kill("SIGKILL"); await child.exited; }
  log(`  -> ${label} exited (code ${outcome.code}, signal ${outcome.signal}) at ${new Date().toISOString()}`);
}

const registerBody = (username, kingdomName) => ({ username, password: PASSWORD, kingdomName });
const loginBody = (username, password = PASSWORD) => ({ username, password });
const wallOrder = (player, commandId, expectedWorldVersion) => ({
  robloxUserId: player.userId, commandId, expectedWorldVersion,
  command: { type: "village.build.queue", payload: { villageId: player.villageId, building: "wall" } },
});

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

async function main() {
  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
  log(`# H1/H2 — the door at production defaults (current tip)`);
  log(`date: ${new Date().toISOString()}`);
  log(`sha: ${sha}`);
  log(`node: ${process.version}`);
  log(`sqlite3: ${spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).stdout.trim()}`);
  log(`scratch: ${scratch}`);
  log(`ports: A=${basePort} (auth door) B=${basePort + 1} (command door) C=${basePort + 2} (no key)`);
  log(`door as coded: auth ${AUTH_LIMIT}/${WINDOW_MS / 1000}s per address (1 token per ${AUTH_TOKEN_MS / 1000}s), commands ${COMMAND_LIMIT}/${WINDOW_MS / 1000}s per player (1 token per ${COMMAND_TOKEN_MS / 1000}s)`);

  // ================================================================ world A
  const portA = basePort;
  const dbA = join(scratch, "door-a.sqlite");

  // ------------------------------------------------------------------ 1
  step(1, "world A — fresh disposable world; first registration (attempt 1 of the address's 5) succeeds and sets the session cookie");
  expect(1, !existsSync(dbA), `scratch DB already exists at ${dbA}`);
  server = startServer(portA, dbA);
  const hA = await waitForHealth(portA);
  log(`GET /api/health -> ${hA.status} ${hA.text}`);
  expect(1, hA.json?.ok === true && hA.json?.service === "kingsage-world", `unexpected health body ${hA.text}`);
  const authAttempts = []; // every request that passes through the per-address door, in order
  const reg1 = await request(portA, "POST", "/api/auth/register", registerBody("door_one", "Door Realm One"), { key: null });
  authAttempts.push({ what: "register door_one", status: reg1.status });
  expect(1, reg1.status === 201 && reg1.json?.player?.kingdomId, `register door_one: ${reg1.status} ${reg1.text}`);
  const cookieHeader = String(reg1.headers["set-cookie"]?.[0] ?? "");
  log(`Set-Cookie: ${cookieHeader.replace(/kingsage_session=[^;]+/, "kingsage_session=<token>")}`);
  expect(1, /HttpOnly/.test(cookieHeader) && /SameSite=Lax/.test(cookieHeader), `session cookie lacks HttpOnly/SameSite: ${cookieHeader}`);
  const hasSecure = /;\s*Secure/i.test(cookieHeader);
  const cookieA = cookieHeader.split(";")[0];
  const me = await request(portA, "GET", "/api/session", undefined, { key: null, cookie: cookieA });
  expect(1, me.status === 200 && me.json?.player?.username === "door_one", `/api/session with the cookie: ${me.status} ${me.text}`);
  record(1, true, `health 200; register door_one 201 → ${reg1.json.player.kingdomId}; cookie HttpOnly + SameSite=Lax${hasSecure ? " + Secure" : " (no Secure flag — H5 says MISSING; recorded, not judged here)"}; /api/session 200 with it`);

  // ------------------------------------------------------------------ 2
  step(2, `world A — the per-address auth door at ${AUTH_LIMIT}/min: attempts 2–${AUTH_LIMIT} (registrations and a wrong-password login) are answered on their merits; attempt ${AUTH_LIMIT + 1}, a registration, is 429 while seats remain — the door, not the world, said no; attempt ${AUTH_LIMIT + 2}, a correct login, is 429 too (one door for both routes)`);
  // Audit finding 12.4's scenario: "six scripted registrations exhausted the
  // world's seats". Six seats exist (2 open + 4 AI). With the door, the
  // sixth attempt inside a minute never reaches the seat table.
  const seatsBefore = Number(sqlite(dbA, "SELECT count(*) FROM local_kingdoms WHERE controller_player_id IS NULL AND seat_kind IN ('open','ai');").stdout);
  expect(2, seatsBefore === 5, `expected 5 claimable seats after one registration, found ${seatsBefore}`);
  const reg2 = await request(portA, "POST", "/api/auth/register", registerBody("door_two", "Door Realm Two"), { key: null });
  authAttempts.push({ what: "register door_two", status: reg2.status });
  expect(2, reg2.status === 201, `register door_two: ${reg2.status} ${reg2.text}`);
  const badLogin = await request(portA, "POST", "/api/auth/login", loginBody("door_one", "wrong-password-xx"), { key: null });
  authAttempts.push({ what: "login door_one WRONG password", status: badLogin.status });
  expect(2, badLogin.status === 401 && badLogin.json?.error?.code === "INVALID_LOGIN", `wrong-password login: ${badLogin.status} ${badLogin.text}`);
  const reg3 = await request(portA, "POST", "/api/auth/register", registerBody("door_three", "Door Realm Three"), { key: null });
  authAttempts.push({ what: "register door_three", status: reg3.status });
  expect(2, reg3.status === 201, `register door_three: ${reg3.status} ${reg3.text}`);
  const reg4 = await request(portA, "POST", "/api/auth/register", registerBody("door_four", "Door Realm Four"), { key: null });
  authAttempts.push({ what: "register door_four", status: reg4.status });
  expect(2, reg4.status === 201, `register door_four: ${reg4.status} ${reg4.text}`);
  expect(2, authAttempts.length === AUTH_LIMIT, `expected ${AUTH_LIMIT} attempts so far, counted ${authAttempts.length}`);
  const refusedRegister = await request(portA, "POST", "/api/auth/register", registerBody("door_five", "Door Realm Five"), { key: null });
  authAttempts.push({ what: `register door_five (${AUTH_LIMIT + 1}th attempt)`, status: refusedRegister.status });
  expect(2, refusedRegister.status === 429 && refusedRegister.json?.error?.code === "RATE_LIMITED", `attempt ${AUTH_LIMIT + 1} (a registration, seats still open) should be 429: ${refusedRegister.status} ${refusedRegister.text}`);
  const refusedLogin = await request(portA, "POST", "/api/auth/login", loginBody("door_one"), { key: null });
  authAttempts.push({ what: `login door_one correct (${AUTH_LIMIT + 2}th attempt)`, status: refusedLogin.status });
  expect(2, refusedLogin.status === 429 && refusedLogin.json?.error?.code === "RATE_LIMITED", `attempt ${AUTH_LIMIT + 2} (a correct login) should be 429: ${refusedLogin.status} ${refusedLogin.text}`);
  const retryAfter = refusedRegister.headers["retry-after"];
  const players = sqlite(dbA, "SELECT username FROM local_players ORDER BY username;").stdout.split("\n").filter(Boolean);
  expect(2, players.join(",") === "door_four,door_one,door_three,door_two", `local_players holds ${JSON.stringify(players)}; expected exactly door_one..door_four`);
  const seatsLeft = sqlite(dbA, "SELECT id FROM local_kingdoms WHERE controller_player_id IS NULL AND seat_kind IN ('open','ai') ORDER BY id;").stdout.split("\n").filter(Boolean);
  expect(2, seatsLeft.length === 2, `expected 2 claimable seats to survive the burst, found ${JSON.stringify(seatsLeft)}`);
  const sessions = Number(sqlite(dbA, "SELECT count(*) FROM local_sessions;").stdout);
  expect(2, sessions === 4, `expected 4 sessions (4 registrations; the refused login made none), found ${sessions}`);
  log(`attempts through the door: ${authAttempts.map((a, i) => `#${i + 1} ${a.what} → ${a.status}`).join("; ")}`);
  record(2, true, `attempts 1–${AUTH_LIMIT} answered on merit (${authAttempts.slice(0, AUTH_LIMIT).map((a) => a.status).join(", ")} — the wrong-password 401 counted like the rest); attempt ${AUTH_LIMIT + 1} (registration) and ${AUTH_LIMIT + 2} (correct login) both 429 RATE_LIMITED "${refusedRegister.json.error.message}"; 4 players, 4 sessions, seats ${seatsLeft.join(", ")} still unclaimed — the door stopped the burst two seats before the world ran out${retryAfter ? `; Retry-After: ${retryAfter}` : "; no Retry-After header on the 429 (recorded, not judged)"}`);

  // ------------------------------------------------------------------ 3
  step(3, "world A — the door is keyed per source ADDRESS: the same login from 127.0.0.2 is allowed while 127.0.0.1 is still refused");
  const fromOther = await request(portA, "POST", "/api/auth/login", loginBody("door_one"), { key: null, localAddress: "127.0.0.2" });
  expect(3, fromOther.status === 200, `login from 127.0.0.2: ${fromOther.status} ${fromOther.text}${fromOther.status === 0 ? " (this host cannot bind a second loopback address; the per-address claim cannot be shown here)" : ""}`);
  const stillRefused = await request(portA, "POST", "/api/auth/login", loginBody("door_one"), { key: null });
  expect(3, stillRefused.status === 429, `127.0.0.1 should still be refused: ${stillRefused.status} ${stillRefused.text}`);
  record(3, true, `127.0.0.2 login 200 (its own bucket); 127.0.0.1 login 429 in the same second`);

  // ------------------------------------------------------------------ 4
  step(4, `world A — a REAL clock refills the door: ${AUTH_TOKEN_MS / 1000}s restores exactly one attempt; a full minute restores all ${AUTH_LIMIT}`);
  // The bucket refills continuously from the last touch, so measure from
  // the last refused call (step 3's), not from the first refusal.
  const oneTokenWait = AUTH_TOKEN_MS + 500;
  log(`waiting ${(oneTokenWait / 1000).toFixed(1)}s (one token = ${AUTH_TOKEN_MS / 1000}s at ${AUTH_LIMIT}/${WINDOW_MS / 1000}s) …`);
  await sleep(oneTokenWait);
  const afterOne = await request(portA, "POST", "/api/auth/login", loginBody("door_one"), { key: null });
  expect(4, afterOne.status === 200, `after ${oneTokenWait / 1000}s one login should pass: ${afterOne.status} ${afterOne.text}`);
  const afterOneAgain = await request(portA, "POST", "/api/auth/login", loginBody("door_one"), { key: null });
  expect(4, afterOneAgain.status === 429, `the very next attempt should be refused again: ${afterOneAgain.status} ${afterOneAgain.text}`);
  const minuteWait = WINDOW_MS + 500;
  log(`waiting ${(minuteWait / 1000).toFixed(1)}s for the full window ("try again in a minute") …`);
  await sleep(minuteWait);
  const statuses = [];
  for (let i = 0; i < AUTH_LIMIT + 1; i += 1) {
    const r = await request(portA, "POST", "/api/auth/login", loginBody("door_one"), { key: null, quiet: true });
    statuses.push(r.status);
  }
  log(`${AUTH_LIMIT + 1} rapid logins after the minute -> ${statuses.join(", ")}`);
  expect(4, statuses.slice(0, AUTH_LIMIT).every((s) => s === 200) && statuses[AUTH_LIMIT] === 429, `after a full minute expected ${AUTH_LIMIT}×200 then 429, got ${statuses.join(", ")}`);
  record(4, true, `after ${oneTokenWait / 1000}s exactly one login passed (200) and the next was 429; after ${minuteWait / 1000}s: ${AUTH_LIMIT} logins 200, the ${AUTH_LIMIT + 1}th 429 — the whole allowance came back`);
  await stopServer(server, "world A server");
  server = null;

  // ================================================================ world B
  const portB = basePort + 1;
  const dbB = join(scratch, "door-b.sqlite");

  // ------------------------------------------------------------------ 5
  step(5, "world B — H2: the contract-shape guard at /api/roblox/commands: malformed envelopes die at the door with 400, an oversize body with 413, an unlinked user with 404; none reaches the inbox");
  server = startServer(portB, dbB);
  const hB = await waitForHealth(portB);
  log(`GET /api/health -> ${hB.status} ${hB.text}`);
  for (const player of [P1, P2]) {
    const link = await request(portB, "POST", "/api/roblox/session", { robloxUserId: player.userId, displayName: player.name });
    expect(5, link.status === 200 && link.json.created === true, `link ${player.tag}: ${link.status} ${link.text}`);
    player.playerId = link.json.playerId;
    player.kingdomId = link.json.kingdomId;
  }
  const pull0 = await pullState(portB, [P1.userId, P2.userId]);
  for (const player of [P1, P2]) {
    const state = pull0.states[String(player.userId)];
    player.villageId = ownVillage(state).id;
    player.version = state.world.version;
    log(`${player.tag}: ${player.playerId} / ${player.kingdomId} / ${player.villageId}, world version ${player.version}`);
  }
  const good = wallOrder(P1, "door-shape-probe", P1.version);
  const malformed = [
    { label: "no commandId", body: { ...good, commandId: undefined }, code: "INVALID_CONTRACT", status: 400 },
    { label: "empty commandId", body: { ...good, commandId: "" }, code: "INVALID_CONTRACT", status: 400 },
    { label: "129-char commandId", body: { ...good, commandId: "x".repeat(129) }, code: "INVALID_CONTRACT", status: 400 },
    { label: "numeric commandId", body: { ...good, commandId: 12345 }, code: "INVALID_CONTRACT", status: 400 },
    { label: "no command", body: { ...good, command: undefined }, code: "INVALID_CONTRACT", status: 400 },
    { label: "command is an array", body: { ...good, command: ["village.build.queue"] }, code: "INVALID_CONTRACT", status: 400 },
    { label: "command.type not a string", body: { ...good, command: { type: 7, payload: {} } }, code: "INVALID_CONTRACT", status: 400 },
    { label: "body is not JSON", rawBody: "this is not json", code: "INVALID_JSON", status: 400 },
    { label: "body is a JSON array", rawBody: "[1,2,3]", code: "INVALID_JSON", status: 400 },
    { label: "body over 1 MB", rawBody: JSON.stringify({ ...good, commandId: "door-oversize", padding: "p".repeat(1_000_001) }), code: "BODY_TOO_LARGE", status: 413 },
  ];
  const shapeReport = [];
  for (const probe of malformed) {
    const res = await request(portB, "POST", "/api/roblox/commands", probe.body, { rawBody: probe.rawBody, label: probe.rawBody !== undefined ? `<${probe.label}: ${Buffer.byteLength(probe.rawBody)} bytes>` : undefined });
    expect(5, res.status === probe.status && res.json?.error?.code === probe.code, `${probe.label}: expected ${probe.status} ${probe.code}, got ${res.status} ${res.text}`);
    shapeReport.push(`${probe.label} → ${res.status} ${res.json.error.code}`);
  }
  const unknown = await request(portB, "POST", "/api/roblox/commands", { ...wallOrder({ userId: 949999, villageId: P1.villageId }, "door-unknown-user", P1.version) });
  expect(5, unknown.status === 404 && unknown.json?.error?.code === "UNKNOWN_ROBLOX_USER", `unlinked user: ${unknown.status} ${unknown.text}`);
  const inbox5 = Number(sqlite(dbB, "SELECT count(*) FROM local_command_inbox;").stdout);
  expect(5, inbox5 === 0, `inbox should be empty after door refusals, holds ${inbox5}`);
  record(5, true, `${malformed.length} malformed envelopes refused at the door (${shapeReport.join("; ")}); unlinked user 404 UNKNOWN_ROBLOX_USER; inbox 0 rows — nothing refused at the door was stored`);

  // ------------------------------------------------------------------ 6
  step(6, "world B — the routes the door deliberately does NOT cover: /api/roblox/session (key-gated link) and /api/roblox/state (heartbeat) take rapid repeats without a 429");
  const rejoinStatuses = [];
  for (let i = 0; i < AUTH_LIMIT + 3; i += 1) {
    const r = await request(portB, "POST", "/api/roblox/session", { robloxUserId: P1.userId, displayName: `${P1.name} rejoin ${i + 1}` }, { quiet: true });
    rejoinStatuses.push(`${r.status}${r.json?.created === false ? "" : "?"}`);
  }
  log(`${AUTH_LIMIT + 3} rapid /api/roblox/session rejoins for ${P1.userId} -> ${rejoinStatuses.join(", ")}`);
  expect(6, rejoinStatuses.every((s) => s === "200"), `rejoins should all be 200 created:false: ${rejoinStatuses.join(", ")}`);
  const pulseStatuses = [];
  for (let i = 0; i < 12; i += 1) {
    const r = await request(portB, "POST", "/api/roblox/state", { robloxUserIds: [P1.userId, P2.userId] }, { quiet: true });
    pulseStatuses.push(r.status);
  }
  log(`12 rapid /api/roblox/state pulls -> ${pulseStatuses.join(", ")}`);
  expect(6, pulseStatuses.every((s) => s === 200), `state pulls should all be 200: ${pulseStatuses.join(", ")}`);
  record(6, true, `${AUTH_LIMIT + 3} rapid rejoins all 200 created:false and 12 rapid state pulls all 200 — as coded: the per-address door covers /api/auth/* only, the Roblox link rides the shared key (H3 territory), and the heartbeat is never limited`);

  // ------------------------------------------------------------------ 7
  step(7, `world B — the per-player command door at ${COMMAND_LIMIT}/min: ${COMMAND_LIMIT} well-formed commands are answered on merit (200 or stored 409), the ${ordinal(COMMAND_LIMIT + 1)} and ${ordinal(COMMAND_LIMIT + 2)} are 429 command.rejected RATE_LIMITED and are NOT stored`);
  const ledger = [];
  let version = (await pullState(portB, [P1.userId], { quiet: true })).states[String(P1.userId)].world.version;
  const burstStart = Date.now();
  for (let i = 1; i <= COMMAND_LIMIT; i += 1) {
    // #1 is a real, accepted recruit; #2 carries the 128-char boundary id;
    // the rest are Rampart orders at Headquarters 1 - stored
    // PREREQUISITE_MISSING rejections that leave the world untouched.
    const commandId = i === 2 ? `door-p1-02-${"y".repeat(128 - "door-p1-02-".length)}` : `door-p1-${String(i).padStart(2, "0")}`;
    const body = i === 1
      ? { robloxUserId: P1.userId, commandId, expectedWorldVersion: version, command: { type: "village.recruit.queue", payload: { villageId: P1.villageId, troop: "militia", quantity: 1 } } }
      : wallOrder(P1, commandId, version);
    // #1, #2 and #30 are printed in full; the rest are identical Rampart
    // refusals and are summarised below.
    const res = await request(portB, "POST", "/api/roblox/commands", body, { quiet: i > 2 && i < COMMAND_LIMIT });
    const code = res.json?.payload?.code ?? (res.json?.type === "command.accepted" ? "accepted" : `HTTP ${res.status}`);
    ledger.push({ i, commandId, status: res.status, code, text: res.text });
    expect(7, res.status !== 429, `command #${i} was refused 429 before the ${COMMAND_LIMIT}-command allowance was spent`);
    expect(7, res.status === 200 || res.status === 409, `command #${i}: unexpected ${res.status} ${res.text}`);
    if (res.json?.type === "command.accepted") version = res.json.payload.worldVersion;
    else if (code === "WORLD_VERSION_CONFLICT") version = res.json.payload.currentWorldVersion;
  }
  const burstMs = Date.now() - burstStart;
  const codes = ledger.reduce((acc, r) => ({ ...acc, [r.code]: (acc[r.code] ?? 0) + 1 }), {});
  const middleOutcomes = [...new Set(ledger.slice(2, -1).map((r) => `${r.status} ${r.code}`))];
  log(`${COMMAND_LIMIT} commands in ${burstMs} ms: ${JSON.stringify(codes)} (#1 ${ledger[0].code}; #2 with a ${ledger[1].commandId.length}-char commandId ${ledger[1].code}; #3–#${COMMAND_LIMIT - 1} not printed, outcomes: ${middleOutcomes.join(", ")})`);
  expect(7, ledger[0].code === "accepted", `#1 recruit should be accepted: ${ledger[0].text}`);
  expect(7, ledger[1].commandId.length === 128 && ledger[1].status === 409, `#2 (128-char id) should pass the door and be judged on merit: ${ledger[1].status} ${ledger[1].text}`);
  const over1 = await request(portB, "POST", "/api/roblox/commands", wallOrder(P1, `door-p1-${COMMAND_LIMIT + 1}`, version));
  expect(7, over1.status === 429 && over1.json?.type === "command.rejected" && over1.json?.payload?.code === "RATE_LIMITED" && over1.json?.payload?.commandId === `door-p1-${COMMAND_LIMIT + 1}`, `#${COMMAND_LIMIT + 1} should be 429 command.rejected RATE_LIMITED: ${over1.status} ${over1.text}`);
  const over2 = await request(portB, "POST", "/api/roblox/commands", wallOrder(P1, `door-p1-${COMMAND_LIMIT + 2}`, version));
  expect(7, over2.status === 429 && over2.json?.payload?.code === "RATE_LIMITED", `#${COMMAND_LIMIT + 2} should be 429: ${over2.status} ${over2.text}`);
  const refusedAt = Date.now();
  const inbox7 = Number(sqlite(dbB, "SELECT count(*) FROM local_command_inbox;").stdout);
  expect(7, inbox7 === COMMAND_LIMIT, `inbox should hold exactly ${COMMAND_LIMIT} rows (the 429s store nothing), holds ${inbox7}`);
  const storedOver = sqlite(dbB, `SELECT count(*) FROM local_command_inbox WHERE command_id IN ('door-p1-${COMMAND_LIMIT + 1}', 'door-p1-${COMMAND_LIMIT + 2}');`).stdout;
  expect(7, storedOver === "0", `refused commandIds were stored: ${storedOver}`);
  const jobs7 = sqlite(dbB, "SELECT count(*) FROM local_recruitment_jobs;").stdout;
  expect(7, jobs7 === "1", `expected exactly 1 recruitment job from #1, found ${jobs7}`);
  record(7, true, `${COMMAND_LIMIT} commands in ${burstMs} ms all answered on merit ${JSON.stringify(codes)} — so the 10 malformed probes of step 5 cost nothing; #${COMMAND_LIMIT + 1} and #${COMMAND_LIMIT + 2} → 429 command.rejected RATE_LIMITED "${over1.json.payload.message}" (currentWorldVersion ${over1.json.payload.currentWorldVersion}); inbox ${inbox7} rows, refused ids absent, 1 recruitment job`);

  // ------------------------------------------------------------------ 8
  step(8, "world B — while p1 is refused: the heartbeat still answers, p2's door is independent, and p1 is still refused");
  const pulses8 = [];
  for (let i = 0; i < 10; i += 1) pulses8.push((await request(portB, "POST", "/api/roblox/state", { robloxUserIds: [P1.userId, P2.userId] }, { quiet: true })).status);
  log(`10 /api/roblox/state pulls during p1's refusal -> ${pulses8.join(", ")}`);
  expect(8, pulses8.every((s) => s === 200), `heartbeat starved: ${pulses8.join(", ")}`);
  const p2Version = (await pullState(portB, [P2.userId], { quiet: true })).states[String(P2.userId)].world.version;
  const p2Order = await request(portB, "POST", "/api/roblox/commands", wallOrder(P2, "door-p2-01", p2Version));
  expect(8, p2Order.status === 409 && p2Order.json?.type === "command.rejected" && p2Order.json?.payload?.code !== "RATE_LIMITED", `p2's first command should be judged on merit (a stored 409), got ${p2Order.status} ${p2Order.text}`);
  const p1Still = await request(portB, "POST", "/api/roblox/commands", wallOrder(P1, `door-p1-${COMMAND_LIMIT + 3}`, version));
  expect(8, p1Still.status === 429, `p1 should still be refused: ${p1Still.status} ${p1Still.text}`);
  record(8, true, `10 heartbeat pulls 200 during the refusal; p2's first command answered on merit (409 ${p2Order.json.payload.code} "${p2Order.json.payload.message}"); p1 still 429`);

  // ------------------------------------------------------------------ 9
  step(9, `world B — a REAL clock refills p1's door at one command per ${COMMAND_TOKEN_MS / 1000}s, and a commandId that was refused 429 is NOT remembered as a rejection: resent, it is judged on merit and stored`);
  const sinceLastTouch = Date.now() - refusedAt;
  const waitMs = Math.max(0, COMMAND_TOKEN_MS + 700 - sinceLastTouch);
  log(`waiting ${(waitMs / 1000).toFixed(1)}s (one token = ${COMMAND_TOKEN_MS / 1000}s at ${COMMAND_LIMIT}/${WINDOW_MS / 1000}s; bucket last touched ${sinceLastTouch} ms ago) …`);
  await sleep(waitMs);
  const resent = await request(portB, "POST", "/api/roblox/commands", wallOrder(P1, `door-p1-${COMMAND_LIMIT + 1}`, version));
  if (resent.status === 409 && resent.json?.payload?.code === "WORLD_VERSION_CONFLICT") {
    log(`(world moved on to version ${resent.json.payload.currentWorldVersion} during the wait — a stored WORLD_VERSION_CONFLICT is equally "judged on merit")`);
  }
  expect(9, resent.status === 409 && resent.json?.type === "command.rejected" && resent.json?.payload?.code !== "RATE_LIMITED", `resent #${COMMAND_LIMIT + 1} should be judged on merit now: ${resent.status} ${resent.text}`);
  const storedResent = sqlite(dbB, `SELECT result_json FROM local_command_inbox WHERE command_id = 'door-p1-${COMMAND_LIMIT + 1}';`).stdout;
  expect(9, storedResent === resent.text, `resent command not stored as answered: stored ${storedResent}`);
  const nextRefused = await request(portB, "POST", "/api/roblox/commands", wallOrder(P1, `door-p1-${COMMAND_LIMIT + 4}`, version));
  expect(9, nextRefused.status === 429, `the very next p1 command should be refused again: ${nextRefused.status} ${nextRefused.text}`);
  const inbox9 = Number(sqlite(dbB, "SELECT count(*) FROM local_command_inbox;").stdout);
  expect(9, inbox9 === COMMAND_LIMIT + 2, `inbox should hold ${COMMAND_LIMIT + 2} rows (${COMMAND_LIMIT} + p2's + the resent one), holds ${inbox9}`);
  record(9, true, `after ${(waitMs / 1000).toFixed(1)}s the once-refused door-p1-${COMMAND_LIMIT + 1} was answered on merit (409 ${resent.json.payload.code}) and stored byte-identically; the next p1 command was 429 again; inbox ${inbox9} rows`);
  await stopServer(server, "world B server");
  server = null;

  // ================================================================ world C
  const portC = basePort + 2;
  const dbC = join(scratch, "door-c.sqlite");

  // ------------------------------------------------------------------ 10
  step(10, "world C — started with NO KINGSAGE_ROBLOX_KEY: health is 200 and the web door works, but every /api/roblox route refuses 503 ROBLOX_DISABLED whatever key is presented, and links nothing");
  server = startServer(portC, dbC, { withKey: false });
  const hC = await waitForHealth(portC);
  log(`GET /api/health -> ${hC.status} ${hC.text}`);
  const noKeyLink = await request(portC, "POST", "/api/roblox/session", { robloxUserId: P1.userId, displayName: P1.name });
  expect(10, noKeyLink.status === 503 && noKeyLink.json?.error?.code === "ROBLOX_DISABLED", `session with a key on a keyless server: ${noKeyLink.status} ${noKeyLink.text}`);
  const noKeyLinkBare = await request(portC, "POST", "/api/roblox/session", { robloxUserId: P1.userId, displayName: P1.name }, { key: null });
  expect(10, noKeyLinkBare.status === 503, `session with no key on a keyless server: ${noKeyLinkBare.status}`);
  const noKeyState = await request(portC, "POST", "/api/roblox/state", { robloxUserIds: [P1.userId] });
  expect(10, noKeyState.status === 503 && noKeyState.json?.error?.code === "ROBLOX_DISABLED", `state on a keyless server: ${noKeyState.status} ${noKeyState.text}`);
  const noKeyCommand = await request(portC, "POST", "/api/roblox/commands", wallOrder({ userId: P1.userId, villageId: "village-1-capital" }, "door-c-01", 1));
  expect(10, noKeyCommand.status === 503, `commands on a keyless server: ${noKeyCommand.status} ${noKeyCommand.text}`);
  const links = sqlite(dbC, "SELECT count(*) FROM roblox_players;").stdout;
  expect(10, links === "0", `keyless server linked ${links} players`);
  const webReg = await request(portC, "POST", "/api/auth/register", registerBody("door_web", "Door Web Realm"), { key: null });
  expect(10, webReg.status === 201, `web registration on the keyless server: ${webReg.status} ${webReg.text}`);
  record(10, true, `health 200; /api/roblox/session (with and without a key), /state and /commands all 503 ROBLOX_DISABLED "${noKeyLink.json.error.message}"; roblox_players 0 rows; the web door still registers (201) — the Roblox surface is off, not broken`);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  log("");
  log(`DOOR DRILL FAILED: ${error.message}`);
} finally {
  await stopServer(server, "world server");
  log("");
  log("## Result");
  for (const r of results) log(`- step ${r.step}: ${r.ok ? "PASS" : "FAIL"}`);
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const verdict = exitCode === 0 && failed === 0 && passed === TOTAL_STEPS ? "PASS" : "FAIL";
  log(`H1/H2 door drill ${verdict} (${passed}/${TOTAL_STEPS} steps PASS)`);
  if (verdict === "PASS") {
    rmSync(scratch, { recursive: true, force: true });
    log(`scratch dir removed: ${scratch}`);
  } else {
    log(`scratch dir kept for inspection: ${scratch}`);
  }
  process.exit(verdict === "PASS" ? 0 : 1);
}
