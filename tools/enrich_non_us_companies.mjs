/**
 * 给非美国矿企定位国家 + 按区域归类 + 生成可交付清单
 *
 * 国家来源（按可靠性排序）：
 *   ① SEC submissions 的 stateOfIncorporation / business address（官方申报）
 *   ② 公司名里的国别线索（如 "OF CHILE" / "LTD" 等，仅作辅助）
 *   ③ 已知项目的国别（从 20-F 提取）
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const G = join(ROOT, 'distribution', 'company-leads', 'global');
mkdirSync(G, { recursive: true });

const src = JSON.parse(readFileSync(join(G, 'non-us-mining-companies.json'), 'utf8'));
const companies = src.companies || [];
console.log('\n  载入 ' + companies.length + ' 家');

const H = { 'User-Agent': 'MACKORN Research leif.dai@mackorn.cn', 'Accept': 'application/json' };

async function getSub(cik) {
  for (let i = 1; i <= 3; i++) {
    const c = new AbortController(); const id = setTimeout(() => c.abort(), 25000);
    try {
      const r = await fetch('https://data.sec.gov/submissions/CIK' + cik + '.json', { headers: H, signal: c.signal });
      clearTimeout(id);
      if (!r.ok) { if (i === 3) return null; await new Promise((s) => setTimeout(s, 600)); continue; }
      const j = await r.json();
      return {
        sic: j.sic, sicDesc: j.sicDescription,
        state: j.stateOfIncorporation,
        stateDesc: j.stateOfIncorporationDescription,
        business: j.addresses?.business || null,
        fiscal: j.fiscalYearEnd,
      };
    } catch { clearTimeout(id); if (i === 3) return null; await new Promise((s) => setTimeout(s, 600)); }
  }
  return null;
}

/* 美国州名 → 说明这是"在美注册"，真正的运营国要看别处 */
const US_STATES = /^(DE|MD|NV|CO|CA|NY|TX|WA|AZ|AK|UT|ID|MN|MT|WY|FL|IL|VA|NJ|PA|OH|OR|NC|SC|GA|IN|MO|WI|KY|TN|AL|MS|LA|OK|KS|NE|SD|ND|NM|AR|IA|CT|MA|RI|NH|VT|ME|HI|WV|MI|DC)$/;

console.log('  查询 SEC submissions 定位国家...\n');
let done = 0;
for (const co of companies) {
  const s = await getSub(co.cik);
  if (s) {
    co.sic = s.sic; co.sic_desc = s.sicDesc;
    co.incorporation = s.stateDesc || s.state || null;
    co.business_address = s.business ? [s.business.city, s.business.stateOrCountry, s.business.country].filter(Boolean).join(', ') : null;
    co.business_country = s.business?.country || null;
    co.is_us_incorporated = US_STATES.test(String(s.state || '').toUpperCase());
    co.fiscal_year_end = s.fiscal;
    done++;
  }
  process.stdout.write('  ... ' + (companies.indexOf(co) + 1) + '/' + companies.length + '  成功 ' + done + '\r');
  await new Promise((r) => setTimeout(r, 120));
}
console.log('  完成：成功定位 ' + done + ' / ' + companies.length + '\n');

/* ── 区域归类 ── */
const REGION = {
  '南非': '非洲', '纳米比亚': '非洲', '津巴布韦': '非洲', '加纳': '非洲', '布基纳法索': '非洲', '马里': '非洲',
  '坦桑尼亚': '非洲', '赞比亚': '非洲', '刚果(金)': '非洲', '刚果（金）': '非洲', '博茨瓦纳': '非洲', '埃及': '非洲',
  '摩洛哥': '非洲', '科特迪瓦': '非洲', '几内亚': '非洲', '塞内加尔': '非洲', '苏丹': '非洲', '埃塞俄比亚': '非洲',
  '澳大利亚': '大洋洲', '巴布亚新几内亚': '大洋洲', '新西兰': '大洋洲', '斐济': '大洋洲',
  '巴西': '拉美', '智利': '拉美', '秘鲁': '拉美', '墨西哥': '拉美', '阿根廷': '拉美', '哥伦比亚': '拉美',
  '厄瓜多尔': '拉美', '玻利维亚': '拉美', '圭亚那': '拉美', '苏里南': '拉美', '多米尼加': '拉美', '巴拿马': '拉美',
  '加拿大': '北美', '美国': '北美',
  '英国': '欧洲', '爱尔兰': '欧洲', '希腊': '欧洲', '土耳其': '欧洲/中东', '西班牙': '欧洲', '葡萄牙': '欧洲',
  '芬兰': '欧洲', '瑞典': '欧洲', '挪威': '欧洲', '德国': '欧洲', '法国': '欧洲', '意大利': '欧洲', '俄罗斯': '欧洲/中亚',
  '以色列': '中东', '沙特阿拉伯': '中东', '阿联酋': '中东', '约旦': '中东',
  '哈萨克斯坦': '中亚', '乌兹别克斯坦': '中亚', '蒙古': '中亚', '吉尔吉斯斯坦': '中亚', '塔吉克斯坦': '中亚',
  '印度': '南亚', '印度尼西亚': '东南亚', '菲律宾': '东南亚', '越南': '东南亚', '马来西亚': '东南亚',
  '泰国': '东南亚', '缅甸': '东南亚', '老挝': '东南亚',
  '中国': '东亚', '香港': '东亚', '日本': '东亚', '韩国': '东亚',
};

/* 从公司名与业务地址推断运营区域 */
function guessRegion(co) {
  const text = [co.name, co.business_address, co.incorporation].filter(Boolean).join(' ');
  for (const [k, v] of Object.entries(REGION)) {
    if (text.includes(k)) return v;
  }
  // 名称线索
  if (/\b(AU|AUS|Australia)\b/i.test(co.name)) return '大洋洲';
  if (/\b(SA|Brazil|Brasil)\b/i.test(co.name)) return '拉美';
  if (/\bPLC\b/.test(co.name) && /Gold|Mining|Resources/i.test(co.name)) return '欧洲/非洲（英联邦）';
  return '待定';
}
for (const co of companies) co.region_guess = guessRegion(co);

const byRegion = {};
for (const co of companies) byRegion[co.region_guess] = (byRegion[co.region_guess] || 0) + 1;

console.log('  ── 按区域分布（推断）──');
for (const [k, v] of Object.entries(byRegion).sort((a, b) => b[1] - a[1])) console.log('    ' + String(k).padEnd(20) + String(v).padStart(4) + ' 家');

console.log('\n  ── 各国/地区明细（前 40）──');
console.log('  ' + '─'.repeat(96));
for (const co of companies.slice(0, 40)) {
  console.log('  ' + co.name.slice(0, 40).padEnd(42) +
    String(co.incorporation || '-').slice(0, 12).padEnd(14) +
    String(co.region_guess).padEnd(16) + String(co.filingCount).padStart(3) + '份');
}
console.log('  ' + '─'.repeat(96));

writeFileSync(join(G, 'non-us-mining-companies.json'), JSON.stringify({
  ...src,
  generated: new Date().toISOString(),
  enriched: '已补充 SEC submissions 的注册地、business address、SIC；region_guess 为推断值，须人工确认',
  companies,
}, null, 2), 'utf8');

/* ── 按区域导出 CSV ── */
const csv = [['公司名', '区域(推断)', '注册地', '业务地址', 'SEC行业', 'SIC', '申报类型', '命中文件', '最新申报', 'CIK', 'SEC核查链接'].join(',')];
for (const co of companies) {
  csv.push([
    '"' + co.name.replace(/"/g, '""') + '"', co.region_guess, '"' + (co.incorporation || '') + '"', '"' + (co.business_address || '') + '"',
    '"' + (co.sic_desc || '') + '"', co.sic || '', co.forms.join('/'), co.filingCount, co.latest, co.cik, co.sec_url,
  ].join(','));
}
writeFileSync(join(G, 'non-us-mining-companies.csv'), csv.join('\n'), 'utf8');

console.log('\n  ✅ non-us-mining-companies.json / .csv');
console.log('     共 ' + companies.length + ' 家非美国矿企 · ' + Object.keys(byRegion).length + ' 个区域\n');
