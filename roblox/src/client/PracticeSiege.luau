--!strict
-- Touch-first route planner for the stateless practice siege. This draws the
-- board and collects intent; only the external world server can validate and
-- resolve an attempt. It never calls or changes the production BattleScene.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local shared = ReplicatedStorage:WaitForChild("WorldShared")
local Config = require(shared:WaitForChild("PracticeSiegeConfig"))

local PracticeSiege = {}
local Controller = {}
Controller.__index = Controller

type Point = { x: number, y: number }
type Route = { Point }
type Submit = (request: { [string]: any }, finished: (result: any) -> ()) -> ()

local function copyPoint(point: Point): Point
	return { x = point.x, y = point.y }
end

local function copyRoutes(routes: any): { [string]: Route }
	local copied: { [string]: Route } = {}
	for _, squad in Config.SQUADS do
		copied[squad.id] = {}
		for _, point in ((routes and routes[squad.id]) or {}) do
			table.insert(copied[squad.id], copyPoint(point))
		end
	end
	return copied
end

local function copyObjectives(objectives: any): { [string]: string }
	local copied: { [string]: string } = {}
	for _, squad in Config.SQUADS do
		copied[squad.id] = tostring((objectives and objectives[squad.id]) or squad.defaultObjective)
	end
	return copied
end

local function colorFrom(triple: { number }): Color3
	return Color3.fromRGB(triple[1], triple[2], triple[3])
end

local function pointDistance(left: Point, right: Point): number
	local dx = left.x - right.x
	local dy = left.y - right.y
	return math.sqrt(dx * dx + dy * dy)
end

local function label(parent: Instance, text: string, size: number, bold: boolean?): TextLabel
	local item = Instance.new("TextLabel")
	item.Size = UDim2.new(1, 0, 0, 0)
	item.AutomaticSize = Enum.AutomaticSize.Y
	item.BackgroundTransparency = 1
	item.Font = if bold then Enum.Font.GothamBold else Enum.Font.Gotham
	item.TextColor3 = Color3.fromRGB(240, 235, 220)
	item.TextSize = size
	item.TextWrapped = true
	item.TextXAlignment = Enum.TextXAlignment.Left
	item.TextYAlignment = Enum.TextYAlignment.Top
	item.Text = text
	item.Parent = parent
	return item
end

local function button(parent: Instance, text: string, color: Color3, activated: () -> ()): TextButton
	local item = Instance.new("TextButton")
	item.Size = UDim2.new(1, 0, 0, 44)
	item.BackgroundColor3 = color
	item.TextColor3 = Color3.new(1, 1, 1)
	item.Font = Enum.Font.GothamBold
	item.TextSize = 14
	item.TextWrapped = true
	item.Text = text
	item.Parent = parent
	item.Activated:Connect(activated)
	return item
end

local function row(parent: Instance, height: number): Frame
	local item = Instance.new("Frame")
	item.Size = UDim2.new(1, 0, 0, height)
	item.BackgroundTransparency = 1
	item.Parent = parent
	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Horizontal
	layout.Padding = UDim.new(0, 6)
	layout.Parent = item
	return item
end

local function card(parent: Instance, color: Color3?): Frame
	local item = Instance.new("Frame")
	item.Size = UDim2.new(1, 0, 0, 0)
	item.AutomaticSize = Enum.AutomaticSize.Y
	item.BackgroundColor3 = color or Color3.fromRGB(34, 34, 44)
	item.BackgroundTransparency = 0.06
	item.Parent = parent
	local padding = Instance.new("UIPadding")
	padding.PaddingTop = UDim.new(0, 8)
	padding.PaddingBottom = UDim.new(0, 8)
	padding.PaddingLeft = UDim.new(0, 8)
	padding.PaddingRight = UDim.new(0, 8)
	padding.Parent = item
	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 5)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = item
	return item
end

local function boardPosition(point: Point): UDim2
	return UDim2.fromScale(point.x / Config.GRID_SIZE, 1 - point.y / Config.GRID_SIZE)
end

local function feature(parent: Instance, name: string, point: Point, color: Color3, width: number, height: number): Frame
	local item = Instance.new("Frame")
	item.Name = name
	item.AnchorPoint = Vector2.new(0.5, 0.5)
	item.Position = boardPosition(point)
	item.Size = UDim2.fromOffset(width, height)
	item.BackgroundColor3 = color
	item.BorderSizePixel = 0
	item.Parent = parent
	return item
end

local function routePointToPixels(canvas: GuiObject, point: Point): Vector2
	return Vector2.new(
		point.x / Config.GRID_SIZE * canvas.AbsoluteSize.X,
		(1 - point.y / Config.GRID_SIZE) * canvas.AbsoluteSize.Y
	)
end

local function line(parent: Instance, first: Vector2, second: Vector2, color: Color3, thickness: number)
	local delta = second - first
	local segment = Instance.new("Frame")
	segment.Name = "RouteSegment"
	segment.AnchorPoint = Vector2.new(0.5, 0.5)
	segment.Position = UDim2.fromOffset((first.X + second.X) / 2, (first.Y + second.Y) / 2)
	segment.Size = UDim2.fromOffset(math.max(delta.Magnitude, 1), thickness)
	segment.Rotation = math.deg(math.atan2(delta.Y, delta.X))
	segment.BackgroundColor3 = color
	segment.BorderSizePixel = 0
	segment.ZIndex = 4
	segment.Parent = parent
end

function PracticeSiege.new(submit: Submit, refresh: () -> ()): any
	local routes, objectives = Config.defaults()
	return setmetatable({
		submit = submit,
		refresh = refresh,
		routes = routes,
		objectives = objectives,
		selectedSquad = Config.SQUADS[1].id,
		status = "Choose a squad, then draw from its flag through its target to the keep.",
		busy = false,
		result = nil,
		revealedEvents = 0,
		replayToken = 0,
		canvas = nil,
		routeLayer = nil,
		drawing = false,
		activeInput = nil,
		moveConnection = nil,
		endConnection = nil,
	}, Controller)
end

function Controller:_disconnectDrawing()
	self.drawing = false
	self.activeInput = nil
	if self.moveConnection then
		self.moveConnection:Disconnect()
		self.moveConnection = nil
	end
	if self.endConnection then
		self.endConnection:Disconnect()
		self.endConnection = nil
	end
end

function Controller:_drawRoutes()
	local canvas = self.canvas
	local layer = self.routeLayer
	if not canvas or not layer or not canvas.Parent or not layer.Parent then
		return
	end
	for _, child in layer:GetChildren() do
		child:Destroy()
	end
	if canvas.AbsoluteSize.X < 1 or canvas.AbsoluteSize.Y < 1 then
		return
	end
	for _, squad in Config.SQUADS do
		local color = colorFrom(squad.color)
		local route = self.routes[squad.id] or {}
		for index = 2, #route do
			line(layer, routePointToPixels(canvas, route[index - 1]), routePointToPixels(canvas, route[index]), color, 5)
		end
		for index, point in route do
			local marker = feature(layer, squad.id .. "Point" .. index, point, color, if index == 1 then 16 else 12, if index == 1 then 16 else 12)
			marker.ZIndex = 5
			local corner = Instance.new("UICorner")
			corner.CornerRadius = UDim.new(1, 0)
			corner.Parent = marker
		end
	end
	local events = self.result and self.result.phaseEvents
	local current = typeof(events) == "table" and events[self.revealedEvents] or nil
	if current and typeof(current.position) == "table" then
		local marker = feature(layer, "ServerEvent", current.position, Color3.fromRGB(255, 244, 166), 24, 24)
		marker.ZIndex = 6
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(1, 0)
		corner.Parent = marker
	end
end

function Controller:_pointFromInput(input: InputObject): Point?
	local canvas = self.canvas
	if not canvas or canvas.AbsoluteSize.X < 1 or canvas.AbsoluteSize.Y < 1 then
		return nil
	end
	local localX = math.clamp(input.Position.X - canvas.AbsolutePosition.X, 0, canvas.AbsoluteSize.X)
	local localY = math.clamp(input.Position.Y - canvas.AbsolutePosition.Y, 0, canvas.AbsoluteSize.Y)
	return Config.snapPoint(
		localX / canvas.AbsoluteSize.X * Config.GRID_SIZE,
		(1 - localY / canvas.AbsoluteSize.Y) * Config.GRID_SIZE
	)
end

function Controller:_recordPoint(point: Point)
	local route = self.routes[self.selectedSquad]
	if not route then
		return
	end
	local previous = route[#route]
	point.y = math.clamp(math.max(point.y, previous.y), previous.y, Config.KEEP.y)
	if point.x == previous.x and point.y == previous.y then
		return
	end
	if #route == 1 then
		table.insert(route, point)
	else
		local anchor = route[math.max(1, #route - 1)]
		if #route < Config.MAX_ROUTE_POINTS - 1 and pointDistance(anchor, point) >= 14 then
			table.insert(route, point)
		else
			route[#route] = point
		end
	end
	self.result = nil
	self.status = "Drawing " .. tostring(Config.squad(self.selectedSquad).label) .. " — lift to finish at the keep."
	self:_drawRoutes()
end

function Controller:_finishRoute()
	local route = self.routes[self.selectedSquad]
	if not route then
		return
	end
	local keep = { x = Config.KEEP.x, y = Config.KEEP.y }
	local last = route[#route]
	if last.x ~= keep.x or last.y ~= keep.y then
		if #route < Config.MAX_ROUTE_POINTS then
			table.insert(route, keep)
		else
			route[#route] = keep
		end
	end
	self.status = tostring(Config.squad(self.selectedSquad).label) .. " route ends at the keep."
	self:_disconnectDrawing()
	self:_drawRoutes()
end

function Controller:_beginDrawing(input: InputObject)
	if self.busy then
		return
	end
	self:_disconnectDrawing()
	local squad = assert(Config.squad(self.selectedSquad))
	self.routes[self.selectedSquad] = { copyPoint(squad.start) }
	self.result = nil
	self.replayToken += 1
	self.drawing = true
	self.activeInput = input
	local first = self:_pointFromInput(input)
	if first and first.y > Config.DEPLOYMENT_MAX_Y then
		self:_recordPoint(first)
	end
	self.moveConnection = UserInputService.InputChanged:Connect(function(changed)
		if not self.drawing then
			return
		end
		if input.UserInputType == Enum.UserInputType.Touch then
			if changed ~= self.activeInput then
				return
			end
		elseif changed.UserInputType ~= Enum.UserInputType.MouseMovement then
			return
		end
		local point = self:_pointFromInput(changed)
		if point and point.y > Config.DEPLOYMENT_MAX_Y then
			self:_recordPoint(point)
		end
	end)
	self.endConnection = UserInputService.InputEnded:Connect(function(ended)
		local matches = if input.UserInputType == Enum.UserInputType.Touch
			then ended == self.activeInput
			else ended.UserInputType == Enum.UserInputType.MouseButton1
		if matches then
			local point = self:_pointFromInput(ended)
			if point and point.y > Config.DEPLOYMENT_MAX_Y then
				self:_recordPoint(point)
			end
			self:_finishRoute()
		end
	end)
end

function Controller:_request(): { [string]: any }
	return {
		kind = "practiceSiege",
		version = Config.VERSION,
		routes = copyRoutes(self.routes),
		objectives = copyObjectives(self.objectives),
		defensePlan = Config.DEFENSE_PLAN,
	}
end

function Controller:_acceptResult(result: any)
	self.busy = false
	if typeof(result) ~= "table" or result.ok ~= true or typeof(result.data) ~= "table" then
		self.status = tostring((typeof(result) == "table" and result.message) or "The realm did not return practice results.")
		self.result = nil
		self.refresh()
		return
	end
	self.result = result.data
	if typeof(self.result.validated) == "table" then
		self.routes = copyRoutes(self.result.validated.routes)
		self.objectives = copyObjectives(self.result.validated.objectives)
	end
	self.status = "The realm accepted the plan. Reading the assault in order…"
	self.revealedEvents = 0
	self.replayToken += 1
	local token = self.replayToken
	self.refresh()
	local events = self.result.phaseEvents
	if typeof(events) ~= "table" then
		return
	end
	task.spawn(function()
		for index = 1, #events do
			task.wait(if index == 1 then 0.2 else 0.55)
			if self.replayToken ~= token or self.result == nil then
				return
			end
			self.revealedEvents = index
			self.refresh()
		end
		if self.replayToken == token then
			self.status = if self.result.outcome == "attackerWin"
				then "Practice fort taken. Change a target or route and try again."
				else "The practice fort held. Read the reasons, adjust the plan, and retry."
			self.refresh()
		end
	end)
end

function Controller:_submit()
	if self.busy then
		return
	end
	local request = self:_request()
	local valid, problem = Config.validateRequest({
		version = request.version,
		routes = request.routes,
		objectives = request.objectives,
		defensePlan = request.defensePlan,
	})
	if not valid then
		self.status = problem or "Finish all three routes first."
		self.result = nil
		self.refresh()
		return
	end
	self.busy = true
	self.status = "The realm is checking this practice plan…"
	self.result = nil
	self.replayToken += 1
	self.refresh()
	self.submit(request, function(result)
		self:_acceptResult(result)
	end)
end

function Controller:reset()
	self:_disconnectDrawing()
	self.routes, self.objectives = Config.defaults()
	self.selectedSquad = Config.SQUADS[1].id
	self.status = "Routes reset. Choose a squad and draw another plan."
	self.busy = false
	self.result = nil
	self.revealedEvents = 0
	self.replayToken += 1
end

function Controller:build(parent: ScrollingFrame, onBack: () -> ())
	self:_disconnectDrawing()
	self.canvas = nil
	self.routeLayer = nil

	local root = Instance.new("Frame")
	root.Name = "PracticeSiege"
	root.Size = UDim2.new(1, -8, 0, 0)
	root.AutomaticSize = Enum.AutomaticSize.Y
	root.BackgroundTransparency = 1
	root.Parent = parent
	local rootLayout = Instance.new("UIListLayout")
	rootLayout.Padding = UDim.new(0, 7)
	rootLayout.SortOrder = Enum.SortOrder.LayoutOrder
	rootLayout.Parent = root

	label(root, "PRACTICE SIEGE", 17, true)
	label(root, "No troops, resources, rewards, or real settlements are used. Pick each squad, choose its target, and draw through that target to the keep.", 14)

	local squadRow = row(root, 44)
	for _, squad in Config.SQUADS do
		local item = button(squadRow, squad.label, if squad.id == self.selectedSquad then colorFrom(squad.color) else Color3.fromRGB(48, 48, 58), function()
			self.selectedSquad = squad.id
			self.status = "Draw " .. squad.label .. " from its flag through " .. tostring(Config.objective(self.objectives[squad.id]).label) .. "."
			self.refresh()
		end)
		item.Size = UDim2.new(1 / #Config.SQUADS, -4, 1, 0)
	end

	local selected = assert(Config.squad(self.selectedSquad))
	local chosen = assert(Config.objective(self.objectives[self.selectedSquad]))
	local target = button(root, "Target: " .. chosen.label .. "  ·  Tap to change", Color3.fromRGB(70, 58, 40), function()
		local index = Config.objectiveIndex(self.objectives[self.selectedSquad]) % #Config.OBJECTIVES + 1
		local nextObjective = Config.OBJECTIVES[index]
		self.objectives[self.selectedSquad] = nextObjective.id
		self.routes[self.selectedSquad] = Config.defaultRoute(self.selectedSquad, nextObjective.id)
		self.result = nil
		self.replayToken += 1
		self.status = selected.label .. " now aims for " .. nextObjective.label .. ". Its route was reset through that target."
		self.refresh()
	end)
	target.Name = "ObjectiveButton"

	local canvas = Instance.new("Frame")
	canvas.Name = "RouteCanvas"
	canvas.Size = UDim2.new(1, 0, 0, 286)
	canvas.BackgroundColor3 = Color3.fromRGB(82, 102, 66)
	canvas.BorderSizePixel = 0
	canvas.ClipsDescendants = true
	canvas.Active = true
	canvas.Parent = root
	self.canvas = canvas

	local wall = feature(canvas, "FrontWall", { x = 50, y = Config.FRONT_WALL_Y }, Color3.fromRGB(120, 113, 102), 300, 8)
	wall.Size = UDim2.new(1, -12, 0, 8)
	wall.ZIndex = 1
	local barricade = Instance.new("Frame")
	barricade.Name = "Barricade"
	barricade.Position = UDim2.fromScale(Config.BARRICADE.minimum.x / 100, 1 - Config.BARRICADE.maximum.y / 100)
	barricade.Size = UDim2.fromScale((Config.BARRICADE.maximum.x - Config.BARRICADE.minimum.x) / 100, (Config.BARRICADE.maximum.y - Config.BARRICADE.minimum.y) / 100)
	barricade.BackgroundColor3 = Color3.fromRGB(92, 66, 44)
	barricade.BorderSizePixel = 0
	barricade.ZIndex = 2
	barricade.Parent = canvas

	for _, objective in Config.OBJECTIVES do
		local featureColor = if objective.id == "keep" then Color3.fromRGB(178, 151, 96)
			elseif objective.id == "barricade" then Color3.fromRGB(105, 72, 45)
			else Color3.fromRGB(158, 148, 128)
		local marker = feature(canvas, objective.id, objective.position, featureColor, 42, 26)
		marker.ZIndex = 3
		local text = Instance.new("TextLabel")
		text.Size = UDim2.fromScale(1, 1)
		text.BackgroundTransparency = 1
		text.Font = Enum.Font.GothamBold
		text.TextColor3 = Color3.fromRGB(25, 24, 23)
		text.TextSize = 10
		text.Text = objective.short
		text.ZIndex = 3
		text.Parent = marker
	end

	local routeLayer = Instance.new("Frame")
	routeLayer.Name = "Routes"
	routeLayer.Size = UDim2.fromScale(1, 1)
	routeLayer.BackgroundTransparency = 1
	routeLayer.Active = false
	routeLayer.ZIndex = 4
	routeLayer.Parent = canvas
	self.routeLayer = routeLayer
	canvas:GetPropertyChangedSignal("AbsoluteSize"):Connect(function()
		self:_drawRoutes()
	end)
	canvas.InputBegan:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then
			self:_beginDrawing(input)
		end
	end)
	task.defer(function()
		self:_drawRoutes()
	end)

	local editRow = row(root, 44)
	local undo = button(editRow, "Undo turn", Color3.fromRGB(58, 58, 68), function()
		local route = self.routes[self.selectedSquad]
		if route and #route > 2 then
			table.remove(route, #route - 1)
			self.result = nil
			self.status = selected.label .. " lost its last turn."
			self:_drawRoutes()
		end
	end)
	undo.Name = "UndoRoute"
	undo.Size = UDim2.new(0.5, -3, 1, 0)
	local clear = button(editRow, "Clear route", Color3.fromRGB(70, 48, 44), function()
		self.routes[self.selectedSquad] = { copyPoint(selected.start), { x = Config.KEEP.x, y = Config.KEEP.y } }
		self.result = nil
		self.status = "Route cleared. Draw " .. selected.label .. " through " .. chosen.label .. "."
		self:_drawRoutes()
	end)
	clear.Name = "ClearRoute"
	clear.Size = UDim2.new(0.5, -3, 1, 0)

	local statusCard = card(root, Color3.fromRGB(29, 35, 43))
	local status = label(statusCard, self.status, 14, true)
	status.Name = "PracticeStatus"

	local submit = button(root, if self.busy then "Checking plan…" else "Try this plan", Color3.fromRGB(107, 73, 39), function()
		self:_submit()
	end)
	submit.Name = "SubmitPracticeSiege"
	submit.Active = not self.busy
	submit.AutoButtonColor = not self.busy

	if self.result then
		local outcome = card(root, if self.result.outcome == "attackerWin" then Color3.fromRGB(42, 76, 49) else Color3.fromRGB(85, 47, 43))
		local outcomeLabel = label(outcome, if self.result.outcome == "attackerWin" then "FORT TAKEN" else "FORT HELD", 17, true)
		outcomeLabel.Name = "PracticeOutcome"
		local casualties = self.result.attackerCasualties
		if typeof(casualties) == "table" then
			label(outcome, string.format(
				"Losses: Vanguard %d · Archers %d · Riders %d",
				math.floor(tonumber(casualties.vanguard) or 0),
				math.floor(tonumber(casualties.archers) or 0),
				math.floor(tonumber(casualties.riders) or 0)
			), 14)
		end
		local events = self.result.phaseEvents
		if typeof(events) == "table" then
			for index = 1, math.min(self.revealedEvents, #events) do
				local event = events[index]
				local eventCard = card(root)
				local phase = string.upper(tostring(event.phase or "stage"))
				local loss = math.floor(tonumber(event.casualties) or 0)
				label(eventCard, phase .. (if loss > 0 then "  ·  " .. loss .. " lost" else ""), 12, true)
				label(eventCard, tostring(event.text or "The realm returned no reason for this stage."), 14)
			end
			if self.revealedEvents < #events then
				label(root, "The assault is moving to the next stage…", 13)
			end
		end
	end

	local bottom = row(root, 44)
	local reset = button(bottom, "Reset all routes", Color3.fromRGB(56, 56, 66), function()
		self:reset()
		self.refresh()
	end)
	reset.Name = "ResetPracticeSiege"
	reset.Size = UDim2.new(0.5, -3, 1, 0)
	local back = button(bottom, "Back to War", Color3.fromRGB(65, 42, 35), onBack)
	back.Name = "BackToWar"
	back.Size = UDim2.new(0.5, -3, 1, 0)
end

return PracticeSiege
