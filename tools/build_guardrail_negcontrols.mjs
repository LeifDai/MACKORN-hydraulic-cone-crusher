/**
 * S1 修复：给全部 17 条护栏配负控 + 门禁强制"每条规则至少被一个负控命中"
 *
 * 对抗性审查发现（R18）：
 *   enforce_lessons.mjs 只写了 4 个护栏负控，仅覆盖 GR-02 与 GR-04。
 *   把 GR-01/05/06/07/08/09/10/11/12/13/14/15/16 的 check() 全改成 return {hit:false}
 *   之后，门禁仍然输出「合计 15/15 ✅ 门禁通过」——即 76% 的护栏处于无人验证状态，
 *   其中包含全部 error 级核心硬规矩（GR-01 不得估算填充 null、GR-12 必须自报质量守恒）。
 *
 * 修法（两条，缺一不可）：
 *   ① 为每条规则构造一个"必须被它抓到"的合成输出；
 *   ② 门禁遍历 listRules() 的每一个 id，断言"该 id 至少被一个负控命中"，
 *      并断言"把该规则禁用后，该负控必须失败"（真正的 mutation 自测）。
 *
 * 这样新增规则如果忘了配负控，门禁会直接红 —— 修掉"新增规则自动变成无验证规则"的失败模式。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const G = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'guardrails.mjs')).href);
const rules = G.listRules();

console.log('\n' + '='.repeat(96));
console.log('  S1 修复：为 ' + rules.length + ' 条护栏构造负控样本');
console.log('='.repeat(96) + '\n');

/* ── 每条规则的"必须被抓到"的合成调用 ──
 * 格式：id → { tool, args, value }  value 是【故意违规】的输出
 * 判据：guardOutput(tool, value, args) 必须命中该 id
 */
const TRIGGERS = {
  'GR-01': {
    tool: 'mackorn_cone_selection',
    args: { target_tph: 300, max_feed_mm: 200 },
    value: { recommended: { capacity_tph: '约 300 t/h（估算）' }, product: 'NH400' },
    why: '输出里把缺口用"约…估算"填补',
  },
  'GR-02': {
    tool: 'mackorn_cone_selection',
    args: { target_tph: 300, max_feed_mm: 600 },
    value: { product: 'NH400', note: '处理 600mm 给料' },
    why: '单机圆锥破接受 >350mm 给料且未拒绝',
  },
  'GR-02b': {
    tool: 'mackorn_plant_design',
    args: { target_tph: 300, max_feed_mm: 600 },
    value: { raw_feed_mm: 600 },
    why: '（正向）整线可以吃大块矿 —— 这条应【不】报错',
    expectNoHit: true,
  },
  'GR-03': {
    tool: 'mackorn_cone_selection',
    args: { target_tph: 300 },
    value: { recommended: { model: 'NH400' } },
    why: '输出未带 assumptions 来源',
  },
  'GR-04': {
    tool: 'mackorn_cone_selection',
    args: { target_tph: 300 },
    value: { recommended: { model: 'NH400' }, assumptions: [{ assumption: 'x', source: '' }] },
    why: '假设缺来源',
  },
  'GR-05': {
    tool: 'mackorn_knowledge_update',
    args: {},
    value: { accepted: [{ title: '无出处条目', content: '某参数 300t/h' }], rejected: [] },
    why: '知识条目缺 source_url 仍被接受',
  },
  'GR-06': {
    tool: 'mackorn_cost_estimate',
    args: { model: 'NH400' },
    value: { price: '100 万元', disclaimers: [] },
    why: '把价格写成确定报价、无免责',
  },
  'GR-07': {
    tool: 'mackorn_distributor_eval',
    args: { agent_type: '公司' },
    value: { grade: 'A', credit_limit: '500万', legal_opinion: '合同合法有效' },
    why: '给出法律意见',
  },
  'GR-08': {
    tool: 'mackorn_market_intel',
    args: { focus: '哈萨克斯坦' },
    value: { verdict: { decided: true, verdict: 'priority_go', weighted_score: 4.5, recommended_action: '立刻投入' }, evidence_discipline: [] },
    why: '无证据支撑就下明确结论',
  },
  'GR-09': {
    tool: 'mackorn_cone_selection',
    args: { target_tph: 300 },
    value: { recommended: { model: 'NH400', css_mm: 5 }, css_range_mm: [8, 44], warnings: [] },
    why: 'CSS 超出机型范围且未告警',
  },
  'GR-10': {
    tool: 'mackorn_proposal',
    args: { capacity_tph: 300 },
    value: { markdown: '本方案最终解释权归本公司所有', disclaimers: [] },
    why: '含排他性/免责式法律表述',
  },
  'GR-11': {
    tool: 'mackorn_cost_estimate',
    args: { model: 'NH400' },
    value: { price_reference: { note: '批量折扣后更低' }, disclaimers: [] },
    why: '承诺折扣',
  },
  'GR-12': {
    tool: 'mackorn_simulate_flowsheet',
    args: { feed_p80_mm: 300, stages: [{ type: 'crusher', css_mm: 40 }] },
    value: { final_p80_mm: 20, stages: [], circulating_load: 1.2 },
    why: '仿真输出未自报质量守恒',
  },
  'GR-13': {
    tool: 'mackorn_calibrate',
    args: { css_mm: 16 },
    value: { fit: { rmse: 0.02, quality: '优' }, calibrated: { phi: 0.75, gamma: 0.05, beta: 8, throwFactor: 0.6 }, warnings: ['参数贴在搜索边界'] },
    why: '参数贴边界却判为"优"（正是审查员 S3 的形态）',
  },
  'GR-14': {
    tool: 'mackorn_capacity_check',
    args: { model: 'NH400', cavity: 'C', css: 16 },
    value: { capacity_rated_tph: 290, verdict: { asked: true, achievable: true, margin_pct: 0.5 } },
    why: '达标判定未标注不确定性',
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
};

/* ── 逐条验证 ── */
const results = [];
for (const r of rules) {
  const t = TRIGGERS[r.id];
  if (!t) { results.push({ id: r.id, ok: false, detail: '❌ 未配负控样本' }); continue; }
  const g = G.guardOutput(t.tool, t.value, t.args);
  const hit = g.violations.some((v) => v.id === r.id);
  if (t.expectNoHit) {
    results.push({ id: r.id, ok: !hit, detail: hit ? '❌ 误报（应不命中）' : '✅ 正控通过（正确地不命中）' });
  } else {
    results.push({ id: r.id, ok: hit, detail: hit ? '✅ 负控命中' : '❌ 漏网 —— 该规则可能形同虚设' });
  }
}

const okN = results.filter((x) => x.ok).length;
for (const x of results) console.log('  ' + x.id.padEnd(8) + x.detail + (TRIGGERS[x.id] ? '  （' + TRIGGERS[x.id].why + '）' : ''));
console.log('');
console.log('  覆盖 ' + okN + '/' + rules.length);

/* ── 写成一个可执行的自测脚本 ── */
const script = [
  '/**',
  ' * 护栏全量负控（S1 修复）',
  ' *',
  ' * 由对抗性审查（R18）驱动建成：审查发现 17 条护栏里只有 2 条（GR-02/GR-04）有负控，',
  ' * 其余 13 条可以整条禁用而不触发任何门禁 —— 包括全部 error 级硬规矩。',
  ' *',
  ' * 本脚本为【每一条】规则构造一个"必须被它抓到"的合成输出，并断言：',
  ' *   ① 负控：该规则必须命中',
  ' *   ② 正控：明确标注 expectNoHit 的规则必须不命中（防止把规则改成一律报错）',
  ' *',
  ' * 门禁（enforce_lessons.mjs）会调用本脚本，并额外断言"listRules() 的每个 id 都在此处有样本"，',
  ' * 使得【新增规则若忘配负控 → 门禁直接红】，修掉"新增规则自动变成无验证规则"的失败模式。',
  ' */',
  "import { pathToFileURL } from 'node:url';",
  "import { join, dirname, resolve } from 'node:path';",
  "import { fileURLToPath } from 'node:url';",
  '',
  "const HERE = dirname(fileURLToPath(import.meta.url));",
  "const ROOT = resolve(HERE, '..', '..');",
  "const G = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'guardrails.mjs')).href);",
  '',
  'export const TRIGGERS = ' + JSON.stringify(TRIGGERS, null, 2) + ';',
  '',
  'export function runAll() {',
  '  const rules = G.listRules();',
  '  const out = [];',
  '  for (const r of rules) {',
  '    const t = TRIGGERS[r.id];',
  '    if (!t) { out.push({ id: r.id, ok: false, detail: "未配负控样本" }); continue; }',
  '    const g = G.guardOutput(t.tool, t.value, t.args);',
  '    const hit = g.violations.some((v) => v.id === r.id);',
  '    if (t.expectNoHit) out.push({ id: r.id, ok: !hit, detail: hit ? "正控失败（误报）" : "正控通过" });',
  '    else out.push({ id: r.id, ok: hit, detail: hit ? "负控命中" : "漏网" });',
  '  }',
  '  // 反向断言：每条规则在样本表里都必须存在（防止新增规则无样本）',
  '  const missing = rules.map((r) => r.id).filter((id) => !TRIGGERS[id]);',
  '  return { results: out, missing, ok: out.every((x) => x.ok) && missing.length === 0, total: rules.length, passed: out.filter((x) => x.ok).length };',
  '}',
  '',
  'const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);',
  'if (isDirect) {',
  '  const r = runAll();',
  '  console.log("");',
  '  for (const x of r.results) console.log("  " + (x.ok ? "✅" : "❌") + " " + x.id.padEnd(8) + x.detail);',
  '  if (r.missing.length) console.log("\\n  ❌ 以下规则没有负控样本: " + r.missing.join(", "));',
  '  console.log("");',
  '  console.log("  护栏负控 " + r.passed + "/" + r.total + (r.ok ? "  ✅ 全部规则都有可响应的负控" : "  ❌ 有规则无人验证"));',
  '  console.log("");',
  '  process.exit(r.ok ? 0 : 1);',
  '}',
  '',
].join('\n');

const OUT = join(ROOT, 'tests', 'negative', 'guardrail_negative_controls.mjs');
writeFileSync(OUT, script, 'utf8');
console.log('  ✅ 已写 tests/negative/guardrail_negative_controls.mjs');
console.log('');

if (okN < rules.length) {
  console.log('  ⚠️ 有规则未通过负控，需调整样本：');
  for (const x of results.filter((y) => !y.ok)) console.log('     · ' + x.id + ' — ' + x.detail);
  console.log('');
}
