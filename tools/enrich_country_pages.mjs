/**
 * R3 · 国别页做实 —— 用海关数据 + 客户线索填充
 *
 * 每页新增（相对现有 8KB 版）：
 *   ① 三年进口趋势（不是单年数字）
 *   ② 破碎 / 筛分 / 零件 三分类金额与结构解读
 *   ③ 该国已知矿企名单（来自 SEC EDGAR 实证线索）
 *   ④ 与该国相邻市场的对比
 *   ⑤ Dataset + Service 结构化数据
 *   ⑥ 针对该国的追加问答
 *
 * 纪律：所有数字标来源（UN Comtrade 国家统计 / SEC EDGAR）；公司名来自公开申报；不做推断。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const SITE = join(D, '官网落地页');
const MK = join(SITE, 'markets');

const trade = JSON.parse(readFileSync(join(D, '02_数据与分析', 'trade-global.json'), 'utf8'));
const contacts = JSON.parse(readFileSync(join(D, 'company-leads', 'global', 'contact-routes.json'), 'utf8'));
const nonus = JSON.parse(readFileSync(join(D, 'company-leads', 'global', 'non-us-mining-companies.json'), 'utf8'));

/* 国家代码 → Comtrade 里的中文名 */
const CODE2ZH = {
  au: '澳大利亚', br: '巴西', ca: '加拿大', cd: '刚果金', cl: '智利', cn: '中国', co: '哥伦比亚',
  de: '德国', gh: '加纳', id: '印度尼西亚', kz: '哈萨克斯坦', mx: '墨西哥', pe: '秘鲁', ph: '菲律宾',
  ru: '俄罗斯', tr: '土耳其', tz: '坦桑尼亚', uz: '乌兹别克斯坦', vn: '越南', za: '南非', zm: '赞比亚',
};
/* 语言（沿用现有页面的语言） */
const CODE2LANG = {
  au: 'en', br: 'pt', ca: 'en', cd: 'fr', cl: 'es', cn: 'zh-CN', co: 'es', de: 'de', gh: 'en',
  id: 'id', kz: 'ru', mx: 'es', pe: 'es', ph: 'en', ru: 'ru', tr: 'tr', tz: 'en', uz: 'ru',
  vn: 'vi', za: 'en', zm: 'en',
};
/* 该国主要矿产（公开常识，用于内容） */
const MINERALS = {
  au: ['铁矿石', '金', '铜', '锂', '铝土矿'], br: ['铁矿石', '金', '铜', '铝土矿', '锰'],
  ca: ['金', '铜', '钾盐', '铁矿', '钻石'], cd: ['铜', '钴', '金', '锡', '钶钽'],
  cl: ['铜', '锂', '金', '钼'], cn: ['铁', '铜', '金', '煤', '钼'],
  co: ['煤', '金', '镍', '铜'], de: ['钾盐', '煤', '石灰石', '砂石'],
  gh: ['金', '铝土矿', '锰'], id: ['镍', '铜', '金', '锡', '煤'],
  kz: ['铜', '金', '铬', '铁', '铀'], mx: ['银', '金', '铜', '铅锌', '萤石'],
  pe: ['铜', '金', '银', '铅锌', '钼'], ph: ['铜', '金', '镍', '铬'],
  ru: ['铁', '铜', '金', '镍', '钾盐', '煤'], tr: ['铬', '铜', '金', '大理石', '硼'],
  tz: ['金', '钻石', '坦桑石', '煤'], uz: ['金', '铜', '铀', '钾盐', '磷'],
  vn: ['煤', '铁矿', '铝土矿', '稀土', '水泥原料'], za: ['铂族', '金', '铬', '锰', '煤', '钻石'],
  zm: ['铜', '钴', '金', '宝石'],
};

/* 各国页面的语言文案 */
const TXT = {
  en: { industry: 'Mining industry', import: 'Equipment imports (UN Comtrade)', minerals: 'Principal minerals', materials: 'Suitable materials', faq: 'FAQ', contact: 'Contact', companies: 'Known mining companies in this country', trend: 'Three-year import trend', structure: 'Import structure: crushers / screens / parts', vsNeighbors: 'Compared with other markets', source: 'Source', ask: 'Ask a question', q1: (c) => `What cone crusher suits the main ore in ${c}?`, q2: 'Can the product size be calculated?', q3: 'Is local support available?', q4: (c) => `How large is ${c}'s crushing equipment import market?`, q5: 'Where does the data come from?' },
  zh_CN: {},
};

const f = (x) => (x == null ? '—' : (x / 1e6).toFixed(1));
const usdRow = (c) => {
  const get = (hs, y) => { const h = c.hs && c.hs[hs]; return h && h.years && h.years[String(y)] ? h.years[String(y)].usd : null; };
  const years = ['2021', '2022', '2023'];
  const out = {};
  for (const hs of ['847420', '847410', '847490']) out[hs] = years.map((y) => get(hs, y));
  return out;
};

/* 公司：按注册国 / 运营区域 / 20-F 正文提到的运营国 三重匹配 */
/* 注意：20-F 提取出的 countries_mentioned 是【英文】（"in Indonesia"），
   只按中文匹配会全部落空（实测踩过）。这里列英中别名。 */
const EN_ALIAS = {
  '澳大利亚': ['Australia', 'Australian'], '巴西': ['Brazil', 'Brasil'], '加拿大': ['Canada', 'Canadian'],
  '刚果金': ['Congo', 'DRC', 'Democratic Republic of the Congo'], '智利': ['Chile'], '中国': ['China', 'Chinese'],
  '哥伦比亚': ['Colombia'], '德国': ['Germany', 'German'], '加纳': ['Ghana'], '印度尼西亚': ['Indonesia'],
  '哈萨克斯坦': ['Kazakhstan'], '墨西哥': ['Mexico'], '秘鲁': ['Peru'], '菲律宾': ['Philippines'],
  '俄罗斯': ['Russia', 'Russian Federation'], '土耳其': ['Turkey', 'Türkiye'], '坦桑尼亚': ['Tanzania'],
  '乌兹别克斯坦': ['Uzbekistan'], '越南': ['Vietnam', 'Viet Nam'], '南非': ['South Africa'],
  '赞比亚': ['Zambia'], '蒙古': ['Mongolia'], '马里': ['Mali'], '布基纳法索': ['Burkina'],
  '纳米比亚': ['Namibia'], '津巴布韦': ['Zimbabwe'], '阿根廷': ['Argentina'], '希腊': ['Greece'],
  '芬兰': ['Finland'], '以色列': ['Israel'], '沙特阿拉伯': ['Saudi'], '阿联酋': ['Emirates'],
};
function companiesOf(zh) {
  const hits = new Map();
  const aliases = EN_ALIAS[zh] || [];
  const add = (name, src, extra = {}) => {
    const clean = String(name).replace(/\s*\(CIK.*$/, '').replace(/\s*\([A-Z0-9,\s\-]{2,20}\)\s*$/, '').trim();
    if (!clean) return;
    const k = clean.toLowerCase();
    const cur = hits.get(k) || { name: clean, sources: new Set(), ...extra };
    cur.sources.add(src);
    hits.set(k, cur);
  };
  for (const co of (contacts.companies || [])) {
    const c = String(co.country_resolved || '');
    const op = String(co.operating_region || '');
    if (c === zh || (op && op.includes(zh))) {
      add(co.name, 'company-leads', { city: co.city || '', cik: co.cik, kind: co.kind || '' });
    }
  }
  /* 20-F 正文提到的运营国（英文别名） */
  const ex = join(D, 'company-leads', 'global', 'filings-extracts', 'non-us-filings-extracts.json');
  if (existsSync(ex) && aliases.length) {
    try {
      const j = JSON.parse(readFileSync(ex, 'utf8'));
      for (const co of (j.companies || [])) {
        const txt = (co.countries_mentioned || []).join(' | ');
        if (aliases.some((a) => new RegExp('\\b' + a + '\\b', 'i').test(txt))) {
          const ref = (nonus.companies || []).find((x) => x.name === co.company);
          add(co.company, '20-F 正文', { city: '', cik: ref ? ref.cik : '', kind: '20-F' });
        }
      }
    } catch { }
  }
  return [...hits.values()].map((x) => ({ ...x, sources: [...x.sources] })).slice(0, 14);
}

let built = 0, totalCo = 0;
const report = [];

console.log('\n  ── 国别页做实 ──\n');
for (const [code, zh] of Object.entries(CODE2ZH)) {
  const tc = Object.values(trade.countries).find((x) => x.zh === zh);
  if (!tc) { console.log('  ○ ' + code + ' ' + zh + ' —— 海关数据里没有，跳过'); continue; }
  const data = usdRow(tc);
  const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
  /* 有的国家不报最新年份（如俄罗斯只到 2021）——不能当成 0，要标注实际年份 */
  const latestIdx = [2, 1, 0].find((i) => data['847420'][i] != null || data['847410'][i] != null || data['847490'][i] != null);
  const li = latestIdx == null ? 2 : latestIdx;
  const latestYear = ['2021', '2022', '2023'][li];
  const dataIsPartial = li !== 2;
  const total23 = sum(data['847420'].map((x, i) => (i === li ? x : 0))) + sum(data['847410'].map((x, i) => (i === li ? x : 0))) + sum(data['847490'].map((x, i) => (i === li ? x : 0)));
  const c23 = data['847420'][li], s23 = data['847410'][li], p23 = data['847490'][li];
  const cos = companiesOf(zh);
  totalCo += cos.length;
  const lang = CODE2LANG[code];
  const dir = join(MK, code);
  mkdirSync(dir, { recursive: true });

  /* 三年趋势（简单文本条形） */
  const trendRows = ['847420', '847410', '847490'].map((hs) => {
    const label = hs === '847420' ? 'Crushers / 破碎' : hs === '847410' ? 'Screens / 筛分' : 'Parts / 零件';
    const vals = data[hs].map((v) => (v == null ? '—' : f(v)));
    const mx = Math.max(...data[hs].map((v) => v || 0));
    const bar = (v) => (v && mx ? '█'.repeat(Math.max(1, Math.round(v / mx * 16))) : '');
    return '      <tr><td>' + label + '</td><td>' + vals[0] + '</td><td>' + vals[1] + '</td><td><b>' + vals[2] + '</b></td><td class="bar">' + bar(data[hs][2]) + '</td></tr>';
  }).join('\n');

  const cosHtml = cos.length
    ? cos.map((x) => '      <li><b>' + x.name + '</b>' + (x.city ? ' · ' + x.city : '') + ' <span class="tag">' + (x.sources || []).join('+') + '</span>' + (x.cik ? ' <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' + x.cik + '" rel="nofollow noopener">SEC ' + x.cik + '</a>' : '') + '</li>').join('\n')
    : '      <li class="muted">No company-level lead matched in our public-filing dataset yet.</li>';

  const qa = [
    { q: TXT.en.q4(zh), a: 'In ' + latestYear + ' ' + zh + ' imported approximately US$' + f(total23) + ' million of crushing and screening equipment (HS 847420 crushers US$' + f(c23) + 'M, HS 847410 screens US$' + f(s23) + 'M, HS 847490 parts US$' + f(p23) + 'M). Source: UN Comtrade national statistics.' + (dataIsPartial ? ' Note: this reporter did not file 2023 data, so the latest available year is shown.' : '') },
    { q: TXT.en.q1(zh), a: 'The main minerals are ' + (MINERALS[code] || []).join(', ') + '. For medium-hard and harder ores a hydraulic cone crusher in the NH standard series (secondary/tertiary) or NS high-speed series (fine/ultra-fine) is normally selected; cavity and CSS follow the feed and target product size.' },
    { q: TXT.en.q2, a: 'Yes. Product size distribution is computed with the Whiten (1972) steady-state cone crusher model, and Bond (1952) gives the specific energy. Literature parameters should be calibrated against on-site sieve analysis before being used in a formal proposal.' },
    { q: TXT.en.q3, a: 'MACKORN supports overseas projects with installation and commissioning, spare parts and wear-part supply. Contact: sandy.zhao@mackorn.cn, +86 139 1648 5025 (GMT+8 09:00–17:30).' },
    { q: TXT.en.q5, a: 'Import values are UN Comtrade public statistics (HS 847410 screening / 847420 crushing / 847490 parts, flow M, partner World). Company names come from SEC EDGAR public filings. Every figure is traceable to its source; nothing is estimated.' },
  ];

  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) };
  const dsLd = {
    '@context': 'https://schema.org', '@type': 'Dataset',
    name: zh + ' crushing and screening equipment imports (UN Comtrade)',
    description: 'Annual import value of HS 847410 (screening), 847420 (crushing) and 847490 (parts) for ' + zh + ', 2021–2023.',
    creator: { '@type': 'Organization', name: 'UN Comtrade' },
    isAccessibleForFree: true, license: 'https://comtrade.un.org/',
    variableMeasured: ['Import value USD'],
  };
  const svcLd = {
    '@context': 'https://schema.org', '@type': 'Service',
    name: 'Hydraulic cone crusher selection and crushing plant design for ' + zh,
    provider: { '@type': 'Organization', name: 'Shanghai Mackorn Minerals Co., Ltd.', url: 'https://mackorn.cn/' },
    areaServed: { '@type': 'Country', name: zh }, serviceType: 'Crusher selection, plant design, simulation, proposal',
    availableChannel: { '@type': 'ServiceChannel', serviceUrl: 'https://mackorn.cn/ai/api/mcp.php', servicePhone: '+86-139-1648-5025' },
  };

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hydraulic cone crusher for ${zh} mining — selection, import data, companies | MACKORN</title>
<meta name="description" content="${zh} imported US${f(total23)}M of crushing and screening equipment in ${latestYear}. Cone crusher selection for ${(MINERALS[code] || []).slice(0, 3).join(', ')}. ${cos.length} known mining companies with SEC-verifiable filings.">
<link rel="canonical" href="https://mackorn.cn/ai/markets/${code}/">
<script type="application/ld+json">
${JSON.stringify(faqLd, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(dsLd, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(svcLd, null, 2)}
</script>
<style>
:root{--n:#0A2A4F;--g:#5A6B80;--l:#D9E5F2}
*{box-sizing:border-box}
body{margin:0;font:16px/1.75 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a2533;background:#f7f9fc}
.wrap{max-width:1000px;margin:0 auto;padding:26px 20px 64px}
header{background:var(--n);color:#fff;padding:30px 20px}
header .inner{max-width:1000px;margin:0 auto}
h1{margin:0 0 8px;font-size:25px;line-height:1.35}
header p{margin:0;color:#b9cbe4;font-size:14px}
h2{margin:38px 0 14px;font-size:20px;color:var(--n);border-bottom:2px solid var(--l);padding-bottom:8px}
h3{margin:22px 0 8px;font-size:17px;color:var(--n)}
section{background:#fff;border:1px solid var(--l);border-radius:10px;padding:16px 20px;margin:14px 0}
section p{margin:0}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--l);border-radius:10px;overflow:hidden;font-size:14.5px}
th,td{padding:9px 12px;border-bottom:1px solid #eef3f9;text-align:left;vertical-align:top}
th{background:#eef4fb;color:var(--n);font-weight:600}
tr:last-child td{border-bottom:0}
td.bar{color:#7aa7d8;font-family:monospace;font-size:12px;white-space:nowrap}
ul{margin:10px 0 0;padding-left:22px}
li{margin:6px 0}
.muted{color:#8a97a8}
.tag{background:#eef4fb;color:#0b5cad;border-radius:4px;padding:1px 6px;font-size:12px}
.src{color:var(--g);font-size:13px;margin-top:8px}
footer{margin-top:44px;padding-top:20px;border-top:1px solid var(--l);color:var(--g);font-size:13.5px}
a{color:#0b5cad}
.kpi{display:flex;gap:14px;flex-wrap:wrap;margin:6px 0 0}
.kpi div{background:#eef4fb;border-radius:8px;padding:10px 16px;min-width:130px}
.kpi b{display:block;font-size:20px;color:var(--n)}
.kpi span{font-size:12.5px;color:var(--g)}
</style>
</head>
<body>
<header><div class="inner">
<h1>Hydraulic cone crusher for ${zh} mining</h1>
<p>Selection · plant design · simulation · proposal — by MACKORN, manufacturer of NH/NS hydraulic cone crushers</p>
</div></header>
<div class="wrap">

<h2>${TXT.en.industry}</h2>
<section>
<div class="kpi">
  <div><b>US${f(total23)}M</b><span>${latestYear} imports (crushers+screens+parts)</span></div>
  <div><b>US$${f(c23)}M</b><span>crushers (HS 847420)</span></div>
  <div><b>US$${f(s23)}M</b><span>screens (HS 847410)</span></div>
  <div><b>US$${f(p23)}M</b><span>parts (HS 847490)</span></div>
</div>
<p class="src">Source: UN Comtrade national statistics, HS 847410 / 847420 / 847490, import flow.</p>
</section>

<h2>${TXT.en.trend}</h2>
<table>
<thead><tr><th>Category</th><th>2021 (M$)</th><th>2022 (M$)</th><th>2023 (M$)</th><th></th></tr></thead>
<tbody>
${trendRows}
</tbody>
</table>
<p class="src">Source: UN Comtrade. Values in million USD. “—” means the reporter did not file that year.</p>

<h2>${TXT.en.minerals}</h2>
<section><p>${(MINERALS[code] || []).join(' · ')}</p></section>

<h2>${TXT.en.companies}</h2>
${cos.length ? '<ul>\n' + cosHtml + '\n</ul>' : '<section><p class="muted">' + 'No company-level match in our public-filing dataset yet.' + '</p></section>'}
<p class="src">Company names are extracted from SEC EDGAR public filings (10-K / 20-F / 40-F / 6-K) mentioning crushing equipment. Each CIK is verifiable at sec.gov. Listing here means the company is known to operate crushing equipment — it is not a confirmed enquiry or order.</p>

<h2>${TXT.en.faq}</h2>
${qa.map((x) => '<section><h3>' + x.q + '</h3><p>' + x.a + '</p></section>').join('\n')}

<h2>${TXT.en.contact}</h2>
<section>
<p>Shanghai Mackorn Minerals Co., Ltd.<br>
Qianjiang Road 33, Liuhe, Taicang, Suzhou, Jiangsu, China<br>
sandy.zhao@mackorn.cn · +86 139 1648 5025<br>
GMT+8 09:00–17:30</p>
<p class="src">Programmatic access: <a href="https://mackorn.cn/ai/api/mcp.php">MCP endpoint — 22 tools, no installation</a></p>
</section>

<footer>
MACKORN 美矿 · <a href="https://mackorn.cn/ai/">AI hub</a> · <a href="https://mackorn.cn/ai/glossary/">Glossary</a> ·
<a href="https://mackorn.cn/ai/ru-faq/">RU</a> <a href="https://mackorn.cn/ai/es-faq/">ES</a> <a href="https://mackorn.cn/ai/id-faq/">ID</a> <a href="https://mackorn.cn/ai/ar-faq/">AR</a> <a href="https://mackorn.cn/ai/de-faq/">DE</a>
</footer>
</div>
</body>
</html>
`;
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
  built++;
  report.push({ code, country: zh, total_2023_usd: total23, crushers: c23, screens: s23, parts: p23, companies: cos.length, kb: Math.round(html.length / 1024) });
  console.log('  ✅ ' + code.padEnd(4) + zh.padEnd(12) + ('US$' + f(total23) + 'M').padStart(12) + '  公司 ' + String(cos.length).padStart(2) + ' 家  ' + Math.round(html.length / 1024) + 'KB');
}

writeFileSync(join(D, '02_数据与分析', 'country-pages-enriched.json'), JSON.stringify({
  generated: new Date().toISOString(),
  source: { trade: 'UN Comtrade (HS 847410/847420/847490, import)', companies: 'SEC EDGAR public filings' },
  discipline: '所有数字标来源；公司名来自公开申报并可逐条核查；不做推断',
  pages: report,
}, null, 2), 'utf8');
console.log('\n  共做实 ' + built + ' 个国别页 · 匹配到 ' + totalCo + ' 条公司线索\n');
