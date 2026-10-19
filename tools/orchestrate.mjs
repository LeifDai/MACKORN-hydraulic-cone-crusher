/**
 * 持续编排机制 —— 跑到自检通过为止
 *
 * 解决"老是拿半成品"的根因：把「抓取 → 重建 → 自检」做成一个闭环，
 * 自检不过就继续跑，不通过绝不输出"可以提交"。
 *
 * 循环：
 *   ① 抓取全球海关数据（断点续跑，配额自适应）
 *   ② 重建大 Excel 数据库
 *   ③ 五维自检
 *   ④ 通过 → 写 READY 状态并退出 0
 *      不过 → 记录缺口，等待后重跑
 *
 * 用法：
 *   node tools/orchestrate.mjs                 # 跑到自检通过
 *   node tools/orchestrate.mjs --max=8         # 最多 8 轮
 *   node tools/orchestrate.mjs --status        # 只看当前状态
 *
 * 状态文件：distribution/_orchestrator-status.json
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, openSync, closeSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const STATUS = join(ROOT, 'distribution', '_orchestrator-status.json');
const PY = process.env.MACKORN_PY || 'C:\\Users\\m00002\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe';

const args = process.argv.slice(2);
const STATUS_ONLY = args.includes('--status');
const MAX = Number((args.find((a) => a.startsWith('--max=')) || '--max=10').split('=')[1]);

const write = (o) => writeFileSync(STATUS, JSON.stringify({ updated: new Date().toISOString(), ...o }, null, 2), 'utf8');
const read = () => { try { return JSON.parse(readFileSync(STATUS, 'utf8')); } catch { return null; } };

if (STATUS_ONLY) {
  const s = read();
  if (!s) { console.log('  尚无状态文件'); process.exit(1); }
  console.log('\n  持续编排状态');
  console.log('  ─────────────────────────────────────────');
  console.log('  更新时间   ' + s.updated);
  console.log('  阶段       ' + (s.phase || '-'));
  console.log('  轮次       ' + (s.round || 0) + ' / ' + (s.maxRounds || '-'));
  console.log('  国家数据   ' + (s.countries || 0) + ' 国');
  console.log('  自检总分   ' + (s.score ?? '-') + ' / 100');
  console.log('  判定       ' + (s.ready ? '✅ 可以提交' : '⏳ 继续完善中'));
  if (s.gaps?.length) {
    console.log('\n  未达标项：');
    for (const g of s.gaps) console.log('    ✗ [' + g.dim + '] ' + g.item + '  —  ' + g.detail);
  }
  console.log('');
  process.exit(s.ready ? 0 : 1);
}

/** 跑一个子进程，stdio 继承（沙箱下管道会 EPERM，继承不会） */
function run(label, cmd, argv) {
  console.log('\n  ▶ ' + label);
  const r = spawnSync(cmd, argv, { cwd: ROOT, stdio: 'inherit' });
  return r.status === 0;
}

/** 跑自检并解析结果 */
function audit() {
  const reqFile = join(ROOT, '.audit-out.txt');
  const fd = openSync(reqFile, 'w');
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'self_audit.mjs')], { cwd: ROOT, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  const out = readFileSync(reqFile, 'utf8');
  const score = Number((out.match(/总分\s+(\d+)\s*\/\s*100/) || [])[1] ?? -1);
  const ready = /✅ 通过/.test(out);
  const gaps = [];
  const re = /✗ \[?([^\]]+?)\]?\s+(.+?)\s+—\s+(.+)/g;
  let m;
  const section = out.split('未达标项')[1] || '';
  let cur = '';
  for (const ln of section.split('\n')) {
    const d = ln.match(/【(.+?)】/);
    if (d) { cur = d[1]; continue; }
    const g = ln.match(/✗\s+(.+?)\s+—\s+(.+)/);
    if (g && cur) gaps.push({ dim: cur, item: g[1].trim(), detail: g[2].trim() });
  }
  return { score, ready, gaps, raw: out };
}

/** 统计已抓国家数 */
function stats() {
  try {
    const db = JSON.parse(readFileSync(join(ROOT, 'distribution', 'trade-global.json'), 'utf8'));
    const cs = Object.values(db.countries || {});
    return {
      countries: cs.length,
      with2023: cs.filter((c) => c.hs?.['847420']?.years?.['2023']?.usd != null).length,
      withParts: cs.filter((c) => c.hs?.['847490']?.years?.['2023']?.usd != null).length,
    };
  } catch { return { countries: 0, with2023: 0, withParts: 0 }; }
}

console.log('\n' + '═'.repeat(78));
console.log('  持续编排 · 抓取 → 重建 → 自检 · 不通过不提交');
console.log('═'.repeat(78));

const start = Date.now();
let round = 0;
let last = null;

while (round < MAX) {
  round++;
  const s = stats();
  console.log('\n  ── 第 ' + round + ' 轮 ── 当前 ' + s.countries + ' 国（有 2023 破碎数据 ' + s.with2023 + '）');
  write({ phase: 'fetching', round, maxRounds: MAX, ...s, ready: false, score: null, gaps: [] });

  // ① 抓取（跑到配额耗尽或抓完即返回）
  run('抓取全球海关数据', process.execPath, [join(ROOT, 'tools', 'fetch_trade_global.mjs'), '--rounds=1']);

  // ①.5 重建 AI 入口（会随内容变化自动刷新）
  run('重建 AI 可读入口', process.execPath, [join(ROOT, 'tools', 'build_agent_entrypoints.mjs')]);
  run('重建术语总表', process.execPath, [join(ROOT, 'tools', 'build_glossary.mjs')]);
  run('AI 关键词覆盖门禁', process.execPath, [join(ROOT, 'tools', 'keyword_gate.mjs'), '--emit', '--strict']);
  run('重建按平台定制入口', process.execPath, [join(ROOT, 'tools', 'build_per_ai_entrypoints.mjs')]);

  // ② 重建 Excel
  if (existsSync(PY)) run('重建大 Excel 数据库', PY, [join(ROOT, 'tools', 'build_global_excel.py')]);
  else console.log('  ⚠ 未找到 Python，跳过 Excel 重建');

  // ③ 自检
  const a = audit();
  process.stdout.write(a.raw);
  const s2 = stats();
  last = { score: a.score, ready: a.ready, gaps: a.gaps };
  write({ phase: a.ready ? 'ready' : 'iterating', round, maxRounds: MAX, ...s2, ...last });

  if (a.ready) {
    console.log('\n' + '═'.repeat(78));
    console.log('  ✅ 自检通过 · 总分 ' + a.score + ' · 用时 ' + Math.round((Date.now() - start) / 60000) + ' 分钟');
    console.log('  → 可以生成部署包并提交人工上传');
    console.log('═'.repeat(78) + '\n');
    process.exit(0);
  }

  const remaining = MAX - round;
  if (remaining <= 0) break;

  // ④ 未通过 → 判断是"数据还不够"还是"结构缺陷"
  const dataGaps = a.gaps.filter((g) => /国家|数据量|破碎数据|零件数据|覆盖国家/.test(g.item));
  const structGaps = a.gaps.filter((g) => !dataGaps.includes(g));
  if (structGaps.length) {
    console.log('\n  ⚠ 存在结构性缺口（非数据量问题），需人工补齐：');
    for (const g of structGaps) console.log('    ✗ [' + g.dim + '] ' + g.item + ' — ' + g.detail);
  }
  if (!dataGaps.length && structGaps.length) {
    console.log('\n  ✗ 结构性缺口无法靠继续抓取解决，停止循环。');
    break;
  }

  console.log('\n  ⏳ 数据量不足（' + s2.countries + ' 国），等 5 分钟后继续第 ' + (round + 1) + ' 轮…');
  await new Promise((r) => setTimeout(r, 5 * 60 * 1000));
}

const s3 = stats();
write({ phase: 'incomplete', round, maxRounds: MAX, ...s3, ...(last || {}), ready: false });
console.log('\n  ✗ 已达轮次上限或存在结构缺口，未通过自检。当前状态已写入：');
console.log('    ' + STATUS);
console.log('    用 node tools/orchestrate.mjs 可继续。\n');
process.exit(1);
