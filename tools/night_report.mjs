/**
 * 夜间报告生成器
 *
 * 把散落在各处的证据汇总成一份人可读的报告：
 *   ① 自迭代历史（跑了几轮、有无回归）
 *   ② 库状态（经验/错误判定分布、本轮变化）
 *   ③ 门禁结果（L2 / 交付四关 / 合规）
 *   ④ 云端工作流预演结果
 *   ⑤ 待用户清单（需要账号/授权的，不绕过）
 *
 * 纪律：报告里的数字全部从实际文件读，不手写。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const OUTDIR = join(D, '05_视角与复盘');
mkdirSync(OUTDIR, { recursive: true });
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null }; };
const readJson = (p) => { try { return JSON.parse(read(p)); } catch { return null }; };

const now = new Date();
const L = [];
L.push('# 云端夜间报告');
L.push('');
L.push('生成时间：' + now.toISOString().slice(0, 19).replace('T', ' ') + '（UTC）');
L.push('生成者：MACKORN 插件自迭代系统（不依赖用户开机）');
L.push('');

/* ── ① 自迭代历史 ── */
L.push('## 一、自迭代循环');
L.push('');
const histPath = join(D, '03_验证与基准', 'self-iterate-history.jsonl');
const rows = read(histPath) ? read(histPath).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
if (rows.length) {
  const last = rows[rows.length - 1];
  L.push('累计 **' + rows.length + '** 轮 · 最新一轮：' + last.passed + '/' + last.total + (last.failed ? ' ❌ ' + last.failed + ' 项失败' : ' ✅ 全过') + '（' + last.elapsed_ms + ' ms）');
  L.push('');
  L.push('| 轮次 | 时间 | 教训 | 库 | 护栏 | 模型 | 基准 | 合计 | 经验库 | 错误库 |');
  L.push('|--:|:--|:--|:--|:--|:--|:--|:--|:--|:--|');
  for (const r of rows.slice(-10)) {
    const g = r.groups || {};
    const f = (k) => (g[k] ? g[k].pass + '/' + g[k].total : '—');
    L.push('| ' + r.round + ' | ' + String(r.at).slice(5, 16).replace('T', ' ') + ' | ' + f('教训') + ' | ' + f('库') + ' | ' + f('护栏') + ' | ' + f('模型') + ' | ' + f('基准') + ' | **' + r.passed + '/' + r.total + '** | ' + (r.libraries ? r.libraries.jy_positive + ' 正判' : '—') + ' | ' + (r.libraries ? r.libraries.cw_fixed + ' 已修复' : '—') + ' |');
  }
  const totalImp = rows.reduce((a, r) => a + (r.improvements || []).length, 0);
  const totalReg = rows.reduce((a, r) => a + (r.regressions || []).length, 0);
  L.push('');
  L.push('- 累计改善项：**' + totalImp + '**　累计回归项：**' + totalReg + '**');
  if (totalReg === 0) L.push('- ✅ 未检测到回归');
  else L.push('- ⚠️ 检测到回归 —— 需人工复核');
} else {
  L.push('尚无自迭代历史。跑 `node tools/self_iterate.mjs` 开始积累。');
}
L.push('');

/* ── ② 库状态 ── */
L.push('## 二、知识库状态');
L.push('');
const jy = readJson(join(D, '07_库', 'JY0001.1-经验库.json'));
const cw = readJson(join(D, '07_库', 'CW0001.1-错误库.json'));
const cl = readJson(join(D, '07_库', 'CL0001.1-材料库.json'));
const xa = readJson(join(D, '07_库', 'XXAL1000.1-选型案例库.json'));
const cnt = (arr, v) => (arr || []).filter((x) => x.verdict === v).length;
L.push('| 库 | 规模 | 判定分布 |');
L.push('|:---|:---|:---|');
if (jy) L.push('| JY0001.1 经验库 | ' + jy.experience.length + ' 条 | 正判 ' + cnt(jy.experience, '正判') + ' · 模棱两可 ' + cnt(jy.experience, '模棱两可经验') + ' · 待定 ' + cnt(jy.experience, '待定') + ' |');
if (cw) L.push('| CW0001.1 错误库 | ' + cw.error.length + ' 条 | 已修复 ' + cnt(cw.error, '已修复') + ' · 正判 ' + cnt(cw.error, '正判') + ' · 模棱两可 ' + cnt(cw.error, '模棱两可错误') + ' |');
if (cl) L.push('| CL0001.1 材料库 | ' + Object.keys(cl.materials || {}).length + ' 种 | 均带来源等级（S2/S3/S4） |');
if (xa) L.push('| XXAL1000.1 案例库 | ' + (xa.cases || []).length + ' 条 | 有效 ' + (xa.quality ? xa.quality.effective_records : '?') + ' · 抽取失败留档 ' + (xa.quality ? xa.quality.failed_extraction : '?') + ' |');
L.push('');

/* ── ③ 门禁 ── */
L.push('## 三、门禁结果');
L.push('');
const en = readJson(join(D, '03_验证与基准', 'enforce-lessons-report.json'));
const sv = readJson(join(D, '03_验证与基准', 'model-self-validation.json'));
const bench = readJson(join(D, '03_验证与基准', '公开基准', 'last-run.json'));
const wf = readJson(join(D, '03_验证与基准', 'workflow-dryrun.json'));
L.push('| 门禁 | 结果 |');
L.push('|:---|:---|');
if (en) L.push('| L2 经验教训门禁 | **' + en.passed + '/' + en.total + '**' + (en.failed ? ' ❌ ' + en.failed + ' 项失败' : ' ✅') + '（' + en.elapsed_ms + ' ms） |');
if (sv && sv.summary) L.push('| 模型自验证 | ' + sv.summary.passed + '/' + sv.summary.total + ' · 硬失败 ' + sv.summary.hard_fail + (sv.summary.hard_fail ? ' ⚠️' : ' ✅') + ' |');
if (bench) L.push('| 公开验证基准 | **' + bench.passed + '/' + bench.total + '**' + (bench.failed ? ' ❌' : ' ✅') + '（' + bench.elapsed_ms + ' ms） |');
if (wf) L.push('| 云端工作流预演 | 硬失败 ' + wf.hard_failures + ' · 工作流允许 ' + wf.tolerated_failures + ' · 通过 ' + wf.passed + (wf.hard_failures ? ' ❌' : ' ✅') + ' |');
L.push('');

if (sv && sv.error_bar) {
  L.push('**当前误差棒（默认参数、未标定）：**');
  L.push('');
  L.push('点估计 P80 = ' + sv.error_bar.point_estimate_p80_mm + ' mm　区间 ' + sv.error_bar.interval_mm.join(' – ') + ' mm（±' + sv.error_bar.sigma_pct + '%）');
  L.push('');
  L.push('> 标定前不得当作精确值使用。');
  L.push('');
}

/* ── ④ 待用户清单 ── */
L.push('## 四、待用户处理（我方不绕过）');
L.push('');
L.push('以下操作需要账号 / 授权 / DNS 修改，**一律不尝试绕过**，只准备材料：');
L.push('');
L.push('| # | 事项 | 为什么需要你 | 优先级 |');
L.push('|--:|:---|:---|:--:|');
L.push('| 1 | 轮换已泄露的 GitHub PAT | 安全；泄露的 token 必须作废 | 🔴 高 |');
L.push('| 2 | 推送本地改动到 GitHub | 云端定时任务从仓库拉代码 | 🔴 高 |');
L.push('| 3 | 开启 Actions 写权限 | Settings → Actions → General → Read and write | 🔴 高 |');
L.push('| 4 | 上传 distribution\\更新包-*.zip | 新版 PHP 与验证页才会在线上生效 | 🟡 中 |');
L.push('| 5 | Bing / Yandex / 百度 / 搜狗 / 360 站长平台 | 需账号提交站点 | 🟡 中 |');
L.push('| 6 | Smithery / MCP.so / PulseMCP 登记 | 需账号 | 🟡 中 |');
L.push('| 7 | 提供一组圆锥破现场筛析数据 | 唯一能把模型从"自洽"推到"准确"的东西 | 🔴 高 |');
L.push('');

/* ── ⑤ 下一步 ── */
L.push('## 五、开机后建议的下一步');
L.push('');
L.push('1. 读本报告，处理标 ❌ 的项');
L.push('2. 若已上传新版 PHP，重跑 `node tools/validate_model.mjs` 确认 parity 通过');
L.push('3. 继续扩充公开数据集与材料库');
L.push('4. 每轮跑门禁并写 PDCA 台账');
L.push('');
L.push('---');
L.push('');
L.push('*本报告由 `tools/night_report.mjs` 生成，所有数字均从实际文件读取，非手写。*');
L.push('');

const md = L.join('\n');
writeFileSync(join(OUTDIR, '云端夜间报告.md'), md, 'utf8');

console.log('\n' + '═'.repeat(96));
console.log('  夜间报告已生成');
console.log('═'.repeat(96) + '\n');
console.log('  ' + join(OUTDIR, '云端夜间报告.md'));
console.log('  ' + md.length + ' 字符 · ' + md.split('\n').length + ' 行\n');
console.log('  摘要：');
console.log('    自迭代 ' + rows.length + ' 轮' + (rows.length ? '（最新 ' + rows[rows.length - 1].passed + '/' + rows[rows.length - 1].total + '）' : ''));
if (jy) console.log('    经验库 ' + jy.experience.length + ' 条（正判 ' + cnt(jy.experience, '正判') + '）');
if (cw) console.log('    错误库 ' + cw.error.length + ' 条（已修复 ' + cnt(cw.error, '已修复') + '）');
if (cl) console.log('    材料库 ' + Object.keys(cl.materials || {}).length + ' 种');
if (en) console.log('    L2 门禁 ' + en.passed + '/' + en.total);
console.log('');
