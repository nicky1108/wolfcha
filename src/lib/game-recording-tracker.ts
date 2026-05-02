"use client";

import { supabase } from "@/lib/supabase";
import {
  buildMessageRecordingEvent,
  buildRecordingPlayerSnapshot,
} from "@/lib/game-recording-normalizer";
import type { RecordingEventInput } from "@/lib/game-recording-types";
import type { GameAnalysisData } from "@/types/analysis";
import type { GameState, Player } from "@/types/game";

type StartRecordingInput = {
  gameSessionId: string;
  state: GameState;
  playerCount: number;
  difficulty?: string | null;
  usedCustomKey: boolean;
  modeFlags?: Record<string, unknown>;
};

type TrackerState = {
  recordingId: string | null;
  accessToken: string | null;
  seenMessageIds: Set<string>;
  seenPhaseKeys: Set<string>;
  completed: boolean;
  appendChain: Promise<void>;
};

const createInitialTrackerState = (): TrackerState => ({
  recordingId: null,
  accessToken: null,
  seenMessageIds: new Set(),
  seenPhaseKeys: new Set(),
  completed: false,
  appendChain: Promise.resolve(),
});

let trackerState = createInitialTrackerState();

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

async function postRecording(payload: Record<string, unknown>, accessToken: string): Promise<Record<string, unknown>> {
  const response = await fetch("/api/game-recordings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const json: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Recording request failed: ${response.status} ${JSON.stringify(json).slice(0, 400)}`
    );
  }
  return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
}

function getSpeechTaskId(players: Player[], event: RecordingEventInput): string | undefined {
  if (event.eventType !== "speech" || !event.textContent || !event.actorPlayerId) return undefined;
  const player = players.find((candidate) => candidate.playerId === event.actorPlayerId);
  const voiceId = player?.agentProfile?.persona?.voiceId;
  if (!voiceId) return undefined;
  return `${voiceId}::${event.textContent}`;
}

function buildPhaseEvent(state: GameState): RecordingEventInput {
  return {
    eventType: state.phase === "GAME_END" ? "game_end" : "phase",
    day: state.day,
    phase: state.phase,
    payload: {
      gameId: state.gameId,
      winner: state.winner,
      currentSpeakerSeat: state.currentSpeakerSeat,
      players: state.players.map((player) => ({
        playerId: player.playerId,
        seat: player.seat,
        displayName: player.displayName,
        alive: player.alive,
        role: player.role,
        alignment: player.alignment,
        isHuman: player.isHuman,
      })),
      badge: state.badge,
      votes: state.votes,
      voteHistory: state.voteHistory,
      dayHistory: state.dayHistory,
      nightHistory: state.nightHistory,
      dailySummaries: state.dailySummaries,
    },
    occurredAt: new Date().toISOString(),
  };
}

function collectNewEvents(state: GameState): RecordingEventInput[] {
  const events: RecordingEventInput[] = [];
  const phaseKey = `${state.day}:${state.phase}:${state.winner || ""}`;
  if (!trackerState.seenPhaseKeys.has(phaseKey)) {
    trackerState.seenPhaseKeys.add(phaseKey);
    events.push(buildPhaseEvent(state));
  }

  for (const message of state.messages) {
    if (trackerState.seenMessageIds.has(message.id)) continue;
    trackerState.seenMessageIds.add(message.id);
    const event = buildMessageRecordingEvent(message, state.players);
    const taskId = getSpeechTaskId(state.players, event);
    events.push(taskId ? { ...event, taskId } : event);
  }

  return events;
}

function enqueueAppend(events: RecordingEventInput[]) {
  const recordingId = trackerState.recordingId;
  const accessToken = trackerState.accessToken;
  if (!recordingId || !accessToken || events.length === 0) return;

  trackerState.appendChain = trackerState.appendChain
    .then(() =>
      postRecording(
        {
          action: "appendEvents",
          recordingId,
          events,
        },
        accessToken
      )
    )
    .then(() => undefined)
    .catch((error) => {
      console.error("[game-recording] Failed to append events", error);
    });
}

export const gameRecordingTracker = {
  reset() {
    trackerState = createInitialTrackerState();
  },

  getRecordingId(): string | null {
    return trackerState.recordingId;
  },

  async start(input: StartRecordingInput): Promise<string | null> {
    const accessToken = await getAccessToken();
    if (!accessToken) return null;

    trackerState = {
      ...createInitialTrackerState(),
      accessToken,
    };

    const response = await postRecording(
      {
        action: "create",
        gameSessionId: input.gameSessionId,
        playerCount: input.playerCount,
        difficulty: input.difficulty ?? null,
        usedCustomKey: input.usedCustomKey,
        modeFlags: input.modeFlags ?? {},
        playerSnapshot: buildRecordingPlayerSnapshot(input.state.players),
        initialState: {
          gameId: input.state.gameId,
          day: input.state.day,
          phase: input.state.phase,
          difficulty: input.state.difficulty,
          isGenshinMode: input.state.isGenshinMode === true,
          isSpectatorMode: input.state.isSpectatorMode === true,
        },
      },
      accessToken
    );

    const recordingId = typeof response.recordingId === "string" ? response.recordingId : null;
    trackerState.recordingId = recordingId;
    if (recordingId) {
      this.syncState(input.state);
    }
    return recordingId;
  },

  syncState(state: GameState) {
    if (!trackerState.recordingId || trackerState.completed) return;
    enqueueAppend(collectNewEvents(state));
  },

  complete(state: GameState) {
    const recordingId = trackerState.recordingId;
    const accessToken = trackerState.accessToken;
    if (!recordingId || !accessToken || trackerState.completed) return;

    this.syncState(state);
    trackerState.completed = true;
    trackerState.appendChain = trackerState.appendChain
      .then(() =>
        postRecording(
          {
            action: "complete",
            recordingId,
            winner: state.winner,
            status: "completed",
            finalState: {
              gameId: state.gameId,
              day: state.day,
              phase: state.phase,
              winner: state.winner,
              players: buildRecordingPlayerSnapshot(state.players),
              voteHistory: state.voteHistory,
              dayHistory: state.dayHistory,
              nightHistory: state.nightHistory,
              dailySummaries: state.dailySummaries,
            },
          },
          accessToken
        )
      )
      .then(() => undefined)
      .catch((error) => {
        console.error("[game-recording] Failed to complete recording", error);
      });
  },

  saveAnalysis(analysisData: GameAnalysisData) {
    const recordingId = trackerState.recordingId;
    const accessToken = trackerState.accessToken;
    if (!recordingId || !accessToken) return;

    trackerState.appendChain = trackerState.appendChain
      .then(() =>
        postRecording(
          {
            action: "saveAnalysis",
            recordingId,
            analysisData,
            analysisUrl: `/recordings/${recordingId}/analysis`,
          },
          accessToken
        )
      )
      .then(() => undefined)
      .catch((error) => {
        console.error("[game-recording] Failed to persist analysis", error);
      });
  },
};
