/**
 * R2 · 多语言术语与问答内容生成器
 *
 * 数据驱动：按【进口额 ÷ 现有术语数】排序，优先补齐"钱多话少"的语言。
 *
 * 纪律：
 *   · 只用我确信的技术译法，不臆造；不确定的标 TODO 并统计
 *   · 术语是名词，问答是句子 —— AI 需要句子。所以两者都产。
 *   · 每个术语带中英对照，便于人工复核
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const OUT = join(D, '官网落地页');

/* ══════════════════════════════════════════════════════════
 * 术语表：中 / 英 / 目标语言
 * 只列我有把握的技术译法。不确定的不写（宁缺勿错）。
 * ══════════════════════════════════════════════════════════ */
const TERMS = [
  // [中文, English, ru, es, id, ar, de]
  ['液压圆锥破碎机', 'hydraulic cone crusher', 'гидравлическая конусная дробилка', 'trituradora de cono hidráulica', 'crusher kerucut hidrolik', 'كسارة مخروطية هيدروليكية', 'Hydraulikkegelbrecher'],
  ['单缸液压圆锥破', 'single-cylinder hydraulic cone crusher', 'одноцилиндровая гидравлическая конусная дробилка', 'trituradora de cono hidráulica de un cilindro', 'crusher kerucut hidrolik silinder tunggal', 'كسارة مخروطية هيدروليكية أحادية الأسطوانة', 'Einzylinder-Hydraulikkegelbrecher'],
  ['多缸液压圆锥破', 'multi-cylinder hydraulic cone crusher', 'многоцилиндровая гидравлическая конусная дробилка', 'trituradora de cono hidráulica multicilíndrica', 'crusher kerucut hidrolik multi-silinder', 'كسارة مخروطية هيدروليكية متعددة الأسطوانات', 'Mehrzylinder-Hydraulikkegelbrecher'],
  ['颚式破碎机', 'jaw crusher', 'щековая дробилка', 'trituradora de mandíbulas', 'jaw crusher', 'كسارة فكية', 'Backenbrecher'],
  ['反击式破碎机', 'impact crusher', 'роторная дробилка', 'trituradora de impacto', 'impact crusher', 'كسارة تصادمية', 'Prallbrecher'],
  ['制砂机', 'sand making machine', 'машина для производства песка', 'máquina de fabricación de arena', 'mesin pembuat pasir', 'آلة صنع الرمل', 'Sandherstellungsmaschine'],
  ['振动筛', 'vibrating screen', 'вибрационный грохот', 'criba vibratoria', 'layar bergetar', 'غربال اهتزازي', 'Vibrationssieb'],
  ['给料机', 'feeder', 'питатель', 'alimentador', 'pengumpan', 'مغذي', 'Aufgabeaggregat'],
  ['破碎腔型', 'crushing cavity', 'камера дробления', 'cámara de trituración', 'ruang penghancur', 'تجويف التكسير', 'Brechkammer'],
  ['紧边排矿口 CSS', 'closed side setting (CSS)', 'минимальная разгрузочная щель (CSS)', 'ajuste lado cerrado (CSS)', 'closed side setting (CSS)', 'ضبط الجانب المغلق (CSS)', 'engster Spalt (CSS)'],
  ['偏心距 / 冲程', 'eccentric throw', 'эксцентриситет (ход)', 'excentricidad (carrera)', 'eksentrisitas (langkah)', 'اللامركزية (الشوط)', 'Exzentrizität (Hub)'],
  ['处理能力', 'throughput / capacity', 'производительность', 'capacidad de procesamiento', 'kapasitas pengolahan', 'الطاقة الإنتاجية', 'Durchsatzleistung'],
  ['给料粒度', 'feed size', 'крупность питания', 'tamaño de alimentación', 'ukuran umpan', 'حجم التغذية', 'Aufgabegröße'],
  ['最大给料粒度', 'maximum feed size', 'максимальная крупность питания', 'tamaño máximo de alimentación', 'ukuran umpan maksimum', 'الحد الأقصى لحجم التغذية', 'maximale Aufgabegröße'],
  ['产品粒度', 'product size', 'крупность продукта', 'tamaño del producto', 'ukuran produk', 'حجم المنتج', 'Produktgröße'],
  ['粒度分布', 'particle size distribution', 'гранулометрический состав', 'distribución granulométrica', 'distribusi ukuran partikel', 'توزيع حجم الجسيمات', 'Korngrößenverteilung'],
  ['破碎比', 'reduction ratio', 'степень дробления', 'relación de reducción', 'rasio reduksi', 'نسبة التكسير', 'Zerkleinerungsverhältnis'],
  ['破碎段', 'crushing stage', 'стадия дробления', 'etapa de trituración', 'tahap penghancuran', 'مرحلة التكسير', 'Brechstufe'],
  ['粗碎', 'primary crushing', 'крупное дробление', 'trituración primaria', 'penghancuran primer', 'التكسير الأولي', 'Grobzerkleinerung'],
  ['中碎', 'secondary crushing', 'среднее дробление', 'trituración secundaria', 'penghancuran sekunder', 'التكسير الثانوي', 'Mittelzerkleinerung'],
  ['细碎', 'tertiary crushing', 'мелкое дробление', 'trituración terciaria', 'penghancuran tersier', 'التكسير الثالثي', 'Feinzerkleinerung'],
  ['超细碎', 'quaternary / ultra-fine crushing', 'сверхмелкое дробление', 'trituración cuaternaria', 'penghancuran kuaterner', 'التكسير الرباعي', 'Feinstzerkleinerung'],
  ['闭路循环', 'closed circuit', 'замкнутый цикл', 'circuito cerrado', 'sirkuit tertutup', 'دائرة مغلقة', 'geschlossener Kreislauf'],
  ['开路', 'open circuit', 'открытый цикл', 'circuito abierto', 'sirkuit terbuka', 'دائرة مفتوحة', 'offener Kreislauf'],
  ['循环负荷', 'circulating load', 'циркулирующая нагрузка', 'carga circulante', 'beban sirkulasi', 'الحمل الدائر', 'Umlaufbelastung'],
  ['筛分效率', 'screening efficiency', 'эффективность грохочения', 'eficiencia de cribado', 'efisiensi penyaringan', 'كفاءة الغربلة', 'Siebleistung'],
  ['圆锥破衬板', 'cone crusher liner', 'броня конусной дробилки', 'revestimiento de trituradora de cono', 'liner crusher kerucut', 'بطانة الكسارة المخروطية', 'Kegelbrecher-Verschleißteil'],
  ['破碎壁（动锥衬板）', 'mantle', 'броня подвижного конуса', 'manto', 'mantle', 'العباءة', 'Brechmantel'],
  ['轧臼壁（定锥衬板）', 'bowl liner / concave', 'броня неподвижного конуса', 'cóncavo', 'bowl liner', 'البطانة المقعرّة', 'Brechschale'],
  ['衬板寿命', 'liner life', 'срок службы брони', 'vida útil del revestimiento', 'umur liner', 'عمر البطانة', 'Standzeit des Verschleißteils'],
  ['磨损率', 'wear rate', 'интенсивность износа', 'tasa de desgaste', 'laju keausan', 'معدل التآكل', 'Verschleißrate'],
  ['锰钢', 'manganese steel', 'марганцевая сталь', 'acero al manganeso', 'baja mangan', 'فولاذ المنغنيز', 'Manganstahl'],
  ['高铬铸铁', 'high-chromium cast iron', 'высокохромистый чугун', 'hierro fundido alto en cromo', 'besi tuang kromium tinggi', 'الحديد الزهر عالي الكروم', 'hochchromhaltiges Gusseisen'],
  ['抗压强度', 'compressive strength', 'прочность на сжатие', 'resistencia a la compresión', 'kekuatan tekan', 'مقاومة الانضغاط', 'Druckfestigkeit'],
  ['莫氏硬度', 'Mohs hardness', 'твёрдость по Моосу', 'dureza Mohs', 'kekerasan Mohs', 'صلابة موس', 'Mohshärte'],
  ['邦德功指数', 'Bond work index', 'индекс работы Бонда', 'índice de trabajo de Bond', 'indeks kerja Bond', 'مؤشر شغل بوند', 'Bond-Arbeitsindex'],
  ['磨蚀指数', 'abrasion index', 'индекс абразивности', 'índice de abrasión', 'indeks abrasi', 'مؤشر التآكل', 'Abrasionsindex'],
  ['含水率', 'moisture content', 'влажность', 'contenido de humedad', 'kadar air', 'محتوى الرطوبة', 'Feuchtigkeitsgehalt'],
  ['含泥量', 'clay content', 'содержание глины', 'contenido de arcilla', 'kandungan lempung', 'محتوى الطين', 'Tongehalt'],
  ['除土', 'clay removal / desliming', 'удаление глины', 'desarcillado', 'pengurangan lempung', 'إزالة الطين', 'Enttonung'],
  ['干法生产', 'dry process', 'сухой способ', 'proceso por vía seca', 'proses kering', 'العملية الجافة', 'Trockenverfahren'],
  ['湿法生产', 'wet process', 'мокрый способ', 'proceso por vía húmeda', 'proses basah', 'العملية الرطبة', 'Nassverfahren'],
  ['骨料', 'aggregate', 'заполнитель (щебень)', 'árido', 'agregat', 'الركام', 'Zuschlagstoff'],
  ['机制砂', 'manufactured sand', 'искусственный песок', 'arena manufacturada', 'pasir buatan', 'الرمل المصنّع', 'Brechsand'],
  ['细度模数', 'fineness modulus', 'модуль крупности', 'módulo de finura', 'modulus kehalusan', 'معامل النعومة', 'Feinheitsmodul'],
  ['玄武岩', 'basalt', 'базальт', 'basalto', 'basalt', 'بازلت', 'Basalt'],
  ['花岗岩', 'granite', 'гранит', 'granito', 'granit', 'جرانيت', 'Granit'],
  ['安山岩', 'andesite', 'андезит', 'andesita', 'andesit', 'أنديزيت', 'Andesit'],
  ['辉绿岩', 'diabase / dolerite', 'диабаз', 'diabasa', 'diabas', 'دياباز', 'Diabas'],
  ['石灰石', 'limestone', 'известняк', 'caliza', 'batu kapur', 'الحجر الجيري', 'Kalkstein'],
  ['铁矿石', 'iron ore', 'железная руда', 'mineral de hierro', 'bijih besi', 'خام الحديد', 'Eisenerz'],
  ['铜矿石', 'copper ore', 'медная руда', 'mineral de cobre', 'bijih tembaga', 'خام النحاس', 'Kupfererz'],
  ['金矿石', 'gold ore', 'золотая руда', 'mineral de oro', 'bijih emas', 'خام الذهب', 'Golderz'],
  ['铅锌矿', 'lead-zinc ore', 'свинцово-цинковая руда', 'mineral de plomo-zinc', 'bijih timbal-seng', 'خام الرصاص والزنك', 'Blei-Zink-Erz'],
  ['选型', 'equipment selection', 'подбор оборудования', 'selección de equipos', 'pemilihan peralatan', 'اختيار المعدات', 'Auslegung / Geräteauswahl'],
  ['生产线', 'production line', 'технологическая линия', 'línea de producción', 'lini produksi', 'خط الإنتاج', 'Produktionslinie'],
  ['破碎筛分生产线', 'crushing and screening plant', 'дробильно-сортировочный комплекс', 'planta de trituración y cribado', 'pabrik penghancuran dan penyaringan', 'محطة التكسير والغربلة', 'Brech- und Siebanlage'],
  ['工艺流程', 'flowsheet / process flow', 'технологическая схема', 'diagrama de flujo', 'diagram alir proses', 'مخطط العملية', 'Verfahrensfließbild'],
  ['方案书', 'technical proposal', 'техническое предложение', 'propuesta técnica', 'proposal teknis', 'العرض الفني', 'technisches Angebot'],
  ['备件', 'spare parts', 'запасные части', 'repuestos', 'suku cadang', 'قطع الغيار', 'Ersatzteile'],
  ['易损件', 'wear parts', 'быстроизнашивающиеся детали', 'piezas de desgaste', 'suku cadang aus', 'قطع التآكل', 'Verschleißteile'],
  ['安装调试', 'installation and commissioning', 'монтаж и пусконаладка', 'instalación y puesta en marcha', 'instalasi dan komisioning', 'التركيب والتشغيل', 'Montage und Inbetriebnahme'],
  ['售后服务', 'after-sales service', 'сервисное обслуживание', 'servicio posventa', 'layanan purna jual', 'خدمة ما بعد البيع', 'Kundendienst'],
];

const LANGS = [
  { code: 'ru', name: '俄语', idx: 2, page: 'ru' },
  { code: 'es', name: '西班牙语', idx: 3, page: 'es' },
  { code: 'id', name: '印尼语', idx: 4, page: 'id' },
  { code: 'ar', name: '阿拉伯语', idx: 5, page: 'ar' },
  { code: 'de', name: '德语', idx: 6, page: 'de' },
];

/* ══════════════════════════════════════════════════════════
 * 问答：目标市场买家真正会问的问题
 * ══════════════════════════════════════════════════════════ */
const QA = [
  {
    zh: '圆锥破碎机怎么选型号？',
    en: 'How do I choose a cone crusher model?',
    ru: 'Как выбрать модель конусной дробилки?',
    es: '¿Cómo elegir un modelo de trituradora de cono?',
    id: 'Bagaimana memilih model crusher kerucut?',
    ar: 'كيف أختار موديل الكسارة المخروطية؟',
    de: 'Wie wähle ich ein Kegelbrecher-Modell aus?',
    zhA: '需要四个输入：目标产量 t/h、进入本段的最大给料粒度 mm、目标产品粒度 mm、矿石种类与硬度。按产量与粒度从 NH 标准型（9 个型号）或 NS 高速型（4 个型号）中选机型，再按给料粒度定腔型（EC/C/MC/M/MF/F/EF/EFX/EEF），最后由产品粒度定紧边排矿口 CSS，产量除以单台产能得台数。',
    enA: 'Four inputs are required: target throughput (t/h), maximum feed size (mm), target product size (mm), and ore type with hardness. Choose the model from the NH standard series (9 models) or NS high-speed series (4 models) by throughput and size; then set the cavity type (EC/C/MC/M/MF/F/EF/EFX/EEF) by feed size; finally set the closed side setting (CSS) by product size, and divide target throughput by single-unit capacity to get the number of units.',
    ruA: 'Требуются четыре параметра: целевая производительность (т/ч), максимальная крупность питания (мм), целевая крупность продукта (мм), тип и твёрдость руды. Модель выбирается из стандартной серии NH (9 моделей) или высокоскоростной серии NS (4 модели) по производительности и крупности; затем камера дробления (EC/C/MC/M/MF/F/EF/EFX/EEF) — по крупности питания; наконец минимальная разгрузочная щель (CSS) — по крупности продукта; число единиц = целевая производительность ÷ производительность одной машины.',
    esA: 'Se requieren cuatro datos: capacidad objetivo (t/h), tamaño máximo de alimentación (mm), tamaño objetivo del producto (mm) y tipo de mineral con su dureza. El modelo se elige de la serie estándar NH (9 modelos) o de la serie de alta velocidad NS (4 modelos) según capacidad y tamaño; después el tipo de cámara (EC/C/MC/M/MF/F/EF/EFX/EEF) según el tamaño de alimentación; por último el ajuste lado cerrado (CSS) según el tamaño del producto, y el número de unidades = capacidad objetivo ÷ capacidad de una máquina.',
    idA: 'Diperlukan empat masukan: kapasitas target (t/h), ukuran umpan maksimum (mm), ukuran produk target (mm), serta jenis dan kekerasan bijih. Model dipilih dari seri standar NH (9 model) atau seri kecepatan tinggi NS (4 model) berdasarkan kapasitas dan ukuran; lalu tipe ruang penghancur (EC/C/MC/M/MF/F/EF/EFX/EEF) berdasarkan ukuran umpan; terakhir closed side setting (CSS) berdasarkan ukuran produk, dan jumlah unit = kapasitas target ÷ kapasitas satu unit.',
    arA: 'يلزم أربعة مدخلات: الطاقة الإنتاجية المستهدفة (طن/ساعة)، والحد الأقصى لحجم التغذية (مم)، وحجم المنتج المستهدف (مم)، ونوع الخام وصلابته. يُختار الموديل من سلسلة NH القياسية (9 موديلات) أو سلسلة NS عالية السرعة (4 موديلات) حسب الطاقة والحجم؛ ثم نوع التجويف (EC/C/MC/M/MF/F/EF/EFX/EEF) حسب حجم التغذية؛ وأخيراً ضبط الجانب المغلق (CSS) حسب حجم المنتج، وعدد الوحدات = الطاقة المستهدفة ÷ طاقة الوحدة الواحدة.',
    deA: 'Vier Eingaben sind erforderlich: Zieldurchsatz (t/h), maximale Aufgabegröße (mm), Ziel-Produktgröße (mm) sowie Erzart und Härte. Das Modell wird nach Durchsatz und Größe aus der NH-Standardbaureihe (9 Modelle) oder der NS-Hochgeschwindigkeitsbaureihe (4 Modelle) gewählt; danach der Brechkammertyp (EC/C/MC/M/MF/F/EF/EFX/EEF) nach der Aufgabegröße; schließlich der engste Spalt (CSS) nach der Produktgröße, und die Anzahl der Einheiten = Zieldurchsatz ÷ Leistung einer Einheit.',
  },
  {
    zh: '最大给料粒度是多少？超过会怎样？',
    en: 'What is the maximum feed size, and what happens if it is exceeded?',
    ru: 'Какова максимальная крупность питания и что будет при её превышении?',
    es: '¿Cuál es el tamaño máximo de alimentación y qué ocurre si se supera?',
    id: 'Berapa ukuran umpan maksimum, dan apa yang terjadi jika dilampaui?',
    ar: 'ما هو الحد الأقصى لحجم التغذية، وماذا يحدث عند تجاوزه؟',
    de: 'Wie groß ist die maximale Aufgabegröße, und was passiert bei Überschreitung?',
    zhA: '液压圆锥破是中碎/细碎设备，给料超过约 350 mm 必须拒绝——不是"效果差一点"，而是会顶锥、闷车、打坏衬板。超过 350 mm 的料应先经颚破或旋回破做粗碎。具体上限还要按机型与腔型查表：粗腔（EC/C）允许更大，细腔（F/EF）更小。',
    enA: 'A hydraulic cone crusher is a secondary/tertiary machine. Feed above roughly 350 mm must be refused — the result is not merely lower efficiency but cone jacking, chamber packing and liner damage. Material above 350 mm should first pass a jaw or gyratory crusher for primary crushing. The exact limit also depends on model and cavity: coarse cavities (EC/C) accept more, fine cavities (F/EF) less.',
    ruA: 'Гидравлическая конусная дробилка — машина среднего/мелкого дробления. Питание крупнее примерно 350 мм должно быть отклонено: последствия — не просто снижение эффективности, а подъём конуса, забивание камеры и повреждение брони. Материал крупнее 350 мм следует предварительно дробить в щековой или конусной дробилке крупного дробления. Точный предел зависит от модели и камеры: крупные камеры (EC/C) допускают больше, мелкие (F/EF) — меньше.',
    esA: 'Una trituradora de cono hidráulica es una máquina de trituración secundaria/terciaria. La alimentación superior a unos 350 mm debe rechazarse: el resultado no es solo menor eficiencia, sino elevación del cono, obstrucción de la cámara y daño del revestimiento. El material superior a 350 mm debe pasar primero por una trituradora de mandíbulas o giratoria. El límite exacto depende del modelo y la cámara: las cámaras gruesas (EC/C) admiten más, las finas (F/EF) menos.',
    idA: 'Crusher kerucut hidrolik adalah mesin penghancuran sekunder/tersier. Umpan di atas sekitar 350 mm harus ditolak — akibatnya bukan sekadar efisiensi turun, tetapi kerucut terangkat, ruang tersumbat, dan liner rusak. Material di atas 350 mm harus melewati jaw crusher atau gyratory crusher terlebih dahulu. Batas tepatnya bergantung pada model dan ruang penghancur: ruang kasar (EC/C) menerima lebih besar, ruang halus (F/EF) lebih kecil.',
    arA: 'الكسارة المخروطية الهيدروليكية آلة تكسير ثانوي/ثالثي. يجب رفض التغذية التي تزيد عن 350 مم تقريباً — فالنتيجة ليست مجرد انخفاض الكفاءة، بل ارتفاع المخروط وانحشار التجويف وتلف البطانة. يجب أن تمر المواد الأكبر من 350 مم أولاً عبر كسارة فكية أو محورية. الحد الدقيق يعتمد أيضاً على الموديل والتجويف: التجاويف الخشنة (EC/C) تسمح بأكبر، والناعمة (F/EF) بأصغر.',
    deA: 'Ein Hydraulikkegelbrecher ist eine Maschine für Mittel- und Feinzerkleinerung. Aufgabe über etwa 350 mm muss abgelehnt werden — die Folge ist nicht nur geringere Effizienz, sondern Kegelhub, Kammerverstopfung und Verschleißteilschaden. Material über 350 mm sollte zuerst einen Backen- oder Kreiselbrecher passieren. Die genaue Grenze hängt von Modell und Brechkammer ab: grobe Kammern (EC/C) erlauben mehr, feine (F/EF) weniger.',
  },
  {
    zh: 'CSS 应该定多少？',
    en: 'What closed side setting (CSS) should I use?',
    ru: 'Какую минимальную разгрузочную щель (CSS) выбрать?',
    es: '¿Qué ajuste lado cerrado (CSS) debo utilizar?',
    id: 'Berapa closed side setting (CSS) yang harus digunakan?',
    ar: 'ما قيمة ضبط الجانب المغلق (CSS) التي ينبغي استخدامها؟',
    de: 'Welchen engsten Spalt (CSS) soll ich einstellen?',
    zhA: 'CSS 由目标产品粒度决定，但要守住排矿口下限——不同机型与腔型有各自的最小值，低于下限会导致衬板异常磨损和产品粒形恶化。建议做法：先按目标产品粒度初选 CSS，再用「腔型 × CSS 产能表」校核产能是否够，最后用粒度曲线模型核验产品 P80 是否达标。',
    enA: 'CSS is determined by the target product size, but the lower limit of the discharge opening must be respected — each model and cavity has its own minimum, and going below it causes abnormal liner wear and poor particle shape. Recommended procedure: pick a preliminary CSS from the target product size, verify capacity against the cavity × CSS capacity table, then check that the product P80 meets specification using a size-distribution model.',
    ruA: 'CSS определяется целевой крупностью продукта, но необходимо соблюдать нижний предел разгрузочной щели: у каждой модели и камеры он свой, а его нарушение ведёт к аномальному износу брони и ухудшению формы зёрен. Рекомендуемый порядок: предварительно выбрать CSS по целевой крупности, проверить производительность по таблице «камера × CSS», затем проверить P80 продукта по модели гранулометрического состава.',
    esA: 'El CSS se determina por el tamaño objetivo del producto, pero debe respetarse el límite inferior de la abertura de descarga: cada modelo y cámara tiene el suyo, y bajarlo provoca desgaste anómalo del revestimiento y mala forma de las partículas. Procedimiento recomendado: elegir un CSS preliminar según el tamaño objetivo, verificar la capacidad con la tabla cámara × CSS y comprobar el P80 del producto con un modelo de distribución granulométrica.',
    idA: 'CSS ditentukan oleh ukuran produk target, tetapi batas bawah bukaan pelepasan harus dipatuhi — setiap model dan ruang penghancur punya batasnya sendiri, dan melampauinya menyebabkan keausan liner abnormal serta bentuk partikel yang buruk. Prosedur yang disarankan: pilih CSS awal dari ukuran produk target, verifikasi kapasitas dengan tabel kapasitas ruang × CSS, lalu periksa P80 produk dengan model distribusi ukuran.',
    arA: 'يُحدَّد CSS بحسب حجم المنتج المستهدف، لكن يجب احترام الحد الأدنى لفتحة التفريغ — فلكل موديل وتجويف حده الخاص، وتجاوزه يؤدي إلى تآكل غير طبيعي للبطانة وسوء شكل الحبيبات. الإجراء الموصى به: اختيار CSS مبدئي من حجم المنتج المستهدف، ثم التحقق من الطاقة عبر جدول التجويف × CSS، ثم فحص P80 للمنتج باستخدام نموذج توزيع الحجم.',
    deA: 'Der CSS ergibt sich aus der Ziel-Produktgröße, die untere Grenze des Austragsspalts ist jedoch einzuhalten — jedes Modell und jede Kammer hat ihre eigene, und eine Unterschreitung führt zu anormalem Verschleißteilsverschleiß und schlechter Kornform. Empfohlenes Vorgehen: CSS vorläufig nach Ziel-Produktgröße wählen, Durchsatz anhand der Tabelle Kammer × CSS prüfen, dann den P80 des Produkts mit einem Korngrößenmodell verifizieren.',
  },
  {
    zh: '要几台设备？台数怎么算？',
    en: 'How many units do I need, and how is that calculated?',
    ru: 'Сколько единиц оборудования нужно и как это рассчитывается?',
    es: '¿Cuántas unidades necesito y cómo se calcula?',
    id: 'Berapa unit yang saya butuhkan, dan bagaimana menghitungnya?',
    ar: 'كم عدد الوحدات التي أحتاجها، وكيف يُحسب ذلك؟',
    de: 'Wie viele Einheiten brauche ich, und wie wird das berechnet?',
    zhA: '台数 = 目标产量 ÷ 单台产能，再按闭路循环负荷放大。闭路时筛上返料会重新进入破碎机，循环负荷通常按 1.2–1.5 倍考虑，所以不能只按新鲜给料算。建议配置 N+1：一台备用，避免单机故障停产。',
    enA: 'Units = target throughput ÷ single-unit capacity, then scaled by the closed-circuit circulating load. In closed circuit, oversize returns to the crusher, typically adding a circulating load factor of 1.2–1.5, so sizing on fresh feed alone is wrong. An N+1 arrangement (one standby) is recommended to avoid a full stop on single-unit failure.',
    ruA: 'Число единиц = целевая производительность ÷ производительность одной машины, затем умножается на коэффициент циркулирующей нагрузки. В замкнутом цикле надрешётный продукт возвращается в дробилку, что обычно даёт коэффициент 1,2–1,5, поэтому расчёт только по свежему питанию неверен. Рекомендуется схема N+1 (одна машина в резерве), чтобы избежать остановки при отказе одной единицы.',
    esA: 'Unidades = capacidad objetivo ÷ capacidad de una máquina, escalado por la carga circulante del circuito cerrado. En circuito cerrado el sobretamaño retorna a la trituradora, lo que suele añadir un factor de 1,2–1,5; dimensionar solo con la alimentación fresca es incorrecto. Se recomienda un arreglo N+1 (una unidad de reserva) para evitar paradas por fallo de una sola máquina.',
    idA: 'Jumlah unit = kapasitas target ÷ kapasitas satu unit, lalu dikalikan dengan beban sirkulasi sirkuit tertutup. Pada sirkuit tertutup, material oversize kembali ke crusher, biasanya menambah faktor beban sirkulasi 1,2–1,5; menghitung hanya dari umpan segar adalah keliru. Disarankan konfigurasi N+1 (satu unit cadangan) agar tidak berhenti total saat satu unit rusak.',
    arA: 'عدد الوحدات = الطاقة المستهدفة ÷ طاقة الوحدة الواحدة، ثم يُضرب في معامل الحمل الدائر للدائرة المغلقة. في الدائرة المغلقة يعود الحجم الزائد إلى الكسارة، مما يضيف عادة معامل 1.2–1.5، لذا فإن الحساب على التغذية الجديدة فقط خاطئ. يُوصى بترتيب N+1 (وحدة احتياطية) لتجنب التوقف الكامل عند تعطل وحدة واحدة.',
    deA: 'Anzahl = Zieldurchsatz ÷ Leistung einer Einheit, anschließend mit der Umlaufbelastung des geschlossenen Kreislaufs skaliert. Im geschlossenen Kreislauf läuft Überkorn zum Brecher zurück, was üblicherweise einen Faktor von 1,2–1,5 ergänzt; eine Auslegung nur auf Frischaufgabe ist falsch. Empfohlen wird eine N+1-Anordnung (eine Reserveeinheit), um einen Vollstillstand bei Ausfall einer Einheit zu vermeiden.',
  },
  {
    zh: '衬板多久换一次？',
    en: 'How often do liners need replacing?',
    ru: 'Как часто нужно менять броню?',
    es: '¿Con qué frecuencia hay que cambiar los revestimientos?',
    id: 'Seberapa sering liner perlu diganti?',
    ar: 'كم مرة يجب استبدال البطانات؟',
    de: 'Wie oft müssen Verschleißteile gewechselt werden?',
    zhA: '衬板寿命取决于矿石磨蚀性、给料级配、CSS 与产量，只有现场换衬板记录才能给出可靠数字。做法：记录每次换衬板的小时数与处理吨数，累积 5 条以上后用威布尔分布拟合，得到 B10 寿命（10% 失效点）。注意 B10 不是更换点——按年龄更换模型算，实际最优更换点通常晚于 B10，直接用 B10 会浪费约三分之一的衬板寿命。',
    enA: 'Liner life depends on ore abrasiveness, feed gradation, CSS and throughput; only on-site liner replacement records give a reliable figure. Method: log hours and tonnes for each replacement, then after five or more records fit a Weibull distribution to obtain the B10 life (10% failure point). Note that B10 is not the replacement point — under an age-replacement model the optimal change-out time is usually later than B10, and using B10 directly wastes roughly one third of the liner life.',
    ruA: 'Срок службы брони зависит от абразивности руды, гранулометрии питания, CSS и производительности; надёжную цифру дают только записи о заменах на месте. Метод: фиксировать часы и тонны при каждой замене, после пяти и более записей подобрать распределение Вейбулла и получить ресурс B10 (точка 10 % отказов). Важно: B10 — не точка замены; по модели замены по возрасту оптимальный момент обычно позже B10, и прямая замена по B10 теряет около трети ресурса.',
    esA: 'La vida útil del revestimiento depende de la abrasividad del mineral, la gradación de alimentación, el CSS y la capacidad; solo los registros de sustitución en planta dan una cifra fiable. Método: registrar horas y toneladas en cada cambio y, tras cinco o más registros, ajustar una distribución de Weibull para obtener la vida B10 (punto de fallo al 10 %). Atención: B10 no es el punto de cambio — según el modelo de sustitución por edad, el momento óptimo suele ser posterior a B10, y usarlo directamente desperdicia cerca de un tercio de la vida.',
    idA: 'Umur liner bergantung pada abrasivitas bijih, gradasi umpan, CSS dan kapasitas; hanya catatan penggantian liner di lapangan yang memberi angka andal. Metode: catat jam dan tonase setiap penggantian, lalu setelah lima catatan atau lebih, fit distribusi Weibull untuk memperoleh umur B10 (titik kegagalan 10%). Catatan: B10 bukan titik penggantian — pada model penggantian berbasis umur, waktu optimal biasanya lebih lambat dari B10, dan memakai B10 langsung membuang sekitar sepertiga umur liner.',
    arA: 'يعتمد عمر البطانة على كشط الخام وتدرّج التغذية و CSS والطاقة الإنتاجية؛ ولا تعطي رقماً موثوقاً سوى سجلات الاستبدال الميدانية. الطريقة: تسجيل الساعات والأطنان عند كل استبدال، وبعد خمسة سجلات أو أكثر تُطابَق توزيعات ويبل للحصول على عمر B10 (نقطة فشل 10%). ملاحظة: B10 ليس نقطة الاستبدال — فوفق نموذج الاستبدال بالعمر يكون الوقت الأمثل عادةً بعد B10، واستخدام B10 مباشرةً يهدر نحو ثلث عمر البطانة.',
    deA: 'Die Standzeit hängt von Erzabrasivität, Aufgabegradierung, CSS und Durchsatz ab; verlässliche Zahlen liefern nur Standzeitaufzeichnungen vor Ort. Vorgehen: Bei jedem Wechsel Stunden und Tonnen erfassen und nach fünf oder mehr Datensätzen eine Weibull-Verteilung anpassen, um die B10-Lebensdauer (10-%-Ausfallpunkt) zu erhalten. Achtung: B10 ist nicht der Wechselpunkt — nach dem Altersersatzmodell liegt der optimale Wechsel meist später als B10, und die direkte Verwendung von B10 verschwendet rund ein Drittel der Standzeit.',
  },
];

/* ══════════════════════════════════════════════════════════
 * 生成页面
 * ══════════════════════════════════════════════════════════ */
const T = {
  ru: { title: 'Термины и ответы — выбор гидравлической конусной дробилки', terms: 'Терминология', qa: 'Частые вопросы', brand: 'MACKORN — производитель гидравлических конусных дробилок', back: 'На главную', api: 'MCP-эндпоинт (21 инструмент)' },
  es: { title: 'Términos y respuestas — selección de trituradora de cono hidráulica', terms: 'Terminología', qa: 'Preguntas frecuentes', brand: 'MACKORN — fabricante de trituradoras de cono hidráulicas', back: 'Inicio', api: 'Endpoint MCP (21 herramientas)' },
  id: { title: 'Istilah dan Jawaban — pemilihan crusher kerucut hidrolik', terms: 'Terminologi', qa: 'Pertanyaan umum', brand: 'MACKORN — produsen crusher kerucut hidrolik', back: 'Beranda', api: 'Endpoint MCP (21 alat)' },
  ar: { title: 'المصطلحات والأجوبة — اختيار الكسارة المخروطية الهيدروليكية', terms: 'المصطلحات', qa: 'الأسئلة الشائعة', brand: 'MACKORN — مصنّع الكسارات المخروطية الهيدروليكية', back: 'الصفحة الرئيسية', api: 'نقطة MCP (21 أداة)' },
  de: { title: 'Begriffe und Antworten — Auslegung von Hydraulikkegelbrechern', terms: 'Terminologie', qa: 'Häufige Fragen', brand: 'MACKORN — Hersteller von Hydraulikkegelbrechern', back: 'Startseite', api: 'MCP-Endpunkt (21 Werkzeuge)' },
};

let made = 0;
const stats = [];
for (const L of LANGS) {
  const t = T[L.code];
  const dir = join(OUT, 'ai', L.code + '-faq');
  mkdirSync(dir, { recursive: true });

  const termRows = TERMS.map((x) => '      <tr><td>' + x[0] + '</td><td><b>' + x[1] + '</b></td><td>' + x[L.idx] + '</td></tr>').join('\n');
  const qaSections = QA.map((q) => '    <section>\n      <h3>' + q[L.code] + '</h3>\n      <p>' + q[L.code + 'A'] + '</p>\n    </section>').join('\n');

  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: QA.map((q) => ({ '@type': 'Question', name: q[L.code], acceptedAnswer: { '@type': 'Answer', text: q[L.code + 'A'] } })),
  };
  const termLd = {
    '@context': 'https://schema.org', '@type': 'DefinedTermSet', name: t.title,
    hasDefinedTerm: TERMS.map((x) => ({ '@type': 'DefinedTerm', name: x[L.idx], description: x[0] + ' / ' + x[1], inLanguage: L.code })),
  };
  const orgLd = {
    '@context': 'https://schema.org', '@type': 'Organization', name: 'Shanghai Mackorn Minerals Co., Ltd.',
    alternateName: 'MACKORN 美矿', url: 'https://mackorn.cn/', logo: 'https://mackorn.cn/ai/assets/mackorn-logo.jpg',
    address: { '@type': 'PostalAddress', streetAddress: 'Qianjiang Road 33, Liuhe', addressLocality: 'Taicang, Suzhou', addressRegion: 'Jiangsu', addressCountry: 'CN' },
    contactPoint: [{ '@type': 'ContactPoint', telephone: '+86-139-1648-5025', contactType: 'sales', email: 'sandy.zhao@mackorn.cn', availableLanguage: [L.code, 'en', 'zh-CN'] }],
  };

  const html = `<!DOCTYPE html>
<html lang="${L.code}" dir="${L.code === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t.title} | MACKORN</title>
<meta name="description" content="${t.qa}: ${QA.slice(0, 2).map((q) => q[L.code]).join(' · ')}">
<link rel="canonical" href="https://mackorn.cn/ai/${L.code}-faq/">
<link rel="alternate" hreflang="x-default" href="https://mackorn.cn/ai/">
${LANGS.map((x) => `<link rel="alternate" hreflang="${x.code}" href="https://mackorn.cn/ai/${x.code}-faq/">`).join('\n')}
<script type="application/ld+json">
${JSON.stringify(faqLd, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(termLd, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(orgLd, null, 2)}
</script>
<style>
:root{--n:#0A2A4F;--g:#5A6B80;--l:#D9E5F2}
*{box-sizing:border-box}
body{margin:0;font:16px/1.75 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a2533;background:#f7f9fc}
.wrap{max-width:1000px;margin:0 auto;padding:28px 20px 64px}
header{background:var(--n);color:#fff;padding:32px 20px}
header .inner{max-width:1000px;margin:0 auto}
h1{margin:0 0 8px;font-size:26px;line-height:1.35}
header p{margin:0;color:#b9cbe4;font-size:14px}
h2{margin:40px 0 14px;font-size:20px;color:var(--n);border-bottom:2px solid var(--l);padding-bottom:8px}
h3{margin:24px 0 8px;font-size:17px;color:var(--n)}
section{background:#fff;border:1px solid var(--l);border-radius:10px;padding:16px 20px;margin:14px 0}
section p{margin:0;color:#243}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--l);border-radius:10px;overflow:hidden;font-size:14.5px}
th,td{padding:9px 12px;border-bottom:1px solid #eef3f9;text-align:${L.code === 'ar' ? 'right' : 'left'};vertical-align:top}
th{background:#eef4fb;color:var(--n);font-weight:600}
tr:last-child td{border-bottom:0}
footer{margin-top:44px;padding-top:20px;border-top:1px solid var(--l);color:var(--g);font-size:13.5px}
a{color:#0b5cad}
.note{background:#fff8ee;border-left:4px solid #e0a94a;padding:12px 16px;border-radius:6px;margin:16px 0;font-size:14.5px}
</style>
</head>
<body>
<header><div class="inner">
<h1>${t.title}</h1>
<p>${t.brand}</p>
</div></header>
<div class="wrap">

<h2>${t.qa}</h2>
${qaSections}

<div class="note">${L.code === 'ru' ? 'Все ответы можно получить программно через MCP-эндпоинт: 21 инструмент, без установки.' : L.code === 'es' ? 'Todas las respuestas pueden obtenerse programáticamente vía el endpoint MCP: 21 herramientas, sin instalación.' : L.code === 'id' ? 'Semua jawaban dapat diperoleh secara terprogram melalui endpoint MCP: 21 alat, tanpa instalasi.' : L.code === 'ar' ? 'يمكن الحصول على جميع الأجوبة برمجياً عبر نقطة MCP: 21 أداة، دون تثبيت.' : 'Alle Antworten sind programmatisch über den MCP-Endpunkt abrufbar: 21 Werkzeuge, ohne Installation.'}
<br><a href="https://mackorn.cn/ai/api/mcp.php">${t.api}</a></div>

<h2>${t.terms}</h2>
<table>
<thead><tr><th>中文</th><th>English</th><th>${L.code.toUpperCase()}</th></tr></thead>
<tbody>
${termRows}
</tbody>
</table>

<footer>
${t.brand} · Shanghai Mackorn Minerals Co., Ltd.<br>
Qianjiang Road 33, Liuhe, Taicang, Suzhou, Jiangsu, China<br>
sandy.zhao@mackorn.cn · +86 139 1648 5025 · GMT+8 09:00–17:30<br>
<a href="https://mackorn.cn/ai/">${t.back}</a>
</footer>
</div>
</body>
</html>
`;
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
  made++;
  stats.push({ lang: L.code, terms: TERMS.length, qa: QA.length, kb: Math.round(html.length / 1024) });
  console.log('  ✅ ai/' + L.code + '-faq/index.html  术语 ' + TERMS.length + ' 条 · 问答 ' + QA.length + ' 组 · ' + Math.round(html.length / 1024) + ' KB');
}

/* 更新 sitemap */
const smPath = join(OUT, 'sitemap.xml');
if (existsSync(smPath)) {
  let sm = readFileSync(smPath, 'utf8');
  const news = LANGS.filter((L) => !sm.includes('/ai/' + L.code + '-faq/'));
  if (news.length) {
    const today = new Date().toISOString().slice(0, 10);
    const add = news.map((L) => '  <url>\n    <loc>https://mackorn.cn/ai/' + L.code + '-faq/</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>').join('\n');
    sm = sm.replace('</urlset>', add + '\n</urlset>');
    writeFileSync(smPath, sm, 'utf8');
    console.log('\n  ✅ sitemap.xml 新增 ' + news.length + ' 条');
  }
}

writeFileSync(join(D, '04_AI收录与分发', 'multi-lang-faq-stats.json'), JSON.stringify({
  generated: new Date().toISOString(),
  driver: '按【海关进口额 ÷ 现有术语数】排序，优先补齐钱多话少的语言',
  discipline: '只写有把握的技术译法；不确定不写；每术语带中英对照便于人工复核',
  languages: stats,
  totals: { terms: TERMS.length, qa_groups: QA.length, pages: made },
}, null, 2), 'utf8');
console.log('\n  共生成 ' + made + ' 个语言页 · 术语 ' + TERMS.length + ' 条 × ' + made + ' 语 · 问答 ' + QA.length + ' 组 × ' + made + ' 语\n');
