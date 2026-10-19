/**
 * 从 79 家非美国矿企的 20-F / 40-F 正文提取项目、capex 与设备线索
 *
 * 与 10-K 提取同理，但对象是外国私人发行人 —— 覆盖拉美/非洲/澳洲/欧洲。
 * 数据类型：项目名 · 资本支出 · 处理量 · 破碎设备原文句
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const G = join(ROOT, 'distribution', 'company-leads', 'global');
const OUT = join(G, 'filings-extracts');
mkdirSync(OUT, { recursive: true });

const src = JSON.parse(readFileSync(join(G, 'non-us-mining-companies.json'), 'utf8'));
// 取命中文件数最多的前 30 家
const targets = src.companies.slice().sort((a, b) => b.filingCount - a.filingCount).slice(0, 30);

console.log('\n  目标 ' + targets.length + ' 家（按命中文件数排序）\n');

const H = { 'User-Agent': 'MACKORN Research leif.dai@mackorn.cn', 'Accept': 'application/json' };

async function get(url, json = true, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    const c = new AbortController(); const id = setTimeout(() => c.abort(), 35000);
    try {
      const r = await fetch(url, { headers: H, signal: c.signal });
      clearTimeout(id);
      if (!r.ok) { if (i === tries) return null; await new Promise((s) => setTimeout(s, 600 * i)); continue; }
      return json ? await r.json() : await r.text();
    } catch { clearTimeout(id); if (i === tries) return null; await new Promise((s) => setTimeout(s, 600 * i)); }
  }
  return null;
}

/** 从申报索引里挑最大的 .htm/.txt 文档 —— 40-F 的年报是附件而非主文档 */
async function pickLargestDoc(cik, accession) {
  const idxUrl = 'https://www.sec.gov/Archives/edgar/data/' + Number(cik) + '/' + accession + '/index.json';
  const idx = await get(idxUrl);
  if (!idx || !idx.directory || !idx.directory.item) return null;
  const cands = idx.directory.item
    .filter((x) => /\.(htm|html|txt)$/i.test(x.name) && !/R\d+\.htm$/i.test(x.name))
    .map((x) => ({ name: x.name, size: Number(x.size) || 0 }))
    .sort((a, b) => b.size - a.size);
  return cands.length ? cands[0].name : null;
}

/** 找最近一份年报（20-F 或 40-F） */
function findAnnual(sub) {
  const rec = sub.filings?.recent;
  if (!rec) return null;
  const forms = rec.form || [];
  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === '20-F' || forms[i] === '40-F') {
      return {
        form: forms[i],
        accession: String(rec.accessionNumber[i]).replace(/-/g, ''),
        doc: rec.primaryDocument[i],
        filed: rec.filingDate[i],
      };
    }
  }
  return null;
}

const PATTERNS = [
  { key: 'projects', re: new RegExp('\\b([A-Z][A-Za-z]+(?:\\s+[A-Z][A-Za-z]+){0,3})\\s+(?:Project|Mine|Operation|Complex|Deposit|Property)', 'g') },
  { key: 'capex', re: /(?:capital expenditure|capital expenditures|capex|capital spending)[^.]{0,180}?(?:US\$|\$)\s?([0-9][0-9,.]*)\s*(million|billion)/gi },
  { key: 'throughput', re: /([0-9][0-9,.]*)\s*(?:tonnes?|tons?|ktpa|mtpa|tpd)\b[^.]{0,60}/gi },
  { key: 'crusher', re: /([^.]{0,150}(?:cone crusher|jaw crusher|gyratory crusher|crushing circuit|crushing plant|comminution|vibrating screen|HPGR)[^.]{0,150})/gi },
  { key: 'country', re: /\b(?:in|at|our)\s+((?:Ghana|Mali|Burkina Faso|Tanzania|Namibia|Zimbabwe|Zambia|DRC|Democratic Republic of (?:the )?Congo|South Africa|Chile|Peru|Brazil|Mexico|Argentina|Colombia|Ecuador|Bolivia|Indonesia|Philippines|Mongolia|Kazakhstan|Turkey|Greece|Finland|Australia|Canada))\b/gi },
];

const results = [];
for (const co of targets) {
  const name = String(co.name).replace(/\s*\(.*$/, '').slice(0, 34);
  process.stdout.write('  ' + name.padEnd(36));
  const sub = await get('https://data.sec.gov/submissions/CIK' + co.cik + '.json');
  if (!sub) { console.log('❌ 取不到申报'); continue; }
  const ann = findAnnual(sub);
  if (!ann) { console.log('○ 近期无 20-F/40-F'); continue; }
  // 40-F / 20-F 的年报常是附件，主文档只有封面 → 取申报里最大的文档
  const big = await pickLargestDoc(co.cik, ann.accession);
  const docName = big || ann.doc;
  const url = 'https://www.sec.gov/Archives/edgar/data/' + Number(co.cik) + '/' + ann.accession + '/' + docName;
  const html = await get(url, false);
  if (!html) { console.log('❌ 正文取不到'); continue; }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ');

  const found = {};
  for (const p of PATTERNS) {
    const set = new Set();
    let m; const re = new RegExp(p.re.source, p.re.flags);
    while ((m = re.exec(text)) !== null) {
      const v = (m[0] || '').trim().replace(/\s+/g, ' ');
      if (v.length >= 4 && v.length <= 220) set.add(v);
      if (set.size >= 40) break;
    }
    found[p.key] = [...set];
  }

  results.push({
    company: co.name, cik: co.cik, incorporation_region: co.incorporation_region,
    operating_region: co.operating_region_manual || null,
    filing: { ...ann, doc: docName, url }, text_chars: text.length,
    projects: found.projects.slice(0, 25),
    capex_mentions: found.capex.slice(0, 20),
    throughput_mentions: found.throughput.slice(0, 15),
    crusher_quotes: found.crusher.slice(0, 10),
    countries_mentioned: [...new Set(found.country.map((x) => x.trim()))].slice(0, 20),
  });
  console.log('✅ ' + (text.length / 1024).toFixed(0) + 'KB  项目 ' + found.projects.length
    + ' · capex ' + found.capex.length + ' · 设备句 ' + found.crusher.length
    + ' · 国别 ' + found.country.length);
  await new Promise((s) => setTimeout(s, 200));
}

writeFileSync(join(OUT, 'non-us-filings-extracts.json'), JSON.stringify({
  generated: new Date().toISOString(),
  source: 'SEC EDGAR 20-F（外国私人发行人年报）/ 40-F（加拿大发行人年报）正文',
  discipline: '只提取原文出现的项目名与数字；每条附来源 URL；不做推断',
  companies: results,
}, null, 2), 'utf8');

/* ── 汇总 ── */
let md = '# 非美国矿企 20-F 项目与设备线索\n\n';
md += '> 数据源：SEC EDGAR 20-F / 40-F 年报正文（外国私人发行人，公开可核查）\n';
md += '> 纪律：只提取原文出现的项目名与数字，不做推断\n\n';
md += '生成：' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' · 共 ' + results.length + ' 家\n\n---\n\n';

for (const r of results) {
  md += '## ' + String(r.company).replace(/\s*\(.*$/, '') + '\n\n';
  md += '| 项 | 值 |\n|:---|:---|\n';
  md += '| 注册地区域 | ' + (r.incorporation_region || '') + ' |\n';
  md += '| 运营区域 | ' + (r.operating_region || '（须查正文矿山章节）') + ' |\n';
  md += '| 年报 | ' + r.filing.form + ' · ' + r.filing.filed + ' |\n';
  md += '| 正文长度 | ' + (r.text_chars / 1024).toFixed(0) + ' KB |\n';
  md += '| 原文 | [' + r.filing.url + '](' + r.filing.url + ') |\n\n';
  if (r.countries_mentioned.length) md += '**提到的国家**：' + r.countries_mentioned.join('、') + '\n\n';
  if (r.projects.length) { md += '**项目/矿山名**\n\n'; r.projects.slice(0, 15).forEach((p) => { md += '- ' + p + '\n'; }); md += '\n'; }
  if (r.capex_mentions.length) { md += '**资本支出原文**\n\n'; r.capex_mentions.slice(0, 8).forEach((p) => { md += '- ' + p + '\n'; }); md += '\n'; }
  if (r.throughput_mentions.length) { md += '**处理量原文**\n\n'; r.throughput_mentions.slice(0, 6).forEach((p) => { md += '- ' + p + '\n'; }); md += '\n'; }
  if (r.crusher_quotes.length) { md += '**破碎设备原文句**\n\n'; r.crusher_quotes.slice(0, 6).forEach((p) => { md += '> ' + p + '\n\n'; }); }
  md += '---\n\n';
}
writeFileSync(join(OUT, '非美国矿企20F项目与设备线索.md'), md, 'utf8');

const totalProj = results.reduce((a, r) => a + r.projects.length, 0);
const totalCapex = results.reduce((a, r) => a + r.capex_mentions.length, 0);
const totalCrusher = results.reduce((a, r) => a + r.crusher_quotes.length, 0);
console.log('\n  ── 汇总 ──');
console.log('    公司 ' + results.length + ' 家');
console.log('    项目名 ' + totalProj + ' 个 · capex 原文 ' + totalCapex + ' 条 · 设备句 ' + totalCrusher + ' 条');
console.log('  ✅ non-us-filings-extracts.json');
console.log('  ✅ 非美国矿企20F项目与设备线索.md（' + (md.length / 1024).toFixed(0) + ' KB）\n');
