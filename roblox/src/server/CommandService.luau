--!strict
-- Turns player intent (walk-up prompts, war-table buttons) into idempotent
-- world-server commands. Never charges locally, never pretends: the world
-- only changes after the server confirms (spec §2, §8).
--
-- Double-tap protection is layered (spec §7 done-criterion c):
--   1. per-player in-flight lock — a second request while one is running is
--      refused, never queued;
--   2. same-intent window — an identical request within REPEAT_SECONDS of a
--      completed one returns the first result instead of re-charging;
--   3. commandId reuse inside ApiClient covers transport retries;
--   4. the version-conflict retry below NEVER fires for same-player repeats
--      (layers 1-2 catch those first) — it exists for cross-player version
--      bumps under the 10s heartbeat.
local HttpService = game:GetService("HttpService")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local shared = ReplicatedStorage:WaitForChild("WorldShared")
local Buildings = require(shared:WaitForChild("Buildings"))
local ApiClient = require(script.Parent:WaitForChild("ApiClient"))
local WorldSession = require(script.Parent:WaitForChild("WorldSession"))

local remotes = ReplicatedStorage:WaitForChild("WorldRemotes")
local queueCommandRemote = remotes:WaitForChild("QueueCommand") :: RemoteFunction
local toastRemote = remotes:WaitForChild("Toast") :: RemoteEvent

local COPY_UNREACHABLE = "The realm didn't answer — nothing was spent."
local COPY_RECONNECTING = "Reconnecting to the realm…"
local COPY_OUTDATED = "The kingdom has been updated — rejoin to get the new version."
local COPY_KEPT_CHANGING = "The world kept changing — try again."
local REPEAT_SECONDS = 2

local CommandService = {}

type QueueRequest = { kind: string, villageId: string, building: string?, troop: string?, quantity: number? }
type QueueResult = { ok: boolean, message: string }

local inFlight: { [Player]: boolean } = {}
local lastCompleted: { [Player]: { fingerprint: string, at: number, result: QueueResult } } = {}

local function ownsVillage(snapshot: any, kingdomId: string, villageId: string): boolean
	local villages = snapshot and snapshot.world and snapshot.world.villages
	if typeof(villages) ~= "table" then
		return false
	end
	for _, village in villages do
		if village.id == villageId and village.kingdomId == kingdomId then
			return true
		end
	end
	return false
end

local function buildCommand(request: QueueRequest): ({ [string]: any }?, string?)
	if request.kind == "build" and typeof(request.building) == "string" then
		return { type = "village.build.queue", payload = { villageId = request.villageId, building = request.building } },
			"build:" .. request.villageId .. ":" .. request.building
	end
	if request.kind == "recruit" and typeof(request.troop) == "string" then
		local quantity = math.clamp(math.trunc(tonumber(request.quantity) or 0), 1, 500)
		return { type = "village.recruit.queue", payload = { villageId = request.villageId, troop = request.troop, quantity = quantity } },
			"recruit:" .. request.villageId .. ":" .. request.troop .. ":" .. quantity
	end
	return nil, nil
end

local function postOnce(robloxUserId: number, expectedWorldVersion: number, command: { [string]: any }): (boolean, any)
	local answered, _status, body = ApiClient.postFull("/api/roblox/commands", {
		robloxUserId = robloxUserId,
		commandId = HttpService:GenerateGUID(false),
		expectedWorldVersion = expectedWorldVersion,
		command = command,
	})
	return answered, body
end

local function runQueue(player: Player, request: QueueRequest): QueueResult
	if WorldSession.getStatus() ~= "online" then
		return { ok = false, message = COPY_RECONNECTING }
	end
	local identity = WorldSession.getIdentity(player)
	local snapshot = WorldSession.getState(player)
	if not identity or not snapshot then
		return { ok = false, message = COPY_RECONNECTING }
	end
	if identity.outdated then
		return { ok = false, message = COPY_OUTDATED }
	end
	if typeof(request) ~= "table" or typeof(request.villageId) ~= "string" then
		return { ok = false, message = "That order made no sense." }
	end
	if not ownsVillage(snapshot, identity.kingdomId, request.villageId) then
		return { ok = false, message = "That is not your village." }
	end
	local command, fingerprint = buildCommand(request)
	if not command or not fingerprint then
		return { ok = false, message = "That order made no sense." }
	end

	-- Layer 2: identical intent within the repeat window replays the first
	-- outcome instead of charging again.
	local recent = lastCompleted[player]
	if recent and recent.fingerprint == fingerprint and (os.clock() - recent.at) < REPEAT_SECONDS then
		return recent.result
	end

	local result: QueueResult
	for attempt = 1, 2 do
		local answered, body = postOnce(identity.robloxUserId, snapshot.world.version, command)
		if not answered then
			result = { ok = false, message = COPY_UNREACHABLE }
			break
		end
		if typeof(body) == "table" and body.type == "command.accepted" then
			WorldSession.refetch(player)
			result = { ok = true, message = "By your order." }
			break
		end
		if typeof(body) == "table" and body.type == "command.rejected" then
			local code = tostring(body.payload and body.payload.code or "?")
			if code == "WORLD_VERSION_CONFLICT" and attempt == 1 then
				-- Our snapshot went stale under the heartbeat (someone else
				-- acted). Refresh and try once more; same-player double-taps
				-- never reach here (layers 1-2).
				WorldSession.refetch(player)
				snapshot = WorldSession.getState(player) or snapshot
			elseif code == "WORLD_VERSION_CONFLICT" then
				result = { ok = false, message = COPY_KEPT_CHANGING }
				break
			else
				result = { ok = false, message = tostring(body.payload and body.payload.message or "The realm refused that order.") }
				break
			end
		else
			-- Auth/config errors (BAD_KEY, ROBLOX_DISABLED, ...) must never
			-- leak "why" to players (spec §8): present as unreachable.
			result = { ok = false, message = COPY_UNREACHABLE }
			break
		end
	end
	result = result or { ok = false, message = COPY_KEPT_CHANGING }
	lastCompleted[player] = { fingerprint = fingerprint, at = os.clock(), result = result }
	return result
end

function CommandService.queue(player: Player, request: QueueRequest): QueueResult
	-- Layer 1: one command in flight per player, others refuse instantly.
	if inFlight[player] then
		return { ok = false, message = "Still carrying out your last order." }
	end
	inFlight[player] = true
	local ok, result = pcall(runQueue, player, request)
	inFlight[player] = nil
	if ok then
		return result
	end
	warn("[World] queue error: " .. tostring(result))
	return { ok = false, message = COPY_UNREACHABLE }
end

-- War-table buttons (client-initiated)
queueCommandRemote.OnServerInvoke = function(player: Player, request: any)
	return CommandService.queue(player, request :: QueueRequest)
end

-- Walk-up prompts (server-observed). ProximityPromptService sees every
-- prompt, including ones rebuilt after each state change.
ProximityPromptService.PromptTriggered:Connect(function(prompt: ProximityPrompt, player: Player)
	local structure = prompt.Parent
	local model = structure and (structure :: Instance).Parent
	if not model or not (model :: Instance):IsA("Model") then
		return
	end
	local villageId = (model :: Model):GetAttribute("VillageId")
	local building = (model :: Model):GetAttribute("Building")
	if typeof(villageId) ~= "string" or typeof(building) ~= "string" then
		return
	end
	local result: QueueResult
	if prompt.Name == "InteractPrompt" then
		result = CommandService.queue(player, { kind = "build", villageId = villageId, building = building })
	elseif prompt.Name == "RecruitPrompt" then
		result = CommandService.queue(player, {
			kind = "recruit",
			villageId = villageId,
			troop = Buildings.RECRUIT_PRESET.troop,
			quantity = Buildings.RECRUIT_PRESET.quantity,
		})
	else
		return
	end
	toastRemote:FireClient(player, result)
end)

return CommandService
