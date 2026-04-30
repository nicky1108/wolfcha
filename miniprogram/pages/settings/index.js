const { checkBackend } = require("../../utils/api");
const { loadSettings, saveSettings } = require("../../utils/storage");

const aiProviders = [
  { value: "tokendance", label: "TokenDance" },
  { value: "zenmux", label: "ZenMux" },
  { value: "dashscope", label: "百炼 DashScope" },
];

const aiModels = [
  "gpt-5.5",
  "gpt-5.4-mini",
  "MiniMax-M2.7-highspeed",
  "kimi-k2.5",
  "glm-5",
  "qwen3.6-plus",
];

Page({
  data: {
    aiProviders,
    aiProviderLabels: aiProviders.map((item) => item.label),
    aiModels,
    apiBaseUrl: "",
    h5Url: "",
    aiProvider: "tokendance",
    aiProviderIndex: 0,
    aiModel: "gpt-5.4-mini",
    aiModelIndex: 0,
    zenmuxApiKey: "",
    dashscopeApiKey: "",
    tokendanceApiKey: "",
    tokendanceBaseUrl: "",
    soundEnabled: true,
    aiVoiceEnabled: false,
    autoAdvanceDialogueEnabled: false,
    checking: false,
  },

  onLoad() {
    const settings = loadSettings();
    this.setData({
      ...settings,
      aiProviderIndex: Math.max(0, aiProviders.findIndex((item) => item.value === settings.aiProvider)),
      aiModelIndex: Math.max(0, aiModels.indexOf(settings.aiModel)),
    });
  },

  onApiBaseUrlInput(event) {
    this.setData({ apiBaseUrl: event.detail.value });
  },

  onH5UrlInput(event) {
    this.setData({ h5Url: event.detail.value });
  },

  onTextInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value });
  },

  onProviderChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      aiProviderIndex: index,
      aiProvider: aiProviders[index].value,
    });
  },

  onModelChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      aiModelIndex: index,
      aiModel: aiModels[index],
    });
  },

  toggleSetting(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: !this.data[key] });
  },

  save() {
    const settings = saveSettings({
      apiBaseUrl: this.data.apiBaseUrl.trim(),
      h5Url: this.data.h5Url.trim(),
      aiProvider: this.data.aiProvider,
      aiModel: this.data.aiModel.trim(),
      zenmuxApiKey: this.data.zenmuxApiKey.trim(),
      dashscopeApiKey: this.data.dashscopeApiKey.trim(),
      tokendanceApiKey: this.data.tokendanceApiKey.trim(),
      tokendanceBaseUrl: this.data.tokendanceBaseUrl.trim(),
      soundEnabled: this.data.soundEnabled,
      aiVoiceEnabled: this.data.aiVoiceEnabled,
      autoAdvanceDialogueEnabled: this.data.autoAdvanceDialogueEnabled,
    });
    getApp().globalData.settings = settings;
    wx.showToast({ title: "已保存", icon: "success" });
  },

  openH5() {
    this.save();
    wx.redirectTo({ url: "/pages/h5/index" });
  },

  async checkBackend() {
    if (this.data.checking) return;
    this.save();
    this.setData({ checking: true });
    try {
      await checkBackend();
      wx.showToast({ title: "连接正常", icon: "success" });
    } catch (error) {
      wx.showModal({
        title: "连接失败",
        content: error.message || "请检查 API Base URL 和小程序 request 合法域名。",
        showCancel: false,
      });
    } finally {
      this.setData({ checking: false });
    }
  },
});
