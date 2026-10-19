/**
 * 诊断 2：找出 Whiten 模型的稳定数值解法
 *
 * 已排除：算子顺序（方法 A/B 都爆）
 * 已定位：A[i][i] = 1 − C[i]，当 C→1 时对角元→0，回代除以 1e-9 逐级放大 1e9
 *
 * 本脚本对照五种解法，找哪个真正守恒：
 *   D) 不动点迭代   P = (I−C)F + B·C·P
 *   E) 级数截断     P = Σ_k [(I−C)(BC)^k] F
 *   F) K1 以上强制 P=0（物理：全部被破碎，无残留）+ 只解下三角子块
 *   G) C 不夹紧（用精确 1.0）+ 零对角行置 P_i=0
 *   H) 用「累积通过」坐标解（对细端截断误差不敏感）
 */
import { pathToFileURL } from 'node:url';
const S = await import(pathToFileURL('D:/DSH desktop/DSH destop工作区/MACKORN-DSH-Plugin/plugin/lib/simulate.mjs').href);
const { sieveSeries, DISTRIBUTIONS, discretize, breakageMatrix, classificationFunction, BREAKAGE_DEFAULTS } = S;

const sizes = sieveSeries(0.5, 512);
const n = sizes.length;
const feedOf = (f80, nn = 1.1) => discretize(DISTRIBUTIONS.rosinRammler({ xc: f80 / Math.pow(Math.log(5), 1 / nn), n: nn }), sizes).frac;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const p80of = (frac) => { let c = 0; for (let i = 0; i < frac.length; i += 1) { c += frac[i]; if (c >= 0.8) return sizes[i]; } return sizes[sizes.length - 1]; };
const matvec = (M, v) => { const N = v.length; const o = new Array(N).fill(0); for (let i = 0; i < N; i += 1) { let s = 0; for (let j = i; j < N; j += 1) s += M[i][j] * v[j]; o[i] = s; } return o; };

function build(cssMm, params = BREAKAGE_DEFAULTS, throwMm = 25, throwFactor = 0.8) {
  const Cfn = classificationFunction({ cssMm, throwMm, throwFactor });
  const C = sizes.map((s) => Math.min(1, Math.max(0, Cfn(s))));   // 精确 1.0，不夹紧
  const B = breakageMatrix(sizes, params);
  return { C, B };
}

/* D) 不动点迭代：P = (I−C)F + B·C·P */
function methodD(cssMm, F, iters = 400) {
  const { C, B } = build(cssMm);
  const base = F.map((f, i) => (1 - C[i]) * f);
  let P = base.slice();
  for (let k = 0; k < iters; k += 1) {
    const BC_P = matvec(B, P.map((v, j) => C[j] * v));
    const next = base.map((b, i) => b + BC_P[i]);
    const d = Math.abs(sum(next) - sum(P));
    P = next;
    if (d < 1e-14) break;
  }
  const Pc = P.map((v) => Math.max(0, v));
  const s = sum(Pc);
  return { raw_sum: s, frac: s > 0 ? Pc.map((v) => v / s) : new Array(n).fill(0) };
}

/* E) 级数截断：P = Σ_k [(I−C)(BC)^k] F */
function methodE(cssMm, F, terms = 200) {
  const { C, B } = build(cssMm);
  let v = F.slice();
  let acc = new Array(n).fill(0);
  for (let k = 0; k < terms; k += 1) {
    const term = v.map((x, i) => (1 - C[i]) * x);
    for (let i = 0; i < n; i += 1) acc[i] += term[i];
    v = matvec(B, v.map((x, j) => C[j] * x));
    if (Math.abs(sum(v)) < 1e-18) break;
  }
  const Pc = acc.map((x) => Math.max(0, x));
  const s = sum(Pc);
  return { raw_sum: s, frac: s > 0 ? Pc.map((x) => x / s) : new Array(n).fill(0) };
}

/* F) 物理截断：K1 以上全部破碎、P=0；只对 K1 以下解上三角 */
function methodF(cssMm, F) {
  const { C, B } = build(cssMm);
  const K1 = cssMm + 0.8 * 25;
  const idx = sizes.map((s, i) => (s >= K1 ? i : -1)).filter((i) => i >= 0);
  const P = new Array(n).fill(0);
  // 顶部（C=1）P=0；对这些级，其破碎产物进入更细级
  // 用不动点但把 P_i 强制为 0（C=1 级）
  const base = F.map((f, i) => (1 - C[i]) * f);
  let cur = base.slice();
  for (const i of idx) cur[i] = 0;
  for (let k = 0; k < 400; k += 1) {
    const BC_P = matvec(B, cur.map((v, j) => C[j] * v));
    const next = base.map((b, i) => b + BC_P[i]);
    for (const i of idx) next[i] = 0;      // 强制：全破碎级无残留
    const d = Math.abs(sum(next) - sum(cur));
    cur = next;
    if (d < 1e-14) break;
  }
  const Pc = cur.map((v) => Math.max(0, v));
  const s = sum(Pc);
  return { raw_sum: s, frac: s > 0 ? Pc.map((v) => v / s) : new Array(n).fill(0) };
}

/* G) 有效破碎比截断：把给料中超过「CSS×8」的部分先视为不可破碎（工程上限） */
function methodG(cssMm, F) {
  const { C, B } = build(cssMm);
  const RR_MAX = 8;                       // 单段圆锥破工程破碎比上限
  const cut = cssMm * RR_MAX;
  const Fe = F.slice();
  let overflow = 0;
  for (let i = 0; i < n; i += 1) if (sizes[i] > cut) { overflow += Fe[i]; Fe[i] = 0; }
  if (overflow > 0) {
    // 溢出部分按最粗可用级重新分配（保守：不破碎，直接进产品）
    const j = sizes.findIndex((s) => s >= cut);
    Fe[Math.max(0, j - 1)] += overflow;
  }
  const base = Fe.map((f, i) => (1 - C[i]) * f);
  let cur = base.slice();
  for (let k = 0; k < 400; k += 1) {
    const BC_P = matvec(B, cur.map((v, j) => C[j] * v));
    const next = base.map((b, i) => b + BC_P[i]);
    const d = Math.abs(sum(next) - sum(cur));
    cur = next;
    if (d < 1e-14) break;
  }
  const Pc = cur.map((v) => Math.max(0, v));
  const s = sum(Pc);
  return { raw_sum: s, frac: s > 0 ? Pc.map((v) => v / s) : new Array(n).fill(0), overflow };
}

console.log('\n' + '═'.repeat(104));
console.log('  找出守恒的解法（目标是 raw_sum ≈ 1）');
console.log('═'.repeat(104) + '\n');

const CASES = [[16, 120], [6, 300], [50, 40], [10, 200], [25, 120], [4, 400], [13, 160], [32, 250]];
console.log('  工况'.padEnd(18) + 'D 不动点'.padEnd(20) + 'E 级数'.padEnd(20) + 'F 物理截断'.padEnd(20) + 'G 破碎比截断');
console.log('  ' + '─'.repeat(100));
for (const [css, f80] of CASES) {
  const F = feedOf(f80);
  const fm = (r) => ('Σ=' + r.raw_sum.toExponential(1) + ' P80=' + p80of(r.frac).toFixed(1));
  console.log('  ' + ('CSS' + css + '/F80=' + f80).padEnd(16) + fm(methodD(css, F)).padEnd(20) + fm(methodE(css, F)).padEnd(20) + fm(methodF(css, F)).padEnd(20) + fm(methodG(css, F)));
}

console.log('\n  ── 全网格「是否守恒」统计（|Σ−1| < 1e-6）──');
const CSSL = [4, 6, 10, 16, 25, 40, 50], F80L = [40, 60, 120, 200, 300, 400];
for (const [name, fn] of [['D 不动点', methodD], ['E 级数', methodE], ['F 物理截断', methodF], ['G 破碎比截断', methodG]]) {
  let ok = 0, tot = 0, worst = 0;
  for (const css of CSSL) for (const f of F80L) {
    const r = fn(css, feedOf(f));
    const e = Math.abs(r.raw_sum - 1);
    if (e < 1e-6) ok += 1;
    if (e > worst) worst = e;
    tot += 1;
  }
  console.log('  ' + name.padEnd(16) + ok + '/' + tot + ' 守恒   最坏偏差 ' + worst.toExponential(2));
}
console.log('');
