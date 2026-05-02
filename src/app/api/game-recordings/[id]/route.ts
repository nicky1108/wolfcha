import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { dbQuery } from "@/lib/db";
import { buildRecordingAnalysisSharePath } from "@/lib/game-recording-share";
import type { RecordingEventType, RecordingStatus } from "@/lib/game-recording-types";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RecordingRow = {
  id: string;
  game_session_id: string | null;
  status: RecordingStatus;
  player_count: number | string;
  difficulty: string | null;
  used_custom_key: boolean;
  mode_flags: unknown;
  player_snapshot: unknown;
  initial_state: unknown;
  final_state: unknown;
  winner: "wolf" | "villager" | null;
  analysis_data: unknown;
  analysis_url: string | null;
  analysis_status: "pending" | "ready" | "failed";
  analysis_error: string | null;
  analysis_created_at: string | null;
  share_token: string | null;
  share_created_at: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

type RecordingEventRow = {
  id: string;
  seq: number | string;
  event_type: RecordingEventType;
  message_id: string | null;
  task_id: string | null;
  day: number | string | null;
  phase: string | null;
  actor_player_id: string | null;
  actor_seat: number | string | null;
  actor_name: string | null;
  text_content: string | null;
  payload: unknown;
  occurred_at: string;
  created_at: string;
};

type RecordingAssetRow = {
  id: string;
  event_id: string | null;
  task_id: string;
  kind: "tts";
  provider: string;
  voice_id: string | null;
  text_hash: string | null;
  oss_key: string | null;
  public_url: string | null;
  mime_type: string | null;
  bytes: number | string | null;
  duration_ms: number | string | null;
  upload_status: "pending" | "uploaded" | "failed" | "skipped";
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function isGuestUserId(userId: string): boolean {
  return userId.startsWith("guest_");
}

function toRecording(row: RecordingRow, shareToken: string | null) {
  return {
    id: row.id,
    gameSessionId: row.game_session_id,
    status: row.status,
    playerCount: Number(row.player_count ?? 0),
    difficulty: row.difficulty,
    usedCustomKey: Boolean(row.used_custom_key),
    modeFlags: row.mode_flags ?? {},
    playerSnapshot: row.player_snapshot ?? [],
    initialState: row.initial_state ?? null,
    finalState: row.final_state ?? null,
    winner: row.winner,
    analysisData: row.analysis_data ?? null,
    analysisUrl:
      shareToken && row.analysis_url && row.analysis_status === "ready"
        ? buildRecordingAnalysisSharePath(row.id, shareToken)
        : row.analysis_url,
    analysisStatus: row.analysis_status,
    analysisError: row.analysis_error,
    analysisCreatedAt: row.analysis_created_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shareCreatedAt: row.share_created_at,
  };
}

function toEvent(row: RecordingEventRow) {
  return {
    id: row.id,
    seq: Number(row.seq ?? 0),
    eventType: row.event_type,
    messageId: row.message_id,
    taskId: row.task_id,
    day: row.day === null ? null : Number(row.day),
    phase: row.phase,
    actorPlayerId: row.actor_player_id,
    actorSeat: row.actor_seat === null ? null : Number(row.actor_seat),
    actorName: row.actor_name,
    textContent: row.text_content,
    payload: row.payload ?? {},
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

function toAsset(row: RecordingAssetRow) {
  return {
    id: row.id,
    eventId: row.event_id,
    taskId: row.task_id,
    kind: row.kind,
    provider: row.provider,
    voiceId: row.voice_id,
    textHash: row.text_hash,
    ossKey: row.oss_key,
    publicUrl: row.public_url,
    mimeType: row.mime_type,
    bytes: row.bytes === null ? null : Number(row.bytes),
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    uploadStatus: row.upload_status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Recording not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const shareToken = searchParams.get("share")?.trim() || "";
  let query: string;
  let params: unknown[];
  let effectiveShareToken: string | null = null;

  if (shareToken) {
    query = `
      select
        id,
        game_session_id,
        status,
        player_count,
        difficulty,
        used_custom_key,
        mode_flags,
        player_snapshot,
        initial_state,
        final_state,
        winner,
        analysis_data,
        analysis_url,
        analysis_status,
        analysis_error,
        analysis_created_at,
        share_token,
        share_created_at,
        started_at,
        ended_at,
        created_at,
        updated_at
      from game_recordings
      where id = $1 and share_token = $2
      limit 1
    `;
    params = [id, shareToken];
    effectiveShareToken = shareToken;
  } else {
    const auth = await authenticateRequest(request);
    if ("error" in auth) return auth.error;
    if (isGuestUserId(auth.user.id)) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }
    query = `
      select
        id,
        game_session_id,
        status,
        player_count,
        difficulty,
        used_custom_key,
        mode_flags,
        player_snapshot,
        initial_state,
        final_state,
        winner,
        analysis_data,
        analysis_url,
        analysis_status,
        analysis_error,
        analysis_created_at,
        share_token,
        share_created_at,
        started_at,
        ended_at,
        created_at,
        updated_at
      from game_recordings
      where id = $1 and user_id = $2
      limit 1
    `;
    params = [id, auth.user.id];
  }

  const recordingResult = await dbQuery<RecordingRow>(
    query,
    params
  );

  const recording = recordingResult.rows[0];
  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const [eventsResult, assetsResult] = await Promise.all([
    dbQuery<RecordingEventRow>(
      `
        select
          id,
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
          occurred_at,
          created_at
        from game_recording_events
        where recording_id = $1
        order by seq asc, created_at asc
      `,
      [id]
    ),
    dbQuery<RecordingAssetRow>(
      `
        select
          id,
          event_id,
          task_id,
          kind,
          provider,
          voice_id,
          text_hash,
          oss_key,
          public_url,
          mime_type,
          bytes,
          duration_ms,
          upload_status,
          error_message,
          created_at,
          updated_at
        from game_recording_assets
        where recording_id = $1
        order by created_at asc, id asc
      `,
      [id]
    ),
  ]);

  return NextResponse.json({
    recording: toRecording(recording, effectiveShareToken),
    events: eventsResult.rows.map(toEvent),
    assets: assetsResult.rows.map(toAsset),
    access: effectiveShareToken ? "shared" : "owner",
  });
}
