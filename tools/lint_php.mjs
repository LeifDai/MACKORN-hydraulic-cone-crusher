/**
 * PHP 7.2 严格语法排查（无 PHP 环境下的最优近似）
 * 逐字符词法扫描 + 括号栈 + 7.3/8.x 语法黑名单 + 函数调用尾逗号 + 引号串插值检查
 *
 * 用法：
 *   node tools/lint_php.mjs <file.php>   检查单个文件
 *   node tools/lint_php.mjs              检查部署目录里全部 .php（R45 新增，之前无参数会崩）
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** 收集待检文件：给了参数就用参数，否则扫部署目录 */
function collectFiles() {
  const arg = process.argv[2];
  if (arg) return [resolve(ROOT, arg)];
  const dirs = [join(ROOT, 'distribution', '_deploy'), join(ROOT, 'distribution', '官网落地页')];
  const out = [];
  const walk = (d, dep = 0) => {
    if (dep > 6 || !existsSync(d)) return;
    let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const q = join(d, e.name);
      if (e.isDirectory()) walk(q, dep + 1);
      else if (e.name.endsWith('.php')) out.push(q);
    }
  };
  for (const d of dirs) walk(d);
  return out;
}

const FILES = collectFiles();
if (!FILES.length) { console.error('  ❌ 没有找到 .php 文件'); process.exit(2); }

if (FILES.length > 1) console.log('\n  PHP 语法排查：' + FILES.length + ' 个文件\n');

let totalErrs = 0, totalWarns = 0, bad = 0;
for (const file of FILES) {
  const r = lintOne(file);
  totalErrs += r.errs.length; totalWarns += r.warns.length;
  if (r.errs.length) { bad += 1; console.log('  ❌ ' + relative(ROOT, file).replace(/\\/g, '/') + '  ' + r.errs.slice(0, 3).join('; ')); }
  else if (FILES.length === 1) console.log('  ✅ 无错误' + (r.warns.length ? '（' + r.warns.length + ' 条警告）' : ''));
}

if (FILES.length > 1) {
  console.log('');
  console.log('  ' + (bad === 0 ? '✅ 全部 ' + FILES.length + ' 个 PHP 文件通过' : '❌ ' + bad + '/' + FILES.length + ' 个文件有问题'));
  console.log('  错误 ' + totalErrs + ' · 警告 ' + totalWarns);
  console.log('');
}
process.exit(totalErrs ? 1 : 0);

/** 单文件词法检查（返回 {errs, warns}） */
function lintOne(file) {
const src = readFileSync(file, 'utf8');
const errs = [], warns = [];

let i = 0, line = 1;
const stack = [];
const pairs = { ')': '(', ']': '[', '}': '{' };
let inS = false, q = '', inLineC = false, inBlkC = false;

while (i < src.length) {
  const ch = src[i], nx = src[i + 1];
  if (ch === '\n') { line++; inLineC = false; i++; continue; }
  if (inLineC) { i++; continue; }
  if (inBlkC) { if (ch === '*' && nx === '/') { inBlkC = false; i += 2; continue; } i++; continue; }
  if (inS) {
    if (ch === '\\') { i += 2; continue; }
    if (ch === q) inS = false;
    i++; continue;
  }
  if (ch === '/' && nx === '/') { inLineC = true; i += 2; continue; }
  if (ch === '#' && src[i - 1] !== "'") { inLineC = true; i++; continue; }
  if (ch === '/' && nx === '*') { inBlkC = true; i += 2; continue; }
  if (ch === '<' && src.slice(i, i + 3) === '<<<') {
    const m = src.slice(i).match(/^<<<\s*(['"]?)([A-Za-z_]\w*)\1\r?\n/);
    if (m) {
      const tag = m[2];
      const endRe = new RegExp('\\n' + tag + ';?\\r?\\n');
      const rest = src.slice(i + m[0].length);
      const em = rest.match(endRe);
      if (!em) { errs.push('行 ' + line + ': heredoc ' + tag + ' 未闭合'); break; }
      const consumed = m[0].length + em.index + em[0].length;
      line += (src.slice(i, i + consumed).match(/\n/g) || []).length;
      i += consumed; continue;
    }
  }
  if (ch === "'" || ch === '"') { inS = true; q = ch; i++; continue; }
  if ('([{'.includes(ch)) { stack.push({ ch, line }); i++; continue; }
  if (')]}'.includes(ch)) {
    const top = stack.pop();
    if (!top) errs.push('行 ' + line + ': 多余的 "' + ch + '"');
    else if (top.ch !== pairs[ch]) errs.push('行 ' + line + ': "' + ch + '" 与行 ' + top.line + ' 的 "' + top.ch + '" 不匹配');
    i++; continue;
  }
  i++;
}
if (inS) errs.push('字符串未闭合（引号 ' + q + '）');
if (inBlkC) errs.push('块注释未闭合');
for (const s of stack) errs.push('行 ' + s.line + ': "' + s.ch + '" 未闭合');

/* 语法黑名单 */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')
  .replace(/'(?:\\.|[^'\\])*'/g, "''")
  .replace(/"(?:\\.|[^"\\])*"/g, '""');
const C = strip(src);
const BAN = [
  [/\bfn\s*\(/, '箭头函数 fn() —— PHP 7.4+'],
  [/\?\?=/, '空合并赋值 —— PHP 7.4+'],
  [/\bstr_contains\s*\(/, 'str_contains() —— PHP 8.0+'],
  [/\bstr_starts_with\s*\(/, 'str_starts_with() —— PHP 8.0+'],
  [/\bstr_ends_with\s*\(/, 'str_ends_with() —— PHP 8.0+'],
  [/\barray_key_first\s*\(/, 'array_key_first() —— PHP 7.3+'],
  [/\barray_key_last\s*\(/, 'array_key_last() —— PHP 7.3+'],
  [/\bmatch\s*\(/, 'match 表达式 —— PHP 8.0+'],
  [/\?->/, 'nullsafe —— PHP 8.0+'],
];
for (const [re, msg] of BAN) {
  const m = C.match(re);
  if (m) errs.push(msg + '（' + m.length + ' 处）');
}

/* 函数调用尾逗号（7.3+）：逗号后紧跟 ) 且不是 array(...) 的收尾 */
let tail = 0;
const L = C.split('\n');
for (let k = 0; k < L.length - 1; k++) {
  if (/,\s*$/.test(L[k]) && /^\s*\)/.test(L[k + 1])) {
    const after = L[k + 1].replace(/^\s*\)\s*/, '');
    if (/^[;,)\]]/.test(after) || after === '') tail++;
  }
}
if (tail) warns.push('疑似函数调用尾逗号 ' + tail + ' 处（若外层是 array() 则合法）');

/* 双引号串内花括号配对 */
for (const s of (src.match(/"(?:\\.|[^"\\])*"/g) || [])) {
  const o = (s.match(/\{/g) || []).length, c2 = (s.match(/\}/g) || []).length;
  if (o !== c2) warns.push('双引号串内花括号不配对: ' + s.slice(0, 50));
}

if (!src.trimStart().startsWith('<?php')) errs.push('未以 <?php 开头');
if (src.charCodeAt(0) === 0xFEFF) errs.push('含 UTF-8 BOM');

/* 单文件模式下打印明细；多文件模式由外层汇总 */
if (process.argv[2]) {
  console.log('\n  ── PHP 7.2 校验: ' + file.split(/[\\/]/).pop() + ' ──');
  console.log('    ' + src.split('\n').length + ' 行 · ' + (src.length / 1024).toFixed(1) + ' KB');
  if (errs.length) { console.log('    ❌ 致命 ' + errs.length + ' 项：'); errs.forEach((e) => console.log('       · ' + e)); }
  else console.log('    ✅ 未发现解析级错误');
  if (warns.length) { console.log('    ⚠ 提示 ' + warns.length + ' 项：'); warns.forEach((w) => console.log('       · ' + w)); }
  console.log('    判定: ' + (errs.length === 0 ? '✅ 可上传' : '❌ 不可上传'));
}
return { errs, warns };
}

