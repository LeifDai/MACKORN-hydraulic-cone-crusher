/**
 * 10-K 项目名噪音过滤 + 交付物整理
 *
 * 提取结果里有噪音（"Peru" "Federal" "The" 这类不是项目名）。
 * 用规则剔除，并给每条打分（可信度）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', 'company-leads', 'tenk-extracts');
const j = JSON.parse(readFileSync(join(OUT, 'tenk-extracts.json'), 'utf8'));

/* 噪音词（这些不是项目名） */
const NOISE = new Set(['the','our','its','their','this','that','these','those','all','any','each','other','such','global','federal','national','state','local','peru','chile','canada','mexico','brazil','usa','united','annual','total','net','cash','capital','material','individual','significant','certain','contents','index','part','item','note','page','table','risk','factor','management','discussion','analysis','financial','statement','condition','results','operation','business','properties','legal','proceeding','mine','safety','health','environment','social','governance','board','director','executive','officer','compensation','principal','accountant','exhibit','signature','consolidated','balance','sheet','income','loss','equity','revenue','cost','expense','asset','liability','preliminary','blasting','metallurgical','practices','act','fdic','sec','company','corporation','inc','ltd','llc','group','holdings','corp']);
const NOISE_RE = /^(the|our|its|their|this|that|these|those|all|any|each|other|such|a|an|in|on|at|by|for|with|from|to|of|and|or|as|is|are|was|were|be|been|has|have|had|will|would|may|might|can|could|should)\b/i;
const SUFFIX_RE = /(Act|Code|Regulation|Policy|Standard|Program|Committee|Board|Commission|Agency|Department|Administration|Association|Institute|Society|Council|Fund|Trust|Plan|Agreement|Contract|Report|Study|Review|Analysis|Statement|Index|Contents|Table|Note|Item|Part|Section|Exhibit)$/;
/* 前缀噪音：10-K 里 "Contents Xxx" / "Requirements The Xxx" 这类是目录残留，不是项目名 */
/* 地理与法规词：单独出现或与法规词组合的都不是项目名 */
const GEO_NOISE = /^(Peru|Chile|Canada|Mexico|Brazil|USA|United States|Australia|Ghana|Quebec|Nevada|Alaska|Arizona|Colorado|Ontario|Yukon|Colombia|Argentina|Ecuador|Indonesia|Philippines|Mongolia|Zambia|Congo|Mali|Burkina|Suriname|Guyana|Tanzania|Namibia|Botswana|Zimbabwe|Kazakhstan|Turkey|Spain|Portugal|Finland|Sweden|Norway)\b/i;
const LEGAL_NOISE = /(MSHA|FDIC|SEC|IRS|EPA|OSHA|GAAP|IFRS|Act|Loan|Assistance|Technical|Compliance|Disclosure|Filing|Regulation)/i;
const PREFIX_NOISE = /^(Contents|Requirements|History|Facilities|Notes?|Summary|Overview|Description|Introduction|Background|Properties|Operations?|Item|Part|Section|Table|Exhibit|Appendix|Attachment|Schedule|List|Index)\b/i;

/* 幂等：重复运行时 c.projects 可能已是 {name, confidence} 对象数组 */
function score(p) {
  if (p && typeof p === 'object') p = p.name || '';
  if (typeof p !== 'string') return -1;
  const words = p.split(/\s+/);
  // 明显噪音
  if (words.length > 4) return -1;
  if (NOISE.has(p.toLowerCase())) return -1;
  if (NOISE_RE.test(p)) return -1;
  if (PREFIX_NOISE.test(p)) return -1;
  if (GEO_NOISE.test(p)) return -1;
  if (LEGAL_NOISE.test(p) && p.split(/\s+/).length <= 4) return -1;
  if (SUFFIX_RE.test(p) && words.length <= 3) return -1;
  if (/^(Peru|Chile|Canada|Mexico|Brazil|USA|United States|Australia|Ghana|Quebec|Nevada|Alaska|Arizona|Colorado|Ontario|Yukon|Colombia|Argentina|Ecuador|Indonesia|Philippines|Mongolia|Zambia|Congo|Mali|Burkina)\b/i.test(p) && words.length === 1) return -1;
  // 打分
  let s = 50;
  if (words.length >= 2) s += 20;
  if (words.length >= 3) s += 10;
  if (/(Project|Mine|Operation|Complex|Deposit|Property|Lithium|Gold|Copper|Silver|Zinc|Nickel|Iron|Potash|Coal|Sand|Lime)/i.test(p)) s += 20;
  return Math.min(100, s);
}

let kept = 0, dropped = 0;
const cleaned = [];
for (const c of j.companies) {
  const projects = c.projects
    .map((p) => ({ name: (p && typeof p === 'object') ? (p.name || '') : p, confidence: score(p) }))
    .filter((x) => x.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
  dropped += c.projects.length - projects.length;
  kept += projects.length;
  cleaned.push({ ...c, projects: projects.slice(0, 20), projects_dropped: c.projects.length - projects.length });
}

j.companies = cleaned;
j.filter_note = '项目名经噪音过滤（剔除 The/Peru/Federal 这类非项目名与法规条款名），confidences 为启发式打分，仅供排序，仍须人工确认。';
writeFileSync(join(OUT, 'tenk-extracts.json'), JSON.stringify(j, null, 2), 'utf8');

console.log('\n  项目名：保留 ' + kept + ' · 剔除噪音 ' + dropped);
console.log('');
for (const c of cleaned.slice(0, 6)) {
  console.log('  ── ' + c.company.replace(/\s*\(CIK.*$/, '') + ' ──');
  c.projects.slice(0, 7).forEach((p) => console.log('    ' + String(p.confidence).padStart(3) + '  ' + p.name));
  console.log('');
}

/* ── 重写 Markdown ── */
let md = '# 重点客户 10-K 项目与设备线索（已过滤噪音）\n\n';
md += '> **数据源**：SEC EDGAR 10-K 年报正文 —— 完全公开，可逐条核查\n';
md += '> **纪律**：只提取原文出现的项目名与数字，不做推断；每条附原文链接\n';
md += '> **用途**：销售开发信、投标资格预审、客户画像、给 AI 做"这家公司在建什么"的素材\n\n';
md += '生成：' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' · 共 ' + cleaned.length + ' 家\n\n---\n\n';

for (const c of cleaned) {
  md += '## ' + c.company.replace(/\s*\(CIK.*$/, '') + '\n\n';
  md += '| 项 | 值 |\n|:---|:---|\n';
  md += '| 行业 | ' + c.industry + '（SEC SIC ' + c.sic + ' ' + (c.sic_desc || '') + '） |\n';
  md += '| 线索等级 | ' + c.lead_grade + ' |\n';
  md += '| 10-K 申报日 | ' + c.filing.filed + ' |\n';
  md += '| 正文长度 | ' + (c.text_chars / 1024).toFixed(0) + ' KB |\n';
  md += '| 原文 | [' + c.filing.url + '](' + c.filing.url + ') |\n\n';
  if (c.projects.length) {
    md += '**在建/在营项目**（括号内为提取可信度，仅供排序，须人工确认）\n\n';
    c.projects.forEach((p) => { md += '- ' + p.name + '　`' + p.confidence + '`\n'; });
    md += '\n';
  }
  if (c.capex_mentions.length) { md += '**资本支出原文**\n\n'; c.capex_mentions.forEach((p) => { md += '- ' + p + '\n'; }); md += '\n'; }
  if (c.throughput_mentions.length) { md += '**处理量原文**\n\n'; c.throughput_mentions.slice(0, 6).forEach((p) => { md += '- ' + p + '\n'; }); md += '\n'; }
  if (c.crusher_quotes.length) {
    md += '**破碎设备相关原文**（可直接判断他们在用什么、在建什么）\n\n';
    c.crusher_quotes.slice(0, 6).forEach((p) => { md += '> ' + p.trim() + '\n\n'; });
  }
  md += '---\n\n';
}
md += '\n## 数据纪律与局限\n\n';
md += '1. **只提原文**：所有项目名与数字均来自 10-K 正文，未做任何推断或补全。\n';
md += '2. **可信度是启发式**：`confidences` 仅为排序用，不构成确认；正式使用前须回原文核对。\n';
md += '3. **覆盖范围**：仅美国上市公司。中国、俄罗斯、中亚、非洲、拉美的矿企不在 SEC 体系内。\n';
md += '4. **"提到"≠"采购"**：这些是【有破碎设备需求的公司】，不是【已确认订单】。\n';
md += '5. **不做的事**：不编造联系人姓名与邮箱；不把"提到 crusher"说成"正在采购"。\n';
writeFileSync(join(OUT, '重点客户10K项目与设备线索.md'), md, 'utf8');
console.log('  ✅ 重点客户10K项目与设备线索.md（' + (md.length / 1024).toFixed(0) + ' KB）\n');
