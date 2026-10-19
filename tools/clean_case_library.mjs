/**
 * 选型案例库数据质量清理
 *
 * 发现的两个真实问题：
 *   ① 抓取时跟随重定向，某些站把 host 改写成了不存在的域名（rocktechnology.sandvik → mining.sandvik）
 *      —— 入库的 source_url 必须能回访，不能是失效链接
 *   ② 页面标题含 HTML 实体（&#x7F8E;…），直接入库不可读
 *
 * 纪律：能修的修；修不了的（如 PDF 文本抽取失败）保留但显式标注，
 *       不假装它成功。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const P = join(resolve(HERE, '..'), 'distribution', '07_库', 'XXAL1000.1-选型案例库.json');
const lib = JSON.parse(readFileSync(P, 'utf8'));

const decodeEntities = (s) => String(s || '')
  .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');

let fixed = 0;

for (const c of lib.cases) {
  // ① 修 HTML 实体
  for (const k of ['project', 'process_note', 'evidence_quote', 'material', 'country', 'notes']) {
    if (typeof c[k] === 'string' && /&#x?[0-9A-Fa-f]+;|&amp;|&lt;|&gt;/.test(c[k])) { c[k] = decodeEntities(c[k]); fixed += 1; }
  }
  // ② 修失效 host（重定向改写了域名）
  if (c.source_url && /mining\.sandvik/.test(c.source_url)) {
    c.source_url = c.source_url.replace('https://www.mining.sandvik/', 'https://www.rocktechnology.sandvik/');
    c.url_repair_note = '原抓取链接因重定向指向不存在的 host（mining.sandvik），已按站点真实域名修正为 rocktechnology.sandvik';
    fixed += 1;
  }
  // ③ 清理 project：去掉页面导航噪声（"跳到主要内容 菜单 关闭 …"）
  if (typeof c.project === 'string') {
    const cut = c.project.search(/跳到主要|Skip to main|Ir al contenido|Men[uù] |Close |Cerrar /);
    if (cut > 8) { c.project = c.project.slice(0, cut).trim(); fixed += 1; }
  }
  // ④ PDF 文本抽取失败的如实标注
  if (c.source_type && /PDF/.test(c.source_type) && !c.evidence_quote) {
    c.extraction_status = 'FAILED';
    c.extraction_note = '该 PDF（约 19MB）的文本流未能用朴素方法抽取（无 Tj/TJ 操作符）；记录保留以备人工阅读，但【未提取到任何数据】。不假装成功。';
    c.confidence = 'D';
    fixed += 1;
  }
  // ⑤ 用 evidence_quote 补 material（若正文提到）
  if (!c.material && c.evidence_quote) {
    const m = c.evidence_quote.match(/granite|grano?diorite|basalt|limestone|花岗岩|玄武岩|石灰石|hard rock|硬岩/i);
    if (m) { c.material = /granit|花岗/i.test(m[0]) ? '花岗岩' : /basalt|玄武/i.test(m[0]) ? '玄武岩' : /limestone|石灰/i.test(m[0]) ? '石灰石' : /hard rock|硬岩/i.test(m[0]) ? '硬岩（未细分）' : m[0]; fixed += 1; }
  }
}

// ⑥ 重算置信度：抽出 D 级（抽取失败）不计入有效案例
const effective = lib.cases.filter((c) => c.confidence !== 'D');
lib.quality = {
  cleaned_at: new Date().toISOString(),
  total_records: lib.cases.length,
  effective_records: effective.length,
  failed_extraction: lib.cases.filter((c) => c.confidence === 'D').length,
  fixes_applied: fixed,
  rule: 'confidence D = 未提取到数据（仅留档），不得用于对标；A/B/C 才计入统计',
};
lib.brands = {};
for (const c of effective) lib.brands[c.brand || '未标注'] = (lib.brands[c.brand || '未标注'] || 0) + 1;

writeFileSync(P, JSON.stringify(lib, null, 2), 'utf8');

console.log('\n  ── 案例库质量清理 ──');
console.log('  记录 ' + lib.cases.length + ' 条 · 有效 ' + effective.length + ' 条 · 抽取失败留档 ' + lib.quality.failed_extraction + ' 条');
console.log('  修正项 ' + fixed + ' 处');
console.log('');
for (const c of lib.cases) {
  console.log('  ' + c.id + '  [' + c.confidence + ']  ' + (c.brand || '—').padEnd(9) + (c.model || '—').padEnd(8) + String(c.tph || '—').padStart(6) + ' t/h  ' + (c.material || '—').padEnd(10) + (c.country || '—'));
  if (c.url_repair_note) console.log('          ⚠ ' + c.url_repair_note);
  if (c.extraction_note) console.log('          ⚠ ' + c.extraction_note.slice(0, 90) + '…');
}
console.log('');
