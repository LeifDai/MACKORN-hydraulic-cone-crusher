/**
 * 诊断 4：验证「分数型 B + 正确算子顺序」是否守恒
 *
 * 数学推导：
 *   质量平衡：X = F + b·C·X   →  (I − b·C)·X = F
 *   产品：    P = (I − C)·X
 *   守恒证明：ΣP = Σ(1−C_j)X_j
 *             由平衡式 ΣX = ΣF + Σ_i C_i X_i·(Σ_j b[j][i]) = 1 + ΣC_i X_i
 *             → Σ(1−C_j)X_j = 1  当且仅当 b 的列和为 1（分数型）
 *
 * 现有代码两处都错：
 *   ① B 用累积型（列和 ≠ 1）→ 物理上质量不守恒
 *   ② 解 (I−BC)·P = (I−C)·F，即算子顺序反了
 */
import { pathToFileURL } from 'node:url';
const S = await import(pathToFileURL('D:/DSH desktop/DSH destop工作区/MACKORN-DSH-Plugin/plugin/lib/simulate.mjs').href);
const { sieveSeries, DISTRIBUTIONS, discretize, classificationFunction, BREAKAGE_DEFAULTS } = S;

const sizes = sieveSeries(0.5, 512);
const n = sizes.length;
const feedOf = (f80, nn = 1.1) => discretize(DISTRIBUTIONS.rosinRammler({ xc: f80 / Math.pow(Math.log(5), 1 / nn), n: nn }), sizes).frac;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const p80of = (frac) => { let c = 0; for (let i = 0; i < frac.length; i += 1) { c += frac[i]; if (c >= 0.8) return sizes[i]; } return sizes[sizes.length - 1]; };
const C_of = (css) => { const f = classificationFunction({ cssMm: css, throwMm: 25, throwFactor: 0.8 }); return sizes.map((s) => Math.min(1, Math.max(0, f(s)))); };

/* 累积破碎函数（Whiten 形式）：Bc[i][j] = 尺寸 j 的料进入尺寸 i 及以下的累积分数 */
function cumB(params = BREAKAGE_DEFAULTS) {
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
/* 分数型：b[i][j] = Bc[i][j] − Bc[i+1][j]（恰好落入级 i） */
function fracB(params = BREAKAGE_DEFAULTS) {
  const Bc = cumB(params);
  const b = Array.from({ length: n }, () => new Array(n).fill(0));
  // 级 i 定义为 [sizes[i], sizes[i+1])；累积通过 sizes[i] 的分数为 Bc[i][j]
  // 恰好落入级 i 的分数 = Bc[i+1][j] − Bc[i][j]（末级用 1 − Bc[n-1][j]）
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < j; i += 1) {
      const hi = (i + 1 <= n - 1) ? Bc[i + 1][j] : 1;
      b[i][j] = Math.max(0, hi - Bc[i][j]);
    }
    // 最细级必须吸收所有"比最细筛还细"的部分（Bc[0][j]），否则质量会漏到网格之外
    b[0][j] = Math.max(0, Bc[1][j]);               // 级0 = 通过 sizes[1] 的全部（累积定义已包含亚筛级）
    b[j][j] = Math.max(0, 1 - Bc[j][j]);          // Bc[j][j]=1 → 0，最大级全部破碎（物理正确）
  }
  return b;
}
const matvec = (M, v) => { const o = new Array(n).fill(0); for (let i = 0; i < n; i += 1) { let s = 0; for (let j = 0; j < n; j += 1) s += M[i][j] * v[j]; o[i] = s; } return o; };
function solveUpper(A, rhs) {
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = rhs[i];
    for (let j = i + 1; j < n; j += 1) s -= A[i][j] * x[j];
    const d = A[i][i];
    x[i] = Math.abs(d) < 1e-300 ? 0 : s / d;
  }
  return x;
}
const buildA = (B, C) => { const BC = B.map((row) => row.map((v, j) => v * C[j])); return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0) - BC[i][j])); };

/* ✅ 正确法：分数型 b + 正确顺序 */
function correct(css, F, B) {
  const C = C_of(css);
  const A = buildA(B, C);
  const X = solveUpper(A, F);                 // (I − bC)X = F
  const P = X.map((x, i) => (1 - C[i]) * x);  // P = (I − C)X
  const Pc = P.map((v) => Math.max(0, v));
  const s = sum(Pc);
  return { raw_sum: s, frac: s > 0 ? Pc.map((v) => v / s) : new Array(n).fill(0) };
}
/* 不动点版（同样用分数型） */
function fixedPoint(css, F, B, iters = 5000) {
  const C = C_of(css);
  const base = F.map((f, i) => (1 - C[i]) * f);
  let X = F.slice();
  for (let k = 0; k < iters; k += 1) {
    const BCX = matvec(B, X.map((v, j) => C[j] * v));
    const nx = F.map((f, i) => f + BCX[i]);
    if (Math.abs(sum(nx) - sum(X)) < 1e-15) { X = nx; break; }
    X = nx;
  }
  const P = X.map((x, i) => (1 - C[i]) * x);
  const Pc = P.map((v) => Math.max(0, v));
  const s = sum(Pc);
  return { raw_sum: s, frac: s > 0 ? Pc.map((v) => v / s) : new Array(n).fill(0) };
}

const Bc = cumB(), bf = fracB();
console.log('\n' + '═'.repeat(100));
console.log('  验证「分数型 B + 正确顺序」');
console.log('═'.repeat(100) + '\n');
console.log('  列和检验（质量守恒的必要条件）：');
console.log('    累积型 B  列和 = ' + [0, 1, 2, 3, 4].map((j) => Bc.reduce((s, r) => s + r[j], 0).toFixed(3)).join(' '));
console.log('    分数型 b  列和 = ' + [0, 1, 2, 3, 4].map((j) => bf.reduce((s, r) => s + r[j], 0).toFixed(6)).join(' '));
console.log('');

const CASES = [[16, 120], [6, 300], [50, 40], [10, 200], [25, 120], [4, 400], [13, 160], [32, 250]];
console.log('  工况'.padEnd(18) + '累积B+错序(现有)'.padEnd(24) + '分数b+正确序'.padEnd(24) + '分数b+不动点');
console.log('  ' + '─'.repeat(96));
const oldDirect = (css, F) => { const C = C_of(css); const A = buildA(Bc, C); const rhs = F.map((f, i) => (1 - C[i]) * f); const P = solveUpper(A, rhs); const Pc = P.map((v) => Math.max(0, v)); const s = sum(Pc); return { raw_sum: s, frac: s > 0 ? Pc.map((v) => v / s) : new Array(n).fill(0) }; };
for (const [css, f80] of CASES) {
  const F = feedOf(f80);
  const fm = (r) => ('Σ=' + r.raw_sum.toFixed(6) + ' P80=' + p80of(r.frac).toFixed(1));
  console.log('  ' + ('CSS' + css + '/F80=' + f80).padEnd(16) + fm(oldDirect(css, F)).padEnd(24) + fm(correct(css, F, bf)).padEnd(24) + fm(fixedPoint(css, F, bf)));
}

console.log('\n  ── 全网格守恒统计（|Σ−1| < 1e-6 为通过）──');
const CSSL = [4, 6, 10, 16, 25, 40, 50], F80L = [40, 60, 120, 200, 300, 400];
for (const [name, fn] of [
  ['累积B+错序(现有)', (css, F) => oldDirect(css, F)],
  ['分数b+正确序', (css, F) => correct(css, F, bf)],
  ['分数b+不动点', (css, F) => fixedPoint(css, F, bf)],
]) {
  let ok = 0, tot = 0, worst = 0;
  for (const css of CSSL) for (const f of F80L) { const r = fn(css, feedOf(f)); const e = Math.abs(r.raw_sum - 1); if (e < 1e-6) ok += 1; if (e > worst) worst = e; tot += 1; }
  console.log('  ' + name.padEnd(20) + ok + '/' + tot + ' 守恒   最坏偏差 ' + worst.toExponential(2));
}

console.log('\n  ── 单调性（CSS↑ → P80 不降）──');
for (const [name, fn] of [['累积B+错序(现有)', (css, F) => oldDirect(css, F)], ['分数b+正确序', (css, F) => correct(css, F, bf)]]) {
  const ps = [6, 8, 10, 13, 16, 20, 25, 32, 40].map((css) => p80of(fn(css, feedOf(200)).frac));
  let mono = true; for (let i = 1; i < ps.length; i++) if (ps[i] < ps[i - 1]) mono = false;
  console.log('  ' + name.padEnd(20) + (mono ? '✅ 单调不降' : '❌ 非单调') + '  ' + ps.map((x) => x.toFixed(0)).join(' → '));
}
console.log('');
