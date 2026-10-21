/**
 * AI 目录收录检查器（R137）
 *
 * 用户要求（2026-10-21）：
 *   「编程设计收录检查器，更新上传器；定期检查哪些平台收录了、哪些待收录；
 *     每 3 天对已收录的进行更新，对待收录的查询并提问完善，增加收录量；
 *     分析待收录 AI，不断发问，增加收录方法，通过收录审核；
 *     不断搜寻增加待收录的 AI 清单；积累被收录经验，写进经验库和失败经验库。」
 *
 * 本工具做四件事：
 *   ① --status      看台账（哪些已收录 / 待收录 / 被挡）
 *   ② --check       实地探测每个平台的 probe URL，更新状态
 *   ③ --due         看哪些到了检查期（默认 3 天）
 *   ④ --experience  看经验库与失败经验库
 *   ⑤ --next        生成「下一步该做什么」清单（按影响平台数排序）
 *
 * 数据：directory-registry/registry.json
 * 结果：directory-registry/check-results.json
 *
 * 用法：
 *   node tools/directory_checker.mjs
 *   node tools/directory_checker.mjs --check
 *   node tools/directory_checker.mjs --check --only github,npm,glama
 *   node tools/directory_checker.mjs --due
 *   node tools/directory_checker.mjs --experience
 *   node tools/directory_checker.mjs --next
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const REG_DIR = join(ROOT, 'directory-registry');
const REG = join(REG_DIR, 'registry.json');
const RESULTS = join(REG_DIR, 'check-results.json');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };

const DAY = 86400000;
const today = new Date().toISOString().slice(0, 10);
const now = Date.now();

function loadRegistry() {
  if (!existsSync(REG)) return null;
  return JSON.parse(readFileSync(REG, 'utf8'));
}

const reg = loadRegistry();
if (!reg) { console.error('找不到 directory-registry/registry.json'); process.exit(1); }

const platforms = reg.platforms || [];

/* ══════════════════════════════════════════════════════════════
 * --status  看台账
 * ══════════════════════════════════════════════════════════════ */
if (!has('--check') && !has('--due') && !has('--experience') && !has('--next')) {
  const byStatus = {};
  for (const p of platforms) {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  }
  const ICON = {
    listed: '✅', 'listed-but-unresponsive': '⚠️', 'pr-open': '🔵', merged: '✅',
    'not-listed': '❌', blocked: '🚫', 'no-directory': '⬜', unknown: '❓',
  };
  console.log('');
  console.log('  ══ AI 目录收录台账 ══');
  console.log('  更新：' + (reg.updated || '?') + ' · 检查周期：每 ' + (reg.rhythm?.check_interval_days || 3) + ' 天');
  console.log('');
  console.log('  平台 ' + platforms.length + ' 个：');
  const order = ['listed', 'merged', 'listed-but-unresponsive', 'pr-open', 'not-listed', 'blocked', 'no-directory'];
  for (const st of order) {
    if (!byStatus[st]) continue;
    console.log('    ' + (ICON[st] || '·') + ' ' + st + ': ' + byStatus[st]);
  }
  console.log('');
  console.log('  ── 逐平台 ──');
  for (const p of platforms.sort((a, b) => (a.priority || 9) - (b.priority || 9))) {
    const ic = ICON[p.status] || '·';
    const reqOk = (p.requirements || []).filter((r) => r.satisfied === true).length;
    const reqTotal = (p.requirements || []).length;
    console.log('  ' + ic + ' [' + String(p.priority || 9) + '] ' + p.name.padEnd(34)
      + (reqTotal ? reqOk + '/' + reqTotal + ' 条件' : '无目录')
      + (p.last_checked ? ' · 上次检查 ' + p.last_checked : ''));
    if (p.blockers && p.blockers.length) {
      console.log('       阻塞：' + p.blockers.join(' / '));
    }
    if (p.status === 'no-directory' && p.notes) {
      console.log('       ' + String(p.notes).slice(0, 110));
    }
  }
  console.log('');
  console.log('  ── 命令 ──');
  console.log('    --check              实地探测所有平台（更新状态）');
  console.log('    --check --only a,b   只查指定平台');
  console.log('    --due                看哪些到了检查期');
  console.log('    --next               下一步该做什么（按影响排序）');
  console.log('    --experience         看经验库与失败经验库');
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --due  看哪些到检查期
 * ══════════════════════════════════════════════════════════════ */
if (has('--due')) {
  const interval = (reg.rhythm?.check_interval_days || 3) * DAY;
  console.log('');
  console.log('  ══ 到期检查（周期 ' + (reg.rhythm?.check_interval_days || 3) + ' 天）══');
  console.log('');
  let dueCount = 0;
  for (const p of platforms) {
    if (!p.probe) { continue; }  /* 无 probe 的跳过 */
    const last = p.last_checked ? Date.parse(p.last_checked) : 0;
    const ageDays = Math.floor((now - last) / DAY);
    const due = (now - last) >= interval;
    if (due) dueCount += 1;
    console.log('  ' + (due ? '🔴 到期' : '✅ 未到期') + ' ' + p.name.padEnd(34)
      + (p.last_checked ? ageDays + ' 天前' : '从未检查'));
  }
  console.log('');
  console.log('  到期 ' + dueCount + ' 个' + (dueCount ? ' → 跑 node tools/directory_checker.mjs --check' : ''));
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --experience  看经验库
 * ══════════════════════════════════════════════════════════════ */
if (has('--experience')) {
  const exp = reg.experience || {};
  console.log('');
  console.log('  ══ 收录经验库 ══');
  console.log('');
  console.log('  ── 成功经验（' + (exp.success || []).length + ' 条）──');
  for (const e of (exp.success || [])) {
    console.log('  ✅ ' + e.id + ' ' + e.title);
    console.log('     ' + String(e.detail).slice(0, 130));
    console.log('     ' + e.date + (e.transferable ? ' · 可迁移' : ''));
    console.log('');
  }
  console.log('  ── 失败经验（' + (exp.failure || []).length + ' 条）──');
  for (const e of (exp.failure || [])) {
    console.log('  ❌ ' + e.id + ' ' + e.title);
    console.log('     ' + String(e.detail).slice(0, 130));
    console.log('     ★ 教训: ' + e.lesson);
    console.log('     ' + e.date + ' · 复现 ' + (e.recurrence ?? '?') + ' 次');
    console.log('');
  }
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --next  下一步该做什么
 * ══════════════════════════════════════════════════════════════ */
if (has('--next')) {
  const actions = [];
  /* 阻塞原因归并 */
  /* R138 修 bug：blocker 字符串写法不统一（"DNS：..." / "DNS + SSL" / "生产级 HTTPS..."），
   * 会被拆成多条。改成【归一到 canonical 根因】：
   *   DNS / SSL / 第三方评分 / 手工提交 / 审核 */
  const canonical = (s) => {
    if (/DNS/i.test(s)) return 'DNS：裸域 mackorn.cn 无 A 记录';
    if (/SSL|证书|HTTPS/i.test(s)) return 'SSL：证书 2026-10-14 已过期';
    if (/评分|Glama/i.test(s)) return 'Glama 评分未出（依赖 DNS+SSL）';
    if (/提交|submit/i.test(s)) return '需手工提交（材料已备）';
    if (/审核|review/i.test(s)) return '需平台人工审核';
    return s;
  };
  const blockerMap = new Map();
  const touch = (raw, pname) => {
    const key = canonical(raw);
    if (!blockerMap.has(key)) blockerMap.set(key, []);
    if (!blockerMap.get(key).includes(pname)) blockerMap.get(key).push(pname);
  };
  for (const p of platforms) {
    for (const b of (p.blockers || [])) touch(b, p.name);
    for (const r of (p.requirements || [])) {
      if (r.satisfied === false && r.blocker) touch(r.blocker, p.name);
    }
  }
  console.log('');
  console.log('  ══ 下一步（按影响平台数排序）══');
  console.log('');
  const sorted = [...blockerMap.entries()].sort((a, b) => b[1].length - a[1].length);
  let i = 1;
  for (const [blocker, plats] of sorted) {
    const fixHint = /DNS/i.test(blocker) ? '阿里云 DNS 加 A 记录：@ → 47.110.80.123'
      : /SSL|证书/i.test(blocker) ? 'certbot --apache -d mackorn.cn -d www.mackorn.cn'
      : /Glama/i.test(blocker) ? '修 DNS+SSL 后去 Glama 后台点 Refresh'
      : /提交/i.test(blocker) ? '按 distribution/📤AI目录提交材料包.md 提交'
      : '人工确认';
    console.log('  P' + (plats.length >= 2 ? 0 : 1) + ' [' + i + '] ' + blocker);
    console.log('      影响 ' + plats.length + ' 个平台: ' + plats.join(', '));
    console.log('      怎么修: ' + fixHint);
    console.log('');
    i += 1;
  }
  if (!sorted.length) {
    console.log('  ✅ 没有阻塞项 —— 所有条件都满足了');
    console.log('');
  }
  /* 待提交清单 */
  const toSubmit = platforms.filter((p) => p.status === 'not-listed');
  if (toSubmit.length) {
    console.log('  ── 待手工提交（' + toSubmit.length + ' 个）──');
    for (const p of toSubmit) {
      console.log('  📤 ' + p.name);
      console.log('     提交: ' + p.submit_method);
      console.log('     材料: distribution/📤AI目录提交材料包.md');
    }
    console.log('');
  }
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --check  实地探测
 * ══════════════════════════════════════════════════════════════ */
const only = val('--only');
const targets = platforms.filter((p) => p.probe && (!only || only.split(',').some((o) => p.id.includes(o.trim()))));

const IDENTIFIERS = ['mackorn', 'MACKORN', 'mackorn-cone-crusher', 'MACKORN-hydraulic-cone-crusher', 'cn.mackorn'];

async function probe(p) {
  const r = {
    id: p.id, name: p.name,
    url: p.probe,
    http: null, ms: null,
    status: 'unknown', prev_status: p.status,
    matched: [], err_type: null, error: null,
  };
  const t0 = Date.now();
  try {
    const res = await fetch(p.probe, {
      signal: AbortSignal.timeout(25000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MACKORN-directory-check/1.0)',
        Accept: 'application/json, text/html, */*',
      },
    });
    r.http = res.status;
    r.ms = Date.now() - t0;

    if (res.status === 401 || res.status === 403 || res.status === 429) {
      r.status = 'blocked';
      r.error = 'HTTP ' + res.status + '（反爬/限流，不算未收录）';
      return r;
    }
    if (!res.ok) {
      r.status = 'not-listed';
      r.error = 'HTTP ' + res.status;
      return r;
    }
    const txt = await res.text();
    const hits = IDENTIFIERS.filter((id) => txt.toLowerCase().includes(id.toLowerCase()));
    r.matched = [...new Set(hits)];
    r.status = hits.length > 0 ? 'listed' : 'not-listed';
    if (!hits.length) r.error = 'HTTP 200 但页面无 mackorn 标识符';
    return r;
  } catch (e) {
    r.ms = Date.now() - t0;
    const cause = e.cause ? (e.cause.code || e.cause.message) : '';
    const msg = String(e.message) + ' ' + String(cause);
    r.error = (cause || e.message || '').toString().slice(0, 100);
    if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) r.err_type = 'dns';
    else if (/CERT|SSL|TLS/i.test(msg)) r.err_type = 'ssl';
    else if (/ECONNRESET|ECONNREFUSED/i.test(msg)) r.err_type = 'network';
    else if (/timeout|abort/i.test(msg)) r.err_type = 'timeout';
    else r.err_type = 'other';
    r.status = 'error';
    return r;
  }
}

console.log('');
console.log('  ══ 实地探测 ' + targets.length + ' 个平台 ══');
console.log('');

const results = [];
for (let i = 0; i < targets.length; i += 1) {
  const p = targets[i];
  const r = await probe(p);
  results.push(r);
  const ICON = { listed: '✅', 'not-listed': '❌', blocked: '🚫', error: '⚠️', unknown: '❓' };
  console.log('  ' + (ICON[r.status] || '·') + ' ' + p.name.padEnd(32)
    + String(r.http ?? '—').padStart(5) + '  ' + String(r.ms ?? '—').padStart(6) + 'ms'
    + (r.error ? '  ' + r.error : ''));
  /* 更新台账 */
  p.last_checked = today;
  if (r.status === 'listed') p.status = p.status === 'merged' || p.status === 'pr-open' ? p.status : 'listed';
  else if (r.status === 'blocked') p.status = 'blocked';
  else if (r.status === 'not-listed' && p.status === 'listed') p.status = 'listed-but-unresponsive';
  if (i < targets.length - 1) await new Promise((x) => setTimeout(x, 300));
}

/* 汇总 */
const sum = {
  total: results.length,
  listed: results.filter((r) => r.status === 'listed').length,
  not_listed: results.filter((r) => r.status === 'not-listed').length,
  blocked: results.filter((r) => r.status === 'blocked').length,
  error: results.filter((r) => r.status === 'error').length,
};

console.log('');
console.log('  结果：✅收录 ' + sum.listed + ' · ❌未收录 ' + sum.not_listed
  + ' · 🚫被挡 ' + sum.blocked + ' · ⚠️错误 ' + sum.error);
console.log('');

/* 错误分型汇总（DNS vs SSL 必须分开） */
const errTypes = {};
for (const r of results.filter((x) => x.status === 'error')) {
  errTypes[r.err_type] = (errTypes[r.err_type] || 0) + 1;
}
if (Object.keys(errTypes).length) {
  console.log('  ── 错误分型（DNS 与 SSL 必须分开看）──');
  for (const [t, n] of Object.entries(errTypes)) {
    const hint = t === 'dns' ? '★ DNS 解析失败（A 记录缺失）'
      : t === 'ssl' ? '★ 证书过期/不受信（TLS 握手失败）'
      : t === 'network' ? '网络重置/拒绝（可能代理或防火墙）'
      : t === 'timeout' ? '超时'
      : '其他';
    console.log('  ' + t + ': ' + n + ' 个 — ' + hint);
  }
  console.log('');
}

/* 写台账 + 结果 */
reg.updated = today;
reg.rhythm = reg.rhythm || {};
reg.rhythm.last_check = today;
mkdirSync(REG_DIR, { recursive: true });
writeFileSync(REG, JSON.stringify(reg, null, 2), 'utf8');
writeFileSync(RESULTS, JSON.stringify({ schema: 'mackorn-directory-check/1', at: new Date().toISOString(), summary: sum, err_types: errTypes, results }, null, 2), 'utf8');

console.log('  台账已更新：directory-registry/registry.json');
console.log('  结果已写：directory-registry/check-results.json');
console.log('');
