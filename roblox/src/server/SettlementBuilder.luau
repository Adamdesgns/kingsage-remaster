--!strict
-- Renders a player's capital as a walkable grey-box settlement, purely from
-- world-server state. A level-3 barracks on the server IS a level-3 grey box
-- here. Diffs on stateVersion; never invents state. Grey boxes only (spec §7).
local Players = game:GetService("Players")

local SettlementBuilder = {}

local WALL_HALF = 55 -- wall ring is 110x110, everything lives inside
local BUILDING_FOOTPRINT = 12
local SETTLEMENT_SPACING = 400

-- Fixed layout: gate faces +Z (south). Main street runs gate -> keep.
-- Economy row west, military row east, academy north (plan Task 6).
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
	wall = Vector3.new(-16, 0, 44), -- the wall BUILDING plot (upgrades the ring); ring itself is drawn separately
}

local BUILDING_ORDER = { "hq", "timber", "quarry", "iron", "farm", "warehouse", "barracks", "wall", "academy", "stable", "workshop", "smithy", "market" }

local settlementsFolder = Instance.new("Folder")
settlementsFolder.Name = "Settlements"
settlementsFolder.Parent = workspace

type Rendered = { model: Model, origin: CFrame, stateVersion: number, levels: { [string]: number }, slot: number }
local rendered: { [Player]: Rendered } = {}
local usedSlots: { [number]: boolean } = {}

local function takeSlot(): number
	local slot = 0
	while usedSlots[slot] do
		slot += 1
	end
	usedSlots[slot] = true
	return slot
end

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
	billboard.MaxDistance = 220
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

local function buildingDisplayName(building: string): string
	local names: { [string]: string } = {
		hq = "Keep", timber = "Timber Camp", quarry = "Quarry", iron = "Iron Mine",
		farm = "Farm", warehouse = "Warehouse", barracks = "Barracks", wall = "Wall Works",
		academy = "Academy", stable = "Stable", workshop = "Workshop", smithy = "Smithy", market = "Market",
	}
	return names[building] or building
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

	local displayName = buildingDisplayName(building)
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
		recruit.ActionText = "Recruit 5 Spearmen"
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

local function renderShell(model: Model, origin: CFrame, villageName: string)
	-- ground
	local ground = greyPart("Ground", Vector3.new(WALL_HALF * 2 + 20, 2, WALL_HALF * 2 + 20),
		origin * CFrame.new(0, -1, 0), model, Color3.fromRGB(96, 108, 78))
	ground.Material = Enum.Material.Grass
	labelFor(greyPart("NamePost", Vector3.new(1, 8, 1), origin * CFrame.new(0, 4, WALL_HALF + 6), model), villageName)

	-- wall ring with a south gate gap
	local wallHeight, wallThickness = 10, 3
	greyPart("WallN", Vector3.new(WALL_HALF * 2, wallHeight, wallThickness), origin * CFrame.new(0, wallHeight / 2, -WALL_HALF), model)
	greyPart("WallW", Vector3.new(wallThickness, wallHeight, WALL_HALF * 2), origin * CFrame.new(-WALL_HALF, wallHeight / 2, 0), model)
	greyPart("WallE", Vector3.new(wallThickness, wallHeight, WALL_HALF * 2), origin * CFrame.new(WALL_HALF, wallHeight / 2, 0), model)
	local gateGap = 12
	local southSegment = (WALL_HALF * 2 - gateGap) / 2
	greyPart("WallS1", Vector3.new(southSegment, wallHeight, wallThickness), origin * CFrame.new(-(gateGap / 2 + southSegment / 2), wallHeight / 2, WALL_HALF), model)
	greyPart("WallS2", Vector3.new(southSegment, wallHeight, wallThickness), origin * CFrame.new(gateGap / 2 + southSegment / 2, wallHeight / 2, WALL_HALF), model)

	-- main street: gate -> keep, and a cross street
	local street = greyPart("StreetMain", Vector3.new(6, 0.2, WALL_HALF + 40), origin * CFrame.new(0, 0.11, (WALL_HALF - 40) / 2 + 20), model, Color3.fromRGB(70, 70, 70))
	street.Material = Enum.Material.Slate
	local cross = greyPart("StreetCross", Vector3.new(WALL_HALF * 2 - 10, 0.2, 6), origin * CFrame.new(0, 0.11, 0), model, Color3.fromRGB(70, 70, 70))
	cross.Material = Enum.Material.Slate

	-- spawn just inside the gate
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "GateSpawn"
	spawn.Size = Vector3.new(6, 1, 6)
	spawn.CFrame = origin * CFrame.new(0, 0.5, WALL_HALF - 6)
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Color = Color3.fromRGB(80, 80, 80)
	spawn.Parent = model
end

-- Build or update the player's settlement from a fresh snapshot.
function SettlementBuilder.onState(player: Player, snapshot: any, kingdomId: string)
	local villages = snapshot and snapshot.world and snapshot.world.villages
	if typeof(villages) ~= "table" then
		return
	end
	local village: any = nil
	for _, candidate in villages do
		if candidate.kingdomId == kingdomId and candidate.isCapital then
			village = candidate
			break
		end
	end
	if not village then
		for _, candidate in villages do
			if candidate.kingdomId == kingdomId then
				village = candidate
				break
			end
		end
	end
	if not village then
		return
	end

	local current = rendered[player]
	if current and current.stateVersion == village.stateVersion then
		return
	end

	if not current then
		local slot = takeSlot()
		local origin = CFrame.new(slot * SETTLEMENT_SPACING, 0, 0)
		local model = Instance.new("Model")
		model:SetAttribute("VillageId", tostring(village.id))
		model:SetAttribute("OwnerUserId", player.UserId)
		model:SetAttribute("CenterX", origin.Position.X)
		model:SetAttribute("CenterZ", origin.Position.Z)
		model:SetAttribute("BoundsHalf", WALL_HALF + 20)
		model.Name = "Settlement_" .. player.Name
		renderShell(model, origin, tostring(village.name))
		model.Parent = settlementsFolder
		current = { model = model, origin = origin, stateVersion = -1, levels = {}, slot = slot }
		rendered[player] = current
		-- put the avatar at the gate of their own settlement
		task.defer(function()
			local character = player.Character or player.CharacterAdded:Wait()
			local root = character:WaitForChild("HumanoidRootPart", 5)
			if root and root:IsA("BasePart") then
				root.CFrame = origin * CFrame.new(0, 4, WALL_HALF - 10)
			end
		end)
	end

	for _, building in BUILDING_ORDER do
		local level = tonumber(village.buildings and village.buildings[building]) or 0
		if current.levels[building] ~= level then
			renderBuilding(current.model, current.origin, tostring(village.id), building, level)
			current.levels[building] = level
		end
	end
	current.stateVersion = village.stateVersion
end

function SettlementBuilder.getSettlement(player: Player): Model?
	local current = rendered[player]
	return current and current.model or nil
end

Players.PlayerRemoving:Connect(function(player)
	local current = rendered[player]
	if current then
		usedSlots[current.slot] = nil
		current.model:Destroy()
		rendered[player] = nil
	end
end)

return SettlementBuilder
