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

print(string.format("---- %d rules checked, %d failed ----", checks, failures))
if failures > 0 then
	process.exit(1)
end
