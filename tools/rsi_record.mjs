/**
 * RSI 干预记录器（R95）—— 会「拒绝」的引擎
 *
 * 依据更新后的全局规则 §3.1 / §3.4 / §3.5：
 *
 *   引擎【必须拒绝】这些申报：
 *     ① 没有基线就宣布改进
 *     ② L1（单个任务产物，不迁移）—— 不算 RSI
 *     ③ L5（改自身模型权重）—— 我们做不到，申报即拒
 *     ④ 改进让门禁数下降 —— 退化，立即回滚
 *     ⑤ recurrence 上升 —— 假改进
 *     ⑥ 没有退路（不能回滚）的干预 —— 单行道，不许
 *
 * 为什么这比"测级别"更重要：
 *   级别可以往高了报，拒绝是【机械闸门】。
 *   一个不会拒绝的 RSI 引擎，等于给自吹开了绿灯。
 *
 * 用法：
 *   node tools/rsi_record.mjs --baseline
 *   node tools/rsi_record.mjs --record --title "..." --layer L2 \
 *        --change "..." --evidence "..." --rollback "git checkout ..."
 *   node tools/rsi_record.mjs --status
 *   node tools/rsi_record.mjs --verify
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');
const DATA = join(ROOT, 'rsi-data');
const RSI_PATH = join(DATA, 'rsi.json');
const LV_PATH = join(D, 'rsi-level.json');
const REG_PATH = join(D, 'rsi-register.json');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = null) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

const ALLOWED_LAYERS = ['L2', 'L3', 'L4'];   // L1 不迁移不算 RSI；L5 做不到

function load() {
  if (!existsSync(RSI_PATH)) return { version: 1, created_at: new Date().toISOString(), baselines: {}, rounds: [], last_verify: null };
  try { return JSON.parse(readFileSync(RSI_PATH, 'utf8')); } catch { return { version: 1, baselines: {}, rounds: [], last_verify: null }; }
}
function save(s) { mkdirSync(DATA, { recursive: true }); writeFileSync(RSI_PATH, JSON.stringify(s, null, 2), 'utf8'); }
function readJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }

/* ── 当前指标快照 ── */
async function snapshot() {
  const snap = { at: new Date().toISOString(), gates: null, lessons: null, recurrence: null, level: null, tools: null };

  /* 门禁数：直接数 rec(' 调用 */
  try {
    const g = readFileSync(join(HERE, 'enforce_lessons.mjs'), 'utf8');
    snap.gates = (g.match(/\brec\(/g) || []).length;
  } catch { }
  /* 教训数 */
  try {
    const M = await import(pathToFileURL(join(HERE, 'lessons.mjs')).href);
    snap.lessons = (M.LESSONS || []).length;
  } catch { }
  /* recurrence（用已有的台账结果，不重跑以免慢） */
  {
    const j = readJson(REG_PATH);
    if (j && typeof j.recurrence === 'number') snap.recurrence = j.recurrence;
  }
  /* 级别 */
  {
    const j = readJson(LV_PATH);
    if (j && typeof j.level === 'number') snap.level = j.level;
  }
  /* 工具数 */
  try {
    const c = readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8');
    snap.tools = [...new Set([...c.matchAll(/^\s{2}name: '(mackorn_[a-z_]+)',/gm)].map((m) => m[1]))].length;
  } catch { }
  return snap;
}

/* ══════ --baseline ══════ */
if (has('--baseline')) {
  const s = load();
  const snap = await snapshot();
  s.baselines = s.baselines || {};
  const key = val('--key', 'current');
  s.baselines[key] = snap;
  save(s);
  console.log('');
  console.log('  ══ 基线已快照 ══');
  console.log('');
  console.log('  key          ' + key);
  console.log('  门禁数       ' + snap.gates);
  console.log('  教训数       ' + snap.lessons);
  console.log('  recurrence   ' + (snap.recurrence === null ? '未测' : (snap.recurrence * 100).toFixed(1) + '%'));
  console.log('  RSI 级别     L' + (snap.level ?? '?'));
  console.log('  工具数       ' + snap.tools);
  console.log('');
  console.log('  💡 改之前必须先基线 —— 没有基线的"改进"不算证据。');
  console.log('');
  process.exit(0);
}

/* ══════ --record ══════ */
if (has('--record')) {
  const s = load();
  const layer = val('--layer');
  const title = val('--title');
  const change = val('--change');
  const evidence = val('--evidence');
  const rollback = val('--rollback');
  const key = val('--key', 'current');

  const refuses = [];

  /* ① 拒绝无基线 */
  const base = s.baselines && s.baselines[key];
  if (!base) refuses.push({ code: 'NO_BASELINE', why: '没有基线。先跑 --baseline 再改。没有基线的改进无法证明，不算 RSI。' });

  /* ② 必须给层 */
  if (!layer) refuses.push({ code: 'NO_LAYER', why: '必须指定 --layer L2/L3/L4（说明改的是什么层级）。' });

  /* ③ 拒绝 L1 */
  if (layer === 'L1') refuses.push({ code: 'REFUSE_L1', why: 'L1 = 单个任务产物，不迁移 → 按定义不算 RSI。请把它固化成工具/规则再记。' });

  /* ④ 拒绝 L5 */
  if (layer === 'L5') refuses.push({ code: 'REFUSE_L5', why: 'L5 = 改进自身基础模型权重。本项目做不到 —— 申报即拒。这是为了防"能自己进化出更强模型"的吹法。' });

  /* ⑤ 层必须在允许集合 */
  if (layer && !ALLOWED_LAYERS.includes(layer)) refuses.push({ code: 'BAD_LAYER', why: '--layer 只能是 ' + ALLOWED_LAYERS.join(' / ') + '。' });

  /* ⑥ 必须有证据 */
  if (!evidence || String(evidence).length < 10) refuses.push({ code: 'NO_EVIDENCE', why: '必须给 --evidence（可核查的证据：测试输出/文件路径/数字）。自我描述证据力为零。' });

  /* ⑦ 必须有退路 */
  if (!rollback || String(rollback).length < 5) refuses.push({ code: 'NO_ROLLBACK', why: '必须给 --rollback（怎么回滚）。没有回滚能力的改进是单行道，不许记。' });

  /* ⑧ 现在复测：门禁数不能降、recurrence 不能升 */
  const now = await snapshot();
  if (base && now.gates !== null && base.gates !== null && now.gates < base.gates) {
    refuses.push({ code: 'GATES_DECREASED', why: '门禁数从 ' + base.gates + ' 降到 ' + now.gates + ' —— 退化，立即回滚。' });
  }
  if (base && now.recurrence !== null && base.recurrence !== null && now.recurrence > base.recurrence) {
    refuses.push({ code: 'RECURRENCE_UP', why: 'recurrence 从 ' + (base.recurrence * 100).toFixed(1) + '% 升到 ' + (now.recurrence * 100).toFixed(1) + '% —— 假改进（门禁加了但同类错误照样犯）。' });
  }

  if (refuses.length) {
    console.log('');
    console.log('  ══ ❌ 拒绝记录这次干预 ══');
    console.log('');
    for (const r of refuses) {
      console.log('  [' + r.code + ']');
      console.log('     ' + r.why);
      console.log('');
    }
    console.log('  ── 这不是刁难，是防止"用自我描述替代测量" ──');
    console.log('     全局规则 §3.4 明确：没有基线/换标准/不迁移/门禁变少/文档写长/自我描述 —— 都不算 RSI。');
    console.log('');
    process.exit(1);
  }

  /* 通过 → 记录 */
  s.rounds = s.rounds || [];
  const rec = {
    id: 'R' + (s.rounds.length + 1),
    at: new Date().toISOString(),
    title, layer, change, evidence, rollback,
    before: base,
    after: now,
    delta: {
      gates: (now.gates ?? 0) - (base.gates ?? 0),
      lessons: (now.lessons ?? 0) - (base.lessons ?? 0),
      recurrence: (now.recurrence !== null && base.recurrence !== null) ? now.recurrence - base.recurrence : null,
      level: (now.level !== null && base.level !== null) ? now.level - base.level : null,
    },
  };
  s.rounds.push(rec);
  save(s);

  console.log('');
  console.log('  ══ ✅ 已记录干预 ' + rec.id + ' ══');
  console.log('');
  console.log('  标题    ' + title);
  console.log('  层级    ' + layer);
  console.log('  改了什么 ' + change);
  console.log('  证据    ' + evidence);
  console.log('  退路    ' + rollback);
  console.log('');
  console.log('  ── 前后对比 ──');
  console.log('    门禁数       ' + base.gates + ' → ' + now.gates + (rec.delta.gates >= 0 ? '  ✅' : '  ❌'));
  console.log('    教训数       ' + base.lessons + ' → ' + now.lessons + (rec.delta.lessons >= 0 ? '  ✅' : '  ❌'));
  console.log('    recurrence   ' + (base.recurrence === null ? '?' : (base.recurrence * 100).toFixed(1) + '%') + ' → ' + (now.recurrence === null ? '?' : (now.recurrence * 100).toFixed(1) + '%') + (rec.delta.recurrence !== null && rec.delta.recurrence <= 0 ? '  ✅' : ''));
  console.log('    RSI 级别     L' + (base.level ?? '?') + ' → L' + (now.level ?? '?'));
  console.log('');
  console.log('  💡 下一步：node tools/rsi_record.mjs --verify   （复测并确认迁移）');
  console.log('');
  process.exit(0);
}

/* ══════ --verify ══════ */
if (has('--verify')) {
  const s = load();
  const now = await snapshot();
  const last = (s.rounds || [])[s.rounds.length - 1] || null;
  s.last_verify = now;
  save(s);

  console.log('');
  console.log('  ══ RSI 复测 ══');
  console.log('');
  console.log('  当前门禁数   ' + now.gates);
  console.log('  当前教训数   ' + now.lessons);
  console.log('  当前 recurrence ' + (now.recurrence === null ? '未测' : (now.recurrence * 100).toFixed(1) + '%'));
  console.log('  当前级别     L' + (now.level ?? '?'));
  console.log('');
  if (!last) { console.log('  ○ 还没有记录过干预（先 --baseline 再 --record）'); console.log(''); process.exit(0); }
  console.log('  对比最近一次干预（' + last.id + '）:');
  const okG = (now.gates ?? 0) >= (last.before.gates ?? 0);
  const okR = (now.recurrence === null || last.before.recurrence === null) ? true : now.recurrence <= last.before.recurrence;
  console.log('    门禁数     ' + last.before.gates + ' → ' + now.gates + (okG ? '  ✅ 未退化' : '  ❌ 退化了'));
  console.log('    recurrence ' + ((last.before.recurrence ?? 0) * 100).toFixed(1) + '% → ' + ((now.recurrence ?? 0) * 100).toFixed(1) + '%' + (okR ? '  ✅ 未上升' : '  ❌ 上升了 = 假改进'));
  console.log('');
  const pass = okG && okR;
  console.log('  ' + (pass ? '✅ 复测通过：改进站得住' : '❌ 复测失败：请回滚（' + last.rollback + '）'));
  console.log('');
  process.exit(pass ? 0 : 1);
}

/* ══════ --check-loop（闭环完整性）══════
 *   全局规则要求：闭环四环节缺一不算改进。
 *   本检查对每条已记录干预验四件事：
 *     ① 有基线 before
 *     ② 有证据 evidence（可核查）
 *     ③ 有退路 rollback
 *     ④ 已复测（last_verify 在干预之后）
 *   任一不满足 → exit 1。
 */
if (has('--check-loop')) {
  const s = load();
  const rounds = s.rounds || [];
  const lv = readJson(LV_PATH);
  const rg = readJson(REG_PATH);
  const problems = [];

  if (!rounds.length) problems.push('还没有任何已记录的干预（先 --baseline 再 --record）');
  for (const r of rounds) {
    if (!r.before) problems.push(r.id + ' 缺基线');
    if (!r.evidence || String(r.evidence).length < 10) problems.push(r.id + ' 缺可核查证据');
    if (!r.rollback || String(r.rollback).length < 5) problems.push(r.id + ' 缺回滚方案');
  }
  /* 复测必须在最近一次干预之后 */
  if (rounds.length) {
    const lastAt = Date.parse(rounds[rounds.length - 1].at);
    const vAt = s.last_verify ? Date.parse(s.last_verify.at) : NaN;
    if (!(Number.isFinite(vAt) && vAt >= lastAt)) problems.push('最近一次干预之后还没有 --verify 复测');
  }
  /* recurrence 必须已测且为 0 */
  if (!rg) problems.push('recurrence 未测（先跑 rsi_register.mjs）');
  else if (rg.recurrence !== 0) problems.push('recurrence = ' + (rg.recurrence * 100).toFixed(1) + '%（必须为 0）');
  /* 级别必须已判 */
  if (!lv) problems.push('RSI 级别未判（先跑 rsi_level.mjs）');

  console.log('');
  console.log('  ══ RSI 闭环完整性检查 ══');
  console.log('');
  console.log('  已记录干预   ' + rounds.length);
  console.log('  recurrence   ' + (rg ? (rg.recurrence * 100).toFixed(1) + '%' : '未测'));
  console.log('  RSI 级别     ' + (lv ? 'L' + lv.level : '未判'));
  console.log('');
  if (problems.length) {
    console.log('  ❌ 闭环不完整（' + problems.length + ' 项）：');
    for (const p of problems) console.log('     · ' + p);
    console.log('');
    console.log('  全局规则：闭环四环节（基线/干预/复测/迁移）缺一不算改进。');
    console.log('');
    process.exit(1);
  }
  console.log('  ✅ 闭环完整：基线 ✓ 证据 ✓ 退路 ✓ 复测 ✓ recurrence=0 ✓');
  console.log('');
  process.exit(0);
}

/* ══════ --status（默认）══════ */
const s = load();
const now = await snapshot();
const rounds = s.rounds || [];
console.log('');
console.log('  ══ RSI 引擎状态 ══');
console.log('');
console.log('  当前指标');
console.log('    门禁数       ' + now.gates);
console.log('    教训数       ' + now.lessons);
console.log('    recurrence   ' + (now.recurrence === null ? '未测（先跑 rsi_register.mjs）' : (now.recurrence * 100).toFixed(1) + '%' + (now.recurrence === 0 ? '  ✅' : '  ⚠️')));
console.log('    RSI 级别     L' + (now.level ?? '?'));
console.log('    工具数       ' + now.tools);
console.log('');
console.log('  基线         ' + Object.keys(s.baselines || {}).join(', ') || '（无）');
console.log('  已记录干预   ' + rounds.length + ' 次');
if (rounds.length) {
  console.log('');
  console.log('  最近 5 次：');
  for (const r of rounds.slice(-5)) {
    console.log('    · ' + r.id + ' [' + r.layer + '] ' + String(r.title).slice(0, 44) + '  →  门禁 ' + (r.delta.gates >= 0 ? '+' : '') + r.delta.gates);
  }
}
console.log('');
console.log('  ── 引擎的拒绝规则（防自吹）──');
console.log('    ❌ 无基线就宣布改进');
console.log('    ❌ L1（单个任务产物，不迁移）');
console.log('    ❌ L5（改自身模型权重 —— 我们做不到）');
console.log('    ❌ 门禁数下降（退化）');
console.log('    ❌ recurrence 上升（假改进）');
console.log('    ❌ 没有回滚方案（单行道）');
console.log('    ❌ 没有可核查证据（自我描述证据力为零）');
console.log('');
console.log('  台账：rsi-data/rsi.json');
console.log('');
process.exit(0);
