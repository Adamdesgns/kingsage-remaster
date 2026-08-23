--!strict
-- The war table is a physical campaign focal point at the keep's foot. Its
-- miniature map is intentionally decorative: live/private realm intelligence
-- remains in the client command view opened through this table (spec §3).
local WorldSession = require(script.Parent:WaitForChild("WorldSession"))
local SettlementBuilder = require(script.Parent:WaitForChild("SettlementBuilder"))

local WarTable = {}

local MAX_VISUAL_PARTS = 32

local DARK_OAK = Color3.fromRGB(52, 32, 20)
local OAK_EDGE = Color3.fromRGB(83, 50, 28)
local PARCHMENT = Color3.fromRGB(214, 188, 132)
local PARCHMENT_SHADOW = Color3.fromRGB(155, 119, 70)
local FOREST_INK = Color3.fromRGB(67, 88, 54)
local HIGHLAND_INK = Color3.fromRGB(106, 91, 71)
local MARCH_INK = Color3.fromRGB(134, 105, 57)
local RIVER_INK = Color3.fromRGB(57, 111, 132)
local REGION_INK = Color3.fromRGB(112, 45, 38)
local WAR_RED = Color3.fromRGB(126, 30, 31)
local HERALDIC_GOLD = Color3.fromRGB(194, 143, 48)
local LAMP_GLOW = Color3.fromRGB(255, 184, 104)

local function ensureTable(player: Player)
	local settlement = SettlementBuilder.getSettlement(player)
	if not settlement or settlement:FindFirstChild("WarTable") then
		return
	end

	local centerX = tonumber(settlement:GetAttribute("CenterX")) or 0
	local centerZ = tonumber(settlement:GetAttribute("CenterZ")) or 0
	local villageId = settlement:GetAttribute("VillageId")
	local tableOrigin = CFrame.new(centerX, 0, centerZ + 16)

	local tableModel = Instance.new("Model")
	tableModel.Name = "WarTable"
	tableModel:SetAttribute("ContainsPrivateIntel", false)
	tableModel:SetAttribute("VisualPartBudget", MAX_VISUAL_PARTS)
	if villageId ~= nil then
		tableModel:SetAttribute("VillageId", villageId)
	end
	-- Parent immediately so concurrent state changes see the duplicate guard.
	tableModel.Parent = settlement

	local partCount = 0
	local function makePart(
		name: string,
		size: Vector3,
		localCFrame: CFrame,
		color: Color3,
		material: Enum.Material,
		solid: boolean
	): Part
		partCount += 1
		assert(partCount <= MAX_VISUAL_PARTS, "WarTable exceeded its visual part budget")

		local part = SettlementBuilder.greyPart(
			name,
			size,
			tableOrigin * localCFrame,
			tableModel,
			color
		)
		part.Material = material
		part.CanCollide = solid
		part.CanTouch = false
		part.CanQuery = solid
		part.CastShadow = solid
		return part
	end

	-- Build the useful table first. The prompt remains functional even if a
	-- future cosmetic edit fails inside the protected decoration pass below.
	local tableTop = makePart(
		"TableTop",
		Vector3.new(18, 0.9, 12),
		CFrame.new(0, 4, 0),
		DARK_OAK,
		Enum.Material.WoodPlanks,
		true
	)
	tableModel.PrimaryPart = tableTop

	for _, legPosition in {
		Vector3.new(-7.7, 2, -4.7),
		Vector3.new(7.7, 2, -4.7),
		Vector3.new(-7.7, 2, 4.7),
		Vector3.new(7.7, 2, 4.7),
	} do
		makePart(
			"TableLeg",
			Vector3.new(1.25, 4, 1.25),
			CFrame.new(legPosition),
			DARK_OAK,
			Enum.Material.WoodPlanks,
			true
		)
	end

	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "TablePrompt"
	prompt.ActionText = "Open war table"
	prompt.ObjectText = "Plan marches • review reports"
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.HoldDuration = 0.25
	prompt.MaxActivationDistance = 12
	prompt.RequiresLineOfSight = false
	prompt.ClickablePrompt = true
	-- Keep this as a direct Model child: the owner-local client bridge and
	-- DemoTour both locate TablePrompt here. No server prompt is replicated.
	prompt.Parent = tableModel

	local decorationOk, decorationError = pcall(function()
		-- Raised oak rim keeps the inset map readable from every approach.
		makePart("NorthRim", Vector3.new(18.4, 0.5, 0.45), CFrame.new(0, 4.7, -5.78), OAK_EDGE, Enum.Material.WoodPlanks, false)
		makePart("SouthRim", Vector3.new(18.4, 0.5, 0.45), CFrame.new(0, 4.7, 5.78), OAK_EDGE, Enum.Material.WoodPlanks, false)
		makePart("WestRim", Vector3.new(0.45, 0.5, 11.1), CFrame.new(-8.78, 4.7, 0), OAK_EDGE, Enum.Material.WoodPlanks, false)
		makePart("EastRim", Vector3.new(0.45, 0.5, 11.1), CFrame.new(8.78, 4.7, 0), OAK_EDGE, Enum.Material.WoodPlanks, false)

		makePart("ParchmentMap", Vector3.new(16.4, 0.14, 10.2), CFrame.new(0, 4.53, 0), PARCHMENT, Enum.Material.Fabric, false)

		-- Heraldic cloth hangs from the short ends without blocking the aisle.
		makePart("WestCloth", Vector3.new(0.16, 2.2, 6.4), CFrame.new(-9.08, 3.45, 0), WAR_RED, Enum.Material.Fabric, false)
		makePart("EastCloth", Vector3.new(0.16, 2.2, 6.4), CFrame.new(9.08, 3.45, 0), WAR_RED, Enum.Material.Fabric, false)
		makePart("WestGoldTrim", Vector3.new(0.19, 0.22, 6.5), CFrame.new(-9.1, 2.38, 0), HERALDIC_GOLD, Enum.Material.Fabric, false)
		makePart("EastGoldTrim", Vector3.new(0.19, 0.22, 6.5), CFrame.new(9.1, 2.38, 0), HERALDIC_GOLD, Enum.Material.Fabric, false)

		-- These shapes are a fixed cartographer's illustration, never live army,
		-- scout, ownership, or resource data.
		makePart("ForestRelief", Vector3.new(3.3, 0.1, 1.8), CFrame.new(-4.1, 4.66, -2.4) * CFrame.Angles(0, math.rad(12), 0), FOREST_INK, Enum.Material.Grass, false)
		makePart("HighlandRelief", Vector3.new(2.7, 0.16, 1.5), CFrame.new(0.3, 4.69, 1.9) * CFrame.Angles(0, math.rad(-18), 0), HIGHLAND_INK, Enum.Material.Slate, false)
		makePart("MarchRelief", Vector3.new(2.9, 0.12, 1.25), CFrame.new(4.1, 4.67, -2.2) * CFrame.Angles(0, math.rad(20), 0), MARCH_INK, Enum.Material.Ground, false)

		makePart("KingRoadWest", Vector3.new(5.7, 0.08, 0.24), CFrame.new(-2.25, 4.72, 0.2) * CFrame.Angles(0, math.rad(-12), 0), PARCHMENT_SHADOW, Enum.Material.Ground, false)
		makePart("KingRoadEast", Vector3.new(4.8, 0.08, 0.24), CFrame.new(2.85, 4.72, -0.75) * CFrame.Angles(0, math.rad(19), 0), PARCHMENT_SHADOW, Enum.Material.Ground, false)

		makePart("RiverNorth", Vector3.new(5.2, 0.09, 0.3), CFrame.new(-2.6, 4.74, -1.2) * CFrame.Angles(0, math.rad(24), 0), RIVER_INK, Enum.Material.Glass, false)
		makePart("RiverSouth", Vector3.new(4.7, 0.09, 0.3), CFrame.new(1.65, 4.74, 0.55) * CFrame.Angles(0, math.rad(35), 0), RIVER_INK, Enum.Material.Glass, false)

		makePart("RegionLineNorth", Vector3.new(3.7, 0.07, 0.13), CFrame.new(2.65, 4.76, -3.25) * CFrame.Angles(0, math.rad(-15), 0), REGION_INK, Enum.Material.SmoothPlastic, false)
		makePart("RegionLineEast", Vector3.new(0.13, 0.07, 3.2), CFrame.new(5.0, 4.76, 1.15) * CFrame.Angles(0, math.rad(8), 0), REGION_INK, Enum.Material.SmoothPlastic, false)
		makePart("RegionLineSouth", Vector3.new(3.8, 0.07, 0.13), CFrame.new(-2.55, 4.76, 3.25) * CFrame.Angles(0, math.rad(11), 0), REGION_INK, Enum.Material.SmoothPlastic, false)
		makePart("RegionLineWest", Vector3.new(0.13, 0.07, 2.9), CFrame.new(-5.45, 4.76, 0.75) * CFrame.Angles(0, math.rad(-9), 0), REGION_INK, Enum.Material.SmoothPlastic, false)

		local pinSpecs = {
			{ position = Vector3.new(-5.4, 5.15, 2.8), color = WAR_RED },
			{ position = Vector3.new(-1.6, 5.15, -2.7), color = HERALDIC_GOLD },
			{ position = Vector3.new(1.35, 5.15, 2.65), color = WAR_RED },
			{ position = Vector3.new(3.3, 5.15, -1.05), color = HERALDIC_GOLD },
			{ position = Vector3.new(5.65, 5.15, 2.35), color = WAR_RED },
		}
		for index, pinSpec in pinSpecs do
			local pin = makePart(
				string.format("MapPin%02d", index),
				Vector3.new(0.78, 0.28, 0.28),
				CFrame.new(pinSpec.position) * CFrame.Angles(0, 0, math.rad(90)),
				pinSpec.color,
				Enum.Material.Metal,
				false
			)
			pin.Shape = Enum.PartType.Cylinder
		end

		local compass = makePart(
			"CompassMedallion",
			Vector3.new(0.1, 1.35, 1.35),
			CFrame.new(6.75, 4.76, -4.05) * CFrame.Angles(0, 0, math.rad(90)),
			HERALDIC_GOLD,
			Enum.Material.Metal,
			false
		)
		compass.Shape = Enum.PartType.Cylinder

		local commandLamp = makePart(
			"CommandLamp",
			Vector3.new(0.72, 0.6, 0.6),
			CFrame.new(7.25, 5.08, 4.45) * CFrame.Angles(0, 0, math.rad(90)),
			LAMP_GLOW,
			Enum.Material.Neon,
			false
		)
		commandLamp.Shape = Enum.PartType.Cylinder

		local warmLight = Instance.new("PointLight")
		warmLight.Name = "CampaignGlow"
		warmLight.Color = LAMP_GLOW
		warmLight.Brightness = 1.25
		warmLight.Range = 17
		warmLight.Shadows = false
		warmLight.Parent = commandLamp
	end)

	tableModel:SetAttribute("VisualPartCount", partCount)
	if not decorationOk then
		warn(string.format("WarTable decoration failed for player %d: %s", player.UserId, tostring(decorationError)))
	end
	-- The source model lives in ServerStorage. Refresh only its owner so the
	-- client-local settlement receives the newly completed campaign table.
	SettlementBuilder.syncPlayer(player, if villageId ~= nil then tostring(villageId) else nil)
end

WorldSession.StateChanged.Event:Connect(function(player: Player)
	-- Deferred so this never depends on BindableEvent handler ordering:
	-- SettlementBuilder's own StateChanged handler runs first regardless,
	-- and the settlement exists by the time we look for it.
	task.defer(ensureTable, player)
end)

return WarTable
