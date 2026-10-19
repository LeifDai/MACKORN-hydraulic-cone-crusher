/**
 * 云端工作流本地预演 v2
 *
 * v1 的缺陷（R33 实测发现）：没解析 `continue-on-error: true`，
 *   于是把"工作流明确允许失败"的步骤也报成失败 —— 这会让预演结论失真。
 *
 * v2：解析每个 step 的 continue-on-error，把允许失败的步骤单独归类。
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const WF = join(ROOT, '.github', 'workflows', 'nightly-self-iteration.yml');
if (!existsSync(WF)) { console.error('  ❌ 找不到工作流文件'); process.exit(1); }

const lines = readFileSync(WF, 'utf8').split('\n');

/* ── 解析 steps：name / run / continue-on-error ── */
const steps = [];
let cur = null;
for (let i = 0; i < lines.length; i += 1) {
  const l = lines[i];
  const nm = l.match(/^\s*-\s*name:\s*(.+)$/);
  if (nm) { if (cur) steps.push(cur); cur = { name: nm[1].trim(), run: null, tolerant: false }; continue; }
  if (!cur) continue;
  const runM = l.match(/^(\s*)run:\s*(.*)$/);
  if (runM) {
    if (runM[2].trim() === '|') {
      const indent = runM[1].length; const blk = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const ln = lines[j];
        if (!ln.trim()) { blk.push(''); continue; }
        if ((ln.match(/^\s*/)[0].length) <= indent) break;
        blk.push(ln.trim());
      }
      cur.run = blk.join(' ').trim();
    } else cur.run = runM[2].trim();
  }
  if (/continue-on-error:\s*true/.test(l)) cur.tolerant = true;
}
if (cur) steps.push(cur);

/* ⚠️ R81：必须跳过【"云端工作流本地预演"这一步自己】—— 否则无限递归。
 *   实测症状：预演时这一步执行的是 workflow_dryrun.mjs 本身 →
 *   它又去解析并执行全部步骤 → 又碰到自己 → 沙箱终于在 3 层嵌套时拒绝（exit null）。
 *   这类"工具把自己也当成待测对象"的坑，凡是"跑全流程"的工具都可能踩。 */
const SELF_STEP = /本地预演|workflow_dryrun/;
const selfSkip = steps.filter((s) => SELF_STEP.test(s.name) || SELF_STEP.test(String(s.run || '')));
const runnable = steps.filter((s) => !(SELF_STEP.test(s.name) || SELF_STEP.test(String(s.run || ''))));

console.log('\n' + '═'.repeat(100));
console.log('  云端工作流本地预演 v2（识别 continue-on-error · 跳过自递归步骤）');
console.log('═'.repeat(100) + '\n');
console.log('  解析到 ' + steps.length + ' 个步骤（跳过 ' + selfSkip.length + ' 个自递归步骤）\n');

const results = [];
let idx = 0;
for (const s of runnable) {
  idx += 1;
  if (!s.run) { console.log('  ○ ' + String(idx).padStart(2) + '  ' + s.name + '（无 run，跳过）'); results.push({ ...s, status: 'skipped' }); continue; }
  const cmd = s.run.split(' && ')[0].trim();
  const shellOnly = /\$\{\{/.test(s.run) || /^\s*(echo|mkdir|\{|\}|if |git |date |#)/.test(cmd) || s.run.includes('$(') || s.run.includes('>>');
  if (shellOnly) { console.log('  ○ ' + String(idx).padStart(2) + '  ' + s.name + '：跳过（shell 专用语法）'); results.push({ ...s, status: 'skipped' }); continue; }
  if (!/^node\s/.test(cmd)) { console.log('  ○ ' + String(idx).padStart(2) + '  ' + s.name + '：跳过（非 node 命令）'); results.push({ ...s, status: 'skipped' }); continue; }

  const t0 = Date.now();
  const r = spawnSync('node', [cmd.replace(/^node\s+/, '')], { cwd: ROOT, stdio: 'ignore', windowsHide: true, timeout: 600000 });
  const ms = Date.now() - t0;
  const ok = r.status === 0;
  const tolerated = !ok && s.tolerant;
  const tag = ok ? '✅' : (tolerated ? '🟡' : '❌');
  const label = ok ? 'exit 0' : (tolerated ? 'exit ' + r.status + '（工作流允许）' : 'exit ' + r.status);
  console.log('  ' + tag + ' ' + String(idx).padStart(2) + '  ' + label.padEnd(20) + (ms + 'ms').padStart(8) + '  ' + s.name);
  results.push({ ...s, status: r.status, ms, ok, tolerated });
}

const ran = results.filter((r) => typeof r.ok === 'boolean');
const okN = ran.filter((r) => r.ok).length;
const toleratedN = ran.filter((r) => r.tolerated).length;
const hard = ran.filter((r) => !r.ok && !r.tolerated);
const skipped = results.filter((r) => r.status === 'skipped');

console.log('\n' + '─'.repeat(100));
console.log('  可执行 ' + ran.length + ' 步：通过 ' + okN + ' · 工作流允许失败 ' + toleratedN + ' · 硬失败 ' + hard.length + ' · 跳过 ' + skipped.length);
if (hard.length) { console.log('\n  ❌ 硬失败（会让工作流标红）：'); hard.forEach((b) => console.log('     ' + b.name + '  → exit ' + b.status)); }
else console.log('  ✅ 工作流在本地预演下不会因硬失败标红');
if (toleratedN) {
  console.log('\n  🟡 被工作流允许的失败（不阻塞其他步骤，但仍会显示）：');
  ran.filter((r) => r.tolerated).forEach((r) => console.log('     ' + r.name + '  → exit ' + r.status + '（已知待办，见工作流注释）'));
}

writeFileSync(join(ROOT, 'distribution', '03_验证与基准', 'workflow-dryrun.json'), JSON.stringify({
  generated: new Date().toISOString(),
  workflow: '.github/workflows/nightly-self-iteration.yml',
  parsed_steps: steps.length,
  skipped_self_recursive: selfSkip.map((s) => s.name),
  executed: ran.length, passed: okN, tolerated_failures: toleratedN, hard_failures: hard.length,
  skipped: skipped.length,
  note: '本地预演：识别 continue-on-error，区分「工作流允许的失败」与「会让工作流标红的硬失败」。含 shell 专用语法的步骤跳过并标注。',
  results: results.map((r) => ({ name: r.name, cmd: r.run, status: r.status, ok: r.ok, tolerated: r.tolerant })),
}, null, 2), 'utf8');
console.log('\n  报告: distribution/03_验证与基准/workflow-dryrun.json\n');
process.exit(hard.length ? 1 : 0);
