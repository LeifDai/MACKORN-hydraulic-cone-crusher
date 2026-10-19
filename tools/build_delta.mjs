/**
 * 差量交付系统 —— 只传变化的文件
 *
 * 用户要求：「不传整个文件夹，每次只传更新的部分，这样更新了哪些就都清楚了；
 *            没有问题的就不更新，不至于把验证过的又更新错了，或者更新少了」
 *
 * 设计：
 *   released-manifest.json   ← 上次【已上传并验证通过】的每个文件的 sha256
 *   _deploy/                 ← 本次构建产物
 *   _delta/                  ← 只含【新增/修改/删除】的文件
 *
 * 三个命令：
 *   node tools/build_delta.mjs           生成差量包 + 更新清单
 *   node tools/build_delta.mjs --confirm 上传验证通过后，快照为新基线
 *   node tools/build_delta.mjs --status  查看与基线的差异概览
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const STAGE = join(D, '_deploy');
const DELTA = join(D, '_delta');
const MANIFEST = join(D, 'released-manifest.json');
const MINI = join(D, '_mini');   // 单文件小包（api 用）

const mode = process.argv[2] || '';
const FORCE_FULL = process.argv.includes('--full');

/* ── 工具函数 ── */
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);
function walk(dir, base = dir, out = {}) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else if (e.isFile()) out[relative(base, p).replace(/\\/g, '/')] = { sha: sha(p), size: statSync(p).size };
  }
  return out;
}

const cur = walk(STAGE);
const base = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { files: {}, released_at: null, version: null, note: '首次，无基线' };
const baseFiles = base.files || {};

/* ── 计算差异 ── */
const added = [], changed = [], same = [], deleted = [];
for (const [k, v] of Object.entries(cur)) {
  if (!baseFiles[k]) added.push(k);
  else if (baseFiles[k].sha !== v.sha) changed.push(k);
  else same.push(k);
}
for (const k of Object.keys(baseFiles)) if (!cur[k]) deleted.push(k);

let toSend = [...added, ...changed].sort();
if (FORCE_FULL) { toSend = Object.keys(cur).sort(); }
const del = deleted.sort();

/* ── digest：给整批算一个指纹，方便对话里引用 ── */
const digest = createHash('sha256').update(toSend.map((f) => f + ':' + (cur[f] ? cur[f].sha : 'DEL')).join('|')).digest('hex').slice(0, 8);
if (FORCE_FULL) { added.length = 0; Object.keys(cur).sort().forEach((k) => added.push(k)); changed.length = 0; same.length = 0; }

/* ══ --status：只看差异 ══ */
if (mode === '--status') {
  console.log('\n  ── 与基线对比 ──');
  console.log('    基线：' + (base.released_at || '无（首次）') + '  v' + (base.version || '-'));
  console.log('    基线文件数：' + Object.keys(baseFiles).length + ' · 当前：' + Object.keys(cur).length);
  console.log('');
  console.log('    🆕 新增 ' + added.length);
  added.forEach((f) => console.log('       + ' + f));
  console.log('    ✏️  修改 ' + changed.length);
  changed.forEach((f) => console.log('       ~ ' + f));
  console.log('    🗑  删除 ' + deleted.length);
  deleted.forEach((f) => console.log('       - ' + f));
  console.log('    ✅ 未变 ' + same.length + '（不必重传）');
  console.log('\n    本次需上传：' + toSend.length + ' 个文件 · 指纹 ' + digest + '\n');
  process.exit(0);
}

/* ══ --confirm：快照为新基线 ══ */
if (mode === '--confirm') {
  const m = {
    released_at: new Date().toISOString(),
    version: (() => { try { return JSON.parse(readFileSync(join(STAGE, 'ai/version.json'), 'utf8')).version; } catch { return null; } })(),
    digest,
    file_count: Object.keys(cur).length,
    note: '这是【已上传并验证通过】的基线。下次 build_delta 只比对这个快照。',
    files: cur,
  };
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2), 'utf8');
  console.log('\n  ✅ 基线已更新：' + m.file_count + ' 个文件 · v' + m.version + ' · ' + m.released_at.slice(0, 16).replace('T', ' '));
  console.log('     下次只传增量。\n');
  process.exit(0);
}

/* ══ 默认：生成差量包 ══ */
if (existsSync(DELTA)) rmSync(DELTA, { recursive: true, force: true });
mkdirSync(DELTA, { recursive: true });

/* 逐文件复制变化的 */
let bytes = 0;
for (const f of toSend) {
  const src = join(STAGE, f);
  const dst = join(DELTA, f);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  bytes += statSync(src).size;
}

/* 删除清单（差量包删不掉远端文件，用 .delete-list 告知） */
if (del.length) writeFileSync(join(DELTA, '000-先读我-要删除的文件.txt'),
  '以下文件已从站点移除，请手工删除：\n\n' + del.map((f) => '  ' + f).join('\n') + '\n', 'utf8');

/* ── 更新清单（人可读） ── */
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').slice(0, 12);
const vj = (() => { try { return JSON.parse(readFileSync(join(STAGE, 'ai/version.json'), 'utf8')); } catch { return {}; } })();

let md = '# 更新清单 · ' + stamp + '\n\n';
md += '> 本包是**差量包**，只含与上次已验证基线的差异，不是全量。\n';
md += '> 基线时间：' + (base.released_at ? base.released_at.slice(0, 16).replace('T', ' ') : '无（首次，等于全量）') + '\n';
md += '> 版本：v' + (vj.version || '?') + ' · 远程 MCP 工具 ' + (vj.remote_mcp_tools || '?') + ' 个 · 语言 ' + (vj.languages || '?') + '\n\n';
md += '**本批指纹**：`' + digest + '`　**需上传**：' + toSend.length + ' 个文件 · ' + (bytes / 1024).toFixed(0) + ' KB\n\n';
md += '---\n\n';

if (added.length) { md += '## 🆕 新增 ' + added.length + ' 个（新功能）\n\n'; added.forEach((f) => { md += '- `' + f + '`\n'; }); md += '\n'; }
if (changed.length) { md += '## ✏️ 修改 ' + changed.length + ' 个（覆盖同名文件）\n\n'; changed.forEach((f) => { md += '- `' + f + '`\n'; }); md += '\n'; }
if (del.length) { md += '## 🗑 **必须先删除** ' + del.length + ' 个（差量包删不掉远端文件）\n\n'; del.forEach((f) => { md += '- `' + f + '`\n'; }); md += '\n'; }
md += '## ✅ 未变 ' + same.length + ' 个\n\n这些文件与上次基线完全一致（hash 相同），**不在本包内，无需重传**。\n\n';

md += '---\n\n## 为什么这样做\n\n';
md += '```\n全量传的风险：\n  · 把已经验证过的文件又覆盖一遍 —— 万一包里的版本比线上旧，就退回去了\n  · 传完不知道到底变了什么 —— 出问题无法定位\n  · 每次都传 500KB —— 慢，且容易漏\n\n差量传的好处：\n  · 只动变化的文件 —— 验证过的绝不碰\n  · 清单列出每个变化 —— 出问题一眼定位\n  · 通常只有几 KB 到几十 KB\n```\n\n';
md += '## 上传方式\n\n```\n① 解压本包，把里面的文件按【相同路径】上传到网站根目录（覆盖同名文件）\n② 若包内有 _删除这些文件.txt，按它列出的路径手工删除\n③ 校验：https://mackorn.cn/ai/version.json 应显示 version = ' + (vj.version || '?') + '\n④ 反馈指纹 ' + digest + ' 给我，我核验后执行 --confirm 建立新基线\n```\n';

writeFileSync(join(DELTA, '更新清单.md'), md, 'utf8');

/* ── 打包 ── */
const zipName = '更新包-' + stamp + '.zip';
const zipPath = join(D, zipName);
rmSync(zipPath, { force: true });
try {
  const { execFileSync } = await import('node:child_process');
  // 用 PowerShell 的 ZipFile（无外部依赖）
  execFileSync('powershell', ['-NoProfile', '-Command',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
    '[System.IO.Compression.ZipFile]::CreateFromDirectory("' + DELTA + '","' + zipPath + '",[System.IO.Compression.CompressionLevel]::Optimal,$false)'
  ], { stdio: 'ignore', windowsHide: true });
} catch (e) { console.log('  ⚠ 打包失败: ' + e.message.slice(0, 80)); }

/* ── 自动清理旧包：只保留最新 2 个（用户明确要求过：文件夹里只留最新和次新）── */
{
  const zips = readdirSync(D).filter((x) => x.startsWith('更新包-') && x.endsWith('.zip'))
    .map((x) => ({ n: x, t: statSync(join(D, x)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const z of zips.slice(2)) { try { rmSync(join(D, z.n), { force: true }); console.log('  🧹 清理旧包 ' + z.n); } catch { } }
  // 同时清掉历史遗留的 官网部署包.zip（已被 更新包 取代）
  try { rmSync(join(D, '官网部署包.zip'), { force: true }); } catch { }
}

console.log('\n' + '═'.repeat(78));
console.log('  差量交付包');
console.log('═'.repeat(78));
console.log('  基线：' + (base.released_at ? base.released_at.slice(0, 16).replace('T', ' ') : '无（首次 = 全量）'));
console.log('  🆕 新增 ' + added.length + ' · ✏️ 修改 ' + changed.length + ' · 🗑 删除 ' + del.length + ' · ✅ 未变 ' + same.length);
console.log('  需上传 ' + toSend.length + ' 个文件 · ' + (bytes / 1024).toFixed(1) + ' KB');
console.log('  指纹 ' + digest);
if (existsSync(zipPath)) console.log('  📦 ' + zipName + '  ' + (statSync(zipPath).size / 1024).toFixed(1) + ' KB');
console.log('  📄 更新清单.md');
console.log('─'.repeat(78));
if (added.length) { console.log('  新增：'); added.slice(0, 12).forEach((f) => console.log('    + ' + f)); if (added.length > 12) console.log('    … 另 ' + (added.length - 12) + ' 个'); }
if (changed.length) { console.log('  修改：'); changed.slice(0, 12).forEach((f) => console.log('    ~ ' + f)); if (changed.length > 12) console.log('    … 另 ' + (changed.length - 12) + ' 个'); }
if (del.length) { console.log('  删除：'); del.forEach((f) => console.log('    - ' + f)); }
console.log('═'.repeat(78) + '\n');
