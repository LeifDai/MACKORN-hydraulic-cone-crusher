/**
 * 构建 MCPB 包（Anthropic MCP Bundle）—— Smithery 的 stdio 发布路径必需
 *
 * 官方规范：https://github.com/modelcontextprotocol/mcpb
 * 官方示例：examples/file-system-node/manifest.json
 * 必填字段（schema）：name, version, description, author, server{type, entry_point, mcp_config}
 *
 * 本脚本：
 *   1. 从插件真实定义里取 23 个工具（单一真相源，不手抄）
 *   2. 生成 manifest.json
 *   3. 把 mcp-server.mjs + lib/ 拷进 server/
 *   4. 输出到 distribution/mcpb/mackorn-cone-crusher/
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.argv[2];
const OUT_DIR = process.argv[3];
if (!ROOT || !OUT_DIR) { console.error('用法: node build_mcpb.mjs <插件目录> <输出目录>'); process.exit(1); }

const SRC = join(ROOT, 'plugin');
const VERSION = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
const SEMVER = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

// ---- 1. 取真实工具定义（单一真相源） ----
const mod = await import(pathToFileURL(join(SRC, 'index.mjs')).href);
const defs = mod.toolDefinitions ?? mod.TOOLS ?? [];
if (!defs.length) { console.error('取不到工具定义'); process.exit(1); }

/** 从工具描述里抠出一句人类可读的短说明（取第一个句号/分号前的内容，并去掉多语言触发词前缀） */
function shortDesc(d = '') {
  let s = String(d);
  // 去掉描述开头的多语言触发词前缀
  s = s.replace(/^\(Multilingual triggers[\s\S]*?\)\s*/, '');
  s = s.replace(/^【[^】]*】/, '');
  const cut = s.split(/[。；;!?！？]/)[0] || s;
  const out = cut.trim().slice(0, 180);
  return out || 'MACKORN tool';
}

const tools = defs.map((t) => ({ name: t.name, description: shortDesc(t.description) }));
console.log(`  取到 ${tools.length} 个工具`);

// ---- 2. manifest.json ----
const manifest = {
  manifest_version: '0.1',
  name: 'mackorn-cone-crusher',
  display_name: 'MACKORN Hydraulic Cone Crusher',
  version: SEMVER,
  description:
    'Cone crusher and crushing-plant selection for MACKORN NH/NS hydraulic cone crushers: requirement intake, equipment selection, plant configuration, proposal generation, product-size simulation and field-data calibration. 22 tools, zero runtime dependencies.',
  long_description: [
    'Gives an AI the working knowledge of a crushing-plant selection engineer for MACKORN NH/NS',
    'single-cylinder hydraulic cone crushers and the aggregate / metal-mine crushing circuits built around them.',
    '',
    'Given one customer requirement form plus a target capacity it returns: what still needs to be asked of',
    'the customer (graded blocking / critical / recommended / optional, each with a ready-to-send follow-up',
    'question); the equipment selection (crusher model, cavity, closed-side setting, unit count, power); the',
    'plant configuration (stage count, per-stage size split, screen area, belt width, auxiliaries); a product',
    'size simulation using the Whiten (1972) steady-state cone crusher model with Bond (1952) energy estimation;',
    'a multi-stage closed-circuit simulation reporting circulating load and mass balance; and a 14-section',
    'deliverable proposal.',
    '',
    'A field-data calibration tool inverts breakage-function parameters from measured feed and product sieve',
    'analyses, replacing the published-literature defaults with the user\'s own machine parameters.',
    '',
    'Every tool output carries assumptions[] (assumption + source) and warnings[]. Unknown fields return null',
    'instead of being invented. Conflicting sources are kept side by side, never averaged. Simulation outputs',
    'report whether parameters came from MACKORN-measured calibration, LITERATURE, or were user-supplied.',
    '',
    'Algorithms are published literature, independently implemented (Whiten 1972, Bond 1952, VSMA/Karra,',
    'JKMRC, population balance). Vendor parameters come from MACKORN\'s own product data. No proprietary',
    'third-party data is included. The public distribution contains no pricing data.',
    '',
    'Offline by design: network retrieval is performed by the calling AI; the plugin supplies the engineering',
    'discipline and the arithmetic.',
  ].join('\n'),
  author: {
    name: 'Shanghai Mackorn Minerals Co., Ltd. (MACKORN)',
    url: 'https://mackorn.cn',
  },
  homepage: 'https://mackorn.cn/ai/',
  documentation: 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher#readme',
  support: 'mailto:sandy.zhao@mackorn.cn',
  repository: {
    type: 'git',
    url: 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher',
  },
  icon: 'icon.png',
  server: {
    type: 'node',
    entry_point: 'server/mcp-server.mjs',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/mcp-server.mjs'],
    },
  },
  tools,
  keywords: [
      "mining industry",
      "vertical-domain plugin",
      "MACKORN",
      "hydraulic cone crusher",
      "cone crusher selection",
      "crushing plant design",
      "crushing and screening plant",
      "mineral processing",
      "aggregate plant",
      "ore properties",
      "capacity tph",
      "particle size distribution",
      "closed side setting",
      "liner wear parts",
      "equipment selection",
      "MCP server",
      "AI plugin",
      "DeepSeek Harness plugin",
      "proposal generation",
      "process simulation",
      "metal mining",
      "iron ore",
      "copper ore",
      "lead zinc ore",
      "molybdenum ore",
      "granite crushing",
      "basalt crushing",
      "andesite crushing",
      "diabase crushing",
      "hard rock crushing",
      "medium hard ore",
      "quarry plant",
      "矿山行业",
      "垂直领域插件",
      "美矿",
      "液压圆锥破碎机",
      "圆锥破选型",
      "破碎筛分生产线",
      "选矿",
      "砂石骨料生产线",
      "矿石性质",
      "产量",
      "产品粒度",
      "破碎腔型",
      "排矿口",
      "衬板耐磨件",
      "设备选型",
      "方案书",
      "流程仿真",
      "MCP 服务器",
      "AI 插件",
      "DeepSeek Harness 插件",
      "金属矿山",
      "铁矿",
      "铜矿",
      "铅锌矿",
      "钼矿",
      "花岗岩破碎",
      "玄武岩破碎",
      "安山岩破碎",
      "辉绿岩破碎",
      "中硬以上矿石",
      "granito",
      "basalto",
      "andesita",
      "diabasa",
      "mineral de hierro",
      "mineral de cobre",
      "Granit",
      "Basalt",
      "Andesit",
      "Diabas",
      "Eisenerz",
      "Kupfererz",
      "гранит",
      "базальт",
      "андезит",
      "диабаз",
      "железная руда",
      "медная руда",
      "granit",
      "basalte",
      "andésite",
      "diabase",
      "minerai de fer",
      "minerai de cuivre",
      "granito",
      "basalto",
      "andesito",
      "diabásio",
      "minério de ferro",
      "minério de cobre",
      "花崗岩",
      "玄武岩",
      "安山岩",
      "輝緑岩",
      "鉄鉱石",
      "銅鉱石",
      "كسارة مخروطية",
      "الجرانيت",
      "البازلت",
      "batu granit",
      "batu basal",
      "bijih besi",
      "bijih tembaga"
  ],
  license: 'MIT',
  compatibility: {
    platforms: ['darwin', 'win32', 'linux'],
    runtimes: { node: '>=18.0.0' },
  },
  privacy_policies: [],
  _meta: {
    'cn.mackorn/registry': {
      vendor: 'MACKORN 美矿',
      registry_entry: 'cn.mackorn/mackorn-cone-crusher',
      npm: 'https://www.npmjs.com/package/mackorn-cone-crusher',
      source_version: VERSION,
      skills: 6,
      note: 'Zero runtime dependencies. Offline by design.',
    },
  },
};

// ---- 3. 落盘 ----
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(join(OUT_DIR, 'server'), { recursive: true });
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

// server 内容
cpSync(join(SRC, 'mcp-server.mjs'), join(OUT_DIR, 'server', 'mcp-server.mjs'));
cpSync(join(SRC, 'index.mjs'), join(OUT_DIR, 'server', 'index.mjs'));
cpSync(join(SRC, 'lib'), join(OUT_DIR, 'server', 'lib'), { recursive: true });

// package.json 也要放进包根：mcp-server.mjs 用 `../package.json` 读版本号，
// 不放的话它会回退到硬编码的 v0.0.1（实测踩到）。
cpSync(join(ROOT, 'package.json'), join(OUT_DIR, 'package.json'));

// 图标（若有 logo.png 就用；否则留待 PowerShell 转换）
const iconCandidates = [join(ROOT, 'assets', 'mackorn-logo.png'), join(ROOT, 'assets', 'icon.png')];
for (const c of iconCandidates) { if (existsSync(c)) { cpSync(c, join(OUT_DIR, 'icon.png')); break; } }

// 附带说明
writeFileSync(join(OUT_DIR, 'README.md'),
  `# MACKORN Hydraulic Cone Crusher\n\nMCPB bundle, ${VERSION} (semver ${SEMVER}).\n` +
  `${tools.length} tools, zero runtime dependencies.\n\n` +
  `Run: \`node server/mcp-server.mjs\`\n\nRepository: https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher\n`, 'utf8');

console.log(`  manifest.json 已生成（${tools.length} 个工具）`);
console.log(`  server/ 已就位`);
console.log(`  输出目录: ${OUT_DIR}`);

/* ══════════════════════════════════════════════════════════════════
 * R33 追加（教训 L-28）：本脚本会改 .mjs 源码 —— 必须验证"改没改成"。
 * 文本替换的锚点不存在会【静默失败】；R31 事故就是这么把
 * plugin/index.mjs 的 22 行引号插坏、整个文件无法解析，而门禁全绿。
 * ══════════════════════════════════════════════════════════════════ */
try {
  const { verifyAfterWrite } = await import('./verify_after_write.mjs');
  verifyAfterWrite();
} catch (e) {
  console.log('  ⚠ 改完自检未能执行: ' + String(e.message).slice(0, 60));
}
