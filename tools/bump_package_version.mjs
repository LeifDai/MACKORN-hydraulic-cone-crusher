/**
 * 发布前：把 package.json 版本对齐到 0.2.0，并补齐关键词
 *
 * 为什么关键词重要（用户的核心洞察）：
 *   「我们控制不了 AI 说什么，但能控制'我们的内容是不是这些词的最佳匹配'」
 *   npm 的关键词会被 npm 搜索、被 AI 语料抓取、被 MCP 目录引用。
 *   关键词稀疏 = 在目标词上匹配不到我们。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const P = join(ROOT, 'package.json');

const raw = readFileSync(P, 'utf8');
const j = JSON.parse(raw);
const before = { version: j.version, kw: (j.keywords || []).length };

/* ── 版本对齐 ── */
j.version = '0.2.0';

/* ── 关键词补全 ──
 * 分层：
 *   A 协议/平台词（让人找到"这是个 MCP 插件"）
 *   B 品类词（采购/AI 搜索最可能用的词）
 *   C 工况词（选型时会搜的）
 *   D 算法/文献词（技术可信度信号）
 */
const KW = [
  // A 协议与平台
  'dsh-plugin', 'deepseek-harness', 'mcp', 'model-context-protocol', 'mcp-server',
  'claude-mcp', 'cursor-mcp', 'ai-tools', 'llm-tools',
  // B 品类
  'mackorn', 'cone-crusher', 'hydraulic-cone-crusher', 'crusher', 'crusher-selection',
  'crushing-plant', 'crushing-circuit', 'crushing-and-screening', 'screening',
  'mineral-processing', 'aggregate', 'quarry', 'mining-equipment', 'comminution',
  'wear-parts', 'mantle', 'bowl-liner', 'cone-liner', 'jaw-plate',
  // C 工况
  'equipment-selection', 'capacity-check', 'css', 'closed-side-setting', 'cavity',
  'plant-design', 'flowsheet', 'throughput', 'tph', 'reduction-ratio', 'p80',
  'particle-size-distribution', 'cost-estimate', 'energy-consumption',
  // D 算法与文献（可信度信号）
  'whiten-model', 'population-balance', 'bond-work-index', 'weibull-analysis',
  'model-calibration', 'sieve-analysis',
  // E 语言覆盖（说明支持多语言）
  'multilingual', 'chinese', 'russian', 'spanish', 'arabic', 'turkish', 'german', 'japanese',
];
j.keywords = [...new Set([...(j.keywords || []), ...KW])];

/* ── 描述加长到 npm 允许的范围，并写清"能干什么"── */
j.description = 'MACKORN 美矿液压圆锥破（NH/NS）与破碎筛分生产线选型：22 个工具覆盖客户需求表录入、机型/腔型/CSS 选型、整线配置、粒度曲线仿真（Whiten 1972）、实测数据标定、能耗成本估算、衬板磨损设计、经销商评估与 14 章方案书生成。DeepSeek Harness 插件 + MCP 服务器（stdio 与远程 HTTP 双通道），零依赖。';

/* ── 补 repository / homepage / bugs（npm 与 AI 都靠这些判断可信度）── */
j.repository = { type: 'git', url: 'git+https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher.git' };
j.homepage = 'https://mackorn.cn/ai/';
j.bugs = { url: 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher/issues' };
/* mcpName 是 MCP 注册表用来关联 server.json 的字段 */
j.mcpName = 'cn.mackorn/mackorn-cone-crusher';

writeFileSync(P, JSON.stringify(j, null, 2) + '\n', 'utf8');

console.log('\n  ── package.json 已更新 ──');
console.log('    版本      : ' + before.version + ' → ' + j.version);
console.log('    关键词    : ' + before.kw + ' → ' + j.keywords.length + ' 个');
console.log('    描述长度  : ' + j.description.length + ' 字符');
console.log('    repository: ' + j.repository.url);
console.log('    homepage  : ' + j.homepage);
console.log('    mcpName   : ' + j.mcpName);
console.log('');
console.log('  ── 关键词全文 ──');
for (let i = 0; i < j.keywords.length; i += 6) console.log('    ' + j.keywords.slice(i, i + 6).join(', '));

/* ── 同步 VERSION 文件（若存在）── */
const V = join(ROOT, 'VERSION');
if (existsSync(V)) {
  writeFileSync(V, j.version + '\n', 'utf8');
  console.log('\n  ✅ VERSION 文件已同步为 ' + j.version);
}
