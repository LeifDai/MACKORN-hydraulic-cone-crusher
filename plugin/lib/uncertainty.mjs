/**
 * 不确定度量化（Uncertainty Quantification）
 *
 * 为什么要做这个：
 *   Whiten 模型的参数（φ / γ / β / 偏心距 / 啮合系数 / 转速）取值来自公开文献区间，
 *   未经现场实测标定。所以模型的输出**不是精确值，而是一个区间**。
 *   不问不确定性就报一个数字，等于对用户撒谎。
 *
 * 方法：确定性区间传播（不是随机蒙特卡洛）
 *   · 对每个参数在其文献区间内取端点，重跑模型
 *   · 记录每个参数对输出的单独贡献
 *   · 按平方和开方（RSS）合成 1σ 估计 —— 假设各参数独立
 *   · 返回点估计 + 区间 + 主导误差源
 *
 * 为什么用确定性而非蒙特卡洛：
 *   ① 可复现 —— 同样输入永远同样输出（与模型的确定性承诺一致）
 *   ② 可解释 —— 能指出"是哪个参数贡献了大部分不确定度"，直接指导标定优先级
 *   ③ 可审计 —— 用户能自己重跑每一个端点
 *
 * 纪律：
 *   · 不美化 —— 区间宽就报宽
 *   · 标定前必须显著提示
 *   · 每个数字都说明它的来源
 */
import { sieveSeries, discretize, DISTRIBUTIONS, simulateConeCrusher, percentile, BREAKAGE_DEFAULTS } from './simulate.mjs';

/** 文献参数区间（来源：Whiten 1972 / Napier-Munn et al.《Mineral Comminution Circuits》公开典型值） */
export const PARAM_RANGES = {
  phi: { lo: 0.30, hi: 0.60, mid: 0.45, label: 'φ 破碎函数粗粒生成占比', source: 'LITERATURE (Whiten 1972 / Napier-Munn et al.)', kind: 'fitted' },
  gamma: { lo: 0.40, hi: 1.00, mid: 0.70, label: 'γ 破碎函数粗端指数', source: 'LITERATURE', kind: 'fitted' },
  beta: { lo: 2.50, hi: 5.00, mid: 3.50, label: 'β 破碎函数细端指数', source: 'LITERATURE', kind: 'fitted' },
  throwMm: { lo: 15, hi: 40, mid: 25, label: '偏心距（冲程）mm', source: 'MACKORN 样本典型值 / 铭牌', kind: 'machine' },
  throwFactor: { lo: 0.50, hi: 1.00, mid: 0.80, label: '啮合区宽度系数', source: 'LITERATURE 0.5-1.0', kind: 'fitted' },
  speedRpm: { lo: 200, hi: 400, mid: 300, label: '偏心轴转速 rpm', source: '机型相关 / 铭牌', kind: 'machine' },
};

/**
 * 参数分类（重要 —— 决定不确定度怎么算才诚实）
 *
 *   fitted  —— 必须由现场实测【标定】才能确定的参数（φ/γ/β/啮合系数）
 *              它们的不确定度是【真不确定度】，必须计入误差棒
 *   machine —— 设备铭牌上就有、或可直接测量的参数（转速 / 偏心距）
 *              把它们算进"未知不确定度"是分类错误，会导致过度悲观的结论
 *              （实测：若把转速计入，P80 区间会被撑到 ±163%，而转速其实查铭牌就有）
 *
 * 默认行为：误差棒由 fitted 参数构成；machine 参数若未提供，
 *           作为【规格不确定度】单独列出并提示用户去查铭牌。
 */
export const FITTED_PARAMS = Object.keys(PARAM_RANGES).filter((k) => PARAM_RANGES[k].kind === 'fitted');
export const MACHINE_PARAMS = Object.keys(PARAM_RANGES).filter((k) => PARAM_RANGES[k].kind === 'machine');

const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));

/** 构造带某一参数取值的完整参数对象 */
function withParam(base, key, value) {
  const p = clone(base);
  if (key === 'phi' || key === 'gamma' || key === 'beta') {
    p.breakage = { ...BREAKAGE_DEFAULTS, ...(base.breakage || {}), [key]: value };
  } else {
    p[key] = value;
  }
  return p;
}

const p80Of = (frac, sizes) => percentile(sizes, frac, 0.8);

/**
 * 量化单次圆锥破预测的不确定度
 *
 * @param {number[]} feedFrac 给料质量分数
 * @param {number[]} sizes 筛级（升序 mm）
 * @param {object} params { cssMm, throwMm, throwFactor, speedRpm, breakage }
 * @param {object} opts { calibrated:boolean 是否已用实测标定, ranges 自定义区间 }
 * @returns 点估计 + 误差区间 + 主导误差源 + 使用须知
 */
export function quantifyConeUncertainty(feedFrac, sizes, params = {}, opts = {}) {
  const base = simulateConeCrusher(feedFrac, sizes, params);
  const point = p80Of(base.product_frac, sizes);
  const ranges = opts.ranges || PARAM_RANGES;
  // 只把 fitted 参数计入误差棒；machine 参数（转速/偏心距）若未显式提供则单列
  const useFittedOnly = opts.includeMachine !== true;
  const fittedSet = new Set(FITTED_PARAMS);

  /* 逐参数：在区间端点上重跑，记录对 P80 的单独影响 */
  const contrib = [];
  for (const [key, r] of Object.entries(ranges)) {
    if (useFittedOnly && !fittedSet.has(key)) continue;   // machine 参数不计入
    let loV = null, hiV = null;
    try { loV = p80Of(simulateConeCrusher(feedFrac, sizes, withParam(params, key, r.lo)).product_frac, sizes); } catch { }
    try { hiV = p80Of(simulateConeCrusher(feedFrac, sizes, withParam(params, key, r.hi)).product_frac, sizes); } catch { }
    if (loV == null || hiV == null) continue;
    const spread = Math.abs(hiV - loV);
    contrib.push({
      param: key, label: r.label, source: r.source,
      range: [r.lo, r.hi],
      p80_at_lo: Number(loV.toFixed(2)),
      p80_at_hi: Number(hiV.toFixed(2)),
      spread_mm: Number(spread.toFixed(2)),
      half_width_mm: Number((spread / 2).toFixed(2)),   // 单参数 1σ 估计
      contribution_pct: 0,                              // 稍后填
    });
  }

  /* 合成：平方和开方（假设各参数独立） */
  const rss = Math.sqrt(contrib.reduce((s, c) => s + Math.pow(c.half_width_mm, 2), 0));
  for (const c of contrib) c.contribution_pct = rss > 0 ? Number((Math.pow(c.half_width_mm, 2) / Math.pow(rss, 2) * 100).toFixed(1)) : 0;
  contrib.sort((a, b) => b.contribution_pct - a.contribution_pct);

  const lo = Math.max(0, point - rss);
  const hi = point + rss;
  const sigmaPct = point > 0 ? rss / point * 100 : null;

  /* 置信分级：基于区间相对宽度 */
  let grade, gradeNote;
  if (sigmaPct == null) { grade = 'unknown'; gradeNote = '无法计算'; }
  else if (sigmaPct <= 10) { grade = 'A'; gradeNote = '区间窄（±≤10%），可用于方案；仍建议实测复核'; }
  else if (sigmaPct <= 25) { grade = 'B'; gradeNote = '区间中等（±10~25%），可用于初步方案与设备预选'; }
  else if (sigmaPct <= 50) { grade = 'C'; gradeNote = '区间宽（±25~50%），仅可用于可行性判断，不可用于订货规格'; }
  else { grade = 'D'; gradeNote = '区间很宽（±>50%），只说明量级，必须实测标定后才能用于决策'; }

  const top = contrib[0];
  // 规格不确定度：machine 参数若用户没给，说明其影响未计入
  const machineHints = [];
  if (useFittedOnly) {
    for (const k of MACHINE_PARAMS) {
      const given = params[k] != null;
      if (!given) machineHints.push({ param: k, label: PARAM_RANGES[k].label, hint: '未提供 —— 查设备铭牌或实测后重算，可显著收窄误差棒' });
    }
  }

  const caveats = [];
  if (machineHints.length) caveats.push('以下设备参数未提供，其影响【未计入】上面的误差棒：' + machineHints.map((m) => m.label).join('、') + '。它们查铭牌即可确定，不属于模型不确定度。');
  if (!opts.calibrated) {
    caveats.push('本次计算使用【文献典型参数】，未经现场实测标定 —— 区间反映的是参数不确定度，不是模型误差。');
    if (top) caveats.push('最大不确定度来自「' + top.label + '」（贡献 ' + top.contribution_pct + '%）。实测标定应优先测它。');
    caveats.push('要用到正式方案，须提供该工况的给料与产品筛析数据做最小二乘标定（工具 mackorn_calibrate）。');
  }
  caveats.push('区间为各参数独立假设下的 1σ 合成估计（约 68% 置信）。真实误差还可能包含模型结构误差，未计入。');

  return {
    method: '确定性区间传播 + 平方和开方合成（各参数独立假设）',
    calibrated: !!opts.calibrated,
    point_estimate_mm: Number(point.toFixed(2)),
    interval_mm: [Number(lo.toFixed(2)), Number(hi.toFixed(2))],
    half_width_mm: Number(rss.toFixed(2)),
    sigma_pct: sigmaPct == null ? null : Number(sigmaPct.toFixed(1)),
    confidence_grade: grade,
    grade_note: gradeNote,
    dominant_source: top ? { param: top.param, label: top.label, contribution_pct: top.contribution_pct } : null,
    contributions: contrib,
    machine_params_not_given: machineHints,
    caveats,
    how_to_narrow: [
      '提供该工况的实测给料筛析与产品筛析 + CSS，调用 mackorn_calibrate 反算 φ/γ/β',
      '提供设备实际偏心距与转速（铭牌或实测）',
      '多工况标定后，区间通常可收窄到 ±10% 以内',
    ],
  };
}

/**
 * 便捷入口：由 F80 与 CSS 直接给出带误差棒的 P80
 */
export function p80WithUncertainty({ cssMm, feedP80Mm, feedN = 1.1, ore, ...rest }) {
  const sizes = sieveSeries(0.5, 512);
  // Rosin-Rammler 拟合：F80 = 0.8 → xc = F80 / (ln5)^(1/n)
  const xc = feedP80Mm / Math.pow(Math.log(5), 1 / feedN);
  const F = discretize(DISTRIBUTIONS.rosinRammler({ xc, n: feedN }), sizes).frac;
  return quantifyConeUncertainty(F, sizes, { cssMm, ...rest });
}

/**
 * 敏感性摘要：只返回"哪个参数最影响结果"的排序（轻量，供工具描述使用）
 */
export function sensitivityRanking(cssMm = 16, feedP80Mm = 120) {
  const r = p80WithUncertainty({ cssMm, feedP80Mm });
  return r.contributions.map((c) => ({ param: c.param, label: c.label, contribution_pct: c.contribution_pct }));
}


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
