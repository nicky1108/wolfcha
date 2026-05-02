export const STANDARD_GAME_CREDIT_COST = 1;
export const VOICE_GAME_CREDIT_COST = 2;
export const GODS_BATTLE_CREDIT_COST = 4;

export function normalizeGameCreditCost(value: unknown): number {
  const cost = Number(value);
  if (cost === GODS_BATTLE_CREDIT_COST) return GODS_BATTLE_CREDIT_COST;
  if (cost === VOICE_GAME_CREDIT_COST) return VOICE_GAME_CREDIT_COST;
  return STANDARD_GAME_CREDIT_COST;
}
