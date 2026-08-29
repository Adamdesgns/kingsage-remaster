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

-- BattleConfig is data, but it spells its colours with Roblox constructors,
-- which Lune does not have. Stubbing them is enough to LOAD the real file and
-- read its real field names -- much stronger than grepping for them.
local function loadWithRobloxStubs(path: string): any
	local stub = function(...) return { ... } end
	local chunk = luau.load(fs.readFile(path), {
		debugName = path,
		environment = {
			Color3 = { fromRGB = stub, new = stub, fromHSV = stub },
			Vector3 = { new = stub, zero = {} },
			CFrame = { new = stub, Angles = stub, lookAt = stub },
		},
	})
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
for _, root in { "roblox/src", "roblox/demo", "roblox/scripts", "roblox/spike" } do
	readAll(root, luauFiles)
end

-- The names Rojo actually creates under ReplicatedStorage, read from the
-- project files rather than assumed.
local replicatedNames: { [string]: boolean } = {}
for _, project in { "roblox/default.project.json", "roblox/demo.project.json", "roblox/spike.project.json" } do
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

-- ---- THE MEASUREMENT MUST MEASURE THE REAL GAME ----
-- roblox/spike is the ONLY build that can run on a real phone today: it speaks
-- no HTTP, so it needs no world server and can be published on its own. That
-- makes it the instrument for the Slice 0 phone measure -- and an instrument
-- that draws something cheaper than the real battle reports a number the real
-- battle cannot honour. These rules keep the spike honest by construction.

-- These rules read SOURCE, so a comment mentioning the right name would
-- otherwise satisfy them -- and this file's whole job is refusing to be
-- satisfied by prose. Strip comments first and match against code only.
local NEWLINE = string.char(10)
local function codeOnly(source: string): string
	local out = {}
	for line in (source .. NEWLINE):gmatch("([^" .. NEWLINE .. "]*)" .. NEWLINE) do
		table.insert(out, (line:gsub("%-%-.*$", "")))
	end
	return table.concat(out, NEWLINE)
end

local battleSceneSource = codeOnly(fs.readFile("roblox/src/client/BattleScene.luau"))
local spikeClientSource = codeOnly(fs.readFile("roblox/spike/client/init.client.luau"))
local spikeServerSource = codeOnly(fs.readFile("roblox/spike/server/init.server.luau"))

check("the battle scene and the phone spike build soldiers from ONE shared module", (function(): boolean
	-- Two copies of the soldier is exactly the mirror-drift bug this repo keeps
	-- shipping. If either side stops requiring the shared build, the phone
	-- number stops describing the battle it is supposed to size.
	if not fs.isFile("roblox/src/shared/SoldierBuild.luau") then
		return false
	end
	local wanted = 'require%(worldShared:WaitForChild%("SoldierBuild"%)%)'
	return string.find(battleSceneSource, wanted) ~= nil
		and string.find(spikeClientSource, wanted) ~= nil
end)())

check("neither consumer keeps a private copy of the soldier build", (function(): boolean
	-- The offset tables and the part recipe live in SoldierBuild and nowhere
	-- else. Re-inlining them is how the spike would silently drift back to cheap
	-- plastic boxes while still reporting a PASS.
	for _, source in { battleSceneSource, spikeClientSource, spikeServerSource } do
		if string.find(source, "VANGUARD_OFFSETS%s*:%s*{") then
			return false
		end
		if string.find(source, "local function makeSoldier") then
			return false
		end
	end
	return true
end)())

check("the spike draws its population from BattleConfig, not a hardcoded number", (function(): boolean
	-- MAX_SOLDIERS is the number Slice 0 exists to set. If the spike counted its
	-- own soldiers, the measurement and the game could disagree about what "200"
	-- means and nobody would see it.
	return string.find(spikeClientSource, "BattleConfig%.MAX_SOLDIERS") ~= nil
end)())

check("the phone spike builds its soldiers on the CLIENT, like the real battle", (function(): boolean
	-- BattleScene is a client module on purpose: nothing it builds replicates,
	-- so 200 soldiers cost the network nothing. A spike that spawned them
	-- server-side would make a phone pay a replication bill the real game never
	-- sends, and would fail Slice 0 for the wrong reason.
	return string.find(spikeServerSource, "BulkMoveTo") == nil
		and string.find(spikeServerSource, "SOLDIERS_PER_SIDE") == nil
end)())

check("every BattleConfig field the spike reads actually exists", (function(): boolean
	-- THE SILENT-SUCCESS TRAP, in the exact shape this repo keeps hitting. A
	-- mistyped field reads as nil, not an error: WALK_SPEED nil means the
	-- soldiers never march, never make contact, and the spike reports a
	-- magnificent frame rate for a still photograph. Slice 0 would PASS on a
	-- measurement of nothing, and every visual slice below it would be sized
	-- by that number. BattleConfig is pure Lua, so Lune can LOAD it and check
	-- the field names for real rather than trusting a grep.
	local BattleConfig = loadWithRobloxStubs("roblox/src/shared/BattleConfig.luau")
	local missing = {}
	for field in spikeClientSource:gmatch("BattleConfig%.([A-Za-z_][A-Za-z0-9_]*)") do
		if BattleConfig[field] == nil then
			table.insert(missing, field)
		end
	end
	for field in spikeServerSource:gmatch("BattleConfig%.([A-Za-z_][A-Za-z0-9_]*)") do
		if BattleConfig[field] == nil then
			table.insert(missing, field)
		end
	end
	return #missing == 0
end)())

check("the phone spike still speaks no HTTP", (function(): boolean
	-- The entire reason the spike can be published and played on a phone while
	-- the world server sits on 127.0.0.1. One HttpService call here and Slice 0
	-- becomes blocked on public hosting.
	for _, source in { spikeClientSource, spikeServerSource } do
		if string.find(source, "HttpService") or string.find(source, "API_BASE") then
			return false
		end
	end
	return true
end)())

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

-- ---- the order cap mirror: the client refuses order six with a sentence ----

check("CommandService's battleOrder mirror reads BattleConfig.ORDER_CAP, not a hand-typed number", (function()
	local commandService = fs.readFile("roblox/src/server/CommandService.luau")
	local branch = string.match(commandService, 'if request%.kind == "battleOrder".-\n\tend')
	if not branch then
		return false
	end
	return string.find(branch, "BattleConfig%.ORDER_CAP") ~= nil
end)())

-- ---- battleOpen carries the report's REAL version ----
-- Commit 9467e02 deleted the `local reportVersion = ...` line while the
-- payload still said `targetVillageVersion = reportVersion` - an undefined
-- Luau global is nil, the key vanished from the payload, the world server
-- read NaN, and EVERY client battleOpen was refused as stale intel forever.
-- The compile gate cannot catch an undefined global; this reads the text.

check("battleOpen defines reportVersion from the report before claiming it", (function()
	local commandService = fs.readFile("roblox/src/server/CommandService.luau")
	local branch = string.match(commandService, 'if request%.kind == "battleOpen".-' .. string.char(10) .. "\tend")
	if not branch then
		return false
	end
	return string.find(branch, "local reportVersion%s*=%s*math%.floor%(tonumber%(report%.targetVillageVersion%)") ~= nil
		and string.find(branch, "targetVillageVersion = reportVersion") ~= nil
end)())

-- ---- attend on foot: overhead stays the default, the walk is one tap ----

check("enterBattle still defaults to the overhead command view", (function()
	local client = fs.readFile("roblox/src/client/init.client.luau")
	local body = string.match(client, "function enterBattle.-" .. string.char(10) .. "end")
	if not body then
		return false
	end
	-- The Scriptable overhead camera must be set unconditionally in entry, and
	-- entry must never start a battle on foot (red team: the shoulder camera is
	-- the worst view to learn squad orders in).
	return string.find(body, "Enum%.CameraType%.Scriptable") ~= nil
		and string.find(body, "setOnFoot%(true%)") == nil
end)())

check("the walk-the-field toggle teleports through BattleScene.footAnchor, not a hand-typed offset", (function()
	local client = fs.readFile("roblox/src/client/init.client.luau")
	return string.find(client, "BattleScene%.footAnchor%(%)") ~= nil
end)())

check("footAnchor stands on the attacker baseline of the shared field geometry", (function()
	local scene = fs.readFile("roblox/src/client/BattleScene.luau")
	local body = string.match(scene, "function BattleScene%.footAnchor.-" .. string.char(10) .. "end")
	if not body then
		return false
	end
	-- The attacker forms up at center + FIELD_DEPTH/2 (facing pi); the anchor
	-- must be derived from the same shared constant, a step behind the line.
	return string.find(body, "BattleConfig%.FIELD_DEPTH / 2") ~= nil
end)())

-- ---- rally (slice 2): one mapping, one request budget, no double-spend ----

check("the rally heartbeat rides the existing state pull - request budget unchanged", (function()
	local session = fs.readFile("roblox/src/server/WorldSession.luau")
	-- Exactly the two pulls that existed before slice 2 (refetch + heartbeat),
	-- and the rallies payload travels inside one of them, not in a third call.
	local count = 0
	for _ in string.gmatch(session, 'ApiClient%.post%("/api/roblox/state"') do
		count += 1
	end
	return count == 2 and string.find(session, "rallies") ~= nil
end)())

check("client and server map the field through one shared toOrderSpace", (function()
	local battleConfig = fs.readFile("roblox/src/shared/BattleConfig.luau")
	local scene = fs.readFile("roblox/src/client/BattleScene.luau")
	local session = fs.readFile("roblox/src/server/WorldSession.luau")
	return string.find(battleConfig, "function BattleConfig%.toOrderSpace") ~= nil
		and string.find(scene, "BattleConfig%.toOrderSpace") ~= nil
		and string.find(session, "BattleConfig%.toOrderSpace") ~= nil
end)())

check("battleRally re-registers instead of double-spending the order cap", (function()
	local commandService = fs.readFile("roblox/src/server/CommandService.luau")
	local branch = string.match(commandService, 'request%.kind == "battleRally".-' .. string.char(10) .. "\tend")
	if not branch then
		return false
	end
	return string.find(branch, "WorldSession%.rallyFor") ~= nil
end)())

check("the rally button exists only where the commander does", (function()
	local client = fs.readFile("roblox/src/client/init.client.luau")
	-- The Rally barButton must be built inside the onFoot branch: rallying
	-- from the overhead view would be a position claim with no body on the
	-- field to back it.
	-- Statement-level guard at panel indentation (the inline
	-- `if onFoot then "Overhead"` label expression must not satisfy this).
	local branch = string.match(client, string.char(10) .. "\t\tif onFoot then.-" .. string.char(10) .. "\t\tend")
	if not branch then
		return false
	end
	return string.find(branch, "battleRally") ~= nil
end)())

-- ---- the herd (slice 3): the paddock counts what the stable holds ----

local paddockOk, PaddockSpec = pcall(loadModule, "roblox/src/shared/PaddockSpec.luau")

check("PaddockSpec loads pure under Lune", paddockOk)

check("eight horses spend exactly the 80-part budget and not a part more", (function()
	if not paddockOk then
		return false
	end
	local total = 0
	for index = 1, PaddockSpec.MAX_DISPLAY do
		local parts = PaddockSpec.horseSpecs(index)
		if #parts ~= PaddockSpec.HORSE_PARTS then
			return false
		end
		total += #parts
	end
	return total == 80 and total <= PaddockSpec.BUDGET
end)())

check("zero horses shows zero - and the display scales exactly as the design table says", (function()
	if not paddockOk then
		return false
	end
	local cases: { { number } } = { { 0, 0 }, { 1, 1 }, { 11, 1 }, { 12, 1 }, { 13, 2 }, { 72, 6 }, { 96, 8 }, { 10000, 8 } }
	for _, case in cases do
		if PaddockSpec.displayCount(case[1]) ~= case[2] then
			return false
		end
	end
	-- Garbage in, empty paddock out - never an error.
	return PaddockSpec.displayCount(0 / 0) == 0 and PaddockSpec.displayCount(-5) == 0
end)())

check("every horse grazes inside the paddock strip, deterministically", (function()
	if not paddockOk then
		return false
	end
	local source = fs.readFile("roblox/src/shared/PaddockSpec.luau")
	if string.find(source, "math%.random") then
		return false
	end
	for index = 1, PaddockSpec.MAX_DISPLAY do
		local points = PaddockSpec.waypoints(index)
		if #points < 3 then
			return false
		end
		for _, point in points do
			-- The strip in front of the stable, inside the existing rails.
			if point.x < -14 or point.x > 14 or point.z < 14.5 or point.z > 20.5 then
				return false
			end
		end
	end
	return true
end)())

check("the paddock renderer draws only what PaddockSpec counts", (function()
	local ok, paddock = pcall(fs.readFile, "roblox/src/client/Paddock.luau")
	if not ok then
		return false
	end
	-- Every part the client places must come from the shared spec, and the
	-- runtime audit must be present, or Lune is counting a different herd
	-- than Studio draws.
	return string.find(paddock, "PaddockSpec%.horseSpecs") ~= nil
		and string.find(paddock, "PaddockSpec%.BUDGET") ~= nil
		and string.find(paddock, "Instance%.new%(\"Part\"%)") == nil
end)())

-- ---- the living square (slice 4): people at the commander's quality bar ----

local villagerOk, VillagerSpec = pcall(loadModule, "roblox/src/shared/VillagerSpec.luau")

check("VillagerSpec loads pure under Lune", villagerOk)

check("four villagers spend 60 parts against the 150 cap, twelve frame + three prop each", (function()
	if not villagerOk then
		return false
	end
	local total = 0
	for _, archetype in VillagerSpec.ARCHETYPES do
		local frame = VillagerSpec.frameSpecs(archetype)
		local prop = VillagerSpec.propSpecs(archetype)
		if #frame ~= 12 or #prop > 3 or #prop < 1 then
			return false
		end
		total += #frame + #prop
	end
	return #VillagerSpec.ARCHETYPES == 4 and total <= 60 and total <= VillagerSpec.BUDGET
end)())

check("every villager walks the street shoulder, never the middle of the road", (function()
	if not villagerOk then
		return false
	end
	local source = fs.readFile("roblox/src/shared/VillagerSpec.luau")
	if string.find(source, "math%.random") then
		return false
	end
	for index = 1, 4 do
		local route = VillagerSpec.route(index)
		if #route < 6 then
			return false
		end
		for _, point in route do
			local lane = math.abs(point.x)
			if lane < 10 or lane > 16 or point.z < -50 or point.z > 140 then
				return false
			end
		end
	end
	return true
end)())

check("mourning needs a real loss, holds an hour, and cannot be farmed inside the cooldown", (function()
	if not villagerOk then
		return false
	end
	local state = VillagerSpec.newMourningState(100)
	-- A 4-point drop is grief, not mourning (floor is 5).
	state = VillagerSpec.updateMourning(state, 96, 1000)
	if VillagerSpec.shouldHide(state, false, 1000) then
		return false
	end
	-- A 5-point drop mourns for an hour.
	state = VillagerSpec.updateMourning(state, 91, 2000)
	if not VillagerSpec.shouldHide(state, false, 2000) then
		return false
	end
	if not VillagerSpec.shouldHide(state, false, 2000 + 3599) then
		return false
	end
	if VillagerSpec.shouldHide(state, false, 2000 + 3601) then
		return false
	end
	-- Another drop INSIDE the cooldown does not re-trigger...
	state = VillagerSpec.updateMourning(state, 80, 2000 + 3700)
	if VillagerSpec.shouldHide(state, false, 2000 + 3700) then
		return false
	end
	-- ...but one after the cooldown window does.
	state = VillagerSpec.updateMourning(state, 70, 2000 + 3600 + 1801)
	if not VillagerSpec.shouldHide(state, false, 2000 + 3600 + 1801) then
		return false
	end
	return true
end)())

check("the baker's boy does not stroll through a siege", (function()
	if not villagerOk then
		return false
	end
	-- An open battle at home hides everyone regardless of mourning state.
	local calm = VillagerSpec.newMourningState(100)
	return VillagerSpec.shouldHide(calm, true, 5000) == true
end)())

check("the villager renderer draws only what VillagerSpec counts", (function()
	local ok, villagers = pcall(fs.readFile, "roblox/src/client/Villagers.luau")
	if not ok then
		return false
	end
	return string.find(villagers, "VillagerSpec%.frameSpecs") ~= nil
		and string.find(villagers, "VillagerSpec%.shouldHide") ~= nil
		and string.find(villagers, "defenderVillageId") ~= nil
		and string.find(villagers, "Instance%.new%(\"Part\"%)") == nil
end)())

local marketOk, MarketRowSpec = pcall(loadModule, "roblox/src/shared/MarketRowSpec.luau")

check("the market row stays inside its 120-part budget with three real stalls", (function()
	if not marketOk then
		return false
	end
	local parts = MarketRowSpec.parts()
	if #parts > 120 or #parts > MarketRowSpec.BUDGET then
		return false
	end
	-- Three stalls, hanging goods and a bread rack must all actually exist -
	-- an empty spec passing a budget gate would be the classic silent lie.
	local stalls: { [string]: boolean } = {}
	local hasHanging = false
	local hasBreadRack = false
	for _, spec in parts do
		local stall = string.match(spec.name, "^Stall(%d)")
		if stall then
			stalls[stall] = true
		end
		if string.find(spec.name, "Hanging") then
			hasHanging = true
		end
		if string.find(spec.name, "BreadRack") or string.find(spec.name, "RackLoaf") then
			hasBreadRack = true
		end
	end
	return stalls["1"] == true and stalls["2"] == true and stalls["3"] == true
		and hasHanging and hasBreadRack
end)())

check("SettlementBuilder dresses the market street from MarketRowSpec, audited", (function()
	local builder = fs.readFile("roblox/src/server/SettlementBuilder.luau")
	return string.find(builder, "MarketRowSpec%.parts") ~= nil
		and string.find(builder, "MarketRowSpec%.BUDGET") ~= nil
end)())

-- ---- Phase A client wiring (2026-08-29): full recruitment, research,
-- recall and the herald. Each rule fails if the behavior is deleted.

local clientSource = codeOnly(fs.readFile("roblox/src/client/init.client.luau"))
local commandSource = codeOnly(fs.readFile("roblox/src/server/CommandService.luau"))

check("the recruit clamp mirrors the world server's 1..100 bound", (function(): boolean
	-- The store refuses quantities over 100; a bigger Roblox clamp would let
	-- orders be silently shrunk server-side instead of honestly here.
	return string.find(commandSource, "math%.clamp%(math%.floor%(tonumber%(request%.quantity%) or 0%), 1, 100%)") ~= nil
end)())

check("the village tab recruits from the server's troopCatalog, not a preset", (function(): boolean
	-- The three presets left 8 of 11 troops unrecruitable. The catalog is the
	-- server's own cost sheet; a Luau mirror of economy.ts is the drift bug.
	return string.find(clientSource, "troopCatalog") ~= nil
		and string.find(clientSource, 'kind = "recruit", villageId = villageId, troop = troop, quantity = quantity') ~= nil
end)())

check("smithy research is reachable: the client sends it and the service maps it", (function(): boolean
	return string.find(clientSource, '"research"') ~= nil
		and string.find(commandSource, '"kingdom%.research%.queue"') ~= nil
end)())

check("research climbs one rung, read from the kingdom's own level", (function(): boolean
	-- The target level is currentLevel + 1 from OUR snapshot; a client-chosen
	-- target would let it skip rungs the server then has to refuse.
	return string.find(commandSource, "targetLevel = currentLevel %+ 1") ~= nil
end)())

check("recall exists, is armed by a second tap, and maps to march.cancel", (function(): boolean
	return string.find(clientSource, '"marchCancel"') ~= nil
		and string.find(clientSource, "armedRecallId") ~= nil
		and string.find(commandSource, '"march%.cancel"') ~= nil
end)())

check("recall only offers itself for a march this snapshot calls outbound", (function(): boolean
	return string.find(commandSource, 'tostring%(march%.status%) == "outbound"') ~= nil
end)())

check("the herald renders the realm's notifications", (function(): boolean
	-- Every completion / conquest / fallen-Count message was written to the
	-- database and shown to nobody (audit matrix M).
	return string.find(clientSource, "THE HERALD") ~= nil
		and string.find(clientSource, "snapshot%.notifications") ~= nil
end)())

print(string.format("---- %d rules checked, %d failed ----", checks, failures))
if failures > 0 then
	process.exit(1)
end
