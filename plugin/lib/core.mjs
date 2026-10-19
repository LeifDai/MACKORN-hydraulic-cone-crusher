/**
 * MACKORN 核心理论内核（core.mjs）
 * ============================================================================
 * 从 `20260924 Mackorn 矿山选矿科研模型V1.py`（类 MackornCoreTheory，
 * 第 46-201 行）逐式移植到 JavaScript，保持同值同舍入（Python round() 为
 * 银行家舍入，此处用 pyRound 复现，golden 对照测试可证同值）。
 *
 * 理论主线：
 *   粗粒级模数 MCFM → 均匀布料 → 速度均匀化 → 磨损稳定 → 模数恒定
 *                 ↑                                    ↓
 *                 └──── 破碎效率提升 ← 料层密度稳定 ←────┘
 * ============================================================================
 */

/** Python round() 语义：十进制定点的 round-half-to-even。 */
export function pyRound(x, nd = 0) {
  if (!Number.isFinite(x)) return x;
  const m = Math.pow(10, nd);
  const scaled = x * m;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let r;
  if (diff > 0.5) r = floor + 1;
  else if (diff < 0.5) r = floor;
  else r = floor % 2 === 0 ? floor : floor + 1;
  return r / m;
}

/** 数值聚合：均值/总体标准差/变异系数。空输入返回 null 而非 NaN。 */
export function stats(values) {
  const n = values.length;
  if (n === 0) return { n: 0, mean: null, std: null, cv: null, min: null, max: null };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  return {
    n,
    mean,
    std,
    cv: mean === 0 ? null : std / mean,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/* ==========================================================================
 * 子模型 1：粗粒级模数 MCFM
 * ========================================================================== */

/**
 * 粗粒级给料模数 M。
 * M = (A1+...+A7 - 7*A8) / (100 - A8)
 * @param {number[]} A 长度 8 的累积筛余百分比数组
 */
export function mcfmFormula(A) {
  if (!Array.isArray(A) || A.length !== 8) {
    throw new Error('A 必须为长度 8 的累积筛余数组（对应 60/40/20/10/5/2.5/1.25/80% 累积筛余）');
  }
  const [A1, A2, A3, A4, A5, A6, A7, A8] = A;
  const denom = 100 - A8;
  if (denom <= 0) return 0.0;
  return pyRound((A1 + A2 + A3 + A4 + A5 + A6 + A7 - 7 * A8) / denom, 3);
}

/** 工程推荐最优模数区间（闭区间）。 */
export function mcfmOptimalRange() {
  return [4.0, 4.5];
}

/** 模数偏离度与风险等级。 */
export function mcfmDeviation(M) {
  const [lo, hi] = mcfmOptimalRange();
  if (lo <= M && M <= hi) return { level: 'optimal', deviation: 0.0 };
  if (M < lo) return { level: 'too_fine', deviation: pyRound(lo - M, 3) };
  return { level: 'too_coarse', deviation: pyRound(M - hi, 3) };
}

/** 模数等级 → 工程含义与调整方向（MACKORN 插件扩展，非 Python 源码）。 */
export function mcfmAdvice(level) {
  switch (level) {
    case 'optimal':
      return {
        meaning: '给料粒度分布落在最优窗口，料层密度与速度场均处于稳定区',
        action: '保持当前布料方式与给料速度，转入在线监测',
        priority: 'low',
      };
    case 'too_fine':
      return {
        meaning: '细粒级偏多，料层易于密实化、应力传导失配，破碎腔出现"过粉碎"',
        action: '降低细粒级占比：检查预筛分是否失效、筛孔是否磨损超差、是否应该把部分细料提前筛出',
        priority: 'high',
      };
    case 'too_coarse':
      return {
        meaning: '粗粒级偏多，大块速度优势明显，速度场梯度大，衬板局部冲击磨损加剧',
        action: '强化均匀布料（布料器改造 / 给料速度优化），必要时降低第一段排矿口或加设预筛分',
        priority: 'high',
      };
    default:
      return { meaning: '未知等级', action: '复核输入数据', priority: 'unknown' };
  }
}

/* ==========================================================================
 * 子模型 2：速度均匀化
 * ========================================================================== */

/** 颗粒终端速度 v_t = sqrt(4*d_p*(rho_p-rho_a)*g/(3*C_d*rho_a))。 */
export function terminalVelocity(dP, rhoP, rhoA = 1.225, Cd = 0.47) {
  const g = 9.81;
  if (rhoP <= rhoA) return 0.0;
  return pyRound(Math.sqrt((4 * dP * (rhoP - rhoA) * g) / (3 * Cd * rhoA)), 3);
}

/** 速度场均匀化度量 Φ = 1 - σ_v / v̄（∈[0,1]，1 为完全均匀）。 */
export function velocityUniformityIndex(vList) {
  const s = stats(vList);
  if (s.n === 0 || s.mean === 0) return { phi: 0.0, mean: 0.0, std: 0.0, cv: 0.0 };
  const phi = Math.max(0.0, 1.0 - s.std / s.mean);
  return { phi: pyRound(phi, 4), mean: pyRound(s.mean, 3), std: pyRound(s.std, 3), cv: pyRound(s.cv ?? 0, 4) };
}

/** 立轴冲击式破碎机碰撞能量损失经验模型 E_loss = k1*rpm - k2*v_feed。 */
export function collisionEnergyLoss(rpm, vFeed, k1 = 0.35, k2 = 0.42) {
  return pyRound(Math.max(0.0, k1 * rpm - k2 * vFeed), 4);
}

/** 均匀化指数 Φ → 工程判读（MACKORN 插件扩展）。 */
export function velocityAdvice(phi) {
  if (phi >= 0.95) return { grade: 'A', note: '速度场高度均匀，反射/折射/碰撞/散射已充分削平梯度' };
  if (phi >= 0.85) return { grade: 'B', note: '接近目标态，仍有局部梯度，建议微调给料点与档料板' };
  if (phi >= 0.7) return { grade: 'C', note: '部分均匀化，衬板沿腔高磨损将出现可测差异' };
  return { grade: 'D', note: '严重离析：大块速度优势显著，衬板局部冲击磨损与产品粒形均恶化' };
}

/* ==========================================================================
 * 子模型 3：磨损稳定性（马尔可夫腔型模型）与多梯度衬板
 * ========================================================================== */

/** 沿腔高 n 截面磨损速率的均匀度评估。均等化条件 dW_i/dt ≈ const。 */
export function wearUniformity(wearRates) {
  const s = stats(wearRates);
  if (s.n === 0) return { uniformity: 0.0, cv: 0.0, max_min_ratio: 0.0 };
  const ratio = s.min > 0 ? s.max / s.min : Infinity;
  return {
    uniformity: s.mean ? pyRound(1 - s.std / s.mean, 4) : 0.0,
    cv: s.mean ? pyRound(s.std / s.mean, 4) : 0.0,
    max_min_ratio: Number.isFinite(ratio) ? pyRound(ratio, 3) : null,
  };
}

/**
 * 多梯度结构衬板分区硬度设计：H_i = base * factor^i
 *
 * ⚠️ 单位与物理上限（P0 修正 · 2026-10-02）
 *   历史缺陷：本函数原先只做乘法，无上限校验。base=58、k=1.12、5 段时输出
 *   58 / 64.96 / 72.76 / 81.49 / 91.27 —— 该组数值**在任何单位下都不成立**：
 *     · 若按 HB：58 HB 比退火低碳钢还软（耐磨铸铁铸态即 ≥450 HB）
 *     · 若按 HRC：末段 91.27 HRC 超过任何铸造耐磨材料的可达硬度（实用上限约 65~68 HRC）
 *   现修正为：① 明确单位 ② 施加物理上限 ③ 返回是否被截断
 *
 * 物理参考（公开资料）：
 *   高铬铸铁（KmTBCr26 等）铸态 ~450-550 HB，硬化态 ≥600-650 HB ≈ 56-60 HRC
 *   铸造耐磨材料实用硬度上限 ≈ 65-68 HRC
 *   高锰钢 ZGMn13 铸态 ~180-220 HB，加工硬化表层可达 ~500 HB
 */
export const HARDNESS_LIMITS = {
  HRC: { min: 20, max: 68, note: '铸造耐磨材料实用上限约 65-68 HRC' },
  HB: { min: 120, max: 650, note: '高铬铸铁硬化态约 600-650 HB' },
  HBW: { min: 120, max: 650, note: '同 HB' },
};

export function gradientLinerDesign(nSections, baseHardness = 58.0, gradientFactor = 1.12, unit = 'HRC') {
  const lim = HARDNESS_LIMITS[unit] || HARDNESS_LIMITS.HRC;
  const raw = [];
  for (let i = 0; i < nSections; i += 1) raw.push(baseHardness * gradientFactor ** i);
  const out = raw.map((v) => pyRound(Math.min(v, lim.max), 2));
  // 元信息挂在数组上，保持向后兼容的返回类型
  out.unit = unit;
  out.capped = raw.some((v) => v > lim.max);
  out.raw_last = pyRound(raw[raw.length - 1], 2);
  out.limit = lim.max;
  out.in_range = baseHardness >= lim.min && baseHardness <= lim.max;
  return out;
}

/** 校验一组分区硬度设计是否物理可实现（P0 修正的配套门禁）。 */
export function validateHardnessDesign(values, unit = 'HRC') {
  const lim = HARDNESS_LIMITS[unit] || HARDNESS_LIMITS.HRC;
  const v = (values || []).map(Number).filter(Number.isFinite);
  const problems = [];
  if (!v.length) return { unit, ok: false, problems: ['硬度数组为空'], limit: lim };
  const below = v.filter((x) => x < lim.min);
  const above = v.filter((x) => x > lim.max);
  if (below.length) problems.push(`${below.length} 个值低于 ${unit} 下限 ${lim.min}（${below.join(', ')}）—— 比退火碳钢还软，不可能用于耐磨衬板`);
  if (above.length) problems.push(`${above.length} 个值超过 ${unit} 上限 ${lim.max}（${above.join(', ')}）—— ${lim.note}`);
  return { unit, min: Math.min(...v), max: Math.max(...v), limit: lim, ok: problems.length === 0, problems };
}

/* ==========================================================================
 * 子模型 4：孔隙率与最优粒级配比
 * ========================================================================== */

/** 三组分配比（粗/中/细）经验孔隙率模型。 */
export function porosityFromGrading(coarseFrac, midFrac, fineFrac) {
  const total = coarseFrac + midFrac + fineFrac;
  if (total === 0) return 1.0;
  const m = midFrac / total;
  const f = fineFrac / total;
  const phi = 0.42 - 0.3 * Math.min(m, 0.35) + 0.15 * Math.max(0.0, f - 0.3);
  return pyRound(Math.max(0.15, Math.min(phi, 0.55)), 4);
}

/** 最优粒级配比（工程经验窗口）。 */
export function optimalGrading() {
  return {
    coarse_frac: 0.5,
    mid_frac: 0.3,
    fine_frac: 0.2,
    porosity_min: 0.28,
    note: '中间粒级为最优孔隙率充填的关键，过多细粉反使密实度过高、应力传导失配',
  };
}

/* ==========================================================================
 * 五维分析框架（FiveDimAnalyzerV1 的框架移植）
 * 说明：Python 原版的五维数值是研究样本数据（含时点、样本口径），
 * 本插件只移植【维度定义 / 判读口径 / 破碎效率杠杆链】这些不随时点变化的
 * 分析骨架，样本类数字一律不放进来，避免用户把研究样本当成标定值。
 * ========================================================================== */

export const FIVE_DIMENSIONS = [
  {
    key: 'industry',
    name: '行业维度',
    question: '这个细分市场由谁构成、集中度如何、我方位置在哪一梯队？',
    evidence: ['全球/区域市场规模与增速', '前 N 强集中度 CR_N', '梯队结构与标杆企业', '下游资本开支周期'],
    scoreRule: '市场增速 >8% 且 CR10>0.6 → 5 分；增速 3%-8% → 3 分；增速 <3% → 1 分',
  },
  {
    key: 'technology',
    name: '技术维度',
    question: '技术路线是否已经收敛？我方产品落在哪条主线、差距在哪个环节？',
    evidence: ['主流技术路线图', '能耗/可用率/寿命等硬指标', '关键材料与控制系统', '专利与标准位置'],
    scoreRule: '有关键硬指标可对标且我方达标 → 5 分；仅定性描述 → 2 分',
  },
  {
    key: 'timeliness',
    name: '时效维度',
    question: '这项技术现在处于导入期/成长期/成熟期？现在投入是不是时候？',
    evidence: ['技术成熟度阶段', '近 24 个月落地项目', '渗透率与增长率', '政策与合规窗口'],
    scoreRule: '已有规模化工业应用 → 5 分；仅实验室/中试 → 2 分；无近期落地 → 1 分',
  },
  {
    key: 'economics',
    name: '经济维度',
    question: '投入多少、回收多久、吨成本变化多少？',
    evidence: ['CAPEX 分项', 'OPEX（电耗、衬板、人工）', '回收期', '吨矿成本变化'],
    scoreRule: '回收期 <12 个月 → 5 分；12-24 个月 → 4 分；24-36 个月 → 2 分；>36 个月 → 1 分',
  },
  {
    key: 'operability',
    name: '可操作维度',
    question: '现场能不能马上干？需要停机多久、需要谁配合？',
    evidence: ['改造窗口与停机时长', '施工与吊装条件', '备件可得性', '人员技能门槛'],
    scoreRule: '不停机/短停机即可实施 → 5 分；需大修窗口 → 2 分；需重建 → 1 分',
  },
];

/** 破碎效率核心杠杆链（Python 模型 analyze_crushing_leverage 的理论骨架）。 */
export const CRUSHING_LEVERAGE_CHAIN = [
  { step: 1, lever: '均匀布料', metric: '给料速度场 Φ', target: 'Φ ≥ 0.95' },
  { step: 2, lever: '速度均匀化', metric: '反射/折射/碰撞/散射耦合程度', target: '梯度削平、无离析带' },
  { step: 3, lever: '磨损稳定', metric: '沿腔高磨损 CV', target: 'CV ≤ 0.10' },
  { step: 4, lever: '模数恒定', metric: '粗粒级模数 M', target: 'M ∈ [4.0, 4.5]' },
  { step: 5, lever: '料层密度稳定', metric: '孔隙率 φ', target: 'φ ≤ 0.30' },
  { step: 6, lever: '破碎效率提升', metric: '台时产量 / 单位电耗', target: '产量↑、kWh/t↓' },
];

/**
 * 五维加权打分。输入为每维 1-5 分与权重（权重和不必为 1，内部归一化）。
 * @param {Record<string, {score:number, weight?:number, evidence?:string[]}>} scores
 */
export function fiveDimScore(scores) {
  const rows = [];
  let weighted = 0;
  let weightSum = 0;
  for (const dim of FIVE_DIMENSIONS) {
    const entry = scores?.[dim.key];
    if (!entry) continue;
    const score = Number(entry.score);
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      throw new Error(`维度 ${dim.key} 的 score 必须为 1-5 的数值`);
    }
    const weight = Number.isFinite(Number(entry.weight)) ? Number(entry.weight) : 1;
    weighted += score * weight;
    weightSum += weight;
    rows.push({ key: dim.key, name: dim.name, score, weight, evidence: entry.evidence ?? [] });
  }
  if (weightSum === 0) throw new Error('至少需要一个维度的评分');
  const total = pyRound(weighted / weightSum, 3);
  return {
    dimensions: rows,
    weighted_score: total,
    verdict:
      total >= 4.2
        ? '强烈推进：五维齐备，建议立项'
        : total >= 3.4
          ? '可推进：补齐最低分维度后再立项'
          : total >= 2.5
            ? '条件不足：先做小试/单点改造验证'
            : '不建议推进：存在硬约束未解决',
  };
}
