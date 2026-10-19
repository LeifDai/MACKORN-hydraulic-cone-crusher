/**
 * 深挖高增长国家的海关数据（更多 HS 编码）
 *
 * 原来只查了 847420/847410/847490（破碎筛分 + 零件）。
 * 这次补上"整条矿山设备链"的编码，才能看清一个国家的矿业设备采购全貌：
 *
 *   847410  筛分/分选/洗涤机械
 *   847420  破碎/粉磨机械
 *   847490  8474 项下零件（衬板耐磨件）
 *   842833  带式输送机
 *   842952  360°回转挖掘机（矿用挖机）
 *   843049  钻探/凿岩机械
 *   870410  非公路矿用自卸车
 *   847989  其他专用机械
 *
 * 配额友好：7 国 × 8 编码 × 1 年 = 56 次（间隔 2.5s ≈ 2.5 分钟）
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = process.argv[2] || join(ROOT, 'distribution', 'trade-deep.json');

// 高增长国家 + 第一梯队
const COUNTRIES = {
  398: ['Kazakhstan', '哈萨克斯坦'],
  860: ['Uzbekistan', '乌兹别克斯坦'],
  170: ['Colombia', '哥伦比亚'],
  360: ['Indonesia', '印度尼西亚'],
  608: ['Philippines', '菲律宾'],
  710: ['South Africa', '南非'],
  484: ['Mexico', '墨西哥'],
  // 对照：第一梯队成熟市场
  36: ['Australia', '澳大利亚'],
  152: ['Chile', '智利'],
  604: ['Peru', '秘鲁'],
};

const HS = {
  '847410': '筛分/分选/洗涤机械',
  '847420': '破碎/粉磨机械',
  '847490': '零件（衬板耐磨件）',
  '842833': '带式输送机',
  '842952': '360°回转挖掘机',
  '843049': '钻探/凿岩机械',
  '870410': '非公路矿用自卸车',
  '847989': '其他专用机械',
};

const YEARS = ['2023'];
const GAP = 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let result = { generated: new Date().toISOString(), source: 'UN Comtrade public preview API', unit: 'USD (imports, CIF, World total)', byCountry: {} };
if (existsSync(OUT)) { try { const o = JSON.parse(readFileSync(OUT, 'utf8')); if (o.byCountry) result.byCountry = o.byCountry; } catch { } }

async function call(reporter, cmd, period, attempt = 1) {
  const url = `https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=${reporter}&period=${period}&cmdCode=${cmd}&flowCode=M`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120', Accept: 'application/json' } });
    const txt = await r.text();
    if (r.status === 403 && /quota/i.test(txt)) {
      const m = txt.match(/replenished in (\d+):(\d+):(\d+)/);
      return { quota: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 1800 };
    }
    if (!r.ok) return { err: 'HTTP ' + r.status };
    const j = JSON.parse(txt);
    const rows = (j.data || []).filter((d) => d.flowCode === 'M' && d.cmdCode === cmd);
    if (!rows.length) return { err: 'no data' };
    const w = rows.find((d) => String(d.partnerCode) === '0') || rows.slice().sort((a, b) => (b.primaryValue || 0) - (a.primaryValue || 0))[0];
    return { usd: w.primaryValue, netWgt: w.netWgt };
  } catch (e) {
    if (attempt <= 3) { await sleep(2000 * attempt); return call(reporter, cmd, period, attempt + 1); }
    return { err: e.cause?.code || e.message };
  }
}

const total = Object.keys(COUNTRIES).length * Object.keys(HS).length * YEARS.length;
console.log('  计划查询 ' + total + ' 次（间隔 ' + (GAP / 1000) + 's）');

let n = 0;
outer:
for (const [codeStr, [name, zh]] of Object.entries(COUNTRIES)) {
  const code = Number(codeStr);
  result.byCountry[name] ||= { reporterCode: code, zh, hs: {} };
  result.byCountry[name].zh = zh;
  for (const [hs, label] of Object.entries(HS)) {
    result.byCountry[name].hs[hs] ||= { label, years: {} };
    for (const y of YEARS) {
      const cur = result.byCountry[name].hs[hs].years[y];
      if (cur && cur.usd != null) { n++; continue; }
      let res = await call(code, hs, y);
      if (res.quota) {
        console.log('\n  ⏳ 配额耗尽，等 ' + Math.ceil(res.quota / 60) + ' 分钟…');
        await sleep((res.quota + 20) * 1000);
        res = await call(code, hs, y);
        if (res.quota) { console.log('  配额未恢复，结束本轮'); break outer; }
      }
      result.byCountry[name].hs[hs].years[y] = res.err ? { error: res.err } : { usd: res.usd, netWgt: res.netWgt };
      n++;
      process.stdout.write('\r  ' + n + '/' + total + '  ' + name.padEnd(14) + hs + '  ' + (res.usd ? '$' + (res.usd / 1e6).toFixed(1) + 'M' : (res.err || '—')).padEnd(14));
      await sleep(GAP);
    }
  }
  writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
}
console.log('\n');
writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');

console.log('  ═══ 矿山设备进口排行榜（2023，USD）═══');
console.log('  ' + '国家'.padEnd(14) + Object.values(HS).map((l) => l.slice(0, 6).padEnd(9)).join(''));
console.log('  ' + '-'.repeat(90));
for (const [name, d] of Object.entries(result.byCountry)) {
  const row = Object.keys(HS).map((hs) => {
    const v = d.hs[hs]?.years['2023']?.usd;
    return (v ? (v / 1e6).toFixed(1) : '—').padEnd(9);
  }).join('');
  console.log('  ' + name.padEnd(14) + row);
}
console.log('\n  写入 ' + OUT);
