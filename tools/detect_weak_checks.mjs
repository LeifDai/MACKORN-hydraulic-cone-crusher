/**
 * 弱判据识别器 v2（S2 续修）
 *
 * 审查员指出同形态的弱检查还有 L-06 / L-10 / L-15 / L-16 / L-17 / L-19 / L-20 / L-23 / L-24 / L-29 / L-35 / L-36 / L-38。
 * 本脚本把每条 check 的【判据表达式】抽出来，标出哪些是"裸关键词计数"（可被注释骗过）。
 *
 * ⚠️ R56-R61 的血泪史（三次修提取逻辑都不理想，最终换根本做法）：
 *   v1 正则 /id:'(L-\d+)'[\s\S]*?check\(\)\{([\s\S]*?)\n    \},/g
 *      → 非贪婪会跨条跳跃，57 条只抽到 21 条（于是"黄档 0"是假象）
 *   改花括号配对
 *      → 被正则量词 {2,90} 干扰，check 体被截断，行为判据误判为黄
 *   改行边界
 *      → 又只抽到 17 条
 *   **根因：在源码文本上做解析本身就是脆弱做法。**
 *
 *   v2（本版）：lessons.mjs 已 export const LESSONS ——
 *     直接 import，用 `l.check.toString()` 拿【真实函数源码】。零解析、零边界问题、100% 准确。
 *
 * 分级口径：
 *   🔴 裸计数/过宽分支：match().length >= N 且含过宽词分支
 *   🟡 关键词存在性 / 窄计数 / 其他
 *   🟢 行为：起子进程、动态 import、读产物、扫目录、比对数值
 *
 * 关键区分（写进方法说明）：
 *   读【源码】+正则 = 弱（只证明"代码里写了这句话"）
 *   读【产物】+检查 = 强（证明"跑出来的东西确实是这样"）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');

const M = await import(pathToFileURL(join(HERE, 'lessons.mjs')).href);
const LESSONS = M.LESSONS || [];
if (!LESSONS.length) { console.error('  ❌ 未能导入 LESSONS'); process.exit(1); }

/* 过宽的关键词分支（匹配任意单字/极短词，会恒真） */
const LOOSE = /\|(\s*)(工具|tools?|方式|说明|数据|报告|方法|内容|页面|文件)(\s*)(\||\/g)/;

const rows = [];
for (const l of LESSONS) {
  const body = typeof l.check === 'function' ? l.check.toString() : '';
  const counts = [...body.matchAll(/\(([^()]{0,120}\.match\([^()]{0,160}\))\s*\|\|\s*\[\]\)\.length/g)];
  const looseCount = counts.some((c) => LOOSE.test(c[1]));
  const anyCount = counts.length > 0;
  const tests = [...body.matchAll(/\/([^/\n]{2,90})\/\.test\(/g)].map((x) => x[1]);
  const wideTest = tests.some((t) => LOOSE.test('|' + t + '|'));
  /* 行为信号：起子进程 / 动态 import / 读产物 / 扫目录 / 真调工具 */
  const behavioral = /spawnSync|execSync|execFileSync|await import\(|pathToFileURL|\.execute\(|JSON\.parse\(read/.test(body)
    || /readdirSync/.test(body)
    || /join\(D,/.test(body)
    || /walkFiles\(/.test(body)
    || (/readFileSync|read\(/.test(body) && /indexOf\(|includes\(/.test(body));
  const numeric = /Number\.isFinite|>\s*\d|<\s*\d|===\s*\d|\.length\s*[<>=]/.test(body);

  let grade;
  if (behavioral) grade = 'green';
  else if (looseCount || wideTest) grade = 'red';
  else if (anyCount) grade = 'yellow';
  else if (tests.length) grade = 'yellow';
  else if (numeric) grade = 'green';
  else grade = 'yellow';

  rows.push({
    id: l.id, grade, counts: counts.length, tests: tests.length, body_len: body.length,
    signals: { spawn: /spawnSync|execFileSync|execSync/.test(body), readdir: /readdirSync/.test(body), joinD: /join\(D,/.test(body), dynImport: /await import\(/.test(body) },
  });
}

const red = rows.filter((r) => r.grade === 'red');
const yellow = rows.filter((r) => r.grade === 'yellow');
const green = rows.filter((r) => r.grade === 'green');

console.log('');
console.log('  弱判据识别 v2（check.toString()，零解析）· ' + rows.length + ' 条教训');
console.log('  ' + '─'.repeat(88));
console.log('    🔴 裸计数/过宽分支  : ' + red.length + (red.length ? '  → ' + red.map((r) => r.id).join(', ') : '  ✅'));
console.log('    🟡 关键词/窄计数/其他: ' + yellow.length + (yellow.length ? '  → ' + yellow.map((r) => r.id).join(', ') : '  ✅'));
console.log('    🟢 行为/结构数值    : ' + green.length);
console.log('');

mkdirSync(D, { recursive: true });
writeFileSync(join(D, 'weak-check-detection.json'), JSON.stringify({
  generated: new Date().toISOString(),
  total: rows.length,
  red_loose: red.map((r) => r.id),
  yellow: yellow.map((r) => r.id),
  green: green.map((r) => r.id),
  detail: rows,
  method: 'R61：直接 import LESSONS 并用 check.toString() 取真实函数源码（v1 的三种文本解析都不可靠：正则跨条跳跃 / 花括号被正则量词干扰 / 行边界漏抽）',
}, null, 2), 'utf8');
console.log('  报告: distribution/03_验证与基准/weak-check-detection.json');
console.log('');
process.exit(red.length ? 1 : 0);
