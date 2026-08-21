--!strict
-- SELF-DRIVING DEMO TOUR (demo.project.json only — never in the real place).
-- Walks the avatar through the settlement and triggers the REAL prompts and
-- REAL server commands, so a recording shows the actual game: founding, HUD,
-- toasts, queue timers, and the war table camera. Loops until stopped.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer

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
		task.wait(6) -- overhead view + panel on camera
		-- walking exits the table view (the real exit path)
		walkTo(model, 0, 40, 8)
		task.wait(4)
	end
end)

print("[Demo] self-driving tour active")
