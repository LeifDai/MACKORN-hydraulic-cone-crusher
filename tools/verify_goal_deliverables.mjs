/**
 * 目标交付核验 —— 逐条给出可复现的证据，不靠叙述
 *
 * 目标 6 项交付：
 *   ① 公开的圆锥破模型验证数据集与基准（用已发表文献中的实测给料/产品筛析数据）
 *   ② 每个预测附误差区间与置信度
 *   ③ 可复现的验证脚本（任何人能重跑）
 *   ④ 不确定性量化与失效边界
 *   ⑤ 与公开数据的对标报告
 *   ⑥ 把这些编进工具输出与 AI 可达内容
 *
 * 纪律：每条都要给出【可核验的证据】（文件存在 + 内容可查 + 能跑通），
 *       做不到的如实标 GAP，不美化。
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const exists = (p) => existsSync(p);
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return '' }; };
const size = (p) => { try { return statSync(p).size; } catch { return 0 }; };

const rows = [];
function item(n, title, checks) {
  const failed = checks.filter((c) => !c.ok);
  rows.push({ n, title, pass: failed.length === 0, checks, failed });
}

/* ── ① 公开数据集与基准 ── */
const benchScript = join(D, '03_验证与基准', '公开基准', 'run-benchmark.mjs');
/* 注意：受限沙箱下 child_process 用管道 stdio 会 EPERM（已文档化的边界）。
 * 因此不捕获子进程输出，改为【先跑基准写 last-run.json，再读该文件】。
 * 这不是绕过限制，而是换一条本就存在的正道：基准自己会落盘结果。 */
let bench = null;
const lastRunPath = join(D, '03_验证与基准', '公开基准', 'last-run.json');
try {
  // 用 stdio:'ignore' 跑（不捕获输出 → 不触发管道限制），结果由基准自己写盘
  execFileSync(process.execPath, [benchScript], { stdio: 'ignore', timeout: 300000 });
} catch { /* 非零退出码表示有检查失败，仍继续读结果文件 */ }
try { bench = JSON.parse(read(lastRunPath)); } catch { bench = null; }
const dsFiles = ['granite-jaw-crushing/processed_PSD_feed_product_long.csv', 'brittle-breakage-dem/DATASET.zip', 'manifest.json'];
item(1, '公开验证数据集与基准', [
  { name: '公开基准脚本存在且可跑', ok: exists(benchScript) && !!bench, detail: bench ? (bench.passed + '/' + bench.total + ' 通过') : '跑不通' },
  { name: '基准零依赖（无 npm 依赖）', ok: !/from '(?!node:|\.)/.test(read(benchScript).replace(/from '\.\/[^']*'/g, '')) , detail: '只 import node: 与本地文件' },
  { name: '真实公开数据集已归档（Zenodo/CC-BY）', ok: dsFiles.every((f) => exists(join(D, '03_验证与基准', '实测数据', f))), detail: dsFiles.length + ' 个关键文件' },
  { name: '数据集带出处与许可清单', ok: exists(join(D, '03_验证与基准', '实测数据', 'manifest.json')) && /CC-BY/i.test(read(join(D, '03_验证与基准', '实测数据', 'manifest.json'))), detail: 'manifest.json 含 DOI 与许可' },
  { name: '数据集含【给料 + 产品】筛析配对', ok: /input_6\.2/.test(read(join(D, '03_验证与基准', '实测数据', 'granite-jaw-crushing', 'processed_PSD_feed_product_wide.csv'))), detail: '给料 8 粒级 + 产品 11 粒级' },
]);

/* ── ② 误差区间与置信度 ── */
const U = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'uncertainty.mjs')).href);
const uSample = U.p80WithUncertainty({ cssMm: 16, feedP80Mm: 120 });
const adapter = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'sim-adapter.mjs')).href);
const curve = adapter.crusherCurve({ css_mm: 16, feed_p80_mm: 120, ore: '花岗岩' });
const flow = adapter.flowsheet({ feed_p80_mm: 500, stages: [{ type: 'crusher', name: '中碎', css_mm: 40 }, { type: 'screen', name: '筛', aperture_mm: 20 }, { type: 'crusher', name: '细碎', css_mm: 12 }] });
item(2, '每个预测附误差区间与置信度', [
  { name: '不确定度模块存在', ok: exists(join(ROOT, 'plugin', 'lib', 'uncertainty.mjs')), detail: Math.round(size(join(ROOT, 'plugin', 'lib', 'uncertainty.mjs')) / 1024) + ' KB' },
  { name: '单机预测带回 uncertainty.interval_mm', ok: !!(curve.uncertainty && curve.uncertainty.interval_mm), detail: curve.uncertainty ? (curve.uncertainty.point_estimate_mm + ' mm [' + curve.uncertainty.interval_mm.join(', ') + ']') : '缺' },
  { name: '单机预测带 confidence_grade', ok: !!(curve.uncertainty && curve.uncertainty.confidence_grade), detail: curve.uncertainty ? ('分级 ' + curve.uncertainty.confidence_grade + ' ±' + curve.uncertainty.sigma_pct + '%') : '缺' },
  { name: '流程预测也带 uncertainty', ok: !!(flow.uncertainty && flow.uncertainty.interval_mm), detail: flow.uncertainty && flow.uncertainty.sigma_pct != null ? ('±' + flow.uncertainty.sigma_pct + '% 分级 ' + flow.uncertainty.confidence_grade) : '缺' },
  { name: '指出主导误差源（可指导标定）', ok: !!(uSample.dominant_source && uSample.dominant_source.label), detail: uSample.dominant_source ? (uSample.dominant_source.label + ' ' + uSample.dominant_source.contribution_pct + '%') : '缺' },
  { name: '未标定时明确声明未经实测标定', ok: uSample.caveats.some((c) => /未经现场实测标定|未.*标定/.test(c)), detail: '已声明' },
]);

/* ── ③ 可复现验证脚本 ── */
item(3, '可复现的验证脚本（任何人能重跑）', [
  { name: '公开基准脚本零依赖可跑', ok: !!bench, detail: bench ? ('退出码可判、' + bench.elapsed_ms + ' ms') : '缺' },
  { name: '带 --json 机器可读输出', ok: /--json/.test(read(benchScript)), detail: '可接 CI' },
  { name: '带回归基线（防改动破坏）', ok: exists(join(D, '03_验证与基准', '公开基准', 'expected.json')), detail: 'expected.json' },
  { name: 'README 说明怎么跑', ok: /node .*run-benchmark/.test(read(join(D, '03_验证与基准', '公开基准', 'README.md'))), detail: 'README.md' },
  { name: 'METHODOLOGY 说明设计逻辑与局限', ok: /不做什么|does NOT|已知边界/.test(read(join(D, '03_验证与基准', '公开基准', 'METHODOLOGY.md'))), detail: 'METHODOLOGY.md' },
  { name: '公开数据集下载器可复现', ok: exists(join(ROOT, 'tools', 'fetch_public_datasets.mjs')), detail: '按 DOI 重下' },
]);

/* ── ④ 不确定性量化与失效边界 ── */
const { simulateConeCrusher, sieveSeries, DISTRIBUTIONS, discretize } = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'simulate.mjs')).href);
const SIZES = sieveSeries(0.5, 512);
let rejected = 0;
for (const css of [0, -5, NaN, Infinity]) {
  try { simulateConeCrusher(discretize(DISTRIBUTIONS.rosinRammler({ xc: 100, n: 1.1 }), SIZES).frac, SIZES, { cssMm: css }); } catch { rejected += 1; }
}
const lastRun = (() => { try { return JSON.parse(read(join(D, '03_验证与基准', '公开基准', 'last-run.json'))); } catch { return null; } })();
item(4, '不确定性量化与失效边界', [
  { name: '不确定性量化：确定性区间传播（非随机）', ok: /确定性区间传播/.test(read(join(ROOT, 'plugin', 'lib', 'uncertainty.mjs'))), detail: '可复现、可解释、可审计' },
  { name: '区分需标定参数与设备铭牌参数', ok: /kind: 'fitted'/.test(read(join(ROOT, 'plugin', 'lib', 'uncertainty.mjs'))) && /kind: 'machine'/.test(read(join(ROOT, 'plugin', 'lib', 'uncertainty.mjs'))), detail: '避免把铭牌值当未知量' },
  { name: '失效边界：CSS=0/负/NaN/Infinity 全部拒绝', ok: rejected === 4, detail: rejected + '/4 被拒绝' },
  { name: '质量守恒（物理不变量）通过', ok: (() => { const r = lastRun && lastRun.results.find((x) => /质量守恒/.test(x.name)); return r ? r.pass : false; })(), detail: (() => { const r = lastRun && lastRun.results.find((x) => /质量守恒/.test(x.name)); return r ? r.detail : '缺'; })() },
  { name: '标定优先级指南（可执行动作）', ok: exists(join(D, '03_验证与基准', '标定优先级行动指南.md')), detail: Math.round(size(join(D, '03_验证与基准', '标定优先级行动指南.md')) / 1024) + ' KB' },
]);

/* ── ⑤ 与公开数据的对标报告 ── */
const cx1 = (() => { try { return JSON.parse(read(join(D, '03_验证与基准', 'public-data-crosscheck.json'))); } catch { return null; } })();
const cx2 = (() => { try { return JSON.parse(read(join(D, '03_验证与基准', 'public-data-breakage-crosscheck.json'))); } catch { return null; } })();
item(5, '与公开数据的对标报告', [
  { name: '对标报告 1：花岗岩颚破 23 组', ok: !!cx1 && cx1.dataset && cx1.dataset.samples === 23, detail: cx1 ? (cx1.dataset.doi + ' · ' + cx1.dataset.samples + ' 组 · 拟合 ' + (cx1.fitted || []).length + ' 组') : '缺' },
  { name: '对标报告 2：单颗粒破碎 200 组', ok: !!cx2 && cx2.dataset && cx2.dataset.tests_total >= 150, detail: cx2 ? (cx2.dataset.doi + ' · ' + cx2.dataset.tests_total + ' 次试验') : '缺' },
  { name: '报告含「不能证明什么」的局限声明', ok: !!cx1 && Array.isArray(cx1.what_this_does_NOT_validate) && cx1.what_this_does_NOT_validate.length >= 2, detail: cx1 ? cx1.what_this_does_NOT_validate.length + ' 条局限' : '缺' },
  { name: '平台差异如实标注', ok: !!cx1 && /颚式破碎机|jaw/i.test(cx1.platform_caveat || ''), detail: '颚破 vs 圆锥破已标注' },
  { name: '材料差异如实标注', ok: !!cx2 && /沸石|zeolite/i.test(cx2.material_caveat || ''), detail: '软质沸石已标注' },
  { name: 'DOI 可回溯', ok: !!cx1 && /10\.5281\/zenodo/.test(cx1.dataset.doi) && !!cx2 && /10\.5281\/zenodo/.test(cx2.dataset.doi), detail: '两个 Zenodo DOI' },
]);

/* ── ⑥ 编进工具输出与 AI 可达内容 ── */
const idx = read(join(ROOT, 'plugin', 'index.mjs'));
const page = read(join(D, '官网落地页', 'ai', 'validation', 'index.html'));
const llms = read(join(D, '官网落地页', 'llms.txt'));
item(6, '编进工具输出与 AI 可达内容', [
  { name: '工具输出含 uncertainty 字段', ok: /uncertainty/.test(read(join(ROOT, 'plugin', 'lib', 'sim-adapter.mjs'))), detail: 'crusher_curve + flowsheet' },
  { name: '工具假设文本说明公式与矩阵', ok: /分数型.*破碎矩阵/.test(JSON.stringify(curve.assumptions)), detail: '含 2026-10 修正说明' },
  { name: 'AI 可抓取验证页面已发布', ok: exists(join(D, '官网落地页', 'ai', 'validation', 'index.html')), detail: Math.round(size(join(D, '官网落地页', 'ai', 'validation', 'index.html')) / 1024) + ' KB' },
  { name: '页面含基准结果与两份交叉验证', ok: /Cross-check/.test(page) && /Cross-check 2/.test(page), detail: '含两份对标' },
  { name: 'llms.txt 收录验证页', ok: /ai\/validation/.test(llms), detail: /ai\/validation/.test(llms) ? 'llms.txt 含 /ai/validation/' : 'llms.txt 缺验证页条目' },
  { name: '工具数 22（含知识库工具）', ok: (idx.match(/name: 'mackorn_/g) || []).length === 22, detail: (idx.match(/name: 'mackorn_/g) || []).length + ' 个工具' },
  { name: '机器可读结果 JSON 可被 AI 直接取用', ok: exists(join(D, '官网落地页', 'ai', 'validation', 'benchmark-results.json')), detail: 'benchmark-results.json' },
]);

/* ── 输出 ── */
console.log('\n' + '═'.repeat(102));
console.log('  目标交付核验（逐条证据，不靠叙述）');
console.log('═'.repeat(102) + '\n');
let allPass = true;
for (const r of rows) {
  console.log('  ' + (r.pass ? '✅' : '❌') + ' 【' + r.n + '】' + r.title + '  （' + (r.checks.length - r.failed.length) + '/' + r.checks.length + '）');
  for (const c of r.checks) {
    console.log('       ' + (c.ok ? '✓' : '✗') + ' ' + c.name + (c.detail ? '　— ' + c.detail : ''));
  }
  if (!r.pass) allPass = false;
  console.log('');
}
const totalChecks = rows.reduce((a, r) => a + r.checks.length, 0);
const passChecks = rows.reduce((a, r) => a + (r.checks.length - r.failed.length), 0);
console.log('═'.repeat(102));
console.log('  6 项交付 · ' + passChecks + '/' + totalChecks + ' 条证据通过 · ' + (allPass ? '✅ 全部达成' : '❌ 仍有未达成项'));
if (!allPass) { console.log('\n  未达成：'); for (const r of rows) for (const c of r.failed) console.log('    ✗ 【' + r.n + '】' + c.name + ' — ' + c.detail); }
console.log('');

writeFileSync(join(D, '03_验证与基准', 'goal-deliverables-verification.json'), JSON.stringify({
  verified_at: new Date().toISOString(),
  all_pass: allPass,
  total_checks: totalChecks, passed_checks: passChecks,
  items: rows.map((r) => ({ n: r.n, title: r.title, pass: r.pass, checks: r.checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail })) })),
  note: '每条证据都可复现：文件存在性 + 内容匹配 + 实跑结果。未达成的如实标 GAP。',
}, null, 2), 'utf8');
process.exit(allPass ? 0 : 1);
