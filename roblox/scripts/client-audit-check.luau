--!strict
-- Executes the real table helpers with small Roblox UI stubs. This checks
-- binding, costs and layout constraints; it is NOT a Studio rendering test.
local fs = require("@lune/fs")
local luau = require("@lune/luau")

local function between(source: string, first: string, after: string): string
	local from = assert(string.find(source, first, 1, true), first .. " missing")
	local finish = assert(string.find(source, after, from + #first, true), after .. " missing")
	return string.sub(source, from, finish - 1)
end

local function load(source: string, environment: any): any
	return luau.load(source, { environment = environment })()
end

local function pass(name: string)
	print("PASS  " .. name)
end

local client = fs.readFile("roblox/src/client/init.client.luau")
local builder = fs.readFile("roblox/src/server/SettlementBuilder.luau")
local warTable = fs.readFile("roblox/src/server/WarTable.luau")
local Buildings = load(fs.readFile("roblox/src/shared/Buildings.luau"), {})

-- Run the actual owner filter and table fan-out with 50 owned settlements,
-- then transfer one away. A capital-only implementation fails this scenario.
local player = { UserId = 41 }
local ids = {}
local rendered = {}
for i = 1, 50 do
	local id = "holding-" .. i
	table.insert(ids, id)
	rendered[id] = { detail = { ownerUserId = 41, model = { id = id } } }
end
table.insert(ids, "foreign")
rendered.foreign = { detail = { ownerUserId = 99, model = { id = "foreign" } } }
local settlementApi = {}
settlementApi.getSettlements = load(
	between(builder, "function SettlementBuilder.getSettlements", "function SettlementBuilder.getSettlement(player")
		.. "\nreturn SettlementBuilder.getSettlements",
	{ SettlementBuilder = settlementApi, playerVillageIds = { [player] = ids }, rendered = rendered })
local reached = {}
local ensureTables = load(
	between(warTable, "local function ensureTables", "WorldSession.StateChanged.Event:Connect")
		.. "\nreturn ensureTables",
	{ SettlementBuilder = settlementApi, ensureTable = function(owner, settlement)
		assert(owner == player)
		reached[settlement.id] = true
	end })
ensureTables(player)
for i = 1, 50 do
	assert(reached["holding-" .. i], "holding " .. i .. " has no table")
end
assert(not reached.foreign, "foreign private detail reached the table renderer")
rendered["holding-2"].detail.ownerUserId = 99
table.clear(reached)
ensureTables(player)
assert(not reached["holding-2"] and reached["holding-50"])
pass("all 50 owned holdings receive tables; transferred and foreign detail is excluded")

-- UI object stubs retain parent/child relationships and activated callbacks.
local function signal(): any
	local event = {}
	function event:Connect(callback)
		self.callback = callback
	end
	return event
end
local function instance(class: string): any
	local object = { ClassName = class, children = {}, Activated = signal() }
	function object:FindFirstChild(name)
		for _, child in self.children do
			if child.Name == name then return child end
		end
		return nil
	end
	return setmetatable(object, { __newindex = function(self, key, value)
		rawset(self, key, value)
		if key == "Parent" and value then table.insert(value.children, self) end
	end })
end
local function descendants(root: any): { any }
	local all = {}
	for _, child in root.children do
		table.insert(all, child)
		for _, nested in descendants(child) do table.insert(all, nested) end
	end
	return all
end
local function findText(root: any, fragment: string): any
	for _, child in descendants(root) do
		if typeof(child.Text) == "string" and string.find(child.Text, fragment, 1, true) then return child end
	end
	error("No rendered text: " .. fragment)
end
local function buttonIn(row: any): any
	for _, child in row.children do
		if child.ClassName == "TextButton" then return child end
	end
	error("row has no action button")
end
local enum = setmetatable({}, { __index = function(self, key)
	local values = setmetatable({}, { __index = function(_, item) return item end })
	rawset(self, key, values)
	return values
end })

-- Studio reproduced nearly black table controls: Instance.new created a Global
-- root, so the ZIndex-2 panel drew over its ZIndex-1 children at 98% opacity.
-- Execute the real root constructor with that observed starting value. Removing
-- the explicit Sibling assignment must fail; UI doubles cannot prove rendering.
do
	local playerGui = instance("PlayerGui")
	local hud = load(between(client, 'local gui = Instance.new("ScreenGui")', "local function makeLabel") .. "\nreturn gui", {
		Instance = { new = function(class)
			local object = instance(class)
			object.ZIndexBehavior = enum.ZIndexBehavior.Global
			return object
		end },
		Enum = enum,
		playerGui = playerGui,
	})
	assert(hud.Name == "WorldHud" and hud.Parent == playerGui, "HUD root was not installed")
	assert(hud.ZIndexBehavior == enum.ZIndexBehavior.Sibling,
		"Global ordering lets the table background cover its own controls")
end
pass("HUD root uses sibling ordering so raised table backgrounds cannot cover their children")

local function dim(scale, offset) return { Scale = scale or 0, Offset = offset or 0 } end
local function dim2(xs, xo, ys, yo) return { X = dim(xs, xo), Y = dim(ys, yo) } end
local levels = {}
for _, building in Buildings.ORDER do levels[building] = 20 end
local village = { id = "holding-50", kingdomId = "mine", buildings = levels, army = { axe = 50, sword = 25, scout = 3 }, horses = 25, horsesMax = 102 }
local catalog = {
	{ troop = "axe", cost = { wood = 60, stone = 30, iron = 40 }, population = 1, requires = {}, researchLevel = 1 },
	{ troop = "lightCavalry", cost = { wood = 0, stone = 0, iron = 0 }, population = 4, requires = {}, researchLevel = 1,
		conversion = { from = "axe", soldiersPerUnit = 1, horsesPerUnit = 1 } },
	{ troop = "heavyCavalry", cost = { wood = 0, stone = 0, iron = 0 }, population = 6, requires = {}, researchLevel = 1,
		conversion = { from = "sword", soldiersPerUnit = 1, horsesPerUnit = 1 } },
	{ troop = "noble", cost = { wood = 100, stone = 100, iron = 100 }, population = 100, requires = {}, researchLevel = 1 },
}
local latest = { snapshot = { world = { villages = { village } }, troopCatalog = catalog,
	scoutReports = { { targetVillageName = "Saltmarsh", targetKingdomName = "Freehold", observedArmy = {}, observedBuildings = {},
		observedRealmOfPower = 1250, observedRealmOfPowerMax = 5000, createdAt = "2026-09-03T00:00:00Z" } } } }
local requests = {}
local env = {
	Instance = { new = instance }, Enum = enum, UDim = { new = dim }, UDim2 = { new = dim2 },
	Color3 = { fromRGB = function(...) return { ... } end, new = function(...) return { ... } end },
	Buildings = Buildings, latest = latest, panelRows = {},
	TouchScroll = { protect = function(callback) return callback end, bind = function() end },
	invokeQueue = function(request) table.insert(requests, request) end,
	buildTablePanel = function() end, myKingdomId = function() return "mine" end,
	musterCount = function() return 0, 0 end, attackPlan = Buildings.defaultAttackPlan(), rideWithNobles = false,
	armySummary = function() return "No troops" end, ageText = function() return "2m ago" end,
}
local helpers = between(client, "local function makeLabel", "-- The world stays visually quiet")
	.. between(client, "local function sectionHeader", "-- Every troop the report actually saw")
	.. between(client, "local function scoutPowerText", "function buildTablePanel()")
	.. "\nreturn { buildVillageTab = buildVillageTab, buildWarTab = buildWarTab, actionRow = actionRow, dualActionRow = dualActionRow, scoutPowerText = scoutPowerText }"
local ui = load(helpers, env)

for _, batch in { 1, 5, 25 } do
	local root = instance("ScrollingFrame")
	ui.buildVillageTab(root, village, village.id)
	local rider = findText(root, "Crusaders ·")
	assert(string.find(rider.Text, "Berserkers × " .. batch .. " · Horses × " .. batch, 1, true), rider.Text)
	assert(not string.find(rider.Text, "Wood", 1, true), "cavalry still advertises resource spending")
	buttonIn(rider.Parent).Activated.callback()
	local sent = requests[#requests]
	assert(sent.kind == "recruit" and sent.villageId == "holding-50" and sent.troop == "lightCavalry" and sent.quantity == batch)
	assert(string.find(findText(root, "Black Knights ·").Text, "Templars × " .. batch, 1, true))
	local foot = findText(root, "Berserkers ·")
	assert(string.find(foot.Text, "Wood " .. (60 * batch), 1, true))
	buttonIn(findText(root, "Counts ·").Parent).Activated.callback()
	assert(requests[#requests].quantity == 1)
	findText(root, "Change").Activated.callback()
end
pass("x1/x5/x25 cavalry rows name actual consumed soldiers and horses; callbacks bind the secondary holding")

-- The actual row constructors must reserve full-width wrapping text above
-- controls and grow vertically, at both required phone widths. Pixel wrapping
-- itself remains Roblox's job and must still be visually checked in Studio.
for _, viewport in { 320, 390 } do
	local panelWidth = math.min(340, viewport - 16)
	local root = instance("ScrollingFrame")
	local clicked = 0
	local row = ui.actionRow(root, 1, string.rep("Long recruitment cost ", 12), "Recruit", {}, function() clicked += 1 end)
	local label = row:FindFirstChild("Name")
	local button = buttonIn(row)
	local width = row.Size.X.Scale * panelWidth + row.Size.X.Offset - 16
	assert(width > 0 and label.Size.X.Scale == 1 and label.Size.X.Offset == 0)
	assert(label.TextWrapped and label.AutomaticSize == "Y" and row.AutomaticSize == "Y")
	assert(label.LayoutOrder < button.LayoutOrder and button.Size.Y.Offset >= 44)
	button.Activated.callback()
	local pair = ui.dualActionRow(root, 2, string.rep("Settlement name ", 10),
		{ label = "Scout", color = {}, onClick = function() clicked += 1 end },
		{ label = "Conquer", color = {}, onClick = function() clicked += 1 end })
	local actions = pair:FindFirstChild("Actions")
	assert(actions.Size.Y.Offset >= 44 and pair:FindFirstChild("Name").LayoutOrder < actions.LayoutOrder)
	for _, child in actions.children do
		assert(child.Size.X.Scale * width + child.Size.X.Offset >= 44)
		child.Activated.callback()
	end
	assert(clicked == 3)
end
pass("320px and 390px table rows wrap and grow above separate 44px action targets")

local warRoot = instance("ScrollingFrame")
ui.buildWarTab(warRoot, village, village.id)
local report = findText(warRoot, "Realm of Power: 1250 / 5000 (observed)")
assert(string.find(report.Text, "seen 2m ago", 1, true), "observed strength lost its age")
assert(report.TextWrapped and report.AutomaticSize == "Y" and report.Parent.AutomaticSize == "Y")
assert(string.find(ui.scoutPowerText({}), "not recorded", 1, true))
assert(string.find(ui.scoutPowerText({ observedRealmOfPower = 0, observedRealmOfPowerMax = 5000 }), "0 / 5000", 1, true))
pass("scout cards show observed hold/max and age; unknown data stays unknown and zero remains valid")

local myVillage = load(between(client, "local function myVillage", "local function villageById") .. "\nreturn myVillage",
	{ latest = latest, myKingdomId = env.myKingdomId, myCapital = function() return village end })
assert(myVillage("holding-50") == village)
village.kingdomId = "enemy"
assert(myVillage("holding-50") == nil, "an open table stayed bound to a lost village")
pass("a table loses its village binding when ownership changes")
print("---- 6 client audit scenarios passed (runtime stubs, not visual proof) ----")
