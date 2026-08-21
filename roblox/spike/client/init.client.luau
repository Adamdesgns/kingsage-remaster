--!strict
-- Client frame meter: THIS is the number the spike exists to produce,
-- read from a mid-range phone at full 200-troop contact (spec §5).
local RunService = game:GetService("RunService")
local Players = game:GetService("Players")

local player = Players.LocalPlayer
local gui = Instance.new("ScreenGui")
gui.Name = "SpikeMeter"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")

local label = Instance.new("TextLabel")
label.Size = UDim2.new(1, 0, 0, 44)
label.Position = UDim2.new(0, 0, 0, 8)
label.BackgroundTransparency = 0.3
label.BackgroundColor3 = Color3.new(0, 0, 0)
label.TextColor3 = Color3.new(1, 1, 1)
label.TextScaled = true
label.Font = Enum.Font.Code
label.Text = "warming up"
label.Parent = gui

-- Fixed battlefield vantage
local camera = workspace.CurrentCamera
task.defer(function()
	camera.CameraType = Enum.CameraType.Scriptable
	camera.CFrame = CFrame.lookAt(Vector3.new(70, 45, 0), Vector3.new(0, 5, 0))
end)

local frames: { number } = {}
RunService.RenderStepped:Connect(function(dt)
	table.insert(frames, dt)
	if #frames > 300 then
		table.remove(frames, 1)
	end
	local sum = 0
	local sorted = table.clone(frames)
	table.sort(sorted)
	for _, frame in frames do
		sum += frame
	end
	local average = sum / math.max(#frames, 1)
	local worstOnePercent = sorted[math.max(math.floor(#sorted * 0.99), 1)]
	label.Text = string.format(
		"CLIENT avg %.1f fps | worst-1%% %.0f ms  (record this on the phone)",
		1 / math.max(average, 0.0001),
		(worstOnePercent or 0) * 1000
	)
end)
