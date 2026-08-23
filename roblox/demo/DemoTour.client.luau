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
local camera = workspace.CurrentCamera

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

local function setAttribute(name: string, value: string)
	local gui = player:FindFirstChild("PlayerGui")
	local hud = gui and gui:FindFirstChild("WorldHud")
	if not hud then
		return
	end
	if hud:GetAttribute(name) == value then
		hud:SetAttribute(name, nil)
		task.wait()
	end
	hud:SetAttribute(name, value)
end

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

-- Give every capture run two clean establishing shots before the avatar starts
-- walking.  The ordinary Roblox follow camera is intentionally conservative:
-- beside a wall it squeezes itself between the masonry and the character,
-- which made the rebuilt keep look like a flat stone texture in screenshots.
-- These are camera-only demo beats.  They do not move a building, spoof state,
-- or exist in the normal player-controlled place.
local followFieldOfView: number? = nil
local function showcaseCamera(
	model: Model,
	positionOffset: Vector3,
	lookOffset: Vector3,
	fieldOfView: number
)
	local centerX = tonumber(model:GetAttribute("CenterX")) or 0
	local centerZ = tonumber(model:GetAttribute("CenterZ")) or 0
	local center = Vector3.new(centerX, 0, centerZ)
	local target = center + lookOffset
	if followFieldOfView == nil then
		followFieldOfView = camera.FieldOfView
	end
	camera.CameraType = Enum.CameraType.Scriptable
	camera.FieldOfView = fieldOfView
	camera.CFrame = CFrame.lookAt(center + positionOffset, target)
	-- Scriptable cameras do not receive the default camera controller's focus
	-- updates. Point Focus at the architecture so Roblox keeps the hero subject,
	-- rather than the empty horizon, as the rendering priority for the shot.
	camera.Focus = CFrame.new(target)
end

local function restoreFollowCamera()
	local h = humanoid()
	camera.CameraType = Enum.CameraType.Custom
	if followFieldOfView ~= nil then
		camera.FieldOfView = followFieldOfView
		followFieldOfView = nil
	end
	if h then
		camera.CameraSubject = h
	end
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

local function walkToStructure(model: Model, buildingName: string, timeout: number)
	local building = model:FindFirstChild(buildingName)
	local structure = building and building:FindFirstChild("Structure")
	if not structure or not structure:IsA("Model") or not structure.PrimaryPart then
		warn(string.format("[Demo] no reachable Structure anchor for %s", buildingName))
		return
	end

	-- The interaction anchor is already placed just outside the real doorway.
	-- Deriving this destination from the built model keeps the tour aligned when
	-- the settlement layout changes instead of reviving stale grey-box coordinates.
	local centerX = tonumber(model:GetAttribute("CenterX")) or 0
	local centerZ = tonumber(model:GetAttribute("CenterZ")) or 0
	local anchor = structure.PrimaryPart.Position
	walkTo(model, anchor.X - centerX, anchor.Z - centerZ, timeout)
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

-- Which kingdoms are Freeholds — abandoned settlements, never a player seat.
local function freeholdKingdomIds(): { [string]: boolean }
	local ids: { [string]: boolean } = {}
	for _, kingdom in ((snapshot and snapshot.world and snapshot.world.kingdoms) or {}) do
		if tostring(kingdom.seatKind) == "freehold" then
			ids[tostring(kingdom.id)] = true
		end
	end
	return ids
end

-- The target the tour goes for.
--
-- **Freeholds first, and this is the whole point of the run.** Every player
-- capital carries an identical garrison behind an identical wall, so a starting
-- kingdom attacking a peer LOSES — proven live on 2026-08-22 at 875 attack
-- against 1,828 defence. A tour that picks the nearest foreign village picks a
-- fight it cannot win and records a defeat every single time.
--
-- Freeholds are the game's designed first rung, so the demo now walks the loop
-- a real new player walks. Nearest Freehold, so the march still fits on camera;
-- nearest anything only if the world somehow has none.
local function nearestForeign(home: any): any
	if not snapshot or not snapshot.world or not home then
		return nil
	end
	local freeholds = freeholdKingdomIds()
	local best, bestDistance = nil, math.huge
	local fallback, fallbackDistance = nil, math.huge
	for _, village in snapshot.world.villages do
		if village.kingdomId ~= snapshot.kingdom.id then
			local dx = (tonumber(village.x) or 0) - (tonumber(home.x) or 0)
			local dy = (tonumber(village.y) or 0) - (tonumber(home.y) or 0)
			local distance = dx * dx + dy * dy
			if freeholds[tostring(village.kingdomId)] then
				if distance < bestDistance then
					best, bestDistance = village, distance
				end
			elseif distance < fallbackDistance then
				fallback, fallbackDistance = village, distance
			end
		end
	end
	return best or fallback
end

-- One attack per play session, so a viewing run always produces a battle
-- without draining the garrison every loop.
local attackedThisSession = false

local function resolvedBattleCount(): number
	local count = 0
	for _, battle in ((snapshot and snapshot.battleSessions) or {}) do
		if battle.outcome then
			count += 1
		end
	end
	return count
end

local function scoutedTargetId(): string?
	for _, report in ((snapshot and snapshot.scoutReports) or {}) do
		return tostring(report.targetVillageId)
	end
	return nil
end

-- One attack per session, after the scout report lands: enough to carry the
-- whole chain on camera without emptying the village every loop.
local function sendAttack(): boolean
	local home = homeVillage()
	if not home or attackedThisSession then
		return false
	end
	for _, march in ((snapshot and snapshot.marches) or {}) do
		local status = tostring(march.status)
		if tostring(march.kind) == "attack" and status ~= "complete" then
			return false
		end
	end
	local targetId = scoutedTargetId()
	if not targetId then
		return false
	end
	attackedThisSession = true
	-- Ride with Noblemen whenever this village has any. A dev world seeded with
	-- KINGSAGE_DEV_SEED_NOBLES therefore walks the CONQUEST path on camera
	-- rather than the raid path — same command, the declaration is what differs.
	-- With no Noblemen on hand it stays an ordinary raid, so a plain dev world
	-- records exactly what it did before.
	local nobles = math.floor(tonumber(home.army and home.army.noble) or 0)
	local ok = pcall(function()
		queueCommand:InvokeServer({
			kind = "attack",
			villageId = tostring(home.id),
			targetVillageId = targetId,
			-- A deliberately non-default plan, so the recording proves the
			-- plan travels with the order rather than being ignored.
			plan = { entry = "West Ridge", troops = "Balanced Army", time = "Dawn", style = "Flanking Strike" },
			withNobles = nobles > 0,
		})
	end)
	if ok then
		print(string.format("[Demo] attack sent at %s (%s)", targetId,
			if nobles > 0 then string.format("CONQUEST — %d noblemen ride", nobles) else "raid"))
	end
	return ok
end

local function waitingMarch(): any
	for _, march in ((snapshot and snapshot.marches) or {}) do
		if tostring(march.status) == "awaiting_battle" and not march.battleId then
			return march
		end
	end
	return nil
end

local function openBattle(): any
	for _, battle in ((snapshot and snapshot.battleSessions) or {}) do
		if tostring(battle.status) == "open" then
			return battle
		end
	end
	return nil
end

local function invoke(request: { [string]: any }): boolean
	return (pcall(function()
		queueCommand:InvokeServer(request)
	end))
end

-- Attend the fight rather than letting the deadline settle it: open the
-- battle, take the field, give real squad orders (each one is worth a capped
-- +2% and is visible on the panel), then call the charge. This is the whole
-- of slice B on camera without a keyboard.
local function attendBattle()
	local march = waitingMarch()
	if not march then
		return
	end
	invoke({ kind = "battleOpen", marchId = tostring(march.id) })

	local waited = 0
	while not openBattle() and waited < 30 do
		waited += task.wait(1)
	end
	local battle = openBattle()
	if not battle then
		return
	end
	setAttribute("DemoBattle", "enter")
	task.wait(20) -- the armies form up, advance and close: time to actually LOOK

	-- Three orders, one per squad, spread across the field.
	local points = {
		{ squad = "vanguard", x = 2500, y = 3200 },
		{ squad = "riders", x = 3900, y = 2600 },
		{ squad = "archers", x = 1400, y = 2000 },
	}
	for _, order in points do
		invoke({
			kind = "battleOrder",
			battleId = tostring(battle.id),
			squad = order.squad,
			x = order.x,
			y = order.y,
			atMs = 1000 * math.floor(waited + 5),
		})
		task.wait(3)
	end

	task.wait(20)
	invoke({ kind = "battleResolve", battleId = tostring(battle.id) })
	task.wait(40) -- casualties fall, the loser routs — long enough to watch
	setAttribute("DemoBattle", "leave")
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

		-- Eight seconds at each angle is deliberate: it is long enough for a
		-- human or automated audit to capture a stable frame without racing the
		-- self-driving tour. Both cameras stay on the open centreline inside the
		-- gate. The first is a close elevated hero view down the gate-to-keep axis;
		-- it shows the working districts as a settlement instead of shrinking the
		-- whole place into a foggy map thumbnail.
		showcaseCamera(model, Vector3.new(0, 42, 154), Vector3.new(0, 12, 26), 58)
		task.wait(8)
		-- The second beat sits at player height on the unobstructed main road.
		-- Barracks and timber frame the edges while the keep remains the landmark;
		-- x=0 avoids facades, fences, planters and the gatehouse collision volume.
		showcaseCamera(model, Vector3.new(0, 7.2, 132), Vector3.new(0, 10.5, 24), 68)
		task.wait(8)
		restoreFollowCamera()
		task.wait(1)
		-- up the main street from the gate
		walkTo(model, 0, 35, 8)
		-- west to the timber camp's real street-facing interaction anchor,
		-- then order a REAL upgrade through its prompt.
		walkToStructure(model, "B_timber", 16)
		holdPrompt(model, "B_timber", "InteractPrompt")
		task.wait(3) -- toast + queue row appear
		-- east to the barracks, REAL recruit order
		walkTo(model, 0, 45, 14)
		walkToStructure(model, "B_barracks", 16)
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

			-- --- and then the attack it made possible ---
			local battlesBefore = resolvedBattleCount()
			if sendAttack() then
				-- "The army marches." + the attack countdown on the HUD.
				task.wait(8)
				walkTo(model, 0, 40, 8)
				walkTo(model, 20, 30, 8)
				-- Nobody attends: the world server fights it on its own and
				-- the toast that lands is the point of the whole slice.
				-- Wait for the army to reach the walls, then ATTEND rather than
				-- letting the deadline settle it — the point of slice B.
				local waited = 0
				while not waitingMarch() and resolvedBattleCount() <= battlesBefore and waited < 240 do
					waited += task.wait(2)
				end
				attendBattle()
				local settling = 0
				while resolvedBattleCount() <= battlesBefore and settling < 240 do
					settling += task.wait(2)
				end
				-- If that battle took the village, the celebration is firing
				-- right now. Stand still and let it play out on camera rather
				-- than walking off mid-firework; it clears itself after
				-- Config.CELEBRATION.DURATION.
				local celebrating = player:FindFirstChild("PlayerGui")
					and (player.PlayerGui :: any):FindFirstChild("ConquestCelebration")
				if celebrating then
					print("[Demo] a village changed hands — filming the celebration")
					task.wait(9)
				end
				walkTo(model, 4, 20, 10)
				holdPrompt(model, "WarTable", "TablePrompt")
				task.wait(1)
				setTab("war")
				task.wait(10) -- the battle report card
			end
		else
			task.wait(4)
		end

		-- walking exits the table view (the real exit path)
		walkTo(model, 0, 40, 8)
		task.wait(4)
	end
end)

print("[Demo] self-driving tour active (walk, build, recruit, war table, scout, attack, conquest)")
