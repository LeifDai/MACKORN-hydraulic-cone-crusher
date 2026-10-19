/**
 * 修复 npm keywords 的空格问题（I-01 相关）
 *
 * 背景（本轮实测发现）：
 *   public-overrides/package.json 有 185 个 keywords，其中 53 个含空格
 *   （"mining industry"、"hydraulic cone crusher"、"cone crusher selection"…）
 *
 * 为什么这是问题：
 *   npm 的 keywords 是【单个词/短语标签】数组，检索时按元素精确匹配。
 *   含空格的元素不会被"分词"成多个关键词，反而变成一个几乎无人检索的长标签；
 *   而真正有效的做法是【拆成单词 + 保留少量高频整短语】。
 *
 * 处置：
 *   ① 把含空格的短语拆成单词（去重、去停用词）
 *   ② 保留少数"确定性高"的整短语（如 "mackorn cone crusher" 这类品牌+品类组合，
 *      因为 AI 检索确实会搜整串），但数量受控
 *   ③ 加门禁：keywords 里含空格的元素占比 > 10% 即警告
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const P = join(ROOT, 'public-overrides', 'package.json');
if (!existsSync(P)) { console.error('  ❌ 找不到 public-overrides/package.json'); process.exit(1); }

const j = JSON.parse(readFileSync(P, 'utf8'));
const before = (j.keywords || []).slice();

/* 保留的整短语白名单（品牌+品类、或行业里会被整串检索的组合） */
const KEEP_PHRASES = new Set([
  'mackorn cone crusher', 'hydraulic cone crusher', 'cone crusher selection',
  'crushing plant design', 'crushing and screening plant', 'mineral processing plant',
  'aggregate plant', 'ore properties', 'jaw plate', 'bowl liner', 'cone liner',
  'wear parts', 'max feed size', 'compressive strength', 'particle size distribution',
  'model context protocol', 'deepseek harness', 'dsh plugin', 'vertical domain plugin',
  'mining industry', 'equipment selection', 'capacity tph',
]);

/* 枚举停用词（拆词后不要这些） */
const STOP = new Set(['and', 'or', 'the', 'of', 'for', 'to', 'in', 'on', 'with', 'a', 'an', 'is', 'by', 'at', 'as']);

const out = new Set();
const phraseKept = [];
const phraseSplit = [];
for (const k of before) {
  const s = String(k).trim();
  if (!s) continue;
  if (!/\s/.test(s)) { out.add(s); continue; }
  if (KEEP_PHRASES.has(s.toLowerCase())) { out.add(s); phraseKept.push(s); continue; }
  /* 其余：拆成单词 */
  phraseSplit.push(s);
  for (const w of s.toLowerCase().split(/[\s\-_/]+/)) {
    const t = w.replace(/[^a-z0-9一-龥]/g, '');
    if (t.length >= 2 && !STOP.has(t)) out.add(t);
  }
}

/* 按"短词优先、字母序"稳定排序，便于 review */
const sorted = [...out].sort((a, b) => {
  const d = a.length - b.length;
  return d !== 0 ? d : a.localeCompare(b);
});

const after = sorted;
const spaceBefore = before.filter((k) => /\s/.test(String(k))).length;
const spaceAfter = after.filter((k) => /\s/.test(String(k))).length;

console.log('');
console.log('='.repeat(88));
console.log('  npm keywords 空格修复');
console.log('='.repeat(88));
console.log('');
console.log('  修复前：' + before.length + ' 个 keyword，其中含空格 ' + spaceBefore + ' 个（' + ((spaceBefore / before.length) * 100).toFixed(1) + '%）');
console.log('  修复后：' + after.length + ' 个 keyword，其中含空格 ' + spaceAfter + ' 个（' + ((spaceAfter / after.length) * 100).toFixed(1) + '%）');
console.log('');
console.log('  保留的整短语（' + phraseKept.length + ' 个）：' + phraseKept.join(' · '));
console.log('  拆分的短语（' + phraseSplit.length + ' 个），示例：' + phraseSplit.slice(0, 5).join(' | '));
console.log('');

if (spaceAfter > after.length * 0.1) {
  console.log('  ⚠️ 含空格比例仍 >10%，需再收敛');
} else {
  console.log('  ✅ 含空格比例已降到 ' + ((spaceAfter / after.length) * 100).toFixed(1) + '%（阈值 10%）');
}

/* 备份后写入 */
copyFileSync(P, P + '.prekeywordfix');
j.keywords = after;
writeFileSync(P, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('');
console.log('  ✅ 已写入 ' + P.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', ''));
console.log('     备份: public-overrides/package.json.prekeywordfix');
console.log('');
