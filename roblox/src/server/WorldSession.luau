--!strict
-- Owns every player's link to the world server: session on join, ONE batched
-- state heartbeat for the whole Roblox server (HTTP budget rule; chunked past
-- 50 ids), honest online/offline status, and display-only clock offset
-- anchored to Roblox's synced server clock. Holds NO authority.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local shared = ReplicatedStorage:WaitForChild("WorldShared")
local Config = require(shared:WaitForChild("Config"))
local BattleConfig = require(shared:WaitForChild("BattleConfig"))
local TimeUtil = require(shared:WaitForChild("TimeUtil"))
local ApiClient = require(script.Parent:WaitForChild("ApiClient"))

local STATE_CHUNK = 50

local WorldSession = {}

-- Remotes: created here, found by everyone else.
local remotes = Instance.new("Folder")
remotes.Name = "WorldRemotes"
local stateSync = Instance.new("RemoteEvent")
stateSync.Name = "StateSync"
stateSync.Parent = remotes
local enterTable = Instance.new("RemoteEvent")
enterTable.Name = "EnterTable"
enterTable.Parent = remotes
local queueCommand = Instance.new("RemoteFunction")
queueCommand.Name = "QueueCommand"
queueCommand.Parent = remotes
local toast = Instance.new("RemoteEvent")
toast.Name = "Toast"
toast.Parent = remotes
remotes.Parent = ReplicatedStorage

WorldSession.StateChanged = Instance.new("BindableEvent") -- (player, snapshot)
WorldSession.StatusChanged = Instance.new("BindableEvent") -- (status)

type Identity = { robloxUserId: number, playerId: string, kingdomId: string, outdated: boolean }

local identities: { [Player]: Identity } = {}
local snapshots: { [Player]: any } = {}
local sessionErrors: { [Player]: string } = {}
-- serverEpochSeconds - workspace:GetServerTimeNow(); display use only.
-- Anchored to Roblox's synced clock (NOT os.time) so clients with a wrong
-- device clock still render correct countdowns.
local clockOffset = 0
local status: string = "connecting"
local consecutiveHeartbeatFailures = 0

local function setStatus(next: string)
	if status ~= next then
		status = next
		WorldSession.StatusChanged:Fire(next)
	end
end

function WorldSession.getStatus(): string
	return status
end

-- ---- rally tracking (slice 2) ----
-- One active rally per player. The REGISTRATION lives here because this is
-- where the heartbeat runs; the ORDER it steers was issued through the
-- normal command path and counts against the cap like any other. The
-- position source is the player's replicated character - the server reads
-- it itself, so there is no extra client channel to spoof (the world
-- server's walk clamp still judges every step).
type Rally = { battleId: string, sequence: number, squad: string }
local rallies: { [Player]: Rally } = {}

function WorldSession.registerRally(player: Player, battleId: string, sequence: number, squad: string)
	rallies[player] = { battleId = battleId, sequence = sequence, squad = squad }
end

-- The already-registered sequence for this battle+squad, or nil. Lets a
-- rejoining commander resume steering the SAME order instead of spending
-- another one from the cap.
function WorldSession.rallyFor(player: Player, battleId: string, squad: string): number?
	local entry = rallies[player]
	if entry and entry.battleId == battleId and entry.squad == squad then
		return entry.sequence
	end
	return nil
end

-- Where the commander stands on a battle's field, in order space - or nil
-- when they are not standing anywhere that battle can see (no character,
-- battle unknown/closed, defender village missing). Field geometry matches
-- BattleScene.start exactly; the mapping is the shared BattleConfig one.
function WorldSession.fieldPointFor(player: Player, battleId: string): (number?, number?)
	local snapshot = snapshots[player]
	if not snapshot then
		return nil, nil
	end
	local battle = nil
	for _, candidate in ((snapshot.battleSessions :: any) or {}) do
		if tostring(candidate.id) == battleId then
			battle = candidate
			break
		end
	end
	if not battle or tostring(battle.status) ~= "open" then
		return nil, nil
	end
	local village = nil
	for _, candidate in ((snapshot.world and snapshot.world.villages :: any) or {}) do
		if tostring(candidate.id) == tostring(battle.defenderVillageId) then
			village = candidate
			break
		end
	end
	if not village then
		return nil, nil
	end
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root or not root:IsA("BasePart") then
		return nil, nil
	end
	local centerX = (tonumber(village.x) or 0) * Config.TILE_STUDS
	local centerZ = (tonumber(village.y) or 0) * Config.TILE_STUDS + Config.WALL_HALF + BattleConfig.FIELD_DEPTH / 2 + 12
	return BattleConfig.toOrderSpace(root.Position.X, root.Position.Z, centerX, centerZ)
end

-- The rallies payload for one heartbeat, and the moment every finished
-- rally is let go: a battle that is no longer open ends its rally, a
-- missing character (left field, died, disconnecting) just freezes it -
-- the last accepted position stands on the world server untouched.
local function collectRallies(): { { [string]: any } }
	local payload = {}
	for player, entry in rallies do
		local identity = identities[player]
		if not identity then
			rallies[player] = nil
			continue
		end
		local snapshot = snapshots[player]
		local battleStillOpen = false
		if snapshot then
			for _, candidate in ((snapshot.battleSessions :: any) or {}) do
				if tostring(candidate.id) == entry.battleId and tostring(candidate.status) == "open" then
					battleStillOpen = true
					break
				end
			end
		end
		if not battleStillOpen then
			rallies[player] = nil
			continue
		end
		local x, y = WorldSession.fieldPointFor(player, entry.battleId)
		if x and y then
			table.insert(payload, {
				robloxUserId = identity.robloxUserId,
				battleId = entry.battleId,
				sequence = entry.sequence,
				x = x,
				y = y,
			})
		end
	end
	return payload
end

function WorldSession.getState(player: Player): any
	return snapshots[player]
end

function WorldSession.getIdentity(player: Player): Identity?
	return identities[player]
end

function WorldSession.getServerClockOffset(): number
	return clockOffset
end

local function pushToClient(player: Player)
	local identity = identities[player]
	stateSync:FireClient(player, {
		snapshot = snapshots[player],
		status = status,
		clockOffset = clockOffset,
		outdated = identity and identity.outdated or false,
		sessionError = sessionErrors[player],
	})
end

local function applyStates(body: any): number
	local applied = 0
	local serverEpoch = TimeUtil.isoToEpoch(tostring(body.serverTime or ""))
	if serverEpoch then
		clockOffset = serverEpoch - workspace:GetServerTimeNow()
	end
	for player, identity in identities do
		local snapshot = body.states and body.states[tostring(identity.robloxUserId)]
		if snapshot then
			applied += 1
			snapshots[player] = snapshot
			WorldSession.StateChanged:Fire(player, snapshot)
			pushToClient(player)
		end
	end
	return applied
end

-- Immediate one-player pull; used right after a session opens and after any
-- accepted command. Returns true when fresh state was applied.
function WorldSession.refetch(player: Player): boolean
	local identity = identities[player]
	if not identity then
		return false
	end
	local ok, body = ApiClient.post("/api/roblox/state", { robloxUserIds = { identity.robloxUserId } })
	if ok then
		consecutiveHeartbeatFailures = 0
		setStatus("online")
		return applyStates(body) > 0
	end
	return false
end

local function httpStatusOf(reason: any): number?
	if typeof(reason) == "string" then
		local digits = string.match(reason, "^HTTP_(%d+)")
		return digits and tonumber(digits) or nil
	end
	return nil
end

local function openSession(player: Player)
	local attempt = 0
	while player.Parent == Players do
		local ok, body = ApiClient.post("/api/roblox/session", {
			robloxUserId = player.UserId,
			displayName = player.DisplayName,
		})
		if ok then
			local outdated = tonumber(body.contractVersion) ~= Config.CONTRACT_VERSION
			identities[player] = {
				robloxUserId = player.UserId,
				playerId = tostring(body.playerId),
				kingdomId = tostring(body.kingdomId),
				outdated = outdated,
			}
			if outdated then
				player:SetAttribute("WorldOutdated", true)
			end
			print(string.format("[World] session open for %s (kingdom %s, created=%s)",
				player.Name, tostring(body.kingdomId), tostring(body.created)))
			if not WorldSession.refetch(player) then
				pushToClient(player) -- keeps the holding scene honest until state lands
			end
			return
		end

		-- A 4xx is the server's FINAL answer (e.g. WORLD_FULL): honor it, do
		-- not hammer the API pretending we're still connecting.
		local httpStatus = httpStatusOf(body)
		if httpStatus and httpStatus >= 400 and httpStatus < 500 then
			sessionErrors[player] = if string.find(tostring(body), "WORLD_FULL", 1, true)
				then "This world has no open thrones right now."
				else "The realm turned us away. Try again later."
			warn(string.format("[World] session refused for %s (%s) — not retrying", player.Name, tostring(body)))
			pushToClient(player)
			return
		end

		attempt += 1
		local delays = Config.SESSION_RETRY_SECONDS
		local wait = delays[math.min(attempt, #delays)]
		warn(string.format("[World] session failed for %s (%s), retry in %ds", player.Name, tostring(body), wait))
		pushToClient(player)
		task.wait(wait)
	end
end

Players.PlayerAdded:Connect(function(player)
	task.spawn(openSession, player)
end)
-- Players who joined before this script connected (play-solo, script reload)
-- would otherwise never get a session.
for _, player in Players:GetPlayers() do
	task.spawn(openSession, player)
end

Players.PlayerRemoving:Connect(function(player)
	-- Nothing to save, by design (spec §7): the world server holds everything.
	-- The rally registration dies with the presence; the ORDER stands on the
	-- world server at its last accepted position (disconnect = freeze).
	identities[player] = nil
	snapshots[player] = nil
	sessionErrors[player] = nil
	rallies[player] = nil
end)

-- The ONE heartbeat for the whole server (chunked only past 50 players).
task.spawn(function()
	while true do
		task.wait(Config.HEARTBEAT_SECONDS)
		local ids = {}
		for _, identity in identities do
			table.insert(ids, identity.robloxUserId)
		end
		if #ids == 0 then
			continue
		end
		local failed = false
		-- Rally positions ride THIS pull (red team #6: zero new request
		-- budget). Sent with the first chunk only - the world server routes
		-- each entry by its own battleId, not by which chunk carried it.
		local rallyPayload = collectRallies()
		for start = 1, #ids, STATE_CHUNK do
			local chunk = table.move(ids, start, math.min(start + STATE_CHUNK - 1, #ids), 1, {})
			local body_payload: { [string]: any } = { robloxUserIds = chunk }
			if start == 1 and #rallyPayload > 0 then
				body_payload.rallies = rallyPayload
			end
			local ok, body = ApiClient.post("/api/roblox/state", body_payload)
			if ok then
				applyStates(body)
			else
				failed = true
				warn(string.format("[World] heartbeat chunk failed (%s)", tostring(body)))
				break
			end
		end
		if failed then
			consecutiveHeartbeatFailures += 1
			if consecutiveHeartbeatFailures >= 2 then
				setStatus("offline")
				for player in identities do
					pushToClient(player)
				end
			end
		else
			consecutiveHeartbeatFailures = 0
			setStatus("online")
		end
	end
end)

return WorldSession
