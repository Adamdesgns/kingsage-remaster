--!strict
-- Shared Roblox-side vocabulary and geometry for the stateless practice siege.
-- The external world server still validates and resolves every attempt; this
-- module only keeps the client drawing surface and Roblox command bridge on the
-- same small, versioned 0..100 board.
local PracticeSiegeConfig = {}

PracticeSiegeConfig.VERSION = 1
PracticeSiegeConfig.GRID_SIZE = 100
PracticeSiegeConfig.GRID_STEP = 2
PracticeSiegeConfig.MIN_ROUTE_POINTS = 2
PracticeSiegeConfig.MAX_ROUTE_POINTS = 6
PracticeSiegeConfig.DEPLOYMENT_MAX_Y = 12
PracticeSiegeConfig.FRONT_WALL_Y = 34
PracticeSiegeConfig.SNAP_RADIUS = 7
PracticeSiegeConfig.DEFENSE_PLAN = "guardGate"
PracticeSiegeConfig.DEFENSE_PLANS = { "guardGate", "towerCrossfire", "holdKeep" }
PracticeSiegeConfig.ENTRY_RULE = "openGateOnly"
PracticeSiegeConfig.ENTRY_TEACHING = "Clearing a tower stops its arrows. Only an opened gate lets anyone inside."

PracticeSiegeConfig.GATE = { x = 50, y = 34, openingHalfWidth = 6 }
PracticeSiegeConfig.WEST_TOWER = { x = 28, y = 34, range = 24 }
PracticeSiegeConfig.EAST_TOWER = { x = 72, y = 34, range = 24 }
PracticeSiegeConfig.KEEP = { x = 50, y = 88, radius = 8 }
PracticeSiegeConfig.BARRICADE = { minimum = { x = 43, y = 54 }, maximum = { x = 57, y = 60 } }

PracticeSiegeConfig.SQUADS = {
	{ id = "vanguard", label = "Vanguard", short = "V", color = { 150, 60, 55 }, start = { x = 50, y = 5 }, defaultObjective = "gate" },
	{ id = "archers", label = "Archers", short = "A", color = { 184, 142, 55 }, start = { x = 10, y = 5 }, defaultObjective = "westTower" },
	{ id = "riders", label = "Riders", short = "R", color = { 126, 82, 164 }, start = { x = 90, y = 5 }, defaultObjective = "eastTower" },
}

PracticeSiegeConfig.OBJECTIVES = {
	{ id = "gate", label = "Gate", short = "GATE", position = { x = PracticeSiegeConfig.GATE.x, y = PracticeSiegeConfig.GATE.y }, radius = 7 },
	{ id = "westTower", label = "West tower", short = "WEST", position = { x = PracticeSiegeConfig.WEST_TOWER.x, y = PracticeSiegeConfig.WEST_TOWER.y }, radius = 7 },
	{ id = "eastTower", label = "East tower", short = "EAST", position = { x = PracticeSiegeConfig.EAST_TOWER.x, y = PracticeSiegeConfig.EAST_TOWER.y }, radius = 7 },
	{ id = "barricade", label = "Barricade", short = "BLOCK", position = {
		x = (PracticeSiegeConfig.BARRICADE.minimum.x + PracticeSiegeConfig.BARRICADE.maximum.x) / 2,
		y = (PracticeSiegeConfig.BARRICADE.minimum.y + PracticeSiegeConfig.BARRICADE.maximum.y) / 2,
	}, radius = 6 },
	{ id = "keep", label = "Keep doors", short = "KEEP", position = { x = PracticeSiegeConfig.KEEP.x, y = PracticeSiegeConfig.KEEP.y }, radius = PracticeSiegeConfig.KEEP.radius },
}

export type Point = { x: number, y: number }
export type Route = { Point }

local function copyPoint(point: Point): Point
	return { x = point.x, y = point.y }
end

local function distance(left: Point, right: Point): number
	local dx = left.x - right.x
	local dy = left.y - right.y
	return math.sqrt(dx * dx + dy * dy)
end

local function pointToSegmentDistance(point: Point, first: Point, second: Point): number
	local dx = second.x - first.x
	local dy = second.y - first.y
	local lengthSquared = dx * dx + dy * dy
	if lengthSquared <= 0 then
		return distance(point, first)
	end
	local along = math.clamp(((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSquared, 0, 1)
	return distance(point, { x = first.x + dx * along, y = first.y + dy * along })
end

function PracticeSiegeConfig.squad(squadId: string): any?
	for _, squad in PracticeSiegeConfig.SQUADS do
		if squad.id == squadId then
			return squad
		end
	end
	return nil
end

function PracticeSiegeConfig.objective(objectiveId: string): any?
	for _, objective in PracticeSiegeConfig.OBJECTIVES do
		if objective.id == objectiveId then
			return objective
		end
	end
	return nil
end

function PracticeSiegeConfig.objectiveIndex(objectiveId: string): number
	for index, objective in PracticeSiegeConfig.OBJECTIVES do
		if objective.id == objectiveId then
			return index
		end
	end
	return 1
end

function PracticeSiegeConfig.snapPoint(rawX: number, rawY: number): Point
	local step = PracticeSiegeConfig.GRID_STEP
	local point = {
		x = math.clamp(math.floor(rawX / step + 0.5) * step, 0, PracticeSiegeConfig.GRID_SIZE),
		y = math.clamp(math.floor(rawY / step + 0.5) * step, 0, PracticeSiegeConfig.GRID_SIZE),
	}
	local nearest: any? = nil
	local nearestDistance = PracticeSiegeConfig.SNAP_RADIUS + 0.001
	for _, objective in PracticeSiegeConfig.OBJECTIVES do
		local separation = distance(point, objective.position)
		if separation < nearestDistance then
			nearest = objective
			nearestDistance = separation
		end
	end
	if nearest then
		return copyPoint(nearest.position)
	end
	return point
end

local function appendUnique(route: Route, point: Point)
	local last = route[#route]
	if last and last.x == point.x and last.y == point.y then
		return
	end
	table.insert(route, copyPoint(point))
end

function PracticeSiegeConfig.defaultRoute(squadId: string, objectiveId: string?): Route
	local squad = assert(PracticeSiegeConfig.squad(squadId), "unknown practice squad")
	local objective = assert(PracticeSiegeConfig.objective(objectiveId or squad.defaultObjective), "unknown practice objective")
	local route = { copyPoint(squad.start) }
	local gate = { x = PracticeSiegeConfig.GATE.x, y = PracticeSiegeConfig.GATE.y }
	local keep = { x = PracticeSiegeConfig.KEEP.x, y = PracticeSiegeConfig.KEEP.y }
	-- Towers are approach targets only. Visit them in front of the wall, then
	-- enter through the gate. Crossing at a tower is not an opening.
	if objective.id == "westTower" or objective.id == "eastTower" then
		appendUnique(route, { x = objective.position.x, y = objective.position.y - 6 })
		appendUnique(route, gate)
	elseif objective.id == "gate" then
		appendUnique(route, gate)
	elseif objective.id == "barricade" then
		appendUnique(route, gate)
		appendUnique(route, copyPoint(objective.position))
	else
		appendUnique(route, gate)
	end
	appendUnique(route, keep)
	return route
end

function PracticeSiegeConfig.defaults(): ({ [string]: Route }, { [string]: string })
	local routes: { [string]: Route } = {}
	local objectives: { [string]: string } = {}
	for _, squad in PracticeSiegeConfig.SQUADS do
		objectives[squad.id] = squad.defaultObjective
		routes[squad.id] = PracticeSiegeConfig.defaultRoute(squad.id, squad.defaultObjective)
	end
	return routes, objectives
end

local function routeReaches(route: Route, objective: any): boolean
	for index = 2, #route do
		if pointToSegmentDistance(objective.position, route[index - 1], route[index]) <= objective.radius then
			return true
		end
	end
	return false
end

local function exactKeys(value: any, expected: { string }): boolean
	if typeof(value) ~= "table" then
		return false
	end
	local count = 0
	for key in value do
		if table.find(expected, key) == nil then
			return false
		end
		count += 1
	end
	return count == #expected
end

local function routeLength(route: any): number?
	if typeof(route) ~= "table" then
		return nil
	end
	local count = 0
	for key in route do
		if typeof(key) ~= "number" or key < 1 or key > PracticeSiegeConfig.MAX_ROUTE_POINTS or key ~= math.floor(key) then
			return nil
		end
		count += 1
	end
	if count < PracticeSiegeConfig.MIN_ROUTE_POINTS or count > PracticeSiegeConfig.MAX_ROUTE_POINTS then
		return nil
	end
	-- Lua's # is undefined for sparse tables: count and inspect every slot
	-- before treating an untrusted remote table as a JSON route array.
	for index = 1, count do
		if route[index] == nil then
			return nil
		end
	end
	return count
end

function PracticeSiegeConfig.validateRequest(request: any): (boolean, string?)
	if not exactKeys(request, { "version", "routes", "objectives", "defensePlan" }) then
		return false, "A practice plan needs only version, routes, objectives, and defence plan."
	end
	if request.version ~= PracticeSiegeConfig.VERSION then
		return false, "This practice plan needs version 1."
	end
	if typeof(request.defensePlan) ~= "string" or table.find(PracticeSiegeConfig.DEFENSE_PLANS, request.defensePlan) == nil then
		return false, "That practice defence is not available."
	end
	local squadIds = {}
	for _, squad in PracticeSiegeConfig.SQUADS do
		table.insert(squadIds, squad.id)
	end
	if not exactKeys(request.routes, squadIds) or not exactKeys(request.objectives, squadIds) then
		return false, "Draw all three squad routes."
	end
	for _, squad in PracticeSiegeConfig.SQUADS do
		local objectiveId = request.objectives[squad.id]
		local objective = if typeof(objectiveId) == "string" then PracticeSiegeConfig.objective(objectiveId) else nil
		local route = request.routes[squad.id]
		if not objective then
			return false, squad.label .. " needs a target."
		end
		local length = routeLength(route)
		if length == nil then
			return false, squad.label .. " needs a route with 2 to 6 points."
		end
		for index = 1, length do
			local point = route[index]
			if not exactKeys(point, { "x", "y" }) or typeof(point.x) ~= "number" or typeof(point.y) ~= "number"
				or point.x ~= math.floor(point.x) or point.y ~= math.floor(point.y)
				or point.x < 0 or point.x > PracticeSiegeConfig.GRID_SIZE
				or point.y < 0 or point.y > PracticeSiegeConfig.GRID_SIZE then
				return false, string.format("%s route point %d is off the practice map.", squad.label, index)
			end
			if index == 1 and point.y > PracticeSiegeConfig.DEPLOYMENT_MAX_Y then
				return false, squad.label .. " must start below the wall."
			end
			if index > 1 then
				local previous = route[index - 1]
				if point.y < previous.y then
					return false, squad.label .. " cannot turn back toward deployment."
				end
				if point.x == previous.x and point.y == previous.y then
					return false, squad.label .. " has the same point twice."
				end
			end
		end
		local finish = route[length]
		if distance(finish, PracticeSiegeConfig.KEEP) > PracticeSiegeConfig.KEEP.radius then
			return false, squad.label .. " must finish at the keep doors."
		end
		if not routeReaches(route, objective) then
			return false, squad.label .. " must pass through " .. objective.label .. "."
		end
	end
	return true, nil
end

function PracticeSiegeConfig.fingerprint(request: any): string
	local parts = { "practiceSiege", tostring(request.version), tostring(request.defensePlan) }
	for _, squad in PracticeSiegeConfig.SQUADS do
		table.insert(parts, squad.id)
		table.insert(parts, tostring(request.objectives[squad.id]))
		for _, point in request.routes[squad.id] do
			table.insert(parts, string.format("%d,%d", point.x, point.y))
		end
	end
	return table.concat(parts, ":")
end

return PracticeSiegeConfig
