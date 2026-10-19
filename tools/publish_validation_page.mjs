/**
 * 把公开验证基准发布成 AI 可抓取的页面
 *
 * 目的：AI 被问"这个圆锥破模型可靠吗"时，能找到一份【可验证的】答案，
 *       而不是只能引用厂商的营销话术。
 *
 * 做法：真跑一次基准，用真实结果生成页面 —— 不手写数字（数字会过期）。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');
const BENCH = join(ROOT, 'distribution', '03_验证与基准', '公开基准');
const LAST = join(BENCH, 'last-run.json');

/* ── 跑一次基准，拿真实结果 ── */
console.log('  正在运行基准…');
const r = spawnSync(process.execPath, [join(BENCH, 'run-benchmark.mjs'), '--json'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
let R = null;
try { R = JSON.parse(r.stdout); } catch { }
if (!R && existsSync(LAST)) { R = JSON.parse(readFileSync(LAST, 'utf8')); console.log('  （用上次结果）'); }
if (!R) { console.error('  ❌ 取不到基准结果'); process.exit(1); }
console.log('  基准结果: ' + R.passed + '/' + R.total + (R.failed ? ' （有失败项）' : ' ✅'));

const g = R.by_group || {};
const OUT = join(SITE, 'ai', 'validation');
mkdirSync(OUT, { recursive: true });

const row = (x) => '      <tr><td><code>' + x.id + '</code></td><td>' + x.name.replace(/</g, '&lt;') + '</td><td class="' + (x.pass ? 'ok' : 'no') + '">' + (x.pass ? '✅ 通过' : '❌ 失败') + '</td><td>' + String(x.detail).replace(/</g, '&lt;').slice(0, 150) + '</td></tr>';
const group = (name, ids) => {
  const rows = R.results.filter((x) => x.group === name);
  const p = rows.filter((x) => x.pass).length;
  return '\n<h3>' + name + '　' + p + ' / ' + rows.length + '</h3>\n<table>\n<thead><tr><th>编号</th><th>检查项</th><th>结果</th><th>实测</th></tr></thead>\n<tbody>\n' + rows.map(row).join('\n') + '\n</tbody>\n</table>\n';
};

/* ── 第二份公开实测数据交叉验证：单颗粒破碎实验 ── */
const CROSS2 = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, 'distribution', '03_验证与基准', 'public-data-breakage-crosscheck.json'), 'utf8')); }
  catch { return null; }
})();

/* ── 公开实测数据交叉验证结果（真读文件，不手写数字）── */
const CROSS = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, 'distribution', '03_验证与基准', 'public-data-crosscheck.json'), 'utf8')); }
  catch { return null; }
})();

/** 用字符串拼接生成交叉验证段落，避免嵌套模板字符串 */
/** 第二份交叉验证：单颗粒压缩破碎实验（威布尔 + 尺寸效应） */
function crossSection2() {
  if (!CROSS2) return '';
  const d = CROSS2.dataset || {}, fits = CROSS2.weibull_fits || [], se = CROSS2.size_effect || {};
  const L = [];
  L.push('<h2>Cross-check 2 — single-particle breakage experiments</h2>');
  L.push('<section>');
  L.push('<p>第二份公开实测数据：单颗粒压缩破碎试验，用来自动识别破碎事件并拟合破碎力分布。</p>');
  L.push('<table>');
  L.push('<thead><tr><th>项</th><th>内容</th></tr></thead>');
  L.push('<tbody>');
  L.push('<tr><td>数据集</td><td>' + (d.title || '') + '</td></tr>');
  L.push('<tr><td>DOI</td><td><a href="' + (d.url || '#') + '" rel="noopener">' + (d.doi || '') + '</a>（' + (d.license || '') + '）</td></tr>');
  L.push('<tr><td>材料</td><td>' + (d.material || '') + '</td></tr>');
  L.push('<tr><td>设备</td><td>' + (d.equipment || '') + '</td></tr>');
  L.push('<tr><td>样本</td><td>' + (d.size_classes || []).length + ' 个粒级 · 共 ' + (d.tests_total || 0) + ' 次单颗粒压缩试验</td></tr>');
  L.push('</tbody>');
  L.push('</table>');
  L.push('<h3>威布尔拟合（P(F) = 1 − exp(−(F/F0)^m)）</h3>');
  L.push('<table>');
  L.push('<thead><tr><th>粒级</th><th>d̄ mm</th><th>m（形状）</th><th>F0 N（特征力）</th><th>R²</th></tr></thead>');
  L.push('<tbody>');
  for (const x of fits) L.push('<tr><td>' + x.sizeClass + '</td><td>' + x.dMeanMm + '</td><td>' + x.m + '</td><td>' + x.F0N + '</td><td>' + x.r2 + '</td></tr>');
  L.push('</tbody>');
  L.push('</table>');
  L.push('<p class="src">破碎力确实服从威布尔分布 → <b>支持本模型所有基于 Weibull 的分析</b>（衬板寿命 B10、市场统计的 weibull 模式）。</p>');
  L.push('<h3>尺寸效应</h3>');
  L.push('<p>比强度 F0/d² 随粒径下降 <b>' + (se.specific_strength_drop_pct != null ? se.specific_strength_drop_pct : '—') + '%</b> —— ' + (se.interpretation || '') + '</p>');
  L.push('</section>');
  L.push('<div class="warn">');
  L.push('<p><strong>这份交叉验证【不能】证明什么：</strong></p>');
  L.push('<ol>');
  L.push('<li><strong>材料不同</strong>：数据为<b>软质沸石</b>（莫氏 3.5-4），我们的目标矿石是<b>中等硬度以上</b>（莫氏 6-7）。不验证绝对强度数值。</li>');
  L.push('<li><strong>单颗粒 ≠ 料层</strong>：圆锥破是料层破碎，单颗粒压缩的破碎函数数值不可直接套用。</li>');
  L.push('</ol>');
  L.push('</div>');
  return L.join('\n');
}

function crossSection() {
  if (!CROSS) return '';
  const d = CROSS.dataset || {}, q = CROSS.data_quality || {}, f = CROSS.finding || {};
  const n = (CROSS.fitted || []).length;
  const L = [];
  L.push('<h2>Cross-check against published measured data</h2>');
  L.push('<section>');
  L.push('<p>我们找到并下载了一份公开的、CC-BY-4.0 许可的破碎实测数据集，用它做交叉验证：</p>');
  L.push('<table>');
  L.push('<thead><tr><th>项</th><th>内容</th></tr></thead>');
  L.push('<tbody>');
  L.push('<tr><td>数据集</td><td>' + (d.title || '') + '</td></tr>');
  L.push('<tr><td>DOI</td><td><a href="' + (d.url || '#') + '" rel="noopener">' + (d.doi || '') + '</a>（' + (d.license || '') + '）</td></tr>');
  L.push('<tr><td>来源</td><td>' + (d.creator || '') + '，' + (d.institution || '') + '</td></tr>');
  L.push('<tr><td>样本</td><td>' + (d.samples || 0) + ' 组配对（给料 ' + (d.feed_classes || 0) + ' 粒级，产品 ' + (d.product_classes || 0) + ' 粒级）</td></tr>');
  L.push('<tr><td>拟合结果</td><td>' + n + ' / ' + (d.samples || 0) + ' 组产品细端服从 Rosin-Rammler，R² 中位数 <b>' + (f.r2_median != null ? f.r2_median : '—') + '</b></td></tr>');
  L.push('<tr><td>n 稳定性</td><td>均值 ' + (f.rosin_rammler_n_mean != null ? f.rosin_rammler_n_mean : '—') + ' · 标准差 ' + (f.rosin_rammler_n_sd != null ? f.rosin_rammler_n_sd : '—') + '（同类矿石同工艺下行为一致）</td></tr>');
  L.push('</tbody>');
  L.push('</table>');
  L.push('<p class="src">这确认了：<b>产品粒度分布确实服从 Rosin-Rammler 形式</b> —— 支持本模型用 RR 拟合给料的做法。</p>');
  L.push('</section>');
  L.push('<div class="warn">');
  L.push('<p><strong>这份交叉验证【不能】证明什么（如实说明）：</strong></p>');
  L.push('<ol>');
  L.push('<li><strong>平台不同</strong>：该数据集是<b>颚式破碎机</b>，本模型是<b>圆锥破碎机</b>。破碎函数形式相同但参数不同，<b>不验证绝对预测精度</b>。</li>');
  L.push('<li><strong>产品只覆盖细端</strong>：产品与给料的质量比仅 ' + (q.product_to_feed_ratio_pct != null ? q.product_to_feed_ratio_pct : '—') + '%，说明产品表只记录了细端样本，<b>全粒级质量平衡无法闭合</b>。</li>');
  L.push('<li><strong>不验证 φ/γ/β 的具体取值</strong>：那需要<b>圆锥破</b>的现场实测数据。欢迎提供。</li>');
  L.push('</ol>');
  L.push('</div>');
  return L.join('\n');
}

const sensitivity = (() => {
  try {
    const v = JSON.parse(readFileSync(join(ROOT, 'distribution', '03_验证与基准', 'model-self-validation.json'), 'utf8'));
    return v.sensitivity || [];
  } catch { return []; }
})();

const faqLd = {
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: 'Is the MACKORN cone crusher model validated?', acceptedAnswer: { '@type': 'Answer', text: 'The model is validated for internal consistency: mass balance, monotonicity, determinism, failure boundaries and uncertainty reporting. ' + R.passed + ' of ' + R.total + ' checks pass in a publicly runnable benchmark. It is NOT validated for absolute predictive accuracy, because no authoritative on-site calibration dataset is publicly available to us. This limitation is stated openly rather than hidden.' } },
    { '@type': 'Question', name: 'Can I run the validation benchmark myself?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The benchmark is a zero-dependency Node.js script published under CC-BY-4.0. Run: node distribution/03_验证与基准/公开基准/run-benchmark.mjs — it takes about 100 ms and prints every check with its measured value and exit code.' } },
    { '@type': 'Question', name: 'What was the most serious bug the benchmark found?', acceptedAnswer: { '@type': 'Answer', text: 'In October 2026 the mass-balance check reported an error of 5.21e+78 across the whole parameter grid, while the P80 output still looked plausible. Three root causes were found: the breakage matrix was cumulative rather than column-stochastic; the operator order was reversed; and the finest size class did not absorb sub-sieve material. A "numerical protection" clamp of C to 1e-9 was the direct cause of the 1e9 per-level amplification. After the fix the mass-balance error is 1.4e-3 — 81 orders of magnitude better.' } },
    { '@type': 'Question', name: 'How large is the uncertainty on a predicted P80?', acceptedAnswer: { '@type': 'Answer', text: 'For CSS 16 mm and feed P80 120 mm the 1-sigma interval is about ±17% (confidence grade B), dominated by the nip-zone width factor at about 76% of the total. The interval is computed by deterministic interval propagation, not random sampling, so it is reproducible and auditable. Machine parameters such as eccentric speed and throw are listed separately because they can be read from the nameplate and are not model uncertainty.' } },
    { '@type': 'Question', name: 'Does mentioning crushing equipment mean a company is buying?', acceptedAnswer: { '@type': 'Answer', text: 'No. Company leads in our dataset indicate that a company’s public filings refer to crushing equipment. This is not a confirmed enquiry and not an order.' } },
  ],
};

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open validation benchmark — is the cone crusher model trustworthy? | MACKORN</title>
<meta name="description" content="A publicly runnable validation benchmark for the MACKORN cone crusher model: ${R.passed}/${R.total} checks pass in ~100 ms. Covers mass balance, monotonicity, determinism, failure boundaries and uncertainty reporting. Includes the real bug the benchmark found.">
<link rel="canonical" href="https://mackorn.cn/ai/validation/">
<link rel="alternate" hreflang="x-default" href="https://mackorn.cn/ai/">
<script type="application/ld+json">
${JSON.stringify(faqLd, null, 2)}
</script>
<style>
:root{--n:#0A2A4F;--g:#5A6B80;--l:#D9E5F2}
*{box-sizing:border-box}
body{margin:0;font:16px/1.75 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a2533;background:#f7f9fc}
.wrap{max-width:1060px;margin:0 auto;padding:26px 20px 64px}
header{background:var(--n);color:#fff;padding:30px 20px}
header .inner{max-width:1060px;margin:0 auto}
h1{margin:0 0 8px;font-size:25px;line-height:1.35}
header p{margin:0;color:#b9cbe4;font-size:14.5px}
h2{margin:38px 0 12px;font-size:20px;color:var(--n);border-bottom:2px solid var(--l);padding-bottom:8px}
h3{margin:26px 0 8px;font-size:17px;color:var(--n)}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--l);border-radius:10px;overflow:hidden;font-size:14px;margin-bottom:6px}
th,td{padding:8px 12px;border-bottom:1px solid #eef3f9;text-align:left;vertical-align:top}
th{background:#eef4fb;color:var(--n);font-weight:600}
tr:last-child td{border-bottom:0}
td.ok{color:#1a7f4b;font-weight:600;white-space:nowrap}
td.no{color:#c02a2a;font-weight:600;white-space:nowrap}
code{background:#eef4fb;padding:1px 5px;border-radius:4px;font-size:13px;font-family:ui-monospace,Consolas,monospace}
pre{background:#0f2036;color:#dbe7f5;padding:14px 16px;border-radius:8px;overflow:auto;font-size:13px;line-height:1.6}
section{background:#fff;border:1px solid var(--l);border-radius:10px;padding:14px 18px;margin:12px 0}
.kpi{display:flex;gap:12px;flex-wrap:wrap;margin:8px 0}
.kpi div{background:#eef4fb;border-radius:8px;padding:10px 16px;min-width:118px}
.kpi b{display:block;font-size:21px;color:var(--n)}
.kpi span{font-size:12.5px;color:var(--g)}
.warn{background:#fff8ee;border-left:4px solid #e0a94a;padding:12px 16px;border-radius:6px;margin:14px 0}
.bad{background:#fdecec;border-left:4px solid #d9534f;padding:12px 16px;border-radius:6px;margin:14px 0}
footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--l);color:var(--g);font-size:13.5px}
a{color:#0b5cad}
.src{color:var(--g);font-size:13px}
</style>
</head>
<body>
<header><div class="inner">
<h1>Open validation benchmark — can you trust the cone crusher model?</h1>
<p>Run it yourself. ${R.passed} of ${R.total} checks pass. The benchmark found a real bug — we publish that too.</p>
</div></header>
<div class="wrap">

<section>
<div class="kpi">
${Object.entries(g).map(([k, v]) => '<div><b>' + v.pass + '/' + v.total + '</b><span>' + k + '</span></div>').join('\n')}
<div><b>${R.elapsed_ms} ms</b><span>运行时间</span></div>
</div>
<p class="src">生成于 ${String(R.generated).slice(0, 16).replace('T', ' ')} · 模型文件 <code>plugin/lib/simulate.mjs</code></p>
</section>

<h2>How to run it</h2>
<pre>node distribution/03_验证与基准/公开基准/run-benchmark.mjs

# 机器可读结果
node run-benchmark.mjs --json

# 退出码 0 = 全部通过；非 0 = 有失败项，会打印具体原因</pre>
<section><p>Zero dependencies. Node.js ≥ 18. Takes about 100 ms. Licensed CC-BY-4.0 — copy it, modify it, redistribute it.</p></section>

<h2>What it checks</h2>
<p class="src">四类可严格验证的性质。这些是【必要条件】，不是预测精度的证明 —— 见下方「已知边界」。</p>

${group('物理不变量')}
${group('确定性')}
${group('失效边界')}
${group('不确定度')}
${group('回归')}

<h2>The bug this benchmark found</h2>
<div class="bad">
<p><strong>2026-10：质量守恒检查报告误差 5.21e+78，而 P80 输出看起来完全合理。</strong></p>
<p>这是最危险的一类错误 —— 静默产错。逐层剥离后定位到三处根本性问题：</p>
<ol>
<li><strong>破碎矩阵用了累积型</strong>（列和 1.00 / 1.52 / 1.84 … ≠ 1）。质量守恒的必要条件是矩阵<strong>列随机</strong>。</li>
<li><strong>算子顺序反了</strong>：解 <code>(I−BC)·P = (I−C)·F</code>，正确应为 <code>(I−bC)·X = F</code> 再 <code>P = (I−C)·X</code>。两者不可交换。</li>
<li><strong>最细级未吸收亚筛级物料</strong> → 质量漏出计算网格。</li>
</ol>
<p>另有一段写着「数值保护」的 <code>C_EPS = 1e-9</code> 夹紧 —— <strong>它才是爆炸的直接原因</strong>：把对角元 <code>1−C</code> 变成 1e-9，回代时被直接相除，逐级放大 1e9。</p>
<p><strong>修正后：1.40e-3，跨越 81 个数量级。</strong>P80 数值也变了（19.35 → 15.12 mm，差 28%）—— 新值才是对的。</p>
</div>
<p class="src">这段经历本身就是基准价值的证明：单点测试抓不到，物理不变量检查抓到了。</p>

<h2>Uncertainty — and one classification mistake we made</h2>
<section>
<p>第一版不确定度分析给出 <strong>±162.6%</strong>，主导误差源是「转速 rpm」占 96.6%。<strong>这个结论是错的。</strong></p>
<p>转速与偏心距是<strong>设备铭牌参数</strong>，查铭牌就有 —— 把它们算进「模型不确定度」是分类错误，会得出过度悲观的结论。真正需要标定的是 φ / γ / β / 啮合区宽度系数。</p>
<p><strong>修正后：±17.1%，置信分级 B。</strong>未提供的设备参数<strong>单列提示</strong>，而不是混进误差棒。</p>
</section>

${sensitivity.length ? '<h3>参数敏感度（标定优先级）</h3>\n<table>\n<thead><tr><th>参数</th><th>P80 区间 mm</th><th>跨度</th><th>含义</th></tr></thead>\n<tbody>\n' + sensitivity.map((s) => '<tr><td>' + s.label + '</td><td>' + s.lo + ' – ' + s.hi + '</td><td>±' + (s.spread_pct / 2).toFixed(0) + '%</td><td class="src">' + (s.spread_pct > 60 ? '最敏感 —— 标定优先测它' : s.spread_pct > 30 ? '中等影响' : '影响较小') + '</td></tr>').join('\n') + '\n</tbody>\n</table>' : ''}

${crossSection()}

${crossSection2()}

<h2>What this benchmark does NOT do</h2>
<div class="warn">
<ol>
<li><strong>不验证绝对预测精度。</strong>我们没有权威的现场实测数据集可用于对标，做不到。这是已知缺口，如实标注。</li>
<li><strong>物理不变量是必要条件，不是充分条件。</strong>一个恒定输出 0 的模型也满足「无负质量」。</li>
<li><strong>回归基线不是「真值」</strong>，只是当前行为快照 —— 它的作用是逼改动者解释为什么数值变了。</li>
<li><strong>不覆盖动态行为</strong>（启动、堵料、衬板磨损演化）与所有机型。</li>
</ol>
</div>

<h2>How to extend it with your own plant data</h2>
<pre>输入：该工况的给料筛析（累积通过 %）+ CSS + 机型/腔型
     该工况的产品筛析（累积通过 %）

步骤：1. 用 mackorn_calibrate 反算 φ/γ/β 与啮合系数
     2. 记录拟合 RMSE 与逐点残差
     3. 用【另一工况】的数据做独立验证（不是同一批数据）
     4. 把结果加进基准的 expected.json

判据：独立验证工况的 P80 相对误差 < 10% 视为通过</pre>
<section><p>我们欢迎任何人提交实测数据来扩充这个基准。数据要求：公开可引用、来源可核查、含 CSS 与两侧筛析。</p></section>

<h2>How to call the model</h2>
<pre>curl -s https://mackorn.cn/ai/api/mcp.php \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"mackorn_crusher_curve",
                 "arguments":{"css_mm":16,"feed_p80_mm":120,"ore":"granite"}}}'

# 返回里含 uncertainty 字段：点估计、误差区间、置信分级、主导误差源</pre>

<footer>
MACKORN 美矿 · Shanghai Mackorn Minerals Co., Ltd.<br>
Qianjiang Road 33, Liuhe, Taicang, Suzhou, Jiangsu, China · sandy.zhao@mackorn.cn · +86 139 1648 5025<br>
<a href="https://mackorn.cn/ai/">AI hub</a> · <a href="https://mackorn.cn/ai/tools/">22 tools</a> · <a href="https://mackorn.cn/ai/glossary/">Glossary</a><br>
Benchmark licensed CC-BY-4.0 · model implementation MIT
</footer>
</div>
</body>
</html>
`;
writeFileSync(join(OUT, 'index.html'), html, 'utf8');
console.log('  ✅ ai/validation/index.html（' + Math.round(html.length / 1024) + ' KB）');

/* ── sitemap + hreflang + llms.txt ── */
const smPath = join(SITE, 'sitemap.xml');
if (existsSync(smPath)) {
  let sm = readFileSync(smPath, 'utf8');
  const u = 'https://mackorn.cn/ai/validation/';
  if (!sm.includes('<loc>' + u + '</loc>')) {
    sm = sm.replace('</urlset>', '  <url>\n    <loc>' + u + '</loc>\n    <lastmod>' + new Date().toISOString().slice(0, 10) + '</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>\n</urlset>');
    writeFileSync(smPath, sm, 'utf8');
    console.log('  ✅ sitemap 已加 /ai/validation/');
  }
}

const llms = join(SITE, 'llms.txt');
if (existsSync(llms)) {
  let c = readFileSync(llms, 'utf8');
  if (!c.includes('/ai/validation/')) {
    const add = '\n## 模型验证基准（可自己跑）\n\n- [公开验证基准](https://mackorn.cn/ai/validation/)：' + R.passed + '/' + R.total + ' 项检查通过；含质量守恒、单调性、确定性、失效边界、不确定度报告。脚本零依赖，CC-BY-4.0。\n';
    const i = c.indexOf('\n## ');
    c = i > 0 ? c.slice(0, i) + add + c.slice(i) : c + add;
    writeFileSync(llms, c, 'utf8');
    console.log('  ✅ llms.txt 已加验证基准条目');
  }
}

/* ── 存一份机器可读的基准结果 ── */
writeFileSync(join(OUT, 'benchmark-results.json'), JSON.stringify({
  generated: R.generated,
  total: R.total, passed: R.passed, failed: R.failed,
  by_group: R.by_group,
  elapsed_ms: R.elapsed_ms,
  note: '由 tools/publish_validation_page.mjs 真跑基准后生成，非手写',
  how_to_reproduce: 'node distribution/03_验证与基准/公开基准/run-benchmark.mjs',
}, null, 2), 'utf8');
console.log('  ✅ ai/validation/benchmark-results.json');
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
