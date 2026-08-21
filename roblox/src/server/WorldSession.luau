--!strict
-- Owns every player's link to the world server: session on join, ONE batched
-- state heartbeat for the whole Roblox server (HTTP budget rule), honest
-- online/offline status, and display-only clock offset. Holds NO authority.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("WorldShared"):WaitForChild("Config"))
local ApiClient = require(script.Parent:WaitForChild("ApiClient"))

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
local clockOffset = 0 -- serverEpochSeconds - os.time(), display use only
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

local function isoToEpoch(iso: string): number?
	local ok, dateTime = pcall(DateTime.fromIsoDate, iso)
	if ok and dateTime then
		return dateTime.UnixTimestamp
	end
	return nil
end

local function pushToClient(player: Player)
	local identity = identities[player]
	stateSync:FireClient(player, {
		snapshot = snapshots[player],
		status = status,
		clockOffset = clockOffset,
		outdated = identity and identity.outdated or false,
	})
end

local function applyStates(body: any)
	local serverEpoch = isoToEpoch(tostring(body.serverTime or ""))
	if serverEpoch then
		clockOffset = serverEpoch - os.time()
	end
	for player, identity in identities do
		local snapshot = body.states and body.states[tostring(identity.robloxUserId)]
		if snapshot then
			snapshots[player] = snapshot
			WorldSession.StateChanged:Fire(player, snapshot)
			pushToClient(player)
		end
	end
end

-- Immediate one-player pull; used right after a session opens and after any
-- accepted command so the world trues up without waiting for the heartbeat.
function WorldSession.refetch(player: Player)
	local identity = identities[player]
	if not identity then
		return
	end
	local ok, body = ApiClient.post("/api/roblox/state", { robloxUserIds = { identity.robloxUserId } })
	if ok then
		consecutiveHeartbeatFailures = 0
		setStatus("online")
		applyStates(body)
	end
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
			WorldSession.refetch(player)
			pushToClient(player)
			return
		end
		attempt += 1
		local delays = Config.SESSION_RETRY_SECONDS
		local wait = delays[math.min(attempt, #delays)]
		warn(string.format("[World] session failed for %s (%s), retry in %ds", player.Name, tostring(body), wait))
		pushToClient(player) -- keeps the holding scene honest ("connecting")
		task.wait(wait)
	end
end

Players.PlayerAdded:Connect(function(player)
	task.spawn(openSession, player)
end)

Players.PlayerRemoving:Connect(function(player)
	-- Nothing to save, by design (spec §7): the world server holds everything.
	identities[player] = nil
	snapshots[player] = nil
end)

-- The ONE heartbeat for the whole server.
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
		local ok, body = ApiClient.post("/api/roblox/state", { robloxUserIds = ids })
		if ok then
			consecutiveHeartbeatFailures = 0
			setStatus("online")
			applyStates(body)
		else
			consecutiveHeartbeatFailures += 1
			warn(string.format("[World] heartbeat failed (%s) x%d", tostring(body), consecutiveHeartbeatFailures))
			if consecutiveHeartbeatFailures >= 2 then
				setStatus("offline")
				for player in identities do
					pushToClient(player)
				end
			end
		end
	end
end)

return WorldSession
