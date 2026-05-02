import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMessageRecordingEvent,
  buildRecordingPlayerSnapshot,
  makeSafeRecordingObjectKey,
} from "../src/lib/game-recording-normalizer.ts";

test("builds compact player snapshots without client-only fields", () => {
  const snapshot = buildRecordingPlayerSnapshot([
    {
      playerId: "p1",
      seat: 0,
      displayName: "OpenAI",
      role: "Seer",
      alignment: "village",
      isHuman: false,
      alive: true,
      agentProfile: {
        modelRef: { provider: "tokendance", model: "gpt-5.4" },
        persona: { voiceId: "voice-1", gender: "male", age: 28 },
      },
    },
  ]);

  assert.deepEqual(snapshot, [
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
      voiceId: "voice-1",
      gender: "male",
      age: 28,
    },
  ]);
});

test("normalizes chat messages into idempotent recording events", () => {
  const event = buildMessageRecordingEvent(
    {
      id: "m1",
      playerId: "p1",
      playerName: "OpenAI",
      content: "我是预言家。",
      timestamp: 1777730000000,
      day: 1,
      phase: "DAY_SPEECH",
    },
    [{ playerId: "p1", seat: 2, displayName: "OpenAI" }]
  );

  assert.equal(event.eventType, "speech");
  assert.equal(event.messageId, "m1");
  assert.equal(event.actorSeat, 2);
  assert.equal(event.actorName, "OpenAI");
  assert.equal(event.textContent, "我是预言家。");
  assert.equal(event.day, 1);
  assert.equal(event.phase, "DAY_SPEECH");
});

test("uses safe deterministic OSS object keys", () => {
  const key = makeSafeRecordingObjectKey({
    prefix: "recordings/",
    userId: "user/../../abc",
    recordingId: "rec:123",
    taskId: "voice::hello/world?",
    extension: "mp3",
  });

  assert.equal(key, "recordings/user-abc/rec-123/voice-hello-world.mp3");
});
