import type { ChatMessage, Phase, Player } from "@/types/game";
import type { RecordingEventInput, RecordingPlayerSnapshot } from "@/lib/game-recording-types";

type MessagePlayerLookup = Pick<Player, "playerId" | "seat" | "displayName">;

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sanitizePathPart(value: string): string {
  const sanitized = value
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || "unknown";
}

export function buildRecordingPlayerSnapshot(players: Player[]): RecordingPlayerSnapshot[] {
  return players.map((player) => {
    const persona = player.agentProfile?.persona;
    const modelRef = player.agentProfile?.modelRef;
    return {
      playerId: player.playerId,
      seat: player.seat,
      seatNumber: player.seat + 1,
      displayName: player.displayName,
      role: player.role,
      alignment: player.alignment,
      isHuman: player.isHuman,
      model: normalizeNullableString(modelRef?.model),
      provider: normalizeNullableString(modelRef?.provider),
      voiceId: normalizeNullableString(persona?.voiceId),
      gender: normalizeNullableString(persona?.gender),
      age: typeof persona?.age === "number" ? persona.age : null,
    };
  });
}

export function buildMessageRecordingEvent(
  message: ChatMessage,
  players: MessagePlayerLookup[]
): RecordingEventInput {
  const player = players.find((candidate) => candidate.playerId === message.playerId);
  const trimmedContent = message.content.trim();
  return {
    eventType: message.isSystem ? "system" : "speech",
    messageId: message.id,
    day: message.day ?? null,
    phase: message.phase as Phase | undefined,
    actorPlayerId: message.playerId,
    actorSeat: player?.seat ?? null,
    actorName: player?.displayName ?? message.playerName,
    textContent: trimmedContent,
    payload: {
      isSystem: message.isSystem === true,
      isLastWords: message.isLastWords === true,
    },
    occurredAt: new Date(message.timestamp).toISOString(),
  };
}

export function makeSafeRecordingObjectKey(input: {
  prefix?: string;
  userId: string;
  recordingId: string;
  taskId: string;
  extension?: string;
}): string {
  const prefix = (input.prefix || "recordings")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map(sanitizePathPart)
    .join("/");
  const extension = sanitizePathPart(input.extension || "mp3").replace(/^\\.+/, "") || "mp3";
  const safeUserId = sanitizePathPart(input.userId);
  const safeRecordingId = sanitizePathPart(input.recordingId);
  const safeTaskId = sanitizePathPart(input.taskId).slice(0, 160);
  return `${prefix}/${safeUserId}/${safeRecordingId}/${safeTaskId}.${extension}`;
}
