import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const dayPhasePath = path.resolve(process.cwd(), "src/hooks/game-phases/useDayPhase.ts");
const audioManagerPath = path.resolve(process.cwd(), "src/lib/audio-manager.ts");
const dayPhaseSource = fs.readFileSync(dayPhasePath, "utf8");
const audioManagerSource = fs.readFileSync(audioManagerPath, "utf8");

test("next AI speech prefetch warms first TTS segment without queueing playback", () => {
  assert.match(dayPhaseSource, /const prefetchFirstSegmentAudio = \(segment: string\) => \{/);
  assert.match(dayPhaseSource, /onSegmentReceived: \(segment\) => \{[\s\S]*prefetchFirstSegmentAudio\(segment\);/);
  assert.match(dayPhaseSource, /onComplete: \(finalSegments\) => \{[\s\S]*prefetchFirstSegmentAudio\(finalSegments\[0\]\);/);
  assert.doesNotMatch(
    dayPhaseSource.match(/const prefetchFirstSegmentAudio = \(segment: string\) => \{[\s\S]*?\n    \};/)?.[0] ?? "",
    /addToQueue/,
    "prefetch should warm the audio cache only; playback remains serial"
  );
});

test("TTS fetches have timeout and unblock playback flow on failures", () => {
  assert.match(audioManagerSource, /const TTS_REQUEST_TIMEOUT_MS = 20000;/);
  assert.match(audioManagerSource, /signal: controller\.signal/);
  assert.match(audioManagerSource, /controller\.abort\(\)/);
  assert.match(audioManagerSource, /this\.emit\(\{ type: "end", task: failedTask \}\);/);
});
