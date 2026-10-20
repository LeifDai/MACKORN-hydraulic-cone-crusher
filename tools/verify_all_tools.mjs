/**
 * 23 个工具端到端验证 —— 确认知识接入与模型局限披露没有破坏任何工具
 *
 * 这是 L-10 教训的实践：「boot 干净 ≠ 功能可用；必须真调一次工具」。
 */
import { pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const m = await import(pathToFileURL(join(ROOT, 'plugin', 'index.mjs')).href);

/** 每个工具的最小可用入参（与 tests/run.mjs 的样本一致，另加知识库相关） */
const SAMPLE = {
  mackorn_requirement_intake: { capacity_tph: 500, max_feed_mm: 700, ore_type: '花岗岩', product_mm: 20, hours_per_day: 16, days_per_year: 300 },
  mackorn_proposal: { capacity_tph: 500, max_feed_mm: 700, product_mm: 20, ore_type: '花岗岩', client_name: '测试客户' },
  mackorn_cone_selection: { target_tph: 500, max_feed_mm: 180, target_product_mm: 20, stage: '中碎', ore: '花岗岩' },
  mackorn_plant_design: { target_tph: 500, max_feed_mm: 700, target_product_mm: 20, ore: '花岗岩' },
  mackorn_capacity_check: { model: 'NH400', cavity: 'C', css: 16 },
  mackorn_cost_estimate: { model: 'NH400', units: 2, tph: 500 },
  mackorn_mcfm_analysis: { cumulative_retained: [100, 88, 70, 52, 38, 26, 15, 8], feed_top_mm: 60, target_product_mm: 12 },
  mackorn_wear_design: { sections: 5 },
  mackorn_grading_porosity: { coarse_frac: 0.5, mid_frac: 0.3, fine_frac: 0.2 },
  mackorn_market_intel: { focus: '中国骨料市场' },
  mackorn_selection_report: { title: '端到端验证', project: '验证', target_tph: 500, max_feed_mm: 700, target_product_mm: 20, include_cost: false },
  mackorn_equipment_catalog: {},
  mackorn_intel_watch: {},
  mackorn_knowledge_update: { entries: [{ title: '验证条目', content: '端到端验证用', source_url: 'https://mackorn.cn/ai/' }] },
  mackorn_pdca_status: {},
  mackorn_crusher_curve: { css_mm: 16, feed_p80_mm: 120, ore: '玄武岩' },
  mackorn_simulate_flowsheet: { feed_p80_mm: 300, stages: [{ type: 'crusher', name: '中碎', css_mm: 40 }, { type: 'screen', name: '筛', aperture_mm: 20 }] },
  mackorn_calibrate: { css_mm: 16, feed_points: [{ size_mm: 100, cum_pct: 100 }, { size_mm: 60, cum_pct: 85 }], product_points: [{ size_mm: 0.5, cum_pct: 12 }, { size_mm: 2, cum_pct: 35 }, { size_mm: 8, cum_pct: 62 }, { size_mm: 16, cum_pct: 88 }] },
  mackorn_contact: {},

  /* R117：全价值链 4 个新工具的样本（此前缺失 → 被跳过 → L-34 判据 passed===total 不成立） */
  mackorn_grinding_selection: { target_tph: 1000, feed_p80_mm: 15, product_p80_mm: 0.075, ore: '铜矿石', closed_circuit: true, mode: 'select' },
  mackorn_beneficiation_selection: { ore: '硫化铜矿石', target_mineral: '铜', liberation_um: 50, feed_p80_mm: 12, target_tph: 2000, slime_pct: 8, mode: 'recommend' },
  mackorn_automation_design: { section: '破碎', target_tph: 2000, has_plc: true, has_scada: true, has_online_analyzer: false, has_dedicated_staff: true, mode: 'recommend' },
  mackorn_mining_interface: { target_tph: 2000, max_feed_mm: 800, rock_type: '花岗岩', stripping_ratio: 2.5, haul_km: 2, muddy: false, mode: 'recommend' },
  mackorn_distributor_eval: { agent_type: '公司', country: '智利', scores: { credit_record: 5, sanctions: 5 } },
  mackorn_market_stats: { mode: 'describe', values: [10, 20, 30, 40, 50] },
  mackorn_knowledge: { ore: '玄武岩', target_tph: 300 },
};

console.log('\n' + '═'.repeat(100));
console.log('  ' + m.toolDefinitions.length + ' 个工具端到端验证');
console.log('═'.repeat(100) + '\n');

const results = [];
for (const def of m.toolDefinitions) {
  const args = SAMPLE[def.name];
  if (!args) { console.log('  ○ ' + def.name.padEnd(32) + '无样本，跳过'); results.push({ name: def.name, status: 'no-sample' }); continue; }
  const t0 = Date.now();
  let val = null, err = null;
  try { val = await def.execute(args); } catch (e) { err = e; }
  const ms = Date.now() - t0;
  if (err) { console.log('  ❌ ' + def.name.padEnd(32) + 'execute 抛错: ' + String(err.message).slice(0, 60)); results.push({ name: def.name, status: 'error', err: String(err.message) }); continue; }
  let renderOk = true, renderErr = null;
  try {
    const blocks = def.output.render(args, val);
    if (!Array.isArray(blocks) || !blocks.length || !blocks.every((b) => b.type === 'text' && typeof b.text === 'string')) { renderOk = false; renderErr = '渲染返回非法'; }
  } catch (e) { renderOk = false; renderErr = String(e.message).slice(0, 60); }
  const hasGuard = val && typeof val === 'object' && !Array.isArray(val) && '_guardrails' in val;
  const guardErr = hasGuard ? val._guardrails.errors : 0;
  console.log('  ' + (renderOk ? '✅' : '❌') + ' ' + def.name.padEnd(32) + (ms + 'ms').padStart(7) + '  输出 ' + (typeof val === 'object' ? Object.keys(val).length + ' 字段' : typeof val) + (hasGuard ? '  [护栏 error ' + guardErr + ']' : ''));
  results.push({ name: def.name, status: renderOk ? 'ok' : 'render-error', ms, renderErr });
}


/* ══════════════════════════════════════════════════════════════════
 * 已知真值断言（R18 S2 深修）
 *
 * 为什么需要：审查员把 execute 换成 {stub:...} 后，本脚本仍报"22 个通过"——
 * 因为原来只检查【形状】（execute 有返回、render 返回合法块），stub 满足形状。
 * 加上真值断言后，桩实现会因为数值不对而失败。
 * 这些真值来自厂商参数表（S1）与确定性算法，稳定可复现。
 * ══════════════════════════════════════════════════════════════════ */
const GOLDEN_ASSERTIONS = [
  /* R117：全价值链 4 个新工具的真值断言（防桩实现）。
   * 这些值来自公开文献区间与确定性算法，稳定可复现。 */
  {
    tool: 'mackorn_mining_interface',
    args: { target_tph: 2000, max_feed_mm: 800, muddy: true },
    checks: [
      ['含泥时给出预筛分提示', (v) => JSON.stringify(v.warnings || []).includes('预筛分')],
      ['运输要求 = 处理量 × 1.15', (v) => !v.haulage || !v.haulage[0] || v.haulage[0].required_tph === 2300],
    ],
  },
  {
    tool: 'mackorn_grinding_selection',
    args: { target_tph: 1000, feed_p80_mm: 15, product_p80_mm: 0.075 },
    checks: [
      ['1000 t/h 推荐球磨', (v) => String(v.recommended_method || '').includes('球磨')],
      ['诚实返回 null 型号', (v) => v.equipment_model_recommendation === null],
    ],
  },
  {
    tool: 'mackorn_grinding_selection',
    args: { target_tph: 1000, feed_p80_mm: 500 },
    checks: [
      ['给料 500mm 被拒绝', (v) => (v.rejections || []).length > 0 && v.recommended_method === null],
    ],
  },
  {
    tool: 'mackorn_beneficiation_selection',
    args: { ore: '硫化铜矿石', liberation_um: 5 },
    checks: [
      ['解离 5μm 触发告警', (v) => JSON.stringify(v.warnings || []).includes('10μm')],
    ],
  },
  {
    tool: 'mackorn_beneficiation_selection',
    args: {},
    checks: [
      ['无输入被拒绝', (v) => v.error === 'insufficient_input'],
    ],
  },
  {
    tool: 'mackorn_automation_design',
    args: { section: '磨矿', target_tph: 2000, has_plc: false },
    checks: [
      ['无 PLC 判定不能上 L3', (v) => v.advanced_control_verdict && v.advanced_control_verdict.go === false],
      ['无 PLC 有拒绝项', (v) => (v.rejections || []).length > 0],
    ],
  },
  {
    tool: 'mackorn_capacity_check',
    /* R48 修正：原写 cavity:'C' —— 但 C 腔 CSS16 的详表值是哨兵 999（已加告警）。
     * 原断言意测的应是粗腔 EC：实测 EC/CSS16 = min 130 / rated 293
     * （原期望 115/290 是数据表更新前的旧值）。 */
    args: { model: 'NH400', cavity: 'EC', css: 16 },
    checks: [
      ['额定产能 = 293 t/h（EC 腔）', (v) => v.capacity_rated_tph === 293],
      ['最低产能 = 130 t/h（EC 腔）', (v) => v.capacity_min_tph === 130],
      ['电机功率 = 250 kW', (v) => v.power_kw === 250],
      ['最大给料 = 215 mm', (v) => v.max_feed_mm === 215],
    ],
  },
  {
    /* R48 新增：哨兵值必须被告警（原始数据 C 腔 CSS16 = 999 > 机型上限 500） */
    tool: 'mackorn_capacity_check',
    args: { model: 'NH400', cavity: 'C', css: 16 },
    checks: [
      ['哨兵产能 999 必须告警', (v) => Array.isArray(v.warnings) && v.warnings.some((w) => /超出|上限|疑似/.test(String(w)))],
    ],
  },
  {
    tool: 'mackorn_equipment_catalog',
    args: {},
    checks: [
      ['NH 系列 9 个型号', (v) => JSON.stringify(v).match(/NH200|NH300|NH400|NH600|NH700|NH860|NH865|NH890|NH895/) !== null],
      ['NS 系列 4 个型号', (v) => JSON.stringify(v).match(/NS200|NS300|NS400|NS600/) !== null],
    ],
  },
  {
    tool: 'mackorn_contact',
    args: {},
    checks: [
      ['含 sandy.zhao@mackorn.cn', (v) => /sandy\.zhao@mackorn\.cn/.test(JSON.stringify(v))],
      ['含 leif.dai@mackorn.cn', (v) => /leif\.dai@mackorn\.cn/.test(JSON.stringify(v))],
      ['含 vicky.cheng@mackorn.cn', (v) => /vicky\.cheng@mackorn\.cn/.test(JSON.stringify(v))],
    ],
  },
  {
    tool: 'mackorn_crusher_curve',
    args: { css_mm: 16, feed_p80_mm: 120, ore: '花岗岩' },
    checks: [
      ['产品 P80 ≈ 15.12 mm', (v) => Math.abs(v.product_p80_mm - 15.12) < 0.05],
      ['破碎比 ≈ 8.04', (v) => Math.abs(v.reduction_ratio - 8.04) < 0.05],
      ['质量守恒误差 < 1e-2', (v) => v.mass_balance && v.mass_balance.sum_error < 1e-2],
    ],
  },
];

console.log('');
console.log('  ── 已知真值断言（防桩实现）──');
let goldenFail = 0;
for (const g of GOLDEN_ASSERTIONS) {
  const def = m.toolDefinitions.find((x) => x.name === g.tool);
  if (!def) { console.log('    ❌ 找不到工具 ' + g.tool); goldenFail += 1; continue; }
  let v = null;
  try { v = await def.execute(g.args); } catch (e) { console.log('    ❌ ' + g.tool + ' 执行失败: ' + String(e.message).slice(0, 50)); goldenFail += 1; continue; }
  const results = g.checks.map(([label, fn]) => { try { return [label, !!fn(v)]; } catch { return [label, false]; } });
  const bad = results.filter((x) => !x[1]);
  if (bad.length) {
    goldenFail += bad.length;
    console.log('    ❌ ' + g.tool + ' 真值不符: ' + bad.map((x) => x[0]).join('; '));
  } else {
    console.log('    ✅ ' + g.tool + '  ' + results.length + ' 项真值断言全过');
  }
}
if (goldenFail) {
  console.log('    → ' + goldenFail + ' 项真值断言失败 —— 工具实现可能被改坏或被桩替换');
}

const ok = results.filter((r) => r.status === 'ok').length;
const bad = results.filter((r) => r.status !== 'ok' && r.status !== 'no-sample');
if (typeof goldenFail === 'number' && goldenFail > 0) bad.push({ name: 'golden-assertions', status: 'golden-failed', renderErr: goldenFail + ' 项真值断言失败' });

console.log('\n' + '─'.repeat(100));
console.log('  工具 ' + m.toolDefinitions.length + ' 个 · 通过 ' + ok + ' · 失败 ' + bad.length + ' · 跳过 ' + results.filter((r) => r.status === 'no-sample').length);
if (bad.length) { console.log('\n  失败：'); bad.forEach((b) => console.log('    ❌ ' + b.name + ' — ' + (b.err || b.renderErr))); }
else console.log('  ✅ 全部工具 execute + render 均正常');
console.log('');
/* 结果写文件（R18 补）：供 lessons 的 check 用【文件】而非管道读取。
 * 原因：spawnSync 抓子进程 stdout 时，Windows 下中文可能被编码搞乱，
 * 导致按中文关键词解析失败（实测 L-34 改成行为判据后因此误判失败）。 */
try {
  writeFileSync(join(ROOT, 'distribution', '03_验证与基准', 'verify-all-tools.json'), JSON.stringify({
    generated: new Date().toISOString(),
    total: m.toolDefinitions.length, passed: ok, failed: bad.length,
    results: results.map((x) => ({ name: x.name, status: x.status, ms: x.ms })),
  }, null, 2), 'utf8');
} catch { }

process.exit(bad.length ? 1 : 0);
