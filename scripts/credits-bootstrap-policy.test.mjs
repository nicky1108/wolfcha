import assert from "node:assert/strict";
import test from "node:test";

import { shouldCapLegacyInitialCredits } from "../src/lib/credits-bootstrap-policy.ts";

const accountCreatedAt = "2026-05-01T00:00:00.000Z";
const freshNow = new Date("2026-05-01T01:00:00.000Z");

test("caps untouched legacy fresh-account grants above the signup quota", () => {
  assert.equal(
    shouldCapLegacyInitialCredits({
      userCreatedAt: accountCreatedAt,
      now: freshNow,
      row: {
        credits: 20,
        referred_by: null,
        total_referrals: 0,
        last_daily_bonus_at: null,
        created_at: accountCreatedAt,
        updated_at: accountCreatedAt,
      },
    }),
    true
  );
});

test("does not cap fresh-account credits after payment or admin adjustment updates the row", () => {
  assert.equal(
    shouldCapLegacyInitialCredits({
      userCreatedAt: accountCreatedAt,
      now: freshNow,
      row: {
        credits: 30,
        referred_by: null,
        total_referrals: 0,
        last_daily_bonus_at: null,
        created_at: accountCreatedAt,
        updated_at: "2026-05-01T00:05:00.000Z",
      },
    }),
    false
  );
});
