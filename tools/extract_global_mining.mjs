/**
 * 从可达的全球矿业源提取公司名与项目线索
 *
 * 数据源选择（探测后可达且含矿业内容的）：
 *   Mining Intelligence    矿山数据库
 *   ASX 公告镜像           澳洲矿企公告
 *   Mining.com 公司页       矿业公司聚合
 *   InfoMine / 世界银行     行业
 *
 * 纪律：只提取页面原文出现的公司名与项目名；记录来源 URL；不做推断。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', 'company-leads', 'global');
mkdirSync(OUT, { recursive: true });

const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36', 'Accept': 'text/html,application/json,*/*' };

async function get(url, timeout = 30000) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { headers: H, signal: c.signal, redirect: 'follow' });
    if (!r.ok) return { s: r.status, t: '' };
    return { s: r.status, t: await r.text() };
  } catch (e) { return { s: 0, t: '', e: e.cause?.code || e.name }; }
  finally { clearTimeout(id); }
}

const strip = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
  .replace(/\s+/g, ' ');

/* ── 公司名提取规则 ── */
const CORP_SUFFIX = new RegExp('\\b(Inc|Corp|Corporation|Ltd|Limited|Pty|GmbH|AG|SA|Plc|PLC|LLC|NL|BV|NV|AB|ASA|SpA|Holdings|Resources|Minerals|Mining|Gold|Copper|Mines)\\b');
function extractCompanies(text) {
  const found = new Map();
  // 模式：连续大写开头的 1-4 个词 + 公司后缀
  const re = new RegExp('\\b([A-Z][A-Za-z&.\\-]+(?:\\s+[A-Z][A-Za-z&.\\-]+){0,3}\\s+(?:Inc|Corp|Corporation|Ltd|Limited|Pty\\.?\\s*Ltd|GmbH|AG|SA|Plc|PLC|LLC|NL|BV|NV|AB|ASA|SpA|Holdings|Resources|Minerals|Mining|Gold|Copper|Mines))\\b', 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].replace(/\s+/g, ' ').trim();
    if (name.length < 6 || name.length > 60) continue;
    if (/^(The|This|Our|Their|Its|All|Any|Such|For|With|From|And|Or)\b/i.test(name)) continue;
    const k = name.toLowerCase();
    found.set(k, (found.get(k) || 0) + 1);
  }
  return [...found.entries()].filter(([, n]) => n >= 1).map(([k, n]) => ({ name: k.replace(/\b\w/g, (c) => c.toUpperCase()), hits: n }));
}

/* ── 项目名提取 ── */
function extractProjects(text) {
  const set = new Set();
  const re = /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\s+(?:Project|Mine|Deposit|Operation|Complex|Property)\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = m[1].trim();
    if (v.length < 4 || v.length > 45) continue;
    if (/^(The|This|Our|Their|Its|All|Any|Such|New|Old|A|An)\b/i.test(v)) continue;
    set.add(v);
  }
  return [...set];
}

/* ── 按来源抓取 ── */
const TARGETS = [
  { key: 'mining-intelligence', name: 'Mining Intelligence', url: 'https://miningintelligence.com/' },
  { key: 'mining-com-companies', name: 'Mining.com 公司页', url: 'https://www.mining.com/companies/' },
  { key: 'asx-announcements', name: 'ASX 公告镜像', url: 'https://announcements.asx.com.au/' },
  { key: 'lse-news', name: '伦敦 LSE 公告', url: 'https://www.londonstockexchange.com/news?tab=news-explorer' },
  { key: 'investegate', name: 'Investegate (UK RNS)', url: 'https://www.investegate.co.uk/' },
  { key: 'mining-com-news', name: 'Mining.com 新闻', url: 'https://www.mining.com/' },
  { key: 'infomine', name: 'InfoMine', url: 'https://www.infomine.com/mines/' },
];

console.log('\n' + '═'.repeat(80));
console.log('  全球矿业公司/项目提取');
console.log('═'.repeat(80) + '\n');

const all = [];
for (const t of TARGETS) {
  const r = await get(t.url);
  if (!r.t) { console.log('  ❌ ' + t.name.padEnd(26) + (r.e || 'HTTP ' + r.s)); continue; }
  const text = strip(r.t);
  const cos = extractCompanies(text);
  const projects = extractProjects(text);
  all.push({ key: t.key, name: t.name, url: t.url, bytes: r.t.length, text_chars: text.length, companies: cos, projects });
  console.log('  ✅ ' + t.name.padEnd(26) + (r.t.length / 1024).toFixed(0) + 'KB  公司 ' + cos.length + ' · 项目 ' + projects.length);
  await new Promise((s) => setTimeout(s, 250));
}

/* ── 合并去重 ── */
const byCompany = new Map();
for (const src of all) {
  for (const c of src.companies) {
    const k = c.name.toLowerCase();
    const rec = byCompany.get(k) || { name: c.name, sources: new Set(), totalHits: 0 };
    rec.sources.add(src.name);
    rec.totalHits += c.hits;
    byCompany.set(k, rec);
  }
}
const companies = [...byCompany.values()]
  .map((c) => ({ name: c.name, sources: [...c.sources], sourceCount: c.sources.size, hits: c.totalHits }))
  .sort((a, b) => b.sourceCount - a.sourceCount || b.hits - a.hits);

const projects = new Map();
for (const src of all) for (const p of src.projects) {
  const rec = projects.get(p.toLowerCase()) || { name: p, sources: new Set() };
  rec.sources.add(src.name);
  projects.set(p.toLowerCase(), rec);
}
const projectList = [...projects.values()].map((p) => ({ name: p.name, sources: [...p.sources] }))
  .sort((a, b) => b.sources.length - a.sources.length);

console.log('\n  ── 合并结果 ──');
console.log('    唯一公司 ' + companies.length + ' 家 · 唯一项目 ' + projectList.length + ' 个');
console.log('\n    多源交叉出现的公司（可信度更高）：');
for (const c of companies.filter((x) => x.sourceCount >= 2).slice(0, 25)) {
  console.log('      ' + c.name.padEnd(38) + c.sourceCount + ' 个源  [' + c.sources.join(', ') + ']');
}
console.log('\n    项目名样例：');
for (const p of projectList.slice(0, 20)) console.log('      ' + p.name.padEnd(34) + '[' + p.sources.join(', ') + ']');

writeFileSync(join(OUT, 'global-mining-extract.json'), JSON.stringify({
  generated: new Date().toISOString(),
  sources: all.map((x) => ({ key: x.key, name: x.name, url: x.url, bytes: x.bytes })),
  discipline: '只提取页面原文出现的公司名与项目名；记录来源；不做推断；多源交叉出现的可信度更高',
  companies,
  projects: projectList,
}, null, 2), 'utf8');
console.log('\n  ✅ global-mining-extract.json（' + companies.length + ' 家 · ' + projectList.length + ' 个项目）\n');
