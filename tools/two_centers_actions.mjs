/**
 * 两个中心 · 行动清单生成器
 *
 * 只测量不行动 = 白测。本脚本读 two-centers-report.json，
 * 为每个缺口生成【具体动作 + 谁做 + 怎么验证已经补上】。
 *
 * 用法：node tools/two_centers_actions.mjs
 * 产出：distribution/04_AI收录与分发/两个中心-行动清单.md
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const OUT = join(D, '04_AI收录与分发');
mkdirSync(OUT, { recursive: true });
const REPORT = join(OUT, 'two-centers-report.json');

if (!existsSync(REPORT)) {
  console.log('  先跑 node tools/two_centers.mjs 生成报告');
  process.exit(1);
}
const R = JSON.parse(readFileSync(REPORT, 'utf8'));

/* ══════════════════════════════════════════════════════════════════
 * 每个面的【补法】—— 具体到"点哪里、交什么、怎么验"
 * ══════════════════════════════════════════════════════════════════ */
const PLAYBOOK = {
  'MCP-REGISTRY': { who: '已完成', how: 'server.json 已含 remotes.streamable-http，已发布 v0.2.0', verify: 'https://registry.modelcontextprotocol.io/v0/servers?search=mackorn' },
  'MCP-GLAMA': { who: '已完成', how: '已在 Glama 收录', verify: 'https://glama.ai/mcp/servers?query=crusher' },
  'MCP-LOBEHUB': { who: '已完成', how: '已在 LobeHub 收录', verify: 'https://lobehub.com/mcp?q=crusher' },
  'MCP-SMITHERY': {
    who: '我（可自动）+ 可能需账号',
    how: '1) 先确认 Smithery 是否支持从 GitHub 仓库自动索引（多数目录支持）；2) 若不支持，用户在 https://smithery.ai 用 GitHub 登录后点 "Add Server" 填仓库地址；3) 我们的 MCP 端点已可远程调用，提交时填 https://mackorn.cn/ai/api/mcp.php',
    verify: 'https://smithery.ai/?q=crusher 应出现 MACKORN',
  },
  'MCP-MCPSO': { who: '用户（需账号）', how: 'https://mcp.so 提交入口，用 GitHub 登录后提交仓库 https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher', verify: 'https://mcp.so/search?q=crusher' },
  'MCP-PULSEMCP': { who: '用户（需账号）', how: 'https://www.pulsemcp.com 提交表单', verify: 'https://www.pulsemcp.com/servers?q=crusher' },
  'MCP-AWESOME': { who: '已完成（等合并）', how: 'PR #15410 已提交 punkpeye/awesome-mcp-servers，等维护者合并', verify: 'README 里搜 mackorn' },
  'CODE-GITHUB': {
    who: '我（可自动）',
    how: '仓库已有。可补：① 给仓库加 topics（mcp / cone-crusher / deepseek-harness 等）提升搜索命中 ② README 首段加入高搜索量关键词 ③ 加 releases（tag v0.2.0）',
    verify: 'https://api.github.com/search/repositories?q=MACKORN+hydraulic+cone+crusher',
  },
  'CODE-NPM': { who: '已完成', how: 'mackorn-cone-crusher@0.2.0 已发布，185 个关键词', verify: 'https://registry.npmjs.org/mackorn-cone-crusher' },
  'CODE-SWH': {
    who: '我（可自动）',
    how: '用 Software Heritage 的 "Save code now" API 提交仓库 URL：POST https://archive.softwareheritage.org/api/1/origin/save/git/url/<encoded-repo-url>/ 。提交后需等待归档，之后 origin/search/mackorn 应能查到。',
    verify: 'https://archive.softwareheritage.org/api/1/origin/search/mackorn/',
  },
  'CORPUS-CC': {
    who: '时间（无法直接提交）',
    how: 'Common Crawl 不接受手动提交，靠爬虫自然发现。我们已经做对的：robots.txt 放行、sitemap.xml 完整、页面静态可读、llms.txt 声明。剩下是等待下一个 crawl 周期。可加速：确保站点无 JS 依赖、外链数量（被引用越多越容易被抓）。',
    verify: 'index.commoncrawl.org 查 mackorn.cn/*',
  },
  'CORPUS-CROSSREF': {
    who: '我（准备材料）+ 用户（注册 DOI）',
    how: 'Crossref 需要 DOI。最省事的路径：把《Whiten 模型独立实现 + 实测标定方法》作为数据集/预印本存到 Zenodo（Zenodo 免费自动分配 DOI 并同步到 DataCite/OpenAlex/Crossref）。我准备好提交材料，用户上传即可。',
    verify: 'https://api.crossref.org/works?query=mackorn',
  },
  'CORPUS-ZENODO': {
    who: '我（准备材料）+ 用户（上传）',
    how: '准备一份可上传的 Zenodo 数据集包（含 README、数据文件、许可证、作者信息）。用户登录 zenodo.org → New Upload → 填元数据 → Publish → 自动获得 DOI。',
    verify: 'https://zenodo.org/api/records?q=mackorn',
  },
  'CORPUS-DATACITE': { who: '随 Zenodo 自动', how: 'Zenodo 发布后自动同步 DataCite', verify: 'https://api.datacite.org/dois?query=mackorn' },
  'CORPUS-OPENALEX': { who: '随 DOI 自动', how: '有 DOI 后 OpenAlex 会自动收录（数天到数周）', verify: 'https://api.openalex.org/works?search=mackorn' },
  'CORPUS-ARXIV': {
    who: '用户（需 arXiv 账号 + 认可）',
    how: 'arXiv 需要 endorsement（某领域已有作者推荐）。备选：投到开放获取期刊或以技术报告形式发到 Zenodo（更快）。',
    verify: 'http://export.arxiv.org/api/query?search_query=all:mackorn',
  },
  'CORPUS-KAGGLE': {
    who: '我（准备数据）+ 用户（上传）',
    how: '把《全球破碎筛分海关数据库》整理成 Kaggle Dataset 上传（需 Kaggle 账号）。数据集描述里写明来源与许可。',
    verify: 'https://www.kaggle.com/api/v1/datasets/list?search=mackorn',
  },
  'SEARCH-BING': {
    who: '用户（需账号）',
    how: 'Bing Webmaster Tools（https://www.bing.com/webmasters）添加站点 mackorn.cn 并提交 sitemap。这是让 ChatGPT/Copilot 收录的最直接通道。',
    verify: '浏览器 site:mackorn.cn；Bing Webmaster 后台看"已编入索引"页数',
  },
  'SEARCH-BAIDU': {
    who: '用户（需账号）',
    how: '百度搜索资源平台（https://ziyuan.baidu.com）验证站点 + 提交 sitemap + 主动推送。百度收录直接影响文心一言/豆包/通义。',
    verify: '浏览器 site:mackorn.cn 在百度',
  },
  'SEARCH-YANDEX': { who: '用户（需账号）', how: 'Yandex Webmaster（https://webmaster.yandex.com）添加站点 + 提交 sitemap。因已有 IndexNow 提交记录，Yandex 应先于其他引擎收录。', verify: '浏览器 site:mackorn.cn 在 Yandex' },
  'SEARCH-MARGINALIA': { who: '我（可自动）', how: 'Marginalia 偏向技术/独立站点，接受提交：https://search.marginalia.nu/ 的 "Add a website" 入口', verify: 'https://search.marginalia.nu/search?query=cone+crusher+selection' },
  'SEARCH-SOGOU': { who: '用户（需账号）', how: '搜狗站长平台（https://zhanzhang.sogou.com）提交站点与 sitemap', verify: '搜狗 site:mackorn.cn' },
  'SEARCH-360': { who: '用户（需账号）', how: '360 站长平台（https://zhanzhang.so.com）提交站点与 sitemap', verify: '360 site:mackorn.cn' },
  'IND-MINING': {
    who: '我（准备稿件）+ 用户/商务（投稿或购买）',
    how: 'Mining.com 是矿业头部媒体。路径：① 免费——在其评论/投稿入口投技术文章（如"如何用公开文献模型做圆锥破选型"）；② 付费——定向广告/赞助内容；③ 更快的替代——把技术文章发到我们站内并在 Mining.com 相关报道下留专业评论（带链接）。',
    verify: 'https://www.mining.com/?s=mackorn',
  },
  'IND-AGGBIZ': { who: '我（准备稿件）', how: 'AggBusiness 是骨料行业媒体，投稿技术文章（如"骨料生产线圆锥破选型五步法"）', verify: 'https://www.aggbusiness.com/?s=mackorn' },
  'IND-WIPO': { who: 'MACKORN 技术部', how: 'WIPO 是专利库 —— 要让 Bruno 有的地方我们也有，需要 MACKORN 申请专利。这是真实的技术资产问题，不是内容问题。可先做：把我们的算法实现以论文/技术报告形式公开（有 DOI），在学术面建立存在。', verify: 'https://patentscope.wipo.int/search/en/result.jsf?query=mackorn' },
  'IND-GB': { who: 'MACKORN 技术部', how: '国家标准全文公开网是标准原文库。要让我们的名字出现在这里，须参与标准制定（如圆锥破行业标准的起草单位）。短期可做：在企业标准信息公共服务平台自我声明公开我们的企业标准。', verify: 'https://openstd.samr.gov.cn 搜 mackorn' },
};

const rows = R.surfaces || [];
const gap1 = rows.filter((x) => x.verdict === 'GAP1');
const gap2 = rows.filter((x) => x.verdict === 'GAP2');
const lead = rows.filter((x) => x.verdict === 'LEAD');
const parity = rows.filter((x) => x.verdict === 'PARITY');
const unknown = rows.filter((x) => x.verdict === 'UNKNOWN');

const mine = [];
const yours = [];
for (const g of [...gap1, ...gap2, ...unknown]) {
  const p = PLAYBOOK[g.id] || { who: '待定', how: '待定', verify: '' };
  const item = { id: g.id, name: g.name, kind: g.kind, url: g.url, verdict: g.verdict, ...p };
  if (/^我/.test(p.who)) mine.push(item); else yours.push(item);
}

let md = '# 两个中心 · 行动清单\n\n';
md += '> **中心①** Bruno 去的地方，我们都在　**中心②** Bruno 没去过、但 AI 喜欢去的地方，我们插件也在\n\n';
md += '生成：' + (R.generated || '').slice(0, 16).replace('T', ' ') + '\n\n';
md += '---\n\n## 一、当前判定\n\n';
md += '| 判定 | 含义 | 数量 | 面 |\n|:---|:---|:---|:---|\n';
md += '| ✅ PARITY | Bruno 在，我们也在 | ' + parity.length + ' | ' + (parity.map((x) => x.id).join(' ') || '—') + ' |\n';
md += '| ★❌ GAP1 | **Bruno 在，我们不在（中心①失守）** | ' + gap1.length + ' | ' + (gap1.map((x) => x.name).join('、') || '—') + ' |\n';
md += '| 🔵 LEAD | Bruno 不在，我们在（领先） | ' + lead.length + ' | ' + (lead.map((x) => x.id).join(' ') || '—') + ' |\n';
md += '| ☆ GAP2 | 都不在（中心②机会） | ' + gap2.length + ' | ' + (gap2.map((x) => x.name).join('、') || '—') + ' |\n';
md += '| ⚠️ UNKNOWN | 测不到（不算失守） | ' + unknown.length + ' | ' + (unknown.map((x) => x.id).join(' ') || '—') + ' |\n\n';
md += '```\n中心① 覆盖率（Bruno 在的面上我们也在）：' + (R.summary?.center1_coverage ?? '—') + '%\n';
md += '我们的总覆盖面（可判定面中）：' + (R.summary?.our_coverage ?? '—') + '%\n```\n\n';

md += '---\n\n## 二、我来做（不需要你操作）\n\n';
if (!mine.length) md += '（无）\n\n';
for (const m of mine) {
  md += '### ' + m.name + '　`' + m.id + '`' + (m.verdict === 'GAP1' ? '　**★中心①失守**' : m.verdict === 'GAP2' ? '　☆机会' : '　⚠️待重测') + '\n\n';
  md += '- **做什么**：' + m.how + '\n';
  md += '- **怎么验**：' + (m.verify || '—') + '\n\n';
}

md += '---\n\n## 三、需要你做（要账号或要决策）\n\n';
if (!yours.length) md += '（无）\n\n';
for (const y of yours) {
  md += '### ' + y.name + '　`' + y.id + '`' + (y.verdict === 'GAP1' ? '　**★中心①失守**' : '') + '\n\n';
  md += '- **谁做**：' + y.who + '\n';
  md += '- **怎么做**：' + y.how + '\n';
  md += '- **怎么验**：' + (y.verify || '—') + '\n\n';
}

md += '---\n\n## 四、已经守住的（继续保持）\n\n';
for (const p of parity) md += '- ✅ **' + p.name + '** —— Bruno 在，我们也在\n';
for (const l of lead) md += '- 🔵 **' + l.name + '** —— 我们领先（Bruno 不在）\n';
md += '\n---\n\n## 五、怎么让这个循环一直转\n\n';
md += '```bash\n# 1. 测量两个中心（有 GAP1 会退出码 1）\nnode tools/two_centers.mjs\n\n# 2. 生成行动清单\nnode tools/two_centers_actions.mjs\n\n# 3. 检查历史教训是否仍被遵守\nnode tools/lessons.mjs\n\n# 4. 持续循环（编排器已接入）\nnode tools/orchestrate_v2.mjs\n```\n\n';
md += '**判定规则**：\n';
md += '- 出现 GAP1 → 中心①失守 → 优先补，补完重测\n';
md += '- GAP2 → 中心②机会 → 按性价比排期去打\n';
md += '- UNKNOWN → 换通道重测，**绝不**当成"不在"\n\n';

writeFileSync(join(OUT, '两个中心-行动清单.md'), md, 'utf8');
console.log('\n  ✅ 两个中心-行动清单.md');
console.log('     我做的 ' + mine.length + ' 项 · 你做的 ' + yours.length + ' 项');
console.log('     中心①失守 ' + gap1.length + ' 项 · 中心②机会 ' + gap2.length + ' 项 · 待重测 ' + unknown.length + ' 项\n');
