/**
 * 构建一致性检测 v3 —— 重建两次再比对
 *
 * v1 的误报：直接比 源hash vs 构建hash，但 restructure 会重写内部链接
 * v2 的缺陷：流程是【快照 → 重建 → 快照 → 比对】，
 *            任何"重建本身会改内容"的文件（如 sitemap 含当天日期）会让比对失败，
 *            结果任何改动后的首次运行都误报"不稳定"。
 * v3 的做法：【重建 → 快照 → 重建 → 快照 → 比对】
 *            先重建一次归零，再测两次重建是否一致 —— 这才是真正的"可重复性"。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const STAGE = join(D, '_deploy');

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
function snapshot(dir, base = dir, out = {}) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) snapshot(p, base, out);
    else if (e.isFile()) out[relative(base, p).replace(/\\/g, '/')] = sha(p);
  }
  return out;
}
const rebuild = () => spawnSync(process.execPath, [join(HERE, 'restructure_deploy.mjs')], { stdio: 'ignore', windowsHide: true });

const errs = [];

/* ── 一、先重建归零，再测两次重建是否一致 ── */
rebuild();
const A = snapshot(STAGE);
rebuild();
const B = snapshot(STAGE);

const diff = [];
for (const [k, v] of Object.entries(B)) {
  if (!A[k]) diff.push(k + '（重建后才出现）');
  else if (A[k] !== v) diff.push(k + '（内容变化）');
}
for (const k of Object.keys(A)) if (!B[k]) diff.push(k + '（重建后消失）');

if (diff.length) {
  errs.push('两次重建结果不一致（' + diff.length + ' 个文件）—— 构建不可重复');
  for (const d of diff.slice(0, 8)) errs.push('   · ' + d);
  errs.push('   检查：是否有文件含构建时间戳（如 sitemap 的 lastmod）？构建应可重复。');
}

/* ── 二、stage 目录名统一 ── */
{
  const refs = new Set();
  for (const f of readdirSync(HERE).filter((x) => x.endsWith('.mjs'))) {
    const c = readFileSync(join(HERE, f), 'utf8');
    for (const m of c.matchAll(/['"](_deploy\d*)['"]/g)) refs.add(m[1]);
  }
  if (refs.size > 1) errs.push('stage 目录名不统一：' + [...refs].join(' / ') + '（F-18 根因）');
}

/* ── 三、版本三处一致 + 工具数一致 ── */
{
  const phpP = join(STAGE, 'ai/api/mcp.php');
  const vjP = join(STAGE, 'ai/version.json');
  const genP = join(HERE, 'gen_php_mcp.mjs');
  if (existsSync(phpP) && existsSync(vjP)) {
    const php = readFileSync(phpP, 'utf8');
    const vj = JSON.parse(readFileSync(vjP, 'utf8'));
    const phpVer = (php.match(/MACKORN_VERSION',\s*'([^']+)'/) || [])[1];
    if (phpVer !== vj.version) errs.push('版本不一致：mcp.php=' + phpVer + ' vs version.json=' + vj.version);
    if (existsSync(genP)) {
      /* R97：生成器里的版本现在是【模板占位符】（形如 ${TRUTH_VERSION}），
       * 不再是字面量 —— 它从 version.json 真相源读。
       * 原判据直接把占位符当版本比较 → 假告警。
       * 修：遇到模板占位符就视为"与真相源一致"，只比真相源值。 */
      const genRaw = (readFileSync(genP, 'utf8').match(/MACKORN_VERSION',\s*'([^']+)'/) || [])[1];
      const genIsTemplate = !!genRaw && genRaw.startsWith('$' + '{');
      const genVer = genIsTemplate ? String(vj.version) : genRaw;
      if (genVer !== phpVer) errs.push('版本不一致：生成器=' + genVer + ' vs mcp.php=' + phpVer);
    }
    const pos = [...php.matchAll(/\$add\('(mackorn_\w+)'/g)].map((m) => ({ n: m[1], i: m.index }));
    const remote = [];
    for (let k = 0; k < pos.length; k++) {
      const seg = php.slice(pos[k].i, k + 1 < pos.length ? pos[k + 1].i : php.length);
      if (/,\s*true\)\s*;/.test(seg)) remote.push(pos[k].n);
    }
    if (remote.length !== vj.remote_mcp_tools) errs.push('远程工具数不一致：实际 ' + remote.length + ' vs 声明 ' + vj.remote_mcp_tools);
  }
}

/* ── 四、关键文件齐全（含 12 语言）── */
for (const p of ['ai/api/mcp.php', 'ai/api/_data.php', 'ai/version.json', 'ai/index.html', 'llms.txt', 'robots.txt', 'sitemap.xml', '.well-known/agent.json']) {
  if (!existsSync(join(STAGE, p))) errs.push('构建产物缺失：' + p);
}
for (const l of ['en', 'ru', 'es', 'pt', 'fr', 'ar', 'id', 'ja', 'de', 'tr', 'vi']) {
  if (!existsSync(join(STAGE, 'ai', l, 'index.html'))) errs.push('语言页缺失：ai/' + l + '/index.html');
}

/* ── 五、与基线对比（信息性）── */
let baseInfo = '无基线';
try {
  const mf = JSON.parse(readFileSync(join(D, 'released-manifest.json'), 'utf8'));
  const bi = Object.keys(mf.files || {}).length;
  const changed = Object.keys(B).filter((k) => mf.files[k] && mf.files[k].sha !== B[k]).length;
  baseInfo = '基线 ' + bi + ' 文件 · 与基线差异 ' + changed + ' 个';
} catch { }

console.log('\n  ── 构建一致性（重建两次比对）──');
console.log('    ' + Object.keys(B).length + ' 个文件 · ' + baseInfo);
if (errs.length) {
  console.log('    ❌ 致命 ' + errs.length + ' 项：');
  errs.forEach((e) => console.log('       ' + (e.startsWith('   ·') || e.startsWith('   检查') ? e : '· ' + e)));
} else {
  console.log('    ✅ 构建可重复 · 目录名统一 · 版本与工具数三处一致 · 关键文件齐全（含 12 语言）');
}
process.exit(errs.length ? 1 : 0);
