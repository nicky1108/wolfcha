const { createGameSession, generateGameAction, updateGameSession } = require("../../utils/api");
const { loadGameOptions, loadSettings } = require("../../utils/storage");
const {
  addSpeech,
  advancePhase,
  applyAiSpeech,
  buildAiSpeechMessages,
  createGame,
  getCurrentAiPlayer,
  markAiPromptSent,
  resolveCurrentPhase,
  selectTarget,
  withViewState,
} = require("../../utils/game");

function hasCustomKey(settings) {
  return Boolean(
    settings.zenmuxApiKey
    || settings.dashscopeApiKey
    || settings.tokendanceApiKey
  );
}

Page({
  data: {
    game: null,
    speechDraft: "",
    loadingAi: false,
    aiError: "",
    sessionWarning: "",
  },

  onLoad() {
    const options = loadGameOptions() || {
      playerCount: 10,
      difficulty: "normal",
      preferredRole: "",
      customCharacters: [],
    };
    const game = createGame(options);
    this.setData({ game });
    this.createSession(game);
  },

  setGame(game) {
    this.setData({ game: withViewState(game) });
  },

  async createSession(game) {
    const settings = loadSettings();
    try {
      const response = await createGameSession({
        playerCount: game.playerCount,
        difficulty: game.difficulty,
        usedCustomKey: hasCustomKey(settings),
        modelUsed: settings.aiModel,
      });
      if (response && response.sessionId) {
        this.setGame({
          ...this.data.game,
          sessionId: response.sessionId,
        });
      }
    } catch (error) {
      this.setData({
        sessionWarning: error.message || "会话上报不可用，游戏仍可继续。",
      });
    }
  },

  nextPhase() {
    if (!this.data.game || this.data.game.winner) return;
    this.setGame(advancePhase(this.data.game));
  },

  onSpeechInput(event) {
    this.setData({ speechDraft: event.detail.value });
  },

  submitSpeech() {
    const game = this.data.game;
    if (!game || game.winner) return;

    const draft = this.data.speechDraft.trim();
    if (!draft) {
      wx.showToast({ title: "请输入发言", icon: "none" });
      return;
    }

    this.setGame(addSpeech(game, "p1", draft));
    this.setData({ speechDraft: "" });
  },

  selectTarget(event) {
    const targetId = event.currentTarget.dataset.id;
    if (!targetId || !this.data.game || this.data.game.winner) return;
    this.setGame(selectTarget(this.data.game, targetId));
  },

  resolvePhase() {
    const game = this.data.game;
    if (!game || game.winner) return;

    const next = resolveCurrentPhase(game);
    this.setGame(next);
    if (next.winner) this.updateSession(next, true);
  },

  async generateAiSpeech() {
    if (this.data.loadingAi || !this.data.game || this.data.game.winner) return;

    const aiPlayer = getCurrentAiPlayer(this.data.game);
    if (!aiPlayer) {
      wx.showToast({ title: "当前没有 AI 可行动", icon: "none" });
      return;
    }

    const messages = buildAiSpeechMessages(this.data.game, aiPlayer.playerId);
    if (!messages.length) return;

    this.setData({
      loadingAi: true,
      aiError: "",
      game: markAiPromptSent(this.data.game, messages),
    });

    try {
      const response = await generateGameAction({ messages });
      const next = applyAiSpeech(this.data.game, aiPlayer.playerId, response.content);
      this.setGame(next);
    } catch (error) {
      const message = error.message || "AI 接口调用失败";
      this.setData({ aiError: message });
      wx.showModal({
        title: "AI 发言失败",
        content: message,
        showCancel: false,
      });
    } finally {
      this.setData({ loadingAi: false });
    }
  },

  updateSession(game, completed) {
    updateGameSession(game.sessionId, {
      winner: game.winner || null,
      completed,
      roundsPlayed: game.day,
      durationSeconds: Math.max(0, Math.round((Date.now() - Number(game.startedAt || Date.now())) / 1000)),
      aiCallsCount: (game.stats || {}).aiCallsCount,
      aiInputChars: (game.stats || {}).aiInputChars,
      aiOutputChars: (game.stats || {}).aiOutputChars,
      aiPromptTokens: (game.stats || {}).aiPromptTokens,
      aiCompletionTokens: (game.stats || {}).aiCompletionTokens,
    }).catch(() => {});
  },

  restart() {
    if (this.data.game) {
      this.updateSession(this.data.game, Boolean(this.data.game.winner));
    }
    wx.redirectTo({ url: "/pages/home/index" });
  },
});
