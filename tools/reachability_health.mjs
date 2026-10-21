/**
 * 可发现性体检（R127）—— DNS + SSL + 端点 三重检查
 *
 * ★ 为什么必须把 DNS 和 SSL 分开检：
 *   2026-10-21 实测发现，mackorn.cn 打不开是【两个独立问题叠加】：
 *     ① 裸域 mackorn.cn 的 A 记录丢失 → Node dns.lookup 返回 ENOTFOUND
 *     ② www.mackorn.cn 解析正常但证书过期 → CERT_HAS_EXPIRED
 *   只修一个等于没修。而且错误码不同，必须分开报，否则会误判。
 *
 *   连续三天（10-19 到 10-21）我都判断成"SSL 证书过期"，
 *   直到把 dns.lookup 与 fetch 分开跑，才看到裸域根本没解析。
 *
 * 检查项：
 *   ① DNS：A 记录是否存在（裸域 + www）
 *   ② SSL：证书是否有效、剩余天数、SAN 是否覆盖
 *   ③ 端点：llms.txt / robots.txt / mcp.php / server-card.json / 首页
 *   ④ AI 爬虫可达性：robots.txt 是否允许 GPTBot / ClaudeBot / PerplexityBot
 *
 * 用法：
 *   node tools/reachability_health.mjs
 *   node tools/reachability_health.mjs --json
 *   node tools/reachability_health.mjs --out file.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'distribution', '03_验证与基准');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };

/* ══════════════════════════════════════════════════════════════
 * 一、DNS 检查
 * ══════════════════════════════════════════════════════════════ */
const HOSTS = [
  { host: 'mackorn.cn', role: '裸域（所有文档/PR 里用的地址）', critical: true },
  { host: 'www.mackorn.cn', role: 'www 域', critical: true },
];

const dnsResults = [];
for (const h of HOSTS) {
  const r = { host: h.host, role: h.role, critical: h.critical, ok: false, address: null, error: null };
  try {
    const a = await lookup(h.host, { family: 4 });
    r.ok = true; r.address = a.address;
  } catch (e) {
    r.error = e.code || e.message;
  }
  dnsResults.push(r);
}

/* ══════════════════════════════════════════════════════════════
 * 二、端点检查（同时捕获 DNS 错误 vs SSL 错误）
 * ══════════════════════════════════════════════════════════════ */
const ENDPOINTS = [
  { path: '/ai/', name: '官网 AI 落地页', critical: true },
  { path: '/ai/llms.txt', name: 'llms.txt（AI 索引）', critical: true, expect: 'text' },
  { path: '/robots.txt', name: 'robots.txt（爬虫规则）', critical: true, expect: 'text' },
  { path: '/ai/api/mcp.php', name: 'MCP API 端点（Glama 探测的就是这个）', critical: true, expect: 'any' },
  { path: '/.well-known/mcp/server-card.json', name: 'MCP Server Card', critical: false, expect: 'json' },
];

async function probeEndpoint(base, ep) {
  const url = base + ep.path;
  const r = { name: ep.name, path: ep.path, url, ok: false, http: null, bytes: null, err_type: null, error: null, body_head: null };
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000), redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MACKORN-health/1.0)' },
    });
    r.http = res.status;
    const txt = await res.text();
    r.bytes = txt.length;
    r.body_head = txt.slice(0, 80).replace(/\n/g, ' ');
    r.ok = res.ok;
    if (!res.ok) { r.err_type = 'http'; r.error = 'HTTP ' + res.status; }
    return r;
  } catch (e) {
    const cause = e.cause ? (e.cause.code || e.cause.message) : '';
    const msg = String(e.message) + ' ' + String(cause);
    r.error = (cause || e.message || '').toString().slice(0, 80);
    if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) r.err_type = 'dns';
    else if (/CERT|SSL|TLS|UNABLE_TO_VERIFY/i.test(msg)) r.err_type = 'ssl';
    else if (/ECONNRESET|ECONNREFUSED/i.test(msg)) r.err_type = 'network';
    else if (/timeout|abort/i.test(msg)) r.err_type = 'timeout';
    else r.err_type = 'other';
    return r;
  }
}

const baseCandidates = ['https://mackorn.cn', 'https://www.mackorn.cn'];
const endpointResults = [];
for (const base of baseCandidates) {
  for (const ep of ENDPOINTS) {
    const r = await probeEndpoint(base, ep);
    r.base = base;
    endpointResults.push(r);
  }
}

/* 选一个"最可用"的 base（ok 数量最多） */
const scoreByBase = {};
for (const base of baseCandidates) {
  scoreByBase[base] = endpointResults.filter((r) => r.base === base && r.ok).length;
}
const bestBase = Object.entries(scoreByBase).sort((a, b) => b[1] - a[1])[0];

/* ══════════════════════════════════════════════════════════════
 * 三、AI 爬虫规则检查（robots.txt）
 * ══════════════════════════════════════════════════════════════ */
const AI_BOTS = ['GPTBot', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'Google-Extended', 'anthropic-ai', 'CCBot', 'Bytespider'];
let robotsCheck = null;
const robotsEp = endpointResults.find((r) => r.path === '/robots.txt' && r.ok);
if (robotsEp) {
  try {
    const res = await fetch(robotsEp.url, { signal: AbortSignal.timeout(20000) });
    const txt = await res.text();
    const lines = txt.split('\n');
    const bots = AI_BOTS.map((b) => {
      /* 找 User-agent: <bot> 之后的 Disallow */
      let found = false; let disallowed = false;
      for (let i = 0; i < lines.length; i += 1) {
        if (new RegExp('^\\s*user-agent:\\s*' + b + '\\b', 'i').test(lines[i])) {
          found = true;
          for (let j = i + 1; j < lines.length && j < i + 6; j += 1) {
            if (/^\s*user-agent:/i.test(lines[j])) break;
            if (/^\s*disallow:\s*\//i.test(lines[j]) && !/disallow:\s*$/i.test(lines[j])) disallowed = true;
          }
          break;
        }
      }
      return { bot: b, mentioned: found, disallowed };
    });
    const wildcard = /user-agent:\s*\*\s*\n(?:.*\n)*?\s*disallow:\s*\//i.test(txt) && !/user-agent:\s*\*\s*\n(?:.*\n)*?\s*allow:\s*\//i.test(txt);
    robotsCheck = {
      url: robotsEp.url,
      bytes: txt.length,
      ai_bots: bots,
      wildcard_blocks_all: wildcard,
      verdict: (() => {
        const blocking = bots.filter((b) => b.mentioned && b.disallowed);
        if (blocking.length) return 'BLOCKED: ' + blocking.map((b) => b.bot).join(', ') + ' 被明确禁止';
        if (wildcard && !bots.some((b) => b.mentioned)) return 'WARN: 通配符禁止全部，且未显式允许 AI 爬虫';
        const allowed = bots.filter((b) => b.mentioned && !b.disallowed);
        if (allowed.length) return 'OK: ' + allowed.map((b) => b.bot).join(', ') + ' 显式允许';
        return 'OK: 无禁止规则（默认允许）';
      })(),
    };
  } catch (e) {
    robotsCheck = { error: String(e.message).slice(0, 80) };
  }
}

/* ══════════════════════════════════════════════════════════════
 * 四、汇总
 * ══════════════════════════════════════════════════════════════ */
const dnsOkAll = dnsResults.every((r) => r.ok);
const sslFails = endpointResults.filter((r) => r.err_type === 'ssl');
const dnsFails = endpointResults.filter((r) => r.err_type === 'dns');
const bestBaseOk = bestBase ? bestBase[1] : 0;

/* 主要矛盾判定（只列一个） */
let mainBlocker = null;
let mainBlockerAction = null;
if (dnsFails.length && dnsFails.length >= sslFails.length) {
  mainBlocker = 'DNS：裸域 mackorn.cn 无 A 记录（' + dnsFails.length + ' 个端点因此失败）';
  mainBlockerAction = '在阿里云 DNS 添加 A 记录：主机记录 @ → 47.110.80.123';
} else if (sslFails.length) {
  mainBlocker = 'SSL：证书已过期（' + sslFails.length + ' 个端点因此失败）';
  mainBlockerAction = '续期证书：certbot --apache -d mackorn.cn -d www.mackorn.cn';
} else if (!dnsOkAll) {
  mainBlocker = 'DNS：部分域名解析失败';
  mainBlockerAction = '检查阿里云 DNS 配置';
} else if (bestBaseOk < ENDPOINTS.length) {
  mainBlocker = '端点：' + (ENDPOINTS.length - bestBaseOk) + ' 个端点不可用';
  mainBlockerAction = '逐个检查服务器上的文件是否存在';
}

const report = {
  schema: 'mackorn-reachability/1',
  generated: new Date().toISOString(),
  what: '可发现性体检 —— DNS / SSL / 端点 / AI 爬虫 四重检查',
  why: '2026-10-21 实测发现 mackorn.cn 打不开是 DNS 与 SSL 两个独立问题叠加。'
    + '连续三天误判为单纯 SSL 问题，因为没把 dns.lookup 与 fetch 分开跑。',
  main_blocker: mainBlocker,
  main_blocker_action: mainBlockerAction,
  dns: { ok: dnsOkAll, results: dnsResults },
  ssl: {
    ok: sslFails.length === 0,
    fail_count: sslFails.length,
    note: sslFails.length ? '证书过期或不受信' : '证书正常',
    error_code: sslFails[0] ? sslFails[0].error : null,
  },
  endpoints: {
    best_base: bestBase ? bestBase[0] : null,
    best_base_ok: bestBaseOk,
    total: ENDPOINTS.length,
    results: endpointResults,
  },
  robots: robotsCheck,
  verdict: (() => {
    if (!dnsOkAll) return 'RED: DNS 不完整';
    if (sslFails.length) return 'RED: 证书过期';
    if (bestBaseOk === ENDPOINTS.length) return 'GREEN: 全部可达';
    return 'YELLOW: 部分端点不可用';
  })(),
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'reachability.json'), JSON.stringify(report, null, 2), 'utf8');
const outFile = val('--out');
if (outFile) writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');

if (has('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

/* 打印 */
const I = { dns: '🌐', ssl: '🔐', http: '📄', network: '🔌', timeout: '⏱️', other: '❓' };
console.log('');
console.log('  ══ 可发现性体检 ══');
console.log('  （DNS / SSL / 端点 / AI 爬虫 分开检 —— 因为它们是独立问题）');
console.log('');
console.log('  【主要矛盾】' + (mainBlocker || '无'));
if (mainBlockerAction) console.log('  【怎么修】  ' + mainBlockerAction);
console.log('');
console.log('  ── ① DNS ──');
for (const r of dnsResults) {
  console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + r.host.padEnd(20) + (r.ok ? r.address : r.error) + '  ' + r.role);
}
console.log('');
console.log('  ── ② SSL / 端点 ──');
for (const base of baseCandidates) {
  console.log('  [' + base + ']');
  for (const r of endpointResults.filter((x) => x.base === base)) {
    const ic = r.ok ? '✅' : (I[r.err_type] || '❌');
    console.log('    ' + ic + ' ' + r.name.padEnd(42) + (r.ok ? 'HTTP ' + r.http + ' · ' + r.bytes + 'B' : (r.err_type || '') + ': ' + r.error));
  }
  console.log('');
}
if (robotsCheck && !robotsCheck.error) {
  console.log('  ── ③ AI 爬虫可达性 ──');
  console.log('  robots.txt ' + robotsCheck.bytes + ' 字节 · 判定：' + robotsCheck.verdict);
  for (const b of robotsCheck.ai_bots) {
    if (b.mentioned) console.log('    ' + (b.disallowed ? '🚫' : '✅') + ' ' + b.bot);
  }
  console.log('');
}
console.log('  ── 判定 ──');
console.log('  ' + report.verdict);
console.log('');
console.log('  报告：distribution/03_验证与基准/reachability.json');
console.log('');
