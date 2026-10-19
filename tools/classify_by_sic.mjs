/**
 * 用 SEC 官方 SIC 代码给 111 家公司做权威行业分类（修正版）
 *
 * 上一版的 bug：cik 字段是空字符串 —— 因为 EDGAR 全文检索返回的 CIK
 * 被我的 extract() 写错了，实际 CIK 藏在公司名字符串里：
 *   "NEWMONT Corp /DE/  (NEM, NEMCL)  (CIK 0001164727)"
 * 本版从公司名里正则提取 CIK，并加失败重试。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const LEADS = join(ROOT, 'distribution', 'company-leads', 'sec-edgar-raw.json');
const raw = JSON.parse(readFileSync(LEADS, 'utf8'));
const companies = raw.companies || [];

/* ── 从公司名里提取 CIK ── */
let fixed = 0;
for (const c of companies) {
  const m = String(c.company || '').match(/\(CIK\s+(\d+)\)/i);
  if (m) { c.cik = m[1].padStart(10, '0'); fixed++; }
}
console.log('\n  从公司名补回 CIK：' + fixed + ' / ' + companies.length);

const SIC_MAP = {
  1011: '铁矿', 1021: '铜矿', 1031: '铅锌矿', 1041: '金矿', 1044: '银矿',
  1061: '铁合金/铬镍', 1081: '矿业服务', 1094: '铀矿', 1099: '金属矿-其他',
  1221: '煤炭-烟煤', 1222: '煤炭-亚烟煤', 1231: '煤炭-无烟煤', 1241: '煤炭服务',
  1311: '油气', 1382: '油气服务', 1442: '砂石骨料', 1474: '钾盐/硼砂',
  1475: '磷酸盐', 1479: '化工矿', 2810: '化工-工业无机', 2819: '化工-无机颜料',
  2821: '化工-塑料', 2869: '化工-工业有机', 2899: '化工-其他',
  3241: '水泥', 3274: '石灰', 3295: '研磨矿产品', 3297: '耐火材料',
  3330: '有色冶金', 3334: '铝冶炼', 3350: '有色金属轧制',
  3531: '工程机械', 3532: '矿山机械', 3533: '油气机械',
};
const sicLabel = (desc, code) => {
  const c = Number(code);
  if (SIC_MAP[c]) return SIC_MAP[c];
  const d = String(desc || '');
  if (/gold/i.test(d)) return '金矿';
  if (/silver/i.test(d)) return '银矿';
  if (/copper/i.test(d)) return '铜矿';
  if (/lead|zinc/i.test(d)) return '铅锌矿';
  if (/iron/i.test(d)) return '铁矿';
  if (/uranium/i.test(d)) return '铀矿';
  if (/nickel/i.test(d)) return '镍矿';
  if (/coal/i.test(d)) return '煤炭';
  if (/lime/i.test(d)) return '石灰';
  if (/cement/i.test(d)) return '水泥';
  if (/potash|soda|borate/i.test(d)) return '钾盐/硼砂';
  if (/phosphate|fertilizer/i.test(d)) return '磷酸盐/化肥';
  if (/chemical/i.test(d)) return '化工';
  if (/mining|mineral|ore/i.test(d)) return '采矿-其他';
  if (/oil|gas|petroleum/i.test(d)) return '油气';
  if (/construction|sand|gravel|stone|aggregate/i.test(d)) return '砂石骨料';
  if (/machinery|equipment/i.test(d)) return '机械';
  if (c >= 1000 && c <= 1099) return '金属矿-其他';
  if (c >= 1200 && c <= 1299) return '煤炭';
  if (c >= 1400 && c <= 1499) return '采矿/采石';
  return '其他（' + (desc || c) + '）';
};

const H = { 'User-Agent': 'MACKORN Research leif.dai@mackorn.cn', 'Accept': 'application/json' };
async function getSic(cik) {
  const url = 'https://data.sec.gov/submissions/CIK' + cik + '.json';
  for (let i = 1; i <= 3; i++) {
    const c = new AbortController(); const id = setTimeout(() => c.abort(), 30000);
    try {
      const r = await fetch(url, { headers: H, signal: c.signal });
      clearTimeout(id);
      if (r.status === 404) return { notFound: true };
      if (!r.ok) { if (i === 3) return null; await new Promise((s) => setTimeout(s, 800 * i)); continue; }
      const j = await r.json();
      return { sic: j.sic, desc: j.sicDescription, name: j.name, state: j.stateOfIncorporation, fiscal: j.fiscalYearEnd };
    } catch (e) {
      clearTimeout(id);
      if (i === 3) return null;
      await new Promise((s) => setTimeout(s, 900 * i));
    }
  }
  return null;
}

let ok = 0, nf = 0, bad = 0;
for (let i = 0; i < companies.length; i++) {
  const co = companies[i];
  if (!co.cik) { co.sic_label = co.industry_v2 || '待人工判定'; bad++; continue; }
  const s = await getSic(co.cik);
  if (s && s.notFound) { co.sic_label = co.industry_v2 || '待人工判定'; co.sic_note = 'SEC 无此 CIK 记录'; nf++; }
  else if (s) { co.sic = s.sic; co.sic_desc = s.desc; co.sic_label = sicLabel(s.desc, s.sic); co.inc_state = s.state; ok++; }
  else { co.sic_label = co.industry_v2 || '待人工判定'; co.sic_note = '取数失败'; bad++; }
  if ((i + 1) % 25 === 0) process.stdout.write('  ... ' + (i + 1) + '/' + companies.length + '\r');
  await new Promise((r) => setTimeout(r, 120));
}
console.log('  结果：成功 ' + ok + ' · 404 ' + nf + ' · 失败 ' + bad + '\n');

const by = {};
for (const c of companies) by[c.sic_label || '未分类'] = (by[c.sic_label || '未分类'] || 0) + 1;
console.log('  ── 按 SEC 官方 SIC 分类 ──');
for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
  console.log('    ' + String(k).padEnd(20) + String(v).padStart(4) + ' 家');
}

for (const c of companies) c.industry_final = c.sic_label || c.industry_v2 || '待人工判定';
raw.companies = companies;
raw.classification_note = 'industry_final 由 SEC 官方 SIC 代码判定（SIC = 美国标准行业分类，公司向 SEC 申报）。可到 https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=<CIK> 核查。';
raw.classified_at = new Date().toISOString();
writeFileSync(LEADS, JSON.stringify(raw, null, 2), 'utf8');

const rows = [['优先级', '公司名', 'SEC行业(SIC)', 'SIC码', '命中文件数', '最新申报', '注册州', 'CIK']];
for (const c of companies.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0))) {
  rows.push([c.priority, '"' + String(c.company).replace(/"/g, '""') + '"', '"' + (c.sic_desc || '') + '"', c.sic || '', c.filingCount, c.latest, c.inc_state || '', c.cik || '']);
}
writeFileSync(join(ROOT, 'distribution', 'company-leads', 'company-leads-sic.csv'), rows.map((r) => r.join(',')).join('\n'), 'utf8');
console.log('\n  ✅ 已写回 sec-edgar-raw.json + 导出 company-leads-sic.csv');
console.log('  待人工判定剩余：' + (by['待人工判定'] || 0) + ' 家\n');
