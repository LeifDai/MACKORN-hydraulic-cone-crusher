/**
 * 生成《全球矿业客户开发报告》—— 把这一晚的成果汇成一份可交付文档
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const CL = join(D, 'company-leads');
const load = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };

const us = load(join(CL, 'sec-edgar-raw.json'), { companies: [] });
const nonus = load(join(CL, 'global', 'non-us-mining-companies.json'), { companies: [] });
const cross = load(join(CL, 'global', 'triple-cross-analysis.json'), {});
const tenk = load(join(CL, 'tenk-extracts', 'tenk-extracts.json'), { companies: [] });
const trade = load(join(D, '02_数据与分析', 'trade-global.json'), { countries: {} });

const usQual = us.companies.filter((c) => c.lead_grade === 'A-重点' || c.lead_grade === 'B-跟进');
const ns = nonus.companies.slice().sort((a, b) => b.filingCount - a.filingCount);

const f = (x) => x == null ? '—' : (x / 1e6).toFixed(1) + ' M$';

let md = '# 全球矿业客户开发报告\n\n';
md += '> **数据源**：UN Comtrade 官方贸易统计 + SEC EDGAR 全文（美国 10-K / 外国 20-F·40-F·6-K）\n';
md += '> **纪律**：只取公开可核查的原始记录；每个结论标来源；不做推断；不编造联系人\n';
md += '生成：' + new Date().toISOString().slice(0, 16).replace('T', ' ') + '\n\n';
md += '---\n\n';

md += '## 一、总览\n\n';
md += '| 维度 | 数量 | 来源 |\n|:---|:---|:---|\n';
md += '| 海关数据覆盖国家 | ' + Object.keys(trade.countries || {}).length + ' 国 | UN Comtrade |\n';
md += '| 美国上市公司线索（合格） | ' + usQual.length + ' 家 | SEC EDGAR 10-K |\n';
md += '| **非美国矿企线索** | **' + ns.length + ' 家** | **SEC 20-F / 40-F / 6-K** |\n';
md += '| 10-K 深度提取（项目名+capex+设备句） | ' + tenk.companies.length + ' 家 | 10-K 正文 |\n';
md += '| 目标市场交叉分析 | ' + (cross.hot_markets || []).length + ' 国 | 三者交叉 |\n\n';

md += '## 二、非美国矿企线索（' + ns.length + ' 家）\n\n';
md += '**方法**：外国公司在美国上市必须提交 20-F（外国私人发行人年报）或 40-F（加拿大发行人）。\n';
md += '因此 SEC EDGAR 全文检索就是一份现成的**非美国矿企名录** —— 比爬各国交易所落地页可靠得多。\n\n';
md += '| # | 公司 | 注册地区域 | 运营区域（人工核对） | 申报 | 命中 | 最新 |\n|:---|:---|:---|:---|:---|:---|:---|\n';
for (let i = 0; i < Math.min(ns.length, 50); i++) {
  const c = ns[i];
  md += '| ' + (i + 1) + ' | ' + c.name + ' | ' + (c.incorporation_region || '') + ' | '
    + (c.operating_region_manual || '—') + ' | ' + (c.forms || []).join('/') + ' | '
    + c.filingCount + ' | ' + c.latest + ' |\n';
}
if (ns.length > 50) md += '\n（完整 ' + ns.length + ' 家见 Excel 表 14 / CSV）\n';
md += '\n### 关键发现\n\n';
md += '```\n79 家非美国矿企里，51 家注册在加拿大 —— 但矿山多在非洲或拉美。\n\n这说明了什么：\n  · 注册地（法域）与运营地（矿山在哪）是两件事，不能混用\n  · 加拿大是矿业融资中心，非洲/拉美是矿山所在\n  · 开发客户要盯【运营地】，签约主体在【注册地】\n```\n\n';

md += '## 三、目标市场交叉分析\n\n';
md += '**逻辑**：海关进口额（哪个国家在买）× 公司线索（谁在买）× 10-K 项目（在建什么）\n\n';
md += '| # | 国家 | 区域 | 进口合计 | 破碎 | 筛分 | 零件 | 区域客户数 | 优先级 |\n|:---|:---|:---|:---|:---|:---|:---|:---|:---|\n';
for (let i = 0; i < Math.min((cross.hot_markets || []).length, 30); i++) {
  const h = cross.hot_markets[i];
  const prio = h.total > 2e8 && h.companiesInRegion >= 2 ? '**A ★ 优先**' : (h.total > 5e7 ? 'B 跟进' : 'C 观察');
  md += '| ' + (i + 1) + ' | ' + h.zh + ' | ' + h.region + ' | ' + f(h.total) + ' | ' + f(h.crusher) + ' | '
    + f(h.screen) + ' | ' + f(h.parts) + ' | ' + h.companiesInRegion + ' | ' + prio + ' |\n';
}
md += '\n### A 级优先市场（进口额 >2 亿美元 且 区域有 ≥2 家已知矿企）\n\n';
for (const h of (cross.hot_markets || []).filter((x) => x.total > 2e8 && x.companiesInRegion >= 2)) {
  md += '- **' + h.zh + '** —— 进口 ' + f(h.total) + '，区域已知矿企 ' + h.companiesInRegion + ' 家\n';
}
md += '\n';

md += '## 四、海关数据的能与不能\n\n';
md += '| 能做到 | 做不到 |\n|:---|:---|\n';
md += '| 说清**哪个国家**在买、买多少、买破碎还是筛分还是零件 | ❌ 不能定位到**具体买家** |\n';
md += '| 看清三年趋势与增长 | ❌ 没有公司名、没有联系人 |\n';
md += '| 区分整机市场与备件市场 | ❌ 不能区分最终用户与贸易商 |\n\n';
md += '**所以要定位客户，必须用公司线索（SEC EDGAR）而不是海关数据。**\n\n';

md += '## 五、客户线索的使用方式\n\n';
md += '### 美国上市公司（' + usQual.length + ' 家）\n\n';
md += '每家带：公司名 · CIK · 命中文件数 · 最新申报日 · 采购进入路径 · SEC 核查链接\n\n';
md += '### 非美国矿企（' + ns.length + ' 家）\n\n';
md += '每家带：公司名 · 注册地 · 运营区域 · 申报类型 · CIK · SEC 核查链接\n\n';
md += '### 10-K 深度提取（' + tenk.companies.length + ' 家）\n\n';
md += '每家带：**在建项目名** · 资本支出原文 · 处理量原文 · **破碎设备相关原文句**\n\n';
md += '最有价值的样例（Southern Copper 的 10-K 原文）：\n\n';
md += '> In November 2023, the "HPGR optimization as a quaternary crushing circuit" project began operational testing and ramping-up\n>\n> In February 2024, the quaternary crushing circuit began working at full capacity with favorable results\n\n';
md += '**这是【正在进行时】的破碎设备项目 —— 销售可直接跟进。**\n\n';

md += '## 六、已知局限（必读）\n\n';
md += '1. **SEC 体系只覆盖在美上市企业** —— 中国、俄罗斯、中亚部分、非洲部分、拉美部分的**未上市**矿企不在其中\n';
md += '2. **"提到 crusher" ≠ "正在采购"** —— 这些是【有破碎设备需求的公司】，不是【已确认订单】\n';
md += '3. **海关数据是国家统计** —— 反映"这个国家在买"，不是"这家公司在买"\n';
md += '4. **区域为人工核对** —— 运营区域须以 20-F 矿山章节为最终依据\n';
md += '5. **不做的事** —— 不编造联系人姓名与邮箱；不做价格承诺；不把"提到"说成"已购买"\n\n';

md += '## 七、核查方式\n\n';
md += '```\n公司线索    → https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=<CIK>\n海关数据    → https://comtrade.un.org/ （HS 847410 筛分 / 847420 破碎 / 847490 零件）\n10-K 原文   → 每家附直达链接\n```\n\n';

const out = join(CL, 'global', '全球矿业客户开发报告.md');
writeFileSync(out, md, 'utf8');
console.log('  ✅ 全球矿业客户开发报告.md（' + (md.length / 1024).toFixed(0) + ' KB）');
console.log('     ' + ns.length + ' 家非美矿企 · ' + usQual.length + ' 家美国线索 · ' + (cross.hot_markets || []).length + ' 个交叉市场');
