/**
 * 抓取并解析 Chalmers 圆锥破研究 PDF（找实测筛析数据）
 *
 * 来源：
 *   Cone Crusher Performance (2015)          publications.lib.chalmers.se/records/fulltext/759/759.pdf
 *   Modelling and Simulation of Dynamic Behaviour in Crushing Plants (2013)
 *                                            publications.lib.chalmers.se/records/fulltext/170211/170211.pdf
 * 均为公开可访问的学术出版页（Chalmers 机构库）
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'D:/DSH desktop/DSH destop工作区/MACKORN-DSH-Plugin/distribution/03_验证与基准/实测数据/chalmers-cone-crusher';
mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (compatible; MACKORN-Research/1.0; +https://mackorn.cn/ai/)';

async function get(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(90000) });
    const buf = Buffer.from(await r.arrayBuffer());
    return { s: r.status, ct: r.headers.get('content-type') || '', len: buf.length, buf, url: r.url };
  } catch (e) { return { s: 0, e: e.cause?.code || e.name, len: 0 }; }
}

const PDFS = [
  ['chalmers-759.pdf', 'http://publications.lib.chalmers.se/records/fulltext/759/759.pdf'],
  ['chalmers-170211.pdf', 'http://publications.lib.chalmers.se/records/fulltext/170211/170211.pdf'],
];

const KEYWORDS = ['sieve', 'cumulative', 'passing', 'P80', 'closed side', 'throughput', 'capacity', 't/h', 'calibrat', 'validat'];

for (const [fn, url] of PDFS) {
  const r = await get(url);
  console.log('  ' + fn.padEnd(24) + ' HTTP ' + r.s + '  ' + String(r.ct || '').slice(0, 28) + '  ' + (r.len ? Math.round(r.len / 1024) + ' KB' : ''));
  if (r.s === 200 && r.buf && r.buf.slice(0, 4).toString() === '%PDF') {
    writeFileSync(OUT + '/' + fn, r.buf);
    const raw = r.buf.toString('latin1');
    const tj = [...raw.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)].map((m) => m[1]).join(' ');
    const TJ = [...raw.matchAll(/\[((?:[^[\]]|\\.)*)\]\s*TJ/g)]
      .map((m) => [...m[1].matchAll(/\(((?:\\.|[^\\()])*)\)/g)].map((x) => x[1]).join('')).join(' ');
    const txt = (tj + ' ' + TJ).replace(/\\(\d{3})/g, '').replace(/\s+/g, ' ');
    console.log('       已保存 ' + Math.round(r.buf.length / 1024) + ' KB · 抽取文本 ' + txt.length + ' 字符');
    const hits = KEYWORDS.filter((k) => new RegExp(k, 'i').test(txt));
    console.log('       命中关键词: ' + (hits.join(', ') || '无'));
    const nums = [...txt.matchAll(/[\d.]+\s*(?:mm|%)/g)].length;
    console.log('       含「数值+mm/%」片段: ' + nums);
    if (txt.length > 300) console.log('       片段: ' + txt.slice(200, 560));
  } else if (r.s === 0) {
    console.log('       ❌ 网络不可达: ' + r.e);
  } else {
    console.log('       ⚠ 非 PDF（' + String(r.ct).slice(0, 40) + '）');
  }
  console.log('');
  await new Promise((s) => setTimeout(s, 600));
}
