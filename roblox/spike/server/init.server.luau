--!strict
-- Slice 0 phone measure — SERVER half. This is deliberately almost nothing.
--
-- The soldiers moved to the client on 2026-08-24. In the real game BattleScene
-- is a CLIENT module on purpose: nothing it builds replicates, so two hundred
-- soldiers cost the network nothing. The old spike spawned them server-side,
-- which made every phone pay a 1,200-part replication bill the real game never
-- sends — a measurement of something the game does not do. rules-check now
-- forbids that regression.
--
-- All this half does is give the field a floor. The verdict comes off the
-- client meter, on Adam's actual phone.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local worldShared = ReplicatedStorage:WaitForChild("WorldShared")
local BattleConfig = require(worldShared:WaitForChild("BattleConfig"))

local ground = Instance.new("Part")
ground.Name = "Ground"
ground.Size = Vector3.new(BattleConfig.FIELD_WIDTH + 160, 2, BattleConfig.FIELD_DEPTH + 160)
ground.Position = Vector3.new(0, -1, 0)
ground.Anchored = true
ground.Color = Color3.fromRGB(96, 104, 74)
ground.Material = Enum.Material.Grass
ground.Parent = workspace

print("[Spike] floor laid; the soldiers and the meter are the client's job")
