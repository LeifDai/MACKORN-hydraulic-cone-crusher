/**
 * 把 upload-ready（已净化的公开包）同步到 GitHub 仓库
 *
 * 为什么不用原来的 github_publish.ps1：
 *   本机 PowerShell 5.1 的 Invoke-RestMethod 会间歇性报
 *   "基础连接已经关闭: 接收时发生错误"，把成功的请求也报成失败
 *   （实测 Node fetch 对同一 API 是 200）。所以改用 Node。
 *
 * 能力：新增 / 更新 / 删除，逐文件比对远端 sha，只传有变化的。
 *
 * 用法：
 *   set GITHUB_TOKEN=...  （或 --token）
 *   node tools/push_to_github.mjs [--dry]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'upload-ready');
const OWNER = 'LeifDai';
const REPO = 'MACKORN-hydraulic-cone-crusher';
const BRANCH = 'main';
const DRY = process.argv.includes('--dry');

const argvTok = (() => { const i = process.argv.indexOf('--token'); return i > -1 ? process.argv[i + 1] : null; })();
const TOKEN = argvTok || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!TOKEN) { console.error('缺少 token：set GITHUB_TOKEN=... 或 --token <t>'); process.exit(1); }

const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'mackorn-push', Accept: 'application/vnd.github+json' };

// 绝不推送的内容（保险带：即使误入 upload-ready 也不上传）
const NEVER = [/私钥/, /private[-_]?key/i, /\.env$/i, /npmrc/i, /\.pem$/i, /_npmcache/, /github_publish/i,
  /\.moltbook\.json$/i, /moltbook[-_]?key/i, /DNS私钥/,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gh(url, init = {}, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    const r = await fetch(url, { ...init, headers: { ...H, ...(init.headers || {}) } });
    if (r.status === 403 || r.status === 429) { await sleep(3000 * i); continue; }
    return r;
  }
  return fetch(url, { ...init, headers: { ...H, ...(init.headers || {}) } });
}

/** 收集本地文件（路径统一为正斜杠） */
function walk(dir, base = dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, base, acc);
    else if (e.isFile()) acc.push(relative(base, full).split('\\').join('/'));
  }
  return acc;
}

async function main() {
  if (!existsSync(SRC)) { console.error('找不到 upload-ready，先跑构建'); process.exit(1); }

  console.log(`同步 ${SRC}  →  ${OWNER}/${REPO}@${BRANCH}${DRY ? '  [DRY RUN]' : ''}\n`);

  // 1) 远端文件与 blob sha
  const treeRes = await gh(`${API}/git/trees/${BRANCH}?recursive=1`);
  if (!treeRes.ok) { console.error('读取远端树失败 HTTP ' + treeRes.status + ': ' + (await treeRes.text()).slice(0, 200)); process.exit(1); }
  const tree = await treeRes.json();
  const remote = new Map();
  for (const n of tree.tree || []) if (n.type === 'blob') remote.set(n.path, n.sha);

  // 2) 本地文件与 git blob sha（sha1("blob <len>\0" + content)）
  const { createHash } = await import('node:crypto');
  const local = new Map();
  for (const rel of walk(SRC)) {
    if (NEVER.some((re) => re.test(rel))) { console.log(`  [SKIP-危险] ${rel}`); continue; }
    const buf = readFileSync(join(SRC, rel));
    const sha = createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
    local.set(rel, { sha, buf });
  }

  const toUpload = [...local.keys()].filter((p) => remote.get(p) !== local.get(p).sha);
  const toDelete = [...remote.keys()].filter((p) => !local.has(p));

  console.log(`  本地 ${local.size} 个文件 · 远端 ${remote.size} 个`);
  console.log(`  需上传 ${toUpload.length} 个 · 需删除 ${toDelete.length} 个\n`);

  if (toDelete.length) {
    console.log('  远端多出的文件：');
    for (const p of toDelete) console.log(`    - ${p}`);
    console.log('');
  }
  if (toUpload.length) {
    console.log('  将上传：');
    for (const p of toUpload.slice(0, 60)) console.log(`    + ${p}`);
    if (toUpload.length > 60) console.log(`    ... 另有 ${toUpload.length - 60} 个`);
    console.log('');
  }

  if (DRY) { console.log('  DRY RUN，未做任何修改'); return; }

  // 3) 上传
  let okN = 0, failN = 0;
  for (const p of toUpload) {
    const { buf } = local.get(p);
    const existing = remote.has(p);
    const body = { message: `update ${p}`, content: buf.toString('base64'), branch: BRANCH };
    if (existing) {
      const meta = await gh(`${API}/contents/${encodeURIComponent(p)}?ref=${BRANCH}`);
      if (meta.ok) body.sha = (await meta.json()).sha;
    }
    const r = await gh(`${API}/contents/${encodeURIComponent(p)}`, {
      method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
    });
    if (r.ok) { okN++; process.stdout.write(`\r  已上传 ${okN}/${toUpload.length}   `); }
    else { failN++; console.log(`\n  ❌ ${p}  HTTP ${r.status}  ${(await r.text()).slice(0, 160)}`); }
    await sleep(120);
  }
  console.log('');

  // 4) 删除远端多余文件（GitHub Contents API 的 PUT 从不删除，必须显式 DELETE——踩过）
  let delN = 0;
  for (const p of toDelete) {
    const meta = await gh(`${API}/contents/${encodeURIComponent(p)}?ref=${BRANCH}`);
    if (!meta.ok) continue;
    const sha = (await meta.json()).sha;
    const r = await gh(`${API}/contents/${encodeURIComponent(p)}`, {
      method: 'DELETE', body: JSON.stringify({ message: `remove ${p}`, sha, branch: BRANCH }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (r.ok) { delN++; process.stdout.write(`\r  已删除 ${delN}/${toDelete.length}   `); }
    else console.log(`\n  ❌ 删除失败 ${p}  HTTP ${r.status}`);
    await sleep(120);
  }
  if (toDelete.length) console.log('');

  console.log(`\n  上传成功 ${okN} · 失败 ${failN} · 删除 ${delN}`);
  console.log(`  仓库：https://github.com/${OWNER}/${REPO}`);
  if (failN) process.exitCode = 1;
}

main().catch((e) => { console.error('异常: ' + (e.stack || e.message)); process.exit(1); });
