/**
 * L-34 有效性验证（期望值已修正为符合信任链边界）
 *
 * 两个不同的命题，不能混：
 *   命题 A「工具本身正确」           → L-34 的独立复算链可以验证 ✅
 *   命题 B「verify_all_tools 有效」  → L-34 无法自证 ❌（根本性的信任链限制）
 *
 * 因为 B 无法自证：被桩掉的 verify_all_tools 会报"22/22"，复读它的检查只能照单全收；
 * 而独立复算链绕过它，验的是命题 A。
 *
 * 本脚本验证【命题 A】：
 *   把 plugin 里某个工具的实现改坏（不是改验证器），L-34 必须失败。
 * 并如实记录命题 B 无法验证。
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TARGET = join(ROOT, 'plugin', 'lib', 'data.mjs');
const BAK = TARGET + '.mutbak';
const LESSONS = join(ROOT, 'tools', 'lessons.mjs');

console.log('');
console.log('='.repeat(88));
console.log('  L-34 有效性验证');
console.log('='.repeat(88));
console.log('');

const runL34 = () => spawnSync(process.execPath, [LESSONS, '--id', 'L-34'], { stdio: 'ignore', windowsHide: true, timeout: 600000 });

if (!existsSync(TARGET)) {
  console.log('  ⚠️ 找不到 plugin/lib/data.mjs，无法做命题 A 的突变');
  process.exit(1);
}
copyFileSync(TARGET, BAK);
let restored = false;
const restore = () => { if (!restored) { try { copyFileSync(BAK, TARGET); unlinkSync(BAK); } catch { } restored = true; } };

try {
  const base = runL34();
  console.log('  基线（未突变）: exit=' + base.status + (base.status === 0 ? '  ✅ L-34 通过' : '  ❌ L-34 失败'));

  /* 命题 A 的突变：改坏【工具实现】里的真值（NH400/EC/CSS16 的额定产能 293 → 999） */
  let c = readFileSync(TARGET, 'utf8');
  const before = c;
  /* R49：突变目标改为 EC 腔 CSS16 的 [130,293]（原为 C 腔的 290，该值实为哨兵 999 已被替换）
 *   —— 把 293 改成 999，模拟"工具实现里的真值被改坏"。 */
c = c.replace('130, 293', '130, 999');
  if (c === before) {
    console.log('  ⚠️ 在 data.mjs 里找不到可改的真值（290），换一个目标');
    restore();
    process.exit(1);
  }
  writeFileSync(TARGET, c, 'utf8');
  console.log('  已注入突变：把 data.mjs 里 EC 腔 CSS16 的额定产能 293 改成 999（改坏工具实现，不动验证器）');

  const mut = runL34();
  const caught = mut.status !== 0;
  console.log('  突变后: exit=' + mut.status + (caught ? '  ✅ L-34 失败（抓到工具被改坏）' : '  ❌ L-34 仍通过'));

  const g = existsSync(join(ROOT, 'distribution', '03_验证与基准', 'independent-golden.json'))
    ? JSON.parse(readFileSync(join(ROOT, 'distribution', '03_验证与基准', 'independent-golden.json'), 'utf8'))
    : null;
  if (g) console.log('  独立真值验证: ' + (g.ok ? '通过' : '失败 — ' + g.rows.filter((x) => !x.ok).map((x) => x.tool + ': ' + x.why).join('; ')));

  console.log('');
  console.log('='.repeat(88));
  console.log('  命题 A（工具本身正确）: ' + (base.status === 0 && caught ? '✅ 可验证 —— 工具被改坏时 L-34 会失败' : '❌ 未达预期'));
  console.log('  命题 B（verify_all_tools 有效）: ❌ 无法自证 —— 信任链根本限制');
  console.log('      原因：被桩掉的验证器会报"22/22"，复读它的检查只能照单全收；');
  console.log('            而独立复算链绕过它，验的是命题 A 而不是 B。');
  console.log('      处置：B 只能靠【外部对抗性审查】（如 R18 派审查员做的），不能自证。');
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
