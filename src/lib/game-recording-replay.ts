import { createInitialGameState } from "@/lib/game-master";
import { getNarratorAudioPath, getNarratorText, getPlayerDiedKey, type NarratorTextKey } from "@/lib/narrator-voice";
import type { Alignment, ChatMessage, GameState, ModelRef, Phase, Player, Role } from "@/types/game";

type JsonRecord = Record<string, unknown>;

export type ReplayRecordingPlayerSnapshot = {
  playerId: string;
  seat?: number | null;
  seatNumber?: number | null;
  displayName: string;
  role: Role | string;
  alignment: Alignment | string;
  isHuman?: boolean | null;
  model?: string | null;
  provider?: string | null;
  voiceId?: string | null;
  gender?: string | null;
  age?: number | null;
};

export type ReplayRecordingEvent = {
  id: string;
  seq: number;
  eventType: string;
  messageId?: string | null;
  taskId?: string | null;
  day?: number | null;
  phase?: Phase | string | null;
  actorPlayerId?: string | null;
  actorSeat?: number | null;
  actorName?: string | null;
  textContent?: string | null;
  payload?: unknown;
  occurredAt: string;
};

export type ReplayRecordingAsset = {
  id: string;
  taskId: string;
  publicUrl?: string | null;
  uploadStatus?: string | null;
  durationMs?: number | null;
};

export type ReplayRecordingDetail = {
  recording: {
    id: string;
    playerCount?: number | null;
    difficulty?: string | null;
    winner?: Alignment | "villager" | null;
    modeFlags?: unknown;
    playerSnapshot?: ReplayRecordingPlayerSnapshot[] | null;
    initialState?: unknown;
    finalState?: unknown;
  };
  events: ReplayRecordingEvent[];
  assets: ReplayRecordingAsset[];
};

export type ReplayDialogue = {
  speaker: string;
  text: string;
  playerId: string | null;
  actorSeat: number | null;
  audioUrl: string | null;
  audioUrls: string[];
  audioDurationMs: number | null;
  eventId: string;
  seq: number;
  isNarrator?: boolean;
};

export type ReplayFrame = {
  index: number;
  event: ReplayRecordingEvent;
  gameState: GameState;
  currentDialogue: ReplayDialogue | null;
  audioUrl: string | null;
  audioUrls: string[];
  audioDurationMs: number | null;
  occurredAt: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneGameState(state: GameState): GameState {
  if (typeof structuredClone === "function") {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function normalizePhase(value: unknown, fallback: Phase): Phase {
  return typeof value === "string" && value.trim() ? (value as Phase) : fallback;
}

function normalizeAlignment(value: unknown, fallback: Alignment | null = null): Alignment | null {
  if (value === "village" || value === "villager") return "village";
  if (value === "wolf") return "wolf";
  return fallback;
}

function normalizeRole(value: unknown): Role {
  const knownRoles: Role[] = ["Villager", "Werewolf", "Seer", "Witch", "Hunter", "Guard", "Idiot", "WhiteWolfKing"];
  return knownRoles.includes(value as Role) ? (value as Role) : "Villager";
}

function normalizeProvider(value: unknown): ModelRef["provider"] {
  if (value === "zenmux" || value === "dashscope" || value === "tokendance") return value;
  return "tokendance";
}

function normalizeGender(value: unknown): "male" | "female" | "nonbinary" {
  if (value === "male" || value === "female" || value === "nonbinary") return value;
  return "nonbinary";
}

function normalizeSeat(snapshot: ReplayRecordingPlayerSnapshot): number {
  if (typeof snapshot.seat === "number" && Number.isFinite(snapshot.seat)) return snapshot.seat;
  if (typeof snapshot.seatNumber === "number" && Number.isFinite(snapshot.seatNumber)) return Math.max(0, snapshot.seatNumber - 1);
  return 0;
}

function createPlayerFromSnapshot(snapshot: ReplayRecordingPlayerSnapshot): Player {
  const model = typeof snapshot.model === "string" && snapshot.model.trim() ? snapshot.model.trim() : null;
  const provider = normalizeProvider(snapshot.provider);
  const gender = normalizeGender(snapshot.gender);
  const age = typeof snapshot.age === "number" && Number.isFinite(snapshot.age) ? snapshot.age : 28;
  const isHuman = snapshot.isHuman === true;

  return {
    playerId: snapshot.playerId,
    seat: normalizeSeat(snapshot),
    displayName: snapshot.displayName || `${normalizeSeat(snapshot) + 1}号`,
    avatarSeed: snapshot.playerId,
    alive: true,
    role: normalizeRole(snapshot.role),
    alignment: normalizeAlignment(snapshot.alignment, "village") ?? "village",
    isHuman,
    agentProfile: isHuman
      ? undefined
      : {
          modelRef: { provider, model: model || "recorded-model" },
          persona: {
            voiceRules: [],
            mbti: "",
            gender,
            age,
            basicInfo: provider,
            voiceId: typeof snapshot.voiceId === "string" ? snapshot.voiceId : undefined,
          },
        },
  };
}

function getInitialRecord(detail: ReplayRecordingDetail): JsonRecord {
  return isRecord(detail.recording.initialState) ? detail.recording.initialState : {};
}

function getModeFlags(detail: ReplayRecordingDetail): JsonRecord {
  return isRecord(detail.recording.modeFlags) ? detail.recording.modeFlags : {};
}

function createBaseState(detail: ReplayRecordingDetail): GameState {
  const initial = getInitialRecord(detail);
  const modeFlags = getModeFlags(detail);
  const state = createInitialGameState();

  state.gameId = typeof initial.gameId === "string" ? initial.gameId : detail.recording.id;
  state.phase = normalizePhase(initial.phase, "LOBBY");
  state.day = typeof initial.day === "number" ? initial.day : 0;
  state.difficulty =
    initial.difficulty === "easy" || initial.difficulty === "normal" || initial.difficulty === "hard"
      ? initial.difficulty
      : detail.recording.difficulty === "easy" || detail.recording.difficulty === "normal" || detail.recording.difficulty === "hard"
      ? detail.recording.difficulty
      : "normal";
  state.isGenshinMode = initial.isGenshinMode === true || modeFlags.genshinMode === true || modeFlags.godsBattle === true;
  state.isSpectatorMode = initial.isSpectatorMode === true || modeFlags.spectatorMode === true || modeFlags.godsBattle === true;
  state.players = (detail.recording.playerSnapshot ?? [])
    .map(createPlayerFromSnapshot)
    .sort((a, b) => a.seat - b.seat);
  state.winner = normalizeAlignment(detail.recording.winner, null);

  return state;
}

function getPayloadRecord(event: ReplayRecordingEvent): JsonRecord {
  return isRecord(event.payload) ? event.payload : {};
}

function getNarratorUrls(keys: NarratorTextKey[]): string[] {
  return keys.map((key) => getNarratorAudioPath(key, "zh"));
}

function getNarratorKeysForPhase(phase: Phase, previousPhase: Phase | null, winner: Alignment | null): NarratorTextKey[] {
  switch (phase) {
    case "NIGHT_START":
      return ["nightFall"];
    case "NIGHT_GUARD_ACTION":
      return ["guardWake"];
    case "NIGHT_WOLF_ACTION":
      return previousPhase === "NIGHT_GUARD_ACTION" ? ["guardClose", "wolfWake"] : ["wolfWake"];
    case "NIGHT_WITCH_ACTION":
      return previousPhase === "NIGHT_WOLF_ACTION" ? ["wolfClose", "witchWake"] : ["witchWake"];
    case "NIGHT_SEER_ACTION":
      return previousPhase === "NIGHT_WITCH_ACTION" ? ["witchClose", "seerWake"] : ["seerWake"];
    case "NIGHT_RESOLVE":
    case "DAY_START":
      return previousPhase === "NIGHT_SEER_ACTION" ? ["seerClose", "dayBreak"] : ["dayBreak"];
    case "DAY_BADGE_SPEECH":
      return ["badgeSpeechStart"];
    case "DAY_BADGE_ELECTION":
      return ["badgeElectionStart"];
    case "DAY_SPEECH":
    case "DAY_PK_SPEECH":
      return ["discussionStart"];
    case "DAY_VOTE":
      return ["voteStart"];
    case "GAME_END":
      return winner === "wolf" ? ["wolfWin"] : winner === "village" ? ["villageWin"] : [];
    default:
      return [];
  }
}

function getNarratorKeysForText(text: string): NarratorTextKey[] {
  const compact = text.replace(/\s/g, "");
  if (!compact) return [];
  if (compact.includes("天黑请闭眼") || compact.toLowerCase().includes("closeyoureyes")) return ["nightFall"];
  if (compact.includes("守卫请睁眼")) return ["guardWake"];
  if (compact.includes("守卫请闭眼")) return ["guardClose"];
  if (compact.includes("狼人请睁眼")) return ["wolfWake"];
  if (compact.includes("狼人请闭眼")) return ["wolfClose"];
  if (compact.includes("女巫请睁眼")) return ["witchWake"];
  if (compact.includes("女巫请闭眼")) return ["witchClose"];
  if (compact.includes("预言家请睁眼")) return ["seerWake"];
  if (compact.includes("预言家请闭眼")) return ["seerClose"];
  if (compact.includes("天亮了") || compact.toLowerCase().includes("openyoureyes")) return ["dayBreak"];
  if (compact.includes("平安夜")) return ["peacefulNight"];
  if (compact.includes("警徽竞选开始")) return ["badgeSpeechStart"];
  if (compact.includes("开始警徽评选")) return ["badgeElectionStart"];
  if (compact.includes("开始自由发言")) return ["discussionStart"];
  if (compact.includes("开始投票") || compact.includes("进入投票")) return ["voteStart"];
  if (compact.includes("好人获胜") || compact.includes("好人胜利")) return ["villageWin"];
  if (compact.includes("狼人获胜") || compact.includes("狼人胜利")) return ["wolfWin"];

  const diedMatch = compact.match(/(\d{1,2})号.*(出局|死亡|处决|放逐|毒杀|毒死|被杀)/);
  if (diedMatch) {
    const key = getPlayerDiedKey(Number(diedMatch[1]) - 1);
    return key ? [key] : [];
  }

  return [];
}

function uniqueNarratorKeys(keys: NarratorTextKey[]): NarratorTextKey[] {
  return Array.from(new Set(keys));
}

function getRecordedNarratorKeysNearPhase(
  events: ReplayRecordingEvent[],
  eventIndex: number,
  phase: Phase
): Set<NarratorTextKey> {
  const keys = new Set<NarratorTextKey>();
  const currentEvent = events[eventIndex];
  const start = Math.max(0, eventIndex - 3);
  const end = Math.min(events.length - 1, eventIndex + 5);

  for (let i = start; i <= end; i += 1) {
    if (i === eventIndex) continue;
    const event = events[i];
    if (event.eventType !== "system" || !event.textContent?.trim()) continue;

    const candidatePhase = normalizePhase(event.phase, phase);
    const samePhase = candidatePhase === phase;
    const nearbySeq = Math.abs(event.seq - currentEvent.seq) <= 5;
    if (!samePhase && !nearbySeq) continue;

    for (const key of getNarratorKeysForText(event.textContent)) {
      keys.add(key);
    }
  }

  return keys;
}

function filterNarratorKeysAlreadyRecordedNearPhase(
  keys: NarratorTextKey[],
  events: ReplayRecordingEvent[],
  eventIndex: number,
  phase: Phase
): NarratorTextKey[] {
  if (keys.length === 0) return keys;
  const recordedKeys = getRecordedNarratorKeysNearPhase(events, eventIndex, phase);
  if (recordedKeys.size === 0) return keys;
  return keys.filter((key) => !recordedKeys.has(key));
}

function normalizeSystemTextForDedupe(text: string): string {
  return text.replace(/\s/g, "").replace(/[。.!！,，、:：]/g, "");
}

function hasRecentDuplicateSystemMessage(state: GameState, text: string): boolean {
  const normalized = normalizeSystemTextForDedupe(text);
  const keys = getNarratorKeysForText(text);
  const recentSystemMessages = state.messages
    .filter((message) => message.isSystem)
    .slice(-8);

  return recentSystemMessages.some((message) => {
    if (normalizeSystemTextForDedupe(message.content) === normalized) return true;
    if (keys.length === 0) return false;
    const existingKeys = getNarratorKeysForText(message.content);
    return existingKeys.some((key) => keys.includes(key));
  });
}

function getNarratorTextForKeys(keys: NarratorTextKey[], event: ReplayRecordingEvent): string | null {
  const text = event.textContent?.trim();
  if (text) return text;
  if (keys.length > 0) return keys.map((key) => getNarratorText(key, "zh")).join("\n");
  return null;
}

function mergePayloadPlayers(state: GameState, payload: JsonRecord): Player[] {
  if (!Array.isArray(payload.players)) return state.players;

  const existingById = new Map(state.players.map((player) => [player.playerId, player]));
  const existingBySeat = new Map(state.players.map((player) => [player.seat, player]));
  const merged: Player[] = [];

  for (const rawPlayer of payload.players) {
    if (!isRecord(rawPlayer)) continue;
    const seat = typeof rawPlayer.seat === "number" ? rawPlayer.seat : null;
    const playerId = typeof rawPlayer.playerId === "string" ? rawPlayer.playerId : seat !== null ? `seat-${seat}` : null;
    if (!playerId) continue;

    const base = existingById.get(playerId) ?? (seat !== null ? existingBySeat.get(seat) : undefined);
    const fallbackSnapshot: ReplayRecordingPlayerSnapshot = {
      playerId,
      seat: seat ?? base?.seat ?? 0,
      displayName:
        (typeof rawPlayer.displayName === "string" && rawPlayer.displayName) ||
        base?.displayName ||
        `${(seat ?? base?.seat ?? 0) + 1}号`,
      role: typeof rawPlayer.role === "string" ? rawPlayer.role : base?.role ?? "Villager",
      alignment: typeof rawPlayer.alignment === "string" ? rawPlayer.alignment : base?.alignment ?? "village",
      isHuman: typeof rawPlayer.isHuman === "boolean" ? rawPlayer.isHuman : base?.isHuman ?? false,
      model: base?.agentProfile?.modelRef.model ?? null,
      provider: base?.agentProfile?.modelRef.provider ?? null,
      voiceId: base?.agentProfile?.persona.voiceId ?? null,
      gender: base?.agentProfile?.persona.gender ?? null,
      age: base?.agentProfile?.persona.age ?? null,
    };

    merged.push({
      ...(base ?? createPlayerFromSnapshot(fallbackSnapshot)),
      playerId,
      seat: seat ?? base?.seat ?? 0,
      displayName:
        (typeof rawPlayer.displayName === "string" && rawPlayer.displayName) ||
        base?.displayName ||
        fallbackSnapshot.displayName,
      alive: typeof rawPlayer.alive === "boolean" ? rawPlayer.alive : base?.alive ?? true,
      role: normalizeRole(rawPlayer.role ?? base?.role),
      alignment: normalizeAlignment(rawPlayer.alignment, base?.alignment ?? "village") ?? "village",
      isHuman: typeof rawPlayer.isHuman === "boolean" ? rawPlayer.isHuman : base?.isHuman ?? false,
    });
  }

  return merged.sort((a, b) => a.seat - b.seat);
}

function mergeBadge(state: GameState, payload: JsonRecord): GameState["badge"] {
  return isRecord(payload.badge)
    ? {
        ...state.badge,
        ...payload.badge,
      }
    : state.badge;
}

function mergeRecord<T extends Record<string, unknown>>(current: T, value: unknown): T {
  return isRecord(value) ? (value as T) : current;
}

function applySnapshotEvent(state: GameState, event: ReplayRecordingEvent): GameState {
  const payload = getPayloadRecord(event);
  const next = cloneGameState(state);

  next.day = typeof event.day === "number" ? event.day : next.day;
  next.phase = normalizePhase(event.phase, next.phase);
  next.currentSpeakerSeat =
    typeof payload.currentSpeakerSeat === "number"
      ? payload.currentSpeakerSeat
      : typeof event.actorSeat === "number"
      ? event.actorSeat
      : null;
  next.players = mergePayloadPlayers(next, payload);
  next.badge = mergeBadge(next, payload);
  next.votes = mergeRecord(next.votes, payload.votes);
  next.voteHistory = mergeRecord(next.voteHistory, payload.voteHistory);
  next.dayHistory = mergeRecord(next.dayHistory ?? {}, payload.dayHistory);
  next.nightHistory = mergeRecord(next.nightHistory ?? {}, payload.nightHistory);
  next.dailySummaries = mergeRecord(next.dailySummaries, payload.dailySummaries);
  next.winner = normalizeAlignment(payload.winner, next.winner);

  return next;
}

function createMessage(state: GameState, event: ReplayRecordingEvent): ChatMessage | null {
  const content = event.textContent?.trim();
  if (!content) return null;

  const isSystem = event.eventType === "system";
  const actorSeat = typeof event.actorSeat === "number" ? event.actorSeat : null;
  const player =
    event.actorPlayerId
      ? state.players.find((candidate) => candidate.playerId === event.actorPlayerId)
      : actorSeat !== null
      ? state.players.find((candidate) => candidate.seat === actorSeat)
      : null;
  const timestamp = Number.isFinite(Date.parse(event.occurredAt)) ? Date.parse(event.occurredAt) : Date.now();

  return {
    id: event.messageId || event.id,
    playerId: player?.playerId || event.actorPlayerId || "system",
    playerName: player?.displayName || event.actorName || "系统",
    content,
    timestamp,
    day: typeof event.day === "number" ? event.day : state.day,
    phase: normalizePhase(event.phase, state.phase),
    isSystem,
    isLastWords: isRecord(event.payload) && event.payload.isLastWords === true,
  };
}

function applyMessageEvent(state: GameState, event: ReplayRecordingEvent): GameState {
  const next = cloneGameState(state);
  next.day = typeof event.day === "number" ? event.day : next.day;
  next.phase = normalizePhase(event.phase, next.phase);
  next.currentSpeakerSeat = typeof event.actorSeat === "number" ? event.actorSeat : null;

  const message = createMessage(next, event);
  if (message && !next.messages.some((candidate) => candidate.id === message.id)) {
    next.messages = [...next.messages, message];
  }

  return next;
}

function applyEventCursor(state: GameState, event: ReplayRecordingEvent): GameState {
  const next = cloneGameState(state);
  next.day = typeof event.day === "number" ? event.day : next.day;
  next.phase = normalizePhase(event.phase, next.phase);
  next.currentSpeakerSeat = typeof event.actorSeat === "number" ? event.actorSeat : null;
  return next;
}

function addSystemReplayMessage(state: GameState, event: ReplayRecordingEvent, text: string): GameState {
  if (!text.trim()) return state;
  if (state.messages.some((candidate) => candidate.id === event.id)) return state;
  if (hasRecentDuplicateSystemMessage(state, text)) return state;
  const timestamp = Number.isFinite(Date.parse(event.occurredAt)) ? Date.parse(event.occurredAt) : Date.now();
  return {
    ...state,
    messages: [
      ...state.messages,
      {
        id: event.id,
        playerId: "system",
        playerName: "系统",
        content: text.trim(),
        timestamp,
        day: typeof event.day === "number" ? event.day : state.day,
        phase: normalizePhase(event.phase, state.phase),
        isSystem: true,
      },
    ],
  };
}

function getAssetsByTaskId(assets: ReplayRecordingAsset[]): Map<string, ReplayRecordingAsset> {
  const map = new Map<string, ReplayRecordingAsset>();
  for (const asset of assets) {
    if (asset.publicUrl && asset.uploadStatus === "uploaded") {
      map.set(asset.taskId, asset);
    }
  }
  return map;
}

function createDialogue(event: ReplayRecordingEvent, state: GameState, assetsByTaskId: Map<string, ReplayRecordingAsset>): ReplayDialogue | null {
  if (event.eventType !== "speech" || !event.textContent?.trim()) return null;
  const actorSeat = typeof event.actorSeat === "number" ? event.actorSeat : null;
  const player =
    event.actorPlayerId
      ? state.players.find((candidate) => candidate.playerId === event.actorPlayerId)
      : actorSeat !== null
      ? state.players.find((candidate) => candidate.seat === actorSeat)
      : null;
  const asset = event.taskId ? assetsByTaskId.get(event.taskId) : undefined;

  return {
    speaker: player?.displayName || event.actorName || "未知玩家",
    text: event.textContent.trim(),
    playerId: player?.playerId || event.actorPlayerId || null,
    actorSeat,
    audioUrl: asset?.publicUrl ?? null,
    audioUrls: asset?.publicUrl ? [asset.publicUrl] : [],
    audioDurationMs: asset?.durationMs ?? null,
    eventId: event.id,
    seq: event.seq,
  };
}

function createNarratorDialogue(event: ReplayRecordingEvent, text: string, audioUrls: string[]): ReplayDialogue {
  return {
    speaker: "系统",
    text,
    playerId: null,
    actorSeat: typeof event.actorSeat === "number" ? event.actorSeat : null,
    audioUrl: audioUrls[0] ?? null,
    audioUrls,
    audioDurationMs: null,
    eventId: event.id,
    seq: event.seq,
    isNarrator: true,
  };
}

export function buildReplayFrames(detail: ReplayRecordingDetail): ReplayFrame[] {
  const assetsByTaskId = getAssetsByTaskId(detail.assets ?? []);
  const events = [...(detail.events ?? [])].sort((a, b) => a.seq - b.seq);
  let currentState = createBaseState(detail);
  const frames: ReplayFrame[] = [];

  events.forEach((event, eventIndex) => {
    const previousPhase = currentState.phase;
    const duplicateSystemEvent =
      event.eventType === "system" &&
      typeof event.textContent === "string" &&
      hasRecentDuplicateSystemMessage(currentState, event.textContent);

    if (event.eventType === "speech" || event.eventType === "system") {
      currentState = duplicateSystemEvent ? applyEventCursor(currentState, event) : applyMessageEvent(currentState, event);
    } else {
      currentState = applySnapshotEvent(currentState, event);
    }

    let audioUrls: string[] = [];
    let dialogue = createDialogue(event, currentState, assetsByTaskId);
    if (duplicateSystemEvent) {
      dialogue = null;
    } else if (dialogue) {
      audioUrls = dialogue.audioUrls;
    } else {
      const textKeys = event.textContent ? uniqueNarratorKeys(getNarratorKeysForText(event.textContent)) : [];
      const rawPhaseKeys =
        event.eventType === "phase" || event.eventType === "game_end" || event.eventType === "snapshot"
          ? getNarratorKeysForPhase(currentState.phase, previousPhase, currentState.winner)
          : [];
      const phaseKeys = filterNarratorKeysAlreadyRecordedNearPhase(
        uniqueNarratorKeys(rawPhaseKeys),
        events,
        eventIndex,
        currentState.phase
      );
      const narratorKeys = textKeys.length > 0 ? textKeys : phaseKeys;
      audioUrls = getNarratorUrls(narratorKeys);
      const narratorText = getNarratorTextForKeys(narratorKeys, event);
      if (narratorText) {
        if (event.eventType !== "system") {
          currentState = addSystemReplayMessage(currentState, event, narratorText);
        }
        dialogue = createNarratorDialogue(event, narratorText, audioUrls);
      }
    }

    frames.push({
      index: frames.length,
      event,
      gameState: cloneGameState(currentState),
      currentDialogue: dialogue,
      audioUrl: audioUrls[0] ?? null,
      audioUrls,
      audioDurationMs: dialogue?.audioDurationMs ?? null,
      occurredAt: event.occurredAt,
    });
  });

  if (frames.length === 0) {
    frames.push({
      index: 0,
      event: {
        id: "initial",
        seq: 0,
        eventType: "snapshot",
        day: currentState.day,
        phase: currentState.phase,
        occurredAt: new Date().toISOString(),
      },
      gameState: cloneGameState(currentState),
      currentDialogue: null,
      audioUrl: null,
      audioUrls: [],
      audioDurationMs: null,
      occurredAt: new Date().toISOString(),
    });
  }

  return frames;
}
