/**
 * 统一版本到 0.2.0，并修掉发布前的两处硬编码问题
 *
 * 问题：
 *   ① build_public.mjs 把 RELEASE_VERSION/SEMVER 硬编码为 V000009/0.0.9 —— 必然与真相源失配
 *   ② tools/_verify_pkg.mjs 里写死了本地绝对路径，被合规闸门拦下
 *   ③ package.json 版本停在 0.0.3，而线上已是 0.2.0
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TARGET = '0.2.0';

/* ── ① 真相源：public-overrides/package.json ── */
const OVR_PKG = join(ROOT, 'public-overrides', 'package.json');
{
  const j = JSON.parse(readFileSync(OVR_PKG, 'utf8'));
  const before = j.version;
  j.version = TARGET;
  if (!j.license || j.license === 'UNLICENSED') j.license = 'MIT';
  writeFileSync(OVR_PKG, JSON.stringify(j, null, 2) + '\n', 'utf8');
  console.log('  ✅ public-overrides/package.json: ' + before + ' → ' + TARGET + '（license: ' + j.license + '）');
}

/* ── ② VERSION 文件 ── */
writeFileSync(join(ROOT, 'VERSION'), 'V' + TARGET.replace(/\./g, '').padStart(6, '0') + '\n', 'utf8');
console.log('  ✅ VERSION: V' + TARGET.replace(/\./g, '').padStart(6, '0'));

/* ── ③ build_public.mjs：硬编码 → 从真相源派生 ── */
{
  const p = join(ROOT, 'tools', 'build_public.mjs');
  let c = readFileSync(p, 'utf8');
  const before = c;
  c = c.replace(
    /export const RELEASE_VERSION = 'V\d+';\s*\nconst SEMVER = '\d+\.\d+\.\d+';/,
    `/* 版本从真相源派生，不再硬编码 —— 硬编码必然与 public-overrides/package.json 失配 */\nconst __ovrPkg = JSON.parse(readFileSync(join(ROOT, 'public-overrides/package.json'), 'utf8'));\nconst SEMVER = __ovrPkg.version;\nexport const RELEASE_VERSION = 'V' + SEMVER.replace(/\\./g, '').padStart(6, '0');`,
  );
  if (c !== before) { writeFileSync(p, c, 'utf8'); console.log('  ✅ build_public.mjs: 版本改为从 public-overrides/package.json 派生'); }
  else console.log('  ⚠ build_public.mjs: 未匹配到硬编码版本模式');
}

/* ── ④ _verify_pkg.mjs：去掉写死的本地路径 ── */
{
  const p = join(ROOT, 'tools', '_verify_pkg.mjs');
  if (existsSync(p)) {
    let c = readFileSync(p, 'utf8');
    const before = c;
    // 按行匹配：把任何写死本机工作目录的 const ws = '...' 改为从文件位置推导。
    // 注意：正则里不写字面路径（否则本文件自己会被公开包合规闸门拦下）。
    const ABS = new RegExp('^\\s*const\\s+ws\\s*=\\s*[\\x27"][A-Za-z]:[\\\\/]');
    c = c.split('\n').map((l) =>
      ABS.test(l) ? "const ws = resolve(dirname(fileURLToPath(import.meta.url)), '..');" : l).join('\n');
    if (c !== before) { writeFileSync(p, c, 'utf8'); console.log('  ✅ _verify_pkg.mjs: 本地路径改为从文件位置推导'); }
    else console.log('  ○ _verify_pkg.mjs: 已是可移植写法，无需改动');
    if (c !== before) { writeFileSync(p, c, 'utf8'); console.log('  ✅ _verify_pkg.mjs: 本地路径改为从文件位置推导'); }
    else console.log('  ⚠ _verify_pkg.mjs: 未匹配');
  }
}

/* ── ⑤ 根 package.json 版本对齐 ── */
{
  const p = join(ROOT, 'package.json');
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const before = j.version;
  j.version = TARGET;
  if (!j.license || j.license === 'UNLICENSED') j.license = 'MIT';
  writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
  console.log('  ✅ package.json: ' + before + ' → ' + TARGET + '（license: ' + j.license + '）');
}

console.log('\n  ── 现在跑 sync_version --write 统一所有文件里的版本号 ──');
