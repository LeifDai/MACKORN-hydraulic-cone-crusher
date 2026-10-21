/**
 * AI 收录探测器（R126）
 *
 * 用户目标（2026-10-21）：
 *   「为了让每个优秀的 AI 能随时引用到我们的插件，不断请求不同的 AI 验证，
 *     是否收录、是否能引用到；请持续编程优化强化，测试不同的 AI，
 *     让领先的 AI 都收录我们，随时能被调用到。」
 *
 * ★ 为什么必须先建这个：
 *   「让 AI 收录我们」是愿望，无法验证。
 *   可测的是：对 20+ 个 AI 目录/注册表发 HTTP 请求，
 *   看是否存在我们的条目、页面是否能访问、关键词是否命中。
 *
 * ★ 判据（避免假阳性）：
 *   一个平台计为「已收录」必须同时满足：
 *     ① 页面 HTTP 200（不是 404/403/超时）
 *     ② 页面内容里出现我们的标识符（包名 / 仓库名 / MCP server 名）
 *   只返回 200 但内容是"搜索无结果"页 → 不算收录。
 *
 * ★ 诚实边界：
 *   · 本工具只做【可验证的 HTTP 探测】，不代替人工确认
 *   · 有些平台需要 JS 渲染（纯 HTML 探测会假阴性），会标注 render_required
 *   · 有些平台有反爬（403/429），会标注 blocked，不当成"未收录"
 *
 * 用法：
 *   node tools/ai_coverage.mjs               # 全文探测报告
 *   node tools/ai_coverage.mjs --json        # 机器可读
 *   node tools/ai_coverage.mjs --only glama,smithery
 *   node tools/ai_coverage.mjs --out <file>  # 写文件（沙箱内避免管道）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'distribution', '03_验证与基准');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };

/* ══════════════════════════════════════════════════════════════
 * 我们的标识符（页面里出现任一 = 命中）
 * ══════════════════════════════════════════════════════════════ */
const IDENTIFIERS = [
  'mackorn',
  'MACKORN',
  'mackorn-cone-crusher',
  'MACKORN-hydraulic-cone-crusher',
  'cn.mackorn',
];

/* ══════════════════════════════════════════════════════════════
 * 目标平台清单
 *
 * type:
 *   registry  = 官方/半官方注册表，有 API 可查
 *   directory = 第三方目录，靠网页收录
 *   awesome   = GitHub awesome 列表，靠 PR
 *   skill     = Agent Skills 目录
 *   search    = 可搜索的聚合站
 * ══════════════════════════════════════════════════════════════ */
const TARGETS = [
  /* ── 官方/半官方注册表 ── */
  {
    id: 'mcp-registry', name: 'Official MCP Registry', type: 'registry',
    url: 'https://registry.modelcontextprotocol.io/v0/servers?search=mackorn',
    expect: 'json',
    note: '官方注册表，有 API；搜索结果里应有我们的 server',
    submit: 'npm 包 + server.json 已就绪，用 mcp-publisher 发布',
  },
  {
    id: 'npm', name: 'npm registry', type: 'registry',
    url: 'https://registry.npmjs.org/mackorn-cone-crusher',
    expect: 'json',
    note: '包已发布 0.2.2',
    submit: '已完成（npm publish）',
  },

  /* ── 主流 MCP 目录 ── */
  {
    id: 'glama', name: 'Glama', type: 'directory',
    url: 'https://glama.ai/mcp/servers/LeifDai/MACKORN-hydraulic-cone-crusher',
    expect: 'html',
    note: '★ 已提交 PR #15410，但卡在 Responsiveness（SSL 证书过期）',
    submit: 'PR #15410 已开；需修 SSL 后重新评估',
    known_issue: 'SSL 证书过期 → 探测失败 → 判定 Unresponsive',
  },
  {
    id: 'smithery', name: 'Smithery', type: 'directory',
    url: 'https://smithery.ai/server/@LeifDai/mackorn-cone-crusher',
    expect: 'html',
    note: 'Smithery 是最大的 MCP 目录之一，支持 CLI 发布',
    submit: 'npx -y @smithery/cli publish（需 GitHub 授权）',
  },
  {
    id: 'mcp-so', name: 'mcp.so', type: 'directory',
    url: 'https://mcp.so/server/mackorn-cone-crusher',
    expect: 'html',
    note: '中文友好的 MCP 目录',
    submit: '网页提交表单 or GitHub issue',
  },
  {
    id: 'pulsemcp', name: 'PulseMCP', type: 'directory',
    url: 'https://www.pulsemcp.com/servers?q=mackorn',
    expect: 'html',
    note: 'PulseMCP 有搜索页，抓取 GitHub topic',
    submit: '自动抓取 GitHub topic: mcp-server',
  },
  {
    id: 'mcpservers-org', name: 'MCPServers.org', type: 'directory',
    url: 'https://mcpservers.org/servers/LeifDai/mackorn-cone-crusher',
    expect: 'html',
    submit: 'GitHub PR 到对应仓库',
  },
  {
    id: 'mcpx', name: 'MCP-X', type: 'directory',
    url: 'https://mcp-x.com/server/mackorn-cone-crusher',
    expect: 'html',
    submit: '网页提交',
  },
  {
    id: 'mcplist', name: 'MCPList', type: 'directory',
    url: 'https://mcplist.org/server/mackorn-cone-crusher',
    expect: 'html',
    submit: '网页提交',
  },

  /* ── Claude / 其他 AI 官方 ── */
  {
    id: 'claude-directory', name: 'Claude Connectors Directory', type: 'directory',
    url: 'https://claude.com/docs/connectors/building/submission',
    expect: 'html',
    note: 'Anthropic 官方目录，要求高（需 review）',
    submit: '表单提交，需 Anthropic 审核',
    known_issue: '需生产级稳定服务，SSL 必须有效',
  },

  /* ── awesome 列表（PR 型）── */
  {
    id: 'awesome-mcp', name: 'punkpeye/awesome-mcp-servers', type: 'awesome',
    url: 'https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md',
    expect: 'raw',
    note: '★ 96,380★ 最大 awesome 列表；PR #15410 已开',
    submit: 'PR #15410（已提交，待合并）',
  },
  {
    id: 'awesome-dsh', name: 'awesome-dsh-plugin', type: 'awesome',
    url: 'https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/README.md',
    expect: 'raw',
    note: '★ PR #6141 已合并（2026-10-17）',
    submit: '已合并',
  },

  /* ── Agent Skills 目录 ── */
  {
    id: 'skills-sh', name: 'skills.sh', type: 'skill',
    url: 'https://skills.sh/s/LeifDai/MACKORN-hydraulic-cone-crusher',
    expect: 'html',
    note: 'npx skills add 安装的目录',
    submit: 'npx skills add LeifDai/MACKORN-hydraulic-cone-crusher（自动收录）',
  },

  /* ── 自有可发现性 ── */
  {
    id: 'own-llms', name: '自有 llms.txt', type: 'own',
    url: 'https://mackorn.cn/ai/llms.txt',
    expect: 'text',
    note: '★ AI 爬虫读这个；SSL 过期会导致全部失败',
    submit: '已部署；需修 SSL',
  },
  {
    id: 'own-robots', name: '自有 robots.txt', type: 'own',
    url: 'https://mackorn.cn/robots.txt',
    expect: 'text',
    note: '必须允许 AI 爬虫（GPTBot / ClaudeBot / PerplexityBot）',
    submit: '已部署；需确认允许规则',
  },
  {
    id: 'own-mcp-api', name: '自有 MCP API', type: 'own',
    url: 'https://mackorn.cn/ai/api/mcp.php',
    expect: 'text',
    note: '★ PHP 版 MCP 端点；Glama 探测的就是这个',
    submit: '已部署；需修 SSL',
  },
  {
    id: 'own-mcp-card', name: 'MCP Server Card', type: 'own',
    url: 'https://mackorn.cn/.well-known/mcp/server-card.json',
    expect: 'json',
    note: 'MCP 官方推荐的服务描述文件',
    submit: '已部署在 distribution/官网落地页/.well-known/',
  },
  {
    id: 'own-server-json', name: 'server.json (npm)', type: 'own',
    url: 'https://unpkg.com/mackorn-cone-crusher/server.json',
    expect: 'json',
    note: 'MCP Registry 抓取这个文件',
    submit: '已包含在 npm 包里',
  },
];

/* ══════════════════════════════════════════════════════════════
 * 探测逻辑
 * ══════════════════════════════════════════════════════════════ */
async function probe(t) {
  const out = {
    id: t.id, name: t.name, type: t.type, url: t.url,
    note: t.note || null, submit: t.submit || null,
    known_issue: t.known_issue || null,
    status: 'unknown',      /* listed | not_listed | blocked | error | render_required */
    http: null,
    matched_identifiers: [],
    error: null,
    ms: null,
  };
  const t0 = Date.now();
  try {
    const r = await fetch(t.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MACKORN-coverage-probe/1.0; +https://mackorn.cn/ai/)',
        Accept: t.expect === 'json' ? 'application/json' : '*/*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    });
    out.http = r.status;
    out.ms = Date.now() - t0;

    if (r.status === 401 || r.status === 403) {
      out.status = 'blocked';
      out.error = 'HTTP ' + r.status + '（反爬/需授权，不算未收录）';
      return out;
    }
    if (r.status === 429) {
      out.status = 'blocked';
      out.error = 'HTTP 429 限流（不算未收录）';
      return out;
    }
    if (!r.ok) {
      out.status = 'not_listed';
      out.error = 'HTTP ' + r.status;
      return out;
    }

    const text = await r.text();

    /* 命中判定 */
    const hits = IDENTIFIERS.filter((id) => text.toLowerCase().includes(id.toLowerCase()));
    out.matched_identifiers = [...new Set(hits)];

    /* JSON 类型：解析后判断是否真有条目 */
    if (t.expect === 'json') {
      try {
        const j = JSON.parse(text);
        /* MCP Registry 格式：{ servers: [...] } */
        if (j && Array.isArray(j.servers)) {
          out.status = j.servers.length > 0 ? 'listed' : 'not_listed';
          out.total_results = j.servers.length;
          return out;
        }
        /* npm 格式：有 name 字段 = 存在 */
        if (j && j.name) { out.status = 'listed'; out.package_name = j.name; out.version = j.version || null; return out; }
        out.status = hits.length > 0 ? 'listed' : 'not_listed';
        return out;
      } catch {
        out.status = hits.length > 0 ? 'listed' : 'not_listed';
        return out;
      }
    }

    /* HTML/raw：命中即收录，但要注意"搜索无结果"页 */
    if (hits.length > 0) {
      /* 排除「404 页面里恰好包含项目名」的情况 */
      const looksNotFound = /(404|not\s*found|页面不存在|no\s*results|nothing\s*found|未找到)/i.test(text.slice(0, 3000));
      const isSearchPage = /(\?q=|\/search)/.test(t.url) && /(0\s*results|no\s*results|未找到)/i.test(text);
      if (looksNotFound && !isSearchPage) {
        out.status = 'not_listed';
        out.error = 'HTTP 200 但页面内容是"未找到"';
      } else if (isSearchPage) {
        out.status = 'not_listed';
        out.error = '搜索页无结果';
      } else {
        out.status = 'listed';
      }
    } else {
      out.status = 'not_listed';
    }
    /* 超短页面 → 可能需要 JS 渲染 */
    if (text.length < 500 && out.status === 'not_listed') {
      out.status = 'render_required';
      out.error = '页面仅 ' + text.length + ' 字节，可能需 JS 渲染（假阴性风险）';
    }
    return out;
  } catch (e) {
    out.ms = Date.now() - t0;
    const msg = String(e && e.message || e);
    if (/CERT|SSL|TLS|self.signed|UNABLE_TO_VERIFY/i.test(msg)) {
      out.status = 'error';
      out.error = 'TLS/证书错误：' + msg.slice(0, 100) + ' ← ★ SSL 证书过期会导致全部自有域名探测失败';
    } else if (/timeout|abort/i.test(msg)) {
      out.status = 'error';
      out.error = '超时（25s）';
    } else {
      out.status = 'error';
      out.error = msg.slice(0, 120);
    }
    return out;
  }
}

/* ══════════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════════ */
const only = val('--only');
const list = only ? TARGETS.filter((t) => only.split(',').some((o) => t.id.includes(o.trim()))) : TARGETS;

const results = [];
/* 串行探测（避免触发限流），每 2 个之间停 300ms */
for (let i = 0; i < list.length; i += 1) {
  const r = await probe(list[i]);
  results.push(r);
  if (i < list.length - 1) await new Promise((x) => setTimeout(x, 300));
}

const summary = {
  generated: new Date().toISOString(),
  total: results.length,
  listed: results.filter((r) => r.status === 'listed').length,
  not_listed: results.filter((r) => r.status === 'not_listed').length,
  blocked: results.filter((r) => r.status === 'blocked').length,
  render_required: results.filter((r) => r.status === 'render_required').length,
  error: results.filter((r) => r.status === 'error').length,
};

const report = {
  schema: 'mackorn-ai-coverage/1',
  what: 'AI 收录探测器 —— 检查 20+ 个 AI 目录/注册表是否收录了 MACKORN 插件',
  judge: '判为「已收录」必须同时满足：① HTTP 200 ② 页面含 mackorn 标识符（排除"未找到"页与搜索空结果）',
  summary,
  results,
  next_actions: buildNextActions(results),
};

function buildNextActions(rs) {
  const acts = [];
  for (const r of rs) {
    if (r.status === 'listed') continue;
    const a = { id: r.id, name: r.name, status: r.status, action: r.submit || '需人工确认提交方式' };
    if (r.status === 'error' && /证书|TLS|SSL/i.test(r.error || '')) {
      a.action = '★ 先修 SSL 证书，再重测：' + (r.submit || '');
      a.priority = 0;
    } else if (r.status === 'not_listed') {
      a.priority = 1;
    } else if (r.status === 'render_required') {
      a.action = '需 JS 渲染或手动浏览器确认';
      a.priority = 3;
    } else {
      a.priority = 2;
    }
    acts.push(a);
  }
  return acts.sort((a, b) => a.priority - b.priority);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'ai-coverage.json'), JSON.stringify(report, null, 2), 'utf8');
const outFile = val('--out');
if (outFile) writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');

if (has('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

/* 打印报告 */
const icon = { listed: '✅', not_listed: '❌', blocked: '🚫', render_required: '❓', error: '⚠️', unknown: '·' };
console.log('');
console.log('  ══ AI 收录探测器 ══');
console.log('  （判据：HTTP 200 + 页面含 mackorn 标识符；排除"未找到"页）');
console.log('');
console.log('  总数 ' + summary.total + ' · ✅收录 ' + summary.listed + ' · ❌未收录 ' + summary.not_listed
  + ' · 🚫被挡 ' + summary.blocked + ' · ❓需渲染 ' + summary.render_required + ' · ⚠️错误 ' + summary.error);
console.log('');
console.log('  ── 明细 ──');
for (const r of results) {
  console.log('  ' + (icon[r.status] || '·') + ' ' + r.name.padEnd(32) + String(r.http ?? '—').padStart(5)
    + '  ' + String(r.ms ?? '—').padStart(6) + 'ms  ' + r.status);
  if (r.matched_identifiers.length) console.log('       命中: ' + r.matched_identifiers.join(', '));
  if (r.error) console.log('       ' + r.error);
}
console.log('');
if (report.next_actions.length) {
  console.log('  ── 待做（按优先级）──');
  for (const a of report.next_actions.slice(0, 12)) {
    console.log('  P' + a.priority + ' [' + a.id + '] ' + a.action.slice(0, 110));
  }
  console.log('');
}
console.log('  报告已写：distribution/03_验证与基准/ai-coverage.json');
console.log('');
