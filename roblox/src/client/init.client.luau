--!strict
-- The player's window onto the realm: HUD (resources, queues and marches with
-- display-only countdowns from server timestamps), toasts, the war table's
-- overhead command view with its Village and War tabs, and honest failure
-- states (holding scene, reconnect banner, outdated-version gate). Nothing
-- here is authoritative.
--
-- Fog rule (spec §4): foreign villages arrive from the world server with their
-- resources, buildings and army zeroed. NOTHING in this file may display those
-- zeroed fields as if they were observations — a neighbour's real strength is
-- only ever read out of a scout report the player earned.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local GuiService = game:GetService("GuiService")
local RunService = game:GetService("RunService")
local StarterGui = game:GetService("StarterGui")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- The expanded Roblox PlayerList is the large avatar card that covered the
-- settlement in the first visual run. This game already presents identity and
-- realm state in its own HUD, so disable that one CoreGui surface only. CoreGui
-- may not be registered on the first client tick, hence the bounded retry.
task.spawn(function()
	for attempt = 1, 8 do
		local ok = pcall(function()
			StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false)
		end)
		if ok then
			return
		end
		task.wait(math.min(0.1 * (2 ^ (attempt - 1)), 1))
	end
end)

local shared = ReplicatedStorage:WaitForChild("WorldShared")
local Buildings = require(shared:WaitForChild("Buildings"))
local BattleConfig = require(shared:WaitForChild("BattleConfig"))
local TimeUtil = require(shared:WaitForChild("TimeUtil"))
-- Sibling module: with init.client.luau, Rojo makes this folder the LocalScript
-- and everything beside it a child of that script.
local BattleScene = require(script:WaitForChild("BattleScene"))
local Celebration = require(script:WaitForChild("Celebration"))

local remotes = ReplicatedStorage:WaitForChild("WorldRemotes")
local stateSync = remotes:WaitForChild("StateSync") :: RemoteEvent
local enterTable = remotes:WaitForChild("EnterTable") :: RemoteEvent
local queueCommand = remotes:WaitForChild("QueueCommand") :: RemoteFunction
local toastRemote = remotes:WaitForChild("Toast") :: RemoteEvent

-- latest world data
local latest: { snapshot: any?, status: string, clockOffset: number, outdated: boolean, sessionError: string? } = {
	snapshot = nil,
	status = "connecting",
	clockOffset = 0,
	outdated = false,
	sessionError = nil,
}

-- Secure owner-detail renderer ------------------------------------------------
--
-- Workspace contains only fixed, fog-safe village shells. The server places a
-- detailed source model under this player's private PlayerGui only; this client
-- clones that source locally into Workspace. Other clients never receive the
-- model, its Level attributes, geometry, or prompts.
type ShellPartState = {
	localTransparency: number,
	canCollide: boolean,
	canTouch: boolean,
	canQuery: boolean,
	castShadow: boolean,
}

local shellPartState: { [BasePart]: ShellPartState } = {}
local shellSurfaceState: { [SurfaceGui]: boolean } = {}
local localDetails: { [string]: Model } = {}
local watchedShells: { [Model]: boolean } = {}
local settlementsFolder: Folder? = nil
local localCommandFeedback: ((any) -> ())? = nil
local requestOpenLocalTable: ((any) -> ())? = nil

local function setShellVisible(shell: Model, visible: boolean)
	for _, descendant in shell:GetDescendants() do
		if descendant:IsA("BasePart") then
			local original = shellPartState[descendant]
			if not original then
				original = {
					localTransparency = descendant.LocalTransparencyModifier,
					canCollide = descendant.CanCollide,
					canTouch = descendant.CanTouch,
					canQuery = descendant.CanQuery,
					castShadow = descendant.CastShadow,
				}
				shellPartState[descendant] = original
			end
			if visible then
				descendant.LocalTransparencyModifier = original.localTransparency
				descendant.CanCollide = original.canCollide
				descendant.CanTouch = original.canTouch
				descendant.CanQuery = original.canQuery
				descendant.CastShadow = original.castShadow
			else
				descendant.LocalTransparencyModifier = 1
				descendant.CanCollide = false
				descendant.CanTouch = false
				descendant.CanQuery = false
				descendant.CastShadow = false
			end
		elseif descendant:IsA("SurfaceGui") then
			if shellSurfaceState[descendant] == nil then
				shellSurfaceState[descendant] = descendant.Enabled
			end
			descendant.Enabled = visible and shellSurfaceState[descendant] == true
		end
	end
end

local function refreshShell(villageId: string)
	local folder = settlementsFolder
	if not folder then
		return
	end
	local visible = localDetails[villageId] == nil
	for _, child in folder:GetChildren() do
		if child:IsA("Model")
			and child:GetAttribute("VisibilityLayer") == "Shell"
			and tostring(child:GetAttribute("VillageId")) == villageId then
			setShellVisible(child, visible)
		end
	end
end

local function ownerDetailRoot(instance: Instance): Model?
	local cursor: Instance? = instance
	while cursor do
		if cursor:IsA("Model")
			and cursor:GetAttribute("VisibilityLayer") == "OwnerDetail"
			and tonumber(cursor:GetAttribute("OwnerUserId")) == player.UserId then
			return cursor
		end
		cursor = cursor.Parent
	end
	return nil
end

local function hookLocalPrompt(prompt: ProximityPrompt)
	prompt.Enabled = latest.status == "online"
	prompt.Triggered:Connect(function()
		local root = ownerDetailRoot(prompt)
		if not root then
			return
		end
		if prompt.Name == "TablePrompt" then
			local open = requestOpenLocalTable
			if open then
				open({
					centerX = tonumber(root:GetAttribute("CenterX")) or 0,
					centerZ = tonumber(root:GetAttribute("CenterZ")) or 0,
					boundsHalf = tonumber(root:GetAttribute("BoundsHalf")) or 75,
					villageId = tostring(root:GetAttribute("VillageId")),
				})
			end
			return
		end

		local structure = prompt.Parent
		local buildingModel = structure and structure.Parent
		if not buildingModel or not buildingModel:IsA("Model") then
			return
		end
		local villageId = buildingModel:GetAttribute("VillageId")
		local building = buildingModel:GetAttribute("Building")
		if typeof(villageId) ~= "string" or typeof(building) ~= "string" then
			return
		end
		local request: any
		if prompt.Name == "InteractPrompt" then
			request = { kind = "build", villageId = villageId, building = building }
		elseif prompt.Name == "RecruitPrompt" then
			request = {
				kind = "recruit",
				villageId = villageId,
				troop = Buildings.RECRUIT_PRESET.troop,
				quantity = Buildings.RECRUIT_PRESET.quantity,
			}
		else
			return
		end
		task.spawn(function()
			local ok, result = pcall(function()
				return queueCommand:InvokeServer(request)
			end)
			local feedback = localCommandFeedback
			if feedback then
				feedback(if ok then result else { ok = false, message = "The realm didn't answer — nothing was spent." })
			end
		end)
	end)
end

local function refreshLocalPromptAvailability()
	local enabled = latest.status == "online"
	for _, detail in localDetails do
		for _, descendant in detail:GetDescendants() do
			if descendant:IsA("ProximityPrompt") then
				descendant.Enabled = enabled
			end
		end
	end
end

local function installPrivateDetail(source: Model)
	if tonumber(source:GetAttribute("OwnerUserId")) ~= player.UserId then
		return
	end
	local villageIdValue = source:GetAttribute("VillageId")
	if typeof(villageIdValue) ~= "string" then
		return
	end
	local villageId = villageIdValue
	local clone = source:Clone()
	clone:SetAttribute("OwnerUserId", player.UserId)
	clone:SetAttribute("VisibilityLayer", "OwnerDetail")
	clone:SetAttribute("PrivatePlayerGuiSource", nil)
	local nonAuthoritativeSpawn = clone:FindFirstChild("GateSpawn")
	if nonAuthoritativeSpawn then
		nonAuthoritativeSpawn:Destroy()
	end
	for _, descendant in clone:GetDescendants() do
		if descendant:IsA("ProximityPrompt") then
			hookLocalPrompt(descendant)
		end
	end
	local old = localDetails[villageId]
	if old then
		old:Destroy()
	end
	localDetails[villageId] = clone
	local folder = settlementsFolder
	if folder then
		clone.Parent = folder
		refreshShell(villageId)
	else
		clone:Destroy()
		localDetails[villageId] = nil
	end
end

local function watchShell(shell: Model)
	if watchedShells[shell] then
		return
	end
	watchedShells[shell] = true
	local villageId = tostring(shell:GetAttribute("VillageId"))
	refreshShell(villageId)
	shell.DescendantAdded:Connect(function()
		-- Streaming can restore descendants into an existing hidden shell;
		-- apply the current owner-view state before they can flash or collide.
		setShellVisible(shell, localDetails[villageId] == nil)
	end)
	shell.DescendantRemoving:Connect(function(descendant: Instance)
		if descendant:IsA("BasePart") then shellPartState[descendant] = nil end
		if descendant:IsA("SurfaceGui") then shellSurfaceState[descendant] = nil end
	end)
	shell.AncestryChanged:Connect(function()
		if not shell:IsDescendantOf(workspace) then
			watchedShells[shell] = nil
		end
	end)
end

local boundPrivateFolders: { [Folder]: boolean } = {}
local function bindPrivateFolder(privateFolder: Folder)
	if boundPrivateFolders[privateFolder] then
		return
	end
	boundPrivateFolders[privateFolder] = true
	privateFolder.ChildAdded:Connect(function(child: Instance)
		if child:IsA("Model") then
			installPrivateDetail(child)
		end
	end)
	privateFolder.ChildRemoved:Connect(function(child: Instance)
		if not child:IsA("Model") then
			return
		end
		local villageId = child:GetAttribute("VillageId")
		if typeof(villageId) ~= "string" then
			return
		end
		-- A replacement may already have arrived. Only remove the local clone if
		-- no current private source for this village remains.
		if privateFolder:FindFirstChild("SettlementDetail_" .. villageId) then
			return
		end
		local existing = localDetails[villageId]
		if existing then existing:Destroy() end
		localDetails[villageId] = nil
		refreshShell(villageId)
	end)
	privateFolder.AncestryChanged:Connect(function()
		if not privateFolder:IsDescendantOf(playerGui) then
			boundPrivateFolders[privateFolder] = nil
		end
	end)
	for _, child in privateFolder:GetChildren() do
		if child:IsA("Model") then
			installPrivateDetail(child)
		end
	end
end

task.spawn(function()
	local folder = workspace:WaitForChild("Settlements")
	if not folder:IsA("Folder") then
		return
	end
	settlementsFolder = folder
	folder.ChildAdded:Connect(function(child: Instance)
		if child:IsA("Model") and child:GetAttribute("VisibilityLayer") == "Shell" then
			watchShell(child)
		end
	end)
	for _, child in folder:GetChildren() do
		if child:IsA("Model") and child:GetAttribute("VisibilityLayer") == "Shell" then
			watchShell(child)
		end
	end

	playerGui.ChildAdded:Connect(function(child: Instance)
		if child:IsA("Folder") and child.Name == "SettlementDetailsPrivate" then
			bindPrivateFolder(child)
		end
	end)
	for _, child in playerGui:GetChildren() do
		if child:IsA("Folder") and child.Name == "SettlementDetailsPrivate" then
			bindPrivateFolder(child)
		end
	end
end)

-- Countdowns use Roblox's synced server clock plus the world-server offset,
-- NEVER the device clock (a wrong phone clock must not bend timers).
local function nowServerSeconds(): number
	return workspace:GetServerTimeNow() + latest.clockOffset
end

local function myKingdomId(): string?
	local snapshot = latest.snapshot
	return snapshot and snapshot.kingdom and tostring(snapshot.kingdom.id) or nil
end

local function myCapital(): any
	local snapshot = latest.snapshot
	if not snapshot or not snapshot.world or not snapshot.kingdom then
		return nil
	end
	local fallback = nil
	for _, village in snapshot.world.villages do
		if village.kingdomId == snapshot.kingdom.id then
			if village.isCapital then
				return village
			end
			fallback = fallback or village
		end
	end
	return fallback
end

local function myVillage(villageId: string?): any
	local snapshot = latest.snapshot
	if villageId and snapshot and snapshot.world then
		for _, village in snapshot.world.villages do
			if village.id == villageId then
				return village
			end
		end
	end
	return myCapital()
end

local function villageById(villageId: string?): any
	local snapshot = latest.snapshot
	if not villageId or not snapshot or not snapshot.world then
		return nil
	end
	for _, village in snapshot.world.villages do
		if village.id == villageId then
			return village
		end
	end
	return nil
end

local function battleById(battleId: string?): any
	if not battleId then
		return nil
	end
	for _, battle in ((latest.snapshot and latest.snapshot.battleSessions) or {}) do
		if tostring(battle.id) == battleId then
			return battle
		end
	end
	return nil
end

local function villageLabel(villageId: string?): string
	local village = villageById(villageId)
	return village and tostring(village.name) or "an unknown place"
end

local function kingdomFor(kingdomId: string?): any
	local snapshot = latest.snapshot
	local kingdoms = snapshot and snapshot.world and snapshot.world.kingdoms
	if typeof(kingdoms) == "table" then
		for _, kingdom in kingdoms do
			if kingdom.id == kingdomId then
				return kingdom
			end
		end
	end
	return nil
end

local function kingdomNameFor(kingdomId: string?): string
	local snapshot = latest.snapshot
	local kingdoms = snapshot and snapshot.world and snapshot.world.kingdoms
	if typeof(kingdoms) == "table" then
		for _, kingdom in kingdoms do
			if kingdom.id == kingdomId then
				return tostring(kingdom.name)
			end
		end
	end
	return "an unknown realm"
end

-- Map distance in tiles between two villages, for "how far is that raid".
local function tileDistance(a: any, b: any): number
	if not a or not b then
		return 0
	end
	local dx = (tonumber(a.x) or 0) - (tonumber(b.x) or 0)
	local dy = (tonumber(a.y) or 0) - (tonumber(b.y) or 0)
	return math.sqrt(dx * dx + dy * dy)
end

local function clockText(seconds: number): string
	local whole = math.max(math.floor(seconds), 0)
	if whole >= 3600 then
		return string.format("%d:%02d:%02d", whole // 3600, (whole % 3600) // 60, whole % 60)
	end
	return string.format("%d:%02d", whole // 60, whole % 60)
end

local function ageText(iso: string?): string
	local at = TimeUtil.isoToEpoch(iso)
	if not at then
		return "just now"
	end
	local elapsed = math.max(nowServerSeconds() - at, 0)
	if elapsed < 90 then
		return "just now"
	end
	if elapsed < 3600 then
		return string.format("%d min ago", math.floor(elapsed / 60))
	end
	return string.format("%d h ago", math.floor(elapsed / 3600))
end

-- ===== root gui =====
local gui = Instance.new("ScreenGui")
gui.Name = "WorldHud"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Parent = playerGui

local function makeLabel(parent: Instance, name: string): TextLabel
	local label = Instance.new("TextLabel")
	label.Name = name
	label.BackgroundTransparency = 1
	label.TextColor3 = Color3.new(1, 1, 1)
	label.Font = Enum.Font.GothamBold
	label.TextScaled = true
	label.Parent = parent
	return label
end

-- The world stays visually quiet until the player needs to act. These HUD
-- colours are intentionally warmer than the war-table chrome: charcoal keeps
-- the world visible while aged gold marks useful, live information.
local HUD_CHARCOAL = Color3.fromRGB(22, 21, 19)
local HUD_CHARCOAL_SOFT = Color3.fromRGB(34, 32, 28)
local HUD_GOLD = Color3.fromRGB(184, 146, 76)
local HUD_CREAM = Color3.fromRGB(236, 228, 210)
local HUD_MUTED = Color3.fromRGB(170, 161, 143)

local function addCorner(parent: GuiObject, radius: number)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, radius)
	corner.Parent = parent
end

local function addStroke(parent: GuiObject, color: Color3, transparency: number?)
	local stroke = Instance.new("UIStroke")
	stroke.Color = color
	stroke.Transparency = transparency or 0
	stroke.Thickness = 1
	stroke.Parent = parent
end

local function compactAmount(value: number): string
	local amount = math.max(math.floor(value), 0)
	if amount >= 1000000 then
		return string.format("%.1fM", amount / 1000000)
	end
	if amount >= 10000 then
		return string.format("%.1fK", amount / 1000)
	end
	return tostring(amount)
end

type ResourceChip = {
	frame: Frame,
	title: TextLabel,
	value: TextLabel,
	rate: TextLabel,
	fill: Frame,
}

local RESOURCE_ACCENTS: { [string]: Color3 } = {
	wood = Color3.fromRGB(171, 117, 68),
	stone = Color3.fromRGB(157, 158, 151),
	iron = Color3.fromRGB(178, 142, 81),
}

-- Three short resource cards are the only persistent block at top-centre.
-- Amount, hourly production and the capacity line remain visible without the
-- 52px two-storey bar that obscured building prompts at a 916x599 viewport.
local resourceBar = Instance.new("Frame")
resourceBar.Name = "Resources"
resourceBar.Size = UDim2.new(0, 318, 0, 36)
resourceBar.Position = UDim2.new(0.5, -159, 0, 8)
resourceBar.BackgroundTransparency = 1
resourceBar.ZIndex = 3
resourceBar.Parent = gui

local resourceList = Instance.new("UIListLayout")
resourceList.FillDirection = Enum.FillDirection.Horizontal
resourceList.HorizontalAlignment = Enum.HorizontalAlignment.Center
resourceList.Padding = UDim.new(0, 6)
resourceList.SortOrder = Enum.SortOrder.LayoutOrder
resourceList.Parent = resourceBar

local resourceChips: { [string]: ResourceChip } = {}
local function createResourceChip(resourceName: string, titleText: string, order: number)
	local accent = RESOURCE_ACCENTS[resourceName] or HUD_GOLD
	local chip = Instance.new("Frame")
	chip.Name = titleText
	chip.Size = UDim2.new(1 / 3, -4, 1, 0)
	chip.BackgroundColor3 = HUD_CHARCOAL
	chip.BackgroundTransparency = 0.08
	chip.BorderSizePixel = 0
	chip.LayoutOrder = order
	chip.ZIndex = 3
	chip.Parent = resourceBar
	addCorner(chip, 6)
	addStroke(chip, accent, 0.42)

	local title = makeLabel(chip, "Title")
	title.Size = UDim2.new(0.42, 0, 0, 13)
	title.Position = UDim2.new(0, 7, 0, 1)
	title.Text = titleText
	title.TextColor3 = HUD_MUTED
	title.TextScaled = false
	title.TextSize = 9
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.ZIndex = 4

	local rate = makeLabel(chip, "Rate")
	rate.Size = UDim2.new(0.5, -7, 0, 13)
	rate.Position = UDim2.new(0.5, 0, 0, 1)
	rate.Text = "+0/h"
	rate.TextColor3 = accent
	rate.TextScaled = false
	rate.TextSize = 9
	rate.TextXAlignment = Enum.TextXAlignment.Right
	rate.ZIndex = 4

	local value = makeLabel(chip, "Value")
	value.Size = UDim2.new(1, -14, 0, 18)
	value.Position = UDim2.new(0, 7, 0, 13)
	value.Text = "0"
	value.TextColor3 = HUD_CREAM
	value.TextScaled = false
	value.TextSize = 12
	value.TextXAlignment = Enum.TextXAlignment.Left
	value.ZIndex = 4

	local track = Instance.new("Frame")
	track.Name = "CapacityTrack"
	track.Size = UDim2.new(1, -14, 0, 2)
	track.Position = UDim2.new(0, 7, 1, -4)
	track.BackgroundColor3 = Color3.fromRGB(67, 62, 53)
	track.BorderSizePixel = 0
	track.ZIndex = 4
	track.Parent = chip
	addCorner(track, 2)

	local fill = Instance.new("Frame")
	fill.Name = "Fill"
	fill.Size = UDim2.new(0, 0, 1, 0)
	fill.BackgroundColor3 = accent
	fill.BorderSizePixel = 0
	fill.ZIndex = 5
	fill.Parent = track
	addCorner(fill, 2)

	resourceChips[resourceName] = { frame = chip, title = title, value = value, rate = rate, fill = fill }
end

createResourceChip("wood", "WOOD", 1)
createResourceChip("stone", "STONE", 2)
createResourceChip("iron", "IRON", 3)

-- The place name follows the target treatment: a small bottom-centre caption,
-- not a full-width realm bar competing with prompts and the play space.
local locationLabel = Instance.new("TextLabel")
locationLabel.Name = "Location"
locationLabel.Size = UDim2.new(0, 300, 0, 24)
locationLabel.Position = UDim2.new(0.5, -150, 1, -32)
locationLabel.BackgroundColor3 = HUD_CHARCOAL
locationLabel.BackgroundTransparency = 1
locationLabel.BorderSizePixel = 0
locationLabel.TextColor3 = HUD_CREAM
locationLabel.TextTransparency = 1
locationLabel.Font = Enum.Font.GothamBold
locationLabel.TextScaled = false
locationLabel.TextSize = 11
locationLabel.TextTruncate = Enum.TextTruncate.AtEnd
locationLabel.TextXAlignment = Enum.TextXAlignment.Center
locationLabel.TextStrokeColor3 = HUD_CHARCOAL
locationLabel.TextStrokeTransparency = 1
locationLabel.Text = ""
locationLabel.Visible = false
locationLabel.ZIndex = 3
locationLabel.Parent = gui

local locationShown = false
local locationTween: Tween? = nil
local function setLocationVisible(visible: boolean)
	if locationShown == visible and locationLabel.Visible == visible then
		return
	end
	locationShown = visible
	if locationTween then
		locationTween:Cancel()
	end
	if visible then
		locationLabel.Visible = true
		locationTween = TweenService:Create(locationLabel, TweenInfo.new(0.22), {
			TextTransparency = 0,
			TextStrokeTransparency = 0.25,
		})
		locationTween:Play()
	else
		local tween = TweenService:Create(locationLabel, TweenInfo.new(0.18), {
			TextTransparency = 1,
			TextStrokeTransparency = 1,
		})
		locationTween = tween
		tween:Play()
		task.delay(0.2, function()
			if locationTween == tween and not locationShown then
				locationLabel.Visible = false
			end
		end)
	end
end

-- One compact order badge. The first active item stays live and reports how
-- many more are queued; the HUD never expands into a centred orders panel.
local queuePanel = Instance.new("ScrollingFrame")
queuePanel.Name = "Queues"
queuePanel.Size = UDim2.new(0, 240, 0, 36)
queuePanel.Position = UDim2.new(1, -248, 0, 8)
queuePanel.BackgroundColor3 = HUD_CHARCOAL
queuePanel.BackgroundTransparency = 0.08
queuePanel.BorderSizePixel = 0
queuePanel.CanvasSize = UDim2.new()
queuePanel.AutomaticCanvasSize = Enum.AutomaticSize.None
queuePanel.ScrollBarImageColor3 = HUD_GOLD
queuePanel.ScrollBarThickness = 0
queuePanel.ScrollingDirection = Enum.ScrollingDirection.Y
queuePanel.ScrollingEnabled = false
queuePanel.ZIndex = 3
queuePanel.Parent = gui
addCorner(queuePanel, 6)
addStroke(queuePanel, HUD_GOLD, 0.42)

local queuePadding = Instance.new("UIPadding")
queuePadding.PaddingLeft = UDim.new(0, 8)
queuePadding.PaddingRight = UDim.new(0, 8)
queuePadding.PaddingTop = UDim.new(0, 4)
queuePadding.PaddingBottom = UDim.new(0, 4)
queuePadding.Parent = queuePanel

local queueList = Instance.new("UIListLayout")
queueList.SortOrder = Enum.SortOrder.LayoutOrder
queueList.Padding = UDim.new(0, 0)
queueList.Parent = queuePanel

local queueTitle = makeLabel(queuePanel, "Title")
queueTitle.Size = UDim2.new(1, -16, 0, 0)
queueTitle.LayoutOrder = 0
queueTitle.Text = "ACTIVE ORDERS"
queueTitle.TextColor3 = HUD_GOLD
queueTitle.TextScaled = false
queueTitle.TextSize = 10
queueTitle.TextXAlignment = Enum.TextXAlignment.Left
queueTitle.ZIndex = 4
queueTitle.Visible = false

local queueIsIdle = true
local queueContentHeight = 36
local applyHudLayout: () -> () = function() end

-- live countdown rows for the 1 Hz ticker (plain tables; no per-frame
-- instance walks). queueRows = the HUD panel, panelRows = the war table.
type CountdownRow = {
	container: GuiObject?,
	label: TextLabel,
	timerLabel: TextLabel?,
	baseText: string,
	startedAt: number?,
	completesAt: number?,
	lastShown: number?,
	progressFill: Frame?,
}
type HudEntry = { text: string, startedAt: number?, completesAt: number? }
local queueRows: { CountdownRow } = {}
local panelRows: { CountdownRow } = {}

-- toasts
local toastFrame = Instance.new("Frame")
toastFrame.Name = "Toasts"
toastFrame.Size = UDim2.new(0, 420, 0, 200)
toastFrame.Position = UDim2.new(0.5, -210, 1, -240)
toastFrame.BackgroundTransparency = 1
toastFrame.Parent = gui
local toastList = Instance.new("UIListLayout")
toastList.SortOrder = Enum.SortOrder.LayoutOrder
toastList.VerticalAlignment = Enum.VerticalAlignment.Bottom
toastList.Parent = toastFrame

local function toast(message: string, good: boolean?)
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 0, 34)
	label.BackgroundColor3 = if good then Color3.fromRGB(25, 60, 25) else Color3.fromRGB(70, 30, 25)
	label.BackgroundTransparency = 0.2
	label.TextColor3 = Color3.new(1, 1, 1)
	label.Font = Enum.Font.Gotham
	label.TextScaled = true
	label.Text = message
	label.Parent = toastFrame
	task.delay(3.5, function()
		local tween = TweenService:Create(label, TweenInfo.new(0.6), { BackgroundTransparency = 1, TextTransparency = 1 })
		tween:Play()
		tween.Completed:Wait()
		label:Destroy()
	end)
end
localCommandFeedback = function(result: any)
	toast(tostring(result and result.message or "The realm didn't answer — nothing was spent."), result and result.ok == true)
end
toastRemote.OnClientEvent:Connect(function(result: { ok: boolean, message: string })
	toast(tostring(result.message), result.ok)
end)

-- status banner
local banner = Instance.new("TextLabel")
banner.Name = "StatusBanner"
banner.Size = UDim2.new(1, 0, 0, 30)
banner.Position = UDim2.new(0, 0, 0, 46)
banner.BackgroundColor3 = Color3.fromRGB(120, 70, 20)
banner.BackgroundTransparency = 0.15
banner.TextColor3 = Color3.new(1, 1, 1)
banner.Font = Enum.Font.GothamBold
banner.TextScaled = true
banner.Text = "Reconnecting to the realm…"
banner.Visible = false
banner.Parent = gui

-- holding scene (before first snapshot; also carries final session refusals)
local holding = Instance.new("Frame")
holding.Name = "Holding"
holding.Size = UDim2.fromScale(1, 1)
holding.BackgroundColor3 = Color3.fromRGB(8, 8, 12)
holding.ZIndex = 5
holding.Parent = gui
local holdingLabel = makeLabel(holding, "Text")
holdingLabel.Size = UDim2.new(0.8, 0, 0, 60)
holdingLabel.Position = UDim2.new(0.1, 0, 0.45, 0)
holdingLabel.ZIndex = 6
holdingLabel.Text = "The realm is waking…"
task.spawn(function()
	while holding.Parent do
		local tween = TweenService:Create(holdingLabel, TweenInfo.new(1.2, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true), { TextTransparency = 0.55 })
		tween:Play()
		tween.Completed:Wait()
	end
end)

-- outdated-version gate (no dismiss)
local outdatedModal = Instance.new("TextLabel")
outdatedModal.Name = "Outdated"
outdatedModal.Size = UDim2.fromScale(1, 1)
outdatedModal.BackgroundColor3 = Color3.fromRGB(8, 8, 12)
outdatedModal.BackgroundTransparency = 0.05
outdatedModal.TextColor3 = Color3.new(1, 1, 1)
outdatedModal.Font = Enum.Font.GothamBold
outdatedModal.TextScaled = false
outdatedModal.TextSize = 28
outdatedModal.TextWrapped = true
outdatedModal.Text = "The kingdom has been updated — rejoin to get the new version."
outdatedModal.Visible = false
outdatedModal.ZIndex = 10
outdatedModal.Parent = gui

-- ===== war table overhead view =====
local camera = workspace.CurrentCamera
local inTableView = false
local inBattleView = false
local tableInfo: { centerX: number, centerZ: number, boundsHalf: number, villageId: string? }? = nil
local tablePanel: Frame? = nil
local activeTab: string = "village"
local buildTablePanel: () -> () = function() end
local buildBattlePanel: () -> () = function() end

local function refreshLocationVisibility()
	setLocationVisible(
		latest.snapshot ~= nil
			and latest.status == "online"
			and not latest.outdated
			and not holding.Visible
			and not inTableView
			and not inBattleView
	)
end

local function refreshHudModeVisibility()
	local narrow = camera.ViewportSize.X < 700
	resourceBar.Visible = not inBattleView and (not inTableView or not narrow)
	queuePanel.Visible = not inTableView and not inBattleView
	refreshLocationVisibility()
	applyHudLayout()
end

-- ScreenGui ignores Roblox's inset so it can own the whole screen; the HUD
-- therefore measures that inset itself. Resources and the single order badge
-- share one 36px row at every size. The location caption sits at the safe
-- bottom edge, leaving prompts and the player's sightline completely clear.
applyHudLayout = function()
	local viewport = camera.ViewportSize
	if viewport.X <= 1 or viewport.Y <= 1 then
		return
	end
	local topLeftInset, bottomRightInset = GuiService:GetGuiInset()
	local safeTop = math.max(math.floor(topLeftInset.Y) + 6, 6)
	local safeLeft = math.max(math.floor(topLeftInset.X) + 6, 6)
	local safeRight = math.max(math.floor(bottomRightInset.X) + 6, 6)
	local safeBottom = math.max(math.floor(bottomRightInset.Y) + 6, 6)
	local gap = 4
	local rowHeight = 36
	local availableWidth = math.max(math.floor(viewport.X) - safeLeft - safeRight, 1)

	-- Keep the resource cluster visually centred while reserving a fixed right
	-- edge for the order badge. On very small windows the resources compress
	-- before either element is allowed to overlap.
	local queueWidth = math.min(240, math.max(84, math.floor(availableWidth * 0.26)))
	queueWidth = math.min(queueWidth, math.max(1, availableWidth - gap - 72))
	local resourceWidth = math.min(318, math.max(168, math.floor(availableWidth * 0.4)))
	resourceWidth = math.min(resourceWidth, math.max(1, availableWidth - queueWidth - gap))
	local queueX = safeLeft + availableWidth - queueWidth
	local resourceX = safeLeft + math.floor((availableWidth - resourceWidth) / 2)
	if resourceX + resourceWidth > queueX - gap then
		resourceX = queueX - gap - resourceWidth
	end
	if resourceX < safeLeft then
		resourceX = safeLeft
		resourceWidth = math.max(1, queueX - gap - safeLeft)
	end
	resourceBar.Size = UDim2.fromOffset(resourceWidth, rowHeight)
	resourceBar.Position = UDim2.fromOffset(resourceX, safeTop)
	resourceList.Padding = UDim.new(0, if resourceWidth < 210 then 2 else 4)

	local microResources = resourceWidth < 210
	local showRates = resourceWidth >= 150
	for _, chip in resourceChips do
		chip.title.Text = if microResources then string.sub(chip.frame.Name, 1, 1) else chip.frame.Name
		chip.title.Size = if microResources then UDim2.new(0, 14, 0, 13) else UDim2.new(0.42, 0, 0, 13)
		chip.title.Position = UDim2.new(0, if microResources then 5 else 7, 0, 1)
		chip.title.TextSize = if microResources then 8 else 9
		chip.rate.Visible = showRates
		chip.rate.Size = if microResources then UDim2.new(1, -22, 0, 13) else UDim2.new(0.5, -7, 0, 13)
		chip.rate.Position = if microResources then UDim2.new(0, 17, 0, 1) else UDim2.new(0.5, 0, 0, 1)
		chip.rate.TextSize = if microResources then 8 else 9
		chip.value.Position = UDim2.new(0, if microResources then 5 else 7, 0, 13)
		chip.value.Size = UDim2.new(1, if microResources then -10 else -14, 0, 18)
		chip.value.TextSize = if microResources then 11 else 12
	end

	queuePanel.Size = UDim2.fromOffset(queueWidth, rowHeight)
	queuePanel.Position = UDim2.fromOffset(queueX, safeTop)
	queuePanel.ScrollingEnabled = false
	queuePanel.ScrollBarThickness = 0
	queueTitle.Visible = false
	for _, row in queueRows do
		local container = row.container
		if container then
			container.Size = UDim2.new(1, -16, 0, 28)
			local timerLabel = row.timerLabel
			local timerVisible = timerLabel ~= nil and timerLabel.Visible
			local timerWidth = if queueWidth < 130 then 44 else 58
			row.label.Size = if timerVisible
				then UDim2.new(1, -(timerWidth + 8), 1, 0)
				else UDim2.new(1, -4, 1, 0)
			row.label.Position = UDim2.new(0, 4, 0, 0)
			row.label.TextSize = if queueWidth < 130 then 9 else 11
			if timerLabel then
				timerLabel.Size = UDim2.new(0, timerWidth, 1, 0)
				timerLabel.Position = UDim2.new(1, -timerWidth - 2, 0, 0)
				timerLabel.TextSize = if queueWidth < 130 then 9 else 10
			end
		end
	end

	local locationWidth = math.min(300, math.max(160, math.floor(availableWidth * 0.48)), availableWidth)
	locationLabel.Size = UDim2.fromOffset(locationWidth, 24)
	locationLabel.Position = UDim2.fromOffset(
		safeLeft + math.floor((availableWidth - locationWidth) / 2),
		math.max(safeTop + rowHeight + gap, math.floor(viewport.Y) - safeBottom - 24)
	)
	locationLabel.TextSize = if availableWidth < 480 then 10 else 11

	local alertTop = safeTop + rowHeight + gap
	banner.Size = UDim2.fromOffset(availableWidth, 30)
	banner.Position = UDim2.fromOffset(safeLeft, alertTop)
	local battleCallNode = gui:FindFirstChild("BattleCall")
	if battleCallNode and battleCallNode:IsA("GuiObject") then
		local battleCallWidth = math.min(360, availableWidth)
		battleCallNode.Size = UDim2.fromOffset(battleCallWidth, 34)
		battleCallNode.Position = UDim2.fromOffset(
			safeLeft + math.floor((availableWidth - battleCallWidth) / 2),
			alertTop
		)
	end

	local toastWidth = math.min(420, availableWidth)
	toastFrame.Size = UDim2.fromOffset(toastWidth, 200)
	toastFrame.Position = UDim2.fromOffset(
		safeLeft + math.floor((availableWidth - toastWidth) / 2),
		math.max(0, math.floor(viewport.Y) - safeBottom - 232)
	)
end

camera:GetPropertyChangedSignal("ViewportSize"):Connect(function()
	refreshHudModeVisibility()
	if inTableView then
		buildTablePanel()
	elseif inBattleView then
		buildBattlePanel()
	end
end)
banner:GetPropertyChangedSignal("Visible"):Connect(applyHudLayout)
task.defer(applyHudLayout)

-- The attack plan being composed at the table. Module-level so it survives the
-- panel rebuild that happens on every heartbeat; it is display state only, and
-- the Roblox server rebuilds the plan from the shared axes before sending it.
local attackPlan: { [string]: string } = Buildings.defaultAttackPlan()

-- Attacking commits every fighting troop in the village, so it takes two taps:
-- the first arms that one target, the second sends. Arming lapses on its own.
local ARM_SECONDS = 6
local armedTargetId: string? = nil
local armedAt = 0

-- Whether the next attack rides with noblemen — i.e. whether it is a conquest
-- attempt rather than a raid. Display state only; the Roblox server decides
-- what actually musters, and only when the request says so plainly.
local rideWithNobles = false

local function attackIsArmed(targetId: string): boolean
	return armedTargetId == targetId and (os.clock() - armedAt) < ARM_SECONDS
end

-- Changing what an armed attack MEANS must never be silently inherited by the
-- second tap: flipping the conquest toggle disarms, so nobody sends noblemen
-- they armed a plain raid for.
local function disarmAttack()
	armedTargetId = nil
end

-- Defined down in the battle-view section; declared here so a battle report
-- card can offer to replay itself.
local enterBattle: (battle: any) -> boolean

local function exitTableView()
	if not inTableView then
		return
	end
	inTableView = false
	tableInfo = nil
	activeTab = "village"
	camera.CameraType = Enum.CameraType.Custom
	if tablePanel then
		tablePanel:Destroy()
		tablePanel = nil
	end
	table.clear(panelRows)
	refreshHudModeVisibility()
end

local function invokeQueue(request: { [string]: any })
	task.spawn(function()
		local ok, result = pcall(function()
			return queueCommand:InvokeServer(request)
		end)
		if ok and typeof(result) == "table" then
			toast(tostring(result.message), result.ok == true)
		else
			toast("The realm didn't answer — nothing was spent.", false)
		end
	end)
end

-- ---- war-table row helpers (shared by both tabs) ----

local function sectionHeader(parent: Instance, order: number, text: string): TextLabel
	local header = makeLabel(parent, "Header")
	header.Size = UDim2.new(1, -8, 0, 26)
	header.LayoutOrder = order
	header.TextXAlignment = Enum.TextXAlignment.Left
	header.TextTransparency = 0
	header.Text = "  " .. text
	return header
end

local function noteRow(parent: Instance, order: number, text: string, height: number?): TextLabel
	local note = makeLabel(parent, "Note")
	note.Size = UDim2.new(1, -8, 0, height or 26)
	note.LayoutOrder = order
	note.TextXAlignment = Enum.TextXAlignment.Left
	note.TextTransparency = 0.15
	note.TextScaled = false
	note.TextSize = 14
	note.TextWrapped = true
	note.Text = "  " .. text
	return note
end

-- A row with a label on the left and an action button on the right.
local function actionRow(parent: Instance, order: number, text: string, buttonText: string, color: Color3, onClick: () -> ()): Frame
	local row = Instance.new("Frame")
	row.Size = UDim2.new(1, -8, 0, 36)
	row.BackgroundColor3 = Color3.fromRGB(38, 38, 52)
	row.BackgroundTransparency = 0.05
	row.LayoutOrder = order
	row.Parent = parent

	local nameLabel = makeLabel(row, "Name")
	nameLabel.Size = UDim2.new(0.6, 0, 1, 0)
	nameLabel.TextXAlignment = Enum.TextXAlignment.Left
	nameLabel.TextScaled = false
	nameLabel.TextSize = 14
	nameLabel.Text = "  " .. text

	local button = Instance.new("TextButton")
	button.Size = UDim2.new(0.35, 0, 0.85, 0)
	button.Position = UDim2.new(0.63, 0, 0.075, 0)
	button.BackgroundColor3 = color
	button.TextColor3 = Color3.new(1, 1, 1)
	button.Font = Enum.Font.GothamBold
	button.TextScaled = true
	button.Text = buttonText
	button.Parent = row
	button.Activated:Connect(onClick)
	return row
end

type RowAction = { label: string, color: Color3, onClick: () -> () }

-- A row carrying two buttons: label on the left, both actions on the right.
local function dualActionRow(parent: Instance, order: number, text: string, left: RowAction, right: RowAction): Frame
	local row = Instance.new("Frame")
	row.Size = UDim2.new(1, -8, 0, 40)
	row.BackgroundColor3 = Color3.fromRGB(38, 38, 52)
	row.BackgroundTransparency = 0.05
	row.LayoutOrder = order
	row.Parent = parent

	local nameLabel = makeLabel(row, "Name")
	nameLabel.Size = UDim2.new(0.52, 0, 1, 0)
	nameLabel.TextXAlignment = Enum.TextXAlignment.Left
	nameLabel.TextScaled = false
	nameLabel.TextSize = 13
	nameLabel.TextWrapped = true
	nameLabel.Text = "  " .. text

	for index, action in { left, right } do
		local button = Instance.new("TextButton")
		button.Size = UDim2.new(0.21, 0, 0.8, 0)
		button.Position = UDim2.new(0.545 + (index - 1) * 0.225, 0, 0.1, 0)
		button.BackgroundColor3 = action.color
		button.TextColor3 = Color3.new(1, 1, 1)
		button.Font = Enum.Font.GothamBold
		button.TextScaled = true
		button.Text = action.label
		button.Parent = row
		button.Activated:Connect(action.onClick)
	end
	return row
end

-- A read-only row whose text ticks down to a server timestamp.
local function countdownRow(parent: Instance, order: number, text: string, completesAt: number?): TextLabel
	local label = makeLabel(parent, "Countdown")
	label.Size = UDim2.new(1, -8, 0, 28)
	label.LayoutOrder = order
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.TextScaled = false
	label.TextSize = 14
	label.Text = "  " .. text
	table.insert(panelRows, { label = label, baseText = text, completesAt = completesAt, lastShown = nil })
	return label
end

local function buildVillageTab(scroll: ScrollingFrame, village: any, villageId: string)
	-- The herd, shown whenever there is a Stable.
	--
	-- [Adam] "the stables is to add horses to the troops to create cavalry."
	-- Horses are the only thing in the settlement that money cannot hurry, so
	-- the count is worth a line of its own rather than being buried in a
	-- recruitment refusal.
	local horses = math.floor(tonumber(village.horses) or 0)
	local horsesMax = math.floor(tonumber(village.horsesMax) or 0)
	if horsesMax > 0 then
		sectionHeader(scroll, 0, string.format("HORSES  ·  %d / %d", horses, horsesMax))
		noteRow(scroll, 0, if horses >= horsesMax
			then "The stable is full. Every hour from here is breeding wasted — spend them on cavalry, or sell them."
			else "Bred at the Stable, never bought. A Crusader is a Berserker plus a horse; a Black Knight is a Templar plus a horse.", 44)
	end

	for index, building in Buildings.ORDER do
		local level = tonumber(village.buildings and village.buildings[building]) or 0
		actionRow(scroll, index, string.format("%s  Lv %d", Buildings.displayName(building), level), "Upgrade",
			Color3.fromRGB(72, 112, 72), function()
				invokeQueue({ kind = "build", villageId = villageId, building = building })
			end)
	end

	local recruitRow = Instance.new("Frame")
	recruitRow.Size = UDim2.new(1, -8, 0, 36)
	recruitRow.BackgroundColor3 = Color3.fromRGB(40, 30, 30)
	recruitRow.LayoutOrder = #Buildings.ORDER + 1
	recruitRow.Parent = scroll
	local recruitButton = Instance.new("TextButton")
	recruitButton.Size = UDim2.fromScale(1, 1)
	recruitButton.BackgroundTransparency = 1
	recruitButton.TextColor3 = Color3.new(1, 1, 1)
	recruitButton.Font = Enum.Font.GothamBold
	recruitButton.TextScaled = true
	recruitButton.Text = Buildings.RECRUIT_PRESET.label
	recruitButton.Parent = recruitRow
	recruitButton.Activated:Connect(function()
		invokeQueue({
			kind = "recruit",
			villageId = villageId,
			troop = Buildings.RECRUIT_PRESET.troop,
			quantity = Buildings.RECRUIT_PRESET.quantity,
		})
	end)
end

-- Every troop the report actually saw, in the canonical order. Zero counts are
-- omitted: "no axemen observed" and "0 axemen" are not the same claim.
local function armySummary(army: any, emptyText: string?): string
	local nothing = emptyText or "no troops at home"
	if typeof(army) ~= "table" then
		return nothing
	end
	local parts: { string } = {}
	for _, troop in Buildings.TROOP_ORDER do
		local count = math.floor(tonumber(army[troop]) or 0)
		if count > 0 then
			table.insert(parts, string.format("%d %s", count, Buildings.troopName(troop)))
		end
	end
	if #parts == 0 then
		return nothing
	end
	return table.concat(parts, ", ")
end

-- Everything in this village that would march on an attack. Counted by the
-- SAME shared function CommandService builds the dispatched army from, so the
-- number on the button cannot drift from the army that actually leaves.
-- Returns (fighting troops, noblemen available).
local function musterCount(village: any): (number, number)
	local _, fighting = Buildings.musterFrom(village and village.army, false)
	local _, _, nobles = Buildings.musterFrom(village and village.army, true)
	return fighting, nobles
end

local function hasReportFor(targetVillageId: string): boolean
	local snapshot = latest.snapshot
	local reports = snapshot and snapshot.scoutReports
	if typeof(reports) ~= "table" then
		return false
	end
	for _, report in reports do
		if tostring(report.targetVillageId) == targetVillageId then
			return true
		end
	end
	return false
end

local function battleVerdict(battle: any, myKingdom: string?): string
	local outcome = battle and battle.outcome
	if not outcome then
		return "In progress"
	end
	local iAttacked = tostring(battle.attackerKingdomId) == myKingdom
	local iWon = (outcome.winner == "attacker") == iAttacked
	if tostring(battle.status) == "retreated" then
		return if iAttacked then "Withdrew" else "They withdrew"
	end
	return if iWon then "Victory" else "Defeat"
end

-- ===== world map =====
--
-- [Adam, 2026-08-23] "I would be fine seeing a map of the world."
--
-- The world is ~11,000 studs across and Roblox streams out anything past about
-- a thousand, so a neighbour 2,300 studs away is not merely far - it is never
-- drawn at all. Walking to look at the world was never going to work. A map is
-- the honest answer: it shows what is out there without pretending you can see
-- it from your gate.
local MAP_CANVAS = 300

local function hexColour(value: any, fallback: Color3): Color3
	local text = tostring(value or "")
	local ok, colour = pcall(function()
		return Color3.fromHex(text)
	end)
	return if ok and text ~= "" then colour else fallback
end

local function buildMapTab(scroll: ScrollingFrame, village: any, villageId: string)
	local snapshot = latest.snapshot
	local kingdomId = myKingdomId()
	local order = 0
	local function nextOrder(): number
		order += 1
		return order
	end

	local villages = (snapshot and snapshot.world and snapshot.world.villages) or {}
	local width = tonumber(snapshot and snapshot.world and snapshot.world.width) or 50
	local height = tonumber(snapshot and snapshot.world and snapshot.world.height) or 50

	sectionHeader(scroll, nextOrder(), string.format("THE WORLD  ·  %d x %d tiles", width, height))

	local holder = Instance.new("Frame")
	holder.Name = "MapCanvas"
	holder.LayoutOrder = nextOrder()
	holder.Size = UDim2.new(0, MAP_CANVAS, 0, MAP_CANVAS)
	holder.BackgroundColor3 = Color3.fromRGB(24, 30, 24)
	holder.BorderSizePixel = 0
	holder.Parent = scroll

	-- A faint grid, so distance on the map reads as distance rather than as
	-- decoration. One line every ten tiles.
	for step = 1, 4 do
		local fraction = step / 5
		for _, horizontal in { true, false } do
			local line = Instance.new("Frame")
			line.BackgroundColor3 = Color3.fromRGB(40, 50, 40)
			line.BorderSizePixel = 0
			line.ZIndex = 2
			if horizontal then
				line.Size = UDim2.new(1, 0, 0, 1)
				line.Position = UDim2.new(0, 0, fraction, 0)
			else
				line.Size = UDim2.new(0, 1, 1, 0)
				line.Position = UDim2.new(fraction, 0, 0, 0)
			end
			line.Parent = holder
		end
	end

	local home = village
	for _, other in villages do
		local kingdom = kingdomFor(tostring(other.kingdomId))
		local isMine = tostring(other.kingdomId) == kingdomId
		local isFreehold = kingdom and tostring(kingdom.seatKind) == "freehold"

		local dot = Instance.new("Frame")
		dot.Name = tostring(other.id)
		dot.AnchorPoint = Vector2.new(0.5, 0.5)
		dot.Size = if isMine then UDim2.new(0, 14, 0, 14) else UDim2.new(0, 10, 0, 10)
		dot.Position = UDim2.new((tonumber(other.x) or 0) / width, 0, (tonumber(other.y) or 0) / height, 0)
		dot.BackgroundColor3 = if isMine then Color3.fromRGB(240, 200, 90)
			elseif isFreehold then Color3.fromRGB(150, 150, 140)
			else hexColour(kingdom and kingdom.color, Color3.fromRGB(190, 90, 80))
		dot.BorderSizePixel = 0
		dot.ZIndex = 3
		dot.Parent = holder
		local round = Instance.new("UICorner")
		round.CornerRadius = UDim.new(1, 0)
		round.Parent = dot
	end

	noteRow(scroll, nextOrder(),
		"Gold is you. Grey is a Freehold - abandoned, and the one thing a young kingdom can take. Everything else is somebody's.", 44)

	-- The same settlements as a list, because a dot cannot tell you how far or
	-- who holds it.
	sectionHeader(scroll, nextOrder(), "SETTLEMENTS")
	local listed: { any } = {}
	for _, other in villages do
		if tostring(other.id) ~= tostring(villageId) then
			table.insert(listed, other)
		end
	end
	table.sort(listed, function(left, right)
		return tileDistance(home, left) < tileDistance(home, right)
	end)
	for _, other in listed do
		local kingdom = kingdomFor(tostring(other.kingdomId))
		local isFreehold = kingdom and tostring(kingdom.seatKind) == "freehold"
		noteRow(scroll, nextOrder(), string.format("%s  ·  %d tiles  ·  %s",
			tostring(other.name),
			math.floor(tileDistance(home, other) + 0.5),
			if isFreehold then "FREEHOLD - takeable" else kingdomNameFor(tostring(other.kingdomId))))
	end
end

local function buildWarTab(scroll: ScrollingFrame, village: any, villageId: string)
	local snapshot = latest.snapshot
	local kingdomId = myKingdomId()
	local order = 0
	local function nextOrder(): number
		order += 1
		return order
	end

	-- --- send scouts ---
	local scoutsOnHand = math.floor(tonumber(village.army and village.army.scout) or 0)
	sectionHeader(scroll, nextOrder(), string.format("SEND SCOUTS  ·  %d on hand", scoutsOnHand))

	if scoutsOnHand < Buildings.SCOUT_PARTY then
		noteRow(scroll, nextOrder(), "No scouts here. Scouts are trained at a Stable (level 1).")
		actionRow(scroll, nextOrder(), Buildings.SCOUT_PRESET.label, "Recruit", Color3.fromRGB(60, 50, 80), function()
			invokeQueue({
				kind = "recruit",
				villageId = villageId,
				troop = Buildings.SCOUT_PRESET.troop,
				quantity = Buildings.SCOUT_PRESET.quantity,
			})
		end)
	end

	local targets: { any } = {}
	local villages = snapshot and snapshot.world and snapshot.world.villages
	if typeof(villages) == "table" and kingdomId then
		for _, candidate in villages do
			if candidate.kingdomId ~= kingdomId then
				table.insert(targets, candidate)
			end
		end
	end
	table.sort(targets, function(left, right)
		return tileDistance(village, left) < tileDistance(village, right)
	end)

	if #targets == 0 then
		noteRow(scroll, nextOrder(), "No foreign settlements in this world yet.")
	end
	local muster, noblesOnHand = musterCount(village)
	local conquering = rideWithNobles and noblesOnHand > 0
	for _, target in targets do
		local targetId = tostring(target.id)
		local scouted = hasReportFor(targetId)
		local text = string.format("%s — %s · %d tiles%s",
			tostring(target.name), kingdomNameFor(tostring(target.kingdomId)),
			math.floor(tileDistance(village, target) + 0.5),
			if scouted then "" else "\n  not scouted")
		local canScout = scoutsOnHand >= Buildings.SCOUT_PARTY
		local canAttack = scouted and muster > 0
		local armed = attackIsArmed(targetId)

		dualActionRow(scroll, nextOrder(), text, {
			label = if canScout then "Scout" else "—",
			color = if canScout then Color3.fromRGB(62, 92, 138) else Color3.fromRGB(45, 45, 45),
			onClick = function()
				if not canScout then
					toast("No scouts in this village — recruit some first.", false)
					return
				end
				invokeQueue({
					kind = "scout",
					villageId = villageId,
					targetVillageId = targetId,
					quantity = Buildings.SCOUT_PARTY,
				})
			end,
		}, {
			label = if armed then (if conquering then "CONQUER?" else "SEND?")
				else (if conquering then "Conquer" else "Attack"),
			color = if armed
				then Color3.fromRGB(178, 62, 46)
				else (if canAttack
					then (if conquering then Color3.fromRGB(152, 112, 42) else Color3.fromRGB(128, 62, 52))
					else Color3.fromRGB(45, 45, 45)),
			onClick = function()
				if not scouted then
					toast("Scout them first — nobody attacks blind.", false)
					return
				end
				if muster < 1 then
					toast("No fighting troops in this village.", false)
					return
				end
				-- First tap arms, second sends: this commits the whole garrison,
				-- and on a conquest a nobleman who is never coming back.
				if not attackIsArmed(targetId) then
					armedTargetId = targetId
					armedAt = os.clock()
					toast(if conquering
						then string.format("Tap again to send %d troops and %d nobleman at %s — this is a conquest.",
							muster, noblesOnHand, tostring(target.name))
						else string.format("Tap again to send %d troops at %s.", muster, tostring(target.name)), true)
					buildTablePanel()
					-- Let the button say "Attack" again the moment it stops
					-- meaning "SEND?", instead of at the next heartbeat.
					task.delay(ARM_SECONDS + 0.1, function()
						if inTableView and not attackIsArmed(targetId) then
							buildTablePanel()
						end
					end)
					return
				end
				armedTargetId = nil
				invokeQueue({
					kind = "attack",
					villageId = villageId,
					targetVillageId = targetId,
					plan = attackPlan,
					withNobles = conquering,
				})
			end,
		})
	end

	-- --- noblemen: the only way a village ever changes hands ---
	sectionHeader(scroll, nextOrder(), string.format("NOBLEMEN  ·  %d on hand", noblesOnHand))
	if noblesOnHand < 1 then
		noteRow(scroll, nextOrder(),
			"Only a surviving Count can break a settlement's hold on itself. He needs an Academy standing, costs a fortune, and dies if half his escort does.", 56)
		actionRow(scroll, nextOrder(), Buildings.NOBLE_PRESET.label, "Recruit", Color3.fromRGB(85, 70, 30), function()
			invokeQueue({
				kind = "recruit",
				villageId = villageId,
				troop = Buildings.NOBLE_PRESET.troop,
				quantity = Buildings.NOBLE_PRESET.quantity,
			})
		end)
	else
		noteRow(scroll, nextOrder(), if rideWithNobles
			then "Counts RIDE. One Count acts per attack and can never break more than HALF a settlement's hold, so conquest always takes at least two attacks — and the hold grows back 1% an hour if you stop."
			else "Counts stay home. Turn this on to attempt a conquest rather than a raid.", 56)
		actionRow(scroll, nextOrder(),
			if rideWithNobles then "Conquest: noblemen ride" else "Raid: noblemen stay home",
			if rideWithNobles then "Stand down" else "Ride",
			if rideWithNobles then Color3.fromRGB(152, 112, 42) else Color3.fromRGB(50, 50, 60), function()
				rideWithNobles = not rideWithNobles
				-- The armed target was armed for a DIFFERENT order.
				disarmAttack()
				buildTablePanel()
			end)
	end

	-- --- attack plan ---
	sectionHeader(scroll, nextOrder(), "ATTACK PLAN")
	noteRow(scroll, nextOrder(), string.format(
		"An attack musters every fighting troop here (%d) — scouts always stay home%s. The plan is fought even if you are offline when it lands.",
		muster,
		if conquering then string.format(", and %d nobleman rides", noblesOnHand) else " and so do noblemen"), 56)
	for _, axis in Buildings.ATTACK_PLAN_AXES do
		local current = attackPlan[axis.key] or axis.options[1]
		actionRow(scroll, nextOrder(), string.format("%s: %s", axis.label, current), "Change",
			Color3.fromRGB(45, 45, 60), function()
				local nextIndex = 1
				for index, option in axis.options do
					if option == current then
						nextIndex = (index % #axis.options) + 1
						break
					end
				end
				attackPlan[axis.key] = axis.options[nextIndex]
				buildTablePanel()
			end)
	end

	-- --- on the march ---
	local marches = (snapshot and snapshot.marches) or {}
	sectionHeader(scroll, nextOrder(), "ON THE MARCH")
	local moving = 0
	for _, march in marches do
		local status = tostring(march.status)
		if status == "outbound" or status == "returning" then
			moving += 1
			local what = if tostring(march.kind) == "scout" then "Scouts" else "Army"
			local where = villageLabel(tostring(march.targetVillageId))
			local heading = if status == "returning"
				then string.format("%s returning from %s", what, where)
				else string.format("%s → %s", what, where)
			countdownRow(scroll, nextOrder(), heading, TimeUtil.isoToEpoch(march.arrivesAt))
		elseif status == "awaiting_battle" then
			moving += 1
			local where = villageLabel(tostring(march.targetVillageId))
			actionRow(scroll, nextOrder(), string.format("Army at the walls of %s", where), "Take field",
				Color3.fromRGB(105, 45, 35), function()
					if march.battleId then
						local joined = battleById(tostring(march.battleId))
						if joined then
							enterBattle(joined)
							return
						end
					end
					invokeQueue({ kind = "battleOpen", marchId = tostring(march.id), plan = attackPlan })
				end)
		end
	end
	if moving == 0 then
		noteRow(scroll, nextOrder(), "Nobody is on the road.")
	end

	-- --- scout reports ---
	sectionHeader(scroll, nextOrder(), "SCOUT REPORTS")
	local reports = (snapshot and snapshot.scoutReports) or {}
	local sorted: { any } = {}
	for _, report in reports do
		table.insert(sorted, report)
	end
	table.sort(sorted, function(left, right)
		return tostring(left.createdAt) > tostring(right.createdAt)
	end)
	if #sorted == 0 then
		noteRow(scroll, nextOrder(), "None yet. Send scouts at a neighbour to learn what they hold.")
	end
	for index, report in sorted do
		if index > 5 then
			break
		end
		local card = Instance.new("Frame")
		card.Size = UDim2.new(1, -8, 0, 124)
		card.BackgroundColor3 = Color3.fromRGB(26, 30, 26)
		card.BackgroundTransparency = 0.15
		card.LayoutOrder = nextOrder()
		card.Parent = scroll

		local body = makeLabel(card, "Body")
		body.Size = UDim2.new(1, -12, 1, -8)
		body.Position = UDim2.new(0, 8, 0, 4)
		body.TextXAlignment = Enum.TextXAlignment.Left
		body.TextYAlignment = Enum.TextYAlignment.Top
		body.TextScaled = false
		body.TextSize = 14
		body.TextWrapped = true
		local observed = report.observedBuildings or {}
		body.Text = string.format(
			"%s  (%s)\n%s\nWood %d · Stone %d · Iron %d\nRampart Lv %d · Headquarters Lv %d\nseen %s",
			tostring(report.targetVillageName),
			tostring(report.targetKingdomName),
			armySummary(report.observedArmy),
			math.floor(tonumber(report.observedResources and report.observedResources.wood) or 0),
			math.floor(tonumber(report.observedResources and report.observedResources.stone) or 0),
			math.floor(tonumber(report.observedResources and report.observedResources.iron) or 0),
			math.floor(tonumber(observed.wall) or 0),
			math.floor(tonumber(observed.hq) or 0),
			ageText(report.createdAt)
		)
	end

	-- --- battle reports ---
	-- The snapshot carries every battle this kingdom was in, as attacker OR
	-- defender, so a raid on your own walls reads here too.
	sectionHeader(scroll, nextOrder(), "BATTLE REPORTS")
	local battles: { any } = {}
	for _, battle in ((snapshot and snapshot.battleSessions) or {}) do
		if battle.outcome then
			table.insert(battles, battle)
		end
	end
	table.sort(battles, function(left, right)
		return tostring(left.resolvedAt or left.openedAt) > tostring(right.resolvedAt or right.openedAt)
	end)
	if #battles == 0 then
		noteRow(scroll, nextOrder(), "No battles fought yet.")
	end
	for index, battle in battles do
		if index > 4 then
			break
		end
		local outcome = battle.outcome
		local iAttacked = tostring(battle.attackerKingdomId) == kingdomId
		local mine = if iAttacked then outcome.attackerCasualties else outcome.defenderCasualties
		local theirs = if iAttacked then outcome.defenderCasualties else outcome.attackerCasualties
		local loot = outcome.loot or { wood = 0, stone = 0, iron = 0 }
		local lootTotal = math.floor((tonumber(loot.wood) or 0) + (tonumber(loot.stone) or 0) + (tonumber(loot.iron) or 0))
		local yieldedCount = 0
		for _, troop in Buildings.TROOP_ORDER do
			yieldedCount += math.floor(tonumber(outcome.yielded and outcome.yielded[troop]) or 0)
		end

		local card = Instance.new("Frame")
		card.Size = UDim2.new(1, -8, 0, 146)
		card.BackgroundColor3 = if battleVerdict(battle, kingdomId) == "Victory"
			then Color3.fromRGB(26, 34, 26)
			else Color3.fromRGB(38, 26, 26)
		card.BackgroundTransparency = 0.15
		card.LayoutOrder = nextOrder()
		card.Parent = scroll

		-- The same scene, from the same seed, as the one that played live.
		local watch = Instance.new("TextButton")
		watch.Size = UDim2.new(1, -16, 0, 26)
		watch.Position = UDim2.new(0, 8, 1, -30)
		watch.BackgroundColor3 = Color3.fromRGB(50, 50, 62)
		watch.TextColor3 = Color3.new(1, 1, 1)
		watch.Font = Enum.Font.GothamBold
		watch.TextScaled = true
		watch.Text = "Watch it play out"
		watch.Parent = card
		watch.Activated:Connect(function()
			enterBattle(battle)
		end)

		local body = makeLabel(card, "Body")
		body.Size = UDim2.new(1, -12, 1, -40)
		body.Position = UDim2.new(0, 8, 0, 4)
		body.TextXAlignment = Enum.TextXAlignment.Left
		body.TextYAlignment = Enum.TextYAlignment.Top
		body.TextScaled = false
		body.TextSize = 14
		body.TextWrapped = true
		body.Text = string.format(
			"%s — %s %s\nYour losses: %s\nTheir losses: %s\n%s%s",
			battleVerdict(battle, kingdomId),
			if iAttacked then "attack on" else "defence of",
			villageLabel(tostring(battle.defenderVillageId)),
			armySummary(mine, "none"),
			armySummary(theirs, "none"),
			if lootTotal > 0 then string.format("Plunder: %d resources\n", lootTotal) else "",
			if yieldedCount > 0
				then string.format("%d %s surrendered and now serve %s",
					yieldedCount,
					if yieldedCount == 1 then "soldier" else "soldiers",
					if iAttacked then "you" else "them")
				else ageText(battle.resolvedAt)
		)
	end
end

function buildTablePanel()
	-- The panel is rebuilt on every heartbeat so it can never show stale
	-- state. Carry the scroll position across, or a player reading a scout
	-- report gets yanked to the top every 10 seconds.
	local keptScroll: Vector2? = nil
	if tablePanel then
		local previous = tablePanel:FindFirstChild("Body")
		if previous and previous:IsA("ScrollingFrame") then
			keptScroll = previous.CanvasPosition
		end
		tablePanel:Destroy()
		tablePanel = nil
	end
	table.clear(panelRows)
	local village = myVillage(tableInfo and tableInfo.villageId)
	if not village then
		return
	end
	local villageId = tostring(village.id)

	local viewport = camera.ViewportSize
	local topLeftInset, bottomRightInset = GuiService:GetGuiInset()
	local safeLeft = math.max(math.floor(topLeftInset.X) + 8, 8)
	local safeRight = math.max(math.floor(bottomRightInset.X) + 8, 8)
	local safeBottom = math.max(math.floor(bottomRightInset.Y) + 8, 8)
	local panelTop = if resourceBar.Visible
		then resourceBar.Position.Y.Offset + resourceBar.Size.Y.Offset + 8
		else math.max(math.floor(topLeftInset.Y) + 8, 8)
	local panelWidth = math.max(1, math.min(340, math.floor(viewport.X) - safeLeft - safeRight))
	local panelHeight = math.max(180, math.floor(viewport.Y) - panelTop - safeBottom)
	local panel = Instance.new("Frame")
	panel.Name = "TablePanel"
	panel.Size = UDim2.fromOffset(panelWidth, panelHeight)
	panel.Position = UDim2.fromOffset(safeLeft, panelTop)
	panel.BackgroundColor3 = Color3.fromRGB(18, 18, 26)
	panel.BackgroundTransparency = 0.02
	panel.ZIndex = 2
	panel.Parent = gui
	addCorner(panel, 6)
	addStroke(panel, HUD_GOLD, 0.45)
	tablePanel = panel

	-- tab bar
	local tabs = Instance.new("Frame")
	tabs.Name = "Tabs"
	tabs.Size = UDim2.new(1, 0, 0, 36)
	tabs.BackgroundTransparency = 1
	tabs.Parent = panel
	local function makeTab(name: string, label: string, xScale: number)
		local button = Instance.new("TextButton")
		button.Name = name
		button.Size = UDim2.new(1 / 3, -6, 1, -6)
		button.Position = UDim2.new(xScale, 4, 0, 3)
		button.BackgroundColor3 = if activeTab == name then Color3.fromRGB(55, 65, 90) else Color3.fromRGB(28, 28, 36)
		button.TextColor3 = Color3.new(1, 1, 1)
		button.Font = Enum.Font.GothamBold
		button.TextScaled = false
		button.TextSize = 14
		button.Text = label
		button.Parent = tabs
		button.Activated:Connect(function()
			if activeTab ~= name then
				activeTab = name
				buildTablePanel()
			end
		end)
	end
	makeTab("village", "Village", 0)
	makeTab("war", "War", 1 / 3)
	makeTab("map", "Map", 2 / 3)

	local scroll = Instance.new("ScrollingFrame")
	scroll.Name = "Body"
	scroll.Size = UDim2.new(1, 0, 1, -92)
	scroll.Position = UDim2.new(0, 0, 0, 40)
	scroll.CanvasSize = UDim2.new()
	scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
	scroll.BackgroundTransparency = 1
	scroll.ScrollBarThickness = 6
	scroll.Parent = panel
	local layout = Instance.new("UIListLayout")
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Padding = UDim.new(0, 4)
	layout.Parent = scroll

	if activeTab == "war" then
		buildWarTab(scroll, village, villageId)
	elseif activeTab == "map" then
		buildMapTab(scroll, village, villageId)
	else
		buildVillageTab(scroll, village, villageId)
	end
	if keptScroll then
		-- after the rows exist, so the canvas is tall enough to accept it
		task.defer(function()
			if scroll.Parent then
				scroll.CanvasPosition = keptScroll :: Vector2
			end
		end)
	end

	local leave = Instance.new("TextButton")
	leave.Size = UDim2.new(1, -8, 0, 40)
	leave.Position = UDim2.new(0, 4, 1, -44)
	leave.BackgroundColor3 = Color3.fromRGB(70, 40, 30)
	leave.TextColor3 = Color3.new(1, 1, 1)
	leave.Font = Enum.Font.GothamBold
	leave.TextScaled = false
	leave.TextSize = 14
	leave.Text = "Step away from the table"
	leave.Parent = panel
	leave.Activated:Connect(exitTableView)
end

local function openTableView(info: { centerX: number, centerZ: number, boundsHalf: number, villageId: string? })
	if inTableView then
		return
	end
	inTableView = true
	refreshHudModeVisibility()
	tableInfo = info
	activeTab = "village"
	camera.CameraType = Enum.CameraType.Scriptable
	-- fixed overhead vantage, clamped by construction to this settlement
	local center = Vector3.new(info.centerX, 0, info.centerZ)
	camera.CFrame = CFrame.lookAt(center + Vector3.new(0, 150, 70), center)
	buildTablePanel()
end
requestOpenLocalTable = openTableView
enterTable.OnClientEvent:Connect(openTableView)

-- QA/demo hook, used only by demo.project.json's self-driving tour: setting a
-- "DemoTab" attribute on this ScreenGui switches the war-table tab, because
-- one script cannot fire another script's Button.Activated. Nothing in the
-- real game ever sets it, and it carries NO authority — it only chooses which
-- local rows are drawn from state the player already has.
gui:GetAttributeChangedSignal("DemoTab"):Connect(function()
	local wanted = gui:GetAttribute("DemoTab")
	if inTableView and (wanted == "village" or wanted == "war" or wanted == "map") and activeTab ~= wanted then
		activeTab = tostring(wanted)
		buildTablePanel()
	end
end)

-- walking (any movement) exits the table; hook the CURRENT character too —
-- by the time this script runs the first character usually already exists.
local function hookCharacter(character: Model)
	local humanoid = character:WaitForChild("Humanoid", 10)
	if humanoid and humanoid:IsA("Humanoid") then
		humanoid.Running:Connect(function(speed)
			if inTableView and speed > 1 then
				exitTableView()
			end
		end)
	end
end
player.CharacterAdded:Connect(hookCharacter)
if player.Character then
	task.spawn(hookCharacter, player.Character)
end

-- ===== battle view (slice B) =====
-- The scene is a rendering of maths that already happened on the world server.
-- Nothing below can change an outcome: orders are sent to the realm and only
-- count once IT accepts them, and the bodies on the field are drawn from the
-- battle row, never the other way round.

local battleViewId: string? = nil
local battlePanel: Frame? = nil
local selectedSquad: string = BattleConfig.SQUADS[1].id
local orderInput: RBXScriptConnection? = nil

-- A battle of mine that is still being fought.
local function openBattle(): any
	for _, battle in ((latest.snapshot and latest.snapshot.battleSessions) or {}) do
		if tostring(battle.status) == "open" then
			return battle
		end
	end
	return nil
end

-- An army of mine standing at a wall with no battle joined yet.
local function waitingMarch(): any
	for _, march in ((latest.snapshot and latest.snapshot.marches) or {}) do
		if tostring(march.status) == "awaiting_battle" and not march.battleId then
			return march
		end
	end
	return nil
end

local function battleAtMs(battle: any): number
	local opened = TimeUtil.isoToEpoch(battle and battle.openedAt)
	if not opened then
		return 0
	end
	return math.clamp(math.floor((nowServerSeconds() - opened) * 1000), 0, 600000)
end

local function exitBattle()
	if not inBattleView then
		return
	end
	inBattleView = false
	battleViewId = nil
	if orderInput then
		orderInput:Disconnect()
		orderInput = nil
	end
	if battlePanel then
		battlePanel:Destroy()
		battlePanel = nil
	end
	BattleScene.stop()
	camera.CameraType = Enum.CameraType.Custom
	refreshHudModeVisibility()
end

-- Where on the field did they tap? The ray is intersected with the ground
-- plane rather than raycast, so an order never misses because a soldier was
-- standing in the way.
local function fieldPointFrom(screenPosition: Vector2): Vector3?
	local ray = camera:ViewportPointToRay(screenPosition.X, screenPosition.Y)
	if math.abs(ray.Direction.Y) < 0.001 then
		return nil
	end
	local distance = -ray.Origin.Y / ray.Direction.Y
	if distance <= 0 then
		return nil
	end
	return ray.Origin + ray.Direction * distance
end

local function sendOrder(point: Vector3)
	local battle = battleById(battleViewId)
	if not battle or tostring(battle.status) ~= "open" then
		return
	end
	local x, y = BattleScene.orderSquad(selectedSquad, point)
	invokeQueue({
		kind = "battleOrder",
		battleId = tostring(battle.id),
		squad = selectedSquad,
		x = x,
		y = y,
		atMs = battleAtMs(battle),
	})
end

function enterBattle(battle: any): boolean
	local village = villageById(tostring(battle and battle.defenderVillageId))
	if not battle or not village then
		toast("That battlefield is not on your map yet.", false)
		return false
	end
	exitTableView()
	if not BattleScene.start(battle, village) then
		return false
	end
	inBattleView = true
	refreshHudModeVisibility()
	battleViewId = tostring(battle.id)
	selectedSquad = BattleConfig.SQUADS[1].id

	local center = BattleScene.center()
	camera.CameraType = Enum.CameraType.Scriptable
	camera.CFrame = CFrame.lookAt(center + Vector3.new(0, 118, 128), center)

	orderInput = UserInputService.InputBegan:Connect(function(input, processed)
		if processed or not inBattleView then
			return
		end
		if input.UserInputType ~= Enum.UserInputType.MouseButton1 and input.UserInputType ~= Enum.UserInputType.Touch then
			return
		end
		local point = fieldPointFrom(Vector2.new(input.Position.X, input.Position.Y))
		if point then
			sendOrder(point)
		end
	end)

	buildBattlePanel()
	return true
end

function buildBattlePanel()
	if battlePanel then
		battlePanel:Destroy()
		battlePanel = nil
	end
	if not inBattleView then
		return
	end
	local battle = battleById(battleViewId)
	if not battle then
		return
	end
	local live = tostring(battle.status) == "open"
	local kingdomId = myKingdomId()
	local iAttack = tostring(battle.attackerKingdomId) == kingdomId
	local viewport = camera.ViewportSize
	local topLeftInset, bottomRightInset = GuiService:GetGuiInset()
	local safeTop = math.max(math.floor(topLeftInset.Y) + 8, 8)
	local safeLeft = math.max(math.floor(topLeftInset.X) + 8, 8)
	local safeRight = math.max(math.floor(bottomRightInset.X) + 8, 8)
	local safeBottom = math.max(math.floor(bottomRightInset.Y) + 8, 8)
	local panelWidth = math.max(1, math.floor(viewport.X) - safeLeft - safeRight)
	local panelTop = math.max(safeTop, math.floor(viewport.Y) - safeBottom - 132)

	local panel = Instance.new("Frame")
	panel.Name = "BattlePanel"
	panel.Size = UDim2.fromOffset(panelWidth, 132)
	panel.Position = UDim2.fromOffset(safeLeft, panelTop)
	panel.BackgroundColor3 = Color3.fromRGB(12, 12, 16)
	panel.BackgroundTransparency = 0.2
	panel.Parent = gui
	battlePanel = panel

	local heading = makeLabel(panel, "Heading")
	heading.Size = UDim2.new(1, -16, 0, 26)
	heading.Position = UDim2.new(0, 8, 0, 4)
	heading.TextXAlignment = Enum.TextXAlignment.Left
	heading.TextScaled = false
	heading.TextSize = 16
	local orders = math.floor(tonumber(battle.acceptedOrders) or 0)
	if live then
		heading.Text = string.format(
			"%s — %s · %d orders carried (+%d%%) · %d on the field",
			if iAttack then "Your assault on" else "Defence of",
			villageLabel(tostring(battle.defenderVillageId)),
			orders,
			math.min(orders * 2, 12),
			BattleScene.renderedCount()
		)
	else
		heading.Text = string.format("%s — %s",
			battleVerdict(battle, kingdomId), villageLabel(tostring(battle.defenderVillageId)))
	end

	local hint = makeLabel(panel, "Hint")
	hint.Size = UDim2.new(1, -16, 0, 20)
	hint.Position = UDim2.new(0, 8, 0, 28)
	hint.TextXAlignment = Enum.TextXAlignment.Left
	hint.TextScaled = false
	hint.TextSize = 13
	hint.TextTransparency = 0.35
	hint.Text = if live and iAttack
		then string.format("Pick a squad, then tap the ground to send it. %s selected.", BattleScene.squadLabel(selectedSquad))
		else "The realm has already settled this. You are watching it play out."

	local bar = Instance.new("Frame")
	bar.Size = UDim2.new(1, -16, 0, 44)
	bar.Position = UDim2.new(0, 8, 0, 52)
	bar.BackgroundTransparency = 1
	bar.Parent = panel
	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Horizontal
	layout.Padding = UDim.new(0, 6)
	layout.Parent = bar

	local function barButton(text: string, color: Color3, width: number, onClick: () -> ())
		local button = Instance.new("TextButton")
		button.Size = UDim2.new(width, -6, 1, 0)
		button.BackgroundColor3 = color
		button.TextColor3 = Color3.new(1, 1, 1)
		button.Font = Enum.Font.GothamBold
		button.TextScaled = true
		button.Text = text
		button.Parent = bar
		button.Activated:Connect(onClick)
	end

	if live and iAttack then
		for _, squad in BattleConfig.SQUADS do
			local chosen = squad.id == selectedSquad
			barButton(squad.label, if chosen then squad.color else Color3.fromRGB(40, 40, 48), 0.2, function()
				selectedSquad = squad.id
				buildBattlePanel()
			end)
		end
		barButton("Charge", Color3.fromRGB(115, 60, 40), 0.2, function()
			invokeQueue({ kind = "battleResolve", battleId = tostring(battle.id) })
		end)
		barButton("Fall back", Color3.fromRGB(60, 50, 45), 0.2, function()
			invokeQueue({ kind = "battleRetreat", battleId = tostring(battle.id), atMs = battleAtMs(battle) })
		end)
	end

	local leave = Instance.new("TextButton")
	leave.Size = UDim2.new(1, -16, 0, 30)
	leave.Position = UDim2.new(0, 8, 1, -34)
	leave.BackgroundColor3 = Color3.fromRGB(45, 45, 55)
	leave.TextColor3 = Color3.new(1, 1, 1)
	leave.Font = Enum.Font.GothamBold
	leave.TextScaled = true
	leave.Text = if live then "Leave the field (the battle goes on)" else "Done watching"
	leave.Parent = panel
	leave.Activated:Connect(exitBattle)
end

-- The one banner that pulls you into a fight. Always visible, because on a
-- phone a battle you have to go looking for is a battle you miss.
local battleCall = Instance.new("TextButton")
battleCall.Name = "BattleCall"
battleCall.Size = UDim2.new(0, 360, 0, 34)
battleCall.Position = UDim2.new(0.5, -180, 0, 46)
battleCall.BackgroundColor3 = Color3.fromRGB(105, 45, 35)
battleCall.BackgroundTransparency = 0.1
battleCall.TextColor3 = Color3.new(1, 1, 1)
battleCall.Font = Enum.Font.GothamBold
battleCall.TextScaled = true
battleCall.Text = ""
battleCall.Visible = false
battleCall.Parent = gui
battleCall:GetPropertyChangedSignal("Visible"):Connect(applyHudLayout)
applyHudLayout()

local function refreshBattleCall()
	if inBattleView or latest.status ~= "online" then
		battleCall.Visible = false
		return
	end
	local battle = openBattle()
	if battle then
		battleCall.Text = "⚔  Take the field at " .. villageLabel(tostring(battle.defenderVillageId))
		battleCall.Visible = true
		return
	end
	local march = waitingMarch()
	if march then
		battleCall.Text = "⚔  Your army waits at " .. villageLabel(tostring(march.targetVillageId))
		battleCall.Visible = true
		return
	end
	battleCall.Visible = false
end

battleCall.Activated:Connect(function()
	local battle = openBattle()
	if battle then
		enterBattle(battle)
		return
	end
	local march = waitingMarch()
	if march then
		-- Opening the battle is a real command; the scene starts when the
		-- realm confirms it and the next snapshot carries the battle row.
		invokeQueue({ kind = "battleOpen", marchId = tostring(march.id), plan = attackPlan })
	end
end)

-- QA/demo hook, twin of DemoTab and used only by the self-driving tour: one
-- script cannot fire another script's Button.Activated, so the tour asks for
-- the battle view by attribute. "enter" takes the field on whatever battle is
-- open, "leave" steps off it. Nothing in the real game sets it, and it carries
-- no authority — it presses a button a player could press.
gui:GetAttributeChangedSignal("DemoBattle"):Connect(function()
	local wanted = gui:GetAttribute("DemoBattle")
	if wanted == "enter" and not inBattleView then
		local battle = openBattle()
		if battle then
			enterBattle(battle)
		end
	elseif wanted == "leave" then
		exitBattle()
	end
end)

-- ===== HUD refresh =====
-- Report ids already seen, so a freshly arrived report toasts exactly once.
-- Seeded silently from the first snapshot: rejoining must not replay history.
local seenReports: { [string]: boolean } = {}
local seenBattles: { [string]: boolean } = {}
local seededReports = false

-- Every village id this kingdom held as of the last snapshot. A village that
-- appears here for the first time AFTER the join seed just changed hands, and
-- that is the only signal the celebration needs — the world server has already
-- settled the conquest, so the client is reacting to a fact, not deciding one.
local ownedVillages: { [string]: boolean } = {}
local seededOwnership = false

local function announceNewReports(snapshot: any)
	local reports = snapshot and snapshot.scoutReports
	if typeof(reports) == "table" then
		for _, report in reports do
			local id = tostring(report.id)
			if not seenReports[id] then
				seenReports[id] = true
				if seededReports then
					toast(string.format("Scouts are back from %s.", tostring(report.targetVillageName)), true)
				end
			end
		end
	end

	-- A battle can finish while you are anywhere in the world — including one
	-- fought at your own walls by someone else's army, or one the server
	-- resolved for you because you were not there.
	local kingdomId = myKingdomId()
	local battles = snapshot and snapshot.battleSessions
	if typeof(battles) == "table" then
		for _, battle in battles do
			local id = tostring(battle.id)
			if battle.outcome and not seenBattles[id] then
				seenBattles[id] = true
				if seededReports then
					local verdict = battleVerdict(battle, kingdomId)
					toast(string.format("%s at %s.", verdict, villageLabel(tostring(battle.defenderVillageId))),
						verdict == "Victory")
				end
			end
		end
	end
	seededReports = true

	-- A village that is newly mine changed hands in my favour. Never fires on
	-- the join seed: the first snapshot is simply what I already own, and a
	-- rejoin must not replay every conquest I have ever made.
	local villages = snapshot and snapshot.world and snapshot.world.villages
	if kingdomId and typeof(villages) == "table" then
		local nowOwned: { [string]: boolean } = {}
		local taken: string? = nil
		for _, village in villages do
			if tostring(village.kingdomId) == kingdomId then
				local id = tostring(village.id)
				nowOwned[id] = true
				if seededOwnership and not ownedVillages[id] then
					taken = tostring(village.name)
				end
			end
		end
		ownedVillages = nowOwned
		seededOwnership = true
		if taken then
			Celebration.play(taken)
		end
	end
end

local function economyForVillage(snapshot: any, villageId: string?): any
	if not villageId then
		return nil
	end
	for _, economy in (snapshot.villageEconomy or {}) do
		if tostring(economy.villageId) == villageId then
			return economy
		end
	end
	return nil
end

local function updateResourceChip(resourceName: string, amountValue: any, productionValue: any, capacityValue: any)
	local chip = resourceChips[resourceName]
	if not chip then
		return
	end
	local amount = math.max(tonumber(amountValue) or 0, 0)
	local production = math.max(tonumber(productionValue) or 0, 0)
	local capacity = math.max(tonumber(capacityValue) or 0, 0)
	chip.rate.Text = string.format("+%s/h", compactAmount(production))
	chip.value.Text = compactAmount(amount)
	if capacity > 0 then
		chip.fill.Size = UDim2.new(math.clamp(amount / capacity, 0, 1), 0, 1, 0)
	else
		chip.fill.Size = UDim2.new(0, 0, 1, 0)
	end
end

local function refreshHud()
	local snapshot = latest.snapshot
	local capital = myCapital()
	local resourceVillage = if inTableView then myVillage(tableInfo and tableInfo.villageId) else capital
	if snapshot and resourceVillage then
		local economy = economyForVillage(snapshot, tostring(resourceVillage.id))
		local production = (economy and economy.productionPerHour) or resourceVillage.productionPerHour or {}
		local capacity = (economy and economy.storageCapacity) or resourceVillage.storageCapacity
		local resources = resourceVillage.resources or {}
		updateResourceChip("wood", resources.wood, production.wood, capacity)
		updateResourceChip("stone", resources.stone, production.stone, capacity)
		updateResourceChip("iron", resources.iron, production.iron, capacity)
	end
	if snapshot and capital then
		local worldName = tostring((snapshot.world and snapshot.world.name) or "The Realm")
		local capitalName = tostring(capital.name or "Capital")
		locationLabel.Text = string.upper(string.format("—  %s · %s  —", worldName, capitalName))
	end
	refreshLocationVisibility()

	-- rebuild queue rows (few of them; cheap at heartbeat cadence)
	for _, row in queueRows do
		if row.container then
			row.container:Destroy()
		else
			row.label:Destroy()
		end
	end
	table.clear(queueRows)
	if not snapshot then
		queueIsIdle = true
		queueTitle.Visible = false
		queueContentHeight = 36
		applyHudLayout()
		return
	end

	-- BEFORE the queue rows, because building those has an early return when
	-- nothing is queued — which is most of the time. Leaving the battle work
	-- at the end of this function meant the "take the field" banner and the
	-- battle scene never updated at all unless you happened to have a job
	-- running. That is exactly how a finished battle stayed invisible.
	refreshBattleCall()
	if inBattleView then
		local liveBattle = battleById(battleViewId)
		if liveBattle then
			BattleScene.update(liveBattle)
			buildBattlePanel()
		end
	end

	local entries: { HudEntry } = {}
	local ownedVillageCount = 0
	for _, ownedVillage in ((snapshot.world and snapshot.world.villages) or {}) do
		if tostring(ownedVillage.kingdomId) == tostring(myKingdomId()) then
			ownedVillageCount += 1
		end
	end
	local function queueText(text: string, villageId: any): string
		if ownedVillageCount > 1 and villageId ~= nil then
			return string.format("%s · %s", text, villageLabel(tostring(villageId)))
		end
		return text
	end
	for _, job in (snapshot.constructionJobs or {}) do
		local targetLevel = math.floor(tonumber(job.targetLevel) or 0)
		table.insert(entries, {
			text = queueText(
				string.format("%s → Lv %d", tostring(Buildings.displayName(job.building)), targetLevel),
				job.villageId
			),
			startedAt = TimeUtil.isoToEpoch(job.startedAt),
			completesAt = TimeUtil.isoToEpoch(job.completesAt),
		})
	end
	for _, job in (snapshot.recruitmentJobs or {}) do
		local quantity = math.floor(tonumber(job.quantity) or 0)
		table.insert(entries, {
			text = queueText(
				string.format("%d %s", quantity, tostring(Buildings.troopName(job.troop))),
				job.villageId
			),
			startedAt = TimeUtil.isoToEpoch(job.startedAt),
			completesAt = TimeUtil.isoToEpoch(job.completesAt),
		})
	end
	-- Marches share the queue panel. Every non-complete state appears here,
	-- including an army waiting at the walls, so the compact card never makes
	-- an active force disappear merely because its travel timer has elapsed.
	for _, march in (snapshot.marches or {}) do
		local status = tostring(march.status)
		if status == "outbound" or status == "returning" then
			local what = if tostring(march.kind) == "scout" then "Scouts" else "Army"
			local text = if status == "returning"
				then string.format("%s returning", what)
				else string.format("%s → %s", what, villageLabel(tostring(march.targetVillageId)))
			table.insert(entries, {
				text = queueText(text, march.fromVillageId),
				startedAt = if status == "outbound" then TimeUtil.isoToEpoch(march.departedAt) else nil,
				completesAt = TimeUtil.isoToEpoch(march.arrivesAt),
			})
		elseif status == "awaiting_battle" then
			table.insert(entries, {
				text = queueText(
					string.format("Army waiting at %s", villageLabel(tostring(march.targetVillageId))),
					march.fromVillageId
				),
				startedAt = TimeUtil.isoToEpoch(march.departedAt),
				completesAt = nil,
			})
		end
	end

	table.sort(entries, function(left: HudEntry, right: HudEntry)
		local leftAt = left.completesAt or -math.huge
		local rightAt = right.completesAt or -math.huge
		if leftAt == rightAt then
			return left.text < right.text
		end
		return leftAt < rightAt
	end)

	-- The war table must refresh even when no job or march exists. Previously
	-- this lived below the idle return, leaving its contents stale in the most
	-- common state.
	if inTableView then
		buildTablePanel()
	end

	if #entries == 0 then
		local empty = makeLabel(queuePanel, "Empty")
		empty.Size = UDim2.new(1, -16, 0, 28)
		empty.LayoutOrder = 1
		empty.Text = "IDLE"
		empty.TextColor3 = HUD_GOLD
		empty.TextScaled = false
		empty.TextSize = 11
		empty.ZIndex = 4
		queueTitle.Visible = false
		queueIsIdle = true
		queueContentHeight = 36
		queuePanel.CanvasPosition = Vector2.zero
		table.insert(queueRows, {
			container = nil,
			label = empty,
			timerLabel = nil,
			baseText = "IDLE",
			startedAt = nil,
			completesAt = nil,
			lastShown = nil,
			progressFill = nil,
		})
		applyHudLayout()
		return
	end

	queueTitle.Visible = false
	queueIsIdle = false
	local contentHeight = 36
	for index, entry in entries do
		if index > 1 then
			break
		end
		local rowHeight = 28
		local startedAt = entry.startedAt
		local completesAt = entry.completesAt
		local hasProgress = startedAt ~= nil and completesAt ~= nil and completesAt > startedAt
		local row = Instance.new("Frame")
		row.Name = "Job" .. index
		row.Size = UDim2.new(1, -16, 0, rowHeight)
		row.BackgroundColor3 = HUD_CHARCOAL
		row.BackgroundTransparency = 1
		row.BorderSizePixel = 0
		row.LayoutOrder = index
		row.ZIndex = 4
		row.Parent = queuePanel

		local label = makeLabel(row, "Label")
		label.Size = if entry.completesAt then UDim2.new(1, -66, 1, 0) else UDim2.new(1, -4, 1, 0)
		label.Position = UDim2.new(0, 4, 0, 0)
		label.TextXAlignment = Enum.TextXAlignment.Left
		label.TextTruncate = Enum.TextTruncate.AtEnd
		label.TextScaled = false
		label.TextSize = 11
		label.TextColor3 = HUD_CREAM
		local overflowText = if #entries > 1 then string.format("  +%d", #entries - 1) else ""
		label.Text = "ORDER · " .. entry.text .. overflowText
		label.ZIndex = 5

		local timerLabel = makeLabel(row, "Timer")
		timerLabel.Size = UDim2.new(0, 58, 1, 0)
		timerLabel.Position = UDim2.new(1, -60, 0, 0)
		timerLabel.TextXAlignment = Enum.TextXAlignment.Right
		timerLabel.TextScaled = false
		timerLabel.TextSize = 10
		timerLabel.TextColor3 = HUD_GOLD
		timerLabel.Text = ""
		timerLabel.Visible = entry.completesAt ~= nil
		timerLabel.ZIndex = 5

		local progressTrack = Instance.new("Frame")
		progressTrack.Name = "ProgressTrack"
		progressTrack.Size = UDim2.new(1, -8, 0, 2)
		progressTrack.Position = UDim2.new(0, 4, 1, -2)
		progressTrack.BackgroundColor3 = Color3.fromRGB(76, 69, 57)
		progressTrack.BorderSizePixel = 0
		progressTrack.Visible = hasProgress
		progressTrack.ZIndex = 5
		progressTrack.Parent = row

		local progressFill = Instance.new("Frame")
		progressFill.Name = "Progress"
		progressFill.Size = UDim2.new(0, 0, 1, 0)
		progressFill.BackgroundColor3 = HUD_GOLD
		progressFill.BorderSizePixel = 0
		progressFill.ZIndex = 6
		progressFill.Parent = progressTrack

		local baseText = "ORDER · " .. entry.text .. overflowText
		table.insert(queueRows, {
			container = row,
			label = label,
			timerLabel = timerLabel,
			baseText = baseText,
			startedAt = startedAt,
			completesAt = completesAt,
			lastShown = nil,
			progressFill = if hasProgress then progressFill else nil,
		})
	end
	queueContentHeight = contentHeight
	queuePanel.CanvasPosition = Vector2.zero
	applyHudLayout()
end

-- countdown ticker: display only; writes a label only when its second changes
local function tick(rows: { CountdownRow }, now: number, indent: string)
	for _, row in rows do
		local completesAt = row.completesAt
		if completesAt then
			local delta = completesAt - now
			local remaining = if delta > 0 then math.ceil(delta) else 0
			if remaining ~= row.lastShown then
				row.lastShown = remaining
				local timerLabel = row.timerLabel
				if timerLabel then
					timerLabel.Text = if remaining > 0 then clockText(remaining) else "Completing…"
				else
					row.label.Text = string.format(
						"%s%s — %s",
						indent,
						row.baseText,
						if remaining > 0 then clockText(remaining) else "Completing…"
					)
				end
			end
			local progressFill = row.progressFill
			local startedAt = row.startedAt
			if progressFill and startedAt and completesAt > startedAt then
				local progress = math.clamp((now - startedAt) / (completesAt - startedAt), 0, 1)
				progressFill.Size = UDim2.new(progress, 0, 1, 0)
			end
		end
	end
end

task.spawn(function()
	while true do
		task.wait(0.25)
		local now = nowServerSeconds()
		tick(queueRows, now, "  ")
		tick(panelRows, now, "  ")
	end
end)

stateSync.OnClientEvent:Connect(function(payload: { snapshot: any?, status: string, clockOffset: number, outdated: boolean?, sessionError: string? })
	latest.snapshot = payload.snapshot or latest.snapshot
	latest.status = tostring(payload.status)
	latest.clockOffset = tonumber(payload.clockOffset) or latest.clockOffset
	latest.outdated = payload.outdated == true
	latest.sessionError = payload.sessionError
	-- Client-local prompts are not reached by the server's Workspace scan, so
	-- mirror the same online/offline gate on every private owner detail.
	refreshLocalPromptAvailability()

	outdatedModal.Visible = latest.outdated
	holding.Visible = latest.snapshot == nil
	holdingLabel.Text = latest.sessionError or "The realm is waking…"
	banner.Visible = latest.snapshot ~= nil and latest.status ~= "online"

	if latest.snapshot then
		announceNewReports(latest.snapshot)
		refreshHud()
	end
end)

print("[World] client loaded")
