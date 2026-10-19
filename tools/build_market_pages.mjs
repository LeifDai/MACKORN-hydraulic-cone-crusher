/**
 * 生成国家专属落地页 /markets/{cc}/
 *
 * 为什么需要：语言页（/ru/ /es/）是"按语言"的，国家页是"按市场"的。
 * 哈萨克客户搜「конусная дробилка Казахстан」时，国家专属页的匹配度远高于通用俄语页。
 *
 * 每个国家页包含：矿业概况（矿种+产区）→ 真实海关数据 → MACKORN 物料适配 → FAQ → 联系方式
 *
 * 注意：不写具体公司名/矿山名（未经核实不写），只写公开的矿种与产区。
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUTBASE = join(ROOT, 'distribution', '官网落地页', 'markets');
const BASE = 'https://mackorn.cn';
const REPO = 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher';

// 读已拉到的海关数据（可能还没跑完，缺失就留空）
let TRADE = {};
try { TRADE = JSON.parse(readFileSync(join(ROOT, 'distribution', 'trade-data.json'), 'utf8')).byCountry || {}; } catch { }
const usd = (country, hs) => {
  const v = TRADE[country]?.hs?.[hs]?.years?.['2023']?.usd ?? TRADE[country]?.hs?.[hs]?.years?.['2021']?.usd;
  return v ? '$' + (v / 1e6).toFixed(1) + 'M' : null;
};

const COUNTRIES = {
  kz: {
    lang: 'ru', name: 'Казахстан', en: 'Kazakhstan', nameZh: '哈萨克斯坦', cc: 'KZ',
    title: 'Конусные дробилки для Казахстана — подбор и проектирование ДСК | MACKORN',
    desc: 'Подбор гидравлических конусных дробилок MACKORN для медных, золотых, железных и полиметаллических руд Казахстана. Реальные расчёты, 19 инструментов, сервер MCP.',
    h1: 'Гидравлические конусные дробилки для горной промышленности Казахстана',
    sub: 'Подбор оборудования, компоновка дробильно-сортировочного комплекса, моделирование гранулометрии и предложение из 14 разделов — по одной анкете и целевой производительности.',
    commodities: ['Медь (Караганда, Жезказган, Балхаш)', 'Золото', 'Железная руда', 'Уран', 'Уголь', 'Полиметаллы'],
    materials: 'Медная руда · железная руда · золотосодержащая руда · гранит · базальт · диабаз',
    marketNote: 'Казахстан — крупнейший рынок горного оборудования в Центральной Азии. Импорт дробильно-помольного оборудования вырос кратно за последние годы.',
    faq: [
      ['Какая дробилка нужна для медной руды в Казахстане?', 'Обычно трёхстадийная схема: щековая или конусная дробилка крупного дробления, затем две стадии гидравлических конусных дробилок. Суммарная степень сокращения для медной руды составляет 40-60:1.'],
      ['Работаете ли вы с казахстанскими проектами?', 'Да. MACKORN поставляет гидравлические конусные дробилки серий NH (стандартная) и NS (высокоскоростная) для металлических руд и крепких пород. Свяжитесь с нами для подбора.'],
      ['Есть ли документация на русском?', 'Инструмент подбора поддерживает русский язык. Техническая документация предоставляется по запросу.'],
    ],
  },
  uz: {
    lang: 'ru', name: 'Узбекистан', en: 'Uzbekistan', nameZh: '乌兹别克斯坦', cc: 'UZ',
    title: 'Конусные дробилки для Узбекистана — подбор и проектирование | MACKORN',
    desc: 'Подбор конусных дробилок MACKORN для золотых, медных и полиметаллических руд Узбекистана. Реальные расчёты производительности и гранулометрии.',
    h1: 'Гидравлические конусные дробилки для горной промышленности Узбекистана',
    sub: 'Золото, медь, полиметаллы. Подбор оборудования по анкете требований и целевой производительности.',
    commodities: ['Золото (Навоийская область)', 'Медь (Алмалык)', 'Полиметаллы', 'Уран', 'Серебро'],
    materials: 'Золотосодержащая руда · медная руда · полиметаллическая руда · гранит · базальт',
    marketNote: 'Узбекистан — один из крупнейших производителей золота в мире. Импорт дробильно-помольного оборудования в 2023 году вышел на первое место среди рассмотренных рынков.',
    faq: [
      ['Какое оборудование нужно для золотосодержащей руды?', 'Обычно трёхстадийное дробление с последующим измельчением. Гидравлическая конусная дробилка — стандартный выбор для средней и мелкой стадий.'],
      ['Можете ли вы рассчитать производительность?', 'Да. Инструмент подбора рассчитывает суммарную степень сокращения, число стадий, модель, камеру дробления, разгрузочную щель и требуемую мощность.'],
      ['Как получить предложение?', 'Напишите на sandy.zhao@mackorn.cn или leif.dai@mackorn.cn, указав руду, максимальную крупность питания и целевую производительность.'],
    ],
  },
  co: {
    lang: 'es', name: 'Colombia', en: 'Colombia', nameZh: '哥伦比亚', cc: 'CO',
    title: 'Trituradoras de cono para Colombia — selección y diseño de planta | MACKORN',
    desc: 'Selección de trituradoras de cono hidráulicas MACKORN para minería en Colombia: oro, carbón, cobre, níquel. Cálculos reales de capacidad y granulometría.',
    h1: 'Trituradoras de cono hidráulicas para la minería colombiana',
    sub: 'Oro, carbón, cobre y níquel. Selección de equipos, configuración de planta, simulación granulométrica y propuesta de 14 secciones.',
    commodities: ['Oro (Antioquia, Bolívar)', 'Carbón (Cesar, La Guajira)', 'Cobre', 'Níquel (Córdoba)', 'Materiales de construcción'],
    materials: 'Mineral de oro · carbón · mineral de cobre · granito · basalto · andesita',
    marketNote: 'Colombia es el mercado de más rápido crecimiento relativo entre los analizados: la importación de equipos de trituración y molienda superó el 100% de crecimiento.',
    faq: [
      ['¿Qué trituradora se usa para mineral de oro?', 'Habitualmente una trituradora de cono hidráulica en las etapas secundaria y terciaria, precedida por una trituradora de mandíbulas. La selección depende de la dureza y de la granulometría de liberación.'],
      ['¿Pueden calcular la granulometría del producto?', 'Sí. El plugin incorpora el modelo estacionario de Whiten (1972): con el tamaño de alimentación y el CSS se obtienen P20/P50/P80, la relación de reducción y la energía específica (Bond 1952).'],
      ['¿Tienen representantes en Colombia?', 'Estamos ampliando nuestra red de distribuidores. Si su empresa comercializa equipos de trituración, escríbanos.'],
    ],
  },
  id: {
    lang: 'id', name: 'Indonesia', en: 'Indonesia', nameZh: '印度尼西亚', cc: 'ID',
    title: 'Cone Crusher untuk Indonesia — pemilihan & desain pabrik | MACKORN',
    desc: 'Pemilihan cone crusher hidraulik MACKORN untuk pertambangan Indonesia: nikel, tembaga, emas, bauksit. Perhitungan nyata kapasitas dan ukuran produk.',
    h1: 'Cone crusher hidraulik untuk pertambangan Indonesia',
    sub: 'Nikel, tembaga, emas, bauksit. Pemilihan peralatan, konfigurasi pabrik, simulasi ukuran produk, dan proposal 14 bagian.',
    commodities: ['Nikel (Sulawesi, Halmahera)', 'Tembaga & emas (Papua)', 'Bauksit', 'Batu bara (Kalimantan)', 'Agregat'],
    materials: 'Bijih nikel · bijih tembaga · bijih emas · granit · basal · andesit',
    marketNote: 'Indonesia adalah pusat pertumbuhan nikel dunia. Impor peralatan peremukan dan penggilingan tumbuh hampir dua kali lipat, dan pasar suku cadang (liner) sangat besar.',
    faq: [
      ['Cone crusher apa untuk bijih nikel?', 'Cone crusher hidraulik satu silinder pada tahap sekunder dan tersier. Bijih nikel laterit biasanya lebih lunak, jadi perhatikan risiko over-crushing — CSS jangan terlalu kecil.'],
      ['Bisakah ukuran produk dihitung?', 'Bisa. Plugin memakai model tunak Whiten (1972) dan estimasi energi Bond (1952); hasilnya menyertakan asumsi dan peringatan.'],
      ['Apakah ada dukungan lokal?', 'Kami sedang memperluas jaringan agen di Asia Tenggara. Hubungi kami untuk diskusi kemitraan.'],
    ],
  },
  ph: {
    lang: 'en', name: 'Philippines', en: 'Philippines', nameZh: '菲律宾', cc: 'PH',
    title: 'Cone Crushers for the Philippines — Selection & Plant Design | MACKORN',
    desc: 'MACKORN hydraulic cone crusher selection for Philippine mining: copper, gold, nickel. Real capacity and product-size calculations, 22 tools.',
    h1: 'Hydraulic cone crushers for Philippine mining',
    sub: 'Copper, gold, nickel. Equipment selection, plant configuration, product-size simulation and a 14-section proposal.',
    commodities: ['Copper & gold (Luzon, Mindanao)', 'Nickel (Surigao, Palawan)', 'Chromite', 'Aggregate'],
    materials: 'Copper ore · gold ore · nickel laterite · granite · basalt · andesite',
    marketNote: 'The Philippines has one of the fastest-growing import markets for crushing equipment, driven by copper-gold and nickel projects. English is the working language of the industry.',
    faq: [
      ['What cone crusher suits Philippine copper-gold ore?', 'A single-cylinder hydraulic cone crusher in the secondary and tertiary stages. Copper porphyry typically needs three crushing stages with a total reduction ratio of 40-60:1.'],
      ['Do you supply wear parts as well?', 'Yes — mantle and bowl liner supply is a core part of our business, and the Philippines import market for parts is substantial.'],
      ['How do I get a selection?', 'Send us the ore type, maximum feed size and target capacity. The plugin will compute the stage count, cavity, CSS and unit count, and we will confirm technically.'],
    ],
  },
  za: {
    lang: 'en', name: 'South Africa', en: 'South Africa', nameZh: '南非', cc: 'ZA',
    title: 'Cone Crushers for South Africa — Selection & Plant Design | MACKORN',
    desc: 'MACKORN hydraulic cone crusher selection for South African mining: PGM, gold, chrome, manganese. Real capacity and product-size calculations.',
    h1: 'Hydraulic cone crushers for South African mining',
    sub: 'Platinum group metals, gold, chrome, manganese and aggregate. Equipment selection through to a 14-section proposal.',
    commodities: ['Platinum group metals (Bushveld)', 'Gold', 'Chrome', 'Manganese', 'Coal', 'Aggregate'],
    materials: 'PGM ore · gold ore · chrome ore · manganese ore · granite · basalt · dolerite',
    marketNote: 'South Africa is the gateway to African mining. Import growth for crushing equipment exceeded 70%, and the parts market is nearly three times the size of the machine market.',
    faq: [
      ['What crusher for PGM and chrome ore?', 'Chrome and PGM ores are hard and abrasive — a single-cylinder hydraulic cone crusher with a coarse-to-medium cavity, and a liner grade selected for abrasion resistance.'],
      ['Is the parts market significant?', 'Yes. In South Africa the imported parts market (HS 847490) is roughly 2.7 times the size of the machine market (HS 847420), which means a large installed base of crushers needing liners.'],
      ['Do you work through distributors?', 'We are actively recruiting distributors and agents, particularly those with experience of Metso or Sandvik equipment.'],
    ],
  },
  mx: {
    lang: 'es', name: 'México', en: 'Mexico', nameZh: '墨西哥', cc: 'MX',
    title: 'Trituradoras de cono para México — selección y diseño de planta | MACKORN',
    desc: 'Selección de trituradoras de cono hidráulicas MACKORN para minería en México: plata, oro, cobre, zinc. Cálculos reales de capacidad y granulometría.',
    h1: 'Trituradoras de cono hidráulicas para la minería mexicana',
    sub: 'Plata, oro, cobre y zinc. Selección de equipos, configuración de planta y propuesta de 14 secciones.',
    commodities: ['Plata (Zacatecas, Durango)', 'Oro', 'Cobre (Sonora)', 'Zinc', 'Agregados'],
    materials: 'Mineral de plata · mineral de oro · mineral de cobre · granito · basalto · andesita',
    marketNote: 'México es el mayor productor de plata del mundo. La importación de equipos de trituración creció más del 60%, y el mercado de refacciones (revestimientos) es 2,5 veces el de máquinas.',
    faq: [
      ['¿Qué trituradora para mineral de plata?', 'Depende de la dureza. En vetas epitermales suele bastar con dos etapas; en pórfidos ricos en sílice se requieren tres, con trituradora de cono hidráulica en las etapas secundaria y terciaria.'],
      ['¿El mercado de refacciones es importante?', 'Sí. En México el mercado importado de partes (HS 847490) es aproximadamente 2,5 veces el de máquinas, lo que refleja una base instalada grande.'],
      ['¿Venden a través de distribuidores?', 'Estamos ampliando nuestra red en Latinoamérica. Escríbanos si comercializa equipos de trituración.'],
    ],
  },
};

function render(cc, C) {
  const r9420 = usd(C.en || C.name, '847420');
  const r9490 = usd(C.en || C.name, '847490');
  const row = (label, v) => v ? `<tr><td>${label}</td><td><strong>${v}</strong></td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="${C.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${C.title}</title>
<meta name="description" content="${C.desc}">
<meta name="keywords" content="${C.name},${C.nameZh},конусная дробилка,trituradora de cono,cone crusher,MACKORN,hydraulic cone crusher,crushing plant,mineral processing,${C.materials}">
<meta name="robots" content="index,follow,max-snippet:-1">
<link rel="canonical" href="${BASE}/markets/${cc}/">
<link rel="alternate" hreflang="${C.lang}" href="${BASE}/markets/${cc}/">
<link rel="alternate" hreflang="x-default" href="${BASE}/ai/">
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: C.title,
    description: C.desc,
    inLanguage: C.lang,
    url: `${BASE}/markets/${cc}/`,
    about: [{ '@type': 'Country', name: C.name }, { '@type': 'Thing', name: 'hydraulic cone crusher' }, { '@type': 'Thing', name: 'crushing plant design' }],
    publisher: { '@type': 'Organization', name: 'Shanghai Mackorn Minerals Co., Ltd.', url: BASE },
    isPartOf: { '@type': 'WebSite', name: 'MACKORN hydraulic cone crusher AI plugin', url: `${BASE}/ai/` },
  }, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: C.lang,
    mainEntity: C.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
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
<div class="crumb"><a href="${BASE}/">MACKORN</a> › <a href="${BASE}/ai/">AI selection plugin</a> › ${C.name}</div>
<h1>${C.h1}</h1>
<p>${C.sub}</p>
</div></header>

<div class="wrap">

<section>
<h2>${C.lang === 'ru' ? 'Горная промышленность' : C.lang === 'es' ? 'Industria minera' : C.lang === 'id' ? 'Industri pertambangan' : 'Mining industry'}</h2>
<p>${C.marketNote}</p>
<h3>${C.lang === 'ru' ? 'Основные полезные ископаемые' : C.lang === 'es' ? 'Principales recursos' : C.lang === 'id' ? 'Sumber daya utama' : 'Principal commodities'}</h3>
<ul>${C.commodities.map((x) => `<li>${x}</li>`).join('')}</ul>
${(r9420 || r9490) ? `
<h3>${C.lang === 'ru' ? 'Импорт оборудования (UN Comtrade, 2023)' : C.lang === 'es' ? 'Importación de equipos (UN Comtrade, 2023)' : C.lang === 'id' ? 'Impor peralatan (UN Comtrade, 2023)' : 'Equipment imports (UN Comtrade, 2023)'}</h3>
<table>
<tr><th>HS / ${C.lang === 'ru' ? 'Позиция' : 'Item'}</th><th>USD</th></tr>
${row('847420 — ' + (C.lang === 'ru' ? 'дробильно-помольное оборудование' : C.lang === 'es' ? 'máquinas de triturar' : C.lang === 'id' ? 'mesin peremuk' : 'crushing machines'), r9420)}
${row('847490 — ' + (C.lang === 'ru' ? 'запасные части' : C.lang === 'es' ? 'partes' : C.lang === 'id' ? 'suku cadang' : 'parts'), r9490)}
</table>
<p class="muted">Source: UN Comtrade public API. ${C.lang === 'ru' ? 'Данные только по стране в целом; сведения о конкретных покупателях требуют коммерческих баз.' : C.lang === 'es' ? 'Datos a nivel de país; los datos de compradores concretos requieren bases comerciales.' : C.lang === 'id' ? 'Data tingkat negara; data pembeli tertentu memerlukan basis data komersial.' : 'Country-level totals only; company-level buyer data requires commercial trade databases.'}</p>
` : ''}
</section>

<section>
<h2>${C.lang === 'ru' ? 'Подходящие материалы' : C.lang === 'es' ? 'Materiales aplicables' : C.lang === 'id' ? 'Material yang cocok' : 'Applicable materials'}</h2>
<p>${C.materials}</p>
<div class="box">
${C.lang === 'ru' ? 'Гидравлическая конусная дробилка — машина среднего и мелкого дробления. Питание крупнее примерно 350 мм требует предварительного грохочения или дробилки крупного дробления. Инструмент подбора корректно отклоняет такие запросы.' :
  C.lang === 'es' ? 'La trituradora de cono es una máquina de trituración secundaria y terciaria. Alimentación superior a unos 350 mm requiere cribado previo o una trituradora primaria. El plugin rechaza correctamente esas entradas.' :
  C.lang === 'id' ? 'Cone crusher adalah mesin peremuk sekunder dan tersier. Umpan di atas sekitar 350 mm memerlukan pengayakan awal atau crusher primer. Plugin menolak masukan seperti itu dengan benar.' :
  'A cone crusher is a secondary/tertiary machine. Feed above roughly 350 mm needs pre-screening or a primary crusher — the plugin correctly rejects such input.'}
</div>
</section>

<section>
<h2>FAQ</h2>
${C.faq.map(([q, a]) => `<h3>${q}</h3>\n<p>${a}</p>`).join('\n')}
</section>

<section>
<h2>${C.lang === 'ru' ? 'Контакты' : C.lang === 'es' ? 'Contacto' : C.lang === 'id' ? 'Kontak' : 'Contact'}</h2>
<div class="box">
<strong>Shanghai Mackorn Minerals Co., Ltd. 上海美矿机械股份有限公司</strong><br>
No.33 Qianjiang Road, Liuhe, Taicang, Suzhou, China<br>
<a href="${BASE}">${BASE}</a> · GMT+8 (09:00–17:30)<br>
sandy.zhao@mackorn.cn · +86 139 1648 5025<br>
leif.dai@mackorn.cn · +86 134 8218 0158<br>
vicky.cheng@mackorn.cn · +86 158 0189 1052
</div>
<p><a class="btn" href="${BASE}/ai/">MACKORN AI plugin</a>
<a class="btn ghost" href="${BASE}/ai/guides/">Selection guides</a>
<a class="btn ghost" href="${REPO}">GitHub</a></p>
</section>

</div>
<footer><div class="wrap">
<p style="margin:0 0 8px"><strong>Shanghai Mackorn Minerals Co., Ltd.</strong></p>
<p style="margin:0">Open source under the MIT license. Vendor parameter data is copyright of Shanghai Mackorn Minerals Co., Ltd. Process simulation uses published literature (Whiten 1972 / Bond 1952 / VSMA-Karra / JKMRC), independently implemented. No pricing on this page.</p>
</div></footer>
</body>
</html>
`;
}

let n = 0;
for (const [cc, C] of Object.entries(COUNTRIES)) {
  const dir = join(OUTBASE, cc);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), render(cc, C), 'utf8');
  console.log('  /markets/' + cc + '/   ' + C.name + ' (' + C.lang + ')');
  n++;
}
console.log('\n  生成 ' + n + ' 个国家专属页');
