/**
 * AI 可抓取性探测 —— 我们在哪、Bruno 在哪、差在哪
 *
 * 背景：bruno-mcp（一个很简单的只读索引器）出现在 LobeHub / mcpworld 等多个目录。
 * 差距不在技术，在分发覆盖。本脚本把"谁在哪"查清楚。
 *
 * 同时检查 AI 爬虫许可：GPTBot / ClaudeBot / PerplexityBot / CCBot / Google-Extended
 */
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const j = async (u) => { try { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(25000) }); return { s: r.status, t: await r.text() }; } catch (e) { return { s: 0, e: e.cause?.code || e.message }; } };

const MINE = 'mackorn-cone-crusher';
const MINE2 = 'MACKORN';
const BRUNO = 'bruno-mcp';

const DIRS = [
  ['dev48v-public-mcp-servers', 'https://raw.githubusercontent.com/pranshuchittora/dev48v-public-mcp-servers/main/README.md'],
  ['LobeHub MCP 目录', 'https://lobehub.com/mcp'],
  ['LobeHub 搜索', 'https://lobehub.com/mcp?q=mackorn'],
  ['LobeHub Bruno', 'https://lobehub.com/mcp?q=bruno'],
  ['mcpworld 搜索', 'https://www.mcpworld.com/zh/search?q=mackorn'],
  ['Glama 我们的页面', 'https://glama.ai/mcp/servers/LeifDai/MACKORN-hydraulic-cone-crusher'],
  ['官方注册表', 'https://registry.modelcontextprotocol.io/v0/servers?search=mackorn'],
  ['PulseMCP 搜索', 'https://www.pulsemcp.com/servers?q=mackorn'],
  ['MCP.so 搜索', 'https://mcp.so/search?q=mackorn'],
  ['Smithery 搜索', 'https://smithery.ai/?q=mackorn'],
  ['MCP Directory', 'https://mcpservers.org/?q=mackorn'],
];

console.log('═══ 1) 目录覆盖探测 ═══');
for (const [label, url] of DIRS) {
  const { s, t, e } = await j(url);
  let hit = '';
  if (t) {
    const hasMine = new RegExp(MINE, 'i').test(t) || /MACKORN/i.test(t);
    const hasBruno = /bruno/i.test(t);
    if (hasMine) hit = '  ✅ 有我们';
    else if (hasBruno) hit = '  ⚠ 有 Bruno 但没我们';
    else if (s === 200) hit = '  ○ 页面可达，未命中';
  }
  console.log('  ' + String(s).padEnd(5) + label.padEnd(30) + (e || hit));
}

console.log('\n═══ 2) AI 爬虫许可（robots.txt）═══');
const rb = await j('https://mackorn.cn/robots.txt');
if (rb.t) {
  const bots = ['GPTBot', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot', 'CCBot', 'Google-Extended', 'Applebot-Extended', 'Bytespider', 'Amazonbot', 'meta-externalagent', 'cohere-ai', 'YouBot', 'Diffbot', 'OAI-SearchBot', 'ChatGPT-User'];
  const txt = rb.t;
  console.log('  robots.txt 长度 ' + txt.length + ' 字节');
  for (const b of bots) {
    const re = new RegExp('User-agent:\\s*' + b.replace(/[-]/g, '\\-'), 'i');
    const found = re.test(txt);
    const dis = found && new RegExp('User-agent:\\s*' + b.replace(/[-]/g, '\\-') + '[\\s\\S]{0,200}?Disallow:\\s*/\\s*$', 'im').test(txt);
    console.log('    ' + (found ? (dis ? '⛔ 被禁' : '✅ 放行') : '○ 未提及（默认允许）') + '  ' + b);
  }
  const sitemap = /Sitemap:/i.test(txt);
  console.log('    ' + (sitemap ? '✅' : '⚠ ') + '  Sitemap 声明');
} else console.log('  ⚠ robots.txt 不可达');

console.log('\n═══ 3) AI 训练语料源可达性 ═══');
const CORPUS = [
  ['Common Crawl 索引', 'https://index.commoncrawl.org/collinfo.json'],
  ['Wikidata API', 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=MACKORN&language=en&format=json'],
  ['Wikipedia 搜索', 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=MACKORN%20cone%20crusher&format=json'],
  ['GitHub 我们仓库', 'https://api.github.com/repos/LeifDai/MACKORN-hydraulic-cone-crusher'],
  ['npm 我们包', 'https://registry.npmjs.org/mackorn-cone-crusher'],
];
for (const [label, url] of CORPUS) {
  const { s, t, e } = await j(url);
  let note = '';
  if (t) {
    if (/MACKORN|mackorn/i.test(t)) note = '  ✅ 已收录我们';
    else if (s === 200) note = '  ○ 可达，未收录';
  }
  console.log('  ' + String(s).padEnd(5) + label.padEnd(24) + (e || note));
}
