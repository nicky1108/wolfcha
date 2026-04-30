const { loadCustomCharacters, saveCustomCharacters } = require("./storage");

const genderLabels = {
  male: "男声",
  female: "女声",
  nonbinary: "中性",
};

const mbtiOptions = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];

function nowId() {
  return `cc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCharacter(input) {
  const displayName = String(input.display_name || input.displayName || input.name || "").trim().slice(0, 20);
  const gender = ["male", "female", "nonbinary"].includes(input.gender) ? input.gender : "male";
  const age = Math.min(70, Math.max(16, Number(input.age) || 25));
  const mbti = mbtiOptions.includes(String(input.mbti || "").toUpperCase())
    ? String(input.mbti).toUpperCase()
    : "";

  return {
    id: input.id || nowId(),
    display_name: displayName || "未命名角色",
    initial: (displayName || "未").slice(0, 1),
    gender,
    gender_label: genderLabels[gender],
    age,
    mbti,
    basic_info: String(input.basic_info || input.basicInfo || "").trim().slice(0, 400),
    style_label: String(input.style_label || input.styleLabel || "").trim().slice(0, 400),
    avatar_seed: String(input.avatar_seed || input.avatarSeed || displayName || "custom").trim(),
    selected: Boolean(input.selected),
    selectedText: input.selected ? "取消出场" : "选择出场",
    updated_at: new Date().toISOString(),
  };
}

function listCharacters() {
  return loadCustomCharacters().map(normalizeCharacter);
}

function upsertCharacter(input) {
  const characters = listCharacters();
  const normalized = normalizeCharacter(input);
  const index = characters.findIndex((item) => item.id === normalized.id);
  if (index >= 0) {
    characters[index] = {
      ...characters[index],
      ...normalized,
    };
  } else {
    characters.unshift(normalized);
  }
  saveCustomCharacters(characters);
  return normalized;
}

function removeCharacter(id) {
  const characters = listCharacters().filter((item) => item.id !== id);
  saveCustomCharacters(characters);
  return characters;
}

function toggleSelected(id) {
  const characters = listCharacters().map((item) => (
    item.id === id
      ? { ...item, selected: !item.selected, selectedText: !item.selected ? "取消出场" : "选择出场" }
      : item
  ));
  saveCustomCharacters(characters);
  return characters;
}

function selectedCharacters() {
  return listCharacters().filter((item) => item.selected);
}

module.exports = {
  genderLabels,
  listCharacters,
  mbtiOptions,
  normalizeCharacter,
  removeCharacter,
  selectedCharacters,
  toggleSelected,
  upsertCharacter,
};
