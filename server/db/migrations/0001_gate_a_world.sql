BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE player_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_auth_subject text NOT NULL UNIQUE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE worlds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version integer NOT NULL CHECK (contract_version > 0),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  name text NOT NULL,
  seed text NOT NULL,
  width smallint NOT NULL DEFAULT 50 CHECK (width = 50),
  height smallint NOT NULL DEFAULT 50 CHECK (height = 50),
  status text NOT NULL DEFAULT 'forming' CHECK (status IN ('forming','active','won','archived','paused')),
  player_capacity integer NOT NULL DEFAULT 50 CHECK (player_capacity BETWEEN 2 AND 500),
  winner_kingdom_id uuid,
  won_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE world_members (
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player','spectator','moderator')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, player_id)
);

CREATE TABLE alliances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  created_by_player_id uuid NOT NULL REFERENCES player_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, name)
);

CREATE TABLE kingdoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  controller_player_id uuid REFERENCES player_profiles(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  seat_kind text NOT NULL CHECK (seat_kind IN ('human','ai')),
  war_victory_points bigint NOT NULL DEFAULT 0 CHECK (war_victory_points >= 0),
  villages_conquered integer NOT NULL DEFAULT 0 CHECK (villages_conquered >= 0),
  alive boolean NOT NULL DEFAULT true,
  state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, name),
  UNIQUE (world_id, controller_player_id),
  CHECK ((seat_kind = 'human' AND controller_player_id IS NOT NULL) OR (seat_kind = 'ai' AND controller_player_id IS NULL))
);

ALTER TABLE worlds
  ADD CONSTRAINT worlds_winner_kingdom_fk
  FOREIGN KEY (winner_kingdom_id) REFERENCES kingdoms(id) ON DELETE SET NULL;

CREATE TABLE alliance_members (
  alliance_id uuid NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  kingdom_id uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  member_role text NOT NULL DEFAULT 'member' CHECK (member_role IN ('leader','officer','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alliance_id, kingdom_id),
  UNIQUE (kingdom_id)
);

CREATE TABLE villages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  kingdom_id uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  x smallint NOT NULL CHECK (x BETWEEN 0 AND 49),
  y smallint NOT NULL CHECK (y BETWEEN 0 AND 49),
  is_capital boolean NOT NULL DEFAULT false,
  loyalty smallint NOT NULL DEFAULT 100 CHECK (loyalty BETWEEN 0 AND 100),
  wood numeric(20,4) NOT NULL DEFAULT 0 CHECK (wood >= 0),
  stone numeric(20,4) NOT NULL DEFAULT 0 CHECK (stone >= 0),
  iron numeric(20,4) NOT NULL DEFAULT 0 CHECK (iron >= 0),
  resource_materialized_at timestamptz NOT NULL DEFAULT now(),
  defense_layout jsonb NOT NULL DEFAULT '{"version":1,"objects":[]}'::jsonb,
  state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, x, y)
);

CREATE UNIQUE INDEX villages_one_capital_per_kingdom
  ON villages (kingdom_id) WHERE is_capital;

CREATE TABLE village_buildings (
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  building_type text NOT NULL CHECK (building_type IN ('hq','timber','quarry','iron','farm','warehouse','barracks','wall','academy','stable','workshop','smithy','market')),
  level smallint NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 30),
  PRIMARY KEY (village_id, building_type)
);

CREATE TABLE village_armies (
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  troop_type text NOT NULL CHECK (troop_type IN ('spear','sword','axe','archer','scout','lightCavalry','ram','noble')),
  quantity bigint NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (village_id, troop_type)
);

CREATE TABLE kingdom_troop_levels (
  kingdom_id uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  troop_type text NOT NULL CHECK (troop_type IN ('spear','sword','axe','archer','scout','lightCavalry','ram','noble')),
  level smallint NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kingdom_id, troop_type)
);

CREATE TABLE construction_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  building_type text NOT NULL CHECK (building_type IN ('hq','timber','quarry','iron','farm','warehouse','barracks','wall','academy','stable','workshop','smithy','market')),
  target_level smallint NOT NULL CHECK (target_level BETWEEN 1 AND 30),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','active','complete','cancelled')),
  starts_at timestamptz,
  completes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recruitment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  troop_type text NOT NULL CHECK (troop_type IN ('spear','sword','axe','archer','scout','lightCavalry','ram','noble')),
  quantity integer NOT NULL CHECK (quantity > 0),
  quantity_complete integer NOT NULL DEFAULT 0 CHECK (quantity_complete >= 0),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','active','complete','cancelled')),
  starts_at timestamptz,
  completes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity_complete <= quantity)
);

CREATE TABLE research_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  kingdom_id uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  troop_type text NOT NULL CHECK (troop_type IN ('spear','sword','axe','archer','scout','lightCavalry','ram','noble')),
  target_level smallint NOT NULL CHECK (target_level BETWEEN 2 AND 10),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','active','complete','cancelled')),
  starts_at timestamptz,
  completes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kingdom_id, troop_type, target_level)
);

CREATE TABLE marches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  kingdom_id uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  from_village_id uuid NOT NULL REFERENCES villages(id),
  target_village_id uuid NOT NULL REFERENCES villages(id),
  march_kind text NOT NULL CHECK (march_kind IN ('scout','attack','support','return')),
  status text NOT NULL DEFAULT 'outbound' CHECK (status IN ('outbound','arrived','battle','returning','complete','cancelled')),
  army jsonb NOT NULL,
  carry jsonb NOT NULL DEFAULT '{"wood":0,"stone":0,"iron":0}'::jsonb,
  departs_at timestamptz NOT NULL,
  arrives_at timestamptz NOT NULL,
  state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_village_id <> target_village_id),
  CHECK (arrives_at > departs_at)
);

CREATE TABLE battle_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  march_id uuid NOT NULL UNIQUE REFERENCES marches(id) ON DELETE CASCADE,
  attacker_kingdom_id uuid NOT NULL REFERENCES kingdoms(id),
  defender_kingdom_id uuid NOT NULL REFERENCES kingdoms(id),
  target_village_id uuid NOT NULL REFERENCES villages(id),
  target_village_version bigint NOT NULL,
  rules_version integer NOT NULL,
  seed text NOT NULL,
  plan jsonb NOT NULL,
  attacker_snapshot jsonb NOT NULL,
  defender_snapshot jsonb NOT NULL,
  next_order_sequence integer NOT NULL DEFAULT 1 CHECK (next_order_sequence > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolving','attacker_won','defender_won','retreated','invalidated')),
  result jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE battle_orders (
  battle_id uuid NOT NULL REFERENCES battle_sessions(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  order_type text NOT NULL CHECK (order_type IN ('move','retreat')),
  squad text CHECK (squad IN ('vanguard','archers','riders')),
  x numeric(7,3),
  y numeric(7,3),
  battle_time_ms integer NOT NULL CHECK (battle_time_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (battle_id, sequence),
  CHECK ((order_type = 'move' AND squad IS NOT NULL AND x BETWEEN 0 AND 390 AND y BETWEEN 0 AND 844) OR (order_type = 'retreat' AND squad IS NULL AND x IS NULL AND y IS NULL))
);

CREATE TABLE chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_kind text NOT NULL CHECK (channel_kind IN ('global','world','alliance')),
  world_id uuid REFERENCES worlds(id) ON DELETE CASCADE,
  alliance_id uuid REFERENCES alliances(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (channel_kind = 'global' AND world_id IS NULL AND alliance_id IS NULL) OR
    (channel_kind = 'world' AND world_id IS NOT NULL AND alliance_id IS NULL) OR
    (channel_kind = 'alliance' AND world_id IS NOT NULL AND alliance_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX chat_channels_one_global ON chat_channels (channel_kind) WHERE channel_kind = 'global';
CREATE UNIQUE INDEX chat_channels_one_per_world ON chat_channels (world_id) WHERE channel_kind = 'world';
CREATE UNIQUE INDEX chat_channels_one_per_alliance ON chat_channels (alliance_id) WHERE channel_kind = 'alliance';

CREATE TABLE chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_id uuid NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  kingdom_id uuid REFERENCES kingdoms(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  moderation_state text NOT NULL DEFAULT 'visible' CHECK (moderation_state IN ('visible','hidden','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE arena_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','complete')),
  CHECK (ends_at > starts_at)
);

CREATE TABLE player_arena_scores (
  season_id uuid NOT NULL REFERENCES arena_seasons(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  war_victory_points bigint NOT NULL DEFAULT 0 CHECK (war_victory_points >= 0),
  villages_conquered integer NOT NULL DEFAULT 0 CHECK (villages_conquered >= 0),
  capitals_conquered integer NOT NULL DEFAULT 0 CHECK (capitals_conquered >= 0),
  world_wins integer NOT NULL DEFAULT 0 CHECK (world_wins >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, player_id)
);

CREATE TABLE village_conquests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  village_id uuid NOT NULL REFERENCES villages(id),
  previous_kingdom_id uuid NOT NULL REFERENCES kingdoms(id),
  conquering_kingdom_id uuid NOT NULL REFERENCES kingdoms(id),
  conquering_player_id uuid REFERENCES player_profiles(id),
  was_capital boolean NOT NULL,
  war_victory_points integer NOT NULL CHECK (war_victory_points >= 0),
  conquered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, village_id, conquering_kingdom_id),
  CHECK (previous_kingdom_id <> conquering_kingdom_id)
);

CREATE TABLE command_inbox (
  command_id text PRIMARY KEY,
  contract_version integer NOT NULL,
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  actor_player_id uuid NOT NULL REFERENCES player_profiles(id),
  expected_world_version bigint NOT NULL CHECK (expected_world_version >= 0),
  command_type text NOT NULL,
  command_payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('accepted','rejected')),
  result jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE world_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  world_version bigint NOT NULL CHECK (world_version > 0),
  event_sequence smallint NOT NULL CHECK (event_sequence > 0),
  event_type text NOT NULL,
  event_payload jsonb NOT NULL,
  actor_player_id uuid REFERENCES player_profiles(id),
  command_id text REFERENCES command_inbox(command_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, world_version, event_sequence)
);

CREATE INDEX world_members_player_idx ON world_members (player_id, world_id);
CREATE INDEX kingdoms_world_alive_idx ON kingdoms (world_id, alive);
CREATE INDEX villages_world_kingdom_idx ON villages (world_id, kingdom_id);
CREATE INDEX construction_jobs_due_idx ON construction_jobs (world_id, completes_at) WHERE status = 'active';
CREATE INDEX recruitment_jobs_due_idx ON recruitment_jobs (world_id, completes_at) WHERE status = 'active';
CREATE INDEX marches_due_idx ON marches (world_id, arrives_at) WHERE status IN ('outbound','returning');
CREATE INDEX research_jobs_due_idx ON research_jobs (world_id, completes_at) WHERE status = 'active';
CREATE INDEX chat_messages_stream_idx ON chat_messages (channel_id, id) WHERE deleted_at IS NULL AND moderation_state = 'visible';
CREATE INDEX player_arena_scores_rank_idx ON player_arena_scores (season_id, war_victory_points DESC, world_wins DESC);
CREATE INDEX village_conquests_world_idx ON village_conquests (world_id, conquered_at DESC);
CREATE INDEX command_inbox_world_idx ON command_inbox (world_id, received_at);
CREATE INDEX world_events_reconnect_idx ON world_events (world_id, world_version, event_sequence);

COMMIT;
