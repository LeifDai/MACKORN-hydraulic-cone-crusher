/**
 * 用 SEC EDGAR 的 20-F 表单抓【非美国】矿业公司
 *
 * 关键洞察：
 *   外国公司在美国上市（NYSE/NASDAQ）必须提交 20-F 年报。
 *   拉美（智利/秘鲁/巴西/墨西哥）、非洲（南非/赞比亚/加纳）、
 *   亚洲（印尼/菲律宾/蒙古）、欧洲、澳洲的矿企大量采用 ADR 上市。
 *   → 20-F 全文检索 = 一份现成的【非美国矿企名录】
 *
 * 这比爬各国交易所落地页靠谱得多：结构化、可核查、全文可检索。
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', 'company-leads', 'global');
mkdirSync(OUT, { recursive: true });

const UA = { 'User-Agent': 'MACKORN Research leif.dai@mackorn.cn', 'Accept': 'application/json' };
const EDGAR = 'https://efts.sec.gov/LATEST/search-index?q=%22{QUERY}%22&forms={FORMS}&dateRange=custom&startdt={START}&enddt={END}';

/* 20-F = 外国私人发行人年报；6-K = 外国发行人临时报告；40-F = 加拿大发行人 */
const QUERIES = [
  { q: 'cone crusher', forms: '20-F', why: '外国公司年报提到圆锥破' },
  { q: 'crushing circuit', forms: '20-F', why: '破碎流程' },
  { q: 'crushing plant', forms: '20-F', why: '破碎厂' },
  { q: 'comminution', forms: '20-F', why: '碎磨工艺' },
  { q: 'vibrating screen', forms: '20-F', why: '振动筛' },
  { q: 'grinding circuit', forms: '20-F', why: '磨矿流程' },
  { q: 'cone crusher', forms: '40-F', why: '加拿大发行人年报' },
  { q: 'crushing plant', forms: '40-F', why: '加拿大发行人' },
  { q: 'crusher', forms: '6-K', why: '外国发行人临时报告（项目进展）' },
];

async function search(query, forms, start = '2024-01-01', end = '2026-12-31') {
  const url = EDGAR.replace('{QUERY}', encodeURIComponent(query)).replace('{FORMS}', forms)
    .replace('{START}', start).replace('{END}', end);
  for (let i = 1; i <= 3; i++) {
    const c = new AbortController(); const id = setTimeout(() => c.abort(), 30000);
    try {
      const r = await fetch(url, { headers: UA, signal: c.signal });
      clearTimeout(id);
      if (!r.ok) { if (i === 3) return { ok: false, s: r.status, hits: [], total: 0 }; await new Promise((s) => setTimeout(s, 700)); continue; }
      const j = await r.json();
      return { ok: true, s: r.status, total: j.hits?.total?.value ?? 0, hits: (j.hits?.hits || []) };
    } catch (e) { clearTimeout(id); if (i === 3) return { ok: false, e: e.cause?.code || e.name, hits: [], total: 0 }; await new Promise((s) => setTimeout(s, 700)); }
  }
  return { ok: false, hits: [], total: 0 };
}

/** 从 EDGAR 命中的 display_names 提取公司名与 CIK */
function parseHit(h) {
  const s = h._source || {};
  const dn = (s.display_names || [])[0] || '';
  const m = dn.match(/\(CIK\s+(\d+)\)/i);
  const cik = m ? m[1].padStart(10, '0') : null;
  const name = dn.replace(/\s*\(CIK\s*\d+\)/i, '').trim();
  return { name, cik, form: s.root_form || s.form || '', filed: s.file_date || '', id: h._id || '' };
}

console.log('\n' + '═'.repeat(80));
console.log('  SEC EDGAR 20-F / 40-F / 6-K：非美国矿业公司');
console.log('═'.repeat(80) + '\n');

const all = [];
const byQuery = [];
for (const { q, forms, why } of QUERIES) {
  const r = await search(q, forms);
  if (!r.ok) { console.log('  ❌ ' + forms.padEnd(6) + '"' + q + '"  ' + (r.e || 'HTTP ' + r.s)); continue; }
  console.log('  ✅ ' + forms.padEnd(6) + '"' + q + '"'.padEnd(20) + ' 命中 ' + String(r.total).padStart(5) + ' 份');
  byQuery.push({ query: q, forms, why, total: r.total, returned: r.hits.length });
  for (const h of r.hits) all.push({ ...parseHit(h), matched: q, form: forms });
  await new Promise((s) => setTimeout(s, 400));
}

/* 去重 */
const byCompany = new Map();
for (const h of all) {
  if (!h.name || !h.cik) continue;
  const k = h.cik;
  const rec = byCompany.get(k) || { name: h.name, cik: h.cik, filings: [], forms: new Set(), terms: new Set(), latest: '' };
  rec.filings.push({ form: h.form, filed: h.filed });
  rec.forms.add(h.form);
  rec.terms.add(h.matched);
  if (h.filed > rec.latest) rec.latest = h.filed;
  byCompany.set(k, rec);
}
const companies = [...byCompany.values()]
  .map((c) => ({ name: c.name, cik: c.cik, forms: [...c.forms], terms: [...c.terms], filingCount: c.filings.length, latest: c.latest,
    sec_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' + c.cik }))
  .sort((a, b) => b.filingCount - a.filingCount);

console.log('\n  ── 结果 ──');
console.log('    原始命中 ' + all.length + ' 份 · 唯一公司 ' + companies.length + ' 家');

if (companies.length) {
  console.log('\n  公司清单（按命中文件数排序）：');
  console.log('  ' + '─'.repeat(94));
  for (const c of companies.slice(0, 45)) {
    console.log('  ' + c.name.slice(0, 42).padEnd(44) + c.forms.join('/').padEnd(8) +
      String(c.filingCount).padStart(3) + '份  ' + c.latest + '  ' + c.terms.slice(0, 2).join(', ').slice(0, 22));
  }
  console.log('  ' + '─'.repeat(94));
}

writeFileSync(join(OUT, 'non-us-mining-companies.json'), JSON.stringify({
  generated: new Date().toISOString(),
  source: 'SEC EDGAR 全文检索（20-F 外国私人发行人年报 / 40-F 加拿大发行人 / 6-K 外国发行人临时报告）',
  why: '外国公司在美国上市必须提交 20-F/40-F，因此 EDGAR 是现成的【非美国矿企名录】，比爬各国交易所落地页可靠',
  discipline: '只取 EDGAR 原文出现的公司名与 CIK；每个 CIK 可在 sec.gov 逐条核查；不做推断',
  byQuery,
  companies,
}, null, 2), 'utf8');

/* ── 与国家线索合并：标记哪些是新增的 ── */
const ledgerPath = join(ROOT, 'distribution', 'company-leads', 'sec-edgar-raw.json');
let existing = new Set();
if (existsSync(ledgerPath)) {
  const prev = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  existing = new Set((prev.companies || []).map((c) => c.cik));
}
const brandNew = companies.filter((c) => !existing.has(c.cik));
console.log('\n  ✅ 其中【全新公司】' + brandNew.length + ' 家（不在原有美国线索库中）');
console.log('     示例：');
for (const c of brandNew.slice(0, 20)) console.log('       ' + c.name.slice(0, 46).padEnd(48) + c.forms.join('/') + '  ' + c.latest);
console.log('\n  ✅ non-us-mining-companies.json\n');
