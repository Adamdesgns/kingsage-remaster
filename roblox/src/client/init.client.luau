--!strict
-- The player's window onto the realm: HUD (resources, queues with
-- display-only countdowns from server timestamps), toasts, the war table's
-- overhead command view, and honest failure states (holding scene, reconnect
-- banner, outdated-version gate). Nothing here is authoritative.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local remotes = ReplicatedStorage:WaitForChild("WorldRemotes")
local stateSync = remotes:WaitForChild("StateSync") :: RemoteEvent
local enterTable = remotes:WaitForChild("EnterTable") :: RemoteEvent
local queueCommand = remotes:WaitForChild("QueueCommand") :: RemoteFunction
local toastRemote = remotes:WaitForChild("Toast") :: RemoteEvent

local BUILDING_NAMES: { [string]: string } = {
	hq = "Keep", timber = "Timber Camp", quarry = "Quarry", iron = "Iron Mine",
	farm = "Farm", warehouse = "Warehouse", barracks = "Barracks", wall = "Wall Works",
	academy = "Academy", stable = "Stable", workshop = "Workshop", smithy = "Smithy", market = "Market",
}
local BUILDING_ORDER = { "hq", "timber", "quarry", "iron", "farm", "warehouse", "barracks", "wall", "academy", "stable", "workshop", "smithy", "market" }
local TROOP_NAMES: { [string]: string } = {
	spear = "Spearmen", sword = "Swordsmen", axe = "Axemen", archer = "Archers",
	scout = "Scouts", lightCavalry = "Light Cavalry", ram = "Rams", noble = "Nobles",
}

-- latest world data
local latest: { snapshot: any?, status: string, clockOffset: number, outdated: boolean } = {
	snapshot = nil,
	status = "connecting",
	clockOffset = 0,
	outdated = false,
}

local function isoToEpoch(iso: string?): number?
	if typeof(iso) ~= "string" then
		return nil
	end
	local ok, dateTime = pcall(DateTime.fromIsoDate, iso)
	if ok and dateTime then
		return dateTime.UnixTimestamp
	end
	return nil
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

-- resources bar
local resourceBar = Instance.new("Frame")
resourceBar.Name = "Resources"
resourceBar.Size = UDim2.new(0, 360, 0, 34)
resourceBar.Position = UDim2.new(0.5, -180, 0, 8)
resourceBar.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
resourceBar.BackgroundTransparency = 0.25
resourceBar.Parent = gui
local resourceLabel = makeLabel(resourceBar, "Text")
resourceLabel.Size = UDim2.fromScale(1, 1)
resourceLabel.Text = ""

-- queue panel
local queuePanel = Instance.new("Frame")
queuePanel.Name = "Queues"
queuePanel.Size = UDim2.new(0, 300, 0, 130)
queuePanel.Position = UDim2.new(1, -308, 0, 8)
queuePanel.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
queuePanel.BackgroundTransparency = 0.35
queuePanel.Parent = gui
local queueList = Instance.new("UIListLayout")
queueList.SortOrder = Enum.SortOrder.LayoutOrder
queueList.Parent = queuePanel

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

-- holding scene (before first snapshot)
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
local tablePanel: Frame? = nil

local function exitTableView()
	if not inTableView then
		return
	end
	inTableView = false
	camera.CameraType = Enum.CameraType.Custom
	if tablePanel then
		tablePanel:Destroy()
		tablePanel = nil
	end
end

local function invokeQueue(request: { [string]: string | number })
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

local function buildTablePanel()
	local capital = myCapital()
	if not capital then
		return
	end
	local panel = Instance.new("Frame")
	panel.Name = "TablePanel"
	panel.Size = UDim2.new(0, 340, 1, -120)
	panel.Position = UDim2.new(0, 8, 0, 84)
	panel.BackgroundColor3 = Color3.fromRGB(15, 15, 22)
	panel.BackgroundTransparency = 0.15
	panel.Parent = gui
	tablePanel = panel

	local scroll = Instance.new("ScrollingFrame")
	scroll.Size = UDim2.new(1, 0, 1, -48)
	scroll.CanvasSize = UDim2.new(0, 0, 0, #BUILDING_ORDER * 40 + 60)
	scroll.BackgroundTransparency = 1
	scroll.ScrollBarThickness = 6
	scroll.Parent = panel
	local layout = Instance.new("UIListLayout")
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Padding = UDim.new(0, 4)
	layout.Parent = scroll

	for index, building in BUILDING_ORDER do
		local row = Instance.new("Frame")
		row.Size = UDim2.new(1, -8, 0, 36)
		row.BackgroundColor3 = Color3.fromRGB(30, 30, 40)
		row.BackgroundTransparency = 0.2
		row.LayoutOrder = index
		row.Parent = scroll

		local level = tonumber(capital.buildings and capital.buildings[building]) or 0
		local nameLabel = makeLabel(row, "Name")
		nameLabel.Size = UDim2.new(0.6, 0, 1, 0)
		nameLabel.TextXAlignment = Enum.TextXAlignment.Left
		nameLabel.Text = string.format("  %s  Lv %d", BUILDING_NAMES[building] or building, level)

		local upgrade = Instance.new("TextButton")
		upgrade.Size = UDim2.new(0.35, 0, 0.85, 0)
		upgrade.Position = UDim2.new(0.63, 0, 0.075, 0)
		upgrade.BackgroundColor3 = Color3.fromRGB(50, 70, 50)
		upgrade.TextColor3 = Color3.new(1, 1, 1)
		upgrade.Font = Enum.Font.GothamBold
		upgrade.TextScaled = true
		upgrade.Text = "Upgrade"
		upgrade.Parent = row
		upgrade.Activated:Connect(function()
			invokeQueue({ kind = "build", villageId = tostring(capital.id), building = building })
		end)
	end

	local recruitRow = Instance.new("Frame")
	recruitRow.Size = UDim2.new(1, -8, 0, 36)
	recruitRow.BackgroundColor3 = Color3.fromRGB(40, 30, 30)
	recruitRow.LayoutOrder = #BUILDING_ORDER + 1
	recruitRow.Parent = scroll
	local recruitButton = Instance.new("TextButton")
	recruitButton.Size = UDim2.fromScale(1, 1)
	recruitButton.BackgroundTransparency = 1
	recruitButton.TextColor3 = Color3.new(1, 1, 1)
	recruitButton.Font = Enum.Font.GothamBold
	recruitButton.TextScaled = true
	recruitButton.Text = "Recruit 5 Spearmen"
	recruitButton.Parent = recruitRow
	recruitButton.Activated:Connect(function()
		invokeQueue({ kind = "recruit", villageId = tostring(capital.id), troop = "spear", quantity = 5 })
	end)

	local leave = Instance.new("TextButton")
	leave.Size = UDim2.new(1, -8, 0, 40)
	leave.Position = UDim2.new(0, 4, 1, -44)
	leave.BackgroundColor3 = Color3.fromRGB(70, 40, 30)
	leave.TextColor3 = Color3.new(1, 1, 1)
	leave.Font = Enum.Font.GothamBold
	leave.TextScaled = true
	leave.Text = "Step away from the table"
	leave.Parent = panel
	leave.Activated:Connect(exitTableView)
end

enterTable.OnClientEvent:Connect(function(info: { centerX: number, centerZ: number, boundsHalf: number })
	if inTableView then
		return
	end
	inTableView = true
	camera.CameraType = Enum.CameraType.Scriptable
	-- fixed overhead vantage, clamped by construction to this settlement
	local center = Vector3.new(info.centerX, 0, info.centerZ)
	camera.CFrame = CFrame.lookAt(center + Vector3.new(0, 150, 70), center)
	buildTablePanel()
end)

-- walking (any movement) exits the table
player.CharacterAdded:Connect(function(character)
	local humanoid = character:WaitForChild("Humanoid") :: Humanoid
	humanoid.Running:Connect(function(speed)
		if inTableView and speed > 1 then
			exitTableView()
		end
	end)
end)

-- ===== HUD refresh =====
local function refreshHud()
	local capital = myCapital()
	if capital and capital.resources then
		resourceLabel.Text = string.format(
			"Wood %d   Stone %d   Iron %d",
			math.floor(tonumber(capital.resources.wood) or 0),
			math.floor(tonumber(capital.resources.stone) or 0),
			math.floor(tonumber(capital.resources.iron) or 0)
		)
	end

	-- rebuild queue rows (few of them; cheap)
	for _, child in queuePanel:GetChildren() do
		if child:IsA("TextLabel") then
			child:Destroy()
		end
	end
	local snapshot = latest.snapshot
	if not snapshot then
		return
	end
	local rows: { { text: string, completesAt: number? } } = {}
	for _, job in (snapshot.constructionJobs or {}) do
		table.insert(rows, {
			text = string.format("%s → Lv %d", BUILDING_NAMES[job.building] or job.building, tonumber(job.targetLevel) or 0),
			completesAt = isoToEpoch(job.completesAt),
		})
	end
	for _, job in (snapshot.recruitmentJobs or {}) do
		table.insert(rows, {
			text = string.format("%d %s", tonumber(job.quantity) or 0, TROOP_NAMES[job.troop] or job.troop),
			completesAt = isoToEpoch(job.completesAt),
		})
	end
	if #rows == 0 then
		local empty = makeLabel(queuePanel, "Empty")
		empty.Size = UDim2.new(1, 0, 0, 30)
		empty.Text = "No work queued"
		empty.TextTransparency = 0.4
		return
	end
	for index, row in rows do
		local label = makeLabel(queuePanel, "Job" .. index)
		label.Size = UDim2.new(1, -8, 0, 28)
		label.LayoutOrder = index
		label.TextXAlignment = Enum.TextXAlignment.Left
		label:SetAttribute("CompletesAt", row.completesAt)
		label:SetAttribute("BaseText", row.text)
		label.Text = row.text
	end
end

-- countdowns tick locally for DISPLAY ONLY, from server timestamps
RunService.Heartbeat:Connect(function()
	local nowServer = os.time() + latest.clockOffset
	for _, child in queuePanel:GetChildren() do
		if child:IsA("TextLabel") then
			local completesAt = child:GetAttribute("CompletesAt")
			local baseText = child:GetAttribute("BaseText")
			if typeof(completesAt) == "number" and typeof(baseText) == "string" then
				local remaining = math.max(math.floor(completesAt - nowServer), 0)
				child.Text = string.format("  %s — %d:%02d", baseText, remaining // 60, remaining % 60)
			end
		end
	end
end)

stateSync.OnClientEvent:Connect(function(payload: { snapshot: any?, status: string, clockOffset: number, outdated: boolean? })
	latest.snapshot = payload.snapshot or latest.snapshot
	latest.status = tostring(payload.status)
	latest.clockOffset = tonumber(payload.clockOffset) or latest.clockOffset
	latest.outdated = payload.outdated == true

	outdatedModal.Visible = latest.outdated
	holding.Visible = latest.snapshot == nil
	banner.Visible = latest.snapshot ~= nil and latest.status ~= "online"

	if latest.snapshot then
		refreshHud()
	end
end)

print("[World] client loaded")
