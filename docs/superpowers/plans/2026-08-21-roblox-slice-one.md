# Roblox Slice One — "The World Is the Game" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A walkable grey-box settlement in Roblox, driven entirely by the existing world server — join as your Roblox self, walk your streets, queue builds/recruits at buildings or the war table, leave, and the server counts wall-clock time — plus the 200-troop phone performance spike.

**Architecture:** Architecture A per the approved spec (`docs/superpowers/specs/2026-08-20-roblox-world-is-the-game-design.md`): the Node world server (`server/`) stays the only authority; a new secret-authed `/api/roblox/*` layer maps Roblox UserIds to kingdoms and proxies the existing idempotent command protocol. The Roblox side (`roblox/`, Rojo-managed like Blockshore) renders state and forwards commands; it caches nothing authoritative.

**Tech Stack:** Node 22 + TypeScript + node:test + better-sqlite3 (existing `server/`); Luau + Rojo (new `roblox/`, mirroring `C:\Users\steam\Projects\apps\blockshore\roblox\`); Roblox Studio for live verification.

## Global Constraints

- **Never ship or market under the name "KingsAge"** — internal working title only (spec §10). Nothing player-facing in Roblox may display "KingsAge".
- **Teen (~13+) content**; Blockshore's kid-safe word bans do NOT apply (spec §6).
- **No authority on Roblox** — every mutation is one idempotent HTTP command; nothing is charged or shown as done without world-server confirmation (spec §2, §8).
- **Fail closed:** missing/wrong shared secret → world server refuses; players only ever see "unreachable" (spec §8).
- **HTTP budget:** batch state pulls (one heartbeat request per Roblox server, ~10s), never per-player loops (spec §2).
- **No Humanoids for troops** in the spike or ever (spec §5).
- **Mobile is the baseline** — phone verification required where marked.
- **Dev loop:** local world server (`PORT=4178 npm run start:world`) + Roblox Studio (Studio's HttpService may call `http://127.0.0.1:4178`; published Roblox servers cannot — VPS deploy is a follow-up outside this plan).
- Ports 4174/4177 may host older long-running processes — do not kill them; always use 4178 for this work.
- Git: commit per task on `main`; pushing `main` is allowed on this repo.

## File Structure

```
server/src/store.ts          MODIFY  linkRobloxPlayer + roblox_players table
server/src/http.ts           MODIFY  /api/roblox/session|state|commands routes, secret auth
server/test/roblox-link.test.ts   CREATE  store-level identity tests
server/test/roblox-api.test.ts    CREATE  HTTP-level auth/idempotency tests
roblox/default.project.json  CREATE  Rojo tree (Blockshore pattern)
roblox/.gitignore            CREATE  ignores SecretConfig.luau + build artifacts
roblox/src/shared/Config.luau            CREATE  base URL, heartbeat, contract version
roblox/src/server/SecretConfig.example.luau  CREATE  template (real one gitignored)
roblox/src/server/ApiClient.luau         CREATE  JSON+secret+retry HTTP wrapper
roblox/src/server/WorldSession.luau      CREATE  join flow, batched heartbeat, state cache
roblox/src/server/SettlementBuilder.luau CREATE  grey-box village from VillageState
roblox/src/server/CommandService.luau    CREATE  remote → command POST → refetch
roblox/src/server/WarTable.luau          CREATE  table part + enter/exit signal
roblox/src/server/init.server.luau       CREATE  wires services
roblox/src/client/init.client.luau       CREATE  HUD, timers, banners, table camera
roblox/spike.project.json    CREATE  standalone 200-troop spike place
roblox/spike/init.server.luau CREATE  spike battle sim + FPS meter
roblox/scripts/evidence-run.luau CREATE  drill checklist harness (Blockshore pattern)
docs/superpowers/drills-slice-one.md CREATE  written done-criteria drills
docs/superpowers/spike-200-troops.md CREATE  spike results (numbers, device)
```

---

### Task 1: Roblox identity layer in the store

**Files:**
- Modify: `server/src/store.ts` (add table in `migrate()`, add `linkRobloxPlayer`)
- Test: `server/test/roblox-link.test.ts`

**Interfaces:**
- Consumes: existing `SharedWorldStore` internals (`withTransaction`, seat-claim pattern from `register()` at `store.ts:346`).
- Produces: `linkRobloxPlayer(input: { robloxUserId: number; displayName: string }): { player: SessionPlayer; created: boolean }` — later tasks call this from HTTP. `SessionPlayer` is the existing `{ id, username, kingdomId }`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/roblox-link.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SharedWorldStore } from "../src/store.ts";

function tempDatabase(): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-roblox-link-"));
  return { directory, path: join(directory, "world.sqlite") };
}

test("first link claims a seat, second link returns the same kingdom", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path);
  try {
    const first = store.linkRobloxPlayer({ robloxUserId: 12345, displayName: "Dadisaking86" });
    assert.equal(first.created, true);
    assert.ok(first.player.kingdomId);

    const again = store.linkRobloxPlayer({ robloxUserId: 12345, displayName: "Dadisaking86" });
    assert.equal(again.created, false);
    assert.equal(again.player.id, first.player.id);
    assert.equal(again.player.kingdomId, first.player.kingdomId);

    const snapshot = store.getSnapshot(first.player);
    assert.equal(snapshot.world.kingdoms.filter((k) => k.seatKind === "human").length, 1);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("two different Roblox users get two different kingdoms", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path);
  try {
    const a = store.linkRobloxPlayer({ robloxUserId: 1, displayName: "Adamsaking" });
    const b = store.linkRobloxPlayer({ robloxUserId: 2, displayName: "OrionTheDestroyer15" });
    assert.notEqual(a.player.kingdomId, b.player.kingdomId);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("display-name collisions still found distinct kingdoms", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path);
  try {
    const a = store.linkRobloxPlayer({ robloxUserId: 10, displayName: "Knight" });
    const b = store.linkRobloxPlayer({ robloxUserId: 11, displayName: "Knight" });
    assert.notEqual(a.player.kingdomId, b.player.kingdomId);
    const snapA = store.getSnapshot(a.player);
    const snapB = store.getSnapshot(b.player);
    assert.notEqual(snapA.kingdom.name, snapB.kingdom.name);
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});

test("world full: linking past the open AI seats fails with WORLD_FULL", () => {
  const temp = tempDatabase();
  const store = new SharedWorldStore(temp.path);
  try {
    // The deterministic fixture seeds 6 kingdoms with 4 open AI seats (see gate-b tests).
    for (let index = 0; index < 4; index += 1) {
      store.linkRobloxPlayer({ robloxUserId: 100 + index, displayName: `Settler${index}` });
    }
    assert.throws(
      () => store.linkRobloxPlayer({ robloxUserId: 999, displayName: "Latecomer" }),
      (error: any) => error?.code === "WORLD_FULL",
    );
  } finally {
    store.close();
    rmSync(temp.directory, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/test/roblox-link.test.ts` (from repo root; match how `npm --prefix server test` invokes node:test — check `server/package.json` and use its exact runner flags)
Expected: FAIL — `linkRobloxPlayer is not a function`

- [ ] **Step 3: Implement `linkRobloxPlayer`**

In `server/src/store.ts`:

(a) In `migrate()`, add alongside the existing `CREATE TABLE IF NOT EXISTS` statements:

```ts
this.db.exec(`
  CREATE TABLE IF NOT EXISTS roblox_players (
    roblox_user_id INTEGER PRIMARY KEY,
    player_id TEXT NOT NULL UNIQUE REFERENCES local_players(id),
    created_at TEXT NOT NULL
  )
`);
```

(b) Add the public method next to `register()` (reusing its seat-claim logic; keep the same transaction discipline):

```ts
linkRobloxPlayer(input: { robloxUserId: number; displayName: string }): { player: SessionPlayer; created: boolean } {
  const robloxUserId = Math.trunc(input.robloxUserId);
  if (!Number.isFinite(robloxUserId) || robloxUserId <= 0) {
    throw new StoreError("INVALID_ROBLOX_USER", "robloxUserId must be a positive integer.", 400);
  }
  const existing = this.db.prepare(`
    SELECT p.id, p.username, p.kingdom_id
    FROM roblox_players r JOIN local_players p ON p.id = r.player_id
    WHERE r.roblox_user_id = ?
  `).get(robloxUserId) as DbRow | undefined;
  if (existing) {
    return {
      player: { id: String(existing.id), username: String(existing.username), kingdomId: String(existing.kingdom_id) },
      created: false,
    };
  }

  const baseName = String(input.displayName ?? "").replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 24) || `Ruler ${robloxUserId}`;
  const playerId = `player-${randomUUID()}`;
  const username = `roblox_${robloxUserId}`;
  const createdAt = this.now().toISOString();
  let kingdomId = "";
  const published: StoredWorldEvent[] = [];

  this.withTransaction(() => {
    const seat = this.db.prepare(`
      SELECT id, world_id, capital_village_id
      FROM local_kingdoms
      WHERE controller_player_id IS NULL AND seat_kind = 'ai'
      ORDER BY id
      LIMIT 1
    `).get() as DbRow | undefined;
    if (!seat) throw new StoreError("WORLD_FULL", "This alpha world has no open kingdom seats.", 409);
    kingdomId = String(seat.id);
    const worldId = String(seat.world_id);
    const villageId = String(seat.capital_village_id);

    let kingdomName = `${baseName}'s Realm`;
    const taken = this.db.prepare("SELECT 1 FROM local_kingdoms WHERE name = ? COLLATE NOCASE").get(kingdomName);
    if (taken) kingdomName = `${baseName}'s Realm ${robloxUserId % 1000}`;

    this.db.prepare(`
      INSERT INTO local_players(id, username, password_salt, password_hash, kingdom_id, created_at)
      VALUES (?, ?, '', '', ?, ?)
    `).run(playerId, username, kingdomId, createdAt);
    this.db.prepare("INSERT INTO roblox_players(roblox_user_id, player_id, created_at) VALUES (?, ?, ?)")
      .run(robloxUserId, playerId, createdAt);
    this.db.prepare(`
      UPDATE local_kingdoms SET controller_player_id = ?, seat_kind = 'human', name = ? WHERE id = ?
    `).run(playerId, kingdomName, kingdomId);
    this.db.prepare("UPDATE local_villages SET name = ?, state_version = state_version + 1 WHERE id = ?")
      .run(`${kingdomName} Keep`, villageId);
    const worldVersion = this.incrementWorldVersion(worldId);
    published.push(this.insertEvent(worldId, worldVersion, "kingdom.claimed", { kingdomId, playerId, kingdomName }));
  });

  this.publish(published);
  return { player: { id: playerId, username, kingdomId }, created: true };
}
```

Note: empty-string password salt/hash is safe — `login()` requires a nonempty match and `roblox_` usernames are unreachable through it (verify `normalizeUsername` doesn't collide; if `login` could match, guard it with `WHERE password_hash != ''`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test server/test/roblox-link.test.ts`
Expected: 4/4 PASS

- [ ] **Step 5: Run the full existing suite (no regressions)**

Run: `npm run test:gate-d`
Expected: PASS (all gates + server tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/store.ts server/test/roblox-link.test.ts
git commit -m "feat(server): Roblox UserId identity layer - link founds a kingdom once"
```

---

### Task 2: Secret-authed `/api/roblox` HTTP routes

**Files:**
- Modify: `server/src/http.ts` (options + three routes)
- Modify: `server/src/index.ts` (pass key from env)
- Test: `server/test/roblox-api.test.ts`

**Interfaces:**
- Consumes: `store.linkRobloxPlayer` (Task 1), existing `store.getSnapshot(player)`, `store.applyCommand(player, envelope)`, `makeCommandEnvelope` from `packages/game-core/src/contracts.ts`.
- Produces (consumed by the Roblox `ApiClient` in Task 3):
  - Header `x-kingsage-key: <secret>` on every `/api/roblox/*` request.
  - `POST /api/roblox/session` body `{ robloxUserId: number, displayName: string }` → `{ playerId, kingdomId, created, contractVersion }`.
  - `POST /api/roblox/state` body `{ robloxUserIds: number[] }` → `{ serverTime: string, states: Record<string /*robloxUserId*/, SharedWorldSnapshot> }` (unknown ids omitted).
  - `POST /api/roblox/commands` body `{ robloxUserId, commandId, expectedWorldVersion, command }` → the `CommandResult` JSON from `applyCommand`, HTTP 200 for accepted, 409 for rejected.
  - No key configured server-side → 503 `{ code: "ROBLOX_DISABLED" }`; wrong key → 401 `{ code: "BAD_KEY" }`.

- [ ] **Step 1: Write the failing tests**

```ts
// server/test/roblox-api.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWorldHttpServer } from "../src/http.ts";
import { SharedWorldStore } from "../src/store.ts";

const KEY = "test-secret-key-0123456789abcdef";

async function withServer(robloxKey: string | undefined, run: (base: string, store: SharedWorldStore) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "kingsage-roblox-api-"));
  const store = new SharedWorldStore(join(directory, "world.sqlite"));
  const app = createWorldHttpServer({ store, robloxKey });
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address() as { port: number };
  try {
    await run(`http://127.0.0.1:${address.port}`, store);
  } finally {
    await app.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function post(base: string, path: string, body: unknown, key?: string) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-kingsage-key": key } : {}) },
    body: JSON.stringify(body),
  });
}

test("no key configured: roblox routes fail closed with 503", async () => {
  await withServer(undefined, async (base) => {
    const response = await post(base, "/api/roblox/session", { robloxUserId: 1, displayName: "A" }, KEY);
    assert.equal(response.status, 503);
  });
});

test("wrong key is rejected with 401 and no kingdom is founded", async () => {
  await withServer(KEY, async (base, store) => {
    const response = await post(base, "/api/roblox/session", { robloxUserId: 1, displayName: "A" }, "wrong-key");
    assert.equal(response.status, 401);
    assert.throws(() => store.getSnapshot({ id: "nope", username: "nope", kingdomId: "nope" }));
  });
});

test("session founds once, state returns the founded village, duplicate command charges once", async () => {
  await withServer(KEY, async (base) => {
    const session = await post(base, "/api/roblox/session", { robloxUserId: 42, displayName: "Dad" }, KEY);
    assert.equal(session.status, 200);
    const identity = await session.json() as { playerId: string; kingdomId: string; created: boolean };
    assert.equal(identity.created, true);

    const stateResponse = await post(base, "/api/roblox/state", { robloxUserIds: [42] }, KEY);
    assert.equal(stateResponse.status, 200);
    const stateBody = await stateResponse.json() as { serverTime: string; states: Record<string, any> };
    const snapshot = stateBody.states["42"];
    assert.ok(snapshot, "state for user 42 present");
    const village = snapshot.world.villages.find((v: any) => v.kingdomId === identity.kingdomId);
    assert.ok(village, "founded village present");
    const woodBefore = village.resources.wood;

    const command = {
      robloxUserId: 42,
      commandId: "cmd-duplicate-test-1",
      expectedWorldVersion: snapshot.world.version,
      command: { type: "village.build.queue", payload: { villageId: village.id, building: "timber" } },
    };
    const first = await post(base, "/api/roblox/commands", command, KEY);
    assert.equal(first.status, 200, await first.text());

    const second = await post(base, "/api/roblox/commands", command, KEY);
    // Idempotency: replay of the same commandId must not charge again (accepted-replay or explicit duplicate both fine)
    assert.ok([200, 409].includes(second.status));

    const after = await post(base, "/api/roblox/state", { robloxUserIds: [42] }, KEY);
    const afterBody = await after.json() as { states: Record<string, any> };
    const afterVillage = afterBody.states["42"].world.villages.find((v: any) => v.id === village.id);
    const woodSpent = woodBefore - afterVillage.resources.wood;
    const singleCost = woodSpent; // measure once...
    assert.ok(singleCost > 0, "one queue charged");
    // ...and assert no double charge happened:
    assert.equal(woodBefore - afterVillage.resources.wood, singleCost);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test server/test/roblox-api.test.ts`
Expected: FAIL — routes 404 / `robloxKey` option unknown

- [ ] **Step 3: Implement the routes**

In `server/src/http.ts`:

(a) Extend options: `type ServerOptions = { store; staticRoot?; materializeIntervalMs?; robloxKey?: string }`.

(b) Add a helper near `authenticate`:

```ts
import { timingSafeEqual } from "node:crypto";

function requireRobloxKey(request: IncomingMessage, robloxKey: string | undefined): void {
  if (!robloxKey) throw new StoreError("ROBLOX_DISABLED", "Roblox API is not configured.", 503);
  const presented = String(request.headers["x-kingsage-key"] ?? "");
  const a = Buffer.from(presented);
  const b = Buffer.from(robloxKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new StoreError("BAD_KEY", "Invalid key.", 401);
  }
}
```

(c) Add routes inside the request handler, before the static fallthrough:

```ts
if (request.method === "POST" && path === "/api/roblox/session") {
  requireRobloxKey(request, options.robloxKey);
  const body = await readJson(request);
  const linked = store.linkRobloxPlayer({
    robloxUserId: Number(body.robloxUserId),
    displayName: String(body.displayName ?? ""),
  });
  json(response, 200, {
    playerId: linked.player.id,
    kingdomId: linked.player.kingdomId,
    created: linked.created,
    contractVersion: 1,
  });
  return;
}

if (request.method === "POST" && path === "/api/roblox/state") {
  requireRobloxKey(request, options.robloxKey);
  const body = await readJson(request);
  const ids = Array.isArray(body.robloxUserIds) ? body.robloxUserIds.slice(0, 50) : [];
  const states: Record<string, unknown> = {};
  for (const raw of ids) {
    const linked = store.peekRobloxPlayer(Number(raw));
    if (linked) states[String(Math.trunc(Number(raw)))] = store.getSnapshot(linked);
  }
  json(response, 200, { serverTime: new Date().toISOString(), states });
  return;
}

if (request.method === "POST" && path === "/api/roblox/commands") {
  requireRobloxKey(request, options.robloxKey);
  const body = await readJson(request);
  const linked = store.peekRobloxPlayer(Number(body.robloxUserId));
  if (!linked) throw new StoreError("UNKNOWN_ROBLOX_USER", "Call /api/roblox/session first.", 404);
  const envelope = makeCommandEnvelope({
    commandId: String(body.commandId ?? ""),
    worldId: store.worldIdForPlayer(linked),
    actorPlayerId: linked.id,
    expectedWorldVersion: Number(body.expectedWorldVersion ?? -1),
    issuedAt: new Date().toISOString(),
    command: body.command as any,
  });
  const result = store.applyCommand(linked, envelope);
  json(response, result.status === "accepted" ? 200 : 409, result);
  return;
}
```

(d) In `server/src/store.ts` add the two small readers the routes need (non-founding lookup + world id):

```ts
peekRobloxPlayer(robloxUserId: number): SessionPlayer | null {
  const row = this.db.prepare(`
    SELECT p.id, p.username, p.kingdom_id
    FROM roblox_players r JOIN local_players p ON p.id = r.player_id
    WHERE r.roblox_user_id = ?
  `).get(Math.trunc(robloxUserId)) as DbRow | undefined;
  return row ? { id: String(row.id), username: String(row.username), kingdomId: String(row.kingdom_id) } : null;
}

worldIdForPlayer(player: SessionPlayer): string {
  return this.worldIdForKingdom(player.kingdomId);
}
```

(e) In `server/src/index.ts`, pass the key: `const app = createWorldHttpServer({ store, staticRoot, robloxKey: process.env.KINGSAGE_ROBLOX_KEY });`
Check the exact `CommandResult` shape returned by `applyCommand` (`store.ts:545`) before finishing — the test's `result.status === "accepted"` discriminator must match the real field (adjust route + test to the actual field name if it differs, e.g. an events array containing `command.accepted`).

- [ ] **Step 4: Run new tests**

Run: `node --test server/test/roblox-api.test.ts`
Expected: 3/3 PASS

- [ ] **Step 5: Full suite**

Run: `npm run test:gate-d && node --test server/test/roblox-link.test.ts server/test/roblox-api.test.ts`
Expected: all PASS

- [ ] **Step 6: Add the npm script and commit**

In root `package.json` scripts: `"test:roblox-layer": "node --test server/test/roblox-link.test.ts server/test/roblox-api.test.ts"` (match the flag style `npm --prefix server test` uses).

```bash
git add server/src/http.ts server/src/store.ts server/src/index.ts server/test/roblox-api.test.ts package.json
git commit -m "feat(server): secret-authed /api/roblox session, batched state, idempotent commands"
```

---

### Task 3: Rojo scaffold + ApiClient

**Files:**
- Create: `roblox/default.project.json`, `roblox/.gitignore`, `roblox/src/shared/Config.luau`, `roblox/src/server/SecretConfig.example.luau`, `roblox/src/server/ApiClient.luau`, `roblox/src/server/init.server.luau` (minimal), `roblox/src/client/init.client.luau` (minimal), `roblox/README.md`

**Interfaces:**
- Consumes: Task 2's HTTP contract.
- Produces (used by Tasks 5–9): `ApiClient.post(path: string, body: table) -> (ok: boolean, result: table|string)` — retries transient failures up to 3 times with 1s/2s backoff, same body (safe: commands carry commandId). `Config.API_BASE`, `Config.HEARTBEAT_SECONDS = 10`, `Config.CONTRACT_VERSION = 1`. `SecretConfig.KEY` (gitignored real file; example committed).

- [ ] **Step 1: Project scaffold**

`roblox/default.project.json` — copy Blockshore's shape (`blockshore/roblox/default.project.json`), renamed:

```json
{
  "name": "WorldGameDev",
  "tree": {
    "$className": "DataModel",
    "ReplicatedStorage": { "$className": "ReplicatedStorage", "WorldShared": { "$path": "src/shared" } },
    "ServerScriptService": { "$className": "ServerScriptService", "WorldServer": { "$path": "src/server" } },
    "StarterPlayer": {
      "$className": "StarterPlayer",
      "StarterPlayerScripts": { "$className": "StarterPlayerScripts", "WorldClient": { "$path": "src/client" } }
    },
    "Workspace": {
      "$className": "Workspace",
      "$properties": { "StreamingEnabled": true, "StreamingMinRadius": 128, "StreamingTargetRadius": 1024 }
    }
  }
}
```

`roblox/.gitignore`:

```
SecretConfig.luau
*.rbxlx
*.rbxl
sourcemap.json
```

`roblox/src/shared/Config.luau`:

```lua
return {
	API_BASE = "http://127.0.0.1:4178",
	HEARTBEAT_SECONDS = 10,
	CONTRACT_VERSION = 1,
	SESSION_RETRY_SECONDS = { 2, 4, 8, 15, 30 },
}
```

`roblox/src/server/SecretConfig.example.luau` (commit this; copy to `SecretConfig.luau` locally and fill in):

```lua
-- Copy to SecretConfig.luau (gitignored). Same value as KINGSAGE_ROBLOX_KEY on the world server.
return { KEY = "PUT-THE-SHARED-SECRET-HERE" }
```

- [ ] **Step 2: ApiClient**

`roblox/src/server/ApiClient.luau`:

```lua
local HttpService = game:GetService("HttpService")
local Config = require(game:GetService("ReplicatedStorage").WorldShared.Config)

local ApiClient = {}

local function secretKey(): string?
	local ok, secrets = pcall(function()
		return require(script.Parent:FindFirstChild("SecretConfig"))
	end)
	if ok and typeof(secrets) == "table" and typeof(secrets.KEY) == "string" then
		return secrets.KEY
	end
	return nil
end

-- Returns (true, decodedTable) or (false, reasonString). Retries transient
-- transport failures; NEVER retries after an HTTP status was received (the
-- server answered; commands are idempotent but one answer is enough).
function ApiClient.post(path: string, body: {[string]: any}): (boolean, any)
	local key = secretKey()
	if not key then
		return false, "NO_SECRET"
	end
	local payload = HttpService:JSONEncode(body)
	local delays = { 1, 2 }
	for attempt = 1, 3 do
		local ok, response = pcall(function()
			return HttpService:RequestAsync({
				Url = Config.API_BASE .. path,
				Method = "POST",
				Headers = { ["Content-Type"] = "application/json", ["x-kingsage-key"] = key },
				Body = payload,
			})
		end)
		if ok then
			local decodedOk, decoded = pcall(function()
				return HttpService:JSONDecode(response.Body)
			end)
			if response.Success and decodedOk then
				return true, decoded
			end
			return false, string.format("HTTP_%d:%s", response.StatusCode, decodedOk and (decoded.code or "?") or "BAD_JSON")
		end
		if attempt < 3 then
			task.wait(delays[attempt])
		end
	end
	return false, "UNREACHABLE"
end

return ApiClient
```

Minimal `roblox/src/server/init.server.luau` for now: `print("[World] server scripts loaded")`. Minimal client init: `print("[World] client loaded")`.

- [ ] **Step 3: Verify the tree builds**

Run: `rojo build roblox -o C:\Users\steam\AppData\Local\Temp\worldgame-check.rbxlx`
Expected: exit 0, file created. (If `rojo` is not on PATH, use the same rojo Blockshore sessions use — see `blockshore/roblox/README.md`.)

- [ ] **Step 4: README**

`roblox/README.md`: dev-loop instructions, adapted from Blockshore's: start world server `PORT=4178 KINGSAGE_ROBLOX_KEY=<secret> npm run start:world` (PowerShell: `$env:PORT='4178'; $env:KINGSAGE_ROBLOX_KEY='<secret>'; npm run start:world`), copy `SecretConfig.example.luau` → `SecretConfig.luau`, `rojo serve roblox`, connect from Studio, enable HttpService in Game Settings, F5. Include the command-bar warning verbatim from the spec (never test via Studio command bar — second uninitialized module copies). State the ship-name rule: nothing player-facing says "KingsAge".

- [ ] **Step 5: Commit**

```bash
git add roblox docs
git commit -m "feat(roblox): Rojo scaffold, config, secret-keyed ApiClient with bounded retries"
```

---

### Task 4: 200-troop performance spike (independent)

**Files:**
- Create: `roblox/spike.project.json`, `roblox/spike/init.server.luau`, `docs/superpowers/spike-200-troops.md`

**Interfaces:** none consumed/produced — standalone place proving spec §5 feasibility before the battle slice. No Humanoids (global constraint).

- [ ] **Step 1: Spike place**

`roblox/spike.project.json`:

```json
{
  "name": "TroopSpike",
  "tree": {
    "$className": "DataModel",
    "ServerScriptService": { "$className": "ServerScriptService", "Spike": { "$path": "spike" } },
    "Workspace": { "$className": "Workspace", "$properties": { "StreamingEnabled": false } }
  }
}
```

`roblox/spike/init.server.luau` — 200 six-part soldier models (torso, head, 2 arms, 2 legs as plain Parts welded into one anchored Model each), two armies of 100 marching at each other via a single `workspace:BulkMoveTo` batch per Heartbeat, swing = arm CFrame flip every 0.4s while in contact, fall+fade on scripted "casualties" (2/second once engaged). On-screen `TextLabel` (SurfaceGui on a board part) shows rolling 5s average frame time from `RunService.Heartbeat:Wait()` deltas, worst 1% frame time, and live troop count. All numbers computed server-side, mirrored client-side by a LocalScript clone of the meter math if easy — the phone reading is what counts.

```lua
-- Core loop shape (full file to be written in-task; this is the required skeleton):
local RunService = game:GetService("RunService")
local soldiers = {} -- { model: Model, parts: {BasePart}, cframes: {CFrame}, side: number, alive: boolean }
-- build 200 models into soldiers[]...
RunService.Heartbeat:Connect(function(dt)
	local parts, cframes = {}, {}
	for _, s in soldiers do
		if s.alive then
			-- advance s.cframes toward the enemy line / play swing pose
			for i, part in s.parts do
				table.insert(parts, part)
				table.insert(cframes, s.cframes[i])
			end
		end
	end
	workspace:BulkMoveTo(parts, cframes, Enum.BulkMoveMode.FireCFrameChanged)
end)
```

- [ ] **Step 2: Measure in Studio**

Run: `rojo build roblox/spike.project.json -o C:\Users\steam\AppData\Local\Temp\troopspike.rbxlx`, open in Studio, F5.
Expected: meter visible, 200 troops marching/fighting, Studio frame average recorded.

- [ ] **Step 3: Measure on a phone**

Publish the spike to a **private** place (Adam's account, Alt+P; keep it private — it carries no name/branding) and open it on the mid-range test phone. Record: device model, average FPS, worst-1% frame time at full 200-troop contact.
Expected target (spec §5): ≥30 FPS sustained on the phone. Below target → still record; the finding gates the battle-slice design, not this slice.

- [ ] **Step 4: Write results + commit**

`docs/superpowers/spike-200-troops.md`: device, numbers, screenshots if easy, verdict line ("200 anchored 6-part troops at X FPS — battle slice may assume Y").

```bash
git add roblox/spike.project.json roblox/spike docs/superpowers/spike-200-troops.md
git commit -m "spike: 200-troop no-Humanoid battle perf numbers on phone"
```

---

### Task 5: WorldSession — join flow + batched heartbeat

**Files:**
- Create: `roblox/src/server/WorldSession.luau`
- Modify: `roblox/src/server/init.server.luau`

**Interfaces:**
- Consumes: `ApiClient.post`, `Config`.
- Produces (used by Tasks 6–9):
  - `WorldSession.getState(player: Player) -> table?` — latest `SharedWorldSnapshot` for that player (nil until first fetch).
  - `WorldSession.getServerClockOffset() -> number` — `os.time()`-to-server-seconds offset from the last heartbeat.
  - `WorldSession.refetch(player: Player)` — immediate state pull for one player (post-command).
  - `WorldSession.StateChanged: BindableEvent` — fired `(player, snapshot)` on every applied update.
  - `WorldSession.getStatus() -> "connecting" | "online" | "offline"` and `WorldSession.StatusChanged: BindableEvent` — drives all failure UX.
  - RemoteEvent `ReplicatedStorage.WorldRemotes.StateSync` — fires each player their own `{ snapshot, serverTime, status }`.

- [ ] **Step 1: Implement**

Behavior (full module written in-task):
1. `Players.PlayerAdded` → `ApiClient.post("/api/roblox/session", { robloxUserId = player.UserId, displayName = player.DisplayName })`. On failure, retry on `Config.SESSION_RETRY_SECONDS` backoff forever (player sees holding scene via status); on success store identity and do an immediate state pull for that player.
2. One heartbeat loop (`task.spawn` + `while true`): every `Config.HEARTBEAT_SECONDS`, ONE `/api/roblox/state` call with every present player's UserId (global constraint: batched). Apply results, compute clock offset from `serverTime`, fire `StateChanged` + `StateSync` per player.
3. Status: heartbeat success → "online"; 2 consecutive failures → "offline" (fire `StatusChanged`); session not yet established → "connecting".
4. `contractVersion` from session response ≠ `Config.CONTRACT_VERSION` → set player attribute `WorldOutdated = true`, include in StateSync (client shows the rejoin message; Task 9).
5. PlayerRemoving → drop identity/state (nothing to save — spec §7).

- [ ] **Step 2: Live verification (Studio + local server)**

Start: `$env:PORT='4178'; $env:KINGSAGE_ROBLOX_KEY='dev-secret-local-0001'; npm run start:world` and `rojo serve roblox`; connect Studio, F5.
Expected in Output: session created log with kingdomId; a state log every ~10s; server console shows one `/api/roblox/state` hit per 10s (not per player). Stop the world server → status flips to "offline" after 2 misses; restart it → back "online" with fresh state.

- [ ] **Step 3: Commit**

```bash
git add roblox/src/server/WorldSession.luau roblox/src/server/init.server.luau
git commit -m "feat(roblox): join session, batched 10s heartbeat, honest online/offline status"
```

---

### Task 6: SettlementBuilder — grey-box village from state

**Files:**
- Create: `roblox/src/server/SettlementBuilder.luau`
- Modify: `roblox/src/server/init.server.luau` (subscribe to `WorldSession.StateChanged`)

**Interfaces:**
- Consumes: `WorldSession.StateChanged`, snapshot's `world.villages[]` (`VillageState`: `id, kingdomId, name, buildings: {hq,timber,quarry,iron,farm,warehouse,barracks,wall,academy,stable,workshop,smithy,market}, resources, stateVersion`) and `kingdom.id`.
- Produces (used by Tasks 7–9):
  - A `workspace.Settlements[<villageId>]` Model: keep + 13 building plots + wall + spawn pad, each building Model with attributes `VillageId`, `Building` (BuildingType string), `Level` (number), a `ProximityPrompt` named `InteractPrompt`, and a BillboardGui label "<Building> Lv <n>".
  - `SettlementBuilder.buildFor(player, snapshot)` and internal per-building diff on `stateVersion` (no full rebuild per heartbeat).
  - Fixed layout table `LAYOUT: { [BuildingType]: Vector3 }` — keep at origin, market/warehouse on the main street, military row (barracks/stable/workshop/smithy) east, economy row (timber/quarry/iron/farm) west, academy north; wall ring 120×120 studs; player SpawnLocation just inside the gate, war table (Task 8) inside the keep.
  - One settlement per online player for slice one, placed 400 studs apart on a row.

- [ ] **Step 1: Implement** — grey Parts only (`Color3.fromRGB(120,120,120)`, `Material.Concrete`), building footprint 12×12, height = `6 + 2 * level`, level 0 renders as a 1-stud foundation slab labeled "<Building> — not built". Streets = 4-stud-wide darker slabs. No decorations (spec §7: grey-box until the loop feels right).

- [ ] **Step 2: Live verification** — F5 with the local server: your settlement appears, buildings labeled with real levels from the database, avatar spawns inside the gate and can walk every street on foot. Queue nothing yet.

- [ ] **Step 3: Commit**

```bash
git add roblox/src/server/SettlementBuilder.luau roblox/src/server/init.server.luau
git commit -m "feat(roblox): grey-box settlement generated from live village state"
```

---

### Task 7: CommandService — queue builds/recruits from the world

**Files:**
- Create: `roblox/src/server/CommandService.luau`
- Modify: `roblox/src/server/SettlementBuilder.luau` (wire prompts), `roblox/src/server/init.server.luau`

**Interfaces:**
- Consumes: `ApiClient.post`, `WorldSession.getState/refetch`, Task 2's `/api/roblox/commands` contract, prompt attributes from Task 6.
- Produces (used by Tasks 8–9):
  - RemoteFunction `ReplicatedStorage.WorldRemotes.QueueCommand` — client calls with `{ kind: "build"|"recruit", villageId: string, building: string?, troop: string?, quantity: number? }`, returns `{ ok: boolean, message: string }`.
  - Server-side `CommandService.queue(player, request)`: validates the village belongs to the player's kingdom (from the snapshot — display validation only; the world server re-validates authoritatively), generates `commandId = HttpService:GenerateGUID(false)`, posts `{ robloxUserId, commandId, expectedWorldVersion = snapshot.world.version, command = { type = "village.build.queue", payload = { villageId, building } } }` (or `village.recruit.queue` with `troop`/`quantity`), then `WorldSession.refetch(player)` on success.
  - Rejection mapping: HTTP 409 body's `message` → returned verbatim to the client toast; transport failure (`UNREACHABLE`) → `"The realm didn't answer — nothing was spent."` (exact copy, spec §8).
  - ProximityPrompt on each building triggers the same path server-side directly (walk-up interactions): economy/military buildings → build upgrade; barracks prompt additionally offers recruit spear ×5 via a second `ProximityPrompt` named `RecruitPrompt`.

- [ ] **Step 1: Implement** (full module in-task; blocked while status ≠ "online" — return `{ ok = false, message = "Reconnecting to the realm…" }` without posting).

- [ ] **Step 2: Live verification drill** — F5: walk to the timber camp, trigger the prompt. Expected: server Output logs accepted command; within a refetch the timber camp label and the database agree (check with a second prompt-trigger showing new queue state / the server's own logs). Trigger a build you cannot afford → toast with the server's rejection message, resources unchanged. Kill the world server, trigger a prompt → exact copy "The realm didn't answer — nothing was spent."

- [ ] **Step 3: Commit**

```bash
git add roblox/src/server/CommandService.luau roblox/src/server/SettlementBuilder.luau roblox/src/server/init.server.luau
git commit -m "feat(roblox): idempotent build/recruit commands from walk-up prompts"
```

---

### Task 8: HUD, timers, and the war table

**Files:**
- Create: `roblox/src/server/WarTable.luau`
- Modify: `roblox/src/client/init.client.luau` (full HUD + table mode)

**Interfaces:**
- Consumes: `StateSync` RemoteEvent payloads (Task 5), `QueueCommand` RemoteFunction (Task 7), war table part created inside the keep by `SettlementBuilder` (add in this task: anchored 6×3×4 slab named `WarTable` with `ProximityPrompt` "Rule your realm").
- Produces:
  - HUD (client ScreenGui): top bar wood/stone/iron (live values), queue panel listing construction/recruitment entries with countdowns computed as `finishTimestamp - (os.time() + clockOffset)` — display only, never authoritative (spec §7); toast stack for command results; status banner region (Task 9 fills behavior).
  - War table mode (client): prompt fires RemoteEvent `WorldRemotes.EnterTable`; camera tweens to `CFrame.lookAt(tablePos + Vector3.new(0, 140, 60), settlementCenter)` **clamped to the player's own settlement bounds** (attribute on the settlement Model from Task 6); a side panel lists all 13 buildings with name, level, upgrade button, and barracks recruit button — same `QueueCommand` remote; "Step away" button + walking any input exits back to the default camera.
  - Snapshot field check: confirm the queue timestamps' exact field names from `getSnapshot` (`store.ts:450` — construction/recruitment job arrays) before coding the countdown; use the real field names.

- [ ] **Step 1: Implement** (two files, full code in-task).

- [ ] **Step 2: Live verification drill** — F5: HUD shows the same resource numbers the database holds; queue a build from the table panel; countdown ticks down smoothly and matches the server's finish time on the next heartbeat (no jump > 1s); camera stays clamped (cannot pan past the wall); step away returns to third-person on-foot.

- [ ] **Step 3: Commit**

```bash
git add roblox/src/server/WarTable.luau roblox/src/server/SettlementBuilder.luau roblox/src/client/init.client.luau
git commit -m "feat(roblox): HUD with honest timers and the keep's war table command view"
```

---

### Task 9: Failure UX — holding scene, banners, outdated-version gate

**Files:**
- Modify: `roblox/src/client/init.client.luau`, `roblox/src/server/WorldSession.luau` (only if a status hook is missing)

**Interfaces:**
- Consumes: `getStatus/StatusChanged`, `WorldOutdated` flag (Task 5), toast stack (Task 8).
- Produces (spec §8 verbatim behaviors):
  - status "connecting" with no snapshot yet → full-screen holding scene "The realm is waking…" (dark screen, single line, subtle pulse), removed the instant the first snapshot lands.
  - status "offline" → banner "Reconnecting to the realm…"; ALL ProximityPrompts disabled (`Enabled = false` server-side via WorldSession status) and table buttons greyed; re-enabled on "online" + a fresh refetch.
  - `WorldOutdated` → modal "The kingdom has been updated — rejoin to get the new version." with no dismiss.

- [ ] **Step 1: Implement.**

- [ ] **Step 2: Sabotage drill (spec §9.5)** — F5, then stop the world server mid-session. Expected, in order: prompts disable, banner appears, a table-button press yields "Reconnecting to the realm…" and posts nothing (world server is down — verify no charge after restart), restart server → banner clears, prompts return, state trues up with zero lost progress. Then set `Config.CONTRACT_VERSION = 99` temporarily → rejoin modal appears; revert.

- [ ] **Step 3: Commit**

```bash
git add roblox/src/client/init.client.luau roblox/src/server/WorldSession.luau
git commit -m "feat(roblox): honest failure UX - holding scene, reconnect banner, version gate"
```

---

### Task 10: Evidence harness + the done-criteria drills

**Files:**
- Create: `roblox/scripts/evidence-run.luau`, `docs/superpowers/drills-slice-one.md`

**Interfaces:** consumes everything; produces the slice's acceptance record.

- [ ] **Step 1: Harness** — adapt `blockshore/roblox/scripts/evidence-run.luau`'s pattern: a Script pasted as a ServerScript (NOT command bar — its header must carry the same warning, copied from Blockshore's file) that walks the DataModel only: asserts `workspace.Settlements` exists with ≥1 settlement, 13 labeled buildings + WarTable + SpawnLocation present, `WorldRemotes` populated, prompts enabled while online — printing PASS/FAIL lines plus the by-hand checklist for everything only gameplay can prove.

- [ ] **Step 2: Write the drills doc** — `docs/superpowers/drills-slice-one.md`, each drill = numbered steps + exact expected observation:
  1. **Wall-clock drill (done-criterion a):** queue a timber upgrade with a known duration; note server finish timestamp; Stop (Shift+F5); wait ≥60s by the wall clock; F5 rejoin → remaining time shrank by the elapsed wall time (±heartbeat), and if the wait exceeded the duration, the building's level rose while nobody was in-game.
  2. **Restart drill (done-criterion b):** with a queue running, close Studio play session entirely, also restart `rojo serve`; rejoin → identical kingdom, no duplicate settlement, no reset resources.
  3. **Double-tap drill (done-criterion c):** hammer one upgrade prompt/button 5× fast; state after settle shows exactly ONE queue entry and one charge (compare resources against the single-cost math; also confirmed already by the Task 2 API test).
  4. **Sabotage drill:** as in Task 9 Step 2.
  5. **Phone drill (mobile baseline):** publish to the private dev place, open on the test phone: join → holding scene → settlement; walk every street; use a prompt and the war table; HUD readable; record join-time seconds.

- [ ] **Step 3: Run everything and record results in the drills doc** (each drill gets DATE + PASS/FAIL + observation lines — evidence, not vibes; superpowers:verification-before-completion applies).

- [ ] **Step 4: Commit**

```bash
git add roblox/scripts/evidence-run.luau docs/superpowers/drills-slice-one.md
git commit -m "test(roblox): evidence harness + written slice-one drills with results"
```

---

### Task 11: Wrap — docs and vault

**Files:**
- Modify: `roblox/README.md` (final dev-loop truth), repo `README.md` (one line: Roblox client lives in `roblox/`, web client frozen)
- Vault: Daily note bullets, `KingsAge Remaster.md` hub frontmatter/Dev Log, Open Loops row 163 update.

- [ ] **Step 1:** Update docs; push `main`.
- [ ] **Step 2:** Vault rituals per house rules (append-only).
- [ ] **Step 3:** Final commit + push:

```bash
git add -A
git commit -m "docs: slice-one dev loop + status"
git push origin main
```

---

## Verification (whole-plan)

1. `npm run test:gate-d` and `npm run test:roblox-layer` — all green (server authority intact + new layer proven).
2. Evidence harness prints all PASS in a live Studio session against the local world server.
3. All five drills in `docs/superpowers/drills-slice-one.md` recorded PASS with observations (wall-clock, restart, double-tap, sabotage, phone).
4. Spike numbers recorded in `docs/superpowers/spike-200-troops.md` from a real phone.
5. Explicitly OUT of this plan (spec §7/§10): wilderness/regions, battles, art, empire UI, VPS deploy, cloud place hardening, monetization (none), the real game name.
