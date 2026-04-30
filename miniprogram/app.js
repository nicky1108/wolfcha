const { loadSettings } = require("./utils/storage");

App({
  globalData: {
    settings: loadSettings(),
  },

  onLaunch() {
    this.globalData.settings = loadSettings();
  },
});
