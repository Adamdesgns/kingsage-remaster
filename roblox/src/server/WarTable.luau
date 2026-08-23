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
local WAR_RED = Color3.fromRGB(126, 30, 31)
local HERALDIC_GOLD = Color3.fromRGB(194, 143, 48)
local CANDLE_WAX = Color3.fromRGB(226, 197, 135)
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
		Vector3.new(20, 1.2, 13),
		CFrame.new(0, 4.2, 0),
		DARK_OAK,
		Enum.Material.WoodPlanks,
		true
	)
	tableModel.PrimaryPart = tableTop

	for _, legPosition in {
		Vector3.new(-8.5, 2.1, -5.1),
		Vector3.new(8.5, 2.1, -5.1),
		Vector3.new(-8.5, 2.1, 5.1),
		Vector3.new(8.5, 2.1, 5.1),
	} do
		makePart(
			"TableLeg",
			Vector3.new(1.8, 4.2, 1.8),
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
		-- Deep aprons and low stretchers turn the slab into a credible trestle
		-- campaign table. They use the same collision footprint as the proven top
		-- and legs, so the approach aisle and prompt reach remain unchanged.
		makePart("NorthApron", Vector3.new(18.2, 1.45, 0.75), CFrame.new(0, 3.35, -5.65), DARK_OAK, Enum.Material.WoodPlanks, true)
		makePart("SouthApron", Vector3.new(18.2, 1.45, 0.75), CFrame.new(0, 3.35, 5.65), DARK_OAK, Enum.Material.WoodPlanks, true)
		makePart("WestApron", Vector3.new(0.75, 1.45, 10.6), CFrame.new(-9.15, 3.35, 0), DARK_OAK, Enum.Material.WoodPlanks, true)
		makePart("EastApron", Vector3.new(0.75, 1.45, 10.6), CFrame.new(9.15, 3.35, 0), DARK_OAK, Enum.Material.WoodPlanks, true)
		makePart("NorthStretcher", Vector3.new(15.4, 0.7, 0.8), CFrame.new(0, 1.35, -4.8), OAK_EDGE, Enum.Material.WoodPlanks, false)
		makePart("SouthStretcher", Vector3.new(15.4, 0.7, 0.8), CFrame.new(0, 1.35, 4.8), OAK_EDGE, Enum.Material.WoodPlanks, false)

		-- Raised oak rim keeps the inset map readable from every approach.
		makePart("NorthRim", Vector3.new(20.4, 0.55, 0.5), CFrame.new(0, 5.08, -6.22), OAK_EDGE, Enum.Material.WoodPlanks, false)
		makePart("SouthRim", Vector3.new(20.4, 0.55, 0.5), CFrame.new(0, 5.08, 6.22), OAK_EDGE, Enum.Material.WoodPlanks, false)
		makePart("WestRim", Vector3.new(0.5, 0.55, 11.9), CFrame.new(-9.72, 5.08, 0), OAK_EDGE, Enum.Material.WoodPlanks, false)
		makePart("EastRim", Vector3.new(0.5, 0.55, 11.9), CFrame.new(9.72, 5.08, 0), OAK_EDGE, Enum.Material.WoodPlanks, false)

		makePart("ParchmentMap", Vector3.new(18.2, 0.16, 11.2), CFrame.new(0, 4.93, 0), PARCHMENT, Enum.Material.Fabric, false)

		-- Small iron-brass corner caps keep the restraint of a working table while
		-- catching just enough warm light to describe its thickness.
		for _, capPosition in {
			Vector3.new(-8.85, 5.04, -5.35), Vector3.new(8.85, 5.04, -5.35),
			Vector3.new(-8.85, 5.04, 5.35), Vector3.new(8.85, 5.04, 5.35),
		} do
			makePart("TableCornerCap", Vector3.new(1.45, 0.28, 1.45), CFrame.new(capPosition), HERALDIC_GOLD, Enum.Material.Metal, false)
		end

		-- These shapes are a fixed cartographer's illustration, never live army,
		-- scout, ownership, or resource data.
		makePart("ForestRelief", Vector3.new(3.6, 0.1, 2), CFrame.new(-4.55, 5.05, -2.55) * CFrame.Angles(0, math.rad(12), 0), FOREST_INK, Enum.Material.Grass, false)
		makePart("HighlandRelief", Vector3.new(2.9, 0.16, 1.65), CFrame.new(0.35, 5.08, 2.15) * CFrame.Angles(0, math.rad(-18), 0), HIGHLAND_INK, Enum.Material.Slate, false)
		makePart("MarchRelief", Vector3.new(3.15, 0.12, 1.4), CFrame.new(4.55, 5.06, -2.35) * CFrame.Angles(0, math.rad(20), 0), MARCH_INK, Enum.Material.Ground, false)

		makePart("KingRoadWest", Vector3.new(6.2, 0.08, 0.24), CFrame.new(-2.5, 5.11, 0.25) * CFrame.Angles(0, math.rad(-12), 0), PARCHMENT_SHADOW, Enum.Material.Ground, false)
		makePart("KingRoadEast", Vector3.new(5.2, 0.08, 0.24), CFrame.new(3.15, 5.11, -0.8) * CFrame.Angles(0, math.rad(19), 0), PARCHMENT_SHADOW, Enum.Material.Ground, false)

		makePart("RiverNorth", Vector3.new(5.7, 0.09, 0.3), CFrame.new(-2.85, 5.13, -1.3) * CFrame.Angles(0, math.rad(24), 0), RIVER_INK, Enum.Material.Glass, false)
		makePart("RiverSouth", Vector3.new(5.1, 0.09, 0.3), CFrame.new(1.8, 5.13, 0.6) * CFrame.Angles(0, math.rad(35), 0), RIVER_INK, Enum.Material.Glass, false)

		local pinSpecs = {
			{ position = Vector3.new(-5.8, 5.5, 3), color = WAR_RED },
			{ position = Vector3.new(-1.7, 5.5, -2.9), color = HERALDIC_GOLD },
			{ position = Vector3.new(3.6, 5.5, -1.15), color = WAR_RED },
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
			CFrame.new(7.45, 5.15, -4.45) * CFrame.Angles(0, 0, math.rad(90)),
			HERALDIC_GOLD,
			Enum.Material.Metal,
			false
		)
		compass.Shape = Enum.PartType.Cylinder

		local commandLamp = makePart(
			"CommandLamp",
			Vector3.new(1.15, 0.42, 0.42),
			CFrame.new(8.15, 5.61, 4.85) * CFrame.Angles(0, 0, math.rad(90)),
			CANDLE_WAX,
			Enum.Material.SmoothPlastic,
			false
		)
		commandLamp.Shape = Enum.PartType.Cylinder

		local warmLight = Instance.new("PointLight")
		warmLight.Name = "CampaignGlow"
		warmLight.Color = LAMP_GLOW
		warmLight.Brightness = 1.05
		warmLight.Range = 20
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
