/**
 * 非美国矿业公司公开信息源探测
 *
 * 问题：当前客户情报只覆盖美国上市公司（SEC EDGAR）。
 *       但用户的目标市场是中亚、拉美、非洲、东南亚、澳加 —— 大量矿企不在 SEC 体系内。
 *
 * 本脚本探测各国公开披露平台是否可达：
 *   加拿大 SEDAR+ · 澳洲 ASX · 英国 LSE RNS · 南非 JSE · 印度 BSE/NSE
 *   智利 CMF · 秘鲁 SMV · 墨西哥 BMV · 巴西 CVM
 *   以及国际矿权/招标平台
 */
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
};

const SOURCES = [
  // ── 加拿大（矿业公司最集中的交易所之一）──
  ['加拿大 SEDAR+ 门户', 'https://www.sedarplus.ca/', '官方披露平台'],
  ['加拿大 SEDAR+ API', 'https://www.sedarplus.ca/landingpage/our-services/search.html', '检索入口'],
  ['TMX Money 公司', 'https://money.tmx.com/en/quote/ABX', '行情+公告'],
  // ── 澳洲 ──
  ['澳洲 ASX 公告', 'https://www.asx.com.au/asx/v2/statistics/announcements.do', '公告接口'],
  ['ASX 上市列表', 'https://www.asx.com.au/asx/research/listedCompanies.do', '公司名录'],
  ['澳洲公司公告镜像', 'https://announcements.asx.com.au/', '公告镜像'],
  // ── 英国 ──
  ['伦敦 LSE RNS', 'https://www.londonstockexchange.com/news?tab=news-explorer', '监管公告'],
  ['Investegate (UK)', 'https://www.investegate.co.uk/', 'RNS 聚合'],
  // ── 南非 ──
  ['南非 JSE', 'https://www.jse.co.za/', '交易所'],
  ['Moneyweb SENS', 'https://www.moneyweb.co.za/', 'SENS 公告聚合'],
  // ── 拉美 ──
  ['智利 CMF', 'https://www.cmfchile.cl/', '证券监管'],
  ['秘鲁 SMV', 'https://www.smv.gob.pe/', '证券监管'],
  ['巴西 CVM', 'https://www.gov.br/cvm/', '证券监管'],
  ['墨西哥 BMV', 'https://www.bmv.com.mx/', '交易所'],
  // ── 亚洲 ──
  ['印度 BSE', 'https://www.bseindia.com/', '交易所'],
  ['印度 NSE', 'https://www.nseindia.com/', '交易所'],
  ['印尼 IDX', 'https://www.idx.co.id/', '交易所'],
  ['菲律宾 PSE', 'https://www.pse.com.ph/', '交易所'],
  ['土耳其 BIST', 'https://www.borsaistanbul.com/', '交易所'],
  // ── 国际矿业数据 ──
  ['SNL / S&P 矿业', 'https://www.spglobal.com/marketintelligence/en/industries/mining', '商业数据'],
  ['Mining.com 公司页', 'https://www.mining.com/companies/', '聚合'],
  ['InfoMine 公司', 'https://www.infomine.com/mines/', '矿山库'],
  ['Mining Intelligence', 'https://miningintelligence.com/', '矿山数据'],
  ['USGS 矿产年鉴', 'https://www.usgs.gov/centers/national-minerals-information-center', '全球矿山'],
  ['世界银行采掘业', 'https://www.worldbank.org/en/topic/extractiveindustries', '行业'],
  // ── 招标/项目信息 ──
  ['联合国采购 UNGM', 'https://www.ungm.org/', '招标'],
  ['TendersInfo', 'https://www.tendersinfo.com/', '招标聚合'],
  ['DgMarket', 'https://www.dgmarket.com/', '招标'],
  ['中国政府采购网', 'http://www.ccgp.gov.cn/', '招标（中国）'],
  ['中国招标投标公共服务平台', 'https://www.cebpubservice.com/', '招标（中国）'],
];

console.log('\n' + '═'.repeat(80));
console.log('  非美国矿业信息源探测（' + SOURCES.length + ' 个）');
console.log('═'.repeat(80) + '\n');

const results = [];
for (const [name, url, note] of SOURCES) {
  const t0 = Date.now();
  let s = 0, err = '', len = 0, json = false, hasMining = false;
  try {
    const c = new AbortController(); const id = setTimeout(() => c.abort(), 20000);
    const r = await fetch(url, { headers: H, signal: c.signal, redirect: 'follow' });
    clearTimeout(id);
    s = r.status;
    const t = await r.text();
    len = t.length;
    json = /json/i.test(r.headers.get('content-type') || '') || /^[[{]/.test(t.trim());
    hasMining = /(mining|mineral|ore|mines|copper|gold|crushing|exploration)/i.test(t);
  } catch (e) { err = e.cause?.code || e.name; }
  const ok = s >= 200 && s < 400;
  results.push({ name, url, note, s, ok, len, json, hasMining });
  const mark = ok ? '✅' : (s === 403 ? '🔒' : '❌');
  console.log('  ' + mark + ' ' + name.padEnd(26) + String(ok ? 'HTTP ' + s : (err || 'HTTP ' + s)).padEnd(22)
    + (len ? (len / 1024).toFixed(0) + 'KB' : '').padEnd(8) + note);
  await new Promise((x) => setTimeout(x, 150));
}

const okList = results.filter((r) => r.ok);
console.log('\n  ── 汇总 ──');
console.log('    可达 ' + okList.length + ' / ' + results.length);
console.log('    含矿业关键词 ' + results.filter((r) => r.hasMining).length + ' 个');
console.log('    返回 JSON ' + results.filter((r) => r.json).length + ' 个');
console.log('    被拦(403) ' + results.filter((r) => r.s === 403).length + ' 个');

console.log('\n  ── 可达且含矿业内容（优先用于建客户库）──');
for (const r of results.filter((x) => x.ok && x.hasMining)) {
  console.log('    ★ ' + r.name.padEnd(26) + r.url);
}
console.log('');
