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

-- Display geometry only. These helpers never calculate a siege outcome.
function PracticeSiege.layout(viewportWidth: number): { [string]: number }
	local panelWidth = math.max(1, math.min(340, math.floor(viewportWidth) - 16))
	local contentWidth = math.max(1, panelWidth - 12)
	return {
		panelWidth = panelWidth,
		contentWidth = contentWidth,
		squadButtonWidth = (contentWidth - 12) / 3,
		halfButtonWidth = (contentWidth - 6) / 2,
		canvasHeight = contentWidth,
		controlHeight = 44,
	}
end

local function segmentDistance(point: Point, first: Point, last: Point): number
	local dx, dy = last.x - first.x, last.y - first.y
	local length = dx * dx + dy * dy
	local along = if length == 0 then 0 else math.clamp(((point.x - first.x) * dx + (point.y - first.y) * dy) / length, 0, 1)
	return pointDistance(point, { x = first.x + along * dx, y = first.y + along * dy })
end

function PracticeSiege.simplifyRoute(points: Route, maximum: number, protectedPoint: Point?): Route
	local route: Route = {}
	for _, point in points do
		local previous = route[#route]
		if not previous or point.x ~= previous.x or point.y ~= previous.y then
			table.insert(route, copyPoint(point))
		end
	end
	while #route > math.max(3, maximum) do
		local removeIndex, smallest = 2, math.huge
		for index = 2, #route - 1 do
			local point = route[index]
			local protected = protectedPoint and point.x == protectedPoint.x and point.y == protectedPoint.y
			local errorSize = segmentDistance(point, route[index - 1], route[index + 1])
			if not protected and errorSize < smallest then
				removeIndex, smallest = index, errorSize
			end
		end
		table.remove(route, removeIndex)
	end
	return route
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
	item.Name = text
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
	layout.SortOrder = Enum.SortOrder.LayoutOrder
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
		visible = false,
		requestToken = 0,
		result = nil,
		revealedEvents = 0,
		replayToken = 0,
		canvas = nil,
		routeLayer = nil,
		drawing = false,
		activeInput = nil,
		moveConnection = nil,
		endConnection = nil,
		scroll = nil,
		statusLabel = nil,
		stroke = nil,
	}, Controller)
end

function Controller:_disconnectDrawing()
	self.drawing = false
	self.activeInput = nil
	if self.scroll and self.scroll.Parent then
		self.scroll.ScrollingEnabled = true
	end
	if self.moveConnection then
		self.moveConnection:Disconnect()
		self.moveConnection = nil
	end
	if self.endConnection then
		self.endConnection:Disconnect()
		self.endConnection = nil
	end
end

function Controller:isDrawing(): boolean
	return self.drawing
end

function Controller:hide()
	self:_disconnectDrawing()
	self.visible = false
	self.requestToken += 1
	self.replayToken += 1
	if self.busy then
		self.status = "Practice closed. Try this plan again when you return."
	end
	self.busy = false
	if self.result and typeof(self.result.phaseEvents) == "table" then
		self.revealedEvents = #self.result.phaseEvents
	end
	self.canvas, self.routeLayer, self.statusLabel, self.scroll = nil, nil, nil, nil
end

function Controller:_showStatus()
	if self.statusLabel and self.statusLabel.Parent then
		self.statusLabel.Text = self.status
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
	if not self.result then
		for _, objective in Config.OBJECTIVES do
			local structure = canvas:FindFirstChild(objective.id)
			if structure and structure:IsA("Frame") then
				structure.BackgroundColor3 = if objective.id == "keep" then Color3.fromRGB(178, 151, 96)
					elseif objective.id == "barricade" then Color3.fromRGB(105, 72, 45)
					else Color3.fromRGB(158, 148, 128)
			end
			local range = canvas:FindFirstChild(objective.id .. "Range")
			if range and range:IsA("Frame") then range.Visible = true end
		end
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
	if typeof(events) == "table" then
		for index = 1, math.min(self.revealedEvents, #events) do
			local event = events[index]
			if event.code == "objectiveWon" and typeof(event.feature) == "string" then
				local structure = canvas:FindFirstChild(event.feature)
				if structure and structure:IsA("Frame") then
					structure.BackgroundColor3 = Color3.fromRGB(103, 170, 113)
				end
				local range = canvas:FindFirstChild(event.feature .. "Range")
				if range and range:IsA("Frame") then
					range.Visible = false
				end
			end
		end
	end
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
	local stroke = self.stroke
	if not stroke then
		return
	end
	local previous = stroke[#stroke]
	point.y = math.clamp(math.max(point.y, previous.y), previous.y, Config.KEEP.y)
	if point.x == previous.x and point.y == previous.y then
		return
	end
	table.insert(stroke, copyPoint(point))
	local objective = assert(Config.objective(self.objectives[self.selectedSquad]))
	-- Keep the target vertex when smoothing a touch stroke to six route points.
	-- This prevents early movement samples from silently erasing the tower turn.
	self.stroke = PracticeSiege.simplifyRoute(stroke, 24, objective.position)
	self.routes[self.selectedSquad] = PracticeSiege.simplifyRoute(self.stroke, Config.MAX_ROUTE_POINTS - 1, objective.position)
	self.result = nil
	self.status = "Drawing " .. tostring(Config.squad(self.selectedSquad).label) .. " — lift to finish at the keep."
	self:_showStatus()
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
	self:_showStatus()
	self:_drawRoutes()
	self.refresh()
end

function Controller:_beginDrawing(input: InputObject)
	if self.busy or self.drawing or not self.visible then
		return
	end
	self:_disconnectDrawing()
	local squad = assert(Config.squad(self.selectedSquad))
	self.routes[self.selectedSquad] = { copyPoint(squad.start) }
	self.stroke = { copyPoint(squad.start) }
	self.result = nil
	self.replayToken += 1
	self.drawing = true
	self.activeInput = input
	if self.scroll then
		self.scroll.ScrollingEnabled = false
	end
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
	if typeof(result) ~= "table" or result.ok ~= true or typeof(result.practiceSiege) ~= "table"
		or typeof(result.practiceSiege.phaseEvents) ~= "table" then
		self.status = tostring((typeof(result) == "table" and result.message) or "The realm did not return practice results.")
		self.result = nil
		self.refresh()
		return
	end
	self.result = result.practiceSiege
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
			if self.replayToken ~= token or self.result == nil or not self.visible then
				return
			end
			self.revealedEvents = index
			self.refresh()
		end
		if self.replayToken == token then
			self:_finishReplayStatus()
			self.refresh()
		end
	end)
end

function Controller:_submit()
	if self.busy or self.drawing or not self.visible then
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
	self.requestToken += 1
	local requestToken = self.requestToken
	self.refresh()
	local function finished(result: any)
		if self.requestToken ~= requestToken or not self.visible or not self.busy then
			return
		end
		self:_acceptResult(result)
	end
	local ok = pcall(function()
		self.submit(request, finished)
	end)
	if not ok then
		finished({ ok = false, message = "The realm did not answer. Your routes are saved; try again." })
	end
	task.delay(30, function()
		finished({ ok = false, message = "The realm took too long. Your routes are saved; try again." })
	end)
end

function Controller:_finishReplayStatus()
	self.status = if self.result.outcome == "attackerWin"
		then "Practice fort taken. Training only — your city did not change. Use Previous reason to reread, or try without a gate team."
		else "The practice fort held. Training only — your city did not change. Use Previous reason to reread, then reset and compare."
end

function Controller:skipReplay()
	if self.drawing or not self.visible or typeof(self.result) ~= "table" or typeof(self.result.phaseEvents) ~= "table" then
		return
	end
	self.replayToken += 1
	self.revealedEvents = #self.result.phaseEvents
	self:_finishReplayStatus()
end

function Controller:stepReplay(delta: number)
	if self.drawing or not self.visible or typeof(self.result) ~= "table" or typeof(self.result.phaseEvents) ~= "table" then
		return
	end
	local events = self.result.phaseEvents
	self.replayToken += 1
	self.revealedEvents = math.clamp(self.revealedEvents + delta, 0, #events)
	if self.revealedEvents >= #events then
		self:_finishReplayStatus()
	elseif self.revealedEvents == 0 then
		self.status = "Reasons hidden. Use Show all reasons to review them."
	else
		self.status = "Reading reason " .. tostring(self.revealedEvents) .. " of " .. tostring(#events) .. "."
	end
end

function Controller:loadNoGateTeam()
	if self.busy or self.drawing then
		return
	end
	self:_disconnectDrawing()
	self.routes, self.objectives = Config.noGateTeamLesson()
	self.selectedSquad = Config.SQUADS[1].id
	self.status = "No squad is opening the gate. Everyone will be stopped at the wall. Try this plan, then reset and compare."
	self.busy = false
	self.result = nil
	self.revealedEvents = 0
	self.replayToken += 1
	self.requestToken += 1
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
	self.requestToken += 1
end

function Controller:build(parent: ScrollingFrame, onBack: () -> ())
	self:_disconnectDrawing()
	self.canvas = nil
	self.routeLayer = nil
	self.visible = true
	self.scroll = parent

	local root = Instance.new("Frame")
	root.Name = "PracticeSiege"
	root.Size = UDim2.new(1, -12, 0, 0)
	root.AutomaticSize = Enum.AutomaticSize.Y
	root.BackgroundTransparency = 1
	root.Parent = parent
	local rootLayout = Instance.new("UIListLayout")
	rootLayout.Padding = UDim.new(0, 7)
	rootLayout.SortOrder = Enum.SortOrder.LayoutOrder
	rootLayout.Parent = root

	label(root, "PRACTICE SIEGE", 17, true)
	label(root, "Practice army — your city troops are safe. No cost or reward. Pick a squad and draw through its target, then through the GATE to the keep. Up to 6 points; routes only move forward.", 14)
	label(root, Config.ENTRY_TEACHING, 14)
	label(root, "Saved defense: Guard the gate. Yellow circles are tower range. The brown block is a barricade. The realm decides each result.", 13)
	if not Config.hasGateTeam(self.objectives) then
		label(root, "No squad is opening the gate. Crossing the gate mark is not enough.", 14, true)
	end

	local lesson = button(root, "Try without a gate team", Color3.fromRGB(70, 48, 44), function()
		if self.busy or self.drawing then return end
		self:loadNoGateTeam()
		self.refresh()
	end)
	lesson.Name = "LoadNoGateTeam"

	local squadRow = row(root, 44)
	for index, squad in Config.SQUADS do
		local item = button(squadRow, squad.label, if squad.id == self.selectedSquad then colorFrom(squad.color) else Color3.fromRGB(48, 48, 58), function()
			if self.busy or self.drawing then return end
			self.selectedSquad = squad.id
			self.status = "Draw " .. squad.label .. " from its flag through " .. tostring(Config.objective(self.objectives[squad.id]).label) .. "."
			self.refresh()
		end)
		item.LayoutOrder = index
		item.Size = UDim2.new(1 / #Config.SQUADS, -4, 1, 0)
	end

	local selected = assert(Config.squad(self.selectedSquad))
	local chosen = assert(Config.objective(self.objectives[self.selectedSquad]))
	local target = button(root, "Target: " .. chosen.label .. "  ·  Tap to change", Color3.fromRGB(70, 58, 40), function()
		if self.busy or self.drawing then return end
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

	-- Flatten the rotated route segments inside one clipped board. Ordinary
	-- Frame clipping can let rotated children escape over the scrolling tabs.
	local canvas = Instance.new("CanvasGroup")
	canvas.Name = "RouteCanvas"
	canvas.Size = UDim2.new(1, 0, 0, math.max(1, parent.AbsoluteSize.X - 12))
	canvas.BackgroundColor3 = Color3.fromRGB(82, 102, 66)
	canvas.BorderSizePixel = 0
	canvas.ClipsDescendants = true
	canvas.Active = true
	canvas.Parent = root
	self.canvas = canvas
	local function resizeCanvas()
		if canvas.Parent and canvas.AbsoluteSize.X > 0 then
			canvas.Size = UDim2.new(1, 0, 0, canvas.AbsoluteSize.X)
		end
	end

	for towerId, tower in { westTower = Config.WEST_TOWER, eastTower = Config.EAST_TOWER } do
		local range = feature(canvas, towerId .. "Range", tower, Color3.fromRGB(220, 171, 71), 1, 1)
		range.Size = UDim2.fromScale(tower.range * 2 / Config.GRID_SIZE, tower.range * 2 / Config.GRID_SIZE)
		range.BackgroundTransparency = 0.76
		local round = Instance.new("UICorner")
		round.CornerRadius = UDim.new(1, 0)
		round.Parent = range
	end

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
		text.TextSize = 12
		text.Text = objective.short
		text.ZIndex = 3
		text.Parent = marker
	end
	for _, squad in Config.SQUADS do
		local flag = feature(canvas, squad.id .. "Flag", squad.start, colorFrom(squad.color), 22, 22)
		flag.ZIndex = 6
		local letter = Instance.new("TextLabel")
		letter.Size = UDim2.fromScale(1, 1)
		letter.BackgroundTransparency = 1
		letter.Text = squad.short
		letter.TextColor3 = Color3.new(1, 1, 1)
		letter.Font = Enum.Font.GothamBold
		letter.TextSize = 14
		letter.ZIndex = 6
		letter.Parent = flag
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
		resizeCanvas()
		self:_drawRoutes()
	end)
	canvas.InputBegan:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then
			self:_beginDrawing(input)
		end
	end)
	task.defer(function()
		if self.canvas == canvas then
			resizeCanvas()
			self:_drawRoutes()
		end
	end)

	local editRow = row(root, 44)
	local undo = button(editRow, "Undo turn", Color3.fromRGB(58, 58, 68), function()
		if self.busy or self.drawing then return end
		local route = self.routes[self.selectedSquad]
		if route and #route > 2 then
			table.remove(route, #route - 1)
			self.result = nil
			self.status = selected.label .. " lost its last turn."
			self.replayToken += 1
			self.refresh()
		end
	end)
	undo.Name = "UndoRoute"
	undo.LayoutOrder = 1
	undo.Size = UDim2.new(0.5, -3, 1, 0)
	local clear = button(editRow, "Clear route", Color3.fromRGB(70, 48, 44), function()
		if self.busy or self.drawing then return end
		self.routes[self.selectedSquad] = { copyPoint(selected.start), { x = Config.KEEP.x, y = Config.KEEP.y } }
		self.result = nil
		self.status = "Route cleared. Draw " .. selected.label .. " through " .. chosen.label .. "."
		self.replayToken += 1
		self.refresh()
	end)
	clear.Name = "ClearRoute"
	clear.LayoutOrder = 2
	clear.Size = UDim2.new(0.5, -3, 1, 0)

	local statusCard = card(root, Color3.fromRGB(29, 35, 43))
	local status = label(statusCard, self.status, 14, true)
	status.Name = "PracticeStatus"
	self.statusLabel = status

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
		label(outcome, "Training only. Your city troops and stock did not change.", 13)
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
			if #events > 0 then
				if self.revealedEvents < #events then
					label(root, "The assault is moving to the next stage…", 13)
				end
				local showPrevious = self.revealedEvents > 0
				local showSkip = self.revealedEvents < #events
				if showPrevious or showSkip then
					local review = row(root, 44)
					if showPrevious then
						local previous = button(review, "Previous reason", Color3.fromRGB(58, 58, 68), function()
							self:stepReplay(-1)
							self.refresh()
						end)
						previous.Name = "PreviousPracticeReason"
						previous.LayoutOrder = 1
						previous.Size = if showSkip then UDim2.new(0.5, -3, 1, 0) else UDim2.new(1, 0, 1, 0)
					end
					if showSkip then
						local skip = button(review, "Show all reasons", Color3.fromRGB(58, 58, 68), function()
							self:skipReplay()
							self.refresh()
						end)
						skip.Name = "SkipPracticeReplay"
						skip.LayoutOrder = 2
						skip.Size = if showPrevious then UDim2.new(0.5, -3, 1, 0) else UDim2.new(1, 0, 1, 0)
					end
				end
			end
		end
	end

	local bottom = row(root, 44)
	local reset = button(bottom, "Reset all routes", Color3.fromRGB(56, 56, 66), function()
		self:reset()
		self.refresh()
	end)
	reset.Name = "ResetPracticeSiege"
	reset.LayoutOrder = 1
	reset.Size = UDim2.new(0.5, -3, 1, 0)
	local back = button(bottom, "Back to War", Color3.fromRGB(65, 42, 35), onBack)
	back.Name = "BackToWar"
	back.LayoutOrder = 2
	back.Size = UDim2.new(0.5, -3, 1, 0)
end

return PracticeSiege
