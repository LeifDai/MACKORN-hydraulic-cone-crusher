/**
 * 全矿山价值链知识库 · 架构与路线图（R106）
 *
 * 用户目标（2026-10-19）：
 *   「不断完善插件自己的行业知识；包括
 *     采矿（开采和爆破，剥离，短倒（短驳）），
 *     磨矿（半自磨机，球磨机，分级机，旋流器），
 *     选矿（浮选、重选、光电选（激光、图像）），
 *     成为采矿、破碎、磨矿、选矿及自动化模型选矿的专家；
 *     全球顶尖的专家，擅长工艺、材料、电气驱动、自动化程序和设备，
 *     最后，以破碎设备为基础，把矿山设备、选矿设备，在 AI 加持下不断丰富和自我迭代。」
 *
 * 本文件定义知识架构 + 分阶段路线图 + 数据纪律。
 * 实际数据分文件：data-mining.mjs / data-grinding.mjs / data-processing.mjs / data-automation.mjs
 */

/* ══════════════════════════════════════════════════════════════
 * 一、价值链全景（这是知识库的顶层骨架）
 * ══════════════════════════════════════════════════════════════ */

export const VALUE_CHAIN = [
  {
    stage: 1, id: 'mining', name: '采矿', name_en: 'Mining',
    scope: ['开采方式（露天/地下）', '爆破（孔网参数/炸药单耗/块度分布）', '剥离（剥采比/排土）', '短倒短驳（铲装/卡车/皮带）'],
    key_outputs: ['原矿块度分布 P80', '原矿含水率', '含土率', '年产能', '剥采比'],
    downstream_link: '原矿块度分布决定粗碎给料上限与破碎段数',
    status: 'planned',
  },
  {
    stage: 2, id: 'crushing', name: '破碎', name_en: 'Crushing',
    scope: ['粗碎（颚破/旋回）', '中碎（圆锥破）', '细碎（圆锥破/高压辊磨）', '筛分（振动筛/概率筛）'],
    key_outputs: ['各段产品 P80', '循环负荷', '成品率', '装机功率'],
    downstream_link: '破碎产品 P80 决定磨矿给料粒度与磨机选型',
    status: 'done',  /* 现有 22 工具覆盖 */
  },
  {
    stage: 3, id: 'grinding', name: '磨矿', name_en: 'Grinding',
    scope: ['半自磨机 SAG', '球磨机 Ball mill', '分级机 Classifier', '旋流器 Cyclone', '高压辊磨 HPGR'],
    key_outputs: ['磨矿细度 P80', '循环负荷', '比能耗 kWh/t', '钢球消耗', '处理量 tph'],
    downstream_link: '磨矿细度决定选别指标（回收率/品位）',
    status: 'done',  /* R107：磨矿知识库 + mackorn_grinding_selection 工具已上线 */
  },
  {
    stage: 4, id: 'processing', name: '选矿', name_en: 'Mineral Processing',
    scope: ['浮选 Flotation', '重选 Gravity', '光电选 Ore sorting（激光/图像/XRT）', '磁选 Magnetic', '浸出 Leaching'],
    key_outputs: ['回收率', '精矿品位', '尾矿品位', '选比', '单位处理成本'],
    downstream_link: '选别指标决定最终经济效益',
    status: 'in_progress',  /* R108：选矿知识库 + mackorn_beneficiation_selection 已上线 */
  },
  {
    stage: 5, id: 'automation', name: '自动化与模型选矿', name_en: 'Automation & Model-based Selection',
    scope: ['过程控制（DCS/PLC）', '在线检测（粒度/品位）', '模型预测控制 MPC', '数字孪生', '专家系统'],
    key_outputs: ['控制回路', '仪表清单', '模型精度', '节能量'],
    downstream_link: '自动化把前面各段的经验固化成可复现的控制策略',
    status: 'in_progress',  /* R112：自动化知识库 + mackorn_automation_design 已上线 */
  },
];

/* ══════════════════════════════════════════════════════════════
 * 二、六项能力维度（用户明确要求「擅长工艺、材料、电气驱动、自动化程序和设备」）
 * ══════════════════════════════════════════════════════════════ */

export const CAPABILITY_DIMENSIONS = [
  { id: 'process', name: '工艺', desc: '流程设计、段数分配、循环负荷、指标平衡' },
  { id: 'material', name: '材料', desc: '矿石性质（硬度/磨蚀/解离度）、耐磨材料（高锰钢/高铬/陶瓷复合）' },
  { id: 'drive', name: '电气驱动', desc: '电机选型、变频、软启动、功率因数、电网冲击' },
  { id: 'automation', name: '自动化程序', desc: 'PLC/DCS 组态、控制策略、联锁、在线检测' },
  { id: 'equipment', name: '设备', desc: '机型参数、结构、易损件、维护周期' },
  { id: 'economics', name: '经济性', desc: '投资、电耗、易损件、运营成本（不对外报价）' },
];

/* ══════════════════════════════════════════════════════════════
 * 三、数据纪律（继承现有五条硬规矩，一条不放松）
 * ══════════════════════════════════════════════════════════════ */

export const DATA_DISCIPLINE = [
  { id: 'D1', rule: '绝不编造数字', how: '未知字段返回 null，进 warnings', why: '编造一个数字会让客户买错设备' },
  { id: 'D2', rule: '每个结论带来源', how: 'S1 厂商 / S2 标准 / S3 文献 / S4 现场经验 / S5 手册 / S6 设计规范', why: '没有来源的数字不该进代码' },
  { id: 'D3', rule: '冲突并列，绝不平均', how: 'conflict[] 数组保留两方', why: '取平均会把明确矛盾变成看不见的错误' },
  { id: 'D4', rule: '承认边界', how: '不同设备有各自的适用边界，越界必须拒绝或告警', why: '拿球磨公式算旋流器会给出误导结果' },
  { id: 'D5', rule: '不信任自我报告', how: '每条数据要么有文献/手册出处，要么标注 S4 经验区间', why: '"我记得好像是这样"不是数据' },
];

/* ══════════════════════════════════════════════════════════════
 * 四、分阶段路线图（每阶段可验证的交付物）
 * ══════════════════════════════════════════════════════════════ */

export const ROADMAP = [
  {
    phase: 'P1', name: '磨矿知识库（本轮启动）',
    deliverable: 'data-grinding.mjs：SAG/球磨/分级机/旋流器的选型参数、能力公式、边界',
    verification: '能回答：给定 tph + 给料 P80 + 目标 P80，选什么磨机/几台/多大功率',
    status: 'in_progress',
  },
  {
    phase: 'P2', name: '磨矿工具（mackorn_grinding_selection）',
    deliverable: '第 23 个工具，与现有 22 个同纪律（assumptions/warnings/null）',
    verification: 'tools/verify_all_tools.mjs 覆盖，负控通过',
    status: 'planned',
  },
  {
    phase: 'P3', name: '选矿知识库',
    deliverable: 'data-processing.mjs：浮选/重选/光电选的适用条件、指标区间、能耗',
    verification: '能回答：这种矿用什么选别方法，预期回收率区间',
    status: 'planned',
  },
  {
    phase: 'P4', name: '采矿知识库',
    deliverable: 'data-mining.mjs：爆破块度预测、剥采比、铲装匹配',
    verification: '能回答：原矿块度分布大概什么形状，对破碎段数的影响',
    status: 'planned',
  },
  {
    phase: 'P5', name: '自动化知识库',
    deliverable: 'data-automation.mjs：控制回路、仪表清单、联锁逻辑',
    verification: '能生成破碎磨矿车间的仪表与联锁清单',
    status: 'planned',
  },
  {
    phase: 'P6', name: '整线贯通',
    deliverable: '从采矿到选矿的端到端方案书（现有 14 章扩展到全流程）',
    verification: '一条 1000 tph 铁矿石线能从爆破参数一路算到精矿指标',
    status: 'planned',
  },
];

/* ══════════════════════════════════════════════════════════════
 * 五、云端自我迭代（用户要求「电脑关闭时云端运行」）
 * ══════════════════════════════════════════════════════════════ */

export const CLOUD_ITERATION = {
  mechanism: 'GitHub Actions · .github/workflows/nightly-self-iteration.yml',
  frequency: '每 2 小时',
  what_it_does: [
    '跑全部门禁（tests/enforce_lessons/build_public/check_live_health/upload_consistency）',
    '写心跳（防 60 天无活动被禁用）',
    '把证据写回仓库（夜间报告 / 检查结果 JSON）',
  ],
  what_it_cannot_do: [
    '自己发明新知识（它只能跑检查，不能创造数据）',
    '续 SSL 证书（需服务器凭据）',
    '发布 npm（需 token）',
  ],
  honest_note: '云端能持续【守】，不能持续【长】。知识扩展仍需要有人（或 AI 会话）来写数据。',
  known_issue: '2026-10-19 首次触发时排队中（CI 并发占满），需观察是否真能跑完',
};

/* ══════════════════════════════════════════════════════════════
 * 六、知识扩展的纪律（防"越写越虚"）
 * ══════════════════════════════════════════════════════════════ */

export const EXPANSION_RULES = [
  { id: 'E1', rule: '每个新领域必须先有【可验证的数据结构】，再谈工具', why: '没有数据结构的"专家"是空壳' },
  { id: 'E2', rule: '新数据必须有出处（S1-S6）或明确标注 S4 经验区间', why: '继承 D2' },
  { id: 'E3', rule: '不确定的区间宁可写宽，不许写窄', why: '写窄会误导选型' },
  { id: 'E4', rule: '每个新工具必须配负控与门禁', why: '继承 L-55/L-85' },
  { id: 'E5', rule: '跨设备计算必须有边界检查（不能拿球磨公式算旋流器）', why: '继承 D4' },
  { id: 'E6', rule: '每扩一个领域，必须更新 VALUE_CHAIN 的 status', why: '让进度可测，不靠印象' },
];
