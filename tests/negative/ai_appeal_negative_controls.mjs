/**
 * AI 友好度评分器 · 负控（R96）
 *
 * 为什么必须有这个：
 *   上一步 ai_appeal.mjs 给本项目打了 100/100（A+）。
 *   **一个只会给满分的东西，等于没有评分器。**
 *   按 L-55/L-57 的纪律：必须用负控证明它【真会失败】。
 *
 * 本负控做三件事：
 *   ① 正常跑 → 应该高分
 *   ② 破坏一个真实条件（临时挪走 CITATION.cff）→ 应该掉分且点名 A12
 *   ③ 恢复 → 应该回到原分
 *
 * 铁律（本会话踩过 4 次的教训）：
 *   负控自己也会坏 —— 所以每一步都要验证"确实生效了"，
 *   不能"跑完不报错"就当通过。
 */
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const TOOL = join(ROOT, 'tools', 'ai_appeal.mjs');
const CFF = join(ROOT, 'CITATION.cff');
const BAK = join(ROOT, '.nc-cff-bak');

let passN = 0, failN = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) { passN += 1; results.push({ name, ok: true, detail }); }
  else { failN += 1; results.push({ name, ok: false, detail }); }
}

import { join as pjoin } from 'node:path';
const TMPJSON = pjoin(ROOT, '.nc-appeal.json');
/* 沙箱不允许 piped stdio（EPERM）—— 改用【文件交接】：
 *   让子进程把 JSON 写到文件，父进程读文件。
 *   这是本会话验证过可靠的做法。 */
function runTool() {
  try { rmSync(TMPJSON, { force: true }); } catch { }
  const r = spawnSync(process.execPath, [TOOL, '--json', '--out', TMPJSON], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
  if (!existsSync(TMPJSON)) return null;
  try { return JSON.parse(readFileSync(TMPJSON, 'utf8')); } catch { return null; }
}

/* ── ① 前置：工具与 CITATION 都在 ── */
check('前置：ai_appeal.mjs 存在', existsSync(TOOL), existsSync(TOOL) ? '✅' : '❌');
check('前置：CITATION.cff 存在', existsSync(CFF), existsSync(CFF) ? '✅' : '❌');
if (!existsSync(TOOL) || !existsSync(CFF)) {
  console.log('  前置不满足，中止');
  console.log('  通过 ' + passN + ' / 失败 ' + failN);
  process.exit(1);
}

/* ── ② 正常分 ── */
const before = runTool();
check('正常跑得到可解析结果', before !== null, before ? 'score ' + before.score : '❌ 解析失败');
const baseScore = before ? before.score : 0;

/* ── ③ 破坏：挪走 CITATION.cff ── */
let broke = false;
try {
  renameSync(CFF, BAK);
  broke = !existsSync(CFF);
} catch (e) { broke = false; }
check('破坏确实生效（CITATION.cff 已挪走）', broke, broke ? '✅' : '❌ 挪走失败，后面结论无效');

if (broke) {
  const after = runTool();
  check('破坏后仍能得到结果', after !== null, after ? 'score ' + after.score : '❌');
  if (after) {
    check('破坏后分数确实下降', after.score < baseScore, '修复前 ' + baseScore + ' → 破坏后 ' + after.score);
    const namesA12 = (after.failed || []).some((f) => f.id === 'A12');
    check('破坏后点名 A12（CITATION.cff）', namesA12, namesA12 ? '✅ 准确指出缺失项' : '❌ 没点名，说明判据不精确');
  }
  /* 恢复 */
  let restored = false;
  try { renameSync(BAK, CFF); restored = existsSync(CFF); } catch { restored = false; }
  check('恢复确实生效', restored, restored ? '✅' : '❌ 恢复失败！需手工检查 CITATION.cff');

  const again = runTool();
  check('恢复后分数回到原位', again !== null && again.score === baseScore, again ? '恢复后 ' + again.score + '（基线 ' + baseScore + '）' : '❌');
}

/* ── ④ 清理残留 ── */
try { if (existsSync(BAK)) rmSync(BAK, { force: true }); } catch { }

/* ── 清理临时 JSON（避免污染工作区，见 L-69 凭据卫生）── */
try { rmSync(TMPJSON, { force: true }); } catch { }

/* ── 输出 ── */
console.log('');
console.log('  ══ AI 友好度评分器 · 负控 ══');
console.log('');
for (const r of results) console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + r.name + '　—　' + r.detail);
console.log('');
console.log('  通过 ' + passN + ' / 失败 ' + failN);
console.log('');
if (failN === 0) {
  console.log('  ✅ 负控成立：评分器【会失败】、会准确点名、破坏可恢复。');
  console.log('     所以它给的 100/100 有证据力 —— 不是只会给满分。');
} else {
  console.log('  ❌ 负控失败：评分器不可信，它给的分数不能采信。');
}
console.log('');
process.exit(failN === 0 ? 0 : 1);
