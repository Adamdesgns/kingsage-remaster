--!strict
-- Executes the real transport against fake Roblox services; no network.
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local serde = require("@lune/serde")
local Policy = luau.load(fs.readFile("roblox/src/server/ConnectionPolicy.luau"))()
local checks = 0
local function check(name: string, condition: boolean)
	assert(condition, name)
	checks += 1
	print("PASS  " .. name)
end

local liveSecrets = { KEY = "test-only-hosted-key", BASE_URL = "https://world.example.com" }
local modes = { "development", "production", "unknown" }
for _, mode in modes do
	for _, isStudio in { true, false } do
		local target, reason = Policy.resolve(mode, isStudio, "http://127.0.0.1:4178", liveSecrets)
		local allowed = (mode == "development" and isStudio) or (mode == "production" and not isStudio)
		check(mode .. " / Studio=" .. tostring(isStudio) .. " has the right admission", (target ~= nil) == allowed)
		if target and mode == "development" then
			check("development ignores hosted key and URL", target.baseUrl == "http://127.0.0.1:4178" and target.key == "dev-secret-local-0001")
		end
	end
end
check("a stale hosted Config cannot redirect a development build", Policy.resolve("development", true, liveSecrets.BASE_URL, liveSecrets) == nil)
for _, secrets in { {}, {KEY = "dev-secret-local-0001", BASE_URL = liveSecrets.BASE_URL}, {KEY = "x", BASE_URL = "http://world.example.com"}, {KEY = "x", BASE_URL = "https://127.0.0.1"}, {KEY = "x", BASE_URL = "https://world.example.com/path"} } do
	check("invalid production credentials/origin refuse", Policy.resolve("production", false, "", secrets) == nil)
end

local function exercise(mode: string, isStudio: boolean)
	local secretReads = 0
	local requests = {}
	local configToken, policyToken, secretsToken = {}, {}, {}
	local config = { API_BASE = "http://127.0.0.1:4178" }
	local parent = {
		GetAttribute = function(_self, name) assert(name == "WorldEnvironment"); return mode end,
		WaitForChild = function(_self, name) assert(name == "ConnectionPolicy"); return policyToken end,
		FindFirstChild = function(_self, name) assert(name == "SecretConfig"); secretReads += 1; return secretsToken end,
	}
	local http = {
		JSONEncode = function(_self, value) return serde.encode("json", value) end,
		JSONDecode = function(_self, value) return serde.decode("json", value) end,
		RequestAsync = function(_self, options)
			table.insert(requests, options)
			return { StatusCode = 200, Body = '{"ok":true}' }
		end,
	}
	local shared = { WaitForChild = function() return configToken end }
	local services = {
		HttpService = http,
		RunService = { IsStudio = function() return isStudio end },
		ReplicatedStorage = { WaitForChild = function() return shared end },
	}
	local api = luau.load(fs.readFile("roblox/src/server/ApiClient.luau"), {
		environment = {
			game = { GetService = function(_self, name) return services[name] end },
			script = { Parent = parent },
			warn = function() end,
			task = { wait = function() error("unexpected retry") end },
			require = function(token)
				if token == configToken then return config end
				if token == policyToken then return Policy end
				if token == secretsToken then return liveSecrets end
				error("unexpected module")
			end,
		},
	})()
	local answered = api.postFull("/api/roblox/session", { robloxUserId = 1 })
	return answered, requests, secretReads
end

local answered, sent, reads = exercise("development", true)
check("real ApiClient development request is local", answered and #sent == 1 and sent[1].Url == "http://127.0.0.1:4178/api/roblox/session")
check("real ApiClient never reads/sees the production credential in development", reads == 0 and sent[1].Headers["x-kingsage-key"] == "dev-secret-local-0001")
for _, context in { {"development", false}, {"production", true}, {"unknown", true} } do
	local ok, requests, secretReads = exercise(context[1], context[2])
	check("forbidden context sends zero HTTP: " .. context[1] .. "/" .. tostring(context[2]), not ok and #requests == 0 and secretReads == 0)
end
local liveAnswered, liveSent, liveReads = exercise("production", false)
check("real published production transport uses only configured origin/key", liveAnswered and #liveSent == 1 and liveReads == 1 and liveSent[1].Url == liveSecrets.BASE_URL .. "/api/roblox/session" and liveSent[1].Headers["x-kingsage-key"] == liveSecrets.KEY)

for _, name in { "default", "demo", "live" } do
	local project = serde.decode("json", fs.readFile("roblox/" .. name .. ".project.json"))
	local environment = project.tree.ServerScriptService.WorldServer["$properties"].Attributes.WorldEnvironment.String
	check(name .. " project declares its environment", environment == (if name == "live" then "production" else "development"))
	if name ~= "live" then
		check(name .. " build excludes the credential file", table.find(project.globIgnorePaths, "**/SecretConfig.luau") ~= nil)
	else
		check("live build contains no self-driving demo", project.tree.StarterPlayer.StarterPlayerScripts.WorldDemo == nil)
	end
end
print(string.format("---- %d connection checks, 0 failed ----", checks))
