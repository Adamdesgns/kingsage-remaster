--!strict
-- Asset-free player costume. The authoritative avatar rig stays untouched:
-- these are light, massless visual pieces welded to the existing R6 or R15
-- body after Roblox finishes loading the player's appearance.
--
-- The silhouette is grounded in a practical 12th-14th century commander:
-- wool surcoat and hose, mail sleeves/collar, leather belt and boots, and a
-- plain wool cap. No catalogue ids, modern accessories, fantasy plate, horns,
-- glow, particles, or per-frame work.
local Players = game:GetService("Players")

local CharacterStyle = {}

local COSTUME_FOLDER = "KingsAgeCommanderCostume"
local MAX_COSTUME_PARTS = 20

local WOOL_RED = Color3.fromRGB(111, 42, 38)
local WOOL_DARK = Color3.fromRGB(55, 48, 42)
local WOOL_HOSE = Color3.fromRGB(66, 61, 54)
local MAIL = Color3.fromRGB(105, 108, 108)
local MAIL_DARK = Color3.fromRGB(76, 80, 81)
local LEATHER = Color3.fromRGB(72, 48, 31)
local LEATHER_LIGHT = Color3.fromRGB(103, 70, 40)
local BUCKLE = Color3.fromRGB(171, 128, 55)

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
		costume:SetAttribute("Era", "12th-14th century grounded commander")
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
			-- A low wool cap leaves the face unobstructed and replaces modern hair,
			-- helmets, headphones and other catalogue accessories without an id.
			piece(
				"WoolCap",
				head,
				Vector3.new(head.Size.X * 1.06, head.Size.Y * 0.38, head.Size.Z * 1.06),
				CFrame.new(0, head.Size.Y * 0.34, 0),
				WOOL_DARK,
				Enum.Material.Fabric,
				Enum.PartType.Ball
			)
			piece(
				"CapBand",
				head,
				Vector3.new(head.Size.X * 1.07, 0.16, head.Size.Z * 1.07),
				CFrame.new(0, head.Size.Y * 0.23, 0),
				LEATHER,
				Enum.Material.Fabric,
				nil
			)
		end

		if humanoid.RigType == Enum.HumanoidRigType.R15 then
			local upperTorso = bodyPart(character, "UpperTorso")
			local lowerTorso = bodyPart(character, "LowerTorso")
			if upperTorso then
				shell("WoolTunicUpper", upperTorso, Vector3.new(0.14, 0.08, 0.14), WOOL_RED, Enum.Material.Fabric)
				piece("SurcoatUpper", upperTorso,
					Vector3.new(upperTorso.Size.X * 0.72, upperTorso.Size.Y * 0.9, 0.14),
					CFrame.new(0, -0.03, -(upperTorso.Size.Z / 2 + 0.09)),
					WOOL_DARK, Enum.Material.Fabric, nil)
				piece("MailCollar", upperTorso,
					Vector3.new(upperTorso.Size.X + 0.18, 0.2, upperTorso.Size.Z + 0.18),
					CFrame.new(0, upperTorso.Size.Y / 2 - 0.12, 0),
					MAIL_DARK, Enum.Material.Metal, nil)
			end
			if lowerTorso then
				shell("WoolTunicLower", lowerTorso, Vector3.new(0.16, 0.1, 0.16), WOOL_RED, Enum.Material.Fabric)
				piece("SurcoatSkirt", lowerTorso,
					Vector3.new(lowerTorso.Size.X * 0.76, lowerTorso.Size.Y + 0.3, 0.15),
					CFrame.new(0, -0.12, -(lowerTorso.Size.Z / 2 + 0.1)),
					WOOL_DARK, Enum.Material.Fabric, nil)
				piece("LeatherBelt", lowerTorso,
					Vector3.new(lowerTorso.Size.X + 0.22, 0.24, lowerTorso.Size.Z + 0.22),
					CFrame.new(0, lowerTorso.Size.Y / 2 - 0.15, 0),
					LEATHER, Enum.Material.Fabric, nil)
				piece("BeltBuckle", lowerTorso,
					Vector3.new(0.3, 0.28, 0.13),
					CFrame.new(0, lowerTorso.Size.Y / 2 - 0.15, -(lowerTorso.Size.Z / 2 + 0.18)),
					BUCKLE, Enum.Material.Metal, nil)
			end

			for _, name in { "LeftUpperArm", "LeftLowerArm", "RightUpperArm", "RightLowerArm" } do
				local arm = bodyPart(character, name)
				if arm then
					shell("MailSleeve_" .. name, arm, Vector3.new(0.09, 0.07, 0.09), MAIL, Enum.Material.Metal)
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
				shell("WoolTunic", torso, Vector3.new(0.14, 0.08, 0.14), WOOL_RED, Enum.Material.Fabric)
				piece("Surcoat", torso,
					Vector3.new(torso.Size.X * 0.74, torso.Size.Y + 0.18, 0.14),
					CFrame.new(0, -0.06, -(torso.Size.Z / 2 + 0.09)),
					WOOL_DARK, Enum.Material.Fabric, nil)
				piece("MailCollar", torso,
					Vector3.new(torso.Size.X + 0.18, 0.2, torso.Size.Z + 0.18),
					CFrame.new(0, torso.Size.Y / 2 - 0.12, 0),
					MAIL_DARK, Enum.Material.Metal, nil)
				piece("LeatherBelt", torso,
					Vector3.new(torso.Size.X + 0.22, 0.24, torso.Size.Z + 0.22),
					CFrame.new(0, -(torso.Size.Y / 2 - 0.3), 0),
					LEATHER, Enum.Material.Fabric, nil)
				piece("BeltBuckle", torso,
					Vector3.new(0.3, 0.28, 0.13),
					CFrame.new(0, -(torso.Size.Y / 2 - 0.3), -(torso.Size.Z / 2 + 0.18)),
					BUCKLE, Enum.Material.Metal, nil)
			end

			for _, name in { "Left Arm", "Right Arm" } do
				local arm = bodyPart(character, name)
				if arm then
					piece("MailSleeve_" .. name, arm,
						Vector3.new(arm.Size.X + 0.08, arm.Size.Y * 0.72, arm.Size.Z + 0.08),
						CFrame.new(0, arm.Size.Y * 0.14, 0),
						MAIL, Enum.Material.Metal, nil)
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
