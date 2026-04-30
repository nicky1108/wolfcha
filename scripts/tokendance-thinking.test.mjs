import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const routePath = path.resolve(process.cwd(), "src/app/api/chat/route.ts");
const routeSource = fs.readFileSync(routePath, "utf8");

test("TokenDance thinking is disabled for Qwen 3.6 speech models", () => {
  const helperMatch = routeSource.match(
    /function shouldDisableTokendanceThinking\(model: string\): boolean \{[\s\S]*?\n\}/
  );
  assert.ok(helperMatch, "TokenDance thinking-disable logic should be centralized");
  assert.match(
    helperMatch[0],
    /qwen/,
    "qwen3.6-plus must be covered so streamed game speech appears in delta.content"
  );
});
