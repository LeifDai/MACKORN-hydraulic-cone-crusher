/**
 * 引流工作器（R165）
 *
 * 用户要求（2026-10-23）：
 *   「请不断撰写美文，投递到各个平台，并不断更新，加强各个媒体及网站的引流，
 *     请写进引流工作器，并不断的更新，请编程。」
 *
 * ★ 这个工具做什么 / 不做什么
 *   做：选题池管理 · 多平台文体生成 · 发布日历 · 状态追踪 · 已发文稿库
 *   不做：自动投递（需账号 + 违反社区规则），最后一击由人点
 *
 * ★ 核心方法论：一素材多文体
 *   同一份技术洞察（如"细碎台数爆炸"），写成：
 *     · 行业门户版 = 严谨工程文（1500-3000 字，克制，不推销）
 *     · 知乎版     = 经验分享（设问 + 类比 + 案例）
 *     · DEV.to 版  = 技术复盘（第一人称，承认错误）
 *     · 目录版     = 一句话卖点 + 3-5 特性
 *
 * ★ 铁律（写进代码，不许绕）
 *   ① 不写营销垃圾：每篇必须有真实技术内容（数据/方法/踩坑）
 *   ② 不编造数据：文中的每个数字必须能在仓库里找到出处
 *   ③ 不泄露定价：MACKORN 报价截图/价格表绝不进公开文章
 *   ④ 不刷屏：同一平台按 calendar.policy 的节奏
 *   ⑤ 社区先参与再发：Reddit/HN 先讨论 2 周
 *
 * 用法：
 *   node tools/traffic_engine.mjs                 # 总览
 *   node tools/traffic_engine.mjs --topics        # 选题池
 *   node tools/traffic_engine.mjs --outline T-001 # 看某选题的大纲
 *   node tools/traffic_engine.mjs --write T-001 --platform 知乎   # 生成文稿骨架
 *   node tools/traffic_engine.mjs --calendar      # 发布日历
 *   node tools/traffic_engine.mjs --drafts        # 看已生成文稿
 *   node tools/traffic_engine.mjs --record --topic T-003 --platform "DEV.to" --url <url>
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const REG = join(ROOT, 'traffic-registry', 'registry.json');
const DRAFTS = join(ROOT, 'traffic-registry', 'drafts');
const TODAY = new Date().toISOString().slice(0, 10);

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };

if (!existsSync(REG)) { console.error('找不到 traffic-registry/registry.json'); process.exit(1); }
const reg = JSON.parse(readFileSync(REG, 'utf8'));
mkdirSync(DRAFTS, { recursive: true });

const topics = reg.topics || [];
const formats = reg.platform_formats || {};

/* ══════════════════════════════════════════════════════════════
 * --topics  选题池
 * ══════════════════════════════════════════════════════════════ */
if (has('--topics')) {
  console.log('');
  console.log('  ══ 选题池（' + topics.length + ' 个）══');
  console.log('');
  for (const t of topics.sort((a, b) => (a.priority || 9) - (b.priority || 9))) {
    const icon = t.status === 'draft-ready' ? '📝' : t.status === 'idea' ? '💡'
      : t.status === 'published' ? '✅' : '·';
    console.log('  ' + icon + ' [' + String(t.priority || 9) + '] ' + t.id + ' ' + t.title_cn);
    console.log('      角度: ' + t.angle + ' · 状态: ' + t.status);
    console.log('      钩子: ' + String(t.hook).slice(0, 90));
    console.log('      目标平台: ' + (t.target_platforms || []).join(' / '));
    console.log('');
  }
  console.log('  素材库（' + (reg.asset_inventory?.unique_assets || []).length + ' 项独有资产）:');
  for (const a of reg.asset_inventory?.unique_assets || []) {
    console.log('  · ' + a.id + ' ' + a.name);
  }
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --outline <topicId>
 * ══════════════════════════════════════════════════════════════ */
if (has('--outline')) {
  const id = argv[argv.indexOf('--outline') + 1];
  const t = topics.find((x) => x.id === id);
  if (!t) { console.error('找不到选题: ' + id); process.exit(1); }
  console.log('');
  console.log('  ══ ' + t.id + ' ══');
  console.log('');
  console.log('  中文标题: ' + t.title_cn);
  console.log('  英文标题: ' + t.title_en);
  console.log('  角度: ' + t.angle);
  console.log('  ★ 钩子: ' + t.hook);
  console.log('');
  console.log('  ── 大纲 ──');
  (t.body_outline || []).forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s));
  console.log('');
  console.log('  用了哪些独有资产: ' + (t.assets || []).join(', '));
  const assets = reg.asset_inventory?.unique_assets || [];
  for (const aid of t.assets || []) {
    const a = assets.find((x) => x.id === aid);
    if (a) {
      console.log('    · ' + a.id + ' ' + a.name);
      console.log('      为什么独有: ' + a.why_unique);
      if (a.risk) console.log('      ⚠ 风险: ' + a.risk);
    }
  }
  console.log('');
  console.log('  目标平台: ' + (t.target_platforms || []).join(' / '));
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --write <topicId> --platform <平台类型>
 * ══════════════════════════════════════════════════════════════ */
if (has('--write')) {
  const id = argv[argv.indexOf('--write') + 1];
  const t = topics.find((x) => x.id === id);
  if (!t) { console.error('找不到选题: ' + id); process.exit(1); }
  const plat = val('--platform');
  if (!plat) { console.error('需要 --platform <平台类型>（可选: ' + Object.keys(formats).join(' / ') + '）'); process.exit(1); }
  const fmt = formats[plat];
  if (!fmt) { console.error('未知平台类型: ' + plat + '。可选: ' + Object.keys(formats).join(' / ')); process.exit(1); }

  /* 禁止：漏掉风险提示 */
  const assets = reg.asset_inventory?.unique_assets || [];
  const risks = (t.assets || []).map((a) => assets.find((x) => x.id === a)).filter(Boolean).filter((a) => a.risk);

  const lines = [];
  lines.push('# ' + (plat === 'AI工具目录' || plat === 'Hacker News' ? t.title_en : t.title_cn));
  lines.push('');
  lines.push('> **文稿骨架** · 由 `tools/traffic_engine.mjs --write` 生成 · ' + new Date().toISOString());
  lines.push('> 选题：`' + t.id + '` · 平台类型：**' + plat + '** · 状态：drafting');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 写作要求（平台适配）');
  lines.push('');
  lines.push('| 项 | 要求 |');
  lines.push('|:---|:---|');
  lines.push('| 语气 | ' + fmt.tone + ' |');
  lines.push('| 长度 | ' + fmt.length + ' |');
  lines.push('| 结构 | ' + fmt.structure + ' |');
  lines.push('| 必须包含 | ' + fmt.must_include + ' |');
  lines.push('| 必须避免 | ' + fmt.must_avoid + ' |');
  lines.push('| 行动号召 | ' + fmt.call_to_action + ' |');
  lines.push('| 目标平台举例 | ' + (fmt.examples || []).join(', ') + ' |');
  lines.push('');
  if (risks.length) {
    lines.push('## ⚠️ 发布前必须处理的风险');
    lines.push('');
    for (const r of risks) {
      lines.push('- **' + r.id + ' ' + r.name + '**');
      lines.push('  - 风险：' + r.risk);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('## 钩子（第一段就要抓住人）');
  lines.push('');
  lines.push('> ' + t.hook);
  lines.push('');
  lines.push('## 正文大纲');
  lines.push('');
  (t.body_outline || []).forEach((s, i) => {
    lines.push('### ' + (i + 1) + '. ' + s);
    lines.push('');
    lines.push('<!-- 在这里写。要点：');
    lines.push('     · 必须有可验证的数字（能在仓库/文献里找到出处）');
    lines.push('     · 不确定的写"未知"，不编造');
    lines.push('     · 文献值要标注是文献值（S3），厂商值标 S1');
    lines.push('-->');
    lines.push('');
  });
  lines.push('---');
  lines.push('');
  lines.push('## 可用素材（写作时调用）');
  lines.push('');
  for (const aid of t.assets || []) {
    const a = assets.find((x) => x.id === aid);
    if (!a) continue;
    lines.push('### ' + a.id + ' · ' + a.name);
    lines.push('');
    lines.push('**为什么这段只有我们能写**：' + a.why_unique);
    if (a.risk) lines.push('');
    if (a.risk) lines.push('**风险**：' + a.risk);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('## 发布前检查清单');
  lines.push('');
  lines.push('- [ ] 每个数字都有出处（能在仓库/文献/厂商表里找到）');
  lines.push('- [ ] 没有编造的数据');
  lines.push('- [ ] 没有泄露 MACKORN 定价');
  lines.push('- [ ] 文献值标明是文献值（S3），厂商值标 S1');
  lines.push('- [ ] 未知的写"未知"，没填估计值');
  lines.push('- [ ] 语气符合平台（' + fmt.tone + '）');
  lines.push('- [ ] 没违反平台规则（' + fmt.must_avoid + '）');
  lines.push('- [ ] 标题吸引人但内容兑现了标题');
  lines.push('');
  lines.push('## 发布后记录');
  lines.push('');
  lines.push('```bash');
  lines.push('node tools/traffic_engine.mjs --record --topic ' + t.id + ' --platform "' + plat + '" --url <发布后的URL>');
  lines.push('```');
  lines.push('');

  const safePlat = plat.replace(/[\/\\:*?"<>|]/g, '-');
  const outFile = join(DRAFTS, t.id + '-' + safePlat + '.md');
  writeFileSync(outFile, lines.join('\n'), 'utf8');

  /* 更新选题状态 */
  t.status = 'drafted';
  reg.updated = TODAY;
  writeFileSync(REG, JSON.stringify(reg, null, 2) + '\n', 'utf8');

  console.log('');
  console.log('  ✅ 文稿骨架已生成');
  console.log('     ' + outFile.replace(ROOT + '/', '').replace(ROOT + '\\', ''));
  console.log('');
  console.log('  平台要求：' + fmt.tone + ' · ' + fmt.length);
  if (risks.length) {
    console.log('');
    console.log('  ⚠️ ' + risks.length + ' 个风险必须在发布前处理：');
    for (const r of risks) console.log('     · ' + r.id + ' ' + r.name + ' — ' + r.risk);
  }
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --calendar  发布日历
 * ══════════════════════════════════════════════════════════════ */
if (has('--calendar')) {
  console.log('');
  console.log('  ══ 发布日历 ══');
  console.log('');
  console.log('  ── 节奏规则 ──');
  for (const [k, v] of Object.entries(reg.calendar?.policy || {})) {
    console.log('  ' + k.padEnd(18) + v);
  }
  console.log('');
  console.log('  ── 已计划 ──');
  for (const c of reg.calendar?.planned || []) {
    const t = topics.find((x) => x.id === c.topic);
    console.log('  ' + c.week + '  ' + c.topic + ' → ' + c.platform);
    if (t) console.log('      《' + t.title_cn.slice(0, 50) + '》');
    console.log('      为什么: ' + c.why);
  }
  console.log('');
  console.log('  ── 已发布 ──');
  const pub = reg.published || [];
  if (!pub.length) console.log('  （还没有）');
  for (const p of pub) {
    console.log('  · ' + p.published_at + ' ' + p.topic_id + ' → ' + p.platform);
    if (p.url) console.log('    ' + p.url);
    if (p.notes) console.log('    ' + p.notes);
  }
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --record  记录已发布
 * ══════════════════════════════════════════════════════════════ */
if (has('--record')) {
  const topicId = val('--topic');
  const plat = val('--platform');
  const url = val('--url');
  if (!topicId || !plat) { console.error('--record 需要 --topic <id> --platform <平台> --url <url>'); process.exit(1); }
  const t = topics.find((x) => x.id === topicId);
  if (!t) { console.error('找不到选题: ' + topicId); process.exit(1); }
  reg.published = reg.published || [];
  reg.published.push({
    topic_id: topicId, platform: plat, published_at: TODAY,
    title: t.title_cn, url: url || null, views_7d: null, comments: null, leads: null,
    notes: val('--notes') || null,
  });
  t.status = 'published';
  reg.updated = TODAY;
  writeFileSync(REG, JSON.stringify(reg, null, 2) + '\n', 'utf8');
  console.log('');
  console.log('  ✅ 已记录发布：' + topicId + ' → ' + plat);
  console.log('     日期：' + TODAY);
  if (url) console.log('     URL：' + url);
  console.log('');
  console.log('  7 天后回来看效果，然后：');
  console.log('  node tools/traffic_engine.mjs --measure --topic ' + topicId + ' --views <数字> --leads <数字>');
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --drafts  看已生成文稿
 * ══════════════════════════════════════════════════════════════ */
if (has('--drafts') || has('--list')) {
  const files = existsSync(DRAFTS) ? readdirSync(DRAFTS).filter((f) => f.endsWith('.md')) : [];
  console.log('');
  console.log('  ══ 已生成文稿（' + files.length + ' 个）══');
  console.log('');
  for (const f of files) {
    const st = (() => { try { return readFileSync(join(DRAFTS, f), 'utf8').length; } catch { return 0; } })();
    console.log('  · ' + f + '  (' + Math.round(st / 1024 * 10) / 10 + 'KB)');
  }
  if (!files.length) console.log('  （空）跑 --write 生成');
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * 默认：总览
 * ══════════════════════════════════════════════════════════════ */
const drafts = existsSync(DRAFTS) ? readdirSync(DRAFTS).filter((f) => f.endsWith('.md')).length : 0;
console.log('');
console.log('  ══ 引流工作器 ══');
console.log('');
console.log('  选题 ' + topics.length + ' 个 · 已生成文稿 ' + drafts + ' 个 · 已发布 ' + (reg.published || []).length + ' 篇');
console.log('');
console.log('  ── 选题状态 ──');
const bySt = {};
for (const t of topics) bySt[t.status] = (bySt[t.status] || 0) + 1;
for (const [k, v] of Object.entries(bySt)) {
  const hint = { idea: '💡 只有选题', 'draft-ready': '📝 可以开写', drafting: '✍️ 正在写', drafted: '✅ 已生成骨架', published: '🎉 已发布' };
  console.log('  ' + String(v).padStart(2) + '  ' + (hint[k] || k));
}
console.log('');
console.log('  ── 平台文体（' + Object.keys(formats).length + ' 种）──');
for (const [k, v] of Object.entries(formats)) {
  console.log('  ' + k.padEnd(12) + v.length + ' · ' + v.tone);
}
console.log('');
console.log('  ── 命令 ──');
console.log('    --topics                       选题池');
console.log('    --outline <id>                 看某选题大纲');
console.log('    --write <id> --platform <类型>  生成文稿骨架');
console.log('    --calendar                     发布日历');
console.log('    --drafts                       看已生成文稿');
console.log('    --record --topic <id> --platform <平台> --url <url>   记录发布');
console.log('');
console.log('  台账：traffic-registry/registry.json');
console.log('  文稿：traffic-registry/drafts/');
console.log('');
