--!strict
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

print("[World] server scripts loaded, status:", WorldSession.getStatus())
