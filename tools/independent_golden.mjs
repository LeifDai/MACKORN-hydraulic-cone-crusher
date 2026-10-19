/**
 * 独立真值验证（供 L-34 用 spawnSync 调用）
 *
 * 为什么单独一个脚本：
 *   L-34 的 check 必须是同步的（lessons.mjs 的 runner 是同步的）。
 *   而"独立复算真值"需要 import plugin/index.mjs（异步 import），
 *   所以放进本脚本，由 check 用 spawnSync 跑，读它的退出码。
 *
 * 关键：本脚本【不经过 verify_all_tools.mjs】——
 *   所以即便 verify_all_tools 被桩掉，这里的断言仍然有效。
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const GOLDEN = [
  /* R48 修正：原写 cavity:'C'，但 C 腔 CSS16 的详表值是哨兵 999（已加告警）。
   * 原断言意测的应是粗腔 EC —— 实测 EC/CSS16 = 293（原期望 290，数据表更新所致）。 */
  { tool: 'mackorn_capacity_check', args: { model: 'NH400', cavity: 'EC', css: 16 }, checks: [
    ['额定产能 293 t/h（EC 腔 CSS16）', (v) => v.capacity_rated_tph === 293],
    ['最低产能 130 t/h（EC 腔 CSS16）', (v) => v.capacity_min_tph === 130],
    ['功率 250 kW', (v) => v.power_kw === 250],
    ['最大给料 215 mm', (v) => v.max_feed_mm === 215],
  ] },
  { tool: 'mackorn_crusher_curve', args: { css_mm: 16, feed_p80_mm: 120, ore: '花岗岩' }, checks: [
    ['产品 P80 ≈ 15.12 mm', (v) => Math.abs(v.product_p80_mm - 15.12) < 0.05],
    ['破碎比 ≈ 8.04', (v) => Math.abs(v.reduction_ratio - 8.04) < 0.05],
    ['质量守恒误差 < 1e-2', (v) => v.mass_balance && v.mass_balance.sum_error < 1e-2],
  ] },
];

const m = await import(pathToFileURL(join(ROOT, 'plugin', 'index.mjs')).href);
const T = Object.fromEntries(m.toolDefinitions.map((d) => [d.name, d]));

let fail = 0;
const rows = [];
for (const g of GOLDEN) {
  const def = T[g.tool];
  if (!def) { rows.push({ tool: g.tool, ok: false, why: '工具不存在' }); fail += 1; continue; }
  let v = null;
  try { v = await def.execute(g.args); } catch (e) { rows.push({ tool: g.tool, ok: false, why: '执行抛错: ' + String(e.message).slice(0, 50) }); fail += 1; continue; }
  const bad = g.checks.filter(([, fn]) => { try { return !fn(v); } catch { return true; } });
  if (bad.length) { rows.push({ tool: g.tool, ok: false, why: bad.map((x) => x[0]).join('; ') }); fail += bad.length; }
  else rows.push({ tool: g.tool, ok: true, why: g.checks.length + ' 项真值断言全过' });
}

const out = { ok: fail === 0, fail, rows, generated: new Date().toISOString() };
try { writeFileSync(join(ROOT, 'distribution', '03_验证与基准', 'independent-golden.json'), JSON.stringify(out, null, 2), 'utf8'); } catch { }
process.exit(fail ? 1 : 0);
