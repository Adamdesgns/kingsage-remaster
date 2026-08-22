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

type QueueRequest = {
	kind: string,
	villageId: string,
	building: string?,
	troop: string?,
	quantity: number?,
	targetVillageId: string?,
}
type QueueResult = { ok: boolean, message: string }

local inFlight: { [Player]: boolean } = {}
local lastCompleted: { [Player]: { fingerprint: string, at: number, result: QueueResult } } = {}

local function findVillage(snapshot: any, villageId: string): any
	local villages = snapshot and snapshot.world and snapshot.world.villages
	if typeof(villages) ~= "table" then
		return nil
	end
	for _, village in villages do
		if village.id == villageId then
			return village
		end
	end
	return nil
end

local function ownsVillage(snapshot: any, kingdomId: string, villageId: string): boolean
	local village = findVillage(snapshot, villageId)
	return village ~= nil and village.kingdomId == kingdomId
end

local function isKnownTroop(troop: string?): boolean
	return typeof(troop) == "string" and Buildings.TROOP_NAMES[troop] ~= nil
end

-- Returns (command, fingerprint, refusal). A refusal is a LOCAL, honest "no"
-- that saves a round trip; anything the client cannot know for certain is left
-- to the world server, whose message is what the player then reads.
local function buildCommand(request: QueueRequest, snapshot: any, kingdomId: string): ({ [string]: any }?, string?, string?)
	if request.kind == "build" and typeof(request.building) == "string" then
		return { type = "village.build.queue", payload = { villageId = request.villageId, building = request.building } },
			"build:" .. request.villageId .. ":" .. request.building,
			nil
	end

	if request.kind == "recruit" then
		if not isKnownTroop(request.troop) then
			return nil, nil, "No such troop."
		end
		local troop = request.troop :: string
		local quantity = math.clamp(math.floor(tonumber(request.quantity) or 0), 1, 500)
		return { type = "village.recruit.queue", payload = { villageId = request.villageId, troop = troop, quantity = quantity } },
			"recruit:" .. request.villageId .. ":" .. troop .. ":" .. quantity,
			nil
	end

	if request.kind == "scout" then
		if typeof(request.targetVillageId) ~= "string" then
			return nil, nil, "Pick a village to scout."
		end
		local targetId = request.targetVillageId :: string
		local target = findVillage(snapshot, targetId)
		if not target then
			return nil, nil, "That village is not on the map."
		end
		if target.kingdomId == kingdomId then
			return nil, nil, "That is your own village."
		end
		local from = findVillage(snapshot, request.villageId)
		local quantity = math.clamp(math.floor(tonumber(request.quantity) or Buildings.SCOUT_PARTY), 1, 50)
		local onHand = math.floor(tonumber(from and from.army and from.army.scout) or 0)
		if onHand < quantity then
			return nil, nil, if onHand == 0
				then "No scouts in this village — recruit some first."
				else string.format("Only %d scout%s here.", onHand, if onHand == 1 then "" else "s")
		end
		-- A scout march may carry scouts ONLY (world-server rule); send exactly
		-- that shape and nothing else, so it can never be refused for form.
		local army: { [string]: number } = {}
		for _, troop in Buildings.TROOP_ORDER do
			army[troop] = 0
		end
		army.scout = quantity
		return {
			type = "march.launch",
			payload = {
				fromVillageId = request.villageId,
				targetVillageId = targetId,
				kind = "scout",
				army = army,
			},
		}, string.format("scout:%s:%s:%d", request.villageId, targetId, quantity), nil
	end

	return nil, nil, nil
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
	-- Every command departs from a village this player owns, scouting
	-- included: the target may be foreign, the muster ground never is.
	if not ownsVillage(snapshot, identity.kingdomId, request.villageId) then
		return { ok = false, message = "That is not your village." }
	end
	local command, fingerprint, refusal = buildCommand(request, snapshot, identity.kingdomId)
	if refusal then
		return { ok = false, message = refusal }
	end
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
			result = { ok = true, message = if request.kind == "scout" then "Scouts are away." else "By your order." }
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
