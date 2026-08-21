-- Roblox identity: one Roblox account maps to one player forever.
CREATE TABLE IF NOT EXISTS roblox_players (
  roblox_user_id INTEGER PRIMARY KEY,
  player_id TEXT NOT NULL UNIQUE REFERENCES local_players(id),
  created_at TEXT NOT NULL
);
