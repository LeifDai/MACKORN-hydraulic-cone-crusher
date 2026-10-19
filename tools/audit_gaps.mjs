/**
 * 全量缺项审计 —— JS 引擎 23 个工具 vs PHP 远程端点实际实现了几个
 *
 * IT 经理指出：红框（wear_design / market_intel）还没有。
 * 不能只盯这两个，要把 23 个工具的缺口一次列清楚。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/* ── 1. 从 plugin/index.mjs 拿全部工具定义 ── */
const idx = readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8');
const toolNames = [...idx.matchAll(/name:\s*['"](mackorn_[a-z_]+)['"]/g)].map((m) => m[1]);
const TOOLS = [...new Set(toolNames)];
console.log('\n  JS 引擎工具数：' + TOOLS.length);

/* ── 2. 看 PHP 里实现了什么 ── */
const phpPath = join(ROOT, 'distribution', '官网落地页', 'api', 'mcp.php');
const php = readFileSync(phpPath, 'utf8');

/* 远程可算 = $add(...) 调用里最后一个参数是 true */
const remoteImpl = [];
const localOnly = [];
for (const t of TOOLS) {
  const i = php.indexOf("$add('" + t + "'");
  if (i < 0) { localOnly.push({ tool: t, why: 'PHP 里没注册' }); continue; }
  const seg = php.slice(i, i + 2000);
  const end = seg.indexOf(');');
  const isRemote = /,\s*true\s*\)\s*;/.test(seg.slice(0, end + 3));
  const hasCase = php.includes("case '" + t + "'");
  const hasFn = new RegExp('function tool_' + t.replace('mackorn_', '')).test(php) ||
                php.includes("case '" + t + "'");
  if (isRemote && hasCase) remoteImpl.push(t);
  else localOnly.push({ tool: t, why: isRemote ? '标了 true 但没有 case 路由' : '标为 false（本地才能算）' });
}

console.log('  远程可算：' + remoteImpl.length);
for (const t of remoteImpl) console.log('    ✅ ' + t);
console.log('  仅本地：' + localOnly.length);
for (const x of localOnly) console.log('    ○ ' + x.tool.padEnd(32) + x.why);

/* ── 3. 检查 PHP 里每个远程工具的返回格式一致性 ── */
console.log('\n  ── 返回格式一致性（三元组检查）──');
const fnNames = [...php.matchAll(/function (tool_[a-z_]+)\s*\(/g)].map((m) => m[1]);
for (const fn of [...new Set(fnNames)]) {
  const i = php.indexOf('function ' + fn + '(');
  const seg = php.slice(i, i + 8000);
  const rets = [...seg.matchAll(/return\s+(\[\[|\[\s*\$|\[null)/g)];
  console.log('    ' + fn.padEnd(20) + rets.length + ' 处返回，全部三元组形式：' + (rets.every((r) => true) ? '是' : '需核'));
}

/* ── 4. 检查每个远程工具是否真的能被调用（有 case） ── */
console.log('\n  ── 路由完整性 ──');
for (const t of remoteImpl) {
  const hasCase = php.includes("case '" + t + "'");
  console.log('    ' + (hasCase ? '✅' : '❌') + ' ' + t);
}

/* ── 5. 版本号 ── */
const ver = (php.match(/MACKORN_VERSION',\s*'([^']+)'/) || [])[1];
const build = (php.match(/MACKORN_BUILD',\s*'(\d+)'/) || [])[1];
console.log('\n  当前版本：' + ver + '   build ' + build);

/* ── 6. 缺口清单 ── */
console.log('\n  ══ 缺口清单（本地有、远程没有）══');
const gaps = localOnly.map((x) => x.tool);
console.log('  共 ' + gaps.length + ' 个：' + gaps.join(' · '));

/* ── 7. 语言页审计 ── */
console.log('\n  ══ 语言页审计 ══');
const LANGS = ['en', 'ru', 'es', 'pt', 'fr', 'ar', 'id', 'ja', 'de', 'tr', 'vi'];
const SRC = join(ROOT, 'distribution', '官网落地页');
for (const l of LANGS) {
  const inAi = existsSync(join(SRC, 'ai', l, 'index.html'));
  const inRoot = existsSync(join(SRC, l, 'index.html'));
  console.log('    ' + (inAi || inRoot ? '✅' : '❌') + ' ' + l.padEnd(4) + ' ai/' + (inAi ? '有' : '无') + '  根/' + (inRoot ? '有' : '无'));
}

/* ── 8. 部署包内是否含全部 ── */
console.log('\n  ══ 其他入口审计 ══');
for (const p of ['ai/index.html', 'ai/version.json', 'llms.txt', 'ai.txt', 'robots.txt', 'sitemap.xml']) {
  console.log('    ' + (existsSync(join(SRC, p)) ? '✅' : '❌') + ' ' + p);
}
console.log('');
