/**
 * 把不确定度量化接进 crusherCurve，并更新假设文本以反映 2026-10 的公式修正
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const P = join(ROOT, 'plugin', 'lib', 'sim-adapter.mjs');
let c = readFileSync(P, 'utf8');
const n0 = c.length;

/* ① 引入不确定度模块 */
if (!c.includes('uncertainty.mjs')) {
  const anchor = `import { getCalibration, listCalibrations } from './calibration-store.mjs';`;
  if (!c.includes(anchor)) { console.error('  ❌ 锚点 1 不存在'); process.exit(1); }
  c = c.replace(anchor, anchor + `\nimport { quantifyConeUncertainty } from './uncertainty.mjs';`);
  console.log('  ✅ 已引入 uncertainty.mjs');
} else console.log('  ○ uncertainty 已引入');

/* ② 在 return 之前计算不确定度 */
if (!c.includes('quantifyConeUncertainty(frac')) {
  const anchor = `  const sample = [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => ({`;
  if (!c.includes(anchor)) { console.error('  ❌ 锚点 2 不存在'); process.exit(1); }
  const add = `  /* ── 不确定度量化 ──
   * 只把【需要标定的】参数（φ/γ/β/啮合系数）计入误差棒。
   * 设备参数（转速/偏心距）查铭牌即可确定，若调用方未给出，单列为"规格不确定度"提示。
   * 方法为确定性区间传播（非随机蒙特卡洛），因此结果可复现、可解释、可审计。
   */
  const uq = quantifyConeUncertainty(frac, sizes, {
    cssMm: args.css_mm,
    throwMm: Number.isFinite(Number(args.throw_mm)) ? Number(args.throw_mm) : undefined,
    throwFactor: Number.isFinite(Number(args.throw_factor)) ? Number(args.throw_factor) : cal.params.throwFactor,
    speedRpm: Number.isFinite(Number(args.speed_rpm)) ? Number(args.speed_rpm) : undefined,
    breakage,
  }, { calibrated: paramSource.indexOf('实测') >= 0 });

${anchor}`;
  c = c.replace(anchor, add);
  console.log('  ✅ 已加入不确定度计算');
} else console.log('  ○ 不确定度计算已存在');

/* ③ 返回体加 uncertainty */
if (!c.includes('uncertainty: uq')) {
  c = c.replace(/(\n  return \{\n    css_mm: Number\(args\.css_mm\),)/,
    `\n  return {\n    uncertainty: uq,\n    css_mm: Number(args.css_mm),`);
  console.log('  ✅ 返回体已加 uncertainty');
}

/* ④ 更新假设文本：反映修正后的公式与矩阵 */
c = c.replace(
  "A('产品粒度用 Whiten(1972) 稳态模型：P = (I−C)(I−B·C)^(−1)·F；C 为啮合函数、B 为破碎函数', 'LITERATURE (Whiten 1972)'),",
  "A('产品粒度用 Whiten(1972) 稳态模型：解 (I − b·C)·X = F，再 P = (I − C)·X；C 为啮合函数、b 为【分数型】破碎矩阵（列随机，保证质量守恒）', 'LITERATURE (Whiten 1972)'),");
c = c.replace(
  "A('矩阵 (I−B·C) 为上三角，用回代法求解（不做选主元，避免近奇异对角元放大误差）', 'NUMERICS'),",
  "A('矩阵 (I − b·C) 为上三角，用回代法求解。b[j][j]=0 使对角元恒为 1，无需任何夹紧 —— 2026-10 修正：旧实现把 C 夹到 1−1e-9 导致对角元 1e-9、逐级放大 1e9，质量平衡误差达 1e78', 'NUMERICS (2026-10 修正)'),");

/* ⑤ 加一条明确的不确定度告警 */
if (!c.includes('本结果附带误差区间')) {
  c = c.replace(
    "  if (wi.basis === 'LITERATURE') warnings.push(",
    `  warnings.push('本结果附带误差区间（见 uncertainty 字段）：区间宽窄反映【参数不确定度】，不是模型误差。分级 C 或 D 时不得用于订货规格。');
  if (wi.basis === 'LITERATURE') warnings.push(`);
  console.log('  ✅ 已加不确定度告警');
}

writeFileSync(P, c, 'utf8');
console.log('\n  sim-adapter.mjs: ' + n0 + ' → ' + c.length + ' 字符');
