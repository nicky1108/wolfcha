import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { dbQuery, withTransaction } from "@/lib/db";
import type {
  RecordingAppendEventsRequest,
  RecordingCompleteRequest,
  RecordingCreateRequest,
  RecordingEventInput,
  RecordingEventType,
  RecordingPostRequest,
  RecordingSaveAnalysisRequest,
  RecordingStatus,
} from "@/lib/game-recording-types";

export const dynamic = "force-dynamic";

const RECORDING_EVENT_TYPES = new Set<RecordingEventType>([
  "speech",
  "system",
  "phase",
  "vote",
  "death",
  "snapshot",
  "game_end",
]);

const RECORDING_STATUSES = new Set<RecordingStatus>(["recording", "completed", "abandoned"]);

type RecordingListRow = {
  id: string;
  game_session_id: string | null;
  status: RecordingStatus;
  player_count: number | string;
  difficulty: string | null;
  used_custom_key: boolean;
  mode_flags: unknown;
  player_snapshot: unknown;
  winner: "wolf" | "villager" | null;
  analysis_url: string | null;
  analysis_status: "pending" | "ready" | "failed";
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  event_count: number | string;
  audio_count: number | string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGuestUserId(userId: string): boolean {
  return userId.startsWith("guest_");
}

function sanitizeJson(value: unknown, fallback: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return fallback;
  }
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function normalizeEvent(event: RecordingEventInput): RecordingEventInput | null {
  if (!RECORDING_EVENT_TYPES.has(event.eventType)) return null;
  const textContent = typeof event.textContent === "string" ? event.textContent.trim() : null;
  return {
    eventType: event.eventType,
    messageId: typeof event.messageId === "string" && event.messageId.trim() ? event.messageId.trim() : undefined,
    taskId: typeof event.taskId === "string" && event.taskId.trim() ? event.taskId.trim() : undefined,
    day: typeof event.day === "number" && Number.isFinite(event.day) ? Math.floor(event.day) : null,
    phase: typeof event.phase === "string" && event.phase.trim() ? event.phase.trim() : null,
    actorPlayerId:
      typeof event.actorPlayerId === "string" && event.actorPlayerId.trim() ? event.actorPlayerId.trim() : null,
    actorSeat: typeof event.actorSeat === "number" && Number.isFinite(event.actorSeat)
      ? Math.floor(event.actorSeat)
      : null,
    actorName: typeof event.actorName === "string" && event.actorName.trim() ? event.actorName.trim() : null,
    textContent,
    payload: isRecord(event.payload) ? event.payload : {},
    occurredAt:
      typeof event.occurredAt === "string" && !Number.isNaN(Date.parse(event.occurredAt))
        ? new Date(event.occurredAt).toISOString()
        : new Date().toISOString(),
  };
}

function toRecordingListItem(row: RecordingListRow) {
  return {
    id: row.id,
    gameSessionId: row.game_session_id,
    status: row.status,
    playerCount: Number(row.player_count ?? 0),
    difficulty: row.difficulty,
    usedCustomKey: Boolean(row.used_custom_key),
    modeFlags: row.mode_flags ?? {},
    playerSnapshot: row.player_snapshot ?? [],
    winner: row.winner,
    analysisUrl: row.analysis_url,
    analysisStatus: row.analysis_status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    eventCount: Number(row.event_count ?? 0),
    audioCount: Number(row.audio_count ?? 0),
  };
}

function normalizeDbWinner(winner: unknown): "wolf" | "villager" | null {
  if (winner === "wolf") return "wolf";
  if (winner === "village" || winner === "villager") return "villager";
  return null;
}

function buildAnalysisUrl(recordingId: string, explicitUrl?: string): string {
  if (explicitUrl && explicitUrl.trim()) return explicitUrl.trim();
  return `/recordings/${recordingId}/analysis`;
}

async function createRecording(userId: string, payload: RecordingCreateRequest) {
  const playerCount = Number(payload.playerCount);
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 20) {
    return NextResponse.json({ error: "Invalid playerCount" }, { status: 400 });
  }

  if (payload.gameSessionId) {
    const session = await dbQuery<{ id: string }>(
      "select id from game_sessions where id = $1 and user_id = $2 limit 1",
      [payload.gameSessionId, userId]
    );
    if (!session.rows[0]) {
      return NextResponse.json({ error: "Game session not found" }, { status: 404 });
    }
  }

  const result = await dbQuery<{
    id: string;
    status: RecordingStatus;
    created_at: string;
  }>(
    `
      insert into game_recordings (
        user_id,
        game_session_id,
        player_count,
        difficulty,
        used_custom_key,
        mode_flags,
        player_snapshot,
        initial_state
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
      returning id, status, created_at
    `,
    [
      userId,
      payload.gameSessionId || null,
      playerCount,
      payload.difficulty || null,
      payload.usedCustomKey === true,
      JSON.stringify(sanitizeJson(payload.modeFlags, {})),
      JSON.stringify(sanitizeJson(payload.playerSnapshot, [])),
      payload.initialState === undefined ? null : JSON.stringify(sanitizeJson(payload.initialState, null)),
    ]
  );

  return NextResponse.json({
    success: true,
    recordingId: result.rows[0].id,
    status: result.rows[0].status,
    createdAt: result.rows[0].created_at,
  });
}

async function appendEvents(userId: string, payload: RecordingAppendEventsRequest) {
  if (!payload.recordingId || !Array.isArray(payload.events)) {
    return NextResponse.json({ error: "Invalid appendEvents payload" }, { status: 400 });
  }

  const normalizedEvents = payload.events
    .map((event) => (isRecord(event) ? normalizeEvent(event as RecordingEventInput) : null))
    .filter((event): event is RecordingEventInput => event !== null);

  if (normalizedEvents.length === 0) {
    return NextResponse.json({ success: true, inserted: 0 });
  }

  const result = await withTransaction(async (client) => {
    const recording = await client.query<{ id: string }>(
      "select id from game_recordings where id = $1 and user_id = $2 limit 1",
      [payload.recordingId, userId]
    );
    if (!recording.rows[0]) return { missing: true, inserted: 0 };

    const maxSeq = await client.query<{ max_seq: number | string | null }>(
      "select coalesce(max(seq), 0) as max_seq from game_recording_events where recording_id = $1",
      [payload.recordingId]
    );
    let seq = Number(maxSeq.rows[0]?.max_seq ?? 0);
    let inserted = 0;

    for (const event of normalizedEvents) {
      seq += 1;
      const insertedRow = await client.query<{ id: string }>(
        `
          insert into game_recording_events (
            recording_id,
            seq,
            event_type,
            message_id,
            task_id,
            day,
            phase,
            actor_player_id,
            actor_seat,
            actor_name,
            text_content,
            payload,
            occurred_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
          on conflict (recording_id, message_id) do nothing
          returning id
        `,
        [
          payload.recordingId,
          seq,
          event.eventType,
          event.messageId || null,
          event.taskId || null,
          event.day ?? null,
          event.phase || null,
          event.actorPlayerId || null,
          event.actorSeat ?? null,
          event.actorName || null,
          event.textContent || null,
          JSON.stringify(sanitizeJson(event.payload, {})),
          event.occurredAt || new Date().toISOString(),
        ]
      );
      if (insertedRow.rows[0]) inserted += 1;
    }

    await client.query("update game_recordings set updated_at = now() where id = $1", [payload.recordingId]);
    return { missing: false, inserted };
  });

  if (result.missing) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, inserted: result.inserted });
}

async function completeRecording(userId: string, payload: RecordingCompleteRequest) {
  if (!payload.recordingId) {
    return NextResponse.json({ error: "Missing recordingId" }, { status: 400 });
  }

  const status = payload.status && RECORDING_STATUSES.has(payload.status) ? payload.status : "completed";
  const result = await dbQuery<{ id: string }>(
    `
      update game_recordings
      set
        status = $3,
        winner = $4,
        final_state = $5::jsonb,
        ended_at = coalesce(ended_at, now()),
        updated_at = now()
      where id = $1 and user_id = $2
      returning id
    `,
    [
      payload.recordingId,
      userId,
      status,
      normalizeDbWinner(payload.winner),
      payload.finalState === undefined ? null : JSON.stringify(sanitizeJson(payload.finalState, null)),
    ]
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

async function saveAnalysis(userId: string, payload: RecordingSaveAnalysisRequest) {
  if (!payload.recordingId || !isRecord(payload.analysisData)) {
    return NextResponse.json({ error: "Invalid saveAnalysis payload" }, { status: 400 });
  }

  const analysisUrl = buildAnalysisUrl(payload.recordingId, payload.analysisUrl);
  const result = await dbQuery<{ id: string; analysis_url: string | null }>(
    `
      update game_recordings
      set
        analysis_data = $3::jsonb,
        analysis_url = $4,
        analysis_status = 'ready',
        analysis_error = null,
        analysis_created_at = now(),
        updated_at = now()
      where id = $1 and user_id = $2
      returning id, analysis_url
    `,
    [
      payload.recordingId,
      userId,
      JSON.stringify(sanitizeJson(payload.analysisData, null)),
      analysisUrl,
    ]
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    analysisUrl: result.rows[0].analysis_url,
  });
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (isGuestUserId(auth.user.id)) {
    return NextResponse.json({ recordings: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
  }

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1, 1000);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 50);
  const offset = (page - 1) * pageSize;

  const [countResult, rowsResult] = await Promise.all([
    dbQuery<{ total: number | string }>("select count(*)::integer as total from game_recordings where user_id = $1", [
      auth.user.id,
    ]),
    dbQuery<RecordingListRow>(
      `
        select
          gr.id,
          gr.game_session_id,
          gr.status,
          gr.player_count,
          gr.difficulty,
          gr.used_custom_key,
          gr.mode_flags,
          gr.player_snapshot,
          gr.winner,
          gr.analysis_url,
          gr.analysis_status,
          gr.started_at,
          gr.ended_at,
          gr.created_at,
          gr.updated_at,
          coalesce(ec.event_count, 0)::integer as event_count,
          coalesce(ac.audio_count, 0)::integer as audio_count
        from game_recordings gr
        left join (
          select recording_id, count(*)::integer as event_count
          from game_recording_events
          group by recording_id
        ) ec on ec.recording_id = gr.id
        left join (
          select recording_id, count(*)::integer as audio_count
          from game_recording_assets
          where upload_status = 'uploaded'
          group by recording_id
        ) ac on ac.recording_id = gr.id
        where gr.user_id = $1
        order by gr.created_at desc, gr.id desc
        limit $2 offset $3
      `,
      [auth.user.id, pageSize, offset]
    ),
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json({
    page,
    pageSize,
    total,
    totalPages,
    recordings: rowsResult.rows.map(toRecordingListItem),
  });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (isGuestUserId(auth.user.id)) {
    return NextResponse.json({ error: "Recording is unavailable for guest sessions" }, { status: 403 });
  }

  let payload: RecordingPostRequest;
  try {
    const raw: unknown = await request.json();
    if (!isRecord(raw) || typeof raw.action !== "string") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    payload = raw as unknown as RecordingPostRequest;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (payload.action === "create") return createRecording(auth.user.id, payload);
  if (payload.action === "appendEvents") return appendEvents(auth.user.id, payload);
  if (payload.action === "complete") return completeRecording(auth.user.id, payload);
  if (payload.action === "saveAnalysis") return saveAnalysis(auth.user.id, payload);

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
