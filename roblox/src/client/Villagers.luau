--!strict
-- The square, breathing (slice 4). CLIENT-DRAWN like Paddock and the
-- battle scene: the owner's client walks its own villagers from its own
-- snapshot, so nothing replicates and foreign settlements stay fog shells
-- by construction. One BulkMoveTo per frame moves everyone; the routes,
-- the costumes and the mourning rule all live in shared VillagerSpec,
-- where Lune audits them.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local worldShared = ReplicatedStorage:WaitForChild("WorldShared")
local Config = require(worldShared:WaitForChild("Config"))
local SoldierBuild = require(worldShared:WaitForChild("SoldierBuild"))
local VillagerSpec = require(worldShared:WaitForChild("VillagerSpec"))

local Villagers = {}

local makePart = SoldierBuild.makePart

local MATERIALS: { [string]: Enum.Material } = {
	Fabric = Enum.Material.Fabric,
	WoodPlanks = Enum.Material.WoodPlanks,
	SmoothPlastic = Enum.Material.SmoothPlastic,
}
local SHAPES: { [string]: Enum.PartType } = {
	Block = Enum.PartType.Block,
	Ball = Enum.PartType.Ball,
	Cylinder = Enum.PartType.Cylinder,
}

local PAUSE_SECONDS = 3 -- a stop at each corner: errands, not laps

type Villager = {
	parts: { BasePart },
	offsets: { CFrame },
	route: { { x: number, z: number } },
	leg: number,
	progress: number,
	pausing: number,
	position: Vector3,
	facing: number,
}

local state: {
	folder: Folder?,
	villageId: string?,
	origin: CFrame,
	villagers: { Villager },
	connection: RBXScriptConnection?,
	hidden: boolean,
	mourning: VillagerSpec.MourningState?,
} = { folder = nil, villageId = nil, origin = CFrame.identity, villagers = {}, connection = nil, hidden = false, mourning = nil }

local function clearFolk()
	if state.connection then
		state.connection:Disconnect()
		state.connection = nil
	end
	if state.folder then
		state.folder:Destroy()
		state.folder = nil
	end
	state.villagers = {}
	state.villageId = nil
	state.hidden = false
end

local function villagerWorldCFrame(villager: Villager): CFrame
	return state.origin * CFrame.new(villager.position) * CFrame.Angles(0, villager.facing, 0)
end

local function tick(dt: number)
	local folder = state.folder
	if not folder or #state.villagers == 0 then
		return
	end
	local camera = workspace.CurrentCamera
	if camera then
		if (camera.CFrame.Position - state.origin.Position).Magnitude > VillagerSpec.SLEEP_DISTANCE + 140 then
			-- Villagers roam a whole street, so the park radius is measured
			-- from the village origin with the loop's reach added on.
			return
		end
	end
	local parts: { BasePart } = {}
	local cframes: { CFrame } = {}
	for _, villager in state.villagers do
		if villager.pausing > 0 then
			villager.pausing -= dt
		else
			local from = villager.route[villager.leg]
			local toIndex = (villager.leg % #villager.route) + 1
			local to = villager.route[toIndex]
			local legVector = Vector3.new(to.x - from.x, 0, to.z - from.z)
			local legLength = math.max(legVector.Magnitude, 0.01)
			villager.progress += (VillagerSpec.WALK_STUDS_PER_SECOND * dt) / legLength
			if villager.progress >= 1 then
				villager.progress = 0
				villager.leg = toIndex
				villager.pausing = PAUSE_SECONDS
				villager.position = Vector3.new(to.x, 0, to.z)
			else
				villager.position = Vector3.new(from.x, 0, from.z) + legVector * villager.progress
				villager.facing = math.atan2(legVector.X, legVector.Z)
			end
		end
		local root = villagerWorldCFrame(villager)
		for partIndex, bodyPart in villager.parts do
			table.insert(parts, bodyPart)
			table.insert(cframes, root * villager.offsets[partIndex])
		end
	end
	if #parts > 0 then
		workspace:BulkMoveTo(parts, cframes, Enum.BulkMoveMode.FireCFrameChanged)
	end
end

local function buildFolk(village: any)
	clearFolk()
	state.origin = CFrame.new(
		(tonumber(village.x) or 0) * Config.TILE_STUDS,
		0,
		(tonumber(village.y) or 0) * Config.TILE_STUDS
	)
	state.villageId = tostring(village.id)

	local folder = Instance.new("Folder")
	folder.Name = "VillageFolk"
	folder:SetAttribute("VisualPartBudget", VillagerSpec.BUDGET)
	local placed = 0
	for index, archetype in VillagerSpec.ARCHETYPES do
		local route = VillagerSpec.route(index)
		local villager: Villager = {
			parts = {},
			offsets = {},
			route = route,
			leg = 1,
			progress = 0,
			pausing = (index - 1) * 1.5,
			position = Vector3.new(route[1].x, 0, route[1].z),
			facing = 0,
		}
		local specs = VillagerSpec.frameSpecs(archetype)
		for _, propSpec in VillagerSpec.propSpecs(archetype) do
			table.insert(specs, propSpec)
		end
		for _, spec in specs do
			placed += 1
			assert(placed <= VillagerSpec.BUDGET, "the square exceeded its visual part budget")
			local bodyPart = makePart(
				Vector3.new(spec.sx, spec.sy, spec.sz),
				Color3.fromRGB(spec.r, spec.g, spec.b),
				folder,
				MATERIALS[spec.material] or Enum.Material.Fabric,
				SHAPES[spec.shape] or Enum.PartType.Block
			)
			bodyPart.Name = spec.name
			local offset = CFrame.new(spec.ox, spec.oy, spec.oz) * CFrame.Angles(spec.rx, spec.ry, spec.rz)
			table.insert(villager.parts, bodyPart)
			table.insert(villager.offsets, offset)
			bodyPart.CFrame = villagerWorldCFrame(villager) * offset
		end
		table.insert(state.villagers, villager)
	end
	folder:SetAttribute("VisualPartCount", placed)
	folder.Parent = workspace
	state.connection = RunService.Heartbeat:Connect(tick)
end

-- Called on every applied snapshot with the client's server-time seconds.
function Villagers.update(snapshot: any, nowSeconds: number)
	if not snapshot or not snapshot.kingdom then
		clearFolk()
		state.mourning = nil
		return
	end
	local myKingdomId = tostring(snapshot.kingdom.id)
	local mine: any = nil
	for _, village in ((snapshot.world and snapshot.world.villages) or {}) do
		if tostring(village.kingdomId) == myKingdomId and village.isCapital then
			mine = village
			break
		end
	end
	if not mine then
		clearFolk()
		state.mourning = nil
		return
	end

	-- Mourning is tracked from live power deltas (direction needs two
	-- observations); the decision itself is VillagerSpec's pure rule.
	local power = tonumber(mine.realmOfPower)
	if state.mourning == nil then
		state.mourning = VillagerSpec.newMourningState(power or 0)
	else
		state.mourning = VillagerSpec.updateMourning(state.mourning, power, nowSeconds)
	end

	-- A battle at MY gate empties my square: I am the defender there.
	local battleOpenAtHome = false
	for _, battle in (snapshot.battleSessions or {}) do
		if tostring(battle.status) == "open" and tostring(battle.defenderVillageId) == tostring(mine.id) then
			battleOpenAtHome = true
			break
		end
	end

	local hide = VillagerSpec.shouldHide(state.mourning :: VillagerSpec.MourningState, battleOpenAtHome, nowSeconds)
	if hide then
		if state.folder then
			clearFolk()
			state.hidden = true
		end
		return
	end
	if state.folder and tostring(mine.id) == state.villageId then
		return
	end
	buildFolk(mine)
end

return Villagers
