--!strict
-- THE MOVIE, NEVER THE MATH (spec §5, engineering rule 2).
--
-- This module renders a battle the world server has already frozen. It reads
-- the battle session out of the snapshot and draws it; it decides nothing. No
-- frame rate, no device, no cull can move a single casualty — the outcome is
-- computed by Gate D on the world server and arrives finished. That is what
-- makes the adaptive budget below safe.
--
-- Three engineering rules, all inherited from roblox/spike:
--   * NO Humanoids. A soldier is six anchored, non-colliding, non-querying
--     parts. Roblox's character brain dies around 50-100 instances.
--   * ONE workspace:BulkMoveTo per frame for every part on the field.
--   * Squads think, individuals perform. Blocks pick a destination; the
--     soldiers inside them only keep formation and swing.
--
-- It is a CLIENT module on purpose: nothing it builds is replicated, so two
-- hundred soldiers cost the network nothing. Every client seeds its own
-- randomness from the battle's own seed, so everyone watching sees the same
-- fight without a byte of syncing.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local worldShared = ReplicatedStorage:WaitForChild("WorldShared")
local BattleConfig = require(worldShared:WaitForChild("BattleConfig"))
local Config = require(worldShared:WaitForChild("Config"))

local BattleScene = {}

type Soldier = {
	parts: { BasePart },
	offsets: { CFrame },
	root: CFrame,
	alive: boolean,
	engaged: boolean,
	swing: boolean,
	falling: number, -- seconds left in the fall, 0 when standing
}

type Block = {
	side: string, -- "attacker" | "defender"
	squadId: string,
	soldiers: { Soldier },
	target: Vector3,
	home: Vector3,
}

local state: {
	battleId: string?,
	seed: string,
	status: string,
	folder: Folder?,
	blocks: { Block },
	order: { Soldier }, -- deterministic cull/casualty order, per side
	casualtyOrder: { [string]: { Soldier } },
	center: Vector3,
	facing: number,
	connection: RBXScriptConnection?,
	renderedCap: number,
	rendered: number,
	sampleClock: number,
	frames: number,
	frameTime: number,
	swingClock: number,
	resolvedApplied: boolean,
	routSide: string?,
	elapsed: number,
}? = nil

local function seedNumber(seed: string): number
	local value = 0
	for index = 1, #seed do
		value = (value * 31 + string.byte(seed, index)) % 2147483647
	end
	return value
end

local function makePart(
	size: Vector3,
	color: Color3,
	parent: Instance,
	material: Enum.Material?,
	shape: Enum.PartType?
): BasePart
	local part = Instance.new("Part")
	part.Size = size
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.Color = color
	part.Material = material or Enum.Material.SmoothPlastic
	part.Shape = shape or Enum.PartType.Block
	part.Parent = parent
	return part
end

-- Six parts remain the hard budget for every soldier. The same six pieces now
-- carry a readable late-medieval kit through silhouette, material, and colour:
-- a cloth or mail body, one hood/helmet, two sleeves, and two hose/boot legs.
-- No weapon, plume, horn, or fantasy armour is hidden outside that budget.
local VANGUARD_OFFSETS: { CFrame } = {
	CFrame.new(0, 2.9, 0), -- wool surcoat over mail
	CFrame.new(0, 4.5, 0), -- simple iron helmet
	CFrame.new(-1.16, 3, 0), -- mail sleeve
	CFrame.new(1.16, 3, 0), -- mail sleeve / striking arm
	CFrame.new(-0.43, 0.95, 0), -- wool hose and shoe
	CFrame.new(0.43, 0.95, 0), -- wool hose and shoe
}

local ARCHER_OFFSETS: { CFrame } = {
	CFrame.new(0, 2.78, 0), -- belted wool tunic / leather jerkin
	CFrame.new(0, 4.23, -0.04), -- close wool hood
	CFrame.new(-1.02, 2.82, 0), -- fitted leather sleeve
	CFrame.new(1.02, 2.82, 0), -- fitted leather sleeve / striking arm
	CFrame.new(-0.37, 0.88, 0), -- narrow wool hose
	CFrame.new(0.37, 0.88, 0), -- narrow wool hose
}

local RIDER_OFFSETS: { CFrame } = {
	CFrame.new(0, 3.02, 0), -- broad surcoat over mail
	CFrame.new(0, 4.72, 0), -- iron helmet
	CFrame.new(-1.28, 3.12, 0), -- heavier mail sleeve
	CFrame.new(1.28, 3.12, 0), -- heavier mail sleeve / striking arm
	CFrame.new(-0.5, 0.98, 0), -- riding hose and tall leather boot
	CFrame.new(0.5, 0.98, 0), -- riding hose and tall leather boot
}

local MAIL = Color3.fromRGB(112, 116, 116)
local DARK_MAIL = Color3.fromRGB(83, 88, 89)
local WORN_LEATHER = Color3.fromRGB(102, 72, 45)
local DARK_LEATHER = Color3.fromRGB(62, 47, 35)
local DARK_WOOL = Color3.fromRGB(53, 49, 43)
local HOOD_WOOL = Color3.fromRGB(73, 67, 56)

local function makeSoldier(color: Color3, squadId: string, root: CFrame, parent: Instance): Soldier
	local parts: { BasePart }
	local offsets: { CFrame }

	if squadId == "archers" then
		-- Archers stay visibly lighter than the battle line: a muted wool tunic,
		-- leather sleeves, close hood, narrow hose, and practical shoes.
		local tunic = color:Lerp(Color3.fromRGB(91, 78, 57), 0.38)
		parts = {
			makePart(Vector3.new(1.42, 2.05, 0.72), tunic, parent, Enum.Material.Fabric),
			makePart(Vector3.new(1.08, 1.08, 1.04), HOOD_WOOL, parent, Enum.Material.Fabric, Enum.PartType.Ball),
			makePart(Vector3.new(0.48, 1.72, 0.48), WORN_LEATHER, parent),
			makePart(Vector3.new(0.48, 1.72, 0.48), WORN_LEATHER, parent),
			makePart(Vector3.new(0.58, 1.7, 0.58), DARK_WOOL, parent, Enum.Material.Fabric),
			makePart(Vector3.new(0.58, 1.7, 0.58), DARK_WOOL, parent, Enum.Material.Fabric),
		}
		offsets = ARCHER_OFFSETS
	elseif squadId == "riders" then
		-- Riders use the same plausible mail-and-surcoat language as the
		-- vanguard, but a taller, broader silhouette and dark riding boots make
		-- their formation legible without adding horses or decorative parts.
		local surcoat = color:Lerp(Color3.fromRGB(44, 38, 32), 0.12)
		parts = {
			makePart(Vector3.new(1.88, 2.3, 1), surcoat, parent, Enum.Material.Fabric),
			makePart(Vector3.new(1.22, 1.22, 1.18), DARK_MAIL, parent, Enum.Material.Metal, Enum.PartType.Ball),
			makePart(Vector3.new(0.65, 1.95, 0.65), DARK_MAIL, parent, Enum.Material.Metal),
			makePart(Vector3.new(0.65, 1.95, 0.65), DARK_MAIL, parent, Enum.Material.Metal),
			makePart(Vector3.new(0.76, 1.9, 0.76), DARK_LEATHER, parent),
			makePart(Vector3.new(0.76, 1.9, 0.76), DARK_LEATHER, parent),
		}
		offsets = RIDER_OFFSETS
	else
		-- Vanguard: coloured wool surcoat, visible mail sleeves, dark hose,
		-- and an undecorated iron skullcap. It reads as a working levy/man-at-
		-- arms rather than plate-clad fantasy infantry.
		parts = {
			makePart(Vector3.new(1.68, 2.22, 0.92), color, parent, Enum.Material.Fabric),
			makePart(Vector3.new(1.16, 1.16, 1.12), MAIL, parent, Enum.Material.Metal, Enum.PartType.Ball),
			makePart(Vector3.new(0.58, 1.86, 0.58), MAIL, parent, Enum.Material.Metal),
			makePart(Vector3.new(0.58, 1.86, 0.58), MAIL, parent, Enum.Material.Metal),
			makePart(Vector3.new(0.68, 1.82, 0.68), DARK_WOOL, parent, Enum.Material.Fabric),
			makePart(Vector3.new(0.68, 1.82, 0.68), DARK_WOOL, parent, Enum.Material.Fabric),
		}
		offsets = VANGUARD_OFFSETS
	end

	return {
		parts = parts,
		offsets = offsets,
		root = root,
		alive = true,
		engaged = false,
		swing = false,
		falling = 0,
	}
end

local function destroySoldier(soldier: Soldier)
	for _, part in soldier.parts do
		part:Destroy()
	end
	table.clear(soldier.parts)
end

-- Which orderable squad a troop type fights in. Anything the config does not
-- name marches with the vanguard, so a new troop can never fall off the field.
local function squadForTroop(troop: string): string
	for _, squad in BattleConfig.SQUADS do
		for _, member in squad.troops do
			if member == troop then
				return squad.id
			end
		end
	end
	return BattleConfig.SQUADS[1].id
end

local function squadDefinition(squadId: string): any
	for _, squad in BattleConfig.SQUADS do
		if squad.id == squadId then
			return squad
		end
	end
	return BattleConfig.SQUADS[1]
end

local function unitsBySquad(army: any): ({ [string]: number }, number)
	local counts: { [string]: number } = {}
	local total = 0
	for _, squad in BattleConfig.SQUADS do
		counts[squad.id] = 0
	end
	if typeof(army) == "table" then
		for troop, raw in army do
			local count = math.max(math.floor(tonumber(raw) or 0), 0)
			if count > 0 then
				local squadId = squadForTroop(tostring(troop))
				counts[squadId] = (counts[squadId] or 0) + count
				total += count
			end
		end
	end
	return counts, total
end

-- ---------------------------------------------------------------------------
-- building the field
-- ---------------------------------------------------------------------------

local function buildBlocks(
	side: string,
	army: any,
	bodyBudget: number,
	totalUnits: number,
	center: Vector3,
	lineZ: number,
	facingYaw: number,
	folder: Folder,
	random: Random
): ({ Block }, { Soldier })
	local blocks: { Block } = {}
	local roster: { Soldier } = {}
	local counts = unitsBySquad(army)
	local color = if side == "attacker" then BattleConfig.ATTACKER_COLOR else BattleConfig.DEFENDER_COLOR

	-- Bodies are proportional to real units, so a rout of 30 looks like a rout
	-- of 30 next to an army of 300. The ratio is display only.
	local scale = if totalUnits > 0 then bodyBudget / totalUnits else 0
	local slotIndex = 0

	for _, squad in BattleConfig.SQUADS do
		local units = counts[squad.id] or 0
		if units <= 0 then
			continue
		end
		local bodies = math.max(1, math.floor(units * scale + 0.5))
		local blockCount = math.clamp(
			math.floor(bodies / BattleConfig.SOLDIERS_PER_BLOCK_MIN),
			1,
			BattleConfig.BLOCKS_PER_SQUAD
		)
		local perBlock = math.max(1, math.floor(bodies / blockCount))

		for blockNumber = 1, blockCount do
			local spread = (blockNumber - (blockCount + 1) / 2) * (BattleConfig.FIELD_WIDTH / (blockCount + 1))
			-- Squads hold their own lane: vanguard centre, archers behind,
			-- riders wide. The lane is what makes a "flank" order read.
			local lane = if squad.id == "archers" then -14 elseif squad.id == "riders" then 0 else 0
			local laneX = if squad.id == "riders" then spread * 1.6 else spread
			local home = center + Vector3.new(laneX, 0, lineZ + (if side == "attacker" then -lane else lane))

			local soldiers: { Soldier } = {}
			local perRow = math.max(1, math.ceil(math.sqrt(perBlock)))
			for bodyIndex = 1, perBlock do
				local row = math.floor((bodyIndex - 1) / perRow)
				local file = (bodyIndex - 1) % perRow
				local offset = Vector3.new(
					(file - (perRow - 1) / 2) * BattleConfig.FILE_SPACING,
					0,
					row * BattleConfig.RANK_SPACING * (if side == "attacker" then 1 else -1)
				)
				local soldier = makeSoldier(
					color,
					squad.id,
					CFrame.new(home + offset) * CFrame.Angles(0, facingYaw, 0),
					folder
				)
				table.insert(soldiers, soldier)
				slotIndex += 1
				table.insert(roster, soldier)
			end

			table.insert(blocks, {
				side = side,
				squadId = squad.id,
				soldiers = soldiers,
				target = home,
				home = home,
			})
		end
	end

	-- Deterministic shuffle: who falls, and who gets culled for frame rate, is
	-- decided by the battle's own seed so every client agrees.
	for index = #roster, 2, -1 do
		local swap = random:NextInteger(1, index)
		roster[index], roster[swap] = roster[swap], roster[index]
	end
	return blocks, roster
end

-- ---------------------------------------------------------------------------
-- the frame loop
-- ---------------------------------------------------------------------------

local function tick(dt: number)
	local scene = state
	if not scene then
		return
	end
	scene.elapsed += dt

	-- adaptive budget: measure, then cull. Never touches the outcome.
	scene.frames += 1
	scene.frameTime += dt
	scene.sampleClock += dt
	if scene.sampleClock >= BattleConfig.SAMPLE_WINDOW then
		local averageFps = scene.frames / math.max(scene.frameTime, 0.0001)
		if averageFps < BattleConfig.TARGET_FPS and scene.rendered > BattleConfig.MIN_SOLDIERS then
			local cull = math.min(BattleConfig.CULL_STEP, scene.rendered - BattleConfig.MIN_SOLDIERS)
			for _ = 1, cull do
				local soldier = table.remove(scene.order)
				if not soldier then
					break
				end
				if soldier.alive then
					soldier.alive = false
					scene.rendered -= 1
				end
				destroySoldier(soldier)
			end
		end
		scene.sampleClock = 0
		scene.frames = 0
		scene.frameTime = 0
	end

	scene.swingClock += dt
	local flip = false
	if scene.swingClock >= BattleConfig.SWING_PERIOD then
		scene.swingClock -= BattleConfig.SWING_PERIOD
		flip = true
	end

	local parts: { BasePart } = {}
	local cframes: { CFrame } = {}

	for _, block in scene.blocks do
		local routing = scene.routSide == block.side
		for _, soldier in block.soldiers do
			if not soldier.alive then
				continue
			end
			if soldier.falling > 0 then
				soldier.falling = math.max(soldier.falling - dt, 0)
				if soldier.falling <= 0 then
					soldier.alive = false
					scene.rendered -= 1
					destroySoldier(soldier)
					continue
				end
			else
				local goal = if routing
					then block.home + Vector3.new(0, 0, (if block.side == "attacker" then 220 else -220))
					else block.target
				local toGoal = Vector3.new(goal.X - soldier.root.X, 0, goal.Z - soldier.root.Z)
				local distance = toGoal.Magnitude
				local speed = if routing then BattleConfig.ROUT_SPEED else BattleConfig.WALK_SPEED
				if distance > BattleConfig.ENGAGE_DISTANCE then
					soldier.engaged = false
					soldier.root = soldier.root + toGoal.Unit * math.min(speed * dt, distance)
				else
					soldier.engaged = not routing
					if flip then
						soldier.swing = not soldier.swing
					end
				end
			end

			for index, part in soldier.parts do
				local offset = soldier.offsets[index]
				if soldier.falling > 0 then
					offset = CFrame.Angles(math.pi / 2, 0, 0) * offset
				elseif soldier.engaged and index == 4 then
					offset = offset * CFrame.Angles(if soldier.swing then -1.2 else 0.2, 0, 0)
				end
				table.insert(parts, part)
				table.insert(cframes, soldier.root * offset)
			end
		end
	end

	if #parts > 0 then
		workspace:BulkMoveTo(parts, cframes, Enum.BulkMoveMode.FireCFrameChanged)
	end
end

-- ---------------------------------------------------------------------------
-- public surface
-- ---------------------------------------------------------------------------

function BattleScene.isRunning(): boolean
	return state ~= nil
end

function BattleScene.battleId(): string?
	return state and state.battleId or nil
end

function BattleScene.center(): Vector3
	return state and state.center or Vector3.zero
end

function BattleScene.renderedCount(): number
	return state and state.rendered or 0
end

function BattleScene.stop()
	local scene = state
	state = nil
	if not scene then
		return
	end
	if scene.connection then
		scene.connection:Disconnect()
	end
	if scene.folder then
		scene.folder:Destroy()
	end
end

-- Start a scene for a battle. `village` is the DEFENDER's village row from the
-- snapshot: the fight happens at their gate, on the same ground
-- SettlementBuilder placed them on.
function BattleScene.start(battle: any, village: any): boolean
	if not battle or not village then
		return false
	end
	BattleScene.stop()

	local origin = Vector3.new(
		(tonumber(village.x) or 0) * Config.TILE_STUDS,
		0,
		(tonumber(village.y) or 0) * Config.TILE_STUDS
	)
	-- The gate faces +Z, so the field forms up south of the wall.
	local center = origin + Vector3.new(0, 0, Config.WALL_HALF + BattleConfig.FIELD_DEPTH / 2 + 12)

	local folder = Instance.new("Folder")
	folder.Name = "BattleScene"
	folder.Parent = workspace

	local ground = makePart(
		Vector3.new(BattleConfig.FIELD_WIDTH + 80, 1, BattleConfig.FIELD_DEPTH + 80),
		Color3.fromRGB(96, 104, 74),
		folder
	)
	ground.Material = Enum.Material.Grass
	ground.CFrame = CFrame.new(center - Vector3.new(0, 0.5, 0))

	local random = Random.new(seedNumber(tostring(battle.seed or battle.id or "battle")))

	local _, attackerUnits = unitsBySquad(battle.attackerArmy)
	local _, defenderUnits = unitsBySquad(battle.defenderArmy)
	local totalUnits = attackerUnits + defenderUnits
	local budget = math.min(BattleConfig.MAX_SOLDIERS, math.max(totalUnits, 2))
	local attackerBudget = if totalUnits > 0 then math.floor(budget * attackerUnits / totalUnits + 0.5) else 1
	local defenderBudget = math.max(budget - attackerBudget, 0)

	local attackerBlocks, attackerRoster = buildBlocks(
		"attacker", battle.attackerArmy, attackerBudget, attackerUnits,
		center, BattleConfig.FIELD_DEPTH / 2, math.pi, folder, random
	)
	local defenderBlocks, defenderRoster = buildBlocks(
		"defender", battle.defenderArmy, defenderBudget, defenderUnits,
		center, -BattleConfig.FIELD_DEPTH / 2, 0, folder, random
	)

	local blocks: { Block } = {}
	for _, block in attackerBlocks do
		table.insert(blocks, block)
	end
	for _, block in defenderBlocks do
		table.insert(blocks, block)
	end

	-- Both armies advance to the middle by default; orders move the attacker's
	-- squads off that line.
	for _, block in blocks do
		block.target = Vector3.new(block.home.X, 0, center.Z + (if block.side == "attacker" then 8 else -8))
	end

	local cullOrder: { Soldier } = {}
	for _, soldier in attackerRoster do
		table.insert(cullOrder, soldier)
	end
	for _, soldier in defenderRoster do
		table.insert(cullOrder, soldier)
	end

	state = {
		battleId = tostring(battle.id),
		seed = tostring(battle.seed or ""),
		status = tostring(battle.status),
		folder = folder,
		blocks = blocks,
		order = cullOrder,
		casualtyOrder = { attacker = attackerRoster, defender = defenderRoster },
		center = center,
		facing = 0,
		connection = nil,
		renderedCap = budget,
		rendered = #attackerRoster + #defenderRoster,
		sampleClock = 0,
		frames = 0,
		frameTime = 0,
		swingClock = 0,
		resolvedApplied = false,
		routSide = nil,
		elapsed = 0,
	}
	state.connection = RunService.Heartbeat:Connect(tick)

	if tostring(battle.status) ~= "open" then
		BattleScene.update(battle)
	end
	return true
end

-- Fell a share of one side's bodies, matching the share of real units the
-- outcome killed. Bodies fall in the seeded roster order, so every client
-- watching drops the same soldiers.
local function applyCasualties(side: string, casualties: any, original: any)
	local scene = state
	if not scene then
		return
	end
	local _, lost = unitsBySquad(casualties)
	local _, started = unitsBySquad(original)
	if started <= 0 then
		return
	end
	local roster = scene.casualtyOrder[side]
	if not roster then
		return
	end
	local standing = 0
	for _, soldier in roster do
		if soldier.alive and soldier.falling <= 0 then
			standing += 1
		end
	end
	local toFell = math.floor(standing * (lost / started) + 0.5)
	for _, soldier in roster do
		if toFell <= 0 then
			break
		end
		if soldier.alive and soldier.falling <= 0 then
			soldier.falling = BattleConfig.FALL_SECONDS
			toFell -= 1
		end
	end
end

-- Feed a fresh battle row. The only thing that matters is the moment it stops
-- being "open": that is when the maths exists and the movie may show an
-- ending. Before then nothing dies, because nothing has been decided.
function BattleScene.update(battle: any)
	local scene = state
	if not scene or not battle or tostring(battle.id) ~= scene.battleId then
		return
	end
	scene.status = tostring(battle.status)
	local outcome = battle.outcome
	if not outcome or scene.resolvedApplied then
		return
	end
	scene.resolvedApplied = true
	applyCasualties("attacker", outcome.attackerCasualties, battle.attackerArmy)
	applyCasualties("defender", outcome.defenderCasualties, battle.defenderArmy)
	-- The loser leaves the field. A retreat is always the attacker walking.
	if scene.status == "retreated" then
		scene.routSide = "attacker"
	else
		scene.routSide = if tostring(outcome.winner) == "attacker" then "defender" else "attacker"
	end
end

-- Move one of the attacker's squads. Returns the point in the world server's
-- 0-ORDER_SPACE order space, which is what `battle.order` carries.
function BattleScene.orderSquad(squadId: string, worldPoint: Vector3): (number, number)
	local scene = state
	if not scene then
		return 0, 0
	end
	local halfWidth = BattleConfig.FIELD_WIDTH / 2 + 30
	local halfDepth = BattleConfig.FIELD_DEPTH / 2 + 30
	local clampedX = math.clamp(worldPoint.X, scene.center.X - halfWidth, scene.center.X + halfWidth)
	local clampedZ = math.clamp(worldPoint.Z, scene.center.Z - halfDepth, scene.center.Z + halfDepth)
	for _, block in scene.blocks do
		if block.side == "attacker" and block.squadId == squadId then
			-- Blocks keep their spacing: each holds its own offset from the
			-- squad's ordered point instead of stacking on it.
			local offset = block.home.X - scene.center.X
			block.target = Vector3.new(clampedX + offset * 0.35, 0, clampedZ)
		end
	end
	local x = math.floor((clampedX - (scene.center.X - halfWidth)) / (halfWidth * 2) * BattleConfig.ORDER_SPACE)
	local y = math.floor((clampedZ - (scene.center.Z - halfDepth)) / (halfDepth * 2) * BattleConfig.ORDER_SPACE)
	return math.clamp(x, 0, BattleConfig.ORDER_SPACE), math.clamp(y, 0, BattleConfig.ORDER_SPACE)
end

function BattleScene.squadLabel(squadId: string): string
	return tostring(squadDefinition(squadId).label)
end

Players.LocalPlayer.CharacterRemoving:Connect(function()
	-- Dying or resetting must not leave two hundred parts in the world.
	BattleScene.stop()
end)

return BattleScene
