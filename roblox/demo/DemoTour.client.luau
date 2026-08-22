--!strict
-- SELF-DRIVING DEMO TOUR (demo.project.json only — never in the real place).
-- Walks the avatar through the settlement and triggers the REAL prompts and
-- REAL server commands, so a recording shows the actual game: founding, HUD,
-- toasts, queue timers, the war table camera, and now a full scouting run.
-- Loops until stopped.
--
-- The scouting leg exists because Adam is usually not at the PC: three slices
-- in a row have been blocked waiting for a human to tap something. This makes
-- ONE press of Play produce video of scouts leaving, the countdown ticking,
-- and the report card coming back — no keyboard needed.
--
-- It sends the scout through the SAME RemoteFunction the War tab's button
-- calls, because a script cannot fire another script's Button.Activated. That
-- means the command path and every view are real; only the finger is fake.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer

local remotes = ReplicatedStorage:WaitForChild("WorldRemotes")
local stateSync = remotes:WaitForChild("StateSync") :: RemoteEvent
local queueCommand = remotes:WaitForChild("QueueCommand") :: RemoteFunction

-- The tour keeps its own copy of the snapshot: the HUD script's copy is a
-- local in another script, and reaching into it would prove nothing.
local snapshot: any = nil
stateSync.OnClientEvent:Connect(function(payload: any)
	if payload and payload.snapshot then
		snapshot = payload.snapshot
	end
end)

local function setTab(tab: string)
	local gui = player:FindFirstChild("PlayerGui")
	local hud = gui and gui:FindFirstChild("WorldHud")
	if not hud then
		return
	end
	-- The attribute survives leaving the table, but the panel reopens on the
	-- Village tab — so re-setting the same value would fire no change signal
	-- and the tour would silently stop switching after the first loop.
	if hud:GetAttribute("DemoTab") == tab then
		hud:SetAttribute("DemoTab", nil)
		task.wait()
	end
	hud:SetAttribute("DemoTab", tab)
end

local function settlementModel(): Model?
	local settlements = workspace:FindFirstChild("Settlements")
	if not settlements then
		return nil
	end
	for _, model in settlements:GetChildren() do
		if model:IsA("Model") and model:GetAttribute("OwnerUserId") == player.UserId then
			return model
		end
	end
	return nil
end

local function humanoid(): Humanoid?
	local character = player.Character
	if not character then
		return nil
	end
	return character:FindFirstChildOfClass("Humanoid")
end

local function walkTo(model: Model, relX: number, relZ: number, timeout: number)
	local h = humanoid()
	if not h then
		return
	end
	local centerX = tonumber(model:GetAttribute("CenterX")) or 0
	local centerZ = tonumber(model:GetAttribute("CenterZ")) or 0
	h:MoveTo(Vector3.new(centerX + relX, 2, centerZ + relZ))
	local reached = false
	local connection = h.MoveToFinished:Connect(function()
		reached = true
	end)
	local waited = 0
	while not reached and waited < timeout do
		waited += task.wait(0.2)
	end
	connection:Disconnect()
end

local function findPrompt(model: Model, buildingName: string, promptName: string): ProximityPrompt?
	if buildingName == "WarTable" then
		local slab = model:FindFirstChild("WarTable")
		local prompt = slab and (slab :: Instance):FindFirstChild("TablePrompt")
		return if prompt and prompt:IsA("ProximityPrompt") then prompt else nil
	end
	local building = model:FindFirstChild(buildingName)
	local structure = building and (building :: Instance):FindFirstChild("Structure")
	local prompt = structure and (structure :: Instance):FindFirstChild(promptName)
	return if prompt and prompt:IsA("ProximityPrompt") then prompt else nil
end

local function holdPrompt(model: Model, buildingName: string, promptName: string)
	local prompt = findPrompt(model, buildingName, promptName)
	if prompt then
		prompt:InputHoldBegin()
		task.wait(prompt.HoldDuration + 0.3)
		prompt:InputHoldEnd()
	end
end

-- ---- scouting leg ----

local function myVillages(): { any }
	local mine: { any } = {}
	if not snapshot or not snapshot.kingdom or not snapshot.world then
		return mine
	end
	for _, village in snapshot.world.villages do
		if village.kingdomId == snapshot.kingdom.id then
			table.insert(mine, village)
		end
	end
	return mine
end

local function homeVillage(): any
	local mine = myVillages()
	for _, village in mine do
		if village.isCapital then
			return village
		end
	end
	return mine[1]
end

local function scoutMarchInFlight(): boolean
	for _, march in ((snapshot and snapshot.marches) or {}) do
		local status = tostring(march.status)
		if tostring(march.kind) == "scout" and (status == "outbound" or status == "returning") then
			return true
		end
	end
	return false
end

local function reportCount(): number
	local count = 0
	for _ in ((snapshot and snapshot.scoutReports) or {}) do
		count += 1
	end
	return count
end

-- Nearest foreign village, so the march is short enough to sit on camera.
local function nearestForeign(home: any): any
	if not snapshot or not snapshot.world or not home then
		return nil
	end
	local best, bestDistance = nil, math.huge
	for _, village in snapshot.world.villages do
		if village.kingdomId ~= snapshot.kingdom.id then
			local dx = (tonumber(village.x) or 0) - (tonumber(home.x) or 0)
			local dy = (tonumber(village.y) or 0) - (tonumber(home.y) or 0)
			local distance = dx * dx + dy * dy
			if distance < bestDistance then
				best, bestDistance = village, distance
			end
		end
	end
	return best
end

-- Returns true when a scout was actually dispatched.
local function sendScouts(): boolean
	local home = homeVillage()
	if not home or scoutMarchInFlight() then
		return false
	end
	local scouts = math.floor(tonumber(home.army and home.army.scout) or 0)
	if scouts < 1 then
		return false -- finite resource: never spend the last one on a loop
	end
	local target = nearestForeign(home)
	if not target then
		return false
	end
	local ok = pcall(function()
		queueCommand:InvokeServer({
			kind = "scout",
			villageId = tostring(home.id),
			targetVillageId = tostring(target.id),
			quantity = 1,
		})
	end)
	return ok
end

task.spawn(function()
	while true do
		local model = settlementModel()
		if not model or not humanoid() then
			task.wait(1)
			continue
		end

		task.wait(3) -- let the founding view breathe on camera
		-- up the main street from the gate
		walkTo(model, 0, 35, 8)
		-- west to the timber camp, order a REAL upgrade via its prompt
		walkTo(model, -27, 15, 10)
		holdPrompt(model, "B_timber", "InteractPrompt")
		task.wait(3) -- toast + queue row appear
		-- east to the barracks, REAL recruit order
		walkTo(model, 0, 15, 8)
		walkTo(model, 27, 15, 10)
		holdPrompt(model, "B_barracks", "RecruitPrompt")
		task.wait(3)
		-- to the war table: the camera lifts into the command view
		walkTo(model, 4, 20, 10)
		holdPrompt(model, "WarTable", "TablePrompt")
		task.wait(4) -- overhead view + Village panel on camera

		-- --- scouting on camera ---
		setTab("war")
		task.wait(4) -- targets list: neighbours, realms, distances, no levels
		local before = reportCount()
		if sendScouts() then
			-- "Scouts are away." toast, on-hand count drops, the march row and
			-- its countdown appear in BOTH the War tab and the HUD panel.
			task.wait(8)
			-- step away and wander while they travel, so the HUD countdown is
			-- what carries the wait — exactly what a player would see.
			walkTo(model, 0, 40, 8)
			walkTo(model, -20, 30, 8)
			local waited = 0
			while reportCount() <= before and waited < 90 do
				waited += task.wait(1)
			end
			-- back to the table for the payoff shot: the report card.
			walkTo(model, 4, 20, 10)
			holdPrompt(model, "WarTable", "TablePrompt")
			task.wait(1)
			setTab("war")
			task.wait(8)
		else
			task.wait(4)
		end

		-- walking exits the table view (the real exit path)
		walkTo(model, 0, 40, 8)
		task.wait(4)
	end
end)

print("[Demo] self-driving tour active (walk, build, recruit, war table, scout)")
