--!strict
-- Owns every player's link to the world server: session on join, ONE batched
-- state heartbeat for the whole Roblox server (HTTP budget rule; chunked past
-- 50 ids), honest online/offline status, and display-only clock offset
-- anchored to Roblox's synced server clock. Holds NO authority.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local shared = ReplicatedStorage:WaitForChild("WorldShared")
local Config = require(shared:WaitForChild("Config"))
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
	identities[player] = nil
	snapshots[player] = nil
	sessionErrors[player] = nil
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
		for start = 1, #ids, STATE_CHUNK do
			local chunk = table.move(ids, start, math.min(start + STATE_CHUNK - 1, #ids), 1, {})
			local ok, body = ApiClient.post("/api/roblox/state", { robloxUserIds = chunk })
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
