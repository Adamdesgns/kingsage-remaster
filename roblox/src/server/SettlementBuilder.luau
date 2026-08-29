--!strict
-- Region renderer: EVERY village in the snapshot becomes a real place at its
-- map-derived position, with walkable wilderness between them (spec §4).
-- Workspace receives only fog-of-war silhouettes (walls + generic keep + name
-- — never levels, never prompts). Owner detail is built in ServerStorage and
-- copied through the owner's private PlayerGui only. Positions come from map
-- coords, not sessions: the world
-- looks the same every join. Grey boxes only (spec §7).
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")

local worldShared = ReplicatedStorage:WaitForChild("WorldShared")
local Buildings = require(worldShared:WaitForChild("Buildings"))
local Config = require(worldShared:WaitForChild("Config"))
local MarketRowSpec = require(worldShared:WaitForChild("MarketRowSpec"))
local WorldStyle = require(script.Parent:WaitForChild("WorldStyle"))
local PALETTE = WorldStyle.PALETTE
local MATERIAL = WorldStyle.MATERIAL

local SettlementBuilder = {}

-- Shared with the battle scene, which has to form up on the same ground.
local TILE = Config.TILE_STUDS
local WALL_HALF = Config.WALL_HALF
local MAX_BUILDING_LEVEL = 20
local MAX_LEVEL_GROWTH = 1 + MAX_BUILDING_LEVEL * 0.010
local ANNEX_WIDTH = 10
local ANNEX_DEPTH = 8
-- Includes the annex roof's three-stud overhang. These constants are also used
-- by the analytical lot check below, so the level-20 art cannot silently grow
-- through its neighbour when somebody adjusts a footprint.
local ANNEX_SIDE_REACH = ANNEX_WIDTH + 3
local ANNEX_REAR_REACH = ANNEX_DEPTH + 3
local LOT_CLEARANCE = 4

-- Fixed layout inside a settlement: gate faces +Z (south); main street runs
-- gate -> keep; economy row west, military row east, academy north.
-- Where each building stands, in studs from the settlement centre.
--
-- EVERYTHING HERE IS SIZED OFF THE CHARACTER. [Adam, 2026-08-23] "Can you base
-- the size of this off the scale of the damn characters." A Roblox character is
-- about 5 studs tall, so: a doorway is 8, a cottage wall is 12, a two-storey
-- building is 20, and a keep is 34. Before this the barracks stood 48 studs to
-- the ridge - nearly ten characters - which is why it read as a monument rather
-- than a building.
type Placement = {
	at: Vector3,
	yaw: number,
}

-- Front is local +Z. Every yaw below turns that front toward the lane or civic
-- space that actually serves the building. The previous world placed every
-- doorway south, including the workshops along east/west streets.
local LAYOUT: { [string]: Placement } = {
	-- WarTable owns settlement-local (0, 0, 16); keeping the hall at z=20
	-- leaves the table four studs behind its centre with a clear aisle.
	hq = { at = Vector3.new(0, 0, 20), yaw = 0 },
	-- The first four working buildings flank the arrival route instead of
	-- hiding against the curtain wall. Their open fronts, stalls and rooflines
	-- now form the human-scale foreground before the keep becomes a landmark.
	market = { at = Vector3.new(-60, 0, 144), yaw = 90 },
	warehouse = { at = Vector3.new(60, 0, 144), yaw = -90 },
	barracks = { at = Vector3.new(70, 0, 45), yaw = -90 },
	stable = { at = Vector3.new(115, 0, -60), yaw = -90 },
	workshop = { at = Vector3.new(115, 0, -154), yaw = -90 },
	smithy = { at = Vector3.new(48, 0, -95), yaw = 0 },
	timber = { at = Vector3.new(-70, 0, 45), yaw = 90 },
	quarry = { at = Vector3.new(-115, 0, -42), yaw = 90 },
	iron = { at = Vector3.new(-115, 0, -127), yaw = 90 },
	farm = { at = Vector3.new(-35, 0, -90), yaw = 0 },
	academy = { at = Vector3.new(0, 0, -160), yaw = 0 },
	wall = { at = Vector3.new(-165, 0, 150), yaw = 90 },
}

-- What each building actually IS, rather than "a box whose height is its level".
--
-- [Adam, 2026-08-23] "that's retarded to build them tall. No I want you to turn
-- those into actual building."
--
-- He is right. Height-as-level made a level 30 Farm a 66-stud tower, which is
-- not a farm, and made every building identical apart from how far up it went.
-- Now each type has its own footprint, its own wall height and its own roof,
-- and LEVEL widens the compound instead of stretching it into the sky. Only a
-- keep and an academy are supposed to be tall.
type BuildingSpec = {
	w: number,
	d: number,
	h: number,
	roof: number,
	wall: Color3,
	wallMat: Enum.Material,
	roofColour: Color3,
	roofMat: Enum.Material,
	timbered: boolean,
	chimney: boolean,
}

local function spec(
	w: number, d: number, h: number, roof: number,
	wall: Color3, wallMat: Enum.Material,
	roofColour: Color3, roofMat: Enum.Material,
	timbered: boolean, chimney: boolean
): BuildingSpec
	return {
		w = w, d = d, h = h, roof = roof,
		wall = wall, wallMat = wallMat,
		roofColour = roofColour, roofMat = roofMat,
		timbered = timbered, chimney = chimney,
	}
end

-- Each building is a different KIND of place, not the same box in a different
-- size. Heights are in CHARACTERS: 12 studs is roughly a two-and-a-half-
-- character cottage wall, 34 is a three-storey keep. Nothing here is taller
-- than it would be if you stood next to it.
local SPEC: { [string]: BuildingSpec } = {
	-- A broad eighteen-stud hall keeps the WarTable interior intact while
	-- dropping the eave below the player's sightline. The crossing tower still
	-- provides the civic landmark; the facade no longer fills the whole frame.
	hq        = spec(36, 34, 18,  9, PALETTE.stone,       MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, true),
	academy   = spec(34, 34, 26, 12, PALETTE.stoneWarm,   MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, false),
	barracks  = spec(64, 28, 15,  9, PALETTE.stoneWarm,   MATERIAL.plaster, PALETTE.roofTile,  MATERIAL.roof,   true,  true),
	stable    = spec(58, 26, 13,  8, PALETTE.plaster,     MATERIAL.plaster, PALETTE.thatch,    MATERIAL.thatch, true,  false),
	workshop  = spec(44, 32, 15,  9, PALETTE.stoneWarm,   MATERIAL.plaster, PALETTE.roofTile,  MATERIAL.roof,   true,  false),
	smithy    = spec(32, 28, 14,  8, PALETTE.stoneDark,   MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, true),
	warehouse = spec(48, 36, 18, 10, PALETTE.plaster,     MATERIAL.plaster, PALETTE.roofTile,  MATERIAL.roof,   true,  false),
	market    = spec(44, 36, 13,  8, PALETTE.plaster,     MATERIAL.plaster, PALETTE.roofTile,  MATERIAL.roof,   true,  false),
	farm      = spec(54, 38, 12,  8, PALETTE.plaster,     MATERIAL.plaster, PALETTE.thatch,    MATERIAL.thatch, true,  true),
	timber    = spec(48, 30, 12,  8, PALETTE.timberLight, MATERIAL.timber,  PALETTE.thatch,    MATERIAL.thatch, false, false),
	quarry    = spec(44, 30, 11,  7, PALETTE.stone,       MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, false),
	iron      = spec(44, 30, 11,  7, PALETTE.stoneDark,   MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, true),
	wall      = spec(34, 24, 13,  8, PALETTE.stone,       MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, false),
}

type LotBounds = { x: number, z: number }

local function lotBounds(building: string): LotBounds
	local sp = SPEC[building]
	local placement = LAYOUT[building]
	assert(sp ~= nil and placement ~= nil, "Every building needs a spec and placement")
	local localX = sp.w * MAX_LEVEL_GROWTH / 2 + ANNEX_SIDE_REACH
	local localZ = sp.d * MAX_LEVEL_GROWTH / 2 + ANNEX_REAR_REACH
	if math.abs(placement.yaw) % 180 == 90 then
		return { x = localZ, z = localX }
	end
	return { x = localX, z = localZ }
end

-- A production guard, not a comment pretending the layout is safe. It proves
-- the largest supported version of every building, all four annexes and their
-- roof overhangs fit inside the wall and do not overlap another reserved lot.
-- If a future footprint breaks that promise, the server fails at startup with
-- the two names involved instead of shipping intersecting architecture.
local function validateLayout()
	for nameA, placementA in LAYOUT do
		local boundsA = lotBounds(nameA)
		assert(math.abs(placementA.at.X) + boundsA.x <= WALL_HALF - 6,
			string.format("%s level-20 lot crosses the east/west wall", nameA))
		assert(math.abs(placementA.at.Z) + boundsA.z <= WALL_HALF - 6,
			string.format("%s level-20 lot crosses the north/south wall", nameA))
		for nameB, placementB in LAYOUT do
			if nameA < nameB then
				local boundsB = lotBounds(nameB)
				local clearX = math.abs(placementA.at.X - placementB.at.X)
					>= boundsA.x + boundsB.x + LOT_CLEARANCE
				local clearZ = math.abs(placementA.at.Z - placementB.at.Z)
					>= boundsA.z + boundsB.z + LOT_CLEARANCE
				assert(clearX or clearZ,
					string.format("level-20 lots overlap: %s and %s", nameA, nameB))
			end
		end
	end
end

validateLayout()


local settlementsFolder = Instance.new("Folder")
settlementsFolder.Name = "Settlements"
settlementsFolder.Parent = workspace

-- Detailed settlement geometry is never parented under a replicated service.
-- It is a server-only render source serialized only to the entitled owner.
local detailsFolder = Instance.new("Folder")
detailsFolder.Name = "SettlementDetails"
detailsFolder.Parent = ServerStorage

-- RespawnLocation must reference Workspace. These transparent gate anchors
-- disclose no building/level information and are the only owner-runtime parts
-- retained outside the fog-safe shells.
local spawnFolder = Instance.new("Folder")
spawnFolder.Name = "SettlementSpawns"
spawnFolder.Parent = workspace

local wildernessFolder = Instance.new("Folder")
wildernessFolder.Name = "Wilderness"
wildernessFolder.Parent = workspace

type DetailEntry = {
	model: Model,
	stateVersion: number,
	levels: { [string]: number },
	ownerUserId: number,
}

type Entry = {
	-- The fog-safe shell always exists. A separate detail model may exist while
	-- its owner is present; the client selects exactly one visual layer.
	shell: Model,
	detail: DetailEntry?,
	origin: CFrame,
	villageName: string,
	kingdomName: string,
	kingdomColor: Color3,
}

local rendered: { [string]: Entry } = {}
local playerVillageIds: { [Player]: { string } } = {}
local teleported: { [Player]: boolean } = {}
-- Where each present player belongs when they are lost. See the rescue loop.
local gateLanding: { [Player]: CFrame } = {}
local wildernessBuilt = false

local function greyPart(name: string, size: Vector3, cframe: CFrame, parent: Instance, color: Color3?): Part
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.CFrame = cframe
	part.Anchored = true
	part.Color = color or Color3.fromRGB(120, 120, 120)
	part.Material = Enum.Material.Concrete
	part.Parent = parent
	return part
end

local function decorative(part: BasePart): BasePart
	part:SetAttribute("Decorative", true)
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.CastShadow = false
	return part
end

-- A surface-bound identity mark. SurfaceGui obeys depth and lives on masonry;
-- unlike a BillboardGui it cannot announce a building through three walls.
local function labelFor(part: BasePart, text: string)
	local existing = part:FindFirstChild("NameSurface")
	if existing then
		local label = (existing :: Instance):FindFirstChildOfClass("TextLabel")
		if label then
			label.Text = text
		end
		return
	end
	local surface = Instance.new("SurfaceGui")
	surface.Name = "NameSurface"
	surface.Face = Enum.NormalId.Back -- local +Z, the street-facing facade
	surface.AlwaysOnTop = false
	surface.LightInfluence = 0.3
	surface.CanvasSize = Vector2.new(720, 180)
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(0.9, 0.72)
	label.Position = UDim2.fromScale(0.05, 0.14)
	label.BackgroundTransparency = 0.14
	label.BackgroundColor3 = Color3.fromRGB(45, 31, 22)
	label.TextColor3 = Color3.fromRGB(235, 220, 186)
	label.TextScaled = true
	label.TextWrapped = true
	label.Font = Enum.Font.GothamMedium
	label.Text = text
	label.Parent = surface
	surface.Parent = part
end

local function villageOrigin(village: any): CFrame
	return CFrame.new((tonumber(village.x) or 0) * TILE, 0, (tonumber(village.y) or 0) * TILE)
end

local function kingdomInfo(snapshot: any, kingdomId: string): (string, Color3)
	local kingdoms = snapshot and snapshot.world and snapshot.world.kingdoms
	if typeof(kingdoms) == "table" then
		for _, kingdom in kingdoms do
			if kingdom.id == kingdomId then
				local color = Color3.fromRGB(150, 150, 150)
				local ok, parsed = pcall(Color3.fromHex, tostring(kingdom.color))
				if ok then
					color = parsed
				end
				return tostring(kingdom.name), color
			end
		end
	end
	return "Unknown realm", Color3.fromRGB(150, 150, 150)
end

local function gateHalf(): number
	return 11 -- a 22-stud gate: four characters abreast
end

-- Permanent street furniture is part of the owned presentation layer, never
-- the fog-safe shell. Every piece is collisionless, deterministic and counted
-- against one explicit phone budget. It gives even a level-one village the
-- visual cadence of a working place without inventing villagers or gameplay.
local STREET_DETAIL_BUDGET = 80
local function renderStreetscape(model: Model, origin: CFrame): number
	local madeCount = 0
	local function addDetail(
		name: string,
		size: Vector3,
		offset: CFrame,
		colour: Color3,
		material: Enum.Material
	): Part
		madeCount += 1
		assert(madeCount <= STREET_DETAIL_BUDGET, "streetscape exceeded visual part budget")
		local made = WorldStyle.part(name, size, origin * offset, model, colour, material)
		made:SetAttribute("StreetscapeDetail", true)
		decorative(made)
		return made
	end

	local streetLength = WALL_HALF * 2 - 20
	for _, side in { -1, 1 } do
		addDetail("StreetShoulder", Vector3.new(4, 0.42, streetLength),
			CFrame.new(side * 14, 0.22, 0), PALETTE.pathEdge, MATERIAL.dirt)
		addDetail("StreetShoulder", Vector3.new(streetLength, 0.42, 4),
			CFrame.new(0, 0.22, side * 12), PALETTE.pathEdge, MATERIAL.dirt)
	end

	-- Thin, irregular traffic wear over the cobble breaks up the single clean
	-- strip while remaining flat enough never to affect character movement.
	for index, patch in {
		{ -5, 165, 8, 18, -11 }, { 5, 139, 7, 15, 9 },
		{ -4, 111, 6, 14, 6 }, { 4, 84, 8, 17, -8 },
		{ -5, 54, 7, 13, 12 }, { 5, 28, 6, 15, -5 },
		{ -4, -34, 7, 17, 8 }, { 4, -74, 6, 14, -10 },
	} do
		local mark = addDetail("RoadWear" .. index, Vector3.new(0.12, patch[3], patch[4]),
			CFrame.new(patch[1], 0.64, patch[2])
				* CFrame.Angles(0, math.rad(patch[5]), 0)
				* CFrame.Angles(0, 0, math.rad(90)),
			PALETTE.dirt, MATERIAL.dirt)
		mark.Shape = Enum.PartType.Cylinder
	end

	-- Low roadside fences frame the route without becoming barriers. Their
	-- open rhythm keeps the arrival view aimed at doors, roofs and the keep.
	for _, side in { -1, 1 } do
		for _, centreZ in { 112, 82, 52 } do
			local x = side * 27
			for _, endZ in { -8, 8 } do
				addDetail("FencePost", Vector3.new(1.25, 4.4, 1.25),
					CFrame.new(x, 2.2, centreZ + endZ), PALETTE.timberDark, MATERIAL.timber)
			end
			for _, railY in { 1.7, 3.2 } do
				addDetail("FenceRail", Vector3.new(1, 0.8, 16),
					CFrame.new(x, railY, centreZ), PALETTE.timber, MATERIAL.timber)
			end
		end
	end

	-- Stone trough-planters and varied shrubs soften the wall-to-road geometry.
	for index, position in {
		Vector3.new(-19, 0, 133), Vector3.new(19, 0, 123),
		Vector3.new(-19, 0, 96), Vector3.new(19, 0, 89),
		Vector3.new(-19, 0, 64), Vector3.new(19, 0, 57),
	} do
		addDetail("StreetPlanter", Vector3.new(5.2, 1.3, 5.2),
			CFrame.new(position.X, 0.65, position.Z), PALETTE.stoneWarm, MATERIAL.stone)
		local shrub = addDetail("StreetShrub", Vector3.new(4.2 + index % 2, 3.6, 4.2 + index % 2),
			CFrame.new(position.X, 2.6, position.Z),
			if index % 3 == 0 then PALETTE.moss else PALETTE.foliage, MATERIAL.grass)
		shrub.Shape = Enum.PartType.Ball
		local sideOffset = if index % 2 == 0 then -1.5 else 1.5
		local shrubCluster = addDetail("StreetShrubCluster", Vector3.new(3.1, 2.8, 3.1),
			CFrame.new(position.X + sideOffset, 2.9, position.Z + sideOffset * 0.45),
			if index % 3 == 0 then PALETTE.foliage else PALETTE.moss, MATERIAL.grass)
		shrubCluster.Shape = Enum.PartType.Ball
	end

	-- Two inward-facing benches make the keep court feel used while keeping the
	-- full central aisle clear for the WarTable route and interaction prompts.
	for _, side in { -1, 1 } do
		local x = side * 33
		addDetail("CourtBenchSeat", Vector3.new(2.5, 0.8, 9),
			CFrame.new(x, 2.1, 69), PALETTE.timberLight, MATERIAL.timber)
		addDetail("CourtBenchBack", Vector3.new(0.8, 3.2, 9),
			CFrame.new(x + side * 1.1, 3.4, 69), PALETTE.timber, MATERIAL.timber)
		for _, zOffset in { -3.2, 3.2 } do
			addDetail("CourtBenchLeg", Vector3.new(1.1, 2, 1.1),
				CFrame.new(x, 1, 69 + zOffset), PALETTE.timberDark, MATERIAL.timber)
		end
	end

	-- Shallow interior buttresses give the long curtain walls a load-bearing
	-- cadence. They remain decorative, so pathing and wall collision are exactly
	-- the same as the audited shell.
	for _, x in { -120, -40, 40, 120 } do
		addDetail("WallButtress", Vector3.new(4, 10, 6),
			CFrame.new(x, 5, -WALL_HALF + 4.2), PALETTE.stoneDark, MATERIAL.stone)
	end
	for _, x in { -120, -70, 70, 120 } do
		addDetail("WallButtress", Vector3.new(4, 10, 6),
			CFrame.new(x, 5, WALL_HALF - 4.2), PALETTE.stoneDark, MATERIAL.stone)
	end
	for _, z in { -120, -40, 40, 120 } do
		for _, side in { -1, 1 } do
			addDetail("WallButtress", Vector3.new(6, 10, 4),
				CFrame.new(side * (WALL_HALF - 4.2), 5, z), PALETTE.stoneDark, MATERIAL.stone)
		end
	end

	model:SetAttribute("StreetscapePartCount", madeCount)
	model:SetAttribute("StreetscapePartBudget", STREET_DETAIL_BUDGET)
	return madeCount
end

--- A curtain wall with battlements, corner towers and a gatehouse.
---
--- Four flat slabs are a fence. Crenellations, towers and an arched gate are
--- what make a settlement read as fortified — and they are also the thing an
--- attacker is looking at when the Rampart level matters.
local function renderShellWalls(model: Model, origin: CFrame, detailed: boolean)
	local ground = WorldStyle.part("Ground", Vector3.new(WALL_HALF * 2 + 40, 4, WALL_HALF * 2 + 40),
		origin * CFrame.new(0, -2, 0), model, PALETTE.grass, MATERIAL.grass)
	ground.CastShadow = false
	model:SetAttribute("Detailed", detailed)

	-- A curtain wall about three characters high. It should read as something
	-- you cannot climb, not as a cliff.
	local wallHeight, wallThickness = 15, 5
	local gateGap = gateHalf() * 2

	local function crenellate(centreX: number, centreZ: number, spanX: number, spanZ: number)
		-- Merlons along the top: the notched profile of a battlement.
		local along = if spanX > spanZ then spanX else spanZ
		-- A foreign silhouette is often one of several villages in memory. It
		-- keeps the crenellated read at one third of the owned part cost.
		local step = if detailed then 12 else 30
		local count = math.max(1, math.floor(along / step))
		local actualStep = along / count
		for index = 0, count - 1 do
			local offset = -along / 2 + actualStep / 2 + index * actualStep
			local x = if spanX > spanZ then centreX + offset else centreX
			local z = if spanX > spanZ then centreZ else centreZ + offset
			local merlon = WorldStyle.part("Merlon", Vector3.new(
					if spanX > spanZ then math.min(5, actualStep * 0.5) else wallThickness,
					3,
					if spanX > spanZ then wallThickness else math.min(5, actualStep * 0.5)),
				origin * CFrame.new(x, wallHeight + 1.5, z), model, PALETTE.stone, MATERIAL.stone)
			decorative(merlon)
		end
	end

	local function segment(name: string, size: Vector3, at: CFrame)
		WorldStyle.part(name, size, at, model, PALETTE.stone, MATERIAL.stone)
	end

	segment("WallN", Vector3.new(WALL_HALF * 2, wallHeight, wallThickness), origin * CFrame.new(0, wallHeight / 2, -WALL_HALF))
	segment("WallW", Vector3.new(wallThickness, wallHeight, WALL_HALF * 2), origin * CFrame.new(-WALL_HALF, wallHeight / 2, 0))
	segment("WallE", Vector3.new(wallThickness, wallHeight, WALL_HALF * 2), origin * CFrame.new(WALL_HALF, wallHeight / 2, 0))
	crenellate(0, -WALL_HALF, WALL_HALF * 2, wallThickness)
	crenellate(-WALL_HALF, 0, wallThickness, WALL_HALF * 2)
	crenellate(WALL_HALF, 0, wallThickness, WALL_HALF * 2)

	local southSegment = (WALL_HALF * 2 - gateGap) / 2
	segment("WallS1", Vector3.new(southSegment, wallHeight, wallThickness),
		origin * CFrame.new(-(gateGap / 2 + southSegment / 2), wallHeight / 2, WALL_HALF))
	segment("WallS2", Vector3.new(southSegment, wallHeight, wallThickness),
		origin * CFrame.new(gateGap / 2 + southSegment / 2, wallHeight / 2, WALL_HALF))
	crenellate(-(gateGap / 2 + southSegment / 2), WALL_HALF, southSegment, wallThickness)
	crenellate(gateGap / 2 + southSegment / 2, WALL_HALF, southSegment, wallThickness)

	local function towerCrown(x: number, z: number, towerSize: number, towerHeight: number, prefix: string)
		decorative(WorldStyle.part(prefix .. "Parapet", Vector3.new(towerSize + 2, 1.5, towerSize + 2),
			origin * CFrame.new(x, towerHeight + 0.75, z), model, PALETTE.stoneWarm, MATERIAL.stone))
		local edge = towerSize / 2 - 1.7
		local positions = {
			Vector2.new(-edge, -edge), Vector2.new(0, -edge), Vector2.new(edge, -edge), Vector2.new(edge, 0),
			Vector2.new(edge, edge), Vector2.new(0, edge), Vector2.new(-edge, edge), Vector2.new(-edge, 0),
		}
		for index, merlonPosition in positions do
			if detailed or index % 2 == 1 then
				decorative(WorldStyle.part(prefix .. "Merlon", Vector3.new(3.5, 3.2, 3.5),
					origin * CFrame.new(x + merlonPosition.X, towerHeight + 2.35, z + merlonPosition.Y),
					model, PALETTE.stone, MATERIAL.stone))
			end
		end
	end

	-- Late-medieval square corner towers. The old cylinders with ball caps read
	-- as toy chess pieces and had no relationship to the curtain wall.
	for _, sx in { -1, 1 } do
		for _, sz in { -1, 1 } do
			local towerHeight, towerSize = wallHeight + 10, 18
			WorldStyle.part("SquareTower", Vector3.new(towerSize, towerHeight, towerSize),
				origin * CFrame.new(sx * WALL_HALF, towerHeight / 2, sz * WALL_HALF), model, PALETTE.stone, MATERIAL.stone)
			towerCrown(sx * WALL_HALF, sz * WALL_HALF, towerSize, towerHeight, "Tower")
		end
	end

	-- The gatehouse's square towers stop exactly at x = +/-11, preserving the
	-- full 22-stud clear opening used by riders and the GateSpawn approach.
	for _, sx in { -1, 1 } do
		local towerSize, towerHeight = 16, wallHeight + 14
		local towerX = sx * (gateGap / 2 + towerSize / 2)
		WorldStyle.part("GateTower", Vector3.new(towerSize, towerHeight, towerSize),
			origin * CFrame.new(towerX, towerHeight / 2, WALL_HALF), model, PALETTE.stoneDark, MATERIAL.stone)
		towerCrown(towerX, WALL_HALF, towerSize, towerHeight, "GateTower")
	end

	-- Seven collisionless voussoirs describe a real arch without putting a
	-- rectangular lintel through the opening. The flanking towers remain the
	-- only solid parts beside the passage.
	local archRadius, archSpring, archSegments = gateGap / 2 + 2, 8.5, 7
	for index = 0, archSegments - 1 do
		local theta = math.pi * index / (archSegments - 1)
		local arch = WorldStyle.part("GateArchSegment", Vector3.new(6.2, 3.4, wallThickness + 2),
			origin
				* CFrame.new(math.cos(theta) * archRadius, archSpring + math.sin(theta) * archRadius, WALL_HALF)
				* CFrame.Angles(0, 0, theta - math.pi / 2),
			model, PALETTE.stoneWarm, MATERIAL.stone)
		arch:SetAttribute("ArchSegment", true)
		decorative(arch)
	end
	local banner = WorldStyle.part("GateBanner", Vector3.new(6, 10, 0.4),
		origin * CFrame.new(0, wallHeight + 11, WALL_HALF + wallThickness / 2 + 0.5), model, PALETTE.banner, MATERIAL.cloth)
	decorative(banner)

	-- Owned-settlement arrival detail. Foreign shells keep the same honest wall
	-- massing without multiplying lights and decorative parts across the region.
	if detailed then
		for _, sx in { -1, 1 } do
			local towerX = sx * (gateGap / 2 + 8)
			local slit = WorldStyle.part("GateArrowSlit", Vector3.new(1.4, 6, 0.45),
				origin * CFrame.new(towerX, wallHeight + 2, WALL_HALF + 8.25), model, PALETTE.window, MATERIAL.iron)
			decorative(slit)
			local towerBanner = WorldStyle.part("GateTowerBanner", Vector3.new(4, 9, 0.35),
				origin * CFrame.new(towerX, wallHeight + 7, WALL_HALF + 8.35), model, PALETTE.banner, MATERIAL.cloth)
			decorative(towerBanner)
		end
		local lantern = WorldStyle.part("GateLantern", Vector3.new(4, 4, 1),
			origin * CFrame.new(0, wallHeight - 1, WALL_HALF + wallThickness / 2 + 0.8), model, PALETTE.bannerGold, MATERIAL.iron)
		decorative(lantern)
		WorldStyle.pointLight(lantern, PALETTE.warmLight, 1.6, 42)
	end

	-- Fixed lanes and civic spaces make the settlement read as one place rather
	-- than buildings dropped on grass. Foreign villages omit all internal road
	-- geometry because fog only promises their exterior silhouette.
	if detailed then
		local streetLength = WALL_HALF * 2 - 20
		local street = WorldStyle.part("StreetMain", Vector3.new(24, 0.6, streetLength),
			origin * CFrame.new(0, 0.3, 0), model, PALETTE.cobbleLight, MATERIAL.road)
		street.CastShadow = false
		local cross = WorldStyle.part("StreetCross", Vector3.new(streetLength, 0.6, 20),
			origin * CFrame.new(0, 0.3, 0), model, PALETTE.road, MATERIAL.road)
		cross.CastShadow = false
		local paving = {
			{ "GateCourt", Vector3.new(74, 0.55, 50), Vector3.new(0, 0.32, 147) },
			{ "KeepPlaza", Vector3.new(82, 0.55, 44), Vector3.new(0, 0.32, 61) },
			{ "LaneWest", Vector3.new(11, 0.5, 205), Vector3.new(-42, 0.31, -2) },
			{ "LaneEast", Vector3.new(11, 0.5, 205), Vector3.new(42, 0.31, -2) },
			{ "LaneNorth", Vector3.new(170, 0.5, 11), Vector3.new(0, 0.31, -94) },
			{ "RampartLane", Vector3.new(110, 0.5, 9), Vector3.new(-88, 0.31, 130) },
		}
		for _, path in paving do
			local lane = WorldStyle.part(path[1] :: string, path[2] :: Vector3,
				origin * CFrame.new(path[3] :: Vector3), model, PALETTE.cobbleDark, MATERIAL.road)
			lane.CastShadow = false
		end
		renderStreetscape(model, origin)

		-- A spawn is entitlement-bearing state. It exists only in a detailed,
		-- owned settlement; a foreign silhouette can never become a respawn target.
		local spawn = Instance.new("SpawnLocation")
		spawn.Name = "GateSpawn"
		spawn.Size = Vector3.new(10, 1, 10)
		spawn.CFrame = origin * CFrame.new(0, 0.8, WALL_HALF - 16)
		spawn.Anchored = true
		spawn.Neutral = false
		spawn.Enabled = true
		spawn.Duration = 0
		spawn.Transparency = 1
		spawn.CanCollide = false
		spawn.CanTouch = false
		spawn.CanQuery = false
		spawn.Parent = model
	end
end

-- Foreign silhouette: what a traveler may know from OUTSIDE the walls — the
-- walls, a generic keep massing (fixed size: implies nothing), and the name.
-- Never levels, never interiors, never prompts (fog-of-war, spec §4).
local function renderShell(villageId: string, origin: CFrame, villageName: string, kingdomName: string, kingdomColor: Color3): Model
	local model = Instance.new("Model")
	model.Name = "Settlement_" .. villageId
	model:SetAttribute("VillageId", villageId)
	model:SetAttribute("Foreign", true)
	model:SetAttribute("VisibilityLayer", "Shell")
	model:SetAttribute("FogSafe", true)
	renderShellWalls(model, origin, false)
	-- A fixed, layered silhouette: readable as a keep at distance but carrying
	-- no level, building inventory or private state. Stepped massing replaces
	-- the old single cube without turning every foreign village into a full draw.
	WorldStyle.part("KeepPlinth", Vector3.new(62, 2, 62),
		origin * CFrame.new(0, 1, 0), model, PALETTE.stoneWarm, MATERIAL.stone)
	WorldStyle.part("KeepMassing", Vector3.new(48, 30, 48),
		origin * CFrame.new(0, 16, 0), model, PALETTE.stoneDark, MATERIAL.stone)
	WorldStyle.part("KeepUpper", Vector3.new(30, 14, 30),
		origin * CFrame.new(0, 38, 0), model, PALETTE.stone, MATERIAL.stone)
	decorative(WorldStyle.part("KeepCrown", Vector3.new(34, 2, 34),
		origin * CFrame.new(0, 46, 0), model, PALETTE.stoneWarm, MATERIAL.stone))
	for _, corner in {
		Vector2.new(-13, -13), Vector2.new(13, -13), Vector2.new(13, 13), Vector2.new(-13, 13),
	} do
		decorative(WorldStyle.part("KeepMerlon", Vector3.new(4, 4, 4),
			origin * CFrame.new(corner.X, 49, corner.Y), model, PALETTE.stone, MATERIAL.stone))
	end
	for _, x in { -8, 8 } do
		decorative(WorldStyle.part("ForeignArrowSlit", Vector3.new(2, 6, 0.4),
			origin * CFrame.new(x, 38, 15.25), model, PALETTE.window, MATERIAL.glass))
	end
	local identity = WorldStyle.part("IdentityPlaque", Vector3.new(30, 6, 0.8),
		origin * CFrame.new(0, 18, 24.5), model, PALETTE.timberDark, MATERIAL.timber)
	decorative(identity)
	labelFor(identity, villageName .. "  ·  " .. kingdomName)
	local bannerPost = WorldStyle.part("BannerPost", Vector3.new(1.2, 26, 1.2),
		origin * CFrame.new(0, 13, WALL_HALF + 12), model, PALETTE.timberDark, MATERIAL.timber)
	decorative(bannerPost)
	local foreignBanner = WorldStyle.part("ForeignBanner", Vector3.new(7, 11, 0.35),
		origin * CFrame.new(3.8, 19, WALL_HALF + 12), model, kingdomColor, MATERIAL.cloth)
	decorative(foreignBanner)
	local shellParts = 0
	for _, descendant in model:GetDescendants() do
		if descendant:IsA("BasePart") then
			shellParts += 1
		end
	end
	model:SetAttribute("VisualPartCount", shellParts)
	model:SetAttribute("VisualPartBudget", 120)
	assert(shellParts <= 120, string.format("foreign shell exceeded part budget: %d", shellParts))
	model.Parent = settlementsFolder
	return model
end

-- ⚠️ There were villagers here. Removed 2026-08-23 at Adam's word: "what are
-- all these sticks. surely those aren't the villagers. I never said anything
-- about villagers."
--
-- He is right, twice over. He asked for buildings to be OCCUPIED, and I turned
-- that into decorative NPCs he never wanted - brown poles with tan cubes for
-- heads, standing about in the street. And at this stage the only figures that
-- should exist are the player and actual troops, both of which mean something.
-- Scenery that means nothing is worse than empty ground.

--- A closed pitched roof: two genuinely sloped panels, filled triangular gable
--- ends, dark fascia and a ridge. No vertical fins and no open doll-house ends.
local function pitchedRoof(
	model: Model,
	root: CFrame,
	w: number,
	d: number,
	wallTop: number,
	rise: number,
	colour: Color3,
	material: Enum.Material,
	wallColour: Color3,
	wallMaterial: Enum.Material
)
	local overhang = 6
	local halfRun = (w + overhang) / 2
	local roofDepth = d + overhang
	local slopeLength = math.sqrt(halfRun * halfRun + rise * rise)
	local slopeAngle = math.atan2(rise, halfRun)
	for _, side in { 1, -1 } do
		local panel = WorldStyle.part("Roof", Vector3.new(slopeLength, 1.2, roofDepth),
			root
				* CFrame.new(side * halfRun / 2, wallTop + rise / 2, 0)
				* CFrame.Angles(0, 0, -side * slopeAngle),
			model, colour, material)
		panel:SetAttribute("RoofPanel", true)
		panel:SetAttribute("RoofSlopeDegrees", math.deg(slopeAngle))
		decorative(panel)

		-- Fascia follows each rake at both gable faces. It hides the thin panel
		-- edge and gives the roof believable construction depth.
		for _, face in { -1, 1 } do
			local fascia = WorldStyle.part("Fascia", Vector3.new(slopeLength + 0.5, 1.7, 1.1),
				root
					* CFrame.new(side * halfRun / 2, wallTop + rise / 2, face * roofDepth / 2)
					* CFrame.Angles(0, 0, -side * slopeAngle),
				model, PALETTE.timberDark, MATERIAL.timber)
			fascia:SetAttribute("RoofFascia", true)
			decorative(fascia)
		end
	end

	-- WedgePart's triangular profile is Y/Z. Turning it ninety degrees makes
	-- that profile fill one half of an X/Y gable; two halves close each face.
	for _, face in { -1, 1 } do
		for _, side in { -1, 1 } do
			local gable = Instance.new("WedgePart")
			gable.Name = "GableFill"
			gable.Size = Vector3.new(1.25, rise, w / 2)
			gable.CFrame = root
				* CFrame.new(side * w / 4, wallTop + rise / 2, face * (d / 2 + 0.04))
				* CFrame.Angles(0, math.rad(side * 90), 0)
			gable.Anchored = true
			gable.Color = wallColour
			gable.Material = wallMaterial
			gable.TopSurface = Enum.SurfaceType.Smooth
			gable.BottomSurface = Enum.SurfaceType.Smooth
			gable:SetAttribute("ClosedGable", true)
			decorative(gable)
			gable.Parent = model
		end
	end
	-- Ridge beam along the top, so the two slopes meet in a line rather than a
	-- seam.
	local ridge = WorldStyle.part("Ridge", Vector3.new(2.4, 2, d + overhang + 0.4),
		root * CFrame.new(0, wallTop + rise, 0), model, PALETTE.timberDark, MATERIAL.timber)
	decorative(ridge)
end

--- Recessed windows on all four facades. The dark opening, inset glass and
--- stone sill/lintel are separated in depth, so they read as construction and
--- never flicker from coplanar z-fighting.
local function windowRow(model: Model, root: CFrame, w: number, d: number, height: number)
	local count = math.clamp(math.floor(w / 16), 2, 5)
	local spacing = w / (count + 1)
	local windowHeight = math.clamp(height * 0.42, 4, 7)
	for index = 1, count do
		local x = -w / 2 + spacing * index
		for _, face in { 1, -1 } do
			-- Keep the actual entrance legible on the front face.
			if face == -1 or math.abs(x) > 6.5 then
				local recess = WorldStyle.part("WindowRecess", Vector3.new(5.2, windowHeight + 1, 0.55),
					root * CFrame.new(x, height, face * (d / 2 + 0.83)), model, PALETTE.timberDark, MATERIAL.timber)
				decorative(recess)
				-- A few warm panes imply occupied rooms without multiplying
				-- dynamic lights. The lead-dark mullion keeps both colours reading
				-- as late-medieval glazing rather than flat glowing rectangles.
				local warmPane = if face > 0 then index % 2 == 0 else index % 3 == 0
				local paneColour = if warmPane then PALETTE.windowGlow else PALETTE.window
				local pane = WorldStyle.part("Window", Vector3.new(3.8, windowHeight - 0.8, 0.22),
					root * CFrame.new(x, height, face * (d / 2 + 1.22)), model, paneColour, MATERIAL.glass)
				pane.Reflectance = 0.12
				decorative(pane)
				decorative(WorldStyle.part("WindowMullion", Vector3.new(0.38, windowHeight - 0.45, 0.32),
					root * CFrame.new(x, height, face * (d / 2 + 1.38)),
					model, PALETTE.timberDark, MATERIAL.timber))
				for _, sy in { -1, 1 } do
					local trim = WorldStyle.part(if sy > 0 then "WindowLintel" else "WindowSill",
						Vector3.new(5.8, 0.65, 0.65),
						root * CFrame.new(x, height + sy * (windowHeight / 2 + 0.45), face * (d / 2 + 1.28)),
						model, PALETTE.stoneWarm, MATERIAL.stone)
					decorative(trim)
				end
			end
		end
	end

	local sideCount = if d >= 30 then 2 else 1
	for sideIndex = 1, sideCount do
		local z = -d / 2 + d * sideIndex / (sideCount + 1)
		for _, side in { -1, 1 } do
			local recess = WorldStyle.part("SideWindowRecess", Vector3.new(0.55, windowHeight + 1, 5.2),
				root * CFrame.new(side * (w / 2 + 0.83), height, z), model, PALETTE.timberDark, MATERIAL.timber)
			decorative(recess)
			local paneColour = if sideIndex % 2 == 0 then PALETTE.windowGlow else PALETTE.window
			local pane = WorldStyle.part("SideWindow", Vector3.new(0.22, windowHeight - 0.8, 3.8),
				root * CFrame.new(side * (w / 2 + 1.22), height, z), model, paneColour, MATERIAL.glass)
			pane.Reflectance = 0.12
			decorative(pane)
			decorative(WorldStyle.part("SideWindowMullion", Vector3.new(0.32, windowHeight - 0.45, 0.38),
				root * CFrame.new(side * (w / 2 + 1.38), height, z),
				model, PALETTE.timberDark, MATERIAL.timber))
		end
	end
end

--- Exposed timber framing with filled panels below and construction following
--- the closed gable above. The rake timbers lie against the triangular infill;
--- none of them is a freestanding vertical roof fin.
local function timberFrame(model: Model, root: CFrame, w: number, d: number, h: number, roofRise: number)
	local beam = 2.25
	for _, sx in { -1, 1 } do
		for _, sz in { -1, 1 } do
			local post = WorldStyle.part("Post", Vector3.new(beam, h, beam),
				root * CFrame.new(sx * (w / 2 - beam / 2), h / 2, sz * (d / 2 - beam / 2)),
				model, PALETTE.timber, MATERIAL.timber)
			decorative(post)
		end
	end
	for _, face in { 1, -1 } do
		local rail = WorldStyle.part("Rail", Vector3.new(w, 2, 0.8),
			root * CFrame.new(0, h * 0.62, face * (d / 2 + 0.92)),
			model, PALETTE.timber, MATERIAL.timber)
		decorative(rail)
		decorative(WorldStyle.part("SillRail", Vector3.new(w, 1.35, 0.72),
			root * CFrame.new(0, 2.2, face * (d / 2 + 1.08)),
			model, PALETTE.timberDark, MATERIAL.timber))
		for _, bay in { -1, 1 } do
			decorative(WorldStyle.part("BayPost", Vector3.new(1.2, h - 2.8, 0.72),
				root * CFrame.new(bay * w / 4, h / 2 + 0.7, face * (d / 2 + 1.12)),
				model, PALETTE.timber, MATERIAL.timber))
		end

		-- Two real diagonal braces per face. They project farther than the rail,
		-- so neither the plaster nor the rail shares the same depth plane.
		for _, side in { -1, 1 } do
			local x1, y1 = side * (w / 2 - 3), 2.2
			local x2, y2 = side * 2.5, h * 0.58
			local dx, dy = x2 - x1, y2 - y1
			local length = math.sqrt(dx * dx + dy * dy)
			local brace = WorldStyle.part("DiagonalBrace", Vector3.new(length, 1.35, 0.75),
				root
					* CFrame.new((x1 + x2) / 2, (y1 + y2) / 2, face * (d / 2 + 1.36))
					* CFrame.Angles(0, 0, math.atan2(dy, dx)),
				model, PALETTE.timberDark, MATERIAL.timber)
			brace:SetAttribute("DiagonalTimber", true)
			decorative(brace)
		end

		local kingPost = WorldStyle.part("GableKingPost", Vector3.new(1.25, roofRise, 0.78),
			root * CFrame.new(0, h + roofRise / 2, face * (d / 2 + 1.06)),
			model, PALETTE.timberDark, MATERIAL.timber)
		kingPost:SetAttribute("GableTimber", true)
		decorative(kingPost)
		for _, side in { -1, 1 } do
			local x1, y1 = side * (w / 2 - 1.2), h + 0.25
			local x2, y2 = side * 0.7, h + roofRise - 0.35
			local dx, dy = x2 - x1, y2 - y1
			local length = math.sqrt(dx * dx + dy * dy)
			local rake = WorldStyle.part("GableRafter", Vector3.new(length, 1.15, 0.78),
				root
					* CFrame.new((x1 + x2) / 2, (y1 + y2) / 2, face * (d / 2 + 1.08))
					* CFrame.Angles(0, 0, math.atan2(dy, dx)),
				model, PALETTE.timberDark, MATERIAL.timber)
			rake:SetAttribute("GableTimber", true)
			decorative(rake)
		end
	end
end

-- Functional silhouettes, not scenery characters. Each building gets at most
-- eight small, deterministic parts that explain what happens there. The hard
-- cap protects the phone budget and the SemanticProp attribute makes it
-- possible for the evidence run to enforce that budget in a live DataModel.
local MAX_SEMANTIC_PARTS = 8
local function decorateBuilding(
	model: Model,
	root: CFrame,
	building: string,
	w: number,
	d: number,
	h: number
): number
	local madeCount = 0
	local front = d / 2 + 7

	local function add(
		name: string,
		size: Vector3,
		offset: CFrame,
		colour: Color3,
		material: Enum.Material
	): Part?
		if madeCount >= MAX_SEMANTIC_PARTS then
			return nil
		end
		madeCount += 1
		local made = WorldStyle.part(name, size, root * offset, model, colour, material)
		made:SetAttribute("SemanticProp", true)
		decorative(made)
		return made
	end

	if building == "hq" then
		for _, sx in { -1, 1 } do
			for _, sz in { -1, 1 } do
				add("HQButtress", Vector3.new(3.5, h * 0.55, 3.5),
					CFrame.new(sx * (w / 2 + 1.1), h * 0.275, sz * (d / 2 + 1.1)), PALETTE.stoneDark, MATERIAL.stone)
			end
		end
		add("HQCanopy", Vector3.new(16, 1.5, 7), CFrame.new(0, 11, d / 2 + 3.5), PALETTE.timber, MATERIAL.timber)
		for _, sx in { -1, 1 } do
			add("HQBanner", Vector3.new(3, 10, 0.35),
				CFrame.new(sx * 8, h * 0.62, d / 2 + 0.9), PALETTE.banner, MATERIAL.cloth)
		end
		add("HQShield", Vector3.new(5, 6, 0.6), CFrame.new(0, h * 0.58, d / 2 + 1.3), PALETTE.bannerGold, MATERIAL.iron)
	elseif building == "market" then
		add("MarketAwning", Vector3.new(w * 0.72, 1, 10), CFrame.new(0, 7, front - 3), PALETTE.bannerGold, MATERIAL.cloth)
		-- The dressed street face (slice 4): three trade stalls, hanging
		-- goods and the bread rack, from the shared Lune-audited spec.
		-- Deliberately outside the 8-part semantic cap - the row carries its
		-- OWN budget, asserted here so Studio can never draw more than the
		-- gate counted.
		local rowMaterials: { [string]: Enum.Material } = {
			WoodPlanks = Enum.Material.WoodPlanks,
			Fabric = Enum.Material.Fabric,
			SmoothPlastic = Enum.Material.SmoothPlastic,
		}
		local rowCount = 0
		for _, rowSpec in MarketRowSpec.parts() do
			rowCount += 1
			assert(rowCount <= MarketRowSpec.BUDGET, "the market row exceeded its visual part budget")
			local made = WorldStyle.part(
				rowSpec.name,
				Vector3.new(rowSpec.sx, rowSpec.sy, rowSpec.sz),
				root * CFrame.new(rowSpec.ox, rowSpec.oy, rowSpec.oz) * CFrame.Angles(rowSpec.rx, rowSpec.ry, rowSpec.rz),
				model,
				Color3.fromRGB(rowSpec.r, rowSpec.g, rowSpec.b),
				rowMaterials[rowSpec.material] or Enum.Material.WoodPlanks
			)
			made:SetAttribute("MarketRow", true)
			decorative(made)
		end
		model:SetAttribute("MarketRowPartCount", rowCount)
		model:SetAttribute("MarketRowPartBudget", MarketRowSpec.BUDGET)
	elseif building == "warehouse" then
		add("LoadingCanopy", Vector3.new(w * 0.65, 1, 8), CFrame.new(0, 8, front - 3), PALETTE.roofTile, MATERIAL.roof)
		for index = -1, 1 do
			add("CargoCrate", Vector3.new(4, 4 + math.abs(index), 4), CFrame.new(index * 6, 2, front + 3), PALETTE.timberLight, MATERIAL.timber)
		end
		add("HandCart", Vector3.new(9, 1.5, 5), CFrame.new(w * 0.28, 2.4, front + 7), PALETTE.timber, MATERIAL.timber)
		for _, sx in { -1, 1 } do
			local wheel = add("CartWheel", Vector3.new(1.2, 4, 4), CFrame.new(w * 0.28 + sx * 4.5, 2, front + 7), PALETTE.iron, MATERIAL.iron)
			if wheel then
				wheel.Shape = Enum.PartType.Cylinder
			end
		end
	elseif building == "barracks" then
		add("WeaponRack", Vector3.new(12, 6, 2), CFrame.new(0, 3, front + 3), PALETTE.timber, MATERIAL.timber)
		for _, sx in { -1, 1 } do
			add("TargetPost", Vector3.new(1.5, 7, 1.5), CFrame.new(sx * 13, 3.5, front + 7), PALETTE.timber, MATERIAL.timber)
			local board = add("TargetBoard", Vector3.new(1, 5, 5),
				CFrame.new(sx * 13, 6, front + 7) * CFrame.Angles(0, math.rad(90), 0), PALETTE.straw, MATERIAL.timber)
			if board then
				board.Shape = Enum.PartType.Cylinder
			end
			add("PracticeSpear", Vector3.new(0.7, 9, 0.7), CFrame.new(sx * 5, 4.5, front + 3) * CFrame.Angles(0, 0, math.rad(12 * sx)), PALETTE.iron, MATERIAL.iron)
		end
	elseif building == "stable" then
		add("WaterTrough", Vector3.new(12, 2.5, 5), CFrame.new(0, 1.25, front + 3), PALETTE.timberDark, MATERIAL.timber)
		for _, sx in { -1, 1 } do
			add("PaddockPost", Vector3.new(1.5, 6, 1.5), CFrame.new(sx * 16, 3, front + 8), PALETTE.timber, MATERIAL.timber)
			add("PaddockRail", Vector3.new(15, 1.2, 1.2), CFrame.new(sx * 8, 3.5, front + 8), PALETTE.timberLight, MATERIAL.timber)
		end
		add("HayBale", Vector3.new(6, 4, 4), CFrame.new(w * 0.3, 2, front + 2), PALETTE.straw, MATERIAL.thatch)
	elseif building == "workshop" then
		add("WorkBench", Vector3.new(14, 3, 5), CFrame.new(0, 1.5, front + 3), PALETTE.timber, MATERIAL.timber)
		add("ToolRack", Vector3.new(10, 6, 1.5), CFrame.new(-w * 0.25, 3, front + 2), PALETTE.iron, MATERIAL.iron)
		for index = -1, 1 do
			add("WorkshopLumber", Vector3.new(10, 1.2, 1.2), CFrame.new(w * 0.25, 1 + (index + 1) * 1.1, front + index * 1.5), PALETTE.timberLight, MATERIAL.timber)
		end
		add("BenchVise", Vector3.new(2, 2, 2), CFrame.new(4, 4, front + 3), PALETTE.iron, MATERIAL.iron)
	elseif building == "smithy" then
		add("ForgeHearth", Vector3.new(10, 4, 7), CFrame.new(-5, 2, front + 3), PALETTE.stoneDark, MATERIAL.stone)
		add("CoalBin", Vector3.new(6, 3, 6), CFrame.new(7, 1.5, front + 4), PALETTE.ore, MATERIAL.iron)
		add("AnvilBase", Vector3.new(2.5, 3, 2.5), CFrame.new(0, 1.5, front + 10), PALETTE.timber, MATERIAL.timber)
		add("AnvilTop", Vector3.new(7, 2, 2.5), CFrame.new(0, 4, front + 10), PALETTE.iron, MATERIAL.iron)
		add("Bellows", Vector3.new(5, 2, 4), CFrame.new(-10, 2, front + 8) * CFrame.Angles(0, math.rad(20), 0), PALETTE.banner, MATERIAL.cloth)
	elseif building == "timber" then
		for index = 1, 6 do
			local row = math.floor((index - 1) / 3)
			local column = (index - 1) % 3
			local log = add("LogStack", Vector3.new(11, 3, 3), CFrame.new((column - 1) * 4, 1.5 + row * 3, front + 3), PALETTE.timberLight, MATERIAL.timber)
			if log then
				log.Shape = Enum.PartType.Cylinder
			end
		end
	elseif building == "quarry" then
		for index = 1, 5 do
			local sx = ((index - 1) % 3 - 1) * 5
			local sz = math.floor((index - 1) / 3) * 5
			local stoneHeight = 3 + index % 3
			add("CutStone", Vector3.new(4 + index % 2, stoneHeight, 4),
				CFrame.new(sx, stoneHeight / 2, front + sz + 2) * CFrame.Angles(0, math.rad(index * 11), 0), PALETTE.stoneWarm, MATERIAL.stone)
		end
		for _, sx in { -1, 1 } do
			add("DerrickPost", Vector3.new(1.5, 11, 1.5), CFrame.new(sx * 7, 5.5, front + 10), PALETTE.timber, MATERIAL.timber)
		end
		add("DerrickBeam", Vector3.new(17, 1.5, 1.5), CFrame.new(0, 10.5, front + 10), PALETTE.timber, MATERIAL.timber)
	elseif building == "iron" then
		for index = 1, 4 do
			add("OrePile", Vector3.new(4 + index, 2 + index % 2, 4),
				CFrame.new((index - 2.5) * 4.5, 1.5, front + 3 + index % 2 * 4), PALETTE.ore, MATERIAL.iron)
		end
		add("OreCart", Vector3.new(9, 3, 6), CFrame.new(0, 2.5, front + 11), PALETTE.iron, MATERIAL.iron)
		for _, sx in { -1, 1 } do
			local wheel = add("OreCartWheel", Vector3.new(1, 3.5, 3.5), CFrame.new(sx * 4, 1.8, front + 11), PALETTE.timber, MATERIAL.timber)
			if wheel then
				wheel.Shape = Enum.PartType.Cylinder
			end
		end
	elseif building == "farm" then
		for index = -2, 1 do
			add("CropRow", Vector3.new(6, 1.2, 18), CFrame.new(index * 8 + 4, 0.6, front + 10), PALETTE.crop, MATERIAL.grass)
		end
		for _, sx in { -1, 1 } do
			add("FieldFence", Vector3.new(16, 1.2, 1.2), CFrame.new(sx * 12, 2.5, front + 20), PALETTE.timber, MATERIAL.timber)
		end
		add("FarmHay", Vector3.new(7, 5, 5), CFrame.new(w * 0.34, 2.5, front + 2), PALETTE.straw, MATERIAL.thatch)
	elseif building == "academy" then
		for _, sx in { -1, 1 } do
			add("AcademyColumn", Vector3.new(2.5, 12, 2.5), CFrame.new(sx * 7, 6, front - 3), PALETTE.stoneWarm, MATERIAL.stone)
			add("AcademyBanner", Vector3.new(2.5, 8, 0.35), CFrame.new(sx * 10, 15, d / 2 + 0.8), PALETTE.bannerGold, MATERIAL.cloth)
		end
		add("AcademyPediment", Vector3.new(19, 2, 5), CFrame.new(0, 12, front - 3), PALETTE.stoneWarm, MATERIAL.stone)
	elseif building == "wall" then
		for index = 1, 6 do
			local row = math.floor((index - 1) / 3)
			local column = (index - 1) % 3
			add("MasonStone", Vector3.new(5, 2.5, 4), CFrame.new((column - 1) * 5.5, 1.25 + row * 2.5, front + 3), PALETTE.stoneWarm, MATERIAL.stone)
		end
		add("ScaffoldPost", Vector3.new(1.5, 10, 1.5), CFrame.new(w * 0.35, 5, front + 8), PALETTE.timber, MATERIAL.timber)
		add("ScaffoldRail", Vector3.new(12, 1.5, 1.5), CFrame.new(w * 0.18, 8, front + 8), PALETTE.timber, MATERIAL.timber)
	end

	return madeCount
end

-- The seat of rule is a hall with a crossing tower, not a taller copy of a
-- cottage. The upper keep rises through the main roof, a crenellated crown
-- marks it from the gate, and restrained furnishings make the war room feel
-- inhabited without narrowing the clear path around the authoritative table.
local function buildHQLandmark(model: Model, root: CFrame, w: number, d: number, h: number)
	local upperSize, upperHeight = 22, 14
	WorldStyle.part("HQUpperKeep", Vector3.new(upperSize, upperHeight, upperSize),
		root * CFrame.new(0, h + upperHeight / 2, 0), model, PALETTE.stoneDark, MATERIAL.stone)
	local parapet = WorldStyle.part("HQParapet", Vector3.new(upperSize + 3, 2, upperSize + 3),
		root * CFrame.new(0, h + upperHeight + 1, 0), model, PALETTE.stoneWarm, MATERIAL.stone)
	decorative(parapet)
	local edge = upperSize / 2 - 1.5
	for _, merlonPosition in {
		Vector2.new(-edge, -edge), Vector2.new(0, -edge), Vector2.new(edge, -edge), Vector2.new(edge, 0),
		Vector2.new(edge, edge), Vector2.new(0, edge), Vector2.new(-edge, edge), Vector2.new(-edge, 0),
	} do
		decorative(WorldStyle.part("HQMerlon", Vector3.new(3.5, 3.5, 3.5),
			root * CFrame.new(merlonPosition.X, h + upperHeight + 3.25, merlonPosition.Y),
			model, PALETTE.stone, MATERIAL.stone))
	end

	-- Slender openings keep the upper mass from reading as another blank box.
	for _, opening in {
		CFrame.new(0, h + 7, upperSize / 2 + 0.25),
		CFrame.new(0, h + 7, -(upperSize / 2 + 0.25)),
		CFrame.new(upperSize / 2 + 0.25, h + 7, 0) * CFrame.Angles(0, math.rad(90), 0),
		CFrame.new(-(upperSize / 2 + 0.25), h + 7, 0) * CFrame.Angles(0, math.rad(90), 0),
	} do
		decorative(WorldStyle.part("HQArrowWindow", Vector3.new(2.1, 6.5, 0.45),
			root * opening, model, PALETTE.window, MATERIAL.glass))
	end

	-- The hall needs its own ceiling below the exterior roof. Besides giving the
	-- room the heavy oak-beam silhouette of a keep, this prevents the sloped roof
	-- panels and the sky beyond their eaves from being visible inside. It remains
	-- non-colliding so the proven walkable volume is unchanged, but unlike small
	-- decoration it casts a shadow and makes the candlelight readable.
	local ceiling = WorldStyle.part("HQInteriorCeiling", Vector3.new(w - 1.5, 1.2, d - 1.5),
		root * CFrame.new(0, h - 0.6, 0), model, PALETTE.timberDark, MATERIAL.timber)
	ceiling:SetAttribute("InteriorCeiling", true)
	ceiling.CanCollide = false
	ceiling.CanTouch = false
	ceiling.CanQuery = false
	ceiling.CastShadow = true
	for _, zFactor in { -0.35, -0.12, 0.12, 0.35 } do
		local beam = WorldStyle.part("HQCeilingBeam", Vector3.new(w - 1.8, 1.15, 1.15),
			root * CFrame.new(0, h - 1.65, zFactor * (d - 3)),
			model, PALETTE.timber, MATERIAL.timber)
		decorative(beam)
	end

	-- Shallow engaged piers break up the long wall planes without changing the
	-- shell collision. The rear pair frames the wool hangings; the side pair
	-- gives the benches and sconces an architectural bay of their own.
	local pilasterHeight = h - 4
	for _, side in { -1, 1 } do
		decorative(WorldStyle.part("HQRearPilaster", Vector3.new(1.7, pilasterHeight, 1),
			root * CFrame.new(side * (w * 0.34), 2 + pilasterHeight / 2, -(d / 2 - 1.1)),
			model, PALETTE.stoneDark, MATERIAL.stone))
		decorative(WorldStyle.part("HQSidePilaster", Vector3.new(1, pilasterHeight, 2.2),
			root * CFrame.new(side * (w / 2 - 1.1), 2 + pilasterHeight / 2, -10),
			model, PALETTE.stoneDark, MATERIAL.stone))
	end

	-- Interior pieces stay against the walls. The war table is at local z=-4
	-- and occupies x +/-10; the central command aisle remains open.
	for _, side in { -1, 1 } do
		local bench = WorldStyle.part("HQInteriorBench", Vector3.new(2.8, 0.65, 11),
			root * CFrame.new(side * (w / 2 - 2.25), 2.25, -4), model, PALETTE.timberDark, MATERIAL.timber)
		bench.CanTouch = false
		bench.CanQuery = false
		for _, legZ in { -7.8, -0.2 } do
			decorative(WorldStyle.part("HQBenchTrestle", Vector3.new(2.35, 1.95, 0.7),
				root * CFrame.new(side * (w / 2 - 2.25), 0.975, legZ),
				model, PALETTE.timber, MATERIAL.timber))
		end

		local tapestryX = side * (w * 0.2)
		local wallFaceZ = -(d / 2 - 0.95)
		local tapestry = WorldStyle.part("HQInteriorTapestry", Vector3.new(4.8, 7.2, 0.3),
			root * CFrame.new(tapestryX, 11.2, wallFaceZ), model, PALETTE.banner, MATERIAL.cloth)
		decorative(tapestry)
		decorative(WorldStyle.part("HQTapestryRail", Vector3.new(6, 0.45, 0.65),
			root * CFrame.new(tapestryX, 15.05, wallFaceZ + 0.05),
			model, PALETTE.timberLight, MATERIAL.timber))
		decorative(WorldStyle.part("HQTapestryHem", Vector3.new(5, 0.32, 0.38),
			root * CFrame.new(tapestryX, 7.55, wallFaceZ + 0.08),
			model, PALETTE.bannerGold, MATERIAL.cloth))

		-- One small iron candle sconce per side is enough to model the warm
		-- pools in the reference without multiplying shadow-casting lights.
		local sconceX = side * (w / 2 - 1.45)
		local bracket = WorldStyle.part("HQWallSconce", Vector3.new(1.8, 0.35, 0.35),
			root * CFrame.new(sconceX, 8.5, -4), model, PALETTE.iron, MATERIAL.iron)
		decorative(bracket)
		local candle = WorldStyle.part("HQSconceCandle", Vector3.new(1.25, 0.42, 0.42),
			root * CFrame.new(side * (w / 2 - 2.25), 9.35, -4) * CFrame.Angles(0, 0, math.rad(90)),
			model, PALETTE.candleWax, Enum.Material.SmoothPlastic)
		decorative(candle)
		local glow = Instance.new("PointLight")
		glow.Name = "WarRoomGlow"
		glow.Color = PALETTE.warmLight
		glow.Brightness = 1.15
		glow.Range = 19
		glow.Shadows = false
		glow.Parent = candle
	end
end

--- A restrained timber plaque fixed to the street facade. It is separate from
--- the prompt anchor and obeys occlusion, so labels never hover over roofs or
--- render through a building behind the player.
---
--- [Adam] "remove those annoying labels" and then "The buildings need labels."
--- Both are right - the problem was never that buildings were named, it was that
--- the naming was enormous and never faded.
local function buildingPlaque(model: Model, root: CFrame, text: string, w: number, d: number, built: boolean): BasePart
	local availablePier = math.max(10, w / 2 - 5)
	local width = math.clamp(#text * 0.32, 10, math.min(18, availablePier))
	local height = if built then 5.8 else 3.5
	local front = d / 2 + (if built then 1.35 else 3)
	local x = if built then w / 2 - width / 2 - 1 else 0
	local plaque = WorldStyle.part("LabelAnchor", Vector3.new(width, 3.8, 0.65),
		root * CFrame.new(x, height, front), model, PALETTE.timberDark, MATERIAL.timber)
	plaque:SetAttribute("FacadePlaque", true)
	decorative(plaque)
	labelFor(plaque, text)
	return plaque
end

--- Four walls with a DOORWAY-SHAPED GAP in the front, not a solid block with a
--- door part stuck to it.
---
--- [Adam] "there are no doors to enter anywhere. do not give me doors to open.
--- Leave it a doorless entry way." So the front wall is built as two piers and a
--- lintel around an opening you simply walk through. Roblox parts cannot have
--- holes, so the hole has to be made of the absence of parts.
local function walledShell(model: Model, root: CFrame, w: number, d: number, h: number, colour: Color3, material: Enum.Material)
	local t = 1.5 -- wall thickness
	local doorW, doorH = 8, 9 -- a character is ~5 studs: this is a real doorway

	-- floor, so an interior is a place rather than grass under a roof
	WorldStyle.part("Floor", Vector3.new(w, 1, d),
		root * CFrame.new(0, 0.5, 0), model, PALETTE.stoneDark, MATERIAL.stone).CastShadow = false

	-- back and sides
	WorldStyle.part("WallBack", Vector3.new(w, h, t),
		root * CFrame.new(0, h / 2, -d / 2), model, colour, material)
	WorldStyle.part("WallLeft", Vector3.new(t, h, d),
		root * CFrame.new(-w / 2, h / 2, 0), model, colour, material)
	WorldStyle.part("WallRight", Vector3.new(t, h, d),
		root * CFrame.new(w / 2, h / 2, 0), model, colour, material)

	-- front: two piers and a lintel, leaving the doorway open
	local pier = (w - doorW) / 2
	for _, side in { -1, 1 } do
		WorldStyle.part("WallFront", Vector3.new(pier, h, t),
			root * CFrame.new(side * (doorW / 2 + pier / 2), h / 2, d / 2), model, colour, material)
	end
	WorldStyle.part("Lintel", Vector3.new(doorW + 3, h - doorH, t + 0.5),
		root * CFrame.new(0, doorH + (h - doorH) / 2, d / 2), model, PALETTE.stoneDark, MATERIAL.stone)

	-- Projecting foundation courses stop every wall meeting the grass as one
	-- perfectly flat box and make the ground-floor mass feel load-bearing.
	for _, course in {
		{ Vector3.new(w + 1.4, 1.5, 1.2), CFrame.new(0, 0.75, d / 2 + 0.8) },
		{ Vector3.new(w + 1.4, 1.5, 1.2), CFrame.new(0, 0.75, -(d / 2 + 0.8)) },
		{ Vector3.new(1.2, 1.5, d), CFrame.new(w / 2 + 0.8, 0.75, 0) },
		{ Vector3.new(1.2, 1.5, d), CFrame.new(-(w / 2 + 0.8), 0.75, 0) },
	} do
		decorative(WorldStyle.part("FoundationCourse", course[1] :: Vector3,
			root * (course[2] :: CFrame), model, PALETTE.stoneDark, MATERIAL.stone))
	end

	-- A shallow stone socle takes splash and cart wear at street level. It is
	-- applied as collisionless facing so the shell's proven doorway and interior
	-- collision remain unchanged.
	for _, facing in {
		{ Vector3.new(w + 0.5, 3.2, 0.65), CFrame.new(0, 1.6, -(d / 2 + 0.92)) },
		{ Vector3.new(0.65, 3.2, d - 1), CFrame.new(w / 2 + 0.92, 1.6, 0) },
		{ Vector3.new(0.65, 3.2, d - 1), CFrame.new(-(w / 2 + 0.92), 1.6, 0) },
		{ Vector3.new(pier, 3.2, 0.65), CFrame.new(doorW / 2 + pier / 2, 1.6, d / 2 + 0.92) },
		{ Vector3.new(pier, 3.2, 0.65), CFrame.new(-(doorW / 2 + pier / 2), 1.6, d / 2 + 0.92) },
	} do
		decorative(WorldStyle.part("StoneSocle", facing[1] :: Vector3,
			root * (facing[2] :: CFrame), model, PALETTE.stoneDark, MATERIAL.stone))
	end

	-- Collisionless arch stones describe the opening while the absent wall
	-- remains the actual walk-through doorway.
	for index = 0, 4 do
		local theta = math.pi * index / 4
		local radius = doorW / 2 + 0.7
		local archStone = WorldStyle.part("DoorArchStone", Vector3.new(2.7, 1.8, 0.8),
			root
				* CFrame.new(math.cos(theta) * radius, doorH - 0.7 + math.sin(theta) * radius, d / 2 + 1.15)
				* CFrame.Angles(0, 0, theta - math.pi / 2),
			model, PALETTE.stoneWarm, MATERIAL.stone)
		decorative(archStone)
	end
	-- Timber jambs make the walk-through opening legible in shadow while
	-- preserving Adam's requirement that there is no door to operate.
	for _, side in { -1, 1 } do
		decorative(WorldStyle.part("EntryJamb", Vector3.new(1.15, doorH, 1),
			root * CFrame.new(side * (doorW / 2 + 0.45), doorH / 2, d / 2 + 1.38),
			model, PALETTE.timberDark, MATERIAL.timber))
	end
	decorative(WorldStyle.part("EntryHeader", Vector3.new(doorW + 2, 1.2, 1),
		root * CFrame.new(0, doorH + 0.35, d / 2 + 1.38),
		model, PALETTE.timberDark, MATERIAL.timber))
	-- doorstep, so the opening reads as an entrance from a distance
	WorldStyle.part("Step", Vector3.new(doorW + 4, 0.6, 4),
		root * CFrame.new(0, 0.3, d / 2 + 2), model, PALETTE.road, MATERIAL.road).CastShadow = false
end

local MAX_BUILDING_PARTS = 170

local function makeInteractionStructure(model: Model, root: CFrame, d: number): Model
	-- Keep the legacy Structure -> Prompt hierarchy: CommandService and DemoTour
	-- both use it. The model's PrimaryPart is now a doorway-height anchor rather
	-- than a transparent roof-sized slab, so the world-space prompt is reachable
	-- from the street and independent of the facade plaque.
	local structure = Instance.new("Model")
	structure.Name = "Structure"
	local anchor = WorldStyle.part("InteractionAnchor", Vector3.new(1, 1, 1),
		root * CFrame.new(0, 4.5, d / 2 + 2.4), structure, PALETTE.timber, MATERIAL.timber)
	anchor.Transparency = 1
	anchor:SetAttribute("DoorwayHeight", true)
	decorative(anchor)
	structure.PrimaryPart = anchor
	structure.Parent = model
	return structure
end

local function renderBuilding(container: Model, origin: CFrame, villageId: string, building: string, level: number)
	local existing = container:FindFirstChild("B_" .. building)
	if existing then
		existing:Destroy()
	end
	local placement = LAYOUT[building]
	if not placement then
		return
	end
	local root = origin * CFrame.new(placement.at) * CFrame.Angles(0, math.rad(placement.yaw), 0)
	local model = Instance.new("Model")
	model.Name = "B_" .. building
	model:SetAttribute("VillageId", villageId)
	model:SetAttribute("Building", building)
	model:SetAttribute("Level", level)
	model:SetAttribute("FacingYaw", placement.yaw)
	model:SetAttribute("StreetFacing", true)
	local bounds = lotBounds(building)
	model:SetAttribute("MaxLevelLotX", bounds.x)
	model:SetAttribute("MaxLevelLotZ", bounds.z)

	local displayName = Buildings.displayName(building)
	local sp = SPEC[building] or SPEC.market
	local interactionDepth = sp.d
	local semanticCount = 0
	if level <= 0 then
		local plot = WorldStyle.part("BuildPlot", Vector3.new(sp.w, 1, sp.d),
			root * CFrame.new(0, 0.5, 0), model, PALETTE.dirt, MATERIAL.dirt)
		plot.CastShadow = false
		for _, sx in { -1, 1 } do
			for _, sz in { -1, 1 } do
				decorative(WorldStyle.part("Stake", Vector3.new(1, 5, 1),
					root * CFrame.new(sx * (sp.w / 2 - 2), 2.5, sz * (sp.d / 2 - 2)),
					model, PALETTE.timber, MATERIAL.timber))
			end
		end
		buildingPlaque(model, root, displayName .. "  ·  Build site", sp.w, sp.d, false)
	else
		-- Level widens the compound. It never stretches the building upward.
		local grow = 1 + math.min(level, MAX_BUILDING_LEVEL) * 0.010
		local width, depth = sp.w * grow, sp.d * grow
		interactionDepth = depth

		walledShell(model, root, width, depth, sp.h, sp.wall, sp.wallMat)
		pitchedRoof(model, root, width, depth, sp.h, sp.roof, sp.roofColour, sp.roofMat, sp.wall, sp.wallMat)
		windowRow(model, root, width, depth, sp.h * 0.6)
		if sp.timbered then
			timberFrame(model, root, width, depth, sp.h, sp.roof)
		end
		if sp.chimney then
			local stack = WorldStyle.part("Chimney", Vector3.new(4, sp.roof + 8, 4),
				root * CFrame.new(width * 0.3, sp.h + (sp.roof + 8) / 2 - 1, -depth * 0.3),
				model, PALETTE.stoneDark, MATERIAL.stone)
			decorative(stack)
		end

		semanticCount = decorateBuilding(model, root, building, width, depth, sp.h)
		if building == "hq" then
			buildHQLandmark(model, root, width, depth, sp.h)
		end

		local annexes = math.min(math.floor(level / 4), 4)
		local annexOffsets = {
			-- Side annexes sit forward of centre; rear annexes sit behind. This
			-- keeps all four roof overhangs separate even on the smallest level-16
			-- building that can display four annexes.
			Vector3.new(-(width / 2 + ANNEX_WIDTH / 2), 0, depth * 0.24),
			Vector3.new(width / 2 + ANNEX_WIDTH / 2, 0, depth * 0.24),
			Vector3.new(-width * 0.24, 0, -(depth / 2 + ANNEX_DEPTH / 2)),
			Vector3.new(width * 0.24, 0, -(depth / 2 + ANNEX_DEPTH / 2)),
		}
		for index = 1, annexes do
			local ah = 7 + (index % 2) * 2
			local offset = annexOffsets[index]
			local annexRoot = root * CFrame.new(offset)
			WorldStyle.part("AnnexWall", Vector3.new(ANNEX_WIDTH, ah, ANNEX_DEPTH),
				annexRoot * CFrame.new(0, ah / 2, 0), model, PALETTE.plaster, MATERIAL.plaster)
			pitchedRoof(model, annexRoot, ANNEX_WIDTH, ANNEX_DEPTH, ah, 4,
				sp.roofColour, sp.roofMat, PALETTE.plaster, MATERIAL.plaster)
		end

		buildingPlaque(model, root, string.format("%s  ·  Level %d", displayName, level), width, depth, true)
	end
	model:SetAttribute("SemanticPartCount", semanticCount)

	local structure = makeInteractionStructure(model, root, interactionDepth)
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "InteractPrompt"
	prompt.ActionText = if level <= 0 then "Build" else string.format("Upgrade to Level %d", level + 1)
	prompt.ObjectText = displayName
	prompt.HoldDuration = 0.35
	prompt.MaxActivationDistance = 16
	prompt.RequiresLineOfSight = false
	prompt.Parent = structure

	if building == "barracks" then
		local recruit = Instance.new("ProximityPrompt")
		recruit.Name = "RecruitPrompt"
		recruit.ActionText = Buildings.RECRUIT_PRESET.label
		recruit.ObjectText = displayName
		recruit.HoldDuration = 0.35
		recruit.MaxActivationDistance = 16
		recruit.RequiresLineOfSight = false
		recruit.UIOffset = Vector2.new(0, 60)
		recruit.KeyboardKeyCode = Enum.KeyCode.R
		recruit.Parent = structure
	end

	local partCount = 0
	for _, descendant in model:GetDescendants() do
		if descendant:IsA("BasePart") then
			partCount += 1
		end
	end
	model:SetAttribute("ArchitecturePartCount", partCount)
	model:SetAttribute("ArchitecturePartBudget", MAX_BUILDING_PARTS)
	assert(partCount <= MAX_BUILDING_PARTS,
		string.format("%s exceeded architecture part budget: %d", building, partCount))
	model.Parent = container
end

local function renderFullShellParts(model: Model, origin: CFrame, villageName: string)
	-- Everything a settlement is made of now lives in renderShellWalls: walls,
	-- towers, gatehouse, streets and the gate spawn. This is kept as the single
	-- entry point so callers do not need to know that.
	renderShellWalls(model, origin, true)
end

local function renderFull(player: Player, village: any, origin: CFrame): Model
	local villageId = tostring(village.id)
	local model = Instance.new("Model")
	model.Name = "SettlementDetail_" .. villageId
	model:SetAttribute("VillageId", villageId)
	model:SetAttribute("OwnerUserId", player.UserId)
	model:SetAttribute("Foreign", false)
	model:SetAttribute("VisibilityLayer", "OwnerDetail")
	model:SetAttribute("FogSafe", false)
	model:SetAttribute("OwnerOnlySource", true)
	model:SetAttribute("CenterX", origin.Position.X)
	model:SetAttribute("CenterZ", origin.Position.Z)
	model:SetAttribute("BoundsHalf", WALL_HALF + 20)
	renderFullShellParts(model, origin, tostring(village.name))
	model.Parent = detailsFolder
	return model
end

-- Owner-only visual transport -------------------------------------------------
--
-- Roblox PlayerGui is replicated only to its owning player. The authoritative
-- detailed model stays in ServerStorage; when visuals change, a clone is placed
-- in that owner's private PlayerGui folder. Their client clones it locally into
-- Workspace. No foreign client receives the model, its Level attributes or its
-- prompts.
local function privateDetailsFolder(player: Player): Folder?
	local playerGui = player:FindFirstChildOfClass("PlayerGui")
	if not playerGui then
		return nil
	end
	local existing = playerGui:FindFirstChild("SettlementDetailsPrivate")
	if existing and existing:IsA("Folder") then
		return existing
	end
	local folder = Instance.new("Folder")
	folder.Name = "SettlementDetailsPrivate"
	folder:SetAttribute("OwnerUserId", player.UserId)
	folder.Parent = playerGui
	return folder
end

local function publishDetail(player: Player, detail: DetailEntry)
	if player.Parent ~= Players or detail.ownerUserId ~= player.UserId then
		return
	end
	local folder = privateDetailsFolder(player)
	if not folder then
		-- PlayerGui can trail PlayerAdded briefly. The next state heartbeat or
		-- WarTable completion retries without exposing the source elsewhere.
		return
	end
	local villageId = tostring(detail.model:GetAttribute("VillageId"))
	local name = "SettlementDetail_" .. villageId
	local old = folder:FindFirstChild(name)
	local clone = detail.model:Clone()
	clone.Name = name
	clone:SetAttribute("OwnerUserId", player.UserId)
	clone:SetAttribute("VisibilityLayer", "OwnerDetail")
	clone:SetAttribute("PrivatePlayerGuiSource", true)
	clone.Parent = folder
	-- Publish the replacement before removing the previous source. The client
	-- installs the new local model first, avoiding a shell flash between updates.
	if old then
		old:Destroy()
	end
end

function SettlementBuilder.syncPlayer(player: Player, villageId: string?)
	if villageId then
		local entry = rendered[villageId]
		local detail = entry and entry.detail or nil
		if detail and detail.ownerUserId == player.UserId then
			publishDetail(player, detail)
		end
		return
	end
	for _, ownedVillageId in playerVillageIds[player] or {} do
		local entry = rendered[ownedVillageId]
		local detail = entry and entry.detail or nil
		if detail and detail.ownerUserId == player.UserId then
			publishDetail(player, detail)
		end
	end
end

local function provisionPrivateDetails(player: Player)
	task.spawn(function()
		local playerGui = player:WaitForChild("PlayerGui", 30)
		if not playerGui or player.Parent ~= Players then
			return
		end
		privateDetailsFolder(player)
		-- Covers the race where the first world snapshot built detail before
		-- PlayerGui existed; this republishes only that player's owned sources.
		SettlementBuilder.syncPlayer(player)
	end)
	player.CharacterAdded:Connect(function()
		task.delay(1, function()
			if player.Parent == Players then
				privateDetailsFolder(player)
				SettlementBuilder.syncPlayer(player)
			end
		end)
	end)
end

Players.PlayerAdded:Connect(provisionPrivateDetails)
for _, presentPlayer in Players:GetPlayers() do
	provisionPrivateDetails(presentPlayer)
end

local function removeClientDetail(player: Player, villageId: string)
	local folder = privateDetailsFolder(player)
	if not folder then
		return
	end
	local existing = folder:FindFirstChild("SettlementDetail_" .. villageId)
	if existing then
		existing:Destroy()
	end
end

local function ensureSpawnAnchor(villageId: string, origin: CFrame): SpawnLocation
	local name = "GateSpawn_" .. villageId
	local existing = spawnFolder:FindFirstChild(name)
	if existing and existing:IsA("SpawnLocation") then
		return existing
	end
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = name
	spawn:SetAttribute("VillageId", villageId)
	spawn:SetAttribute("FogSafe", true)
	spawn.Size = Vector3.new(10, 1, 10)
	spawn.CFrame = origin * CFrame.new(0, 0.8, WALL_HALF - 16)
	spawn.Anchored = true
	spawn.Neutral = false
	spawn.Enabled = true
	spawn.Duration = 0
	spawn.Transparency = 1
	spawn.CanCollide = false
	spawn.CanTouch = false
	spawn.CanQuery = false
	spawn.Parent = spawnFolder
	return spawn
end

local function buildWilderness(villages: { any })
	if wildernessBuilt or #villages == 0 then
		return
	end
	wildernessBuilt = true

	local minX, maxX, minZ, maxZ = math.huge, -math.huge, math.huge, -math.huge
	for _, village in villages do
		local origin = villageOrigin(village).Position
		minX = math.min(minX, origin.X)
		maxX = math.max(maxX, origin.X)
		minZ = math.min(minZ, origin.Z)
		maxZ = math.max(maxZ, origin.Z)
	end
	local margin = 260
	minX -= margin; maxX += margin; minZ -= margin; maxZ += margin

	-- The region floor, TILED.
	--
	-- This used to be one part spanning every settlement, which with ten of
	-- them is 9,540 x 7,780 studs - far past Roblox's 2,048-stud limit, so the
	-- part was never created and the whole region had no floor. Nothing
	-- errored; the build printed its tree count and carried on, and the world
	-- was a void with village plates and trees hanging in it.
	local tiles = Config.groundTiles(minX, maxX, minZ, maxZ)
	for index, tile in tiles do
		local slab = WorldStyle.part(string.format("RegionGround%d", index), Vector3.new(tile.sx, 2, tile.sz),
			CFrame.new(tile.cx, -2.05, tile.cz), wildernessFolder, PALETTE.grass, MATERIAL.grass)
		slab.CastShadow = false
	end
	print(string.format("[World] region floor: %d tiles covering %d x %d studs",
		#tiles, math.floor(maxX - minX), math.floor(maxZ - minZ)))

	-- Deterministic tree scatter: same forest every join, no runtime RNG.
	local step = 60
	local treeCount = 0
	for gx = math.floor(minX / step), math.floor(maxX / step) do
		for gz = math.floor(minZ / step), math.floor(maxZ / step) do
			local hash = (gx * 73856093 + gz * 19349663) % 100
			if hash < 9 then
				local x = gx * step + (hash * 3) % 31
				local z = gz * step + (hash * 7) % 29
				local nearVillage = false
				for _, village in villages do
					local origin = villageOrigin(village).Position
					if math.abs(origin.X - x) < 140 and math.abs(origin.Z - z) < 140 then
						nearVillage = true
						break
					end
				end
				if not nearVillage then
					treeCount += 1
					-- Trees sized for a world where a settlement is 1,100 studs
					-- across. At 2x9 they were matchsticks you walked straight
					-- past. Height varies deterministically from the same hash
					-- that placed them, so a forest looks grown rather than
					-- stamped, and still looks identical for every player.
					local scale = 0.75 + (hash % 7) * 0.14
					local trunkHeight = 16 * scale
					local trunk = WorldStyle.part("TreeTrunk", Vector3.new(3, trunkHeight, 3),
						CFrame.new(x, trunkHeight / 2, z), wildernessFolder, PALETTE.timber, MATERIAL.timber)
					trunk.CastShadow = false
					for tier = 0, 2 do
						local spread = (16 - tier * 4) * scale
						local canopy = WorldStyle.part("TreeCanopy", Vector3.new(spread, 7 * scale, spread),
							CFrame.new(x, trunkHeight + tier * 5 * scale, z), wildernessFolder,
							Color3.fromRGB(58 + tier * 8, 96 + tier * 10, 52), MATERIAL.thatch)
						canopy.CanCollide = false
						canopy.CastShadow = false
					end
				end
			end
		end
	end
	print(string.format("[World] wilderness built: %d trees across the region", treeCount))
end

-- Feed a fresh snapshot: render/refresh every village it contains.
function SettlementBuilder.onState(player: Player, snapshot: any, kingdomId: string)
	local villages = snapshot and snapshot.world and snapshot.world.villages
	if typeof(villages) ~= "table" then
		return
	end
	buildWilderness(villages)

	local previousOwned = playerVillageIds[player] or {}
	local owned: { string } = {}
	local ownedSet: { [string]: boolean } = {}
	local hasOwnedCapital = false
	for _, village in villages do
		local villageId = tostring(village.id)
		local origin = villageOrigin(village)
		local isOwn = village.kingdomId == kingdomId
		local kingdomName, kingdomColor = kingdomInfo(snapshot, tostring(village.kingdomId))
		local entry = rendered[villageId]

		-- Every village keeps one replicated, fog-safe shell. Owner detail is a
		-- separate server-only source in ServerStorage and is published only into
		-- that owner's private PlayerGui; it is never a Workspace sibling.
		local identityChanged = entry ~= nil
			and (entry.villageName ~= tostring(village.name)
				or entry.kingdomName ~= kingdomName
				or entry.kingdomColor ~= kingdomColor)
		local moved = entry ~= nil and (entry.origin.Position - origin.Position).Magnitude > 0.1
		if entry == nil or identityChanged or moved then
			local existingDetail = entry and entry.detail or nil
			if entry then
				entry.shell:Destroy()
				if moved and existingDetail then
					local previousOwner = Players:GetPlayerByUserId(existingDetail.ownerUserId)
					if previousOwner then
						removeClientDetail(previousOwner, villageId)
					end
					existingDetail.model:Destroy()
					existingDetail = nil
				end
			end
			local shell = renderShell(villageId, origin, tostring(village.name), kingdomName, kingdomColor)
			entry = {
				shell = shell,
				detail = existingDetail,
				origin = origin,
				villageName = tostring(village.name),
				kingdomName = kingdomName,
				kingdomColor = kingdomColor,
			}
			rendered[villageId] = entry
		end

		if isOwn then
			ownedSet[villageId] = true
			if village.isCapital then
				table.insert(owned, 1, villageId) -- capital first: it owns the war table binding
			else
				table.insert(owned, villageId)
			end
			local detail = entry.detail
			local detailChanged = false
			if detail and detail.ownerUserId ~= player.UserId then
				local previousOwner = Players:GetPlayerByUserId(detail.ownerUserId)
				if previousOwner then
					removeClientDetail(previousOwner, villageId)
				end
				detail.model:Destroy()
				detail = nil
			end
			if not detail then
				detail = {
					model = renderFull(player, village, origin),
					stateVersion = -1,
					levels = {},
					ownerUserId = player.UserId,
				}
				entry.detail = detail
				detailChanged = true
			end
			if detail.stateVersion ~= village.stateVersion then
				local rendered_count = 0
				for _, building in Buildings.ORDER do
					local level = tonumber(village.buildings and village.buildings[building]) or 0
					if detail.levels[building] ~= level then
						renderBuilding(detail.model, origin, villageId, building, level)
						detail.levels[building] = level
						rendered_count += 1
					end
				end
				if rendered_count > 0 then
					print(string.format("[World] %s: built %d structures at (%d, %d)",
						tostring(village.name), rendered_count,
						math.floor(origin.Position.X), math.floor(origin.Position.Z)))
				end
				detail.stateVersion = village.stateVersion
				detailChanged = detailChanged or rendered_count > 0
			end
			if village.isCapital then
				hasOwnedCapital = true
				player.RespawnLocation = ensureSpawnAnchor(villageId, origin)
				-- The region is placed from map coordinates, so it sits
				-- THOUSANDS of studs from the origin — and Roblox's default
				-- spawn is the origin. A player who is not moved to their own
				-- gate spawns over open void and falls forever, and no MoveTo
				-- will ever reach anything again. Arrival therefore has to be
				-- reliable, not best-effort:
				--   * never latch `teleported` until the character has ACTUALLY
				--     been placed (the old code latched first, so a character
				--     that was not ready yet was stranded permanently);
				--   * keep trying while the character is still loading;
				--   * and rescue anyone who ends up under the world later.
				-- Just inside the gate, facing up the main street.
				local landing = origin * CFrame.new(0, 6, WALL_HALF - 40)
				gateLanding[player] = landing
				if not teleported[player] then
					teleported[player] = true
					task.spawn(function()
						for _ = 1, 40 do
							if player.Parent ~= Players then
								return
							end
							local character = player.Character
							local root = character and character:FindFirstChild("HumanoidRootPart")
							if character and root and root:IsA("BasePart") then
								character:PivotTo(landing)
								root.AssemblyLinearVelocity = Vector3.zero
								print(string.format("[World] %s placed at their gate (%d, %d, %d)",
									player.Name,
									math.floor(landing.Position.X),
									math.floor(landing.Position.Y),
									math.floor(landing.Position.Z)))
								return
							end
							task.wait(0.25)
						end
						-- Never arrived: let the next snapshot try again rather
						-- than leaving them in the sky.
						teleported[player] = false
					end)
				end
			end
			if detailChanged then
				publishDetail(player, detail)
			end
		end
	end

	-- Revoke old owner detail before replacing the ownership index. This also
	-- handles snapshots where a conquered/deleted village vanished from the
	-- village list entirely, not only rows that remain as explicit foreign data.
	for _, oldVillageId in previousOwned do
		if not ownedSet[oldVillageId] then
			local entry = rendered[oldVillageId]
			local detail = entry and entry.detail or nil
			if entry and detail and detail.ownerUserId == player.UserId then
				detail.model:Destroy()
				entry.detail = nil
			end
			removeClientDetail(player, oldVillageId)
		end
	end
	if not hasOwnedCapital then
		player.RespawnLocation = nil
		gateLanding[player] = nil
	end
	playerVillageIds[player] = owned
end

function SettlementBuilder.getSettlement(player: Player): Model?
	for _, villageId in playerVillageIds[player] or {} do
		local entry = rendered[villageId]
		local detail = entry and entry.detail or nil
		if detail and detail.ownerUserId == player.UserId then
			return detail.model
		end
	end
	return nil
end

-- Part factory shared with anything that builds inside a settlement (the war
-- table uses these), so a global change to settlement parts hits everything.
SettlementBuilder.greyPart = greyPart
SettlementBuilder.labelFor = labelFor

Players.PlayerRemoving:Connect(function(player)
	-- Their fog-safe shells stay in the world (they're database rows, spec §4),
	-- while the entitlement-bearing detail layer is removed.
	for _, villageId in playerVillageIds[player] or {} do
		local entry = rendered[villageId]
		local detail = entry and entry.detail or nil
		if entry and detail and detail.ownerUserId == player.UserId then
			detail.model:Destroy()
			entry.detail = nil
		end
	end
	playerVillageIds[player] = nil
	teleported[player] = nil
	gateLanding[player] = nil
end)

-- Anyone who ends up under the world — a fall from the default spawn, a
-- respawn that beat the settlement being built, a bad teleport — is put back
-- at their own gate. One check a second, and it only ever moves a character
-- that is already lost.
task.spawn(function()
	while true do
		task.wait(1)
		for player, landing in gateLanding do
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			if character and root and root:IsA("BasePart") and root.Position.Y < -60 then
				character:PivotTo(landing)
				root.AssemblyLinearVelocity = Vector3.zero
				warn(string.format("[World] %s was under the world; returned to their gate", player.Name))
			end
		end
	end
end)

return SettlementBuilder
