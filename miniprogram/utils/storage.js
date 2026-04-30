const SETTINGS_KEY = "wolfcha:miniprogram:settings";
const CUSTOM_CHARACTERS_KEY = "wolfcha:miniprogram:custom_characters";
const GAME_OPTIONS_KEY = "wolfcha:miniprogram:last_game_options";
const GUEST_ID_KEY = "wolfcha:miniprogram:guest_id";

const defaultSettings = {
  apiBaseUrl: "http://localhost:3000",
  h5Url: "http://localhost:3000",
  soundEnabled: true,
  aiVoiceEnabled: false,
  autoAdvanceDialogueEnabled: false,
  aiProvider: "tokendance",
  aiModel: "gpt-5.4-mini",
  zenmuxApiKey: "",
  dashscopeApiKey: "",
  tokendanceApiKey: "",
  tokendanceBaseUrl: "",
};

function read(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value || fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  wx.setStorageSync(key, value);
}

function loadSettings() {
  return {
    ...defaultSettings,
    ...read(SETTINGS_KEY, {}),
  };
}

function saveSettings(settings) {
  const next = {
    ...defaultSettings,
    ...settings,
  };
  write(SETTINGS_KEY, next);
  return next;
}

function loadCustomCharacters() {
  const value = read(CUSTOM_CHARACTERS_KEY, []);
  return Array.isArray(value) ? value : [];
}

function saveCustomCharacters(characters) {
  write(CUSTOM_CHARACTERS_KEY, Array.isArray(characters) ? characters : []);
}

function loadGameOptions() {
  return read(GAME_OPTIONS_KEY, null);
}

function saveGameOptions(options) {
  write(GAME_OPTIONS_KEY, options);
}

function createGuestId() {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `guest_mp_${Date.now().toString(36)}_${suffix}`;
}

function getGuestId() {
  const stored = read(GUEST_ID_KEY, "");
  if (typeof stored === "string" && stored.indexOf("guest_") === 0) {
    return stored;
  }
  const guestId = createGuestId();
  write(GUEST_ID_KEY, guestId);
  return guestId;
}

module.exports = {
  getGuestId,
  loadSettings,
  saveSettings,
  loadCustomCharacters,
  saveCustomCharacters,
  loadGameOptions,
  saveGameOptions,
};
