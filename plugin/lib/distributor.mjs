/**
 * 经销商/代理商评估引擎
 *
 * 为什么单独做：
 *   代理商是 MACKORN 出海的主要杠杆，但招错代理的代价极高 ——
 *   占着区域不出单、同时代理竞品、拿了货不付款、个人代理无资产可追。
 *   所以必须把"感觉这个人靠谱"变成**可打分、可核验、可追责**的流程。
 *
 * 三维度：
 *   能力（Capability）—— 卖得动吗
 *   可靠（Reliability）—— 靠得住吗
 *   匹配（Fit）—— 适合我们吗
 *
 * 关键区分：**公司代理 vs 个人代理**的风险特征完全不同，评分权重也不同。
 *
 * 纪律：
 *   - 只做规则化打分，不做"征信查询"（那需要持牌机构）
 *   - 所有核验渠道指向**公开可查**的官方/第三方入口
 *   - 输出必须带「待核验项」，未核验不得授信
 */

/* ============================================================
 * 一、核验渠道（公开可查）
 * ============================================================ */
export const VERIFICATION_CHANNELS = [
  { region: '中国', item: '工商登记/股东/涉诉/经营异常', source: '国家企业信用信息公示系统 gsxt.gov.cn · 信用中国 creditchina.gov.cn · 中国执行信息公开网 zxgk.court.gov.cn', note: '官方免费' },
  { region: '中国', item: '商业尽调聚合', source: '天眼查 / 企查查 / 启信宝', note: '商业服务，需自行核对官方原件' },
  { region: '全球', item: '企业信用与财务健康', source: 'Dun & Bradstreet (D&B) · Coface · Creditsafe · Experian Business', note: '付费；可出信用额度建议' },
  { region: '全球', item: '国别与买方风险', source: '中国出口信用保险公司 Sinosure · 中国信保国别风险报告', note: '与出口信贷配套' },
  { region: '全球', item: '制裁与出口管制筛查', source: 'OFAC SDN · EU Consolidated List · UN Security Council List · 中国商务部不可靠实体清单', note: '签约前必查' },
  { region: '全球', item: '反倾销/反补贴', source: 'WTO · 各国贸易救济机构公告', note: '影响报价与交付' },
  { region: '当地', item: '行业资质/会员', source: '当地矿业协会会员名录（AusIMM/CIM/SAIMM/IMA/SONAMI/SNMPE 等）', note: '会员身份是可核验的资信信号' },
  { region: '当地', item: '实际经营场所与库存', source: '实地走访 / 视频验仓', note: '最有效的一条，不可省略' },
  { region: '交叉', item: '第三方口碑', source: '让其提供 3 个客户 + 2 个供应商，逐一电话/邮件回访', note: '对方若拒绝提供，本身就是信号' },
];

/* ============================================================
 * 二、评分维度
 * ============================================================ */
const DIMS = [
  /* ── 能力 Capability ── */
  { key: 'market_cover', dim: '能力', w: 8, label: '市场覆盖与客户资源',
    scores: { 5: '本国有成规模的矿业/骨料客户群，能列举 10+ 现有客户', 3: '有若干稳定客户', 1: '无明确客户资源' } },
  { key: 'sales_team', dim: '能力', w: 7, label: '销售团队规模',
    scores: { 5: '≥5 名专职销售', 3: '2-4 名', 1: '1 人或无' } },
  { key: 'tech_service', dim: '能力', w: 9, label: '技术服务能力',
    scores: { 5: '有专职工程师，能独立完成安装调试与故障处理', 3: '有 1 名技术人员或可外包', 1: '无技术能力，只能做贸易' } },
  { key: 'similar_exp', dim: '能力', w: 8, label: '同类设备经验',
    scores: { 5: '代理过美卓/山特维克/特雷克斯等破碎筛分设备', 3: '代理过其他矿山设备', 1: '无矿山设备经验' } },
  { key: 'capital', dim: '能力', w: 8, label: '资金实力',
    scores: { 5: '注册资本 ≥ 500 万元等值，可承受备件库存', 3: '100-500 万等值', 1: '< 100 万等值或无法开证' } },
  { key: 'warehouse', dim: '能力', w: 6, label: '仓储与备件库存能力',
    scores: { 5: '有仓库且可常备 3 个以上规格衬板', 3: '有仓库但不备货', 1: '无仓储' } },
  { key: 'channel', dim: '能力', w: 5, label: '渠道网络',
    scores: { 5: '有下级分销或覆盖多区域', 3: '单一区域直销', 1: '无渠道' } },

  /* ── 可靠 Reliability ── */
  { key: 'years', dim: '可靠', w: 7, label: '经营年限',
    scores: { 5: '≥10 年', 3: '3-10 年', 1: '<3 年' } },
  { key: 'entity_type', dim: '可靠', w: 10, label: '主体类型（公司 vs 个人）',
    scores: { 5: '有限公司，股权清晰，可开票、可签约、可追责', 3: '个体户/独资，勉强可签', 1: '纯个人，无法律主体 —— 不可追责、不可开票' } },
  { key: 'credit_record', dim: '可靠', w: 10, label: '信用与涉诉记录',
    scores: { 5: '无失信、无被执行、无重大诉讼', 3: '有轻微商事纠纷已了结', 1: '失信被执行/经营异常/重大未决诉讼' } },
  { key: 'payment_history', dim: '可靠', w: 9, label: '付款履约历史',
    scores: { 5: '有 2 年以上按时付款记录（从他厂或银行可核）', 3: '有短期合作无违约', 1: '无记录或有逾期/坏账' } },
  { key: 'exclusivity', dim: '可靠', w: 8, label: '竞品代理冲突',
    scores: { 5: '无竞品代理，或愿签排他条款', 3: '代理非直接竞品', 1: '同时代理美卓/山特维克等直接竞品且不愿排他' } },
  { key: 'reference_check', dim: '可靠', w: 8, label: '第三方背调',
    scores: { 5: '主动提供 3 客户 + 2 供应商且回访正面', 3: '提供但回访一般', 1: '拒绝提供或回访有负面' } },
  { key: 'sanctions', dim: '可靠', w: 6, label: '制裁与合规',
    scores: { 5: '不在任何制裁/不可靠实体清单', 3: '需进一步核查关联方', 1: '命中制裁名单 —— 一票否决' } },

  /* ── 匹配 Fit ── */
  { key: 'territory_fit', dim: '匹配', w: 6, label: '区域匹配',
    scores: { 5: '覆盖我们的优先市场且无现有代理冲突', 3: '覆盖次要市场', 1: '区域与我们规划冲突' } },
  { key: 'commitment', dim: '匹配', w: 6, label: '投入意愿',
    scores: { 5: '愿投入人员/库存/市场费用，接受年度目标', 3: '愿投入有限', 1: '只想要独家权不想投入' } },
  { key: 'brand_fit', dim: '匹配', w: 4, label: '品牌定位匹配',
    scores: { 5: '接受 MACKORN 定位，不要求以低价冲量', 3: '可协商', 1: '只做最低价' } },
];

/* ============================================================
 * 三、否决项（一票否决）
 * ============================================================ */
const VETO = {
  sanctions: '命中制裁/不可靠实体清单',
  credit_record: '失信被执行 / 经营异常 / 重大未决诉讼',
};

/* ============================================================
 * 四、按主体类型的权重调整
 * ============================================================ */
const WEIGHT_ADJUST = {
  公司: {},                       // 标准权重
  个人: { entity_type: 2.0, credit_record: 1.5, capital: 1.5, warehouse: 1.3, tech_service: 1.2 },
  个体户: { entity_type: 1.4, capital: 1.2 },
};

/**
 * 评估一个经销商/代理商候选。
 *
 * @param {object} input
 * @param {'公司'|'个人'|'个体户'} input.agent_type
 * @param {string} [input.country] 所在国
 * @param {object} input.scores 各维度 1/3/5 分
 * @param {string[]} [input.missing] 尚未核验的维度 key
 */
export function evaluateDistributor(input = {}) {
  const type = input.agent_type || '公司';
  const adj = WEIGHT_ADJUST[type] || {};
  const scores = input.scores || {};
  const missing = new Set(input.missing || []);

  /* ── 逐维度计算 ── */
  const rows = [];
  let totalW = 0, gotW = 0;
  const veto = [];

  for (const d of DIMS) {
    const raw = Number(scores[d.key]);
    const w = d.w * (adj[d.key] || 1);
    totalW += w;
    const isMissing = missing.has(d.key) || !Number.isFinite(raw);
    if (!isMissing) {
      // 1/3/5 → 0/60/100 分
      const pct = raw >= 5 ? 100 : raw >= 3 ? 60 : 0;
      gotW += w * (pct / 100);
    }
    if (VETO[d.key] && Number.isFinite(raw) && raw <= 1) veto.push(VETO[d.key]);
    rows.push({
      key: d.key,
      dim: d.dim,
      label: d.label,
      score: Number.isFinite(raw) ? raw : null,
      weight: Math.round(w * 10) / 10,
      verified: !isMissing,
      criterion: d.scores[5],
    });
  }

  const score = totalW ? Math.round((gotW / totalW) * 100) : 0;
  const coverage = totalW ? Math.round((DIMS.filter((d) => !missing.has(d.key) && Number.isFinite(Number(scores[d.key]))).reduce((s, d) => s + d.w * (adj[d.key] || 1), 0) / totalW) * 100) : 0;

  /* ── 分级 ── */
  let tier, tierNote;
  if (veto.length) { tier = 'X'; tierNote = '一票否决 —— 不得合作'; }
  else if (coverage < 60) { tier = '待核'; tierNote = '核验覆盖率不足 60%，不得授信'; }
  else if (score >= 80) { tier = 'A'; tierNote = '战略代理 —— 可给独家期与最优价格'; }
  else if (score >= 65) { tier = 'B'; tierNote = '正式代理 —— 非独家，可给区域保护'; }
  else if (score >= 50) { tier = 'C'; tierNote = '试销 —— 先小单验证，暂不给独家'; }
  else { tier = 'D'; tierNote = '不建议合作'; }

  /* ── 授信建议（按分级 + 主体类型）── */
  const creditBase = { A: 3, B: 2, C: 1, X: 0, 待核: 0 }[tier] ?? 0;
  const entityFactor = type === '公司' ? 1.0 : type === '个体户' ? 0.5 : 0.2;
  const credit = {
    tier,
    max_open_account_units: Math.round(creditBase * entityFactor * 10) / 10,
    basis: `分级 ${tier} 基准 ${creditBase} × 主体系数 ${entityFactor}（${type}）`,
    note: creditBase === 0 ? '不授信' : '单位=单台整机货值或等值备件；实际额度须结合 D&B/Coface 信用报告与 Sinosure 限额核定',
    required_before_credit: ['工商与涉诉核验', '第三方信用报告（D&B/Coface）', '制裁名单筛查', '至少 1 次成功试单'],
  };

  /* ── 风险提示 ── */
  const risks = [];
  if (type !== '公司') risks.push(`主体为「${type}」：法律追责难、无法开票、资产无担保 —— 建议要求个人连带担保或保证金`);
  if (Number(scores.entity_type) <= 1) risks.push('无独立法人主体 —— 合同相对方不明确，纠纷时难以主张权利');
  if (Number(scores.exclusivity) <= 1) risks.push('同时代理直接竞品 —— 存在利益冲突与客户信息泄露风险');
  if (Number(scores.credit_record) <= 1) risks.push('信用记录不良 —— 一票否决级');
  if (Number(scores.capital) <= 1) risks.push('资金实力不足 —— 备件库存与账期均无保障');
  if (Number(scores.tech_service) <= 1) risks.push('无技术服务能力 —— 售后须由我方承担，成本高且响应慢');
  if (Number(scores.reference_check) <= 1) risks.push('第三方背调不通过或拒绝提供 —— 强烈负面信号');
  if (coverage < 60) risks.push(`核验覆盖率仅 ${coverage}% —— 未核验项不得作为决策依据`);

  /* ── 未核验项清单 ── */
  const pending = rows.filter((r) => !r.verified).map((r) => r.label);

  /* ── 下一步动作 ── */
  const next = [];
  if (veto.length) next.push('立即终止流程；如已签约，启动合规复核与退出程序');
  else {
    if (coverage < 100) next.push(`完成剩余 ${pending.length} 项核验：${pending.slice(0, 5).join('、')}${pending.length > 5 ? ' 等' : ''}`);
    next.push('官方核验：工商登记 + 涉诉 + 失信 + 制裁名单（全部免费）');
    next.push('第三方信用报告：D&B 或 Coface，出信用额度建议');
    next.push('实地或视频验仓：确认经营场所、库存、团队规模');
    next.push('背景回访：让其提供 3 客户 + 2 供应商，逐一核实');
    if (tier === 'C' || tier === 'B') next.push('安排一次小额试单（备件优先），验证付款与交付执行力');
    if (tier === 'A') next.push('进入独家期谈判：12 个月首期 + 年度目标 + 报备保护');
  }

  return {
    request: { agent_type: type, country: input.country || null },
    score,
    tier,
    tier_note: tierNote,
    verification_coverage_pct: coverage,
    veto_triggered: veto,
    dimensions: rows,
    credit_recommendation: credit,
    risks,
    pending_verification: pending,
    next_actions: next,
    verification_channels: VERIFICATION_CHANNELS,
    agent_type_note: type === '公司'
      ? '公司主体：可签约、可开票、可追责，标准权重'
      : `${type}主体：权重已上调（主体类型 ×2.0、信用 ×1.5、资金 ×1.5），授信系数下调至 ${entityFactor}。建议要求个人连带担保 + 保证金 + 不赊销`,
    assumptions: [
      { item: '打分为 1/3/5 三档制，映射 0/60/100 分后加权', source: 'MACKORN 代理商评估口径' },
      { item: '核验渠道均为公开可查的官方或商业入口，本工具不代查征信', source: 'SCOPE' },
      { item: '授信额度为规则化建议，不能替代 D&B/Coface 信用报告与 Sinosure 限额核定', source: 'SCOPE' },
    ],
    warnings: [
      '未完成核验（覆盖率 <100%）前不得签约、不得授信、不得发货',
      '个人代理必须加个人连带担保与保证金，且不赊销',
      '命中制裁名单为一票否决，无例外',
    ],
  };
}
