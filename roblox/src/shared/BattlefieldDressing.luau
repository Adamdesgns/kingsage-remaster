--!strict
-- Analytic battlefield dressing for week 2.1. PURE on purpose: Lune's
-- rules-check runs this without Roblox APIs, the same way Config.groundTiles
-- proves the region floor. BattleScene is the only consumer that turns these
-- specs into parts — this file never creates instances, scripts, or Humanoids.
--
-- Palette RGB values are the WorldStyle.PALETTE numbers. They live here as
-- triples so this module stays runnable under Lune; rules-check locks them to
-- WorldStyle so the two cannot drift.
local BattlefieldDressing = {}

BattlefieldDressing.BUDGET = {
	GROUND = 120,
	BANNERS = 9,
	COMBINED = 129,
}

BattlefieldDressing.SQUAD_IDS = { "vanguard", "archers", "riders" }

-- Fight corridor the dressing must not occupy with trees or rocks. Matches
-- BattleConfig.FIELD_WIDTH/DEPTH plus a phone-readability margin.
BattlefieldDressing.FIGHT_HALF_X = 66
BattlefieldDressing.FIGHT_HALF_Z = 48
BattlefieldDressing.EDGE_X = 72
BattlefieldDressing.EDGE_Z = 58

export type PartSpec = {
	name: string,
	group: string,
	kind: string,
	squadId: string,
	tint: string,
	className: string,
	anchored: boolean,
	canCollide: boolean,
	sx: number,
	sy: number,
	sz: number,
	ox: number,
	oy: number,
	oz: number,
	rx: number,
	ry: number,
	rz: number,
	r: number,
	g: number,
	b: number,
	material: string,
	shape: string,
}

local function spec(fields: any): PartSpec
	return {
		name = fields.name,
		group = fields.group or "ground",
		kind = fields.kind,
		squadId = fields.squadId or "",
		tint = fields.tint or "",
		className = "Part",
		anchored = true,
		canCollide = false,
		sx = fields.sx,
		sy = fields.sy,
		sz = fields.sz,
		ox = fields.ox,
		oy = fields.oy,
		oz = fields.oz,
		rx = fields.rx or 0,
		ry = fields.ry or 0,
		rz = fields.rz or 0,
		r = fields.r or 0,
		g = fields.g or 0,
		b = fields.b or 0,
		material = fields.material or "SmoothPlastic",
		shape = fields.shape or "Block",
	}
end

-- WorldStyle.PALETTE, as numbers.
local GRASS = { 104, 130, 74 }
local DIRT = { 126, 104, 78 }
local PATH_EDGE = { 108, 92, 72 }
local COBBLE = { 170, 158, 136 }
local COBBLE_DARK = { 112, 102, 88 }
local MOSS = { 78, 101, 58 }
local FOLIAGE = { 67, 104, 55 }
local TIMBER = { 92, 66, 44 }
local STONE = { 168, 160, 146 }
local STONE_DARK = { 122, 116, 106 }
local STONE_WARM = { 186, 172, 148 }
local GOLD = { 204, 164, 82 }

local function rgb(colour: { number }): (number, number, number)
	return colour[1], colour[2], colour[3]
end

local function groundSpecs(): { PartSpec }
	local parts: { PartSpec } = {}
	local function add(fields: any)
		table.insert(parts, spec(fields))
	end

	-- The field plate. Replaces BattleScene's old single grey-green slab.
	local plateW = 200 -- FIELD_WIDTH 120 + 80 pad
	local plateD = 170 -- FIELD_DEPTH 90 + 80 pad
	local r, g, b = rgb(GRASS)
	add({
		name = "GrassField",
		kind = "grass",
		sx = plateW, sy = 1, sz = plateD,
		ox = 0, oy = -0.5, oz = 0,
		r = r, g = g, b = b,
		material = "Grass",
	})

	-- Cobble road toward the defender gate (−Z). Flat, so it never occludes.
	r, g, b = rgb(COBBLE)
	add({
		name = "ApproachRoad",
		kind = "road",
		sx = 18, sy = 0.34, sz = 142,
		ox = 0, oy = 0.18, oz = -4,
		r = r, g = g, b = b,
		material = "Cobblestone",
	})

	r, g, b = rgb(PATH_EDGE)
	add({
		name = "RoadShoulderWest",
		kind = "dirt",
		sx = 5.2, sy = 0.28, sz = 142,
		ox = -11.6, oy = 0.14, oz = -4,
		r = r, g = g, b = b,
		material = "Ground",
	})
	add({
		name = "RoadShoulderEast",
		kind = "dirt",
		sx = 5.2, sy = 0.28, sz = 142,
		ox = 11.6, oy = 0.14, oz = -4,
		r = r, g = g, b = b,
		material = "Ground",
	})

	-- Wear marks on the cobble — same language as the settlement streetscape.
	r, g, b = rgb(DIRT)
	for index, patch in {
		{ -2.4, 48, 7, 16, -8 },
		{ 2.1, 22, 6, 14, 11 },
		{ -1.6, -4, 7, 15, -6 },
		{ 1.8, -28, 6, 13, 9 },
		{ -2.0, -52, 7, 16, -12 },
		{ 2.4, 68, 6, 12, 7 },
	} do
		add({
			name = "RoadWear" .. index,
			kind = "road",
			sx = 0.12, sy = patch[3], sz = patch[4],
			ox = patch[1], oy = 0.38, oz = patch[2],
			ry = math.rad(patch[5]),
			rz = math.rad(90),
			r = r, g = g, b = b,
			material = "Ground",
			shape = "Cylinder",
		})
	end

	r, g, b = rgb(COBBLE_DARK)
	for index, patch in {
		{ -3.2, -62, 14, 0.22, 9, 18 },
		{ 3.4, -58, 12, 0.22, 8, -16 },
		{ 0.4, -70, 16, 0.24, 11, 6 },
	} do
		add({
			name = "GateCobble" .. index,
			kind = "road",
			sx = patch[3], sy = patch[4], sz = patch[5],
			ox = patch[1], oy = 0.28, oz = patch[2],
			ry = math.rad(patch[6]),
			r = r, g = g, b = b,
			material = "Cobblestone",
		})
	end

	-- Wider cobble flare where the road meets the defender gate.
	r, g, b = rgb(COBBLE)
	add({
		name = "RoadGateFlare",
		kind = "road",
		sx = 26, sy = 0.32, sz = 16,
		ox = 0, oy = 0.2, oz = -68,
		r = r, g = g, b = b,
		material = "Cobblestone",
	})

	r, g, b = rgb(DIRT)
	add({
		name = "EdgeDirtWest",
		kind = "dirt",
		sx = 28, sy = 0.4, sz = 156,
		ox = -86, oy = 0.12, oz = 0,
		r = r, g = g, b = b,
		material = "Ground",
	})
	add({
		name = "EdgeDirtEast",
		kind = "dirt",
		sx = 28, sy = 0.4, sz = 156,
		ox = 86, oy = 0.12, oz = 0,
		r = r, g = g, b = b,
		material = "Ground",
	})
	add({
		name = "EdgeDirtRear",
		kind = "dirt",
		sx = 148, sy = 0.36, sz = 18,
		ox = 0, oy = 0.1, oz = 78,
		r = r, g = g, b = b,
		material = "Ground",
	})

	r, g, b = rgb(MOSS)
	add({
		name = "EdgeMossWest",
		kind = "grass",
		sx = 16, sy = 0.3, sz = 120,
		ox = -74, oy = 0.08, oz = -8,
		r = r, g = g, b = b,
		material = "Grass",
	})
	add({
		name = "EdgeMossEast",
		kind = "grass",
		sx = 16, sy = 0.3, sz = 120,
		ox = 74, oy = 0.08, oz = -8,
		r = r, g = g, b = b,
		material = "Grass",
	})

	-- A handful of trees: modest roadside scale, field EDGES only. Three parts
	-- each (trunk + two canopy balls), never in the fight corridor.
	local function addTree(id: number, x: number, z: number, scale: number)
		local trunkH = 8.2 * scale
		local tr, tg, tb = rgb(TIMBER)
		add({
			name = string.format("EdgeTreeTrunk%02d", id),
			kind = "tree",
			sx = 1.55 * scale, sy = trunkH, sz = 1.55 * scale,
			ox = x, oy = trunkH / 2, oz = z,
			r = tr, g = tg, b = tb,
			material = "WoodPlanks",
		})
		local fr, fg, fb = rgb(FOLIAGE)
		add({
			name = string.format("EdgeTreeCanopy%02d", id),
			kind = "tree",
			sx = 7.4 * scale, sy = 5.1 * scale, sz = 7.4 * scale,
			ox = x, oy = trunkH + 1.5 * scale, oz = z,
			r = fr, g = fg, b = fb,
			material = "Grass",
			shape = "Ball",
		})
		local mr, mg, mb = rgb(MOSS)
		add({
			name = string.format("EdgeTreeCanopyHigh%02d", id),
			kind = "tree",
			sx = 5.1 * scale, sy = 3.7 * scale, sz = 5.1 * scale,
			ox = x, oy = trunkH + 4.2 * scale, oz = z,
			r = mr, g = mg, b = mb,
			material = "Grass",
			shape = "Ball",
		})
		add({
			name = string.format("EdgeTreeMoss%02d", id),
			kind = "grass",
			sx = 4.4 * scale, sy = 0.22, sz = 4.4 * scale,
			ox = x, oy = 0.12, oz = z,
			r = mr, g = mg, b = mb,
			material = "Grass",
			shape = "Cylinder",
			rz = math.rad(90),
		})
	end

	-- Camera looks from +Z; keep trees on the SIDES and the gate (−Z) half so
	-- they never sit between a phone camera and the fight.
	addTree(1, -82, -70, 1.05)
	addTree(2, 84, -74, 0.96)
	addTree(3, -86, -30, 1.12)
	addTree(4, 88, -24, 0.92)
	addTree(5, -84, 8, 1.0)
	addTree(6, 86, 14, 1.08)

	local function addRock(id: number, x: number, z: number, sx: number, sy: number, sz: number, yaw: number, colour: { number }, shape: string)
		local rr, rg, rb = rgb(colour)
		add({
			name = string.format("EdgeRock%02d", id),
			kind = "rock",
			sx = sx, sy = sy, sz = sz,
			ox = x, oy = sy / 2, oz = z,
			ry = math.rad(yaw),
			r = rr, g = rg, b = rb,
			material = "Slate",
			shape = shape,
		})
	end

	addRock(1, -78, -54, 3.4, 1.8, 2.6, 18, STONE_DARK, "Block")
	addRock(2, -80, -50, 1.8, 1.2, 1.6, -22, STONE, "Ball")
	addRock(3, 80, -58, 3.8, 2.0, 2.8, -14, STONE_WARM, "Block")
	addRock(4, 83, -54, 1.6, 1.1, 1.5, 30, STONE_DARK, "Ball")
	addRock(5, -90, -8, 2.8, 1.6, 2.2, 8, STONE, "Block")
	addRock(6, 91, 4, 3.1, 1.7, 2.4, -26, STONE_DARK, "Block")
	addRock(7, -76, 62, 2.6, 1.4, 2.0, 12, STONE_WARM, "Block")
	addRock(8, 78, 66, 2.4, 1.3, 2.1, -18, STONE, "Ball")
	addRock(9, -88, 38, 1.9, 1.1, 1.7, 40, STONE_DARK, "Ball")
	addRock(10, 89, -40, 2.2, 1.5, 1.8, -8, STONE, "Block")
	addRock(11, -92, -66, 2.0, 1.2, 1.6, 24, STONE_WARM, "Block")
	addRock(12, 93, 48, 1.7, 1.0, 1.5, -32, STONE_DARK, "Ball")

	r, g, b = rgb(GRASS)
	for index, tuft in {
		{ -72, -44, 3.2 },
		{ 73, -48, 2.8 },
		{ -75, 22, 3.0 },
		{ 76, 28, 2.6 },
		{ -70, 70, 3.4 },
		{ 71, 72, 2.9 },
	} do
		add({
			name = "EdgeGrassTuft" .. index,
			kind = "grass",
			sx = tuft[3], sy = 0.55, sz = tuft[3],
			ox = tuft[1], oy = 0.28, oz = tuft[2],
			r = r, g = g, b = b,
			material = "Grass",
			shape = "Ball",
		})
	end

	return parts
end

local cachedGround: { PartSpec }? = nil

function BattlefieldDressing.groundSpecs(): { PartSpec }
	if not cachedGround then
		cachedGround = groundSpecs()
	end
	return cachedGround
end

function BattlefieldDressing.bannerSpecsForSquad(squadId: string): { PartSpec }
	local pole = spec({
		name = squadId .. "BannerPole",
		group = "banner",
		kind = "banner",
		squadId = squadId,
		sx = 11, sy = 0.32, sz = 0.32,
		ox = 0, oy = 5.5, oz = 0,
		rz = math.rad(90),
		r = TIMBER[1], g = TIMBER[2], b = TIMBER[3],
		material = "WoodPlanks",
		shape = "Cylinder",
	})
	local cloth = spec({
		name = squadId .. "BannerCloth",
		group = "banner",
		kind = "banner",
		squadId = squadId,
		tint = "squad",
		sx = 4.2, sy = 5.0, sz = 0.18,
		ox = 2.15, oy = 8.05, oz = 0,
		r = 150, g = 44, b = 44,
		material = "Fabric",
	})
	local finial = spec({
		name = squadId .. "BannerFinial",
		group = "banner",
		kind = "banner",
		squadId = squadId,
		sx = 0.55, sy = 0.55, sz = 0.55,
		ox = 0, oy = 11.15, oz = 0,
		r = GOLD[1], g = GOLD[2], b = GOLD[3],
		material = "Metal",
		shape = "Ball",
	})
	return { pole, cloth, finial }
end

function BattlefieldDressing.allBannerSpecs(): { PartSpec }
	local parts: { PartSpec } = {}
	for _, squadId in BattlefieldDressing.SQUAD_IDS do
		for _, part in BattlefieldDressing.bannerSpecsForSquad(squadId) do
			table.insert(parts, part)
		end
	end
	return parts
end

function BattlefieldDressing.counts(): (number, number, number)
	local ground = #BattlefieldDressing.groundSpecs()
	local banners = #BattlefieldDressing.allBannerSpecs()
	return ground, banners, ground + banners
end

--- True when a tree/rock spec sits outside the fight corridor.
function BattlefieldDressing.isEdgeProp(part: PartSpec): boolean
	return math.abs(part.ox) >= BattlefieldDressing.EDGE_X
		or math.abs(part.oz) >= BattlefieldDressing.EDGE_Z
end

return BattlefieldDressing
