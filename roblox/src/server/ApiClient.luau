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

-- Returns (true, decodedTable) or (false, reasonString).
-- Retries only when NO HTTP answer arrived (transport failure). Once the
-- server answered - success or rejection - that answer stands. Command
-- payloads carry commandId, so transport retries can never double-charge.
function ApiClient.post(path: string, body: { [string]: any }): (boolean, any)
	local key = secretKey()
	if not key then
		return false, "NO_SECRET"
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
			if response.Success and decodedOk then
				return true, decoded
			end
			local code = if decodedOk and typeof(decoded) == "table" then tostring((decoded :: any).code or (decoded :: any).error and (decoded :: any).error.code or "?") else "BAD_JSON"
			return false, string.format("HTTP_%d:%s", response.StatusCode, code)
		end
		if attempt < 3 then
			task.wait(delays[attempt])
		end
	end
	return false, "UNREACHABLE"
end

return ApiClient
