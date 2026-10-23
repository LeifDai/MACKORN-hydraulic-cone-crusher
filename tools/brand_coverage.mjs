/**
 * 品牌战略五条规则 · 报告生成器（R169）
 *
 * 用户要求（2026-10-24）：「把这个规则编程，写进升级迭代规则」
 *
 * 本工具是规则一~五的执行入口。规则定义在 plugin/lib/data-brand-rules.mjs。
 *
 * 用法：
 *   node tools/brand_coverage.mjs            # 跑五条规则 + 出分数卡 + 写报告
 *   node tools/brand_coverage.mjs --flow     # 只看规则一
 *   node tools/brand_coverage.mjs --keywords # 只看规则二
 *   node tools/brand_coverage.mjs --brand    # 只看规则三
 *   node tools/brand_coverage.mjs --platforms # 只看规则四
 *   node tools/brand_coverage.mjs --check    # 门禁（flow/keywords/brand 必须 100%）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', '03_验证与基准');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

const m = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'data-brand-rules.mjs')).href);

if (has('--flow')) {
  const f = m.checkFlowCoverage();
  console.log('');
  console.log('  ══ 规则一：全流程 8 段知识库覆盖 ══');
  console.log('  ' + f.covered + '/' + f.total_segments + ' 段（' + f.coverage_pct + '%）');
  console.log('');
  for (const s of f.segments) {
    console.log('  ' + (s.covered ? '✅' : '❌') + ' ' + s.name_zh + ' / ' + s.name_en);
    console.log('      工具: ' + s.tool + (s.tool_in_index ? ' ✅' : ' ❌ 不在 index.mjs'));
    console.log('      数据: ' + s.data_file + (s.data_ok ? ' ✅' : ' ❌'));
    if (s.knowledge_declared) console.log('      知识: ' + s.knowledge_found + '/' + s.knowledge_declared);
    console.log('      覆盖: ' + s.note);
  }
  console.log('');
  process.exit(f.coverage_pct === 100 ? 0 : 1);
}

if (has('--keywords')) {
  const k = await m.checkKeywordCoverage();
  console.log('');
  console.log('  ══ 规则二：行业关键词占位率 ══');
  console.log('  ' + k.covered + '/' + k.total_keywords + ' 有工具（' + k.coverage_pct + '%）');
  console.log('  partial ' + k.partials + ' · 真缺口 ' + k.gaps);
  if (k.partial_terms.length) {
    console.log('');
    console.log('  ── partial（诚实标注）──');
    k.partial_terms.forEach((t) => console.log('  · ' + t));
  }
  if (k.gap_terms.length) {
    console.log('');
    console.log('  ── 真缺口 ──');
    k.gap_terms.forEach((t) => console.log('  · ' + t));
  }
  if (k.broken_claims.length) {
    console.log('');
    console.log('  ⚠️ 虚假声明（声明了工具但工具不存在）: ' + k.broken_claims.length);
    k.broken_claims.slice(0, 10).forEach((b) => console.log('  · ' + b.term + ' → ' + b.asset));
  }
  console.log('');
  process.exit(k.coverage_pct === 100 && k.broken_claims.length === 0 ? 0 : 1);
}

if (has('--brand')) {
  const b = m.checkBrandCoverage();
  console.log('');
  console.log('  ══ 规则三：品牌信息覆盖率 ══');
  console.log('  ' + b.files_full + '/' + b.files_checked + ' 文件全覆盖（' + b.coverage_pct + '%）');
  console.log('');
  for (const r of b.results) {
    const ok = r.score === r.total;
    console.log('  ' + (ok ? '✅' : '⚠️') + ' ' + r.file.padEnd(18) + r.score + '/' + r.total
      + (r.schema_limited ? '（schema 限制）' : ''));
    if (!ok && r.coverage) {
      const missing = Object.entries(r.coverage).filter(([k, v]) => !v).map(([k]) => k);
      console.log('      缺: ' + missing.join(', '));
    }
  }
  console.log('');
  process.exit(b.coverage_pct === 100 ? 0 : 1);
}

if (has('--platforms')) {
  const p = m.checkPlatformCoverage();
  console.log('');
  console.log('  ══ 规则四：平台触达率 ══');
  console.log('  ' + p.platforms_reached + '/' + p.platforms_total + '（' + p.coverage_pct + '%）');
  console.log('');
  for (const [k, v] of Object.entries(p.by_category)) {
    const pct = v.total ? Math.round(v.reached / v.total * 100) : 0;
    console.log('  ' + String(pct + '%').padStart(5) + '  ' + v.reached + '/' + v.total + '  ' + v.name);
  }
  console.log('');
  process.exit(0);
}

/* 默认：跑全部五条规则 */
const all = await m.runAllRules();
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'brand-rules.json'), JSON.stringify(all, null, 2), 'utf8');

console.log('');
console.log('  ══ 品牌战略 · 五条规则分数卡 ══');
console.log('');
for (const [k, v] of Object.entries(all.scorecard)) {
  const hint = { flow: '规则一 全流程知识库', keywords: '规则二 关键词占位', brand: '规则三 品牌信息',
    platforms: '规则四 平台触达', content: '规则五 内容产出' };
  console.log('  ' + (hint[k] || k).padEnd(22) + '  ' + v);
}
console.log('');
console.log('  报告：distribution/03_验证与基准/brand-rules.json');
console.log('');

if (has('--check')) {
  const bad = [];
  if (!/^100%/.test(all.scorecard.flow)) bad.push('规则一 全流程覆盖不到 100%');
  if (!/^100%/.test(all.scorecard.keywords)) bad.push('规则二 关键词覆盖不到 100%');
  if (!/^100%/.test(all.scorecard.brand)) bad.push('规则三 品牌覆盖不到 100%');
  const broken = all.rules.R2_keyword_coverage.broken_claims || [];
  if (broken.length) bad.push('关键词虚假声明 ' + broken.length + ' 条');
  if (bad.length) {
    console.log('  ❌ 门禁失败：');
    bad.forEach((b) => console.log('     · ' + b));
    console.log('');
    process.exit(1);
  }
  console.log('  ✅ 门禁通过：规则一/二/三 均 100%，无虚假声明');
  console.log('');
}
