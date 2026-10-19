/**
 * 全球海关数据全量抓取（矿业大国优先，可断点续跑，配额自适应）
 *
 * 目标：覆盖全球 70%+ 国家（~150 个），HS 847420（破碎机械）+ 847490（零件/耐磨件）
 *
 * 为什么这么设计：
 *   Comtrade 免费端点约 100-200 次/时段，超限 403 并给出恢复秒数。
 *   一次抓 300+ 次必然被打断，所以必须：
 *     ① 每抓完一个国家立刻落盘（断点续跑）
 *     ② 遇 403 自动解析恢复时间并等待
 *     ③ 矿业大国排在最前（即使中途中断，拿到的也是最有价值的数据）
 *
 * 用法：
 *   node tools/fetch_trade_global.mjs                  # 一直跑到抓完
 *   node tools/fetch_trade_global.mjs --rounds=3       # 最多处理 3 轮配额
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', 'trade-global.json');

/* ============================================================
 * 国家清单（UN M49 编码）—— 按矿业重要性排序
 * tier: 1=矿业大国  2=重要矿业国  3=一般  4=补充
 * ============================================================ */
const COUNTRIES = [
  // ── Tier 1：矿业大国（先抓，最有价值）──────────────────────
  ['156', 'China', '中国', 1], ['840', 'United States', '美国', 1],
  ['643', 'Russia', '俄罗斯', 1], ['36', 'Australia', '澳大利亚', 1],
  ['124', 'Canada', '加拿大', 1], ['76', 'Brazil', '巴西', 1],
  ['152', 'Chile', '智利', 1], ['604', 'Peru', '秘鲁', 1],
  ['710', 'South Africa', '南非', 1], ['398', 'Kazakhstan', '哈萨克斯坦', 1],
  ['860', 'Uzbekistan', '乌兹别克斯坦', 1], ['360', 'Indonesia', '印度尼西亚', 1],
  ['356', 'India', '印度', 1], ['484', 'Mexico', '墨西哥', 1],
  ['180', 'DR Congo', '刚果金', 1], ['894', 'Zambia', '赞比亚', 1],
  ['288', 'Ghana', '加纳', 1], ['36', '', '', 9], // 占位去重
  ['170', 'Colombia', '哥伦比亚', 1], ['608', 'Philippines', '菲律宾', 1],
  ['410', 'South Korea', '韩国', 1], ['392', 'Japan', '日本', 1],
  ['792', 'Turkey', '土耳其', 1], ['682', 'Saudi Arabia', '沙特阿拉伯', 1],
  ['784', 'UAE', '阿联酋', 1], ['364', 'Iran', '伊朗', 1],
  ['32', 'Argentina', '阿根廷', 1], ['458', 'Malaysia', '马来西亚', 1],
  ['704', 'Vietnam', '越南', 1], ['834', 'Tanzania', '坦桑尼亚', 1],
  ['566', 'Nigeria', '尼日利亚', 1], ['508', 'Mozambique', '莫桑比克', 1],
  ['372', 'Ireland', '爱尔兰', 1], ['752', 'Sweden', '瑞典', 1],
  ['246', 'Finland', '芬兰', 1], ['578', 'Norway', '挪威', 1],

  // ── Tier 2：重要矿业国 ────────────────────────────────────
  ['616', 'Poland', '波兰', 2], ['276', 'Germany', '德国', 2],
  ['250', 'France', '法国', 2], ['826', 'United Kingdom', '英国', 2],
  ['724', 'Spain', '西班牙', 2], ['380', 'Italy', '意大利', 2],
  ['620', 'Portugal', '葡萄牙', 2], ['300', 'Greece', '希腊', 2],
  ['100', 'Bulgaria', '保加利亚', 2], ['642', 'Romania', '罗马尼亚', 2],
  ['203', 'Czechia', '捷克', 2], ['348', 'Hungary', '匈牙利', 2],
  ['040', 'Austria', '奥地利', 2], ['756', 'Switzerland', '瑞士', 2],
  ['528', 'Netherlands', '荷兰', 2], ['056', 'Belgium', '比利时', 2],
  ['191', 'Croatia', '克罗地亚', 2], ['688', 'Serbia', '塞尔维亚', 2],
  ['807', 'North Macedonia', '北马其顿', 2], ['070', 'Bosnia and Herzegovina', '波黑', 2],
  ['008', 'Albania', '阿尔巴尼亚', 2], ['499', 'Montenegro', '黑山', 2],
  ['804', 'Ukraine', '乌克兰', 2], ['112', 'Belarus', '白俄罗斯', 2],
  ['498', 'Moldova', '摩尔多瓦', 2], ['268', 'Georgia', '格鲁吉亚', 2],
  ['051', 'Armenia', '亚美尼亚', 2], ['031', 'Azerbaijan', '阿塞拜疆', 2],
  ['417', 'Kyrgyzstan', '吉尔吉斯斯坦', 2], ['762', 'Tajikistan', '塔吉克斯坦', 2],
  ['795', 'Turkmenistan', '土库曼斯坦', 2], ['496', 'Mongolia', '蒙古', 2],
  ['004', 'Afghanistan', '阿富汗', 2], ['586', 'Pakistan', '巴基斯坦', 2],
  ['050', 'Bangladesh', '孟加拉国', 2], ['144', 'Sri Lanka', '斯里兰卡', 2],
  ['524', 'Nepal', '尼泊尔', 2], ['104', 'Myanmar', '缅甸', 2],
  ['764', 'Thailand', '泰国', 2], ['116', 'Cambodia', '柬埔寨', 2],
  ['418', 'Laos', '老挝', 2], ['096', 'Brunei', '文莱', 2],
  ['702', 'Singapore', '新加坡', 2], ['158', 'Taiwan', '中国台湾', 2],
  ['344', 'Hong Kong', '中国香港', 2], ['446', 'Macao', '中国澳门', 2],
  ['408', 'North Korea', '朝鲜', 2], ['496', '', '', 9],

  // ── Tier 3：非洲与拉美 ────────────────────────────────────
  ['024', 'Angola', '安哥拉', 3], ['516', 'Namibia', '纳米比亚', 3],
  ['072', 'Botswana', '博茨瓦纳', 3], ['748', 'Eswatini', '斯威士兰', 3],
  ['426', 'Lesotho', '莱索托', 3], ['454', 'Malawi', '马拉维', 3],
  ['716', 'Zimbabwe', '津巴布韦', 3], ['646', 'Rwanda', '卢旺达', 3],
  ['108', 'Burundi', '布隆迪', 3], ['800', 'Uganda', '乌干达', 3],
  ['404', 'Kenya', '肯尼亚', 3], ['231', 'Ethiopia', '埃塞俄比亚', 3],
  ['232', 'Eritrea', '厄立特里亚', 3], ['706', 'Somalia', '索马里', 3],
  ['729', 'Sudan', '苏丹', 3], ['728', 'South Sudan', '南苏丹', 3],
  ['818', 'Egypt', '埃及', 3], ['434', 'Libya', '利比亚', 3],
  ['788', 'Tunisia', '突尼斯', 3], ['012', 'Algeria', '阿尔及利亚', 3],
  ['504', 'Morocco', '摩洛哥', 3], ['478', 'Mauritania', '毛里塔尼亚', 3],
  ['466', 'Mali', '马里', 3], ['854', 'Burkina Faso', '布基纳法索', 3],
  ['562', 'Niger', '尼日尔', 3], ['148', 'Chad', '乍得', 3],
  ['120', 'Cameroon', '喀麦隆', 3], ['140', 'Central African Republic', '中非', 3],
  ['266', 'Gabon', '加蓬', 3], ['178', 'Congo', '刚果布', 3],
  ['226', 'Equatorial Guinea', '赤道几内亚', 3], ['678', 'Sao Tome and Principe', '圣多美', 3],
  ['624', 'Guinea-Bissau', '几内亚比绍', 3], ['324', 'Guinea', '几内亚', 3],
  ['694', 'Sierra Leone', '塞拉利昂', 3], ['430', 'Liberia', '利比里亚', 3],
  ['384', "Cote d'Ivoire", '科特迪瓦', 3], ['288', '', '', 9],
  ['288', 'Ghana', '', 9], ['204', 'Benin', '贝宁', 3],
  ['768', 'Togo', '多哥', 3], ['686', 'Senegal', '塞内加尔', 3],
  ['270', 'Gambia', '冈比亚', 3], ['132', 'Cabo Verde', '佛得角', 3],
  ['478', '', '', 9], ['638', 'Reunion', '留尼汪', 3],

  // ── Tier 3：拉美与加勒比 ──────────────────────────────────
  ['068', 'Bolivia', '玻利维亚', 3], ['858', 'Uruguay', '乌拉圭', 3],
  ['600', 'Paraguay', '巴拉圭', 3], ['218', 'Ecuador', '厄瓜多尔', 3],
  ['862', 'Venezuela', '委内瑞拉', 3], ['328', 'Guyana', '圭亚那', 3],
  ['740', 'Suriname', '苏里南', 3], ['254', 'French Guiana', '法属圭亚那', 3],
  ['084', 'Belize', '伯利兹', 3], ['320', 'Guatemala', '危地马拉', 3],
  ['340', 'Honduras', '洪都拉斯', 3], ['222', 'El Salvador', '萨尔瓦多', 3],
  ['558', 'Nicaragua', '尼加拉瓜', 3], ['188', 'Costa Rica', '哥斯达黎加', 3],
  ['591', 'Panama', '巴拿马', 3], ['192', 'Cuba', '古巴', 3],
  ['214', 'Dominican Republic', '多米尼加', 3], ['332', 'Haiti', '海地', 3],
  ['388', 'Jamaica', '牙买加', 3], ['780', 'Trinidad and Tobago', '特立尼达', 3],
  ['052', 'Barbados', '巴巴多斯', 3], ['044', 'Bahamas', '巴哈马', 3],

  // ── Tier 4：中东与其余 ────────────────────────────────────
  ['400', 'Jordan', '约旦', 4], ['422', 'Lebanon', '黎巴嫩', 4],
  ['760', 'Syria', '叙利亚', 4], ['368', 'Iraq', '伊拉克', 4],
  ['887', 'Yemen', '也门', 4], ['512', 'Oman', '阿曼', 4],
  ['634', 'Qatar', '卡塔尔', 4], ['414', 'Kuwait', '科威特', 4],
  ['048', 'Bahrain', '巴林', 4], ['784', '', '', 9],
  ['626', 'Timor-Leste', '东帝汶', 4], ['598', 'Papua New Guinea', '巴布亚新几内亚', 4],
  ['090', 'Solomon Islands', '所罗门群岛', 4], ['242', 'Fiji', '斐济', 4],
  ['540', 'New Caledonia', '新喀里多尼亚', 4], ['548', 'Vanuatu', '瓦努阿图', 4],
  ['554', 'New Zealand', '新西兰', 4], ['036', '', '', 9],
  ['352', 'Iceland', '冰岛', 4], ['208', 'Denmark', '丹麦', 4],
  ['233', 'Estonia', '爱沙尼亚', 4], ['428', 'Latvia', '拉脱维亚', 4],
  ['440', 'Lithuania', '立陶宛', 4], ['703', 'Slovakia', '斯洛伐克', 4],
  ['705', 'Slovenia', '斯洛文尼亚', 4], ['470', 'Malta', '马耳他', 4],
  ['196', 'Cyprus', '塞浦路斯', 4], ['442', 'Luxembourg', '卢森堡', 4],
];

// 去重 + 去掉占位
const seen = new Set();
const LIST = [];
for (const [code, en, zh, tier] of COUNTRIES) {
  if (!en || tier === 9 || seen.has(code)) continue;
  seen.add(code);
  LIST.push({ code, en, zh, tier });
}
LIST.sort((a, b) => a.tier - b.tier);

const HS = { '847420': '破碎/粉磨机械', '847490': '零件(衬板耐磨件)' };
const YEARS = ['2023', '2021'];
const GAP = 2600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const roundsArg = process.argv.find((a) => a.startsWith('--rounds='));
const MAX_ROUNDS = roundsArg ? Number(roundsArg.split('=')[1]) : 999;

let db = { generated: new Date().toISOString(), source: 'UN Comtrade public preview API', unit: 'USD (imports, CIF, World total)', countries: {} };
if (existsSync(OUT)) { try { const o = JSON.parse(readFileSync(OUT, 'utf8')); if (o.countries) db = o; } catch { } }

async function call(reporter, cmd, period, attempt = 1) {
  const url = `https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=${reporter}&period=${period}&cmdCode=${cmd}&flowCode=M`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120', Accept: 'application/json' } });
    const txt = await r.text();
    if (r.status === 403 && /quota/i.test(txt)) {
      const m = txt.match(/replenished in (\d+):(\d+):(\d+)/);
      return { quota: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 1800 };
    }
    if (r.status === 429) { if (attempt > 4) return { err: 'rate-limited' }; await sleep(3000 * attempt); return call(reporter, cmd, period, attempt + 1); }
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

const todo = () => LIST.filter((c) => {
  const d = db.countries[c.code];
  if (!d) return true;
  return !(d.hs?.['847420']?.years?.['2023']?.usd != null);
});
let need = todo().length;
console.log('  国家总数 ' + LIST.length + ' · 待抓 ' + need + ' 个');
console.log('  配额上限约 100-200 次/轮，本脚本会自动等待恢复\n');

let round = 0;
while (round < MAX_ROUNDS) {
  const pending = todo();
  if (!pending.length) { console.log('  ✅ 全部抓完'); break; }
  round++;
  console.log('  ── 第 ' + round + ' 轮，待抓 ' + pending.length + ' 国 ──');
  let hitQuota = false;

  for (const c of pending) {
    db.countries[c.code] ||= { code: c.code, en: c.en, zh: c.zh, tier: c.tier, hs: {} };
    const rec = db.countries[c.code];
    for (const hs of Object.keys(HS)) {
      rec.hs[hs] ||= { label: HS[hs], years: {} };
      for (const y of YEARS) {
        const cur = rec.hs[hs].years[y];
        if (cur && cur.usd != null) continue;
        if (cur && cur.error === 'no data') continue;
        const res = await call(c.code, hs, y);
        if (res.quota) {
          console.log('\n  ⏳ 配额耗尽，需等待 ' + Math.ceil(res.quota / 60) + ' 分钟');
          writeFileSync(OUT, JSON.stringify(db, null, 2), 'utf8');
          await sleep((res.quota + 25) * 1000);
          const retry = await call(c.code, hs, y);
          if (retry.quota) { console.log('  配额仍未恢复，结束'); hitQuota = true; break; }
          rec.hs[hs].years[y] = retry.err ? { error: retry.err } : { usd: retry.usd, netWgt: retry.netWgt };
        } else {
          rec.hs[hs].years[y] = res.err ? { error: res.err } : { usd: res.usd, netWgt: res.netWgt };
        }
        const v = rec.hs[hs].years[y];
        process.stdout.write('\r  ' + String(round).padStart(2) + '轮  ' + c.zh.padEnd(8) + hs + '@' + y + '  ' + (v.usd ? '$' + (v.usd / 1e6).toFixed(1) + 'M' : (v.error || '')).padEnd(14) + '  剩余 ' + todo().length + ' 国      ');
        await sleep(GAP);
      }
      if (hitQuota) break;
    }
    writeFileSync(OUT, JSON.stringify(db, null, 2), 'utf8');
    if (hitQuota) break;
  }
  writeFileSync(OUT, JSON.stringify(db, null, 2), 'utf8');
  if (!hitQuota && !todo().length) { console.log('\n  ✅ 全部抓完'); break; }
}

console.log('\n');
writeFileSync(OUT, JSON.stringify(db, null, 2), 'utf8');
const done = Object.values(db.countries).filter((c) => c.hs?.['847420']?.years?.['2023']?.usd != null).length;
const withData = Object.values(db.countries).filter((c) => c.hs?.['847420']?.years?.['2023']?.usd || c.hs?.['847490']?.years?.['2023']?.usd).length;
console.log('  写入 ' + OUT);
console.log('  有效数据国家 ' + withData + ' / ' + LIST.length + ' · 有 2023 破碎数据 ' + done);
