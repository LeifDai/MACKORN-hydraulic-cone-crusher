/**
 * AI 收录原因诊断器（R129）
 *
 * 用户要求（2026-10-21）：
 *   「随时询问不同的 AI 没有收录的原因，针对原因，做定向的优化改进，
 *     让领先的 AI 都收录我们，随时能被调用到。」
 *
 * ★ 与 ai_coverage.mjs 的区别：
 *   ai_coverage.mjs 只回答「有没有收录」（YES/NO）。
 *   本工具回答「为什么没收录」—— 对每个平台列出【收录条件清单】，
 *   逐条检查我们满足没有，输出「缺哪一条」。
 *   这才是「定向优化」的依据。
 *
 * ★ 收录条件从哪来（必须可核查，不编造）：
 *   ① 平台官方文档（已抓取并写进 REQUIREMENTS，每条带 source）
 *   ② 平台 API 的规范要求（如 MCP Registry 的 schema）
 *   ③ 平台实际行为反推（如 404 = 该路径没有我们的条目）
 *
 * ★ 诚实边界：
 *   · 部分平台的收录条件官方没公开细则 → 标注 confidence: 'inferred'
 *   · 有些条件是"软性的"（如审核偏好）→ 无法自动检查，标 manual
 *   · 本工具只诊断，不做提交（提交需账号，见『AI目录提交材料包』）
 *
 * 用法：
 *   node tools/ai_rejection_diagnoser.mjs              # 全平台诊断
 *   node tools/ai_rejection_diagnoser.mjs --only glama,smithery
 *   node tools/ai_rejection_diagnoser.mjs --json
 *   node tools/ai_rejection_diagnoser.mjs --fixable    # 只列「我们能改的」
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync as readdirSyncSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'distribution', '03_验证与基准');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };

/* ══════════════════════════════════════════════════════════════
 * 我们的「可检查状态」—— 一次性收集，供所有 requirement 判定
 * ══════════════════════════════════════════════════════════════ */
function collectState() {
  const s = {};

  /* ① package.json */
  try {
    const p = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    s.pkg = { name: p.name, version: p.version, description: p.description, bin: p.bin, license: p.license, repository: p.repository, keywords: p.keywords || [], files: p.files || [], dependencies: p.dependencies || {} };
  } catch { s.pkg = null; }

  /* ② server.json（MCP Registry 用） */
  try {
    s.serverJson = JSON.parse(readFileSync(join(ROOT, 'server.json'), 'utf8'));
  } catch { s.serverJson = null; }

  /* ③ tools 数与描述 */
  try {
    const idx = readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8');
    s.tools = [...new Set([...idx.matchAll(/^\s{2}name: '(mackorn_[a-z_]+)',/gm)].map((m) => m[1]))];
  } catch { s.tools = []; }

  /* ④ skills */
  s.skills = [];
  try {
    const sd = join(ROOT, 'skills');
    if (existsSync(sd)) {
      for (const d of readdirSyncSafe(sd)) {
        const sk = join(sd, d, 'SKILL.md');
        if (existsSync(sk)) {
          const txt = readFileSync(sk, 'utf8');
          const fm = txt.match(/^---\n([\s\S]*?)\n---/);
          s.skills.push({ name: d, hasFrontmatter: !!fm, hasName: fm ? /name\s*:/.test(fm[1]) : false, hasDesc: fm ? /description\s*:/.test(fm[1]) : false, bytes: txt.length });
        }
      }
    }
  } catch { }

  /* ⑤ README / llms.txt / LICENSE */
  s.hasReadme = existsSync(join(ROOT, 'README.md'));
  s.hasLlmsTxt = existsSync(join(ROOT, 'llms.txt')) || existsSync(join(ROOT, 'public-overrides', 'llms.txt'));
  s.hasLicense = existsSync(join(ROOT, 'LICENSE'));
  s.hasDockerfile = existsSync(join(ROOT, 'Dockerfile'));
  s.hasCitation = existsSync(join(ROOT, 'CITATION.cff'));

  /* ⑥ 远程端点可达性（读 reachability.json 结果） */
  try {
    const r = JSON.parse(readFileSync(join(OUT_DIR, 'reachability.json'), 'utf8'));
    s.reachability = r;
    s.remoteOk = r.verdict === 'GREEN';
    s.dnsOk = r.dns ? r.dns.ok : false;
    s.sslOk = r.ssl ? r.ssl.ok : false;
  } catch { s.reachability = null; s.remoteOk = null; s.dnsOk = null; s.sslOk = null; }

  /* ⑦ 收录探测结果（读 ai-coverage.json） */
  try {
    s.coverage = JSON.parse(readFileSync(join(OUT_DIR, 'ai-coverage.json'), 'utf8'));
  } catch { s.coverage = null; }

  return s;
}

function readdirSyncSafe(d) {
  /* R130 修 bug：原实现用 require('node:fs') —— ESM 里 require 不可用，
   * 导致 skills 永远检测为 0。改用顶部已导入的 readdirSyncSync。 */
  try { return readdirSyncSync(d); } catch { return []; }
}

const STATE = collectState();

/* ══════════════════════════════════════════════════════════════
 * 每个平台的「收录条件清单」
 *
 * 每条 requirement:
 *   id       简短标识
 *   desc     人话描述
 *   check    () => true | false | null(无法自动查)
 *   fixable  我们能不能改（true=能，false=需账号/外部）
 *   how      如果 false，怎么改
 *   source   条件来源（必须可核查）
 *   confidence  'official'(官方明确) | 'inferred'(反推) | 'unknown'
 * ══════════════════════════════════════════════════════════════ */
function buildPlatforms() {
  return [
    /* ══════ Official MCP Registry ══════ */
    {
      id: 'mcp-registry', name: 'Official MCP Registry',
      status: coverageOf('mcp-registry'),
      reqs: [
        {
          id: 'server-json-exists', desc: '必须有 server.json（MCP Registry 的唯一抓取入口）',
          check: () => !!STATE.serverJson,
          fixable: true,
          how: '仓库根目录建 server.json',
          source: 'https://registry.modelcontextprotocol.io/ 官方文档',
          confidence: 'official',
        },
        {
          id: 'name-reverse-dns', desc: 'server.json 的 name 必须是反向域名格式（如 cn.mackorn/xxx）',
          check: () => !!(STATE.serverJson && /^[a-z0-9.-]+\/[a-z0-9._-]+$/i.test(STATE.serverJson.name || '')),
          fixable: true,
          how: 'server.json 的 name 改成 cn.mackorn/mackorn-cone-crusher',
          source: 'MCP Registry schema：name 要求 reverse-DNS 命名空间',
          confidence: 'official',
        },
        {
          id: 'packages-declared', desc: 'server.json 必须声明 packages（怎么安装）',
          check: () => !!(STATE.serverJson && Array.isArray(STATE.serverJson.packages) && STATE.serverJson.packages.length > 0),
          fixable: true,
          how: '加 packages 数组，含 registryType: npm, identifier, version',
          source: 'MCP Registry schema 要求',
          confidence: 'official',
        },
        {
          id: 'version-match', desc: 'server.json 的 version 必须与 npm 包版本一致',
          check: () => !!(STATE.serverJson && STATE.pkg && STATE.serverJson.version === STATE.pkg.version),
          fixable: true,
          how: '跑 node tools/sync_version.mjs --write',
          source: 'MCP Registry 会校验版本一致性',
          confidence: 'official',
        },
        {
          id: 'description-present', desc: '必须有 description（≥10 字）',
          check: () => !!(STATE.serverJson && (STATE.serverJson.description || '').length >= 10),
          fixable: true,
          how: '补 server.json 的 description',
          source: 'MCP Registry schema',
          confidence: 'official',
        },
      ],
    },

    /* ══════ Glama ══════ */
    {
      id: 'glama', name: 'Glama',
      status: coverageOf('glama'),
      reqs: [
        {
          id: 'mcp-endpoint-reachable', desc: '★ MCP 端点必须可被探测（Glama 会主动连）',
          check: () => STATE.remoteOk === true,
          fixable: false,
          how: '★ 修 DNS + SSL：目前主要矛盾是裸域 mackorn.cn 无 A 记录',
          source: 'Glama 实测：页面显示 "cannot be deployed" + "Responsiveness: Unresponsive"',
          confidence: 'inferred',
        },
        {
          id: 'tools-enumerable', desc: '端点必须能列出工具（tools/list）',
          check: () => STATE.remoteOk === true && STATE.tools.length > 0,
          fixable: false,
          how: '同上，先修 DNS+SSL',
          source: 'Glama 会调 tools/list 统计工具数',
          confidence: 'inferred',
        },
        {
          id: 'readme-has-name', desc: 'README 必须含项目名（Glama 从 README 抓元数据）',
          check: () => STATE.hasReadme,
          fixable: true,
          how: '已有 README',
          source: 'Glama 页面显示的描述来自 GitHub README',
          confidence: 'inferred',
        },
        {
          id: 'tools-count-fresh', desc: '★ Glama 缓存的工具数是 19，实际 29 —— 需重新抓取',
          check: () => false,  /* 已知缓存问题 */
          fixable: false,
          how: '修好 DNS+SSL 后去 Glama 后台点 Refresh / Re-evaluate',
          source: '实测 Glama 页面显示 "19 tools"，仓库实际 29 个',
          confidence: 'official',
        },
      ],
    },

    /* ══════ Smithery ══════ */
    {
      id: 'smithery', name: 'Smithery',
      status: coverageOf('smithery'),
      reqs: [
        {
          id: 'stdio-startable', desc: '必须能通过 npx 启动 stdio MCP server',
          check: () => !!(STATE.pkg && STATE.pkg.bin && Object.keys(STATE.pkg.bin).length > 0),
          fixable: true,
          how: 'package.json 的 bin 已配（mackorn-cone-crusher / mackorn-mcp）',
          source: 'Smithery 通过 npx 启动并握手',
          confidence: 'official',
        },
        {
          id: 'description-present', desc: 'package.json 必须有 description',
          check: () => !!(STATE.pkg && (STATE.pkg.description || '').length >= 10),
          fixable: true,
          how: '已有',
          source: 'Smithery 从 npm 元数据读取',
          confidence: 'official',
        },
        {
          id: 'config-schema-optional', desc: '可选：smithery.yaml 声明配置 schema（我们没有，但不阻塞）',
          check: () => existsSync(join(ROOT, 'smithery.yaml')),
          fixable: true,
          how: '可选：加 smithery.yaml 声明无需 API key',
          source: 'Smithery 文档：有配置项时必须声明',
          confidence: 'official',
        },
      ],
    },

    /* ══════ mcp.so ══════ */
    {
      id: 'mcp-so', name: 'mcp.so',
      status: coverageOf('mcp-so'),
      reqs: [
        {
          id: 'github-topic', desc: 'GitHub 仓库必须有 mcp-server topic（mcp.so 自动抓）',
          check: () => null,  /* 需 GitHub API 查 topic，标注无法自动查 */
          fixable: false,
          how: '去 GitHub 仓库 Settings → Topics 加 mcp-server / mcp',
          source: 'mcp.so 从 GitHub topic 抓取',
          confidence: 'inferred',
        },
        {
          id: 'manual-submit', desc: '★ 需手工提交（mcp.so 无纯自动收录）',
          check: () => false,
          fixable: false,
          how: '去 https://mcp.so/ 提交，材料见 📤AI目录提交材料包.md',
          source: '实测 https://mcp.so/server/mackorn-cone-crusher 返回 404',
          confidence: 'official',
        },
      ],
    },

    /* ══════ MCP-X ══════ */
    {
      id: 'mcpx', name: 'MCP-X',
      status: coverageOf('mcpx'),
      reqs: [
        {
          id: 'manual-submit', desc: '★ 需手工提交',
          check: () => false,
          fixable: false,
          how: '去 https://mcp-x.com/ 提交',
          source: '实测页面无我们的条目',
          confidence: 'inferred',
        },
      ],
    },

    /* ══════ MCPList ══════ */
    {
      id: 'mcplist', name: 'MCPList',
      status: coverageOf('mcplist'),
      reqs: [
        {
          id: 'manual-submit', desc: '★ 需手工提交',
          check: () => false,
          fixable: false,
          how: '去 https://mcplist.org/ 提交',
          source: '实测 404',
          confidence: 'inferred',
        },
      ],
    },

    /* ══════ Claude Connectors Directory ══════ */
    {
      id: 'claude-directory', name: 'Claude Connectors Directory',
      status: coverageOf('claude-directory'),
      reqs: [
        {
          id: 'remote-endpoint', desc: '★ 必须有生产级远程 MCP 端点（HTTPS，证书有效）',
          check: () => STATE.remoteOk === true,
          fixable: false,
          how: '★ 先修 DNS+SSL。Claude 明确要求生产级稳定服务',
          source: 'https://claude.com/docs/connectors/building/submission 官方要求',
          confidence: 'official',
        },
        {
          id: 'privacy-policy', desc: '需要隐私政策页面',
          check: () => false,  /* 未验证是否有 */
          fixable: true,
          how: '建 /ai/privacy 页面 + 在提交表单里填链接',
          source: 'Claude Connectors 提交要求含隐私政策',
          confidence: 'official',
        },
        {
          id: 'support-contact', desc: '需要支持联系方式',
          check: () => true,  /* 我们有联系方式 */
          fixable: true,
          how: '已有（sandy.zhao@mackorn.cn / leif.dai@mackorn.cn）',
          source: 'Claude 要求提供支持渠道',
          confidence: 'official',
        },
        {
          id: 'anthropic-review', desc: '★ 需 Anthropic 人工审核（不可控）',
          check: () => null,
          fixable: false,
          how: '提交后等审核',
          source: 'Claude Directory 有 review 流程',
          confidence: 'official',
        },
      ],
    },

    /* ══════ PulseMCP ══════ */
    {
      id: 'pulsemcp', name: 'PulseMCP',
      status: coverageOf('pulsemcp'),
      reqs: [
        {
          id: 'github-topic', desc: 'PulseMCP 抓 GitHub topic: mcp-server',
          check: () => null,
          fixable: false,
          how: '确认 GitHub 仓库 topics 含 mcp-server',
          source: 'PulseMCP 说明：自动抓 GitHub topic',
          confidence: 'inferred',
        },
      ],
    },

    /* ══════ MCPServers.org ══════ */
    {
      id: 'mcpservers-org', name: 'MCPServers.org',
      status: coverageOf('mcpservers-org'),
      reqs: [
        {
          id: 'github-pr', desc: '需向对应仓库提 PR',
          check: () => false,
          fixable: false,
          how: '提交 PR',
          source: '实测 403（反爬），收录机制为 PR',
          confidence: 'inferred',
        },
      ],
    },

    /* ══════ skills.sh ══════ */
    {
      id: 'skills-sh', name: 'skills.sh',
      status: coverageOf('skills-sh'),
      reqs: [
        {
          id: 'skill-frontmatter', desc: '每个 SKILL.md 必须有 frontmatter（name + description）',
          check: () => STATE.skills.length > 0 && STATE.skills.every((s) => s.hasFrontmatter && s.hasName && s.hasDesc),
          fixable: true,
          how: '检查 skills/*/SKILL.md 的 frontmatter',
          source: 'Agent Skills 规范',
          confidence: 'official',
        },
        {
          id: 'npx-skills-add', desc: '通过 npx skills add 自动收录',
          check: () => true,
          fixable: true,
          how: '已完成（skills.sh 页面已存在）',
          source: '实测 skills.sh 已有我们的页面',
          confidence: 'official',
        },
      ],
    },

    /* ══════ awesome-mcp-servers（PR 型）══════ */
    {
      id: 'awesome-mcp', name: 'punkpeye/awesome-mcp-servers',
      status: coverageOf('awesome-mcp'),
      reqs: [
        {
          id: 'pr-opened', desc: 'PR 已开（#15410）',
          check: () => true,
          fixable: false,
          how: '已提交',
          source: 'PR #15410 OPEN',
          confidence: 'official',
        },
        {
          id: 'glama-score', desc: '★ 合并前置条件：Glama 质量分必须评出来',
          check: () => false,  /* 因为 Glama 探测失败 */
          fixable: false,
          how: '★ 修 DNS+SSL → Glama 评分 → PR 才能合',
          source: 'PR #15410 最新评论："still showing as \'?\' and needs to be evaluated"',
          confidence: 'official',
        },
      ],
    },

    /* ══════ awesome-dsh-plugin ══════ */
    {
      id: 'awesome-dsh', name: 'awesome-dsh-plugin',
      status: coverageOf('awesome-dsh'),
      reqs: [
        {
          id: 'pr-merged', desc: 'PR 已合并（#6141）',
          check: () => true,
          fixable: false,
          how: '已合并（2026-10-17）',
          source: 'PR #6141 MERGED',
          confidence: 'official',
        },
      ],
    },
  ];
}

function coverageOf(id) {
  const c = STATE.coverage;
  if (!c || !Array.isArray(c.results)) return { known: false, status: 'unknown' };
  const r = c.results.find((x) => x.id === id);
  return r ? { known: true, status: r.status, http: r.http } : { known: false, status: 'unknown' };
}

/* ══════════════════════════════════════════════════════════════
 * 诊断
 * ══════════════════════════════════════════════════════════════ */
const only = val('--only');
const platforms = buildPlatforms().filter((p) => !only || only.split(',').some((o) => p.id.includes(o.trim())));

const diagnosis = [];
for (const p of platforms) {
  const results = [];
  for (const r of p.reqs) {
    let ok = null;
    try { ok = r.check(); } catch { ok = null; }
    results.push({
      id: r.id, desc: r.desc, ok,
      fixable: r.fixable, how: r.how, source: r.source, confidence: r.confidence,
    });
  }
  const unmet = results.filter((r) => r.ok === false);
  const unknown = results.filter((r) => r.ok === null);
  diagnosis.push({
    id: p.id, name: p.name,
    listed_status: p.status.status,
    listed_known: p.status.known,
    http: p.status.http ?? null,
    total_reqs: results.length,
    met: results.filter((r) => r.ok === true).length,
    unmet,
    unknown,
    /* 原因：未满足的条件 */
    reasons: unmet.map((r) => r.desc),
    /* 能自己改的（定向优化目标） */
    self_fixable: unmet.filter((r) => r.fixable),
    /* 必须外部的（需账号/服务器/审核） */
    external_blocked: unmet.filter((r) => !r.fixable),
    reqs: results,
  });
}

/* 汇总 */
const allUnmet = diagnosis.flatMap((d) => d.unmet.map((r) => ({ platform: d.name, ...r })));
const selfFixable = allUnmet.filter((r) => r.fixable);
const external = allUnmet.filter((r) => !r.fixable);

/* 按「影响平台数」排序的根因 */
const rootCauseMap = new Map();
for (const u of allUnmet) {
  const key = u.desc;
  if (!rootCauseMap.has(key)) rootCauseMap.set(key, { desc: key, platforms: [], fixable: u.fixable, how: u.how, source: u.source, confidence: u.confidence });
  rootCauseMap.get(key).platforms.push(u.platform);
}
const rootCauses = [...rootCauseMap.values()].sort((a, b) => b.platforms.length - a.platforms.length);

const report = {
  schema: 'mackorn-ai-rejection/1',
  generated: new Date().toISOString(),
  what: 'AI 收录原因诊断器 —— 对每个平台列收录条件，逐条比对，输出缺哪一条',
  state_snapshot: {
    tools: STATE.tools.length,
    skills: STATE.skills.length,
    has_server_json: !!STATE.serverJson,
    has_readme: STATE.hasReadme,
    has_llms_txt: STATE.hasLlmsTxt,
    has_license: STATE.hasLicense,
    remote_ok: STATE.remoteOk,
    dns_ok: STATE.dnsOk,
    ssl_ok: STATE.sslOk,
    pkg_version: STATE.pkg ? STATE.pkg.version : null,
  },
  summary: {
    platforms: diagnosis.length,
    listed: diagnosis.filter((d) => d.listed_status === 'listed').length,
    not_listed: diagnosis.filter((d) => d.listed_status === 'not_listed').length,
    unmet_total: allUnmet.length,
    self_fixable: selfFixable.length,
    external_blocked: external.length,
  },
  root_causes: rootCauses,
  platforms: diagnosis,
  action_plan: buildActionPlan(selfFixable, external, rootCauses),
};

function buildActionPlan(selfFix, ext, causes) {
  const plan = [];
  /* P0：影响多个平台且我们能改的 */
  for (const c of causes.filter((x) => x.fixable)) {
    plan.push({
      priority: c.platforms.length >= 2 ? 0 : 1,
      type: 'self-fixable',
      what: c.desc,
      affects: c.platforms,
      how: c.how,
      source: c.source,
    });
  }
  /* P0：影响多个平台但需外部的（真正的主要矛盾） */
  for (const c of causes.filter((x) => !x.fixable)) {
    plan.push({
      priority: c.platforms.length >= 2 ? 0 : 2,
      type: 'external',
      what: c.desc,
      affects: c.platforms,
      how: c.how,
      source: c.source,
    });
  }
  return plan.sort((a, b) => a.priority - b.priority);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'ai-rejection-diagnosis.json'), JSON.stringify(report, null, 2), 'utf8');

if (has('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

/* ══════════ 打印 ══════════ */
const ic = (ok) => (ok === true ? '✅' : ok === false ? '❌' : '❓');
console.log('');
console.log('  ══ AI 收录原因诊断器 ══');
console.log('  （对每个平台列收录条件，逐条比对，输出【缺哪一条】）');
console.log('');
console.log('  当前状态：' + report.state_snapshot.tools + ' 工具 · ' + report.state_snapshot.skills + ' 技能 · '
  + (report.state_snapshot.has_server_json ? 'server.json✅' : 'server.json❌') + ' · 远程端点'
  + (report.state_snapshot.remote_ok === true ? '✅' : report.state_snapshot.remote_ok === false ? '❌' : '❓'));
console.log('');
console.log('  平台 ' + report.summary.platforms + ' · ✅已收录 ' + report.summary.listed + ' · ❌未收录 ' + report.summary.not_listed);
console.log('  未满足条件 ' + report.summary.unmet_total + ' 条（能自己改 ' + report.summary.self_fixable + ' · 需外部 ' + report.summary.external_blocked + '）');
console.log('');

if (has('--fixable')) {
  console.log('  ── 我们能自己改的（定向优化目标）──');
  for (const c of rootCauses.filter((x) => x.fixable)) {
    console.log('  ❌ ' + c.desc);
    console.log('     影响平台: ' + c.platforms.join(', '));
    console.log('     怎么改  : ' + c.how);
    console.log('     依据    : ' + c.source + ' [' + c.confidence + ']');
    console.log('');
  }
  process.exit(0);
}

console.log('  ── 逐平台诊断 ──');
for (const d of diagnosis) {
  const sIcon = d.listed_status === 'listed' ? '✅' : d.listed_status === 'not_listed' ? '❌' : '❓';
  console.log('');
  console.log('  ' + sIcon + ' ' + d.name + '（' + d.listed_status + '）· 条件满足 ' + d.met + '/' + d.total_reqs);
  for (const r of d.reqs) {
    console.log('     ' + ic(r.ok) + ' ' + r.desc);
    if (r.ok === false) {
      console.log('        → ' + r.how);
      if (r.source) console.log('        [' + r.confidence + '] ' + r.source.slice(0, 90));
    }
  }
}
console.log('');
console.log('  ── 根因排序（按影响平台数）──');
for (const c of rootCauses) {
  console.log('  ' + (c.fixable ? '🔧' : '🔒') + ' 影响 ' + c.platforms.length + ' 个平台: ' + c.desc);
  console.log('      平台: ' + c.platforms.join(', '));
  console.log('      怎么修: ' + c.how);
  console.log('');
}
console.log('  报告：distribution/03_验证与基准/ai-rejection-diagnosis.json');
console.log('');
