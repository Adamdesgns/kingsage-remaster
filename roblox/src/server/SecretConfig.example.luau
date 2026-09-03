-- Copy this file to SecretConfig.luau (gitignored) and fill in the real key.
-- The value must equal KINGSAGE_ROBLOX_KEY on the world server.
-- NEVER commit the real key.
--
-- Only live.project.json loads this file, in a published Roblox server.
-- BASE_URL is required and must be the HTTPS origin (no trailing slash).
-- Development/demo builds exclude SecretConfig and use the local dev key.
-- See docs/ops/vps-runbook.md.
return {
	KEY = "PUT-THE-SHARED-SECRET-HERE",
	BASE_URL = "https://your-hosted-world.example.com",
}
