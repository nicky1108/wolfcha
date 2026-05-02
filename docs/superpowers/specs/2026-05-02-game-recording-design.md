# Game Recording Design

## Decision

Use Postgres for structured replay data and Aliyun OSS for generated speech audio.
Authenticated formal games are recorded by default. Guest, demo, and anonymous games are not recorded.

## Context

The current project tracks only aggregate game statistics in `game_sessions`.
Text speech exists in client `GameState.messages`, and generated TTS audio is returned by `/api/tts` as a response body, then cached in browser memory by `AudioManager`.
After refresh or game end, there is no durable record of the detailed process or audio.

The app now uses the Postgres-backed Supabase compatibility adapter on the server, so the recording feature should store metadata in the same database rather than reintroducing Supabase storage.
Existing static audio acceleration uses a public OSS base URL, but durable TTS recording requires server-side OSS write credentials.

## Goals

- Persist a complete formal game process for later review.
- Preserve speech text, system announcements, phase changes, important actions, vote results, deaths, role/model/player snapshots, and final outcome.
- Preserve generated character speech audio when OSS upload is configured.
- Keep gameplay usable if recording or audio upload fails.
- Add a user-facing replay entry point from account/profile history.

## Non-Goals

- Do not record guest/demo games.
- Do not record raw browser screen video.
- Do not store audio blobs in Postgres.
- Do not block LLM or TTS gameplay flow on replay persistence.
- Do not expose another user's recordings through replay APIs.

## Storage

Add three tables:

```sql
create table if not exists game_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  game_session_id uuid references game_sessions(id) on delete set null,
  status text not null default 'recording',
  player_count integer not null,
  difficulty text,
  used_custom_key boolean not null default false,
  mode_flags jsonb not null default '{}'::jsonb,
  player_snapshot jsonb not null default '[]'::jsonb,
  initial_state jsonb,
  final_state jsonb,
  winner text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists game_recording_events (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references game_recordings(id) on delete cascade,
  seq integer not null,
  event_type text not null,
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
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references game_recordings(id) on delete cascade,
  event_id uuid references game_recording_events(id) on delete set null,
  task_id text not null,
  kind text not null default 'tts',
  provider text not null default 'minimax',
  voice_id text,
  text_hash text,
  oss_key text,
  public_url text,
  mime_type text,
  bytes integer,
  duration_ms integer,
  upload_status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  unique (recording_id, task_id)
);
```

Indexes:

- `game_recordings(user_id, created_at desc)`
- `game_recordings(game_session_id)`
- `game_recording_events(recording_id, seq)`
- `game_recording_assets(recording_id, task_id)`

Add these table names to the Postgres Supabase compatibility adapter allowlist only if the implementation uses `.from(table)`.
For event append operations, direct `dbQuery` is preferred because it can enforce ownership and sequence allocation in one transaction.

## OSS Configuration

Use server-only env vars:

```env
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=wolfcha
ALIYUN_OSS_ACCESS_KEY_ID=<server access key id>
ALIYUN_OSS_ACCESS_KEY_SECRET=<server access key secret>
ALIYUN_OSS_PUBLIC_BASE_URL=https://wolfcha.oss-cn-hangzhou.aliyuncs.com/
ALIYUN_OSS_RECORDING_PREFIX=recordings
```

`NEXT_PUBLIC_AUDIO_ASSET_BASE_URL` remains for static public audio reads and is not enough for uploads.

The first implementation should avoid a new package dependency unless needed.
Aliyun OSS supports authenticated REST `PUT`; the route can sign requests with Node `crypto`.
If that becomes brittle, `ali-oss` can be introduced in a later small change after approval.

## API Design

Add authenticated routes:

- `POST /api/game-recordings`
  - `create`: create a recording for the current user and optional `gameSessionId`.
  - `appendEvents`: append deduped message/action/state events.
  - `complete`: mark final state, winner, and ended timestamp.
- `GET /api/game-recordings`
  - list current user's recordings with pagination.
- `GET /api/game-recordings/[id]`
  - return recording metadata, ordered events, and audio asset metadata.

Extend `/api/tts` without breaking existing audio playback:

- Accept optional recording fields in the JSON body: `recordingId`, `taskId`, `messageId`, `segmentIndex`, `playerId`, `phase`, `day`.
- After TTS audio is generated, upload the buffer to OSS if recording fields and OSS credentials are present.
- Return the same audio response body as today.
- Add response headers when upload succeeds:
  - `X-Wolfcha-Recording-Asset-Id`
  - `X-Wolfcha-Audio-Url`
  - `X-Wolfcha-Audio-Upload-Status`
- If OSS upload fails, return playable audio anyway and set upload status to `failed` in the asset row.

## Client Data Flow

Add a small recorder client module or hook:

1. When a formal authenticated game starts and `gameSessionTracker.start(config)` returns a session id, create a recording.
2. Capture an initial player snapshot after players are assigned:
   - seat, display name, role, alignment, model, persona voice id, human flag.
3. Watch `GameState` changes and append only new information:
   - new `messages` by `message.id`;
   - phase/day changes;
   - vote result snapshots;
   - deaths and game end.
4. Keep a local dedupe set for message ids and state-event keys.
5. On game end, send `complete` with final state and winner.

Audio recording integrates through `AudioManager`:

- Extend `AudioTask` with optional recording metadata.
- When speech segments are converted into tasks, include `recordingId`, `messageId` when available, and a stable `taskId`.
- `/api/tts` uploads the generated audio and returns the public URL in headers.
- `AudioManager` emits an asset-ready event or calls the recorder to attach URL metadata.

For the first pass, text replay must not depend on audio success.
If task-to-message matching is imperfect for streaming speech, the fallback key is `(recordingId, playerId, day, phase, text hash, segment index)`.

## Replay UI

Add:

- Account/profile tab: "对局回放"
  - paginated list with start time, player count, mode, winner, duration, audio availability.
- Replay page: `/recordings/[id]`
  - timeline grouped by day and phase;
  - system events visually separated from player speech;
  - player speech rows show seat, name, role/model snapshot, text, and audio play button when available;
  - final result panel.

The replay page should be read-only and must fetch data from server APIs, not from `localStorage`.

## Error Handling

- Recording create failure: log and continue game.
- Event append failure: retry lightweight once, then continue.
- OSS upload failure: keep text event, store failed asset status, return TTS audio normally.
- Unauthorized access: return `404` or `403`; never reveal another user's recording id exists.
- Partial recordings: keep `status = 'recording'` until completion; list can show "未完成" if a game is abandoned.

## Testing

Minimum verification:

- Unit-style script for event dedupe and payload normalization.
- API test or route-level smoke for create/list/detail authorization.
- TTS route smoke with OSS disabled to confirm binary response is unchanged.
- Manual local flow:
  - login;
  - start one formal game;
  - generate at least one AI speech with voice;
  - confirm recording rows and replay text;
  - with OSS env present, confirm audio URL is saved and playable.

## Implementation Order

1. Add SQL migration and TypeScript database shapes.
2. Add server recording API routes with auth and ownership checks.
3. Add client recorder hook and wire it to game start/state/end.
4. Extend TTS/audio task metadata and OSS upload path.
5. Add account replay list and replay detail page.
6. Run typecheck, targeted lint, and local smoke.

## Open Operational Requirement

Production audio persistence requires OSS write credentials in server env.
Without those credentials, text and game-state replay still work, but speech audio is not durable.
