/**
 * 知识桥 —— 把四个库接进选型引擎
 *
 * 四个库（存于 distribution/07_库/，随插件分发）：
 *   JY0001.1   经验库     —— 什么做法有效（含权重评分与正判/模棱两可）
 *   CW0001.1   错误库     —— 什么做法失败（含已修复状态）
 *   CL0001.1   材料库     —— 14 种岩石/矿石的性质与选型提示
 *   XXAL1000.1 选型案例库 —— 公开竞品案例与在线工具观测
 *
 * 用途（对应用户要求「用案例优化选型能力，提升专业能力与准确度」）：
 *   ① 按矿石名称自动给出腔型/段数/衬板提示 → 提高选型建议的专业度
 *   ② 按材料性质校核输入的合理性（如给料粒度 vs 硬度）
 *   ③ 把已知的错误做法作为【前置校验】拦在选型之前
 *   ④ 把公开案例作为对标参照（只作参照，不作承诺）
 *
 * 纪律：
 *   · 库不可用时返回 null，绝不编造
 *   · 材料性质是【区间】就报区间，不取中点
 *   · 竞品案例只作对标，明确标注「不作为 MACKORN 能力承诺」
 *   · 经验/错误的判定状态原样透出（正判/模棱两可/已修复），不美化
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 定位库目录：优先插件内，其次仓库 distribution */
function findLibDir() {
  const cands = [
    join(HERE, '..', '..', 'knowledge'),                 // 打包后：plugin/../knowledge
    join(HERE, '..', '..', 'distribution', '07_库'),     // 仓库内
    resolve(HERE, '..', '..', '..', 'distribution', '07_库'),
  ];
  for (const d of cands) if (existsSync(join(d, 'CL0001.1-材料库.json'))) return d;
  return null;
}
const LIB_DIR = findLibDir();

function readLib(name) {
  if (!LIB_DIR) return null;
  const p = join(LIB_DIR, name);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

export function librariesAvailable() {
  return {
    dir: LIB_DIR,
    material: !!readLib('CL0001.1-材料库.json'),
    experience: !!readLib('JY0001.1-经验库.json'),
    error: !!readLib('CW0001.1-错误库.json'),
    cases: !!readLib('XXAL1000.1-选型案例库.json'),
  };
}

/* ══════════════════ 材料库 ══════════════════ */

export function findMaterial(name) {
  const lib = readLib('CL0001.1-材料库.json');
  if (!lib || !name) return null;
  const q = String(name).toLowerCase().trim();
  for (const [cn, m] of Object.entries(lib.materials || {})) {
    const en = String(m.en || '').toLowerCase();
    if (cn === name || en.includes(q) || q.includes(cn) || (en && q.split(/[\s(（]/)[0] && en.includes(q.split(/[\s(（]/)[0]))) {
      return { key: cn, ...m };
    }
  }
  return null;
}

/** 材料选型提示：腔型 / 段数 / 衬板 / 风险 */
export function materialHints(oreName) {
  const m = findMaterial(oreName);
  if (!m) {
    return {
      found: false,
      queried: oreName || null,
      note: oreName ? ('材料库中没有「' + oreName + '」—— 不猜测其性质；如需请提供 UCS / Bond Wi / 磨蚀指数实测值') : '未提供矿石名称',
      available_materials: Object.keys(readLib('CL0001.1-材料库.json')?.materials || {}),
    };
  }
  const val = (f) => { const x = m[f]; return x && x.v != null ? { value: x.v, source: x.src, note: x.note || null } : null; };
  const ucs = m.ucs_mpa && m.ucs_mpa.v ? (Array.isArray(m.ucs_mpa.v) ? m.ucs_mpa.v : [m.ucs_mpa.v, m.ucs_mpa.v]) : null;
  const ai = m.abrasion_ai && m.abrasion_ai.v ? (Array.isArray(m.abrasion_ai.v) ? m.abrasion_ai.v : [m.abrasion_ai.v, m.abrasion_ai.v]) : null;

  /* 硬度与磨蚀的分级统一用【区间中位数】。
   * 教训（R31 实测）：铝土矿 UCS [30,150] 用上限被判「硬」，但它其实偏软；
   * 花岗岩磨蚀 [0.4,0.7] 用上限被判「极高」，也偏严 —— 宽区间取上限会系统性高估。
   * 区间本身照实报出（ucs_range_mpa / ai_range），选材时按上限考虑。 */
  const mid = (r) => (r[0] + r[1]) / 2;
  const hardness = ucs ? (() => { const v = mid(ucs); return v >= 250 ? '很硬' : v >= 150 ? '硬' : v >= 80 ? '中等' : v >= 40 ? '较软' : '软'; })() : null;
  const wear = ai ? (() => { const v = mid(ai); return v >= 0.6 ? '极高' : v >= 0.4 ? '高' : v >= 0.25 ? '中' : '低'; })() : null;
  const rangeWidth = ucs ? +(ucs[1] - ucs[0]).toFixed(0) : null;
  const hardnessBasis = ucs ? ('按区间中位数 ' + mid(ucs).toFixed(0) + ' MPa 分级；实测区间 ' + ucs[0] + '–' + ucs[1] + ' MPa') : null;
  const wearBasis = ai ? ('按磨蚀指数中位数 ' + mid(ai).toFixed(2) + ' 分级；实测区间 ' + ai[0] + '–' + ai[1] + '（选材请按上限 ' + ai[1] + ' 考虑）') : null;

  const warnings = [];
  if (rangeWidth != null && rangeWidth >= 100) warnings.push('抗压强度区间很宽（' + ucs[0] + '–' + ucs[1] + ' MPa，跨度 ' + rangeWidth + ' MPa）—— 硬度分级按中位数给出，实际取值须以现场试验为准');
  if (Array.isArray(m.moisture_pct?.v) && m.moisture_pct.v[1] >= 6) warnings.push('含水率上限较高（' + m.moisture_pct.v[1] + '%）—— 注意腔型堵塞与筛分效率下降，必要时先除土');
  if (ai && ai[1] >= 0.6) warnings.push('磨蚀指数极高 —— 衬板消耗会成为主要运行成本，报价与选材必须体现');
  if (ucs && ucs[1] >= 250) warnings.push('抗压强度上限很高 —— 应确认是否需提高装机功率裕度');
  if (/石英岩|砂岩/.test(m.key)) warnings.push('石英质岩石：Bond Wi 可能不高，但磨蚀性极高 —— 只看 Wi 会严重低估衬板成本');

  return {
    found: true,
    material: m.key, name_en: m.en, group: m.group,
    hardness_grade: hardness, hardness_basis: hardnessBasis, ucs_range_mpa: ucs, wear_grade: wear,
    wear_basis: wearBasis, ai_range: ai, crushability: m.crushability || null,
    properties: {
      ucs_mpa: val('ucs_mpa'), bond_wi_kwh_t: val('wi_kwh_t'), density_t_m3: val('density_t_m3'),
      bulk_density_t_m3: val('bulk_density_t_m3'), mohs: val('mohs'), abrasion_ai: val('abrasion_ai'), moisture_pct: val('moisture_pct'),
    },
    cavity_hint: m.cavity_hint || null,
    stage_hint: m.stage_hint || null,
    notes: m.notes || null,
    warnings,
    discipline: '性质为公开文献区间（S3）或工程经验（S4）；区间不取中点。实际取值须以现场试验/实测为准。',
  };
}

/* ══════════════════ 经验库 / 错误库 ══════════════════ */

/** 取已确认的经验（正判）与已确认的错误（正判/已修复），供选型前置校验 */
export function knowledgeGuardrails() {
  const jy = readLib('JY0001.1-经验库.json');
  const cw = readLib('CW0001.1-错误库.json');
  const positive = (jy?.experience || []).filter((x) => x.verdict === '正判').sort((a, b) => (b.score || 0) - (a.score || 0));
  const ambiguous = (jy?.experience || []).filter((x) => x.verdict === '模棱两可经验');
  const confirmedErr = (cw?.error || []).filter((x) => x.verdict === '正判');
  const fixedErr = (cw?.error || []).filter((x) => x.verdict === '已修复');
  const ambiguousErr = (cw?.error || []).filter((x) => x.verdict === '模棱两可错误');
  return {
    available: !!(jy || cw),
    experience: {
      positive_count: positive.length,
      ambiguous_count: ambiguous.length,
      top: positive.slice(0, 8).map((x) => ({ id: x.id, claim: x.claim, score: x.score, trials: x.trials, success_rate: x.success_rate })),
      ambiguous: ambiguous.map((x) => ({ id: x.id, claim: x.claim, success_rate: x.success_rate, note: x.verdict_note })),
    },
    error: {
      confirmed_count: confirmedErr.length,
      fixed_count: fixedErr.length,
      ambiguous_count: ambiguousErr.length,
      must_avoid: confirmedErr.map((x) => ({ id: x.id, claim: x.claim, fix: x.fix })),
      fixed_watch: fixedErr.map((x) => ({ id: x.id, claim: x.claim, note: x.verdict_note })),
      ambiguous: ambiguousErr.map((x) => ({ id: x.id, claim: x.claim, failure_rate: x.failure_rate })),
    },
    rule: '正判=可稳定使用；模棱两可=有条件成立须标注条件；已修复=曾出错已修，保留以防回归；测不到记 UNKNOWN 不作结论',
  };
}

/* ══════════════════ 选型案例库 ══════════════════ */

export function caseReference({ material, targetTph } = {}) {
  const lib = readLib('XXAL1000.1-选型案例库.json');
  if (!lib) return null;
  const eff = (lib.cases || []).filter((c) => c.confidence !== 'D');
  const match = eff.filter((c) => {
    if (material && c.material) {
      const a = String(c.material), b = String(material);
      if (!(a.includes(b) || b.includes(a))) return false;
    }
    return true;
  });
  return {
    available: true,
    total_effective: eff.length,
    failed_extraction: (lib.cases || []).length - eff.length,
    matched: match.map((c) => ({
      id: c.id, brand: c.brand, model: c.model, tph: c.tph, material: c.material,
      country: c.country, stage: c.stage, confidence: c.confidence, source_url: c.source_url,
    })),
    online_tools: (lib.online_tools || []).map((t) => ({ brand: t.brand, name: t.name, observed: t.observed, url: t.source_url })),
    compliance: lib.compliance,
    disclaimer: '竞品案例仅作【对标参照】。不得作为 MACKORN 的能力承诺，也不得据此推断 MACKORN 同型号的性能。',
  };
}

/* ══════════════════ 汇总入口 ══════════════════ */

/** 选型前的知识检查：材料提示 + 前置校验 + 对标参照 */
export function selectionKnowledge(input = {}) {
  const ore = input.ore || input.ore_name || null;
  const hints = ore ? materialHints(ore) : null;
  const guard = knowledgeGuardrails();
  const cases = caseReference({ material: hints && hints.found ? hints.material : ore, targetTph: input.target_tph });

  // 前置校验：把与本次选型相关的已知错误做法挑出来
  const preflight = [];
  const allErr = readLib('CW0001.1-错误库.json')?.error || [];
  const relevant = allErr.filter((x) => /模型实现|不确定度|数据处理/.test(x.category || ''));
  for (const e of relevant) {
    preflight.push({ id: e.id, verdict: e.verdict, check: e.claim, fix: e.fix || null });
  }

  const av = librariesAvailable();
  const warnings = [];
  if (!ore) warnings.push('未提供矿石名称 —— 无法给出腔型/衬板/段数提示，也无法查对标案例');
  else if (hints && !hints.found) warnings.push('材料库中没有「' + ore + '」—— 不猜测其性质');
  if (!av.material) warnings.push('材料库文件不可用（分发时未包含）—— 本结果的选型提示将缺失');
  if (cases && cases.total_effective < 5) warnings.push('案例库有效记录仅 ' + cases.total_effective + ' 条 —— 样本太少，对标仅供参考，不宜据此调整参数');

  return {
    libraries: av,
    material_hints: hints,
    guardrails: guard,
    reference_cases: cases,
    preflight,
    warnings,
    assumptions: [
      '材料性质来自公开文献区间（S3）与 MACKORN 工程经验（S4），不取中点、不插值',
      '经验/错误库的判定状态原样透出（正判/模棱两可/已修复），不做美化',
      '竞品案例仅作对标参照，不作为能力承诺',
    ],
  };
}
