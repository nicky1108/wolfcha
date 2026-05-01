import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const middlewarePath = path.resolve(process.cwd(), "src/middleware.ts");
const deployScriptPath = path.resolve(process.cwd(), "scripts/deploy-vps.sh");
const middlewareSource = fs.readFileSync(middlewarePath, "utf8");
const deployScriptSource = fs.readFileSync(deployScriptPath, "utf8");

test("locale redirects use public origin instead of proxied localhost request URL", () => {
  assert.match(middlewareSource, /process\.env\.NEXT_PUBLIC_APP_URL/);
  assert.match(middlewareSource, /x-forwarded-host/);
  assert.match(middlewareSource, /buildLocaleRedirectUrl\(request,/);

  const redirectBlocks = middlewareSource.match(/NextResponse\.redirect\([\s\S]*?\)/g) ?? [];
  assert.ok(redirectBlocks.length >= 2, "middleware should keep redirecting zh locale requests");
  for (const block of redirectBlocks) {
    assert.doesNotMatch(block, /request\.url/, "redirect should not use proxied request.url as the URL base");
  }
});

test("VPS nginx config forwards the public host header explicitly", () => {
  assert.match(deployScriptSource, /proxy_set_header X-Forwarded-Host \\?\$host;/);
});
