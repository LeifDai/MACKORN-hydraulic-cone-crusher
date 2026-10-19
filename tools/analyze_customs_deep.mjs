/**
 * R6 · 海关数据深度分析
 *
 * 分析维度：
 *   ① 三年趋势与 CAGR（2021→2023）
 *   ② 产品结构演变（破碎 / 筛分 / 零件 占比变化）
 *   ③ 新兴市场识别 —— 带【基数效应修正】（小基数高增长是噪声，必须校正）
 *   ④ 市场集中度（HHI / CR4）与碎片化判断
 *   ⑤ 备件市场 vs 整机市场（备件占比高的国家 = 存量市场，卖衬板）
 *
 * 数据源：UN Comtrade（HS 847410 筛分 / 847420 破碎 / 847490 零件，进口）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const trade = JSON.parse(readFileSync(join(D, '02_数据与分析', 'trade-global.json'), 'utf8'));

const YEARS = ['2021', '2022', '2023'];
const rows = [];
for (const [, c] of Object.entries(trade.countries)) {
  const g = (hs, y) => { const h = c.hs && c.hs[hs]; return h && h.years && h.years[y] && Number.isFinite(h.years[y].usd) ? h.years[y].usd : null; };
  const val = (y) => { const a = ['847420', '847410', '847490'].map((hs) => g(hs, y)); return a.some((x) => x != null) ? a.reduce((s, x) => s + (x || 0), 0) : null; };
  const v = YEARS.map(val);
  if (v.every((x) => x == null)) continue;
  rows.push({
    zh: c.zh, en: c.en,
    y2021: v[0], y2022: v[1], y2023: v[2],
    crusher: g('847420', '2023'), screen: g('847410', '2023'), parts: g('847490', '2023'),
    crusher21: g('847420', '2021'), screen21: g('847410', '2021'), parts21: g('847490', '2021'),
  });
}

const f1 = (x) => (x == null ? '—' : (x / 1e6).toFixed(1));

/* ── ① CAGR ── */
for (const r of rows) {
  const a = r.y2021, b = r.y2023;
  r.cagr = (a && b && a > 0) ? (Math.pow(b / a, 0.5) - 1) * 100 : null;
  r.abs_delta = (a != null && b != null) ? b - a : null;
}

/* ── ② 产品结构 ── */
for (const r of rows) {
  const t23 = (r.crusher || 0) + (r.screen || 0) + (r.parts || 0);
  const t21 = (r.crusher21 || 0) + (r.screen21 || 0) + (r.parts21 || 0);
  r.parts_share_23 = t23 > 0 ? (r.parts || 0) / t23 * 100 : null;
  r.parts_share_21 = t21 > 0 ? (r.parts21 || 0) / t21 * 100 : null;
  r.parts_share_shift = (r.parts_share_23 != null && r.parts_share_21 != null) ? r.parts_share_23 - r.parts_share_21 : null;
  r.screen_crusher_ratio = (r.crusher && r.screen) ? r.screen / r.crusher : null;
}

/* ── ③ 新兴市场：基数效应修正 ──
 * 小基数高增长是噪声。修正方法：
 *   要求 2023 绝对值 ≥ 阈值（$20M）才算"显著市场"
 *   同时给出"绝对增量"排序 —— 这比百分比更有决策价值
 */
const SIGNIFICANT = 2e7;
const emerging = rows.filter((r) => r.y2021 != null && r.y2023 != null && r.y2021 > 0 && r.y2023 >= SIGNIFICANT && r.cagr > 15)
  .sort((a, b) => b.cagr - a.cagr);
const byAbsDelta = rows.filter((r) => r.abs_delta != null).sort((a, b) => b.abs_delta - a.abs_delta);

/* ── ④ 集中度 ── */
const sorted = rows.slice().sort((a, b) => (b.y2023 || 0) - (a.y2023 || 0));
const total = sorted.reduce((s, r) => s + (r.y2023 || 0), 0);
const hhi = sorted.reduce((s, r) => s + Math.pow((r.y2023 || 0) / total * 100, 2), 0);
const cr4 = sorted.slice(0, 4).reduce((s, r) => s + (r.y2023 || 0), 0) / total * 100;
const cr10 = sorted.slice(0, 10).reduce((s, r) => s + (r.y2023 || 0), 0) / total * 100;
/* Gini */
let gini = 0;
const n = sorted.length;
const cum = [];
let acc = 0;
for (const r of sorted.slice().sort((a, b) => (a.y2023 || 0) - (b.y2023 || 0))) { acc += (r.y2023 || 0); cum.push(acc); }
const sumCum = cum.reduce((s, x) => s + x, 0);
gini = (n + 1 - 2 * sumCum / (cum[cum.length - 1] || 1)) / n;

/* ── ⑤ 备件市场 ── */
const partsLed = rows.filter((r) => r.parts_share_23 != null && r.parts_share_23 >= 60 && (r.y2023 || 0) >= SIGNF(1e7))
  .sort((a, b) => (b.parts_share_23 || 0) - (a.parts_share_23 || 0));
function SIGNF(x) { return x; }

console.log('\n' + '═'.repeat(96));
console.log('  R6 · 海关数据深度分析（UN Comtrade，HS 847410 / 847420 / 847490 进口）');
console.log('═'.repeat(96));

console.log('\n  ── ① 全球总量与集中度 ──');
console.log('    2023 全球合计      : US$' + (total / 1e9).toFixed(2) + ' B（' + rows.length + ' 个报告国）');
console.log('    CR4 / CR10         : ' + cr4.toFixed(1) + '% / ' + cr10.toFixed(1) + '%');
console.log('    HHI                : ' + hhi.toFixed(0) + '  (' + (hhi < 1500 ? '竞争型/分散' : hhi < 2500 ? '中等集中' : '高度集中') + ')');
console.log('    Gini               : ' + gini.toFixed(3));

console.log('\n  ── ② 绝对增量最大的 15 国（比百分比更有决策价值）──');
console.log('  ' + '─'.repeat(92));
console.log('  ' + '国家'.padEnd(16) + '2021'.padStart(10) + '2023'.padStart(10) + '增量'.padStart(11) + 'CAGR'.padStart(9) + '  备件占比');
for (const r of byAbsDelta.slice(0, 15)) {
  console.log('  ' + String(r.zh).slice(0, 14).padEnd(16) + f1(r.y2021).padStart(10) + f1(r.y2023).padStart(10)
    + ((r.abs_delta >= 0 ? '+' : '') + f1(r.abs_delta)).padStart(11)
    + ((r.cagr == null ? '—' : r.cagr.toFixed(1) + '%')).padStart(9)
    + '  ' + (r.parts_share_23 == null ? '—' : r.parts_share_23.toFixed(0) + '%'));
}

console.log('\n  ── ③ 新兴市场（2023 ≥ US$20M 且 CAGR > 15%，已做基数效应过滤）──');
if (!emerging.length) console.log('    （无符合条件者）');
else {
  console.log('  ' + '─'.repeat(92));
  console.log('  ' + '国家'.padEnd(16) + '2021'.padStart(10) + '2023'.padStart(10) + '增量'.padStart(11) + 'CAGR'.padStart(9) + '  判断');
  for (const r of emerging.slice(0, 15)) {
    const note = r.abs_delta > 5e7 ? '强信号（增量大）' : r.abs_delta > 1e7 ? '可跟进' : '基数小，须谨慎';
    console.log('  ' + String(r.zh).slice(0, 14).padEnd(16) + f1(r.y2021).padStart(10) + f1(r.y2023).padStart(10)
      + ('+' + f1(r.abs_delta)).padStart(11) + (r.cagr.toFixed(1) + '%').padStart(9) + '  ' + note);
  }
}

console.log('\n  ── ④ 备件主导市场（备件占比 ≥60% 且总额 ≥ US$10M）＝ 存量市场，主推衬板 ──');
console.log('  ' + '─'.repeat(92));
for (const r of partsLed.slice(0, 15)) {
  console.log('  ' + String(r.zh).slice(0, 14).padEnd(16) + f1(r.y2023).padStart(10) + 'M   备件 ' + r.parts_share_23.toFixed(0) + '%'
    + '   21年 ' + (r.parts_share_21 == null ? '—' : r.parts_share_21.toFixed(0) + '%')
    + '   变化 ' + (r.parts_share_shift == null ? '—' : (r.parts_share_shift >= 0 ? '+' : '') + r.parts_share_shift.toFixed(1) + 'pp'));
}

console.log('\n  ── ⑤ 整机主导市场（备件占比 <40%）＝ 新增产能市场，主推整机 ──');
const machineLed = rows.filter((r) => r.parts_share_23 != null && r.parts_share_23 < 40 && (r.y2023 || 0) >= 2e7)
  .sort((a, b) => (b.y2023 || 0) - (a.y2023 || 0));
console.log('  ' + '─'.repeat(92));
for (const r of machineLed.slice(0, 15)) {
  console.log('  ' + String(r.zh).slice(0, 14).padEnd(16) + f1(r.y2023).padStart(10) + 'M   备件仅 ' + r.parts_share_23.toFixed(0) + '%'
    + '   筛/破比 ' + (r.screen_crusher_ratio == null ? '—' : r.screen_crusher_ratio.toFixed(2)));
}

/* ── 写文件 ── */
const out = {
  generated: new Date().toISOString(),
  source: 'UN Comtrade (HS 847410 screening / 847420 crushing / 847490 parts, import flow, partner World)',
  caveats: [
    '这是国家统计，不是公司级数据 —— 要定位买家必须用公司线索（SEC EDGAR）',
    '2023 年部分国家未申报，本表以最新可得年份为准，缺失处标 —',
    '"进口额"含贸易商与再出口，不等于终端用户的采购额',
    '新兴市场已做基数效应过滤（要求 2023 ≥ US$20M），否则小基数会产生虚高增长率',
  ],
  global: { total_2023_usd: total, reporters: rows.length, cr4_pct: cr4, cr10_pct: cr10, hhi, gini },
  by_absolute_delta: byAbsDelta.slice(0, 40),
  emerging: emerging.slice(0, 25),
  parts_led: partsLed.slice(0, 25),
  machine_led: machineLed.slice(0, 25),
  all: rows.sort((a, b) => (b.y2023 || 0) - (a.y2023 || 0)),
};
writeFileSync(join(D, '02_数据与分析', 'customs-deep-analysis.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('\n  ✅ customs-deep-analysis.json\n');
