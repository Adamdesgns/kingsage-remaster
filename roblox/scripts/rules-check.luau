--!strict
-- Behaviour gate for the SHARED rules in src/shared/. Run with:
--   lune run roblox/scripts/rules-check.luau
--
-- Why this exists: the Node test suites drive the world server's HTTP routes
-- directly and never execute one line of Luau, which is exactly how an empty
-- villageId shipped to every command in slice A. Buildings.luau is pure Lua —
-- no Roblox globals — so Lune can RUN it, not just parse it. Anything here is
-- a rule both the Roblox server and the war table depend on agreeing about.
local luau = require("@lune/luau")
local fs = require("@lune/fs")
local process = require("@lune/process")
local serde = require("@lune/serde")

-- Load a pure shared module the way a require() would, without Roblox.
local function loadModule(path: string): any
	local chunk = luau.load(fs.readFile(path), { debugName = path })
	return chunk()
end

local Buildings = loadModule("roblox/src/shared/Buildings.luau")
local Config = loadModule("roblox/src/shared/Config.luau")

local failures = 0
local checks = 0

local function check(name: string, condition: boolean, detail: string?)
	checks += 1
	if condition then
		print(string.format("PASS  %s", name))
	else
		failures += 1
		print(string.format("FAIL  %s%s", name, if detail then "  — " .. detail else ""))
	end
end

-- ---- the muster rule: what marches when you press Attack ----

check("scouts never ride, raid or conquest",
	not Buildings.mustersOnAttack("scout", false) and not Buildings.mustersOnAttack("scout", true))

check("noblemen stay home on an ordinary raid",
	not Buildings.mustersOnAttack("noble", false))

check("noblemen ride ONLY when the conquest flag is set true",
	Buildings.mustersOnAttack("noble", true))

-- The flag arrives from a client table, so anything that is not literally
-- true must read as "raid". A nil or a truthy string must never conscript a
-- nobleman the player did not knowingly commit.
check("a missing conquest flag is a raid, not a conquest",
	not Buildings.mustersOnAttack("noble", nil))

check("fighting troops always muster", (function(): boolean
	for _, troop in Buildings.TROOP_ORDER do
		if troop ~= "scout" and troop ~= "noble" then
			if not Buildings.mustersOnAttack(troop, false) then
				return false
			end
		end
	end
	return true
end)())

-- ---- the army that actually marches ----
-- This is the table CommandService dispatches to the world server verbatim,
-- so a mistake here is a wrong army leaving a real village.

local GARRISON = {
	spear = 40, sword = 12, axe = 7, archer = 15,
	scout = 4, lightCavalry = 6, ram = 2, noble = 3,
}

check("a raid marches every fighter and leaves scouts AND noblemen home", (function(): boolean
	local army, fighting, nobles = Buildings.musterFrom(GARRISON, false)
	return army.scout == 0 and army.noble == 0 and nobles == 0
		and army.spear == 40 and army.sword == 12 and army.axe == 7
		and army.archer == 15 and army.lightCavalry == 6 and army.ram == 2
		and fighting == 40 + 12 + 7 + 15 + 6 + 2
end)())

check("a conquest marches the same fighters PLUS the noblemen", (function(): boolean
	local army, fighting, nobles = Buildings.musterFrom(GARRISON, true)
	return army.scout == 0 and army.noble == 3 and nobles == 3
		and fighting == 40 + 12 + 7 + 15 + 6 + 2
end)())

check("the dispatched army names every troop the world server expects", (function(): boolean
	local army = Buildings.musterFrom(GARRISON, true)
	local count = 0
	for _, troop in Buildings.TROOP_ORDER do
		if type(army[troop]) ~= "number" then
			return false
		end
		count += 1
	end
	-- No extra keys either: the world server validates the army's shape.
	for _ in army do
		count -= 1
	end
	return count == 0
end)())

check("an empty or missing garrison musters nothing rather than erroring", (function(): boolean
	local army, fighting, nobles = Buildings.musterFrom(nil, true)
	return fighting == 0 and nobles == 0 and army.spear == 0
end)())

check("fractional or negative counts are floored to a sane whole number", (function(): boolean
	local army, fighting = Buildings.musterFrom({ spear = 7.9, sword = -3 }, false)
	return army.spear == 7 and army.sword == 0 and fighting == 7
end)())

-- ---- presets: the label and the payload must never drift apart ----

check("every recruit preset names a troop game-core knows", (function(): boolean
	local known: { [string]: boolean } = {}
	for _, troop in Buildings.TROOP_ORDER do
		known[troop] = true
	end
	for _, preset in { Buildings.RECRUIT_PRESET, Buildings.SCOUT_PRESET, Buildings.NOBLE_PRESET } do
		if not known[preset.troop] or preset.quantity < 1 then
			return false
		end
	end
	return true
end)())

check("the nobleman preset buys exactly one, and says so",
	Buildings.NOBLE_PRESET.troop == "noble"
		and Buildings.NOBLE_PRESET.quantity == 1
		and Buildings.NOBLE_PRESET.label:find("1") ~= nil)

-- ---- the attack plan: the client must not be able to invent an order ----

check("every plan axis has options and a stable default", (function(): boolean
	local default = Buildings.defaultAttackPlan()
	for _, axis in Buildings.ATTACK_PLAN_AXES do
		if #axis.options < 1 or default[axis.key] ~= axis.options[1] then
			return false
		end
	end
	return true
end)())

check("troop and building display names cover every id", (function(): boolean
	for _, troop in Buildings.TROOP_ORDER do
		if Buildings.troopName(troop) == troop then
			return false
		end
	end
	for _, building in Buildings.ORDER do
		if Buildings.displayName(building) == building then
			return false
		end
	end
	return true
end)())

-- ---- WIRING: every WaitForChild name must actually exist ----
-- The defect class this catches has now shipped three times, and it is always
-- fatal and always invisible offline: WaitForChild with no timeout yields
-- FOREVER on a name that never appears. One wrong name in a module require
-- hangs the script that requires it — the whole HUD, silently, with a clean
-- syntax gate and a clean rojo build. Studio is the only other place it shows.

local function readAll(directory: string, into: { string })
	for _, entry in fs.readDir(directory) do
		local path = directory .. "/" .. entry
		if fs.isDir(path) then
			readAll(path, into)
		elseif entry:match("%.luau$") then
			table.insert(into, path)
		end
	end
	return into
end

local luauFiles = {}
for _, root in { "roblox/src", "roblox/demo", "roblox/scripts" } do
	readAll(root, luauFiles)
end

-- The names Rojo actually creates under ReplicatedStorage, read from the
-- project files rather than assumed.
local replicatedNames: { [string]: boolean } = {}
for _, project in { "roblox/default.project.json", "roblox/demo.project.json" } do
	local tree = serde.decode("json", fs.readFile(project)).tree
	local replicated = tree.ReplicatedStorage
	if replicated then
		for key in replicated do
			if key:sub(1, 1) ~= "$" then
				replicatedNames[key] = true
			end
		end
	end
end

-- Names the game CREATES at runtime rather than Rojo (e.g. WorldSession makes
-- the WorldRemotes folder on boot). A name created nowhere and mapped nowhere
-- is the typo this gate is hunting.
local createdNames: { [string]: boolean } = {}
for _, path in luauFiles do
	for name in fs.readFile(path):gmatch('%.Name%s*=%s*"([^"]+)"') do
		createdNames[name] = true
	end
end

local badService: { string } = {}
local badSibling: { string } = {}

for _, path in luauFiles do
	local source = fs.readFile(path)

	for name in source:gmatch('ReplicatedStorage:WaitForChild%("([^"]+)"%)') do
		if not replicatedNames[name] and not createdNames[name] then
			table.insert(badService, string.format("%s wants ReplicatedStorage.%s", path, name))
		end
	end

	-- `script:WaitForChild("X")` inside an init script means a SIBLING module
	-- file X.luau in the same folder, which Rojo makes a child of that script.
	if path:match("/init%.[^/]+%.luau$") then
		local folder = path:match("^(.*)/[^/]+$")
		for name in source:gmatch('script:WaitForChild%("([^"]+)"%)') do
			if not fs.isFile(folder .. "/" .. name .. ".luau") then
				table.insert(badSibling, string.format("%s wants sibling %s.luau", path, name))
			end
		end
	end
end

check("every ReplicatedStorage:WaitForChild name is mapped by Rojo or created in code",
	#badService == 0, table.concat(badService, "; "))

check("every script:WaitForChild in an init script has a sibling module",
	#badSibling == 0, table.concat(badSibling, "; "))

-- ---- the region floor: Roblox will not build a part bigger than 2048 ----

check("no ground tile exceeds Roblox's maximum part size", (function(): boolean
	-- The whole reason this rule exists: RegionGround was ONE part spanning
	-- every settlement — 9,540 x 7,780 studs with ten of them. Roblox refuses
	-- any axis over 2,048, so the part was NEVER CREATED and the region had no
	-- floor at all. Nothing errored. The build printed a tree count and the
	-- world was a void with village plates hanging in it.
	for _, tile in Config.groundTiles(0, 9540, 0, 7780) do
		if tile.sx > Config.MAX_PART_STUDS or tile.sz > Config.MAX_PART_STUDS then
			return false
		end
	end
	return true
end)())

check("ground tiles cover the whole region with no gap and no overhang", (function(): boolean
	-- A seam is a hole to fall through, and an overhang is ground where the map
	-- says there is none. Area is the cheap way to catch both at once.
	local minX, maxX, minZ, maxZ = -1200, 4300, 500, 6100
	local tiles = Config.groundTiles(minX, maxX, minZ, maxZ)
	if #tiles == 0 then
		return false
	end
	local covered = 0
	local loX, hiX, loZ, hiZ = math.huge, -math.huge, math.huge, -math.huge
	for _, tile in tiles do
		covered += tile.sx * tile.sz
		loX = math.min(loX, tile.cx - tile.sx / 2)
		hiX = math.max(hiX, tile.cx + tile.sx / 2)
		loZ = math.min(loZ, tile.cz - tile.sz / 2)
		hiZ = math.max(hiZ, tile.cz + tile.sz / 2)
	end
	local wanted = (maxX - minX) * (maxZ - minZ)
	return math.abs(covered - wanted) < 1
		and math.abs(loX - minX) < 0.001 and math.abs(hiX - maxX) < 0.001
		and math.abs(loZ - minZ) < 0.001 and math.abs(hiZ - maxZ) < 0.001
end)())

check("a region small enough for one part still gets one part", (function(): boolean
	local tiles = Config.groundTiles(0, 800, 0, 600)
	return #tiles == 1 and math.abs(tiles[1].sx - 800) < 0.001 and math.abs(tiles[1].sz - 600) < 0.001
end)())

-- ---- cosmetics must never be able to kill the server ----

check("nothing tries to write Lighting.Technology from a script", (function(): boolean
	-- A normal script CANNOT write it - it needs the RobloxScript capability and
	-- the attempt throws. On 2026-08-23 that one line killed the entire game:
	-- applyLighting() ran on line 3 of init.server.luau, so when it threw,
	-- WorldSession, SettlementBuilder, CommandService and WarTable never loaded.
	-- The player spawned over open sky and fell to their death on a loop.
	-- Technology is a PLACE property; it belongs in the .project.json.
	for _, path in { "roblox/src/server/WorldStyle.luau", "roblox/src/server/init.server.luau" } do
		if string.find(fs.readFile(path), "Lighting.Technology%s*=") then
			return false
		end
	end
	return true
end)())

check("the server entry point cannot be killed by styling", (function(): boolean
	-- Styling is cosmetic. A world that looks wrong is a bug; a world that does
	-- not start is a dead game. The require must be guarded.
	local source = fs.readFile("roblox/src/server/init.server.luau")
	local stylePos = string.find(source, "WorldStyle")
	if not stylePos then
		return true -- no styling to guard
	end
	return string.find(source, "pcall") ~= nil
end)())

-- ---- week 2.1 battlefield dressing + squad banners (analytic part budget) ----
-- Same gate as WarTable / streetscape: a counted spec, a hard ceiling, and a
-- test that fails if the movie is deleted or grows past the phone budget.

local BattlefieldDressing = loadModule("roblox/src/shared/BattlefieldDressing.luau")
local groundParts = BattlefieldDressing.groundSpecs()
local bannerParts = BattlefieldDressing.allBannerSpecs()
local groundCount, bannerCount, combinedCount = BattlefieldDressing.counts()

check("battlefield dressing budget is the locked 120/9/129",
	BattlefieldDressing.BUDGET.GROUND == 120
		and BattlefieldDressing.BUDGET.BANNERS == 9
		and BattlefieldDressing.BUDGET.COMBINED == 129)

check("counts() matches the spec lists",
	groundCount == #groundParts and bannerCount == #bannerParts and combinedCount == groundCount + bannerCount,
	string.format("ground=%d banners=%d combined=%d", groundCount, bannerCount, combinedCount))

check("field dressing is present and within 120 parts",
	groundCount > 0 and groundCount <= 120,
	tostring(groundCount))

check("squad banners are 3 squads × 3 parts (≤9)",
	bannerCount == 9 and bannerCount <= 9,
	tostring(bannerCount))

check("dressing + banners stay within 129 parts",
	combinedCount <= 129,
	tostring(combinedCount))

check("every dressing and banner spec is an anchored Part with no collision", (function(): boolean
	for _, list in { groundParts, bannerParts } do
		for _, part in list do
			if part.className ~= "Part" or part.anchored ~= true or part.canCollide ~= false then
				return false
			end
		end
	end
	return true
end)())

check("no dressing or banner spec is a script or Humanoid", (function(): boolean
	for _, list in { groundParts, bannerParts } do
		for _, part in list do
			local className = part.className
			if className == "Script" or className == "LocalScript" or className == "Humanoid" then
				return false
			end
		end
	end
	return true
end)())

check("each orderable squad carries a 3-part tinted banner", (function(): boolean
	for _, squadId in BattlefieldDressing.SQUAD_IDS do
		local specs = BattlefieldDressing.bannerSpecsForSquad(squadId)
		if #specs ~= 3 then
			return false
		end
		local hasCloth = false
		for _, part in specs do
			if part.squadId ~= squadId or part.group ~= "banner" or part.anchored ~= true then
				return false
			end
			if part.tint == "squad" then
				hasCloth = true
			end
		end
		if not hasCloth then
			return false
		end
	end
	return #BattlefieldDressing.SQUAD_IDS == 3
end)())

check("cobble road runs toward the defender gate", (function(): boolean
	for _, part in groundParts do
		if part.name == "ApproachRoad" then
			return part.kind == "road" and part.sz > part.sx and math.abs(part.ox) < 1 and part.material == "Cobblestone"
		end
	end
	return false
end)())

check("dressing has grass, shoulder dirt, trees and rocks", (function(): boolean
	local kinds: { [string]: number } = {}
	local trunks = 0
	for _, part in groundParts do
		kinds[part.kind] = (kinds[part.kind] or 0) + 1
		if part.kind == "tree" and string.find(part.name, "Trunk") then
			trunks += 1
		end
	end
	return (kinds.grass or 0) >= 1
		and (kinds.dirt or 0) >= 2
		and (kinds.road or 0) >= 1
		and trunks >= 4 and trunks <= 8
		and (kinds.rock or 0) >= 8
end)())

check("trees and rocks sit at field edges, not in the fight", (function(): boolean
	for _, part in groundParts do
		if part.kind == "tree" or part.kind == "rock" then
			if not BattlefieldDressing.isEdgeProp(part) then
				return false
			end
			if math.abs(part.ox) < BattlefieldDressing.FIGHT_HALF_X
				and math.abs(part.oz) < BattlefieldDressing.FIGHT_HALF_Z then
				return false
			end
		end
	end
	return true
end)())

check("BattleScene consumes BattlefieldDressing and asserts the budget", (function(): boolean
	local source = fs.readFile("roblox/src/client/BattleScene.luau")
	return string.find(source, 'WaitForChild%("BattlefieldDressing"%)') ~= nil
		and string.find(source, "BUDGET.GROUND") ~= nil
		and string.find(source, "BUDGET.BANNERS") ~= nil
		and string.find(source, "FieldDressing") ~= nil
		and string.find(source, "SquadBanners") ~= nil
end)())

check("BattleScene never parents scripts onto dressing or banners", (function(): boolean
	local source = fs.readFile("roblox/src/client/BattleScene.luau")
	return string.find(source, 'Instance%.new%("Script"%)') == nil
		and string.find(source, 'Instance%.new%("LocalScript"%)') == nil
		and string.find(source, 'Instance%.new%("Humanoid"%)') == nil
end)())

check("dressing palette is locked to WorldStyle", (function(): boolean
	local worldStyle = fs.readFile("roblox/src/server/WorldStyle.luau")
	local locks = {
		"grass%s+=%s+Color3.fromRGB%(104, 130, 74%)",
		"dirt%s+=%s+Color3.fromRGB%(126, 104, 78%)",
		"cobbleLight%s+=%s+Color3.fromRGB%(170, 158, 136%)",
		"pathEdge%s+=%s+Color3.fromRGB%(108, 92, 72%)",
		"foliage%s+=%s+Color3.fromRGB%(67, 104, 55%)",
		"timber%s+=%s+Color3.fromRGB%(92, 66, 44%)",
		"bannerGold%s+=%s+Color3.fromRGB%(204, 164, 82%)",
	}
	for _, pattern in locks do
		if not string.find(worldStyle, pattern) then
			return false
		end
	end
	-- The dressing module must actually USE those numbers, not just sit next to them.
	local dressing = fs.readFile("roblox/src/shared/BattlefieldDressing.luau")
	return string.find(dressing, "104, 130, 74") ~= nil
		and string.find(dressing, "170, 158, 136") ~= nil
		and string.find(dressing, "92, 66, 44") ~= nil
end)())

print(string.format("---- %d rules checked, %d failed ----", checks, failures))
if failures > 0 then
	process.exit(1)
end
