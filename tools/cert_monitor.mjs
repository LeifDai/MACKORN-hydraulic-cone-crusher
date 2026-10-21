/**
 * 证书与域名监控（R139）
 *
 * ★ 为什么必须建这个：
 *   2026-10-14 证书过期，一直到 10-21 才发现（前后 7 天）。
 *   期间：Glama 判定 cannot be deployed、Claude 无法提交、awesome-mcp PR 卡住。
 *   如果有提前 30 天预警，这 7 天的损失完全可以避免。
 *
 * 监控三件事：
 *   ① DNS：A 记录是否存在（裸域 + www）
 *   ② SSL：证书剩余天数（30 天预警 / 14 天告警 / 7 天严重 / 0 天已过期）
 *   ③ 端点：llms.txt / robots.txt / mcp.php / 首页 是否可访问
 *
 * 与 reachability_health.mjs 的区别：
 *   reachability_health 做「一次性体检 + 主要矛盾判定」
 *   cert_monitor 做「趋势监控 + 到期预警」，可接进云端定时跑
 *
 * 用法：
 *   node tools/cert_monitor.mjs              # 报告
 *   node tools/cert_monitor.mjs --check      # 门禁（过期则 exit 1）
 *   node tools/cert_monitor.mjs --json
 */
import { connect } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'distribution', '03_验证与基准');
const HIST = join(OUT_DIR, 'cert-history.json');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

/* ══════════════════════════════════════════════════════════════
 * 一、DNS 检查
 * ══════════════════════════════════════════════════════════════ */
async function checkDns() {
  const out = [];
  for (const h of ['mackorn.cn', 'www.mackorn.cn']) {
    try {
      const r = await lookup(h, { family: 4 });
      out.push({ host: h, ok: true, address: r.address });
    } catch (e) {
      out.push({ host: h, ok: false, error: e.code || e.message });
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════
 * 二、SSL 证书检查（抓证书详情，不校验）
 * ══════════════════════════════════════════════════════════════ */
function getCert(sni, ip = null) {
  return new Promise((resolve) => {
    const host = ip || sni;
    const sock = connect({
      host, port: 443, servername: sni,
      rejectUnauthorized: false,
      timeout: 15000,
    }, () => {
      try {
        const cert = sock.getPeerCertificate(true);
        if (!cert || !cert.raw) { sock.end(); resolve({ ok: false, err: 'no cert' }); return; }
        const x = new X509Certificate(cert.raw);
        const validTo = new Date(cert.valid_to);
        const daysLeft = Math.floor((validTo.getTime() - Date.now()) / 86400000);
        sock.end();
        resolve({
          ok: true,
          sni,
          subject: cert.subject?.CN,
          issuer: cert.issuer?.CN || cert.issuer?.O,
          issuer_o: cert.issuer?.O || null,
          valid_from: cert.valid_from,
          valid_to: cert.valid_to,
          days_left: daysLeft,
          expired: daysLeft < 0,
          san: cert.subjectaltname,
          fingerprint: x.fingerprint256,
        });
      } catch (e) {
        sock.end();
        resolve({ ok: false, err: String(e.message).slice(0, 60) });
      }
    });
    sock.on('error', (e) => resolve({ ok: false, err: e.code || e.message }));
    sock.setTimeout(15000, () => { sock.destroy(); resolve({ ok: false, err: 'timeout' }); });
  });
}

/* ══════════════════════════════════════════════════════════════
 * 三、端点检查
 * ══════════════════════════════════════════════════════════════ */
const ENDPOINTS = ['/ai/', '/ai/llms.txt', '/robots.txt', '/ai/api/mcp.php', '/.well-known/mcp/server-card.json'];

async function checkEndpoints(base) {
  const out = [];
  for (const p of ENDPOINTS) {
    const u = base + p;
    const r = { path: p, url: u, ok: false, http: null, bytes: null, err: null, err_type: null };
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(20000), redirect: 'follow' });
      r.http = res.status;
      const txt = await res.text();
      r.bytes = txt.length;
      r.ok = res.ok;
    } catch (e) {
      const cause = e.cause ? (e.cause.code || e.cause.message) : '';
      r.err = (cause || e.message || '').toString().slice(0, 60);
      if (/CERT|SSL|TLS/i.test(String(cause) + String(e.message))) r.err_type = 'ssl';
      else if (/ENOTFOUND/i.test(String(cause))) r.err_type = 'dns';
      else if (/ECONNRESET|ECONNREFUSED/i.test(String(cause))) r.err_type = 'network';
      else r.err_type = 'other';
    }
    out.push(r);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════════ */
const dns = await checkDns();
const certs = [];
for (const sni of ['mackorn.cn', 'www.mackorn.cn']) {
  certs.push(await getCert(sni));
}
const endpoints = await checkEndpoints('https://mackorn.cn');
const endpointsWww = await checkEndpoints('https://www.mackorn.cn');

/* 选定一份证书作为主判据（优先 mackorn.cn） */
const mainCert = certs.find((c) => c.ok && c.sni === 'mackorn.cn') || certs.find((c) => c.ok) || null;

/* 预警等级 */
function level(daysLeft) {
  if (daysLeft === null) return { level: 'unknown', action: '无法读取证书' };
  if (daysLeft < 0) return { level: 'critical', action: '★ 已过期 ' + Math.abs(daysLeft) + ' 天 —— 立即续期' };
  if (daysLeft <= 7) return { level: 'critical', action: '★ 仅剩 ' + daysLeft + ' 天 —— 立即续期' };
  if (daysLeft <= 14) return { level: 'warning', action: '⚠️ 剩 ' + daysLeft + ' 天 —— 本周内续期' };
  if (daysLeft <= 30) return { level: 'notice', action: '📅 剩 ' + daysLeft + ' 天 —— 计划续期' };
  return { level: 'ok', action: '✅ 剩 ' + daysLeft + ' 天' };
}

const certLevel = mainCert ? level(mainCert.days_left) : { level: 'unknown', action: '无法读取' };
const dnsOk = dns.every((d) => d.ok);
const endpointsOk = endpoints.filter((e) => e.ok).length;
const endpointsWwwOk = endpointsWww.filter((e) => e.ok).length;

const report = {
  schema: 'mackorn-cert-monitor/1',
  at: new Date().toISOString(),
  dns: { ok: dnsOk, results: dns },
  cert: {
    main: mainCert,
    all: certs,
    level: certLevel.level,
    action: certLevel.action,
    issuer_type: mainCert && /Encryption Everywhere|Aliyun|DigiCert/i.test(String(mainCert.issuer))
      ? '商业 CA（阿里云/ DigiCert 免费证书）' : '未知',
  },
  endpoints: {
    bare_domain: { base: 'https://mackorn.cn', ok_count: endpointsOk, total: ENDPOINTS.length, results: endpoints },
    www: { base: 'https://www.mackorn.cn', ok_count: endpointsWwwOk, total: ENDPOINTS.length, results: endpointsWww },
  },
  verdict: (() => {
    if (!dnsOk) return 'RED: DNS 不完整';
    if (certLevel.level === 'critical') return 'RED: ' + certLevel.action;
    if (certLevel.level === 'warning') return 'YELLOW: ' + certLevel.action;
    if (certLevel.level === 'notice') return 'NOTICE: ' + certLevel.action;
    if (endpointsOk < ENDPOINTS.length) return 'YELLOW: 部分端点不可用';
    return 'GREEN: 全部正常';
  })(),
  renewal_guide: 'distribution/🔐证书续期5分钟操作手册.md',
};

/* 历史记录 */
let hist = { version: 1, records: [] };
if (existsSync(HIST)) { try { hist = JSON.parse(readFileSync(HIST, 'utf8')); } catch { } }
hist.records = hist.records || [];
hist.records.push({
  at: report.at,
  dns_ok: dnsOk,
  cert_issuer: mainCert?.issuer ?? null,
  cert_valid_to: mainCert?.valid_to ?? null,
  cert_days_left: mainCert?.days_left ?? null,
  cert_level: certLevel.level,
  endpoints_ok: endpointsOk,
  verdict: report.verdict,
});
if (hist.records.length > 500) hist.records = hist.records.slice(-500);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'cert-monitor.json'), JSON.stringify(report, null, 2), 'utf8');
writeFileSync(HIST, JSON.stringify(hist, null, 2), 'utf8');

if (has('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

/* 打印 */
const I = { critical: '🔴', warning: '🟠', notice: '🟡', ok: '🟢', unknown: '⚪' };
console.log('');
console.log('  ══ 证书与域名监控 ══');
console.log('');
console.log('  ── ① DNS ──');
for (const d of dns) {
  console.log('  ' + (d.ok ? '✅' : '❌') + ' ' + d.host.padEnd(20) + (d.ok ? d.address : d.error));
}
console.log('');
console.log('  ── ② SSL 证书 ──');
if (mainCert) {
  console.log('  ' + (I[certLevel.level] || '·') + ' ' + certLevel.action);
  console.log('     Subject: ' + mainCert.subject);
  console.log('     Issuer : ' + mainCert.issuer);
  console.log('     有效期 : ' + mainCert.valid_from + '  →  ' + mainCert.valid_to);
  console.log('     剩余   : ' + mainCert.days_left + ' 天');
  console.log('     SAN    : ' + String(mainCert.san || '').slice(0, 100));
  console.log('     类型   : ' + report.cert.issuer_type);
} else {
  console.log('  ⚪ 无法读取证书');
}
console.log('');
console.log('  ── ③ 端点可达性 ──');
console.log('  裸域 https://mackorn.cn      ' + endpointsOk + '/' + ENDPOINTS.length + ' 可访问');
console.log('  www https://www.mackorn.cn   ' + endpointsWwwOk + '/' + ENDPOINTS.length + ' 可访问');
for (const e of endpoints) {
  const ic = e.ok ? '✅' : (e.err_type === 'ssl' ? '🔐' : e.err_type === 'dns' ? '🌐' : '❌');
  console.log('    ' + ic + ' ' + e.path.padEnd(38) + (e.ok ? 'HTTP ' + e.http + ' · ' + e.bytes + 'B' : (e.err_type || '') + ': ' + e.err));
}
console.log('');
console.log('  ── 判定 ──');
console.log('  ' + report.verdict);
console.log('');
console.log('  报告：distribution/03_验证与基准/cert-monitor.json');
console.log('  历史：distribution/03_验证与基准/cert-history.json（' + hist.records.length + ' 条）');
console.log('  续期手册：' + report.renewal_guide);
console.log('');

if (has('--check')) {
  if (certLevel.level === 'critical') {
    console.log('  ❌ 门禁失败：证书已过期或即将过期（' + certLevel.action + '）');
    console.log('');
    process.exit(1);
  }
}
