--!strict
-- The ONLY module allowed to speak HTTP. Holds the shared secret, retries
-- transient transport failures, and never lies: an answer from the server is
-- final, and no answer is reported as UNREACHABLE (never as success).
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("WorldShared"):WaitForChild("Config"))

local ApiClient = {}

local function readSecrets(): { [string]: any }?
	local module = script.Parent:FindFirstChild("SecretConfig")
	if not module then
		return nil
	end
	local ok, secrets = pcall(require, module)
	if ok and typeof(secrets) == "table" then
		return secrets :: any
	end
	return nil
end

local function secretKey(): string?
	local secrets = readSecrets()
	if secrets and typeof(secrets.KEY) == "string" then
		return secrets.KEY
	end
	return nil
end

-- The world server's address. Config.API_BASE is the dev default
-- (127.0.0.1, Studio-only); a published place points at the hosted world by
-- putting BASE_URL in the same gitignored SecretConfig that carries the key,
-- so hosting is a config change, not a source edit (audit finding 11.1).
local function baseUrl(): string
	local secrets = readSecrets()
	if secrets and typeof(secrets.BASE_URL) == "string" and #secrets.BASE_URL > 0 then
		return secrets.BASE_URL
	end
	return Config.API_BASE
end

-- A missing secret used to be a SILENT infinite hang: no HTTP status, so the
-- session retry loop never gave up and players sat on "The realm is waking…"
-- forever with only the Output knowing why (audit finding 8.6). Warn loudly,
-- once a minute, so a fresh clone diagnoses itself.
local warnedNoSecret = 0
local function warnNoSecret()
	if os.clock() - warnedNoSecret > 60 then
		warnedNoSecret = os.clock()
		warn("[ApiClient] SecretConfig.luau is missing or has no KEY - the world is unreachable. "
			.. "Copy SecretConfig.example.luau to SecretConfig.luau and fill in the key.")
	end
end

-- Full form: (answered, status, decodedBody | reasonString).
-- `answered=true` means the world server gave an HTTP answer (any status) and
-- the body decoded; the answer is FINAL - never retried. `answered=false`
-- means transport failure after bounded retries; nothing is known to have
-- happened. Command payloads carry commandId, so transport retries can never
-- double-charge.
function ApiClient.postFull(path: string, body: { [string]: any }): (boolean, number?, any)
	local key = secretKey()
	if not key then
		warnNoSecret()
		return false, nil, "NO_SECRET"
	end
	local payload = HttpService:JSONEncode(body)
	local delays = { 1, 2 }
	for attempt = 1, 3 do
		local ok, response = pcall(function()
			return HttpService:RequestAsync({
				Url = baseUrl() .. path,
				Method = "POST",
				Headers = { ["Content-Type"] = "application/json", ["x-kingsage-key"] = key },
				Body = payload,
			})
		end)
		if ok then
			local decodedOk, decoded = pcall(function()
				return HttpService:JSONDecode(response.Body)
			end)
			if decodedOk then
				return true, response.StatusCode, decoded
			end
			return true, response.StatusCode, "BAD_JSON"
		end
		if attempt < 3 then
			task.wait(delays[attempt])
		end
	end
	return false, nil, "UNREACHABLE"
end

-- Simple form used by session/state: (true, body) only on HTTP success.
function ApiClient.post(path: string, body: { [string]: any }): (boolean, any)
	local answered, status, decoded = ApiClient.postFull(path, body)
	if not answered then
		return false, decoded
	end
	if status and status >= 200 and status < 300 and typeof(decoded) == "table" then
		return true, decoded
	end
	local code = if typeof(decoded) == "table"
		then tostring((decoded :: any).code or ((decoded :: any).error and (decoded :: any).error.code) or "?")
		else tostring(decoded)
	return false, string.format("HTTP_%d:%s", status or 0, code)
end

return ApiClient
