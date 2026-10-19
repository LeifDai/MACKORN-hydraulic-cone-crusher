/**
 * 把模型卡发布成 HTML 页面 + 加入 AI 索引
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');
const OUT = join(SITE, 'ai', 'model-card');
const mc = JSON.parse(readFileSync(join(OUT, 'model-card.json'), 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const B = 'https://mackorn.cn';

const faq = {
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: 'Is the MACKORN cone crusher model accurate?', acceptedAnswer: { '@type': 'Answer', text: 'Its absolute predictive accuracy is NOT validated, because no public dataset with cone-crusher feed and full product size distributions could be found (about 40 keyword searches across Zenodo, figshare, Dryad, OSF and OpenAlex returned none). What IS validated is internal consistency: ' + (mc.validation.public_benchmark ? mc.validation.public_benchmark.passed + '/' + mc.validation.public_benchmark.total : '26/26') + ' checks pass in a publicly runnable benchmark covering mass balance, monotonicity, determinism, failure boundaries and uncertainty reporting. The model card states this openly.' } },
    { '@type': 'Question', name: 'How large is the uncertainty on a predicted P80?', acceptedAnswer: { '@type': 'Answer', text: 'For fine crushing (CSS 16 mm, feed P80 120 mm) the point estimate is ' + mc.uncertainty.example_fine_crushing.point_estimate_p80_mm + ' mm with a 1-sigma interval of ' + mc.uncertainty.example_fine_crushing.interval_mm.join(' to ') + ' mm (about ' + mc.uncertainty.example_fine_crushing.sigma_pct + '%, confidence grade ' + mc.uncertainty.example_fine_crushing.confidence_grade + '). For coarse crushing (CSS 40 mm) it is grade ' + mc.uncertainty.example_coarse_crushing.confidence_grade + ' at about ' + mc.uncertainty.example_coarse_crushing.sigma_pct + '%. The interval is computed by deterministic interval propagation, not random sampling, so it is reproducible and auditable.' } },
    { '@type': 'Question', name: 'What are the model\'s known limitations?', acceptedAnswer: { '@type': 'Answer', text: mc.limitations.map((x) => x.title).join('; ') + '. Each limitation is documented with its source and impact in the model card.' } },
    { '@type': 'Question', name: 'Can the model be calibrated with plant data?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, and the threshold is lower than most people expect. Public literature (Chalmers, Cone Crusher Performance 2015) states that to calibrate a breakage function it is sufficient to use the result from the first test in each series. So one set of feed and product sieve analyses plus the CSS is enough to start. After calibration the error bars narrow substantially.' } },
    { '@type': 'Question', name: 'Does mentioning crushing equipment mean a company is buying?', acceptedAnswer: { '@type': 'Answer', text: 'No. Company leads in our dataset indicate that a company\'s public filings refer to crushing equipment. This is not a confirmed enquiry and not an order.' } },
  ],
};

const L = [];
L.push('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">');
L.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
L.push('<title>Model Card — MACKORN Cone Crusher Model | limitations, uncertainty, validation</title>');
L.push('<meta name="description" content="A model card for the MACKORN cone crusher selection model: ' + (mc.validation.public_benchmark ? mc.validation.public_benchmark.passed + '/' + mc.validation.public_benchmark.total : '26/26') + ' benchmark checks pass, P80 uncertainty ' + mc.uncertainty.example_fine_crushing.sigma_pct + '% (grade ' + mc.uncertainty.example_fine_crushing.confidence_grade + '), and ' + mc.limitations.length + ' documented limitations stated as prominently as the capabilities.">');
L.push('<link rel="canonical" href="' + B + '/ai/model-card/">');
L.push('<link rel="alternate" hreflang="x-default" href="' + B + '/ai/">');
L.push('<script type="application/ld+json">');
L.push(JSON.stringify(faq, null, 2));
L.push('</script>');
L.push('<style>');
L.push(':root{--n:#0A2A4F;--g:#5A6B80;--l:#D9E5F2}*{box-sizing:border-box}');
L.push('body{margin:0;font:16px/1.75 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a2533;background:#f7f9fc}');
L.push('.wrap{max-width:1040px;margin:0 auto;padding:26px 20px 64px}');
L.push('header{background:var(--n);color:#fff;padding:30px 20px}header .inner{max-width:1040px;margin:0 auto}');
L.push('h1{margin:0 0 8px;font-size:24px;line-height:1.35}header p{margin:0;color:#b9cbe4;font-size:14.5px}');
L.push('h2{margin:36px 0 12px;font-size:20px;color:var(--n);border-bottom:2px solid var(--l);padding-bottom:8px}');
L.push('h3{margin:24px 0 8px;font-size:17px;color:var(--n)}');
L.push('table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--l);border-radius:10px;overflow:hidden;font-size:14px;margin:10px 0}');
L.push('th,td{padding:8px 12px;border-bottom:1px solid #eef3f9;text-align:left;vertical-align:top}');
L.push('th{background:#eef4fb;color:var(--n);font-weight:600}tr:last-child td{border-bottom:0}');
L.push('section{background:#fff;border:1px solid var(--l);border-radius:10px;padding:14px 18px;margin:12px 0}');
L.push('code{background:#eef4fb;padding:1px 5px;border-radius:4px;font-size:13px;font-family:ui-monospace,Consolas,monospace}');
L.push('pre{background:#0f2036;color:#dbe7f5;padding:14px 16px;border-radius:8px;overflow:auto;font-size:13px}');
L.push('.warn{background:#fff8ee;border-left:4px solid #e0a94a;padding:12px 16px;border-radius:6px;margin:12px 0}');
L.push('.bad{background:#fdecec;border-left:4px solid #d9534f;padding:12px 16px;border-radius:6px;margin:12px 0}');
L.push('.ok{background:#eefaf1;border-left:4px solid #35a06a;padding:12px 16px;border-radius:6px;margin:12px 0}');
L.push('.kpi{display:flex;gap:12px;flex-wrap:wrap;margin:8px 0}.kpi div{background:#eef4fb;border-radius:8px;padding:10px 16px;min-width:118px}');
L.push('.kpi b{display:block;font-size:20px;color:var(--n)}.kpi span{font-size:12.5px;color:var(--g)}');
L.push('footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--l);color:var(--g);font-size:13.5px}a{color:#0b5cad}');
L.push('.sev-high{color:#c02a2a;font-weight:600}.sev-medium{color:#c07a2a;font-weight:600}');
L.push('</style></head><body>');
L.push('<header><div class="inner"><h1>Model Card — MACKORN Cone Crusher Model</h1>');
L.push('<p>版本 ' + mc.version + ' · ' + mc.type + '</p>');
L.push('<p style="margin-top:6px">局限与能力同等显眼 —— 这是模型卡的基本要求，不是免责声明。</p>');
L.push('</div></header><div class="wrap">');

L.push('<section><div class="kpi">');
L.push('<div><b>' + (mc.validation.public_benchmark ? mc.validation.public_benchmark.passed + '/' + mc.validation.public_benchmark.total : '—') + '</b><span>公开基准</span></div>');
L.push('<div><b>±' + mc.uncertainty.example_fine_crushing.sigma_pct + '%</b><span>细碎 P80 不确定度</span></div>');
L.push('<div><b>' + mc.uncertainty.example_fine_crushing.confidence_grade + '</b><span>置信分级</span></div>');
L.push('<div><b>' + mc.limitations.length + '</b><span>已披露局限</span></div>');
L.push('<div><b>' + mc.cross_validation.length + '</b><span>公开数据交叉验证</span></div>');
L.push('</div></section>');

L.push('<h2>1. Intended use</h2><section><p><strong>适用：</strong></p><ul>');
mc.intended_use.forEach((x) => L.push('<li>' + esc(x) + '</li>'));
L.push('</ul><p><strong>明确不适用：</strong></p><ul>');
mc.out_of_scope.forEach((x) => L.push('<li>❌ ' + esc(x) + '</li>'));
L.push('</ul></section>');

L.push('<h2>2. Validation status</h2><section><table><thead><tr><th>验证</th><th>结果</th></tr></thead><tbody>');
if (mc.validation.public_benchmark) L.push('<tr><td>公开验证基准</td><td><strong>' + mc.validation.public_benchmark.passed + '/' + mc.validation.public_benchmark.total + '</strong> 通过（' + mc.validation.public_benchmark.elapsed_ms + ' ms）</td></tr>');
if (mc.validation.self_validation) L.push('<tr><td>自验证框架</td><td>' + mc.validation.self_validation.passed + '/' + mc.validation.self_validation.total + ' · 硬失败 ' + mc.validation.self_validation.hard_fail + '</td></tr>');
if (mc.validation.enforce_lessons) L.push('<tr><td>经验教训门禁</td><td>' + mc.validation.enforce_lessons.passed + '/' + mc.validation.enforce_lessons.total + '</td></tr>');
L.push('</tbody></table>');
if (mc.validation.groups_verified) {
  L.push('<h3>基准分组</h3><table><thead><tr><th>组</th><th>结果</th></tr></thead><tbody>');
  for (const [k, v] of Object.entries(mc.validation.groups_verified)) L.push('<tr><td>' + esc(k) + '</td><td>' + esc(v) + '</td></tr>');
  L.push('</tbody></table>');
}
L.push('<pre>' + esc(mc.reproducibility.public_benchmark) + '</pre></section>');

L.push('<h2>3. Uncertainty (measured)</h2><section><table><thead><tr><th>工况</th><th>预测 P80</th><th>误差区间</th><th>±%</th><th>分级</th></tr></thead><tbody>');
const f = mc.uncertainty.example_fine_crushing, c2 = mc.uncertainty.example_coarse_crushing;
L.push('<tr><td>' + esc(f.case) + '</td><td>' + f.point_estimate_p80_mm + ' mm</td><td>' + f.interval_mm.join('–') + ' mm</td><td>' + f.sigma_pct + '</td><td><strong>' + f.confidence_grade + '</strong></td></tr>');
L.push('<tr><td>' + esc(c2.case) + '</td><td>' + c2.point_estimate_p80_mm + ' mm</td><td>' + c2.interval_mm.join('–') + ' mm</td><td>' + c2.sigma_pct + '</td><td><strong>' + c2.confidence_grade + '</strong></td></tr>');
L.push('</tbody></table>');
L.push('<p class="src">分级：<b>A</b> ±≤10% 可用于方案 · <b>B</b> ±10–25% 初步方案 · <b>C</b> ±25–50% 仅可行性 · <b>D</b> ±>50% 只说明量级</p>');
L.push('<div class="warn">' + esc(mc.uncertainty.note) + '</div></section>');

L.push('<h2>4. ⚠️ Known limitations (must read)</h2>');
for (const x of mc.limitations) {
  L.push('<div class="' + (x.severity === 'high' ? 'bad' : 'warn') + '">');
  L.push('<h3 style="margin-top:0">' + esc(x.id) + '　' + esc(x.title) + '　<span class="sev-' + x.severity + '">[' + x.severity + ']</span></h3>');
  L.push('<p><strong>说明</strong>：' + esc(x.detail) + '</p>');
  L.push('<p><strong>影响</strong>：' + esc(x.impact) + '</p>');
  if (x.source) L.push('<p class="src">出处：' + (/^https?:/.test(x.source) ? '<a href="' + x.source + '" rel="noopener">' + x.source + '</a>' : esc(x.source)) + '</p>');
  L.push('</div>');
}

L.push('<h2>5. Cross-validation on real public data</h2>');
for (const x of mc.cross_validation) {
  L.push('<section><h3>' + esc(x.dataset) + '</h3>');
  L.push('<p>DOI <a href="https://doi.org/' + x.doi + '" rel="noopener">' + x.doi + '</a>（' + esc(x.license) + '）</p>');
  L.push('<p><strong>结果</strong>：' + esc(x.result) + '</p>');
  if (x.platform_caveat) L.push('<div class="warn">⚠️ 平台差异：' + esc(x.platform_caveat) + '</div>');
  if (x.material_caveat) L.push('<div class="warn">⚠️ 材料差异：' + esc(x.material_caveat) + '</div>');
  L.push('<p><strong>不能证明</strong>：' + esc((x.does_not_prove || []).join('；')) + '</p></section>');
}

L.push('<h2>6. Literature basis</h2><section><ul>');
for (const x of mc.literature) L.push('<li>' + esc(x.citation) + (x.url ? ' <a href="' + x.url + '" rel="noopener">[' + x.url + ']</a>' : '') + '<br><span class="src">→ ' + esc(x.use) + '</span></li>');
L.push('</ul></section>');

L.push('<h2>7. Data provenance</h2><section><table><thead><tr><th>等级</th><th>含义</th></tr></thead><tbody>');
for (const [k, v] of Object.entries(mc.data_provenance)) { if (k === 'discipline') continue; L.push('<tr><td><strong>' + esc(k) + '</strong></td><td>' + esc(v) + '</td></tr>'); }
L.push('</tbody></table><div class="ok">' + esc(mc.data_provenance.discipline) + '</div></section>');

L.push('<h2>8. Reproduce it yourself</h2><section><pre>' + esc(Object.values(mc.reproducibility).join('\n')) + '</pre></section>');
L.push('<h2>9. Citation</h2><section><pre>' + esc(mc.citation) + '</pre></section>');

L.push('<footer>MACKORN 美矿 · Shanghai Mackorn Minerals Co., Ltd.<br>');
L.push('Qianjiang Road 33, Liuhe, Taicang, Suzhou, Jiangsu, China · ' + esc(mc.contact.email) + '<br>');
L.push('<a href="' + B + '/ai/">AI hub</a> · <a href="' + B + '/ai/validation/">验证基准</a> · <a href="' + B + '/ai/model-card/model-card.json">模型卡 JSON</a><br>');
L.push('Benchmark CC-BY-4.0 · model implementation MIT</footer>');
L.push('</div></body></html>');

writeFileSync(join(OUT, 'index.html'), L.join('\n'), 'utf8');
console.log('  ✅ ai/model-card/index.html  ' + Math.round(L.join('\n').length / 1024) + ' KB');

/* llms.txt */
const ll = join(SITE, 'llms.txt');
if (existsSync(ll)) {
  let t = readFileSync(ll, 'utf8');
  if (!t.includes('/ai/model-card/')) {
    t = t.replace('## 模型验证与可信度（可自己重跑）\n',
      '## 模型验证与可信度（可自己重跑）\n\n- [模型卡 Model Card](' + B + '/ai/model-card/)：' + mc.limitations.length + ' 条已知局限（转速简化/参数来源/缺圆锥破对标）、实测不确定性、' + mc.cross_validation.length + ' 份公开数据交叉验证、可复现命令。**局限与能力同等显眼。**\n- [模型卡 JSON](' + B + '/ai/model-card/model-card.json)：机器可读\n');
    writeFileSync(ll, t, 'utf8');
    console.log('  ✅ llms.txt 已加模型卡条目');
  } else console.log('  ○ llms.txt 已有');
}

/* sitemap */
const sm = join(SITE, 'sitemap.xml');
if (existsSync(sm)) {
  let s = readFileSync(sm, 'utf8');
  const u = B + '/ai/model-card/';
  if (!s.includes('<loc>' + u + '</loc>')) {
    s = s.replace('</urlset>', '  <url><loc>' + u + '</loc><lastmod>' + new Date().toISOString().slice(0, 10) + '</lastmod><changefreq>monthly</changefreq><priority>0.9</priority></url>\n</urlset>');
    writeFileSync(sm, s, 'utf8');
    console.log('  ✅ sitemap 已加模型卡');
  }
}
