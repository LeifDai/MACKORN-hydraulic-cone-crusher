# 变更记录

## 0.2.2（2026-10-18）

- 修正 0.2.1 被 npm staged publishing 卡住的问题（E409)，同内容重发

## 0.2.1（2026-10-18）

**修正**

- 工具数描述 21 → **22**（同步 npm 与仓库实际）
- `package.json` 的 `bin` 增加包名别名：`npx mackorn-cone-crusher` 现在可用
  （此前只注册了 `mackorn-mcp`，npm 只在 bin 名 = 包名时才自动映射）

**新增**

- `Dockerfile` —— 让 Glama / 容器环境能构建并启动 MCP 服务器（stdio，零依赖）
- `skills.sh.json` —— Agent Skills 页面分组配置
- 6 个 Agent Skills 全部符合 agentskills.io 规范 →
  `npx skills add LeifDai/MACKORN-hydraulic-cone-crusher` 可装进 73 种 AI 助手

**不变**

- 零运行时依赖（`dependencies` 为空）
- 22 个工具的能力与输出口径完全兼容 0.2.0
- 不发布价格、不做法律意见

## 0.2.0（2026-10-08）

- 首个公开发布版：22 个工具 · 6 个技能 · 12 语言官网
- DeepSeek Harness 插件 + MCP 服务器 + Node ES Module 三合一
