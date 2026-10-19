/**
 * 线上健康检查（R101）
 *
 * 为什么需要这个工具（本会话真实发现）：
 *   2026-10-19 夜间巡检发现 mackorn.cn 的 SSL 证书【已过期 4.5 天】
 *   （DigiCert，有效期到 2026-10-14）。而本项目有 30+ 门禁、88 条教训，
 *   【没有任何一条在盯线上服务是否活着】——
 *   我们只顾着"本地文件对不对"，没顾"线上能不能访问"。
 *
 *   后果可能很严重：
 *     · 所有浏览器访问官网显示"不安全"
 *     · 搜索引擎 / AI 爬虫抓取失败
 *     · ★ Glama 探测 https://mackorn.cn/ai/api/mcp.php 失败
 *       → 判定 Unresponsive → 质量分评不出来 → PR #15410 卡住
 *
 * 本工具检查五件事：
 *   ① 官网 HTTPS 可达且证书未过期（提前 14 天预警）
 *   ② /ai/ 落地页可达
 *   ③ /ai/api/mcp.php 能正常响应 JSON-RPC 并返回正确工具数
 *   ④ /llms.txt 可达
 *   ⑤ 证书剩余天数
 *
 * 用法：
 *   node tools/check_live_health.mjs
 *   node tools/check_live_health.mjs --json
 *   node tools/check_live_health.mjs --cert-only   # 只查证书（快）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:tls';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');
const JSON_ONLY = process.argv.includes('--json');
const CERT_ONLY = process.argv.includes('--cert-only');

const HOST = 'mackorn.cn';
const EXPECT_TOOLS = 22;   // 本地真相源
const CERT_WARN_DAYS = 14; // 提前 14 天预警

const results = [];
const add = (id, name, pass, detail, extra = {}) => results.push({ id, name, pass, detail, ...extra });

/* ── 工具：带超时的 fetch ── */
async function probe(url, opts = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeout || 20000) });
    const text = await r.text();
    return { ok: true, status: r.status, text, ms: Date.now() - t0 };
  } catch (e) {
    const c = (e && e.cause) || {};
    return { ok: false, err: String(c.code || (e && e.message) || e).slice(0, 60), ms: Date.now() - t0 };
  }
}

/* ══════ ① 证书 ══════ */
async function checkCert() {
  return new Promise((res) => {
    const out = { ok: false, days: null, validTo: null, issuer: null, subject: null, err: null };
    let done = false;
    const finish = () => { if (!done) { done = true; res(out); } };
    try {
      const sock = connect({ host: HOST, port: 443, servername: HOST, rejectUnauthorized: false }, () => {
        try {
          const c = sock.getPeerCertificate();
          out.subject = c && c.subject ? c.subject.CN : null;
          out.issuer = c && c.issuer ? (c.issuer.O || c.issuer.CN) : null;
          out.validTo = c ? c.valid_to : null;
          const vt = c ? Date.parse(c.valid_to) : NaN;
          if (Number.isFinite(vt)) out.days = Number(((vt - Date.now()) / 86400000).toFixed(1));
          out.ok = Number.isFinite(out.days) && out.days > 0;
        } catch (e) { out.err = String(e.message).slice(0, 60); }
        sock.end();
        finish();
      });
      sock.on('error', (e) => { out.err = String(e.code || e.message).slice(0, 60); finish(); });
      sock.setTimeout(15000, () => { out.err = 'timeout'; sock.destroy(); finish(); });
    } catch (e) { out.err = String(e.message).slice(0, 60); finish(); }
  });
}

const cert = await checkCert();
add('cert', 'SSL 证书有效且不临期', cert.ok && cert.days >= CERT_WARN_DAYS,
  cert.err ? '❌ ' + cert.err
    : cert.days === null ? '❌ 读不到有效期'
      : (cert.days <= 0 ? '❌ **已过期 ' + Math.abs(cert.days) + ' 天**（' + cert.validTo + '）'
        : cert.days < CERT_WARN_DAYS ? '⚠️ 只剩 ' + cert.days + ' 天（提前 ' + CERT_WARN_DAYS + ' 天预警）'
          : '✅ 还有 ' + cert.days + ' 天（' + cert.issuer + '）'),
  { cert });

if (!CERT_ONLY) {
  /* ══════ ② 官网首页 ══════ */
  {
    const r = await probe('https://' + HOST + '/');
    add('home', '官网首页 HTTPS 可达', r.ok && r.status < 400,
      r.ok ? 'HTTP ' + r.status + ' · ' + r.text.length + ' 字符 · ' + r.ms + 'ms' : '❌ ' + r.err);
  }

  /* ══════ ③ /ai/ 落地页 ══════ */
  {
    const r = await probe('https://' + HOST + '/ai/');
    add('landing', '/ai/ 落地页可达', r.ok && r.status < 400,
      r.ok ? 'HTTP ' + r.status + ' · ' + r.text.length + ' 字符' : '❌ ' + r.err);
  }

  /* ══════ ④ MCP 端点 ══════ */
  {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
    const r = await probe('https://' + HOST + '/ai/api/mcp.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    let n = null, ok = false, extra = '';
    if (r.ok && r.status === 200) {
      try { const j = JSON.parse(r.text); n = ((j.result && j.result.tools) || []).length; ok = n > 0; extra = ' · 工具数 ' + n; } catch { }
    }
    add('mcp', 'MCP 端点响应 JSON-RPC', ok,
      ok ? 'HTTP 200' + extra + (n !== EXPECT_TOOLS ? ' ⚠️ 本地 ' + EXPECT_TOOLS : ' ✅') : (r.ok ? 'HTTP ' + r.status + ' 但响应不可解析' : '❌ ' + r.err),
      { tools: n });
  }

  /* ══════ ⑤ llms.txt ══════ */
  {
    const r = await probe('https://' + HOST + '/llms.txt');
    add('llms', 'llms.txt 可达', r.ok && r.status === 200 && r.text.length > 1000,
      r.ok ? 'HTTP ' + r.status + ' · ' + r.text.length + ' 字符' : '❌ ' + r.err);
  }
}

/* ══════ 汇总 ══════ */
const failed = results.filter((x) => !x.pass);
const out = {
  schema: 'mackorn-live-health/1',
  generated: new Date().toISOString(),
  host: HOST,
  cert_warn_days: CERT_WARN_DAYS,
  expected_tools: EXPECT_TOOLS,
  checks: results,
  summary: { total: results.length, passed: results.length - failed.length, failed: failed.length },
  verdict: failed.length ? 'UNHEALTHY' : 'HEALTHY',
  note: '线上健康检查 —— 弥补"只顾本地、不看线上"的监控盲区。',
};

mkdirSync(D, { recursive: true });
writeFileSync(join(D, 'live-health.json'), JSON.stringify(out, null, 2), 'utf8');

if (JSON_ONLY) { console.log(JSON.stringify(out, null, 2)); process.exit(failed.length ? 1 : 0); }

console.log('');
console.log('  ══ 线上健康检查 · ' + HOST + ' ══');
console.log('');
for (const r of results) console.log('  ' + (r.pass ? '✅' : '❌') + ' ' + r.name.padEnd(26) + ' ' + r.detail);
console.log('');
console.log('  判定：' + (out.verdict === 'HEALTHY' ? '✅ 健康' : '❌ 有 ' + failed.length + ' 项异常'));
console.log('');
if (failed.length) {
  console.log('  ── 需要处理 ──');
  for (const f of failed) console.log('    · ' + f.name + '：' + f.detail);
  console.log('');
  if (cert.days !== null && cert.days <= 0) {
    console.log('  ★ 证书已过期 —— 这会让官网全站 HTTPS 不可用，');
    console.log('    也可能导致 Glama 探测我们的 MCP 端点失败（PR #15410 卡住）。');
    console.log('    详见 distribution/紧急-SSL证书过期告警.md');
    console.log('');
  }
}
console.log('  已写 distribution/03_验证与基准/live-health.json');
console.log('');
process.exit(failed.length ? 1 : 0);
