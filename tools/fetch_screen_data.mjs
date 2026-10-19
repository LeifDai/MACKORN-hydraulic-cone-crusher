/**
 * 补齐 HS 847410（筛分/分选/分离/洗涤机械）
 *
 * 用户指出："增长高速的国家的海关数据原始数据（破碎机和筛子部分）"
 * 实情：我们此前只抓了 847420（破碎粉磨）与 847490（零件），
 *       【完全漏掉了 847410 —— 筛分机械】。这是真实缺口。
 *
 * 本脚本：
 *   ① 抓 847410（筛分机械）2021/2023，与已有 847420 对齐
 *   ② 输出"破碎机 + 筛子"合并视图（这才是完整的一条线）
 *   ③ 按增长率与绝对额双排序，聚焦高增长 + 矿业发达国家
 *   ④ 导出原始数据 CSV（原始数据 = 不做加工的 Comtrade 返回值）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DB = join(ROOT, 'distribution', 'trade-global.json');
const OUTDIR = join(ROOT, 'distribution', 'trade-raw');
mkdirSync(OUTDIR, { recursive: true });

const HS_SCREEN = '847410';   // 筛分/分选/分离/洗涤机械
const HS_CRUSH = '847420';    // 破碎/粉磨机械
const HS_PARTS = '847490';    // 零件
const YEARS = ['2023', '2021'];
const API = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';

/* ── 高优先级国家（高增长 + 矿业发达）── */
const PRIORITY = [
  ['UZB', '乌兹别克斯坦'], ['KAZ', '哈萨克斯坦'], ['AUS', '澳大利亚'], ['IDN', '印度尼西亚'],
  ['CAN', '加拿大'], ['COD', '刚果金'], ['DEU', '德国'], ['GBR', '英国'],
  ['IND', '印度'], ['ZAF', '南非'], ['SAU', '沙特'], ['CHL', '智利'], ['PER', '秘鲁'],
  ['BRA', '巴西'], ['MEX', '墨西哥'], ['PHL', '菲律宾'], ['VNM', '越南'], ['COL', '哥伦比亚'],
  ['TUR', '土耳其'], ['MAR', '摩洛哥'], ['ZWE', '津巴布韦'], ['KEN', '肯尼亚'], ['LAO', '老挝'],
  ['MLI', '马里'], ['GHA', '加纳'], ['ZMB', '赞比亚'], ['TZA', '坦桑尼亚'], ['NGA', '尼日利亚'],
  ['EGY', '埃及'], ['ARG', '阿根廷'], ['MNG', '蒙古'], ['PAK', '巴基斯坦'], ['THA', '泰国'],
  ['MYS', '马来西亚'], ['SWE', '瑞典'], ['FIN', '芬兰'], ['NOR', '挪威'], ['POL', '波兰'],
  ['ESP', '西班牙'], ['ITA', '意大利'], ['FRA', '法国'], ['RUS', '俄罗斯'], ['PAN', '巴拿马'],
  ['PNG', '巴布亚新几内亚'], ['SEN', '塞内加尔'], ['BFA', '布基纳法索'], ['GIN', '几内亚'],
  ['NAM', '纳米比亚'], ['BWA', '博茨瓦纳'], ['MOZ', '莫桑比克'], ['MDG', '马达加斯加'],
  ['NPL', '尼泊尔'], ['LKA', '斯里兰卡'], ['MMR', '缅甸'], ['KHM', '柬埔寨'],
];

const UA = { 'User-Agent': 'MackornRot/1.0 (+https://mackorn.cn/ai/; leif.dai@mackorn.cn)', 'Accept': 'application/json' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOne(reporterCode, cmdCode, period, tries = 4) {
  const url = `${API}?reporterCode=${reporterCode}&period=${period}&cmdCode=${cmdCode}&flowCode=M`;
  for (let i = 1; i <= tries; i++) {
    try {
      const c = new AbortController(); const id = setTimeout(() => c.abort(), 30000);
      const r = await fetch(url, { headers: UA, signal: c.signal });
      clearTimeout(id);
      if (r.status === 403) {
        const t = await r.text();
        const m = /replenished in (\d+):(\d+)/.exec(t);
        if (m) {
          const wait = (Number(m[1]) * 60 + Number(m[2]) + 3) * 1000;
          console.log(`\n     配额耗尽，等待 ${m[1]}:${m[2]} …`);
          await sleep(Math.min(wait, 180000));
          continue;
        }
        await sleep(3000 * i);
        continue;
      }
      if (!r.ok) { await sleep(2000 * i); continue; }
      const j = await r.json();
      const rec = (j.data || []).find((d) => d.partnerCode === 0 || d.partnerDesc === 'World');
      return rec ? { usd: rec.primaryValue ?? rec.cifvalue ?? rec.fobvalue ?? null, raw: rec } : { usd: null, raw: null };
    } catch (e) {
      if (i === tries) return { usd: null, error: e.cause?.code || e.name };
      await sleep(2000 * i);
    }
  }
  return { usd: null, error: 'exhausted' };
}

/* ── 载入现有库 ── */
const db = existsSync(DB) ? JSON.parse(readFileSync(DB, 'utf8')) : { countries: {} };
db.countries ||= {};

/* 国家代码 → Comtrade 数字码（M49） */
const M49 = { UZB: 860, KAZ: 398, AUS: 36, IDN: 360, CAN: 124, COD: 180, DEU: 276, GBR: 826,
  IND: 699, ZAF: 710, SAU: 682, CHL: 152, PER: 604, BRA: 76, MEX: 484, PHL: 608, VNM: 704,
  COL: 170, TUR: 792, MAR: 504, ZWE: 716, KEN: 404, LAO: 418, MLI: 466, GHA: 288, ZMB: 894,
  TZA: 834, NGA: 566, EGY: 818, ARG: 32, MNG: 496, PAK: 586, THA: 764, MYS: 458, SWE: 752,
  FIN: 246, NOR: 578, POL: 616, ESP: 724, ITA: 380, FRA: 251, RUS: 643, PAN: 591, PNG: 598,
  SEN: 686, BFA: 854, GIN: 324, NAM: 516, BWA: 72, MOZ: 508, MDG: 450, NPL: 524, LKA: 144,
  MMR: 104, KHM: 116 };

const ARGS = process.argv.slice(2);
const DO_FETCH = ARGS.includes('--fetch');
const LIMIT = Number((ARGS.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || PRIORITY.length);

console.log('\n  ── 补齐筛分机械 HS 847410 ──\n');
console.log('  HS 编码对照');
console.log('    847410  筛分/分选/分离/洗涤机械   ← 本次补齐');
console.log('    847420  破碎/粉磨机械             ' + (Object.values(db.countries).some((c) => c.hs?.['847420']) ? '✅ 已有' : '○'));
console.log('    847490  零件                      ' + (Object.values(db.countries).some((c) => c.hs?.['847490']) ? '✅ 已有' : '○'));
console.log('');

const rows = [];
let fetched = 0;

for (let i = 0; i < Math.min(LIMIT, PRIORITY.length); i++) {
  const [iso, zh] = PRIORITY[i];
  const code = M49[iso];
  if (!code) continue;
  const c = db.countries[iso] || (db.countries[iso] = { en: iso, zh, tier: 'priority', hs: {} });
  c.hs ||= {};

  if (!c.hs[HS_SCREEN] || !c.hs[HS_SCREEN].years?.['2023']) {
    if (!DO_FETCH) {
      rows.push({ iso, zh, screen23: null, crush23: c.hs[HS_CRUSH]?.years?.['2023']?.usd ?? null, note: '待抓' });
      continue;
    }
    c.hs[HS_SCREEN] = { years: {} };
    for (const y of YEARS) {
      const r = await fetchOne(code, HS_SCREEN, y);
      c.hs[HS_SCREEN].years[y] = { usd: r.usd, source: 'UN Comtrade public API', hs: HS_SCREEN, flow: 'M', partner: 'World' };
      // 原始记录留档
      if (r.raw) {
        writeFileSync(join(OUTDIR, `raw-${iso}-${HS_SCREEN}-${y}.json`), JSON.stringify(r.raw, null, 2), 'utf8');
      }
      await sleep(2400);
    }
    fetched++;
    process.stdout.write('  ' + String(i + 1).padStart(3) + ' ' + zh.padEnd(12) +
      ' 筛 ' + String(c.hs[HS_SCREEN].years['2023']?.usd ? '$' + (c.hs[HS_SCREEN].years['2023'].usd / 1e6).toFixed(1) + 'M' : '—').padEnd(12) +
      ' 破 ' + String(c.hs[HS_CRUSH]?.years?.['2023']?.usd ? '$' + (c.hs[HS_CRUSH].years['2023'].usd / 1e6).toFixed(1) + 'M' : '—').padEnd(12) + '\n');
  }
  rows.push({
    iso, zh,
    screen23: c.hs[HS_SCREEN]?.years?.['2023']?.usd ?? null,
    screen21: c.hs[HS_SCREEN]?.years?.['2021']?.usd ?? null,
    crush23: c.hs[HS_CRUSH]?.years?.['2023']?.usd ?? null,
    crush21: c.hs[HS_CRUSH]?.years?.['2021']?.usd ?? null,
    parts23: c.hs[HS_PARTS]?.years?.['2023']?.usd ?? null,
  });
}

if (DO_FETCH) {
  writeFileSync(DB, JSON.stringify(db, null, 2), 'utf8');
  console.log('\n  ✅ 已写入 trade-global.json（新增 ' + fetched + ' 国筛分数据）');
  console.log('  ✅ 原始记录留存 distribution/trade-raw/（' + fetched * 2 + ' 个文件）');
}

/* ══════════════════════════════════════════════════════════
 * 合并分析：破碎机 + 筛子 = 完整的一条线
 * ══════════════════════════════════════════════════════════ */
const withData = rows.filter((r) => r.crush23 || r.screen23);
const growth = (a, b) => (a && b ? (a / b - 1) : null);

console.log('\n  ══════════════════════════════════════════════════════════');
console.log('   破碎机 + 筛子 · 合并视图（这才是完整的一条生产线）');
console.log('  ══════════════════════════════════════════════════════════\n');
console.log('  国家            筛分机械       破碎机械      破碎+筛      筛/破比   破碎增长');
console.log('  ' + '─'.repeat(84));
const sorted = withData.slice().sort((a, b) => ((b.crush23 || 0) + (b.screen23 || 0)) - ((a.crush23 || 0) + (a.screen23 || 0)));
for (const r of sorted) {
  const f = (v) => (v ? '$' + (v / 1e6).toFixed(1) + 'M' : '—');
  const total = (r.crush23 || 0) + (r.screen23 || 0);
  const ratio = r.crush23 && r.screen23 ? (r.screen23 / r.crush23).toFixed(2) : '—';
  const g = growth(r.crush23, r.crush21);
  console.log('  ' + r.zh.padEnd(14) + f(r.screen23).padStart(13) + f(r.crush23).padStart(14) +
    f(total).padStart(13) + String(ratio).padStart(10) + (g !== null ? ('  ' + (g * 100).toFixed(0) + '%').padStart(9) : '        —'));
}
console.log('  ' + '─'.repeat(84));

/* 汇总 */
const nScreen = withData.filter((r) => r.screen23).length;
const nCrush = withData.filter((r) => r.crush23).length;
const totScreen = withData.reduce((a, b) => a + (b.screen23 || 0), 0);
const totCrush = withData.reduce((a, b) => a + (b.crush23 || 0), 0);
console.log('\n  有筛分数据 ' + nScreen + ' 国 · 有破碎数据 ' + nCrush + ' 国');
console.log('  筛分机械合计 $' + (totScreen / 1e6).toFixed(1) + 'M · 破碎机械合计 $' + (totCrush / 1e6).toFixed(1) + 'M');
console.log('  筛/破 总比 ' + (totCrush ? (totScreen / totCrush).toFixed(3) : '—'));

/* 高增长 + 有筛分数据的国 */
const hot = sorted.filter((r) => {
  const g = growth(r.crush23, r.crush21);
  return g !== null && g > 0.3 && (r.crush23 || 0) > 5e6;
});
console.log('\n  ── 高增长目标（破碎增长 >30% 且 >$5M）── ' + hot.length + ' 国');
for (const r of hot) {
  const g = growth(r.crush23, r.crush21);
  console.log('     ' + r.zh.padEnd(14) + '破碎 $' + ((r.crush23 || 0) / 1e6).toFixed(1) + 'M (+' + (g * 100).toFixed(0) + '%)' +
    (r.screen23 ? '  筛分 $' + (r.screen23 / 1e6).toFixed(1) + 'M' : '  筛分 待抓'));
}

/* 导出 CSV */
const header = ['iso', 'country_zh', 'screen_847410_2023_usd', 'screen_847410_2021_usd',
  'crusher_847420_2023_usd', 'crusher_847420_2021_usd', 'parts_847490_2023_usd',
  'crusher_growth_pct', 'screen_to_crusher_ratio', 'source'];
const csv = [header.join(',')].concat(sorted.map((r) => {
  const g = growth(r.crush23, r.crush21);
  const ratio = r.crush23 && r.screen23 ? (r.screen23 / r.crush23).toFixed(4) : '';
  return [r.iso, r.zh, r.screen23 ?? '', r.screen21 ?? '', r.crush23 ?? '', r.crush21 ?? '', r.parts23 ?? '',
    g !== null ? (g * 100).toFixed(1) : '', ratio, 'UN Comtrade public API, flowCode=M, partnerCode=0'].join(',');
})).join('\n');
writeFileSync(join(OUTDIR, 'crusher-and-screen-combined.csv'), csv, 'utf8');
writeFileSync(join(ROOT, 'distribution', 'dataset', 'mackorn-crusher-and-screen-combined.csv'), csv, 'utf8');
console.log('\n  ✅ 导出 trade-raw/crusher-and-screen-combined.csv（' + sorted.length + ' 国 × 10 字段）');
console.log('  ✅ 同步到 dataset/ 供数据集发布包使用\n');
