alter table game_recordings
  add column if not exists analysis_data jsonb,
  add column if not exists analysis_url text,
  add column if not exists analysis_status text not null default 'pending',
  add column if not exists analysis_error text,
  add column if not exists analysis_created_at timestamptz;

alter table game_recordings
  drop constraint if exists game_recordings_analysis_status_check;

alter table game_recordings
  add constraint game_recordings_analysis_status_check
  check (analysis_status in ('pending', 'ready', 'failed'));

create index if not exists game_recordings_analysis_ready_idx
  on game_recordings (user_id, analysis_created_at desc)
  where analysis_status = 'ready';
