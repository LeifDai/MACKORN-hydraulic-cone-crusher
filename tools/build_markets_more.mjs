/**
 * 补齐国家/地区专属页 + 经销商招募页
 *
 * 缺口盘点（现有仅 kz/uz/co/id/ph/za/mx）：
 *   发达矿区：智利 · 秘鲁 · 巴西 · 俄罗斯 · 澳大利亚 · 加拿大
 *   非洲：    赞比亚 · 加纳 · 刚果金 · 坦桑尼亚
 *   新增目标群：经销商 / 代理商（独立页面，多语言）
 *
 * 数据来源：distribution/trade-data.json（UN Comtrade 实测值）
 * 所有金额均为真实数据，不编造。
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUTBASE = join(ROOT, 'distribution', '官网落地页');
const BASE = 'https://mackorn.cn';
const REPO = 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher';

let TRADE = {};
try { TRADE = JSON.parse(readFileSync(join(ROOT, 'distribution', 'trade-data.json'), 'utf8')).byCountry || {}; } catch { }
const get = (en, hs) => {
  const v = TRADE[en]?.hs?.[hs]?.years?.['2023']?.usd ?? TRADE[en]?.hs?.[hs]?.years?.['2021']?.usd;
  return v ? '$' + (v / 1e6).toFixed(1) + 'M' : null;
};
const ratio = (en) => {
  const m = TRADE[en]?.hs?.['847420']?.years?.['2023']?.usd ?? TRADE[en]?.hs?.['847420']?.years?.['2021']?.usd;
  const p = TRADE[en]?.hs?.['847490']?.years?.['2023']?.usd ?? TRADE[en]?.hs?.['847490']?.years?.['2021']?.usd;
  return m && p ? (p / m).toFixed(1) + '×' : null;
};

const COMPANY = {
  name: 'Shanghai Mackorn Minerals Co., Ltd.', nameCn: '上海美矿机械股份有限公司',
  addr: 'No.33 Qianjiang Road, Liuhe, Taicang, Suzhou, China', addrCn: '江苏省苏州市太仓浏河钱江路 33 号',
  emails: ['sandy.zhao@mackorn.cn · +86 139 1648 5025', 'leif.dai@mackorn.cn · +86 134 8218 0158', 'vicky.cheng@mackorn.cn · +86 158 0189 1052'],
};
const L = {
  contact: { ru: 'Контакты', es: 'Contacto', pt: 'Contato', en: 'Contact', fr: 'Contact', zh: '联系' },
  industry: { ru: 'Горная промышленность', es: 'Industria minera', pt: 'Indústria de mineração', en: 'Mining industry', fr: 'Industrie minière', zh: '矿业概况' },
  resources: { ru: 'Основные полезные ископаемые', es: 'Principales recursos', pt: 'Principais recursos', en: 'Principal commodities', fr: 'Ressources principales', zh: '主要矿产' },
  imports: { ru: 'Импорт оборудования (UN Comtrade, 2023)', es: 'Importación de equipos (UN Comtrade, 2023)', pt: 'Importação de equipamentos (UN Comtrade, 2023)', en: 'Equipment imports (UN Comtrade, 2023)', fr: 'Importations d\'équipements (UN Comtrade, 2023)', zh: '设备进口（UN Comtrade, 2023）' },
  machines: { ru: 'дробильно-помольное оборудование (HS 847420)', es: 'máquinas de triturar (HS 847420)', pt: 'máquinas de britagem (HS 847420)', en: 'crushing machines (HS 847420)', fr: 'machines de concassage (HS 847420)', zh: '破碎/粉磨机械（HS 847420）' },
  parts: { ru: 'запасные части (HS 847490)', es: 'partes y revestimientos (HS 847490)', pt: 'peças e revestimentos (HS 847490)', en: 'parts and liners (HS 847490)', fr: 'pièces et garnitures (HS 847490)', zh: '零件/衬板耐磨件（HS 847490）' },
  materials: { ru: 'Подходящие материалы', es: 'Materiales aplicables', pt: 'Materiais aplicáveis', en: 'Applicable materials', fr: 'Matériaux applicables', zh: '适用物料' },
  note: { ru: 'Конусная дробилка — машина среднего и мелкого дробления. Питание крупнее ~350 мм требует предварительного грохочения или дробилки крупного дробления.', es: 'La trituradora de cono es una máquina secundaria/terciaria. Alimentación superior a ~350 mm requiere cribado previo o una trituradora primaria.', pt: 'O britador de cone é uma máquina secundária/terciária. Alimentação acima de ~350 mm exige peneiramento prévio ou um britador primário.', en: 'A cone crusher is a secondary/tertiary machine. Feed above roughly 350 mm needs pre-screening or a primary crusher.', fr: 'Le concasseur à cône est une machine secondaire/tertiaire. Une alimentation supérieure à ~350 mm nécessite un criblage préalable ou un concasseur primaire.', zh: '圆锥破是中细碎设备。给料超过约 350 mm 需前段预筛分或改用粗碎设备。' },
};

const C = {
  cl: { lang: 'es', en: 'Chile', name: 'Chile', nameZh: '智利',
    h1: 'Trituradoras de cono hidráulicas para la minería chilena',
    sub: 'Cobre, oro, molibdeno. Chile es el mayor productor de cobre del mundo: la selección de equipos, la configuración de planta y la simulación granulométrica se calculan, no se adivinan.',
    desc: 'Selección de trituradoras de cono hidráulicas MACKORN para la minería de Chile: cobre, oro, molibdeno. Cálculos reales de capacidad, granulometría y desgaste de revestimientos.',
    commodities: ['Cobre (Antofagasta, Atacama, O\'Higgins)', 'Molibdeno (subproducto del cobre)', 'Oro', 'Hierro (Atacama)', 'Litio (salares del norte)'],
    materials: 'Mineral de cobre · molibdeno · oro · hierro · granito · basalto · andesita',
    marketNote: 'Chile es el centro mundial del cobre. Su mercado de piezas de desgaste (HS 847490) es aproximadamente <b>6,3 veces</b> el de máquinas nuevas — la base instalada de trituradoras es enorme y el consumo de revestimientos es continuo.',
    faq: [
      ['¿Qué trituradora de cono para mineral de cobre en Chile?', 'Pórfido cuprífero con dureza media-alta: habitualmente tres etapas, con trituradora de cono hidráulica en las etapas secundaria y terciaria. La relación de reducción total suele ser 40–60:1.'],
      ['¿Por qué el mercado de revestimientos es tan importante en Chile?', 'Porque las importaciones de partes (HS 847490) son unas 6,3 veces las de máquinas. Una trituradora en operación consume revestimientos cada año durante 5–10 años: es flujo de caja recurrente.'],
      ['¿Pueden evaluar la vida de nuestros revestimientos?', 'Sí. Registre el espesor medido en cada sección al cambiar revestimientos y calculamos su curva de desgaste real (mm/1000 h), con diseño de dureza multigradiente.'],
      ['¿Cómo pido una selección?', 'Envíe tipo de mineral, tamaño máximo de alimentación y capacidad objetivo a leif.dai@mackorn.cn. El plugin calcula etapas, cámara, CSS y número de unidades, y lo confirmamos técnicamente.'],
    ] },
  pe: { lang: 'es', en: 'Peru', name: 'Perú', nameZh: '秘鲁',
    h1: 'Trituradoras de cono hidráulicas para la minería peruana',
    sub: 'Cobre, oro, zinc, plomo. Perú es el segundo productor mundial de cobre y un mercado de revestimientos muy activo.',
    desc: 'Selección de trituradoras de cono hidráulicas MACKORN para la minería del Perú: cobre, oro, zinc, plomo. Cálculos reales y gestión de vida de revestimientos.',
    commodities: ['Cobre (Arequipa, Moquegua, Apurímac)', 'Oro (Cajamarca, La Libertad)', 'Zinc y plomo (Ancash, Pasco)', 'Plata', 'Hierro (Ica)'],
    materials: 'Mineral de cobre · oro · zinc-plomo · plata · granito · basalto · andesita',
    marketNote: 'Perú es el segundo productor mundial de cobre. Las importaciones de piezas de desgaste (HS 847490) son aproximadamente <b>4,7 veces</b> las de máquinas nuevas — mercado de reposición muy activo.',
    faq: [
      ['¿Qué equipo para una planta de cobre de 800 t/h?', 'Tres etapas con trituradora de cono hidráulica en secundaria y terciaria. Para pórfido cuprífero las relaciones de reducción totales rondan 40–60:1.'],
      ['¿Suministran repuestos además de máquinas?', 'Sí. Manto y cóncavo para las series NH y NS son parte central de nuestro negocio, y el mercado peruano de partes es aproximadamente 4,7 veces el de máquinas.'],
      ['¿Tienen distribuidores en Perú?', 'Estamos ampliando nuestra red en Latinoamérica. Si su empresa comercializa equipos de trituración, escríbanos.'],
      ['¿Cómo se calcula la granulometría?', 'El plugin incorpora el modelo estacionario de Whiten (1972) y la estimación de energía de Bond (1952); todos los resultados incluyen supuestos y advertencias.'],
    ] },
  br: { lang: 'pt', en: 'Brazil', name: 'Brasil', nameZh: '巴西',
    h1: 'Britadores de cone hidráulicos para a mineração brasileira',
    sub: 'Minério de ferro, ouro, cobre, nióbio. Seleção de equipamentos, configuração de planta e simulação granulométrica — calculados, não estimados.',
    desc: 'Seleção de britadores de cone hidráulicos MACKORN para a mineração do Brasil: minério de ferro, ouro, cobre, níquel. Cálculos reais e gestão de vida de revestimentos.',
    commodities: ['Minério de ferro (Minas Gerais, Pará)', 'Ouro (Pará, Goiás)', 'Cobre (Pará, Camaquã)', 'Nióbio (Minas Gerais)', 'Bauxita (Pará)', 'Agregados'],
    materials: 'Minério de ferro · ouro · cobre · níquel · granito · basalto · diabásio',
    marketNote: 'O Brasil é o segundo maior exportador mundial de minério de ferro. As importações de peças e revestimentos (HS 847490) são cerca de <b>2,3 vezes</b> as de máquinas, refletindo uma grande base instalada.',
    faq: [
      ['Qual britador de cone para minério de ferro?', 'O minério de ferro exige normalmente três estágios: relação de redução total de 40–100:1 de 800–1000 mm até 10–20 mm. Britadores de cone hidráulicos nos estágios secundário e terciário.'],
      ['Por que três estágios e não dois?', 'A relação de redução total decide. Dois estágios atendem cerca de 20:1; minério de ferro e cobre exigem 40–60:1 ou mais.'],
      ['Vocês fornecem revestimentos?', 'Sim — manto e côncavo para as séries NH e NS. O mercado brasileiro de partes é cerca de 2,3 vezes o de máquinas.'],
      ['Como obter uma seleção?', 'Envie o tipo de minério, tamanho máximo de alimentação e capacidade desejada. O plugin calcula estágios, câmara, CSS e número de unidades.'],
    ] },
  ru: { lang: 'ru', en: 'Russia', name: 'Россия', nameZh: '俄罗斯',
    h1: 'Гидравлические конусные дробилки для горной промышленности России',
    sub: 'Железная руда, медь, золото, никель, уголь. Подбор оборудования, компоновка ДСК, моделирование гранулометрии и предложение из 14 разделов.',
    desc: 'Подбор гидравлических конусных дробилок MACKORN для горной промышленности России: железная руда, медь, золото, никель. Реальные расчёты и управление ресурсом футеровки.',
    commodities: ['Железная руда (КМА, Урал, Сибирь)', 'Медь (Норильск, Урал)', 'Золото (Сибирь, Дальний Восток)', 'Никель (Норильск)', 'Уголь (Кузбасс, Якутия)', 'Алмазы (Якутия)'],
    materials: 'Железная руда · медная руда · золотосодержащая руда · никелевая руда · гранит · базальт · диабаз',
    marketNote: 'Россия — один из крупнейших горнодобывающих рынков мира с развитой металлургией. Крепкие и абразивные руды Урала и Сибири предъявляют высокие требования к камере дробления и марке футеровки.',
    faq: [
      ['Какая дробилка для железной руды?', 'Обычно трёхстадийная схема: крупное дробление, затем две стадии гидравлических конусных дробилок. Суммарная степень сокращения для железной руды 40–100:1.'],
      ['Как выбрать марку футеровки?', 'По абразивности руды. Для крепких абразивных руд рекомендуется повышенное содержание марганца или утолщённый профиль — в обмен на ресурс теряется часть объёма камеры.'],
      ['Есть ли документация на русском?', 'Инструмент подбора поддерживает русский язык, страницы по рынкам также на русском. Техническая документация предоставляется по запросу.'],
      ['Как получить предложение?', 'Напишите на leif.dai@mackorn.cn, указав руду, максимальную крупность питания и целевую производительность.'],
    ] },
  au: { lang: 'en', en: 'Australia', name: 'Australia', nameZh: '澳大利亚',
    h1: 'Hydraulic cone crushers for Australian mining',
    sub: 'Iron ore, gold, copper, lithium. Australia has the world\'s largest imported wear-parts market — and the installed base to go with it.',
    desc: 'MACKORN hydraulic cone crusher selection for Australian mining: iron ore, gold, copper, lithium. Real calculations plus liner life management for the world\'s largest parts market.',
    commodities: ['Iron ore (Pilbara, WA)', 'Gold (WA, NT, QLD)', 'Copper (SA, QLD)', 'Lithium (WA)', 'Coal (QLD, NSW)', 'Bauxite (QLD, NT)'],
    materials: 'Iron ore · gold ore · copper ore · lithium ore · granite · basalt · dolerite',
    marketNote: 'Australia imports the largest value of crusher parts in the world — <b>$562M in 2023</b>, about 2.7 times its machine imports. The installed base is mature and consumption is continuous.',
    faq: [
      ['What cone crusher for Pilbara iron ore?', 'Iron ore is hard and abrasive: a single-cylinder hydraulic cone crusher in the secondary and tertiary stages, with a coarse-to-medium cavity and a liner grade selected for abrasion resistance.'],
      ['Why is the Australian parts market so large?', 'Australia imported $562M of HS 847490 parts in 2023 — the largest of any market we analysed, and about 2.7 times its machine imports. A mature installed base consumes liners continuously.'],
      ['Can you match OEM liner profiles?', 'We supply mantles and bowl liners for the MACKORN NH/NS series. Send us the profile drawing or measured dimensions and we will confirm fitment.'],
      ['Do you appoint distributors in Australia?', 'Yes — we are actively recruiting distributors with experience of Metso or Sandvik equipment.'],
    ] },
  ca: { lang: 'en', en: 'Canada', name: 'Canada', nameZh: '加拿大',
    h1: 'Hydraulic cone crushers for Canadian mining',
    sub: 'Gold, copper, iron ore, potash. The second-largest imported wear-parts market worldwide.',
    desc: 'MACKORN hydraulic cone crusher selection for Canadian mining: gold, copper, iron ore, nickel. Real calculations and liner life management.',
    commodities: ['Gold (Ontario, Quebec, BC)', 'Copper (BC)', 'Iron ore (Newfoundland, Quebec)', 'Nickel (Sudbury)', 'Potash (Saskatchewan)', 'Diamonds (NWT)'],
    materials: 'Gold ore · copper ore · iron ore · nickel ore · granite · basalt · diabase',
    marketNote: 'Canada imported <b>$556M of crusher parts in 2023</b> — roughly 3.3 times its machine imports. Hard, abrasive Precambrian shield ores drive high liner consumption.',
    faq: [
      ['What crusher for Sudbury nickel ore?', 'Nickel ore is hard and abrasive: three stages, single-cylinder hydraulic cone crushers in secondary and tertiary, with abrasion-resistant liner grades.'],
      ['How large is the Canadian parts market?', 'Canada imported about $556M of HS 847490 in 2023, roughly 3.3 times its machine imports (HS 847420, $168M).'],
      ['Do you supply through distributors?', 'We are recruiting distributors across North America, particularly those already carrying Metso or Sandvik parts.'],
      ['What information do you need for a selection?', 'Ore type, maximum feed size, target capacity and product size. The plugin returns the stage count, cavity, CSS and unit count.'],
    ] },
  zm: { lang: 'en', en: 'Zambia', name: 'Zambia', nameZh: '赞比亚',
    h1: 'Cone crushers and wear parts for Zambian copper mining',
    sub: 'Copper and cobalt. Zambia buys relatively few machines but a lot of parts — a pure aftermarket market.',
    desc: 'MACKORN cone crushers and wear parts for Zambian copper-cobalt mining. Imported parts are 8 times machine imports — an aftermarket-led market.',
    commodities: ['Copper (Copperbelt)', 'Cobalt (Copperbelt)', 'Gold', 'Manganese', 'Emeralds'],
    materials: 'Copper ore · cobalt ore · gold ore · granite · basalt · dolerite',
    marketNote: 'Zambia imported about <b>$76.9M of crusher parts in 2023</b> against just $9.6M of machines — a ratio of roughly 8:1. This is an aftermarket-led market: the installed base is what matters.',
    faq: [
      ['Do you sell complete crushers in Zambia?', 'We do, but Zambia is an aftermarket-led market: parts imports are about 8 times machine imports. Supplying liners to the existing installed base is often the faster business.'],
      ['Which crushers dominate the Copperbelt?', 'Copper-cobalt ore is medium-hard; secondary and tertiary cone crushers dominate. Send us the model and cavity and we will confirm liner fitment.'],
      ['Can you supply against a maintenance schedule?', 'Yes. Give us model, cavity, annual consumption and maintenance intervals and we will hold stock against your plan.'],
      ['How do I contact you?', 'leif.dai@mackorn.cn · +86 134 8218 0158'],
    ] },
  gh: { lang: 'en', en: 'Ghana', name: 'Ghana', nameZh: '加纳',
    h1: 'Cone crusher wear parts for Ghanaian gold mining',
    sub: 'Gold. Machine imports have fallen but parts imports are $117M — a pure aftermarket market.',
    desc: 'MACKORN cone crusher wear parts for Ghanaian gold mining. Parts imports of $117M against $1.6M of machines — a 73:1 aftermarket market.',
    commodities: ['Gold (Ashanti, Western Region)', 'Bauxite', 'Manganese', 'Diamonds'],
    materials: 'Gold ore · bauxite · manganese ore · granite · dolerite',
    marketNote: 'Ghana imported about <b>$117.2M of crusher parts in 2023</b> against only $1.6M of machines — a ratio of roughly 73:1. New machine investment has receded but the installed base is consuming liners continuously.',
    faq: [
      ['Should we sell complete crushers in Ghana?', 'Machine imports fell about 30% while parts imports stayed at $117M. This is a pure aftermarket market — supplying liners to running crushers is the realistic approach.'],
      ['Where are the crushers in Ghana?', 'Concentrated in the Ashanti and Western gold regions. The installed base is what generates liner demand.'],
      ['Do you supply liners for other brands?', 'We supply mantles and bowl liners for MACKORN NH/NS. For other brands, send the profile drawing or measured dimensions and we will advise.'],
      ['How do I get a quotation?', 'Send model, cavity and annual consumption to leif.dai@mackorn.cn.'],
    ] },
  cd: { lang: 'fr', en: 'DRC', name: 'RD Congo', nameZh: '刚果金',
    h1: 'Concasseurs à cône et pièces d\'usure pour la RDC',
    sub: 'Cuivre et cobalt. La ceinture cuprifère du Katanga est l\'une des régions minières les plus actives au monde.',
    desc: 'Sélection de concasseurs à cône MACKORN et pièces d\'usure pour la RDC : cuivre et cobalt du Katanga. Calculs réels et gestion de la durée de vie des garnitures.',
    commodities: ['Cuivre (Katanga / Lualaba / Haut-Katanga)', 'Cobalt (Lualaba)', 'Or (Kivu, Ituri)', 'Diamants (Kasaï)', 'Étain et tantale'],
    materials: 'Minerai de cuivre · cobalt · or · granite · basalte · diabase',
    marketNote: 'La RDC est le premier producteur mondial de cobalt et un producteur de cuivre de premier plan. Les projets de la ceinture cuprifère du Katanga génèrent une demande soutenue en concassage secondaire et tertiaire.',
    faq: [
      ['Quel concasseur pour le minerai de cuivre au Katanga?', 'Trois étapes habituellement, avec des concasseurs à cône hydrauliques en secondaire et tertiaire. La relation de réduction totale est de 40–60:1 pour un porphyre cuprifère.'],
      ['Fournissez-vous les pièces d\'usure?', 'Oui — manteau et bol pour les séries NH et NS. L\'usure des garnitures est le poste de coût récurrent principal d\'une installation de concassage.'],
      ['Travaillez-vous avec des agents locaux?', 'Nous développons notre réseau en Afrique centrale. Si votre société commercialise des équipements de concassage, contactez-nous.'],
      ['Comment obtenir une sélection?', 'Envoyez le type de minerai, la granulométrie maximale d\'alimentation et la capacité cible à leif.dai@mackorn.cn.'],
    ] },
  tz: { lang: 'en', en: 'Tanzania', name: 'Tanzania', nameZh: '坦桑尼亚',
    h1: 'Cone crushers for Tanzanian gold and graphite mining',
    sub: 'Gold, graphite, copper. A growing East African mining market with expanding crushing capacity.',
    desc: 'MACKORN cone crusher selection for Tanzania: gold, graphite, copper. Real calculations for medium-hard ore.',
    commodities: ['Gold (Geita, Kahama, Mara)', 'Graphite (Mahenge, Bunyu)', 'Copper', 'Diamonds (Mwadui)', 'Tanzanite'],
    materials: 'Gold ore · graphite ore · copper ore · granite · dolerite · basalt',
    marketNote: 'Tanzania is one of East Africa\'s most active mining markets, with gold as the leading export and graphite projects adding new crushing demand.',
    faq: [
      ['What crusher for Tanzanian gold ore?', 'Two to three stages depending on hardness; single-cylinder hydraulic cone crushers in the secondary and tertiary stages.'],
      ['Do you appoint distributors in East Africa?', 'Yes — we are recruiting distributors across East Africa with mining equipment experience.'],
      ['What capacity can you supply?', 'The NH series covers 9 models and the NS high-speed series 4 models, from a few hundred to over 1,500 t/h depending on cavity and CSS.'],
      ['How do I request a selection?', 'Send ore type, maximum feed size and target capacity to leif.dai@mackorn.cn.'],
    ] },
};

function renderCountry(cc, c) {
  const lang = c.lang;
  const m = get(c.en, '847420');
  const p = get(c.en, '847490');
  const r = ratio(c.en);
  const tr = (k) => L[k][lang] || L[k].en;
  const row = (label, v) => v ? `<tr><td>${label}</td><td><strong>${v}</strong></td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${c.h1} | MACKORN</title>
<meta name="description" content="${c.desc}">
<meta name="keywords" content="${c.name},${c.nameZh},cone crusher,britador de cone,trituradora de cono,конусная дробилка,concasseur à cône,hydraulic cone crusher,crushing plant,${c.materials},MACKORN">
<meta name="robots" content="index,follow,max-snippet:-1">
<link rel="canonical" href="${BASE}/markets/${cc}/">
<link rel="alternate" hreflang="${lang}" href="${BASE}/markets/${cc}/">
<link rel="alternate" hreflang="x-default" href="${BASE}/ai/">
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebPage', name: c.h1, description: c.desc,
    inLanguage: lang, url: `${BASE}/markets/${cc}/`,
    about: [{ '@type': 'Country', name: c.name }, { '@type': 'Thing', name: 'hydraulic cone crusher' }, { '@type': 'Thing', name: 'crusher wear parts' }],
    publisher: { '@type': 'Organization', name: COMPANY.name, url: BASE },
    isPartOf: { '@type': 'WebSite', name: 'MACKORN hydraulic cone crusher AI plugin', url: `${BASE}/ai/` },
  }, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang,
    mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
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
.muted{color:var(--muted);font-size:14px}
a{color:var(--blue)}
.btn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;margin:6px 10px 6px 0;font-weight:600;font-size:14.5px}
.btn.ghost{background:#fff;color:var(--blue);border:2px solid var(--blue)}
footer{background:#08213E;color:#B8CEE3;padding:30px 0;font-size:13.5px}
ul{padding-left:22px}
</style>
</head>
<body>

<header><div class="wrap">
<div class="crumb"><a href="${BASE}/">MACKORN</a> &rsaquo; <a href="${BASE}/ai/">AI selection plugin</a> &rsaquo; ${c.name}</div>
<h1>${c.h1}</h1>
<p>${c.sub}</p>
</div></header>

<div class="wrap">

<section>
<h2>${tr('industry')}</h2>
<p>${c.marketNote}</p>
<h3>${tr('resources')}</h3>
<ul>${c.commodities.map((x) => `<li>${x}</li>`).join('')}</ul>
${(m || p) ? `<h3>${tr('imports')}</h3>
<table>
<tr><th>HS</th><th>USD</th></tr>
${row(tr('machines'), m)}
${row(tr('parts'), p)}
${r ? `<tr><td>${lang === 'zh' ? '零件/整机倍数' : lang === 'ru' ? 'части / машины' : lang === 'pt' ? 'peças / máquinas' : lang === 'fr' ? 'pièces / machines' : 'parts / machines'}</td><td><strong>${r}</strong></td></tr>` : ''}
</table>
<p class="muted">Source: UN Comtrade public API. ${lang === 'ru' ? 'Данные по стране в целом; сведения о конкретных покупателях требуют коммерческих баз.' : lang === 'pt' ? 'Dados em nível de país; dados de compradores específicos exigem bases comerciais.' : lang === 'fr' ? 'Données au niveau du pays ; les données sur les acheteurs spécifiques nécessitent des bases commerciales.' : 'Country-level totals only; company-level buyer data requires commercial trade databases.'}</p>` : ''}
</section>

<section>
<h2>${tr('materials')}</h2>
<p>${c.materials}</p>
<div class="box">${tr('note')}</div>
</section>

<section>
<h2>FAQ</h2>
${c.faq.map(([q, a]) => `<h3>${q}</h3>\n<p>${a}</p>`).join('\n')}
</section>

<section>
<h2>${tr('contact')}</h2>
<div class="box">
<strong>${COMPANY.name} ${COMPANY.nameCn}</strong><br>
${COMPANY.addr}<br><a href="${BASE}">${BASE}</a> &middot; GMT+8 (09:00-17:30)<br>
${COMPANY.emails.join('<br>')}
</div>
<p><a class="btn" href="${BASE}/ai/">MACKORN AI plugin</a>
<a class="btn ghost" href="${BASE}/ai/parts/${lang === 'en' ? 'en/' : lang === 'ru' ? 'ru/' : lang === 'es' ? 'es/' : ''}">${lang === 'ru' ? 'Запасные части' : lang === 'pt' ? 'Peças de desgaste' : lang === 'fr' ? 'Pièces d\'usure' : 'Wear parts'}</a>
<a class="btn ghost" href="${BASE}/distributors/">${lang === 'ru' ? 'Стать дистрибьютором' : lang === 'pt' ? 'Seja distribuidor' : lang === 'fr' ? 'Devenir distributeur' : lang === 'es' ? 'Ser distribuidor' : 'Become a distributor'}</a></p>
</section>

</div>
<footer><div class="wrap">
<p style="margin:0 0 8px"><strong>${COMPANY.name}</strong></p>
<p style="margin:0">Open source under the MIT license. Vendor parameter data is copyright of Shanghai Mackorn Minerals Co., Ltd. Market data from UN Comtrade public API. No pricing on this page.</p>
</div></footer>
</body>
</html>
`;
}

let n = 0;
for (const [cc, c] of Object.entries(C)) {
  const dir = join(OUTBASE, 'markets', cc);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderCountry(cc, c), 'utf8');
  console.log('  /markets/' + cc + '/   ' + c.nameZh + ' (' + c.lang + ')  ' +
    (get(c.en, '847420') || '-') + ' / ' + (get(c.en, '847490') || '-') + ' = ' + (ratio(c.en) || '-'));
  n++;
}
console.log('\n  生成 ' + n + ' 个国家/地区页');
