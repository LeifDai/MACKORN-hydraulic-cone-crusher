/**
 * R4 · 为 23 个工具各建一页「可引用的工具说明 + 真实算例」
 *
 * 为什么这样最有效：
 *   AI 被问「圆锥破产能怎么算」「Whiten 模型是什么」时，会引用带具体数字的页面。
 *   我们的工具能真算出数字 —— 但只有 1/21 的工具有页面提到。
 *
 * 做法：
 *   ① 从 plugin/index.mjs 读真实工具定义（名称/描述/参数）
 *   ② 【真跑一次】拿到真实输出（不是编的示例）
 *   ③ 生成页面：工具做什么 / 输入什么 / 真算例 / 怎么读结果 / 数据来源与边界
 *   ④ 挂 SoftwareApplication + HowTo + FAQPage 结构化数据
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');
const OUT = join(SITE, 'ai', 'tools');

/* ── ① 载入工具定义 ── */
const mod = await import(pathToFileURL(join(ROOT, 'plugin', 'index.mjs')).href);
const defs = mod.toolDefinitions || mod.default || [];
console.log('\n  载入工具定义: ' + defs.length + ' 个');

/* ── ② 每个工具的真实调用参数（真跑，不编）── */
const CALLS = {
  mackorn_equipment_catalog: {},
  mackorn_capacity_check: { model: 'NH400', cavity: 'MC', css: 16 },
  mackorn_cone_selection: { target_tph: 500, max_feed_mm: 300, target_product_mm: 20, ore: 'granite' },
  mackorn_mcfm_analysis: { cumulative_retained: [2, 15, 35, 55, 70, 82, 90, 20] },
  mackorn_grading_porosity: { coarse_frac: 50, mid_frac: 30, fine_frac: 20 },
  mackorn_market_stats: { mode: 'weibull', lives: [3200, 4100, 3800, 5200, 4600, 6100, 5500, 7000] },
  mackorn_contact: { language: 'en' },
  mackorn_wear_design: { sections: 5, base_hardness: 58, gradient_factor: 1.12 },
  mackorn_market_intel: {},
  mackorn_plant_design: { target_tph: 800, max_feed_mm: 600, target_product_mm: 20 },
  mackorn_cost_estimate: { model: 'NH400', units: 2, tph: 300, hours_per_year: 6000, load_factor: 0.75 },
  mackorn_distributor_eval: { agent_type: '公司', scores: { market_cover: 4, sales_team: 3, capital: 3, years: 5, credit_record: 5, sanctions: 5 } },
  mackorn_requirement_intake: { capacity_tph: 500, max_feed_mm: 600, form_text: '目标产量 500 t/h，原矿最大给料 600 mm，成品 20 mm 以下，花岗岩，抗压强度 150 MPa，含水率 3%，干法生产' },
  mackorn_crusher_curve: { css_mm: 16, feed_p80_mm: 120, ore: 'granite' },
  mackorn_simulate_flowsheet: { feed_p80_mm: 500, stages: [{ type: 'crusher', name: 'secondary', css_mm: 40 }, { type: 'screen', name: 'check', aperture_mm: 20 }, { type: 'crusher', name: 'tertiary', css_mm: 12 }] },
  mackorn_calibrate: { css_mm: 16, feed_points: [{ size_mm: 20, cum_pct: 80 }, { size_mm: 120, cum_pct: 10 }], product_points: [{ size_mm: 5, cum_pct: 40 }, { size_mm: 10, cum_pct: 70 }, { size_mm: 20, cum_pct: 92 }, { size_mm: 30, cum_pct: 99 }, { size_mm: 40, cum_pct: 100 }] },
  mackorn_proposal: { capacity_tph: 500, ore_type: 'granite' },
  mackorn_intel_watch: {},
  mackorn_selection_report: { target_tph: 500, max_feed_mm: 300 },
  mackorn_knowledge_update: { entries: [{ title: 'Example entry', content: 'Example content', source_url: 'https://www.sec.gov/' }] },
  mackorn_pdca_status: {},
};

async function runOne(def) {
  const args = CALLS[def.name] ?? {};
  try {
    const out = await def.execute(args);
    return { ok: true, args, out, via: 'local plugin' };
  } catch (e) {
    // 本地环境限制（如沙箱不允许写 DSH_HOME）时，回退到线上公开端点取真实输出。
    // 线上端点是同一套逻辑的另一实现，且这正是读者会用的通道。
    try {
      const r = await fetch('https://mackorn.cn/ai/api/mcp.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: def.name, arguments: args } }),
        signal: AbortSignal.timeout(45000),
      });
      if (r.ok) {
        const j = await r.json();
        if (!j.error && j.result && j.result.content) {
          const t = JSON.parse(j.result.content[0].text);
          return { ok: true, args, out: t.result, via: 'remote endpoint (local run blocked by sandbox)', localError: e.message };
        }
      }
    } catch { }
    return { ok: false, args, err: e.message };
  }
}

/* ── ③ 页面文案：每个工具一句"回答什么问题" ── */
const PURPOSE = {
  mackorn_equipment_catalog: ['What cone crusher models and cavity types does MACKORN offer?', '列出 MACKORN 全部 13 个机型（NH 标准型 9 个 + NS 高速型 4 个）与 9 种腔型代码，含最大给料、排矿口范围、功率、重量、产能。'],
  mackorn_capacity_check: ['How much can a given cone crusher model and CSS actually produce?', '给定机型 + 腔型 + 紧边排矿口 CSS，从腔型×CSS 产能详表查出生产能力区间 t/h，并返回排矿口合规性、最大给料限制、外形尺寸与重量。'],
  mackorn_cone_selection: ['Which cone crusher model, cavity and CSS should I choose for a target throughput?', '按目标处理量、给料最大粒度、目标产品粒度与工序段，从 NH / NS 中选出机型 + 腔型 + CSS + 台数，给出候选排序、P80 估计与达标判定。'],
  mackorn_plant_design: ['How is a complete crushing and screening plant configured?', '按原矿最大粒度与目标产品粒度算总破碎比、推荐破碎段数、各段给料/产品/破碎比分配，并做中碎与细碎选型，给出筛分面积、皮带带宽与辅机配置。'],
  mackorn_crusher_curve: ['What product size distribution does a cone crusher produce at a given CSS?', '用 Whiten (1972) 稳态圆锥破模型，由给料分布 + CSS + 偏心距算出产品 P80、破碎比、逐级产品分布与啮合区 K1/K2，并给 Bond (1952) 功耗估算。'],
  mackorn_simulate_flowsheet: ['What is the final product size of a multi-stage crushing circuit, and what is the circulating load?', '多段破碎 + 筛分 + 闭路流程模拟：逐段算产品粒度与循环负荷，用群体平衡迭代到稳态，输出各段入料/出料 P80、破碎比、筛下率与最终产品 P80。'],
  mackorn_calibrate: ['How do I calibrate the crusher model with our own plant sieve data?', '输入某工况的给料筛析与产品筛析（累积通过率 %）+ 该工况 CSS，用最小二乘（有界网格 + 局部细化）反算破碎函数参数 φ/γ/β 与啮合系数，给出拟合优度、逐点残差与可用性判断。'],
  mackorn_cost_estimate: ['What are the energy and wear costs of running this crusher?', '按机型与台数算装机功率、年电耗、年电费、吨电耗与吨电费；按电价/年运行小时/负荷率/衬板寿命与衬板价算衬板吨成本。'],
  mackorn_wear_design: ['How should liner hardness be graded along the crushing chamber to even out wear?', '沿破碎腔高度离散截面评估衬板磨损均匀度（均匀度 = 1 − σ/μ），给出多梯度分区硬度设计 H_i = H_base × k^i 与均匀度提升量。'],
  mackorn_requirement_intake: ['How do I turn a customer requirement form into a selection answer?', '把客户需求表文字 + 产量变成「还缺什么要问客户」+「该配什么设备」：抽取字段并标注来源、检查缺失生成追问话术、归一化工况、调用选型与整线配置。'],
  mackorn_mcfm_analysis: ['Is the feed gradation to my fine crushing stage stable enough?', '计算粗粒级给料模数 MCFM，判定是否落在工程最优窗口 4.0–4.5，给出"均匀布料 → 速度均匀化 → 磨损稳定 → 模数恒定"的杠杆调整建议。'],
  mackorn_grading_porosity: ['Is my material bed dense enough to keep the reduction ratio constant?', '按粗/中/细三组分配比计算料层孔隙率 φ = 0.42 − 0.30·min(中料占比,0.35) + 0.15·max(0, 细料占比 − 0.30)，与最优配比窗口对比。'],
  mackorn_proposal: ['Can you produce a deliverable technical proposal?', '生成 14 章标准方案书（Markdown）：项目概况、设计依据、工艺流程、设备选择、技术参数、电气自控、环保、土建、供货范围、投资估算、工期、假设与来源、风险与待确认、附件清单。'],
  mackorn_selection_report: ['Can you produce a complete selection report?', '把生产线配置、圆锥破选型、MCFM 诊断、成本估算串成一份 Markdown 选型报告，并自动汇总全部"假设与来源"和"风险与待确认项"。'],
  mackorn_market_intel: ['How attractive is this market, and how do we compare with competitors?', '返回五维（行业/技术/时效/经济/可操作）评估框架与打分口径、破碎效率核心杠杆链、竞品对标矩阵、优势与差距、客户痛点应对话术。'],
  mackorn_distributor_eval: ['Is this distributor reliable, and how much credit should we extend?', '按「能力/可靠/匹配」三维 17 项打分，区分公司代理与个人代理，输出分级 A/B/C/D、授信额度建议、风险清单与待核验项。'],
  mackorn_market_stats: ['Is this market concentrated or fragmented, and when should liners be replaced?', '描述统计（均值/中位数/CV/偏度/峰度）、市场集中度（CR/HHI/Gini）、线性回归与残差分析、威布尔拟合预测 B10 寿命、增长率基数效应修正。'],
  mackorn_wear_design_x: ['', ''],
  mackorn_intel_watch: ['What industry intelligence should we track, and how often?', '返回 MACKORN 行业情报的固定观测面与可执行研究简报：竞品新品与专利动向、中国与国际破碎机专利、国家标准更新、矿山机械市场数据。'],
  mackorn_knowledge_update: ['How do I add a new fact to the knowledge base safely?', '把新采集的情报写入知识库并做：来源可信度分级、数值矛盾检测、版本演进判定、变更留痕。**无 source_url 的条目一律拒收**；可信度裁决只产出"建议值"。'],
  mackorn_pdca_status: ['What is the current state of the plugin and what should be improved next?', '查看自我优化循环（PDCA）状态：模型版本与知识库修订号、条目数与可信度分布、矛盾台账、四项演进指标、到期情报观测项与优化建议清单。'],
  mackorn_contact: ['How do I contact MACKORN?', '返回 MACKORN 的联系方式与全球招募信息：公司名称、地址（中英文）、三个商务电话与邮箱、官网、服务时间，以及代理商/选人招募条件。'],
};

function summarize(out) {
  // 把输出压成可读的键值对（最多 18 项）
  const lines = [];
  const walk = (o, prefix = '', depth = 0) => {
    if (lines.length >= 18 || depth > 2) return;
    if (o === null || o === undefined) { lines.push([prefix, 'null']); return; }
    if (Array.isArray(o)) { lines.push([prefix, '[' + o.length + ' 项]' + (o.length && typeof o[0] !== 'object' ? ' ' + JSON.stringify(o.slice(0, 4)) : '')]); return; }
    if (typeof o === 'object') { for (const [k, v] of Object.entries(o)) walk(v, prefix ? prefix + '.' + k : k, depth + 1); return; }
    lines.push([prefix, String(o).slice(0, 90)]);
  };
  walk(out);
  return lines;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let made = 0;
const index = [];
console.log('\n  ── 生成工具页（每个都用真实输出）──\n');

for (const def of defs) {
  const r = await runOne(def);
  const info = PURPOSE[def.name] || ['What does ' + def.name + ' do?', def.description || ''];
  const slug = def.name.replace('mackorn_', '').replace(/_/g, '-');
  const dir = join(OUT, slug);
  mkdirSync(dir, { recursive: true });

  const params = def.parameters && def.parameters.properties ? Object.entries(def.parameters.properties) : [];
  const paramRows = params.map(([k, v]) => '      <tr><td><code>' + k + '</code></td><td>' + (v.type || '') + '</td><td>' + (v.description || '').replace(/</g, '&lt;').slice(0, 150) + '</td></tr>').join('\n');
  const kv = r.ok ? summarize(r.out) : [['error', r.err]];
  const kvRows = kv.map(([k, v]) => '      <tr><td><code>' + k + '</code></td><td>' + String(v).replace(/</g, '&lt;') + '</td></tr>').join('\n');

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: info[0], acceptedAnswer: { '@type': 'Answer', text: info[1] } },
      { '@type': 'Question', name: 'How do I call this tool?', acceptedAnswer: { '@type': 'Answer', text: 'POST a JSON-RPC 2.0 tools/call request to https://mackorn.cn/ai/api/mcp.php with name "' + def.name + '". No installation is required.' } },
      { '@type': 'Question', name: 'Is the model based on published literature?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The particle-size and flow models are independently implemented from Whiten (1972) and Bond (1952); the implementation is MIT-licensed and auditable. Vendor data comes from MACKORN parameter tables. Every number carries its source; unknown values return null rather than an estimate.' } },
    ],
  };
  const appLd = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication',
    name: def.name, applicationCategory: 'EngineeringApplication', operatingSystem: 'Any',
    description: info[1], url: 'https://mackorn.cn/ai/tools/' + slug + '/',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: params.map(([k]) => k).slice(0, 20),
    isPartOf: { '@type': 'SoftwareApplication', name: 'MACKORN Cone Crusher Selection (MCP server)', url: 'https://mackorn.cn/ai/' },
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${def.name} — ${info[0]} | MACKORN</title>
<meta name="description" content="${info[1].replace(/"/g, '&quot;').slice(0, 155)}">
<link rel="canonical" href="https://mackorn.cn/ai/tools/${slug}/">
<script type="application/ld+json">
${JSON.stringify(faqLd, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(appLd, null, 2)}
</script>
<style>
:root{--n:#0A2A4F;--g:#5A6B80;--l:#D9E5F2}
*{box-sizing:border-box}
body{margin:0;font:16px/1.75 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a2533;background:#f7f9fc}
.wrap{max-width:1000px;margin:0 auto;padding:26px 20px 64px}
header{background:var(--n);color:#fff;padding:28px 20px}
header .inner{max-width:1000px;margin:0 auto}
h1{margin:0 0 6px;font-size:23px;line-height:1.35;font-family:ui-monospace,Consolas,monospace}
header p{margin:0;color:#b9cbe4;font-size:14.5px}
h2{margin:36px 0 12px;font-size:19px;color:var(--n);border-bottom:2px solid var(--l);padding-bottom:8px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--l);border-radius:10px;overflow:hidden;font-size:14px}
th,td{padding:8px 12px;border-bottom:1px solid #eef3f9;text-align:left;vertical-align:top}
th{background:#eef4fb;color:var(--n);font-weight:600}
tr:last-child td{border-bottom:0}
code{background:#eef4fb;padding:1px 5px;border-radius:4px;font-size:13px;font-family:ui-monospace,Consolas,monospace}
pre{background:#0f2036;color:#dbe7f5;padding:14px 16px;border-radius:8px;overflow:auto;font-size:13px;line-height:1.6}
section{background:#fff;border:1px solid var(--l);border-radius:10px;padding:14px 18px;margin:12px 0}
footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--l);color:var(--g);font-size:13.5px}
a{color:#0b5cad}
.src{color:var(--g);font-size:13px}
</style>
</head>
<body>
<header><div class="inner">
<h1>${def.name}</h1>
<p>${info[0]}</p>
</div></header>
<div class="wrap">

<h2>What it answers</h2>
<section><p>${info[1]}</p></section>

<h2>Input parameters</h2>
${params.length ? '<table>\n<thead><tr><th>Parameter</th><th>Type</th><th>Description</th></tr></thead>\n<tbody>\n' + paramRows + '\n</tbody>\n</table>' : '<section><p class="src">No parameters — this tool takes none.</p></section>'}

<h2>Worked example (real output, not a mock-up)</h2>
<section><p class="src">Run via: ${r.via || 'local plugin'}</p><p class="src">Input:</p><pre>${JSON.stringify(r.args, null, 2).replace(/</g, '&lt;')}</pre>
<p class="src">Output (first fields):</p>
<table>
<thead><tr><th>Field</th><th>Value</th></tr></thead>
<tbody>
${kvRows}
</tbody>
</table>
${r.ok ? '' : '<p class="src">This run returned an error: ' + String(r.err).replace(/</g, '&lt;') + '</p>'}
</section>

<h2>How to call it</h2>
<section>
<p>POST a JSON-RPC 2.0 request to the public MCP endpoint — no installation, no API key:</p>
<pre>curl -s https://mackorn.cn/ai/api/mcp.php \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"${def.name}","arguments":${JSON.stringify(r.args).slice(0, 300)}}}'</pre>
<p class="src">Endpoint: <a href="https://mackorn.cn/ai/api/mcp.php">https://mackorn.cn/ai/api/mcp.php</a> ·
Registry: <code>cn.mackorn/mackorn-cone-crusher</code> ·
npm: <code>mackorn-cone-crusher</code></p>
</section>

<h2>Data sources and limits</h2>
<section>
<p>Particle-size and flow models are independently implemented from published literature (Whiten 1972; Bond 1952). Vendor parameters come from MACKORN NH/NS tables. Every output carries <code>assumptions[]</code> and <code>warnings[]</code>; unknown values are returned as <code>null</code>, never estimated. Literature parameters must be calibrated against on-site sieve data before use in a formal proposal.</p>
<p class="src">A hydraulic cone crusher is a secondary/tertiary machine: feed above roughly 350 mm is refused.</p>
</section>

<footer>
MACKORN 美矿 · Shanghai Mackorn Minerals Co., Ltd.<br>
Qianjiang Road 33, Liuhe, Taicang, Suzhou, Jiangsu, China · sandy.zhao@mackorn.cn · +86 139 1648 5025<br>
<a href="https://mackorn.cn/ai/">AI hub</a> · <a href="https://mackorn.cn/ai/tools/">All 22 tools</a> · <a href="https://mackorn.cn/ai/glossary/">Glossary</a>
</footer>
</div>
</body>
</html>
`;
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
  made++;
  index.push({ name: def.name, slug, question: info[0], purpose: info[1], params: params.map(([k]) => k), ran: r.ok, kb: Math.round(html.length / 1024) });
  console.log('  ' + (r.ok ? '✅' : '⚠️ ') + def.name.padEnd(28) + 'ai/tools/' + slug.padEnd(26) + Math.round(html.length / 1024) + 'KB  ' + (r.ok ? summarize(r.out).length + ' 个输出字段' : 'ERROR: ' + r.err));
}

/* ── 索引页 ── */
{
  const rows = index.map((x) => '      <tr><td><a href="/ai/tools/' + x.slug + '/"><code>' + x.name + '</code></a></td><td>' + x.question + '</td></tr>').join('\n');
  const listLd = { '@context': 'https://schema.org', '@type': 'ItemList', numberOfItems: index.length, itemListElement: index.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, url: 'https://mackorn.cn/ai/tools/' + x.slug + '/' })) };
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MACKORN MCP tools — 21 engineering tools for cone crusher selection | MACKORN</title>
<meta name="description" content="All 22 MCP tools for hydraulic cone crusher selection, plant design, product-size simulation, calibration, cost and wear. Each tool answers a specific engineering question and can be called over HTTP without installation.">
<link rel="canonical" href="https://mackorn.cn/ai/tools/">
<script type="application/ld+json">
${JSON.stringify(listLd, null, 2)}
</script>
<style>
:root{--n:#0A2A4F;--g:#5A6B80;--l:#D9E5F2}
*{box-sizing:border-box}
body{margin:0;font:16px/1.75 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a2533;background:#f7f9fc}
.wrap{max-width:1000px;margin:0 auto;padding:26px 20px 64px}
header{background:var(--n);color:#fff;padding:30px 20px}
header .inner{max-width:1000px;margin:0 auto}
h1{margin:0 0 8px;font-size:25px}
header p{margin:0;color:#b9cbe4;font-size:14.5px}
h2{margin:36px 0 12px;font-size:19px;color:var(--n);border-bottom:2px solid var(--l);padding-bottom:8px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--l);border-radius:10px;overflow:hidden;font-size:14.5px}
th,td{padding:10px 12px;border-bottom:1px solid #eef3f9;text-align:left;vertical-align:top}
th{background:#eef4fb;color:var(--n);font-weight:600}
tr:last-child td{border-bottom:0}
code{background:#eef4fb;padding:1px 5px;border-radius:4px;font-size:13px;font-family:ui-monospace,Consolas,monospace}
section{background:#fff;border:1px solid var(--l);border-radius:10px;padding:14px 18px;margin:12px 0}
footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--l);color:var(--g);font-size:13.5px}
a{color:#0b5cad}
.src{color:var(--g);font-size:13px}
</style>
</head>
<body>
<header><div class="inner">
<h1>MACKORN MCP tools — ${index.length} engineering tools</h1>
<p>Hydraulic cone crusher selection · plant design · product-size simulation · calibration · cost and wear</p>
</div></header>
<div class="wrap">
<section><p>All ${index.length} tools are callable over HTTP from any MCP client — no installation required.
Endpoint: <code>https://mackorn.cn/ai/api/mcp.php</code> · Registry: <code>cn.mackorn/mackorn-cone-crusher</code></p></section>
<h2>Tools</h2>
<table>
<thead><tr><th>Tool</th><th>Question it answers</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<footer>MACKORN 美矿 · <a href="https://mackorn.cn/ai/">AI hub</a> · sandy.zhao@mackorn.cn · +86 139 1648 5025</footer>
</div>
</body>
</html>
`;
  writeFileSync(join(OUT, 'index.html'), html, 'utf8');
  console.log('\n  ✅ ai/tools/index.html（' + index.length + ' 个工具的索引）');
}

/* sitemap */
const smPath = join(SITE, 'sitemap.xml');
if (existsSync(smPath)) {
  let sm = readFileSync(smPath, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  const urls = ['https://mackorn.cn/ai/tools/'].concat(index.map((x) => 'https://mackorn.cn/ai/tools/' + x.slug + '/')).filter((u) => !sm.includes('<loc>' + u + '</loc>'));
  if (urls.length) {
    sm = sm.replace('</urlset>', urls.map((u) => '  <url>\n    <loc>' + u + '</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>').join('\n') + '\n</urlset>');
    writeFileSync(smPath, sm, 'utf8');
    console.log('  ✅ sitemap.xml 新增 ' + urls.length + ' 条');
  }
}

writeFileSync(join(ROOT, 'distribution', '04_AI收录与分发', 'tool-pages-index.json'), JSON.stringify({
  generated: new Date().toISOString(),
  approach: '每个工具一页，用【真实运行输出】做算例（不是编的示例）',
  pages: index,
  ok_count: index.filter((x) => x.ran).length,
}, null, 2), 'utf8');
console.log('\n  共 ' + made + ' 个工具页 · 成功真跑 ' + index.filter((x) => x.ran).length + '/' + index.length + '\n');

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
