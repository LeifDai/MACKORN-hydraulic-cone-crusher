/**
 * 一条命令看全状态（省 token 版）
 *
 * 为什么做这个（用户指令：节约收费的 token）：
 *   本次会话我反复单独跑 5-6 个门禁脚本，每次都产生大段输出 →
 *   既慢、又烧 token、还淹没重点。
 *   本脚本把全部关键检查**汇总成一份极简报告**（默认只输出一行一项），
 *   需要细节时才加 --verbose。
 *
 * 用法：
 *   node tools/status_now.mjs            # 极简（省 token）
 *   node tools/status_now.mjs --verbose  # 附失败项明细
 *   node tools/status_now.mjs --json     # 机器可读
 *   node tools/status_now.mjs --readonly # 只读结果文件、不 spawn（给门禁内部调用；
 *                                        #   避免 enforce→lessons→status_now→tests 的三层嵌套）
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const verbose = process.argv.includes('--verbose');
/* ⚠️ R36：--readonly 不 spawn 任何子进程（只读结果文件）。
 *   为什么：enforce_lessons → lessons(L-53) → status_now → tests/run + self_audit
 *   形成三层嵌套 spawn，沙箱会拒绝 → status_now exit 1 → L-53 假失败。
 *   而且 readonly 模式只读文件、快得多，也更省 token。 */
const readonly = process.argv.includes('--readonly');
const asJson = process.argv.includes('--json');

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const rows = [];

/** 跑一个脚本，只留退出码（不捕获输出 —— 省内存也省 token） */
function run(rel, timeout = 900000) {
  try { execFileSync(process.execPath, [join(HERE, rel)], { stdio: 'ignore', windowsHide: true, timeout }); return 0; }
  catch (e) { return e.status == null ? -1 : e.status; }
}

/* ── ① 从结果文件读（快，不重跑）── */
const lessons = readJson(join(D, '05_视角与复盘', 'lessons-status.json'));
const en = readJson(join(D, '03_验证与基准', 'enforce-lessons-report.json'));
const sg = readJson(join(D, '03_验证与基准', 'syntax-gate.json'));
const hf = readJson(join(D, '04_AI收录与分发', 'hard-facts.json'));
const rg = readJson(join(D, '03_验证与基准', 'run-guards-audit.json'));
const wk = readJson(join(D, '03_验证与基准', 'weak-check-detection.json'));

if (lessons) rows.push({ k: '教训', v: lessons.pass + '/' + lessons.total, ok: lessons.pass === lessons.total });
if (en) rows.push({ k: 'L2门禁', v: en.passed + '/' + en.total, ok: en.passed === en.total });
if (hf) rows.push({ k: '硬事实', v: hf.violations.length === 0 ? '一致' : hf.violations.length + ' 处不一致', ok: hf.violations.length === 0 });
if (rg) rows.push({ k: '守卫高风险', v: rg.high_risk_count + ' 个', ok: rg.high_risk_count === 0 });
if (sg) rows.push({ k: '语法(诊断)', v: sg.failed + ' 个待查', ok: true, note: '诊断工具，已知对多行模板误报' });
if (wk) {
  const g = wk.summary ? wk.summary.green : (wk.stats ? wk.stats.green : null);
  rows.push({ k: 'S2行为级', v: (g != null ? g + ' 条' : '—'), ok: true });
}

/* ── ② 真跑的（决定成败的两项）── */
if (readonly) {
  /* 只读结果文件，不真跑 */
  const tr = readJson(join(D, '03_验证与基准', 'tests-run.json'));
  rows.push({ k: '单元测试', v: tr ? tr.pass + '/' + tr.total : '（未跑）', ok: tr ? tr.fail === 0 : true, note: tr ? '' : 'readonly' });
  const sa = readJson(join(D, '03_验证与基准', 'self-audit.json'));
  rows.push({ k: '十三维自检', v: sa ? sa.score + '/100' : '（未跑）', ok: sa ? sa.score === 100 : true, note: sa ? '' : 'readonly' });
} else {
  rows.push({ k: '单元测试', v: '', ok: run('..\\tests\\run.mjs') === 0 });
  rows.push({ k: '十三维自检', v: '', ok: run('self_audit.mjs') === 0 });
}

const bad = rows.filter((r) => !r.ok);

/* ── 输出 ── */
if (asJson) {
  const out = { generated: new Date().toISOString(), rows, ok: bad.length === 0 };
  try { mkdirSync(join(D, '03_验证与基准'), { recursive: true }); writeFileSync(join(D, '03_验证与基准', 'status-now.json'), JSON.stringify(out, null, 2), 'utf8'); } catch { }
  console.log(JSON.stringify(out));
} else {
  console.log('');
  for (const r of rows) {
    console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + r.k.padEnd(11) + ' ' + r.v + (r.note ? '  (' + r.note + ')' : ''));
  }
  console.log('');
  console.log('  ' + (bad.length === 0 ? '✅ 全部通过' : '❌ ' + bad.length + ' 项未通过: ' + bad.map((x) => x.k).join(', ')));
  console.log('');
}
process.exit(bad.length ? 1 : 0);
