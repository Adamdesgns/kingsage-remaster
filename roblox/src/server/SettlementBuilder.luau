--!strict
-- Region renderer: EVERY village in the snapshot becomes a real place at its
-- map-derived position, with walkable wilderness between them (spec §4).
-- Own villages render full (buildings, prompts, spawn); foreign villages are
-- fog-of-war silhouettes (walls + generic keep + name — never levels, never
-- prompts). Positions come from village map coords, not sessions: the world
-- looks the same every join. Grey boxes only (spec §7).
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local worldShared = ReplicatedStorage:WaitForChild("WorldShared")
local Buildings = require(worldShared:WaitForChild("Buildings"))
local Config = require(worldShared:WaitForChild("Config"))
local WorldStyle = require(script.Parent:WaitForChild("WorldStyle"))
local PALETTE = WorldStyle.PALETTE
local MATERIAL = WorldStyle.MATERIAL

local SettlementBuilder = {}

-- Shared with the battle scene, which has to form up on the same ground.
local TILE = Config.TILE_STUDS
local WALL_HALF = Config.WALL_HALF
local BUILDING_FOOTPRINT = 12

-- Fixed layout inside a settlement: gate faces +Z (south); main street runs
-- gate -> keep; economy row west, military row east, academy north.
-- Where each building stands, in studs from the settlement centre.
--
-- Spread out ten-fold along with the walls. At the old spacing every building
-- was 15 studs from its neighbour with a 12-stud footprint, so the town was a
-- solid block of touching boxes. Now there are streets between them.
local LAYOUT: { [string]: Vector3 } = {
	hq = Vector3.new(0, 0, 60),
	market = Vector3.new(-170, 0, 300),
	warehouse = Vector3.new(170, 0, 300),
	barracks = Vector3.new(360, 0, 150),
	stable = Vector3.new(360, 0, -20),
	workshop = Vector3.new(360, 0, -190),
	smithy = Vector3.new(180, 0, -330),
	timber = Vector3.new(-360, 0, 150),
	quarry = Vector3.new(-360, 0, -20),
	iron = Vector3.new(-360, 0, -190),
	farm = Vector3.new(-180, 0, -330),
	academy = Vector3.new(0, 0, -370),
	wall = Vector3.new(-170, 0, 470),
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
-- size. A keep is cut stone under slate; a farm is plaster under thatch; a
-- smithy has a chimney because a forge has to vent somewhere.
local SPEC: { [string]: BuildingSpec } = {
	hq        = spec(100, 100, 78, 30, PALETTE.stone,     MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, true),
	academy   = spec(86,  86,  62, 26, PALETTE.stoneWarm, MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, false),
	barracks  = spec(180, 84,  30, 18, PALETTE.stoneDark, MATERIAL.block,   PALETTE.roofTile,  MATERIAL.roof,   true,  true),
	stable    = spec(170, 74,  24, 16, PALETTE.timberLight, MATERIAL.timber, PALETTE.thatch,   MATERIAL.thatch, true,  false),
	workshop  = spec(126, 94,  28, 16, PALETTE.stoneDark, MATERIAL.block,   PALETTE.roofTile,  MATERIAL.roof,   true,  false),
	smithy    = spec(94,  84,  28, 16, PALETTE.stoneDark, MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, true),
	warehouse = spec(140, 106, 34, 20, PALETTE.plaster,   MATERIAL.plaster, PALETTE.roofTile,  MATERIAL.roof,   true,  false),
	market    = spec(128, 106, 26, 16, PALETTE.plaster,   MATERIAL.plaster, PALETTE.roofTile,  MATERIAL.roof,   true,  false),
	farm      = spec(158, 116, 22, 14, PALETTE.plaster,   MATERIAL.plaster, PALETTE.thatch,    MATERIAL.thatch, true,  true),
	timber    = spec(138, 86,  22, 14, PALETTE.timberLight, MATERIAL.timber, PALETTE.thatch,   MATERIAL.thatch, false, false),
	quarry    = spec(126, 86,  20, 12, PALETTE.stone,     MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, false),
	iron      = spec(126, 86,  20, 12, PALETTE.stoneDark, MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, true),
	wall      = spec(96,  66,  26, 14, PALETTE.stone,     MATERIAL.stone,   PALETTE.roofSlate, MATERIAL.roof,   false, false),
}


local settlementsFolder = Instance.new("Folder")
settlementsFolder.Name = "Settlements"
settlementsFolder.Parent = workspace

local wildernessFolder = Instance.new("Folder")
wildernessFolder.Name = "Wilderness"
wildernessFolder.Parent = workspace

type Entry = {
	model: Model,
	mode: string, -- "full" | "shell"
	origin: CFrame,
	stateVersion: number,
	levels: { [string]: number },
	villageName: string,
	kingdomName: string,
	kingdomColor: Color3,
	ownerUserId: number?,
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

local function labelFor(part: BasePart, text: string)
	local existing = part:FindFirstChild("NameBillboard")
	if existing then
		local label = (existing :: Instance):FindFirstChildOfClass("TextLabel")
		if label then
			label.Text = text
		end
		return
	end
	local billboard = Instance.new("BillboardGui")
	billboard.Name = "NameBillboard"
	billboard.Size = UDim2.fromOffset(220, 44)
	billboard.StudsOffsetWorldSpace = Vector3.new(0, part.Size.Y / 2 + 3, 0)
	billboard.AlwaysOnTop = false
	billboard.MaxDistance = 260
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 0.35
	label.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextScaled = true
	label.Font = Enum.Font.GothamBold
	label.Text = text
	label.Parent = billboard
	billboard.Parent = part
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
	return 45
end

--- A curtain wall with battlements, corner towers and a gatehouse.
---
--- Four flat slabs are a fence. Crenellations, towers and an arched gate are
--- what make a settlement read as fortified — and they are also the thing an
--- attacker is looking at when the Rampart level matters.
local function renderShellWalls(model: Model, origin: CFrame)
	local ground = WorldStyle.part("Ground", Vector3.new(WALL_HALF * 2 + 120, 4, WALL_HALF * 2 + 120),
		origin * CFrame.new(0, -2, 0), model, PALETTE.grass, MATERIAL.grass)
	ground.CastShadow = false

	local wallHeight, wallThickness = 38, 16
	local gateGap = gateHalf() * 2

	local function crenellate(centreX: number, centreZ: number, spanX: number, spanZ: number)
		-- Merlons along the top: the notched profile of a battlement.
		local along = if spanX > spanZ then spanX else spanZ
		local step = 26
		local count = math.max(1, math.floor(along / step))
		for index = 0, count - 1 do
			local offset = -along / 2 + step / 2 + index * step
			local x = if spanX > spanZ then centreX + offset else centreX
			local z = if spanX > spanZ then centreZ else centreZ + offset
			local merlon = WorldStyle.part("Merlon", Vector3.new(
					if spanX > spanZ then 14 else wallThickness,
					8,
					if spanX > spanZ then wallThickness else 14),
				origin * CFrame.new(x, wallHeight + 4, z), model, PALETTE.stone, MATERIAL.stone)
			merlon.CastShadow = false
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

	-- Corner towers, taller than the wall and round-shouldered.
	for _, sx in { -1, 1 } do
		for _, sz in { -1, 1 } do
			local tower = WorldStyle.part("Tower", Vector3.new(44, wallHeight + 26, 44),
				origin * CFrame.new(sx * WALL_HALF, (wallHeight + 26) / 2, sz * WALL_HALF), model, PALETTE.stone, MATERIAL.stone)
			tower.Shape = Enum.PartType.Cylinder
			tower.Orientation = Vector3.new(0, 0, 90)
			local cap = Instance.new("Part")
			cap.Name = "TowerCap"
			cap.Shape = Enum.PartType.Ball
			cap.Size = Vector3.new(46, 46, 46)
			cap.Anchored = true
			cap.Color = PALETTE.roofSlate
			cap.Material = MATERIAL.roof
			cap.CFrame = origin * CFrame.new(sx * WALL_HALF, wallHeight + 26, sz * WALL_HALF)
			cap.Parent = model
		end
	end

	-- The gatehouse: two towers and a lintel you ride under.
	for _, sx in { -1, 1 } do
		WorldStyle.part("GateTower", Vector3.new(38, wallHeight + 34, 38),
			origin * CFrame.new(sx * (gateGap / 2 + 19), (wallHeight + 34) / 2, WALL_HALF), model, PALETTE.stoneDark, MATERIAL.stone)
	end
	WorldStyle.part("GateArch", Vector3.new(gateGap + 40, 14, wallThickness + 6),
		origin * CFrame.new(0, wallHeight + 7, WALL_HALF), model, PALETTE.stoneDark, MATERIAL.stone)
	local banner = WorldStyle.part("GateBanner", Vector3.new(18, 26, 1),
		origin * CFrame.new(0, wallHeight - 6, WALL_HALF + wallThickness / 2 + 1), model, PALETTE.banner, MATERIAL.cloth)
	banner.CastShadow = false

	-- Roads: a main street from the gate to the keep, and a cross street.
	local street = WorldStyle.part("StreetMain", Vector3.new(56, 0.6, WALL_HALF * 2 - 40),
		origin * CFrame.new(0, 0.3, 0), model, PALETTE.road, MATERIAL.road)
	street.CastShadow = false
	local cross = WorldStyle.part("StreetCross", Vector3.new(WALL_HALF * 2 - 40, 0.6, 56),
		origin * CFrame.new(0, 0.3, 0), model, PALETTE.road, MATERIAL.road)
	cross.CastShadow = false

	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "GateSpawn"
	spawn.Size = Vector3.new(24, 1, 24)
	spawn.CFrame = origin * CFrame.new(0, 0.8, WALL_HALF - 40)
	spawn.Anchored = true
	spawn.Neutral = false
	spawn.Enabled = true
	spawn.Duration = 0
	spawn.Transparency = 1
	spawn.CanCollide = false
	spawn.Parent = model
end

-- Foreign silhouette: what a traveler may know from OUTSIDE the walls — the
-- walls, a generic keep massing (fixed size: implies nothing), and the name.
-- Never levels, never interiors, never prompts (fog-of-war, spec §4).
local function renderShell(villageId: string, origin: CFrame, villageName: string, kingdomName: string, kingdomColor: Color3): Model
	local model = Instance.new("Model")
	model.Name = "Settlement_" .. villageId
	model:SetAttribute("VillageId", villageId)
	model:SetAttribute("Foreign", true)
	renderShellWalls(model, origin)
	-- A foreign settlement at the same SCALE as your own, so the horizon reads
	-- honestly: a keep behind walls, no levels, no interiors. It was an 18-stud
	-- lump inside a 1,100-stud wall ring - invisible in practice.
	local keep = WorldStyle.part("KeepMassing", Vector3.new(180, 150, 180),
		origin * CFrame.new(0, 75, 0), model, PALETTE.stoneDark, MATERIAL.stone)
	labelFor(keep, villageName)
	local banner = WorldStyle.part("BannerPost", Vector3.new(8, 120, 8),
		origin * CFrame.new(0, 60, WALL_HALF + 40), model, kingdomColor, MATERIAL.cloth)
	labelFor(banner, kingdomName)
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

--- A pitched roof of two slopes, overhanging the walls like a real one.
local function pitchedRoof(model: Model, origin: CFrame, at: Vector3, w: number, d: number, wallTop: number, rise: number, colour: Color3, material: Enum.Material)
	local overhang = 6
	local half = (w + overhang) / 2
	for _, side in { 1, -1 } do
		local wedge = Instance.new("WedgePart")
		wedge.Name = "Roof"
		wedge.Size = Vector3.new(d + overhang, rise, half)
		wedge.Anchored = true
		wedge.Color = colour
		wedge.Material = material
		wedge.TopSurface = Enum.SurfaceType.Smooth
		wedge.BottomSurface = Enum.SurfaceType.Smooth
		wedge.CFrame = origin
			* CFrame.new(at.X + side * half / 2, wallTop + rise / 2, at.Z)
			* CFrame.Angles(0, math.rad(90 * side), 0)
			* CFrame.Angles(0, 0, math.rad(90))
		wedge.Parent = model
	end
	-- Ridge beam along the top, so the two slopes meet in a line rather than a
	-- seam.
	WorldStyle.part("Ridge", Vector3.new(3, 2, d + overhang),
		origin * CFrame.new(at.X, wallTop + rise, at.Z), model, PALETTE.timber, MATERIAL.timber).CastShadow = false
end

--- Windows down a face: small, dark, evenly spaced. Nothing says "building"
--- faster than openings at a human scale.
local function windowRow(model: Model, origin: CFrame, at: Vector3, w: number, d: number, height: number)
	local count = math.clamp(math.floor(w / 34), 1, 5)
	local spacing = w / (count + 1)
	for index = 1, count do
		local x = at.X - w / 2 + spacing * index
		for _, face in { 1, -1 } do
			local pane = WorldStyle.part("Window", Vector3.new(8, 12, 1.5),
				origin * CFrame.new(x, height, at.Z + face * (d / 2 + 0.5)),
				model, PALETTE.window, MATERIAL.glass)
			pane.CastShadow = false
			pane.Reflectance = 0.15
		end
	end
end

--- Exposed timber framing: corner posts and a mid rail. Cheap, and it is the
--- detail that reads as medieval from any distance.
local function timberFrame(model: Model, origin: CFrame, at: Vector3, w: number, d: number, h: number)
	for _, sx in { -1, 1 } do
		for _, sz in { -1, 1 } do
			local post = WorldStyle.part("Post", Vector3.new(6, h, 6),
				origin * CFrame.new(at.X + sx * (w / 2 - 3), h / 2, at.Z + sz * (d / 2 - 3)),
				model, PALETTE.timber, MATERIAL.timber)
			post.CastShadow = false
		end
	end
	for _, face in { 1, -1 } do
		local rail = WorldStyle.part("Rail", Vector3.new(w, 4, 2),
			origin * CFrame.new(at.X, h * 0.62, at.Z + face * (d / 2 + 0.5)),
			model, PALETTE.timber, MATERIAL.timber)
		rail.CastShadow = false
	end
end

local function renderBuilding(container: Model, origin: CFrame, villageId: string, building: string, level: number)
	local existing = container:FindFirstChild("B_" .. building)
	if existing then
		existing:Destroy()
	end
	local position = LAYOUT[building]
	if not position then
		return
	end
	local model = Instance.new("Model")
	model.Name = "B_" .. building
	model:SetAttribute("VillageId", villageId)
	model:SetAttribute("Building", building)
	model:SetAttribute("Level", level)

	local displayName = Buildings.displayName(building)
	local sp = SPEC[building] or SPEC.market
	local part: Part
	if level <= 0 then
		-- An empty plot: staked out, so you can see there is room here and what
		-- it is for.
		part = WorldStyle.part("Structure", Vector3.new(sp.w, 1, sp.d),
			origin * CFrame.new(position.X, 0.5, position.Z), model, PALETTE.dirt, MATERIAL.road)
		for _, sx in { -1, 1 } do
			for _, sz in { -1, 1 } do
				WorldStyle.part("Stake", Vector3.new(3, 12, 3),
					origin * CFrame.new(position.X + sx * (sp.w / 2 - 4), 6, position.Z + sz * (sp.d / 2 - 4)),
					model, PALETTE.timber, MATERIAL.timber).CastShadow = false
			end
		end
	else
		-- LEVEL widens the compound. It does not stretch the building into the
		-- sky: a level 30 Farm is a big farm, not a 66-stud tower.
		local grow = 1 + math.min(level, 20) * 0.014
		local width, depth = sp.w * grow, sp.d * grow

		-- A stone footing under everything, so nothing sits flush on the grass.
		WorldStyle.part("Footing", Vector3.new(width + 8, 4, depth + 8),
			origin * CFrame.new(position.X, 2, position.Z), model, PALETTE.stoneDark, MATERIAL.stone)

		part = WorldStyle.part("Structure", Vector3.new(width, sp.h, depth),
			origin * CFrame.new(position.X, 4 + sp.h / 2, position.Z), model, sp.wall, sp.wallMat)

		local wallTop = 4 + sp.h
		pitchedRoof(model, origin, position, width, depth, wallTop, sp.roof, sp.roofColour, sp.roofMat)
		windowRow(model, origin, position, width, depth, 4 + sp.h * 0.58)
		if sp.timbered then
			timberFrame(model, origin, position, width, depth, sp.h + 4)
		end
		if sp.chimney then
			local stack = WorldStyle.part("Chimney", Vector3.new(12, sp.roof + 22, 12),
				origin * CFrame.new(position.X + width * 0.3, wallTop + (sp.roof + 22) / 2 - 4, position.Z - depth * 0.28),
				model, PALETTE.stoneDark, MATERIAL.stone)
			stack.CastShadow = false
		end

		-- A doorway with a frame and a lintel, facing the gate.
		local doorZ = position.Z + depth / 2 + 0.6
		WorldStyle.part("Door", Vector3.new(14, 20, 1.5),
			origin * CFrame.new(position.X, 14, doorZ), model, PALETTE.timber, MATERIAL.timber).CastShadow = false
		WorldStyle.part("Lintel", Vector3.new(20, 4, 3),
			origin * CFrame.new(position.X, 25, doorZ), model, PALETTE.stoneDark, MATERIAL.stone).CastShadow = false

		-- Outbuildings: the compound filling out as it grows.
		local annexes = math.min(math.floor(level / 3), 6)
		for index = 1, annexes do
			local angle = (index / 6) * math.pi * 2
			local radius = math.max(width, depth) * 0.62 + 20
			local ah = 14 + (index % 3) * 4
			local ax = position.X + math.cos(angle) * radius
			local az = position.Z + math.sin(angle) * radius
			WorldStyle.part("Annex", Vector3.new(26, ah, 22),
				origin * CFrame.new(ax, 4 + ah / 2, az), model, PALETTE.plaster, MATERIAL.plaster).CastShadow = false
			pitchedRoof(model, origin, Vector3.new(ax, 0, az), 26, 22, 4 + ah, 9, sp.roofColour, sp.roofMat)
		end
	end

	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "InteractPrompt"
	prompt.ActionText = "Upgrade"
	prompt.ObjectText = displayName
	prompt.HoldDuration = 0.35
	-- Reach scaled with the buildings: 12 studs was right when a building WAS
	-- 12 studs wide. These are 90-170 across, so you would have to stand inside
	-- the wall to get a prompt.
	prompt.MaxActivationDistance = 55
	prompt.RequiresLineOfSight = false
	prompt.Parent = part

	if building == "barracks" then
		local recruit = Instance.new("ProximityPrompt")
		recruit.Name = "RecruitPrompt"
		recruit.ActionText = Buildings.RECRUIT_PRESET.label
		recruit.ObjectText = displayName
		recruit.HoldDuration = 0.35
		recruit.MaxActivationDistance = 55
		recruit.RequiresLineOfSight = false
		recruit.UIOffset = Vector2.new(0, 60)
		recruit.KeyboardKeyCode = Enum.KeyCode.R
		recruit.Parent = part
	end

	model.Parent = container
end

local function renderFullShellParts(model: Model, origin: CFrame, villageName: string)
	-- Everything a settlement is made of now lives in renderShellWalls: walls,
	-- towers, gatehouse, streets and the gate spawn. This is kept as the single
	-- entry point so callers do not need to know that.
	renderShellWalls(model, origin)
end

local function renderFull(player: Player, village: any, origin: CFrame): Entry
	local villageId = tostring(village.id)
	local model = Instance.new("Model")
	model.Name = "Settlement_" .. villageId
	model:SetAttribute("VillageId", villageId)
	model:SetAttribute("OwnerUserId", player.UserId)
	model:SetAttribute("CenterX", origin.Position.X)
	model:SetAttribute("CenterZ", origin.Position.Z)
	model:SetAttribute("BoundsHalf", WALL_HALF + 20)
	renderFullShellParts(model, origin, tostring(village.name))
	model.Parent = settlementsFolder
	return {
		model = model,
		mode = "full",
		origin = origin,
		stateVersion = -1,
		levels = {},
		villageName = tostring(village.name),
		kingdomName = "",
		kingdomColor = Color3.fromRGB(150, 150, 150),
		ownerUserId = player.UserId,
	}
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
					local trunkHeight = 34 * scale
					local trunk = WorldStyle.part("TreeTrunk", Vector3.new(7, trunkHeight, 7),
						CFrame.new(x, trunkHeight / 2, z), wildernessFolder, PALETTE.timber, MATERIAL.timber)
					trunk.CastShadow = false
					for tier = 0, 2 do
						local spread = (34 - tier * 9) * scale
						local canopy = WorldStyle.part("TreeCanopy", Vector3.new(spread, 14 * scale, spread),
							CFrame.new(x, trunkHeight + tier * 11 * scale, z), wildernessFolder,
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

	local owned: { string } = {}
	for _, village in villages do
		local villageId = tostring(village.id)
		local origin = villageOrigin(village)
		local isOwn = village.kingdomId == kingdomId
		local entry = rendered[villageId]

		if isOwn then
			if village.isCapital then
				table.insert(owned, 1, villageId) -- capital first: it owns the war table binding
			else
				table.insert(owned, villageId)
			end
			if entry and entry.mode ~= "full" then
				entry.model:Destroy()
				entry = nil
			end
			if not entry then
				entry = renderFull(player, village, origin)
				entry.kingdomName, entry.kingdomColor = kingdomInfo(snapshot, tostring(village.kingdomId))
				rendered[villageId] = entry
			end
			if entry.stateVersion ~= village.stateVersion then
				local rendered_count = 0
				for _, building in Buildings.ORDER do
					local level = tonumber(village.buildings and village.buildings[building]) or 0
					if entry.levels[building] ~= level then
						renderBuilding(entry.model, origin, villageId, building, level)
						entry.levels[building] = level
						rendered_count += 1
					end
				end
				if rendered_count > 0 then
					print(string.format("[World] %s: built %d structures at (%d, %d)",
						tostring(village.name), rendered_count,
						math.floor(origin.Position.X), math.floor(origin.Position.Z)))
				end
				entry.stateVersion = village.stateVersion
			end
			if village.isCapital then
				local spawn = entry.model:FindFirstChild("GateSpawn")
				if spawn and spawn:IsA("SpawnLocation") then
					player.RespawnLocation = spawn
				end
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
		else
			-- Foreign: shell only. An online owner's full render always wins.
			local kingdomName, kingdomColor = kingdomInfo(snapshot, tostring(village.kingdomId))
			if entry and entry.mode == "full" then
				-- another present player owns it; leave their render alone
			elseif not entry then
				rendered[villageId] = {
					model = renderShell(villageId, origin, tostring(village.name), kingdomName, kingdomColor),
					mode = "shell",
					origin = origin,
					stateVersion = -1,
					levels = {},
					villageName = tostring(village.name),
					kingdomName = kingdomName,
					kingdomColor = kingdomColor,
					ownerUserId = nil,
				}
			elseif entry.villageName ~= tostring(village.name) or entry.kingdomName ~= kingdomName then
				-- conquest/rename reached us: rebuild the shell's identity
				entry.model:Destroy()
				rendered[villageId] = {
					model = renderShell(villageId, origin, tostring(village.name), kingdomName, kingdomColor),
					mode = "shell",
					origin = origin,
					stateVersion = -1,
					levels = {},
					villageName = tostring(village.name),
					kingdomName = kingdomName,
					kingdomColor = kingdomColor,
					ownerUserId = nil,
				}
			end
		end
	end
	playerVillageIds[player] = owned
end

function SettlementBuilder.getSettlement(player: Player): Model?
	for _, villageId in playerVillageIds[player] or {} do
		local entry = rendered[villageId]
		if entry and entry.mode == "full" and entry.ownerUserId == player.UserId then
			return entry.model
		end
	end
	return nil
end

-- Part factory shared with anything that builds inside a settlement (the war
-- table uses these), so a global change to settlement parts hits everything.
SettlementBuilder.greyPart = greyPart
SettlementBuilder.labelFor = labelFor

Players.PlayerRemoving:Connect(function(player)
	-- Their villages stay in the world (they're database rows, spec §4) but
	-- drop to fog silhouettes now that no one is entitled to the detail.
	for _, villageId in playerVillageIds[player] or {} do
		local entry = rendered[villageId]
		if entry and entry.mode == "full" and entry.ownerUserId == player.UserId then
			entry.model:Destroy()
			rendered[villageId] = {
				model = renderShell(villageId, entry.origin, entry.villageName, entry.kingdomName ~= "" and entry.kingdomName or entry.villageName, entry.kingdomColor),
				mode = "shell",
				origin = entry.origin,
				stateVersion = -1,
				levels = {},
				villageName = entry.villageName,
				kingdomName = entry.kingdomName,
				kingdomColor = entry.kingdomColor,
				ownerUserId = nil,
			}
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
