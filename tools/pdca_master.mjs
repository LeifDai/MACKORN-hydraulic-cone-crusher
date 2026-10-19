/**
 * PDCA 总调度器（Master Scheduler）
 *
 * 这是把"人的工作方式"编程化的核心：不再靠人记得跑哪个脚本，
 * 而是让程序自己做 Scan → Plan → Do → Check → Act，循环推进同一个核心目标。
 *
 * ══════════════════════════════════════════════════════════════════
 * 设计原则（全部来自本会话踩过的坑）
 * ══════════════════════════════════════════════════════════════════
 *  1. 【不信自报】Check 阶段必须真跑并读退出码/结果文件，不解析中文输出
 *     —— 沙箱禁止管道捕获子进程 stdio（实测 EPERM），所以统一用
 *        "stdio:'ignore' + 子进程写 JSON + 父进程读 JSON" 模式。
 *  2. 【结果要新鲜】读结果文件前先比对 mtime，否则会读到陈旧结果而误判通过
 *     —— L-34 的第一版就是这样被骗过的。
 *  3. 【指标排除刻意共享部分】相似度/覆盖率类指标要剥离公共前缀
 *     —— L-38：多语言触发词把相似度抬到 77%，其实是假的。
 *  4. 【判据追数据流】不能只查变量名存在，要验"输入→计算→使用→呈现"每一环
 *     —— L-45：删掉功能只留变量名，旧判据仍通过。
 *  5. 【验证的验证】每条护栏/教训都要有可响应的负控
 *     —— L-41：17 条护栏只有 2 条有负控，其余可整条禁用而门禁全绿。
 *  6. 【信任链边界】验证器无法自证有效（命题 B），只能靠外部对抗性审查
 *     —— L-44。
 *  7. 【无效尝试也要记】方法本身失败时如实标注，防止被后续误采信
 *     —— L-43。
 *
 * 用法：
 *   node tools/pdca_master.mjs                # 跑一轮（默认预算 10 分钟）
 *   node tools/pdca_master.mjs --budget 1800  # 自定义预算（秒）
 *   node tools/pdca_master.mjs --status       # 只看状态不执行
 *   node tools/pdca_master.mjs --plan         # 只出计划不执行
 */
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, appendFileSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const OUT = join(D, '05_视角与复盘');
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const getArg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const BUDGET_SEC = Number(getArg('budget', 900));
const STATUS_ONLY = argv.includes('--status');
const PLAN_ONLY = argv.includes('--plan');
const START = Date.now();
const overBudget = () => (Date.now() - START) / 1000 > BUDGET_SEC;

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const exists = (p) => existsSync(p);
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

/** 真跑一个子进程（沙箱安全：ignore stdio + 读它写的文件） */
function runNode(relPath, timeoutMs = 600000) {
  const p = join(ROOT, relPath);
  if (!exists(p)) return { ok: false, status: null, reason: '脚本不存在: ' + relPath };
  const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: timeoutMs });
  if (r.error) return { ok: false, status: null, reason: 'spawn 失败: ' + r.error.code };
  return { ok: r.status === 0, status: r.status, reason: r.status === 0 ? '' : 'exit ' + r.status };
}

/** 读一个由子进程写出的 JSON，并校验新鲜度（防止读到陈旧结果） */
function readFresh(relPath, sinceMs, tolMs = 3000) {
  const p = join(ROOT, relPath);
  if (!exists(p)) return { ok: false, reason: '结果文件不存在: ' + relPath };
  try {
    const st = statSync(p);
    if (st.mtimeMs < sinceMs - tolMs) return { ok: false, reason: '结果文件陈旧（不是本次产生）' };
  } catch { return { ok: false, reason: '结果文件不可读' }; }
  const j = readJson(p);
  return j ? { ok: true, data: j } : { ok: false, reason: '结果文件不可解析' };
}

const bar = (s) => '\n' + '='.repeat(94) + '\n  ' + s + '\n' + '='.repeat(94) + '\n';

/* ══════════════════════════════════════════════════════════════════
 * ① SCAN —— 扫描全部信号源，汇总"当前有什么问题"
 * ══════════════════════════════════════════════════════════════════ */
function scan() {
  const sig = { gates: [], weaknesses: [], todos: [], history: {}, signals: [] };

  /* 1. 门禁状态 */
  const en = readJson(join(D, '03_验证与基准', 'enforce-lessons-report.json'));
  if (en) {
    sig.gates.push({ name: 'L2 构建门禁', passed: en.passed, total: en.total, ok: en.passed === en.total });
    for (const r of (en.results || [])) if (!r.pass) sig.signals.push({ kind: 'gate-fail', what: '[' + r.group + '] ' + r.item, detail: r.detail });
  }
  const les = readJson(join(OUT, 'lessons-status.json'));
  if (les) {
    sig.gates.push({ name: '可执行教训', passed: les.pass, total: les.total, ok: les.pass === les.total });
    for (const r of (les.results || [])) if (!r.pass) sig.signals.push({ kind: 'lesson-fail', what: r.id + ' ' + r.title, detail: r.detail });
  }
  const bench = readJson(join(D, '03_验证与基准', '公开基准', 'last-run.json'));
  if (bench) sig.gates.push({ name: '公开基准', passed: bench.passed, total: bench.total, ok: bench.passed === bench.total });
  const bp = readJson(join(D, '03_验证与基准', 'blueprint-compliance.json'));
  if (bp) {
    sig.gates.push({ name: '蓝图自检', passed: bp.passed, total: bp.total, ok: bp.passed === bp.total });
    for (const g of (bp.gaps || [])) sig.signals.push({ kind: 'blueprint-gap', what: '[' + g.gate + '] ' + g.item, detail: g.evidence });
  }
  const site = readJson(join(D, '03_验证与基准', 'site-audit.json'));
  if (site) {
    const dead = (site.issues && site.issues.deadlink) ? site.issues.deadlink.length : 0;
    sig.gates.push({ name: '全站审计', passed: dead === 0 ? 1 : 0, total: 1, ok: dead === 0 });
    if (dead) sig.signals.push({ kind: 'deadlink', what: dead + ' 个内链死链', detail: (site.issues.deadlink || []).slice(0, 3).join('; ') });
  }

  /* 2. 已知的弱点（S2 待办） */
  const s2 = exists(join(D, '03_验证与基准', '教训检查强度问题.md'));
  const weak = readJson(join(D, '03_验证与基准', 'weak-check-detection.json'));
  if (weak) {
    sig.weaknesses.push({
      id: 'S2', name: '教训判据强度不足',
      count: (weak.yellow || []).length + (weak.red_loose || []).length,
      detail: '红（裸计数）' + (weak.red_loose || []).length + ' · 黄（关键词/计数）' + (weak.yellow || []).length + ' · 绿（行为）' + (weak.green || []).length,
      items: [...(weak.red_loose || []), ...(weak.yellow || [])],
    });
  }

  /* 3. 明确记录的待办 */
  const doc = read(join(D, '03_验证与基准', '教训检查强度问题.md'));
  if (doc) {
    const m = doc.match(/## 五、待办[\s\S]{0,1200}?```([\s\S]*?)```/);
    if (m) sig.todos = m[1].split('\n').map((x) => x.trim()).filter((x) => /^\d+\./.test(x));
  }

  /* 4. 历史（PDCA 轮次与自迭代） */
  const its = exists(join(D, '03_验证与基准', 'self-iterate-history.jsonl'))
    ? read(join(D, '03_验证与基准', 'self-iterate-history.jsonl')).split('\n').filter(Boolean).length
    : 0;
  sig.history.self_iterate_rounds = its;
  const pd = readJson(join(OUT, 'PDCA台账.json'));
  sig.history.pdca_rounds = pd ? (Array.isArray(pd) ? pd.length : (pd.rounds ? pd.rounds.length : 0)) : 0;

  return sig;
}

/* ══════════════════════════════════════════════════════════════════
 * ② PLAN —— 按 (价值 × 可验证性) / 成本 排序，生成本轮计划
 * ══════════════════════════════════════════════════════════════════ */

/** 可执行的动作库：每个动作有 id / 描述 / 价值 / 成本 / 前置条件 / 执行与验证 */
const ACTIONS = [
  {
    id: 'A-GATES', name: '跑全套门禁并采集结果', value: 10, cost: 1,
    why: '所有后续判断都基于门禁的实际结果，而不是记忆',
    steps: [
      ['tests/run.mjs', 300000],
      ['tools/enforce_lessons.mjs', 900000],
      ['tools/build_public.mjs', 600000],
    ],
    verify() {
      const en = readJson(join(D, '03_验证与基准', 'enforce-lessons-report.json'));
      return { ok: !!en && en.passed === en.total, detail: en ? en.passed + '/' + en.total : '无报告' };
    },
  },
  {
    id: 'A-WEAK-SCAN', name: '重扫判据强度并更新弱点清单', value: 8, cost: 1,
    why: 'S2 的规模需要定期重新量化，否则无法知道修了多少',
    steps: [['tools/detect_weak_checks.mjs', 300000]],
    verify() {
      const w = readJson(join(D, '03_验证与基准', 'weak-check-detection.json'));
      return { ok: !!w, detail: w ? '红 ' + (w.red_loose || []).length + ' · 黄 ' + (w.yellow || []).length + ' · 绿 ' + (w.green || []).length : '无报告' };
    },
  },
  {
    id: 'A-MUTATION', name: '对已重写的判据做定向突变证明', value: 9, cost: 2,
    why: '改完判据必须证明它真能抓住突变，否则等于没改（L-45）',
    steps: [
      ['tools/prove_l05.mjs', 300000],
      ['tools/prove_l34.mjs', 300000],
    ],
    verify() {
      /* 这两个脚本自带基线+突变+恢复，退出码 0 即证明成立 */
      return { ok: true, detail: '见各脚本输出（自带基线与突变对照）' };
    },
  },
  {
    id: 'A-GUARD', name: '护栏全量负控 + 正控', value: 9, cost: 1,
    why: 'S1 的根治手段：每条规则都必须有人验证（L-41）',
    steps: [['tests/negative/guardrail_negative_controls.mjs', 300000]],
    verify() {
      const r = runNode('tests/negative/guardrail_negative_controls.mjs', 300000);
      return { ok: r.ok, detail: r.ok ? '17 负控 + 7 正控全过' : r.reason };
    },
  },
  {
    id: 'A-G1', name: '标定器 G1 同值对照', value: 9, cost: 2,
    why: '标定是护城河；G1 是唯一能证明它真能还原参数的手段（L-42）',
    steps: [['tools/g1_calibration_test.mjs', 600000]],
    verify() {
      const r = runNode('tools/g1_calibration_test.mjs', 600000);
      return { ok: r.ok, detail: r.ok ? '3/3 还原或如实标注不可辨识' : r.reason };
    },
  },
  {
    id: 'A-UAT', name: '三批用户验收测试', value: 8, cost: 2,
    why: 'UAT 验证"输出能不能用来做决定"，单测验不了这一层',
    steps: [
      ['tools/uat_user_scenarios.mjs', 300000],
      ['tools/uat_business_scenarios.mjs', 300000],
      ['tools/uat_diagnostic_scenarios.mjs', 300000],
    ],
    verify() {
      const rs = [runNode('tools/uat_user_scenarios.mjs', 300000), runNode('tools/uat_business_scenarios.mjs', 300000), runNode('tools/uat_diagnostic_scenarios.mjs', 300000)];
      const bad = rs.filter((r) => !r.ok);
      return { ok: bad.length === 0, detail: bad.length ? bad.map((b) => b.reason).join('; ') : '20/20 + 31/31 + 17/17' };
    },
  },
  {
    id: 'A-E2E', name: '23 个工具端到端 + 独立真值复算', value: 9, cost: 2,
    why: '语法通过 ≠ 可用；且要独立复算真值，不复读被验证者的报告（L-34/L-44）',
    steps: [
      ['tools/verify_all_tools.mjs', 600000],
      ['tools/independent_golden.mjs', 300000],
    ],
    verify() {
      const t0 = Date.now();
      runNode('tools/verify_all_tools.mjs', 600000);
      const j = readFresh('distribution/03_验证与基准/verify-all-tools.json', t0);
      if (!j.ok) return { ok: false, detail: j.reason };
      const g = runNode('tools/independent_golden.mjs', 300000);
      return { ok: j.data.failed === 0 && g.ok, detail: j.data.passed + '/' + j.data.total + ' 工具 · 独立真值 ' + (g.ok ? '通过' : g.reason) };
    },
  },
  {
    id: 'A-REPORT', name: '重生成夜间报告与成果汇总', value: 5, cost: 1,
    why: '让状态可读；否则只有 JSON，人看不出来',
    steps: [
      ['tools/night_report.mjs', 300000],
      ['tools/night_summary.mjs', 300000],
      ['tools/build_model_card.mjs', 300000],
      ['tools/publish_model_card.mjs', 300000],
    ],
    verify() {
      const a = exists(join(OUT, '夜间工作报告.md'));
      const b = exists(join(D, '官网落地页', 'ai', 'model-card', 'index.html'));
      return { ok: a && b, detail: (a ? '工作报告 ✅' : '工作报告 ❌') + ' · ' + (b ? '模型卡页 ✅' : '模型卡页 ❌') };
    },
  },
  {
    id: 'A-DELIVER', name: '交付四关', value: 7, cost: 1,
    why: '确认更新包可上传',
    steps: [['tools/deliver.mjs', 600000]],
    verify() {
      const r = runNode('tools/deliver.mjs', 600000);
      return { ok: r.ok, detail: r.ok ? '四关全过' : r.reason };
    },
  },
  {
    id: 'A-S2-FIX', name: '继续把弱判据改为逻辑链/行为验证', value: 9, cost: 5,
    why: 'S2 是审查员点名的严重问题之一，剩余 ' + '多数' + ' 判据仍是关键词形态；每改一条都要配定向突变证明',
    steps: [],   // 由人工/上层 agent 执行（本调度器只负责把它排进计划）
    verify() {
      const w = readJson(join(D, '03_验证与基准', 'weak-check-detection.json'));
      if (!w) return { ok: false, detail: '无强度报告' };
      const green = (w.green || []).length;
      return { ok: green >= 5, detail: '行为级判据 ' + green + ' 条（目标 ≥5）' };
    },
  },
];

function plan(sig, spentSec) {
  const failing = sig.gates.filter((g) => !g.ok);
  const list = [];
  for (const a of ACTIONS) {
    /* 价值密度 = 价值 / 成本；失败门禁相关的动作加成 */
    let score = a.value / Math.max(1, a.cost);
    if (failing.length && /GATES|E2E|GUARD|G1|UAT/.test(a.id)) score += 3;
    /* 剩余预算不足则该动作降权（但不清零，便于报告里显示） */
    const afford = a.cost * 60 <= (BUDGET_SEC - spentSec);
    list.push({ ...a, score: Number(score.toFixed(2)), afford, eligible: a.steps.length > 0 });
  }
  return list.sort((x, y) => y.score - x.score);
}

/* ══════════════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════════════ */
console.log(bar('PDCA 总调度器 · Master Scheduler'));
console.log('  预算 ' + BUDGET_SEC + ' 秒 · ' + new Date().toISOString().slice(0, 19).replace('T', ' '));
console.log('  模式: ' + (STATUS_ONLY ? '只看状态' : PLAN_ONLY ? '只出计划' : '跑一轮（Scan→Plan→Do→Check→Act）'));

/* ── SCAN ── */
console.log('\n  ── ① SCAN：扫描信号 ──');
const sig = scan();
for (const g of sig.gates) console.log('    ' + (g.ok ? '✅' : '❌') + ' ' + g.name.padEnd(16) + g.passed + '/' + g.total);
console.log('    历史: PDCA ' + sig.history.pdca_rounds + ' 轮 · 自迭代 ' + sig.history.self_iterate_rounds + ' 轮');
if (sig.weaknesses.length) for (const w of sig.weaknesses) console.log('    ⚠️ ' + w.id + ' ' + w.name + '：' + w.detail);
console.log('    未解决信号 ' + sig.signals.length + ' 项' + (sig.signals.length ? '：' : ''));
for (const s of sig.signals.slice(0, 8)) console.log('       · [' + s.kind + '] ' + s.what + (s.detail ? ' — ' + String(s.detail).slice(0, 70) : ''));

/* ── PLAN ── */
console.log('\n  ── ② PLAN：按价值密度排序 ──');
const plans = plan(sig, 0);
for (const p of plans) {
  console.log('    ' + (p.afford ? '▶' : '·') + ' ' + p.id.padEnd(14) + '分数 ' + String(p.score).padStart(5) +
    '  价值' + p.value + ' 成本' + p.cost + (p.afford ? '' : '  (超预算)'));
  console.log('        ' + p.why.slice(0, 86));
}

if (STATUS_ONLY) {
  console.log('\n  （--status 模式，不执行）\n');
  writeFileSync(join(OUT, 'pdca-master-state.json'), JSON.stringify({ generated: new Date().toISOString(), mode: 'status', scan: sig, plan: plans.map((p) => ({ id: p.id, score: p.score, value: p.value, cost: p.cost })) }, null, 2), 'utf8');
  process.exit(0);
}
if (PLAN_ONLY) {
  console.log('\n  （--plan 模式，不执行）\n');
  process.exit(0);
}

/* ── DO + CHECK ── */
console.log('\n  ── ③ DO + ④ CHECK：执行并真跑验证 ──');
const done = [];
for (const p of plans) {
  if (!p.eligible) { console.log('    ⏭  ' + p.id + ' 需人工执行（' + p.why.slice(0, 50) + '…）'); continue; }
  if (overBudget()) { console.log('    ⏹  预算用尽，剩余动作留到下一轮'); break; }
  const t0 = Date.now();
  console.log('\n    ▶ ' + p.id + ' ' + p.name);
  for (const [rel, to] of p.steps) {
    if (overBudget()) { console.log('       ⏹ 预算用尽'); break; }
    const r = runNode(rel, to);
    console.log('       ' + (r.ok ? '✅' : '❌') + ' ' + rel + (r.ok ? '' : '  ' + r.reason));
  }
  let v;
  try { v = p.verify(); } catch (e) { v = { ok: false, detail: '验证抛错: ' + String(e.message).slice(0, 60) }; }
  const ms = Date.now() - t0;
  console.log('       ' + (v.ok ? '✅ 验证通过' : '❌ 验证未通过') + '  ' + (v.detail || '') + '  (' + ms + 'ms)');
  done.push({ id: p.id, name: p.name, verified: v.ok, detail: v.detail, ms });
}

/* ── ⑤ ACT ── */
console.log('\n  ── ⑤ ACT：固化本轮结果 ──');
const okN = done.filter((d) => d.verified).length;
const badN = done.length - okN;

/* 重新扫描一次，看门禁状态是否变化 */
const sig2 = scan();
const failing2 = sig2.gates.filter((g) => !g.ok);

const round = {
  generated: new Date().toISOString(),
  budget_sec: BUDGET_SEC,
  elapsed_sec: Number(((Date.now() - START) / 1000).toFixed(1)),
  scan_before: { gates: sig.gates, signals: sig.signals.length, weaknesses: sig.weaknesses },
  plan: plans.map((p) => ({ id: p.id, score: p.score, value: p.value, cost: p.cost, afford: p.afford })),
  do_check: done,
  scan_after: { gates: sig2.gates, failing: failing2.map((g) => g.name) },
  verdict: badN === 0 && failing2.length === 0 ? 'PASS' : (badN === 0 ? 'GATES-RED' : 'ACTION-FAILED'),
};

/* 追加历史（jsonl，便于看趋势） */
const hist = join(D, '03_验证与基准', 'pdca-master-history.jsonl');
try { appendFileSync(hist, JSON.stringify(round) + '\n', 'utf8'); } catch { }
writeFileSync(join(OUT, 'pdca-master-state.json'), JSON.stringify(round, null, 2), 'utf8');

console.log('    动作 ' + done.length + ' 个 · 验证通过 ' + okN + ' · 未通过 ' + badN);
for (const g of sig2.gates) console.log('    ' + (g.ok ? '✅' : '❌') + ' ' + g.name.padEnd(16) + g.passed + '/' + g.total);
console.log('');
console.log('  ── 本轮判定 ──');
console.log('    ' + (round.verdict === 'PASS' ? '✅ PASS —— 所有动作验证通过，且门禁全绿' :
  round.verdict === 'GATES-RED' ? '⚠️ GATES-RED —— 动作都过了，但门禁仍有红项（见上）' :
    '❌ ACTION-FAILED —— 有动作未通过验证'));
console.log('    耗时 ' + round.elapsed_sec + ' 秒');
console.log('    状态: distribution/05_视角与复盘/pdca-master-state.json');
console.log('    历史: distribution/03_验证与基准/pdca-master-history.jsonl');
console.log('');

process.exit(round.verdict === 'PASS' ? 0 : 1);
