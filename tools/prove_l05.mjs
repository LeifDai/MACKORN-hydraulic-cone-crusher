/**
 * 证明重写后的 L-05 能抓住审查员的突变
 *
 * 审查员实验：删掉 enrich_country_pages.mjs 里"取最新年份"的逻辑
 *             （L-05 的全部意义），旧判据仍 ✅。
 * 现在判据验证完整逻辑链，删掉任一环都应失败。
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const T = join(ROOT, 'tools', 'enrich_country_pages.mjs');
const BAK = T + '.mutbak';
const LESSONS = join(ROOT, 'tools', 'lessons.mjs');

console.log('');
console.log('='.repeat(88));
console.log('  证明 L-05 有效：删掉「取最新年份」逻辑，L-05 必须失败');
console.log('='.repeat(88));
console.log('');

const run = () => spawnSync(process.execPath, [LESSONS, '--id', 'L-05'], { stdio: 'ignore', windowsHide: true, timeout: 300000 });

copyFileSync(T, BAK);
let done = false;
const restore = () => { if (!done) { try { copyFileSync(BAK, T); unlinkSync(BAK); } catch { } done = true; } };

try {
  const base = run();
  console.log('  基线（未突变）: exit=' + base.status + (base.status === 0 ? '  ✅ L-05 通过' : '  ❌ L-05 失败'));

  /* 审查员的手法：把"取最新年份"替换为"永远取最后一年"（即旧的错误行为） */
  let c = readFileSync(T, 'utf8');
  const before = c;
  c = c.replace(
    /const latestIdx = \[2, 1, 0\]\.find\([^\n]*\);/,
    'const latestIdx = 2; /* 突变：永远取最新年份，把"未申报"当成 0 */'
  );
  if (c === before) { console.log('  ⚠️ 突变锚点未命中'); restore(); process.exit(1); }
  writeFileSync(T, c, 'utf8');
  console.log('  已注入突变：latestIdx 从 .find() 非空查找 → 硬编码 2（即审查员删掉的那种行为）');

  const mut = run();
  const caught = mut.status !== 0;
  console.log('  突变后: exit=' + mut.status + (caught ? '  ✅ L-05 失败（被抓到）' : '  ❌ L-05 仍通过'));

  console.log('');
  console.log('='.repeat(88));
  if (base.status === 0 && caught) console.log('  ✅ 证明成立：L-05 现在能抓住「取最新年份逻辑被删」的突变');
  else if (base.status !== 0) console.log('  ⚠️ 基线不通过，测试无效');
  else console.log('  ❌ 证明失败');
  console.log('='.repeat(88));
  console.log('');
  restore();
  console.log('  已恢复并清理备份: ' + (!existsSync(BAK) ? '✅' : '⚠ 备份仍在'));
  process.exit(base.status === 0 && caught ? 0 : 1);
} catch (e) {
  restore();
  console.error('  异常，已恢复: ' + e.message);
  process.exit(1);
}
