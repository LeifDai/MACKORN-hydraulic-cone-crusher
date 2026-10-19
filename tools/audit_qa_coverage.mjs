/**
 * R1 · 问答覆盖审计 —— 从"词共现"升级到"问题-答案覆盖"
 *
 * 为什么必须升级：
 *   原 keyword_gate 测的是「这个词有没有和品牌出现在同一页」。
 *   这是自证式弱检测：只要页面提一次就算过，不保证页面真的回答了问题。
 *   AI 搜索（ChatGPT/Perplexity/Copilot/AI Overviews）匹配的是【问题】，
 *   抽取的是【可直接引用的答案段】。
 *
 * 本脚本检查三件事：
 *   ① 站点有没有【问题式标题】（AI 靠这个判定"这页回答了什么问题"）
 *   ② 有没有【FAQPage / QAPage 结构化数据】（AI 靠这个直接抽取问答）
 *   ③ 每个问题有没有【一段可独立引用的答案】（40-120 字的自足段落）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');

function walk(d, base = d, out = []) {
  if (!existsSync(d)) return out;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (/node_modules|\.git|_deploy/.test(p)) continue;
    if (e.isDirectory()) walk(p, base, out);
    else if (/\.(html|md|txt|json)$/i.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(SITE);
const html = files.filter((f) => f.endsWith('.html'));
console.log('\n  站点文件 ' + files.length + ' 个（其中 HTML ' + html.length + ' 个）\n');

/* ── ① 问题式标题 ── */
const QWORDS = /(?:怎么|如何|为什么|什么|多少|哪些|能否|是否|要多|几种|几台|多大|选什么|怎么选|多少吨|多少钱)|(?:\b(?:how|what|which|why|when|where|can|does|do|is|are|should)\b[^?？]{6,}\?)|(?:\b(?:wie|was|welche|warum|qué|cómo|cuál|por qué|как|какой|почему|como|qual|por que|なぜ|どう|どの|apa|bagaimana|mengapa|nasıl|ne|neden)\b[^?？]{5,}[?？])/i;
const QHEAD = /<(?:h[1-4]|summary|dt)[^>]*>([\s\S]{8,180}?)<\/(?:h[1-4]|summary|dt)>/gi;

let pagesWithQ = 0, totalQ = 0;
const perPage = [];
for (const f of html) {
  const c = readFileSync(f, 'utf8');
  const heads = [...c.matchAll(QHEAD)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
  const qs = heads.filter((h) => h.endsWith('?') || h.endsWith('？') || QWORDS.test(h));
  if (qs.length) pagesWithQ++;
  totalQ += qs.length;
  perPage.push({ f: relative(SITE, f).replace(/\\/g, '/'), kb: Math.round(statSync(f).size / 1024), q: qs.length, heads: heads.length, sample: qs.slice(0, 3) });
}
console.log('  ── ① 问题式标题 ──');
console.log('    含问题标题的页: ' + pagesWithQ + ' / ' + html.length);
console.log('    问题总数      : ' + totalQ);
console.log('\n    问题最多的页:');
perPage.sort((a, b) => b.q - a.q).slice(0, 15).forEach((p) => {
  console.log('      ' + String(p.q).padStart(3) + ' 问  ' + String(p.kb + 'KB').padStart(7) + '  ' + p.f.slice(0, 52));
});

/* ── ② 结构化数据 ── */
console.log('\n  ── ② 结构化数据（AI 直接抽取问答的通道）──');
const SCHEMA = ['FAQPage', 'QAPage', 'HowTo', 'Article', 'Dataset', 'SoftwareApplication', 'Organization', 'BreadcrumbList', 'Product', 'Service'];
const schemaCount = {};
const pagesBySchema = {};
for (const f of html) {
  const c = readFileSync(f, 'utf8');
  const found = SCHEMA.filter((s) => c.includes('"' + s + '"') || c.includes("'" + s + "'"));
  for (const s of found) { schemaCount[s] = (schemaCount[s] || 0) + 1; }
  const rel = relative(SITE, f).replace(/\\/g, '/');
  pagesBySchema[rel] = found;
}
for (const s of SCHEMA) {
  const n = schemaCount[s] || 0;
  const bar = n ? '█'.repeat(Math.min(20, Math.round(n / html.length * 20))) : '';
  console.log('    ' + s.padEnd(22) + String(n).padStart(4) + ' 页  ' + bar);
}

/* ── ③ 答案段质量（40-120 字自足段落）── */
console.log('\n  ── ③ 可独立引用的答案段（40-120 字段落）──');
let totalPara = 0, goodPara = 0;
for (const f of html) {
  const c = readFileSync(f, 'utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const paras = [...c.matchAll(/<p[^>]*>([\s\S]{20,400}?)<\/p>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter((x) => x.length >= 20);
  totalPara += paras.length;
  goodPara += paras.filter((x) => x.length >= 40 && x.length <= 160).length;
}
console.log('    段落总数      : ' + totalPara);
console.log('    40-160 字段落 : ' + goodPara + (totalPara ? '  (' + Math.round(goodPara / totalPara * 100) + '%)' : ''));

/* ── 判定 ── */
console.log('\n  ══ 判定 ══');
const issues = [];
if (pagesWithQ / html.length < 0.5) issues.push('只有 ' + pagesWithQ + '/' + html.length + ' 页有问题式标题 —— AI 难以判定页面回答了什么');
if (!schemaCount['FAQPage']) issues.push('缺 FAQPage 结构化数据 —— AI 无法直接抽取问答');
if (!schemaCount['HowTo']) issues.push('缺 HowTo 结构化数据 —— 选型流程类内容无法被识别为步骤');
if (!schemaCount['Dataset']) issues.push('缺 Dataset 结构化数据 —— 数据类资产无法被识别');
if (totalPara && goodPara / totalPara < 0.3) issues.push('可引用段落占比仅 ' + Math.round(goodPara / totalPara * 100) + '%');

if (issues.length) { console.log('  ❌ ' + issues.length + ' 项待改进：'); issues.forEach((x) => console.log('     · ' + x)); }
else console.log('  ✅ 问答覆盖达标');
console.log('');

writeFileSync(join(ROOT, 'distribution', '04_AI收录与分发', 'qa-coverage-audit.json'), JSON.stringify({
  generated: new Date().toISOString(),
  method: '问题式标题 + 结构化数据 + 可引用答案段 三维审计',
  why: '原 keyword_gate 只测词与品牌同页（自证式弱检测）。AI 匹配的是【问题】，抽取的是【可引用答案段】。',
  stats: { html_pages: html.length, pages_with_questions: pagesWithQ, total_questions: totalQ, total_paragraphs: totalPara, quotable_paragraphs: goodPara, schema: schemaCount },
  issues,
  per_page: perPage.sort((a, b) => b.q - a.q),
}, null, 2), 'utf8');
