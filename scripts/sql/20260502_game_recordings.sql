create table if not exists game_recordings (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  game_session_id text references game_sessions(id) on delete set null,
  status text not null default 'recording' check (status in ('recording', 'completed', 'abandoned')),
  player_count integer not null,
  difficulty text,
  used_custom_key boolean not null default false,
  mode_flags jsonb not null default '{}'::jsonb,
  player_snapshot jsonb not null default '[]'::jsonb,
  initial_state jsonb,
  final_state jsonb,
  winner text check (winner is null or winner in ('wolf', 'villager')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists game_recording_events (
  id text primary key default gen_random_uuid()::text,
  recording_id text not null references game_recordings(id) on delete cascade,
  seq integer not null,
  event_type text not null check (event_type in ('speech', 'system', 'phase', 'vote', 'death', 'snapshot', 'game_end')),
  message_id text,
  task_id text,
  day integer,
  phase text,
  actor_player_id text,
  actor_seat integer,
  actor_name text,
  text_content text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (recording_id, seq),
  unique (recording_id, message_id)
);

create table if not exists game_recording_assets (
  id text primary key default gen_random_uuid()::text,
  recording_id text not null references game_recordings(id) on delete cascade,
  event_id text references game_recording_events(id) on delete set null,
  task_id text not null,
  kind text not null default 'tts' check (kind in ('tts')),
  provider text not null default 'minimax',
  voice_id text,
  text_hash text,
  oss_key text,
  public_url text,
  mime_type text,
  bytes integer,
  duration_ms integer,
  upload_status text not null default 'pending' check (upload_status in ('pending', 'uploaded', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recording_id, task_id)
);

create index if not exists game_recordings_user_idx on game_recordings (user_id, created_at desc);
create index if not exists game_recordings_session_idx on game_recordings (game_session_id);
create index if not exists game_recording_events_recording_seq_idx on game_recording_events (recording_id, seq);
create index if not exists game_recording_assets_recording_task_idx on game_recording_assets (recording_id, task_id);
