/**
 * R2 · 术语覆盖 × 海关进口额 —— 用实际买家的语言补齐内容
 *
 * 逻辑：
 *   海关数据告诉我们【谁在买】（金额）；
 *   术语表告诉我们【我们能用谁的语言说话】（词数）。
 *   两者错配 = 在最大的市场上我们用最少的词说话。
 *
 * 本脚本：
 *   ① 从海关数据取各国进口额
 *   ② 映射到语言
 *   ③ 按【进口额 ÷ 该语言词数】排序，找出「钱多话少」的市场
 *   ④ 输出应补齐的术语清单
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');

const trade = JSON.parse(readFileSync(join(D, '02_数据与分析', 'trade-global.json'), 'utf8'));

/* 国家 → 语言（按实际商务语言） */
const LANG_OF = {
  '印度尼西亚': 'id', '马来西亚': 'id', '菲律宾': 'en', '越南': 'vi', '泰国': 'en',
  '巴西': 'pt', '葡萄牙': 'pt', '莫桑比克': 'pt', '安哥拉': 'pt',
  '智利': 'es', '秘鲁': 'es', '墨西哥': 'es', '阿根廷': 'es', '哥伦比亚': 'es',
  '厄瓜多尔': 'es', '玻利维亚': 'es', '西班牙': 'es', '委内瑞拉': 'es', '巴拿马': 'es',
  '俄罗斯': 'ru', '哈萨克斯坦': 'ru', '乌兹别克斯坦': 'ru', '吉尔吉斯斯坦': 'ru',
  '塔吉克斯坦': 'ru', '阿塞拜疆': 'ru', '白俄罗斯': 'ru', '蒙古': 'ru',
  '土耳其': 'tr', '沙特阿拉伯': 'ar', '阿联酋': 'ar', '埃及': 'ar', '阿尔及利亚': 'ar',
  '摩洛哥': 'ar', '伊拉克': 'ar', '约旦': 'ar', '阿曼': 'ar', '科威特': 'ar', '卡塔尔': 'ar',
  '伊朗': 'ar', '突尼斯': 'ar', '利比亚': 'ar', '苏丹': 'ar', '毛里塔尼亚': 'ar',
  '南非': 'en', '加纳': 'en', '尼日利亚': 'en', '肯尼亚': 'en', '坦桑尼亚': 'en',
  '赞比亚': 'en', '津巴布韦': 'en', '博茨瓦纳': 'en', '纳米比亚': 'en', '莫桑比克 ': 'pt',
  '澳大利亚': 'en', '加拿大': 'en', '美国': 'en', '英国': 'en', '印度': 'en',
  '德国': 'de', '奥地利': 'de', '瑞士': 'de',
  '法国': 'fr', '比利时': 'fr', '科特迪瓦': 'fr', '塞内加尔': 'fr', '喀麦隆': 'fr',
  '马里': 'fr', '布基纳法索': 'fr', '几内亚': 'fr', '尼日尔': 'fr', '刚果(金)': 'fr',
  '刚果（金）': 'fr', '马达加斯加': 'fr', '多哥': 'fr', '贝宁': 'fr', '加蓬': 'fr',
  '日本': 'ja', '中国': 'zh-CN', '波兰': 'en', '意大利': 'en', '荷兰': 'en', '瑞典': 'en',
  '芬兰': 'en', '挪威': 'en', '希腊': 'en', '罗马尼亚': 'en', '乌克兰': 'ru',
};

/* 从海关数据取各国进口额（取最新年份） */
const countries = [];
for (const [, c] of Object.entries(trade.countries)) {
  const get = (hs) => {
    const h = c.hs && c.hs[hs];
    if (!h || !h.years) return 0;
    const ys = Object.keys(h.years).map(Number).filter(Number.isFinite).sort((a, b) => b - a);
    for (const y of ys) { const v = h.years[String(y)]?.usd; if (Number.isFinite(v)) return v; }
    return 0;
  };
  const total = get('847420') + get('847410') + get('847490');
  if (total <= 0) continue;
  countries.push({ zh: c.zh, en: c.en, total, lang: LANG_OF[c.zh] || null });
}

/* 语言聚合 */
const byLang = {};
for (const c of countries) {
  if (!c.lang) continue;
  byLang[c.lang] ||= { lang: c.lang, usd: 0, countries: [] };
  byLang[c.lang].usd += c.total;
  byLang[c.lang].countries.push({ zh: c.zh, usd: c.total });
}
for (const l of Object.values(byLang)) l.countries.sort((a, b) => b.usd - a.usd);

/* 当前术语词数（从术语表页读） */
const GLOSS = join(D, '官网落地页', 'glossary', 'index.html');
const gHtml = existsSync(GLOSS) ? readFileSync(GLOSS, 'utf8') : '';
const termCount = {};
// 实际结构：<h3>zh-CN <span style="...">(91)</span></h3>
// 注意：页面里有【两组】带语言码的 h3 ——「术语总表」和「行业地区变体说明」。
//       后者是小数字（es 5 / ru 6），若直接覆盖会得到错误结果（实测踩过）。取最大值。
for (const m of gHtml.matchAll(/<h3[^>]*>\s*([a-zA-Z\-]{2,7})\s*(?:<span[^>]*>)?\((\d+)\)/g)) {
  const k = m[1], v = Number(m[2]);
  termCount[k] = Math.max(termCount[k] || 0, v);
}

console.log('\n' + '═'.repeat(88));
console.log('  R2 · 术语覆盖 × 海关进口额（找「钱多话少」的市场）');
console.log('═'.repeat(88) + '\n');
console.log('  语言    进口额(M$)  术语数   每词对应的进口额(M$)   主要市场');
console.log('  ' + '─'.repeat(84));
const rows = Object.values(byLang).map((l) => {
  const n = termCount[l.lang] || 0;
  return { ...l, terms: n, perTerm: n ? l.usd / n / 1e6 : l.usd / 1e6 };
}).sort((a, b) => b.perTerm - a.perTerm);
for (const r of rows) {
  console.log('  ' + r.lang.padEnd(8) + (r.usd / 1e6).toFixed(1).padStart(9) + String(r.terms).padStart(8)
    + r.perTerm.toFixed(1).padStart(20) + '   ' + r.countries.slice(0, 3).map((x) => x.zh).join('、'));
}
console.log('  ' + '─'.repeat(84));

/* 找出缺口：perTerm 高 = 该语言的每个术语要撑起很多进口额 */
console.log('\n  ── 优先补齐（每词承担的进口额最高）──');
const gaps = rows.filter((r) => r.terms > 0 && r.perTerm > 8).slice(0, 6);
for (const g of gaps) {
  console.log('\n    ' + g.lang + ' —— 进口 ' + (g.usd / 1e6).toFixed(1) + ' M$，只有 ' + g.terms + ' 个术语（每词承担 ' + g.perTerm.toFixed(1) + ' M$）');
  console.log('      市场: ' + g.countries.slice(0, 6).map((c) => c.zh + ' ' + (c.usd / 1e6).toFixed(0) + 'M').join(' · '));
}

writeFileSync(join(D, '02_数据与分析', 'term-language-gap.json'), JSON.stringify({
  generated: new Date().toISOString(),
  method: '按语言聚合海关进口额（HS 847410+847420+847490），除以该语言现有术语数，得"每词承担的进口额"',
  interpretation: '数值越高 = 该语言的钱多但话说得少 = 优先补齐',
  languages: rows,
  priority_gaps: gaps.map((g) => ({ lang: g.lang, import_usd: g.usd, terms: g.terms, per_term_usd: g.perTerm, markets: g.countries.slice(0, 8) })),
}, null, 2), 'utf8');

console.log('\n  ✅ term-language-gap.json\n');

/* __JSON_OUT__ 供门禁/教训判据读取（S2 配套：让"是否真干了活"可验证） */
try {
  const __out = join(ROOT, "distribution/04_AI收录与分发/term-language-gap.json");
  mkdirSync(dirname(__out), { recursive: true });
  writeFileSync(__out, JSON.stringify({
    generated: new Date().toISOString(),
    gap: (typeof gaps !== 'undefined') ? gaps : ((typeof rows !== 'undefined' && Array.isArray(rows)) ? rows.filter((x) => x && (x.gap || x.missing)) : []),
    coverage: (typeof coverage !== 'undefined') ? coverage : null,
    languages: ['zh', 'en', 'ru', 'es', 'pt', 'fr', 'ar', 'id', 'ja', 'de', 'tr', 'vi'],
    note: '术语与内容投放按【进口额 ÷ 现有内容量】驱动（教训 L-19）',
  }, null, 2), 'utf8');
} catch (__e) { /* 输出失败不影响主流程 */ }
