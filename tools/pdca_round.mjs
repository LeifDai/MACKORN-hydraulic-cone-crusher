/**
 * PDCA 轮次运行器 —— 把 Plan / Do / Check / Act 四步变成可执行流程
 *
 * 用户要求：「按照方法论的方法，PDCA，不断优化提升」
 *
 * 用法：
 *   node tools/pdca_round.mjs --plan     列出本轮候选改进项（P）
 *   node tools/pdca_round.mjs --status   看当前状态与遗留项
 *   node tools/pdca_round.mjs --record "本轮做了什么" "核对结果" "下轮固化什么"  （D/C/A 记录）
 *
 * 设计原则：
 *   Plan 不靠"我觉得"，而是由【实际缺口】驱动 —— 扫描产物、门禁、遗留项，自动列出
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { openSync, closeSync, rmSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const PDCADIR = join(D, '05_视角与复盘');
const LEDGER = join(PDCADIR, 'PDCA台账.json');

function runCaptured(script, args = []) {
  // script 可以是 'tools/xxx.mjs'（相对 ROOT）或 'xxx.mjs'（相对 tools/）
  const full = script.includes('/') ? join(ROOT, script) : join(HERE, script);
  const outFile = join(D, '_pdca_' + Math.random().toString(36).slice(2) + '.txt');
  let out = '', code = 1;
  try {
    const fd = openSync(outFile, 'w');
    const r = spawnSync(process.execPath, [full, ...args], { stdio: ['ignore', fd, fd], windowsHide: true });
    closeSync(fd);
    code = r.status === null ? 1 : r.status;
    out = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
  } catch (e) { out = String(e.message); }
  finally { try { rmSync(outFile, { force: true }); } catch { } }
  return { ok: code === 0, out };
}

const mode = process.argv[2] || '--plan';
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { rounds: [], open_items: [], metrics: {} };

/* ══════════════════════════════════════════════════════════
 * --plan：由实际缺口驱动，自动列出候选改进项
 * ══════════════════════════════════════════════════════════ */
if (mode === '--plan') {
  const gaps = [];

  /* 1. 门禁是否全绿 */
  for (const [name, script, re, prio] of [
    ['单元测试', 'tests/run.mjs', /0 失败/, 'P0'],
    ['十三维自检', 'tools/self_audit.mjs', /✅ 通过/, 'P0'],
    ['关键词覆盖', 'tools/keyword_gate.mjs', /✅ 通过/, 'P1'],
    ['构建一致性', 'tools/check_build_consistency.mjs', /构建稳定/, 'P0'],
    ['交付前自检', 'tools/preflight_checklist.mjs', /✅ 可以发送/, 'P0'],
  ]) {
    const r = runCaptured(script);
    const ok = re.test(r.out);
    if (!ok) gaps.push({ prio, area: '门禁', item: name + ' 未通过', how: '运行 ' + script + ' 看详情' });
  }

  /* 2. 远程工具覆盖 */
  const mcpPath = join(D, '_deploy', 'ai/api/mcp.php');
  if (existsSync(mcpPath)) {
    const c = readFileSync(mcpPath, 'utf8');
    const pos = [...c.matchAll(/\$add\('(mackorn_\w+)'/g)].map((m) => ({ n: m[1], i: m.index }));
    const remote = [];
    for (let k = 0; k < pos.length; k++) {
      const seg = c.slice(pos[k].i, k + 1 < pos.length ? pos[k + 1].i : c.length);
      if (/,\s*true\)\s*;/.test(seg)) remote.push(pos[k].n);
    }
    if (remote.length < 21) gaps.push({ prio: 'P1', area: '远程工具', item: '仅 ' + remote.length + '/21 实现', how: '补齐剩余工具' });
  } else gaps.push({ prio: 'P0', area: '构建', item: '_deploy 里没有 mcp.php', how: '跑 node tools/deliver.mjs' });

  /* 3. 遗留项 */
  for (const o of (ledger.open_items || [])) {
    if (/^已决定不做|^等待/.test(o.item)) continue;
    gaps.push({ prio: o.priority || 'P2', area: '遗留项', item: o.item, how: o.owner === '我' ? '我处理' : ('待 ' + o.owner) });
  }

  /* 4. 已知待办（从会话上下文固化） */
  const KNOWN = [
    { prio: 'P2', area: '数据质量', item: '10-K 项目名仍有残留噪音（Peru MSHA Federal 这类）', how: '继续加过滤规则' },
    { prio: 'P1', area: 'AI 收录', item: '线上仍是 0.0.9 —— 上传后需重跑 AI 收录普查', how: '上传后 node tools/census_ai.mjs' },
    { prio: 'P2', area: '客户情报', item: '客户情报仅覆盖美国上市公司（SEC），中国/中亚/非洲/拉美缺失', how: '找当地矿权公告与招标平台' },
    { prio: 'P2', area: '差量系统', item: '删除文件清单未在差量包里自动处理', how: '补 _删除这些文件.txt 的生成与校验' },
    { prio: 'P2', area: 'PDCA', item: 'PDCA 台账需人工更新', how: '接进编排器自动追加' },
  ];
  for (const k of KNOWN) gaps.push(k);

  /* 排序输出 */
  const order = { P0: 0, P1: 1, P2: 2 };
  gaps.sort((a, b) => {
    const oa = order[a.prio] === undefined ? 9 : order[a.prio];
    const ob = order[b.prio] === undefined ? 9 : order[b.prio];
    return oa - ob;
  });

  console.log('\n' + '═'.repeat(78));
  console.log('  PDCA · Plan（本轮候选改进项，按优先级）');
  console.log('═'.repeat(78) + '\n');
  let last = null;
  for (const g of gaps) {
    if (g.prio !== last) { console.log('  【' + g.prio + '】'); last = g.prio; }
    console.log('    [' + g.area + '] ' + g.item);
    console.log('         → ' + g.how);
  }
  console.log('\n  合计 ' + gaps.length + ' 项候选\n');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════
 * --status
 * ══════════════════════════════════════════════════════════ */
if (mode === '--status') {
  const m = ledger.metrics || {};
  console.log('\n' + '═'.repeat(78));
  console.log('  PDCA · 当前状态');
  console.log('═'.repeat(78) + '\n');
  console.log('  版本            ' + (m.version_after || '?'));
  console.log('  远程 MCP 工具   ' + (m.remote_tools_after || '?') + ' / 21');
  console.log('  语言页          ' + (m.languages_after || '?') + ' / 12');
  console.log('  公司级线索      ' + (m.company_leads_qualified || '?') + ' 家合格（原始 ' + (m.company_leads_raw || '?') + '）');
  console.log('  10-K 深度提取   ' + (m.tenk_companies || '?') + ' 家');
  console.log('  发现问题/已修   ' + (m.found_issues || '?') + ' / ' + (m.fixed_issues || '?'));
  console.log('  PDCA 轮次       ' + (ledger.rounds || []).length);
  console.log('\n  遗留项 ' + (ledger.open_items || []).length + ' 条：');
  for (const o of (ledger.open_items || [])) console.log('    [' + o.priority + '] ' + o.item + '　（' + (o.owner || '我') + '）');
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════
 * --record：记录一轮 D/C/A
 * ══════════════════════════════════════════════════════════ */
if (mode === '--record') {
  const plan = process.argv[3] || '（未填）';
  const check = process.argv[4] || '（未填）';
  const act = process.argv[5] || '（未填）';
  const round = {
    round: 'R' + ((ledger.rounds || []).length + 1),
    recorded_at: new Date().toISOString(),
    plan, check, act,
  };
  // 自动跑门禁作为 Check 的证据
  const gates = [];
  for (const [name, script, re] of [
    ['单元测试', 'tests/run.mjs', /0 失败/],
    ['十三维自检', 'tools/self_audit.mjs', /✅ 通过/],
    ['构建一致性', 'tools/check_build_consistency.mjs', /构建可重复|构建稳定/],
    ['交付前自检', 'tools/preflight_checklist.mjs', /✅ 可以发送/],
  ]) {
    const r = runCaptured(script);
    const passed = re.test(r.out);
    gates.push({ gate: name, passed, ...(passed ? {} : { tail: (r.out || '').trim().split('\n').slice(-3).join(' | ').slice(0, 160) }) });
  }
  round.gates = gates;
  ledger.rounds = ledger.rounds || [];
  ledger.rounds.push(round);
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2), 'utf8');

  console.log('\n  ✅ 已记录 ' + round.round);
  console.log('     Plan : ' + plan);
  console.log('     Check: ' + check);
  console.log('     Act  : ' + act);
  console.log('     门禁 : ' + gates.map((g) => g.gate + (g.passed ? '✅' : '❌')).join(' · '));
  console.log('');
  process.exit(0);
}

console.log('用法: --plan | --status | --record "P" "C" "A"');
