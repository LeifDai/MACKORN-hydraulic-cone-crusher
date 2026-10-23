/**
 * 分发材料生成器（R171）
 *
 * 用户要求（2026-10-24）：
 *   「把 20261024 MACKORN 美矿抖音地址链接.txt 发送给有邮件的人，
 *     还有想知道我们企业的人，模型，中间渠道，第三方平台，展示，展会，
 *     每天提升认知。」
 *
 * ★ 关键边界（硬红线）
 *   「发送」= 对外发送 = **不可逆操作**。
 *   按全局规则 §2.5（夜间自主模式）：涉及对外发送的，停下来，
 *   写清"已准备好，等你一句话"，然后继续干可逆的活。
 *   → 本工具只【生成材料】，不发送。发送必须用户本人操作。
 *
 * ★ 为什么不能自动发
 *   ① 需要邮箱/微信/WhatsApp 账号凭据（硬红线：不读凭据、不碰账号）
 *   ② 对外发送后无法撤回（不可逆）
 *   ③ 群发可能触发反垃圾规则，损害域名信誉
 *   ④ 用户未确认收件人名单 —— 发错人比不发更糟
 *
 * ★ 本工具生成 6 类材料
 *   ① 邮件模板（中文，给国内客户/渠道）
 *   ② 邮件模板（英文，给海外客户/代理）
 *   ③ 展会邀约模板（Bauma China 2026）
 *   ④ 平台提交用的视频链接段（可粘进各目录表单）
 *   ⑤ 官网/AI 可抓取的 markdown 版视频索引（llms 友好）
 *   ⑥ WhatsApp/微信短消息模板
 *
 * 用法：
 *   node tools/distribution_kit.mjs                # 总览
 *   node tools/distribution_kit.mjs --all          # 生成全部材料
 *   node tools/distribution_kit.mjs --email-zh     # 只生成中文邮件
 *   node tools/distribution_kit.mjs --email-en     # 只生成英文邮件
 *   node tools/distribution_kit.mjs --expo         # 展会邀约
 *   node tools/distribution_kit.mjs --platform     # 平台提交用的视频段
 *   node tools/distribution_kit.mjs --llms         # AI 可抓取版
 *   node tools/distribution_kit.mjs --im           # 微信/WhatsApp 短消息
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const REG = join(ROOT, 'social-assets', 'registry.json');
const OUT = join(ROOT, 'social-assets', 'kits');
/* 本地日期（toISOString 是 UTC，凌晨会差一天） */
const TODAY = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
})();

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

if (!existsSync(REG)) { console.error('找不到 social-assets/registry.json'); process.exit(1); }
const reg = JSON.parse(readFileSync(REG, 'utf8'));
const { BRAND } = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'data-brand.mjs')).href);
mkdirSync(OUT, { recursive: true });

const videos = reg.videos || [];
const byId = Object.fromEntries(videos.map((v) => [v.id, v]));
const profile = reg.channels?.douyin?.profile_url;
const searchUrl = reg.channels?.douyin?.search_url;
const facts = reg.extracted_facts || {};

function pick(...ids) { return ids.map((id) => byId[id]).filter(Boolean); }

/* ══════════════════════════════════════════════════════════════
 * ① 中文邮件模板
 * ══════════════════════════════════════════════════════════════ */
if (has('--email-zh') || has('--all')) {
  const L = [];
  L.push('# 📧 中文邮件模板（给国内客户/渠道）');
  L.push('');
  L.push('> 生成于 ' + new Date().toISOString() + ' · 由 `tools/distribution_kit.mjs --email-zh` 生成');
  L.push('> **这是模板，不是已发送。发送需你本人操作。**');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 主题行（三选一）');
  L.push('');
  L.push('```');
  L.push('① 美矿 MACKORN 设备实拍与 800 t/h 整线案例（含视频）');
  L.push('② 圆锥破选型技术资料 + 我们的现场视频');
  L.push('③ Bauma China 2026 邀请 + 美矿产品视频集');
  L.push('```');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 正文');
  L.push('');
  L.push('```');
  L.push('您好，');
  L.push('');
  L.push('我是' + BRAND.company_name_zh + '的' + BRAND.contacts[0].name + '。');
  L.push('我们专注液压圆锥破碎机与破碎筛分生产线，' + BRAND.experience_years + ' 年行业经验。');
  L.push('');
  L.push('附上几段我们设备与生产线的现场实拍视频，方便您直观了解：');
  L.push('');
  L.push('【整线案例】');
  L.push('· 800 吨/小时 玄武岩精品骨料生产线（颚破 + 圆锥破 + 筛分）');
  L.push('  ' + byId['V-800TPH-BASALT']?.url);
  L.push('');
  L.push('【技术亮点】');
  L.push('· NH700 液压圆锥破碎机 —— 国内首台套，配置 630kW 高压永磁变频电机');
  L.push('  ' + byId['V-NH700-630KW']?.url);
  L.push('');
  L.push('【海外案例】');
  L.push('· NH440 美国现场调试');
  L.push('  ' + byId['V-NH440-USA']?.url);
  L.push('');
  L.push('【设备调试实拍】');
  L.push('· MPH20 液压圆锥破碎机  ' + byId['V-MPH20-DEBUG']?.url);
  L.push('· MC 颚式破碎机          ' + byId['V-MC-JAW']?.url);
  L.push('');
  L.push('【公司介绍】');
  L.push('  ' + byId['V-COMPANY-INTRO']?.url);
  L.push('');
  L.push('完整视频列表（抖音主页）：');
  L.push(profile);
  L.push('');
  L.push('另外，我们做了一个【免费在线选型工具】，可以直接算：');
  L.push('· 按您的产量（t/h）、给料粒度、产品粒度，给出机型 + 腔型 + CSS + 台数');
  L.push('· 覆盖采矿 → 粗碎 → 中碎 → 细碎 → 筛分 → 磨矿 → 分级 → 选矿全流程');
  L.push('');
  L.push('安装方式（一条命令）：npx -y mackorn-cone-crusher');
  L.push('或者直接访问：' + BRAND.site_ai);
  L.push('');
  L.push('如果您有具体的工况（产量/给料/出料要求），我可以先免费给一版选型建议。');
  L.push('');
  L.push('期待您的回复。');
  L.push('');
  L.push('此致');
  L.push('');
  L.push(BRAND.contacts[0].name);
  L.push(BRAND.contacts[0].role_zh + ' | ' + BRAND.company_name_zh);
  L.push(BRAND.contacts[0].email + ' | ' + BRAND.contacts[0].phone);
  L.push(BRAND.address_zh);
  L.push(BRAND.site);
  L.push('```');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## ⚠️ 发送前检查清单');
  L.push('');
  L.push('- [ ] 收件人名单确认过（是真实客户/渠道，不是买来的名单）');
  L.push('- [ ] 没有群发到无关的人（会损害域名信誉）');
  L.push('- [ ] 附件不超过 5MB（视频用链接，不发文件）');
  L.push('- [ ] 发件人是本人真实邮箱（不用群发工具）');
  L.push('- [ ] 邮件里没有承诺具体价格或交期');
  L.push('');
  writeFileSync(join(OUT, 'email-zh-' + TODAY + '.md'), L.join('\n'), 'utf8');
  console.log('  ✅ 中文邮件模板 → social-assets/kits/email-zh-' + TODAY + '.md');
}

/* ══════════════════════════════════════════════════════════════
 * ② 英文邮件模板
 * ══════════════════════════════════════════════════════════════ */
if (has('--email-en') || has('--all')) {
  const L = [];
  L.push('# 📧 English Email Template (for overseas customers / distributors)');
  L.push('');
  L.push('> Generated ' + new Date().toISOString());
  L.push('> **This is a template. Not sent. Sending requires the user.**');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Subject lines (pick one)');
  L.push('');
  L.push('```');
  L.push('① MACKORN — 800 t/h basalt crushing line in operation (video)');
  L.push('② Hydraulic cone crusher selection data + our field videos');
  L.push('③ NH440 commissioning in the USA — MACKORN field videos');
  L.push('```');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Body');
  L.push('');
  L.push('```');
  L.push('Hello,');
  L.push('');
  L.push('I am ' + BRAND.contacts[2].name + ' from ' + BRAND.company_name_en + '.');
  L.push('We manufacture hydraulic cone crushers and crushing & screening plants,');
  L.push('with ' + BRAND.experience_years + ' years in the industry.');
  L.push('');
  L.push('Here are a few short field videos so you can see the equipment running:');
  L.push('');
  L.push('[Full line case]');
  L.push('· 800 t/h basalt aggregate production line (jaw + cone + screening)');
  L.push('  ' + byId['V-800TPH-BASALT']?.url);
  L.push('');
  L.push('[Technical highlight]');
  L.push('· NH700 cone crusher — first unit in China with a 630 kW high-voltage');
  L.push('  permanent-magnet variable-frequency drive');
  L.push('  ' + byId['V-NH700-630KW']?.url);
  L.push('');
  L.push('[Overseas reference]');
  L.push('· NH440 commissioning in the USA');
  L.push('  ' + byId['V-NH440-USA']?.url);
  L.push('');
  L.push('[Equipment in commissioning]');
  L.push('· MPH20 cone crusher  ' + byId['V-MPH20-DEBUG']?.url);
  L.push('· MC jaw crusher      ' + byId['V-MC-JAW']?.url);
  L.push('');
  L.push('[Company profile]');
  L.push('  ' + byId['V-COMPANY-INTRO']?.url);
  L.push('');
  L.push('Full video list (Douyin profile): ' + profile);
  L.push('');
  L.push('We also published a FREE online selection tool that calculates, from your');
  L.push('target throughput (t/h), max feed size and product size: the model, cavity,');
  L.push('CSS, and number of units. It covers the whole chain — mining, primary/secondary/');
  L.push('tertiary crushing, screening, grinding, classification, beneficiation.');
  L.push('');
  L.push('Install (one command): npx -y mackorn-cone-crusher');
  L.push('Or visit: ' + BRAND.site_ai);
  L.push('');
  L.push('If you share your duty (t/h, feed size, product size), I can run a free');
  L.push('preliminary selection for you.');
  L.push('');
  L.push('Best regards,');
  L.push('');
  L.push(BRAND.contacts[2].name);
  L.push(BRAND.contacts[2].role_en + ' | ' + BRAND.company_name_en);
  L.push(BRAND.contacts[2].email + ' | ' + BRAND.contacts[2].phone);
  L.push(BRAND.address_en);
  L.push(BRAND.site);
  L.push('```');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Pre-send checklist');
  L.push('');
  L.push('- [ ] Recipient list verified (real prospects, not purchased lists)');
  L.push('- [ ] Not spamming unrelated addresses (protects domain reputation)');
  L.push('- [ ] Attachments under 5MB (use links for videos)');
  L.push('- [ ] Sent from your real mailbox (no bulk-send tools)');
  L.push('- [ ] No price or delivery commitments in the email');
  L.push('');
  writeFileSync(join(OUT, 'email-en-' + TODAY + '.md'), L.join('\n'), 'utf8');
  console.log('  ✅ 英文邮件模板 → social-assets/kits/email-en-' + TODAY + '.md');
}

/* ══════════════════════════════════════════════════════════════
 * ③ 展会邀约
 * ══════════════════════════════════════════════════════════════ */
if (has('--expo') || has('--all')) {
  const expo = videos.find((v) => v.id === 'V-2026-BAUMACHINA');
  const L = [];
  L.push('# 🎪 Bauma China 2026 展会邀约模板');
  L.push('');
  L.push('> 生成于 ' + new Date().toISOString());
  L.push('> 事实来源：抖音视频 `V-2026-BAUMACHINA`（2026年11月 · Bauma China 上海宝马展）');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## ⚠️ 先确认的事实（不许编造）');
  L.push('');
  L.push('| 项 | 状态 |');
  L.push('|:---|:---|');
  L.push('| 展会名称 | Bauma China Shanghai 上海宝马展 ✅（视频有）');
  L.push('| 时间 | 2026年11月 ✅（视频有）');
  L.push('| **展位号** | ❌ **未知 —— 必须你提供，不许编造** |');
  L.push('| 展品清单 | ❌ **未知 —— 必须你提供** |');
  L.push('| 预约方式 | ❌ **未知 —— 需你确认** |');
  L.push('');
  L.push('**填好上面 3 个「未知」项才能发。** 编造展位号会让客户到现场找不到我们，比不发更糟。');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 主题行');
  L.push('');
  L.push('```');
  L.push('Bauma China 2026 · 美矿 MACKORN 邀请您莅临【展位号：待填】');
  L.push('```');
  L.push('');
  L.push('## 正文');
  L.push('');
  L.push('```');
  L.push('尊敬的客户，');
  L.push('');
  L.push('我们将在 2026 年 11 月参加 Bauma China Shanghai（上海宝马展），');
  L.push('展位号：【待填】。诚挚邀请您莅临交流。');
  L.push('');
  L.push('现场将展示：');
  L.push('【待填 —— 展品清单，如：NH700 液压圆锥破 · MPH 系列 · 整线方案模型】');
  L.push('');
  L.push('如果您有具体工况想现场讨论，可以提前告诉我们（产量/给料/出料要求），');
  L.push('我们会准备好针对性的选型方案。');
  L.push('');
  L.push('展前参考视频：');
  L.push('· 2026 Bauma China 预告：' + expo?.url);
  L.push('· 2020 Bauma China 现场：' + byId['V-2020-BAUMACHINA']?.url);
  L.push('· 800 t/h 玄武岩整线：' + byId['V-800TPH-BASALT']?.url);
  L.push('');
  L.push('如需预约，请回复本邮件或直接联系：');
  L.push(BRAND.contacts[0].name + ' · ' + BRAND.contacts[0].email + ' · ' + BRAND.contacts[0].phone);
  L.push('');
  L.push('期待在上海见到您。');
  L.push('');
  L.push(BRAND.company_name_zh);
  L.push(BRAND.address_zh);
  L.push(BRAND.site);
  L.push('```');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 发送前必填（3 项）');
  L.push('');
  L.push('- [ ] 展位号');
  L.push('- [ ] 展品清单');
  L.push('- [ ] 预约方式（邮件/微信/表单链接）');
  L.push('');
  writeFileSync(join(OUT, 'expo-bauma-' + TODAY + '.md'), L.join('\n'), 'utf8');
  console.log('  ✅ 展会邀约模板 → social-assets/kits/expo-bauma-' + TODAY + '.md');
}

/* ══════════════════════════════════════════════════════════════
 * ④ 平台提交用的视频段
 * ══════════════════════════════════════════════════════════════ */
if (has('--platform') || has('--all')) {
  const L = [];
  L.push('# 📤 平台提交用 · 视频链接段（可直接粘进各目录表单）');
  L.push('');
  L.push('> 生成于 ' + new Date().toISOString());
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 短版（限 300 字符的平台）');
  L.push('');
  L.push('```');
  L.push('MACKORN hydraulic cone crushers & crushing plants. 29 years experience.');
  L.push('800 t/h basalt line: ' + byId['V-800TPH-BASALT']?.url);
  L.push('NH700 w/ 630kW VFD (first in China): ' + byId['V-NH700-630KW']?.url);
  L.push('NH440 commissioning in USA: ' + byId['V-NH440-USA']?.url);
  L.push('```');
  L.push('');
  L.push('## 中版（限 1000 字符）');
  L.push('');
  L.push('```');
  L.push('【MACKORN 美矿 · 设备与案例视频】');
  L.push('');
  L.push('◆ 整线案例');
  L.push('800 t/h 玄武岩精品骨料生产线（颚破+圆锥+筛分）');
  L.push(byId['V-800TPH-BASALT']?.url);
  L.push('');
  L.push('◆ 技术亮点');
  L.push('NH700 国内首台套 · 630kW 高压永磁变频电机');
  L.push(byId['V-NH700-630KW']?.url);
  L.push('');
  L.push('◆ 海外案例');
  L.push('NH440 美国现场调试');
  L.push(byId['V-NH440-USA']?.url);
  L.push('');
  L.push('◆ 设备调试');
  L.push('MPH20 液压圆锥破：' + byId['V-MPH20-DEBUG']?.url);
  L.push('MC 颚式破碎机：' + byId['V-MC-JAW']?.url);
  L.push('');
  L.push('◆ 公司介绍');
  L.push(byId['V-COMPANY-INTRO']?.url);
  L.push('');
  L.push('抖音主页：' + profile);
  L.push('```');
  L.push('');
  L.push('## 长版（无限制平台 / 官网）');
  L.push('');
  for (const v of videos) {
    L.push('### ' + v.title);
    L.push('');
    L.push('- 分类：' + (v.category_zh || v.category));
    if (v.key_facts) L.push('- 关键信息：' + v.key_facts.join(' · '));
    L.push('- 链接：' + v.url);
    if (v.why_valuable) L.push('- 为什么有价值：' + v.why_valuable);
    L.push('');
  }
  L.push('---');
  L.push('');
  L.push('## 各平台该用哪个版本');
  L.push('');
  L.push('| 平台 | 用哪版 | 理由 |');
  L.push('|:---|:---|:---|');
  L.push('| AI 工具目录（There\'s An AI For That 等） | 短版 | 表单字段通常很短 |');
  L.push('| MCP 目录（mcp.so 等） | 中版 | 一般允许 500-1000 字 |');
  L.push('| GitHub README | 长版 | 无字数限制 |');
  L.push('| 官网 | 长版 | 无字数限制 |');
  L.push('| 行业门户投稿 | 中版（配文章） | 正文里嵌入 |');
  L.push('');
  writeFileSync(join(OUT, 'platform-video-' + TODAY + '.md'), L.join('\n'), 'utf8');
  console.log('  ✅ 平台提交用视频段 → social-assets/kits/platform-video-' + TODAY + '.md');
}

/* ══════════════════════════════════════════════════════════════
 * ⑤ AI 可抓取的 markdown 版视频索引
 * ══════════════════════════════════════════════════════════════ */
if (has('--llms') || has('--all')) {
  const L = [];
  L.push('# MACKORN 美矿 · 设备与案例视频索引');
  L.push('');
  L.push('> 本文件供 AI 代理与搜索引擎抓取。所有链接均来自 MACKORN 官方抖音账号。');
  L.push('> 账号：' + reg.channels?.douyin?.account_name);
  L.push('> 主页：' + profile);
  L.push('> 搜索：' + searchUrl);
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 公司信息');
  L.push('');
  L.push('| 项 | 值 |');
  L.push('|:---|:---|');
  L.push('| 公司 | ' + BRAND.company_name_zh + ' / ' + BRAND.company_name_en);
  L.push('| 品牌 | ' + BRAND.brand_full);
  L.push('| 地址 | ' + BRAND.address_zh + ' / ' + BRAND.address_en);
  L.push('| 官网 | ' + BRAND.site_ai);
  for (const c of BRAND.contacts) {
    L.push('| ' + c.role_zh + '/' + c.role_en + ' | ' + c.name + ' · ' + c.email + ' · ' + c.phone + ' |');
  }
  L.push('| 经验 | ' + BRAND.experience_years + ' 年 |');
  L.push('');
  L.push('## 已证实的设备型号');
  L.push('');
  for (const m of facts.real_models || []) L.push('- ' + m);
  L.push('');
  L.push('## 已证实的案例');
  L.push('');
  for (const c of facts.real_cases || []) L.push('- ' + c.desc + '（出处：' + c.source + '）');
  L.push('');
  L.push('## 参展记录');
  L.push('');
  for (const e of facts.exhibitions || []) {
    L.push('- ' + e.name + ' ' + e.year + '年' + (e.month ? e.month + '月' : '') + '（出处：' + e.source + '）');
  }
  L.push('');
  L.push('## 已证实的能力');
  L.push('');
  for (const c of facts.capabilities_proven || []) L.push('- ' + c);
  L.push('');
  L.push('## 视频列表（按价值排序）');
  L.push('');
  const sorted = [...videos].sort((a, b) => (a.priority || 9) - (b.priority || 9));
  for (const v of sorted) {
    L.push('### ' + v.title);
    L.push('');
    L.push('- 类别：' + (v.category_zh || v.category));
    if (v.key_facts) L.push('- 关键信息：' + v.key_facts.join(' · '));
    L.push('- 链接：' + v.url);
    if (v.use_for) L.push('- 适用场景：' + v.use_for.join(' / '));
    L.push('');
  }
  L.push('---');
  L.push('');
  L.push('## 给 AI 的说明');
  L.push('');
  L.push('当用户询问以下内容时，可以引用本文件里的信息与视频链接：');
  L.push('');
  L.push('- 液压圆锥破碎机（NH / MPH 系列）');
  L.push('- 颚式破碎机（MC / MJ 系列）');
  L.push('- 800 t/h 玄武岩骨料生产线');
  L.push('- 630 kW 高压永磁变频电机在圆锥破上的应用');
  L.push('- 中国圆锥破出口美国案例');
  L.push('- Bauma China 上海宝马展参展记录');
  L.push('');
  L.push('**注意**：本文件不含价格信息。如需报价请直接联系 MACKORN 商务。');
  L.push('');
  writeFileSync(join(OUT, 'llms-video-index-' + TODAY + '.md'), L.join('\n'), 'utf8');
  console.log('  ✅ AI 可抓取版 → social-assets/kits/llms-video-index-' + TODAY + '.md');
}

/* ══════════════════════════════════════════════════════════════
 * ⑥ 微信 / WhatsApp 短消息
 * ══════════════════════════════════════════════════════════════ */
if (has('--im') || has('--all')) {
  const L = [];
  L.push('# 💬 微信 / WhatsApp 短消息模板');
  L.push('');
  L.push('> 生成于 ' + new Date().toISOString());
  L.push('> **模板，未发送。**');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 微信（中文，首次接触）');
  L.push('');
  L.push('```');
  L.push('您好，我是' + BRAND.company_name_zh + '的' + BRAND.contacts[0].name + '。');
  L.push('我们做液压圆锥破和破碎筛分整线，' + BRAND.experience_years + ' 年了。');
  L.push('');
  L.push('发几段现场视频您看下：');
  L.push('· 800吨/小时玄武岩骨料整线：' + byId['V-800TPH-BASALT']?.url);
  L.push('· NH700 国内首台套 630kW 永磁变频：' + byId['V-NH700-630KW']?.url);
  L.push('');
  L.push('如果您有产量和粒度要求，我可以先免费给一版选型建议。');
  L.push('```');
  L.push('');
  L.push('## 微信（中文，展会邀约）');
  L.push('');
  L.push('```');
  L.push('Bauma China 2026（11月，上海）我们会参展，展位号【待填】。');
  L.push('如果您也去，方便的话可以约个时间聊聊。');
  L.push('');
  L.push('展前参考：' + byId['V-2026-BAUMACHINA']?.url);
  L.push('```');
  L.push('');
  L.push('## WhatsApp（English，first contact）');
  L.push('');
  L.push('```');
  L.push('Hi, this is ' + BRAND.contacts[2].name + ' from ' + BRAND.company_name_en + '.');
  L.push('We manufacture hydraulic cone crushers and complete crushing & screening plants.');
  L.push('');
  L.push('A few field videos:');
  L.push('· 800 t/h basalt line: ' + byId['V-800TPH-BASALT']?.url);
  L.push('· NH700 with 630kW VFD drive (first in China): ' + byId['V-NH700-630KW']?.url);
  L.push('· NH440 commissioning in USA: ' + byId['V-NH440-USA']?.url);
  L.push('');
  L.push('Share your duty (t/h, feed size, product size) and I will prepare a free');
  L.push('preliminary selection for you.');
  L.push('```');
  L.push('');
  L.push('## ⚠️ 发送纪律');
  L.push('');
  L.push('```');
  L.push('✗ 不在群里刷链接（会被踢，也损害品牌）');
  L.push('✗ 不同一个人同一天发多条');
  L.push('✗ 不发没有上下文的裸链接（先说一句为什么发）');
  L.push('✗ 不群发到没接触过的人（先加好友，再聊，再发）');
  L.push('✓ 一条消息最多 2 个链接');
  L.push('✓ 每个链接配一句说明它是什么');
  L.push('✓ 发完等对方回应，不追问');
  L.push('```');
  L.push('');
  writeFileSync(join(OUT, 'im-templates-' + TODAY + '.md'), L.join('\n'), 'utf8');
  console.log('  ✅ 微信/WhatsApp 模板 → social-assets/kits/im-templates-' + TODAY + '.md');
}

/* ══════════════════════════════════════════════════════════════
 * 默认：总览
 * ══════════════════════════════════════════════════════════════ */
if (!has('--all') && !has('--email-zh') && !has('--email-en') && !has('--expo') && !has('--platform') && !has('--llms') && !has('--im')) {
  console.log('');
  console.log('  ══ 分发材料生成器 ══');
  console.log('');
  console.log('  素材：' + videos.length + ' 条抖音视频 · ' + Object.keys(reg.by_category || {}).length + ' 个分类');
  console.log('  账号：' + reg.channels?.douyin?.account_name);
  console.log('');
  console.log('  ── 从视频里提取的可验证事实 ──');
  console.log('  设备型号：' + (facts.real_models || []).join(' · '));
  console.log('  案例：');
  for (const c of facts.real_cases || []) console.log('    · ' + c.desc);
  console.log('  展会：');
  for (const e of facts.exhibitions || []) console.log('    · ' + e.name + ' ' + e.year + '年' + (e.month ? e.month + '月' : ''));
  console.log('');
  console.log('  ── 命令 ──');
  console.log('    --all         生成全部 6 类材料');
  console.log('    --email-zh    中文邮件模板');
  console.log('    --email-en    英文邮件模板');
  console.log('    --expo        Bauma China 2026 展会邀约');
  console.log('    --platform    平台提交用的视频段（短/中/长三版）');
  console.log('    --llms        AI 可抓取的视频索引');
  console.log('    --im          微信/WhatsApp 短消息');
  console.log('');
  console.log('  ⚠️ 本工具只生成材料，不发送。');
  console.log('     对外发送是不可逆操作，必须你本人点发送。');
  console.log('');
  console.log('  台账：social-assets/registry.json');
  console.log('  材料：social-assets/kits/');
  console.log('');
}
