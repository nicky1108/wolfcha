import assert from "node:assert/strict";
import test from "node:test";

import shareModule from "../src/lib/game-recording-share.ts";

const { buildRecordingAnalysisSharePath, buildRecordingSharePath, buildRecordingShareUrl } = shareModule;

test("builds recording replay share paths with token encoding", () => {
  assert.equal(
    buildRecordingSharePath("rec/with space", "token+with/slash"),
    "/recordings/rec%2Fwith%20space?share=token%2Bwith%2Fslash"
  );
});

test("builds absolute replay share urls without duplicate slashes", () => {
  assert.equal(
    buildRecordingShareUrl("https://wolfcha.openhubs.xyz/", "rec-1", "share-token"),
    "https://wolfcha.openhubs.xyz/recordings/rec-1?share=share-token"
  );
});

test("builds analysis report links with the same share token", () => {
  assert.equal(
    buildRecordingAnalysisSharePath("rec-1", "share-token"),
    "/recordings/rec-1/analysis?share=share-token"
  );
});
