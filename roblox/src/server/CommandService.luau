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
local BattleConfig = require(shared:WaitForChild("BattleConfig"))
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

-- Commands that act on a battle rather than on a village.
local BATTLE_KINDS: { [string]: boolean } = {
	battleOpen = true,
	battleOrder = true,
	battleRally = true,
	battleResolve = true,
	battleRetreat = true,
}

-- Kinds that act on something other than a village, so the villageId
-- ownership gate does not apply. marchCancel proves ownership from OUR
-- snapshot's march list (buildCommand), and the world server re-checks
-- with FORBIDDEN - the same two-layer shape battles use.
local NON_VILLAGE_KINDS: { [string]: boolean } = {
	marchCancel = true,
}

local CommandService = {}

type QueueRequest = {
	kind: string,
	-- Battle commands act on a battle, not a village, so this is optional.
	villageId: string?,
	building: string?,
	troop: string?,
	quantity: number?,
	targetVillageId: string?,
	plan: { [string]: string }?,
	battleId: string?,
	marchId: string?,
	squad: string?,
	x: number?,
	y: number?,
	atMs: number?,
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

local function hasScoutReport(snapshot: any, targetVillageId: string): boolean
	local reports = snapshot and snapshot.scoutReports
	if typeof(reports) ~= "table" then
		return false
	end
	for _, report in reports do
		if tostring(report.targetVillageId) == targetVillageId then
			return true
		end
	end
	return false
end

-- Rebuilds the plan from the shared axes rather than trusting the client's
-- table: an unknown value can never reach the world server, and a missing one
-- falls back to that axis's first option instead of failing the whole order.
local function sanitizePlan(plan: { [string]: string }?): { [string]: string }
	local safe = Buildings.defaultAttackPlan()
	if typeof(plan) ~= "table" then
		return safe
	end
	for _, axis in Buildings.ATTACK_PLAN_AXES do
		local chosen = plan[axis.key]
		for _, option in axis.options do
			if chosen == option then
				safe[axis.key] = option
				break
			end
		end
	end
	return safe
end

-- Everything in the village that marches on an attack. The rule AND the army
-- construction both live in shared/Buildings, so the table dispatched here and
-- the count the war table renders come from one function, never two that drift.
local function musterFrom(village: any, withNobles: boolean?): ({ [string]: number }, number, number)
	return Buildings.musterFrom(village and village.army, withNobles)
end

-- Battle-order sequence per battle. The world server refuses anything but the
-- next number, and the snapshot it comes from can be up to a heartbeat stale,
-- so this Roblox server counts its own accepted orders. Every order for a
-- battle passes through here, so the count is authoritative between syncs; a
-- refusal still carries the real number and corrects it (see runQueue).
local orderSequence: { [string]: number } = {}

local function findBattle(snapshot: any, battleId: string): any
	local battles = snapshot and snapshot.battleSessions
	if typeof(battles) ~= "table" then
		return nil
	end
	for _, battle in battles do
		if tostring(battle.id) == battleId then
			return battle
		end
	end
	return nil
end

local function findMarch(snapshot: any, marchId: string): any
	for _, march in ((snapshot and snapshot.marches) or {}) do
		if tostring(march.id) == marchId then
			return march
		end
	end
	return nil
end

-- The scout report this player holds on a village, if any.
local function reportFor(snapshot: any, villageId: string): any
	for _, report in ((snapshot and snapshot.scoutReports) or {}) do
		if tostring(report.targetVillageId) == villageId then
			return report
		end
	end
	return nil
end

local function nextSequence(battleId: string, battle: any): number
	local known = math.max(math.floor(tonumber(battle and battle.acceptedOrders) or 0), 0)
	local mine = orderSequence[battleId] or 0
	local base = math.max(known, mine)
	orderSequence[battleId] = base
	return base + 1
end

-- Returns (command, fingerprint, refusal). A refusal is a LOCAL, honest "no"
-- that saves a round trip; anything the client cannot know for certain is left
-- to the world server, whose message is what the player then reads.
local function buildCommand(request: QueueRequest, snapshot: any, kingdomId: string): ({ [string]: any }?, string?, string?)
	-- runQueue guarantees a real villageId for every kind below; the battle
	-- kinds that legitimately have none are handled after them.
	local villageId = request.villageId or ""

	if request.kind == "build" and typeof(request.building) == "string" then
		return { type = "village.build.queue", payload = { villageId = villageId, building = request.building } },
			"build:" .. villageId .. ":" .. request.building,
			nil
	end

	if request.kind == "recruit" then
		if not isKnownTroop(request.troop) then
			return nil, nil, "No such troop."
		end
		local troop = request.troop :: string
		-- 100 mirrors the world server's own order bound (store: 1..100). A
		-- clamp above it would silently shrink orders server-side instead of
		-- honestly here.
		local quantity = math.clamp(math.floor(tonumber(request.quantity) or 0), 1, 100)
		return { type = "village.recruit.queue", payload = { villageId = villageId, troop = troop, quantity = quantity } },
			"recruit:" .. villageId .. ":" .. troop .. ":" .. quantity,
			nil
	end

	if request.kind == "research" then
		-- kingdom.research.queue was fully implemented server-side and had NO
		-- path from the game (audit: DISCONNECTED). The target level is the
		-- kingdom's current level plus one, read from OUR snapshot - the
		-- client cannot skip rungs.
		if not isKnownTroop(request.troop) then
			return nil, nil, "No such troop."
		end
		local troop = request.troop :: string
		local currentLevel = 1
		for _, entry in ipairs(snapshot.troopCatalog or {}) do
			if tostring(entry.troop) == troop then
				currentLevel = math.floor(tonumber(entry.researchLevel) or 1)
				break
			end
		end
		if currentLevel >= 10 then
			return nil, nil, "That art is already mastered."
		end
		return {
			type = "kingdom.research.queue",
			payload = { villageId = villageId, troop = troop, targetLevel = currentLevel + 1 },
		}, string.format("research:%s:%s:%d", villageId, troop, currentLevel + 1), nil
	end

	if request.kind == "marchCancel" then
		if typeof(request.marchId) ~= "string" then
			return nil, nil, "No march to recall."
		end
		local marchId = request.marchId :: string
		local mine = false
		for _, march in ipairs(snapshot.marches or {}) do
			if tostring(march.id) == marchId and tostring(march.status) == "outbound" then
				mine = true
				break
			end
		end
		if not mine then
			return nil, nil, "They can see the walls — there is no turning back now."
		end
		return { type = "march.cancel", payload = { marchId = marchId } },
			"marchCancel:" .. marchId, nil
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
		local from = findVillage(snapshot, villageId)
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
				fromVillageId = villageId,
				targetVillageId = targetId,
				kind = "scout",
				army = army,
			},
		}, string.format("scout:%s:%s:%d", villageId, targetId, quantity), nil
	end

	if request.kind == "attack" then
		if typeof(request.targetVillageId) ~= "string" then
			return nil, nil, "Pick a village to attack."
		end
		local targetId = request.targetVillageId :: string
		local target = findVillage(snapshot, targetId)
		if not target then
			return nil, nil, "That village is not on the map."
		end
		if target.kingdomId == kingdomId then
			return nil, nil, "That is your own village."
		end
		-- The world server enforces this too (SCOUT_REQUIRED); saying it here
		-- turns a round trip into an instant, honest answer.
		if not hasScoutReport(snapshot, targetId) then
			return nil, nil, "Scout them first — nobody attacks blind."
		end
		local from = findVillage(snapshot, villageId)
		-- A conquest is an explicit declaration by the player. Anything the
		-- client did not say plainly is an ordinary raid, and noblemen stay
		-- home — never inferred from what happens to be in the barracks.
		local withNobles = request.withNobles == true
		local army, fighting, nobles = musterFrom(from, withNobles)
		if fighting < 1 then
			return nil, nil, "No fighting troops in this village."
		end
		if withNobles and nobles < 1 then
			return nil, nil, "No noblemen here — they are trained at an Academy."
		end
		local plan = sanitizePlan(request.plan)
		return {
			type = "march.launch",
			payload = {
				fromVillageId = villageId,
				targetVillageId = targetId,
				kind = "attack",
				army = army,
				plan = plan,
			},
		-- The nobleman count is part of the fingerprint: a raid and a conquest
		-- on the same target in the same breath are DIFFERENT intents, and the
		-- 2s same-intent guard must not swallow the second one.
		}, string.format("attack:%s:%s:%d:%d:%s:%s:%s:%s",
			villageId, targetId, fighting, nobles, plan.entry, plan.troops, plan.time, plan.style), nil
	end

	-- ---- attending a battle (slice B) ----

	if request.kind == "battleOpen" then
		if typeof(request.marchId) ~= "string" then
			return nil, nil, "No army is waiting at those walls."
		end
		local marchId = request.marchId :: string
		local march = findMarch(snapshot, marchId)
		if not march or tostring(march.status) ~= "awaiting_battle" then
			return nil, nil, "That army has not reached the walls yet."
		end
		local targetId = tostring(march.targetVillageId)
		local report = reportFor(snapshot, targetId)
		if not report then
			return nil, nil, "You hold no report on that village."
		end
		-- The report's version IS the claim the world server verifies intel
		-- against. Commit 9467e02 deleted this local while the payload below
		-- still referenced it; the nil made every battleOpen read as stale.
		-- rules-check now pins this line to the payload's use of it.
		local reportVersion = math.floor(tonumber(report.targetVillageVersion) or 0)
		-- Staleness is the WORLD SERVER'S call, not ours. Its intelIsCurrent()
		-- compares the report's observed garrison and wall against the
		-- defender's real ones - resources ticking over there change nothing
		-- an attacker planned around. This mirror used to demand an exact
		-- stateVersion match instead, and stateVersion bumps every time the
		-- defender's wood ticks (~17s at level 14), so attending a battle was
		-- refused after almost any march. The client cannot compare substance
		-- itself - foreign garrisons are fogged - so it must not pre-judge.
		return {
			type = "battle.open",
			payload = {
				marchId = marchId,
				targetVillageVersion = reportVersion,
				plan = sanitizePlan(request.plan),
			},
		}, "battleOpen:" .. marchId, nil
	end

	if request.kind == "battleOrder" then
		if typeof(request.battleId) ~= "string" then
			return nil, nil, "No battle to command."
		end
		local battleId = request.battleId :: string
		local battle = findBattle(snapshot, battleId)
		if not battle or tostring(battle.status) ~= "open" then
			return nil, nil, "That battle is already decided."
		end
		local squad = tostring(request.squad)
		local known = false
		for _, definition in BattleConfig.SQUADS do
			if definition.id == squad then
				known = true
				break
			end
		end
		if not known then
			return nil, nil, "No such squad."
		end
		local sequence = nextSequence(battleId, battle)
		if sequence > BattleConfig.ORDER_CAP then
			-- Mirror of the world server's ORDER_CAP_REACHED refusal: same
			-- number (parity-tested), friendlier failure - no round trip.
			return nil, nil, string.format("A battle accepts at most %d field orders.", BattleConfig.ORDER_CAP)
		end
		local x = math.clamp(math.floor(tonumber(request.x) or 0), 0, BattleConfig.ORDER_SPACE)
		local y = math.clamp(math.floor(tonumber(request.y) or 0), 0, BattleConfig.ORDER_SPACE)
		local atMs = math.clamp(math.floor(tonumber(request.atMs) or 0), 0, 600000)
		return {
			type = "battle.order",
			payload = { battleId = battleId, sequence = sequence, squad = squad, x = x, y = y, atMs = atMs },
		}, string.format("battleOrder:%s:%d", battleId, sequence), nil
	end

	if request.kind == "battleResolve" then
		if typeof(request.battleId) ~= "string" then
			return nil, nil, "No battle to settle."
		end
		local battleId = request.battleId :: string
		local battle = findBattle(snapshot, battleId)
		if not battle or tostring(battle.status) ~= "open" then
			return nil, nil, "That battle is already decided."
		end
		return { type = "battle.resolve", payload = { battleId = battleId } }, "battleResolve:" .. battleId, nil
	end

	if request.kind == "battleRetreat" then
		if typeof(request.battleId) ~= "string" then
			return nil, nil, "No battle to leave."
		end
		local battleId = request.battleId :: string
		local battle = findBattle(snapshot, battleId)
		if not battle or tostring(battle.status) ~= "open" then
			return nil, nil, "That battle is already decided."
		end
		-- No atMs: the world server derives exposure from the battle's own
		-- opened_at. A client-supplied clock bought survivors (audit 8.4).
		return {
			type = "battle.retreat",
			payload = {
				battleId = battleId,
				sequence = nextSequence(battleId, battle),
			},
		}, "battleRetreat:" .. battleId, nil
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
	if typeof(request) ~= "table" or typeof(request.kind) ~= "string" then
		return { ok = false, message = "That order made no sense." }
	end
	-- Anything that leaves a village departs from one this player owns —
	-- scouting and attacking included: the target may be foreign, the muster
	-- ground never is. Battle commands act on a battle instead, and the world
	-- server checks that the battle belongs to this kingdom.
	if not BATTLE_KINDS[request.kind] and not NON_VILLAGE_KINDS[request.kind] then
		if typeof(request.villageId) ~= "string" then
			return { ok = false, message = "That order made no sense." }
		end
		if not ownsVillage(snapshot, identity.kingdomId, request.villageId) then
			local found = findVillage(snapshot, request.villageId)
			warn(string.format(
				"[World] ownership check failed: prompt villageId=%s, my kingdom=%s, that village belongs to=%s, villages in snapshot=%d",
				tostring(request.villageId),
				tostring(identity.kingdomId),
				tostring(found and found.kingdomId or "NOT IN SNAPSHOT"),
				#((snapshot and snapshot.world and snapshot.world.villages) or {})
			))
			return { ok = false, message = "That is not your village." }
		end
	end
	-- RALLY (slice 2): a carried order whose engagement point follows the
	-- commander. Re-tapping resumes the EXISTING order (rejoin path, no cap
	-- spend); a first tap becomes a normal battleOrder at the commander's
	-- current field position, then registers for heartbeat tracking below.
	local rallySquad: string? = nil
	if request.kind == "battleRally" then
		if typeof(request.battleId) ~= "string" or typeof(request.squad) ~= "string" then
			return { ok = false, message = "That order made no sense." }
		end
		local battleId = request.battleId :: string
		local squad = request.squad :: string
		if WorldSession.rallyFor(player, battleId, squad) then
			return { ok = true, message = string.format("Rallying %s to your position.", squad) }
		end
		local fieldX, fieldY = WorldSession.fieldPointFor(player, battleId)
		if not fieldX or not fieldY then
			return { ok = false, message = "Stand on the field to rally a squad." }
		end
		rallySquad = squad
		request = {
			kind = "battleOrder",
			battleId = battleId,
			squad = squad,
			x = fieldX,
			y = fieldY,
			atMs = request.atMs,
		} :: QueueRequest
	end

	local command, fingerprint, refusal = buildCommand(request, snapshot, identity.kingdomId)
	-- reassigned by the INVALID_ORDER correction below
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
			local success = "By your order."
			if request.kind == "scout" then
				success = "Scouts are away."
			elseif request.kind == "attack" then
				success = "The army marches."
			elseif request.kind == "battleOpen" then
				success = "The lines are drawn."
			elseif request.kind == "battleOrder" then
				success = "Order carried."
			elseif request.kind == "battleResolve" then
				success = "The charge is called."
			elseif request.kind == "battleRetreat" then
				success = "Falling back."
			end
			if command.payload and command.payload.sequence and typeof(request.battleId) == "string" then
				orderSequence[request.battleId] = command.payload.sequence
				if rallySquad then
					-- The order landed; from here the heartbeat steers it.
					WorldSession.registerRally(player, request.battleId :: string, command.payload.sequence, rallySquad)
					success = string.format("Rallying %s to your position.", rallySquad)
				end
			end
			result = { ok = true, message = success }
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
			elseif code == "INVALID_ORDER" and attempt == 1 and typeof(request.battleId) == "string" then
				-- The realm names the sequence it wants. Take it and try once
				-- more, rather than making the player tap again for a number
				-- they cannot see.
				local told = tonumber(string.match(tostring(body.payload and body.payload.message or ""), "sequence (%d+)"))
				if told then
					orderSequence[request.battleId] = told - 1
					local rebuilt, _rebuiltFingerprint = buildCommand(request, snapshot, identity.kingdomId)
					if rebuilt then
						command = rebuilt
					end
				else
					result = { ok = false, message = tostring(body.payload and body.payload.message or "The realm refused that order.") }
					break
				end
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
	-- A refused order used to be invisible in Studio: the player saw a toast
	-- for three seconds and the Output said nothing, so a whole play session
	-- could pass with NOTHING reaching the realm and no way to tell why.
	-- Every refusal now names itself.
	if not result.ok then
		warn(string.format("[World] refused %s for %s (village=%s target=%s): %s", tostring(request.kind), player.Name, tostring(request.villageId), tostring(request.targetVillageId), result.message))
	else
		print(string.format("[World] accepted %s for %s (village=%s)", tostring(request.kind), player.Name, tostring(request.villageId)))
	end
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
