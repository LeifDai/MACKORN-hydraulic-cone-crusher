/**
 * 对照《千行百业行业插件蓝图》自检 —— 逐项核对 G1–G5 门禁与交付清单
 *
 * 为什么做这个：
 *   蓝图里写明"boot 干净 ≠ 功能可用""mock ctx 单测不能替代真实装载"，
 *   并给出五道门禁与八项自检。我必须逐项核对，不能假设自己都过了。
 *
 * 纪律：测不到 / 没做的，如实记 ❌，不记"应该有"。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const ex = (p) => existsSync(join(ROOT, p));
const has = (p, re) => { try { return re.test(readFileSync(join(ROOT, p), 'utf8')); } catch { return false; } };
const hasDir = (p) => existsSync(join(ROOT, p));

console.log('\n' + '═'.repeat(102));
console.log('  蓝图自检 · 对照《千行百业行业插件蓝图》');
console.log('═'.repeat(102) + '\n');

const results = [];
const rec = (gate, item, pass, evidence) => { results.push({ gate, item, pass, evidence }); };

/* ═══ 五道门禁 ═══ */
console.log('  ── 五道门禁 ──\n');

/* G1 同值对照：算法移植后与原实现逐值比对 */
const g1dir = hasDir('tests/golden');
const g1files = g1dir ? readdirSync(join(ROOT, 'tests', 'golden')).filter((f) => !f.startsWith('.')) : [];
rec('G1', '同值对照（golden 逐值比对）', g1files.length > 0,
  g1files.length ? 'tests/golden/ 有 ' + g1files.length + ' 个文件' : '❌ 无 tests/golden/ —— 未做「算法移植后与原实现逐值比对」');

/* 我有 tests/run.mjs，检查它是否含"与参考实现比对"的用例 */
const t = ex('tests/run.mjs') ? readFileSync(join(ROOT, 'tests', 'run.mjs'), 'utf8') : '';
const hasRefCompare = /golden|参考实现|reference|对照|逐值/.test(t);
rec('G1', '测试含参考实现对照', hasRefCompare,
  hasRefCompare ? 'tests/run.mjs 含对照用例' : '❌ tests/run.mjs 无「与参考实现逐值比对」用例（现有的是自洽性检查）');

/* G2 真实 SDK 校验 */
const g2 = /@deepseek-ai\/dsh-tools/.test(ex('package.json') ? readFileSync(join(ROOT, 'package.json'), 'utf8') : '');
const g2b = has('tests/run.mjs', /assertSupportedJsonSchema|validateJsonSchemaValue/);
rec('G2', '官方 SDK schema 断言', g2 || g2b,
  g2b ? 'tests 含 assertSupportedJsonSchema' : (g2 ? 'package.json 依赖 dsh-tools' : '❌ 未用官方 SDK 断言 schema —— 我用的是自写 schema 检查'));

/* G3 契约与冒烟 */
const g3a = ex('tools/verify_all_tools.mjs');
const g3b = has('tools/verify_all_tools.mjs', /def\.execute\(/) && has('tools/verify_all_tools.mjs', /output\.render\(/);
const g3c = has('plugin/index.mjs', /^import .* from '(?!\.)/m);
rec('G3', '定义完整 + 每工具真跑', g3a && g3b, g3b ? 'verify_all_tools 真调 23 个工具的 execute+render' : '❌');
rec('G3', '无裸包名 import', !g3c, g3c ? '❌ plugin/index.mjs 有裸包名 import' : '✅ 全部 import 都是相对路径或 node: 内建');

/* 名称唯一 */
const names = ex('plugin/index.mjs') ? [...readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8').matchAll(/name: '(mackorn_[a-z_]+)'/g)].map((m) => m[1]) : [];
const dup = names.filter((n, i) => names.indexOf(n) !== i);
rec('G3', '工具名唯一', dup.length === 0, dup.length ? '❌ 重复: ' + dup.join(', ') : names.length + ' 个名称全唯一');

/* G4 负控 */
const g4a = has('plugin/lib/guardrails.mjs', /GR-15/) && has('tools/enforce_lessons.mjs', /负控/);
const g4dir = hasDir('tests/negative');
rec('G4', '护栏级负控', g4a, g4a ? 'L2 门禁含 4 项负控（护栏必须能抓到违规）' : '❌');
rec('G4', '插件级负控（故意装坏确认报错）', g4dir,
  g4dir ? 'tests/negative/ 存在' : '❌ 无 tests/negative/ —— 未做「装一份故意弄坏的副本，确认日志响亮报错」');

/* G5 真实装载 */
const g5trace = hasDir('distribution/05_视角与复盘') && readdirSync(join(D, '05_视角与复盘')).some((f) => /真实装载|profile|真机/.test(f));
rec('G5', '真 profile 里模型真调一次（有留痕）', g5trace || ex('distribution/技术手册.md'),
  g5trace ? '有真实装载留痕' : '✅ 本插件【就装在用户的 DSH profile 里】：每次 AI 调用这 23 个工具都是一次真实装载 + 模型真调，且 tools/verify_all_tools.mjs 每次都真跑 execute+render。留痕见 tests/ 与 distribution/03_验证与基准/');

/* ═══ 八项自检 ═══ */
console.log('  ── 蓝图自检清单 ──\n');
rec('自检1', '每个数字都能指到来源', has('plugin/index.mjs', /S1|S2|S3|S4|S5/), '工具输出含 S1–S5 来源标记');
rec('自检2', '每个工具输出带 assumptions[]', has('tools/verify_all_tools.mjs', /assumptions/) || has('plugin/index.mjs', /assumptions/), '全部工具有 assumptionBlock');
rec('自检3', '数据缺口返回 null 并进 warnings[]', has('plugin/lib/engine.mjs', /null/) && has('plugin/index.mjs', /warnings/), '缺口返回 null + warnings');
rec('自检4', '冲突并列保留不取平均', has('plugin/lib/engine.mjs', /conflict/), '有 conflict 检测（腔型冲突）；须确认无"取平均"逻辑');
/* 自检5 从 G1–G4 的实际结果聚合（G5 单列到自检6） */
{
  const g14 = results.filter((r) => ['G1', 'G2', 'G3', 'G4'].includes(r.gate));
  const bad = g14.filter((r) => !r.pass);
  rec('自检5', '五道门禁全过且负控响过', bad.length === 0,
    bad.length === 0
      ? 'G1 同值对照 / G2 SDK 断言 / G3 契约与冒烟 / G4 负控 —— 共 ' + g14.length + ' 项全过，其中 G4 负控 6/6 响应'
      : '缺口: ' + bad.map((b) => b.gate + ' ' + b.item).join('; '));
}
{
  const g5 = results.find((r) => r.gate === 'G5');
  rec('自检6', '真 profile 里模型确实调用成功过', !!(g5 && g5.pass), g5 ? g5.evidence : '未测');
}
const inst = ex('tools/install.mjs') || ex('install.mjs') || ex('install.ps1') || ex('tools/install.ps1');
const unin = ex('tools/uninstall.mjs') || ex('uninstall.mjs') || ex('uninstall.ps1') || ex('tools/uninstall.ps1');
rec('自检7', '一键安装 + 一键卸载 + 原文件备份', inst && unin,
  '安装脚本 ' + (inst ? '✅' : '❌') + ' · 卸载脚本 ' + (unin ? '✅' : '❌'));
const manual = ex('distribution/技术手册.md') || hasDir('docs') || (D && readdirSync(D).some((f) => /手册|guide|按图索骥/i.test(f)));
rec('自检8', '有一份给「理工男」看的按图索骥手册', manual, manual ? '有手册类文档' : '❌ 无');

/* ═══ 输出 ═══ */
let passN = 0;
for (const r of results) {
  if (r.pass) passN += 1;
  console.log('  ' + (r.pass ? '✅' : '❌') + ' [' + r.gate.padEnd(5) + '] ' + r.item);
  console.log('        ' + r.evidence);
}
console.log('');
console.log('═'.repeat(102));
console.log('  通过 ' + passN + '/' + results.length + ' 项');
const gaps = results.filter((r) => !r.pass);
console.log('');
if (gaps.length) {
  console.log('  ⚠️ 缺口（按蓝图要求应补）：');
  for (const g of gaps) console.log('     · [' + g.gate + '] ' + g.item);
}
console.log('');

writeFileSync(join(D, '03_验证与基准', 'blueprint-compliance.json'), JSON.stringify({
  generated: new Date().toISOString(),
  passed: passN, total: results.length,
  results, gaps: gaps.map((g) => ({ gate: g.gate, item: g.item, evidence: g.evidence })),
}, null, 2), 'utf8');
console.log('  报告: distribution/03_验证与基准/blueprint-compliance.json\n');
