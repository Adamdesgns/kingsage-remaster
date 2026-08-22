--!strict
-- The conquest spectacle (spec §5). A CLIENT module: every part it makes is
-- local, so a hundred fireworks cost the network nothing and no other player
-- inherits your celebration.
--
-- Three rules it must obey, and they are the whole design:
--   1. BIG        — it should be unmissable that a village just changed hands.
--   2. SKIPPABLE  — one tap clears it instantly, pool and all.
--   3. NON-BLOCKING — it never sinks input, never touches the camera, never
--      freezes the character, and never covers a ProximityPrompt. You can walk
--      into the village you just took while it is still going off.
--
-- Performance rules inherited from the 200-troop spike: no Humanoids, every
-- part anchored and CanCollide false, ONE workspace:BulkMoveTo per frame for
-- the entire show, and a hard part ceiling that stops spawning rather than
-- letting the frame rot. Nothing here decides anything — the world server
-- already settled the conquest before this module ever hears about it.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- WorldShared, not Shared. Rojo maps src/shared to ReplicatedStorage.WorldShared
-- (default.project.json), and WaitForChild with no timeout yields FOREVER on a
-- name that never appears — which would hang init.client's require of this
-- module and take the entire HUD down with it.
local worldShared = ReplicatedStorage:WaitForChild("WorldShared")
local Config = require(worldShared:WaitForChild("Config"))

local CFG = Config.CELEBRATION

local Celebration = {}

local player = Players.LocalPlayer

-- Bumped on every play() and every stop(). Any loop, delay or spawn from an
-- older generation checks this and returns, so a skip cannot leave a straggler
-- firework behind and two conquests in a row never fight each other.
local generation = 0
local folder: Folder? = nil
local gui: ScreenGui? = nil

type Mote = {
	part: BasePart,
	velocity: Vector3,
	dieAt: number,
	spin: Vector3,
}

local motes: { Mote } = {}

local GOLD = Color3.fromRGB(235, 190, 90)
local SPARK_COLORS = {
	Color3.fromRGB(255, 210, 110),
	Color3.fromRGB(255, 140, 90),
	Color3.fromRGB(150, 200, 255),
	Color3.fromRGB(255, 245, 220),
}

local function clearWorld()
	table.clear(motes)
	if folder then
		folder:Destroy()
		folder = nil
	end
end

local function clearGui()
	if gui then
		gui:Destroy()
		gui = nil
	end
end

-- Where the show happens: around the player, always. The conquered village can
-- be thousands of studs away — SettlementBuilder places villages from map
-- coordinates — so bursting it over the keep would mean the player's reward
-- for winning is an empty sky. The banner names the village instead.
local function origin(): Vector3
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return root.Position
	end
	local camera = workspace.CurrentCamera
	return if camera then camera.CFrame.Position else Vector3.zero
end

local function spawnPart(size: Vector3, color: Color3, position: Vector3, material: Enum.Material): BasePart?
	if #motes >= CFG.MAX_PARTS or not folder then
		return nil
	end
	local part = Instance.new("Part")
	part.Size = size
	part.Color = color
	part.Material = material
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.Position = position
	part.Parent = folder
	return part
end

local function addMote(part: BasePart, velocity: Vector3, life: number, spin: Vector3?)
	table.insert(motes, {
		part = part,
		velocity = velocity,
		dieAt = os.clock() + life,
		spin = spin or Vector3.zero,
	})
end

-- One shell: a rising ember that bursts into sparks at the top.
local function launchShell(myGeneration: number, base: Vector3)
	local angle = math.random() * math.pi * 2
	local spread = 26 + math.random() * 34
	local start = base + Vector3.new(math.cos(angle) * spread, 3, math.sin(angle) * spread)
	local shell = spawnPart(Vector3.new(0.8, 0.8, 0.8), GOLD, start, Enum.Material.Neon)
	if not shell then
		return
	end
	local rise = 42 + math.random() * 26
	addMote(shell, Vector3.new(0, rise, 0), 0.85)

	task.delay(0.8, function()
		if generation ~= myGeneration then
			return
		end
		local burstAt = shell.Position
		local color = SPARK_COLORS[math.random(1, #SPARK_COLORS)]
		for _ = 1, CFG.SPARKS_PER_SHELL do
			local spark = spawnPart(Vector3.new(0.5, 0.5, 0.5), color, burstAt, Enum.Material.Neon)
			if not spark then
				break
			end
			-- Even scatter on a sphere, so a burst never looks like a fan.
			local theta = math.random() * math.pi * 2
			local z = math.random() * 2 - 1
			local r = math.sqrt(math.max(0, 1 - z * z))
			local speed = 22 + math.random() * 16
			addMote(spark, Vector3.new(math.cos(theta) * r, z, math.sin(theta) * r) * speed, 1.2)
		end
	end)
end

-- The loot shower: coins tumbling down around the player, because a conquest
-- pays. Purely cosmetic — the real loot was settled on the world server.
local function showerCoins(base: Vector3)
	for _ = 1, CFG.COINS do
		local angle = math.random() * math.pi * 2
		local spread = math.random() * 22
		local at = base + Vector3.new(math.cos(angle) * spread, 26 + math.random() * 18, math.sin(angle) * spread)
		local coin = spawnPart(Vector3.new(1.6, 0.25, 1.6), GOLD, at, Enum.Material.Metal)
		if not coin then
			return
		end
		addMote(coin, Vector3.new(0, -(6 + math.random() * 6), 0), 2.6,
			Vector3.new(math.random() * 6 - 3, math.random() * 6 - 3, math.random() * 6 - 3))
	end
end

-- ONE BulkMoveTo per frame for the whole show, whatever it contains.
local function stepMotes(dt: number)
	local now = os.clock()
	local parts: { BasePart } = {}
	local frames: { CFrame } = {}
	local alive = 1
	for index = 1, #motes do
		local mote = motes[index]
		if now >= mote.dieAt or not mote.part.Parent then
			mote.part:Destroy()
		else
			-- Gravity, but gentler than the world's: sparks should hang long
			-- enough to read as a firework rather than fall like debris.
			mote.velocity += Vector3.new(0, -58 * dt, 0)
			local nextPosition = mote.part.Position + mote.velocity * dt
			local spun = if mote.spin ~= Vector3.zero
				then CFrame.Angles(mote.spin.X * dt, mote.spin.Y * dt, mote.spin.Z * dt)
				else CFrame.identity
			local rotation = mote.part.CFrame - mote.part.Position
			table.insert(parts, mote.part)
			table.insert(frames, CFrame.new(nextPosition) * rotation * spun)
			motes[alive] = mote
			alive += 1
		end
	end
	for index = #motes, alive, -1 do
		motes[index] = nil
	end
	if #parts > 0 then
		workspace:BulkMoveTo(parts, frames, Enum.BulkMoveMode.FireCFrameChanged)
	end
end

-- The banner. Nothing in this GUI is Active except the Skip button, so it
-- cannot swallow a tap meant for a ProximityPrompt underneath it.
local function buildBanner(villageName: string, onSkip: () -> ())
	local screen = Instance.new("ScreenGui")
	screen.Name = "ConquestCelebration"
	screen.ResetOnSpawn = false
	screen.IgnoreGuiInset = true
	screen.DisplayOrder = 50
	screen.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	screen.Parent = player:WaitForChild("PlayerGui")
	gui = screen

	local card = Instance.new("Frame")
	card.Name = "Card"
	card.Active = false
	card.Size = UDim2.new(0.72, 0, 0, 128)
	card.Position = UDim2.new(0.14, 0, 0.10, 0)
	card.BackgroundColor3 = Color3.fromRGB(18, 14, 10)
	card.BackgroundTransparency = 1
	card.BorderSizePixel = 0
	card.Parent = screen

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 10)
	corner.Parent = card

	local stroke = Instance.new("UIStroke")
	stroke.Color = GOLD
	stroke.Thickness = 2
	stroke.Transparency = 1
	stroke.Parent = card

	local headline = Instance.new("TextLabel")
	headline.Active = false
	headline.BackgroundTransparency = 1
	headline.Size = UDim2.new(1, -24, 0, 66)
	headline.Position = UDim2.new(0, 12, 0, 14)
	headline.Font = Enum.Font.GothamBlack
	headline.TextScaled = true
	headline.TextColor3 = GOLD
	headline.TextTransparency = 1
	headline.Text = string.format("%s is yours", villageName)
	headline.Parent = card

	local sub = Instance.new("TextLabel")
	sub.Active = false
	sub.BackgroundTransparency = 1
	sub.Size = UDim2.new(1, -24, 0, 26)
	sub.Position = UDim2.new(0, 12, 0, 84)
	sub.Font = Enum.Font.Gotham
	sub.TextScaled = true
	sub.TextColor3 = Color3.fromRGB(225, 215, 200)
	sub.TextTransparency = 1
	sub.Text = "Its walls answer to your banner. Walk in through the gate you took."
	sub.Parent = card

	local skip = Instance.new("TextButton")
	skip.Name = "Skip"
	skip.Size = UDim2.new(0, 92, 0, 32)
	skip.AnchorPoint = Vector2.new(1, 0)
	skip.Position = UDim2.new(1, -12, 0, 140)
	skip.BackgroundColor3 = Color3.fromRGB(40, 36, 30)
	skip.BackgroundTransparency = 0.25
	skip.TextColor3 = Color3.fromRGB(230, 225, 215)
	skip.Font = Enum.Font.GothamBold
	skip.TextSize = 15
	skip.Text = "Skip"
	skip.Parent = screen

	local skipCorner = Instance.new("UICorner")
	skipCorner.CornerRadius = UDim.new(0, 6)
	skipCorner.Parent = skip
	skip.Activated:Connect(onSkip)

	local info = TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	TweenService:Create(card, info, { BackgroundTransparency = 0.15 }):Play()
	TweenService:Create(stroke, info, { Transparency = 0 }):Play()
	TweenService:Create(headline, info, { TextTransparency = 0 }):Play()
	TweenService:Create(sub, info, { TextTransparency = 0.1 }):Play()
end

-- Clears the show immediately: banner, every live part, and any shell still
-- waiting to burst. Safe to call at any time, including twice.
function Celebration.stop()
	generation += 1
	clearWorld()
	clearGui()
end

-- True while a celebration is on screen. The demo tour waits on this so it can
-- film the whole thing instead of walking away mid-firework.
function Celebration.isPlaying(): boolean
	return gui ~= nil
end

-- Fires the spectacle for a village that just became yours.
function Celebration.play(villageName: string)
	Celebration.stop()
	generation += 1
	local myGeneration = generation

	local made = Instance.new("Folder")
	made.Name = "ConquestFX"
	made.Parent = workspace
	folder = made

	buildBanner(villageName, function()
		if generation == myGeneration then
			Celebration.stop()
		end
	end)

	showerCoins(origin())

	task.spawn(function()
		for _ = 1, CFG.SHELLS do
			if generation ~= myGeneration then
				return
			end
			launchShell(myGeneration, origin())
			task.wait(CFG.SHELL_INTERVAL)
		end
	end)

	task.spawn(function()
		local connection: RBXScriptConnection? = nil
		connection = RunService.RenderStepped:Connect(function(dt)
			if generation ~= myGeneration then
				if connection then
					connection:Disconnect()
				end
				return
			end
			stepMotes(dt)
		end)
	end)

	task.delay(CFG.DURATION, function()
		if generation == myGeneration then
			Celebration.stop()
		end
	end)
end

return Celebration
