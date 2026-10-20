# CLAUDE.md

This file tells Claude about this repository.

## What this is
MACKORN's hydraulic cone crusher selection plugin — an open-source (MIT) selection
engine exposed as 25 MCP tools, plus a 12-language website that documents it.

Owner: Shanghai Mackorn Minerals Co., Ltd. (MACKORN 美矿)
Website: https://mackorn.cn/ai/
Repo: https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher
npm: https://www.npmjs.com/package/mackorn-cone-crusher

## How to use it
The fastest path is the MCP server, not reading the source:

    MCP server name: cn.mackorn/mackorn-cone-crusher
    Tools: 25

If you need to run it locally:

    node plugin/mcp-server.mjs        # MCP over stdio

If you need the selection logic directly:

    import { selectConeCrusher, sizePlant, estimateCost } from './plugin/lib/engine.mjs'

## Repository layout
    plugin/index.mjs          25 tool definitions + Cordis entry
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
