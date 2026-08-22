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
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local shared = ReplicatedStorage:WaitForChild("WorldShared")
local Buildings = require(shared:WaitForChild("Buildings"))
local TimeUtil = require(shared:WaitForChild("TimeUtil"))

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

local function villageLabel(villageId: string?): string
	local village = villageById(villageId)
	return village and tostring(village.name) or "an unknown place"
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
queuePanel.Size = UDim2.new(0, 300, 0, 160)
queuePanel.Position = UDim2.new(1, -308, 0, 8)
queuePanel.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
queuePanel.BackgroundTransparency = 0.35
queuePanel.Parent = gui
local queueList = Instance.new("UIListLayout")
queueList.SortOrder = Enum.SortOrder.LayoutOrder
queueList.Parent = queuePanel

-- live countdown rows for the 1 Hz ticker (plain tables; no per-frame
-- instance walks). queueRows = the HUD panel, panelRows = the war table.
type CountdownRow = { label: TextLabel, baseText: string, completesAt: number?, lastShown: number? }
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
local tableInfo: { centerX: number, centerZ: number, boundsHalf: number, villageId: string? }? = nil
local tablePanel: Frame? = nil
local activeTab: string = "village"

-- The attack plan being composed at the table. Module-level so it survives the
-- panel rebuild that happens on every heartbeat; it is display state only, and
-- the Roblox server rebuilds the plan from the shared axes before sending it.
local attackPlan: { [string]: string } = Buildings.defaultAttackPlan()

-- Attacking commits every fighting troop in the village, so it takes two taps:
-- the first arms that one target, the second sends. Arming lapses on its own.
local ARM_SECONDS = 6
local armedTargetId: string? = nil
local armedAt = 0

local function attackIsArmed(targetId: string): boolean
	return armedTargetId == targetId and (os.clock() - armedAt) < ARM_SECONDS
end

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
	header.TextTransparency = 0.25
	header.Text = "  " .. text
	return header
end

local function noteRow(parent: Instance, order: number, text: string, height: number?): TextLabel
	local note = makeLabel(parent, "Note")
	note.Size = UDim2.new(1, -8, 0, height or 26)
	note.LayoutOrder = order
	note.TextXAlignment = Enum.TextXAlignment.Left
	note.TextTransparency = 0.4
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
	row.BackgroundColor3 = Color3.fromRGB(30, 30, 40)
	row.BackgroundTransparency = 0.2
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
	row.BackgroundColor3 = Color3.fromRGB(30, 30, 40)
	row.BackgroundTransparency = 0.2
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

local buildTablePanel: () -> ()

local function buildVillageTab(scroll: ScrollingFrame, village: any, villageId: string)
	for index, building in Buildings.ORDER do
		local level = tonumber(village.buildings and village.buildings[building]) or 0
		actionRow(scroll, index, string.format("%s  Lv %d", Buildings.displayName(building), level), "Upgrade",
			Color3.fromRGB(50, 70, 50), function()
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

-- Everything in this village that would march on an attack. Mirrors
-- CommandService.musterFrom — if one changes, change both.
local function musterCount(village: any): number
	local total = 0
	for _, troop in Buildings.TROOP_ORDER do
		if not Buildings.ATTACK_MUSTER_EXCLUDES[troop] then
			total += math.max(math.floor(tonumber(village and village.army and village.army[troop]) or 0), 0)
		end
	end
	return total
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
	local muster = musterCount(village)
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
			color = if canScout then Color3.fromRGB(45, 60, 85) else Color3.fromRGB(45, 45, 45),
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
			label = if armed then "SEND?" else "Attack",
			color = if armed
				then Color3.fromRGB(120, 45, 35)
				else (if canAttack then Color3.fromRGB(80, 45, 40) else Color3.fromRGB(45, 45, 45)),
			onClick = function()
				if not scouted then
					toast("Scout them first — nobody attacks blind.", false)
					return
				end
				if muster < 1 then
					toast("No fighting troops in this village.", false)
					return
				end
				-- First tap arms, second sends: this commits the whole garrison.
				if not attackIsArmed(targetId) then
					armedTargetId = targetId
					armedAt = os.clock()
					toast(string.format("Tap again to send %d troops at %s.", muster, tostring(target.name)), true)
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
				})
			end,
		})
	end

	-- --- attack plan ---
	sectionHeader(scroll, nextOrder(), "ATTACK PLAN")
	noteRow(scroll, nextOrder(), string.format(
		"An attack musters every fighting troop here (%d) — scouts and noblemen stay home. The plan is fought even if you are offline when it lands.",
		muster), 56)
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
		card.Size = UDim2.new(1, -8, 0, 118)
		card.BackgroundColor3 = if battleVerdict(battle, kingdomId) == "Victory"
			then Color3.fromRGB(26, 34, 26)
			else Color3.fromRGB(38, 26, 26)
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

	local panel = Instance.new("Frame")
	panel.Name = "TablePanel"
	panel.Size = UDim2.new(0, 340, 1, -120)
	panel.Position = UDim2.new(0, 8, 0, 84)
	panel.BackgroundColor3 = Color3.fromRGB(15, 15, 22)
	panel.BackgroundTransparency = 0.15
	panel.Parent = gui
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
		button.Size = UDim2.new(0.5, -6, 1, -6)
		button.Position = UDim2.new(xScale, 4, 0, 3)
		button.BackgroundColor3 = if activeTab == name then Color3.fromRGB(55, 65, 90) else Color3.fromRGB(28, 28, 36)
		button.TextColor3 = Color3.new(1, 1, 1)
		button.Font = Enum.Font.GothamBold
		button.TextScaled = true
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
	makeTab("war", "War", 0.5)

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
	leave.TextScaled = true
	leave.Text = "Step away from the table"
	leave.Parent = panel
	leave.Activated:Connect(exitTableView)
end

enterTable.OnClientEvent:Connect(function(info: { centerX: number, centerZ: number, boundsHalf: number, villageId: string? })
	if inTableView then
		return
	end
	inTableView = true
	tableInfo = info
	activeTab = "village"
	camera.CameraType = Enum.CameraType.Scriptable
	-- fixed overhead vantage, clamped by construction to this settlement
	local center = Vector3.new(info.centerX, 0, info.centerZ)
	camera.CFrame = CFrame.lookAt(center + Vector3.new(0, 150, 70), center)
	buildTablePanel()
end)

-- QA/demo hook, used only by demo.project.json's self-driving tour: setting a
-- "DemoTab" attribute on this ScreenGui switches the war-table tab, because
-- one script cannot fire another script's Button.Activated. Nothing in the
-- real game ever sets it, and it carries NO authority — it only chooses which
-- local rows are drawn from state the player already has.
gui:GetAttributeChangedSignal("DemoTab"):Connect(function()
	local wanted = gui:GetAttribute("DemoTab")
	if inTableView and (wanted == "village" or wanted == "war") and activeTab ~= wanted then
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

-- ===== HUD refresh =====
-- Report ids already seen, so a freshly arrived report toasts exactly once.
-- Seeded silently from the first snapshot: rejoining must not replay history.
local seenReports: { [string]: boolean } = {}
local seenBattles: { [string]: boolean } = {}
local seededReports = false

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
end

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

	-- rebuild queue rows (few of them; cheap at heartbeat cadence)
	for _, row in queueRows do
		row.label:Destroy()
	end
	table.clear(queueRows)
	local snapshot = latest.snapshot
	if not snapshot then
		return
	end
	local entries: { { text: string, completesAt: number? } } = {}
	for _, job in (snapshot.constructionJobs or {}) do
		table.insert(entries, {
			text = string.format("%s → Lv %d", Buildings.displayName(job.building), tonumber(job.targetLevel) or 0),
			completesAt = TimeUtil.isoToEpoch(job.completesAt),
		})
	end
	for _, job in (snapshot.recruitmentJobs or {}) do
		table.insert(entries, {
			text = string.format("%d %s", tonumber(job.quantity) or 0, Buildings.troopName(job.troop)),
			completesAt = TimeUtil.isoToEpoch(job.completesAt),
		})
	end
	-- Marches share the queue panel: anything of yours that is "not here yet"
	-- belongs in one place, so the HUD never hides a wave in transit.
	for _, march in (snapshot.marches or {}) do
		local status = tostring(march.status)
		if status == "outbound" or status == "returning" then
			local what = if tostring(march.kind) == "scout" then "Scouts" else "Army"
			local text = if status == "returning"
				then string.format("%s returning", what)
				else string.format("%s → %s", what, villageLabel(tostring(march.targetVillageId)))
			table.insert(entries, { text = text, completesAt = TimeUtil.isoToEpoch(march.arrivesAt) })
		end
	end
	if #entries == 0 then
		local empty = makeLabel(queuePanel, "Empty")
		empty.Size = UDim2.new(1, 0, 0, 30)
		empty.Text = "No work queued"
		empty.TextTransparency = 0.4
		table.insert(queueRows, { label = empty, baseText = "No work queued", completesAt = nil, lastShown = nil })
		return
	end
	for index, entry in entries do
		local label = makeLabel(queuePanel, "Job" .. index)
		label.Size = UDim2.new(1, -8, 0, 28)
		label.LayoutOrder = index
		label.TextXAlignment = Enum.TextXAlignment.Left
		label.Text = entry.text
		table.insert(queueRows, { label = label, baseText = entry.text, completesAt = entry.completesAt, lastShown = nil })
	end

	-- while at the table, the panel must track the same fresh state
	if inTableView then
		buildTablePanel()
	end
end

-- countdown ticker: display only; writes a label only when its second changes
local function tick(rows: { CountdownRow }, now: number, indent: string)
	for _, row in rows do
		if row.completesAt then
			local remaining = math.max(math.floor(row.completesAt - now), 0)
			if remaining ~= row.lastShown then
				row.lastShown = remaining
				row.label.Text = string.format("%s%s — %s", indent, row.baseText, clockText(remaining))
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
