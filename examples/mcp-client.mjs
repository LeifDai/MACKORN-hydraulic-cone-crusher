/**
 * MCP 调用示例 —— 像 AI 客户端那样调这个插件的 22 个工具
 *
 * 运行：
 *     node examples/mcp-client.mjs                     # 走本地 stdio
 *     node examples/mcp-client.mjs --http              # 走 HTTP 端点
 *
 * 这个示例演示三件事：
 *   ① 怎么列出工具（tools/list）
 *   ② 怎么调用工具（tools/call）并拿到结构化结果
 *   ③ 怎么读结果里的 assumptions / warnings —— 这个项目最重要的习惯
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const USE_HTTP = process.argv.includes('--http');
const HTTP_URL = process.env.MACKORN_MCP_URL || 'https://mackorn.cn/ai/api/mcp.php';

/* ── 一个极简 JSON-RPC 客户端（stdio 或 HTTP）── */
function makeClient() {
  if (USE_HTTP) {
    let id = 0;
    return {
      async call(method, params) {
        id += 1;
        const r = await fetch(HTTP_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      },
      close() { },
    };
  }
  /* stdio */
  let child;
  try {
    child = spawn(process.execPath, [join(ROOT, 'plugin', 'mcp-server.mjs')], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
  } catch (e) {
    /* ⚠️ 沙箱里 pipe 到子进程会被拒（EPERM）—— 这是环境限制，不是代码问题。
     *    如实说明并给出替代路径，而不是抛一串栈让人以为程序坏了。 */
    const err = new Error(String(e && e.code) === 'EPERM'
      ? 'stdio 子进程被当前环境拒绝（spawn EPERM）。\n'
      + '     这是沙箱/权限限制，不是代码问题。\n'
      + '     替代：① 在普通终端跑同一个命令  ② 加 --http 走远程端点'
      : String(e && e.message || e));
    err.fatal = true;
    throw err;
  }
  if (!child || !child.stdout) {
    const err = new Error('stdio 子进程未能建立（当前环境不支持）—— 请改用 --http');
    err.fatal = true;
    throw err;
  }
  let buf = '';
  const waiters = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg = null;
      try { msg = JSON.parse(line); } catch { continue; }
      const w = waiters.get(msg.id);
      if (w) { waiters.delete(msg.id); w(msg); }
    }
  });
  let id = 0;
  return {
    call(method, params) {
      id += 1;
      const myId = id;
      return new Promise((res, rej) => {
        waiters.set(myId, res);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
        setTimeout(() => { if (waiters.has(myId)) { waiters.delete(myId); rej(new Error('超时')); } }, 30000);
      });
    },
    close() { try { child.kill(); } catch { } },
  };
}

const line = (s) => console.log('\n' + '═'.repeat(78) + '\n  ' + s + '\n' + '═'.repeat(78));

let cli;
try {
  cli = makeClient();
} catch (e) {
  console.error('');
  console.error('  ❌ ' + String(e.message).split('\n').join('\n     '));
  process.exit(2);
}

try {
  /* ── ① 握手 ── */
  line('① initialize —— 握手');
  const init = await cli.call('initialize', {
    protocolVersion: '2024-11-05',
    clientInfo: { name: 'mackorn-example', version: '1.0.0' },
  });
  const si = init.result && init.result.serverInfo;
  console.log('  服务端：' + (si ? si.name + ' v' + si.version : JSON.stringify(init.result).slice(0, 120)));

  /* ── ② 列工具 ── */
  line('② tools/list —— 看有哪些工具');
  const list = await cli.call('tools/list', {});
  const tools = (list.result && list.result.tools) || [];
  console.log('  共 ' + tools.length + ' 个工具：\n');
  for (const t of tools) {
    console.log('    · ' + t.name);
    if (t.description) console.log('        ' + String(t.description).slice(0, 88).replace(/\n/g, ' '));
  }

  /* ── ③ 调一个工具 ── */
  line('③ tools/call —— 调 mackorn_capacity_check（复核一台 NH400 EC 腔 CSS 16mm）');
  const res = await cli.call('tools/call', {
    name: 'mackorn_capacity_check',
    arguments: { model: 'NH400', cavity: 'EC', css: 16 },
  });
  const content = (res.result && res.result.content) || [];
  const text = content.map((c) => c.text || '').join('\n');
  let data = null;
  try { data = JSON.parse(text); } catch { }

  if (data) {
    console.log('  ' + data.model + ' / ' + data.cavity + ' 腔 / CSS ' + data.css + ' mm');
    console.log('  产能：' + data.capacity_min_tph + ' – ' + data.capacity_rated_tph + ' t/h');
    console.log('  依据：' + data.basis);

    /* ⚠️ 这一步是这个项目最重要的习惯 */
    const a = data.assumptions || [];
    const w = data.warnings || [];
    console.log('\n  📌 assumptions（' + a.length + ' 条）—— 一定要读：');
    for (const x of a.slice(0, 3)) console.log('    · [' + (x.source || '?') + '] ' + (x.assumption || x.text || x));
    if (w.length) {
      console.log('\n  ⚠️ warnings（' + w.length + ' 条）：');
      for (const x of w.slice(0, 3)) console.log('    · ' + (typeof x === 'string' ? x : JSON.stringify(x)));
    }
  } else {
    console.log('  （原始返回）\n' + text.slice(0, 600));
  }

  /* ── ④ 哨兵值防护演示 ── */
  line('④ 同一工具 · 一个"参数表里有问题"的格子（C 腔 CSS 16mm）');
  const res2 = await cli.call('tools/call', {
    name: 'mackorn_capacity_check',
    arguments: { model: 'NH400', cavity: 'C', css: 16 },
  });
  const t2 = ((res2.result && res2.result.content) || []).map((c) => c.text || '').join('\n');
  let d2 = null;
  try { d2 = JSON.parse(t2); } catch { }
  if (d2) {
    console.log('  额定产能字段：' + d2.capacity_rated_tph + ' t/h（机型上限约 500）');
    const w = d2.warnings || [];
    if (w.length) {
      console.log('\n  ✅ 工具给出了告警，而不是静默输出：');
      for (const x of w) console.log('    · ' + (typeof x === 'string' ? x : JSON.stringify(x)));
    }
  }

  line('这个项目的三条硬规矩');
  console.log('  ① 未知 → null，绝不估算');
  console.log('  ② 每个结论带来源等级（S1 厂商 / S2 标准 / S3 文献 / S4 经验 / S5 手册）');
  console.log('  ③ 冲突数据并列保留，绝不取平均');
  console.log('');
  console.log('  MCP 服务名：cn.mackorn/mackorn-cone-crusher');
  console.log('  文档：https://mackorn.cn/ai/');
  console.log('');
} catch (e) {
  console.error('');
  console.error('  ❌ ' + String(e.message).split('\n').join('\n     '));
  if (!e.fatal && USE_HTTP) console.error('     HTTP 端点可能还是旧版本（部署上传后才生效）');
  process.exitCode = 1;
} finally {
  cli.close();
}
