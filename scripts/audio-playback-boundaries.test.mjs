import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");

test("narration is controlled by the master sound switch, not background music volume", () => {
  assert.match(pageSource, /narratorPlayer\.setEnabled\(isSoundEnabled\)/);
  assert.doesNotMatch(pageSource, /narratorPlayer\.setEnabled\(isSoundEnabled\s*&&\s*bgmVolume\s*>\s*0\)/);
});

test("background music is preloaded and unlocked by pointer or keyboard gestures", () => {
  assert.match(pageSource, /audio\.preload\s*=\s*"auto"/);
  assert.match(pageSource, /window\.addEventListener\("pointerdown",\s*unlock/);
  assert.match(pageSource, /window\.addEventListener\("keydown",\s*unlock/);
});
