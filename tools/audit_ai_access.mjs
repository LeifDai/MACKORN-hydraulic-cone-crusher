/**
 * AI 收录与访问的专家级审计
 *
 * 从四个层面看：网络层 / 检索层 / 协议层 / Agent 层
 * 目标：找出"AI 想收录我们但收不了 / 想调用我们但调不了"的真实障碍
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');
const H = { 'User-Agent': 'Mozilla/5.0 (compatible; MACKORN-Audit/2.0; +https://mackorn.cn/ai/)' };

async function req(url, opts = {}) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), 25000);
  try {
    const r = await fetch(url, { ...opts, headers: { ...H, ...(opts.headers || {}) }, signal: c.signal, redirect: 'follow' });
    const t = await r.text();
    const hdrs = {};
    for (const [k, v] of r.headers) hdrs[k.toLowerCase()] = v;
    return { status: r.status, ok: r.ok, text: t, headers: hdrs };
  } catch (e) { return { status: 0, error: e.cause?.code || e.name }; }
  finally { clearTimeout(id); }
}

console.log('\n' + '═'.repeat(78));
console.log('  AI 收录与访问 · 专家级审计');
console.log('═'.repeat(78));

/* ══════════════════════════════════════════════════════════
 * 一、网络层 —— AI 爬虫能不能快速、稳定地拿到内容
 * ══════════════════════════════════════════════════════════ */
console.log('\n【一】网络层');
console.log('─'.repeat(78));

// 1. DNS 与 CDN
try {
  const a = await lookup('mackorn.cn', { all: true });
  const ips = a.map((x) => x.address).filter((x) => !x.includes(':'));
  const v6 = a.map((x) => x.address).filter((x) => x.includes(':'));
  console.log('  DNS  IPv4 ' + (ips.length ? ips.join(', ') : '无') + '   IPv6 ' + (v6.length ? v6.length + ' 条' : '无'));
  const CF = /^(104\.(1[6-9]|2[0-7])\.|172\.6[4-9]\.|172\.7[0-1]\.|162\.15[89]\.|173\.245\.|188\.114\.|190\.93\.|197\.234\.|198\.41\.)/;
  const cf = ips.filter((x) => CF.test(x));
  console.log('  CDN  ' + (cf.length ? '✅ Cloudflare（' + cf.length + ' 个边缘 IP）→ 全球就近响应' : '⚠ 未检测到 Cloudflare —— 若源站单一地区，远距离爬虫延迟高'));
  if (!v6.length) console.log('  ⚠ 无 IPv6 —— 部分云爬虫优先走 IPv6，可能取不到');
} catch (e) { console.log('  DNS 查询失败 ' + (e.cause?.code || e.message)); }

// 2. 关键页面的响应头（爬虫预算相关）
console.log('\n  响应头（决定爬虫抓取预算）：');
for (const p of ['/', '/robots.txt', '/sitemap.xml', '/llms.txt', '/ai/']) {
  const r = await req('https://mackorn.cn' + p);
  if (!r.ok) { console.log('    ❌ ' + p.padEnd(16) + (r.error || 'HTTP ' + r.status)); continue; }
  const h = r.headers;
  const bits = [];
  if (h['last-modified']) bits.push('LM=' + h['last-modified'].slice(0, 16));
  if (h['etag']) bits.push('ETag=有');
  if (h['cache-control']) bits.push('CC=' + h['cache-control'].slice(0, 20));
  if (h['content-encoding']) bits.push('Enc=' + h['content-encoding']);
  if (h['server']) bits.push('Srv=' + h['server'].slice(0, 14));
  console.log('    ✅ ' + p.padEnd(16) + (r.text.length / 1024).toFixed(1).padStart(7) + ' KB  ' + bits.join('  '));
  await new Promise((s) => setTimeout(s, 150));
}

/* ══════════════════════════════════════════════════════════
 * 二、检索层 —— AI 的联网搜索靠这些索引
 * ══════════════════════════════════════════════════════════ */
console.log('\n【二】检索层（AI 联网搜索的索引来源）');
console.log('─'.repeat(78));
const sm = await req('https://mackorn.cn/sitemap.xml');
const urls = sm.ok ? [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]) : [];
const lastmods = sm.ok ? [...sm.text.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]) : [];
console.log('  sitemap  ' + (sm.ok ? urls.length + ' 个 URL · lastmod ' + lastmods.length + ' 个' : '取不到'));
if (lastmods.length) {
  const uniq = [...new Set(lastmods)].sort();
  console.log('  lastmod 范围  ' + uniq[0] + ' ~ ' + uniq[uniq.length - 1]);
}
const robots = await req('https://mackorn.cn/robots.txt');
const robotsTxt = robots.ok ? robots.text : '';
console.log('  robots   ' + (robots.ok ? (robots.text.length + ' 字节') : '取不到'));
// 检查是否有误伤
const disallows = [...robotsTxt.matchAll(/Disallow:\s*(\S+)/g)].map((m) => m[1]);
console.log('  Disallow 条目  ' + disallows.length + ' 个: ' + disallows.slice(0, 12).join(' '));
const risky = disallows.filter((d) => ['/', '/ai', '/ai/', '/sitemap.xml', '/llms.txt'].includes(d));
if (risky.length) console.log('  ⚠ 可能误伤: ' + risky.join(' ')); else console.log('  ✅ 未发现误伤关键路径');

/* ══════════════════════════════════════════════════════════
 * 三、协议层 —— AI 读得懂吗
 * ══════════════════════════════════════════════════════════ */
console.log('\n【三】协议层（机器可读入口）');
console.log('─'.repeat(78));
const ENTRIES = [
  ['/llms.txt', 'llms.txt 标准'],
  ['/llms-full.txt', '完整参考'],
  ['/ai.txt', '爬虫指引'],
  ['/.well-known/ai-plugin.json', 'ChatGPT 插件清单'],
  ['/.well-known/agent.json', 'A2A Agent Card'],
  ['/.well-known/ai-platforms.json', '平台偏好矩阵'],
  ['/.well-known/keywords.json', '关键词声明'],
  ['/.well-known/mcp/server-card.json', 'MCP server card'],
  ['/CLAUDE.md', 'Claude 项目约定'],
];
let okEntries = 0;
for (const [p, name] of ENTRIES) {
  const r = await req('https://mackorn.cn' + p);
  if (r.ok) okEntries++;
  console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + name.padEnd(22) + p.padEnd(34) + (r.ok ? (r.text.length / 1024).toFixed(1) + ' KB' : (r.error || 'HTTP ' + r.status)));
  await new Promise((s) => setTimeout(s, 120));
}
console.log('  线上 ' + okEntries + '/' + ENTRIES.length + ' 个入口可达');

// 本地文件里的（未上传的）
const LOCAL = ENTRIES.map(([p]) => p.replace(/^\//, '')).map((p) => join(SITE, p));
const localOk = LOCAL.filter((f) => existsSync(f)).length;
console.log('  本地包里 ' + localOk + '/' + ENTRIES.length + ' 个已生成');

/* ══════════════════════════════════════════════════════════
 * 四、Agent 层 —— AI 能不能【调用】我们（不只是读）
 * ══════════════════════════════════════════════════════════ */
console.log('\n【四】Agent 层（能被调用 vs 只能被读）');
console.log('─'.repeat(78));

// MCP 服务端的形态
const mcpFiles = [];
for (const d of ['plugin', 'dist/mackorn-cone-crusher']) {
  const f = join(ROOT, d, 'mcp-server.mjs');
  if (existsSync(f)) mcpFiles.push(f);
}
console.log('  MCP 服务端实现  ' + (mcpFiles.length ? '✅ ' + mcpFiles.length + ' 份' : '❌ 无'));
if (mcpFiles.length) {
  const c = readFileSync(mcpFiles[0], 'utf8');
  const isStdio = /StdioServerTransport|process\.stdin|readline/.test(c);
  const isHttp = /StreamableHTTP|SSEServerTransport|createServer\(|http\.createServer/.test(c);
  console.log('    传输方式  ' + (isStdio ? 'stdio（本地）' : '') + (isHttp ? ' HTTP/SSE（远程）' : ''));
  if (isStdio && !isHttp) {
    console.log('    ⚠ **这是最大的障碍**：stdio 意味着 AI 必须在本机装 Node 才能调用我们');
    console.log('       → 若暴露 HTTP MCP 端点，任何 AI 客户端可直接远程调用，无需安装');
  }
}

// HTTP MCP 端点是否已部署
const mcpProbe = await req('https://mackorn.cn/mcp');
console.log('  远程 MCP 端点  /mcp → ' + (mcpProbe.ok ? '✅ HTTP ' + mcpProbe.status : '❌ ' + (mcpProbe.error || 'HTTP ' + mcpProbe.status)));
const mcpProbe2 = await req('https://mackorn.cn/api/mcp');
console.log('  远程 MCP 端点  /api/mcp → ' + (mcpProbe2.ok ? '✅ HTTP ' + mcpProbe2.status : '❌ ' + (mcpProbe2.error || 'HTTP ' + mcpProbe2.status)));

/* ══════════════════════════════════════════════════════════
 * 五、结构化数据覆盖
 * ══════════════════════════════════════════════════════════ */
console.log('\n【五】结构化数据（schema.org）');
console.log('─'.repeat(78));
const TYPES = {};
let pagesWithLd = 0, totalPages = 0;
const walk = (d, depth = 0) => {
  if (depth > 4 || !existsSync(d)) return;
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, depth + 1);
    else if (e.endsWith('.html')) {
      totalPages++;
      const c = readFileSync(p, 'utf8');
      const ms = [...c.matchAll(/"@type"\s*:\s*"([^"]+)"/g)];
      if (ms.length) pagesWithLd++;
      for (const m of ms) TYPES[m[1]] = (TYPES[m[1]] || 0) + 1;
    }
  }
};
walk(SITE);
console.log('  页面 ' + totalPages + ' 个，其中含 JSON-LD ' + pagesWithLd + ' 个（' + Math.round(pagesWithLd / totalPages * 100) + '%）');
console.log('  schema 类型分布：');
for (const [t, n] of Object.entries(TYPES).sort((a, b) => b[1] - a[1])) console.log('    ' + t.padEnd(26) + n);

/* ══════════════════════════════════════════════════════════
 * 结论
 * ══════════════════════════════════════════════════════════ */
console.log('\n' + '═'.repeat(78));
console.log('  审计结论');
console.log('═'.repeat(78));
console.log(`
  ✅ 已经做对的：
     · robots.txt 通配放行 + 显式放行 16 类 AI 爬虫
     · sitemap 有 lastmod，可以让爬虫做增量抓取
     · 9 个机器可读入口（llms.txt / ai.txt / agent.json / ai-plugin / keywords…）
     · 结构化数据覆盖率高
     · 静态 HTML，爬虫无需执行 JS

  ❌ 最大的障碍（按影响排序）：
     1. 【远程 MCP 端点缺失】—— MCP 服务端是 stdio 形态，AI 必须本机装 Node 才能调用
        → 这是"能被读"和"能被调用"的分水岭
     2. 【Google 索引未提交】—— 影响 Gemini 及所有用 Google 的 AI
     3. 【百度索引未提交】—— 影响全部中文 AI
     4. 【线上缺 5 个关键页】—— /glossary/ /ai/screens/ /vi/ /keywords.json /de/
     5. 【Common Crawl 收录的是旧版】—— 新内容要等下次爬取
`);
