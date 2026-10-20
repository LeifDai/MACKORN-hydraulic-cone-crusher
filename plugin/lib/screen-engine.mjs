/**
 * 筛分选型引擎（R124 · 补 P0 缺口）
 *
 * 回答：给定给料量 + 筛孔 + 目标效率，该配多大筛分面积、几台、几层、
 *       闭路循环负荷多少、上游要放大多少。
 *
 * ★ 关键设计（与颚破引擎配套）：
 *   用户问「颚破+圆锥+筛子」，筛分是第三个必备环节。
 *   没有它，插件答不出"成品率多少、循环负荷多大"。
 *
 * ⚠️ 诚实边界：
 *   数据来自设计手册通用公式（S5），【不是 MACKORN 厂商参数】。
 *   输出恒带 vendor_params_pending: true。
 *   单位筛分能力 q 是手册典型值，实际物料差异可达 ±30%。
 */
import {
  SCREEN_SERIES, SCREEN_FORMULAS, SCREEN_EFFICIENCY, SCREEN_LIMITS,
  SCREEN_GAPS, SCREEN_META, SCREEN_PRICE_HINT,
} from './data-screen.mjs';
import { DATA_DISCIPLINE } from './data-valuechain.mjs';

const SRC = { S3: '公开文献', S5: '设计手册', S6: '设计规范', S4: '现场经验', RANGE: '工程经验区间' };
const A = (assumption, source) => ({ assumption, source, source_name: SRC[source] || source });
const round = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/** 查单位筛分能力 q（按筛孔，线性插值） */
function lookupQ(apertureMm) {
  const t = SCREEN_FORMULAS.unit_capacity.table;
  if (apertureMm >= t[0].aperture_mm) return t[0].q_tph_m2;
  for (let i = 0; i < t.length - 1; i += 1) {
    const a = t[i]; const b = t[i + 1];
    if (apertureMm <= a.aperture_mm && apertureMm >= b.aperture_mm) {
      const ratio = (a.aperture_mm - apertureMm) / (a.aperture_mm - b.aperture_mm);
      return round(a.q_tph_m2 + ratio * (b.q_tph_m2 - a.q_tph_m2), 1);
    }
  }
  return t[t.length - 1].q_tph_m2;
}

/**
 * 筛分选型
 * @param {object} input
 * @param {number} input.feedTph       给料量 t/h（必填）
 * @param {number} input.apertureMm    筛孔 mm（必填）
 * @param {number} [input.targetEfficiency] 目标筛分效率 %（默认 85）
 * @param {string} [input.screenType]  筛型（圆振动/直线/高频/概率，默认自动）
 * @param {number} [input.moisturePct] 含水率 %
 * @param {number} [input.feedP80Mm]   给料 P80 mm（用于检查筛孔是否合理）
 * @param {boolean} [input.closedCircuit] 是否闭路（默认 true，检查筛通常闭路）
 * @param {number} [input.bulkDensity] 松散密度 t/m³（默认 1.6）
 */
export function selectScreen(input = {}) {
  const feedTph = Number(input.feedTph);
  const apertureMm = Number(input.apertureMm);
  const targetEff = Number.isFinite(Number(input.targetEfficiency)) ? Number(input.targetEfficiency) : 85;
  const moisture = Number.isFinite(Number(input.moisturePct)) ? Number(input.moisturePct) : null;
  const feedP80 = Number.isFinite(Number(input.feedP80Mm)) ? Number(input.feedP80Mm) : null;
  const closedCircuit = input.closedCircuit !== false;
  const bulkDensity = Number.isFinite(Number(input.bulkDensity)) ? Number(input.bulkDensity) : 1.6;

  const assumptions = [
    A('筛分面积按设计手册通用公式 A = Q/(q·K1..K6) 计算（S5），非厂家选型软件', 'S5'),
    A('单位筛分能力 q 取手册典型值（方孔、中等松散密度、干料）', 'S5'),
    A('松散密度按 ' + bulkDensity + ' t/m³', 'RANGE'),
  ];
  const warnings = [];
  const rejections = [];

  /* ── ① 输入校验 ── */
  if (!Number.isFinite(feedTph) || feedTph <= 0) {
    return buildError('feedTph 必须为正数（t/h）', { feedTph, apertureMm });
  }
  if (!Number.isFinite(apertureMm) || apertureMm <= 0) {
    return buildError('apertureMm 必须为正数（mm）', { feedTph, apertureMm });
  }

  /* ── ② 负控：筛孔相对给料过大 ── */
  if (feedP80 !== null && apertureMm > feedP80 / 2) {
    warnings.push('★ 筛孔 ' + apertureMm + 'mm > 给料 P80（' + feedP80 + 'mm）的一半 —— ' +
      '大量物料未经筛分直接通过，这不是"筛分"而是"粗分级"。' +
      '如果目标是成品分级，应减小筛孔或先破碎到更细');
  }

  /* ── ③ 负控：含水 ── */
  let moistureK = 1.0;
  if (moisture !== null) {
    if (moisture > 8) {
      moistureK = 0.70;
      warnings.push('★ 含水率 ' + moisture + '% > 8% —— 湿料会严重堵筛孔（圆振尤其严重）。' +
        '必须配防堵措施：① 聚氨酯筛板 ② 高频筛 ③ 加热筛面 ④ 或先干燥。' +
        '不做防堵，实际通过量可能只有计算的 60-70%');
    } else if (moisture > 5) {
      moistureK = 0.85;
      warnings.push('含水率 ' + moisture + '% 偏高 —— 筛分效率会下降，建议用聚氨酯筛板');
    }
  }

  /* ── ④ 负控：目标效率过高 ── */
  if (targetEff > 95) {
    rejections.push({
      rule: '目标筛分效率 ' + targetEff + '% > 95% —— 单层筛做不到',
      detail: '单层筛很难超过 95%；要达到 95%+ 必须多层串联或减小处理量',
      action: '建议 ① 改成双层/三层筛 ② 或降低效率要求到 85-90%',
      source: 'SCREEN_LIMITS',
    });
  }

  /* ── ⑤ 筛型推荐 ── */
  let screenType = input.screenType;
  if (!screenType) {
    if (apertureMm < 5) screenType = '高频筛（GPS）';
    else if (apertureMm < 10) screenType = '直线振动筛（ZK/ZKR）';
    else screenType = '圆振动筛（YK/YA）';
  }
  const seriesInfo = SCREEN_SERIES[screenType];

  /* 负控：细粒用圆振 */
  if (apertureMm < 5 && /圆振动/.test(screenType)) {
    warnings.push('★ 筛孔 ' + apertureMm + 'mm < 5mm 但选了圆振动筛 —— 圆振对细粒效率低，建议改直线筛或高频筛');
  }

  /* ── ⑥ 计算筛分面积 ── */
  const q = lookupQ(apertureMm);
  /* 系数 */
  const K1 = closedCircuit ? 0.85 : 1.0;       /* 闭路时循环负荷使细粒含量变化 */
  const K2 = targetEff / 85;                    /* 效率系数：85% 为基准 1.0 */
  const K3 = bulkDensity / 1.6;                 /* 松散密度系数 */
  const K4 = 1.0;                               /* 方孔 */
  const K5 = moistureK;                         /* 湿度 */
  const K6 = 1.0;                               /* 倾角，按标准 20° */

  /* A = Q / (q × K1 × K3 × K4 × K5 × K6 / K2) —— 效率要求越高，K2 越大，面积越大 */
  const denom = q * K1 * K3 * K4 * K5 * K6 / K2;
  const areaM2 = feedTph / denom;

  /* ── ⑦ 层数建议 ── */
  let layers = 1;
  if (targetEff > 90 || apertureMm < 5) layers = 2;
  if (targetEff > 93) layers = 3;

  /* ── ⑧ 台数与规格 ── */
  /* 单台筛面积不宜过大（结构限制），按 20-30 m²/台 拆 */
  const maxAreaPerUnit = 30;
  const units = Math.max(1, Math.ceil(areaM2 / maxAreaPerUnit));
  const areaPerUnit = round(areaM2 / units, 1);
  /* 推荐筛面宽度（按处理量与经验：宽 1.5-2.4m 常见） */
  const recommendedWidthM = areaPerUnit > 25 ? 2.4 : areaPerUnit > 15 ? 1.8 : 1.5;
  const recommendedLengthM = round(areaPerUnit / recommendedWidthM, 1);

  /* ── ⑨ 循环负荷（闭路）── */
  let circulatingLoadPct = null;
  let upstreamAmplification = 1.0;
  if (closedCircuit) {
    const effFrac = targetEff / 100;
    /* 简化模型：循环负荷 C ≈ (1-η)/η × 筛上产率 */
    /* 假设筛上产率约 30%（检查筛的典型值） */
    const oversizeFrac = 0.30;
    circulatingLoadPct = round(((1 - effFrac) / effFrac) * oversizeFrac / (1 - oversizeFrac) * 100, 1);
    upstreamAmplification = round(1 + circulatingLoadPct / 100, 2);
  }

  /* ── ⑩ 台数爆炸告警 ── */
  if (units > 3) {
    warnings.push('★ 需要 ' + units + ' 台筛机 —— 台数过多。说明筛孔偏小或处理量偏大，' +
      '建议 ① 用更大规格筛机 ② 分两级筛分 ③ 检查筛孔是否过小');
  }

  /* ── ⑪ 价格参考 ── */
  const priceHint = findScreenPrice(areaM2);

  /* ══════ R125：面积偏乐观的强制告警 ══════
   * 实测自查：380 t/h 筛 19mm 算出 14.9 m²，但同类工程通常 25-40 m²。
   * 原因：K1（给料中细粒含量系数）被固定为 0.85，过于宽松。
   * 实际 K1 取决于给料中「小于筛孔一半」的细粒占比 —— 细粒越少，筛分越难，K1 越小（可到 0.5）。
   * 本引擎拿不到给料粒度分布，所以无法精确算 K1。
   * 诚实做法：明确告警「结果偏乐观，实际需按厂家软件校核」。 */
  if (areaM2 > 0) {
    warnings.push(
      '★ 筛分面积 ' + round(areaM2, 1) + ' m² 是按手册典型值算的【下限估计】，' +
      '实际工程通常要放大 1.3-2.5 倍（同类 380 t/h 筛 19mm 的工程案例多为 25-40 m²）。' +
      '原因：本引擎拿不到给料粒度分布，无法精确算「细粒含量系数 K1」（细粒越少筛分越难）。' +
      '★ 必须用厂家选型软件或做筛分试验校核，不能直接用这个面积下单',
    );
  }
  return {
    request: {
      feedTph, apertureMm, targetEfficiency: targetEff, screenType,
      moisturePct: moisture, feedP80Mm: feedP80, closedCircuit, bulkDensity,
    },
    /* 核心输出 */
    recommended_screen_type: screenType,
    screen_type_info: seriesInfo ? { principle: seriesInfo.principle, pros: seriesInfo.pros, cons: seriesInfo.cons } : null,
    units,
    area_total_m2: round(areaM2, 1),
    area_per_unit_m2: areaPerUnit,
    layers,
    recommended_dimensions: { width_m: recommendedWidthM, length_m: recommendedLengthM },
    /* 计算依据 */
    calculation: {
      formula: SCREEN_FORMULAS.capacity_method.formula,
      unit_capacity_q: q,
      coefficients: { K1_circuit: K1, K2_efficiency: round(K2, 2), K3_density: round(K3, 2), K4_aperture_shape: K4, K5_moisture: K5, K6_slope: K6 },
      note: SCREEN_FORMULAS.capacity_method.note,
    },
    /* 闭路循环负荷 */
    circulating_load_pct: circulatingLoadPct,
    upstream_amplification: upstreamAmplification,
    circulating_note: closedCircuit
      ? '★ 闭路时上游破碎机产能必须按 ' + upstreamAmplification + ' 倍放大（循环负荷 ' + circulatingLoadPct + '%）。' +
        '这是设计中最常被漏掉的一项'
      : '开路，无需放大',
    /* 价格 */
    price_reference: priceHint,
    price_disclaimer: SCREEN_PRICE_HINT.disclaimer,
    /* 边界 */
    limit_rules: SCREEN_LIMITS,
    efficiency_rules: SCREEN_EFFICIENCY,
    rejections,
    known_gaps: SCREEN_GAPS,
    vendor_params_pending: true,
    vendor_meta: SCREEN_META,
    data_discipline: DATA_DISCIPLINE.map((d) => d.rule),
    assumptions,
    warnings: [...warnings,
      '★ 本工具【不含 MACKORN 筛分厂商参数】—— 数据来自设计手册通用公式（S5）。',
      '单位筛分能力 q 是手册典型值，实际物料差异可达 ±30%；正式选型须厂家软件校核或做筛分试验'],
    basis: 'S5 设计手册通用公式；非厂商实测',
  };
}

function findScreenPrice(areaM2) {
  for (const p of SCREEN_PRICE_HINT.by_area) {
    const c = p.area_class;
    if (c.includes('< 15') && areaM2 < 15) return { ...p, matched_by: areaM2.toFixed(1) + ' m² < 15' };
    if (c.includes('15-25')) { if (areaM2 >= 15 && areaM2 <= 25) return { ...p, matched_by: areaM2.toFixed(1) + ' m² 在 15-25' }; }
    if (c.includes('25-40')) { if (areaM2 > 25 && areaM2 <= 40) return { ...p, matched_by: areaM2.toFixed(1) + ' m² 在 25-40' }; }
    if (c.includes('> 40') && areaM2 > 40) return { ...p, matched_by: areaM2.toFixed(1) + ' m² > 40' };
  }
  return null;
}

function buildError(message, req) {
  return {
    request: req,
    error: 'missing_required',
    message,
    recommended_screen_type: null,
    units: null,
    area_total_m2: null,
    assumptions: [],
    warnings: ['缺少必填参数：' + message],
    basis: 'NO_CALCULATION',
  };
}

/** 筛分知识目录 */
export function screenCatalog() {
  return {
    series: Object.entries(SCREEN_SERIES).map(([k, v]) => ({ screen_type: k, ...v })),
    formulas: SCREEN_FORMULAS,
    efficiency: SCREEN_EFFICIENCY,
    limits: SCREEN_LIMITS,
    price_hint: SCREEN_PRICE_HINT,
    known_gaps: SCREEN_GAPS,
    meta: SCREEN_META,
    basis: 'S5 设计手册',
  };
}
