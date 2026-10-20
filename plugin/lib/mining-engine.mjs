/**
 * 采矿段推荐引擎（R115 · P4）
 *
 * 回答：给定处理量 + 原矿最大块度 + 岩石条件，
 *       爆破块度大概多少、对破碎段有什么影响、运输要配多少、
 *       有哪些必须提醒的坑。
 *
 * 数据纪律：继承 D1-D5。未知返回 null，不编造。
 *
 * ⚠️ 诚实边界：不含爆破设计与审批（需民爆资质）、不含开采设计（需资质）、
 *    岩石系数 A 必须现场标定不能照搬。
 */
import {
  MINING_STAGES, BLAST_FRAGMENTATION, BLAST_TO_CRUSHER, STRIPPING_NOTES, HAULAGE_NOTES, MINING_GAPS,
} from './data-mining.mjs';
import { DATA_DISCIPLINE } from './data-valuechain.mjs';

const SRC = { S3: '公开文献', S4: '现场经验', S5: '设计手册', S6: '设计规范' };
const A = (assumption, source) => ({ assumption, source, source_name: SRC[source] || source });
const round = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/**
 * Kuz-Ram 爆破块度预测
 * @param {object} p { A, V, Q, E, n }
 * @returns {object} X50（中值块度 cm）与分布参数
 */
export function kuzRam({ A = 10, V, Q, E = 100, n = 1.1 } = {}) {
  const ok = Number.isFinite(V) && V > 0 && Number.isFinite(Q) && Q > 0 && Number.isFinite(A) && A > 0;
  if (!ok) return null;
  /* X50 = A · (V/Q)^0.8 · Q^0.167 · (115/E)^0.633  （cm） */
  const x50 = A * Math.pow(V / Q, 0.8) * Math.pow(Q, 0.167) * Math.pow(115 / E, 0.633);
  /* Rosin-Rammler 分布：P(x) = 1 - exp(-(x/xc)^n)，xc = X50 / (ln2)^(1/n) */
  const xc = x50 / Math.pow(Math.LN2, 1 / n);
  const p = (x) => (x <= 0 ? 0 : 1 - Math.exp(-Math.pow(x / xc, n)));
  /* 关键百分位（cm） */
  const pct = (target) => xc * Math.pow(-Math.log(1 - target), 1 / n);
  return {
    model: BLAST_FRAGMENTATION.model,
    source: BLAST_FRAGMENTATION.source,
    inputs: { A, V, Q, E, n },
    x50_cm: round(x50, 1),
    xc_cm: round(xc, 1),
    percentiles_cm: {
      p20: round(pct(0.2), 1),
      p50: round(x50, 1),
      p80: round(pct(0.8), 1),
      p90: round(pct(0.9), 1),
      p100_est: round(pct(0.99), 1),
    },
    note: '★ Kuz-Ram 是经验模型，误差可达 ±20-30%；A（岩石系数）必须按矿区实测标定，不能照搬。' +
      '下面给的是量级参考，不能直接用于爆破设计。',
  };
}

/**
 * 采矿段推荐
 * @param {object} input
 * @param {number} [input.targetTph]      下游处理量 t/h
 * @param {number} [input.maxFeedMm]      原矿最大块度 mm
 * @param {string} [input.rockType]       岩石类型（如 花岗岩/石灰石）
 * @param {number} [input.strippingRatio] 剥采比
 * @param {number} [input.haulKm]         运距 km
 * @param {boolean} [input.muddy]         是否含泥/黏土夹层
 */
export function recommendMining(input = {}) {
  const targetTph = Number.isFinite(Number(input.targetTph)) ? Number(input.targetTph) : null;
  const maxFeedMm = Number.isFinite(Number(input.maxFeedMm)) ? Number(input.maxFeedMm) : null;
  const rockType = input.rockType ? String(input.rockType) : null;
  const strippingRatio = Number.isFinite(Number(input.strippingRatio)) ? Number(input.strippingRatio) : null;
  const haulKm = Number.isFinite(Number(input.haulKm)) ? Number(input.haulKm) : null;
  const muddy = input.muddy === true;

  const assumptions = [
    A('采矿工艺参数取自公开文献与采矿手册（S3/S5），非特定矿山实测', 'S3'),
    A('本引擎【不含】爆破设计与审批、不含开采设计；岩石系数 A 必须现场标定', 'S3'),
  ];
  const warnings = [];
  const rejections = [];

  /* ── ① 输入不足 ── */
  if (targetTph === null && maxFeedMm === null) {
    return {
      request: { targetTph, maxFeedMm, rockType, strippingRatio, haulKm, muddy },
      error: 'insufficient_input',
      message: '至少需要 targetTph（下游处理量）或 maxFeedMm（原矿最大块度），否则无法判断采矿段配置',
      stages: [],
      assumptions: [],
      warnings: ['输入不足：既没给处理量也没给原矿块度。采矿段配置高度依赖这两项，不能猜。'],
      basis: 'NO_CALCULATION',
    };
  }

  /* ── ② 按原矿块度判断对破碎的影响（核心接口）── */
  const crusherNotes = [];
  if (maxFeedMm !== null) {
    if (maxFeedMm > 1000) {
      crusherNotes.push({
        level: 'critical',
        msg: '原矿最大块度 ' + maxFeedMm + 'mm > 1000mm —— 粗碎必须用大型颚破或旋回破；' +
          '且需评估二次破碎（液压锤）配置。这是破碎段设计的首要约束',
      });
    } else if (maxFeedMm > 500) {
      crusherNotes.push({
        level: 'important',
        msg: '原矿最大块度 ' + maxFeedMm + 'mm —— 需颚破（进料口 ≥ ' + Math.round(maxFeedMm / 0.82) + 'mm 按 0.82 倍系数）；' +
          '或先爆破优化把块度降下来',
      });
    } else {
      crusherNotes.push({
        level: 'ok',
        msg: '原矿最大块度 ' + maxFeedMm + 'mm 在常见颚破范围内',
      });
    }
    /* 反推爆破要求 */
    crusherNotes.push({
      level: 'info',
      msg: '★ 爆破块度是决定粗碎选型的最关键因素。建议用 Kuz-Ram 模型估算爆堆 P80，' +
        '并与粗碎进料口能力比对；块度过大需二次破碎，过小则炸药成本浪费',
    });
  }

  /* ── ③ 含泥夹层（负控：必须提醒）── */
  if (muddy) {
    warnings.push('★ 原矿含泥/黏土夹层 —— 会严重恶化破碎与筛分：' +
      '① 黏料堵筛孔 ② 堵破碎腔 ③ 皮带打滑 ④ 扬尘与粘料。' +
      '必须在工艺上配【预筛分 + 除土/洗矿】，不能靠爆解决决。' +
      '这是设计阶段最容易漏、投产最难受的问题');
  }

  /* ── ④ 剥采比检查 ── */
  if (strippingRatio !== null && strippingRatio > 0) {
    if (strippingRatio > 5) {
      warnings.push('剥采比 ' + strippingRatio + ':1 偏高 —— 剥离成本会显著推高矿石成本。' +
        '需核算经济合理剥采比（与地下开采或外购矿石比较）。本库不给通用经济剥采比数值，' +
        '因为它完全取决于矿价与开采成本');
    }
  }

  /* ── ⑤ 运输产能校核（★ 破碎机吃不饱的最常见原因）── */
  const haulage = [];
  if (targetTph !== null) {
    haulage.push({
      rule: '运输能力必须 ≥ 破碎处理能力 × 1.1-1.2',
      required_tph: Math.round(targetTph * 1.15),
      why: '★ 破碎机"吃不饱"最常见原因不是破碎机小，而是运输跟不上。设计时必须单独校核运输能力',
    });
    if (haulKm !== null) {
      haulage.push({
        rule: haulKm > 3
          ? '运距 ' + haulKm + 'km > 3km —— 通常皮带（含长距离带式输送机）比卡车经济'
          : '运距 ' + haulKm + 'km ≤ 3km —— 卡车通常是常规选择',
        why: '卡车油耗与人工随运距线性上升；皮带一次投资高但运营成本低。分界点按电价/油价/人工变化',
      });
    }
  }

  /* ── ⑥ 工序链 ── */
  const stages = MINING_STAGES.map((s) => ({ ...s }));

  return {
    request: { targetTph, maxFeedMm, rockType, strippingRatio, haulKm, muddy },
    stages,
    crusher_interface: crusherNotes,
    blast_fragmentation_notes: {
      model: BLAST_FRAGMENTATION.model,
      formula: BLAST_FRAGMENTATION.formula,
      where: BLAST_FRAGMENTATION.where,
      limitations: BLAST_FRAGMENTATION.limitations,
      honest_note: BLAST_FRAGMENTATION.honest_note,
      how_to_use: '给 kuzRam() 传 A/V/Q/E/n 可算爆堆 P80 量级；但 A 必须先现场标定',
    },
    blast_to_crusher_rules: BLAST_TO_CRUSHER,
    stripping_notes: STRIPPING_NOTES,
    haulage,
    haulage_notes: HAULAGE_NOTES,
    rejections,
    known_gaps: MINING_GAPS,
    data_discipline: DATA_DISCIPLINE.map((d) => d.rule),
    assumptions,
    warnings: [...warnings, '本工具为 P4 首版：工序链与接口关系可信，但【不含爆破设计与开采设计】，' +
      'Kuz-Ram 为经验模型误差 ±20-30%，A 值必须现场标定。正式设计须由有资质单位完成'],
    basis: 'S3 公开文献 + S5 采矿手册典型做法；非特定矿山实测',
  };
}

/** 采矿知识目录 */
export function miningCatalog() {
  return {
    stages: MINING_STAGES,
    blast_fragmentation: BLAST_FRAGMENTATION,
    blast_to_crusher: BLAST_TO_CRUSHER,
    stripping: STRIPPING_NOTES,
    haulage: HAULAGE_NOTES,
    known_gaps: MINING_GAPS,
    basis: 'S3 公开文献 + S5 采矿手册',
  };
}
