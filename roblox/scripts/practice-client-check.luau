--!strict
-- Execute the real planner with UI/input/task doubles. These tests exercise
-- callbacks and route editing; they are not Roblox rendering or phone proof.
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local function signal(): any
	local event = { listeners = {} }
	function event:Connect(callback)
		local connection = { Connected = true }
		function connection:Disconnect() self.Connected = false end
		table.insert(self.listeners, { connection = connection, callback = callback })
		return connection
	end
	function event:Fire(...)
		for _, listener in table.clone(self.listeners) do
			if listener.connection.Connected then listener.callback(...) end
		end
	end
	return event
end

local function instance(class: string): any
	local props = { ClassName = class, Name = class, children = {}, signals = {},
		Activated = signal(), InputBegan = signal(), InputChanged = signal(), InputEnded = signal(),
		AbsoluteSize = roblox.Vector2.new(280, 286), AbsolutePosition = roblox.Vector2.new(0, 0),
		CanvasPosition = roblox.Vector2.new(0, 0), ScrollingEnabled = true }
	local object = {}
	function props:GetChildren() return table.clone(self.children) end
	function props:GetDescendants()
		local all = {}
		for _, child in self.children do
			table.insert(all, child)
			for _, nested in child:GetDescendants() do table.insert(all, nested) end
		end
		return all
	end
	function props:FindFirstChild(name)
		for _, child in self.children do if child.Name == name then return child end end
		return nil
	end
	function props:IsA(name) return self.ClassName == name or name == "GuiObject" end
	function props:GetPropertyChangedSignal(name)
		if not self.signals[name] then self.signals[name] = signal() end
		return self.signals[name]
	end
	function props:Destroy()
		for _, child in self:GetChildren() do child:Destroy() end
		self.Parent = nil
	end
	return setmetatable(object, {
		__index = props,
		__newindex = function(_, key, value)
			if key == "Parent" then
				if props.Parent then
					local index = table.find(props.Parent.children, object)
					if index then table.remove(props.Parent.children, index) end
				end
				if value then table.insert(value.children, object) end
			end
			props[key] = value
		end,
	})
end

local enum = setmetatable({}, { __index = function(self, key)
	local values = setmetatable({}, { __index = function(_, item) return item end })
	rawset(self, key, values)
	return values
end })
local scheduled = {}
local fakeTask = {}
function fakeTask.spawn(callback) table.insert(scheduled, coroutine.create(callback)) end
function fakeTask.defer(callback) fakeTask.spawn(callback) end
function fakeTask.wait() coroutine.yield() end
function fakeTask.delay(_, callback) fakeTask.spawn(callback) end
local function stepTasks()
	local pending = scheduled
	scheduled = {}
	for _, thread in pending do
		local ok, problem = coroutine.resume(thread)
		assert(ok, tostring(problem))
		if coroutine.status(thread) ~= "dead" then table.insert(scheduled, thread) end
	end
end
local function drainTasks()
	for _ = 1, 100 do if #scheduled == 0 then return end; stepTasks() end
	error("planner left an unbounded task")
end

local Config = luau.load(fs.readFile("roblox/src/shared/PracticeSiegeConfig.luau"))()
local inputService = { InputChanged = signal(), InputEnded = signal() }
local shared = { WaitForChild = function(_, name) return name end }
local storage = { WaitForChild = function() return shared end }
local planner = luau.load(fs.readFile("roblox/src/client/PracticeSiege.luau"), { environment = {
	game = { GetService = function(_, name)
		if name == "ReplicatedStorage" then return storage end
		if name == "UserInputService" then return inputService end
		error("unexpected planner service: " .. name)
	end },
	require = function(name) assert(name == "PracticeSiegeConfig"); return Config end,
	Instance = { new = instance }, Enum = enum, UDim = roblox.UDim, UDim2 = roblox.UDim2,
	Vector2 = roblox.Vector2, Color3 = roblox.Color3, task = fakeTask,
} })()

local scenarios = 0
local function pass(name) scenarios += 1; print("PASS  " .. name) end
local function find(root, name)
	for _, child in root:GetDescendants() do if child.Name == name then return child end end
	error("missing live control: " .. name)
end
local function text(root, fragment)
	for _, child in root:GetDescendants() do
		if typeof(child.Text) == "string" and string.find(child.Text, fragment, 1, true) then return child end
	end
	return nil
end
local function fingerprint(value) return serde.encode("json", value) end
local function newController()
	local sent, callbacks, refreshes = {}, {}, {}
	local controller = planner.new(function(request, callback)
		table.insert(sent, request); table.insert(callbacks, callback)
	end, function() table.insert(refreshes, true) end)
	return controller, sent, callbacks, refreshes
end
local function build(controller, width)
	local root = instance("ScrollingFrame")
	root.Parent = instance("Frame")
	root.AbsoluteSize = roblox.Vector2.new(width, 700)
	controller:build(root, function() controller:hide() end)
	return root
end
local function dimension(object, axis, fallback)
	if not object.Size then return fallback end
	local part = object.Size[axis]
	local parent = if object.Parent then dimension(object.Parent, axis, fallback) else fallback
	return part.Scale * parent + part.Offset
end

for _, width in { 320, 390 } do
	local controller = newController()
	local root = build(controller, width)
	local count = 0
	for _, child in root:GetDescendants() do
		if child.ClassName == "TextButton" then
			assert(dimension(child, "X", width) >= 44, child.Name .. " narrow at " .. width)
			assert(dimension(child, "Y", 700) >= 44, child.Name .. " short at " .. width)
			count += 1
		end
	end
	assert(count >= 9, "planner controls disappeared")
	assert(find(root, "RouteCanvas").ClipsDescendants)
	assert(find(root, "PracticeStatus").TextWrapped)
	controller:hide()
end
drainTasks()
pass("320/390 planner callbacks build with all action targets at least 44px")

do
	local controller = newController()
	local root = build(controller, 390)
	drainTasks()
	local canvas = find(root, "RouteCanvas")
	assert(canvas.ClassName == "CanvasGroup" and canvas.ClipsDescendants,
		"rotated routes need a composited board so scrolling clips them")
	local segments = {}
	for _, child in find(root, "Routes"):GetChildren() do
		if child.Name == "RouteSegment" then table.insert(segments, child) end
	end
	local expected, diagonal = 0, false
	for _, squad in Config.SQUADS do
		local route = controller.routes[squad.id]
		for index = 2, #route do
			expected += 1
			local segment = assert(segments[expected], "a route segment disappeared")
			local first = roblox.Vector2.new(route[index - 1].x / 100 * canvas.AbsoluteSize.X,
				(1 - route[index - 1].y / 100) * canvas.AbsoluteSize.Y)
			local last = roblox.Vector2.new(route[index].x / 100 * canvas.AbsoluteSize.X,
				(1 - route[index].y / 100) * canvas.AbsoluteSize.Y)
			local delta = last - first
			-- UDim pixel offsets store whole pixels, so allow only that rounding.
			assert(math.abs(segment.Size.X.Offset - delta.Magnitude) <= 1, "clipping fix changed the drawn route length")
			assert(math.abs(segment.Position.X.Offset - (first.X + last.X) / 2) <= 1
				and math.abs(segment.Position.Y.Offset - (first.Y + last.Y) / 2) <= 1, "clipping fix moved the drawn route")
			assert(math.abs(segment.Rotation - math.deg(math.atan2(delta.Y, delta.X))) < 0.001, "clipping fix changed the route direction")
			diagonal = diagonal or (math.abs(delta.X) > 0 and math.abs(delta.Y) > 0)
		end
	end
	assert(#segments == expected and diagonal, "the clipped board must retain all exact straight route segments")
	local function renderedNames(parent)
		local layout, children = nil, {}
		for _, child in parent:GetChildren() do
			if child.ClassName == "UIListLayout" then layout = child end
			if child.ClassName == "TextButton" then table.insert(children, child) end
		end
		assert(layout, "horizontal row has no layout")
		table.sort(children, function(left, right)
			if layout.SortOrder == enum.SortOrder.LayoutOrder and (left.LayoutOrder or 0) ~= (right.LayoutOrder or 0) then
				return (left.LayoutOrder or 0) < (right.LayoutOrder or 0)
			end
			return left.Name < right.Name
		end)
		local names = {}; for _, child in children do table.insert(names, child.Name) end
		return table.concat(names, ",")
	end
	assert(renderedNames(find(root, "Vanguard").Parent) == "Vanguard,Archers,Riders", "squads must read Vanguard, Archers, Riders")
	assert(renderedNames(find(root, "UndoRoute").Parent) == "UndoRoute,ClearRoute", "Undo must precede Clear")
	assert(renderedNames(find(root, "ResetPracticeSiege").Parent) == "ResetPracticeSiege,BackToWar", "Reset must precede Back")
	controller:hide()
end
drainTasks()
pass("composited board retains exact route segments; horizontal controls keep their intended order")

do
	local controller = newController()
	for _, squad in Config.SQUADS do
		controller.selectedSquad = squad.id
		local root = build(controller, 390)
		local canvas = find(root, "RouteCanvas")
		local points = Config.defaultRoute(squad.id, squad.defaultObjective)
		local touch = { UserInputType = enum.UserInputType.Touch }
		local function position(point)
			touch.Position = roblox.Vector2.new(point.x / 100 * canvas.AbsoluteSize.X,
				(1 - point.y / 100) * canvas.AbsoluteSize.Y)
		end
		position(points[1]); canvas.InputBegan:Fire(touch)
		assert(controller:isDrawing(), "touch did not start drawing")
		for index = 2, #points do position(points[index]); inputService.InputChanged:Fire(touch) end
		inputService.InputEnded:Fire(touch)
		assert(not controller:isDrawing(), "touch release left drawing active")
	end
	local request = controller:_request()
	assert(request.kind == "practiceSiege")
	request.kind = nil
	local valid, problem = Config.validateRequest(request)
	assert(valid, tostring(problem))
	for _, squad in Config.SQUADS do
		assert(#controller.routes[squad.id] <= 6)
		for _, point in controller.routes[squad.id] do assert(point.x % 1 == 0 and point.y % 1 == 0) end
	end
	controller:hide()
end
drainTasks()
pass("touch events draw three legal integer routes through assigned objectives")

do
	local controller, sent, _, refreshes = newController()
	local root = build(controller, 390)
	local canvas = find(root, "RouteCanvas")
	local touch = { UserInputType = enum.UserInputType.Touch, Position = roblox.Vector2.new(140, 272) }
	canvas.InputBegan:Fire(touch)
	assert(not root.ScrollingEnabled, "touch drawing competed with panel scrolling")
	local before = fingerprint({ controller.routes, controller.objectives, controller.selectedSquad })
	for _, child in root:GetDescendants() do
		if child.ClassName == "TextButton" and (child.Text == "Archers" or child.Name == "ObjectiveButton"
			or child.Name == "UndoRoute" or child.Name == "ClearRoute" or child.Name == "SubmitPracticeSiege") then
			child.Activated:Fire()
		end
	end
	assert(#sent == 0 and before == fingerprint({ controller.routes, controller.objectives, controller.selectedSquad }),
		"a second finger changed the active route/target/squad")
	local foreignTouch = { UserInputType = enum.UserInputType.Touch, Position = roblox.Vector2.new(20, 20) }
	inputService.InputChanged:Fire(foreignTouch); inputService.InputEnded:Fire(foreignTouch)
	assert(controller:isDrawing(), "another finger ended the stroke")
	local refreshedBeforeRelease = #refreshes
	inputService.InputEnded:Fire(touch)
	assert(root.ScrollingEnabled and #refreshes > refreshedBeforeRelease, "release did not restore scroll and refresh stale result cards")
	controller:hide()
end
drainTasks()
pass("second-finger controls cannot mutate an active stroke; release refreshes and restores scrolling")

do
	local controller = newController()
	controller.selectedSquad = "archers"
	local root = build(controller, 390)
	local canvas = find(root, "RouteCanvas")
	local function at(point, kind)
		return { UserInputType = kind, Position = roblox.Vector2.new(point.x / 100 * canvas.AbsoluteSize.X,
			(1 - point.y / 100) * canvas.AbsoluteSize.Y) }
	end
	canvas.InputBegan:Fire(at({ x = 10, y = 5 }, enum.UserInputType.MouseButton1))
	for y = 14, 34, 2 do
		inputService.InputChanged:Fire(at({ x = 28, y = y }, enum.UserInputType.MouseMovement))
	end
	for y = 36, 86, 2 do
		inputService.InputChanged:Fire(at({ x = 28 + (y - 34) * 22 / 54, y = y }, enum.UserInputType.MouseMovement))
	end
	inputService.InputEnded:Fire(at(Config.KEEP, enum.UserInputType.MouseButton1))
	local request = controller:_request(); request.kind = nil
	local valid, problem = Config.validateRequest(request)
	assert(valid, tostring(problem))
	assert(#controller.routes.archers <= 6)
	assert(table.find((function()
		local hits = {}; for _, point in controller.routes.archers do table.insert(hits, point.x == 28 and point.y == 34) end
		return hits
	end)(), true), "dense mouse samples erased the selected tower")
	controller:hide()
end
drainTasks()
pass("dense mouse stroke stays bounded and preserves its tower target")

do
	local controller, sent = newController()
	local root = build(controller, 390)
	local before = controller.objectives.vanguard
	find(root, "ObjectiveButton").Activated:Fire()
	assert(controller.objectives.vanguard ~= before, "target control did nothing")
	assert(#controller.routes.vanguard > 2)
	root = build(controller, 390)
	local count = #controller.routes.vanguard
	find(root, "UndoRoute").Activated:Fire()
	assert(#controller.routes.vanguard < count, "undo control did nothing")
	find(root, "ClearRoute").Activated:Fire()
	assert(controller.result == nil)
	controller.routes.vanguard[1].x = 10.5
	find(root, "SubmitPracticeSiege").Activated:Fire()
	assert(#sent == 0 and controller.busy == false, "invalid route reached the server")
	assert(string.find(controller.status, "route point 1", 1, true), controller.status)
	find(root, "ResetPracticeSiege").Activated:Fire()
	assert(controller.objectives.vanguard == before and controller.result == nil)
	assert(controller.routes.vanguard[1].x % 1 == 0)
	controller:hide()
end
drainTasks()
pass("target, undo, clear, invalid feedback and reset execute the real controls")

local function accepted(controller)
	local request = controller:_request(); request.kind = nil
	return { ok = true, practiceSiege = {
		mode = "practice", validated = request, outcome = "attackerWin",
		attackerCasualties = { vanguard = 3, archers = 2, riders = 1, total = 6 },
		phaseEvents = {
			{ phase = "approach", text = "FIRST tower fire", casualties = 3, position = { x = 28, y = 34 } },
			{ phase = "wall", text = "SECOND gate opened", casualties = 2 },
			{ phase = "courtyard", text = "THIRD barricade crossed", casualties = 1 },
			{ phase = "keep", text = "FOURTH keep doors fell", casualties = 0 },
		},
		reasons = { "FIRST tower fire", "SECOND gate opened", "THIRD barricade crossed", "FOURTH keep doors fell" },
	} }
end

do
	local controller, sent, callbacks = newController()
	local root = build(controller, 390)
	find(root, "SubmitPracticeSiege").Activated:Fire()
	find(root, "SubmitPracticeSiege").Activated:Fire()
	assert(#sent == 1 and controller.busy, "duplicate submit was not suppressed")
	local payload = sent[1]; assert(payload.kind == "practiceSiege" and payload.version == 1)
	callbacks[1]({ ok = false, message = "routes.archers: the gate is not a legal crossing" })
	assert(controller.status == "routes.archers: the gate is not a legal crossing")
	assert(not controller.busy and controller.result == nil)
	controller:_submit(); assert(#sent == 2, "retry did not send")
	callbacks[2](accepted(controller))
	assert(controller.result ~= nil and controller.revealedEvents == 0)
	local last = 0
	for _ = 1, 20 do
		stepTasks()
		assert(controller.revealedEvents >= last and controller.revealedEvents <= last + 1, "replay skipped/reordered events")
		last = controller.revealedEvents
		root = build(controller, 390)
		if last > 0 then assert(text(root, "FIRST tower fire"), "server reason not rendered") end
		if last < 4 then assert(not text(root, "FOURTH keep doors fell"), "future reason shown early") end
		if #scheduled == 0 then break end
	end
	assert(last == 4 and text(root, "FOURTH keep doors fell"), "replay never completed")
	assert(text(root, "FORT TAKEN"), "accepted outcome absent")
	controller:hide()
end
drainTasks()
pass("submit suppression, exact rejected copy, retry and ordered server phase reveal")

do
	for _, close in { "reset", "hide" } do
		local controller, _, callbacks = newController()
		build(controller, 390)
		controller:_submit()
		local reply = accepted(controller)
		controller[close](controller)
		local status = controller.status
		callbacks[1](reply)
		drainTasks()
		assert(controller.result == nil and not controller.busy and controller.status == status,
			close .. " allowed a late result to resurrect the replay")
	end
end
pass("reset and closing invalidate pending responses and replay work")

print("---- " .. scenarios .. " practice client scenarios passed (runtime stubs, not Studio or phone proof) ----")
