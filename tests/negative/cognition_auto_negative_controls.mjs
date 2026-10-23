/**
 * cognition_auto 负控测试（R151）
 *
 * ★ 为什么必须有：
 *   「0 个候选」有两种可能：
 *     ① 系统真的自洽（好）
 *     ② 检查器太弱，什么都发现不了（坏，而且更危险 —— 会给人虚假安全感）
 *
 *   硬规矩：**不信任工具的自我报告**。必须造已知问题，看它能不能抓到。
 *
 * ★ 三个负控：
 *   NC1：在 AGENTS.md 里塞一个不存在的工具名 → 应报 promise
 *   NC2：在 README.md 里写一个错的工具数 → 应报 numbers
 *   NC3：把 dist 里的 AGENTS.md 删掉 → 应报 files
 *
 * 每个负控：备份 → 造问题 → 跑检查器 → 断言抓到 → 还原
 *
 * 用法：node tests/negative/cognition_auto_negative_controls.mjs
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const TMP = join(ROOT, '.negctl-tmp');

let pass = 0; let fail = 0;
function check(label, cond, detail = '') {
  if (cond) { pass += 1; console.log('  ✅ ' + label + (detail ? '  ' + detail : '')); }
  else { fail += 1; console.log('  ❌ ' + label + (detail ? '  ' + detail : '')); }
}

/** 跑检查器，返回候选数组
 *
 * ★ R152 修 EPERM：沙箱禁止【管道捕获子进程 stdout】（spawnSync ... EPERM）。
 *   必须用【文件交接】：检查器本来就会把结果写到 cognition-auto.json，
 *   所以这里只负责"跑一次" + "读那个文件"。
 *   这和老坑一样：pipe stdio → EPERM；用 stdio:'ignore' + 文件交接。 */
const REPORT = join(ROOT, 'distribution', '03_验证与基准', 'cognition-auto.json');
function runAuto() {
  try {
    execFileSync(process.execPath, [join(ROOT, 'tools', 'cognition_auto.mjs')], {
      cwd: ROOT, stdio: 'ignore', windowsHide: true, timeout: 180000,
    });
  } catch (e) {
    /* 非零退出也要读文件（检查器可能因为发现缺口而 exit 0/1） */
  }
  try {
    const j = JSON.parse(readFileSync(REPORT, 'utf8'));
    return j.candidates || [];
  } catch (e) {
    return null;
  }
}

mkdirSync(TMP, { recursive: true });

/* ── 基线：应该 0 候选 ── */
console.log('');
console.log('  ══ 基线 ══');
const base = runAuto();
check('基线可运行', base !== null, base === null ? '检查器执行失败' : base.length + ' 个候选');

/* ══════════════════════════════════════════════════════════════
 * NC1：AGENTS.md 塞不存在的工具名 → 应报 promise
 * ══════════════════════════════════════════════════════════════ */
console.log('');
console.log('  ══ NC1：AGENTS.md 塞不存在的工具名 ══');
{
  const f = join(ROOT, 'AGENTS.md');
  const bak = join(TMP, 'AGENTS.md.bak');
  copyFileSync(f, bak);
  try {
    const orig = readFileSync(f, 'utf8');
    writeFileSync(f, orig + '\n\n## 负控注入\n\n调用 `mackorn_totally_fake_tool` 即可。\n', 'utf8');
    const cands = runAuto();
    const hit = (cands || []).some((c) => c.kind === 'promise' && /mackorn_totally_fake_tool|没有工具|不存在的工具/i.test(c.title + c.evidence));
    check('NC1 抓到不存在的工具名', hit, hit ? '' : '未报 promise（检查器漏了）');
  } finally {
    copyFileSync(bak, f); unlinkSync(bak);
  }
}

/* ══════════════════════════════════════════════════════════════
 * NC2：README.md 写错的工具数 → 应报 numbers
 * ══════════════════════════════════════════════════════════════ */
console.log('');
console.log('  ══ NC2：README.md 写错的工具数 ══');
{
  const f = join(ROOT, 'README.md');
  const bak = join(TMP, 'README.md.bak');
  copyFileSync(f, bak);
  try {
    const orig = readFileSync(f, 'utf8');
    /* 插入一个明显错的工具数（真值 29） */
    writeFileSync(f, orig + '\n\n<!-- 负控 -->\n本项目共 47 tools。\n', 'utf8');
    const cands = runAuto();
    const hit = (cands || []).some((c) => c.kind === 'numbers' && /工具数|47/.test(c.title + c.evidence));
    check('NC2 抓到错误的工具数', hit, hit ? '' : '未报 numbers（检查器漏了）');
  } finally {
    copyFileSync(bak, f); unlinkSync(bak);
  }
}

/* ══════════════════════════════════════════════════════════════
 * NC3：删掉 dist 里的 AGENTS.md → 应报 files
 * ══════════════════════════════════════════════════════════════ */
console.log('');
console.log('  ══ NC3：删掉 dist 里的 AGENTS.md ══');
{
  const f = join(ROOT, 'dist', 'mackorn-cone-crusher', 'AGENTS.md');
  const bak = join(TMP, 'dist-AGENTS.md.bak');
  if (!existsSync(f)) {
    check('NC3 前置：dist/AGENTS.md 存在', false, '文件不存在，无法做负控');
  } else {
    copyFileSync(f, bak);
    try {
      unlinkSync(f);
      const cands = runAuto();
      const hit = (cands || []).some((c) => c.kind === 'files' && /AGENTS\.md|不在 dist|写了但发不出去/i.test(c.title + c.evidence));
      check('NC3 抓到 dist 缺文件', hit, hit ? '' : '未报 files（检查器漏了）');
    } finally {
      copyFileSync(bak, f); unlinkSync(bak);
    }
  }
}

/* ══════════════════════════════════════════════════════════════
 * 收尾：还原后应回到基线
 * ══════════════════════════════════════════════════════════════ */
console.log('');
console.log('  ══ 收尾：还原后应回到基线 ══');
const after = runAuto();
check('还原后候选数回到基线', after !== null && (after.length === (base || []).length),
  '还原后 ' + (after ? after.length : '?') + ' 个 vs 基线 ' + (base ? base.length : '?') + ' 个');

/* 清理临时目录 */
try {
  const { rmSync } = await import('node:fs');
  rmSync(TMP, { recursive: true, force: true });
} catch { }

console.log('');
console.log('  ══════════════════════════════════════════════════════════');
console.log('  结果：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('  ══════════════════════════════════════════════════════════');
console.log('');
process.exit(fail > 0 ? 1 : 0);
