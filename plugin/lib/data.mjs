/**
 * MACKORN 液压圆锥破碎机 数据集（data.mjs）
 * ============================================================================
 * 零依赖数据模块。所有数字均来自 MACKORN 内部资料，逐条标注来源。
 *
 * 来源编码（source code）：
 *   S1 = E:\Mackorn\MACKORN美矿液压圆锥破专家\01_产品技术参数\NH_NS系列技术参数大全.md
 *        （其自身来源：美矿官网 mackorn.cn/68.html + 上海美矿样本.pdf）
 *   S2 = E:\Mackorn\MACKORN美矿破碎筛分生产线设计专家\knowledge-base\（生产选型规范）
 *   S3 = E:\Mackorn\MACKORN美矿液压圆锥破专家\05_市场竞品分析\液压圆锥破碎机竞品对比分析.md
 *   S4 = E:\Mackorn\MACKORN美矿液压圆锥破专家\06_销售报价参考\液压圆锥破碎机销售报价参考.md
 *
 * 纪律：不编造。查不到的字段写 null，绝不填猜测值。
 * ============================================================================
 */

export const SOURCES = {
  S1: 'NH_NS系列技术参数大全.md（上海美矿/官网 mackorn.cn）',
  S2: 'MACKORN美矿破碎筛分生产线设计专家/knowledge-base',
  S3: '液压圆锥破碎机竞品对比分析.md',
  S4: '液压圆锥破碎机销售报价参考.md',
  S5: 'MACKORN knowledge-base/16-皮带输送机配置手册.md（MACKORN 自有）',
  S6: 'MACKORN knowledge-base/09-选型设计规范与问答.md（MACKORN 自有）',
};

/**
 * MACKORN 皮带输送机宽度选型表。来源 S5 第一章第一节。
 * 这是 MACKORN 自有标准，优先于任何通用经验值。
 */
export const MACKORN_BELT_TABLE = [
  { widthMm: 650, maxFeedMm: 100, tph: [50, 200], use: '短距离、小粒度返料' },
  { widthMm: 800, maxFeedMm: 150, tph: [100, 350], use: '细碎返料、中短距离' },
  { widthMm: 1000, maxFeedMm: 200, tph: [200, 600], use: '中等输送量' },
  { widthMm: 1200, maxFeedMm: 300, tph: [400, 1000], use: '检查筛分出料、返料' },
  { widthMm: 1400, maxFeedMm: 400, tph: [600, 1500], use: '颚破出料、中碎入料' },
  { widthMm: 1600, maxFeedMm: 500, tph: [800, 2000], use: '颚破出料大产能、成品输送' },
];

/** MACKORN 带速选型。来源 S5 第一章第二节。 */
export const MACKORN_BELT_SPEED = [
  { material: '粗碎后大块岩石', speedMs: [1.25, 1.6], note: '保护皮带，减少冲击' },
  { material: '中碎料（50-200mm）', speedMs: [1.6, 2.0], note: '标准输送' },
  { material: '细碎料（<50mm）', speedMs: [2.0, 2.5], note: '可适当提速' },
  { material: '机制砂（<10mm）', speedMs: [2.5, 3.15], note: '高速输送' },
  { material: '洗砂（湿料）', speedMs: [2.0, 2.5], note: '防止跑偏' },
];

/** MACKORN 皮带机功率经验值（每米长度参考功率）。来源 S5 第一章第三节。 */
export const MACKORN_BELT_POWER_PER_M = {
  B800: 0.035, B1000: 0.05, B1200: 0.07, B1400: 0.09, B1600: 0.12,
  formulaHorizontal: 'P(kW) = (0.06 × V × Q × L + 0.735 × Q × L) / 367',
  formulaIncline: 'P_倾斜 = P_水平 × (1 + 0.005 × 倾角°)',
  source: 'S5',
};

/**
 * MACKORN 皮带机最大倾角（分带宽）。来源 S5 第四章第 4 条。
 *
 * 为什么不用通用值：
 *   通用经验值给的是 18-20°，但 MACKORN 手册按带宽分档收紧 ——
 *   带宽越大、料层越厚，允许倾角越小，否则易滚料跑偏。
 *   含泥湿料还要再降 2°。
 *
 * 冲突记录：ENGINEERING_DEFAULTS.beltConveyorInclineMaxDeg 原为通用区间 [18,20]，
 * 与本表并存，工具按本表取上限，通用值仅在带宽未知时兜底。
 */
export const MACKORN_BELT_INCLINE_MAX = [
  { widthFromMm: 650, widthToMm: 800, maxDeg: 18 },
  { widthFromMm: 1000, widthToMm: 1400, maxDeg: 16 },
  { widthFromMm: 1600, widthToMm: 1600, maxDeg: 14 },
];
/** 含泥湿料的倾角折减（度）。来源 S5 第四章第 4 条。 */
export const MACKORN_BELT_INCLINE_WET_REDUCE_DEG = 2;

/**
 * 按带宽取最大倾角。带宽落在两档之间时取更严格的一档（保守）。
 * @param {number} widthMm 皮带宽度 mm
 * @param {boolean} [wet] 是否含泥湿料
 * @returns {{maxDeg:number, band:string, source:string, wetReduce:number}}
 */
export function beltInclineMaxFor(widthMm, wet = false) {
  const w = Number(widthMm);
  let band = MACKORN_BELT_INCLINE_MAX.find((r) => w >= r.widthFromMm && w <= r.widthToMm);
  let basis = '档内';
  if (!band) {
    // 落在两档之间：取相邻两档中更严格（maxDeg 更小）的一档，保守取安全侧
    const below = MACKORN_BELT_INCLINE_MAX.filter((r) => r.widthToMm < w).pop();
    const above = MACKORN_BELT_INCLINE_MAX.find((r) => r.widthFromMm > w);
    if (below && above) {
      band = below.maxDeg <= above.maxDeg ? below : above;
      basis = '档间取严（B' + below.widthToMm + ' 与 B' + above.widthFromMm + ' 之间）';
    } else if (below) {
      band = below; basis = '超出上限，取最严档';
    } else {
      band = above; basis = '低于下限，取最小档';
    }
  }
  const wetReduce = wet ? MACKORN_BELT_INCLINE_WET_REDUCE_DEG : 0;
  return {
    maxDeg: band.maxDeg - wetReduce,
    band: band.widthFromMm === band.widthToMm ? `B${band.widthFromMm}` : `B${band.widthFromMm}-B${band.widthToMm}`,
    basis,
    wetReduce,
    source: 'S5 第四章第4条（MACKORN 自有标准）',
  };
}

/**
 * MACKORN 除铁器（磁选）配置规范。来源：MACKORN 技术口径（2026-10 由公司确认）。
 *
 * 这是**必须的选型项**，不是选配 —— 位置固定在粗碎与中碎之间。
 * 选型依据两条：① 皮带机宽度 ② 除铁器磁强度（高斯 Gauss）。
 *
 * 铁矿例外：常规除铁器不足，须加金属探测器 + 去磁 + 形状/磁场形状判别。
 */
export const MACKORN_MAGNET_SEPARATOR = {
  mandatory: true,
  primaryPosition: '粗碎（颚破）与中碎之间 —— 必须配置',
  optionalPosition: '中碎与细碎之间 —— 为除铁更干净时增设（非必须）',
  selectionBasis: ['皮带机宽度 mm', '除铁器磁强度 Gauss'],
  selectionNote: '按皮带宽 + 磁强度两维选型；带宽决定悬挂跨距与磁系长度，磁强度决定可吸除的铁件质量与埋深',
  source: 'MACKORN 技术口径（公司确认）',
};

/**
 * 铁矿专用除铁方案。来源：MACKORN 技术口径（公司确认）。
 *
 * 铁矿用常规除铁器无法满足要求 —— 因为矿石本身有磁性，会与铁件一起被"吸"，
 * 且皮带上的料本身即磁铁矿/赤铁矿，常规磁选无法区分"要除的铁件"与"要保留的矿石"。
 * 因此须叠加金属探测器，并配合去磁与形状/磁场形状判别，提升辨别能力。
 */
export const MACKORN_IRON_ORE_METAL_DETECTION = {
  appliesTo: ['铁矿（磁铁矿/赤铁矿）', '其他强磁性矿石'],
  required: ['金属探测器', '去磁装置', '形状或磁场形状判别'],
  why: '铁矿自身具磁性，常规除铁器无法把"要除的铁件"与"要保留的矿石"区分开',
  note: '须与除铁器配合使用，单独配置无效',
  source: 'MACKORN 技术口径（公司确认）',
};

/**
 * MACKORN 安装费估算口径。来源：MACKORN 商务口径（公司确认）。
 *
 * 按设备吨位估算：2000 元/吨。
 * 注意与另一口径的关系：知识库《18-项目需求分析手册》另有"安装调试 = 设备总价 8-12%"的比例口径。
 * 两者并存 —— 吨位法用于快速估算，比例法用于合同口径，工具同时给出并标注差异。
 */
export const MACKORN_INSTALL_COST_CNY_PER_TON = 2000;
export const MACKORN_INSTALL_COST = {
  cnyPerTon: MACKORN_INSTALL_COST_CNY_PER_TON,
  method: '按设备吨位估算：1 吨 = 2000 元',
  altMethod: '按设备总价 8-12%（来源：18-项目需求分析手册）',
  note: '两种口径并存：吨位法用于快速估算，比例法用于合同口径；差异大时以实际询价为准',
  source: 'MACKORN 商务口径（公司确认）',
};

/**
 * MACKORN 偏心距（冲程）出厂确定规则。来源：MACKORN 技术口径（公司确认）。
 *
 * 偏心距**不是固定值** —— 每台设备出厂前，根据客户矿石硬度确定初始偏心距。
 * 含义：选型工具不应给固定偏心距，而应把"顾客矿石硬度"作为确定偏心距的输入。
 *
 * 工程逻辑（据硬度调整方向）：
 *   矿石越硬 → 需要更大的破碎力与更少的过粉碎 → 取向偏小偏心距（层压破碎为主）
 *   矿石越软 → 可取较大偏心距以提高通过量
 * 注：具体对应表须由技术部按机型给出；此处只固化"按矿石硬度出厂确定"这条规则本身，
 *     以及工具默认值仍用 25mm（文献典型值）作为**占位**，并强制标注需以出厂值为准。
 */
export const MACKORN_ECCENTRIC_THROW = {
  determinedBy: '客户矿石硬度（出厂前确定初始偏心距）',
  isFixedValue: false,
  toolDefaultMm: 25,
  toolDefaultSource: 'LITERATURE（文献典型值，仅占位）',
  requiredAction: '下单前须向技术部确认该机型对应该矿石硬度的出厂偏心距',
  note: '同一机型对不同矿石硬度可配不同初始偏心距 —— 不得把 25mm 当作 MACKORN 标定值',
  source: 'MACKORN 技术口径（公司确认）',
};

/**
 * MACKORN 各段破碎比参考。来源 S6 §1.2。
 * 注意：与 MSS 引擎内部使用的粗碎 5:1 存在冲突（内部缺口分析已记录），
 * 本表为 MACKORN 书面规范，工具默认采用本表，冲突在 assumptions 中标注。
 */
export const MACKORN_STAGE_RATIO = [
  { stage: '粗碎', feedMm: [800, 1200], productMm: [100, 200], ratio: [6, 8], equipment: 'MC/MJ 颚破' },
  { stage: '中碎（粗腔）', feedMm: [150, 300], productMm: [40, 70], ratio: [4, 6], equipment: 'NH EC 腔' },
  { stage: '中碎（中腔）', feedMm: [75, 200], productMm: [20, 50], ratio: [3, 5], equipment: 'NH MC 腔' },
  { stage: '细碎', feedMm: [30, 80], productMm: [8, 20], ratio: [3, 4], equipment: 'MPH MC 腔' },
  { stage: '制砂', feedMm: [30, 50], productMm: [0, 5], ratio: [6, 10], equipment: 'CVS' },
];

/** MACKORN 粗碎设备选型表。来源 S6 §1.1。 */
export const MACKORN_COARSE_CRUSHER_TABLE = [
  { tph: [100, 200], maxFeedMm: 600, equipment: 'MC110', dischargeMm: [100, 150] },
  { tph: [200, 400], maxFeedMm: 700, equipment: 'MC116 / MJ613', dischargeMm: [100, 150] },
  { tph: [400, 700], maxFeedMm: 800, equipment: 'MC125 / MJ613', dischargeMm: [100, 180] },
  { tph: [700, 1200], maxFeedMm: 850, equipment: 'MC150 / MJ613×2', dischargeMm: [150, 200] },
  { tph: [1200, 2000], maxFeedMm: 1000, equipment: 'MC1600×2', dischargeMm: [200, 250] },
  { tph: [2000, Infinity], maxFeedMm: 1200, equipment: '旋回破 / MC1600×3', dischargeMm: [250, 300] },
];

/**
 * 衬板寿命工程参考。来源 S6 §Q3。
 * 用于 cost_estimate 的衬板吨成本测算（用户未提供实测值时的默认）。
 */
export const MACKORN_LINER_LIFE = {
  granite: { NH700_NH800: [6000, 12000], MPH50: [4000, 8000], note: '花岗岩工况' },
  limestoneFactor: [1.5, 2.0],
  replaceCriterion: '排料口调整无法补偿粒形变差，或目视衬板厚度不足原始的 50%',
  source: 'S6',
};

/** NH 系列：标准型单缸液压圆锥破碎机。来源 S1 §1.1 */
export const NH_SERIES = [
  { model: 'NH200', maxFeedMm: 135, cssMin: 4, cssMax: 32, powerKw: 90, weightKg: 5300, maxServiceKg: 1400, capacityTph: [25, 125], source: 'S1' },
  { model: 'NH300', maxFeedMm: 185, cssMin: 6, cssMax: 38, powerKw: 160, weightKg: 9200, maxServiceKg: 2900, capacityTph: [45, 205], source: 'S1' },
  { model: 'NH400', maxFeedMm: 215, cssMin: 8, cssMax: 44, powerKw: 250, weightKg: 14300, maxServiceKg: 4700, capacityTph: [87, 394], source: 'S1' },
  { model: 'NH600', maxFeedMm: 275, cssMin: 13, cssMax: 51, powerKw: 315, weightKg: 26800, maxServiceKg: 8500, capacityTph: [160, 659], source: 'S1' },
  { model: 'NH700', maxFeedMm: 350, cssMin: 10, cssMax: 70, powerKw: 630, weightKg: 49800, maxServiceKg: 13200, capacityTph: [277, 1508], source: 'S1' },
  { model: 'NH860', maxFeedMm: 315, cssMin: 16, cssMax: 51, powerKw: 500, weightKg: 39710, maxServiceKg: 11780, capacityTph: [285, 1123], source: 'S1' },
  { model: 'NH865', maxFeedMm: 123, cssMin: 10, cssMax: 44, powerKw: 500, weightKg: 38930, maxServiceKg: 11000, capacityTph: [162, 694], source: 'S1' },
  { model: 'NH890', maxFeedMm: 370, cssMin: 16, cssMax: 70, powerKw: 750, weightKg: 76100, maxServiceKg: 21600, capacityTph: [503, 2436], source: 'S1' },
  { model: 'NH895', maxFeedMm: 120, cssMin: 10, cssMax: 70, powerKw: 750, weightKg: 79100, maxServiceKg: 24900, capacityTph: [246, 1452], source: 'S1' },
];

/** NS 系列：高速型单缸液压圆锥破碎机。来源 S1 §2.1 */
export const NS_SERIES = [
  { model: 'NS200', maxFeedMm: 240, cssMin: 19, cssMax: 38, powerKw: 90, weightKg: 6800, maxServiceKg: 2300, capacityTph: [69, 166], source: 'S1' },
  { model: 'NS300', maxFeedMm: 360, cssMin: 19, cssMax: 54, powerKw: 160, weightKg: 12000, maxServiceKg: 5100, capacityTph: [90, 341], source: 'S1' },
  { model: 'NS400', maxFeedMm: 450, cssMin: 25, cssMax: 54, powerKw: 250, weightKg: 19300, maxServiceKg: 8100, capacityTph: [193, 598], source: 'S1' },
  { model: 'NS600', maxFeedMm: 560, cssMin: 38, cssMax: 83, powerKw: 315, weightKg: 35700, maxServiceKg: 16500, capacityTph: [313, 1046], source: 'S1' },
];

/**
 * 腔型代码 → 含义 → 适用场景。来源 S1 §1.2 / §4.2
 * feedRangeMm 为 S1 §4.2「根据给料粒度选型」给出的最大给料粒度分档。
 */
export const CAVITY_TYPES = [
  { code: 'EC', name: '超粗腔', use: '大给料、粗产品', feedMaxMm: 350, source: 'S1' },
  { code: 'C', name: '粗腔', use: '中等给料', feedMaxMm: 350, source: 'S1' },
  { code: 'MC', name: '中粗腔', use: '通用', feedMaxMm: 200, source: 'S1' },
  { code: 'M', name: '中腔', use: '细碎入门', feedMaxMm: 200, source: 'S1' },
  { code: 'MF', name: '中细腔', use: '中细碎', feedMaxMm: 100, source: 'S1' },
  { code: 'F', name: '细腔', use: '细碎', feedMaxMm: 100, source: 'S1' },
  { code: 'EF', name: '超细腔', use: '超细碎', feedMaxMm: 50, source: 'S1' },
  { code: 'EFX', name: '特细腔', use: '特细碎', feedMaxMm: 50, source: 'S1' },
  { code: 'EEF', name: '极细腔', use: '极致细度', feedMaxMm: 50, source: 'S1' },
];

/** 腔型 → 最大给料粒度档位（S1 §4.2）。用于选型的硬约束校验。 */
export const CAVITY_FEED_TABLE = [
  { maxFeedLtMm: 50, cavity: ['EF', 'EFX', 'EEF'] },
  { maxFeedLtMm: 100, cavity: ['F', 'MF'] },
  { maxFeedLtMm: 200, cavity: ['M', 'MC'] },
  { maxFeedLtMm: 350, cavity: ['C', 'EC'] },
  { maxFeedLtMm: Infinity, cavity: ['EC'], note: '需预筛分' },
];

/**
 * 各腔型 × CSS 的生产能力详表（t/h）。
 * cap 为 [min, max]，单值产能写为 [v, v]，"-" 记为 null。
 * 来源 S1 §1.3 / §1.4 / §1.5
 */
export const CAVITY_CAPACITY = {
  NH200: {
    css: [6, 8, 10, 13, 16, 19, 22],
    rows: [
      { cavity: 'EC', maxFeedMm: 135, cap: [[43, 43], [49, 82], [51, 90], [55, 97], [61, 103], [65, 110], [73, 125]] },
      { cavity: 'C', maxFeedMm: 90, cap: [[41, 51], [43, 87], [47, 93], [52, 101], [55, 109], [59, 119], [68, 68]] },
      { cavity: 'M', maxFeedMm: 65, cap: [[35, 42], [35, 71], [41, 79], [43, 75], [47, 55], null, null] },
      { cavity: 'MF', maxFeedMm: 50, cap: [[33, 33], [35, 66], [39, 69], [42, 65], [45, 51], null, null] },
      { cavity: 'F', maxFeedMm: 38, cap: [[25, 31], [24, 48], [29, 51], [30, 55], [33, 47], [35, 35], null] },
    ],
    efNote: 'EF 腔：30-40 t/h，80% 细度 < 4.5-5.5mm',
  },
  NH300: {
    css: [8, 10, 13, 16, 19, 22, 25],
    rows: [
      { cavity: 'EC', maxFeedMm: 185, cap: [[67, 105], [75, 148], [77, 160], [84, 170], [90, 180], [103, 203], [113, 205]] },
      { cavity: 'C', maxFeedMm: 145, cap: [[63, 130], [68, 139], [75, 149], [78, 160], [83, 171], [95, 194], [106, 146]] },
      { cavity: 'MC', maxFeedMm: 115, cap: [[55, 55], [61, 138], [63, 150], [71, 160], [75, 170], [79, 183], [92, 144]] },
      { cavity: 'M', maxFeedMm: 90, cap: [[63, 83], [67, 129], [72, 139], [78, 151], [83, 161], [88, 152], [101, 101]] },
      { cavity: 'MF', maxFeedMm: 75, cap: [[58, 58], [62, 105], [67, 113], [72, 121], [80, 125], [85, 112], [91, 91]] },
      { cavity: 'F', maxFeedMm: 50, cap: [[45, 75], [50, 82], [52, 86], [56, 93], [62, 102], [65, 102], [71, 94]] },
    ],
    efNote: 'EF 腔：70-90 t/h，80% 细度 < 5-5.6mm',
  },
  NH400: {
    css: [10, 13, 16, 19, 22, 25, 32, 38],
    rows: [
      { cavity: 'EC', maxFeedMm: 215, cap: [[110, 196], [117, 271], [130, 293], [137, 312], [156, 353], [174, 394], [190, 382], null] },
      { cavity: 'C', maxFeedMm: 175, cap: [[100, 100], [108, 217], [115, 999], [123, 310], [130, 329], [150, 377], [162, 330], [181, 227]] },
      { cavity: 'MC', maxFeedMm: 140, cap: [[95, 120], [103, 259], [112, 281], [117, 298], [125, 317], [143, 325], [160, 241], null] },
      { cavity: 'M', maxFeedMm: 110, cap: [[113, 183], [123, 275], [135, 297], [142, 315], [153, 338], [173, 278], [189, 189], null] },
      { cavity: 'MF', maxFeedMm: 85, cap: [[112, 112], [122, 225], [131, 242], [141, 260], [151, 279], [161, 297], [184, 246], null] },
      { cavity: 'F', maxFeedMm: 70, cap: [[87, 132], [92, 172], [103, 189], [110, 204], [118, 219], [126, 233], [135, 249], [153, 205]] },
    ],
    efNote: 'EF 腔：100-125 t/h，80% 细度 < 6-7.5mm',
  },
};

/** 按目标产量选型（S1 §4.1）。tphMax 为开区间上界。 */
export const CAPACITY_TO_MODEL = [
  { tphMax: 150, models: ['NH200', 'NS200'], powerKw: 90 },
  { tphMax: 300, models: ['NH300', 'NS300'], powerKw: 160 },
  { tphMax: 500, models: ['NH400', 'NS400'], powerKw: 250 },
  { tphMax: 800, models: ['NH600', 'NS600'], powerKw: 315 },
  { tphMax: 1200, models: ['NH700'], powerKw: 630 },
  { tphMax: 2000, models: ['NH860', 'NH865'], powerKw: 500 },
  { tphMax: 2500, models: ['NH890', 'NH895'], powerKw: 750 },
];

/** NH 系列外形尺寸（mm）。来源 S1 §3.1。null = 来源标注"需核实"。 */
export const NH_DIMENSIONS = {
  NH200: { A: 1285, B: null, C: 1020, D: 540, E: 1342, F: 400, G: 843, H: 1270, I: 1703, K_totalLength: 3600 },
  NH300: { A: 1635, B: 2348, C: 1125, D: 665, E: 1705, F: 422, G: 1061, H: 1705, I: 2050, K_totalLength: 4250 },
  NH400: { A: 2000, B: null, C: 1300, D: 745, E: 2030, F: 452, G: 1280, H: 1900, I: 2420, K_totalLength: 4930 },
  NH600: { A: 2800, B: null, C: 1600, D: 860, E: 2640, F: 630, G: 1497, H: 2156, I: 2895, K_totalLength: 5353 },
  NH700: { A: 2660, B: 4635, C: 2200, D: 1228, E: 2045, F: 998, G: 1824, H: 2850, I: 3095, K_totalLength: 6600 },
  NH890: { A: 2900, B: 5475, C: 2870, D: 1190, E: 2400, F: 1150, G: 1960, H: 3100, I: 3500, K_totalLength: 7700 },
  NH895: { A: 2900, B: 6456, C: 2870, D: 1190, E: 2400, F: 1150, G: 1960, H: 3100, I: 3500, K_totalLength: 7700 },
};

/**
 * 工程经验参数（用于推算，非厂商标定值）。
 * 每个参数都带 range 与 source；tool 输出必须原样回显给用户，禁止当作标定值。
 */
export const ENGINEERING_DEFAULTS = {
  screeningUnitCapacityTphPerM2: {
    value: [12, 30],
    unit: 't/h·m²',
    note: '圆振动筛单位面积处理量经验区间，随筛孔、湿粘程度、效率要求浮动；实际须以筛机选型表核算',
    source: 'ENGINEERING-RANGE(非厂商标定)',
  },
  screeningEfficiency: { value: [0.85, 0.92], unit: '-', note: '常规闭路筛分效率取值区间', source: 'ENGINEERING-RANGE(非厂商标定)' },
  circulatingLoadClosedCircuit: { value: [1.15, 1.35], unit: 'x', note: '闭路循环负荷系数', source: 'ENGINEERING-RANGE(非厂商标定)' },
  beltConveyorInclineMaxDeg: {
    value: [18, 20],
    unit: '°',
    note: '普通橡胶带最大倾角兜底区间（带宽未知时用）。带宽已知时须改用 beltInclineMaxFor(widthMm, wet)，'
      + 'MACKORN 分带宽档为 B650-B800≤18°、B1000-B1400≤16°、B1600≤14°，含泥湿料再降 2°',
    source: 'ENGINEERING-RANGE(非厂商标定) → 优先 MACKORN_BELT_INCLINE_MAX',
  },
  motorEfficiency: { value: 0.92, unit: '-', note: '电机效率默认值', source: 'ENGINEERING-DEFAULT' },
  loadFactor: { value: 0.75, unit: '-', note: '破碎机负荷率默认值（连续工况）', source: 'ENGINEERING-DEFAULT' },
  electricityPriceCnyPerKwh: { value: [0.55, 0.85], unit: '元/kWh', note: '工业电价区间（中国境内）', source: 'ENGINEERING-RANGE(非厂商标定)' },
  annualOperatingHours: { value: [6000, 7200], unit: 'h/年', note: '年运行小时数区间', source: 'ENGINEERING-RANGE(非厂商标定)' },
  crushingStagesGuide: [
    { totalRatioMax: 6, stages: 1, note: '单段（给料已较细）' },
    { totalRatioMax: 25, stages: 2, note: '两段：粗碎 + 中细碎' },
    { totalRatioMax: 100, stages: 3, note: '三段：粗碎 + 中碎 + 细碎（最常用）' },
    { totalRatioMax: Infinity, stages: 4, note: '四段或三段+超细碎（含制砂）' },
  ],
};

/** 腔型 → 产品细度倾向（从 S1 表格备注提取，不推断）。 */
export const CAVITY_FINENESS_NOTE = {
  EC: '粗产品为主，用于第一段/第二段给料准备',
  C: '粗产品',
  MC: '通用中粗',
  M: '中腔，细碎入门',
  MF: '中细碎',
  F: '细碎',
  EF: '超细碎（S1 备注给出 80% 细度上限）',
  EFX: '特细碎',
  EEF: '极致细度',
};

export const ALL_MODELS = [...NH_SERIES, ...NS_SERIES];

export function findModel(model) {
  const key = String(model || '').trim().toUpperCase().replace(/\s+/g, '');
  return ALL_MODELS.find((m) => m.model.toUpperCase() === key) || null;
}

/* ══════════════════════════════════════════════════════════════════
 * 材料库（R44 从 tools/material-library.mjs 搬入，成为【单一真相源】）
 *
 * 为什么搬进来：gen_php_mcp 只从本文件取数据 ——
 *   材料库留存在 tools/ 里，PHP 端点的 mackorn_knowledge 就用不上，
 *   而我们最重要的差异化能力（材料库/经验库/错误库入口）就对外失效了。
 *
 * 来源等级：S3 文献 / S4 MACKORN 现场经验（见 SOURCE_LEVELS）
 * ══════════════════════════════════════════════════════════════════ */
export const MATERIALS = {
  花岗岩: {
    en: 'granite', group: '火成岩（酸性侵入岩）',
    ucs_mpa: { v: [100, 250], src: 'S3', note: '岩石力学手册典型区间' },
    wi_kwh_t: { v: [13, 16], src: 'S3', note: 'Bond 功指数，选矿教科书典型区间' },
    density_t_m3: { v: [2.6, 2.8], src: 'S3', note: '真密度' },
    bulk_density_t_m3: { v: [1.4, 1.6], src: 'S4', note: '破碎后堆积密度（现场经验）' },
    mohs: { v: [6, 7], src: 'S3', note: '主要造岩矿物为石英+长石' },
    abrasion_ai: { v: [0.4, 0.7], src: 'S3', note: '磨蚀指数（高，石英含量高）' },
    moisture_pct: { v: [0.3, 4], src: 'S4', note: '露天矿常态' },
    crushability: '中等偏难',
    cavity_hint: '中碎用 MC/M 腔，细碎用 F/EF 腔；衬板选中高锰钢或高铬铸铁',
    stage_hint: '3 段（粗颚 + 中圆锥 + 细圆锥）较稳妥；2 段仅用于产品较粗时',
    notes: '最常见的硬岩骨料母岩；石英含量高时衬板磨损显著加快',
  },
  玄武岩: {
    en: 'basalt', group: '火成岩（基性喷出岩）',
    ucs_mpa: { v: [150, 300], src: 'S3' },
    wi_kwh_t: { v: [14, 18], src: 'S3', note: 'Bond 功指数，偏高' },
    density_t_m3: { v: [2.8, 3.0], src: 'S3' },
    bulk_density_t_m3: { v: [1.5, 1.8], src: 'S4' },
    mohs: { v: [6, 7], src: 'S3' },
    abrasion_ai: { v: [0.5, 0.8], src: 'S3', note: '磨蚀性很高' },
    moisture_pct: { v: [0.5, 3], src: 'S4' },
    crushability: '难',
    cavity_hint: '中碎 MC/M；细碎 F/EF；必须选耐磨衬板（高铬铸铁或陶瓷复合）',
    stage_hint: '建议 3 段；层压破碎（满腔给料）对玄武岩尤其重要',
    notes: '骨料粒形好（立方体含量高），但破碎难度与衬板消耗都大',
  },
  安山岩: {
    en: 'andesite', group: '火成岩（中性喷出岩）',
    ucs_mpa: { v: [100, 200], src: 'S3' },
    wi_kwh_t: { v: [12, 17], src: 'S3' },
    density_t_m3: { v: [2.5, 2.8], src: 'S3' },
    bulk_density_t_m3: { v: [1.4, 1.6], src: 'S4' },
    mohs: { v: [5, 7], src: 'S3' },
    abrasion_ai: { v: [0.3, 0.6], src: 'S3' },
    moisture_pct: { v: [0.5, 4], src: 'S4' },
    crushability: '中等',
    cavity_hint: 'MC/M 中碎，F 细碎',
    stage_hint: '3 段常见',
    notes: '性质介于玄武岩与石灰岩之间；东南亚骨料线常见',
  },
  辉绿岩: {
    en: 'diabase / dolerite', group: '火成岩（基性浅成岩）',
    ucs_mpa: { v: [150, 300], src: 'S3' },
    wi_kwh_t: { v: [14, 18], src: 'S3' },
    density_t_m3: { v: [2.8, 3.0], src: 'S3' },
    bulk_density_t_m3: { v: [1.5, 1.8], src: 'S4' },
    mohs: { v: [6, 7], src: 'S3' },
    abrasion_ai: { v: [0.4, 0.7], src: 'S3' },
    moisture_pct: { v: [0.5, 3], src: 'S4' },
    crushability: '难',
    cavity_hint: 'MC/M 中碎；细碎 F/EF',
    stage_hint: '3 段；高速型 NS 用于细碎可提升细料比例',
    notes: '常作高等级骨料与铁路道砟；硬度接近玄武岩',
  },
  石灰石: {
    en: 'limestone', group: '沉积岩（碳酸盐）',
    ucs_mpa: { v: [40, 150], src: 'S3', note: '随硅质含量变化大' },
    wi_kwh_t: { v: [9, 12], src: 'S3', note: 'Bond 功指数，偏低' },
    density_t_m3: { v: [2.6, 2.8], src: 'S3' },
    bulk_density_t_m3: { v: [1.3, 1.5], src: 'S4' },
    mohs: { v: [3, 5], src: 'S3', note: '方解石为主，石英含量低' },
    abrasion_ai: { v: [0.1, 0.3], src: 'S3', note: '磨蚀性低' },
    moisture_pct: { v: [0.5, 6], src: 'S4' },
    crushability: '易',
    cavity_hint: '可用 EC/C 粗腔型（大给料、高产）；衬板可用普通高锰钢',
    stage_hint: '常 2 段即可；但若要求骨料粒形好，细碎仍需圆锥（非反击破）',
    notes: '水泥原料与骨料主力；衬板寿命长，运行成本低。硅质（燧石）含量高时硬度显著上升',
  },
  白云岩: {
    en: 'dolomite', group: '沉积岩（碳酸盐）',
    ucs_mpa: { v: [50, 160], src: 'S3' },
    wi_kwh_t: { v: [10, 13], src: 'S3' },
    density_t_m3: { v: [2.7, 2.9], src: 'S3' },
    bulk_density_t_m3: { v: [1.3, 1.6], src: 'S4' },
    mohs: { v: [3.5, 4], src: 'S3' },
    abrasion_ai: { v: [0.15, 0.35], src: 'S3' },
    moisture_pct: { v: [0.5, 5], src: 'S4' },
    crushability: '易—中等',
    cavity_hint: 'C/MC 中碎，M/F 细碎',
    stage_hint: '2—3 段',
    notes: '比石灰石略硬；MgO 含量高，用于耐火与冶金熔剂',
  },
  铁矿石: {
    en: 'iron ore', group: '金属矿石',
    ucs_mpa: { v: [100, 300], src: 'S3', note: '随品位与脉石变化大' },
    wi_kwh_t: { v: [12, 16], src: 'S3' },
    density_t_m3: { v: [3.2, 4.5], src: 'S3', note: '磁铁矿偏高' },
    bulk_density_t_m3: { v: [1.8, 2.4], src: 'S4' },
    mohs: { v: [5.5, 6.5], src: 'S3' },
    abrasion_ai: { v: [0.3, 0.6], src: 'S3' },
    moisture_pct: { v: [2, 8], src: 'S4' },
    crushability: '中—难',
    cavity_hint: 'MC/M 中碎；细碎 F/EF（若为球磨给料，常用高压辊磨替代）',
    stage_hint: '3 段 + 筛分；细碎后常接磨矿',
    notes: '密度大意味着同体积产能下降（按 t/h 计需注意）；磁铁矿磨蚀性高',
  },
  铜矿石: {
    en: 'copper ore', group: '金属矿石',
    ucs_mpa: { v: [80, 250], src: 'S3' },
    wi_kwh_t: { v: [12, 16], src: 'S3' },
    density_t_m3: { v: [2.7, 3.2], src: 'S3' },
    bulk_density_t_m3: { v: [1.6, 2.0], src: 'S4' },
    mohs: { v: [4, 6.5], src: 'S3' },
    abrasion_ai: { v: [0.25, 0.55], src: 'S3' },
    moisture_pct: { v: [2, 8], src: 'S4' },
    crushability: '中等',
    cavity_hint: 'M/MC 中碎；细碎 F（SABC 流程常用）',
    stage_hint: '3 段 + 筛分，或半自磨（SAG）流程',
    notes: '多为斑岩铜矿；矿石性质横向变化大，标定应分区域取样',
  },
  金矿石: {
    en: 'gold ore', group: '金属矿石',
    ucs_mpa: { v: [80, 250], src: 'S3' },
    wi_kwh_t: { v: [13, 17], src: 'S3' },
    density_t_m3: { v: [2.6, 3.0], src: 'S3' },
    bulk_density_t_m3: { v: [1.5, 1.9], src: 'S4' },
    mohs: { v: [4, 6.5], src: 'S3' },
    abrasion_ai: { v: [0.3, 0.6], src: 'S3' },
    moisture_pct: { v: [2, 8], src: 'S4' },
    crushability: '中—难',
    cavity_hint: 'M 中碎；F/EF 细碎（为磨矿/堆浸准备粒度）',
    stage_hint: '3 段；堆浸项目更关注粒度均匀性',
    notes: '石英脉型硬度高；含黏土时需先除土，否则圆锥破腔易堵',
  },
  铅锌矿石: {
    en: 'lead-zinc ore', group: '金属矿石',
    ucs_mpa: { v: [70, 200], src: 'S3' },
    wi_kwh_t: { v: [11, 15], src: 'S3' },
    density_t_m3: { v: [3.0, 4.0], src: 'S3', note: '方铅矿密度大' },
    bulk_density_t_m3: { v: [1.7, 2.2], src: 'S4' },
    mohs: { v: [3, 5], src: 'S3', note: '方铅矿/闪锌矿偏软' },
    abrasion_ai: { v: [0.15, 0.4], src: 'S3' },
    moisture_pct: { v: [2, 7], src: 'S4' },
    crushability: '中等',
    cavity_hint: 'M/MC 中碎，F 细碎',
    stage_hint: '3 段',
    notes: '密度高，按 t/h 计产能低于同体积的石灰石',
  },
  石英岩: {
    en: 'quartzite', group: '变质岩',
    ucs_mpa: { v: [150, 350], src: 'S3' },
    wi_kwh_t: { v: [12, 15], src: 'S3', note: 'Bond Wi 中等，但磨蚀性极高' },
    density_t_m3: { v: [2.6, 2.8], src: 'S3' },
    bulk_density_t_m3: { v: [1.5, 1.7], src: 'S4' },
    mohs: { v: [7], src: 'S3' },
    abrasion_ai: { v: [0.6, 1.0], src: 'S3', note: '磨蚀性最高的一类' },
    moisture_pct: { v: [0.3, 3], src: 'S4' },
    crushability: '很难',
    cavity_hint: '必须选最耐磨衬板；腔型选 MC/M 以保证层压',
    stage_hint: '3 段；衬板寿命是主要成本项',
    notes: '注意：Wi 不高但磨蚀指数极高 —— 能耗不是瓶颈，衬板寿命才是',
  },
  片麻岩: {
    en: 'gneiss', group: '变质岩',
    ucs_mpa: { v: [100, 250], src: 'S3' },
    wi_kwh_t: { v: [13, 16], src: 'S3' },
    density_t_m3: { v: [2.6, 2.9], src: 'S3' },
    bulk_density_t_m3: { v: [1.4, 1.7], src: 'S4' },
    mohs: { v: [6, 7], src: 'S3' },
    abrasion_ai: { v: [0.4, 0.7], src: 'S3' },
    moisture_pct: { v: [0.5, 4], src: 'S4' },
    crushability: '中等偏难',
    cavity_hint: 'MC/M 中碎，F 细碎',
    stage_hint: '3 段',
    notes: '片理发育，产品针片状含量可能偏高，需关注粒形',
  },
  砂岩: {
    en: 'sandstone', group: '沉积岩',
    ucs_mpa: { v: [30, 150], src: 'S3' },
    wi_kwh_t: { v: [10, 14], src: 'S3' },
    density_t_m3: { v: [2.2, 2.6], src: 'S3' },
    bulk_density_t_m3: { v: [1.3, 1.6], src: 'S4' },
    mohs: { v: [4, 6], src: 'S3', note: '取决于胶结物与石英含量' },
    abrasion_ai: { v: [0.3, 0.7], src: 'S3' },
    moisture_pct: { v: [1, 8], src: 'S4' },
    crushability: '易—中等',
    cavity_hint: 'C/MC 中碎（给料可较粗），M/F 细碎',
    stage_hint: '2—3 段',
    notes: '硅质胶结的砂岩磨蚀性可能很高，不能只看 UCS',
  },
  凝灰岩: {
    en: 'tuff', group: '火山碎屑岩',
    ucs_mpa: { v: [20, 120], src: 'S3' },
    wi_kwh_t: { v: [10, 14], src: 'S3' },
    density_t_m3: { v: [1.8, 2.4], src: 'S3' },
    bulk_density_t_m3: { v: [1.0, 1.4], src: 'S4' },
    mohs: { v: [3, 5], src: 'S3' },
    abrasion_ai: { v: [0.2, 0.5], src: 'S3' },
    moisture_pct: { v: [2, 10], src: 'S4' },
    crushability: '易',
    cavity_hint: 'C/MC 中碎；注意含泥时选大腔型防堵',
    stage_hint: '2—3 段',
    notes: '密度低、孔隙率高，吸水性强；含泥时须先除土',
  },
};

export const SOURCE_LEVELS = {
  S1: '设备厂商公布参数',
  S2: '国家标准 / 行业标准',
  S3: '公开文献 / 教科书',
  S4: '工程经验区间（MACKORN 内部）',
  S5: '现场实测（须标注工况）',
};
