--!strict
-- Execute the real request validator; --emit-contract also supplies the same
-- accepted/rejected JSON corpus to the real TypeScript resolver's contract test.
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")
local serde = require("@lune/serde")
local Config = luau.load(fs.readFile("roblox/src/shared/PracticeSiegeConfig.luau"))()
local emit = process.args[1] == "--emit-contract"
local checks = 0
local cases = {}

local function check(name: string, condition: boolean)
	assert(condition, name)
	checks += 1
	if not emit then print("PASS  " .. name) end
end

local function request(): any
	local routes, objectives = Config.defaults()
	return { version = Config.VERSION, routes = routes, objectives = objectives, defensePlan = Config.DEFENSE_PLAN }
end

local function exercise(name: string, value: any, expected: boolean, jsonSafe: boolean?)
	local ran, valid, reason = pcall(Config.validateRequest, value)
	check(name .. " returns a validation result without throwing", ran)
	check(name .. (if expected then " accepts" else " rejects"), valid == expected)
	check(name .. " has appropriate feedback", if expected then reason == nil else typeof(reason) == "string" and #reason > 0)
	if jsonSafe ~= false then
		table.insert(cases, { name = name, request = value, accepted = valid })
	end
end

local function changed(name: string, mutate: (any) -> (), expected: boolean?, jsonSafe: boolean?)
	local value = request()
	mutate(value)
	exercise(name, value, expected == true, jsonSafe)
end

exercise("default routes and targets", request(), true)
for _, plan in Config.DEFENSE_PLANS do
	changed("saved defense " .. plan, function(value) value.defensePlan = plan end, true)
end
for _, squad in Config.SQUADS do
	for _, objective in Config.OBJECTIVES do
		changed(squad.id .. " default route to " .. objective.id, function(value)
			value.objectives[squad.id] = objective.id
			value.routes[squad.id] = Config.defaultRoute(squad.id, objective.id)
		end, true)
	end
end

exercise("nil request", nil, false, false)
exercise("boolean request", true, false)
exercise("array request", { 1, 2 }, false)
changed("extra request field", function(value) value.reward = 100 end)
changed("missing version", function(value) value.version = nil end)
changed("wrong version", function(value) value.version = 2 end)
changed("string version", function(value) value.version = "1" end)
changed("unknown defense", function(value) value.defensePlan = "surprise" end)
changed("non-string defense", function(value) value.defensePlan = {} end)
changed("missing routes", function(value) value.routes = nil end)
changed("array routes", function(value) value.routes = { value.routes.vanguard } end)
changed("missing objectives", function(value) value.objectives = nil end)
changed("array objectives", function(value) value.objectives = { "gate", "keep", "keep" } end)
changed("extra route squad", function(value) value.routes.scouts = value.routes.vanguard end)
changed("missing route squad", function(value) value.routes.riders = nil end)
changed("extra objective squad", function(value) value.objectives.scouts = "keep" end)
changed("missing objective squad", function(value) value.objectives.riders = nil end)
changed("unknown objective", function(value) value.objectives.vanguard = "treasury" end)
changed("non-string objective", function(value) value.objectives.vanguard = true end)
changed("non-table route", function(value) value.routes.vanguard = "gate" end)
changed("empty route", function(value) value.routes.vanguard = {} end)
changed("one point route", function(value) value.routes.vanguard = { { x = 50, y = 88 } } end)
changed("seven point route", function(value)
	value.routes.vanguard = { {x=50,y=0}, {x=50,y=12}, {x=50,y=20}, {x=50,y=34}, {x=50,y=48}, {x=50,y=70}, {x=50,y=88} }
end)
changed("numeric string route keys", function(value)
	value.routes.vanguard = { ["1"] = {x=50,y=5}, ["2"] = {x=50,y=34}, ["3"] = {x=50,y=88} }
end)
-- These malformed Luau remote tables cannot be represented by a JSON array.
changed("sparse route", function(value) value.routes.vanguard[2] = nil end, false, false)
changed("zero route key", function(value) value.routes.vanguard[0] = {x=50,y=0} end, false, false)
changed("fractional route key", function(value) value.routes.vanguard[1.5] = {x=50,y=8} end, false, false)
changed("extra string route key", function(value) value.routes.vanguard.extra = {x=50,y=0} end, false, false)
changed("non-table point", function(value) value.routes.vanguard[1] = 5 end)
changed("array point", function(value) value.routes.vanguard[1] = { 50, 5 } end)
changed("extra point key", function(value) value.routes.vanguard[1].z = 0 end)
changed("missing point x", function(value) value.routes.vanguard[1].x = nil end)
changed("missing point y", function(value) value.routes.vanguard[1].y = nil end)
changed("string point coordinate", function(value) value.routes.vanguard[1].x = "50" end)
changed("boolean point coordinate", function(value) value.routes.vanguard[1].y = false end)
for _, axis in { "x", "y" } do
	for _, value in { -1, 101, 5.5 } do
		changed(axis .. " invalid coordinate " .. tostring(value), function(plan) plan.routes.vanguard[1][axis] = value end)
	end
	for _, value in { math.huge, -math.huge, 0/0 } do
		changed(axis .. " nonfinite coordinate " .. tostring(value), function(plan) plan.routes.vanguard[1][axis] = value end, false, false)
	end
end
changed("deployment boundary", function(value) value.routes.vanguard[1].y = 12 end, true)
changed("beyond deployment boundary", function(value) value.routes.vanguard[1].y = 13 end)
changed("backtracking", function(value)
	value.routes.vanguard = { {x=50,y=5}, {x=50,y=34}, {x=50,y=33}, {x=50,y=88} }
end)
changed("duplicate neighboring point", function(value)
	value.routes.vanguard = { {x=50,y=5}, {x=50,y=34}, {x=50,y=34}, {x=50,y=88} }
end)
changed("horizontal segment at wall", function(value)
	value.routes.vanguard = { {x=50,y=5}, {x=50,y=34}, {x=60,y=34}, {x=50,y=88} }
end, true)
changed("six point route", function(value)
	value.routes.vanguard = { {x=0,y=0}, {x=100,y=12}, {x=50,y=34}, {x=35,y=48}, {x=35,y=68}, {x=50,y=88} }
end, true)
changed("two point keep route", function(value)
	value.objectives.vanguard = "keep"
	value.routes.vanguard = { {x=50,y=0}, {x=50,y=88} }
end, true)
changed("end at grid ceiling misses keep", function(value) value.routes.vanguard[3].y = 100 end)
changed("keep finish radius boundary", function(value) value.routes.vanguard[3].x = 58 end, true)
changed("outside keep finish radius", function(value) value.routes.vanguard[3].x = 59 end)

-- Target contact is measured against segments, not just their vertices. Test
-- both sides of every target radius so a changed mirror cannot pass itself.
for _, target in Config.OBJECTIVES do
	if target.id ~= "keep" then
		for _, offset in { 0, 1 } do
			changed(target.id .. " contact radius +" .. offset, function(value)
				local x = target.position.x - target.radius - offset
				value.objectives.vanguard = target.id
				value.routes.vanguard = { {x=x,y=5}, {x=x,y=70}, {x=50,y=88} }
			end, offset == 0)
		end
	end
end
changed("segment contacts objective without vertex contact", function(value)
	value.routes.vanguard = { {x=50,y=5}, {x=50,y=60}, {x=50,y=88} }
end, true)
changed("assigned target never reached", function(value) value.objectives.vanguard = "westTower" end)

local fresh = request()
fresh.routes.vanguard[1].x = -100
fresh.objectives.vanguard = "keep"
check("defaults return independent points and target maps", request().routes.vanguard[1].x == 50 and request().objectives.vanguard == "gate")
local firstFingerprint = Config.fingerprint(request())
check("identical plans have identical fingerprints", firstFingerprint == Config.fingerprint(request()))
for _, squad in Config.SQUADS do
	local moved = request()
	moved.routes[squad.id][1].x += 1
	check(squad.id .. " route changes fingerprint", Config.fingerprint(moved) ~= firstFingerprint)
	local target = request()
	target.objectives[squad.id] = "keep"
	check(squad.id .. " target changes fingerprint", Config.fingerprint(target) ~= firstFingerprint)
end
local differentDefense = request()
differentDefense.defensePlan = "holdKeep"
check("defense changes fingerprint", Config.fingerprint(differentDefense) ~= firstFingerprint)
check("unknown squad lookup fails", Config.squad("scouts") == nil)
check("unknown objective lookup fails", Config.objective("treasury") == nil)
local snapped = Config.snapPoint(49, 33)
check("gate snap uses actual target position", snapped.x == 50 and snapped.y == 34)
snapped = Config.snapPoint(-100, 200)
check("drawn coordinates clamp to the board", snapped.x == 0 and snapped.y == 100)
snapped = Config.snapPoint(7, 9)
check("drawn coordinates snap to the two-unit grid", snapped.x == 8 and snapped.y == 10)

if emit then
	local squadIds, objectiveIds = {}, {}
	for _, squad in Config.SQUADS do table.insert(squadIds, squad.id) end
	for _, objective in Config.OBJECTIVES do table.insert(objectiveIds, objective.id) end
	local function point(value) return { x = value.x, y = value.y } end
	print(serde.encode("json", {
		checks = checks,
		version = Config.VERSION,
		squads = squadIds,
		objectives = objectiveIds,
		defensePlans = Config.DEFENSE_PLANS,
		defaultDefense = Config.DEFENSE_PLAN,
		defaultRequest = request(),
		noGateTeamRequest = (function()
			local routes, objectives = Config.noGateTeamLesson()
			return { version = Config.VERSION, routes = routes, objectives = objectives, defensePlan = Config.DEFENSE_PLAN }
		end)(),
		entryRule = Config.ENTRY_RULE,
		entryTeaching = Config.ENTRY_TEACHING,
		layout = {
			size = Config.GRID_SIZE,
			deploymentMaxY = Config.DEPLOYMENT_MAX_Y,
			frontWallY = Config.FRONT_WALL_Y,
			entryRule = Config.ENTRY_RULE,
			gate = { position = point(Config.GATE), openingHalfWidth = Config.GATE.openingHalfWidth },
			westTower = { position = point(Config.WEST_TOWER), range = Config.WEST_TOWER.range },
			eastTower = { position = point(Config.EAST_TOWER), range = Config.EAST_TOWER.range },
			barricade = Config.BARRICADE,
			keep = { position = point(Config.KEEP), finishRadius = Config.KEEP.radius },
		},
		targets = Config.OBJECTIVES,
		cases = cases,
	}))
else
	print(string.format("---- %d practice contract checks, 0 failed ----", checks))
end
