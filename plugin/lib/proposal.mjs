/**
 * MACKORN 标准方案书生成器（proposal.mjs）
 * ============================================================================
 * 按 MACKORN 的交付口径把"客户需求 → 一份可直接交付的方案书"。
 *
 * 章节骨架依据（来源标注在每章）：
 *   · MACKORN《QMK 生产线方案设计预算标准化要求（试行）》：
 *     一套方案 = 一个文件夹，内含【流程图 + 平面布置图 + 预算】；
 *     设备分结构、全螺栓连接（现场不焊、地面设备不打地脚螺栓）；
 *     皮带机部件标准化；报价标准化。
 *   · MACKORN 客户交付版方案的行文与章节习惯（章节骨架取自交付版方案的目录结构）。
 *   · 需求来源：客户需求信息输入表（intake 模块）。
 *
 * 纪律：方案里凡是经验区间/近似值/缺口，都必须出现在
 *      「假设与数据来源」「风险与待确认项」「供货范围与不含范围」三节中。
 * ============================================================================
 */

import { intakeRequirement } from './intake.mjs';
import { estimateCost, sizePlant } from './engine.mjs';
import { contactBlockLang } from './contact-i18n.mjs';

const mdTable = (headers, rows) => {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `|${headers.map(() => ':---|').join('')}`;
  const body = rows
    .map((r) => `| ${r.map((c) => (c === null || c === undefined || c === '' ? '-' : String(c))).join(' | ')} |`)
    .join('\n');
  return `${head}\n${sep}\n${body}`;
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * 生产线方案编码（按 MACKORN《20240726-生产线方案编码规则》）。
 * 规则：物料性质码 + 产量3位 + 最大给料2位 + 成品最大粒度2位 + 同产量顺序号 + 文件类型
 * 例：A0100331A = 花岗岩 100吨 给料300mm 成品31.5mm 顺序号A，后缀 L=流程图 / B=布置图 / Y=生产线预算
 *
 * ⚠️ QMK 标准化要求明确「方案**不再**以 MK-年份-姓+顺序号-版本号命名，重新制定编码规则」，
 *    因此旧 MK- 编号一律不得再用于新方案。
 */
const MATERIAL_CODES = [
  ['花岗岩', 'A'], ['片麻岩', 'F'], ['玄武岩', 'B'], ['石灰石', 'C'], ['辉绿岩', 'D'],
  ['安山岩', 'E'], ['凝灰岩', 'G'], ['大理岩', 'H'], ['白云岩', 'J'], ['石英石', 'K'], ['萤石', 'L'],
  ['磁铁矿', 'OA'], ['赤铁矿', 'OB'], ['铜矿', 'OC'], ['钼矿', 'OD'], ['铅锌矿', 'OE'],
  ['金矿', 'OF'], ['锂矿', 'OG'], ['锰矿', 'OH'],
];
export function buildSchemeCode({ oreType, capacityTph, maxFeedMm, productMm, seq = 'A' }) {
  const notes = [];
  let mat = null;
  let matName = null;
  for (const [name, code] of MATERIAL_CODES) {
    if (String(oreType || '').includes(name)) { mat = code; matName = name; break; }
  }
  if (mat === null) { mat = '?'.repeat(1); notes.push(`物料码未匹配（矿石"${oreType ?? '未提供'}"不在对应表内）：请按《生产线方案编码规则》物料性质对应表选取，切勿自造`); }
  const capNum = Number(capacityTph);
  const cap = Number.isFinite(capNum) ? String(Math.round(capNum / 10)).padStart(3, '0') : '???';
  if (Number.isFinite(capNum) && capNum / 10 > 999) notes.push('产量码超出 3 位（规则表最大到 100=1000吨），需与标准化负责人确认扩展规则');
  const feed = Number.isFinite(Number(maxFeedMm)) ? String(Math.round(Number(maxFeedMm) / 100)).padStart(2, '0') : '??';
  // 成品码取规则的**标称粒级**：规则表为 05→5mm、10→10mm、20→20mm、31→31.5mm，
  // 即向下取整（31.5 → 31），不能用四舍五入（会得到 32，规则表里没有这个码）。
  const prod = Number.isFinite(Number(productMm)) ? String(Math.floor(Number(productMm))).padStart(2, '0') : '??';
  return {
    code: `${mat}${cap}${feed}${prod}${seq}`,
    parts: { 物料性质码: `${matName ?? '未匹配'}=${mat}`, 产量: `${capacityTph ?? '?'}吨/10=${cap}`, 最大给料: `${maxFeedMm ?? '?'}mm/100=${feed}`, 成品最大粒度: `${productMm ?? '?'}mm=${prod}`, 顺序号: seq },
    fileTypeSuffix: { L: '流程图', B: '布置图', Y: '生产线预算' },
    source: 'MACKORN《20240726-生产线方案编码规则》（物料性质对应表 + 产量/给料/成品分档表）',
    notes,
  };
}

/**
 * 生成 MACKORN 标准方案书。
 * @param {object} input 表单字段 + { title, project, costModel, costUnits, electricityPrice, hoursPerYear }
 * @returns {object} { markdown, intake, plant, cost, assumptions, warnings, attachments }
 */
export function buildProposal(input = {}) {
  const intake = intakeRequirement(input);
  const req = intake.requirement;
  const plant = intake.plant_design;
  const title = input.title ?? `${req.client_name ?? '（客户名称待填）'} ${req.capacity_tph ?? '—'} t/h ${req.line_type ?? ''}破碎筛分生产线方案`;
  const project = input.project ?? req.client_name ?? '（项目名称待填）';
  const date = input.date ?? today();

  const assumptions = [...intake.assumptions];
  const warnings = [...intake.warnings];

  let cost = null;
  const costModel = input.cost_model ?? input.costModel ?? null;
  if (costModel && plant) {
    try {
      cost = estimateCost({
        model: costModel,
        units: input.cost_units ?? input.costUnits ?? (plant.cone_crusher_coarse_side?.units ?? 1),
        tph: req.capacity_tph,
        hoursPerYear: input.hours_per_year ?? (intake.annual.annual_operating_hours ?? undefined) ?? undefined,
        electricityPriceCnyPerKwh: input.electricity_price,
        linerLifeHours: input.liner_life_hours,
        linerCostCnyPerSet: input.liner_cost_per_set,
        unitPriceWanCny: input.unit_price_wan_cny,
      });
      assumptions.push(...cost.assumptions);
      warnings.push(...cost.warnings);
    } catch (error) {
      warnings.push(`成本估算失败：${error.message}`);
    }
  }

  const scheme = buildSchemeCode({
    oreType: req.ore_type,
    capacityTph: req.capacity_tph,
    maxFeedMm: req.max_feed_mm,
    productMm: req.product_mm,
  });
  if (scheme.notes.length) warnings.push(...scheme.notes);

  const L = [];
  L.push(`# ${title}`);
  L.push('');
  L.push(`| 项目 | 内容 |`);
  L.push(`|:---|:---|`);
  L.push(`| 客户名称 | ${req.client_name ?? '—'} |`);
  L.push(`| 项目地点 | ${req.project_location ?? '—'} |`);
  L.push(`| **方案编码** | **${scheme.code}**（${Object.entries(scheme.parts).map(([k, v]) => `${k}：${v}`).join('　')}） |`);
  L.push(`| 编码依据 | ${scheme.source}。QMK 标准化要求已明确"方案**不再**以 MK-年份-姓+顺序号-版本号命名"，旧 MK- 编号不得再用于新方案 |`);
  L.push(`| 编制日期 | ${date} |`);
  L.push(`| 编制/业务 | ${req.salesperson ?? '—'} |`);
  L.push(`| 方案等级 | ${intake.completeness.blocking ? '**资料不足，待补**' : intake.completeness.preliminary ? '**初步方案（关键参数待确认）**' : '可交付方案'} |`);
  L.push('');
  L.push('> 本方案按 MACKORN 标准化要求成套交付：**流程图（后缀 L）+ 平面布置图（后缀 B）+ 生产线预算（后缀 Y）**，三份文件共用同一方案编码。');
  L.push('');

  /* 1 项目概况 */
  L.push('## 1. 项目概况与需求');
  L.push('');
  L.push(`客户拟建设一条**${req.line_type ?? '（产线类型待确认）'}**破碎筛分生产线，要求成品产量 **${req.capacity_tph ?? '—'} t/h**，原料为${req.ore_type ?? '（矿石种类待确认）'}，原矿最大给料粒度 ${req.max_feed_mm ?? '—'} mm，成品粒度要求 ${req.product_mm ?? '（待确认）'} mm 以下。`);
  if (req.ore_use) L.push(`产品主要用途：${req.ore_use}。`);
  if (req.scope) L.push(`供货范围口径：**${req.scope}**。`);
  L.push('');
  L.push('**需求来源字段完整性**：');
  L.push('');
  L.push(mdTable(['等级', '缺失项'], [
    ['阻断（缺则无法选型）', intake.completeness.missing_summary['阻断'].join('、') || '无'],
    ['关键（缺则结论降级）', intake.completeness.missing_summary['关键'].join('、') || '无'],
    ['建议补充', intake.completeness.missing_summary['建议'].join('、') || '无'],
  ]));
  L.push('');

  /* 2 设计依据与基础数据 */
  L.push('## 2. 设计依据与基础数据');
  L.push('');
  L.push(`- 原料：${req.ore_type ?? '待确认'}${req.compressive_strength_mpa ? `，抗压强度 ${req.compressive_strength_mpa} MPa` : ''}${req.moisture_pct !== null && req.moisture_pct !== undefined ? `，含水率 ${req.moisture_pct}%` : ''}`);
  if (req.size_distribution) {
    const d = req.size_distribution;
    L.push(`- 粒度组成：0-60mm ${d.p0_60 ?? '—'}%，60-100mm ${d.p60_100 ?? '—'}%，100-300mm ${d.p100_300 ?? '—'}%，>300mm ${d.p_gt300 ?? '—'}%`);
  }
  L.push(`- 工作制度：${intake.annual.hours_per_day ?? '待确认'} h/天 × ${intake.annual.days_per_year ?? '待确认'} 天/年`);
  L.push(`- 年产量：${intake.annual.annual_output_t ? `${intake.annual.annual_output_t.toLocaleString()} t/年` : '待确认（需工作制与储量）'}`);
  if (intake.annual.reserves_life_years) L.push(`- 矿山服务年限估算：约 ${intake.annual.reserves_life_years} 年（按储量推算，未计回收率与贫化）`);
  L.push(`- 环保要求：${intake.normalized.flags.dust_limit_mgm3 ?? '待确认'} mg/m³`);
  L.push(`- 生产方式：${req.production_method ?? '待确认'}`);
  L.push('- 执行标准：见 `knowledge/standards.md`（MACKORN 行业标准与规范清单）');
  L.push('');

  if (plant) {
    /* 3 工艺流程 */
    L.push('## 3. 工艺流程与规模');
    L.push('');
    L.push(`总破碎比 **${plant.total_reduction_ratio}**，采用 **${plant.recommended_stages} 段破碎**${input.closed_circuit === false ? '（开路）' : '（细碎闭路）'}：`);
    L.push('');
    L.push(mdTable(
      ['段', '工序', '给料 mm', '产品 mm', '破碎比', '职责'],
      plant.stage_plan.map((s) => [s.index, s.stage, s.feed_mm, s.product_mm, s.reduction_ratio, s.duty]),
    ));
    L.push('');
    L.push('**流程走向**（文字版，交付时应替换为标准工艺流程图）：');
    L.push('');
    const f = intake.normalized.flags;
    const soilStep = f.soil_removal_needed ? ' → 除土筛 + 除土皮带' : '';
    const washStep = f.wet_process ? ' → 洗砂与污水处理' : '';
    L.push(`原矿 → 振动给料机（+格筛）${soilStep} → ${plant.coarse_crusher_recommendation ? plant.coarse_crusher_recommendation.equipment : '粗碎设备'} → 缓冲仓 → 除铁器 → 中碎圆锥破 → 检查筛分 → 细碎圆锥破（闭路返回）→ 成品筛分 → 成品仓/堆场${washStep}`);
    if (f.soil_removal_method_unknown) {
      L.push('');
      L.push('> ⚠️ 除土方式待确认：客户要求除土但生产方式为干法。本流程按**干法除土筛**绘制；若实际采用**湿法洗砂**，须改为洗砂机 + 浓密机 + 压滤机，投资与环保章节重算。');
    }
    L.push('');

    /* 4 主要设备选择 */
    L.push('## 4. 主要设备选择');
    L.push('');
    const rows = [];
    if (plant.coarse_crusher_recommendation) {
      rows.push(['1', '粗碎破碎机', plant.coarse_crusher_recommendation.equipment, 1, '—', `最大给料 ${plant.coarse_crusher_recommendation.maxFeedMm}mm，排矿 ${plant.coarse_crusher_recommendation.dischargeMm.join('-')}mm（来源 S6 §1.1）`]);
    }
    const cc = plant.cone_crusher_coarse_side;
    if (cc) rows.push(['2', '中碎液压圆锥破', `${cc.model}（${cc.cavity} 腔）`, cc.units, cc.power_kw, `CSS ${cc.css_mm}mm，产能 ${cc.capacity_tph.join('-')} t/h，单台需求 ${cc.per_unit_tph} t/h，依据：${cc.basis}`]);
    const fc = plant.cone_crusher_fine_side;
    if (fc) rows.push(['3', '细碎液压圆锥破', `${fc.model}（${fc.cavity} 腔）`, fc.units, fc.power_kw, `CSS ${fc.css_mm}mm，产能 ${fc.capacity_tph.join('-')} t/h，单台需求 ${fc.per_unit_tph} t/h，依据：${fc.basis}`]);
    rows.push(['4', '振动筛（检查筛）', '（按筛分面积选型）', '—', '—', `处理量 ${plant.screening.throughput_tph} t/h，面积 ${plant.screening.optimistic_m2}-${plant.screening.conservative_m2} m²`]);
    rows.push(['5', '成品筛', '（按规格与占比选型）', '—', '—', req.product_specs ? `规格：${req.product_specs.join(' / ')}` : '规格待确认']);
    rows.push(['6', '带式输送机', `B${plant.conveying.recommended_width_mm}`, '按流程配置', '—', `设计能力 ${plant.conveying.design_throughput_tph} t/h，倾角 ≤ ${(plant.conveying.max_incline_deg_single ?? plant.conveying.max_incline_deg.join('-'))}°（来源 S5）`]);
    rows.push(['7', '除铁器', '悬挂式电磁除铁器', plant.recommended_stages >= 3 ? 2 : 1, '—', '圆锥破前必配']);
    rows.push(['8', '除尘系统', '除尘罩 + 布袋除尘器', '按转运点', '—', `排放 ≤ ${intake.normalized.flags.dust_limit_mgm3 ?? '待确认'} mg/m³`]);
    if (intake.normalized.flags.soil_removal_needed) {
      rows.push(['9', '除土系统', intake.normalized.flags.wet_process ? '洗砂机 + 浓密机 + 压滤机' : '除土筛 + 除土皮带（干法）', 1, '—',
        intake.normalized.flags.wet_process ? '湿法生产，含污水处理闭路循环' : '**干法除土**；若客户实为湿法洗砂须改配置（见第 3 节说明）']);
    }
    rows.push(['10', '自动控制', 'AORS 远程监控系统', 1, '—', 'MACKORN 自营，可远程监测电流/CSS/油温']);
    L.push(mdTable(['序号', '设备名称', '型号', '数量', '功率 kW', '技术要点与依据'], rows));
    L.push('');
    L.push('> 表中标「按…选型」「待确认」的项，须由 MACKORN 技术部门在施工图阶段确定；带 `依据` 的产能数据，`S1 腔型×CSS 详表` 为厂商硬数据，`系列区间近似` 须复核。');
    L.push('');

    /* 5 技术参数 */
    if (cc || fc) {
      L.push('## 5. 主要设备技术参数');
      L.push('');
      const prm = [];
      for (const [label, x] of [['中碎', cc], ['细碎', fc]]) {
        if (!x) continue;
        prm.push([label, x.model, x.series, `${x.cavity} 腔`, `${x.css_mm}`, x.capacity_tph.join('-'), x.power_kw, x.weight_t, x.max_feed_mm]);
      }
      L.push(mdTable(['工序', '型号', '系列', '腔型', 'CSS mm', '产能 t/h', '功率 kW', '重量 t', '最大给料 mm'], prm));
      L.push('');
    }

    /* 6 电气与控制 */
    L.push('## 6. 电气与自动控制');
    L.push('');
    L.push(`- 电气元件及软启动：${req.electrical_origin ?? '待确认（国产/进口）'}`);
    L.push('- 控制系统：AORS 远程监控（电流、CSS、油温、振动），支持多台设备集中监视');
    L.push('- 联锁：给料机与破碎机联锁、油温油压保护、过铁报警停机');
    L.push('');

    /* 7 环保 */
    L.push('## 7. 环保、除尘与降噪');
    L.push('');
    L.push(`- 排放要求：${intake.normalized.flags.dust_limit_mgm3 ?? '待确认'} mg/m³`);
    L.push(`- 除尘：各转运点设除尘罩 + 布袋除尘器；皮带密封形式 ${req.belt_sealing ?? '待确认'}`);
    L.push('- 降噪：破碎机设减振基础，必要时加隔声罩');
    if (intake.normalized.flags.wet_process) L.push('- 污水：洗砂水闭路循环，浓密机 + 压滤机，不外排');
    L.push('');

    /* 8 土建与布置 */
    L.push('## 8. 土建与总图布置要求');
    L.push('');
    L.push('- 场地条件：需客户提供**场地地形图或征地红线图 CAD 版**（客户须知明确要求）');
    L.push(`- 储料形式：${req.storage_type ?? '待确认'}${req.storage_capacity_t ? `，仓容 ${req.storage_capacity_t} t` : ''}`);
    L.push('- **设备钢结构全部采用栓接结构**，栓接拆解的原则是：满足集装箱要求、尽量减小装箱体积（例如底座可拆解为上框架 + 立柱 + 下框架）（QMK《生产线方案设计预算标准化要求》第 2 页第 2 条；该条同时给出"颚破最大做到 MC1250/MJ613，圆锥最大做到 NH600/MPH50"的结构上限）');
    L.push('- 缓冲仓：中碎/细碎前设 1.15-1.3 倍能力的缓冲仓，保证挤满给料');
    L.push('- 皮带机部件标准化（托辊/滚筒按 MACKORN 标准配置表）');
    L.push('');
  } else {
    L.push('## 3. 工艺流程与规模');
    L.push('');
    L.push('**暂不出设备方案**：缺少阻断字段，请先补齐第 1 节的缺失项。');
    L.push('');
  }

  /* 9 供货范围 */
  L.push('## 9. 供货范围与不含范围');
  L.push('');
  L.push('**含**：');
  L.push('');
  L.push('- 主机设备（粗碎、中碎、细碎液压圆锥破）、筛分设备、带式输送机、给料机、除铁器');
  L.push('- 电控系统（AORS）、随机备件与专用工具、技术文件（流程图、布置图、说明书、合格证）');
  L.push('- 指导安装、调试与操作培训（具体范围按合同）');
  L.push('');
  L.push('**不含**（报价与合同须明确界定）：');
  L.push('');
  L.push('- 土建基础、钢结构平台与厂房');
  L.push('- 电气进线至电控柜的电源侧工程');
  L.push('- 设备基础预埋件与灌浆做法（**注：本插件未取得 MACKORN 关于地脚螺栓/预埋的书面规定，此处留待技术部门按项目确定**）');
  L.push('- 运费、保险、税费、现场起重机具');
  L.push('- 洗砂与污水处理系统（除非第 4 节已列入）');
  L.push('');

  /* 10 投资估算 */
  if (cost) {
    L.push('## 10. 投资估算');
    L.push('');
    L.push(`- 主机参考价区间：${cost.capex.reference_band_cny ? `**${cost.capex.reference_band_cny[0].toLocaleString()} - ${cost.capex.reference_band_cny[1].toLocaleString()} 元**（${cost.capex.reference_band_note}）` : '待商务确认'}`);
    L.push(`- 装机功率：${cost.unit.installed_kw} kW；年电耗 ${cost.opex.energy_kwh_per_year.toLocaleString()} kWh，年电费 ${cost.opex.energy_cny_per_year.toLocaleString()} 元`);
    L.push(`- 吨电耗 ${cost.opex.energy_kwh_per_ton ?? '—'} kWh/t；吨电费 ${cost.opex.energy_cny_per_ton ?? '—'} 元/t`);
    L.push(`- 衬板吨成本 ${cost.opex.liner_cny_per_ton ?? '（需实测寿命与价格）'} 元/t`);
    L.push(`- 综合吨成本：**${cost.opex.cost_per_ton_cny ?? '—'} 元/t**（不含 ${cost.opex.excludes.join('、')}）`);
    L.push('');
    L.push(`> ⚠️ ${cost.warnings[0]}`);
    L.push('');
  } else {
    L.push('## 10. 投资估算');
    L.push('');
    L.push('未指定用于成本估算的机型（`cost_model`），本节留空。补上机型与台数即可生成装机功率、电耗与吨成本。');
    L.push('');
  }

  /* 11 实施建议 */
  L.push('## 11. 实施建议与工期');
  L.push('');
  L.push('- 第一步：补齐第 1 节缺失的关键字段（尤其原矿粒度、含水率、成品规格占比）');
  L.push('- 第二步：客户提供场地地形图/征地红线图 CAD，MACKORN 出平面布置图');
  L.push('- 第三步：取代表性矿样做**抗压强度与磨蚀指数试验**，据此最终确定腔型与衬板材质');
  L.push('- 第四步：确认供货范围与商务条款，出正式预算与合同');
  L.push('- 建议分期实施：先上一期主机线投产，二期扩筛分与制砂，减少一次性投资压力');
  L.push('');

  /* 12 假设与风险 */
  L.push('## 12. 假设与数据来源（必读）');
  L.push('');
  L.push(mdTable(['假设', '来源'], assumptions.filter((a, i, arr) => arr.findIndex((b) => b.assumption === a.assumption) === i).map((a) => [a.assumption, a.source])));
  L.push('');
  const uniqWarn = [...new Set(warnings)];
  if (uniqWarn.length) {
    L.push('## 13. 风险与待确认项');
    L.push('');
    for (const w of uniqWarn) L.push(`- ⚠️ ${w}`);
    L.push('');
  }

  /* 附件清单 */
  L.push('## 附件清单（MACKORN 标准化方案包，共用方案编码 ' + scheme.code + '）');
  L.push('');
  L.push(mdTable(['附件', '编码后缀', '状态'], [
    ['工艺流程图', 'L', '待出（本方案第 3 节为文字版）'],
    ['平面布置图', 'B', '待出（需客户提供场地 CAD）'],
    ['生产线预算表', 'Y', cost ? '第 4、10 节已给出估算口径' : '待出'],
    ['设备技术参数表', '—', '第 5 节已给出'],
    ['供货范围与验收标准', '—', '第 9 节已给出'],
  ]));
  L.push('');
  // 联系与招募（让提问的人找得到我们）
  L.push(contactBlockLang(input.language ?? 'zh-CN'));

  L.push('---');
  L.push('');
  L.push('> 本方案由 MACKORN DeepSeek 插件生成，厂商数据来自 MACKORN 内部资料；所有工程经验区间已在第 12 节显式标注。**正式投标/签约前须由 MACKORN 技术人员复核并出具盖章版方案书。**');

  return {
    markdown: L.join('\n'),
    intake,
    plant,
    cost,
    assumptions,
    warnings: uniqWarn,
    attachments: ['工艺流程图(L)', '平面布置图(B)', '生产线预算表(Y)'],
  };
}
