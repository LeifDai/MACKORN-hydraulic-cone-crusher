/**
 * MACKORN 液压圆锥破碎机生产线选型 · DeepSeek Harness 插件（Cordis entry）
 * ============================================================================
 * 形态：纯 Cordis 插件（无 `dsh.bundle`），经 `$DSH_HOME/cordis.patch.yml`
 *       或 profile `cordis.patch.yml` 的 insert 行挂载（配置 HMR 实时生效）。
 *
 * 关键工程决策（必须在文档中保持诚实）：
 *   1. **零外部依赖**：本文件不 import 任何 `@deepseek-ai/*` 包。工具定义以
 *      `defineTool()` 的编译产物形态手写（raw JSON Schema + execute + render），
 *      由装配环境注入的 `ctx.tools` 完成注册。理由：绝对路径挂载的插件目录
 *      不在 profile 的 node_modules 闭包内，裸包名解析会失败（会拖垮整个
 *      profile 启动）。零依赖使 `$DSH_HOME/plugins/` 下的绝对路径挂载成为
 *      最安全的安装通道。
 *   2. **HMR 重入保护**：`apply()` 可能因用户 patch 文件热重载被二次调用。
 *      第一次注册的 disposer 记在 `globalThis[Symbol.for(...)]` 上，重入时先
 *      释放再注册，避免 "tool already registered"。
 *   3. **加载期绝不抛错**：单个工具注册失败只告警并跳过，不能让 profile 树加载失败。
 *
 * @module mackorn-cone-crusher
 */

import {
  analyzeMcfm, selectConeCrusher, checkCapacity, sizePlant, estimateCost,
  analyzeWear, analyzeGrading, marketIntel, buildSelectionReport, ENGINEERING_RULES,
} from './lib/engine.mjs';
import { intakeRequirement, FORM_FIELDS } from './lib/intake.mjs';
import { buildProposal } from './lib/proposal.mjs';
import { crusherCurve, flowsheet } from './lib/sim-adapter.mjs';
import { calibrateBreakage } from './lib/calibrate.mjs';
import { contactBlockCN, contactBlockEN, COMPANY, CONTACTS, WECHAT_QR, PARTNER_PROGRAM, triggerCoverageReport, TRIGGER_KEYWORDS } from './lib/contact.mjs';
import { contactBlockLang, normalizeLang, languageCoverage } from './lib/contact-i18n.mjs';
import {
  intelBrief, ingestKnowledge, evolutionStatus, recordPdca,
} from './lib/evolve.mjs';
import { ALL_MODELS, CAVITY_TYPES, SOURCES, NH_SERIES, NS_SERIES } from './lib/data.mjs';
import { PRICE_DISCLAIMER } from './lib/data-market.mjs';
import { evaluateDistributor, VERIFICATION_CHANNELS } from './lib/distributor.mjs';
import { describe, concentration, residualAnalysis, weibullFit, growthWithBaseEffect } from './lib/stats.mjs';
import { selectionKnowledge } from './lib/knowledge-bridge.mjs';
import { selectGrinding, grindingCatalog } from './lib/grinding-engine.mjs';
import { recommendBeneficiation, beneficiationCatalog } from './lib/processing-engine.mjs';
import { recommendAutomation, automationCatalog } from './lib/automation-engine.mjs';
import { recommendMining, miningCatalog, kuzRam } from './lib/mining-engine.mjs';
import { fullChain, stageRatios } from './lib/fullchain-engine.mjs';
import { selectJaw, jawCatalog } from './lib/jaw-engine.mjs';
import { selectScreen, screenCatalog } from './lib/screen-engine.mjs';
import { guardInput, attachGuardrails, GUARD_RULES, listRules } from './lib/guardrails.mjs';

export const name = 'mackorn-cone-crusher';
export const inject = ['tools'];

const REGISTRY_KEY = Symbol.for('mackorn.cone-crusher.disposers');
const MODEL_ENUM = ALL_MODELS.map((m) => m.model);
const CAVITY_ENUM = CAVITY_TYPES.map((c) => c.code);

/* --------------------------------------------------------------------------
 * 小工具：raw JSON Schema 构造（严格贴合 dsh-tools 的 schema 子集）
 * ------------------------------------------------------------------------ */

const S = {
  string: (description, extra = {}) => ({ type: 'string', description, ...extra }),
  number: (description, extra = {}) => ({ type: 'number', description, ...extra }),
  integer: (description, extra = {}) => ({ type: 'integer', description, ...extra }),
  boolean: (description, extra = {}) => ({ type: 'boolean', description, ...extra }),
  arrayOfNumbers: (description, extra = {}) => ({ type: 'array', description, items: { type: 'number' }, ...extra }),
  stringEnum: (description, values, extra = {}) => ({ type: 'string', description, enum: values, ...extra }),
};

const obj = (properties, required = []) => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

/** 宽松对象输出模式：只要求可无损 JSON 化，具体结构由 render 呈现。 */
const ANY_OBJECT = { type: 'object', additionalProperties: true };

const text = (value) => [{ type: 'text', text: value }];

const mdTable = (headers, rows) => {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `|${headers.map(() => ':---|').join('')}`;
  const body = rows
    .map((r) => `| ${r.map((c) => (c === null || c === undefined ? '-' : String(c))).join(' | ')} |`)
    .join('\n');
  return `${head}\n${sep}\n${body}`;
};

const jsonBlock = (value, label = '原始结果 JSON') =>
  `\n\n<details><summary>${label}</summary>\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n\n</details>`;

const assumptionBlock = (assumptions = [], warnings = []) => {
  const parts = [];
  if (assumptions.length) {
    parts.push('**假设与来源**\n\n' + mdTable(['假设', '来源'], assumptions.map((a) => [a.assumption, a.source])));
  }
  if (warnings.length) parts.push('**风险与待确认项**\n\n' + warnings.map((w) => `- ⚠️ ${w}`).join('\n'));
  return parts.length ? `\n\n---\n\n${parts.join('\n\n')}` : '';
};

/**
 * 知识体检渲染块 —— 把材料库/经验库/错误库/案例库的结论呈现在工具输出里。
 *
 * 为什么单独成块：这些不是"风险项"，而是【选型建议与工程判断】，
 * 和 warnings 混在一起会被淹没。但严重级别（conflict）仍会同时进 warnings，
 * 保证只看告警的人也不会漏掉。
 */
const knowledgeBlock = (k) => {
  if (!k || !k.available) return '';
  const parts = [];

  if (k.material && k.material.name) {
    const m = k.material;
    parts.push('### 材料性质（' + m.name + (m.name_en ? ' / ' + m.name_en : '') + '）\n\n' + mdTable(['项', '值'], [
      ['类别', m.group || '—'],
      ['硬度', (m.hardness_grade || '—') + (m.hardness_basis ? '　（' + m.hardness_basis + '）' : '')],
      ['磨蚀', (m.wear_grade || '—') + (m.wear_basis ? '　（' + m.wear_basis + '）' : '')],
      ['可碎性', m.crushability || '—'],
      ['抗压强度 MPa', m.ucs_range_mpa ? m.ucs_range_mpa[0] + '–' + m.ucs_range_mpa[1] : '—'],
      ['磨蚀指数 AI', m.ai_range ? m.ai_range[0] + '–' + m.ai_range[1] : '—'],
    ]));
    if (m.notes) parts.push('> ' + m.notes);
  } else if (k.material && k.material.found === false) {
    parts.push('### 材料性质：未收录\n\n' + (k.material.note || '') + (k.material.available_materials ? '\n\n已收录：' + k.material.available_materials.join(' / ') : ''));
  }

  const conf = (k.compatibility || []).filter((x) => x.level === 'conflict');
  const attn = (k.compatibility || []).filter((x) => x.level === 'attention');
  const info = (k.compatibility || []).filter((x) => x.level === 'info');
  if (conf.length) {
    parts.push('### ⚠️ 需要你判断的冲突\n\n' + conf.map((x) => '**' + x.item + '**\n\n' + x.detail + '\n\n*来源：' + x.source + '*').join('\n\n---\n\n'));
  }
  if (attn.length) {
    parts.push('### 需要关注\n\n' + attn.map((x) => '- **' + x.item + '**：' + x.detail).join('\n'));
  }
  if (info.length) {
    parts.push('### 选型建议\n\n' + info.map((x) => '- ' + x.item + '：' + x.detail).join('\n'));
  }

  if (k.known_error_guard && k.known_error_guard.length) {
    parts.push('### 已知错误拦截（来自错误库）\n\n' + mdTable(['编号', '状态', '要点'],
      k.known_error_guard.slice(0, 6).map((x) => [x.id, x.verdict, x.check + (x.fix ? '　→ ' + x.fix : '')])));
  }

  if (k.reference_cases && k.reference_cases.matched && k.reference_cases.matched.length) {
    parts.push('### 公开对标案例（' + k.reference_cases.total_effective + ' 条有效记录中匹配 ' + k.reference_cases.matched.length + ' 条）\n\n'
      + mdTable(['编号', '品牌', '机型', '产量 t/h', '物料', '国家'],
        k.reference_cases.matched.map((x) => [x.id, x.brand || '—', x.model || '—', x.tph || '—', x.material || '—', x.country || '—']))
      + '\n\n> ' + (k.reference_cases.disclaimer || ''));
  }

  if (k.sources && k.sources.length) parts.push('*知识来源：' + k.sources.join(' · ') + '*');
  if (k.rule) parts.push('> ' + k.rule);

  return parts.length ? '\n\n---\n\n## 知识体检\n\n' + parts.join('\n\n') : '';
};

/* --------------------------------------------------------------------------
 * 工具 1：MCFM 粒度分布诊断
 * ------------------------------------------------------------------------ */

const toolMcfm = {
  name: 'mackorn_mcfm_analysis',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) 计算 MACKORN 粗粒级给料模数 MCFM（M=(A1+…+A7−7A8)/(100−A8)），判定是否落在工程最优窗口 4.0-4.5，并给出"均匀布料 → 速度均匀化 → 磨损稳定 → 模数恒定"的杠杆调整建议。用于诊断破碎腔给料级配是否稳定、是否应先改布料而不是换设备。当用户提到给料级配、筛余、模数、离析、布料、细碎台时产量偏低时调用。' + ' 【适用边界】本工具诊断【粗粒级给料模数】，回答"给料级配稳不稳"；不回答"配比孔隙率"（见 grading_porosity）。',
  parameters: obj(
    {
      cumulative_retained: S.arrayOfNumbers(
        '长度必须为 8 的累积筛余百分比数组，依次对应 最大给料/60/40/20/10/5/2.5mm 与 80% 通过粒级（A1..A8，单位 %）。',
      ),
      feed_top_mm: S.number('给料最大粒度 mm，用于上下文校验。'),
      target_product_mm: S.number('目标最终产品粒度 mm。'),
      ore_note: S.string('矿石名称/硬度/含泥量等备注，原样回显。'),
    },
    ['cumulative_retained'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => text(
      [
        `## MCFM 粗粒级模数诊断`,
        ``,
        `- **模数 M = ${v.mcfm ?? '未计算'}**（工程最优窗口 ${v.optimal_range.join(' - ')}）`,
        v.deviation ? `- 判定：**${v.deviation.level}**，偏离度 ${v.deviation.deviation}` : '',
        v.advice ? `- 工程含义：${v.advice.meaning}` : '',
        v.advice ? `- 建议动作：**${v.advice.action}**（优先级 ${v.advice.priority}）` : '',
        ``,
        `### 杠杆链（按顺序检查，不要跳步）`,
        mdTable(['步', '杠杆', '度量', '目标'], v.leverage_chain.map((s) => [s.step, s.lever, s.metric, s.target])),
        assumptionBlock(v.assumptions, v.warnings),
        jsonBlock(v),
      ]
        .filter((line) => line !== '')
        .join('\n'),
    ),
  },
  async execute(args) {
    return analyzeMcfm({
      cumulativeRetained: args.cumulative_retained,
      feedTopMm: args.feed_top_mm,
      targetProductMm: args.target_product_mm,
      oreNote: args.ore_note,
    });
  },
};

/* --------------------------------------------------------------------------
 * 工具 2：液压圆锥破碎机选型
 * ------------------------------------------------------------------------ */

const toolSelection = {
  name: 'mackorn_cone_selection',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) MACKORN 液压圆锥破碎机选型主工具：按目标处理量 t/h、给料最大粒度、目标产品粒度与工序（中碎/细碎/超细碎）从 NH 标准型与 NS 高速型单缸液压圆锥破中选出机型 + 腔型 + 紧边排矿口 CSS + 台数，给出候选排序、P80 估计、参考价区间与达标判定。数据源为 MACKORN《NH_NS系列技术参数大全》。当用户问"选什么型号/几台/多大功率/什么腔型/CSS 定多少"时调用。' + ' 【适用边界】本工具只针对【单台圆锥破】。整条生产线请用 plant_design；给料 >350mm 会被拒绝（圆锥破是中细碎设备）。',
  parameters: obj(
    {
      target_tph: S.number('目标处理量 t/h（必填，正数）。'),
      max_feed_mm: S.number('进入本段破碎机的最大给料粒度 mm。'),
      target_product_mm: S.number('目标最终产品粒度 mm（用于推断工序段与细度可行性）。'),
      stage: S.stringEnum('工序段；auto 由给料/产品粒度自动推断。', ['auto', '中碎', '细碎', '超细碎'], { default: 'auto' }),
      ore: S.string('矿石名称与硬度备注（如"花岗岩 f=12-14"）。'),
      units: S.integer('指定并联台数；不填则自动按目标产量推算。'),
      closed_circuit: S.boolean('是否与筛分构成闭路（默认 true）。闭路会按循环负荷放大系数校核。', { default: true }),
    },
    ['target_tph'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => {
      const head = v.top_pick
        ? `## 液压圆锥破选型结论\n\n**首选：${v.top_pick.model} · ${v.top_pick.cavity} 腔 · CSS ${v.top_pick.css_mm} mm · ${v.top_pick.power_kw} kW · ${v.recommended_units} 台**\n\n- 系列：${v.top_pick.series}\n- 单台需求 ${v.per_unit_tph} t/h；单台额定能力 ${v.top_pick.capacity_tph.join('-')} t/h（计入循环负荷后 ${v.top_pick.capacity_after_circulating_load_tph} t/h）\n- P80 估计 ${v.top_pick.p80_estimate_mm.join('-')} mm；余量比 ${v.top_pick.headroom_ratio}；达标：${v.top_pick.capacity_ok ? '是' : '**否**'}\n- 参考价 ${v.top_pick.price_ref_wan_cny_per_unit ? v.top_pick.price_ref_wan_cny_per_unit.join('-') + ' 万元/台' : '待商务确认'}`
        : '## 液压圆锥破选型结论\n\n**没有任何机型/腔型组合满足给定约束。**';
      return text(
        [
          head,
          '',
          '### 候选排序（前 8）',
          mdTable(
            ['评分', '机型', '系列', '腔型', 'CSS', 'P80 估计', '产能 t/h', '计入循环负荷', '功率 kW', '参考价', '达标'],
            v.candidates.map((c) => [
              c.match_score, c.model, c.series, c.cavity, c.css_mm,
              c.p80_estimate_mm.join('-'), c.capacity_tph.join('-'), c.capacity_after_circulating_load_tph,
              c.power_kw, c.price_ref_wan_cny_per_unit ? c.price_ref_wan_cny_per_unit.join('-') : '-',
              c.capacity_ok ? '是' : '否',
            ]),
          ),
          '',
          `> 腔型建议池：${v.recommended_cavity_pool.join(' / ')}`,
          knowledgeBlock(v.knowledge_check),
          assumptionBlock(v.assumptions, v.warnings),
          jsonBlock(v),
        ].join('\n'),
      );
    },
  },
  async execute(args) {
    return selectConeCrusher({
      targetTph: args.target_tph,
      maxFeedMm: args.max_feed_mm,
      targetProductMm: args.target_product_mm,
      stage: args.stage,
      ore: args.ore,
      units: args.units,
      closedCircuit: args.closed_circuit,
    });
  },
};

/* --------------------------------------------------------------------------
 * 工具 3：产能校核
 * ------------------------------------------------------------------------ */

/**
 * 产能达标判定 —— 回答用户真正想问的那句话："我这台机能不能做到 X t/h？"
 *
 * 由来（UAT-3 发现）：用户问 NH400 C腔 CSS16 能否做 350 t/h，
 *   工具返回了产能区间却没给判定，连 target_tph 参数都没有。
 *
 * 判据（基于已有表值，不引入新假设）：
 *   rated ≥ target 且余量 ≥15%  → 达标（舒适）
 *   rated ≥ target 但余量 <15%  → 临界达标（须核实现场条件）
 *   rated <  target              → 不达标，给缺口与可选路径
 */
function buildCapacityVerdict(cap, targetTph) {
  const t = Number(targetTph);
  if (!Number.isFinite(t) || t <= 0) {
    return { asked: false, note: '未提供目标产量 —— 如需【能否达到】的判定，请填 target_tph。' };
  }
  const rated = Number(cap.capacity_rated_tph);
  const min = Number(cap.capacity_min_tph);
  if (!Number.isFinite(rated)) return { asked: true, target_tph: t, verdict: 'unknown', note: '该腔型×CSS 组合没有可用产能数据，无法判定' };
  const marginPct = +(((rated - t) / t) * 100).toFixed(1);
  let verdict, advice;
  if (rated >= t) {
    verdict = marginPct >= 15 ? 'achievable_comfortable' : 'achievable_tight';
    advice = verdict === 'achievable_comfortable'
      ? ('额定能力 ' + rated + ' t/h ≥ 目标 ' + t + ' t/h，余量 ' + marginPct + '%。可执行。但实际产量仍受给料级配、含水、闭路循环负荷影响 —— 建议按额定值的 80–85% 作为生产计划值。')
      : ('额定能力 ' + rated + ' t/h 刚够目标 ' + t + ' t/h（余量仅 ' + marginPct + '%）。风险：给料级配波动、含水偏高或衬板磨损后产量会掉到目标以下。建议核实现场给料条件，并预留降产预案。');
  } else {
    verdict = 'not_achievable';
    const gap = +(t - rated).toFixed(0);
    advice = '额定能力 ' + rated + ' t/h < 目标 ' + t + ' t/h，缺口约 ' + gap + ' t/h。可选路径：① 开大 CSS（若产品粒度允许）；② 提高转速（须确认不超过堵料边界 400 rpm）；③ 并联第二台；④ 换更大机型。';
  }
  return {
    asked: true, target_tph: t, verdict, achievable: rated >= t,
    rated_tph: rated, conservative_min_tph: min, margin_pct: marginPct,
    conservative_ok: Number.isFinite(min) ? min >= t : null,
    advice,
    basis: 'S1 腔型×CSS 详表（额定值）；达标判据为工程常用口径，非厂商标定',
    caveat: '本判定基于【额定表值】。实际产量受给料级配、含水、闭式循环负荷与衬板磨损影响，标定前不应视作承诺值。',
  };
}
const toolCapacity = {
  name: 'mackorn_capacity_check',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) 给定 MACKORN 机型 + 腔型 + 紧边排矿口 CSS，从《NH_NS系列技术参数大全》腔型×CSS 详表查出生产能力区间 t/h（无详表的机型按系列区间外推并标注为近似），同时返回排矿口范围合规性、最大给料限制、外形尺寸与重量。用于复核既有设备能力或验证选型结论。' + ' 【适用边界】本工具【复核已知机型的产能】，不做选型。选新型号请用 cone_selection。产能为表值，实际受给料与工况影响。',
  parameters: obj(
    {
      model: S.stringEnum('机型型号。', MODEL_ENUM),
      cavity: S.stringEnum('腔型代码。', CAVITY_ENUM),
      target_tph: S.number('目标产量 t/h（可选）。填了本工具会直接给出【能否达到】的判定 —— 复核既有设备时必填。'),
      css: S.number('紧边排矿口 CSS，mm。'),
    },
    ['model', 'css'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => text(
      [
        /* 达标判定放最前 —— 用户问「能不能做 X t/h」时，这是他要看的第一行 */
        v.verdict && v.verdict.asked
          ? (v.verdict.achievable
            ? `## 结论：✅ 能达到 ${v.verdict.target_tph} t/h（额定 ${v.verdict.rated_tph} t/h，余量 ${v.verdict.margin_pct}%）`
            : `## 结论：❌ 达不到 ${v.verdict.target_tph} t/h（额定 ${v.verdict.rated_tph} t/h，缺 ${(v.verdict.target_tph - v.verdict.rated_tph).toFixed(0)} t/h）`)
          : null,
        v.verdict && v.verdict.asked ? '' : null,
        v.verdict && v.verdict.asked ? v.verdict.advice : null,
        v.verdict && v.verdict.asked ? '' : null,
        v.verdict && v.verdict.asked ? '---' : null,
        `## 产能校核 · ${v.model} ${v.cavity ?? ''}腔 @ CSS ${v.css} mm`,
        '',
        `- 生产能力：**${v.capacity_min_tph} - ${v.capacity_rated_tph} t/h**`,
        `- 依据：${v.basis}`,
        `- 机型排矿口范围：${v.css_range_mm.join('-')} mm；最大给料 ${v.max_feed_mm} mm；功率 ${v.power_kw} kW；重量 ${(v.weight_kg / 1000).toFixed(1)} t`,
        v.cavity_note ? `- 腔型特性：${v.cavity_note}` : '',
        v.dimensions_mm ? `- 外形：机架外径 ${v.dimensions_mm.A} mm，总长 ${v.dimensions_mm.K_totalLength} mm，全高 ${v.dimensions_mm.B ?? '来源标注需核实'}` : '',
        assumptionBlock(v.assumptions, v.warnings),
        jsonBlock(v),
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  },
  async execute(args) {
    const r = checkCapacity({ model: args.model, cavity: args.cavity, css: args.css });
    /* 用户验收测试发现（UAT-3）：用户问「我这台机能不能做 350 t/h」时，
     * 工具只回产能区间而不给判定 —— 而那正是用户问这个问题的唯一原因。
     * 这里直接给出 verdict，不让用户自己去比数字。 */
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      r.verdict = buildCapacityVerdict(r, args && args.target_tph);
    }
    return r;
  },
};

/* --------------------------------------------------------------------------
 * 工具 4：破碎筛分生产线配置
 * ------------------------------------------------------------------------ */

const toolPlant = {
  name: 'mackorn_plant_design',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) MACKORN 破碎筛分生产线总体配置：按原矿最大粒度与目标产品粒度计算总破碎比、推荐破碎段数、各段给料/产品/破碎比分配，并对中碎段与细碎段各做一次液压圆锥破选型，同时给出筛分面积、输送带带宽、辅机（给料机/除铁器/除尘/洗砂/AORS）配置建议。用于从"客户要一条 X t/h 的线"走到"每段放什么设备"。' + ' 【适用边界】本工具给【整线配置建议】。单台机型细选请用 cone_selection。原矿给料可以很大，但进入圆锥破那一段必须 ≤350mm。',
  parameters: obj(
    {
      target_tph: S.number('目标成品处理量 t/h（必填）。'),
      max_feed_mm: S.number('原矿最大给料粒度 mm（默认 500）。', { default: 500 }),
      target_product_mm: S.number('最终产品粒度 mm（默认 20）。', { default: 20 }),
      ore: S.string('矿石名称/硬度/含泥量备注。'),
      closed_circuit: S.boolean('细碎段是否闭路（默认 true）。', { default: true }),
      washing: S.boolean('是否需要洗砂/污水处理系统（默认 false）。', { default: false }),
    },
    ['target_tph'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => text(
      [
        `## 破碎筛分生产线配置 · ${v.request.targetTph} t/h`,
        '',
        `- 给料 ${v.request.maxFeedMm} mm → 产品 ${v.request.productMm} mm，总破碎比 **${v.total_reduction_ratio}**`,
        `- 推荐段数：**${v.recommended_stages} 段**（${v.stages_guide_note ?? ''}）`,
        '',
        '### 分段计划',
        mdTable(['段', '工序', '给料 mm', '产品 mm', '破碎比', '职责'], v.stage_plan.map((s) => [s.index, s.stage, s.feed_mm, s.product_mm, s.reduction_ratio, s.duty])),
        '',
        '### 液压圆锥破选型',
        v.cone_crusher_coarse_side ? `- 中碎段首选：**${v.cone_crusher_coarse_side.model} ${v.cone_crusher_coarse_side.cavity} 腔 @ CSS ${v.cone_crusher_coarse_side.css_mm} mm，${v.cone_crusher_coarse_side.capacity_tph.join('-')} t/h，${v.cone_crusher_coarse_side.power_kw} kW，${v.cone_crusher_coarse_side.units} 台**（单台需求 ${v.cone_crusher_coarse_side.per_unit_tph} t/h；依据：${v.cone_crusher_coarse_side.basis}）` : '- 中碎段：无满足项',
        v.cone_crusher_fine_side ? `- 细碎段首选：**${v.cone_crusher_fine_side.model} ${v.cone_crusher_fine_side.cavity} 腔 @ CSS ${v.cone_crusher_fine_side.css_mm} mm，${v.cone_crusher_fine_side.capacity_tph.join('-')} t/h，${v.cone_crusher_fine_side.power_kw} kW，${v.cone_crusher_fine_side.units} 台**（单台需求 ${v.cone_crusher_fine_side.per_unit_tph} t/h；依据：${v.cone_crusher_fine_side.basis}）` : '',
        v.cone_crusher_coarse_side || v.cone_crusher_fine_side ? '' : '',
        '> 硬数据/近似值判定：`依据 = S1 腔型×CSS 详表` 为厂商硬数据；`系列区间近似` 须经 MACKORN 技术复核。',
        '',
        '### 筛分与输送',
        `- 筛分处理量 ${v.screening.throughput_tph} t/h；建议筛分面积 **${v.screening.optimistic_m2} - ${v.screening.conservative_m2} m²**（效率 ${v.screening.efficiency_range.join('-')}）`,
        `- 输送设计能力 ${v.conveying.design_throughput_tph} t/h；建议带宽 **${v.conveying.recommended_width_mm ?? '待核算'} mm**，最大倾角 ${(v.conveying.max_incline_deg_single ?? v.conveying.max_incline_deg.join('-'))}°`,
        '',
        '### 辅机',
        mdTable(['项', '配置'], Object.entries(v.auxiliary).map(([k, val]) => [k, Array.isArray(val) ? val.join('-') : val])),
        knowledgeBlock(v.knowledge_check),
        assumptionBlock(v.assumptions, v.warnings),
        jsonBlock(v),
      ]
        .filter((line) => line !== '')
        .join('\n'),
    ),
  },
  async execute(args) {
    return sizePlant({
      targetTph: args.target_tph,
      maxFeedMm: args.max_feed_mm,
      targetProductMm: args.target_product_mm,
      ore: args.ore,
      closedCircuit: args.closed_circuit,
      washing: args.washing,
    });
  },
};

/* --------------------------------------------------------------------------
 * 工具 5：投资与运营成本
 * ------------------------------------------------------------------------ */

const toolCost = {
  name: 'mackorn_cost_estimate',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) MACKORN 液压圆锥破投资与运营成本估算：按机型与台数算装机功率、年电耗、年电费、吨电耗与吨电费；按项目实际电价/年运行小时/负荷率/衬板寿命与衬板价算衬板吨成本；给出 S4 历史报价区间、液压站分档报价、备件参考价、报价影响因素与融资租赁月供测算。明确列出未含范围（土建/钢构/电气/安装/运输/税费）。' + ' 【适用边界】本工具只做【成本量级估算】，不构成报价。未含土建/钢构/电气/安装/运输/税费，须逐项确认。',
  parameters: obj(
    {
      model: S.stringEnum('机型型号。', MODEL_ENUM),
      units: S.integer('台数（默认 1）。', { default: 1 }),
      tph: S.number('该机型对应处理量 t/h，用于吨成本换算。'),
      hours_per_year: S.integer('年运行小时数。'),
      electricity_price: S.number('电价 元/kWh。'),
      load_factor: S.number('负荷率 0-1。'),
      liner_life_hours: S.number('衬板寿命 h（项目实测值，用于算衬板吨成本）。'),
      liner_cost_per_set: S.number('单套衬板价格 元/套。'),
      unit_price_wan_cny: S.number('实际商务单价 万元/台（有则优先于参考区间）。'),
      annual_rate: S.number('融资租赁年利率（小数，如 0.06）；不填则不做月供测算。'),
      term_years: S.integer('融资租赁年限。'),
    },
    ['model'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => text(
      [
        `## 成本估算 · ${v.unit.model} × ${v.unit.units} 台（装机 ${v.unit.installed_kw} kW）`,
        '',
        '### CAPEX',
        v.capex.quoted_total_cny ? `- 商务单价合计：**${v.capex.quoted_total_cny.toLocaleString()} 元**` : `- 商务单价：未提供，使用参考区间`,
        v.capex.reference_band_cny ? `- 参考区间：**${v.capex.reference_band_cny[0].toLocaleString()} - ${v.capex.reference_band_cny[1].toLocaleString()} 元**（${v.capex.reference_band_note}）` : '',
        `- 不含：${v.capex.excluded_scope.join('、')}`,
        '',
        '### OPEX',
        `- 年电耗 ${v.opex.energy_kwh_per_year.toLocaleString()} kWh；年电费 **${v.opex.energy_cny_per_year.toLocaleString()} 元**`,
        `- 吨电耗 ${v.opex.energy_kwh_per_ton ?? '-'} kWh/t；吨电费 ${v.opex.energy_cny_per_ton ?? '-'} 元/t`,
        `- 衬板吨成本 ${v.opex.liner_cny_per_ton ?? '未计算（缺衬板寿命/价格）'} 元/t`,
        `- **综合吨成本（电+衬板）${v.opex.cost_per_ton_cny ?? '-'} 元/t**（不含 ${v.opex.excludes.join('、')}）`,
        v.financing ? `\n### 融资租赁\n- 首付 ${v.financing.down_payment_cny.toLocaleString()} 元；贷款 ${v.financing.loan_cny.toLocaleString()} 元；${v.financing.term_years} 年\n- 月供 **${v.financing.monthly_payment_cny.toLocaleString()} 元**` : '',
        '',
        '### 液压站分档报价',
        mdTable(['配置', '参考价（万元）'], v.capex.hydraulic_station_options.map((o) => [o.tier, o.priceWanCny.join('-')])),
        '',
        '### 备件参考价',
        mdTable(['备件', '参考价', '备注'], v.spare_parts_reference.map((s) => [s.name, s.priceRange, s.note])),
        assumptionBlock(v.assumptions, v.warnings),
        jsonBlock(v),
      ]
        .filter((line) => line !== '')
        .join('\n'),
    ),
  },
  async execute(args) {
    return estimateCost({
      model: args.model,
      units: args.units,
      tph: args.tph,
      hoursPerYear: args.hours_per_year,
      electricityPriceCnyPerKwh: args.electricity_price,
      loadFactor: args.load_factor,
      linerLifeHours: args.liner_life_hours,
      linerCostCnyPerSet: args.liner_cost_per_set,
      unitPriceWanCny: args.unit_price_wan_cny,
      annualRate: args.annual_rate,
      termYears: args.term_years,
    });
  },
};

/* --------------------------------------------------------------------------
 * 工具 6：衬板磨损与多梯度设计
 * ------------------------------------------------------------------------ */

const toolWear = {
  name: 'mackorn_wear_design',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) 沿破碎腔高度离散截面评估衬板磨损均匀度（均匀度 = 1 − σ/μ，均等化条件 dW/dt ≈ const），给出多梯度分区硬度设计 H_i = H_base × k^i，并给出磨损均匀度提升量。可输入现场实测磨损速率（各截面测厚差值）；不输入则用合成示例曲线演示方法（输出会明确标注为合成数据）。' + ' 【适用边界】本工具做【衬板磨损均匀度评估与分区硬度设计】。未提供实测磨损速率时用合成曲线演示，结果会明确标注。',
  parameters: obj(
    {
      sections: S.integer('沿腔高离散截面数（3-12，默认 5）。', { default: 5 }),
      wear_rates: S.arrayOfNumbers('各截面实测磨损速率（mm/1000h 或任意一致单位），长度应等于截面数。'),
      base_hardness: S.number('基础分区硬度 HB（默认 58）。', { default: 58 }),
      gradient_factor: S.number('硬度梯度因子（默认 1.12）。', { default: 1.12 }),
    },
    [],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => text(
      [
        `## 衬板磨损均匀度与多梯度设计（${v.sections} 个截面）`,
        '',
        `- 设计前均匀度 ${v.uniformity_before.uniformity}（CV ${v.uniformity_before.cv}，最大/最小比 ${v.uniformity_before.max_min_ratio ?? '-'}）`,
        `- 多梯度设计后均匀度 **${v.uniformity_after_gradient_design.uniformity}**（提升 ${v.improvement.uniformity_gain}）`,
        `- 分区硬度：${v.liner_hardness_schedule.join(' / ')} HB（基础 ${v.hardness_params.base}，梯度 ${v.hardness_params.gradient_factor}）`,
        '',
        '### 建议',
        ...v.recommendations.map((r) => `- ${r}`),
        assumptionBlock(v.assumptions, v.warnings),
        jsonBlock(v),
      ].join('\n'),
    ),
  },
  async execute(args) {
    return analyzeWear({
      sections: args.sections,
      wearRates: args.wear_rates,
      baseHardness: args.base_hardness,
      gradientFactor: args.gradient_factor,
    });
  },
};

/* --------------------------------------------------------------------------
 * 工具 7：孔隙率与粒级配比
 * ------------------------------------------------------------------------ */

const toolGrading = {
  name: 'mackorn_grading_porosity',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) 按粗/中/细三组分配比计算料层孔隙率 φ（经验模型 φ = 0.42 − 0.30·min(中料占比,0.35) + 0.15·max(0, 细料占比 − 0.30)），与最优配比窗口（粗 50% / 中 30% / 细 20%，最优孔隙率 0.28）对比，判断料层密度是否足以维持模数恒定。' + ' 【适用边界】本工具算【三级配比下的料层孔隙率】；不诊断给料模数（见 mcfm_analysis）。',
  parameters: obj(
    {
      coarse_frac: S.number('粗骨料占比（可为任意一致单位，内部归一化）。'),
      mid_frac: S.number('中间粒级占比（关键充填相）。'),
      fine_frac: S.number('细颗粒占比。'),
    },
    ['coarse_frac', 'mid_frac', 'fine_frac'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => text(
      [
        `## 料层孔隙率与粒级配比`,
        '',
        `- 归一化配比：粗 ${v.input_normalized.coarse} / 中 ${v.input_normalized.mid} / 细 ${v.input_normalized.fine}`,
        `- 孔隙率 **φ = ${v.porosity}**（最优参考 ${v.optimal_porosity_reference}，差距 ${v.gap_to_optimal}）`,
        `- 判定：${v.verdict}`,
        assumptionBlock(v.assumptions, v.warnings),
        jsonBlock(v),
      ].join('\n'),
    ),
  },
  async execute(args) {
    return analyzeGrading({ coarseFrac: args.coarse_frac, midFrac: args.mid_frac, fineFrac: args.fine_frac });
  },
};

/* --------------------------------------------------------------------------
 * 工具 8：市场纵深
 * ------------------------------------------------------------------------ */

const scoreSchema = obj(
  {
    score: S.number('1-5 分。'),
    weight: S.number('权重（默认 1）。'),
    evidence: { type: 'array', description: '支撑该评分的证据（报告名/页码/报价单编号等）。', items: { type: 'string' } },
  },
  ['score'],
);

/**
 * 市场机会判定 —— 回答用户真正想问的："这个市场该不该去打？下一步干什么？"
 *
 * 由来（UAT-10 发现）：用户问「哈萨克斯坦有没有机会」，工具给了五维框架与竞品矩阵，
 *   却没给判断。用户要的不是框架，是"去还是不去"。
 *
 * 判定口径（三档，基于用户提供的五维分；未提供则给出打分行动）：
 *   加权总分 ≥4.0             → 优先推进（建议派人/投市场费用）
 *   3.0 ≤ 加权总分 < 4.0      → 有条件推进（先补齐短板维度再投入）
 *   加权总分 < 3.0            → 暂缓（先观察或找代理试水）
 * 另有两条一票否决：无合规渠道 / 已有强竞品独家绑定
 */
function buildMarketVerdict(scoring, focus, competitors) {
  const dims = [
    ['industry', '行业'], ['technology', '技术'], ['timeliness', '时效'],
    ['economics', '经济'], ['operability', '可操作'],
  ];
  if (!scoring || typeof scoring !== 'object') {
    return {
      decided: false,
      verdict: 'need_scoring',
      focus: focus || null,
      what_to_do_next: '本工具需要五维打分才能给出推进判定。五个维度各给 1–5 分（1=差，5=好）后重新调用，即可得到【优先推进 / 有条件推进 / 暂缓】的结论与理由。',
      dimensions: dims.map(([k, cn]) => ({
        key: k, name: cn,
        how_to_score: ({
          industry: '目标国该品类进口规模与增速（可用公开海关数据）',
          technology: '客户对自动化/粒形/能耗的技术要求，与我方产品匹配度',
          timeliness: '当地在建/规划项目数量与节奏，是否处于采购窗口',
          economics: '客户预算水平、付款条件、汇率与融资可得性',
          operability: '物流可达性、安装服务半径、备件供应能力、语言与合规门槛',
        })[k],
      })),
      caveat: '本判定基于框架与用户提供的分数，不是市场调研结论。下结论前应有可核查的证据（见 evidence_discipline）。',
    };
  }
  let num = 0, den = 0;
  const detail = [];
  for (const [k, cn] of dims) {
    const s = scoring[k];
    const score = s && typeof s === 'object' ? Number(s.score) : Number(s);
    const weight = s && typeof s === 'object' && Number.isFinite(Number(s.weight)) ? Number(s.weight) : 1;
    if (!Number.isFinite(score)) continue;
    num += score * weight; den += weight;
    detail.push({ key: k, name: cn, score, weight, weighted: +(score * weight).toFixed(2) });
  }
  if (den === 0) return { decided: false, verdict: 'need_scoring', focus: focus || null, what_to_do_next: '未收到有效的五维分数（需 1–5 的数值）。' };
  const weighted = +(num / den).toFixed(2);
  const sorted = detail.slice().sort((a, b) => a.score - b.score);
  const weakest = sorted[0], strongest = sorted[sorted.length - 1];
  const gaps = detail.filter((d) => d.score <= 2);
  let verdict, action;
  if (weighted >= 4.0) {
    verdict = 'priority_go';
    action = '加权 ' + weighted + '/5 —— 建议【优先推进】：派人实地走访 + 投入市场费用。最强维度是「' + strongest.name + '」（' + strongest.score + '/5）。' +
      (gaps.length ? '但「' + gaps.map((g) => g.name).join('、') + '」仍为短板，投入前应补齐。' : '五维无明显短板。');
  } else if (weighted >= 3.0) {
    verdict = 'conditional_go';
    action = '加权 ' + weighted + '/5 —— 【有条件推进】：先补齐短板再投入。最弱维度是「' + weakest.name + '」（' + weakest.score + '/5），建议先针对它做一轮验证（如找一个当地代理试水、或先做一单小项目）。';
  } else {
    verdict = 'hold';
    action = '加权 ' + weighted + '/5 —— 建议【暂缓】：当前条件不成熟。最弱维度「' + weakest.name + '」（' + weakest.score + '/5）是主要障碍。可先低成本观察（参加当地展会、维护代理关系），待条件改善再评估。';
  }
  return {
    decided: true, verdict, focus: focus || null,
    weighted_score: weighted, scale: '1–5（1=差，5=好）',
    per_dimension: detail,
    weakest_dimension: weakest, strongest_dimension: strongest,
    critical_gaps: gaps,
    recommended_action: action,
    next_3_steps: [
      '补齐证据：按 evidence_discipline 收集可核查数据（海关/项目/客户）',
      '验证短板：「' + weakest.name + '」是当前最大不确定性，先解决它',
      verdict === 'hold' ? '低成本观察：展会/代理关系维护，不投入市场费用' : '实地走访：确认项目节奏与采购窗口',
    ],
    caveat: '本判定基于用户提供的五维分数，不是市场调研结论。分数质量决定结论质量；下结论前应有可核查证据。',
  };
}
const toolMarket = {
  name: 'mackorn_market_intel',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) MACKORN 液压圆锥破市场纵深分析：返回"行业/技术/时效/经济/可操作"五维评估框架与打分口径、破碎效率核心杠杆链、竞品对标矩阵（美卓 HP / 山特维克 CS / 特雷克斯 / 克虏伯）、美矿优势与差距、客户痛点应对话术、报价影响因素与价格参考区间。若用户提供各维度 1-5 分与权重，则直接输出五维加权得分与推进结论。' + ' 【适用边界】本工具做【市场纵深定性分析】；定量统计（集中度/回归/威布尔）请用 market_stats。不做价格承诺。',
  parameters: obj(
    {
      focus: S.string('分析焦点（区域市场/客户类型/竞品品牌等）。'),
      scores: obj(
        {
          industry: scoreSchema,
          technology: scoreSchema,
          timeliness: scoreSchema,
          economics: scoreSchema,
          operability: scoreSchema,
        },
        [],
      ),
    },
    [],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => {
      const lines = ['## 市场纵深分析' + (v.focus ? ` · ${v.focus}` : ''), ''];
      /* 机会判定放最前 —— 用户问「有没有机会」时，这是他要看的第一行（UAT-10 发现） */
      if (v.verdict) {
        const vd = v.verdict;
        if (vd.decided) {
          const tag = vd.verdict === 'priority_go' ? '✅ 优先推进' : vd.verdict === 'conditional_go' ? '🟡 有条件推进' : '⛔ 暂缓';
          lines.push('## 结论：' + tag + '（加权 ' + vd.weighted_score + '/5）', '', vd.recommended_action, '');
          if (vd.next_3_steps && vd.next_3_steps.length) {
            lines.push('**下一步 3 件事**', '', vd.next_3_steps.map((s, i) => (i + 1) + '. ' + s).join('\n'), '');
          }
        } else {
          lines.push('## 结论：还缺打分', '', vd.what_to_do_next, '');
          if (vd.dimensions) {
            lines.push(mdTable(['维度', '怎么打分'], vd.dimensions.map((d) => [d.name + '（' + d.key + '）', d.how_to_score])), '');
          }
        }
        if (vd.caveat) lines.push('> ' + vd.caveat, '');
        lines.push('---', '');
      }
      if (v.scoring) {
        lines.push(
          `### 五维加权得分：**${v.scoring.weighted_score} / 5**`,
          `结论：**${v.scoring.verdict}**`,
          '',
          mdTable(['维度', '得分', '权重', '证据'], v.scoring.dimensions.map((d) => [d.name, d.score, d.weight, d.evidence.join('; ') || '-'])),
          '',
        );
      } else {
        lines.push('> 未提供各维度评分，以下为评估框架（请按 evidence 取证后再打分）。', '');
      }
      lines.push(
        '### 五维评估框架',
        mdTable(['维度', '要回答的问题', '打分口径'], v.framework.map((d) => [d.name, d.question, d.scoreRule])),
        '',
        '### 破碎效率核心杠杆链',
        mdTable(['步', '杠杆', '度量', '目标'], v.leverage_chain.map((s) => [s.step, s.lever, s.metric, s.target])),
        '',
        '### 竞品对标矩阵',
        mdTable(['维度', ...v.competitors.matrix.columns.map((c) => c.brand)], v.competitors.matrix.dimensions.map((dim, i) => [dim, ...v.competitors.matrix.columns.map((c) => c.values[i])])),
        '',
        '### 美矿优势 / 差距',
        mdTable(['优势', '说明'], v.mackorn.advantages.map((a) => [a.item, a.detail])),
        '',
        mdTable(['差距', '说明'], v.mackorn.gaps.map((a) => [a.item, a.detail])),
        '',
        '### 客户痛点应对',
        mdTable(['痛点', '应对'], v.pain_point_playbook.map((p) => [p.pain, p.answer])),
        assumptionBlock(v.assumptions, v.warnings),
        jsonBlock(v),
      );
      return text(lines.join('\n'));
    },
  },
  async execute(args) {
    const r = marketIntel({ focus: args.focus, scores: args.scores });
    /* 用户问「这个市场有没有机会」时，必须直接给判断，不能只给五维框架
     * （UAT-10 发现：原实现连"建议"字段都没有，用户拿不到"去还是不去"的答案）。
     * 未提供分数时不空手 —— 返回【怎么打分】的可执行下一步。 */
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      r.verdict = buildMarketVerdict(args && args.scores, args && args.focus, r.competitors);
    }
    return r;
  },
};

/* --------------------------------------------------------------------------
 * 工具 9：选型报告（按图索骥的一键收口）
 * ------------------------------------------------------------------------ */

const toolReport = {
  name: 'mackorn_selection_report',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) MACKORN 液压圆锥破生产线选型报告一键生成：把生产线配置、圆锥破选型、MCFM 诊断、成本估算、衬板设计串成一份 Markdown 报告，并自动汇总全部"假设与来源"和"风险与待确认项"。当用户要"出一份方案/选型书/报告"时调用，可先单独跑前几个工具确认参数再收口。' + ' 【适用边界】本工具产出【内部技术选型报告】，面向工程判断；面向客户的方案书请用 proposal。',
  parameters: obj(
    {
      title: S.string('报告标题。'),
      project: S.string('项目名称。'),
      target_tph: S.number('目标处理量 t/h（必填，用于生产线配置与选型）。'),
      max_feed_mm: S.number('原矿/本段最大给料粒度 mm。'),
      target_product_mm: S.number('最终产品粒度 mm。'),
      stage: S.stringEnum('圆锥破工序段。', ['auto', '中碎', '细碎', '超细碎'], { default: 'auto' }),
      ore: S.string('矿石名称/硬度备注。'),
      closed_circuit: S.boolean('是否闭路（默认 true）。', { default: true }),
      cumulative_retained: S.arrayOfNumbers('长度 8 的累积筛余百分比数组，用于 MCFM 诊断（可选）。'),
      include_cost: S.boolean('是否纳入成本估算（默认 true）。', { default: true }),
      cost_model: S.stringEnum('成本估算所用机型。', MODEL_ENUM),
      cost_units: S.integer('成本估算台数。'),
      cost_tph: S.number('成本估算对应处理量 t/h。'),
      electricity_price: S.number('电价 元/kWh。'),
      hours_per_year: S.integer('年运行小时数。'),
      include_wear: S.boolean('是否纳入衬板磨损设计（默认 false）。', { default: false }),
      wear_rates: S.arrayOfNumbers('各截面实测磨损速率（可选）。'),
    },
    ['target_tph'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => text(v.markdown),
  },
  async execute(args) {
    const costInput = args.include_cost === false ? null : (args.cost_model
      ? {
        model: args.cost_model,
        units: args.cost_units,
        tph: args.cost_tph ?? args.target_tph,
        electricityPriceCnyPerKwh: args.electricity_price,
        hoursPerYear: args.hours_per_year,
      }
      : null);
    const res = buildSelectionReport({
      title: args.title,
      project: args.project,
      targetTph: args.target_tph,
      maxFeedMm: args.max_feed_mm,
      targetProductMm: args.target_product_mm,
      stage: args.stage,
      ore: args.ore,
      closedCircuit: args.closed_circuit,
      cumulativeRetained: args.cumulative_retained,
      costInput,
      wearInput: args.include_wear ? { wearRates: args.wear_rates } : null,
    });
    // 只把报告正文与清单写回会话，避免把大对象整体冗余进会话日志
    return { markdown: res.markdown, assumptions: res.assumptions, warnings: res.warnings };
  },
};

/* --------------------------------------------------------------------------
 * 附：参考信息工具（机型总览，便于模型自查枚举值）
 * ------------------------------------------------------------------------ */

const toolCatalog = {
  name: 'mackorn_equipment_catalog',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) 列出 MACKORN 液压圆锥破全部可选机型与腔型枚举值：NH 标准型 9 个型号、NS 高速型 4 个型号的基本参数（最大给料/排矿口范围/功率/重量/产能），以及 9 种腔型代码的含义与适用场景。当选型工具报"未知机型"或需要向用户展示可选范围时调用。' + ' 【适用边界】本工具只列【机型与腔型枚举值】；查材料性质与经验教训请用 knowledge。不含报价。',
  parameters: obj({}, []),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => text(
      [
        '## MACKORN 液压圆锥破机型总览',
        '',
        '### NH 系列（标准型单缸液压圆锥破）',
        mdTable(['型号', '最大给料 mm', '排矿口 mm', '功率 kW', '重量 t', '产能 t/h'], v.nh.map((m) => [m.model, m.maxFeedMm, `${m.cssMin}-${m.cssMax}`, m.powerKw, (m.weightKg / 1000).toFixed(1), m.capacityTph.join('-')])),
        '',
        '### NS 系列（高速型单缸液压圆锥破）',
        mdTable(['型号', '最大给料 mm', '排矿口 mm', '功率 kW', '重量 t', '产能 t/h'], v.ns.map((m) => [m.model, m.maxFeedMm, `${m.cssMin}-${m.cssMax}`, m.powerKw, (m.weightKg / 1000).toFixed(1), m.capacityTph.join('-')])),
        '',
        '### 腔型代码',
        mdTable(['代码', '名称', '适用场景', '最大给料 mm'], v.cavities.map((c) => [c.code, c.name, c.use, c.feedMaxMm])),
        '',
        `> 数据来源：${v.sources.S1}`,
      ].join('\n'),
    ),
  },
  async execute() {
    return {
      nh: NH_SERIES,
      ns: NS_SERIES,
      cavities: CAVITY_TYPES,
      sources: SOURCES,
      engineering_rules: ENGINEERING_RULES,
      price_disclaimer: PRICE_DISCLAIMER,
    };
  },
};

/* --------------------------------------------------------------------------
 * 工具 11：客户需求表录入与一键选型（销售入口）
 * ------------------------------------------------------------------------ */

const toolIntake = {
  name: 'mackorn_requirement_intake',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) 【销售主入口】把 MACKORN《砂石骨料/金属矿山生产线客户需求信息输入表》的内容 + 客户要求的产量，一次性变成「还缺什么要问客户」+「该配什么设备」的完整解答。两种用法可混用：①把表里的文字（或 Word 转出的文本）整段贴进 form_text，自动抽取数值字段；②逐项填结构化字段。工具会：抽取并逐字段标注来源 → 检查必填/建议字段缺失并生成追问话术 → 归一化工况 → 调用整线配置与液压圆锥破选型 → 核算年产量与矿山服务年限 → 给出除土/湿法/除尘/制砂/整形等派生建议。当客户发来需求表、或销售问"这张表能不能配线"，以及任何时候缺参数需要知道"还要问客户什么"时调用。' + ' 【适用边界】本工具只做【需求抽取与缺口分析】，不代替客户确认；抽取到的数值须回读给客户核对。',
  parameters: obj(
    {
      capacity_tph: S.number('客户要求的成品产量 t/h（必填）。若表里已填，请从表中抽取后填入此处。'),
      form_text: S.string('客户需求表的文字内容（Word 转文本或直接粘贴）。工具会自动抽取最大给料粒度、产量、含土量、含水率、抗压强度、成品粒度、工作制等数值字段。'),
      line_type: S.stringEnum('产线类型。', ['砂石骨料', '金属矿山']),
      client_name: S.string('客户名称。'),
      project_location: S.string('项目地点。'),
      salesperson: S.string('业务员。'),
      date: S.string('日期。'),
      ore_source: S.stringEnum('矿石来源。', ['自有矿山', '外购原材料']),
      ore_type: S.string('矿石种类（花岗岩/玄武岩/石灰石/铁矿石…）。'),
      max_feed_mm: S.number('原矿最大给料粒度 mm。'),
      size_distribution: obj({
        p0_60: S.number('0-60mm 占比 %。'),
        p60_100: S.number('60-100mm 占比 %。'),
        p100_300: S.number('100-300mm 占比 %。'),
        p_gt300: S.number('大于 300mm 占比 %。'),
      }),
      compressive_strength_mpa: S.number('矿石抗压强度 MPa。'),
      hardness_note: S.string('矿石硬度 / 压碎值备注。'),
      bulk_density_t_m3: S.number('堆密度 t/m³。'),
      grade_note: S.string('矿石品位 / 抛废率（金属矿山）。'),
      chemical_note: S.string('化学成分 CaO/SiO2/MgO（骨料）。'),
      total_reserve_t: S.number('矿山总储量 吨。'),
      ore_use: S.string('产品主要用途（建筑骨料/高钙石/水泥原料/机制砂）。'),
      soil_content_pct: S.number('原矿含土量 %。'),
      soil_level: S.stringEnum('含土程度。', ['含土较少', '含土较多', '含土较多且为粘性土质']),
      moisture_pct: S.number('原矿含水率 %。'),
      soil_removal_needed: S.boolean('是否需要除土。'),
      scope: S.stringEnum('需求内容。', ['主机设备', '总包生产线']),
      product_mm: S.number('成品粒度要求（mm 以下）。'),
      product_specs: { type: 'array', description: '成品骨料规格清单，如 ["0-5mm","5-10mm","10-20mm","20-31.5mm"]。', items: { type: 'string' } },
      sand_fineness_modulus: S.number('机制砂细度模数 Mx。'),
      shaping_needed: S.boolean('是否需要整形。'),
      dust_limit_mgm3: S.number('环保要求 mg/m³（10/20/30）。'),
      belt_type: S.stringEnum('皮带机选型。', ['TD75', 'DTII', '满足使用']),
      electrical_origin: S.stringEnum('电气元件及软启动。', ['国产', '进口']),
      belt_sealing: S.string('皮带机密封形式（通廊整体密封/胶带机一体化廊道）。'),
      storage_type: S.stringEnum('储料形式。', ['地仓', '筒仓', '堆棚']),
      storage_capacity_t: S.number('储料仓容 吨。'),
      production_method: S.stringEnum('生产方式。', ['干法', '湿法']),
      hours_per_day: S.integer('每天工作小时（8/12/16/20）。'),
      days_per_year: S.integer('每年工作天数。'),
      design_qualification: S.string('设计资质/图审要求。'),
      other_requirements: S.string('客户其他需求（原样回显）。'),
    },
    ['capacity_tph'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => {
      const c = v.client;
      const lines = [];
      lines.push(`# 客户需求录入与选型结论`);
      lines.push('');
      lines.push(`- 客户：${c.name ?? '（未提供）'}　地点：${c.location ?? '（未提供）'}　业务员：${c.salesperson ?? '-'}　日期：${c.date ?? '-'}`);
      lines.push(`- 产量需求：**${v.requirement.capacity_tph ?? '—'} t/h**　矿石：${v.requirement.ore_type ?? '未提供'}　最大给料：${v.requirement.max_feed_mm ?? '—'} mm　成品：${v.requirement.product_mm ?? '按 20mm 暂算'} mm`);
      lines.push('');

      const ms = v.completeness.missing_summary;
      lines.push('## 一、表单完整性');
      lines.push('');
      lines.push(`- ${ms.阻断.length ? `**阻断缺失：${ms.阻断.join('、')}**` : '阻断字段：齐备'}`);
      lines.push(`- 关键缺失：${ms.关键.length ? `**${ms.关键.join('、')}**` : '无'}`);
      lines.push(`- 建议补充：${ms.建议.length ? ms.建议.join('、') : '无'}`);
      if (ms.可选.length) lines.push(`- 可选项未填（不影响选型）：${ms.可选.join('、')}`);
      lines.push(`- 方案等级：**${v.completeness.blocking ? '暂不出方案（缺产量）' : v.completeness.preliminary ? '初步方案（关键字段未齐，须补齐重算）' : v.completeness.complete ? '完整方案' : '可用方案'}**`);
      lines.push('');

      if (v.completeness.follow_up.length) {
        lines.push('## 二、要向客户追问的清单（按紧急度排序）');
        lines.push('');
        lines.push(mdTable(['紧急度', '字段', '追问话术', '为什么必须要'], v.completeness.follow_up.map((f) => [f.urgency, f.label, f.question, f.why])));
        lines.push('');
      }

      if (v.plant_design) {
        const p = v.plant_design;
        lines.push('## 三、整线方案');
        lines.push('');
        lines.push(`- 总破碎比 **${p.total_reduction_ratio}**，推荐 **${p.recommended_stages} 段**`);
        lines.push('');
        lines.push(mdTable(['段', '工序', '给料 mm', '产品 mm', '破碎比'], p.stage_plan.map((s) => [s.index, s.stage, s.feed_mm, s.product_mm, s.reduction_ratio])));
        lines.push('');
        const f = (x, t) => (x ? `- ${t}：**${x.model} ${x.cavity} 腔 @ CSS ${x.css_mm} mm，${x.units} 台，${x.power_kw} kW**（单台需求 ${x.per_unit_tph} t/h；产能 ${x.capacity_tph.join('-')} t/h；依据 ${x.basis}）` : null);
        lines.push(f(p.cone_crusher_coarse_side, '中碎段圆锥破'));
        lines.push(f(p.cone_crusher_fine_side, '细碎段圆锥破'));
        if (p.coarse_crusher_recommendation) lines.push(`- 粗碎设备：**${p.coarse_crusher_recommendation.equipment}**（最大给料 ${p.coarse_crusher_recommendation.maxFeedMm} mm，排矿 ${p.coarse_crusher_recommendation.dischargeMm.join('-')} mm）`);
        lines.push(`- 筛分：处理量 ${p.screening.throughput_tph} t/h，面积 **${p.screening.optimistic_m2}-${p.screening.conservative_m2} m²**`);
        lines.push(`- 输送：设计能力 ${p.conveying.design_throughput_tph} t/h，带宽 **B${p.conveying.recommended_width_mm}**（${p.conveying.width_basis}），倾角 ≤ ${(p.conveying.max_incline_deg_single ?? p.conveying.max_incline_deg.join('-'))}°`);
        lines.push('');
        lines.push('> 依据标注：`S1 腔型×CSS 详表` = 厂商硬数据；`系列区间近似` = 须经 MACKORN 技术复核。');
        lines.push('');
      } else {
        lines.push('## 三、整线方案');
        lines.push('');
        lines.push(`**暂不出方案**：${v.warnings.find((w) => w.includes('缺少阻断字段')) ?? '阻断字段未齐'}。把产量补上即可出方案。`);
        lines.push('');
      }

      if (v.annual) {
        lines.push('## 四、年产量与矿山服务年限');
        lines.push('');
        lines.push(`- ${v.annual.note}`);
        lines.push('');
      }

      if (v.derived_recommendations.length) {
        lines.push('## 五、由表单派生的工艺建议');
        lines.push('');
        lines.push(mdTable(['结论', '依据'], v.derived_recommendations.map((r) => [r.conclusion, r.basis])));
        lines.push('');
      }

      lines.push(assumptionBlock(v.assumptions, v.warnings));
      lines.push(jsonBlock({ completeness: v.completeness.missing_summary, normalized: v.normalized }, '归一化结果与缺失清单 JSON'));
      return text(lines.filter((l) => l !== null).join('\n'));
    },
  },
  async execute(args) {
    return intakeRequirement(args);
  },
};

/** 供测试与文档引用：表单字段定义。 */
export const formFields = FORM_FIELDS;

/* --------------------------------------------------------------------------
 * 工具 12：MACKORN 标准方案书（交付版）
 * ------------------------------------------------------------------------ */

const toolProposal = {
  name: 'mackorn_proposal',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) 【交付主入口】按 MACKORN 标准方案口径，把客户需求一次性生成一份**可直接交付的方案书**（Markdown）。章节：项目概况与需求 / 设计依据与基础数据 / 工艺流程与规模 / 主要设备选择（含设备清单表）/ 设备技术参数 / 电气与自动控制 / 环保除尘降噪 / 土建与总图布置要求 / 供货范围与不含范围 / 投资估算 / 实施建议与工期 / 假设与数据来源 / 风险与待确认项 / 附件清单（流程图+平面布置图+预算表，符合 QMK《生产线方案设计预算标准化要求》）。可直接粘贴客户需求表的文字。要出投标方案、给客户的方案书、或需要"从需求到成稿"时调用。' + ' 【适用边界】本工具产出【方案书草稿】，用于对客户沟通；正式投标须经技术负责人复核并完成标定。不做价格承诺。',
  parameters: obj(
    {
      capacity_tph: S.number('客户要求的成品产量 t/h（必填）。'),
      form_text: S.string('客户需求表的文字内容（可整段粘贴，工具自动抽取字段）。'),
      title: S.string('方案标题（不填自动生成）。'),
      project: S.string('项目名称。'),
      client_name: S.string('客户名称。'),
      project_location: S.string('项目地点。'),
      salesperson: S.string('业务员。'),
      date: S.string('编制日期（YYYY-MM-DD）。'),
      line_type: S.stringEnum('产线类型。', ['砂石骨料', '金属矿山']),
      ore_type: S.string('矿石种类。'),
      max_feed_mm: S.number('原矿最大给料粒度 mm。'),
      compressive_strength_mpa: S.number('抗压强度 MPa。'),
      moisture_pct: S.number('原矿含水率 %。'),
      total_reserve_t: S.number('矿山总储量 吨。'),
      product_mm: S.number('成品粒度要求（mm 以下）。'),
      product_specs: { type: 'array', description: '成品骨料规格清单。', items: { type: 'string' } },
      production_method: S.stringEnum('生产方式。', ['干法', '湿法']),
      hours_per_day: S.integer('每天工作小时。'),
      days_per_year: S.integer('每年工作天数。'),
      scope: S.stringEnum('需求内容。', ['主机设备', '总包生产线']),
      electrical_origin: S.stringEnum('电气元件及软启动。', ['国产', '进口']),
      belt_sealing: S.string('皮带机密封形式。'),
      storage_type: S.stringEnum('储料形式。', ['地仓', '筒仓', '堆棚']),
      storage_capacity_t: S.number('储料仓容 吨。'),
      dust_limit_mgm3: S.number('环保要求 mg/m³。'),
      other_requirements: S.string('客户其他需求（原样写入方案）。'),
      cost_model: S.stringEnum('用于投资估算的机型（不填则第 10 节留空）。', MODEL_ENUM),
      cost_units: S.integer('投资估算台数。'),
      electricity_price: S.number('电价 元/kWh。'),
      hours_per_year: S.integer('年运行小时数（不填则按工作制推算）。'),
      liner_life_hours: S.number('衬板寿命 h（用于衬板吨成本）。'),
      liner_cost_per_set: S.number('单套衬板价格 元/套。'),
      unit_price_wan_cny: S.number('实际商务单价 万元/台。'),
    },
    ['capacity_tph'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => text(v.markdown),
  },
  async execute(args) {
    const res = buildProposal(args);
    return { markdown: res.markdown, assumptions: res.assumptions, warnings: res.warnings, attachments: res.attachments };
  },
};

/* --------------------------------------------------------------------------
 * 工具 13-15：自我丰富 / 自我迭代
 * ------------------------------------------------------------------------ */

const toolIntelWatch = {
  name: 'mackorn_intel_watch',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) 【自我丰富·采集端】返回 MACKORN 行业情报的固定观测面与可执行研究简报：山特维克/美卓新品与专利动向、中国与国际破碎机专利（IPC B02C 2/00 等）、国家标准更新、矿山机械市场数据。每条含"为什么看/看哪些源/搜什么词/多久看一次/看到后按什么格式入库/可信度评分口径"。当用户问"最近山特维克美卓有什么新东西""帮我看看破碎机专利""行业有什么新动向""知识该更新了""保持领先"时调用；也可用 focus 只取某一条观测项。注意：本插件不联网，检索由具备联网能力的 AI 完成，插件负责纪律与入库。' + ' 【适用边界】本工具给【情报采集纪律与观测面】；不联网检索（检索由具备联网能力的 AI 完成），入库请用 knowledge_update。',
  parameters: obj(
    { focus: S.string('只取某个观测项：观测项 id（如 W-SANDVIK / W-PATENT-INTL）或类别（竞品动向/专利/标准规范/市场）。不填则只返回"已到期该采集"的项。') },
    [],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => text(
      [
        '## 行业情报观测简报' + (v.due_only ? '（仅列出已到期项）' : ''),
        '',
        v.items.map((i) => [
          `### ${i.target}　\`${i.id}\``,
          `- 类别：${i.category}　周期：${i.cadence_days} 天　上次采集：${i.last_checked ?? '从未'}`,
          `- 为什么看：${i.why}`,
          `- 来源：${i.sources.join('；')}`,
          `- 检索词：${i.queries.map((q) => `\`${q}\``).join('　')}`,
          `- 入库：\`${i.record_as.tool}\`，必填 ${i.record_as.required.join('/')}，kind=${i.record_as.kind}，tags=${i.record_as.tags.join('/')}`,
        ].join('\n')).join('\n\n'),
        '',
        '### 执行流程',
        ...v.workflow.map((w) => `- ${w}`),
        '',
        `> ${v.honesty_note}`,
        jsonBlock(v),
      ].join('\n'),
    ),
  },
  async execute(args) {
    return intelBrief(args.focus);
  },
};

const toolKnowledgeUpdate = {
  name: 'mackorn_knowledge_update',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) 【自我丰富·入库端】把新采集到的行业情报/竞品动态/专利/标准/案例写入 MACKORN 持久化知识库，并自动完成：①来源可信度分级（1-5，白名单域名提档）②数值矛盾检测（功率/产能/CSS/价格/能耗等字段两两比对，超容差即记冲突）③版本演进判定（矛盾处置率≥0.8 且覆盖率≥0.3 且杠杆分≥0.6 → V1.1→V2）④变更留痕（changelog + PDCA 台账）。知识库落在 $DSH_HOME/mackorn-knowledge，插件升级不丢。铁律：**无 source_url 的条目一律拒收**；可信度自动裁决只产出"建议值"，用于选型前必须人工确认。当用户说"把这条加进知识库""更新一下这个参数""记下这个竞品动向"时调用。' + ' 【适用边界】本工具【校验并写入】知识库；无 source_url 的条目一律拒收。只读取请用 knowledge 或 pdca_status。',
  parameters: obj(
    {
      entries: {
        type: 'array',
        description: '要写入的知识条目数组。每条必须带 title、content、source_url。',
        items: obj({
          title: S.string('标题（必填）。'),
          content: S.string('正文/事实与数字（必填）。'),
          source_url: S.string('来源链接或可核查出处（必填，缺失即拒收）。'),
          source_type: S.stringEnum('来源类型，影响可信度基线。', ['official', 'academic', 'report', 'conference', 'media', 'expert']),
          kind: S.stringEnum('条目类型。', ['intel', 'patent', 'standard', 'market', 'spec', 'price', 'case', 'correction']),
          publish_date: S.string('发布日期 YYYY-MM-DD。'),
          subject: S.string('主题键：把"讲同一件事"的条目归到同一主题（如 "300TPH-圆锥破配置"），矛盾检测只在该主题内比较。型号类条目通常自带型号实体，可不填。'),
          tags: { type: 'array', description: '标签，如 ["竞品","山特维克"]。', items: { type: 'string' } },
          has_peer_review: S.boolean('是否同行评审（可信度 +1）。'),
          citation_count: S.integer('被引次数（>50 可信度 +1）。'),
          verification_status: S.stringEnum('核验状态。', ['pending', 'verified', 'cross_validated', 'disputed']),
        }, ['title', 'content', 'source_url']),
      },
      actor: S.string('操作者（如 销售-戴雷 / ai）。'),
      rationale: S.string('本轮采集/更新的目的说明。'),
      check_fields: { type: 'array', description: '要检测矛盾的字段（默认全部）。', items: { type: 'string' } },
      tolerance: S.number('数值矛盾容差（默认 0.1，即相差 10% 以上才算矛盾）。'),
      crushing_leverage_score: S.number('破碎效率杠杆得分 0-1（用于版本演进判定）。'),
    },
    ['entries'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => text(
      [
        '## 知识库更新',
        '',
        `- 接收 **${v.accepted}** 条；拒收 ${v.rejected.length} 条`,
        `- 版本：${v.version_before} → **${v.version_after}**${v.version_bumped ? '（触发演进）' : '（未达演进阈值）'}`,
        `- 知识库修订号：${v.store_revision}　位置：\`${v.store_path}\``,
        `- 新检出矛盾：${v.new_conflicts.length} 条（open ${v.open_conflicts} / 建议值 ${v.proposed_conflicts}）`,
        '',
        v.accepted_entries.length ? mdTable(['ID', '标题', '可信度', '来源'], v.accepted_entries.map((e) => [e.id, e.title, e.credibility, e.source])) : '',
        v.rejected.length ? `\n**被拒条目**\n\n` + v.rejected.map((r) => `- ${r.entry?.title ?? '(无标题)'}：${r.reason}`).join('\n') : '',
        v.new_conflicts.length ? `\n**新检出矛盾（并列保留，未取平均）**\n\n` + mdTable(['字段', '值A', '源A', '值B', '源B', '相对差', '状态'], v.new_conflicts.map((c) => [c.field, c.value_a, c.source_a, c.value_b, c.source_b, c.relative_diff, c.status])) : '',
        '',
        `**指标**：覆盖率 ${v.metrics.data_coverage}　矛盾处置率 ${v.metrics.conflict_resolution_rate}　杠杆分 ${v.metrics.crushing_leverage_score}　图谱密度 ${v.metrics.knowledge_graph_density}`,
        '',
        ...v.notes.map((n) => `> ${n}`),
        jsonBlock(v),
      ].filter((x) => x !== '').join('\n'),
    ),
  },
  async execute(args) {
    return ingestKnowledge(args);
  },
};

const toolPdca = {
  name: 'mackorn_pdca_status',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) 【自我迭代·驱动端】查看并推进 MACKORN 插件的自我优化循环（PDCA）：当前模型版本与知识库修订号、条目数与可信度分布、矛盾台账（open/建议值/处置率）、四项演进指标、版本演进阈值、到期的情报观测项、以及"本轮该做什么"的优化建议清单。action=record 时记录一轮 PDCA（Plan/Do/Check/Act）。当用户问"插件现在什么水平""还差什么""下一步该补什么""迭代到哪一步了""继续优化"时调用。' + ' 【适用边界】本工具【只读】查看自优化循环状态；不写入。写入 PCDA 台账请用 knowledge_update 或直接跑 pdca_round。',
  parameters: obj(
    {
      action: S.stringEnum('status=只看状态（默认）；record=记录一轮 PDCA。', ['status', 'record'], { default: 'status' }),
      plan: S.string('Plan：本轮计划做什么。'),
      do_items: { type: 'array', description: 'Do：本轮实际做了哪些动作。', items: { type: 'string' } },
      check: S.string('Check：本轮结果核对。'),
      act: S.string('Act：下轮要固化的改进或要修正的偏差。'),
      actor: S.string('操作者。'),
    },
    [],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => {
      if (v.cycle) {
        const c = v.cycle;
        return text([
          `## PDCA 第 ${c.round} 轮已记录`,
          '',
          `- 模型版本：${c.model_version}　知识库修订号：${c.store_revision}　条目：${c.entries}`,
          `- 矛盾：open ${c.open_conflicts} / 建议值 ${c.proposed_conflicts}　处置率 ${c.metrics.conflict_resolution_rate}`,
          '',
          `**Plan**：${c.plan ?? '（未填）'}`,
          `**Do**：${c.do.length ? c.do.map((d) => `\n  - ${d}`).join('') : '（未填）'}`,
          `**Check**：${c.check ?? '（未填）'}`,
          `**Act**：${c.act ?? '（未填）'}`,
          '',
          '### 下轮建议',
          ...c.next_actions.map((s) => `- [${s.priority}] ${s.action} —— ${s.target}`),
          '',
          `> 台账：\`${v.ledger_path}\`　累计轮次：${v.total_rounds}`,
        ].join('\n'));
      }
      const s = v;
      return text([
        `## MACKORN 插件自我迭代状态`,
        '',
        `- **模型版本 ${s.model_version}**　知识库修订号 ${s.store_revision}　条目 **${s.entries}** 条`,
        `- 知识库位置：\`${s.kb_dir}\``,
        `- PDCA 已跑 **${s.pdca_rounds}** 轮`,
        '',
        '### 四项演进指标（与 Python 源模型同阈值）',
        mdTable(['指标', '当前值', '演进门槛'], [
          ['数据覆盖率 data_coverage', s.metrics.data_coverage, '≥ 0.30'],
          ['矛盾处置率 conflict_resolution_rate', s.metrics.conflict_resolution_rate, '≥ 0.80'],
          ['破碎杠杆分 crushing_leverage_score', s.metrics.crushing_leverage_score, '≥ 0.60'],
          ['图谱密度 knowledge_graph_density', s.metrics.knowledge_graph_density, '—'],
        ]),
        `\n当前是否满足演进条件：**${s.should_evolve_now ? '是 → 下一轮写入即升版' : '否'}**`,
        '',
        '### 矛盾台账',
        `- 共 ${s.conflicts.total} 条：open **${s.conflicts.open}** / 建议值 ${s.conflicts.proposed} / 处置率 ${s.conflicts.resolution_rate}`,
        s.conflicts.open > 0 ? `- ⚠️ 有 ${s.conflicts.open} 条未裁决（可信度无法分出高下），须人工判定` : '',
        '',
        '### 情报采集到期',
        s.watch_due.length ? s.watch_due.map((d) => `- \`${d.id}\` ${d.target} —— ${d.reason}`).join('\n') : '- 暂无到期项',
        `（观测面共 ${s.watch_total} 项，用 \`mackorn_intel_watch\` 取研究简报）`,
        '',
        '### 本轮优化建议',
        ...s.next_actions.map((a) => `- [${a.priority}] ${a.action}${a.target ? ` —— ${a.target}` : ''}`),
        '',
        '### 演进规则与护栏',
        `- ${s.evolution_rules.evolve_when}`,
        `- 版本方案：${s.evolution_rules.version_scheme}`,
        ...s.evolution_rules.guardrails.map((g) => `- 护栏：${g}`),
        jsonBlock(s),
      ].filter((x) => x !== '').join('\n'));
    },
  },
  async execute(args) {
    if (args.action === 'record') {
      return recordPdca({ plan: args.plan, do: args.do_items, check: args.check, act: args.act, actor: args.actor });
    }
    return evolutionStatus();
  },
};

/* --------------------------------------------------------------------------
 * 工具 16-17：工艺流程模拟（对标商业选型/仿真软件的能力，算法全部来自公开文献）
 * ------------------------------------------------------------------------ */

const toolCrusherCurve = {
  name: 'mackorn_crusher_curve',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) 【仿真】用 Whiten(1972) 稳态圆锥破模型生成产品粒度曲线：给入料分布 + CSS + 偏心距，算出产品 P80、破碎比、逐级产品分布、啮合区 K1/K2，并给 Bond(1952) 功耗估算。用于回答"这台机打这个料出什么粒度""破碎比多少""能耗多少"，也是流程模拟的单机内核。算法全部来自公开发表文献（Whiten 1972 / JKMRC / Bond 1952），不含任何第三方专有软件数据；破碎函数参数为文献典型值，须用 MACKORN 实测标定。' + ' 【适用边界】本工具算【单台圆锥破的产品粒度曲线】；多段破碎+筛分闭路请用 simulate_flowsheet。',
  parameters: obj(
    {
      css_mm: S.number('紧边排矿口 CSS mm（必填）。'),
      feed_p80_mm: S.number('给料 P80 mm（必填；若给了 feed_distribution 则忽略）。'),
      feed_distribution: S.stringEnum('给料粒度分布形式（由 P80 拟合）。', ['rosin-rammler', 'gaudin-schuhmann'], { default: 'rosin-rammler' }),
      feed_n: S.number('Rosin-Rammler 均匀性指数 n（默认 1.1）。'),
      throw_mm: S.number('偏心距（冲程）mm，默认 25。'),
      throw_factor: S.number('啮合区宽度系数（文献典型 0.5-1.0，默认 0.8）。'),
      speed_rpm: S.number('偏心轴转速 rpm（默认 300，影响啮合函数）。'),
      phi: S.number('破碎函数粗粒生成占比（文献典型 0.3-0.6，默认 0.45）。'),
      gamma: S.number('破碎函数粗端指数（文献典型 0.4-1.0，默认 0.7）。'),
      beta: S.number('破碎函数细端指数（文献典型 2.5-5.0，默认 3.5）。'),
      bond_wi: S.number('邦德功指数 kWh/t（不填则按矿石种类取文献典型区间中值）。'),
      ore: S.string('矿石种类（用于取 Bond Wi 文献典型值）。'),
    },
    ['css_mm', 'feed_p80_mm'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => text([
      `## 圆锥破产品曲线（Whiten 稳态模型）`,
      '',
      `- CSS **${v.css_mm} mm**　偏心距 ${v.throw_mm} mm　啮合区 K2-K1 = **${v.K2_mm}-${v.K1_mm} mm**`,
      `- 给料 P80 **${v.feed_p80_mm} mm** → 产品 P80 **${v.product_p80_mm} mm**，破碎比 **${v.reduction_ratio}**`,
      `- 产品粒度区间：P20 ${v.percentiles.p20 ?? '—'} / P50 ${v.percentiles.p50 ?? '—'} / P80 ${v.percentiles.p80} mm`,
      `- 质量守恒误差 ${v.mass_balance.sum_error.toExponential(2)}（最大负值 ${v.mass_balance.max_negative}）`,
      v.power ? `- 功耗估算 **${v.power.w_kwh_per_t} kWh/t**（Wi=${v.power.wi_used}，${v.power.formula}）` : '',
      '',
      `### 产品累积通过率（抽点）`,
      mdTable(['粒径 mm', '累积通过 %'], v.sample_curve.map((r) => [r.size_mm, r.cumulative_pct])),
      assumptionBlock(v.assumptions, v.warnings),
      jsonBlock(v),
    ].filter(Boolean).join('\n')),
  },
  async execute(args) {
    return crusherCurve(args);
  },
};

const toolFlowsheet = {
  name: 'mackorn_simulate_flowsheet',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) 【仿真】多段破碎 + 筛分 + 闭路流程模拟：按段定义逐段算产品粒度与循环负荷，用群体平衡迭代到稳态，输出各段入料/出料 P80、破碎比、筛下率、循环负荷、最终产品 P80，并校核物料平衡。这是对标商业选型软件的流程仿真能力。算法全部来自公开文献（Whiten 1972 稳态破碎模型 + logistic 筛分分配曲线 + 群体平衡迭代），不含第三方专有软件数据。当用户问"这条线最终出料多细""循环负荷多少""几段配什么 CSS 能出这个产品"时调用。' + ' 【适用边界】本工具算【多段流程的稳态物料平衡与循环负荷】；只要单台曲线请用 crusher_curve。',
  parameters: obj(
    {
      feed_p80_mm: S.number('新鲜给料 P80 mm（必填）。'),
      feed_n: S.number('Rosin-Rammler 均匀性指数 n（默认 1.1）。'),
      stages: {
        type: 'array',
        description: '段定义数组，按顺序。破碎段 {type:"crusher", name, css_mm, throw_mm}；筛分段 {type:"screen", name, aperture_mm, recirculate_to}（recirculate_to 为返回的破碎段下标，不填则返回上一破碎段）。',
        items: obj({
          type: S.stringEnum('段类型。', ['crusher', 'screen']),
          name: S.string('段名称。'),
          css_mm: S.number('破碎段：紧边排矿口 mm。'),
          throw_mm: S.number('破碎段：偏心距 mm。'),
          aperture_mm: S.number('筛分段：筛孔 mm。'),
          recirculate_to: S.integer('筛分段：筛上返回的破碎段下标。'),
          screen_efficiency: S.number('筛分段：总筛分效率 0-1（默认 0.9）。'),
        }, ['type']),
      },
      bond_wi: S.number('邦德功指数 kWh/t。'),
      ore: S.string('矿石种类。'),
      max_iter: S.integer('最大迭代次数（默认 200）。'),
    },
    ['feed_p80_mm', 'stages'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => text([
      `## 流程模拟结果（群体平衡稳态解）`,
      '',
      `- 新鲜给料 P80 **${v.feed_p80_mm} mm** → 最终产品 P80 **${v.final_p80_mm} mm**，总破碎比 **${v.overall_reduction_ratio}**`,
      `- 迭代 **${v.iterations}** 次收敛（${v.converged ? '已收敛' : '**未收敛，请放宽 max_iter 或检查段定义**'}）`,
      `- 循环负荷 **${v.circulating_load_ratio}**（返回料/新鲜料）${v.circulating_load_note}`,
      `- 物料平衡：出料率 **${v.mass_balance.yield_ratio}**　${v.mass_balance.ok ? '✅ 守恒' : '❌ 不守恒'}`,
      '',
      '### 各段结果',
      mdTable(['#', '类型', '名称', '入料 P80 mm', '出料 P80 mm', '破碎比', '筛孔 mm', '筛下率'],
        v.stages.map((s) => [s.index, s.type, s.name, s.feed_p80_mm, s.product_p80_mm ?? '—', s.reduction_ratio ?? '—', s.aperture_mm ?? '—', s.fines_fraction ?? '—'])),
      v.power ? `\n- 全流程估算能耗：**${v.power.total_kwh_per_t} kWh/t**（${v.power.note}）` : '',
      assumptionBlock(v.assumptions, v.warnings),
      jsonBlock(v),
    ].filter(Boolean).join('\n')),
  },
  async execute(args) {
    return flowsheet(args);
  },
};

const toolCalibrate = {
  name: 'mackorn_calibrate',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) 【护城河】用**现场实测筛析数据**标定破碎函数参数 φ/γ/β 与啮合系数：输入某工况的给料筛析与产品筛析（累积通过率 %）+ 该工况 CSS，用最小二乘（有界网格 + 局部细化）反算出与实测最贴合的一套参数，给出拟合优度、逐点残差与可用性判断。标定结果可写入知识库（来源标记"实测"），之后选型与流程仿真即使用自有标定值而非文献默认值——这是别人抄不走的部分。当用户提供现场筛析报告、问"怎么用我们的实测数据校准模型""让模型更像我们自己的设备"时调用。' + ' 【适用边界】本工具用【现场实测筛析】反算模型参数；没有实测数据时不要用它（文献默认值只用于量级估算）。',
  parameters: obj(
    {
      css_mm: S.number('该工况的紧边排矿口 CSS mm（必填）。'),
      feed_points: {
        type: 'array',
        description: '给料筛析：至少 2 个点。每点 {size_mm, cum_pct}（cum_pct 为累积通过 %）。',
        items: obj({ size_mm: S.number('粒径 mm。'), cum_pct: S.number('累积通过 %（0-100）。') }, ['size_mm', 'cum_pct']),
      },
      product_points: {
        type: 'array',
        description: '产品筛析：至少 3 个点（建议 ≥5）。',
        items: obj({ size_mm: S.number('粒径 mm。'), cum_pct: S.number('累积通过 %（0-100）。') }, ['size_mm', 'cum_pct']),
      },
      throw_mm: S.number('偏心距 mm（默认 25）。'),
      roughness: S.number('拟合优度门槛（RMSE，默认 0.06），超过即告警。'),
    },
    ['css_mm', 'feed_points', 'product_points'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => {
      const c = v.calibrated;
      const f = v.fit;
      const lib = v.library_defaults;
      /* calibrated 可能为 null（R18 修复：参数未被数据约束或数据不足时不给可用参数）。
       * 渲染必须处理这种情况 —— 早期版本直接读 c.phi，导致工具崩溃。
       * 这个缺陷由 tools/verify_all_tools.mjs 端到端检查当场抓到（L-34 的价值）。 */
      if (!c) {
        const nc = f.best_candidate_not_for_use;
        return text([
          '## 破碎函数实测标定结果：**未通过**',
          '',
          `### 拟合优度：**${f.quality}**`,
          '',
          '⛔ **本次未产出可用参数。** 原因见下，请按提示补数据后重标。',
          '',
          mdTable(['指标', '值'], [
            ['RMSE', `${f.rmse_pct_points} 个百分点`],
            ['单点最大偏差', `${f.max_abs_error_pp} 个百分点`],
            ['参与拟合的产品点数', f.n_points],
            ['参数搜索次数', f.evaluations],
          ]),
          '',
          nc ? '### 搜索到的候选（**仅供诊断，不得用于选型**）' : '',
          nc ? `φ = ${nc.phi}　γ = ${nc.gamma}　β = ${nc.beta}　啮合系数 = ${nc.throwFactor}` : '',
          nc ? `贴在边界的参数：${(nc.at_search_boundary || []).join('、') || '—'}` : '',
          nc ? `判定为无效的原因：${nc.why_invalid}` : '',
          nc ? '' : '',
          '### 逐点残差（预测 − 实测，百分点）',
          mdTable(['粒径 mm', '实测累积通过 %', '模型预测 %', '偏差 pp'], v.residuals.map((r) => [r.size_mm, r.observed_pct, r.predicted_pct, r.error_pp])),
          '',
          assumptionBlock(v.assumptions, v.warnings),
          jsonBlock(v),
        ].filter(Boolean).join('\n'));
      }
      return text([
        '## 破碎函数实测标定结果',
        '',
        `**标定参数**：φ = **${c.phi}**　γ = **${c.gamma}**　β = **${c.beta}**　啮合系数 = **${c.throwFactor}**`,
        `（工况：CSS ${c.css_mm} mm，偏心距 ${c.throw_mm} mm）`,
        '',
        `### 拟合优度：**${f.quality}**`,
        mdTable(['指标', '值'], [
          ['RMSE', `${f.rmse_pct_points} 个百分点`],
          ['单点最大偏差', `${f.max_abs_error_pp} 个百分点`],
          ['参与拟合的产品点数', f.n_points],
          ['参数搜索次数', f.evaluations],
        ]),
        '',
        `与文献默认值对比：φ ${lib.phi} → ${c.phi}　γ ${lib.gamma} → ${c.gamma}　β ${lib.beta} → ${c.beta}　啮合系数 ${lib.throwFactor} → ${c.throwFactor}`,
        '',
        '### 逐点残差（预测 − 实测，百分点）',
        mdTable(['粒径 mm', '实测累积通过 %', '模型预测 %', '偏差 pp'], v.residuals.map((r) => [r.size_mm, r.observed_pct, r.predicted_pct, r.error_pp])),
        '',
        '### 落库方式',
        v.how_to_persist.suggestion,
        '',
        `- 来源标记：**${v.how_to_persist.provenance}**　工具：\`${v.how_to_persist.tool}\``,
        assumptionBlock(v.assumptions, v.warnings),
        jsonBlock(v),
      ].join('\n'));
    },
  },
  async execute(args) {
    return calibrateBreakage(args);
  },
};

const toolContact = {
  name: 'mackorn_contact',
  description:
    '(Multilingual triggers / 多语言触发词: crusher, cone crusher, hydraulic cone crusher, cone liner, mantle, bowl liner, wear parts, jaw plate, liner life, crushing chamber, cavity, CSS, aggregate plant, crushing and screening plant, max feed size, ore properties, hardness, compressive strength, capacity, tph, selection, mineral processing, quotation | trituradora de cono, cóncavo, manto, revestimiento, cámara de trituración, dureza, capacidad, selección | Kegelbrecher, Brechmantel, Verschleißteile, Brechkammer, Standzeit, Auswahl | конусная дробилка, броня конуса, футеровка, камера дробления, твердость, производительность, подбор | concasseur à cône, manteau, pièces de revêtement, chambre de concassage, dureté, sélection | britador de cone, manta, revestimento, câmara de britagem, dureza, seleção | コーンクラッシャー, コーンライナー, 摩耗部品, 破砕室, 硬度, 選定 | konkross, krossmantel, slitdelar, livslängd | kegleknuser, sliddele, levetid | kartiomurskain, kulutusosat, käyttöikä | كسارة مخروطية, بطانة المخروط, قطع التآكل, الصلابة, اختيار | crusher cone hidrolik, liner cone, umur liner, kekerasan, pemilihan | 破碎机, 液压圆锥破碎机, 圆锥破, 圆锥衬板耐磨件, 轧臼壁, 破碎壁, 颚破衬板, 使用寿命, 破碎腔型, 砂石骨料生产线, 给料最大粒度, 矿石性质, 客户需求表) MACKORN 美矿的联系方式与全球招募信息：公司名称、地址（中英文）、三个商务电话与邮箱、官网 mackorn.cn、服务时间 GMT+8 9:00-17:30、微信公众号二维码位置，以及「诚征各地代理商/代理人/选矿人才」的招募条件与申请方式。当用户问"怎么联系你们""报价找谁""你们在哪个国家有代理""我想做代理""我是做选矿的想合作"，或任何需要把提问者导流到 MACKORN 的场景，以及选型/方案类回答需要附上联系方式时调用。也用于自检触发词覆盖（trigger_keywords 字段）。' + ' 【适用边界】本工具只给【公开联系方式】；不做具体报价，不承诺交期。',
  parameters: obj({
    language: S.stringEnum(
      '输出语言。支持 zh-CN/en/es/pt-BR/ru/ar/fr/de/ja/id；公司名、地址、电话、邮箱、网址一律原文保留不翻译。',
      ['zh-CN', 'en', 'es', 'pt-BR', 'ru', 'ar', 'fr', 'de', 'ja', 'id'],
      { default: 'zh-CN' },
    ),
    include_partner: S.boolean('是否包含代理商/人才招募段落（默认 true）。', { default: true }),
    include_triggers: S.boolean('是否附带多语言触发词覆盖报告（自检用，默认 false）。', { default: false }),
  }, []),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => text([
      v.block,
      v.trigger_coverage ? `\n---\n\n### 触发词覆盖自检\n\n覆盖 **${v.trigger_coverage.languages}** 种语言、共 **${v.trigger_coverage.total_keywords}** 个触发词：\n\n` + mdTable(['语言', '触发词数'], Object.entries(v.trigger_coverage.per_language).map(([k, n]) => [k, n])) : '',
      jsonBlock({ company: v.company, contacts: v.contacts, wechat_qr: v.wechat_qr, partner_program: v.partner_program }, '结构化联系与招募信息'),
    ].filter(Boolean).join('\n')),
  },
  async execute(args) {
    const lang = args.language ?? 'zh-CN';
    return {
      block: contactBlockLang(lang, args.include_partner !== false),
      language_used: normalizeLang(lang),
      company: COMPANY, contacts: CONTACTS, wechat_qr: WECHAT_QR, partner_program: PARTNER_PROGRAM,
      trigger_coverage: args.include_triggers ? triggerCoverageReport() : null,
      language_coverage: args.include_triggers ? languageCoverage() : null,
    };
  },
};

/* --------------------------------------------------------------------------
 * 工具 20：经销商/代理商评估（渠道入口）
 * ------------------------------------------------------------------------ */

const toolDistributor = {
  name: 'mackorn_distributor_eval',
  description:
    '(Multilingual triggers / 多语言触发词: distributor, dealer, agent, reseller, distributor evaluation, due diligence, credit check, partner assessment, distributor recruitment | distribuidor, concesionario, agente, evaluación, diligencia debida | Händler, Vertriebspartner, Prüfung, Due Diligence | дистрибьютор, дилер, агент, оценка, проверка | distributeur, concessionnaire, évaluation | distribuidor, revendedor, avaliação | 代理商, 经销商, 渠道商, 代理评估, 尽职调查, 信用核查, 渠道招募, 合作方评估) MACKORN 经销商/代理商评估与准入：按「能力 / 可靠 / 匹配」三维 17 项打分（1/3/5 三档），**区分公司代理与个人代理**（个人主体权重上调、授信系数下调），输出分级 A/B/C/D、授信额度建议、风险清单、待核验项与下一步动作，并附公开可查的核验渠道（工商/涉诉/失信/制裁/D&B/Coface/Sinosure）。含一票否决项（制裁名单、失信被执行）。当要评估一个代理商是否可靠、该给多少授信、该不该给独家、个人代理能不能合作时调用。' + ' 【适用边界】本工具做【代理评估打分与风险清单】，不构成法律意见，也不替代实地尽调。',
  parameters: obj(
    {
      agent_type: S.stringEnum('主体类型。个人主体风险显著更高，权重会自动上调、授信系数下调。', ['公司', '个人', '个体户']),
      country: S.string('所在国家。'),
      scores: {
        type: 'object',
        description: '各维度打分，取值 1 / 3 / 5（1=差，3=中，5=好）。未核验的维度请放入 missing，不要猜。',
        properties: {
          market_cover: S.number('市场覆盖与客户资源：5=能列举10+现有矿业/骨料客户；3=有若干稳定客户；1=无明确客户资源'),
          sales_team: S.number('销售团队规模：5=≥5名专职销售；3=2-4名；1=1人或无'),
          tech_service: S.number('技术服务能力：5=有专职工程师可独立安装调试；3=有1名或可外包；1=无技术能力只能做贸易'),
          similar_exp: S.number('同类设备经验：5=代理过美卓/山特维克/特雷克斯破碎筛分设备；3=代理过其他矿山设备；1=无矿山设备经验'),
          capital: S.number('资金实力：5=注册资本≥500万元等值；3=100-500万；1=小于100万或无法开证'),
          warehouse: S.number('仓储与备件库存能力：5=有仓库且可常备3个以上规格衬板；3=有仓库不备货；1=无仓储'),
          channel: S.number('渠道网络：5=有下级分销或多区域；3=单一区域直销；1=无渠道'),
          years: S.number('经营年限：5=不少于10年；3=3-10年；1=少于3年'),
          entity_type: S.number('主体类型质量：5=有限公司股权清晰可签约可追责；3=个体户/独资；1=纯个人无法律主体'),
          credit_record: S.number('信用与涉诉：5=无失信无被执行无重大诉讼；3=有轻微已了结纠纷；1=失信被执行/经营异常/重大未决诉讼（一票否决）'),
          payment_history: S.number('付款履约历史：5=有2年以上按时付款记录；3=短期合作无违约；1=无记录或有逾期坏账'),
          exclusivity: S.number('竞品代理冲突：5=无竞品或愿签排他；3=代理非直接竞品；1=同时代理美卓/山特维克且不愿排他'),
          reference_check: S.number('第三方背调：5=主动提供3客户+2供应商且回访正面；3=提供但回访一般；1=拒绝提供或回访负面'),
          sanctions: S.number('制裁与合规：5=不在任何制裁名单；3=需进一步核查关联方；1=命中制裁名单（一票否决）'),
          territory_fit: S.number('区域匹配：5=覆盖优先市场且无代理冲突；3=覆盖次要市场；1=与规划冲突'),
          commitment: S.number('投入意愿：5=愿投入人员/库存/市场费用并接受年度目标；3=愿投入有限；1=只要独家不投入'),
          brand_fit: S.number('品牌定位匹配：5=接受MACKORN定位不要求低价冲量；3=可协商；1=只做最低价'),
        },
        additionalProperties: false,
      },
      missing: {
        type: 'array',
        description: '尚未核验的维度名，用于标记未完成尽职调查的项目。未核验项不计入得分，但会拉低核验覆盖率；覆盖率低于60% 不得授信。',
        items: { type: 'string', description: '维度名，例如 credit_record 或 sanctions' },
      },
    },
    ['agent_type'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => text(
      [
        '## 经销商/代理商评估',
        '',
        `**主体类型**：${v.request.agent_type}${v.request.country ? ' · ' + v.request.country : ''}`,
        `**综合得分**：${v.score} / 100　**分级**：${v.tier}　**核验覆盖率**：${v.verification_coverage_pct}%`,
        `> ${v.tier_note}`,
        v.veto_triggered.length ? `\n**⛔ 一票否决已触发**：${v.veto_triggered.join('；')}` : '',
        '',
        `**主体类型提示**：${v.agent_type_note}`,
        '',
        '### 三维度明细',
        mdTable(['维度', '项目', '得分', '权重', '已核验', '5 分标准'], v.dimensions.map((r) => [r.dim, r.label, r.score ?? '未评', r.weight, r.verified ? '是' : '否', r.criterion])),
        '',
        '### 授信建议',
        mdTable(['项', '值'], [
          ['分级', v.credit_recommendation.tier],
          ['最大敞口（单位）', v.credit_recommendation.max_open_account_units],
          ['依据', v.credit_recommendation.basis],
          ['说明', v.credit_recommendation.note],
        ]),
        `**授信前置条件**：${v.credit_recommendation.required_before_credit.join(' · ')}`,
        '',
        '### 风险清单',
        v.risks.length ? v.risks.map((r) => `- ⚠️ ${r}`).join('\n') : '- 暂无规则化风险项（仍须完成核验）',
        '',
        '### 待核验项',
        v.pending_verification.length ? v.pending_verification.map((p) => `- ${p}`).join('\n') : '- 无',
        '',
        '### 下一步动作',
        v.next_actions.map((a, i) => `${i + 1}. ${a}`).join('\n'),
        '',
        '### 公开可查的核验渠道',
        mdTable(['地区', '核验项', '来源', '备注'], v.verification_channels.map((c) => [c.region, c.item, c.source, c.note])),
        '',
        '---',
        '',
        '**假设与来源**',
        mdTable(['假设', '来源'], v.assumptions.map((a) => [a.item, a.source])),
        '',
        '**风险与待确认项**',
        v.warnings.map((w) => `- ⚠️ ${w}`).join('\n'),
      ].filter(Boolean).join('\n'),
    ),
  },
  async execute(args) {
    return evaluateDistributor(args);
  },
};
/* --------------------------------------------------------------------------
 * 工具 21：统计分析（数学家 + 可靠性工程视角）
 * ------------------------------------------------------------------------ */

const toolMarketStats = {
  name: 'mackorn_market_stats',
  description:
    '(Multilingual triggers / 多语言触发词: statistics, market concentration, HHI, Gini, regression, residual analysis, Weibull, reliability, B10 life, liner life distribution, 统计分析, 市场集中度, 回归分析, 残差, 威布尔, 可靠性, 衬板寿命分布) MACKORN 统计分析工具：①描述统计（均值/中位数/CV/偏度/峰度/分位数）②市场集中度（CR/HHI/Gini）③线性回归与残差分析（找"排名看不出来"的机会）④威布尔拟合（用现场换衬板记录预测 B10 寿命）⑤增长率基数效应修正（小基数高增长是噪声）。用于回答"这个市场是集中还是分散""哪些国家的增长可信""衬板多久该换""哪些国家的备件市场被低估"。' + ' 【适用边界】本工具只做【统计计算】，不解读市场含义；市场判断请用 market_intel。',
  parameters: obj(
    {
      mode: S.stringEnum('分析模式。', ['describe', 'concentration', 'residual', 'weibull', 'growth']),
      values: S.arrayOfNumbers('describe / concentration 模式：数值数组（如各国进口额）。'),
      pairs_json: S.string('residual 模式：JSON 字符串，形如 "[[整机进口额, 零件进口额], ...]"，最少 3 组。例："[[347.2,20.8],[268.5,136.8],[207.6,562.1]]"'),
      lives: S.arrayOfNumbers('weibull 模式：现场换衬板记录（寿命小时），至少 3 个，建议 ≥5。'),
      items_json: S.string('growth 模式：JSON 字符串，形如 "[{\\"name\\":\\"哈萨克\\",\\"base\\":6.5,\\"latest\\":268.5}, ...]"。base = 基期值，latest = 最新值。'),
    },
    ['mode'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_args, v) => {
      const L = ['## 统计分析', ''];
      if (v.mode === 'describe' && v.result) {
        const r = v.result;
        L.push(`**样本量** n = ${r.n}`, '', mdTable(['指标', '值'], [
          ['均值', r.mean], ['中位数', r.median], ['标准差', r.sd], ['变异系数 CV', r.cv],
          ['偏度', r.skewness], ['峰度', r.excess_kurtosis], ['最小 / 最大', `${r.min} / ${r.max}`],
          ['P10 / P25 / P50 / P75 / P90 / P99', `${r.percentiles.p10} / ${r.percentiles.p25} / ${r.percentiles.p50} / ${r.percentiles.p75} / ${r.percentiles.p90} / ${r.percentiles.p99}`],
          ['均值÷中位数', r.mean_over_median],
        ]), '', '**判读**', ...r.interpretation.map((x) => `- ${x}`));
      } else if (v.mode === 'concentration' && v.result) {
        const r = v.result;
        L.push(`**样本量** n = ${r.n}　**总额** ${r.total}`, '', mdTable(['指标', '值'], [
          ['CR1 / CR3 / CR5', `${r.cr1}% / ${r.cr3}% / ${r.cr5}%`],
          ['CR10 / CR20', `${r.cr10}% / ${r.cr20}%`],
          ['HHI 赫芬达尔指数', r.hhi], ['HHI 分档', r.hhi_band], ['Gini 基尼系数', r.gini],
        ]), '', '**判读**', ...r.interpretation.map((x) => `- ${x}`));
      } else if (v.mode === 'residual' && v.result) {
        const r = v.result;
        L.push(`**样本量** n = ${r.n}　**回归** y = ${r.intercept} + ${r.slope}·x`, '',
          `**Pearson r** = ${r.pearson_r}　**R²** = ${r.r_squared}　**未解释方差** ${r.unexplained_pct}%`, '',
          '### 残差最大的样本（机会所在）',
          mdTable(['x', 'y 实际', 'y 预测', '残差'], r.top_residuals.map((d) => [d.x, d.y, d.predicted, d.residual])),
          '', '**判读**', ...r.interpretation.map((x) => `- ${x}`));
      } else if (v.mode === 'weibull' && v.result) {
        const r = v.result;
        if (!r.ok) L.push(`无法拟合：${r.reason}`);
        else {
          L.push(`**样本量** n = ${r.n}`, '',
            mdTable(['参数', '值', '含义'], [
              ['β 形状参数', r.beta, r.beta_meaning],
              ['η 尺度参数 (h)', r.eta, '特征寿命（63.2% 失效）'],
              ['R² 拟合优度', r.r_squared, r.fit_quality],
              ['样本充足性', r.sample_adequacy, ''],
              ['B1 / B10 / B50 (h)', `${r.b_life.B1} / ${r.b_life.B10} / ${r.b_life.B50}`, 'B10 常用作备件计划基准'],
              ['平均寿命 (h)', r.mean_life, 'E[T] = η·Γ(1+1/β)'],
            ]), '', '**判读**', ...r.interpretation.map((x) => `- ${x}`), '',
            '**假设与来源**', mdTable(['假设', '来源'], r.assumptions.map((a) => [a.item, a.source])));
        }
      } else if (v.mode === 'growth' && v.result) {
        const r = v.result;
        L.push(`**P25 基数门槛** ${r.p25_threshold}　**可信** ${r.reliable_count} / **噪声** ${r.noisy_count}（共 ${r.total}）`, '',
          '### 可信的高增长（基数足够）',
          mdTable(['名称', '基期', '最新', '增长'], r.top_reliable.map((d) => [d.name, d.base, d.latest, `${(d.growth * 100).toFixed(0)}%`])),
          '', '### 基数效应（不可作为市场判断依据）',
          mdTable(['名称', '基期', '最新', '增长', '说明'], r.top_noisy.map((d) => [d.name, d.base, d.latest, `${(d.growth * 100).toFixed(0)}%`, d.note])),
          '', '**判读**', ...r.interpretation.map((x) => `- ${x}`));
      } else {
        L.push('无结果。请检查 mode 与对应输入。');
      }
      return text(L.join('\n'));
    },
  },
  async execute(args) {
    const mode = args.mode;
    let result = null;
    if (mode === 'describe') result = describe(args.values);
    else if (mode === 'concentration') result = concentration(args.values);
    else if (mode === 'residual') { let p = []; try { p = JSON.parse(args.pairs_json || '[]'); } catch { return { mode, result: null, assumptions: [], warnings: ['pairs_json 不是合法 JSON'] }; } result = residualAnalysis(p); }
    else if (mode === 'weibull') result = weibullFit(args.lives);
    else if (mode === 'growth') { let it = []; try { it = JSON.parse(args.items_json || '[]'); } catch { return { mode, result: null, assumptions: [], warnings: ['items_json 不是合法 JSON'] }; } result = growthWithBaseEffect(it); }
    return {
      mode, result,
      assumptions: [
        { item: '全部为纯函数统计计算，无第三方库', source: 'SELF' },
        { item: '威布尔用中位秩估计 + 最小二乘拟合（工程通行做法）', source: 'WEIBULL(1951)' },
        { item: '增长率基数效应门槛取样本 P25', source: 'MACKORN 统计口径' },
      ],
      warnings: [
        '统计结论是描述性/推断性的，不能替代现场实测与商务判断',
        '威布尔拟合需 ≥5 次同机型同腔型同矿石的更换记录才有参考价值',
        '小基数国家的增长率是基数效应，不得作为市场判断依据',
      ],
    };
  },
};
/* 知识库工具：材料提示 + 前置校验 + 对标案例（四库总入口） */
const toolKnowledge = {
  name: 'mackorn_knowledge',
  description:
    '(Multilingual triggers / 多语言触发词: material properties, ore hardness, rock properties, Bond work index, abrasiveness, crusher case study, benchmark, lessons learned, mistake library, 矿石性质, 岩石硬度, 邦德功指数, 磨蚀性, 选型案例, 对标案例, 经验库, 错误库, 材料库, 案例库 | propiedades del material, dureza, índice de trabajo Bond, abrasividad, caso de selección | Gesteinseigenschaften, Härte, Bond-Arbeitsindex, Abrasivität, Auswahlfall | свойства материала, твёрдость, индекс Бонда, абразивность, пример подбора | propriétés du matériau, dureté, indice de Bond, abrasivité, cas de sélection | propriedades do material, dureza, índice de Bond, abrasividade, caso de seleção | 材料特性, 硬度, ボンド指数, 摩耗性, 選定事例 | materialegenskaper, hårdhet, Bond-arbetsindex, nötning | 材料特性, 硬度, 邦德指數, 磨蝕性, 選型案例 | خصائص المادة, الصلابة, مؤشر بوند, التأكل, حالة الاختيار)'
    + ' MACKORN 知识库总入口：① 岩石/矿石性质（14 种材料的 UCS / Bond Wi / 密度 / 莫氏硬度 / 磨蚀指数 / 含水率，带来源等级）② 选型提示（腔型 / 段数 / 衬板 / 风险告警）③ 经验库与错误库的判定状态（正判 / 模棱两可 / 已修复）④ 公开竞品选型案例对标（美卓 / 山特维克，仅作参照）。'
    + ' 用于回答：这个料好不好破、该配什么腔型、衬板要不要选耐磨的、别人怎么配的、你们踩过什么坑。' + ' 【适用边界】本工具查【材料性质/经验/错误/对标案例】；查机型参数请用 equipment_catalog。材料库未收录的矿石【不猜测】其性质。',
  parameters: obj(
    {
      ore: S.string('矿石/岩石名称（中文或英文，如 花岗岩 / granite / 玄武岩）。'),
      target_tph: S.number('目标处理量 t/h（可选，用于匹配对标案例）。'),
      section: S.stringEnum('只取某一节。', ['all', 'material', 'experience', 'cases', 'preflight'], { default: 'all' }),
    },
    [],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => {
      const L = [];
      L.push('## MACKORN 知识库查询');
      L.push('');
      const m = v.material_hints;
      if (m && m.found) {
        L.push('### 材料：' + m.material + '（' + (m.name_en || '') + '）');
        L.push('- 类别 ' + (m.group || '—') + '　硬度 **' + (m.hardness_grade || '—') + '**　磨蚀 **' + (m.wear_grade || '—') + '**　可碎性 ' + (m.crushability || '—'));
        const pr = m.properties || {};
        const fmt = (x) => (!x ? null : ((Array.isArray(x.value) ? x.value[0] + '–' + x.value[1] : x.value) + '（' + x.source + '）'));
        const rows = [
          ['抗压强度 MPa', fmt(pr.ucs_mpa)], ['Bond 功指数 kWh/t', fmt(pr.bond_wi_kwh_t)],
          ['真密度 t/m³', fmt(pr.density_t_m3)], ['堆积密度 t/m³', fmt(pr.bulk_density_t_m3)],
          ['莫氏硬度', fmt(pr.mohs)], ['磨蚀指数 AI', fmt(pr.abrasion_ai)], ['含水率 %', fmt(pr.moisture_pct)],
        ].filter((r) => r[1]);
        if (rows.length) L.push(mdTable(['性质', '取值（来源）'], rows));
        if (m.cavity_hint) L.push('- **腔型建议**：' + m.cavity_hint);
        if (m.stage_hint) L.push('- **段数建议**：' + m.stage_hint);
        if (m.notes) L.push('- 备注：' + m.notes);
        for (const w of (m.warnings || [])) L.push('> ⚠️ ' + w);
      } else if (m) {
        L.push('### 材料：未收录');
        L.push(m.note || '');
        L.push('已收录：' + (m.available_materials || []).join(' / '));
      }
      const r = v.reference_cases;
      if (r && r.matched && r.matched.length) {
        L.push('');
        L.push('### 公开对标案例（' + r.total_effective + ' 条有效记录中匹配 ' + r.matched.length + ' 条）');
        L.push(mdTable(['编号', '品牌', '机型', '产量 t/h', '物料', '国家', '置信度'],
          r.matched.map((x) => [x.id, x.brand || '—', x.model || '—', x.tph || '—', x.material || '—', x.country || '—', x.confidence])));
        L.push('> ' + (r.disclaimer || ''));
      }
      const g = v.guardrails;
      if (g && g.experience && g.experience.positive_count) {
        L.push('');
        L.push('### 经验与错误（判定状态原样透出）');
        L.push('- 已确认可用经验 **' + g.experience.positive_count + '** 条（正判）· 模棱两可 ' + g.experience.ambiguous_count + ' 条');
        L.push('- 已确认错误 **' + g.error.confirmed_count + '** 条（必须规避）· 已修复 ' + g.error.fixed_count + ' 条（保留防回归）· 模棱两可 ' + g.error.ambiguous_count + ' 条');
        for (const e of (g.error.must_avoid || []).slice(0, 5)) L.push('  - 🔴 ' + e.claim + (e.fix ? '\n    修法：' + e.fix : ''));
      }
      for (const w of (v.warnings || [])) L.push('> ⚠️ ' + w);
      L.push(assumptionBlock(v.assumptions, v.warnings));
      L.push(jsonBlock(v));
      return text(L.join('\n'));
    },
  },
  async execute(args) {
    const k = selectionKnowledge(args);
    const s = args.section || 'all';
    if (s === 'all') return k;
    if (s === 'material') return { libraries: k.libraries, material_hints: k.material_hints, warnings: k.warnings, assumptions: k.assumptions };
    if (s === 'experience') return { libraries: k.libraries, guardrails: k.guardrails, assumptions: k.assumptions };
    if (s === 'cases') return { libraries: k.libraries, reference_cases: k.reference_cases, warnings: k.warnings, assumptions: k.assumptions };
    if (s === 'preflight') return { libraries: k.libraries, preflight: k.preflight, guardrails: k.guardrails, assumptions: k.assumptions };
    return k;
  },
};

/* --------------------------------------------------------------------------
 * 磨矿选型（R107 · P2）—— 全矿山价值链第 3 段
 *
 * 用户目标：「磨矿（半自磨机，球磨机，分级机，旋流器）」
 *
 * 诚实边界：本工具【不含】厂商型号参数（如 MQY/MQS 球磨机型号表），
 *   只给「磨矿方式 + 功率量级 + 比能耗区间」，不足以直接下采购单。
 *   型号参数需 MACKORN 或厂家提供功率曲线与规格表。
 * -------------------------------------------------------------------------- */
const toolGrinding = {
  name: 'mackorn_grinding_selection',
  description:
    '(Multilingual triggers / 多语言触发词: grinding, SAG, semi-autogenous, ball mill, rod mill, HPGR, high pressure grinding rolls, classifier, spiral classifier, hydrocyclone, cyclone, grinding circuit, P80, specific energy, Bond work index, 磨矿, 半自磨, 球磨, 棒磨, 高压辊磨, 分级机, 螺旋分级机, 水力旋流器, 旋流器, 磨矿流程, 磨矿细度, 比能耗, 邦德功指数 | molienda, molino de bolas, SAG, ciclón, clasificador | Mahlung, Kugelmühle, SAG-Mühle, Zyklon, Klassierer | измельчение, шаровая мельница, ПСИ, гидроциклон, классификатор | broyage, broyeur à boulets, SAG, cyclone, classificateur | moagem, moinho de bolas, SAG, ciclone, classificador | 粉砕, ボールミル, SAGミル, サイクロン, 分級機 | malning, kul kvarn, SAG-kvarn, cyklon | formaling, kuglemølle, SAG-mølle, cyklon | hienonnus, kuulamylly, SAG-mylly, sykloni | طحن, مطحنة كروية, هيدروسيكلون, مصنف | penggilingan, ball mill, SAG, siklon, klasifikasi) '
    + 'MACKORN 磨矿选型工具（全价值链第 3 段）：按处理量 t/h + 给料 P80 + 目标产品 P80，选磨矿方式（半自磨 SAG / 球磨 / 高压辊磨 HPGR），给功率量级、比能耗区间、分级设备建议（螺旋分级机 / 水力旋流器），并主动拦截越界（球磨给料 >25mm 拒绝、Bond 公式用于半自磨拒绝、目标 <20μm 告警）。'
    + ' 用于回答：这条线磨矿段该配什么磨机、多大功率、磨到多细、配什么分级设备。'
    + ' 【适用边界】本工具只管【磨矿与分级】；破碎段请用 cone_selection / plant_design。磨矿数据取自公开文献典型区间（S3/S5），【不含厂商型号参数】，正式方案须经 MACKORN 技术复核。半自磨高频波动需专门试验，本工具只给量级。',
  parameters: obj(
    {
      target_tph: S.number('处理量 t/h（必填）。'),
      feed_p80_mm: S.number('磨矿给料 P80 mm（球磨典型 ≤25mm；半自磨 ≤350mm）。'),
      product_p80_mm: S.number('目标产品 P80 mm（如 0.075 = 75μm）。'),
      ore: S.string('矿石名称或硬度备注（如 铁矿石 f=12-14）。'),
      closed_circuit: S.boolean('是否闭路（默认 true；闭路需配分级设备）。'),
      mode: S.stringEnum('只查目录或只做选型。', ['select', 'catalog'], { default: 'select' }),
    },
    ['target_tph'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => {
      if (v.catalog) {
        const L = ['## 磨矿设备目录', ''];
        L.push('### 磨矿方式');
        L.push('| 方式 | 给料 mm | 产品 P80 mm | 比能耗 kWh/t | 适用 |');
        L.push('|:---|:---|:---|:---|:---|');
        for (const m of (v.catalog.methods || [])) {
          L.push('| ' + m.method + ' | ' + ((m.feed_size_mm || []).join('–') || '—') + ' | ' + ((m.product_p80_mm || []).join('–') || '—') + ' | ' + ((m.specific_energy_kwh_t || []).join('–') || '—') + ' | ' + String(m.application || '').slice(0, 40) + ' |');
        }
        L.push('');
        L.push('### 分级设备');
        L.push('| 设备 | 分级粒度 mm | 适用 |');
        L.push('|:---|:---|:---|');
        for (const x of (v.catalog.classifiers || [])) {
          L.push('| ' + x.classifier + ' | ' + ((x.cut_size_mm || []).join('–') || '—') + ' | ' + String(x.application || '').slice(0, 40) + ' |');
        }
        L.push('');
        L.push('> ' + (v.catalog.basis || ''));
        L.push('>');
        L.push('> ⚠️ 已知缺口：' + ((v.catalog.known_gaps || []).slice(0, 3).join('；')));
        return text(L.join('\n'));
      }
      const L = [];
      L.push('## 磨矿选型结论');
      L.push('');
      if (v.rejections && v.rejections.length) {
        L.push('### ❌ 拒绝计算');
        for (const r of v.rejections) { L.push('- **' + r.rule + '**：' + r.detail); L.push('  → ' + r.action); }
        L.push('');
        return text(L.join('\n'));
      }
      L.push('**推荐：' + (v.recommended_method || '—') + '**');
      L.push('');
      if (v.installed_power_kw_range) L.push('- 装机功率量级：' + v.installed_power_kw_range[0] + '–' + v.installed_power_kw_range[1] + ' kW');
      if (v.specific_energy_kwh_t) L.push('- 比能耗区间：' + v.specific_energy_kwh_t.join('–') + ' kWh/t（' + (v.candidates?.[0]?.specific_energy_source || 'S3') + '）');
      if (v.classifier) L.push('- 分级设备：**' + v.classifier.recommended + '** —— ' + v.classifier.reason);
      L.push('');
      if (v.candidates && v.candidates.length) {
        L.push('### 候选排序');
        L.push('| 评分 | 方式 | 功率量级 kW | 比能耗 kWh/t | 适用 |');
        L.push('|:---|:---|:---|:---|:---|');
        for (const x of v.candidates) {
          L.push('| ' + x.match_score + ' | ' + x.method + ' | ' + ((x.installed_power_kw_range || []).join('–') || '—') + ' | ' + ((x.specific_energy_kwh_t || []).join('–') || '—') + ' | ' + String(x.reason || '').slice(0, 40) + ' |');
        }
        L.push('');
      }
      if (v.warnings && v.warnings.length) {
        L.push('### ⚠️ 告警');
        for (const w of v.warnings) L.push('- ' + w);
        L.push('');
      }
      if (v.equipment_model_note) {
        L.push('### 型号建议');
        L.push('**' + (v.equipment_model_recommendation === null ? 'null（本版不含厂商型号）' : v.equipment_model_recommendation) + '**');
        L.push('');
        L.push('> ' + v.equipment_model_note);
        L.push('');
      }
      return text(L.join('\n'));
    },
  },
  async execute(args) {
    const mode = args.mode || 'select';
    if (mode === 'catalog') return { catalog: grindingCatalog() };
    return selectGrinding({
      targetTph: args.target_tph,
      feedP80Mm: args.feed_p80_mm,
      productP80Mm: args.product_p80_mm,
      ore: args.ore,
      closedCircuit: args.closed_circuit !== false,
    });
  },
};
/* --------------------------------------------------------------------------
 * 选矿方法推荐（R108 · P3）—— 全矿山价值链第 4 段
 *
 * 用户目标：「选矿（浮选、重选、光电选（激光、图像））」
 *
 * 诚实边界：不含药剂制度（企业机密）、不含设备型号、不含经济指标。
 *   光电选的抛废率必须做工业试验，本工具只给经验区间并强制告警。
 * -------------------------------------------------------------------------- */
const toolBeneficiation = {
  name: 'mackorn_beneficiation_selection',
  description:
    '(Multilingual triggers / 多语言触发词: beneficiation, mineral processing, flotation, gravity separation, ore sorting, sensor-based sorting, magnetic separation, recovery, concentrate grade, liberation, 选矿, 选别, 浮选, 重选, 光电选, 光选, 激光选矿, 图像选矿, 磁选, 回收率, 精矿品位, 解离粒度, 矿泥 | beneficio, flotación, gravedad, separación magnética | Aufbereitung, Flotation, Schwerkraftscheidung, Magnetscheidung | обогащение, флотация, гравитация, магнитная сепарация | enrichissement, flottation, gravité, séparation magnétique | beneficiamento, flotação, gravidade, separação magnética | 選鉱, 浮選, 比重選別, 磁選 | anrikning, flotation, gravimetrisk | oparbejdning, flotation, gravitation | rikastus, vaahdotus, painovoima | معالجة المعادن, تعويم, فصل بالجاذبية | pengolahan mineral, flotasi, gravitasi, pemisahan magnetik) '
    + 'MACKORN 选矿方法推荐工具（全价值链第 4 段）：按矿石类型/目标矿物/解离粒度，推荐选矿方法（浮选 / 重选 / 光电选 / 磁选），给适用条件、预期回收率区间、能耗区间、关键限制，并主动拦截：解离粒度过细（<10μm）或过粗（>200μm）告警、矿泥 >15% 强制提示脱泥、光电选必须做工业试验的强制告警。'
    + ' 用于回答：这个矿该用什么选别方法、预期回收率多少、有什么坑。'
    + ' 【适用边界】本工具只管【选矿方法选择】；磨矿请用 grinding_selection，破碎请用 cone_selection / plant_design。不含药剂制度、设备型号、经济指标；实际方案必须做选矿试验。',
  parameters: obj(
    {
      ore: S.string('矿石类型/名称（如 硫化铜矿石 / 磁铁矿 / 金矿 / 石灰石）。'),
      target_mineral: S.string('目标矿物或元素（如 铜 / 金 / 铁 / 钨）。'),
      liberation_um: S.number('解离粒度 μm（磨到多细才解离）。低于 10μm 或高于 200μm 会告警。'),
      feed_p80_mm: S.number('磨矿给料 P80 mm（用于判断是否需要预选抛废）。'),
      target_tph: S.number('处理量 t/h。'),
      slime_pct: S.number('矿泥（-10μm）占比 %。>15% 会强制提示脱泥。'),
      mode: S.stringEnum('只查目录或只做推荐。', ['recommend', 'catalog'], { default: 'recommend' }),
    },
    [],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => {
      if (v.catalog) {
        const L = ['## 选矿方法目录', ''];
        L.push('| 方法 | 给料粒度 μm | 回收率 % | 能耗 kWh/t | 原理 |');
        L.push('|:---|:---|:---|:---|:---|');
        for (const m of (v.catalog.methods || [])) {
          L.push('| ' + m.method + ' | ' + ((m.feed_size_um || []).join('–') || '—') + ' | ' + ((m.typical_recovery_pct || []).join('–') || '—') + ' | ' + ((m.energy_kwh_t || []).join('–') || '—') + ' | ' + String(m.principle || '').slice(0, 30) + ' |');
        }
        L.push('');
        L.push('### 方法选择规则');
        for (const r of (v.catalog.selection_rules || [])) L.push('- **' + r.condition + '** → ' + r.recommend + '（' + r.why + '）');
        L.push('');
        L.push('> ' + (v.catalog.basis || ''));
        L.push('>');
        L.push('> ⚠️ 已知缺口：' + ((v.catalog.known_gaps || []).slice(0, 3).join('；')));
        return text(L.join('\n'));
      }
      const L = [];
      L.push('## 选矿方法推荐');
      L.push('');
      if (v.error) {
        L.push('### ❌ ' + (v.message || v.error));
        for (const w of (v.warnings || [])) L.push('- ' + w);
        return text(L.join('\n'));
      }
      L.push('**首选：' + (v.primary_method || '—') + '**');
      if (v.recovery_pct_range) L.push('- 预期回收率区间：' + v.recovery_pct_range.join('–') + '%（S3 文献典型值，非本矿实测）');
      L.push('');
      if (v.recommended_methods && v.recommended_methods.length) {
        L.push('### 候选方法');
        for (const m of v.recommended_methods) {
          L.push('#### ' + m.method);
          if (m.why) L.push('- **为什么**：' + m.why);
          if (m.feed_size_um) L.push('- 适用粒度：' + m.feed_size_um.join('–') + ' μm');
          if (m.typical_recovery_pct) L.push('- 回收率区间：' + m.typical_recovery_pct.join('–') + '%');
          if (m.energy_kwh_t) L.push('- 能耗：' + m.energy_kwh_t.join('–') + ' kWh/t');
          if (m.sensors) L.push('- 传感器选项：' + m.sensors.map((s) => s.type + '（' + s.use + '）').join('；'));
          if (m.honest_note) L.push('- ⚠️ ' + m.honest_note);
          if (m.limitations && m.limitations.length) { L.push('- 限制：'); for (const x of m.limitations) L.push('  - ' + x); }
          L.push('');
        }
      }
      if (v.warnings && v.warnings.length) {
        L.push('### ⚠️ 告警');
        for (const w of v.warnings) L.push('- ' + w);
        L.push('');
      }
      L.push('### 指标定义');
      for (const d of (v.metric_definitions || [])) L.push('- **' + d.name + '**' + (d.formula ? '：`' + d.formula + '`' : '') + (d.note ? ' —— ' + d.note : ''));
      L.push('');
      return text(L.join('\n'));
    },
  },
  async execute(args) {
    const mode = args.mode || 'recommend';
    if (mode === 'catalog') return { catalog: beneficiationCatalog() };
    return recommendBeneficiation({
      ore: args.ore,
      targetMineral: args.target_mineral,
      liberationUm: args.liberation_um,
      feedP80Mm: args.feed_p80_mm,
      targetTph: args.target_tph,
      slimePct: args.slime_pct,
    });
  },
};
/* --------------------------------------------------------------------------
 * 自动化与模型选矿方案（R112 · P5）—— 全价值链第 5 段
 *
 * 用户目标：「自动化模型选矿」「擅长电气驱动，自动化程序」
 *
 * 诚实边界：不含 PLC/DCS 品牌组态、不含 PID 整定值（必须现场调试）、
 *   不含仪表型号量程、不含电气单线图、不含报价。
 * -------------------------------------------------------------------------- */
const toolAutomation = {
  name: 'mackorn_automation_design',
  description:
    '(Multilingual triggers / 多语言触发词: automation, PLC, DCS, SCADA, HMI, model predictive control, MPC, expert system, soft sensor, digital twin, instrumentation, interlock, variable frequency drive, VFD, soft starter, electrical drive, 自动化, 模型选矿, 先进控制, 专家系统, 软测量, 数字孪生, 仪表, 联锁, 变频器, 软启动, 电气驱动, 配电 | automatización, PLC, SCADA, control predictivo | Automatisierung, SPS, Leittechnik, prädiktive Regelung | автоматизация, ПЛК, АСУ ТП, предиктивное управление | automatisation, API, supervision, commande prédictive | automação, CLP, supervisão, controle preditivo | 自動化, PLC, 監視制御, モデル予測制御 | automation, PLC, övervakning | automatisering, PLC, overvågning | automaatio, PLC, valvonta | أتمتة, PLC, تحكم تنبؤي | otomasi, PLC, SCADA, kontrol prediktif) '
    + 'MACKORN 自动化与模型选矿方案工具（全价值链第 5 段）：按工序与处理量，给自动化分层建议（L0 现场层 / L1 PLC / L2 DCS-SCADA / L3 先进控制）、关键仪表清单（破碎/磨矿/选矿分列，标注哪些是关键）、控制回路清单（给料量/CSS/磨机负荷/浓度/旋流器压力/联锁）、电气驱动要点（高压vs低压、变频适用、软启动、过铁硬线联锁、谐波）。'
    + ' ★ 并主动拦截「没基础就上先进控制」：无 PLC / 无 SCADA / 无在线分析 / 无专职维护人员时，明确判定【不具备上 L3 条件】并说明原因。'
    + ' 用于回答：这条线该配几层自动化、要装哪些仪表、有什么控制回路、能不能上模型选矿。'
    + ' 【适用边界】本工具只管【自动化架构与仪表清单】；不含品牌组态、PID 整定值、仪表型号、电气单线图，正式设计须由有资质设计院出图 + 现场调试。',
  parameters: obj(
    {
      section: S.stringEnum('工序。', ['破碎', '磨矿', '选矿', '全部'], { default: '全部' }),
      target_tph: S.number('处理量 t/h。'),
      has_plc: S.boolean('是否已有 PLC（L1）。'),
      has_scada: S.boolean('是否已有 SCADA/DCS（L2）。'),
      has_online_analyzer: S.boolean('是否有在线品位/粒度分析仪表。'),
      has_dedicated_staff: S.boolean('是否有专职维护人员。'),
      mode: S.stringEnum('只查目录或只做推荐。', ['recommend', 'catalog'], { default: 'recommend' }),
    },
    [],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => {
      if (v.catalog) {
        const L = ['## 自动化知识目录', ''];
        L.push('### 四层架构');
        for (const l of (v.catalog.layers || [])) L.push('- **' + l.level + ' ' + l.name + '**：' + String(l.scope || '').slice(0, 60));
        L.push('');
        L.push('### 控制回路（' + ((v.catalog.control_loops || []).length) + ' 个）');
        for (const c of (v.catalog.control_loops || [])) L.push('- **' + c.id + ' ' + c.name + '**：' + String(c.purpose || '').slice(0, 40));
        L.push('');
        L.push('### 先进控制就绪条件（' + ((v.catalog.advanced_control_readiness || []).length) + ' 条）');
        for (const r of (v.catalog.advanced_control_readiness || [])) L.push('- **' + r.id + '** ' + r.requirement);
        L.push('');
        L.push('> ' + (v.catalog.basis || ''));
        L.push('>');
        L.push('> ⚠️ 已知缺口：' + ((v.catalog.known_gaps || []).slice(0, 3).join('；')));
        return text(L.join('\n'));
      }
      const L = [];
      L.push('## 自动化与模型选矿方案');
      L.push('');
      if (v.error) {
        L.push('### ❌ ' + (v.message || v.error));
        for (const w of (v.warnings || [])) L.push('- ' + w);
        return text(L.join('\n'));
      }
      if (v.recommended_layers && v.recommended_layers.length) {
        L.push('### 推荐自动化分层');
        L.push('| 层 | 建议 | 理由 |');
        L.push('|:---|:---|:---|');
        for (const x of v.recommended_layers) L.push('| ' + x.level + ' | **' + x.recommend + '** | ' + x.reason + ' |');
        L.push('');
      }
      if (v.advanced_control_verdict) {
        const av = v.advanced_control_verdict;
        L.push('### 先进控制（L3 模型选矿）判定');
        L.push('**' + (av.go ? '✅ 可评估上 L3' : '❌ 暂不具备条件') + '** —— ' + av.reason);
        L.push('');
      }
      if (v.instruments && Object.keys(v.instruments).length) {
        L.push('### 关键仪表清单');
        for (const [secName, list] of Object.entries(v.instruments)) {
          L.push('#### ' + secName);
          L.push('| 仪表 | 类型 | 用途 | 重要性 |');
          L.push('|:---|:---|:---|:---|');
          for (const i of list) L.push('| ' + i.name + ' | ' + i.type + ' | ' + i.purpose + ' | ' + (i.critical ? '**关键**' : '建议') + ' |');
          L.push('');
        }
      }
      if (v.control_loops && v.control_loops.length) {
        L.push('### 控制回路（' + v.control_loops.length + ' 个）');
        for (const c of v.control_loops) {
          L.push('- **' + c.id + ' ' + c.name + '**：' + c.purpose);
          if (c.risk) L.push('  - ⚠️ ' + c.risk);
        }
        L.push('');
      }
      if (v.drive_notes && v.drive_notes.length) {
        L.push('### 电气驱动要点');
        for (const d of v.drive_notes) L.push('- **' + d.item + '**：' + d.rule + (d.why ? '（' + d.why + '）' : ''));
        L.push('');
      }
      if (v.warnings && v.warnings.length) {
        L.push('### ⚠️ 告警');
        for (const w of v.warnings) L.push('- ' + w);
        L.push('');
      }
      return text(L.join('\n'));
    },
  },
  async execute(args) {
    const mode = args.mode || 'recommend';
    if (mode === 'catalog') return { catalog: automationCatalog() };
    return recommendAutomation({
      section: args.section,
      targetTph: args.target_tph,
      hasPlc: args.has_plc === true,
      hasScada: args.has_scada === true,
      hasOnlineAnalyzer: args.has_online_analyzer === true,
      hasDedicatedStaff: args.has_dedicated_staff === true,
    });
  },
};
/* --------------------------------------------------------------------------
 * 采矿与破碎接口（R115 · P4）—— 全价值链第 1 段
 *  *
 *  * 用户目标：采矿（开采和爆破，剥离，短倒（短驳））
 *  *
 *  * 诚实边界：不含爆破设计与审批（需民爆资质）、不含开采设计（需资质）、
 *  *   岩石系数 A 必须现场标定；Kuz-Ram 为经验模型误差 ±20-30%。
 * -------------------------------------------------------------------------- */
const toolMining = {
  name: 'mackorn_mining_interface',
  description:
    '(Multilingual triggers / 多语言触发词: mining, blasting, drilling, fragmentation, Kuz-Ram, stripping ratio, overburden, haulage, haul truck, loading, excavation, open pit, 采矿, 爆破, 钻孔, 炸药单耗, 块度分布, 爆破块度, 剥离, 剥采比, 覆盖层, 铲装, 短倒, 短驳, 运输, 矿卡, 露天开采 | minería, voladura, fragmentación | Bergbau, Sprengstoff, Fragmentierung | горное дело, взрывные работы | exploitation minière, abattage | mineração, detonação | 採鉱, 発破 | gruvdrift, sprängning | minedrift, sprængning | louhinta, räjäytys | التعدين, التفجير | penambangan, peledakan) MACKORN 采矿与破碎接口工具（全价值链第 1 段）：① 采矿工序链（剥离 / 钻孔爆破 / 铲装 / 短倒短驳）与关键指标 ② Kuz-Ram 爆破块度预测（给 A/V/Q 算爆堆 P50/P80/P90） ③ 爆破块度对粗碎选型的影响（最关键接口） ④ 剥采比要点 ⑤ 运输能力校核（破碎机吃不饱最常见原因是运输跟不上，不是破碎机小）。并主动拦截：含泥/黏土夹层必须配预筛分除土、剥采比过高需核算经济性、原矿块度过大需二次破碎。用于回答：这个矿爆破出来多大块、对破碎有什么影响、运输要配多少。 【适用边界】本工具只管采矿与破碎的接口关系；不含爆破设计（需民爆资质）、不含开采设计。Kuz-Ram 经验模型误差 ±20-30%，岩石系数 A 必须现场标定不能照搬。',
  parameters: obj(
    {
      target_tph: S.number('下游处理量 t/h。'),
      max_feed_mm: S.number('原矿最大块度 mm。'),
      rock_type: S.string('岩石类型（如 花岗岩 / 石灰石）。'),
      stripping_ratio: S.number('剥采比（剥离量/采矿量）。'),
      haul_km: S.number('运距 km（短倒/短驳）。'),
      muddy: S.boolean('是否含泥/黏土夹层。'),
      blast_A: S.number('Kuz-Ram 岩石系数 A（中硬 7 / 硬 10 / 非常硬 13）——必须现场标定。'),
      blast_V: S.number('Kuz-Ram 每孔爆破体积 m³。'),
      blast_Q: S.number('Kuz-Ram 单孔装药量 kg。'),
      mode: S.stringEnum('模式。', ['recommend', 'kuzram', 'catalog'], { default: 'recommend' }),
    },
    [],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => {
      if (v.catalog) {
        const out = ['## 采矿知识目录', ''];
        out.push('### 工序链');
        for (const s of (v.catalog.stages || [])) out.push('- **' + s.id + ' ' + s.name + '**：' + String(s.scope || '').slice(0, 50));
        out.push('');
        const bf = v.catalog.blast_fragmentation;
        if (bf) {
          out.push('### 爆破块度模型');
          out.push('- 模型：' + bf.model);
          out.push('- 公式：`' + bf.formula + '`');
          out.push('- 【警告】' + bf.honest_note);
          out.push('');
        }
        out.push('> ' + (v.catalog.basis || ''));
        out.push('>');
        out.push('> 已知缺口：' + ((v.catalog.known_gaps || []).slice(0, 3).join('；')));
        return text(out.join('\n'));
      }
      if (v.kuzram) {
        const k = v.kuzram;
        const out = ['## Kuz-Ram 爆破块度预测', ''];
        out.push('输入：A=' + k.inputs.A + ' · V=' + k.inputs.V + ' m3 · Q=' + k.inputs.Q + ' kg · E=' + k.inputs.E);
        out.push('');
        out.push('| 指标 | 值 |');
        out.push('|:---|:---|');
        out.push('| X50（中值块度）| **' + k.x50_cm + ' cm** |');
        out.push('| P20 | ' + k.percentiles_cm.p20 + ' cm |');
        out.push('| P80 | **' + k.percentiles_cm.p80 + ' cm** |');
        out.push('| P90 | ' + k.percentiles_cm.p90 + ' cm |');
        out.push('');
        out.push('> 【警告】' + k.note);
        return text(out.join('\n'));
      }
      const out = [];
      out.push('## 采矿与破碎接口分析');
      out.push('');
      if (v.error) {
        out.push('### 无法计算：' + (v.message || v.error));
        for (const w of (v.warnings || [])) out.push('- ' + w);
        return text(out.join('\n'));
      }
      if (v.crusher_interface && v.crusher_interface.length) {
        out.push('### 与破碎段的接口（最关键）');
        for (const x of v.crusher_interface) out.push('- [' + x.level + '] ' + x.msg);
        out.push('');
      }
      if (v.haulage && v.haulage.length) {
        out.push('### 运输校核');
        for (const h of v.haulage) {
          out.push('- ' + h.rule);
          if (h.required_tph) out.push('  - 需要运力 >= ' + h.required_tph + ' t/h');
          if (h.why) out.push('  - ' + h.why);
        }
        out.push('');
      }
      if (v.stages && v.stages.length) {
        out.push('### 采矿工序链');
        out.push('| 工序 | 范围 | 关键指标 |');
        out.push('|:---|:---|:---|');
        for (const s of v.stages) out.push('| ' + s.name + ' | ' + String(s.scope || '').slice(0, 30) + ' | ' + (s.key_metrics || []).join('、') + ' |');
        out.push('');
      }
      if (v.warnings && v.warnings.length) {
        out.push('### 告警');
        for (const w of v.warnings) out.push('- ' + w);
        out.push('');
      }
      return text(out.join('\n'));
    },
  },
  async execute(args) {
    const mode = args.mode || 'recommend';
    if (mode === 'catalog') return { catalog: miningCatalog() };
    if (mode === 'kuzram') {
      const k = kuzRam({ A: args.blast_A ?? 10, V: args.blast_V, Q: args.blast_Q });
      if (!k) return { error: 'missing_required', message: 'Kuz-Ram 需要 blast_V 与 blast_Q', warnings: ['缺少爆破参数，无法计算块度'] };
      return { kuzram: k };
    }
    return recommendMining({
      targetTph: args.target_tph,
      maxFeedMm: args.max_feed_mm,
      rockType: args.rock_type,
      strippingRatio: args.stripping_ratio,
      haulKm: args.haul_km,
      muddy: args.muddy === true,
    });
  },
};
/* --------------------------------------------------------------------------
 * 整线贯通（R118 · P6）—— 五段一次串完
 *
 * 用户目标：以破碎设备为基础，把矿山设备、选矿设备在 AI 加持下串起来
 * -------------------------------------------------------------------------- */
const toolFullChain = {
  name: 'mackorn_full_chain',
  description:
    '(Multilingual triggers / 多语言触发词: full chain, end to end, complete plant, flowsheet, mine to concentrate, whole process, 整线, 全流程, 端到端, 全链条, 从采矿到精矿, 矿山全流程, 一体化方案 | cadena completa, proceso completo | Gesamtprozess, Anlagenkette | полная цепочка, весь процесс | chaîne complète, procédé complet | cadeia completa, processo completo | 全体フロー, 全プロセス | hela kedjan, hela processen | hele kæden, hele processen | koko ketju, koko prosessi | السلسلة الكاملة | rantai penuh, proses lengkap) MACKORN 整线贯通工具（P6）：一次调用从【原矿/爆破产物】一路算到【精矿指标】，串起来五段：采矿（爆破块度）→ 粗碎（颚破/旋回）→ 中碎（圆锥破）→ 细碎（圆锥破）→ 磨矿 → 选矿 → 自动化。每段输出产品粒度、选型结果、来源等级（S1 厂商 / S3-S5 文献 / ENGINEERING-RANGE 估算），并明确标注【整线可信度受最弱环节限制】。主动拦截：细碎台数 >8 台时告警台数爆炸（通常说明目标粒度过细或机型选小）；粗碎段无独立选型引擎（只做工程估算）。用于回答：一条 X t/h 的线从采矿到精矿该怎么配、每段出什么粒度、哪一段最不可靠。 【适用边界】这是【量级贯通】不是施工图设计。破碎段可信度高（S1），磨矿/选矿/采矿是文献区间（S3-S5），粗碎是工程估算。段间未考虑循环负荷放大，未做全局最优组合优化。',
  parameters: obj(
    {
      target_tph: S.number('目标成品处理量 t/h（必填）。'),
      max_feed_mm: S.number('原矿最大块度 mm（默认 800）。'),
      target_product_mm: S.number('最终产品粒度 mm（默认 20）。'),
      ore: S.string('矿石类型（如 花岗岩 / 铜矿石）。'),
      to_beneficiation: S.boolean('是否含磨矿+选矿段（金属矿山）。'),
      liberation_um: S.number('解离粒度 μm（选矿段用）。'),
      muddy: S.boolean('原矿是否含泥/黏土夹层。'),
      has_plc: S.boolean('是否已有 PLC。'),
      has_scada: S.boolean('是否已有 SCADA/DCS。'),
      has_online_analyzer: S.boolean('是否有在线品位/粒度分析。'),
      has_dedicated_staff: S.boolean('是否有专职维护人员。'),
    },
    ['target_tph'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => {
      const out = [];
      out.push('## 整线贯通方案');
      out.push('');
      if (v.error) {
        out.push('### 无法计算：' + (v.message || v.error));
        for (const w of (v.warnings || [])) out.push('- ' + w);
        return text(out.join('\n'));
      }
      if (v.summary) {
        out.push('### 物料水线');
        out.push('**' + v.summary.stone_flow_note + '**');
        out.push('');
        out.push('### 可信度（按最弱环节）');
        out.push('最弱环节：**' + (v.summary.weakest_link || '—') + '**');
        out.push('');
        out.push('> ' + v.summary.credibility_rule);
        out.push('');
      }
      out.push('### 各段明细（' + ((v.stages || []).length) + ' 段）');
      out.push('| # | 工序 | 来源等级 | 关键输出 |');
      out.push('|:--|:---|:---|:---|');
      for (const s of (v.stages || [])) {
        const o = s.output || {};
        const bits = [];
        if (o.product_p80_mm_estimate != null) bits.push('产品 P80 ' + o.product_p80_mm_estimate + ' mm');
        if (o.selected_model) bits.push(o.selected_model + '/' + (o.selected_cavity || '') + ' · ' + (o.power_kw || '?') + 'kW · ' + (o.units || '?') + '台');
        if (o.required_feed_opening_mm) bits.push('进料口需 >= ' + o.required_feed_opening_mm + ' mm');
        if (o.recommended_method) bits.push(o.recommended_method);
        if (o.primary_method) bits.push(o.primary_method + (o.recovery_pct_range ? ' · 回收率 ' + o.recovery_pct_range.join('-') + '%' : ''));
        if (o.layers) bits.push(o.layers.join(' / '));
        out.push('| ' + s.stage + ' | ' + s.name + ' | ' + String(s.source_grade || '').slice(0, 28) + ' | ' + (bits.join('；') || '—') + ' |');
      }
      out.push('');
      if (v.warnings && v.warnings.length) {
        out.push('### 告警');
        for (const w of v.warnings) out.push('- ' + w);
        out.push('');
      }
      if (v.known_gaps && v.known_gaps.length) {
        out.push('### 已知缺口');
        for (const g of v.known_gaps) out.push('- ' + g);
        out.push('');
      }
      return text(out.join('\n'));
    },
  },
  async execute(args) {
    if (args.mode === 'ratios') return { stage_ratios: stageRatios() };
    return fullChain({
      targetTph: args.target_tph,
      maxFeedMm: args.max_feed_mm,
      targetProductMm: args.target_product_mm,
      ore: args.ore,
      toBeneficiation: args.to_beneficiation === true,
      liberationUm: args.liberation_um,
      muddy: args.muddy === true,
      hasPlc: args.has_plc === true,
      hasScada: args.has_scada === true,
      hasOnlineAnalyzer: args.has_online_analyzer === true,
      hasDedicatedStaff: args.has_dedicated_staff === true,
    });
  },
};
/* --------------------------------------------------------------------------
 * 颚破选型（R124）—— 补 2026-10-20 调用失败暴露的 P0 缺口
 *
 * 用户问「颚破+圆锥+筛子」时，旧插件只能答圆锥那三分之一，
 * 模型判定"用了更麻烦"就绕开插件。本工具补上粗碎段。
 *
 * 诚实边界：不含 MACKORN 颚破厂商参数（MACKORN 主要做圆锥破），
 *   数据来自公开文献 S3/S5，输出恒带 vendor_params_pending。
 * -------------------------------------------------------------------------- */
const toolJaw = {
  name: 'mackorn_jaw_selection',
  description:
    '(Multilingual triggers / 多语言触发词: jaw crusher, primary crusher, coarse crushing, jaw plate, feed opening, PE jaw, CJ jaw, CGE jaw, 颚破, 颚式破碎机, 粗碎, 颚板, 进料口, 一次破碎, 头破 | trituradora de mandíbula, trituración primaria | Backenbrecher, Primärbrecher | щековая дробилка, первичное дробление | concasseur à mâchoires, concassage primaire | britador de mandíbula, britagem primária | ジョークラッシャー, 一次破砕 | käftkross, primärkrossning | kæbeknuser, primær knusning | leukamurskain, esimurskaus | كسارة فكية, سحق أولي | jaw crusher, penghancuran primer) '
    + 'MACKORN 颚破选型工具（粗碎段）：按目标产能 t/h + 最大给料粒度，反推进料口需求（进料口 ≥ 最大给料 / 0.85），按工况打折（硬岩 ×0.85 / 大块 ×0.85 / 含水 ×0.85 / 含泥 ×0.75），输出档位机型 + 台数 + 功率 + 产品 P80 + 价格参考区间。'
    + ' 用于回答：这条线粗碎配什么颚破、多大进料口、几台、多大功率。'
    + ' ★ 重要提示：本工具【不含 MACKORN 颚破厂商参数】（MACKORN 主要做圆锥破），数据来自公开文献 S3/S5。型号只到档位级别，不能用于采购定点。正式选型须向厂家索取功率曲线。'
    + ' 【适用边界】只做颚破；圆锥破请用 cone_selection，筛分请用 screen_selection，整线请用 plant_design / full_chain。',
  parameters: obj(
    {
      target_tph: S.number('目标产能 t/h（必填）。'),
      max_feed_mm: S.number('最大给料粒度 mm（必填）。'),
      ore: S.string('矿石类型（如 铂金矿 / 花岗岩）。'),
      ucs_mpa: S.number('抗压强度 MPa（用于工况打折）。'),
      moisture_pct: S.number('含水率 %。'),
      muddy: S.boolean('是否含泥/黏性。'),
      closed_circuit: S.boolean('是否闭路（粗碎通常开路，默认 false）。'),
      mode: S.stringEnum('模式。', ['select', 'catalog'], { default: 'select' }),
    },
    ['target_tph', 'max_feed_mm'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => {
      if (v.catalog) {
        const out = ['## 颚破知识目录', ''];
        out.push('### 型号库（文献值，非厂商实测）');
        out.push('| 型号 | 进料口 mm | 最大给料 mm | 产能 t/h | 功率 kW |');
        out.push('|:---|:---|:---|:---|:---|');
        for (const m of (v.catalog.models || [])) out.push('| ' + m.model + ' | ' + (m.feed_opening_mm || []).join('×') + ' | ' + m.max_feed_mm + ' | ' + (m.capacity_tph || []).join('-') + ' | ' + (m.power_kw || '—') + ' |');
        out.push('');
        out.push('> ' + (v.catalog.meta ? v.catalog.meta.note : ''));
        return text(out.join('\n'));
      }
      const out = [];
      out.push('## 颚破选型');
      out.push('');
      if (v.error) { out.push('### 无法计算：' + (v.message || v.error)); for (const w of (v.warnings || [])) out.push('- ' + w); return text(out.join('\n')); }
      if (v.rejections && v.rejections.length) {
        out.push('### 无法选出机型');
        for (const r of v.rejections) { out.push('- **' + r.rule + '**'); if (r.detail) out.push('  ' + r.detail); if (r.action) out.push('  → ' + r.action); }
        out.push('');
      }
      if (v.recommended_model) {
        out.push('**推荐档位：' + v.recommended_model + '（' + (v.recommended_series || '') + '）**');
        out.push('');
        out.push('- 台数：**' + v.units + ' 台**（单台名义 ' + v.per_unit_nominal_tph + ' t/h）');
        out.push('- 总功率：' + (v.total_power_kw || '—') + ' kW');
        out.push('- 进料口需求：≥ ' + v.required_feed_opening_mm + ' mm（最大给料 ' + v.request.maxFeedMm + ' ÷ 0.85）');
        out.push('- 名义产能需求：' + v.required_nominal_tph + ' t/h（工况系数 ' + v.condition_factor + '）');
        if (v.condition_notes && v.condition_notes.length) out.push('  - 打折原因：' + v.condition_notes.join(' / '));
        out.push('- 产品 P80 估计：' + ((v.product_p80_mm_estimate || []).join('-') || '—') + ' mm（破碎比 ' + (v.reduction_ratio_estimate || '—') + '）');
        out.push('');
      }
      if (v.price_reference) {
        out.push('### 价格参考（S4 历史区间，非报价）');
        out.push('**' + v.price_reference.capacity_class + ' → ' + v.price_reference.wan_cny.join('-') + ' 万元/台**');
        out.push('');
        out.push('> ' + v.price_disclaimer);
        out.push('');
      }
      if (v.warnings && v.warnings.length) {
        out.push('### 告警');
        for (const w of v.warnings) out.push('- ' + w);
        out.push('');
      }
      return text(out.join('\n'));
    },
  },
  async execute(args) {
    if (args.mode === 'catalog') return { catalog: jawCatalog() };
    return selectJaw({
      targetTph: args.target_tph,
      maxFeedMm: args.max_feed_mm,
      ore: args.ore,
      ucsMpa: args.ucs_mpa,
      moisturePct: args.moisture_pct,
      muddy: args.muddy === true,
      closedCircuit: args.closed_circuit === true,
    });
  },
};
/* --------------------------------------------------------------------------
 * 筛分选型（R124）—— 补 2026-10-20 调用失败暴露的 P0 缺口
 *
 * 诚实边界：不含 MACKORN 筛分厂商参数；面积公式来自设计手册 S5。
 *   面积结果是【下限估计】，实际通常要放大 1.3-2.5 倍。
 * -------------------------------------------------------------------------- */
const toolScreen = {
  name: 'mackorn_screen_selection',
  description:
    '(Multilingual triggers / 多语言触发词: vibrating screen, screen, screening, sieve, aperture, mesh, screen deck, circular screen, linear screen, high frequency screen, dewatering screen, 振动筛, 筛分, 筛子, 筛网, 筛孔, 筛面, 圆振筛, 直线筛, 高频筛, 脱水筛, 检查筛, 预先筛, 循环负荷 | criba vibratoria, tamiz, cribado | Sieb, Siebmaschine, Klassierung | вибросито, грохот, грохочение | crible vibrant, tamisage | peneira vibratória, peneiramento | 振動ふるい, ふるい分け | vibrerande sikt, siktning | vibrationssigte, sigtning | täryseula, seulonta | غربال اهتزازي, نخل | layar getar, penyaringan) '
    + 'MACKORN 筛分选型工具：按给料量 t/h + 筛孔 mm + 目标效率，算筛分面积（A = Q/(q·K1..K6)）、台数、层数、推荐尺寸（宽×长）、闭路循环负荷与上游放大倍数，并给价格参考区间。'
    + ' 用于回答：这条线筛子配多大、几层、闭路循环负荷多少、上游要放大多少。'
    + ' ★ 重要提示：本工具【不含 MACKORN 筛分厂商参数】，数据来自设计手册通用公式。面积是【下限估计】，实际工程通常要放大 1.3-2.5 倍（拿不到给料粒度分布，无法精确算细粒含量系数）。必须用厂家软件或筛分试验校核。'
    + ' 【适用边界】只做筛分；颚破请用 jaw_selection，圆锥破请用 cone_selection，整线请用 plant_design / full_chain。',
  parameters: obj(
    {
      feed_tph: S.number('给料量 t/h（必填）。'),
      aperture_mm: S.number('筛孔 mm（必填）。'),
      target_efficiency: S.number('目标筛分效率 %（默认 85）。'),
      screen_type: S.stringEnum('筛型（默认自动）。', ['圆振动筛（YK/YA）', '直线振动筛（ZK/ZKR）', '高频筛（GPS）', '概率筛（GLS）'], { default: '圆振动筛（YK/YA）' }),
      moisture_pct: S.number('含水率 %。>8% 会强制告警防堵。'),
      feed_p80_mm: S.number('给料 P80 mm（用于检查筛孔是否合理）。'),
      closed_circuit: S.boolean('是否闭路（默认 true，检查筛通常闭路）。'),
      bulk_density: S.number('松散密度 t/m³（默认 1.6）。'),
      mode: S.stringEnum('模式。', ['select', 'catalog'], { default: 'select' }),
    },
    ['feed_tph', 'aperture_mm'],
  ),
  output: {
    schema: ANY_OBJECT,
    render: (_a, v) => {
      if (v.catalog) {
        const out = ['## 筛分知识目录', ''];
        out.push('### 筛型');
        for (const s of (v.catalog.series || [])) out.push('- **' + s.screen_type + '**：' + String(s.principle || '').slice(0, 40));
        out.push('');
        out.push('### 单位筛分能力 q（手册典型值）');
        out.push('| 筛孔 mm | q t/(m²·h) |');
        out.push('|:---|:---|');
        for (const t of ((v.catalog.formulas || {}).unit_capacity || {}).table || []) out.push('| ' + t.aperture_mm + ' | ' + t.q_tph_m2 + ' |');
        out.push('');
        out.push('> ' + (v.catalog.meta ? v.catalog.meta.note : ''));
        return text(out.join('\n'));
      }
      const out = [];
      out.push('## 筛分选型');
      out.push('');
      if (v.error) { out.push('### 无法计算：' + (v.message || v.error)); for (const w of (v.warnings || [])) out.push('- ' + w); return text(out.join('\n')); }
      if (v.recommended_screen_type) {
        out.push('**筛型：' + v.recommended_screen_type + '**');
        out.push('');
        out.push('- 筛分面积：**' + v.area_total_m2 + ' m²**（' + v.units + ' 台 × ' + v.area_per_unit_m2 + ' m²）');
        out.push('- 层数：' + v.layers + ' 层');
        out.push('- 推荐尺寸：宽 ' + v.recommended_dimensions.width_m + ' m × 长 ' + v.recommended_dimensions.length_m + ' m');
        out.push('');
      }
      if (v.circulating_load_pct !== null && v.circulating_load_pct !== undefined) {
        out.push('### 闭路循环负荷');
        out.push('- 循环负荷：**' + v.circulating_load_pct + '%**');
        out.push('- 上游放大：**' + v.upstream_amplification + ' 倍**');
        out.push('');
        out.push('> ' + v.circulating_note);
        out.push('');
      }
      if (v.calculation) {
        out.push('### 计算依据');
        out.push('- 公式：`' + v.calculation.formula + '`');
        out.push('- 单位筛分能力 q = ' + v.calculation.unit_capacity_q + ' t/(m²·h)');
        out.push('- 系数：' + JSON.stringify(v.calculation.coefficients));
        out.push('');
      }
      if (v.price_reference) {
        out.push('### 价格参考（S4 历史区间，非报价）');
        out.push('**' + v.price_reference.area_class + ' → ' + v.price_reference.wan_cny.join('-') + ' 万元/台**');
        out.push('');
        out.push('> ' + v.price_disclaimer);
        out.push('');
      }
      if (v.warnings && v.warnings.length) {
        out.push('### 告警');
        for (const w of v.warnings) out.push('- ' + w);
        out.push('');
      }
      return text(out.join('\n'));
    },
  },
  async execute(args) {
    if (args.mode === 'catalog') return { catalog: screenCatalog() };
    return selectScreen({
      feedTph: args.feed_tph,
      apertureMm: args.aperture_mm,
      targetEfficiency: args.target_efficiency,
      screenType: args.screen_type,
      moisturePct: args.moisture_pct,
      feedP80Mm: args.feed_p80_mm,
      closedCircuit: args.closed_circuit !== false,
      bulkDensity: args.bulk_density,
    });
  },
};
const TOOLS = [
  toolIntake, toolProposal, toolSelection, toolPlant, toolCapacity, toolCost, toolMcfm,
  toolWear, toolGrading, toolMarket, toolReport, toolCatalog,
  toolIntelWatch, toolKnowledgeUpdate, toolPdca, toolCrusherCurve, toolFlowsheet, toolCalibrate, toolContact,
  toolDistributor, toolMarketStats, toolKnowledge, toolGrinding, toolBeneficiation, toolAutomation, toolMining, toolFullChain, toolJaw, toolScreen,
];

/* --------------------------------------------------------------------------
 * Cordis entry
 * ------------------------------------------------------------------------ */

/**
 * 注册全部 MACKORN 工具。
 * 加载期绝不抛错：单个工具注册失败只记录告警，避免拖垮 profile 树。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  const logger = ctx.logger ?? ctx.get?.('logger') ?? console;
  const warn = (msg) => {
    try {
      if (typeof logger.warn === 'function') logger.warn(`[${name}] ${msg}`);
      else console.warn(`[${name}] ${msg}`);
    } catch { /* 日志失败不影响装载 */ }
  };

  // HMR 重入保护：释放上一轮的注册，避免 "tool already registered"
  const previous = globalThis[REGISTRY_KEY];
  if (Array.isArray(previous)) {
    for (const dispose of previous.reverse()) {
      try { dispose(); } catch (error) { warn(`释放旧注册失败：${error && error.message}`); }
    }
  }

  const disposers = [];
  let ok = 0;
  for (const definition of TOOLS) {
    try {
      /* ── L1 运行时护栏 ──
       * 把经验与教训编程成程序：每次工具调用后自动检查返回值，命中违规就把
       * _guardrails 报告附在输出上。护栏绝不阻断调用（用户不该因护栏而拿不到结果），
       * 但它会让违规【显式可见】，而不是静默通过。
       * 规则来源：CLAUDE.md 硬规矩 + 31 条可执行教训 + 库里的经验与错误。
       */
      const guarded = {
        ...definition,
        async execute(args) {
          const input = guardInput(definition.name, args || {});
          const value = await definition.execute(args);
          let out = attachGuardrails(definition.name, value, args || {});
          if (!input.ok && out && typeof out === 'object' && !Array.isArray(out)) {
            out = {
              ...out,
              _guardrails: {
                ...(out._guardrails || { checked_rules: GUARD_RULES.length, errors: 0, warnings: 0, violations: [] }),
                input_violations: input.violations,
                input_note: '入参护栏：调用前即已发现的约束冲突',
              },
            };
          }
          return out;
        },
      };
      const dispose = ctx.tools.register(guarded);
      disposers.push(dispose);
      ok += 1;
    } catch (error) {
      warn(`工具 ${definition.name} 注册失败，已跳过：${error && error.message}`);
    }
  }
  globalThis[REGISTRY_KEY] = disposers;
  warn(`已注册 ${ok}/${TOOLS.length} 个工具 · 运行时护栏 ${GUARD_RULES.length} 条已启用`);
}

/** 供测试与手册引用：工具清单。 */
export const toolNames = TOOLS.map((t) => t.name);
/** 供测试校验用的完整工具定义（与注册进 ctx.tools 的对象同一份）。 */
export const toolDefinitions = TOOLS;
/** 运行时护栏规则清单（供自检与文档引用）。 */
export const guardRules = listRules;
