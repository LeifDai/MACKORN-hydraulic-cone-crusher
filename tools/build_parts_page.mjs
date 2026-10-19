/**
 * 备件专项落地页 /ai/parts/
 *
 * 为什么建这个页面：
 *   海关数据显示【零件市场是主机的 2-6 倍】——
 *     智利 6.3 倍($294.9M vs $46.7M)、秘鲁 4.7 倍、澳洲 $562.1M(全球最大)、
 *     加纳 73 倍、赞比亚 8 倍、阿联酋 10 倍。
 *   但此前站点上【没有任何备件页面】—— 这是最大的内容缺口，也是最大的生意。
 *
 * 目标关键词：mantle / bowl liner / cone crusher wear parts / manganese liner
 *             броня конуса / manto y cóncavo / revestimiento
 *
 * 多语言：EN + ZH + RU + ES（覆盖主要备件市场）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', '官网落地页', 'ai', 'parts');
const BASE = 'https://mackorn.cn';
const REPO = 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher';

const COMPANY = {
  name: 'Shanghai Mackorn Minerals Co., Ltd.',
  nameCn: '上海美矿机械股份有限公司',
  addr: 'No.33 Qianjiang Road, Liuhe, Taicang, Suzhou, China',
  addrCn: '江苏省苏州市太仓浏河钱江路 33 号',
  emails: ['sandy.zhao@mackorn.cn · +86 139 1648 5025', 'leif.dai@mackorn.cn · +86 134 8218 0158', 'vicky.cheng@mackorn.cn · +86 158 0189 1052'],
};

const T = {
  zh: {
    title: '圆锥破衬板耐磨件 · 破碎壁轧臼壁 | MACKORN 美矿',
    h2: '圆锥破衬板与耐磨件',
    lead: '破碎壁（Mantle）、轧臼壁（Bowl Liner）、分料盘、臂架衬套 —— MACKORN NH/NS 系列单缸液压圆锥破的原厂备件。',
    why: '为什么衬板是这门生意里最稳的部分',
    whyBody: '海关数据显示，多数市场的零件进口额是破碎整机的 2–6 倍：智利 6.3 倍（$294.9M vs $46.7M）、秘鲁 4.7 倍、澳大利亚 $562.1M（全球最大）、加纳 73 倍、赞比亚 8 倍。整机是一次性大单，衬板是持续现金流——一台设备投产后，未来 5–10 年每年都要换衬板。',
    items: [['破碎壁 Mantle', '动锥外表面，主要承磨件'], ['轧臼壁 Bowl Liner', '定锥内表面，与破碎壁配对'], ['分料盘 Feed Plate', '给料分配，防偏析'], ['臂架衬套 / 偏心衬套', '传动与支撑配合面'], ['锁紧螺母 / 压紧环', '拆装配套件']],
    grades: '材质与选择',
    gradesBody: '按物料磨蚀性选锰钢牌号。玄武岩、辉绿岩等强磨蚀物料建议提高锰含量或使用加厚型，牺牲一点腔容换寿命。',
    service: '衬板寿命管理服务',
    serviceBody: '我们提供沿破碎腔高度离散截面的磨损均匀度评估（均匀度 = 1 − σ/μ），并给出多梯度分区硬度设计建议 H_i = H_base × k^i。把每次换衬板的实测厚度记下来，可以算出你这台机的实际磨损曲线，提前预判更换时间——避免非计划停机。',
    faq: [
      ['你们提供哪些机型的衬板？', 'MACKORN NH 系列（NH200 到 NH895，共 9 个型号）与 NS 高速系列（NS200 到 NS600，共 4 个型号）的破碎壁、轧臼壁及配套耐磨件。'],
      ['怎么确定该用哪种腔型的衬板？', '腔型（EC/C/MC/M/F/EF 等）由给料粒度、目标产品和工序段决定。用我们的选型工具输入工况即可得到推荐腔型，或者把您的给料筛析与产品要求发给我们。'],
      ['衬板寿命一般多久？', '取决于物料磨蚀性和运行工况，差异很大。建议用实测方法：记录各截面每次更换时的测厚差值，即可算出你这台机的实际磨损速率（mm/1000h），比套用经验值可靠。'],
      ['能配合我们的检修计划供货吗？', '可以。请提供机型、腔型、年消耗量和检修周期，我们按计划备货，缩短交货期。'],
    ],
  },
  en: {
    title: 'Cone Crusher Wear Parts — Mantle & Bowl Liner | MACKORN',
    h2: 'Cone crusher wear parts',
    lead: 'Mantle, bowl liner, feed plate, arm bushing and eccentric bushing — original wear parts for MACKORN NH/NS single-cylinder hydraulic cone crushers.',
    why: 'Why wear parts are the most stable business in this trade',
    whyBody: 'Customs data shows that in most markets the imported parts value is 2–6 times the machine value: Chile 6.3× ($294.9M vs $46.7M), Peru 4.7×, Australia $562.1M (the largest worldwide), Ghana 73×, Zambia 8×. A machine is a one-off order; a liner is recurring cash flow — once a crusher is running, liners are replaced every year for the next 5–10 years.',
    items: [['Mantle', 'The moving cone surface — the primary wear part'], ['Bowl Liner', 'The fixed cone surface, paired with the mantle'], ['Feed Plate', 'Feed distribution, prevents segregation'], ['Arm / Eccentric Bushing', 'Drive and support interfaces'], ['Locking Nut / Clamping Ring', 'Fitting and change-out parts']],
    grades: 'Grades and selection',
    gradesBody: 'Manganese grade is selected against ore abrasiveness. For highly abrasive feeds such as basalt and diabase we recommend a higher manganese content or a thicker profile — trading a little chamber volume for liner life.',
    service: 'Liner life management service',
    serviceBody: 'We assess wear uniformity across discrete sections of the crushing chamber (uniformity = 1 − σ/μ) and recommend a multi-gradient hardness design H_i = H_base × k^i. Record the measured thickness at each liner change and we can derive the actual wear curve of your machine, predicting change-out dates and avoiding unplanned downtime.',
    faq: [
      ['Which models do you supply wear parts for?', 'Mantle, bowl liner and matching wear parts for the MACKORN NH series (NH200 to NH895, 9 models) and the NS high-speed series (NS200 to NS600, 4 models).'],
      ['How do I know which cavity profile liner to use?', 'The cavity (EC/C/MC/M/F/EF and so on) follows from feed size, target product and crushing stage. Run your duty through our selection tool to get the recommended cavity, or send us your feed and product sieve analyses.'],
      ['How long does a liner last?', 'It varies widely with ore abrasiveness and operating conditions. Measure it: record the thickness difference at each section at every change-out and you get the actual wear rate of your machine (mm/1000h) — far more reliable than applying a rule of thumb.'],
      ['Can you supply against our maintenance schedule?', 'Yes. Give us the model, cavity, annual consumption and maintenance intervals, and we will hold stock against your plan to shorten lead time.'],
    ],
  },
  ru: {
    title: 'Броня конуса и футеровка чаши — запасные части | MACKORN',
    h2: 'Броня конуса и футеровочные части',
    lead: 'Броня конуса (mantle), футеровка чаши (bowl liner), распределительная тарелка, втулки — оригинальные быстроизнашивающиеся части для гидравлических конусных дробилок MACKORN серий NH/NS.',
    why: 'Почему футеровка — самый стабильный бизнес в этой отрасли',
    whyBody: 'По данным таможенной статистики, в большинстве стран импорт запасных частей в 2–6 раз превышает импорт машин: Чили 6,3 раза, Перу 4,7 раза, Австралия $562,1 млн (крупнейший рынок в мире), Гана 73 раза, Замбия 8 раз. Машина — разовый заказ, футеровка — постоянный денежный поток: после пуска дробилки футеровку меняют ежегодно в течение 5–10 лет.',
    items: [['Броня конуса (Mantle)', 'Поверхность подвижного конуса, основной изнашиваемый элемент'], ['Футеровка чаши (Bowl Liner)', 'Поверхность неподвижного конуса, работает в паре с броней'], ['Распределительная тарелка', 'Распределение питания, предотвращает сегрегацию'], ['Втулки', 'Сопряжения привода и опор'], ['Крепёж', 'Детали для монтажа и замены']],
    grades: 'Материалы и выбор',
    gradesBody: 'Марка марганцевой стали выбирается по абразивности руды. Для сильно абразивных материалов (базальт, диабаз) рекомендуется повышенное содержание марганца или утолщённый профиль — в обмен на ресурс теряется часть объёма камеры.',
    service: 'Управление ресурсом футеровки',
    serviceBody: 'Мы оцениваем равномерность износа по дискретным сечениям камеры дробления (равномерность = 1 − σ/μ) и предлагаем многоградиентную твёрдость H_i = H_base × k^i. Записывайте фактическую толщину при каждой замене — и мы построим реальную кривую износа вашей машины, прогнозируя срок замены и исключая внеплановые простои.',
    faq: [
      ['Для каких моделей вы поставляете футеровку?', 'Броня конуса, футеровка чаши и сопутствующие быстроизнашивающиеся части для серии NH (NH200–NH895, 9 моделей) и высокоскоростной серии NS (NS200–NS600, 4 модели).'],
      ['Как определить нужный профиль камеры?', 'Камера (EC/C/MC/M/F/EF и т.д.) определяется крупностью питания, целевым продуктом и стадией дробления. Рассчитайте свой режим в нашем инструменте подбора или пришлите ситовые анализы.'],
      ['Сколько служит футеровка?', 'Зависит от абразивности руды и условий эксплуатации. Надёжнее измерить: фиксируйте разницу толщин по сечениям при каждой замене — получите фактическую скорость износа (мм/1000 ч).'],
      ['Можете поставлять по нашему графику ремонтов?', 'Да. Укажите модель, камеру, годовой расход и периодичность ремонтов — будем держать запас под ваш план.'],
    ],
  },
  es: {
    title: 'Piezas de desgaste — Manto y Cóncavo para trituradora de cono | MACKORN',
    h2: 'Piezas de desgaste para trituradora de cono',
    lead: 'Manto, cóncavo, plato de alimentación y bujes — piezas de desgaste originales para trituradoras de cono hidráulicas MACKORN series NH/NS.',
    why: 'Por qué las piezas de desgaste son el negocio más estable',
    whyBody: 'Los datos de aduanas muestran que en la mayoría de los mercados la importación de partes es 2–6 veces la de máquinas: Chile 6,3× ($294,9M vs $46,7M), Perú 4,7×, Australia $562,1M (el mayor del mundo), Ghana 73×, Zambia 8×. Una máquina es un pedido único; un revestimiento es flujo de caja recurrente: una vez que la trituradora opera, los revestimientos se cambian cada año durante los siguientes 5–10 años.',
    items: [['Manto', 'Superficie del cono móvil, principal pieza de desgaste'], ['Cóncavo (Bowl Liner)', 'Superficie del cono fijo, en pareja con el manto'], ['Plato de alimentación', 'Distribución de alimentación, evita la segregación'], ['Bujes de brazo / excéntrica', 'Interfaces de accionamiento y apoyo'], ['Tuerca de blocaje / anillo', 'Piezas de montaje y recambio']],
    grades: 'Materiales y selección',
    gradesBody: 'El grado de manganeso se selecciona según la abrasividad del mineral. Para materiales muy abrasivos como basalto y diabasa recomendamos mayor contenido de manganeso o un perfil más grueso, sacrificando algo de volumen de cámara a cambio de vida útil.',
    service: 'Servicio de gestión de vida del revestimiento',
    serviceBody: 'Evaluamos la uniformidad del desgaste en secciones discretas de la cámara (uniformidad = 1 − σ/μ) y recomendamos un diseño de dureza multigradiente H_i = H_base × k^i. Registre el espesor medido en cada cambio y podremos derivar la curva de desgaste real de su máquina, anticipando fechas de recambio y evitando paradas no planificadas.',
    faq: [
      ['¿Para qué modelos suministran piezas?', 'Manto, cóncavo y piezas asociadas para la serie NH (NH200 a NH895, 9 modelos) y la serie rápida NS (NS200 a NS600, 4 modelos).'],
      ['¿Cómo sé qué perfil de cámara usar?', 'La cámara (EC/C/MC/M/F/EF, etc.) depende del tamaño de alimentación, el producto objetivo y la etapa. Use nuestra herramienta de selección o envíenos sus análisis granulométricos.'],
      ['¿Cuánto dura un revestimiento?', 'Varía mucho con la abrasividad y las condiciones. Mídalo: registre la diferencia de espesor por sección en cada cambio y obtendrá la tasa de desgaste real (mm/1000 h).'],
      ['¿Pueden suministrar según nuestro plan de mantenimiento?', 'Sí. Indíquenos modelo, cámara, consumo anual e intervalos y mantendremos stock según su plan.'],
    ],
  },
};

function render(lang, L) {
  return `<!DOCTYPE html>
<html lang="${lang === 'zh' ? 'zh-CN' : lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${L.title}</title>
<meta name="description" content="${L.lead} ${L.whyBody.slice(0, 110)}">
<meta name="keywords" content="mantle,bowl liner,cone crusher wear parts,manganese liner,MACKORN,NH series,NS series,crushing chamber,liner life,破碎壁,轧臼壁,圆锥破衬板,耐磨件,Mn13,Mn18,Mn22,броня конуса,футеровка чаши,manto,cóncavo,revestimiento,piezas de desgaste">
<meta name="robots" content="index,follow,max-snippet:-1">
<link rel="canonical" href="${BASE}/ai/parts/">
<link rel="alternate" hreflang="zh-CN" href="${BASE}/ai/parts/">
<link rel="alternate" hreflang="en" href="${BASE}/ai/parts/">
<link rel="alternate" hreflang="ru" href="${BASE}/ai/parts/">
<link rel="alternate" hreflang="es" href="${BASE}/ai/parts/">
<link rel="alternate" hreflang="x-default" href="${BASE}/ai/">
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'MACKORN cone crusher wear parts — mantle and bowl liner',
    description: L.lead,
    brand: { '@type': 'Brand', name: 'MACKORN' },
    category: 'Mining machinery wear parts',
    manufacturer: { '@type': 'Organization', name: COMPANY.name, url: BASE },
    url: `${BASE}/ai/parts/`,
    isRelatedTo: ['NH series hydraulic cone crusher', 'NS series hydraulic cone crusher'],
  }, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lang === 'zh' ? 'zh-CN' : lang,
    mainEntity: L.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }, null, 2)}
</script>
<style>
:root{--navy:#0A2A4F;--blue:#1B6CB5;--light:#F4F8FC;--line:#D9E5F2;--muted:#5A6B80}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,"Segoe UI","Microsoft YaHei",Roboto,sans-serif;color:#16202E;line-height:1.8}
.wrap{max-width:960px;margin:0 auto;padding:0 24px}
header{background:linear-gradient(140deg,#08213E,var(--blue));color:#fff;padding:52px 0 42px}
header .crumb{font-size:13px;opacity:.8;margin-bottom:12px}
header .crumb a{color:#BFE0FF;text-decoration:none}
header h1{margin:0 0 12px;font-size:clamp(22px,3.2vw,30px);line-height:1.35}
header p{margin:0;opacity:.94;max-width:780px;font-size:15.5px}
section{padding:38px 0;border-bottom:1px solid var(--line)}
h2{font-size:20px;color:var(--navy);margin:0 0 14px;border-bottom:2px solid var(--blue);display:inline-block;padding-bottom:8px}
h3{font-size:16px;color:var(--navy);margin:22px 0 8px}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14.5px}
th,td{border:1px solid var(--line);padding:9px 12px;text-align:left}
th{background:var(--light);color:var(--navy)}
.box{background:var(--light);border-left:4px solid var(--blue);padding:16px 20px;border-radius:0 10px 10px 0;margin:18px 0}
.box.hi{background:#EAF7EE;border-left-color:#2E9E5B}
.muted{color:var(--muted);font-size:14px}
a{color:var(--blue)}
.btn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;margin:6px 10px 6px 0;font-weight:600;font-size:14.5px}
.btn.ghost{background:#fff;color:var(--blue);border:2px solid var(--blue)}
footer{background:#08213E;color:#B8CEE3;padding:30px 0;font-size:13.5px}
code{background:#fff;padding:2px 6px;border-radius:4px;font-size:13.5px;border:1px solid var(--line)}
</style>
</head>
<body>

<header><div class="wrap">
<div class="crumb"><a href="${BASE}/">MACKORN</a> › <a href="${BASE}/ai/">AI selection plugin</a> › Wear parts</div>
<h1>${L.h2}</h1>
<p>${L.lead}</p>
</div></header>

<div class="wrap">

<section>
<h2>${L.why}</h2>
<div class="box hi"><p style="margin:0">${L.whyBody}</p></div>
<table>
<tr><th>${lang === 'zh' ? '国家' : lang === 'ru' ? 'Страна' : lang === 'es' ? 'País' : 'Country'}</th>
    <th>${lang === 'zh' ? '整机进口' : 'Machines'}</th>
    <th>${lang === 'zh' ? '零件进口' : 'Parts'}</th>
    <th>${lang === 'zh' ? '倍数' : 'Ratio'}</th></tr>
<tr><td>Chile 智利</td><td>$46.7M</td><td><strong>$294.9M</strong></td><td><strong>6.3×</strong></td></tr>
<tr><td>Peru 秘鲁</td><td>$46.0M</td><td><strong>$217.9M</strong></td><td><strong>4.7×</strong></td></tr>
<tr><td>Australia 澳大利亚</td><td>$207.6M</td><td><strong>$562.1M</strong></td><td><strong>2.7×</strong></td></tr>
<tr><td>Canada 加拿大</td><td>$168.3M</td><td><strong>$556.5M</strong></td><td><strong>3.3×</strong></td></tr>
<tr><td>Ghana 加纳</td><td>$1.6M</td><td><strong>$117.2M</strong></td><td><strong>73×</strong></td></tr>
</table>
<p class="muted">Source: UN Comtrade, HS 847420 (machines) vs HS 847490 (parts), 2023 imports, USD.</p>
</section>

<section>
<h2>${lang === 'zh' ? '供货范围' : lang === 'ru' ? 'Номенклатура' : lang === 'es' ? 'Alcance de suministro' : 'Supply scope'}</h2>
<table>
${L.items.map(([n, d]) => `<tr><th style="width:38%">${n}</th><td>${d}</td></tr>`).join('\n')}
</table>
<h3>${L.grades}</h3>
<p>${L.gradesBody}</p>
</section>

<section>
<h2>${L.service}</h2>
<p>${L.serviceBody}</p>
<div class="box">
<code>${lang === 'zh' ? '均匀度 = 1 − σ/μ' : 'uniformity = 1 − σ/μ'}</code> &nbsp;·&nbsp;
<code>H_i = H_base × k^i</code>
</div>
</section>

<section>
<h2>FAQ</h2>
${L.faq.map(([q, a]) => `<h3>${q}</h3>\n<p>${a}</p>`).join('\n')}
</section>

<section>
<h2>${lang === 'zh' ? '联系' : lang === 'ru' ? 'Контакты' : lang === 'es' ? 'Contacto' : 'Contact'}</h2>
<div class="box">
<strong>${COMPANY.name} ${COMPANY.nameCn}</strong><br>
${COMPANY.addr}<br>${COMPANY.addrCn}<br>
<a href="${BASE}">${BASE}</a> · GMT+8 (09:00–17:30)<br>
${COMPANY.emails.join('<br>')}
</div>
<p><a class="btn" href="${BASE}/ai/">MACKORN AI selection plugin</a>
<a class="btn ghost" href="${BASE}/ai/guides/">Selection guides</a>
<a class="btn ghost" href="${REPO}">GitHub</a></p>
</section>

</div>
<footer><div class="wrap">
<p style="margin:0 0 8px"><strong>${COMPANY.name}</strong></p>
<p style="margin:0">Open source under the MIT license. Vendor parameter data is copyright of Shanghai Mackorn Minerals Co., Ltd. Market data from UN Comtrade public API. No pricing on this page — please contact sales for a quotation.</p>
</div></footer>
</body>
</html>
`;
}

mkdirSync(OUT, { recursive: true });
// 根 = 中文（与 /ai/ 一致）；en/ru/es 各自独立页面，覆盖备件市场的主要语言
writeFileSync(join(OUT, 'index.html'), render('zh', T.zh), 'utf8');
console.log('  /ai/parts/           中文');
for (const [lang, L] of [['en', T.en], ['ru', T.ru], ['es', T.es]]) {
  const d = join(OUT, lang);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'index.html'), render(lang, L), 'utf8');
  console.log('  /ai/parts/' + lang + '/         ' + lang);
}
console.log('  生成完成（4 个语言版本）');
