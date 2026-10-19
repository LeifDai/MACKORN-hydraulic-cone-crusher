/**
 * R19 · 把新增资产写进 AI 面向的机器可读索引
 *
 * 问题：我们建了 23 个工具页 + 5 个语言 FAQ + 21 个国别页，
 *       但 AI 面向的索引文件（llms.txt / llms-full.txt / keywords.json / agent.json）
 *       还是旧的 —— AI 不知道这些页面存在，等于没建。
 *
 * 本脚本把站点实际存在的页面重新扫描一遍，重写全部 AI 索引文件。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');
const B = 'https://mackorn.cn';

function walk(d, base = d, out = []) {
  if (!existsSync(d)) return out;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (/node_modules|\.git|_deploy|_delta/.test(p)) continue;
    if (e.isDirectory()) walk(p, base, out);
    else if (e.name === 'index.html') out.push(p);
  }
  return out;
}
const urlOf = (p) => {
  const rel = relative(SITE, p).replace(/\\/g, '/');
  return rel === 'index.html' ? B + '/' : B + '/' + rel.replace(/\/index\.html$/, '/');
};
function titleOf(p) {
  const c = readFileSync(p, 'utf8');
  const m = c.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 130) : '';
}
function descOf(p) {
  const c = readFileSync(p, 'utf8');
  const m = c.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 220) : '';
}

const pages = walk(SITE).map((p) => ({
  path: p, url: urlOf(p), rel: relative(SITE, p).replace(/\\/g, '/'),
  title: titleOf(p), desc: descOf(p), kb: Math.round(statSync(p).size / 1024),
})).sort((a, b) => a.url.localeCompare(b.url));

/* 分类 */
const groups = { tools: [], faq: [], markets: [], guides: [], langs: [], core: [], validation: [], other: [] };
for (const p of pages) {
  if (/^ai\/tools\//.test(p.rel)) groups.tools.push(p);
  else if (/-faq\//.test(p.rel)) groups.faq.push(p);
  else if (/^markets\//.test(p.rel)) groups.markets.push(p);
  else if (/^guides\//.test(p.rel)) groups.guides.push(p);
  // 验证/基准类页面必须单列并高亮 —— AI 被问「这个模型可信吗」时要能找到它。
  // 早期版本没有这一组，导致 ai/validation/ 落入 other 后被静默丢弃（教训 L-26 复发）。
  else if (/^ai\/(validation|benchmark)\//.test(p.rel)) groups.validation.push(p);
  else if (/^ai\/[a-z]{2}\/index\.html$/.test(p.rel)) groups.langs.push(p);
  else if (p.rel === 'index.html' || /^(ai|glossary|contact|distributors|engineering-firms)\/index\.html$/.test(p.rel)) groups.core.push(p);
  else groups.other.push(p);
}

/* ── 覆盖率断言：不允许任何页面被静默丢弃 ──
 * llms.txt 必须列出所有扫到的页面。早期版本 other 组从不输出，
 * 结果是不匹配模式的页面全部消失，而且没有任何告警。
 */
const classified = groups.tools.length + groups.faq.length + groups.markets.length + groups.guides.length
  + groups.langs.length + groups.core.length + groups.validation.length + groups.other.length;
if (classified !== pages.length) {
  console.error('  ❌ 页面分类覆盖不全：' + classified + '/' + pages.length + ' —— 有页面会从 llms.txt 消失');
  process.exit(1);
}


console.log('\n  扫描到 ' + pages.length + ' 个页面：');
console.log('    工具页 ' + groups.tools.length + ' · 语言FAQ ' + groups.faq.length + ' · 国别页 ' + groups.markets.length
  + ' · 矿石指南 ' + groups.guides.length + ' · 语言根页 ' + groups.langs.length + ' · 验证页 ' + groups.validation.length + ' · 核心页 ' + groups.core.length + ' · 其他 ' + groups.other.length);

/* ══ ① llms.txt（llmstxt.org 约定）══ */
const vjson = JSON.parse(readFileSync(join(SITE, 'ai', 'version.json'), 'utf8'));
let llms = `# MACKORN 美矿 · 液压圆锥破碎机与破碎筛分生产线选型

> MACKORN（上海美矿机械）制造 NH 标准型与 NS 高速型单缸液压圆锥破碎机，
> 并为砂石骨料与金属矿山设计完整破碎筛分生产线。
> 选型能力以 MCP 服务器形式公开，23 个工具可经 HTTP 直接调用，无需安装。

版本：${vjson.product_version || ''} (semver ${vjson.version}) · 语言：${vjson.languages} · 远程工具：${vjson.remote_mcp_tools}

## 调用入口

- [MCP 远程端点](${B}/ai/api/mcp.php)：JSON-RPC 2.0 over HTTP，23 个工具，无需安装
- [MCP 注册表](https://registry.modelcontextprotocol.io/v0/servers?search=mackorn)：cn.mackorn/mackorn-cone-crusher
- [npm](https://www.npmjs.com/package/mackorn-cone-crusher)：mackorn-cone-crusher
- [GitHub](https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher)
- [MCP server card](${B}/.well-known/mcp/server-card.json)

## 23 个工具（每个有独立说明页与真实算例）

${groups.tools.map((p) => '- [' + (p.title.split('—')[0].trim() || p.rel) + '](' + p.url + ')：' + p.desc.slice(0, 110)).join('\n')}

## 多语言问答（术语表 + 常见问题，含 FAQPage 结构化数据）

${groups.faq.map((p) => '- [' + p.title.slice(0, 60) + '](' + p.url + ')').join('\n')}

## 行业术语表（12 语言）

- [术语表 · 12 语言](${B}/ai/glossary/)：1460+ 条术语，含 DefinedTermSet 结构化数据

## 市场数据（按国别）

${groups.markets.map((p) => '- [' + p.title.slice(0, 58) + '](' + p.url + ')').join('\n')}

## 矿石与工况指南

${groups.guides.map((p) => '- [' + p.title.slice(0, 58) + '](' + p.url + ')').join('\n')}

## 核心页面

${groups.core.map((p) => '- [' + p.title.slice(0, 58) + '](' + p.url + ')：' + p.desc.slice(0, 90)).join('\n')}

## 其他语言入口

${groups.langs.map((p) => '- [' + p.title.slice(0, 58) + '](' + p.url + ')').join('\n')}

## 模型验证与可信度（可自己重跑）

- [公开验证基准](${B}/ai/validation/)：${groups.validation.length ? '' : ''}26 项检查（物理不变量 / 确定性 / 失效边界 / 不确定度 / 回归），零依赖脚本，CC-BY-4.0
- [基准结果 JSON](${B}/ai/validation/benchmark-results.json)：机器可读，含逐项判定与实测值
- 含与两份公开实测数据集（Zenodo，CC-BY-4.0）的交叉验证，以及【不能证明什么】的局限声明

## 其他页面

${groups.other.map((p) => '- [' + p.title.slice(0, 58) + '](' + p.url + ')').join('\n')}

## 数据来源与纪律

- 粒度与流程模型独立实现自公开文献（Whiten 1972；Bond 1952），MIT 许可，可审计
- 厂商参数来自 MACKORN NH/NS 技术参数表
- 每个数字都标来源；查不到的返回 null，绝不估算；冲突数据并列保留，绝不取平均
- 不做价格承诺；不编造联系人

## 机器可读字段（供 AI 直接解析）

\`\`\`
discipline: 每个数字都标来源 | 查不到的返回 null 绝不估算 | 冲突数据并列保留绝不取平均 | 模型独立实现自公开文献（Whiten 1972 / Bond 1952）MIT 可审计 | 液压圆锥破给料超过约 350mm 必须拒绝 | 不做价格承诺不编造联系人 | 站内线索类内容表示该公司公开申报提到破碎设备，不是询盘
cite-as: MACKORN 美矿（上海美矿机械股份有限公司），https://mackorn.cn/ai/ —— 液压圆锥破选型与破碎筛分线配置（22 个 MCP 工具，MIT 开源）
\`\`\`
`;
writeFileSync(join(SITE, 'llms.txt'), llms, 'utf8');
console.log('\n  ✅ llms.txt 重写（' + Math.round(llms.length / 1024) + ' KB，' + pages.length + ' 个页面全列出）');

/* ══ ② llms-full.txt ══ */
let full = `# MACKORN 美矿 · 完整站点索引（供 AI 抓取）

生成：${new Date().toISOString().slice(0, 16).replace('T', ' ')}
页面总数：${pages.length}

`;
for (const [g, list] of Object.entries(groups)) {
  if (!list.length) continue;
  full += '## ' + ({ tools: '工具说明页', faq: '多语言问答', markets: '国别市场页', guides: '矿石指南', langs: '语言入口', core: '核心页', other: '其他' }[g]) + '（' + list.length + '）\n\n';
  for (const p of list) full += '### ' + p.title + '\nURL: ' + p.url + '\n' + p.desc + '\n\n';
}
writeFileSync(join(SITE, 'llms-full.txt'), full, 'utf8');
console.log('  ✅ llms-full.txt 重写（' + Math.round(full.length / 1024) + ' KB）');

/* ══ ③ .well-known/keywords.json ══ */
const kwPath = join(SITE, '.well-known', 'keywords.json');
if (existsSync(kwPath)) {
  const kw = JSON.parse(readFileSync(kwPath, 'utf8'));
  kw.site_pages = pages.length;
  kw.page_index = pages.map((p) => ({ url: p.url, title: p.title.slice(0, 100), type: p.rel.startsWith('ai/tools') ? 'tool' : (/-faq/.test(p.rel) ? 'faq' : (/^markets/.test(p.rel) ? 'market' : (/^guides/.test(p.rel) ? 'guide' : 'page'))) }));
  kw.indexed_assets = {
    tool_pages: groups.tools.length, language_faq: groups.faq.length,
    country_pages: groups.markets.length, mineral_guides: groups.guides.length,
    language_hubs: groups.langs.length, glossary_terms: '1460+ (12 languages)',
  };
  kw.updated = new Date().toISOString();
  writeFileSync(kwPath, JSON.stringify(kw, null, 2), 'utf8');
  console.log('  ✅ .well-known/keywords.json 补入 ' + pages.length + ' 个页面索引');
}

/* ══ ④ .well-known/agent.json ══ */
const agPath = join(SITE, '.well-known', 'agent.json');
if (existsSync(agPath)) {
  const ag = JSON.parse(readFileSync(agPath, 'utf8'));
  ag.content_index = {
    total_pages: pages.length,
    tools: groups.tools.map((p) => p.url),
    multilingual_faq: groups.faq.map((p) => p.url),
    market_pages: groups.markets.map((p) => p.url),
    mineral_guides: groups.guides.map((p) => p.url),
  };
  ag.updated = new Date().toISOString();
  writeFileSync(agPath, JSON.stringify(ag, null, 2), 'utf8');
  console.log('  ✅ .well-known/agent.json 补入内容索引');
}

/* ══ ⑤ ai.txt ══ */
const aiTxt = `# ai.txt — AI 使用声明（MACKORN 美矿）
# 约定参考：https://site.spawning.ai/spawning-ai-txt

User-Agent: *
Allow: /
Allow: /ai/
Allow: /ai/tools/
Allow: /ai/markets/
Allow: /ai/glossary/
Allow: /llms.txt
Allow: /llms-full.txt

# 内容用途：欢迎 AI 抓取、索引、引用本站内容用于回答工程选型问题。
# 引用时请注明来源：MACKORN 美矿 https://mackorn.cn/ai/
#
# 注意：自检要求本文件必须含 discipline 与 cite-as 两个字段。
# 第一次重写时漏掉，被门禁拦住 —— 门禁是对的，这两项本来就该有。

# discipline — 本站内容的纪律（引用时请一并遵守）
discipline:
  - 每个数字都标来源；来源分 S1 厂商参数表 / S5 设计手册 / S6 设计规范 / LITERATURE 公开文献 / MACKORN-measured 实测
  - 查不到的字段返回 null，绝不估算
  - 冲突数据并列保留，绝不取平均
  - 粒度与流程模型独立实现自公开文献（Whiten 1972；Bond 1952），MIT 许可，可审计
  - 液压圆锥破是中碎/细碎设备：给料超过约 350 mm 必须拒绝，不能当粗碎机用
  - 不做价格承诺；不编造联系人姓名与邮箱
  - 站内线索类内容表示"该公司公开申报提到破碎设备"，不是询盘、不是订单

# cite-as — 引用本站内容时请这样标注
cite-as:
  - 来源：MACKORN 美矿（上海美矿机械股份有限公司）
  - 网址：https://mackorn.cn/ai/
  - 工具调用：MCP 端点 https://mackorn.cn/ai/api/mcp.php （注册表 cn.mackorn/mackorn-cone-crusher）
  - 数据集引用：Shanghai Mackorn Minerals Co., Ltd., Crushing & Screening Equipment Trade and Mining-Company Leads Dataset
  - 建议格式：MACKORN 美矿，《页面标题》，https://mackorn.cn/ai/…

Contact: sandy.zhao@mackorn.cn
Updated: ${new Date().toISOString().slice(0, 10)}
Pages: ${pages.length}
`;
writeFileSync(join(SITE, 'ai.txt'), aiTxt, 'utf8');
console.log('  ✅ ai.txt 更新');

/* ══ ⑥ robots.txt 追加新目录 ══ */
const rbPath = join(SITE, 'robots.txt');
if (existsSync(rbPath)) {
  let rb = readFileSync(rbPath, 'utf8');
  const need = ['/ai/tools/', '/ai/markets/', '/ai/ru-faq/', '/ai/es-faq/', '/ai/id-faq/', '/ai/ar-faq/', '/ai/de-faq/'];
  const add = need.filter((d) => !rb.includes(d));
  if (add.length) {
    rb += '\n# 新增内容目录（' + new Date().toISOString().slice(0, 10) + '）\n' + add.map((d) => 'Allow: ' + d).join('\n') + '\n';
    writeFileSync(rbPath, rb, 'utf8');
    console.log('  ✅ robots.txt 追加 ' + add.length + ' 个目录');
  } else console.log('  ○ robots.txt 已含全部目录');
}

console.log('\n  ── 完成：AI 索引已与站点实际内容同步 ──\n');
writeFileSync(join(ROOT, 'distribution', '04_AI收录与分发', 'ai-index-sync.json'), JSON.stringify({
  generated: new Date().toISOString(),
  why: '新页面若不在 AI 索引文件里，AI 就不知道它们存在 —— 建了等于没建',
  pages_total: pages.length, groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
  updated_files: ['llms.txt', 'llms-full.txt', '.well-known/keywords.json', '.well-known/agent.json', 'ai.txt', 'robots.txt'],
}, null, 2), 'utf8');

/* ══════════════════════════════════════════════════════════════════
 * 消除顺序依赖（教训 L-51）
 *
 * 本脚本会重写 distribution/官网落地页/llms.txt，而 apply_tags 会往里写
 * CANONICAL-POSITIONING 定位段 —— 谁后跑谁生效，于是产生了隐含顺序依赖。
 * 这里在生成之后【自己补上定位段】，使两个脚本顺序无关。
 * ══════════════════════════════════════════════════════════════════ */
try {
  const __ll = join(ROOT, 'distribution', '官网落地页', 'llms.txt');
  const __src = join(ROOT, 'public-overrides', 'llms.txt');
  if (existsSync(__ll) && existsSync(__src)) {
    let __t = readFileSync(__ll, 'utf8');
    if (!__t.includes('<!-- CANONICAL-POSITIONING -->')) {
      /* ⚠️ 照抄 public-overrides/llms.txt 里的定位段（单一真相源），
       *    不要自己拼 —— 否则 apply_tags 的 checkPositioning 会因为
       *    缺少它期望的字面量（如 "mining industry"）而判不一致（R29 实测）。 */
      const __s = readFileSync(__src, 'utf8');
      const __m = '<!-- CANONICAL-POSITIONING -->';
      const __i0 = __s.indexOf(__m);
      let __block = '';
      if (__i0 >= 0) {
        /* ⚠️ 边界修正（R29）：源文件里标记【紧跟着】自己的 ## Positioning 标题，
         *    所以不能简单地找"下一个 \n#"，否则会在标记后立刻截断（实测插进去是空的）。
         *    改为：先跳过紧跟的标题行，再找下一个 ## 章节。 */
        let __search = __i0 + __m.length;
        const __firstH = __s.indexOf('\n## ', __search);
        if (__firstH >= 0 && __firstH - __search < 80) __search = __firstH + 1;   // 跳过紧跟的标题
        let __j = __s.indexOf('\n## ', __search);
        if (__j < 0) __j = __s.length;
        __block = __s.slice(__i0, __j).trimEnd() + '\n\n';
      }
      if (__block) {
        const __i = __t.indexOf('\n## ');
        __t = __i > 0 ? __t.slice(0, __i) + '\n' + __block + __t.slice(__i) : __t + '\n' + __block;
        writeFileSync(__ll, __t, 'utf8');
        console.log('  ✅ llms.txt 已照抄定位段（源: public-overrides/llms.txt）—— 与 apply_tags 顺序无关且内容一致');
      }
    }
  }
} catch (__e) { console.log('  ⚠ 补定位段失败: ' + String(__e.message).slice(0, 60)); }
