--!strict
-- Prints, as JSON, the EXACT army table the Roblox server would dispatch for an
-- attack. Run with:
--   lune run roblox/scripts/muster-cli.luau '<garrison json>' <true|false>
--
-- This exists so a Node test can ask the real shared Luau what it builds and
-- then feed that answer to the real world server. The two halves of this game
-- are written in different languages and have never once been checked against
-- each other: every server test constructs armies in TypeScript with
-- emptyArmy(), so a Luau troop key that TypeScript does not recognise would
-- sail through the whole suite and only fail in a live session.
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")
local serde = require("@lune/serde")

local Buildings = luau.load(
	fs.readFile("roblox/src/shared/Buildings.luau"),
	{ debugName = "Buildings.luau" }
)()

local garrisonJson = process.args[1] or "{}"
local withNobles = process.args[2] == "true"

local garrison = serde.decode("json", garrisonJson)
local army, fighting, nobles = Buildings.musterFrom(garrison, withNobles)

print(serde.encode("json", {
	army = army,
	fighting = fighting,
	nobles = nobles,
}))
