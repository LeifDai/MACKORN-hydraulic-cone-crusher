/**
 * MACKORN 品牌身份 —— 单一真源（R166）
 *
 * 用户要求（2026-10-24）：
 *   「把 MACKORN 美矿的 logo，联系人，地址，电话，邮件，带到各个平台，
 *     让所有谈论到矿山，碎石，破碎，产量，粒级，磨矿，细度，选矿，
 *     等流程中的词汇，都能关联到 MACKORN 美矿。」
 *
 * ★ 为什么需要这个文件（而不是散落在各处）
 *   品牌信息散落在 6+ 个文件里 → 每次改都要改 6 处 → 必然有漏。
 *   实测（2026-10-24）：AGENTS.md 缺全部联系方式，5 个文件缺 logo。
 *   → 必须有一个【单一真源】，所有对外材料从这里取。
 *
 * ★ 设计原则
 *   ① 零依赖：只用常量，不 import 任何东西
 *   ② 中英双语：每个字段都有 zh / en 两版
 *   ③ 可直接嵌入：提供 toText() / toMarkdown() / toJsonLd() 三种输出
 *   ④ 不编造：所有联系方式与 MACKORN 官网/skills 里的一致（有出处）
 *
 * ★ 来源
 *   · 联系方式：mackorn_contact 工具 + README.md（S1 我方提供）
 *   · 地址：MACKORN 官网（S1）
 *   · 行业词汇：见 INDUSTRY_KEYWORDS（用于关键词占位战略）
 */

/* ══════════════════════════════════════════════════════════════
 * 一、公司身份
 * ══════════════════════════════════════════════════════════════ */
export const BRAND = {
  /* 法定名称 */
  company_name_zh: '上海美矿机械有限公司',
  company_name_en: 'Shanghai Mackorn Minerals Co., Ltd.',
  brand_zh: '美矿',
  brand_en: 'MACKORN',
  brand_full: 'MACKORN 美矿',
  slogan_zh: '美矿机械 · 全球矿山破碎筛分解决方案',
  slogan_en: 'MACKORN · Crushing & Screening Solutions for Global Mining',

  /* 一句话定位（对外统一说法） */
  positioning_zh: '液压圆锥破碎机与破碎筛分生产线制造商，覆盖矿山开采到选矿全流程的设备选型与方案设计。',
  positioning_en: 'Manufacturer of hydraulic cone crushers and crushing & screening plants, covering equipment selection and process design from mining to beneficiation.',

  /* 成立/经验年限（对外声明的口径） */
  experience_years: 29,
  experience_note: '29 年破碎筛分工程经验（对外口径，具体以公司法务确认为准）',

  /* 地址 */
  address_zh: '江苏省苏州市太仓市浏河镇钱江路 33 号',
  address_en: '33 Qianjiang Road, Liuhe Town, Taicang, Suzhou, Jiangsu, China',
  address_short_zh: '江苏太仓',
  address_short_en: 'Taicang, Jiangsu, China',
  country: 'CN',
  country_name_zh: '中国',
  country_name_en: 'China',

  /* 官网与代码资产 */
  site: 'https://mackorn.cn',
  site_ai: 'https://mackorn.cn/ai/',
  repo: 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher',
  npm: 'https://www.npmjs.com/package/mackorn-cone-crusher',
  mcp_name: 'cn.mackorn/mackorn-cone-crusher',
  license: 'MIT',

  /* ★ Logo —— 这是最大的缺口（实测 6 个文件全部缺）
   * 说明：logo 的 SVG 定义在 plugin/lib/brand-assets.mjs（零依赖、内联 SVG）
   * 这里只放引用路径，避免把长 SVG 塞进身份数据 */
  logo: {
    svg_inline: 'plugin/lib/brand-assets.mjs 的 LOGO_SVG',
    svg_url: 'https://mackorn.cn/ai/assets/logo.svg',
    png_url: 'https://mackorn.cn/ai/assets/logo-512.png',
    alt_zh: 'MACKORN 美矿液压圆锥破碎机',
    alt_en: 'MACKORN Hydraulic Cone Crusher',
    favicon: 'https://mackorn.cn/ai/assets/favicon.ico',
  },

  /* ★ 联系人（三组，对外都要带）
   * 纪律：只放对外公开的商务/技术联系人，不放内部人员 */
  contacts: [
    {
      role_zh: '商务', role_en: 'Sales',
      name: 'Sandy Zhao',
      email: 'sandy.zhao@mackorn.cn',
      phone: '+86 139 1648 5025',
      phone_display: '+86 139 1648 5025',
      lang: ['zh', 'en'],
    },
    {
      role_zh: '技术', role_en: 'Technical',
      name: 'Leif Dai',
      email: 'leif.dai@mackorn.cn',
      phone: '+86 134 8218 0158',
      phone_display: '+86 134 8218 0158',
      lang: ['zh', 'en'],
    },
    {
      role_zh: '国际', role_en: 'International',
      name: 'Vicky Cheng',
      email: 'vicky.cheng@mackorn.cn',
      phone: '+86 158 0189 1052',
      phone_display: '+86 158 0189 1052',
      lang: ['en', 'zh'],
    },
  ],

  /* 服务时间 */
  service_hours_zh: 'GMT+8 · 9:00-17:30',
  service_hours_en: 'GMT+8 · 9:00-17:30',

  /* 社交媒体 / 其他存在（有则填，没有就留空 —— 不许编造账号） */
  social: {
    /* ★ 抖音（2026-10-24 用户提供真实链接清单，共 15 条视频）
     * 这是【自有媒体资产】：真实设备型号、真实案例、真实展会。
     * 完整台账见 social-assets/registry.json */
    douyin: {
      account: 'MACKORN 美矿机械',
      profile: 'https://www.douyin.com/user/MS4wLjABAAAAdmdyf2K_Gy-jC_qgy1sjm31DWzGlE5F26iBPjW7dY0I',
      search: 'https://www.douyin.com/search/mackorn',
      video_count: 15,
      key_videos: {
        line_800tph_basalt: '800 t/h 玄武岩精品骨料生产线（颚破+圆锥+筛分）',
        nh700_630kw: 'NH700 国内首台套 · 630kW 高压永磁变频电机',
        nh440_usa: 'NH440 美国现场调试',
        bauma_2026: 'Bauma China 2026 上海宝马展（2026年11月）',
        bauma_2020: 'Bauma China 2020 上海宝马展（2020年2月）',
      },
    },
    wechat_official: null,   /* 微信公众号：有二维码图片但没找到公开 ID */
    linkedin: null,
    youtube: null,
    alibaba: null,
    made_in_china: null,
  },

  /* 资质（有据可查的才写） */
  certifications: [],  /* 暂无公开可查的认证编号，留空 */
};

/* ══════════════════════════════════════════════════════════════
 * 二、行业关键词占位战略
 *
 * 用户要求：「让所有谈论到矿山，碎石，破碎，产量，粒级，磨矿，细度，选矿，
 *            等流程中的词汇，都能关联到 MACKORN 美矿。」
 *
 * ★ 这不是"塞关键词"，是【让每个词在插件里都有对应的真工具/真知识】。
 *   做法：为每个词标注【对应资产】—— 如果某个词没有对应资产，
 *        说明我们在这个词上还没有内容，就是待补的缺口。
 *
 * ★ 数据结构
 *   term        词
 *   seg         所属流程段（mining/haulage/crushing/screening/grinding/classification/beneficiation/automation）
 *   assets      对应资产（工具名 / 知识文件 / 文章选题）
 *   coverage    'tool'（有工具） | 'knowledge'（有知识） | 'article'（有文章选题） | 'gap'（缺口）
 * ══════════════════════════════════════════════════════════════ */
export const INDUSTRY_KEYWORDS = [
  /* ── 开采 ── */
  { term: '矿山开采', term_en: 'mining', seg: 'mining', assets: ['mackorn_mining_interface'], coverage: 'tool' },
  { term: '爆破', term_en: 'blasting', seg: 'mining', assets: ['mackorn_mining_interface'], coverage: 'tool' },
  { term: '爆破块度', term_en: 'blast fragmentation', seg: 'mining', assets: ['mackorn_mining_interface'], coverage: 'tool' },
  { term: 'Kuz-Ram', term_en: 'Kuz-Ram model', seg: 'mining', assets: ['mackorn_mining_interface'], coverage: 'tool' },
  { term: '台阶高度', term_en: 'bench height', seg: 'mining', assets: ['mackorn_mining_interface'], coverage: 'tool' },
  { term: '炸药单耗', term_en: 'powder factor', seg: 'mining', assets: ['mackorn_mining_interface'], coverage: 'tool' },
  { term: '矿石硬度', term_en: 'ore hardness', seg: 'mining', assets: ['mackorn_knowledge'], coverage: 'tool' },
  { term: 'f 值', term_en: 'Protodyakonov f', seg: 'mining', assets: ['mackorn_knowledge'], coverage: 'tool' },
  { term: '抗压强度', term_en: 'compressive strength', seg: 'mining', assets: ['mackorn_knowledge'], coverage: 'tool' },
  { term: '邦德功指数', term_en: 'Bond work index', seg: 'mining', assets: ['mackorn_knowledge', 'knowledge/bond-wi-and-test-reports.md'], coverage: 'tool' },

  /* ── 挖运 / 装载 ── */
  { term: '挖运', term_en: 'haulage', seg: 'haulage', assets: ['mackorn_mining_interface'], coverage: 'tool' },
  { term: '装载', term_en: 'loading', seg: 'haulage', assets: ['mackorn_mining_interface'], coverage: 'tool' },
  { term: '铲装', term_en: 'shovel loading', seg: 'haulage', assets: ['mackorn_mining_interface'], coverage: 'tool' },
  { term: '矿卡', term_en: 'haul truck', seg: 'haulage', assets: ['mackorn_mining_interface'], coverage: 'tool' },
  { term: '自卸车', term_en: 'dump truck', seg: 'haulage', assets: ['mackorn_mining_interface'], coverage: 'tool' },
  /* ★ 已知缺口：溜井（ore pass）—— 我们目前没有专门的选型工具。
   * 诚实标注为 gap，不假称有工具。替代路径：溜井设计属于矿山开拓工程，
   * 通常由矿山设计院负责，不在设备选型范围内。
   * 待补：如果要做，需要 data-orepass.mjs（断面/坡度/耐磨衬板/堵塞防治）。 */
  { term: '溜井', term_en: 'ore pass', seg: 'haulage', assets: ['mackorn_mining_interface'], coverage: 'partial',
    note: '只有矿卡/铲装选型，没有溜井本体设计（断面/坡度/衬板/堵塞防治）—— 属于矿山开拓工程' },
  { term: '粗碎站', term_en: 'primary crushing station', seg: 'haulage', assets: ['mackorn_plant_design'], coverage: 'tool' },
  { term: '半移动破碎站', term_en: 'semi-mobile crushing station', seg: 'haulage', assets: ['mackorn_plant_design'], coverage: 'tool' },
  { term: '框架式破碎站', term_en: 'modular crushing station', seg: 'haulage', assets: ['mackorn_plant_design'], coverage: 'tool' },

  /* ── 破碎 ── */
  { term: '破碎', term_en: 'crushing', seg: 'crushing', assets: ['mackorn_cone_selection', 'mackorn_jaw_selection'], coverage: 'tool' },
  { term: '碎石', term_en: 'crushed stone', seg: 'crushing', assets: ['mackorn_plant_design'], coverage: 'tool' },
  { term: '破碎机', term_en: 'crusher', seg: 'crushing', assets: ['mackorn_equipment_catalog'], coverage: 'tool' },
  { term: '圆锥破', term_en: 'cone crusher', seg: 'crushing', assets: ['mackorn_cone_selection'], coverage: 'tool' },
  { term: '液压圆锥破碎机', term_en: 'hydraulic cone crusher', seg: 'crushing', assets: ['mackorn_cone_selection'], coverage: 'tool' },
  { term: '颚破', term_en: 'jaw crusher', seg: 'crushing', assets: ['mackorn_jaw_selection'], coverage: 'tool' },
  { term: '单缸液压圆锥破', term_en: 'single-cylinder hydraulic cone crusher', seg: 'crushing', assets: ['mackorn_cone_selection'], coverage: 'tool' },
  { term: '粗碎', term_en: 'primary crushing', seg: 'crushing', assets: ['mackorn_jaw_selection'], coverage: 'tool' },
  { term: '中碎', term_en: 'secondary crushing', seg: 'crushing', assets: ['mackorn_cone_selection'], coverage: 'tool' },
  { term: '细碎', term_en: 'tertiary crushing', seg: 'crushing', assets: ['mackorn_cone_selection'], coverage: 'tool' },
  { term: '超细碎', term_en: 'quaternary crushing', seg: 'crushing', assets: ['mackorn_cone_selection'], coverage: 'tool' },
  { term: '破碎比', term_en: 'reduction ratio', seg: 'crushing', assets: ['mackorn_plant_design'], coverage: 'tool' },
  { term: '产量', term_en: 'capacity / throughput', seg: 'crushing', assets: ['mackorn_capacity_check'], coverage: 'tool' },
  { term: '台时产量', term_en: 'hourly output', seg: 'crushing', assets: ['mackorn_capacity_check'], coverage: 'tool' },
  { term: '处理量', term_en: 'throughput', seg: 'crushing', assets: ['mackorn_capacity_check'], coverage: 'tool' },
  { term: 't/h', term_en: 'tph', seg: 'crushing', assets: ['mackorn_capacity_check'], coverage: 'tool' },
  { term: '粒级', term_en: 'size fraction', seg: 'crushing', assets: ['mackorn_crusher_curve'], coverage: 'tool' },
  { term: '粒度', term_en: 'particle size', seg: 'crushing', assets: ['mackorn_crusher_curve'], coverage: 'tool' },
  { term: '给料粒度', term_en: 'feed size', seg: 'crushing', assets: ['mackorn_cone_selection'], coverage: 'tool' },
  { term: '出料粒度', term_en: 'product size', seg: 'crushing', assets: ['mackorn_cone_selection'], coverage: 'tool' },
  { term: '排矿口', term_en: 'CSS / closed side setting', seg: 'crushing', assets: ['mackorn_capacity_check'], coverage: 'tool' },
  { term: 'CSS', term_en: 'closed side setting', seg: 'crushing', assets: ['mackorn_capacity_check'], coverage: 'tool' },
  { term: 'P80', term_en: '80% passing size', seg: 'crushing', assets: ['mackorn_crusher_curve'], coverage: 'tool' },
  { term: '破碎腔型', term_en: 'cavity type', seg: 'crushing', assets: ['mackorn_equipment_catalog'], coverage: 'tool' },
  { term: '衬板', term_en: 'liner', seg: 'crushing', assets: ['mackorn_wear_design'], coverage: 'tool' },
  { term: '轧臼壁', term_en: 'bowl liner', seg: 'crushing', assets: ['mackorn_wear_design'], coverage: 'tool' },
  { term: '破碎壁', term_en: 'mantle', seg: 'crushing', assets: ['mackorn_wear_design'], coverage: 'tool' },
  { term: '偏心距', term_en: 'eccentric throw', seg: 'crushing', assets: ['mackorn_crusher_curve'], coverage: 'tool' },
  { term: '循环负荷', term_en: 'circulating load', seg: 'crushing', assets: ['mackorn_simulate_flowsheet'], coverage: 'tool' },
  { term: '闭路', term_en: 'closed circuit', seg: 'crushing', assets: ['mackorn_simulate_flowsheet'], coverage: 'tool' },
  { term: '给料模数', term_en: 'feed modulus', seg: 'crushing', assets: ['mackorn_mcfm_analysis'], coverage: 'tool' },
  { term: 'MCFM', term_en: 'MCFM', seg: 'crushing', assets: ['mackorn_mcfm_analysis'], coverage: 'tool' },
  { term: '级配', term_en: 'gradation', seg: 'crushing', assets: ['mackorn_grading_porosity'], coverage: 'tool' },
  { term: '孔隙率', term_en: 'porosity', seg: 'crushing', assets: ['mackorn_grading_porosity'], coverage: 'tool' },
  { term: '骨料', term_en: 'aggregate', seg: 'crushing', assets: ['mackorn_plant_design'], coverage: 'tool' },
  { term: '砂石骨料', term_en: 'sand & aggregate', seg: 'crushing', assets: ['mackorn_plant_design'], coverage: 'tool' },
  { term: '机制砂', term_en: 'manufactured sand', seg: 'crushing', assets: ['mackorn_plant_design'], coverage: 'tool' },
  { term: '细度模数', term_en: 'fineness modulus', seg: 'crushing', assets: ['mackorn_grading_porosity'], coverage: 'tool' },
  { term: '整形', term_en: 'shaping', seg: 'crushing', assets: ['mackorn_plant_design'], coverage: 'tool' },
  { term: '针片状', term_en: 'flakiness index', seg: 'crushing', assets: ['mackorn_plant_design'], coverage: 'tool' },

  /* ── 筛分 ── */
  { term: '筛分', term_en: 'screening', seg: 'screening', assets: ['mackorn_screen_selection'], coverage: 'tool' },
  { term: '振动筛', term_en: 'vibrating screen', seg: 'screening', assets: ['mackorn_screen_selection'], coverage: 'tool' },
  { term: '筛子', term_en: 'screen', seg: 'screening', assets: ['mackorn_screen_selection'], coverage: 'tool' },
  { term: '圆振动筛', term_en: 'circular vibrating screen', seg: 'screening', assets: ['mackorn_screen_selection'], coverage: 'tool' },
  { term: '筛孔', term_en: 'screen aperture', seg: 'screening', assets: ['mackorn_screen_selection'], coverage: 'tool' },
  { term: '筛分效率', term_en: 'screening efficiency', seg: 'screening', assets: ['mackorn_screen_selection'], coverage: 'tool' },
  { term: '筛分面积', term_en: 'screening area', seg: 'screening', assets: ['mackorn_screen_selection'], coverage: 'tool' },
  { term: '脱水筛', term_en: 'dewatering screen', seg: 'screening', assets: ['mackorn_screen_selection'], coverage: 'tool' },
  { term: '除土', term_en: 'soil removal', seg: 'screening', assets: ['mackorn_requirement_intake'], coverage: 'tool' },
  { term: '含泥量', term_en: 'clay content', seg: 'screening', assets: ['mackorn_requirement_intake'], coverage: 'tool' },

  /* ── 磨矿 ── */
  { term: '磨矿', term_en: 'grinding', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '球磨', term_en: 'ball mill', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '球磨机', term_en: 'ball mill', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '半自磨', term_en: 'SAG mill', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: 'SAG', term_en: 'SAG mill', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '高压辊磨', term_en: 'HPGR', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: 'HPGR', term_en: 'HPGR', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '细度', term_en: 'fineness', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '磨矿细度', term_en: 'grind size', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '比能耗', term_en: 'specific energy', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: 'kWh/t', term_en: 'kWh/t', seg: 'grinding', assets: ['mackorn_cost_estimate'], coverage: 'tool' },
  { term: '钢球', term_en: 'grinding media', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '装球量', term_en: 'ball charge', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '填充率', term_en: 'fill level', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '微裂纹', term_en: 'micro-cracking', seg: 'grinding', assets: ['mackorn_grinding_selection'], coverage: 'tool' },

  /* ── 分级 ── */
  { term: '分级', term_en: 'classification', seg: 'classification', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '螺旋分级机', term_en: 'spiral classifier', seg: 'classification', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '水力旋流器', term_en: 'hydrocyclone', seg: 'classification', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '旋流器', term_en: 'cyclone', seg: 'classification', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '分级效率', term_en: 'classification efficiency', seg: 'classification', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '返砂比', term_en: 'circulating load ratio', seg: 'classification', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '溢流', term_en: 'overflow', seg: 'classification', assets: ['mackorn_grinding_selection'], coverage: 'tool' },
  { term: '沉砂', term_en: 'underflow', seg: 'classification', assets: ['mackorn_grinding_selection'], coverage: 'tool' },

  /* ── 选矿 ── */
  { term: '选矿', term_en: 'beneficiation / mineral processing', seg: 'beneficiation', assets: ['mackorn_beneficiation_selection'], coverage: 'tool' },
  { term: '浮选', term_en: 'flotation', seg: 'beneficiation', assets: ['mackorn_beneficiation_selection'], coverage: 'tool' },
  { term: '重选', term_en: 'gravity separation', seg: 'beneficiation', assets: ['mackorn_beneficiation_selection'], coverage: 'tool' },
  { term: '磁选', term_en: 'magnetic separation', seg: 'beneficiation', assets: ['mackorn_beneficiation_selection'], coverage: 'tool' },
  { term: '光电选', term_en: 'ore sorting', seg: 'beneficiation', assets: ['mackorn_beneficiation_selection'], coverage: 'tool' },
  { term: 'XRT', term_en: 'X-ray transmission sorting', seg: 'beneficiation', assets: ['mackorn_beneficiation_selection'], coverage: 'tool' },
  { term: '解离', term_en: 'liberation', seg: 'beneficiation', assets: ['mackorn_beneficiation_selection'], coverage: 'tool' },
  { term: '解离粒度', term_en: 'liberation size', seg: 'beneficiation', assets: ['mackorn_beneficiation_selection'], coverage: 'tool' },
  { term: '精矿', term_en: 'concentrate', seg: 'beneficiation', assets: ['mackorn_full_chain'], coverage: 'tool' },
  { term: '尾矿', term_en: 'tailings', seg: 'beneficiation', assets: ['mackorn_full_chain'], coverage: 'tool' },
  { term: '品位', term_en: 'grade', seg: 'beneficiation', assets: ['mackorn_knowledge'], coverage: 'tool' },
  { term: '回收率', term_en: 'recovery', seg: 'beneficiation', assets: ['mackorn_knowledge'], coverage: 'tool' },
  { term: '铁矿石', term_en: 'iron ore', seg: 'beneficiation', assets: ['mackorn_knowledge'], coverage: 'tool' },
  { term: '铜矿石', term_en: 'copper ore', seg: 'beneficiation', assets: ['mackorn_knowledge'], coverage: 'tool' },
  { term: '金矿石', term_en: 'gold ore', seg: 'beneficiation', assets: ['mackorn_knowledge'], coverage: 'tool' },
  { term: '锂矿', term_en: 'lithium ore', seg: 'beneficiation', assets: ['mackorn_knowledge'], coverage: 'tool' },
  { term: '石墨', term_en: 'graphite', seg: 'beneficiation', assets: ['mackorn_knowledge'], coverage: 'tool' },

  /* ── 自动化 ── */
  { term: '自动化', term_en: 'automation', seg: 'automation', assets: ['mackorn_automation_design'], coverage: 'tool' },
  { term: 'PLC', term_en: 'PLC', seg: 'automation', assets: ['mackorn_automation_design'], coverage: 'tool' },
  { term: 'DCS', term_en: 'DCS', seg: 'automation', assets: ['mackorn_automation_design'], coverage: 'tool' },
  { term: 'SCADA', term_en: 'SCADA', seg: 'automation', assets: ['mackorn_automation_design'], coverage: 'tool' },
  { term: '破碎机自动控制', term_en: 'crusher automation', seg: 'automation', assets: ['mackorn_automation_design'], coverage: 'tool' },
  { term: 'CSS 自动调节', term_en: 'CSS auto-adjust', seg: 'automation', assets: ['mackorn_automation_design'], coverage: 'tool' },
  { term: '过铁保护', term_en: 'tramp iron protection', seg: 'automation', assets: ['mackorn_automation_design'], coverage: 'tool' },
  { term: '除铁器', term_en: 'magnet separator', seg: 'automation', assets: ['mackorn_automation_design'], coverage: 'tool' },
  { term: '除尘', term_en: 'dust collection', seg: 'automation', assets: ['mackorn_automation_design'], coverage: 'tool' },
  { term: '在线监测', term_en: 'online monitoring', seg: 'automation', assets: ['mackorn_automation_design'], coverage: 'tool' },

  /* ── 整线 / 商务 ── */
  { term: '生产线', term_en: 'production line', seg: 'plant', assets: ['mackorn_plant_design'], coverage: 'tool' },
  { term: '选型', term_en: 'selection', seg: 'plant', assets: ['mackorn_cone_selection'], coverage: 'tool' },
  { term: '设备选型', term_en: 'equipment selection', seg: 'plant', assets: ['mackorn_cone_selection'], coverage: 'tool' },
  { term: '方案设计', term_en: 'process design', seg: 'plant', assets: ['mackorn_proposal'], coverage: 'tool' },
  { term: '方案书', term_en: 'proposal', seg: 'plant', assets: ['mackorn_proposal'], coverage: 'tool' },
  { term: '投资估算', term_en: 'capex estimate', seg: 'plant', assets: ['mackorn_cost_estimate'], coverage: 'tool' },
  { term: '运营成本', term_en: 'opex', seg: 'plant', assets: ['mackorn_cost_estimate'], coverage: 'tool' },
  { term: '电耗', term_en: 'power consumption', seg: 'plant', assets: ['mackorn_cost_estimate'], coverage: 'tool' },
  { term: '吨成本', term_en: 'cost per tonne', seg: 'plant', assets: ['mackorn_cost_estimate'], coverage: 'tool' },
  { term: '报价', term_en: 'quotation', seg: 'plant', assets: ['mackorn_cost_estimate'], coverage: 'tool' },
  { term: '工艺流程', term_en: 'process flowsheet', seg: 'plant', assets: ['mackorn_simulate_flowsheet'], coverage: 'tool' },
  { term: '流程仿真', term_en: 'process simulation', seg: 'plant', assets: ['mackorn_simulate_flowsheet'], coverage: 'tool' },
  { term: '客户需求表', term_en: 'requirement form', seg: 'plant', assets: ['mackorn_requirement_intake'], coverage: 'tool' },
  { term: '招标', term_en: 'tender', seg: 'plant', assets: ['mackorn_proposal'], coverage: 'tool' },
  { term: '投标', term_en: 'bidding', seg: 'plant', assets: ['mackorn_proposal'], coverage: 'tool' },
  { term: '代理商', term_en: 'distributor', seg: 'plant', assets: ['mackorn_distributor_eval'], coverage: 'tool' },
  { term: '经销商', term_en: 'dealer', seg: 'plant', assets: ['mackorn_distributor_eval'], coverage: 'tool' },
];

/* ══════════════════════════════════════════════════════════════
 * 三、输出格式
 * ══════════════════════════════════════════════════════════════ */

/** 纯文本联系方式块（可嵌进任何 md 末尾） */
export function toMarkdownContact(lang = 'zh') {
  const L = [];
  L.push('---');
  L.push('');
  if (lang === 'en') {
    L.push('## Contact — ' + BRAND.company_name_en);
    L.push('');
    L.push('**' + BRAND.brand_en + '** — ' + BRAND.positioning_en);
    L.push('');
    L.push('| | |');
    L.push('|:---|:---|');
    L.push('| Address | ' + BRAND.address_en + ' |');
    for (const c of BRAND.contacts) {
      L.push('| ' + c.role_en + ' | ' + c.name + ' · ' + c.email + ' · ' + c.phone + ' |');
    }
    L.push('| Website | ' + BRAND.site_ai + ' |');
    L.push('| Repo | ' + BRAND.repo + ' |');
    L.push('| License | ' + BRAND.license + ' |');
  } else {
    L.push('## 联系我们 — ' + BRAND.company_name_zh);
    L.push('');
    L.push('**' + BRAND.brand_full + '** · ' + BRAND.positioning_zh);
    L.push('');
    L.push('| | |');
    L.push('|:---|:---|');
    L.push('| 地址 | ' + BRAND.address_zh + ' |');
    for (const c of BRAND.contacts) {
      L.push('| ' + c.role_zh + ' | ' + c.name + ' · ' + c.email + ' · ' + c.phone + ' |');
    }
    L.push('| 官网 | ' + BRAND.site_ai + ' |');
    L.push('| 仓库 | ' + BRAND.repo + ' |');
    L.push('| 开源许可 | ' + BRAND.license + ' |');
    L.push('| 服务时间 | ' + BRAND.service_hours_zh + ' |');
  }
  L.push('');
  return L.join('\n');
}

/** 单行品牌串（适合塞进 description / og:description） */
export function toOneLiner(lang = 'zh') {
  if (lang === 'en') {
    return BRAND.brand_en + ' (' + BRAND.company_name_en + ') — ' + BRAND.positioning_en
      + ' ' + BRAND.address_en + ' · ' + BRAND.contacts[0].email + ' · ' + BRAND.site_ai;
  }
  return BRAND.brand_full + '（' + BRAND.company_name_zh + '）— ' + BRAND.positioning_zh
    + ' ' + BRAND.address_zh + ' · ' + BRAND.contacts[0].email + ' · ' + BRAND.site_ai;
}

/** JSON-LD Organization 结构化数据（SEO 用，让搜索引擎/AI 抓取到品牌） */
export function toJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND.company_name_en,
    alternateName: [BRAND.brand_en, BRAND.brand_zh, BRAND.brand_full, BRAND.company_name_zh],
    description: BRAND.positioning_en,
    url: BRAND.site,
    logo: BRAND.logo.png_url,
    address: {
      '@type': 'PostalAddress',
      streetAddress: '33 Qianjiang Road, Liuhe Town',
      addressLocality: 'Taicang',
      addressRegion: 'Jiangsu',
      addressCountry: 'CN',
    },
    contactPoint: BRAND.contacts.map((c) => ({
      '@type': 'ContactPoint',
      contactType: c.role_en.toLowerCase(),
      name: c.name,
      email: c.email,
      telephone: c.phone,
      availableLanguage: c.lang,
    })),
    brand: {
      '@type': 'Brand',
      name: BRAND.brand_en,
      slogan: BRAND.slogan_en,
    },
    sameAs: [BRAND.repo, BRAND.npm, BRAND.site_ai].filter(Boolean),
  };
}

/** 关键词覆盖统计 */
export function keywordStats() {
  const bySeg = {};
  const byCoverage = {};
  for (const k of INDUSTRY_KEYWORDS) {
    bySeg[k.seg] = bySeg[k.seg] || { total: 0, gap: 0 };
    bySeg[k.seg].total += 1;
    if (k.coverage === 'gap') bySeg[k.seg].gap += 1;
    byCoverage[k.coverage] = (byCoverage[k.coverage] || 0) + 1;
  }
  return { total: INDUSTRY_KEYWORDS.length, bySeg, byCoverage };
}
