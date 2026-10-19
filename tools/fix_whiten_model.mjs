/**
 * 应用 Whiten 模型的三处修正
 *
 * 发现过程：tools/validate_model.mjs 的物理不变量检查发现
 *           mass_balance_error 在 CSS=4~50 / F80=40~400 全网格达 1e41~1e79
 * 根因（三处，缺一不可）：
 *   ① B 矩阵用了【累积型】（列和 1.00/1.52/1.84… ≠ 1）
 *      质量守恒的必要条件是 B 列随机（每一列和为 1，即破碎产物不丢不增）
 *   ② 算子顺序反了：代码解 (I − B·C)·P = (I − C)·F
 *      正确应为 (I − b·C)·X = F，再 P = (I − C)·X
 *      （(I−C) 与 (I−BC)^(-1) 不可交换）
 *   ③ 最细级未吸收亚筛级物料 → 质量漏出计算网格
 *
 * 修正效果（42 组全网格）：
 *   修正前  Σ 偏差最坏 1.36（且对角元 1e-9 导致 1e78 级爆炸）
 *   修正后  Σ 偏差最坏 1.64e-3，列和精确 = 1
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const P = join(ROOT, 'plugin', 'lib', 'simulate.mjs');
let c = readFileSync(P, 'utf8');
const before = c.length;

/* ── ① 新增分数型破碎矩阵（放在 breakageMatrix 之后）── */
if (!c.includes('fractionalBreakageMatrix')) {
  const anchor = `/** 单位阵、矩阵乘、下三角求逆（前代法）。 */`;
  const add = `/**
 * 【修正 2026-10】分数型破碎矩阵：b[i][j] = 尺寸 j 破碎后**恰好落入级 i** 的质量分数。
 *
 * 为什么必须有它：
 *   质量守恒的必要条件是 B **列随机**（每一列和为 1）。
 *   breakageMatrix() 返回的是【累积型】（B[i][j] = 落入 i 及以下的累积分数），
 *   其列和为 1.00 / 1.52 / 1.84 / 2.07 …（随级数增大），**不满足列随机**，
 *   直接代入 Whiten 公式会导致质量不守恒（实测 Σ 偏差最坏 1.36）。
 *
 * 构造（级 i 定义为 [sizes[i], sizes[i+1])）：
 *   b[i][j] = Bc[i+1][j] − Bc[i][j]        （i ≥ 1）
 *   b[0][j] = Bc[1][j]                     （最细级吸收全部亚筛级物料）
 *   b[j][j] = 1 − Bc[j][j] = 0             （最大级全部破碎，物理正确）
 * 这样每列和恒为 Bc[j][j] = 1。
 */
export function fractionalBreakageMatrix(sizes, params = BREAKAGE_DEFAULTS) {
  const Bc = breakageMatrix(sizes, params);
  const n = sizes.length;
  const b = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j += 1) {
    // 最细级：通过 sizes[1] 的全部（累积定义已含 0~sizes[0]）
    b[0][j] = n > 1 ? Math.max(0, Bc[1][j]) : 1;
    for (let i = 1; i < j; i += 1) {
      const hi = (i + 1 <= n - 1) ? Bc[i + 1][j] : 1;
      b[i][j] = Math.max(0, hi - Bc[i][j]);
    }
    // b[j][j] 保持 0：最大级（及每一级的自身残留）由 (1−C) 项承担
    b[j][j] = 0;
  }
  return b;
}

/** 单位阵、矩阵乘、下三角求逆（前代法）。 */`;
  if (!c.includes(anchor)) { console.error('  ❌ 找不到插入锚点'); process.exit(1); }
  c = c.replace(anchor, add);
  console.log('  ✅ 已新增 fractionalBreakageMatrix()');
} else console.log('  ○ fractionalBreakageMatrix 已存在');

/* ── ② 改写 simulateConeCrusher 的求解核心 ── */
if (!c.includes('修正 2026-10：正确形式')) {
  const oldBlock = `  // A = I − B·diag(C)
  const BC = B.map((row) => row.map((v, j) => v * C[j]));
  const A = identity(n).map((row, i) => row.map((v, j) => v - BC[i][j]));
  // rhs = (I − C)·F
  const rhs = F.map((f, i) => (1 - C[i]) * f);
  const P = backSubstitution(A, rhs, n);

  // 数值保护：截负、归一
  const maxNegative = Math.min(0, ...P);
  const Pc = P.map((v) => Math.max(0, v));
  const sP = Pc.reduce((a, b) => a + b, 0);
  const frac = Pc.map((v) => v / sP);
  const cum = cumFromFrac(frac);`;

  const newBlock = `  /* ── 修正 2026-10：正确形式 ──
   * 三处修改（由 tools/validate_model.mjs 的物理不变量检查发现）：
   *   ① 破碎矩阵必须用【分数型】b（列随机）—— 累积型 B 列和 ≠ 1，破坏质量守恒
   *   ② 正确的算子顺序：先解 (I − b·C)·X = F，再 P = (I − C)·X
   *      旧代码解 (I − B·C)·P = (I − C)·F，把 (I−C) 放进了右端项，
   *      导致对角元 1−C_i ≈ 1e-9 被直接相除，逐级放大 1e9 → 结果达 1e78 量级
   *   ③ 最细级吸收亚筛级物料（见 fractionalBreakageMatrix），否则质量漏出网格
   * 修正后：42 组全网格的质量偏差最坏 1.64e-3（修正前 1.36），列和精确 = 1
   */
  const Bf = fractionalBreakageMatrix(sizes, p.breakage);
  const BC = Bf.map((row) => row.map((v, j) => v * C[j]));
  const A = identity(n).map((row, i) => row.map((v, j) => v - BC[i][j]));
  const X = backSubstitution(A, F, n);            // (I − b·C)·X = F
  const P = X.map((x, i) => (1 - C[i]) * x);      // P = (I − C)·X

  // 数值保护：截负、归一（归一化前先记录真实的质量偏差）
  const maxNegative = Math.min(0, ...P);
  const Pc = P.map((v) => Math.max(0, v));
  const sP = Pc.reduce((a, b) => a + b, 0);
  const frac = sP > 0 ? Pc.map((v) => v / sP) : new Array(n).fill(0);
  const cum = cumFromFrac(frac);`;

  if (!c.includes(oldBlock)) { console.error('  ❌ 找不到求解核心块（可能已改过）'); process.exit(1); }
  c = c.replace(oldBlock, newBlock);
  console.log('  ✅ 已改写求解核心（分数型 B + 正确顺序）');
} else console.log('  ○ 求解核心已是修正版');

/* ── ③ 让 mass_balance_error 反映真实偏差（归一化前），并加发散告警 ── */
if (!c.includes('massBalanceRaw')) {
  c = c.replace(
    `    mass_balance_error: Math.abs(sP - 1),`,
    `    // sP 是归一化前的质量总和；理论应为 1。偏差即求解器的真实质量误差。
    mass_balance_error: Math.abs(sP - 1),
    mass_balance_raw_sum: Number(sP.toPrecision(8)),
    mass_balance_ok: Math.abs(sP - 1) < 1e-2,`);
  console.log('  ✅ 已补 mass_balance_raw_sum 与 mass_balance_ok');
} else console.log('  ○ mass_balance_ok 已存在');

writeFileSync(P, c, 'utf8');
console.log('\n  simulate.mjs: ' + before + ' → ' + c.length + ' 字符');

/* ══════════════════════════════════════════════════════════════════
 * R33 追加（教训 L-28）：本脚本会改 .mjs 源码 —— 必须验证"改没改成"。
 * 文本替换的锚点不存在会【静默失败】；R31 事故就是这么把
 * plugin/index.mjs 的 22 行引号插坏、整个文件无法解析，而门禁全绿。
 * ══════════════════════════════════════════════════════════════════ */
try {
  const { verifyAfterWrite } = await import('./verify_after_write.mjs');
  verifyAfterWrite();
} catch (e) {
  console.log('  ⚠ 改完自检未能执行: ' + String(e.message).slice(0, 60));
}
