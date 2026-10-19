/**
 * 护栏全量负控（S1 修复）
 *
 * 由对抗性审查（R18）驱动建成。审查发现：17 条护栏只有 GR-02/GR-04 有负控，
 * 其余 13 条可整条禁用而门禁全绿 —— 含全部 error 级硬规矩。
 *
 * 本脚本为【每一条】规则构造一个"必须被它抓到"的合成输出（严格按其真实判据构造）。
 * 门禁会断言：listRules() 的每个 id 都在此有样本，且样本确实被命中。
 * → 新增规则若忘配负控，门禁直接红，修掉"新增规则自动变成无验证规则"的失败模式。
 *
 * 附带正控：这些场景必须【不】命中（防止把规则改成一律报错）。
 */
import { pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const G = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'guardrails.mjs')).href);

export const TRIGGERS = {
  'GR-01': {
    tool: 'mackorn_cone_selection',
    args: { target_tph: 300 },
    value: { recommended: { model: 'NH400' }, power_kw: { estimated: true, value: null } },
    why: '把 null 用 estimated 标记的估算值填补',
  },
  'GR-02': {
    tool: 'mackorn_cone_selection',
    args: { target_tph: 300, max_feed_mm: 600 },
    value: { recommended: { model: 'NH400' }, notes: ['给料 600mm'] },
    why: '单台圆锥破接受 600mm 给料且未拒绝',
  },
  'GR-02b': {
    tool: 'mackorn_plant_design',
    args: { target_tph: 300, max_feed_mm: 600 },
    value: { stages: [{ feed_p80_mm: 500, type: 'crusher' }] },
    why: '整线段入料 P80 500mm 但无粗碎说明',
  },
  'GR-03': {
    tool: 'mackorn_cone_selection',
    args: { target_tph: 300 },
    value: { recommended: { model: 'NH400', css_mm: 16 } },
    why: '产出数值但既无 assumptions 也无来源字段',
  },
  'GR-04': {
    tool: 'mackorn_cone_selection',
    args: { target_tph: 300 },
    value: { recommended: { model: 'NH400' }, hardness: { averaged: 120 } },
    why: '出现 averaged 合并字段（违反"冲突不取平均"）',
  },
  'GR-05': {
    tool: 'mackorn_cost_estimate',
    args: { model: 'NH400' },
    value: { unit_price_committed: '100 万元/台' },
    why: '给出可当报价的确定价格且无免责',
  },
  'GR-06': {
    tool: 'mackorn_distributor_eval',
    args: { agent_type: '公司' },
    value: { assessment: '该合同合法有效' },
    why: '经销商评估给出法律结论',
  },
  'GR-07': {
    tool: 'mackorn_two_centers',
    args: {},
    value: { results: [{ id: 'X', status: 'UNKNOWN' }], coverage_pct: 43 },
    why: '有 UNKNOWN 但未声明"不计入分母"',
  },
  'GR-08': {
    tool: 'mackorn_two_centers',
    args: {},
    value: { channels: [{ id: 'C1', reachable: true }] },
    why: '报了通道可达但未区分是否被收录',
  },
  'GR-09': {
    tool: 'mackorn_sync_ai_index',
    args: {},
    value: { classified: 90, pages: 97, sections: ['a', 'b'] },
    why: '索引生成未见覆盖率断言',
  },
  'GR-10': {
    tool: 'mackorn_build_public',
    args: {},
    value: { replaced: 5, files_changed: ['a.mjs'] },
    why: '报告了替换动作但无回读校验记录',
  },
  'GR-11': {
    tool: 'mackorn_build_public',
    args: {},
    value: { batch_replaced: 235, batch_files: ['x.mjs'] },
    why: '批量替换未见幂等性/规则安全验证',
  },
  'GR-12': {
    tool: 'mackorn_simulate_flowsheet',
    args: { feed_p80_mm: 300, stages: [{ type: 'crusher', css_mm: 40 }] },
    value: { final_p80_mm: 20, stages: [] },
    why: '仿真输出未自报质量守恒',
  },
  'GR-13': {
    tool: 'mackorn_knowledge_update',
    args: {},
    value: { accepted: [{ brand: 'Metso', model: 'HP4', source_url: '' }] },
    why: '有品牌/型号但无出处的条目被接受',
  },
  'GR-14': {
    tool: 'mackorn_knowledge',
    args: { ore: '铝土矿' },
    // 判据：输出含 hardness_grade/wear_grade 但无 hardness_basis/wear_basis/中位数
    value: { material_hints: { hardness_grade: '硬', wear_grade: '高', properties: { ucs_mpa: { range: [30, 150] } } } },
    why: '有分级但未说明分级依据（中位数/上限）',
  },
  'GR-15': {
    tool: 'mackorn_crusher_curve',
    args: { css_mm: 16, feed_p80_mm: 120, speed_rpm: 500 },
    value: { product_p80_mm: 12, warnings: [] },
    why: '转速 >400 rpm 未告警堵料',
  },
  'GR-16': {
    tool: 'mackorn_crusher_curve',
    args: { css_mm: 16, feed_p80_mm: 120, speed_rpm: 200 },
    value: { product_p80_mm: 60, warnings: [] },
    why: '转速 <250 rpm 未告警不可信',
  },
  'GR-17': {
    /* R35 独立验证（Evertsson 真实参数）：给料 P80 40mm 配 CSS 8mm（比值 5.1）
     *   —— 一次通过破碎比只有 2.9，而真实细碎腔可达 4–6。
     *   ⚠️ 这条负控是在【真实工具输出】上验过的（不是手写载荷）：
     *      实测 40/8=5.1 命中、25/8=3.1 不命中、120/16=7.6 命中。 */
    tool: 'mackorn_crusher_curve',
    args: { css_mm: 8, feed_p80_mm: 40 },
    value: { css_mm: 8, feed_p80_mm: 40.852, product_p80_mm: 14.089, reduction_ratio: 2.9 },
    why: '给料 P80 / CSS = 5.1（>4）时未告警"破碎比受限"',
  },
};

/** 正控：这些场景必须【不】命中 */
export const POSITIVE = [
  { id: 'GR-02', tool: 'mackorn_plant_design', args: { max_feed_mm: 600 }, value: { stages: [] }, note: '整线吃大块矿正常，单机规则不应命中' },
  { id: 'GR-02', tool: 'mackorn_cone_selection', args: { max_feed_mm: 600 }, value: { refused: true, reason: '给料超限' }, note: '已明确拒绝，不应命中' },
  { id: 'GR-08', tool: 'mackorn_market_intel', args: { focus: '哈' }, value: { dimensions: [{ name: '可操作性', how_to_score: '物流可达性' }] }, note: '「物流可达性」不是通道可达声明' },
  { id: 'GR-10', tool: 'mackorn_proposal', args: { capacity_tph: 300 }, value: { markdown: '交付时应替换为标准工艺流程图' }, note: '模板句不是替换动作报告' },
  { id: 'GR-11', tool: 'mackorn_cost_estimate', args: { model: 'NH400' }, value: { price_factors: [{ factor: '数量规模（批量折扣）' }] }, note: '「批量折扣」不是批量替换报告' },
  { id: 'GR-15', tool: 'mackorn_crusher_curve', args: { speed_rpm: 500 }, value: { warnings: ['转速 500 rpm 超过 400 会堵料 packing'] }, note: '已告警，不应命中' },
  { id: 'GR-16', tool: 'mackorn_crusher_curve', args: { speed_rpm: 200 }, value: { warnings: ['低转速区不可信，仅供参考'] }, note: '已告警，不应命中' },
];

export function runAll() {
  const rules = G.listRules();
  const out = [];
  for (const r of rules) {
    const t = TRIGGERS[r.id];
    if (!t) { out.push({ id: r.id, ok: false, detail: '未配负控样本' }); continue; }
    const g = G.guardOutput(t.tool, t.value, t.args);
    const hit = g.violations.some((v) => v.id === r.id);
    out.push({ id: r.id, ok: hit, detail: hit ? '负控命中' : '漏网' });
  }
  const posOut = [];
  for (const p of POSITIVE) {
    const g = G.guardOutput(p.tool, p.value, p.args);
    const hit = g.violations.some((v) => v.id === p.id);
    posOut.push({ id: p.id, ok: !hit, detail: hit ? '正控失败（误报）' : '正控通过', note: p.note });
  }
  const missing = rules.map((r) => r.id).filter((id) => !TRIGGERS[id]);
  return {
    results: out, positives: posOut, missing,
    total: rules.length, passed: out.filter((x) => x.ok).length,
    posPassed: posOut.filter((x) => x.ok).length, posTotal: posOut.length,
    ok: out.every((x) => x.ok) && posOut.every((x) => x.ok) && missing.length === 0,
  };
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirect) {
  const r = runAll();
  console.log('');
  console.log('  负控（每条规则必须被抓到）:');
  for (const x of r.results) console.log('    ' + (x.ok ? '✅' : '❌') + ' ' + x.id.padEnd(8) + x.detail);
  console.log('');
  console.log('  正控（不应误报）:');
  for (const x of r.positives) console.log('    ' + (x.ok ? '✅' : '❌') + ' ' + x.id.padEnd(8) + x.detail + '  （' + x.note + '）');
  if (r.missing.length) console.log('\n  ❌ 无负控样本的规则: ' + r.missing.join(', '));
  console.log('');
  console.log('  负控 ' + r.passed + '/' + r.total + ' · 正控 ' + r.posPassed + '/' + r.posTotal + (r.ok ? '  ✅' : '  ❌'));
  console.log('');
  process.exit(r.ok ? 0 : 1);
}
