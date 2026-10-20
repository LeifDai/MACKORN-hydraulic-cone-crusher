/**
 * 颚破选型引擎（R124 · 补 P0 缺口）
 *
 * 回答：给定目标产能 + 最大给料粒度 + 矿石条件，
 *       该选什么档位的颚破、配几台、多大功率、产品 P80 多少。
 *
 * ★ 关键设计（吸取 2026-10-20 调用失败的教训）：
 *   用户的真实问题是「350-400 t/h · 给料≤500mm · 出料19mm · 颚破+圆锥+筛子」。
 *   旧插件只能答圆锥那一段，模型判定"用了更麻烦"就绕开。
 *   本引擎补上粗碎段，让插件能答完整。
 *
 * ⚠️ 诚实边界（必须保留）：
 *   本引擎的数据来自公开文献（S3/S5），【不是 MACKORN 厂商参数】。
 *   输出恒带 vendor_params_pending: true 与免责声明。
 *   型号只给"档位"，不给"推荐采购型号"。
 */
import { JAW_MODELS, JAW_RULES, JAW_LIMITS, JAW_GAPS, JAW_META, JAW_PRICE_HINT, JAW_SERIES } from './data-jaw.mjs';
import { DATA_DISCIPLINE } from './data-valuechain.mjs';

const SRC = { S3: '公开文献', S5: '设计手册', S6: '设计规范', S4: '现场经验', RANGE: '工程经验区间' };
const A = (assumption, source) => ({ assumption, source, source_name: SRC[source] || source });
const round = (v, d = 0) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/**
 * 颚破选型
 * @param {object} input
 * @param {number} input.targetTph    目标产能 t/h（必填）
 * @param {number} input.maxFeedMm    最大给料粒度 mm（必填）
 * @param {string} [input.ore]        矿石类型
 * @param {number} [input.ucsMpa]     抗压强度 MPa
 * @param {number} [input.moisturePct] 含水率 %
 * @param {boolean} [input.muddy]     是否含泥
 * @param {boolean} [input.closedCircuit] 是否与大流程闭路（默认 false，粗碎通常开路）
 */
export function selectJaw(input = {}) {
  const targetTph = Number(input.targetTph);
  const maxFeedMm = Number(input.maxFeedMm);
  const ore = input.ore ?? null;
  const ucs = Number.isFinite(Number(input.ucsMpa)) ? Number(input.ucsMpa) : null;
  const moisture = Number.isFinite(Number(input.moisturePct)) ? Number(input.moisturePct) : null;
  const muddy = input.muddy === true;

  const assumptions = [
    A('颚破参数来自公开文献与行业通用样本（S3/S5），非 MACKORN 厂商实测', 'S3'),
    A('名义产能为"理想给料"下的值；实际按给料/硬度/含水系数打折', 'S5'),
  ];
  const warnings = [];
  const rejections = [];

  /* ── ① 输入校验 ── */
  if (!Number.isFinite(targetTph) || targetTph <= 0) {
    return buildError('targetTph 必须为正数（t/h）', { targetTph, maxFeedMm, ore });
  }
  if (!Number.isFinite(maxFeedMm) || maxFeedMm <= 0) {
    return buildError('maxFeedMm 必须为正数（mm）', { targetTph, maxFeedMm, ore });
  }

  /* ── ② 反推进料口需求（第一条铁律）── */
  const requiredOpeningMm = Math.ceil(maxFeedMm / 0.85);

  /* ── ③ 实际产能需求（闭路放大）── */
  const closedCircuit = input.closedCircuit === true;
  const requiredRatedTph = closedCircuit ? Math.ceil(targetTph * 1.2) : targetTph;

  /* ── ④ 工况打折系数 ── */
  let factor = 1.0;
  const factorNotes = [];
  if (maxFeedMm >= 0.9 * (requiredOpeningMm * 0.85)) {
    factor *= 0.85; factorNotes.push('给料接近进料口上限 ×0.85');
  }
  if (ucs !== null && ucs > 120) {
    factor *= 0.85; factorNotes.push('硬岩（UCS ' + ucs + ' MPa > 120）×0.85');
  } else if (ucs !== null && ucs > 80) {
    factor *= 0.92; factorNotes.push('中硬岩（UCS ' + ucs + ' MPa）×0.92');
  }
  if (moisture !== null && moisture > 5) {
    factor *= 0.85; factorNotes.push('含水率 ' + moisture + '% > 5% ×0.85');
  }
  if (muddy) {
    factor *= 0.75; factorNotes.push('含泥黏性 ×0.75');
  }
  const requiredNominalTph = Math.ceil(requiredRatedTph / factor);

  /* ── ⑤ 筛选候选机型 ── */
  const candidates = [];
  for (const m of JAW_MODELS) {
    /* 必须满足：进料口宽度 >= 需求 */
    const openingWidth = m.feed_opening_mm[0];
    if (openingWidth < requiredOpeningMm) continue;
    /* 必须满足：最大给料 >= 需求 */
    if (m.max_feed_mm < maxFeedMm) continue;

    const capMin = m.capacity_tph[0];
    const capMax = m.capacity_tph[1];
    /* 台数计算：按名义产能需求 */
    let units = Math.ceil(requiredNominalTph / capMax);
    if (units < 1) units = 1;
    /* 每台实际分摊 */
    const perUnitNominal = requiredNominalTph / units;
    /* 是否落在产能区间内 */
    const inRange = perUnitNominal >= capMin && perUnitNominal <= capMax;
    /* 余量 */
    const headroom = perUnitNominal > capMax ? '不足' : perUnitNominal < capMin ? '偏小' : '合适';

    candidates.push({
      model: m.model,
      series: m.series,
      feed_opening_mm: m.feed_opening_mm,
      max_feed_mm: m.max_feed_mm,
      nominal_capacity_tph: m.capacity_tph,
      power_kw: m.power_kw,
      units,
      per_unit_nominal_tph: round(perUnitNominal, 1),
      in_range: inRange,
      headroom,
      total_power_kw: m.power_kw ? m.power_kw * units : null,
      score: computeScore(m, perUnitNominal, openingWidth, requiredOpeningMm, units),
      source: m.source,
      vendor_pending: true,
    });
  }

  /* ── ⑥ 无候选 → 拒绝 ── */
  if (!candidates.length) {
    rejections.push({
      rule: '给料 ' + maxFeedMm + 'mm 需要进料口 ≥ ' + requiredOpeningMm + 'mm，但现有型号库里没有满足的机型',
      detail: '公开样本里最大进料口为 ' + Math.max(...JAW_MODELS.map((m) => m.feed_opening_mm[0])) +
        'mm。可能是给料粒度过大，需要二次爆破降低块度，或使用旋回破。',
      action: '拒绝计算；建议 ① 优化爆破降低块度 ② 改用旋回破碎机',
      source: 'JAW_LIMITS（给料 > 进料口 0.85 倍会卡料）',
    });
    return buildResult({ targetTph, maxFeedMm, ore, ucs, moisture, muddy, closedCircuit,
      requiredOpeningMm, requiredRatedTph, requiredNominalTph, factor, factorNotes,
      candidates: [], warnings, rejections, final: null });
  }

  /* ── ⑦ 排序：in_range 优先，其次台数少，其次余量合适 ── */
  candidates.sort((a, b) => {
    if (a.in_range !== b.in_range) return a.in_range ? -1 : 1;
    if (a.units !== b.units) return a.units - b.units;
    return b.score - a.score;
  });
  const final = candidates[0];

  /* ── ⑧ 负控：台数爆炸 ── */
  if (final.units > 3) {
    warnings.push('★ 选出 ' + final.units + ' 台 ' + final.model +
      ' —— 台数过多。粗碎通常 1-2 台；超过 3 台说明产能需求超出单机能力，' +
      '建议改用更大机型（如 CJ1113 / PE1200×1500 级）或评估旋回破');
  }

  /* ── ⑨ 负控：给料偏大 ── */
  if (maxFeedMm > final.max_feed_mm) {
    rejections.push({
      rule: '给料 ' + maxFeedMm + 'mm 超过 ' + final.model + ' 的最大给料 ' + final.max_feed_mm + 'mm',
      action: '必须换更大机型',
      source: 'S3 厂商样本',
    });
  }

  /* ── ⑩ 负控：含水/含泥 ── */
  if (moisture !== null && moisture > 8) {
    warnings.push('★ 含水率 ' + moisture + '% > 8% —— 颚破对黏性物料适应性差，' +
      '易堵塞给料口。必须配【预筛分/干式除土】，或改用对黏料更适应的机型（如反击破/锤破，如果可接受）');
  }
  if (muddy) {
    warnings.push('★ 含泥黏性物料 —— 颚破给料口与破碎腔会粘料。' +
      '建议在颚破前加【格筛/预筛分】除土，否则实际产能可能只有名义的 60%');
  }

  /* ── ⑪ 产品 P80 估计 ── */
  const productP80Range = [round(requiredOpeningMm * 0.15, 0), round(requiredOpeningMm * 0.25, 0)];
  const reductionRatio = round(maxFeedMm / ((productP80Range[0] + productP80Range[1]) / 2), 1);

  /* ── ⑫ 价格参考 ── */
  const priceHint = findPriceHint(final.nominal_capacity_tph);

  return buildResult({
    targetTph, maxFeedMm, ore, ucs, moisture, muddy, closedCircuit,
    requiredOpeningMm, requiredRatedTph, requiredNominalTph, factor, factorNotes,
    candidates, warnings, rejections, final,
    productP80Range, reductionRatio, priceHint,
  });
}

function computeScore(m, perUnit, openingWidth, requiredOpening, units) {
  let s = 50;
  /* 台数越少越好 */
  s -= (units - 1) * 15;
  /* 产能利用率在 60-85% 最舒服 */
  const util = perUnit / m.capacity_tph[1];
  if (util >= 0.6 && util <= 0.85) s += 20;
  else if (util > 0.85 && util <= 1.0) s += 5;
  else if (util < 0.4) s -= 10;
  /* 进料口余量 */
  const openingMargin = (openingWidth - requiredOpening) / requiredOpening;
  if (openingMargin >= 0.1 && openingMargin <= 0.4) s += 15;
  else if (openingMargin > 0.4) s -= 5;   /* 开口过大是浪费 */
  /* 有功率参数加分 */
  if (m.power_kw) s += 5;
  return s;
}

function findPriceHint(capacityRange) {
  const mid = (capacityRange[0] + capacityRange[1]) / 2;
  for (const p of JAW_PRICE_HINT.by_capacity) {
    const m = p.capacity_class.match(/(\d+)-(\d+)/);
    if (m) {
      const lo = Number(m[1]); const hi = Number(m[2]);
      if (mid >= lo && mid <= hi) return { ...p, matched_by: '型号产能区间中值 ' + mid + ' t/h 落在该区间' };
    }
  }
  return null;
}

function buildError(message, req) {
  return {
    request: req,
    error: 'missing_required',
    message,
    recommended_model: null,
    candidates: [],
    assumptions: [],
    warnings: ['缺少必填参数：' + message],
    basis: 'NO_CALCULATION',
  };
}

function buildResult(o) {
  return {
    request: {
      targetTph: o.targetTph, maxFeedMm: o.maxFeedMm, ore: o.ore,
      ucsMpa: o.ucs, moisturePct: o.moisture, muddy: o.muddy, closedCircuit: o.closedCircuit,
    },
    /* 核心输出 */
    recommended_model: o.final ? o.final.model : null,
    recommended_series: o.final ? o.final.series : null,
    units: o.final ? o.final.units : null,
    per_unit_nominal_tph: o.final ? o.final.per_unit_nominal_tph : null,
    total_power_kw: o.final ? o.final.total_power_kw : null,
    /* 进料口需求 */
    required_feed_opening_mm: o.requiredOpeningMm ?? null,
    feed_opening_rule: JAW_RULES.feed_opening_rule,
    /* 产能校核 */
    required_rated_tph: o.requiredRatedTph ?? null,
    required_nominal_tph: o.requiredNominalTph ?? null,
    condition_factor: o.factor ? Number(o.factor.toFixed(2)) : null,
    condition_notes: o.factorNotes || [],
    /* 产品 */
    product_p80_mm_estimate: o.productP80Range ?? null,
    reduction_ratio_estimate: o.reductionRatio ?? null,
    product_note: '⚠️ 颚破产品粒度不均匀、针片状多，不能直接当成品；' +
      '必须后接中碎（圆锥破）或筛分。P80 为按进料口的经验估算（S5），实际需厂家曲线',
    /* 候选 */
    candidates: o.candidates || [],
    /* 价格 */
    price_reference: o.priceHint || null,
    price_disclaimer: JAW_PRICE_HINT.disclaimer,
    /* 边界与诚实 */
    limit_rules: JAW_LIMITS,
    rules_used: { feed_opening_rule: JAW_RULES.feed_opening_rule, reduction_ratio: JAW_RULES.reduction_ratio, capacity_note: JAW_RULES.capacity_note },
    rejections: o.rejections || [],
    known_gaps: JAW_GAPS,
    vendor_params_pending: true,
    vendor_meta: JAW_META,
    data_discipline: DATA_DISCIPLINE.map((d) => d.rule),
    assumptions: o.assumptions || [],
    warnings: [...(o.warnings || []),
      '★ 本工具【不含 MACKORN 颚破厂商参数】—— 数据来自公开文献（S3/S5）。',
      '型号建议只到"档位"级别，不能用于采购定点。正式选型须向厂家索取功率曲线与产能表'],
    basis: 'S3 公开文献 + S5 设计手册通用公式；非 MACKORN 厂商实测',
  };
}

/** 颚破知识目录 */
export function jawCatalog() {
  return {
    series: Object.entries(JAW_SERIES).map(([k, v]) => ({ series: k, ...v })),
    models: JAW_MODELS,
    rules: JAW_RULES,
    limits: JAW_LIMITS,
    price_hint: JAW_PRICE_HINT,
    known_gaps: JAW_GAPS,
    meta: JAW_META,
    basis: 'S3 公开文献 + S5 设计手册',
  };
}
