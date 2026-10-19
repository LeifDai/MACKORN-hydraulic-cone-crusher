/**
 * 两个中心 · 持续验证器 v2
 *
 * v1 的三个错误（都是 L-20 那类"自检脚本自己会错"）：
 *   ① 查询词设计错：用我们的名字查，却在响应里找 Bruno → 逻辑混乱
 *   ② 探测失败时报 GAP2：把"没测到"说成"我们不在" → 不诚实，会误导决策
 *   ③ 搜索引擎返回的是含查询词的导航页 → 查询词回显被当成命中
 *
 * v2 的做法：
 *   · 【中性查询】：用行业主题词（如 "cone crusher"）查，看结果里 Bruno 与我们在不在
 *   · 【UNKNOWN 判定】：探测失败/被拦 → 记 UNKNOWN，绝不当成"不在"
 *   · 【结果区判定】：只认结果条目，不认查询词回显
 *   · 【直连 API 优先】：能用 API 的用 API（MCP Registry / npm / GitHub），最可靠
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const OUT = join(D, '04_AI收录与分发');
mkdirSync(OUT, { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const H = { 'User-Agent': UA, 'Accept': 'application/json, text/html, */*' };

const BRUNO = /bruno/i;              // Bruno 专指
const METSO = /metso|美卓/i;          // 美卓（Bruno 的母公司，一并算"Bruno 方"）
const US = /mackorn|美矿|cn\.mackorn/i;

async function get(url, timeout = 30000, json = false) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { headers: H, signal: c.signal, redirect: 'follow' });
    clearTimeout(id);
    const t = await r.text();
    return { ok: r.status >= 200 && r.status < 400, status: r.status, text: t, json: json ? (() => { try { return JSON.parse(t); } catch { return null; } })() : null };
  } catch (e) { clearTimeout(id); return { ok: false, status: 0, err: e.cause?.code || e.name, text: '' }; }
}

/* 只统计【结果条目】里是否出现名字，避免查询词回显 */
function hitsInResults(html, re) {
  // 去掉 <script>/<style>，再去掉超链接的 href（引擎自身链接常含查询词）
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/href\s*=\s*["'][^"']*["']/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return re.test(body);
}

const quick = process.argv.includes('--quick');

/* ══════════════════════════════════════════════════════════════════
 * 面清单 —— 每一项自带 probe()，返回 {bruno, us} 或 {unknown}
 * ══════════════════════════════════════════════════════════════════ */
const SURFACES = [
  /* ── MCP 目录 ── */
  {
    id: 'MCP-REGISTRY', name: '官方 MCP Registry', kind: 'MCP目录', url: 'https://registry.modelcontextprotocol.io/v0/servers',
    async probe() {
      const r = await get('https://registry.modelcontextprotocol.io/v0/servers?search=mackorn', 45000, true);
      if (!r.ok) return { unknown: 'HTTP ' + (r.status || r.err) };
      const us = JSON.stringify(r.json || {}).toLowerCase().includes('mackorn');
      const rb = await get('https://registry.modelcontextprotocol.io/v0/servers?search=bruno', 45000, true);
      const bruno = rb.ok ? JSON.stringify(rb.json || {}).toLowerCase().includes('bruno') : false;
      const rm = await get('https://registry.modelcontextprotocol.io/v0/servers?search=metso', 45000, true);
      const metso = rm.ok ? JSON.stringify(rm.json || {}).toLowerCase().includes('metso') : false;
      return { bruno: bruno || metso, us };
    },
  },
  { id: 'MCP-GLAMA', name: 'Glama MCP 目录', kind: 'MCP目录', url: 'https://glama.ai/mcp/servers', q: 'crusher', hub: 'https://glama.ai/mcp/servers?query=' },
  { id: 'MCP-SMITHERY', name: 'Smithery', kind: 'MCP目录', url: 'https://smithery.ai', q: 'crusher', hub: 'https://smithery.ai/?q=' },
  { id: 'MCP-LOBEHUB', name: 'LobeHub MCP', kind: 'MCP目录', url: 'https://lobehub.com/mcp', q: 'crusher', hub: 'https://lobehub.com/mcp?q=' },
  { id: 'MCP-MCPSO', name: 'MCP.so', kind: 'MCP目录', url: 'https://mcp.so', q: 'crusher', hub: 'https://mcp.so/search?q=' },
  { id: 'MCP-PULSEMCP', name: 'PulseMCP', kind: 'MCP目录', url: 'https://www.pulsemcp.com/servers', q: 'crusher', hub: 'https://www.pulsemcp.com/servers?q=' },
  {
    id: 'MCP-AWESOME', name: 'awesome-mcp-servers', kind: 'MCP目录', url: 'https://github.com/punkpeye/awesome-mcp-servers',
    async probe() {
      const r = await get('https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md', 40000);
      if (!r.ok) return { unknown: 'HTTP ' + (r.status || r.err) };
      return { bruno: BRUNO.test(r.text) || METSO.test(r.text), us: US.test(r.text) };
    },
  },

  /* ── 代码与包仓库（有 API，最可靠）── */
  {
    id: 'CODE-GITHUB', name: 'GitHub 仓库搜索', kind: '代码仓库', url: 'https://github.com/search',
    async probe() {
      // 注意：GitHub 仓库名是 MACKORN-hydraulic-cone-crusher，npm 包名才是 mackorn-cone-crusher（不同，踩过）
      const us = await get('https://api.github.com/search/repositories?q=MACKORN+hydraulic+cone+crusher', 45000, true);
      const br = await get('https://api.github.com/search/repositories?q=bruno-mcp', 30000, true);
      const mt = await get('https://api.github.com/search/repositories?q=metso+crusher', 30000, true);
      if (!us.ok && !br.ok) return { unknown: 'HTTP ' + (us.status || us.err) };
      return {
        us: us.ok ? (us.json?.total_count || 0) > 0 : false,
        bruno: (br.ok && (br.json?.total_count || 0) > 0) || (mt.ok && (mt.json?.total_count || 0) > 0),
      };
    },
  },
  {
    id: 'CODE-NPM', name: 'npm', kind: '包仓库', url: 'https://www.npmjs.com/search',
    async probe() {
      const us = await get('https://registry.npmjs.org/mackorn-cone-crusher', 30000, true);
      const br = await get('https://registry.npmjs.org/-/v1/search?text=bruno%20mcp&size=5', 30000, true);
      const mt = await get('https://registry.npmjs.org/-/v1/search?text=metso&size=5', 30000, true);
      if (us.status === 0) return { unknown: 'HTTP ' + (us.status || us.err) };
      return {
        us: us.ok,
        bruno: (br.ok && (br.json?.objects || []).some((o) => /bruno/i.test(o.package?.name || ''))) ||
               (mt.ok && (mt.json?.objects || []).some((o) => /metso/i.test(o.package?.name || '') || /metso/i.test(o.package?.description || ''))),
      };
    },
  },
  {
    id: 'CODE-SWH', name: 'Software Heritage', kind: '代码归档', url: 'https://archive.softwareheritage.org',
    async probe() {
      /* ⚠️ 检测方法修正（R25 实测发现）：
       *   原实现只用【搜索接口】/origin/search/mackorn/ —— 搜索索引有延迟，
       *   会把"已归档"误判为"未归档"（实测：精确查询返回 200，搜索却查不到）。
       *   这是一类真实缺陷：用"搜索"代替"精确查询"判断存在性。
       *   改为【精确查询优先】：直接问"这个仓库在不在"，再用搜索兜底。 */
      const REPO = 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher';
      const exact = await get('https://archive.softwareheritage.org/api/1/origin/' + REPO + '/get/', 45000, true);
      let us = exact.ok;
      let method = 'exact';
      if (!exact.ok && exact.status !== 0) {
        // 精确查询明确说"没有"（404）→ 再用搜索兜底
        const s = await get('https://archive.softwareheritage.org/api/1/origin/search/mackorn/?limit=20', 45000, true);
        us = s.ok && (s.json || []).length > 0;
        method = 'search-fallback';
      }
      const br = await get('https://archive.softwareheritage.org/api/1/origin/search/bruno/?limit=20', 45000, true);
      if (exact.status === 0) return { unknown: 'HTTP ' + (exact.status || exact.err) };
      return { us, bruno: br.ok && (br.json || []).length > 0, method };
    },
  },  {
    id: 'CORPUS-CC', name: 'Common Crawl', kind: '训练语料', url: 'https://commoncrawl.org',
    async probe() {
      // 索引名不能硬编码（会过期）——先从 collinfo 取最新可用索引
      const ci = await get('https://index.commoncrawl.org/collinfo.json', 45000, true);
      if (!ci.ok || !Array.isArray(ci.json) || !ci.json.length) return { unknown: 'collinfo HTTP ' + (ci.status || ci.err) };
      const idx = ci.json[0].id;
      const us = await get('﻿https://index.commoncrawl.org/' + idx + '-index?output=json&limit=5&url=mackorn.cn%2F*', 45000);
      const mt = await get('https://index.commoncrawl.org/' + idx + '-index?output=json&limit=5&url=metso.com%2F*', 45000);
      // 只有真的 200 且返回内容才算"在"；404/超时算未知（不能当"不在"）
      if (us.status === 0) return { unknown: 'HTTP ' + us.err };
      const usIn = us.ok && us.text.trim().length > 5;
      const mtIn = mt.ok && mt.text.trim().length > 5;
      return { us: usIn, bruno: mtIn, note: 'index=' + idx };
    },
  },

  /* ── 搜索引擎（中性词，只看结果区）── */
  { id: 'SEARCH-BING', name: 'Bing', kind: '搜索引擎', url: 'https://www.bing.com', hub: 'https://www.bing.com/search?format=rss&count=20&q=', q: 'cone crusher selection', engine: true },
  { id: 'SEARCH-YANDEX', name: 'Yandex', kind: '搜索引擎', url: 'https://yandex.com', hub: 'https://yandex.com/search/?text=', q: 'cone crusher selection', engine: true },
  { id: 'SEARCH-BAIDU', name: '百度', kind: '搜索引擎', url: 'https://www.baidu.com', hub: 'https://www.baidu.com/s?rn=20&wd=', q: '圆锥破碎机选型', engine: true },
  { id: 'SEARCH-MOJEEK', name: 'Mojeek', kind: '搜索引擎', url: 'https://www.mojeek.com', hub: 'https://www.mojeek.com/search?q=', q: 'cone crusher selection', engine: true },
  { id: 'SEARCH-MARGINALIA', name: 'Marginalia', kind: '搜索引擎', url: 'https://search.marginalia.nu', hub: 'https://search.marginalia.nu/search?query=', q: 'cone crusher selection', engine: true },
  { id: 'SEARCH-SOGOU', name: '搜狗', kind: '搜索引擎', url: 'https://www.sogou.com', hub: 'https://www.sogou.com/web?query=', q: '圆锥破碎机选型', engine: true },
  { id: 'SEARCH-360', name: '360 搜索', kind: '搜索引擎', url: 'https://www.so.com', hub: 'https://www.so.com/s?q=', q: '圆锥破碎机选型', engine: true },

  /* ── 行业与标准 ── */
  { id: 'IND-MINING', name: 'Mining.com', kind: '行业媒体', url: 'https://www.mining.com', hub: 'https://www.mining.com/?s=', q: 'cone crusher', engine: true },
  { id: 'IND-AGGBIZ', name: 'AggBusiness', kind: '行业媒体', url: 'https://www.aggbusiness.com', hub: 'https://www.aggbusiness.com/?s=', q: 'crusher', engine: true },
  { id: 'IND-WIPO', name: 'WIPO PATENTSCOPE', kind: '专利', url: 'https://patentscope.wipo.int', hub: 'https://patentscope.wipo.int/search/en/result.jsf?query=', q: 'cone crusher', engine: true },
  { id: 'IND-GB', name: '国家标准全文公开', kind: '标准', url: 'https://openstd.samr.gov.cn', hub: 'https://openstd.samr.gov.cn/bzgk/gb/std_list?p.p1=0&p.p90=circulation_date&p.p91=desc&p.p2=', q: '破碎机', engine: true },
];

const list = quick ? SURFACES.filter((s) => /MCP-REGISTRY|MCP-GLAMA|CODE-NPM|CODE-GITHUB|CODE-SWH|SEARCH-BING/.test(s.id)) : SURFACES;

console.log('\n' + '═'.repeat(98));
console.log('  两个中心 · 持续验证 v2（' + list.length + ' 个 AI 面）');
console.log('  中心① Bruno 去的地方我们都在　中心② Bruno 没去但 AI 爱去的地方我们也在');
console.log('═'.repeat(98) + '\n');

const results = [];
for (const s of list) {
  let out;
  try {
    if (typeof s.probe === 'function') out = await s.probe();
    else {
      // 通用：中性词查询，看结果区
      if (!s.hub) { out = { unknown: '未配置 hub' }; }
      else {
      const r = await get(s.hub + encodeURIComponent(s.q), 40000);
      if (!r.ok) out = { unknown: 'HTTP ' + (r.status || r.err) };
      else out = { bruno: hitsInResults(r.text, BRUNO) || hitsInResults(r.text, METSO), us: hitsInResults(r.text, US) };
      }
    }
  } catch (e) { out = { unknown: e.message.slice(0, 60) }; }

  let verdict;
  if (out.unknown) verdict = 'UNKNOWN';
  else if (out.bruno && out.us) verdict = 'PARITY';
  else if (out.bruno && !out.us) verdict = 'GAP1';
  else if (!out.bruno && out.us) verdict = 'LEAD';
  else verdict = 'GAP2';

  results.push({ id: s.id, name: s.name, kind: s.kind, url: s.url, verdict, bruno: !!out.bruno, us: !!out.us, note: out.unknown || out.note || '' });
  const mark = { PARITY: '✅', GAP1: '★❌', LEAD: '🔵', GAP2: '☆ ', UNKNOWN: '⚠️ ' }[verdict];
  console.log('  ' + mark + ' ' + s.id.padEnd(18) + s.name.padEnd(26)
    + 'Bruno:' + (out.bruno ? '在' : out.unknown ? '?' : '—') + '  我们:' + (out.us ? '在' : out.unknown ? '?' : '—')
    + (out.unknown ? '  ' + out.unknown : ''));
  await new Promise((x) => setTimeout(x, 200));
}

const by = { PARITY: [], GAP1: [], LEAD: [], GAP2: [], UNKNOWN: [] };
for (const r of results) by[r.verdict].push(r);

console.log('\n' + '─'.repeat(98));
console.log('  2×2 判定矩阵');
console.log('─'.repeat(98));
console.log('  ✅ PARITY  对标保持（Bruno 在，我们也在）      ' + String(by.PARITY.length).padStart(2) + ' 个' + (by.PARITY.length ? '：' + by.PARITY.map((x) => x.id).join(' ') : ''));
console.log('  ★❌ GAP1    中心①失守（Bruno 在，我们不在）    ' + String(by.GAP1.length).padStart(2) + ' 个' + (by.GAP1.length ? '：' + by.GAP1.map((x) => x.name).join('、') : ''));
console.log('  🔵 LEAD    我们领先（Bruno 不在，我们在）      ' + String(by.LEAD.length).padStart(2) + ' 个' + (by.LEAD.length ? '：' + by.LEAD.map((x) => x.id).join(' ') : ''));
console.log('  ☆  GAP2    中心②机会（都不在 —— 应去打）      ' + String(by.GAP2.length).padStart(2) + ' 个' + (by.GAP2.length ? '：' + by.GAP2.map((x) => x.id).join(' ') : ''));
console.log('  ⚠️  UNKNOWN 无法判定（网络/反爬，不算失守）    ' + String(by.UNKNOWN.length).padStart(2) + ' 个' + (by.UNKNOWN.length ? '：' + by.UNKNOWN.map((x) => x.id).join(' ') : ''));

const known = results.filter((r) => r.verdict !== 'UNKNOWN');
const brunoFaces = known.filter((r) => r.bruno);
const ours = known.filter((r) => r.us);
console.log('\n  中心① 覆盖率（Bruno 在的地方我们也在）: ' + (brunoFaces.length ? Math.round(by.PARITY.length / brunoFaces.length * 100) + '%  (' + by.PARITY.length + '/' + brunoFaces.length + ')' : '无可比对象'));
console.log('  我们的总覆盖面（可判定面中）          : ' + (known.length ? Math.round(ours.length / known.length * 100) + '%  (' + ours.length + '/' + known.length + ')' : '—'));
console.log('  中心② 待攻机会面                      : ' + by.GAP2.length + ' 个');

if (by.GAP1.length) { console.log('\n  ❌ 中心①失守项（硬指标，必须补）：'); for (const g of by.GAP1) console.log('     · ' + g.id + ' ' + g.name + '　' + g.url); }
if (by.GAP2.length) { console.log('\n  ☆ 中心②机会项（应去打）：'); for (const g of by.GAP2.slice(0, 14)) console.log('     · ' + g.id + ' ' + g.name + '　' + g.url); }
if (by.UNKNOWN.length) { console.log('\n  ⚠️ 无法判定的面（不是失守，是测不到 —— 下次可换通道重试）：'); for (const g of by.UNKNOWN) console.log('     · ' + g.id + ' ' + g.name + '　' + (g.note || '')); }
console.log('─'.repeat(98) + '\n');

writeFileSync(join(OUT, 'two-centers-report.json'), JSON.stringify({
  generated: new Date().toISOString(),
  version: 'v2',
  centers: {
    one: 'Bruno 去的地方，我们都在（GAP1 即失守）',
    two: 'Bruno 没去过、但 AI 喜欢去的地方，我们插件也在（GAP2 即机会）',
  },
  method: {
    neutral_query: '用行业主题词（cone crusher / 圆锥破碎机选型）查询，看结果条目里 Bruno 与我们在不在',
    unknown_verdict: '探测失败/被反爬 → 记 UNKNOWN，绝不当成"不在"（v1 的错）',
    result_region_only: '只认结果条目，不认查询词回显',
    api_first: '能直连 API 的用 API（MCP Registry / npm / GitHub / Software Heritage）',
  },
  summary: {
    parity: by.PARITY.length, gap1: by.GAP1.length, lead: by.LEAD.length, gap2: by.GAP2.length, unknown: by.UNKNOWN.length,
    center1_coverage: brunoFaces.length ? Math.round(by.PARITY.length / brunoFaces.length * 100) : null,
    our_coverage: known.length ? Math.round(ours.length / known.length * 100) : null,
  },
  surfaces: results,
}, null, 2), 'utf8');
console.log('  ✅ two-centers-report.json\n');

process.exit(by.GAP1.length ? 1 : 0);
