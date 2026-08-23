--!strict
local WorldStyle = require(script:WaitForChild("WorldStyle"))
WorldStyle.applyLighting()

local WorldSession = require(script:WaitForChild("WorldSession"))
local SettlementBuilder = require(script:WaitForChild("SettlementBuilder"))
require(script:WaitForChild("CommandService"))
require(script:WaitForChild("WarTable"))

WorldSession.StateChanged.Event:Connect(function(player: Player, snapshot: any)
	local identity = WorldSession.getIdentity(player)
	if identity then
		SettlementBuilder.onState(player, snapshot, identity.kingdomId)
	end
end)

-- While the realm is unreachable, every prompt greys out: commands are
-- blocked at the source, not just rejected later (spec §8).
WorldSession.StatusChanged.Event:Connect(function(status: string)
	local settlements = workspace:FindFirstChild("Settlements")
	if not settlements then
		return
	end
	local enabled = status == "online"
	for _, descendant in settlements:GetDescendants() do
		if descendant:IsA("ProximityPrompt") then
			descendant.Enabled = enabled
		end
	end
end)

print("[World] server scripts loaded, status:", WorldSession.getStatus())
