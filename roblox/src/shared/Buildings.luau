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

function Buildings.displayName(building: string): string
	return Buildings.NAMES[building] or building
end

function Buildings.troopName(troop: string): string
	return Buildings.TROOP_NAMES[troop] or troop
end

return Buildings
