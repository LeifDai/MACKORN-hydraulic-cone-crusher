/**
 * 从 SEC submissions 提取 130 家公司的联系路径
 *
 * 用户原话：「有哪些案例，有数据，有客户名称；能有联系人得更好，
 *            如果没有，只要客户质量套，我们往前冲就没有问题」
 *
 * SEC 申报的封面页与 submissions API 含有：
 *   · 公司总部地址（street / city / state / zip）
 *   · 电话
 *   · 所在城市（决定服务半径与拜访路线）
 *   · 前身名与曾用名（并购整合线索）
 *
 * 纪律：只取 SEC 官方字段；不编造姓名与邮箱；每条可核查。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CL = join(ROOT, 'distribution', 'company-leads');
const G = join(CL, 'global');
mkdirSync(G, { recursive: true });

const load = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const us = load(join(CL, 'sec-edgar-raw.json'), { companies: [] }).companies.filter((c) => c.lead_grade === 'A-重点' || c.lead_grade === 'B-跟进');
const nonus = load(join(G, 'non-us-mining-companies.json'), { companies: [] }).companies;

const H = { 'User-Agent': 'MACKORN Research leif.dai@mackorn.cn', 'Accept': 'application/json' };

async function getSub(cik) {
  for (let i = 1; i <= 3; i++) {
    const c = new AbortController(); const id = setTimeout(() => c.abort(), 25000);
    try {
      const r = await fetch('https://data.sec.gov/submissions/CIK' + cik + '.json', { headers: H, signal: c.signal });
      clearTimeout(id);
      if (!r.ok) { if (i === 3) return null; await new Promise((s) => setTimeout(s, 500)); continue; }
      return await r.json();
    } catch { clearTimeout(id); if (i === 3) return null; await new Promise((s) => setTimeout(s, 500)); }
  }
  return null;
}

const all = [
  ...us.map((c) => ({ name: c.company, cik: c.cik, kind: '美国上市', grade: c.lead_grade, industry: c.industry_final })),
  ...nonus.map((c) => ({ name: c.name, cik: c.cik, kind: '外国私人发行人', grade: '', industry: c.sic_desc,
    forms: c.forms, operating: c.operating_region_manual || '' })),
];
console.log('\n  待取联系路径 ' + all.length + ' 家（美国 ' + us.length + ' + 非美 ' + nonus.length + '）\n');

let ok = 0;
const out = [];
for (let i = 0; i < all.length; i++) {
  const co = all[i];
  const s = await getSub(co.cik);
  const rec = {
    name: co.name, cik: co.cik, kind: co.kind, grade: co.grade || '', industry: co.industry || '',
    forms: co.forms || null, operating_region: co.operating || null,
    sic: null, sic_desc: null,
    address: null, city: null, state: null, zip: null, phone: null, country: null,
    former_names: [], fiscal_year_end: null,
    sec_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' + co.cik,
    edgar_search: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' + co.cik + '&type=10-K&dateb=&owner=include&count=40',
  };
  if (s) {
    ok++;
    const b = s.addresses?.business || {};
    rec.sic = s.sic; rec.sic_desc = s.sicDescription;
    rec.address = b.street1 || b.street2 || null;
    rec.city = b.city || null;
    rec.state = b.stateOrCountry || null;
    rec.zip = b.zipCode || null;
    rec.phone = b.phone || null;
    rec.country = b.country || null;
    rec.former_names = (s.formerNames || []).map((x) => x.name).filter(Boolean).slice(0, 3);
    rec.fiscal_year_end = s.fiscalYearEnd || null;
  }
  out.push(rec);
  if ((i + 1) % 15 === 0) process.stdout.write('  ... ' + (i + 1) + '/' + all.length + '  成功 ' + ok + '\r');
  await new Promise((r) => setTimeout(r, 120));
}
console.log('  完成：成功 ' + ok + ' / ' + all.length + '（有地址 ' + out.filter((r) => r.city).length + ' · 有电话 ' + out.filter((r) => r.phone).length + '）\n');

/* ── 按城市聚合：拜访路线 ── */
const byCity = {};
for (const r of out) {
  if (!r.city) continue;
  const k = [r.city, r.state, r.country].filter(Boolean).join(', ');
  byCity[k] = (byCity[k] || 0) + 1;
}
const cities = Object.entries(byCity).sort((a, b) => b[1] - a[1]);
console.log('  ── 客户最集中的城市（拜访路线规划用）──');
for (const [c, n] of cities.slice(0, 30)) console.log('    ' + c.padEnd(38) + String(n).padStart(3) + ' 家');

console.log('\n  ── 有电话的（可直接致电）前 25 ──');
console.log('  ' + '─'.repeat(94));
for (const r of out.filter((x) => x.phone).slice(0, 25)) {
  console.log('  ' + String(r.name).replace(/\s*\(.*$/, '').slice(0, 34).padEnd(36) +
    String(r.phone).padEnd(18) + [r.city, r.state].filter(Boolean).join(', ').slice(0, 30));
}
console.log('  ' + '─'.repeat(94));

/* ── 有曾用名的（并购整合线索）── */
const withFormer = out.filter((r) => r.former_names.length);
console.log('\n  ── 有曾用名的（并购/更名线索）' + withFormer.length + ' 家 ──');
for (const r of withFormer.slice(0, 15)) {
  console.log('    ' + String(r.name).replace(/\s*\(.*$/, '').slice(0, 36).padEnd(38) + '← ' + r.former_names.join(' / '));
}

writeFileSync(join(G, 'contact-routes.json'), JSON.stringify({
  generated: new Date().toISOString(),
  source: 'SEC EDGAR submissions API（data.sec.gov）—— 公司向 SEC 申报的总部地址与电话',
  discipline: '只取 SEC 官方字段；不含个人姓名与邮箱（SEC 不公开这些）；每家附 CIK 核查链接；不编造',
  note: '这是【公司级】联系路径，不是个人联系人。要找到具体采购负责人，须通过官网、LinkedIn、展会或电话转接。',
  stats: { total: out.length, with_address: out.filter((r) => r.city).length, with_phone: out.filter((r) => r.phone).length, with_former_names: withFormer.length },
  top_cities: cities.slice(0, 40),
  companies: out,
}, null, 2), 'utf8');

/* ── CSV ── */
const csv = [['公司名','类型','线索等级','行业','城市','州/国','邮编','地址','电话','SEC行业','财年结','曾用名','CIK','SEC核查'].join(',')];
for (const r of out) {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  csv.push([q(r.name), q(r.kind), q(r.grade), q(r.industry), q(r.city), q(r.state), q(r.zip), q(r.address),
    q(r.phone), q(r.sic_desc), q(r.fiscal_year_end), q(r.former_names.join(' / ')), q(r.cik), q(r.sec_url)].join(','));
}
writeFileSync(join(G, 'contact-routes.csv'), csv.join('\n'), 'utf8');

console.log('\n  ✅ contact-routes.json / .csv');
console.log('     ' + out.length + ' 家 · 有地址 ' + out.filter((r) => r.city).length + ' · 有电话 ' + out.filter((r) => r.phone).length + ' · 有曾用名 ' + withFormer.length + '\n');
