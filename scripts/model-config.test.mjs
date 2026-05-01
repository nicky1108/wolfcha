import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const gameTypesPath = path.resolve(process.cwd(), "src/types/game.ts");
const source = fs.readFileSync(gameTypesPath, "utf8");

test("default TokenDance model uses MiniMax highspeed and player pool excludes gpt-5.5", () => {
  assert.match(
    source,
    /generator:\s*MODEL_IDS\.tokendance\.minimaxM27Highspeed/,
    "character generation should default to MiniMax-M2.7-highspeed"
  );

  const playerPoolMatch = source.match(/export const BUILTIN_PLAYER_MODELS:[\s\S]*?\n\];/);
  assert.ok(playerPoolMatch, "built-in player model pool should be declared");
  assert.doesNotMatch(playerPoolMatch[0], /MODEL_IDS\.tokendance\.gpt55/);
  assert.match(playerPoolMatch[0], /MODEL_IDS\.tokendance\.gpt54/);
  assert.match(playerPoolMatch[0], /MODEL_IDS\.tokendance\.gemini25FlashLite/);
  assert.match(playerPoolMatch[0], /MODEL_IDS\.tokendance\.qwen35Plus/);
  assert.match(playerPoolMatch[0], /MODEL_IDS\.tokendance\.minimaxM25Highspeed/);
});
