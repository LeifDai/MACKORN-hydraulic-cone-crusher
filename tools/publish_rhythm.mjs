/**
 * 发布节奏检查器（R96）
 *
 * 用户要求（原话）：
 *   「每三天检查是否有更新内容，如果有，你就更新到 GitHub，
 *     每周都要至少更新一次，你编程写进规则里面；
 *     保持良性的、持续的优化和迭代。」
 *
 * 所以本工具把「发布节奏」变成可测量、可报警的判据：
 *
 *   ① 距上次 GitHub 更新多少天
 *      · ≤ 3 天  → ✅ 健康
 *      · 4–7 天  → ⚠️ 该检查了（3 天规则已过）
 *      · > 7 天  → ❌ 违反"每周至少更新一次"
 *
 *   ② 本地有没有【未发布】的改动
 *      —— 有改动但没推 = 用户拿到的是旧版
 *
 *   ③ 推不推得出建议
 *      —— 输出一条可直接执行的命令
 *
 * 关键：GitHub 的【读】接口是公开的，不需要 token。
 *   所以这个检查器在任何机器上都能跑，也能进云端工作流。
 *
 * 用法：
 *   node tools/publish_rhythm.mjs           # 检查并给建议
 *   node tools/publish_rhythm.mjs --json    # JSON 输出
 */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');
const OUT = join(D, 'publish-rhythm.json');
const JSON_ONLY = process.argv.includes('--json');

const OWNER = 'LeifDai';
const REPO = 'MACKORN-hydraulic-cone-crusher';
const CHECK_DAYS = 3;     // 每 3 天检查
const MAX_DAYS = 7;       // 每周至少更新一次

/* ══════ ① 上次 GitHub 提交时间（公开 API，无需 token）══════ */
let lastCommit = null, ghOk = false, ghErr = null;
try {
  const r = await fetch('https://api.github.com/repos/' + OWNER + '/' + REPO + '/commits?per_page=1', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mackorn-rhythm' },
    signal: AbortSignal.timeout(20000),
  });
  if (r.ok) {
    const j = await r.json();
    if (Array.isArray(j) && j.length) {
      lastCommit = {
        sha: j[0].sha ? j[0].sha.slice(0, 7) : null,
        date: j[0].commit && j[0].commit.committer ? j[0].commit.committer.date : null,
        message: j[0].commit && j[0].commit.message ? String(j[0].commit.message).split('\n')[0].slice(0, 90) : null,
      };
      ghOk = true;
    }
  } else ghErr = 'HTTP ' + r.status;
} catch (e) {
  ghErr = String((e && e.message) || e).slice(0, 80) + (/(fetch failed|timeout|ENOTFOUND)/i.test(String(e)) ? '（网络不可达，按机制应能连）' : '');
}

/* ══════ ①b npm 发布节奏（NPM_RHYTHM）══════
 *   为什么单独查 npm：
 *     两条发布通道的【可用性不同】——
 *       · GitHub 需要 ghp_ token（本机没有 → 可能长期阻塞）
 *       · npm     已验证可用（npm_ granular token）
 *   所以节奏判定应取【两条通道里更新的那一条】，
 *   而不是只盯住被阻塞的那条 —— 否则永远报 VIOLATION，
 *   报警就失去意义（狼来了）。
 * ================================================================ */
let npmLatest = null, npmTime = null, npmOk = false, npmErr2 = null;
try {
  const r2 = await fetch('https://registry.npmjs.org/mackorn-cone-crusher', {
    headers: { Accept: 'application/json', 'User-Agent': 'mackorn-rhythm' },
    signal: AbortSignal.timeout(20000),
  });
  if (r2.ok) {
    const j2 = await r2.json();
    npmLatest = (j2['dist-tags'] || {}).latest || null;
    npmTime = npmLatest && j2.time ? j2.time[npmLatest] : null;
    npmOk = !!npmLatest;
  } else npmErr2 = 'HTTP ' + r2.status;
} catch (e) { npmErr2 = String((e && e.message) || e).slice(0, 60); }

let npmAgeDays = null;
if (npmTime) { const t2 = Date.parse(npmTime); if (Number.isFinite(t2)) npmAgeDays = (Date.now() - t2) / 86400000; }

/* 本地 package.json 版本 vs npm 上的 latest */
let localVersion = null;
try { localVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version; } catch { }
const versionPending = !!(localVersion && npmLatest && localVersion !== npmLatest);

let ageDays = null;
if (lastCommit && lastCommit.date) {
  const t = Date.parse(lastCommit.date);
  if (Number.isFinite(t)) ageDays = (Date.now() - t) / 86400000;
}

/* ══════ ② 本地有哪些"可能是新内容"的改动 ══════
 *   没有 git，所以无法精确 diff。
 *   用【文件修改时间】做代理：统计最近 N 天内改动过的源文件。
 *   这不是精确的 diff，但足够回答"有没有新东西"。
 * ═══════════════════════════════════════════════════════════════ */
const SCAN_DIRS = ['plugin', 'tools', 'tests', 'skills', 'examples', 'articles'];
const SCAN_FILES = ['README.md', 'CITATION.cff', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md',
  'Dockerfile', 'server.json', 'package.json', 'skills.sh.json', 'VERSION', 'CLAUDE.md'];
const EXT = /\.(mjs|md|json|yml|yaml|cff|php|html|txt)$/;

function countRecent(days, sinceMs) {
  const hits = [];
  const walk = (d, dep = 0) => {
    if (dep > 5 || !existsSync(d)) return;
    let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (/node_modules|_deploy|_delta|_archive|_upload-github|_npmcache|dist$/.test(e.name)) continue;
      const q = join(d, e.name);
      if (e.isDirectory()) { walk(q, dep + 1); continue; }
      if (!EXT.test(e.name)) continue;
      try { const m = statSync(q).mtimeMs; if (m >= sinceMs) hits.push(q.replace(ROOT + '\\', '').replace(/\\/g, '/')); } catch { }
    }
  };
  for (const d of SCAN_DIRS) walk(join(ROOT, d));
  for (const f of SCAN_FILES) {
    const q = join(ROOT, f);
    try { if (existsSync(q) && statSync(q).mtimeMs >= sinceMs) hits.push(f); } catch { }
  }
  return hits;
}

/* 上次 GitHub 更新之后，本地改了多少文件 */
let changedSincePublish = [];
if (lastCommit && lastCommit.date) {
  const t = Date.parse(lastCommit.date);
  if (Number.isFinite(t)) changedSincePublish = countRecent(0, t + 1000);
} else {
  /* 不知道线上时间 → 用最近 7 天 */
  changedSincePublish = countRecent(0, Date.now() - 7 * 86400000);
}

/* ══════ ③ 判定 ══════ */
/* 取【两条通道里更新的那一条】作为"最近一次发布" ——
 * 通道可用性不同，只盯被阻塞的那条会让报警失真。 */
const effectiveAge = (() => {
  const cands = [];
  if (ageDays !== null) cands.push({ via: 'github', d: ageDays });
  if (npmAgeDays !== null) cands.push({ via: 'npm', d: npmAgeDays });
  if (!cands.length) return { via: null, d: null };
  cands.sort((a, b) => a.d - b.d);
  return cands[0];
})();

let verdict, action;
if (!ghOk) {
  verdict = 'UNKNOWN';
  action = '读不到 GitHub（' + (ghErr || '未知') + '）—— 联网后重跑；这不算"已检查"。';
} else if (ageDays === null) {
  verdict = 'UNKNOWN';
  action = '读到了提交但解析不了时间 —— 需要人工看。';
} else if (effectiveAge.d !== null && effectiveAge.d <= CHECK_DAYS) {
  verdict = 'HEALTHY';
  action = '节奏正常：最近一次发布经 ' + effectiveAge.via + '（' + effectiveAge.d.toFixed(1) + ' 天前）。本轮无需推送。'
    + (versionPending ? ' ⚠️ 但本地版本 ' + localVersion + ' 未发布（npm latest ' + npmLatest + '）—— 该发 npm 了。' : '');
} else if (effectiveAge.d !== null && effectiveAge.d <= MAX_DAYS) {
  verdict = 'CHECK_DUE';
  action = '已 ' + effectiveAge.d.toFixed(1) + ' 天没发布（经 ' + effectiveAge.via + '）—— 3 天检查点已过。'
    + (changedSincePublish.length ? changedSincePublish.length + ' 个文件有改动，建议发布。' : '无文件改动，可不发。');
} else {
  verdict = 'VIOLATION';
  action = '已 ' + (effectiveAge.d === null ? '?' : effectiveAge.d.toFixed(1)) + ' 天没发布 —— **违反"每周至少更新一次"**。必须在本周内发布。' +
    (changedSincePublish.length ? '（有 ' + changedSincePublish.length + ' 个文件待推）' : '（本地无改动，需要制造实质改进后再推 —— 不许空提交凑数）');
}

/* ══════ ④ 输出 ══════ */
const out = {
  schema: 'mackorn-publish-rhythm/1',
  generated: new Date().toISOString(),
  rules: { check_every_days: CHECK_DAYS, must_publish_within_days: MAX_DAYS },
  github: { owner: OWNER, repo: REPO, reachable: ghOk, error: ghErr },
  last_commit: lastCommit,
  npm: { reachable: npmOk, error: npmErr2, latest: npmLatest, published_at: npmTime, days_since: npmAgeDays === null ? null : Number(npmAgeDays.toFixed(2)), local_version: localVersion, version_pending: versionPending },
  effective_channel: effectiveAge.via,
  effective_days: effectiveAge.d === null ? null : Number(effectiveAge.d.toFixed(2)),
  days_since_publish: ageDays === null ? null : Number(ageDays.toFixed(2)),
  changed_since_publish: { count: changedSincePublish.length, files: changedSincePublish.slice(0, 60) },
  verdict,
  action,
  how_to_push: [
    '方式 A（推荐，不需要 git）：',
    '  node tools/finish_all.mjs --write --token ghp_xxx',
    '  （先更新上传包：node tools/build_github_upload_bundle.mjs）',
    '方式 B（网页）：拖 distribution\\_upload-github\\ 到 GitHub',
  ],
  honesty: [
    '「有改动」是用【文件修改时间】做的代理，不是精确 git diff（本机没有 git）。',
    '「本地无改动但超期」时不许空提交凑数 —— 要制造实质改进（新教训/新工具/新数据）再推。',
  ],
};

mkdirSync(D, { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');

if (JSON_ONLY) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }

const icon = { HEALTHY: '✅', CHECK_DUE: '⚠️', VIOLATION: '❌', UNKNOWN: '○' }[verdict] || '?';
console.log('');
console.log('  ══ 发布节奏检查 ══');
console.log('');
console.log('  规则：每 ' + CHECK_DAYS + ' 天检查 · 每 ' + MAX_DAYS + ' 天至少更新一次');
console.log('');
if (ghOk) {
  console.log('  上次 GitHub 更新   ' + (lastCommit.date || '?') + '（' + (ageDays === null ? '?' : ageDays.toFixed(1)) + ' 天前）');
  console.log('    commit           ' + (lastCommit.sha || '?'));
  console.log('    说明             ' + (lastCommit.message || '?'));
} else {
  console.log('  上次 GitHub 更新   读不到（' + ghErr + '）');
}
if (npmOk) {
  console.log('  上次 npm 发布       ' + npmLatest + '（' + npmTime + '）' + (npmAgeDays === null ? '' : ' · ' + npmAgeDays.toFixed(1) + ' 天前'));
  console.log('    本地版本          ' + (localVersion || '?') + (versionPending ? '  ⚠️ 未发布' : '  ✅ 已同步'));
} else {
  console.log('  上次 npm 发布       读不到（' + (npmErr2 || '?') + '）');
}
console.log('  上次发布后本地改动  ' + changedSincePublish.length + ' 个文件');
if (changedSincePublish.length) {
  for (const f of changedSincePublish.slice(0, 10)) console.log('      · ' + f);
  if (changedSincePublish.length > 10) console.log('      … 另有 ' + (changedSincePublish.length - 10) + ' 个');
}
console.log('');
console.log('  ' + icon + ' 判定：' + verdict);
console.log('     ' + action);
console.log('');
console.log('  ── 怎么推 ──');
for (const h of out.how_to_push) console.log('    ' + h);
console.log('');
console.log('  ── 诚实说明 ──');
for (const h of out.honesty) console.log('    · ' + h);
console.log('');
console.log('  已写 distribution/03_验证与基准/publish-rhythm.json');
console.log('');

/* VIOLATION 时 exit 1（可作门禁） */
process.exit(verdict === 'VIOLATION' ? 1 : 0);
