import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(process.cwd(), "miniprogram");
const repoRoot = path.resolve(process.cwd());

function readJson(relativePath) {
  const filePath = path.join(root, relativePath);
  assert.ok(fs.existsSync(filePath), `Missing ${relativePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertFile(relativePath) {
  const filePath = path.join(root, relativePath);
  assert.ok(fs.existsSync(filePath), `Missing ${relativePath}`);
  assert.ok(fs.statSync(filePath).isFile(), `${relativePath} is not a file`);
}

function assertRepoFile(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  assert.ok(fs.existsSync(filePath), `Missing ${relativePath}`);
  assert.ok(fs.statSync(filePath).isFile(), `${relativePath} is not a file`);
}

function assertContains(relativePath, expected) {
  const filePath = path.join(root, relativePath);
  const content = fs.readFileSync(filePath, "utf8");
  assert.ok(content.includes(expected), `${relativePath} is missing ${expected}`);
}

function assertWxssCompatible(relativePath) {
  const filePath = path.join(root, relativePath);
  const content = fs.readFileSync(filePath, "utf8");
  assert.equal(content.includes("calc("), false, `${relativePath} uses calc(), which is brittle in WXSS`);
  assert.equal(content.includes("env("), false, `${relativePath} uses env(), which is brittle in WXSS`);
}

function assertWxmlUsesCustomControls(relativePath) {
  const filePath = path.join(root, relativePath);
  const content = fs.readFileSync(filePath, "utf8");
  assert.equal(content.includes("<button"), false, `${relativePath} uses default <button>; use styled view controls`);
  assert.equal(content.includes("<switch"), false, `${relativePath} uses default <switch>; use styled view controls`);
}

const appConfig = readJson("app.json");
assert.deepEqual(appConfig.pages, [
  "pages/h5/index",
  "pages/home/index",
  "pages/custom-characters/index",
  "pages/game/index",
  "pages/settings/index",
]);

for (const page of appConfig.pages) {
  assertFile(`${page}.js`);
  assertFile(`${page}.json`);
  assertFile(`${page}.wxml`);
  assertFile(`${page}.wxss`);
  assertWxmlUsesCustomControls(`${page}.wxml`);
  assertWxssCompatible(`${page}.wxss`);
}

for (const file of [
  "app.js",
  "app.wxss",
  "project.config.json",
  "README.md",
  "utils/api.js",
  "utils/customCharacters.js",
  "utils/game.js",
  "utils/roles.js",
  "utils/storage.js",
]) {
  assertFile(file);
}

assertWxssCompatible("app.wxss");

assertRepoFile("src/app/api/miniprogram/game-action/route.ts");

assertContains("utils/api.js", "function getGuestId");
assertContains("utils/api.js", "function generateGameAction");
assertContains("utils/api.js", "function createGameSession");
assertContains("utils/api.js", "function updateGameSession");

assertContains("pages/h5/index.wxml", "<web-view");
assertContains("pages/h5/index.js", "function buildH5Url");
assertContains("pages/settings/index.wxml", "bindtap=\"openH5\"");

assertContains("utils/game.js", "function buildAiSpeechMessages");
assertContains("utils/game.js", "function getCurrentAiPlayer");
assertContains("utils/game.js", "function resolveCurrentPhase");
assertContains("utils/game.js", "function selectTarget");

assertContains("pages/game/index.wxml", "bindtap=\"generateAiSpeech\"");
assertContains("pages/game/index.wxml", "bindtap=\"selectTarget\"");
assertContains("pages/game/index.wxml", "bindtap=\"resolvePhase\"");

const projectConfig = readJson("project.config.json");
assert.equal(projectConfig.projectname, "wolfcha-miniprogram");
assert.equal(projectConfig.miniprogramRoot, "./");

console.log("Mini program structure is valid.");
