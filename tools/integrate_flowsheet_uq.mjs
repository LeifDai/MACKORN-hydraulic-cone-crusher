/**
 * 给 flowsheet 也接上不确定度
 *
 * 做法：把每一破碎段的【待标定参数】在文献区间内取端点，重跑整条流程，
 *       看最终 P80 的散布 —— 这样得到的是流程级误差棒，而不是单机误差棒的简单传递
 *       （闭路循环会放大/衰减扰动，简单传递会失真）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const U = join(ROOT, 'plugin', 'lib', 'uncertainty.mjs');
let c = readFileSync(U, 'utf8');
const n0 = c.length;

if (!c.includes('quantifyFlowsheetUncertainty')) {
  const add = `

/**
 * 流程级不确定度：把每个破碎段的待标定参数在文献区间取端点，重跑整条流程。
 *
 * 为什么不直接套用单机误差棒：
 *   闭路循环会放大或衰减扰动。循环负荷对参数敏感时，单机 ±17% 可能在流程级变成 ±30%。
 *   只有真跑整条流程才能得到流程级的诚实区间。
 *
 * @param {function} runFlowsheetWithParams (overridePerStage) => finalP80
 *        调用方提供一个"用给定参数跑流程并返回最终 P80"的函数
 * @param {number} stageCount 破碎段数
 * @param {object} opts { calibrated }
 */
export function quantifyFlowsheetUncertainty(runFlowsheetWithParams, stageCount, opts = {}) {
  const base = runFlowsheetWithParams(null);
  const point = base && base.final_p80_mm != null ? base.final_p80_mm : null;
  if (point == null) {
    return { error: '无法取得基准流程的最终 P80', method: '流程级区间传播' };
  }

  const contrib = [];
  for (const key of FITTED_PARAMS) {
    const r = PARAM_RANGES[key];
    let lo = null, hi = null;
    try { const a = runFlowsheetWithParams({ [key]: r.lo }); lo = a && a.final_p80_mm; } catch { }
    try { const b = runFlowsheetWithParams({ [key]: r.hi }); hi = b && b.final_p80_mm; } catch { }
    if (lo == null || hi == null) continue;
    const spread = Math.abs(hi - lo);
    contrib.push({
      param: key, label: r.label, source: r.source, range: [r.lo, r.hi],
      final_p80_at_lo: Number(lo.toFixed(2)), final_p80_at_hi: Number(hi.toFixed(2)),
      spread_mm: Number(spread.toFixed(2)), half_width_mm: Number((spread / 2).toFixed(2)), contribution_pct: 0,
    });
  }
  const rss = Math.sqrt(contrib.reduce((s, x) => s + Math.pow(x.half_width_mm, 2), 0));
  for (const x of contrib) x.contribution_pct = rss > 0 ? Number((Math.pow(x.half_width_mm, 2) / Math.pow(rss, 2) * 100).toFixed(1)) : 0;
  contrib.sort((a, b) => b.contribution_pct - a.contribution_pct);

  const sigmaPct = point > 0 ? rss / point * 100 : null;
  let grade, gradeNote;
  if (sigmaPct == null) { grade = 'unknown'; gradeNote = '无法计算'; }
  else if (sigmaPct <= 10) { grade = 'A'; gradeNote = '流程级区间窄（±≤10%）'; }
  else if (sigmaPct <= 25) { grade = 'B'; gradeNote = '流程级区间中等（±10~25%），可用于初步方案'; }
  else if (sigmaPct <= 50) { grade = 'C'; gradeNote = '流程级区间宽（±25~50%），仅可行性判断'; }
  else { grade = 'D'; gradeNote = '流程级区间很宽（±>50%），必须实测标定'; }

  const top = contrib[0];
  return {
    method: '流程级确定性区间传播（扰动全部破碎段的待标定参数，重跑整条流程）',
    calibrated: !!opts.calibrated,
    level: 'flowsheet（含闭路循环放大效应）',
    crusher_stages: stageCount,
    point_estimate_mm: Number(point.toFixed(2)),
    interval_mm: [Number(Math.max(0, point - rss).toFixed(2)), Number((point + rss).toFixed(2))],
    half_width_mm: Number(rss.toFixed(2)),
    sigma_pct: sigmaPct == null ? null : Number(sigmaPct.toFixed(1)),
    confidence_grade: grade,
    grade_note: gradeNote,
    dominant_source: top ? { param: top.param, label: top.label, contribution_pct: top.contribution_pct } : null,
    contributions: contrib,
    caveats: [
      '区间为流程级 1σ 合成估计（各参数独立假设）。闭路循环会放大扰动，故流程级区间通常大于单机区间。',
      opts.calibrated ? '部分段使用了实测标定参数。' : '本次计算使用【文献典型参数】，未经现场实测标定 —— 区间反映参数不确定度，不是模型误差。',
      '要收窄区间，须提供各段的实测给料/产品筛析数据做标定（工具 mackorn_calibrate）。',
    ],
  };
}
`;
  // 追加到文件末尾
  c = c + add;
  writeFileSync(U, c, 'utf8');
  console.log('  ✅ uncertainty.mjs 已加 quantifyFlowsheetUncertainty');
} else console.log('  ○ 已存在');

/* ── 在 sim-adapter 的 flowsheet 里调用它 ── */
const P = join(ROOT, 'plugin', 'lib', 'sim-adapter.mjs');
let a = readFileSync(P, 'utf8');
if (!a.includes('quantifyFlowsheetUncertainty')) {
  a = a.replace("import { quantifyConeUncertainty } from './uncertainty.mjs';",
                "import { quantifyConeUncertainty, quantifyFlowsheetUncertainty } from './uncertainty.mjs';");

  // 在 overall 计算之后插入流程级不确定度
  const anchor = `  const calUsed = stages.filter((s) => s.type === 'crusher' && s._cal && s._cal.found);`;
  if (a.includes(anchor)) {
    a = a.replace(anchor, `  /* ── 流程级不确定度 ──
   * 扰动各破碎段的待标定参数，重跑整条流程 —— 闭路循环会放大扰动，
   * 简单套用单机误差棒会失真，必须真跑流程。
   */
  const crusherStageCount = stages.filter((s) => s.type === 'crusher').length;
  const uqFlow = quantifyFlowsheetUncertainty((override) => {
    const st = stages.map((s) => {
      if (s.type !== 'crusher' || !override) return s;
      const bk = { ...(s.breakage || {}) };
      for (const k of Object.keys(override)) bk[k] = override[k];
      return { ...s, breakage: bk };
    });
    return simulateFlowsheet({ sizes, feedFrac: frac, stages: st, maxIter: args.max_iter });
  }, crusherStageCount, { calibrated: calUsed.length > 0 });

${anchor}`);
    console.log('  ✅ flowsheet 已接入流程级不确定度');
  } else console.log('  ⚠ 找不到 flowsheet 锚点');

  // 加入返回体
  if (a.includes('\n  return {\n') && !a.includes('uncertainty: uqFlow')) {
    // 找 flowsheet 的 return（第二个 return {）
    const fi = a.indexOf('export function flowsheet');
    const seg = a.slice(fi);
    const ri = seg.indexOf('\n  return {');
    if (ri > 0) {
      const abs = fi + ri;
      a = a.slice(0, abs) + '\n  return {\n    uncertainty: uqFlow,' + a.slice(abs + '\n  return {'.length);
      console.log('  ✅ flowsheet 返回体已加 uncertainty');
    }
  }
  writeFileSync(P, a, 'utf8');
} else console.log('  ○ flowsheet 已接入');

console.log('\n  uncertainty.mjs: ' + n0 + ' → ' + c.length + ' 字符');
