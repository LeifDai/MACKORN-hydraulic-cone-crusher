/**
 * 选矿方法推荐引擎（R108 · P3）
 *
 * 回答：给定矿石类型 + 目标矿物 + 嵌布粒度 + 处理量，
 *       该用什么选矿方法、预期回收率区间、关键限制是什么。
 *
 * 数据纪律：继承 D1-D5。未知返回 null，不编造。
 *
 * ⚠️ 诚实边界：本引擎不含药剂制度、不含设备型号、不含经济指标。
 *    光电选的抛废率必须做工业试验，本引擎只给经验区间并强制告警。
 */
import {
  BENEFICIATION_METHODS, METHOD_SELECTION_RULES, METRIC_DEFINITIONS, PROCESSING_GAPS,
} from './data-processing.mjs';
import { DATA_DISCIPLINE } from './data-valuechain.mjs';

const SRC_NAMES = {
  S1: '厂商参数表', S2: '标准规范', S3: '公开文献', S4: '现场经验', S5: '设计手册', S6: '设计规范',
};
const A = (assumption, source) => ({ assumption, source, source_name: SRC_NAMES[source] || source });
const round = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/* 矿石类型 → 可能适用的方法（关键词匹配，中文/英文） */
const ORE_METHOD_HINTS = [
  { re: /硫化|sulfide|铜矿|copper|铅锌|lead|zinc|钼|moly|镍|nickel/i, methods: ['浮选（Flotation）'], why: '硫化矿天然疏水，浮选是标准工艺' },
  { re: /氧化铜|oxide copper|氧化铅|氧化锌/i, methods: ['浮选（Flotation）', '浸出'], why: '氧化矿可浮性差，需硫化钠活化或改用浸出' },
  { re: /磁铁|magnetite|磁选/i, methods: ['磁选（Magnetic Separation）'], why: '强磁性矿物，磁选最经济' },
  { re: /金|gold|钨|tungsten|锡|tin|钽|tantalum/i, methods: ['重选（Gravity Separation）', '光电选（Ore Sorting）'], why: '密度差大，重选成本低；粗粒金可用重选或光电选预选' },
  { re: /铁矿|iron ore|赤铁|hematite/i, methods: ['磁选（Magnetic Separation）', '重选（Gravity Separation）'], why: '赤铁矿弱磁性需高梯度磁选或重选' },
  { re: /石灰石|limestone|石英|quartz|滑石|talc|萤石|fluorite|磷|phosphate|石墨|graphite/i, methods: ['光电选（Ore Sorting）', '浮选（Flotation）'], why: '工业矿物常用光电选预选或浮选提纯' },
  { re: /煤|coal/i, methods: ['重选（Gravity Separation）', '浮选（Flotation）'], why: '煤用重介/跳汰，细粒煤泥用浮选' },
];

/**
 * 推荐选矿方法
 * @param {object} input
 * @param {string} [input.ore]           矿石类型/名称（如 铜矿石 / 磁铁矿 / 金矿）
 * @param {string} [input.targetMineral] 目标矿物/元素（如 铜 / 金 / 铁）
 * @param {number} [input.feedP80Mm]     磨矿给料 P80 mm（用于粒度窗口判断）
 * @param {number} [input.liberationUm]  解离粒度 μm（需磨到多细才解离）
 * @param {number} [input.targetTph]     处理量 t/h
 * @param {number} [input.slimePct]      矿泥（-10μm）占比 %
 */
export function recommendBeneficiation(input = {}) {
  const ore = input.ore ? String(input.ore) : null;
  const targetMineral = input.targetMineral ? String(input.targetMineral) : null;
  const feedP80 = Number.isFinite(Number(input.feedP80Mm)) ? Number(input.feedP80Mm) : null;
  const liberationUm = Number.isFinite(Number(input.liberationUm)) ? Number(input.liberationUm) : null;
  const targetTph = Number.isFinite(Number(input.targetTph)) ? Number(input.targetTph) : null;
  const slimePct = Number.isFinite(Number(input.slimePct)) ? Number(input.slimePct) : null;

  const assumptions = [
    A('选矿方法适用条件与指标区间取自公开文献与设计手册（S3/S5），非特定矿山实测', 'S3'),
    A('本引擎【不含】药剂制度、设备型号与经济指标；实际方案必须做选矿试验', 'S3'),
  ];
  const warnings = [];
  const rejections = [];

  /* ── ① 输入不足时明确告知，不瞎猜 ── */
  if (!ore && !targetMineral) {
    return {
      request: { ore, targetMineral, feedP80Mm: feedP80, liberationUm, targetTph, slimePct },
      error: 'insufficient_input',
      message: '至少需要 ore（矿石类型）或 targetMineral（目标矿物），否则无法推荐选矿方法',
      recommended_methods: [],
      assumptions: [],
      warnings: ['输入不足：既没给矿石类型也没给目标矿物。选矿方法选择高度依赖这两项，不能猜。'],
      basis: 'NO_CALCULATION',
    };
  }

  /* ── ② 匹配方法 ── */
  const text = (ore || '') + ' ' + (targetMineral || '');
  const matched = [];
  for (const h of ORE_METHOD_HINTS) {
    if (h.re.test(text)) {
      for (const m of h.methods) {
        if (!matched.find((x) => x.method === m)) matched.push({ method: m, why: h.why });
      }
    }
  }

  /* 若关键词没匹配到，按决策规则给通用建议并告警 */
  if (!matched.length) {
    warnings.push('矿石类型「' + (ore || targetMineral) + '」未在方法的典型适用清单里匹配到 —— ' +
      '以下建议仅为通用路径，必须做选矿试验确定');
    matched.push({ method: '浮选（Flotation）', why: '通用路径：需先做可选性试验验证' });
  }

  /* ── ③ 组装候选 ── */
  const candidates = [];
  for (const m of matched) {
    const d = BENEFICIATION_METHODS[m.method];
    if (!d) { candidates.push({ method: m.method, why: m.why, data_available: false }); continue; }
    const rec = d.typical_recovery_pct?.v ?? null;
    candidates.push({
      method: m.method,
      method_en: d.en,
      why: m.why,
      principle: d.principle,
      applicable: d.applicable,
      feed_size_um: d.feed_size_um?.v ?? null,
      typical_recovery_pct: rec,
      recovery_source: d.typical_recovery_pct?.src ?? null,
      energy_kwh_t: d.energy_kwh_t?.v ?? null,
      limitations: d.limitations,
      sensors: d.sensors ?? null,
      honest_note: d.honest_note ?? null,
      basis: 'S3/S5 文献典型区间（非该矿山实测）',
    });
  }

  /* ── ④ 粒度窗口检查（负控 1：解离粒度过细）── */
  if (liberationUm !== null && liberationUm < 10) {
    warnings.push('解离粒度 ' + liberationUm + 'μm 低于常规浮选下限（约 10μm）—— ' +
      '常规浮选/重选效率会急剧下降。需考虑：细磨+选择性絮凝、或浸出工艺、或载体浮选。' +
      '这不是"调个参数"能解决的，必须在试验阶段专门研究');
  }
  if (liberationUm !== null && liberationUm > 200) {
    warnings.push('解离粒度 ' + liberationUm + 'μm 超过常规浮选上限（约 200μm）—— ' +
      '可考虑粗粒浮选或重选；常规浮选对大颗粒回收率低');
  }

  /* ── ⑤ 矿泥检查（负控 2：高矿泥必须先脱泥）── */
  if (slimePct !== null && slimePct > 15) {
    warnings.push('矿泥（-10μm）占比 ' + slimePct + '% 偏高 —— 必须先脱泥再选别。' +
      '矿泥会：① 消耗大量药剂 ② 恶化泡沫 ③ 夹带降低精矿品位。脱泥是必选项不是可选项');
  }

  /* ── ⑥ 光电选特别告警 ── */
  const hasSorting = candidates.some((c) => /光电选/.test(c.method));
  if (hasSorting) {
    warnings.push('光电选（Ore Sorting）的抛废率与盈利性【高度依赖具体矿石】—— ' +
      '本引擎只给经验区间（15-50%），实际必须做工业试验（取代表性矿样，按实际粒度与识别精度测试）。' +
      '禁止把经验区间直接写进投资决策');
  }

  /* ── ⑦ 条件不足的拒绝 ── */
  if (feedP80 === null && targetTph === null) {
    warnings.push('未提供磨矿给料粒度与处理量 —— 无法判断是否需要预选抛废、也无法估算设备规模');
  }

  return {
    request: { ore, targetMineral, feedP80Mm: feedP80, liberationUm, targetTph, slimePct },
    recommended_methods: candidates,
    primary_method: candidates[0]?.method ?? null,
    recovery_pct_range: candidates[0]?.typical_recovery_pct ?? null,
    selection_rules: METHOD_SELECTION_RULES,
    metric_definitions: METRIC_DEFINITIONS,
    known_gaps: PROCESSING_GAPS,
    data_discipline: DATA_DISCIPLINE.map((d) => d.rule),
    assumptions,
    warnings: [...warnings, '本工具为 P3 首版：方法适用条件可信，但【不含药剂制度、设备型号与经济指标】，' +
      '且光电选抛废率必须做工业试验。正式方案须经选矿试验 + MACKORN 技术复核'],
    basis: 'S3 公开文献 + S5 设计手册典型区间；非该矿山实测',
  };
}

/** 选矿方法目录 */
export function beneficiationCatalog() {
  return {
    methods: Object.entries(BENEFICIATION_METHODS).map(([k, v]) => ({
      method: k, method_en: v.en, principle: v.principle,
      applicable: v.applicable,
      feed_size_um: v.feed_size_um?.v ?? null,
      typical_recovery_pct: v.typical_recovery_pct?.v ?? null,
      energy_kwh_t: v.energy_kwh_t?.v ?? null,
      limitations: v.limitations,
      sensors: v.sensors ?? null,
    })),
    selection_rules: METHOD_SELECTION_RULES,
    metric_definitions: METRIC_DEFINITIONS,
    known_gaps: PROCESSING_GAPS,
    basis: 'S3 公开文献 + S5 设计手册',
  };
}
