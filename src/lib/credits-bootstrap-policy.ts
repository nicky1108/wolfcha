export const INITIAL_SIGNUP_CREDITS = 10;
export const FRESH_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

type BootstrapCreditRow = {
  credits: number | string;
  referred_by?: string | null;
  total_referrals?: number | string | null;
  last_daily_bonus_at?: string | Date | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
};

type ShouldCapLegacyInitialCreditsInput = {
  userCreatedAt: string | Date;
  row: BootstrapCreditRow;
  now?: Date;
  initialCredits?: number;
  freshAccountWindowMs?: number;
};

function timestampMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function shouldCapLegacyInitialCredits({
  userCreatedAt,
  row,
  now = new Date(),
  initialCredits = INITIAL_SIGNUP_CREDITS,
  freshAccountWindowMs = FRESH_ACCOUNT_WINDOW_MS,
}: ShouldCapLegacyInitialCreditsInput): boolean {
  const userCreatedAtMs = timestampMs(userCreatedAt);
  if (userCreatedAtMs === null || now.getTime() - userCreatedAtMs > freshAccountWindowMs) {
    return false;
  }

  const credits = Number(row.credits ?? 0);
  if (!Number.isFinite(credits) || credits <= initialCredits) {
    return false;
  }

  const createdAtMs = timestampMs(row.created_at);
  const updatedAtMs = timestampMs(row.updated_at);
  const rowHasNeverBeenAdjusted = createdAtMs !== null && updatedAtMs !== null && createdAtMs === updatedAtMs;

  return (
    rowHasNeverBeenAdjusted &&
    !row.referred_by &&
    Number(row.total_referrals ?? 0) === 0 &&
    !row.last_daily_bonus_at
  );
}
