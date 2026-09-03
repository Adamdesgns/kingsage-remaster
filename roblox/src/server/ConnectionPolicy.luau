--!strict
-- Pure connection boundary, shared by ApiClient and executable tests.
-- Development never reads production credentials. Published development
-- builds and Studio production builds both refuse to send requests.
local ConnectionPolicy = {}

export type Connection = { baseUrl: string, key: string }

function ConnectionPolicy.resolve(environment: any, isStudio: boolean, devBase: string, secrets: any): (Connection?, string?)
	if environment == "development" then
		if not isStudio then
			return nil, "DEV_PLACE_REQUIRES_STUDIO"
		end
		if not devBase:match("^http://127%.0%.0%.1:%d+$") then
			return nil, "DEV_ENDPOINT_MUST_BE_LOOPBACK"
		end
		return { baseUrl = devBase, key = "dev-secret-local-0001" }, nil
	end
	if environment ~= "production" then
		return nil, "NO_WORLD_ENVIRONMENT"
	end
	if isStudio then
		return nil, "PRODUCTION_REQUIRES_PUBLISHED_PLACE"
	end
	if typeof(secrets) ~= "table" or typeof(secrets.KEY) ~= "string"
		or #secrets.KEY == 0 or secrets.KEY == "dev-secret-local-0001"
		or secrets.KEY == "PUT-THE-SHARED-SECRET-HERE" then
		return nil, "NO_SECRET"
	end
	if typeof(secrets.BASE_URL) ~= "string" then
		return nil, "INVALID_PRODUCTION_ENDPOINT"
	end
	local host = secrets.BASE_URL:match("^https://([%w%.%-]+)$")
	if not host or host == "localhost" or host:match("^127%.") then
		return nil, "INVALID_PRODUCTION_ENDPOINT"
	end
	return { baseUrl = secrets.BASE_URL, key = secrets.KEY }, nil
end

return ConnectionPolicy
