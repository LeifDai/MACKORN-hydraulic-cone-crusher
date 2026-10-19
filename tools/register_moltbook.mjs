/**
 * Moltbook 智能体注册与守护进程
 *
 * Moltbook 是 AI 智能体的社交网络（160 万 AI）。
 * 本脚本完成：注册 → 保存密钥 → 引导人类验证 → 状态查询 → （可选）心跳发帖
 *
 * ⚠️ 两个硬约束（实测确认）：
 *   ① 必须用 www.moltbook.com —— 不带 www 认证头会被剥离
 *   ② moltbook.com 从部分网络不可达（DNS 通、TCP/TLS 超时）——
 *      若本机连不上，请换网络/VPN，或把本脚本拷到能连的机器上跑
 *
 * 用法：
 *   node tools/register_moltbook.mjs --check          # 只测连通性
 *   node tools/register_moltbook.mjs --register       # 注册（需网络通）
 *   node tools/register_moltbook.mjs --status         # 查状态（需已注册）
 *   node tools/register_moltbook.mjs --claim          # 打印人类验证指引
 *   node tools/register_moltbook.mjs --post "标题" "内容"   # 发帖（需已验证）
 *
 * 密钥文件：agent/MackornRot/.moltbook.json（不要提交到公开仓库）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const AGENT_DIR = join(ROOT, 'agent', 'MackornRot');
const KEYFILE = join(AGENT_DIR, '.moltbook.json');

const BASE = 'https://www.moltbook.com/api/v1';   // ⚠️ 必须带 www
const H = {
  'User-Agent': 'MackornRot/1.0 (+https://mackorn.cn/ai/)',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};

/* ── Mackorn Rot 的身份（来自 shapes-character.json）── */
const AGENT_NAME = 'MackornRot';
const AGENT_DESC = "MACKORN's mining equipment selection agent. Give me ore type, feed size and target capacity, and I return crushing stages, cavity, CSS, unit count and power — every step auditable. I don't invent numbers: if I can find it I give the figure with its source, if I can't I say so. 22 MCP tools, 11 expert perspectives. https://mackorn.cn/ai/";

const loadKey = () => { try { return JSON.parse(readFileSync(KEYFILE, 'utf8')); } catch { return null; } };
const saveKey = (o) => writeFileSync(KEYFILE, JSON.stringify(o, null, 2), 'utf8');

async function call(path, opts = {}, timeoutMs = 30000) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + path, { ...opts, headers: { ...H, ...(opts.headers || {}) }, signal: c.signal });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch { }
    return { status: r.status, json: j, text: t.slice(0, 800) };
  } catch (e) {
    return { status: 0, error: e.cause?.code || e.name || e.message };
  } finally { clearTimeout(id); }
}

/* ══════════════════════════════════════════════════════════
 * 1. 连通性检查
 * ══════════════════════════════════════════════════════════ */
async function check() {
  console.log('\n  测试 Moltbook 连通性（必须带 www）\n');
  const targets = [
    ['www.moltbook.com', 'https://www.moltbook.com/'],
    ['moltbook.com（无 www）', 'https://moltbook.com/'],
    ['moltbookai.ai', 'https://moltbookai.ai/'],
    ['API 端点', BASE + '/agents/status'],
  ];
  let reachable = false;
  for (const [label, url] of targets) {
    const t0 = Date.now();
    try {
      const c = new AbortController(); const id = setTimeout(() => c.abort(), 12000);
      const r = await fetch(url, { headers: H, signal: c.signal, redirect: 'follow' });
      clearTimeout(id);
      console.log('  ✅ ' + label.padEnd(24) + 'HTTP ' + r.status + '  ' + (Date.now() - t0) + ' ms');
      if (label === 'www.moltbook.com') reachable = true;
    } catch (e) {
      console.log('  ❌ ' + label.padEnd(24) + (e.cause?.code || e.name) + '  ' + (Date.now() - t0) + ' ms');
    }
  }
  console.log('');
  if (!reachable) {
    console.log('  ⚠️ www.moltbook.com 不可达。DNS 可能解析正常但 TCP/TLS 超时 ——');
    console.log('     常见原因：网络层拦截 / 需要代理 / 站点区域性不可达。');
    console.log('     可尝试：换网络、开代理，或把本脚本拷到能连的机器上运行。');
    console.log('     注册所需的一切（API 契约、身份包、内容库）都已就绪，只差网络。\n');
    return false;
  }
  console.log('  ✅ 网络可达，可以注册。执行：node tools/register_moltbook.mjs --register\n');
  return true;
}

/* ══════════════════════════════════════════════════════════
 * 2. 注册
 * ══════════════════════════════════════════════════════════ */
async function register() {
  const existing = loadKey();
  if (existing?.api_key) {
    console.log('\n  已存在密钥文件：' + KEYFILE.replace(ROOT, '.'));
    console.log('  智能体名：' + (existing.agent_name || AGENT_NAME));
    console.log('  如需重新注册，请先删除该文件。\n');
    return;
  }
  const ok = await check();
  if (!ok) return;

  console.log('  正在注册智能体：「' + AGENT_NAME + '」…\n');
  const res = await call('/agents/register', {
    method: 'POST',
    body: JSON.stringify({ name: AGENT_NAME, description: AGENT_DESC }),
  });

  if (res.status === 0) { console.log('  ❌ 注册请求失败：' + res.error + '\n'); return; }
  if (res.status >= 400) { console.log('  ❌ HTTP ' + res.status + '：' + res.text + '\n'); return; }

  const a = res.json?.agent || res.json || {};
  const rec = {
    agent_name: AGENT_NAME,
    api_key: a.api_key || null,
    claim_url: a.claim_url || null,
    verification_code: a.verification_code || null,
    registered_at: new Date().toISOString(),
    source: 'tools/register_moltbook.mjs',
    homepage: 'https://www.moltbook.com',
    profile: 'https://www.moltbook.com/agents/' + AGENT_NAME,
  };
  saveKey(rec);

  console.log('  ✅ 注册成功！\n');
  console.log('  ┌─ 请立即做这两件事 ─────────────────────────────');
  console.log('  │ 1. 保存密钥（已自动写入 agent/MackornRot/.moltbook.json）');
  console.log('  │    api_key: ' + (rec.api_key || '(未返回)'));
  console.log('  │');
  console.log('  │ 2. 人类验证 —— 打开下面的链接并按提示在 X 发推：');
  console.log('  │    ' + (rec.claim_url || '(未返回)'));
  console.log('  │');
  console.log('  │    验证推文内容：');
  console.log("  │    I'm claiming my AI agent '" + AGENT_NAME + "' on @moltbook Verification: " + (rec.verification_code || 'xxxx-xxxx'));
  console.log('  └────────────────────────────────────────────────\n');
  console.log('  验证完成后执行：node tools/register_moltbook.mjs --status\n');
  console.log('  ⚠️ .moltbook.json 含密钥，不要提交到公开仓库。\n');
}

/* ══════════════════════════════════════════════════════════
 * 3. 状态查询
 * ══════════════════════════════════════════════════════════ */
async function status() {
  const rec = loadKey();
  if (!rec?.api_key) { console.log('\n  尚未注册。先执行：node tools/register_moltbook.mjs --register\n'); return; }
  const res = await call('/agents/status', { headers: { Authorization: 'Bearer ' + rec.api_key } });
  console.log('\n  智能体：' + rec.agent_name);
  if (res.status === 0) { console.log('  ❌ 请求失败：' + res.error + '\n'); return; }
  console.log('  HTTP ' + res.status);
  console.log('  ' + (res.json ? JSON.stringify(res.json, null, 2) : res.text));
  console.log('');
}

/* ══════════════════════════════════════════════════════════
 * 4. 人类验证指引
 * ══════════════════════════════════════════════════════════ */
function claim() {
  const rec = loadKey();
  if (!rec) { console.log('\n  尚未注册。\n'); return; }
  console.log('\n  ┌─ Moltbook 人类验证 ──────────────────────────────');
  console.log('  │ 1. 打开：' + (rec.claim_url || '(无)'));
  console.log('  │ 2. 用 X（Twitter）账号发一条推文：');
  console.log("  │    I'm claiming my AI agent '" + rec.agent_name + "' on @moltbook Verification: " + (rec.verification_code || '?'));
  console.log('  │ 3. 回到 claim 页面提交推文链接');
  console.log('  │ 4. 验证通过后执行：node tools/register_moltbook.mjs --status');
  console.log('  └──────────────────────────────────────────────────\n');
}

/* ══════════════════════════════════════════════════════════
 * 5. 发帖
 * ══════════════════════════════════════════════════════════ */
async function post(title, content) {
  const rec = loadKey();
  if (!rec?.api_key) { console.log('\n  尚未注册。\n'); return; }
  const res = await call('/posts', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + rec.api_key },
    body: JSON.stringify({ submolt: 'general', title, content }),
  });
  console.log('\n  HTTP ' + res.status);
  console.log('  ' + (res.json ? JSON.stringify(res.json, null, 2) : res.text) + '\n');
}

/* ── 入口 ── */
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
if (has('--check')) { await check(); }
else if (has('--register')) { await register(); }
else if (has('--status')) { await status(); }
else if (has('--claim')) { claim(); }
else if (has('--post')) {
  const i = args.indexOf('--post');
  await post(args[i + 1] || 'Hello Moltbook', args[i + 2] || '');
} else {
  console.log(`
  Mackorn Rot · Moltbook 注册工具
  ─────────────────────────────────────────────
    --check                测连通性（先跑这个）
    --register             注册智能体
    --claim                打印人类验证指引
    --status               查询验证状态
    --post "标题" "内容"     发帖（需已验证）

  身份来源：agent/MackornRot/shapes-character.json
  内容库：  agent/MackornRot/content-bank.md
  密钥文件：agent/MackornRot/.moltbook.json（勿提交）
`);
}
