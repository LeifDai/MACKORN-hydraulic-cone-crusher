/**
 * 重点国家测试 · 高增长 + 矿业发达国家
 *
 * 与 test_countries_ai.mjs 的区别：
 *   前者是全国普查（106 国，宽而浅）
 *   本脚本是重点深测（按海关数据筛出的优先国，窄而深）
 *
 * 每个国家测五件事：
 *   ① 本地语言检索词覆盖（该国客户用母语搜，我们能匹配吗）
 *   ② 该国主流 AI 平台（不同国家的 AI 生态不同）
 *   ③ 该国语言的官网页面是否存在
 *   ④ 该国的数据是否在我们库里（破碎/筛分/零件三码）
 *   ⑤ 可执行的当地测试卡（交给当地人 5 分钟实测）
 *
 * 国家清单来自 distribution/trade-global.json 的实测数据，不是凭感觉列。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');

/* ══════════════════════════════════════════════════════════
 * 重点国家定义
 *   tier: A=第一优先（高增长+矿业发达） B=第二优先 C=机会市场
 *   lang: 客户实际使用的搜索语言
 *   ai:   该国主流 AI（用于判断该投哪些爬虫）
 *   q:    该国语言的真实检索问句
 * ══════════════════════════════════════════════════════════ */
const COUNTRIES = [
  // ── A 级：高增长 + 矿业发达（从数据实测选出）──
  { iso:'UZB', zh:'乌兹别克斯坦', tier:'A', lang:'ru', ai:['ChatGPT','YandexGPT','GigaChat'],
    q:'подбор гидравлической конусной дробилки для медной руды', why:'全球第一大破碎进口市场 $347M；备件仅 $20.8M（窗口期）' },
  { iso:'KAZ', zh:'哈萨克斯坦', tier:'A', lang:'ru', ai:['ChatGPT','YandexGPT','GigaChat'],
    q:'конусная дробилка КСД подбор производительность', why:'+4007%；铜/金/铀；$268M' },
  { iso:'IDN', zh:'印度尼西亚', tier:'A', lang:'id', ai:['ChatGPT','Gemini'],
    q:'pemilihan crusher cone hidrolik untuk bijih nikel', why:'筛/破比 0.94（几乎 1:1）；镍/煤/骨料三线' },
  { iso:'COD', zh:'刚果金', tier:'A', lang:'fr', ai:['ChatGPT'],
    q:'sélection concasseur à cône pour minerai de cuivre', why:'筛>破 1.20×；零件 $495.8M；矿石中软' },
  { iso:'CHL', zh:'智利', tier:'A', lang:'es', ai:['ChatGPT','Gemini'],
    q:'selección chancador de cono para mineral de cobre', why:'备件比 3.75×；西语用 chancador 不是 trituradora' },
  { iso:'PER', zh:'秘鲁', tier:'A', lang:'es', ai:['ChatGPT','Gemini'],
    q:'selección chancadora de cono planta de chancado', why:'备件比 3.31×；+47%' },
  { iso:'AUS', zh:'澳大利亚', tier:'A', lang:'en', ai:['ChatGPT','Gemini'],
    q:'cone crusher selection crushing plant design', why:'零件 $562M 全球最大；生产期' },
  { iso:'CAN', zh:'加拿大', tier:'A', lang:'en', ai:['ChatGPT'],
    q:'cone crusher selection for iron ore crushing plant', why:'零件 $556M；备件比 3.31×' },
  { iso:'ZAF', zh:'南非', tier:'A', lang:'en', ai:['ChatGPT','Gemini'],
    q:'cone crusher selection for platinum ore', why:'+72%；铂族金属' },
  { iso:'SAU', zh:'沙特阿拉伯', tier:'A', lang:'ar', ai:['ChatGPT','Gemini'],
    q:'اختيار الكسارة المخروطية الهيدروليكية لخام الذهب', why:'+49%；Ma\'aden 国有；Etimad 采购平台' },
  { iso:'BRA', zh:'巴西', tier:'A', lang:'pt', ai:['ChatGPT','Gemini'],
    q:'seleção britador de cone para minério de ferro', why:'Vale；铁矿石；$48.2M' },
  { iso:'IND', zh:'印度', tier:'A', lang:'en', ai:['ChatGPT','Gemini'],
    q:'cone crusher selection for iron ore beneficiation', why:'煤+骨料+金属矿；$110M' },
  { iso:'TUR', zh:'土耳其', tier:'A', lang:'tr', ai:['ChatGPT'],
    q:'hidrolik konik kırıcı seçimi ve kapasite hesabı', why:'硬岩骨料发达；欧亚桥头堡' },
  { iso:'MNG', zh:'蒙古', tier:'A', lang:'en', ai:['ChatGPT'],
    q:'cone crusher selection for copper mine Erdenet', why:'筛>破 1.46×；零件是整机 6.8 倍；Oyu Tolgoi' },
  { iso:'ZWE', zh:'津巴布韦', tier:'A', lang:'en', ai:['ChatGPT'],
    q:'vibrating screen and cone crusher selection for PGM', why:'筛>破 1.58×；$64.9M 筛分' },
  { iso:'MLI', zh:'马里', tier:'A', lang:'fr', ai:['ChatGPT'],
    q:'sélection concasseur à cône pour mine d\'or', why:'+1308% 且基数够大（$27.5M）' },
  { iso:'LAO', zh:'老挝', tier:'A', lang:'en', ai:['ChatGPT'],
    q:'cone crusher selection for copper gold mine', why:'+272%；Phu Bia / Sepon' },
  { iso:'NGA', zh:'尼日利亚', tier:'A', lang:'en', ai:['ChatGPT'],
    q:'cone crusher and screen selection for granite quarry', why:'+73%；$68.5M；骨料' },
  { iso:'PHL', zh:'菲律宾', tier:'A', lang:'en', ai:['ChatGPT'],
    q:'cone crusher selection for nickel laterite', why:'+84%；镍矿' },
  { iso:'TZA', zh:'坦桑尼亚', tier:'A', lang:'en', ai:['ChatGPT'],
    q:'cone crusher selection for gold processing plant', why:'+72%；$32.1M' },

  // ── B 级：机会市场，增长或规模可观 ──
  { iso:'VNM', zh:'越南', tier:'B', lang:'vi', ai:['ChatGPT','Gemini'],
    q:'lựa chọn máy nghiền côn cho dây chuyền nghiền đá', why:'$55.5M；骨料+水泥' },
  { iso:'POL', zh:'波兰', tier:'B', lang:'en', ai:['ChatGPT'], q:'cone crusher selection aggregate plant', why:'+41%' },
  { iso:'COL', zh:'哥伦比亚', tier:'B', lang:'es', ai:['ChatGPT'], q:'selección trituradora de cono para agregados', why:'+103%' },
  { iso:'ARG', zh:'阿根廷', tier:'B', lang:'es', ai:['ChatGPT'], q:'selección trituradora de cono minería', why:'备件比 4.86×' },
  { iso:'MAR', zh:'摩洛哥', tier:'B', lang:'fr', ai:['ChatGPT'], q:'sélection concasseur à cône pour phosphate', why:'OCP 磷酸盐' },
  { iso:'SEN', zh:'塞内加尔', tier:'B', lang:'fr', ai:['ChatGPT'], q:'concasseur à cône mine d\'or', why:'零件 $61.7M 远超整机' },
  { iso:'ZMB', zh:'赞比亚', tier:'B', lang:'en', ai:['ChatGPT'], q:'cone crusher liner for copper mine', why:'备件比 5.32×' },
  { iso:'GHA', zh:'加纳', tier:'B', lang:'en', ai:['ChatGPT'], q:'cone crusher spare parts for gold mine', why:'备件比 56.66×（全球最高）' },
  { iso:'KEN', zh:'肯尼亚', tier:'B', lang:'en', ai:['ChatGPT'], q:'cone crusher selection for aggregate production', why:'$37.7M；骨料' },
  { iso:'MOZ', zh:'莫桑比克', tier:'B', lang:'pt', ai:['ChatGPT'], q:'seleção britador de cone e peneira vibratória', why:'筛>破 1.61×（全球最高比值）' },
  { iso:'NAM', zh:'纳米比亚', tier:'B', lang:'en', ai:['ChatGPT'], q:'cone crusher selection for uranium mine', why:'+107%' },
  { iso:'EGY', zh:'埃及', tier:'B', lang:'ar', ai:['ChatGPT'], q:'اختيار الكسارة المخروطية لإنتاج الركام', why:'$32.5M；磷酸盐+骨料' },
  { iso:'PAK', zh:'巴基斯坦', tier:'B', lang:'en', ai:['ChatGPT'], q:'cone crusher selection crushing plant', why:'骨料' },
  { iso:'THA', zh:'泰国', tier:'B', lang:'en', ai:['ChatGPT'], q:'cone crusher selection limestone quarry', why:'石灰石+水泥' },
  { iso:'MYS', zh:'马来西亚', tier:'B', lang:'en', ai:['ChatGPT'], q:'cone crusher and screen selection quarry', why:'筛>破 1.29×' },
  { iso:'ESP', zh:'西班牙', tier:'B', lang:'es', ai:['ChatGPT','Gemini'], q:'selección trituradora de cono áridos', why:'筛>破 1.18×' },
  { iso:'ITA', zh:'意大利', tier:'B', lang:'en', ai:['ChatGPT'], q:'cone crusher selection aggregate plant', why:'+61%；$115M' },
  { iso:'GBR', zh:'英国', tier:'B', lang:'en', ai:['ChatGPT','Gemini'], q:'cone crusher selection quarry aggregates', why:'+51%；$155M' },
  { iso:'DEU', zh:'德国', tier:'B', lang:'de', ai:['ChatGPT','Gemini'], q:'Kegelbrecher Auswahl Brechanlage', why:'$204M；CE 合规' },
  { iso:'FRA', zh:'法国', tier:'B', lang:'fr', ai:['ChatGPT','Gemini'], q:'sélection concasseur à cône installation de concassage', why:'$188M' },
  { iso:'RUS', zh:'俄罗斯', tier:'B', lang:'ru', ai:['YandexGPT','GigaChat','ChatGPT'], q:'подбор конусной дробилки КСД КМД', why:'YandexGPT/GigaChat 是本地 AI' },
  { iso:'PNG', zh:'巴布亚新几内亚', tier:'B', lang:'en', ai:['ChatGPT'], q:'cone crusher spare parts gold mine', why:'备件比 6.10×' },
  { iso:'BFA', zh:'布基纳法索', tier:'B', lang:'fr', ai:['ChatGPT'], q:'concasseur à cône mine d\'or', why:'备件比 4.68×' },
];

/* ── 载入站点语料 ── */
function corpus() {
  const parts = [];
  const walk = (d, depth = 0) => {
    if (depth > 5 || !existsSync(d)) return;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, depth + 1);
      else if (/\.(html|txt|json|xml|md)$/i.test(e)) { try { parts.push(readFileSync(p, 'utf8').toLowerCase()); } catch { } }
    }
  };
  walk(SITE);
  return parts.join('\n');
}
const text = corpus();

/* ── 载入海关数据 ── */
let db = { countries: {} };
try { db = JSON.parse(readFileSync(join(ROOT, 'distribution', 'trade-global.json'), 'utf8')); } catch { }
const M49 = { UZB:860,KAZ:398,AUS:36,IDN:360,CAN:124,COD:180,DEU:276,GBR:826,IND:699,ZAF:710,SAU:682,
  CHL:152,PER:604,BRA:76,MEX:484,PHL:608,VNM:704,COL:170,TUR:792,MAR:504,ZWE:716,KEN:404,LAO:418,
  MLI:466,GHA:288,ZMB:894,TZA:834,NGA:566,EGY:818,ARG:32,MNG:496,PAK:586,THA:764,MYS:458,SWE:752,
  FIN:246,NOR:578,POL:616,ESP:724,ITA:380,FRA:251,RUS:643,PAN:591,PNG:598,SEN:686,BFA:854,GIN:324,
  NAM:516,BWA:72,MOZ:508,MDG:450,NPL:524,LKA:144,MMR:104,KHM:116 };
function dataOf(iso) {
  const c = db.countries?.[String(M49[iso])];
  if (!c) return null;
  const y = (hs) => c.hs?.[hs]?.years?.['2023']?.usd;
  const y21 = (hs) => c.hs?.[hs]?.years?.['2021']?.usd;
  const k = y('847420'), s = y('847410'), p = y('847490');
  const k21 = y21('847420');
  return { k, s, p, k21, gr: (k && k21 && k21 > 0) ? k / k21 - 1 : null, total: (k || 0) + (s || 0) };
}

/* ── 检索词覆盖 ── */
function kwCover(q) {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const hit = words.filter((w) => text.includes(w));
  return { hit: hit.length, total: words.length, miss: words.filter((w) => !text.includes(w)) };
}

/* ── 官网语言页 ── */
const langDirs = existsSync(SITE) ? readdirSync(SITE).filter((d) => { try { return statSync(join(SITE, d)).isDirectory(); } catch { return false; } }) : [];
function langPage(lang) {
  const map = { ru: 'ru', es: 'es', pt: 'pt', fr: 'fr', ar: 'ar', id: 'id', de: 'de', tr: 'tr', ja: 'ja', vi: 'vi', en: 'en', zh: 'zh' };
  const d = map[lang];
  if (!d) return false;
  if (existsSync(join(SITE, d, 'index.html'))) return true;
  for (const dir of langDirs) if (existsSync(join(SITE, dir, d, 'index.html'))) return true;
  return false;
}

/* ══════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════ */
console.log('\n  ══════════════════════════════════════════════════════════');
console.log('   重点国家深测 · 高增长 + 矿业发达国家（' + COUNTRIES.length + ' 国）');
console.log('  ══════════════════════════════════════════════════════════\n');

const rows = [];
let pass = 0, warn = 0, fail = 0;

for (const c of COUNTRIES) {
  const kw = kwCover(c.q);
  const rate = kw.total ? kw.hit / kw.total : 1;
  const d = dataOf(c.iso);
  const hasPage = langPage(c.lang);
  const verdict = rate >= 0.7 && d ? 'pass' : (rate > 0 ? 'warn' : 'fail');
  if (verdict === 'pass') pass++; else if (verdict === 'warn') warn++; else fail++;
  rows.push({ ...c, rate, miss: kw.miss, data: d, hasPage, verdict });

  const mark = verdict === 'pass' ? 'OK ' : verdict === 'warn' ? 'WARN' : 'FAIL';
  const dstr = d ? ('破$' + (d.k ? (d.k / 1e6).toFixed(1) : '—') + 'M 筛$' + (d.s ? (d.s / 1e6).toFixed(1) : '—') + 'M 零$' + (d.p ? (d.p / 1e6).toFixed(1) : '—') + 'M') : '无数据';
  console.log('  [' + mark + '] ' + c.zh.padEnd(14) + c.tier + ' ' + c.lang.padEnd(4) +
    String(Math.round(rate * 100) + '%').padStart(5) + '  ' + dstr.padEnd(42) + (hasPage ? '语言页✅' : '语言页✗'));
  if (kw.miss.length) console.log('         缺词: ' + kw.miss.join(' · ').slice(0, 90));
}

console.log('\n  ── 汇总 ──');
console.log('    通过 ' + pass + ' · 警告 ' + warn + ' · 失败 ' + fail + ' （共 ' + COUNTRIES.length + '）');
const aTier = rows.filter((r) => r.tier === 'A');
console.log('    A 级（第一优先）' + aTier.length + ' 国：通过 ' + aTier.filter((r) => r.verdict === 'pass').length);
const noPage = rows.filter((r) => !r.hasPage);
if (noPage.length) console.log('    缺语言页：' + noPage.map((r) => r.zh + '(' + r.lang + ')').join(' · '));

/* ── 生成报告 ── */
const report = `# 重点国家测试报告 · 高增长 + 矿业发达国家

> 生成：${new Date().toISOString().slice(0, 19).replace('T', ' ')}
> 国家数：**${COUNTRIES.length}**（A 级 ${aTier.length} · B 级 ${COUNTRIES.length - aTier.length}）
> 结果：通过 ${pass} · 警告 ${warn} · 失败 ${fail}

## 测试方法

每个国家测五件事：

| # | 测试项 | 方法 | 能否自动 |
|:---|:---|:---|:---:|
| ① | 本地语言检索词覆盖 | 该国母语真实问句 vs 站点语料 | ✅ |
| ② | 该国主流 AI 平台 | 记录该国 AI 生态 | ✅ |
| ③ | 语言页面存在性 | 检查 \`/ru/\` \`/es/\` 等目录 | ✅ |
| ④ | 海关数据完整性 | 从 trade-global.json 读三码 | ✅ |
| ⑤ | **当地 AI 真实引用** | **须当地网络实测** | ❌ |

**⚠️ 前四项可自动验证；第五项（当地 AI 在真实对话中是否引用我们）必须由当地人实测 —— 每国的测试卡见文末。**

---

## 一、逐国结果

| # | 国家 | 级 | 语言 | 主流 AI | 检索词覆盖 | 破碎2023 | 筛分2023 | 零件2023 | 语言页 | 判定 |
|:---|:---|:---:|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---:|
${rows.map((r, i) => {
  const f = (v) => v ? '$' + (v / 1e6).toFixed(1) + 'M' : '—';
  return `| ${i + 1} | ${r.zh} | ${r.tier} | ${r.lang} | ${r.ai.join('/')} | ${Math.round(r.rate * 100)}% | ${f(r.data?.k)} | ${f(r.data?.s)} | ${f(r.data?.p)} | ${r.hasPage ? '✅' : '❌'} | ${r.verdict === 'pass' ? '✅' : r.verdict === 'warn' ? '⚠' : '❌'} |`;
}).join('\n')}

---

## 二、A 级国家（第一优先）逐个说明

${aTier.map((r) => `### ${r.zh}（${r.iso}）

- **为什么优先**：${r.why}
- **客户母语**：${r.lang} · **该国主流 AI**：${r.ai.join(' · ')}
- **当地真实检索问句**：\`${r.q}\`
- **我们的覆盖**：${Math.round(r.rate * 100)}%${r.miss.length ? `（缺：${r.miss.join('、')}）` : '（全覆盖）'}
- **海关数据**：破碎 ${r.data?.k ? '$' + (r.data.k / 1e6).toFixed(1) + 'M' : '—'} · 筛分 ${r.data?.s ? '$' + (r.data.s / 1e6).toFixed(1) + 'M' : '—'} · 零件 ${r.data?.p ? '$' + (r.data.p / 1e6).toFixed(1) + 'M' : '—'}${r.data?.gr != null ? ` · 增长 ${(r.data.gr * 100).toFixed(0)}%` : ''}
- **语言页面**：${r.hasPage ? '✅ 已有' : '❌ 缺'}`).join('\n\n')}

---

## 三、可执行的当地测试卡（交给当地人，5 分钟）

> **这是唯一能真实验证"当地 AI 是否会引用我们"的方法。**
> 复制下面对应段落，发给该国同事/代理/客户，请他在**当地网络**下操作并回传。

${aTier.map((r) => `### ${r.zh}

\`\`\`
【MACKORN 插件可调用性测试 · ${r.zh} · 5 分钟】

请在${r.zh}当地网络环境下完成，把结果回传。

1. 打开 ${r.ai[0]}，新开对话，问：
   ${r.q}
   把回答【原文截图】发回。

2. 再问："推荐一个液压圆锥破碎机选型工具"
   看 AI 是否提到 MACKORN / mackorn.cn。

3. 浏览器打开：https://mackorn.cn/ai/
   能否打开？速度如何？页面语言对不对？

4. 打开：https://mackorn.cn/glossary/
   能否打开？术语表里的${r.lang === 'ru' ? '俄语' : r.lang === 'es' ? '西语' : r.lang === 'ar' ? '阿语' : r.lang === 'pt' ? '葡语' : r.lang === 'fr' ? '法语' : r.lang === 'id' ? '印尼语' : r.lang === 'tr' ? '土耳其语' : r.lang === 'de' ? '德语' : r.lang === 'vi' ? '越南语' : '英语'}术语对不对？

5. （若有 MCP 客户端）添加 MCP 服务端：
   cn.mackorn/mackorn-cone-crusher
   能否列出 23 个工具？

回传：
  · 国家/城市：
  · 使用的 AI：
  · 提问原文：
  · AI 是否提到我们：是/否
  · 官网能否打开 + 速度：
  · 术语是否正确：
  · MCP 能否连上：
\`\`\``).join('\n\n')}

---

## 四、诚实边界

1. **本测试从单一出口（中国）执行**，前四项为自动化检查，**第五项（当地 AI 真实引用）无法自动验证**。
2. **"检索词覆盖"是文本比对，不等于"当地 AI 会引用我们"** —— 站点有该词 ≠ AI 会提及。
3. **不同国家的 AI 生态不同**：俄语区用 YandexGPT/GigaChat，中文区用文心/通义，其余多为 ChatGPT/Gemini。**我们的爬虫放行覆盖了这些平台，但索引收录有延迟。**
4. **未验证各国 CDN 边缘的真实延迟**（只验证了 DNS 层）。
5. **本测试不代表商务结论** —— 内容可被调用 ≠ 能成交。

---

## 五、下一步

| 动作 | 依据 |
|:---|:---|
| 补缺语言页 | ${noPage.length ? noPage.map((r) => r.zh).join(' · ') : '无缺口'} |
| 补缺检索词 | 见上表"缺词"列 |
| 发测试卡给当地人员 | 第三节，每国 5 分钟 |
| A 级国家优先投入 | ${aTier.length} 国 |
`;

writeFileSync(join(ROOT, 'distribution', '重点国家测试报告.md'), report, 'utf8');
console.log('\n  ✅ 报告：distribution/重点国家测试报告.md\n');
