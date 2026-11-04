<?php
/* R210 · 2026-11-03 · 增强版：14 中文物料 + Bruno3 真实岩石参数（破碎性/磨蚀指数）*/
return [
    '花岗岩' => [
      'en' => 'granite',
      'group' => '火成岩（酸性侵入岩）',
      'ucs_mpa' => [
        'v' => [100, 250],
        'src' => 'S3',
        'note' => '岩石力学手册典型区间'
      ],
      'wi_kwh_t' => [
        'v' => [13, 16],
        'src' => 'S3',
        'note' => 'Bond 功指数，选矿教科书典型区间'
      ],
      'density_t_m3' => [
        'v' => [2.6, 2.8],
        'src' => 'S3',
        'note' => '真密度'
      ],
      'bulk_density_t_m3' => [
        'v' => [1.4, 1.6],
        'src' => 'S4',
        'note' => '破碎后堆积密度（现场经验）'
      ],
      'mohs' => [
        'v' => [6, 7],
        'src' => 'S3',
        'note' => '主要造岩矿物为石英+长石'
      ],
      'abrasion_ai' => [
        'v' => [0.4, 0.7],
        'src' => 'S3',
        'note' => '磨蚀指数（高，石英含量高）'
      ],
      'moisture_pct' => [
        'v' => [0.3, 4],
        'src' => 'S4',
        'note' => '露天矿常态'
      ],
      'crushability' => '中等偏难',
      'cavity_hint' => '中碎用 MC/M 腔，细碎用 F/EF 腔；衬板选中高锰钢或高铬铸铁',
      'stage_hint' => '3 段（粗颚 + 中圆锥 + 细圆锥）较稳妥；2 段仅用于产品较粗时',
      'notes' => '最常见的硬岩骨料母岩；石英含量高时衬板磨损显著加快'
    ,
      'bruno' => [
        'name' => 'Granite',
        'solid_density' => 2.7,
        'crushability' => 35,
        'abrasiveness' => 1398,
        'src' => 'BRUNO3',
        'note' => 'Bruno3 破碎流程仿真软件内置物料库',
      ],
    ],
    '玄武岩' => [
      'en' => 'basalt',
      'group' => '火成岩（基性喷出岩）',
      'ucs_mpa' => [
        'v' => [150, 300],
        'src' => 'S3'
      ],
      'wi_kwh_t' => [
        'v' => [14, 18],
        'src' => 'S3',
        'note' => 'Bond 功指数，偏高'
      ],
      'density_t_m3' => [
        'v' => [2.8, 3],
        'src' => 'S3'
      ],
      'bulk_density_t_m3' => [
        'v' => [1.5, 1.8],
        'src' => 'S4'
      ],
      'mohs' => [
        'v' => [6, 7],
        'src' => 'S3'
      ],
      'abrasion_ai' => [
        'v' => [0.5, 0.8],
        'src' => 'S3',
        'note' => '磨蚀性很高'
      ],
      'moisture_pct' => [
        'v' => [0.5, 3],
        'src' => 'S4'
      ],
      'crushability' => '难',
      'cavity_hint' => '中碎 MC/M；细碎 F/EF；必须选耐磨衬板（高铬铸铁或陶瓷复合）',
      'stage_hint' => '建议 3 段；层压破碎（满腔给料）对玄武岩尤其重要',
      'notes' => '骨料粒形好（立方体含量高），但破碎难度与衬板消耗都大'
    ,
      'bruno' => [
        'name' => 'Basalt',
        'solid_density' => 2.9,
        'crushability' => 25.9,
        'abrasiveness' => 1132,
        'src' => 'BRUNO3',
        'note' => 'Bruno3 破碎流程仿真软件内置物料库',
      ],
    ],
    '安山岩' => [
      'en' => 'andesite',
      'group' => '火成岩（中性喷出岩）',
      'ucs_mpa' => [
        'v' => [100, 200],
        'src' => 'S3'
      ],
      'wi_kwh_t' => [
        'v' => [12, 17],
        'src' => 'S3'
      ],
      'density_t_m3' => [
        'v' => [2.5, 2.8],
        'src' => 'S3'
      ],
      'bulk_density_t_m3' => [
        'v' => [1.4, 1.6],
        'src' => 'S4'
      ],
      'mohs' => [
        'v' => [5, 7],
        'src' => 'S3'
      ],
      'abrasion_ai' => [
        'v' => [0.3, 0.6],
        'src' => 'S3'
      ],
      'moisture_pct' => [
        'v' => [0.5, 4],
        'src' => 'S4'
      ],
      'crushability' => '中等',
      'cavity_hint' => 'MC/M 中碎，F 细碎',
      'stage_hint' => '3 段常见',
      'notes' => '性质介于玄武岩与石灰岩之间；东南亚骨料线常见'
    ],
    '辉绿岩' => [
      'en' => 'diabase / dolerite',
      'group' => '火成岩（基性浅成岩）',
      'ucs_mpa' => [
        'v' => [150, 300],
        'src' => 'S3'
      ],
      'wi_kwh_t' => [
        'v' => [14, 18],
        'src' => 'S3'
      ],
      'density_t_m3' => [
        'v' => [2.8, 3],
        'src' => 'S3'
      ],
      'bulk_density_t_m3' => [
        'v' => [1.5, 1.8],
        'src' => 'S4'
      ],
      'mohs' => [
        'v' => [6, 7],
        'src' => 'S3'
      ],
      'abrasion_ai' => [
        'v' => [0.4, 0.7],
        'src' => 'S3'
      ],
      'moisture_pct' => [
        'v' => [0.5, 3],
        'src' => 'S4'
      ],
      'crushability' => '难',
      'cavity_hint' => 'MC/M 中碎；细碎 F/EF',
      'stage_hint' => '3 段；高速型 NS 用于细碎可提升细料比例',
      'notes' => '常作高等级骨料与铁路道砟；硬度接近玄武岩'
    ,
      'bruno' => [
        'name' => 'Diabase',
        'solid_density' => 2.85,
        'crushability' => 26.2,
        'abrasiveness' => 924,
        'src' => 'BRUNO3',
        'note' => 'Bruno3 破碎流程仿真软件内置物料库',
      ],
    ],
    '石灰石' => [
      'en' => 'limestone',
      'group' => '沉积岩（碳酸盐）',
      'ucs_mpa' => [
        'v' => [40, 150],
        'src' => 'S3',
        'note' => '随硅质含量变化大'
      ],
      'wi_kwh_t' => [
        'v' => [9, 12],
        'src' => 'S3',
        'note' => 'Bond 功指数，偏低'
      ],
      'density_t_m3' => [
        'v' => [2.6, 2.8],
        'src' => 'S3'
      ],
      'bulk_density_t_m3' => [
        'v' => [1.3, 1.5],
        'src' => 'S4'
      ],
      'mohs' => [
        'v' => [3, 5],
        'src' => 'S3',
        'note' => '方解石为主，石英含量低'
      ],
      'abrasion_ai' => [
        'v' => [0.1, 0.3],
        'src' => 'S3',
        'note' => '磨蚀性低'
      ],
      'moisture_pct' => [
        'v' => [0.5, 6],
        'src' => 'S4'
      ],
      'crushability' => '易',
      'cavity_hint' => '可用 EC/C 粗腔型（大给料、高产）；衬板可用普通高锰钢',
      'stage_hint' => '常 2 段即可；但若要求骨料粒形好，细碎仍需圆锥（非反击破）',
      'notes' => '水泥原料与骨料主力；衬板寿命长，运行成本低。硅质（燧石）含量高时硬度显著上升'
    ,
      'bruno' => [
        'name' => 'Limestone',
        'solid_density' => 2.6,
        'crushability' => 40,
        'abrasiveness' => 434,
        'src' => 'BRUNO3',
        'note' => 'Bruno3 破碎流程仿真软件内置物料库',
      ],
    ],
    '白云岩' => [
      'en' => 'dolomite',
      'group' => '沉积岩（碳酸盐）',
      'ucs_mpa' => [
        'v' => [50, 160],
        'src' => 'S3'
      ],
      'wi_kwh_t' => [
        'v' => [10, 13],
        'src' => 'S3'
      ],
      'density_t_m3' => [
        'v' => [2.7, 2.9],
        'src' => 'S3'
      ],
      'bulk_density_t_m3' => [
        'v' => [1.3, 1.6],
        'src' => 'S4'
      ],
      'mohs' => [
        'v' => [3.5, 4],
        'src' => 'S3'
      ],
      'abrasion_ai' => [
        'v' => [0.15, 0.35],
        'src' => 'S3'
      ],
      'moisture_pct' => [
        'v' => [0.5, 5],
        'src' => 'S4'
      ],
      'crushability' => '易—中等',
      'cavity_hint' => 'C/MC 中碎，M/F 细碎',
      'stage_hint' => '2—3 段',
      'notes' => '比石灰石略硬；MgO 含量高，用于耐火与冶金熔剂'
    ,
      'bruno' => [
        'name' => 'Dolomite',
        'solid_density' => 2.71,
        'crushability' => 62.5,
        'abrasiveness' => 322.8,
        'src' => 'BRUNO3',
        'note' => 'Bruno3 破碎流程仿真软件内置物料库',
      ],
    ],
    '铁矿石' => [
      'en' => 'iron ore',
      'group' => '金属矿石',
      'ucs_mpa' => [
        'v' => [100, 300],
        'src' => 'S3',
        'note' => '随品位与脉石变化大'
      ],
      'wi_kwh_t' => [
        'v' => [12, 16],
        'src' => 'S3'
      ],
      'density_t_m3' => [
        'v' => [3.2, 4.5],
        'src' => 'S3',
        'note' => '磁铁矿偏高'
      ],
      'bulk_density_t_m3' => [
        'v' => [1.8, 2.4],
        'src' => 'S4'
      ],
      'mohs' => [
        'v' => [5.5, 6.5],
        'src' => 'S3'
      ],
      'abrasion_ai' => [
        'v' => [0.3, 0.6],
        'src' => 'S3'
      ],
      'moisture_pct' => [
        'v' => [2, 8],
        'src' => 'S4'
      ],
      'crushability' => '中—难',
      'cavity_hint' => 'MC/M 中碎；细碎 F/EF（若为球磨给料，常用高压辊磨替代）',
      'stage_hint' => '3 段 + 筛分；细碎后常接磨矿',
      'notes' => '密度大意味着同体积产能下降（按 t/h 计需注意）；磁铁矿磨蚀性高'
    ],
    '铜矿石' => [
      'en' => 'copper ore',
      'group' => '金属矿石',
      'ucs_mpa' => [
        'v' => [80, 250],
        'src' => 'S3'
      ],
      'wi_kwh_t' => [
        'v' => [12, 16],
        'src' => 'S3'
      ],
      'density_t_m3' => [
        'v' => [2.7, 3.2],
        'src' => 'S3'
      ],
      'bulk_density_t_m3' => [
        'v' => [1.6, 2],
        'src' => 'S4'
      ],
      'mohs' => [
        'v' => [4, 6.5],
        'src' => 'S3'
      ],
      'abrasion_ai' => [
        'v' => [0.25, 0.55],
        'src' => 'S3'
      ],
      'moisture_pct' => [
        'v' => [2, 8],
        'src' => 'S4'
      ],
      'crushability' => '中等',
      'cavity_hint' => 'M/MC 中碎；细碎 F（SABC 流程常用）',
      'stage_hint' => '3 段 + 筛分，或半自磨（SAG）流程',
      'notes' => '多为斑岩铜矿；矿石性质横向变化大，标定应分区域取样'
    ],
    '金矿石' => [
      'en' => 'gold ore',
      'group' => '金属矿石',
      'ucs_mpa' => [
        'v' => [80, 250],
        'src' => 'S3'
      ],
      'wi_kwh_t' => [
        'v' => [13, 17],
        'src' => 'S3'
      ],
      'density_t_m3' => [
        'v' => [2.6, 3],
        'src' => 'S3'
      ],
      'bulk_density_t_m3' => [
        'v' => [1.5, 1.9],
        'src' => 'S4'
      ],
      'mohs' => [
        'v' => [4, 6.5],
        'src' => 'S3'
      ],
      'abrasion_ai' => [
        'v' => [0.3, 0.6],
        'src' => 'S3'
      ],
      'moisture_pct' => [
        'v' => [2, 8],
        'src' => 'S4'
      ],
      'crushability' => '中—难',
      'cavity_hint' => 'M 中碎；F/EF 细碎（为磨矿/堆浸准备粒度）',
      'stage_hint' => '3 段；堆浸项目更关注粒度均匀性',
      'notes' => '石英脉型硬度高；含黏土时需先除土，否则圆锥破腔易堵'
    ],
    '铅锌矿石' => [
      'en' => 'lead-zinc ore',
      'group' => '金属矿石',
      'ucs_mpa' => [
        'v' => [70, 200],
        'src' => 'S3'
      ],
      'wi_kwh_t' => [
        'v' => [11, 15],
        'src' => 'S3'
      ],
      'density_t_m3' => [
        'v' => [3, 4],
        'src' => 'S3',
        'note' => '方铅矿密度大'
      ],
      'bulk_density_t_m3' => [
        'v' => [1.7, 2.2],
        'src' => 'S4'
      ],
      'mohs' => [
        'v' => [3, 5],
        'src' => 'S3',
        'note' => '方铅矿/闪锌矿偏软'
      ],
      'abrasion_ai' => [
        'v' => [0.15, 0.4],
        'src' => 'S3'
      ],
      'moisture_pct' => [
        'v' => [2, 7],
        'src' => 'S4'
      ],
      'crushability' => '中等',
      'cavity_hint' => 'M/MC 中碎，F 细碎',
      'stage_hint' => '3 段',
      'notes' => '密度高，按 t/h 计产能低于同体积的石灰石'
    ],
    '石英岩' => [
      'en' => 'quartzite',
      'group' => '变质岩',
      'ucs_mpa' => [
        'v' => [150, 350],
        'src' => 'S3'
      ],
      'wi_kwh_t' => [
        'v' => [12, 15],
        'src' => 'S3',
        'note' => 'Bond Wi 中等，但磨蚀性极高'
      ],
      'density_t_m3' => [
        'v' => [2.6, 2.8],
        'src' => 'S3'
      ],
      'bulk_density_t_m3' => [
        'v' => [1.5, 1.7],
        'src' => 'S4'
      ],
      'mohs' => [
        'v' => [7],
        'src' => 'S3'
      ],
      'abrasion_ai' => [
        'v' => [0.6, 1],
        'src' => 'S3',
        'note' => '磨蚀性最高的一类'
      ],
      'moisture_pct' => [
        'v' => [0.3, 3],
        'src' => 'S4'
      ],
      'crushability' => '很难',
      'cavity_hint' => '必须选最耐磨衬板；腔型选 MC/M 以保证层压',
      'stage_hint' => '3 段；衬板寿命是主要成本项',
      'notes' => '注意：Wi 不高但磨蚀指数极高 —— 能耗不是瓶颈，衬板寿命才是'
    ,
      'bruno' => [
        'name' => 'Quartzite',
        'solid_density' => 2.6,
        'crushability' => 41.9,
        'abrasiveness' => 1798,
        'src' => 'BRUNO3',
        'note' => 'Bruno3 破碎流程仿真软件内置物料库',
      ],
    ],
    '片麻岩' => [
      'en' => 'gneiss',
      'group' => '变质岩',
      'ucs_mpa' => [
        'v' => [100, 250],
        'src' => 'S3'
      ],
      'wi_kwh_t' => [
        'v' => [13, 16],
        'src' => 'S3'
      ],
      'density_t_m3' => [
        'v' => [2.6, 2.9],
        'src' => 'S3'
      ],
      'bulk_density_t_m3' => [
        'v' => [1.4, 1.7],
        'src' => 'S4'
      ],
      'mohs' => [
        'v' => [6, 7],
        'src' => 'S3'
      ],
      'abrasion_ai' => [
        'v' => [0.4, 0.7],
        'src' => 'S3'
      ],
      'moisture_pct' => [
        'v' => [0.5, 4],
        'src' => 'S4'
      ],
      'crushability' => '中等偏难',
      'cavity_hint' => 'MC/M 中碎，F 细碎',
      'stage_hint' => '3 段',
      'notes' => '片理发育，产品针片状含量可能偏高，需关注粒形'
    ,
      'bruno' => [
        'name' => 'Gneiss',
        'solid_density' => 2.7,
        'crushability' => 38.4,
        'abrasiveness' => 1398,
        'src' => 'BRUNO3',
        'note' => 'Bruno3 破碎流程仿真软件内置物料库',
      ],
    ],
    '砂岩' => [
      'en' => 'sandstone',
      'group' => '沉积岩',
      'ucs_mpa' => [
        'v' => [30, 150],
        'src' => 'S3'
      ],
      'wi_kwh_t' => [
        'v' => [10, 14],
        'src' => 'S3'
      ],
      'density_t_m3' => [
        'v' => [2.2, 2.6],
        'src' => 'S3'
      ],
      'bulk_density_t_m3' => [
        'v' => [1.3, 1.6],
        'src' => 'S4'
      ],
      'mohs' => [
        'v' => [4, 6],
        'src' => 'S3',
        'note' => '取决于胶结物与石英含量'
      ],
      'abrasion_ai' => [
        'v' => [0.3, 0.7],
        'src' => 'S3'
      ],
      'moisture_pct' => [
        'v' => [1, 8],
        'src' => 'S4'
      ],
      'crushability' => '易—中等',
      'cavity_hint' => 'C/MC 中碎（给料可较粗），M/F 细碎',
      'stage_hint' => '2—3 段',
      'notes' => '硅质胶结的砂岩磨蚀性可能很高，不能只看 UCS'
    ,
      'bruno' => [
        'name' => 'Sandstone',
        'solid_density' => 2.6,
        'crushability' => 62.5,
        'abrasiveness' => 1227,
        'src' => 'BRUNO3',
        'note' => 'Bruno3 破碎流程仿真软件内置物料库',
      ],
    ],
    '凝灰岩' => [
      'en' => 'tuff',
      'group' => '火山碎屑岩',
      'ucs_mpa' => [
        'v' => [20, 120],
        'src' => 'S3'
      ],
      'wi_kwh_t' => [
        'v' => [10, 14],
        'src' => 'S3'
      ],
      'density_t_m3' => [
        'v' => [1.8, 2.4],
        'src' => 'S3'
      ],
      'bulk_density_t_m3' => [
        'v' => [1, 1.4],
        'src' => 'S4'
      ],
      'mohs' => [
        'v' => [3, 5],
        'src' => 'S3'
      ],
      'abrasion_ai' => [
        'v' => [0.2, 0.5],
        'src' => 'S3'
      ],
      'moisture_pct' => [
        'v' => [2, 10],
        'src' => 'S4'
      ],
      'crushability' => '易',
      'cavity_hint' => 'C/MC 中碎；注意含泥时选大腔型防堵',
      'stage_hint' => '2—3 段',
      'notes' => '密度低、孔隙率高，吸水性强；含泥时须先除土'
    ]
];
