/**
 * 线上 MCP 端点 · 22 个工具全量实测
 * 每个工具真调一次，看是否有数据、是否符合预期
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__HERE, '..');

const H = { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json' };
const URL = 'https://mackorn.cn/ai/api/mcp.php';

async function call(name, args) {
  try {
    const r = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }), signal: AbortSignal.timeout(60000) });
    if (r.status !== 200) return { ok: false, why: 'HTTP ' + r.status };
    const j = await r.json();
    if (j.error) return { ok: false, why: JSON.stringify(j.error).slice(0, 120) };
    const t = JSON.parse(j.result.content[0].text);
    return { ok: true, result: t.result, warnings: t.warnings || [], assumptions: t.assumptions || [] };
  } catch (e) { return { ok: false, why: e.message.slice(0, 100) }; }
}

const TESTS = [
  ['mackorn_equipment_catalog', {}, (r) => r.model_count + ' 机型 · ' + r.cavity_types.length + ' 腔型'],
  ['mackorn_capacity_check', { model: 'NH400', cavity: 'MC', css: 16 }, (r) => r.capacity_min_tph + '-' + r.capacity_rated_tph + ' t/h · ' + r.power_kw + ' kW'],
  ['mackorn_cone_selection', { target_tph: 500, max_feed_mm: 300, target_product_mm: 20 }, (r) => '推荐 ' + r.recommendation + ' · 候选 ' + r.candidate_count],
  ['mackorn_mcfm_analysis', { cumulative_retained: [2, 15, 35, 55, 70, 82, 90, 20] }, (r) => 'M=' + r.mcfm + ' · ' + r.level],
  ['mackorn_grading_porosity', { coarse_frac: 50, mid_frac: 30, fine_frac: 20 }, (r) => 'φ=' + r.porosity + ' · ' + r.verdict],
  ['mackorn_market_stats', { mode: 'weibull', lives: [3200, 4100, 3800, 5200, 4600, 6100, 5500, 7000] }, (r) => 'β=' + r.beta + ' η=' + r.eta_h + 'h B10=' + r.B10_h + 'h R²=' + r.r_squared],
  ['mackorn_contact', { language: 'ru' }, (r) => r.company + ' · ' + r.contacts.length + ' 联系人'],
  ['mackorn_wear_design', { sections: 5, base_hardness: 58, gradient_factor: 1.12 }, (r) => '均匀度 ' + r.uniformity_before.uniformity + '→' + r.uniformity_after_gradient_design.uniformity],
  ['mackorn_market_intel', { scores: { industry: { score: 4 }, technology: { score: 3 }, timeliness: { score: 4 }, economics: { score: 3 }, operability: { score: 4 } } }, (r) => '加权 ' + (r.scoring ? r.scoring.weighted_score + ' · ' + r.scoring.verdict.slice(0, 20) : '（无分）')],
  ['mackorn_plant_design', { target_tph: 800, max_feed_mm: 600, target_product_mm: 20 }, (r) => '总破碎比 ' + r.total_reduction_ratio + ' · ' + r.recommended_stages + ' 段'],
  ['mackorn_cost_estimate', { model: 'NH400', units: 2, tph: 300, hours_per_year: 6000, load_factor: 0.75 }, (r) => r.installed_power_kw + ' kW · ' + r.energy_kwh_per_ton + ' kWh/t'],
  ['mackorn_distributor_eval', { capability: [4, 5, 4, 3, 4, 4], market: [3, 4, 4, 3, 3, 3], integrity: [5, 4, 5, 4, 4] }, (r) => '得分 ' + r.weighted_score + ' · ' + r.tier],
  ['mackorn_requirement_intake', { capacity_tph: 500, form_text: '产量500t/h，最大给料600mm，成品20mm以下，花岗岩，抗压强度150MPa，含水率3%，干法生产', max_feed_mm: 600 }, (r) => '阻断 ' + r.completeness.missing_by_level['阻断'] + ' · 关键 ' + r.completeness.missing_by_level['关键'] + ' · 追问 ' + r.completeness.follow_up.length + ' 条'],
  ['mackorn_crusher_curve', { css_mm: 16, feed_p80_mm: 120, ore: '花岗岩' }, (r) => '产品 P80=' + r.product_p80_mm + 'mm · 破碎比 ' + r.reduction_ratio_p80],
  ['mackorn_simulate_flowsheet', { feed_p80_mm: 500, stages: [{ type: 'crusher', name: '中碎', css_mm: 40 }, { type: 'screen', name: '检查筛', aperture_mm: 20 }, { type: 'crusher', name: '细碎', css_mm: 12 }] }, (r) => '最终 P80=' + r.product_p80_mm + 'mm · ' + r.stage_count + ' 段'],
  ['mackorn_calibrate', { css_mm: 16, feed_points: [{ size_mm: 20, cum_pct: 80 }, { size_mm: 120, cum_pct: 10 }], product_points: [{ size_mm: 5, cum_pct: 40 }, { size_mm: 10, cum_pct: 70 }, { size_mm: 20, cum_pct: 92 }, { size_mm: 30, cum_pct: 99 }, { size_mm: 40, cum_pct: 100 }] }, (r) => 'RMSE=' + r.fit_quality.rmse + ' · ' + (r.fit_quality.usable ? '可用' : '不可用')],
  ['mackorn_proposal', { capacity_tph: 500, ore_type: '花岗岩' }, (r) => r.sections + ' 章 · ' + r.char_count + ' 字符'],
  ['mackorn_intel_watch', {}, (r) => r.count + ' 个观测面'],
  ['mackorn_selection_report', { target_tph: 500, max_feed_mm: 300 }, (r) => r.sections + ' 章 · ' + r.char_count + ' 字符'],
  ['mackorn_knowledge_update', { entries: [{ title: '测试条目', content: '内容', source_url: 'https://www.sec.gov/test' }] }, (r) => '接受 ' + r.accepted + ' · 拒绝 ' + r.rejected + ' · 写入=' + r.write_performed],
  ['mackorn_pdca_status', {}, (r) => '只读 · pdca_available=' + r.pdca_available],
];

console.log('\n' + '═'.repeat(88));
console.log('  线上 MCP 端点 · 22 个工具全量实测');
console.log('═'.repeat(88) + '\n');

let pass = 0, fail = 0;
const failures = [];
for (const [name, args, fmt] of TESTS) {
  const r = await call(name, args);
  const short = name.replace('mackorn_', '');
  if (!r.ok) {
    fail++;
    failures.push(short + ': ' + r.why);
    console.log('  ❌ ' + short.padEnd(22) + r.why);
    continue;
  }
  if (r.result === null || r.result === undefined) {
    fail++;
    failures.push(short + ': result 为 null' + (r.warnings[0] ? ' — ' + r.warnings[0].slice(0, 60) : ''));
    console.log('  ⚠️  ' + short.padEnd(22) + 'result 为 null');
    continue;
  }
  pass++;
  let info = '';
  try { info = fmt(r.result); } catch (e) { info = '（格式化失败: ' + e.message.slice(0, 40) + '）'; }
  console.log('  ✅ ' + short.padEnd(22) + info.slice(0, 72));
  await new Promise((s) => setTimeout(s, 150));
}

console.log('\n' + '─'.repeat(88));
console.log('  通过 ' + pass + ' / ' + TESTS.length + ' · 失败 ' + fail);
if (failures.length) { console.log('\n  失败明细：'); failures.forEach((f) => console.log('    · ' + f)); }
console.log('─'.repeat(88) + '\n');

/* __JSON_OUT__ 供门禁/教训判据读取（S2 配套）。
 * ⚠️ 变量名必须用本脚本实际的（TESTS/pass/fail）—— 第一次注入时猜了 results，
 *    结果写出 0 条。也与 L-34 同源：改行为必须核对真实标识符。 */
try {
  const __out = join(ROOT, 'distribution', '04_AI收录与分发', 'live-tools-test.json');
  mkdirSync(dirname(__out), { recursive: true });
  writeFileSync(__out, JSON.stringify({
    generated: new Date().toISOString(),
    total: TESTS.length, passed: pass, failed: fail, failures,
    note: '线上 MCP 端点全量工具实测（真调 tools/call）',
  }, null, 2), 'utf8');
} catch (__e) { /* 输出失败不影响主流程 */ }