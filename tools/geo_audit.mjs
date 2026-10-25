/**
 * GEO 审计器（R181）
 *
 * 用户要求（2026-10-25）：
 *   「参照 GEO 开源工具信息，优化 www.mackorn.cn 的网页，把 GEO 优化，
 *     有什么不清楚的就问就尝试，请试试这个，并看看使用情况。」
 *
 * ★ GEO 是什么（与「目录收录」的区别，必须分清）
 *   目录收录 = 被列在某个平台的清单里（我们做了 74 平台台账）
 *   GEO      = 生成式引擎优化 = 被 AI 在【生成回答时引用】
 *
 *   两者机制完全不同：
 *     · 目录收录靠"提交"
 *     · GEO 靠"AI 能不能抓到 + 抽得出结构 + 愿意引用"
 *
 * ★ GEO 五个可测维度（本工具逐条检查）
 *   ① 可抓取性（robots.txt 放行了哪些 AI 爬虫）
 *   ② 结构化数据（JSON-LD：Organization / WebSite / Product / FAQPage）
 *   ③ 内容可引用性（是否有明确问答、数据表格）
 *   ④ 元信息完整（title / description / canonical / hreflang）
 *   ⑤ AI 索引文件（llms.txt / ai.txt / server-card）
 *
 * ★ 为什么国内维度最重要（用户点出的关键）
 *   市面上开源 GEO 工具几乎全部聚焦 ChatGPT/Perplexity。
 *   但国内豆包月活 3.45 亿、通义千问 1.66 亿 —— 不放行它们的爬虫，
 *   就等于放弃了最大的流量入口。
 *
 * 用法：
 *   node tools/geo_audit.mjs                    # 审计主站
 *   node tools/geo_audit.mjs --url https://mackorn.cn/ai/
 *   node tools/geo_audit.mjs --all              # 审计主站 + 所有关键页
 *   node tools/geo_audit.mjs --json
 *   node tools/geo_audit.mjs --check            # 门禁（分数 < 60 则 exit 1）
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'distribution', '03_验证与基准');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };

/* ══════════════════════════════════════════════════════════════
 * AI 爬虫清单（分海外 / 国内两组 —— 这是本工具的核心洞察）
 * ══════════════════════════════════════════════════════════════ */
const AI_CRAWLERS = {
  overseas: [
    ['GPTBot', 'OpenAI ChatGPT'],
    ['OAI-SearchBot', 'OpenAI 搜索'],
    ['ChatGPT-User', 'ChatGPT 用户触发'],
    ['ClaudeBot', 'Anthropic Claude'],
    ['Claude-Web', 'Claude 网页'],
    ['anthropic-ai', 'Anthropic'],
    ['Google-Extended', 'Google Gemini'],
    ['PerplexityBot', 'Perplexity'],
    ['Applebot-Extended', 'Apple Intelligence'],
    ['CCBot', 'Common Crawl（多数大模型训练语料源）'],
    ['meta-externalagent', 'Meta AI'],
    ['Amazonbot', 'Amazon'],
    ['cohere-ai', 'Cohere'],
    ['YouBot', 'You.com'],
    ['Diffbot', 'Diffbot'],
    ['MistralAI-User', 'Mistral'],
  ],
  china: [
    ['Bytespider', '字节跳动 / 豆包（月活 3.45 亿）'],
    ['ByteDance', '字节跳动'],
    ['TongyiBot', '阿里通义千问（月活 1.66 亿）'],
    ['Tongyi', '通义'],
    ['Alibaba', '阿里'],
    ['YisouSpider', '夸克/神马搜索'],
    ['DeepSeekBot', '深度求索 DeepSeek'],
    ['DeepSeek', 'DeepSeek'],
    ['ZhipuBot', '智谱 AI'],
    ['ChatGLM', '智谱 ChatGLM'],
    ['MoonshotBot', '月之暗面 Kimi'],
    ['Kimi', 'Kimi'],
    ['HunyuanBot', '腾讯混元'],
    ['TencentBot', '腾讯'],
    ['ERNIEBot', '百度文心一言'],
    ['WenxinBot', '文心'],
    ['SparkBot', '讯飞星火'],
    ['SenseBot', '商汤'],
    ['Baiduspider', '百度搜索'],
    ['Sogou', '搜狗'],
    ['360Spider', '360 搜索'],
  ],
};

/* ══════════════════════════════════════════════════════════════
 * 审计一个 URL
 * ══════════════════════════════════════════════════════════════ */
/* R184：--local 模式 —— 读本地 _deploy 文件而不是线上（上传前验证用）
 * 为什么需要：GEO 改动在本地完成，但服务器还没传。不用等上传就能看到预期分数。 */
const LOCAL_MODE = process.argv.includes('--local');
const DEPLOY = join(ROOT, 'distribution', '_deploy');

/** URL → 本地 _deploy 相对路径 */
function urlToLocal(url) {
  const m = url.match(/mackorn\.cn(\/[^?#]*)?$/);
  if (!m) return null;
  let p = (m[1] || '/').replace(/^\//, '');
  const cands = p === '' ? ['index.html', 'ai/index.html'] : [p, p + '.html', p + '/index.html', 'ai/' + p, 'ai/' + p + '.html'];
  for (const cand of cands) {
    const fp = join(DEPLOY, ...cand.split('/'));
    try { if (statSync(fp).isFile()) return fp; } catch { /* 不存在就跳过 */ }
  }
  return null;
}

async function auditPage(url) {
  const r = {
    url, ok: false, http: null, bytes: 0, error: null,
    scores: {}, details: {}, total: 0, max: 100, grade: 'F',
  };

  let html = '';
  if (LOCAL_MODE) {
    const fp = urlToLocal(url);
    if (!fp) { r.error = '本地文件不存在'; return r; }
    html = readFileSync(fp, 'utf8');
    r.http = 200;
    r.bytes = html.length;
    r.source = 'local:' + fp.replace(DEPLOY, '_deploy').replace(/\\/g, '/');
    r.ok = true;
  } else {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000), redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MACKORN-GEO-audit/1.0)' } });
      r.http = res.status;
      if (!res.ok) { r.error = 'HTTP ' + res.status; return r; }
      html = await res.text();
      r.bytes = html.length;
      r.source = 'live';
      r.ok = true;
    } catch (e) {
      r.error = String((e.cause && (e.cause.code || e.cause.message)) || e.message).slice(0, 60);
      return r;
    }
  }

  const t = html;

  /* ── ① 元信息（30 分）── */
  const title = (t.match(/<title[^>]*>([^<]*)<\/title>/i) || [, ''])[1].trim();
  const desc = (t.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) || [, ''])[1].trim();
  const kw = (t.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']*)["']/i) || [, ''])[1].trim();
  const meta = {
    title: { value: title, len: title.length, ok: title.length >= 10 && !/^上海美矿机械股份有限公司$/.test(title), note: '要含产品关键词，不只用公司名' },
    description: { value: desc.slice(0, 80), len: desc.length, ok: desc.length >= 60 && desc !== '摘要', note: '"摘要"是占位符；应 120-160 字' },
    keywords: { value: kw.slice(0, 60), len: kw.length, ok: kw.length >= 30 && kw !== '关键字', note: '"关键字"是占位符' },
    canonical: { ok: /rel=["']canonical["']/i.test(t) },
    hreflang: { ok: /hreflang=/i.test(t) },
    og: { ok: /property=["']og:title["']/i.test(t) },
  };
  let metaScore = 0;
  if (meta.title.ok) metaScore += 8; else metaScore += 2;
  if (meta.description.ok) metaScore += 8; else metaScore += 2;
  if (meta.keywords.ok) metaScore += 4;
  if (meta.canonical.ok) metaScore += 4;
  if (meta.hreflang.ok) metaScore += 3;
  if (meta.og.ok) metaScore += 3;
  r.scores.meta = metaScore;
  r.details.meta = meta;

  /* ── ② 结构化数据（40 分）── */
  const lds = [];
  for (const m of t.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { lds.push(JSON.parse(m[1])); } catch { /* 忽略坏 JSON */ }
  }
  const types = new Set();
  for (const j of lds) {
    const arr = Array.isArray(j) ? j : [j];
    for (const x of arr) {
      if (x['@type']) types.add(x['@type']);
      if (x['@graph']) for (const g of x['@graph']) if (g['@type']) types.add(g['@type']);
    }
  }
  const schema = {
    count: lds.length,
    types: [...types],
    Organization: types.has('Organization'),
    WebSite: types.has('WebSite'),
    Product: types.has('Product') || types.has('ItemList'),
    FAQPage: types.has('FAQPage'),
    Breadcrumb: types.has('BreadcrumbList'),
    LocalBusiness: types.has('LocalBusiness'),
  };
  let schemaScore = 0;
  if (schema.Organization) schemaScore += 15;   /* 最重要 */
  if (schema.Product) schemaScore += 10;
  if (schema.FAQPage) schemaScore += 10;
  if (schema.WebSite) schemaScore += 3;
  if (schema.Breadcrumb) schemaScore += 2;
  r.scores.schema = schemaScore;
  r.details.schema = schema;

  /* ── ③ 内容可引用性（20 分）── */
  const content = {
    tables: (t.match(/<table/gi) || []).length,
    qa_blocks: (t.match(/<dt|<details|<h[23][^>]*>[^<]*[？?]/gi) || []).length,
    lists: (t.match(/<ul|<ol/gi) || []).length,
    zh_chars: (t.match(/[\u4e00-\u9fa5]/g) || []).length,
    has_faq_section: /id=["']faq["']|常见问题|FAQ/i.test(t),
  };
  let contentScore = 0;
  if (content.tables > 0) contentScore += 6;
  if (content.qa_blocks > 0) contentScore += 6;
  if (content.has_faq_section) contentScore += 4;
  if (content.zh_chars > 500) contentScore += 4;
  r.scores.content = contentScore;
  r.details.content = content;

  /* ── ④ AI 索引文件（10 分）── */
  const aiFiles = {
    llms_txt_link: /llms\.txt/i.test(t),
    ai_txt_link: /ai\.txt/i.test(t),
    server_card: /server-card\.json/i.test(t),
  };
  let aiScore = 0;
  if (aiFiles.llms_txt_link) aiScore += 6;
  if (aiFiles.ai_txt_link) aiScore += 2;
  if (aiFiles.server_card) aiScore += 2;
  r.scores.ai_files = aiScore;
  r.details.ai_files = aiFiles;

  r.total = metaScore + schemaScore + contentScore + aiScore;
  r.grade = r.total >= 85 ? 'A' : r.total >= 70 ? 'B' : r.total >= 50 ? 'C' : r.total >= 30 ? 'D' : 'F';
  return r;
}

/* ══════════════════════════════════════════════════════════════
 * 审计 robots.txt（AI 爬虫放行情况）—— 这是「国内维度」的核心
 * ══════════════════════════════════════════════════════════════ */
async function auditRobots(siteRoot) {
  const r = { url: siteRoot + '/robots.txt', ok: false, http: null, bytes: 0, overseas: [], china: [], error: null, score: 0, max: 30 };
  try {
    let t;
    if (LOCAL_MODE) {
      const fp = join(DEPLOY, 'robots.txt');
      t = readFileSync(fp, 'utf8');
      r.http = 200; r.source = 'local';
    } else {
      const res = await fetch(r.url, { signal: AbortSignal.timeout(20000) });
      r.http = res.status;
      if (!res.ok) { r.error = 'HTTP ' + res.status; return r; }
      t = await res.text();
      r.source = 'live';
    }
    r.bytes = t.length;
    r.ok = true;
    for (const [ua, desc] of AI_CRAWLERS.overseas) {
      r.overseas.push({ ua, desc, allowed: new RegExp('User-agent:\\s*' + ua.replace(/[-]/g, '\\-'), 'i').test(t) });
    }
    for (const [ua, desc] of AI_CRAWLERS.china) {
      r.china.push({ ua, desc, allowed: new RegExp('User-agent:\\s*' + ua.replace(/[-]/g, '\\-'), 'i').test(t) });
    }
    /* 计分：海外 15 分（15 个主要爬虫）+ 国内 15 分（国内带权重） */
    const overseasOk = r.overseas.filter((x) => x.allowed).length;
    const chinaOk = r.china.filter((x) => x.allowed).length;
    /* 国内重点：Bytespider / TongyiBot / DeepSeekBot / ZhipuBot / MoonshotBot / HunyuanBot */
    const chinaKey = ['Bytespider', 'TongyiBot', 'DeepSeekBot', 'ZhipuBot', 'MoonshotBot', 'HunyuanBot', 'YisouSpider'];
    const chinaKeyOk = r.china.filter((x) => chinaKey.includes(x.ua) && x.allowed).length;
    r.score = Math.round((overseasOk / r.overseas.length) * 10 + (chinaKeyOk / chinaKey.length) * 20);
  } catch (e) {
    r.error = String((e.cause && (e.cause.code || e.cause.message)) || e.message).slice(0, 60);
  }
  return r;
}

/* ══════════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════════ */
const SITE = 'https://www.mackorn.cn';
const targets = has('--all')
  ? [SITE + '/', 'https://mackorn.cn/ai/', 'https://mackorn.cn/ai/videos/', 'https://mackorn.cn/ai/glossary/']
  : [val('--url') || (SITE + '/')];

console.log('');
console.log('  ══ GEO 审计器 ══' + (LOCAL_MODE ? '  【本地模式：读 _deploy 文件，不上网】' : '  【线上模式：直接读网站】'));
console.log('  （GEO = 生成式引擎优化：让 AI 在生成回答时【引用我们】）');
console.log('');

const robots = await auditRobots(SITE);
const pages = [];
for (const u of targets) {
  const p = await auditPage(u);
  pages.push(p);
}

/* robots 报告 */
console.log('  ══ ① 可抓取性（robots.txt）══');
if (!robots.ok) {
  console.log('  ❌ ' + robots.error);
} else {
  const oOk = robots.overseas.filter((x) => x.allowed).length;
  const cOk = robots.china.filter((x) => x.allowed).length;
  console.log('  HTTP ' + robots.http + ' · ' + robots.bytes + 'B · 得分 ' + robots.score + '/' + robots.max);
  console.log('  海外 AI 爬虫放行：' + oOk + '/' + robots.overseas.length);
  for (const x of robots.overseas) {
    if (!x.allowed) console.log('    ❌ 缺 ' + x.ua + '（' + x.desc + '）');
  }
  console.log('  国内 AI 爬虫放行：' + cOk + '/' + robots.china.length + '  ← ★ 国内是最大流量入口');
  for (const x of robots.china) {
    console.log('    ' + (x.allowed ? '✅' : '❌') + ' ' + x.ua.padEnd(14) + x.desc);
  }
}
console.log('');

/* 页面报告 */
for (const p of pages) {
  console.log('  ══ ' + p.url + ' ══');
  if (!p.ok) { console.log('  ❌ ' + p.error + '\n'); continue; }
  console.log('  HTTP ' + p.http + ' · ' + p.bytes + 'B · 总分 ' + p.total + '/100 · 等级 ' + p.grade);
  console.log('');
  console.log('  ── ① 元信息 ' + p.scores.meta + '/30 ──');
  const meta = p.details.meta;
  console.log('    ' + (meta.title.ok ? '✅' : '❌') + ' title：' + (meta.title.value || '（空）').slice(0, 60));
  console.log('    ' + (meta.description.ok ? '✅' : '❌') + ' description：' + (meta.description.value || '（空）').slice(0, 60) + (meta.description.ok ? '' : '  ← ' + meta.description.note));
  console.log('    ' + (meta.keywords.ok ? '✅' : '❌') + ' keywords：' + (meta.keywords.value || '（空）').slice(0, 50) + (meta.keywords.ok ? '' : '  ← ' + meta.keywords.note));
  console.log('    ' + (meta.canonical.ok ? '✅' : '❌') + ' canonical');
  console.log('    ' + (meta.hreflang.ok ? '✅' : '❌') + ' hreflang');
  console.log('    ' + (meta.og.ok ? '✅' : '❌') + ' Open Graph');
  console.log('  ── ② 结构化数据 ' + p.scores.schema + '/40 ──');
  console.log('    JSON-LD 块数：' + p.details.schema.count);
  console.log('    类型：' + (p.details.schema.types.join(', ') || '（无）'));
  console.log('    ' + (p.details.schema.Organization ? '✅' : '❌') + ' Organization ← 最重要（AI 靠它知道我们是谁）');
  console.log('    ' + (p.details.schema.Product ? '✅' : '❌') + ' Product / ItemList');
  console.log('    ' + (p.details.schema.FAQPage ? '✅' : '❌') + ' FAQPage ← AI 最爱引用的格式');
  console.log('  ── ③ 内容可引用性 ' + p.scores.content + '/20 ──');
  console.log('    表格：' + p.details.content.tables + ' · 问答块：' + p.details.content.qa_blocks + ' · 列表：' + p.details.content.lists + ' · 中文字符：' + p.details.content.zh_chars);
  console.log('    ' + (p.details.content.has_faq_section ? '✅' : '❌') + ' 有 FAQ 区块');
  console.log('  ── ④ AI 索引文件 ' + p.scores.ai_files + '/10 ──');
  console.log('    ' + (p.details.ai_files.llms_txt_link ? '✅' : '❌') + ' llms.txt 链接');
  console.log('    ' + (p.details.ai_files.ai_txt_link ? '✅' : '❌') + ' ai.txt 链接');
  console.log('');
}

/* 汇总 */
const totalSum = pages.filter((p) => p.ok).reduce((a, p) => a + p.total, 0);
const avg = pages.filter((p) => p.ok).length ? Math.round(totalSum / pages.filter((p) => p.ok).length) : 0;
const report = {
  schema: 'mackorn-geo-audit/1',
  at: new Date().toISOString(),
  site: SITE,
  what: 'GEO 审计 —— 与「目录收录」不同，GEO 是让 AI 在生成回答时引用我们',
  robots: { score: robots.score, max: robots.max, overseas: robots.overseas, china: robots.china },
  pages: pages.map((p) => ({ url: p.url, ok: p.ok, http: p.http, total: p.total, grade: p.grade, scores: p.scores, details: p.details })),
  summary: { pages_audited: pages.filter((p) => p.ok).length, average_score: avg, robots_score: robots.score },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'geo-audit.json'), JSON.stringify(report, null, 2), 'utf8');

console.log('  ══ 汇总 ══');
console.log('  页面均分：' + avg + '/100');
console.log('  robots 得分：' + robots.score + '/' + robots.max);
console.log('');
console.log('  报告：distribution/03_验证与基准/geo-audit.json');
console.log('  优化包：geo-optimization/主站GEO优化代码包.html');
console.log('');

if (has('--check')) {
  if (avg < 60) { console.log('  ❌ GEO 门禁失败：页面均分 ' + avg + ' < 60'); console.log(''); process.exit(1); }
  console.log('  ✅ GEO 门禁通过（均分 ' + avg + ' ≥ 60）'); console.log('');
}
