/**
 * 每日焦点日课（R193）—— 聚焦「让更多 AI 收录我们」
 *
 * 用户要求（2026-10-27 13:50）：
 *   「请编程写进，聚焦行为规则，别太分散，每天回顾焦点问题：
 *     让更多的Ai收录，请回顾收录清单，已经收取的更新，
 *     GitHub插件更新，待收录的分析对策」
 *
 * ══════════════════════════════════════════════════════════════
 * 为什么要有这个工具
 *   之前太分散：74 个平台台账、GEO 审计、通道考评、认知日课…
 *   每天不知道该看什么，看了一圈还是不知道今天该干什么。
 *   ⇒ 现在收敛成【一个焦点 · 四件事 · 一条命令】。
 * ══════════════════════════════════════════════════════════════
 *
 * 焦点：让更多 AI 收录我们
 *
 * 四件事（顺序固定，每天跑一次）：
 *   ① 回顾收录清单        —— 现在到底有几个收录了？变化？
 *   ② 已收录的更新        —— 已收录的平台，内容/版本是不是过期了？
 *   ③ GitHub 插件更新     —— 仓库版本、npm 版本、工具数是否一致？
 *   ④ 待收录的分析对策    —— 没收录的，各卡在哪、下一步干什么？
 *
 * 用法：
 *   node tools/daily_focus.mjs              # 跑全部四件事
 *   node tools/daily_focus.mjs --quick      # 只出摘要（不上网）
 *   node tools/daily_focus.mjs --json       # JSON 输出
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'focus-data');
const TODAY = new Date().toISOString().slice(0, 10);

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const JSON_OUT = has('--json');
const QUICK = has('--quick');

const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const readJson = (p) => { try { return JSON.parse(read(p)); } catch { return null; } };

/* ══════════════════════════════════════════════════════════════
 * ① 回顾收录清单
 * ══════════════════════════════════════════════════════════════ */
function reviewListed() {
  const r = {
    key: 'listed',
    title: '① 回顾收录清单',
    question: '现在到底有几个 AI/平台收录了我们？',
  };

  /* 读探测结果 */
  const probe = readJson(join(ROOT, 'directory-registry', 'check-results.json'));
  const reg = readJson(join(ROOT, 'distribution-registry', 'registry.json'));

  /* 从 check-results 统计 */
  let listed = [], notListed = [], blocked = [], errors = [];
  if (probe && Array.isArray(probe.results)) {
    for (const p of probe.results) {
      const st = p.status || '';
      if (st === 'listed') listed.push(p);
      else if (st === 'blocked') blocked.push(p);
      else if (st === 'error') errors.push(p);
      else notListed.push(p);
    }
  }

  /* 从 distribution-registry 补充（74 平台台账） */
  let ledgerListed = 0, ledgerTotal = 0;
  if (reg && Array.isArray(reg.categories)) {
    for (const cat of reg.categories) {
      for (const p of cat.platforms || []) {
        ledgerTotal++;
        if (/^(listed|already-native|usable-now|auto-listed|merged)$/.test(p.status || '')) ledgerListed++;
      }
    }
  }

  r.data = {
    probe_listed: listed.length,
    probe_not_listed: notListed.length,
    probe_blocked: blocked.length,
    probe_errors: errors.length,
    ledger_total: ledgerTotal,
    ledger_listed: ledgerListed,
    listed_names: listed.map((p) => p.name || p.id),
    not_listed_names: notListed.map((p) => p.name || p.id),
    blocked_names: blocked.map((p) => p.name || p.id),
  };

  r.verdict = listed.length + errors.length > 0
    ? `探测到 ${listed.length} 个确认收录 · ${notListed.length} 个未收录 · ${blocked.length} 个被挡 · ${errors.length} 个错误`
    : '⚠️ 探测结果异常（0 收录 + 多错误）→ 可能是本机网络问题，不是真实状态';

  r.next = errors.length >= 3
    ? '先重跑 node tools/directory_checker.mjs --check（错误≥3 通常是网络问题）'
    : (notListed.length > 0 ? '处理未收录的 ' + notListed.length + ' 个（见第④步）' : '暂无未收录，保持监控');

  return r;
}

/* ══════════════════════════════════════════════════════════════
 * ② 已收录的更新
 * ══════════════════════════════════════════════════════════════ */
function reviewUpdates() {
  const r = {
    key: 'updates',
    title: '② 已收录的更新',
    question: '已收录的平台，内容/版本是不是过期了？',
  };

  const pkg = readJson(join(ROOT, 'package.json')) || {};
  const curVer = pkg.version || '?';
  const curTools = (pkg.description || '').match(/(\d+)\s*个工具/)?.[1] || '?';

  /* 检查关键文件里的工具数是否与 package.json 一致 */
  const files = [
    ['README.md', /(\d+)\s*tools/i],
    ['llms.txt', /(\d+)\s*个工具/],
    ['AGENTS.md', /(\d+)\s*个工具/],
    ['QUICKSTART.md', /(\d+)\s*个工具/],
    ['server.json', /"version"\s*:\s*"([^"]+)"/],
    ['CITATION.cff', /version:\s*"?([^\s"]+)"?/],
  ];
  const stale = [];
  const ok = [];
  for (const [f, re] of files) {
    const p = join(ROOT, f);
    if (!existsSync(p)) { stale.push({ file: f, issue: '文件不存在' }); continue; }
    const c = read(p);
    const m = c.match(re);
    if (!m) { stale.push({ file: f, issue: '找不到版本/工具数标记' }); continue; }
    if (f === 'server.json' || f === 'CITATION.cff') {
      if (m[1] !== curVer) stale.push({ file: f, issue: `版本 ${m[1]} ≠ ${curVer}` });
      else ok.push(f);
    } else {
      if (m[1] !== curTools) stale.push({ file: f, issue: `工具数 ${m[1]} ≠ ${curTools}` });
      else ok.push(f);
    }
  }

  /* 已收录平台的「最后更新时间」是否太久 */
  const reg = readJson(join(ROOT, 'distribution-registry', 'registry.json'));
  const oldListed = [];
  if (reg && Array.isArray(reg.categories)) {
    const cutoff = Date.now() - 90 * 86400000; /* 90 天 */
    for (const cat of reg.categories) {
      for (const p of cat.platforms || []) {
        if (!/^(listed|already-native|usable-now|auto-listed)$/.test(p.status || '')) continue;
        const when = p.recorded_at || p.last_checked;
        if (when) {
          const t = Date.parse(when);
          if (!Number.isNaN(t) && t < cutoff) oldListed.push({ name: p.name || p.id, when });
        }
      }
    }
  }

  r.data = {
    current_version: curVer,
    current_tools: curTools,
    in_sync: ok,
    stale,
    listed_over_90d: oldListed,
  };

  r.verdict = stale.length === 0
    ? `✅ 版本/工具数全站一致（v${curVer} · ${curTools} 个工具）`
    : `⚠️ ${stale.length} 个文件里的版本/工具数过期`;

  r.next = stale.length > 0
    ? '跑 node tools/sync_tool_count_facts.mjs 自动同步；版本号手改'
    : (oldListed.length > 0 ? '有 ' + oldListed.length + ' 个收录平台超过 90 天没更新记录 → 建议重新提交最新版' : '无需更新');

  return r;
}

/* ══════════════════════════════════════════════════════════════
 * ③ GitHub 插件更新
 * ══════════════════════════════════════════════════════════════ */
async function reviewGitHub() {
  const r = {
    key: 'github',
    title: '③ GitHub 插件更新',
    question: '仓库版本、npm 版本、工具数是否一致？',
  };

  const pkg = readJson(join(ROOT, 'package.json')) || {};
  const curVer = pkg.version || '?';

  r.data = {
    local_version: curVer,
    npm_latest: null,
    github_head: null,
    version_match: null,
  };

  if (QUICK) {
    r.verdict = '（--quick 模式跳过网络检查）';
    r.next = '去掉 --quick 跑完整版';
    return r;
  }

  /* npm 最新版 */
  try {
    const res = await fetch('https://registry.npmjs.org/mackorn-cone-crusher/latest', { signal: AbortSignal.timeout(15000) });
    if (res.ok) { const j = await res.json(); r.data.npm_latest = j.version; }
  } catch { /* 网络问题忽略 */ }

  /* GitHub 最新 commit 时间（用 Contents API 拿 package.json 的 sha 对比） */
  try {
    const token = existsSync(join(ROOT, '.gh-token')) ? read(join(ROOT, '.gh-token')).trim() : '';
    const headers = { 'User-Agent': 'mackorn', Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch('https://api.github.com/repos/LeifDai/MACKORN-hydraulic-cone-crusher/contents/package.json', { headers, signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const j = await res.json();
      const remote = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
      r.data.github_version = remote.version;
    }
  } catch { /* 网络问题忽略 */ }

  const matches = [];
  if (r.data.npm_latest) matches.push(r.data.npm_latest === curVer);
  if (r.data.github_version) matches.push(r.data.github_version === curVer);
  r.data.version_match = matches.length ? matches.every(Boolean) : null;

  if (r.data.version_match === null) {
    r.verdict = `本地 v${curVer} · 在线版本查不到（网络问题）`;
    r.next = '网络恢复后重跑';
  } else if (r.data.version_match) {
    r.verdict = `✅ 三方版本一致：本地 v${curVer} = npm ${r.data.npm_latest || '?'} = GitHub ${r.data.github_version || '?'}`;
    r.next = '无需更新';
  } else {
    r.verdict = `⚠️ 版本不一致：本地 v${curVer} · npm ${r.data.npm_latest || '?'} · GitHub ${r.data.github_version || '?'}`;
    r.next = '发新版本：npm version patch + git push + npm publish';
  }

  return r;
}

/* ══════════════════════════════════════════════════════════════
 * ④ 待收录的分析对策
 * ══════════════════════════════════════════════════════════════ */
function reviewTodo() {
  const r = {
    key: 'todo',
    title: '④ 待收录的分析对策',
    question: '没收录的，各卡在哪、下一步干什么？',
  };

  /* 平台 → 对策（人工沉淀，每次只补充不删除） */
  const PLAYBOOK = {
    'MCPList': {
      blocker: '站点 404（可能已关停或换域名）',
      action: '先确认站点是否还活着；死了就从清单移除，不再浪费精力',
      effort: '5 分钟',
      priority: 'P2',
    },
    'MCP-X': {
      blocker: '页面 200 但搜不到 mackorn 标识符',
      action: '手动提交一次（填表），提交后 7 天再查；若仍无，找它们的 GitHub 提 issue',
      effort: '15 分钟',
      priority: 'P1',
    },
    'mcp.so': {
      blocker: '需要 GitHub topic=mcp-server 才会自动抓（我们已有）',
      action: '主动在 mcp.so 提交 URL；若已提交，检查是否被拒（看邮箱）',
      effort: '10 分钟',
      priority: 'P1',
    },
    'Claude Connectors': {
      blocker: '端点已满足，但需要企业资质审核',
      action: '准备材料（公司证明 + 端点说明）提交；这是长期项，不指望快',
      effort: '1 小时 + 审核周期',
      priority: 'P1',
    },
    'Glama': {
      blocker: '已收录但 Quality Tier B0，显示 cannot be deployed',
      action: '做 containerized release（Dockerfile 已备）：admin/dockerfile → Deploy → Make Release',
      effort: '10 分钟',
      priority: 'P0',
    },
  };

  const probe = readJson(join(ROOT, 'directory-registry', 'check-results.json'));
  const todo = [];
  if (probe && Array.isArray(probe.results)) {
    for (const p of probe.results) {
      const st = p.status || '';
      if (st !== 'not-listed') continue;
      const name = p.name || p.id;
      const pb = PLAYBOOK[name] || PLAYBOOK[p.id] || {
        blocker: '未收录（原因未诊断）',
        action: '先手动访问平台，看有没有提交入口；有就提交，没有就找联系方式问',
        effort: '15 分钟',
        priority: 'P2',
      };
      todo.push({ name, status: st, ...pb });
    }
  }

  /* 按优先级排序 */
  const ORDER = { P0: 0, P1: 1, P2: 2 };
  todo.sort((a, b) => (ORDER[a.priority] ?? 9) - (ORDER[b.priority] ?? 9));

  r.data = { total: todo.length, items: todo };
  r.verdict = todo.length === 0 ? '✅ 没有待收录项' : `⚠️ ${todo.length} 个待收录`;
  r.next = todo.length > 0
    ? '按 P0 → P1 → P2 顺序处理；每个都写清「卡在哪 + 下一步」'
    : '保持监控';

  return r;
}

/* ══════════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════════ */
const results = [];
results.push(reviewListed());
results.push(reviewUpdates());
results.push(await reviewGitHub());
results.push(reviewTodo());

const report = {
  schema: 'mackorn-daily-focus/1',
  date: TODAY,
  at: new Date().toISOString(),
  focus: '让更多 AI 收录我们',
  quick: QUICK,
  sections: results,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, `focus-${TODAY}.json`), JSON.stringify(report, null, 2), 'utf8');
writeFileSync(join(OUT_DIR, 'latest.json'), JSON.stringify(report, null, 2), 'utf8');

/* 追加到历史台账 */
try {
  const hist = join(OUT_DIR, 'history.jsonl');
  const fs = await import('node:fs');
  fs.appendFileSync(hist, JSON.stringify({
    date: TODAY,
    at: report.at,
    listed: results[0].data.probe_listed,
    not_listed: results[0].data.probe_not_listed,
    errors: results[0].data.probe_errors,
    stale_files: results[1].data.stale.length,
    version_match: results[2].data.version_match,
  }) + '\n', 'utf8');
} catch { /* 历史追加失败不影响主流程 */ }

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

/* ── 输出 ── */
console.log('');
console.log('  ╔══════════════════════════════════════════════════════════╗');
console.log('    每日焦点 · ' + TODAY + (QUICK ? '（快速模式）' : ''));
console.log('    焦点：让更多 AI 收录我们');
console.log('  ╚══════════════════════════════════════════════════════════╝');
console.log('');

for (const r of results) {
  console.log('  ── ' + r.title + ' ──');
  console.log('  问：' + r.question);
  console.log('');
  console.log('  ' + r.verdict);
  console.log('  → ' + r.next);
  console.log('');

  if (r.key === 'todo' && r.data.items && r.data.items.length) {
    console.log('  待办明细（按优先级）：');
    for (const it of r.data.items) {
      console.log('    [' + it.priority + '] ' + it.name);
      console.log('        卡在：' + it.blocker);
      console.log('        动作：' + it.action);
      console.log('        工时：' + it.effort);
      console.log('');
    }
  }
  if (r.key === 'updates' && r.data.stale && r.data.stale.length) {
    console.log('  过期文件：');
    for (const s of r.data.stale) console.log('    · ' + s.file + ' — ' + s.issue);
    console.log('');
  }
}

/* 今日一句话建议 */
console.log('  ══════ 今天最该做的 1 件事 ══════');
const p0 = results[3].data.items && results[3].data.items.find((x) => x.priority === 'P0');
if (p0) console.log('  ' + p0.name + ' — ' + p0.action + '（' + p0.effort + '）');
else if (results[1].data.stale.length > 0) console.log('  同步过期文件：node tools/sync_tool_count_facts.mjs');
else if (results[0].data.probe_errors >= 3) console.log('  重跑目录检查（错误多说明网络问题）：node tools/directory_checker.mjs --check');
else console.log('  暂无急事，保持每日一次回顾');
console.log('');
console.log('  报告：focus-data/latest.json');
console.log('  历史：focus-data/history.jsonl');
console.log('');
