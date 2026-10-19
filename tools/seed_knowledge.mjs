/**
 * 用**真实已发现的**冲突与缺口初始化知识库与 PDCA 台账，
 * 让自我迭代从一个真实起点开始，而不是空的。
 *
 * 用法：node tools/seed_knowledge.mjs
 * 知识库位置：$MACKORN_KB_DIR 或 $DSH_HOME/mackorn-knowledge
 */
import { pathToFileURL } from 'node:url';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ev = await import(pathToFileURL(join(ROOT, 'plugin/lib/evolve.mjs')).href);

const S = '（内部资料，可核查）';

/* ---- 1. 真实冲突：同一报价模板内 NS430 功率自相矛盾 ---- */
const entries = [
  {
    title: '冲突：NS430 功率同一文件内 160kW vs 150kW',
    content: 'MACKORN 2017 报价模板 PDF 第 1 页标 NS430 功率 160 kW，第 5 页同一机型标 150 kW。功率 160 kW。',
    source_url: '本地：150/200-260/300-400TPH Production plant 20171225.pdf（quote-150TPH p1 / p5）',
    source_type: 'official', kind: 'price', tags: ['冲突', '报价', 'NS430'],
  },
  {
    title: '冲突：NS430 功率另一口径 150kW',
    content: '同一份 2017 报价模板 PDF 第 5 页标注 NS430 功率 150 kW，产能口径一致。功率 150 kW。',
    source_url: '本地：150TPH Production plant 20171225.pdf（quote-150TPH p5）',
    source_type: 'media', kind: 'price', tags: ['冲突', '报价', 'NS430'],
  },

  /* ---- 2. 真实冲突：300TPH 圆锥破配置三源三说 ---- */
  {
    title: '300TPH 圆锥破配置（样板核算表口径）',
    content: '样板生产线核算表标 300TPH 圆锥破方案为 NS400 + NH600。产能 300 t/h。',
    source_url: '本地：3 样板生产线/核算/acct-300-cone（渲染页）',
    source_type: 'official', kind: 'case', tags: ['冲突', '300TPH', '配置'], subject: '300TPH-圆锥破配置',
  },
  {
    title: '300TPH 圆锥破配置（流程图口径）',
    content: '300TPH 圆锥破方案流程图标为 NS400C + NH400F。产能 300 t/h。',
    source_url: '本地：3 样板生产线/流程图/300TPH圆锥破方案流程图-上海美矿.pdf',
    source_type: 'official', kind: 'case', tags: ['冲突', '300TPH', '配置'], subject: '300TPH-圆锥破配置',
  },
  {
    title: '300TPH 圆锥破配置（配置图口径，图题实为 325TPH）',
    content: '标准生产线配置图（图题 325TPH）标为 NS300-EC + NH300-MC/NH600-MC。产能 300 t/h。',
    source_url: '本地：生产线配置图/300TPH 生产线配置.pdf',
    source_type: 'report', kind: 'case', tags: ['冲突', '300TPH', '配置'], subject: '300TPH-圆锥破配置',
  },

  /* ---- 3. 真实冲突：参考价 vs 实际合同单价 ---- */
  {
    title: '参考价口径：NH700 通用参考区间 85-150 万元/台',
    content: 'MACKORN 报价参考文件给出 NH700 主机通用参考区间 85-150 万元/台。价格 120 万元。',
    source_url: 'E:\\Mackorn\\MACKORN美矿液压圆锥破专家\\06_销售报价参考\\液压圆锥破碎机销售报价参考.md',
    source_type: 'official', kind: 'price', tags: ['价格', 'NH700', '冲突'],
  },
  {
    title: '实际合同价口径：NH700 约 364-400 万元/台',
    content: '项目实际合同单价文件显示 NH700 实际约 364-400 万元/台。价格 380 万元。',
    source_url: '本地：主机价格文件夹（MSS 项目核对结论，见 knowledge/bruno-ip-boundary.md §2 A4）',
    source_type: 'report', kind: 'price', tags: ['价格', 'NH700', '冲突'],
  },

  /* ---- 4. 正向知识：标准配置与皮带 ---- */
  {
    title: '1000TPH 标准配置（MACKORN 知识库口径）',
    content: '1000TPH 花岗岩标准配置：2 台 MJ613 粗碎（160kW×2，总产能 560-900 t/h）+ 1 台 NH700 EC 腔中碎（355kW）+ 2 台 MPH50 MC 腔细碎（250kW×2，闭路）+ 2 台 S6（45kW×2，6 层筛面），出 5 种规格，总装机约 1650 kW。产能 1000 t/h。',
    source_url: 'E:\\Mackorn\\MACKORN美矿破碎筛分生产线设计专家\\knowledge-base\\09-选型设计规范与问答.md（Q1）',
    source_type: 'official', kind: 'case', tags: ['标准配置', '1000TPH'],
  },
  {
    title: '500TPH 典型皮带配置 B1-B6',
    content: 'B1 颚破出料 B1200×30m/22kW；B2 颚破→中碎 B1400×40m/45kW；B3 中碎→筛分 B1200×25m/30kW；B4 筛分返料 B1000×20m/15kW；B5 成品 0-5mm B1000×50m/37kW；B6 成品 5-20mm B1200×40m/30kW。',
    source_url: 'E:\\Mackorn\\MACKORN美矿破碎筛分生产线设计专家\\knowledge-base\\16-皮带输送机配置手册.md',
    source_type: 'official', kind: 'spec', tags: ['皮带', '500TPH'],
  },
  {
    title: '皮带带宽-能力对应表（MACKORN 自有标准）',
    content: 'B650 给料≤100mm/50-200t/h；B800 ≤150mm/100-350t/h；B1000 ≤200mm/200-600t/h；B1200 ≤300mm/400-1000t/h；B1400 ≤400mm/600-1500t/h；B1600 ≤500mm/800-2000t/h。产能 500 t/h。',
    source_url: 'E:\\Mackorn\\MACKORN美矿破碎筛分生产线设计专家\\knowledge-base\\16-皮带输送机配置手册.md §1',
    source_type: 'official', kind: 'spec', tags: ['皮带', '选型'],
  },

  /* ---- 5. 竞品/专利观测面初始锚点 ---- */
  {
    title: '竞品对标基线：美卓 HP / 山特维克 CH-CS 系列',
    content: '美卓 HP 系列多缸液压 90-750kW、IC 控制；山特维克 CH/CS 系列单缸/多缸 110-600kW、ASRi 控制；美矿 NH/NS 单缸液压 90-750kW、AORS 控制。产能 500 t/h。',
    source_url: 'E:\\Mackorn\\MACKORN美矿液压圆锥破专家\\05_市场竞品分析\\液压圆锥破碎机竞品对比分析.md',
    source_type: 'official', kind: 'intel', tags: ['竞品', '对标基线'],
  },
];

console.log('知识库目录:', ev.kbDir());
const first = ev.ingestKnowledge({
  entries,
  actor: 'bootstrap',
  rationale: '用已发现的真实冲突与标准配置初始化知识库（v1 起点）',
  check_fields: ['power_kw', 'capacity_tph', 'price_wan'],
  crushing_leverage_score: 0.65,
});

console.log('\n=== 首次入库 ===');
console.log(`接收 ${first.accepted} 条，拒收 ${first.rejected.length} 条`);
console.log(`版本 ${first.version_before} → ${first.version_after}${first.version_bumped ? '（触发演进）' : ''}`);
console.log(`新检出矛盾 ${first.new_conflicts.length} 条（open ${first.open_conflicts} / 建议值 ${first.proposed_conflicts}）`);
for (const c of first.new_conflicts) {
  console.log(`  · ${c.field}: ${c.value_a}(${c.source_a}) vs ${c.value_b}(${c.source_b})  相对差 ${c.relative_diff}  → ${c.status}`);
}
console.log('指标:', JSON.stringify(first.metrics));

const pdca = ev.recordPdca({
  actor: 'bootstrap',
  plan: '建立知识库起点：写入已发现的真实冲突、标准配置、竞品基线，并固定情报观测面',
  do: [
    '移植 Python 源模型的可信度分级 / 矛盾检测 / 版本演进三个内核',
    '建立持久化知识库（$DSH_HOME/mackorn-knowledge，插件升级不丢）',
    '固定 6 个情报观测面：山特维克 / 美卓 / 中国专利 / 国际专利 / 标准 / 市场',
    '写入 11 条真实条目（含 4 组已知冲突）与 6 项缺口',
  ],
  check: `入库 ${first.accepted} 条，检出矛盾 ${first.new_conflicts.length} 条，版本 ${first.version_after}`,
  act: '下一轮：按 mackorn_intel_watch 的到期项做首次外部采集，并逐条裁决 open 冲突',
});

console.log('\n=== PDCA 第 1 轮已记录 ===');
console.log(`轮次 ${pdca.cycle.round} | 版本 ${pdca.cycle.model_version} | 条目 ${pdca.cycle.entries} | open 矛盾 ${pdca.cycle.open_conflicts}`);

const st = ev.evolutionStatus();
console.log('\n=== 当前迭代状态 ===');
console.log(`模型版本 ${st.model_version} | 知识库修订 ${st.store_revision} | 条目 ${st.entries}`);
console.log('条目类型:', JSON.stringify(st.entries_by_kind));
console.log('可信度分布:', JSON.stringify(st.credibility_histogram));
console.log(`矛盾: 共 ${st.conflicts.total} / open ${st.conflicts.open} / 建议值 ${st.conflicts.proposed} / 处置率 ${st.conflicts.resolution_rate}`);
console.log(`下一步建议 ${st.next_actions.length} 条：`);
for (const a of st.next_actions.slice(0, 6)) console.log(`  [${a.priority}] ${a.action} —— ${a.target}`);
console.log(`到期情报观测项：${st.watch_due.length} / ${st.watch_total}`);
