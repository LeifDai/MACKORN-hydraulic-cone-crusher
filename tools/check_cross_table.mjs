/**
 * 跨表一致性检查 v3（R52 修正语义误判）
 *
 * v2 的错（R52 实测）：把 ALL_MODELS.capacityTph[1] 与 CAPACITY_TO_MODEL.tphMax
 *   当成"同一个事实"比对，产生 5 处假矛盾。实际上：
 *     · ALL_MODELS.capacityTph   = 该机型的【实际产能区间】
 *     · CAPACITY_TO_MODEL.tphMax = 【选型分档的开区间上界】（源码注释已写明）
 *   两者语义不同，数值不同是正确的。
 *
 * 教训（写进 L-57）：**跨表比对前必须先确认两个字段的【语义】，
 *   同名/近名不等于同一事实。** 只看字段名做比对会造出假警报（本会话第 N 次）。
 *
 * v3 原则：
 *   ① 只比对【确认语义相同】的字段
 *   ② 对"语义不同但容易被混淆"的字段，改为检查【是否有清晰的文档区分】
 *   ③ 真矛盾 / 覆盖差异 / 结构异常 三类
 */
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');
const M = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'data.mjs')).href);
const SRC = readFileSync(join(ROOT, 'plugin', 'lib', 'data.mjs'), 'utf8');

const contradiction = [];
const coverage = [];
const structural = [];
const ambiguity = [];      // 语义不同但易混淆 —— 检查是否有文档区分

const models = M.ALL_MODELS || [];
const cc = M.CAVITY_CAPACITY || {};

/* ══════ ① 真矛盾：只比对【语义确认相同】的字段 ══════ */
/* 功率：ALL_MODELS.powerKw 与 CAPACITY_TO_MODEL.powerKw 都指"电机功率" —— 语义相同 */
for (const m of models) {
  const entry = (M.CAPACITY_TO_MODEL || []).find((v) => (v.models || []).includes(m.model));
  if (entry && m.powerKw != null && entry.powerKw != null && m.powerKw !== entry.powerKw) {
    contradiction.push({ kind: '电机功率', subject: m.model, a: 'ALL_MODELS=' + m.powerKw + 'kW', b: 'CAPACITY_TO_MODEL=' + entry.powerKw + 'kW', note: '同一机型两处功率不一致' });
  }
}

/* Bond 功指数：MATERIALS.wi_kwh_t 与 BOND_WI_TYPICAL 都指矿石功指数 —— 语义相同 */
{
  const wi = M.BOND_WI_TYPICAL || null;
  const mats = M.MATERIALS || {};
  if (wi) {
    for (const [name, m] of Object.entries(mats)) {
      const a = m.wi_kwh_t && Array.isArray(m.wi_kwh_t.v) ? m.wi_kwh_t.v : null;
      const b = wi[name];
      if (!a || b == null) continue;
      const bl = Array.isArray(b) ? b[0] : b, bh = Array.isArray(b) ? b[1] : b;
      if (a[0] !== bl || a[1] !== bh) contradiction.push({ kind: 'Bond 功指数', subject: name, a: 'MATERIALS=' + JSON.stringify(a), b: 'BOND_WI_TYPICAL=' + JSON.stringify(b), note: '两处功指数不一致' });
    }
  }
}

/* ══════ ② 结构异常 ══════ */
for (const [model, d] of Object.entries(cc)) {
  const cols = (d.css || []).length;
  for (const row of (d.rows || [])) {
    if ((row.cap || []).length !== cols) structural.push({ kind: '列数不匹配', subject: model + '/' + row.cavity, a: 'css 列数=' + cols, b: 'cap 长度=' + (row.cap || []).length, note: '会对位错位' });
    (row.cap || []).forEach((p, i) => {
      if (p && p[0] > p[1]) structural.push({ kind: '区间倒置', subject: model + '/' + row.cavity + '/CSS' + (d.css || [])[i], a: 'min=' + p[0], b: 'max=' + p[1], note: 'min > max' });
    });
  }
}

/* ══════ ③ 语义易混淆：检查是否有文档区分 ══════ */
{
  /* CAPACITY_TO_MODEL.tphMax 是"分档上界"，ALL_MODELS.capacityTph 是"机型产能区间"。
   * 两者数值必然不同 —— 但【文档必须说清楚】，否则使用者会困惑。 */
  const hasTphMaxDoc = /tphMax\s*为开区间上界|按目标产量选型/.test(SRC);
  const over = [];
  for (const m of models) {
    const entry = (M.CAPACITY_TO_MODEL || []).find((v) => (v.models || []).includes(m.model));
    if (entry && Array.isArray(m.capacityTph) && m.capacityTph[1] > entry.tphMax) over.push(m.model + '(' + m.capacityTph[1] + '>' + entry.tphMax + ')');
  }
  ambiguity.push({
    kind: '产能口径',
    subject: over.length + ' 个机型的 capacityTph 上限 > tphMax 分档上界',
    detail: over.join(' '),
    documented: hasTphMaxDoc,
    note: hasTphMaxDoc
      ? '源码已注释说明 tphMax 是"分档上界" —— 语义区分清楚 ✅（这不是矛盾，是两种口径）'
      : '⚠ 源码未说明两者语义区别 —— 使用者会困惑',
  });
}

/* ══════ ④ 覆盖差异 ══════ */
for (const m of models) if (!cc[m.model]) coverage.push({ kind: '无腔型详表', subject: m.model, note: '选型退化为系列外推（工具已声明"近似"）' });
{
  const fed = new Set((M.CAVITY_FEED_TABLE || []).map((r) => r.cavity));
  for (const t of (M.CAVITY_TYPES || [])) {
    const code = typeof t === 'string' ? t : (t.code || t.cavity);
    if (code && !fed.has(code)) coverage.push({ kind: '腔型未进给料表', subject: String(code), note: '覆盖差异' });
  }
}
for (const m of models) {
  const d = cc[m.model];
  if (!d || !Array.isArray(d.css) || !d.css.length) continue;
  const lo = Math.min(...d.css), hi = Math.max(...d.css);
  if (m.cssMin != null && lo < m.cssMin) coverage.push({ kind: '详表列超出主档范围', subject: m.model, note: '主档 cssMin=' + m.cssMin + ' vs 详表最小列=' + lo });
  if (m.cssMax != null && hi > m.cssMax) coverage.push({ kind: '详表列超出主档范围', subject: m.model, note: '主档 cssMax=' + m.cssMax + ' vs 详表最大列=' + hi });
}

/* ══════ 输出 ══════ */
const out = { generated: new Date().toISOString(), models_checked: models.length, contradiction: contradiction.length, structural: structural.length, coverage: coverage.length, ambiguity, findings: { contradiction, structural, coverage } };
console.log('');
console.log('  ══ 跨表一致性检查 v3（已修正语义误判）══');
console.log('  比对 ' + models.length + ' 个机型 · ' + Object.keys(cc).length + ' 张腔型详表');
console.log('');
console.log('  【真矛盾】' + contradiction.length + ' 处' + (contradiction.length ? '' : '  ✅（只比对语义确认相同的字段）'));
for (const f of contradiction.slice(0, 8)) console.log('    · ' + f.subject + '：' + f.a + '  ⇄  ' + f.b);
console.log('');
console.log('  【结构异常】' + structural.length + ' 处' + (structural.length ? '' : '  ✅'));
for (const f of structural.slice(0, 5)) console.log('    · ' + f.subject + '：' + f.note);
console.log('');
console.log('  【语义易混淆】' + ambiguity.length + ' 项');
for (const a of ambiguity) { console.log('    · ' + a.kind + '：' + a.subject); console.log('      ' + a.note); if (a.detail) console.log('      ' + a.detail.slice(0, 150)); }
console.log('');
console.log('  【覆盖差异】' + coverage.length + ' 处（列出供确认，不阻断）');
for (const f of coverage.slice(0, 4)) console.log('    · [' + f.kind + '] ' + f.subject + ' —— ' + f.note);
if (coverage.length > 4) console.log('    … 另有 ' + (coverage.length - 4) + ' 处');
console.log('');
mkdirSync(D, { recursive: true });
writeFileSync(join(D, '跨表一致性检查.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('  已写 distribution/03_验证与基准/跨表一致性检查.json');
console.log('');
process.exit((contradiction.length + structural.length) ? 1 : 0);
