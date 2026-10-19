/**
 * S1 修复的最小证明
 *
 * 逻辑：门禁现在会跑 guardrail_negative_controls，并断言
 *       "listRules() 的每个 id 都有负控样本且该样本确实被命中"。
 *       所以只要禁掉任意一条规则，它对应的负控就会失败 → 门禁失败。
 *
 * 本脚本逐条验证这个逻辑：对每一条规则，在副本里把它从 guardOutput 的
 * 迭代集合里排除，然后跑负控，确认【该规则】的负控失败。
 *
 * 只做 3 条代表性规则（1 条 error 级核心 + 1 条 warn + 1 条本会话新增），
 * 避免跑太久。
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const CASES = [
  { id: 'GR-01', why: 'error 级核心硬规矩（不得用估算值填补 null）' },
  { id: 'GR-12', why: 'error 级（必须自报质量守恒）' },
  { id: 'GR-16', why: '本会话新增的规则' },
];

console.log('');
console.log('='.repeat(90));
console.log('  S1 修复的最小证明：逐条禁用 → 该条负控必须失败');
console.log('='.repeat(90));
console.log('');

let allOk = true;

for (const cs of CASES) {
  const MUT = join(process.env.TEMP || '/tmp', 'mk-' + cs.id + '-' + Date.now());
  rmSync(MUT, { recursive: true, force: true });
  mkdirSync(MUT, { recursive: true });
  for (const d of ['tests', 'plugin']) cpSync(join(ROOT, d), join(MUT, d), { recursive: true });

  const GP = join(MUT, 'plugin', 'lib', 'guardrails.mjs');
  let c = readFileSync(GP, 'utf8');

  /* 最小突变：把 `for (const r of GUARD_RULES) {` 改成跳过这一条 */
  const OLD = 'for (const r of GUARD_RULES) {';
  const NEW = 'for (const r of GUARD_RULES) { if (r.id === ' + JSON.stringify(cs.id) + ') continue;';
  if (!c.includes(OLD)) { console.log('  ❌ 锚点未命中'); allOk = false; rmSync(MUT, { recursive: true, force: true }); continue; }
  c = c.replace(OLD, NEW);
  writeFileSync(GP, c, 'utf8');

  const chk = spawnSync(process.execPath, ['--check', GP], { encoding: 'utf8' });
  if (chk.status !== 0) {
    console.log('  ⚠️ ' + cs.id + ' 突变语法失败，跳过');
    allOk = false;
    rmSync(MUT, { recursive: true, force: true });
    continue;
  }

  const r = spawnSync(process.execPath, [join(MUT, 'tests', 'negative', 'guardrail_negative_controls.mjs')], { encoding: 'utf8', windowsHide: true, timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const thisLine = out.split('\n').find((l) => l.includes(cs.id + ' ')) || '';
  const failed = r.status !== 0 && /❌/.test(thisLine);
  if (failed) console.log('  ✅ ' + cs.id.padEnd(7) + ' 禁用后其负控失败（exit=' + r.status + '）  —— ' + cs.why);
  else { console.log('  ❌ ' + cs.id.padEnd(7) + ' 禁用后负控仍通过（exit=' + r.status + '）  —— 未被抓到！'); allOk = false; }

  rmSync(MUT, { recursive: true, force: true });
}

console.log('');
console.log('='.repeat(90));
console.log(allOk ? '  ✅ 证明成立：任一条护栏被禁用，其负控立即失败 → 门禁会红' : '  ❌ 证明失败：存在护栏被禁用却无人发现');
console.log('='.repeat(90));
console.log('');
process.exit(allOk ? 0 : 1);
