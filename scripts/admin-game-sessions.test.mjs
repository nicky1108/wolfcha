import assert from "node:assert/strict";
import test from "node:test";

import {
  getAdminGameSessionTotalPages,
  normalizeAdminGameSessionPageParams,
} from "../src/lib/admin-game-sessions.ts";

test("normalizes admin game-session pagination safely", () => {
  const params = normalizeAdminGameSessionPageParams(
    new URLSearchParams("page=3&pageSize=50&q=%20player@example.com%20&status=completed")
  );

  assert.deepEqual(params, {
    page: 3,
    pageSize: 50,
    offset: 100,
    query: "player@example.com",
    status: "completed",
  });
});

test("falls back for invalid admin game-session pagination options", () => {
  const params = normalizeAdminGameSessionPageParams(
    new URLSearchParams("page=-4&pageSize=999&status=weird")
  );

  assert.equal(params.page, 1);
  assert.equal(params.pageSize, 20);
  assert.equal(params.offset, 0);
  assert.equal(params.status, "all");
});

test("calculates at least one page for empty game-session results", () => {
  assert.equal(getAdminGameSessionTotalPages(0, 20), 1);
  assert.equal(getAdminGameSessionTotalPages(41, 20), 3);
});
