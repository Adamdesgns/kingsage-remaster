--!strict
-- ============================================================================
-- SLICE-ONE EVIDENCE RUN — paste as a Script into ServerScriptService and F5.
--
-- ⚠️⚠️ NEVER run these checks from the Studio COMMAND BAR. The command bar
-- `require`s a SECOND, UNINITIALISED copy of every module (deps nil, handles
-- nil) and even workspace scans from it have printed confident false zeros
-- against a working game. Two Blockshore sessions were burned on that trap
-- (documented in blockshore/roblox/scripts/evidence-run.luau). This file
-- checks ONLY the shared DataModel, from inside a real running server.
-- ============================================================================
-- What this can prove automatically: the world was built, from real state,
-- with the right interaction surfaces. What it cannot prove: gameplay feel
-- and the wall-clock/restart/double-tap/sabotage drills — those are BY HAND,
-- listed at the end and in docs/superpowers/drills-slice-one.md.

task.wait(12) -- let a player join and the first state pull land

local pass, fail = 0, 0
local function check(name: string, ok: boolean, detail: string?)
	if ok then
		pass += 1
		print(string.format("[EVIDENCE] PASS  %s", name))
	else
		fail += 1
		warn(string.format("[EVIDENCE] FAIL  %s%s", name, detail and (" — " .. detail) or ""))
	end
end

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

-- remotes
local remotes = ReplicatedStorage:FindFirstChild("WorldRemotes")
check("WorldRemotes folder exists", remotes ~= nil)
if remotes then
	check("StateSync remote", remotes:FindFirstChild("StateSync") ~= nil)
	check("QueueCommand remote", remotes:FindFirstChild("QueueCommand") ~= nil)
	check("EnterTable remote", remotes:FindFirstChild("EnterTable") ~= nil)
	check("Toast remote", remotes:FindFirstChild("Toast") ~= nil)
end

-- settlements
local settlements = workspace:FindFirstChild("Settlements")
check("Settlements folder exists", settlements ~= nil)
local settlementCount = 0
if settlements then
	for _, model in settlements:GetChildren() do
		if model:IsA("Model") then
			settlementCount += 1
			local buildings = 0
			local prompts = 0
			local labelled = 0
			for _, child in model:GetChildren() do
				if child.Name:sub(1, 2) == "B_" then
					buildings += 1
					local structure = child:FindFirstChild("Structure")
					if structure and structure:FindFirstChild("InteractPrompt") then
						prompts += 1
					end
					if structure and structure:FindFirstChild("NameBillboard") then
						labelled += 1
					end
				end
			end
			check(model.Name .. ": 13 buildings rendered", buildings == 13, tostring(buildings))
			check(model.Name .. ": every building has a prompt", prompts == 13, tostring(prompts))
			check(model.Name .. ": every building labelled", labelled == 13, tostring(labelled))
			check(model.Name .. ": war table present", model:FindFirstChild("WarTable") ~= nil)
			check(model.Name .. ": gate spawn present", model:FindFirstChild("GateSpawn") ~= nil)
			check(model.Name .. ": walls present", model:FindFirstChild("WallN") ~= nil and model:FindFirstChild("WallS1") ~= nil)
			local villageId = model:GetAttribute("VillageId")
			check(model.Name .. ": bound to a real villageId", typeof(villageId) == "string" and #(villageId :: string) > 0)
			local barracks = model:FindFirstChild("B_barracks")
			local structure = barracks and (barracks :: Instance):FindFirstChild("Structure")
			check(model.Name .. ": barracks recruit prompt", structure ~= nil and (structure :: Instance):FindFirstChild("RecruitPrompt") ~= nil)
		end
	end
end
check("at least one settlement built (a player must be in-game)", settlementCount > 0)
check("one settlement per present player", settlementCount == #Players:GetPlayers(), string.format("%d settlements / %d players", settlementCount, #Players:GetPlayers()))

print(string.format("[EVIDENCE] ---- automated: %d PASS, %d FAIL ----", pass, fail))
print([[
[EVIDENCE] BY-HAND CHECKLIST (docs/superpowers/drills-slice-one.md has full steps):
  1. Walk-up: trigger the Timber Camp prompt -> toast "By your order.", queue row appears, wood drops on next sync.
  2. War table: prompt at the keep's foot -> overhead view + building panel; "Step away" or walking exits.
  3. Wall-clock drill: queue, Stop, wait 60s, F5 -> remaining time shrank by wall time.
  4. Restart drill: close play session entirely, rejoin -> identical kingdom, no duplicates.
  5. Double-tap drill: hammer one Upgrade 5x fast -> exactly ONE queue entry, one charge.
  6. Sabotage drill: stop the world server -> prompts grey, banner shows, orders refuse honestly;
     restart it -> everything trues up, nothing lost, nothing spent.
  7. Phone drill: private place, real phone -> join, walk, prompt, table, readable HUD.
]])
