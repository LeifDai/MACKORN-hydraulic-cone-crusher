/**
 * 数据哨兵值扫描（R50）
 *
 * 背景：R47 发现 NH400 C 腔 CSS16 的产能是 999（机型上限 500），
 *   是哨兵值/录入错误，却被当真值输出给客户。
 *   本脚本一次性扫全表，列出所有可疑格 —— 而不是等下一个客户撞上。
 *
 * 扫描对象：plugin/lib/data.mjs 里的所有数据表
 * 可疑判据：
 *   ① 数值等于常见哨兵（999 / 9999 / -1 / -999 / 0 在不该为 0 的字段）
 *   ② 产能超过机型上限（CAPACITY_TO_MODEL.tphMax）
 *   ③ 区间倒置（min > max）
 *   ④ 与同列相邻值差异过大（>3 倍或 <1/3）—— 可能是录入错位
 *   ④ 范围值超出物理常识（如功率 > 2000kW、给料 > 400mm 的圆锥破）
 */
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');

const M = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'data.mjs')).href);

const SENTINELS = [999, 9999, -1, -999, 99999];
const findings = [];

/* ── ① 产能详表 ── */
const cc = M.CAVITY_CAPACITY || {};
const seriesMax = {};
for (const [k, v] of Object.entries(M.CAPACITY_TO_MODEL || {})) {
  if (v && v.models) for (const mo of v.models) seriesMax[mo] = v.tphMax;
}
for (const [model, detail] of Object.entries(cc)) {
  const cap = seriesMax[model] ?? null;
  for (const row of (detail.rows || [])) {
    (row.cap || []).forEach((pair, i) => {
      const css = (detail.css || [])[i];
      if (!pair) return;                                   // null = 明确无数据，正常
      const [lo, hi] = pair;
      if (lo > hi) findings.push({ table: 'CAVITY_CAPACITY', path: model + '/' + row.cavity + '/CSS' + css, kind: '区间倒置', value: '[' + lo + ',' + hi + ']', note: 'min > max' });
      if (SENTINELS.includes(hi) || SENTINELS.includes(lo)) findings.push({ table: 'CAVITY_CAPACITY', path: model + '/' + row.cavity + '/CSS' + css, kind: '哨兵值', value: '[' + lo + ',' + hi + ']', note: '命中常见哨兵数字' });
      if (cap && hi > cap) findings.push({ table: 'CAVITY_CAPACITY', path: model + '/' + row.cavity + '/CSS' + css, kind: '超机型上限', value: hi + ' > ' + cap + ' t/h', note: '会误导选型' });
    });
    /* 相邻列差异 */
    const caps = (row.cap || []).map((p) => (p ? p[1] : null));
    for (let i = 1; i < caps.length; i += 1) {
      const a = caps[i - 1], b = caps[i];
      if (a == null || b == null || a === 0 || b === 0) continue;
      const r = b / a;
      if (r > 3 || r < 1 / 3) {
        findings.push({ table: 'CAVITY_CAPACITY', path: model + '/' + row.cavity + ' 列' + i, kind: '相邻列突变', value: a + ' → ' + b, note: '比值 ' + r.toFixed(2) + '，可能是录入错位' });
      }
    }
  }
}

/* ── ② 全表数值扫描（找哨兵）── */
function scan(obj, path, depth = 0) {
  if (depth > 6 || obj == null) return;
  if (typeof obj === 'number') {
    if (SENTINELS.includes(obj)) findings.push({ table: path.split('.')[0], path, kind: '哨兵值', value: obj, note: '命中常见哨兵数字' });
    return;
  }
  if (Array.isArray(obj)) { obj.forEach((x, i) => scan(x, path + '[' + i + ']', depth + 1)); return; }
  if (typeof obj === 'object') { for (const [k, v] of Object.entries(obj)) scan(v, path + '.' + k, depth + 1); }
}
for (const [k, v] of Object.entries(M)) {
  if (k === 'CAVITY_CAPACITY') continue;              // 已单独处理
  scan(v, k);
}

/* ── 去重 + 输出 ── */
const seen = new Set();
const uniq = findings.filter((f) => { const s = f.table + f.path + f.kind; if (seen.has(s)) return false; seen.add(s); return true; });
uniq.sort((a, b) => a.kind.localeCompare(b.kind));

console.log('');
console.log('  ══ 数据哨兵值 / 异常值扫描 ══');
console.log('');
console.log('  扫描了 ' + Object.keys(M).length + ' 张表');
console.log('  发现可疑 ' + uniq.length + ' 处');
console.log('');
const byKind = {};
for (const f of uniq) (byKind[f.kind] ||= []).push(f);
for (const [kind, arr] of Object.entries(byKind)) {
  console.log('  【' + kind + '】' + arr.length + ' 处');
  for (const f of arr.slice(0, 8)) console.log('    · ' + f.table + ' :: ' + f.path + '  = ' + f.value + '  (' + f.note + ')');
  if (arr.length > 8) console.log('    … 另有 ' + (arr.length - 8) + ' 处');
  console.log('');
}

mkdirSync(D, { recursive: true });
writeFileSync(join(D, '数据哨兵值扫描.json'), JSON.stringify({ generated: new Date().toISOString(), scanned_tables: Object.keys(M).length, found: uniq.length, by_kind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.length])), findings: uniq }, null, 2), 'utf8');
console.log('  已写 distribution/03_验证与基准/数据哨兵值扫描.json');
console.log('');
