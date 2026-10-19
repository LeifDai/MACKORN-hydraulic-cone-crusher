/**
 * MACKORN 液压圆锥破碎机 · 工艺流程模拟内核（simulate.mjs）
 * ============================================================================
 * 目标：对标商业选型/流程模拟软件的能力（多段破碎 + 筛分 + 闭路物料平衡），
 *       但**全部算法来自公开发表的文献**，不含任何第三方专有软件的数据或标定系数。
 *
 * 算法出处（均为公开文献，可引用、可发表、可过尽调）：
 *   · Whiten W.J. (1972) "The simulation of crushing plants with models developed
 *     using multiple regression analysis" — 圆锥破稳态产品粒度模型
 *     P = (I − C)·(I − B·C)^(−1)·F     （C 为分级/啮合函数对角阵，B 为破碎函数下三角阵）
 *   · JKMRC t10 模型 — 破碎程度与比能耗的关系（t10 = A(1 − e^(−b·Ecs))）
 *   · Rosin–Rammler / Gaudin–Schuhmann / Swebrec — 粒度分布拟合函数
 *   · Bond F.C. (1952) 第三破碎理论 — W = 10·Wi·(1/√P80 − 1/√F80)
 *   · VSMA / Karra 筛分模型 — 筛分分配曲线（partition curve）
 *   · 群体平衡（population balance）迭代 — 闭路循环负荷求解
 *
 * 参数来源三级标注（务必遵守）：
 *   MACKORN-实测   —— 由 MACKORN 台架/现场数据标定（护城河，需持续积累）
 *   LITERATURE     —— 公开文献给出的典型值/区间
 *   ENGINEERING    —— 工程经验区间（非标定值）
 *
 * 诚实纪律：未标定的参数一律用 LITERATURE/ENGINEERING 默认值并在输出中列出，
 *          绝不冒充 MACKORN 实测值。
 * ============================================================================
 */

/* ==========================================================================
 * 1. 粒度分布函数（公开公式）
 * ========================================================================== */

/** 几何筛比（√2 系列）：给出标准筛级上限数组，从小到大。 */
export function sieveSeries(minMm = 0.5, maxMm = 512, ratio = Math.SQRT2) {
  const out = [];
  for (let x = minMm; x <= maxMm * 1.0001; x *= ratio) out.push(Number(x.toFixed(3)));
  out.push(Number((out[out.length - 1] * ratio).toFixed(3)));
  return out;
}

/** 分布函数统一签名：cum(x) = 累积通过率（0-1），x 为粒径 mm。 */
export const DISTRIBUTIONS = {
  /** Rosin–Rammler：Y = 1 − exp(−(x/xc)^n) */
  rosinRammler: ({ xc, n }) => (x) => 1 - Math.exp(-Math.pow(Math.max(x, 0) / xc, n)),
  /** Gaudin–Schuhmann：Y = (x/xmax)^m，x ≥ xmax 时取 1 */
  gaudinSchuhmann: ({ xmax, m }) => (x) => Math.min(1, Math.pow(Math.max(x, 0) / xmax, m)),
  /** Swebrec：Y = 1 / (1 + (ln(xmax/x)/ln(xmax/x50))^b) */
  swebrec: ({ xmax, x50, b }) => (x) => {
    const xx = Math.max(Math.min(x, xmax * 0.999999), 1e-9);
    const denom = Math.log(xmax / x50);
    if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return 0;
    return 1 / (1 + Math.pow(Math.log(xmax / xx) / denom, b));
  },
};

/**
 * 由分布函数在筛级边界上离散为质量分数数组。
 * @returns {{cum:number[], frac:number[], sizes:number[]}} frac[i] 为落在 (sizes[i-1], sizes[i]] 的质量分数
 */
export function discretize(cumFn, sizes) {
  const cum = sizes.map((s) => Math.max(0, Math.min(1, cumFn(s))));
  const frac = [];
  let prev = 0;
  for (let i = 0; i < sizes.length; i += 1) {
    frac.push(Math.max(0, cum[i] - prev));
    prev = cum[i];
  }
  // 顶部开口级：把剩余质量归入最大级之上（若 cum(max)<1）
  const tail = Math.max(0, 1 - prev);
  if (tail > 1e-12) frac[frac.length - 1] += tail;
  const total = frac.reduce((a, b) => a + b, 0);
  return { cum, frac: frac.map((f) => f / total), sizes };
}

/** 由离散质量分数反算累积通过率。 */
export function cumFromFrac(frac) {
  const out = [];
  let s = 0;
  for (const f of frac) { s += f; out.push(s); }
  return out;
}

/** 特征粒径：累积通过率达 p（0-1）时的粒径，线性插值。 */
export function percentile(sizes, frac, p = 0.8) {
  const cum = cumFromFrac(frac);
  if (cum[cum.length - 1] < p) return null;
  for (let i = 0; i < cum.length; i += 1) {
    if (cum[i] >= p) {
      const c0 = i === 0 ? 0 : cum[i - 1];
      const x0 = i === 0 ? 0 : sizes[i - 1];
      const t = (p - c0) / Math.max(1e-12, cum[i] - c0);
      return Number((x0 + t * (sizes[i] - x0)).toFixed(3));
    }
  }
  return null;
}

/* ==========================================================================
 * 2. Whiten 圆锥破模型
 * ========================================================================== */

/**
 * 分级（啮合）函数 C(x)：粒径 x 被破碎的概率。
 * 公开形式：C = 0 (x<K2)；C = (x−K2)/(K1−K2) (K2≤x<K1)；C = 1 (x≥K1)
 * K1、K2 与紧边排矿口 CSS 和偏心距（throw）相关：
 *   K1 = CSS + throwFactor·throw      （完全破碎的上界）
 *   K2 = CSS − throwFactor·throw      （开始被啮合的下界）
 * throwFactor 为标定参数：LITERATURE 典型 0.5-1.0。
 */
export function classificationFunction({ cssMm, throwMm = 25, throwFactor = 0.8 }) {
  const K1 = cssMm + throwFactor * throwMm;
  const K2 = Math.max(0.1, cssMm - throwFactor * throwMm);
  return (x) => (x <= K2 ? 0 : x >= K1 ? 1 : (x - K2) / (K1 - K2));
}

/**
 * 破碎函数 B(x,y)：粒径 y 被破碎后进入小于 x 级的累积分数（x ≤ y）。
 * 公开两参数幂函数形式：B = φ·(x/y)^γ + (1−φ)·(x/y)^β
 *   φ  —— 粗粒生成占比      LITERATURE 典型 0.3-0.6
 *   γ  —— 粗端指数          LITERATURE 典型 0.4-1.0
 *   β  —— 细端指数（>γ）    LITERATURE 典型 2.5-5.0
 * 该形式与 Whiten(1972)、Napier-Munn et al.《Mineral Comminution Circuits》一致。
 */
export const BREAKAGE_DEFAULTS = { phi: 0.45, gamma: 0.7, beta: 3.5, source: 'LITERATURE (Whiten 1972 / Napier-Munn et al.)' };

export function breakageMatrix(sizes, params = BREAKAGE_DEFAULTS) {
  const { phi, gamma, beta } = { ...BREAKAGE_DEFAULTS, ...params };
  const n = sizes.length;
  const B = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < j; i += 1) {
      const r = Math.min(1, sizes[i] / sizes[j]);
      B[i][j] = phi * Math.pow(r, gamma) + (1 - phi) * Math.pow(r, beta);
    }
    B[j][j] = 1; // 定义：同级的全部进入该级及以下
  }
  return B;
}

/** 单位阵、矩阵乘、下三角求逆（前代法）。 */
function identity(n) { return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))); }
function matMul(A, Bm, n) {
  const C = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) for (let k = 0; k < n; k += 1) { const a = A[i][k]; if (a === 0) continue; for (let j = 0; j < n; j += 1) C[i][j] += a * Bm[k][j]; }
  return C;
}
/**
 * 前代法解下三角系统 (I − B·C)·P = (I − C)·F。
 * B 为下三角 → I − B·C 也是下三角，**不需要也不应该做选主元的高斯全消元**
 * （近奇异对角元在选主元时会被放大，实测会产生 1e68 量级的伪解）。
 * 前代法无主元交换，条件数不受影响，是这类系统的标准解法。
 */
function backSubstitution(A, b, n) {
  const x = new Array(n).fill(0);
  // 索引按粒径升序：B[i][j] 仅在 j ≥ i（细级 i 由粗级 j 破碎而来）非零，
  // 故 I − B·C 是**上三角**，必须从最大粒级向下回代。
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = b[i];
    for (let j = i + 1; j < n; j += 1) s -= A[i][j] * x[j];
    const d = A[i][i];
    x[i] = Math.abs(d) < 1e-300 ? 0 : s / d;
  }
  return x;
}

/**
 * 圆锥破稳态产品粒度分布（Whiten 模型）。
 * P = (I − C)·(I − B·C)^(−1)·F
 * @param {number[]} feedFrac 给料质量分数（与 sizes 对齐）
 * @param {number[]} sizes 筛级上限（mm，升序）
 * @param {object} p { cssMm, throwMm, throwFactor, speedRpm, breakage }
 */
export function simulateConeCrusher(feedFrac, sizes, p = {}) {
  const n = sizes.length;
  const css = Number(p.cssMm);
  if (!Number.isFinite(css) || css <= 0) throw new Error('cssMm 必须为正数（紧边排矿口 mm）');
  const throwMm = Number.isFinite(Number(p.throwMm)) ? Number(p.throwMm) : 25;
  const throwFactor = Number.isFinite(Number(p.throwFactor)) ? Number(p.throwFactor) : 0.8;
  const speedFactor = Number.isFinite(Number(p.speedRpm)) ? Math.max(0.7, Math.min(1.3, Number(p.speedRpm) / 300)) : 1;

  const total = feedFrac.reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new Error('给料质量分数之和必须大于 0');
  const F = feedFrac.map((f) => f / total);

  const Cfn = classificationFunction({ cssMm: css, throwMm, throwFactor });
  // 数值正则化：C 严格等于 1 时矩阵 (I − B·C) 的对角元 (1−C_i) 变 0 → 奇异，解出负值、质量不守恒。
  // 物理上 C=1 表示该粒级全部被破碎、无残留，故把 C 上限压到 1−ε，
  // 使 P_i ≈ ε·X_i ≈ 0（与物理一致）同时保持矩阵非奇异。ε=1e-9 对结果无可测影响。
  const C_EPS = 1e-9;
  const C = sizes.map((s) => Math.min(1 - C_EPS, Cfn(s) * speedFactor));
  const B = breakageMatrix(sizes, p.breakage);

  // A = I − B·diag(C)
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
  const cum = cumFromFrac(frac);

  return {
    product_frac: frac,
    product_cum: cum,
    mass_balance_error: Math.abs(sP - 1),
    max_negative_mass: Number(maxNegative.toExponential(3)),
    classification: C,
    K1_mm: Number((css + throwFactor * throwMm).toFixed(2)),
    K2_mm: Number(Math.max(0.1, css - throwFactor * throwMm).toFixed(2)),
    feed_p80_mm: percentile(sizes, F, 0.8),
    product_p80_mm: percentile(sizes, frac, 0.8),
    reduction_ratio: (() => {
      const f80 = percentile(sizes, F, 0.8);
      const p80 = percentile(sizes, frac, 0.8);
      return f80 && p80 ? Number((f80 / p80).toFixed(3)) : null;
    })(),
    model: 'Whiten (1972) steady-state cone crusher model: P = (I−C)(I−B·C)^(−1)·F',
  };
}

/* ==========================================================================
 * 3. 破碎功耗（Bond 第三破碎理论，公开公式）
 * ========================================================================== */

/**
 * Bond 功耗：W = 10·Wi·(1/√P80 − 1/√F80)  [kWh/t]
 * Wi 为邦德功指数（kWh/t）：公开教科书按岩性给出典型区间；
 * 精确值须由 MACKORN 做邦德球磨/落重试验标定。
 */
export const BOND_WI_TYPICAL = {
  花岗岩: [13, 16], 玄武岩: [14, 18], 片麻岩: [13, 16], 石英岩: [12, 15],
  石灰石: [9, 12], 大理岩: [9, 12], 白云岩: [10, 13], 砂岩: [10, 14], 凝灰岩: [10, 14],
  铁矿石: [12, 16], 铜矿石: [12, 16], 金矿石: [13, 17], 铅锌矿石: [11, 15],
  source: 'LITERATURE（选矿教科书典型区间；实际须以邦德功指数试验标定）',
};

export function bondPower({ wi, f80Mm, p80Mm }) {
  if (!(wi > 0) || !(f80Mm > 0) || !(p80Mm > 0)) return null;
  if (p80Mm >= f80Mm) return { w_kwh_per_t: 0, note: 'P80 ≥ F80，无需破碎' };
  const w = 10 * wi * (1 / Math.sqrt(p80Mm) - 1 / Math.sqrt(f80Mm));
  return {
    w_kwh_per_t: Number(w.toFixed(3)),
    wi_used: wi,
    formula: 'W = 10·Wi·(1/√P80 − 1/√F80)　（Bond 1952 第三破碎理论）',
    note: '该式用于破碎段能耗估算；圆锥破实际轴功率还受腔型利用率与转速影响，宜用设备实测功率因数修正',
  };
}

/* ==========================================================================
 * 4. 筛分分配曲线（公开模型）
 * ========================================================================== */

/**
 * 筛分分配曲线：粒径 x 进入筛下（细料）的概率。
 * 公开形式：E(x) = 1 / (1 + (x/d50c)^k)　（logistic 分配曲线）
 *   d50c = 筛孔 × cutFactor（cutFactor 反映实际分离粒径与筛孔的偏差，LITERATURE 典型 0.85-1.15）
 *   k    = 曲线陡度，LITERATURE 典型 4-10（越大分离越锐）
 * 另叠加"难筛粒"（0.5-1.5 倍筛孔）效率折减。
 */
export const SCREEN_DEFAULTS = { cutFactor: 1.0, k: 6, overallEfficiency: 0.9, source: 'LITERATURE (VSMA / Karra partition-curve form)' };

export function screenPartition(apertureMm, params = {}) {
  const { cutFactor, k, overallEfficiency } = { ...SCREEN_DEFAULTS, ...params };
  const d50c = apertureMm * cutFactor;
  return (x) => {
    const raw = 1 / (1 + Math.pow(Math.max(x, 0) / d50c, k));
    return Math.max(0, Math.min(1, overallEfficiency * raw + (1 - overallEfficiency) * Math.min(1, Math.max(x, 0) / apertureMm)));
  };
}

/** 按筛分分配曲线把给料分成筛下（细）与筛上（粗）两股。 */
export function splitByScreen(frac, sizes, apertureMm, params) {
  const Efn = screenPartition(apertureMm, params);
  const E = sizes.map((s) => Efn(s));
  const fines = frac.map((f, i) => f * E[i]);
  const overs = frac.map((f, i) => f * (1 - E[i]));
  return { fines, overs, partition: E, apertureMm, d50c_mm: apertureMm * ({ ...SCREEN_DEFAULTS, ...params }).cutFactor };
}

/* ==========================================================================
 * 5. 多段流程 + 闭路物料平衡（群体平衡迭代）
 * ========================================================================== */

/**
 * 模拟一条"破碎 + 筛分 + 闭路返回"的流程。
 *
 * 段定义（stages 数组，按顺序）：
 *   { type:'crusher', name, cssMm, throwMm, breakage, bondWi }
 *   { type:'screen',  name, apertureMm, params, recirculateTo }  // recirculateTo: 返回到哪个 crusher 的下标
 *
 * @param {object} input { feedFrac, sizes, stages, tolerance, maxIter, ore }
 */
export function simulateFlowsheet(input = {}) {
  const sizes = input.sizes ?? sieveSeries(0.5, 512);
  const stages = Array.isArray(input.stages) ? input.stages : [];
  if (stages.length === 0) throw new Error('stages 不能为空');
  const tol = Number.isFinite(Number(input.tolerance)) ? Number(input.tolerance) : 1e-6;
  const maxIter = Number.isFinite(Number(input.maxIter)) ? Number(input.maxIter) : 200;

  const n = sizes.length;
  const fresh = (() => {
    const t = input.feedFrac.reduce((a, b) => a + b, 0);
    if (!(t > 0)) throw new Error('给料质量分数之和必须大于 0');
    return input.feedFrac.map((f) => f / t);
  })();

  // 每个破碎段维护一个"入料"向量（含新鲜料 + 循环料）
  const crusherIdx = stages.map((s, i) => (s.type === 'crusher' ? i : -1)).filter((i) => i >= 0);
  const recycle = new Map(); // crusherStageIndex -> frac[]
  for (const i of crusherIdx) recycle.set(i, new Array(n).fill(0));

  const history = [];
  let converged = false;
  let iter = 0;
  let streams = null;

  for (iter = 1; iter <= maxIter; iter += 1) {
    // 按顺序计算各段
    const local = [];
    let carry = fresh.slice();
    const products = new Array(stages.length).fill(null);
    const stageInput = new Array(stages.length).fill(null);

    for (let si = 0; si < stages.length; si += 1) {
      const st = stages[si];
      if (st.type === 'crusher') {
        // 按**绝对质量**做物料平衡（以新鲜料 = 1 为单位）。
        // 碎破机内部用归一化分布计算产品曲线，再乘回进入该段的绝对质量——
        // 否则每次归一化都会把筛分分出去的质量"补回来"，物料不守恒（实测 final_sum=0.80）。
        const inAbs = addVectors(local.length === 0 && crusherIdx[0] === si ? fresh : carry, recycle.get(si));
        const inMass = inAbs.reduce((a, b) => a + b, 0);
        const u = inMass > 0 ? inAbs.map((v) => v / inMass) : inAbs.slice();
        const r = simulateConeCrusher(u, sizes, st);
        products[si] = { ...r, input_mass: inMass, product_mass: inMass };
        stageInput[si] = u;
        carry = r.product_frac.map((f) => f * inMass);   // 绝对质量
      } else if (st.type === 'screen') {
        // 筛分按比例分配，绝对质量天然守恒
        const sp = splitByScreen(carry, sizes, st.apertureMm, st.params);
        products[si] = { fines: sp.fines, overs: sp.overs, d50c_mm: sp.d50c_mm, apertureMm: st.apertureMm };
        stageInput[si] = carry.slice();
        const target = Number.isInteger(st.recirculateTo) ? st.recirculateTo
          : crusherIdx.filter((i) => i < si).slice(-1)[0];
        if (Number.isInteger(target) && recycle.has(target)) recycle.set(target, sp.overs.slice());
        carry = sp.fines.slice();                        // 筛下继续往下走
      } else {
        throw new Error(`未知的段类型 "${st.type}"（仅支持 crusher / screen）`);
      }
      local.push(si);
    }
    streams = { products, stageInput, final: carry };

    // 收敛判据：循环料向量相对变化
    let maxDelta = 0;
    if (iter > 1) {
      for (const [k, v] of recycle) {
        const prev = history[history.length - 1].recycle.get(k);
        const a = v.reduce((x, y) => x + y, 0);
        const b = prev.reduce((x, y) => x + y, 0);
        maxDelta = Math.max(maxDelta, Math.abs(a - b) / Math.max(1e-12, Math.max(a, b)));
      }
    }
    history.push({ recycle: new Map([...recycle].map(([k, v]) => [k, v.slice()])), maxDelta });
    if (iter > 1 && maxDelta < tol) { converged = true; break; }
  }

  // 汇总每股料流（按质量分数 × 产能，若给了 tph）
  const freshSum = fresh.reduce((a, b) => a + b, 0);
  const detail = stages.map((st, si) => {
    const p = streams.products[si];
    const inp = streams.stageInput[si];
    const base = {
      index: si, type: st.type, name: st.name ?? `${st.type}-${si + 1}`,
      feed_p80_mm: percentile(sizes, inp, 0.8),
    };
    if (st.type === 'crusher') {
      return {
        ...base, css_mm: st.cssMm,
        product_p80_mm: p.product_p80_mm,
        reduction_ratio: p.reduction_ratio,
        K1_mm: p.K1_mm, K2_mm: p.K2_mm,
        mass_balance_error: p.mass_balance_error,
      };
    }
    const fineSum = p.fines.reduce((a, b) => a + b, 0);
    const overSum = p.overs.reduce((a, b) => a + b, 0);
    return { ...base, aperture_mm: st.apertureMm, d50c_mm: p.d50c_mm, fines_fraction: Number(fineSum.toFixed(6)), overs_fraction: Number(overSum.toFixed(6)) };
  });

  // 循环负荷 = 返回料 / 新鲜料
  const circ = (() => {
    const target = crusherIdx[crusherIdx.length - 1];
    const rec = recycle.get(target) ?? [];
    return Number((rec.reduce((a, b) => a + b, 0) / Math.max(1e-12, freshSum)).toFixed(4));
  })();

  const finalFrac = streams.final.map((v) => Math.max(0, v));
  const fSum = finalFrac.reduce((a, b) => a + b, 0);
  const yieldRatio = fSum;   // 稳态下应趋近 1（新鲜料 = 最终出料）

  return {
    converged,
    iterations: iter,
    final_p80_mm: percentile(sizes, finalFrac.map((v) => v / fSum), 0.8),
    final_frac: finalFrac.map((v) => v / fSum),
    circulating_load_ratio: circ,
    stages: detail,
    mass_balance: { final_sum: Number(fSum.toFixed(12)), yield_ratio: Number(yieldRatio.toFixed(6)), ok: Math.abs(fSum - 1) < 1e-3 },
    fresh_feed_mass: 1,
    model: 'Whiten 稳态破碎模型 + logistic 筛分分配曲线 + 群体平衡迭代（全部为公开文献算法）',
  };
}

/** 向量相加（**不归一化**）——绝对质量物料平衡用。 */
function addVectors(a, b) {
  const n = Math.max(a?.length ?? 0, b?.length ?? 0);
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) out[i] = (a?.[i] ?? 0) + (b?.[i] ?? 0);
  return out;
}

function mix(a, b) {
  const n = Math.max(a.length, b.length);
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  const s = out.reduce((x, y) => x + y, 0);
  return s > 0 ? out.map((v) => v / s) : out;
}
