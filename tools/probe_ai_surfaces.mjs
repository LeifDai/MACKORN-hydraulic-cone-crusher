/**
 * AI 爬取面可达性探测
 *
 * 用户战略："AI 经常去哪里爬数据，我们就要在哪里；Bruno 在哪里我们就在哪里；
 *           哪里 AI 喜欢采集的地方，Bruno 即使没有的，我们也要去。"
 *
 * 本脚本探测 40+ 个"AI 会爬的面"是否可达，并标注：
 *   ① 类型（训练语料 / 检索索引 / 学术 / 代码 / 数据集 / 问答 / 媒体 / 档案）
 *   ② AI 采信程度（高/中/低）
 *   ③ 我们能否进入（可自动 / 需人工 / 需账号 / 不可达）
 */
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120', 'Accept': '*/*' };

const SURFACES = [
  // ── 训练语料（AI 学习的源头） ──
  ['训练语料', 'Common Crawl', 'https://commoncrawl.org/', '高', 'robots.txt 已放行 CCBot'],
  ['训练语料', 'Common Crawl 索引', 'https://index.commoncrawl.org/', '高', '可查我们的收录状态'],
  ['训练语料', 'The Pile (EleutherAI)', 'https://pile.eleuther.ai/', '高', '含 arXiv/GitHub/专利/StackExchange'],
  ['训练语料', 'Wikipedia', 'https://en.wikipedia.org/', '极高', '需关注度'],
  ['训练语料', 'Wikidata', 'https://www.wikidata.org/', '极高', '需人工建条目'],
  ['训练语料', 'Reddit', 'https://www.reddit.com/', '高', 'r/mining 等'],
  ['训练语料', 'Stack Exchange', 'https://api.stackexchange.com/', '高', '工程问答'],
  ['训练语料', 'Internet Archive', 'https://web.archive.org/', '高', '可主动提交存档'],

  // ── 学术（可信度最高，AI 优先采信） ──
  ['学术', 'arXiv', 'https://arxiv.org/', '极高', '可投稿预印本'],
  ['学术', 'Zenodo (DOI)', 'https://zenodo.org/api/', '高', 'REST API，可自动发布数据集'],
  ['学术', 'Figshare', 'https://api.figshare.com/', '高', 'REST API'],
  ['学术', 'OSF', 'https://api.osf.io/', '中', 'REST API'],
  ['学术', 'OpenAlex', 'https://api.openalex.org/', '高', '学术元数据'],
  ['学术', 'Crossref', 'https://api.crossref.org/', '高', 'DOI 注册'],
  ['学术', 'Semantic Scholar', 'https://api.semanticscholar.org/', '高', '需 API key'],
  ['学术', 'Google Scholar', 'https://scholar.google.com/', '极高', '不可编程提交'],
  ['学术', 'ResearchGate', 'https://www.researchgate.net/', '中', '需账号'],
  ['学术', 'Academia.edu', 'https://www.academia.edu/', '中', '需账号'],
  ['学术', 'DOAJ', 'https://doaj.org/api/', '中', '开放获取期刊'],

  // ── 代码与软件（AI 训练代码语料） ──
  ['代码', 'GitHub', 'https://api.github.com/', '极高', '✅ 已发布'],
  ['代码', 'Software Heritage', 'https://archive.softwareheritage.org/api/1/', '高', '★ 自动归档所有公开仓库'],
  ['代码', 'npm', 'https://registry.npmjs.org/', '高', '✅ 已发布'],
  ['代码', 'PyPI', 'https://pypi.org/pypi/', '高', '★ 可发 Python 包'],
  ['代码', 'Hugging Face', 'https://huggingface.co/api/', '极高', '★ 数据集/模型，AI 重度爬取'],
  ['代码', 'GitLab', 'https://gitlab.com/api/v4/', '中', '可镜像'],
  ['代码', 'SourceForge', 'https://sourceforge.net/', '中', '可镜像'],
  ['代码', 'Docker Hub', 'https://hub.docker.com/', '中', '可发镜像'],

  // ── 数据集（我们已有海关数据库） ──
  ['数据集', 'Kaggle', 'https://www.kaggle.com/api/v1/', '高', '需账号+key'],
  ['数据集', 'Hugging Face Datasets', 'https://huggingface.co/api/datasets', '极高', '★ 无需 key 可上传'],
  ['数据集', 'Zenodo Datasets', 'https://zenodo.org/api/deposit/depositions', '高', '★ 给 DOI'],

  // ── 问答与社区（AI 抽取答案的高频源） ──
  ['问答', 'Stack Exchange 提问', 'https://api.stackexchange.com/2.3/questions', '高', '需账号'],
  ['问答', 'Quora', 'https://www.quora.com/', '中', '需账号'],
  ['问答', '911 Metallurgist', 'https://www.911metallurgist.com/', '高', '★ 选矿问答，AI 常引用'],
  ['问答', 'Hacker News', 'https://news.ycombinator.com/', '中', '技术社区'],
  ['问答', 'Dev.to', 'https://dev.to/api/', '中', 'API 可发'],

  // ── 检索索引（AI 实时检索用的索引） ──
  ['检索', 'Google', 'https://www.google.com/', '极高', '需 GSC'],
  ['检索', 'Bing', 'https://www.bing.com/', '极高', '✅ IndexNow 已提交'],
  ['检索', 'Yandex', 'https://yandex.com/', '高', '✅ IndexNow 已提交'],
  ['检索', 'Baidu', 'https://www.baidu.com/', '高（中文）', '需百度站长'],
  ['检索', 'Brave Search', 'https://search.brave.com/', '中', '独立索引'],
  ['检索', 'DuckDuckGo', 'https://duckduckgo.com/', '中', '用 Bing 索引'],
  ['检索', 'Mojeek', 'https://www.mojeek.com/', '低', '独立索引，可提交'],
  ['检索', 'Marginalia', 'https://search.marginalia.nu/', '低', '独立索引，可提交'],

  // ── 行业媒体与目录 ──
  ['媒体', 'Mining.com', 'https://www.mining.com/', '高', '投稿'],
  ['媒体', 'Mining Technology', 'https://www.mining-technology.com/', '中', '投稿'],
  ['媒体', 'Aggregates Business', 'https://www.aggbusiness.com/', '中', '投稿'],
  ['目录', 'InfoMine', 'https://www.infomine.com/', '高', '★ 矿业设备目录'],
  ['目录', 'Mindat.org', 'https://www.mindat.org/', '高', '★ 全球最大矿物数据库'],
  ['目录', 'Crunchbase', 'https://api.crunchbase.com/', '中', '公司实体'],

  // ── MCP 与 AI 工具目录（Bruno 没有的） ──
  ['MCP', '官方 MCP Registry', 'https://registry.modelcontextprotocol.io/v0/servers', '高', '✅ 已收录'],
  ['MCP', 'Glama', 'https://glama.ai/', '中', '✅ 已收录'],
  ['MCP', 'Smithery', 'https://smithery.ai/', '中', '待上传'],
  ['MCP', 'LobeHub', 'https://lobehub.com/', '中', '✅ 已收录'],
  ['MCP', 'MCP.so', 'https://mcp.so/', '中', '✅ 已收录'],
  ['MCP', 'PulseMCP', 'https://www.pulsemcp.com/', '中', '★ 可提交'],
  ['MCP', 'MCP Market', 'https://mcpmarket.com/', '中', '可提交'],
  ['MCP', 'Awesome MCP Servers', 'https://github.com/punkpeye/awesome-mcp-servers', '高', 'PR 已开'],

  // ── 专利与标准（Bruno 没有的） ──
  ['专利', 'Google Patents', 'https://patents.google.com/', '高', '检索用'],
  ['专利', 'USPTO', 'https://api.uspto.gov/', '高', '可检索+申请'],
  ['专利', 'EPO OPS', 'https://ops.epo.org/', '中', '需 key'],
  ['专利', 'WIPO PATENTSCOPE', 'https://patentscope.wipo.int/', '中', '检索'],
  ['标准', 'ISO', 'https://www.iso.org/', '极高', '参编'],
  ['标准', 'GB 国家标准', 'https://openstd.samr.gov.cn/', '高', '参编'],

  // ── 视频与演示（AI 会爬字幕） ──
  ['视频', 'YouTube', 'https://www.youtube.com/', '高', '字幕被爬'],
  ['视频', 'SlideShare', 'https://www.slideshare.net/', '中', '演示文稿'],
  ['视频', 'Bilibili', 'https://www.bilibili.com/', '中（中文）', '字幕被爬'],
];

console.log('\n  ── AI 爬取面可达性探测（' + SURFACES.length + ' 个）──\n');

const results = [];
for (const [cat, name, url, weight, note] of SURFACES) {
  const t0 = Date.now();
  let status = 0, err = '';
  try {
    const r = await fetch(url, { headers: H, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    status = r.status;
    await r.text().catch(() => { });
  } catch (e) { err = e.cause?.code || e.name; }
  const ok = status >= 200 && status < 400;
  results.push({ cat, name, url, weight, note, status, err, ok });
  const mark = ok ? '✅' : (status === 403 ? '🔒' : '❌');
  console.log('  ' + mark + ' ' + cat.padEnd(6) + name.padEnd(26) + (ok ? 'HTTP ' + status : (err || 'HTTP ' + status)).padEnd(22) + '[' + weight + ']');
  await new Promise((s) => setTimeout(s, 200));
}

const ok = results.filter((r) => r.ok);
const blocked = results.filter((r) => !r.ok);

console.log('\n  ── 汇总 ──');
console.log('     可达 ' + ok.length + ' / ' + results.length);
const byCat = {};
for (const r of results) { byCat[r.cat] = byCat[r.cat] || { ok: 0, n: 0 }; byCat[r.cat].n++; if (r.ok) byCat[r.cat].ok++; }
for (const [c, v] of Object.entries(byCat)) console.log('     ' + c.padEnd(6) + v.ok + '/' + v.n);
console.log('\n  ── 不可达（网络层）──');
for (const r of blocked) console.log('     ' + r.name.padEnd(26) + (r.err || 'HTTP ' + r.status));
console.log('');

/* 导出 JSON 供后续使用 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(resolve(HERE, '..'), 'distribution'), { recursive: true });
writeFileSync(join(resolve(HERE, '..'), 'distribution', 'ai-crawl-surfaces.json'),
  JSON.stringify({ generated: new Date().toISOString(), total: results.length, reachable: ok.length, surfaces: results }, null, 2), 'utf8');
console.log('  已导出 distribution/ai-crawl-surfaces.json\n');
