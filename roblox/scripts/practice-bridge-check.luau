--!strict
-- Execute the complete CommandService against the real practice validator and
-- fake Roblox services. No HTTP, live world, or Studio state is used here.
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local serde = require("@lune/serde")
local Config = luau.load(fs.readFile("roblox/src/shared/PracticeSiegeConfig.luau"))()
local source = fs.readFile("roblox/src/server/CommandService.luau")
local checks = 0
local function check(name: string, condition: boolean)
	assert(condition, name)
	checks += 1
	print("PASS  " .. name)
end

local function request(): any
	local routes, objectives = Config.defaults()
	return { kind = "practiceSiege", version = Config.VERSION, routes = routes, objectives = objectives, defensePlan = Config.DEFENSE_PLAN }
end

local function harness(response: any, options: any?): any
	options = options or {}
	local sent = {}
	local statistics = { refetches = 0, guids = 0 }
	local player = { Name = "Practitioner", UserId = 42 }
	local identity = { robloxUserId = 42, kingdomId = "mine", outdated = options.outdated == true }
	local snapshot = { world = { version = 37, villages = { { id = "owned", kingdomId = "mine" } } } }
	local api = {
		postFull = function(path, body)
			table.insert(sent, { path = path, body = body })
			if options.onPost then options.onPost() end
			return options.answered ~= false, options.statusCode or 200, response
		end,
	}
	local session = setmetatable({
		getStatus = function() return options.status or "online" end,
		getIdentity = function() return if options.noIdentity then nil else identity end,
		getState = function() return if options.noSnapshot then nil else snapshot end,
		refetch = function() statistics.refetches += 1 end,
	}, { __index = function(_, key) error("unexpected production session operation: " .. tostring(key)) end })
	local modules = {
		Buildings = {},
		BattleConfig = setmetatable({}, { __index = function() error("practice consulted production battle rules") end }),
		PracticeSiegeConfig = Config,
		ApiClient = api,
		WorldSession = session,
	}
	local shared = { WaitForChild = function(_self, name) assert(modules[name]); return name end }
	local remote = {}
	local remotes = { WaitForChild = function(_self, name)
		if name == "QueueCommand" then return remote end
		assert(name == "Toast")
		return { FireClient = function() error("unexpected toast") end }
	end }
	local services = {
		HttpService = { GenerateGUID = function(_self, braces)
			assert(braces == false)
			statistics.guids += 1
			return "practice-guid-" .. statistics.guids
		end },
		ProximityPromptService = { PromptTriggered = { Connect = function() end } },
		ReplicatedStorage = { WaitForChild = function(_self, name)
			if name == "WorldShared" then return shared end
			assert(name == "WorldRemotes")
			return remotes
		end },
	}
	local service = luau.load(source, { environment = {
		game = { GetService = function(_self, name) return assert(services[name], name) end },
		script = { Parent = shared },
		require = function(name) return assert(modules[name], name) end,
		print = function() end,
		warn = function() end,
	} })()
	return { service = service, remote = remote, sent = sent, statistics = statistics, player = player, identity = identity, snapshot = snapshot }
end

local outcome = { mode = "practice", winner = "attacker", reasons = { "The west tower was disabled before the crossing." }, events = { { phase = "wall", tower = "westTower" } } }
local accepted = { type = "command.accepted", payload = { worldVersion = 9999, practiceSiege = outcome } }
local bridge = harness(accepted)
local plan = request()
-- These caller claims must not redirect the command or enter its pure payload.
plan.robloxUserId = 999
plan.battleId = "foreign-battle"
plan.villageId = "foreign-village"
local before = serde.encode("json", bridge.snapshot)
local result = bridge.remote.OnServerInvoke(bridge.player, plan)
check("non-village practice request returns the exact server result", result.ok == true and result.practiceSiege == outcome)
check("practice uses existing Roblox command endpoint and session identity", #bridge.sent == 1 and bridge.sent[1].path == "/api/roblox/commands" and bridge.sent[1].body.robloxUserId == 42)
local envelope = bridge.sent[1].body
check("practice receives a command ID and does not invent a version", envelope.commandId == "practice-guid-1" and envelope.expectedWorldVersion == 37)
local payload = envelope.command.payload
check("bridge forwards only the pure-core practice payload", envelope.command.type == "practice.siege.resolve"
	and payload.version == Config.VERSION and payload.routes == plan.routes and payload.objectives == plan.objectives
	and payload.defensePlan == plan.defensePlan and payload.kind == nil and payload.villageId == nil and payload.battleId == nil and payload.robloxUserId == nil)
check("practice acceptance neither refetches nor changes live world/session state", bridge.statistics.refetches == 0 and serde.encode("json", bridge.snapshot) == before and bridge.identity.kingdomId == "mine")
local replay = bridge.service.queue(bridge.player, plan)
check("same-intent protection retains the exact accepted practice result", replay == result and #bridge.sent == 1)
plan.routes.vanguard[1].x = 48
local changed = bridge.service.queue(bridge.player, plan)
check("a changed route is a new intent even inside the repeat window", changed.ok and #bridge.sent == 2 and bridge.sent[2].body.commandId == "practice-guid-2")

for _, code in { "INVALID_PRACTICE_SIEGE", "WORLD_VERSION_CONFLICT", "INVALID_ORDER", "RATE_LIMITED" } do
	local message = "Exact realm refusal for " .. code .. ": sequence 7 — try another route."
	local refused = harness({ type = "command.rejected", payload = { code = code, message = message, currentWorldVersion = 444 } }, { statusCode = 400 })
	local rejectedPlan = request()
	rejectedPlan.battleId = "forged-live-battle"
	local refusal = refused.service.queue(refused.player, rejectedPlan)
	check(code .. " keeps the server message and does not enter live battle/version retries", not refusal.ok and refusal.message == message and refusal.practiceSiege == nil and #refused.sent == 1 and refused.statistics.refetches == 0 and refused.snapshot.world.version == 37)
end

for _, malformed in {
	function(plan) plan.version = 999 end,
	function(plan) plan.routes.vanguard = nil end,
	function(plan) plan.routes.archers[1].x = 10.5 end,
	function(plan) plan.objectives.riders = "unknown-target" end,
	function(plan) plan.routes.vanguard[1].y = 101 end,
} do
	local invalid = request()
	malformed(invalid)
	local valid, reason = Config.validateRequest({ version = invalid.version, routes = invalid.routes, objectives = invalid.objectives, defensePlan = invalid.defensePlan })
	local localBridge = harness(accepted)
	local refusal = localBridge.service.queue(localBridge.player, invalid)
	check("shared validation refuses malformed practice before HTTP: " .. tostring(reason), not valid and not refusal.ok and refusal.message == reason and #localBridge.sent == 0)
end

for _, body in { {}, { type = "command.accepted", payload = {} }, { type = "command.accepted", payload = { practiceSiege = "bad" } }, { error = { code = "BAD_KEY" } } } do
	local malformedBridge = harness(body)
	local badResult = malformedBridge.service.queue(malformedBridge.player, request())
	check("missing/invalid result and auth errors cannot masquerade as practice success", not badResult.ok and badResult.practiceSiege == nil and malformedBridge.statistics.refetches == 0)
end
local unreachable = harness(accepted, { answered = false })
local unreachableResult = unreachable.service.queue(unreachable.player, request())
check("transport failure cannot become a local practice outcome", not unreachableResult.ok and unreachableResult.practiceSiege == nil and unreachable.statistics.refetches == 0)

for _, options in { { status = "offline" }, { noIdentity = true }, { noSnapshot = true }, { outdated = true } } do
	local gated = harness(accepted, options)
	local gatedResult = gated.service.queue(gated.player, request())
	check("practice retains the existing online/identity/version admission gates", not gatedResult.ok and #gated.sent == 0)
end

local nested: any = nil
local reentrant: any = nil
reentrant = harness(accepted, { onPost = function()
	nested = reentrant.service.queue(reentrant.player, request())
end })
local outer = reentrant.service.queue(reentrant.player, request())
check("concurrent practice taps share existing per-player in-flight protection", outer.ok and nested and not nested.ok and nested.message == "Still carrying out your last order." and #reentrant.sent == 1)

local production = harness({ type = "command.accepted", payload = { worldVersion = 38 } })
local denied = production.service.queue(production.player, { kind = "build", villageId = "foreign", building = "warehouse" })
check("adding practice does not weaken village ownership checks", not denied.ok and #production.sent == 0)
local built = production.service.queue(production.player, { kind = "build", villageId = "owned", building = "warehouse" })
check("ordinary village acceptance still refreshes live state", built.ok and built.practiceSiege == nil and production.statistics.refetches == 1 and production.sent[1].body.command.type == "village.build.queue")

print(string.format("---- %d practice bridge checks, 0 failed ----", checks))
