/**
 * 硬事实同步的负控测试（R76）
 *
 * 为什么需要：R75 实测发现 —— 尽管 `sync_tool_count_facts.mjs` 有"META 行级跳过"规则，
 *   而且事后再测 `META.test(那一行)` 返回 true，
 *   **那一行仍然被改掉了**。我查不到是哪条路径改的。
 *
 * 按本项目的纪律：**查不到原因时，用负控把它钉死** ——
 *   植入"应该被跳过"的行，跑一次，断言它没变。
 *   如果负控通过，说明当前版本安全；如果失败，说明规则确实失效。
 *
 * 这是本会话第 N 次"检测器/工具自身出错"——所以规则必须有负控，不能靠读代码相信它。
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/* ⚠️ 本文件在 tests/negative/ 下 —— ROOT 要往上【两层】才到项目根。
 *   R76 实测：写成 '..' 会得到 tests/，于是临时目录落错位置、
 *   同步工具也找不到（"找不到同步工具"）—— 又是一个"路径少一层"的坑。 */
const ROOT = resolve(HERE, '..', '..');
const TMPDIR = join(ROOT, '.negctl-hardfacts');
const TMP = join(TMPDIR, 'evidence-sample.md');

/* 样本：全部都是【记录/证据】式，绝不该被改 */
const SAMPLE = [
  '# 负控样本（绝不该被 sync_tool_count_facts 改写）',
  '',
  'v0.2.0                     → 描述写 "22 tools"',
  'v0.0.7 / v0.0.8 / v0.0.9  → 描述写 "19 tools"',
  '实测 GitHub 描述仍写 "19 tools"（实际 22）',
  'evidence_detail: 检索到的描述为 "10 languages" —— 【已过时，线上实为 12】',
  "['19 tools', '22 tools'],",
  'origin: R26 排查时发现 4 个版本（v0.0.7/8/9 描述写 19 tools）',
  '陈旧内容待更新：19 个工具 → 22 个工具',
  '',
].join('\n');

/* 反例：这些是【陈述】式，应该被改 */
const SHOULD_CHANGE = [
  '本插件提供 19 tools，覆盖 NH/NS 系列。',
  '支持 10 languages，含中文与英文。',
];

mkdirSync(TMPDIR, { recursive: true });
writeFileSync(TMP, SAMPLE + '\n' + SHOULD_CHANGE.join('\n') + '\n', 'utf8');

const before = readFileSync(TMP, 'utf8');

let exitCode = 0;
const SYNC = join(ROOT, 'tools', 'sync_tool_count_facts.mjs');
if (!existsSync(SYNC)) {
  console.log('\n  ❌ 找不到同步工具：' + SYNC + '\n');
  process.exit(2);
}
let ran = false;
let runErr = null;
try {
  execFileSync(process.execPath, [SYNC, '--write'], {
    cwd: ROOT, stdio: 'ignore', windowsHide: true, timeout: 300000,
  });
  ran = true;
} catch (e) {
  /* ⚠️ 血泪教训（R76 实测）：这里原本是空的 catch {}，
   *   而路径写错（指到 tests/negative/ 下了）→ 工具根本没跑 → 什么都没改 →
   *   "证据行全部保留"变成【假通过】。
   *   一个因为"什么都没发生"而通过的测试，不是测试。
   *   现在：区分"同步工具返回非零"（可接受）与"根本没跑起来"（必须失败）。 */
  const st = e && e.status;
  if (st === 0 || st === 1 || st === null || st === undefined) { ran = true; runErr = '退出码 ' + st; }
  else { ran = false; runErr = String((e && e.message) || e).slice(0, 120); }
}
if (!ran) {
  console.log('\n  ❌ 同步工具未能运行：' + runErr);
  console.log('     测试无法证明任何事 —— 判失败（不许"因为什么都没发生"而通过）\n');
  try { unlinkSync(TMP); } catch { }
  process.exit(2);
}

const after = existsSync(TMP) ? readFileSync(TMP, 'utf8') : '';
const afterLines = after.split('\n');

const fails = [];
const passes = [];

/* ① 证据行必须原样保留 */
for (const l of SAMPLE.split('\n')) {
  if (!l.trim()) continue;
  const has = afterLines.some((x) => x === l);
  if (has) passes.push('保留证据行：' + l.slice(0, 46));
  else fails.push('❌ 证据行被改写/丢失：' + l.slice(0, 60));
}

/* ② 陈述式必须被改 */
for (const l of SHOULD_CHANGE) {
  const stillThere = afterLines.some((x) => x === l);
  if (stillThere) fails.push('❌ 陈述式未被改：' + l.slice(0, 50));
  else passes.push('已改陈述式：' + l.slice(0, 40));
}

/* 清理 */
try { unlinkSync(TMP); } catch { }
try { execFileSync(process.execPath, ['-e', 'require("fs").rmdirSync(process.argv[1])', TMPDIR], { stdio: 'ignore', windowsHide: true }); } catch { }

console.log('');
console.log('  ══ 硬事实同步 · 负控测试 ══');
console.log('');
console.log('  ✅ 通过 ' + passes.length + ' 项');
for (const p of passes) console.log('     · ' + p);
if (fails.length) {
  console.log('');
  console.log('  ❌ 失败 ' + fails.length + ' 项 —— 同步工具的"保护证据"规则失效：');
  for (const f of fails) console.log('     · ' + f);
  exitCode = 1;
} else {
  console.log('');
  console.log('  ✅ 负控全部通过：证据行原样保留，陈述式被正确改写。');
}
console.log('');
process.exit(exitCode);
