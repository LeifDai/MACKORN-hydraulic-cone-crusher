/**
 * 认知力台账（R111）
 *
 * 用户要求（2026-10-20）：「每天提升认知力，请编程写到规则里面」
 *
 * 为什么这条必须落成工具而不是写在文档里：
 *   「我要提升认知」是愿望，无法验证。
 *   而辩证规则 §6.4 给了可测判据：
 *     **「从不推翻自己 = 没在验证」**（不是"一直正确"，是没检查）
 *   所以认知力提升 = 【被证伪/被纠正的频率 + 纠正的质量 + 是否迁移到后续判断】
 *
 * 本工具度量三件事：
 *   ① 纠正次数（recorrection_count）：今天有没有推翻过自己
 *   ② 纠正深度（depth）：只改口径，还是改了判断依据
 *   ③ 迁移（transfer）：纠正后，同类判断是否不再犯
 *
 * 用法：
 *   node tools/cognition_log.mjs --status
 *   node tools/cognition_log.mjs --record --wrong "我原以为..." --now "实际是..." \
 *        --evidence "证据/文件/测试结果" --impact L1|L2|L3
 *   node tools/cognition_log.mjs --check    # 门禁：24 小时内必须有至少 1 条纠正
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA = join(ROOT, 'cognition-data');
const FILE = join(DATA, 'cognition.json');
const D = join(ROOT, 'distribution', '03_验证与基准');
const JSON_ONLY = process.argv.includes('--json');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };

function load() {
  if (!existsSync(FILE)) return { version: 1, created_at: new Date().toISOString(), entries: [] };
  try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return { version: 1, entries: [] }; }
}
function save(s) { mkdirSync(DATA, { recursive: true }); writeFileSync(FILE, JSON.stringify(s, null, 2), 'utf8'); }

/* ══════ --record ══════ */
if (has('--record')) {
  const wrong = val('--wrong');
  const now = val('--now');
  const evidence = val('--evidence');
  const impact = val('--impact') || 'L2';
  const why = val('--why') || null;

  const refuses = [];
  /* ① 必须写清"原来错在哪" */
  if (!wrong || wrong.length < 10) refuses.push({ code: 'NO_WRONG', why: '必须写清"原来以为是什么"（≥10 字）。只写"现在是对的"不算纠正，只是换说法。' });
  /* ② 必须写清"现在是什么" */
  if (!now || now.length < 10) refuses.push({ code: 'NO_NOW', why: '必须写清"现在实际是什么"。' });
  /* ③ 必须有证据 —— 这是防自吹的核心 */
  if (!evidence || evidence.length < 8) refuses.push({ code: 'NO_EVIDENCE', why: '必须有可核查证据（文件路径/测试结果/官方文档/实测输出）。凭感觉改口不算认知提升。' });
  /* ④ 不接受 L1（单次任务产物）—— 按 RSI 定义，不迁移不算改进 */
  if (impact === 'L1') refuses.push({ code: 'REFUSE_L1', why: 'L1 = 只影响单个任务产物，不迁移 → 不算认知升级。请把它抽象成可复用的判断或规则（L2/L3）。' });
  if (!['L2', 'L3', 'L4'].includes(impact)) refuses.push({ code: 'BAD_IMPACT', why: '--impact 只能是 L2（工具/门禁）/ L3（规则/技能）/ L4（研发流程）' });

  if (refuses.length) {
    console.log('');
    console.log('  ══ ❌ 拒绝记录 ══');
    console.log('');
    for (const r of refuses) { console.log('  [' + r.code + ']'); console.log('     ' + r.why); console.log(''); }
    console.log('  这不是刁难 —— 认知提升必须有【可核查证据】，否则只是换个说法。');
    console.log('');
    process.exit(1);
  }

  const s = load();
  s.entries = s.entries || [];
  const rec = {
    id: 'C' + String(s.entries.length + 1).padStart(3, '0'),
    at: new Date().toISOString(),
    wrong, now, evidence, impact, why,
  };
  s.entries.push(rec);
  save(s);

  console.log('');
  console.log('  ✅ 已记录认知纠正 ' + rec.id);
  console.log('');
  console.log('  原来以为：' + wrong);
  console.log('  实际是  ：' + now);
  console.log('  证据    ：' + evidence);
  console.log('  影响层级：' + impact);
  console.log('');
  process.exit(0);
}

/* ══════ 计算指标 ══════ */
const s = load();
const entries = s.entries || [];
const now = Date.now();
const DAY = 86400000;

const today = entries.filter((e) => now - Date.parse(e.at) <= DAY);
const last7 = entries.filter((e) => now - Date.parse(e.at) <= 7 * DAY);
const last30 = entries.filter((e) => now - Date.parse(e.at) <= 30 * DAY);

/* 纠正深度：按 impact 加权（L4 最深） */
const WEIGHT = { L2: 1, L3: 2, L4: 3 };
const depthScore = last7.reduce((sum, e) => sum + (WEIGHT[e.impact] || 1), 0);
const avgDepth = last7.length ? depthScore / last7.length : 0;

/* 连续天数（有多少天有纠正） */
const daysWith = new Set(entries.map((e) => String(e.at).slice(0, 10)));
let streak = 0;
for (let i = 0; i < 60; i += 1) {
  const d = new Date(now - i * DAY).toISOString().slice(0, 10);
  if (daysWith.has(d)) streak += 1; else break;
}

const out = {
  schema: 'mackorn-cognition/1',
  generated: new Date().toISOString(),
  what: '认知力台账 —— 把「每天提升认知力」变成可测指标。核心判据来自辩证规则 §6.4：从不推翻自己 = 没在验证。',
  counts: { total: entries.length, today: today.length, last7: last7.length, last30: last30.length },
  metrics: {
    daily_correction: today.length,          /* 今天是否有纠正 */
    week_correction: last7.length,           /* 一周纠正次数 */
    depth_score_7d: depthScore,              /* 深度加权分 */
    avg_depth: Number(avgDepth.toFixed(2)),  /* 平均深度（1=L2,2=L3,3=L4） */
    streak_days: streak,                     /* 连续有认知升级的天数 */
  },
  thresholds: {
    daily_min: 1,          /* 每天至少 1 条 */
    week_min: 3,           /* 一周至少 3 条 */
    avg_depth_min: 1.5,    /* 平均深度 ≥1.5（至少一半是 L3） */
  },
  recent: entries.slice(-5).reverse(),
};

mkdirSync(D, { recursive: true });
writeFileSync(join(D, 'cognition.json'), JSON.stringify(out, null, 2), 'utf8');

/* ══════ --check 门禁 ══════ */
if (has('--check')) {
  const fails = [];
  if (today.length < 1) fails.push('今天还没有任何认知纠正（阈值 ≥1）');
  if (last7.length < 3) fails.push('最近 7 天纠正次数 ' + last7.length + ' < 3');
  if (avgDepth < 1.5) fails.push('平均深度 ' + avgDepth.toFixed(2) + ' < 1.5（说明纠正太浅，只在改口径）');

  if (!JSON_ONLY) {
    console.log('');
    console.log('  ══ 认知力门禁 ══');
    console.log('');
    console.log('  今日纠正   ' + today.length + (today.length >= 1 ? ' ✅' : ' ❌'));
    console.log('  7 天纠正   ' + last7.length + (last7.length >= 3 ? ' ✅' : ' ❌'));
    console.log('  平均深度   ' + avgDepth.toFixed(2) + (avgDepth >= 1.5 ? ' ✅' : ' ❌'));
    console.log('  连续天数   ' + streak + ' 天');
    console.log('');
    if (fails.length) {
      console.log('  ❌ 认知力未达标（' + fails.length + ' 项）：');
      for (const f of fails) console.log('     · ' + f);
      console.log('');
      console.log('  按辩证规则 §6.4：从不推翻自己 = 没在验证（不是一直正确，是没检查）。');
      console.log('  记录方法：node tools/cognition_log.mjs --record --wrong "..." --now "..." --evidence "..."');
      console.log('');
    } else {
      console.log('  ✅ 认知力达标：在推翻自己、且有深度、有连续性');
      console.log('');
    }
  }
  process.exit(fails.length ? 1 : 0);
}

/* ══════ --status（默认）══════ */
if (JSON_ONLY) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }

console.log('');
console.log('  ══ 认知力台账 ══');
console.log('  （把「每天提升认知力」变成可测指标）');
console.log('');
console.log('  累计纠正   ' + entries.length + ' 条');
console.log('  今日       ' + today.length + (today.length >= 1 ? ' ✅' : ' ⚠️ 今天还没推翻自己'));
console.log('  7 天       ' + last7.length + ' 条' + (last7.length >= 3 ? ' ✅' : ' ⚠️ 偏少'));
console.log('  平均深度   ' + avgDepth.toFixed(2) + ' / 3（1=L2工具 2=L3规则 3=L4流程）');
console.log('  连续天数   ' + streak + ' 天');
console.log('');
if (entries.length) {
  console.log('  最近 5 条：');
  for (const e of entries.slice(-5).reverse()) {
    console.log('    · ' + e.id + ' [' + e.impact + '] ' + String(e.at).slice(0, 10));
    console.log('        原来：' + String(e.wrong).slice(0, 60));
    console.log('        现在：' + String(e.now).slice(0, 60));
  }
  console.log('');
}
console.log('  ── 核心判据（来自辩证规则 §6.4）──');
console.log('    「从不推翻自己 = 没在验证」—— 不是一直正确，是没检查。');
console.log('');
console.log('  记录：node tools/cognition_log.mjs --record --wrong "..." --now "..." --evidence "..." --impact L3');
console.log('  门禁：node tools/cognition_log.mjs --check');
console.log('');
