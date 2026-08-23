--!strict
-- Asset-free player costume. The authoritative avatar rig stays untouched:
-- these are light, massless visual pieces welded to the existing R6 or R15
-- body after Roblox finishes loading the player's appearance.
--
-- The silhouette is grounded in a practical 14th-century commander:
-- a split wool surcoat over a mail hauberk, close hood, hose, boots, sword belt,
-- scabbard, and belt pouch. No catalogue ids, modern accessories, fantasy
-- plate, horns, glow, particles, or per-frame work.
local Players = game:GetService("Players")

local CharacterStyle = {}

local COSTUME_FOLDER = "KingsAgeCommanderCostume"
local MAX_COSTUME_PARTS = 26

-- Natural dyes and worked materials stay deliberately muted. The lighter
-- madder-red outer cloth keeps the costume readable under the world's warm
-- grade without becoming a saturated fantasy uniform.
local WOOL_RED = Color3.fromRGB(145, 57, 48)
local WOOL_RED_SHADE = Color3.fromRGB(116, 43, 38)
local WOOL_HOOD = Color3.fromRGB(103, 81, 58)
local WOOL_HOSE = Color3.fromRGB(76, 69, 57)
local MAIL = Color3.fromRGB(128, 131, 128)
local MAIL_DARK = Color3.fromRGB(94, 99, 97)
local LEATHER = Color3.fromRGB(82, 52, 30)
local LEATHER_LIGHT = Color3.fromRGB(121, 79, 42)
local BUCKLE = Color3.fromRGB(169, 126, 57)

local started = false
local hookedPlayers: { [Player]: boolean } = {}
local stripConnections: { [Model]: RBXScriptConnection } = {}
local styling: { [Model]: boolean } = {}

local function isModernAppearance(instance: Instance): boolean
	return instance:IsA("Accessory")
		or instance:IsA("Shirt")
		or instance:IsA("Pants")
		or instance:IsA("ShirtGraphic")
		or instance:IsA("CharacterMesh")
end

local function stripModernAppearance(character: Model)
	for _, child in character:GetChildren() do
		if isModernAppearance(child) then
			child:Destroy()
		end
	end

	-- Appearance assets can arrive a frame after CharacterAdded. One lifecycle
	-- connection keeps late catalogue clothing from showing through; it does no
	-- polling and is disconnected with the character.
	if not stripConnections[character] then
		stripConnections[character] = character.ChildAdded:Connect(function(child: Instance)
			if isModernAppearance(child) then
				task.defer(function()
					if child.Parent == character then
						child:Destroy()
					end
				end)
			end
		end)
		character.Destroying:Connect(function()
			local connection = stripConnections[character]
			if connection then
				connection:Disconnect()
				stripConnections[character] = nil
			end
			styling[character] = nil
		end)
	end
end

local function bodyPart(character: Model, name: string): BasePart?
	local found = character:FindFirstChild(name)
	return if found and found:IsA("BasePart") then found else nil
end

local function applyCostume(character: Model)
	if styling[character] or not character.Parent then
		return
	end
	styling[character] = true

	local ok, failure = pcall(function()
		local humanoid = character:FindFirstChildOfClass("Humanoid")
		if not humanoid then
			return
		end

		stripModernAppearance(character)

		local existing = character:FindFirstChild(COSTUME_FOLDER)
		if existing then
			existing:Destroy()
		end

		local costume = Instance.new("Folder")
		costume.Name = COSTUME_FOLDER
		costume:SetAttribute("Era", "14th-century grounded commander")
		costume:SetAttribute("ExternalAssetIds", false)
		costume:SetAttribute("VisualPartBudget", MAX_COSTUME_PARTS)
		costume.Parent = character

		local partCount = 0
		local function piece(
			name: string,
			body: BasePart,
			size: Vector3,
			relative: CFrame,
			colour: Color3,
			material: Enum.Material,
			shape: Enum.PartType?
		): Part?
			if partCount >= MAX_COSTUME_PARTS or not body:IsDescendantOf(character) then
				return nil
			end
			partCount += 1
			local visual = Instance.new("Part")
			visual.Name = name
			visual.Size = Vector3.new(
				math.max(size.X, 0.08),
				math.max(size.Y, 0.08),
				math.max(size.Z, 0.08)
			)
			visual.CFrame = body.CFrame * relative
			visual.Color = colour
			visual.Material = material
			visual.Shape = shape or Enum.PartType.Block
			visual.Anchored = false
			visual.Massless = true
			visual.CanCollide = false
			visual.CanTouch = false
			visual.CanQuery = false
			visual.CastShadow = true
			visual.TopSurface = Enum.SurfaceType.Smooth
			visual.BottomSurface = Enum.SurfaceType.Smooth
			visual:SetAttribute("CostumePiece", true)
			visual.Parent = costume

			local weld = Instance.new("WeldConstraint")
			weld.Name = "CostumeWeld"
			weld.Part0 = body
			weld.Part1 = visual
			weld.Parent = visual
			return visual
		end

		local function shell(name: string, body: BasePart, padding: Vector3, colour: Color3, material: Enum.Material)
			piece(name, body, body.Size + padding, CFrame.new(), colour, material, nil)
		end

		local head = bodyPart(character, "Head")
		if head then
			-- A close cloth hood replaces the cap-like original. Its rounded crown
			-- is shifted toward the back of the skull: the front face plane stays
			-- exposed while the taller rear silhouette joins the nape like a hood.
			piece(
				"HoodCrown",
				head,
				Vector3.new(head.Size.X * 1.04, head.Size.Y * 0.72, head.Size.Z * 0.9),
				CFrame.new(0, head.Size.Y * 0.18, head.Size.Z * 0.14),
				WOOL_HOOD,
				Enum.Material.Fabric,
				Enum.PartType.Ball
			)
			piece(
				"HoodNape",
				head,
				Vector3.new(head.Size.X * 0.92, head.Size.Y * 0.78, 0.2),
				CFrame.new(0, -head.Size.Y * 0.14, head.Size.Z / 2 + 0.11),
				WOOL_HOOD,
				Enum.Material.Fabric,
				nil
			)
		end

		if humanoid.RigType == Enum.HumanoidRigType.R15 then
			local upperTorso = bodyPart(character, "UpperTorso")
			local lowerTorso = bodyPart(character, "LowerTorso")
			if upperTorso then
				-- Mail remains visible at the shoulders and sides; wool panels lie
				-- over it instead of turning the whole torso into one cloth brick.
				shell("MailHauberkUpper", upperTorso, Vector3.new(0.12, 0.08, 0.12), MAIL_DARK, Enum.Material.Metal)
				piece("SurcoatFrontUpper", upperTorso,
					Vector3.new(upperTorso.Size.X * 0.72, upperTorso.Size.Y * 0.92, 0.12),
					CFrame.new(0, -0.03, -(upperTorso.Size.Z / 2 + 0.08)),
					WOOL_RED, Enum.Material.Fabric, nil)
				piece("SurcoatBackUpper", upperTorso,
					Vector3.new(upperTorso.Size.X * 0.72, upperTorso.Size.Y * 0.92, 0.12),
					CFrame.new(0, -0.03, upperTorso.Size.Z / 2 + 0.08),
					WOOL_RED_SHADE, Enum.Material.Fabric, nil)
				-- The short hood mantle breaks the block torso silhouette and visually
				-- connects the rear hood to the shoulders without touching either arm.
				piece("HoodMantle", upperTorso,
					Vector3.new(upperTorso.Size.X * 0.86, 0.3, 0.14),
					CFrame.new(0, upperTorso.Size.Y / 2 - 0.3, upperTorso.Size.Z / 2 + 0.1),
					WOOL_HOOD, Enum.Material.Fabric, nil)
				piece("MailCollar", upperTorso,
					Vector3.new(upperTorso.Size.X + 0.18, 0.18, upperTorso.Size.Z + 0.18),
					CFrame.new(0, upperTorso.Size.Y / 2 - 0.1, 0),
					MAIL, Enum.Material.Metal, nil)
			end
			if lowerTorso then
				shell("MailHauberkLower", lowerTorso, Vector3.new(0.14, 0.1, 0.14), MAIL_DARK, Enum.Material.Metal)
				local panelWidth = lowerTorso.Size.X * 0.34
				local panelX = lowerTorso.Size.X * 0.19
				local panelHeight = lowerTorso.Size.Y + 0.42
				local panelY = -0.14
				local frontZ = -(lowerTorso.Size.Z / 2 + 0.09)
				local backZ = lowerTorso.Size.Z / 2 + 0.09
				piece("SurcoatFrontLeft", lowerTorso, Vector3.new(panelWidth, panelHeight, 0.13),
					CFrame.new(-panelX, panelY, frontZ) * CFrame.Angles(0, 0, math.rad(-2)),
					WOOL_RED, Enum.Material.Fabric, nil)
				piece("SurcoatFrontRight", lowerTorso, Vector3.new(panelWidth, panelHeight, 0.13),
					CFrame.new(panelX, panelY, frontZ) * CFrame.Angles(0, 0, math.rad(2)),
					WOOL_RED, Enum.Material.Fabric, nil)
				piece("SurcoatBackLeft", lowerTorso, Vector3.new(panelWidth, panelHeight, 0.13),
					CFrame.new(-panelX, panelY, backZ) * CFrame.Angles(0, 0, math.rad(-2)),
					WOOL_RED_SHADE, Enum.Material.Fabric, nil)
				piece("SurcoatBackRight", lowerTorso, Vector3.new(panelWidth, panelHeight, 0.13),
					CFrame.new(panelX, panelY, backZ) * CFrame.Angles(0, 0, math.rad(2)),
					WOOL_RED_SHADE, Enum.Material.Fabric, nil)
				piece("LeatherBelt", lowerTorso,
					Vector3.new(lowerTorso.Size.X + 0.22, 0.14, lowerTorso.Size.Z + 0.22),
					CFrame.new(0, lowerTorso.Size.Y / 2 - 0.1, 0),
					LEATHER, Enum.Material.Fabric, nil)
				piece("BeltBuckle", lowerTorso,
					Vector3.new(0.24, 0.2, 0.11),
					CFrame.new(0, lowerTorso.Size.Y / 2 - 0.1, -(lowerTorso.Size.Z / 2 + 0.17)),
					BUCKLE, Enum.Material.Metal, nil)
				piece("SwordScabbard", lowerTorso,
					Vector3.new(0.2, lowerTorso.Size.Y + 1.35, 0.22),
					CFrame.new(-lowerTorso.Size.X / 2 - 0.2, -lowerTorso.Size.Y * 0.52, 0.12)
						* CFrame.Angles(0, 0, math.rad(-9)),
					LEATHER_LIGHT, Enum.Material.Fabric, nil)
				piece("BeltPouch", lowerTorso,
					Vector3.new(0.38, 0.42, 0.2),
					CFrame.new(lowerTorso.Size.X * 0.34, lowerTorso.Size.Y * 0.04, lowerTorso.Size.Z / 2 + 0.16),
					LEATHER, Enum.Material.Fabric, nil)
			end

			for _, name in { "LeftUpperArm", "RightUpperArm" } do
				local arm = bodyPart(character, name)
				if arm then
					shell("MailSleeve_" .. name, arm, Vector3.new(0.09, 0.07, 0.09), MAIL, Enum.Material.Metal)
				end
			end
			for _, name in { "LeftLowerArm", "RightLowerArm" } do
				local arm = bodyPart(character, name)
				if arm then
					shell("LeatherVambrace_" .. name, arm, Vector3.new(0.08, 0.06, 0.08), LEATHER_LIGHT, Enum.Material.Fabric)
				end
			end
			for _, name in { "LeftUpperLeg", "RightUpperLeg" } do
				local leg = bodyPart(character, name)
				if leg then
					shell("WoolHose_" .. name, leg, Vector3.new(0.08, 0.06, 0.08), WOOL_HOSE, Enum.Material.Fabric)
				end
			end
			for _, name in { "LeftLowerLeg", "RightLowerLeg", "LeftFoot", "RightFoot" } do
				local boot = bodyPart(character, name)
				if boot then
					shell("LeatherBoot_" .. name, boot, Vector3.new(0.09, 0.07, 0.1), LEATHER, Enum.Material.Fabric)
				end
			end
		else
			local torso = bodyPart(character, "Torso")
			if torso then
				shell("MailHauberk", torso, Vector3.new(0.14, 0.08, 0.14), MAIL_DARK, Enum.Material.Metal)
				local panelWidth = torso.Size.X * 0.34
				local panelX = torso.Size.X * 0.19
				local panelHeight = torso.Size.Y + 0.38
				local panelY = -0.15
				local frontZ = -(torso.Size.Z / 2 + 0.09)
				local backZ = torso.Size.Z / 2 + 0.09
				piece("SurcoatFrontLeft", torso, Vector3.new(panelWidth, panelHeight, 0.13),
					CFrame.new(-panelX, panelY, frontZ) * CFrame.Angles(0, 0, math.rad(-2)),
					WOOL_RED, Enum.Material.Fabric, nil)
				piece("SurcoatFrontRight", torso, Vector3.new(panelWidth, panelHeight, 0.13),
					CFrame.new(panelX, panelY, frontZ) * CFrame.Angles(0, 0, math.rad(2)),
					WOOL_RED, Enum.Material.Fabric, nil)
				piece("SurcoatBackLeft", torso, Vector3.new(panelWidth, panelHeight, 0.13),
					CFrame.new(-panelX, panelY, backZ) * CFrame.Angles(0, 0, math.rad(-2)),
					WOOL_RED_SHADE, Enum.Material.Fabric, nil)
				piece("SurcoatBackRight", torso, Vector3.new(panelWidth, panelHeight, 0.13),
					CFrame.new(panelX, panelY, backZ) * CFrame.Angles(0, 0, math.rad(2)),
					WOOL_RED_SHADE, Enum.Material.Fabric, nil)
				piece("HoodMantle", torso,
					Vector3.new(torso.Size.X * 0.86, 0.3, 0.14),
					CFrame.new(0, torso.Size.Y / 2 - 0.3, torso.Size.Z / 2 + 0.1),
					WOOL_HOOD, Enum.Material.Fabric, nil)
				piece("MailCollar", torso,
					Vector3.new(torso.Size.X + 0.18, 0.18, torso.Size.Z + 0.18),
					CFrame.new(0, torso.Size.Y / 2 - 0.1, 0),
					MAIL, Enum.Material.Metal, nil)
				piece("LeatherBelt", torso,
					Vector3.new(torso.Size.X + 0.22, 0.14, torso.Size.Z + 0.22),
					CFrame.new(0, -(torso.Size.Y / 2 - 0.3), 0),
					LEATHER, Enum.Material.Fabric, nil)
				piece("BeltBuckle", torso,
					Vector3.new(0.24, 0.2, 0.11),
					CFrame.new(0, -(torso.Size.Y / 2 - 0.3), -(torso.Size.Z / 2 + 0.18)),
					BUCKLE, Enum.Material.Metal, nil)
				piece("SwordScabbard", torso,
					Vector3.new(0.2, torso.Size.Y * 0.92, 0.22),
					CFrame.new(-torso.Size.X / 2 - 0.2, -torso.Size.Y * 0.48, 0.12)
						* CFrame.Angles(0, 0, math.rad(-9)),
					LEATHER_LIGHT, Enum.Material.Fabric, nil)
				piece("BeltPouch", torso,
					Vector3.new(0.4, 0.44, 0.2),
					CFrame.new(torso.Size.X * 0.35, -(torso.Size.Y / 2 - 0.34), torso.Size.Z / 2 + 0.16),
					LEATHER, Enum.Material.Fabric, nil)
			end

			for _, name in { "Left Arm", "Right Arm" } do
				local arm = bodyPart(character, name)
				if arm then
					piece("MailSleeve_" .. name, arm,
						Vector3.new(arm.Size.X + 0.08, arm.Size.Y * 0.64, arm.Size.Z + 0.08),
						CFrame.new(0, arm.Size.Y * 0.18, 0),
						MAIL, Enum.Material.Metal, nil)
					piece("LeatherVambrace_" .. name, arm,
						Vector3.new(arm.Size.X + 0.09, arm.Size.Y * 0.36, arm.Size.Z + 0.09),
						CFrame.new(0, -arm.Size.Y * 0.32, 0),
						LEATHER_LIGHT, Enum.Material.Fabric, nil)
				end
			end
			for _, name in { "Left Leg", "Right Leg" } do
				local leg = bodyPart(character, name)
				if leg then
					piece("WoolHose_" .. name, leg,
						Vector3.new(leg.Size.X + 0.07, leg.Size.Y * 0.58, leg.Size.Z + 0.07),
						CFrame.new(0, leg.Size.Y * 0.21, 0),
						WOOL_HOSE, Enum.Material.Fabric, nil)
					piece("LeatherBoot_" .. name, leg,
						Vector3.new(leg.Size.X + 0.09, leg.Size.Y * 0.5, leg.Size.Z + 0.11),
						CFrame.new(0, -leg.Size.Y * 0.25, -0.02),
						LEATHER_LIGHT, Enum.Material.Fabric, nil)
				end
			end
		end

		costume:SetAttribute("VisualPartCount", partCount)
		assert(partCount <= MAX_COSTUME_PARTS, "commander costume exceeded its visual part budget")
	end)

	styling[character] = nil
	if not ok then
		warn(string.format("[World] commander costume failed safely: %s", tostring(failure)))
	end
end

local function hookPlayer(player: Player)
	if hookedPlayers[player] then
		return
	end
	hookedPlayers[player] = true

	player.CharacterAdded:Connect(function(character: Model)
		-- Dress the assembled rig immediately so the default avatar does not
		-- flash at spawn. CharacterAppearanceLoaded reapplies after Roblox finishes
		-- inserting any catalogue appearance, and the delayed call is only a
		-- fallback for Studio/offline sessions where that event can arrive late.
		task.defer(applyCostume, character)
		-- Fast fallback for Studio/offline sessions where appearance-loaded can
		-- arrive late; the real appearance event reapplies cleanly afterward.
		task.delay(2, function()
			if player.Character == character and character.Parent then
				applyCostume(character)
			end
		end)
	end)
	player.CharacterAppearanceLoaded:Connect(function(character: Model)
		if player.Character == character then
			task.defer(applyCostume, character)
		end
	end)

	if player.Character then
		local character = player.Character :: Model
		task.defer(applyCostume, character)
		if not player:HasAppearanceLoaded() then
			task.delay(2, function()
				if player.Character == character and character.Parent then
					applyCostume(character)
				end
			end)
		end
	end
end

function CharacterStyle.start()
	if started then
		return
	end
	started = true
	Players.PlayerAdded:Connect(hookPlayer)
	Players.PlayerRemoving:Connect(function(player: Player)
		hookedPlayers[player] = nil
	end)
	for _, player in Players:GetPlayers() do
		hookPlayer(player)
	end
end

return CharacterStyle
