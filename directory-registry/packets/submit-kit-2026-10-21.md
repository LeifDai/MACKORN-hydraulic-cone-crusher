# 📤 AI 目录提交材料包（自动生成）

> 生成时间：2026-10-21T10:46:28.319Z
> 生成工具：`node tools/directory_uploader.mjs --submit-kit`
> **下面每一段都可以直接复制粘贴到对应平台的表单里。**

---

## 通用信息（所有平台都用这套）

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

Hydraulic cone crusher selection, plant design, grinding & beneficiation method selection, and process simulation. 29 tools, 12 languages.
```
### 详细简介
```
MACKORN（美矿）液压圆锥破碎机与破碎筛分生产线选型插件。内置 NH/NS 单缸液压圆锥破厂商参数表、Whiten(1972) 稳态破碎模型、Bond(1952) 功耗模型。覆盖：客户需求表录入 → 机型/腔型/CSS/台数选型 → 整线配置 → 14 章方案书 → 成本估算；另含颚破、振动筛、磨矿（SAG/球磨/HPGR）、选矿（浮选/重选/光电选）、自动化分层、Kuz-Ram 爆破块度预测与整线贯通。每个结论都带来源等级（S1 厂商/S3 文献/S5 手册），未知字段返回 null 不编造。
```
### 英文详细简介
```
A vertical-domain plugin for MACKORN hydraulic cone crushers and crushing & screening plants. Built on NH/NS vendor parameter tables, the Whiten (1972) steady-state breakage model and Bond (1952) specific-energy model. Covers requirement-form intake → model/cavity/CSS/units selection → full plant configuration → 14-section proposal → cost estimation. Also includes jaw crusher, vibrating screen, grinding (SAG/ball mill/HPGR), beneficiation (flotation/gravity/ore sorting), automation layering, Kuz-Ram blast fragmentation and end-to-end chain selection. Every conclusion carries a source grade; unknown fields return null rather than being invented.
```
### 分类
```
Manufacturing / Industrial Equipment; Mining & Metals; Engineering; B2B
```
### Tags
```
cone-crusher, mining, mineral-processing, aggregate, crushing-plant, equipment-selection, hydraulic, engineering, mcp, mcp-server
```
### 链接
```
仓库：https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher
npm：  https://www.npmjs.com/package/mackorn-cone-crusher
MCP：  cn.mackorn/mackorn-cone-crusher
官网：  https://mackorn.cn/ai/   （⚠️ DNS/SSL 修复中，暂用 www）
License: MIT
作者：  leif.dai@mackorn.cn
```
### 安装（MCP）
```json
{
  "mcpServers": {
    "mackorn": {
      "command": "npx",
      "args": [
        "-y",
        "mackorn-cone-crusher"
      ]
    }
  }
}
```
### 安装（Agent Skills）
```bash
npx skills add LeifDai/MACKORN-hydraulic-cone-crusher
```
### 验证
```bash
npx -y mackorn-cone-crusher --list      # 应列出 29 个工具
npx -y mackorn-cone-crusher --selftest  # 应 36 通过 / 0 失败
```

---

## 逐平台提交指引（4 个）

### Claude Connectors Directory

```
提交方式：https://claude.com/docs/connectors/building/submission 表单
平台地址：https://claude.com/docs/connectors/building/submission
⚠️ 前置阻塞：DNS：裸域 mackorn.cn 无 A 记录
   → 阻塞未解之前提交会被拒，先修阻塞
```

> 门槛最高，需 Anthropic 人工审核。前置条件：生产级端点 + 隐私政策

### mcp.so

```
提交方式：https://mcp.so/ 提交表单 或 GitHub issue
平台地址：https://mcp.so/
```

> 中文友好的 MCP 目录。材料见 distribution/📤AI目录提交材料包.md

### MCP-X

```
提交方式：https://mcp-x.com/ 提交
平台地址：https://mcp-x.com/
```

### MCPList

```
提交方式：https://mcplist.org/ 提交
平台地址：https://mcplist.org/
```

---

## 提交后怎么验证

```bash
node tools/directory_checker.mjs --check --only <平台id>
node tools/directory_checker.mjs
```
