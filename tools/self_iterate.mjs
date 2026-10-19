/**
 * L3 自迭代循环 —— 让经验与教训自己生长
 * ================================================================
 * 每一轮做四件事：
 *   ① 跑全部检查（教训 / 库 / 护栏 / 模型 / 基准）
 *   ② 把结果写回经验库与错误库（累积试验次数 → 触发判定转正）
 *   ③ 与上一轮对比，报告【改善】与【回归】
 *   ④ 把本轮写入 PDCA 台账
 *
 * 为什么需要它：
 *   用户要求"不断优化迭代程序"。但"迭代"如果只是人记得去跑，就会断。
 *   本脚本把迭代做成【跑一次就自动累加证据】的闭环 —— 经验越跑越可信，
 *   错误一旦回归立刻被抓到。
 *
 * 用法：
 *   node tools/self_iterate.mjs            跑一轮并记录
 *   node tools/self_iterate.mjs --dry      只跑不写库
 *   node tools/self_iterate.mjs --history  只看历史趋势
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const HIST = join(D, '03_验证与基准', 'self-iterate-history.jsonl');
const DRY = process.argv.includes('--dry');
const HISTORY_ONLY = process.argv.includes('--history');

mkdirSync(join(D, '03_验证与基准'), { recursive: true });

/* ═══════════ 历史查看 ═══════════ */
if (HISTORY_ONLY) {
  if (!existsSync(HIST)) { console.log('\n  尚无自迭代历史。跑一次 node tools/self_iterate.mjs 即可开始积累。\n'); process.exit(0); }
  const rows = readFileSync(HIST, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  console.log('\n' + '═'.repeat(96));
  console.log('  自迭代历史（' + rows.length + ' 轮）');
  console.log('═'.repeat(96) + '\n');
  console.log('  轮次  时间              教训    库     护栏   模型   基准   合计        经验库/错误库');
  console.log('  ' + '─'.repeat(92));
  rows.slice(-20).forEach((r, i) => {
    const g = r.groups || {};
    const f = (k) => (g[k] ? g[k].pass + '/' + g[k].total : '—');
    console.log('  ' + String(rows.length - Math.min(20, rows.length) + i + 1).padStart(4) + '  ' +
      String(r.at).slice(0, 16).replace('T', ' ') + '  ' +
      f('教训').padEnd(7) + f('库').padEnd(7) + f('护栏').padEnd(7) + f('模型').padEnd(7) + f('基准').padEnd(7) +
      (r.passed + '/' + r.total).padEnd(11) + '  ' + (r.libraries ? ('JY ' + r.libraries.jy_positive + '正判/CW ' + r.libraries.cw_fixed + '已修复') : '—'));
  });
  console.log('');
  process.exit(0);
}

/* ═══════════ 跑全部检查 ═══════════ */
const t0 = Date.now();
const groups = {};
const detail = [];
function area(name) { groups[name] ||= { pass: 0, total: 0, fails: [] }; return groups[name]; }
function add(a, ok, label, extra) {
  const g = area(a); g.total += 1; if (ok) g.pass += 1; else g.fails.push(label + (extra ? ' — ' + extra : ''));
  detail.push({ area: a, label, pass: !!ok, extra: extra || null });
}

/* ① 教训 */
const lessonsMod = await import(pathToFileURL(join(HERE, 'lessons.mjs')).href);
const LESSONS = lessonsMod.LESSONS || [];
let lessonPass = 0;
for (const l of LESSONS) {
  let r; try { r = l.check(); } catch (e) { r = { pass: false, detail: String(e.message).slice(0, 60) }; }
  if (r && r.pass) lessonPass += 1; else add('教训', false, l.id, r && r.detail);
}
add('教训', lessonPass === LESSONS.length, '教训 ' + lessonPass + '/' + LESSONS.length, lessonPass === LESSONS.length ? null : '有违反');

/* ② 库检查 + 累积试验 */
const libMod = await import(pathToFileURL(join(HERE, 'libraries.mjs')).href);
const vlibMod = await import(pathToFileURL(join(HERE, 'verify_libraries.mjs')).href);
const CHECKS = vlibMod.CHECKS;
const jy = libMod.load(libMod.FILES.JY), cw = libMod.load(libMod.FILES.CW);
let libPass = 0, libChecked = 0, libNoCheck = 0;
const libTouched = [];
for (const [libName, lib, arr, kind] of [['JY', jy, jy?.experience || [], 'exp'], ['CW', cw, cw?.error || [], 'err']]) {
  for (const e of arr) {
    const fn = CHECKS[e.id];
    if (!fn) { libNoCheck += 1; continue; }
    libChecked += 1;
    let r; try { r = fn(); } catch (err) { r = { pass: false, evidence: String(err.message).slice(0, 50) }; }
    const before = e.verdict;
    if (!DRY) {
      e.trials = (e.trials || 0) + 1;
      if (kind === 'exp') { if (r.pass) e.successes = (e.successes || 0) + 1; e.evidence.push({ target: '自迭代循环自动复跑', target_type: '标准化机构', observed: r.pass ? 'success' : 'fail', note: r.evidence, at: new Date().toISOString() }); }
      else { if (!r.pass) e.failures = (e.failures || 0) + 1; e.evidence.push({ target: '自迭代循环自动复跑', target_type: '标准化机构', observed: r.pass ? 'ok' : 'fail', note: r.evidence, at: new Date().toISOString() }); }
      const j = kind === 'exp' ? libMod.judgeExperience(e) : libMod.judgeError(e);
      if (kind === 'exp') { const s = libMod.scoreExperience(e); e.score = s.score; e.score_note = s.note; e.categories = s.category_list || []; }
      e.verdict = j.verdict; e.verdict_note = j.verdict_note;
      if (kind === 'exp') e.success_rate = j.rate; else e.failure_rate = j.rate;
      e.last_verified = new Date().toISOString();
      if (before && before !== e.verdict) libTouched.push(e.id + ': ' + before + ' → ' + e.verdict);
    }
    if (r.pass) libPass += 1; else add('库', false, e.id, String(r.evidence).slice(0, 70));
  }
}
if (!DRY) { libMod.save(libMod.FILES.JY, jy); libMod.save(libMod.FILES.CW, cw); }
add('库', libPass === libChecked && libChecked > 0, '库检查 ' + libPass + '/' + libChecked + (libNoCheck ? '（' + libNoCheck + ' 条无检查函数）' : ''), libPass === libChecked ? null : '有复现');

/* ③ 护栏自测（含负控） */
const G = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'guardrails.mjs')).href);
const guardTests = [
  ['规则表 ≥10 条', G.listRules().length >= 10],
  ['负控：单台圆锥破给料 600 被拦', G.guardOutput('mackorn_cone_selection', {}, { max_feed_mm: 600 }).violations.some((v) => v.id === 'GR-02')],
  ['负控：整线原矿给料不误报', !G.guardOutput('mackorn_plant_design', {}, { max_feed_mm: 600 }).violations.some((v) => v.id === 'GR-02')],
  ['负控：averaged 合并字段被拦', G.guardOutput('mackorn_cone_selection', { averaged: 1 }, {}).violations.some((v) => v.id === 'GR-04')],
  ['负控：干净输出零 error', G.guardOutput('mackorn_equipment_catalog', { models: [] }, {}).errors === 0],
  ['护栏永不抛错', (() => { try { G.guardOutput('x', undefined, undefined); G.guardOutput('y', null, null); G.guardOutput('z', { a: { b: { c: { d: {} } } } }, {}); return true; } catch { return false; } })()],
];
for (const [label, ok] of guardTests) add('护栏', ok, label);

/* ④ 模型物理不变量 */
const S = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'simulate.mjs')).href);
const SIZES = S.sieveSeries(0.5, 512);
const feedOf = (f80, n = 1.1) => S.discretize(S.DISTRIBUTIONS.rosinRammler({ xc: f80 / Math.pow(Math.log(5), 1 / n), n }), SIZES).frac;
let worstMB = 0, worstNeg = 0;
for (const css of [4, 6, 10, 16, 25, 32, 40, 50]) for (const f80 of [40, 60, 120, 200, 300, 400]) {
  const r = S.simulateConeCrusher(feedOf(f80), SIZES, { cssMm: css });
  worstMB = Math.max(worstMB, r.mass_balance_error); worstNeg = Math.min(worstNeg, Number(r.max_negative_mass));
}
add('模型', worstMB < 1e-2, '质量守恒最坏 ' + worstMB.toExponential(2));
add('模型', worstNeg > -1e-9, '无负质量');
let rej = 0; for (const c of [0, -5, NaN, Infinity]) { try { S.simulateConeCrusher(feedOf(120), SIZES, { cssMm: c }); } catch { rej += 1; } }
add('模型', rej === 4, '失效边界 ' + rej + '/4');
const ps = [6, 10, 16, 25, 40].map((c) => S.simulateConeCrusher(feedOf(200), SIZES, { cssMm: c }).product_p80_mm);
add('模型', ps.every((v, i) => i === 0 || v >= ps[i - 1]), 'CSS 单调');

/* ⑤ 公开基准 */
let bench = null;
try { bench = JSON.parse(readFileSync(join(D, '03_验证与基准', '公开基准', 'last-run.json'), 'utf8')); } catch { }
add('基准', !!bench && bench.failed === 0, '公开基准 ' + (bench ? bench.passed + '/' + bench.total : '取不到'));

/* ═══════════ 汇总 ═══════════ */
const all = detail;
const passed = all.filter((x) => x.pass).length;
const fails = all.filter((x) => !x.pass);

/* 与上一轮对比 */
let prev = null;
if (existsSync(HIST)) {
  const rows = readFileSync(HIST, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  prev = rows.length ? rows[rows.length - 1] : null;
}
const improvements = [], regressions = [];
if (prev) {
  for (const [k, v] of Object.entries(groups)) {
    const p = prev.groups && prev.groups[k];
    if (!p) continue;
    if (v.pass > p.pass) improvements.push(k + ' ' + p.pass + '→' + v.pass);
    if (v.pass < p.pass) regressions.push(k + ' ' + p.pass + '→' + v.pass);
  }
  if (prev.total && prev.failed > 0 && fails.length === 0) improvements.push('上轮 ' + prev.failed + ' 项失败已全部修复');
  if (prev.failed === 0 && fails.length > 0) regressions.push('上轮全过，本轮 ' + fails.length + ' 项失败 —— 疑似回归');
}

const record = {
  at: new Date().toISOString(),
  round: (prev ? (prev.round || 0) + 1 : 1),
  total: all.length, passed, failed: fails.length,
  elapsed_ms: Date.now() - t0,
  groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, { pass: v.pass, total: v.total }])),
  libraries: {
    jy_total: (jy?.experience || []).length,
    jy_positive: (jy?.experience || []).filter((x) => x.verdict === '正判').length,
    jy_pending: (jy?.experience || []).filter((x) => x.verdict === '待定').length,
    cw_total: (cw?.error || []).length,
    cw_fixed: (cw?.error || []).filter((x) => x.verdict === '已修复').length,
    cw_confirmed: (cw?.error || []).filter((x) => x.verdict === '正判').length,
  },
  verdict_changes: libTouched,
  improvements, regressions,
  failures: fails.map((f) => f.area + ' · ' + f.label + (f.extra ? ' — ' + f.extra : '')),
};

if (!DRY) {
  const line = JSON.stringify(record) + '\n';
  writeFileSync(HIST, existsSync(HIST) ? readFileSync(HIST, 'utf8') + line : line, 'utf8');
}

/* ═══════════ 输出 ═══════════ */
console.log('\n' + '═'.repeat(98));
console.log('  L3 自迭代循环 · 第 ' + record.round + ' 轮' + (DRY ? '（dry-run，未写库）' : ''));
console.log('═'.repeat(98) + '\n');
for (const [k, v] of Object.entries(groups)) {
  console.log('  ' + k.padEnd(8) + String(v.pass).padStart(3) + ' / ' + String(v.total).padEnd(3) + (v.pass === v.total ? '  ✅' : '  ❌ ' + v.fails.slice(0, 2).join(' | ')));
}
console.log('  ' + '─'.repeat(60));
console.log('  合计 ' + passed + ' / ' + all.length + (fails.length ? '  ❌ 有失败' : '  ✅ 全过') + '　耗时 ' + record.elapsed_ms + ' ms');
console.log('');
console.log('  库状态: 经验 ' + record.libraries.jy_total + ' 条（正判 ' + record.libraries.jy_positive + ' · 待定 ' + record.libraries.jy_pending + '）');
console.log('          错误 ' + record.libraries.cw_total + ' 条（已修复 ' + record.libraries.cw_fixed + ' · 已确认 ' + record.libraries.cw_confirmed + '）');
if (libTouched.length) { console.log('\n  🔄 本轮判定变化：'); libTouched.forEach((x) => console.log('     ' + x)); }
if (improvements.length) { console.log('\n  📈 改善：'); improvements.forEach((x) => console.log('     ' + x)); }
if (regressions.length) { console.log('\n  📉 回归：'); regressions.forEach((x) => console.log('     ' + x)); }
if (fails.length) { console.log('\n  ❌ 失败明细：'); fails.slice(0, 10).forEach((f) => console.log('     [' + f.area + '] ' + f.label + (f.extra ? ' — ' + f.extra : ''))); }
if (!DRY) console.log('\n  历史已追加: distribution/03_验证与基准/self-iterate-history.jsonl');
console.log('');
process.exit(fails.length ? 1 : 0);
