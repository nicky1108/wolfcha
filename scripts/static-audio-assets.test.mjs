import assert from "node:assert/strict";
import test from "node:test";

test("builds static audio URLs from an optional CDN base", async () => {
  process.env.NEXT_PUBLIC_AUDIO_ASSET_BASE_URL = "https://cdn.example.com/wolfcha/";
  const { AUDIO_ASSET_BASE_URL, getStaticAudioAssetUrl } = await import(
    "../src/lib/static-audio-assets.ts?cdn-test=1"
  );

  assert.equal(AUDIO_ASSET_BASE_URL, "https://cdn.example.com/wolfcha");
  assert.equal(
    getStaticAudioAssetUrl("/audio/narrator/zh/nightFall.mp3"),
    "https://cdn.example.com/wolfcha/audio/narrator/zh/nightFall.mp3"
  );
  assert.equal(
    getStaticAudioAssetUrl("bgm/day.mp3"),
    "https://cdn.example.com/wolfcha/bgm/day.mp3"
  );
});
