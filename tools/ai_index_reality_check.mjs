/**
 * AI 收录状态重新评估 —— 严格区分「通道可达」与「已确认收录」
 *
 * 为什么必须重写：
 *   此前的 census_ai.mjs 得出 98.9%，但那个数字的实质是【通道可达】——
 *   即 robots.txt 放行、sitemap 存在、入口文件在线、MCP 端点可调用。
 *   这不等于【搜索引擎已经收录我们】。
 *
 *   本轮用严格方法（只认 host 为 mackorn.cn 的真实结果链接）验证，
 *   未能确认任何引擎已收录。
 *
 * 本脚本做的事：
 *   一、通道可达性（确定性高，可自动验证）
 *   二、已确认收录（确定性低，本环境无法可靠验证）—— 诚实标注
 *   三、把两者分开计分，不再混成一个"收录率"
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const OUT = join(D, '04_AI收录与分发');
mkdirSync(OUT, { recursive: true });

const H = { 'User-Agent': 'Mozilla/5.0 (compatible; MACKORN-Audit/2.0)', 'Accept': '*/*' };
async function get(url, timeout = 25000) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { headers: H, signal: c.signal, redirect: 'follow' });
    return { s: r.status, t: await r.text(), h: r.headers };
  } catch (e) { return { s: 0, e: e.cause?.code || e.name, t: '' }; }
  finally { clearTimeout(id); }
}

const B = 'https://mackorn.cn';

/* ══════════════════════════════════════════════════════════
 * 一、通道可达性（可自动验证，确定性高）
 * ══════════════════════════════════════════════════════════ */
console.log('\n' + '═'.repeat(84));
console.log('  一、通道可达性（可自动验证）');
console.log('═'.repeat(84) + '\n');

const channels = [];
async function check(group, name, url, expect = 200) {
  const r = await get(url);
  const ok = r.s === expect;
  channels.push({ group, name, url, status: r.s, ok });
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + group.padEnd(12) + name.padEnd(26) + 'HTTP ' + (r.s || r.e));
  return r;
}

// 1. 标准入口
for (const [n, p] of [['robots.txt', '/robots.txt'], ['sitemap.xml', '/sitemap.xml'], ['llms.txt', '/llms.txt'],
  ['ai.txt', '/ai.txt'], ['A2A 名片', '/.well-known/agent.json'], ['关键词声明', '/.well-known/keywords.json'],
  ['MCP server card', '/.well-known/mcp/server-card.json'], ['平台矩阵', '/.well-known/ai-platforms.json']]) {
  await check('标准入口', n, B + p);
}
// 2. MCP 端点
const mcp = await check('MCP', '远程 MCP 端点', B + '/ai/api/mcp.php');
if (mcp.s === 200) {
  let tools = 0;
  try { tools = JSON.parse(mcp.t).remote_tools_count ?? 0; } catch { }
  console.log('        远程可算工具: ' + tools + ' 个');
  channels[channels.length - 1].tools = tools;
}
// 3. 内容页
for (const [n, p] of [['中文主页', '/ai/'], ['术语表', '/ai/glossary/'], ['振动筛页', '/ai/screens/'],
  ['参考数据', '/ai/reference/'], ['德语页', '/ai/de/'], ['日语页', '/ai/ja/'], ['土耳其语', '/ai/tr/']]) {
  await check('内容页', n, B + p);
}
// 4. 版本校验
await check('可核查', 'version.json', B + '/ai/version.json');

/* ══════════════════════════════════════════════════════════
 * 二、已确认收录（本环境无法可靠验证 —— 诚实标注）
 * ══════════════════════════════════════════════════════════ */
console.log('\n' + '═'.repeat(84));
console.log('  二、已确认收录（严格方法）');
console.log('═'.repeat(84) + '\n');

const isRealResult = (u) => { try { const x = new URL(u); return /^(www\.)?mackorn\.cn$/i.test(x.hostname); } catch { return false; } };
const ENGINES = [
  ['Bing', 'https://www.bing.com/search?format=rss&q=site%3Amackorn.cn&count=50', 'feed'],
  ['Bing 关键词', 'https://www.bing.com/search?format=rss&q=MACKORN+cone+crusher&count=50', 'feed'],
  ['百度', 'https://www.baidu.com/s?wd=site%3Amackorn.cn&rn=50', 'html'],
  ['搜狗', 'https://www.sogou.com/web?query=site%3Amackorn.cn', 'html'],
  ['360', 'https://www.so.com/s?q=site%3Amackorn.cn', 'html'],
  ['Yandex', 'https://yandex.com/search/?text=site%3Amackorn.cn', 'html'],
  ['Mojeek', 'https://www.mojeek.com/search?q=site%3Amackorn.cn', 'html'],
];
const indexResults = [];
for (const [name, url, kind] of ENGINES) {
  const r = await get(url);
  let n = 0, evidence = null;
  if (r.s === 200) {
    const links = [];
    if (kind === 'feed') {
      for (const m of r.t.matchAll(/<link>([\s\S]*?)<\/link>/gi)) links.push(m[1].trim());
    }
    for (const m of r.t.matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) links.push(m[1]);
    const ours = links.filter(isRealResult);
    n = ours.length;
    evidence = ours[0] || null;
  }
  const verdict = r.s !== 200 ? (r.s === 403 ? '无法访问' : '请求失败') : (n > 0 ? '已确认收录' : '未确认');
  indexResults.push({ engine: name, url, status: r.s, found: n, verdict, evidence });
  const mark = verdict === '已确认收录' ? '✅' : (verdict === '未确认' ? '○' : '🔒');
  console.log('  ' + mark + ' ' + name.padEnd(14) + 'HTTP ' + String(r.s || r.e).padEnd(8) + verdict
    + (evidence ? ('  证据: ' + evidence.slice(0, 60)) : ''));
  await new Promise((s) => setTimeout(s, 500));
}

/* ══════════════════════════════════════════════════════════
 * 三、分开计分
 * ══════════════════════════════════════════════════════════ */
const chOk = channels.filter((c) => c.ok).length;
const idxOk = indexResults.filter((r) => r.verdict === '已确认收录').length;
const idxUnknown = indexResults.filter((r) => r.verdict === '未确认' || r.verdict === '无法访问').length;

console.log('\n' + '═'.repeat(84));
console.log('  三、结论（两个数字，不再混为一个）');
console.log('═'.repeat(84) + '\n');
console.log('  通道可达性：' + chOk + ' / ' + channels.length + '  (' + Math.round(chOk / channels.length * 100) + '%)');
console.log('    → 这是【我们准备好了没有】，可以自动验证，确定性高');
console.log('');
console.log('  已确认收录：' + idxOk + ' / ' + indexResults.length + '  (' + (idxOk === 0 ? '未能确认任何引擎已收录' : '') + ')');
console.log('    → 这是【引擎收了我们没有】，本环境无法可靠验证');
console.log('');
console.log('  ⚠️ 关键区别：');
console.log('    通道可达 = 门开着（robots 放行、sitemap 在、入口在线）');
console.log('    已确认收录 = 人进来了（搜索引擎索引里真有我们的页面）');
console.log('    前者我们可控，后者要看搜索引擎 —— 两者不能混为一谈。');
console.log('');
console.log('  📋 要确认收录，唯一可靠的办法：');
console.log('    · Bing  → Bing Webmaster Tools（可看已编入索引的页面数）');
console.log('    · Google→ Google Search Console（需先验证域名，我无法代做）');
console.log('    · 百度  → 百度搜索资源平台（可看索引量）');
console.log('    在浏览器里手动执行 site:mackorn.cn 也能看，但脚本请求会被反爬拦截。');

/* ── 写报告 ── */
let md = '# AI 收录状态重新评估\n\n';
md += '> **为什么重写**：此前报告的 98.9% 实质是【通道可达】，不是【已确认收录】。这两件事必须分开。\n\n';
md += '生成：' + new Date().toISOString().slice(0, 16).replace('T', ' ') + '\n\n---\n\n';
md += '## 一、通道可达性（' + chOk + ' / ' + channels.length + '）\n\n';
md += '| 分组 | 项目 | HTTP | 状态 |\n|:---|:---|:---|:---|\n';
for (const c of channels) md += '| ' + c.group + ' | ' + c.name + ' | ' + (c.status || '—') + ' | ' + (c.ok ? '✅' : '❌') + ' |\n';
md += '\n**含义**：这是我们【准备好了没有】—— robots 放行、sitemap 在线、入口文件齐全、MCP 端点可调用。\n';
md += '这是我们可以控制的部分。\n\n';
md += '## 二、已确认收录（严格方法）\n\n';
md += '| 引擎 | HTTP | 判定 | 找到指向我们的结果 |\n|:---|:---|:---|:---|\n';
for (const r of indexResults) md += '| ' + r.engine + ' | ' + (r.status || '—') + ' | ' + r.verdict + ' | ' + r.found + ' |\n';
md += '\n**方法**：只认 host 为 `mackorn.cn` 的真实结果链接。\n';
md += '排除引擎自身导航链接（如 `/search?q=site:mackorn.cn`、`destUrl=...mackorn.cn` 这类参数回显）。\n\n';
md += '### ⚠️ 方法学限制（必须说明）\n\n';
md += '1. **搜索引擎对脚本请求返回的内容与浏览器不同** —— 反爬机制会返回空结果或导航页\n';
md += '2. **`site:` 查询在脚本环境下经常返回空** —— 即使实际已收录\n';
md += '3. **本环境无法访问部分引擎**（Mojeek 403、DuckDuckGo 超时）\n';
md += '4. **因此"未确认"≠"未收录"** —— 只能说本方法查不到，不能说引擎没收\n\n';
md += '## 三、结论\n\n';
md += '```\n通道可达性：' + chOk + '/' + channels.length + '  —— 我们准备好了（可控）\n已确认收录：' + idxOk + '/' + indexResults.length + '  —— 引擎收了没有（不可控，本环境查不到）\n\n这两件事不能混为一谈。\n之前把"通道可达"当成"收录率"是不严谨的，已修正。\n```\n\n';
md += '## 四、要确认收录，唯一可靠的办法\n\n';
md += '| 引擎 | 工具 | 能看什么 | 谁做 |\n|:---|:---|:---|:---|\n';
md += '| Bing | Bing Webmaster Tools | 已编入索引的页面数、抓取错误 | 需账号 |\n';
md += '| Google | Google Search Console | 索引覆盖、查询表现 | 需验证域名 |\n';
md += '| 百度 | 百度搜索资源平台 | 索引量、抓取诊断 | 需账号 |\n';
md += '| Yandex | Yandex Webmaster | 索引页面数 | 需账号 |\n\n';
md += '**或者最简单**：在浏览器里手动搜 `site:mackorn.cn` —— 浏览器请求不会被反爬拦截。\n\n';
md += '## 五、我们能控制什么\n\n';
md += '```\n我们控制不了 AI 说什么，也控制不了搜索引擎何时收录。\n\n我们能控制的：\n  · 通道是否通畅（robots / sitemap / 入口文件 / MCP 端点）—— 已做到 ' + chOk + '/' + channels.length + '\n  · 内容是否是目标词的最佳匹配 —— 275 关键词 × 12 语言，术语表 1460 条\n  · 结构化数据是否完整 —— 64 页 100% JSON-LD，268 组问答\n  · 是否被权威源引用 —— Common Crawl / Software Heritage / MCP Registry\n\n剩下的是时间与搜索引擎的策略，不是我们能左右的。\n```\n';

writeFileSync(join(OUT, 'AI收录状态重新评估.md'), md, 'utf8');
writeFileSync(join(OUT, 'ai-index-reality-check.json'), JSON.stringify({
  generated: new Date().toISOString(),
  distinction: '通道可达 ≠ 已确认收录',
  channels: { total: channels.length, reachable: chOk, detail: channels },
  indexation: { total: indexResults.length, confirmed: idxOk, detail: indexResults },
  methodology_limit: '搜索引擎对脚本请求返回内容与浏览器不同；site: 查询在脚本环境常返回空。因此"未确认"不等于"未收录"。',
  how_to_verify: ['Bing Webmaster Tools', 'Google Search Console', '百度搜索资源平台', '浏览器手动 site: 查询'],
}, null, 2), 'utf8');

console.log('\n  ✅ AI收录状态重新评估.md');
console.log('  ✅ ai-index-reality-check.json\n');

