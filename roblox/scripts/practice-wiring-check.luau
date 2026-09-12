--!strict
-- Execute the real init.client practice entry, transport and panel lifecycle
-- in one lexical scope. UI/service stubs prove wiring, not Studio rendering.
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local roblox = require("@lune/roblox")
local client = fs.readFile("roblox/src/client/init.client.luau")
local Buildings = luau.load(fs.readFile("roblox/src/shared/Buildings.luau"))()
local Config = luau.load(fs.readFile("roblox/src/shared/PracticeSiegeConfig.luau"))()
local checks = 0

local function check(name: string, condition: boolean)
	assert(condition, name)
	checks += 1
	print("PASS  " .. name)
end

local function between(source: string, first: string, after: string): string
	local start = assert(string.find(source, first, 1, true), first .. " missing")
	local finish = assert(string.find(source, after, start + #first, true), after .. " missing")
	return string.sub(source, start, finish - 1)
end

local function signal(): any
	local listeners = {}
	return {
		Connect = function(_self, callback)
			table.insert(listeners, callback)
			return { Disconnect = function() end }
		end,
		Fire = function(_self, ...)
			for _, callback in listeners do callback(...) end
		end,
	}
end

local function instance(class: string): any
	local props = { ClassName = class, children = {}, attributes = {}, Activated = signal(), Triggered = signal(), CanvasPosition = { X = 0, Y = 0 } }
	local object = {}
	function object:IsA(name) return name == class or name == "GuiObject" end
	function object:SetAttribute(key, value) props.attributes[key] = value end
	function object:GetAttribute(key) return props.attributes[key] end
	function object:FindFirstChild(name)
		for _, child in props.children do if child.Name == name then return child end end
		return nil
	end
	function object:GetChildren() return table.clone(props.children) end
	function object:GetDescendants()
		local result = {}
		for _, child in props.children do
			table.insert(result, child)
			for _, nested in child:GetDescendants() do table.insert(result, nested) end
		end
		return result
	end
	function object:Destroy()
		props.Destroyed = true
		for _, child in table.clone(props.children) do child:Destroy() end
		self.Parent = nil
	end
	return setmetatable(object, {
		__index = props,
		__newindex = function(self, key, value)
			if key == "Parent" then
				if props.Parent then
					local old = table.find(props.Parent.children, self)
					if old then table.remove(props.Parent.children, old) end
				end
				if value then table.insert(value.children, self) end
			end
			props[key] = value
		end,
	})
end

local function findText(root: any, text: string): any?
	for _, child in root.children do
		if child.Text == text then return child end
		local nested = findText(child, text)
		if nested then return nested end
	end
	return nil
end

local enum = setmetatable({}, { __index = function(self, key)
	local values = setmetatable({}, { __index = function(_, item) return item end })
	rawset(self, key, values)
	return values
end })
local function dim(scale, offset) return { Scale = scale or 0, Offset = offset or 0 } end
local function dim2(xs, xo, ys, yo) return { X = dim(xs, xo), Y = dim(ys, yo) } end

-- Source fragments are the complete existing functions, linked together so
-- practiceOpen/tablePanel and every actual callback share the production state.
local executable = between(client, 'local PracticeSiege = require(script:WaitForChild("PracticeSiege"))', "local Celebration")
	.. between(client, 'local queueCommand = remotes:WaitForChild("QueueCommand")', "local toastRemote")
	.. between(client, "local inTableView = false", "type ShellPartState")
	.. between(client, "local function hookLocalPrompt", "local function installPrivateDetail")
	.. between(client, "local camera = workspace.CurrentCamera", "local function refreshLocationVisibility")
	.. between(client, "local function makeLabel", "-- The world stays visually quiet")
	.. between(client, "local function addCorner", "local function compactAmount")
	.. between(client, "local function exitTableView()", "local function invokeQueue")
	.. between(client, "local function sectionHeader", "-- Every troop the report actually saw")
	.. between(client, "local function scoutPowerText", "function buildTablePanel()")
	.. between(client, "function buildTablePanel()", "local function openTableView")
	.. between(client, "local function openTableView", "requestOpenLocalTable = openTableView")
	.. [[
buildBattlePanel = guardProduction
return {
	configure = function(view, tab)
		inTableView = view
		activeTab = tab
		tableInfo = { villageId = "home" }
	end,
	state = function()
		return { panel = tablePanel, practice = practiceOpen, inTable = inTableView, inBattle = inBattleView, tab = activeTab }
	end,
	build = buildTablePanel,
	open = openTableView,
	leave = exitTableView,
	refreshPrompts = refreshLocalPromptAvailability,
	hookPrompt = hookLocalPrompt,
	heartbeat = function()
]]
	.. between(client, "\t-- The war table must refresh even when no job or march exists.", "\tif #entries == 0 then")
	.. [[
	end,
}
]]

local function context(width: number): any
	local gui = instance("ScreenGui")
	local camera = { ViewportSize = { X = width, Y = 844 }, CameraType = "Scriptable" }
	local village = { id = "home", kingdomId = "mine", army = { scout = 5 } }
	local latest = { status = "online", snapshot = { world = { villages = { village } } } }
	local detail = instance("Model")
	local prompt = instance("ProximityPrompt")
	prompt.Name = "TablePrompt"
	prompt.Enabled = true
	prompt.Parent = detail
	local ownsVillage = true
	local spawned, deferred, sent = {}, {}, {}
	local nextResponse: any = nil
	local networkFailure = false
	local planner = { builds = 0, hides = 0, drawing = false, submit = nil, changed = nil, back = nil }
	function planner:isDrawing() return self.drawing end
	function planner:build(scroll, onBack)
		self.builds += 1
		self.back = onBack
		self.scroll = scroll
		local marker = instance("TextLabel")
		marker.Text = "Mounted practice planner"
		marker.Parent = scroll
	end
	function planner:hide() self.hides += 1; self.drawing = false end
	local plannerModule = {}
	function plannerModule.new(submit, changed)
		assert(planner.submit == nil, "the controller must be created once")
		planner.submit, planner.changed = submit, changed
		return planner
	end
	local function forbidden() error("practice called a production battle/queue action") end
	local moduleToken = {}
	local remote = { InvokeServer = function(_self, request)
		table.insert(sent, request)
		if networkFailure then error("simulated network loss") end
		return nextResponse
	end }
	local api = luau.load(executable, { environment = {
		script = { WaitForChild = function(_self, name) assert(name == "PracticeSiege"); return moduleToken end },
		require = function(token) assert(token == moduleToken); return plannerModule end,
		remotes = { WaitForChild = function(_self, name) assert(name == "QueueCommand"); return remote end },
		workspace = { CurrentCamera = camera }, gui = gui,
		Instance = { new = instance }, Enum = enum, UDim = { new = dim },
		UDim2 = { new = dim2, fromOffset = function(x, y) return dim2(0, x, 0, y) end },
		Color3 = { new = function(...) return { ... } end, fromRGB = function(...) return { ... } end },
		CFrame = roblox.CFrame, Vector3 = roblox.Vector3,
		GuiService = { GetGuiInset = function() return {X=0,Y=0}, {X=0,Y=0} end },
		resourceBar = { Visible = false }, HUD_GOLD = {}, panelRows = {},
		refreshHudModeVisibility = function() end,
		myVillage = function(id) assert(id == "home"); return if ownsVillage then village else nil end,
		myKingdomId = function() return "mine" end,
		TouchScroll = { bind = function() end, protect = function(callback) return callback end },
		Buildings = Buildings, attackPlan = Buildings.defaultAttackPlan(), rideWithNobles = false,
		latest = latest, localDetails = { home = detail },
		musterCount = function() return 0, 0 end,
		buildMapTab = function(scroll) local label = instance("TextLabel"); label.Text = "Map content"; label.Parent = scroll end,
		buildVillageTab = function(scroll) local label = instance("TextLabel"); label.Text = "Village content"; label.Parent = scroll end,
		invokeQueue = forbidden, guardProduction = forbidden, BattleScene = setmetatable({}, { __index = function() return forbidden end }),
		enterBattle = forbidden, sendOrder = forbidden,
		task = {
			spawn = function(callback) table.insert(spawned, callback) end,
			defer = function(callback) table.insert(deferred, callback) end,
			delay = forbidden,
		},
	} })()
	local function drain(queue)
		while #queue > 0 do table.remove(queue, 1)() end
	end
	return {
		api = api, planner = planner, sent = sent, camera = camera,
		flush = function() drain(spawned); drain(deferred) end,
		respond = function(response, fails) nextResponse = response; networkFailure = fails == true end,
		loseVillage = function() ownsVillage = false end,
		prompt = prompt,
		setStatus = function(status) latest.status = status end,
		newPrompt = function()
			local added = instance("ProximityPrompt")
			added.Parent = detail
			api.hookPrompt(added)
			return added
		end,
	}
end

for _, width in { 320, 390 } do
	local ctx = context(width)
	ctx.api.configure(true, "war")
	ctx.api.build()
	ctx.flush()
	local warPanel = assert(ctx.api.state().panel)
	local practiceButton = assert(findText(warPanel, "Practice siege"), "War must render a Practice siege button")
	check(width .. " War practice button has a 44px target", practiceButton.Size.Y.Offset >= 44)
	warPanel:FindFirstChild("Body").CanvasPosition = { X = 0, Y = 180 }
	practiceButton.Activated:Fire()
	ctx.flush()
	local state = ctx.api.state()
	check(width .. " actual War callback opens and mounts practice", state.practice and ctx.planner.builds == 1 and findText(state.panel, "Mounted practice planner") ~= nil)
	check(width .. " practice has its own content identity", state.panel:GetAttribute("ContentView") == "practice")
	check(width .. " opening practice starts at its own top", ctx.planner.scroll.CanvasPosition.Y == 0)
	check(width .. " entry sends no battle or world request", #ctx.sent == 0 and state.inBattle == false)
	check(width .. " panel fits within phone margins", state.panel.Size.X.Offset == math.min(340, width - 16))

	local prior = state.panel
	ctx.planner.scroll.CanvasPosition = { X = 0, Y = 96 }
	ctx.api.heartbeat()
	ctx.flush()
	check(width .. " real heartbeat rebuilds idle practice", prior.Destroyed == true and ctx.planner.builds == 2)
	check(width .. " same-page rebuild restores scroll", ctx.planner.scroll.CanvasPosition.Y == 96)
	prior = ctx.api.state().panel
	ctx.planner.drawing = true
	ctx.api.heartbeat()
	ctx.planner.changed()
	ctx.flush()
	check(width .. " drawing survives heartbeat and invalidation", ctx.api.state().panel == prior and not prior.Destroyed and ctx.planner.builds == 2)
	ctx.planner.drawing = false
	ctx.planner.changed()
	ctx.flush()
	check(width .. " completed gesture can refresh the panel", prior.Destroyed == true and ctx.planner.builds == 3 and ctx.planner.scroll.CanvasPosition.Y == 96)

	local hides = ctx.planner.hides
	ctx.planner.back()
	ctx.flush()
	state = ctx.api.state()
	check(width .. " actual planner Back callback returns to War and hides", not state.practice and ctx.planner.hides == hides + 1 and findText(state.panel, "Practice siege") ~= nil)
	check(width .. " Back does not inherit practice scroll", state.panel:FindFirstChild("Body").CanvasPosition.Y == 0)
	assert(findText(state.panel, "Practice siege")).Activated:Fire()
	ctx.flush()
	hides = ctx.planner.hides
	assert(findText(ctx.api.state().panel, "War")).Activated:Fire()
	ctx.flush()
	state = ctx.api.state()
	check(width .. " tapping the active War tab exits its practice subpage", not state.practice and state.tab == "war" and ctx.planner.hides == hides + 1 and findText(state.panel, "Practice siege") ~= nil)
	assert(findText(state.panel, "Practice siege")).Activated:Fire()
	ctx.flush()
	hides = ctx.planner.hides
	assert(findText(ctx.api.state().panel, "Map")).Activated:Fire()
	ctx.flush()
	state = ctx.api.state()
	check(width .. " changing tabs hides practice and builds the selected page", not state.practice and state.tab == "map" and ctx.planner.hides == hides + 1 and findText(state.panel, "Map content") ~= nil)
	local builds = ctx.planner.builds
	prior = state.panel
	ctx.planner.changed()
	ctx.flush()
	check(width .. " hidden planner invalidation does not rebuild another tab", ctx.api.state().panel == prior and ctx.planner.builds == builds)
	assert(findText(state.panel, "War")).Activated:Fire()
	ctx.flush()
	assert(findText(ctx.api.state().panel, "Practice siege")).Activated:Fire()
	ctx.flush()
	hides = ctx.planner.hides
	prior = ctx.api.state().panel
	assert(findText(prior, "Step away from the table")).Activated:Fire()
	ctx.flush()
	state = ctx.api.state()
	check(width .. " leaving closes and hides the controller", not state.inTable and not state.practice and state.panel == nil and ctx.planner.hides == hides + 1 and prior.Destroyed == true)
	check(width .. " leaving restores the normal camera without battle view", ctx.camera.CameraType == "Custom" and state.inBattle == false)
	ctx.planner.changed()
	ctx.api.heartbeat()
	ctx.flush()
	check(width .. " hidden completion and heartbeat do not reopen the table", ctx.api.state().panel == nil)
end

local transport = context(390)
local routes, objectives = Config.defaults()
local request = { kind = "practiceSiege", version = Config.VERSION, defensePlan = Config.DEFENSE_PLAN, routes = routes, objectives = objectives }
for _, response in {
	{ ok = true, practiceSiege = { mode = "practice", reasons = { "The gate held." }, phaseEvents = {} } },
	{ ok = false, code = "INVALID_PRACTICE_SIEGE", message = "Vanguard must finish at the keep doors." },
} do
	transport.respond(response)
	local received, completions = nil, 0
	local before = #transport.sent
	transport.planner.submit(request, function(result) received = result; completions += 1 end)
	check("dedicated practice submit is scheduled asynchronously", #transport.sent == before and completions == 0)
	transport.flush()
	check("dedicated submit invokes QueueCommand exactly once", #transport.sent == before + 1 and transport.sent[#transport.sent] == request)
	check("dedicated submit preserves the practice command and version", request.kind == "practiceSiege" and request.version == 1 and request.routes == routes and request.objectives == objectives)
	check("accepted or rejected response reaches planner unchanged", completions == 1 and received == response)
end
transport.respond(nil, true)
local failure, finished = nil, 0
transport.planner.submit(request, function(result) failure = result; finished += 1 end)
transport.flush()
check("transport exceptions complete with saved-routes retry feedback", finished == 1 and failure.ok == false and failure.message == "The realm did not answer. Your routes are saved; try again.")
local retryResponse = { ok = true, practiceSiege = { mode = "practice", reasons = { "The gate fell." } } }
transport.respond(retryResponse)
transport.planner.submit(request, function(result) failure = result; finished += 1 end)
transport.flush()
check("dedicated transport remains usable after a failed request", #transport.sent == 4 and finished == 2 and failure == retryResponse)
check("practice transport never enters production battle state", transport.api.state().inBattle == false)

local lost = context(390)
lost.api.configure(true, "war")
lost.api.build()
assert(findText(lost.api.state().panel, "Practice siege")).Activated:Fire()
lost.flush()
local hides = lost.planner.hides
lost.loseVillage()
lost.api.heartbeat()
lost.flush()
check("lost village ownership closes the practice table", lost.api.state().panel == nil and not lost.api.state().practice and not lost.api.state().inTable and lost.planner.hides == hides + 1)

local prompts = context(390)
local tableInfo = { centerX = 0, centerZ = 0, boundsHalf = 200, villageId = "home" }
prompts.api.open(tableInfo)
check("opening the real table hides owner prompts", not prompts.prompt.Enabled and prompts.api.state().inTable)
local replacement = prompts.newPrompt()
check("private detail installed during table view starts with hidden prompts", not replacement.Enabled)
prompts.api.refreshPrompts()
check("online state refresh does not reveal prompts over table view", not prompts.prompt.Enabled and not replacement.Enabled)
prompts.api.leave()
check("leaving an online table restores owner prompts", prompts.prompt.Enabled and replacement.Enabled)
prompts.api.open(tableInfo)
prompts.setStatus("offline")
prompts.api.leave()
check("leaving while offline keeps owner prompts disabled", not prompts.prompt.Enabled and not replacement.Enabled)
prompts.setStatus("online")
prompts.api.refreshPrompts()
check("reconnecting outside table view restores owner prompts", prompts.prompt.Enabled and replacement.Enabled)
print(string.format("---- %d practice wiring checks, 0 failed (runtime stubs, not visual proof) ----", checks))
