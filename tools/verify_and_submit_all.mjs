/**
 * 全站上线验证 + 全量 IndexNow 提交
 *
 * 审计脚本只查了 3 个文件；语言版和指南没查。这里把 17 个页面全部验证，
 * 并把 sitemap 里的 71 个 URL 全部提交给 IndexNow（之前只提交了 4 个）。
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'distribution', '官网落地页');
const KEY = readFileSync(join(SRC, '_indexnow-key.txt'), 'utf8').trim();
const ssh = (t) => createHash('sha256').update(t).digest('hex').slice(0, 12);
const LOCAL = (p) => readFileSync(join(SRC, p), 'utf8');
const H = { 'User-Agent': 'Mozilla/5.0' };

/* ---------------- 1) 17 个页面逐个验证 ---------------- */
const PAGES = [
  ['主落地页 /ai/', 'index.html', 'https://mackorn.cn/ai/'],
  ['/ai/llms.txt', 'llms.txt', 'https://mackorn.cn/ai/llms.txt'],
  ['指南索引', 'guides/index.html', 'https://mackorn.cn/ai/guides/'],
  ...['en', 'es', 'ru', 'ar', 'pt', 'id', 'fr'].map((l) => [`语言版 /${l}/`, `${l}/index.html`, `https://mackorn.cn/${l}/`]),
  ...['basalt', 'granite', 'andesite', 'diabase', 'iron_ore', 'copper_ore', 'lead_zinc', 'molybdenum']
    .map((o) => [`指南 /${o}/`, `guides/${o}/index.html`, `https://mackorn.cn/ai/guides/${o}/`]),
];

console.log('=== 1) 全站页面验证（本地 vs 线上）===');
let ok = 0, bad = 0;
const onlineUrls = [];
for (const [label, rel, url] of PAGES) {
  try {
    const lt = LOCAL(rel);
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(20000) });
    const rt = r.status === 200 ? await r.text() : '';
    const same = rt && ssh(lt) === ssh(rt);
    if (same) { ok++; onlineUrls.push(url); }
    else bad++;
    console.log('  ' + (same ? '✅' : '❌') + ' ' + label.padEnd(22) + 'HTTP ' + String(r.status).padEnd(5) + '线上 ' + rt.length + ' / 本地 ' + lt.length);
  } catch (e) {
    bad++;
    console.log('  ❌ ' + label.padEnd(22) + (e.cause?.code || e.message));
  }
}
console.log('\n  一致 ' + ok + ' / 不一致 ' + bad);

/* ---------------- 2) 另外几个文件 ---------------- */
console.log('\n=== 2) 静态文件 ===');
for (const [label, url] of [
  ['sitemap.xml', 'https://mackorn.cn/sitemap.xml'],
  ['根 llms.txt', 'https://mackorn.cn/llms.txt'],
  ['IndexNow 密钥', `https://mackorn.cn/${KEY}.txt`],
  ['server-card.json', 'https://mackorn.cn/.well-known/mcp/server-card.json'],
  ['二维码', 'https://mackorn.cn/ai/repo-qrcode.png'],
]) {
  try {
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(20000) });
    let extra = '';
    if (r.status === 200) {
      const t = await r.text();
      if (label === 'sitemap.xml') extra = ([...t.matchAll(/<loc>/g)]).length + ' 个 URL';
      else extra = t.length + ' 字节';
    }
    console.log('  ' + (r.status === 200 ? '✅' : '❌') + ' ' + label.padEnd(20) + 'HTTP ' + r.status + '  ' + extra);
    if (r.status === 200) onlineUrls.push(url);
  } catch (e) { console.log('  ❌ ' + label + '  ' + (e.cause?.code || e.message)); }
}

/* ---------------- 3) 全量 IndexNow 提交 ---------------- */
console.log('\n=== 3) 全量 IndexNow 提交 ===');
// 从线上 sitemap 取全部 URL（含原有 52 个页面）
let allUrls = [];
try {
  const sm = await (await fetch('https://mackorn.cn/sitemap.xml', { headers: H })).text();
  allUrls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
} catch { }
if (!allUrls.length) allUrls = onlineUrls;
console.log('  从 sitemap 取到 ' + allUrls.length + ' 个 URL');

const body = { host: 'mackorn.cn', key: KEY, keyLocation: `https://mackorn.cn/${KEY}.txt`, urlList: allUrls };
for (const ep of ['https://api.indexnow.org/indexnow', 'https://www.bing.com/indexnow', 'https://yandex.com/indexnow']) {
  try {
    const r = await fetch(ep, {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
    });
    const t = (await r.text()).slice(0, 120);
    console.log('  ' + (r.status === 200 || r.status === 202 ? '✅' : '⚠ ') + ' ' + ep.padEnd(38) + 'HTTP ' + r.status + ' ' + t.replace(/\s+/g, ' '));
  } catch (e) { console.log('  ❌ ' + ep + '  ' + (e.cause?.code || e.message)); }
}

console.log('\n  提交 URL 数: ' + allUrls.length);
console.log('  ' + (bad === 0 ? '🎉 全站 17 个页面全部上线且与本地逐字节一致' : '⚠ 有 ' + bad + ' 个页面不一致，请检查上传'));
