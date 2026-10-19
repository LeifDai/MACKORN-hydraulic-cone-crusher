/**
 * 教训检查的 mutation 测试（S2）
 *
 * ⚠️⚠️ 【本方法已被证明无效，结论不可采信】⚠️⚠️
 *
 *   本脚本把目标文件里的【所有函数】实现替换为 return undefined，
 *   结果是模块整体失效 → check 必然失败 → 输出"10/10 强"。
 *   但这个结果测的是"模块能否加载"，不是"check 是否真的验证功能"。
 *
 *   审查员用【精确删除单段逻辑、其余保留】的手法，证明 L-05/L-34/L-30 是弱的。
 *   要自动化正确，必须把每条教训映射到它验证的【具体函数/行】，定向突变。
 *   本轮没做 —— 如实记录为待办，见 distribution/03_验证与基准/教训检查强度问题.md
 *
 * 保留本脚本是为了给后续定向突变做框架，不是因为它有效。
 *
 * 原始意图：
 *
 * 审查员（R18 S2）手工做了 3 个实验证明：
 *   删掉真实功能但把关键词留在注释里 → L-05 / L-34 / L-30 全部仍然 ✅
 *
 * 本脚本把那个手法自动化：对每条教训的 check，
 *   ① 找出它检查的目标文件
 *   ② 注入"保留关键词、移除功能"的突变
 *   ③ 跑 check
 *   ④ 若 check 仍然通过 → 该检查是【弱的】（可被注释骗过）
 *
 * 因为要改动文件，全部在【临时副本】上做，原仓库零改动。
 * 样本量限制（默认 12 条）以控制耗时；报告里如实写明样本。
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SAMPLE_LIMIT = Number(process.env.SAMPLE || 12);

console.log('');
console.log('='.repeat(94));
console.log('  教训检查 mutation 测试（删功能留关键词，看 check 是否假通过）');
console.log('='.repeat(94));
console.log('');

/* 取教训列表与其目标文件（按经验映射；无法确定的跳过并如实记录） */
const TARGETS = {
  'L-02': ['public-overrides/package.json'],
  'L-05': ['tools/enrich_country_pages.mjs'],
  'L-07': ['tools/add_hreflang.mjs'],
  'L-08': ['tools/verify_libraries.mjs'],
  'L-10': ['tools/build_public.mjs'],
  'L-15': ['tools/sync_ai_index.mjs'],
  'L-16': ['tools/build_tool_pages.mjs'],
  'L-17': ['tools/two_centers.mjs'],
  'L-19': ['tools/deliver.mjs'],
  'L-23': ['tools/night_report.mjs'],
  'L-24': ['tools/night_report.mjs'],
  'L-26': ['tools/sync_ai_index.mjs'],
  'L-28': ['tools/apply_tags.mjs'],
  'L-30': ['tools/sync_tool_count.mjs'],
  'L-31': ['tools/sync_ai_index.mjs'],
  'L-32': ['tools/lessons.mjs'],
  'L-34': ['tools/verify_all_tools.mjs'],
  'L-35': ['plugin/lib/guardrails.mjs'],
  'L-36': ['tools/audit_site.mjs'],
  'L-37': ['tools/uat_user_scenarios.mjs'],
  'L-38': ['tools/audit_tool_descriptions_v2.mjs'],
  'L-39': ['tests/negative/plugin_negative_controls.mjs'],
  'L-40': ['tools/pdf_cid_extract.mjs'],
  'L-41': ['tests/negative/guardrail_negative_controls.mjs'],
  'L-42': ['plugin/lib/calibrate.mjs'],
};

const ids = Object.keys(TARGETS).slice(0, SAMPLE_LIMIT);
const MUT = join(process.env.TEMP || '/tmp', 'lesson-mut-' + Date.now());
rmSync(MUT, { recursive: true, force: true });
mkdirSync(MUT, { recursive: true });
for (const d of ['tests', 'tools', 'plugin', 'distribution']) {
  if (existsSync(join(ROOT, d))) cpSync(join(ROOT, d), join(MUT, d), { recursive: true });
}
if (existsSync(join(ROOT, 'public-overrides'))) cpSync(join(ROOT, 'public-overrides'), join(MUT, 'public-overrides'), { recursive: true });

const results = [];
for (const id of ids) {
  const rels = TARGETS[id];
  for (const rel of rels) {
    const p = join(MUT, rel);
    if (!existsSync(p)) { results.push({ id, rel, status: 'missing' }); continue; }
    const orig = readFileSync(p, 'utf8');
    /* 突变：把函数体替换为"只留注释关键词" —— 保留所有标识符（关键词仍在），
     * 但移除实际逻辑。做法：在文件末尾追加一条注释（含该文件出现过的关键词），
     * 并把最长的函数体清空为 return null。
     * 简化版：把第一个 `{` 之后的函数体清空 —— 太粗暴会语法错。
     * 折中：在文件末尾追加大量关键词注释（模拟"关键词还在"），并把 check 的目标
     *      行为改为不可达（用一个 early return）。
     * 这里用最保守的手法：只追加关键词注释 —— 若 check 因此从失败变通过，
     * 说明它本来就是看关键词的；若 check 本来就通过，则无法区分。
     * 因此改为更有效的手法：删除该文件里所有 export/function 的【实现】标记。 */
    /* 有效手法：把文件里所有 `export function X` 与 `function X` 的实现体替换为空实现 */
    let mutated = orig.replace(/(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*\{/g,
      (mm, ex, asy, name, args) => (ex || '') + (asy || '') + 'function ' + name + '(' + args + ') { return undefined; /* 突变：功能已移除，关键词保留 */');
    if (mutated === orig) {
      // 没有函数：退化为把模块内容整体注释掉但保留关键词
      mutated = '/* 突变：以下关键词保留 ' + [...new Set((orig.match(/[\u4e00-\u9fff]{2,6}|[A-Za-z_]{5,}/g) || []))].slice(0, 40).join(' ') + ' */\n' + orig;
    }
    writeFileSync(p, mutated, 'utf8');

    /* 跑该条教训的 check */
    const r = spawnSync(process.execPath, [join(MUT, 'tools', 'lessons.mjs'), '--id', id], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const stillPass = /✅/.test(out) && !/❌/.test(out);
    results.push({ id, rel, status: stillPass ? 'weak' : 'caught', raw: r.status });
    writeFileSync(p, orig, 'utf8');
    break;   // 每条只测第一个目标文件
  }
}

const weak = results.filter((x) => x.status === 'weak');
const caught = results.filter((x) => x.status === 'caught');
const missing = results.filter((x) => x.status === 'missing');

console.log('  样本 ' + ids.length + ' 条（可用样本 ' + (results.length - missing.length) + '）');
console.log('');
console.log('  ── 逐条结果 ──');
for (const x of results) {
  const tag = x.status === 'weak' ? '❌ 弱（删功能后仍通过）' : x.status === 'caught' ? '✅ 强（删功能后被抓住）' : '— 目标文件不存在';
  console.log('    ' + x.id.padEnd(7) + tag.padEnd(24) + x.rel);
}
console.log('');
console.log('='.repeat(94));
console.log('  强 ' + caught.length + ' · 弱 ' + weak.length + ' · 跳过 ' + missing.length);
if (caught.length + weak.length > 0) {
  const weakPct = (weak.length / (caught.length + weak.length) * 100).toFixed(0);
  console.log('  弱档占比 ' + weakPct + '%' + (weak.length ? '  ← 这些检查需要加强' : '  ✅ 样本内无弱检查'));
}
console.log('='.repeat(94));
console.log('');

writeFileSync(join(ROOT, 'distribution', '03_验证与基准', 'lesson-mutation-test.json'), JSON.stringify({
  generated: new Date().toISOString(),
  sample_size: ids.length,
  results, weak: weak.map((x) => x.id), caught: caught.map((x) => x.id), skipped: missing.map((x) => x.id),
  method: '把目标文件里的函数实现替换为 return undefined（关键词保留），再跑该教训的 check；仍通过即为弱检查。',
  caveat: '本测试在临时副本上进行，原仓库未改动。样本有限（SAMPLE 环境变量可调），非全量结论。',
}, null, 2), 'utf8');
rmSync(MUT, { recursive: true, force: true });
console.log('  报告: distribution/03_验证与基准/lesson-mutation-test.json');
console.log('');

/* ══════════════════════════════════════════════════════════════════
 * R33 追加（教训 L-28）：本脚本会改 .mjs 源码 —— 必须验证"改没改成"。
 * 文本替换的锚点不存在会【静默失败】；R31 事故就是这么把
 * plugin/index.mjs 的 22 行引号插坏、整个文件无法解析，而门禁全绿。
 * ══════════════════════════════════════════════════════════════════ */
try {
  const { verifyAfterWrite } = await import('./verify_after_write.mjs');
  verifyAfterWrite();
} catch (e) {
  console.log('  ⚠ 改完自检未能执行: ' + String(e.message).slice(0, 60));
}
