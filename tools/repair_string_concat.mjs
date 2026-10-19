/**
 * 通用修复：多语言触发词块被插进字符串字面量内部造成的引号损坏
 *
 * 损坏形态（apply_tags / add_knowledge_tool 这类"文本替换改源码"的脚本造成）：
 *   description:
 *     '...(触发词)...调用。 + ' 【适用边界】...'',
 *                          ↑ 单引号提前闭合，整个文件 SyntaxError
 *
 * 正确形态：
 *     '...(触发词)...调用。' + ' 【适用边界】...',
 *
 * 本脚本对给定文件做机械修复，并逐轮验证 node --check。
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const targets = process.argv.slice(2);
if (!targets.length) { console.error('  用法: node tools/repair_string_concat.mjs <file> [file...]'); process.exit(2); }

function check(p) {
  try { execFileSync(process.execPath, ['--check', p], { stdio: 'ignore', windowsHide: true, timeout: 60000 }); return null; }
  catch (e) {
    const out = String(e.stderr || e.stdout || '');
    const m = out.match(/:(\d+)\s*$/m) || out.match(/:(\d+):/);
    return { line: m ? Number(m[1]) : null, msg: (out.match(/SyntaxError: ([^\n]+)/) || [, 'unknown'])[1] };
  }
}

for (const rel of targets) {
  const P = resolve(ROOT, rel);
  if (!existsSync(P)) { console.log('  ○ ' + rel + ' 不存在'); continue; }
  console.log('');
  console.log('══ ' + rel + ' ══');

  const pre = check(P);
  if (!pre) { console.log('  ✅ 本来就语法正确，跳过'); continue; }

  const BAK = P + '.strbak';
  if (!existsSync(BAK)) copyFileSync(P, BAK);

  let c = readFileSync(P, 'utf8');
  const orig = c;

  /* ① `。 + ' ` → `。' + ' ` —— 补上被吃掉的闭合引号 */
  let n1 = 0;
  c = c.replace(/。 \+ ' /g, () => { n1 += 1; return "。' + ' "; });

  /* ② 行尾 `'',` → `',`（只对含 `+ ' ` 的行） */
  let n2 = 0;
  const lines = c.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (/\+ ' /.test(lines[i]) && /''\s*,\s*$/.test(lines[i])) {
      lines[i] = lines[i].replace(/''\s*,\s*$/, "',");
      n2 += 1;
    }
  }
  c = lines.join('\n');

  /* ③ 其他常见变体：`) + ' 【` 之类的）
   *   以及把整个触发词块用【单引号包住但内部还有单引号】的情况 —— 交给后续轮次暴露 */
  if (c !== orig) writeFileSync(P, c, 'utf8');
  console.log('  ① 补闭合引号 ' + n1 + ' 处 · ② 修行尾引号 ' + n2 + ' 处');

  /* 逐轮验证（最多 3 轮，每轮暴露新的错误行） */
  for (let round = 1; round <= 3; round += 1) {
    const r = check(P);
    if (!r) { console.log('  ✅ 第 ' + round + ' 轮后 node --check 通过'); break; }
    console.log('  ⚠ 第 ' + round + ' 轮仍失败 @ L' + r.line + ' —— ' + r.msg);
    const L = readFileSync(P, 'utf8').split('\n');
    if (r.line) for (let k = Math.max(0, r.line - 2); k < Math.min(L.length, r.line + 1); k += 1) {
      console.log('      ' + (k + 1) + ': ' + L[k].slice(-130));
    }
    if (round === 3) console.log('  ❌ 需人工处理（备份在 ' + rel + '.strbak）');
  }
}
console.log('');
