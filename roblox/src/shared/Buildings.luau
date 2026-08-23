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
	"militia", "spear", "sword", "axe", "archer", "scout",
	"lightCavalry", "heavyCavalry", "ram", "trebuchet", "noble",
}

-- KingsAge's own unit names. Only the name "KingsAge" is off limits; "Templar",
-- "Berserker", "Crusader" and the rest are common medieval terms.
Buildings.TROOP_NAMES = {
	militia = "Farmer's Militia",
	spear = "Squires",
	sword = "Templars",
	axe = "Berserkers",
	archer = "Long-bows",
	scout = "Spies",
	lightCavalry = "Crusaders",
	heavyCavalry = "Black Knights",
	ram = "Battering Rams",
	trebuchet = "Trebuchets",
	noble = "Counts",
} :: { [string]: string }

-- The one recruit action slice one exposes. Display label and dispatched
-- command MUST come from this table together, so the button can never lie
-- about what it charges.
Buildings.RECRUIT_PRESET = {
	troop = "spear",
	quantity = 5,
	label = "Recruit 5 Squires",
}

-- Same discipline for the scouting slice: one preset, label bound to payload.
-- Spies train at the Barracks like everything else (Adam's ruling) but need a
-- Stable STANDING (game-core: TROOPS.scout.requires.stable = 1); the world
-- server refuses and says so if it is missing.
Buildings.SCOUT_PRESET = {
	troop = "scout",
	quantity = 2,
	label = "Recruit 2 Spies",
}

-- How many scouts one dispatch sends. A scout march may contain scouts ONLY
-- (server rule), so this is the whole army for that command.
Buildings.SCOUT_PARTY = 1

-- Third preset, same discipline: the label and the payload come from one
-- table, so the button can never lie about what it charges. Noblemen need an
-- Academy (game-core: TROOPS.noble.recruiter = "academy", recruiterLevel 1)
-- and cost 2800/3000/3500 — one at a time is the only honest button.
Buildings.NOBLE_PRESET = {
	troop = "noble",
	quantity = 1,
	label = "Recruit 1 Nobleman",
}

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

-- Troops an attack muster ALWAYS leaves at home. Scouts cannot fight
-- (attack 0) and belong to reconnaissance, so no attack ever takes them.
Buildings.ATTACK_MUSTER_EXCLUDES = {
	scout = true,
}

-- Noblemen are the conquest piece and nothing else. They cost a fortune, only
-- a SURVIVOR can shake a village's loyalty, and one is consumed outright when
-- it falls (world server: applyConquest). So they never ride on an ordinary
-- raid — only on an attack the player has explicitly declared a conquest.
Buildings.CONQUEST_ONLY = {
	noble = true,
}

-- The ONE rule for what marches on an attack. CommandService builds the army
-- from it and the war table counts with it, so the number on the button can
-- never disagree with the army that actually leaves.
function Buildings.mustersOnAttack(troop: string, withNobles: boolean?): boolean
	if Buildings.ATTACK_MUSTER_EXCLUDES[troop] then
		return false
	end
	if Buildings.CONQUEST_ONLY[troop] then
		return withNobles == true
	end
	return true
end

-- Builds the army an attack actually sends, from a village's army table.
-- This lives in SHARED on purpose: the Roblox server dispatches this exact
-- table to the world server, and the war table shows a count derived from the
-- same call. Mirrored copies of this rule are how a button ends up promising
-- one army while another one marches.
--
-- Returns (army, fighting, nobles). `fighting` deliberately excludes noblemen,
-- so "no fighting troops here" keeps meaning what it says even on a conquest.
function Buildings.musterFrom(army: { [string]: any }?, withNobles: boolean?): ({ [string]: number }, number, number)
	local muster: { [string]: number } = {}
	local fighting = 0
	local nobles = 0
	for _, troop in Buildings.TROOP_ORDER do
		local count = 0
		if Buildings.mustersOnAttack(troop, withNobles) then
			count = math.max(math.floor(tonumber(army and army[troop]) or 0), 0)
		end
		muster[troop] = count
		if Buildings.CONQUEST_ONLY[troop] then
			nobles += count
		else
			fighting += count
		end
	end
	return muster, fighting, nobles
end

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
