--!strict
-- The dressed market street (slice 4): three stalls with awnings, tables,
-- crates and produce, a bar of hanging goods, and a bread rack - static
-- parts, counted here so Lune audits the same row SettlementBuilder
-- builds. Budget from the design: <=120; this spec spends well under it
-- because a street reads dressed at forty-odd parts and every extra part
-- bills a phone.
--
-- Coordinates are market-building-local (the same root decorateBuilding
-- uses): +z runs toward the street, front of the building sits at
-- z = d/2 + 7 = 25 for the 36-deep market hall.

local MarketRowSpec = {}

MarketRowSpec.BUDGET = 120

local TIMBER = { 92, 66, 44 }
local TIMBER_LIGHT = { 122, 92, 62 }
local AWNING_RED = { 133, 63, 52 }
local AWNING_STRIPE = { 172, 160, 138 }
local AWNING_WOAD = { 71, 84, 105 }
local PRODUCE_GREEN = { 96, 118, 58 }
local PRODUCE_ROOT = { 158, 116, 62 }
local PRODUCE_PLUM = { 96, 62, 84 }
local BREAD = { 168, 121, 62 }
local FISH = { 132, 141, 138 }
local CLOTH = { 143, 121, 62 }

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
		material = extra.material or "WoodPlanks",
		shape = extra.shape or "Block",
	}
end

local function stall(index: number, centerX: number, awning: { number }, produceA: { number }, produceB: { number }): { PartSpec }
	local prefix = "Stall" .. tostring(index)
	return {
		part(prefix .. "PostLeft", 0.8, 7.5, 0.8, centerX - 5, 3.75, 30, TIMBER),
		part(prefix .. "PostRight", 0.8, 7.5, 0.8, centerX + 5, 3.75, 30, TIMBER),
		part(prefix .. "Awning", 11.5, 0.5, 7, centerX, 7.6, 27.4, awning, { material = "Fabric", rx = math.rad(-12) }),
		part(prefix .. "Table", 10, 0.8, 4.5, centerX, 3.1, 28.5, TIMBER_LIGHT),
		part(prefix .. "TableSkirt", 10, 2.4, 0.4, centerX, 1.7, 30.6, CLOTH, { material = "Fabric" }),
		part(prefix .. "CrateA", 2.6, 2.6, 2.6, centerX - 3.4, 1.3, 25.4, TIMBER_LIGHT),
		part(prefix .. "CrateB", 2.2, 2.2, 2.2, centerX + 3.6, 1.1, 25.6, TIMBER_LIGHT),
		part(prefix .. "ProduceHeap", 3.4, 1.1, 2.2, centerX - 2.2, 3.9, 28.4, produceA),
		part(prefix .. "ProduceBasket", 2.6, 1.0, 2.0, centerX + 2.4, 3.9, 28.6, produceB),
	}
end

function MarketRowSpec.parts(): { PartSpec }
	local row: { PartSpec } = {}
	-- Greengrocer, root-seller, fishmonger's stand: same bones, different
	-- awning dye and different goods, so the row reads as three trades.
	for _, spec in stall(1, -14, AWNING_RED, PRODUCE_GREEN, PRODUCE_ROOT) do
		table.insert(row, spec)
	end
	for _, spec in stall(2, 0, AWNING_STRIPE, PRODUCE_ROOT, PRODUCE_PLUM) do
		table.insert(row, spec)
	end
	for _, spec in stall(3, 14, AWNING_WOAD, FISH, PRODUCE_GREEN) do
		table.insert(row, spec)
	end
	-- Hanging goods on a bar between the first two stalls.
	table.insert(row, part("HangingBar", 8, 0.4, 0.4, -7, 6.9, 30.2, TIMBER))
	table.insert(row, part("HangingSausages", 0.7, 1.8, 0.7, -9.5, 5.9, 30.2, AWNING_RED, { material = "Fabric" }))
	table.insert(row, part("HangingCloth", 1.6, 2.2, 0.3, -7, 5.7, 30.2, AWNING_WOAD, { material = "Fabric" }))
	table.insert(row, part("HangingFish", 0.6, 1.6, 0.4, -4.5, 6.0, 30.2, FISH, { material = "SmoothPlastic" }))
	-- The baker's rack anchors the east end of the row.
	table.insert(row, part("BreadRackFrame", 5, 6, 1.2, 21, 3, 27, TIMBER))
	table.insert(row, part("BreadRackShelfLow", 4.6, 0.4, 2, 21, 2.2, 27.4, TIMBER_LIGHT))
	table.insert(row, part("BreadRackShelfHigh", 4.6, 0.4, 2, 21, 4.2, 27.4, TIMBER_LIGHT))
	table.insert(row, part("RackLoafOne", 1.1, 0.7, 1.6, 20, 2.75, 27.4, BREAD, { material = "Fabric" }))
	table.insert(row, part("RackLoafTwo", 1.1, 0.7, 1.6, 22, 2.75, 27.4, BREAD, { material = "Fabric" }))
	table.insert(row, part("RackLoafThree", 1.1, 0.7, 1.6, 21, 4.75, 27.4, BREAD, { material = "Fabric" }))
	return row
end

return MarketRowSpec
