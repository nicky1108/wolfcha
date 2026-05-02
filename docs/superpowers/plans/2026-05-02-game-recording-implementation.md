# Game Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build durable authenticated game recording with Postgres timeline data and OSS-backed TTS audio assets.

**Architecture:** Server APIs own recording persistence and authorization; client code only streams normalized game events and recording metadata. TTS keeps returning binary audio, while optionally uploading generated buffers to OSS and recording the resulting public URL.

**Tech Stack:** Next.js App Router, TypeScript, Postgres via `pg`, existing Postgres Supabase adapter, Node `crypto`/`https` for OSS REST PUT, React/Jotai client state, Node test scripts.

---

## File Structure

- Create `scripts/sql/20260502_game_recordings.sql`: recording tables and indexes.
- Create `src/lib/game-recording-types.ts`: shared serializable recording types and client/server payload shapes.
- Create `src/lib/game-recording-normalizer.ts`: pure event normalization helpers with tests.
- Create `src/lib/oss-upload.ts`: server-only OSS config and simple upload.
- Create `scripts/game-recording-normalizer.test.mjs`: TDD coverage for event dedupe payloads and OSS key safety.
- Create `src/app/api/game-recordings/route.ts`: create/list/append/complete route.
- Create `src/app/api/game-recordings/[id]/route.ts`: detail route with ownership checks.
- Modify `src/app/api/tts/route.ts`: accept optional recording metadata, upload audio, record/update asset metadata, preserve binary response contract.
- Modify `src/lib/audio-manager.ts`: carry optional recording metadata on `AudioTask` and read returned recording headers.
- Create `src/hooks/useGameRecorder.ts`: start/append/complete recording from game state.
- Modify `src/hooks/useGameLogic.ts`, `src/hooks/game-phases/useDayPhase.ts`, and `src/app/page.tsx`: wire recording id and audio task metadata.
- Create `src/app/recordings/[id]/page.tsx`: replay detail page.
- Modify `src/components/game/UserProfileModal.tsx`: add replay list tab.
- Modify `src/i18n/messages/zh.json` and `src/i18n/messages/en.json`: labels for replay UI.
- Modify `.env.example`: document OSS server env vars without real secrets.

## Task 1: Pure Normalization Tests

**Files:**
- Create: `scripts/game-recording-normalizer.test.mjs`
- Create: `src/lib/game-recording-normalizer.ts`
- Create: `src/lib/game-recording-types.ts`

- [ ] **Step 1: Write failing tests**

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecordingPlayerSnapshot,
  buildMessageRecordingEvent,
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
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx tsx --test scripts/game-recording-normalizer.test.mjs`

Expected: failure because `src/lib/game-recording-normalizer.ts` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/game-recording-types.ts` with the shared type aliases, then create `src/lib/game-recording-normalizer.ts` exporting the functions used by the tests.

- [ ] **Step 4: Verify GREEN**

Run: `npx tsx --test scripts/game-recording-normalizer.test.mjs`

Expected: all tests pass.

## Task 2: Database Schema

**Files:**
- Create: `scripts/sql/20260502_game_recordings.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add SQL migration**

Add the three tables from `docs/superpowers/specs/2026-05-02-game-recording-design.md` plus indexes.

- [ ] **Step 2: Add database types**

Add `game_recordings`, `game_recording_events`, and `game_recording_assets` to `Database["public"]["Tables"]`.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: passes or fails only on later unimplemented imports; fix schema typings before continuing.

## Task 3: Recording API

**Files:**
- Create: `src/app/api/game-recordings/route.ts`
- Create: `src/app/api/game-recordings/[id]/route.ts`
- Modify: `src/lib/postgres-supabase-adapter.ts` if `.from(tableName)` is used for new tables.

- [ ] **Step 1: Write route using direct `dbQuery`**

Implement authenticated `create`, `appendEvents`, and `complete` actions with current-user ownership checks.

- [ ] **Step 2: Add list and detail reads**

List returns paginated current-user recordings. Detail returns metadata, ordered events, and assets only for the current user.

- [ ] **Step 3: Verify compile**

Run: `pnpm exec eslint src/app/api/game-recordings/route.ts src/app/api/game-recordings/[id]/route.ts`

Expected: no errors.

## Task 4: OSS Upload and TTS Integration

**Files:**
- Create: `src/lib/oss-upload.ts`
- Modify: `src/app/api/tts/route.ts`
- Modify: `.env.example`

- [ ] **Step 1: Implement server-only OSS config and upload**

Read `ALIYUN_OSS_REGION`, `ALIYUN_OSS_BUCKET`, `ALIYUN_OSS_ACCESS_KEY_ID`, `ALIYUN_OSS_ACCESS_KEY_SECRET`, `ALIYUN_OSS_PUBLIC_BASE_URL`, and `ALIYUN_OSS_RECORDING_PREFIX`.
Use simple PUT upload for generated audio buffers.

- [ ] **Step 2: Extend `/api/tts`**

Parse optional recording fields. If present, upload audio after generation and before responding. Preserve existing audio response bodies and content type.

- [ ] **Step 3: Verify binary contract**

Run existing TTS-related tests and a local unauthenticated smoke where possible. Expected: no route type errors and existing response paths remain unchanged when recording metadata is absent.

## Task 5: Client Recording Hook and Audio Metadata

**Files:**
- Create: `src/hooks/useGameRecorder.ts`
- Modify: `src/lib/audio-manager.ts`
- Modify: `src/hooks/useGameLogic.ts`
- Modify: `src/hooks/game-phases/useDayPhase.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add recorder hook**

Create a hook that starts after `gameSessionTracker.start(config)` returns, tracks appended message ids and phase keys, and completes on game end.

- [ ] **Step 2: Thread recording metadata into audio tasks**

Extend `AudioTask` with optional `recordingId`, `messageId`, `day`, `phase`, and `segmentIndex`. Include those fields in `/api/tts` request bodies when present.

- [ ] **Step 3: Wire game state**

In `src/app/page.tsx`, call the recorder hook with `gameState` and current session/recording state.

## Task 6: Replay UI

**Files:**
- Create: `src/app/recordings/[id]/page.tsx`
- Modify: `src/components/game/UserProfileModal.tsx`
- Modify: `src/i18n/messages/zh.json`
- Modify: `src/i18n/messages/en.json`
- Modify: `src/app/globals.css` if compact replay styling needs shared classes.

- [ ] **Step 1: Add profile tab**

Add "对局回放" list with pagination and links to replay detail pages.

- [ ] **Step 2: Add replay page**

Render metadata, player snapshot, timeline events, speech text, and audio controls for events with asset URLs.

- [ ] **Step 3: Verify page compile**

Run: `pnpm exec tsc --noEmit`

Expected: no type errors.

## Task 7: Verification and Deployment Prep

**Files:**
- Modify only files needed by failures.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx tsx --test scripts/game-recording-normalizer.test.mjs
node --test scripts/audio-prefetch.test.mjs
pnpm exec tsc --noEmit
git diff --check
```

- [ ] **Step 2: Configure local env**

Add OSS env vars to `.env.local` using the values provided by the user. Do not commit secrets.

- [ ] **Step 3: Manual local smoke**

Run local dev server, start a logged-in formal game, generate at least one voiced AI segment, then confirm `/recordings/<id>` shows text and audio.

- [ ] **Step 4: Commit implementation**

Use a Lore-protocol commit message. Do not include `.env.local`.

## Self-Review

- Spec coverage: storage, APIs, TTS audio upload, client recording, replay UI, error handling, and tests all map to tasks.
- Placeholder scan: no placeholder marker language is used.
- Type consistency: task names use `recordingId`, `messageId`, `taskId`, `eventType`, and `textContent` consistently with the design.
