/**
 * 三重交叉：客户公司 × 海关进口 × 在建项目（修正数据结构版）
 *
 * 实际结构：
 *   trade-global.json → countries[code] = { code, en, zh, tier, hs: { '847410': {years:{2023:{usd}}}, '847420': {...}, '847490': {...} } }
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const CL = join(D, 'company-leads');
const load = (p, def) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return def; } };

const trade = load(join(D, '02_数据与分析', 'trade-global.json'), { countries: {} });
const usLeads = load(join(CL, 'sec-edgar-raw.json'), { companies: [] });
const nonUs = load(join(CL, 'global', 'non-us-mining-companies.json'), { companies: [] });
const tenk = load(join(CL, 'tenk-extracts', 'tenk-extracts.json'), { companies: [] });

console.log('\n  数据源：海关 ' + Object.keys(trade.countries).length + ' 国 · 美国线索 ' + usLeads.companies.length
  + ' · 非美线索 ' + nonUs.companies.length + ' · 10-K ' + tenk.companies.length);

/* ── 从海关数据提取各国三码金额（取最新年份）── */
const rows = [];
for (const [code, c] of Object.entries(trade.countries)) {
  const getUsd = (hs) => {
    const h = c.hs && c.hs[hs];
    if (!h || !h.years) return null;
    const yrs = Object.keys(h.years).map(Number).filter((y) => Number.isFinite(y)).sort((a, b) => b - a);
    for (const y of yrs) { const v = h.years[String(y)]?.usd; if (Number.isFinite(v)) return { usd: v, year: y }; }
    return null;
  };
  const crusher = getUsd('847420');
  const screen = getUsd('847410');
  const parts = getUsd('847490');
  const total = (crusher?.usd || 0) + (screen?.usd || 0) + (parts?.usd || 0);
  if (total <= 0) continue;
  rows.push({
    code, zh: c.zh || c.en || code, en: c.en || '', tier: c.tier,
    crusher: crusher?.usd ?? null, screen: screen?.usd ?? null, parts: parts?.usd ?? null,
    total, year: crusher?.year ?? screen?.year ?? parts?.year ?? null,
  });
}
rows.sort((a, b) => b.total - a.total);

const f = (x) => x === null || x === undefined ? '-' : (x / 1e6).toFixed(1) + 'M';
console.log('\n  ── 海关进口额前 30 国（国别总额，UN Comtrade 官方）──');
console.log('  ' + '─'.repeat(88));
console.log('  ' + '国家'.padEnd(18) + '年份'.padEnd(7) + '破碎'.padStart(11) + '筛分'.padStart(11) + '零件'.padStart(11) + '合计'.padStart(12));
for (const r of rows.slice(0, 30)) {
  console.log('  ' + String(r.zh).slice(0, 16).padEnd(18) + String(r.year || '-').padEnd(7)
    + f(r.crusher).padStart(11) + f(r.screen).padStart(11) + f(r.parts).padStart(11) + f(r.total).padStart(12));
}
console.log('  ' + '─'.repeat(88));

/* ── 区域映射 ── */
const REGION_OF = {
  '非洲': ['南非','加纳','马里','布基纳法索','坦桑尼亚','纳米比亚','津巴布韦','赞比亚','刚果','科特迪瓦','几内亚','塞内加尔','博茨瓦纳','埃及','摩洛哥','苏丹','埃塞俄比亚','尼日利亚','肯尼亚','阿尔及利亚','突尼斯','利比亚','毛里塔尼亚','尼日尔','喀麦隆','加蓬','安哥拉','莫桑比克','马达加斯加','乌干达','卢旺达','布隆迪','马拉维','斯威士兰','莱索托','厄立特里亚','吉布提','索马里','冈比亚','塞拉利昂','利比里亚','多哥','贝宁','中非','乍得','刚果民主','刚果金'],
  '拉美': ['巴西','智利','秘鲁','墨西哥','阿根廷','哥伦比亚','厄瓜多尔','玻利维亚','圭亚那','苏里南','多米尼加','巴拿马','委内瑞拉','巴拉圭','乌拉圭','哥斯达黎加','危地马拉','洪都拉斯','尼加拉瓜','萨尔瓦多','古巴','海地','牙买加','特立尼达','伯利兹','巴哈马','巴巴多斯'],
  '大洋洲': ['澳大利亚','巴布亚新几内亚','新西兰','斐济','所罗门','新喀里多尼亚'],
  '北美': ['加拿大','美国'],
  '欧洲': ['英国','爱尔兰','希腊','土耳其','西班牙','葡萄牙','芬兰','瑞典','挪威','德国','法国','意大利','波兰','荷兰','比利时','奥地利','瑞士','丹麦','捷克','斯洛伐克','匈牙利','罗马尼亚','保加利亚','塞尔维亚','克罗地亚','斯洛文尼亚','波黑','黑山','阿尔巴尼亚','北马其顿','乌克兰','白俄罗斯','立陶宛','拉脱维亚','爱沙尼亚','冰岛','卢森堡','马耳他','塞浦路斯','俄罗斯'],
  '中东': ['以色列','沙特','阿联酋','约旦','阿曼','卡塔尔','科威特','巴林','伊拉克','伊朗','黎巴嫩','叙利亚','也门'],
  '中亚': ['哈萨克斯坦','乌兹别克斯坦','蒙古','吉尔吉斯斯坦','塔吉克斯坦','土库曼斯坦','阿塞拜疆','亚美尼亚','格鲁吉亚'],
  '东南亚': ['印度尼西亚','菲律宾','越南','马来西亚','泰国','缅甸','老挝','柬埔寨','文莱','新加坡','东帝汶'],
  '南亚': ['印度','巴基斯坦','孟加拉','斯里兰卡','尼泊尔','不丹','马尔代夫','阿富汗'],
  '东亚': ['中国','香港','澳门','台湾','日本','韩国','朝鲜'],
};
function regionOf(zh) {
  const s = String(zh);
  // 先做【完全相等】匹配（避免 "印度尼西亚".includes("印度") 被误判为南亚）
  for (const [reg, list] of Object.entries(REGION_OF)) {
    if (list.includes(s)) return reg;
  }
  // 再做包含匹配，但取【最长匹配键】以避免歧义
  let best = null, bestLen = 0;
  for (const [reg, list] of Object.entries(REGION_OF)) {
    for (const k of list) {
      if (s.includes(k) && k.length > bestLen) { best = reg; bestLen = k.length; }
      else if (k.includes(s) && s.length > bestLen) { best = reg; bestLen = s.length; }
    }
  }
  return best || '其他';
}

/* ── 公司按运营区域归类 ── */
const OP_REGION = {
  '非洲': ['非洲'], '拉美': ['拉美'], '大洋洲': ['大洋洲'], '北美': ['北美'],
  '欧洲': ['欧洲'], '中东': ['中东'], '中亚': ['中亚'], '东南亚': ['东南亚'], '南亚': ['南亚'], '东亚': ['东亚'],
};
const companiesByRegion = {};
for (const c of nonUs.companies) {
  const r = (c.operating_region_manual || '').split(/[（(/]/)[0].trim();
  for (const [reg, keys] of Object.entries(OP_REGION)) {
    if (keys.some((k) => r.includes(k))) { companiesByRegion[reg] = (companiesByRegion[reg] || 0) + 1; break; }
  }
}
const usQualified = usLeads.companies.filter((c) => c.lead_grade === 'A-重点' || c.lead_grade === 'B-跟进').length;
companiesByRegion['北美'] = (companiesByRegion['北美'] || 0) + usQualified;

console.log('\n  ── 客户线索按区域 ──');
for (const [k, v] of Object.entries(companiesByRegion).sort((a, b) => b[1] - a[1])) console.log('    ' + k.padEnd(10) + String(v).padStart(4) + ' 家');

/* ── 三重交叉 ── */
const projectCountries = new Set();
for (const c of tenk.companies) for (const p of c.projects) {
  for (const [reg, list] of Object.entries(REGION_OF)) for (const k of list) {
    if (String(p.name).includes(k)) projectCountries.add(k);
  }
}

const hot = rows.map((r) => {
  const reg = regionOf(r.zh);
  return { ...r, region: reg, companiesInRegion: companiesByRegion[reg] || 0 };
}).filter((r) => r.companiesInRegion > 0 || r.total > 2e7);
hot.sort((a, b) => b.total - a.total);

console.log('\n  ── 【目标市场清单】有进口额 + 有客户线索 ──');
console.log('  ' + '─'.repeat(94));
console.log('  ' + '国家'.padEnd(18) + '区域'.padEnd(8) + '进口合计'.padStart(12) + '区域客户数'.padStart(11) + '  优先级');
for (const h of hot.slice(0, 35)) {
  let prio = 'C';
  if (h.total > 2e8 && h.companiesInRegion >= 2) prio = 'A ★';
  else if (h.total > 5e7 && h.companiesInRegion >= 1) prio = 'B';
  else if (h.total > 1e8) prio = 'B';
  console.log('  ' + String(h.zh).slice(0, 16).padEnd(18) + h.region.padEnd(8)
    + f(h.total).padStart(12) + String(h.companiesInRegion).padStart(11) + '  ' + prio);
}
console.log('  ' + '─'.repeat(94));

writeFileSync(join(CL, 'global', 'triple-cross-analysis.json'), JSON.stringify({
  generated: new Date().toISOString(),
  logic: '海关进口额（哪个国家在买）× 公司线索（谁在买）× 10-K 项目（在建什么）',
  sources: { trade_countries_with_data: rows.length, us_leads: usLeads.companies.length, non_us_leads: nonUs.companies.length, tenk: tenk.companies.length },
  company_by_region: companiesByRegion,
  top_import_countries: rows.slice(0, 60),
  hot_markets: hot.slice(0, 40),
  caveats: [
    '海关数据是国家总额，不能定位到具体买家 —— 要定位买家须用公司线索',
    '公司线索来自 SEC（美国上市公司 + 外国私人发行人 20-F/40-F），不覆盖未在美上市的企业',
    '区域客户数是"该区域有多少家已知矿企"，不等于该国客户数',
    '"优先开发"由进口额与客户密度共同判断，仍须人工复核',
  ],
  discipline: '进口额来自 UN Comtrade 官方统计；公司线索来自 SEC EDGAR；项目来自 10-K 正文。全部公开可核查，不做推断。',
}, null, 2), 'utf8');
console.log('\n  ✅ triple-cross-analysis.json\n');
