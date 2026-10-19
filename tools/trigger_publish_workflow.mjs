/**
 * 直接触发 GitHub Actions 的 publish-mcp workflow
 * 如果 token 有 workflow 权限，这一步能把"用户点一下"也省掉
 */
const T = process.env.GITHUB_TOKEN;
const H = { Authorization: 'Bearer ' + T, 'User-Agent': 'mackorn', Accept: 'application/vnd.github+json' };
const R = 'LeifDai/MACKORN-hydraulic-cone-crusher';

async function api(path, opts = {}) {
  for (let i = 1; i <= 3; i++) {
    try {
      const c = new AbortController(); const id = setTimeout(() => c.abort(), 35000);
      const r = await fetch('https://api.github.com' + path, { ...opts, headers: { ...H, ...(opts.headers || {}) }, signal: c.signal });
      clearTimeout(id);
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch { }
      return { s: r.status, j, t };
    } catch (e) { if (i === 3) return { s: 0, e: e.cause?.code || e.name, t: '' }; await new Promise((s) => setTimeout(s, 1200 * i)); }
  }
}

console.log('\n  ── 一、token 是否有 workflow 权限 ──');
{
  const r = await fetch('https://api.github.com/user', { headers: H });
  const scopes = r.headers.get('x-oauth-scopes') || '';
  console.log('  scopes: ' + scopes.slice(0, 200));
  console.log('  含 workflow 权限: ' + (/workflow/.test(scopes) ? '✅ 是' : '❌ 否'));
}

console.log('\n  ── 二、列出 workflows ──');
let wfId = null;
{
  const w = await api('/repos/' + R + '/actions/workflows');
  if (Array.isArray(w.j?.workflows)) {
    for (const x of w.j.workflows) {
      console.log('    ' + x.name.padEnd(32) + x.state.padEnd(12) + 'id=' + x.id);
      if (/publish.*mcp|MCP.*Registry/i.test(x.name)) wfId = x.id;
    }
  } else console.log('    ❌ HTTP ' + w.s + ' ' + (w.j?.message || ''));
}

console.log('\n  ── 三、触发 publish workflow ──');
if (!wfId) {
  console.log('    ⚠ 没找到 publish workflow，跳过');
} else {
  const d = await api('/repos/' + R + '/actions/workflows/' + wfId + '/dispatches', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (d.s === 204) console.log('    ✅ 已触发！');
  else console.log('    ' + (d.s === 403 ? '❌ 无权限（token 缺 workflow scope）' : '❌ HTTP ' + d.s) + '  ' + (d.j?.message || d.t.slice(0, 200)));
}

console.log('\n  ── 四、看运行结果 ──');
await new Promise((s) => setTimeout(s, 8000));
{
  const runs = await api('/repos/' + R + '/actions/runs?per_page=5');
  if (Array.isArray(runs.j?.workflow_runs)) {
    for (const r of runs.j.workflow_runs.slice(0, 5)) {
      console.log('    ' + r.name.padEnd(30) + String(r.status).padEnd(12) + String(r.conclusion || '-').padEnd(12) + r.created_at.slice(0, 19));
      console.log('        ' + r.html_url);
    }
  } else console.log('    ❌ HTTP ' + runs.s);
}
console.log('');
