const {
  genderLabels,
  listCharacters,
  mbtiOptions,
  removeCharacter,
  toggleSelected,
  upsertCharacter,
} = require("../../utils/customCharacters");

const genders = ["male", "female", "nonbinary"];

function emptyForm() {
  return {
    id: "",
    display_name: "",
    gender: "male",
    age: 25,
    mbti: "",
    basic_info: "",
    style_label: "",
    avatar_seed: "",
  };
}

Page({
  data: {
    characters: [],
    mode: "list",
    isListMode: true,
    isEmpty: true,
    formTitle: "新增角色",
    form: emptyForm(),
    genders,
    genderLabels,
    mbtiOptions: ["", ...mbtiOptions],
    genderIndex: 0,
    mbtiIndex: 0,
    detail: null,
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const characters = listCharacters();
    this.setData({
      characters,
      isEmpty: characters.length === 0,
    });
  },

  create() {
    this.setData({
      mode: "form",
      isListMode: false,
      formTitle: "新增角色",
      form: emptyForm(),
      genderIndex: 0,
      mbtiIndex: 0,
    });
  },

  edit(event) {
    const id = event.currentTarget.dataset.id;
    const character = this.data.characters.find((item) => item.id === id);
    if (!character) return;
    this.setData({
      mode: "form",
      isListMode: false,
      formTitle: "编辑角色",
      form: { ...character },
      genderIndex: Math.max(0, genders.indexOf(character.gender)),
      mbtiIndex: Math.max(0, ["", ...mbtiOptions].indexOf(character.mbti || "")),
    });
  },

  detail(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({
      detail: this.data.characters.find((item) => item.id === id) || null,
    });
  },

  closeDetail() {
    this.setData({ detail: null });
  },

  noop() {},

  backToList() {
    this.setData({
      mode: "list",
      isListMode: true,
      form: emptyForm(),
    });
    this.refresh();
  },

  onInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: event.detail.value });
  },

  onGenderChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      genderIndex: index,
      "form.gender": genders[index],
    });
  },

  onMbtiChange(event) {
    const options = ["", ...mbtiOptions];
    const index = Number(event.detail.value);
    this.setData({
      mbtiIndex: index,
      "form.mbti": options[index],
    });
  },

  save() {
    if (!this.data.form.display_name.trim()) {
      wx.showToast({ title: "请输入名字", icon: "none" });
      return;
    }
    upsertCharacter(this.data.form);
    wx.showToast({ title: "已保存", icon: "success" });
    this.backToList();
  },

  remove(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "删除角色",
      content: "确认删除这个自定义角色吗？",
      success: (result) => {
        if (!result.confirm) return;
        removeCharacter(id);
        this.refresh();
      },
    });
  },

  toggle(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ characters: toggleSelected(id) });
  },
});
