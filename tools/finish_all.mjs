/**
 * 一键完成：推代码 + 回两个 PR + 验证（R88）
 *
 * 为什么做这个：
 *   本机没有 git / gh / 任何 GitHub 凭据，我无法代替你认证。
 *   但我可以把【剩下的全部步骤】做成一条命令 ——
 *   你只需要提供一次 token，其余全自动。
 *
 * 用法：
 *   # 经典 token（ghp_ 开头，需要 public_repo 权限）—— 能推代码 + 能在别人的仓库回评论
 *   $env:GITHUB_TOKEN="ghp_xxx"
 *   node tools/finish_all.mjs --write
 *
 *   # 细粒度 token（github_pat_ 开头）—— 只能推自己的仓库；回评论可能 403
 *   node tools/finish_all.mjs --write --token github_pat_xxx
 *
 * 不加 --write 是预演（不做任何写操作）。
 *
 * 四步：
 *   ① 推 28 个文件到 LeifDai/MACKORN-hydraulic-cone-crusher
 *   ② 在 PR #6141（awesome-dsh-plugin）回评论告知已更新到 22 tools
 *   ③ 在 PR #15410（awesome-mcp-servers）回评论告知 Glama 阻塞已修
 *   ④ 验证：读回仓库里的关键文件 + 读回评论
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');

const OWNER = 'LeifDai';
const REPO = 'MACKORN-hydraulic-cone-crusher';
const BRANCH = 'main';
const SRC = join(ROOT, 'distribution', '_upload-github');

let TOKEN = (argv.find((a) => a.startsWith('--token=')) || '').split('=').slice(1).join('=')
  || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

/* ── 两个 PR 的评论文案 ── */
const COMMENT_6141 = [
  'The repository is now updated. It currently exposes **22 tools**',
  '(19 at submission time; +3 added since — `mackorn_knowledge`,',
  '`mackorn_distributor_eval`, `mackorn_market_stats`).',
  '',
  'You can verify with:',
  '',
  '```',
  'node plugin/mcp-server.mjs --list',
  '```',
  '',
  'Thanks for catching the mismatch — the entry was written against a stale count.',
].join('\n');

const COMMENT_15410 = [
  'The Glama evaluation blocker should now be resolved:',
  '',
  '- `package.json` `bin` now includes the package name itself, so `npx mackorn-cone-crusher`',
  '  works (previously only `mackorn-mcp` was registered — npm only auto-maps when the bin',
  '  name equals the package name);',
  '- a `Dockerfile` has been added so the server can be built and started reproducibly.',
  '',
  'Please re-trigger the Glama evaluation when you have a moment. Thanks!',
].join('\n');

const PRS = [
  { repo: 'awesome-dsh-plugin/awesome-dsh-plugin', number: 6141, body: COMMENT_6141, label: 'PR #6141（工具数，⏰ 截止 2026-10-20）' },
  { repo: 'punkpeye/awesome-mcp-servers', number: 15410, body: COMMENT_15410, label: 'PR #15410（Glama 质量分）' },
];

/* ══════ 预演 ══════ */
console.log('');
console.log('  ══ 一键完成：推代码 + 回两个 PR + 验证 ══');
console.log('');
console.log('  ① 推 28 个文件 → ' + OWNER + '/' + REPO);
for (const p of PRS) console.log('  ② 回评论 → ' + p.label);
console.log('  ③ 验证（读回文件与评论）');
console.log('');
console.log('  模式：' + (WRITE ? '★ 实际执行 ★' : '预演（未做任何写操作）'));
console.log('');

if (!WRITE) {
  console.log('  ── PR #6141 将贴的评论 ──');
  console.log(COMMENT_6141.split('\n').map((l) => '    ' + l).join('\n'));
  console.log('');
  console.log('  ── PR #15410 将贴的评论 ──');
  console.log(COMMENT_15410.split('\n').map((l) => '    ' + l).join('\n'));
  console.log('');
  console.log('  ──────────────────────────────────────────────');
  console.log('  要真正执行，先准备 token：');
  console.log('');
  console.log('  【推荐】经典 token（能推代码，也能在别人仓库回评论）');
  console.log('    https://github.com/settings/tokens/new');
  console.log('    勾选 scope:  repo  （或只勾 public_repo）');
  console.log('');
  console.log('  【也行】细粒度 token（只能推自己的仓库）');
  console.log('    https://github.com/settings/personal-access-tokens/new');
  console.log('    Repository access → LeifDai/' + REPO);
  console.log('    Permissions → Contents = Read and write');
  console.log('    ※ 用这种 token 时，回评论那步可能 403（因为不是那两个仓库的协作者）');
  console.log('');
  console.log('  然后：');
  console.log('    $env:GITHUB_TOKEN="你的token"');
  console.log('    node tools/finish_all.mjs --write');
  console.log('');
  process.exit(0);
}

if (!TOKEN) {
  console.error('  ❌ 没有 token。用 --token xxx 或先设 $env:GITHUB_TOKEN');
  process.exit(2);
}
if (!existsSync(SRC)) {
  console.error('  ❌ 找不到上传包：' + SRC);
  console.error('     先跑：node tools/build_github_upload_bundle.mjs');
  process.exit(2);
}

const H = {
  Authorization: 'Bearer ' + TOKEN,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'mackorn-finish',
  'X-GitHub-Api-Version': '2022-11-28',
};
async function api(path, opts = {}) {
  const r = await fetch('https://api.github.com' + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { }
  return { status: r.status, json: j, text: t };
}

/* ══════ 0. 校验 token ══════ */
{
  const me = await api('/user');
  if (me.status !== 200) {
    console.error('  ❌ token 无效（/user 返回 ' + me.status + '）');
    console.error('     ' + String((me.json && me.json.message) || me.text).slice(0, 140));
    process.exit(2);
  }
  console.log('  ✅ token 有效 · 身份：' + (me.json && me.json.login));
  const scopes = me.headers && me.headers.get && me.headers.get('x-oauth-scopes');
  if (scopes) console.log('     经典 token 权限：' + (scopes || '（无）'));
  console.log('');
}

/* ══════ ① 推文件 ══════ */
console.log('  ══ ① 推动文件 ══');
console.log('');
const files = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const q = join(d, e.name);
    if (e.isDirectory()) walk(q); else files.push({ abs: q, rel: relative(SRC, q).replace(/\\/g, '/') });
  }
})(SRC);
files.sort((a, b) => a.rel.localeCompare(b.rel));

const MSG = 'docs: add community files, issue templates, runnable examples, and cloud checks';
let okN = 0, newN = 0, updN = 0;
const pushFails = [];

for (let i = 0; i < files.length; i += 1) {
  const f = files[i];
  const path = '/repos/' + OWNER + '/' + REPO + '/contents/' + f.rel.split('/').map(encodeURIComponent).join('/');
  const content = readFileSync(f.abs).toString('base64');
  const cur = await api(path + '?ref=' + BRANCH);
  const sha = (cur.status === 200 && cur.json && cur.json.sha) ? cur.json.sha : null;
  const body = { message: MSG, content, branch: BRANCH };
  if (sha) body.sha = sha;
  const r = await api(path, { method: 'PUT', body: JSON.stringify(body) });
  const tag = '[' + (i + 1) + '/' + files.length + '] ' + f.rel;
  if (r.status === 200 || r.status === 201) {
    okN += 1;
    if (sha) { updN += 1; console.log('  🔄 ' + tag); } else { newN += 1; console.log('  🆕 ' + tag); }
  } else {
    const why = String((r.json && r.json.message) || r.text).slice(0, 120);
    pushFails.push({ rel: f.rel, status: r.status, why });
    console.log('  ❌ ' + tag + ' → ' + r.status + ' ' + why);
  }
}
console.log('');
console.log('  ① 结果：成功 ' + okN + '（新增 ' + newN + ' · 更新 ' + updN + '）' + (pushFails.length ? ' · 失败 ' + pushFails.length : ''));
console.log('');

/* ══════ ② 回两个 PR ══════ */
console.log('  ══ ② 回两个 PR ══');
console.log('');
const prFails = [];
for (const p of PRS) {
  const r = await api('/repos/' + p.repo + '/issues/' + p.number + '/comments', {
    method: 'POST', body: JSON.stringify({ body: p.body }),
  });
  if (r.status === 201) {
    console.log('  ✅ ' + p.label);
    console.log('     ' + (r.json && r.json.html_url));
    p.postedUrl = r.json && r.json.html_url;
  } else {
    const why = String((r.json && r.json.message) || r.text).slice(0, 140);
    prFails.push({ label: p.label, status: r.status, why });
    console.log('  ❌ ' + p.label + ' → ' + r.status + ' ' + why);
    if (r.status === 403 || r.status === 404) {
      console.log('     ⚠️ 多半是 token 权限不足：回别人仓库的评论需要【经典 token】+ public_repo 权限');
      console.log('        细粒度 token 无法给"你不是协作者的仓库"授权。');
      console.log('        替代：手动去这个地址贴评论 →');
      console.log('          https://github.com/' + p.repo + '/pull/' + p.number);
    }
  }
}
console.log('');

/* ══════ ③ 验证 ══════ */
console.log('  ══ ③ 验证 ══');
console.log('');
{
  /* 仓库关键文件是否真的在 */
  const checks = ['CITATION.cff', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'Dockerfile',
    '.github/ISSUE_TEMPLATE/data_correction.yml', 'examples/quick-start.mjs', 'server.json'];
  let hit = 0;
  for (const c of checks) {
    const r = await api('/repos/' + OWNER + '/' + REPO + '/contents/' + c.split('/').map(encodeURIComponent).join('/') + '?ref=' + BRANCH);
    if (r.status === 200) { hit += 1; console.log('  ✅ ' + c); } else console.log('  ❌ ' + c + '（' + r.status + '）');
  }
  console.log('');
  console.log('  仓库文件验证：' + hit + '/' + checks.length);

  /* 工具数以 GitHub 上的为准 */
  const mjs = await api('/repos/' + OWNER + '/' + REPO + '/contents/plugin/index.mjs?ref=' + BRANCH);
  if (mjs.status === 200 && mjs.json && mjs.json.content) {
    const src = Buffer.from(mjs.json.content, 'base64').toString('utf8');
    const n = [...new Set([...src.matchAll(/^\s{2}name: '(mackorn_[a-z_]+)',/gm)].map((m) => m[1]))].length;
    console.log('  ★ GitHub 上 plugin/index.mjs 的工具数：' + n + (n >= 22 ? '  ✅' : '  ⚠️ 还是旧版'));
  } else {
    console.log('  ⚠️ 读不到 plugin/index.mjs（' + mjs.status + '）');
  }

  /* 评论是否在 */
  for (const p of PRS) {
    const r = await api('/repos/' + p.repo + '/issues/' + p.number + '/comments');
    const mine = (r.json || []).filter((c) => (c.user && c.user.login) === 'LeifDai');
    console.log('  ' + (mine.length ? '✅' : '○') + ' ' + p.label + ' 上我们的评论：' + mine.length + ' 条');
  }
}

console.log('');
console.log('  ══ 总结 ══');
console.log('  ① 推文件：' + okN + '/' + files.length + (pushFails.length ? '（失败 ' + pushFails.length + '）' : ' ✅'));
console.log('  ② 回评论：' + (PRS.length - prFails.length) + '/' + PRS.length + (prFails.length ? '（失败 ' + prFails.length + '）' : ' ✅'));
console.log('  ③ 验证：见上');
console.log('');
console.log('  仓库：https://github.com/' + OWNER + '/' + REPO);
console.log('');

process.exit((pushFails.length + prFails.length) ? 1 : 0);
