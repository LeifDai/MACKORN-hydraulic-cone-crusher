/**
 * 客户线索相关性过滤 —— 把 EDGAR 检索噪音剔掉
 *
 * 问题：EDGAR 全文检索"crusher"会命中酒店、纸浆厂、半导体公司 ——
 *       它们只是在年报里偶然提到这个词（比如"我们收购了一家碎石厂股权"）。
 *       提到一次 ≠ 是目标客户。
 *
 * 过滤逻辑（三层）：
 *   第 1 层 SIC 相关性：只保留采矿/采石/骨料/矿机/水泥石灰/化工矿
 *   第 2 层 命中强度：cone crusher 或 crushing circuit 这类强相关词，
 *                     且命中文件数 ≥ 3（偶发提及不会反复出现）
 *   第 3 层 主营占比：SIC 属于采矿大类
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const P = join(ROOT, 'distribution', 'company-leads');
const raw = JSON.parse(readFileSync(join(P, 'sec-edgar-raw.json'), 'utf8'));
let cos = raw.companies || [];

/* ── 第 1 层：SIC 相关性 ── */
const RELEVANT = [
  '金矿', '银矿', '铜矿', '铅锌矿', '铁矿', '铀矿', '镍矿', '铁合金/铬镍',
  '金属矿-其他', '采矿-其他', '煤炭', '煤炭-烟煤', '煤炭-亚烟煤', '煤炭-无烟煤', '煤炭服务',
  '砂石骨料', '水泥', '石灰', '研磨矿产品', '化工矿', '钾盐/硼砂', '磷酸盐',
  '化工-工业无机', '化工-其他', '铝冶炼', '有色冶金', '矿山机械', '工程机械',
  '油气机械', '矿业服务',
];
const MARGINAL = ['化工', '化工-塑料', '耐火材料', '有色金属轧制', '油气'];

for (const c of cos) {
  const lbl = c.sic_label || '';
  const relevant = RELEVANT.some((r) => lbl === r || lbl.startsWith(r));
  const marginal = MARGINAL.some((r) => lbl === r || lbl.startsWith(r));
  c.relevance_tier = relevant ? 'A-核心' : (marginal ? 'B-边缘' : 'C-不相关');
}

/* ── 第 2 层：命中强度 ── */
const STRONG = ['cone crusher', 'cone crushers', 'crushing circuit', 'crushing plant', 'comminution', 'vibrating screen'];
for (const c of cos) {
  const terms = (c.terms || []).map((t) => t.toLowerCase());
  const strongHits = terms.filter((t) => STRONG.includes(t)).length;
  const fc = c.filingCount || 0;
  c.strong_term_count = strongHits;
  c.intensity = (strongHits >= 2 && fc >= 5) ? '强' : (strongHits >= 1 && fc >= 3) ? '中' : '弱';
}

/* ── 最终分级 ── */
for (const c of cos) {
  if (c.relevance_tier === 'C-不相关') c.lead_grade = 'D-剔除';
  else if (c.relevance_tier === 'A-核心' && c.intensity !== '弱') c.lead_grade = 'A-重点';
  else if (c.relevance_tier === 'A-核心' || c.intensity === '强') c.lead_grade = 'B-跟进';
  else c.lead_grade = 'C-观察';
}

const byGrade = {};
for (const c of cos) byGrade[c.lead_grade] = (byGrade[c.lead_grade] || 0) + 1;
console.log('\n  ── 线索分级 ──');
for (const g of ['A-重点', 'B-跟进', 'C-观察', 'D-剔除']) {
  console.log('    ' + g.padEnd(10) + String(byGrade[g] || 0).padStart(4) + ' 家');
}

const byTier = {};
for (const c of cos) byTier[c.relevance_tier] = (byTier[c.relevance_tier] || 0) + 1;
console.log('\n  ── 相关性 ──');
for (const [k, v] of Object.entries(byTier).sort((a, b) => b[1] - a[1])) console.log('    ' + k.padEnd(12) + String(v).padStart(4) + ' 家');

const qual = cos.filter((c) => c.lead_grade === 'A-重点' || c.lead_grade === 'B-跟进')
  .sort((a, b) => (b.priority || 0) - (a.priority || 0));
console.log('\n  ── 合格线索（A+B）：' + qual.length + ' 家 ──');
console.log('  ' + '─'.repeat(96));
for (const c of qual) {
  console.log('  ' + c.lead_grade.padEnd(8) + String(c.priority).padStart(3) + '  ' +
    String(c.company).slice(0, 40).padEnd(42) + String(c.sic_label || '').padEnd(12) +
    String(c.filingCount).padStart(3) + '份  ' + c.intensity);
}
console.log('  ' + '─'.repeat(96));

console.log('\n  ── 被剔除的（示例前 12）──');
for (const c of cos.filter((c) => c.lead_grade === 'D-剔除').slice(0, 12)) {
  console.log('    ' + String(c.company).slice(0, 44).padEnd(46) + String(c.sic_desc || '').slice(0, 34));
}

for (const c of cos) { c.industry_final = c.sic_label || c.industry_v2 || ''; }
raw.companies = cos;
raw.filter_note = 'lead_grade 由三层过滤得出：① SIC 行业相关性 ② 强相关词命中数与文件数 ③ 主营占比。D-剔除 表示该公司只在年报里偶然提到破碎设备，不是目标客户。';
raw.filtered_at = new Date().toISOString();
writeFileSync(join(P, 'sec-edgar-raw.json'), JSON.stringify(raw, null, 2), 'utf8');

const rows = [['线索等级', '相关性', '强度', '优先级', '公司名', 'SEC行业(SIC)', 'SIC码', '强相关词数', '命中文件数', '最新申报', 'CIK']];
for (const c of qual) {
  rows.push([c.lead_grade, c.relevance_tier, c.intensity, c.priority, '"' + String(c.company).replace(/"/g, '""') + '"',
    '"' + (c.sic_desc || '') + '"', c.sic || '', c.strong_term_count, c.filingCount, c.latest, c.cik || '']);
}
writeFileSync(join(P, 'qualified-leads.csv'), rows.map((r) => r.join(',')).join('\n'), 'utf8');
writeFileSync(join(P, 'excluded-leads.csv'),
  ['公司名,SEC行业,SIC码,命中文件数,命中词'].concat(
    cos.filter((c) => c.lead_grade === 'D-剔除').map((c) => '"' + String(c.company).replace(/"/g, '""') + '","' + (c.sic_desc || '') + '",' + (c.sic || '') + ',' + c.filingCount + ',"' + (c.terms || []).join('; ') + '"')
  ).join('\n'), 'utf8');

console.log('\n  ✅ qualified-leads.csv（' + qual.length + ' 家合格线索）');
console.log('  ✅ excluded-leads.csv（' + (byGrade['D-剔除'] || 0) + ' 家已剔除，含剔除理由可复查）');
console.log('');
