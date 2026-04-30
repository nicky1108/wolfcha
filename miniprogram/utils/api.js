const { getGuestId: readGuestId, loadSettings } = require("./storage");

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function getGuestId() {
  return readGuestId();
}

function buildHeaders(settings, extraHeaders) {
  const headers = {
    "content-type": "application/json",
    "x-guest-id": getGuestId(),
    ...(extraHeaders || {}),
  };

  if (settings.zenmuxApiKey) {
    headers["x-zenmux-api-key"] = settings.zenmuxApiKey.trim();
  }
  if (settings.dashscopeApiKey) {
    headers["x-dashscope-api-key"] = settings.dashscopeApiKey.trim();
  }
  if (settings.tokendanceApiKey) {
    headers["x-tokendance-api-key"] = settings.tokendanceApiKey.trim();
  }
  if (settings.tokendanceBaseUrl) {
    headers["x-tokendance-base-url"] = settings.tokendanceBaseUrl.trim();
  }

  return headers;
}

function responseErrorMessage(response) {
  const data = response && response.data;
  if (data && typeof data.error === "string") return data.error;
  if (data && data.details && typeof data.details.error === "string") return data.details.error;
  return `请求失败：${response.statusCode}`;
}

function request(path, options = {}) {
  const settings = loadSettings();
  const baseUrl = normalizeBaseUrl(options.baseUrl || settings.apiBaseUrl);
  if (!baseUrl) {
    return Promise.reject(new Error("请先在设置中配置 API Base URL"));
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${path}`,
      method: options.method || "GET",
      data: options.data,
      header: buildHeaders(settings, options.header),
      timeout: options.timeout || 30000,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data);
          return;
        }
        reject(new Error(responseErrorMessage(response)));
      },
      fail(error) {
        reject(new Error(error.errMsg || "网络请求失败"));
      },
    });
  });
}

function checkBackend() {
  return request("/api/demo-config", { method: "GET", timeout: 8000 });
}

function generateGameAction(payload) {
  const settings = loadSettings();
  return request("/api/miniprogram/game-action", {
    method: "POST",
    data: {
      provider: payload.provider || settings.aiProvider,
      model: payload.model || settings.aiModel,
      messages: payload.messages,
      temperature: payload.temperature || 0.8,
      max_tokens: payload.max_tokens || 260,
    },
    timeout: payload.timeout || 70000,
  });
}

function createGameSession(options) {
  return request("/api/game-sessions", {
    method: "POST",
    data: {
      action: "create",
      playerCount: options.playerCount,
      difficulty: options.difficulty,
      usedCustomKey: Boolean(options.usedCustomKey),
      modelUsed: options.modelUsed || "",
      region: options.region || "miniprogram",
    },
    timeout: 12000,
  });
}

function updateGameSession(sessionId, stats) {
  if (!sessionId) return Promise.resolve({ success: false, skipped: true });

  return request("/api/game-sessions", {
    method: "POST",
    data: {
      action: "update",
      sessionId,
      winner: stats.winner || null,
      completed: Boolean(stats.completed),
      roundsPlayed: Number(stats.roundsPlayed) || 0,
      durationSeconds: Number(stats.durationSeconds) || 0,
      aiCallsCount: Number(stats.aiCallsCount) || 0,
      aiInputChars: Number(stats.aiInputChars) || 0,
      aiOutputChars: Number(stats.aiOutputChars) || 0,
      aiPromptTokens: Number(stats.aiPromptTokens) || 0,
      aiCompletionTokens: Number(stats.aiCompletionTokens) || 0,
    },
    timeout: 12000,
  });
}

module.exports = {
  checkBackend,
  createGameSession,
  generateGameAction,
  getGuestId,
  request,
  updateGameSession,
};
