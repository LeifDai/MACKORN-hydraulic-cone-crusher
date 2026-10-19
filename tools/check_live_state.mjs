/**
 * 线上状态核实 —— 用户开机后第一眼要看的东西
 *
 * 检查：
 *   ① version.json 版本与工具数
 *   ② mcp.php 工具数
 *   ③ 各关键页面是否可达
 *   ④ 本地最新内容是否已上线（对比本地文件与线上）
 *
 * 纪律：测不到记 UNKNOWN，不记成「没有」。
 */
const B = 'https://mackorn.cn';
const UA = 'Mozilla/5.0 (compatible; MACKORN-Monitor/1.0; +https://mackorn.cn/ai/)';

async function probe(path, expectText) {
  const url = B + path;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
    const t = await r.text();
    const ok = r.status === 200;
    const has = expectText ? new RegExp(expectText, 'i').test(t) : null;
    return { path, status: r.status, bytes: t.length, ok, expectOk: has, body: t };
  } catch (e) { return { path, status: 0, err: e.cause?.code || e.name, ok: false }; }
}

console.log('\n' + '═'.repeat(98));
console.log('  线上状态核实 · ' + new Date().toISOString().slice(0, 19).replace('T', ' '));
console.log('═'.repeat(98) + '\n');

/* ① version.json */
const v = await probe('/ai/version.json');
if (v.ok) {
  try {
    const j = JSON.parse(v.body);
    console.log('  ── version.json ──');
    console.log('     版本: ' + (j.version || '?'));
    console.log('     工具: ' + (j.tools != null ? j.tools : (Array.isArray(j.tool_names) ? j.tool_names.length : '?')));
    console.log('     语言: ' + (j.languages != null ? j.languages : (Array.isArray(j.locales) ? j.locales.length : '?')));
    if (j.updated || j.released) console.log('     更新: ' + (j.updated || j.released));
    /* ⚠️ 不能用 includes('mackorn_knowledge') —— 'mackorn_knowledge_update' 包含该子串，会误判为存在。
     * 必须精确匹配工具名（与 GR-15 的 /400/ 匹配 NH400 是同一类 bug，已编入教训）。 */
    const liveTools = Array.isArray(j.remote_tool_list) ? j.remote_tool_list : [];
    const hasKnowledge = liveTools.includes('mackorn_knowledge');
    console.log('     remote_mcp_tools: ' + (j.remote_mcp_tools != null ? j.remote_mcp_tools : '?'));
    console.log('     含 mackorn_knowledge（精确匹配）: ' + hasKnowledge + (hasKnowledge ? '' : '  ← 线上仍是旧版，需上传'));
  } catch { console.log('  ── version.json 解析失败，前 200 字符: ' + v.body.slice(0, 200)); }
} else console.log('  ── version.json  UNKNOWN（HTTP ' + (v.status || v.err) + '）');

/* ② mcp.php */
const m = await probe('/ai/api/mcp.php');
if (m.ok) {
  const n = (m.body.match(/mackorn_[a-z_]+/g) || []);
  const uniq = [...new Set(n)];
  console.log('\n  ── mcp.php ──');
  console.log('     HTTP 200 · ' + Math.round(m.bytes / 1024) + ' KB');
  console.log('     出现的工具名: ' + uniq.length + ' 个');
  console.log('     含 mackorn_knowledge: ' + uniq.includes('mackorn_knowledge'));
} else console.log('\n  ── mcp.php  UNKNOWN（HTTP ' + (m.status || m.err) + '）');

/* ③ 关键页面 */
const PAGES = [
  ['/ai/', 'MACKORN'],
  ['/ai/tools/', 'mackorn_'],
  ['/ai/validation/', 'validation'],
  ['/ai/model-card/', 'Model Card'],
  ['/ai/validation/calibration-priority.md', '标定'],
  ['/ai/glossary/', '术语'],
  ['/llms.txt', 'mackorn'],
  ['/.well-known/agent.json', 'mackorn'],
  ['/sitemap.xml', 'urlset'],
];
console.log('\n  ── 关键页面 ──');
const pageResults = [];
for (const [p, kw] of PAGES) {
  const r = await probe(p, kw);
  const tag = r.ok ? (r.expectOk ? '✅' : '⚠️') : '❌';
  console.log('     ' + tag + ' ' + p.padEnd(42) + (r.ok ? ('HTTP 200  ' + Math.round(r.bytes / 1024) + ' KB' + (r.expectOk ? '' : '  （未含预期关键词 "' + kw + '"）')) : ('HTTP ' + (r.status || r.err))));
  pageResults.push({ path: p, ...r, body: undefined });
}

/* ④ 本地 vs 线上：新内容是否上线 */
console.log('\n  ── 本地最新内容是否已上线 ──');
const CHECK = [
  ['模型卡页（本地已建）', '/ai/model-card/', 'Model Card'],
  ['标定快速指南（本地已建）', '/ai/validation/calibration-priority.md', '标定'],
  ['生态验证页', '/ai/validation/', 'MACKORN'],
];
for (const [name, p, kw] of CHECK) {
  const r = pageResults.find((x) => x.path === p);
  if (!r) { console.log('     ? ' + name + ' —— 未探测'); continue; }
  console.log('     ' + (r.ok && r.expectOk ? '✅ 已上线' : '❌ 未上线') + '  ' + name);
}

/* 汇总 */
const reachable = pageResults.filter((r) => r.ok).length;
console.log('\n' + '─'.repeat(98));
console.log('  可达 ' + reachable + '/' + PAGES.length + ' 个页面');
console.log('');
console.log('  说明：本检查只确认【可达性与内容存在】，不代表已被 AI 收录。');
console.log('        「可达」与「被收录」是两件事（教训 L-17），不混为一谈。');
console.log('');
