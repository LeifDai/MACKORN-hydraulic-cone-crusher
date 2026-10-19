/**
 * 从 SEC EDGAR 提取【公司级】矿业客户线索
 *
 * 为什么这条路有效：
 *   美国上市公司必须向 SEC 提交年报/季报，全文公开可检索。
 *   矿业公司的 10-K/10-Q 里会写到：
 *     · 矿山项目与扩建计划
 *     · 设备资本支出（capex）
 *     · 破碎/筛分设备采购与供应商
 *     · 具体矿区的产能与品位
 *   → 这些都是【真实公司名 + 真实项目 + 真实金额】，且完全合法公开。
 *
 * 这解决了 Comtrade 的核心局限（只有国家总额，没有公司名）。
 * SEC EDGAR 全文检索 API 免费、无需 key。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', 'company-leads');
mkdirSync(OUT, { recursive: true });

const UA = { 'User-Agent': 'MACKORN Research leif.dai@mackorn.cn', 'Accept': 'application/json' };

/* EDGAR 全文检索 API（2021 年起提供，免费无 key） */
const EDGAR = 'https://efts.sec.gov/LATEST/search-index?q=%22{QUERY}%22&forms={FORMS}&dateRange=custom&startdt={START}&enddt={END}';

const QUERIES = [
  { q: 'cone crusher', forms: '10-K', why: '年报提到圆锥破 → 正在用或计划用' },
  { q: 'cone crushers', forms: '10-K', why: '同上（复数更常见）' },
  { q: 'crushing circuit', forms: '10-K', why: '破碎流程 → 选型需求' },
  { q: 'crushing plant', forms: '10-K', why: '破碎厂 → 整线需求' },
  { q: 'grinding circuit', forms: '10-K', why: '磨矿流程 → 前端破碎需求' },
  { q: 'vibrating screen', forms: '10-K', why: '振动筛 → 同标段配套' },
  { q: 'crusher', forms: '10-K', why: '泛破碎设备' },
  { q: 'comminution', forms: '10-K', why: '碎磨工艺 → 技术决策层用词' },
  { q: 'flotation circuit', forms: '10-K', why: '浮选流程 → 选厂整体' },
  { q: 'mill throughput', forms: '10-K', why: '处理量 → 产能口径' },
  { q: 'capex', forms: '10-K', why: '资本支出（宽口径，需筛）' },
  { q: 'metallurgical testwork', forms: '10-K', why: '冶金试验 → 前期阶段' },
];

async function edgarSearch(query, forms = '10-K', start = '2024-01-01', end = '2026-12-31') {
  const url = EDGAR.replace('{QUERY}', encodeURIComponent(query)).replace('{FORMS}', forms)
    .replace('{START}', start).replace('{END}', end);
  const c = new AbortController(); const id = setTimeout(() => c.abort(), 30000);
  try {
    const r = await fetch(url, { headers: UA, signal: c.signal });
    clearTimeout(id);
    if (!r.ok) return { ok: false, status: r.status, hits: [] };
    const j = await r.json();
    return { ok: true, status: r.status, total: j.hits?.total?.value ?? 0, hits: (j.hits?.hits || []).map(extract) };
  } catch (e) { return { ok: false, error: e.cause?.code || e.name, hits: [] }; }
  finally { clearTimeout(id); }
}

function extract(h) {
  const s = h._source || {};
  return {
    company: (s.display_names || [])[0] || s.entity_name || '—',
    cik: (s.cik || [])[0] || s.entity_id || '',
    form: s.root_form || s.form || '',
    filed: s.file_date || '',
    file: s.file_type || '',
    id: h._id || '',
    url: s.cik && h._id ? `https://www.sec.gov/Archives/edgar/data/${(s.cik || [])[0]}/${(h._id || '').split(':')[0]}` : '',
  };
}

/* ══════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════ */
console.log('\n  ══════════════════════════════════════════════════════════');
console.log('   SEC EDGAR 公司级线索提取（' + QUERIES.length + ' 组检索）');
console.log('  ══════════════════════════════════════════════════════════\n');

const all = [];
const byQuery = [];

for (const { q, forms, why } of QUERIES) {
  const r = await edgarSearch(q, forms);
  if (!r.ok) {
    console.log('  ❌ "' + q + '"  →  ' + (r.error || 'HTTP ' + r.status));
    await new Promise((s) => setTimeout(s, 700));
    continue;
  }
  console.log('  ✅ "' + q + '"  →  命中 ' + r.total + ' 份文件');
  byQuery.push({ query: q, forms, why, total: r.total, hits: r.hits.length });
  for (const h of r.hits) all.push({ ...h, matched: q });
  await new Promise((s) => setTimeout(s, 700));   // EDGAR 限速：10 req/s，保守
}

/* ── 去重：按公司聚合 ── */
const byCompany = new Map();
for (const h of all) {
  const key = h.company;
  if (!key || key === '—') continue;
  const rec = byCompany.get(key) || { company: key, cik: h.cik, filings: [], terms: new Set(), latest: '' };
  rec.filings.push({ form: h.form, filed: h.filed, matched: h.matched, url: h.url });
  rec.terms.add(h.matched);
  if (h.filed > rec.latest) rec.latest = h.filed;
  byCompany.set(key, rec);
}
const companies = [...byCompany.values()]
  .map((c) => ({ ...c, terms: [...c.terms], filingCount: c.filings.length }))
  .sort((a, b) => b.filingCount - a.filingCount);

console.log('\n  ── 公司级结果 ──');
console.log('    唯一公司 ' + companies.length + ' 家 · 原始命中 ' + all.length + ' 份文件');

if (companies.length) {
  console.log('\n  公司名（按命中文件数排序）');
  console.log('  ' + '─'.repeat(92));
  for (const c of companies.slice(0, 40)) {
    console.log('  ' + c.company.slice(0, 46).padEnd(48) + String(c.filingCount).padStart(3) + ' 份  ' +
      c.latest + '  ' + c.terms.slice(0, 3).join('/').slice(0, 28));
  }
  console.log('  ' + '─'.repeat(92));
}

/* ── 导出 ── */
const csv = [['company', 'cik', 'filing_count', 'latest_filed', 'matched_terms', 'sample_filing_url'].join(',')]
  .concat(companies.map((c) => [
    '"' + c.company.replace(/"/g, '""') + '"', c.cik, c.filingCount, c.latest,
    '"' + c.terms.join('; ') + '"', c.filings[0]?.url || '',
  ].join(','))).join('\n');
writeFileSync(join(OUT, 'sec-edgar-company-leads.csv'), csv, 'utf8');

writeFileSync(join(OUT, 'sec-edgar-raw.json'), JSON.stringify({
  generated: new Date().toISOString(),
  source: 'SEC EDGAR full-text search API (https://efts.sec.gov/LATEST/search-index)',
  note: '公开上市公司年报全文检索。公司名、CIK、文件日期、命中词均为原文提取，可逐条到 sec.gov 复核。',
  byQuery, companies: companies.map((c) => ({ ...c, filings: c.filings.slice(0, 5) })),
}, null, 2), 'utf8');

console.log('\n  ✅ 导出 distribution/company-leads/sec-edgar-company-leads.csv（' + companies.length + ' 家）');
console.log('  ✅ 导出 distribution/company-leads/sec-edgar-raw.json（含完整命中与复核链接）');
console.log('\n  复核方式：每家的 CIK 与文件 URL 都可在 https://www.sec.gov/edgar/ 逐条查验\n');
