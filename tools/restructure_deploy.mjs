/**
 * 部署包结构重构 —— 根目录最小化
 *
 * IT 经理的意见（完全正确）：
 *   "全部代码不要放在网站根目录，全部代码放到 ai 的子目录里；
 *    目录越来越多，搞不好会和现有的重复；根目录下面的内容越少越好"
 *
 * 重构规则：
 *   根目录【只保留标准强制的】：
 *     /robots.txt          搜索引擎标准，必须在根
 *     /sitemap.xml         搜索引擎标准，必须在根
 *     /llms.txt            llms.txt 标准，必须在根
 *     /ai.txt              ai.txt 标准，必须在根
 *     /.well-known/*       RFC 8615 标准，必须在根
 *     /<indexnow-key>.txt  IndexNow 协议要求根目录
 *
 *   其余【全部移进 /ai/】：
 *     /glossary/           → /ai/glossary/
 *     /markets/            → /ai/markets/
 *     /distributors/       → /ai/distributors/
 *     /engineering-firms/  → /ai/engineering-firms/
 *     /contact/            → /ai/contact/
 *     /en/ /ru/ /es/ ...   → /ai/en/ /ai/ru/ ...
 *     /api/                → /ai/api/
 *     二维码 png/svg        → /ai/qr/
 *     /CLAUDE.md           → /ai/CLAUDE.md
 *     /llms-full.txt       → /ai/llms-full.txt（根 llms.txt 里加指针）
 *
 *   已发布路径【保留 301 跳转】，避免已收录的 URL 断掉。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, cpSync, rmSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'distribution', '官网落地页');
const STAGE = join(ROOT, 'distribution', '_deploy');

/* ── 移动映射：旧路径 → 新路径 ── */
const MOVE_DIRS = [
  ['glossary', 'ai/glossary'],
  ['markets', 'ai/markets'],
  ['distributors', 'ai/distributors'],
  ['engineering-firms', 'ai/engineering-firms'],
  ['contact', 'ai/contact'],
  ['api', 'ai/api'],
  ['en', 'ai/en'], ['ru', 'ai/ru'], ['es', 'ai/es'], ['pt', 'ai/pt'],
  ['fr', 'ai/fr'], ['ar', 'ai/ar'], ['id', 'ai/id'], ['ja', 'ai/ja'],
  ['de', 'ai/de'], ['tr', 'ai/tr'], ['vi', 'ai/vi'],
];
const MOVE_FILES = [
  ['llms-full.txt', 'ai/llms-full.txt'],
  ['CLAUDE.md', 'ai/CLAUDE.md'],
];
const QR_FILES = ['ai-qr.svg', 'ai-qr.png', 'contact-qr.svg', 'contact-qr.png',
  'distributors-qr.svg', 'distributors-qr.png'];

/* 根目录必须保留的 */
const ROOT_KEEP = new Set(['robots.txt', 'sitemap.xml', 'llms.txt', 'ai.txt', 'htaccess-建议.txt']);
const ROOT_KEEP_DIRS = new Set(['.well-known', 'ai']);

console.log('\n  ── 部署包结构重构 ──\n');

/* ── 清空并重建 stage ── */
if (existsSync(STAGE)) rmSync(STAGE, { recursive: true, force: true });
if (existsSync(STAGE)) {
  // 清空失败会导致旧文件残留 → 构建产物与源不一致（曾导致 _deploy 里的 mcp.php 是旧版）
  console.error('  ❌ _deploy 清空失败，可能被占用。请关闭占用进程后重试。');
  process.exit(1);
}
mkdirSync(STAGE, { recursive: true });

const log = [];
function put(rel, srcFile) {
  const dst = join(STAGE, rel);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(srcFile, dst);
  log.push(rel);
}

/* ── 1. 根目录必须保留的文件 ── */
for (const f of ROOT_KEEP) {
  const p = join(SRC, f);
  if (existsSync(p)) put(f, p);
}
/* IndexNow 密钥（32 位十六进制文件名） */
for (const f of readdirSync(SRC)) {
  if (/^[0-9a-f]{32}\.txt$/.test(f)) put(f, join(SRC, f));
}
/* .well-known 整个目录（标准要求根） */
{
  const wk = join(SRC, '.well-known');
  if (existsSync(wk)) {
    const walk = (d, depth = 0) => {
      if (depth > 3) return;
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p, depth + 1);
        else put(relative(SRC, p).replace(/\\/g, '/'), p);
      }
    };
    walk(wk);
  }
}

/* ── 1b. 中文主页：源在根，但要放到 /ai/index.html（绝不覆盖站点根首页）── */
{
  const rootIdx = join(SRC, 'index.html');
  if (existsSync(rootIdx)) put('ai/index.html', rootIdx);
}

/* ── 2. ai/ 下已有的页面（本来就在 ai/） ── */
{
  const aiDir = join(SRC, 'ai');
  const walk = (d, depth = 0) => {
    if (depth > 4) return;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p, depth + 1);
      else {
        const rel = relative(SRC, p).replace(/\\/g, '/');
        // 跳过要单独移动的
        if (rel === 'ai/llms-full.txt' || rel === 'ai/CLAUDE.md') continue;
        put(rel, p);
      }
    }
  };
  walk(aiDir);
}

/* ── 3. 移进 ai/ 的目录 ── */
for (const [from, to] of MOVE_DIRS) {
  const src = join(SRC, from);
  if (!existsSync(src)) continue;
  const walk = (d, depth = 0) => {
    if (depth > 4) return;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p, depth + 1);
      else {
        const rel = relative(src, p).replace(/\\/g, '/');
        put(to + '/' + rel, p);
      }
    }
  };
  walk(src);
}

/* ── 4. 移进 ai/ 的文件 + 二维码归到 ai/qr/ ── */
for (const [from, to] of MOVE_FILES) {
  const p = join(SRC, from);
  if (existsSync(p)) put(to, p);
}
for (const f of QR_FILES) {
  const p = join(SRC, f);
  if (existsSync(p)) put('ai/qr/' + f, p);
}
/* wechat-qr.jpg 已在 ai/ 下，走第 2 步已包含 */

console.log('  入包 ' + log.length + ' 个文件');
console.log('\n  根目录内容：');
const rootFiles = log.filter((r) => !r.includes('/'));
for (const f of rootFiles.sort()) console.log('    ' + f);
const rootDirs = [...new Set(log.filter((r) => r.includes('/')).map((r) => r.split('/')[0]))];
console.log('  根目录子目录：' + rootDirs.join(', '));

/* ══════════════════════════════════════════════════════════
 * 5. 内部链接改写：/glossary/ → /ai/glossary/ 等
 * ══════════════════════════════════════════════════════════ */
const LINK_MAP = [
  ['"/glossary/', '"/ai/glossary/'],
  ["'/glossary/", "'/ai/glossary/"],
  ['https://mackorn.cn/glossary/', 'https://mackorn.cn/ai/glossary/'],
  ['"/markets/', '"/ai/markets/'],
  ['https://mackorn.cn/markets/', 'https://mackorn.cn/ai/markets/'],
  ['"/distributors/', '"/ai/distributors/'],
  ['https://mackorn.cn/distributors/', 'https://mackorn.cn/ai/distributors/'],
  ['"/engineering-firms/', '"/ai/engineering-firms/'],
  ['https://mackorn.cn/engineering-firms/', 'https://mackorn.cn/ai/engineering-firms/'],
  ['"/contact/', '"/ai/contact/'],
  ['https://mackorn.cn/contact/', 'https://mackorn.cn/ai/contact/'],
  ['https://mackorn.cn/api/mcp.php', 'https://mackorn.cn/ai/api/mcp.php'],
  ['/api/mcp.php', '/ai/api/mcp.php'],
  ['https://mackorn.cn/llms-full.txt', 'https://mackorn.cn/ai/llms-full.txt'],
  ['https://mackorn.cn/CLAUDE.md', 'https://mackorn.cn/ai/CLAUDE.md'],
  ['"/en/', '"/ai/en/'], ['"/ru/', '"/ai/ru/'], ['"/es/', '"/ai/es/'],
  ['"/pt/', '"/ai/pt/'], ['"/fr/', '"/ai/fr/'], ['"/ar/', '"/ai/ar/'],
  ['"/id/', '"/ai/id/'], ['"/ja/', '"/ai/ja/'], ['"/de/', '"/ai/de/'],
  ['"/tr/', '"/ai/tr/'], ['"/vi/', '"/ai/vi/'],
  ['https://mackorn.cn/en/', 'https://mackorn.cn/ai/en/'],
  ['https://mackorn.cn/ru/', 'https://mackorn.cn/ai/ru/'],
  ['https://mackorn.cn/es/', 'https://mackorn.cn/ai/es/'],
  ['https://mackorn.cn/de/', 'https://mackorn.cn/ai/de/'],
  ['ai-qr.svg', 'ai/qr/ai-qr.svg'], ['ai-qr.png', 'ai/qr/ai-qr.png'],
  ['contact-qr.svg', 'ai/qr/contact-qr.svg'], ['contact-qr.png', 'ai/qr/contact-qr.png'],
  ['distributors-qr.svg', 'ai/qr/distributors-qr.svg'], ['distributors-qr.png', 'ai/qr/distributors-qr.png'],
];
let rewritten = 0, filesTouched = 0;
for (const rel of log) {
  if (!/\.(html|txt|json|xml|md|cff|php)$/i.test(rel)) continue;
  const p = join(STAGE, rel);
  let c = readFileSync(p, 'utf8');
  const o = c;
  for (const [a, b] of LINK_MAP) c = c.split(a).join(b);
  if (c !== o) { writeFileSync(p, c, 'utf8'); filesTouched++; rewritten++; }
}
console.log('\n  内部链接改写：' + filesTouched + ' 个文件');

/* ══════════════════════════════════════════════════════════
 * 6. 重写 sitemap（新 URL）
 * ══════════════════════════════════════════════════════════ */
{
  const smPath = join(STAGE, 'sitemap.xml');
  const htmlFiles = log.filter((r) => r.endsWith('index.html'));
  const today = new Date().toISOString().slice(0, 10);
  const urls = ['https://mackorn.cn/ai/', 'https://mackorn.cn/ai/index.html',
    'https://mackorn.cn/llms.txt', 'https://mackorn.cn/ai.txt'].concat(
    htmlFiles.map((r) => {
      const dir = r.replace(/index\.html$/, '').replace(/\\/g, '/');
      return 'https://mackorn.cn/' + dir;
    })
  );
  const uniq = [...new Set(urls)].sort();
  const prio = (u) => u.endsWith('/ai/') ? '1.0' : /glossary|screens|reference|agent/.test(u) ? '0.9' : /markets|distributors|engineering|contact/.test(u) ? '0.8' : '0.6';
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    uniq.map((u) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${prio(u)}</priority>\n  </url>`).join('\n') +
    '\n</urlset>\n';
  writeFileSync(smPath, xml, 'utf8');
  console.log('  sitemap 重写：' + uniq.length + ' 个 URL（全部指向 /ai/ 下）');
}

/* ══════════════════════════════════════════════════════════
 * 7. robots.txt 补新路径
 * ══════════════════════════════════════════════════════════ */
{
  const p = join(STAGE, 'robots.txt');
  if (existsSync(p)) {
    let c = readFileSync(p, 'utf8');
    if (!c.includes('# ── 新结构')) {
      c = c.replace('User-agent: *', `# ── 新结构：全部内容已归入 /ai/ 子目录 ──\nAllow: /ai/\n\nUser-agent: *`);
      writeFileSync(p, c, 'utf8');
      console.log('  robots.txt 已补 /ai/ 放行说明');
    }
  }
}

/* ══════════════════════════════════════════════════════════
 * 8. 生成 301 跳转规则（旧路径 → 新路径）
 * ══════════════════════════════════════════════════════════ */
{
  const lines = MOVE_DIRS.map(([from, to]) => `RewriteRule ^${from}/(.*)$ /${to}/$1 [R=301,L]`);
  lines.push('RewriteRule ^api/mcp\\.php$ /ai/api/mcp.php [R=301,L]');
  lines.push('RewriteRule ^llms-full\\.txt$ /ai/llms-full.txt [R=301,L]');
  lines.push('RewriteRule ^CLAUDE\\.md$ /ai/CLAUDE.md [R=301,L]');
  lines.push('RewriteRule ^(ai-qr|contact-qr|distributors-qr)\\.(svg|png)$ /ai/qr/$1.$2 [R=301,L]');
  const ht = `# MACKORN 网站 · 301 跳转（旧路径 → /ai/ 子目录）
# ============================================================================
# 背景：为保持网站根目录整洁，全部内容已归入 /ai/ 子目录。
#       本文件把已发布/已收录的旧 URL 301 到新位置，避免 AI 爬虫与访客断链。
#
# ⚠️ 用法：上传到网站根目录（与现有 .htaccess 合并，不要覆盖）。
#         若出现 500，说明未启用 mod_rewrite → 删除本段恢复。
# ============================================================================
<IfModule mod_rewrite.c>
  RewriteEngine On

${lines.map((l) => '  ' + l).join('\n')}

  # 短链：/mcp 与 /api/mcp 都指向 MCP 端点
  RewriteRule ^mcp/?$ /ai/api/mcp.php [L,QSA]
  RewriteRule ^api/mcp/?$ /ai/api/mcp.php [L,QSA]
</IfModule>
`;
  writeFileSync(join(STAGE, 'redirects-建议.txt'), ht, 'utf8');
  console.log('  redirects-建议.txt（' + lines.length + ' 条 301 规则）');
}

/* ── 清单 ── */
console.log('\n  ── 根目录最终内容 ──');
for (const f of log.filter((r) => !r.includes('/')).sort()) console.log('    📄 ' + f);
for (const d of rootDirs.sort()) {
  const c = log.filter((r) => r.startsWith(d + '/')).length;
  console.log('    📁 ' + d + '/  (' + c + ' 个文件)');
}
console.log('\n  stage 目录：' + STAGE);
