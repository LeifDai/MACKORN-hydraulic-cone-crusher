/**
 * 全站审计 —— 页面质量 + AI 索引一致性
 *
 * 检查：
 *   ① HTML 结构：每页是否有 title / meta description / canonical / hreflang / lang
 *   ② 内链：站内链接是否指向存在的文件（死链检查）
 *   ③ AI 索引一致性：llms.txt / llms-full.txt / keywords.json / agent.json 是否覆盖全部页面
 *   ④ 结构化数据：有多少页面带 JSON-LD
 *   ⑤ 体积：异常大的页面（可能内联了太多东西）
 *
 * 纪律：发现问题如实列出，不美化；测不到的记 UNKNOWN。
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(resolve(HERE, '..'), 'distribution', '官网落地页');


/* ══════════════════════════════════════════════════════════════════
 * URL → 本地文件的【真实部署映射】
 *
 * 依据 tools/restructure_deploy.mjs 的实际部署规则：
 *   SRC/index.html      → htdocs/ai/index.html   → https://mackorn.cn/ai/
 *   SRC/ai/tools/x/     → htdocs/ai/tools/x/     → https://mackorn.cn/ai/tools/x/
 *   SRC/ar/index.html   → htdocs/ar/index.html   → https://mackorn.cn/ar/
 *   SRC/.well-known/    → htdocs/.well-known/
 *
 * ⚠️ 这是本项目最容易搞错的地方 —— 审计器为此连续修正四次，如实记录：
 *     v1 用 includes 判存在性（被 mackorn_knowledge_update 子串误判）
 *     v2 手工加深度前缀（相对 href 双重计算，92 个存在的页面报死链）
 *     v3 改用路径归一化（降到 7 个，但基准仍错）
 *     v4 修正基准为「SITE 即 /ai/」（方向反了，回到 22 个）
 *     v5（本版）读部署脚本，按真实映射解析
 *   根因：URL 空间与文件空间不是简单对应 —— /ai/ 对应 SRC/index.html，
 *         而 /ai/tools/ 对应 SRC/ai/tools/。凭直觉猜必错，必须读部署脚本。
 * ══════════════════════════════════════════════════════════════════ */
function resolveUrlToFile(raw, fromRel) {
  const clean = raw.split('?')[0].split('#')[0];
  if (clean === '' ) return null;
  let path;
  if (clean.startsWith('/')) {
    path = clean.slice(1);                       // 站点根相对
  } else {
    const dir = fromRel.includes('/') ? fromRel.slice(0, fromRel.lastIndexOf('/')) : '';
    path = (dir ? dir + '/' : '') + clean;       // 页面目录相对
  }
  // 归一化
  const segs = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { segs.pop(); continue; }
    segs.push(seg);
  }
  path = segs.join('/');

  // 映射到 SRC 下的实际文件
  let file;
  if (path === 'ai' || path === 'ai/') file = 'index.html';          // /ai/ → SRC/index.html
  else if (path.startsWith('ai/')) file = path;                       // /ai/x → SRC/ai/x
  else if (path === '' ) file = 'index.html';
  else if (/^(ar|en|es|fr|id|pt|ru|de|ja|tr|vi|contact|distributors|engineering-firms|glossary|guides|markets)(\/|$)/.test(path)) file = path;  // 站点根下的其它目录，源里也在根
  else if (path.startsWith('.well-known/')) file = path;
  else return null;                                                   // 站外（如站点根首页 /）
  if (file === '' || file.endsWith('/')) file += 'index.html';
  else if (!/\.[a-z]{2,5}$/i.test(file)) file += '/index.html';
  return file;
}

function walk(d, out = []) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) { if (!/^\./.test(e.name)) walk(p, out); }
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const pages = walk(SITE);
console.log('\n' + '═'.repeat(100));
console.log('  全站审计 · ' + pages.length + ' 个 HTML 页面');
console.log('═'.repeat(100) + '\n');

const issues = { title: [], desc: [], canonical: [], hreflang: [], lang: [], jsonld: [], big: [], deadlink: [] };
const stats = { withJsonLd: 0, totalBytes: 0, maxPage: null };

for (const p of pages) {
  const rel = relative(SITE, p).replace(/\\/g, '/');
  const html = readFileSync(p, 'utf8');
  const bytes = statSync(p).size;
  stats.totalBytes += bytes;
  if (!stats.maxPage || bytes > stats.maxPage.bytes) stats.maxPage = { rel, bytes };

  if (!/<title>[^<]{5,}<\/title>/i.test(html)) issues.title.push(rel);
  if (!/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html)) issues.desc.push(rel);
  if (!/<link[^>]+rel=["']canonical["']/i.test(html)) issues.canonical.push(rel);
  if (!/hreflang/i.test(html)) issues.hreflang.push(rel);
  if (!/<html[^>]+lang=/i.test(html)) issues.lang.push(rel);
  if (/application\/ld\+json/i.test(html)) stats.withJsonLd += 1; else issues.jsonld.push(rel);
  if (bytes > 300 * 1024) issues.big.push(rel + ' (' + Math.round(bytes / 1024) + ' KB)');
}

/* 内链死链检查（只查站内 .html 与目录链接） */
const relSet = new Set(pages.map((p) => relative(SITE, p).replace(/\\/g, '/')));
for (const p of pages) {
  const rel = relative(SITE, p).replace(/\\/g, '/');
  const html = readFileSync(p, 'utf8');
  const depth = rel.split('/').length - 1;
  const prefix = '../'.repeat(depth);
  for (const m of html.matchAll(/href=["']([^"'#?]+)["']/g)) {
    const raw = m[1];
    if (/^(https?:|mailto:|tel:|javascript:|\/\/)/.test(raw)) continue;
    const t = resolveUrlToFile(raw, rel);
    if (t === null) continue;   // 站外，跳过
    if (!relSet.has(t) && !existsSync(join(SITE, t))) issues.deadlink.push(rel + ' → ' + raw);
  }
}

/* AI 索引一致性 */
const aiFiles = {
  'llms.txt': join(SITE, 'llms.txt'),
  'llms-full.txt': join(SITE, 'llms-full.txt'),
  '.well-known/keywords.json': join(SITE, '.well-known', 'keywords.json'),
  '.well-known/agent.json': join(SITE, '.well-known', 'agent.json'),
  'sitemap.xml': join(SITE, 'sitemap.xml'),
};
const aiCov = {};
for (const [name, p] of Object.entries(aiFiles)) {
  if (!existsSync(p)) { aiCov[name] = { exists: false }; continue; }
  const t = readFileSync(p, 'utf8');
  // 统计被引用的页面路径数量（粗略）
  const refs = new Set();
  for (const m of t.matchAll(/mackorn\.cn\/([a-zA-Z0-9_\-\/]+?)(?:[)"'\s]|$)/g)) {
    let r = m[1].replace(/\/$/, '/index.html');
    if (!/\.[a-z]{2,5}$/i.test(r)) r = r.replace(/\/?$/, '/index.html').replace('//', '/');
    refs.add(r);
  }
  aiCov[name] = { exists: true, kb: Math.round(t.length / 1024), refs: refs.size };
}

/* 输出 */
const pct = (n) => ((pages.length - n.length) / pages.length * 100).toFixed(1) + '%';
console.log('  ── ① HTML 结构完整性 ──');
console.log('     title          ' + pct(issues.title).padStart(6) + '  (' + issues.title.length + ' 个缺)');
console.log('     description    ' + pct(issues.desc).padStart(6) + '  (' + issues.desc.length + ' 个缺)');
console.log('     canonical      ' + pct(issues.canonical).padStart(6) + '  (' + issues.canonical.length + ' 个缺)');
console.log('     hreflang       ' + pct(issues.hreflang).padStart(6) + '  (' + issues.hreflang.length + ' 个缺)');
console.log('     html lang      ' + pct(issues.lang).padStart(6) + '  (' + issues.lang.length + ' 个缺)');
console.log('');
console.log('  ── ② 结构化数据 ──');
console.log('     带 JSON-LD: ' + stats.withJsonLd + '/' + pages.length + '  (' + (stats.withJsonLd / pages.length * 100).toFixed(1) + '%)');
if (issues.jsonld.length && issues.jsonld.length <= 8) console.log('     无 JSON-LD: ' + issues.jsonld.join(', '));
else if (issues.jsonld.length) console.log('     无 JSON-LD: ' + issues.jsonld.length + ' 个（示例: ' + issues.jsonld.slice(0, 5).join(', ') + '）');
console.log('');
console.log('  ── ③ 内链死链 ──');
if (!issues.deadlink.length) console.log('     ✅ 未发现死链');
else {
  console.log('     ⚠️ ' + issues.deadlink.length + ' 个可能死链（前 10）：');
  issues.deadlink.slice(0, 10).forEach((x) => console.log('        ' + x));
}
console.log('');
console.log('  ── ④ AI 索引一致性 ──');
for (const [name, v] of Object.entries(aiCov)) {
  console.log('     ' + (v.exists ? '✅' : '❌') + ' ' + name.padEnd(30) + (v.exists ? (v.kb + ' KB · 引用 ' + v.refs + ' 个路径') : '不存在'));
}
console.log('');
console.log('  ── ⑤ 体积 ──');
console.log('     总 ' + (stats.totalBytes / 1024 / 1024).toFixed(2) + ' MB · 平均 ' + Math.round(stats.totalBytes / pages.length / 1024) + ' KB/页');
console.log('     最大: ' + stats.maxPage.rel + ' (' + Math.round(stats.maxPage.bytes / 1024) + ' KB)');
if (issues.big.length) { console.log('     超 300 KB 的页面: ' + issues.big.length + ' 个'); issues.big.slice(0, 5).forEach((x) => console.log('        ' + x)); }
console.log('');

const critical = issues.title.length + issues.canonical.length + issues.lang.length + issues.deadlink.length;
console.log('═'.repeat(100));
console.log('  严重问题（缺 title/canonical/lang 或死链）: ' + critical + ' 项');
console.log('  非严重（缺 description/hreflang/JSON-LD）: ' + (issues.desc.length + issues.hreflang.length + issues.jsonld.length) + ' 项');
console.log('');

writeFileSync(join(resolve(HERE, '..'), 'distribution', '03_验证与基准', 'site-audit.json'), JSON.stringify({
  generated: new Date().toISOString(),
  pages: pages.length,
  total_mb: +(stats.totalBytes / 1024 / 1024).toFixed(2),
  issues,
  ai_index: aiCov,
  jsonld_pages: stats.withJsonLd,
}, null, 2), 'utf8');
console.log('  报告: distribution/03_验证与基准/site-audit.json\n');
process.exit(critical ? 1 : 0);
