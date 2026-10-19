/**
 * 统计与可靠性模块
 *
 * 来源：第 21 视角（数学家）+ 第 23 视角（可靠性工程）
 *
 * 为什么单独建：
 *   前面的分析都是"看排名、看增速"，属于描述性统计。
 *   真正能发现问题的是**推断统计** ——
 *     · 威布尔拟合 → 从换衬板记录预测失效时间
 *     · 集中度（HHI/Gini）→ 市场是分散还是集中
 *     · 残差分析 → 找出"模型解释不了"的机会
 *
 * 全部为纯函数，零依赖，可被任何工具调用。
 */

const R = (v, d = 4) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/* ══════════════════════════════════════════════════════════
 * 一、描述统计
 * ══════════════════════════════════════════════════════════ */
export function describe(values) {
  const v = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return null;
  const sum = v.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  const variance = n > 1 ? v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const q = (p) => {
    const k = (n - 1) * p, lo = Math.floor(k), hi = Math.min(lo + 1, n - 1);
    return v[lo] + (v[hi] - v[lo]) * (k - lo);
  };
  const skew = sd > 0 ? (v.reduce((a, b) => a + (b - mean) ** 3, 0) / n) / sd ** 3 : null;
  const kurt = sd > 0 ? (v.reduce((a, b) => a + (b - mean) ** 4, 0) / n) / sd ** 4 - 3 : null;
  return {
    n, mean: R(mean), median: R(median), sd: R(sd), cv: mean ? R(sd / mean) : null,
    min: R(v[0]), max: R(v[n - 1]),
    percentiles: { p10: R(q(0.10)), p25: R(q(0.25)), p50: R(q(0.50)), p75: R(q(0.75)), p90: R(q(0.90)), p99: R(q(0.99)) },
    skewness: R(skew), excess_kurtosis: R(kurt),
    mean_over_median: median ? R(mean / median, 2) : null,
    interpretation: [
      mean && sd / mean > 1 ? `CV=${R(sd / mean, 2)} > 1 → 极度离散，均值无代表性，须用中位数或分位数` : null,
      skew !== null && skew > 1 ? `偏度 ${R(skew, 2)} > 0 → 右偏，均值被少数大值拉高（均值/中位数=${R(mean / median, 1)}倍）` : null,
      kurt !== null && kurt > 1 ? `峰度 ${R(kurt, 1)} → 厚尾，极端值是真实结构而非噪声` : null,
    ].filter(Boolean),
  };
}

/* ══════════════════════════════════════════════════════════
 * 二、市场集中度
 * ══════════════════════════════════════════════════════════ */
export function concentration(values) {
  const v = (values || []).map(Number).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => b - a);
  const n = v.length;
  if (n === 0) return null;
  const total = v.reduce((a, b) => a + b, 0);
  const share = (k) => R(v.slice(0, k).reduce((a, b) => a + b, 0) / total * 100, 1);
  const hhi = R(v.reduce((a, b) => a + (b / total * 100) ** 2, 0), 1);
  const asc = [...v].sort((a, b) => a - b);
  const gini = R(asc.reduce((a, b, i) => a + (2 * (i + 1) - n - 1) * b, 0) / (n * total), 3);
  return {
    n, total: R(total, 0),
    cr1: share(1), cr3: share(3), cr5: share(5), cr10: share(10), cr20: share(20),
    hhi, gini,
    hhi_band: hhi < 1500 ? '竞争型（HHI<1500）' : hhi < 2500 ? '中度集中（1500-2500）' : '高度集中（>2500）',
    interpretation: [
      `前 10 国占 ${share(10)}% → 资源有限时须聚焦，广撒网低效`,
      `HHI ${hhi} → ${hhi < 1500 ? '整体竞争型，不存在垄断买家' : '存在较强议价方'}`,
      `Gini ${gini} → 购买力分布${gini > 0.6 ? '极不均匀' : gini > 0.4 ? '较不均匀' : '较均匀'}`,
    ],
  };
}

/* ══════════════════════════════════════════════════════════
 * 三、线性回归与残差分析（找机会）
 * ══════════════════════════════════════════════════════════ */
export function residualAnalysis(pairs) {
  const p = (pairs || []).filter((d) => Array.isArray(d) && Number.isFinite(Number(d[0])) && Number.isFinite(Number(d[1]))).map((d) => [Number(d[0]), Number(d[1])]);
  const n = p.length;
  if (n < 3) return null;
  const mx = p.reduce((a, b) => a + b[0], 0) / n, my = p.reduce((a, b) => a + b[1], 0) / n;
  const sxx = p.reduce((a, b) => a + (b[0] - mx) ** 2, 0);
  const sxy = p.reduce((a, b) => a + (b[0] - mx) * (b[1] - my), 0);
  const syy = p.reduce((a, b) => a + (b[1] - my) ** 2, 0);
  if (sxx === 0) return null;
  const slope = sxy / sxx, intercept = my - slope * mx;
  const r = syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  const resid = p.map((d) => ({ x: d[0], y: d[1], predicted: intercept + slope * d[0], residual: d[1] - (intercept + slope * d[0]) }));
  resid.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));
  return {
    n, slope: R(slope, 4), intercept: R(intercept, 2),
    pearson_r: R(r), r_squared: R(r * r),
    unexplained_pct: R((1 - r * r) * 100, 1),
    top_residuals: resid.slice(0, 10).map((d) => ({ x: R(d.x, 1), y: R(d.y, 1), predicted: R(d.predicted, 1), residual: R(d.residual, 1) })),
    interpretation: [
      `r=${R(r, 2)}，R²=${R(r * r, 2)} → ${R((1 - r * r) * 100, 0)}% 的方差未被解释`,
      '残差为正 = 实际高于模型预测；残差为负 = 低于预测',
      '这正是"看排名看不出来"的机会所在 —— 须逐个分析残差最大的样本',
    ],
  };
}

/* ══════════════════════════════════════════════════════════
 * 四、威布尔分布（可靠性工程核心）
 *
 * 用现场换衬板记录（寿命小时）拟合两参数威布尔：
 *   F(t) = 1 − exp(−(t/η)^β)
 *   β 形状参数：<1 早期失效；≈1 随机失效；>1 磨损型（衬板应为 >1）
 *   η 尺度参数：特征寿命（63.2% 失效对应的时间）
 *
 * 拟合方法：对 x=ln(t)、y=ln(−ln(1−F)) 做最小二乘（中位秩估计 F）
 *   → 这是工程上最常用、最稳健的做法（MLE 对小样本偏差更大）
 * ══════════════════════════════════════════════════════════ */
export function weibullFit(lives) {
  const t = (lives || []).map(Number).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  const n = t.length;
  if (n < 3) {
    return { ok: false, reason: '样本量不足（<3），无法拟合威布尔参数 —— 须至少 3 次更换记录，建议 ≥5 次', n };
  }
  // 中位秩估计 F_i = (i − 0.3) / (n + 0.4)
  const xs = [], ys = [];
  for (let i = 0; i < n; i++) {
    const F = (i + 1 - 0.3) / (n + 0.4);
    if (F <= 0 || F >= 1) continue;
    xs.push(Math.log(t[i]));
    ys.push(Math.log(-Math.log(1 - F)));
  }
  const m = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / m, my = ys.reduce((a, b) => a + b, 0) / m;
  const sxx = xs.reduce((a, b) => a + (b - mx) ** 2, 0);
  const sxy = xs.reduce((a, b, i) => a + (b - mx) * (ys[i] - my), 0);
  const syy = ys.reduce((a, b) => a + (b - my) ** 2, 0);
  if (sxx === 0) return { ok: false, reason: '所有寿命相同，无法拟合', n };
  const beta = sxy / sxx;                       // 斜率 = β
  const lnEta = my - beta * mx;                 // 截距 = −β·ln(η) → η = exp(−截距/β)
  const eta = Math.exp(-lnEta / beta);
  const r = syy > 0 ? sxy / Math.sqrt(sxx * syy) : 1;
  const r2 = r * r;

  // 样本量是否足够（β 拟合建议 ≥5，严格 ≥10）
  const adequacy = n >= 10 ? '充分' : n >= 5 ? '勉强可用（建议补至 ≥10）' : '不足（结论仅供参考）';

  return {
    ok: true,
    replacement_timing_note: '⚠️ B10 不是更换时点。按 Barlow & Proschan (1965) 年龄更换模型，最优更换时点 T* 取决于成本比 c_f/c_p：β=2、η=8000h 时，c_f/c_p=5 → T*=4080h（B10=2597h，用 B10 换会浪费约 36% 寿命）；只有 c_f/c_p≈10 时 B10 才接近 T*。破碎机 c_f/c_p 通常 ≫10 → 应在 B10 之前主动更换。B10 用于备件覆盖，T* 用于更换时点，两者不可混用。',
    n,
    beta: R(beta, 3),
    eta: R(eta, 1),
    beta_meaning: beta < 0.9 ? 'β<1 → 早期失效型（磨合期问题，须查装配/材质）'
      : beta <= 1.1 ? 'β≈1 → 随机失效型（与外因相关，不是磨损主导）'
        : 'β>1 → 磨损型（正常，衬板应属此类）',
    r_squared: R(r2, 4),
    fit_quality: r2 > 0.9 ? '拟合良好（注：R² 在威布尔概率图上判别力弱，建议改用 Anderson-Darling）' : r2 > 0.75 ? '拟合可接受' : '拟合较差 —— 数据可能不是单一失效模式（检查是否有批次差异）',
    sample_adequacy: adequacy,
    b_life: {
      B10: R(eta * Math.pow(-Math.log(0.90), 1 / beta), 1),
      B50: R(eta * Math.pow(-Math.log(0.50), 1 / beta), 1),
      B1: R(eta * Math.pow(-Math.log(0.99), 1 / beta), 1),
      note: 'B10 = 10% 失效概率对应的寿命 —— 用途是【备件覆盖】（下单时点 = B10 − 提前期 − 运输 − 余量），不是更换时点；B50 = 中位寿命。更换时点应解 Barlow-Proschan 年龄更换模型 T*（见 reliability note）',
    },
    mean_life: R(eta * gammaFn(1 + 1 / beta), 1),
    interpretation: [
      `β=${R(beta, 2)} → ${beta > 1.1 ? '磨损型失效，符合衬板特征' : '非磨损型，须排查装配或材质问题'}`,
      `B10 寿命 ${R(eta * Math.pow(-Math.log(0.90), 1 / beta), 0)} h → 按此时点备货，可覆盖 90% 的更换需求`,
      `样本量 ${n} 次：${adequacy}`,
      '⚠️ 前提：样本必须是【失效记录】而非【计划更换记录】。若绝大多数衬板是计划更换（失效数 r=0），β 在数学上不可辨识 —— 拟合出的是更换策略分布，不是寿命分布，此时本结果不可用于寿命预测',
    ],
    assumptions: [
      { item: '两参数威布尔 + 中位秩估计 F=(i−0.3)/(n+0.4) + 最小二乘拟合', source: 'WEIBULL(1951) / 工程通行做法' },
      { item: '假设样本来自同一失效模式（同机型、同腔型、同矿石）', source: 'ASSUMPTION' },
    ],
  };
}

/** 伽马函数（Lanczos 近似），用于威布尔均值 E[T] = η·Γ(1+1/β) */
function gammaFn(z) {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < g.length; i++) x += g[i] / (z + i + 1);
  const t = z + g.length - 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/* ══════════════════════════════════════════════════════════
 * 五、增长率修正（第 21 视角的统计纪律）
 *
 * 小基数高增长是噪声。必须与基数一起看。
 * 规则：基数低于分位数 P25 的国家，其增长率标注为"基数效应，不可靠"。
 * ══════════════════════════════════════════════════════════ */
export function growthWithBaseEffect(items) {
  const rows = (items || []).map((d) => ({
    name: d.name, base: Number(d.base) || 0, latest: Number(d.latest) || 0,
    growth: d.base > 0 && d.latest > 0 ? (d.latest / d.base - 1) : null,
  })).filter((d) => d.growth !== null);
  if (!rows.length) return null;
  const bases = describe(rows.map((d) => d.latest));
  const p25 = bases.percentiles.p25;
  for (const r of rows) {
    r.reliable = r.latest >= p25;
    r.note = r.reliable ? '基数足够，增长可信' : `2023 进口额低于 P25（${p25}），高增长属基数效应，不可作为市场判断依据`;
  }
  rows.sort((a, b) => b.growth - a.growth);
  const reliable = rows.filter((r) => r.reliable);
  return {
    p25_threshold: p25,
    total: rows.length,
    reliable_count: reliable.length,
    noisy_count: rows.length - reliable.length,
    top_reliable: reliable.slice(0, 10),
    top_noisy: rows.filter((r) => !r.reliable).slice(0, 5),
    interpretation: [
      `${rows.length} 个样本中，${rows.length - reliable.length} 个的基数低于 P25（${p25}）—— 其增长率是基数效应`,
      `只有 ${reliable.length} 个国家的增长可作为市场判断依据`,
      '这条纪律直接来自第 21 视角：简单平均增速会被小基数国家严重污染',
    ],
  };
}
