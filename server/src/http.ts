import { timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { scheduleAiKingdomTick } from "./ai.ts";
import { SharedWorldStore, StoreError, type SessionPlayer } from "./store.ts";
import { GAME_CONTRACT_VERSION, makeCommandEnvelope, type CommandEnvelope, type GameCommand } from "../../packages/game-core/src/contracts.ts";

type ServerOptions = {
  store: SharedWorldStore;
  staticRoot?: string;
  materializeIntervalMs?: number;
  robloxKey?: string;
};

type JsonObject = Record<string, unknown>;

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(header.split(";").map((part) => {
    const separator = part.indexOf("=");
    const key = separator >= 0 ? part.slice(0, separator).trim() : part.trim();
    const value = separator >= 0 ? part.slice(separator + 1).trim() : "";
    return [key, decodeURIComponent(value)];
  }));
}

async function readJson(request: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1_000_000) throw new StoreError("BODY_TOO_LARGE", "Request body exceeds 1 MB.", 413);
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("object required");
    return value as JsonObject;
  } catch {
    throw new StoreError("INVALID_JSON", "Request body must be a JSON object.", 400);
  }
}

function setCommonHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Cache-Control", "no-store");
}

function json(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  setCommonHeaders(response);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
}

function sessionCookie(token: string): string {
  return `kingsage_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`;
}

function clearSessionCookie(): string {
  return "kingsage_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

function requireRobloxKey(request: IncomingMessage, robloxKey: string | undefined): void {
  if (!robloxKey) throw new StoreError("ROBLOX_DISABLED", "Roblox API is not configured.", 503);
  const presented = Buffer.from(String(request.headers["x-kingsage-key"] ?? ""));
  const expected = Buffer.from(robloxKey);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    throw new StoreError("BAD_KEY", "Invalid key.", 401);
  }
}

function authenticate(request: IncomingMessage, store: SharedWorldStore): SessionPlayer {
  const token = parseCookies(request.headers.cookie).kingsage_session;
  const player = store.authenticate(token);
  if (!player) throw new StoreError("UNAUTHENTICATED", "Sign in to enter the shared world.", 401);
  return player;
}

function serveStatic(response: ServerResponse, staticRoot: string, pathname: string): boolean {
  const root = resolve(staticRoot);
  const requested = pathname === "/" ? "index.html" : normalize(pathname).replace(/^[/\\]+/, "");
  let target = resolve(join(root, requested));
  if (!target.startsWith(root)) return false;
  if (!existsSync(target) || !statSync(target).isFile()) target = join(root, "index.html");
  if (!existsSync(target) || !statSync(target).isFile()) return false;
  setCommonHeaders(response);
  response.setHeader("Cache-Control", extname(target) === ".html" ? "no-store" : "public, max-age=31536000, immutable");
  response.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(target)] ?? "application/octet-stream" });
  createReadStream(target).pipe(response);
  return true;
}

export function createWorldHttpServer(options: ServerOptions): {
  server: Server;
  close: () => Promise<void>;
  aiTickScheduled: boolean;
} {
  const { store, staticRoot } = options;
  const materializeTimer = setInterval(() => store.materializeDueJobs(), options.materializeIntervalMs ?? 500);
  materializeTimer.unref();
  const aiTickTimer = scheduleAiKingdomTick(store);

  const server = createServer(async (request, response) => {
    try {
      const origin = `http://${request.headers.host ?? "127.0.0.1"}`;
      const url = new URL(request.url ?? "/", origin);
      const path = url.pathname;

      // Structural gate: EVERY current and future /api/roblox route is
      // key-authenticated here, so a new route cannot forget the check.
      if (path.startsWith("/api/roblox/")) {
        requireRobloxKey(request, options.robloxKey);
      }

      if (request.method === "GET" && path === "/api/health") {
        json(response, 200, { ok: true, service: "kingsage-world", contractVersion: 1 });
        return;
      }

      if (request.method === "POST" && path === "/api/auth/register") {
        const body = await readJson(request);
        const result = store.register({
          username: String(body.username ?? ""),
          password: String(body.password ?? ""),
          kingdomName: String(body.kingdomName ?? ""),
        });
        json(response, 201, { player: result.player }, { "Set-Cookie": sessionCookie(result.token) });
        return;
      }

      if (request.method === "POST" && path === "/api/auth/login") {
        const body = await readJson(request);
        const result = store.login({
          username: String(body.username ?? ""),
          password: String(body.password ?? ""),
        });
        json(response, 200, { player: result.player }, { "Set-Cookie": sessionCookie(result.token) });
        return;
      }

      if (request.method === "POST" && path === "/api/auth/logout") {
        const token = parseCookies(request.headers.cookie).kingsage_session;
        if (token) store.logout(token);
        json(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
        return;
      }

      if (request.method === "GET" && path === "/api/session") {
        const player = authenticate(request, store);
        json(response, 200, { player });
        return;
      }

      if (request.method === "GET" && path === "/api/world/snapshot") {
        const player = authenticate(request, store);
        json(response, 200, store.getSnapshot(player));
        return;
      }

      if (request.method === "GET" && path === "/api/world/events") {
        const player = authenticate(request, store);
        const snapshot = store.getSnapshot(player);
        const since = Math.max(0, Number(url.searchParams.get("since") ?? 0) || 0);
        json(response, 200, { events: store.readEvents(snapshot.world.id, since), currentWorldVersion: snapshot.world.version });
        return;
      }

      if (request.method === "GET" && path === "/api/world/stream") {
        const player = authenticate(request, store);
        const snapshot = store.getSnapshot(player);
        const since = Math.max(0, Number(url.searchParams.get("since") ?? 0) || 0);
        setCommonHeaders(response);
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        const send = (event: unknown) => response.write(`data: ${JSON.stringify(event)}\n\n`);
        for (const event of store.readEvents(snapshot.world.id, since)) send(event);
        response.write(`event: ready\ndata: ${JSON.stringify({ worldVersion: snapshot.world.version })}\n\n`);
        const unsubscribe = store.subscribe((event) => {
          if (event.worldId === snapshot.world.id) send(event);
        });
        const keepAlive = setInterval(() => response.write(": keep-alive\n\n"), 15_000);
        request.on("close", () => {
          clearInterval(keepAlive);
          unsubscribe();
        });
        return;
      }

      if (request.method === "POST" && path === "/api/world/commands") {
        const player = authenticate(request, store);
        const envelope = await readJson(request) as unknown as CommandEnvelope;
        const result = store.applyCommand(player, envelope);
        json(response, result.type === "command.accepted" ? 200 : 409, result);
        return;
      }

      if (request.method === "POST" && path === "/api/roblox/session") {
        const body = await readJson(request);
        const linked = store.linkRobloxPlayer({
          robloxUserId: Number(body.robloxUserId),
          displayName: String(body.displayName ?? ""),
        });
        json(response, 200, {
          playerId: linked.player.id,
          kingdomId: linked.player.kingdomId,
          created: linked.created,
          contractVersion: GAME_CONTRACT_VERSION,
        });
        return;
      }

      if (request.method === "POST" && path === "/api/roblox/state") {
        const body = await readJson(request);
        const ids = Array.isArray(body.robloxUserIds) ? (body.robloxUserIds as unknown[]).slice(0, 200) : [];
        store.materializeDueJobs();
        // Rally positions ride the SAME pull (red team #6: zero new request
        // budget). Each entry is a claim; the store walk-clamps it and a
        // stale or bogus one is ignored, never an error - one bad rally must
        // not poison the whole heartbeat.
        if (Array.isArray(body.rallies)) {
          for (const entry of (body.rallies as unknown[]).slice(0, 200)) {
            try {
              store.applyRallyUpdate(entry);
            } catch (error) {
              console.error("roblox/state: rally update failed", error);
            }
          }
        }
        const states: Record<string, unknown> = {};
        for (const raw of ids) {
          const robloxUserId = Math.trunc(Number(raw));
          if (!Number.isFinite(robloxUserId) || robloxUserId <= 0) continue;
          const linked = store.peekRobloxPlayer(robloxUserId);
          if (!linked) continue;
          try {
            states[String(robloxUserId)] = store.getSnapshot(linked, { skipMaterialize: true });
          } catch (error) {
            // One broken player (e.g. eliminated kingdom) must not poison the
            // whole server's heartbeat; omit them and let the rest sync.
            console.error(`roblox/state: snapshot failed for ${robloxUserId}`, error);
          }
        }
        json(response, 200, { serverTime: new Date().toISOString(), states });
        return;
      }

      if (request.method === "POST" && path === "/api/roblox/commands") {
        const body = await readJson(request);
        const linked = store.peekRobloxPlayer(Number(body.robloxUserId));
        if (!linked) throw new StoreError("UNKNOWN_ROBLOX_USER", "Call /api/roblox/session first.", 404);
        const envelope = makeCommandEnvelope({
          commandId: String(body.commandId ?? ""),
          worldId: store.worldIdForKingdom(linked.kingdomId),
          actorPlayerId: linked.id,
          expectedWorldVersion: Number(body.expectedWorldVersion ?? -1),
          issuedAt: new Date().toISOString(),
          command: body.command as GameCommand,
        });
        const result = store.applyCommand(linked, envelope);
        json(response, result.type === "command.accepted" ? 200 : 409, result);
        return;
      }

      if (request.method === "GET" && staticRoot && serveStatic(response, staticRoot, path)) return;
      json(response, 404, { error: { code: "NOT_FOUND", message: "Route not found." } });
    } catch (error) {
      if (error instanceof StoreError) {
        json(response, error.status, { error: { code: error.code, message: error.message } });
        return;
      }
      console.error(error);
      json(response, 500, { error: { code: "INTERNAL_ERROR", message: "The world service could not complete that request." } });
    }
  });

  return {
    server,
    close: () => new Promise((resolveClose, rejectClose) => {
      clearInterval(materializeTimer);
      if (aiTickTimer) clearInterval(aiTickTimer);
      server.close((error) => error ? rejectClose(error) : resolveClose());
      server.closeAllConnections();
    }),
    aiTickScheduled: aiTickTimer !== undefined,
  };
}
