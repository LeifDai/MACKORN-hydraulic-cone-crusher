/**
 * 断点续接程序（R194）—— 每次开工第一件事
 *
 * 用户要求（2026-10-27 16:39，连说两次）：
 *   「每次开工，都要回顾之前的对话，回顾焦点问题，
 *     请编写进入断电，断点续接程序」
 *
 * ══════════════════════════════════════════════════════════════
 * 为什么必须有这个
 *   会话之间不共享上下文。关机 = 上下文全丢。
 *   每次开工靠"翻聊天记录"或"凭记忆"接手 → 必漏事。
 *   ⇒ 把「接手」变成一条命令：node tools/resume.mjs
 *
 * 它做四件事（顺序固定）
 *   ① 找最新交接：上一次做到了哪、什么没做
 *   ② 跑焦点四件事：收录清单 / 已收录更新 / GitHub版本 / 待收录对策
 *   ③ 扫未完成的债：门禁、TODO、断链、版本不一致
 *   ④ 输出「今天第一件事」+ 「照这个顺序干」
 *
 * 设计原则
 *   · 一条命令，一个屏（≤35 行）
 *   · 默认不上网（--full 才上网）
 *   · 结果落盘：resume-data/latest.json
 *   · 历史留痕：resume-data/history.jsonl（知道每次开工在干什么）
 *
 * 用法
 *   node tools/resume.mjs           # 默认（不上网，2 秒出结果）
 *   node tools/resume.mjs --full    # 完整（含目录探测，约 30 秒）
 *   node tools/resume.mjs --json    # JSON 输出
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'resume-data');

/* 本地时间（不是 UTC）—— toISOString 是 UTC，会差 8 小时 */
const _d = new Date();
const _pad = (n) => String(n).padStart(2, '0');
const NOW_LOCAL = _d.getFullYear() + '-' + _pad(_d.getMonth() + 1) + '-' + _pad(_d.getDate())
  + ' ' + _pad(_d.getHours()) + ':' + _pad(_d.getMinutes());
const NOW = _d.toISOString();
const TODAY = _d.getFullYear() + '-' + _pad(_d.getMonth() + 1) + '-' + _pad(_d.getDate());

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const JSON_OUT = has('--json');
const FULL = has('--full');

const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return '' }; };
const readJson = (p) => { try { return JSON.parse(read(p)); } catch { return null; } };
const exists = (p) => existsSync(p);

const out = [];              /* 收集输出行 */
const say = (s = '') => out.push(s);

/* ══════════════════════════════════════════════════════════════
 * ① 找最新交接：上次做到哪、什么没做
 * ══════════════════════════════════════════════════════════════ */
function findLatestHandoff() {
  const distDir = join(ROOT, 'distribution');
  if (!exists(distDir)) return null;
  let cands = [];
  try {
    for (const f of readdirSync(distDir)) {
      if (!f.endsWith('.md')) continue;
      if (!/交接|第一眼|续接/.test(f)) continue;
      const p = join(distDir, f);
      const st = statSync(p);
      cands.push({ file: f, path: p, mtime: st.mtimeMs, size: st.size });
    }
  } catch { /* 读目录失败忽略 */ }
  if (!cands.length) return null;
  cands.sort((a, b) => b.mtime - a.mtime);
  const latest = cands[0];
  const text = read(latest.path);

  /* 从交接里抽「下次要做的」（P0/P1 行） */
  const todos = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:[-*]|\d+\.)?\s*(P0[- ]?\d?|P1[- ]?\d?)[：:]\s*(.+)$/);
    if (m) todos.push({ level: m[1], text: m[2].slice(0, 80) });
  }
  /* 也抽「第一件事」「下一步」这类行 */
  const nextLines = text.split('\n').filter((l) => /^(>|\*)?\s*\*?\*?(下一步|第一件事|下次|今天最该)/.test(l.trim())).slice(0, 3);

  /* 抽「已完成」（✅ 行）计数 */
  const doneCount = (text.match(/✅/g) || []).length;

  return {
    file: latest.file,
    when: new Date(latest.mtime).toISOString().slice(0, 16).replace('T', ' '),
    size_kb: Math.round(latest.size / 1024 * 10) / 10,
    hours_ago: Math.round((Date.now() - latest.mtime) / 3600000 * 10) / 10,
    count: cands.length,
    todos: todos.slice(0, 6),
    next_lines: nextLines,
    done_marks: doneCount,
  };
}

/* ══════════════════════════════════════════════════════════════
 * ② 焦点四件事（跑 daily_focus --quick）
 * ══════════════════════════════════════════════════════════════ */
function runFocus() {
  const latestFile = join(ROOT, 'focus-data', 'latest.json');
  const j = readJson(latestFile);
  if (!j || !Array.isArray(j.sections)) {
    return { ok: false, error: 'focus-data/latest.json 不存在 → 先跑 node tools/daily_focus.mjs' };
  }

  const listed = j.sections.find((s) => s.key === 'listed');
  const updates = j.sections.find((s) => s.key === 'updates');
  const github = j.sections.find((s) => s.key === 'github');
  const todo = j.sections.find((s) => s.key === 'todo');

  return {
    ok: true,
    date: j.date,
    stale_days: j.date === TODAY ? 0 : Math.round((Date.parse(TODAY) - Date.parse(j.date)) / 86400000),
    listed: listed ? {
      verdict: listed.verdict,
      next: listed.next,
      counts: {
        listed: listed.data?.probe_listed ?? 0,
        not_listed: listed.data?.probe_not_listed ?? 0,
        blocked: listed.data?.probe_blocked ?? 0,
        errors: listed.data?.probe_errors ?? 0,
      },
    } : null,
    updates: updates ? {
      verdict: updates.verdict,
      next: updates.next,
      stale: (updates.data?.stale || []).map((s) => s.file + ' — ' + s.issue),
    } : null,
    github: github ? { verdict: github.verdict, next: github.next } : null,
    todo: todo ? {
      verdict: todo.verdict,
      items: (todo.data?.items || []).map((x) => ({
        priority: x.priority, name: x.name, action: x.action, effort: x.effort, blocker: x.blocker,
      })),
    } : null,
  };
}

/* ══════════════════════════════════════════════════════════════
 * ③ 扫未完成的债
 * ══════════════════════════════════════════════════════════════ */
function scanDebt() {
  const debts = [];

  /* 3.1 版本一致性 */
  const pkg = readJson(join(ROOT, 'package.json')) || {};
  const cff = read(join(ROOT, 'CITATION.cff'));
  const cffVer = cff.match(/^version:\s*"?([^\s"]+)"?/m)?.[1];
  if (cffVer && pkg.version && cffVer !== pkg.version) {
    debts.push({ kind: '版本不一致', detail: `CITATION.cff ${cffVer} ≠ package.json ${pkg.version}`, fix: '改 CITATION.cff 的 version' });
  }

  /* 3.2 工具数一致性 */
  const toolCount = (pkg.description || '').match(/(\d+)\s*个工具/)?.[1];
  if (toolCount) {
    for (const f of ['README.md', 'llms.txt', 'AGENTS.md', 'QUICKSTART.md']) {
      const c = read(join(ROOT, f));
      if (!c) continue;
      const m = c.match(/(\d+)\s*(?:个工具|tools)/i);
      if (m && m[1] !== toolCount) {
        debts.push({ kind: '工具数不一致', detail: `${f}: ${m[1]} ≠ ${toolCount}`, fix: 'node tools/sync_tool_count_facts.mjs' });
      }
    }
  }

  /* 3.3 AGENTS.md 里提到的工具文件是否都存在 */
  const agents = read(join(ROOT, 'AGENTS.md'));
  if (agents) {
    const refs = [...new Set([...agents.matchAll(/tools[\/\\]([A-Za-z0-9_.\-]+\.mjs)/g)].map((m) => m[1]))];
    for (const f of refs) {
      if (!exists(join(ROOT, 'tools', f))) {
        debts.push({ kind: '文档引用不存在', detail: `AGENTS.md 提到 tools/${f} 但文件不存在`, fix: '改文档或补文件' });
      }
    }
  }

  /* 3.4 上次的焦点报告是否过期 */
  const focus = readJson(join(ROOT, 'focus-data', 'latest.json'));
  if (focus && focus.date !== TODAY) {
    debts.push({ kind: '焦点报告过期', detail: `focus-data 是 ${focus.date}，今天 ${TODAY}`, fix: 'node tools/daily_focus.mjs' });
  }

  /* 3.5 未推送的交接（有交接文档但 resume 没记录过） */
  const histPath = join(OUT_DIR, 'history.jsonl');
  const hist = exists(histPath) ? read(histPath).split('\n').filter(Boolean) : [];
  const lastRun = hist.length ? JSON.parse(hist[hist.length - 1]) : null;
  if (lastRun) {
    const hrs = (Date.now() - Date.parse(lastRun.at)) / 3600000;
    if (hrs > 24) {
      debts.push({ kind: '很久没开工', detail: `上次续接是 ${Math.round(hrs)} 小时前（${lastRun.date}）`, fix: '先看交接，再看焦点' });
    }
  }

  return debts;
}

/* ══════════════════════════════════════════════════════════════
 * ④ 定「今天第一件事」
 * ══════════════════════════════════════════════════════════════ */
function decideFirst(handoff, focus, debts) {
  /* 优先级 1：焦点报告过期 → 先跑 */
  if (debts.some((d) => d.kind === '焦点报告过期')) {
    return { action: 'node tools/daily_focus.mjs', why: '焦点报告过期，先拿今天真实数据' };
  }
  /* 优先级 2：P0 待收录 */
  const p0 = focus.ok && focus.todo?.items?.find((x) => x.priority === 'P0');
  if (p0) return { action: p0.name + '：' + p0.action, why: 'P0 待收录（' + (p0.effort || '?') + '）' };
  /* 优先级 3：版本/工具数不一致 */
  if (debts.some((d) => d.kind === '版本不一致' || d.kind === '工具数不一致')) {
    return { action: '修版本/工具数不一致（见下方债清单）', why: '文档与磁盘不一致 = 新人接手会踩坑' };
  }
  /* 优先级 4：交接里的 P0 */
  const hp0 = handoff?.todos?.find((t) => /^P0/.test(t.level));
  if (hp0) return { action: hp0.text, why: '上次交接的 P0' };
  /* 优先级 5：文档引用不存在 */
  if (debts.some((d) => d.kind === '文档引用不存在')) {
    return { action: '修文档里引用的不存在文件', why: '命令跑不了 = 规则失效' };
  }
  return { action: '按交接文档的 P1 继续', why: '无 P0 阻塞' };
}

/* ══════════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════════ */
const handoff = findLatestHandoff();
const focus = runFocus();
const debts = scanDebt();
const first = decideFirst(handoff, focus, debts);

/* 落盘 */
const report = {
  schema: 'mackorn-resume/1',
  date: TODAY,
  at: NOW,
  full: FULL,
  handoff,
  focus,
  debts,
  first,
};
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'latest.json'), JSON.stringify(report, null, 2), 'utf8');
writeFileSync(join(OUT_DIR, `resume-${TODAY}.json`), JSON.stringify(report, null, 2), 'utf8');
try {
  appendFileSync(join(OUT_DIR, 'history.jsonl'), JSON.stringify({
    date: TODAY, at: NOW,
    handoff: handoff?.file || null,
    debts: debts.length,
    first: first.action.slice(0, 60),
  }) + '\n', 'utf8');
} catch { /* 忽略 */ }

if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

/* ── 输出（一个屏）── */
say('');
say('  ╔═══════════════════════════════════════════════════════════╗');
say('    断点续接 · ' + TODAY + ' · ' + NOW_LOCAL.slice(11, 16));
say('  ╚═══════════════════════════════════════════════════════════╝');
say('');

/* ① 交接 */
say('  ── ① 上次做到哪 ──');
if (!handoff) {
  say('  ❌ 找不到交接文档（distribution/*交接*.md）');
} else {
  say('  最新交接：' + handoff.file);
  say('  时间：' + handoff.when + '（' + handoff.hours_ago + ' 小时前）· ' + handoff.size_kb + 'KB');
  if (handoff.done_marks > 0) say('  上次标记完成：' + handoff.done_marks + ' 项');
  if (handoff.todos.length) {
    say('  上次留的待办：');
    for (const t of handoff.todos) say('    [' + t.level + '] ' + t.text);
  }
}
say('');

/* ② 焦点 */
say('  ── ② 焦点：让更多 AI 收录我们 ──');
if (!focus.ok) {
  say('  ❌ ' + focus.error);
} else {
  if (focus.stale_days > 0) say('  ⚠️ 焦点报告是 ' + focus.stale_days + ' 天前的，需重跑');
  if (focus.listed) {
    const c = focus.listed.counts;
    say('  收录：' + c.listed + ' 个 · 未收录 ' + c.not_listed + ' · 被挡 ' + c.blocked + ' · 错误 ' + c.errors);
  }
  if (focus.updates) say('  已收录更新：' + focus.updates.verdict.replace(/^[✅⚠️]+\s*/, ''));
  if (focus.github) say('  GitHub 版本：' + focus.github.verdict.replace(/^[✅⚠️]+\s*/, ''));
  if (focus.todo && focus.todo.items.length) {
    say('  待收录 ' + focus.todo.items.length + ' 个：');
    for (const it of focus.todo.items.slice(0, 4)) say('    [' + it.priority + '] ' + it.name + ' — ' + it.blocker);
  }
}
say('');

/* ③ 债 */
say('  ── ③ 未完成的债（' + debts.length + ' 项）──');
if (!debts.length) {
  say('  ✅ 无');
} else {
  for (const d of debts.slice(0, 6)) say('  · [' + d.kind + '] ' + d.detail);
  if (debts.length > 6) say('  …还有 ' + (debts.length - 6) + ' 项（见 resume-data/latest.json）');
}
say('');

/* ④ 第一件事 */
say('  ── ④ 今天第一件事 ──');
say('  ★ ' + first.action);
say('    理由：' + first.why);
say('');
say('  报告：resume-data/latest.json');
say('  历史：resume-data/history.jsonl');
say('');

console.log(out.join('\n'));
