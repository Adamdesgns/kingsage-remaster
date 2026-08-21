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
	local villageId = settlement:GetAttribute("VillageId")

	-- at the keep's foot, on the main street (keep sits near origin+Z=5)
	local slab = SettlementBuilder.greyPart("WarTable", Vector3.new(6, 3, 4),
		CFrame.new(centerX, 1.5, centerZ + 16), settlement, Color3.fromRGB(70, 50, 30))
	slab.Material = Enum.Material.WoodPlanks

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
				villageId = villageId,
			})
		end
	end)
	prompt.Parent = slab
end

WorldSession.StateChanged.Event:Connect(function(player: Player)
	-- Deferred so this never depends on BindableEvent handler ordering:
	-- SettlementBuilder's own StateChanged handler runs first regardless,
	-- and the settlement exists by the time we look for it.
	task.defer(ensureTable, player)
end)

return WarTable
