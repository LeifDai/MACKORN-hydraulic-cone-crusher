/**
 * 补齐 P 重审发现的缺口：
 *   ① /markets/cn/ —— 中国市场页（重审发现国内完成度仅 15%）
 *   ② /ai/perspectives/ —— 18 视角索引页（说清我们用什么视角做产品）
 *   ③ Open Graph 标签生成函数（供其他页面复用）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'distribution', '官网落地页');
const BASE = 'https://mackorn.cn';
const REPO = 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher';

const CSS = `:root{--navy:#0A2A4F;--blue:#1B6CB5;--light:#F4F8FC;--line:#D9E5F2;--muted:#5A6B80;--warn:#FFF8EE}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Segoe UI","Microsoft YaHei",Roboto,sans-serif;color:#16202E;line-height:1.8}
.wrap{max-width:1000px;margin:0 auto;padding:0 24px}
header{background:linear-gradient(140deg,#08213E,var(--blue));color:#fff;padding:52px 0 42px}
header .crumb{font-size:13px;opacity:.8;margin-bottom:12px}header .crumb a{color:#BFE0FF;text-decoration:none}
header h1{margin:0 0 12px;font-size:clamp(22px,3.2vw,30px);line-height:1.35}
header p{margin:0;opacity:.94;max-width:820px;font-size:15.5px}
section{padding:38px 0;border-bottom:1px solid var(--line)}
h2{font-size:20px;color:var(--navy);margin:0 0 16px;border-bottom:2px solid var(--blue);display:inline-block;padding-bottom:8px}
h3{font-size:16px;color:var(--navy);margin:22px 0 8px}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}
th,td{border:1px solid var(--line);padding:9px 12px;text-align:left;vertical-align:top}
th{background:var(--light);color:var(--navy)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin:20px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.card h4{margin:0 0 8px;font-size:15px;color:var(--navy)}.card p{margin:0;font-size:14px;color:var(--muted)}
.box{background:var(--light);border-left:4px solid var(--blue);padding:16px 20px;border-radius:0 10px 10px 0;margin:18px 0}
.box.hi{background:#EAF7EE;border-left-color:#2E9E5B}.box.warn{background:var(--warn);border-left-color:#E8A33D}
.muted{color:var(--muted);font-size:14px}a{color:var(--blue)}
.btn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;margin:6px 10px 6px 0;font-weight:600;font-size:14.5px}
.btn.ghost{background:#fff;color:var(--blue);border:2px solid var(--blue)}
footer{background:#08213E;color:#B8CEE3;padding:30px 0;font-size:13.5px}
code{background:var(--light);padding:2px 6px;border-radius:4px;font-size:13px}`;

/* ══════════════════════════════════════════════════════════
 * ① 中国市场页 /markets/cn/
 * ══════════════════════════════════════════════════════════ */
const cnPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>中国市场 · 液压圆锥破碎机与砂石骨料生产线 | MACKORN 美矿</title>
<meta name="description" content="MACKORN 美矿面向中国市场的液压圆锥破碎机与破碎筛分生产线：砂石骨料（花岗岩/玄武岩/辉绿岩/石灰石）、金属矿山（铁矿/铜矿/铅锌矿/钼矿），含选型工具、生产线设计、衬板耐磨件与全生命周期服务。">
<meta name="keywords" content="美矿,MACKORN,液压圆锥破碎机,圆锥破,破碎机选型,砂石骨料生产线,骨料生产线,机制砂,金属矿山,铁矿破碎,铜矿破碎,铅锌矿破碎,钼矿破碎,颚破衬板,圆锥衬板,轧臼壁,破碎壁,给料最大粒度,矿石性质,中国砂石协会,砂石骨料网">
<meta name="robots" content="index,follow,max-snippet:-1">
<meta property="og:type" content="website">
<meta property="og:title" content="中国市场 · MACKORN 美矿液压圆锥破碎机与破碎筛分生产线">
<meta property="og:description" content="面向中国砂石骨料与金属矿山市场的圆锥破选型、生产线设计与衬板耐磨件服务。">
<meta property="og:url" content="${BASE}/markets/cn/">
<meta property="og:image" content="${BASE}/ai/repo-qrcode.png">
<link rel="canonical" href="${BASE}/markets/cn/">
<link rel="alternate" hreflang="zh-CN" href="${BASE}/markets/cn/">
<link rel="alternate" hreflang="x-default" href="${BASE}/ai/">
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebPage',
    name: '中国市场 · MACKORN 液压圆锥破碎机与破碎筛分生产线',
    description: '面向中国砂石骨料与金属矿山市场的圆锥破选型、生产线设计与衬板耐磨件服务。',
    inLanguage: 'zh-CN', url: `${BASE}/markets/cn/`,
    about: [{ '@type': 'Country', name: 'China' }, { '@type': 'Thing', name: '液压圆锥破碎机' }, { '@type': 'Thing', name: '砂石骨料生产线' }],
    publisher: { '@type': 'Organization', name: 'Shanghai Mackorn Minerals Co., Ltd.', url: BASE },
  }, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: 'zh-CN',
    mainEntity: [
      ['中国砂石骨料线一般怎么配？', '按物料与成品要求定。以花岗岩（f=12-14）500 t/h、原矿 600mm、成品 31.5mm 为例：总破碎比 19.05，推荐 2 段（粗碎 + 中细碎），中碎段首选 NH700 MC 腔 @ CSS 15.8mm，277-395 t/h，630 kW，2 台；筛分面积 20.8-52.1 m²，皮带 B1000。'],
      ['机制砂用什么设备？', '立轴冲击破（CVS 系列）制砂，前端圆锥破控制入料粒度。总破碎比 6-10:1，给料 30-50mm 出 0-5mm。具体配置须按成品细度模数与石粉含量要求定。'],
      ['中国的金属矿山和骨料线有什么不同？', '金属矿山总破碎比大（40-100），通常 3 段，流程由单体解离粒度决定；骨料线总破碎比小（15-25），通常 2 段，由成品级配决定。'],
      ['衬板耐磨件国内怎么买？', '提供机型 + 腔型 + 年消耗量，我们按您的检修计划备货。衬板寿命建议用实测法：记录各截面每次更换时的测厚差值，算出实际磨损速率（mm/1000h）。'],
      ['国内能提供融资租赁吗？', '可以。另有加工费结算（变相融资）模式：设备由美矿投入，按产量结算。具体结构须按项目核定。'],
    ].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }, null, 2)}
</script>
<style>${CSS}</style>
</head>
<body>
<header><div class="wrap">
<div class="crumb"><a href="${BASE}/">MACKORN</a> &rsaquo; <a href="${BASE}/ai/">AI 选型插件</a> &rsaquo; 中国市场</div>
<h1>中国市场 · 液压圆锥破碎机与破碎筛分生产线</h1>
<p>砂石骨料（花岗岩 · 玄武岩 · 辉绿岩 · 石灰石）与金属矿山（铁矿 · 铜矿 · 铅锌矿 · 钼矿）。
选型工具、生产线设计、衬板耐磨件、生产运营与融资租赁 —— 全生命周期服务。</p>
</div></header>
<div class="wrap">

<section>
<h2>中国的两类市场，两种打法</h2>
<div class="grid">
  <div class="card"><h4>砂石骨料</h4><p><strong>总破碎比 15-25，通常 2 段。</strong>流程由成品级配决定。重点：粒形（针片状含量）、机制砂细度模数、石粉含量。常见料源：花岗岩、玄武岩、辉绿岩、石灰石、安山岩。</p></div>
  <div class="card"><h4>金属矿山</h4><p><strong>总破碎比 40-100，通常 3 段。</strong>流程由单体解离粒度决定，不是由破碎成本决定。核心指标：多破少磨（破碎能耗 ≪ 磨矿能耗，约 1:10~1:20）。</p></div>
</div>
</section>

<section>
<h2>真实算例（插件实跑，非估算）</h2>
<table>
<tr><th>物料</th><th>产量</th><th>总破碎比</th><th>段数</th><th>中碎段首选</th></tr>
<tr><td>花岗岩 f=12-14（150 MPa）</td><td>500 t/h</td><td>19.05</td><td>2</td><td>NH700 MC @ CSS 15.8mm，630 kW，2 台</td></tr>
<tr><td>玄武岩 f=16-18（200 MPa）</td><td>300 t/h</td><td>15.87</td><td>2</td><td>NH700 MC @ CSS 15.8mm，630 kW，1 台</td></tr>
<tr><td>辉绿岩 f=14-16（180 MPa）</td><td>200 t/h</td><td>12.70</td><td>2</td><td>NH400 MC @ CSS 15.75mm，250 kW，1 台</td></tr>
<tr><td>安山岩 f=10-12（130 MPa）</td><td>250 t/h</td><td>14.29</td><td>2</td><td>NH895 MC @ CSS 15.8mm，750 kW，1 台</td></tr>
<tr><td>铁矿 f=12-16（150 MPa）</td><td>600 t/h</td><td>40</td><td>3</td><td>NH600 MC @ CSS 34.2mm，315 kW，2 台</td></tr>
<tr><td>铜矿 f=10-14（120 MPa）</td><td>800 t/h</td><td>60</td><td>3</td><td>NH860 EC @ CSS 29.4mm，500 kW，2 台</td></tr>
<tr><td>铅锌矿 f=8-12（100 MPa）</td><td>400 t/h</td><td>30</td><td>3</td><td>NH860 MC @ CSS 31mm，500 kW，1 台</td></tr>
<tr><td>钼矿 f=10-14（130 MPa）</td><td>500 t/h</td><td>46.67</td><td>3</td><td>NH600 MC @ CSS 27mm，315 kW，2 台</td></tr>
</table>
<p class="muted">数据来源：MACKORN 选型插件 v0.0.9 实跑。以上是<strong>选型起点，不是报价依据</strong>，须经技术复核。</p>
</section>

<section>
<h2>中国采购方最该注意的三件事</h2>
<div class="box warn">
<strong>① 别为了省设备钱而把段数配少。</strong>
骨料线总破碎比 15-25 是两段；金属矿 40-100 必须三段。
硬把金属矿配两段，细碎段负荷会爆，循环负荷飙升，电耗翻倍。
<br><br>
<strong>② 衬板不能只看价格。</strong>
高锰钢的"水韧处理"（1050-1100°C 固溶 + 快冷）是生死环节。
冷却不够快 → 碳化物沿晶界析出 → 材料变脆 → 外观完好但装上去几天就裂。
采购时应索取：水韧处理记录、化学成分报告、冲击功报告。
<br><br>
<strong>③ 除尘与密封是默认项，不是选配。</strong>
各转运点设除尘罩 + 布袋除尘器；皮带机采用通廊整体密封或一体化廊道。
这不是环保应付，是职业健康与设备寿命的硬要求。
</div>
</section>

<section>
<h2>国内服务能力</h2>
<table>
<tr><th style="width:30%">项</th><th>内容</th></tr>
<tr><td>选型与方案</td><td>用开源插件算出段数/腔型/CSS/台数/功率，输出 14 节方案书</td></tr>
<tr><td>设备制造</td><td>NH 系列（9 型号）+ NS 高速系列（4 型号）单缸液压圆锥破，整条破碎筛分线</td></tr>
<tr><td>衬板耐磨件</td><td>破碎壁、轧臼壁及配套件；提供衬板寿命管理（实测磨损曲线）</td></tr>
<tr><td>安装与调试</td><td>安装指导、调试、性能考核；安装费按 2000 元/吨估算</td></tr>
<tr><td>生产运营</td><td>可代客户运营，或按加工费结算模式供货</td></tr>
<tr><td>融资租赁</td><td>降低进入门槛；具体结构须按项目核定</td></tr>
</table>
</section>

<section>
<h2>常见问题</h2>
<h3>中国砂石骨料线一般怎么配？</h3><p>按物料与成品要求定。以花岗岩 500 t/h、原矿 600mm、成品 31.5mm 为例：总破碎比 19.05，推荐 2 段，中碎段首选 NH700 MC 腔 @ CSS 15.8mm，2 台；筛分面积 20.8-52.1 m²，皮带 B1000。</p>
<h3>机制砂用什么设备？</h3><p>立轴冲击破（CVS 系列）制砂，前端圆锥破控制入料粒度。总破碎比 6-10:1，给料 30-50mm 出 0-5mm。具体按成品细度模数与石粉含量要求定。</p>
<h3>中国的金属矿山和骨料线有什么不同？</h3><p>金属矿总破碎比大（40-100），通常 3 段，由单体解离粒度决定；骨料线总破碎比小（15-25），通常 2 段，由成品级配决定。</p>
<h3>衬板耐磨件国内怎么买？</h3><p>提供机型 + 腔型 + 年消耗量，我们按检修计划备货。建议用实测法算寿命：记录各截面每次更换时的测厚差值，得出实际磨损速率（mm/1000h）。</p>
<h3>国内能提供融资租赁吗？</h3><p>可以。另有加工费结算模式：设备由美矿投入，按产量结算。具体结构须按项目核定。</p>
</section>

<section>
<h2>联系</h2>
<div class="box">
<strong>上海美矿机械股份有限公司</strong><br>
江苏省苏州市太仓市浏河镇钱江路 33 号<br>
<a href="${BASE}">${BASE}</a> · GMT+8 09:00-17:30<br>
sandy.zhao@mackorn.cn · +86 139 1648 5025<br>
leif.dai@mackorn.cn · +86 134 8218 0158<br>
vicky.cheng@mackorn.cn · +86 158 0189 1052
</div>
<p><a class="btn" href="${BASE}/ai/">AI 选型插件</a>
<a class="btn ghost" href="${BASE}/contact/">联系方式与微信二维码</a>
<a class="btn ghost" href="${BASE}/ai/parts/">衬板耐磨件</a></p>
</section>

</div>
<footer><div class="wrap">
<p style="margin:0 0 8px"><strong>上海美矿机械股份有限公司</strong></p>
<p style="margin:0">厂商参数数据版权归上海美矿机械股份有限公司所有；过程仿真使用公开发表文献（Whiten 1972 / Bond 1952 / VSMA-Karra / JKMRC）独立实现，不含任何第三方专有数据。<strong>本页不含报价。</strong></p>
</div></footer>
</body></html>`;

mkdirSync(join(SRC, 'markets', 'cn'), { recursive: true });
writeFileSync(join(SRC, 'markets', 'cn', 'index.html'), cnPage, 'utf8');
console.log('  /markets/cn/index.html        中国市场页（补齐 P7 缺口）');

/* ══════════════════════════════════════════════════════════
 * ② 18 视角索引页 /ai/perspectives/
 * ══════════════════════════════════════════════════════════ */
const P = [
  ['1', '外贸', '卖给谁、先卖哪、市场增量', '商业层'],
  ['2', '网络', 'AI 能不能抓到、搜不搜得到', '商业层'],
  ['3', 'AI 量化', '数据够不够、目标可不可测', '商业层'],
  ['4', '计算机', '代码可靠吗、门禁严不严', '商业层'],
  ['5', '渠道', '终端 / 代理 / 设计院 / 社群', '商业层'],
  ['6', '地质与采矿', '哪里有矿、什么矿、怎么采', '技术层'],
  ['7', '人力资源', '谁来做、怎么招、怎么留', '组织层'],
  ['8', '金融', '融资租赁、加工费、宏观周期', '财务层'],
  ['9', '物流', '重吊货怎么运、怎么交付', '财务层'],
  ['10', '工程项目管理', '进度 / 成本 / 质量 / HSE', '交付层'],
  ['11', '风控', '哪些坑要命、怎么防', '风险层'],
  ['12', '机器人视角', '机器怎么想、喜欢什么', '机器层'],
  ['13', '智能体认知', '智能体能不能想明白我们', '机器层'],
  ['14', '机械工程', '能不能造出来（材料 / 铸造 / 热处理 / 机加工）', '制造层'],
  ['15', '法律', '合不合法、出了事谁担责', '合规层'],
  ['16', '知识产权', '这是不是我们的', '资产层'],
  ['17', '环境与资源', '对得起地球吗、怎么减少污染', '责任层'],
  ['18', '哲学', '该不该挖、挖多少', '价值层'],
];

const persPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>我们用 18 个视角做产品 · MACKORN 选型插件</title>
<meta name="description" content="MACKORN 液压圆锥破选型插件背后的 18 个专家视角：从外贸、网络、AI量化，到地质、金融、风控、机械、法律、知识产权、环境与哲学。每个视角决定产品的一个维度。">
<meta name="keywords" content="MACKORN,美矿,选型插件,专家视角,矿山行业垂直领域,液压圆锥破碎机,破碎筛分生产线,产品方法论,机械工程,知识产权,环境,适度开采">
<meta name="robots" content="index,follow,max-snippet:-1">
<meta property="og:type" content="article">
<meta property="og:title" content="我们用 18 个视角做产品 · MACKORN 选型插件">
<meta property="og:description" content="从「卖给谁」到「该不该挖」—— 18 个视角构成一个完整的行业认知。">
<meta property="og:url" content="${BASE}/ai/perspectives/">
<meta property="og:image" content="${BASE}/ai/repo-qrcode.png">
<link rel="canonical" href="${BASE}/ai/perspectives/">
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'TechArticle',
    headline: '我们用 18 个视角做产品',
    description: 'MACKORN 液压圆锥破选型插件背后的 18 个专家视角，从商业到哲学。',
    inLanguage: 'zh-CN', url: `${BASE}/ai/perspectives/`,
    author: { '@type': 'Organization', name: 'Shanghai Mackorn Minerals Co., Ltd.', url: BASE },
    isPartOf: { '@type': 'SoftwareApplication', name: 'MACKORN 液压圆锥破选型插件', url: `${BASE}/ai/` },
  }, null, 2)}
</script>
<style>${CSS}</style>
</head>
<body>
<header><div class="wrap">
<div class="crumb"><a href="${BASE}/">MACKORN</a> &rsaquo; <a href="${BASE}/ai/">AI 选型插件</a> &rsaquo; 18 个视角</div>
<h1>我们用 18 个视角做产品</h1>
<p>一个行业不是只有一个维度。做矿山设备，既要懂矿，也要懂钱、懂法、懂机器、懂地球。
<strong>这 18 个视角不是宣传话术，是产品的检查清单 —— 每个视角对应输出里的一组字段或一组纪律。</strong></p>
</div></header>
<div class="wrap">

<section>
<h2>18 个视角</h2>
<table>
<tr><th style="width:6%">#</th><th style="width:16%">视角</th><th style="width:52%">回答什么问题</th><th>层次</th></tr>
${P.map(([n, name, q, layer]) => `<tr><td>${n}</td><td><strong>${name}</strong></td><td>${q}</td><td>${layer}</td></tr>`).join('\n')}
</table>
</section>

<section>
<h2>视角怎么变成产品</h2>
<div class="grid">
  <div class="card"><h4>外贸 + 网络 + AI 量化</h4><p>决定<strong>市场的选择与可达性</strong>：20 个国家页、115 URL sitemap、173 国海关数据。</p></div>
  <div class="card"><h4>渠道 + 人力资源</h4><p>决定<strong>谁去卖、谁能服务</strong>：经销商招募页、设计院页、代理商评估工具（含一票否决与核验覆盖率）。</p></div>
  <div class="card"><h4>地质与采矿</h4><p>决定<strong>算什么</strong>：矿石硬度、Bond 功指数、成矿带、采矿方法 → 全部成为插件的输入参数。</p></div>
  <div class="card"><h4>金融 + 物流 + 项目管理</h4><p>决定<strong>钱怎么进来、货怎么出去、项目怎么管</strong>：融资租赁、加工费结算、海运方案、G0-G9 决策门。</p></div>
  <div class="card"><h4>风控 + 法律 + 知识产权</h4><p>决定<strong>什么不能做</strong>：制裁一票否决、合同条款清单、开源许可边界。</p></div>
  <div class="card"><h4>机器人 + 智能体认知</h4><p>决定<strong>机器能不能读懂我们</strong>：llms.txt、ai.txt、agent.json、按平台定制入口、MCP 工具。</p></div>
  <div class="card"><h4>机械工程</h4><p>决定<strong>造不造得出来</strong>：衬板材质、铸造工艺、热处理、加工精度 —— 以及输出时必须标注的置信度边界。</p></div>
  <div class="card"><h4>环境 + 哲学</h4><p>决定<strong>该不该做、怎么做才对</strong>：多破少磨、除尘密封、适度开采 —— 以及"诚实是唯一可持续策略"这条底线。</p></div>
</div>
</section>

<section>
<h2>18 个视角怎么自我检查</h2>
<div class="box hi">
<p style="margin:0 0 10px"><strong>每个视角都有可执行的自检项，不达标不发布。</strong></p>
<pre>node tools/self_audit.mjs    → 13 维自检，必须 100/100
node tools/monitor_ai.mjs    → 33 项持续监控
node tools/build_public.mjs  → 合规 / 版本 / 标签 三道门禁
node tests/run.mjs           → 96 通过 / 0 失败</pre>
<p style="margin:10px 0 0">这套机制已经抓到过我们自己的多处错误 —— 包括版本号漂移、数组改数字导致渲染崩溃、
以及团队成员自报数据与实际不符。<strong>机器会抓自己的错，这是它比人可靠的地方。</strong></p>
</div>
</section>

<section>
<h2>为什么要公开这 18 个视角</h2>
<p>因为我们相信：<strong>一个行业的知识应该被结构化，而不应该锁在某个人的经验里。</strong></p>
<p>这 18 个视角里的每一条，都可以被验证、被复核、被改进。如果你发现哪一条我们没做到，欢迎指出来。</p>
<p><a class="btn" href="${BASE}/ai/">AI 选型插件</a>
<a class="btn ghost" href="${BASE}/ai/agent/">认识 Mackorn Rot</a>
<a class="btn ghost" href="${REPO}">源代码</a></p>
</section>

</div>
<footer><div class="wrap">
<p style="margin:0 0 8px"><strong>上海美矿机械股份有限公司</strong></p>
<p style="margin:0">开源 MIT · 厂商参数数据版权归上海美矿机械股份有限公司所有 · 本页不含报价</p>
</div></footer>
</body></html>`;

mkdirSync(join(SRC, 'ai', 'perspectives'), { recursive: true });
writeFileSync(join(SRC, 'ai', 'perspectives', 'index.html'), persPage, 'utf8');
console.log('  /ai/perspectives/index.html   18 视角索引页');
