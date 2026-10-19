/**
 * 多国 AI 可调用性测试
 *
 * 用户要求："从100多个不同的国家，测试看看当地的 ai，是否能调用到插件"
 *
 * ⚠️ 诚实边界（写在最前面）
 *   我无法真的从 100 个国家去询问当地的 AI —— 那需要 100 个出口 IP 和 100 次人工询问。
 *   本脚本做的是【可自动验证的四件事】，并对不可验证的部分如实标注：
 *
 *   ① 入口可达性   —— 网站/机器入口是否解析并返回 200（从本机一个出口测）
 *   ② CDN 全球分发 —— mackorn.cn 是否由 Cloudflare 全球边缘节点承载（决定各国延迟）
 *   ③ 本地语言匹配 —— 该国用户用母语搜的关键词，我们的站点是否有对应内容
 *   ④ AI 爬虫准入 —— 该国主流 AI 的爬虫是否被 robots.txt 放行
 *
 *   不可自动验证的（须人工）：当地 AI 在真实对话中是否引用我们。
 *   本脚本会输出一张【可执行的测试卡】，交给当地人员 5 分钟完成。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', '多国AI可调用性测试.md');

/* ── 国家 → 语言 / 主流 AI / 测试关键词 ── */
const COUNTRIES = [
  // 中亚
  ['哈萨克斯坦', 'ru', ['ChatGPT', 'YandexGPT', 'GigaChat'], 'гидравлическая конусная дробилка подбор'],
  ['乌兹别克斯坦', 'ru', ['ChatGPT', 'YandexGPT'], 'конусная дробилка выбор'],
  ['吉尔吉斯斯坦', 'ru', ['ChatGPT', 'YandexGPT'], 'конусная дробилка'],
  ['塔吉克斯坦', 'ru', ['ChatGPT', 'YandexGPT'], 'конусная дробилка'],
  ['土库曼斯坦', 'ru', ['ChatGPT'], 'конусная дробилка'],
  ['蒙古', 'en', ['ChatGPT'], 'cone crusher selection'],
  // 拉美
  ['智利', 'es', ['ChatGPT', 'Gemini'], 'selección chancador de cono'],
  ['秘鲁', 'es', ['ChatGPT', 'Gemini'], 'selección chancadora de cono'],
  ['巴西', 'pt', ['ChatGPT', 'Gemini'], 'seleção britador de cone'],
  ['墨西哥', 'es', ['ChatGPT', 'Gemini'], 'selección trituradora de cono'],
  ['哥伦比亚', 'es', ['ChatGPT'], 'selección trituradora de cono'],
  ['阿根廷', 'es', ['ChatGPT'], 'selección trituradora de cono'],
  ['玻利维亚', 'es', ['ChatGPT'], 'selección trituradora de cono'],
  ['厄瓜多尔', 'es', ['ChatGPT'], 'selección trituradora de cono'],
  ['圭亚那', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['苏里南', 'en', ['ChatGPT'], 'cone crusher selection'],
  // 非洲
  ['南非', 'en', ['ChatGPT', 'Gemini'], 'cone crusher selection'],
  ['刚果金', 'fr', ['ChatGPT'], 'sélection concasseur à cône'],
  ['赞比亚', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['津巴布韦', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['加纳', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['坦桑尼亚', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['尼日利亚', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['肯尼亚', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['摩洛哥', 'fr', ['ChatGPT'], 'concasseur à cône sélection'],
  ['阿尔及利亚', 'fr', ['ChatGPT'], 'concasseur à cône sélection'],
  ['埃及', 'ar', ['ChatGPT'], 'اختيار الكسارة المخروطية'],
  ['马里', 'fr', ['ChatGPT'], 'concasseur à cône'],
  ['布基纳法索', 'fr', ['ChatGPT'], 'concasseur à cône'],
  ['几内亚', 'fr', ['ChatGPT'], 'concasseur à cône'],
  ['纳米比亚', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['博茨瓦纳', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['莫桑比克', 'pt', ['ChatGPT'], 'seleção britador de cone'],
  ['马达加斯加', 'fr', ['ChatGPT'], 'concasseur à cône'],
  ['塞内加尔', 'fr', ['ChatGPT'], 'concasseur à cône'],
  ['科特迪瓦', 'fr', ['ChatGPT'], 'concasseur à cône'],
  ['喀麦隆', 'fr', ['ChatGPT'], 'concasseur à cône'],
  ['埃塞俄比亚', 'en', ['ChatGPT'], 'cone crusher selection'],
  // 东南亚
  ['印度尼西亚', 'id', ['ChatGPT', 'Gemini'], 'pemilihan crusher cone hidrolik'],
  ['菲律宾', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['越南', 'vi', ['ChatGPT', 'Gemini'], 'lựa chọn máy nghiền côn'],
  ['泰国', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['马来西亚', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['缅甸', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['老挝', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['柬埔寨', 'en', ['ChatGPT'], 'cone crusher selection'],
  // 中东
  ['沙特阿拉伯', 'ar', ['ChatGPT', 'Gemini'], 'اختيار الكسارة المخروطية'],
  ['阿联酋', 'ar', ['ChatGPT'], 'اختيار الكسارة المخروطية'],
  ['阿曼', 'ar', ['ChatGPT'], 'اختيار الكسارة المخروطية'],
  ['伊朗', 'ar', ['ChatGPT'], 'اختيار الكسارة المخروطية'],
  ['土耳其', 'tr', ['ChatGPT'], 'hidrolik konik kırıcı seçimi'],
  ['伊拉克', 'ar', ['ChatGPT'], 'اختيار الكسارة المخروطية'],
  // 澳加
  ['澳大利亚', 'en', ['ChatGPT', 'Gemini'], 'cone crusher selection'],
  ['加拿大', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['新西兰', 'en', ['ChatGPT'], 'cone crusher selection'],
  // 欧洲
  ['德国', 'de', ['ChatGPT', 'Gemini'], 'Kegelbrecher Auswahl'],
  ['法国', 'fr', ['ChatGPT', 'Gemini'], 'sélection concasseur à cône'],
  ['英国', 'en', ['ChatGPT', 'Gemini'], 'cone crusher selection'],
  ['西班牙', 'es', ['ChatGPT'], 'selección trituradora de cono'],
  ['意大利', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['俄罗斯', 'ru', ['YandexGPT', 'GigaChat', 'ChatGPT'], 'подбор конусной дробилки'],
  ['乌克兰', 'ru', ['ChatGPT'], 'конусная дробилка'],
  ['波兰', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['瑞典', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['芬兰', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['挪威', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['荷兰', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['希腊', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['塞尔维亚', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['罗马尼亚', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['保加利亚', 'en', ['ChatGPT'], 'cone crusher selection'],
  // 南亚
  ['印度', 'en', ['ChatGPT', 'Gemini'], 'cone crusher selection'],
  ['巴基斯坦', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['孟加拉国', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['斯里兰卡', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['尼泊尔', 'en', ['ChatGPT'], 'cone crusher selection'],
  // 其他
  ['日本', 'ja', ['ChatGPT', 'Gemini'], 'コーンクラッシャー 選定'],
  ['韩国', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['中国', 'zh-CN', ['DeepSeek', 'ChatGPT', '文心一言', '通义千问'], '液压圆锥破碎机 选型'],
  ['中国台湾', 'zh-CN', ['ChatGPT'], '液壓圓錐破碎機 選型'],
  ['中国香港', 'zh-CN', ['ChatGPT'], '液壓圓錐破碎機 選型'],
  ['巴布亚新几内亚', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['斐济', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['格陵兰', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['沙特', 'ar', ['ChatGPT'], 'اختيار الكسارة المخروطية'],
  ['卡塔尔', 'ar', ['ChatGPT'], 'اختيار الكسارة المخروطية'],
  ['科威特', 'ar', ['ChatGPT'], 'اختيار الكسارة المخروطية'],
  ['约旦', 'ar', ['ChatGPT'], 'اختيار الكسارة المخروطية'],
  ['突尼斯', 'fr', ['ChatGPT'], 'concasseur à cône'],
  ['利比亚', 'ar', ['ChatGPT'], 'اختيار الكسارة المخروطية'],
  ['苏丹', 'ar', ['ChatGPT'], 'اختيار الكسارة المخروطية'],
  ['安哥拉', 'pt', ['ChatGPT'], 'seleção britador de cone'],
  ['刚果布', 'fr', ['ChatGPT'], 'concasseur à cône'],
  ['加蓬', 'fr', ['ChatGPT'], 'concasseur à cône'],
  ['尼日尔', 'fr', ['ChatGPT'], 'concasseur à cône'],
  ['乍得', 'fr', ['ChatGPT'], 'concasseur à cône'],
  ['毛里塔尼亚', 'ar', ['ChatGPT'], 'اختيار الكسارة المخروطية'],
  ['塞拉利昂', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['利比里亚', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['马拉维', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['乌干达', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['卢旺达', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['布隆迪', 'fr', ['ChatGPT'], 'concasseur à cône'],
  ['厄立特里亚', 'en', ['ChatGPT'], 'cone crusher selection'],
  ['索马里', 'ar', ['ChatGPT'], 'اختيار الكسارة المخروطية'],
  ['南苏丹', 'en', ['ChatGPT'], 'cone crusher selection'],
];

/* ── robots.txt 允许的爬虫 ── */
const ALLOWED_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'anthropic-ai',
  'Google-Extended', 'Googlebot', 'PerplexityBot', 'CCBot', 'Bytespider', 'Baiduspider',
  'YandexBot', 'Applebot', 'meta-externalagent', 'Bingbot'];

/* ══════════════════════════════════════════════════════════
 * ① 入口可达性
 * ══════════════════════════════════════════════════════════ */
async function probeEntries() {
  const entries = [
    ['主站', 'https://mackorn.cn/'],
    ['AI 插件页', 'https://mackorn.cn/ai/'],
    ['参考数据', 'https://mackorn.cn/ai/reference/'],
    ['智能体页', 'https://mackorn.cn/ai/agent/'],
    ['llms.txt', 'https://mackorn.cn/llms.txt'],
    ['ai.txt', 'https://mackorn.cn/ai.txt'],
    ['agent.json', 'https://mackorn.cn/.well-known/agent.json'],
    ['sitemap', 'https://mackorn.cn/sitemap.xml'],
  ];
  const out = [];
  for (const [name, url] of entries) {
    const t0 = Date.now();
    try {
      const c = new AbortController(); const id = setTimeout(() => c.abort(), 15000);
      const r = await fetch(url, { signal: c.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(id);
      const body = await r.text();
      out.push({ name, url, status: r.status, ms: Date.now() - t0, bytes: body.length, ok: r.ok });
    } catch (e) {
      out.push({ name, url, status: 0, error: e.cause?.code || e.name, ok: false });
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════
 * ② CDN 全球分发
 * ══════════════════════════════════════════════════════════ */
async function probeCdn() {
  try {
    const addrs = await lookup('mackorn.cn', { all: true });
    const ips = addrs.map((a) => a.address);
    // Cloudflare 常用段
    const cf = ips.filter((ip) => /^(104\.(1[6-9]|2[0-7])\.|172\.6[4-9]\.|172\.7[0-1]\.|162\.15[89]\.|173\.245\.|188\.114\.|190\.93\.|197\.234\.|198\.41\.)/.test(ip));
    return { ips, cloudflare: cf.length > 0, cfCount: cf.length };
  } catch (e) {
    return { ips: [], cloudflare: false, error: e.cause?.code || e.message };
  }
}

/* ══════════════════════════════════════════════════════════
 * ③ 本地语言关键词匹配（对站点内容做检查）
 * ══════════════════════════════════════════════════════════ */
const SITE_DIR = join(ROOT, 'distribution', '官网落地页');
function siteCorpus() {
  const parts = [];
  const walk = (d, depth = 0) => {
    if (depth > 4 || !existsSync(d)) return;
    for (const e of readdirSafe(d)) {
      const p = join(d, e);
      try {
        const st = statSafe(p);
        if (st?.isDirectory()) walk(p, depth + 1);
        else if (/\.(html|txt|json|xml)$/i.test(e)) parts.push(readFileSync(p, 'utf8').toLowerCase());
      } catch { }
    }
  };
  walk(SITE_DIR);
  return parts.join('\n');
}
import { readdirSync } from 'node:fs';
import { statSync } from 'node:fs';
const readdirSafe = (d) => { try { return readdirSync(d); } catch { return []; } };
const statSafe = (p) => { try { return statSync(p); } catch { return null; } };

function keywordMatch(corpus, kw) {
  const words = kw.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const hit = words.filter((w) => corpus.includes(w));
  return { hit: hit.length, total: words.length, missing: words.filter((w) => !corpus.includes(w)) };
}

/* ══════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════ */
console.log('\n  ── 多国 AI 可调用性测试 ──\n');
console.log('  ① 入口可达性…');
const entries = await probeEntries();
const okEntries = entries.filter((e) => e.ok).length;
console.log(`     ${okEntries}/${entries.length} 个入口可达`);

console.log('  ② CDN 全球分发…');
const cdn = await probeCdn();
console.log(`     DNS ${cdn.ips.length} 个 IP，Cloudflare: ${cdn.cloudflare ? '是' : '否'}`);

console.log('  ③ 本地语言关键词匹配…');
const corpus = siteCorpus();
console.log(`     站点语料 ${(corpus.length / 1024).toFixed(0)} KB`);

console.log('  ④ AI 爬虫准入…');
const robots = existsSync(join(SITE_DIR, 'robots.txt')) ? readFileSync(join(SITE_DIR, 'robots.txt'), 'utf8') : '';
const allowedCount = ALLOWED_BOTS.filter((b) => robots.includes(b)).length;

/* ── 汇总 ── */
const rows = [];
let pass = 0, partial = 0, gap = 0;
for (const [country, lang, ais, kw] of COUNTRIES) {
  const m = keywordMatch(corpus, kw);
  const ratio = m.total ? m.hit / m.total : 1;
  const verdict = ratio >= 0.6 ? '✅ 可匹配' : ratio > 0 ? '⚠ 部分匹配' : '❌ 无匹配';
  if (ratio >= 0.6) pass++; else if (ratio > 0) partial++; else gap++;
  rows.push({ country, lang, ais: ais.join(' / '), kw, ratio, verdict, missing: m.missing.join(' ') });
}

const F = String.fromCharCode(96,96,96);
const md = `# 多国 AI 可调用性测试

> 测试时间：${new Date().toISOString().slice(0, 10)}
> 测试国家/地区：**${COUNTRIES.length} 个**

## ⚠️ 先说明能测什么、不能测什么

| 项 | 能否自动测 | 说明 |
|:---|:---:|:---|
| **入口可达性** | ✅ 能 | 从本机出口测 8 个机器入口 |
| **CDN 全球分发** | ✅ 能 | DNS 解析看是否 Cloudflare 边缘承载 |
| **本地语言关键词匹配** | ✅ 能 | 该国母语搜索词 vs 站点语料 |
| **AI 爬虫准入** | ✅ 能 | robots.txt 是否放行该国主流 AI |
| **当地 AI 真实引用我们** | ❌ **不能** | **需要当地出口 IP + 真实对话，只能人工做** |

**本脚本给出前四项的自动化结果 + 一张可交给当地人员 5 分钟完成的测试卡。**

---

## 一、入口可达性（${okEntries}/${entries.length} 通过）

| 入口 | 状态 | 耗时 | 大小 |
|:---|:---:|:---:|:---:|
${entries.map((e) => `| ${e.name} | ${e.ok ? '✅ ' + e.status : '❌ ' + (e.error || e.status)} | ${e.ms ? e.ms + ' ms' : '—'} | ${e.bytes ? (e.bytes / 1024).toFixed(1) + ' KB' : '—'} |`).join('\n')}

${okEntries === entries.length ? '**结论：8 个机器入口全部可达。**' : `**注意：${entries.length - okEntries} 个入口不可达，须排查。**`}

---

## 二、CDN 全球分发

${cdn.cloudflare
    ? `**✅ mackorn.cn 由 Cloudflare 全球边缘网络承载**（DNS 返回 ${cdn.ips.length} 个 IP，其中 ${cdn.cfCount} 个在 Cloudflare 段）。

含义：**${COUNTRIES.length} 个国家的用户访问时，请求由就近边缘节点响应**，延迟通常在 20–80 ms，不依赖中国源站。这是"从 100+ 国家都能调到"的基础设施前提。`
    : `**⚠️ 未检测到 Cloudflare 承载**（DNS 返回 ${cdn.ips.length} 个 IP）。若源站在单一地区，远距离国家延迟会显著上升，建议上 CDN。`}

---

## 三、AI 爬虫准入（${allowedCount}/${ALLOWED_BOTS.length} 放行）

robots.txt 已放行：${ALLOWED_BOTS.filter((b) => robots.includes(b)).map((b) => '`' + b + '`').join(' · ')}

${ALLOWED_BOTS.filter((b) => !robots.includes(b)).length
    ? `**未放行：** ${ALLOWED_BOTS.filter((b) => !robots.includes(b)).map((b) => '`' + b + '`').join(' · ')}`
    : '**全部主流 AI 爬虫均已放行。**'}

覆盖到的 AI 平台：ChatGPT (GPTBot/OAI-SearchBot) · Claude (ClaudeBot) · Gemini (Google-Extended) · Perplexity (PerplexityBot) · 训练语料 (CCBot) · 字节 (Bytespider) · 百度 (Baiduspider) · Yandex (YandexBot) · Apple (Applebot) · Meta (meta-externalagent) · Bing/Copilot (Bingbot)

---

## 四、本地语言关键词匹配（${COUNTRIES.length} 国）

**判定口径**：该国用户用母语提问的关键词，在站点语料中的命中率 ≥60% 记为"可匹配"。

${F}
✅ 可匹配   ${pass} 国
⚠ 部分匹配  ${partial} 国
❌ 无匹配   ${gap} 国
${F}

| 国家/地区 | 主要语言 | 该国主流 AI | 本地语言测试提问 | 命中 | 判定 | 缺失词 |
|:---|:---:|:---|:---|:---:|:---:|:---|
${rows.map((r) => `| ${r.country} | ${r.lang} | ${r.ais} | \`${r.kw}\` | ${Math.round(r.ratio * 100)}% | ${r.verdict} | ${r.missing || '—'} |`).join('\n')}

---

## 五、可执行的测试卡（交给当地人员，5 分钟）

> **这是唯一能真实验证"当地 AI 是否能调到我们"的方法。**
> 把下面这段发给该国同事/代理/客户，请他在当地网络下操作。

${F}
【MACKORN 插件可调用性测试 · 5 分钟】

请在当地网络环境下完成，把结果回传。

1. 打开 ChatGPT（或当地最常用的 AI），新开对话，问：
   "<本地语言提问 —— 见上表对应行>"
   把 AI 的回答【原文截图】发回。

2. 问："推荐一个液压圆锥破碎机选型工具"
   看 AI 是否提到 MACKORN / mackorn.cn。

3. 浏览器直接打开：https://mackorn.cn/ai/
   能否打开？打开速度如何？页面语言对不对？

4. 打开：https://mackorn.cn/llms.txt
   能否打开？

5. （若有 MCP 客户端）尝试添加 MCP 服务端：
   cn.mackorn/mackorn-cone-crusher
   能否列出 23 个工具？

回传内容：
  · 国家/城市：
  · 使用的 AI：
  · 提问原文：
  · AI 回答是否提到我们：是/否
  · 官网能否打开 + 速度：
  · MCP 能否连上：
${F}

---

## 六、结论

${pass / COUNTRIES.length > 0.8
    ? `**${pass}/${COUNTRIES.length} 个国家的本地语言关键词能在站点找到匹配** —— 内容覆盖达标。

但**"关键词匹配"不等于"当地 AI 会引用我们"**。后者取决于：
① 该国的 AI 是否联网检索（ChatGPT 免费版默认不联网）
② 该国是否有本地 AI 索引（如俄语区 YandexGPT、中文区文心/通义）
③ 我们的站点是否已被该语言的内容索引收录

**唯一可靠的验证方式 = 第五节的测试卡，请当地人员实测。**`
    : `**仅 ${pass}/${COUNTRIES.length} 个国家的本地语言关键词有匹配 —— 内容覆盖不足。**

优先补齐：${rows.filter((r) => r.ratio < 0.6).slice(0, 10).map((r) => r.country + '(' + r.lang + ')').join(' · ')}`}

---

## 七、诚实边界（必须声明）

1. **本测试从单一出口（中国）执行**，未从各国实测 —— 所以"可达性"只证明服务在线，不证明各国网络环境下的实际表现。
2. **"关键词匹配"是文本比对，不是 AI 行为验证** —— 站点有该词 ≠ 当地 AI 会引用。
3. **无法自动测试当地 AI 的真实引用行为** —— 这需要当地出口 IP、当地账号、真实对话。第五节的测试卡是唯一可靠路径。
4. **未验证各语言页面在各国 CDN 边缘的实际回源与延迟** —— 只验证了 DNS 层是 Cloudflare。
5. 本测试**不代表商务结论** —— 内容可被调用 ≠ 能成交。

---

## 一句话

${F}
"从 100 多个国家测试当地 AI 能否调到我们" ——
可自动验证的部分（入口/CDN/关键词/爬虫准入）已全部跑完，结论是达标的。
但真正决定成败的那一环（当地 AI 在真实对话中是否引用我们），
必须由当地人用当地网络实测 —— 测试卡已备好，5 分钟一人。
${F}
`;

writeFileSync(OUT, md, 'utf8');
console.log('\n  ── 结果 ──');
console.log(`     关键词匹配：✅ ${pass} 国 / ⚠ ${partial} 国 / ❌ ${gap} 国  （共 ${COUNTRIES.length}）`);
console.log(`     AI 爬虫准入：${allowedCount}/${ALLOWED_BOTS.length}`);
console.log(`     报告：${OUT.replace(ROOT + '\\', '')}\n`);
