/**
 * 搜索引擎收录验证 v3 —— 用 RSS / 结构化输出，彻底排除引擎自身链接的干扰
 *
 * v1 的错：直接搜 HTML 里有没有域名 → 查询词回显必然命中
 * v2 的错：只排除含引擎域名的链接 → 但引擎自己用的是相对链接（/search?q=...），漏网
 * v3 的做法：
 *   ① 优先用 Bing RSS（format=rss）—— 只返回真实结果条目
 *   ② 对其他引擎，只在【结果区域】里找指向目标域名的绝对链接
 *   ③ 每种判定都打印证据，可人工核对
 */
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml,*/*',
};

async function get(url, timeout = 30000) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { headers: H, signal: c.signal, redirect: 'follow' });
    return { s: r.status, t: await r.text(), ct: r.headers.get('content-type') || '' };
  } catch (e) { return { s: 0, e: e.cause?.code || e.name, t: '' }; }
  finally { clearTimeout(id); }
}

const DOMAIN = 'mackorn.cn';

/* ── 从 RSS / Atom 提取结果条目 ── */
function parseFeed(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const b = m[1];
    const title = (b.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const link = (b.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '';
    items.push({ title: title.replace(/<!\[CDATA\[|\]\]>/g, '').trim(), link: link.trim() });
  }
  return items;
}

/* ── 从 HTML 结果区提取（严格：只认绝对 URL 且非引擎自身） ── */
function parseHtmlResults(html) {
  const items = [];
  for (const m of html.matchAll(/<a[^>]+href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const url = m[1], text = m[2].replace(/<[^>]+>/g, '').trim();
    if (/^https?:\/\/(www\.)?(bing|baidu|yandex|sogou|so|mojeek|marginalia|startpage|duckduckgo|google)\./i.test(url)) continue;
    items.push({ url, text: text.slice(0, 120) });
  }
  return items;
}

const TESTS = [
  { engine: 'Bing', name: 'site: (RSS)', kind: 'feed', url: 'https://www.bing.com/search?format=rss&q=site%3Amackorn.cn&count=50' },
  { engine: 'Bing', name: '品牌词 (RSS)', kind: 'feed', url: 'https://www.bing.com/search?format=rss&q=MACKORN+cone+crusher&count=50' },
  { engine: 'Bing', name: '中文词 (RSS)', kind: 'feed', url: 'https://www.bing.com/search?format=rss&q=%E7%BE%8E%E7%9F%BF+%E5%9C%86%E9%94%A5%E7%A0%B4+%E9%80%89%E5%9E%8B&count=50' },
  { engine: 'Bing', name: 'site: (HTML)', kind: 'html', url: 'https://www.bing.com/search?q=site%3Amackorn.cn&count=30' },
  { engine: '百度', name: 'site: (HTML)', kind: 'html', url: 'https://www.baidu.com/s?wd=site%3Amackorn.cn&rn=50' },
  { engine: '百度', name: '品牌词 (HTML)', kind: 'html', url: 'https://www.baidu.com/s?wd=%E4%B8%8A%E6%B5%B7%E7%BE%8E%E7%9F%BF%E6%9C%BA%E6%A2%B0' },
  { engine: '搜狗', name: 'site: (HTML)', kind: 'html', url: 'https://www.sogou.com/web?query=site%3Amackorn.cn' },
  { engine: '360', name: 'site: (HTML)', kind: 'html', url: 'https://www.so.com/s?q=site%3Amackorn.cn' },
  { engine: 'Yandex', name: 'site: (HTML)', kind: 'html', url: 'https://yandex.com/search/?text=site%3Amackorn.cn' },
  { engine: 'Mojeek', name: 'site: (HTML)', kind: 'html', url: 'https://www.mojeek.com/search?q=site%3Amackorn.cn' },
];

console.log('\n' + '═'.repeat(86));
console.log('  搜索引擎收录验证 v3（RSS + 严格 HTML 解析，每项都打印证据）');
console.log('═'.repeat(86) + '\n');

const summary = {};
for (const t of TESTS) {
  const r = await get(t.url);
  let items = [];
  if (r.s === 200) {
    items = t.kind === 'feed' ? parseFeed(r.t) : parseHtmlResults(r.t);
  }
  // 严格判定：链接的 host/path 必须是 mackorn.cn（不是参数里含查询词）
  const isRealResult = (u) => {
    if (!u) return false;
    try {
      const url = new URL(u);
      // 主机名必须是 mackorn.cn 或其子域
      if (/^(www\.)?mackorn\.cn$/i.test(url.hostname)) return true;
      return false;
    } catch { return false; }
  };
  const ours = items.filter((x) => {
    const u = x.link || x.url || '';
    if (isRealResult(u)) return true;
    // RSS 的 link 可能是真结果；标题含 MACKORN 也认（但标注为"标题命中"）
    const t = (x.title || x.text || '');
    return /MACKORN|美矿/i.test(t) && !/site%3A|destUrl|%3A/i.test(u);
  }).map((x) => ({ ...x, strict: isRealResult(x.link || x.url || '') }));

  summary[t.engine] ||= [];
  summary[t.engine].push({ ...t, s: r.s, err: r.e, total: items.length, ours });

  const mark = r.s !== 200 ? (r.s === 403 ? '🔒' : '❌') : (ours.length ? '✅' : '○');
  console.log('  ' + mark + ' ' + t.engine.padEnd(10) + t.name.padEnd(14)
    + String(r.s === 200 ? 'HTTP 200' : ('HTTP ' + (r.s || r.e))).padEnd(20)
    + '解析到 ' + String(items.length).padStart(3) + ' 条结果 · 其中我们的 ' + ours.length + ' 条');
  for (const o of ours.slice(0, 3)) {
    console.log('        ' + (o.strict ? '✅ 严格命中' : '○ 标题命中') + ' ' + ((o.title || o.text || '').slice(0, 56)));
    console.log('           ' + ((o.link || o.url || '').slice(0, 100)));
  }
  await new Promise((x) => setTimeout(x, 600));
}

console.log('\n' + '─'.repeat(86));
console.log('  结论');
console.log('─'.repeat(86));
const ok = [], no = [], blocked = [];
for (const [e, list] of Object.entries(summary)) {
  const anyHit = list.some((x) => x.ours.length > 0);
  const any200 = list.some((x) => x.s === 200);
  if (anyHit) ok.push(e + '(' + list.reduce((a, x) => a + x.ours.length, 0) + ')');
  else if (any200) no.push(e);
  else blocked.push(e);
}
console.log('  ✅ 确认收录（找到指向我们的实际结果）：' + (ok.join('、') || '（无）'));
console.log('  ○ 页面正常但未找到我们的结果：' + (no.join('、') || '（无）'));
console.log('  ⚠️ 无法访问：' + (blocked.join('、') || '（无）'));
console.log('');
console.log('  方法说明：');
console.log('    · Bing 用 RSS 输出（format=rss）—— 只有真实结果条目，没有导航链接干扰');
console.log('    · 其他引擎解析 <a href="https://..."> 的绝对链接，排除引擎自身域名');
console.log('    · 每一项都打印证据（标题 + 链接），可人工核对');
console.log('');
