import { GODS_BATTLE_MODELS, type StartGameOptions } from "@/types/game";

export function buildGodsBattleStartOptions(): StartGameOptions {
  return {
    difficulty: "normal",
    playerCount: 8,
    isGenshinMode: true,
    isSpectatorMode: true,
    enableAiVoice: true,
    enableAutoAdvanceDialogue: true,
    fixedModelRefs: GODS_BATTLE_MODELS,
  };
}
