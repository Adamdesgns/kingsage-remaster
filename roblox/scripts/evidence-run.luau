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
local ServerStorage = game:GetService("ServerStorage")

-- remotes
local remotes = ReplicatedStorage:FindFirstChild("WorldRemotes")
check("WorldRemotes folder exists", remotes ~= nil)
if remotes then
	check("StateSync remote", remotes:FindFirstChild("StateSync") ~= nil)
	check("QueueCommand remote", remotes:FindFirstChild("QueueCommand") ~= nil)
	check("EnterTable remote", remotes:FindFirstChild("EnterTable") ~= nil)
	check("Toast remote", remotes:FindFirstChild("Toast") ~= nil)
end

-- settlements: Workspace contains ONLY fog-safe shells. Detailed sources live
-- in ServerStorage and are cloned only into their owner's private PlayerGui.
local settlements = workspace:FindFirstChild("Settlements")
check("Settlements folder exists", settlements ~= nil)
local detailSources = ServerStorage:FindFirstChild("SettlementDetails")
check("server-only SettlementDetails folder exists", detailSources ~= nil)
local fullCount, shellCount, warTableCount, spawnCount = 0, 0, 0, 0
local fullByOwner: { [number]: number } = {}
local shellByVillage: { [string]: Model } = {}
local detailByVillage: { [string]: Model } = {}
local seenLayers: { [string]: boolean } = {}
local settlementModels: { Instance } = {}
if settlements then
	for _, child in settlements:GetChildren() do table.insert(settlementModels, child) end
end
if detailSources then
	for _, child in detailSources:GetChildren() do table.insert(settlementModels, child) end
end
for _, model in settlementModels do
		if model:IsA("Model") then
			local villageId = model:GetAttribute("VillageId")
			check(model.Name .. ": bound to a real villageId", typeof(villageId) == "string" and #(villageId :: string) > 0)
			local layer = model:GetAttribute("VisibilityLayer")
			check(model.Name .. ": declares a visibility layer", layer == "Shell" or layer == "OwnerDetail", tostring(layer))
			if typeof(villageId) == "string" then
				local layerKey = villageId .. ":" .. tostring(layer)
				check(model.Name .. ": village layer renders once", seenLayers[layerKey] ~= true, layerKey)
				seenLayers[layerKey] = true
				if layer == "Shell" then shellByVillage[villageId] = model end
				if layer == "OwnerDetail" then detailByVillage[villageId] = model end
			end
			check(model.Name .. ": walls present", model:FindFirstChild("WallN") ~= nil and model:FindFirstChild("WallS1") ~= nil)

			local squareTowers, archSegments, legacyCaps = 0, 0, 0
			local gateTowers: { BasePart } = {}
			for _, child in model:GetChildren() do
				if child:IsA("BasePart") and child.Name == "SquareTower" then squareTowers += 1 end
				if child:IsA("BasePart") and child.Name == "GateTower" then table.insert(gateTowers, child) end
				if child:IsA("BasePart") and child.Name == "GateArchSegment" then
					archSegments += 1
					check(model.Name .. ": arch segment is visual, not a hidden blocker", not child.CanCollide)
				end
				if child.Name == "TowerCap" or child.Name == "GateTowerCap" then legacyCaps += 1 end
			end
			check(model.Name .. ": four square corner towers", squareTowers == 4, tostring(squareTowers))
			check(model.Name .. ": segmented gate arch", archSegments == 7, tostring(archSegments))
			check(model.Name .. ": no spherical or slab tower caps", legacyCaps == 0, tostring(legacyCaps))
			if #gateTowers == 2 then
				table.sort(gateTowers, function(a: BasePart, b: BasePart): boolean return a.Position.X < b.Position.X end)
				local opening = gateTowers[2].Position.X - gateTowers[1].Position.X
					- (gateTowers[1].Size.X + gateTowers[2].Size.X) / 2
				check(model.Name .. ": gate keeps the 22-stud opening clear", opening >= 21.9, string.format("%.2f", opening))
			else
				check(model.Name .. ": two gate towers", false, tostring(#gateTowers))
			end

			if layer == "Shell" then
				shellCount += 1
				check(model.Name .. ": SHELL is fog-safe and not detailed",
					model:GetAttribute("FogSafe") == true and model:GetAttribute("Detailed") == false)
				local prompts, leveled, focalLights, merlons, actualParts = 0, 0, 0, 0, 0
				for _, descendant in model:GetDescendants() do
					if descendant:IsA("ProximityPrompt") then
						prompts += 1
					end
					if descendant:IsA("BasePart") then
						actualParts += 1
						if descendant.Name:find("Merlon") then merlons += 1 end
					end
					if descendant:IsA("PointLight") and descendant.Name == "FocalLight" then
						focalLights += 1
					end
					if descendant:IsA("Model") and (tonumber(descendant:GetAttribute("Level")) or 0) > 0 then
						leveled += 1
					end
				end
				check(model.Name .. ": SHELL has zero prompts (fog)", prompts == 0, tostring(prompts))
				check(model.Name .. ": SHELL leaks no levels (fog)", leveled == 0, tostring(leveled))
				check(model.Name .. ": SHELL has no detailed focal lights", focalLights == 0, tostring(focalLights))
				check(model.Name .. ": SHELL has no owned spawn", model:FindFirstChild("GateSpawn") == nil)
				check(model.Name .. ": SHELL layered keep silhouette",
					model:FindFirstChild("KeepMassing") ~= nil
						and model:FindFirstChild("KeepUpper") ~= nil
						and model:FindFirstChild("KeepCrown") ~= nil
						and model:FindFirstChild("BannerPost") ~= nil)
				local identity = model:FindFirstChild("IdentityPlaque")
				check(model.Name .. ": SHELL identity is surface-bound",
					identity ~= nil and identity:FindFirstChild("NameSurface") ~= nil)
				local shellBudget = tonumber(model:GetAttribute("VisualPartBudget")) or 0
				local recordedParts = tonumber(model:GetAttribute("VisualPartCount")) or -1
				check(model.Name .. ": SHELL part budget is real",
					recordedParts == actualParts and actualParts <= shellBudget and shellBudget <= 120,
					string.format("actual=%d recorded=%d budget=%d", actualParts, recordedParts, shellBudget))
				check(model.Name .. ": SHELL merlon count is reduced", merlons <= 80, tostring(merlons))
			elseif layer == "OwnerDetail" then
				fullCount += 1
				check(model.Name .. ": DETAIL is owner-only and detailed",
					model:GetAttribute("FogSafe") == false and model:GetAttribute("Detailed") == true)
				local ownerUserId = tonumber(model:GetAttribute("OwnerUserId"))
				check(model.Name .. ": DETAIL has an owner", ownerUserId ~= nil)
				if ownerUserId then fullByOwner[ownerUserId] = (fullByOwner[ownerUserId] or 0) + 1 end
				local buildings, prompts, labelled = 0, 0, 0
				for _, child in model:GetChildren() do
					if child.Name:sub(1, 2) == "B_" then
						buildings += 1
						local structure = child:FindFirstChild("Structure")
						local anchor = structure and structure:FindFirstChild("InteractionAnchor")
						if structure and structure:FindFirstChild("InteractPrompt") then
							prompts += 1
						end
						local labelAnchor = child:FindFirstChild("LabelAnchor")
						if labelAnchor and labelAnchor:FindFirstChild("NameSurface") then
							labelled += 1
						end
						check(child.Name .. ": prompt has a separate doorway anchor",
							structure ~= nil and structure:IsA("Model")
								and anchor ~= nil and anchor:IsA("BasePart")
								and structure.PrimaryPart == anchor
								and anchor:GetAttribute("DoorwayHeight") == true
								and anchor.Position.Y >= 3.5 and anchor.Position.Y <= 5.5)
						check(child.Name .. ": plaque is not the interaction anchor", labelAnchor ~= nil and labelAnchor ~= anchor)

						local roofParts, slopedRoofParts, gableParts, fasciaParts = 0, 0, 0, 0
						local semanticParts, actualParts, billboards, decorativeFailures = 0, 0, 0, 0
						for _, descendant in child:GetDescendants() do
							if descendant:IsA("BasePart") then
								actualParts += 1
								if descendant.Name == "Roof" then
									roofParts += 1
									local horizontalTilt = math.abs(descendant.CFrame.UpVector.X) + math.abs(descendant.CFrame.UpVector.Z)
									if descendant:IsA("Part")
										and descendant:GetAttribute("RoofPanel") == true
										and (tonumber(descendant:GetAttribute("RoofSlopeDegrees")) or 0) > 10
										and horizontalTilt > 0.1 and math.abs(descendant.CFrame.UpVector.Y) < 0.99 then
										slopedRoofParts += 1
									end
								end
								if descendant:IsA("WedgePart") and descendant.Name == "GableFill"
									and descendant:GetAttribute("ClosedGable") == true then gableParts += 1 end
								if descendant.Name == "Fascia" and descendant:GetAttribute("RoofFascia") == true then fasciaParts += 1 end
								if descendant:GetAttribute("SemanticProp") == true then semanticParts += 1 end
								if descendant:GetAttribute("Decorative") == true
									and (descendant.CanCollide or descendant.CanTouch or descendant.CanQuery or descendant.CastShadow) then
									decorativeFailures += 1
								end
							end
							if descendant:IsA("BillboardGui") then billboards += 1 end
						end
						local level = tonumber(child:GetAttribute("Level")) or 0
						if level > 0 then
							check(child.Name .. ": every roof panel is a genuinely sloped Part",
								roofParts >= 2 and roofParts <= 10 and roofParts % 2 == 0 and slopedRoofParts == roofParts,
								string.format("roof=%d sloped=%d", roofParts, slopedRoofParts))
							check(child.Name .. ": gable ends are closed WedgeParts",
								gableParts == roofParts * 2, string.format("roof=%d gable=%d", roofParts, gableParts))
							check(child.Name .. ": every roof has fascia",
								fasciaParts == roofParts * 2, string.format("roof=%d fascia=%d", roofParts, fasciaParts))
							check(child.Name .. ": semantic identity is present and bounded",
								semanticParts > 0 and semanticParts <= 8, tostring(semanticParts))
						else
							check(child.Name .. ": empty plot has no roof", roofParts == 0, tostring(roofParts))
							check(child.Name .. ": empty plot invents no semantic identity", semanticParts == 0, tostring(semanticParts))
						end
						check(child.Name .. ": semantic count attribute is truthful",
							semanticParts == (tonumber(child:GetAttribute("SemanticPartCount")) or -1))
						local partBudget = tonumber(child:GetAttribute("ArchitecturePartBudget")) or 0
						local recordedParts = tonumber(child:GetAttribute("ArchitecturePartCount")) or -1
						check(child.Name .. ": architecture part budget is real",
							recordedParts == actualParts and actualParts <= partBudget and partBudget <= 170,
							string.format("actual=%d recorded=%d budget=%d", actualParts, recordedParts, partBudget))
						check(child.Name .. ": decorative parts are inert", decorativeFailures == 0, tostring(decorativeFailures))
						check(child.Name .. ": facade uses no floating billboard", billboards == 0, tostring(billboards))
						check(child.Name .. ": street-facing yaw is explicit",
							typeof(child:GetAttribute("FacingYaw")) == "number" and child:GetAttribute("StreetFacing") == true)
					end
				end
				check(model.Name .. ": 13 buildings rendered", buildings == 13, tostring(buildings))
				check(model.Name .. ": every building has a prompt", prompts == 13, tostring(prompts))
				check(model.Name .. ": every building has a facade plaque", labelled == 13, tostring(labelled))
				local spawn = model:FindFirstChild("GateSpawn")
				if spawn then spawnCount += 1 end
				check(model.Name .. ": detailed owned spawn present", spawn ~= nil and spawn:IsA("SpawnLocation"))
				local gateParapets, gateBanners, gateLanterns, focalLights = 0, 0, 0, 0
				for _, descendant in model:GetDescendants() do
					if descendant.Name == "GateTowerParapet" then gateParapets += 1 end
					if descendant.Name == "GateTowerBanner" then gateBanners += 1 end
					if descendant.Name == "GateLantern" then gateLanterns += 1 end
					if descendant:IsA("PointLight") and descendant.Name == "FocalLight" then focalLights += 1 end
				end
				check(model.Name .. ": owned gate detail is bounded",
					gateParapets == 2 and gateBanners == 2 and gateLanterns == 1 and focalLights == 1,
					string.format("parapets=%d banners=%d lanterns=%d lights=%d", gateParapets, gateBanners, gateLanterns, focalLights))
				local hq = model:FindFirstChild("B_hq")
				check(model.Name .. ": layered HQ landmark present",
					hq ~= nil and hq:FindFirstChild("HQUpperKeep") ~= nil
						and hq:FindFirstChild("HQParapet") ~= nil
						and hq:FindFirstChild("HQCanopy") ~= nil
						and hq:FindFirstChild("HQInteriorBench") ~= nil)
				local barracks = model:FindFirstChild("B_barracks")
				local structure = barracks and (barracks :: Instance):FindFirstChild("Structure")
				check(model.Name .. ": barracks recruit prompt", structure ~= nil and (structure :: Instance):FindFirstChild("RecruitPrompt") ~= nil)

				local warTable = model:FindFirstChild("WarTable")
				if warTable and warTable:IsA("Model") then
					warTableCount += 1
					local actualTableParts = 0
					for _, descendant in warTable:GetDescendants() do
						if descendant:IsA("BasePart") then actualTableParts += 1 end
					end
					local tableBudget = tonumber(warTable:GetAttribute("VisualPartBudget")) or 0
					local recordedTableParts = tonumber(warTable:GetAttribute("VisualPartCount")) or -1
					check(model.Name .. ": war table budget matches its parts",
						recordedTableParts == actualTableParts and actualTableParts <= tableBudget and tableBudget <= 32,
						string.format("actual=%d recorded=%d budget=%d", actualTableParts, recordedTableParts, tableBudget))
					check(model.Name .. ": war table prompt present", warTable:FindFirstChild("TablePrompt") ~= nil)

					local blockers = 0
					if hq then
						local tableTop = warTable:FindFirstChild("TableTop")
						if tableTop and tableTop:IsA("BasePart") then
							for _, descendant in hq:GetDescendants() do
								if descendant:IsA("BasePart") and descendant.CanCollide and descendant.Name ~= "Floor" then
									local bottom = descendant.Position.Y - descendant.Size.Y / 2
									local top = descendant.Position.Y + descendant.Size.Y / 2
									local overlapsX = math.abs(descendant.Position.X - tableTop.Position.X) < 11 + descendant.Size.X / 2
									local overlapsZ = math.abs(descendant.Position.Z - tableTop.Position.Z) < 8 + descendant.Size.Z / 2
									if bottom < 8 and top > 1.1 and overlapsX and overlapsZ then blockers += 1 end
								end
							end
						end
					end
					check(model.Name .. ": HQ keeps the war-table aisle clear", blockers == 0, tostring(blockers))
				end
			end
		end
	end
check("at least one DETAIL settlement (a player must be in-game)", fullCount > 0)
check("fog-safe shells exist", shellCount > 0, tostring(shellCount))
for villageId, detail in detailByVillage do
	local shell = shellByVillage[villageId]
	local ownerUserId = tonumber(detail:GetAttribute("OwnerUserId"))
	check(villageId .. ": DETAIL has a paired SHELL", shell ~= nil)
	check(villageId .. ": DETAIL source is server-only",
		detail.Parent == detailSources and detail:GetAttribute("OwnerOnlySource") == true)
	local owner = ownerUserId and Players:GetPlayerByUserId(ownerUserId) or nil
	local playerGui = owner and owner:FindFirstChildOfClass("PlayerGui") or nil
	local privateFolder = playerGui and playerGui:FindFirstChild("SettlementDetailsPrivate") or nil
	local privateSource = privateFolder and privateFolder:FindFirstChild("SettlementDetail_" .. villageId) or nil
	check(villageId .. ": DETAIL published only to its owner's PlayerGui",
		privateSource ~= nil and tonumber(privateSource:GetAttribute("OwnerUserId")) == ownerUserId)
end

local replicatedDetailLeaks = 0
for _, root in { workspace, ReplicatedStorage } do
	for _, descendant in root:GetDescendants() do
		if descendant:IsA("Model") and descendant:GetAttribute("VisibilityLayer") == "OwnerDetail" then
			replicatedDetailLeaks += 1
		end
	end
end
check("no owner DETAIL model exists in Workspace or ReplicatedStorage", replicatedDetailLeaks == 0,
	tostring(replicatedDetailLeaks))
local workspaceFogLeaks = 0
if settlements then
	for _, descendant in settlements:GetDescendants() do
		if descendant:IsA("ProximityPrompt")
			or descendant:GetAttribute("Level") ~= nil
			or descendant:GetAttribute("Building") ~= nil
			or descendant:GetAttribute("OwnerUserId") ~= nil then
			workspaceFogLeaks += 1
		end
	end
end
check("Workspace settlements carry no prompts, building ids, levels, or owner detail",
	workspaceFogLeaks == 0, tostring(workspaceFogLeaks))
check("wilderness built", workspace:FindFirstChild("Wilderness") ~= nil and #workspace.Wilderness:GetChildren() > 1)
check("every DETAIL settlement owns exactly one spawn", spawnCount == fullCount, string.format("%d spawns / %d detail", spawnCount, fullCount))
local spawnAnchors = workspace:FindFirstChild("SettlementSpawns")
check("level-free Workspace spawn anchors cover present players",
	spawnAnchors ~= nil and #spawnAnchors:GetChildren() >= #Players:GetPlayers(),
	spawnAnchors and tostring(#spawnAnchors:GetChildren()) or "missing")
check("one command war table per present player", warTableCount == #Players:GetPlayers(),
	string.format("%d tables / %d players", warTableCount, #Players:GetPlayers()))
for _, player in Players:GetPlayers() do
	check(player.Name .. ": at least one DETAIL owned settlement", (fullByOwner[player.UserId] or 0) >= 1,
		tostring(fullByOwner[player.UserId] or 0))

	local character = player.Character
	local costume = character and character:FindFirstChild("KingsAgeCommanderCostume")
	check(player.Name .. ": era-correct commander costume is attached",
		costume ~= nil and costume:IsA("Folder")
			and costume:GetAttribute("ExternalAssetIds") == false
			and costume:GetAttribute("Era") == "12th-14th century grounded commander")
	if costume and costume:IsA("Folder") then
		local costumeParts, inertFailures = 0, 0
		for _, descendant in costume:GetDescendants() do
			if descendant:IsA("BasePart") then
				costumeParts += 1
				if not descendant.Massless or descendant.CanCollide or descendant.CanTouch or descendant.CanQuery then
					inertFailures += 1
				end
			end
		end
		local partBudget = tonumber(costume:GetAttribute("VisualPartBudget")) or 0
		local recordedParts = tonumber(costume:GetAttribute("VisualPartCount")) or -1
		check(player.Name .. ": commander costume part budget is real",
			costumeParts > 0 and recordedParts == costumeParts and costumeParts <= partBudget and partBudget <= 20,
			string.format("actual=%d recorded=%d budget=%d", costumeParts, recordedParts, partBudget))
		check(player.Name .. ": commander costume cannot affect movement or hit tests",
			inertFailures == 0, tostring(inertFailures))
	end

	local modernAppearance = 0
	if character then
		for _, child in character:GetChildren() do
			if child:IsA("Accessory") or child:IsA("Shirt") or child:IsA("Pants")
				or child:IsA("ShirtGraphic") or child:IsA("CharacterMesh") then
				modernAppearance += 1
			end
		end
	end
	check(player.Name .. ": modern avatar assets do not bleed through", modernAppearance == 0, tostring(modernAppearance))
end
check("DETAIL count supports multi-village ownership", fullCount >= #Players:GetPlayers(),
	string.format("%d detail / %d players", fullCount, #Players:GetPlayers()))

-- scouting slice: the shared contract the war table's War tab depends on.
-- Requiring a ModuleScript from a REAL server script is safe (one VM, one
-- cached instance) — it is only the command bar that hands back a second copy.
local sharedFolder = ReplicatedStorage:FindFirstChild("WorldShared")
local buildingsModule = sharedFolder and sharedFolder:FindFirstChild("Buildings")
check("WorldShared.Buildings exists", buildingsModule ~= nil)
if buildingsModule and buildingsModule:IsA("ModuleScript") then
	local okRequire, Buildings = pcall(require, buildingsModule)
	check("Buildings module loads", okRequire, tostring(Buildings))
	if okRequire and typeof(Buildings) == "table" then
		check("Buildings.TROOP_ORDER lists all 11 troop roles",
			typeof(Buildings.TROOP_ORDER) == "table" and #Buildings.TROOP_ORDER == 11,
			tostring(typeof(Buildings.TROOP_ORDER) == "table" and #Buildings.TROOP_ORDER or "nil"))
		check("Buildings.SCOUT_PRESET is bound label+payload",
			typeof(Buildings.SCOUT_PRESET) == "table"
				and Buildings.SCOUT_PRESET.troop == "scout"
				and typeof(Buildings.SCOUT_PRESET.quantity) == "number"
				and typeof(Buildings.SCOUT_PRESET.label) == "string")
		check("Buildings.SCOUT_PARTY is a positive whole number",
			typeof(Buildings.SCOUT_PARTY) == "number" and Buildings.SCOUT_PARTY >= 1
				and Buildings.SCOUT_PARTY == math.floor(Buildings.SCOUT_PARTY),
			tostring(Buildings.SCOUT_PARTY))
	end
end

-- Week 2.1 field dressing is a pure shared spec (same pattern as Buildings):
-- evidence can count it without a live battle, which a client-only folder
-- would hide from this server script.
local dressingModule = sharedFolder and sharedFolder:FindFirstChild("BattlefieldDressing")
check("WorldShared.BattlefieldDressing exists", dressingModule ~= nil)
if dressingModule and dressingModule:IsA("ModuleScript") then
	local okDressing, Dressing = pcall(require, dressingModule)
	check("BattlefieldDressing module loads", okDressing, tostring(Dressing))
	if okDressing and typeof(Dressing) == "table" then
		local groundN, bannerN, combinedN = Dressing.counts()
		check("battlefield dressing ≤120 parts",
			typeof(groundN) == "number" and groundN > 0 and groundN <= 120, tostring(groundN))
		check("squad banners ≤9 parts",
			typeof(bannerN) == "number" and bannerN > 0 and bannerN <= 9, tostring(bannerN))
		check("dressing + banners ≤129 parts",
			typeof(combinedN) == "number" and combinedN <= 129, tostring(combinedN))
		local unanchored, scripted = 0, 0
		for _, list in { Dressing.groundSpecs(), Dressing.allBannerSpecs() } do
			for _, part in list do
				if part.anchored ~= true then
					unanchored += 1
				end
				if part.className == "Script" or part.className == "LocalScript" then
					scripted += 1
				end
			end
		end
		check("every dressing/banner spec is anchored", unanchored == 0, tostring(unanchored))
		check("no dressing/banner spec is a script", scripted == 0, tostring(scripted))
	end
end

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
     Confirm the player is a grounded wool/mail/leather commander in both R6 and R15,
     with an unobstructed face, no catalogue accessories, and normal movement/animations/camera.
  8. Two-player fog drill: owner sees DETAIL with working prompts; visitor sees only
     the paired SHELL, no level plaques/prompts, and walks without invisible blockers.

[EVIDENCE] SCOUTING DRILLS (docs/superpowers/drills-scouting.md has full steps):
  9. War tab: at the table, tap "War" -> scouts-on-hand count, every foreign village
     listed nearest-first with its realm and tile distance, no levels shown for any of them.
 10. Send scouts -> toast "Scouts are away.", scouts-on-hand drops by one, a countdown row
     appears in BOTH the War tab and the HUD queue panel.
 11. Arrival -> toast "Scouts are back from <village>.", a report card shows the target's
     real army/resources/Rampart+HQ, and the march flips to "Scouts returning".
 12. Fog still holds: nothing outside that report card ever shows a foreign level or count.
 13. Zero scouts -> the Scout buttons read "—" and refuse honestly; the "Recruit 2 Scouts"
     row appears and (with no Stable) the realm's own refusal is what the player reads.
]])
