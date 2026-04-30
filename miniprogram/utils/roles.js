const roleLabels = {
  Villager: "平民",
  Werewolf: "狼人",
  WhiteWolfKing: "白狼王",
  Seer: "预言家",
  Witch: "女巫",
  Hunter: "猎人",
  Guard: "守卫",
  Idiot: "白痴",
};

const roleDescriptions = {
  Villager: "没有夜间技能，依靠发言和投票找出狼人。",
  Werewolf: "夜晚共同选择一名玩家出局，白天隐藏身份。",
  WhiteWolfKing: "狼人阵营，可在合适时机发动强力带人出局。",
  Seer: "每晚查验一名玩家阵营，是好人阵营的信息核心。",
  Witch: "拥有解药和毒药，各可使用一次。",
  Hunter: "出局后通常可以开枪带走一名玩家。",
  Guard: "每晚守护一名玩家，抵挡狼人袭击。",
  Idiot: "被公投出局后可翻牌免死，但失去投票权。",
};

function isWolfRole(role) {
  return role === "Werewolf" || role === "WhiteWolfKing";
}

function getRoleLabel(role) {
  return roleLabels[role] || role || "?";
}

function getDefaultRoles(playerCount) {
  switch (Number(playerCount)) {
    case 8:
      return ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager"];
    case 9:
      return ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager", "Villager"];
    case 11:
      return ["Werewolf", "Werewolf", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Idiot", "Villager", "Villager"];
    case 12:
      return ["Werewolf", "Werewolf", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Idiot", "Villager", "Villager", "Villager"];
    case 10:
    default:
      return ["Werewolf", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Villager", "Villager", "Villager"];
  }
}

function summarizeRoles(roles) {
  const counts = {};
  roles.forEach((role) => {
    counts[role] = (counts[role] || 0) + 1;
  });
  return Object.keys(counts).map((role) => ({
    role,
    label: getRoleLabel(role),
    count: counts[role],
    wolf: isWolfRole(role),
    className: isWolfRole(role) ? "wolf" : "",
  }));
}

module.exports = {
  getDefaultRoles,
  getRoleLabel,
  isWolfRole,
  roleDescriptions,
  roleLabels,
  summarizeRoles,
};
