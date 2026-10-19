/**
 * 直接运行守卫审计（教训 L-32）
 *
 * 为什么：L-32 的行为化检查（真 import 每个脚本）发现 177 个 tools 脚本
 *   有顶层输出但没有 `isDirectRun` 守卫 —— 任何脚本 import 它们都会
 *   把对方的 CLI 跑一遍，污染输出、误导判断。
 *
 * 本脚本把这份债务量化、可追踪：输出总数、被 import 的高风险子集、以及趋势。
 * 高风险 = 被【其它 tools 脚本或 tests】实际 import 的脚本。
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

export function audit() {
  const dirs = [join(ROOT, 'tools'), join(ROOT, 'tests')];
  const files = [];
  for (const d of dirs) {
    let ents = [];
    try { ents = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) if (e.isFile() && e.name.endsWith('.mjs') && !/^_/.test(e.name)) files.push(join(d, e.name));
  }
  const info = files.map((f) => {
    const c = readFileSync(f, 'utf8');
    return {
      file: f.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, ''),
      hasOutput: /^console\.(log|error)\(/m.test(c),
      hasGuard: /isDirectRun|isMainModule/.test(c),
      hasCli: /process\.argv/.test(c),
    };
  });
  const debt = info.filter((x) => x.hasOutput && !x.hasGuard);

  /* 高风险：被其它脚本 import 的 */
  /* ⚠️ 只认真实的 import 语句（R33 实测：早期版本把 run('x.mjs') 之类的字符串
   *   引用也算成 import，导致 78 个假高风险）。 */
  const importRe = /import\s*\(?[^)]*?['"][^'"]*?\/([A-Za-z0-9_\-]+)\.mjs['"]/g;
  const importedBases = new Set();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(importRe)) importedBases.add(m[1]);
    /* 也认 from './x.mjs' 形式 */
    for (const m of src.matchAll(/from\s+['"][^'"]*?\/([A-Za-z0-9_\-]+)\.mjs['"]/g)) importedBases.add(m[1]);
  }
  const highRisk = debt.filter((x) => importedBases.has(x.file.split('/').pop().replace(/\.mjs$/, '')));
  return { total: info.length, debt: debt.length, high_risk: highRisk.map((x) => x.file), debt_files: debt.map((x) => x.file) };
}

const isDirectRun = (() => { try { return import.meta.url === pathToFileURL(process.argv[1] || '').href; } catch { return false; } })();
if (isDirectRun) {
  const r = audit();
  const bad = r.high_risk;
  console.log('');
  console.log('  直接运行守卫审计（教训 L-32）');
  console.log('  总脚本 ' + r.total + ' · 缺守卫 ' + r.debt + ' 个 · 其中被 import（高风险）' + bad.length + ' 个');
  if (bad.length) { console.log(''); console.log('  ⚠️ 高风险（被 import 却没守卫）：'); bad.slice(0, 15).forEach((f) => console.log('    · ' + f)); }
  else console.log('  ✅ 没有"被 import 却没守卫"的高风险脚本');
  try {
    const out = join(ROOT, 'distribution', '03_验证与基准', 'run-guards-audit.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), ...r, high_risk_count: bad.length }, null, 2), 'utf8');
  } catch { }
  console.log('');
  process.exit(bad.length ? 1 : 0);
}
