import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const bgmDir = new URL("../public/bgm", import.meta.url);
const maxBgmBytes = 1_500_000;

function isMpegAudioHeader(bytes) {
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

test("background music assets are browser-friendly MPEG audio", () => {
  const files = readdirSync(bgmDir).filter((file) => file.endsWith(".mp3"));

  assert.ok(files.length > 0, "expected at least one BGM mp3 asset");

  for (const file of files) {
    const path = join(bgmDir.pathname, file);
    const header = readFileSync(path).subarray(0, 16);
    const magic = header.subarray(0, 4).toString("ascii");

    assert.notEqual(magic, "RIFF", `${file} is WAV data with a .mp3 extension`);
    assert.equal(isMpegAudioHeader(header), true, `${file} should start with an MP3 header`);
    assert.ok(statSync(path).size <= maxBgmBytes, `${file} should stay below ${maxBgmBytes} bytes`);
  }
});
