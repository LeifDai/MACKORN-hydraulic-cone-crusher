/**
 * 公司级海关数据源探测
 *
 * 用户要求："海关数据只有汇总数不可以，要细化到每一笔，有哪些案例、数据、客户名称"
 *
 * 事实修正（我之前说"Comtrade 没有公司名"是对的，但结论不完整）：
 *   UN Comtrade 没有公司名 —— 但【部分国家的海关数据是公开到公司级的】：
 *     · 巴西 Comex Stat   —— 公开到 CNPJ（公司税号）级，完全免费
 *     · 印度 Zauba/Volza  —— 印度海关数据传统上公开
 *     · 美国 提单数据      —— importyeti / Panjiva 等
 *     · 秘鲁/智利/墨西哥   —— 部分公开
 *     · 美国 SEC EDGAR    —— 上市公司披露供应商/客户
 * 本脚本探测这些源是否可达，并尝试拉取真实公司级记录。
 */
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', 'Accept': 'application/json, text/html, */*' };

const SOURCES = [
  // ── 巴西：公开到公司税号级 ──
  ['巴西 Comex Stat 门户', 'https://comexstat.mdic.gov.br/', '国家→公开到 CNPJ 公司级'],
  ['巴西 Comex Stat API', 'https://api-comexstat.mdic.gov.br/general?flow=import&year=2023&month=1&ncm=847420', 'REST API'],
  ['巴西 数据下载', 'https://balanca.economia.gov.br/balanca/dados/dados_abertos_ncm.html', '开放数据'],
  // ── 印度：海关数据传统公开 ──
  ['印度 Zauba', 'https://www.zauba.com/', '进出口明细'],
  ['印度 Volza', 'https://www.volza.com/', '含公司名'],
  ['印度 商工部', 'https://tradestat.commerce.gov.in/', '官方统计'],
  ['印度 DGFT', 'https://www.dgft.gov.in/', '外贸总局'],
  // ── 美国：提单数据 ──
  ['美国 ImportYeti', 'https://www.importyeti.com/', '免费提单数据'],
  ['美国 Panjiva', 'https://panjiva.com/', '含公司名'],
  ['美国 Datamyne', 'https://www.datamyne.com/', '商业数据'],
  ['美国 SEC EDGAR 全文检索', 'https://efts.sec.gov/LATEST/search-index?q=%22cone+crusher%22&dateRange=custom', '上市公司披露'],
  ['美国 SEC EDGAR 搜索', 'https://efts.sec.gov/LATEST/search-index?q=crusher', 'API'],
  ['美国 普查局', 'https://www.census.gov/foreign-trade/', '官方统计'],
  // ── 拉美其他 ──
  ['秘鲁 SUNAT', 'https://www.sunat.gob.pe/', '海关与税务'],
  ['智利 Aduanas', 'https://www.aduana.cl/', '海关'],
  ['墨西哥 数据开放', 'https://datos.gob.mx/', '开放数据'],
  ['哥伦比亚 DIAN', 'https://www.dian.gov.co/', '海关税务'],
  ['阿根廷 数据', 'https://www.argentina.gob.ar/aduana', '海关'],
  // ── 其他公开海关数据 ──
  ['印尼 INSW', 'https://insw.go.id/', '国家单一窗口'],
  ['菲律宾 数据', 'https://data.gov.ph/', '开放数据'],
  ['越南 海关', 'https://www.customs.gov.vn/', '海关总局'],
  ['土耳其 统计', 'https://www.tuik.gov.tr/', '统计局'],
  ['南非 SARS', 'https://www.sars.gov.za/', '税务海关'],
  ['WTO 数据', 'https://stats.wto.org/', '贸易统计'],
  ['世界银行 WITS', 'https://wits.worldbank.org/', '贸易数据（可到产品级）'],
  ['ITC Trade Map', 'https://www.trademap.org/', '国际贸易中心（到企业级需订阅）'],
  // ── 矿业公司名录（可交叉定位客户） ──
  ['USGS 矿产年鉴', 'https://www.usgs.gov/centers/national-minerals-information-center', '全球矿山名录'],
  ['InfoMine 矿山', 'https://www.infomine.com/mines/', '全球矿山数据库'],
  ['Mining.com 公司', 'https://www.mining.com/companies/', '矿业公司'],
];

console.log('\n  ══════════════════════════════════════════════════════════');
console.log('   公司级海关数据源探测（' + SOURCES.length + ' 个）');
console.log('  ══════════════════════════════════════════════════════════\n');

const results = [];
for (const [name, url, note] of SOURCES) {
  const t0 = Date.now();
  let status = 0, err = '', size = 0, isJson = false, hasCompany = false;
  try {
    const c = new AbortController(); const id = setTimeout(() => c.abort(), 18000);
    const r = await fetch(url, { headers: H, signal: c.signal, redirect: 'follow' });
    clearTimeout(id);
    status = r.status;
    const ct = r.headers.get('content-type') || '';
    const t = await r.text();
    size = t.length;
    isJson = /json/i.test(ct) || /^[\[{]/.test(t.trim());
    // 探测是否含公司级特征（公司后缀）
    hasCompany = /\b(Ltd|Ltda|S\.A\.|Inc|Corp|Pty|GmbH|Pvt|Limited|Mineracao|Mineração)\b/i.test(t);
  } catch (e) { err = e.cause?.code || e.name; }
  const ok = status >= 200 && status < 400;
  results.push({ name, url, note, status, ok, size, isJson, hasCompany, err });
  const mark = ok ? '✅' : (status === 403 ? '🔒' : '❌');
  console.log('  ' + mark + ' ' + name.padEnd(26) + String(ok ? 'HTTP ' + status : (err || 'HTTP ' + status)).padEnd(20) + (size ? (size / 1024).toFixed(0) + 'KB' : '').padEnd(8) + note);
  await new Promise((s) => setTimeout(s, 200));
}

const ok = results.filter((r) => r.ok);
console.log('\n  ── 汇总 ──');
console.log('    可达 ' + ok.length + ' / ' + results.length);
console.log('    含公司名特征 ' + results.filter((r) => r.hasCompany).length + ' 个');
console.log('    返回 JSON ' + results.filter((r) => r.isJson).length + ' 个');

console.log('\n  ── 可能含公司级数据的源 ──');
for (const r of results.filter((x) => x.hasCompany || (x.ok && x.isJson))) {
  console.log('    ' + (r.hasCompany ? '★' : '○') + ' ' + r.name.padEnd(26) + r.url);
}
console.log('');
