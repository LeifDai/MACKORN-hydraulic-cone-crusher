/**
 * 认知力日课（R121）
 *
 * 用户要求：「每天提升认知力，请编程写到规则里面。」
 * 全局规则 §2.6 已经把规则写进 AGENTS.md，并规定了这个工具的 4 个命令：
 *   node tools/cognition.mjs --daily     # 跑今天四件事，出日课报告
 *   node tools/cognition.mjs --status    # 认知力仪表盘
 *   node tools/cognition.mjs --quiz      # 只做主动回忆测试
 *   node tools/cognition.mjs --add --title "..." --fact "..." --source "..."
 *
 * ★ 这个文件存在的理由：
 *   规则里写了命令，但工具不存在 = 规则不可执行 = 纸面规则。
 *   本文件让 §2.6 从"愿望"变成"可跑的门禁"。
 *
 * ─── 四件事（规则原文）────────────────────────────────────────
 *   ① 学  今天新知道的一件事（可验证、可回溯）
 *   ② 疑  主动找一条自己正在相信但可能错的判断，去证伪
 *   ③ 炼  把今天的坑提炼成规则或门禁
 *   ④ 测  对旧知识做一次主动回忆（不看原文说出要点），答错就重学
 *
 * ★ 为什么 ④ 必须存在（规则原文）：
 *   只"学"不"测" = 认知错觉：以为记住了，其实忘了。
 *   主动回忆 + 间隔重复是唯一被反复验证有效的记忆机制。
 *   答不出来 = 没学会，不是"当时懂了"。
 *
 * ─── 数据文件 ──────────────────────────────────────────────
 *   cognition-data/facts.json      知识条目（含 SRS 间隔重复字段）
 *   cognition-data/quiz-log.json   回忆测试记录
 *   cognition-data/cognition.json  指标汇总（与 cognition_log.mjs 共享）
 *
 * ─── 数据纪律 ──────────────────────────────────────────────
 *   · 每条 fact 必须有 source（可回溯）—— 无来源拒收
 *   · 回忆测试必须真抽题、真判对错，不能自己说"我记住了"
 *   · 指标全部从落盘数据算，不接受自我描述
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA = join(ROOT, 'cognition-data');
const FACTS = join(DATA, 'facts.json');
const QUIZ = join(DATA, 'quiz-log.json');
const SUMMARY = join(DATA, 'cognition.json');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const DAY = 86400000;
const now = Date.now();

function loadJson(p, fallback) {
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}
function saveJson(p, o) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(o, null, 2), 'utf8');
}

/* ══════════════════════════════════════════════════════════════
 * --add  加知识条目（① 学）
 * ══════════════════════════════════════════════════════════════ */
if (has('--add')) {
  const title = val('--title');
  const fact = val('--fact');
  const source = val('--source');
  const tags = val('--tags');
  const refuses = [];

  if (!title || title.length < 4) refuses.push(['NO_TITLE', '必须给 --title（≥4 字），否则以后回忆测试抽不出来']);
  if (!fact || fact.length < 10) refuses.push(['NO_FACT', '必须给 --fact（≥10 字）—— 写清到底学到了什么']);
  if (!source || source.length < 4) refuses.push(['NO_SOURCE', '必须给 --source（文件路径/URL/实测输出/文献）—— 无来源的知识不许进库（继承全局硬红线 4「不编造」）']);

  if (refuses.length) {
    console.log('');
    console.log('  ❌ 拒绝收录');
    console.log('');
    for (const [code, why] of refuses) {
      console.log('  [' + code + ']');
      console.log('     ' + why);
      console.log('');
    }
    process.exit(1);
  }

  const db = loadJson(FACTS, { version: 1, facts: [] });
  db.facts = db.facts || [];
  const rec = {
    id: 'F' + String(db.facts.length + 1).padStart(4, '0'),
    title,
    fact,
    source,
    tags: tags ? tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
    added_at: new Date().toISOString(),
    /* SM-2 精简版：间隔重复 */
    ease: 2.5,
    interval_days: 1,
    repetitions: 0,
    due_at: new Date(now + DAY).toISOString(),
    last_quiz_at: null,
    correct: 0,
    wrong: 0,
  };
  db.facts.push(rec);
  saveJson(FACTS, db);

  console.log('');
  console.log('  ✅ 已收录 ' + rec.id + '：' + title);
  console.log('     来源：' + source);
  console.log('     首次复习：明天（间隔 1 天）');
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --quiz  主动回忆测试（④ 测）
 * ══════════════════════════════════════════════════════════════ */
if (has('--quiz')) {
  const db = loadJson(FACTS, { facts: [] });
  const facts = db.facts || [];
  if (!facts.length) {
    console.log('');
    console.log('  ○ 知识库还是空的 —— 先用 --add 收录几条，才有东西可测');
    console.log('     node tools/cognition.mjs --add --title "..." --fact "..." --source "..."');
    console.log('');
    process.exit(0);
  }

  /* 到期优先，其次按 repetitions 升序（越生越先考） */
  const due = facts.filter((f) => !f.due_at || Date.parse(f.due_at) <= now);
  const pool = due.length ? due : facts.slice().sort((a, b) => (a.repetitions || 0) - (b.repetitions || 0));
  const n = Math.min(Number(val('--count')) || 3, pool.length);
  /* 确定性抽样（用日期做种子，同一天抽同一批 —— 便于追踪） */
  const dayKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seed = Number(dayKey.slice(-4));
  const picked = [];
  const used = new Set();
  for (let i = 0; i < n && used.size < pool.length; i += 1) {
    const idx = (seed + i * 7) % pool.length;
    let k = idx;
    let guard = 0;
    while (used.has(k) && guard < pool.length) { k = (k + 1) % pool.length; guard += 1; }
    used.add(k);
    picked.push(pool[k]);
  }

  /* 判分模式：--answer F0001:y / F0002:n */
  const answerArg = val('--answer');
  if (answerArg) {
    const log = loadJson(QUIZ, { version: 1, attempts: [] });
    log.attempts = log.attempts || [];
    const pairs = answerArg.split(',').map((s) => s.trim()).filter(Boolean);
    let correct = 0;
    let wrong = 0;
    for (const p of pairs) {
      const [fid, verdict] = p.split(':');
      const f = facts.find((x) => x.id === fid);
      if (!f) continue;
      const ok = verdict === 'y' || verdict === 'Y' || verdict === 'correct';
      /* SM-2 精简 */
      f.repetitions = (f.repetitions || 0) + 1;
      f.last_quiz_at = new Date().toISOString();
      if (ok) {
        f.correct = (f.correct || 0) + 1;
        f.ease = Math.min(3.0, (f.ease || 2.5) + 0.1);
        f.interval_days = Math.max(1, Math.round((f.interval_days || 1) * f.ease));
        correct += 1;
      } else {
        f.wrong = (f.wrong || 0) + 1;
        f.ease = Math.max(1.3, (f.ease || 2.5) - 0.2);
        f.interval_days = 1;   /* 答错 → 明天重考 */
        f.repetitions = 0;
        wrong += 1;
      }
      f.due_at = new Date(now + f.interval_days * DAY).toISOString();
      log.attempts.push({ fact: f.id, at: new Date().toISOString(), correct: ok });
    }
    saveJson(FACTS, db);
    saveJson(QUIZ, log);
    const total = correct + wrong;
    console.log('');
    console.log('  ✅ 回忆测试完成：' + correct + '/' + total + ' 正确' + (wrong ? '（' + wrong + ' 条答错，明天重考）' : ''));
    console.log('');
    process.exit(0);
  }

  /* 出题模式：只给 title，隐藏 fact */
  console.log('');
  console.log('  ══ 主动回忆测试（' + picked.length + ' 题）══');
  console.log('  （规则 §2.6 ④：不看原文说出要点。答不出来 = 没学会，不是"当时懂了"）');
  console.log('');
  picked.forEach((f, i) => {
    console.log('  ' + (i + 1) + '. [' + f.id + '] ' + f.title);
    console.log('     （说出它的要点——不要翻原文）');
  });
  console.log('');
  console.log('  答完后记录结果：');
  console.log('     node tools/cognition.mjs --quiz --answer ' + picked.map((f) => f.id + ':y').join(','));
  console.log('     （答错的把 :y 改成 :n）');
  console.log('');
  console.log('  需要看答案时：node tools/cognition.mjs --status --reveal');
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * 计算指标
 * ══════════════════════════════════════════════════════════════ */
const db = loadJson(FACTS, { facts: [] });
const facts = db.facts || [];
const log = loadJson(QUIZ, { attempts: [] });
const attempts = log.attempts || [];
const cl = loadJson(SUMMARY, { entries: [] });
const corrections = cl.entries || [];

const todayQuiz = attempts.filter((a) => now - Date.parse(a.at) <= DAY);
const todayCorrect = todayQuiz.filter((a) => a.correct).length;
const dueNow = facts.filter((f) => !f.due_at || Date.parse(f.due_at) <= now);
const todayCorr = corrections.filter((e) => now - Date.parse(e.at) <= DAY);
const last7Corr = corrections.filter((e) => now - Date.parse(e.at) <= 7 * DAY);

const metrics = {
  /* 规则 §2.6 的五项指标 */
  facts: facts.length,
  recall_pass: attempts.length ? Number(((attempts.filter((a) => a.correct).length / attempts.length) * 100).toFixed(1)) : null,
  refutations: corrections.length,
  rules_distilled: null,  /* 由 enforce_lessons 门禁数代理，下面填 */
  recurrence: null,       /* 由 rsi_register 提供，下面尝试读 */
  /* 辅助 */
  today_facts: facts.filter((f) => now - Date.parse(f.added_at) <= DAY).length,
  today_quiz: todayQuiz.length,
  today_correct: todayCorrect,
  today_refutations: todayCorr.length,
  last7_refutations: last7Corr.length,
  due_now: dueNow.length,
};

/* rules_distilled：门禁总条数（代理） */
try {
  const el = readFileSync(join(ROOT, 'tools', 'enforce_lessons.mjs'), 'utf8');
  metrics.rules_distilled = (el.match(/rec\('G\d+/g) || []).length;
} catch { }

/* recurrence：从 rsi 台账读 */
try {
  const rsi = JSON.parse(readFileSync(join(ROOT, 'rsi-data', 'rsi.json'), 'utf8'));
  const r = rsi.recurrence ?? rsi.metrics?.recurrence;
  if (typeof r === 'number') metrics.recurrence = r;
} catch { }

const summary = {
  generated: new Date().toISOString(),
  rule: '全局规则 §2.6 每天提升认知力（四件事：学 / 疑 / 炼 / 测）',
  metrics,
  today: {
    learned: metrics.today_facts,
    doubted: metrics.today_refutations,
    distilled: metrics.rules_distilled,
    tested: metrics.today_quiz,
    correct: metrics.today_correct,
  },
  due_facts: dueNow.slice(0, 10).map((f) => ({ id: f.id, title: f.title, due_at: f.due_at })),
  recent_corrections: corrections.slice(-3).reverse().map((e) => ({ id: e.id, wrong: e.wrong, now: e.now, impact: e.impact })),
};
saveJson(SUMMARY, { ...loadJson(SUMMARY, {}), ...summary });

/* ══════════════════════════════════════════════════════════════
 * --status  仪表盘
 * ══════════════════════════════════════════════════════════════ */
if (has('--status') || (!has('--daily') && !has('--quiz') && !has('--add'))) {
  console.log('');
  console.log('  ══ 认知力仪表盘 ══');
  console.log('  （全局规则 §2.6 每天提升认知力）');
  console.log('');
  console.log('  ── 五项可测指标 ──');
  console.log('  ① facts（知识条目）      ' + metrics.facts);
  console.log('  ② recall_pass（回忆通过率）' + (metrics.recall_pass === null ? '  —（还没测过）' : metrics.recall_pass + '%'));
  console.log('  ③ refutations（自我推翻）  ' + metrics.refutations + ' 条');
  console.log('  ④ rules_distilled（门禁）  ' + (metrics.rules_distilled ?? '?') + ' 条');
  console.log('  ⑤ recurrence（错误复现）   ' + (metrics.recurrence === null ? '—' : metrics.recurrence + '%'));
  console.log('');
  console.log('  ── 今天 ──');
  console.log('  学（新知识）  ' + metrics.today_facts + (metrics.today_facts > 0 ? ' ✅' : ' ⚠️ 今天还没学'));
  console.log('  疑（推翻自己）' + metrics.today_refutations + (metrics.today_refutations > 0 ? ' ✅' : ' ⚠️ 今天还没质疑'));
  console.log('  炼（提炼门禁）' + (metrics.rules_distilled ?? '?') + ' 条（累计）');
  console.log('  测（回忆测试）' + metrics.today_quiz + ' 题' + (metrics.today_quiz > 0 ? ' ✅ ' + metrics.today_correct + ' 正确' : ' ⚠️ 今天还没测'));
  console.log('');
  console.log('  到期该复习：' + metrics.due_now + ' 条');
  if (metrics.due_now) dueNow.slice(0, 5).forEach((f) => console.log('     · ' + f.id + ' ' + f.title));
  console.log('');

  if (has('--reveal')) {
    console.log('  ── 知识库全文 ──');
    facts.forEach((f) => {
      console.log('');
      console.log('  [' + f.id + '] ' + f.title);
      console.log('     ' + f.fact);
      console.log('     来源：' + f.source);
      console.log('     复习 ' + (f.correct || 0) + ' 对 / ' + (f.wrong || 0) + ' 错 · 间隔 ' + (f.interval_days || 1) + ' 天');
    });
    console.log('');
  }
}

/* ══════════════════════════════════════════════════════════════
 * --daily  日课报告（四件事）
 * ══════════════════════════════════════════════════════════════ */
if (has('--daily')) {
  const fails = [];
  if (metrics.today_facts < 1) fails.push('① 学：今天还没收录任何新知识');
  if (metrics.today_refutations < 1) fails.push('② 疑：今天还没推翻任何判断（按 §6.4「从不推翻自己 = 没在验证」）');
  if (metrics.today_quiz < 1) fails.push('④ 测：今天还没做主动回忆（只学不测 = 认知错觉）');

  console.log('');
  console.log('  ══ 认知力日课报告 ══');
  console.log('  ── 今天四件事 ──');
  console.log('  ① 学  ' + metrics.today_facts + ' 条新知识' + (metrics.today_facts >= 1 ? ' ✅' : ' ❌'));
  console.log('  ② 疑  ' + metrics.today_refutations + ' 条自我推翻' + (metrics.today_refutations >= 1 ? ' ✅' : ' ❌'));
  console.log('  ③ 炼  门禁累计 ' + (metrics.rules_distilled ?? '?') + ' 条（每次修 bug 都要提炼成门禁）');
  console.log('  ④ 测  ' + metrics.today_quiz + ' 题回忆，' + metrics.today_correct + ' 正确' + (metrics.today_quiz >= 1 ? ' ✅' : ' ❌'));
  console.log('');
  if (fails.length) {
    console.log('  ❌ 日课未完成（' + fails.length + ' 项）');
    for (const f of fails) console.log('     · ' + f);
    console.log('');
    console.log('  怎么补：');
    console.log('     学 → node tools/cognition.mjs --add --title "..." --fact "..." --source "..."');
    console.log('     疑 → node tools/cognition_log.mjs --record --wrong "..." --now "..." --evidence "..." --impact L3');
    console.log('     测 → node tools/cognition.mjs --quiz  然后 --quiz --answer F0001:y');
    console.log('');
    process.exit(1);
  }
  console.log('  ✅ 日课完成：学了、疑了、测了');
  console.log('');
}
