/**
 * AI 分发平台总账管理（R163）
 *
 * 用户要求（2026-10-23）：
 *   「列举知名的 AI 清单，和各个热点网站、分类门户、对促进 AI 收录的平台等，
 *     有助于模型的分发传播的，请编程，汇总清单；
 *     记录著名收录的时间和版本，后期更新时，按照目录，逐步更新；
 *     没有收录的名单，请编程分析没有收录的原因，及如何提升收录的条件，
 *     并想方设法完善这些条件。」
 *
 * ★ 与已有工具的分工（避免重复造）：
 *   ai_coverage.mjs             = 探"有没有收录"（18 个 MCP 目录）
 *   ai_rejection_diagnoser.mjs  = 探"为什么没收录"（12 个平台的收录条件清单）
 *   directory_checker.mjs       = 管"15 个 MCP 目录的台账 + 3 天周期"
 *   distribution_registry.mjs   = ★ 本工具：管【全部 60+ 平台】的【分发传播清单】
 *                                 覆盖 AI 客户端 + MCP 目录 + 包管理器 + AI 工具站 +
 *                                 开发者社区 + 行业门户 + 学术标准
 *
 * ★ 本工具新增的三件能力：
 *   ① --stats      按目录分类统计（多少个能立刻用 / 多少个待提交）
 *   ② --roadmap    生成"按优先级排序的提交路线图"
 *   ③ --record     记录某平台的收录时间 + 当时版本（用户明确要求）
 *   ④ --blockers   列出所有阻塞 + 提升条件（用户明确要求"想方设法完善"）
 *
 * 用法：
 *   node tools/distribution_registry.mjs                # 总览
 *   node tools/distribution_registry.mjs --stats        # 分类统计
 *   node tools/distribution_registry.mjs --roadmap      # 提交路线图
 *   node tools/distribution_registry.mjs --blockers     # 阻塞 + 提升条件
 *   node tools/distribution_registry.mjs --record --id glama --version 0.2.2
 *   node tools/distribution_registry.mjs --json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const REG = join(ROOT, 'distribution-registry', 'registry.json');
const OUT_DIR = join(ROOT, 'distribution', '03_验证与基准');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };

if (!existsSync(REG)) { console.error('找不到 distribution-registry/registry.json'); process.exit(1); }
const reg = JSON.parse(readFileSync(REG, 'utf8'));

/* 扁平化所有平台 */
const all = [];
for (const cat of reg.categories || []) {
  for (const p of cat.platforms || []) {
    all.push({ ...p, category: cat.id, category_name: cat.name });
  }
}

/* ══════════════════════════════════════════════════════════════
 * --record  记录收录时间与版本
 * ══════════════════════════════════════════════════════════════ */
if (has('--record')) {
  const id = val('--id');
  const version = val('--version');
  const date = val('--date') || new Date().toISOString().slice(0, 10);
  if (!id) { console.error('--record 需要 --id <平台id>'); process.exit(1); }
  let found = false;
  for (const cat of reg.categories) {
    for (const p of cat.platforms || []) {
      if (p.id !== id) continue;
      found = true;
      p.status = 'listed';
      p.recorded_at = date;
      if (version) p.recorded_version = version;
      p.confidence = 'measured';
      console.log('  ✅ 已记录：' + p.name);
      console.log('     收录时间：' + date);
      console.log('     当时版本：' + (version || '（未提供）'));
    }
  }
  if (!found) { console.error('找不到平台 id: ' + id); process.exit(1); }
  reg.updated = new Date().toISOString().slice(0, 10);
  writeFileSync(REG, JSON.stringify(reg, null, 2) + '\n', 'utf8');
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --stats  分类统计
 * ══════════════════════════════════════════════════════════════ */
function computeStats() {
  const byStatus = {};
  const byConfidence = {};
  const byCategory = {};
  for (const p of all) {
    byStatus[p.status || 'unknown'] = (byStatus[p.status || 'unknown'] || 0) + 1;
    byConfidence[p.confidence || 'unknown'] = (byConfidence[p.confidence || 'unknown'] || 0) + 1;
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  }
  return { total: all.length, byStatus, byConfidence, byCategory };
}

const stats = computeStats();
reg.statistics = { total_platforms: stats.total, by_confidence: stats.byConfidence, by_status: stats.byStatus, note: '由 tools/distribution_registry.mjs --stats 动态计算' };

/* ══════════════════════════════════════════════════════════════
 * --stats 输出
 * ══════════════════════════════════════════════════════════════ */
if (has('--stats')) {
  console.log('');
  console.log('  ══ AI 分发平台总账 · 分类统计 ══');
  console.log('');
  console.log('  总计 ' + stats.total + ' 个平台，分 ' + reg.categories.length + ' 类');
  console.log('');
  console.log('  ── 按类别 ──');
  for (const cat of reg.categories) {
    const n = stats.byCategory[cat.id] || 0;
    console.log('  ' + cat.name.padEnd(28) + String(n).padStart(3) + ' 个');
    console.log('      ' + cat.why_it_matters.slice(0, 76));
  }
  console.log('');
  console.log('  ── 按状态 ──');
  const statusOrder = ['already-native', 'usable-now', 'listed', 'auto-listed', 'merged', 'pr-open',
    'listed-but-unscored', 'blocked-or-pending', 'not-listed', 'not-posted', 'not-launched',
    'not-featured', 'not-accessible', 'not-applicable', 'not-having', 'unknown', 'reference'];
  for (const s of statusOrder) {
    if (!stats.byStatus[s]) continue;
    const hint = {
      'already-native': '✅ 原生支持（DSH 插件）',
      'usable-now': '✅ 现在就能用（配一下就行）',
      listed: '✅ 已收录',
      'auto-listed': '✅ 自动镜像',
      merged: '✅ PR 已合并',
      'pr-open': '🔵 PR 已开',
      'listed-but-unscored': '⚠️ 已收录但没评分',
      'blocked-or-pending': '🚫 被反爬 / 待抓取',
      'not-listed': '❌ 未收录',
      'not-posted': '❌ 没发帖（社区）',
      'not-launched': '❌ 没发布（Product Hunt）',
      'not-featured': '❌ 没上（Trending）',
      'not-accessible': '⛔ 接入不了（需企业审核等）',
      'not-applicable': '⬜ 不适用',
      'not-having': '❌ 没有（如 DOI）',
      unknown: '❓ 不清楚',
      reference: '📚 参考资料（不是提交目标）',
    };
    console.log('  ' + String(stats.byStatus[s]).padStart(3) + '  ' + (hint[s] || s));
  }
  console.log('');
  console.log('  ── 按可信度 ──');
  for (const [c, n] of Object.entries(stats.byConfidence)) {
    const hint = { measured: '我实测过', searched: '搜索有依据', known: '常识判断', unknown: '不清楚' };
    console.log('  ' + String(n).padStart(3) + '  ' + c + '（' + (hint[c] || '') + '）');
  }
  console.log('');
  writeFileSync(REG, JSON.stringify(reg, null, 2) + '\n', 'utf8');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --roadmap  提交路线图（按"能立刻做 → 需准备 → 需外部"排序）
 * ══════════════════════════════════════════════════════════════ */
if (has('--roadmap')) {
  const buckets = {
    'P0 · 现在就能做（无需等任何外部条件）': [],
    'P1 · 需先做一件事（如 containerized release）': [],
    'P2 · 需手工提交（材料已备/需备）': [],
    'P3 · 需外部条件（账号/审核/资质）': [],
    'P4 · 社区发帖（需内容 + 时机）': [],
    '⬜ 不适用/参考': [],
  };
  for (const p of all) {
    const st = p.status || 'unknown';
    if (['already-native', 'usable-now', 'listed', 'auto-listed', 'merged', 'reference', 'not-applicable'].includes(st)) continue;
    if (st === 'listed-but-unscored') buckets['P1 · 需先做一件事（如 containerized release）'].push(p);
    else if (st === 'pr-open') buckets['P1 · 需先做一件事（如 containerized release）'].push(p);
    else if (st === 'not-listed' && p.category.startsWith('mcp')) buckets['P2 · 需手工提交（材料已备/需备）'].push(p);
    else if (st === 'not-listed') buckets['P2 · 需手工提交（材料已备/需备）'].push(p);
    else if (['not-posted', 'not-launched', 'not-featured'].includes(st)) buckets['P4 · 社区发帖（需内容 + 时机）'].push(p);
    else if (['not-accessible', 'blocked-or-pending'].includes(st)) buckets['P3 · 需外部条件（账号/审核/资质）'].push(p);
    else if (st === 'unknown') buckets['P2 · 需手工提交（材料已备/需备）'].push(p);
    else buckets['⬜ 不适用/参考'].push(p);
  }
  console.log('');
  console.log('  ══ AI 分发传播 · 提交路线图 ══');
  console.log('');
  for (const [k, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    console.log('  ── ' + k + '（' + list.length + ' 个）──');
    for (const p of list) {
      console.log('  · ' + p.name);
      if (p.improvement) console.log('      → ' + p.improvement);
      else if (p.how_to_use) console.log('      → ' + p.how_to_use);
      if (p.blocker) console.log('      ⚠ ' + p.blocker);
    }
    console.log('');
  }
  console.log('  共 ' + all.length + ' 个平台 · 待推进 ' + (buckets['P0 · 现在就能做（无需等任何外部条件）'].length
    + buckets['P1 · 需先做一件事（如 containerized release）'].length
    + buckets['P2 · 需手工提交（材料已备/需备）'].length
    + buckets['P3 · 需外部条件（账号/审核/资质）'].length
    + buckets['P4 · 社区发帖（需内容 + 时机）'].length) + ' 个');
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --blockers  阻塞 + 提升条件
 * ══════════════════════════════════════════════════════════════ */
if (has('--blockers')) {
  console.log('');
  console.log('  ══ 未收录平台：原因 + 提升条件 ══');
  console.log('');
  const blocked = all.filter((p) => p.status && !['already-native', 'usable-now', 'listed', 'auto-listed', 'merged', 'reference', 'not-applicable'].includes(p.status));
  for (const p of blocked) {
    console.log('  ' + p.name + '（' + (p.status || '?') + ' · ' + (p.confidence || '?') + '）');
    if (p.requirements) {
      console.log('      收录条件：' + p.requirements.join(' / '));
      if (p.requirements_satisfied) console.log('      满足情况：' + p.requirements_satisfied);
    }
    if (p.blocker) console.log('      ❌ 原因：' + p.blocker);
    if (p.improvement) console.log('      → 怎么改：' + p.improvement);
    if (!p.improvement && !p.blocker) console.log('      ⚠ 尚未分析（需要调研）');
    console.log('');
  }
  console.log('  共 ' + blocked.length + ' 个未收录平台');
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --json
 * ══════════════════════════════════════════════════════════════ */
if (has('--json')) { console.log(JSON.stringify({ ...reg, _stats: stats }, null, 2)); process.exit(0); }

/* ══════════════════════════════════════════════════════════════
 * 默认：总览
 * ══════════════════════════════════════════════════════════════ */
console.log('');
console.log('  ══ AI 分发平台总账 ══');
console.log('  更新：' + reg.updated + ' · ' + stats.total + ' 个平台 · ' + reg.categories.length + ' 类');
console.log('');
for (const cat of reg.categories) {
  const n = stats.byCategory[cat.id] || 0;
  const done = (cat.platforms || []).filter((p) => ['already-native', 'usable-now', 'listed', 'auto-listed', 'merged'].includes(p.status)).length;
  console.log('  ' + cat.name.padEnd(26) + done + '/' + n + ' 已通');
  console.log('      ' + cat.why_it_matters.slice(0, 72));
}
console.log('');
console.log('  ── 命令 ──');
console.log('    --stats       分类统计');
console.log('    --roadmap     提交路线图（按优先级）');
console.log('    --blockers    未收录原因 + 提升条件');
console.log('    --record --id <平台> --version <版本>   记录收录时间与版本');
console.log('');
console.log('  清单：distribution-registry/registry.json');
console.log('');
