/**
 * 修复国家键重复 + 出"破碎机 + 筛子"完整合并分析
 *
 * 问题：原库用 M49 数字码（860=乌兹别克斯坦），补抓脚本按 ISO3（UZB）新建条目，
 *       导致同一国家的筛分数据与破碎数据分家。
 * 修法：把 ISO3 键下的 hs 合并进对应 M49 键，删除重复条目。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DB = join(ROOT, 'distribution', 'trade-global.json');
const OUT = join(ROOT, 'distribution', 'trade-raw');
mkdirSync(OUT, { recursive: true });

const M49 = { UZB: 860, KAZ: 398, AUS: 36, IDN: 360, CAN: 124, COD: 180, DEU: 276, GBR: 826,
  IND: 699, ZAF: 710, SAU: 682, CHL: 152, PER: 604, BRA: 76, MEX: 484, PHL: 608, VNM: 704,
  COL: 170, TUR: 792, MAR: 504, ZWE: 716, KEN: 404, LAO: 418, MLI: 466, GHA: 288, ZMB: 894,
  TZA: 834, NGA: 566, EGY: 818, ARG: 32, MNG: 496, PAK: 586, THA: 764, MYS: 458, SWE: 752,
  FIN: 246, NOR: 578, POL: 616, ESP: 724, ITA: 380, FRA: 251, RUS: 643, PAN: 591, PNG: 598,
  SEN: 686, BFA: 854, GIN: 324, NAM: 516, BWA: 72, MOZ: 508, MDG: 450, NPL: 524, LKA: 144,
  MMR: 104, KHM: 116 };

const db = JSON.parse(readFileSync(DB, 'utf8'));
db.countries ||= {};

/* ── ① 合并 ISO3 键 → M49 键 ── */
let merged = 0, removed = 0;
for (const [iso, code] of Object.entries(M49)) {
  const src = db.countries[iso];
  if (!src || !src.hs) continue;
  const key = String(code);
  const dst = db.countries[key];
  if (dst) {
    dst.hs ||= {};
    for (const [hs, v] of Object.entries(src.hs)) {
      if (!dst.hs[hs]) { dst.hs[hs] = v; merged++; }
      else if (dst.hs[hs].years && v.years) {
        for (const [y, yv] of Object.entries(v.years)) if (yv?.usd && !dst.hs[hs].years[y]?.usd) { dst.hs[hs].years[y] = yv; merged++; }
      }
    }
    if (!dst.zh && src.zh) dst.zh = src.zh;
    delete db.countries[iso];
    removed++;
  } else {
    db.countries[key] = { ...src, code };
    delete db.countries[iso];
    merged++; removed++;
  }
}
writeFileSync(DB, JSON.stringify(db, null, 2), 'utf8');
console.log('  ✅ 已合并 ' + merged + ' 条 HS 记录，清除 ' + removed + ' 个重复国家键');

/* ── ② 校验：每个国家两种数据都在同一个键下 ── */
const chk = ['860', '398', '36', '124', '716', '496'];
console.log('\n  校验（键 → 有什么 HS）');
for (const k of chk) {
  const c = db.countries[k];
  if (c) console.log('    ' + k.padStart(4) + ' ' + String(c.zh || '').padEnd(12) + JSON.stringify(Object.keys(c.hs || {})));
}

/* ── ③ 完整合并分析 ── */
const rows = [];
for (const [code, c] of Object.entries(db.countries)) {
  const y = (hs, yr) => c.hs?.[hs]?.years?.[yr]?.usd ?? null;
  const screen23 = y('847410', '2023'), screen21 = y('847410', '2021');
  const crush23 = y('847420', '2023'), crush21 = y('847420', '2021');
  const parts23 = y('847490', '2023');
  if (!screen23 && !crush23) continue;
  rows.push({ code, name: c.zh || c.en || code, screen23, screen21, crush23, crush21, parts23 });
}

const g = (a, b) => (a && b && b > 0 ? a / b - 1 : null);
const M = 1e6;

console.log('\n  ══════════════════════════════════════════════════════════════════════════');
console.log('   破碎机 + 筛子 · 完整合并视图（筛分机械 847410 + 破碎机械 847420）');
console.log('  ══════════════════════════════════════════════════════════════════════════\n');
console.log('  国家              筛分机械     破碎机械    破碎+筛     筛/破    破碎增长(21→23)');
console.log('  ' + '─'.repeat(82));

const both = rows.filter((r) => r.screen23 && r.crush23);
both.sort((a, b) => (b.screen23 + b.crush23) - (a.screen23 + a.crush23));
for (const r of both.slice(0, 40)) {
  const tot = r.screen23 + r.crush23;
  const ratio = r.screen23 / r.crush23;
  const gr = g(r.crush23, r.crush21);
  console.log('  ' + String(r.name).padEnd(14) +
    ('$' + (r.screen23 / M).toFixed(1) + 'M').padStart(12) +
    ('$' + (r.crush23 / M).toFixed(1) + 'M').padStart(13) +
    ('$' + (tot / M).toFixed(1) + 'M').padStart(12) +
    ratio.toFixed(2).padStart(9) +
    (gr !== null ? ('  ' + (gr >= 0 ? '+' : '') + (gr * 100).toFixed(0) + '%').padStart(10) : '         —'));
}
console.log('  ' + '─'.repeat(82));

/* ── ④ 关键发现 ── */
const screenExceeds = both.filter((r) => r.screen23 > r.crush23).sort((a, b) => (b.screen23 / b.crush23) - (a.screen23 / a.crush23));
console.log('\n  ★ 发现 1：筛分机械 > 破碎机械 的国家（' + screenExceeds.length + ' 个）');
console.log('     含义：这些国家在"筛"上的支出超过"破"，只推破碎机会漏掉一半市场\n');
for (const r of screenExceeds.slice(0, 12)) {
  console.log('     ' + String(r.name).padEnd(14) + '筛 $' + (r.screen23 / M).toFixed(1) + 'M  >  破 $' + (r.crush23 / M).toFixed(1) + 'M' +
    '   倍数 ' + (r.screen23 / r.crush23).toFixed(2) + '×');
}

const totScreen = both.reduce((a, b) => a + b.screen23, 0);
const totCrush = both.reduce((a, b) => a + b.crush23, 0);
console.log('\n  ★ 发现 2：全球筛/破 总比 = ' + (totScreen / totCrush).toFixed(3));
console.log('     筛分 $' + (totScreen / M).toFixed(0) + 'M vs 破碎 $' + (totCrush / M).toFixed(0) + 'M（' + both.length + ' 国）');
console.log('     含义：筛分机械市场规模约为破碎机械的 ' + (totScreen / totCrush * 100).toFixed(0) + '%');
console.log('           → 一条完整生产线上，筛子的钱不比破碎机少多少，不能只卖破碎机');

const hot = both.filter((r) => { const x = g(r.crush23, r.crush21); return x !== null && x > 0.3; })
  .sort((a, b) => g(b.crush23, b.crush21) - g(a.crush23, a.crush21));
console.log('\n  ★ 发现 3：高增长国家（破碎增长 >30%）—— ' + hot.length + ' 个');
for (const r of hot.slice(0, 12)) {
  console.log('     ' + String(r.name).padEnd(14) + '+' + (g(r.crush23, r.crush21) * 100).toFixed(0) + '%' +
    '  破 $' + (r.crush23 / M).toFixed(1) + 'M  筛 $' + (r.screen23 / M).toFixed(1) + 'M' +
    '  零件 $' + ((r.parts23 || 0) / M).toFixed(1) + 'M');
}

/* 备件比（用合并后的总额） */
console.log('\n  ★ 发现 4：备件比（零件 ÷ (破碎+筛分)）');
const pr = both.filter((r) => r.parts23).map((r) => ({ n: r.name, v: r.parts23 / (r.screen23 + r.crush23), p: r.parts23, t: r.screen23 + r.crush23 }));
pr.sort((a, b) => b.v - a.v);
for (const r of pr.slice(0, 10)) {
  console.log('     ' + String(r.n).padEnd(14) + (r.v).toFixed(2) + '×   零件 $' + (r.p / M).toFixed(1) + 'M / 整机 $' + (r.t / M).toFixed(1) + 'M');
}

/* ── ⑤ 导出 ── */
const header = ['m49_code', 'country_zh', 'screen_847410_2023_usd', 'screen_847410_2021_usd',
  'crusher_847420_2023_usd', 'crusher_847420_2021_usd', 'parts_847490_2023_usd',
  'screen_plus_crusher_2023_usd', 'screen_to_crusher_ratio', 'crusher_growth_pct', 'source'];
const csv = [header.join(',')].concat(both.map((r) => {
  const gr = g(r.crush23, r.crush21);
  return [r.code, r.name, r.screen23, r.screen21 ?? '', r.crush23, r.crush21 ?? '', r.parts23 ?? '',
    r.screen23 + r.crush23, (r.screen23 / r.crush23).toFixed(4),
    gr !== null ? (gr * 100).toFixed(1) : '', 'UN Comtrade public API; HS 847410 + 847420 + 847490; flowCode=M; partnerCode=0'].join(',');
})).join('\n');
writeFileSync(join(OUT, 'crusher-and-screen-combined.csv'), csv, 'utf8');
const dsDir = join(ROOT, 'distribution', 'dataset');
if (existsSync(dsDir)) writeFileSync(join(dsDir, 'mackorn-crusher-and-screen-combined.csv'), csv, 'utf8');
console.log('\n  ✅ 导出 crusher-and-screen-combined.csv（' + both.length + ' 国 × 11 字段）');
console.log('  ✅ 已同步到 dataset/\n');
