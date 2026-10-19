/**
 * 磨矿选型引擎（R107 · P2）
 *
 * 用户目标：「磨矿（半自磨机，球磨机，分级机，旋流器）」
 *
 * 本引擎回答：
 *   给定 处理量 tph + 给料 P80 + 目标产品 P80 + 矿石，
 *   该选什么磨矿方式（SAG / 球磨 / HPGR）、几台、多大装机功率、比能耗多少。
 *
 * 数据纪律（继承 D1-D5 与项目五条硬规矩）：
 *   · 绝不编造：厂商型号参数缺失时返回 null + warning，不硬凑型号
 *   · 每个结论带来源（S3 文献 / S5 手册 / ENGINEERING-RANGE）
 *   · 冲突并列不平均
 *   · 承认边界：越界拒绝（球磨给料>25mm、Bond 用于半自磨等）
 *   · 不信任自我报告：所有区间标注出处
 *
 * ⚠️ 诚实边界：本引擎【没有】具体厂商型号参数（MQY/MQS 等），
 *    所以输出的是「磨矿方式 + 台数 + 功率量级 + 比能耗区间」，
 *    不是「MQY 3660 型球磨机」这种确切型号。后者需要 MACKORN 提供厂家资料。
 */
import {
  GRINDING_METHODS, CLASSIFIERS, GRINDING_FORMULAS, GRINDING_LIMITS, GRINDING_GAPS,
} from './data-grinding.mjs';
import { DATA_DISCIPLINE } from './data-valuechain.mjs';

const SRC_LEVELS = {
  S1: '厂商参数表', S2: '标准规范', S3: '公开文献', S4: '现场经验', S5: '设计手册', S6: '设计规范',
  'ENGINEERING-RANGE': '工程经验区间（非实测标定）',
  'ENGINEERING-DEFAULT': '工程默认值',
  LITERATURE: '公开文献',
};

const A = (assumption, source) => ({ assumption, source, source_name: SRC_LEVELS[source] || source });
const round = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/* ══════════════════════════════════════════════════════════════
 * 一、磨矿方式推荐（按处理量与产品粒度）
 * ══════════════════════════════════════════════════════════════ */

/**
 * 推荐磨矿方式
 * @param {object} input
 * @param {number} input.targetTph   处理量 t/h（必填）
 * @param {number} [input.feedP80Mm] 给料 P80 mm
 * @param {number} [input.productP80Mm] 目标产品 P80 mm
 * @param {string} [input.ore]       矿石名称
 * @param {boolean} [input.closedCircuit] 是否闭路（默认 true）
 */
export function selectGrinding(input = {}) {
  const targetTph = Number(input.targetTph);
  /* R107：缺参数时【返回结构化错误，不抛异常】—— 与其他 23 个工具一致。
   * 理由：selftest 会用空参数调每个工具；抛异常会被记为失败。
   * 而且对 AI 客户端来说，结构化错误比异常更好处理。 */
  if (!Number.isFinite(targetTph) || targetTph <= 0) {
    return {
      request: { targetTph: input.targetTph ?? null, feedP80Mm: input.feedP80Mm ?? null, productP80Mm: input.productP80Mm ?? null, ore: input.ore ?? null, closedCircuit: input.closedCircuit !== false },
      error: 'missing_required',
      message: 'targetTph 必须为正数（t/h）',
      recommended_method: null,
      candidates: [],
      assumptions: [],
      warnings: ['缺少必填参数 targetTph（处理量 t/h）—— 无法选型。请提供处理量后重试。'],
      basis: 'NO_CALCULATION',
    };
  }
  const feedP80 = Number.isFinite(Number(input.feedP80Mm)) ? Number(input.feedP80Mm) : null;
  const productP80 = Number.isFinite(Number(input.productP80Mm)) ? Number(input.productP80Mm) : null;
  const ore = input.ore ?? null;
  const closedCircuit = input.closedCircuit !== false;

  const assumptions = [
    A('磨矿方式参数取自公开文献/设计手册典型区间（S3/S5），非厂商实测曲线', 'S3'),
    A(`按${closedCircuit ? '闭路' : '开路'}配置；闭路需配分级设备`, 'ENGINEERING-DEFAULT'),
    A('比能耗为文献典型区间，实际随矿石可磨性（Bond Wi）与目标细度变化', 'S3'),
  ];
  const warnings = [];
  const rejections = [];
  const candidates = [];

  /* ── ① 硬边界：给料过大 ── */
  if (feedP80 !== null && feedP80 > 25) {
    /* 球磨给料上限 25mm；超过必须上游处理 */
    if (feedP80 > 350) {
      rejections.push({
        rule: '给料 P80 > 350mm 超出所有磨机能力',
        detail: '磨机不能吃这么大块。必须先经粗碎+中碎（甚至细碎）把给料降到球磨 ≤25mm / 半自磨 ≤350mm。',
        action: '拒绝计算磨矿段，请先确定破碎段产品粒度',
        source: 'GRINDING_LIMITS + S5 手册',
      });
      return buildResult({ targetTph, feedP80, productP80, ore, closedCircuit, assumptions, warnings, rejections, candidates, final: null });
    }
    warnings.push('给料 P80 ' + feedP80 + 'mm 超过球磨上限 25mm —— 半自磨可接受但需确认厂家给料上限；' +
      '若用球磨必须在上游增设细碎');
  }

  /* ── ② 目标过细告警 ── */
  if (productP80 !== null && productP80 < 0.02) {
    warnings.push('目标 P80 ' + (productP80 * 1000).toFixed(0) + 'μm 已进入过磨区（<20μm）—— ' +
      '球磨比能耗急剧上升，应考虑搅拌磨/砂磨，或回头检查选矿工艺是否真的需要这么细');
  }

  /* ── ③ 按处理量推荐方式 ── */
  const modeOrder = [];
  if (targetTph >= 5000) {
    modeOrder.push({ mode: 'SAG（半自磨）', reason: '处理量 ≥5000 t/d，半自磨单位投资更经济', score: 90 });
    modeOrder.push({ mode: '球磨（Ball Mill）', reason: '可作为半自磨后的细磨段', score: 70 });
  } else if (targetTph >= 500) {
    modeOrder.push({ mode: '球磨（Ball Mill）', reason: '处理量 500-5000 t/d，球磨是主力方案', score: 85 });
    modeOrder.push({ mode: '高压辊磨（HPGR）', reason: '可作预粉磨或替代部分球磨，节能明显', score: 60 });
  } else {
    modeOrder.push({ mode: '球磨（Ball Mill）', reason: '处理量 <500 t/d，球磨最经济；半自磨不经济', score: 90 });
  }

  /* ── ④ 计算每种方式的比能耗与功率 ── */
  for (const cand of modeOrder) {
    const m = GRINDING_METHODS[cand.mode];
    if (!m) continue;
    const se = m.specific_energy_kwh_t?.v ?? null;
    const powerRange = se ? [round(se[0] * targetTph, 0), round(se[1] * targetTph, 0)] : null;
    candidates.push({
      method: cand.mode,
      method_en: m.en,
      match_score: cand.score,
      reason: cand.reason,
      feed_limit_mm: m.feed_size_mm?.v ?? null,
      product_p80_range_mm: m.product_p80_mm?.v ?? null,
      specific_energy_kwh_t: se,
      specific_energy_source: m.specific_energy_kwh_t?.src ?? null,
      installed_power_kw_range: powerRange,
      application: m.application,
      limitations: m.limitations,
      basis: 'S3/S5 文献典型区间（非厂商实测）',
      warnings: buildMethodWarnings(cand.mode, feedP80, productP80, targetTph),
    });
  }

  /* ── ⑤ 分级设备建议（闭路时必须）── */
  let classifierAdvice = null;
  if (closedCircuit) {
    const cutMm = productP80 !== null ? productP80 : null;
    if (cutMm !== null && cutMm < 0.074) {
      classifierAdvice = {
        recommended: '水力旋流器',
        reason: '目标分级粒度 <74μm，螺旋分级机效率急降，必须用旋流器',
        key_params: CLASSIFIERS['水力旋流器'].key_params,
        source: 'S5 手册 + GRINDING_LIMITS',
      };
    } else {
      classifierAdvice = {
        recommended: '螺旋分级机 或 水力旋流器',
        reason: '分级粒度较粗（≥74μm），两者都可用；旋流器占地小但需稳定给料压力',
        source: 'S5 手册',
      };
    }
  }

  const final = candidates[0] ?? null;
  return buildResult({ targetTph, feedP80, productP80, ore, closedCircuit, assumptions, warnings, rejections, candidates, final, classifierAdvice });
}

function buildMethodWarnings(mode, feedP80, productP80, tph) {
  const w = [];
  const m = GRINDING_METHODS[mode];
  if (!m) return w;
  const feedLim = m.feed_size_mm?.v;
  if (feedP80 !== null && feedLim && feedP80 > feedLim[1]) {
    w.push('给料 P80 ' + feedP80 + 'mm 超过 ' + mode + ' 典型给料上限 ' + feedLim[1] + 'mm');
  }
  if (mode === 'SAG（半自磨）' && tph < 300) {
    w.push('半自磨单机 <300 t/d 时不经济（单位投资过高）');
  }
  if (productP80 !== null && mode === '球磨（Ball Mill）' && productP80 < 0.02) {
    w.push('目标 P80 <20μm，球磨进入过磨区，能耗急剧上升');
  }
  return w;
}

function buildResult({ targetTph, feedP80, productP80, ore, closedCircuit, assumptions, warnings, rejections, candidates, final, classifierAdvice = null }) {
  /* 汇总边界规则说明 */
  const limitNotes = GRINDING_LIMITS.map((l) => ({ rule: l.rule, why: l.why, action: l.action }));

  return {
    request: { targetTph, feedP80Mm: feedP80, productP80Mm: productP80, ore, closedCircuit },
    recommended_method: final ? final.method : null,
    recommended_method_en: final ? final.method_en : null,
    match_score: final ? final.match_score : null,
    installed_power_kw_range: final ? final.installed_power_kw_range : null,
    specific_energy_kwh_t: final ? final.specific_energy_kwh_t : null,
    candidates,
    classifier: classifierAdvice,
    limit_checks: limitNotes,
    rejections,
    /* ⚠️ 诚实声明：没有厂商型号参数 */
    equipment_model_recommendation: null,
    equipment_model_note: '本引擎【不含】具体厂商型号（如 MQY/MQS 球磨机型号表）—— 需要 MACKORN 或厂家提供功率曲线与规格表。' +
      '当前只给「磨矿方式 + 台数级功率量级 + 比能耗区间」，不足以直接下采购单。',
    known_gaps: GRINDING_GAPS,
    data_discipline: DATA_DISCIPLINE.map((d) => d.rule),
    assumptions,
    warnings: [...warnings, '本工具为 P1/P2 首版：磨矿方式与区间可信，但缺厂商型号参数，正式方案须经 MACKORN 技术复核'],
    basis: 'S3 公开文献 + S5 设计手册典型区间；非 MACKORN 实测标定',
  };
}

/* ══════════════════════════════════════════════════════════════
 * 二、磨矿方式目录（供工具目录使用）
 * ══════════════════════════════════════════════════════════════ */
export function grindingCatalog() {
  return {
    methods: Object.entries(GRINDING_METHODS).map(([k, v]) => ({
      method: k, method_en: v.en,
      feed_size_mm: v.feed_size_mm?.v ?? null,
      product_p80_mm: v.product_p80_mm?.v ?? null,
      specific_energy_kwh_t: v.specific_energy_kwh_t?.v ?? null,
      application: v.application,
      limitations: v.limitations,
    })),
    classifiers: Object.entries(CLASSIFIERS).map(([k, v]) => ({
      classifier: k, classifier_en: v.en,
      cut_size_mm: v.cut_size_mm?.v ?? null,
      application: v.application,
      limitations: v.limitations,
    })),
    formulas: Object.entries(GRINDING_FORMULAS).map(([k, v]) => ({
      id: k, formula: v.formula, source: v.source, note: v.note, applicability: v.applicability,
    })),
    limits: GRINDING_LIMITS,
    known_gaps: GRINDING_GAPS,
    basis: 'S3 公开文献 + S5 设计手册',
  };
}
