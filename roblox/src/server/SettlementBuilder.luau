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

local SettlementBuilder = {}

-- Shared with the battle scene, which has to form up on the same ground.
local TILE = Config.TILE_STUDS
local WALL_HALF = Config.WALL_HALF
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

-- The people who live here.
--
-- [Adam, 2026-08-23] buildings should be "occupied by people and horses". A
-- settlement with an army of two hundred and nobody standing in it reads as a
-- diorama, not a town.
--
-- Deliberately cheap and deliberately dumb: anchored parts, no Humanoids, no
-- pathfinding, no per-frame work at all. They are scenery that happens to be
-- proportional to something true - how many troops the settlement is actually
-- holding. Same shape as the battle scene's bodies, which already proved this
-- is the affordable way to put a crowd on a phone.
local MAX_VILLAGERS = 24

local function renderOccupants(container: Model, origin: CFrame, troopCount: number)
	local existing = container:FindFirstChild("Occupants")
	if existing then
		existing:Destroy()
	end
	if troopCount < 1 then
		return
	end
	local folder = Instance.new("Folder")
	folder.Name = "Occupants"
	folder.Parent = container

	local count = math.clamp(math.floor(troopCount / 5), 1, MAX_VILLAGERS)
	for index = 1, count do
		-- Deterministic scatter inside the walls, from the index alone.
		local angle = (index * 2.39996) -- golden angle: spreads without clumping
		local radius = 10 + ((index * 7) % 26)
		local x = math.cos(angle) * radius
		local z = math.sin(angle) * radius - 6
		local body = greyPart("Villager", Vector3.new(1.6, 3, 1),
			origin * CFrame.new(x, 1.5, z), folder, Color3.fromRGB(96, 84, 72))
		body.CastShadow = false
		local head = greyPart("VillagerHead", Vector3.new(1.2, 1.2, 1.2),
			origin * CFrame.new(x, 3.6, z), folder, Color3.fromRGB(198, 168, 140))
		head.CastShadow = false
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
	local part: Part
	if level <= 0 then
		part = greyPart("Structure", Vector3.new(BUILDING_FOOTPRINT, 1, BUILDING_FOOTPRINT),
			origin * CFrame.new(position.X, 0.5, position.Z), model, Color3.fromRGB(90, 90, 90))
		labelFor(part, displayName .. " — not built")
	else
		-- A building GROWS OUTWARD as well as upward.
		--
		-- [Adam, 2026-08-23] "those buildings needs to be occupied by people and
		-- horses. A village will grow much larger."
		--
		-- Before this a level 1 and a level 10 were the same 12-stud box, just
		-- taller, so levelling up looked like nothing happening. Now the
		-- footprint widens and outbuildings appear around it, and a developed
		-- settlement reads as a place people live in rather than a row of
		-- identical slabs.
		local height = 6 + 2 * level
		local footprint = BUILDING_FOOTPRINT + math.min(level, 10) * 0.25
		part = greyPart("Structure", Vector3.new(footprint, height, footprint),
			origin * CFrame.new(position.X, height / 2, position.Z), model)
		labelFor(part, string.format("%s  Lv %d", displayName, level))

		-- Outbuildings: one per three levels, ringed around the main structure.
		-- Deterministic placement - the same village always looks like itself,
		-- and no runtime RNG means no drift between two players looking at it.
		local annexes = math.min(math.floor(level / 3), 6)
		for index = 1, annexes do
			local angle = (index / 6) * math.pi * 2
			-- Kept tight on purpose: the closest neighbours in LAYOUT are 15
			-- studs apart, so a wider ring would clip an annex straight through
			-- the building next door.
			local radius = footprint * 0.35 + 0.5
			local annexHeight = 3 + (index % 3)
			greyPart(string.format("Annex%d", index), Vector3.new(3, annexHeight, 3),
				origin * CFrame.new(
					position.X + math.cos(angle) * radius,
					annexHeight / 2,
					position.Z + math.sin(angle) * radius),
				model, Color3.fromRGB(104, 96, 84))
		end
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

	-- The region floor, TILED.
	--
	-- This used to be one part spanning every settlement, which with ten of
	-- them is 9,540 x 7,780 studs - far past Roblox's 2,048-stud limit, so the
	-- part was never created and the whole region had no floor. Nothing
	-- errored; the build printed its tree count and carried on, and the world
	-- was a void with village plates and trees hanging in it.
	local tiles = Config.groundTiles(minX, maxX, minZ, maxZ)
	for index, tile in tiles do
		local slab = greyPart(string.format("RegionGround%d", index), Vector3.new(tile.sx, 2, tile.sz),
			CFrame.new(tile.cx, -2.05, tile.cz), wildernessFolder, Color3.fromRGB(88, 102, 70))
		slab.Material = Enum.Material.Grass
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
				-- Repopulate on the same version bump the buildings use, so the
				-- crowd tracks the garrison without a second trigger to forget.
				local troops = 0
				for _, troop in Buildings.TROOP_ORDER do
					troops += math.max(0, math.floor(tonumber(village.army and village.army[troop]) or 0))
				end
				renderOccupants(entry.model, origin, troops)
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
				local landing = origin * CFrame.new(0, 6, WALL_HALF - 10)
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
