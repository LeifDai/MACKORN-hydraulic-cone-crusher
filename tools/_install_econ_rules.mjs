#!/usr/bin/env node
/**
 * 把「经济路由规则」挂进 MACKORN-DSH-Plugin/AGENTS.md
 * 目的：让每次会话自动加载这条规则，不用人提醒。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const P = join(ROOT, 'AGENTS.md');

if (!existsSync(P)) { console.log('❌ 找不到 AGENTS.md'); process.exit(1); }
let s = readFileSync(P, 'utf8');

const MARK = '<!-- ECON-ROUTER-V0011 -->';
if (s.includes(MARK)) { console.log('— 已存在，跳过'); process.exit(0); }

const SEC = `
${MARK}

## 💰 经济路由（V001.1 · 用户 2026-10-26 22:28 明令 · 不可协商）

> **用户原话**：「遵照经济性原则，用 DeepSeek harness 作为总指挥，用 codex 编程，
> 用免费模型作为普通能做的工作，用本地微模型处理单据合同、支付合同、法律文件等
> 内部资料；提升效率的同时，提升经济性，请编程完善 econ-router V001.1.mjs。」

**工具**：\`tools/econ-router.mjs\`　**完整规则**：\`docs/经济路由规则.md\`

### 六通道（按「数据敏感度 × 难度」分）

| 级别 | 通道 | 什么时候用 | 成本 |
|---|---|---|---|
| **T3a 绝密** | **本地 Ollama** \`qwen2.5:1.5b\` | 合同/支付/报价/法务/客户名单/图纸/BOM/投标 | 零 · **不出网** |
| **T3b 内部** | **本地 Ollama** | 人事/工资/简历/预算/报销 | 零 · **不出网** |
| **T2 判断** | DeepSeek（我） | 选型/评估/取舍/风险/策略 | 收费 |
| **T1 编程** | Codex CLI | 写/改/修代码、报错、重构 | 订阅制 |
| **T0 机械** | 免费云（智谱 GLM-4-Flash）→ **本地兜底** | 整理/抽取/翻译/分类/摘要 | 免费 |
| **T0 纯算** | 纯脚本 | 统计/计数/去重/排序 | 零 |

### 三条铁律

1. **T3a/T3b 绝不降级到云端。** 本地不可用就**报错**，不偷偷发给免费云。
   少办一件活的代价 << 泄密一次的代价。
2. **本地模型不可用时不许静默降级。** 必须明确告诉用户「敏感内容不出网，请启动 Ollama 或我自己处理」。
3. **T0 可以兜底到本地**（因为本地也免费）。

### 关键判据（每次派活前先问）

```
这件事需要「判断力/责任」，还是只需要「执行力」？
  需要判断 → 我做（T2）
  只需要执行 → 派出去（T0/T1）
  涉及合同/钱/客户/图纸 → 只准本地（T3a）
```

### 命令

\`\`\`bash
node tools/econ-router.mjs --status              # 六通道状态（含 Ollama 实探）
node tools/econ-router.mjs --selftest            # 逐通道自测
node tools/econ-router.mjs --route "任务"         # ★ 自动判级 + 自动派
node tools/econ-router.mjs --local "解读这份合同"  # ★ 敏感内容走本地
node tools/econ-router.mjs --report              # 经济账（含省钱估算）
\`\`\`

### ⚠ 能力边界（别用错，实测）

| 通道 | 能干什么 | **不能干什么** |
|---|---|---|
| Local Ollama (1.5B) | 抽取要点、分类、改写、短句翻译 | **判断/选型/技术计算** —— 实测会自相矛盾 |
| 免费云 GLM-4-Flash | 机械活、中等中文 | 深度推理、长上下文 |
| Codex | 写代码/重构/修 bug | 业务判断、决策 |
| DeepSeek（我） | 判断、选型、决策、验收 | —— |

> **实测案例**：问 1.5B「铁矿石/花岗岩/铜精矿归类到骨料或金属矿」，
> 它答「花岗岩属于岩石…所以将其归类为金属矿」—— **自相矛盾**。
> ⇒ **1.5B 只配做机械活，不配做任何需要一致推理的活。**

`;

// 插在第一个二级标题之前，紧跟文件头
const idx = s.indexOf('\n## ');
if (idx < 0) {
  s = s.trimEnd() + '\n' + SEC;
} else {
  s = s.slice(0, idx) + '\n' + SEC + s.slice(idx);
}
writeFileSync(P, s, 'utf8');
console.log('✅ 已把经济路由规则插入 AGENTS.md 头部');
console.log('  文件现在 ' + s.length + ' 字符');
