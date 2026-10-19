/**
 * 从重点客户的 SEC 10-K 提取【项目名 + capex 金额 + 设备线索】
 *
 * 用户要的：「有哪些案例，有数据，有客户名称」
 *   - 公司名：已有（51 家合格线索）
 *   - 案例/项目：从 10-K 正文提取矿山项目名
 *   - 数据：capex 金额、产能、品位
 *
 * 数据源：SEC EDGAR 全文（完全公开，可逐条核查）
 * 纪律：只提取原文出现的数字与项目名，不做推断；每个数字带上下文与来源链接。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const P = join(ROOT, 'distribution', 'company-leads');
const OUT = join(P, 'tenk-extracts');
mkdirSync(OUT, { recursive: true });

const raw = JSON.parse(readFileSync(join(P, 'sec-edgar-raw.json'), 'utf8'));
// 取 A-重点 里文件数最多的前 15 家
const target = raw.companies
  .filter((c) => c.lead_grade === 'A-重点' && c.cik)
  .sort((a, b) => (b.filingCount || 0) - (a.filingCount || 0))
  .slice(0, 15);

console.log('\n  目标公司 ' + target.length + ' 家（A-重点，按年报命中数排序）\n');

const H = { 'User-Agent': 'MACKORN Research leif.dai@mackorn.cn', 'Accept': 'application/json' };
async function get(url, json = true) {
  for (let i = 1; i <= 3; i++) {
    const c = new AbortController(); const id = setTimeout(() => c.abort(), 30000);
    try {
      const r = await fetch(url, { headers: H, signal: c.signal });
      clearTimeout(id);
      if (!r.ok) { if (i === 3) return null; await new Promise((s) => setTimeout(s, 700 * i)); continue; }
      return json ? await r.json() : await r.text();
    } catch { clearTimeout(id); if (i === 3) return null; await new Promise((s) => setTimeout(s, 700 * i)); }
  }
  return null;
}

/* 提取模式（只抓原文明确出现的） */
const PATTERNS = [
  { key: 'projects', re: /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s+(?:Project|Mine|Operation|Complex|Deposit|Property)\b/g, label: '项目/矿山名' },
  { key: 'capex', re: /(?:capital expenditure|capital expenditures|capex)[^.]{0,160}?\$?\s?([0-9][0-9,.]*)\s*(million|billion)/gi, label: '资本支出' },
  { key: 'throughput', re: /([0-9][0-9,.]*)\s*(?:tonnes?|tons?)\s+per\s+(?:day|annum|year)/gi, label: '处理量' },
  { key: 'crusher', re: /([^.]{0,140}(?:cone crusher|jaw crusher|gyratory crusher|crushing circuit|crushing plant|comminution|vibrating screen)[^.]{0,140})/gi, label: '破碎设备原文句' },
];

const results = [];
for (const co of target) {
  const cik10 = String(co.cik).padStart(10, '0');
  process.stdout.write('  ' + String(co.company).replace(/\s*\(CIK.*$/, '').slice(0, 34).padEnd(36));
  const sub = await get('https://data.sec.gov/submissions/CIK' + cik10 + '.json');
  if (!sub || !sub.filings || !sub.filings.recent) { console.log('❌ 取不到申报'); continue; }

  const rec = sub.filings.recent;
  const forms = rec.form || [];
  // 找最近的 10-K
  let idx = -1;
  for (let i = 0; i < forms.length; i++) if (forms[i] === '10-K') { idx = i; break; }
  if (idx < 0) { console.log('○ 近期无 10-K'); continue; }

  const acc = String(rec.accessionNumber[idx]).replace(/-/g, '');
  const doc = rec.primaryDocument[idx];
  const filed = rec.filingDate[idx];
  const url = 'https://www.sec.gov/Archives/edgar/data/' + Number(co.cik) + '/' + acc + '/' + doc;

  const html = await get(url, false);
  if (!html) { console.log('❌ 正文取不到'); continue; }

  // 去 HTML 标签，压空白
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;/g, "'").replace(/&#8220;|&#8221;/g, '"')
    .replace(/\s+/g, ' ');

  const found = {};
  for (const p of PATTERNS) {
    const set = new Set();
    let m;
    const re = new RegExp(p.re.source, p.re.flags);
    while ((m = re.exec(text)) !== null) {
      const v = (m[1] || m[0]).trim().replace(/\s+/g, ' ');
      if (v.length >= 3 && v.length <= 200) set.add(v);
      if (set.size >= 40) break;
    }
    found[p.key] = [...set];
  }

  const rec2 = {
    company: co.company.replace(/\s*\(CIK.*$/, ''),
    cik: cik10,
    sic: co.sic, sic_desc: co.sic_desc,
    industry: co.industry_final,
    lead_grade: co.lead_grade,
    filing: { form: '10-K', filed, url, accession: rec.accessionNumber[idx] },
    text_chars: text.length,
    projects: found.projects.slice(0, 30),
    capex_mentions: found.capex.slice(0, 20),
    throughput_mentions: found.throughput.slice(0, 20),
    crusher_quotes: found.crusher.slice(0, 12),
  };
  results.push(rec2);
  console.log('✅ ' + (text.length / 1024).toFixed(0) + 'KB  项目 ' + rec2.projects.length + ' · capex ' + rec2.capex_mentions.length + ' · 设备句 ' + rec2.crusher_quotes.length);
  await new Promise((s) => setTimeout(s, 200));
}

writeFileSync(join(OUT, 'tenk-extracts.json'), JSON.stringify({
  generated: new Date().toISOString(),
  source: 'SEC EDGAR 10-K 正文（公开，可逐条核查）',
  discipline: '只提取原文出现的项目名与数字；不做推断；每条带来源 URL',
  companies: results,
}, null, 2), 'utf8');

/* ── 汇总报告 ── */
let md = '# 重点客户 10-K 项目与设备线索提取\n\n';
md += '> 数据源：SEC EDGAR 10-K 年报正文（完全公开，可逐条核查）\n';
md += '> 纪律：只提取原文出现的项目名与数字，不做推断；每条带来源链接\n\n';
md += '生成：' + new Date().toISOString().slice(0, 16).replace('T', ' ') + '\n\n';
md += '共 ' + results.length + ' 家 · 每家附 10-K 原文链接\n\n---\n\n';

for (const r of results) {
  md += '## ' + r.company + '\n\n';
  md += '- 行业：' + r.industry + '（SEC SIC ' + r.sic + ' ' + (r.sic_desc || '') + '）\n';
  md += '- 线索等级：' + r.lead_grade + '\n';
  md += '- 10-K 申报日：' + r.filing.filed + '\n';
  md += '- 原文：[' + r.filing.url + '](' + r.filing.url + ')\n';
  md += '- 正文长度：' + (r.text_chars / 1024).toFixed(0) + ' KB\n\n';
  if (r.projects.length) { md += '**提到的项目/矿山名**（原文）\n\n'; r.projects.slice(0, 15).forEach((p) => { md += '- ' + p + '\n'; }); md += '\n'; }
  if (r.capex_mentions.length) { md += '**资本支出原文**\n\n'; r.capex_mentions.slice(0, 8).forEach((p) => { md += '- ' + p + '\n'; }); md += '\n'; }
  if (r.throughput_mentions.length) { md += '**处理量原文**\n\n'; r.throughput_mentions.slice(0, 6).forEach((p) => { md += '- ' + p + '\n'; }); md += '\n'; }
  if (r.crusher_quotes.length) { md += '**破碎设备相关原文句**（可直接看他们要什么设备）\n\n'; r.crusher_quotes.slice(0, 6).forEach((p) => { md += '> ' + p + '\n\n'; }); }
  md += '---\n\n';
}
writeFileSync(join(OUT, '重点客户10K项目与设备线索.md'), md, 'utf8');

console.log('\n  ✅ tenk-extracts.json');
console.log('  ✅ 重点客户10K项目与设备线索.md（' + (md.length / 1024).toFixed(0) + ' KB）');
console.log('');
