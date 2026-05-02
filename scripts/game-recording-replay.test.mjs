import assert from "node:assert/strict";
import test from "node:test";

import replayModule from "../src/lib/game-recording-replay.ts";

const { buildReplayFrames } = replayModule;

test("reconstructs replay frames from recording snapshots, speech, and audio assets", () => {
  const detail = {
    recording: {
      id: "rec-1",
      playerCount: 2,
      difficulty: "normal",
      winner: "villager",
      modeFlags: { godsBattle: true },
      playerSnapshot: [
        {
          playerId: "p1",
          seat: 0,
          seatNumber: 1,
          displayName: "OpenAI",
          role: "Seer",
          alignment: "village",
          isHuman: false,
          model: "gpt-5.4",
          provider: "tokendance",
          voiceId: "voice-openai",
          gender: "male",
          age: 28,
        },
        {
          playerId: "p2",
          seat: 1,
          seatNumber: 2,
          displayName: "DeepSeek",
          role: "Werewolf",
          alignment: "wolf",
          isHuman: false,
          model: "deepseek-v4-pro",
          provider: "tokendance",
          voiceId: "voice-deepseek",
          gender: "female",
          age: 24,
        },
      ],
      initialState: {
        gameId: "game-1",
        phase: "DAY_SPEECH",
        day: 1,
        difficulty: "hard",
        isGenshinMode: true,
        isSpectatorMode: true,
      },
      finalState: null,
    },
    events: [
      {
        id: "e1",
        seq: 1,
        eventType: "phase",
        messageId: null,
        taskId: null,
        day: 1,
        phase: "DAY_SPEECH",
        actorPlayerId: null,
        actorSeat: null,
        actorName: null,
        textContent: null,
        payload: {
          currentSpeakerSeat: 0,
          players: [
            { playerId: "p1", seat: 0, displayName: "OpenAI", alive: true, role: "Seer", alignment: "village", isHuman: false },
            { playerId: "p2", seat: 1, displayName: "DeepSeek", alive: true, role: "Werewolf", alignment: "wolf", isHuman: false },
          ],
          badge: { holderSeat: 0, candidates: [0], signup: {}, votes: {}, allVotes: {}, history: {}, revoteCount: 0 },
          votes: {},
          voteHistory: {},
          dayHistory: {},
          nightHistory: {},
          dailySummaries: {},
        },
        occurredAt: "2026-05-03T10:00:00.000Z",
      },
      {
        id: "e2",
        seq: 2,
        eventType: "speech",
        messageId: "m1",
        taskId: "voice-openai::我是预言家。",
        day: 1,
        phase: "DAY_SPEECH",
        actorPlayerId: "p1",
        actorSeat: 0,
        actorName: "OpenAI",
        textContent: "我是预言家。",
        payload: {},
        occurredAt: "2026-05-03T10:00:02.000Z",
      },
      {
        id: "e3",
        seq: 3,
        eventType: "game_end",
        messageId: null,
        taskId: null,
        day: 1,
        phase: "GAME_END",
        actorPlayerId: null,
        actorSeat: null,
        actorName: null,
        textContent: null,
        payload: {
          winner: "village",
          currentSpeakerSeat: null,
          players: [
            { playerId: "p1", seat: 0, displayName: "OpenAI", alive: true, role: "Seer", alignment: "village", isHuman: false },
            { playerId: "p2", seat: 1, displayName: "DeepSeek", alive: false, role: "Werewolf", alignment: "wolf", isHuman: false },
          ],
        },
        occurredAt: "2026-05-03T10:01:00.000Z",
      },
    ],
    assets: [
      {
        id: "a1",
        taskId: "voice-openai::我是预言家。",
        publicUrl: "https://oss.example/voice.mp3",
        uploadStatus: "uploaded",
        durationMs: 1200,
      },
    ],
  };

  const frames = buildReplayFrames(detail);

  assert.equal(frames.length, 3);
  assert.equal(frames[0].gameState.phase, "DAY_SPEECH");
  assert.equal(frames[0].gameState.badge.holderSeat, 0);
  assert.equal(frames[0].gameState.players[0].agentProfile?.modelRef.model, "gpt-5.4");
  assert.equal(frames[1].currentDialogue?.speaker, "OpenAI");
  assert.equal(frames[1].currentDialogue?.audioUrl, "https://oss.example/voice.mp3");
  assert.deepEqual(frames[1].audioUrls, ["https://oss.example/voice.mp3"]);
  assert.equal(frames[1].gameState.messages.at(-1)?.content, "我是预言家。");
  assert.equal(frames[2].gameState.phase, "GAME_END");
  assert.equal(frames[2].gameState.winner, "village");
  assert.equal(frames[2].gameState.players[1].alive, false);
});

test("adds narrator audio and dialogue for phase-only replay frames", () => {
  const frames = buildReplayFrames({
    recording: {
      id: "rec-2",
      playerCount: 0,
      difficulty: "normal",
      winner: null,
      playerSnapshot: [],
      initialState: { gameId: "game-2", phase: "LOBBY", day: 0 },
      finalState: null,
    },
    events: [
      {
        id: "night-start",
        seq: 1,
        eventType: "phase",
        day: 1,
        phase: "NIGHT_START",
        payload: {},
        occurredAt: "2026-05-03T10:00:00.000Z",
      },
      {
        id: "wolf-action",
        seq: 2,
        eventType: "phase",
        day: 1,
        phase: "NIGHT_WOLF_ACTION",
        payload: {},
        occurredAt: "2026-05-03T10:00:02.000Z",
      },
    ],
    assets: [],
  });

  assert.equal(frames[0].currentDialogue?.text, "天黑请闭眼");
  assert.ok(frames[0].audioUrls.some((url) => url.endsWith("/audio/narrator/zh/nightFall.mp3")));
  assert.deepEqual(
    frames[1].audioUrls.map((url) => url.split("/").pop()),
    ["wolfWake.mp3"]
  );
});

test("does not duplicate narrator when recorded system messages already exist near phase frames", () => {
  const frames = buildReplayFrames({
    recording: {
      id: "rec-3",
      playerCount: 0,
      difficulty: "normal",
      winner: null,
      playerSnapshot: [],
      initialState: { gameId: "game-3", phase: "LOBBY", day: 0 },
      finalState: null,
    },
    events: [
      {
        id: "phase-night",
        seq: 1,
        eventType: "phase",
        day: 1,
        phase: "NIGHT_START",
        payload: {},
        occurredAt: "2026-05-03T10:00:00.000Z",
      },
      {
        id: "system-night",
        seq: 2,
        eventType: "system",
        day: 1,
        phase: "NIGHT_START",
        textContent: "第 1 夜，天黑请闭眼",
        payload: {},
        occurredAt: "2026-05-03T10:00:01.000Z",
      },
      {
        id: "phase-wolf",
        seq: 3,
        eventType: "phase",
        day: 1,
        phase: "NIGHT_WOLF_ACTION",
        payload: {},
        occurredAt: "2026-05-03T10:00:02.000Z",
      },
      {
        id: "system-wolf",
        seq: 4,
        eventType: "system",
        day: 1,
        phase: "NIGHT_WOLF_ACTION",
        textContent: "狼人请睁眼",
        payload: {},
        occurredAt: "2026-05-03T10:00:03.000Z",
      },
      {
        id: "phase-witch",
        seq: 5,
        eventType: "phase",
        day: 1,
        phase: "NIGHT_WITCH_ACTION",
        payload: {},
        occurredAt: "2026-05-03T10:00:04.000Z",
      },
      {
        id: "system-witch",
        seq: 6,
        eventType: "system",
        day: 1,
        phase: "NIGHT_WITCH_ACTION",
        textContent: "女巫请睁眼",
        payload: {},
        occurredAt: "2026-05-03T10:00:05.000Z",
      },
      {
        id: "phase-badge-signup",
        seq: 7,
        eventType: "phase",
        day: 1,
        phase: "DAY_BADGE_SIGNUP",
        payload: {},
        occurredAt: "2026-05-03T10:00:06.000Z",
      },
    ],
    assets: [],
  });

  assert.deepEqual(frames[0].audioUrls, []);
  assert.equal(frames[0].currentDialogue, null);
  assert.deepEqual(
    frames[1].audioUrls.map((url) => url.split("/").pop()),
    ["nightFall.mp3"]
  );
  assert.deepEqual(frames[2].audioUrls, []);
  assert.deepEqual(
    frames[3].audioUrls.map((url) => url.split("/").pop()),
    ["wolfWake.mp3"]
  );
  assert.deepEqual(
    frames[4].audioUrls.map((url) => url.split("/").pop()),
    ["wolfClose.mp3"]
  );
  assert.equal(frames[4].currentDialogue?.text, "狼人请闭眼");
  assert.deepEqual(
    frames[5].audioUrls.map((url) => url.split("/").pop()),
    ["witchWake.mp3"]
  );
  assert.equal(frames[6].currentDialogue, null);

  const finalMessages = frames.at(-1)?.gameState.messages.map((message) => message.content) ?? [];
  assert.equal(finalMessages.filter((content) => content.includes("狼人请睁眼")).length, 1);
  assert.equal(finalMessages.filter((content) => content.includes("女巫请睁眼")).length, 1);
  assert.equal(finalMessages.some((content) => content === "DAY_BADGE_SIGNUP"), false);
});
