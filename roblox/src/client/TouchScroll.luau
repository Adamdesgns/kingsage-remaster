--!strict
-- Finger-style and wheel scrolling for the war table Body. Studio device
-- emulation treats the viewport as a touch device, so native ScrollingFrame
-- mouse-wheel is ignored. Active TextButtons also eat the drag that would
-- have scrolled the list. This helper writes CanvasPosition itself, suppresses
-- the click after a drag, and stays out of a practice drawing stroke.
local UserInputService = game:GetService("UserInputService")

local TouchScroll = {}

TouchScroll.DRAG_THRESHOLD = 10
TouchScroll.WHEEL_STEP = 48

local consumed = false
local listening = false
local current: ScrollingFrame? = nil
local blockedName = "RouteCanvas"
local tracking = false
-- The InputObject that owns the current drag. A touch keeps one object from
-- Began through Ended, so a second finger (a different object) can neither
-- restart nor steer the list. Mouse drags own MouseButton1 and accept
-- MouseMovement, which Roblox delivers as a separate object.
local trackingInput: any = nil
local startY = 0
local startCanvasY = 0

local function axis(value: any, key: string): number
	if typeof(value) ~= "table" and typeof(value) ~= "Vector2" and typeof(value) ~= "Vector3" then
		return 0
	end
	return tonumber(value[key]) or 0
end

function TouchScroll.pointerOver(gui: any, x: number, y: number): boolean
	if typeof(gui) ~= "table" and typeof(gui) ~= "Instance" then
		return false
	end
	local left = axis(gui.AbsolutePosition, "X")
	local top = axis(gui.AbsolutePosition, "Y")
	local width = axis(gui.AbsoluteSize, "X")
	local height = axis(gui.AbsoluteSize, "Y")
	return x >= left and x <= left + width and y >= top and y <= top + height
end

function TouchScroll.maxOffset(scroll: any): number
	local canvasHeight = axis(scroll.AbsoluteCanvasSize, "Y")
	local windowHeight = axis(scroll.AbsoluteSize, "Y")
	return math.max(0, canvasHeight - windowHeight)
end

function TouchScroll.setOffset(scroll: any, y: number): number
	local clamped = math.clamp(y, 0, TouchScroll.maxOffset(scroll))
	scroll.CanvasPosition = Vector2.new(axis(scroll.CanvasPosition, "X"), clamped)
	return clamped
end

function TouchScroll.applyDrag(scroll: any, startCanvas: number, startPointer: number, currentPointer: number): number?
	if scroll.ScrollingEnabled == false then
		return nil
	end
	return TouchScroll.setOffset(scroll, startCanvas - (currentPointer - startPointer))
end

function TouchScroll.applyWheel(scroll: any, wheelZ: number): number?
	if scroll.ScrollingEnabled == false or wheelZ == 0 then
		return nil
	end
	local step = if wheelZ > 0 then -TouchScroll.WHEEL_STEP else TouchScroll.WHEEL_STEP
	return TouchScroll.setOffset(scroll, axis(scroll.CanvasPosition, "Y") + step)
end

local function findNamed(root: any, name: string): any?
	if typeof(root.FindFirstChild) == "function" then
		local ok, child = pcall(function()
			return root:FindFirstChild(name, true)
		end)
		if ok and child then
			return child
		end
	end
	if typeof(root.GetDescendants) == "function" then
		for _, child in root:GetDescendants() do
			if child.Name == name then
				return child
			end
		end
	end
	return nil
end

function TouchScroll.shouldBeginDrag(scroll: any, x: number, y: number, drawSurfaceName: string?): boolean
	if scroll.ScrollingEnabled == false then
		return false
	end
	if not TouchScroll.pointerOver(scroll, x, y) then
		return false
	end
	if TouchScroll.maxOffset(scroll) <= 0 then
		return false
	end
	if typeof(drawSurfaceName) == "string" then
		local surface = findNamed(scroll, drawSurfaceName)
		if surface and TouchScroll.pointerOver(surface, x, y) then
			return false
		end
	end
	return true
end

function TouchScroll.wasConsumed(): boolean
	return consumed
end

function TouchScroll.clearConsumed()
	consumed = false
end

function TouchScroll.consumeIfDragged(distance: number): boolean
	if distance >= TouchScroll.DRAG_THRESHOLD then
		consumed = true
		return true
	end
	return false
end

function TouchScroll.protect(callback: () -> ()): () -> ()
	return function()
		if consumed then
			return
		end
		callback()
	end
end

local function pointer(input: InputObject): (number, number, number)
	return axis(input.Position, "X"), axis(input.Position, "Y"), axis(input.Position, "Z")
end

-- InputObject.Position shares the GuiObject.AbsolutePosition space (the same
-- convention PracticeSiege's RouteCanvas hit-test relies on). GetMouseLocation
-- does NOT: it is raw screen pixels, so it must be corrected by the GUI inset
-- before it can be compared with AbsolutePosition. Only fall back to it when
-- the wheel event carries no pointer position at all.
local function wheelPointer(input: InputObject): (number, number)
	local x, y = pointer(input)
	if x ~= 0 or y ~= 0 then
		return x, y
	end
	local ok, location = pcall(function()
		return UserInputService:GetMouseLocation()
	end)
	if not ok or not location then
		return x, y
	end
	local insetX, insetY = 0, 0
	local insetOk, topLeftInset = pcall(function()
		return (game:GetService("GuiService") :: any):GetGuiInset()
	end)
	if insetOk and topLeftInset then
		insetX, insetY = axis(topLeftInset, "X"), axis(topLeftInset, "Y")
	end
	return axis(location, "X") - insetX, axis(location, "Y") - insetY
end

-- A change event steers the drag only when it belongs to the input that began
-- it: the identical touch object, or mouse movement for a mouse-button drag.
local function steersDrag(input: InputObject): boolean
	if not tracking or trackingInput == nil then
		return false
	end
	if input.UserInputType == Enum.UserInputType.Touch then
		return input == trackingInput
	end
	if input.UserInputType == Enum.UserInputType.MouseMovement then
		return trackingInput.UserInputType == Enum.UserInputType.MouseButton1
	end
	return false
end

local function endsDrag(input: InputObject): boolean
	if not tracking or trackingInput == nil then
		return false
	end
	if input.UserInputType == Enum.UserInputType.Touch then
		return input == trackingInput
	end
	if input.UserInputType == Enum.UserInputType.MouseButton1 then
		return trackingInput.UserInputType == Enum.UserInputType.MouseButton1
	end
	return false
end

local function listen()
	if listening then
		return
	end
	listening = true
	UserInputService.InputBegan:Connect(function(input)
		local scroll = current
		if not scroll then
			return
		end
		local kind = input.UserInputType
		if kind ~= Enum.UserInputType.Touch and kind ~= Enum.UserInputType.MouseButton1 then
			return
		end
		if tracking then
			-- A second finger during a list drag neither restarts the drag nor
			-- re-arms the buttons under it.
			return
		end
		consumed = false
		trackingInput = nil
		local x, y = pointer(input)
		if TouchScroll.shouldBeginDrag(scroll, x, y, blockedName) then
			tracking = true
			trackingInput = input
			startY = y
			startCanvasY = axis(scroll.CanvasPosition, "Y")
		end
	end)
	UserInputService.InputChanged:Connect(function(input)
		local scroll = current
		if not scroll then
			return
		end
		if input.UserInputType == Enum.UserInputType.MouseWheel then
			local x, y = wheelPointer(input)
			if TouchScroll.pointerOver(scroll, x, y) then
				TouchScroll.applyWheel(scroll, axis(input.Position, "Z"))
			end
			return
		end
		if not steersDrag(input) then
			return
		end
		if scroll.ScrollingEnabled == false then
			tracking = false
			trackingInput = nil
			return
		end
		local _, y = pointer(input)
		if TouchScroll.consumeIfDragged(math.abs(y - startY)) then
			TouchScroll.applyDrag(scroll, startCanvasY, startY, y)
		end
	end)
	UserInputService.InputEnded:Connect(function(input)
		if endsDrag(input) then
			tracking = false
			trackingInput = nil
		end
	end)
end

function TouchScroll.bind(scroll: ScrollingFrame, drawSurfaceName: string?)
	current = scroll
	blockedName = drawSurfaceName or "RouteCanvas"
	listen()
end

return TouchScroll
