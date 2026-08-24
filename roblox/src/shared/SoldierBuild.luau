--!strict
-- THE BODY OF A SOLDIER — the one place it is described.
--
-- Extracted from BattleScene on 2026-08-24 so the phone spike and the real
-- battle cannot draw different armies. That mattered the moment roblox/spike
-- became the instrument for the Slice 0 phone measure: the spike speaks no
-- HTTP, so it is the only build that can run on a real phone while the world
-- server sits on 127.0.0.1 — and a spike drawing cheap plastic boxes would
-- have reported a frame rate the real battle could never honour.
--
-- This module owns the BODY only. Behaviour — marching, swinging, dying,
-- culling — belongs to whoever renders it. Two rules ride along from spike
-- and BattleScene both:
--   * NO Humanoids. Roblox's character brain dies around 50-100 instances.
--   * Six anchored, non-colliding, non-querying parts per soldier, moved in
--     ONE workspace:BulkMoveTo per frame by the caller.
local SoldierBuild = {}

-- Six parts remain the hard budget for every soldier. We spend the fourth part
-- on a weapon silhouette instead of a second featureless arm: body, headgear,
-- shield/leading arm, weapon, and two legs. That keeps the 1,200-part worst
-- case while making each formation read as an army rather than peg dolls.
-- No plume, horn, fantasy armour, hidden attachments, or per-soldier animation.
SoldierBuild.PARTS_PER_SOLDIER = 6

export type Body = {
	parts: { BasePart },
	offsets: { CFrame }, -- part offset from the soldier's root CFrame
}

local VANGUARD_OFFSETS: { CFrame } = {
	CFrame.new(0, 2.82, 0), -- belted wool surcoat over mail
	CFrame.new(0, 4.34, 0) * CFrame.Angles(0, 0, math.pi / 2), -- iron skullcap
	CFrame.new(-1.03, 3.02, -0.03), -- shield/leading mail arm
	CFrame.new(1.02, 3.12, 0.05) * CFrame.Angles(0, 0, math.pi / 2), -- spear
	CFrame.new(-0.4, 0.93, 0), -- wool hose and shoe
	CFrame.new(0.4, 0.93, 0), -- wool hose and shoe
}

local ARCHER_OFFSETS: { CFrame } = {
	CFrame.new(0, 2.72, 0), -- belted wool tunic / leather jerkin
	CFrame.new(0, 4.14, 0.08), -- close wool hood
	CFrame.new(-0.92, 2.82, -0.04), -- bracer/leading arm
	CFrame.new(0.98, 3, 0.04) * CFrame.Angles(0, 0, math.pi / 2), -- bow stave
	CFrame.new(-0.37, 0.88, 0), -- narrow wool hose
	CFrame.new(0.37, 0.88, 0), -- narrow wool hose
}

local RIDER_OFFSETS: { CFrame } = {
	CFrame.new(0, 2.95, 0), -- broad surcoat over mail
	CFrame.new(0, 4.5, 0) * CFrame.Angles(0, 0, math.pi / 2), -- iron helmet
	CFrame.new(-1.12, 3.12, -0.03), -- heavier leading arm
	CFrame.new(1.16, 3.18, 0.08) * CFrame.Angles(0, 0, math.rad(58)), -- sword
	CFrame.new(-0.46, 0.96, 0), -- riding hose and tall leather boot
	CFrame.new(0.46, 0.96, 0), -- riding hose and tall leather boot
}

local MAIL = Color3.fromRGB(112, 116, 116)
local DARK_MAIL = Color3.fromRGB(83, 88, 89)
local WORN_LEATHER = Color3.fromRGB(102, 72, 45)
local DARK_LEATHER = Color3.fromRGB(62, 47, 35)
local DARK_WOOL = Color3.fromRGB(53, 49, 43)
local HOOD_WOOL = Color3.fromRGB(73, 67, 56)
local ASH_WOOD = Color3.fromRGB(112, 82, 49)
local BLADE = Color3.fromRGB(139, 142, 138)

-- One part factory for everything either renderer builds. The flags are not
-- decoration: CanCollide/CanQuery/CanTouch off keeps 1,200 parts out of the
-- physics and raycast broadphases, and CastShadow off is most of the phone
-- budget. A soldier built with different flags is a different measurement.
function SoldierBuild.makePart(
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

-- Build one soldier of the given orderable squad. `color` is the side's
-- livery; each squad tints it rather than replacing it, so attacker and
-- defender stay legible at a glance.
function SoldierBuild.build(color: Color3, squadId: string, parent: Instance): Body
	local makePart = SoldierBuild.makePart

	if squadId == "archers" then
		-- Archers stay visibly lighter than the battle line: muted wool, close
		-- hood, leather bracer, narrow hose, and a tall bow-stave silhouette.
		local tunic = color:Lerp(Color3.fromRGB(91, 78, 57), 0.38)
		return {
			parts = {
				makePart(Vector3.new(1.38, 2.08, 0.7), tunic, parent, Enum.Material.Fabric),
				makePart(Vector3.new(0.92, 0.94, 0.96), HOOD_WOOL, parent, Enum.Material.Fabric, Enum.PartType.Ball),
				makePart(Vector3.new(0.43, 1.58, 0.43), WORN_LEATHER, parent, Enum.Material.Fabric),
				makePart(Vector3.new(3.05, 0.16, 0.16), ASH_WOOD, parent, Enum.Material.Wood, Enum.PartType.Cylinder),
				makePart(Vector3.new(0.54, 1.68, 0.54), DARK_WOOL, parent, Enum.Material.Fabric),
				makePart(Vector3.new(0.54, 1.68, 0.54), DARK_WOOL, parent, Enum.Material.Fabric),
			},
			offsets = ARCHER_OFFSETS,
		}
	elseif squadId == "riders" then
		-- Riders use the same mail-and-surcoat language as the vanguard, but a
		-- broader torso, dark riding boots, and short sword make the block
		-- legible without adding horses or any seventh decorative part.
		local surcoat = color:Lerp(Color3.fromRGB(44, 38, 32), 0.12)
		return {
			parts = {
				makePart(Vector3.new(1.78, 2.25, 0.9), surcoat, parent, Enum.Material.Fabric),
				makePart(Vector3.new(0.76, 1.12, 1.12), DARK_MAIL, parent, Enum.Material.Metal, Enum.PartType.Cylinder),
				makePart(Vector3.new(0.58, 1.84, 0.58), DARK_MAIL, parent, Enum.Material.Metal),
				makePart(Vector3.new(2.36, 0.2, 0.12), BLADE, parent, Enum.Material.Metal),
				makePart(Vector3.new(0.7, 1.86, 0.7), DARK_LEATHER, parent, Enum.Material.Fabric),
				makePart(Vector3.new(0.7, 1.86, 0.7), DARK_LEATHER, parent, Enum.Material.Fabric),
			},
			offsets = RIDER_OFFSETS,
		}
	end

	-- Vanguard: coloured wool over mail, one leading mail arm, dark hose, iron
	-- skullcap, and ash spear. It remains a levy/man-at-arms rather than
	-- plate-clad fantasy infantry.
	return {
		parts = {
			makePart(Vector3.new(1.58, 2.18, 0.84), color, parent, Enum.Material.Fabric),
			makePart(Vector3.new(0.72, 1.06, 1.06), MAIL, parent, Enum.Material.Metal, Enum.PartType.Cylinder),
			makePart(Vector3.new(0.52, 1.76, 0.52), MAIL, parent, Enum.Material.Metal),
			makePart(Vector3.new(4.2, 0.18, 0.18), ASH_WOOD, parent, Enum.Material.Wood, Enum.PartType.Cylinder),
			makePart(Vector3.new(0.62, 1.78, 0.62), DARK_WOOL, parent, Enum.Material.Fabric),
			makePart(Vector3.new(0.62, 1.78, 0.62), DARK_WOOL, parent, Enum.Material.Fabric),
		},
		offsets = VANGUARD_OFFSETS,
	}
end

function SoldierBuild.destroy(body: Body)
	for _, part in body.parts do
		part:Destroy()
	end
	table.clear(body.parts)
end

return SoldierBuild
