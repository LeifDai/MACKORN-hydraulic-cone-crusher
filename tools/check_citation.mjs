/**
 * CITATION.cff 校验（R73）
 *
 * 为什么需要：GitHub 只有在 CITATION.cff **格式合法**时才显示
 *   「Cite this repository」按钮 —— 而那正是 AI 与学术工具读懂
 *   "该怎么引用我们"的入口。格式错 = 静默失效（GitHub 不会报错给你）。
 *
 * 校验项：
 *   ① 必填字段齐全（cff-version / message / title / authors）
 *   ② cff-version 是受支持的值
 *   ③ version 与 package.json / VERSION 一致
 *   ④ repository-code 与 package.json 的 repository 一致
 *   ⑤ license 与 package.json 一致
 *   ⑥ authors 每项有 family-names 或 name
 *   ⑦ 缩进合法（用 2 空格，不用 tab）
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CFF = join(ROOT, 'CITATION.cff');

const errs = [];
const warns = [];

if (!existsSync(CFF)) {
  console.log('\n  ❌ 找不到 CITATION.cff');
  console.log('     GitHub 只有在有合法 CITATION.cff 时才显示「Cite this repository」按钮 ——');
  console.log('     而那正是 AI/学术工具读懂"该怎么引用我们"的入口。\n');
  process.exit(1);
}

const src = readFileSync(CFF, 'utf8');
const lines = src.split('\n');

/* ① 必填字段 */
const REQ = ['cff-version:', 'message:', 'title:', 'authors:'];
for (const k of REQ) if (!new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm').test(src)) errs.push('缺必填字段 ' + k.replace(':', ''));

/* ② cff-version 合法 */
{
  const m = src.match(/^cff-version:\s*["']?([\d.]+)["']?/m);
  const OK = ['1.0.3', '1.1.0', '1.2.0'];
  if (!m) errs.push('cff-version 读不到');
  else if (!OK.includes(m[1])) warns.push('cff-version ' + m[1] + ' 不是常见值（建议 1.2.0）');
}

/* ③ version 一致 */
{
  const m = src.match(/^version:\s*["']?([^"'\s]+)["']?/m);
  const cffVer = m ? m[1] : null;
  let pkgVer = null;
  try { pkgVer = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version; } catch { }
  if (cffVer && pkgVer && cffVer !== pkgVer) errs.push('version 不一致：CITATION.cff=' + cffVer + ' vs package.json=' + pkgVer);
}

/* ④ repository-code 与 package.json.repository 一致 */
{
  const m = src.match(/^repository-code:\s*["']?([^"'\s]+)["']?/m);
  const cffRepo = m ? m[1].replace(/\.git$/, '').replace(/\/$/, '') : null;
  let pkgRepo = null;
  try {
    const p = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const r = p.repository;
    pkgRepo = typeof r === 'string' ? r : (r && r.url) || null;
    if (pkgRepo) pkgRepo = pkgRepo.replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/$/, '');
  } catch { }
  if (cffRepo && pkgRepo && cffRepo !== pkgRepo) errs.push('repository 不一致：CITATION.cff=' + cffRepo + ' vs package.json=' + pkgRepo);
}

/* ⑤ license 一致 */
{
  const m = src.match(/^license:\s*["']?([^"'\s]+)["']?/m);
  const cffLic = m ? m[1].toUpperCase() : null;
  let pkgLic = null;
  try { pkgLic = String(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).license || '').toUpperCase(); } catch { }
  if (cffLic && pkgLic && cffLic !== pkgLic) errs.push('license 不一致：CITATION.cff=' + cffLic + ' vs package.json=' + pkgLic);
}

/* ⑥ authors 每项有 family-names 或 name
 * ⚠️ R73 自纠：第一版只认 "  - \n    family-names:" 的写法，
 *   而 YAML 常见写法是 "  - family-names: xxx"（同一行）——
 *   于是它把合法的 CITATION.cff 判成错的（校验器自身出错，本会话第 5 次）。
 *   现在两种写法都认。 */
{
  const i = lines.findIndex((l) => /^authors:/.test(l));
  if (i >= 0) {
    let n = 0, good = 0;
    for (let k = i + 1; k < lines.length; k += 1) {
      if (/^[a-z-]+:/.test(lines[k])) break;             // 下一个顶层键
      if (/^\s*-\s/.test(lines[k])) {
        n += 1;
        /* 同行的 "  - family-names: x" */
        if (/^\s*-\s*(family-names|name):/.test(lines[k])) good += 1;
      }
      /* 下一行的 "    family-names: x" */
      if (/^\s+(family-names|name):/.test(lines[k])) good += 1;
    }
    if (n === 0) errs.push('authors 下没有条目');
    else if (good === 0) errs.push('authors 里没有 family-names 或 name');
  }
}

/* ⑦ 缩进不含 tab */
if (/\t/.test(src)) errs.push('含 tab 缩进（YAML 要求空格）');

/* ⑧ 纯文本冒号未加引号的风险（title 里含 ": " 会被 YAML 误解） */
for (const l of lines) {
  const m = l.match(/^\s*(title|abstract|message):\s+(.+)$/);
  if (m && !/^["'|>]/.test(m[2]) && /:\s/.test(m[2]) && m[2].length < 200) {
    warns.push('字段 ' + m[1] + ' 的值里含 ": "，建议加引号或改用 >- 折叠写法');
  }
}

/* ── 输出 ── */
console.log('');
console.log('  ══ CITATION.cff 校验 ══');
console.log('  ' + src.split('\n').length + ' 行 · ' + (src.length / 1024).toFixed(1) + ' KB');
console.log('');
if (errs.length) {
  console.log('  ❌ 致命 ' + errs.length + ' 项：');
  for (const e of errs) console.log('     · ' + e);
} else {
  console.log('  ✅ 未发现致命问题 —— GitHub 应能显示「Cite this repository」');
}
if (warns.length) {
  console.log('');
  console.log('  ⚠️ 提示 ' + warns.length + ' 项：');
  for (const w of warns) console.log('     · ' + w);
}
console.log('');
process.exit(errs.length ? 1 : 0);
