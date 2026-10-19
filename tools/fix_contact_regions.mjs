/**
 * 修正联系路径：EDGAR 国别代码 → 可读地区名；并诚实标注电话字段不可得
 *
 * SEC EDGAR 的国际地区代码（A0-A9 / B0 为加拿大各省）：
 *   A0 阿尔伯塔 · A1 不列颠哥伦比亚 · A2 曼尼托巴 · A3 新不伦瑞克 · A4 纽芬兰
 *   A5 新斯科舍 · A6 安大略 · A7 爱德华王子岛 · A8 魁北克 · A9 萨斯喀彻温 · B0 育空
 * 其余代码（T3/R5/D5/D8/X0/Y8 等）为其他国家/地区，需按实际推断或标为未知。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CL = join(ROOT, 'distribution', 'company-leads');
const G = join(CL, 'global');

const j = JSON.parse(readFileSync(join(G, 'contact-routes.json'), 'utf8'));
const nonus = JSON.parse(readFileSync(join(G, 'non-us-mining-companies.json'), 'utf8'));

/* EDGAR 国际地区代码 */
const EDGAR_CODE = {
  A0: ['Alberta', '加拿大'], A1: ['British Columbia', '加拿大'], A2: ['Manitoba', '加拿大'],
  A3: ['New Brunswick', '加拿大'], A4: ['Newfoundland', '加拿大'], A5: ['Nova Scotia', '加拿大'],
  A6: ['Ontario', '加拿大'], A7: ['Prince Edward Island', '加拿大'], A8: ['Quebec', '加拿大'],
  A9: ['Saskatchewan', '加拿大'], B0: ['Yukon', '加拿大'],
  L2: ['Ireland', '爱尔兰'], L3: ['Ireland', '爱尔兰'],
  X0: ['', '未知（EDGAR 代码 X0）'],
};

/* 非美公司的注册地参照表 */
const incByCik = new Map((nonus.companies || []).map((c) => [c.cik, c]));

let fixed = 0, unknown = 0;
for (const c of j.companies) {
  const code = String(c.state || '').trim();
  c.state_code = code || null;
  if (!code) { c.state_readable = null; c.country_resolved = c.country || null; continue; }
  if (/^[A-Z]{2}$/.test(code) && !/^[A-Z]\d$/.test(code)) {
    // 美国州代码（两位纯字母）
    c.state_readable = code; c.country_resolved = c.country || '美国'; continue;
  }
  if (EDGAR_CODE[code]) {
    const [region, country] = EDGAR_CODE[code];
    c.state_readable = region || null;
    c.country_resolved = country;
    fixed++;
  } else {
    // 用非美线索里的注册地兜底
    const ref = incByCik.get(c.cik);
    c.state_readable = null;
    c.country_resolved = ref?.incorporation || c.country || '未知（EDGAR 代码 ' + code + '）';
    unknown++;
  }
}

/* 重新按城市聚合 */
const byCity = {};
for (const c of j.companies) {
  if (!c.city) continue;
  const k = [c.city, c.state_readable, c.country_resolved].filter(Boolean).join(', ')
    .replace(/,\s*,/g, ',').replace(/,\s*$/, '');
  byCity[k] = (byCity[k] || 0) + 1;
}
const cities = Object.entries(byCity).sort((a, b) => b[1] - a[1]);
j.top_cities = cities.slice(0, 40);
j.state_code_fix = {
  fixed: fixed, unknown: unknown,
  note: 'SEC 用 EDGAR 国际地区代码（A0-A9/B0 = 加拿大各省，L2/L3 = 爱尔兰）。本表已映射为可读地区名。',
};
j.phone_note = 'SEC submissions API 已不再返回电话字段 —— 130 家全部无电话。要获得电话须查公司官网或年报封面，SEC 公开数据不含此字段。';
j.companies = j.companies;
writeFileSync(join(G, 'contact-routes.json'), JSON.stringify(j, null, 2), 'utf8');

console.log('\n  ── EDGAR 代码映射：修正 ' + fixed + ' 家 · 未知 ' + unknown + ' 家 ──\n');
console.log('  ── 客户最集中的城市（修正后）──');
for (const [c, n] of cities.slice(0, 22)) console.log('    ' + c.padEnd(42) + String(n).padStart(3) + ' 家');

/* ── CSV ── */
const csv = [['公司名','类型','线索等级','行业','城市','地区','国家','邮编','街道地址','SEC行业','财年结','曾用名','CIK','SEC核查'].join(',')];
for (const r of j.companies) {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  csv.push([q(String(r.name).replace(/\s*\(CIK.*$/, '')), q(r.kind), q(r.grade), q(r.industry), q(r.city),
    q(r.state_readable || r.state_code), q(r.country_resolved), q(r.zip), q(r.address), q(r.sic_desc),
    q(r.fiscal_year_end), q((r.former_names || []).join(' / ')), q(r.cik), q(r.sec_url)].join(','));
}
writeFileSync(join(G, 'contact-routes.csv'), csv.join('\n'), 'utf8');
console.log('\n  ✅ contact-routes.json / .csv（已修正地区代码）\n');
