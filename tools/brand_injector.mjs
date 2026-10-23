/**
 * 品牌信息注入器（R167）
 *
 * 用户要求（2026-10-24）：
 *   「把 MACKORN 美矿的 logo，联系人，地址，电话，邮件，带到各个平台」
 *
 * ★ 实测缺口（2026-10-24）：
 *   AGENTS.md       logo❌ phone❌ email❌ address❌   ← 给 AI 看的核心文件完全没有
 *   QUICKSTART.md   logo❌ phone✅ email✅ address❌
 *   llms.txt        logo❌ phone✅ email✅ address✅
 *   README.md       logo❌ phone✅ email✅ address✅
 *   package.json    logo❌ phone❌ email❌ address❌
 *   server.json     logo❌ phone❌ email❌ address❌
 *
 * ★ 为什么会有这个缺口
 *   品牌信息散落在多个文件、每次手写 → 必然有漏。
 *   修法：单一真源（data-brand.mjs）+ 注入器（本文件）+ 门禁（G23）。
 *
 * ★ 注入策略（按文件类型不同）
 *   · .md 末尾追加「联系我们」块（可重复运行，幂等）
 *   · .json 补 author/contact/logo 字段
 *   · llms.txt 补品牌段
 *
 * ★ 幂等保证
 *   用标记 `<!-- MACKORN-BRAND-BLOCK -->` 识别已注入的块，重复运行不会重复插入。
 *
 * 用法：
 *   node tools/brand_injector.mjs              # 干跑（显示会改什么）
 *   node tools/brand_injector.mjs --write      # 真写
 *   node tools/brand_injector.mjs --check      # 只检查覆盖率（门禁用）
 *   node tools/brand_injector.mjs --json       # 覆盖率 JSON
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

/* 加载品牌数据 */
const { BRAND, toMarkdownContact, toOneLiner, toJsonLd } = await import(
  pathToFileURL(join(ROOT, 'plugin', 'lib', 'data-brand.mjs')).href
);

const MARK = '<!-- MACKORN-BRAND-BLOCK -->';
const MARK_END = '<!-- /MACKORN-BRAND-BLOCK -->';

/* ══════════════════════════════════════════════════════════════
 * 需要注入的文件清单
 * ══════════════════════════════════════════════════════════════ */
const MD_TARGETS = [
  'AGENTS.md',
  'QUICKSTART.md',
  'README.md',
  'CONTRIBUTING.md',
];

/* 只检查域名、不注入联系块（因为格式特殊） */
const SPECIAL_TARGETS = [
  { file: 'llms.txt', need: ['brand', 'contact', 'address', 'site'] },
  { file: 'package.json', need: ['author', 'repository', 'homepage'] },
  { file: 'server.json', need: ['repository'] },
];

/* ══════════════════════════════════════════════════════════════
 * 检查一个文件里品牌信息的覆盖情况
 * ══════════════════════════════════════════════════════════════ */
function checkCoverage(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return { file: rel, exists: false, coverage: null };
  const t = readFileSync(p, 'utf8');
  const c = {
    logo: /logo|LOGO_SVG|logo-\d+\.png|logo\.svg/i.test(t),
    phone: /\+86\s*139\s*1648\s*5025|\+86\s*134\s*8218\s*0158|\+86\s*158\s*0189\s*1052/.test(t),
    email: /@mackorn\.cn/.test(t),
    address: /浏河|钱江路|Liuhe|Qianjiang/i.test(t),
    site: /mackorn\.cn/i.test(t),
    company: /上海美矿|Mackorn Minerals|美矿机械/i.test(t),
  };
  const score = Object.values(c).filter(Boolean).length;
  return { file: rel, exists: true, coverage: c, score, total: 6 };
}

/* ══════════════════════════════════════════════════════════════
 * 生成品牌块
 * ══════════════════════════════════════════════════════════════ */
function buildBrandBlock(lang = 'zh') {
  const L = [];
  L.push('');
  L.push(MARK);
  L.push('');
  L.push('## 🏭 ' + (lang === 'en' ? 'About MACKORN' : '关于 MACKORN 美矿'));
  L.push('');
  if (lang === 'en') {
    L.push('**' + BRAND.brand_en + '** — ' + BRAND.positioning_en);
  } else {
    L.push('**' + BRAND.brand_full + '** — ' + BRAND.positioning_zh);
  }
  L.push('');
  /* Logo */
  L.push('![MACKORN 美矿](' + BRAND.logo.png_url + ')');
  L.push('');
  /* 联系表 */
  L.push(toMarkdownContact(lang));
  L.push('');
  L.push(MARK_END);
  L.push('');
  return L.join('\n');
}

/* ══════════════════════════════════════════════════════════════
 * 注入（幂等）
 * ══════════════════════════════════════════════════════════════ */
function injectMarkdown(rel, write) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return { file: rel, action: 'skip', reason: '文件不存在' };
  let t = readFileSync(p, 'utf8');

  /* 已注入 → 替换那一块 */
  const startIdx = t.indexOf(MARK);
  if (startIdx >= 0) {
    const endIdx = t.indexOf(MARK_END);
    if (endIdx > startIdx) {
      const before = t.slice(0, startIdx);
      const after = t.slice(endIdx + MARK_END.length);
      const block = buildBrandBlock('zh');
      const updated = before + block.trimStart() + after;
      if (updated === t) return { file: rel, action: 'no-change', reason: '已是最新' };
      if (write) writeFileSync(p, updated, 'utf8');
      return { file: rel, action: 'update', reason: '替换已有的品牌块' };
    }
  }

  /* 未注入 → 追加到末尾 */
  const block = buildBrandBlock('zh');
  const updated = t.replace(/\s*$/, '') + '\n' + block;
  if (write) writeFileSync(p, updated, 'utf8');
  return { file: rel, action: 'append', reason: '追加品牌块（' + (updated.length - t.length) + ' 字符）' };
}

/* ══════════════════════════════════════════════════════════════
 * JSON 文件的特殊处理
 * ══════════════════════════════════════════════════════════════ */
function injectJson(rel, write) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return { file: rel, action: 'skip', reason: '文件不存在' };
  let j;
  try { j = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { return { file: rel, action: 'error', reason: 'JSON 解析失败' }; }
  const before = JSON.stringify(j);
  let changed = [];

  if (rel === 'package.json') {
    /* author 字段 */
    if (typeof j.author !== 'object' || !j.author.email) {
      j.author = {
        name: BRAND.company_name_en,
        email: BRAND.contacts[1].email,
        url: BRAND.site,
      };
      changed.push('author');
    }
    /* contributors */
    if (!j.contributors) {
      j.contributors = BRAND.contacts.map((c) => ({
        name: c.name, email: c.email, url: BRAND.site,
      }));
      changed.push('contributors');
    }
    /* funding / homepage */
    if (!j.homepage) { j.homepage = BRAND.site_ai; changed.push('homepage'); }
    /* bugs */
    if (!j.bugs) { j.bugs = { url: BRAND.repo + '/issues' }; changed.push('bugs'); }
    /* mackorn 品牌块 */
    j.mackorn = j.mackorn || {};
    if (!j.mackorn.brand) {
      j.mackorn.brand = {
        name_zh: BRAND.brand_full,
        company_zh: BRAND.company_name_zh,
        company_en: BRAND.company_name_en,
        logo: BRAND.logo.png_url,
        address_zh: BRAND.address_zh,
        address_en: BRAND.address_en,
        site: BRAND.site_ai,
        contacts: BRAND.contacts.map((c) => ({
          role: c.role_zh, name: c.name, email: c.email, phone: c.phone,
        })),
      };
      changed.push('mackorn.brand');
    }
  }

  if (rel === 'server.json') {
    /* MCP Registry 的 server.json 有固定 schema，只能补兼容字段 */
    if (!j.repository) { j.repository = { url: BRAND.repo, source: 'github' }; changed.push('repository'); }
    if (!j.homepage) { j.homepage = BRAND.site_ai; changed.push('homepage'); }
  }

  if (JSON.stringify(j) === before) return { file: rel, action: 'no-change', reason: '字段已齐' };
  if (write) writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
  return { file: rel, action: 'update', reason: '补字段: ' + changed.join(', ') };
}

/* ══════════════════════════════════════════════════════════════
 * llms.txt 特殊处理：确保有品牌段
 * ══════════════════════════════════════════════════════════════ */
function injectLlms(write) {
  const p = join(ROOT, 'llms.txt');
  if (!existsSync(p)) return { file: 'llms.txt', action: 'skip', reason: '文件不存在' };
  let t = readFileSync(p, 'utf8');
  const before = t;

  /* 检查是否已有完整品牌段 */
  const hasAll = /Mackorn Minerals/i.test(t) && /@mackorn\.cn/.test(t) && /浏河|Liuhe/i.test(t) && /logo/i.test(t);
  if (hasAll) return { file: 'llms.txt', action: 'no-change', reason: '品牌信息已齐' };

  /* 在文件开头插入品牌段（llms.txt 规范：开头是最重要的上下文） */
  const L = [];
  L.push('# ' + BRAND.brand_full + ' / ' + BRAND.brand_en);
  L.push('');
  L.push('> ' + toOneLiner('zh'));
  L.push('>');
  L.push('> ' + toOneLiner('en'));
  L.push('>');
  L.push('> Logo: ' + BRAND.logo.png_url);
  L.push('> Address: ' + BRAND.address_zh + ' / ' + BRAND.address_en);
  for (const c of BRAND.contacts) {
    L.push('> ' + c.role_zh + '/ ' + c.role_en + ': ' + c.name + ' · ' + c.email + ' · ' + c.phone);
  }
  L.push('');
  /* 去掉原有的一级标题（避免重复） */
  t = t.replace(/^#[^\n]*\n+/, '');
  t = L.join('\n') + t;
  if (write) writeFileSync(p, t, 'utf8');
  return { file: 'llms.txt', action: 'update', reason: '加品牌段（' + (t.length - before.length) + ' 字符）' };
}

/* ══════════════════════════════════════════════════════════════
 * --json  覆盖率报告（门禁用）
 * ══════════════════════════════════════════════════════════════ */
if (has('--json')) {
  const allFiles = [...MD_TARGETS, ...SPECIAL_TARGETS.map((x) => x.file)];
  const results = allFiles.map(checkCoverage);
  const existing = results.filter((r) => r.exists);
  const full = existing.filter((r) => r.score === r.total);
  console.log(JSON.stringify({
    schema: 'mackorn-brand-coverage/1',
    at: new Date().toISOString(),
    files_checked: existing.length,
    files_full_coverage: full.length,
    coverage_pct: existing.length ? Number((full.length / existing.length * 100).toFixed(1)) : 0,
    results,
  }, null, 2));
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --check  只检查（门禁用）
 * ══════════════════════════════════════════════════════════════ */
if (has('--check')) {
  const allFiles = [...MD_TARGETS, ...SPECIAL_TARGETS.map((x) => x.file)];
  const results = allFiles.map(checkCoverage);
  const existing = results.filter((r) => r.exists);
  const notFull = existing.filter((r) => r.score < r.total);
  console.log('');
  console.log('  ══ 品牌信息覆盖率检查 ══');
  console.log('');
  console.log('  检查 ' + existing.length + ' 个对外文件（logo/phone/email/address/site/company）');
  console.log('');
  for (const r of existing) {
    const c = r.coverage;
    const mark = r.score === r.total ? '✅' : '⚠️';
    console.log('  ' + mark + ' ' + r.file.padEnd(18) + r.score + '/' + r.total + '  '
      + ['logo', 'phone', 'email', 'address', 'site', 'company'].map((k, i) => (Object.values(c)[i] ? '●' : '○')).join(''));
  }
  console.log('');
  console.log('  ' + (existing.length - notFull.length) + '/' + existing.length + ' 完整'
    + ' · ' + (existing.length ? (notFull.length ? '需补 ' + notFull.length + ' 个' : '全覆盖 ✅') : ''));
  if (notFull.length) {
    console.log('');
    console.log('  跑 node tools/brand_injector.mjs --write 自动补齐');
    console.log('');
    process.exit(1);
  }
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * 主流程：干跑 or 真写
 * ══════════════════════════════════════════════════════════════ */
const write = has('--write');
console.log('');
console.log('  ══ 品牌信息注入器 ══');
console.log('  模式：' + (write ? '真写' : '干跑（加 --write 才真改）'));
console.log('');
console.log('  品牌：' + BRAND.brand_full + ' · ' + BRAND.company_name_en);
console.log('  联系人：' + BRAND.contacts.length + ' 人 · Logo：' + BRAND.logo.png_url);
console.log('');
console.log('  ── Markdown 文件 ──');
const mdResults = [];
for (const rel of MD_TARGETS) {
  const r = injectMarkdown(rel, write);
  mdResults.push(r);
  const icon = r.action === 'append' ? '➕' : r.action === 'update' ? '🔄' : r.action === 'no-change' ? '✅' : '○';
  console.log('  ' + icon + ' ' + rel.padEnd(18) + r.action + ' — ' + r.reason);
}
console.log('');
console.log('  ── JSON 文件 ──');
for (const rel of ['package.json', 'server.json']) {
  const r = injectJson(rel, write);
  const icon = r.action === 'update' ? '🔄' : r.action === 'no-change' ? '✅' : '○';
  console.log('  ' + icon + ' ' + rel.padEnd(18) + r.action + ' — ' + r.reason);
}
console.log('');
console.log('  ── llms.txt ──');
const lr = injectLlms(write);
console.log('  ' + (lr.action === 'update' ? '🔄' : '✅') + ' llms.txt          ' + lr.action + ' — ' + lr.reason);
console.log('');

/* 覆盖率复查 */
const allFiles = [...MD_TARGETS, ...SPECIAL_TARGETS.map((x) => x.file)];
const after = allFiles.map(checkCoverage).filter((r) => r.exists);
const full = after.filter((r) => r.score === r.total);
console.log('  ── 注入后覆盖率 ──');
console.log('  ' + full.length + '/' + after.length + ' 完整'
  + (after.length ? '（' + Math.round(full.length / after.length * 100) + '%）' : ''));
if (!write) {
  console.log('');
  console.log('  这是干跑。加 --write 真正写入。');
}
console.log('');
