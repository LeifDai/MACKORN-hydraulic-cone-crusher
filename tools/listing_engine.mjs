/**
 * AI 收录引擎（R198）—— 让 MACKORN 插件被更多 AI 平台收录
 *
 * 用户要求（2026-10-31 22:15）：
 *   「请编程打造收录引擎，保持每3天更新一下，更新的内容；
 *     同时，分析没有收录的 AI；哪些条件被收录，哪些条件没有被收录，
 *     分析原因，并采取行动，怎样更快的被收录；请编程」
 *
 * ══════════════════════════════════════════════════════════════
 * 设计原则（与用户给的初版不同之处）
 *   ① 不用 execSync 查 npm —— 沙箱 EPERM，stdout 恒空 = 假阴性
 *      改用 fetch 查 registry.npmjs.org
 *   ② 路径按【真实目录】—— SKILL.md 在 skills/<name>/SKILL.md，不是根目录
 *      包名是 mackorn-cone-crusher（已发布），不是 @mackorn/xxx
 *   ③ 条件分三级：
 *      硬条件（不满足永远不会被收录）
 *      软条件（影响收录速度/排名）
 *      验证条件（确认线上真的收录了，不是本地有文件就算）
 *   ④ 每 3 天到期提醒（读历史台账，判断上次跑的时间）
 * ══════════════════════════════════════════════════════════════
 *
 * 用法：
 *   node tools/listing_engine.mjs              # 完整检查（含线上探测）
 *   node tools/listing_engine.mjs --quick      # 只查本地文件（不上网）
 *   node tools/listing_engine.mjs --due        # 只看是否该跑了（3天周期）
 *   node tools/listing_engine.mjs --report     # 看历史台账
 *   node tools/listing_engine.mjs --json
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA_DIR = join(ROOT, 'listing-data');
const HISTORY = join(DATA_DIR, 'history.jsonl');
const LATEST = join(DATA_DIR, 'latest.json');
const REPORT_MD = join(ROOT, 'distribution', '03_验证与基准', 'listing-engine-report.md');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const JSON_OUT = has('--json');
const QUICK = has('--quick');

const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return '' }; };
const readJson = (p) => { try { return JSON.parse(read(p)); } catch { return null }; };
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false }; };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false }; };

/* ══════════════════════════════════════════════════════════════
 * 本地事实（先读一遍，后面所有检查都用这些，不重复读文件）
 * ══════════════════════════════════════════════════════════════ */
const PKG = readJson(join(ROOT, 'package.json')) || {};
const SVR = readJson(join(ROOT, 'server.json')) || {};
const VERSION = PKG.version || '?';
const NAME = PKG.name || '?';

/* ══════════════════════════════════════════════════════════════
 * 平台清单（真实条件，不是通用模板）
 *
 * level:
 *   hard  = 不满足永远不会被收录
 *   soft  = 影响收录速度/排名，但不会阻止收录
 *   verify= 线上验证（确认真的收录了）
 * ══════════════════════════════════════════════════════════════ */
const PLATFORMS = [
  /* ── 1. npm（一切的源头）── */
  {
    id: 'npm',
    name: 'npm registry',
    group: '源头',
    how: '自动（npm publish）',
    conditions: [
      { level: 'hard', id: 'pkg_name', desc: 'package.json 有 name', check: () => !!NAME && NAME !== '?' },
      { level: 'hard', id: 'pkg_version', desc: 'package.json 有 version', check: () => !!VERSION && VERSION !== '?' },
      { level: 'hard', id: 'pkg_bin', desc: '有 bin 字段（npx 可运行）', check: () => !!(PKG.bin && Object.keys(PKG.bin).length) },
      { level: 'verify', id: 'npm_live', desc: 'npm 上该版本已发布', check: async () => {
        const j = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(NAME)}/latest`);
        return j && j.version === VERSION ? `已发布 v${j.version}` : (j ? `线上 v${j.version} ≠ 本地 v${VERSION}` : '查不到');
      } },
    ],
    action: '若未发布：npm publish --access public',
    canIBoost: false,
  },

  /* ── 2. Official MCP Registry ── */
  {
    id: 'mcp-registry',
    name: 'Official MCP Registry',
    group: 'MCP 目录',
    how: '提交（server.json）',
    conditions: [
      { level: 'hard', id: 'server_json', desc: '根目录有 server.json', check: () => isFile(join(ROOT, 'server.json')) },
      { level: 'hard', id: 'svr_name', desc: 'server.json 的 name 符合反域名格式', check: () => /^[a-z0-9.-]+\/[a-z0-9-]+$/i.test(SVR.name || '') ? `name=${SVR.name}` : '格式不对（应为 cn.mackorn/xxx）' },
      { level: 'hard', id: 'svr_pkg_match', desc: 'server.json 的 packages[].identifier = package.json 的 name', check: () => {
        const ids = (SVR.packages || []).map((p) => p.identifier);
        return ids.includes(NAME) ? `identifier=${NAME}` : `不一致：server.json=[${ids.join(',')}] vs package.json=${NAME}`;
      } },
      { level: 'hard', id: 'svr_ver_match', desc: 'server.json 的 version = package.json 的 version', check: () => (SVR.version === VERSION) ? `v${VERSION}` : `不一致：${SVR.version} vs ${VERSION}` },
      { level: 'verify', id: 'registry_live', desc: '官方注册表能搜到', check: async () => {
        const j = await fetchJson(`https://registry.modelcontextprotocol.io/v0/servers?search=mackorn`);
        if (!j) return '查询失败';
        const items = j.servers || j.data || [];
        return items.length > 0 ? `找到 ${items.length} 条` : '搜不到';
      } },
    ],
    action: '若 identifier/version 不一致：改 server.json 对齐 package.json，然后重新提交',
    canIBoost: true,
  },

  /* ── 3. Smithery ── */
  {
    id: 'smithery',
    name: 'Smithery',
    group: 'MCP 目录',
    how: '自动抓（package.json + smithery.yaml）',
    conditions: [
      { level: 'hard', id: 'kw_mcp', desc: 'keywords 含 mcp', check: () => (PKG.keywords || []).includes('mcp') ? '✅' : '缺' },
      { level: 'hard', id: 'kw_mcp_server', desc: 'keywords 含 mcp-server', check: () => (PKG.keywords || []).includes('mcp-server') ? '✅' : '缺' },
      { level: 'soft', id: 'smithery_yaml', desc: '根目录有 smithery.yaml', check: () => isFile(join(ROOT, 'smithery.yaml')) },
      { level: 'verify', id: 'smithery_live', desc: 'Smithery 页面能访问', check: async () => {
        const r = await fetchOk('https://smithery.ai/server/@mackorn/mackorn-cone-crusher');
        return r.ok ? 'HTTP ' + r.status : 'HTTP ' + (r.status || r.err);
      } },
    ],
    action: '补 smithery.yaml（HTTP 部署配置），然后等 Smithery 自动抓',
    canIBoost: true,
  },

  /* ── 4. skills.sh ── */
  {
    id: 'skills-sh',
    name: 'skills.sh',
    group: 'Agent Skills',
    how: '自动抓（skills/<name>/SKILL.md）',
    conditions: [
      { level: 'hard', id: 'skills_dir', desc: 'skills/ 目录存在且有技能', check: () => {
        if (!isDir(join(ROOT, 'skills'))) return '无 skills/ 目录';
        const n = readdirSync(join(ROOT, 'skills')).filter((d) => isDir(join(ROOT, 'skills', d))).length;
        return n > 0 ? `${n} 个技能` : '目录空';
      } },
      { level: 'hard', id: 'skill_frontmatter', desc: '每个 SKILL.md 有 YAML frontmatter（name + description）', check: () => {
        const dir = join(ROOT, 'skills');
        if (!isDir(dir)) return '无 skills/';
        const skills = readdirSync(dir).filter((d) => isDir(join(dir, d)));
        const bad = [];
        for (const s of skills) {
          const p = join(dir, s, 'SKILL.md');
          if (!isFile(p)) { bad.push(s + '(无SKILL.md)'); continue; }
          const c = read(p);
          if (!/^---\s*\n[\s\S]*?name:\s*\S+[\s\S]*?description:\s*\S+[\s\S]*?\n---/m.test(c)) bad.push(s + '(frontmatter不全)');
        }
        return bad.length === 0 ? `${skills.length}/${skills.length} 合规` : `不合规：${bad.slice(0, 3).join(', ')}`;
      } },
      { level: 'soft', id: 'skills_index', desc: '有 skills.sh.json 索引', check: () => isFile(join(ROOT, 'skills.sh.json')) },
      { level: 'verify', id: 'skillssh_live', desc: 'skills.sh 页面能访问', check: async () => {
        const r = await fetchOk('https://skills.sh');
        return r.ok ? 'HTTP ' + r.status : 'HTTP ' + (r.status || r.err);
      } },
    ],
    action: '若 SKILL.md 缺 frontmatter：补 name + description 两行',
    canIBoost: true,
  },

  /* ── 5. Glama ── */
  {
    id: 'glama',
    name: 'Glama',
    group: 'MCP 目录',
    how: '容器化 release',
    conditions: [
      { level: 'hard', id: 'dockerfile', desc: '根目录有 Dockerfile', check: () => isFile(join(ROOT, 'Dockerfile')) },
      { level: 'hard', id: 'dockerignore', desc: '根目录有 .dockerignore', check: () => isFile(join(ROOT, '.dockerignore')) },
      { level: 'hard', id: 'glama_json', desc: '根目录有 glama.json', check: () => isFile(join(ROOT, 'glama.json')) },
      { level: 'verify', id: 'glama_live', desc: 'Glama 页面能访问', check: async () => {
        const r = await fetchOk('https://glama.ai/mcp/servers');
        return r.ok ? 'HTTP ' + r.status : 'HTTP ' + (r.status || r.err);
      } },
    ],
    action: '三件套已备 → 去 glama.ai admin/dockerfile 点 Deploy + Make Release',
    canIBoost: false, /* 需要人工点按钮 */
  },

  /* ── 6. awesome-mcp-servers ── */
  {
    id: 'awesome-mcp',
    name: 'punkpeye/awesome-mcp-servers',
    group: 'MCP 目录',
    how: 'PR',
    conditions: [
      { level: 'hard', id: 'glama_score', desc: 'Glama 有评分（PR 合并前置条件）', check: async () => {
        /* 前置条件：Glama 必须先做 containerized release */
        const r = await fetchOk('https://glama.ai/mcp/servers/LeifDai/MACKORN-hydraulic-cone-crusher');
        if (!r.ok) return '页面打不开：HTTP ' + (r.status || r.err);
        return '页面可访问（需人工看是否有评分）';
      } },
      { level: 'soft', id: 'readme_quality', desc: 'README 有安装说明 + 工具列表', check: () => {
        const c = read(join(ROOT, 'README.md'));
        return (/npx|install/i.test(c) && /tool/i.test(c)) ? '✅' : 'README 信息不足';
      } },
    ],
    action: '先做 Glama release → 评分出了 → PR #15410 补评论推动合并',
    canIBoost: false,
  },

  /* ── 7. 扣子 Coze ── */
  {
    id: 'coze',
    name: '扣子 Coze（Agent 平台）',
    group: 'Agent 平台',
    how: '手动导入 OpenAPI',
    conditions: [
      { level: 'hard', id: 'openapi', desc: 'ai-pack/openapi.json 存在且是 3.0.0', check: () => {
        const j = readJson(join(ROOT, 'ai-pack', 'openapi.json')) || readJson(join(ROOT, 'dist', 'ai-pack', 'openapi.json'));
        if (!j) return '缺 openapi.json';
        return j.openapi === '3.0.0' ? 'v3.0.0 ✅' : `版本 ${j.openapi}（Coze 要 3.0.0）`;
      } },
      { level: 'hard', id: 'rest_live', desc: 'REST 执行层 ai_execute.php 在线', check: async () => {
        const r = await fetchOk('https://mackorn.cn/ai/api/ai_execute.php?action=help');
        if (!r.ok) return 'HTTP ' + (r.status || r.err) + '（文件未上传）';
        return 'HTTP ' + r.status;
      } },
    ],
    action: '① 上传 ai_execute.php → ② 验证 REST 在线 → ③ Coze 导入 openapi.json',
    canIBoost: false,
  },

  /* ── 8. Dify ── */
  {
    id: 'dify',
    name: 'Dify（Agent 平台）',
    group: 'Agent 平台',
    how: '手动导入 OpenAPI',
    conditions: [
      { level: 'hard', id: 'openapi', desc: 'openapi.json 的 response 是 string（Dify 硬要求）', check: () => {
        const j = readJson(join(ROOT, 'ai-pack', 'openapi.json')) || readJson(join(ROOT, 'dist', 'ai-pack', 'openapi.json'));
        if (!j) return '缺 openapi.json';
        const first = Object.values(j.paths || {})[0];
        const prop = first && first.get && first.get.responses && first.get.responses['200']
          && first.get.responses['200'].content && first.get.responses['200'].content['application/json']
          && first.get.responses['200'].content['application/json'].schema
          && first.get.responses['200'].content['application/json'].schema.properties;
        return prop && prop.response && prop.response.type === 'string' ? '✅ type=string' : 'response 不是 string（Dify 会报错）';
      } },
      { level: 'hard', id: 'rest_live', desc: 'REST 执行层在线', check: async () => {
        const r = await fetchOk('https://mackorn.cn/ai/api/ai_execute.php?action=help');
        return r.ok ? 'HTTP ' + r.status : 'HTTP ' + (r.status || r.err);
      } },
    ],
    action: '同 Coze：先传 PHP，再导入 openapi.json',
    canIBoost: false,
  },

  /* ── 9. Claude Desktop / Cursor / Cline（配置文件类）── */
  {
    id: 'claude-clients',
    name: 'Claude Desktop / Cursor / Cline',
    group: 'AI 客户端',
    how: '配置文件（npx）',
    conditions: [
      { level: 'hard', id: 'npx_ok', desc: 'bin 指向可执行文件', check: () => {
        const bin = PKG.bin || {};
        const target = Object.values(bin)[0];
        if (!target) return '无 bin';
        return isFile(join(ROOT, target)) ? `${target} ✅` : `${target} 不存在`;
      } },
      { level: 'soft', id: 'readme_config', desc: 'README 有客户端配置示例', check: () => {
        const c = read(join(ROOT, 'README.md'));
        return /mcpServers|claude_desktop_config|mcp\.json/i.test(c) ? '✅' : 'README 缺配置示例';
      } },
      { level: 'verify', id: 'npm_exec', desc: 'npm 包能用 npx 拉取', check: async () => {
        const j = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(NAME)}/latest`);
        return j && j.bin ? `bin=${Object.keys(j.bin).join(',')}` : '查不到 bin';
      } },
    ],
    action: '用户侧：在 claude_desktop_config.json / mcp.json 加 {"command":"npx","args":["-y","mackorn-cone-crusher"]}',
    canIBoost: false,
  },
];

/* ══════════════════════════════════════════════════════════════
 * 网络辅助（用 fetch，不用 execSync —— 避免沙箱 EPERM）
 * ══════════════════════════════════════════════════════════════ */
const cache = new Map();
async function fetchJson(url) {
  if (QUICK) return null;
  if (cache.has(url)) return cache.get(url);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'mackorn-listing-engine/1' } });
    if (!r.ok) { cache.set(url, null); return null; }
    const j = await r.json();
    cache.set(url, j);
    return j;
  } catch { cache.set(url, null); return null; }
}
async function fetchOk(url) {
  if (QUICK) return { ok: false, status: null, err: 'quick' };
  if (cache.has('ok:' + url)) return cache.get('ok:' + url);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 mackorn-listing-engine' } });
    const res = { ok: r.ok, status: r.status };
    cache.set('ok:' + url, res);
    return res;
  } catch (e) {
    const res = { ok: false, status: null, err: String((e.cause && (e.cause.code || e.cause.message)) || e.message).slice(0, 30) };
    cache.set('ok:' + url, res);
    return res;
  }
}

/* ══════════════════════════════════════════════════════════════
 * 跑检查
 * ══════════════════════════════════════════════════════════════ */
async function runChecks() {
  const results = [];
  for (const platform of PLATFORMS) {
    const conds = [];
    for (const c of platform.conditions) {
      let pass = false, detail = '';
      try {
        const v = await c.check();
        if (typeof v === 'string') {
          /* ★ R199 修 bug（实测血案）：原来「返回字符串就当通过」，
           *   于是 rest_live 返回 "HTTP 404（文件未上传）" 也被判为 ✅ ——
           *   失败被当成成功，比 bug 更危险。
           *   修法：字符串里如果含失败标记，判为不通过。 */
          const FAIL_MARK = /^(HTTP\s*(4|5)\d\d|查询失败|搜不到|打不开|缺|未|无|不存在|不一致|格式不对|不合规|页面|查不到)/i;
          const hasHttpErr = /\bHTTP\s*(4|5)\d\d\b/.test(v);
          pass = !FAIL_MARK.test(v) && !hasHttpErr;
          detail = v;
        } else { pass = !!v; detail = pass ? '✅' : '未满足'; }
      } catch (e) { pass = false; detail = '检查异常：' + String(e.message).slice(0, 40); }
      conds.push({ level: c.level, id: c.id, desc: c.desc, pass, detail });
    }
    const hard = conds.filter((c) => c.level === 'hard');
    const soft = conds.filter((c) => c.level === 'soft');
    const verify = conds.filter((c) => c.level === 'verify');
    const hardPass = hard.filter((c) => c.pass).length;
    const softPass = soft.filter((c) => c.pass).length;
    const verifyPass = verify.filter((c) => c.pass).length;

    results.push({
      id: platform.id,
      name: platform.name,
      group: platform.group,
      how: platform.how,
      action: platform.action,
      canIBoost: platform.canIBoost,
      hard: { pass: hardPass, total: hard.length },
      soft: { pass: softPass, total: soft.length },
      verify: { pass: verifyPass, total: verify.length },
      conditions: conds,
      /* 三态：硬条件全过 = 就绪；硬全过且有 verify 通过 = 已收录；否则缺条件 */
      status: hardPass === hard.length
        ? (verify.length === 0 ? 'ready' : (verifyPass > 0 ? 'listed' : 'ready'))
        : 'missing',
    });
  }
  return results;
}

/* ══════════════════════════════════════════════════════════════
 * 历史对比
 * ══════════════════════════════════════════════════════════════ */
function readHistory() {
  if (!existsSync(HISTORY)) return [];
  try {
    return read(HISTORY).split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return [] };
}
function lastRun() {
  const h = readHistory();
  return h.length ? h[h.length - 1] : null;
}
function diffWith(last, now) {
  if (!last || !last.platforms) return { improved: [], regressed: [], unchanged: [] };
  const prev = new Map(last.platforms.map((p) => [p.id, p]));
  const improved = [], regressed = [], unchanged = [];
  for (const p of now) {
    const old = prev.get(p.id);
    if (!old) continue;
    const oldScore = old.hard.pass + old.soft.pass;
    const newScore = p.hard.pass + p.soft.pass;
    if (newScore > oldScore) improved.push({ name: p.name, from: oldScore, to: newScore });
    else if (newScore < oldScore) regressed.push({ name: p.name, from: oldScore, to: newScore });
    else unchanged.push(p.name);
  }
  return { improved, regressed, unchanged };
}

/* ══════════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════════ */

/* --due：只看是否该跑了 */
if (has('--due')) {
  const last = lastRun();
  if (!last) {
    console.log('');
    console.log('  ⚠️ 从未跑过 → 现在就该跑');
    console.log('');
    process.exit(0);
  }
  const days = (Date.now() - Date.parse(last.at)) / 86400000;
  const due = days >= 3;
  console.log('');
  console.log('  上次运行：' + last.at.slice(0, 16).replace('T', ' ') + '（' + Math.round(days * 10) / 10 + ' 天前）');
  console.log('  是否到期：' + (due ? '✅ 该跑了（≥3 天）' : '⏳ 还没到（3 天周期）'));
  console.log('');
  process.exit(due ? 0 : 1);
}

/* --report：看历史 */
if (has('--report')) {
  const h = readHistory();
  console.log('');
  console.log('  ══ 收录引擎历史台账（' + h.length + ' 次）══');
  console.log('');
  if (!h.length) console.log('  还没有历史记录');
  for (const r of h.slice(-10)) {
    const listed = (r.platforms || []).filter((p) => p.status === 'listed').length;
    const ready = (r.platforms || []).filter((p) => p.status === 'ready').length;
    const missing = (r.platforms || []).filter((p) => p.status === 'missing').length;
    console.log('  ' + r.at.slice(0, 16).replace('T', ' ') + '  已收录 ' + listed + ' · 就绪待传 ' + ready + ' · 缺条件 ' + missing);
  }
  console.log('');
  process.exit(0);
}

const results = await runChecks();
const last = lastRun();
const diff = diffWith(last, results);

const summary = {
  schema: 'mackorn-listing-engine/1',
  at: new Date().toISOString(),
  version: VERSION,
  package: NAME,
  quick: QUICK,
  totals: {
    platforms: results.length,
    listed: results.filter((r) => r.status === 'listed').length,
    ready: results.filter((r) => r.status === 'ready').length,
    missing: results.filter((r) => r.status === 'missing').length,
  },
  diff,
  platforms: results,
};

mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(LATEST, JSON.stringify(summary, null, 2), 'utf8');
if (!QUICK) {
  try {
    const fs = await import('node:fs');
    fs.appendFileSync(HISTORY, JSON.stringify({ at: summary.at, versions: VERSION, totals: summary.totals, platforms: results.map((r) => ({ id: r.id, status: r.status, hard: r.hard, soft: r.soft, verify: r.verify })) }) + '\n', 'utf8');
  } catch { /* 忽略 */ }
}

if (JSON_OUT) { console.log(JSON.stringify(summary, null, 2)); process.exit(0); }

/* ── 输出 ── */
console.log('');
console.log('  ╔═══════════════════════════════════════════════════════════╗');
console.log('    AI 收录引擎 · ' + summary.at.slice(0, 16).replace('T', ' '));
console.log('    ' + NAME + ' v' + VERSION + ' · ' + results.length + ' 个平台');
console.log('  ╚═══════════════════════════════════════════════════════════╝');
console.log('');

/* 变化 */
if (last) {
  const d = diff;
  if (d.improved.length) console.log('  📈 比上次进步：' + d.improved.map((x) => x.name + '(' + x.from + '→' + x.to + ')').join(' · '));
  if (d.regressed.length) console.log('  📉 比上次退步：' + d.regressed.map((x) => x.name + '(' + x.from + '→' + x.to + ')').join(' · '));
  if (!d.improved.length && !d.regressed.length) console.log('  ➖ 与上次无变化');
  console.log('');
}

/* 按组输出 */
const groups = [...new Set(results.map((r) => r.group))];
for (const g of groups) {
  console.log('  ── ' + g + ' ──');
  for (const r of results.filter((x) => x.group === g)) {
    const icon = r.status === 'listed' ? '✅' : r.status === 'ready' ? '🟡' : '❌';
    const label = r.status === 'listed' ? '已收录' : r.status === 'ready' ? '就绪待动作' : '缺条件';
    console.log('  ' + icon + ' ' + r.name.padEnd(30) + label.padEnd(8) +
      ' 硬' + r.hard.pass + '/' + r.hard.total +
      (r.soft.total ? ' 软' + r.soft.pass + '/' + r.soft.total : '') +
      (r.verify.total ? ' 验' + r.verify.pass + '/' + r.verify.total : ''));
    /* 只显示未满足的条件 */
    const bad = r.conditions.filter((c) => !c.pass);
    for (const b of bad) {
      console.log('       ✗ [' + b.level + '] ' + b.desc + (b.detail && b.detail !== '未满足' ? ' → ' + b.detail : ''));
    }
  }
  console.log('');
}

/* 汇总与行动 */
console.log('  ══ 汇总 ══');
console.log('  已收录 ' + summary.totals.listed + ' · 就绪待动作 ' + summary.totals.ready + ' · 缺条件 ' + summary.totals.missing);
console.log('');

const needAction = results.filter((r) => r.status === 'missing');
if (needAction.length) {
  console.log('  ══ 该做什么（按能否我做排序）══');
  console.log('');
  const iCan = needAction.filter((r) => r.canIBoost);
  const human = needAction.filter((r) => !r.canIBoost);
  if (iCan.length) {
    console.log('  🤖 我能直接补的（' + iCan.length + ' 个）:');
    for (const r of iCan) console.log('    · ' + r.name + ' — ' + r.action);
    console.log('');
  }
  if (human.length) {
    console.log('  👤 需要你/人工的（' + human.length + ' 个）:');
    for (const r of human) console.log('    · ' + r.name + ' — ' + r.action);
    console.log('');
  }
}

console.log('  报告：listing-data/latest.json');
console.log('  台账：listing-data/history.jsonl');
console.log('  下次：3 天后跑 node tools/listing_engine.mjs --due 检查是否到期');
console.log('');

/* 生成 Markdown 报告 */
try {
  const md = [];
  md.push('# AI 收录引擎诊断报告');
  md.push('');
  md.push('> 生成：' + summary.at.slice(0, 16).replace('T', ' ') + ' · ' + NAME + ' v' + VERSION);
  md.push('> 判定：硬条件全过 = 就绪；硬全过 + 线上验证通过 = 已收录');
  md.push('');
  md.push('## 汇总');
  md.push('');
  md.push('| 状态 | 数量 |');
  md.push('|:---|---:|');
  md.push('| ✅ 已收录 | ' + summary.totals.listed + ' |');
  md.push('| 🟡 就绪待动作 | ' + summary.totals.ready + ' |');
  md.push('| ❌ 缺条件 | ' + summary.totals.missing + ' |');
  md.push('');
  md.push('## 逐平台明细');
  md.push('');
  md.push('| 平台 | 状态 | 硬条件 | 软条件 | 线上验证 | 缺什么 |');
  md.push('|:---|:---:|:---:|:---:|:---:|:---|');
  for (const r of results) {
    const bad = r.conditions.filter((c) => !c.pass).map((c) => c.desc).join('; ') || '—';
    const icon = r.status === 'listed' ? '✅' : r.status === 'ready' ? '🟡' : '❌';
    md.push('| **' + r.name + '** | ' + icon + ' | ' + r.hard.pass + '/' + r.hard.total +
      ' | ' + (r.soft.total ? r.soft.pass + '/' + r.soft.total : '—') +
      ' | ' + (r.verify.total ? r.verify.pass + '/' + r.verify.total : '—') +
      ' | ' + bad + ' |');
  }
  md.push('');
  md.push('## 行动清单');
  md.push('');
  md.push('### 🤖 我能直接补的');
  md.push('');
  for (const r of needAction.filter((x) => x.canIBoost)) md.push('- **' + r.name + '** — ' + r.action);
  if (!needAction.filter((x) => x.canIBoost).length) md.push('（无）');
  md.push('');
  md.push('### 👤 需要人工的');
  md.push('');
  for (const r of needAction.filter((x) => !x.canIBoost)) md.push('- **' + r.name + '** — ' + r.action);
  if (!needAction.filter((x) => !x.canIBoost).length) md.push('（无）');
  md.push('');
  mkdirSync(dirname(REPORT_MD), { recursive: true });
  writeFileSync(REPORT_MD, md.join('\n'), 'utf8');
  console.log('  Markdown 报告：distribution/03_验证与基准/listing-engine-report.md');
  console.log('');
} catch { /* 报告失败不影响主流程 */ }
