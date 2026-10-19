/**
 * 模拟工具的适配层：把工具参数（P80 等工程口径）转成 simulate.mjs 的分布输入，
 * 并把结果整理成便于模型阅读的形状。算法全部在 simulate.mjs（公开文献）。
 */
import {
  sieveSeries, DISTRIBUTIONS, discretize, percentile, simulateConeCrusher,
  simulateFlowsheet, bondPower, BOND_WI_TYPICAL,
} from './simulate.mjs';
import { getCalibration, listCalibrations } from './calibration-store.mjs';
import { quantifyConeUncertainty, quantifyFlowsheetUncertainty } from './uncertainty.mjs';

const A = (assumption, source) => ({ assumption, source });

function distributionFromP80({ p80Mm, kind = 'rosin-rammler', n = 1.1 }) {
  const p = Number(p80Mm);
  if (!(p > 0)) throw new Error('feed_p80_mm 必须为正数');
  // Rosin–Rammler：P80 处的累积通过率为 0.8 → xc = P80 / (ln(1/(1-0.8)))^(1/n)
  const xc = p / Math.pow(Math.log(1 / (1 - 0.8)), 1 / n);
  if (kind === 'gaudin-schuhmann') {
    // GS：Y=(x/xmax)^m，取 m=0.85 使 P80 落在合理位置
    const m = 0.85;
    const xmax = p / Math.pow(0.8, 1 / m);
    return { fn: DISTRIBUTIONS.gaudinSchuhmann({ xmax, m }), params: { kind, xmax: Number(xmax.toFixed(2)), m } };
  }
  return { fn: DISTRIBUTIONS.rosinRammler({ xc, n }), params: { kind, xc: Number(xc.toFixed(2)), n } };
}

function pickWi(ore, explicit) {
  if (Number.isFinite(Number(explicit)) && Number(explicit) > 0) {
    return { wi: Number(explicit), source: '用户提供', basis: 'USER' };
  }
  if (ore) {
    for (const [k, v] of Object.entries(BOND_WI_TYPICAL)) {
      if (Array.isArray(v) && String(ore).includes(k)) {
        const wi = (v[0] + v[1]) / 2;
        return { wi, source: `文献典型区间 ${v[0]}-${v[1]} 的中值（${BOND_WI_TYPICAL.source}）`, basis: 'LITERATURE' };
      }
    }
  }
  return { wi: null, source: null, basis: null };
}

export function crusherCurve(args = {}) {
  const sizes = sieveSeries(0.5, 512);
  const { fn, params } = distributionFromP80({ p80Mm: args.feed_p80_mm, kind: args.feed_distribution, n: args.feed_n });
  const { frac } = discretize(fn, sizes);
  // 参数来源优先级：调用方显式给的 > 知识库里的实测标定 > 文献默认值
  const cal = getCalibration({ model: args.model, cavity: args.cavity, cssMm: args.css_mm });
  const userBreakage = {
    ...(Number.isFinite(Number(args.phi)) ? { phi: Number(args.phi) } : {}),
    ...(Number.isFinite(Number(args.gamma)) ? { gamma: Number(args.gamma) } : {}),
    ...(Number.isFinite(Number(args.beta)) ? { beta: Number(args.beta) } : {}),
  };
  const usingUser = Object.keys(userBreakage).length > 0;
  const breakage = usingUser ? userBreakage : cal.params;
  const paramSource = usingUser ? 'USER（调用方显式指定）' : cal.source;
  const r = simulateConeCrusher(frac, sizes, {
    cssMm: args.css_mm,
    throwMm: args.throw_mm,
    throwFactor: Number.isFinite(Number(args.throw_factor)) ? Number(args.throw_factor) : cal.params.throwFactor,
    speedRpm: args.speed_rpm,
    breakage,
  });
  const wi = pickWi(args.ore, args.bond_wi);
  const power = wi.wi > 0
    ? bondPower({ wi: wi.wi, f80Mm: r.feed_p80_mm, p80Mm: r.product_p80_mm })
    : null;

  const assumptions = [
    A('产品粒度用 Whiten(1972) 稳态模型：解 (I − b·C)·X = F，再 P = (I − C)·X；C 为啮合函数、b 为【分数型】破碎矩阵（列随机，保证质量守恒）', 'LITERATURE (Whiten 1972)'),
    A('破碎函数参数来源：' + paramSource + '（' + cal.why + '）', paramSource.indexOf('实测') >= 0 ? 'MACKORN-实测' : 'LITERATURE'),
    A(`破碎函数取幂函数形式 B = φ(x/y)^γ + (1−φ)(x/y)^β，φ/γ/β 为文献典型值（默认 0.45/0.7/3.5），**须用 MACKORN 台架或现场实测标定**`, 'LITERATURE (Napier-Munn et al.)'),
    A(`啮合区 K1 = CSS + ${args.throw_factor ?? 0.8}×偏心距，K2 = CSS − 同值；偏心距默认 25 mm`, 'LITERATURE + ENGINEERING'),
    A(`给料分布由 P80 拟合：${JSON.stringify(params)}`, 'ENGINEERING'),
    A('矩阵 (I − b·C) 为上三角，用回代法求解。b[j][j]=0 使对角元恒为 1，无需任何夹紧 —— 2026-10 修正：旧实现把 C 夹到 1−1e-9 导致对角元 1e-9、逐级放大 1e9，质量平衡误差达 1e78', 'NUMERICS (2026-10 修正)'),
  ];
  const warnings = [
    '本模型为**公开文献模型**，不含任何第三方专有软件的标定系数；φ/γ/β 与啮合系数必须用 MACKORN 自有实测数据标定后才可用于正式方案',
  ];
  warnings.push('本结果附带误差区间（见 uncertainty 字段）：区间宽窄反映【参数不确定度】，不是模型误差。分级 C 或 D 时不得用于订货规格。');
  /* ── 模型已知局限（2026-10 经公开文献核实后如实披露）──
   * 出处：Chalmers《Cone Crusher Performance》(2015)（机构库公开 PDF，见 distribution/03_验证与基准/）
   * 这三条不是"可能的担忧"，是论文明确指出的建模差异 —— 必须让用户看到。 */
  warnings.push('[模型局限] 转速在本实现中被简化为分类函数的【线性乘子】。公开文献（Chalmers 2015）的做法是通过【无量纲压缩比 s/b】影响选择与破碎函数，'
    + '压缩比由腔内位置、破碎机动力学与物料密度共同决定。因此本模型对转速的敏感性可能被【高估】（实测误差棒中转速贡献最大，约 ±160%）。'
    + '要改善须引入压缩比模型，这需要现场实测数据支撑。');
  warnings.push('[参数来源局限] 破碎函数默认值 φ/γ/β 来自公开文献，而这些文献的参数传统上由【落重试验（drop weight test）】拟合 —— '
    + '落重试验接近磨机的单颗粒冲击，不是圆锥破的层压破碎。文献原文：\"the Selection-Breakage model ... empirically fitted to data from drop weight tests, '
    + 'which is more suitable for mills than compression crushers\"。故默认值只用于【量级估算】，正式选型必须用现场筛析标定（mackorn_calibrate）。');
  if (Number(args.speed_rpm) > 400) {
    warnings.push('[转速超限] 偏心转速 ' + args.speed_rpm + ' rpm > 400 —— 公开文献实测：给料不受限时此区间会发生堵料（packing）。请降低转速或确认给料受控。');
  }
  if (wi.basis === 'LITERATURE') warnings.push(`Bond 功指数取自文献典型值（${wi.source}），精确值须做邦德功指数试验`);
  if (wi.basis === null) warnings.push('未提供矿石种类与 bond_wi，未做功耗估算');
  if (r.product_p80_mm !== null && r.product_p80_mm < args.css_mm * 0.9) {
    warnings.push(`产品 P80 (${r.product_p80_mm}mm) 小于 CSS (${args.css_mm}mm)——模型给出了比排矿口更细的 P80，实际受腔型与给料级配限制，须实测校核`);
  }

  /* ── 不确定度量化 ──
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

  const sample = [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => ({
    size_mm: percentile(sizes, r.product_frac, p),
    cumulative_pct: Number((p * 100).toFixed(1)),
  })).filter((x) => x.size_mm !== null);

  return {
    uncertainty: uq,
    css_mm: Number(args.css_mm),
    throw_mm: r.model ? (Number(args.throw_mm) || 25) : null,
    K1_mm: r.K1_mm, K2_mm: r.K2_mm,
    feed_p80_mm: r.feed_p80_mm,
    product_p80_mm: r.product_p80_mm,
    reduction_ratio: r.reduction_ratio,
    percentiles: {
      p20: percentile(sizes, r.product_frac, 0.2),
      p50: percentile(sizes, r.product_frac, 0.5),
      p80: r.product_p80_mm,
    },
    sample_curve: sample,
    product_frac: r.product_frac,
    product_cum: r.product_cum,
    mass_balance: { sum_error: r.mass_balance_error, max_negative: r.max_negative_mass ?? null },
    power,
    model: r.model,
    parameter_source: paramSource,
    calibration_basis: cal.why,
    parameter_source: paramSource,
    calibration_basis: cal.found ? cal.why : cal.why,
    feed_distribution_params: params,
    assumptions,
    warnings,
  };
}

export function flowsheet(args = {}) {
  const sizes = sieveSeries(0.5, 512);
  const { fn, params } = distributionFromP80({ p80Mm: args.feed_p80_mm, n: args.feed_n });
  const { frac } = discretize(fn, sizes);

  const stages = (args.stages ?? []).map((s) => {
    if (s.type === 'crusher') {
      if (!(Number(s.css_mm) > 0)) throw new Error(`破碎段「${s.name ?? ''}」必须给 css_mm`);
      const cal = getCalibration({ model: s.model, cavity: s.cavity, cssMm: Number(s.css_mm) });
    return { type: 'crusher', name: s.name, cssMm: Number(s.css_mm), throwMm: s.throw_mm, breakage: cal.params, _cal: cal };
    }
    if (s.type === 'screen') {
      if (!(Number(s.aperture_mm) > 0)) throw new Error(`筛分段「${s.name ?? ''}」必须给 aperture_mm`);
      return {
        type: 'screen', name: s.name, apertureMm: Number(s.aperture_mm),
        recirculateTo: Number.isInteger(s.recirculate_to) ? s.recirculate_to : undefined,
        params: Number.isFinite(Number(s.screen_efficiency)) ? { overallEfficiency: Number(s.screen_efficiency) } : undefined,
      };
    }
    throw new Error(`未知段类型 "${s.type}"（仅支持 crusher / screen）`);
  });
  if (stages.length === 0) throw new Error('stages 不能为空');

  const r = simulateFlowsheet({ sizes, feedFrac: frac, stages, maxIter: args.max_iter });

  // 各破碎段能耗：用该段实际入料/出料 P80 做 Bond 估算
  const wi = pickWi(args.ore, args.bond_wi);
  let totalPower = null;
  if (wi.wi > 0) {
    let sum = 0;
    let ok = true;
    for (const s of r.stages) {
      if (s.type !== 'crusher' || !s.product_p80_mm || !s.feed_p80_mm) continue;
      const w = bondPower({ wi: wi.wi, f80Mm: s.feed_p80_mm, p80Mm: s.product_p80_mm });
      if (w) sum += w.w_kwh_per_t; else ok = false;
    }
    if (ok) totalPower = { total_kwh_per_t: Number(sum.toFixed(3)), wi_used: wi.wi, note: `按各破碎段 Bond 估算累加（Wi=${wi.wi}，${wi.source}）；不含筛分、输送与磨矿` };
  }

  const overall = r.final_p80_mm && r.stages[0]?.feed_p80_mm
    ? Number((r.stages[0].feed_p80_mm / r.final_p80_mm).toFixed(2))
    : null;

  const calUsed = stages.filter((s) => s.type === 'crusher' && s._cal && s._cal.found);

  /* ── 流程级不确定度 ──
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

  // flowsheet 层级的参数来源（与 crusherCurve 同名，避免引用未定义）
  const paramSource = calUsed.length ? 'MACKORN-实测标定' : 'LITERATURE';
  const cal = { why: calUsed.length ? ('命中 ' + calUsed.length + ' 段标定') : '知识库中暂无匹配标定，使用文献默认值' };
  const assumptions = [
    A('破碎函数参数来源：' + (calUsed.length ? ('MACKORN-实测标定（' + calUsed.length + ' 段命中知识库）') : '文献默认值（知识库中暂无匹配标定）'), calUsed.length ? 'MACKORN-实测' : 'LITERATURE'),
    A('流程稳态解用群体平衡迭代（逐段算产品曲线 + 循环料回代至收敛）', 'LITERATURE (population balance)'),
    A('每段破碎用 Whiten(1972) 模型；筛分用 logistic 分配曲线 E(x)=1/(1+(x/d50c)^k)', 'LITERATURE (Whiten 1972 / VSMA / Karra)'),
    A('物料平衡以**绝对质量**推进（新鲜料 = 1），避免每段归一化导致质量不守恒', 'NUMERICS'),
    A(`给料分布由 P80 拟合：${JSON.stringify(params)}`, 'ENGINEERING'),
    A('破碎函数与筛分参数为文献典型值，须用 MACKORN 实测标定', 'LITERATURE'),
  ];
  const warnings = [
    '本流程模拟为**公开文献模型**，不含任何第三方专有软件的算法或标定系数；正式方案前必须用 MACKORN 现场数据标定 φ/γ/β、啮合系数与筛分效率',
  ];
  if (!r.converged) warnings.push(`迭代 ${r.iterations} 次未收敛，结果不可用；请放宽 max_iter 或检查段定义（是否存在未接回的筛分段导致物料累积）`);
  if (!r.mass_balance.ok) warnings.push(`物料平衡未守恒（出料率 ${r.mass_balance.yield_ratio}），结果不可用`);
  if (r.circulating_load_ratio > 0.6) warnings.push(`循环负荷 ${r.circulating_load_ratio} 偏高（>0.6），实际选型应复核筛分效率与破碎机能力余量`);
  if (r.circulating_load_ratio > 0 && r.circulating_load_ratio < 0.05) warnings.push(`循环负荷仅 ${r.circulating_load_ratio}，偏低，检查筛孔是否过大导致筛上几乎不返料`);

  return {
    uncertainty: uqFlow,
    feed_p80_mm: r.stages[0]?.feed_p80_mm ?? null,
    final_p80_mm: r.final_p80_mm,
    overall_reduction_ratio: overall,
    iterations: r.iterations,
    converged: r.converged,
    circulating_load_ratio: r.circulating_load_ratio,
    circulating_load_note: r.circulating_load_ratio >= 0.15 && r.circulating_load_ratio <= 0.35
      ? '（落在 MACKORN 工程经验区间 1.15-1.35 的等效范围，属正常）'
      : '（工程经验常见 0.15-0.35，请复核）',
    stages: r.stages,
    mass_balance: r.mass_balance,
    power: totalPower,
    calibrated_stages: calUsed.length,
    parameter_source: calUsed.length ? 'MACKORN-实测标定' : 'LITERATURE',
    model: r.model,
    parameter_source: paramSource,
    calibration_basis: cal.found ? cal.why : cal.why,
    feed_distribution_params: params,
    assumptions,
    warnings,
  };
}
