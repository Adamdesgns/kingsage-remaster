--!strict
-- How the world LOOKS. Lighting, sky, atmosphere, and the shared palette every
-- structure is built from.
--
-- [Adam, 2026-08-23] *"I'm not accepting a low quality anything. You will get
-- this right."*
--
-- Until now this game had NO lighting configuration at all — default Roblox
-- lighting, which is flat, blue-grey and shadowless. Every surface was
-- `Enum.Material.Concrete` in one of three greys. That combination is most of
-- why a settlement read as cardboard boxes rather than a place: not the shapes,
-- the light falling on them.
--
-- This module is the single place that decides how the world is lit and what
-- things are made of, so the look cannot drift building by building.

local Lighting = game:GetService("Lighting")

local WorldStyle = {}

--- The palette. Medieval, warm, and deliberately narrow — a small set of
--- colours used consistently reads as art direction; a large set reads as
--- nobody deciding.
WorldStyle.PALETTE = {
	-- Structure
	stone        = Color3.fromRGB(168, 160, 146),
	stoneDark    = Color3.fromRGB(122, 116, 106),
	stoneWarm    = Color3.fromRGB(186, 172, 148),
	plaster      = Color3.fromRGB(216, 206, 184),
	timber       = Color3.fromRGB(92, 66, 44),
	timberDark   = Color3.fromRGB(62, 44, 32),
	timberLight  = Color3.fromRGB(126, 92, 60),
	-- Roofs
	roofTile     = Color3.fromRGB(122, 62, 48),
	roofSlate    = Color3.fromRGB(78, 80, 88),
	thatch       = Color3.fromRGB(178, 148, 88),
	-- Ground and detail
	grass        = Color3.fromRGB(104, 130, 74),
	dirt         = Color3.fromRGB(126, 104, 78),
	road         = Color3.fromRGB(146, 134, 112),
	cobbleLight  = Color3.fromRGB(170, 158, 136),
	cobbleDark   = Color3.fromRGB(112, 102, 88),
	pathEdge     = Color3.fromRGB(108, 92, 72),
	moss         = Color3.fromRGB(78, 101, 58),
	foliage      = Color3.fromRGB(67, 104, 55),
	iron         = Color3.fromRGB(74, 74, 78),
	ore          = Color3.fromRGB(82, 78, 72),
	banner       = Color3.fromRGB(150, 44, 44),
	bannerGold   = Color3.fromRGB(204, 164, 82),
	window       = Color3.fromRGB(58, 48, 40),
	windowGlow   = Color3.fromRGB(205, 151, 88),
	straw        = Color3.fromRGB(194, 160, 88),
	crop         = Color3.fromRGB(126, 118, 62),
	warmLight    = Color3.fromRGB(255, 184, 104),
	candleWax    = Color3.fromRGB(226, 197, 135),
}

--- Materials, kept beside the palette so a colour and its surface travel
--- together. Roblox's material shading does most of the work of making a box
--- look like stone rather than plastic.
WorldStyle.MATERIAL = {
	stone   = Enum.Material.Cobblestone,
	block   = Enum.Material.Brick,
	plaster = Enum.Material.Sandstone,
	timber  = Enum.Material.WoodPlanks,
	roof    = Enum.Material.Slate,
	thatch  = Enum.Material.Grass,
	road    = Enum.Material.Cobblestone,
	dirt    = Enum.Material.Ground,
	grass   = Enum.Material.Grass,
	iron    = Enum.Material.Metal,
	cloth   = Enum.Material.Fabric,
	glass   = Enum.Material.Glass,
}

--- Late-afternoon sun: long shadows, warm light, real contrast.
---
--- The single biggest visual change available. Default lighting puts the sun
--- overhead with no shadows, which flattens every form into a silhouette —
--- exactly what made the settlement look like a stack of grey slabs.
function WorldStyle.applyLighting()
	-- ⚠️ `Lighting.Technology` is NOT set here. A normal server script cannot
	-- write it - it needs the RobloxScript capability - and the attempt THROWS.
	-- On 2026-08-23 that single line took the entire game down: applyLighting()
	-- was called on line 3 of init.server.luau, so when it threw, WorldSession,
	-- SettlementBuilder, CommandService and WarTable never loaded. No remotes,
	-- no settlement, and the player spawned at the world origin over open sky
	-- and fell to their death on a loop.
	--
	-- Technology is a PLACE property now, set in default.project.json and
	-- demo.project.json where it belongs.
	Lighting.Ambient = Color3.fromRGB(88, 84, 96)
	Lighting.OutdoorAmbient = Color3.fromRGB(112, 116, 132)
	Lighting.Brightness = 2.6
	Lighting.ClockTime = 15.6 -- mid-afternoon: shadows long enough to read depth
	Lighting.GeographicLatitude = 24
	Lighting.ExposureCompensation = 0.18
	Lighting.EnvironmentDiffuseScale = 0.55
	Lighting.EnvironmentSpecularScale = 0.35
	Lighting.GlobalShadows = true
	Lighting.ShadowSoftness = 0.35
	Lighting.FogEnd = 100000 -- Atmosphere handles distance instead

	local function ensure<T>(className: string, name: string): any
		local existing = Lighting:FindFirstChild(name)
		if existing then
			return existing
		end
		local made = Instance.new(className)
		made.Name = name
		made.Parent = Lighting
		return made
	end

	-- Haze, so distant settlements sit BEHIND air rather than being pasted onto
	-- the sky. This is what gives a big world a sense of scale.
	local atmosphere = ensure("Atmosphere", "Atmosphere")
	atmosphere.Density = 0.34
	atmosphere.Offset = 0.1
	atmosphere.Color = Color3.fromRGB(206, 202, 190)
	atmosphere.Decay = Color3.fromRGB(122, 130, 148)
	atmosphere.Glare = 0.28
	atmosphere.Haze = 1.6

	local sky = ensure("Sky", "Sky")
	sky.SunAngularSize = 12
	sky.MoonAngularSize = 9
	sky.StarCount = 1200

	local bloom = ensure("BloomEffect", "Bloom")
	bloom.Intensity = 0.5
	bloom.Size = 22
	bloom.Threshold = 1.7

	local colour = ensure("ColorCorrectionEffect", "Grade")
	colour.Brightness = 0.02
	colour.Contrast = 0.16
	colour.Saturation = 0.12
	colour.TintColor = Color3.fromRGB(255, 250, 240)

	local rays = ensure("SunRaysEffect", "SunRays")
	rays.Intensity = 0.06
	rays.Spread = 0.9
end

--- Build a part with a material and colour from the palette in one call, so no
--- structure can quietly opt out of the art direction.
function WorldStyle.part(
	name: string,
	size: Vector3,
	cframe: CFrame,
	parent: Instance,
	colour: Color3,
	material: Enum.Material?
): Part
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.CFrame = cframe
	part.Anchored = true
	part.Color = colour
	part.Material = material or WorldStyle.MATERIAL.stone
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Parent = parent
	return part
end

--- One restrained local light for a landmark. Callers own the budget; this
--- helper only makes the settings consistent and keeps Shadows disabled on
--- decorative lights so a focal glow never becomes the performance problem.
function WorldStyle.pointLight(parent: BasePart, colour: Color3, brightness: number, range: number): PointLight
	local light = Instance.new("PointLight")
	light.Name = "FocalLight"
	light.Color = colour
	light.Brightness = brightness
	light.Range = range
	light.Shadows = false
	light.Parent = parent
	return light
end

return WorldStyle
