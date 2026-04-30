import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  addSpeech,
  advancePhase,
  applyAiSpeech,
  buildAiSpeechMessages,
  createGame,
  getCurrentAiPlayer,
  resolveCurrentPhase,
  selectTarget,
} = require("../miniprogram/utils/game.js");

function advanceTo(game, phaseKey) {
  let next = game;
  for (let i = 0; i < 20; i += 1) {
    if (next.phase.key === phaseKey) return next;
    next = advancePhase(next);
  }
  throw new Error(`Failed to reach ${phaseKey}`);
}

test("mini program game resolves target-based night actions", () => {
  let game = createGame({ playerCount: 10, difficulty: "normal", preferredRole: "Villager" });
  game = advancePhase(game);

  assert.equal(game.phase.key, "NIGHT_GUARD_ACTION");
  assert.equal(game.needsTarget, true);
  assert.ok(game.targetPlayers.length > 0);

  game = selectTarget(game, game.targetPlayers[0].playerId);
  assert.notEqual(game.selectedTargetName, "未选择");

  game = resolveCurrentPhase(game);
  assert.match(game.messages.at(-1).content, /守卫守护/);
});

test("mini program speech flow rotates speakers and builds AI prompts", () => {
  let game = createGame({
    playerCount: 10,
    difficulty: "normal",
    preferredRole: "Villager",
    customCharacters: [{ display_name: "阿青", mbti: "INTJ", style_label: "冷静、谨慎" }],
  });

  game = advanceTo(game, "DAY_SPEECH");
  assert.match(game.currentSpeakerName, /1 号/);

  game = addSpeech(game, "p1", "我先听后置位发言。");
  const aiPlayer = getCurrentAiPlayer(game);
  assert.ok(aiPlayer);
  assert.equal(aiPlayer.isHuman, false);

  const messages = buildAiSpeechMessages(game, aiPlayer.playerId);
  assert.equal(messages.length, 2);
  assert.match(messages[1].content, /你的身份/);

  game = applyAiSpeech(game, aiPlayer.playerId, "我会先观察狼坑位置，暂时不跳身份。");
  assert.equal(game.stats.aiCallsCount, 1);
  assert.match(game.messages.at(-1).content, /暂时不跳身份/);
});
