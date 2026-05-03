import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readPngSize(path) {
  const buffer = await readFile(path);
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", `${path} must be a PNG file`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test("app icon files exist with expected dimensions", async () => {
  assert.deepEqual(await readPngSize("public/apple-touch-icon.png"), { width: 180, height: 180 });
  assert.deepEqual(await readPngSize("public/icons/favicon-16.png"), { width: 16, height: 16 });
  assert.deepEqual(await readPngSize("public/icons/favicon-32.png"), { width: 32, height: 32 });
  assert.deepEqual(await readPngSize("public/icons/icon-192.png"), { width: 192, height: 192 });
  assert.deepEqual(await readPngSize("public/icons/icon-512.png"), { width: 512, height: 512 });
  assert.deepEqual(await readPngSize("public/og-image.png"), { width: 1200, height: 630 });
});

test("web app manifest points at installable icons", async () => {
  const manifest = JSON.parse(await readFile("public/manifest.webmanifest", "utf8"));
  const iconSources = new Set(manifest.icons.map((icon) => icon.src));

  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#8b1d1d");
  assert.equal(iconSources.has("/icons/icon-192.png"), true);
  assert.equal(iconSources.has("/icons/icon-512.png"), true);
});
