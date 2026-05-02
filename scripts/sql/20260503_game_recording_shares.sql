alter table game_recordings
  add column if not exists share_token text;

alter table game_recordings
  add column if not exists share_created_at timestamptz;

create unique index if not exists game_recordings_share_token_idx
  on game_recordings (share_token)
  where share_token is not null;
