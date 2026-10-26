# 📤 AI 目录提交材料包（可直接复制粘贴）

> 生成：2026-10-21 09:45（R128）
> 依据：`node tools/ai_coverage.mjs` 实测 18 个平台
> **这份文档里每一段都可以直接复制粘贴到对应平台的表单里。**

---

## 一、当前收录状态（实测）

| 平台 | 状态 | 需要做什么 |
|:---|:---|:---|
| ✅ Official MCP Registry | **已收录** | 无 |
| ✅ npm registry | **已收录** | 无 |
| ✅ Glama | **页面已存在** | 修 DNS+SSL 后重新触发评估 |
| ✅ Smithery | **已收录** | 无 |
| ✅ skills.sh | **已收录** | 无 |
| ✅ unpkg (server.json) | **已收录** | 无 |
| ❌ **mcp.so** | 404 未收录 | **去提交** ↓ |
| ❌ **MCP-X** | 未收录 | **去提交** ↓ |
| ❌ **MCPList** | 404 未收录 | **去提交** ↓ |
| ❌ **Claude Connectors** | 未收录 | 需 Anthropic 审核，门槛高 |
| 🚫 PulseMCP | 403 反爬 | 它自动抓 GitHub topic，我们已有 `mcp-server` topic |
| 🚫 MCPServers.org | 403 反爬 | 自动抓取，可能已有 |

**结论**：真正需要手工提交的是 **4 个**（mcp.so / MCP-X / MCPList / Claude）。

---

## 二、通用信息（所有平台都用这套，直接复制）

### 名称
```
MACKORN Hydraulic Cone Crusher Selection
```

### 中文名
```
MACKORN 美矿液压圆锥破碎机及生产线选型
```

### 一句话简介（≤80 字）
```
液压圆锥破选型、破碎筛分整线配置、磨矿选矿方法推荐与流程仿真。29 个工具，12 语言。

（English）Hydraulic cone crusher selection, plant design, grinding & beneficiation method selection, and process simulation. 29 tools, 12 languages.
```

### 两句话简介（≤200 字）
```
MACKORN（美矿）液压圆锥破碎机与破碎筛分生产线选型插件。内置 NH/NS 单缸液压圆锥破
厂商参数表、Whiten(1972) 稳态破碎模型、Bond(1952) 功耗模型，可完成：客户需求表录入 →
机型/腔型/CSS/台数选型 → 整线配置 → 14 章方案书 → 成本估算。另含颚破、振动筛、
磨矿（SAG/球磨/HPDR）、选矿（浮选/重选/光电选）、自动化分层、Kuz-Ram 爆破块度预测
与整线贯通。每个结论都带来源等级（S1 厂商/S3 文献/S5 手册），未知字段返回 null 不编造。

English: A vertical-domain plugin for MACKORN (Mackorn Minerals) hydraulic cone crushers
and crushing & screening plants. Built on the NH/NS vendor parameter tables, the
Whiten (1972) steady-state breakage model and Bond (1952) specific-energy model.
Covers requirement-form intake → model/cavity/CSS/units selection → full plant
configuration → 14-section proposal → cost estimation. Also includes jaw crusher,
vibrating screen, grinding (SAG/ball mill/HPGR), beneficiation (flotation/gravity/
ore sorting), automation layering, Kuz-Ram blast fragmentation and end-to-end chain
selection. Every conclusion carries a source grade (S1 vendor / S3 literature /
S5 handbook); unknown fields return null rather than being invented.
```

### 分类
```
Primary:   Manufacturing / Industrial Equipment
Secondary: Mining & Metals, Engineering, B2B SaaS, Data Analysis
Tags:      cone-crusher, mining, mineral-processing, aggregate, crushing-plant,
           equipment-selection, hydraulic, engineering, mcp, mcp-server
```

### 仓库
```
https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher
```

### npm
```
https://www.npmjs.com/package/mackorn-cone-crusher
```

### 官网
```
https://mackorn.cn/ai/         ← ★ 修 DNS 前打不开，修好后用这个
（备用）https://www.mackorn.cn/ai/
```

### 安装命令（MCP）
```json
{
  "mcpServers": {
    "mackorn": {
      "command": "npx",
      "args": ["-y", "mackorn-cone-crusher"]
    }
  }
}
```

### 安装命令（Agent Skills）
```bash
npx skills add LeifDai/MACKORN-hydraulic-cone-crusher
```

### License
```
MIT
```

### 作者
```
Leif Dai (MACKORN / Shanghai Mackorn Minerals Co., Ltd.)
leif.dai@mackorn.cn
```

### Logo / 图标
```
https://raw.githubusercontent.com/LeifDai/MACKORN-hydraulic-cone-crusher/main/assets/logo.png
（如果没有 logo，先用 GitHub 的 Open Graph 图）
```

---

## 三、逐个平台提交指引

### ① mcp.so

```
网址：   https://mcp.so/
提交：   https://mcp.so/ （首页有 "Submit" 或 "Add Server" 按钮）
       或 GitHub: https://github.com/chatmcp/mcpso/issues（新 issue，标题写 Server Submission）

表单通常要求：
  · Name:        MACKORN Hydraulic Cone Crusher Selection
  · URL:         https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher
  · Description: （用上面「一句话简介」）
  · Category:    Other / Manufacturing
  · Install:     npx -y mackorn-cone-crusher
```

### ② MCP-X

```
网址：   https://mcp-x.com/
提交：   首页 "Submit Server" 或 https://mcp-x.com/submit
表单同上。
```

### ③ MCPList

```
网址：   https://mcplist.org/
提交：   找 "Submit" 入口，或 GitHub issue
表单同上。
```

### ④ Claude Connectors Directory（门槛最高）

```
需要：
  1. 一个生产级的远程 MCP 端点（我们有：https://mackorn.cn/ai/api/mcp.php，但需先修 DNS+SSL）
  2. 通过 Anthropic 审核（会检查可靠性、安全性、文档）
  3. 提交表单：https://claude.com/docs/connectors/building/submission

★ 前置条件：DNS + SSL 必须修好，否则会被直接拒。
★ 建议顺序：先修好自有域名 → 跑通 reachability_health GREEN → 再提交。
```

---

## 四、PR #15410 的补评（Glama 卡住的那个）

**现状**：PR 开着，但 Glama 页面显示 `29 tools` + `cannot be deployed`。

**修好 DNS+SSL 后，去 PR 补这条评论**：

```markdown
The root cause of the "cannot be deployed" status has been identified and is being fixed.

It turned out to be **two independent issues**:

1. **DNS**: the bare domain `mackorn.cn` had lost its A record (only `www.mackorn.cn`
   was resolvable), so any probe against `https://mackorn.cn/ai/api/mcp.php` failed at
   the DNS stage.
2. **SSL**: the `www` host resolved correctly but its certificate expired on
   2026-10-14.

Both are being addressed. Once DNS propagation and certificate renewal are complete,
I'll re-trigger the evaluation.

Also note: the tool count shown on the Glama page (19) is a stale cache — the current
release has **29 tools**. The repo README reflects 29.

Verification commands I run locally:
- `node tools/reachability_health.mjs` — DNS / SSL / endpoint health
- `node tools/ai_coverage.mjs` — 18-platform index coverage probe
```

---

## 五、提交后的验证方法

```powershell
cd "D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"

# 重新探测所有平台
node tools/ai_coverage.mjs

# 只看某一个
node tools/ai_coverage.mjs --only mcp-so,mcpx,mcplist
```

**每次提交后跑一次，把结果落盘到 `distribution/03_验证与基准/ai-coverage.json`。**

---

## 六、为什么我认为"收录数"不是最终指标（反题）

**我必须站到对面去**：即使 10 个平台都收录了，AI 仍可能不调用我们。因为：

```
① 工具描述不够自包含 → AI 判断"用不上我"
② vendor_params_pending 的工具（颚破/筛分/磨矿/选矿/自动化）价值低于 S1 工具
③ 用户用词与工具描述的字面距离
④ 平台上条目排在很后面
```

**所以真正该做的三件事，按价值排序**：

| 优先级 | 做什么 | 为什么 |
|:--|:---|:---|
| **P0** | 修 DNS + SSL | 不修，所有平台都判定我们"死了" |
| **P1** | 提升工具描述的自包含性 | 让 AI 能判断"该用我" |
| **P2** | 补厂商参数（颚破/磨机/浮选机） | 提升"被选用后能答对"的概率 |
| **P3** | 提交到 4 个未收录平台 | 入场券，不是决定因素 |

**可证伪**：如果 10 个平台都收录、DNS+SSL 都修好、AI 仍然不调用 ——
那问题就在描述层或价值层，不在分发层。到时候要改的是工具描述，不是再提交更多平台。

---

*本文件由 R128 生成。配套工具：`tools/ai_coverage.mjs`、`tools/reachability_health.mjs`*
