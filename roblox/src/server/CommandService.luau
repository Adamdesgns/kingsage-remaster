--!strict
-- Turns player intent (walk-up prompts, war-table buttons) into idempotent
-- world-server commands. Never charges locally, never pretends: the world
-- only changes after the server confirms (spec §2, §8).
local HttpService = game:GetService("HttpService")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local ApiClient = require(script.Parent:WaitForChild("ApiClient"))
local WorldSession = require(script.Parent:WaitForChild("WorldSession"))

local remotes = ReplicatedStorage:WaitForChild("WorldRemotes")
local queueCommandRemote = remotes:WaitForChild("QueueCommand") :: RemoteFunction
local toastRemote = remotes:WaitForChild("Toast") :: RemoteEvent

local COPY_UNREACHABLE = "The realm didn't answer — nothing was spent."
local COPY_RECONNECTING = "Reconnecting to the realm…"

local CommandService = {}

type QueueRequest = { kind: string, villageId: string, building: string?, troop: string?, quantity: number? }

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

local function buildCommand(request: QueueRequest): { [string]: any }?
	if request.kind == "build" and typeof(request.building) == "string" then
		return { type = "village.build.queue", payload = { villageId = request.villageId, building = request.building } }
	end
	if request.kind == "recruit" and typeof(request.troop) == "string" then
		local quantity = math.clamp(math.trunc(tonumber(request.quantity) or 0), 1, 500)
		return { type = "village.recruit.queue", payload = { villageId = request.villageId, troop = request.troop, quantity = quantity } }
	end
	return nil
end

-- One attempt = one commandId. A WORLD_VERSION_CONFLICT (our snapshot was
-- stale under the 10s heartbeat) refetches and retries ONCE with a NEW
-- commandId - safe because the conflicted command was rejected and charged
-- nothing. Transport retries reuse the SAME commandId inside ApiClient.
function CommandService.queue(player: Player, request: QueueRequest): { ok: boolean, message: string }
	if WorldSession.getStatus() ~= "online" then
		return { ok = false, message = COPY_RECONNECTING }
	end
	local identity = WorldSession.getIdentity(player)
	local snapshot = WorldSession.getState(player)
	if not identity or not snapshot then
		return { ok = false, message = COPY_RECONNECTING }
	end
	if typeof(request) ~= "table" or typeof(request.villageId) ~= "string" then
		return { ok = false, message = "That order made no sense." }
	end
	if not ownsVillage(snapshot, identity.kingdomId, request.villageId) then
		return { ok = false, message = "That is not your village." }
	end
	local command = buildCommand(request)
	if not command then
		return { ok = false, message = "That order made no sense." }
	end

	for attempt = 1, 2 do
		local answered, _status, body = ApiClient.postFull("/api/roblox/commands", {
			robloxUserId = identity.robloxUserId,
			commandId = HttpService:GenerateGUID(false),
			expectedWorldVersion = snapshot.world.version,
			command = command,
		})
		if not answered then
			return { ok = false, message = COPY_UNREACHABLE }
		end
		if typeof(body) == "table" and body.type == "command.accepted" then
			WorldSession.refetch(player)
			return { ok = true, message = "By your order." }
		end
		if typeof(body) == "table" and body.type == "command.rejected" then
			local code = tostring(body.payload and body.payload.code or "?")
			if code == "WORLD_VERSION_CONFLICT" and attempt == 1 then
				WorldSession.refetch(player)
				snapshot = WorldSession.getState(player) or snapshot
			else
				return { ok = false, message = tostring(body.payload and body.payload.message or "The realm refused that order.") }
			end
		elseif typeof(body) == "table" and body.error then
			return { ok = false, message = tostring(body.error.message or "The realm refused that order.") }
		else
			return { ok = false, message = "The realm answered strangely; nothing was spent twice." }
		end
	end
	return { ok = false, message = "The world kept changing — try again." }
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
	local result: { ok: boolean, message: string }
	if prompt.Name == "InteractPrompt" then
		result = CommandService.queue(player, { kind = "build", villageId = villageId, building = building })
	elseif prompt.Name == "RecruitPrompt" then
		result = CommandService.queue(player, { kind = "recruit", villageId = villageId, troop = "spear", quantity = 5 })
	else
		return
	end
	toastRemote:FireClient(player, result)
end)

return CommandService
