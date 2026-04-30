const { getGuestId, loadSettings } = require("../../utils/storage");

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function buildH5Url(settings) {
  const baseUrl = trimTrailingSlash(settings.h5Url || settings.apiBaseUrl);
  if (!baseUrl) return "";

  const separator = baseUrl.indexOf("?") >= 0 ? "&" : "?";
  const guestId = encodeURIComponent(getGuestId());
  return `${baseUrl}${separator}source=wechat-miniprogram&guestId=${guestId}`;
}

Page({
  data: {
    src: "",
  },

  onLoad() {
    const settings = loadSettings();
    const src = buildH5Url(settings);
    this.setData({ src });

    if (!src) {
      wx.showModal({
        title: "缺少 H5 地址",
        content: "请先在设置里配置 H5 URL 或 API Base URL。",
        showCancel: false,
        success: () => wx.redirectTo({ url: "/pages/settings/index" }),
      });
    }
  },

  onError() {
    wx.showModal({
      title: "H5 加载失败",
      content: "请确认 H5 URL 为 HTTPS 业务域名；开发工具可用 localhost，真机必须在微信公众平台配置业务域名。",
      confirmText: "去设置",
      cancelText: "原生页",
      success(result) {
        if (result.confirm) {
          wx.navigateTo({ url: "/pages/settings/index" });
        } else {
          wx.redirectTo({ url: "/pages/home/index" });
        }
      },
    });
  },

  onMessage(event) {
    const messages = event.detail && event.detail.data;
    if (messages && messages.length) {
      getApp().globalData.h5Messages = messages;
    }
  },
});
