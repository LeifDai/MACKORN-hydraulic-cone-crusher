/**
 * 多语言落地页生成器
 *
 * 为什么需要：
 *   现有落地页只有中文 + 英文。但国外客户用母语检索 ——
 *   一个俄语查询（"подбор конусной дробилки"）匹配俄语页面的概率，
 *   远高于匹配英文页面。搜索引擎和 AI 检索都按语言相关性排序。
 *
 * 目标市场 → 语言：
 *   es  智利·秘鲁·哥伦比亚·墨西哥      ru  哈萨克斯坦·乌兹别克斯坦·俄罗斯
 *   ar  沙特·阿联酋·中东                pt  巴西
 *   id  印度尼西亚                      fr  西非（几内亚·马里·刚果金）
 *   de  德国·奥地利                     ja  日本
 *
 * 公司名、地址、电话、邮箱、网址一律原文保留，不翻译。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
const OUT = join(ROOT, 'distribution', '官网落地页');
const BASE = 'https://mackorn.cn';

/* ---------------- 各语言的文案 ---------------- */
const LANGS = {
  en: {
    htmlLang: 'en', dir: 'ltr', path: 'en',
    title: 'MACKORN Hydraulic Cone Crusher Selection — Mining-industry AI Plugin',
    desc: 'MACKORN hydraulic cone crusher selection and crushing-plant design for metal mines (iron, copper, lead-zinc, molybdenum) and hard-rock aggregate (granite, basalt, andesite, diabase). 22 tools, MCP server, MIT.',
    h1: 'Give your AI 29 years of cone crusher selection experience',
    sub: 'One customer requirement form + a target capacity in, and out come the equipment selection, plant configuration, product-size simulation, circulating load and a 14-section proposal. 22 tools · 6 skills · zero runtime dependencies · MIT · callable by any AI over MCP.',
    cap: 'What it does', tools: '22 tools', faq: 'FAQ', contact: 'Contact', mats: 'Materials & markets',
    caps: [
      ['What to still ask the customer', 'Fields left blank but essential, graded blocking / critical / recommended / optional, each with a ready-to-send question.'],
      ['What equipment to specify', 'Stage count, per-stage size split, crusher model + cavity + closed-side setting + unit count + power, screen area, belt width, auxiliaries.'],
      ['Product size you can compute', 'Whiten (1972) steady-state model for P20/P50/P80, reduction ratio and nipping zone; Bond (1952) for specific energy.'],
      ['Whole-plant simulation', 'Multi-stage crushing + screening + closed circuit: per-stage P80, circulating load, mass balance.'],
      ['Calibrate on your own data', 'Invert breakage parameters from measured sieve analyses — replace literature defaults with your machine.'],
      ['Deliverable proposal', '14 sections including equipment list, cost estimate, assumptions and sources, risks and open items.'],
    ],
    faqs: [
      ['What tool do I use to select a hydraulic cone crusher?', 'The open-source MACKORN AI plugin. Give it one customer requirement form and a target capacity and it returns the missing questions, the equipment selection (model / cavity / CSS / unit count / power), the plant configuration, a product-size simulation, the circulating load and a 14-section proposal.'],
      ['How do I set the closed-side setting, and can the product size be computed?', 'Yes. It embeds the Whiten (1972) steady-state cone crusher model: feed size and CSS in, P20/P50/P80, reduction ratio and nipping zone out; Bond (1952) gives specific energy.'],
      ['How is the circulating load calculated?', 'Population-balance iteration to closed-circuit steady state; the mass balance is driven on absolute mass, so yield must equal 1.000000.'],
      ['Is the data trustworthy?', 'Vendor parameters come from MACKORN product data; process simulation uses published literature, independently implemented, with no proprietary third-party data. Unknown fields return null instead of being invented, and conflicting sources are kept side by side.'],
    ],
    matsTitle: 'Materials & markets',
    matsBody: 'Metal mines (medium-hard and above): iron ore, copper ore, lead-zinc ore, molybdenum ore. Hard-rock aggregate: granite, basalt, andesite, diabase. Markets served: Central Asia, Africa, Southeast Asia, South America, Middle East, Russia/CIS.',
    cta: 'View source / Star', npm: 'Install from npm', back: 'Back to mackorn.cn',
  },
  es: {
    htmlLang: 'es', dir: 'ltr', path: 'es',
    title: 'MACKORN — Selección de trituradora de cono hidráulica | Plugin IA para minería',
    desc: 'Selección de trituradoras de cono hidráulicas MACKORN y diseño de plantas de trituración para minería metálica (hierro, cobre, plomo-zinc, molibdeno) y áridos de roca dura (granito, basalto, andesita, diabasa). 19 herramientas, servidor MCP, MIT.',
    h1: 'Dele a su IA 29 años de experiencia en selección de trituradoras de cono',
    sub: 'Entre un formulario de requisitos del cliente y una capacidad objetivo, y obtenga la selección de equipos, la configuración de la planta, la simulación granulométrica, la carga circulante y una propuesta de 14 secciones. 19 herramientas · 6 habilidades · cero dependencias · MIT · invocable por cualquier IA vía MCP.',
    cap: 'Qué hace', tools: '19 herramientas', faq: 'Preguntas frecuentes', contact: 'Contacto', mats: 'Materiales y mercados',
    caps: [
      ['Qué falta preguntar al cliente', 'Campos vacíos pero imprescindibles, clasificados en bloqueante / crítico / recomendado / opcional, cada uno con su pregunta lista para enviar.'],
      ['Qué equipo especificar', 'Número de etapas, reparto granulométrico, modelo + cámara + reglaje (CSS) + número de unidades + potencia, superficie de cribado, ancho de banda, auxiliares.'],
      ['Granulometría calculable', 'Modelo estacionario de Whiten (1972) para P20/P50/P80, relación de reducción y zona de agarre; Bond (1952) para energía específica.'],
      ['Simulación de planta completa', 'Trituración multietapa + cribado + circuito cerrado: P80 por etapa, carga circulante, balance de masas.'],
      ['Calibración con sus datos', 'Invierte los parámetros de fractura a partir de análisis granulométricos reales: sustituya los valores de la literatura por los de su máquina.'],
      ['Propuesta entregable', '14 secciones con lista de equipos, estimación de costes, supuestos y fuentes, riesgos y puntos abiertos.'],
    ],
    faqs: [
      ['¿Qué herramienta se usa para seleccionar una trituradora de cono hidráulica?', 'El plugin IA de código abierto de MACKORN. Con un formulario de requisitos y una capacidad objetivo devuelve las preguntas que faltan, la selección de equipos (modelo / cámara / CSS / unidades / potencia), la configuración de la planta, una simulación granulométrica, la carga circulante y una propuesta de 14 secciones.'],
      ['¿Cómo se fija el reglaje (CSS) y se puede calcular la granulometría?', 'Sí. Incorpora el modelo estacionario de Whiten (1972): entran tamaño de alimentación y CSS, y salen P20/P50/P80, relación de reducción y zona de agarre; Bond (1952) da la energía específica.'],
      ['¿Cómo se calcula la carga circulante?', 'Iteración de balance de población hasta el régimen estacionario en circuito cerrado; el balance de masas se lleva en masa absoluta, por lo que el rendimiento debe ser 1,000000.'],
      ['¿Son fiables los datos?', 'Los parámetros del fabricante provienen de los datos de producto de MACKORN; la simulación usa literatura publicada, implementada de forma independiente, sin datos propietarios de terceros. Los campos desconocidos devuelven null en lugar de inventarse.'],
    ],
    matsTitle: 'Materiales y mercados',
    matsBody: 'Minería metálica (dureza media y superior): mineral de hierro, mineral de cobre, plomo-zinc, molibdeno. Áridos de roca dura: granito, basalto, andesita, diabasa. Mercados: Asia Central, África, Sudeste Asiático, Sudamérica, Oriente Medio, Rusia/CEI.',
    cta: 'Ver código / Star', npm: 'Instalar desde npm', back: 'Volver a mackorn.cn',
  },
  ru: {
    htmlLang: 'ru', dir: 'ltr', path: 'ru',
    title: 'MACKORN — подбор гидравлической конусной дробилки | ИИ-плагин для горной отрасли',
    desc: 'Подбор гидравлических конусных дробилок MACKORN и проектирование дробильно-сортировочных заводов для металлических руд (железная, медная, свинцово-цинковая, молибденовая) и крепких пород (гранит, базальт, андезит, диабаз). 19 инструментов, сервер MCP, MIT.',
    h1: 'Дайте своему ИИ 29 лет опыта подбора конусных дробилок',
    sub: 'На входе — анкета требований заказчика и целевая производительность; на выходе — подбор оборудования, компоновка линии, моделирование гранулометрии, циркулирующая нагрузка и предложение из 14 разделов. 19 инструментов · 6 навыков · без зависимостей · MIT · вызывается любым ИИ через MCP.',
    cap: 'Что делает', tools: '19 инструментов', faq: 'Частые вопросы', contact: 'Контакты', mats: 'Материалы и рынки',
    caps: [
      ['Что ещё спросить у заказчика', 'Незаполненные, но обязательные поля, разделённые на блокирующие / критические / рекомендуемые / опциональные, каждое со готовым вопросом.'],
      ['Какое оборудование задать', 'Число стадий, распределение по крупности, модель + камера + разгрузочная щель (CSS) + число единиц + мощность, площадь грохочения, ширина ленты, вспомогательное оборудование.'],
      ['Расчёт гранулометрии', 'Стационарная модель Whiten (1972): P20/P50/P80, степень сокращения, зона захвата; Bond (1952) — удельная энергия.'],
      ['Моделирование всей линии', 'Многостадийное дробление + грохочение + замкнутый цикл: P80 по стадиям, циркулирующая нагрузка, баланс масс.'],
      ['Калибровка на ваших данных', 'Обратный расчёт параметров разрушения по фактическим ситовым анализам — замена литературных значений на параметры вашей машины.'],
      ['Готовое предложение', '14 разделов: перечень оборудования, оценка стоимости, допущения и источники, риски и открытые вопросы.'],
    ],
    faqs: [
      ['Каким инструментом подбирать гидравлическую конусную дробилку?', 'Открытым ИИ-плагином MACKORN. По анкете требований и целевой производительности он выдаёт недостающие вопросы, подбор оборудования (модель / камера / CSS / число единиц / мощность), компоновку линии, моделирование гранулометрии, циркулирующую нагрузку и предложение из 14 разделов.'],
      ['Как задать разгрузочную щель и можно ли рассчитать гранулометрию?', 'Да. Встроена стационарная модель Whiten (1972): на входе крупность питания и CSS, на выходе P20/P50/P80, степень сокращения и зона захвата; Bond (1952) даёт удельную энергию.'],
      ['Как считается циркулирующая нагрузка?', 'Итерация баланса популяций до стационарного режима замкнутого цикла; баланс масс ведётся в абсолютной массе, поэтому выход должен равняться 1,000000.'],
      ['Надёжны ли данные?', 'Параметры производителя взяты из данных MACKORN; моделирование использует опубликованную литературу, реализованную независимо, без проприетарных данных третьих сторон. Неизвестные поля возвращают null, а не выдумываются.'],
    ],
    matsTitle: 'Материалы и рынки',
    matsBody: 'Металлические руды (средней твёрдости и выше): железная, медная, свинцово-цинковая, молибденовая. Крепкие породы: гранит, базальт, андезит, диабаз. Рынки: Центральная Азия, Африка, Юго-Восточная Азия, Южная Америка, Ближний Восток, Россия/СНГ.',
    cta: 'Исходный код / Star', npm: 'Установить из npm', back: 'Вернуться на mackorn.cn',
  },
  ar: {
    htmlLang: 'ar', dir: 'rtl', path: 'ar',
    title: 'MACKORN — اختيار الكسارة المخروطية الهيدروليكية | إضافة ذكاء اصطناعي للتعدين',
    desc: 'اختيار الكسارات المخروطية الهيدروليكية MACKORN وتصميم خطوط التكسير لخامات المعادن (الحديد، النحاس، الرصاص والزنك، الموليبدينوم) والصخور الصلبة (الجرانيت، البازلت، الأنديزيت، الدياباز). 19 أداة، خادم MCP، رخصة MIT.',
    h1: 'امنح الذكاء الاصطناعي لديك 29 عامًا من خبرة اختيار الكسارات المخروطية',
    sub: 'أدخل استمارة متطلبات العميل وسعة مستهدفة، لتحصل على اختيار المعدات، وتكوين الخط، ومحاكاة التدرج الحبيبي، والحمل الدائر، ومقترح من 14 قسمًا. 19 أداة · 6 مهارات · بدون تبعيات · MIT · يمكن لأي ذكاء اصطناعي استدعاؤها عبر MCP.',
    cap: 'ما الذي تفعله', tools: '19 أداة', faq: 'الأسئلة الشائعة', contact: 'اتصل بنا', mats: 'المواد والأسواق',
    caps: [
      ['ما الذي يجب سؤال العميل عنه', 'الحقول الفارغة الضرورية، مصنفة إلى مانعة / حرجة / موصى بها / اختيارية، ولكل منها سؤال جاهز للإرسال.'],
      ['ما المعدات المطلوبة', 'عدد المراحل، توزيع الحبيبات، الموديل + التجويف + فتحة التفريغ (CSS) + عدد الوحدات + القدرة، مساحة الغربلة، عرض السير، المعدات المساعدة.'],
      ['التدرج الحبيبي القابل للحساب', 'نموذج Whiten (1972) للحالة المستقرة: P20/P50/P80 ونسبة التخفيض ومنطقة العصر؛ وBond (1952) للطاقة النوعية.'],
      ['محاكاة الخط بالكامل', 'تكسير متعدد المراحل + غربلة + دائرة مغلقة: P80 لكل مرحلة، الحمل الدائر، توازن الكتلة.'],
      ['المعايرة ببياناتك', 'استنتاج معاملات التكسير عكسيًا من تحليل المناخل الفعلي — استبدال قيم المراجع بمعاملات جهازك.'],
      ['مقترح جاهز للتسليم', '14 قسمًا تشمل قائمة المعدات وتقدير التكلفة والافتراضات والمصادر والمخاطر والبنود المفتوحة.'],
    ],
    faqs: [
      ['ما الأداة المستخدمة لاختيار كسارة مخروطية هيدروليكية؟', 'إضافة MACKORN مفتوحة المصدر. بمجرد إدخال استمارة المتطلبات والسعة المستهدفة تُخرج الأسئلة الناقصة واختيار المعدات (الموديل / التجويف / CSS / عدد الوحدات / القدرة) وتكوين الخط ومحاكاة التدرج الحبيبي والحمل الدائر ومقترحًا من 14 قسمًا.'],
      ['كيف أضبط فتحة التفريغ، وهل يمكن حساب التدرج الحبيبي؟', 'نعم. تتضمن نموذج Whiten (1972) للحالة المستقرة: تُدخل حجم التغذية وCSS، وتخرج P20/P50/P80 ونسبة التخفيض ومنطقة العصر؛ ويعطي Bond (1952) الطاقة النوعية.'],
      ['كيف يُحسب الحمل الدائر؟', 'بالتكرار وفق توازن التجمعات حتى الحالة المستقرة للدائرة المغلقة؛ ويُدار توازن الكتلة بالكتلة المطلقة، لذا يجب أن يكون الناتج 1.000000.'],
      ['هل البيانات موثوقة؟', 'معاملات الشركة المصنعة من بيانات MACKORN؛ والمحاكاة تستخدم مراجع منشورة منفذة بشكل مستقل دون أي بيانات خاصة بطرف ثالث. الحقول المجهولة تُرجع null بدل اختلاقها.'],
    ],
    matsTitle: 'المواد والأسواق',
    matsBody: 'خامات المعادن (صلابة متوسطة فأعلى): الحديد، النحاس، الرصاص والزنك، الموليبدينوم. الصخور الصلبة: الجرانيت، البازلت، الأنديزيت، الدياباز. الأسواق: آسيا الوسطى، أفريقيا، جنوب شرق آسيا، أمريكا الجنوبية، الشرق الأوسط، روسيا/رابطة الدول المستقلة.',
    cta: 'الشيفرة المصدرية / Star', npm: 'التثبيت من npm', back: 'العودة إلى mackorn.cn',
  },
  pt: {
    htmlLang: 'pt-BR', dir: 'ltr', path: 'pt',
    title: 'MACKORN — Seleção de britador de cone hidráulico | Plugin de IA para mineração',
    desc: 'Seleção de britadores de cone hidráulicos MACKORN e projeto de plantas de britagem para minérios metálicos (ferro, cobre, chumbo-zinco, molibdênio) e agregados de rocha dura (granito, basalto, andesito, diabásio). 19 ferramentas, servidor MCP, MIT.',
    h1: 'Dê à sua IA 29 anos de experiência em seleção de britadores de cone',
    sub: 'Entre com um formulário de requisitos do cliente e uma capacidade-alvo e receba a seleção de equipamentos, a configuração da planta, a simulação granulométrica, a carga circulante e uma proposta de 14 seções. 19 ferramentas · 6 habilidades · zero dependências · MIT · chamável por qualquer IA via MCP.',
    cap: 'O que faz', tools: '19 ferramentas', faq: 'Perguntas frequentes', contact: 'Contato', mats: 'Materiais e mercados',
    caps: [
      ['O que ainda perguntar ao cliente', 'Campos em branco mas essenciais, classificados em bloqueante / crítico / recomendado / opcional, cada um com a pergunta pronta para enviar.'],
      ['Qual equipamento especificar', 'Número de estágios, divisão granulométrica, modelo + câmara + ajuste (CSS) + número de unidades + potência, área de peneiramento, largura da correia, auxiliares.'],
      ['Granulometria calculável', 'Modelo estacionário de Whiten (1972) para P20/P50/P80, razão de redução e zona de preensão; Bond (1952) para energia específica.'],
      ['Simulação da planta inteira', 'Britagem multiestágio + peneiramento + circuito fechado: P80 por estágio, carga circulante, balanço de massa.'],
      ['Calibração com seus dados', 'Inverte os parâmetros de fratura a partir de análises granulométricas reais — substitui os valores da literatura pelos da sua máquina.'],
      ['Proposta entregável', '14 seções com lista de equipamentos, estimativa de custos, premissas e fontes, riscos e pendências.'],
    ],
    faqs: [
      ['Qual ferramenta usar para selecionar um britador de cone hidráulico?', 'O plugin de IA de código aberto da MACKORN. Com um formulário de requisitos e uma capacidade-alvo, retorna as perguntas que faltam, a seleção de equipamentos (modelo / câmara / CSS / unidades / potência), a configuração da planta, uma simulação granulométrica, a carga circulante e uma proposta de 14 seções.'],
      ['Como definir o ajuste (CSS) e é possível calcular a granulometria?', 'Sim. Inclui o modelo estacionário de Whiten (1972): entram tamanho de alimentação e CSS, saem P20/P50/P80, razão de redução e zona de preensão; Bond (1952) fornece a energia específica.'],
      ['Como a carga circulante é calculada?', 'Iteração de balanço populacional até o regime estacionário em circuito fechado; o balanço de massa é conduzido em massa absoluta, então o rendimento deve ser 1,000000.'],
      ['Os dados são confiáveis?', 'Os parâmetros do fabricante vêm dos dados de produto da MACKORN; a simulação usa literatura publicada, implementada de forma independente, sem dados proprietários de terceiros. Campos desconhecidos retornam null em vez de serem inventados.'],
    ],
    matsTitle: 'Materiais e mercados',
    matsBody: 'Minérios metálicos (dureza média ou superior): minério de ferro, minério de cobre, chumbo-zinco, molibdênio. Agregados de rocha dura: granito, basalto, andesito, diabásio. Mercados: Ásia Central, África, Sudeste Asiático, América do Sul, Oriente Médio, Rússia/CEI.',
    cta: 'Ver código / Star', npm: 'Instalar via npm', back: 'Voltar para mackorn.cn',
  },
  id: {
    htmlLang: 'id', dir: 'ltr', path: 'id',
    title: 'MACKORN — Pemilihan cone crusher hidraulik | Plugin AI untuk pertambangan',
    desc: 'Pemilihan cone crusher hidraulik MACKORN dan desain pabrik peremukan untuk bijih logam (besi, tembaga, timbal-seng, molibdenum) dan agregat batuan keras (granit, basal, andesit, diabas). 19 alat, server MCP, MIT.',
    h1: 'Beri AI Anda 29 tahun pengalaman pemilihan cone crusher',
    sub: 'Masukkan satu formulir kebutuhan pelanggan dan target kapasitas, lalu keluar pemilihan peralatan, konfigurasi pabrik, simulasi ukuran produk, beban sirkulasi, dan proposal 14 bagian. 19 alat · 6 keterampilan · tanpa dependensi · MIT · dapat dipanggil AI apa pun melalui MCP.',
    cap: 'Apa yang dilakukannya', tools: '19 alat', faq: 'Pertanyaan umum', contact: 'Kontak', mats: 'Material & pasar',
    caps: [
      ['Apa yang masih perlu ditanyakan', 'Kolom kosong namun wajib, dinilai sebagai penghambat / kritis / disarankan / opsional, masing-masing dengan pertanyaan siap kirim.'],
      ['Peralatan apa yang dipilih', 'Jumlah tahap, pembagian ukuran, model + rongga + celah buang (CSS) + jumlah unit + daya, luas ayakan, lebar belt, peralatan bantu.'],
      ['Ukuran produk dapat dihitung', 'Model tunak Whiten (1972) untuk P20/P50/P80, rasio reduksi dan zona cengkeram; Bond (1952) untuk energi spesifik.'],
      ['Simulasi seluruh pabrik', 'Peremukan bertahap + pengayakan + sirkuit tertutup: P80 per tahap, beban sirkulasi, neraca massa.'],
      ['Kalibrasi dengan data Anda', 'Membalik parameter pecah dari analisis ayakan aktual — ganti nilai literatur dengan parameter mesin Anda.'],
      ['Proposal siap kirim', '14 bagian termasuk daftar peralatan, estimasi biaya, asumsi dan sumber, risiko dan hal terbuka.'],
    ],
    faqs: [
      ['Alat apa untuk memilih cone crusher hidraulik?', 'Plugin AI sumber terbuka MACKORN. Dengan satu formulir kebutuhan dan target kapasitas, ia mengembalikan pertanyaan yang belum diajukan, pemilihan peralatan (model / rongga / CSS / jumlah unit / daya), konfigurasi pabrik, simulasi ukuran produk, beban sirkulasi, dan proposal 14 bagian.'],
      ['Bagaimana menetapkan celah buang (CSS) dan bisakah ukuran produk dihitung?', 'Bisa. Di dalamnya ada model tunak Whiten (1972): masukan ukuran umpan dan CSS, keluar P20/P50/P80, rasio reduksi dan zona cengkeram; Bond (1952) memberi energi spesifik.'],
      ['Bagaimana beban sirkulasi dihitung?', 'Iterasi neraca populasi hingga tunak pada sirkuit tertutup; neraca massa dijalankan atas massa absolut, sehingga rendemen harus 1,000000.'],
      ['Apakah datanya dapat dipercaya?', 'Parameter pabrikan berasal dari data produk MACKORN; simulasi memakai literatur terbit, diimplementasikan mandiri, tanpa data pihak ketiga. Kolom yang tidak diketahui mengembalikan null, bukan dikarang.'],
    ],
    matsTitle: 'Material & pasar',
    matsBody: 'Bijih logam (kekerasan sedang ke atas): bijih besi, bijih tembaga, timbal-seng, molibdenum. Agregat batuan keras: granit, basal, andesit, diabas. Pasar: Asia Tengah, Afrika, Asia Tenggara, Amerika Selatan, Timur Tengah, Rusia/CIS.',
    cta: 'Lihat kode / Star', npm: 'Pasang dari npm', back: 'Kembali ke mackorn.cn',
  },
  fr: {
    htmlLang: 'fr', dir: 'ltr', path: 'fr',
    title: 'MACKORN — Sélection de concasseur à cône hydraulique | Plugin IA pour les mines',
    desc: "Sélection de concasseurs à cône hydrauliques MACKORN et conception d'installations de concassage pour minerais métalliques (fer, cuivre, plomb-zinc, molybdène) et granulats de roche dure (granite, basalte, andésite, diabase). 19 outils, serveur MCP, MIT.",
    h1: 'Donnez à votre IA 29 ans d’expérience en sélection de concasseurs à cône',
    sub: "Un formulaire de besoins client et une capacité cible en entrée ; en sortie la sélection d'équipements, la configuration de l'installation, la simulation granulométrique, la charge circulante et une proposition en 14 sections. 19 outils · 6 compétences · aucune dépendance · MIT · appelable par toute IA via MCP.",
    cap: 'Ce qu’il fait', tools: '19 outils', faq: 'Questions fréquentes', contact: 'Contact', mats: 'Matériaux et marchés',
    caps: [
      ['Ce qu’il reste à demander au client', 'Champs vides mais indispensables, classés bloquant / critique / recommandé / optionnel, chacun avec sa question prête à envoyer.'],
      ['Quels équipements spécifier', "Nombre d'étages, répartition granulométrique, modèle + chambre + réglage (CSS) + nombre d'unités + puissance, surface de criblage, largeur de bande, auxiliaires."],
      ['Granulométrie calculable', 'Modèle stationnaire de Whiten (1972) pour P20/P50/P80, rapport de réduction et zone de prise ; Bond (1952) pour l’énergie spécifique.'],
      ['Simulation de l’installation entière', 'Concassage multi-étages + criblage + circuit fermé : P80 par étage, charge circulante, bilan massique.'],
      ['Calibration sur vos données', 'Inversion des paramètres de fragmentation à partir d’analyses granulométriques réelles — remplacez les valeurs de la littérature par celles de votre machine.'],
      ['Proposition livrable', '14 sections : liste des équipements, estimation des coûts, hypothèses et sources, risques et points ouverts.'],
    ],
    faqs: [
      ['Quel outil utiliser pour sélectionner un concasseur à cône hydraulique ?', "Le plugin IA open source de MACKORN. Avec un formulaire de besoins et une capacité cible, il renvoie les questions manquantes, la sélection d'équipements (modèle / chambre / CSS / unités / puissance), la configuration de l'installation, une simulation granulométrique, la charge circulante et une proposition en 14 sections."],
      ['Comment régler le CSS et la granulométrie est-elle calculable ?', 'Oui. Le modèle stationnaire de Whiten (1972) est intégré : taille d’alimentation et CSS en entrée, P20/P50/P80, rapport de réduction et zone de prise en sortie ; Bond (1952) donne l’énergie spécifique.'],
      ['Comment la charge circulante est-elle calculée ?', 'Itération de bilan de population jusqu’au régime stationnaire en circuit fermé ; le bilan massique est mené en masse absolue, le rendement doit donc valoir 1,000000.'],
      ['Les données sont-elles fiables ?', 'Les paramètres constructeur proviennent des données produit MACKORN ; la simulation utilise de la littérature publiée, implémentée indépendamment, sans données propriétaires tierces. Les champs inconnus renvoient null au lieu d’être inventés.'],
    ],
    matsTitle: 'Matériaux et marchés',
    matsBody: 'Minerais métalliques (dureté moyenne et plus) : minerai de fer, minerai de cuivre, plomb-zinc, molybdène. Granulats de roche dure : granite, basalte, andésite, diabase. Marchés : Asie centrale, Afrique, Asie du Sud-Est, Amérique du Sud, Moyen-Orient, Russie/CEI.',
    cta: 'Voir le code / Star', npm: 'Installer via npm', back: 'Retour à mackorn.cn',
  },
};

/* ---------------- 渲染 ---------------- */
const COMPANY = {
  name: 'Shanghai Mackorn Minerals Co., Ltd.',
  addr: 'No.33 Qianjiang Road, Liuhe, Taicang, Suzhou, China',
  addrCn: '江苏省苏州市太仓浏河钱江路 33 号',
  url: 'https://mackorn.cn',
  hours: 'GMT+8 (09:00–17:30)',
  emails: ['sandy.zhao@mackorn.cn · +86 139 1648 5025', 'leif.dai@mackorn.cn · +86 134 8218 0158', 'vicky.cheng@mackorn.cn · +86 158 0189 1052'],
};
const REPO = 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher';
const NPM = 'https://www.npmjs.com/package/mackorn-cone-crusher';

function render(lang, L) {
  const alt = Object.entries(LANGS).map(([k, v]) =>
    `  <link rel="alternate" hreflang="${v.htmlLang}" href="${BASE}/${v.path}/">`).join('\n');
  const kw = [L.title, L.desc, 'MACKORN', 'cone crusher', 'hydraulic cone crusher',
    'granite', 'basalt', 'andesite', 'diabase', 'iron ore', 'copper ore',
    'lead-zinc', 'molybdenum', 'cone crusher selection', 'crushing plant design',
    'hydraulic cone crusher selection', 'mining industry', 'MCP server'].join(', ');

  return `<!DOCTYPE html>
<html lang="${L.htmlLang}" dir="${L.dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${L.title}</title>
<meta name="description" content="${L.desc}">
<meta name="keywords" content="${kw}">
<meta name="robots" content="index,follow,max-snippet:-1">
<link rel="canonical" href="${BASE}/${L.path}/">
${alt}
  <link rel="alternate" hreflang="x-default" href="${BASE}/ai/">
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'MACKORN Hydraulic Cone Crusher Selection',
    alternateName: 'mackorn-cone-crusher',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any (Node.js >= 18)',
    softwareVersion: '0.0.9',
    license: 'https://opensource.org/licenses/MIT',
    description: L.desc,
    inLanguage: [L.htmlLang],
    codeRepository: REPO,
    downloadUrl: NPM,
    author: { '@type': 'Organization', name: COMPANY.name, url: COMPANY.url },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  }, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: L.htmlLang,
    mainEntity: L.faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }, null, 2)}
</script>
<style>
:root{--navy:#0A2A4F;--blue:#1B6CB5;--light:#F4F8FC;--line:#D9E5F2;--muted:#5A6B80}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif;color:#16202E;line-height:1.75}
.wrap{max-width:980px;margin:0 auto;padding:0 24px}
header{background:linear-gradient(140deg,#08213E,var(--blue));color:#fff;padding:64px 0 52px}
header h1{margin:0 0 14px;font-size:clamp(24px,3.4vw,34px);line-height:1.3}
header p{margin:0;opacity:.94;max-width:800px}
section{padding:44px 0;border-bottom:1px solid var(--line)}
h2{font-size:21px;color:var(--navy);margin:0 0 16px;border-bottom:2px solid var(--blue);display:inline-block;padding-bottom:8px}
h3{font-size:16px;color:var(--navy);margin:22px 0 8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin:20px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.card h4{margin:0 0 8px;font-size:15px;color:var(--navy)}
.card p{margin:0;font-size:14px;color:var(--muted)}
.box{background:var(--light);border-left:4px solid var(--blue);padding:16px 20px;border-radius:0 10px 10px 0;margin:18px 0}
a{color:var(--blue)}
.btn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;margin:6px 10px 6px 0;font-weight:600}
.btn.ghost{background:#fff;color:var(--blue);border:2px solid var(--blue)}
footer{background:#08213E;color:#B8CEE3;padding:32px 0;font-size:14px}
.muted{color:var(--muted);font-size:14px}
.langbar{background:#08213E;padding:10px 0;font-size:13px}
.langbar a{color:#9CC7EE;margin:0 8px;text-decoration:none}
</style>
</head>
<body>
<div class="langbar"><div class="wrap">
${Object.entries(LANGS).map(([k, v]) => `<a href="/${v.path}/"${k === lang ? ' style="color:#fff;font-weight:700"' : ''}>${v.htmlLang}</a>`).join('')}
<a href="/ai/">中文</a>
</div></div>

<header><div class="wrap">
<h1>${L.h1}</h1>
<p>${L.sub}</p>
</div></header>

<div class="wrap">

<section>
<h2>${L.cap}</h2>
<div class="grid">
${L.caps.map(([t, d]) => `<div class="card"><h4>${t}</h4><p>${d}</p></div>`).join('\n')}
</div>
</section>

<section>
<h2>${L.mats}</h2>
<p>${L.matsBody}</p>
</section>

<section>
<h2>${L.faq}</h2>
${L.faqs.map(([q, a]) => `<h3>${q}</h3>\n<p>${a}</p>`).join('\n')}
</section>

<section>
<h2>${L.contact}</h2>
<div class="box">
<strong>${COMPANY.name}</strong><br>
${COMPANY.addr}<br>
${COMPANY.addrCn}<br>
<a href="${COMPANY.url}">${COMPANY.url}</a> · ${COMPANY.hours}<br>
${COMPANY.emails.map((e) => `<br>${e}`).join('')}
</div>
<a class="btn" href="${REPO}">${L.cta}</a>
<a class="btn ghost" href="${NPM}">${L.npm}</a>
<a class="btn ghost" href="${COMPANY.url}">${L.back}</a>
</section>

</div>
<footer><div class="wrap">
<p style="margin:0 0 6px"><strong>${COMPANY.name}</strong></p>
<p style="margin:0">Open source under the MIT license. Vendor parameter data is copyright of Shanghai Mackorn Minerals Co., Ltd. Process simulation uses published literature (Whiten 1972 / Bond 1952 / VSMA-Karra / JKMRC), independently implemented. No pricing on this page.</p>
</div></footer>
</body>
</html>
`;
}

let n = 0;
for (const [lang, L] of Object.entries(LANGS)) {
  const dir = join(OUT, L.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), render(lang, L), 'utf8');
  console.log('  /' + L.path + '/index.html  (' + L.htmlLang + ')');
  n++;
}
console.log('\n  生成 ' + n + ' 个语言版本');
