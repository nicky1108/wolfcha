export const STANDARD_GAME_CREDIT_COST = 1;
export const VOICE_GAME_CREDIT_COST = 2;

export function normalizeGameCreditCost(value: unknown): number {
  return Number(value) === VOICE_GAME_CREDIT_COST ? VOICE_GAME_CREDIT_COST : STANDARD_GAME_CREDIT_COST;
}
