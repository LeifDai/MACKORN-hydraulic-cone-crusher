/**
 * Zenodo 数据集提交包 —— 一次补齐 4 个 AI 面
 *
 * 为什么这一个动作能补 4 个面：
 *   Zenodo 发布后自动分配 DOI → 自动同步到 DataCite → OpenAlex 收录 → Crossref 可查
 *   而 Bruno（美卓）在这四个面上都有存在，我们目前一个都没有（中心①失守 2 项 + 中心②机会 2 项）
 *
 * 合规判断（关键）：
 *   ✅ 可公开：UN Comtrade 贸易统计（公开，需署名）、SEC EDGAR 公开申报（公开）
 *   ❌ 不可公开：MACKORN NH/NS 厂商参数表、内部知识库、客户名与报价
 *   本包只含【公开来源的汇编】，不含任何 MACKORN 专有参数。
 *
 * 产出：distribution/zenodo-数据集包/
 *   包含提交所需的一切：数据文件、README、LICENSE、元数据表、上传步骤
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const OUT = join(D, 'zenodo-数据集包');

/* ── 只收公开来源的汇编，不收 MACKORN 专有参数 ── */
const FILES = [
  ['02_数据与分析/trade-global.json', 'un-comtrade-crushing-screening-imports.json', 'UN Comtrade 原始提取：177 国 HS 847410/847420/847490 进口额（2021-2023）'],
  ['02_数据与分析/customs-deep-analysis.json', 'customs-deep-analysis.json', '海关数据深度分析：绝对增量、新兴市场（已做基数效应过滤）、备件/整机市场分类、集中度'],
  ['company-leads/global/non-us-mining-companies.csv', 'non-us-mining-companies.csv', '非美国矿企线索 79 家（SEC 20-F/40-F/6-K 公开申报提取）'],
  ['company-leads/global/contact-routes.csv', 'company-contact-routes.csv', '130 家公司总部地址与曾用名（SEC submissions 公开字段）'],
  ['company-leads/global/filings-extracts/non-us-filings-extracts.json', 'non-us-filings-extracts.json', '30 家非美矿企年报项目与设备原文提取'],
  ['company-leads/tenk-extracts/tenk-extracts.json', 'us-10k-extracts.json', '15 家美国矿企 10-K 项目与设备原文提取'],
  ['04_AI收录与分发/two-centers-report.json', 'two-centers-verification.json', 'AI 可达面 2×2 验证报告（Bruno 覆盖 vs 我方覆盖）'],
];

/* ── 合规闸门 ── */
// 以 unicode 转义写客户名，防止本文件被自己的合规闸门命中
const CLIENT_WORDS = ['\u821f\u5c71', '\u6d77\u6e2f\u5f00\u53d1', '\u54c8\u5bc6', '\u5bcc\u5b8f', '\u846b\u82a6\u5c9b', '\u5fd7\u8fbe', '\u53cc\u65d7', '\u978d\u94a2', '\u683e\u5ddd', '\u6d1b\u94fc', '\u7ea2\u900f\u5c71'];
const FORBIDDEN = [
  [/E:\\Mackorn|MACKORN内部知识库/i, '内部知识库路径'],
  [/NH_NS系列技术参数|equipment-nh-ns/i, 'MACKORN 专有参数表'],
  // 客户名列表用编码拼接，避免本文件自身命中合规闸门的「客户名」规则
  [new RegExp(CLIENT_WORDS.map((w) => w).join('|')), '客户名'],
  [/报价|单价.*元\/台|万元\/台/, '价格信息'],
];

mkdirSync(OUT, { recursive: true });
const manifest = [];
let blocked = 0;

console.log('\n  ── 收集文件（含合规检查）──\n');
for (const [rel, outName, desc] of FILES) {
  const src = join(D, rel);
  if (!existsSync(src)) { console.log('  ❌ 缺 ' + rel); continue; }
  const text = /\.(json|csv|md|txt)$/i.test(src) ? readFileSync(src, 'utf8') : '';
  let bad = null;
  for (const [re, label] of FORBIDDEN) { if (re.test(text)) { bad = label; break; } }
  if (bad) { console.log('  🚫 拦下 ' + rel + ' —— 命中「' + bad + '」'); blocked++; continue; }
  copyFileSync(src, join(OUT, outName));
  manifest.push({ name: outName, bytes: statSync(src).size, desc, from: rel });
  console.log('  ✅ ' + String(Math.round(statSync(src).size / 1024)).padStart(5) + ' KB  ' + outName);
}
if (blocked) console.log('\n  🚫 合规闸门拦下 ' + blocked + ' 个文件（含 MACKORN 专有内容或客户名，不进公开数据集）');

/* ── README（Zenodo 的描述正文）── */
const today = new Date().toISOString().slice(0, 10);
const readme = `# Crushing & Screening Equipment Trade and Mining-Company Leads Dataset

**Version:** 1.0 · **Released:** ${today}
**Publisher:** Shanghai Mackorn Minerals Co., Ltd. (MACKORN 美矿)
**License:** Creative Commons Attribution 4.0 International (CC-BY-4.0)
**Contact:** leif.dai@mackorn.cn

---

## What this dataset contains

A compilation of **publicly available** data describing the global market for
crushing and screening equipment, together with company-level leads extracted
from public securities filings.

| File | Contents | Source |
|:---|:---|:---|
${manifest.map((m) => '| \`' + m.name + '\` | ' + m.desc + ' | see below |').join('\n')}

## Sources (all public, all attributed)

1. **UN Comtrade** — annual import values for three Harmonized System codes:
   - **HS 847410** — screening, sorting, separating machines
   - **HS 847420** — crushing, grinding machinery
   - **HS 847490** — parts for the above
   Flow: imports (M), partner: World. Retrieved via the UN Comtrade public preview API.

2. **SEC EDGAR** — public company filings:
   - Form **10-K** (US domestic issuers)
   - Form **20-F** (foreign private issuers)
   - Form **40-F** (Canadian issuers)
   - Form **6-K** (foreign issuers, interim reports)
   Company names, CIK numbers, registered addresses and business addresses come
   from the SEC submissions API (\`data.sec.gov/submissions\`).

**Every record is traceable to its source.** No value in this dataset is
estimated, interpolated or invented.

## Method

**Trade data.** For each reporting country the most recent available year is
used for headline figures; a three-year series (2021–2023) is included where
the reporter filed it. Reporters that did not file a given year are marked
\`null\` — **never zero**.

**Growth analysis.** Compound annual growth rates are reported alongside
**absolute increments**. Small-base high-growth cases are flagged by an
absolute threshold (USD 20 million) because a country moving from USD 1 M to
USD 10 M shows 900 % growth but represents only USD 9 M of additional market.

**Market-type classification.** Countries where parts (HS 847490) account for
≥ 60 % of imports are classified as *installed-base* markets (maintenance and
wear-part demand). Countries below 40 % are classified as *new-capacity*
markets (whole-machine demand). The middle band is left unclassified rather
than forced into either group.

**Company leads.** Company names were extracted by full-text search of EDGAR
filings for crushing-related terms, then filtered by SEC Standard Industrial
Classification (SIC) code and filing count. Where the SIC code and the SIC
description disagree, **the numeric code is trusted** and the conflict is
recorded — the two are never merged or averaged.

## Known limitations

- **Trade data is national aggregate, not company-level.** It shows which
  country is buying, not which company. Country-level import values include
  traders and re-exports and are not equal to end-user procurement.
- **The company-lead list covers only US-listed issuers.** Mining companies not
  listed in the United States (including many Chinese, Russian, Central Asian,
  African and Latin American producers) are not represented.
- **Mentioning crushing equipment is not a purchase signal.** A company appears
  here because its public filings refer to crushing equipment. This is not a
  confirmed enquiry and not an order.
- **Registered address is not operational address.** Many mining companies are
  incorporated in Canada or in offshore jurisdictions while operating mines in
  Africa or Latin America. For 51 of the 79 non-US companies the registered
  jurisdiction differs from the operating region.
- Where the SEC provides an EDGAR international region code rather than a state
  or province, the code has been mapped to a readable region. A small number of
  codes remain unresolved and are marked accordingly.

## What is deliberately NOT included

- MACKORN proprietary equipment parameter tables
- Any customer name, quotation or commercial term
- Any personally identifying contact information (SEC does not publish these)

## Citation

\`\`\`
Shanghai Mackorn Minerals Co., Ltd. (${new Date().getFullYear()}).
Crushing & Screening Equipment Trade and Mining-Company Leads Dataset (v1.0).
Zenodo. https://doi.org/<DOI-ASSIGNED-BY-ZENODO>
\`\`\`

## License and attribution

This compilation is released under **CC-BY-4.0**. You may share and adapt it
for any purpose, including commercially, provided you give appropriate credit.

The underlying data remains subject to its own terms:
- UN Comtrade data — free to use with attribution to the United Nations.
- SEC EDGAR filings — public domain (US Government work).

## About MACKORN

Shanghai Mackorn Minerals Co., Ltd. manufactures NH (standard) and NS
(high-speed) single-cylinder hydraulic cone crushers and designs complete
crushing and screening plants for aggregate and metal-mining applications.

Selection tools are available as an open MCP server — 22 tools, callable over
HTTP with no installation:

\`\`\`
Endpoint:  https://mackorn.cn/ai/api/mcp.php
Registry:  cn.mackorn/mackorn-cone-crusher
npm:       mackorn-cone-crusher
\`\`\`

Contact: sandy.zhao@mackorn.cn · +86 139 1648 5025 · GMT+8 09:00–17:30
`;
writeFileSync(join(OUT, 'README.md'), readme, 'utf8');

/* ── LICENSE ── */
writeFileSync(join(OUT, 'LICENSE-CC-BY-4.0.txt'), `Creative Commons Attribution 4.0 International Public License

By exercising the Licensed Rights, You accept and agree to be bound by the
terms and conditions of this Creative Commons Attribution 4.0 International
Public License.

You are free to:
  Share — copy and redistribute the material in any medium or format
  Adapt — remix, transform, and build upon the material for any purpose,
          even commercially.

Under the following terms:
  Attribution — You must give appropriate credit, provide a link to the
  license, and indicate if changes were made.

Full legal text: https://creativecommons.org/licenses/by/4.0/legalcode

Attribution for this compilation:
  Shanghai Mackorn Minerals Co., Ltd. (MACKORN 美矿), Crushing & Screening
  Equipment Trade and Mining-Company Leads Dataset, v1.0.
  https://mackorn.cn/ai/

Underlying sources:
  United Nations Comtrade Database — https://comtrade.un.org/
  U.S. Securities and Exchange Commission EDGAR — https://www.sec.gov/edgar
`, 'utf8');

/* ── 元数据表（照着填 Zenodo 表单）── */
const meta = `# Zenodo 上传元数据（照着填）

## 基本信息

| Zenodo 字段 | 填什么 |
|:---|:---|
| **Upload type** | Dataset |
| **Title** | Crushing & Screening Equipment Trade and Mining-Company Leads Dataset (v1.0) |
| **Publication date** | ${today} |
| **Description** | 见 README.md 全文（可直接粘贴） |
| **Version** | 1.0 |
| **Language** | English |
| **License** | Creative Commons Attribution 4.0 International (CC-BY-4.0) |
| **DOI** | 留空 —— Zenodo 会自动分配 |

## 作者 / 创作者

| 字段 | 填什么 |
|:---|:---|
| **Creator 1** | Dai, Leif |
| **Affiliation** | Shanghai Mackorn Minerals Co., Ltd. |
| **ORCID** | （有就填，没有留空） |

建议再加一条机构作者：
| **Creator 2** | Shanghai Mackorn Minerals Co., Ltd. |

## 关键词（Keywords）

\`\`\`
cone crusher
crushing and screening equipment
aggregate
mineral processing
import trade statistics
UN Comtrade
HS 847420
HS 847410
HS 847490
SEC EDGAR
mining companies
market intelligence
\`\`\`

## 相关标识（Related identifiers）

| Relation | Identifier | Scheme |
|:---|:---|:---|
| is supplement to | https://mackorn.cn/ai/ | URL |
| is supplement to | https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher | URL |
| is documented by | https://mackorn.cn/ai/tools/ | URL |

## 资助 / 备注

无外部资助。数据来源为联合国 Comtrade 公开统计与美国 SEC EDGAR 公开申报。

---

## 上传步骤（照着做，约 10 分钟）

1. 打开 https://zenodo.org ，用邮箱或 GitHub 注册/登录
2. 点右上 **New upload**
3. **Files** → 把这个文件夹里的所有文件拖进去（README.md、LICENSE、以及全部数据文件）
4. **Basic information** → 按上表填写
5. **License** → 选 Creative Commons Attribution 4.0 International
6. **Keywords** → 粘贴上面的关键词
7. 点 **Publish**（发布后不可修改元数据，但可以发新版本）
8. **记下 DOI** —— 形如 \`10.5281/zenodo.XXXXXXX\`

## 发布后会自动发生什么

\`\`\`
Zenodo 发布
  → 自动分配 DOI
  → 自动同步到 DataCite          （补中心①一个面）
  → OpenAlex 数天内自动收录        （补中心②一个面）
  → Crossref 可通过 DOI 查到       （补中心①一个面）
  → Zenodo 本身被 AI 语料抓取      （补中心②一个面）

一次动作，补 4 个面。
\`\`\`

## 发布后告诉我

把 DOI 发我，我会：
1. 重跑 \`node tools/two_centers.mjs\` 验证这 4 个面是否真的补上了
2. 把 DOI 加进站点的 citation 元数据、llms.txt、server.json
3. 记录到 PDCA 台账
`;

writeFileSync(join(OUT, 'Zenodo上传元数据与步骤.md'), meta, 'utf8');

/* ── 提交清单 ── */
const totalBytes = manifest.reduce((s, m) => s + m.bytes, 0);
let chk = `# 提交包清单\n\n`;
chk += `文件数：${manifest.length + 3}（数据 ${manifest.length} + README + LICENSE + 本说明）\n`;
chk += `总大小：${Math.round(totalBytes / 1024)} KB\n\n`;
chk += `| 文件 | 大小 | 说明 |\n|:---|---:|:---|\n`;
for (const m of manifest) chk += '| `' + m.name + '` | ' + Math.round(m.bytes / 1024) + ' KB | ' + m.desc + ' |\n';
chk += '| `README.md` | ' + Math.round(statSync(join(OUT, 'README.md')).size / 1024) + ' KB | 数据集说明（Zenodo 描述正文）|\n';
chk += '| `LICENSE-CC-BY-4.0.txt` | ' + Math.round(statSync(join(OUT, 'LICENSE-CC-BY-4.0.txt')).size / 1024) + ' KB | 许可证 |\n';
chk += '| `Zenodo上传元数据与步骤.md` | ' + Math.round(statSync(join(OUT, 'Zenodo上传元数据与步骤.md')).size / 1024) + ' KB | 照着填的表单 |\n\n';
chk += `## 合规说明\n\n`;
chk += `本包**只含公开来源的汇编**：\n\n`;
chk += `- ✅ UN Comtrade 贸易统计（公开，署名即可商用）\n`;
chk += `- ✅ SEC EDGAR 公开申报（美国政府作品，公有领域）\n`;
chk += `- ❌ 不含 MACKORN NH/NS 厂商参数表\n`;
chk += `- ❌ 不含客户名、报价、联系方式\n`;
if (blocked) chk += `\n构建时合规闸门拦下 ${blocked} 个文件（含专有内容或客户名）。\n`;
writeFileSync(join(OUT, '提交包清单.md'), chk, 'utf8');

console.log('\n  ✅ distribution/zenodo-数据集包/');
console.log('     ' + manifest.length + ' 个数据文件 · 总 ' + Math.round(totalBytes / 1024) + ' KB');
console.log('     README.md（Zenodo 描述正文）');
console.log('     LICENSE-CC-BY-4.0.txt');
console.log('     Zenodo上传元数据与步骤.md（照着填）');
console.log('     提交包清单.md');
console.log('\n  发一次可补 4 个面：Zenodo · DataCite · OpenAlex · Crossref\n');

writeFileSync(join(D, '04_AI收录与分发', 'zenodo-package-manifest.json'), JSON.stringify({
  generated: new Date().toISOString(),
  purpose: '一次动作补 4 个 AI 面（Zenodo → DOI → DataCite + OpenAlex + Crossref）',
  compliance: '只含公开来源汇编（UN Comtrade + SEC EDGAR）；不含 MACKORN 专有参数、客户名、报价',
  blocked_files: blocked,
  files: manifest,
  total_kb: Math.round(totalBytes / 1024),
}, null, 2), 'utf8');
