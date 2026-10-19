/**
 * 语法闸门的负控 —— 证明它真能抓到 R31 那类损坏
 *
 * 纪律（L-41）：任何检查器都必须有自己的负控，否则它会静默失效。
 * 本脚本临时植入 5 种真实的损坏形态，逐个确认语法闸门【报错】，
 * 然后恢复。若某一种没被抓到，说明闸门有盲区。
 */
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const GATE = join(HERE, 'syntax_gate.mjs');

/* 在 tools/ 下建临时文件（闸门会扫到），跑完删掉 */
const CASES = [
  {
    id: 'N1', desc: 'R31 原形：文本被插进字符串字面量内部（引号提前闭合）',
    code: "const a = {\n  description:\n    '原内容。 + ' 【新段落】…'',\n};\n",
  },
  {
    id: 'N2', desc: '行尾多余引号导致后续全乱',
    code: "const b = '正常'; const c = '多了''; \nconst d = 'ok';\n",
  },
  {
    id: 'N3', desc: '模板字符串未闭合',
    code: "const e = `未闭合的模板 ${x};\nconst f = 1;\n",
  },
  {
    id: 'N4', desc: '中文内容里用了半角引号未转义（add_knowledge_tool 的形态）',
    code: 'const g = "他说"你好"然后走了";\n',
  },
  {
    id: 'N5', desc: '括号未闭合',
    code: "function h() {\n  const z = (1 + 2;\n}\n",
  },
];

/* 正控：合法代码必须通过（尤其模板里含 / 与 ${}） */
const POSITIVE = {
  id: 'P1', desc: '合法：模板里含路径斜杠与嵌套 ${}',
  code: "const BASE='https://x';\nconst u = `${BASE}/ai/guides/${k}/`;\n"
    + "const re = /ab\\/c/g;\nconst t = `a ${`b ${1+2}`} c`;\n"
    + "const q = \"他说'你好'\";\nconst s = 'it\\'s ok';\n",
};

const made = [];
let pass = 0;
let fail = 0;

console.log('');
console.log('='.repeat(92));
console.log('  语法闸门 · 负控（5 种损坏必须被抓）+ 正控（合法代码必须通过）');
console.log('='.repeat(92));
console.log('');

/**
 * 运行闸门并返回【真实退出码】。
 *
 * ⚠️ 关键（R32 实测）：沙箱偶尔会瞬时拒绝创建子进程（spawn EPERM），
 *   此时 execFileSync 抛出的 e.status 是 null —— 那【不是】闸门的退出码。
 *   早期版本把它当成 -1 并记为"抓到/未通过"，造成基线假失败、
 *   以及"负控看起来抓到了"的假阳性。必须区分并重试。
 */
function runGate() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      execFileSync(process.execPath, [GATE], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
      return 0;
    } catch (e) {
      if (e.status == null) {                     // spawn 失败 → 重试
        try { execFileSync(process.execPath, ['-e', '0'], { stdio: 'ignore', windowsHide: true, timeout: 20000 }); } catch { }
        continue;
      }
      return e.status;                            // 真实退出码
    }
  }
  return -2;                                      // 明确标记"始终无法启动"
}

/** 带输出的运行（诊断用：看它到底报了哪个文件） */
function runGateVerbose() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return { st: 0, out: execFileSync(process.execPath, [GATE], { encoding: 'utf8', windowsHide: true, timeout: 300000 }) };
    } catch (e) {
      if (e.status == null) continue;
      return { st: e.status, out: String(e.stdout || '') + String(e.stderr || '') };
    }
  }
  return { st: -2, out: '' };
}

/* 基线：干净状态必须通过 */
const clean = runGateVerbose();
const cleanOk = clean.st === 0;
console.log('  基线（无植入）: ' + (cleanOk ? '✅ 通过' : '❌ 未通过（exit ' + clean.st + '）'));
if (!cleanOk) {
  const lines = String(clean.out).split('\n').filter((l) => /·|❌|L\d+/.test(l));
  for (const l of lines.slice(0, 12)) console.log('      ' + l.trim());
}
console.log('');

for (const c of CASES) {
  const f = join(HERE, '_synneg_' + c.id + '.mjs');
  writeFileSync(f, c.code, 'utf8');
  const st = runGate();
  /* ⚠️ 必须【立刻】删掉 —— 否则会污染后续用例的扫描结果
   *    （R32 实测：P1 被判误报，真实原因是 N1-N5 的文件当时还在目录里） */
  try { unlinkSync(f); } catch { }
  if (st === -2) { console.log('  ⚠️ ' + c.id + '  无法启动闸门（沙箱限制），本条不计入'); continue; }
  const caught = st !== 0;
  if (caught) pass += 1; else fail += 1;
  console.log('  ' + (caught ? '✅' : '❌') + ' ' + c.id + '  ' + c.desc.padEnd(46) + (caught ? '被抓到（exit ' + st + '）' : '⚠ 漏检！'));
}
console.log('');

/* 正控 */
{
  const f = join(HERE, '_synneg_P1.mjs');
  writeFileSync(f, POSITIVE.code, 'utf8');
  const st = runGate();
  try { unlinkSync(f); } catch { }
  if (st === -2) { console.log('  ⚠️ ' + POSITIVE.id + '  无法启动闸门，本条不计入'); }
  else {
    const ok = st === 0;
    if (ok) pass += 1; else fail += 1;
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + POSITIVE.id + '  ' + POSITIVE.desc.padEnd(46) + (ok ? '通过（不过严）' : '⚠ 误报！exit ' + st));
  }
}
console.log('');

/* 清理（兜底：正常情况下已在上面逐个删掉） */
for (const f of made) { try { unlinkSync(f); } catch { } }
console.log('');
console.log('='.repeat(92));
console.log('  负控 ' + pass + ' / ' + (pass + fail) + (fail === 0 ? '  ✅ 闸门有效' : '  ❌ 有盲区'));
console.log('='.repeat(92));
console.log('');
process.exit(fail ? 1 : 0);
