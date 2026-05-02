import assert from "node:assert/strict";
import test from "node:test";
import godsBattleOptionsModule from "../src/lib/gods-battle-options.ts";

const { buildGodsBattleStartOptions } = godsBattleOptionsModule;

test("gods battle enables dialogue autoplay by default", () => {
  const options = buildGodsBattleStartOptions();

  assert.equal(options.playerCount, 8);
  assert.equal(options.isGenshinMode, true);
  assert.equal(options.isSpectatorMode, true);
  assert.equal(options.enableAiVoice, true);
  assert.equal(options.enableAutoAdvanceDialogue, true);
  assert.equal(options.fixedModelRefs.length, 8);
  assert.equal(new Set(options.fixedModelRefs.map((modelRef) => modelRef.model)).size, 8);
});
