/**
 * 海关数据"耐心版"拉取器
 *
 * 背景：Comtrade 公共预览端点有调用配额，超限后按 IP 返回
 *   403 "Out of call volume quota. Quota will be replenished in MM:SS"
 * 第一版一次性发了 198 次请求 → 全部被拒。
 *
 * 这一版：
 *   - 每轮只查 18 个重点国家 × 2 个 HS × 2 个年份 = 72 次（配额内）
 *   - 请求间隔 2.5 秒
 *   - 遇到 403 配额错误 → 从报错里解析剩余秒数，睡够再继续
 *   - 每查完一个国家立刻落盘（断点续跑）
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = process.argv[2] || join(ROOT, 'distribution', 'trade-data.json');

// 只查重点国家（按已知数据 + 用户指定区域）
const COUNTRIES = {
  398: 'Kazakhstan', 36: 'Australia', 360: 'Indonesia', 124: 'Canada',
  710: 'South Africa', 152: 'Chile', 604: 'Peru', 76: 'Brazil',
  682: 'Saudi Arabia', 784: 'UAE', 792: 'Turkey', 860: 'Uzbekistan',
  288: 'Ghana', 894: 'Zambia', 608: 'Philippines', 704: 'Vietnam',
  484: 'Mexico', 170: 'Colombia',
};
const HS = { '847420': '破碎/粉磨机械', '847490': '零件（衬板耐磨件）' };
const YEARS = ['2021', '2023'];
const GAP = 2500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let result = { generated: new Date().toISOString(), source: 'UN Comtrade public preview API', unit: 'USD (imports, CIF, World total)', byCountry: {} };
if (existsSync(OUT)) { try { const o = JSON.parse(readFileSync(OUT, 'utf8')); if (o.byCountry) result.byCountry = o.byCountry; } catch { } }

async function call(reporter, cmd, period) {
  const url = `https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=${reporter}&period=${period}&cmdCode=${cmd}&flowCode=M`;
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120', Accept: 'application/json' } });
  const txt = await r.text();
  if (r.status === 403 && /quota/i.test(txt)) {
    const m = txt.match(/replenished in (\d+):(\d+):(\d+)/);
    const wait = m ? (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) : 1800;
    return { quota: wait, raw: txt.slice(0, 120) };
  }
  if (!r.ok) return { err: 'HTTP ' + r.status };
  try {
    const j = JSON.parse(txt);
    const rows = (j.data || []).filter((d) => d.flowCode === 'M' && d.cmdCode === cmd);
    if (!rows.length) return { err: 'no data' };
    const world = rows.find((d) => String(d.partnerCode) === '0') || rows.slice().sort((a, b) => (b.primaryValue || 0) - (a.primaryValue || 0))[0];
    return { usd: world.primaryValue, netWgt: world.netWgt };
  } catch { return { err: 'bad json' }; }
}

let done = 0, need = 0;
for (const [codeStr, name] of Object.entries(COUNTRIES)) {
  const code = Number(codeStr);
  result.byCountry[name] ||= { reporterCode: code, hs: {} };
  for (const [hs, label] of Object.entries(HS)) {
    result.byCountry[name].hs[hs] ||= { label, years: {} };
    for (const y of YEARS) {
      const cur = result.byCountry[name].hs[hs].years[y];
      if (cur && cur.usd != null) { done++; continue; }
      need++;
    }
  }
}
console.log('  本轮需查询 ' + need + ' 次（已完成 ' + done + '）');

let n = 0;
outer:
for (const [codeStr, name] of Object.entries(COUNTRIES)) {
  const code = Number(codeStr);
  for (const [hs] of Object.entries(HS)) {
    for (const y of YEARS) {
      const cur = result.byCountry[name].hs[hs].years[y];
      if (cur && cur.usd != null) continue;

      let res = await call(code, hs, y);
      if (res.quota) {
        console.log('\n  ⏳ 配额耗尽，需等 ' + Math.ceil(res.quota / 60) + ' 分钟…');
        await sleep((res.quota + 20) * 1000);
        res = await call(code, hs, y);           // 睡醒重试一次
        if (res.quota) { console.log('  配额仍未恢复，本轮结束'); break outer; }
      }
      result.byCountry[name].hs[hs].years[y] = res.err ? { error: res.err } : { usd: res.usd, netWgt: res.netWgt };
      n++;
      process.stdout.write('\r  ' + n + '/' + need + '  ' + name.padEnd(14) + hs + '@' + y + '  ' + (res.usd ? '$' + (res.usd / 1e6).toFixed(1) + 'M' : (res.err || '—')).padEnd(16));
      await sleep(GAP);
    }
  }
  writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
}
console.log('\n');
writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');

const rank = Object.entries(result.byCountry).map(([name, d]) => {
  const y = d.hs['847420']?.years || {}, p = d.hs['847490']?.years || {};
  return { name, y21: y['2021']?.usd || 0, y23: y['2023']?.usd || 0, part: p['2023']?.usd || p['2021']?.usd || 0 };
}).filter((r) => r.y21 || r.y23 || r.part).sort((a, b) => b.y23 - a.y23);

const f = (v) => (v ? '$' + (v / 1e6).toFixed(1) + 'M' : '—');
console.log('  ═══ HS 847420 破碎/粉磨机械 · 进口额 ═══');
console.log('  ' + '国家'.padEnd(16) + '2021'.padEnd(13) + '2023'.padEnd(13) + '847490 零件');
console.log('  ' + '-'.repeat(56));
for (const r of rank) console.log('  ' + r.name.padEnd(16) + f(r.y21).padEnd(13) + f(r.y23).padEnd(13) + f(r.part));
console.log('\n  写入 ' + OUT);
