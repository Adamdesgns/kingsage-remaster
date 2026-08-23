--!strict
-- Styling is COSMETIC and must never be able to stop the game loading. It was
-- unguarded on 2026-08-23 and one unwritable property killed the whole server.
-- A world that looks wrong is a bug; a world that does not start is a dead game.
local styleOk, styleErr = pcall(function()
	require(script:WaitForChild("WorldStyle")).applyLighting()
end)
if not styleOk then
	warn(string.format("[World] lighting failed to apply (the game still runs): %s", tostring(styleErr)))
end

-- The commander outfit is visual-only too. Any future Roblox avatar change is
-- allowed to fail here without delaying remotes, settlement state, or spawn.
local characterStyleOk, characterStyleErr = pcall(function()
	require(script:WaitForChild("CharacterStyle")).start()
end)
if not characterStyleOk then
	warn(string.format("[World] commander costume failed to start (the game still runs): %s", tostring(characterStyleErr)))
end

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
