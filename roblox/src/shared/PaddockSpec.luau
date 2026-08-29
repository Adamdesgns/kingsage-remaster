--!strict
-- The herd, as countable data (slice 3, design 2026-08-23 red-team table:
-- "paddock + grazing horses, display = clamp(herd/12, 0, 8) - zero shows
-- zero. Gate: part audit <=80").
--
-- Pure Lua on purpose, the BattlefieldDressing discipline: Lune runs THIS
-- file to prove the budget analytically, and the client renderer places
-- exactly these specs - so the herd Lune counts is the herd Studio draws.
-- No Roblox APIs, no randomness: every number below is a decision.
--
-- A horse is TEN anchored parts and a silhouette, not a model: barrel,
-- chest, hindquarters, a raked neck, head, muzzle, two leg SLABS (a pair
-- of legs each - four cylinders would read better and cost the budget the
-- design refused to spend), tail and mane. Grey-box-plus: the shape does
-- the work, the palette stays in wool-and-leather range.

local PaddockSpec = {}

PaddockSpec.HORSE_PARTS = 10
PaddockSpec.MAX_DISPLAY = 8
PaddockSpec.BUDGET = 80

-- [Adam-facing truth] Twelve real horses earn one on the grass, capped at
-- eight. Fractions round UP so eleven real horses never read as an empty
-- paddock - but ZERO is ZERO: an empty stable showing horses was exactly
-- the lie the red team struck (their fix of the old clamp(...,2,8)).
function PaddockSpec.displayCount(horses: number?): number
	local herd = tonumber(horses)
	if herd == nil or herd ~= herd or herd <= 0 then
		return 0
	end
	return math.clamp(math.ceil(herd / 12), 0, PaddockSpec.MAX_DISPLAY)
end

export type PartSpec = {
	name: string,
	sx: number, sy: number, sz: number,
	ox: number, oy: number, oz: number,
	rx: number, ry: number, rz: number,
	r: number, g: number, b: number,
	material: string,
	shape: string,
}

-- Coat palette: bay, chestnut, dark bay, black - repeated by index so the
-- herd reads varied without a random roll. Values are plain RGB triples so
-- Lune can read them (the WorldStyle lock pattern from the battlefield).
local COATS: { { number } } = {
	{ 107, 76, 50 },  -- bay
	{ 128, 84, 46 },  -- chestnut
	{ 84, 62, 44 },   -- dark bay
	{ 56, 50, 46 },   -- near-black
}
local MANE = { 43, 37, 32 }
local MUZZLE = { 62, 55, 50 }

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

-- One horse, ten parts, facing +Z (the renderer turns the whole animal).
-- Offsets are from the horse's ground origin; a standing horse is ~7 studs
-- at the withers - livestock scale next to a 5-stud character, not ponycart.
function PaddockSpec.horseSpecs(index: number): { PartSpec }
	local coat = COATS[((math.floor(index) - 1) % #COATS) + 1]
	return {
		part("Barrel", 2.4, 2.6, 4.6, 0, 4.4, 0, coat),
		part("Chest", 2.2, 2.4, 1.6, 0, 4.3, 2.9, coat),
		part("Hindquarters", 2.3, 2.5, 1.7, 0, 4.5, -2.9, coat),
		part("Neck", 1.3, 2.9, 1.5, 0, 6.3, 3.4, coat, { rx = math.rad(-35) }),
		part("Head", 1.1, 1.9, 1.2, 0, 7.7, 4.5, coat, { rx = math.rad(-12) }),
		part("Muzzle", 0.85, 0.9, 0.9, 0, 7.25, 5.15, MUZZLE, { rx = math.rad(-12) }),
		part("ForeLegs", 2.1, 3.1, 0.9, 0, 1.55, 2.7, coat),
		part("HindLegs", 2.2, 3.1, 1.0, 0, 1.55, -2.7, coat),
		part("Tail", 0.5, 2.6, 0.5, 0, 4.6, -4.0, MANE, { rx = math.rad(18) }),
		part("Mane", 0.5, 2.2, 1.3, 0, 6.9, 3.0, MANE, { rx = math.rad(-35) }),
	}
end

-- Three grazing waypoints per horse inside the paddock strip in front of
-- the stable (stable-local: x -14..14, z 14.5..20.5 - between the building
-- face and the existing rails). Derived from the index, no dice: the same
-- horse always walks the same small triangle, offset from its neighbours.
function PaddockSpec.waypoints(index: number): { { x: number, z: number } }
	local slot = ((math.floor(index) - 1) % PaddockSpec.MAX_DISPLAY)
	local baseX = -12.25 + (slot % 4) * 7
	local baseZ = if slot < 4 then 15.5 else 18.5
	local sway = if slot % 2 == 0 then 1.75 else -1.75
	return {
		{ x = baseX, z = baseZ },
		{ x = baseX + sway, z = math.clamp(baseZ + 1.5, 14.5, 20.5) },
		{ x = baseX - sway * 0.6, z = math.clamp(baseZ + 0.4, 14.5, 20.5) },
	}
end

return PaddockSpec
