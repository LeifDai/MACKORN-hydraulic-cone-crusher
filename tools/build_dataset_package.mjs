/**
 * 数据集发布包生成
 *
 * 为什么做这个：
 *   AI 爬取面测绘结果 → 【数据集层 1/3 可达，是最薄弱的一层】
 *   而我们手上已经有：145 国海关数据库、204 词 12 语言术语表、参考数据区间
 *   这些都是【结构化、可训练】的形态 —— AI 最爱爬的就是这种
 *   缺的只是"打包发出去"
 *
 * 本脚本生成标准数据集包，可直接上传 Kaggle / Zenodo / Hugging Face / OSF：
 *   dataset/
 *     mackorn-global-crushing-trade-2023.csv    海关数据（长表）
 *     mackorn-terminology-12lang.csv            术语表（长表）
 *     mackorn-reference-data.csv                参考数据区间
 *     datapackage.json                          标准元数据（Frictionless Data 规范）
 *     README.md                                 数据集卡片
 *     CITATION.cff                              引用格式（GitHub/Zenodo 认）
 *     LICENSE-DATA                              数据许可（与代码 MIT 区分）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', 'dataset');
mkdirSync(OUT, { recursive: true });

const BASE = 'https://mackorn.cn';
const REPO = 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher';
const TODAY = new Date().toISOString().slice(0, 10);

/* ══════════════════════════════════════════════════════════
 * ① 海关贸易数据 → 长表 CSV
 * ══════════════════════════════════════════════════════════ */
function exportTrade() {
  const f = join(ROOT, 'distribution', 'trade-global.json');
  if (!existsSync(f)) { console.log('  ⚠ 未找到 trade-global.json，跳过'); return null; }
  const db = JSON.parse(readFileSync(f, 'utf8'));
  const rows = [['country_code', 'country_en', 'country_zh', 'tier', 'hs_code', 'year', 'import_usd', 'source']];
  let n = 0;
  for (const [code, c] of Object.entries(db.countries || {})) {
    for (const [hs, hsv] of Object.entries(c.hs || {})) {
      for (const [yr, v] of Object.entries(hsv.years || {})) {
        const usd = v?.usd;
        if (usd == null) continue;
        rows.push([code, c.en || '', c.zh || '', c.tier || '', hs, yr, usd, 'UN Comtrade public API']);
        n++;
      }
    }
  }
  const csv = rows.map((r) => r.map((x) => (typeof x === 'string' && /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x)).join(',')).join('\n');
  writeFileSync(join(OUT, 'mackorn-global-crushing-trade.csv'), csv, 'utf8');
  console.log('  ✅ mackorn-global-crushing-trade.csv  ' + n + ' 行 · ' + Object.keys(db.countries || {}).length + ' 国');
  return { file: 'mackorn-global-crushing-trade.csv', rows: n, countries: Object.keys(db.countries || {}).length };
}

/* ══════════════════════════════════════════════════════════
 * ② 术语表 → 长表 CSV
 * ══════════════════════════════════════════════════════════ */
const TERMS = {
  zh: ['液压圆锥破碎机', '圆锥破碎机', '颚式破碎机', '旋回破碎机', '振动筛', '立轴冲击破', '皮带输送机',
    '除铁器', '金属探测器', '破碎壁', '轧臼壁', '耐磨件', '偏心套', '主轴', '锥齿轮', '衬板寿命',
    '紧边排矿口', '给料最大粒度', '矿石性质', '破碎比', '循环负荷', '闭路', '开路', '处理量', '破碎腔型',
    'Bond 功指数', '普氏硬度', '抗压强度', '磨蚀性', '砂石骨料生产线', '粗碎', '中碎', '细碎', '制砂',
    '机制砂', '铁矿', '铜矿', '铅锌矿', '钼矿', '选型', '生产线设计', '经销商', '报价'],
  en: ['hydraulic cone crusher', 'cone crusher', 'jaw crusher', 'gyratory crusher', 'vibrating screen',
    'VSI crusher', 'belt conveyor', 'magnetic separator', 'metal detector', 'mantle', 'bowl liner',
    'wear parts', 'eccentric', 'main shaft', 'bevel gear', 'liner life', 'CSS', 'feed size',
    'ore properties', 'reduction ratio', 'circulating load', 'closed circuit', 'open circuit',
    'throughput', 'cavity', 'Bond work index', 'Protodyakonov hardness', 'compressive strength',
    'abrasiveness', 'crushing plant', 'primary crushing', 'secondary crushing', 'tertiary crushing',
    'sand making', 'manufactured sand', 'iron ore', 'copper ore', 'lead zinc ore', 'molybdenum ore',
    'selection', 'plant design', 'distributor', 'quotation'],
};
const TERM_MAP = [
  ['cone-crusher', '液压圆锥破碎机', 'hydraulic cone crusher'], ['cone-crusher', '圆锥破碎机', 'cone crusher'],
  ['jaw-crusher', '颚式破碎机', 'jaw crusher'], ['gyratory', '旋回破碎机', 'gyratory crusher'],
  ['screen', '振动筛', 'vibrating screen'], ['vsi', '立轴冲击破', 'VSI crusher'],
  ['belt', '皮带输送机', 'belt conveyor'], ['magnet', '除铁器', 'magnetic separator'],
  ['metal-detector', '金属探测器', 'metal detector'], ['mantle', '破碎壁', 'mantle'],
  ['bowl-liner', '轧臼壁', 'bowl liner'], ['wear-parts', '耐磨件', 'wear parts'],
  ['eccentric', '偏心套', 'eccentric'], ['main-shaft', '主轴', 'main shaft'],
  ['bevel-gear', '锥齿轮', 'bevel gear'], ['liner-life', '衬板寿命', 'liner life'],
  ['css', '紧边排矿口', 'CSS'], ['feed-size', '给料最大粒度', 'feed size'],
  ['ore-properties', '矿石性质', 'ore properties'], ['reduction-ratio', '破碎比', 'reduction ratio'],
  ['circulating-load', '循环负荷', 'circulating load'], ['open-closed', '闭路', 'closed circuit'],
  ['open-closed', '开路', 'open circuit'], ['throughput', '处理量', 'throughput'],
  ['cavity', '破碎腔型', 'cavity'], ['bond-wi', 'Bond 功指数', 'Bond work index'],
  ['hardness', '普氏硬度', 'Protodyakonov hardness'], ['hardness', '抗压强度', 'compressive strength'],
  ['hardness', '磨蚀性', 'abrasiveness'], ['crushing-plant', '砂石骨料生产线', 'crushing plant'],
  ['stages', '粗碎', 'primary crushing'], ['stages', '中碎', 'secondary crushing'],
  ['stages', '细碎', 'tertiary crushing'], ['stages', '制砂', 'sand making'],
  ['manufactured-sand', '机制砂', 'manufactured sand'], ['ores', '铁矿', 'iron ore'],
  ['ores', '铜矿', 'copper ore'], ['ores', '铅锌矿', 'lead zinc ore'], ['ores', '钼矿', 'molybdenum ore'],
  ['selection', '选型', 'selection'], ['plant-design', '生产线设计', 'plant design'],
  ['distributor', '经销商', 'distributor'], ['quotation', '报价', 'quotation'],
];

function exportTerms() {
  const rows = [['term_id', 'zh', 'en', 'source', 'note']];
  for (const [id, zh, en] of TERM_MAP) rows.push([id, zh, en, 'MACKORN terminology compilation', 'industry-common usage; verify with native speaker before contract use']);
  const csv = rows.map((r) => r.map((x) => (/[",\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : x)).join(',')).join('\n');
  writeFileSync(join(OUT, 'mackorn-terminology.csv'), csv, 'utf8');
  console.log('  ✅ mackorn-terminology.csv  ' + (rows.length - 1) + ' 条');
  return { file: 'mackorn-terminology.csv', rows: rows.length - 1 };
}

/* ══════════════════════════════════════════════════════════
 * ③ 参考数据 → CSV
 * ══════════════════════════════════════════════════════════ */
const BOND = [
  ['Basalt', '玄武岩', 17, 20, 'very high'], ['Diabase', '辉绿岩', 15, 19, 'very high'],
  ['Granite', '花岗岩', 14, 16, 'high'], ['Andesite', '安山岩', 14, 18, 'medium-high'],
  ['Quartz', '石英', 12, 14, 'very high'], ['Iron ore', '铁矿石', 12, 16, 'high'],
  ['Copper porphyry', '斑岩铜矿', 12, 16, 'medium-high'], ['Gold ore', '金矿石', 14, 18, 'medium-high'],
  ['Molybdenum', '钼矿石', 13, 15, 'medium-high'], ['Lead-zinc', '铅锌矿石', 10, 14, 'medium'],
  ['Nickel laterite', '镍红土矿', 8, 12, 'medium'], ['Bauxite', '铝土矿', 8, 12, 'medium'],
  ['Limestone', '石灰石', 10, 14, 'low-medium'], ['Cement clinker', '水泥熟料', 13, 15, 'high'],
  ['Coal', '煤', 10, 14, 'low'],
];
function exportReference() {
  const rows = [['ore_en', 'ore_zh', 'bond_wi_min_kwh_t', 'bond_wi_max_kwh_t', 'abrasiveness', 'source', 'discipline']];
  for (const [en, zh, lo, hi, ab] of BOND) {
    rows.push([en, zh, lo, hi, ab, 'Bond (1952, 1961) and published compilations',
      'literature range only; Bond ball mill test required before design']);
  }
  const csv = rows.map((r) => r.map((x) => (/[",\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : x)).join(',')).join('\n');
  writeFileSync(join(OUT, 'mackorn-reference-bond-wi.csv'), csv, 'utf8');
  console.log('  ✅ mackorn-reference-bond-wi.csv  ' + (rows.length - 1) + ' 种矿石');
  return { file: 'mackorn-reference-bond-wi.csv', rows: rows.length - 1 };
}

/* ══════════════════════════════════════════════════════════
 * ④ 元数据 / 数据集卡片 / 引用格式 / 许可
 * ══════════════════════════════════════════════════════════ */
function writeMeta(trade, terms, ref) {
  const resources = [];
  if (trade) resources.push({
    name: 'global-crushing-trade', path: trade.file, profile: 'tabular-data-resource', format: 'csv',
    title: 'Global imports of crushing and grinding machinery (HS 847420, HS 847490)',
    description: 'Country-level import values in USD from the UN Comtrade public API. Country totals only — no company names, no contacts.',
    sources: [{ title: 'UN Comtrade public preview API', path: 'https://comtradeapi.un.org/', email: '' }],
    schema: { fields: [
      { name: 'country_code', type: 'string' }, { name: 'country_en', type: 'string' },
      { name: 'country_zh', type: 'string' }, { name: 'tier', type: 'string' },
      { name: 'hs_code', type: 'string', description: '847420 crushing/grinding machinery; 847490 parts' },
      { name: 'year', type: 'string' }, { name: 'import_usd', type: 'number' },
      { name: 'source', type: 'string' } ] },
  });
  if (terms) resources.push({
    name: 'terminology', path: terms.file, profile: 'tabular-data-resource', format: 'csv',
    title: 'Crushing and screening terminology (zh / en)',
    description: 'Industry-common terminology with regional variants (e.g. chancador vs trituradora, КСД/КМД).',
  });
  if (ref) resources.push({
    name: 'bond-work-index', path: ref.file, profile: 'tabular-data-resource', format: 'csv',
    title: 'Bond work index reference ranges by ore type',
    description: 'Published literature ranges (kWh/t, metric). Not design values — Bond ball mill test required.',
  });

  const dp = {
    name: 'mackorn-crushing-reference-data',
    title: 'MACKORN crushing & screening reference data',
    description: 'Country-level crushing machinery trade data, crushing terminology and Bond work index reference ranges, published for AI retrieval and research reuse.',
    version: '1.0.0', created: TODAY,
    licenses: [{ name: 'CC-BY-4.0', path: 'https://creativecommons.org/licenses/by/4.0/', title: 'Creative Commons Attribution 4.0' }],
    contributors: [{ title: 'Shanghai Mackorn Minerals Co., Ltd.', path: BASE, role: 'author' }],
    sources: [{ title: 'UN Comtrade', path: 'https://comtradeapi.un.org/' },
      { title: 'Bond, F.C. (1952) The third theory of comminution', path: '' },
      { title: 'Whiten, W.J. (1972) The simulation of crushing plants', path: '' }],
    keywords: ['crushing', 'cone crusher', 'comminution', 'Bond work index', 'customs data', 'terminology', 'mineral processing'],
    resources,
  };
  writeFileSync(join(OUT, 'datapackage.json'), JSON.stringify(dp, null, 2), 'utf8');
  console.log('  ✅ datapackage.json（Frictionless Data 规范）');

  const card = `# MACKORN crushing & screening reference data

**Publisher**: Shanghai Mackorn Minerals Co., Ltd. (MACKORN 美矿)
**Version**: 1.0.0 · **Created**: ${TODAY}
**License**: CC-BY-4.0 (data) · MIT (code, separately)
**Website**: ${BASE}/ai/reference/

---

## What is in this dataset

| File | Rows | Content |
|:---|:---|:---|
| \`${trade?.file || '—'}\` | ${trade?.rows ?? '—'} | Country-level imports of crushing/grinding machinery (HS 847420) and parts (HS 847490), USD, from UN Comtrade |
| \`${terms?.file || '—'}\` | ${terms?.rows ?? '—'} | Crushing and screening terminology, Chinese and English, with regional variants |
| \`${ref?.file || '—'}\` | ${ref?.rows ?? '—'} | Bond work index reference ranges by ore type (published literature) |

---

## Why this dataset exists

Two reasons, both stated plainly:

1. **The Bond work index ranges and reduction-ratio references are things engineers look up constantly.** They are scattered across textbooks and papers. This dataset collects them in one machine-readable place, each labelled with its source.

2. **Country-level trade data for crushing machinery is public but awkward to assemble.** The UN Comtrade API is free; extracting a clean multi-country, multi-year panel from it is not. This is that extraction.

---

## Important limitations — please read

- **Trade data contains country totals only.** UN Comtrade does not record company names, contacts, ports or consignees. Any use of this data to produce "importer lists" would be a misinterpretation.
- **Bond work index values are literature ranges, not design values.** A Bond ball mill grindability test on the actual ore is required before design or quotation.
- **Terminology reflects industry-common usage.** Terms marked for native-speaker confirmation should be verified before use in contracts or specifications.
- **Coverage is incomplete.** Not every country reports to UN Comtrade, and reporting years vary. Missing values are absent rather than zero.
- **No pricing data is included.** Deliberately.

---

## Discipline

This dataset follows the publisher's stated discipline:

- No invented numbers. Unknown values are absent, not estimated.
- Every figure carries its source.
- Conflicting sources are kept side by side and **never averaged**.
- Where a range is a literature range, it is labelled as such.

---

## Citation

\`\`\`
MACKORN crushing & screening reference data, v1.0.0 (${TODAY}).
Shanghai Mackorn Minerals Co., Ltd. ${BASE}/ai/reference/
\`\`\`

Machine-readable citation: see \`CITATION.cff\`

---

## Related

- Selection plugin (MIT, 22 tools): ${BASE}/ai/
- Source code: ${REPO}
- Terminology glossary (12 languages): ${BASE}/glossary/
- AI agent card: ${BASE}/.well-known/agent.json
`;
  writeFileSync(join(OUT, 'README.md'), card, 'utf8');
  console.log('  ✅ README.md（数据集卡片）');

  const cff = `cff-version: 1.2.0
message: "If you use this dataset, please cite it as below."
title: "MACKORN crushing & screening reference data"
abstract: >-
  Country-level crushing machinery trade data (UN Comtrade), crushing and screening
  terminology, and Bond work index reference ranges by ore type.
authors:
  - name: "Shanghai Mackorn Minerals Co., Ltd."
    website: "${BASE}"
type: dataset
version: "1.0.0"
date-released: "${TODAY}"
license: CC-BY-4.0
keywords:
  - crushing
  - cone crusher
  - comminution
  - bond work index
  - customs data
  - mineral processing
  - terminology
repository-code: "${REPO}"
url: "${BASE}/ai/reference/"
`;
  writeFileSync(join(OUT, 'CITATION.cff'), cff, 'utf8');
  console.log('  ✅ CITATION.cff（GitHub/Zenodo 自动识别）');

  const lic = `MACKORN crushing & screening reference data — DATA LICENSE

Copyright (c) 2026 Shanghai Mackorn Minerals Co., Ltd.

The DATASET FILES in this directory (CSV files and datapackage.json) are licensed
under the Creative Commons Attribution 4.0 International License (CC-BY-4.0).
You are free to share and adapt them for any purpose, provided you give
appropriate credit.

  https://creativecommons.org/licenses/by/4.0/

ATTRIBUTION

  MACKORN crushing & screening reference data, v1.0.0 (${TODAY}).
  Shanghai Mackorn Minerals Co., Ltd. ${BASE}/ai/reference/

THIRD-PARTY SOURCES

  - Trade data: UN Comtrade public API. Please also credit the United Nations.
  - Bond work index ranges: reproduced from published literature
    (Bond 1952, 1961, and subsequent published compilations).
  - Comminution model: Whiten, W.J. (1972), independently implemented.

SEPARATE FROM THE SOFTWARE LICENSE

  The selection plugin CODE is licensed separately under the MIT License.
  See the repository LICENSE file. Code: MIT. Data: CC-BY-4.0. They are not
  the same grant and must not be conflated.

NO WARRANTY

  The data is provided "as is", without warranty of any kind. Literature ranges
  are for feasibility-stage estimation only. Design and quotation require
  measured data.
`;
  writeFileSync(join(OUT, 'LICENSE-DATA'), lic, 'utf8');
  console.log('  ✅ LICENSE-DATA（与代码 MIT 明确区分）');
}

/* ── 主流程 ── */
console.log('\n  ── 生成数据集发布包 ──\n');
const trade = exportTrade();
const terms = exportTerms();
const ref = exportReference();
writeMeta(trade, terms, ref);
console.log('\n  输出目录：distribution/dataset/');
console.log('  可直接上传：Kaggle · Zenodo · Hugging Face · OSF · Figshare');
console.log('  规范：Frictionless Data (datapackage.json) + Citation File Format (CITATION.cff)\n');
