--!strict
-- Syntax gate for every .luau file under roblox/. Run with:  lune run roblox/scripts/syntax-check.luau
-- Rojo packs Luau files without parsing them, so without this gate a typo
-- ships silently and only explodes inside Studio. Lune's luau.compile parses
-- with the real Luau compiler (no Roblox APIs needed - we never RUN the code).
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")

local failures = 0
local checked = 0

local function checkFile(path: string)
	if not path:match("%.luau$") then
		return
	end
	checked += 1
	local source = fs.readFile(path)
	local ok, err = pcall(function()
		-- compile throws on any syntax error; we never run the bytecode
		luau.compile(source)
	end)
	if ok then
		print("PASS  " .. path)
	else
		failures += 1
		print("FAIL  " .. path)
		print("      " .. tostring(err))
	end
end

local function walk(dir: string)
	for _, entry in fs.readDir(dir) do
		local path = dir .. "/" .. entry
		if fs.isDir(path) then
			walk(path)
		else
			checkFile(path)
		end
	end
end

walk("roblox/src")
walk("roblox/spike")
walk("roblox/scripts")
walk("roblox/demo")

print(string.format("---- %d files checked, %d failed ----", checked, failures))
if failures > 0 then
	process.exit(1)
end
