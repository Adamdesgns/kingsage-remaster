--!strict
-- The people of the square, as countable data (slice 4, red-team table:
-- "market row + 4 villagers (commander costume pipeline), one route set
-- hugging street edges, despawn during battle and mourning, mourning
-- floor + cooldown").
--
-- Pure Lua, the PaddockSpec/BattlefieldDressing discipline: Lune audits
-- exactly the parts Studio draws. "Commander costume pipeline" is honoured
-- the honest way a Humanoid-less figure can: the SAME layered-costume
-- language and the SAME wool-and-leather palette CharacterStyle dresses
-- the commander in (its RGB values are copied here as literals, the
-- WorldStyle lock pattern) - on a fixed TWELVE-part frame with a carried
-- prop that explains the walk. THIS is the answer to the stick-villager
-- failure: layered pieces, not peg dolls.
--
-- The mourning rule lives here as a PURE function so the gate can prove
-- it without a screen: a REAL loss (floor), one hour of empty streets, and
-- no re-trigger inside the cooldown - the red team's anti-griefing shape.

local VillagerSpec = {}

VillagerSpec.ARCHETYPES = { "goodwife", "laborer", "baker", "fishmonger" }
VillagerSpec.FRAME_PARTS = 12
VillagerSpec.BUDGET = 150 -- design cap for ten villagers; four spend 60
VillagerSpec.WALK_STUDS_PER_SECOND = 6
VillagerSpec.SLEEP_DISTANCE = 120

VillagerSpec.MOURNING_FLOOR = 5 -- realm-of-power points lost in one step
VillagerSpec.MOURNING_SECONDS = 3600
VillagerSpec.MOURNING_COOLDOWN = 1800

-- CharacterStyle's own cloth (kept in lockstep by eye and by comment - the
-- values are copied so Lune can read them):
local WOOL_HOOD = { 103, 81, 58 }
local WOOL_HOSE = { 76, 69, 57 }
local LEATHER = { 82, 52, 30 }
local LEATHER_LIGHT = { 121, 79, 42 }
-- Village dyes: madder, woad, weld - the cheap colours real wool took.
local MADDER = { 133, 63, 52 }
local WOAD = { 71, 84, 105 }
local WELD = { 143, 121, 62 }
local UNDYED = { 148, 137, 117 }
local LINEN = { 172, 160, 138 }
local SKIN = { 198, 160, 126 }
local BREAD = { 168, 121, 62 }
local FISH = { 132, 141, 138 }

export type PartSpec = {
	name: string,
	sx: number, sy: number, sz: number,
	ox: number, oy: number, oz: number,
	rx: number, ry: number, rz: number,
	r: number, g: number, b: number,
	material: string,
	shape: string,
}

local function part(name: string, sx: number, sy: number, sz: number, ox: number, oy: number, oz: number, colour: { number }, options: { rx: number?, ry: number?, rz: number?, material: string?, shape: string? }?): PartSpec
	local extra = options or {}
	return {
		name = name,
		sx = sx, sy = sy, sz = sz,
		ox = ox, oy = oy, oz = oz,
		rx = extra.rx or 0, ry = extra.ry or 0, rz = extra.rz or 0,
		r = colour[1], g = colour[2], b = colour[3],
		material = extra.material or "Fabric",
		shape = extra.shape or "Block",
	}
end

-- The shared 12-part frame: kirtle/tunic body, an over-layer, collar,
-- head, headwear, two sleeves ending in visible hands (one part each
-- side), skirt-or-hose lower halves, two shoes, belt. Each archetype
-- re-colours and re-proportions the SAME slots - one silhouette language
-- for the whole square, exactly how CharacterStyle layers the commander.
function VillagerSpec.frameSpecs(archetype: string): { PartSpec }
	local dress = if archetype == "goodwife" then MADDER
		elseif archetype == "laborer" then UNDYED
		elseif archetype == "baker" then LINEN
		else WOAD
	local over = if archetype == "goodwife" then WELD
		elseif archetype == "laborer" then LEATHER
		elseif archetype == "baker" then UNDYED
		else LEATHER_LIGHT
	local headwear = if archetype == "goodwife" then LINEN else WOOL_HOOD
	local lower = if archetype == "goodwife" then dress else WOOL_HOSE
	return {
		part("Kirtle", 1.5, 2.0, 0.9, 0, 3.1, 0, dress),
		part("Overlayer", 1.6, 1.2, 1.0, 0, 3.5, 0.02, over), -- surcote/jerkin/apron bib
		part("Apron", 1.2, 1.5, 0.24, 0, 2.4, 0.5, if archetype == "goodwife" then LINEN else over),
		part("Collar", 1.1, 0.35, 0.8, 0, 4.25, 0, headwear),
		part("Head", 0.85, 0.95, 0.85, 0, 4.95, 0, SKIN, { shape = "Ball" }),
		part("Headwear", 0.95, 0.55, 0.95, 0, 5.35, -0.05, headwear), -- kerchief/hood/cap
		part("LeftSleeve", 0.5, 1.7, 0.5, -1.0, 3.35, 0, dress),
		part("RightSleeve", 0.5, 1.7, 0.5, 1.0, 3.35, 0, dress),
		part("LeftLeg", 0.55, 1.8, 0.55, -0.4, 1.15, 0, lower),
		part("RightLeg", 0.55, 1.8, 0.55, 0.4, 1.15, 0, lower),
		part("Shoes", 1.35, 0.35, 0.95, 0, 0.2, 0.1, LEATHER),
		part("Belt", 1.55, 0.3, 0.95, 0, 2.55, 0, LEATHER),
	}
end

-- The prop is the REASON for the walk (red-team answer to "mannequins"):
-- a basket explains a goodwife, a timber bundle a laborer, a bread board
-- a baker, a fish crate a fishmonger. Three parts at most, by design.
function VillagerSpec.propSpecs(archetype: string): { PartSpec }
	if archetype == "goodwife" then
		return {
			part("Basket", 0.9, 0.7, 0.9, -1.35, 2.6, 0, LEATHER_LIGHT, { material = "WoodPlanks" }),
			part("BasketLoad", 0.7, 0.35, 0.7, -1.35, 3.1, 0, WELD),
		}
	elseif archetype == "laborer" then
		return {
			part("TimberBundle", 0.5, 0.5, 2.6, 1.15, 3.9, 0, LEATHER, { material = "WoodPlanks", rz = math.rad(12) }),
		}
	elseif archetype == "baker" then
		return {
			part("BreadBoard", 1.5, 0.15, 0.8, 0, 4.35, 0.85, LEATHER_LIGHT, { material = "WoodPlanks" }),
			part("LoafOne", 0.45, 0.3, 0.6, -0.3, 4.6, 0.85, BREAD),
			part("LoafTwo", 0.45, 0.3, 0.6, 0.3, 4.6, 0.85, BREAD),
		}
	end
	return {
		part("FishCrate", 1.1, 0.6, 0.8, 1.3, 2.6, 0, LEATHER_LIGHT, { material = "WoodPlanks" }),
		part("Fish", 0.9, 0.2, 0.35, 1.3, 3.0, 0, FISH, { material = "SmoothPlastic" }),
	}
end

-- One shared loop on the street SHOULDERS (|x| 10..16 - the road bed runs
-- |x| < 10 and belongs to the player): up the east shoulder from the
-- square to the market front, across, and home down the west shoulder.
-- Ground-truthed against SettlementBuilder's layout (market at x -60
-- z 144, keep at z 20, farm road south) the same way the demo tour pins
-- its waypoints; the rules assert the band so a route edit that drifts
-- into the road fails the gate before it fails a kid's screenshot.
local LOOP: { { x: number, z: number } } = {
	{ x = 12, z = -40 },
	{ x = 12, z = 40 },
	{ x = 14, z = 90 },
	{ x = 12, z = 130 },  -- market corner, east side
	{ x = -12, z = 130 }, -- cross at the market front
	{ x = -14, z = 90 },
	{ x = -12, z = 40 },  -- the square, west side
	{ x = -12, z = -40 }, -- yards end
}

-- Each villager starts a quarter-loop apart, so four people never bunch
-- into a parade. Same loop, different phase - deterministic, no dice.
function VillagerSpec.route(index: number): { { x: number, z: number } }
	local offset = ((math.floor(index) - 1) * 2) % #LOOP
	local route = {}
	for step = 1, #LOOP do
		local slot = ((step - 1 + offset) % #LOOP) + 1
		table.insert(route, { x = LOOP[slot].x, z = LOOP[slot].z })
	end
	return route
end

export type MourningState = {
	lastPower: number,
	mourningUntil: number,
	cooldownUntil: number,
}

function VillagerSpec.newMourningState(power: number): MourningState
	return { lastPower = tonumber(power) or 0, mourningUntil = 0, cooldownUntil = 0 }
end

-- A REAL loss (>= MOURNING_FLOOR in one observed step) empties the square
-- for an hour - and cannot re-trigger inside the cooldown, so a griefer
-- poking a wall every five minutes cannot keep a village indoors forever
-- (red team #5). Direction needs two observations, so a fresh join mid-
-- mourning shows villagers; recorded honestly in the handback.
function VillagerSpec.updateMourning(state: MourningState, powerNow: number?, nowSeconds: number): MourningState
	local power = tonumber(powerNow)
	if power == nil then
		return state
	end
	local next: MourningState = {
		lastPower = power,
		mourningUntil = state.mourningUntil,
		cooldownUntil = state.cooldownUntil,
	}
	local drop = state.lastPower - power
	if drop >= VillagerSpec.MOURNING_FLOOR and nowSeconds >= state.cooldownUntil then
		next.mourningUntil = nowSeconds + VillagerSpec.MOURNING_SECONDS
		next.cooldownUntil = nowSeconds + VillagerSpec.MOURNING_SECONDS + VillagerSpec.MOURNING_COOLDOWN
	end
	return next
end

function VillagerSpec.shouldHide(state: MourningState, battleOpenAtHome: boolean, nowSeconds: number): boolean
	if battleOpenAtHome then
		return true -- the baker's boy does not stroll through a siege
	end
	return nowSeconds < state.mourningUntil
end

return VillagerSpec
