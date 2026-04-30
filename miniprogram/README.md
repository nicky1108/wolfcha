# Wolfcha 微信小程序前端

这个目录是 Wolfcha 的微信小程序工程。默认入口使用 `web-view` 直接加载根目录的 Next.js H5，因此交互和样式与 H5 保持一致；原生页面保留为 H5 域名未配置时的兜底。

## 当前迁移范围

- H5 完整版：`pages/h5/index` 作为首屏，直接嵌入原 Next H5。
- 首页：人数、难度、偏好身份、自定义角色入口、开始游戏，作为原生兜底入口。
- 自定义角色：本地创建、编辑、查看、删除、选择出场角色。
- 游戏桌面：根据设置生成玩家席位、显示身份配置、完整阶段流转、目标选择、阶段结算、玩家/AI 发言、胜负检查。
- 设置：配置 H5 URL、后端 API Base URL、AI provider/model、自定义 API Key，并通过同一套 Next API 代理调用模型。
- 接口：小程序端通过 `utils/api.js` 统一携带访客身份和自定义 Key；AI 行动走 `/api/miniprogram/game-action`，会话统计走 `/api/game-sessions`。

## 后端连接

小程序不能直接复用浏览器里的 React/Jotai/Supabase 客户端状态。当前版本使用 `wx` storage 保存本地设置和自定义角色；联网能力通过 `utils/api.js` 调用现有 Next 服务，并自动添加 `x-guest-id`。

开发调试时可以在小程序设置页把 H5 URL 和 API Base URL 填为：

```text
http://localhost:3000
```

真机和上线时，H5 URL 必须是 HTTPS，并在微信公众平台后台加入 `web-view` 业务域名；API Base URL 需要加入 request 合法域名。

## 打开方式

1. 启动 Web 后端：在项目根目录运行 `pnpm dev`。
2. 打开微信开发者工具。
3. 导入项目，目录选择 `miniprogram/`。
4. AppID 可先使用测试号或游客模式。

## 迁移边界

默认 H5 嵌入会直接复用 `src/hooks/useGameLogic.ts`、React 组件、样式和现有 API。原生兜底版本已经具备可玩的移动端交互和后端 AI 调用，但还没有接入微信登录、支付、语音播放和 Supabase 自定义角色远程同步；这些需要后续补微信侧授权和服务端账户绑定。
