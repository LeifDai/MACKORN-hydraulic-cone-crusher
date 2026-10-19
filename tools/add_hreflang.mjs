/**
 * 补齐 hreflang —— 所有页面都要声明语言版本
 *
 * 为什么重要：
 *   hreflang 告诉搜索引擎/AI「这个页面是哪种语言、对应的其他语言版本在哪」。
 *   缺失会导致：多语言页互相抢排名、AI 不知道该引用哪个语言版本。
 *
 * 规则：
 *   · 每个页面声明自己的语言 + x-default（指向 /ai/ 主入口）
 *   · FAQ 家族（ru/es/id/ar/de-faq）互相声明为 alternate
 *   · 已有 hreflang 的页面不动（避免重复）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');
const BASE = 'https://mackorn.cn';

/* 目录 → 语言 */
const DIR_LANG = [
  [/\/ai\/(en|ru|es|pt|fr|ar|id|ja|de|tr|vi)\//, (m) => m[1]],
  [/\/ai\/(en|ru|es|pt|fr|ar|id|ja|de|tr|vi)-faq\//, (m) => m[1]],
  [/\/ai\/zh/, () => 'zh-CN'],
  [/\/markets\/(au|ca|gh|ph|tz|za|zm)\//, () => 'en'],
  [/\/markets\/(br)\//, () => 'pt'],
  [/\/markets\/(cl|co|mx|pe)\//, () => 'es'],
  [/\/markets\/(de)\//, () => 'de'],
  [/\/markets\/(id)\//, () => 'id'],
  [/\/markets\/(kz|ru|uz)\//, () => 'ru'],
  [/\/markets\/(tr)\//, () => 'tr'],
  [/\/markets\/(vn)\//, () => 'vi'],
  [/\/markets\/(cd)\//, () => 'fr'],
  [/\/markets\/(cn)\//, () => 'zh-CN'],
  [/\/guides\//, () => 'en'],
  [/\/distributors\/(es|fr|pt|ru|zh)\//, (m) => (m[1] === 'zh' ? 'zh-CN' : m[1])],
  [/\/distributors\//, () => 'en'],
  [/\/engineering-firms\/(de|zh)\//, (m) => (m[1] === 'zh' ? 'zh-CN' : m[1])],
  [/\/engineering-firms\//, () => 'en'],
  [/\/contact\/(es|fr|pt|ru|zh)\//, (m) => (m[1] === 'zh' ? 'zh-CN' : m[1])],
  [/\/contact\//, () => 'en'],
  [/\/ai\/tools\//, () => 'en'],
  [/\/ai\/for-ai\//, () => 'en'],
  [/\/ai\/agent\//, () => 'en'],
  [/\/ai\/perspectives\//, () => 'en'],
  [/\/ai\/reference\//, () => 'en'],
  [/\/ai\/parts\//, () => 'en'],
  [/\/ai\/screens\//, () => 'en'],
  [/\/glossary\//, () => 'en'],
  [/^\/index\.html$/, () => 'zh-CN'],
  [/^\/ai\/index\.html$/, () => 'en'],
];

function langOf(abs) {
  const rel = '/' + relative(SITE, abs).replace(/\\/g, '/');
  for (const [re, fn] of DIR_LANG) {
    const m = rel.match(re);
    if (m) return fn(m);
  }
  return null; // 根页/未知
}
function urlOf(abs) {
  const rel = relative(SITE, abs).replace(/\\/g, '/');
  if (rel === 'index.html') return BASE + '/';
  return BASE + '/' + rel.replace(/\/index\.html$/, '/');
}

/* FAQ 家族成员（互相 link） */
const FAQ_FAMILY = ['ru', 'es', 'id', 'ar', 'de'].map((l) => 'ai/' + l + '-faq/index.html');

function walk(d, out = []) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (/node_modules|\.git|_deploy/.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const pages = walk(SITE);
console.log('\n  扫描 ' + pages.length + ' 个 HTML 页\n');

/* FAQ 家族：从站内取实际存在的成员 */
const faqExists = FAQ_FAMILY.filter((f) => existsSync(join(SITE, f)));
const faqBlock = faqExists.map((f) => {
  const l = f.match(/ai\/(\w+)-faq/)[1];
  return '<link rel="alternate" hreflang="' + l + '" href="' + urlOf(join(SITE, f)) + '">';
}).join('\n');

let added = 0, already = 0, unknown = 0;
const unknownPages = [];
for (const p of pages) {
  const lang = langOf(p);
  const url = urlOf(p);
  let c = readFileSync(p, 'utf8');
  if (/rel=["']alternate["'][^>]*hreflang/i.test(c)) { already++; continue; }
  if (!lang) { unknown++; unknownPages.push(relative(SITE, p).replace(/\\/g, '/')); continue; }
  if (!c.includes('</head>')) continue;

  const isFaq = /\/ai\/\w+-faq\//.test(p);
  const block = [
    '<link rel="alternate" hreflang="' + lang + '" href="' + url + '">',
    '<link rel="alternate" hreflang="x-default" href="' + BASE + '/ai/">',
    isFaq && faqBlock ? faqBlock : '',
  ].filter(Boolean).join('\n');

  c = c.replace('</head>', block + '\n</head>');
  writeFileSync(p, c, 'utf8');
  added++;
}

console.log('  ✅ 已补 hreflang: ' + added + ' 页');
console.log('  ○  已有 hreflang: ' + already + ' 页');
if (unknown) {
  console.log('  ⚠️  语言未知（未补）: ' + unknown + ' 页');
  unknownPages.slice(0, 12).forEach((x) => console.log('       ' + x));
}
console.log('  覆盖: ' + (added + already) + '/' + pages.length + ' = ' + Math.round((added + already) / pages.length * 100) + '%\n');
