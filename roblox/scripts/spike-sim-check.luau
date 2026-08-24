--!strict
-- DOES THE INSTRUMENT ACTUALLY DO ANYTHING? Run with:
--   lune run roblox/scripts/spike-sim-check.luau
--
-- Slice 0 turns a frame rate off roblox/spike into MAX_SOLDIERS, and every
-- visual slice is then sized by that number. So the failure that matters most
-- here is not a crash -- it is the spike quietly measuring nothing. If the
-- soldiers never march, never meet, and never fall, the meter reports a superb
-- frame rate for a still photograph and Slice 0 PASSES on a lie. That is this
-- repository's signature bug (a world with no floor shipped exactly this way).
--
-- Studio is the only place the RENDERING can be judged, and this script does
-- not pretend otherwise. What it can do is stub the Roblox globals, LOAD the
-- real spike client, drive its frame callback, and prove the simulation moves:
-- soldiers spawn, close, engage, die, and the verdict line resolves.
--
-- WHAT THIS DOES NOT PROVE: anything about frame rate, draw calls, materials,
-- or how it looks. Only a phone can say that. See docs/superpowers/spike-200-troops.md.
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")

local failures = 0
local checks = 0

local function check(name: string, condition: boolean, detail: string?)
	checks += 1
	if condition then
		print(string.format("PASS  %s", name))
	else
		failures += 1
		print(string.format("FAIL  %s%s", name, if detail then "  -- " .. detail else ""))
	end
end

-- ---------------------------------------------------------------- stubs ----
-- Deliberately thin. Position is modelled for real because the whole question
-- is whether the armies close; rotation is not, because nothing here judges it.

type Vec = { X: number, Y: number, Z: number }

local Vector3 = {}
Vector3.new = function(x: number?, y: number?, z: number?): any
	return { X = x or 0, Y = y or 0, Z = z or 0 }
end

local CFrame = {}
local function makeCFrame(pos: Vec): any
	local self = {}
	self.Position = pos
	self.X, self.Y, self.Z = pos.X, pos.Y, pos.Z
	return setmetatable(self, {
		__add = function(a: any, v: any)
			return makeCFrame({ X = a.Position.X + v.X, Y = a.Position.Y + v.Y, Z = a.Position.Z + v.Z })
		end,
		__mul = function(a: any, b: any)
			-- Offsets compose by translation only; that is all this harness reads.
			local bp = if type(b) == "table" and b.Position then b.Position else { X = 0, Y = 0, Z = 0 }
			return makeCFrame({ X = a.Position.X + bp.X, Y = a.Position.Y + bp.Y, Z = a.Position.Z + bp.Z })
		end,
	})
end
CFrame.new = function(x: number?, y: number?, z: number?): any
	return makeCFrame({ X = x or 0, Y = y or 0, Z = z or 0 })
end
CFrame.Angles = function(): any
	return makeCFrame({ X = 0, Y = 0, Z = 0 })
end
CFrame.lookAt = function(): any
	return makeCFrame({ X = 0, Y = 0, Z = 0 })
end

local Color3 = {}
local function makeColor(): any
	local c = {}
	c.Lerp = function(_self: any, _other: any, _alpha: number): any
		return makeColor()
	end
	return c
end
Color3.fromRGB = makeColor
Color3.new = makeColor

local UDim2 = { new = function(): any return {} end, fromScale = function(): any return {} end }

-- Enum is read but never compared against anything meaningful here.
local Enum = setmetatable({}, {
	__index = function()
		return setmetatable({}, { __index = function() return "enum" end })
	end,
})

local createdParts = 0
local destroyedParts = 0
local labels: { any } = {}

local function newInstance(className: string): any
	local inst: any = {
		ClassName = className,
		Name = "",
		Transparency = 0,
		Parent = nil,
	}
	if className == "Part" then
		createdParts += 1
		inst.Destroy = function()
			destroyedParts += 1
		end
	else
		inst.Destroy = function() end
	end
	if className == "TextLabel" then
		inst.Text = ""
		table.insert(labels, inst)
	end
	inst.WaitForChild = function(_self: any, _name: string): any
		return newInstance("Folder")
	end
	inst.Clone = function(_self: any): any
		return newInstance(className)
	end
	return inst
end

local Instance = { new = function(className: string): any return newInstance(className) end }

local bulkMoveCalls = 0
local lastBulkMoveParts = 0
local workspaceStub: any = {
	CurrentCamera = { CameraType = nil, CFrame = nil },
	BulkMoveTo = function(_self: any, parts: { any }, _cframes: { any }, _mode: any)
		bulkMoveCalls += 1
		lastBulkMoveParts = #parts
	end,
}

-- ------------------------------------------------------- module loading ----

local function loadModule(path: string, env: { [string]: any }): any
	local chunk = luau.load(fs.readFile(path), { debugName = path, environment = env })
	return chunk()
end

local baseEnv: { [string]: any } = {
	Vector3 = Vector3,
	CFrame = CFrame,
	Color3 = Color3,
	UDim2 = UDim2,
	Enum = Enum,
	Instance = Instance,
	workspace = workspaceStub,
}

local BattleConfig = loadModule("roblox/src/shared/BattleConfig.luau", baseEnv)
local SoldierBuild = loadModule("roblox/src/shared/SoldierBuild.luau", baseEnv)

-- The spike resolves its modules through ReplicatedStorage; hand it the real
-- ones we just loaded, so this exercises the actual shared build.
local modulesByName: { [string]: any } = {
	BattleConfig = BattleConfig,
	SoldierBuild = SoldierBuild,
}

local frameCallback: ((number) -> ())? = nil

local worldSharedStub: any = {}
worldSharedStub.WaitForChild = function(_self: any, name: string): any
	return { __module = name, WaitForChild = worldSharedStub.WaitForChild }
end

local playerGui = newInstance("PlayerGui")
local gameStub: any = {
	GetService = function(_self: any, name: string): any
		if name == "RunService" then
			return {
				RenderStepped = {
					Connect = function(_s: any, fn: (number) -> ())
						frameCallback = fn
						return { Disconnect = function() end }
					end,
				},
			}
		elseif name == "ReplicatedStorage" then
			return { WaitForChild = function(): any return worldSharedStub end }
		elseif name == "Players" then
			return {
				LocalPlayer = {
					WaitForChild = function(): any return playerGui end,
				},
			}
		end
		return newInstance(name)
	end,
}

local spikeEnv: { [string]: any } = {}
for key, value in baseEnv do
	spikeEnv[key] = value
end
spikeEnv.game = gameStub
spikeEnv.task = { defer = function(fn: () -> ()) fn() end, wait = function() end }
spikeEnv.require = function(target: any): any
	local name = if type(target) == "table" then target.__module else nil
	local resolved = if name then modulesByName[name] else nil
	if resolved == nil then
		error("spike required an unknown module: " .. tostring(name))
	end
	return resolved
end

-- ------------------------------------------------------------- the run ----

local ok, err = pcall(function()
	loadModule("roblox/spike/client/init.client.luau", spikeEnv)
end)
check("the spike client loads and runs without erroring", ok, tostring(err))
if not ok then
	print(string.format("---- %d checks, %d failed ----", checks, failures))
	process.exit(1)
end

local expectedParts = BattleConfig.MAX_SOLDIERS * SoldierBuild.PARTS_PER_SOLDIER
check(
	"it builds one part per soldier limb and no more",
	createdParts == expectedParts,
	string.format("built %d parts, expected %d", createdParts, expectedParts)
)

check("it registered a per-frame callback", frameCallback ~= nil)

local function verdictText(): string
	local text = ""
	for _, label in labels do
		if string.find(label.Text, "PASS") or string.find(label.Text, "FAIL") or string.find(label.Text, "contact") then
			text = label.Text
		end
	end
	return text
end

-- Drive the simulation at a fixed 60fps step. Deterministic on purpose: this
-- must give the same answer on every machine or it is not a gate.
local STEP = 1 / 60
local callback = frameCallback :: (number) -> ()

callback(STEP)
local partsFirstFrame = lastBulkMoveParts
check(
	"every soldier part is moved in ONE bulk call, not one call per soldier",
	bulkMoveCalls == 1 and partsFirstFrame == expectedParts,
	string.format("%d calls, %d parts in the last", bulkMoveCalls, partsFirstFrame)
)

-- Ten seconds is comfortably past the ~6.4s the two lines need to close.
local contactSeen = false
local elapsed = STEP
for _ = 1, 600 do
	callback(STEP)
	elapsed += STEP
	if string.find(verdictText(), "PASS") or string.find(verdictText(), "FAIL") then
		contactSeen = true
	end
end

check(
	"THE ARMIES ACTUALLY CLOSE AND FIGHT -- the meter reaches a verdict",
	contactSeen,
	"after " .. tostring(math.floor(elapsed)) .. "s the verdict line never left 'not in contact'; a spike that never"
		.. " makes contact reports a frame rate for a still photograph"
)

check(
	"soldiers died once the lines met, so falling bodies are in the measurement",
	destroyedParts > 0,
	string.format("%d parts destroyed", destroyedParts)
)

check(
	"the field thins out rather than growing",
	lastBulkMoveParts <= expectedParts and lastBulkMoveParts > 0,
	string.format("%d parts still moving of %d", lastBulkMoveParts, expectedParts)
)

print(string.format("---- %d checks, %d failed ----", checks, failures))
if failures > 0 then
	process.exit(1)
end
