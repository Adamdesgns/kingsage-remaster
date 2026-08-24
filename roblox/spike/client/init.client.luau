--!strict
-- SLICE 0 — THE PHONE MEASURE. This is the instrument, and its reading is the
-- ship/no-ship gate for every visual slice below it (design doc
-- 2026-08-23-battle-horses-living-city.md).
--
-- Why this place exists separately from the game: it speaks NO HTTP. The world
-- server lives on 127.0.0.1 and a published Roblox server cannot reach Adam's
-- PC, so the full game cannot be played on a phone until hosting lands
-- (roadmap 4.1). This place can — it needs nothing but Roblox.
--
-- Why it must not be a cheap imitation: it draws soldiers from the SAME shared
-- SoldierBuild the real battle uses, at the SAME BattleConfig.MAX_SOLDIERS
-- population, on the CLIENT like the real battle, with ONE BulkMoveTo per
-- frame. Every one of those is enforced by roblox/scripts/rules-check.luau. A
-- number measured on a cheaper army would be a number the real battle cannot
-- honour.
--
-- HOW TO READ IT: join on the phone, wait for the WARMING UP line to clear,
-- watch until the armies are in contact, then read the green/red line.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local worldShared = ReplicatedStorage:WaitForChild("WorldShared")
local BattleConfig = require(worldShared:WaitForChild("BattleConfig"))
local SoldierBuild = require(worldShared:WaitForChild("SoldierBuild"))

-- The measurement runs at the ceiling the game would like to draw. The real
-- scene culls adaptively toward TARGET_FPS; the spike deliberately does NOT,
-- because the question is "what can this phone hold", not "can the culler hide
-- it".
local TOTAL_SOLDIERS = BattleConfig.MAX_SOLDIERS
local PER_SIDE = math.floor(TOTAL_SOLDIERS / 2)
local TARGET_FPS = BattleConfig.TARGET_FPS

-- Deterministic march. No randomness anywhere: two runs on the same phone must
-- be comparable, or a PASS/FAIL is noise.
local WALK_SPEED = BattleConfig.WALK_SPEED
local ENGAGE_DISTANCE = BattleConfig.ENGAGE_DISTANCE
local ENGAGE_DISTANCE_SQ = ENGAGE_DISTANCE * ENGAGE_DISTANCE
local SWING_PERIOD = BattleConfig.SWING_PERIOD
local FALL_SECONDS = BattleConfig.FALL_SECONDS
local CASUALTY_INTERVAL = 0.5
-- Squads think coarsely; an O(n^2) scan every frame would measure the scan
-- rather than the render.
local ENGAGEMENT_SCAN_INTERVAL = 0.2
-- Parts, materials and shaders settle first; counting those frames would
-- libel the phone.
local WARMUP_SECONDS = 3

type Soldier = {
	body: SoldierBuild.Body,
	root: CFrame,
	side: number, -- 1 marches +Z, 2 marches -Z
	alive: boolean,
	engaged: boolean,
	swing: boolean,
	falling: number,
}

local player = Players.LocalPlayer
local folder = Instance.new("Folder")
folder.Name = "SpikeSoldiers"
folder.Parent = workspace

local soldiers: { Soldier } = {}

-- Mirror the real scene's squad structure so the MATERIAL MIX is honest: the
-- vanguard mail and ash spear, the archer fabric and bow stave, the rider
-- metal blade and leather all draw differently. A field of one squad would be
-- a different measurement from the army a player actually sees.
local SQUAD_IDS = {
	BattleConfig.SQUADS[1].id,
	BattleConfig.SQUADS[2].id,
	BattleConfig.SQUADS[3].id,
}

local function spawnSide(side: number)
	local color = if side == 1 then BattleConfig.ATTACKER_COLOR else BattleConfig.DEFENDER_COLOR
	local perRow = math.ceil(BattleConfig.FIELD_WIDTH / BattleConfig.FILE_SPACING)
	local facing = if side == 1 then 0 else math.pi
	local zStart = BattleConfig.FIELD_DEPTH / 2

	for index = 1, PER_SIDE do
		-- Even thirds across the three squads. Even is close to worst case:
		-- two of the three carry metal, and no mix is dramatically heavier.
		local squadId = SQUAD_IDS[((index - 1) % #SQUAD_IDS) + 1]
		local row = math.floor((index - 1) / perRow)
		local file = (index - 1) % perRow
		local x = (file - (perRow - 1) / 2) * BattleConfig.FILE_SPACING
		local depth = zStart + row * BattleConfig.RANK_SPACING
		local z = if side == 1 then -depth else depth

		local body = SoldierBuild.build(color, squadId, folder)
		table.insert(soldiers, {
			body = body,
			root = CFrame.new(x, 0, z) * CFrame.Angles(0, facing, 0),
			side = side,
			alive = true,
			engaged = false,
			swing = false,
			falling = 0,
		})
	end
end

spawnSide(1)
spawnSide(2)

local function nearEnemy(me: Soldier): boolean
	-- Squared distances, no sqrt, early exit. Bookkeeping must not pollute the
	-- frame time this place exists to report.
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
			soldier.falling = FALL_SECONDS
			return
		end
	end
end

-- ---- the meter: THIS is the number Slice 0 wants ----

local gui = Instance.new("ScreenGui")
gui.Name = "SpikeMeter"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Parent = player:WaitForChild("PlayerGui")

local function makeLabel(y: number, height: number): TextLabel
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 0, height)
	label.Position = UDim2.new(0, 0, 0, y)
	label.BackgroundTransparency = 0.25
	label.BackgroundColor3 = Color3.new(0, 0, 0)
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextScaled = true
	label.Font = Enum.Font.Code
	label.Text = ""
	label.Parent = gui
	return label
end

local headline = makeLabel(8, 54)
local detail = makeLabel(66, 40)
local verdict = makeLabel(110, 54)

local TOTAL_PARTS = TOTAL_SOLDIERS * SoldierBuild.PARTS_PER_SOLDIER
headline.Text = string.format("WARMING UP — %d soldiers, %d parts", TOTAL_SOLDIERS, TOTAL_PARTS)
detail.Text = "wait for the armies to meet, then read the green/red line"

-- Fixed vantage, so the phone draws a comparable amount of field every run.
local camera = workspace.CurrentCamera
task.defer(function()
	camera.CameraType = Enum.CameraType.Scriptable
	camera.CFrame = CFrame.lookAt(Vector3.new(78, 48, 0), Vector3.new(0, 5, 0))
end)

local frames: { number } = {}
local meterClock = 0
local swingClock = 0
local casualtyClock = 0
local engagementClock = 0
local elapsed = 0
local contacted = false

RunService.RenderStepped:Connect(function(dt)
	elapsed += dt
	local warm = elapsed >= WARMUP_SECONDS

	swingClock += dt
	local flipSwing = false
	if swingClock >= SWING_PERIOD then
		swingClock -= SWING_PERIOD
		flipSwing = true
	end

	engagementClock += dt
	local rescan = engagementClock >= ENGAGEMENT_SCAN_INTERVAL
	if rescan then
		engagementClock -= ENGAGEMENT_SCAN_INTERVAL
	end

	-- advance, pose, and collect EVERY part for one bulk move
	local parts: { BasePart } = {}
	local cframes: { CFrame } = {}
	local aliveCount = 0
	local anyEngaged = false
	local dead: { Soldier } = {}

	for _, soldier in soldiers do
		if soldier.alive then
			aliveCount += 1
			if rescan then
				soldier.engaged = nearEnemy(soldier)
			end
			if soldier.engaged then
				anyEngaged = true
				if flipSwing then
					soldier.swing = not soldier.swing
				end
			else
				local direction = if soldier.side == 1 then 1 else -1
				soldier.root = soldier.root + Vector3.new(0, 0, direction * WALK_SPEED * dt)
			end
			for index, part in soldier.body.parts do
				local offset = soldier.body.offsets[index]
				if soldier.engaged and index == 4 then -- the weapon part swings
					offset = offset * CFrame.Angles(if soldier.swing then -1.2 else 0.2, 0, 0)
				end
				table.insert(parts, part)
				table.insert(cframes, soldier.root * offset)
			end
		elseif soldier.falling > 0 then
			-- Falling bodies still cost frames, exactly as they do in the real
			-- scene. They stay in the measurement until they are gone.
			soldier.falling -= dt
			local progress = 1 - math.max(soldier.falling, 0) / FALL_SECONDS
			local fallen = soldier.root * CFrame.Angles(-math.pi / 2 * progress, 0, 0)
			for index, part in soldier.body.parts do
				part.Transparency = progress
				table.insert(parts, part)
				table.insert(cframes, fallen * soldier.body.offsets[index])
			end
			if soldier.falling <= 0 then
				table.insert(dead, soldier)
			end
		end
	end

	workspace:BulkMoveTo(parts, cframes, Enum.BulkMoveMode.FireCFrameChanged)

	for _, soldier in dead do
		SoldierBuild.destroy(soldier.body)
	end

	if anyEngaged then
		contacted = true
		casualtyClock += dt
		if casualtyClock >= CASUALTY_INTERVAL then
			casualtyClock -= CASUALTY_INTERVAL
			killOne(1)
			killOne(2)
		end
	end

	-- Sample only once warm, so streaming-in never libels the phone.
	if warm then
		table.insert(frames, dt)
		if #frames > 600 then
			table.remove(frames, 1)
		end
	end

	-- Format at 4 Hz: the meter must not perturb the measurement.
	meterClock += dt
	if meterClock < 0.25 then
		return
	end
	meterClock = 0

	if not warm or #frames < 30 then
		headline.Text = string.format(
			"WARMING UP — %d soldiers, %d parts",
			aliveCount,
			aliveCount * SoldierBuild.PARTS_PER_SOLDIER
		)
		return
	end

	local sum = 0
	for _, frame in frames do
		sum += frame
	end
	local sorted = table.clone(frames)
	table.sort(sorted)
	local average = sum / #frames
	local averageFps = 1 / math.max(average, 0.0001)
	local worstOnePercent = sorted[math.max(math.floor(#sorted * 0.99), 1)] or 0

	headline.Text = string.format("avg %.1f fps   worst-1%% %.0f ms", averageFps, worstOnePercent * 1000)
	detail.Text = string.format(
		"%d soldiers  %d parts  %s",
		aliveCount,
		aliveCount * SoldierBuild.PARTS_PER_SOLDIER,
		if contacted then "IN CONTACT" else "marching"
	)

	if not contacted then
		verdict.Text = "hold on — not in contact yet"
		verdict.TextColor3 = Color3.fromRGB(230, 210, 120)
		return
	end

	-- The verdict Slice 0 is actually asking for, phrased so it can be read
	-- aloud off a phone with no interpretation.
	if averageFps >= TARGET_FPS then
		verdict.Text = string.format("PASS — holds %d fps at %d soldiers", TARGET_FPS, TOTAL_SOLDIERS)
		verdict.TextColor3 = Color3.fromRGB(120, 230, 140)
	else
		local supported = math.floor(TOTAL_SOLDIERS * averageFps / TARGET_FPS)
		verdict.Text = string.format("FAIL — under %d fps; about %d soldiers is this budget", TARGET_FPS, supported)
		verdict.TextColor3 = Color3.fromRGB(240, 130, 120)
	end
end)

print(string.format("[Spike] %d soldiers built on the CLIENT, %d parts, no HTTP", #soldiers, TOTAL_PARTS))
