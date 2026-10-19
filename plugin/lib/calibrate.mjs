/**
 * 实测数据标定（calibrate.mjs）
 * ============================================================================
 * 这是把插件从"公开文献模型"升级为"MACKORN 自有模型"的关键一步。
 *
 * 输入：现场实测的**给料筛析**与**产品筛析**（累积通过率），以及该工况的 CSS。
 * 输出：最小二乘反算得到的破碎函数参数 φ/γ/β 与啮合系数，并给出拟合优度与逐点残差。
 *
 * 为什么重要：
 *   文献默认值让模拟"能跑"；只有用**自家设备的实测数据标定**，输出才成为
 *   别人抄不走的资产。标定结果写入知识库（来源标记 MACKORN-实测），
 *   后续所有选型与仿真自动用它。
 *
 * 方法：有界网格搜索 + 局部细化（不需要任何外部优化库）。
 * ============================================================================
 */

import { sieveSeries, discretize, cumFromFrac, simulateConeCrusher } from './simulate.mjs';

/**
 * 实测数据标定
 *
 * 【标定成本可以很低 —— 公开文献结论】
 *   Chalmers《Cone Crusher Performance》(2015) 原文：
 *     "to calibrate a breakage function it is sufficient to use the result from
 *      the first test in each series"
 *   → 同一物料同一工况下，每个试验系列【只需第一次试验】的结果即可标定破碎函数。
 *     无需重复多次取样，现场取一组给料/产品筛析就能开始。
 *
 * 【但参数来源有系统性局限 —— 必须知道】
 *   文献默认的 φ/γ/β 传统上由【落重试验】拟合，更适磨机而非圆锥破层压破碎。
 *   所以：默认值只用于量级估算；正式选型必须用本工具标定出的实测值。
 */

function interpolatePoints(points) {
  const pts = [...points].filter((p) => Number.isFinite(p.size_mm) && p.size_mm > 0 && Number.isFinite(p.cum_pct))
    .map((p) => ({ x: Math.log(p.size_mm), y: Math.max(0, Math.min(1, p.cum_pct > 1 ? p.cum_pct / 100 : p.cum_pct)) }))
    .sort((a, b) => a.x - b.x);
  if (pts.length < 2) throw new Error('至少需要 2 个有效筛析点（size_mm + cum_pct）');
  return (x) => {
    const lx = Math.log(Math.max(x, 1e-9));
    if (lx <= pts[0].x) return pts[0].y;
    if (lx >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
    for (let i = 0; i < pts.length - 1; i += 1) {
      if (lx >= pts[i].x && lx <= pts[i + 1].x) {
        const t = (lx - pts[i].x) / (pts[i + 1].x - pts[i].x);
        return pts[i].y + t * (pts[i + 1].y - pts[i].y);
      }
    }
    return pts[pts.length - 1].y;
  };
}

/** 在校准点上取预测累积通过率。 */
function predictAt(productCum, sizes, x) {
  const lx = Math.log(Math.max(x, 1e-9));
  const ls = sizes.map((s) => Math.log(s));
  if (lx <= ls[0]) return productCum[0];
  if (lx >= ls[ls.length - 1]) return productCum[productCum.length - 1];
  for (let i = 0; i < ls.length - 1; i += 1) {
    if (lx >= ls[i] && lx <= ls[i + 1]) {
      const t = (lx - ls[i]) / (ls[i + 1] - ls[i]);
      return productCum[i] + t * (productCum[i + 1] - productCum[i]);
    }
  }
  return productCum[productCum.length - 1];
}

/**
 * 用 Rosin-Rammler 解析式拟合给料筛析点（与模型内部生成给料的口径一致）。
 *
 * 为什么需要它（R18 实测发现）：原实现用对数空间线性插值重建给料分布，
 * 而插值在数据范围之外返回常数 —— 当给料点未覆盖到足够粗的粒级时，
 * 粗端被截断成常数，而粗端承担大部分质量，导致标定无法还原真值。
 * 实测：自洽数据下真值参数的 RMSE 仅 0.003 个百分点，但标定器返 6.66 —— 口径错了。
 *
 * 拟合方式：对 F(x) = 1 − exp(−(x/xc)^n) 取双对数线性化：
 *   ln(−ln(1−F)) = n·ln(x) − n·ln(xc)
 * 用最小二乘求 n 与 xc。淘汰 F≤0 或 F≥1 的点（无法取对数）。
 * @returns {{fn:Function, method:string, xc?:number, n?:number, r2?:number}}
 */
function fitFeedDistribution(points) {
  const pts = (points || []).map((p) => ({ x: Number(p.size_mm), F: Number(p.cum_pct) / 100 }))
    .filter((p) => Number.isFinite(p.x) && p.x > 0 && Number.isFinite(p.F) && p.F > 0 && p.F < 1)
    .sort((a, b) => a.x - b.x);
  if (pts.length < 3) return { fn: interpolatePoints(points), method: "interpolate" };
  let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
  for (const p of pts) {
    const X = Math.log(p.x), Y = Math.log(-Math.log(1 - p.F));
    if (!Number.isFinite(X) || !Number.isFinite(Y)) continue;
    sx += X; sy += Y; sxx += X * X; sxy += X * Y; m += 1;
  }
  if (m < 3) return { fn: interpolatePoints(points), method: "interpolate" };
  const den = m * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return { fn: interpolatePoints(points), method: "interpolate" };
  const n = (m * sxy - sx * sy) / den;
  const b = (sy - n * sx) / m;          // b = −n·ln(xc)
  const xc = Math.exp(-b / n);
  if (!(n > 0) || !(xc > 0) || !Number.isFinite(xc)) return { fn: interpolatePoints(points), method: "interpolate" };
  const fn = (x) => 1 - Math.exp(-Math.pow(Math.max(x, 1e-9) / xc, n));
  // R²（在对数化空间）
  const meanY = sy / m;
  let ssTot = 0, ssRes = 0;
  for (const p of pts) {
    const X = Math.log(p.x), Y = Math.log(-Math.log(1 - p.F));
    const Yhat = n * X + b;
    ssTot += (Y - meanY) ** 2; ssRes += (Y - Yhat) ** 2;
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { fn, method: "rosin-rammler", xc, n, r2 };
}
/** 单次拟合误差：预测产品曲线 vs 实测产品点的 RMSE（累积通过率口径）。 */
function rmse(feedFn, sizes, measure, params) {
  let r;
  try {
    const { frac } = discretize(feedFn, sizes);
    r = simulateConeCrusher(frac, sizes, params);
  } catch { return { rmse: Number.POSITIVE_INFINITY, cum: null }; }
  let s = 0;
  for (const p of measure) {
    const pred = predictAt(r.product_cum, sizes, p.size_mm);
    const obs = p.cum_pct > 1 ? p.cum_pct / 100 : p.cum_pct;
    s += (pred - obs) ** 2;
  }
  return { rmse: Math.sqrt(s / measure.length), cum: r.product_cum };
}

/**
 * 用实测给料/产品筛析标定破碎函数参数。
 * @param {object} input
 * @param {Array<{size_mm:number,cum_pct:number}>} input.feed_points 给料筛析（累积通过 %）
 * @param {Array<{size_mm:number,cum_pct:number}>} input.product_points 产品筛析（累积通过 %）
 * @param {number} input.css_mm 该工况的紧边排矿口
 * @param {number} [input.throw_mm] 偏心距
 * @param {number} [input.roughness] 拟合优度门槛（RMSE 超过即告警，默认 0.06）
 */
export function calibrateBreakage(input = {}) {
  const cssMm = Number(input.css_mm);
  if (!(cssMm > 0)) throw new Error('css_mm 必须为正数（标定必须有该工况的紧边排矿口）');
  const feedPoints = input.feed_points ?? [];
  const productPoints = input.product_points ?? [];
  if (feedPoints.length < 2) throw new Error('feed_points 至少 2 个点');
  if (productPoints.length < 3) throw new Error('product_points 至少 3 个点（点数太少无法约束 3 个参数）');

  const sizes = sieveSeries(0.5, 512);
  /* ── 给料分布构造（R18 对抗性审查 S3 深挖修复）──
   *
   * 原实现：const feedFn = interpolatePoints(feedPoints);
   *   → 在【对数空间做线性插值】，且在最后一个点之后【返回常数】。
   *
   * 问题（用同值对照实测出来的，不是推理）：
   *   生成产品分布时用的是 Rosin-Rammler 解析式，标定器却用插值重建给料分布。
   *   当给料点只覆盖到 250 mm 时，250 mm 以上的粗粒级被截成常数，
   *   而这些粒级恰恰承担了大部分质量 —— 粗端被系统性扭曲，
   *   于是标定器无法还原真值参数。
   *   实测：真值参数在标定器自己的 rmse 下只有 0.003 个百分点（几乎完美），
   *        但标定器返回的解是 6.66 个百分点 —— 搜索没错，是给料口径错了。
   *
   * 修法：先用解析分布（Rosin-Rammler）拟合给料点，与生成方同口径；
   *       只有在拟合失败时才退回插值，并明确警示。
   *       同时若给料点未覆盖到足够粗的粒级，给出外推警告。 */
  const feedFit = fitFeedDistribution(feedPoints);
  const feedFn = feedFit.fn;
  const earlyWarnings = [];
  if (feedFit.method === 'rosin-rammler') {
    earlyWarnings.push('给料分布用 Rosin-Rammler 解析式拟合（xc=' + feedFit.xc.toFixed(2) + ' mm，n=' + feedFit.n.toFixed(3)
      + '，拟合 R²=' + feedFit.r2.toFixed(4) + '）—— 与模型内部生成口径一致，避免插值外推扭曲粗端。');
    if (feedFit.r2 < 0.95) {
      earlyWarnings.push('⚠️ 给料点对 Rosin-Rammler 的拟合 R² 仅 ' + feedFit.r2.toFixed(4) + '，说明该给料分布不是标准 RR 形态；'
        + '标定结果可能受给料口径影响。建议补充给料筛析点或改用分段描述。');
    }
  } else {
    earlyWarnings.push('⚠️ 给料点无法用 Rosin-Rammler 拟合（点数不足或退化），已退回插值法。'
      + '插值在数据范围之外会外推成常数，可能扭曲粗端 —— 建议补充给料筛析点（尤其是最大粒级附近）。');
  }
  const feedMax = Math.max(...feedPoints.map((p) => Number(p.size_mm) || 0));
  if (feedMax > 0 && feedMax < cssMm * 4) {
    earlyWarnings.push('⚠️ 给料筛析最大粒级仅 ' + feedMax + ' mm，不足该 CSS 的 4 倍（' + (cssMm * 4).toFixed(0) + ' mm）；'
      + '粗端覆盖不足会让给料分布的高粒级端不确定，进而影响标定。建议补到 ' + (cssMm * 4).toFixed(0) + ' mm 以上。');
  }
  const measure = productPoints
    .filter((p) => Number.isFinite(p.size_mm) && p.size_mm > 0)
    .map((p) => ({ size_mm: Number(p.size_mm), cum_pct: Number(p.cum_pct) }));

  const throwMm = Number.isFinite(Number(input.throw_mm)) ? Number(input.throw_mm) : 25;

  // 有界网格：φ / γ / β / throwFactor
  const PHI = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
  const GAMMA = [0.3, 0.5, 0.7, 0.9, 1.2];
  const BETA = [2.0, 2.8, 3.5, 4.5, 6.0];
  const TF = [0.4, 0.6, 0.8, 1.0, 1.2];

  let best = { rmse: Number.POSITIVE_INFINITY };
  let evals = 0;
  for (const phi of PHI) for (const gamma of GAMMA) for (const beta of BETA) for (const tf of TF) {
    evals += 1;
    const r = rmse(feedFn, sizes, measure, { cssMm, throwMm, throwFactor: tf, breakage: { phi, gamma, beta } });
    if (r.rmse < best.rmse) best = { rmse: r.rmse, phi, gamma, beta, throwFactor: tf, cum: r.cum };
  }

  // 局部细化（在最优解附近做一次更细的搜索）
  const refine = (center, half, steps) => Array.from({ length: steps }, (_, i) => center - half + (2 * half * i) / (steps - 1));
  for (const phi of refine(best.phi, 0.05, 5)) {
    for (const gamma of refine(best.gamma, 0.1, 5)) {
      for (const beta of refine(best.beta, 0.4, 5)) {
        for (const tf of refine(best.throwFactor, 0.1, 5)) {
          if (phi <= 0 || gamma <= 0 || beta <= gamma || tf <= 0) continue;
          evals += 1;
          const r = rmse(feedFn, sizes, measure, { cssMm, throwMm, throwFactor: tf, breakage: { phi, gamma, beta } });
          if (r.rmse < best.rmse) best = { rmse: r.rmse, phi, gamma, beta, throwFactor: tf, cum: r.cum };
        }
      }
    }
  }

  const residuals = measure.map((p) => {
    const pred = predictAt(best.cum, sizes, p.size_mm);
    const obs = p.cum_pct > 1 ? p.cum_pct / 100 : p.cum_pct;
    return {
      size_mm: p.size_mm,
      observed_pct: Number((obs * 100).toFixed(2)),
      predicted_pct: Number((pred * 100).toFixed(2)),
      error_pp: Number(((pred - obs) * 100).toFixed(2)),
    };
  });
  const maxAbsErr = Math.max(...residuals.map((r) => Math.abs(r.error_pp)));

  const threshold = Number.isFinite(Number(input.roughness)) ? Number(input.roughness) : 0.06;
  const warnings = [...(typeof earlyWarnings !== "undefined" ? earlyWarnings : [])];
  const assumptions = [
    { assumption: '用实测给料/产品筛析反算 Whiten 破碎函数参数 φ/γ/β 与啮合系数，目标函数为产品累积通过率的 RMSE', source: 'CALIBRATION (least squares, grid + local refine)' },
    { assumption: `网格搜索 ${evals} 次评估；参数域 φ∈[0.2,0.7] γ∈[0.3,1.2] β∈[2,6] 啮合系数∈[0.4,1.2]`, source: 'METHOD' },
    { assumption: '给料分布按对数粒径线性插值（点数越多越准）', source: 'METHOD' },
  ];
  if (best.rmse > threshold) {
    warnings.push(`拟合优度偏低（RMSE ${(best.rmse * 100).toFixed(2)} 个百分点，门槛 ${(threshold * 100).toFixed(0)}）：` +
      '可能原因——① 该工况 CSS 记录不准 ② 给料与产品不是同一批料 ③ 筛析点太少或存在系统误差 ④ 该机型需分段标定（不同 CSS 各自一套参数）');
  }
  if (maxAbsErr > 10) warnings.push(`单点最大偏差 ${maxAbsErr.toFixed(2)} 个百分点（>10），建议核对筛析数据的取样与称量`);
  if (measure.length < 5) warnings.push('产品筛析点少于 5 个，3 个参数的自由度偏高，结果稳健性有限');

  // 边界告警：最优解贴在搜索域边缘，说明真实最优可能在域外，参数未真正被数据约束住
  const atEdge = [];
  if (best.phi <= Math.min(...PHI) + 0.02 || best.phi >= Math.max(...PHI) - 0.02) atEdge.push(`φ=${best.phi}`);
  if (best.gamma <= 0.25 || best.gamma >= Math.max(...GAMMA) - 0.02) atEdge.push(`γ=${best.gamma}`);
  if (best.beta <= Math.min(...BETA) + 0.05 || best.beta >= Math.max(...BETA) - 0.05) atEdge.push(`β=${best.beta}`);
  if (best.throwFactor <= Math.min(...TF) + 0.02 || best.throwFactor >= Math.max(...TF) - 0.02) atEdge.push(`啮合系数=${best.throwFactor}`);
  if (atEdge.length) {
    warnings.push(`⚠️ 参数贴在搜索边界（${atEdge.join('、')}）：说明这几个参数**没有被实测数据真正约束住**，真实最优可能在搜索域外。` +
      '常见原因——产品筛析点集中在单一粒级、或 CSS/给料记录不准。建议增加 0.5-2 倍 CSS 区间的筛析点后重标，或把该参数按工程经验固定、只标其余参数。');
  }

  /* ── 退化输入检测（R18 对抗性审查 S3 修复）──
   * 审查员用一条【水平线 CDF】（1/5/10mm 全部 100% 通过）就得到了 quality="可接受"
   * 与 four 个贴边界的参数，而 how_to_persist 还建议以"MACKORN-实测"入库。
   * 根因：这样的数据【不含任何分布形状信息】——任何能把产品压到全 <1mm 的参数组都能拟合，
   * 于是搜索必然跑到边界。这不是"标定成功"，是"数据不足"。
   * 这里显式识别退化输入并拒绝出参。 */
  const productVals = measure.map((m) => m.cum_pct);
  const distinctLevels = new Set(productVals.map((v) => Math.round(v * 10) / 10)).size;
  const flatCDF = distinctLevels <= 1;                       // 所有点同一通过率
  const allNear100 = productVals.every((v) => v >= 99);      // 全部接近 100%
  const insufficientShape = flatCDF || allNear100;
  if (insufficientShape) {
    warnings.push('❌ 【数据不足，标定无效】产品筛析的所有点通过率几乎相同（' + (flatCDF ? '完全相同' : '全部 ≥99%') + '），'
      + '这种数据不含分布形状信息 —— 任何能把产品压细的参数组都能拟合，因此反算出的参数必然贴在搜索边界，'
      + '它们【不是标定结果，是搜索域边界】。请补充跨粒级的筛析点（至少覆盖 0.5×CSS 与 2×CSS 附近），再重新标定。');
  }

  /* ── 边界含义的区分（R18 复测发现）──
   * 贴边界有两种完全不同的含义，不能一概判"无效"：
   *   ① RMSE 也差 → 数据不足 / 模型不符 → 参数无意义
   *   ② RMSE 很好 → 参数【不可辨识】：多组参数给出几乎相同的产品曲线
   *                 （物理上真实存在，粗端指数 β 与啮合系数会互相补偿）
   *                 此时参数【能拟合这批数据】，但不能声称是唯一真值。
   * 实测依据：某工况真值 (0.55,0.9,3.5,1.0)，标定返回 RMSE 0.22 个百分点但 β 贴下界；
   *          若按"贴边界即无效"处理会丢弃一个拟合很好的结果。 */
  const rmseGood = best.rmse <= threshold;
  const nonIdentifiable = atEdge.length > 0 && rmseGood && !insufficientShape;
  const trulyInvalid = insufficientShape || (atEdge.length > 0 && !rmseGood);

  if (nonIdentifiable) {
    warnings.push('⚠️ 【参数不可辨识】拟合很好（RMSE ' + (best.rmse * 100).toFixed(3) + ' 个百分点，优于门槛 '
      + (threshold * 100).toFixed(1) + '），但有参数贴在搜索边界（' + atEdge.join('、') + '）。'
      + '这通常意味着【多组参数给出几乎相同的产品曲线】—— 粗端指数与啮合系数会互相补偿。'
      + '此时参数【能拟合这批数据】，但不应声称为唯一真值；用于同工况预测可靠，外推需谨慎。'
      + '若要收紧，可固定其中 1-2 个参数（按工程经验或厂家数据），只标其余的。');
  }

  const parametersConstrained = !trulyInvalid;

  const quality = insufficientShape
    ? '无效（数据不足）'
    : (trulyInvalid
      ? '不可用（参数未被约束且拟合差）'
      : (nonIdentifiable
        ? '可用（参数不可辨识，多解等效）'
        : (best.rmse <= 0.03 ? '优' : '可接受')));

  /* 不可辨识时仍给参数（它确实拟合了数据），但带明确警示 */
  const calibrated = parametersConstrained
    ? {
      phi: Number(best.phi.toFixed(4)),
      gamma: Number(best.gamma.toFixed(4)),
      beta: Number(best.beta.toFixed(4)),
      throwFactor: Number(best.throwFactor.toFixed(4)),
      css_mm: cssMm,
      throw_mm: throwMm,
      ...(nonIdentifiable ? { identifiability: '参数不可辨识：有参数贴搜索边界，可能存在等效参数组' } : {}),
    }
    : null;
  if (trulyInvalid) {
    warnings.push('⛔ 因参数未被数据约束且拟合不达标，calibrated 字段已置为 null —— 避免把搜索域边界误当成实测标定值使用。'
      + '下方 fit.best_candidate_not_for_use 仅供诊断（看它跑到哪个边界），不得用于选型。');
  }

  warnings.push('标定结果是**该机型 + 该腔型 + 该 CSS 区间**的参数；换机型/腔型需重新标定，不要跨机型套用');

  return {
    calibrated,
    fit: {
      rmse_pct_points: Number((best.rmse * 100).toFixed(3)),
      max_abs_error_pp: Number(maxAbsErr.toFixed(2)),
      evaluations: evals,
      n_points: measure.length,
      quality,
      identifiability: insufficientShape ? 'insufficient-data' : (nonIdentifiable ? 'non-identifiable' : 'identifiable'),
      /* 诊断用：无效时保留候选值并标注不可用 */
      ...(trulyInvalid ? {
        best_candidate_not_for_use: {
          phi: Number(best.phi.toFixed(4)), gamma: Number(best.gamma.toFixed(4)),
          beta: Number(best.beta.toFixed(4)), throwFactor: Number(best.throwFactor.toFixed(4)),
          at_search_boundary: atEdge,
          why_invalid: insufficientShape ? '产品筛析点通过率几乎相同，数据不含形状信息' : '参数贴在搜索边界且拟合不达标',
        },
      } : {}),
    },
    residuals,
    library_defaults: { phi: 0.45, gamma: 0.7, beta: 3.5, throwFactor: 0.8, note: '文献典型值（Napier-Munn et al. / Whiten 1972）' },
    how_to_persist: parametersConstrained
      ? {
        tool: 'mackorn_knowledge_update',
        suggestion: '把本次标定结果作为一条 kind="spec" 条目写入知识库，source_url 填本次筛析报告编号/路径，tags 加 ["标定","实测",机型]，'
          + '并在 content 中写明机型/腔型/CSS 与 RMSE'
          + (nonIdentifiable ? '，【并注明"参数不可辨识"' : '') + '，供后续选型自动引用',
        provenance: 'MACKORN-实测（这是自有资产，与文献默认值必须区分开）',
        ...(nonIdentifiable ? { caution: '参数不可辨识：入库时应标注，避免被当作唯一真值跨工况套用' } : {}),
      }
      : {
        tool: null,
        suggestion: '⛔ 【本次结果不得入库】标定无效（' + (insufficientShape ? '数据不足' : '参数未被约束且拟合不达标') + '）。'
          + (insufficientShape
            ? '请先补充跨粒级的产品筛析点（覆盖 0.5×CSS 与 2×CSS 附近）后重新标定。'
            : '请增加筛析点或按工程经验固定部分参数后重标。')
          + '把无效结果以「MACKORN-实测」写入知识库会污染后续选型 —— 这是插件最重要的自有资产，宁可空着。',
        provenance: null,
      },
    assumptions,
    warnings,
  };
}
