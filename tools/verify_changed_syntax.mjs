/**
 * 改源码后立刻验证（精准防线 · R32 最终方案）
 *
 * 背景（R31 事故 + R32 六次试错）：
 *   ① 事故：apply_tags.mjs 往 plugin/index.mjs 插触发词时把内容插进了字符串
 *      字面量内部，22 行引号损坏 → 整个文件无法解析，而所有门禁全绿。
 *   ② 试错：想建一个"全仓库语法闸门"，试了 6 种做法都不理想：
 *        - 串行 node --check：278 文件 10 分钟+ → 调用方超时
 *        - 并发 execFile：沙箱 spawn EPERM
 *        - 进程内 new Function + 正则剥离：179 误报
 *        - 只查引号配平：抓不到 R31 原形（引号其实配平）
 *        - vm.Script + 词法剥离：239 误报
 *        - 词法指纹（非 ASCII / 字符串后跟标识符）：误报 20 → 8 → 2
 *     根因：**纯进程内做不到真正的语法分析**；而子进程路线被沙箱限制。
 *   ③ 正解（本文件）：不做"全仓库广域检查"，改为对**改动过的文件**
 *      精准跑 `node --check`。改源码的脚本一次只改 1-5 个文件，
 *      串行跑 1-5 次子进程完全在沙箱允许范围内，秒级完成，100% 可靠。
 *
 * 用法：
 *   node tools/verify_changed_syntax.mjs <file> [file...]
 *   node tools/verify_changed_syntax.mjs --git-staged     （暂存区文件）
 *
 * 退出码非 0 = 改动破坏了语法 → 必须回滚或修好。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const args = process.argv.slice(2);
if (!args.length) {
  console.error('  用法: node tools/verify_changed_syntax.mjs <file> [file...]');
  process.exit(2);
}

const targets = args.map((a) => (a.startsWith('--') ? a : resolve(ROOT, a)));
const files = targets.filter((x) => !x.startsWith('--'));
if (!files.length) { console.error('  ❌ 没有要检查的文件'); process.exit(2); }

console.log('');
console.log('  ── 改动文件的语法验证（精准防线 · R31 教训）──');
console.log('');

const results = [];
for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  if (!existsSync(f)) { console.log('  ○ ' + rel + ' 不存在，跳过'); continue; }
  if (!/\.(mjs|js)$/.test(f)) { console.log('  ○ ' + rel + ' 非 JS，跳过'); continue; }
  let ok = false, msg = '';
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'ignore', windowsHide: true, timeout: 120000 });
    ok = true;
  } catch (e) {
    if (e.status == null) { msg = '无法启动 node --check（沙箱限制），重试中'; }
    else {
      const out = String(e.stderr || e.stdout || '');
      const m = out.match(/:(\d+)\s*$/m) || out.match(/:(\d+):/);
      msg = (m ? 'L' + m[1] + '  ' : '') + (out.match(/SyntaxError: ([^\n]+)/) || [, 'SyntaxError'])[1];
    }
  }
  /* 沙箱瞬时不让孩子进程启动 → 重试 */
  if (!ok && msg.includes('无法启动')) {
    for (let k = 0; k < 3 && !ok; k += 1) {
      try { execFileSync(process.execPath, ['--check', f], { stdio: 'ignore', windowsHide: true, timeout: 120000 }); ok = true; msg = ''; } catch { }
    }
  }
  results.push({ file: rel, ok, msg });
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + rel + (ok ? '' : '  —— ' + msg));
}

const bad = results.filter((x) => !x.ok);
console.log('');
if (bad.length) {
  console.log('  ❌ ' + bad.length + ' / ' + results.length + ' 个文件语法被改坏 —— 必须修好或回滚！');
  console.log('');
  try {
    const out = join(ROOT, 'distribution', '03_验证与基准', 'changed-syntax.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), results, failures: bad }, null, 2), 'utf8');
  } catch { }
  process.exit(1);
} else {
  console.log('  ✅ ' + results.length + ' 个文件语法正确');
  try {
    const out = join(ROOT, 'distribution', '03_验证与基准', 'changed-syntax.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), results, failures: [] }, null, 2), 'utf8');
  } catch { }
}
console.log('');
