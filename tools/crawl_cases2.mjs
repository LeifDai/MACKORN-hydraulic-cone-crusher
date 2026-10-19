/**
 * 抓取公开的竞品选型案例页并入库
 * 只提取公开事实（品牌/物料/产量/机型/地点/年份），不提取任何算法或系数。
 */
import { addCase, addOnlineTool, loadCases, saveCases, caseStats } from './case-library.mjs';

const UA = 'Mozilla/5.0 (compatible; MACKORN-CaseResearch/1.0; +https://mackorn.cn/ai/)';
async function get(url, timeout = 40000) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' }, signal: c.signal, redirect: 'follow' });
    clearTimeout(id);
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || '';
    return { ok: r.ok, status: r.status, buf, isText: /text|json|xml/.test(ct), text: /text|json|xml/.test(ct) ? buf.toString('utf8') : '', url: r.url };
  } catch (e) { clearTimeout(id); return { ok: false, status: 0, err: e.cause?.code || e.name, text: '', isText: false }; }
}
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const TARGETS = [
  { url: 'https://www.metso.cn/insights/case-studies/aggregates/high-quality-and-efficient-production-of-hp6-in-liujiadawu-mine/', brand: 'Metso', kind: 'case' },
  { url: 'https://www.agg-net.com/news/metso-cone-crusher-increases-capacity-at-wisconsin-quarry', brand: 'Metso', kind: 'case' },
  { url: 'https://www.at-minerals.com/en/artikel/at_High_performing_cone_crusher_revolutionizes_production_in_the_UAE-2576883.html', brand: '', kind: 'case' },
  { url: 'https://www.metso.com/es/informacion-corporativa/medios-de-comunicacion/noticias/2019/7/metso-otorga-licencias-de-software-de-simulacion-para-plantas-de-chancado-a-la-universidad-nacional-de-ingenieria/', brand: 'Metso', kind: 'tool' },
  { url: 'https://www.rocktechnology.sandvik/globalassets/products/stationary-crushers-and-screens/pdf/rock-processing-guide-standard-edition-english.pdf', brand: 'Sandvik', kind: 'spec' },
];

console.log('\n' + '═'.repeat(98));
console.log('  抓取公开竞品案例/样本页');
console.log('═'.repeat(98) + '\n');

const lib = loadCases();
let added = 0;
for (const t of TARGETS) {
  const r = await get(t.url);
  if (!r.ok) { console.log('  ○ ' + t.brand.padEnd(9) + t.url.slice(0, 60) + '  UNKNOWN（HTTP ' + (r.status || r.err) + '）'); (lib.crawl_log ||= []).push({ at: new Date().toISOString(), step: 'case-page', url: t.url, result: 'unknown', status: r.status || r.err }); continue; }

  let txt = '';
  if (r.isText) txt = strip(r.text);
  else {
    // PDF：用朴素的文本抽取（BT/ET 之间的 Tj/TJ 字符串）
    const raw = r.buf.toString('latin1');
    const parts = [...raw.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1'));
    txt = parts.join(' ').replace(/\s+/g, ' ').slice(0, 400000);
  }
  console.log('  ✅ ' + t.brand.padEnd(9) + t.url.slice(0, 58) + '  ' + Math.round((r.buf ? r.buf.length : r.text.length) / 1024) + 'KB  文本 ' + txt.length + ' 字符');

  // 提取公开事实
  const pick = (re) => { const m = txt.match(re); return m ? m[0] : null; };
  const tph = [...txt.matchAll(/(\d{2,4})\s*(?:t\/h|tph|tonnes? per hour|吨\/小时|吨\/时|MTPH|mtph)/gi)].map((m) => Number(m[1])).filter((x) => x >= 10 && x <= 20000);
  const model = pick(/\b(HP\d{1,4}|CH\d{2,4}|CS\d{2,4}|HST\d{2,4}|GP\d{1,3}|MP\d{3,4}|C\d{2,3}|S\d{2,3})\b/i);
  const css = [...txt.matchAll(/(?:CSS|closed side setting|紧边排矿口)[^.\d]{0,30}?(\d{1,3})\s*mm/gi)].map((m) => Number(m[1]));
  const year = pick(/\b(19|20)\d{2}\b/);

  const rec = {
    brand: t.brand || (/sandvik/i.test(txt) ? 'Sandvik' : /metso/i.test(txt) ? 'Metso' : '未标注'),
    source_url: r.url || t.url,
    source_type: r.isText ? '厂商官网公开页' : '厂商公开PDF样本',
    project: (strip(r.text || '').match(/<title>([^<]+)<\/title>/i) || [, ''])[1] || t.url.split('/').filter(Boolean).pop(),
    material: /granite|花岗岩/i.test(txt) ? '花岗岩' : /basalt|玄武岩/i.test(txt) ? '玄武岩' : /limestone|石灰石/i.test(txt) ? '石灰石' : /andesite|安山岩/i.test(txt) ? '安山岩' : null,
    country: /China|中国|湖北|Hubei/i.test(txt) ? '中国' : /Wisconsin|USA|United States/i.test(txt) ? '美国' : /UAE|Emirates|阿拉伯/i.test(txt) ? '阿联酋' : /Peru|Perú/i.test(txt) ? '秘鲁' : null,
    stage: /secondary|中碎|second stage/i.test(txt) ? '中碎' : /tertiary|细碎|third stage/i.test(txt) ? '细碎' : null,
    model: model ? model.toUpperCase() : null,
    css_mm: css.length ? css[0] : null,
    tph: tph.length ? Math.max(...tph) : null,
    process_note: t.kind === 'tool'
      ? '厂商向高校授予仿真软件许可（公开新闻）—— 说明仿真选型是被行业认可的做法'
      : (txt.slice(0, 240) || null),
    evidence_quote: txt.slice(0, 300),
    confidence: null,
    notes: '公开页面自动提取；具体型号/产量建议人工复核页面原文后再用于对标',
  };
  const res = addCase(rec);
  if (res.ok) { added += 1; console.log('        → ' + res.case.id + '  机型 ' + (rec.model || '—') + '  产量 ' + (rec.tph || '—') + ' t/h  物料 ' + (rec.material || '—') + '  地点 ' + (rec.country || '—')); }
  else console.log('        → 跳过: ' + res.error);
  (lib.crawl_log ||= []).push({ at: new Date().toISOString(), step: 'case-page', url: r.url || t.url, result: 'ok', added: res.ok, model: rec.model, tph: rec.tph });
}
// 修正：不要在末尾用启动时的旧 lib 覆盖新增记录 —— 改为只追加日志
{ const fresh = loadCases(); fresh.crawl_log = lib.crawl_log || []; saveCases(fresh); }

const s = caseStats();
console.log('\n' + '═'.repeat(98));
console.log('  案例库现状: ' + s.total + ' 条（本次新增 ' + added + '）· 带出处 ' + s.with_url + '/' + s.total);
console.log('  按品牌: ' + JSON.stringify(s.by_brand));
console.log('  按物料: ' + JSON.stringify(s.by_material));
console.log('  置信度: ' + JSON.stringify(s.by_confidence));
console.log('');
