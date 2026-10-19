/**
 * 持续不间断机制 v2 —— 不会挂死的编排器
 *
 * 为什么重写（v1 的真实故障）：
 *   v1 的 run() 没有超时。抓取脚本在 Comtrade 配额耗尽时会进入长等待循环，
 *   整个编排器随之卡死 —— 实测状态文件停更 32 小时。
 *
 * v2 的六道防线：
 *   ① 每步硬超时（spawnSync timeout + killSignal），超时即杀，绝不常驻
 *   ② 心跳（heartbeat）—— 每步都写时间戳，卡住能被立刻发现
 *   ③ 陈旧检测 —— 启动时若发现上次运行超期，标记 stale 并继续（不继承死状态）
 *   ④ 单轮总时限 —— 一轮超过 N 分钟强制结束本轮，进入下一轮
 *   ⑤ 核心双检 —— 每轮必跑【AI 内容匹配门禁】与【海关数据完整性】，这正是两个核心
 *   ⑥ 失败不退出 —— 未通过则记录缺口、短睡、继续下一轮（真正的"持续"）
 *
 * 用法：
 *   node tools/orchestrate_v2.mjs                 跑（默认 12 轮，每轮间隔 5 分钟）
 *   node tools/orchestrate_v2.mjs --max=3         跑 3 轮
 *   node tools/orchestrate_v2.mjs --interval=60   轮间隔 60 秒
 *   node tools/orchestrate_v2.mjs --once          只跑一轮
 *   node tools/orchestrate_v2.mjs --status        只看状态（不跑）
 *   node tools/orchestrate_v2.mjs --install-task  安装为 Windows 计划任务（每 6 小时）
 */
import { spawnSync } from 'node:child_process';
import { openSync, closeSync, unlinkSync, readFileSync as rf, writeFileSync as wf } from 'node:fs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const STATUS = join(ROOT, 'distribution', '_orchestrator-status.json');
const HB = join(ROOT, 'distribution', '_orchestrator-heartbeat.json');
const PY = 'C:\\Users\\m00002\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe';

const ARGS = process.argv.slice(2);
const num = (k, d) => { const a = ARGS.find((x) => x.startsWith('--' + k + '=')); return a ? Number(a.split('=')[1]) : d; };
const has = (f) => ARGS.includes(f);

const MAX = has('--once') ? 1 : num('max', 12);
const INTERVAL_S = num('interval', 300);
const STEP_TIMEOUT_MS = num('steptimeout', 240) * 1000;   // 单步 4 分钟
const ROUND_BUDGET_MS = num('roundbudget', 900) * 1000;   // 单轮 15 分钟
const STALE_MIN = num('stale', 90);                        // 心跳超 90 分钟视为陈旧

/* ══════════════════════════════════════════════════════════
 * 心跳与状态
 * ══════════════════════════════════════════════════════════ */
function beat(o) {
  writeFileSync(HB, JSON.stringify({ ts: new Date().toISOString(), pid: process.pid, ...o }, null, 2), 'utf8');
}
function write(o) {
  writeFileSync(STATUS, JSON.stringify({ updated: new Date().toISOString(), pid: process.pid, ...o }, null, 2), 'utf8');
}
function readStatus() {
  try { return JSON.parse(readFileSync(STATUS, 'utf8')); } catch { return null; }
}
function staleCheck() {
  const s = readStatus();
  if (!s?.updated) return { stale: false, msg: '无历史状态' };
  const ageMin = (Date.now() - new Date(s.updated).getTime()) / 60000;
  if (ageMin > STALE_MIN) {
    return { stale: true, ageMin: Math.round(ageMin), msg: `上次运行状态已陈旧 ${Math.round(ageMin)} 分钟（阶段 ${s.phase}，轮次 ${s.round}）—— 判定为异常终止，不继承其状态` };
  }
  return { stale: false, ageMin: Math.round(ageMin), msg: `上次状态 ${Math.round(ageMin)} 分钟前（${s.phase}）` };
}

/* ══════════════════════════════════════════════════════════
 * 受控执行 —— 带硬超时 + 文件描述符重定向
 *
 * ⚠️ 关键：沙箱不允许通过管道捕获子进程输出（pipe → EPERM）。
 *    必须用【文件描述符重定向】：openSync 出 fd，传给 stdio，再读回文件。
 *    这正是 v1 能跑、而我重写时丢掉的那一环。
 * ══════════════════════════════════════════════════════════ */
const stepLog = [];
let stepNo = 0;
function run(label, cmd, args, timeoutMs = STEP_TIMEOUT_MS) {
  const t0 = Date.now();
  const outFile = join(ROOT, '.orch-step-' + (++stepNo) + '.txt');
  beat({ step: label, phase: 'running' });
  process.stdout.write('  ▶ ' + label + ' … ');
  let status = 'exception', detail = '';
  try {
    const fd = openSync(outFile, 'w');
    const r = spawnSync(cmd, args, {
      cwd: ROOT,
      timeout: timeoutMs,
      killSignal: 'SIGTERM',
      stdio: ['ignore', fd, fd],        // ← 文件描述符，不是管道
      windowsHide: true,
    });
    closeSync(fd);
    const timedOut = r.error?.code === 'ETIMEDOUT' || (r.signal && r.status === null);
    status = timedOut ? 'timeout' : (r.status === 0 ? 'ok' : 'exit-' + (r.status ?? -1));
    detail = r.error?.code || '';
  } catch (e) {
    status = 'exception'; detail = e.code || e.message;
  }
  let out = '';
  try { out = readFileSync(outFile, 'utf8'); } catch { }
  try { unlinkSync(outFile); } catch { }
  const ms = Date.now() - t0;
  console.log((status === 'ok' ? '✅' : status === 'timeout' ? '⏱ 超时' : '⚠ ' + status + (detail ? ' ' + detail : '')) + ' (' + (ms / 1000).toFixed(0) + 's)');
  stepLog.push({ label, ms, status });
  return { status, ms, out, ok: status === 'ok' };
}

/* ══════════════════════════════════════════════════════════
 * 核心一：AI 内容匹配门禁
 * ══════════════════════════════════════════════════════════ */
function coreAiMatch() {
  const r = run('核心① · AI 内容匹配门禁', process.execPath, [join(ROOT, 'tools', 'keyword_gate.mjs'), '--emit']);
  const m = /合计\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%/.exec(r.out);
  const rate = m ? Number(m[4]) : null;
  const through = /✅ 通过/.test(r.out);
  return { rate, through, steps: r };
}

/* ══════════════════════════════════════════════════════════
 * 核心二：海关数据完整性（破碎 847420 + 筛分 847410 + 零件 847490）
 * ══════════════════════════════════════════════════════════ */
function coreTrade() {
  const f = join(ROOT, 'distribution', 'trade-global.json');
  if (!existsSync(f)) return { ok: false, countries: 0, crush: 0, screen: 0, parts: 0 };
  try {
    const db = JSON.parse(readFileSync(f, 'utf8'));
    let crush = 0, screen = 0, parts = 0, all3 = 0;
    for (const c of Object.values(db.countries || {})) {
      const y = (hs) => c.hs?.[hs]?.years?.['2023']?.usd;
      const a = y('847420') != null, b = y('847410') != null, d = y('847490') != null;
      if (a) crush++; if (b) screen++; if (d) parts++;
      if (a && b && d) all3++;
    }
    return { ok: crush >= 100, countries: Object.keys(db.countries || {}).length, crush, screen, parts, all3 };
  } catch (e) { return { ok: false, error: e.message }; }
}

/* ══════════════════════════════════════════════════════════
 * 自检
 * ══════════════════════════════════════════════════════════ */
function audit() {
  const r = run('十三维自检', process.execPath, [join(ROOT, 'tools', 'self_audit.mjs')]);
  const score = Number((r.out.match(/总分\s+(\d+)\s*\/\s*100/) || [])[1] ?? -1);
  const ready = /✅ 通过/.test(r.out);
  const gaps = [];
  const re = /✗\s*\[?([^\]]+?)\]?\s+(.+?)\s+—\s+(.+)/g;
  let m; while ((m = re.exec(r.out))) gaps.push({ dim: m[1].trim(), item: m[2].trim(), detail: m[3].trim() });
  return { score, ready, gaps };
}

/* ══════════════════════════════════════════════════════════
 * --status
 * ══════════════════════════════════════════════════════════ */
if (has('--status')) {
  const s = readStatus(); const hb = existsSync(HB) ? JSON.parse(readFileSync(HB, 'utf8')) : null;
  const st = staleCheck();
  console.log('\n  ── 持续机制状态 ──\n');
  console.log('  状态文件  ' + (s ? `${s.phase} · 轮次 ${s.round}/${s.maxRounds} · ${s.updated}` : '无'));
  console.log('  心跳      ' + (hb ? `${hb.step || ''} · ${hb.ts}` : '无'));
  console.log('  陈旧检测  ' + (st.stale ? '⚠ ' + st.msg : '✅ ' + st.msg));
  const t = coreTrade();
  console.log('  海关数据  ' + (t.ok ? '✅' : '⚠') + ` ${t.countries} 国 · 破碎 ${t.crush} · 筛分 ${t.screen} · 零件 ${t.parts} · 三码齐全 ${t.all3}`);
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════
 * --install-task
 * ══════════════════════════════════════════════════════════ */
if (has('--install-task')) {
  const cmd = `"${process.execPath}" "${join(ROOT, 'tools', 'orchestrate_v2.mjs')}" --max=4 --interval=600`;
  console.log('\n  安装 Windows 计划任务（每 6 小时跑一次，4 轮 × 10 分钟间隔）\n');
  const r = spawnSync('schtasks', ['/Create', '/TN', 'MACKORN-Plugin-Orchestrator', '/TR', cmd,
    '/SC', 'HOURLY', '/MO', '6', '/F'], { encoding: 'utf8', windowsHide: true });
  console.log((r.stdout || r.stderr || '').trim());
  console.log('\n  查看：schtasks /Query /TN MACKORN-Plugin-Orchestrator');
  console.log('  删除：schtasks /Delete /TN MACKORN-Plugin-Orchestrator /F\n');
  process.exit(r.status === 0 ? 0 : 1);
}

/* ══════════════════════════════════════════════════════════
 * 主循环
 * ══════════════════════════════════════════════════════════ */
console.log('\n' + '═'.repeat(78));
console.log('  持续不间断机制 v2 · 核心双检 + 自检 · 不通过不提交 · 不会挂死');
console.log('═'.repeat(78));
console.log('  单步超时 ' + STEP_TIMEOUT_MS / 1000 + 's · 单轮预算 ' + ROUND_BUDGET_MS / 1000 + 's · 轮间隔 ' + INTERVAL_S + 's · 最多 ' + MAX + ' 轮');

const st = staleCheck();
console.log('  陈旧检测：' + (st.stale ? '⚠ ' + st.msg : '✅ ' + st.msg));
beat({ step: 'start', round: 0 });
write({ phase: 'starting', round: 0, maxRounds: MAX, ready: false, score: null, gaps: [] });

const startAll = Date.now();
let round = 0;
let final = { score: -1, ready: false, gaps: [] };

while (round < MAX) {
  round++;
  const roundStart = Date.now();
  stepLog.length = 0;
  console.log('\n  ── 第 ' + round + '/' + MAX + ' 轮 ── ' + new Date().toISOString().slice(11, 19));
  write({ phase: 'running', round, maxRounds: MAX, ready: false, score: final.score, gaps: final.gaps });

  /* 核心一：AI 内容匹配 */
  const ai = coreAiMatch();

  /* 核心二：海关数据 */
  const t = coreTrade();
  console.log('  ▶ 核心② · 海关数据 破碎 ' + t.crush + ' 国 · 筛分 ' + t.screen + ' 国 · 零件 ' + t.parts + ' 国 · 三码齐全 ' + t.all3 + ' 国');

  /* 补齐动作：只在不达标时做 */
  if (t.screen < 40) run('补抓筛分机械 847410', process.execPath, [join(ROOT, 'tools', 'fetch_screen_data.mjs'), '--fetch', '--limit=20'], 300000);
  if (t.crush < 140) run('补抓破碎机械 847420', process.execPath, [join(ROOT, 'tools', 'fetch_trade_global.mjs'), '--rounds=1']);

  /* 重建派生产物 */
  if (existsSync(PY)) run('重建大 Excel', PY, [join(ROOT, 'tools', 'build_global_excel.py')]);
  run('重建 AI 可读入口', process.execPath, [join(ROOT, 'tools', 'build_agent_entrypoints.mjs')]);
  run('重建按平台入口', process.execPath, [join(ROOT, 'tools', 'build_per_ai_entrypoints.mjs')]);
  run('重建术语总表', process.execPath, [join(ROOT, 'tools', 'build_glossary.mjs')]);
  run('生成 PHP MCP 端点', process.execPath, [join(ROOT, 'tools', 'gen_php_mcp.mjs')]);
  run('重建振动筛页', process.execPath, [join(ROOT, 'tools', 'build_screens_page.mjs')]);
  run('补齐检索词全集', process.execPath, [join(ROOT, 'tools', 'append_full_termset.mjs')]);
  run('重点国家深测', process.execPath, [join(ROOT, 'tools', 'test_priority_countries.mjs')]);
  run('线上可达性全测', process.execPath, [join(ROOT, 'tools', 'probe_live_site.mjs')]);
  run('全球 AI 收录普查', process.execPath, [join(ROOT, 'tools', 'census_ai.mjs')]);
  run('构建一致性检测', process.execPath, [join(ROOT, 'tools', 'check_build_consistency.mjs')]);
  run('提取 10-K 项目与设备线索', process.execPath, [join(ROOT, 'tools', 'extract_10k_projects.mjs')], 900000);
  run('清理 10-K 项目名噪音', process.execPath, [join(ROOT, 'tools', 'clean_10k_projects.mjs')]);
  run('按 SIC 分类公司', process.execPath, [join(ROOT, 'tools', 'classify_by_sic.mjs')], 900000);
  run('过滤线索相关性', process.execPath, [join(ROOT, 'tools', 'filter_lead_relevance.mjs')]);
  run('修正 SIC 与优先级', process.execPath, [join(ROOT, 'tools', 'fix_sic_and_priority.mjs')]);
  run('抓 SEC 公司级线索', process.execPath, [join(ROOT, 'tools', 'fetch_sec_leads.mjs')], 300000);
  run('重建公司线索 Excel', PY, [join(ROOT, 'tools', 'build_company_leads.py')]);
  run('重建汇总 Excel', PY, [join(ROOT, 'tools', 'build_master_excel.py')]);
  run('破碎+筛合并分析', process.execPath, [join(ROOT, 'tools', 'merge_and_analyze.mjs')]);

  /* ── 两个中心 · 持续验证（用户设定的两个硬指标）──
   * 中心① Bruno 去的地方我们都在 —— GAP1 会让它退出码 1
   * 中心② Bruno 没去但 AI 爱去的地方我们也在 */
  run('云端工作流预演', process.execPath, [join(ROOT, 'tools', 'workflow_dryrun.mjs')], 900000);
  run('用户验收测试', process.execPath, [join(ROOT, 'tools', 'uat_user_scenarios.mjs')], 600000);
  run('蓝图自检', process.execPath, [join(ROOT, 'tools', 'check_blueprint_compliance.mjs')], 300000);
  run('插件级负控', process.execPath, [join(ROOT, 'tests', 'negative', 'plugin_negative_controls.mjs')], 300000);
  run('工具描述审计', process.execPath, [join(ROOT, 'tools', 'audit_tool_descriptions_v2.mjs')], 300000);
  run('商务UAT', process.execPath, [join(ROOT, 'tools', 'uat_business_scenarios.mjs')], 600000);
  run('技术诊断UAT', process.execPath, [join(ROOT, 'tools', 'uat_diagnostic_scenarios.mjs')], 600000);
  run('version.json', process.execPath, [join(ROOT, 'tools', 'sync_version_json.mjs')], 120000);
  run('硬事实一致', process.execPath, [join(ROOT, 'tools', 'sync_hard_facts.mjs')], 120000);
  run('收录经验库', process.execPath, [join(ROOT, 'tools', 'build_indexing_playbook.mjs')], 300000);
  run('操作清单', process.execPath, [join(ROOT, 'tools', 'build_action_checklist.mjs')], 300000);
  run('PDCA总调度', process.execPath, [join(ROOT, 'tools', 'pdca_master.mjs'), '--budget', '1800'], 2000000);
  run('全站审计', process.execPath, [join(ROOT, 'tools', 'audit_site.mjs')], 600000);
  run('线上状态核实', process.execPath, [join(ROOT, 'tools', 'check_live_state.mjs')], 300000);
  run('模型卡', process.execPath, [join(ROOT, 'tools', 'publish_model_card.mjs')], 300000);
  run('夜间汇总', process.execPath, [join(ROOT, 'tools', 'night_summary.mjs')], 300000);
  run('夜间报告', process.execPath, [join(ROOT, 'tools', 'night_report.mjs')], 300000);
  run('自迭代循环(L3)', process.execPath, [join(ROOT, 'tools', 'self_iterate.mjs')], 600000);
  run('库验证（经验/错误）', process.execPath, [join(ROOT, 'tools', 'verify_libraries.mjs')], 600000);
  run('模型自验证', process.execPath, [join(ROOT, 'tools', 'validate_model.mjs')], 900000);
  run('公开验证基准', process.execPath, [join(ROOT, 'distribution', '03_验证与基准', '公开基准', 'run-benchmark.mjs')], 300000);
  run('发布验证页面', process.execPath, [join(ROOT, 'tools', 'publish_validation_page.mjs')], 600000);
  run('两个中心验证', process.execPath, [join(ROOT, 'tools', 'two_centers.mjs'), '--quick'], 900000);
  run('两个中心行动清单', process.execPath, [join(ROOT, 'tools', 'two_centers_actions.mjs')], 300000);

  /* ── 教训即代码：27 条踩过的坑是否仍被遵守 ── */
  run('教训即代码检查', process.execPath, [join(ROOT, 'tools', 'lessons.mjs')], 300000);

  /* ── AI 索引与站点内容同步（新页面若不进索引等于没建）── */
  run('问答覆盖审计', process.execPath, [join(ROOT, 'tools', 'audit_qa_coverage.mjs')], 300000);
  run('AI 索引同步', process.execPath, [join(ROOT, 'tools', 'sync_ai_index.mjs')], 600000);

  /* ── 线上状态监控（版本一致性 / 工具真调 / 入口 / 新增资产）── */
  run('线上实时监控', process.execPath, [join(ROOT, 'tools', 'monitor_live.mjs')], 900000);

  /* ── 交付前自检 + PDCA 轮次状态 ── */
  run('交付前自检清单', process.execPath, [join(ROOT, 'tools', 'preflight_checklist.mjs')], 600000);
  run('PDCA 轮次状态', process.execPath, [join(ROOT, 'tools', 'pdca_round.mjs'), '--status'], 120000);

  /* 自检 */
  if (Date.now() - roundStart < ROUND_BUDGET_MS) {
    const a = audit();
    final = { score: a.score, ready: a.ready, gaps: a.gaps };
  } else {
    console.log('  ⚠ 本轮已超预算，跳过自检，进入下一轮');
  }

  const t2 = coreTrade();
  write({
    phase: final.ready ? 'ready' : 'iterating', round, maxRounds: MAX,
    ready: final.ready, score: final.score, gaps: final.gaps,
    coreAiMatch: { rate: ai.rate, through: ai.through },
    coreTrade: t2,
    steps: stepLog.map((s) => ({ label: s.label, status: s.status, sec: Math.round(s.ms / 1000) })),
    roundSec: Math.round((Date.now() - roundStart) / 1000),
  });
  beat({ step: 'round-done', round });

  console.log('  ── 本轮结论 ── 自检 ' + final.score + '/100 · 内容匹配 ' + (ai.rate ?? '?') + '% · 破碎 ' + t2.crush + ' 国 · 筛分 ' + t2.screen + ' 国');

  if (final.ready && ai.through && t2.ok) {
    console.log('\n' + '═'.repeat(78));
    console.log('  ✅ 全部门禁通过 · 总用时 ' + Math.round((Date.now() - startAll) / 60000) + ' 分钟');
    console.log('  → 可生成部署包并提交');
    console.log('═'.repeat(78) + '\n');
    break;
  }

  if (final.gaps.length) {
    console.log('  待补缺口 ' + final.gaps.length + ' 项：');
    for (const g of final.gaps.slice(0, 6)) console.log('    ✗ [' + g.dim + '] ' + g.item);
  }
  if (round < MAX) {
    console.log('  ⏳ ' + INTERVAL_S + 's 后继续下一轮…');
    await new Promise((s) => setTimeout(s, INTERVAL_S * 1000));
  }
}

console.log('\n  ── 结束 ── 共 ' + round + ' 轮 · 自检 ' + final.score + '/100 · ' + (final.ready ? '已通过' : '未通过（缺口见状态文件）'));
console.log('  状态：distribution/_orchestrator-status.json\n');
