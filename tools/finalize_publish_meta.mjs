/**
 * 发布前最终修整：
 *   ① public-overrides/server.json —— 补 remotes（关键）、22 tools、websiteUrl
 *   ② 两个 package.json —— 补 mcpName / keywords / repository / homepage / bugs
 *
 * 为什么 remotes 是关键：
 *   只有 packages(stdio) → AI 必须在本机装 Node 才能用我们
 *   加了 remotes(streamable-http) → 任何 MCP 客户端一个 URL 就能连
 *   官方 Registry 是所有 MCP 客户端的发现入口，这是"能被读"与"能被调用"的分界线。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const V = '0.2.0';

/* ══ ① server.json（公开覆盖版 + 发布器版，两份都要一致）══ */
const SERVER = {
  $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
  name: 'cn.mackorn/mackorn-cone-crusher',
  description: 'MACKORN hydraulic cone crusher selection and crushing-plant design. 22 tools, callable over HTTP.',
  title: 'MACKORN Hydraulic Cone Crusher Selection',
  version: V,
  websiteUrl: 'https://mackorn.cn/ai/',
  repository: { url: 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher', source: 'github' },
  remotes: [{ type: 'streamable-http', url: 'https://mackorn.cn/ai/api/mcp.php' }],
  packages: [{ registryType: 'npm', identifier: 'mackorn-cone-crusher', version: V, transport: { type: 'stdio' } }],
};
for (const rel of ['public-overrides/server.json', 'distribution/mcp-publisher/server.json', 'server.json']) {
  const p = join(ROOT, rel);
  try {
    readFileSync(p);
    writeFileSync(p, JSON.stringify(SERVER, null, 2) + '\n', 'utf8');
    console.log('  ✅ ' + rel + '（remotes ' + SERVER.remotes.length + ' 个 · ' + V + ' · 22 tools）');
  } catch { console.log('  ○ ' + rel + ' 不存在，跳过'); }
}

/* ══ ② package.json（根 + 公开覆盖版）══ */
const KW = [
  'dsh-plugin', 'deepseek-harness', 'mcp', 'model-context-protocol', 'mcp-server',
  'claude-mcp', 'cursor-mcp', 'ai-tools', 'llm-tools',
  'mackorn', 'cone-crusher', 'hydraulic-cone-crusher', 'crusher', 'crusher-selection',
  'crushing-plant', 'crushing-circuit', 'crushing-and-screening', 'screening',
  'mineral-processing', 'aggregate', 'quarry', 'mining-equipment', 'comminution',
  'wear-parts', 'mantle', 'bowl-liner', 'cone-liner', 'jaw-plate',
  'equipment-selection', 'capacity-check', 'css', 'closed-side-setting', 'cavity',
  'plant-design', 'flowsheet', 'throughput', 'tph', 'reduction-ratio', 'p80',
  'particle-size-distribution', 'cost-estimate', 'energy-consumption',
  'whiten-model', 'population-balance', 'bond-work-index', 'weibull-analysis',
  'model-calibration', 'sieve-analysis',
  'multilingual', 'chinese', 'russian', 'spanish', 'arabic', 'turkish', 'german', 'japanese',
];
const DESC = 'MACKORN 美矿液压圆锥破（NH/NS）与破碎筛分生产线选型：22 个工具覆盖客户需求表录入、机型/腔型/CSS 选型、整线配置、粒度曲线仿真（Whiten 1972）、实测数据标定、能耗成本估算、衬板磨损设计、经销商评估与 14 章方案书生成。DeepSeek Harness 插件 + MCP 服务器（stdio 与远程 HTTP 双通道），零依赖。';

for (const rel of ['package.json', 'public-overrides/package.json']) {
  const p = join(ROOT, rel);
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const before = { v: j.version, kw: (j.keywords || []).length, mcp: j.mcpName || '无' };
  j.version = V;
  j.license = 'MIT';
  j.mcpName = 'cn.mackorn/mackorn-cone-crusher';
  j.description = DESC;
  j.keywords = [...new Set([...(j.keywords || []), ...KW])];
  j.repository = { type: 'git', url: 'git+https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher.git' };
  j.homepage = 'https://mackorn.cn/ai/';
  j.bugs = { url: 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher/issues' };
  writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
  console.log('  ✅ ' + rel + '：v' + before.v + '→' + V + ' · 关键词 ' + before.kw + '→' + j.keywords.length + ' · mcpName ' + before.mcp + '→' + j.mcpName);
}

/* ══ ③ 校验 ══ */
console.log('\n  ── 校验 ──');
for (const rel of ['server.json', 'public-overrides/server.json', 'distribution/mcp-publisher/server.json']) {
  try {
    const j = JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
    console.log('    ' + rel.padEnd(42) + 'v' + j.version + ' · remotes=' + (j.remotes ? j.remotes.length : 0) + ' · desc=' + j.description.length + '字符');
  } catch { }
}
for (const rel of ['package.json', 'public-overrides/package.json']) {
  const j = JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
  console.log('    ' + rel.padEnd(42) + 'v' + j.version + ' · license=' + j.license + ' · kw=' + j.keywords.length + ' · mcpName=' + j.mcpName);
}
