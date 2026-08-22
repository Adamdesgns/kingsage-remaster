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
}
