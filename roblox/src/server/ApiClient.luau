--!strict
-- The ONLY module allowed to speak HTTP. Holds the shared secret, retries
-- transient transport failures, and never lies: an answer from the server is
-- final, and no answer is reported as UNREACHABLE (never as success).
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("WorldShared"):WaitForChild("Config"))

local ApiClient = {}

local function secretKey(): string?
	local module = script.Parent:FindFirstChild("SecretConfig")
	if not module then
		return nil
	end
	local ok, secrets = pcall(require, module)
	if ok and typeof(secrets) == "table" and typeof((secrets :: any).KEY) == "string" then
		return (secrets :: any).KEY
	end
	return nil
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
		return false, nil, "NO_SECRET"
	end
	local payload = HttpService:JSONEncode(body)
	local delays = { 1, 2 }
	for attempt = 1, 3 do
		local ok, response = pcall(function()
			return HttpService:RequestAsync({
				Url = Config.API_BASE .. path,
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
