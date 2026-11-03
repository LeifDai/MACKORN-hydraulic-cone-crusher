# 🎯 MACKORN 插件收录诱导手册（Playbook）

> **建立 2026-11-03 00:20 · 依据：真实自检数据，不是推测**
> 配套引擎：`tools/listing_engine.mjs`（检查）· `tools/daily_selfcheck.mjs`（归因+经验）
> 铁律：本文件每一条都来自 `listing-data/latest.json` 的真实 `conditions[]`，不许写「我觉得应该」

---

## 一、当前真实状态（2026-11-02 15:51 UTC 快照）

```
已收录 5 · 就绪 3 · 缺条件 1

✅ npm registry                 硬3/3 验1/1
✅ Official MCP Registry        硬4/4 验1/1
✅ skills.sh                    硬2/2 软1/1 验1/1
✅ Glama                        硬3/3 验1/1
✅ Claude Desktop/Cursor/Cline  硬1/1 软1/1 验1/1

🟡 Smithery                     硬2/2 软1/1 验0/1  ← 页面 HTTP 404
🟡 扣子 Coze                    硬2/2 验0/0        ← API 已通，等人工导入
🟡 Dify                        硬2/2 验0/0        ← API 已通，等人工导入

❌ punkpeye/awesome-mcp-servers  硬0/1 软1/1      ← 缺 Glama 评分
```

---

## 二、收录机制分类（决定用哪种诱导）

| 类型 | 平台 | 机制 | 诱导方式 | 等待时间 |
|:---|:---|:---|:---|:---|
| **自动抓取** | Smithery / Glama / skills.sh | 爬 npm/GitHub | 满足条件后**等** | 12-48h |
| **提交审核** | Official MCP Registry | 提交 server.json | 提 PR | 1-7 天 |
| **人工导入** | 扣子 Coze / Dify / 百炼 | 手动导 OpenAPI | **自己动手** | 5 分钟 |
| **PR 合并** | awesome-mcp-servers | GitHub PR | 提 PR + 附评分 | 1-14 天 |
| **配置即用** | Claude Desktop / Cursor / Cline | 用户填配置 | 不用收录，写 README | 0 |
| **源头** | npm registry | `npm publish` | 发布 | 立即 |

**关键洞察**：
```
「自动抓取型」→ 你能做的只有「把条件补齐」，剩下是等。
「人工导入型」→ 不用等，5 分钟就能连上，但必须你亲手做。
「PR 合并型」→ 有前置条件（Glama 评分），链条最长。
```

---

## 三、逐个平台的诱导动作（按 ROI 排序）

### 🥇 扣子 Coze —— 最高 ROI（5 分钟，覆盖中国最大 Agent 平台）

**前置条件（已满足）**：
```
✅ openapi.json 存在（ai-pack/openapi.json，6 个工具）
✅ REST 执行层在线（https://mackorn.cn/ai/api/ai_execute.php → HTTP 200）
```

**动作**：
```
1. 登录 https://www.coze.cn
2. 左侧「插件」→「+ 创建自定义插件」
3. 名称：MACKORN 圆锥破选型
   描述：查询 MACKORN 液压圆锥破碎机型号、产能、选型推荐
4. 选「通过 OpenAPI/Swagger 文档创建」
5. 粘贴 ai-pack/openapi.json 全文（10.8KB）
6. 鉴权：选「不需要鉴权」（我们接口是公开的）
7. 保存 → 自动解析出 6 个工具
8. 创建 Bot，加这 6 个工具，写 System Prompt
```

**⚠️ 三个坑**：
```
① OpenAPI 必须是 3.0.0（3.1 导入失败）—— 我们的已经锁死 3.0.0
② operationId 必须 camelCase —— 我们的已经是
③ 如果要求填 auth，说明 spec 没写 "security": []，需要补
```

**验证**：在 Bot 里问「我需要一小时 500 吨的圆锥破，推荐哪个型号？」，看它是否调 `mackornRecommend` 并返回 NH400/NS400。

---

### 🥈 Dify —— 第二高 ROI（3 分钟，开源 Agent 平台，全球用户）

**前置条件（已满足）**：
```
✅ openapi.json 的 response 字段是 string（Dify 硬要求）
✅ REST 执行层返回 {"response":"<JSON字符串>"}
```

**动作**：
```
1. 登录 Dify（cloud.dify.ai 或自建）
2. 工具 → 自定义工具 → 创建
3. Schema 来源选「导入 OpenAPI」
4. 粘贴 ai-pack/openapi.json
5. 鉴权方式：None
6. 在 Agent 或工作流里添加这些工具
```

**⚠️ 一个坑**：
```
Dify 要求返回值是 JSON **字符串**，不是 object。
我们的 spec 里 response 声明为 type:string，ai_execute.php 也真的返回字符串。
如果改成 object，Dify 会报 invalid response format。
```

---

### 🥉 Smithery —— 只差线上页面（可能已在抓取，或需主动提交）

**当前状态**：
```
硬条件 2/2 全过（keywords 含 mcp + mcp-server，smithery.yaml 存在）
验 0/1：https://smithery.ai/server/@mackorn/mackorn-cone-crusher → HTTP 404
```

**判断**：
```
Smithery 是自动抓取 npm 的。我们 npm 包已发布 v0.2.2，keywords 有 mcp。
但页面 404 说明它还没抓，或者抓了但 URL 格式不同。
```

**动作（按顺序试）**：
```
1. 先去 https://smithery.ai 搜「mackorn」
   · 如果有结果 → 只是 URL 格式不同，改 listing_engine 里的探测 URL
   · 如果没结果 → 继续第 2 步

2. 去 https://smithery.ai/docs/build/publish 看最新提交方式
   （可能是 CLI: npx @smithery/cli publish 或网页提交）

3. 提交时提供：
   · npm 包名：mackorn-cone-crusher
   · 启动命令：npx -y mackorn-cone-crusher
   · 或远程端点：https://mackorn.cn/ai/api/mcp.php

4. 提交后等 24-48h，重跑 listing_engine 看是否变绿
```

**⚠️ 别做**：
```
❌ 反复提交（会进审核队列，反而更慢）
❌ 猜 URL 格式去「模拟采集」（采不到就是采不到，不等于没收录）
```

---

### 🏅 punkpeye/awesome-mcp-servers —— 链条最长（需 Glama 评分）

**当前状态**：
```
硬 0/1：缺「Glama 有评分」（PR 合并前置条件）
软 1/1：README 信息够
detail：页面可访问（需人工看是否有评分）
```

**关键**：`detail` 说「页面可访问」，但条件判 false。
说明**我们的检查逻辑太严**（要求有评分，但只能看到页面）。

**动作（两步）**：
```
第一步：人工确认 Glama 是否已有评分
  打开 https://glama.ai/mcp/servers/LeifDai/MACKORN-hydraulic-cone-crusher
  · 有评分（如 A/B/C）→ 截图保存
  · 无评分 → 去 Glama 后台做 containerized release
    （Glama 需要 Dockerfile 能跑起来才给评分，我们的 Dockerfile 已有）

第二步：提 PR
  · 仓库：https://github.com/punkpeye/awesome-mcp-servers
  · 位置：README.md 的对应分类（可能是 🚀 Browser Automation 或 🗄️ Databases 附近的矿业类）
  · 格式（照现有条目的格式）：
    - [mackorn-cone-crusher](https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher) - Hydraulic cone crusher selection: 29 tools for model selection, capacity check, plant design, simulation. (Glama score: X)
  · PR 描述里附：Glama 评分页面链接 + npm 链接
```

**⚠️ 常见失败原因**：
```
❌ PR 缺 Glama 评分链接 → 被 close
❌ 条目格式不对（缩进/符号）→ CI 挂
❌ 分类选错 → 维护者让你改
```

---

### ✅ 已收录的 5 个——不需要动作，但要监控

| 平台 | 收录方式 | 监控什么 |
|:---|:---|:---|
| npm registry | `npm publish` | 版本是否一致（本地 vs npm） |
| Official MCP Registry | 提交 server.json | 是否能搜到（API 可能变） |
| skills.sh | 自动抓 skills/ | SKILL.md frontmatter 是否合规 |
| Glama | 容器化 release | 页面是否 200 |
| Claude/Cursor/Cline | 用户填配置 | README 的 npx 示例是否有效 |

---

## 四、⚠️ 已知的「假收录」与「假失败」

### 假失败 1：`--quick` 模式

```
node tools/listing_engine.mjs --quick
→ 所有 verify 类检查跳过，返回假失败
→ detail 里是 "quick" / "查询失败"

❌ 后果：会把「其实已收录」的平台当成未收录
✅ 对策：daily_selfcheck 已识别并标为「⊘ quick 模式下的假失败（不算缺口）」
```

### 假失败 2：本机网络拦截（TLS）

```
现象：ERR_TLS_CERT_ALTNAME_INVALID / 页面打不开
原因：不是平台问题，是本机网络中间人（代理/防火墙）
判据：≥3 个不同域名同一错误 ⇒ 先怀疑网络，不是平台挂了
✅ 对策：换网络环境重测，或改用 API 而非页面探测
```

### 假收录 1：把「文件在」当「被收录」

```
❌ 「我们有 server.json」≠「Official MCP Registry 收录了」
✅ 必须打线上 API 确认：registry.modelcontextprotocol.io/v0/servers?search=mackorn
```

---

## 五、PDCA 循环（每日）

```
Plan   ← 昨天遗留的缺口 + 今天该做什么（daily_selfcheck 生成）
Do     ← 执行动作（传文件 / 导平台 / 提 PR）
Check  ← 重跑 listing_engine（真实探测）
Act    ← 若变绿 → 记经验；若仍红 → 分析是否「条件理解错」

周而复始：每天跑一次，经验库自动积累。
```

**一条命令跑完**：
```powershell
node tools\daily_selfcheck.mjs --refresh
```

**看历史**：
```powershell
node tools\daily_selfcheck.mjs --history
```

---

## 六、经验库（自动积累，不手写）

**位置**：`experience-data/listing-experience.json`

**结构**（全部由真实数据生成，无硬编码）：
```json
{
  "success_patterns": [
    {
      "platform": "Glama",
      "proven_conditions": ["根目录有 Dockerfile", "根目录有 .dockerignore", "根目录有 glama.json", "Glama 页面能访问"]
    }
  ],
  "gap_analyses": [
    {
      "platform": "扣子 Coze",
      "missing_conditions": [],
      "migration": [],
      "action": "..."
    }
  ],
  "snapshots": [ /* 每天一条，看趋势 */ ]
}
```

**关键**：
```
success_patterns = 「为什么成功」的真证据（通过了哪些条件）
gap_analyses     = 「为什么失败」的真原因（缺了哪些条件）
snapshots        = 时间序列，看收录数是涨还是跌
```

---

## 七、诱导收录的通用公式

```
收录 = f(条件满足度, 平台抓取周期, 人工动作)

自动抓取型：收录 = 条件全满足 + 等（你只能控制前半部分）
人工导入型：收录 = 你动手（不用等，但要亲手做）
PR 型：     收录 = 前置条件满足 + PR 被合并（链条最长，最慢）

⇒ 先做「人工导入型」（ROI 最高，5 分钟见效）
⇒ 再做「PR 型」（有前置条件，链条长）
⇒ 自动抓取型只能「把条件补齐然后等」
```

---

## 八、明早行动清单（按 ROI）

```
① 让 IT 传最新 _data.php（修 Q6，1 分钟）→ verify_ai_pack --live 期望 8/8
② 去 Coze 导入 openapi.json（5 分钟）→ 覆盖中国最大 Agent 平台
③ 去 Dify 导入 openapi.json（3 分钟）→ 覆盖开源 Agent 平台
④ 去 Smithery 搜「mackorn」，有就改 URL，没就按 docs 提交
⑤ 确认 Glama 评分 → 有就提 awesome-mcp PR
⑥ 跑 node tools\daily_selfcheck.mjs --refresh 记录今天
```

---

*本手册由 R206 生成（2026-11-03 00:20）· 数据源：listing-data/latest.json 真实快照*
