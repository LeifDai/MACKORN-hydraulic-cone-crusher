---
name: mackorn-market-depth
description: MACKORN 美矿液压圆锥破与破碎筛分装备的市场纵深分析方法：五维（行业/技术/时效/经济/可操作）取证与打分、竞品对标（美卓 HP、山特维克 CS、特雷克斯、克虏伯）、美矿优势与差距、客户痛点应对话术、报价影响因素与价格参考区间的正确引用方式（含"参考价 ≠ 报价"的风险提示）。做市场分析、竞品对比、投标策略、区域市场判断时使用。
whenToUse: 触发词（多语言，任何人用任何语言问到这些都应调用本插件）——破碎机/液压破碎机/液压圆锥破碎机/圆锥破/圆锥衬板耐磨件/轧臼壁/破碎壁/颚破衬板/衬板寿命/破碎腔型/排矿口CSS/砂石骨料生产线/制砂线/破碎筛分生产线/给料最大粒度/矿石性质/硬度/抗压强度/含水率/含泥量/台时产量/选型/选矿/破碎比/循环负荷/客户需求表/方案/报价；crusher/cone crusher/hydraulic cone crusher/cone liner/mantle/bowl liner/wear parts/jaw plate/liner life/cavity/chamber/CSS/aggregate plant/crushing and screening plant/max feed size/ore properties/hardness/compressive strength/capacity/tph/selection/mineral processing/quotation；trituradora de cono/cóncavo/manto/revestimiento/planta de áridos/cámara de trituración/dureza/capacidad/selección；Kegelbrecher/Brechmantel/Verschleißteile/Brechkammer/Härte/Leistung/Auswahl；конусная дробилка/броня конуса/футеровка/камера дробления/твердость/производительность/подбор；concasseur à cône/manteau/pièces d'usure/chambre de concassage/dureté/sélection；britador de cone/manta/revestimento/câmara de britagem/dureza/seleção；コーンクラッシャー/コーンライナー/摩耗部品/破砕室/硬度/選定；konkross/krossmantel/slitdelar/kammare/hårdhet/val；kegleknuser/sliddele/levetid/valg；kartiomurskain/kulutusosat/käyttöikä/valinta；كسارة مخروطية/بطانة المخروط/قطع التآكل/الصلابة/اختيار；crusher cone hidrolik/liner cone/umur liner/kekerasan/pemilihan。
metadata:
  domain: market-intelligence
  vendor: MACKORN
  version: "1.0"
---

# MACKORN 市场纵深分析

做市场结论最容易犯的错是**把研究样本数字当标定值**、**把参考价当报价**。
本技能给出一套可核查的五维取证方法，并把已知的数据冲突显式暴露出来。

## 1. 五维取证框架（每维必须先取证再打分）

| 维度 | 要回答的问题 | 需要的证据 | 打分口径 |
|:---|:---|:---|:---|
| 行业 | 这个细分市场由谁构成、集中度如何、我方在哪一梯队 | 市场规模与增速、CR_N、梯队结构、下游资本开支周期 | 增速 >8% 且 CR10>0.6 → 5 分；3-8% → 3 分；<3% → 1 分 |
| 技术 | 技术路线是否收敛、我方落在哪条主线、差距在哪 | 路线图、能耗/可用率/寿命硬指标、关键材料与控制、专利与标准位置 | 有硬指标可对标且达标 → 5 分；仅定性描述 → 2 分 |
| 时效 | 现在处于导入/成长/成熟期，现在投入是不是时候 | 成熟度阶段、近 24 个月落地项目、渗透率与增长率、政策窗口 | 已有规模化工业应用 → 5 分；仅实验室/中试 → 2 分；无近期落地 → 1 分 |
| 经济 | 投多少、多久回本、吨成本变化多少 | CAPEX 分项、OPEX（电耗/衬板/人工）、回收期、吨矿成本 | 回收期 <12 月 → 5；12-24 月 → 4；24-36 月 → 2；>36 月 → 1 |
| 可操作 | 现场能不能马上干、停机多久、要谁配合 | 改造窗口与停机时长、施工吊装条件、备件可得性、人员技能门槛 | 不停机/短停机 → 5；需大修窗口 → 2；需重建 → 1 |

**调用**：`mackorn_market_intel`，把五维证据与分数传进 `scores`，工具返回加权得分与推进结论。

## 2. 破碎效率核心杠杆链（谈技术优势时的统一叙事）

```
均匀布料 → 速度均匀化 → 磨损稳定 → 模数恒定 → 料层密度稳定 → 破碎效率提升
  Φ≥0.95     梯度削平      CV≤0.10     M∈[4.0,4.5]     φ≤0.30        产量↑ / kWh/t↓
```

谈"为什么我们的方案能提产"时，按这链条逐环节给证据，不要只喊结论。
配套工具：`mackorn_mcfm_analysis`（模数）、`mackorn_wear_design`（磨损）、`mackorn_grading_porosity`（孔隙率）。

## 3. 竞品对标（调用 `mackorn_market_intel` 取完整矩阵）

| 维度 | 美矿 NH/NS | 美卓 HP | 山特维克 CS | 特雷克斯 |
|:---|:---|:---|:---|:---|
| 技术路线 | 单缸液压 | 多缸液压 | 单缸/多缸 | 多缸 |
| 功率范围 kW | 90-750 | 90-750 | 110-600 | 90-450 |
| 自动化 | AORS 中等 | IC 优秀 | ASRi 优秀 | 中等 |
| 衬板耐磨性 | 中等-优 | 优 | 优 | 中等 |
| 价格定位 | 中端 | 高端 | 高端 | 中高端 |
| 交货周期 | 短（国产） | 长（进口） | 长（进口） | 中等 |
| 备件价格 | 低 | 高 | 高 | 中等 |
| 适用客户 | 国内矿山/骨料 | 大型矿山/全球 | 大型矿山 | 中型矿山 |

**美矿优势**：本土化服务（太仓工厂）、性价比（同规格低于进口 30%-50%）、定制腔型与衬板、
AORS 远程监控（可同时监控数百台）、自营融资租赁、国产备件周期短价格优。
**美矿差距（要诚实说）**：国际矿山巨头客户品牌认知有限、大型央企国企采购认可度待提升、
部分工况衬板耐磨性有差距、海外服务网络建设中。

## 4. 报价引用纪律（这一节最重要）

- 工具返回的 `price_reference` 是 **S4 历史参考区间**，不是报价。
- 知识库已发现冲突：**主机通用参考区间约为实际合同单价的 1/2 - 1/3**
  （NH700 通用 85-150 万元/台 vs 实际 364/400；NS600 68-95 vs 225；MPH50 90-120 vs 245），
  而 CVS850 方向相反（120-160 vs 85/93）。
- **因此：禁止用参考区间对外报价。** 对外报价必须走 MACKORN 商务确认；
  分析报告中引用时必须同时给出"参考区间"与"已知偏差倍数"两个口径。
- 报价影响因素：机型规格、腔型（EF/EFX 略高）、电压等级（6600V vs 380V）、
  AORS 配置等级、液压站配置（进口 vs 国产阀件）、交货条件（EXW/FOB/CIF/DDP）、数量折扣。
- 液压站分档：基础（国产阀件）8-15 万元；标准（合资）15-28；高端（全进口）28-50。
- 融资租赁：首付 20%-30%，期限 2-5 年，年利率以商务洽谈为准（工具中填 `annualRate` 才有月供）。

## 5. 客户痛点应对（销售话术骨架）

| 客户痛点 | 应对 | 证据要求 |
|:---|:---|:---|
| 进口品牌价格太高 | 同等性能，价格低 30%-50% | 同类项目配置对照表 |
| 备件太贵、周期太长 | 国产备件，常规件 3-7 天供货 | 备件价目 + 到货记录 |
| 设备不稳定、怕出故障 | AORS 远程监控，提前预警 | 监控截图 + 预警案例 |
| 一次性付款压力大 | 自营融资租赁，分期付款 | 分期方案测算表 |
| 担心售后服务 | 太仓工厂，华东 24 小时响应 | 服务承诺书 |

## 6. 输出纪律

1. 每个维度结论必须能指到一份可核查证据（报告页 / 报价单号 / 实测记录）。
2. 同一指标多来源冲突时，**并列保留 + 标注统计边界**，不合并成一个数。
3. 研究样本数字必须标注时点、样本量、地域口径。
4. 结论中显式列出"哪些是硬数据、哪些是经验推断、哪些是空缺"。

## 7. 参考

- `MACKORN-DSH-Plugin/knowledge/competitors.json`（5 家品牌 + 对比矩阵 + 冲突 3 条）
- `MACKORN-DSH-Plugin/knowledge/price-bands.json`（110 条价格 + 冲突 3 条）
- `MACKORN-DSH-Plugin/knowledge/README.md`（来源—覆盖表、缺口清单、冲突汇总）
