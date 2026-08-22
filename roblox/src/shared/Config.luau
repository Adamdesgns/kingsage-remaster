return {
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
	WALL_HALF = 55,
}
