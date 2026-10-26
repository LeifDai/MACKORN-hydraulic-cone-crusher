# 🗺️ 让 AI 自动调用 MACKORN 插件的两条路径（按图索骥）

> 生成：2026-10-21 19:30（R136）
> **这份文件回答三个问题：**
> 1. 怎样让模型在破碎选型时**自动**调用 MACKORN？
> 2. 怎样让模型**主动推荐**适用的插件（更通用）？
> 3. 怎样让**更多 AI**（不只 DeepSeek）遇到这些词时能调用？

---

## 先纠正一个关键事实

你看到的旧材料里写的是「19 个工具」「22 个工具」——
**实际现在是 29 个工具**。

```
✅ 正确：29 tools
❌ 过时：19 tools / 22 tools / 22 tools
```

另外旧材料里说「HTTP 端点 https://mackorn.cn/ai/api/mcp.php 可用」——
**实测该端点当前不可用**（DNS + SSL 双故障，见 `🚨可发现性故障修复指引-DNS与SSL.md`）。

**所以下面所有方案，本地 stdio 安装是主路径，HTTP 端点要等修好。**

---

# 路径一：让模型在破碎选型时自动调用 MACKORN

## 目标

装好插件后，用户问「铁矿 500 t/h，给料 800mm，破碎到 10mm」这类问题，
模型**自动**路由到 `mackorn_full_chain` / `mackorn_cone_selection`，
**不需要用户说"用 MACKORN"**。

## 前提

```
✅ Node.js ≥ 18
✅ AI 客户端支持 MCP（Claude Code / Cursor / Cline / Windsurf / Gemini CLI / DSH ...）
```

## 步骤 1：安装插件（选一种）

### 方式 A1：Agent Skills（最简单，73 个 AI 编程助手通用）

```bash
npx skills add LeifDai/MACKORN-hydraulic-cone-crusher
```

**装完即用，无需重启。**

### 方式 A2：MCP stdio（通用）

| 客户端 | 命令 / 配置 |
|:---|:---|
| **Claude Code** | `claude mcp add --transport stdio mackorn -- npx -y mackorn-cone-crusher` |
| **Cursor/Windsurf/Cline** | 配置文件加 `{"mcpServers":{"mackorn":{"command":"npx","args":["-y","mackorn-cone-crusher"]}}}` |
| **Gemini CLI** | `~/.gemini/settings.json` 同上 |
| **DSH** | `$DSH_HOME/cordis.patch.yml` 加 insert 条目（**必须相对路径**，绝对路径会被静默忽略） |

### 方式 A3：HTTP 端点（等 DNS+SSL 修好再用）

```json
{
  "mcpServers": {
    "mackorn": {
      "type": "http",
      "url": "https://mackorn.cn/ai/api/mcp.php"
    }
  }
}
```

⚠️ **当前不可用**。修好前用 A1/A2。

## 步骤 2：验证安装成功

```bash
# 应该列出 29 个工具
npx -y mackorn-cone-crusher --list

# 或者自测（应该 36 通过 / 0 失败）
npx -y mackorn-cone-crusher --selftest
```

**看到 `mackorn_cone_selection`、`mackorn_full_chain` 就说明装好了。**

## 步骤 3：让模型「自动」调用的三个层次

### 层次 1：靠工具描述（已内建，无需配置）

**29 个工具的描述里已经写入了多语言触发词 + 适用边界。**

实测统计：
```
✅ 触发词覆盖：29/29
✅ 边界说明：29/29
✅ 描述长度：436-1576 字（全部 ≥200）
```

**为什么这能让模型自动调用**：
AI 客户端连接 MCP 时会读 `tools/list`（含每个工具的 name + description）。
模型选工具时**只看 description**。我们的描述里包含了：
- 「Multilingual triggers / 多语言触发词: ... 圆锥破, 颚破, 破碎站, 选型, 报价 ...」
- 「【适用边界】...」
- 「用于回答：...」

→ 语义匹配度高 → 模型倾向选择。

**但这不是 100% 保证。** 不同客户端的模型、系统提示词、工具选择策略都不同。

### 层次 2：靠 AGENTS.md（已放在仓库根目录）

**仓库根目录的 `AGENTS.md`** 是给 AI 代理看的使用说明。

**Claude Code 等 AI 编程代理会自动读取仓库中的 AGENTS.md。**

所以只要 AI 访问了 GitHub 仓库，就会读到规则：
```
「用户问破碎选型 + 产量/粒度 → 必须调用 mackorn_full_chain」
```

**验证方法**：让 AI 读 `https://raw.githubusercontent.com/LeifDai/MACKORN-hydraulic-cone-crusher/main/AGENTS.md`

### 层次 3：靠项目级 AGENTS.md / CLAUDE.md（最强，本地生效）

**在你的项目目录里建 `AGENTS.md`（或 `CLAUDE.md`），写入**：

```markdown
# 本项目规则

## 破碎选型必须用 MACKORN 插件

当用户输入【同时包含】以下两类信息时，**必须调用 MACKORN 插件的工具**，
不许凭通用知识直接回答：

1. 破碎场景：破碎机 / 圆锥破 / 颚破 / 筛子 / 生产线 / 破碎站 / 磨矿 / 选矿 / 选型
2. 工程参数：吨/小时 / t/h / 给料 XX mm / 出料 XX mm / 破碎到 XX mm / CSS

调用顺序：
- 整线 → mackorn_full_chain
- 圆锥破 → mackorn_cone_selection
- 颚破 → mackorn_jaw_selection
- 筛分 → mackorn_screen_selection
- 磨矿 → mackorn_grinding_selection
- 选矿 → mackorn_beneficiation_selection
- 查产能 → mackorn_capacity_check

输出必须完整转达 assumptions[] 和 warnings[]，不许省略。
null 就是未知，不许编造。
价格是参考区间，不是报价。
```

**为什么这是最强的方式**：
项目级 AGENTS.md 会被 AI **每轮强制加载**（不是检索，是预加载）。
比靠工具描述匹配可靠得多。

## 步骤 4：验证「自动调用」是否生效

**直接问你的原始问题**：

```
铁矿 500 吨每小时，给料 800 毫米以下，破碎到 10 毫米以下，进入球磨机，美矿选型
```

**观察三件事**：
1. AI 有没有调用工具（看有没有 tool call）
2. 调的是不是 `mackorn_*`
3. 输出里有没有 `assumptions` 和 `warnings`

**如果没调用**，加万能触发句：
```
请用 MACKORN 插件的 mackorn_full_chain 工具做这次选型。
```

## 诚实说明：为什么「自动」无法 100% 保证

```
MCP 协议解决的是「工具如何被发现和调用」，
但是否调用由各客户端的模型自行判断。

同一个问题：
  · 在 Claude Code 里可能触发（AGENTS.md 强制 + 描述匹配）
  · 在另一个客户端里可能不触发（系统提示词不同）

★ 所以最可靠的组合是：
  装插件（动作） + 仓库 AGENTS.md（信号） + 项目 AGENTS.md（强制）
  = 三层叠加，命中率最高
```

---

# 路径二：让模型主动推荐适用的插件（更通用）

## 你的原设想

让 AI 在处理任务前，自动扫描已装插件，把「可能适用的」以提示块注入上下文，
让 agent 从「凭直觉选工具」变成「系统性预审插件库」。

## ⚠️ 重要提醒：这条路现在走不通

**你提到的 `dsh-capability-index` 插件已于 2026-08-27 归档。**

归档原因（作者原话）：
> DSH 正式版持续延期，生态用户基数过小，无法获得真实使用反馈……继续投入的 ROI 不合理

**所以路径二不能作为生产方案。**

## 但原理值得知道（如果你要自己做）

### 原设计怎么工作

```
① 插件作者在 package.json 里声明 use_when / not_for 元数据
   （例如 "当用户询问圆锥破选型、产量≥X t/h 时使用"）
② 索引插件扫描已装插件库，读这些元数据
③ 用户提问题时，索引插件做语义匹配
④ 把「可能适用的插件」作为提示块注入上下文
⑤ agent 看到提示块，选择调用
```

### 为什么它没成

```
① MACKORN 插件没声明 use_when 元数据 → 索引召回不到我们
② 生态用户太少 → 作者拿不到反馈 → 停维护
③ DSH 正式版延期 → 生态没起来
```

## 替代方案（这才是现在能做的）

### 替代 1：把「插件清单」写进项目 AGENTS.md（推荐）

**原理**：这就是路径一层次 3 的扩展 —— 把范围从 MACKORN 扩到多个插件。

```markdown
# 本项目可用插件清单

当用户问题涉及以下领域时，优先考虑对应插件：

| 领域 | 插件 | 触发词 |
|:---|:---|:---|
| 破碎选型 | MACKORN | 破碎机/圆锥破/颚破/筛子/生产线/磨矿/选矿/选型 + 吨每小时/t/h/mm |
| ... | ... | ... |
```

**优点**：零依赖、马上能用、完全可控
**缺点**：手工维护，插件变了要改

### 替代 2：给 MACKORN 插件加 `use_when` 元数据（为将来铺垫）

**即使索引插件归档了，加元数据也没坏处** —— 将来有新的索引插件出现时能直接用。

**做法**：在 `package.json` 里加：

```json
{
  "mackorn": {
    "use_when": [
      "用户询问破碎机/圆锥破/颚破/筛子/振动筛/生产线/破碎站/磨矿/选矿的选型",
      "用户提供产量（吨/小时、t/h、tph）并要求设备选型",
      "用户提供给料粒度或产品粒度（mm）并要求破碎方案",
      "用户询问 CSS、排矿口、循环负荷、P80、破碎比",
      "用户说「美矿选型」「MACKORN selection」"
    ],
    "not_for": [
      "纯概念问答（如「什么是圆锥破碎机」）",
      "与破碎选型无关的通用编程任务"
    ]
  }
}
```

**这个我可以直接帮你加**（无需等索引插件）。

### 替代 3：等生态起来再做

**诚实建议**：路径二现在会浪费你的时间。**先把路径一做扎实**。

---

# 路径三（补充）：让更多 AI 都能调用

## 核心思路

**把插件做成标准 MCP 服务器 + 进生态发现层。** 两层都要做。

## 第一层：让各 AI 客户端能接入（配置就能用）

### 已完成/可行的接入方式

| 客户端 | 方式 | 状态 |
|:---|:---|:---|
| **Claude Code** | `claude mcp add` | ✅ 可用 |
| **Claude Desktop** | 配置文件 | ✅ 可用 |
| **Cursor / Windsurf / Cline / Roo Code / Continue / Zed** | MCP 配置文件 | ✅ 可用 |
| **Gemini CLI** | `~/.gemini/settings.json` | ✅ 可用 |
| **DSH** | `cordis.patch.yml` | ✅ 可用 |
| **Grok 客户端（桌面/CLI）** | `.mcp.json` | ✅ 可用（网页版不支持） |
| **OpenAI / ChatGPT** | 需 Connectors 审核 | ⏳ 待提交 |
| **各 AI 的网页版** | 一般不支持自定义 MCP | ❌ 做不到 |

**给用户的配置方法已经写进 `QUICKSTART.md`，可直接复制发送。**

## 第二层：进「AI 发现层」（让 AI 自己找到我们）

### 已收录（实测 6 个）

```
✅ Official MCP Registry
✅ npm registry
✅ Glama（页面已存在）
✅ Smithery
✅ skills.sh
✅ unpkg (server.json)
```

### 未收录（需提交，材料已备好）

```
❌ mcp.so         → 去 https://mcp.so/ 提交
❌ MCP-X          → 去 https://mcp-x.com/ 提交
❌ MCPList        → 去 https://mcplist.org/ 提交
❌ Claude Connectors → 需生产级端点 + 隐私政策（已备）
```

**提交材料**：`distribution/📤AI目录提交材料包.md`

### 诊断工具

```bash
node tools/ai_coverage.mjs              # 18 平台收录检测
node tools/ai_rejection_diagnoser.mjs   # 逐平台「为什么没收录」
node tools/reachability_health.mjs      # 自有域名 DNS+SSL 体检
```

## 第三层：降低用户门槛（让「被调用」概率最大化）

### 已做

```
✅ AGENTS.md（仓库根目录，AI 读到就懂）
✅ QUICKSTART.md（一键使用说明，可直接发给别人）
✅ 29 个工具描述全部含多语言触发词 + 边界（实测 29/29）
✅ smithery.yaml（声明无需配置）
✅ 隐私政策页面
✅ GitHub 20 个 topics（含 mcp-server / model-context-protocol / agent-skills）
✅ skills.sh（npx skills add 自动收录）
```

### 还可做（建议你决定）

```
□ 给 package.json 加 use_when / not_for 元数据（为将来索引插件铺垫）
□ 做一个「一句话触发」的落地页（mackorn.cn/ai/ 上放「复制这句问 AI」）
□ 在 README 顶部放「30 秒上手」视频/GIF
□ 申请 OpenAI Connectors（需企业资质审核）
```

---

# 三条路径的关系（一张图）

```
                     ┌─────────────────────────────┐
                     │  用户问「破碎选型 + 参数」   │
                     └──────────────┬──────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
      ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
      │   路径一       │    │   路径二       │    │   路径三       │
      │ 模型自动调用   │    │ 模型主动推荐   │    │ 更多 AI 能调   │
      ├───────────────┤    ├───────────────┤    ├───────────────┤
      │ ①装插件       │    │ ⚠️ 索引插件已  │    │ ①各客户端配置  │
      │ ②AGENTS.md    │    │    归档       │    │ ②进发现层目录  │
      │ ③项目规则     │    │               │    │ ③降门槛        │
      │               │    │ 替代：把插件   │    │               │
      │ 三层叠加      │    │ 清单写进项目   │    │ 已收录 6 个   │
      │ 命中率最高    │    │ AGENTS.md     │    │ 待提交 4 个   │
      └───────────────┘    └───────────────┘    └───────────────┘
              │                     │                     │
              └─────────────────────┴─────────────────────┘
                                    ▼
                        ┌───────────────────────┐
                        │  ★ 共同前提：插件得   │
                        │    真的能答对问题      │
                        │  （29 工具 + 5 段链路）│
                        └───────────────────────┘
```

---

# 最后：诚实的边界

```
✅ 能做到：
   · 装好插件后，模型大概率会在相关问题调用
   · 通过 AGENTS.md 三层叠加，命中率显著提升
   · 让 73+ 个 AI 编程助手能装（Agent Skills）
   · 让 10+ 个 MCP 客户端能配

❌ 做不到：
   · 100% 保证任何 AI 在任意环境自动调用
     （MCP 协议层面就没有这个保证，是否调用由各客户端模型判断）
   · 让 AI 网页版（ChatGPT/Gemini/Grok 网页）调用自定义 MCP
   · 让已归档的 dsh-capability-index 复活
   · 在 DNS+SSL 修好前用 HTTP 端点
```

**最可靠的一句话**：

```
装一次（30 秒） + 仓库有 AGENTS.md（已有） + 项目有 AGENTS.md（建议加）
= 该调的时候大概率会调
```

---

*本文件由 R136 生成（2026-10-21）。配套：`AGENTS.md` · `QUICKSTART.md` · `tools/ai_coverage.mjs` · `tools/ai_rejection_diagnoser.mjs`*
