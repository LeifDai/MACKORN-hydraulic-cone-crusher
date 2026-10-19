/**
 * IndexNow 全量提交 —— 把 sitemap 里的全部 URL 提交给 Bing/Yandex/IndexNow
 *
 * 为什么重要：
 *   Bing 索引 → ChatGPT 联网搜索 / Microsoft Copilot
 *   Yandex 索引 → YandexGPT / GigaChat（俄语区，我们的第一市场）
 *
 * IndexNow 单次上限 10,000 URL，我们 120 个一次搞定。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');
const HOST = 'mackorn.cn';
const KEY = '836604ef2cb766c53bd4e0a7755b01db';
const KEY_LOC = `https://${HOST}/${KEY}.txt`;

/* ── 从 sitemap 取全部 URL ── */
const sm = join(SITE, 'sitemap.xml');
if (!existsSync(sm)) { console.error('  缺 sitemap.xml'); process.exit(1); }
const urls = [...readFileSync(sm, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
console.log('\n  ── IndexNow 全量提交 ──\n');
console.log('  主机    ' + HOST);
console.log('  密钥    ' + KEY);
console.log('  URL 数  ' + urls.length);

/* ── 验证密钥文件在线 ── */
console.log('\n  [1] 验证密钥文件…');
let keyOk = false;
try {
  const r = await fetch(KEY_LOC, { signal: AbortSignal.timeout(20000) });
  const t = (await r.text()).trim();
  keyOk = r.ok && t === KEY;
  console.log('      HTTP ' + r.status + '  内容「' + t.slice(0, 40) + '」  ' + (keyOk ? '✅ 匹配' : '❌ 不匹配'));
} catch (e) { console.log('      ❌ ' + (e.cause?.code || e.name)); }
if (!keyOk) {
  console.log('\n  ⚠ 密钥文件不可达或不匹配。');
  console.log('     把 官网部署包.zip 上传到站点根目录后再跑本脚本。');
  console.log('     （包内已含 ' + KEY + '.txt）\n');
  process.exit(1);
}

/* ── 分批提交（每批 500，保守）── */
const BATCH = 500;
const endpoints = ['https://api.indexnow.org/indexnow', 'https://www.bing.com/indexnow', 'https://yandex.com/indexnow'];
const results = [];

for (let i = 0; i < urls.length; i += BATCH) {
  const chunk = urls.slice(i, i + BATCH);
  const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOC, urlList: chunk });
  console.log('\n  [2] 提交第 ' + (Math.floor(i / BATCH) + 1) + ' 批（' + chunk.length + ' 个 URL）');
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body,
        signal: AbortSignal.timeout(40000),
      });
      const t = (await r.text()).slice(0, 120).replace(/\s+/g, ' ');
      const ok = r.status === 200 || r.status === 202;
      console.log('      ' + (ok ? '✅' : '⚠') + ' ' + ep.padEnd(40) + 'HTTP ' + r.status + (t ? '  ' + t : ''));
      results.push({ endpoint: ep, status: r.status, ok, urls: chunk.length });
    } catch (e) {
      console.log('      ❌ ' + ep.padEnd(40) + (e.cause?.code || e.name));
      results.push({ endpoint: ep, status: 0, ok: false, error: e.cause?.code || e.name, urls: chunk.length });
    }
    await new Promise((s) => setTimeout(s, 1200));
  }
  if (i + BATCH < urls.length) await new Promise((s) => setTimeout(s, 2500));
}

/* ── 结果落盘 ── */
const out = {
  generated: new Date().toISOString(),
  host: HOST, key: KEY, keyLocation: KEY_LOC, keyVerified: keyOk,
  totalUrls: urls.length,
  accepted: results.filter((r) => r.ok).reduce((a, b) => Math.max(a, b.urls), 0),
  results,
  urls,
};
writeFileSync(join(ROOT, 'distribution', 'indexnow-result.json'), JSON.stringify(out, null, 2), 'utf8');

console.log('\n  ── 汇总 ──');
console.log('    提交 URL   ' + urls.length);
console.log('    接受端点   ' + results.filter((r) => r.ok).length + '/' + results.length);
console.log('    生效范围   Bing（→ ChatGPT 联网 / Copilot）· Yandex（→ YandexGPT / GigaChat）');
console.log('    索引文件   distribution/indexnow-result.json');
console.log('\n    参考：200/202 已接受 · 403 密钥无效 · 422 URL 不属于该 host · 429 提交过快');
console.log('    Bing 通常几分钟到几小时抓取；Yandex 数小时到数天。\n');
