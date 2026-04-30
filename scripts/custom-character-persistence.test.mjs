import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCustomCharacterInsert,
  isVisibleCustomCharacter,
  normalizeCustomCharacterRow,
} from "../src/lib/custom-character-persistence.ts";

test("new custom character insert payload is visible to list loading", () => {
  const payload = buildCustomCharacterInsert(
    "user-1",
    {
      display_name: "  阿青  ",
      gender: "female",
      age: 29,
      mbti: "intj",
      basic_info: "  善于盘逻辑  ",
      style_label: "  冷静  ",
      avatar_seed: "",
    },
    "fallback-seed"
  );

  assert.equal(payload.user_id, "user-1");
  assert.equal(payload.display_name, "阿青");
  assert.equal(payload.mbti, "INTJ");
  assert.equal(payload.basic_info, "善于盘逻辑");
  assert.equal(payload.style_label, "冷静");
  assert.equal(payload.avatar_seed, "fallback-seed");
  assert.equal(payload.is_deleted, false);
  assert.equal(isVisibleCustomCharacter(payload), true);
});

test("legacy rows without is_deleted are still visible and normalized", () => {
  assert.equal(isVisibleCustomCharacter({ is_deleted: false }), true);
  assert.equal(isVisibleCustomCharacter({ is_deleted: null }), true);
  assert.equal(isVisibleCustomCharacter({}), true);
  assert.equal(isVisibleCustomCharacter({ is_deleted: true }), false);

  assert.deepEqual(normalizeCustomCharacterRow({ id: "row-1" }), {
    id: "row-1",
    is_deleted: false,
  });
  assert.deepEqual(normalizeCustomCharacterRow({ id: "row-2", is_deleted: true }), {
    id: "row-2",
    is_deleted: true,
  });
});
