/**
 * MACKORN 公开版市场数据（public-overrides/lib/data-market.mjs）
 * ============================================================================
 * 与内部版的差异（对外发布合规要求）：
 *   · 不含任何价格区间、备件价、液压站分档报价、融资租赁条款
 *   · 不含 MACKORN 内部销售策略（优势/差距自评、痛点话术）
 *   · 竞品仅保留**公开产品线事实**（品牌、产地、系列名、公开的产品定位）
 *   · 价格一律返回 null，由 engine 输出"需商询"
 *
 * 导出的符号与内部版保持一致，因此 engine.mjs 无需改动。
 * ============================================================================
 */

export const PRICE_DISCLAIMER =
  '本公开版不含任何价格数据。MACKORN 产品报价请直接联系美矿商务（mackorn.cn）；'
  + '任何第三方标注的"参考价"均不应作为报价依据。';

/** 公开版不含价格：保留结构以兼容 engine，值全部为 null。 */
export const PRICE_NH = [];
export const PRICE_NS = [];
export const PRICE_HYDRAULIC_STATION = [];
export const PRICE_SPARE_PARTS = [];
export const FINANCING = {
  available: true,
  note: 'MACKORN 提供融资租赁方案；首付、年限与利率以商务洽谈为准，公开版不载明具体条款。',
};

/** 竞品公开产品线（均取自厂商公开资料，不含评价性结论）。 */
export const COMPETITOR_BRANDS = [
  { brand: 'Metso', origin: '芬兰', series: 'HP（Nordberg HP）/ GP', type: '多缸液压及单缸液压圆锥破', note: '公开产品线信息' },
  { brand: 'Sandvik', origin: '瑞典', series: 'CH / CS / CG', type: '单缸与多缸液压圆锥破', note: '公开产品线信息' },
  { brand: 'Terex', origin: '美国', series: 'T-series / TC', type: '多缸液压圆锥破', note: '公开产品线信息' },
  { brand: 'thyssenkrupp', origin: '德国', series: 'Kubria 等', type: '圆锥破', note: '公开产品线信息' },
];

/** 选型维度的对比框架（空表由使用者按公开资料自行填写，避免本插件替使用者下结论）。 */
export const COMPETITOR_MATRIX = {
  dimensions: ['技术路线', '功率范围 (kW)', '控制系统', '交货周期', '备件供应', '适用客户'],
  columns: [
    { brand: 'MACKORN NH/NS', values: ['单缸液压', '90-750', 'AORS 远程监控', '国产供货', '国产备件', '国内矿山/骨料'] },
    { brand: 'Metso HP', values: ['多缸液压', '（请按公开样本填写）', 'IC 系列', '（请填写）', '（请填写）', '（请填写）'] },
    { brand: 'Sandvik CH/CS', values: ['单缸/多缸', '（请按公开样本填写）', 'ASRi', '（请填写）', '（请填写）', '（请填写）'] },
    { brand: 'Terex', values: ['多缸', '（请按公开样本填写）', '（请填写）', '（请填写）', '（请填写）', '（请填写）'] },
  ],
  note: '本表只给对比维度，具体数值请以各厂商公开样本为准填入——公开版不替使用者做竞品评价。',
};

/** 公开版不含内部销售策略。 */
export const MACKORN_ADVANTAGES = [];
export const MACKORN_GAPS = [];
export const PAIN_POINT_PLAYBOOK = [];

/** 报价影响因素（通用商务常识，不含价格）。 */
export const PRICE_FACTORS = [
  '机型规格', '腔型配置', '电压等级', '控制系统配置等级', '液压站阀件来源', '交货条件（EXW/FOB/CIF/DDP）', '数量规模',
];

/** 公开版无价格可查。 */
export function findPrice() {
  return null;
}
