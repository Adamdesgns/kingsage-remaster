-- Copy this file to SecretConfig.luau (gitignored) and fill in the real key.
-- The value must equal KINGSAGE_ROBLOX_KEY on the world server.
-- NEVER commit the real key.
--
-- BASE_URL is optional: leave it out in Studio (Config.API_BASE's local dev
-- server is used) and set it for a published place pointing at the hosted
-- world, e.g. "https://kingsmarch.example.com". See docs/ops/vps-runbook.md.
return {
	KEY = "PUT-THE-SHARED-SECRET-HERE",
	-- BASE_URL = "https://your-hosted-world.example.com",
}
