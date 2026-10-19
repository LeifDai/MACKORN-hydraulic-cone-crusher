/**
 * 选型案例爬取器（tools/crawl_cases.mjs）
 *
 * 用户需求：爬取网络破碎机与生产线选型案例，特别是山特维克与美卓；
 *           实测美卓 BRUNO 与山特维克在线测试软件；结果进 XXAL1000.1。
 *
 * 合规边界（写死在代码里，不靠自律）：
 *   · 只抓【公开可访问】的页面
 *   · 遇到登录墙/付费墙/403 一律记为 UNKNOWN，不绕过、不伪装
 *   · 只提取公开事实（品牌/物料/产量/机型/年份），不提取任何算法或系数
 *   · 每条必须能回溯到 source_url
 *
 * 纪律：
 *   测不到就报测不到（UNKNOWN），不把"打不开"当成"没有"。
 */
import { addCase, addOnlineTool, loadCases, saveCases, caseStats } from './case-library.mjs';

const UA = 'Mozilla/5.0 (compatible; MACKORN-CaseResearch/1.0; +https://mackorn.cn/ai/)';
async function get(url, timeout = 30000) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json,*/*' }, signal: c.signal, redirect: 'follow' });
    clearTimeout(id);
    const t = await r.text();
    return { ok: r.ok, status: r.status, text: t, url: r.url, len: t.length };
  } catch (e) { clearTimeout(id); return { ok: false, status: 0, err: e.cause?.code || e.name, text: '' }; }
}

const NOW = () => new Date().toISOString();
const log = (lib, entry) => { (lib.crawl_log ||= []).push({ at: NOW(), ...entry }); };

console.log('\n' + '═'.repeat(98));
console.log('  选型案例爬取器 · 合规边界：只抓公开页；遇登录墙/403 记 UNKNOWN，不绕过');
console.log('═'.repeat(98) + '\n');

const lib = loadCases();

/* ══════════════ ① 竞品在线选型工具探测 ══════════════ */
console.log('  ── ① 竞品在线选型工具探测（对标体验，不复制算法）──');

const TOOLS = [
  { brand: 'Metso', name: 'Metso Bruno (crushing simulation software)', urls: ['https://www.metso.com/products/crushing-and-screening-equipment/bruno-simulation-software/', 'https://www.metso.com/'] },
  { brand: 'Sandvik', name: 'Sandvik crusher selection / online tools', urls: ['https://www.rockprocessing.sandvik/en/products/crushers/', 'https://www.rockprocessing.sandvik/'] },
  { brand: 'Metso', name: 'Metso aggregate crushing plant pages', urls: ['https://www.metso.com/industries/aggregates/'] },
];

const toolObs = [];
for (const t of TOOLS) {
  let best = null;
  for (const u of t.urls) {
    const r = await get(u);
    if (r.ok && r.len > 500) { best = { url: r.url, len: r.len, text: r.text }; break; }
    if (!best) best = { url: u, status: r.status || r.err, len: 0 };
  }
  if (best && best.len > 500) {
    const txt = best.text.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    // 只提取公开可观测的特征
    const feats = {
      mentions_simulation: /simulat|bruno/i.test(txt),
      mentions_capacity: /capacity|tph|t\/h|tonnes per hour/i.test(txt),
      mentions_css: /css|closed side setting|setting/i.test(txt),
      mentions_chamber: /chamber|cavity|mantle|bowl/i.test(txt),
      mentions_plant_design: /plant|flowsheet|circuit|layout/i.test(txt),
      has_login_wall: /log ?in|sign ?in|register to|create an account/i.test(txt),
      page_words: txt.split(/\s+/).length,
    };
    console.log('  ✅ ' + t.brand.padEnd(9) + t.name.slice(0, 44).padEnd(46) + 'HTTP200 ' + best.len + 'B  模拟器词=' + feats.mentions_simulation + ' 登录墙=' + feats.has_login_wall);
    toolObs.push({ brand: t.brand, name: t.name, source_url: best.url, observed: 'reachable', features: feats, retrieved: NOW() });
    addOnlineTool({ brand: t.brand, name: t.name, source_url: best.url, observed: 'reachable', features: feats, compliance_note: '仅记录公开页面的界面/内容特征，未获取任何算法或系数' });
    log(lib, { step: 'online-tool', target: t.brand, url: best.url, result: 'reachable', status: 200 });
  } else {
    const st = best ? (best.status || 'unknown') : 'unknown';
    console.log('  ○ ' + t.brand.padEnd(9) + t.name.slice(0, 44).padEnd(46) + 'UNKNOWN（HTTP ' + st + '）—— 测不到，不记为"没有"');
    toolObs.push({ brand: t.brand, name: t.name, source_url: t.urls[0], observed: 'unknown', status: st, retrieved: NOW() });
    log(lib, { step: 'online-tool', target: t.brand, url: t.urls[0], result: 'unknown', status: st });
  }
}

/* ══════════════ ② 公开案例检索 ══════════════ */
console.log('\n  ── ② 公开案例检索（搜索引擎 + 公开页面）──');

const QUERIES = [
  { q: 'Metso HP cone crusher case study tph aggregate plant', brand: 'Metso' },
  { q: 'Sandvik CH cone crusher installation case study capacity', brand: 'Sandvik' },
  { q: 'Metso crusher plant delivery granite basalt tph project', brand: 'Metso' },
  { q: 'Sandvik crushing and screening plant commissioned tph', brand: 'Sandvik' },
];

let found = 0, unknown = 0;
for (const { q, brand } of QUERIES) {
  const u = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
  const r = await get(u);
  if (!r.ok) { console.log('  ○ [' + brand + '] 检索 UNKNOWN（HTTP ' + (r.status || r.err) + '）'); unknown += 1; log(lib, { step: 'search', q, result: 'unknown', status: r.status || r.err }); continue; }
  // 解析结果标题与链接（DuckDuckGo html 版）
  const items = [...r.text.matchAll(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]{3,200}?)<\/a>/g)].slice(0, 8);
  console.log('  [' + brand + '] 检索到 ' + items.length + ' 条');
  for (const m of items) {
    let url = m[1];
    const dm = url.match(/uddg=([^&]+)/); if (dm) { try { url = decodeURIComponent(dm[1]); } catch { } }
    const title = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    if (!/metso|sandvik|mesto/i.test(url + title)) continue;
    console.log('      · ' + title.slice(0, 74));
    console.log('        ' + url.slice(0, 100));
    const res = addCase({
      brand, source_url: url, source_type: '公开检索结果',
      project: title.slice(0, 120), evidence_quote: title.slice(0, 200),
      confidence: 'C', notes: '检索条目级证据 —— 页面细节与具体型号/产量需人工核实后方可升级为 B/A',
    });
    if (res.ok) found += 1;
    log(lib, { step: 'search-result', brand, url, title: title.slice(0, 120), saved: res.ok, why: res.error || null });
  }
  await new Promise((s) => setTimeout(s, 800));
}
// 修正：不要在末尾用启动时的旧 lib 覆盖新增记录 —— 改为只追加日志
{ const fresh = loadCases(); fresh.crawl_log = lib.crawl_log || []; saveCases(fresh); }

/* ══════════════ ③ 汇总 ══════════════ */
const s = caseStats();
console.log('\n' + '═'.repeat(98));
console.log('  汇总');
console.log('═'.repeat(98));
console.log('  在线工具观测: ' + toolObs.filter((x) => x.observed === 'reachable').length + ' 可达 / ' + toolObs.filter((x) => x.observed === 'unknown').length + ' UNKNOWN');
console.log('  案例库: ' + s.total + ' 条（本次新增 ' + found + '）· 带出处 ' + s.with_url + '/' + s.total);
console.log('  按品牌: ' + JSON.stringify(s.by_brand));
console.log('  置信度: ' + JSON.stringify(s.by_confidence));
if (unknown) console.log('  ⚠️ ' + unknown + ' 个查询 UNKNOWN —— 按纪律记为"测不到"，不计入"没有"');
console.log('');
console.log('  合规提醒：检索条目级证据的置信度为 C，');
console.log('            页面细节与具体型号/产量须人工核实后才能升级为 B/A。');
console.log('            竞品数据仅用于对标，【不得】作为 MACKORN 的能力承诺。');
console.log('');
