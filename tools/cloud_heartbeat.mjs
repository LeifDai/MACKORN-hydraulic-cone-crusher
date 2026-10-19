/**
 * 云端心跳（R92）
 *
 * 为「两个月无人值守」而写。
 *
 * 要解决的致命问题：
 *   GitHub 会在【公开仓库 60 天无活动】后自动禁用 scheduled workflow。
 *   而我们的工作流有一句：
 *       if git diff --staged --quiet; then echo "本轮无变化，不提交"
 *   → 项目越稳定，越没有变更 → 越不提交 → 越接近被自动禁用。
 *   **这是个悖论：跑得越好，越会静默死掉。**
 *
 * 解法：每次运行都写一个带时间戳的心跳文件。
 *   · 时间戳每次都不同 → 每次都有变更 → 每次都提交 → 仓库永远有活动
 *   · 同时也让我们能【判断云端是不是还活着】（看心跳多久没更新）
 *
 * 本工具既是【心跳写入器】，也是【健康检查器】：
 *   node tools/cloud_heartbeat.mjs           # 写心跳（云端每次运行调用）
 *   node tools/cloud_heartbeat.mjs --check   # 只读检查（判断云端是否还活着）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');
const HB = join(D, 'cloud-heartbeat.json');
const CHECK = process.argv.includes('--check');

/* ── 收集本轮状态 ── */
async function snapshot() {
  const out = { tools: null, lessons: null, gates: null, version: null, last_check: null };
  try {
    const IDX = readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8');
    out.tools = [...new Set([...IDX.matchAll(/^\s{2}name: '(mackorn_[a-z_]+)',/gm)].map((m) => m[1]))].length;
  } catch { }
  try {
    const L = await import(pathToFileURL(join(HERE, 'lessons.mjs')).href);
    out.lessons = (L.LESSONS || []).length;
  } catch { }
  try {
    const g = readFileSync(join(HERE, 'enforce_lessons.mjs'), 'utf8');
    out.gates = (g.match(/\brec\(/g) || []).length;
  } catch { }
  try { out.version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version; } catch { }
  try {
    const j = JSON.parse(readFileSync(join(ROOT, 'distribution', '05_视角与复盘', 'PDCA台账.json'), 'utf8'));
    const a = j.rounds || [];
    out.last_check = a.length ? (a[a.length - 1].round || null) : null;
    out.pdca_rounds = a.length;
  } catch { }
  return out;
}

/* ══════ 检查模式 ══════ */
if (CHECK) {
  if (!existsSync(HB)) {
    console.log('');
    console.log('  ❌ 没有心跳文件 —— 云端从未成功运行过（或心跳未被提交）');
    console.log('     文件应在：distribution/03_验证与基准/cloud-heartbeat.json');
    console.log('');
    console.log('  排查顺序：');
    console.log('    ① 代码 push 了吗？（本机没有 git，需人工推）');
    console.log('    ② Settings → Actions → General → Workflow permissions 开了 write 吗？');
    console.log('    ③ Actions 页面里这个 workflow 是不是被【禁用】了？');
    console.log('       （GitHub 会在公开仓库 60 天无活动后自动禁用）');
    console.log('');
    process.exit(1);
  }
  let hb = null;
  try { hb = JSON.parse(readFileSync(HB, 'utf8')); } catch {
    console.log('  ❌ 心跳文件不可解析');
    process.exit(1);
  }
  const beats = hb.beats || [];
  const last = beats.length ? beats[beats.length - 1] : null;
  const lastAt = last ? Date.parse(last.at) : NaN;
  const ageH = Number.isFinite(lastAt) ? (Date.now() - lastAt) / 3600000 : Infinity;

  /* 每 2 小时一次；给 3 倍的宽限（含 GitHub cron 延迟） */
  const STALE_H = 6;
  const alive = ageH <= STALE_H;

  console.log('');
  console.log('  ══ 云端心跳检查 ══');
  console.log('');
  console.log('  心跳总数：' + (hb.total_beats || beats.length));
  console.log('  首次：' + (hb.first_at || '—'));
  console.log('  最近一次：' + (last ? last.at : '—') + (Number.isFinite(ageH) ? '（' + ageH.toFixed(1) + ' 小时前）' : ''));
  console.log('');
  console.log('  ' + (alive ? '✅ 云端活着' : '❌ 云端已停 ' + (Number.isFinite(ageH) ? ageH.toFixed(1) + ' 小时' : '（无有效时间戳）')));
  if (!alive) {
    console.log('');
    console.log('  可能原因（按概率排）：');
    console.log('    ① GitHub 自动禁用了定时工作流（公开仓库 60 天无活动）');
    console.log('       → 去 https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher/actions');
    console.log('         找到工作流 → 点 "Enable workflow"');
    console.log('    ② 仓库被 archive / 改名');
    console.log('    ③ Actions 用量超限（公开仓库通常免费，但 fork 的仓库例外）');
    console.log('    ④ 工作流文件被改动导致语法错误');
    console.log('');
    console.log('  临时办法：手动触发一次 workflow_dispatch');
    console.log('    Actions 页面 → 选工作流 → "Run workflow"');
    console.log('');
    process.exit(1);
  }
  console.log('');
  console.log('  最近几轮：');
  for (const b of beats.slice(-5)) {
    console.log('    · ' + b.at + '  run#' + (b.run || '?') + '  工具 ' + (b.tools ?? '?') + ' · 教训 ' + (b.lessons ?? '?') + ' · 门禁 ' + (b.gates ?? '?'));
  }
  console.log('');
  process.exit(0);
}

/* ══════ 写入模式（云端每次运行调用）══════ */
const snap = await snapshot();
const now = new Date().toISOString();
let hb = { schema: 'mackorn-cloud-heartbeat/1', first_at: now, total_beats: 0, beats: [] };
if (existsSync(HB)) { try { hb = JSON.parse(readFileSync(HB, 'utf8')); } catch { } }
hb.schema = 'mackorn-cloud-heartbeat/1';
if (!hb.first_at) hb.first_at = now;
hb.beats = hb.beats || [];
hb.total_beats = (hb.total_beats || hb.beats.length) + 1;
hb.beats.push({
  at: now,
  run: process.env.GITHUB_RUN_NUMBER || null,
  event: process.env.GITHUB_EVENT_NAME || 'local',
  tools: snap.tools, lessons: snap.lessons, gates: snap.gates,
  version: snap.version, pdca_rounds: snap.pdca_rounds, last_check: snap.last_check,
});
/* 只保留最近 300 次（约 1 个月的 2 小时粒度），避免文件无限膨胀 */
if (hb.beats.length > 300) hb.beats = hb.beats.slice(-300);
hb.last_at = now;

mkdirSync(D, { recursive: true });
writeFileSync(HB, JSON.stringify(hb, null, 2), 'utf8');

console.log('');
console.log('  ══ 云端心跳 ══');
console.log('');
console.log('  第 ' + hb.total_beats + ' 次心跳 · ' + now);
console.log('  工具 ' + snap.tools + ' · 教训 ' + snap.lessons + ' · 门禁 ' + snap.gates + ' · 版本 ' + snap.version);
console.log('');
console.log('  💡 这个文件每次都变（时间戳），所以每次都会产生一次提交 ——');
console.log('     从而避免「仓库 60 天无活动 → GitHub 自动禁用定时工作流」。');
console.log('');
