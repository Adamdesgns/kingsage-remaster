--!strict
-- Every number the battle scene renders by. Spec §5 asks for "a couple hundred
-- bot troops fighting on screen", and the 200-troop spike has still never been
-- MEASURED on a phone — so nothing here is a measured value, and the scene is
-- built to survive that.
--
-- Two rules make the missing measurement safe:
--   1. NOTHING here can change an outcome. The world server's Gate D maths is
--      the authority; this file only decides how many bodies draw the movie.
--      Rendering fewer soldiers changes the picture, never the result.
--   2. The budget is ADAPTIVE. The scene starts at MAX_SOLDIERS, watches its
--      own frame time, and culls rendered bodies until it holds TARGET_FPS.
--      When the phone measurement finally happens it sets MAX_SOLDIERS and
--      confirms the floor; until then the device tunes itself down instead of
--      stuttering.
local BattleConfig = {}

-- Ceiling on rendered soldiers across BOTH armies. The spike's shape (six
-- anchored parts each, one BulkMoveTo per frame, no Humanoids) is what this
-- number is denominated in.
BattleConfig.MAX_SOLDIERS = 200

-- Never cull below this: under it the fight stops reading as an army and the
-- scene is no longer worth showing. If a device cannot hold TARGET_FPS here,
-- that is a finding to record in spike-200-troops.md, not a number to lower.
BattleConfig.MIN_SOLDIERS = 40

-- The adaptive loop. Frame time is sampled over SAMPLE_WINDOW seconds; if the
-- average sits worse than TARGET_FPS the rendered population drops by
-- CULL_STEP, no more often than once per SAMPLE_WINDOW.
BattleConfig.TARGET_FPS = 30
BattleConfig.SAMPLE_WINDOW = 2
BattleConfig.CULL_STEP = 20

-- Soldier build (mirrors roblox/spike — the only shape proven to move in bulk)
BattleConfig.SOLDIER_PARTS = 6
BattleConfig.WALK_SPEED = 7 -- studs/second
BattleConfig.ENGAGE_DISTANCE = 5
BattleConfig.SWING_PERIOD = 0.4
BattleConfig.FALL_SECONDS = 1.2
BattleConfig.ROUT_SPEED = 12

-- The three squads a player can actually give orders to. These keys ARE the
-- world server's CommandSquadId values (contracts.ts) — a fourth name here
-- would be an order the realm refuses. Each squad claims the troop types
-- listed; anything unlisted marches with the vanguard.
-- The three squads ARE the three combat classes (combat.ts `combatClass`).
-- They were chosen in slice B to match the server's CommandSquadId vocabulary
-- and turned out to map one-to-one onto infantry / archer / cavalry, so they
-- stopped being cosmetic. The Count is INFANTRY and rides with the vanguard
-- despite the name; the Spy is CAVALRY. Both are the official assignment, not
-- an aesthetic call - see combat.ts.
BattleConfig.SQUADS = {
	{ id = "vanguard", label = "Vanguard", troops = { "militia", "spear", "sword", "axe", "ram", "trebuchet", "noble" }, color = Color3.fromRGB(150, 60, 55) },
	{ id = "archers", label = "Archers", troops = { "archer" }, color = Color3.fromRGB(150, 120, 55) },
	{ id = "riders", label = "Riders", troops = { "scout", "lightCavalry", "heavyCavalry" }, color = Color3.fromRGB(120, 70, 140) },
}

-- Spec §5 wants "~10–20 squads" making decisions. Three ORDERABLE squads keep
-- the command vocabulary honest (they are the only names the server accepts),
-- and each one splits into up to this many blocks on the field, which is what
-- puts a dozen-odd moving formations on screen.
BattleConfig.BLOCKS_PER_SQUAD = 3
BattleConfig.SOLDIERS_PER_BLOCK_MIN = 6

-- Battlefield geometry, laid out in front of the defender's gate.
BattleConfig.FIELD_DEPTH = 90 -- studs between the two start lines
BattleConfig.FIELD_WIDTH = 120
BattleConfig.RANK_SPACING = 3.2
BattleConfig.FILE_SPACING = 3.6

-- Order coordinates are sent to the world server in a 0–5000 space (it
-- validates that range). The field maps onto the middle of it so an order can
-- never be refused for being out of bounds.
BattleConfig.ORDER_SPACE = 5000

-- The most field orders one battle accepts. Mirrors game-core's
-- BATTLE_ORDER_CAP; roster-parity reads this line as text, so a drifted
-- number fails npm run test:server. The server stays authoritative — this
-- exists so the client can refuse order six with a sentence instead of a
-- round trip, and show "Orders left".
BattleConfig.ORDER_CAP = 5

BattleConfig.ATTACKER_COLOR = Color3.fromRGB(160, 60, 60)
BattleConfig.DEFENDER_COLOR = Color3.fromRGB(60, 90, 160)

return BattleConfig
