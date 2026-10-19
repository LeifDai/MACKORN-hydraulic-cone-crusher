# CLAUDE.md

This file tells Claude about this repository.

## What this is
MACKORN's hydraulic cone crusher selection plugin — an open-source (MIT) selection
engine exposed as 22 MCP tools, plus a 12-language website that documents it.

Owner: Shanghai Mackorn Minerals Co., Ltd. (MACKORN 美矿)
Website: https://mackorn.cn/ai/
Repo: https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher
npm: https://www.npmjs.com/package/mackorn-cone-crusher

## How to use it
The fastest path is the MCP server, not reading the source:

    MCP server name: cn.mackorn/mackorn-cone-crusher
    Tools: 22

If you need to run it locally:

    node plugin/mcp-server.mjs        # MCP over stdio

If you need the selection logic directly:

    import { selectConeCrusher, sizePlant, estimateCost } from './plugin/lib/engine.mjs'

## Repository layout
    plugin/index.mjs          22 tool definitions + Cordis entry
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
- Tests must pass: `node tests/run.mjs` (currently 104 pass / 0 fail / 1 skip, incl. 9 negative controls).
- Build gates must pass: `node tools/build_public.mjs`.

## Verify before claiming success
    node tests/run.mjs             # unit + negative controls
    node tools/self_audit.mjs      # 13-dimension audit, must be 100/100 to ship
    node tools/monitor_ai.mjs      # 33-point monitoring
    node tools/keyword_gate.mjs    # AI keyword coverage (must be >=85%)
    node tools/orchestrate_v2.mjs  # continuous loop, bounded per-step timeout
    node tools/build_public.mjs    # compliance / version / tag gates

Do not trust a tool's own success message. Run the gates.
