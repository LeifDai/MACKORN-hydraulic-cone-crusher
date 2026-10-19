/**
 * GitHub OAuth Device Flow 授权器（R104）
 *
 * 为什么需要这个工具：
 *   本机没有 git、没有 gh、没有任何 GitHub 凭据 —— 所以推不上去。
 *   但 GitHub 提供【Device Flow】授权：不需要预装工具、不需要手动建 token，
 *   用户只要在浏览器里输入一个 8 位代码并点"授权"，程序就能拿到 token。
 *   这正是 `gh auth login` 用的机制。
 *
 * 用法：
 *   node tools/github_device_auth.mjs              # 走授权，成功后存到 .gh-token（已 gitignore）
 *   node tools/github_device_auth.mjs --then-push  # 授权成功后立刻推代码 + 回 PR
 *
 * 安全：
 *   · token 只写到 .gh-token（已加 .gitignore），不打印完整值
 *   · 用完可删：node tools/github_device_auth.mjs --revoke
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TOKEN_FILE = join(ROOT, '.gh-token');

/* GitHub CLI 的公开 OAuth App client_id（公开信息，非机密） */
const CLIENT_ID = '178c6fc778ccc68e1d6a';
/* R105：加 workflow scope —— 推 .github/workflows/ 必需，public_repo 不够 */
const SCOPE = 'public_repo workflow read:user';

const argv = process.argv.slice(2);
const THEN_PUSH = argv.includes('--then-push');

/* ── revoke 模式 ── */
if (argv.includes('--revoke')) {
  if (existsSync(TOKEN_FILE)) { unlinkSync(TOKEN_FILE); console.log('  ✅ 已删除 .gh-token（本地凭据已清除）'); }
  else console.log('  ○ 没有 .gh-token');
  process.exit(0);
}

/* 已有 token？ */
if (existsSync(TOKEN_FILE)) {
  const t = readFileSync(TOKEN_FILE, 'utf8').trim();
  if (t) {
    console.log('');
    console.log('  ✅ 已存在 .gh-token（长度 ' + t.length + '，前缀 ' + t.slice(0, 4) + '...）');
    console.log('     直接用：node tools/finish_all.mjs --write --token ' + t.slice(0, 4) + '...');
    console.log('     或：   node tools/github_device_auth.mjs --then-push');
    console.log('');
    if (!THEN_PUSH) process.exit(0);
    /* 有 token 且要推 → 直接推 */
    pushWithToken(t);
    process.exit(0);
  }
}

/* ══════ ① 请求设备码 ══════ */
console.log('');
console.log('  ══ GitHub 设备授权（无需 git / 无需手动建 token）══');
console.log('');
console.log('  正在向 GitHub 申请授权码…');

let device;
try {
  const r = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE }),
    signal: AbortSignal.timeout(20000),
  });
  device = await r.json();
} catch (e) {
  console.error('  ❌ 无法连接 GitHub：' + String(e.message).slice(0, 80));
  process.exit(1);
}

if (!device.device_code || !device.user_code) {
  console.error('  ❌ 申请失败：' + JSON.stringify(device).slice(0, 300));
  process.exit(1);
}

/* ══════ ② 告诉用户做什么 ══════ */
const bar = '═'.repeat(62);
console.log('');
console.log('  ' + bar);
console.log('');
console.log('   请打开这个网址：' + device.verification_uri);
console.log('');
console.log('   输入代码：      ' + device.user_code);
console.log('');
console.log('   然后点「Authorize」/「授权」。');
console.log('');
console.log('  ' + bar);
console.log('');
console.log('  我等你在浏览器里完成（最多 ' + Math.round(device.expires_in / 60) + ' 分钟）…');
console.log('  （我已开始自动轮询，你完成授权后我会立刻知道）');
console.log('');

/* ══════ ③ 轮询 ══════ */
const interval = Math.max(5, Number(device.interval) || 5) * 1000;
const deadline = Date.now() + (Number(device.expires_in) || 900) * 1000;
let slow = 0;

async function poll() {
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval + slow * 3000));
    let j;
    try {
      const r = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          device_code: device.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
        signal: AbortSignal.timeout(20000),
      });
      j = await r.json();
    } catch (e) {
      continue;
    }

    if (j.access_token) {
      const token = j.access_token;
      writeFileSync(TOKEN_FILE, token, 'utf8');
      console.log('');
      console.log('  ✅ 授权成功！token 已保存到 .gh-token（已 gitignore，不会进仓库）');
      console.log('');

      /* 验证身份 */
      try {
        const ur = await fetch('https://api.github.com/user', {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'mackorn' },
          signal: AbortSignal.timeout(15000),
        });
        if (ur.ok) { const u = await ur.json(); console.log('     身份：' + u.login); }
      } catch { }

      if (THEN_PUSH) {
        pushWithToken(token, () => {
          console.log('  💡 用完后建议：node tools/github_device_auth.mjs --revoke');
        });
      } else {
        console.log('  下一步：');
        console.log('    node tools/finish_all.mjs --write --token "$(cat .gh-token)"');
        console.log('    或  node tools/github_device_auth.mjs --then-push');
        console.log('');
      }
      return;
    }

    if (j.error === 'authorization_pending') continue;
    if (j.error === 'slow_down') { slow += 1; continue; }
    if (j.error === 'expired_token') { console.error('  ❌ 授权码已过期，请重跑本脚本'); process.exit(1); }
    if (j.error === 'access_denied') { console.error('  ❌ 你拒绝了授权'); process.exit(1); }
    /* 其他错误 */
    console.error('  ❌ ' + (j.error || '未知错误') + (j.error_description ? '：' + j.error_description : ''));
    process.exit(1);
  }
  console.error('  ❌ 等待超时。请重跑本脚本。');
  process.exit(1);
}

function pushWithToken(token, after) {
  console.log('');
  console.log('  ══ 开始推送 ══');
  console.log('');
  try {
    execFileSync(process.execPath, [join(ROOT, 'tools', 'finish_all.mjs'), '--write', '--token', token], {
      cwd: ROOT, stdio: 'inherit', windowsHide: true, timeout: 1800000,
    });
  } catch (e) {
    console.log('  ⚠️ finish_all 返回非 0（可能部分文件失败，见上方输出）');
  }
  if (after) after();
}

await poll();
