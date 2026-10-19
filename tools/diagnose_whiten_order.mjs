/**
 * 诊断：验证 Whiten 模型的算子顺序 bug 并给出修复
 *
 * 症状：mass_balance_error 在 CSS=4~50 / F80=40~400 的全网格都达 1e41~1e79
 * 假设：模型把 (I−C) 放进了右端项，而正确公式是最后左乘 (I−C)
 *
 * 对照三种实现：
 *   A) 现有代码   solve (I−B·C)·X = (I−C)·F ; return X
 *   B) 正确顺序   solve (I−B·C)·Y = F       ; return (I−C)·Y
 *   C) 解析级数   P = (I−C)·Σ_{k≥0}(B·C)^k·F  （前若干项）
 */
import { pathToFileURL } from 'node:url';
const S = await import(pathToFileURL('D:/DSH desktop/DSH destop工作区/MACKORN-DSH-Plugin/plugin/lib/simulate.mjs').href);
const { sieveSeries, DISTRIBUTIONS, discretize, breakageMatrix, classificationFunction, BREAKAGE_DEFAULTS } = S;

const sizes = sieveSeries(0.5, 512);
const n = sizes.length;
const feedOf = (f80, nn = 1.1) => discretize(DISTRIBUTIONS.rosinRammler({ xc: f80 / Math.pow(Math.log(5), 1 / nn), n: nn }), sizes).frac;

function identity(N) { return Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? 1 : 0))); }
function upperSolve(A, b, N) {
  const x = new Array(N).fill(0);
  for (let i = N - 1; i >= 0; i -= 1) {
    let s = b[i];
    for (let j = i + 1; j < N; j += 1) s -= A[i][j] * x[j];
    const d = A[i][i];
    x[i] = Math.abs(d) < 1e-300 ? 0 : s / d;
  }
  return x;
}
const sum = (a) => a.reduce((x, y) => x + y, 0);
const p80of = (frac) => { let c = 0; for (let i = 0; i < frac.length; i += 1) { c += frac[i]; if (c >= 0.8) return sizes[i]; } return sizes[sizes.length - 1]; };

function build(cssMm, params = BREAKAGE_DEFAULTS, throwMm = 25, throwFactor = 0.8) {
  const Cfn = classificationFunction({ cssMm, throwMm, throwFactor });
  const C_EPS = 1e-9;
  const C = sizes.map((s) => Math.min(1 - C_EPS, Cfn(s)));
  const B = breakageMatrix(sizes, params);
  const BC = B.map((row) => row.map((v, j) => v * C[j]));
  const A = identity(n).map((row, i) => row.map((v, j) => v - BC[i][j]));
  return { C, B, A };
}

function methodA(cssMm, F) {           // 现有代码
  const { C, A } = build(cssMm);
  const rhs = F.map((f, i) => (1 - C[i]) * f);
  const X = upperSolve(A, rhs, n);
  const Pc = X.map((v) => Math.max(0, v));
  const s = sum(Pc);
  return { raw_sum: s, frac: Pc.map((v) => v / s), note: 'solve (I−BC)X=(I−C)F, return X' };
}
function methodB(cssMm, F) {           // 正确顺序
  const { C, A } = build(cssMm);
  const Y = upperSolve(A, F, n);        // solve (I−BC)Y = F
  const P = Y.map((y, i) => (1 - C[i]) * y);  // 最后左乘 (I−C)
  const Pc = P.map((v) => Math.max(0, v));
  const s = sum(Pc);
  return { raw_sum: s, frac: Pc.map((v) => v / s), note: 'solve (I−BC)Y=F, return (I−C)Y' };
}
function methodC(cssMm, F, terms = 60) {  // 级数展开（无需求逆）
  const { C, B } = build(cssMm);
  let v = F.slice();
  let acc = new Array(n).fill(0);
  for (let k = 0; k < terms; k += 1) {
    // v = (BC)^k F
    const w = new Array(n).fill(0);
    for (let i = 0; i < n; i += 1) { let s = 0; for (let j = i; j < n; j += 1) s += B[i][j] * C[j] * v[j]; w[i] = s; }
    for (let i = 0; i < n; i += 1) acc[i] += w[i];
    v = w;
    if (Math.abs(sum(w)) < 1e-16) break;
  }
  const P = acc.map((a, i) => (1 - C[i]) * a);
  const Pc = P.map((v2) => Math.max(0, v2));
  const s = sum(Pc);
  return { raw_sum: s, frac: s > 0 ? Pc.map((v2) => v2 / s) : new Array(n).fill(0), note: '级数 (I−C)Σ(BC)^k F, ' + terms + ' 项' };
}

console.log('\n' + '═'.repeat(100));
console.log('  Whiten 模型算子顺序诊断');
console.log('═'.repeat(100) + '\n');

const CASES = [[16, 120], [6, 300], [50, 40], [10, 200], [25, 120], [4, 400]];
console.log('  工况          方法A(现有)            方法B(修正顺序)        方法C(级数)');
console.log('  ' + '─'.repeat(96));
for (const [css, f80] of CASES) {
  const F = feedOf(f80);
  const a = methodA(css, F), b = methodB(css, F), c = methodC(css, F);
  const fmt = (r) => ('Σ=' + r.raw_sum.toExponential(1)).padEnd(12) + ('P80=' + p80of(r.frac).toFixed(1)).padStart(10);
  console.log('  CSS' + String(css).padStart(3) + '/F80=' + String(f80).padEnd(4) + fmt(a).padEnd(24) + fmt(b).padEnd(24) + fmt(c));
}

console.log('\n  ── 判据 ──');
console.log('    质量守恒要求归一化前的 Σ 应等于 1（因为 ΣP = ΣF = 1）');
console.log('    方法A 的 Σ 偏离 1 达天文数字 → 解无效');
console.log('    方法B/C 的 Σ 若接近 1 → 证明算子顺序是根因\n');

/* 全网格对比 */
console.log('  ── 全网格 Σ 对比（方法A vs 方法B）──');
const CSSL = [4, 6, 10, 16, 25, 40, 50], F80L = [40, 60, 120, 200, 300, 400];
console.log('  CSS\\F80' + F80L.map((f) => String(f).padStart(16)).join(''));
let aBad = 0, bBad = 0, total = 0;
for (const css of CSSL) {
  let line = '  ' + String(css).padEnd(7);
  for (const f of F80L) {
    const F = feedOf(f);
    const a = Math.abs(methodA(css, F).raw_sum - 1);
    const b = Math.abs(methodB(css, F).raw_sum - 1);
    total += 1; if (a > 1e-6) aBad += 1; if (b > 1e-6) bBad += 1;
    line += ((a > 1e-6 ? 'A✗' : 'A✓') + '/' + (b > 1e-6 ? 'B✗' : 'B✓')).padStart(16);
  }
  console.log(line);
}
console.log('\n  方法A 越界 ' + aBad + '/' + total + ' · 方法B 越界 ' + bBad + '/' + total);
console.log('');
