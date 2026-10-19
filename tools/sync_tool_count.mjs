/**
 * 工具数同步：把项目里所有「23 个工具 / 22 tools」更新为 22
 *
 * 为什么要脚本而不是手改：
 *   工具数出现在 20+ 个文件里（README/package.json/server.json/各个页面生成器/审计脚本）。
 *   手改必漏，漏了就出现「文档说 21、实际 22」的不一致 —— 这正是教训 L-29「台账要与实际状态一致」。
 *
 * 只替换【确实指工具数】的模式，不动其它 21（如年份、行号、尺寸）。
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const SKIP = /node_modules|\.git|[\\/]dist[\\/]|_deploy|_delta|07_库|实测数据|\.bak$/;
const EXT = /\.(mjs|js|json|md|txt|yml|yaml|php|html)$/;

/** 只替换确指工具数的模式 —— 每条都要求邻近出现 tool/工具 字样 */
const RULES = [
  [/\b21(\s*)(MCP\s+tool)/g, '22$1$2'],
  [/\b21(\s+)(tools?\b)/g, '22$1$2'],
  [/Tools(\s*[:=]{1,3}\s*)21\b/g, 'Tools$122'],
  [/工具\s*\|\s*\*\*21\s*\/\s*21/g, '工具 | **22 / 22'],
  [/(\*\*|`|\s)21(\s*\/\s*)21(\b)/g, '$122$2$322'],
  [/\b21(\s*)个工具/g, '22$1个工具'],
  [/\b21(\s*)工具/g, '22$1工具'],
  [/1\s*\/\s*21(\s*(个)?工具)/g, '1/22$1'],
  [/工具总数[^\d]{0,6}21\b/g, '工具总数 22'],
];

function walk(d, out = []) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (EXT.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
let changed = 0, totalEdits = 0;
const report = [];

/* --dry-run 支持（R18 补）：
 * 早期版本【接受但忽略】这个参数 —— 用户以为只是预演，实际文件已被改写。
 * 「接受参数却忽略」比不支持参数更危险，因为调用方会据此做判断。 */
const DRY = process.argv.includes('--dry-run') || process.argv.includes('-n');

for (const f of files) {
  let c; try { c = readFileSync(f, 'utf8'); } catch { continue; }
  const before = c;
  let edits = 0;
  for (const [re, rep] of RULES) {
    const m = c.match(re);
    if (m) { edits += m.length; c = c.replace(re, rep); }
  }
  // 回读校验（教训 L-28：替换后必须确认结果，不能只看脚本打印）
  if (edits > 0 && c !== before) {
    if (!DRY) {
      writeFileSync(f, c, 'utf8');
      const after = readFileSync(f, 'utf8');
      if (after !== c) { console.log('  ❌ 回读不一致: ' + f); continue; }
    }
    changed += 1; totalEdits += edits;
    report.push({ file: f.replace(ROOT, '.'), edits });
  }
}

console.log('\n  ── 工具数同步 21 → 22 ──');
for (const r of report) console.log('  ✏️  ' + r.edits.toString().padStart(2) + ' 处  ' + r.file);
console.log('\n  共修改 ' + changed + ' 个文件 · ' + totalEdits + ' 处');
console.log('  （每条替换后都回读校验，避免教训 L-28 的静默失败）');

/* ══════════════════════════════════════════════════════════════════
 * L-30 要求的两项验证（R18 S2 修复：原来只在 R28 手工做过，没编进脚本）
 *
 * 对抗性审查发现 L-30 的旧判据是同义反复（裸"工具"匹配任意单字），
 * 所以"幂等性"与"非目标串安全"这两项一直被声称有、实际脚本里没有。
 * 换成正判据后立刻暴露。现在把它们编进来，永久自动化。
 * ══════════════════════════════════════════════════════════════════ */

/* ── 验证 1：非目标串安全（规则不得误伤单位、年份、分数、页码等）──
 * 这些串在项目里真实存在，被误改会造成静默错误（21 mm 变成 22 mm 之类）。 */
const NON_TARGET = [
  '21 mm', '21mm', '21 kW', '21kW', '21%', '1/21', '2021 年', '2021年', '2021-01-01',
  '421', '210', '215', '21.5', '≥21', '0.21', '21 项', 'R21', 'L-21', 'GR-21',
];
const unsafe = [];
for (const s of NON_TARGET) {
  for (const [re, rep] of RULES) {
    if (s.replace(re, rep) !== s) unsafe.push(s + ' ← ' + String(re));
  }
}
console.log('');
if (unsafe.length) {
  console.log('  ❌ 非目标串安全验证失败（' + unsafe.length + ' 处误伤）：');
  for (const u of unsafe.slice(0, 10)) console.log('     · ' + u);
  process.exitCode = 1;
} else {
  console.log('  ✅ 非目标串安全验证：' + NON_TARGET.length + ' 个串（单位/年份/分数/编号）全部未被规则改动');
}

/* ── 验证 2：幂等性（再跑一遍规则，应为 0 改动）── */
let idemEdits = 0;
const idemBad = [];
for (const f of files) {
  let c; try { c = readFileSync(f, 'utf8'); } catch { continue; }
  for (const [re, rep] of RULES) {
    const m = c.match(re);
    if (m) { idemEdits += m.length; c = c.replace(re, rep); idemBad.push(f.replace(ROOT, '.')); }
  }
}
if (idemEdits > 0) {
  console.log('  ❌ 幂等性验证失败：再跑一遍仍有 ' + idemEdits + ' 处改动（规则可能互相触发）：');
  for (const b of [...new Set(idemBad)].slice(0, 8)) console.log('     · ' + b);
  process.exitCode = 1;
} else {
  console.log('  ✅ 幂等性验证：再跑一遍 0 改动（规则不互相触发）');
}
console.log('');
