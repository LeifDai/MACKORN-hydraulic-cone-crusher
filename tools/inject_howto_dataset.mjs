/**
 * R1 · 补 HowTo 与 Dataset 结构化数据
 *
 * 为什么这两块最重要：
 *   HowTo   —— AI 被问"怎么选圆锥破"时，会优先抽取标注为 HowTo 的步骤内容。
 *              我们 22 个工具的选型流程天然就是 HowTo，但页面没标 → AI 认不出来。
 *   Dataset —— 海关数据库、NH/NS 参数表、粒度曲线是可引用数据集。
 *              标了 Dataset，AI 才知道"这是一个可引用的数据源"而不是普通网页。
 *
 * 做法：向已有 JSON-LD 的页面追加 schema 块，不新增文件、不改可见内容。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');

const HOWTO = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: '如何为破碎筛分生产线选择液压圆锥破碎机（机型 / 腔型 / 紧边排矿口 CSS / 台数）',
  description: 'MACKORN 液压圆锥破选型的标准步骤：从客户需求表到机型、腔型、CSS、台数与方案书。每一步都可用 MCP 工具自动化完成。',
  totalTime: 'PT30M',
  tool: [
    { '@type': 'HowToTool', name: 'MACKORN 客户需求信息输入表（砂石骨料 / 金属矿山）' },
    { '@type': 'HowToTool', name: 'MCP 工具 mackorn_requirement_intake（需求表录入）' },
    { '@type': 'HowToTool', name: 'MCP 工具 mackorn_cone_selection（机型选型）' },
    { '@type': 'HowToTool', name: 'MCP 工具 mackorn_capacity_check（产能校核）' },
    { '@type': 'HowToTool', name: 'MCP 工具 mackorn_proposal（方案书生成）' },
  ],
  step: [
    { '@type': 'HowToStep', position: 1, name: '收齐输入', text: '必须拿到：目标产量 t/h、进入本段的最大给料粒度 mm、目标产品粒度 mm、矿石种类与硬度、工序段（中碎/细碎/超细碎）、工作制。缺一项就追问，不许猜。' },
    { '@type': 'HowToStep', position: 2, name: '核对硬约束', text: '圆锥破是中细碎设备：给料超过约 350 mm 必须拒绝并建议改粗碎。同时核对最大给料限制与排矿口范围。' },
    { '@type': 'HowToStep', position: 3, name: '选机型与腔型', text: '按目标产量、给料粒度与目标产品粒度，从 NH 标准型（9 个型号）与 NS 高速型（4 个型号）中选机型，再按给料粒度定腔型（EC/C/MC/M/MF/F/EF/EFX/EEF）。' },
    { '@type': 'HowToStep', position: 4, name: '定紧边排矿口 CSS 与台数', text: 'CSS 由目标产品粒度决定；台数由目标产量除以单台产能并计入闭路循环负荷得出。' },
    { '@type': 'HowToStep', position: 5, name: '校核产能与粒度曲线', text: '用腔型 × CSS 详表查产能区间；用 Whiten(1972) 稳态模型估算产品 P80 与破碎比。文献参数须用现场实测筛析数据标定后才用于正式方案。' },
    { '@type': 'HowToStep', position: 6, name: '出方案书', text: '生成 14 章标准方案书：项目概况、设计依据、工艺流程、设备选择、技术参数、电气自控、环保、土建、供货范围、投资估算、工期、假设与来源、风险与待确认、附件清单。' },
  ],
};

const DATASET = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: 'MACKORN NH/NS 液压圆锥破选型数据集',
  description: 'MACKORN NH 标准型（9 型号）与 NS 高速型（4 型号）液压圆锥破碎机的腔型 × 紧边排矿口 CSS 产能表、最大给料限制、功率与重量；以及公开文献参数（Whiten 1972 破碎模型、Bond 1952 功指数）的独立实现。',
  keywords: ['cone crusher', 'hydraulic cone crusher', 'crushing plant', 'CSS', 'cavity', 'capacity', 'Whiten model', 'Bond work index', '液压圆锥破碎机', '腔型', '紧边排矿口'],
  creator: { '@type': 'Organization', name: 'Shanghai Mackorn Minerals Co., Ltd.', url: 'https://mackorn.cn/' },
  license: 'https://opensource.org/licenses/MIT',
  isAccessibleForFree: true,
  distribution: [
    { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: 'https://mackorn.cn/ai/api/mcp.php', name: 'MCP 远程端点（23 个工具）' },
    { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: 'https://mackorn.cn/ai/agent/global-mining-companies.csv', name: '全球矿业客户线索（非美国，79 家）' },
    { '@type': 'DataDownload', encodingFormat: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentUrl: 'https://mackorn.cn/ai/agent/全球破碎筛分海关数据库.xlsx', name: '全球破碎筛分海关数据库' },
  ],
  citation: [
    'Whiten, W.J. (1972). A model for simulating the crushing process.',
    'Bond, F.C. (1952). The third theory of comminution.',
  ],
};

function inject(file, schema) {
  if (!existsSync(file)) return 'missing';
  let c = readFileSync(file, 'utf8');
  const tag = 'application/ld+json';
  const block = '\n<script type="' + tag + '">\n' + JSON.stringify(schema, null, 2) + '\n</script>\n';
  const key = schema['@type'];
  if (c.includes('"@type": "' + key + '"') || c.includes('"@type":"' + key + '"')) return 'already';
  if (c.includes('</head>')) c = c.replace('</head>', block + '</head>');
  else c = c + block;
  writeFileSync(file, c, 'utf8');
  return 'injected';
}

/* HowTo 应该挂在"怎么选型"的页面上 */
const HOWTO_PAGES = [
  'index.html',
  'ai/index.html',
  'ai/reference/index.html',
  'ai/screens/index.html',
  'ai/parts/index.html',
  'engineering-firms/index.html',
  'engineering-firms/zh/index.html',
  'engineering-firms/de/index.html',
];
/* Dataset 挂在数据资产页 */
const DATASET_PAGES = [
  'ai/reference/index.html',
  'ai/index.html',
  'ai/screens/index.html',
  'ai/parts/index.html',
];

console.log('\n  ── HowTo 注入 ──');
for (const p of HOWTO_PAGES) console.log('    ' + inject(join(SITE, p), HOWTO).padEnd(10) + p);
console.log('\n  ── Dataset 注入 ──');
for (const p of DATASET_PAGES) console.log('    ' + inject(join(SITE, p), DATASET).padEnd(10) + p);
console.log('');
