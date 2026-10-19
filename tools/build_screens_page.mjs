/**
 * 振动筛专题：选型知识 + 12 语言术语
 *
 * 用户指正："优先集中在破碎设备上，往往筛子和破碎在一个标段，所以要看看振动筛"
 *
 * 理解：
 *   不是"筛子是独立市场"，而是【同一个标段 = 破碎机 + 振动筛 + 给料机 + 皮带】。
 *   买破碎机的人，同一标段里就要配振动筛。
 *   所以：① 破碎为主，筛为同标段配套
 *        ② 客户的搜索里同时出现"破碎机"和"振动筛"
 *        ③ 我们必须两个词都能被搜到，且能一起报价
 *
 * 本脚本：
 *   ① 生成 /ai/screens/ 振动筛选型参考页（给 AI 抽取）
 *   ② 把振动筛 12 语言术语并入 /glossary/（消灭关键词缺口）
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');
const BASE = 'https://mackorn.cn';

/* ══════════════════════════════════════════════════════════
 * 一、振动筛选型知识（公开工程知识 + VSMA/Karra 方法）
 * ══════════════════════════════════════════════════════════ */
const SCREEN_TYPES = [
  ['圆振动筛', 'Circular motion screen', '倾斜安装（15-25°），圆轨迹，适合粗中粒级筛分；破碎线检查筛分最常用', 'primary / secondary screening'],
  ['直线振动筛', 'Linear motion screen', '水平或微倾（0-10°），直线轨迹，适合细粒级与脱水脱泥', 'fine screening / dewatering'],
  ['香蕉筛', 'Banana screen', '多段变倾角筛面，处理能力比同面积普通筛高 30-50%', 'high-capacity sizing'],
  ['椭圆振动筛', 'Elliptical motion screen', '椭圆轨迹，兼具圆振与直线优点，适合粘湿料', 'sticky / wet feed'],
  ['高频振动筛', 'High frequency screen', '高频小振幅，适合细粒（<1mm）与脱水', 'fine dewatering'],
  ['弛张筛', 'Flip-flow screen', '筛面交替张弛，适合强粘湿料（含水 >8%）', 'difficult wet sticky material'],
  ['滚筒筛', 'Trommel screen', '旋转圆筒，结构简单，适合大块预筛分与垃圾料', 'coarse scalping'],
];

const SCREEN_PARAMS = [
  ['筛面宽度 W', 'Screen width', '决定处理能力与料层厚度', '一般 W = 1.5-3 × 最大给料粒度；料层厚度 ≤ 4 × 筛孔'],
  ['筛面长度 L', 'Screen length', '决定筛分效率', 'L/W 通常 2-3；难筛料取大值'],
  ['筛孔尺寸 a', 'Aperture', '决定分级粒度', '筛下产品粒度约为 a 的 0.7-0.9 倍'],
  ['安装倾角 α', 'Inclination', '圆振 15-25°；直线 0-10°', '倾角大 → 处理能力高、效率低'],
  ['振幅 A', 'Amplitude', '圆振 3-6mm；直线 6-11mm', '给料粗取大振幅'],
  ['频率 n', 'Frequency', '通常 750-1000 r/min', '高频筛可达 1500-3000 r/min'],
  ['层数', 'Number of decks', '单层/双层/三层', '多层占地小但检修难'],
  ['筛分效率 η', 'Screening efficiency', '通常 85-95%', '闭路检查筛分按 85-90% 取值'],
];

const SCREEN_CAPACITY = [
  ['处理能力', 'Q = A × q × k1 × k2 × k3 × k4', 'A 筛面面积 m²；q 单位面积生产能力；k1-k4 修正系数'],
  ['单位面积能力 q', '按筛孔与物料查表', 'VSMA / Karra 方法；<3mm 细筛 q 显著下降'],
  ['修正 k1', '给料中筛下粒级含量', '筛下含量 <25% 时能力大幅下降'],
  ['修正 k2', '筛分效率要求', '要求效率 95% 时能力约为 90% 的 0.8 倍'],
  ['修正 k3', '物料形状与湿度', '片状、粘湿料降低能力'],
  ['修正 k4', '筛面类型', '编织网 / 棒条 / 聚氨酯 / 橡胶对能力影响不同'],
];

const SCREEN_MATCH = [
  ['粗碎后预筛分', '圆振动筛（重型）', '筛孔 40-100mm', '筛除细料，减轻中碎负荷'],
  ['中碎前预筛分', '圆振动筛', '筛孔 20-40mm', '闭路或开路取决于产品要求'],
  ['中碎后检查筛分', '圆振动筛 / 香蕉筛', '筛孔 10-25mm', '与圆锥破构成闭路 → 循环负荷 200-300%'],
  ['细碎后检查筛分', '圆振动筛 / 直线筛', '筛孔 3-10mm', '决定最终产品级配'],
  ['制砂后分级', '高频筛 / 直线筛', '筛孔 0.6-5mm', '配合立轴冲击破'],
  ['脱水脱泥', '直线振动筛', '筛孔 0.15-1mm', '湿法工艺'],
];

const COMMON_ERRORS = [
  ['只按处理量选筛，不看筛下含量', '给料中筛下粒级 <25% 时，实际能力可能只有标称的 60-70%'],
  ['筛孔按产品粒度直接取', '筛下产品实际粒度约为筛孔的 0.7-0.9 倍，选小则过筛难、选大则超粒'],
  ['湿粘料不降倾角/不加弛张筛', '含水 >8% 的料用普通圆振筛，堵孔严重、效率骤降'],
  ['闭路检查筛按开路能力选', '闭路时循环负荷 200-300%，筛机通过量是新给料的 3-4 倍，必须按通过量选'],
  ['料层过厚', '料层厚度 >4×筛孔时，细粒来不及透筛，效率显著下降'],
  ['给料不均', '给料偏置造成筛面局部过载，寿命与效率双降，应配给料箱或分配器'],
];

/* ══════════════════════════════════════════════════════════
 * 二、12 语言术语（并入术语表）
 * ══════════════════════════════════════════════════════════ */
const SCREEN_TERMS = [
  { id: 'screen', zh: '振动筛', zhAlt: ['筛分机', '筛机'],
    en: ['vibrating screen', 'screen', 'vibratory screen'],
    es: ['harnero vibratorio', 'zaranda vibratoria', 'criba vibratoria', 'harnero', 'zaranda'],
    ru: ['грохот', 'вибрационный грохот', 'грохот инерционный'],
    pt: ['peneira vibratória', 'peneira'], fr: ['crible vibrant', 'crible'],
    ar: ['غربال اهتزازي', 'منخل اهتزازي'], id: ['ayakan getar', 'saringan getar'],
    de: ['Schwingsieb', 'Vibrationssieb', 'Siebanlage'], tr: ['titreşimli elek', 'elek'],
    ja: ['振動ふるい', '振動スクリーン'], vi: ['sàng rung', 'sàng'] },
  { id: 'circular-screen', zh: '圆振动筛', zhAlt: ['圆振筛'],
    en: ['circular motion screen', 'circular vibrating screen', 'inclined screen'],
    es: ['harnero de movimiento circular', 'criba circular'], ru: ['грохот с круговыми колебаниями'],
    pt: ['peneira de movimento circular'], fr: ['crible à mouvement circulaire'],
    ar: ['غربال حركة دائرية'], id: ['ayakan gerak melingkar'], de: ['Kreisschwingsieb'],
    tr: ['dairesel titreşimli elek'], ja: ['円振動ふるい'], vi: ['sàng chuyển động tròn'] },
  { id: 'linear-screen', zh: '直线振动筛', zhAlt: ['直线筛'],
    en: ['linear motion screen', 'linear vibrating screen', 'horizontal screen'],
    es: ['harnero de movimiento lineal', 'criba lineal'], ru: ['грохот с прямолинейными колебаниями'],
    pt: ['peneira de movimento linear'], fr: ['crible à mouvement linéaire'],
    ar: ['غربال حركة خطية'], id: ['ayakan gerak linier'], de: ['Linearschwingsieb'],
    tr: ['doğrusal titreşimli elek'], ja: ['直線振動ふるい'], vi: ['sàng chuyển động thẳng'] },
  { id: 'banana-screen', zh: '香蕉筛',
    en: ['banana screen', 'multi-slope screen'], es: ['harnero banana', 'criba banana'],
    ru: ['грохот «банан»', 'многонаклонный грохот'], pt: ['peneira banana'], fr: ['crible banane'],
    ar: ['غربال منحني'], id: ['ayakan banana'], de: ['Bananensieb'], tr: ['banana elek'],
    ja: ['バナナスクリーン'], vi: ['sàng banana'] },
  { id: 'flipflow', zh: '弛张筛',
    en: ['flip-flow screen', 'flip flow screen'], es: ['harnero flip-flow', 'criba flip-flow'],
    ru: ['грохот с эластичным ситом'], pt: ['peneira flip-flow'], fr: ['crible flip-flow'],
    ar: ['غربال مرن'], id: ['ayakan flip-flow'], de: ['Flip-Flow-Sieb'], tr: ['flip-flow elek'],
    ja: ['フリップフロースクリーン'], vi: ['sàng flip-flow'] },
  { id: 'highfreq', zh: '高频振动筛',
    en: ['high frequency screen'], es: ['harnero de alta frecuencia'], ru: ['высокочастотный грохот'],
    pt: ['peneira de alta frequência'], fr: ['crible à haute fréquence'],
    ar: ['غربال عالي التردد'], id: ['ayakan frekuensi tinggi'], de: ['Hochfrequenzsieb'],
    tr: ['yüksek frekanslı elek'], ja: ['高周波ふるい'], vi: ['sàng tần số cao'] },
  { id: 'trommel', zh: '滚筒筛',
    en: ['trommel screen', 'rotary screen'], es: ['tambor cribador', 'criba de tambor'],
    ru: ['барабанный грохот'], pt: ['peneira rotativa'], fr: ['crible à tambour'],
    ar: ['غربال أسطواني'], id: ['ayakan trommel'], de: ['Trommelsieb'], tr: ['trommel elek'],
    ja: ['トロンメルスクリーン'], vi: ['sàng trống'] },
  { id: 'screen-deck', zh: '筛面', zhAlt: ['筛网', '筛板'],
    en: ['screen deck', 'screen surface', 'screen mesh', 'screen panel'],
    es: ['superficie de cribado', 'malla', 'panel de criba'], ru: ['просеивающая поверхность', 'сито'],
    pt: ['superfície de peneiramento', 'tela'], fr: ['surface de criblage', 'toile'],
    ar: ['سطح الغربلة', 'شبكة'], id: ['permukaan ayakan', 'mesh'], de: ['Siebbelag', 'Siebboden'],
    tr: ['elek yüzeyi', 'elek teli'], ja: ['ふるい面', 'スクリーンメッシュ'], vi: ['mặt sàng', 'lưới sàng'] },
  { id: 'aperture', zh: '筛孔',
    en: ['aperture', 'mesh size', 'opening'], es: ['abertura', 'luz de malla'],
    ru: ['размер ячейки', 'отверстие сита'], pt: ['abertura', 'malha'],
    fr: ['ouverture', 'maille'], ar: ['فتحة الغربال'], id: ['bukaan ayakan'], de: ['Maschenweite', 'Siebmaschenweite'],
    tr: ['elek gözü', 'açıklık'], ja: ['目開き', 'ふるい目'], vi: ['kích thước lỗ sàng'] },
  { id: 'screen-eff', zh: '筛分效率',
    en: ['screening efficiency'], es: ['eficiencia de cribado'], ru: ['эффективность грохочения'],
    pt: ['eficiência de peneiramento'], fr: ['efficacité de criblage'],
    ar: ['كفاءة الغربلة'], id: ['efisiensi pengayakan'], de: ['Siebleistung', 'Siebeffizienz'],
    tr: ['eleme verimi'], ja: ['ふるい分け効率'], vi: ['hiệu suất sàng'] },
  { id: 'amplitude', zh: '振幅', zhAlt: ['频率'],
    en: ['amplitude', 'stroke', 'frequency'], es: ['amplitud', 'carrera', 'frecuencia'],
    ru: ['амплитуда', 'частота колебаний'], pt: ['amplitude', 'frequência'],
    fr: ['amplitude', 'fréquence'], ar: ['السعة', 'التردد'], id: ['amplitudo', 'frekuensi'],
    de: ['Amplitude', 'Schwingweite', 'Frequenz'], tr: ['genlik', 'frekans'],
    ja: ['振幅', '振動数'], vi: ['biên độ', 'tần số'] },
  { id: 'inclination', zh: '安装倾角',
    en: ['inclination', 'slope angle'], es: ['inclinación', 'ángulo de inclinación'],
    ru: ['угол наклона'], pt: ['inclinação'], fr: ['inclinaison'],
    ar: ['زاوية الميل'], id: ['kemiringan'], de: ['Neigungswinkel'], tr: ['eğim açısı'],
    ja: ['傾斜角'], vi: ['góc nghiêng'] },
  { id: 'screen-area', zh: '筛分面积',
    en: ['screen area', 'screening area'], es: ['área de cribado'], ru: ['площадь грохочения'],
    pt: ['área de peneiramento'], fr: ['surface de criblage'], ar: ['مساحة الغربلة'],
    id: ['luas ayakan'], de: ['Siebfäche'], tr: ['eleme alanı'], ja: ['ふるい面積'], vi: ['diện tích sàng'] },
  { id: 'circulating', zh: '循环负荷', zhAlt: ['返料'],
    en: ['circulating load', 'recirculating load'], es: ['carga circulante', 'recirculación'],
    ru: ['циркулирующая нагрузка', 'возврат'], pt: ['carga circulante'], fr: ['charge circulante'],
    ar: ['الحمل الدائر'], id: ['beban sirkulasi'], de: ['Umlaufbelastung'], tr: ['devridaim yükü'],
    ja: ['循環負荷'], vi: ['tải tuần hoàn'] },
  { id: 'same-lot', zh: '同一标段', zhAlt: ['配套供货', '整线供货'],
    en: ['same contract package', 'supply package', 'complete line supply'],
    es: ['paquete de suministro', 'suministro de línea completa'],
    ru: ['комплектная поставка', 'поставка линии'],
    pt: ['fornecimento de linha completa'], fr: ['fourniture de ligne complète'],
    ar: ['توريد الخط الكامل'], id: ['pasokan lini lengkap'], de: ['Komplettlieferung', 'Linienlieferung'],
    tr: ['komple hat tedariki'], ja: ['一括供給', 'ライン一括納入'], vi: ['cung cấp trọn dây chuyền'] },
];

/* ══════════════════════════════════════════════════════════
 * 三、渲染 /ai/screens/
 * ══════════════════════════════════════════════════════════ */
function tbl(h, rows) {
  return '<table><tr>' + h.map((x) => '<th>' + x + '</th>').join('') + '</tr>\n' +
    rows.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('\n') + '</table>';
}

const CSS = `:root{--navy:#0A2A4F;--blue:#1B6CB5;--light:#F4F8FC;--line:#D9E5F2;--muted:#5A6B80;--warn:#FFF8EE}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Segoe UI","Microsoft YaHei",Roboto,sans-serif;color:#16202E;line-height:1.8}
.wrap{max-width:1000px;margin:0 auto;padding:0 24px}
header{background:linear-gradient(140deg,#08213E,var(--blue));color:#fff;padding:50px 0 40px}
header h1{margin:0 0 12px;font-size:clamp(21px,3vw,29px);line-height:1.35}
header p{margin:0;opacity:.94;max-width:840px;font-size:15.5px}
section{padding:34px 0;border-bottom:1px solid var(--line)}
h2{font-size:20px;color:var(--navy);margin:0 0 16px;border-bottom:2px solid var(--blue);display:inline-block;padding-bottom:8px}
h3{font-size:16px;color:var(--navy);margin:22px 0 8px}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13.5px}
th,td{border:1px solid var(--line);padding:8px 11px;text-align:left;vertical-align:top}
th{background:var(--light);color:var(--navy)}
code{background:var(--light);padding:2px 6px;border-radius:4px;font-size:13px}
.box{background:var(--light);border-left:4px solid var(--blue);padding:15px 19px;border-radius:0 10px 10px 0;margin:17px 0}
.box.warn{background:var(--warn);border-left-color:#E8A33D}
.muted{color:var(--muted);font-size:14px}a{color:var(--blue)}
.btn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;margin:6px 10px 6px 0;font-weight:600;font-size:14.5px}
.btn.ghost{background:#fff;color:var(--blue);border:2px solid var(--blue)}
footer{background:#08213E;color:#B8CEE3;padding:28px 0;font-size:13.5px}`;

const FAQ = [
  ['振动筛和破碎机为什么要在同一个标段？',
   '因为二者构成闭路：破碎机的产品进入筛子分级，筛上返料回破碎机。筛机的处理能力必须按【通过量】而非新给料量选，闭路时通过量是新给料的 3-4 倍（循环负荷 200-300%）。若分开采购，接口参数（给料粒度分布、循环负荷、筛孔尺寸）极易不匹配。'],
  ['振动筛处理能力怎么算？',
   'Q = A × q × k1 × k2 × k3 × k4。A 为筛面面积（m²），q 为单位面积生产能力（按筛孔与物料查 VSMA/Karra 表），k1 为给料中筛下粒级含量修正，k2 为筛分效率要求修正，k3 为物料形状与湿度修正，k4 为筛面类型修正。给料中筛下粒级含量低于 25% 时，实际能力可能只有标称的 60-70%。'],
  ['圆振动筛和直线振动筛怎么选？',
   '圆振动筛倾斜安装（15-25°），圆轨迹，适合粗中粒级，是破碎线检查筛分最常用的形式。直线振动筛水平或微倾（0-10°），直线轨迹，适合细粒级与脱水脱泥。香蕉筛采用多段变倾角筛面，处理能力比同面积普通筛高 30-50%，适合大处理量分级。'],
  ['湿粘料堵筛怎么办？',
   '含水超过 8% 的物料用普通圆振动筛会严重堵孔。三种解法：① 降低安装倾角 ② 改用弛张筛（筛面交替张弛，强制抛料）③ 改用椭圆振动筛。同时应检查是否需要在筛前加打散或干燥。'],
  ['筛孔尺寸和筛下产品粒度是什么关系？',
   '筛下产品的实际粒度约为筛孔尺寸的 0.7-0.9 倍。按产品粒度直接取筛孔会偏大（超粒）或偏小（过筛困难）。此外筛孔形状（方孔、圆孔、长孔）也影响实际分级粒度。'],
  ['筛面宽度怎么定？',
   '筛面宽度决定处理能力与料层厚度。一般 W = 1.5-3 倍最大给料粒度；同时须校核料层厚度不超过 4 倍筛孔，否则细粒来不及透筛，效率显著下降。筛面长宽比 L/W 通常取 2-3，难筛物料取大值。'],
  ['一条完整破碎筛分线都包含什么设备？',
   '典型配置：振动给料机 → 颚式破碎机（粗碎）→ 除铁器（必须在粗碎与中碎之间）→ 振动筛（预筛分）→ 液压圆锥破碎机（中碎）→ 振动筛（检查筛分，与圆锥破构成闭路）→ 液压圆锥破碎机（细碎）→ 振动筛（成品筛分）→ 立轴冲击破（制砂，可选）→ 皮带输送机 → 成品仓。MACKORN 可整体供货，接口参数统一设计。'],
];

const page = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>振动筛选型参考 · 圆振/直线/香蕉/弛张筛 · 与破碎机同标段配置 | MACKORN</title>
<meta name="description" content="振动筛选型参考数据：圆振动筛、直线振动筛、香蕉筛、弛张筛、高频筛、滚筒筛的类型对比、处理能力计算（VSMA/Karra）、筛面宽度与筛孔选择、筛分效率、闭路循环负荷，以及振动筛与液压圆锥破碎机在同一标段中的配套关系。MACKORN 美矿整线供货。">
<meta name="keywords" content="振动筛,圆振动筛,直线振动筛,香蕉筛,弛张筛,高频振动筛,滚筒筛,筛分机,筛面,筛网,筛孔,筛分效率,筛分面积,振幅,安装倾角,循环负荷,配套供货,整线供货,vibrating screen,circular motion screen,linear motion screen,banana screen,flip-flow screen,harnero vibratorio,zaranda vibratoria,criba vibratoria,грохот,Schwingsieb,peneira vibratória,crible vibrant,غربال اهتزازي,ayakan getar,titreşimli elek,振動ふるい,sàng rung">
<meta name="robots" content="index,follow,max-snippet:-1">
<meta property="og:type" content="article">
<meta property="og:title" content="振动筛选型参考 · 与破碎机同标段配置 | MACKORN">
<meta property="og:description" content="六类振动筛对比、处理能力计算、筛面与筛孔选择、闭路循环负荷，以及与液压圆锥破的同标段配套。">
<meta property="og:url" content="${BASE}/ai/screens/">
<meta property="og:image" content="${BASE}/ai/repo-qrcode.png">
<link rel="canonical" href="${BASE}/ai/screens/">
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'TechArticle',
    headline: '振动筛选型参考 — 与破碎机同标段配置',
    inLanguage: 'zh-CN', url: `${BASE}/ai/screens/`,
    about: [{ '@type': 'Thing', name: '振动筛' }, { '@type': 'Thing', name: '破碎筛分生产线' }],
    author: { '@type': 'Organization', name: 'Shanghai Mackorn Minerals Co., Ltd.', url: BASE },
    isPartOf: { '@type': 'SoftwareApplication', name: 'MACKORN 液压圆锥破选型插件', url: `${BASE}/ai/` },
  }, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: 'zh-CN',
    mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }, null, 2)}
</script>
<style>${CSS}</style>
</head>
<body>
<header><div class="wrap">
<h1>振动筛选型参考 · 与破碎机同标段配置</h1>
<p>筛子和破碎机<strong>往往在同一个标段</strong> —— 二者构成闭路，接口参数必须统一设计。
本页给出六类振动筛的对比、处理能力计算、筛面与筛孔选择，以及与液压圆锥破的配套关系。</p>
</div></header>
<div class="wrap">

<section>
<h2>为什么筛子和破碎机必须一起看</h2>
<div class="box">
破碎机与筛机在破碎线上构成<strong>闭路</strong>：破碎产品进入筛子分级，筛上返料回破碎机。
<br><br>
这带来一个关键工程后果：<strong>筛机必须按"通过量"选，不是按"新给料量"选。</strong>
闭路时循环负荷通常 200–300%，筛机通过量是新给料的 <strong>3–4 倍</strong>。
按新给料量选筛，投产即能力不足。
<br><br>
正因为接口参数（给料粒度分布、循环负荷、筛孔尺寸、返料比）互相咬合，
<strong>破碎与筛分通常放在同一标段招标</strong>。分开采购极易造成参数不匹配。
</div>
</section>

<section>
<h2>六类振动筛对比</h2>
${tbl(['类型', 'English', '特点', '适用'], SCREEN_TYPES)}
</section>

<section>
<h2>选型参数</h2>
${tbl(['参数', 'English', '作用', '取值原则'], SCREEN_PARAMS)}
</section>

<section>
<h2>处理能力计算（VSMA / Karra 方法）</h2>
${tbl(['项', '公式 / 取值', '说明'], SCREEN_CAPACITY)}
<div class="box warn">
<strong>最常被忽略的一条</strong>：给料中筛下粒级含量 &lt;25% 时（k1 修正），
实际处理能力可能只有标称值的 <strong>60–70%</strong>。
只按总处理量选筛，是破碎线投产不达标的常见原因。
</div>
</section>

<section>
<h2>与破碎段的配套关系</h2>
${tbl(['工序位置', '筛型', '筛孔', '作用'], SCREEN_MATCH)}
</section>

<section>
<h2>典型完整配置（同标段整线供货）</h2>
<div class="box">
振动给料机 → <strong>颚式破碎机（粗碎）</strong> → <strong>除铁器</strong>（必须在粗碎与中碎之间）→
振动筛（预筛分）→ <strong>液压圆锥破碎机（中碎）</strong> → 振动筛（检查筛分，与圆锥破构成闭路）→
<strong>液压圆锥破碎机（细碎）</strong> → 振动筛（成品筛分）→ 立轴冲击破（制砂，可选）→
皮带输送机 → 成品仓
<br><br>
<strong>MACKORN 可整体供货</strong>，破碎与筛分的接口参数统一设计，避免分标段采购的参数不匹配。
</div>
</section>

<section>
<h2>常见错误</h2>
<table><tr><th style="width:34%">错误做法</th><th>后果</th></tr>
${COMMON_ERRORS.map(([a, b]) => '<tr><td>' + a + '</td><td>' + b + '</td></tr>').join('\n')}
</table>
</section>

<section>
<h2>常见问题</h2>
${FAQ.map(([q, a]) => '<h3>' + q + '</h3><p>' + a + '</p>').join('\n')}
</section>

<section>
<h2>相关页面</h2>
<p><a class="btn" href="${BASE}/ai/">AI 选型插件（22 工具）</a>
<a class="btn ghost" href="${BASE}/ai/reference/">破碎参考数据</a>
<a class="btn ghost" href="${BASE}/glossary/">12 语言术语表</a>
<a class="btn ghost" href="${BASE}/contact/">联系方式</a></p>
</section>

</div>
<footer><div class="wrap">
<p style="margin:0 0 6px"><strong>上海美矿机械股份有限公司 · Shanghai Mackorn Minerals Co., Ltd.</strong></p>
<p style="margin:0">振动筛计算采用公开方法（VSMA / Karra 1979）。厂商参数数据版权归上海美矿机械股份有限公司所有。本页不含报价。</p>
</div></footer>
</body></html>`;

mkdirSync(join(SITE, 'ai', 'screens'), { recursive: true });
writeFileSync(join(SITE, 'ai', 'screens', 'index.html'), page, 'utf8');
console.log('  /ai/screens/index.html  ' + (page.length / 1024).toFixed(1) + ' KB');
console.log('  ' + SCREEN_TYPES.length + ' 类振动筛 · ' + SCREEN_PARAMS.length + ' 个选型参数 · ' + FAQ.length + ' 条问答');

/* ══════════════════════════════════════════════════════════
 * 四、把筛分术语并入术语表
 * ══════════════════════════════════════════════════════════ */
const gf = join(ROOT, 'tools', 'build_glossary.mjs');
if (existsSync(gf)) {
  let g = readFileSync(gf, 'utf8');
  if (!g.includes("id: 'screen'") || g.includes("id: 'circular-screen'") === false) {
    const block = '\n  // ── 振动筛（同标段配套）──\n' +
      SCREEN_TERMS.map((t) => {
        const parts = [`id: '${t.id}'`, `zh: '${t.zh}'`];
        if (t.zhAlt) parts.push(`zhAlt: [${t.zhAlt.map((x) => `'${x}'`).join(', ')}]`);
        for (const k of ['en', 'es', 'ru', 'pt', 'fr', 'ar', 'id', 'de', 'tr', 'ja', 'vi']) {
          if (t[k]) parts.push(`${k}: [${t[k].map((x) => `'${x.replace(/'/g, "\\'")}'`).join(', ')}]`);
        }
        return '  { ' + parts.join(', ') + ' },';
      }).join('\n');
    g = g.replace('const TERMS = [', 'const TERMS = [' + block);
    writeFileSync(gf, g, 'utf8');
    console.log('  ✅ 已把 ' + SCREEN_TERMS.length + ' 组筛分术语并入术语表生成器');
  }
}

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
