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

print(string.format("---- %d rules checked, %d failed ----", checks, failures))
if failures > 0 then
	process.exit(1)
end
