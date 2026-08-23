local Config = {
	API_BASE = "http://127.0.0.1:4178",
	HEARTBEAT_SECONDS = 10,
	CONTRACT_VERSION = 1,
	SESSION_RETRY_SECONDS = { 2, 4, 8, 15, 30 },

	-- World-map tile → studs. SettlementBuilder places every village at
	-- (x * TILE_STUDS, 0, y * TILE_STUDS); the battle scene has to land on the
	-- same ground, so this lives here rather than as a local in either file.
	TILE_STUDS = 220,
	-- Half the width of a settlement's wall ring. The battlefield forms up
	-- outside the gate, which is on the +Z face.
	-- Half the width of a settlement's wall ring.
	--
	-- [Adam, 2026-08-23] "That settlement is also 1/10th the size it should be."
	-- He was right: at 55 the whole town was 110 studs across - smaller than a
	-- house, and every building was touching its neighbour, which is why they
	-- read as a stack of boxes rather than a place.
	--
	-- Safe at this size because `selectCapitalSites` guarantees settlements are at
	-- least 8 tiles apart, which is 1,760 studs - so a 1,100-stud town still has
	-- open country between it and the next one.
	WALL_HALF = 550,

	-- The conquest celebration (spec §5: big, skippable, non-blocking). Every
	-- number here is a HARD cap, not a target: the spectacle must never be the
	-- reason a phone drops frames, and it decides nothing either way.
	CELEBRATION = {
		DURATION = 8,
		SHELLS = 12,
		SHELL_INTERVAL = 0.45,
		SPARKS_PER_SHELL = 16,
		COINS = 36,
		-- Ceiling across fireworks AND coins together. Reached, the show
		-- simply stops spawning rather than degrading the frame.
		MAX_PARTS = 260,
	},

	-- ROBLOX'S HARD LIMIT ON A SINGLE PART. Ask for more on any axis and the
	-- engine refuses: the part simply never appears.
	--
	-- This cost the project its entire ground plane and nobody noticed for two
	-- days. `RegionGround` was built as ONE part spanning every settlement -
	-- 9,540 x 7,780 studs with ten settlements - so it was never created at all.
	-- The region has been a void with village plates and floating trees since
	-- the day it shipped, and Adam's first sight of it was a settlement hanging
	-- in blue sky.
	--
	-- Nothing errored. The build "succeeded" and printed a tree count.
	MAX_PART_STUDS = 2048,
}

--- Split a rectangle into ground tiles no larger than Roblox will accept.
---
--- Returns { cx, cz, sx, sz } per tile: centre and size on X/Z. Tiles butt up
--- against each other exactly, so a walker never finds a seam to fall through,
--- and the union covers the requested rectangle precisely - no more, no less.
---
--- Pure, so `rules-check.luau` can execute it and assert both properties
--- without a running game.
function Config.groundTiles(minX: number, maxX: number, minZ: number, maxZ: number)
	local tiles = {}
	local spanX, spanZ = maxX - minX, maxZ - minZ
	if spanX <= 0 or spanZ <= 0 then
		return tiles
	end

	-- Stay comfortably inside the limit rather than exactly on it.
	local step = Config.MAX_PART_STUDS - 48
	local countX = math.max(1, math.ceil(spanX / step))
	local countZ = math.max(1, math.ceil(spanZ / step))
	-- Divide evenly instead of leaving a thin offcut on the far edge.
	local sizeX, sizeZ = spanX / countX, spanZ / countZ

	for ix = 0, countX - 1 do
		for iz = 0, countZ - 1 do
			table.insert(tiles, {
				cx = minX + sizeX * (ix + 0.5),
				cz = minZ + sizeZ * (iz + 0.5),
				sx = sizeX,
				sz = sizeZ,
			})
		end
	end
	return tiles
end

return Config
