/**
 * P6 整线贯通引擎（R118）
 *
 * 用户目标：以破碎设备为基础，把矿山设备、选矿设备在 AI 加持下串起来
 *
 * 这是【端到端】引擎：一次调用从原矿（或爆破产物）一路算到精矿指标。
 *
 * 段间传递链：
 *   采矿（爆破块度 P80）
 *     → 粗碎（颚破/旋回）产品 P80
 *     → 中碎（圆锥破）产品 P80
 *     → 细碎（圆锥破）产品 P80
 *     → 磨矿产品 P80（μm）
 *     → 选别（回收率 / 精矿品位）
 *
 * 数据纪律：继承 D1-D5。未知返回 null。
 *
 * ⚠️ 诚实边界：这五个引擎各自的精度不同 ——
 *   破碎段有 S1 厂商参数（高精度）
 *   磨矿/选矿/采矿是 S3/S5 文献区间（中等精度）
 *   所以【整线结果的可信度受最弱环节限制】。
 *   本引擎会在输出里明确标注每一段的来源等级。
 */
import { selectConeCrusher, sizePlant } from './engine.mjs';
import { selectGrinding } from './grinding-engine.mjs';
import { recommendBeneficiation } from './processing-engine.mjs';
import { recommendAutomation } from './automation-engine.mjs';
import { recommendMining, kuzRam } from './mining-engine.mjs';

const A = (assumption, source) => ({ assumption, source });

/* 典型破碎比（按段）—— 文献区间 */
const STAGE_RATIOS = {
  粗碎: [3, 5],
  中碎: [3, 5],
  细碎: [4, 7],
};

/**
 * 整线贯通
 * @param {object} input
 * @param {number} input.targetTph          目标成品处理量 t/h（必填）
 * @param {number} [input.maxFeedMm]        原矿最大块度 mm（默认 800）
 * @param {number} [input.targetProductMm]  最终产品粒度 mm（默认 20；若走选矿则填精矿目标）
 * @param {string} [input.ore]              矿石类型
 * @param {boolean} [input.toBeneficiation] 是否含选矿段（金属矿山）
 * @param {number} [input.liberationUm]     解离粒度 μm（选矿段用）
 */
export function fullChain(input = {}) {
  const targetTph = Number(input.targetTph);
  if (!Number.isFinite(targetTph) || targetTph <= 0) {
    return {
      error: 'missing_required',
      message: 'targetTph 必须为正数（t/h）',
      stages: [],
      assumptions: [],
      warnings: ['缺少必填参数 targetTph —— 无法做整线计算'],
      basis: 'NO_CALCULATION',
    };
  }
  const maxFeedMm = Number.isFinite(Number(input.maxFeedMm)) ? Number(input.maxFeedMm) : 800;
  const targetProductMm = Number.isFinite(Number(input.targetProductMm)) ? Number(input.targetProductMm) : 20;
  const ore = input.ore ?? null;
  const toBeneficiation = input.toBeneficiation === true;
  const liberationUm = Number.isFinite(Number(input.liberationUm)) ? Number(input.liberationUm) : null;

  const assumptions = [
    A('段间破碎比取文献区间（粗碎 3-5 / 中碎 3-5 / 细碎 4-7），实际按矿石与设备条件变化', 'S3'),
    A('整线可信度受【最弱环节】限制：破碎段 S1 高精度，磨矿/选矿/采矿 S3-S5 中等精度', 'S3'),
    A('未考虑循环负荷对上游设备的放大（闭路时上游需按 1.2-1.3 倍配置）', 'ENGINEERING-RANGE'),
  ];
  const warnings = [];
  const stages = [];

  /* ══════ ① 采矿段（爆破块度）══════ */
  const mining = recommendMining({
    targetTph,
    maxFeedMm,
    rockType: ore,
    muddy: input.muddy === true,
  });
  stages.push({
    stage: 1, name: '采矿·爆破块度',
    source_grade: 'S3（Kuz-Ram 经验模型，误差 ±20-30%）',
    input: { maxFeedMm },
    output: {
      note: '原矿最大块度 ' + maxFeedMm + 'mm 直接作为粗碎给料上限',
      kuzram_hint: '如需预测爆堆 P80，用 mackorn_mining_interface mode=kuzram 传 A/V/Q',
    },
    warnings: mining.warnings || [],
  });

  /* ══════ ② 粗碎（颚破/旋回 —— 本域无选型引擎，按能力反推）══════ */
  const requiredJawFeed = Math.round(maxFeedMm / 0.85); /* 进料口 ≥ 最大块度/0.85 */
  const coarseProductP80 = Math.round(maxFeedMm / 4);   /* 粗碎破碎比约 4 */
  stages.push({
    stage: 2, name: '粗碎（颚破/旋回）',
    source_grade: 'S5（手册经验系数）+ ENGINEERING-RANGE',
    input: { maxFeedMm, targetTph },
    output: {
      required_feed_opening_mm: requiredJawFeed,
      product_p80_mm_estimate: coarseProductP80,
      note: '本插件【不含颚破/旋回选型引擎】—— 进料口按最大块度/0.85 反推，产品 P80 按破碎比 4 估算',
    },
    warnings: ['★ 粗碎段是唯一没有独立选型引擎的环节（本插件只做圆锥破）。' +
      '进料口与产品粒度为工程估算，正式选型需按厂家型谱'],
  });

  /* ══════ ③ 中碎（圆锥破 —— 有引擎）══════ */
  let medium = null;
  try {
    medium = selectConeCrusher({
      targetTph,
      maxFeedMm: coarseProductP80,
      targetProductMm: Math.round(coarseProductP80 / 4),
      stage: '中碎',
      ore,
    });
  } catch (e) {
    warnings.push('中碎选型失败：' + String(e.message).slice(0, 80));
  }
  const mediumProductP80 = Math.round(coarseProductP80 / 4);
  stages.push({
    stage: 3, name: '中碎（圆锥破）',
    source_grade: 'S1（MACKORN 厂商参数表）—— 高精度',
    input: { feedP80Mm: coarseProductP80, targetTph },
    output: {
      product_p80_mm_estimate: mediumProductP80,
      selected_model: medium?.top_pick?.model ?? null,
      selected_cavity: medium?.top_pick?.cavity ?? null,
      power_kw: medium?.top_pick?.power_kw ?? null,
      units: medium?.recommended_units ?? null,
      note: '这一段是【精度最高】的环节 —— 有厂商参数表',
    },
    warnings: medium?.warnings || [],
  });

  /* ══════ ④ 细碎（圆锥破 —— 有引擎）══════ */
  let fine = null;
  try {
    fine = selectConeCrusher({
      targetTph,
      maxFeedMm: mediumProductP80,
      targetProductMm: Math.min(targetProductMm, 10),
      stage: '细碎',
      ore,
    });
  } catch (e) {
    warnings.push('细碎选型失败：' + String(e.message).slice(0, 80));
  }
  const fineProductP80 = Math.min(targetProductMm, 10);
  stages.push({
    stage: 4, name: '细碎（圆锥破）',
    source_grade: 'S1（MACKORN 厂商参数表）—— 高精度',
    input: { feedP80Mm: mediumProductP80 },
    output: {
      product_p80_mm_estimate: fineProductP80,
      selected_model: fine?.top_pick?.model ?? null,
      selected_cavity: fine?.top_pick?.cavity ?? null,
      power_kw: fine?.top_pick?.power_kw ?? null,
      units: fine?.recommended_units ?? null,
    },
    warnings: fine?.warnings || [],
  });

  /* ══════ ④b R119 台数爆炸告警 ══════
   * 实测发现：1000 t/h 用 targetProductMm=10 做细碎，会选出 20 台 NH300 —— 明显不合理。
   * 原因是目标粒度过细时只有小机型的小排矿口能满足，台数就爆炸。
   * 正确做法：① 改用更大机型 ② 增加破碎段 ③ 降低细碎目标粒度（交给磨矿）。
   * 这里加告警，不自动改选（改选需要用户确认）。 */
  if (fine && fine.recommended_units > 8) {
    warnings.push(
      '★ 细碎选出 ' + fine.recommended_units + ' 台 ' + (fine.top_pick?.model || '?') +
      ' —— 台数过多，通常说明【目标粒度过细】或【机型选小了】。' +
      '建议：① 改用更大机型（NH600/NH700）② 增加一段破碎 ③ 把 10mm 以下交给磨矿段。' +
      '本引擎不自动改选（那需要用户确认方案）',
    );
  }
  /* ══════ ⑤ 磨矿（有引擎）—— 仅在需要细磨时 ══════ */
  if (toBeneficiation) {
    const grind = selectGrinding({
      targetTph,
      feedP80Mm: fineProductP80,
      productP80Mm: liberationUm ? liberationUm / 1000 : 0.075,
      ore,
      closedCircuit: true,
    });
    stages.push({
      stage: 5, name: '磨矿',
      source_grade: 'S3/S5（文献区间）—— 中等精度，缺厂商型号',
      input: { feedP80Mm: fineProductP80, targetP80Mm: liberationUm ? liberationUm / 1000 : 0.075 },
      output: {
        recommended_method: grind.recommended_method,
        installed_power_kw_range: grind.installed_power_kw_range,
        specific_energy_kwh_t: grind.specific_energy_kwh_t,
        classifier: grind.classifier?.recommended ?? null,
        equipment_model: grind.equipment_model_recommendation,
        note: '★ 型号为 null 是诚实的 —— 需 MACKORN 提供磨机功率曲线',
      },
      warnings: grind.warnings || [],
    });

    /* ══════ ⑥ 选矿（有引擎）══════ */
    const benef = recommendBeneficiation({
      ore,
      liberationUm: liberationUm ?? 75,
      targetTph,
      slimePct: input.slimePct,
    });
    stages.push({
      stage: 6, name: '选矿',
      source_grade: 'S3/S5（文献区间）—— 中等精度，不含药剂制度',
      input: { ore, liberationUm },
      output: {
        primary_method: benef.primary_method,
        recovery_pct_range: benef.recovery_pct_range,
        candidates: (benef.recommended_methods || []).map((m) => m.method),
        note: '★ 回收率为文献典型区间，不是本矿实测；必须做选矿试验',
      },
      warnings: benef.warnings || [],
    });
  }

  /* ══════ ⑦ 自动化（有引擎）══════ */
  const auto = recommendAutomation({
    section: '全部',
    targetTph,
    hasPlc: input.hasPlc === true,
    hasScada: input.hasScada === true,
    hasOnlineAnalyzer: input.hasOnlineAnalyzer === true,
    hasDedicatedStaff: input.hasDedicatedStaff === true,
  });
  stages.push({
    stage: stages.length + 1, name: '自动化',
    source_grade: 'S6/S5（设计规范与手册）',
    input: { targetTph },
    output: {
      layers: (auto.recommended_layers || []).map((l) => l.level + '=' + l.recommend),
      l3_verdict: auto.advanced_control_verdict,
      instrument_count: Object.values(auto.instruments || {}).reduce((s, a) => s + a.length, 0),
    },
    warnings: auto.warnings || [],
  });

  /* ══════ 汇总：可信度按最弱环节 ══════ */
  const gradeRank = { 'S1（MACKORN 厂商参数表）—— 高精度': 3 };
  const weakStages = stages.filter((s) => !String(s.source_grade).startsWith('S1'));
  const weakest = weakStages[0] || null;

  return {
    request: { targetTph, maxFeedMm, targetProductMm, ore, toBeneficiation, liberationUm },
    stages,
    summary: {
      total_stages: stages.length,
      stone_flow_note: '原矿 ' + maxFeedMm + 'mm → 粗碎 ' + coarseProductP80 + 'mm → 中碎 ' + mediumProductP80 +
        'mm → 细碎 ' + fineProductP80 + 'mm' + (toBeneficiation ? ' → 磨矿 → 选矿' : ''),
      weakest_link: weakest ? weakest.name + '（' + weakest.source_grade + '）' : null,
      credibility_rule: '整线可信度受最弱环节限制。破碎段有厂商参数（高精度），' +
        '磨矿/选矿/采矿是文献区间（中等精度），粗碎是工程估算。' +
        '不能因为整线算出来了，就以为每一段都同样可靠',
    },
    known_gaps: [
      '粗碎段没有独立选型引擎（本插件只做圆锥破）',
      '磨矿/选矿段没有厂商型号参数',
      '段间未考虑循环负荷放大（闭路时上游需按 1.2-1.3 倍）',
      '未做设备台数的最优组合优化（各段独立选型，可能不是全局最优）',
      '未含土建/电气/总图/投资估算',
    ],
    assumptions,
    warnings: [...warnings,
      '★ 整线结果是【量级贯通】，不是施工图设计。',
      '破碎段可信度高（S1），其余段需试验与厂家资料补齐。'],
    basis: '破碎段 S1 厂商参数 + 磨矿/选矿/采矿 S3-S5 文献区间 + 粗碎 ENGINEERING-RANGE 估算',
  };
}

/** 段间破碎比参考 */
export function stageRatios() {
  return { ratios: STAGE_RATIOS, source: 'S3 公开文献典型区间', note: '实际按矿石硬度与设备条件变化' };
}
