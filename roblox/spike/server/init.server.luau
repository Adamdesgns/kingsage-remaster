--!strict
-- 200-troop performance spike (spec §5). NO Humanoids, ever.
-- Two armies of 100 anchored six-part soldiers march, clash, swing, and fall.
-- All movement flows through ONE workspace:BulkMoveTo per Heartbeat.
-- The number that matters is the CLIENT frame rate on a mid-range phone
-- (see spike/client); the server meter here is context.
local RunService = game:GetService("RunService")

local SOLDIERS_PER_SIDE = 100
local WALK_SPEED = 6 -- studs/second
local ENGAGE_DISTANCE = 5
local SWING_PERIOD = 0.4
local CASUALTY_INTERVAL = 0.5 -- one death per side, once engaged
local FADE_SECONDS = 1.5

type Soldier = {
	model: Model,
	parts: { BasePart },
	offsets: { CFrame }, -- part offset from the soldier root CFrame
	root: CFrame,
	side: number, -- 1 marches +Z, 2 marches -Z
	alive: boolean,
	engaged: boolean,
	swingFlip: boolean,
}

-- Ground
local ground = Instance.new("Part")
ground.Name = "Ground"
ground.Size = Vector3.new(400, 2, 400)
ground.Position = Vector3.new(0, -1, 0)
ground.Anchored = true
ground.Color = Color3.fromRGB(90, 110, 70)
ground.Material = Enum.Material.Grass
ground.Parent = workspace

local soldiersFolder = Instance.new("Folder")
soldiersFolder.Name = "Soldiers"
soldiersFolder.Parent = workspace

local function makePart(size: Vector3, color: Color3, parent: Model): BasePart
	local part = Instance.new("Part")
	part.Size = size
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.Color = color
	part.Material = Enum.Material.SmoothPlastic
	part.Parent = parent
	return part
end

local soldiers: { Soldier } = {}

local function spawnSoldier(side: number, rank: number, file: number)
	local model = Instance.new("Model")
	model.Name = string.format("S%d_%d_%d", side, rank, file)
	local color = if side == 1 then Color3.fromRGB(160, 60, 60) else Color3.fromRGB(60, 90, 160)

	local torso = makePart(Vector3.new(1.6, 2, 0.9), color, model)
	local head = makePart(Vector3.new(1, 1, 1), Color3.fromRGB(200, 170, 140), model)
	local leftArm = makePart(Vector3.new(0.6, 1.8, 0.6), color, model)
	local rightArm = makePart(Vector3.new(0.6, 1.8, 0.6), color, model)
	local leftLeg = makePart(Vector3.new(0.7, 1.8, 0.7), Color3.fromRGB(70, 60, 50), model)
	local rightLeg = makePart(Vector3.new(0.7, 1.8, 0.7), Color3.fromRGB(70, 60, 50), model)

	local offsets = {
		CFrame.new(0, 2.8, 0), -- torso
		CFrame.new(0, 4.3, 0), -- head
		CFrame.new(-1.2, 2.9, 0), -- left arm
		CFrame.new(1.2, 2.9, 0), -- right arm
		CFrame.new(-0.45, 0.9, 0), -- left leg
		CFrame.new(0.45, 0.9, 0), -- right leg
	}

	-- Both sides share the same X band so the armies clash head-on; the whole
	-- point is measuring 200 troops IN CONTACT, not marching past each other.
	local zHalf = 60
	local x = (file - 5.5) * 4
	local z = if side == 1 then -zHalf - (rank - 1) * 4 else zHalf + (rank - 1) * 4
	local facing = if side == 1 then 0 else math.pi
	local root = CFrame.new(x, 0, z) * CFrame.Angles(0, facing, 0)

	model.Parent = soldiersFolder
	table.insert(soldiers, {
		model = model,
		parts = { torso, head, leftArm, rightArm, leftLeg, rightLeg },
		offsets = offsets,
		root = root,
		side = side,
		alive = true,
		engaged = false,
		swingFlip = false,
	})
end

for side = 1, 2 do
	local count = 0
	local rank = 1
	while count < SOLDIERS_PER_SIDE do
		for file = 1, 10 do
			count += 1
			if count > SOLDIERS_PER_SIDE then break end
			spawnSoldier(side, rank, file)
		end
		rank += 1
	end
end

-- Server-side frame meter board (context; phone client meter is the verdict)
local board = makePart(Vector3.new(24, 8, 1), Color3.fromRGB(30, 30, 30), Instance.new("Model"))
board.Parent.Name = "MeterBoard"
board.Parent.Parent = workspace
board.CFrame = CFrame.new(0, 12, 0)
local gui = Instance.new("SurfaceGui")
gui.Face = Enum.NormalId.Front
gui.CanvasSize = Vector2.new(800, 260)
gui.Parent = board
local label = Instance.new("TextLabel")
label.Size = UDim2.fromScale(1, 1)
label.BackgroundTransparency = 1
label.TextColor3 = Color3.new(1, 1, 1)
label.TextScaled = true
label.Font = Enum.Font.Code
label.Text = "warming up"
label.Parent = gui
local gui2 = gui:Clone()
gui2.Face = Enum.NormalId.Back
gui2.Parent = board
local backLabel = gui2:FindFirstChildOfClass("TextLabel") :: TextLabel

local frameTimes: { number } = {}
local swingClock = 0
local casualtyClock = 0
local engagementClock = 0
local meterClock = 0
local ENGAGEMENT_SCAN_INTERVAL = 0.2 -- the real game's squads think coarsely; don't let an O(n²) scan pollute the render measurement
local anyEngaged = false

local ENGAGE_DISTANCE_SQ = ENGAGE_DISTANCE * ENGAGE_DISTANCE

local function nearEnemy(me: Soldier): boolean
	-- squared distances (no sqrt) and early exit: the scan is sim bookkeeping
	-- and must not pollute the frame-time measurement.
	local myPos = me.root.Position
	for _, other in soldiers do
		if other.alive and other.side ~= me.side then
			local delta = other.root.Position - myPos
			if delta:Dot(delta) <= ENGAGE_DISTANCE_SQ then
				return true
			end
		end
	end
	return false
end

local function killOne(side: number)
	for _, soldier in soldiers do
		if soldier.alive and soldier.side == side and soldier.engaged then
			soldier.alive = false
			task.spawn(function()
				local fallen = soldier.root * CFrame.new(0, 0.5, 0) * CFrame.Angles(math.pi / 2, 0, 0)
				local parts, cframes = {}, {}
				for i, part in soldier.parts do
					table.insert(parts, part)
					table.insert(cframes, fallen * soldier.offsets[i])
				end
				workspace:BulkMoveTo(parts, cframes, Enum.BulkMoveMode.FireCFrameChanged)
				for step = 1, 10 do
					task.wait(FADE_SECONDS / 10)
					for _, part in soldier.parts do
						part.Transparency = step / 10
					end
				end
				soldier.model:Destroy()
			end)
			return
		end
	end
end

RunService.Heartbeat:Connect(function(dt)
	-- meter window
	table.insert(frameTimes, dt)
	if #frameTimes > 300 then
		table.remove(frameTimes, 1)
	end

	swingClock += dt
	local flipSwing = false
	if swingClock >= SWING_PERIOD then
		swingClock -= SWING_PERIOD
		flipSwing = true
	end

	-- engagement scan at 5 Hz, not per frame
	engagementClock += dt
	local rescan = engagementClock >= ENGAGEMENT_SCAN_INTERVAL
	if rescan then
		engagementClock -= ENGAGEMENT_SCAN_INTERVAL
	end

	-- advance + pose
	local parts: { BasePart } = {}
	local cframes: { CFrame } = {}
	local aliveCount = 0
	anyEngaged = false
	for _, soldier in soldiers do
		if not soldier.alive then
			continue
		end
		aliveCount += 1
		if rescan then
			soldier.engaged = nearEnemy(soldier)
		end
		if soldier.engaged then
			anyEngaged = true
			if flipSwing then
				soldier.swingFlip = not soldier.swingFlip
			end
		else
			local direction = if soldier.side == 1 then 1 else -1
			soldier.root = soldier.root + Vector3.new(0, 0, direction * WALK_SPEED * dt)
		end
		for i, part in soldier.parts do
			local offset = soldier.offsets[i]
			if soldier.engaged and i == 4 then -- right arm swings
				offset = offset * CFrame.Angles(soldier.swingFlip and -1.2 or 0.2, 0, 0)
			end
			table.insert(parts, part)
			table.insert(cframes, soldier.root * offset)
		end
	end
	workspace:BulkMoveTo(parts, cframes, Enum.BulkMoveMode.FireCFrameChanged)

	-- casualties
	if anyEngaged then
		casualtyClock += dt
		if casualtyClock >= CASUALTY_INTERVAL then
			casualtyClock -= CASUALTY_INTERVAL
			killOne(1)
			killOne(2)
		end
	end

	-- meter text at 4 Hz — the meter must not perturb the measurement
	meterClock += dt
	if meterClock >= 0.25 then
		meterClock -= 0.25
		local sum = 0
		local worst = 0
		for _, frame in frameTimes do
			sum += frame
			if frame > worst then
				worst = frame
			end
		end
		local average = sum / math.max(#frameTimes, 1)
		label.Text = string.format(
			"SERVER avg %.1f fps | worst %.0f ms | troops %d",
			1 / math.max(average, 0.0001),
			worst * 1000,
			aliveCount
		)
		backLabel.Text = label.Text
	end
end)

print(string.format("[Spike] %d soldiers spawned, no Humanoids", #soldiers))
