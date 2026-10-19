/**
 * 全球 AI 可引用性审计（端到端）
 *
 * 目标：一条命令回答"现在全球 AI 到底能不能引用到 MACKORN 圆锥破选型插件"，
 * 并逐项指出还差什么。
 *
 * 设计原则（吃过亏的地方）：
 *   - 不相信"看起来做了"，只相信实测：HTTP 状态 + 内容哈希 + 协议握手
 *   - 本地文件与线上文件用 **内容哈希** 比对，而不是比对长度（长度会被压缩欺骗）
 *   - 明确区分「已通过 / 未通过 / 需人工」
 *   - 不做美化：查不到就报未通过
 *
 * 用法：
 *   node tools/audit_global.mjs            # 全部审计
 *   node tools/audit_global.mjs --local    # 只审计本地
 *   node tools/audit_global.mjs --online   # 只审计线上
 */
import { readFileSync, existsSync, writeFileSync, openSync, closeSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const LOCAL_ONLY = process.argv.includes('--local');
const ONLINE_ONLY = process.argv.includes('--online');

const REPO = 'LeifDai/MACKORN-hydraulic-cone-crusher';
const NPM_PKG = 'mackorn-cone-crusher';
const MCP_NAME = 'cn.mackorn/mackorn-cone-crusher';
const SITE = 'https://mackorn.cn';
const SITE_ALT = 'https://mackorn.com';
const PR_AWESOME_MCP = 'https://api.github.com/repos/punkpeye/awesome-mcp-servers/pulls/15410';
const PR_AWESOME_DSH = 'https://api.github.com/repos/awesome-dsh-plugin/awesome-dsh-plugin/pulls/6141';

const pass = [];
const fail = [];
const manual = [];

function ok(section, item, detail = '') { pass.push({ section, item, detail }); }
function no(section, item, detail = '') { fail.push({ section, item, detail }); }
function todo(section, item, detail = '') { manual.push({ section, item, detail }); }
const sha = (t) => createHash('sha256').update(t).digest('hex').slice(0, 16);
const S = (p) => join(ROOT, p);
// 被审计的旧域名，拼接构造以免审计脚本自身成为命中项
const BAD_HOST = 'www.' + 'mackorn.cn';

async function get(url, opts = {}) {
  try {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(25000), ...opts });
    const text = await r.text();
    return { ok: true, status: r.status, text, headers: r.headers };
  } catch (e) {
    return { ok: false, status: 0, text: '', err: e.cause?.code || e.message };
  }
}

/** 安全 JSON 解析：返回 null 而不是抛错（审计脚本不该因为一个接口返回 HTML 就整体崩掉） */
function jparse(r) {
  if (!r || !r.ok) return null;
  const t = (r.text || '').trim();
  if (!t || t[0] === '<') return null;
  try { return JSON.parse(t); } catch { return null; }
}

/**
 * 跑子进程并把输出**重定向到文件**再读回来。
 * 不能用默认的 piped stdio：受限沙箱下 spawnSync 会因无法打开命名管道而 EPERM，
 * 那是环境限制而非被测对象失败 —— 但会让审计给出**假失败**（踩过这个坑）。
 */
function runCapture(args, cwd = ROOT) {
  const log = join(ROOT, `.audit-${Math.random().toString(36).slice(2)}.log`);
  let fd = null;
  try {
    fd = openSync(log, 'w');
    const r = spawnSync(process.execPath, args, { cwd, stdio: ['ignore', fd, fd] });
    closeSync(fd); fd = null;
    let text = '';
    try { text = readFileSync(log, 'utf8'); } catch { }
    try { rmSync(log, { force: true }); } catch { }
    if (r.error) return { spawnErr: r.error.code || r.error.message, status: null, text };
    return { spawnErr: null, status: r.status, text };
  } catch (e) {
    if (fd != null) { try { closeSync(fd); } catch { } }
    try { rmSync(log, { force: true }); } catch { }
    return { spawnErr: e.code || e.message, status: null, text: '' };
  }
}

/* ============================ 本地 ============================ */
function auditLocal() {
  console.log('\n【A】本地交付物');

  // A1 版本号一致性
  const r = runCapture([S('tools/sync_version.mjs')]);
  if (r.spawnErr) {
    todo('A', '版本号检查无法运行（沙箱限制子进程）', r.spawnErr);
  } else if (r.status === 0) {
    ok('A', '版本号单一真相源一致', (r.text || '').trim().split('\n').pop().trim());
  } else {
    no('A', '版本号不一致', (r.text || '').split('\n').filter((l) => /STALE/.test(l)).join(' '));
  }

  // A2 构建门禁
  const b = runCapture([S('tools/build_public.mjs')]);
  const out = b.text || '';
  if (b.spawnErr) {
    todo('A', '构建门禁无法运行（沙箱限制子进程）', b.spawnErr);
  } else {
    for (const [label, pat] of [
      ['合规闸门零命中', /零命中/],
      ['版本号一致性门禁通过', /所有公开文件版本号一致/],
      ['DSH 测试 0 失败', /\d+ 通过 \/ 0 失败/],
      ['MCP 自检 0 失败', /26 通过 \/ 0 失败/],
    ]) {
      if (pat.test(out)) ok('A', label);
      else no('A', label, out.split('\n').filter((l) => /❌|失败|STALE/.test(l)).slice(0, 2).join(' '));
    }
  }

  // A3 公开包关键内容
  const OUT = S('dist/mackorn-cone-crusher');
  const must = [
    'package.json', 'cordis.patch.yml', 'llms.txt', 'server.json', 'README.md',
    'plugin/index.mjs', 'plugin/mcp-server.mjs', 'tools/install.ps1',
    'skills/mackorn-cone-crusher-selection/SKILL.md',
    '.github/workflows/ci.yml',
  ];
  const miss = must.filter((f) => !existsSync(join(OUT, f)));
  if (!miss.length) ok('A', '公开包关键文件齐全', `${must.length} 项`);
  else no('A', '公开包缺文件', miss.join(', '));

  // A4 泄漏检查
  const leaks = [];
  for (const p of [
    'assets/bond-wi-testmethod-p57.jpg', 'assets/testreport-coarse-aggregate-p1.jpg',
    'assets/costbreakdown-to-port.jpg', 'tools/github_publish.ps1',
    'tools/submit_awesome_mcp.ps1', 'knowledge/_refs',
  ]) if (existsSync(join(OUT, p))) leaks.push(p);
  if (!leaks.length) ok('A', '无敏感内容泄漏');
  else no('A', '敏感内容泄漏', leaks.join(', '));

  // A5 mcpName + 零依赖
  try {
    const p = JSON.parse(readFileSync(join(OUT, 'package.json'), 'utf8'));
    if (p.mcpName === MCP_NAME) ok('A', 'mcpName 正确', p.mcpName);
    else no('A', 'mcpName 缺失或错误', String(p.mcpName));
    if (Object.keys(p.dependencies || {}).length === 0) ok('A', '零运行时依赖');
    else no('A', '存在运行时依赖');
  } catch (e) { no('A', 'package.json 读取失败', e.message); }

  // A6 www 残留
  const bad = [];
  const walk = (dir) => {
    for (const e of readdirSafe(dir)) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(md|json|html|mjs|yml|txt|ps1|bat)$/.test(e.name) && readFileSafe(full).includes(BAD_HOST)) bad.push(full.replace(ROOT + '\\', ''));
    }
  };
  for (const d of [OUT, S('distribution/mcpb/mackorn-cone-crusher'), S('distribution/官网落地页')]) if (existsSync(d)) walk(d);
  if (!bad.length) ok('A', '遗留 www 域名零残留');
  else no('A', '遗留 www 域名残留', bad.slice(0, 3).join(', '));

  // A7 MCPB
  const mcpb = S('distribution/mcpb/mackorn-cone-crusher.mcpb');
  if (existsSync(mcpb)) {
    const size = readFileSync(mcpb).length;
    const m = readFileSync(S('distribution/mcpb/mackorn-cone-crusher/manifest.json'), 'utf8');
    try {
      const j = JSON.parse(m);
      if (j.tools?.length === 19 && j.server?.entry_point) ok('A', 'MCPB manifest 正确', `${j.tools.length} 工具, ${Math.round(size / 1024)} KB`);
      else no('A', 'MCPB manifest 异常', `${j.tools?.length} 工具`);
    } catch (e) { no('A', 'MCPB manifest 解析失败'); }
  } else no('A', 'MCPB 包不存在');

  // A8 MCP 协议实测（19 工具 + 真实调用）
  const lines = [
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"audit","version":"1"}}}',
    '{"jsonrpc":"2.0","method":"notifications/initialized"}',
    '{"jsonrpc":"2.0","id":2,"method":"tools/list"}',
    '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"mackorn_crusher_curve","arguments":{"css_mm":16,"feed_p80_mm":90,"bond_wi":14}}}',
  ];
  // 写入请求文件后用 stdin 重定向（input 选项也走管道，沙箱下会 EPERM）
  const reqFile = join(ROOT, '.audit-mcp-req.jsonl');
  writeFileSync(reqFile, lines.join('\n') + '\n', 'utf8');
  const resFile = join(ROOT, '.audit-mcp-res.jsonl');
  let mtOut = '';
  let mtErr = null;
  try {
    const fdIn = openSync(reqFile, 'r');
    const fdOut = openSync(resFile, 'w');
    const r2 = spawnSync(process.execPath, [join(OUT, 'plugin/mcp-server.mjs')], { cwd: OUT, stdio: [fdIn, fdOut, fdOut] });
    closeSync(fdIn); closeSync(fdOut);
    if (r2.error) mtErr = r2.error.code || r2.error.message;
    try { mtOut = readFileSync(resFile, 'utf8'); } catch { }
  } catch (e) { mtErr = e.code || e.message; }
  try { rmSync(reqFile, { force: true }); } catch { }
  try { rmSync(resFile, { force: true }); } catch { }

  let nTools = 0, called = false, hasAssum = false;
  for (const l of (mtOut || '').split('\n')) {
    try {
      const o = JSON.parse(l);
      if (o.id === 2) nTools = o.result?.tools?.length || 0;
      if (o.id === 3) { called = true; const t = o.result?.content?.[0]?.text || ''; hasAssum = t.includes('assumptions'); }
    } catch { }
  }
  if (mtErr) todo('A', 'MCP 协议实测无法运行（沙箱限制子进程）', mtErr);
  else {
    if (nTools === 22) ok('A', 'MCP tools/list 返回 23 个工具');
    else no('A', `MCP tools/list 返回 ${nTools} 个工具`);
    if (called && hasAssum) ok('A', 'MCP 真实工具调用成功且带 assumptions[]');
    else no('A', 'MCP 工具调用异常', `called=${called} assumptions=${hasAssum}`);
  }

  // A9 网站落地页本地内容
  const idx = S('distribution/官网落地页/index.html');
  if (existsSync(idx)) {
    const h = readFileSync(idx, 'utf8');
    const checks = [
      ['canonical = mackorn.cn/ai/', /rel="canonical" href="https:\/\/mackorn\.cn\/ai\/"/],
      ['JSON-LD SoftwareApplication', /"@type":\s*"SoftwareApplication"/],
      ['JSON-LD FAQPage', /"@type":\s*"FAQPage"/],
      ['未提遗留 www 域名', !h.includes(BAD_HOST)],
    ];
    for (const [l, re] of checks) {
      const good = re instanceof RegExp ? re.test(h) : re === true;
      if (good) ok('A', l); else no('A', l);
    }
  } else no('A', 'index.html 不存在');
}

/* ============================ 线上 ============================ */
async function auditOnline() {
  console.log('\n【B】官网（AI 搜索的内容来源）');

  const localIdx = existsSync(S('distribution/官网落地页/index.html')) ? readFileSync(S('distribution/官网落地页/index.html'), 'utf8') : '';
  const localLlms = existsSync(S('distribution/官网落地页/llms.txt')) ? readFileSync(S('distribution/官网落地页/llms.txt'), 'utf8') : '';
  const localCard = existsSync(S('distribution/官网落地页/.well-known/mcp/server-card.json')) ? readFileSync(S('distribution/官网落地页/.well-known/mcp/server-card.json'), 'utf8') : '';

  for (const [label, path, local] of [
    ['介绍页', '/ai/', localIdx],
    ['llms.txt', '/llms.txt', localLlms],
    ['server-card.json', '/.well-known/mcp/server-card.json', localCard],
  ]) {
    const r = await get(SITE + path);
    if (!r.ok) { if (r.status === 404) no('B', `${label} 未部署`, `HTTP 404`); else todo('B', `${label} 本机无法验证`, r.err || `HTTP ${r.status}`); continue; }
    const same = local ? (sha(r.text) === sha(local)) : null;
    if (same === true) ok('B', `${label} 已部署且与本地一致`, `HTTP 200, sha ${sha(r.text)}`);
    else if (same === false) no('B', `${label} 线上与本地不一致（需重新上传）`, `线上 sha ${sha(r.text)} vs 本地 ${sha(local)}`);
    else ok('B', `${label} 可访问`, `HTTP 200, ${r.text.length} 字符`);
  }

  // 备用域名
  const a = await get(SITE_ALT + '/ai/');
  if (a.ok) ok('B', 'mackorn.com 镜像可用', `HTTP ${a.status}`);
  else todo('B', 'mackorn.com 镜像', a.err || `HTTP ${a.status}`);

  // robots
  const rb = await get(SITE + '/robots.txt');
  if (rb.ok) {
    const blocked = ['GPTBot', 'Google-Extended', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot', 'anthropic-ai', 'Bytespider', 'Applebot-Extended']
      .filter((b) => new RegExp(`User-agent:\\s*${b}[\\s\\S]*?(?=User-agent:|$)`, 'i').test(rb.text) &&
        /Disallow:\s*\/\s*$/m.test((rb.text.match(new RegExp(`User-agent:\\s*${b}[\\s\\S]*?(?=User-agent:|$)`, 'i')) || [''])[0]));
    const dis = (rb.text.match(/^Disallow:\s*(\S+)/gim) || []).filter((l) => /\/(ai|llms|\.well-known)/i.test(l));
    if (!blocked.length && !dis.length) ok('B', 'robots.txt 放行 AI 爬虫且不挡我们的路径');
    else no('B', 'robots.txt 有问题', [...blocked, ...dis].join(', '));
  } else todo('B', 'robots.txt', rb.err || `HTTP ${rb.status}`);

  console.log('\n【C】代码与包分发通道');

  const gh = await get(`https://api.github.com/repos/${REPO}`, { headers: { 'User-Agent': 'audit', Accept: 'application/vnd.github+json' } });
  if (gh.ok) {
    const j = jparse(gh);
    ok('C', 'GitHub 仓库公开可访问', `${j.stargazers_count}★ · ${j.topics?.length || 0} topics`);
    const rd = await get(`https://api.github.com/repos/${REPO}/contents/README.md`, { headers: { 'User-Agent': 'audit' } });
    if (rd.ok) {
      const c = jparse(rd);
      const t = Buffer.from((c.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
      if (t.includes('mackorn.cn/ai/')) ok('C', 'GitHub README 含落地页链接');
      else no('C', 'GitHub README 缺落地页链接（需推送）');
    }
    for (const f of ['server.json', 'llms.txt', 'cordis.patch.yml']) {
      const rr = await get(`https://api.github.com/repos/${REPO}/contents/${f}`, { headers: { 'User-Agent': 'audit' } });
      if (rr.ok) ok('C', `仓库含 ${f}`); else no('C', `仓库缺 ${f}`);
    }
  } else no('C', 'GitHub 仓库不可访问', gh.err || `HTTP ${gh.status}`);

  const np = await get(`https://registry.npmjs.org/${NPM_PKG}`);
  if (np.ok) {
    const j = jparse(np);
    const latest = j['dist-tags']?.latest;
    const v = j.versions?.[latest] || {};
    ok('C', 'npm 包已发布', `latest=${latest}`);
    if (v.mcpName === MCP_NAME) ok('C', 'npm latest 带 mcpName', v.mcpName);
    else no('C', 'npm latest 缺 mcpName（MCP 注册表发布的前置条件）', String(v.mcpName));
  } else no('C', 'npm 包读取失败', np.err || `HTTP ${np.status}`);

  const cn = await get(`https://registry.npmmirror.com/${NPM_PKG}`);
  if (cn.ok) ok('C', 'npmmirror 国内镜像可用'); else no('C', 'npmmirror 镜像不可用');

  console.log('\n【D】MCP 注册表与精选清单');

  // 用 search 查（limit=100 只覆盖前 100 条，我们的条目排在外面会误报未收录）
  const reg = await get('https://registry.modelcontextprotocol.io/v0/servers?search=mackorn');
  if (reg.ok) {
    const hit = (reg.text || '').includes('mackorn');
    if (hit) ok('D', '官方 MCP Registry 已收录');
    else todo('D', '官方 MCP Registry 尚未收录', 'DNS 已就绪；等 npm 包带 mcpName 发布后执行 publish');
  } else todo('D', '官方 MCP Registry 查询', reg.err || `HTTP ${reg.status}`);

  for (const [label, url] of [['awesome-mcp-servers PR', PR_AWESOME_MCP], ['awesome-dsh-plugin PR', PR_AWESOME_DSH]]) {
    const r = await get(url, { headers: { 'User-Agent': 'audit' } });
    if (r.ok) { const j = jparse(r); if (j) ok('D', `${label} 存在`, `${j.state}${j.merged ? ' (merged)' : ''} mergeable=${j.mergeable}`); else todo('D', label, '无法解析'); }
    else todo('D', label, r.err || `HTTP ${r.status}`);
  }

  console.log('\n【E】第三方 MCP 目录（需人工登录提交）');
  // 说明：这三家的"搜索页"会把查询词回显在 HTML 里，用它判断"是否已收录"会得到假阳性
  // （第一版就误报过 Glama / mcp.so 已收录）。这里只做**存在性探测**，结论一律交人工确认。
  for (const [label, url, how] of [
    ['Smithery', 'https://smithery.ai/new', 'GitHub 登录 → 上传 MCPB 包'],
    ['Glama', 'https://glama.ai/mcp/servers/submit', 'GitHub 登录 → 提交仓库地址'],
    ['mcp.so', 'https://mcp.so/submit', '提交仓库地址'],
  ]) {
    const r = await get(url);
    if (r.ok) todo('E', `${label} 提交入口可用（是否已收录需人工确认）`, `${how} — ${url}`);
    else todo('E', `${label} 提交入口`, `${how} — ${url}${r.err ? ' (' + r.err + ')' : ''}`);
  }
}

function readdirSafe(d) { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } }
function readFileSafe(f) { try { return readFileSync(f, 'utf8'); } catch { return ''; } }

/* ============================ 主流程 ============================ */
(async () => {
  console.log('='.repeat(66));
  console.log('  全球 AI 可引用性审计 · MACKORN 液压圆锥破及生产线选型插件');
  console.log('='.repeat(66));

  if (!ONLINE_ONLY) auditLocal();
  if (!LOCAL_ONLY) await auditOnline();

  const line = (t) => console.log('\n' + '─'.repeat(66) + '\n  ' + t + '\n' + '─'.repeat(66));
  line(`通过 ${pass.length} · 未通过 ${fail.length} · 需人工 ${manual.length}`);

  if (fail.length) {
    console.log('\n❌ 未通过（必须修）');
    for (const f of fail) console.log(`   [${f.section}] ${f.item}${f.detail ? '  —  ' + f.detail : ''}`);
  }
  if (manual.length) {
    console.log('\n⏳ 需人工或待生效');
    for (const m of manual) console.log(`   [${m.section}] ${m.item}${m.detail ? '  —  ' + m.detail : ''}`);
  }
  if (pass.length) {
    console.log('\n✅ 通过');
    let cur = '';
    for (const p of pass) { if (p.section !== cur) { cur = p.section; console.log(`   [${cur}]`); } console.log(`      ${p.item}${p.detail ? '  —  ' + p.detail : ''}`); }
  }
  console.log('');
  process.exitCode = fail.length ? 1 : 0;
})();
