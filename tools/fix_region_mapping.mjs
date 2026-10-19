/**
 * 修正区域归类：SEC 返回的注册地是英文，之前的映射表用了中文键 → 全部落到"待定"
 *
 * 重要局限（必须写进交付物）：
 *   注册地 ≠ 运营地。大量矿企在加拿大/开曼/百慕大注册，实际矿山在非洲或拉美。
 *   例：Aura Minerals 注册在 BVI，矿山在巴西/墨西哥/洪都拉斯。
 *   → 注册地只能作为【法域】参考；运营区域须从 20-F 正文的矿山章节确认。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const G = join(ROOT, 'distribution', 'company-leads', 'global');
const j = JSON.parse(readFileSync(join(G, 'non-us-mining-companies.json'), 'utf8'));
const companies = j.companies || [];

/* 英文注册地 → 区域 */
const EN_REGION = [
  [/united kingdom|england|scotland|wales|northern ireland/i, '欧洲-英国'],
  [/ireland/i, '欧洲-爱尔兰'],
  [/luxembourg/i, '欧洲-卢森堡'],
  [/israel/i, '中东-以色列'],
  [/isle of man|jersey|guernsey/i, '欧洲-离岸'],
  [/australia|new south wales|victoria|queensland|western australia|south australia|tasmania/i, '大洋洲-澳洲'],
  [/new zealand/i, '大洋洲-新西兰'],
  [/south africa/i, '非洲-南非'],
  [/canada|ontario|british columbia|alberta|quebec|manitoba|saskatchewan|nova scotia|yukon|nunavut/i, '北美-加拿大'],
  [/brazil/i, '拉美-巴西'],
  [/chile/i, '拉美-智利'],
  [/peru/i, '拉美-秘鲁'],
  [/mexico/i, '拉美-墨西哥'],
  [/argentina/i, '拉美-阿根廷'],
  [/colombia/i, '拉美-哥伦比亚'],
  [/cayman islands|british virgin islands|virgin islands|bermuda/i, '离岸注册（运营地须另查）'],
  [/united states|delaware|nevada|maryland|colorado|california|new york|texas/i, '美国'],
  [/japan/i, '东亚-日本'], [/china|hong kong/i, '东亚-中国'],
  [/india/i, '南亚-印度'], [/indonesia/i, '东南亚-印尼'],
  [/turkey|türkiye/i, '欧洲/中东-土耳其'],
];

function regionOf(co) {
  const t = [co.incorporation, co.business_address, co.business_country].filter(Boolean).join(' | ');
  for (const [re, label] of EN_REGION) if (re.test(t)) return label;
  if (!t.trim()) return '未知（SEC 未提供注册地）';
  return '其他：' + t.slice(0, 30);
}
for (const co of companies) { co.incorporation_region = regionOf(co); }

const byRegion = {};
for (const co of companies) byRegion[co.incorporation_region] = (byRegion[co.incorporation_region] || 0) + 1;

console.log('\n  ── 按【注册地】区域分布 ──');
for (const [k, v] of Object.entries(byRegion).sort((a, b) => b[1] - a[1])) {
  console.log('    ' + String(k).padEnd(28) + String(v).padStart(4) + ' 家');
}

/* ── 已知运营区域（人工核对的常识映射，仅对头部公司，并明确标注为人工补充）── */
const OPERATING = {
  'anglogold ashanti': '非洲/澳洲/拉美（加纳/坦桑/澳/巴西）',
  'gold fields': '非洲/澳洲/拉美（加纳/南非/澳/智利/秘鲁）',
  'vale': '拉美（巴西为主）+ 加拿大/印尼',
  'aura minerals': '拉美（巴西/墨西哥/洪都拉斯/哥伦比亚）',
  'iamgold': '非洲（布基纳法索/马里）+ 加拿大',
  'eldorado gold': '欧洲/中东（希腊/土耳其）+ 加拿大',
  'harmony gold': '非洲（南非）+ 巴布亚新几内亚',
  'bhp group': '大洋洲（澳）+ 拉美（智利/秘鲁）',
  'fortuna mining': '拉美（秘鲁/墨西哥/阿根廷/科特迪瓦）',
  'buenaventura': '拉美（秘鲁）',
  'rio tinto': '大洋洲/非洲/拉美/北美/蒙古',
  'alamos gold': '拉美（墨西哥）+ 土耳其',
  'icl group': '中东（以色列）+ 欧洲/拉美',
  'b2gold': '非洲（马里/布基纳法索/纳米比亚）+ 亚洲（菲律宾）',
  'sibanye stillwater': '非洲（南非）+ 欧洲（芬兰）+ 北美',
  'nexa resources': '拉美（巴西/秘鲁）+ 纳米比亚',
  'caledonia mining': '非洲（津巴布韦）',
  'chemical & mining co of chile': '拉美（智利）锂/碘/钾',
  'national steel co': '拉美（巴西）',
  'cementos pacasmayo': '拉美（秘鲁）',
  'loma negra': '拉美（阿根廷）',
  'sigma lithium': '拉美（巴西）',
  'namib minerals': '非洲（纳米比亚/津巴布韦）',
  'lifezone metals': '非洲（坦桑尼亚）',
  'centerra gold': '北美（加拿大）+ 土耳其',
  'new gold': '北美（加拿大）',
  'equinox gold': '拉美/北美（巴西/墨西哥/美国/加拿大）',
  'taseko mines': '北美（加拿大）',
  'loncor gold': '非洲（刚果金）',
  'snow lake resources': '北美（加拿大）',
  'guardian metal resources': '欧洲（英国）+ 中亚',
  'ioneer': '北美（美国内华达）锂硼',
  'trx gold': '非洲（坦桑尼亚）',
  'galiano gold': '非洲（加纳）',
  'wheaton precious metals': '全球贵金属流（加拿大注册）',
  'gold royalty': '全球权益金（加拿大注册）',
  'versamet royalties': '全球权益金',
};
let matched = 0;
for (const co of companies) {
  const key = Object.keys(OPERATING).find((k) => co.name.toLowerCase().includes(k));
  if (key) { co.operating_region_manual = OPERATING[key]; co.operating_source = '人工核对常识（须以 20-F 矿山章节为准）'; matched++; }
  else co.operating_region_manual = null;
}
console.log('\n  ── 运营区域（人工补充 ' + matched + ' 家）──');
const byOp = {};
for (const co of companies) {
  if (!co.operating_region_manual) continue;
  const r = co.operating_region_manual.split(/[（(]/)[0].trim();
  byOp[r] = (byOp[r] || 0) + 1;
}
for (const [k, v] of Object.entries(byOp).sort((a, b) => b[1] - a[1])) console.log('    ' + String(k).padEnd(20) + String(v).padStart(4) + ' 家');

/* ── 写回 ── */
j.companies = companies;
j.region_discipline = 'incorporation_region = 注册地（SEC 官方字段，可靠）；operating_region_manual = 运营区域（人工核对，须以 20-F 矿山章节为最终依据）。注册地 ≠ 运营地：大量矿企在加拿大/开曼/BVI 注册，矿山在非洲或拉美。';
j.region_note = '本轮修正：SEC 返回的注册地是英文（United Kingdom / British Columbia, Canada），此前映射表用中文键导致全部落到"待定"。';
writeFileSync(join(G, 'non-us-mining-companies.json'), JSON.stringify(j, null, 2), 'utf8');

/* ── CSV ── */
const csv = [['公司名', '注册地区域', '注册地(原文)', '运营区域(人工)', 'SEC行业', 'SIC', '申报类型', '命中文件', '最新申报', 'CIK', 'SEC核查'].join(',')];
for (const co of companies) {
  csv.push([
    '"' + co.name.replace(/"/g, '""') + '"', '"' + co.incorporation_region + '"', '"' + (co.incorporation || '') + '"',
    '"' + (co.operating_region_manual || '') + '"', '"' + (co.sic_desc || '') + '"', co.sic || '',
    co.forms.join('/'), co.filingCount, co.latest, co.cik, co.sec_url,
  ].join(','));
}
writeFileSync(join(G, 'non-us-mining-companies.csv'), csv.join('\n'), 'utf8');

console.log('\n  ✅ 已写回 non-us-mining-companies.json / .csv');
console.log('     ' + companies.length + ' 家非美国矿企 · ' + Object.keys(byRegion).length + ' 个注册地区域\n');
