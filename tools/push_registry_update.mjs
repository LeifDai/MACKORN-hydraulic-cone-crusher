/**
 * 把更新后的 server.json 与发布 workflow 推到 GitHub 仓库
 * 之后用户只需在 GitHub 网页点一次 "Run workflow"，就能发布到 MCP Registry（不需要浏览器扫码/2FA）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const T = process.env.GITHUB_TOKEN;
if (!T) { console.error('  缺 GITHUB_TOKEN'); process.exit(1); }
const H = { Authorization: 'Bearer ' + T, 'User-Agent': 'mackorn', Accept: 'application/vnd.github+json' };
const R = 'LeifDai/MACKORN-hydraulic-cone-crusher';

async function api(path, opts = {}) {
  for (let i = 1; i <= 4; i++) {
    try {
      const c = new AbortController(); const id = setTimeout(() => c.abort(), 35000);
      const r = await fetch('https://api.github.com' + path, { ...opts, headers: { ...H, ...(opts.headers || {}) }, signal: c.signal });
      clearTimeout(id);
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch { }
      if (r.status >= 500 && i < 4) { await new Promise((s) => setTimeout(s, 1500 * i)); continue; }
      return { s: r.status, j, t };
    } catch (e) { if (i === 4) return { s: 0, e: e.cause?.code || e.name, t: '' }; await new Promise((s) => setTimeout(s, 1500 * i)); }
  }
}

/* ══ 一、更新 server.json ══ */
const NEW_SERVER = {
  $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
  name: 'cn.mackorn/mackorn-cone-crusher',
  description: 'MACKORN hydraulic cone crusher selection and crushing-plant design. 22 tools, callable over HTTP.',
  title: 'MACKORN Hydraulic Cone Crusher Selection',
  version: '0.2.0',
  websiteUrl: 'https://mackorn.cn/ai/',
  repository: { url: 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher', source: 'github' },
  remotes: [{ type: 'streamable-http', url: 'https://mackorn.cn/ai/api/mcp.php' }],
  packages: [{ registryType: 'npm', identifier: 'mackorn-cone-crusher', version: '0.2.0', transport: { type: 'stdio' } }],
};

console.log('\n  ── 一、更新 server.json ──');
{
  const cur = await api('/repos/' + R + '/contents/server.json?ref=main');
  if (cur.s !== 200) { console.log('  ❌ 取不到现有 server.json: HTTP ' + cur.s); }
  else {
    const oldTxt = Buffer.from(cur.j.content, 'base64').toString('utf8');
    let oldVer = '?';
    try { oldVer = JSON.parse(oldTxt).version; } catch { }
    const newTxt = JSON.stringify(NEW_SERVER, null, 2) + '\n';
    if (oldTxt.trim() === newTxt.trim()) console.log('  ○ 已是最新（v' + oldVer + '），无需更新');
    else {
      const put = await api('/repos/' + R + '/contents/server.json', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Update MCP registry entry: v' + oldVer + ' → 0.2.0, 22 tools, add remote HTTP endpoint', content: Buffer.from(newTxt, 'utf8').toString('base64'), sha: cur.j.sha, branch: 'main' }),
      });
      if (put.s === 200 || put.s === 201) console.log('  ✅ 已更新 v' + oldVer + ' → 0.2.0（加了 remotes 远程端点）· commit ' + (put.j?.commit?.sha || '').slice(0, 8));
      else console.log('  ❌ 更新失败 HTTP ' + put.s + ' ' + (put.j?.message || put.t.slice(0, 150)));
    }
  }
}

/* ══ 二、加发布 workflow（OIDC，不需要浏览器/2FA）══ */
const WORKFLOW = `name: Publish to MCP Registry

# 用 GitHub OIDC 发布到官方 MCP Registry —— 不需要浏览器扫码，不需要 2FA
# 手动触发：仓库 → Actions → Publish to MCP Registry → Run workflow

on:
  workflow_dispatch:
  push:
    paths:
      - 'server.json'

permissions:
  id-token: write    # OIDC 必需
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Show server.json
        run: cat server.json

      - name: Install mcp-publisher
        run: |
          curl -sL "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_linux_amd64.tar.gz" -o mcp-publisher.tar.gz
          tar xzf mcp-publisher.tar.gz mcp-publisher
          chmod +x mcp-publisher
          ./mcp-publisher --help || true

      - name: Validate
        run: ./mcp-publisher validate

      - name: Login (GitHub OIDC)
        run: ./mcp-publisher login github-oidc

      - name: Publish
        run: ./mcp-publisher publish
`;

console.log('\n  ── 二、加发布 workflow ──');
{
  const cur = await api('/repos/' + R + '/contents/.github/workflows/publish-mcp.yml?ref=main');
  const body = {
    message: 'Add MCP Registry publish workflow (GitHub OIDC, no browser/2FA needed)',
    content: Buffer.from(WORKFLOW, 'utf8').toString('base64'),
    branch: 'main',
  };
  if (cur.s === 200) body.sha = cur.j.sha;
  const put = await api('/repos/' + R + '/contents/.github/workflows/publish-mcp.yml', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (put.s === 200 || put.s === 201) console.log('  ✅ 已添加 .github/workflows/publish-mcp.yml · commit ' + (put.j?.commit?.sha || '').slice(0, 8));
  else console.log('  ❌ 失败 HTTP ' + put.s + ' ' + (put.j?.message || put.t.slice(0, 200)));
}

/* ══ 三、验证 ══ */
console.log('\n  ── 三、验证 ──');
await new Promise((s) => setTimeout(s, 1500));
const sj = await api('/repos/' + R + '/contents/server.json?ref=main');
if (sj.s === 200) {
  const t = Buffer.from(sj.j.content, 'base64').toString('utf8');
  try {
    const j = JSON.parse(t);
    console.log('  server.json: v' + j.version + ' · remotes=' + (j.remotes ? j.remotes.length + ' 个 → ' + j.remotes[0].url : '无'));
    console.log('  description: ' + j.description);
  } catch { console.log('  解析失败'); }
}
const wj = await api('/repos/' + R + '/contents/.github/workflows?ref=main');
if (Array.isArray(wj.j)) console.log('  workflows: ' + wj.j.map((x) => x.name).join(', '));
console.log('');
