--!strict
-- Shared time helpers. One parser for the world server's ISO timestamps so
-- server clockOffset and client countdowns can never disagree on parsing.
local TimeUtil = {}

function TimeUtil.isoToEpoch(iso: string?): number?
	if typeof(iso) ~= "string" then
		return nil
	end
	local ok, dateTime = pcall(DateTime.fromIsoDate, iso)
	if ok and dateTime then
		return dateTime.UnixTimestamp
	end
	return nil
end

return TimeUtil
