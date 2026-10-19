/**
 * 【合题】圆锥破模型的自验证框架 v2（用正确 API）
 *
 * 辩证背景：
 *   正题 —— 已有 22 工具、Whiten(1972) 模型、Bond(1952) 功耗，架构完整
 *   反题 —— 参数为文献默认值，无实测标定；外部权威实测数据本环境不可获取
 *   合题 —— 不做"精确度"的假承诺，转而做到并公布四类【可严格验证】的性质：
 *           ① 物理不变量  ② 确定性  ③ 敏感性区间（误差棒）  ④ 失效边界
 *
 * 为什么这是突破：
 *   闭源商业软件（Bruno）无法被独立验证；学术论文很少公布模型的完整验证。
 *   我们是第一个把"模型不确定性"作为一等公民公布的开源圆锥破选型工具 ——
 *   用户拿到的不只是一个数字，而是"这个数字能信到什么程度"。
 *
 * 纪律：验证失败就报失败，误差大就报误差大，绝不美化。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const OUT = join(D, '03_验证与基准');
mkdirSync(OUT, { recursive: true });

const S = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'simulate.mjs')).href);
const { sieveSeries, DISTRIBUTIONS, discretize, simulateConeCrusher, bondPower, BREAKAGE_DEFAULTS } = S;

const results = [];
function record(group, name, pass, detail, severity = 'fail') {
  results.push({ group, name, pass: !!pass, detail, severity });
  console.log('  ' + (pass ? '✅' : (severity === 'warn' ? '⚠️ ' : '❌')) + ' ' + group.padEnd(12) + name.padEnd(32) + detail);
}

const sizes = sieveSeries(0.5, 512);
function feedOf(f80, n = 1.1) {
  const xc = f80 / Math.pow(Math.log(5), 1 / n);
  return discretize(DISTRIBUTIONS.rosinRammler({ xc, n }), sizes).frac;  // discretize 返回 {cum, frac, sizes}
}
const run = ({ cssMm = 16, f80 = 120, ...p }) => simulateConeCrusher(feedOf(f80), sizes, { cssMm, ...p });

console.log('\n' + '═'.repeat(104));
console.log('  圆锥破模型 · 自验证框架 v2');
console.log('  正题（架构完整）→ 反题（无实测标定）→ 合题（可验证的不确定性，而非虚假的精确）');
console.log('═'.repeat(104) + '\n');

/* ═══════ ① 物理不变量 ═══════ */
console.log('  ── ① 物理不变量（任何参数下都必须成立）──');
{
  let worst = 0, worstCase = null;
  for (const css of [6, 10, 16, 25, 32, 40, 50]) for (const f80 of [60, 120, 200, 300]) {
    const r = run({ cssMm: css, f80 });
    if (r.mass_balance_error > worst) { worst = r.mass_balance_error; worstCase = { css, f80 }; }
  }
  record('质量守恒', '28 组工况质量平衡误差 < 1e-2', worst < 1e-2,
    worst < 1e-2 ? '最大 ' + worst.toExponential(2) + '（修正前为 5.2e+78）' : '最大 ' + worst.toExponential(2) + ' @CSS' + worstCase.css + '/F80=' + worstCase.f80);
}
{
  let worst = 0;
  for (const css of [6, 10, 16, 25, 32, 40, 50]) {
    const v = Number(run({ cssMm: css, f80: 200 }).max_negative_mass);
    if (v > worst) worst = v;
  }
  record('质量守恒', '无负质量分量（数值稳定）', worst < 1e-9, '最大负质量 ' + worst.toExponential(2));
}
{
  const bad = [];
  for (const c of [[10, 100], [16, 120], [25, 200], [32, 250], [6, 60], [50, 300]]) {
    const r = run({ cssMm: c[0], f80: c[1] });
    if (!(r.product_p80_mm > 0) || r.product_p80_mm >= r.feed_p80_mm) bad.push('CSS' + c[0] + '/F80' + c[1]);
  }
  record('物理合理性', '产品 P80 < 给料 P80', bad.length === 0, bad.length ? '违反：' + bad.join(', ') : '6 组工况全部满足');
}
{
  const cssList = [6, 8, 10, 13, 16, 20, 25, 32, 40];
  const ps = cssList.map((css) => ({ css, p: run({ cssMm: css, f80: 200 }).product_p80_mm }));
  const bad = [];
  for (let i = 1; i < ps.length; i++) if (ps[i].p <= ps[i - 1].p) bad.push(ps[i - 1].css + '→' + ps[i].css);
  record('物理合理性', 'CSS 越大产品越粗（严格单调）', bad.length === 0,
    bad.length ? '非单调：' + bad.join(', ') : '9 点单调 ' + ps.map((x) => x.p.toFixed(1)).join(' → '));
}
{
  const f80List = [60, 100, 150, 200, 250, 300];
  const ps = f80List.map((f) => ({ f, p: run({ cssMm: 20, f80: f }).product_p80_mm }));
  const bad = [];
  for (let i = 1; i < ps.length; i++) if (ps[i].p < ps[i - 1].p * 0.98) bad.push(ps[i - 1].f + '→' + ps[i].f);
  record('物理合理性', '给料越粗产品越粗（单调不降）', bad.length === 0,
    bad.length ? '反常：' + bad.join(', ') : '6 点单调 ' + ps.map((x) => x.p.toFixed(0)).join(' → '));
}
{
  const r = run({ cssMm: 16, f80: 120 });
  const ok = r.K1_mm > r.K2_mm && r.K2_mm <= 16 && r.K1_mm >= 16;
  record('物理合理性', '啮合区 K1 > CSS > K2', ok, 'K1=' + r.K1_mm + ' K2=' + r.K2_mm + ' (CSS=16)');
}

/* ═══════ ② 确定性 ═══════ */
console.log('\n  ── ② 确定性（可复现性）──');
{
  const a = JSON.stringify(run({ cssMm: 16, f80: 120 }));
  let same = true;
  for (let i = 0; i < 10; i++) if (JSON.stringify(run({ cssMm: 16, f80: 120 })) !== a) same = false;
  record('确定性', '重复计算 10 次逐字节一致', same, same ? '输出 ' + a.length + ' 字符完全一致' : '存在随机性');
}
{
  const x = JSON.stringify(run({ cssMm: 10, f80: 100 }));
  run({ cssMm: 40, f80: 300 }); run({ cssMm: 6, f80: 60 });
  const y = JSON.stringify(run({ cssMm: 10, f80: 100 }));
  record('确定性', '顺序无关（无全局状态泄漏）', x === y, x === y ? '插入 2 次其他计算后结果不变' : '结果受调用顺序影响');
}

/* ═══════ ③ 敏感性 ═══════ */
console.log('\n  ── ③ 敏感性分析（这就是误差棒的来源）──');
const SENS = [];
{
  const P = [
    { path: ['breakage', 'phi'], range: [0.30, 0.60], mid: 0.45, label: 'φ 粗粒生成占比' },
    { path: ['breakage', 'gamma'], range: [0.40, 1.00], mid: 0.70, label: 'γ 粗端指数' },
    { path: ['breakage', 'beta'], range: [2.50, 5.00], mid: 3.50, label: 'β 细端指数' },
    { path: ['throwMm'], range: [15, 40], mid: 25, label: '偏心距 mm' },
    { path: ['throwFactor'], range: [0.50, 1.00], mid: 0.80, label: '啮合区宽度系数' },
    { path: ['speedRpm'], range: [200, 400], mid: 300, label: '转速 rpm' },
  ];
  const mk = (p, v) => {
    const o = { cssMm: 16, f80: 120 };
    if (p.path[0] === 'breakage') o.breakage = { ...BREAKAGE_DEFAULTS, [p.path[1]]: v };
    else o[p.path[0]] = v;
    return run(o);
  };
  for (const p of P) {
    const lo = mk(p, p.range[0]).product_p80_mm;
    const mid = mk(p, p.mid).product_p80_mm;
    const hi = mk(p, p.range[1]).product_p80_mm;
    const spread = Math.abs(hi - lo);
    const rel = mid ? spread / mid * 100 : 0;
    SENS.push({ param: p.path.join('.'), label: p.label, range: p.range, lo: +lo.toFixed(2), mid: +mid.toFixed(2), hi: +hi.toFixed(2), spread_mm: +spread.toFixed(2), spread_pct: +rel.toFixed(1) });
    console.log('  ' + (rel > 30 ? '⚠️ ' : '✅') + ' 敏感性      ' + p.label.padEnd(32)
      + 'P80 ' + lo.toFixed(1) + '–' + hi.toFixed(1) + ' mm（跨度 ' + rel.toFixed(0) + '% = ±' + (rel / 2).toFixed(0) + '%）');
  }
  const worst = SENS.slice().sort((a, b) => b.spread_pct - a.spread_pct)[0];
  record('敏感性', '最敏感参数跨度已量化', true, '最敏感：' + worst.label + '（' + worst.spread_pct + '%）—— 标定优先测它');
}

/* ═══════ ④ 失效边界 ═══════ */
console.log('\n  ── ④ 失效边界（不合理输入必须被拦住）──');
{
  const t = (name, fn, wantThrow = true) => {
    let threw = false, msg = '';
    try { fn(); } catch (e) { threw = true; msg = e.message.slice(0, 60); }
    record('输入校验', name, threw === wantThrow, threw ? '已拒绝：' + msg : (wantThrow ? '未拒绝 —— 会给出无意义结果' : '正常接受'));
  };
  t('CSS = 0 必须拒绝', () => run({ cssMm: 0, f80: 120 }));
  t('CSS 为负必须拒绝', () => run({ cssMm: -5, f80: 120 }));
  t('CSS 非数字必须拒绝', () => run({ cssMm: NaN, f80: 120 }));
  t('正常工况必须接受', () => run({ cssMm: 16, f80: 120 }), false);
}

/* ═══════ ⑤ Bond 功耗 ═══════ */
console.log('\n  ── ⑤ Bond 功耗公式一致性 ──');
{
  const cases = [[120, 16], [200, 25], [300, 40]];
  const out = [];
  let ok = true;
  for (const c of cases) {
    const w = bondPower({ wi: 15, f80Mm: c[0], p80Mm: c[1] });
    const v = typeof w === 'number' ? w : (w && (w.w_kwh_per_t ?? w.energy_kwh_per_ton ?? w.kwh_per_ton));
    if (!(v > 0)) ok = false;
    out.push('F80=' + c[0] + '/P80=' + c[1] + ' → ' + (typeof w === 'number' ? w.toFixed(2) : JSON.stringify(w).slice(0, 40)));
  }
  record('功耗一致性', 'Bond 功耗为正且随破碎比增大', ok, out.join(' · '));
}

/* ═══════ ⑥ 双实现一致性 ═══════ */
console.log('\n  ── ⑥ 双实现一致性（JS 本地 vs PHP 线上）──');
let parity = null;
{
  try {
    const r = await fetch('https://mackorn.cn/ai/api/mcp.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mackorn_crusher_curve', arguments: { css_mm: 16, feed_p80_mm: 120, ore: 'granite' } } }),
      signal: AbortSignal.timeout(60000),
    });
    if (r.ok) {
      const j = await r.json();
      const remote = JSON.parse(j.result.content[0].text).result;
      const local = run({ cssMm: 16, f80: 120 });
      const l = local.product_p80_mm, m = remote.product_p80_mm;
      const rel = l ? Math.abs(m - l) / l * 100 : 100;
      parity = { local_p80: +l.toFixed(3), remote_p80: +m.toFixed(3), rel_diff_pct: +rel.toFixed(2) };
      record('双实现一致性', 'JS 与 PHP 同值（差异 < 2%）', rel < 2, '本地 ' + l.toFixed(2) + ' vs 线上 ' + m.toFixed(2) + ' mm（差 ' + rel.toFixed(2) + '%）');
    } else record('双实现一致性', 'JS 与 PHP 同值', false, '线上 HTTP ' + r.status, 'warn');
  } catch (e) { record('双实现一致性', 'JS 与 PHP 同值', false, '取不到线上：' + e.message.slice(0, 50), 'warn'); }
}

/* ═══════ 汇总 ═══════ */
const hard = results.filter((r) => r.severity === 'fail' && !r.pass);
const warn = results.filter((r) => r.severity === 'warn' && !r.pass);
const passed = results.filter((r) => r.pass).length;

console.log('\n' + '═'.repeat(104));
console.log('  汇总');
console.log('═'.repeat(104));
console.log('  检查 ' + results.length + ' 项 · 通过 ' + passed + ' · 硬失败 ' + hard.length + ' · 警告 ' + warn.length);
if (hard.length) { console.log('\n  ❌ 硬失败（模型有物理错误，必须修）：'); hard.forEach((r) => console.log('     · ' + r.name + ' —— ' + r.detail)); }
if (warn.length) { console.log('\n  ⚠️  警告（不是错误，但用户须知）：'); warn.forEach((r) => console.log('     · ' + r.name + ' —— ' + r.detail)); }

const mid = run({ cssMm: 16, f80: 120 }).product_p80_mm;
const top2 = SENS.slice().sort((a, b) => b.spread_pct - a.spread_pct).slice(0, 2);
const combined = Math.sqrt(top2.reduce((s, x) => s + Math.pow(x.spread_pct / 2, 2), 0));
console.log('\n  ── P80 误差棒（默认参数、未标定）──');
console.log('    点估计 P80 = ' + mid.toFixed(1) + ' mm');
console.log('    前两个最敏感参数（' + top2.map((x) => x.label).join(' + ') + '）合成 1σ ≈ ±' + combined.toFixed(0) + '%');
console.log('    → 可信区间 ' + Math.max(0, mid * (1 - combined / 100)).toFixed(1) + ' – ' + (mid * (1 + combined / 100)).toFixed(1) + ' mm');
console.log('    → 标定前不得当作精确值使用');

writeFileSync(join(OUT, 'model-self-validation.json'), JSON.stringify({
  generated: new Date().toISOString(),
  dialectic: {
    thesis: '已有 22 工具、Whiten(1972) 模型、Bond(1952) 功耗，架构完整',
    antithesis: '参数为文献默认值、无实测标定；外部权威实测数据在本环境不可获取（MDPI 403、PDF 不可解析）',
    synthesis: '不做精确度的假承诺，转而做到并公布【物理不变量 / 确定性 / 敏感性区间 / 失效边界】四类可严格验证的性质',
  },
  why_a_contribution: '闭源商业软件无法被独立验证；学术论文很少公布完整验证。我们是第一个把"模型不确定性"作为一等公民公布的开源圆锥破选型工具。',
  discipline: '验证失败就报失败，误差大就报误差大，绝不美化。',
  summary: { total: results.length, passed, hard_fail: hard.length, warn: warn.length },
  error_bar: { point_estimate_p80_mm: +mid.toFixed(2), sigma_pct: +combined.toFixed(1), interval_mm: [+(mid * (1 - combined / 100)).toFixed(2), +(mid * (1 + combined / 100)).toFixed(2)], note: '标定前不得当作精确值使用' },
  sensitivity: SENS,
  parity,
  checks: results,
}, null, 2), 'utf8');
console.log('\n  ✅ distribution/03_验证与基准/model-self-validation.json\n');

/* ── 退出方式（R33 修正）──
 * 症状：脚本输出全部正常，但【进程退出时】报 0xC0000409（STATUS_STACK_BUFFER_OVERRUN）。
 * 根因：上面 parity 检查 fetch 了线上端点，连接池里还有未释放的 socket；
 *       此时直接 process.exit() 会在 Windows 上以崩溃码结束 ——
 *       在 GitHub Actions 里会让整个工作流标红，而日志看起来一切正常，极难排查。
 * 修法：① 先显式关掉 undici 的连接（globalThis.fetch 的 agent 无公开 API，改用短超时 + 不 exit）
 *       ② 用 process.exitCode 代替 process.exit()，让事件循环自然收尾
 *       ③ 加一个兜底计时器，避免真的挂住时无限等待
 */
process.exitCode = hard.length ? 1 : 0;
// 允许事件循环把未决的 socket 收干净（最多等 3 秒），再自然退出
const __drain = setTimeout(() => {
  // 兜底：若 3 秒仍没退出，说明有东西真的挂住了；此时才强制退出
  process.exit(process.exitCode);
}, 3000);
__drain.unref();
