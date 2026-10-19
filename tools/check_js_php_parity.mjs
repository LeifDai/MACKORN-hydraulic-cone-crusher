/**
 * 本地 JS 引擎 ↔ 远程 PHP 端点 一致性对照（R80）
 *
 * 为什么要这个：
 *   远程 PHP 端点是【对外的主入口】（国外用户大多走 MCP over HTTP），
 *   而它与本地 JS 引擎是**两套独立实现**（PHP 由 gen_php_mcp 生成，但逻辑手写）。
 *   两套实现迟早会漂移 —— 而漂移的后果是：
 *     同一个问题，走本地 MCP 和走 HTTP 得到不同答案。
 *
 *   更现实的风险：**上传后没生效**（旧版还在跑）。
 *   本工具会把"线上的答案"与"本地的答案"逐字段对比，一眼看出：
 *     · 线上是旧版（字段缺失 / 工具数不对）
 *     · 两套实现真的算得不一样（数值有差）
 *
 * 用法：
 *   node tools/check_js_php_parity.mjs              # 对照（需要联网）
 *   node tools/check_js_php_parity.mjs --offline    # 只列对照项，不联网
 *
 * 退出码：0 = 一致或无网络；1 = 发现差异
 */
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');
const OFFLINE = process.argv.includes('--offline');
const URL_MCP = process.env.MACKORN_MCP_URL || 'https://mackorn.cn/ai/api/mcp.php';

/* ── 对照项：两边都应支持、且应当给相同答案的调用 ── */
const CASES = [
  { name: '目录（机型枚举）', tool: 'mackorn_equipment_catalog', args: {} },
  { name: '产能校核 · 正常格', tool: 'mackorn_capacity_check', args: { model: 'NH400', cavity: 'EC', css: 16 } },
  { name: '产能校核 · 哨兵格', tool: 'mackorn_capacity_check', args: { model: 'NH400', cavity: 'C', css: 16 } },
  { name: 'MCFM 给料模数', tool: 'mackorn_mcfm_analysis', args: { cumulative_retained: [100, 100, 95, 80, 60, 45, 30, 20] } },
  { name: '材料库查询', tool: 'mackorn_knowledge', args: { ore: '花岗岩' } },
];

/* ── 从 JS 侧取答案（可能同步或异步）── */
async function jsAnswer(tool, args) {
  const m = await import(pathToFileURL(join(ROOT, 'plugin', 'index.mjs')).href);
  const def = m.toolDefinitions.find((d) => d.name === tool);
  if (!def) return { exists: false };
  try {
    /* MCP 工具定义里参数可能是驼峰或下划线，这里直接传原始 args */
    const v = await def.execute(args);
    return { exists: true, value: v };
  } catch (e) {
    return { exists: true, error: String(e && e.message).slice(0, 120) };
  }
}

/* ── 从 PHP 侧取答案 ── */
async function phpAnswer(tool, args) {
  if (OFFLINE) return { skipped: true };
  try {
    const r = await fetch(URL_MCP, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return { error: 'HTTP ' + r.status };
    const j = await r.json();
    const txt = ((j.result && j.result.content) || []).map((c) => c.text || '').join('\n');
    let v = null;
    try { v = JSON.parse(txt); } catch { }
    if (j.error) return { error: String(j.error.message || JSON.stringify(j.error)).slice(0, 140) };
    return { exists: true, value: v, raw: txt.slice(0, 300) };
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 120) };
  }
}

/* ── 工具数对照 ── */
async function phpToolCount() {
  if (OFFLINE) return null;
  try {
    const r = await fetch(URL_MCP, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json();
    return ((j.result && j.result.tools) || []).length || null;
  } catch { return null; }
}

const localCount = (() => {
  const c = readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8');
  return [...new Set([...c.matchAll(/^\s{2}name: '(mackorn_[a-z_]+)',/gm)].map((m) => m[1]))].length;
})();

/* ── 比对 ── */
const rows = [];
for (const cs of CASES) {
  const js = await jsAnswer(cs.tool, cs.args);
  const php = await phpAnswer(cs.tool, cs.args);
  let verdict = '?';
  let note = '';

  if (!js.exists) { verdict = '❌'; note = '本地 JS 没有这个工具'; }
  else if (php.skipped) { verdict = '○'; note = '离线模式，未对照'; }
  else if (php.error) { verdict = '⚠'; note = '远程端点：' + php.error; }
  else if (!php.value) { verdict = '⚠'; note = '远程返回不可解析'; }
  else {
    /* 比关键字段 */
    const keys = ['capacity_rated_tph', 'capacity_min_tph', 'power_kw', 'max_feed_mm', 'found', 'M', 'mcfm'];
    const diffs = [];
    for (const k of keys) {
      const a = js.value && js.value[k];
      const b = php.value && php.value[k];
      if (a === undefined && b === undefined) continue;
      if (a === undefined) { diffs.push(k + ' 本地缺/远程有'); continue; }
      if (b === undefined) { diffs.push(k + ' 远程缺（可能是旧版）'); continue; }
      if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 1e-6) diffs.push(k + ' ' + a + ' vs ' + b); }
      else if (String(a) !== String(b)) diffs.push(k + ' ' + JSON.stringify(a).slice(0, 24) + ' vs ' + JSON.stringify(b).slice(0, 24));
    }
    if (diffs.length) { verdict = '⚠'; note = diffs.slice(0, 4).join('; '); }
    else { verdict = '✅'; note = '关键字段一致'; }
  }
  rows.push({ ...cs, verdict, note });
}

/* ── 输出 ── */
console.log('');
console.log('  ══ 本地 JS ↔ 远程 PHP 一致性对照 ══');
console.log('');
console.log('  远程端点：' + URL_MCP);
console.log('  工具数：本地 ' + localCount + (OFFLINE ? '' : ' · 远程 ' + (await phpToolCount() ?? '未取到')));
console.log('');
for (const r of rows) console.log('  ' + r.verdict + ' ' + r.name.padEnd(18) + '  ' + r.note);
console.log('');

const bad = rows.filter((r) => r.verdict === '⚠' || r.verdict === '❌');
const warn = rows.filter((r) => r.verdict === '⚠' || r.verdict === '❌' || r.verdict === '?');

mkdirSync(D, { recursive: true });
writeFileSync(join(D, 'js-php-parity.json'), JSON.stringify({
  generated: new Date().toISOString(), offline: OFFLINE, endpoint: URL_MCP,
  local_tool_count: localCount, rows,
}, null, 2), 'utf8');
console.log('  已写 distribution/03_验证与基准/js-php-parity.json');
console.log('');

if (OFFLINE) { console.log('  （离线模式，未做实际对照）\n'); process.exit(0); }
if (bad.length) {
  console.log('  ⚠️ ' + bad.length + ' 项有差异 —— 常见原因：');
  console.log('     ① 远程端点还是旧版本（更新包未上传）→ 跑 examples/mcp-client.mjs --http 看工具数');
  console.log('     ② 两套实现真的算得不一样 → 需要人工核对');
  console.log('');
  process.exit(1);
}
console.log('  ✅ 关键字段一致\n');
