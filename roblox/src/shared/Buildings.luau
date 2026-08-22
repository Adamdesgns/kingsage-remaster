--!strict
-- Single Roblox-side source for building/troop identity and display.
-- ORDER and NAMES mirror packages/game-core/src/economy.ts (BUILDING_ORDER,
-- BUILDINGS[..].name) — if game-core changes, change HERE, nowhere else.
-- Consumed by SettlementBuilder (server), the war-table panel + HUD (client),
-- and CommandService (recruit preset).
local Buildings = {}

Buildings.ORDER = {
	"hq", "timber", "quarry", "iron", "farm", "warehouse", "barracks",
	"wall", "smithy", "stable", "workshop", "academy", "market",
}

Buildings.NAMES = {
	hq = "Headquarters",
	timber = "Timber Camp",
	quarry = "Stone Quarry",
	iron = "Iron Mine",
	farm = "Farm",
	warehouse = "Warehouse",
	barracks = "Barracks",
	wall = "Rampart",
	smithy = "Smithy",
	stable = "Stable",
	workshop = "Workshop",
	academy = "Academy",
	market = "Market",
} :: { [string]: string }

-- Mirrors game-core's TROOP_ORDER (economy.ts). Scout reports and any other
-- army display walk this, so every list of troops reads the same way.
Buildings.TROOP_ORDER = {
	"spear", "sword", "axe", "archer", "scout", "lightCavalry", "ram", "noble",
}

Buildings.TROOP_NAMES = {
	spear = "Spearmen",
	sword = "Swordsmen",
	axe = "Axemen",
	archer = "Archers",
	scout = "Scouts",
	lightCavalry = "Light Cavalry",
	ram = "Rams",
	noble = "Nobles",
} :: { [string]: string }

-- The one recruit action slice one exposes. Display label and dispatched
-- command MUST come from this table together, so the button can never lie
-- about what it charges.
Buildings.RECRUIT_PRESET = {
	troop = "spear",
	quantity = 5,
	label = "Recruit 5 Spearmen",
}

-- Same discipline for the scouting slice: one preset, label bound to payload.
-- Scouts need a Stable (game-core: TROOPS.scout.recruiter = "stable",
-- recruiterLevel 1); the world server refuses and says so if it is missing.
Buildings.SCOUT_PRESET = {
	troop = "scout",
	quantity = 2,
	label = "Recruit 2 Scouts",
}

-- How many scouts one dispatch sends. A scout march may contain scouts ONLY
-- (server rule), so this is the whole army for that command.
Buildings.SCOUT_PARTY = 1

-- The four axes of an attack plan. Values MUST match game-core's BattlePlan
-- exactly (contracts.ts) — the world server refuses anything else, and the
-- client should never be able to compose an order the realm cannot read.
-- Order of options is the order the tap-to-cycle button walks them.
Buildings.ATTACK_PLAN_AXES = {
	{ key = "entry", label = "Approach", options = { "West Ridge", "Main Breach", "East Woods" } },
	{ key = "troops", label = "Formation", options = { "Vanguard Heavy", "Balanced Army", "Cavalry Wing" } },
	{ key = "time", label = "Timing", options = { "Dawn", "Midday", "Night" } },
	{ key = "style", label = "Style", options = { "Siege Push", "Flanking Strike", "Full Assault" } },
}

-- Troops an attack muster deliberately leaves at home. Scouts cannot fight
-- (attack 0) and belong to reconnaissance; noblemen are the conquest piece and
-- cost a fortune, so slice A never risks one on an ordinary raid.
Buildings.ATTACK_MUSTER_EXCLUDES = {
	scout = true,
	noble = true,
}

function Buildings.defaultAttackPlan(): { [string]: string }
	local plan = {}
	for _, axis in Buildings.ATTACK_PLAN_AXES do
		plan[axis.key] = axis.options[1]
	end
	return plan
end

function Buildings.displayName(building: string): string
	return Buildings.NAMES[building] or building
end

function Buildings.troopName(troop: string): string
	return Buildings.TROOP_NAMES[troop] or troop
end

return Buildings
