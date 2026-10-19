/**
 * 经销商 / 代理商招募页 /distributors/
 *
 * 为什么单独建页：
 *   1. 经销商是独立目标群（不是终端矿主），诉求完全不同：要利润、要区域保护、要技术支持
 *   2. 用户明确提到"实用 AI 的经销商"——核心卖点：
 *      【经销商可以用我们的插件做专业售前选型，不需要自己养工程师】
 *   3. 经销商在搜 "cone crusher distributor" / "mining equipment agent"
 *      而不是搜产品参数 —— 需要独立关键词覆盖
 *
 * 多语言：EN（主）· ZH · ES · RU · PT · FR
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUTBASE = join(ROOT, 'distribution', '官网落地页', 'distributors');
const BASE = 'https://mackorn.cn';
const REPO = 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher';

const COMPANY = {
  name: 'Shanghai Mackorn Minerals Co., Ltd.', nameCn: '上海美矿机械股份有限公司',
  addr: 'No.33 Qianjiang Road, Liuhe, Taicang, Suzhou, China', addrCn: '江苏省苏州市太仓浏河钱江路 33 号',
  emails: ['sandy.zhao@mackorn.cn · +86 139 1648 5025', 'leif.dai@mackorn.cn · +86 134 8218 0158', 'vicky.cheng@mackorn.cn · +86 158 0189 1052'],
};

const T = {
  en: {
    htmlLang: 'en', crumb: 'Become a distributor',
    title: 'Become a MACKORN Distributor — Cone Crushers & Wear Parts',
    desc: 'Distributor and agent opportunities for MACKORN hydraulic cone crushers and wear parts in Chile, Peru, Brazil, Kazakhstan, Uzbekistan, Indonesia, the Philippines, South Africa, Australia, Canada, Ghana, Zambia and more.',
    h1: 'Become a MACKORN distributor',
    sub: 'We are recruiting distributors and agents for hydraulic cone crushers and wear parts across Latin America, Central Asia, Africa, Southeast Asia and the Middle East. If you already sell crushing or screening equipment, you can start quoting professionally on day one — with our free selection tool doing the engineering.',
    pitchTitle: 'The unusual part: you do not need an engineer on staff',
    pitchBody: 'Most manufacturers hand a distributor a catalogue and leave them to it. We hand you the engineering tool as well. Our open-source selection plugin computes the stage count, cavity, closed-side setting, unit count, power, product-size curve and circulating load from nothing more than your customer\'s ore type, feed size and target capacity. You screenshot the result into your quotation. Your customer sees a professional, documented selection — not a guess.',
    toolsTitle: 'What you get',
    tools: [
      ['Free engineering tool', '22 tools covering selection, plant configuration, product-size simulation, cost estimation and proposal generation. Works in 12 languages including English, Spanish, Russian, Portuguese, French, Arabic and Indonesian.'],
      ['Ready-made proposals', 'A 14-section proposal generator: project scope, design basis, process flowsheet, equipment list, technical parameters, electrical, dust control, civil works, supply scope, cost estimate and risk items.'],
      ['Technical training', 'Remote or on-site training for your sales engineers, plus access to our technical team for project-specific questions.'],
      ['Wear parts supply', 'Mantles and bowl liners for the whole NH/NS range — the recurring revenue that makes a distributorship worthwhile.'],
      ['Territory and pricing', 'Defined territory, protected project registration and a distributor price schedule.'],
      ['Marketing material', 'Product literature, reference projects and a public selection page you can link your customers to.'],
    ],
    lookTitle: 'What we look for',
    look: [
      'Established presence in mining, aggregates or construction equipment',
      'Existing relationships with mines, quarries or EPC contractors',
      'Technical sales capability, or willingness to be trained',
      'Ability to hold wear-parts stock',
      'Experience with Metso, Sandvik, Terex or similar equipment is a strong plus',
    ],
    regionsTitle: 'Priority regions',
    regions: [
      ['Central Asia', 'Kazakhstan, Uzbekistan — the largest crusher import markets we have measured, and fast growing', '$615M combined'],
      ['Latin America', 'Chile, Peru, Brazil, Mexico, Colombia — copper and gold, with very large wear-parts markets', 'parts 2.3–6.3× machines'],
      ['Africa', 'South Africa, Zambia, DRC, Ghana, Tanzania — gateway to the copperbelt and gold belts', 'parts up to 73× machines'],
      ['Southeast Asia', 'Indonesia, Philippines, Vietnam, Malaysia — nickel, copper-gold and aggregate', 'fast growing'],
      ['Australia & Canada', 'The world\'s two largest imported wear-parts markets', '$562M and $556M'],
      ['Middle East', 'Saudi Arabia, UAE, Turkey, Iran', 'combined $270M parts'],
    ],
    stepsTitle: 'How to apply',
    steps: [
      ['1. Send us your profile', 'Company name, country, years in business, current product lines, customer types and typical project size.'],
      ['2. Short call', 'A 30-minute call to understand your market and what you need from us.'],
      ['3. Trial project', 'We support you on one real customer project — selection, proposal and pricing.'],
      ['4. Agreement', 'Territory, pricing schedule and technical support terms.'],
    ],
    faq: [
      ['Do I need to be an existing equipment dealer?', 'You need an established presence in mining, aggregates or construction equipment, and existing relationships with mines, quarries or EPC contractors. Experience with Metso, Sandvik or Terex equipment helps but is not essential.'],
      ['What technical support do I get?', 'A free open-source selection tool covering 19 functions in 12 languages, plus direct access to our technical team. Your salespeople can produce a documented selection without an in-house engineer.'],
      ['Is there territory protection?', 'Yes — defined territory and project registration. Terms are agreed as part of the distributor agreement.'],
      ['Is there a minimum order?', 'Terms depend on the market and the product mix. Wear parts typically carry a lower threshold than complete machines, which makes them a practical way to start.'],
      ['Why are wear parts worth stocking?', 'Because in most markets imported parts are worth 2 to 6 times imported machines — in Chile 6.3×, in Ghana 73×. Once a crusher is running, liners are replaced every year for 5 to 10 years.'],
      ['How do I start?', 'Email leif.dai@mackorn.cn with your company profile and the region you cover.'],
    ],
  },
  zh: {
    htmlLang: 'zh-CN', crumb: '成为代理商',
    title: '成为 MACKORN 美矿代理商 —— 圆锥破与耐磨件',
    desc: 'MACKORN 美矿液压圆锥破与衬板耐磨件的代理商招募：智利、秘鲁、巴西、哈萨克斯坦、乌兹别克斯坦、印尼、菲律宾、南非、澳大利亚、加拿大、加纳、赞比亚等。',
    h1: '成为 MACKORN 美矿代理商',
    sub: '我们在拉美、中亚、非洲、东南亚和中东招募液压圆锥破与耐磨件的代理商。如果您已经在卖破碎或筛分设备，第一天就能专业报价——因为工程计算由我们的免费选型工具完成。',
    pitchTitle: '不一样的地方：您不需要养工程师',
    pitchBody: '多数厂家给代理一本样本就放手了。我们除了样本，还把工程工具交给您。我们的开源选型插件，只要输入客户的矿石种类、给料粒度和目标产量，就能算出破碎段数、腔型、排矿口、台数、功率、产品粒度曲线和循环负荷。您把结果截图放进报价单——客户看到的是专业的、有依据的选型，不是猜的。',
    toolsTitle: '您能得到什么',
    tools: [
      ['免费的工程工具', '23 个工具，覆盖选型、整线配置、粒度仿真、成本估算和方案书生成。支持 12 种语言，含英语、西班牙语、俄语、葡萄牙语、法语、阿拉伯语、印尼语。'],
      ['现成的方案书', '14 节方案生成器：项目概况、设计依据、工艺流程、设备清单、技术参数、电气、除尘、土建、供货范围、投资估算与风险项。'],
      ['技术培训', '远程或现场培训您的销售工程师，并可随时就具体项目咨询我们的技术团队。'],
      ['耐磨件供应', '覆盖 NH/NS 全系列的破碎壁与轧臼壁——这是让代理生意真正赚钱的持续性收入。'],
      ['区域与价格', '明确的区域划分、项目报备保护和代理价格表。'],
      ['市场物料', '产品资料、参考项目，以及一个可以给客户看的公开选型页面。'],
    ],
    lookTitle: '我们希望您是',
    look: [
      '在矿山、骨料或工程机械领域已有稳定业务',
      '已有矿山、采石场或 EPC 总包商的客户关系',
      '具备技术销售能力，或愿意接受培训',
      '有能力备耐磨件库存',
      '有美卓、山特维克、特雷克斯等设备的经验是加分项',
    ],
    regionsTitle: '优先区域',
    regions: [
      ['中亚', '哈萨克斯坦、乌兹别克斯坦——我们实测的最大破碎设备进口市场，且高速增长', '合计 6.15 亿美元'],
      ['拉美', '智利、秘鲁、巴西、墨西哥、哥伦比亚——铜与金，耐磨件市场极大', '零件是整机的 2.3–6.3 倍'],
      ['非洲', '南非、赞比亚、刚果金、加纳、坦桑尼亚——铜带与金矿带门户', '零件最高达整机的 73 倍'],
      ['东南亚', '印尼、菲律宾、越南、马来西亚——镍、铜金与骨料', '高速增长'],
      ['澳大利亚与加拿大', '全球最大的两个耐磨件进口市场', '5.62 亿与 5.57 亿美元'],
      ['中东', '沙特、阿联酋、土耳其、伊朗', '零件合计 2.7 亿美元'],
    ],
    stepsTitle: '如何申请',
    steps: [
      ['1. 发来您的资料', '公司名称、所在国、经营年限、现有产品线、客户类型、典型项目规模。'],
      ['2. 一次简短通话', '30 分钟，了解您的市场和您需要我们提供什么。'],
      ['3. 试单项目', '我们在一个真实客户项目上支持您——选型、方案和报价。'],
      ['4. 签署协议', '区域、价格表和技术支持条款。'],
    ],
    faq: [
      ['必须是现有的设备经销商吗？', '您需要在矿山、骨料或工程机械领域有稳定业务，并已有矿山、采石场或 EPC 总包商的客户关系。有美卓、山特维克、特雷克斯设备经验是加分项，但不是必需。'],
      ['我能得到什么技术支持？', '免费开源的选型工具（19 个功能、12 种语言），以及直接对接我们的技术团队。您的销售人员不需要公司里有工程师，也能做出有依据的选型。'],
      ['有区域保护吗？', '有——明确区域划分和项目报备。具体条款在代理协议中约定。'],
      ['有起订量吗？', '取决于市场和产品组合。耐磨件通常门槛低于整机，所以是很好的起步方式。'],
      ['为什么耐磨件值得备货？', '因为在多数市场，零件进口额是整机的 2–6 倍——智利 6.3 倍、加纳 73 倍。一台破碎机投产后，未来 5–10 年每年都要换衬板。'],
      ['怎么开始？', '把公司资料和您覆盖的区域发到 leif.dai@mackorn.cn。'],
    ],
  },
  es: {
    htmlLang: 'es', crumb: 'Ser distribuidor',
    title: 'Sea distribuidor de MACKORN — Trituradoras de cono y piezas de desgaste',
    desc: 'Oportunidades de distribución y representación para trituradoras de cono hidráulicas y piezas de desgaste MACKORN en Chile, Perú, Brasil, México, Colombia, Kazajistán, Indonesia, Sudáfrica y más.',
    h1: 'Sea distribuidor de MACKORN',
    sub: 'Buscamos distribuidores y representantes de trituradoras de cono hidráulicas y piezas de desgaste en Latinoamérica, Asia Central, África, Sudeste Asiático y Oriente Medio. Si ya vende equipos de trituración o cribado, podrá cotizar profesionalmente desde el primer día: nuestra herramienta gratuita hace la ingeniería.',
    pitchTitle: 'Lo distinto: no necesita un ingeniero en plantilla',
    pitchBody: 'La mayoría de los fabricantes entrega un catálogo y se desentiende. Nosotros además le damos la herramienta de ingeniería. Nuestro plugin de selección de código abierto calcula el número de etapas, la cámara, el CSS, el número de unidades, la potencia, la curva granulométrica y la carga circulante a partir del tipo de mineral, el tamaño de alimentación y la capacidad objetivo. Usted adjunta el resultado a su cotización: el cliente ve una selección profesional y documentada, no una suposición.',
    toolsTitle: 'Qué recibe',
    tools: [
      ['Herramienta de ingeniería gratuita', '19 funciones que cubren selección, configuración de planta, simulación granulométrica, estimación de costes y generación de propuestas. Disponible en 10 idiomas.'],
      ['Propuestas listas', 'Generador de propuestas de 14 secciones: alcance, bases de diseño, diagrama de flujo, lista de equipos, parámetros técnicos, eléctrico, control de polvo, obra civil, suministro, estimación de costes y riesgos.'],
      ['Formación técnica', 'Formación remota o presencial para sus ingenieros de ventas, con acceso directo a nuestro equipo técnico.'],
      ['Suministro de piezas de desgaste', 'Mantos y cóncavos para toda la gama NH/NS: el ingreso recurrente que hace rentable una distribución.'],
      ['Territorio y precios', 'Territorio definido, registro de proyectos protegido y tarifa de distribuidor.'],
      ['Material de marketing', 'Documentación de producto, proyectos de referencia y una página pública de selección para enlazar a sus clientes.'],
    ],
    lookTitle: 'Qué buscamos',
    look: [
      'Presencia establecida en minería, áridos o maquinaria de construcción',
      'Relaciones existentes con minas, canteras o contratistas EPC',
      'Capacidad de venta técnica, o disposición a formarse',
      'Capacidad de mantener stock de piezas de desgaste',
      'Experiencia con equipos Metso, Sandvik o Terex es una ventaja',
    ],
    regionsTitle: 'Regiones prioritarias',
    regions: [
      ['Asia Central', 'Kazajistán, Uzbekistán — los mayores mercados importadores que hemos medido, y en rápido crecimiento', '$615M combinados'],
      ['Latinoamérica', 'Chile, Perú, Brasil, México, Colombia — cobre y oro, con mercados de desgaste muy grandes', 'partes 2,3–6,3× máquinas'],
      ['África', 'Sudáfrica, Zambia, RDC, Ghana, Tanzania — puerta al cinturón del cobre y del oro', 'partes hasta 73× máquinas'],
      ['Sudeste Asiático', 'Indonesia, Filipinas, Vietnam, Malasia — níquel, cobre-oro y áridos', 'crecimiento rápido'],
      ['Australia y Canadá', 'Los dos mayores mercados mundiales de piezas de desgaste importadas', '$562M y $556M'],
      ['Oriente Medio', 'Arabia Saudí, EAU, Turquía, Irán', '$270M en partes'],
    ],
    stepsTitle: 'Cómo solicitar',
    steps: [
      ['1. Envíenos su perfil', 'Nombre de la empresa, país, años de actividad, líneas actuales, tipos de cliente y tamaño de proyecto típico.'],
      ['2. Una llamada breve', '30 minutos para entender su mercado y lo que necesita de nosotros.'],
      ['3. Proyecto piloto', 'Le apoyamos en un proyecto real: selección, propuesta y precio.'],
      ['4. Acuerdo', 'Territorio, tarifa de precios y condiciones de soporte técnico.'],
    ],
    faq: [
      ['¿Debo ser ya distribuidor de equipos?', 'Necesita presencia establecida en minería, áridos o maquinaria de construcción, y relaciones con minas, canteras o contratistas EPC. La experiencia con Metso, Sandvik o Terex ayuda pero no es imprescindible.'],
      ['¿Qué soporte técnico recibo?', 'Una herramienta de selección gratuita de 19 funciones en 10 idiomas, más acceso directo a nuestro equipo técnico. Sus vendedores pueden producir una selección documentada sin ingeniero propio.'],
      ['¿Hay protección de territorio?', 'Sí: territorio definido y registro de proyectos. Las condiciones se acuerdan en el contrato de distribución.'],
      ['¿Hay pedido mínimo?', 'Depende del mercado y la mezcla de productos. Las piezas de desgaste suelen tener un umbral menor que las máquinas, lo que las hace prácticas para empezar.'],
      ['¿Por qué conviene almacenar piezas de desgaste?', 'Porque en la mayoría de los mercados las partes importadas valen de 2 a 6 veces las máquinas: Chile 6,3×, Ghana 73×. Una vez que la trituradora opera, los revestimientos se cambian cada año durante 5 a 10 años.'],
      ['¿Cómo empiezo?', 'Escriba a leif.dai@mackorn.cn con el perfil de su empresa y la región que cubre.'],
    ],
  },
  ru: {
    htmlLang: 'ru', crumb: 'Стать дистрибьютором',
    title: 'Стать дистрибьютором MACKORN — конусные дробилки и футеровка',
    desc: 'Дистрибьюторские и агентские возможности MACKORN: гидравлические конусные дробилки и быстроизнашивающиеся части для Казахстана, Узбекистана, России, Чили, Перу, Бразилии, Индонезии, Африки.',
    h1: 'Стать дистрибьютором MACKORN',
    sub: 'Мы набираем дистрибьюторов и агентов по гидравлическим конусным дробилкам и футеровке в Центральной Азии, Латинской Америке, Африке, Юго-Восточной Азии и на Ближнем Востоке. Если вы уже продаёте дробильно-сортировочное оборудование, вы сможете профессионально считать с первого дня — инженерные расчёты делает наш бесплатный инструмент.',
    pitchTitle: 'Необычная часть: инженер в штате не нужен',
    pitchBody: 'Большинство производителей дают дистрибьютору каталог и на этом останавливаются. Мы даём ещё и инженерный инструмент. Наш открытый плагин подбора рассчитывает число стадий, камеру дробления, разгрузочную щель, количество единиц, мощность, гранулометрическую кривую и циркулирующую нагрузку — только по типу руды, крупности питания и целевой производительности. Вы вставляете результат в коммерческое предложение, и заказчик видит профессиональный, документированный подбор, а не догадку.',
    toolsTitle: 'Что вы получаете',
    tools: [
      ['Бесплатный инженерный инструмент', '19 инструментов: подбор, компоновка линии, моделирование гранулометрии, оценка стоимости и генерация предложения. 10 языков, включая русский.'],
      ['Готовые предложения', 'Генератор предложения из 14 разделов: объём проекта, исходные данные, технологическая схема, перечень оборудования, технические параметры, электрика, пылеподавление, строительная часть, объём поставки, оценка стоимости и риски.'],
      ['Техническое обучение', 'Дистанционное или выездное обучение ваших инженеров по продажам и прямой доступ к нашей технической команде.'],
      ['Поставка футеровки', 'Броня конуса и футеровка чаши для всей гаммы NH/NS — регулярный доход, который делает дистрибуцию выгодной.'],
      ['Территория и цены', 'Закреплённая территория, защита проектов и дистрибьюторский прайс-лист.'],
      ['Маркетинговые материалы', 'Каталоги, референс-проекты и публичная страница подбора, на которую можно ссылаться.'],
    ],
    lookTitle: 'Кого мы ищем',
    look: [
      'Устойчивое присутствие в горной, нерудной или строительной технике',
      'Действующие связи с рудниками, карьерами или EPC-подрядчиками',
      'Способность к техническим продажам или готовность обучаться',
      'Возможность держать склад футеровки',
      'Опыт с оборудованием Metso, Sandvik, Terex — большое преимущество',
    ],
    regionsTitle: 'Приоритетные регионы',
    regions: [
      ['Центральная Азия', 'Казахстан, Узбекистан — крупнейшие из измеренных нами рынков импорта дробилок, и быстрорастущие', '$615 млн суммарно'],
      ['Латинская Америка', 'Чили, Перу, Бразилия, Мексика, Колумбия — медь и золото, очень большие рынки футеровки', 'части 2,3–6,3× машин'],
      ['Африка', 'ЮАР, Замбия, ДРК, Гана, Танзания — ворота в медный и золотой пояса', 'части до 73× машин'],
      ['Юго-Восточная Азия', 'Индонезия, Филиппины, Вьетнам, Малайзия — никель, медь-золото, нерудные', 'быстрый рост'],
      ['Австралия и Канада', 'Два крупнейших в мире рынка импорта футеровки', '$562 млн и $556 млн'],
      ['Ближний Восток', 'Саудовская Аравия, ОАЭ, Турция, Иран', '$270 млн частей'],
    ],
    stepsTitle: 'Как подать заявку',
    steps: [
      ['1. Пришлите профиль', 'Название компании, страна, годы работы, текущие линейки, типы клиентов, типовой размер проекта.'],
      ['2. Короткий звонок', '30 минут, чтобы понять ваш рынок и что вам нужно от нас.'],
      ['3. Пилотный проект', 'Мы поддержим вас на одном реальном проекте: подбор, предложение, цена.'],
      ['4. Соглашение', 'Территория, прайс-лист и условия технической поддержки.'],
    ],
    faq: [
      ['Нужно ли уже быть дилером оборудования?', 'Нужно устойчивое присутствие в горной, нерудной или строительной технике и связи с рудниками, карьерами или EPC-подрядчиками. Опыт с Metso, Sandvik или Terex помогает, но не обязателен.'],
      ['Какая техническая поддержка?', 'Бесплатный открытый инструмент подбора с 19 функциями на 10 языках и прямой доступ к нашей технической команде. Ваши продавцы смогут выдавать документированный подбор без инженера в штате.'],
      ['Есть ли защита территории?', 'Да — закреплённая территория и регистрация проектов. Условия согласуются в дистрибьюторском договоре.'],
      ['Есть ли минимальный заказ?', 'Зависит от рынка и ассортимента. По футеровке порог обычно ниже, чем по машинам, — это удобный способ начать.'],
      ['Почему футеровку стоит держать на складе?', 'Потому что в большинстве стран импорт частей в 2–6 раз превышает импорт машин: Чили 6,3 раза, Гана 73 раза. После пуска дробилки футеровку меняют ежегодно 5–10 лет.'],
      ['С чего начать?', 'Напишите на leif.dai@mackorn.cn: профиль компании и регион, который вы покрываете.'],
    ],
  },
  pt: {
    htmlLang: 'pt', crumb: 'Seja distribuidor',
    title: 'Seja distribuidor MACKORN — Britadores de cone e peças de desgaste',
    desc: 'Oportunidades de distribuição para britadores de cone hidráulicos e peças de desgaste MACKORN no Brasil, Chile, Peru, México, Colômbia, Cazaquistão, Indonésia, África e mais.',
    h1: 'Seja distribuidor MACKORN',
    sub: 'Estamos recrutando distribuidores e representantes para britadores de cone hidráulicos e peças de desgaste na América Latina, Ásia Central, África, Sudeste Asiático e Oriente Médio. Se você já vende equipamentos de britagem ou peneiramento, pode cotar profissionalmente desde o primeiro dia — a engenharia é feita pela nossa ferramenta gratuita.',
    pitchTitle: 'A diferença: você não precisa de engenheiro na equipe',
    pitchBody: 'A maioria dos fabricantes entrega um catálogo e nada mais. Nós entregamos também a ferramenta de engenharia. Nosso plugin de seleção de código aberto calcula o número de estágios, a câmara, o CSS, o número de unidades, a potência, a curva granulométrica e a carga circulante a partir do tipo de minério, tamanho de alimentação e capacidade desejada. Você anexa o resultado à proposta: o cliente vê uma seleção profissional e documentada, não um palpite.',
    toolsTitle: 'O que você recebe',
    tools: [
      ['Ferramenta de engenharia gratuita', '19 funções cobrindo seleção, configuração de planta, simulação granulométrica, estimativa de custos e geração de proposta. Disponível em 10 idiomas.'],
      ['Propostas prontas', 'Gerador de proposta de 14 seções: escopo, bases de projeto, fluxograma, lista de equipamentos, parâmetros técnicos, elétrica, controle de poeira, obra civil, escopo de fornecimento, estimativa de custos e riscos.'],
      ['Treinamento técnico', 'Treinamento remoto ou presencial para seus engenheiros de venda, com acesso direto à nossa equipe técnica.'],
      ['Fornecimento de peças de desgaste', 'Mantas e côncavos para toda a linha NH/NS — a receita recorrente que torna a distribuição rentável.'],
      ['Território e preços', 'Território definido, registro de projetos protegido e tabela de preços de distribuidor.'],
      ['Material de marketing', 'Catálogos, projetos de referência e uma página pública de seleção para indicar aos clientes.'],
    ],
    lookTitle: 'O que buscamos',
    look: [
      'Presença estabelecida em mineração, agregados ou equipamentos de construção',
      'Relacionamento existente com minas, pedreiras ou empreiteiras EPC',
      'Capacidade de venda técnica, ou disposição para treinamento',
      'Capacidade de manter estoque de peças de desgaste',
      'Experiência com equipamentos Metso, Sandvik ou Terex é uma grande vantagem',
    ],
    regionsTitle: 'Regiões prioritárias',
    regions: [
      ['Ásia Central', 'Cazaquistão, Uzbequistão — os maiores mercados importadores que medimos, e em rápido crescimento', 'US$ 615M combinados'],
      ['América Latina', 'Brasil, Chile, Peru, México, Colômbia — cobre e ouro, com mercados de desgaste muito grandes', 'peças 2,3–6,3× máquinas'],
      ['África', 'África do Sul, Zâmbia, RDC, Gana, Tanzânia — porta de entrada do cinturão do cobre e do ouro', 'peças até 73× máquinas'],
      ['Sudeste Asiático', 'Indonésia, Filipinas, Vietnã, Malásia — níquel, cobre-ouro e agregados', 'crescimento rápido'],
      ['Austrália e Canadá', 'Os dois maiores mercados mundiais de peças de desgaste importadas', 'US$ 562M e US$ 556M'],
      ['Oriente Médio', 'Arábia Saudita, EAU, Turquia, Irã', 'US$ 270M em peças'],
    ],
    stepsTitle: 'Como se candidatar',
    steps: [
      ['1. Envie seu perfil', 'Nome da empresa, país, anos de atuação, linhas atuais, tipos de cliente e porte típico de projeto.'],
      ['2. Uma conversa breve', '30 minutos para entender seu mercado e o que você precisa de nós.'],
      ['3. Projeto piloto', 'Apoiamos você em um projeto real: seleção, proposta e preço.'],
      ['4. Contrato', 'Território, tabela de preços e condições de suporte técnico.'],
    ],
    faq: [
      ['Preciso já ser revendedor de equipamentos?', 'É preciso presença estabelecida em mineração, agregados ou equipamentos de construção, e relacionamento com minas, pedreiras ou empreiteiras EPC. Experiência com Metso, Sandvik ou Terex ajuda, mas não é essencial.'],
      ['Que suporte técnico recebo?', 'Uma ferramenta de seleção gratuita com 19 funções em 10 idiomas, além de acesso direto à nossa equipe técnica. Seus vendedores produzem uma seleção documentada sem engenheiro próprio.'],
      ['Há proteção de território?', 'Sim — território definido e registro de projetos. As condições são acordadas no contrato de distribuição.'],
      ['Há pedido mínimo?', 'Depende do mercado e do mix de produtos. Peças de desgaste costumam ter limite menor que máquinas, o que facilita começar.'],
      ['Por que vale estocar peças de desgaste?', 'Porque na maioria dos mercados as peças importadas valem de 2 a 6 vezes as máquinas: Chile 6,3×, Gana 73×. Após a partida do britador, os revestimentos são trocados anualmente por 5 a 10 anos.'],
      ['Como começo?', 'Escreva para leif.dai@mackorn.cn com o perfil da empresa e a região que cobre.'],
    ],
  },
  fr: {
    htmlLang: 'fr', crumb: 'Devenir distributeur',
    title: 'Devenir distributeur MACKORN — Concasseurs à cône et pièces d\'usure',
    desc: 'Opportunités de distribution pour les concasseurs à cône hydrauliques et pièces d\'usure MACKORN : RDC, Afrique du Sud, Zambie, Ghana, Chili, Pérou, Brésil, Kazakhstan, Indonésie et plus.',
    h1: 'Devenir distributeur MACKORN',
    sub: 'Nous recrutons des distributeurs et des agents pour les concasseurs à cône hydrauliques et les pièces d\'usure en Afrique, Amérique latine, Asie centrale, Asie du Sud-Est et au Moyen-Orient. Si vous vendez déjà du matériel de concassage ou de criblage, vous pourrez chiffrer professionnellement dès le premier jour : l\'ingénierie est faite par notre outil gratuit.',
    pitchTitle: 'La différence : pas besoin d\'ingénieur en interne',
    pitchBody: 'La plupart des fabricants remettent un catalogue et s\'arrêtent là. Nous vous donnons aussi l\'outil d\'ingénierie. Notre plugin de sélection open source calcule le nombre d\'étages, la chambre, le CSS, le nombre d\'unités, la puissance, la courbe granulométrique et la charge circulante à partir du type de minerai, de la taille d\'alimentation et de la capacité cible. Vous joignez le résultat à votre devis : le client voit une sélection professionnelle et documentée, pas une supposition.',
    toolsTitle: 'Ce que vous recevez',
    tools: [
      ['Outil d\'ingénierie gratuit', '19 fonctions : sélection, configuration d\'installation, simulation granulométrique, estimation des coûts et génération de proposition. Disponible en 10 langues.'],
      ['Propositions prêtes', 'Générateur de proposition en 14 sections : périmètre, bases de conception, schéma de procédé, liste des équipements, paramètres techniques, électricité, dépoussiérage, génie civil, fourniture, estimation des coûts et risques.'],
      ['Formation technique', 'Formation à distance ou sur site pour vos ingénieurs commerciaux, avec accès direct à notre équipe technique.'],
      ['Fourniture de pièces d\'usure', 'Manteaux et bols pour toute la gamme NH/NS — le revenu récurrent qui rend une distribution rentable.'],
      ['Territoire et prix', 'Territoire défini, enregistrement de projets protégé et tarif distributeur.'],
      ['Supports marketing', 'Documentation produit, projets de référence et une page publique de sélection à partager avec vos clients.'],
    ],
    lookTitle: 'Ce que nous recherchons',
    look: [
      'Présence établie dans les mines, les granulats ou le matériel de construction',
      'Relations existantes avec des mines, des carrières ou des entreprises EPC',
      'Capacité de vente technique, ou volonté de se former',
      'Capacité à stocker des pièces d\'usure',
      'Une expérience avec Metso, Sandvik ou Terex est un atout majeur',
    ],
    regionsTitle: 'Régions prioritaires',
    regions: [
      ['Asie centrale', 'Kazakhstan, Ouzbékistan — les plus grands marchés importateurs que nous ayons mesurés, en forte croissance', '615 M$ au total'],
      ['Amérique latine', 'Chili, Pérou, Brésil, Mexique, Colombie — cuivre et or, marchés d\'usure très importants', 'pièces 2,3–6,3× machines'],
      ['Afrique', 'Afrique du Sud, Zambie, RDC, Ghana, Tanzanie — porte d\'entrée de la ceinture du cuivre et de l\'or', 'pièces jusqu\'à 73× machines'],
      ['Asie du Sud-Est', 'Indonésie, Philippines, Vietnam, Malaisie — nickel, cuivre-or et granulats', 'croissance rapide'],
      ['Australie et Canada', 'Les deux plus grands marchés mondiaux de pièces d\'usure importées', '562 M$ et 556 M$'],
      ['Moyen-Orient', 'Arabie saoudite, EAU, Turquie, Iran', '270 M$ de pièces'],
    ],
    stepsTitle: 'Comment postuler',
    steps: [
      ['1. Envoyez votre profil', 'Nom de la société, pays, années d\'activité, gammes actuelles, types de clients, taille de projet habituelle.'],
      ['2. Un court appel', '30 minutes pour comprendre votre marché et vos besoins.'],
      ['3. Projet pilote', 'Nous vous accompagnons sur un projet réel : sélection, proposition et prix.'],
      ['4. Contrat', 'Territoire, tarif et conditions de support technique.'],
    ],
    faq: [
      ['Faut-il déjà être revendeur de matériel ?', 'Il faut une présence établie dans les mines, les granulats ou le matériel de construction, et des relations avec des mines, carrières ou entreprises EPC. Une expérience Metso, Sandvik ou Terex aide mais n\'est pas indispensable.'],
      ['Quel support technique ?', 'Un outil de sélection gratuit de 19 fonctions en 10 langues, plus un accès direct à notre équipe technique. Vos commerciaux produisent une sélection documentée sans ingénieur interne.'],
      ['Y a-t-il une protection de territoire ?', 'Oui — territoire défini et enregistrement des projets. Les conditions sont fixées dans le contrat de distribution.'],
      ['Y a-t-il un minimum de commande ?', 'Cela dépend du marché et de la gamme. Les pièces d\'usure ont généralement un seuil plus bas que les machines, ce qui facilite le démarrage.'],
      ['Pourquoi stocker des pièces d\'usure ?', 'Parce que dans la plupart des marchés les pièces importées valent 2 à 6 fois les machines : Chili 6,3×, Ghana 73×. Une fois le concasseur en service, les garnitures sont remplacées chaque année pendant 5 à 10 ans.'],
      ['Comment commencer ?', 'Écrivez à leif.dai@mackorn.cn avec le profil de votre société et la région couverte.'],
    ],
  },
};

function render(lang, L) {
  return `<!DOCTYPE html>
<html lang="${L.htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${L.title}</title>
<meta name="description" content="${L.desc}">
<meta name="keywords" content="cone crusher distributor,mining equipment agent,crusher dealer,distributor recruitment,MACKORN distributor,wear parts distributor,seja distribuidor,become a distributor,devenir distributeur,стать дистрибьютором,ser distribuidor,代理商招募,经销商招募">
<meta name="robots" content="index,follow,max-snippet:-1">
<link rel="canonical" href="${BASE}/distributors/">
${['en', 'zh', 'es', 'ru', 'pt', 'fr'].map((l) => `<link rel="alternate" hreflang="${T[l].htmlLang}" href="${BASE}/distributors/${l === 'en' ? '' : l + '/'}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${BASE}/distributors/">
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebPage', name: L.title, description: L.desc,
    inLanguage: L.htmlLang, url: `${BASE}/distributors/`,
    about: [{ '@type': 'Thing', name: 'distributor recruitment' }, { '@type': 'Thing', name: 'hydraulic cone crusher' }, { '@type': 'Thing', name: 'crusher wear parts' }],
    publisher: { '@type': 'Organization', name: COMPANY.name, url: BASE },
  }, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: L.htmlLang,
    mainEntity: L.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }, null, 2)}
</script>
<style>
:root{--navy:#0A2A4F;--blue:#1B6CB5;--light:#F4F8FC;--line:#D9E5F2;--muted:#5A6B80}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,"Segoe UI","Microsoft YaHei",Roboto,sans-serif;color:#16202E;line-height:1.8}
.wrap{max-width:960px;margin:0 auto;padding:0 24px}
header{background:linear-gradient(140deg,#08213E,var(--blue));color:#fff;padding:56px 0 46px}
header .crumb{font-size:13px;opacity:.8;margin-bottom:12px}
header .crumb a{color:#BFE0FF;text-decoration:none}
header h1{margin:0 0 14px;font-size:clamp(24px,3.4vw,32px);line-height:1.3}
header p{margin:0;opacity:.94;max-width:800px;font-size:15.5px}
section{padding:40px 0;border-bottom:1px solid var(--line)}
h2{font-size:20px;color:var(--navy);margin:0 0 16px;border-bottom:2px solid var(--blue);display:inline-block;padding-bottom:8px}
h3{font-size:16px;color:var(--navy);margin:22px 0 8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px;margin:20px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.card h4{margin:0 0 8px;font-size:15px;color:var(--navy)}
.card p{margin:0;font-size:14px;color:var(--muted)}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14.5px}
th,td{border:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}
th{background:var(--light);color:var(--navy)}
.box{background:var(--light);border-left:4px solid var(--blue);padding:18px 22px;border-radius:0 10px 10px 0;margin:20px 0}
.box.hi{background:#EAF7EE;border-left-color:#2E9E5B}
.muted{color:var(--muted);font-size:14px}
a{color:var(--blue)}
.btn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;margin:6px 10px 6px 0;font-weight:600;font-size:15px}
.btn.ghost{background:#fff;color:var(--blue);border:2px solid var(--blue)}
footer{background:#08213E;color:#B8CEE3;padding:30px 0;font-size:13.5px}
ol,ul{padding-left:22px}
.langbar{background:#08213E;padding:10px 0;font-size:13px}
.langbar a{color:#9CC7EE;margin:0 8px;text-decoration:none}
</style>
</head>
<body>
<div class="langbar"><div class="wrap">
${['en', 'zh', 'es', 'ru', 'pt', 'fr'].map((l) => `<a href="/distributors/${l === 'en' ? '' : l + '/'}"${l === lang ? ' style="color:#fff;font-weight:700"' : ''}>${T[l].htmlLang}</a>`).join('')}
</div></div>

<header><div class="wrap">
<div class="crumb"><a href="${BASE}/">MACKORN</a> &rsaquo; <a href="${BASE}/ai/">AI selection plugin</a> &rsaquo; ${L.crumb}</div>
<h1>${L.h1}</h1>
<p>${L.sub}</p>
</div></header>

<div class="wrap">

<section>
<h2>${L.pitchTitle}</h2>
<div class="box hi"><p style="margin:0">${L.pitchBody}</p></div>
</section>

<section>
<h2>${L.toolsTitle}</h2>
<div class="grid">
${L.tools.map(([t, d]) => `<div class="card"><h4>${t}</h4><p>${d}</p></div>`).join('\n')}
</div>
</section>

<section>
<h2>${L.lookTitle}</h2>
<ul>${L.look.map((x) => `<li>${x}</li>`).join('')}</ul>
</section>

<section>
<h2>${L.regionsTitle}</h2>
<table>
${L.regions.map(([r, d, m]) => `<tr><th style="width:22%">${r}</th><td>${d}</td><td style="white-space:nowrap"><strong>${m}</strong></td></tr>`).join('\n')}
</table>
<p class="muted">Source: UN Comtrade public API — 2023 import values, HS 847420 (machines) and HS 847490 (parts).</p>
</section>

<section>
<h2>${L.stepsTitle}</h2>
<table>
${L.steps.map(([s, d]) => `<tr><th style="width:28%">${s}</th><td>${d}</td></tr>`).join('\n')}
</table>
</section>

<section>
<h2>FAQ</h2>
${L.faq.map(([q, a]) => `<h3>${q}</h3>\n<p>${a}</p>`).join('\n')}
</section>

<section>
<h2>Contact</h2>
<div class="box">
<strong>${COMPANY.name} ${COMPANY.nameCn}</strong><br>
${COMPANY.addr}<br>${COMPANY.addrCn}<br>
<a href="${BASE}">${BASE}</a> &middot; GMT+8 (09:00-17:30)<br>
${COMPANY.emails.join('<br>')}
</div>
<p><a class="btn" href="mailto:leif.dai@mackorn.cn?subject=MACKORN%20distributor%20application">${L.crumb}</a>
<a class="btn ghost" href="${BASE}/ai/">AI selection plugin</a>
<a class="btn ghost" href="${BASE}/ai/parts/">Wear parts</a></p>
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

mkdirSync(OUTBASE, { recursive: true });
writeFileSync(join(OUTBASE, 'index.html'), render('en', T.en), 'utf8');
console.log('  /distributors/         en');
for (const l of ['zh', 'es', 'ru', 'pt', 'fr']) {
  const d = join(OUTBASE, l);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'index.html'), render(l, T[l]), 'utf8');
  console.log('  /distributors/' + l + '/        ' + l);
}
console.log('  生成 6 个语言版本');
