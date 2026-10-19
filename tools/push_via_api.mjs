/**
 * 不用 git，直接把文件推到 GitHub（R87）
 *
 * 为什么需要这个：
 *   本机没有 git、没有 gh、也没有任何 GitHub 凭据。
 *   而 GitHub 的 Contents API 可以用【一个 token】完成上传 ——
 *   不需要装任何工具。
 *
 * 你只需要做一次：
 *   1. 打开 https://github.com/settings/personal-access-tokens/new
 *   2. 勾选 Repository access → 选 LeifDai/MACKORN-hydraulic-cone-crusher
 *   3. Permissions → Repository permissions → Contents = Read and write
 *   4. 生成，复制 token（github_pat_ 开头）
 *   5. 运行：
 *        node tools/push_via_api.mjs --token github_pat_xxx
 *      或先设环境变量：
 *        $env:GITHUB_TOKEN="github_pat_xxx"; node tools/push_via_api.mjs
 *
 * 特性：
 *   · 逐文件 PUT（已存在则带 sha 更新，不存在则新建）
 *   · 支持子目录（自动创建路径）
 *   · 默认【先预演】，加 --write 才真正上传
 *   · 失败会明确报告是哪个文件、什么原因（不静默）
 *   · token 不落盘、不打印
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/* ── 参数 ── */
const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const OWNER = (argv.find((a) => a.startsWith('--owner=')) || '--owner=LeifDai').split('=')[1];
const REPO = (argv.find((a) => a.startsWith('--repo=')) || '--repo=MACKORN-hydraulic-cone-crusher').split('=')[1];
const BRANCH = (argv.find((a) => a.startsWith('--branch=')) || '--branch=main').split('=')[1];
const MSG = (argv.find((a) => a.startsWith('--message=')) || '').split('=').slice(1).join('=')
  || 'docs: add community files, issue templates, runnable examples, and cloud checks';
let TOKEN = (argv.find((a) => a.startsWith('--token=')) || '').split('=').slice(1).join('=')
  || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

/* ── 要上传的目录（上传就绪包）── */
const SRC = join(ROOT, 'distribution', '_upload-github');

if (!existsSync(SRC)) {
  console.error('  ❌ 找不到上传包：' + SRC);
  console.error('     先跑：node tools/build_github_upload_bundle.mjs');
  process.exit(2);
}

/* ── 收集文件 ── */
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const q = join(d, e.name);
    if (e.isDirectory()) { walk(q); continue; }
    files.push({ abs: q, rel: relative(SRC, q).replace(/\\/g, '/') });
  }
};
walk(SRC);
files.sort((a, b) => a.rel.localeCompare(b.rel));

console.log('');
console.log('  ══ 用 GitHub API 推送（不需要 git）══');
console.log('');
console.log('  仓库：' + OWNER + '/' + REPO + '  分支：' + BRANCH);
console.log('  上传包：distribution/_upload-github/');
console.log('  文件数：' + files.length);
console.log('  模式：' + (WRITE ? '★ 实际写入 ★' : '预演（未写入）'));
console.log('');

if (!WRITE) {
  console.log('  将要上传（按目录分组）：');
  const byDir = {};
  for (const f of files) { const d = dirname(f.rel); (byDir[d] || (byDir[d] = [])).push(f.rel.split('/').pop()); }
  for (const [d, fs] of Object.entries(byDir).sort()) {
    console.log('    ' + (d === '.' ? '（根目录）' : d + '/'));
    for (const f of fs) console.log('        ' + f);
  }
  console.log('');
  console.log('  ─────────────────────────────────────────────');
  console.log('  要真正上传，需要先准备一个 GitHub token：');
  console.log('');
  console.log('    1. 打开 https://github.com/settings/personal-access-tokens/new');
  console.log('    2. Repository access → Only select repositories');
  console.log('       选 LeifDai/' + REPO);
  console.log('    3. Permissions → Repository permissions →');
  console.log('       Contents = Read and write');
  console.log('    4. 生成并复制 token（github_pat_ 开头）');
  console.log('    5. 运行：');
  console.log('         node tools/push_via_api.mjs --write --token github_pat_xxx');
  console.log('');
  console.log('  或者用环境变量（不留在命令历史里）：');
  console.log('         $env:GITHUB_TOKEN="github_pat_xxx"');
  console.log('         node tools/push_via_api.mjs --write');
  console.log('');
  process.exit(0);
}

if (!TOKEN) {
  console.error('  ❌ 没有 token。加 --token github_pat_xxx 或先设 $env:GITHUB_TOKEN');
  process.exit(2);
}

const H = {
  Authorization: 'Bearer ' + TOKEN,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'mackorn-push',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function api(path, opts = {}) {
  const r = await fetch('https://api.github.com' + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { }
  return { status: r.status, json: j, text: t };
}

/* 先确认 token 有效 + 仓库可写 */
{
  const me = await api('/user');
  if (me.status !== 200) {
    console.error('  ❌ token 无效（/user 返回 ' + me.status + '）');
    console.error('     ' + String(me.json && me.json.message || me.text).slice(0, 120));
    process.exit(2);
  }
  console.log('  ✅ token 有效，身份：' + (me.json && me.json.login));
  const repo = await api('/repos/' + OWNER + '/' + REPO);
  if (repo.status !== 200) {
    console.error('  ❌ 读不到仓库（' + repo.status + '）—— token 的 repository access 里有没有选它？');
    process.exit(2);
  }
  console.log('  ✅ 仓库可读：' + repo.json.full_name + '（默认分支 ' + repo.json.default_branch + '）');
  console.log('');
}

let okN = 0, newN = 0, updN = 0;
const fails = [];

for (let i = 0; i < files.length; i += 1) {
  const f = files[i];
  const path = '/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURIComponent(f.rel).replace(/%2F/g, '/');
  const content = readFileSync(f.abs).toString('base64');
  const tag = '[' + (i + 1) + '/' + files.length + '] ' + f.rel;

  /* 取现有 sha（存在则更新） */
  let sha = null;
  const cur = await api(path + '?ref=' + BRANCH);
  if (cur.status === 200 && cur.json && cur.json.sha) sha = cur.json.sha;

  const body = { message: MSG + ' — ' + f.rel, content, branch: BRANCH };
  if (sha) body.sha = sha;

  const r = await api(path, { method: 'PUT', body: JSON.stringify(body) });
  if (r.status === 200 || r.status === 201) {
    okN += 1;
    if (sha) { updN += 1; console.log('  🔄 ' + tag + '（更新）'); }
    else { newN += 1; console.log('  🆕 ' + tag); }
  } else {
    const why = String(r.json && r.json.message || r.text).slice(0, 130);
    fails.push({ rel: f.rel, status: r.status, why });
    console.log('  ❌ ' + tag + '  →  ' + r.status + ' ' + why);
  }
}

console.log('');
console.log('  ══ 结果 ══');
console.log('  ✅ 成功 ' + okN + '（新增 ' + newN + ' · 更新 ' + updN + '）');
if (fails.length) {
  console.log('  ❌ 失败 ' + fails.length + '：');
  for (const f of fails) console.log('     · ' + f.rel + '  → ' + f.status + ' ' + f.why);
  console.log('');
  console.log('  常见原因：');
  console.log('    · 403 → token 没有 Contents: Read and write 权限');
  console.log('    · 404 → token 的 repository access 里没选这个仓库');
  console.log('    · 409 → 分支保护或并发冲突，重试一次');
}
console.log('');
console.log('  查看：https://github.com/' + OWNER + '/' + REPO);
console.log('');
process.exit(fails.length ? 1 : 0);
