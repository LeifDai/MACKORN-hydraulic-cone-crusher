/**
 * 运行时护栏（Runtime Guardrails）
 * ================================================================
 * 把【经验与教训】编程成程序，让每次工具调用都被强制检查 ——
 * 不是写在文档里等有人去读，而是跑不过就不让过。
 *
 * 三层结构：
 *   L1 本文件 —— 运行时护栏，每次工具调用后检查返回值与入参
 *   L29 tools/enforce_lessons.mjs —— 构建期门禁，跑不过不许发布
 *   L29 tools/self_iterate.mjs    —— 自迭代循环，跑全部检查并把结果写回库
 *
 * 规则来源：
 *   · CLAUDE.md 硬规矩（不编数字/带来源/冲突并列/不做价格/圆锥破给料上限）
 *   · tools/lessons.mjs 的 31 条可执行教训
 *   · 库里的 18 条经验与 12 条错误
 *
 * 设计纪律：
 *   · 护栏本身绝不抛错 —— 它只是标记，抛错会拖垮用户的正常调用
 *   · 严重度分级：error（必须修）/ warn（应关注）
 *   · 每条护栏都指向它对应的教训编号，便于追溯
 */

/* ══════════════════════════════════════════════════════════════════
 * 规则表
 * ══════════════════════════════════════════════════════════════════ */
export const GUARD_RULES = [
  {
    id: 'GR-01', severity: 'error', lesson: 'CLAUDE.md 硬规矩',
    title: '不得用估算值填补 null',
    detail: '未知字段必须返回 null；把 null 换成"看起来完整"的估算值是禁止的',
    check: (tool, value) => {
      const bad = [];
      walk(value, (k, v, path) => {
        if (v && typeof v === 'object' && v.estimated === true && v.value == null) bad.push(path);
      });
      return bad.length ? { hit: true, evidence: '疑似估算填充: ' + bad.slice(0, 3).join(', ') } : { hit: false };
    },
  },
  {
    id: 'GR-02', severity: 'error', lesson: 'CLAUDE.md 硬规矩 + L-02',
    title: '圆锥破必须拒绝超限给料',
    detail: '圆锥破是中细碎设备；单台圆锥破的给料 > 350 mm 必须明确拒绝或告警，不能静默算出结果',
    check: (tool, value, args) => {
      /* 只针对【单台圆锥破】的工具。
       * flowsheet / plant_design 描述的是【整条生产线】，原矿给料可以 > 350 mm
       * （后面有粗碎段承担）—— 对它们套用本规则是误报（R32 实测发现的护栏自身缺陷）。
       * 生产线级别的检查应看"末段圆锥破的给料"，那是另一个判据。 */
      if (!/cone_selection|capacity_check|crusher_curve/.test(tool)) return { hit: false };
      const feed = Number(args?.max_feed_mm ?? args?.feed_p80_mm ?? args?.max_feed ?? NaN);
      if (!Number.isFinite(feed) || feed <= 350) return { hit: false };
      /* 假阴性修正（R18 审查 m4）：原判据 grep /350|粗碎|…/，而 cone_selection 输出
       * 【天然】含「200-350 C/EC；>350 EC（需预筛分）」→ 恒真 → error 级护栏永不触发。
       * 改为检查本次调用是否真的拒绝/告警了。 */
      const s = JSON.stringify(value || {});
      const reallyRefused = (value && typeof value === 'object' && (
        value.refused === true || value.rejected === true || value.feed_rejected === true))
        || /给料.{0,20}(超限|超出|拒绝|不予|无法处理)|超限给料|拒绝该给料|需先粗碎/.test(s);
      return reallyRefused ? { hit: false } : { hit: true, evidence: '单台圆锥破给料 ' + feed + ' mm > 350 mm 但输出未见拒绝/告警' };
    },
  },
  {
    id: 'GR-02b', severity: 'warn', lesson: 'CLAUDE.md 硬规矩',
    title: '生产线末段圆锥破给料不得超限',
    detail: '整条线的原矿给料可以很大，但【进入圆锥破那一段】的给料必须 ≤ 350 mm',
    check: (tool, value) => {
      if (!/plant_design|simulate_flowsheet/.test(tool)) return { hit: false };
      const s = JSON.stringify(value || {});
      // 找各破碎段的入料 P80，看是否有 > 350 的
      const overs = [...s.matchAll(/"feed_p80_mm"\s*:\s*([\d.]+)/g)].map((m) => Number(m[1])).filter((x) => x > 350);
      if (!overs.length) return { hit: false };
      return /粗碎|颚破|jaw|超限|警告|warning/i.test(s) ? { hit: false } : { hit: true, evidence: '有破碎段入料 P80 ' + overs.slice(0, 3).join('/') + ' mm > 350，但未见粗碎段说明或告警' };
    },
  },
  {
    id: 'GR-03', severity: 'warn', lesson: 'CLAUDE.md 硬规矩',
    title: '数值结论必须带来源或假设',
    detail: '每个数字都要能追溯到来源（S1厂商/S5手册/S6规范/LITERATURE/ENGINEERING/MACKORN-实测）',
    check: (tool, value) => {
      if (!value || typeof value !== 'object') return { hit: false };
      const hasAssumptions = Array.isArray(value.assumptions) && value.assumptions.length > 0;
      const hasSourceFields = /source|basis|_src|src/.test(JSON.stringify(value).slice(0, 4000));
      // 只对「产生了数值结论」的工具要求
      const numericTool = /selection|plant_design|capacity|cost|mcfm|wear|grading|crusher_curve|flowsheet|calibrate|market_intel|report|knowledge/.test(tool);
      if (numericTool && !hasAssumptions && !hasSourceFields) return { hit: true, evidence: '产出数值但既无 assumptions 也无来源字段' };
      return { hit: false };
    },
  },
  {
    id: 'GR-04', severity: 'error', lesson: 'CLAUDE.md 硬规矩',
    title: '冲突数据必须并列，不得平均',
    detail: '两个来源冲突时并列展示；出现 averaged/average_of 这类合并字段即为违规',
    check: (tool, value) => {
      const bad = [];
      walk(value, (k, v, path) => {
        if (/^(averaged|average_of|merged_value|consensus_value)$/i.test(k)) bad.push(path + '=' + JSON.stringify(v).slice(0, 60));
      });
      return bad.length ? { hit: true, evidence: '发现合并字段: ' + bad.slice(0, 3).join('; ') } : { hit: false };
    },
  },
  {
    id: 'GR-05', severity: 'warn', lesson: 'CLAUDE.md 硬规矩',
    title: '不做价格承诺',
    detail: '可给参考区间但必须附免责；不得给出可被当作报价的单一确定价格',
    check: (tool, value) => {
      if (!/cost|proposal|selection_report/.test(tool)) return { hit: false };
      const s = JSON.stringify(value || {});
      const hasQuote = /报价|quotation|unit_price_committed|最终价/.test(s);
      const hasDisclaimer = /免责|参考价|不构成报价|disclaimer|区间/.test(s);
      return (hasQuote && !hasDisclaimer) ? { hit: true, evidence: '出现报价类表述但无免责/区间说明' } : { hit: false };
    },
  },
  {
    id: 'GR-06', severity: 'warn', lesson: 'CLAUDE.md 硬规矩',
    title: '不做法律建议',
    detail: '经销商评估可给风险清单与核验渠道，不得下法律结论',
    check: (tool, value) => {
      if (!/distributor/.test(tool)) return { hit: false };
      const s = JSON.stringify(value || {});
      return /违法|法律责任|合法有效|legal advice|合规结论/.test(s) ? { hit: true, evidence: '出现法律结论性表述' } : { hit: false };
    },
  },
  {
    id: 'GR-07', severity: 'error', lesson: 'L-21（测不到≠没有）',
    title: '探测失败必须记 UNKNOWN，不得记为"不存在"',
    detail: '网络失败/反爬/超时不是"没有"；必须记 unknown 且不计入覆盖率分母',
    check: (tool, value) => {
      const s = JSON.stringify(value || {});
      if (!/unknown|UNKNOWN/.test(s)) return { hit: false };
      // 若同时把失败项算进了覆盖率分母且未标注，视为违规
      const m = s.match(/"coverage[^"]*":\s*([\d.]+)/);
      const declares = /不计入|excluding|denominator|可判定/.test(s);
      return (m && !declares) ? { hit: true, evidence: '有 UNKNOWN 但未声明"不计入分母"' } : { hit: false };
    },
  },
  {
    id: 'GR-08', severity: 'warn', lesson: 'L-17（通道可达≠被收录）',
    title: '不得把"通道可达"报成"已被收录"',
    detail: 'reachable/indexed 是两件事，必须分开报',
    check: (tool, value) => {
      /* 作用域修正（R18 对抗性审查 M1）：原判据对所有输出 grep /可达/，
       * market_intel 的「物流可达性」被误判 —— 范畴错误。改为只认结构化可达声明。 */
      const s = JSON.stringify(value || {});
      const claimsReachable = /"reachable"\s*:\s*true|"可达"\s*:\s*true|通道可达/.test(s);
      if (!claimsReachable) return { hit: false };
      return /indexed|已收录|已被收录/.test(s) ? { hit: false } : { hit: true, evidence: '报了通道可达但未区分"是否被收录"' };
    },
  },
  {
    id: 'GR-09', severity: 'error', lesson: 'L-31（索引兜底分组）',
    title: '索引输出不得遗漏页面',
    detail: '生成索引时各类计数之和必须等于扫描总数，且必须有兜底分组',
    check: (tool, value) => {
      /* 可达性修正（R18）：原判据要求 tool 名含 sync_ai_index，而 guardOutput 只被
       * 22 个 mackorn_* 工具调用 —— 该规则永远不可能触发。改为按输出特征识别，
       * 且「是否已有覆盖率断言」不再包含 classified（否则与触发条件自我抵消）。 */
      const s = JSON.stringify(value || {});
      const isIndexReport = /"classified"|"pages"|"sections"|索引生成|index_report/.test(s);
      if (!isIndexReport) return { hit: false };
      const hasAssertion = /coverage_assert|覆盖率断言|兜底(分组|类)|classified\s*===?\s*pages|sum\s*===\s*pages|other_group/.test(s);
      return hasAssertion ? { hit: false } : { hit: true, evidence: '索引生成未见覆盖率断言/兜底分组' };
    },
  },
  {
    id: 'GR-10', severity: 'error', lesson: 'L-28（替换后必须回读）',
    title: '文本替换必须回读校验',
    detail: 'replace 找不到锚点会静默返回原内容；必须回读确认目标字符串已存在',
    check: (tool, value) => {
      /* 作用域修正（R18 M1）：这是【开发过程规则】，只适用于"报告了替换动作"的输出。
       * 原判据让 proposal 的模板句「交付时应替换为标准工艺流程图」产生 error 级假阳性。 */
      const reportsReplacement = value && typeof value === 'object' && (
        'replaced' in value || 'replacements' in value || 'files_changed' in value || 'edits' in value);
      if (!reportsReplacement) return { hit: false };
      const s = JSON.stringify(value || {});
      return /回读|readback|确认已写入/.test(s) ? { hit: false } : { hit: true, evidence: '报告了替换动作但无回读校验记录' };
    },
  },
  {
    id: 'GR-11', severity: 'error', lesson: 'L-30（批量替换安全）',
    title: '批量替换必须证明规则安全',
    detail: '必须用非目标串验证规则不误伤（如 21 mm 不能被改成 22 mm）',
    check: (tool, value) => {
      /* 作用域修正（R18 M1）：开发过程规则，只适用于"报告了批量替换"的输出。
       * 原判据让 cost_estimate 的「数量规模（批量折扣）」产生 error 级假阳性。 */
      const reportsBatch = value && typeof value === 'object' && (
        'batch_replaced' in value || 'batch_files' in value || 'sync_report' in value);
      if (!reportsBatch) return { hit: false };
      const s = JSON.stringify(value || {});
      return /幂等|idempot|非目标串|规则安全/.test(s) ? { hit: false } : { hit: true, evidence: '批量替换未见幂等性/规则安全验证' };
    },
  },
  {
    id: 'GR-12', severity: 'error', lesson: 'L-01（物理不变量优先）',
    title: '模型输出必须自报质量守恒状态',
    detail: '粒度/流程模型输出必须带质量平衡误差与是否通过；不报即为违规',
    check: (tool, value) => {
      if (!/crusher_curve|flowsheet|calibrate/.test(tool)) return { hit: false };
      const s = JSON.stringify(value || {});
      return /mass_balance|质量守恒|sum_error/.test(s) ? { hit: false } : { hit: true, evidence: '粒度模型输出未自报质量守恒' };
    },
  },
  {
    id: 'GR-13', severity: 'warn', lesson: 'L-29（台账与实际一致）',
    title: '出处缺失的条目不得入库',
    detail: '案例/知识条目无 source_url 一律拒收',
    check: (tool, value) => {
      /* 结构性 bug 修正（R18 负控发现）：walk 的回调签名是 cb(键名, 值, 路径)，
       * 原判据却检查 v.brand —— v 是【该键的值】而非【父对象】，
       * 对 {brand:'Metso'} 而言 v 是字符串 'Metso'，v.brand 恒 undefined
       * → 这条规则【结构上永远不可能触发】。改为深度遍历对象自身。 */
      const bad = [];
      const visit = (node, path) => {
        if (node == null) return;
        if (Array.isArray(node)) { node.slice(0, 200).forEach((x, i) => visit(x, path + '[' + i + ']')); return; }
        if (typeof node !== 'object') return;
        if ((node.brand || node.model) && node.source_url === '' && !node.rejection_note) bad.push(path);
        for (const [k, val] of Object.entries(node)) visit(val, path + '.' + k);
      };
      visit(value, 'ROOT');
      return bad.length ? { hit: true, evidence: '有品牌/型号但无出处的条目: ' + bad.slice(0, 3).join(', ') } : { hit: false };
    },
  },
  {
    id: 'GR-16', severity: 'warn', lesson: 'R16 转速敏感性实测',
    title: '低转速区（<250 rpm）模型响应不可信',
    detail: '实测本模型对转速的响应：200 rpm 时的预测 P80 是 300 rpm 基准的 3.97 倍（破碎比从 8.04 掉到 2.03）。'
      + '物理上转速降 33% 不会让产品粒度粗近 4 倍。根因是转速被建模为【分类函数的线性乘子】，'
      + '而 P80 对分类函数高度非线性。250–400 rpm 区间响应较平缓，可用；低于 250 rpm 的结果仅供参考量级。',
    check: (tool, value, args) => {
      const sp = Number(args?.speed_rpm ?? args?.speedRpm ?? NaN);
      if (!Number.isFinite(sp) || sp >= 250) return { hit: false };
      const s = JSON.stringify(value || {});
      const reallyWarned = /(低速|不可信|250)[^"]{0,60}(不可信|低转速|仅供参考|unreliable)/i.test(s);
      return reallyWarned ? { hit: false }
        : { hit: true, evidence: '转速 ' + sp + ' rpm < 250 —— 该区间本模型响应不可信（200rpm 时 P80 偏差达 297%），输出未见告警' };
    },
  },
  {
    id: 'GR-15', severity: 'warn', lesson: 'Chalmers (2015) 实测',
    title: '偏心转速超过 400 rpm 会堵料',
    detail: '公开文献实测：给料不受限时，偏心转速超过 400 rpm 会发生堵料（packing）。超过此值必须告警。',
    check: (tool, value, args) => {
      const sp = Number(args?.speed_rpm ?? args?.speedRpm ?? NaN);
      if (!Number.isFinite(sp) || sp <= 400) return { hit: false };
      /* ⚠️ 不能用 /400/ 匹配整个输出 —— 机型 "NH400" 里的 400 会被误判成"已告警"。
       *    必须只认【真正的告警文本】（转速/偏心/rpm 与 400/堵料 同现的语境）。
       *    这个 bug 由 GR-15 的负控（转速 500 必须被拦）抓出 —— 负控的价值就在此。 */
      const s = JSON.stringify(value || {});
      const reallyWarned = /(转速|偏心|eccentric|rpm)[^"]{0,60}(400|堵料|packing)/i.test(s)
        || /(堵料|packing)[^"]{0,60}(rpm|转速|偏心|400)/i.test(s);
      return reallyWarned ? { hit: false }
        : { hit: true, evidence: '转速 ' + sp + ' rpm > 400 —— 文献实测此区间给料不受限时会堵料，输出未见告警' };
    },
  },
  {
    id: 'GR-14', severity: 'warn', lesson: 'R31 实测',
    title: '宽区间不得取上限做分级',
    detail: '用区间上限做分级会系统性高估（铝土矿被判"硬"）；应用中位数并标注区间',
    check: (tool, value) => {
      const s = JSON.stringify(value || {});
      if (!/hardness_grade|wear_grade/.test(s)) return { hit: false };
      return /hardness_basis|wear_basis|中位数/.test(s) ? { hit: false } : { hit: true, evidence: '有分级但未说明分级依据（中位数/上限）' };
    },
  },
  {
    id: 'GR-17', severity: 'warn', lesson: 'R35 独立验证（Evertsson 参数）',
    title: '给料相对排矿口过粗，破碎比会受限',
    detail: '给料 P80 / CSS > 4 时，一次通过的破碎比受给料粒度上限约束，'
      + '产品会明显偏粗。实测（Evertsson 真实参数 269 rpm）：给料 P80 40mm 配 CSS 8mm（比值 5）'
      + '时破碎比只有 2.9，而真实细碎腔可达 4–6。应改用更细的给料或明确告知用户。',
    check: (tool, value) => {
      const s = JSON.stringify(value || {});
      /* 只在有破碎比/产品粒度的输出上判断 */
      if (!/reduction_ratio|product_p80|p80_estimate/.test(s)) return { hit: false };
      /* ⚠️ R35 修正：原先用"配对正则 + 猜哪个捕获组是 feed"—— 实测在真实输出上【永不命中】
       *   （真实 JSON 里 css_mm 在 feed_p80_mm 之前，配对顺序与假设相反）。
       *   改为【两个字段各自独立提取】，不做顺序假设、不做配对。 */
      const pick = (re) => { const m = s.match(re); return m ? Number(m[1]) : null; };
      const css = pick(/"css_mm"\s*:\s*([\d.]+)/);
      const feed = pick(/"feed_p80_mm"\s*:\s*([\d.]+)/)
        ?? pick(/"max_feed_mm"\s*:\s*([\d.]+)/)
        ?? pick(/"maxFeedMm"\s*:\s*([\d.]+)/);
      if (!Number.isFinite(feed) || !Number.isFinite(css) || css <= 0) return { hit: false };
      const ratio = feed / css;
      if (ratio <= 4) return { hit: false };
      return { hit: true, evidence: '给料 ' + feed + 'mm ÷ CSS ' + css + 'mm = ' + ratio.toFixed(1) + '（>4）—— 破碎比会受限，产品偏粗' };
    },
  },
];

/* ══════════════════════════════════════════════════════════════════
 * 工具函数
 * ══════════════════════════════════════════════════════════════════ */
/** 深度遍历对象（含数组），回调 (key, value, path) */
function walk(v, cb, path = '$', depth = 0) {
  if (depth > 8 || v == null) return;
  if (Array.isArray(v)) { v.slice(0, 200).forEach((x, i) => walk(x, cb, path + '[' + i + ']', depth + 1)); return; }
  if (typeof v !== 'object') return;
  for (const [k, val] of Object.entries(v)) {
    cb(k, val, path + '.' + k);
    walk(val, cb, path + '.' + k, depth + 1);
  }
}

/* ══════════════════════════════════════════════════════════════════
 * 主入口
 * ══════════════════════════════════════════════════════════════════ */

/**
 * 检查一次工具调用的输出
 * @returns { ok, violations:[{id,severity,title,evidence,lesson}], checked }
 * 注意：本函数永不抛错 —— 护栏不能拖垮正常调用。
 */
export function guardOutput(toolName, value, args = {}) {
  const violations = [];
  for (const r of GUARD_RULES) {
    try {
      const res = r.check(toolName, value, args);
      if (res && res.hit) violations.push({ id: r.id, severity: r.severity, title: r.title, lesson: r.lesson, evidence: res.evidence || '' });
    } catch (e) {
      violations.push({ id: r.id, severity: 'warn', title: r.title, lesson: r.lesson, evidence: '护栏自身异常（已忽略，不影响调用）: ' + String(e.message).slice(0, 60) });
    }
  }
  return {
    ok: violations.filter((v) => v.severity === 'error').length === 0,
    violations,
    checked: GUARD_RULES.length,
    errors: violations.filter((v) => v.severity === 'error').length,
    warnings: violations.filter((v) => v.severity === 'warn').length,
  };
}

/** 检查入参（当前主要是给料上限这类前置约束） */
export function guardInput(toolName, args = {}) {
  const out = [];
  const feed = Number(args.max_feed_mm ?? args.feed_p80_mm ?? args.max_feed ?? NaN);
  if (/cone_selection|capacity_check|crusher_curve/.test(toolName) && Number.isFinite(feed) && feed > 350) {
    out.push({ id: 'GR-02', severity: 'error', title: '给料超过圆锥破适用范围', evidence: feed + ' mm > 350 mm —— 应改用粗碎设备或明确告警' });
  }
  return { ok: out.filter((x) => x.severity === 'error').length === 0, violations: out };
}

/** 给输出附加护栏报告（不改变原有字段，只追加 _guardrails） */
export function attachGuardrails(toolName, value, args = {}) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const g = guardOutput(toolName, value, args);
    if (g.violations.length === 0) return value;
    return {
      ...value,
      _guardrails: {
        checked_rules: g.checked,
        errors: g.errors,
        warnings: g.warnings,
        violations: g.violations,
        note: '运行时护栏自动检查结果。error 级表示违反了 CLAUDE.md 硬规矩或已确认的教训，应修复；warn 级表示值得关注。护栏本身不会阻断调用。',
      },
    };
  } catch { return value; }
}

/** 规则清单（供文档与自检使用） */
export function listRules() {
  return GUARD_RULES.map((r) => ({ id: r.id, severity: r.severity, lesson: r.lesson, title: r.title, detail: r.detail }));
}

/* CLI */
if (process.argv[1] && process.argv[1].endsWith('guardrails.mjs')) {
  console.log('\n' + '═'.repeat(98));
  console.log('  运行时护栏规则（' + GUARD_RULES.length + ' 条）');
  console.log('═'.repeat(98) + '\n');
  for (const r of GUARD_RULES) {
    console.log('  ' + (r.severity === 'error' ? '🔴' : '🟡') + ' ' + r.id + '  ' + r.title);
    console.log('       ' + r.detail);
    console.log('       来源: ' + r.lesson);
    console.log('');
  }
}
