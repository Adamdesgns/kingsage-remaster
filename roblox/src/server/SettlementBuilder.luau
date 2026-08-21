--!strict
-- Region renderer: EVERY village in the snapshot becomes a real place at its
-- map-derived position, with walkable wilderness between them (spec §4).
-- Own villages render full (buildings, prompts, spawn); foreign villages are
-- fog-of-war silhouettes (walls + generic keep + name — never levels, never
-- prompts). Positions come from village map coords, not sessions: the world
-- looks the same every join. Grey boxes only (spec §7).
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Buildings = require(ReplicatedStorage:WaitForChild("WorldShared"):WaitForChild("Buildings"))

local SettlementBuilder = {}

local TILE = 220 -- studs per world-map tile (50x50 grid)
local WALL_HALF = 55
local BUILDING_FOOTPRINT = 12

-- Fixed layout inside a settlement: gate faces +Z (south); main street runs
-- gate -> keep; economy row west, military row east, academy north.
local LAYOUT: { [string]: Vector3 } = {
	hq = Vector3.new(0, 0, 5),
	market = Vector3.new(-16, 0, 28),
	warehouse = Vector3.new(16, 0, 28),
	barracks = Vector3.new(35, 0, 15),
	stable = Vector3.new(35, 0, 0),
	workshop = Vector3.new(35, 0, -15),
	smithy = Vector3.new(35, 0, -30),
	timber = Vector3.new(-35, 0, 15),
	quarry = Vector3.new(-35, 0, 0),
	iron = Vector3.new(-35, 0, -15),
	farm = Vector3.new(-35, 0, -30),
	academy = Vector3.new(0, 0, -35),
	wall = Vector3.new(-16, 0, 44),
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

local function renderShellWalls(model: Model, origin: CFrame)
	local ground = greyPart("Ground", Vector3.new(WALL_HALF * 2 + 20, 2, WALL_HALF * 2 + 20),
		origin * CFrame.new(0, -1, 0), model, Color3.fromRGB(96, 108, 78))
	ground.Material = Enum.Material.Grass
	local wallHeight, wallThickness = 10, 3
	greyPart("WallN", Vector3.new(WALL_HALF * 2, wallHeight, wallThickness), origin * CFrame.new(0, wallHeight / 2, -WALL_HALF), model)
	greyPart("WallW", Vector3.new(wallThickness, wallHeight, WALL_HALF * 2), origin * CFrame.new(-WALL_HALF, wallHeight / 2, 0), model)
	greyPart("WallE", Vector3.new(wallThickness, wallHeight, WALL_HALF * 2), origin * CFrame.new(WALL_HALF, wallHeight / 2, 0), model)
	local gateGap = 12
	local southSegment = (WALL_HALF * 2 - gateGap) / 2
	greyPart("WallS1", Vector3.new(southSegment, wallHeight, wallThickness), origin * CFrame.new(-(gateGap / 2 + southSegment / 2), wallHeight / 2, WALL_HALF), model)
	greyPart("WallS2", Vector3.new(southSegment, wallHeight, wallThickness), origin * CFrame.new(gateGap / 2 + southSegment / 2, wallHeight / 2, WALL_HALF), model)
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
	local keep = greyPart("KeepMassing", Vector3.new(18, 14, 18), origin * CFrame.new(0, 7, 0), model, Color3.fromRGB(105, 105, 105))
	labelFor(keep, villageName)
	local banner = greyPart("BannerPost", Vector3.new(1, 10, 1), origin * CFrame.new(0, 5, WALL_HALF + 6), model, kingdomColor)
	labelFor(banner, kingdomName)
	model.Parent = settlementsFolder
	return model
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
	local part: Part
	if level <= 0 then
		part = greyPart("Structure", Vector3.new(BUILDING_FOOTPRINT, 1, BUILDING_FOOTPRINT),
			origin * CFrame.new(position.X, 0.5, position.Z), model, Color3.fromRGB(90, 90, 90))
		labelFor(part, displayName .. " — not built")
	else
		local height = 6 + 2 * level
		part = greyPart("Structure", Vector3.new(BUILDING_FOOTPRINT, height, BUILDING_FOOTPRINT),
			origin * CFrame.new(position.X, height / 2, position.Z), model)
		labelFor(part, string.format("%s  Lv %d", displayName, level))
	end

	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "InteractPrompt"
	prompt.ActionText = "Upgrade"
	prompt.ObjectText = displayName
	prompt.HoldDuration = 0.35
	prompt.MaxActivationDistance = 12
	prompt.RequiresLineOfSight = false
	prompt.Parent = part

	if building == "barracks" then
		local recruit = Instance.new("ProximityPrompt")
		recruit.Name = "RecruitPrompt"
		recruit.ActionText = Buildings.RECRUIT_PRESET.label
		recruit.ObjectText = displayName
		recruit.HoldDuration = 0.35
		recruit.MaxActivationDistance = 12
		recruit.RequiresLineOfSight = false
		recruit.UIOffset = Vector2.new(0, 60)
		recruit.KeyboardKeyCode = Enum.KeyCode.R
		recruit.Parent = part
	end

	model.Parent = container
end

local function renderFullShellParts(model: Model, origin: CFrame, villageName: string)
	renderShellWalls(model, origin)
	labelFor(greyPart("NamePost", Vector3.new(1, 8, 1), origin * CFrame.new(0, 4, WALL_HALF + 6), model), villageName)

	local street = greyPart("StreetMain", Vector3.new(6, 0.2, WALL_HALF + 40), origin * CFrame.new(0, 0.11, (WALL_HALF - 40) / 2 + 20), model, Color3.fromRGB(70, 70, 70))
	street.Material = Enum.Material.Slate
	local cross = greyPart("StreetCross", Vector3.new(WALL_HALF * 2 - 10, 0.2, 6), origin * CFrame.new(0, 0.11, 0), model, Color3.fromRGB(70, 70, 70))
	cross.Material = Enum.Material.Slate

	-- Own-gate spawn. Not Neutral (would scatter strangers here); Enabled must
	-- stay true or Player.RespawnLocation ignores it.
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "GateSpawn"
	spawn.Size = Vector3.new(6, 1, 6)
	spawn.CFrame = origin * CFrame.new(0, 0.5, WALL_HALF - 6)
	spawn.Anchored = true
	spawn.Neutral = false
	spawn.Enabled = true
	spawn.Duration = 0
	spawn.Color = Color3.fromRGB(80, 80, 80)
	spawn.Parent = model
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

	local plane = greyPart("RegionGround", Vector3.new(maxX - minX, 2, maxZ - minZ),
		CFrame.new((minX + maxX) / 2, -2.05, (minZ + maxZ) / 2), wildernessFolder, Color3.fromRGB(88, 102, 70))
	plane.Material = Enum.Material.Grass
	plane.CastShadow = false

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
					local trunk = greyPart("TreeTrunk", Vector3.new(2, 9, 2), CFrame.new(x, 3.5, z), wildernessFolder, Color3.fromRGB(92, 70, 48))
					trunk.Material = Enum.Material.Wood
					trunk.CastShadow = false
					local canopy = greyPart("TreeCanopy", Vector3.new(9, 9, 9), CFrame.new(x, 11, z), wildernessFolder, Color3.fromRGB(64, 110, 58))
					canopy.Material = Enum.Material.Grass
					canopy.CanCollide = false
					canopy.CastShadow = false
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
				for _, building in Buildings.ORDER do
					local level = tonumber(village.buildings and village.buildings[building]) or 0
					if entry.levels[building] ~= level then
						renderBuilding(entry.model, origin, villageId, building, level)
						entry.levels[building] = level
					end
				end
				entry.stateVersion = village.stateVersion
			end
			if village.isCapital and not teleported[player] then
				teleported[player] = true
				local spawn = entry.model:FindFirstChild("GateSpawn")
				if spawn and spawn:IsA("SpawnLocation") then
					player.RespawnLocation = spawn
				end
				task.defer(function()
					local character = player.Character or player.CharacterAdded:Wait()
					local root = character:WaitForChild("HumanoidRootPart", 5)
					if root and root:IsA("BasePart") then
						root.CFrame = origin * CFrame.new(0, 4, WALL_HALF - 10)
					end
				end)
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
end)

return SettlementBuilder
