/**
 * mackorn.cn 线上可达性全测
 *
 * 目的：Google 与百度的收录通道，不一定需要 GSC/站长平台账号 ——
 *       只要 (a) 爬虫被放行 (b) robots.txt 指向 sitemap (c) sitemap 在线，
 *       搜索引擎就会自己发现。本脚本验证这三条在线上是否成立。
 */
const H = { 'User-Agent': 'Mozilla/5.0 (compatible; MACKORN-Audit/1.0; +https://mackorn.cn/ai/)' };
const BASE = 'https://mackorn.cn';

async function probe(path, expectType) {
  const url = BASE + path;
  const t0 = Date.now();
  try {
    const c = new AbortController(); const id = setTimeout(() => c.abort(), 20000);
    const r = await fetch(url, { headers: H, signal: c.signal, redirect: 'follow' });
    clearTimeout(id);
    const t = await r.text();
    return { path, status: r.status, ok: r.ok, ms: Date.now() - t0, bytes: t.length, text: t, ct: r.headers.get('content-type') || '' };
  } catch (e) { return { path, status: 0, ok: false, error: e.cause?.code || e.name }; }
}

const PATHS = [
  ['/', '首页'],
  ['/robots.txt', 'robots（爬虫规则 + sitemap 指向）'],
  ['/sitemap.xml', 'sitemap'],
  ['/llms.txt', 'llms.txt'],
  ['/llms-full.txt', 'llms-full.txt'],
  ['/ai.txt', 'ai.txt'],
  ['/glossary/', '12 语言术语表'],
  ['/ai/', '插件页'],
  ['/ai/reference/', '参考数据'],
  ['/ai/screens/', '振动筛页'],
  ['/ai/perspectives/', '18 视角'],
  ['/ai/agent/', '智能体页'],
  ['/markets/cn/', '中国市场页'],
  ['/vi/', '越南语页'],
  ['/.well-known/agent.json', 'A2A 名片'],
  ['/.well-known/keywords.json', '关键词声明'],
  ['/.well-known/ai-platforms.json', '平台矩阵'],
  ['/.well-known/mcp/server-card.json', 'MCP card'],
  ['/836604ef2cb766c53bd4e0a7755b01db.txt', 'IndexNow 密钥'],
  ['/en/', '英语页'],
  ['/ru/', '俄语页'],
  ['/es/', '西语页'],
  ['/ar/', '阿语页'],
  ['/id/', '印尼语页'],
  ['/pt/', '葡语页'],
  ['/fr/', '法语页'],
  ['/de/', '德语页'],
];

console.log('\n  ══════════════════════════════════════════════════');
console.log('   mackorn.cn 线上可达性全测（' + PATHS.length + ' 个入口）');
console.log('  ══════════════════════════════════════════════════\n');

const res = [];
for (const [p, name] of PATHS) {
  const r = await probe(p);
  res.push({ ...r, name });
  const mark = r.ok ? '✅' : (r.status === 404 ? '○' : '❌');
  console.log('  ' + mark + ' ' + String(r.status || r.error || '').padEnd(8) + name.padEnd(26) + p.padEnd(36) + (r.bytes ? (r.bytes / 1024).toFixed(1) + ' KB' : ''));
  await new Promise((s) => setTimeout(s, 150));
}

const live = res.filter((r) => r.ok);
console.log('\n  ── 汇总 ──');
console.log('    在线 ' + live.length + ' / ' + res.length);
console.log('    缺 ' + res.filter((r) => !r.ok).map((r) => r.path).join(' · ') || '    无缺失');

/* ── 关键：搜索引擎自助发现链是否成立 ── */
console.log('\n  ══════════════════════════════════════════════════');
console.log('   搜索引擎自助发现链验证（决定 Google/百度 能否收录）');
console.log('  ══════════════════════════════════════════════════\n');

const robots = res.find((r) => r.path === '/robots.txt');
const sitemap = res.find((r) => r.path === '/sitemap.xml');

const bots = ['Googlebot', 'Google-Extended', 'Baiduspider', 'Bingbot', 'YandexBot', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'CCBot', 'Bytespider', 'Applebot', 'meta-externalagent'];
const allowed = robots?.ok ? bots.filter((b) => {
  const t = robots.text;
  // 简单判定：出现且未被紧邻的 Disallow: / 覆盖
  const i = t.indexOf('User-Agent: ' + b) >= 0 ? t.indexOf('User-Agent: ' + b) : t.indexOf(b);
  if (i < 0) return false;
  const seg = t.slice(i, i + 200);
  return !/Disallow:\s*\/\s*(\n|$)/.test(seg);
}) : [];

console.log('  [1] robots.txt 在线          ' + (robots?.ok ? '✅ HTTP ' + robots.status + '（' + robots.bytes + ' 字节）' : '❌'));
console.log('  [2] robots.txt 指向 sitemap   ' + (robots?.ok && /Sitemap:/i.test(robots.text) ? '✅' : '❌ 未声明 Sitemap'));
console.log('  [3] sitemap.xml 在线          ' + (sitemap?.ok ? '✅ HTTP ' + sitemap.status : '❌'));
const urlCount = sitemap?.ok ? [...(sitemap.text || '').matchAll(/<loc>/g)].length : 0;
console.log('  [4] sitemap 内 URL 数          ' + urlCount);
console.log('  [5] 目标搜索引擎爬虫放行：');
for (const b of ['Googlebot', 'Google-Extended', 'Baiduspider', 'Bingbot', 'YandexBot']) {
  console.log('        ' + (allowed.includes(b) ? '✅' : '❌') + ' ' + b);
}

const selfDiscovery = robots?.ok && /Sitemap:/i.test(robots.text) && sitemap?.ok && allowed.includes('Googlebot') && allowed.includes('Baiduspider');
console.log('\n  ── 判定 ──');
console.log('  Google 自助发现：' + (allowed.includes('Googlebot') && /Sitemap:/i.test(robots?.text || '') && sitemap?.ok ? '✅ 成立（Googlebot 放行 + robots 指向 sitemap + sitemap 在线）' : '❌ 不成立'));
console.log('  百度 自助发现：  ' + (allowed.includes('Baiduspider') && /Sitemap:/i.test(robots?.text || '') && sitemap?.ok ? '✅ 成立（Baiduspider 放行 + robots 指向 sitemap + sitemap 在线）' : '❌ 不成立'));
console.log('\n  说明：搜索引擎发现新站的标准路径是 —— 通过外链或已知域名爬到 robots.txt，');
console.log('        由 robots.txt 的 Sitemap 指令找到 sitemap.xml，再抓取其中的 URL。');
console.log('        GSC/站长平台提交是【加速器】，不是【必要条件】。\n');
