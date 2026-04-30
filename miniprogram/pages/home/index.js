const { loadGameOptions, saveGameOptions } = require("../../utils/storage");
const { selectedCharacters } = require("../../utils/customCharacters");
const { getDefaultRoles, roleLabels, summarizeRoles } = require("../../utils/roles");

const playerCounts = [8, 9, 10, 11, 12];
const difficulties = [
  { value: "easy", label: "轻松" },
  { value: "normal", label: "标准" },
  { value: "hard", label: "硬核" },
];
const preferredRoles = ["", "Villager", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Idiot"];
const preferredRoleLabels = preferredRoles.map((role) => role ? roleLabels[role] : "随机");

Page({
  data: {
    playerCounts,
    difficulties,
    preferredRoles,
    preferredRoleLabels,
    roleLabels,
    playerCountIndex: 2,
    difficultyIndex: 1,
    preferredRoleIndex: 0,
    selectedCustomCount: 0,
    preferredRoleText: "随机",
    roleSummary: [],
  },

  onShow() {
    const options = loadGameOptions() || {};
    const playerCount = Number(options.playerCount) || 10;
    const difficulty = options.difficulty || "normal";
    const preferredRole = options.preferredRole || "";
    const selected = selectedCharacters();

    this.setData({
      playerCountIndex: Math.max(0, playerCounts.indexOf(playerCount)),
      difficultyIndex: Math.max(0, difficulties.findIndex((item) => item.value === difficulty)),
      preferredRoleIndex: Math.max(0, preferredRoles.indexOf(preferredRole)),
      selectedCustomCount: selected.length,
      preferredRoleText: preferredRole ? roleLabels[preferredRole] : "随机",
      roleSummary: summarizeRoles(getDefaultRoles(playerCount)),
    });
  },

  onPlayerCountChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      playerCountIndex: index,
      roleSummary: summarizeRoles(getDefaultRoles(playerCounts[index])),
    });
  },

  onDifficultyChange(event) {
    this.setData({ difficultyIndex: Number(event.detail.value) });
  },

  onPreferredRoleChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      preferredRoleIndex: index,
      preferredRoleText: preferredRoleLabels[index],
    });
  },

  openCustomCharacters() {
    wx.navigateTo({ url: "/pages/custom-characters/index" });
  },

  openSettings() {
    wx.navigateTo({ url: "/pages/settings/index" });
  },

  openH5() {
    wx.redirectTo({ url: "/pages/h5/index" });
  },

  startGame() {
    const customCharacters = selectedCharacters();
    const options = {
      playerCount: playerCounts[this.data.playerCountIndex],
      difficulty: difficulties[this.data.difficultyIndex].value,
      preferredRole: preferredRoles[this.data.preferredRoleIndex] || "",
      customCharacters,
    };
    saveGameOptions(options);
    wx.navigateTo({ url: "/pages/game/index" });
  },
});
