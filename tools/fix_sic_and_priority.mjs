/**
 * 最终修正：SIC 码优先于 sicDescription（SEC 自身存在不匹配）+ 重算 priority
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const P = join(ROOT, 'distribution', 'company-leads');
const raw = JSON.parse(readFileSync(join(P, 'sec-edgar-raw.json'), 'utf8'));
const cos = raw.companies || [];

/* ── 完整 SIC 表（数字码是权威标准）── */
const SIC = {
  1011: '铁矿', 1021: '铜矿', 1031: '铅锌矿', 1041: '金矿', 1044: '银矿',
  1061: '铁合金/铬镍', 1081: '矿业服务', 1094: '铀矿', 1099: '金属矿-其他',
  1211: '煤炭-烟煤', 1220: '煤炭-烟煤露天', 1221: '煤炭-烟煤', 1222: '煤炭-亚烟煤',
  1231: '煤炭-无烟煤', 1241: '煤炭服务',
  1311: '油气', 1382: '油气服务', 1400: '采石',
  1442: '砂石骨料', 1474: '钾盐/硼砂', 1475: '磷酸盐', 1479: '化工矿',
  2810: '化工-工业无机', 2819: '化工-无机颜料', 2821: '化工-塑料',
  2869: '化工-工业有机', 2899: '化工-其他',
  3241: '水泥', 3274: '石灰', 3295: '研磨矿产品', 3297: '耐火材料',
  3330: '有色冶金', 3334: '铝冶炼', 3350: '有色金属轧制',
  3531: '工程机械', 3532: '矿山机械', 3533: '油气机械',
};
const RELEVANT = new Set(['金矿','银矿','铜矿','铅锌矿','铁矿','铀矿','镍矿','铁合金/铬镍','金属矿-其他','矿业服务',
  '煤炭-烟煤','煤炭-烟煤露天','煤炭-亚烟煤','煤炭-无烟煤','煤炭服务',
  '砂石骨料','水泥','石灰','研磨矿产品','化工矿','钾盐/硼砂','磷酸盐',
  '化工-工业无机','化工-其他','铝冶炼','有色冶金','矿山机械','工程机械','油气机械','采矿-其他','采石']);

let conflict = 0;
for (const c of cos) {
  const code = Number(c.sic);
  const byCode = SIC[code] || null;
  const desc = String(c.sic_desc || '').trim();
  // 描述兜底（仅当数字码不在表里）
  let byDesc = null;
  if (/gold/i.test(desc)) byDesc = '金矿';
  else if (/silver/i.test(desc)) byDesc = '银矿';
  else if (/copper/i.test(desc)) byDesc = '铜矿';
  else if (/lead|zinc/i.test(desc)) byDesc = '铅锌矿';
  else if (/iron/i.test(desc)) byDesc = '铁矿';
  else if (/uranium/i.test(desc)) byDesc = '铀矿';
  else if (/coal/i.test(desc)) byDesc = '煤炭';
  else if (/lime/i.test(desc)) byDesc = '石灰';
  else if (/cement/i.test(desc)) byDesc = '水泥';
  else if (/potash|soda|borate/i.test(desc)) byDesc = '钾盐/硼砂';
  else if (/phosphate|fertiliz/i.test(desc)) byDesc = '磷酸盐';
  else if (/mining|mineral|ore/i.test(desc)) byDesc = '采矿-其他';
  else if (/chemical/i.test(desc)) byDesc = '化工';
  else if (/oil|gas|petroleum/i.test(desc)) byDesc = '油气';
  else if (/construction|sand|gravel|aggregate/i.test(desc)) byDesc = '砂石骨料';
  else if (/machinery|equipment|trucks/i.test(desc)) byDesc = '机械';
  else if (code >= 1000 && code <= 1099) byDesc = '金属矿-其他';
  else if (code >= 1200 && code <= 1299) byDesc = '煤炭';
  else if (code >= 1400 && code <= 1499) byDesc = '采石';

  c.industry_final = byCode || byDesc || c.industry_v2 || '待人工判定';
  if (byCode && byDesc && byCode !== byDesc && !(byDesc === '煤炭' && byCode.startsWith('煤炭'))) {
    c.sic_conflict = 'SEC 的 sic 码(' + code + '=' + byCode + ') 与 sicDescription("' + desc + '") 不一致；以数字码为准';
    conflict++;
  }
  c.is_relevant = RELEVANT.has(c.industry_final);
}

/* ── 重算 priority（之前只存在于 python 脚本局部，没写回 JSON）── */
for (const c of cos) {
  let s = 0;
  const fc = c.filingCount || 0;
  s += fc >= 20 ? 40 : fc >= 10 ? 30 : fc >= 5 ? 20 : 10;
  const t = (c.terms || []).join(' ').toLowerCase();
  if (t.includes('cone crusher')) s += 30;
  if (t.includes('crushing circuit') || t.includes('crushing plant')) s += 15;
  if (t.includes('vibrating screen')) s += 10;
  if (t.includes('comminution')) s += 5;
  const lat = String(c.latest || '');
  if (lat >= '2026') s += 15; else if (lat >= '2025') s += 8;
  if (!c.is_relevant) s = Math.min(s, 30);   // 不相关的压到 30 以下
  c.priority = Math.min(100, s);
}

/* ── 重新分级 ── */
const STRONG = ['cone crusher','cone crushers','crushing circuit','crushing plant','comminution','vibrating screen'];
for (const c of cos) {
  const terms = (c.terms || []).map((t) => t.toLowerCase());
  c.strong_term_count = terms.filter((t) => STRONG.includes(t)).length;
  const fc = c.filingCount || 0;
  c.intensity = (c.strong_term_count >= 2 && fc >= 5) ? '强' : (c.strong_term_count >= 1 && fc >= 3) ? '中' : '弱';
  if (!c.is_relevant) c.lead_grade = 'D-剔除';
  else if (c.intensity === '强' || (c.intensity === '中' && fc >= 5)) c.lead_grade = 'A-重点';
  else if (c.intensity === '中' || fc >= 3) c.lead_grade = 'B-跟进';
  else c.lead_grade = 'C-观察';
}

const byG = {};
for (const c of cos) byG[c.lead_grade] = (byG[c.lead_grade] || 0) + 1;
console.log('\n  ── 最终分级 ──');
for (const g of ['A-重点','B-跟进','C-观察','D-剔除']) console.log('    ' + g.padEnd(10) + String(byG[g] || 0).padStart(4) + ' 家');
console.log('\n  SIC 码与描述冲突：' + conflict + ' 家（已按数字码处理并记录）');

const qual = cos.filter((c) => c.lead_grade === 'A-重点' || c.lead_grade === 'B-跟进').sort((a, b) => b.priority - a.priority);
console.log('\n  ── 合格线索 ' + qual.length + ' 家（A+B）──');
console.log('  ' + '─'.repeat(88));
for (const c of qual.slice(0, 30)) {
  console.log('  ' + c.lead_grade.padEnd(7) + String(c.priority).padStart(3) + '  ' +
    String(c.company).replace(/\s*\(CIK.*$/, '').slice(0, 40).padEnd(42) +
    String(c.industry_final).padEnd(14) + String(c.filingCount).padStart(3) + '份 ' + c.intensity);
}
if (qual.length > 30) console.log('  … 另 ' + (qual.length - 30) + ' 家');
console.log('  ' + '─'.repeat(88));

raw.companies = cos;
raw.sic_note = 'SEC 的 sic（数字码）与 sicDescription 偶有不一致（如 sic=1220 烟煤却标 Silver Ores）。本表以数字码为准，冲突已记入 sic_conflict 字段。';
writeFileSync(join(P, 'sec-edgar-raw.json'), JSON.stringify(raw, null, 2), 'utf8');

const head = ['线索等级','优先级','公司名','行业(SIC数字码判定)','SIC码','SEC描述','强度','强词数','命中文件','最新申报','CIK','采购进入路径'];
const rows = [head.join(',')];
for (const c of qual) {
  rows.push([c.lead_grade, c.priority, '"' + String(c.company).replace(/"/g, '""') + '"', c.industry_final,
    c.sic || '', '"' + (c.sic_desc || '') + '"', c.intensity, c.strong_term_count, c.filingCount, c.latest, c.cik || '',
    '"' + String(c.route || '').replace(/"/g, '""') + '"'].join(','));
}
writeFileSync(join(P, 'qualified-leads.csv'), rows.join('\n'), 'utf8');
console.log('\n  ✅ qualified-leads.csv（' + qual.length + ' 家）');
console.log('  ✅ 已重算 priority 并写回 raw.json');
console.log('');
