/**
 * 诊断 3：B 矩阵的累积型 vs 分数型约定
 *
 * 现有代码：B[i][j] = 累积破碎函数；B[j][j] = 1（注释写"同级的全部进入该级及以下"）
 * 疑问：Whiten 原始公式 p = (I−C)(I−B·C)^(−1)·f 中的 B 是【累积】还是【分数】？
 *
 * 本脚本对照：
 *   X) 累积型 B（现有）+ 直接解
 *   Y) 分数型 b[i][j] = B[i][j] − B[i+1][j]（恰好进入该级）+ 直接解
 *   Z) 分数型 b + 不动点迭代
 *
 * 判据：ΣP 是否 = 1（质量守恒），且 P80 是否随 CSS 单调。
 */
import { pathToFileURL } from 'node:url';
const S = await import(pathToFileURL('D:/DSH desktop/DSH destop工作区/MACKORN-DSH-Plugin/plugin/lib/simulate.mjs').href);
const { sieveSeries, DISTRIBUTIONS, discretize, classificationFunction, BREAKAGE_DEFAULTS } = S;

const sizes = sieveSeries(0.5, 512);
const n = sizes.length;
const feedOf = (f80, nn = 1.1) => discretize(DISTRIBUTIONS.rosinRammler({ xc: f80 / Math.pow(Math.log(5), 1 / nn), n: nn }), sizes).frac;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const p80of = (frac) => { let c = 0; for (let i = 0; i < frac.length; i += 1) { c += frac[i]; if (c >= 0.8) return sizes[i]; } return sizes[sizes.length - 1]; };

/* 累积破碎函数 Bc[i][j]（i≤j），与现有代码同定义 */
function cumBreakage(params = BREAKAGE_DEFAULTS) {
  const { phi, gamma, beta } = { ...BREAKAGE_DEFAULTS, ...params };
  const Bc = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < j; i += 1) {
      const r = Math.min(1, sizes[i] / sizes[j]);
      Bc[i][j] = phi * Math.pow(r, gamma) + (1 - phi) * Math.pow(r, beta);
    }
    Bc[j][j] = 1;
  }
  return Bc;
}
/* 分数型：b[i][j] = Bc[i][j] − Bc[i+1][j]（恰好进入级 i）；b[j][j] = 1 − Bc[j-1][j]... 需重算 */
function fracBreakage(params = BREAKAGE_DEFAULTS) {
  const Bc = cumBreakage(params);
  const b = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < j; i += 1) b[i][j] = Math.max(0, Bc[i][j] - (i + 1 <= j ? Bc[i + 1][j] : 0));
    // 级 j 自身：剩余质量（破碎后仍留在最大级的部分）
    let s = 0; for (let i = 0; i < j; i += 1) s += b[i][j];
    b[j][j] = Math.max(0, 1 - s);
  }
  return b;
}
const matvec = (M, v) => { const o = new Array(n).fill(0); for (let i = 0; i < n; i += 1) { let s = 0; for (let j = i; j < n; j += 1) s += M[i][j] * v[j]; o[i] = s; } return o; };
function upperSolve(A, rhs) {
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = rhs[i];
    for (let j = i + 1; j < n; j += 1) s -= A[i][j] * x[j];
    x[i] = Math.abs(A[i][i]) < 1e-300 ? 0 : s / A[i][i];
  }
  return x;
}
function directSolve(B, C, F) {
  const BC = B.map((row) => row.map((v, j) => v * C[j]));
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0) - BC[i][j]));
  const rhs = F.map((f, i) => (1 - C[i]) * f);
  const P = upperSolve(A, rhs);
  const Pc = P.map((v) => Math.max(0, v));
  const s = sum(Pc);
  return { raw_sum: s, frac: s > 0 ? Pc.map((v) => v / s) : new Array(n).fill(0) };
}
function fixedPoint(B, C, F, iters = 2000) {
  const base = F.map((f, i) => (1 - C[i]) * f);
  let P = base.slice();
  for (let k = 0; k < iters; k += 1) {
    const nb = base.map((b, i) => b + matvec(B, P.map((v, j) => C[j] * v))[i]);
    if (Math.abs(sum(nb) - sum(P)) < 1e-15) { P = nb; break; }
    P = nb;
  }
  const Pc = P.map((v) => Math.max(0, v));
  const s = sum(Pc);
  return { raw_sum: s, frac: s > 0 ? Pc.map((v) => v / s) : new Array(n).fill(0) };
}
const C_of = (css) => { const f = classificationFunction({ cssMm: css, throwMm: 25, throwFactor: 0.8 }); return sizes.map((s) => Math.min(1, Math.max(0, f(s)))); };

console.log('\n' + '═'.repeat(104));
console.log('  判明 Whiten 模型的正确约定');
console.log('═'.repeat(104) + '\n');
const Bc = cumBreakage(), bf = fracBreakage();
console.log('  累积型 B: Σ_i B[i][j] = ' + Bc.map((_, j) => Bc.reduce((s, r) => s + r[j], 0)).slice(0, 5).map((x) => x.toFixed(2)).join(' ') + ' …（累积函数，和 >1 正常）');
console.log('  分数型 b: Σ_i b[i][j] = ' + bf.map((_, j) => bf.reduce((s, r) => s + r[j], 0)).slice(0, 5).map((x) => x.toFixed(4)).join(' ') + ' …（应为 1.0）');
console.log('');

const CASES = [[16, 120], [6, 300], [50, 40], [10, 200], [25, 120], [4, 400], [13, 160], [32, 250]];
console.log('  工况'.padEnd(18) + 'X 累积+直接解'.padEnd(22) + 'Y 分数+直接解'.padEnd(22) + 'Z 分数+不动点');
console.log('  ' + '─'.repeat(96));
for (const [css, f80] of CASES) {
  const F = feedOf(f80), C = C_of(css);
  const fm = (r) => ('Σ=' + r.raw_sum.toExponential(1) + ' P80=' + p80of(r.frac).toFixed(1));
  console.log('  ' + ('CSS' + css + '/F80=' + f80).padEnd(16) + fm(directSolve(Bc, C, F)).padEnd(22) + fm(directSolve(bf, C, F)).padEnd(22) + fm(fixedPoint(bf, C, F)));
}

console.log('\n  ── 全网格守恒统计 ──');
const CSSL = [4, 6, 10, 16, 25, 40, 50], F80L = [40, 60, 120, 200, 300, 400];
const METHODS = [
  ['X 累积+直接解', (css, F) => directSolve(Bc, C_of(css), F)],
  ['Y 分数+直接解', (css, F) => directSolve(bf, C_of(css), F)],
  ['Z 分数+不动点', (css, F) => fixedPoint(bf, C_of(css), F)],
];
for (const [name, fn] of METHODS) {
  let ok = 0, tot = 0, worst = 0;
  for (const css of CSSL) for (const f of F80L) { const r = fn(css, feedOf(f)); const e = Math.abs(r.raw_sum - 1); if (e < 1e-6) ok += 1; if (e > worst) worst = e; tot += 1; }
  console.log('  ' + name.padEnd(18) + ok + '/' + tot + ' 守恒   最坏 ' + worst.toExponential(2));
}
console.log('\n  ── 单调性（CSS↑ → P80↑）──');
for (const [name, fn] of METHODS) {
  const ps = [6, 10, 16, 25, 40].map((css) => p80of(fn(css, feedOf(200)).frac));
  let mono = true; for (let i = 1; i < ps.length; i++) if (ps[i] <= ps[i - 1]) mono = false;
  console.log('  ' + name.padEnd(18) + (mono ? '✅ 单调' : '❌ 非单调') + '  ' + ps.map((x) => x.toFixed(0)).join(' → '));
}
console.log('');
