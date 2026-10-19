/**
 * 交付前自检清单 v2 —— 校验【构建产物 _deploy】而不是源目录
 *
 * 上一版的问题：
 *   ① 校验源目录（语言页还在根，未重构）→ 误报
 *   ② execSync 拼接路径含空格与中文 → 失败
 *   ③ 工具注册正则窗口太小 → 误报
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const STAGE = join(D, '_deploy');

const items = [];
const add = (g, n, ok, d = '') => items.push({ g, n, ok, d });

/* ── 先用文件描述符重定向跑子进程（沙箱下 stdio 管道会 EPERM）── */
function runNode(script) {
  const outFile = join(D, '_chk_tmp.txt');
  try {
    const fd = require('node:fs').openSync(outFile, 'w');
    spawnSync(process.execPath, [script], { stdio: ['ignore', fd, fd], windowsHide: true });
    require('node:fs').closeSync(fd);
    return readFileSync(outFile, 'utf8');
  } catch (e) { return ''; }
  finally { try { rmSync(outFile, { force: true }); } catch { } }
}
import { openSync, closeSync } from 'node:fs';
function runNode2(script) {
  const outFile = join(D, '_chk_' + Math.random().toString(36).slice(2) + '.txt');
  try {
    const fd = openSync(outFile, 'w');
    spawnSync(process.execPath, [script], { stdio: ['ignore', fd, fd], windowsHide: true });
    closeSync(fd);
    return readFileSync(outFile, 'utf8');
  } catch { return ''; }
  finally { try { rmSync(outFile, { force: true }); } catch { } }
}

/* ══ 零、先构建产物 ══ */
{
  const out = runNode2(join(HERE, 'restructure_deploy.mjs'));
  add('构建', '重构 deployment 结构', existsSync(STAGE) && readdirSync(STAGE).length > 0, check(STAGE));
  function check(s) { return existsSync(s) ? readdirSync(s).length + ' 项' : '未生成'; }
}

/* ══ 一、PHP 语法 ══ */
for (const f of ['ai/api/mcp.php', 'ai/api/_data.php']) {
  const p = join(STAGE, f);
  if (!existsSync(p)) { add('PHP 语法', f, false, '包内不存在'); continue; }
  const out = runNode2(join(HERE, 'lint_php.mjs')) || '';
  // lint_php 需参数，改用直接调用
  const r = lintDirect(p);
  add('PHP 语法', f, r.ok, r.ok ? '无解析级错误' : r.errs.join(' / '));
}
function lintDirect(file) {
  const src = readFileSync(file, 'utf8');
  const errs = [];
  let i = 0, line = 1, inS = false, q = '', inLineC = false, inBlkC = false;
  const stack = [], pairs = { ')': '(', ']': '[', '}': '{' };
  while (i < src.length) {
    const ch = src[i], nx = src[i + 1];
    if (ch === '\n') { line++; inLineC = false; i++; continue; }
    if (inLineC) { i++; continue; }
    if (inBlkC) { if (ch === '*' && nx === '/') { inBlkC = false; i += 2; continue; } i++; continue; }
    if (inS) { if (ch === '\\') { i += 2; continue; } if (ch === q) inS = false; i++; continue; }
    if (ch === '/' && nx === '/') { inLineC = true; i += 2; continue; }
    if (ch === '#' && src[i - 1] !== "'") { inLineC = true; i++; continue; }
    if (ch === '/' && nx === '*') { inBlkC = true; i += 2; continue; }
    if (ch === "'" || ch === '"') { inS = true; q = ch; i++; continue; }
    if ('([{'.includes(ch)) { stack.push({ ch, line }); i++; continue; }
    if (')]}'.includes(ch)) { const t = stack.pop(); if (!t) errs.push('行' + line + '多余' + ch); else if (t.ch !== pairs[ch]) errs.push('行' + line + ' ' + ch + '配错'); i++; continue; }
    i++;
  }
  if (inS) errs.push('字符串未闭合');
  if (inBlkC) errs.push('块注释未闭合');
  for (const s of stack) errs.push('行' + s.line + ' ' + s.ch + '未闭合');
  const C = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/'(?:\\.|[^'\\])*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""');
  for (const [re, msg] of [[/\bfn\s*\(/, 'fn()需7.4'], [/\?\?=/, '??=需7.4'], [/\bstr_contains\s*\(/, 'str_contains需8.0'], [/\barray_key_first\s*\(/, 'array_key_first需7.3'], [/\?->/, 'nullsafe需8.0']]) {
    if (re.test(C)) errs.push(msg);
  }
  if (!src.trimStart().startsWith('<?php')) errs.push('未以<?php开头');
  if (src.charCodeAt(0) === 0xFEFF) errs.push('有BOM');
  return { ok: errs.length === 0, errs };
}

/* ══ 二、工具注册 ══ */
{
  const php = readFileSync(join(STAGE, 'ai/api/mcp.php'), 'utf8');
  const fm = php.match(/foreach \(\[\[([\s\S]*?)\]\]+ as \$x\)/);
  const falsy = fm ? [...fm[1].matchAll(/'mackorn_(\w+)'/g)].map((m) => m[1]) : [];
  // $add 的 true 判定：取 $add('name' 到下一个 $add 之间的片段，看末尾是否 , true);
  const addPos = [...php.matchAll(/\$add\('(mackorn_\w+)'/g)].map((m) => ({ n: m[1], i: m.index }));
  const remote = [];
  for (let k = 0; k < addPos.length; k++) {
    // 取到下一个 $add 为止（不设固定窗口，schema 可以很长）
    const seg = php.slice(addPos[k].i, k + 1 < addPos.length ? addPos[k + 1].i : php.length);
    if (/,\s*true\)\s*;/.test(seg)) remote.push(addPos[k].n);
  }
  const effRemote = remote.filter((t) => !falsy.includes(t));
  /* R27 修复：标题写"22"但判据是 === 21（L-48 的"裸数字判断漏改"又一例）。
     * 现改为与 plugin/index.mjs 的实际定义数精确相等。 */
  {
    const __actualTools = (readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8').match(/^\s{2}name: 'mackorn_[a-z_]+',/gm) || []).length;
    const __reg = new Set([...remote, ...falsy]).size;
    add('工具注册', '工具总数 ' + __actualTools + '（与工具定义数精确一致）', __reg === __actualTools, '注册 ' + __reg + ' 实际 ' + __actualTools);
  }
  add('工具注册', 'foreach 不覆盖 true', effRemote.length === remote.length, 'true ' + remote.length + ' · 有效 ' + effRemote.length);
  add('工具注册', 'foreach 注册块已移除', falsy.length === 0, falsy.length ? ('仍有 ' + falsy.length + ' 个') : '已全部显式注册');
  for (const key of ['wear_design', 'market_intel', 'plant_design', 'cost_estimate', 'distributor_eval', 'requirement_intake', 'crusher_curve', 'simulate_flowsheet', 'calibrate', 'proposal', 'intel_watch', 'selection_report', 'knowledge_update', 'pdca_status']) {
    const has = effRemote.includes('mackorn_' + key);
    add('工具注册', '远程: ' + key, has, has ? '' : '不可算');
  }
  for (const t of effRemote) add('工具注册', '路由: ' + t.replace('mackorn_', ''), php.includes("case '" + t + "'"), '');
  {
    /* R27 修复：原来写死"= 21（全部）"且阈值 >= 21 —— 工具数涨到 22 后这条永远通过，失去意义。
     * 改为与 plugin/index.mjs 实际定义数精确相等。 */
    const __actual = (readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8').match(/^\s{2}name: 'mackorn_[a-z_]+',/gm) || []).length;
    add('工具注册', '远程可算工具数 = ' + __actual, effRemote.length === __actual, effRemote.length + ' 个 / 实际 ' + __actual);
  }
}

/* ══ 三、版本 ══ */
{
  const php = readFileSync(join(STAGE, 'ai/api/mcp.php'), 'utf8');
  const vjP = join(STAGE, 'ai/version.json');
  const vj = existsSync(vjP) ? JSON.parse(readFileSync(vjP, 'utf8')) : {};
  const phpVer = (php.match(/MACKORN_VERSION',\s*'([^']+)'/) || [])[1];
  add('版本', 'mcp.php 版本号', !!phpVer, phpVer || '缺');
  add('版本', 'version.json 版本一致', vj.version === phpVer, 'vj=' + vj.version + ' php=' + phpVer);
  add('版本', 'version.json 有 build_id', !!vj.build_id, vj.build_id || '缺');
  /* R26 修复：原来写死"= 21"且阈值 >= 21 —— 就算工具数掉回 21 也照样通过，
     * 门禁失去意义。现与 plugin/index.mjs 的实际定义数【精确相等】才算过。 */
  {
    const __actualTools = (readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8').match(/^\s{2}name: 'mackorn_[a-z_]+',/gm) || []).length;
    add('版本', 'version.json 远程工具数 = ' + __actualTools + '（与工具定义数精确一致）', vj.remote_mcp_tools === __actualTools, 'vj=' + vj.remote_mcp_tools + ' actual=' + __actualTools);
  }
}

/* ══ 四、12 语言 ══ */
{
  const LANGS = ['en', 'ru', 'es', 'pt', 'fr', 'ar', 'id', 'ja', 'de', 'tr', 'vi'];
  let ok = 1;  // 中文 = ai/index.html
  add('语言页', 'zh (ai/index.html)', existsSync(join(STAGE, 'ai/index.html')), '');
  for (const l of LANGS) {
    const good = existsSync(join(STAGE, 'ai', l, 'index.html'));
    if (good) ok++;
    add('语言页', l, good, '');
  }
  add('语言页', '合计 12 语言', ok === 12, ok + '/12');
}

/* ══ 五、入口文件 ══ */
for (const p of ['ai/llms-full.txt', 'ai/CLAUDE.md', 'llms.txt', 'ai.txt', 'robots.txt', 'sitemap.xml',
  '.well-known/agent.json', '.well-known/ai-platforms.json', '.well-known/keywords.json', '.well-known/mcp/server-card.json', 'ai/version.json']) {
  add('入口文件', p, existsSync(join(STAGE, p)), '');
}
{
  const idx = readdirSync(STAGE).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  add('入口文件', 'IndexNow 密钥在根', idx.length === 1, idx.join(',') || '缺');
}

/* ══ 六、根目录最小化 ══ */
{
  const files = readdirSync(STAGE).filter((f) => statSync(join(STAGE, f)).isFile());
  const allowed = new Set(['index.html', 'robots.txt', 'sitemap.xml', 'llms.txt', 'ai.txt', 'llms-full.txt', 'CLAUDE.md', 'htaccess-建议.txt', 'redirects-建议.txt']);
  const extra = files.filter((f) => !allowed.has(f) && !/^[0-9a-f]{32}\.txt$/.test(f));
  add('根目录', '无意外文件', extra.length === 0, extra.join(', ') || 'clean');
  const dirs = readdirSync(STAGE).filter((f) => statSync(join(STAGE, f)).isDirectory());
  const bad = dirs.filter((f) => !['ai', '.well-known'].includes(f));
  add('根目录', '子目录仅 ai 与 .well-known', bad.length === 0, bad.join(', ') || 'clean');
  add('根目录', '文件数 ≤ 8', files.length <= 8, files.length + ' 个');
}

/* ══ 七、门禁（用文件重定向，避免沙箱管道限制）══ */
for (const [name, script, re] of [
  ['单元测试', 'tests/run.mjs', /0 失败/],
  ['十三维自检', 'tools/self_audit.mjs', /✅ 通过/],
  ['关键词覆盖', 'tools/keyword_gate.mjs', /✅ 通过/],
]) {
  const out = runNode2(join(ROOT, script));
  add('门禁', name, re.test(out), re.test(out) ? '通过' : '未通过');
}

/* ══ 输出 ══ */
const groups = {};
for (const it of items) (groups[it.g] ||= []).push(it);
console.log('\n' + '═'.repeat(78));
console.log('  交付前自检清单');
console.log('═'.repeat(78));
let fail = 0;
for (const [g, list] of Object.entries(groups)) {
  const bad = list.filter((x) => !x.ok);
  console.log('\n  【' + g + '】 ' + (list.length - bad.length) + '/' + list.length + (bad.length ? '  ❌' : '  ✅'));
  for (const x of bad) { console.log('    ❌ ' + x.n + (x.d ? '  —  ' + x.d : '')); fail++; }
}
console.log('\n' + '─'.repeat(78));
console.log('  合计 ' + items.length + ' 项 · 通过 ' + (items.length - fail) + ' · 失败 ' + fail);
console.log('  判定: ' + (fail === 0 ? '✅ 可以发送' : '❌ 不可发送 —— 先修 ' + fail + ' 项'));
console.log('─'.repeat(78) + '\n');
