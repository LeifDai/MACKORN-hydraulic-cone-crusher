/**
 * 每日自检引擎（R205）—— 收录经验库 + 补差 + 迭代
 *
 * 用户要求（2026-11-02 23:30）：
 *   「请每日检查、统计、分析汇总 MACKORN 液压圆锥破碎机及生产线选型插件
 *     已经被哪些 AI 收录，收录的经验是哪些，写进经验库；
 *     对没有被收录的 AI 做统计，并分析，没有被收录的原因；
 *     查找原因和不足，并采取弥补措施，这样周而复始，就不断积累经验，
 *     不断增加收录的数量，请把以上的每日回顾总结，编程，写成每日自检引擎，
 *     每日反省，补差，提升，迭代」
 *
 * ══════════════════════════════════════════════════════════════
 * 三条铁律（吸取上一版的教训）
 *
 *   ① 绝不 execSync 调别的工具拿 JSON
 *      沙箱禁用管道捕获子进程 stdout → {status:null, error:EPERM, stdout:undefined}
 *      不抛异常，只是空 → 会被当成"没数据" → 触发假兜底
 *      ⇒ 直接 readFileSync 读 listing-data/latest.json
 *
 *   ② 绝不用假数据兜底
 *      上一版「失败时用 mock 数据」= 把假账写进经验库，比没账更危险
 *      ⇒ 文件不存在就 exit(1)，明确告诉用户先跑 listing_engine
 *
 *   ③ 绝不硬编码归因
 *      上一版 successMap/gap 是手写的「我以为的原因」
 *      ⇒ 全部从 latest.json 的 conditions[] 里抽：
 *         pass=true 的 desc → 就是「为什么成功」的真证据
 *         pass=false 的 desc + detail → 就是「为什么失败」的真原因
 *
 * ★ 额外：识别 quick 模式陷阱
 *   listing_engine --quick 时所有 verify 类检查返回假失败
 *   （detail 直接是 "quick"，或 reason 是"查询失败"）
 *   若不识别，会把「快速模式的假失败」当经验写进库 → 污染
 * ⇒ 检测到 quick:true 时明确告警，并把 verify 类失败标为「不可信」
 *
 * 用法：
 *   node tools/daily_selfcheck.mjs              # 跑一遍
 *   node tools/daily_selfcheck.mjs --refresh    # 先重跑 listing_engine 再自检
 *   node tools/daily_selfcheck.mjs --json
 *   node tools/daily_selfcheck.mjs --check      # 门禁：有 P0 未收录则 exit 1
 *   node tools/daily_selfcheck.mjs --history    # 看经验库历史
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'listing-data', 'latest.json');
const DATA_DIR = join(ROOT, 'experience-data');
const EXP_FILE = join(DATA_DIR, 'listing-experience.json');
const HISTORY = join(DATA_DIR, 'history.jsonl');
const REPORT = join(ROOT, 'distribution', '03_验证与基准', 'daily-selfcheck-report.md');

const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const TODAY = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const NOW = `${TODAY} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const JSON_OUT = has('--json');

/* ══════════════════════════════════════════════════════════════
 * 0. --refresh：先重跑 listing_engine（用 spawnSync 但 stdio:'ignore'）
 *    ⚠️ 不能捕获 stdout（沙箱 EPERM），只能让它自己写文件
 * ══════════════════════════════════════════════════════════════ */
if (has('--refresh')) {
  console.log('  ⏳ 重跑 listing_engine（不捕获输出，让它自己写 latest.json）...');
  const r = spawnSync(process.execPath, ['tools/listing_engine.mjs'], {
    cwd: ROOT, stdio: 'ignore', windowsHide: true, timeout: 300000,
  });
  console.log('  ' + (r.status === 0 ? '✅ 已刷新' : '⚠️ 退出码 ' + r.status + '（继续用现有数据）'));
}

/* ══════════════════════════════════════════════════════════════
 * 1. 强制读真实数据 —— 不存在就报错，绝不兜底
 * ══════════════════════════════════════════════════════════════ */
if (!existsSync(SRC)) {
  console.error('');
  console.error('  🚨 致命错误：找不到真实数据源');
  console.error('     期望：' + SRC.replace(ROOT, '.').replace(/\\/g, '/'));
  console.error('');
  console.error('  绝不允许用假数据兜底。请先跑：');
  console.error('     node tools\\listing_engine.mjs');
  console.error('  或：');
  console.error('     node tools\\daily_selfcheck.mjs --refresh');
  console.error('');
  process.exit(1);
}

let raw;
try {
  raw = JSON.parse(readFileSync(SRC, 'utf8'));
} catch (e) {
  console.error('  🚨 数据源不是合法 JSON：' + e.message);
  process.exit(1);
}

/* 校验结构（不猜，缺字段就报错） */
if (!Array.isArray(raw.platforms) || !raw.platforms.length) {
  console.error('  🚨 latest.json 缺 platforms 数组或为空 —— 结构不对，拒绝生成报告');
  process.exit(1);
}

const IS_QUICK = raw.quick === true;
const DATA_AT = raw.at || '?';
const DATA_AGE_H = Math.round((Date.now() - Date.parse(DATA_AT)) / 3600000 * 10) / 10;

/* ══════════════════════════════════════════════════════════════
 * 2. 真归因：从 conditions[] 抽（不硬编码）
 * ══════════════════════════════════════════════════════════════ */
function isQuickArtifact(cond) {
  /* quick 模式下 verify 类检查的典型假失败标记 */
  if (!IS_QUICK) return false;
  if (cond.level !== 'verify') return false;
  const det = String(cond.detail || '');
  return /quick|查询失败|查不到|页面打不开/i.test(det);
}

const listed = [];      /* 已收录：记它通过了什么 */
const ready = [];       /* 就绪待动作：硬条件全过但没线上验证 */
const missing = [];     /* 缺条件 */

for (const p of raw.platforms) {
  const conds = p.conditions || [];
  const passed = conds.filter((c) => c.pass);
  const failed = conds.filter((c) => !c.pass);
  const failedReal = failed.filter((c) => !isQuickArtifact(c));     /* 剔除 quick 假失败 */
  const failedFake = failed.filter((c) => isQuickArtifact(c));

  const item = {
    id: p.id,
    name: p.name,
    group: p.group,
    how: p.how,
    status: p.status,
    action: p.action,
    canIBoost: !!p.canIBoost,
    /* 真经验：通过的条件（这就是「为什么成功」的证据） */
    proven: passed.map((c) => ({ level: c.level, desc: c.desc, detail: c.detail })),
    /* 真差距：没通过的条件（这就是「为什么失败」的原因） */
    blocked: failedReal.map((c) => ({ level: c.level, desc: c.desc, detail: c.detail })),
    /* quick 模式下的假失败（单独标，不进经验库） */
    unverified: failedFake.map((c) => ({ level: c.level, desc: c.desc, detail: c.detail })),
  };

  if (p.status === 'listed') listed.push(item);
  else if (p.status === 'ready') ready.push(item);
  else missing.push(item);
}

/* ══════════════════════════════════════════════════════════════
 * 3. 经验迁移：把「成功平台证明过的条件类型」映射到「失败平台缺的条件」
 *
 * 不硬编码具体平台，而是按【条件 id 的语义】迁移：
 *   成功平台通过了 pkg_xxx/server_json/svr_pkg_match 这类「元数据规范」条件
 *   → 失败平台若缺「元数据/文件/提交」类条件，就用这套经验
 * ══════════════════════════════════════════════════════════════ */
const CATEGORY = {
  metadata: /pkg_|server_json|svr_|kw_|skill_frontmatter|readme|openapi|glama_json|dockerfile|dockerignore|npx_ok|skills_dir|skills_index/i,
  verify: /_live$|_search$|npx_exec|registry_live|npm_live/i,
  submit: /评分|PR|提交|审核/,
};

function categorize(desc) {
  for (const [k, re] of Object.entries(CATEGORY)) if (re.test(desc)) return k;
  return 'other';
}

/* 成功经验按类别汇总 */
const provenByCategory = {};
for (const it of listed) {
  for (const c of it.proven) {
    const cat = categorize(c.desc);
    if (!provenByCategory[cat]) provenByCategory[cat] = [];
    provenByCategory[cat].push({ platform: it.name, desc: c.desc });
  }
}

/* 对每个未收录/就绪平台：缺的条件归类 → 若能对上成功经验，就给出迁移建议 */
function buildMigration(item) {
  const tips = [];
  for (const b of item.blocked) {
    const cat = categorize(b.desc);
    const refs = provenByCategory[cat] || [];
    if (refs.length) {
      tips.push({
        gap: b.desc,
        detail: b.detail || '',
        category: cat,
        proof: refs.slice(0, 3).map((r) => r.platform + ' ✔ ' + r.desc),
        how: MIGRATION_HOW[cat] || '参考成功平台的同类做法',
      });
    } else {
      tips.push({
        gap: b.desc,
        detail: b.detail || '',
        category: cat,
        proof: [],
        how: MANUAL_HOW(b),
      });
    }
  }
  return tips;
}

const MIGRATION_HOW = {
  metadata: '照成功平台的做法补齐元数据（name/version/keywords/bin/规范文件），这些是「硬条件」，补齐即生效',
  verify: '元数据齐了之后才可能通过线上验证；先补硬条件，再等平台抓取/审核',
  submit: '需要人工提交：按成功品牌的提交经验走同样的表/PR 流程',
  other: '逐条对照成功平台的同类条件补齐',
};

function MANUAL_HOW(b) {
  const det = String(b.detail || '');
  if (/HTTP 4\d\d/.test(det)) return '端点上没有这个文件 → 上传对应文件（detail: ' + det.slice(0, 40) + '）';
  if (/TLS|CERT|ALTNAME/.test(det)) return '本机网络拦截（中间人）→ 换网络环境或改用 API 而非页面探测';
  if (/timeout|abort/i.test(det)) return '请求超时 → 稍后重试或降低探测频率';
  if (!b.detail || b.detail === '未满足') return '条件未满足，需人工确认平台最新要求';
  return '按 detail 处理：' + det.slice(0, 50);
}

/* ══════════════════════════════════════════════════════════════
 * 4. 与经验库做 Diff（看哪些条件补齐了 / 退化了）
 * ══════════════════════════════════════════════════════════════ */
let exp = { success_patterns: [], gap_analyses: [], snapshots: [], last_updated: null };
if (existsSync(EXP_FILE)) {
  try { exp = JSON.parse(readFileSync(EXP_FILE, 'utf8')); } catch { /* 坏了就重建 */ }
}
const prevMap = new Map((exp.gap_analyses || []).map((g) => [g.platform_id || g.platform, g]));

const fixed = [];      /* 上次缺、这次补齐了 */
const stillFailing = []; /* 上次缺、这次还缺 */
const newGaps = [];    /* 这次新出现的缺 */

for (const it of [...ready, ...missing]) {
  const prev = prevMap.get(it.id) || prevMap.get(it.name);
  const nowGaps = it.blocked.map((b) => b.desc);
  if (!prev) { newGaps.push({ name: it.name, gaps: nowGaps }); continue; }
  const prevGaps = prev.missing_conditions || [];
  const fixedNow = prevGaps.filter((g) => !nowGaps.includes(g));
  if (fixedNow.length) fixed.push({ name: it.name, fixed: fixedNow });
  if (nowGaps.length) stillFailing.push({ name: it.name, gaps: nowGaps });
}

/* ══════════════════════════════════════════════════════════════
 * 5. 落盘经验库（只存真实证据）
 * ══════════════════════════════════════════════════════════════ */
const snapshot = {
  date: TODAY,
  at: NOW,
  data_at: DATA_AT,
  quick_mode: IS_QUICK,
  totals: raw.totals || {},
  listed: listed.map((x) => x.name),
  ready: ready.map((x) => x.name),
  missing: missing.map((x) => x.name),
};

exp = {
  schema: 'mackorn-listing-experience/1',
  last_updated: new Date().toISOString(),
  /* 成功经验：每个已收录平台「证明了什么条件」（真证据，非推测） */
  success_patterns: listed.map((it) => ({
    platform_id: it.id,
    platform: it.name,
    date: TODAY,
    how: it.how,
    proven_conditions: it.proven.map((c) => c.desc),
  })),
  /* 差距分析：每个未就绪平台「缺什么条件」（真原因，非推测） */
  gap_analyses: [...ready, ...missing].map((it) => ({
    platform_id: it.id,
    platform: it.name,
    date: TODAY,
    status: it.status,
    missing_conditions: it.blocked.map((b) => b.desc),
    evidence: it.blocked.map((b) => b.desc + ' → ' + (b.detail || '')),
    quick_false_failures: it.unverified.map((c) => c.desc),
    migration: buildMigration(it),
    action: it.action,
    canIBoost: it.canIBoost,
  })),
  /* 历史快照（只留最近 60 条） */
  snapshots: [...(exp.snapshots || []), snapshot].slice(-60),
};

mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(EXP_FILE, JSON.stringify(exp, null, 2), 'utf8');
try {
  appendFileSync(HISTORY, JSON.stringify({
    date: TODAY, at: NOW,
    listed: listed.length, ready: ready.length, missing: missing.length,
    quick: IS_QUICK,
  }) + '\n', 'utf8');
} catch { /* 忽略 */ }

/* ══════════════════════════════════════════════════════════════
 * 6. 输出
 * ══════════════════════════════════════════════════════════════ */
if (JSON_OUT) {
  console.log(JSON.stringify(exp, null, 2));
  process.exit(missing.length > 0 ? 1 : 0);
}

console.log('');
console.log('  ╔═══════════════════════════════════════════════════════════╗');
console.log('    每日自检 · ' + NOW);
console.log('    数据源：listing-data/latest.json（' + DATA_AGE_H + ' 小时前' + (IS_QUICK ? ' · ⚠️ quick 模式' : '') + '）');
console.log('  ╚═══════════════════════════════════════════════════════════╝');
console.log('');

if (IS_QUICK) {
  console.log('  ⚠️ 数据来自 --quick 模式：所有 verify 类检查都是假失败，不可信');
  console.log('     → 要看真实收录状态，请跑：node tools\\listing_engine.mjs');
  console.log('     → 或跑：node tools\\daily_selfcheck.mjs --refresh');
  console.log('');
}
if (DATA_AGE_H > 48) {
  console.log('  ⚠️ 数据已 ' + DATA_AGE_H + ' 小时没更新 → 建议 --refresh');
  console.log('');
}

/* 总览 */
console.log('  ── 一、收录统计 ──');
console.log('  ✅ 已收录 ' + listed.length + ' · 🟡 就绪 ' + ready.length + ' · ❌ 缺条件 ' + missing.length);
console.log('');
if (listed.length) {
  console.log('  已收录：');
  for (const x of listed) console.log('    ✅ ' + x.name + '（' + x.how + '）');
  console.log('');
}

/* 经验库 */
console.log('  ── 二、收录经验库（真证据：这些条件被证明有效）──');
if (!listed.length) {
  console.log('  （还不存在已收录平台，无经验可提炼）');
} else {
  for (const it of listed) {
    console.log('  ✅ ' + it.name);
    for (const c of it.proven) console.log('      ✔ ' + c.desc);
  }
}
console.log('');

/* 差距 + 迁移 */
console.log('  ── 三、未收录的真差距 + 弥补措施 ──');
const todo = [...ready, ...missing];
if (!todo.length) {
  console.log('  🎉 全部收录，无需补差');
} else {
  for (const it of todo) {
    const icon = it.status === 'ready' ? '🟡' : '❌';
    console.log('  ' + icon + ' ' + it.name + '（' + it.how + '）');
    if (!it.blocked.length) {
      console.log('       ✔ 硬条件全过，只差线上验证');
    }
    const mig = buildMigration(it);
    for (const m of mig) {
      console.log('       ✗ 缺：' + m.gap);
      if (m.detail && m.detail !== '未满足') console.log('         证据：' + String(m.detail).slice(0, 70));
      console.log('         → ' + m.how);
      if (m.proof.length) console.log('         参照：' + m.proof.join(' / '));
    }
    if (it.unverified.length) {
      console.log('       ⊘ quick 模式下的假失败（不算缺口）：' + it.unverified.map((c) => c.desc).join(', '));
    }
    console.log('');
  }
}

/* Diff */
if (fixed.length || newGaps.length) {
  console.log('  ── 四、与上次的 Diff ──');
  for (const f of fixed) console.log('  ✅ 已补齐：' + f.name + ' → ' + f.fixed.join(', '));
  for (const n of newGaps) console.log('  🆕 新增缺口：' + n.name + ' → ' + n.gaps.join(', '));
  console.log('');
}

/* 今日三句话 */
console.log('  ══ 今日反省 / 补差 / 迭代 ══');
const p0 = missing[0];
if (IS_QUICK) {
  console.log('  【反省】这次数据是 quick 模式，verify 类全是假失败 —— 下次先跑完整模式');
} else if (p0) {
  console.log('  【补差】' + p0.name + '：' + (buildMigration(p0)[0]?.how || p0.action));
} else if (ready.length) {
  console.log('  【补差】' + ready[0].name + '：硬条件已过，只差线上验证 → 手动推一次');
} else {
  console.log('  【补差】无缺口，保持每日监控');
}
console.log('  【迭代】经验库已更新：' + exp.success_patterns.length + ' 条成功模式 · ' + exp.gap_analyses.length + ' 条差距分析');
console.log('');

console.log('  经验库：experience-data/listing-experience.json');
console.log('  历史：experience-data/history.jsonl');
console.log('');

/* ══════════════════════════════════════════════════════════════
 * 7. Markdown 报告
 * ══════════════════════════════════════════════════════════════ */
const md = [];
md.push('# 每日自检报告 · MACKORN 插件收录');
md.push('');
md.push('> 生成 ' + NOW + ' · 数据源 `listing-data/latest.json`（' + DATA_AGE_H + ' 小时前' + (IS_QUICK ? ' · **quick 模式，verify 类不可信**' : '') + '）');
md.push('> 本报告全部由真实 `conditions[]` 抽取，无硬编码、无假数据');
md.push('');
md.push('## 一、收录统计');
md.push('');
md.push('| 状态 | 数量 |');
md.push('|:---|---:|');
md.push('| ✅ 已收录 | ' + listed.length + ' |');
md.push('| 🟡 就绪待动作 | ' + ready.length + ' |');
md.push('| ❌ 缺条件 | ' + missing.length + ' |');
md.push('');
md.push('## 二、收录经验库（真证据）');
md.push('');
if (!listed.length) {
  md.push('（暂无已收录平台）');
} else {
  md.push('| 平台 | 收录方式 | 被证明有效的条件 |');
  md.push('|:---|:---|:---|');
  for (const it of listed) {
    md.push('| **' + it.name + '** | ' + it.how + ' | ' + it.proven.map((c) => c.desc).join('<br>') + ' |');
  }
}
md.push('');
md.push('## 三、未收录的真差距 + 弥补措施');
md.push('');
if (!todo.length) {
  md.push('全部收录，无需补差。');
} else {
  for (const it of todo) {
    md.push('### ' + (it.status === 'ready' ? '🟡' : '❌') + ' ' + it.name);
    md.push('');
    md.push('- **收录方式**：' + it.how);
    const mig = buildMigration(it);
    if (!mig.length) md.push('- ✔ 硬条件全过，只差线上验证');
    for (const m of mig) {
      md.push('- **缺**：' + m.gap);
      if (m.detail && m.detail !== '未满足') md.push('  - 证据：`' + String(m.detail).slice(0, 80) + '`');
      md.push('  - **动作**：' + m.how);
      if (m.proof.length) md.push('  - 参照：' + m.proof.join(' / '));
    }
    if (it.unverified.length) md.push('- ⊘ quick 模式假失败（不算缺口）：' + it.unverified.map((c) => c.desc).join(', '));
    md.push('');
  }
}
md.push('---');
md.push('');
md.push('*由 `tools/daily_selfcheck.mjs` 生成 · 每日重跑积累经验*');
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, md.join('\n'), 'utf8');
console.log('  Markdown 报告：distribution/03_验证与基准/daily-selfcheck-report.md');
console.log('');

/* 门禁模式 */
if (has('--check')) {
  if (missing.length > 0) {
    console.log('  ❌ 门禁失败：还有 ' + missing.length + ' 个平台缺条件');
    process.exit(1);
  }
  console.log('  ✅ 门禁通过：无缺条件平台');
}
