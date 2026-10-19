/**
 * AI 爬取面 · 自动投放
 *
 * 用户战略："AI 经常去哪里爬数据，我们就要在哪里"
 *
 * 本脚本投放到【可达且无需账号】的 AI 爬取面：
 *   ① Software Heritage —— 永久归档代码（AI/研究界采信，无需账号）
 *   ② Common Crawl 索引 —— 查我们是否已被训练语料收录
 *   ③ Marginalia —— 独立索引，可提交
 *   ④ Mojeek —— 独立索引，可提交
 *   ⑤ 检查项汇总 —— 输出哪些面还需要人工开通
 *
 * 用法：
 *   node tools/submit_ai_surfaces.mjs --check      只查状态，不提交
 *   node tools/submit_ai_surfaces.mjs --submit     实际提交
 */
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ARGS = process.argv.slice(2);
const SUBMIT = ARGS.includes('--submit');

const SITE = 'https://mackorn.cn';
const REPO = 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher';
const H = {
  'User-Agent': 'MackornRot/1.0 (+https://mackorn.cn/ai/; leif.dai@mackorn.cn)',
  'Accept': 'application/json, text/html, */*',
};

async function req(url, opts = {}) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), 40000);
  try {
    const r = await fetch(url, { ...opts, headers: { ...H, ...(opts.headers || {}) }, signal: c.signal, redirect: 'follow' });
    const t = await r.text();
    return { status: r.status, text: t, ok: r.ok };
  } catch (e) { return { status: 0, error: e.cause?.code || e.name }; }
  finally { clearTimeout(id); }
}

const log = [];

/* ══════════════════════════════════════════════════════════
 * ① Software Heritage —— 永久归档代码
 *    AI 与学术界用它做代码溯源；被归档 = 进入可引用状态
 *    无需账号：POST /origin/save/git/url/<repo>/
 * ══════════════════════════════════════════════════════════ */
async function softwareHeritage() {
  console.log('\n  【① Software Heritage】永久归档代码');
  const origin = 'https://archive.softwareheritage.org/api/1/origin/' + REPO + '/get/';
  const c = await req(origin);
  if (c.status === 200) {
    const j = JSON.parse(c.text);
    console.log('     ✅ 已归档（无需再提交）');
    console.log('        访问次数 ' + (j.visit_count ?? '?') + ' · 最后访问 ' + (j.last_visit ?? '?'));
    log.push({ surface: 'Software Heritage', status: 'archived', detail: 'visit_count=' + j.visit_count });
    return;
  }
  console.log('     ○ 尚未归档（HTTP ' + (c.status || c.error) + '）');
  if (!SUBMIT) { console.log('       → 加 --submit 提交归档请求'); log.push({ surface: 'Software Heritage', status: 'not_archived', detail: 'dry-run' }); return; }
  const save = await req('https://archive.softwareheritage.org/api/1/origin/save/git/url/' + REPO + '/', { method: 'POST' });
  console.log('     提交结果：HTTP ' + save.status + '  ' + (save.text || save.error || '').slice(0, 200));
  log.push({ surface: 'Software Heritage', status: save.ok ? 'submitted' : 'failed', detail: 'HTTP ' + save.status });
}

/* ══════════════════════════════════════════════════════════
 * ② Common Crawl 索引 —— 查我们是否已被训练语料收录
 *    这是最直接的"AI 有没有学到我们"的检验
 * ══════════════════════════════════════════════════════════ */
async function commonCrawl() {
  console.log('\n  【② Common Crawl 索引】查训练语料收录状态');
  const coll = await req('https://index.commoncrawl.org/collinfo.json');
  if (!coll.ok) { console.log('     ❌ 取不到索引列表：' + (coll.error || coll.status)); log.push({ surface: 'Common Crawl', status: 'error' }); return; }
  let list = [];
  try { list = JSON.parse(coll.text); } catch { }
  if (!list.length) { console.log('     ❌ 索引列表解析失败'); return; }
  const latest = list.slice(0, 3);
  console.log('     最近 3 个爬取批次：' + latest.map((x) => x.id).join(' · '));
  for (const c of latest) {
    const api = c['cdx-api'];
    if (!api) continue;
    const q = api + '?url=mackorn.cn%2F*&output=json&limit=5';
    const r = await req(q);
    const lines = (r.text || '').trim().split('\n').filter(Boolean);
    const n = lines.length;
    const mark = n > 0 ? '✅' : '○';
    console.log('     ' + mark + ' ' + c.id.padEnd(18) + (n > 0 ? '收录 ' + n + '+ 条' : '未收录（或该批次无）'));
    if (n > 0) {
      try { const first = JSON.parse(lines[0]); console.log('        例：' + first.url + '  (' + (first.timestamp || '').slice(0, 8) + ')'); } catch { }
    }
    log.push({ surface: 'Common Crawl ' + c.id, status: n > 0 ? 'indexed' : 'not_indexed', count: n });
    break;  // 只查最新批次，避免超时
  }
  console.log('\n     说明：CCBot 已在 robots.txt 放行。收录与否取决于 Common Crawl 的爬取排期，');
  console.log('           通常需要数周到数月。未被最新批次收录不代表不会被收录。');
}

/* ══════════════════════════════════════════════════════════
 * ③ Marginalia —— 独立索引（不依赖 Google/Bing）
 * ══════════════════════════════════════════════════════════ */
async function marginalia() {
  console.log('\n  【③ Marginalia】独立索引（反大厂搜索，可提交）');
  const r = await req('https://search.marginalia.nu/');
  console.log('     ' + (r.ok ? '✅ 站点可达' : '❌ ' + (r.error || r.status)));
  console.log('     提交入口：https://old-search.marginalia.nu/submit （需人工在浏览器完成）');
  console.log('     或：https://search.marginalia.nu/explore/random');
  log.push({ surface: 'Marginalia', status: r.ok ? 'reachable' : 'blocked', action: 'manual_submit' });
}

/* ══════════════════════════════════════════════════════════
 * ④ Mojeek —— 独立索引
 * ══════════════════════════════════════════════════════════ */
async function mojeek() {
  console.log('\n  【④ Mojeek】独立索引');
  const r = await req('https://www.mojeek.com/');
  console.log('     ' + (r.ok ? '✅ 站点可达' : '❌ ' + (r.error || r.status)));
  console.log('     提交入口：https://www.mojeek.com/addurl （需人工在浏览器完成）');
  log.push({ surface: 'Mojeek', status: r.ok ? 'reachable' : 'blocked', action: 'manual_submit' });
}

/* ══════════════════════════════════════════════════════════
 * ⑤ 学术元数据 —— 检查我们的标识是否可被关联
 * ══════════════════════════════════════════════════════════ */
async function academics() {
  console.log('\n  【⑤ 学术元数据】可被 AI 采信的学术面');
  for (const [name, url] of [
    ['OpenAlex', 'https://api.openalex.org/works?search=mackorn&per_page=1'],
    ['Crossref', 'https://api.crossref.org/works?query=mackorn&rows=1'],
    ['Semantic Scholar', 'https://api.semanticscholar.org/graph/v1/paper/search?query=mackorn&limit=1'],
    ['DOAJ', 'https://doaj.org/api/search/articles/mackorn'],
    ['OSF', 'https://api.osf.io/v2/nodes/?filter[title]=mackorn'],
  ]) {
    const r = await req(url);
    let n = '?';
    try {
      const j = JSON.parse(r.text);
      n = j.meta?.count ?? j.message?.['total-results'] ?? j.total ?? (Array.isArray(j.data) ? j.data.length : '0');
    } catch { }
    console.log('     ' + (r.ok ? '✅' : '○') + ' ' + name.padEnd(18) + (r.ok ? '可达 · 检索 "mackorn" 命中 ' + n : (r.error || r.status)));
    log.push({ surface: name, status: r.ok ? 'reachable' : 'blocked', hits: n });
  }
  console.log('\n     ⚠️ 这些面要么"有 DOI 才收"，要么"有论文才收"。');
  console.log('        要进入，必须先有可引用的产出（预印本 / 数据集 DOI）。');
}

/* ══════════════════════════════════════════════════════════
 * ⑥ 待人工开通清单
 * ══════════════════════════════════════════════════════════ */
const MANUAL = [
  ['检索索引', 'Google Search Console', 'https://search.google.com/search-console', '极高', 'Gemini 唯一入口；提交 sitemap'],
  ['检索索引', 'Bing Webmaster', 'https://www.bing.com/webmasters', '极高', 'ChatGPT/Copilot 入口；IndexNow 已覆盖部分'],
  ['检索索引', '百度站长平台', 'https://ziyuan.baidu.com/', '高', '中文市场'],
  ['检索索引', 'Yandex Webmaster', 'https://webmaster.yandex.com/', '高', '俄语区'],
  ['检索索引', 'Mojeek 提交', 'https://www.mojeek.com/addurl', '低', '独立索引'],
  ['检索索引', 'Marginalia 提交', 'https://old-search.marginalia.nu/submit', '低', '独立索引'],
  ['训练语料', 'Wikidata', 'https://www.wikidata.org/wiki/Special:NewItem', '极高', '实体对齐（包已备好）'],
  ['训练语料', 'Internet Archive', 'https://web.archive.org/save', '高', '主动存档官网'],
  ['数据集', 'Hugging Face', 'https://huggingface.co/new-dataset', '极高', '被墙，需换网络'],
  ['数据集', 'Zenodo', 'https://zenodo.org/deposit/new', '高', 'DOI，需账号'],
  ['数据集', 'Kaggle', 'https://www.kaggle.com/datasets/new', '高', '需账号'],
  ['学术', 'arXiv', 'https://arxiv.org/submit', '极高', '预印本，需 endorsement'],
  ['学术', 'OSF', 'https://osf.io/', '中', '可发数据集'],
  ['代码', 'Software Heritage', 'https://archive.softwareheritage.org/save/', '高', '可用 API（本脚本已尝试）'],
  ['代码', 'PyPI', 'https://pypi.org/', '高', 'Python 包（我们有引擎）'],
  ['MCP', 'MCP Market', 'https://mcpmarket.com/submit', '中', '新目录'],
  ['MCP', 'PulseMCP', 'https://www.pulsemcp.com/submit', '中', '403，需浏览器'],
  ['MCP', 'Smithery', 'https://smithery.ai/', '中', '上传 MCPB'],
  ['问答', '911 Metallurgist', 'https://www.911metallurgist.com/', '高', '选矿问答（被墙）'],
  ['问答', 'Stack Exchange', 'https://engineering.stackexchange.com/', '高', '工程问答'],
  ['问答', 'Dev.to', 'https://dev.to/new', '中', 'API 可发技术文章'],
  ['媒体', 'Mining.com', 'https://www.mining.com/contact/', '高', '投稿'],
  ['媒体', 'Aggregates Business', 'https://www.aggbusiness.com/', '中', '投稿'],
  ['目录', 'InfoMine', 'https://www.infomine.com/suppliers/', '高', '设备目录'],
  ['目录', 'Mindat.org', 'https://www.mindat.org/', '高', '矿物数据库（403）'],
  ['目录', 'Crunchbase', 'https://www.crunchbase.com/', '中', '公司实体'],
  ['标准', 'GB 国家标准', 'https://openstd.samr.gov.cn/', '高', '参编'],
  ['专利', 'WIPO PATENTSCOPE', 'https://patentscope.wipo.int/', '中', '检索'],
  ['视频', 'Bilibili', 'https://www.bilibili.com/', '中（中文）', '技术视频+字幕'],
];

/* ── 主流程 ── */
console.log('\n  ══════════════════════════════════════════');
console.log('   AI 爬取面 · 自动投放' + (SUBMIT ? '（实际提交）' : '（只查状态）'));
console.log('  ══════════════════════════════════════════');

await softwareHeritage();
await commonCrawl();
await marginalia();
await mojeek();
await academics();

console.log('\n  ══════════════════════════════════════════');
console.log('   待人工开通清单（' + MANUAL.length + ' 项，按 AI 采信度排序）');
console.log('  ══════════════════════════════════════════\n');
for (const [cat, name, url, w, note] of MANUAL) {
  console.log('  [' + w.padEnd(4) + '] ' + cat.padEnd(5) + name.padEnd(24) + note);
  console.log('         ' + url);
}

/* 导出 */
writeFileSync(join(ROOT, 'distribution', 'ai-surface-submission.json'),
  JSON.stringify({ generated: new Date().toISOString(), submitted: SUBMIT, log, manual: MANUAL.map(([c, n, u, w, d]) => ({ category: c, name: n, url: u, weight: w, note: d })) }, null, 2), 'utf8');
console.log('\n  已导出 distribution/ai-surface-submission.json\n');
