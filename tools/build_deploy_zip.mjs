/**
 * 打包官网部署文件 —— 解压即完成
 *
 * 目标：把 30+ 个文件的分散上传，变成"上传 1 个 zip → 在站点根目录解压"。
 *
 * 关键：目录结构必须**完全对应线上路径**，解压后不能多一层目录。
 *
 *   deploy/                              ← 解压这个内容到站点根
 *   ├── sitemap.xml                      → mackorn.cn/sitemap.xml
 *   ├── <indexnow-key>.txt               → mackorn.cn/<key>.txt
 *   ├── .well-known/mcp/server-card.json → mackorn.cn/.well-known/mcp/server-card.json
 *   ├── en|es|ru|ar|pt|id|fr/index.html  → mackorn.cn/<lang>/
 *   └── ai/
 *       ├── index.html                   → mackorn.cn/ai/index.html
 *       ├── llms.txt                     → mackorn.cn/ai/llms.txt  （注意：另有一份要在根目录）
 *       ├── repo-qrcode.png              → mackorn.cn/ai/repo-qrcode.png
 *       └── guides/...                   → mackorn.cn/ai/guides/...
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'distribution', '官网落地页');
const STAGE = join(ROOT, 'distribution', '_deploy');
const ZIP = join(ROOT, 'distribution', '官网部署包.zip');
const KEY = readFileSync(join(SRC, '_indexnow-key.txt'), 'utf8').trim();

// 清空暂存
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

let n = 0;
const put = (from, rel) => {
  const to = join(STAGE, rel);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  n++;
  console.log('  ' + rel);
};

/* ---- 站点根 ---- */
put(join(SRC, 'sitemap.xml'), 'sitemap.xml');
put(join(SRC, 'robots.txt'), 'robots.txt');
// 智能体身份包 /ai/agent/
for (const p of ['index.html', 'index.txt', 'README.md', 'system-prompt.md', 'shapes-character.json', 'content-bank.md', 'moltbook-engagement-plan.md', 'robot-world-logic.md', 'perspectives-audit.md', 'multi-country-ai-test.md', 'p-review.md', 'ai-crawl-map.md', 'ai-census.md', 'country-test.md']) {
  const f = join(SRC, 'ai', 'agent', p);
  if (existsSync(f)) put(f, join('ai', 'agent', p));
}

// 机器可读入口（AI 优先）
for (const p of ['ai.txt', 'llms-full.txt', 'CLAUDE.md', join('.well-known','agent.json'), join('.well-known','ai-plugin.json'), join('.well-known','ai-platforms.json'), join('ai','agent','index.html'), join('ai','for-ai','index.html'), join('ai','reference','index.html'), join('ai','perspectives','index.html'), join('glossary','index.html'), join('ai','screens','index.html'), join('.well-known','keywords.json')]) {
  const f = join(SRC, p);
  if (existsSync(f)) put(f, p);
}
put(join(SRC, `${KEY}.txt`), `${KEY}.txt`);
put(join(SRC, '.well-known', 'mcp', 'server-card.json'), join('.well-known', 'mcp', 'server-card.json'));

/* ---- 语言版本（站点根下的目录）---- */
for (const lang of ['en', 'es', 'ru', 'ar', 'pt', 'id', 'fr']) {
  const f = join(SRC, lang, 'index.html');
  if (existsSync(f)) put(f, join(lang, 'index.html'));
}

/* ---- 主落地页 /ai/ ---- */
put(join(SRC, 'index.html'), join('ai', 'index.html'));
put(join(SRC, 'llms.txt'), join('ai', 'llms.txt'));
put(join(SRC, 'repo-qrcode.png'), join('ai', 'repo-qrcode.png'));

/* ---- 指南 ---- */
put(join(SRC, 'guides', 'index.html'), join('ai', 'guides', 'index.html'));
for (const ore of ['basalt', 'granite', 'andesite', 'diabase', 'iron_ore', 'copper_ore', 'lead_zinc', 'molybdenum']) {
  const f = join(SRC, 'guides', ore, 'index.html');
  if (existsSync(f)) put(f, join('ai', 'guides', ore, 'index.html'));
}

/* ---- 备件专项页 /ai/parts/（4 语言）---- */
for (const p of ['index.html', join('en','index.html'), join('ru','index.html'), join('es','index.html')]) {
  const f = join(SRC, 'ai', 'parts', p);
  if (existsSync(f)) put(f, join('ai', 'parts', p));
}

/* ---- 国家专属市场页 /markets/{cc}/ ---- */
for (const cc of readdirSync(join(SRC, 'markets'))) {
  const f = join(SRC, 'markets', cc, 'index.html');
  if (existsSync(f)) put(f, join('markets', cc, 'index.html'));
}

/* ---- 经销商招募页 /distributors/（6 语言）---- */
for (const p of ['index.html', join('zh','index.html'), join('es','index.html'), join('ru','index.html'), join('pt','index.html'), join('fr','index.html')]) {
  const f = join(SRC, 'distributors', p);
  if (existsSync(f)) put(f, join('distributors', p));
}

/* ---- 联系方式页 /contact/（6 语言）+ 二维码 ---- */
for (const p of ['index.html', join('zh','index.html'), join('ru','index.html'), join('es','index.html'), join('pt','index.html'), join('fr','index.html')]) {
  const f = join(SRC, 'contact', p);
  if (existsSync(f)) put(f, join('contact', p));
}
for (const q of ['contact-qr.svg', 'ai-qr.svg', 'distributors-qr.svg', 'contact-qr.png', 'ai-qr.png', 'distributors-qr.png']) {
  const f = join(SRC, q);
  if (existsSync(f)) put(f, q);
}
const wq = join(SRC, 'ai', 'wechat-qr.jpg');
if (existsSync(wq)) put(wq, join('ai', 'wechat-qr.jpg'));

/* ---- 设计院/EPC 页 /engineering-firms/ ---- */
for (const p of ['index.html', join('zh','index.html'), join('de','index.html')]) {
  const f = join(SRC, 'engineering-firms', p);
  if (existsSync(f)) put(f, join('engineering-firms', p));
}

/* ---- .htaccess 建议（需改名后使用）---- */
if (existsSync(join(SRC, 'htaccess-建议.txt'))) put(join(SRC, 'htaccess-建议.txt'), 'htaccess-建议.txt');

/* ---- 远程 MCP 端点（PHP，无需 Node）---- */
for (const p of ['api/mcp.php', 'api/_data.php']) {
  const f = join(SRC, p.replace('/', '\\\\'));
  if (existsSync(f)) put(f, p);
}

/* ---- 公司级客户线索（SEC EDGAR 提取）---- */
const clf = join(SRC, 'ai', 'agent', 'company-leads.csv');
if (existsSync(clf)) put(clf, join('ai', 'agent', 'company-leads.csv'));

/* ---- 根目录 llms.txt（约定位置是站点根，不是 /ai/）---- */
put(join(SRC, 'llms.txt'), 'llms.txt');
/* ---- 越南语页 /vi/ ---- */
put(join(SRC, 'vi', 'index.html'), join('vi', 'index.html'));

console.log('\n  共 ' + n + ' 个文件入包');

/* ---- 打包 ---- */
  // 结构重构直接产出 _deploy（restructure_deploy.mjs 已统一写到 _deploy）
  spawnSync(process.execPath, [join(ROOT, 'tools', 'restructure_deploy.mjs')], { stdio: 'ignore', windowsHide: true });

  rmSync(ZIP, { force: true });
// Compress-Archive 只认 .zip 扩展名，所以先打 zip
const r = spawnSync('powershell', ['-NoProfile', '-Command',
  `Compress-Archive -Path "${STAGE}\\*" -DestinationPath "${ZIP}" -CompressionLevel Optimal -Force`],
  { stdio: 'ignore', windowsHide: true });
if (!existsSync(ZIP)) { console.error('  打包失败'); process.exit(1); }
const size = readFileSync(ZIP).length;
console.log('  已打包: ' + ZIP + '  (' + (size / 1024).toFixed(1) + ' KB)');

/* ---- 附带一份解压说明 ---- */
writeFileSync(join(ROOT, 'distribution', '官网部署包-说明.txt'), [
  'MACKORN 官网部署包',
  '==================',
  '',
  '用法：',
  '  1. 把 官网部署包.zip 上传到网站根目录（mackorn.cn 的根，即 index 所在的目录）',
  '  2. 在服务器上解压（覆盖同名文件）',
  '  3. 解压后不要多一层目录 —— zip 里的 sitemap.xml 应该直接落在站点根',
  '',
  '如果解压后出现了一层文件夹（如 "官网部署包/sitemap.xml"），',
  '请进入该文件夹，把里面的内容全部移动到站点根。',
  '',
  '包含内容（相对站点根）：',
  '  sitemap.xml                              站点地图（71 个 URL，含原有 52 个）',
  '  ' + KEY + '.txt   IndexNow 密钥文件',
  '  llms.txt                                 AI 爬虫摘要（根目录）',
  '  .well-known/mcp/server-card.json         MCP 静态服务器卡片',
  '  en|es|ru|ar|pt|id|fr/index.html          7 个语言版本落地页',
  '  ai/index.html                            中文主落地页',
  '  ai/llms.txt                              AI 爬虫摘要（/ai/ 目录）',
  '  ai/repo-qrcode.png                       仓库二维码',
  '  ai/guides/index.html                     选型指南索引',
  '  ai/guides/{8 种矿石}/index.html           8 篇中英双语选型指南',
  '',
  '注意：',
  '  - .well-known 是以点开头的隐藏目录，FTP 要开启"显示隐藏文件"才能看到',
  '  - 覆盖前建议先备份服务器上的 sitemap.xml（原有 52 个 URL 已合并进新版）',
  '',
  '解压完成后验证：',
  '  https://mackorn.cn/ai/',
  '  https://mackorn.cn/llms.txt',
  '  https://mackorn.cn/' + KEY + '.txt',
  '  https://mackorn.cn/sitemap.xml',
  '',
  '然后运行：',
  '  node tools\\submit_indexnow.mjs',
  '  node tools\\audit_global.mjs',
].join('\r\n'), 'utf8');
console.log('  已写: distribution/官网部署包-说明.txt');
