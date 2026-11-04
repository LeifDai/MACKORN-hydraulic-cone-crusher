/**
 * 云端状态拉取器（R212 · 2026-11-04）
 *
 * 配合 probe.php 使用，形成「云端探测 → 本地执行」闭环。
 *
 * 架构：
 *   云端（mackorn.cn）：cron 每 30 分钟访问 probe.php?token=xxx&run=1
 *                      → 探测 11 个平台 → 写 cloud_data/probe_state.json
 *   本地（本文件）：拉 probe.php?token=xxx（不 run，只读上次结果）
 *                 → 对比本地 knowledge → 生成今日待办
 *                 → 电脑开机就能看到「云端替我探到了什么」
 *
 * 为什么这么设计：
 *   · 云端探测不受本机网络限制（本机有 TLS 拦截，云端没有）
 *   · 本地只做「需要人工/需要本地环境」的动作（npm publish、传文件）
 *   · 即使电脑关机三天，云端照样每天探 48 次，开机一次性拉回来
 *
 * 用法：
 *   node tools/cloud_pull.mjs              # 拉一次，出待办
 *   node tools/cloud_pull.mjs --run        # 顺便让云端立刻探一次（30秒）
 *   node tools/cloud_pull.mjs --md         # 直接打印云端 Markdown 报告
 *   node tools/cloud_pull.mjs --diff       # 只看变化（vs 本地上次缓存）
 *   node tools/cloud_pull.mjs --json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CACHE_DIR = join(ROOT, 'cloud-data');
const CACHE = join(CACHE_DIR, 'last-probe.json');
const TODO = join(ROOT, 'out', 'todo-cloud.md');

/* ⚠️ 这两个值必须和服务器上的 probe.php 一致 */
const BASE = 'https://mackorn.cn/ai/api/probe.php';
const TOKEN = 'mackorn-probe-2026-Kx9mQ';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const NOW = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/* ══════════════════════════════════════════════════════════════
 * 拉云端
 * ══════════════════════════════════════════════════════════════ */
async function pull(runNow) {
  const url = `${BASE}?token=${encodeURIComponent(TOKEN)}${runNow ? '&run=1' : ''}`;
  const t0 = Date.now();
  const r = await fetch(url, { signal: AbortSignal.timeout(runNow ? 120000 : 20000) });
  const ms = Date.now() - t0;
  const text = await r.text();

  if (r.status === 403) {
    throw new Error('token 不对 —— 检查 probe.php 里的 PROBE_TOKEN 和本文件的 TOKEN 是否一致');
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);

  let j;
  try { j = JSON.parse(text); } catch {
    throw new Error('返回不是 JSON（可能 PHP 报错）: ' + text.slice(0, 200));
  }
  if (j.status === 'never_run') {
    throw new Error('云端从未跑过探测 —— 先跑一次：node tools\\\\cloud_pull.mjs --run');
  }
  return { state: j, ms };
}

/* ══════════════════════════════════════════════════════════════
 * 与本地缓存对比
 * ══════════════════════════════════════════════════════════════ */
function diffWithCache(state) {
  if (!existsSync(CACHE)) return { first: true, fixed: [], regressed: [] };
  let prev;
  try { prev = JSON.parse(readFileSync(CACHE, 'utf8')); } catch { return { first: true, fixed: [], regressed: [] }; }
  if (!prev.platforms) return { first: true, fixed: [], regressed: [] };

  const prevMap = new Map(prev.platforms.map((p) => [p.id, p.status]));
  const fixed = [], regressed = [];
  for (const p of state.platforms || []) {
    const old = prevMap.get(p.id);
    if (old == null) continue;
    if (old !== 'listed' && p.status === 'listed') fixed.push({ name: p.name, from: old });
    if (old === 'listed' && p.status !== 'listed') regressed.push({ name: p.name, to: p.status });
  }
  /* 云端自己的 diff 字段更权威（它比缓存新） */
  const cloudDiff = state.diff && state.diff.has_prev ? state.diff : null;
  return {
    first: false,
    prevAt: prev.at_local,
    fixed, regressed,
    cloudDiff,
  };
}

/* ══════════════════════════════════════════════════════════════
 * 生成待办
 * ══════════════════════════════════════════════════════════════ */
const ICON = {
  listed: '✅', not_found: '❌',
  endpoint_changed: '🔀', deprecated: '💀', error: '⚠️',
};

const STATUS_MEANING = {
  listed: '已收录',
  not_found: '端点活着但找不到我们',
  endpoint_changed: '端点地址变了（API 改版）',
  deprecated: '平台已废弃',
  error: '网络/超时',
};

function buildTodo(state, diff) {
  const lines = [];
  lines.push(`# 云端探测待办 · ${NOW}`);
  lines.push('');
  lines.push(`> 云端探测时间：${state.at_local || '?'}`);
  lines.push(`> 加权收录率：**${state.weighted_pct || 0}%**`);
  lines.push('');

  const s = state.summary || {};
  lines.push('## 总览');
  lines.push('');
  lines.push('| 状态 | 数量 |');
  lines.push('|:---|---:|');
  lines.push(`| ✅ 已收录 | ${s.listed || 0} |`);
  lines.push(`| ❌ 未收录 | ${s.not_found || 0} |`);
  lines.push(`| 🔀 端点已变 | ${s.endpoint_changed || 0} |`);
  lines.push(`| 💀 已废弃 | ${s.deprecated || 0} |`);
  lines.push(`| ⚠️ 异常 | ${s.error || 0} |`);
  lines.push('');

  /* 变化 */
  const fixed = (diff.cloudDiff && diff.cloudDiff.fixed) || diff.fixed || [];
  const regressed = (diff.cloudDiff && diff.cloudDiff.regressed) || diff.regressed || [];
  if (fixed.length || regressed.length) {
    lines.push('## 与上次对比');
    lines.push('');
    for (const f of fixed) lines.push(`- 🎉 **${f.name}** 新收录（${f.from} → listed）`);
    for (const f of regressed) lines.push(`- 📉 **${f.name}** 掉收录（listed → ${f.to}）`);
    lines.push('');
  }

  /* 待办：按权重排序，只列真正需要动作的 */
  const todo = (state.platforms || []).filter((p) => p.status !== 'listed');
  todo.sort((a, b) => (b.weight || 0) - (a.weight || 0));

  lines.push('## 待办（按重要度排序）');
  lines.push('');
  for (const p of todo) {
    const ic = ICON[p.status] || '❓';
    lines.push(`### ${ic} ${p.name}（权重 ${p.weight || '?'}）`);
    lines.push('');
    lines.push(`- **状态**：${p.status} —— ${STATUS_MEANING[p.status] || ''}`);
    lines.push(`- **证据**：${p.evidence || '?'}`);
    lines.push(`- **该做什么**：${p.action || '见 docs/listing-playbook.md'}`);
    lines.push('');
  }

  /* 已收录的也列一下（确认没掉） */
  const listed = (state.platforms || []).filter((p) => p.status === 'listed');
  if (listed.length) {
    lines.push('## 已收录（确认中）');
    lines.push('');
    for (const p of listed) lines.push(`- ✅ ${p.name}（${p.evidence}）`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*由 `tools/cloud_pull.mjs` 生成 · 云端每 30 分钟自动探测，本地随时拉取*');
  return lines.join('\n');
}

/* ══════════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════════ */
const runNow = has('--run');
const wantMd = has('--md');
const onlyDiff = has('--diff');
const asJson = has('--json');

console.log('');
console.log('  ══ 云端探测状态拉取 ══');
console.log('  云端：' + BASE.replace('https://', ''));
console.log('  ' + (runNow ? '模式：让云端立刻探一次（约 30-60 秒）' : '模式：只读上次结果'));
console.log('');

let pulled;
try {
  pulled = await pull(runNow);
} catch (e) {
  console.log('  ❌ ' + e.message);
  console.log('');
  if (e.message.includes('token')) {
    console.log('  检查两处：');
    console.log('    1. 服务器 probe.php 第 32 行：define(\'PROBE_TOKEN\', \'...\');');
    console.log('    2. 本文件 TOKEN 常量（约第 40 行）');
    console.log('');
  }
  if (e.message.includes('从未跑过')) {
    console.log('  执行：node tools\\cloud_pull.mjs --run');
    console.log('');
  }
  if (e.message.includes('HTTP 404')) {
    console.log('  probe.php 还没上传到服务器 /ai/api/');
    console.log('  本地文件：distribution/官网落地页/api/probe.php（16.3KB）');
    console.log('');
  }
  process.exit(1);
}

const { state, ms } = pulled;
mkdirSync(CACHE_DIR, { recursive: true });

if (asJson) { console.log(JSON.stringify(state, null, 2)); process.exit(0); }

/* 打印摘要 */
console.log('  ✅ 拉取成功（' + ms + 'ms）');
console.log('  云端探测时间：' + (state.at_local || '?'));
console.log('  加权收录率：' + (state.weighted_pct || 0) + '%');
console.log('');

const s = state.summary || {};
console.log('  ── 状态总览 ──');
console.log('  ✅ 已收录 ' + (s.listed || 0) + ' · ❌ 未收录 ' + (s.not_found || 0) +
  ' · 🔀 端点变 ' + (s.endpoint_changed || 0) +
  ' · 💀 废弃 ' + (s.deprecated || 0) +
  ' · ⚠️ 异常 ' + (s.error || 0));
console.log('');

/* 逐平台 */
if (!onlyDiff) {
  console.log('  ── 逐平台 ──');
  for (const p of (state.platforms || [])) {
    const ic = ICON[p.status] || '❓';
    console.log('  ' + ic + ' ' + String(p.name).padEnd(28) + String(p.status).padEnd(18) + 'HTTP ' + p.http + '  ' + p.ms + 'ms');
    if (p.status !== 'listed' && p.evidence) {
      console.log('       ' + String(p.evidence).slice(0, 80));
    }
  }
  console.log('');
}

/* Diff */
const diff = diffWithCache(state);
const fixed = (diff.cloudDiff && diff.cloudDiff.fixed) || diff.fixed || [];
const regressed = (diff.cloudDiff && diff.cloudDiff.regressed) || diff.regressed || [];
if (fixed.length || regressed.length) {
  console.log('  ── 与上次对比 ──');
  for (const f of fixed) console.log('  🎉 新收录：' + f.name);
  for (const f of regressed) console.log('  📉 掉收录：' + f.name);
  console.log('');
}

/* 写缓存与待办 */
writeFileSync(CACHE, JSON.stringify(state, null, 2), 'utf8');
mkdirSync(dirname(TODO), { recursive: true });
writeFileSync(TODO, buildTodo(state, diff), 'utf8');

console.log('  缓存：cloud-data/last-probe.json');
console.log('  待办：out/todo-cloud.md');
console.log('');

if (wantMd) {
  /* 直接打印云端 Markdown 报告 */
  try {
    const r = await fetch(`${BASE}?token=${encodeURIComponent(TOKEN)}&md=1`, { signal: AbortSignal.timeout(20000) });
    const md = await r.text();
    console.log('  ══ 云端 Markdown 报告 ══');
    console.log('');
    console.log(md);
  } catch (e) {
    console.log('  ❌ 拉 Markdown 失败：' + e.message);
  }
}

/* 今日一句话 */
const top = (state.platforms || [])
  .filter((p) => p.status !== 'listed')
  .sort((a, b) => (b.weight || 0) - (a.weight || 0))[0];
if (top) {
  console.log('  ══ 今天先干这一件 ══');
  console.log('  ' + top.name + '（' + top.status + '，权重 ' + top.weight + '）');
  console.log('  ' + (top.action || ''));
  console.log('');
} else {
  console.log('  🎉 全部收录，无需动作');
  console.log('');
}

process.exit(0);
