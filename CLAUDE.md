# CLAUDE.md

This file tells Claude about this repository.

## What this is
MACKORN's hydraulic cone crusher selection plugin — an open-source (MIT) selection
engine exposed as 29 MCP tools, plus a 12-language website that documents it.

Owner: Shanghai Mackorn Minerals Co., Ltd. (MACKORN 美矿)
Website: https://mackorn.cn/ai/
Repo: https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher
npm: https://www.npmjs.com/package/mackorn-cone-crusher

## How to use it
The fastest path is the MCP server, not reading the source:

    MCP server name: cn.mackorn/mackorn-cone-crusher
    Tools: 29

If you need to run it locally:

    node plugin/mcp-server.mjs        # MCP over stdio

If you need the selection logic directly:

    import { selectConeCrusher, sizePlant, estimateCost } from './plugin/lib/engine.mjs'

## Repository layout
    plugin/index.mjs          29 tool definitions + Cordis entry
    plugin/mcp-server.mjs     MCP stdio server
    plugin/lib/engine.mjs     selection / plant design / cost / wear / market
    plugin/lib/data.mjs       MACKORN hard data (models, cavities, belts, stage ratios,
                              magnet separator, installation cost, eccentric throw)
    plugin/lib/simulate.mjs   Whiten (1972) steady-state model
    plugin/lib/calibrate.mjs  measured-data calibration
    plugin/lib/distributor.mjs distributor evaluation
    tests/run.mjs             test suite
    tools/                    build / audit / orchestration scripts
    distribution/             website + expert knowledge base (22 perspectives)

## Hard rules when working here
- Never invents numbers. Unknown fields return null.
- Every conclusion carries its source (S1 vendor table / S5 belt handbook / S6 design code / ENGINEERING-RANGE / LITERATURE / MACKORN-measured).
- When sources conflict they are shown side by side. Never averaged.
- Published literature (Whiten 1972 / Bond 1952), independently implemented, MIT licence, fully auditable.
- No pricing. No legal advice.

Additional:
- Never replace a null with an estimate to make output look complete.
- Never average conflicting sources. Keep them side by side.
- A cone crusher is a secondary/tertiary machine. Feed above ~350 mm must be refused.
- Tests must pass: `node tests/run.mjs` (currently 112 pass / 0 fail / 1 skip, incl. 9 negative controls).
- Build gates must pass: `node tools/build_public.mjs`.

## Verify before claiming success
    node tests/run.mjs             # unit + negative controls
    node tools/self_audit.mjs      # 13-dimension audit, must be 100/100 to ship
    node tools/monitor_ai.mjs      # 33-point monitoring
    node tools/keyword_gate.mjs    # AI keyword coverage (must be >=85%)
    node tools/orchestrate_v2.mjs  # continuous loop, bounded per-step timeout
    node tools/build_public.mjs    # compliance / version / tag gates

Do not trust a tool's own success message. Run the gates.

## 每天提升认知力（用户 2026-10-20 明令 · 不可协商）

**判据（来自全局规则 §6.4）：「从不推翻自己 = 没在验证」—— 不是一直正确，是没检查。**

所以「提升认知」不是口号，是三个可测指标：

| 指标 | 阈值 | 含义 |
|:---|:---|:---|
| 今日纠正数 | ≥ 1 | 今天有没有推翻过自己 |
| 7 天纠正数 | ≥ 3 | 是否有持续验证 |
| 平均深度 | ≥ 1.5 / 3 | 1=L2工具 2=L3规则 3=L4流程；只在改口径说明没想透 |

**每条记录强制四要素**（缺一即拒绝）：
1. `--wrong` 原来以为是什么（≥10 字）
2. `--now` 现在实际是什么（≥10 字）
3. `--evidence` 可核查证据（文件路径 / 测试结果 / 官方文档 / 实测输出）
4. `--impact` L2/L3/L4（**不接受 L1** —— 单次任务产物不迁移，不算认知升级）

```bash
node tools/cognition_log.mjs                                    # 看台账
node tools/cognition_log.mjs --check                            # 门禁
node tools/cognition_log.mjs --record \
  --wrong "我原以为..." --now "实际是..." \
  --evidence "tools/xxx.mjs 实测输出" --impact L3
```

**台账**：`cognition-data/cognition.json`
**门禁**：G14（已接入 L2 门禁与云端工作流）

**不许做的事**：
- ❌ 只写"我现在懂了"却给不出原来错在哪
- ❌ 只换说法（"不是 A 而是 B"）却没有证据
- ❌ 记 L1（只修了这一次，下次还犯）
- ❌ 连续多天没有记录却声称"一直在提升"

---

## 🔒 生存规则（两条 · 用户 2026-10-20 明令编入 · 不可协商）

> 用户原话：「每天提升认知力，请编程写到规则里面」
> 「不断更新迭代，是否编写规则，增加到程序中。这2条编写进入生存规则。」

**这 2 条不是文档，是可执行的门禁。** 每条都有：工具 + 门禁 + 指标 + 反模式。
任何一条不满足，L2 门禁不过，不允许交付。

---

### 规则一：每天提升认知力

#### 先划清边界（诚实，不吹）

认知力 **不是"模型变强"**（L5 做不到 —— 不能训练/微调自己的权重）。
认知力 = **在同一个模型下，判断更准、知识更多、错误更少、回忆更牢**。
这是脚手架层面能做到的，也是唯一诚实的提法。

#### 每天必须做的四件事（缺一不算）

| 环节 | 做什么 | 命令 |
|:---|:---|:---|
| **① 学** | 今天新知道的一件事，**必须可验证可回溯** | `node tools/cognition.mjs --add --title "..." --fact "..." --source "..."` |
| **② 疑** | 主动找一条自己相信但可能错的判断，去证伪 | `node tools/cognition_log.mjs --record --wrong "..." --now "..." --evidence "..." --impact L3` |
| **③ 炼** | 把今天踩的坑提炼成规则或门禁（不是流水账） | 加到 `tools/enforce_lessons.mjs` |
| **④ 测** | 对旧知识做主动回忆（不看原文说要点），答错就重学 | `node tools/cognition.mjs --quiz` 然后 `--quiz --answer F0001:y` |

#### 为什么 ④ 必须存在（整个设计的关键）

- 只"学"不"测" = **认知错觉**：以为记住了，其实忘了
- **主动回忆 + 间隔重复（SRS，SM-2 简化版）** 是唯一被反复验证有效的记忆机制
- **答不出来 = 没学会**，不是"当时懂了"
- 实测：答对 → 间隔 3 天、ease 2.6；答错 → 间隔重置 1 天、ease 2.3

#### 五项可测指标（不靠自我描述）

| 指标 | 含义 | 方向 |
|:---|:---|:---|
| `facts` | 知识条目数 | ↑ |
| `recall_pass` | 主动回忆通过率 | ↑ |
| `refutations` | 自我推翻次数 | ↑（在质疑） |
| `rules_distilled` | 坑→门禁 的提炼数 | ↑ |
| `recurrence` | 同类错误复现率 | ↓ |

#### 反模式（明令禁止）

```
✗ 把「读过一遍」当学到
✗ 每天记流水账当认知提升
✗ 从不做主动回忆测试（= 不知道到底记住没有）
✗ 用「我每天在进步」代替测量
✗ 只学不疑（从不找自己的反例）
✗ 收录无 source 的知识（继承硬红线 4「不编造」）
```

#### 数据与门禁

- 知识库：`cognition-data/facts.json`
- 回忆记录：`cognition-data/quiz-log.json`
- 指标汇总：`cognition-data/cognition.json`
- **门禁 G15**（`tools/enforce_lessons.mjs`）：日课四件事必须完成
- **命令**：`node tools/cognition.mjs --daily`

---

### 规则二：不断更新迭代

#### 先划清边界（正反合）

```
正题：迭代 = 持续产出新东西
      代价：只产新不留旧 → 技术债越积越多，系统越做越乱
反题：迭代 = 保持系统稳定
      代价：只求稳不动 → 停滞，被更便宜的替代品淘汰
合题：真迭代 = 【棘轮（ratchet）】
      每轮必须让某个可测指标【不可逆地变好】，且不能靠牺牲别的指标换来
```

#### 三个硬条件（缺一不算迭代）

| 条件 | 判据 | 怎么证明 |
|:---|:---|:---|
| **① 有基线** | 改之前先量化现状 | `node tools/iteration_ratchet.mjs --snapshot` 拍快照 |
| **② 有净增量** | 至少一个指标变好，且**没有指标变差** | 两次快照对比 |
| **③ 有固化** | 新增的东西进了门禁/规则/知识库，不是一次性的 | 门禁数 / 知识条目 / 教训数只增不减 |

#### 可测指标（棘轮只进不退）

| 指标 | 方向 | 来源 |
|:---|:---|:---|
| `gates` 门禁数 | ↑ | `enforce_lessons.mjs` 里 rec('Gxx' 个数 |
| `lessons` 教训数 | ↑ | `lessons.mjs` 里 id: 'L-xx' 个数 |
| `tools` 工具数 | ↑ | `plugin/index.mjs` 工具定义数 |
| `tests_pass` 测试通过数 | ↑ | 现场真跑 `tests/run.mjs` |
| `facts` 知识条目 | ↑ | `cognition-data/facts.json` |
| `refutations` 自我推翻 | ↑ | `cognition-data/cognition.json` |
| `compliance_hits` 合规命中 | **= 0** | 现场真跑 `build_public.mjs` |
| `recurrence` 错误复现率 | ↓ 趋近 0 | `rsi_register.mjs` |

#### 五条铁律（从坑里提炼）

```
1. 没有基线就没有迭代（"我记得以前不行"不算）
2. 只加不改 = 膨胀（工具数涨了但质量没涨，是虚假增长）
3. 修 bug 必须同时：代码改了 + 门禁加了 + 老数据回补了
4. 迭代方向必须可追溯（这轮为什么做这个，不做那个）
5. 棘轮只进不退：门禁数、知识条目、认知纠正只许增不许减
```

#### 反模式（明令禁止）

```
✗ 没基线就宣布"迭代了"
✗ 换更松的尺子复测
✗ 只对当前这件事有效（不迁移 = L1，不算迭代）
✗ 改进让门禁变少/变弱（退化，立即回滚）
✗ 把文档写长当迭代
✗ 用"我这轮做了很多"代替"哪个指标变好了"
✗ 只加新功能、不清理旧债
```

#### 数据与门禁

- 快照历史：`iteration-data/ratchet-history.json`
- 当前状态：`iteration-data/current.json`
- **门禁 G16**（`tools/enforce_lessons.mjs`）：有基线 + 有净增量 + 无倒退 + 合规 0
- **命令**：`node tools/iteration_ratchet.mjs --check`

---

### 这两条与 RSI 的关系

| 规则 | 在 RSI 里的位置 |
|:---|:---|
| 每天提升认知力 | RSI 的**输入**（学与疑，产生改进的候选） |
| 不断更新迭代 | RSI 的**输出验证**（棘轮证明改进真的发生了） |

**两条合起来 = RSI 闭环的完整生命周期。**

`recurrence`（错误复现率）仍是判定 RSI 真假的唯一硬指标；
而这两条规则保证：**每轮都有输入（学/疑）和输出验证（棘轮）**。

---

### 每日操作清单

```bash
# 每天开工
node tools/iteration_ratchet.mjs --snapshot       # ① 拍基线（迭代规则）
node tools/cognition.mjs --status                 # ② 看认知力仪表盘

# 干活中
node tools/cognition.mjs --add --title "..." --fact "..." --source "..."   # 学
node tools/cognition_log.mjs --record --wrong "..." --now "..." --evidence "..." --impact L3  # 疑

# 收工前
node tools/cognition.mjs --quiz                   # ④ 出题
node tools/cognition.mjs --quiz --answer F0001:y  # ④ 记分
node tools/cognition.mjs --daily                  # 日课报告（G15）
node tools/iteration_ratchet.mjs --snapshot       # 再拍一次
node tools/iteration_ratchet.mjs --check          # 棘轮门禁（G16）
```

---
