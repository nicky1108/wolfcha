import type { Alignment, Phase, Role } from "@/types/game";
import type { GameAnalysisData } from "@/types/analysis";

export type RecordingStatus = "recording" | "completed" | "abandoned";
export type RecordingEventType =
  | "speech"
  | "system"
  | "phase"
  | "vote"
  | "death"
  | "snapshot"
  | "game_end";

export interface RecordingPlayerSnapshot {
  playerId: string;
  seat: number;
  seatNumber: number;
  displayName: string;
  role: Role;
  alignment: Alignment;
  isHuman: boolean;
  model: string | null;
  provider: string | null;
  voiceId: string | null;
  gender: string | null;
  age: number | null;
}

export interface RecordingEventInput {
  eventType: RecordingEventType;
  messageId?: string;
  taskId?: string;
  day?: number | null;
  phase?: Phase | string | null;
  actorPlayerId?: string | null;
  actorSeat?: number | null;
  actorName?: string | null;
  textContent?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

export interface RecordingCreateRequest {
  action: "create";
  gameSessionId?: string | null;
  playerCount: number;
  difficulty?: string | null;
  usedCustomKey?: boolean;
  modeFlags?: Record<string, unknown>;
  playerSnapshot?: RecordingPlayerSnapshot[];
  initialState?: Record<string, unknown> | null;
}

export interface RecordingAppendEventsRequest {
  action: "appendEvents";
  recordingId: string;
  events: RecordingEventInput[];
}

export interface RecordingCompleteRequest {
  action: "complete";
  recordingId: string;
  winner?: Alignment | null;
  finalState?: Record<string, unknown> | null;
  status?: RecordingStatus;
}

export interface RecordingSaveAnalysisRequest {
  action: "saveAnalysis";
  recordingId: string;
  analysisData: GameAnalysisData;
  analysisUrl?: string;
}

export type RecordingPostRequest =
  | RecordingCreateRequest
  | RecordingAppendEventsRequest
  | RecordingCompleteRequest
  | RecordingSaveAnalysisRequest;

export interface TtsRecordingMetadata {
  recordingId?: string;
  messageId?: string;
  taskId?: string;
  playerId?: string;
  day?: number;
  phase?: Phase | string;
  segmentIndex?: number;
}
