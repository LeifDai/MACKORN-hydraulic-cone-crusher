/**
 * R17 · 线上状态实时监控
 *
 * 为什么需要：
 *   用户上传后如果某个文件没传上去，我们无法立刻知道。
 *   此前的教训：包是旧的、mcp.php 曾返回 500 而 version.json 正常 —— 单点检查会漏。
 *
 * 检查四类：
 *   ① 版本三处一致（version.json / mcp.php / 站点页脚）
 *   ② 21 个远程工具可用（抽样真调，不是只看 200）
 *   ③ 关键入口在线（12 语言页 + 标准入口 + 新页面）
 *   ④ 新增资产在线（工具页 / 国别页 / multilingual FAQ / Zenodo 相关）
 *
 * 产出：distribution/_monitor-log.jsonl（追加）+ 控制台告警
 * 退出码：有问题 → 1
 */
import { writeFileSync, appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const LOG = join(D, '_monitor-log.jsonl');
const B = 'https://mackorn.cn';
const EXPECT_VERSION = JSON.parse(readFileSync(join(ROOT, 'public-overrides', 'package.json'), 'utf8')).version;

const H = { 'User-Agent': 'Mozilla/5.0 (compatible; MACKORN-Monitor/1.0)', 'Content-Type': 'application/json' };

async function get(url, timeout = 25000) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { headers: H, signal: c.signal, redirect: 'follow' });
    const t = await r.text();
    clearTimeout(id);
    return { status: r.status, text: t, ok: r.status === 200 };
  } catch (e) { clearTimeout(id); return { status: 0, err: e.cause?.code || e.name, text: '', ok: false }; }
}
async function call(name, args) {
  try {
    const r = await fetch(B + '/ai/api/mcp.php', { method: 'POST', headers: H, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }), signal: AbortSignal.timeout(60000) });
    if (r.status !== 200) return { ok: false, why: 'HTTP ' + r.status };
    const j = await r.json();
    if (j.error) return { ok: false, why: JSON.stringify(j.error).slice(0, 80) };
    const t = JSON.parse(j.result.content[0].text);
    return { ok: t.result != null, why: t.result == null ? 'result 为 null' : '' };
  } catch (e) { return { ok: false, why: e.message.slice(0, 70) }; }
}

const problems = [];
const notes = [];

/* ── ① 版本三处一致 ── */
console.log('\n  ── ① 版本一致性 ──');
{
  const v = await get(B + '/ai/version.json');
  let vj = null; try { vj = JSON.parse(v.text); } catch { }
  if (!vj) problems.push('version.json 取不到或不可解析（HTTP ' + v.status + '）');
  else {
    console.log('    version.json : v' + vj.version + ' · ' + vj.remote_mcp_tools + ' 工具 · product ' + (vj.product_version || '—'));
    if (vj.version !== EXPECT_VERSION) problems.push('version.json 是 ' + vj.version + '，本地应为 ' + EXPECT_VERSION + '（上传未生效或包是旧的）');
    /* R26 修复：原来硬编码"应为 21"，工具数升到 22 后此处失效（21 !== 21 恒 false）。
     * 现从 plugin/index.mjs 读实际工具数。 */
    const __actualTools = (readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8').match(/^\s{2}name: 'mackorn_[a-z_]+',/gm) || []).length;
    if (vj.remote_mcp_tools !== __actualTools) problems.push('version.json 声明 ' + vj.remote_mcp_tools + ' 个远程工具，实际应为 ' + __actualTools);
  }
  const m = await get(B + '/ai/api/mcp.php');
  let mj = null; try { mj = JSON.parse(m.text); } catch { }
  if (!mj) problems.push('mcp.php 不可用（HTTP ' + m.status + '）—— 这是最关键的断点');
  else {
    console.log('    mcp.php      : v' + mj.version + ' · ' + mj.remote_tools_count + ' 个远程工具');
    if (mj.version !== EXPECT_VERSION) problems.push('mcp.php 是 ' + mj.version + '，本地应为 ' + EXPECT_VERSION);
    /* R27 修复：原来硬编码 21 —— 与 version.json 的检查同源问题。改为与【实际工具定义数】精确相等。 */
    {
      const __actual = (readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8').match(/^\s{2}name: 'mackorn_[a-z_]+',/gm) || []).length;
      if (mj.remote_tools_count !== __actual) problems.push('mcp.php 远程工具数 ' + mj.remote_tools_count + '，实际应为 ' + __actual);
    }
  }
}

/* ── ② 23 个工具抽样真调（每类抽 1 个）── */
console.log('\n  ── ② 远程工具抽样真调 ──');
const SAMPLES = [
  ['mackorn_equipment_catalog', {}, 'catalog'],
  ['mackorn_cone_selection', { target_tph: 500, max_feed_mm: 300, target_product_mm: 20 }, 'selection'],
  ['mackorn_capacity_check', { model: 'NH400', cavity: 'MC', css: 16 }, 'capacity'],
  ['mackorn_crusher_curve', { css_mm: 16, feed_p80_mm: 120, ore: 'granite' }, 'simulation'],
  ['mackorn_calibrate', { css_mm: 16, feed_points: [{ size_mm: 20, cum_pct: 80 }, { size_mm: 120, cum_pct: 10 }], product_points: [{ size_mm: 5, cum_pct: 40 }, { size_mm: 10, cum_pct: 70 }, { size_mm: 20, cum_pct: 92 }, { size_mm: 30, cum_pct: 99 }, { size_mm: 40, cum_pct: 100 }] }, 'calibration'],
  ['mackorn_proposal', { capacity_tph: 500, ore_type: 'granite' }, 'proposal'],
  ['mackorn_contact', { language: 'en' }, 'contact'],
  ['mackorn_pdca_status', {}, 'pdca'],
];
let toolOk = 0;
for (const [name, args, label] of SAMPLES) {
  const r = await call(name, args);
  if (r.ok) { toolOk++; console.log('    ✅ ' + label.padEnd(14) + name); }
  else { console.log('    ❌ ' + label.padEnd(14) + name + '  → ' + r.why); problems.push('工具 ' + name + ' 失败：' + r.why); }
  await new Promise((s) => setTimeout(s, 150));
}
console.log('    抽样 ' + toolOk + '/' + SAMPLES.length + ' 通过');

/* ── ③ 关键入口在线 ── */
console.log('\n  ── ③ 关键入口 ──');
const ENTRIES = [
  ['/', '根页'], ['/ai/', 'AI 主入口'], ['/ai/glossary/', '术语表'],
  ['/sitemap.xml', 'sitemap'], ['/robots.txt', 'robots'], ['/llms.txt', 'llms.txt'], ['/ai.txt', 'ai.txt'],
  ['/.well-known/agent.json', 'A2A 名片'], ['/.well-known/mcp/server-card.json', 'MCP card'],
  ['/ai/en/', 'en'], ['/ai/ru/', 'ru'], ['/ai/es/', 'es'], ['/ai/pt/', 'pt'], ['/ai/fr/', 'fr'],
  ['/ai/ar/', 'ar'], ['/ai/id/', 'id'], ['/ai/ja/', 'ja'], ['/ai/de/', 'de'], ['/ai/tr/', 'tr'], ['/ai/vi/', 'vi'],
];
let entryOk = 0;
for (const [p, label] of ENTRIES) {
  const r = await get(B + p);
  const good = r.ok && r.text.length > 200;
  if (good) entryOk++; else problems.push('入口 ' + p + ' (' + label + ') HTTP ' + (r.status || r.err));
  if (!good) console.log('    ❌ ' + p.padEnd(34) + label);
}
console.log('    ' + entryOk + '/' + ENTRIES.length + ' 在线' + (entryOk === ENTRIES.length ? '' : '  ← 见上方失败项'));

/* ── ④ 新增资产在线 ── */
console.log('\n  ── ④ 新增资产 ──');
const NEW = [
  ['/ai/tools/', '工具索引'], ['/ai/tools/cone-selection/', '工具页样例'],
  ['/ai/ru-faq/', '俄语 FAQ'], ['/ai/es-faq/', '西语 FAQ'], ['/ai/id-faq/', '印尼语 FAQ'],
  ['/ai/ar-faq/', '阿语 FAQ'], ['/ai/de-faq/', '德语 FAQ'],
  ['/ai/markets/id/', '印尼国别页'], ['/ai/markets/kz/', '哈萨克国别页'], ['/ai/markets/pe/', '秘鲁国别页'],
];
let newOk = 0;
for (const [p, label] of NEW) {
  const r = await get(B + p);
  const good = r.ok && r.text.length > 500;
  if (good) newOk++; else notes.push(p + ' 尚未上线（HTTP ' + (r.status || r.err) + '）');
  console.log('    ' + (good ? '✅' : '○ ') + p.padEnd(30) + label);
}
console.log('    ' + newOk + '/' + NEW.length + ' 已上线' + (newOk < NEW.length ? '（未上线的说明最新包还没传）' : ''));

/* ── 总结 ── */
const now = new Date().toISOString();
console.log('\n' + '─'.repeat(84));
if (problems.length) {
  console.log('  ❌ 发现 ' + problems.length + ' 个问题：');
  for (const p of problems) console.log('     · ' + p);
} else {
  console.log('  ✅ 线上状态健康（版本一致 · 工具可用 · 入口齐全）');
}
if (notes.length) { console.log('\n  ○ ' + notes.length + ' 项提示（不算故障，通常是新包未上传）：'); for (const n of notes) console.log('     · ' + n); }
console.log('─'.repeat(84) + '\n');

try {
  appendFileSync(LOG, JSON.stringify({ at: now, problems: problems.length, notes: notes.length, tool_sample: toolOk + '/' + SAMPLES.length, entries: entryOk + '/' + ENTRIES.length, new_assets: newOk + '/' + NEW.length, detail: { problems, notes } }) + '\n', 'utf8');
} catch { }
console.log('  📝 已追加到 distribution/_monitor-log.jsonl\n');

process.exit(problems.length ? 1 : 0);
