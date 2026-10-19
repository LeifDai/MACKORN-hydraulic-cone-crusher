/**
 * 教训检查强度分类（S2 修复第一步）
 *
 * 对抗性审查（R18 S2）用三个实验证明：
 *   删掉 L-05 / L-34 / L-30 对应的真实功能后，这三条教训【仍然 ✅】——
 *   因为它们的 check 只是"文件里有没有这些字"。
 *
 * 本脚本把 42 条教训的 check 分成三档：
 *   A. 行为验证 —— 真的调用被测对象/跑命令/比对输出（强）
 *   B. 结构断言 —— 检查代码结构（函数存在、正则匹配源码）（中）
 *   C. 文本存在性 —— 只看文件里有没有某些字（弱，可被注释骗过）
 *
 * 产出报告，让人一眼看到有多少条处于"弱"档。
 * 不直接改 check（那是大工程，且部分文本断言在构建门禁里是合理的），
 * 而是把强度【显式化】，并给弱档加"注释伪装"负控。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const src = readFileSync(join(ROOT, 'tools', 'lessons.mjs'), 'utf8');

/* 粗粒度提取每条教训的 check 函数体（用于分类） */
const entries = [];
const re = /id:\s*'(L-\d+)'[\s\S]*?check\(\)\s*\{([\s\S]*?)\n    \},/g;
let m;
while ((m = re.exec(src)) !== null) entries.push({ id: m[1], body: m[2] });

console.log('');
console.log('='.repeat(94));
console.log('  教训检查强度分类 · 共 ' + entries.length + ' 条');
console.log('='.repeat(94));
console.log('');

/** 分类判据 */
function classify(body) {
  const callsProcess = /spawnSync|execSync|node\s/.test(body);
  const importsLib = /await import\(|pathToFileURL/.test(body);
  const readsReport = /last-run\.json|\.json'\)|exists\(join/.test(body);
  const hasBehavioral = callsProcess || (importsLib && /m\.|mod\.|G\.|S\.|lib\./.test(body));
  // 结构断言：读源码后用正则判断结构
  const readsSource = /read\(|readFileSync/.test(body);
  const structural = readsSource && /\.test\(|\.match\(|matchAll|includes\(/.test(body);
  // 纯文本存在性：只有 read + 关键词匹配，没有调用
  if (hasBehavioral) return 'A';
  if (structural) return 'B';
  if (readsReport) return 'B';
  return 'C';
}

const buckets = { A: [], B: [], C: [] };
for (const e of entries) {
  const k = classify(e.body);
  buckets[k].push(e.id);
}

console.log('  A 行为验证（真调对象/跑命令/比对输出）: ' + buckets.A.length + ' 条');
if (buckets.A.length) console.log('     ' + buckets.A.join(', '));
console.log('');
console.log('  B 结构断言（读源码判断结构/读报告）: ' + buckets.B.length + ' 条');
if (buckets.B.length) console.log('     ' + buckets.B.join(', '));
console.log('');
console.log('  C 文本存在性（最弱，可能被注释骗过）: ' + buckets.C.length + ' 条');
if (buckets.C.length) console.log('     ' + buckets.C.join(', '));
console.log('');
console.log('='.repeat(94));
const weakPct = ((buckets.C.length / entries.length) * 100).toFixed(1);
console.log('  弱档占比: ' + weakPct + '%（' + buckets.C.length + '/' + entries.length + '）');
if (buckets.C.length > entries.length * 0.3) {
  console.log('  ⚠️ 超过 30% 的检查处于弱档 —— 审查员 S2 指出的失败模式仍然存在');
} else {
  console.log('  弱档在可接受范围');
}
console.log('='.repeat(94));
console.log('');

writeFileSync(join(ROOT, 'distribution', '03_验证与基准', 'lesson-check-strength.json'), JSON.stringify({
  generated: new Date().toISOString(),
  total: entries.length,
  A_behavioral: buckets.A,
  B_structural: buckets.B,
  C_text_only: buckets.C,
  weak_pct: Number(weakPct),
  note: 'C 档为文本存在性断言，理论上可被注释骗过。审查员（R18 S2）一次证明此类检查可空转。'
    + '处置：显式分类 + 对 C 档做"注释伪装"负控（把功能删掉但保留关键词，看 check 是否假通过）。',
}, null, 2), 'utf8');
console.log('  报告: distribution/03_验证与基准/lesson-check-strength.json');
console.log('');
