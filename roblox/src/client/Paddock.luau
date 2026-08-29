--!strict
-- The herd on the grass (slice 3). CLIENT-DRAWN, like the battle scene:
-- the owner's client renders its own paddock from its own snapshot, so
-- nothing replicates, foreign settlements stay fog shells by construction,
-- and a phone pays only for the horses its player actually owns.
--
-- Every part placed here comes from shared PaddockSpec - the same data
-- Lune audits - and the whole herd moves in ONE BulkMoveTo per frame, the
-- discipline the spike proved. No Humanoids, no physics, no TweenService
-- objects: an amble is a slow lerp between three fixed waypoints.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local worldShared = ReplicatedStorage:WaitForChild("WorldShared")
local Config = require(worldShared:WaitForChild("Config"))
local PaddockSpec = require(worldShared:WaitForChild("PaddockSpec"))
local SoldierBuild = require(worldShared:WaitForChild("SoldierBuild"))

local Paddock = {}

local makePart = SoldierBuild.makePart

local MATERIALS: { [string]: Enum.Material } = {
	Fabric = Enum.Material.Fabric,
	SmoothPlastic = Enum.Material.SmoothPlastic,
}
local SHAPES: { [string]: Enum.PartType } = {
	Block = Enum.PartType.Block,
	Ball = Enum.PartType.Ball,
	Cylinder = Enum.PartType.Cylinder,
}

-- The stable lot, exactly as SettlementBuilder places it. If the lot ever
-- moves there, the herd grazes on the road - which a 30-second Studio look
-- catches, and which is still better than a second copy of the layout
-- maths deciding where "the stable" is on its own.
local STABLE_AT = Vector3.new(115, 0, -60)
local STABLE_YAW = math.rad(-90)
local AMBLE_STUDS_PER_SECOND = 1.6
local GRAZE_SECONDS = 4 -- head-down pause at each waypoint
local SLEEP_DISTANCE = 120 -- villager LOD rule, applied early: park beyond this

type Horse = {
	parts: { BasePart },
	offsets: { CFrame },
	tailIndex: number,
	waypoints: { { x: number, z: number } },
	leg: number, -- waypoint we are walking toward
	progress: number, -- 0..1 along the current leg
	grazing: number, -- seconds left standing at the current point
	position: Vector3,
	facing: number,
}

local state: {
	folder: Folder?,
	villageId: string?,
	count: number,
	stableCFrame: CFrame,
	horses: { Horse },
	connection: RBXScriptConnection?,
} = { folder = nil, villageId = nil, count = 0, stableCFrame = CFrame.identity, horses = {}, connection = nil }

local function clearHerd()
	if state.connection then
		state.connection:Disconnect()
		state.connection = nil
	end
	if state.folder then
		state.folder:Destroy()
		state.folder = nil
	end
	state.horses = {}
	state.count = 0
	state.villageId = nil
end

local function horseWorldCFrame(horse: Horse): CFrame
	return state.stableCFrame * CFrame.new(horse.position) * CFrame.Angles(0, horse.facing, 0)
end

local function tick(dt: number)
	local folder = state.folder
	if not folder or #state.horses == 0 then
		return
	end
	local camera = workspace.CurrentCamera
	if camera then
		local anchor = state.stableCFrame.Position
		if (camera.CFrame.Position - anchor).Magnitude > SLEEP_DISTANCE then
			return -- parked: no part moves while nobody is close enough to see
		end
	end

	local parts: { BasePart } = {}
	local cframes: { CFrame } = {}
	for index, horse in state.horses do
		if horse.grazing > 0 then
			horse.grazing -= dt
		else
			local from = horse.waypoints[horse.leg]
			local toIndex = (horse.leg % #horse.waypoints) + 1
			local to = horse.waypoints[toIndex]
			local legVector = Vector3.new(to.x - from.x, 0, to.z - from.z)
			local legLength = math.max(legVector.Magnitude, 0.01)
			horse.progress += (AMBLE_STUDS_PER_SECOND * dt) / legLength
			if horse.progress >= 1 then
				horse.progress = 0
				horse.leg = toIndex
				horse.grazing = GRAZE_SECONDS + (index % 3)
				horse.position = Vector3.new(to.x, 0, to.z)
			else
				horse.position = Vector3.new(from.x, 0, from.z) + legVector * horse.progress
				horse.facing = math.atan2(legVector.X, legVector.Z)
			end
		end
		-- Tail flick: a small periodic sway on one part's offset. The clock
		-- is the horse's own walk state, not os.clock - deterministic enough
		-- for a movie and free of wall-time reads.
		local root = horseWorldCFrame(horse)
		local flick = math.sin((horse.progress + horse.grazing) * 3 + index) * math.rad(14)
		for partIndex, part in horse.parts do
			local offset = horse.offsets[partIndex]
			if partIndex == horse.tailIndex then
				offset = offset * CFrame.Angles(0, 0, flick)
			end
			table.insert(parts, part)
			table.insert(cframes, root * offset)
		end
	end
	if #parts > 0 then
		workspace:BulkMoveTo(parts, cframes, Enum.BulkMoveMode.FireCFrameChanged)
	end
end

local function buildHerd(village: any, count: number)
	clearHerd()
	if count <= 0 then
		return
	end
	local origin = CFrame.new(
		(tonumber(village.x) or 0) * Config.TILE_STUDS,
		0,
		(tonumber(village.y) or 0) * Config.TILE_STUDS
	)
	state.stableCFrame = origin * CFrame.new(STABLE_AT) * CFrame.Angles(0, STABLE_YAW, 0)
	state.villageId = tostring(village.id)
	state.count = count

	local folder = Instance.new("Folder")
	folder.Name = "PaddockHerd"
	folder:SetAttribute("VisualPartBudget", PaddockSpec.BUDGET)
	local placed = 0
	for index = 1, count do
		local waypoints = PaddockSpec.waypoints(index)
		local horse: Horse = {
			parts = {},
			offsets = {},
			tailIndex = 0,
			waypoints = waypoints,
			leg = 1,
			progress = 0,
			grazing = (index % 4) * 1.5,
			position = Vector3.new(waypoints[1].x, 0, waypoints[1].z),
			facing = math.rad((index * 45) % 360),
		}
		for _, spec in PaddockSpec.horseSpecs(index) do
			placed += 1
			assert(placed <= PaddockSpec.BUDGET, "the paddock exceeded its visual part budget")
			local part = makePart(
				Vector3.new(spec.sx, spec.sy, spec.sz),
				Color3.fromRGB(spec.r, spec.g, spec.b),
				folder,
				MATERIALS[spec.material] or Enum.Material.SmoothPlastic,
				SHAPES[spec.shape] or Enum.PartType.Block
			)
			part.Name = spec.name
			local offset = CFrame.new(spec.ox, spec.oy, spec.oz) * CFrame.Angles(spec.rx, spec.ry, spec.rz)
			table.insert(horse.parts, part)
			table.insert(horse.offsets, offset)
			if spec.name == "Tail" then
				horse.tailIndex = #horse.parts
			end
			part.CFrame = horseWorldCFrame(horse) * offset
		end
		table.insert(state.horses, horse)
	end
	folder:SetAttribute("VisualPartCount", placed)
	folder.Parent = workspace
	state.folder = folder
	state.connection = RunService.Heartbeat:Connect(tick)
end

-- Called on every applied snapshot. Rebuilds only when the DISPLAYED count
-- or the village changes - a herd of 72 and a herd of 80 are both six
-- horses on the grass, and six horses do not blink.
function Paddock.update(snapshot: any)
	if not snapshot or not snapshot.kingdom then
		clearHerd()
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
		clearHerd()
		return
	end
	local count = PaddockSpec.displayCount(tonumber(mine.horses))
	if count == state.count and tostring(mine.id) == state.villageId then
		return
	end
	buildHerd(mine, count)
end

return Paddock
