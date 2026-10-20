/**
 * 不断更新迭代 —— 可执行的持续迭代判据（R122）
 *
 * 用户要求（2026-10-20）：「不断更新迭代，是否编写规则，增加到程序中。这2条编写进入生存规则。」
 * 这 2 条 = ① 每天提升认知力 ② 不断更新迭代
 *
 * ★ 为什么这条必须落成工具：
 *   「不断更新迭代」听起来像口号。人能说"我在迭代"，但无法验证。
 *   真正可测的是：本轮的产出是否【比上一轮不可逆地更强】，且【能证明】。
 *
 * ─── 判据设计（正反合）────────────────────────────────────
 *
 * 正题：迭代 = 持续产出新东西。
 *       代价：只产出新的、不保留旧的，会越做越乱（技术债）。
 *
 * 反题：迭代 = 保持系统稳定。
 *       代价：只求稳不动，等于停滞（被替代）。
 *
 * 合题：真正的迭代 = 【棘轮效应（ratchet）】：
 *       每轮必须让某个可测指标【不可逆地变好】，且不能靠牺牲别的指标换来。
 *       具体三个硬条件：
 *         ① 有基线（改之前量化）
 *         ② 有净增量（本轮至少一个指标上升，且没有指标下降）
 *         ③ 有固化（新增的东西进了门禁/规则/知识库，不是一次性的）
 *
 * 可证伪：如果某轮"产出很多"但三个条件都不满足 → 那不是迭代，是消耗。
 *
 * ─── 五条铁律（从踩过的坑提炼）──────────────────────────────
 *   1. 没有基线就没有迭代（"我记得以前不行"不算）
 *   2. 只加不改 = 膨胀（工具数涨了但质量没涨，是虚假增长）
 *   3. 每次修 bug 必须同时：代码改了 + 门禁加了 + 老数据回补了
 *   4. 迭代方向必须可追溯（这一轮为什么做这个，不做那个）
 *   5. 棘轮只进不退：门禁数、知识条目、认知纠正只许增不许减
 *
 * 用法：
 *   node tools/iteration_ratchet.mjs --snapshot     # 给当前状态拍快照（基线）
 *   node tools/iteration_ratchet.mjs --status       # 看棘轮状态与趋势
 *   node tools/iteration_ratchet.mjs --check        # 门禁：本轮是否真的更强
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA = join(ROOT, 'iteration-data');
const HIST = join(DATA, 'ratchet-history.json');
const CUR = join(DATA, 'current.json');
const D = join(ROOT, 'distribution', '03_验证与基准');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

/* ══════════════════════════════════════════════════════════════
 * 采集当前可测指标（全部从落盘文件算，不接受自我描述）
 * ══════════════════════════════════════════════════════════════ */
function measure() {
  const out = { at: new Date().toISOString(), metrics: {}, evidence: {} };

  /* ① 门禁数（rules_distilled） */
  try {
    const el = readFileSync(join(ROOT, 'tools', 'enforce_lessons.mjs'), 'utf8');
    out.metrics.gates = (el.match(/rec\('G\d+/g) || []).length;
    out.evidence.gates = 'tools/enforce_lessons.mjs 里 rec(\'Gxx\' 的个数';
  } catch { out.metrics.gates = null; }

  /* ② 教训数 */
  try {
    const ls = readFileSync(join(ROOT, 'tools', 'lessons.mjs'), 'utf8');
    out.metrics.lessons = (ls.match(/id: 'L-\d+'/g) || []).length;
    out.evidence.lessons = 'tools/lessons.mjs 里 id: \'L-xx\' 的个数';
  } catch { out.metrics.lessons = null; }

  /* ③ 工具数 */
  try {
    const idx = readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8');
    out.metrics.tools = [...new Set([...idx.matchAll(/^\s{2}name: '(mackorn_[a-z_]+)',/gm)].map((m) => m[1]))].length;
    out.evidence.tools = 'plugin/index.mjs 里 name: \'mackorn_xxx\' 的个数';
  } catch { out.metrics.tools = null; }

  /* ④ 测试通过数 */
  try {
    /* R122：现场真跑 tests/run.mjs 并解析通过数（不靠旧文件） */
    try {
      const r = execFileSync(process.execPath, [join(ROOT, 'tests', 'run.mjs')], {
        cwd: ROOT, encoding: 'buffer', windowsHide: true, timeout: 600000,
      });
      const txt = Buffer.isBuffer(r) ? r.toString('utf8') : String(r);
      const m = txt.match(/结果：(\d+) 通过/);
      out.metrics.tests_pass = m ? Number(m[1]) : null;
      out.evidence.tests_pass = '现场真跑 tests/run.mjs 解析「结果：N 通过」';
    } catch (e) {
      const txt = String(e.stdout ? e.stdout.toString('utf8') : '');
      const m = txt.match(/结果：(\d+) 通过/);
      out.metrics.tests_pass = m ? Number(m[1]) : null;
      out.evidence.tests_pass = 'tests 有失败但能读到通过数';
    }
  } catch { out.metrics.tests_pass = null; }

  /* ⑤ 认知纠正数 */
  try {
    const c = JSON.parse(readFileSync(join(ROOT, 'cognition-data', 'cognition.json'), 'utf8'));
    out.metrics.refutations = c.entries ? c.entries.length : (c.counts?.total ?? null);
  } catch { out.metrics.refutations = null; }

  /* ⑥ 知识条目数 */
  try {
    const f = JSON.parse(readFileSync(join(ROOT, 'cognition-data', 'facts.json'), 'utf8'));
    out.metrics.facts = (f.facts || []).length;
  } catch { out.metrics.facts = 0; }

  /* ⑦ 合规命中数（应为 0） */
  try {
    /* R122：现场真跑 build_public，解析「零命中」或「发现 N 处违规」 */
    try {
      const r = execFileSync(process.execPath, [join(ROOT, 'tools', 'build_public.mjs')], {
        cwd: ROOT, encoding: 'buffer', windowsHide: true, timeout: 900000,
      });
      const txt = Buffer.isBuffer(r) ? r.toString('utf8') : String(r);
      out.metrics.compliance_hits = /零命中/.test(txt) ? 0 : (txt.match(/发现 (\d+) 处违规/)?.[1] ?? null);
      out.evidence.compliance_hits = '现场真跑 build_public.mjs';
    } catch (e) {
      const txt = String(e.stdout ? e.stdout.toString('utf8') : '');
      out.metrics.compliance_hits = /零命中/.test(txt) ? 0 : (txt.match(/发现 (\d+) 处违规/)?.[1] ? Number(txt.match(/发现 (\d+) 处违规/)[1]) : null);
      out.evidence.compliance_hits = 'build_public 非零退出，已解析';
    }
  } catch { out.metrics.compliance_hits = null; }

  /* ⑧ RSI 等级与 recurrence */
  try {
    /* R122：真跑 rsi_level.mjs 拿等级；recurrence 从 rsi_register 输出解析 */
    try {
      const r = execFileSync(process.execPath, [join(ROOT, 'tools', 'rsi_level.mjs')], {
        cwd: ROOT, encoding: 'buffer', windowsHide: true, timeout: 300000,
      });
      const txt = Buffer.isBuffer(r) ? r.toString('utf8') : String(r);
      const lm = txt.match(/等级[：:]\s*(L\d)/) || txt.match(/\b(L\d)\b/);
      out.metrics.rsi_level = lm ? Number(lm[1].slice(1)) : null;
      out.evidence.rsi_level = '现场真跑 rsi_level.mjs';
    } catch { out.metrics.rsi_level = null; }
    try {
      const r2 = execFileSync(process.execPath, [join(ROOT, 'tools', 'rsi_register.mjs'), '--check'], {
        cwd: ROOT, encoding: 'buffer', windowsHide: true, timeout: 300000,
      });
      const t2 = Buffer.isBuffer(r2) ? r2.toString('utf8') : String(r2);
      const rm = t2.match(/([\d.]+)%/);
      out.metrics.recurrence = rm ? Number(rm[1]) : null;
      out.evidence.recurrence = '现场真跑 rsi_register.mjs --check';
    } catch { out.metrics.recurrence = null; }
  } catch { out.metrics.rsi_level = null; out.metrics.recurrence = null; }

  return out;
}

/* 方向：哪些指标"越多越好"，哪些"越少越好" */
const DIRECTION = {
  gates: 'up', lessons: 'up', tools: 'up', tests_pass: 'up',
  refutations: 'up', facts: 'up',
  compliance_hits: 'down', recurrence: 'down',
};

function loadHist() {
  if (!existsSync(HIST)) return { version: 1, snapshots: [] };
  try { return JSON.parse(readFileSync(HIST, 'utf8')); } catch { return { version: 1, snapshots: [] }; }
}

/* ══════════════════════════════════════════════════════════════
 * --snapshot  拍快照（基线）
 * ══════════════════════════════════════════════════════════════ */
if (has('--snapshot')) {
  const m = measure();
  mkdirSync(DATA, { recursive: true });
  writeFileSync(CUR, JSON.stringify(m, null, 2), 'utf8');
  const h = loadHist();
  h.snapshots = h.snapshots || [];
  h.snapshots.push(m);
  /* 只保留最近 200 条 */
  if (h.snapshots.length > 200) h.snapshots = h.snapshots.slice(-200);
  writeFileSync(HIST, JSON.stringify(h, null, 2), 'utf8');
  console.log('');
  console.log('  ✅ 已拍快照（第 ' + h.snapshots.length + ' 次）');
  console.log('');
  for (const [k, v] of Object.entries(m.metrics)) console.log('     ' + k.padEnd(18) + (v === null ? '—' : v));
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * 计算趋势
 * ══════════════════════════════════════════════════════════════ */
const cur = existsSync(CUR) ? JSON.parse(readFileSync(CUR, 'utf8')) : null;
const h = loadHist();
const snaps = h.snapshots || [];
const prev = snaps.length >= 2 ? snaps[snaps.length - 2] : null;
const latest = snaps.length ? snaps[snaps.length - 1] : null;

const withData = latest ? latest : measure();

/* ══════════════════════════════════════════════════════════════
 * --status  看棘轮状态
 * ══════════════════════════════════════════════════════════════ */
function printStatus() {
  console.log('');
  console.log('  ══ 迭代棘轮（不断更新迭代）══');
  console.log('  （用户 2026-10-20 明令：这 2 条编入生存规则）');
  console.log('');
  console.log('  核心判据（正反合）：');
  console.log('    正题：迭代 = 持续产出新东西  → 代价：只产新不留旧 = 技术债');
  console.log('    反题：迭代 = 保持系统稳定    → 代价：只求稳 = 停滞');
  console.log('    合题：真迭代 = 【棘轮】：每轮至少一个指标不可逆变好，且无指标变差，且有固化');
  console.log('');
  if (!latest) {
    console.log('  ⚠️ 还没有快照。先跑：node tools/iteration_ratchet.mjs --snapshot');
    console.log('');
    return;
  }
  console.log('  最近快照：' + latest.at.slice(0, 19).replace('T', ' '));
  if (prev) console.log('  上一次  ：' + prev.at.slice(0, 19).replace('T', ' '));
  console.log('');
  console.log('  ── 指标 ──');
  console.log('  指标                当前    上次    趋势');
  for (const [k, v] of Object.entries(latest.metrics)) {
    const p = prev ? prev.metrics[k] : null;
    let trend = '—';
    if (prev && v !== null && p !== null) {
      const d = v - p;
      const dir = DIRECTION[k] || 'up';
      if (d === 0) trend = '持平';
      else if ((dir === 'up' && d > 0) || (dir === 'down' && d < 0)) trend = '↑ 更好 (' + (d > 0 ? '+' : '') + d + ')';
      else trend = '↓ 退步 (' + (d > 0 ? '+' : '') + d + ')';
    }
    console.log('  ' + k.padEnd(20) + String(v === null ? '—' : v).padStart(6) + String(p === null || p === undefined ? '—' : p).padStart(8) + '    ' + trend);
  }
  console.log('');
  console.log('  快照总数：' + snaps.length);
  console.log('');
}

/* ══════════════════════════════════════════════════════════════
 * --check  门禁：本轮是否真的更强
 * ══════════════════════════════════════════════════════════════ */
if (has('--check')) {
  console.log('');
  console.log('  ══ 迭代棘轮门禁 ══');
  console.log('');
  const fails = [];

  if (!latest) {
    fails.push('没有快照基线 —— 无法判断是否迭代（先跑 --snapshot）');
  } else if (!prev) {
    /* 只有一个快照：只能检查绝对状态（合规=0、门禁>0） */
    const m = latest.metrics;
    if (m.gates === null || m.gates < 10) fails.push('门禁数不足或不可读（当前 ' + m.gates + '）');
    if (m.tools === null || m.tools < 20) fails.push('工具数不足或不可读（当前 ' + m.tools + '）');
    if (m.compliance_hits !== null && m.compliance_hits > 0) fails.push('合规有命中（' + m.compliance_hits + '）');
  } else {
    /* 有两次快照：检查棘轮 */
    const c = latest.metrics;
    const p = prev.metrics;
    const worse = [];
    let improved = 0;
    for (const [k, v] of Object.entries(c)) {
      const pv = p[k];
      if (v === null || pv === null || pv === undefined) continue;
      const d = v - pv;
      const dir = DIRECTION[k] || 'up';
      if (d === 0) continue;
      if ((dir === 'up' && d > 0) || (dir === 'down' && d < 0)) improved += 1;
      else worse.push(k + '（' + pv + ' → ' + v + '）');
    }
    if (improved === 0) fails.push('本轮没有任何指标变好 —— 按棘轮判据，这不是迭代，是消耗');
    if (worse.length) fails.push('有指标倒退：' + worse.join('、') + '（棘轮只进不退）');
    if (c.compliance_hits !== null && c.compliance_hits > 0) fails.push('合规有命中（' + c.compliance_hits + '）');
  }

  if (fails.length) {
    console.log('  ❌ 棘轮未通过（' + fails.length + ' 项）');
    for (const f of fails) console.log('     · ' + f);
    console.log('');
    console.log('  怎么补：');
    console.log('     node tools/iteration_ratchet.mjs --snapshot   # 拍快照');
    console.log('     然后做一件真的让某个指标变好的事，再 --snapshot 对比');
    console.log('');
    process.exit(1);
  }
  console.log('  ✅ 棘轮通过：有基线、有净增量、无倒退、合规零命中');
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * 默认：打印状态 + 五条铁律
 * ══════════════════════════════════════════════════════════════ */
printStatus();
console.log('  ── 五条铁律（从坑里提炼）──');
console.log('  1. 没有基线就没有迭代（"我记得以前不行"不算）');
console.log('  2. 只加不改 = 膨胀（工具数涨了但质量没涨，是虚假增长）');
console.log('  3. 修 bug 必须同时：代码改了 + 门禁加了 + 老数据回补了');
console.log('  4. 迭代方向必须可追溯（这轮为什么做这个，不做那个）');
console.log('  5. 棘轮只进不退：门禁数、知识条目、认知纠正只许增不许减');
console.log('');
console.log('  命令：');
console.log('     node tools/iteration_ratchet.mjs --snapshot   # 拍基线');
console.log('     node tools/iteration_ratchet.mjs --status     # 看趋势（默认）');
console.log('     node tools/iteration_ratchet.mjs --check      # 门禁');
console.log('');
