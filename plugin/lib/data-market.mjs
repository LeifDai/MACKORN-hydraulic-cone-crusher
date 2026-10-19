/**
 * MACKORN 市场纵深数据集（data-market.mjs）
 * ============================================================================
 * 来源：
 *   S3 = E:\Mackorn\MACKORN美矿液压圆锥破专家\05_市场竞品分析\液压圆锥破碎机竞品对比分析.md
 *   S4 = E:\Mackorn\MACKORN美矿液压圆锥破专家\06_销售报价参考\液压圆锥破碎机销售报价参考.md
 *
 * 纪律：价格与竞品结论均为「历史参考区间」，工具输出必须原样带上免责说明。
 *       本文件不含任何编造数字。
 * ============================================================================
 */

export const PRICE_DISCLAIMER =
  '以下为 MACKORN 内部历史参考价格区间（来源 S4），实际报价以最新商务确认为准；汇率、钢材价、电压等级、液压站配置、交货条件均会显著影响最终价格。';

/** NH 系列参考价（万元/台，380V 国产配置）。来源 S4 §2.1 */
export const PRICE_NH = [
  { model: 'NH200', powerKw: 90, priceWanCny: [18, 25], note: '基础型' },
  { model: 'NH300', powerKw: 160, priceWanCny: [28, 38], note: '基础型' },
  { model: 'NH400', powerKw: 250, priceWanCny: [38, 55], note: '基础型' },
  { model: 'NH600', powerKw: 315, priceWanCny: [55, 78], note: '主力机型' },
  { model: 'NH700', powerKw: 630, priceWanCny: [85, 120], note: '大型线配置' },
  { model: 'NH860', powerKw: 500, priceWanCny: [75, 108], note: '粗腔高产（含 NH865）' },
  { model: 'NH865', powerKw: 500, priceWanCny: [75, 108], note: '粗腔高产（与 NH860 同档）' },
  { model: 'NH890', powerKw: 750, priceWanCny: [120, 180], note: '超大型（含 NH895）' },
  { model: 'NH895', powerKw: 750, priceWanCny: [120, 180], note: '超大型（与 NH890 同档）' },
];

/** NS 系列参考价（万元/台）。来源 S4 §2.2 */
export const PRICE_NS = [
  { model: 'NS200', powerKw: 90, priceWanCny: [22, 30] },
  { model: 'NS300', powerKw: 160, priceWanCny: [35, 48] },
  { model: 'NS400', powerKw: 250, priceWanCny: [50, 68] },
  { model: 'NS600', powerKw: 315, priceWanCny: [68, 95] },
];

/** 液压站配置分档报价（万元）。来源 S4 §3 */
export const PRICE_HYDRAULIC_STATION = [
  { tier: '基础配置（国产阀件）', priceWanCny: [8, 15] },
  { tier: '标准配置（合资阀件）', priceWanCny: [15, 28] },
  { tier: '高端配置（全进口）', priceWanCny: [28, 50] },
];

/** 常用备件参考价。来源 S4 §4 */
export const PRICE_SPARE_PARTS = [
  { name: '轧臼壁（全套）', priceRange: '1.5-5 万元/套', note: '视机型' },
  { name: '破碎壁（全套）', priceRange: '1.5-5 万元/套', note: '视机型' },
  { name: '液压缸密封套件', priceRange: '0.3-1.2 万元/套', note: '机型不同差异大' },
  { name: '偏心铜套', priceRange: '0.8-3 万元/个', note: '进口材质价格更高' },
  { name: '液压油（200L 桶）', priceRange: '0.3-0.6 万元/桶', note: '品牌差异' },
  { name: '过滤器滤芯', priceRange: '0.05-0.3 万元/个', note: '国产/进口' },
  { name: 'AORS 控制模块', priceRange: '2-8 万元/套', note: '功能配置不同' },
];

/** 融资租赁方案要点。来源 S4 §5 */
export const FINANCING = {
  downPaymentRatio: [0.2, 0.3],
  termYears: [2, 5],
  note: '美矿自营融资租赁；年利率以商务洽谈为准；租赁期满所有权转移客户；需信用审核',
  source: 'S4',
};

/** 竞品品牌。来源 S3 §1 */
export const COMPETITOR_BRANDS = [
  { brand: '美卓 Metso', fullName: 'Metso Corporation', origin: '芬兰', position: '全球一线，高端矿山', series: 'HP（Nordberg HP）/ GP', source: 'S3' },
  { brand: '山特维克 Sandvik', fullName: 'Sandvik AB', origin: '瑞典', position: '全球一线，高端矿山', series: 'CH / CS / CG', source: 'S3' },
  { brand: '特雷克斯 Terex', fullName: 'Terex Corporation', origin: '美国', position: '全球二线，中高端', series: 'T-series / TC', source: 'S3' },
  { brand: '克虏伯 Krupp', fullName: 'thyssenkrupp', origin: '德国', position: '高端（部分业务已被美卓收购）', series: '-', source: 'S3' },
];

/** 选型维度竞品对比矩阵。来源 S3 §4 */
export const COMPETITOR_MATRIX = {
  dimensions: ['技术路线', '功率范围 (kW)', '自动化水平', '衬板耐磨性', '价格定位', '交货周期', '备件价格', '适用客户'],
  columns: [
    {
      brand: '美矿 NH/NS',
      values: ['单缸液压', '90-750', 'AORS 中等', '中等-优', '中端', '短（国产）', '低', '国内矿山/骨料'],
    },
    { brand: '美卓 HP', values: ['多缸液压', '90-750', 'IC 优秀', '优', '高端', '长（进口）', '高', '大型矿山/全球项目'] },
    { brand: '山特维克 CS', values: ['单缸/多缸', '110-600', 'ASRi 优秀', '优', '高端', '长（进口）', '高', '大型矿山'] },
    { brand: '特雷克斯', values: ['多缸', '90-450', '中等', '中等', '中高端', '中等', '中等', '中型矿山'] },
  ],
  source: 'S3',
};

/** 美矿竞争优势。来源 S3 §3.1 */
export const MACKORN_ADVANTAGES = [
  { item: '本土化服务', detail: '国内工厂（江苏太仓），响应速度快' },
  { item: '性价比', detail: '同等规格价格低于进口品牌 30%-50%' },
  { item: '定制能力', detail: '可根据客户工况定制腔型和衬板配置' },
  { item: '远程监控', detail: 'AORS 系统支持数百台设备同时监控' },
  { item: '融资租赁', detail: '美矿自营融资租赁业务，解决客户资金压力' },
  { item: '备件供应', detail: '国产备件供应周期短，价格优' },
];

/** 美矿劣势与挑战。来源 S3 §3.2 */
export const MACKORN_GAPS = [
  { item: '品牌知名度', detail: '在国际矿山巨头客户中认知度有限' },
  { item: '大型矿山认证', detail: '大型矿山（央企/国企）采购中品牌认可度待提升' },
  { item: '衬板寿命', detail: '部分工况下衬板耐磨性较进口品牌有差距' },
  { item: '全球服务网络', detail: '海外市场服务网络尚在建设中' },
];

/** 客户痛点 → 应对方案。来源 S3 §5.3 */
export const PAIN_POINT_PLAYBOOK = [
  { pain: '进口品牌价格太高', answer: '同等性能，价格低 30%-50%' },
  { pain: '备件太贵，周期太长', answer: '国产备件，常规件 3-7 天供货' },
  { pain: '设备不稳定，怕出故障', answer: 'AORS 远程监控，提前预警' },
  { pain: '资金不足，一次性付款压力大', answer: '美矿融资租赁业务，分期付款' },
  { pain: '担心售后服务跟不上', answer: '太仓工厂，华东 24 小时响应' },
];

/** 报价影响因素清单。来源 S4 §1 */
export const PRICE_FACTORS = [
  '机型规格', '腔型配置（EF/EFX 等特殊腔型价格略高）', '电压等级（6600V 高压 vs 380V 低压）',
  '控制要求（AORS 配置等级）', '液压站配置（进口阀件 vs 国产阀件）', '交货条件（EXW/FOB/CIF/DDP）', '数量规模（批量折扣）',
];

export function findPrice(model) {
  const key = String(model || '').trim().toUpperCase();
  return PRICE_NH.find((p) => p.model.toUpperCase() === key) || PRICE_NS.find((p) => p.model.toUpperCase() === key) || null;
}
