/**
 * 细碎台数爆炸修复（R132 简化重写）
 *
 * 2026-10-21 实测暴露：
 *   铁矿 500 t/h · 给料 800mm · 出料 10mm
 *   → 细碎段 selectConeCrusher 选出 NH300/F · CSS 8mm · **10 台**
 *
 * 根因：
 *   selectConeCrusher 只按「单台产能」反推台数。目标粒度过细（10mm）时
 *   只有小机型的小排矿口能满足，单台产能被压到约 50 t/h，于是 500/50 = 10 台。
 *
 * ★ 为什么不能在引擎内部自动改选：
 *   selectConeCrusher 没有 forceModel 参数，引擎自己按"最优"挑型号。
 *   强行改引擎会影响其它用例与已有断言（L-34 的 5 项真值断言会断）。
 *
 * ★ 所以本文件的定位是【外层诊断器 + 方案建议】，不是自动改选：
 *   ① 检测台数爆炸
 *   ② 解释为什么会爆炸（单台产能被小排口压制）
 *   ③ 用机型产能比给出「换大机型大概能降到几台」的量级估算（明确标注是估算）
 *   ④ 给出三种行业替代方案（HPGR / 放粗粒度 / 增加段数）
 *   ⑤ 诚实标注：真实台数必须由 MACKORN 技术用厂家功率曲线确认
 *
 * 用法：
 *   import { diagnoseFineStage } from './fine-stage-optimizer.mjs';
 *   const d = diagnoseFineStage({ targetTph, maxFeedMm, targetProductMm, ore });
 */

import { selectConeCrusher } from './engine.mjs';
import { ALL_MODELS } from './data.mjs';

const A = (assumption, source) => ({ assumption, source });

/** 按型号数字部分排序（NH200 < NH300 < ... < NH895） */
function sortedModels() {
  return (ALL_MODELS || [])
    .filter((m) => /^NH\d+/.test(m.model))
    .sort((a, b) => Number(a.model.replace(/\D/g, '')) - Number(b.model.replace(/\D/g, '')));
}

/**
 * 细碎段台数诊断
 * @param {object} input
 * @param {number} input.targetTph
 * @param {number} input.maxFeedMm
 * @param {number} input.targetProductMm
 * @param {string} [input.ore]
 * @param {number} [input.maxUnits] 可接受的最大台数（默认 3）
 */
export function diagnoseFineStage(input = {}) {
  const targetTph = Number(input.targetTph);
  const maxFeedMm = Number(input.maxFeedMm);
  const targetProductMm = Number(input.targetProductMm);
  const ore = input.ore ?? null;
  const maxUnits = Number.isFinite(Number(input.maxUnits)) ? Number(input.maxUnits) : 3;

  const assumptions = [
    A('台数上限按行业惯例取 ' + maxUnits + ' 台（细碎段超过 3 台通常说明选型或粒度分配不当）', 'S4'),
    A('大机型替代方案的台数是【量级估算】，用 ALL_MODELS 的产能比推算，不是厂家确认值', 'ENGINEERING-RANGE'),
  ];
  const warnings = [];

  /* ① 初选 */
  let base = null;
  try {
    base = selectConeCrusher({ targetTph, maxFeedMm, targetProductMm, stage: '细碎', ore });
  } catch (e) {
    return { error: 'BASE_SELECTION_FAILED', message: String(e.message).slice(0, 120), assumptions: [], warnings: [] };
  }

  /* R133 防护：如果引擎返回空（通常因为 maxFeedMm 超过圆锥破上限 ~350mm），
   * 不要算出荒谬的台数（500 台），而是明确指出传参错误。 */
  if (!base || !base.top_pick || !base.top_pick.model) {
    return {
      error: 'CONE_CANNOT_TAKE_THIS_FEED',
      message: '圆锥破不能接受 ' + maxFeedMm + 'mm 的给料（中细碎设备上限约 350mm）。'
        + '细碎段的 maxFeedMm 应该是【中碎产品粒度】（通常 30-60mm），不是原矿粒度。',
      hint: '正确链路：颚破(原矿) → 中碎(颚破产品, 约 150-250mm) → 细碎(中碎产品, 约 30-60mm)',
      given: { targetTph, maxFeedMm, targetProductMm },
      assumptions: [],
      warnings: ['★ 传参错误：把原矿粒度当成了细碎段给料。必须先经中碎把给料降到 60mm 以下'],
      basis: 'NO_CALCULATION',
    };
  }
  const baseModel = base.top_pick?.model ?? null;
  const baseUnits = base.recommended_units || 1;
  const basePerUnit = base.per_unit_tph ?? (targetTph / baseUnits);

  /* ② 不爆炸就直接返回 OK */
  if (baseUnits <= maxUnits) {
    return {
      verdict: 'OK',
      units: baseUnits,
      model: baseModel,
      cavity: base.top_pick?.cavity ?? null,
      css_mm: base.top_pick?.css_mm ?? null,
      per_unit_tph: basePerUnit,
      warnings: [],
      conclusion: '细碎段 ' + baseUnits + ' 台 ' + baseModel + '，台数合理',
      basis: 'S1 厂商参数（MACKORN NH/NS 表）',
      assumptions,
    };
  }

  /* ③ 爆炸：解释原因 */
  warnings.push('★ 台数爆炸：细碎段选出 ' + baseUnits + ' 台 ' + baseModel +
    '（单台仅 ' + Math.round(basePerUnit) + ' t/h）');
  warnings.push('  为什么：目标粒度 ' + targetProductMm + 'mm 要求小排矿口（CSS ' +
    (base.top_pick?.css_mm ?? '?') + 'mm），' +
    baseModel + ' 在小排口下的产能被压得很低，只能靠堆台数');
  warnings.push('  ★ 这是选型逻辑的合理输出（数字没错），但【工程上不可接受】—— 10 台细碎机的厂房、电控、维护成本极高');

  /* ④ 用机型产能比推算大机型所需台数（量级估算，明确标注） */
  const models = sortedModels();
  const baseInfo = models.find((m) => m.model === baseModel);
  const alternatives = [];

  if (baseInfo) {
    /* 产能比 = 大机型产能上限 / 当前机型产能上限（粗略，但方向对） */
    for (const m of models) {
      const num = Number(m.model.replace(/\D/g, ''));
      const baseNum = Number(baseModel.replace(/\D/g, ''));
      if (num <= baseNum) continue;
      const ratio = m.capacityTph[1] / baseInfo.capacityTph[1];
      /* 估算台数：按产能比反推（保守：乘 0.7 系数，因为小排口下大机型也受压制） */
      const estUnits = Math.max(1, Math.ceil(baseUnits / (ratio * 0.7)));
      alternatives.push({
        model: m.model,
        power_kw: m.powerKw,
        max_feed_mm: m.maxFeedMm,
        css_range: [m.cssMin, m.cssMax],
        capacity_range_tph: m.capacityTph,
        capacity_ratio_vs_base: Number(ratio.toFixed(2)),
        estimated_units: estUnits,
        estimated_total_power_kw: m.powerKw * estUnits,
        confidence: 'ENGINEERING-RANGE（量级估算，非厂家确认）',
      });
      if (estUnits <= maxUnits) break;
    }
    alternatives.sort((a, b) => a.estimated_units - b.estimated_units || a.estimated_total_power_kw - b.estimated_total_power_kw);
  }

  const feasible = alternatives.filter((a) => a.estimated_units <= maxUnits);
  const bestAlt = feasible.length ? feasible[0] : null;

  if (bestAlt) {
    warnings.push('  量级估算：改选 ' + bestAlt.model + ' 可降到约 ' + bestAlt.estimated_units +
      ' 台（总功率约 ' + bestAlt.estimated_total_power_kw + ' kW）');
    warnings.push('  ⚠️ 但这是【量级估算】—— 大机型在小排口下的真实产能必须由 MACKORN 技术用功率曲线确认');
  }

  /* ⑤ 三种行业替代方案（这是最诚实的建议） */
  const redesign = [
    {
      option: '① 高压辊磨 HPGR',
      why: '出 10mm 更经济。能耗约为圆锥破细碎的 1/3-1/2，且产品呈微裂纹，有利于后续球磨降低电耗',
      when: '处理量 ≥ 300 t/h 且目标 8-12mm 时最合适',
      source: 'S3 公开文献',
      tradeoff: '一次投资高；辊面磨损快（硬矿）；对物料水分敏感',
    },
    {
      option: '② 放宽细碎目标到 15-20mm，10mm 交给磨矿',
      why: '磨矿能耗会增加约 2-4 kWh/t，但省掉 7-9 台细碎机与配套电控',
      when: '球磨富余能力足够时',
      source: 'S3 + S5',
      tradeoff: '磨矿电耗上升；球磨机需重新校核容量',
    },
    {
      option: '③ 增加一段超细碎（三段圆锥破串联）',
      why: '每段破碎比控制在 3-4，避免单段承担过大破碎比',
      when: '场地允许、投资可接受时',
      source: 'S5 设计手册',
      tradeoff: '增加输送与电控；总装机上升；但台数分布更均衡',
    },
  ];

  return {
    verdict: bestAlt ? 'RECHECK_WITH_VENDOR' : 'NEEDS_REDESIGN',
    base: {
      model: baseModel,
      cavity: base.top_pick?.cavity ?? null,
      css_mm: base.top_pick?.css_mm ?? null,
      units: baseUnits,
      per_unit_tph: basePerUnit,
      total_power_kw: (base.top_pick?.power_kw || 0) * baseUnits,
    },
    estimated_better_options: alternatives.slice(0, 4),
    best_estimate: bestAlt,
    redesign_options: redesign,
    warnings,
    conclusion: bestAlt
      ? '细碎 ' + baseUnits + ' 台 ' + baseModel + ' 不可接受。量级估算可改用 ' +
        bestAlt.model + '（约 ' + bestAlt.estimated_units + ' 台），但必须由 MACKORN 确认；' +
        '若确认后仍超 ' + maxUnits + ' 台，建议改用 HPGR 或放宽粒度'
      : '细碎用圆锥破承担 ' + targetProductMm + 'mm 不合理（即使最大机型也超 ' + maxUnits + ' 台）。' +
        '强烈建议改用高压辊磨 HPGR，或把目标放宽到 15-20mm',
    basis: 'S1 厂商参数（初选）+ ENGINEERING-RANGE（大机型台数量级估算）+ S3/S5（替代方案）',
    assumptions,
  };
}
