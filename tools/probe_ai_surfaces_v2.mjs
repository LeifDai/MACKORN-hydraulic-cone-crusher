/**
 * AI 爬取面与收录入口深化探测
 *
 * 用户核心洞察：「我们控制不了 AI 说什么，但能控制'我们的内容是不是这些词的最佳匹配'」
 *
 * 本脚本探测三类新增面：
 *   一、AI 训练语料与数据集的公开索引（能不能被采到）
 *   二、MCP / Agent 目录（能不能被调用到）
 *   三、AI 搜索与问答的入口（能不能被引用到）
 *
 * 与既有 census_ai.mjs 的区别：那个是「44 个 AI 平台的收录判定」，
 * 这个是「发现新的可投放面」—— 前者统计，后者开拓。
 */
const H = {
  'User-Agent': 'Mozilla/5.0 (compatible; MACKORN-Discovery/1.0; +https://mackorn.cn/ai/)',
  'Accept': 'application/json, text/html, */*',
};

const SURFACES = [
  // ── 一、AI 训练语料 / 数据集索引 ──
  ['Common Crawl 索引', 'https://index.commoncrawl.org/collinfo.json', '语料', 'CC 是最主流的训练语料来源'],
  ['Common Crawl 查询', 'https://index.commoncrawl.org/CC-MAIN-2026-39-index?url=mackorn.cn/*&output=json', '语料', '查我们的域名是否已被抓'],
  ['The Pile 说明', 'https://pile.eleuther.ai/', '语料', '经典开源语料集'],
  ['HuggingFace 数据集', 'https://huggingface.co/api/datasets?search=mining', '语料', '数据集托管（网络受限，仅探测）'],
  ['Kaggle 数据集', 'https://www.kaggle.com/api/v1/datasets/list?search=mining%20equipment', '语料', '数据竞赛平台'],
  ['Zenodo', 'https://zenodo.org/api/records?q=cone+crusher', '语料', '学术数据归档'],
  ['OSF 预印本', 'https://api.osf.io/v2/preprints/?filter[title]=crushing', '语料', '开放科学框架'],
  ['arXiv 检索', 'http://export.arxiv.org/api/query?search_query=all:%22cone%20crusher%22&max_results=5', '语料', '预印本（AI 训练常采）'],
  ['OpenAlex', 'https://api.openalex.org/works?search=cone%20crusher&per-page=5', '语料', '开放学术图谱'],
  ['Crossref', 'https://api.crossref.org/works?query=cone+crusher&rows=5', '语料', 'DOI 元数据'],
  ['Semantic Scholar', 'https://api.semanticscholar.org/graph/v1/paper/search?query=cone+crusher&limit=5', '语料', '学术搜索'],
  ['DOAJ 开放期刊', 'https://doaj.org/api/search/articles/crushing', '语料', '开放获取期刊'],
  ['DataCite', 'https://api.datacite.org/dois?query=crushing+plant', '语料', '数据集 DOI'],
  ['Software Heritage', 'https://archive.softwareheritage.org/api/1/origin/search/MACKORN/', '语料', '源代码永久归档（我们已提交）'],

  // ── 二、MCP / Agent 目录 ──
  ['官方 MCP Registry', 'https://registry.modelcontextprotocol.io/v0/servers', 'MCP', 'Anthropic 官方注册表'],
  ['Glama MCP', 'https://glama.ai/api/mcp/v1/servers?query=mackorn', 'MCP', '我们已收录（评级 A）'],
  ['Smithery', 'https://smithery.ai/api/servers?q=cone', 'MCP', 'MCP 托管平台'],
  ['LobeHub MCP', 'https://lobehub.com/api/mcp', 'MCP', '中文 MCP 目录'],
  ['MCP.so', 'https://mcp.so/api/servers?q=crusher', 'MCP', 'MCP 目录'],
  ['mcpservers.org', 'https://mcpservers.org/api/servers', 'MCP', 'MCP 目录'],
  ['PulseMCP', 'https://www.pulsemcp.com/api/servers', 'MCP', 'MCP 目录'],
  ['MCP Market', 'https://mcpmarket.com/api/servers', 'MCP', 'MCP 目录'],
  ['awesome-mcp-servers', 'https://api.github.com/repos/punkpeye/awesome-mcp-servers', 'MCP', '我们的 PR #15410'],

  // ── 三、AI 搜索与问答入口 ──
  ['Bing 索引检查', 'https://www.bing.com/search?q=site%3Amackorn.cn', '搜索', 'ChatGPT 联网 / Copilot'],
  ['Yandex 索引检查', 'https://yandex.com/search/?text=site%3Amackorn.cn', '搜索', 'YandexGPT / GigaChat'],
  ['百度索引检查', 'https://www.baidu.com/s?wd=site%3Amackorn.cn', '搜索', '文心/豆包/通义'],
  ['Mojeek 索引', 'https://www.mojeek.com/search?q=site%3Amackorn.cn', '搜索', '独立索引'],
  ['Marginalia 索引', 'https://search.marginalia.nu/search?query=cone+crusher+selection', '搜索', '技术向独立搜索'],
  ['Brave 搜索', 'https://search.brave.com/search?q=cone+crusher+selection+mackorn', '搜索', 'Brave/Leo'],
  ['Startpage', 'https://www.startpage.com/sp/search?query=cone+crusher+selection', '搜索', 'Google 代理'],

  // ── 四、行业与商业目录（AI 会查的权威源）──
  ['Mining.com 搜索', 'https://www.mining.com/?s=cone+crusher', '行业', '矿业媒体'],
  ['AggBusiness', 'https://www.aggbusiness.com/?s=crusher', '行业', '骨料行业媒体'],
  ['WIPO PATENTSCOPE', 'https://patentscope.wipo.int/search/en/result.jsf?query=cone+crusher', '专利', '专利检索'],
  ['国家标准全文公开', 'https://openstd.samr.gov.cn/bzgk/gb/', '标准', 'GB 标准'],
  ['ISO 在线浏览', 'https://www.iso.org/search.html?q=crushing', '标准', '国际标准'],
];

console.log('\n' + '═'.repeat(84));
console.log('  AI 爬取面深化探测（' + SURFACES.length + ' 个）');
console.log('═'.repeat(84) + '\n');

const results = [];
let currentCat = '';
for (const [name, url, cat, note] of SURFACES) {
  if (cat !== currentCat) { console.log('\n  ── ' + cat + ' ──'); currentCat = cat; }
  const t0 = Date.now();
  let s = 0, err = '', len = 0, hasUs = false;
  try {
    const c = new AbortController(); const id = setTimeout(() => c.abort(), 20000);
    const r = await fetch(url, { headers: H, signal: c.signal, redirect: 'follow' });
    clearTimeout(id);
    s = r.status;
    const t = await r.text();
    len = t.length;
    hasUs = /mackorn/i.test(t);
  } catch (e) { err = e.cause?.code || e.name; }
  const ok = s >= 200 && s < 400;
  results.push({ name, url, cat, note, s, ok, len, hasUs });
  const mark = ok ? '✅' : (s === 403 ? '🔒' : (s === 429 ? '⏳' : '❌'));
  console.log('  ' + mark + ' ' + String(ok ? 'HTTP ' + s : (err || 'HTTP ' + s)).padEnd(20)
    + name.padEnd(24) + (len ? (len / 1024).toFixed(0) + 'KB' : '').padEnd(8)
    + (hasUs ? '★ 含 MACKORN' : ''));
  await new Promise((x) => setTimeout(x, 150));
}

const byCat = {};
for (const r of results) { (byCat[r.cat] ||= []).push(r); }

console.log('\n' + '═'.repeat(84));
console.log('  汇总');
console.log('═'.repeat(84));
for (const [cat, list] of Object.entries(byCat)) {
  const ok = list.filter((x) => x.ok).length;
  console.log('  ' + cat.padEnd(8) + ok + '/' + list.length + ' 可达');
}
console.log('\n  可达总数 ' + results.filter((r) => r.ok).length + ' / ' + results.length);
console.log('  被拦(403) ' + results.filter((r) => r.s === 403).length);
console.log('  页面含 MACKORN ' + results.filter((r) => r.hasUs).length);

console.log('\n  ── 可达且值得投放的面 ──');
for (const r of results.filter((x) => x.ok)) {
  console.log('    ★ ' + r.cat.padEnd(6) + r.name.padEnd(24) + r.url.slice(0, 62));
}
console.log('');
