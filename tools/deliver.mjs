/**
 * 交付总控 —— 一条命令跑完：构建 → 校验 → 差量打包
 *
 * 用法：
 *   node tools/deliver.mjs            全流程（构建+校验+差量）
 *   node tools/deliver.mjs --full     强制出全量包（首次上传或线上版本不明时用）
 *   node tools/deliver.mjs --confirm  用户确认上传成功后，建立新基线
 *   node tools/deliver.mjs --status   只看与基线的差异
 */
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const MANIFEST = join(D, 'released-manifest.json');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);

/* 沙箱下管道捕获会 EPERM，必须用文件描述符重定向 */
function runCaptured(script, args = []) {
  const outFile = join(D, '_out_' + Math.random().toString(36).slice(2) + '.txt');
  let out = '', code = 1;
  try {
    const fd = openSync(outFile, 'w');
    const r = spawnSync(process.execPath, [join(HERE, script), ...args], { stdio: ['ignore', fd, fd], windowsHide: true });
    closeSync(fd);
    code = r.status === null ? 1 : r.status;
    out = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
  } catch (e) { out = String(e.message); }
  finally { try { rmSync(outFile, { force: true }); } catch { } }
  return { ok: code === 0, code, out };
}
function run(script, label, args = []) {
  process.stdout.write('  ' + label.padEnd(22));
  const r = runCaptured(script, args);
  console.log(r.ok ? '✅' : '❌');
  return r;
}

/* ── 处理 --confirm / --status（直接转发）── */
if (has('--confirm')) {
  const r = spawnSync(process.execPath, [join(HERE, 'build_delta.mjs'), '--confirm'], { stdio: 'inherit', windowsHide: true });
  process.exit(r.status || 0);
}
if (has('--status')) {
  const r = spawnSync(process.execPath, [join(HERE, 'build_delta.mjs'), '--status'], { stdio: 'inherit', windowsHide: true });
  process.exit(r.status || 0);
}

console.log('\n' + '═'.repeat(78));
console.log('  MACKORN 交付流程');
console.log('═'.repeat(78) + '\n');

/* ── 第一关：构建 ── */
const b = run('restructure_deploy.mjs', '① 重构部署结构');
if (!b.ok) { console.log('\n  ❌ 构建失败，终止\n' + b.out.slice(-500)); process.exit(1); }

/* ── 第一关半：构建一致性（F-18 的教训）── */
const cons = run('check_build_consistency.mjs', '①b 构建一致性');
if (!cons.ok) {
  console.log('\n  ❌ 构建产物与源不一致 —— 自检验的可能是旧文件，终止。\n' + cons.out.slice(-600));
  process.exit(1);
}

/* ── 第二关：PHP 语法 ── */
let phpOk = true;
for (const [f, label] of [['mcp.php', '② PHP 语法 mcp.php'], ['_data.php', '   PHP 语法 _data.php']]) {
  const p = f === 'mcp.php' ? join(D, '官网落地页', 'api', 'mcp.php') : join(D, '官网落地页', 'api', '_data.php');
  const r = runCaptured('lint_php.mjs', [p]);
  console.log('  ' + label.padEnd(22) + (r.ok ? '✅' : '❌'));
  if (!r.ok) { phpOk = false; console.log(r.out.split('\n').filter((l) => l.includes('·')).map((l) => '      ' + l.trim()).join('\n')); }
}
if (!phpOk) { console.log('\n  ❌ PHP 语法不通过 —— 上传必然 500，终止。\n'); process.exit(1); }

/* ── 第三关：自检清单 ── */
const c = run('preflight_checklist.mjs', '③ 自检清单 66 项');
const failLine = (c.out.match(/合计 \d+ 项 · 通过 \d+ · 失败 (\d+)/) || [])[1];
if (failLine && failLine !== '0') {
  console.log('\n  ❌ 自检有 ' + failLine + ' 项未通过，终止：');
  c.out.split('\n').filter((l) => l.trim().startsWith('❌')).forEach((l) => console.log('    ' + l.trim()));
  process.exit(1);
}

/* ── 第三关半：经验与教训门禁（L2）──
 * 把"经验"和"教训"变成发布前必须通过的门。
 * 只要有一条已确认的教训被违反，或护栏负控不响，就不许交付。
 */
console.log('  ' + '③b 经验教训门禁'.padEnd(22) + '…');
{
  const g = spawnSync(process.execPath, [join(HERE, 'enforce_lessons.mjs'), '--quick'], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
  if (g.status !== 0) {
    console.log('  ❌ 经验教训门禁未通过 —— 有已确认的教训被违反');
    console.log('     明细: node tools/enforce_lessons.mjs');
    process.exit(1);
  }
  console.log('  ✅ 经验教训门禁通过（32 条教训 + 库检查 + 护栏负控 + 物理不变量）');
}

/* ── 第四关：差量打包 ── */
console.log('  ' + '④ 差量打包'.padEnd(22) + '…');
const dArgs = has('--full') ? ['--full'] : [];
const dd = runCaptured('build_delta.mjs', dArgs);
  console.log(dd.out);

/* ── 汇总 ── */
console.log('═'.repeat(78));
console.log('  ✅ 四关全过，可以交付');
console.log('═'.repeat(78) + '\n');
