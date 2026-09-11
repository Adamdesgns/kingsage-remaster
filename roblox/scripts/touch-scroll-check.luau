--!strict
-- Deletion-sensitive checks for war-table / practice-planner touch scroll.
-- These prove the helper math and that the live client actually binds it.
-- They are not Studio device-emulator or physical-phone proof.
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local roblox = require("@lune/roblox")
local process = require("@lune/process")

local checks = 0
local function pass(name: string)
	checks += 1
	print("PASS  " .. name)
end

local function signal(): any
	local event = { listeners = {} }
	function event:Connect(callback)
		local connection = { Connected = true }
		function connection:Disconnect()
			self.Connected = false
		end
		table.insert(self.listeners, { connection = connection, callback = callback })
		return connection
	end
	function event:Fire(...)
		for _, listener in table.clone(self.listeners) do
			if listener.connection.Connected then
				listener.callback(...)
			end
		end
	end
	return event
end

local function descendantNamed(root: any, name: string): any?
	if root.Name == name then
		return root
	end
	for _, child in (root.children or {}) do
		local found = descendantNamed(child, name)
		if found then
			return found
		end
	end
	return nil
end

local enum = setmetatable({}, { __index = function(self, key)
	local values = setmetatable({}, { __index = function(_, item) return item end })
	rawset(self, key, values)
	return values
end })

local function gui(class: string, props: { [string]: any }?): any
	local object = {
		ClassName = class,
		Name = class,
		children = {},
		Parent = nil,
		ScrollingEnabled = true,
		CanvasPosition = roblox.Vector2.new(0, 0),
		AbsolutePosition = roblox.Vector2.new(0, 56),
		AbsoluteSize = roblox.Vector2.new(320, 220),
		AbsoluteCanvasSize = roblox.Vector2.new(320, 720),
	}
	if props then
		for key, value in props do
			object[key] = value
		end
	end
	function object:FindFirstChild(name)
		for _, child in self.children do
			if child.Name == name then
				return child
			end
		end
		return nil
	end
	function object:GetDescendants()
		local all = {}
		for _, child in self.children do
			table.insert(all, child)
			if child.GetDescendants then
				for _, nested in child:GetDescendants() do
					table.insert(all, nested)
				end
			end
		end
		return all
	end
	function object:IsA(name)
		return self.ClassName == name or name == "GuiObject"
	end
	return setmetatable(object, {
		__newindex = function(self, key, value)
			rawset(self, key, value)
			if key == "Parent" and value then
				table.insert(value.children, self)
			end
		end,
	})
end

local inputService = {
	InputBegan = signal(),
	InputChanged = signal(),
	InputEnded = signal(),
	GetMouseLocation = function()
		return roblox.Vector2.new(40, 120)
	end,
}

local TouchScroll = luau.load(fs.readFile("roblox/src/client/TouchScroll.luau"), {
	environment = {
		game = { GetService = function(_, name)
			assert(name == "UserInputService")
			return inputService
		end },
		Enum = enum,
		Vector2 = roblox.Vector2,
		math = math,
		typeof = typeof,
		pairs = pairs,
		ipairs = ipairs,
		assert = assert,
		error = error,
		pcall = pcall,
		tostring = tostring,
		tonumber = tonumber,
		select = select,
		type = type,
		print = print,
	},
})()

local scroll = gui("ScrollingFrame", { Name = "Body" })
local canvas = gui("CanvasGroup", {
	Name = "RouteCanvas",
	AbsolutePosition = roblox.Vector2.new(8, 180),
	AbsoluteSize = roblox.Vector2.new(300, 300),
})
canvas.Parent = scroll

assert(TouchScroll.pointerOver(scroll, 40, 80), "point inside the list must count as over")
assert(not TouchScroll.pointerOver(scroll, 400, 80), "point beside the list must not count as over")
pass("pointer hit-test uses AbsolutePosition and AbsoluteSize")

assert(TouchScroll.maxOffset(scroll) == 500, "overflow is canvas height minus the window")
scroll.AbsoluteCanvasSize = roblox.Vector2.new(320, 200)
assert(TouchScroll.maxOffset(scroll) == 0, "a short list has nothing to scroll")
scroll.AbsoluteCanvasSize = roblox.Vector2.new(320, 720)
pass("max offset is zero when content fits and positive when it overflows")

local dragged = TouchScroll.applyDrag(scroll, 80, 100, 140)
assert(dragged == 40 and scroll.CanvasPosition.Y == 40, "finger down pulls content down")
local pulled = TouchScroll.applyDrag(scroll, 80, 100, 40)
assert(pulled == 140 and scroll.CanvasPosition.Y == 140, "finger up reveals content below")
TouchScroll.applyDrag(scroll, 0, 100, 400)
assert(scroll.CanvasPosition.Y == 0, "drag cannot pass the top")
TouchScroll.applyDrag(scroll, 480, 100, 40)
assert(scroll.CanvasPosition.Y == 500, "drag cannot pass the bottom")
scroll.ScrollingEnabled = false
assert(TouchScroll.applyDrag(scroll, 80, 100, 40) == nil and scroll.CanvasPosition.Y == 500,
	"a locked panel must keep its place during a practice stroke")
scroll.ScrollingEnabled = true
pass("drag math matches finger direction and clamps to the canvas")

scroll.CanvasPosition = roblox.Vector2.new(0, 120)
assert(TouchScroll.applyWheel(scroll, 1) == 72, "wheel-up moves toward the top")
assert(TouchScroll.applyWheel(scroll, -1) == 120, "wheel-down reveals later rows")
scroll.ScrollingEnabled = false
assert(TouchScroll.applyWheel(scroll, -1) == nil and scroll.CanvasPosition.Y == 120,
	"wheel stays inert while drawing locks the panel")
scroll.ScrollingEnabled = true
pass("mouse-wheel still moves the same CanvasPosition the finger uses")

assert(TouchScroll.shouldBeginDrag(scroll, 40, 80, "RouteCanvas") == true)
assert(TouchScroll.shouldBeginDrag(scroll, 40, 200, "RouteCanvas") == false,
	"a stroke that starts on RouteCanvas belongs to drawing, not the list")
assert(TouchScroll.shouldBeginDrag(scroll, 400, 80, "RouteCanvas") == false)
scroll.ScrollingEnabled = false
assert(TouchScroll.shouldBeginDrag(scroll, 40, 80, "RouteCanvas") == false)
scroll.ScrollingEnabled = true
scroll.AbsoluteCanvasSize = roblox.Vector2.new(320, 200)
assert(TouchScroll.shouldBeginDrag(scroll, 40, 80, "RouteCanvas") == false,
	"a short list must not steal taps")
scroll.AbsoluteCanvasSize = roblox.Vector2.new(320, 720)
pass("drag start ignores the drawing board, a locked panel, and a short list")

local fired = 0
local guarded = TouchScroll.protect(function()
	fired += 1
end)
assert(TouchScroll.consumeIfDragged(4) == false)
guarded()
assert(fired == 1, "a tap under the drag threshold still activates")
assert(TouchScroll.consumeIfDragged(10) == true)
guarded()
assert(fired == 1, "a drag that moved the list must not fire the button under the finger")
TouchScroll.clearConsumed()
guarded()
assert(fired == 2, "the next gesture can tap again")
pass("button guards swallow only the click that became a scroll")

scroll.CanvasPosition = roblox.Vector2.new(0, 0)
TouchScroll.bind(scroll, "RouteCanvas")
inputService.InputBegan:Fire({
	UserInputType = enum.UserInputType.MouseButton1,
	Position = roblox.Vector3.new(40, 90, 0),
})
inputService.InputChanged:Fire({
	UserInputType = enum.UserInputType.MouseMovement,
	Position = roblox.Vector3.new(40, 40, 0),
})
assert(scroll.CanvasPosition.Y == 50, "a pointer drag that starts on the list moves it")
assert(TouchScroll.wasConsumed() == true)
inputService.InputEnded:Fire({
	UserInputType = enum.UserInputType.MouseButton1,
	Position = roblox.Vector3.new(40, 40, 0),
})
local clicks = 0
TouchScroll.protect(function()
	clicks += 1
end)()
assert(clicks == 0, "the bind session still blocks the release click")

inputService.InputBegan:Fire({
	UserInputType = enum.UserInputType.Touch,
	Position = roblox.Vector3.new(40, 200, 0),
})
inputService.InputChanged:Fire({
	UserInputType = enum.UserInputType.Touch,
	Position = roblox.Vector3.new(40, 120, 0),
})
assert(scroll.CanvasPosition.Y == 50, "a drag that starts on RouteCanvas must not scroll")
pass("bound input scrolls from a button-sized point and leaves the drawing board alone")

scroll.CanvasPosition = roblox.Vector2.new(0, 96)
inputService.InputChanged:Fire({
	UserInputType = enum.UserInputType.MouseWheel,
	Position = roblox.Vector3.new(0, 0, -1),
})
assert(scroll.CanvasPosition.Y == 144, "emulator wheel events still move the bound list")
pass("bound mouse-wheel reaches the list even when native ScrollingFrame wheel is dead")

local client = fs.readFile("roblox/src/client/init.client.luau")
local planner = fs.readFile("roblox/src/client/PracticeSiege.luau")
assert(string.find(client, 'local TouchScroll = require(script:WaitForChild("TouchScroll"))', 1, true),
	"the war table must require the shared scroll helper")
assert(string.find(client, "TouchScroll.bind(scroll, \"RouteCanvas\")", 1, true),
	"the table Body must bind drag and wheel")
assert(string.find(client, "TouchScroll.protect(onClick)", 1, true),
	"war-table action rows must not fire after a list drag")
assert(string.find(client, "TouchScroll.protect(action.onClick)", 1, true),
	"Scout/Attack rows must not fire after a list drag")
assert(string.find(client, "scroll.Active = true", 1, true),
	"the Body must stay able to receive input")
assert(string.find(client, "scroll.ScrollBarThickness = 10", 1, true),
	"the scrollbar must stay thick enough to see on a phone")
assert(string.find(planner, 'local TouchScroll = require(script.Parent:WaitForChild("TouchScroll"))', 1, true),
	"the planner must share the same click guard")
assert(string.find(planner, "TouchScroll.protect(activated)", 1, true),
	"planner buttons must not fire after a list drag")
pass("war table and planner both use the helper; deleting the bind fails this gate")

print(string.format("---- %d touch-scroll checks, 0 failed (runtime stubs, not Studio proof) ----", checks))
if checks < 8 then
	process.exit(1)
end
