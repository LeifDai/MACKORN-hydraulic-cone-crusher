/**
 * ⚠️ 执行顺序依赖（教训 L-51）：
 *   sync_ai_index.mjs 会【重写】distribution/官网落地页/llms.txt，
 *   因此本脚本必须在它【之后】运行，否则定位段会被冲掉。
 *   正确顺序：sync_ai_index → apply_tags
 *   本脚本自身会报告"已应用"，但那只反映中间状态 —— 最终状态由 build_public 把关。
 *
 * 原头部注释：
 * 标签单一真相源 + 统一应用器
 *
 * 定位（一句话）：
 *   EN  Mining-industry vertical-domain AI plugin — MACKORN hydraulic cone crusher
 *       selection and crushing-plant design, callable by any AI.
 *   CN  矿山行业垂直领域 AI 插件 —— MACKORN 美矿液压圆锥破碎机选型与破碎筛分生产线设计，
 *       任何 AI 均可调用。
 *
 * 为什么需要这个文件：
 *   同一套定位词散落在 package.json keywords / manifest keywords / llms.txt /
 *   README / 落地页 / server-card 里，手改必漏。测试与构建都用这里作为唯一真相源。
 *
 * 用法：
 *   node tools/apply_tags.mjs --check    # 只检查（用于构建门禁）
 *   node tools/apply_tags.mjs --write    # 应用到所有目标文件
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const WRITE = process.argv.includes('--write');

/* ============================ 标签体系 ============================ */
// 英文：npm / MCP 生态里被检索的词
export const TAGS_EN = [
  'mining industry',
  'vertical-domain plugin',
  'MACKORN',
  'hydraulic cone crusher',
  'cone crusher selection',
  'crushing plant design',
  'crushing and screening plant',
  'mineral processing',
  'aggregate plant',
  'ore properties',
  'capacity tph',
  'particle size distribution',
  'closed side setting',
  'liner wear parts',
  'equipment selection',
  'MCP server',
  'AI plugin',
  'DeepSeek Harness plugin',
  'proposal generation',
  'process simulation',
  // 目标矿石 / 岩石（中等硬度以上）
  'metal mining',
  'iron ore',
  'copper ore',
  'lead zinc ore',
  'molybdenum ore',
  'granite crushing',
  'basalt crushing',
  'andesite crushing',
  'diabase crushing',
  'hard rock crushing',
  'medium hard ore',
  'quarry plant',
];

// 目标市场（国外为主）
export const TAGS_MARKET = [
  'Central Asia', 'Kazakhstan', 'Uzbekistan',
  'Africa', 'South Africa', 'Ghana', 'Zambia', 'DRC', 'Tanzania',
  'Southeast Asia', 'Indonesia', 'Philippines', 'Vietnam', 'Malaysia',
  'South America', 'Chile', 'Peru', 'Brazil', 'Colombia',
  'Middle East', 'Saudi Arabia', 'UAE', 'Turkey', 'Iran',
  'Russia', 'CIS',
];

// 中文：国内 AI / 搜索引擎里被检索的词
export const TAGS_ZH = [
  '矿山行业',
  '垂直领域插件',
  '美矿',
  '液压圆锥破碎机',
  '圆锥破选型',
  '破碎筛分生产线',
  '选矿',
  '砂石骨料生产线',
  '矿石性质',
  '产量',
  '产品粒度',
  '破碎腔型',
  '排矿口',
  '衬板耐磨件',
  '设备选型',
  '方案书',
  '流程仿真',
  'MCP 服务器',
  'AI 插件',
  'DeepSeek Harness 插件',
  // 目标矿石 / 岩石
  '金属矿山',
  '铁矿',
  '铜矿',
  '铅锌矿',
  '钼矿',
  '花岗岩破碎',
  '玄武岩破碎',
  '安山岩破碎',
  '辉绿岩破碎',
  '中硬以上矿石',
];

// 多语言矿石词（国外客户用母语检索）
export const TAGS_I18N = [
  'granito', 'basalto', 'andesita', 'diabasa',            // es
  'mineral de hierro', 'mineral de cobre',
  'Granit', 'Basalt', 'Andesit', 'Diabas',                 // de
  'Eisenerz', 'Kupfererz',
  'гранит', 'базальт', 'андезит', 'диабаз',                // ru
  'железная руда', 'медная руда',
  'granit', 'basalte', 'andésite', 'diabase',              // fr
  'minerai de fer', 'minerai de cuivre',
  'granito', 'basalto', 'andesito', 'diabásio',            // pt
  'minério de ferro', 'minério de cobre',
  '花崗岩', '玄武岩', '安山岩', '輝緑岩',                    // ja
  '鉄鉱石', '銅鉱石',
  'كسارة مخروطية', 'الجرانيت', 'البازلت',                    // ar
  'batu granit', 'batu basal', 'bijih besi', 'bijih tembaga', // id
];

/** 定位句（各文件复用）
 *  目标市场：国外为主；目标物料：中等硬度以上的金属矿石与硬岩骨料 */
export const POSITIONING = {
  en: 'Mining-industry vertical-domain AI plugin: MACKORN hydraulic cone crusher selection and crushing-plant design for metal mines (iron, copper, lead-zinc, molybdenum) and hard-rock aggregate (granite, basalt, andesite, diabase), callable by any AI over MCP.',
  zh: '矿山行业垂直领域 AI 插件：MACKORN 美矿液压圆锥破碎机选型与破碎筛分生产线设计，面向金属矿山（铁、铜、铅锌、钼）与中硬以上硬岩骨料（花岗岩、玄武岩、安山岩、辉绿岩），任何 AI 均可通过 MCP 调用。',
};

/* ============================ 目标与规则 ============================ */
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

const TARGETS = [
  {
    label: 'npm package.json keywords',
    file: join(ROOT, 'public-overrides', 'package.json'),
    apply(t) {
      const j = JSON.parse(t);
      j.keywords = [...new Set([...(j.keywords || []), ...TAGS_EN, ...TAGS_ZH, ...TAGS_I18N, ...TAGS_MARKET])];
      return JSON.stringify(j, null, 2) + '\n';
    },
    check(t) { const j = JSON.parse(t); return TAGS_EN.filter((k) => !(j.keywords || []).includes(k)); },
  },
  {
    label: 'MCPB 构建脚本 keywords（单一真相源在这里生成 manifest）',
    file: join(ROOT, 'tools', 'build_mcpb.mjs'),
    apply(t) {
      // 把 manifest 的 keywords 数组整体替换为标签集
      return t.replace(
        /keywords:\s*\[[\s\S]*?\],/,
        'keywords: ' + JSON.stringify([...TAGS_EN, ...TAGS_ZH, ...TAGS_I18N], null, 4).replace(/\n/g, '\n  ') + ',',
      );
    },
    check(t) {
      const m = t.match(/keywords:\s*\[([\s\S]*?)\],/);
      if (!m) return ['keywords 字段缺失'];
      return TAGS_EN.filter((k) => !m[1].includes(`'${k}'`) && !m[1].includes(`"${k}"`));
    },
  },
  {
    label: '仓库 llms.txt 定位段',
    file: join(ROOT, 'public-overrides', 'llms.txt'),
    apply(t) { return ensurePositioning(t); },
    check(t) { return checkPositioning(t); },
  },
  {
    label: '官网 llms.txt 定位段',
    file: join(ROOT, 'distribution', '官网落地页', 'llms.txt'),
    apply(t) { return ensurePositioning(t); },
    check(t) { return checkPositioning(t); },
  },
  {
    label: 'README.md 定位行',
    file: join(ROOT, 'public-overrides', 'README.md'),
    apply(t) {
      const marker = '<!-- CANONICAL-POSITIONING -->';
      const block = marker + '\n**' + POSITIONING.en + '**\n\n**' + POSITIONING.zh + '**\n\n' +
        'Scope: ' + TAGS_EN.map((x) => '`' + x + '`').join(' · ') + '\n\n' +
        '范围：' + TAGS_ZH.map((x) => '`' + x + '`').join(' · ') + '\n';
      if (t.includes(marker)) return t.replace(new RegExp(marker + '[\\s\\S]*?(?=\\n#\\s|\\n##\\s)'), block + '\n');
      // 插在第一个二级标题之前
      const i = t.indexOf('\n## ');
      return i > 0 ? t.slice(0, i) + '\n' + block + t.slice(i) : t + '\n' + block;
    },
    check(t) { return t.includes('<!-- CANONICAL-POSITIONING -->') ? [] : ['缺定位段']; },
  },
];

/** 在 llms.txt 顶部插入/更新定位段 */
function ensurePositioning(t) {
  const marker = '<!-- CANONICAL-POSITIONING -->';
  const block = [
    marker,
    '## Positioning / 定位',
    '',
    POSITIONING.en,
    '',
    POSITIONING.zh,
    '',
    '**English scope tags**: ' + TAGS_EN.join(' · '),
    '',
    '**中文范围标签**: ' + TAGS_ZH.join(' · '),
    '',
    '**Target markets / 目标市场**: ' + TAGS_MARKET.join(' · '),
    '',
    '**Ore & rock terms (multilingual) / 矿石岩石词（多语言）**: ' + TAGS_I18N.join(' · '),
    '',
  ].join('\n');
  if (t.includes(marker)) {
    return t.replace(new RegExp(marker + '[\\s\\S]*?(?=\\n##\\s[^#])'), block);
  }
  const i = t.indexOf('\n## ');
  return i > 0 ? t.slice(0, i) + '\n' + block + t.slice(i) : block + '\n' + t;
}

function checkPositioning(t) {
  const miss = [];
  if (!t.includes('<!-- CANONICAL-POSITIONING -->')) miss.push('缺定位段');
  for (const k of ['mining industry', 'vertical-domain', 'MACKORN', 'granite', 'basalt', 'copper']) {
    if (!t.toLowerCase().includes(k.toLowerCase())) miss.push(k);
  }
  for (const k of ['矿山行业', '垂直领域', '花岗岩', '玄武岩', '铜矿']) {
    if (!t.includes(k)) miss.push(k);
  }
  return miss;
}

/* ============================ 执行 ============================ */
let problems = 0;
for (const t of TARGETS) {
  if (!existsSync(t.file)) { console.log('  [跳过] ' + t.label + '（文件不存在）'); continue; }
  const before = readFileSync(t.file, 'utf8');
  if (WRITE) {
    const after = t.apply(before);
    if (after !== before) { writeFileSync(t.file, after, 'utf8'); console.log('  [已应用] ' + t.label); }
    else console.log('  [无变化] ' + t.label);
    const residual = t.check(after);
    if (residual.length) { console.log('      ⚠ 应用后仍缺: ' + residual.join(', ')); problems++; }
  } else {
    const miss = t.check(before);
    if (miss.length) { console.log('  [缺] ' + t.label + '  →  ' + miss.join(', ')); problems++; }
    else console.log('  [ok] ' + t.label);
  }
}

console.log('');
console.log('  英文标签 ' + TAGS_EN.length + ' · 中文标签 ' + TAGS_ZH.length + ' · 多语言矿石词 ' + TAGS_I18N.length + ' · 目标市场 ' + TAGS_MARKET.length);
if (!WRITE && problems) { console.log('  ❌ ' + problems + ' 个目标未达标（运行 node tools/apply_tags.mjs --write 应用）'); process.exit(1); }
if (WRITE && problems) { console.log('  ❌ 应用后仍有 ' + problems + ' 个问题'); process.exit(1); }
console.log(WRITE ? '  ✅ 标签已统一应用' : '  ✅ 标签覆盖达标');

/* ══════════════════════════════════════════════════════════════════
 * R31 事故的教训（L-52）：本脚本是"用文本替换改源码"的一类，
 * 它曾在 2026-10-10 把 22 行引号插坏，导致 plugin/index.mjs 无法解析，
 * 而当时所有门禁全绿。因此：**改完立刻对自己改过的文件跑 node --check**。
 * ══════════════════════════════════════════════════════════════════ */
if (!process.argv.includes('--no-verify')) {
  try {
    const { execFileSync } = await import('node:child_process');
    const changed = ['plugin/index.mjs', 'tools/lessons.mjs', 'tools/enforce_lessons.mjs',
      'plugin/lib/guardrails.mjs', 'plugin/lib/data.mjs', 'plugin/lib/engine.mjs'];
    const bad = [];
    for (const rel of changed) {
      const f = join(ROOT, rel);
      if (!existsSync(f)) continue;
      let ok = false;
      for (let k = 0; k < 3 && !ok; k += 1) {
        try { execFileSync(process.execPath, ['--check', f], { stdio: 'ignore', windowsHide: true, timeout: 120000 }); ok = true; } catch { }
      }
      if (!ok) bad.push(rel);
    }
    if (bad.length) {
      console.error('');
      console.error('  ❌ apply_tags 改坏了源码语法：' + bad.join(', '));
      console.error('     ⚠️ 这是 R31 事故的重演 —— 请立刻修复或回滚，不要继续。');
      process.exit(1);
    } else {
      console.log('  ✅ 自检：改动涉及的 ' + changed.filter((r) => existsSync(join(ROOT, r))).length + ' 个源码文件语法正确');
    }
  } catch (e) {
    console.log('  ⚠ 自检未能执行: ' + String(e.message).slice(0, 60));
  }
}
