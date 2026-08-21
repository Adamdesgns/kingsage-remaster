--!strict
-- The war table: a slab at the keep's foot. Standing at it lifts the player
-- into the overhead command view (client-side camera). The table is
-- convenience; the world is the game (spec §3).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local WorldSession = require(script.Parent:WaitForChild("WorldSession"))
local SettlementBuilder = require(script.Parent:WaitForChild("SettlementBuilder"))

local remotes = ReplicatedStorage:WaitForChild("WorldRemotes")
local enterTable = remotes:WaitForChild("EnterTable") :: RemoteEvent

local WarTable = {}

local function ensureTable(player: Player)
	local settlement = SettlementBuilder.getSettlement(player)
	if not settlement or settlement:FindFirstChild("WarTable") then
		return
	end
	local centerX = tonumber(settlement:GetAttribute("CenterX")) or 0
	local centerZ = tonumber(settlement:GetAttribute("CenterZ")) or 0

	local table_ = Instance.new("Part")
	table_.Name = "WarTable"
	table_.Size = Vector3.new(6, 3, 4)
	-- at the keep's foot, on the main street (keep sits near origin+Z=5)
	table_.CFrame = CFrame.new(centerX, 1.5, centerZ + 16)
	table_.Anchored = true
	table_.Color = Color3.fromRGB(70, 50, 30)
	table_.Material = Enum.Material.WoodPlanks
	table_.Parent = settlement

	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "TablePrompt"
	prompt.ActionText = "Rule your realm"
	prompt.ObjectText = "War Table"
	prompt.HoldDuration = 0.35
	prompt.MaxActivationDistance = 10
	prompt.RequiresLineOfSight = false
	prompt.Triggered:Connect(function(triggeringPlayer: Player)
		if triggeringPlayer == player then
			enterTable:FireClient(triggeringPlayer, {
				centerX = centerX,
				centerZ = centerZ,
				boundsHalf = tonumber(settlement:GetAttribute("BoundsHalf")) or 75,
			})
		end
	end)
	prompt.Parent = table_
end

WorldSession.StateChanged.Event:Connect(function(player: Player)
	ensureTable(player)
end)

return WarTable
