/**
 * 更新两个 PR 的陈旧内容（19 tools → 22 tools）
 *
 * 为什么必须改：
 *   这两个目录（awesome-mcp-servers / awesome-dsh-plugin）被 AI 大量读取。
 *   里面写 "19 tools" 而实际是 21 —— AI 会记下错的数字。
 *   提交时（9-30）确实是 19；之后我们加了 distributor_eval 与 market_stats。
 */
const T = process.env.GITHUB_TOKEN;
if (!T) { console.error('  缺 GITHUB_TOKEN'); process.exit(1); }
const H = { Authorization: 'Bearer ' + T, 'User-Agent': 'mackorn-update', Accept: 'application/vnd.github+json' };

async function api(path, opts = {}, tries = 5) {
  for (let i = 1; i <= tries; i++) {
    try {
      const c = new AbortController(); const id = setTimeout(() => c.abort(), 30000);
      const r = await fetch('https://api.github.com' + path, { ...opts, headers: { ...H, ...(opts.headers || {}) }, signal: c.signal });
      clearTimeout(id);
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch { }
      if (r.status >= 500 && i < tries) { await new Promise((s) => setTimeout(s, 1500 * i)); continue; }
      return { status: r.status, json: j, text: t };
    } catch (e) {
      if (i === tries) return { status: 0, error: e.cause?.code || e.name };
      await new Promise((s) => setTimeout(s, 2000 * i));
    }
  }
}

const TARGETS = [
  {
    name: 'awesome-mcp-servers (#15410)',
    repo: 'LeifDai/awesome-mcp-servers',
    path: 'README.md',
    branch: 'main',
    replaces: [
      ['19 tools, 6 skills.', '22 tools, 6 skills.'],
      ['19 tools', '22 tools'],
    ],
  },
  {
    name: 'awesome-dsh-plugin (#6141)',
    repo: 'LeifDai/awesome-dsh-plugin',
    path: 'data/plugins/LeifDai__MACKORN-hydraulic-cone-crusher.yml',
    branch: 'main',
    replaces: [
      ['19 tools, 6 skills', '22 tools, 6 skills'],
      ['19 个工具、6 个技能', '22 个工具、6 个技能'],
      ['19 tools', '22 tools'],
      ['19 个工具', '22 个工具'],
    ],
  },
];

console.log('\n  ── 更新两个 PR 的陈旧内容 ──\n');

for (const t of TARGETS) {
  console.log('  ── ' + t.name + ' ──');
  // 用 raw 头直接取内容（避免 download_url 的裸 fetch 无重试）
  let content = null, sha = null;
  for (let i = 1; i <= 5 && content === null; i++) {
    try {
      const c = new AbortController(); const id = setTimeout(() => c.abort(), 30000);
      const r = await fetch(`https://api.github.com/repos/${t.repo}/contents/${t.path}?ref=${t.branch}`, {
        headers: { ...H, Accept: 'application/vnd.github.raw+json' }, signal: c.signal,
      });
      clearTimeout(id);
      if (r.status === 200) {
        content = await r.text();
        // 取 sha 需要再请求一次 JSON（raw 头不返回 sha）
        const j = await api(`/repos/${t.repo}/contents/${t.path}?ref=${t.branch}`);
        sha = j.json?.sha || null;
      } else if (i === 5) { console.log('    ❌ 取文件失败 HTTP ' + r.status); }
    } catch (e) {
      if (i === 5) console.log('    ❌ 取文件异常 ' + (e.cause?.code || e.name));
    }
    if (content === null) await new Promise((s) => setTimeout(s, 1500 * i));
  }
  if (content === null || !sha) continue;
  console.log('    文件 ' + t.path + '  (' + content.length + ' 字节, sha ' + sha.slice(0, 8) + ')');

  let updated = content, hits = [];
  for (const [a, b] of t.replaces) {
    if (updated.includes(a)) {
      const before = updated.split(a).length - 1;
      updated = updated.split(a).join(b);
      hits.push('"' + a + '" ×' + before + ' → "' + b + '"');
    }
  }

  if (!hits.length) {
    console.log('    ─ 无需修改（未找到 "19 tools"）');
    // 打印相关行以便核对
    const lines = content.split('\n').filter((l) => /tool/i.test(l)).slice(0, 3);
    for (const l of lines) console.log('       ' + l.slice(0, 160));
    continue;
  }
  console.log('    将修改：');
  for (const h of hits) console.log('      ' + h);

  const put = await api(`/repos/${t.repo}/contents/${t.path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Update tool count: 19 → 21 (added distributor_eval and market_stats since submission)',
      content: Buffer.from(updated, 'utf8').toString('base64'),
      sha,
      branch: t.branch,
    }),
  });
  if (put.status === 200 || put.status === 201) {
    console.log('    ✅ 已提交 · commit ' + (put.json?.commit?.sha || '').slice(0, 10));
    console.log('       ' + (put.json?.commit?.html_url || ''));
  } else {
    console.log('    ❌ 提交失败 HTTP ' + put.status + '  ' + (put.json?.message || put.text.slice(0, 200)));
  }
  await new Promise((s) => setTimeout(s, 1200));
}
console.log('');
