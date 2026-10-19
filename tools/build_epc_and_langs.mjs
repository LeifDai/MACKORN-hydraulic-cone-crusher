/**
 * 设计院 / EPC 工程公司专项页 —— 以及补缺语言
 *
 * 为什么单独建"设计院"页：
 *   设计院（engineering / EP C firm）是设备被【写进图纸】的地方。
 *   矿主买什么设备，往往在可行性研究（FS/PFS）阶段就被设计院决定了。
 *   进入设计院的供应商名录（vendor list）= 在项目最早期就被指定。
 *
 *   他们要的不是"便宜"，而是：技术数据、选型依据、合规文件、可复核的计算。
 *   —— 这正是我们插件最擅长的东西。
 *
 * 目标机构（公开可查的矿业设计/EPC 公司）：
 *   加拿大  Hatch · SNC-Lavalin · Stantec · Tetra Tech
 *   澳大利亚 Lycopodium · Ausenco · Sedgman · Worley
 *   南非    DRA Global · Worley
 *   智利/秘鲁 JRI Ingeniería · Ausenco · Bechtel
 *   英国    Wood · SRK Consulting
 *   德国    DMT · IBeWa
 *   中国    中冶 · 中国恩菲（已熟悉）
 *
 * 同时补齐语言缺口：德语 de · 土耳其语 tr · 越南语 vi
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'distribution', '官网落地页');
const BASE = 'https://mackorn.cn';
const REPO = 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher';
const COMPANY = {
  name: 'Shanghai Mackorn Minerals Co., Ltd.', nameCn: '上海美矿机械股份有限公司',
  addr: 'No.33 Qianjiang Road, Liuhe, Taicang, Suzhou, China', addrCn: '江苏省苏州市太仓浏河钱江路 33 号',
  emails: ['sandy.zhao@mackorn.cn · +86 139 1648 5025', 'leif.dai@mackorn.cn · +86 134 8218 0158', 'vicky.cheng@mackorn.cn · +86 158 0189 1052'],
};
const CSS = `:root{--navy:#0A2A4F;--blue:#1B6CB5;--light:#F4F8FC;--line:#D9E5F2;--muted:#5A6B80}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Segoe UI","Microsoft YaHei",Roboto,sans-serif;color:#16202E;line-height:1.8}
.wrap{max-width:980px;margin:0 auto;padding:0 24px}
header{background:linear-gradient(140deg,#08213E,var(--blue));color:#fff;padding:56px 0 46px}
header .crumb{font-size:13px;opacity:.8;margin-bottom:12px}header .crumb a{color:#BFE0FF;text-decoration:none}
header h1{margin:0 0 14px;font-size:clamp(23px,3.3vw,31px);line-height:1.32}header p{margin:0;opacity:.94;max-width:820px;font-size:15.5px}
section{padding:40px 0;border-bottom:1px solid var(--line)}
h2{font-size:20px;color:var(--navy);margin:0 0 16px;border-bottom:2px solid var(--blue);display:inline-block;padding-bottom:8px}
h3{font-size:16px;color:var(--navy);margin:22px 0 8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin:20px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.card h4{margin:0 0 8px;font-size:15px;color:var(--navy)}.card p{margin:0;font-size:14px;color:var(--muted)}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14.5px}
th,td{border:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}
th{background:var(--light);color:var(--navy)}
.box{background:var(--light);border-left:4px solid var(--blue);padding:18px 22px;border-radius:0 10px 10px 0;margin:20px 0}
.box.hi{background:#EAF7EE;border-left-color:#2E9E5B}
.muted{color:var(--muted);font-size:14px}a{color:var(--blue)}
.btn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;margin:6px 10px 6px 0;font-weight:600;font-size:15px}
.btn.ghost{background:#fff;color:var(--blue);border:2px solid var(--blue)}
footer{background:#08213E;color:#B8CEE3;padding:30px 0;font-size:13.5px}
ul,ol{padding-left:22px}
.langbar{background:#08213E;padding:10px 0;font-size:13px}.langbar a{color:#9CC7EE;margin:0 8px;text-decoration:none}`;

/* ============================================================
 * 一、设计院 / EPC 专项页
 * ============================================================ */
const EPC = {
  en: { lang: 'en', crumb: 'Engineering firms & EPC',
    title: 'For Engineering Firms & EPC Contractors — Cone Crusher Selection Data | MACKORN',
    desc: 'Technical data, selection methodology and documented calculations for engineering firms, consultants and EPC contractors specifying hydraulic cone crushers. Whiten (1972) and Bond (1952) based, independently implemented.',
    h1: 'For engineering firms, consultants and EPC contractors',
    sub: 'You specify the equipment long before anyone buys it. We give you the data, the method and the calculations to specify a hydraulic cone crusher — and to defend the choice in a feasibility study.',
    whyT: 'Why this page exists',
    whyB: 'In most mining projects the crushing circuit is fixed during the feasibility or pre-feasibility study — by the engineering firm, not the mine. Getting onto a design house vendor list means being specified years before a purchase order exists. That happens on technical merit, not on price. So this page is written for the engineer, not the buyer.',
    getT: 'What we provide to engineering firms',
    get: [
      ['Documented selection method', 'Single-cylinder hydraulic cone crusher selection based on the Whiten (1972) steady-state model and the Bond (1952) energy relationship. Every output carries assumptions, sources and open items — it is built to be checked, not trusted.'],
      ['Free engineering tool', 'A 19-function open-source plugin covering selection, plant configuration, product-size simulation, circulating load, cost estimation and a 14-section proposal skeleton. Run it on your own duty and audit the numbers.'],
      ['Datasheets and dimensions', 'NH series (9 models) and NS high-speed series (4 models): cavity options, closed-side setting ranges, maximum feed size, installed power, weight and outline dimensions.'],
      ['Flowsheet simulation', 'Multi-stage crushing plus screening with closed-circuit population-balance iteration: per-stage P80, circulating load and mass balance. Useful for trade-off studies.'],
      ['Compliance documentation', 'Machine documentation for your technical specification. Tell us which standard and which project stage and we will supply what is required.'],
      ['Named technical contact', 'A direct technical contact for project-specific questions — not a general sales inbox.'],
    ],
    scopeT: 'What we do not claim',
    scope: [
      'We do not publish prices on this page; commercial terms are handled separately from engineering.',
      'Simulation parameters default to published literature values and must be calibrated against measured plant data — we mark clearly which is which.',
      'Where data is unknown our tools return null rather than an estimate, and conflicting sources are kept side by side rather than averaged.',
    ],
    whoT: 'Engineering firms and consultants active in our target markets',
    whoNote: 'The following are publicly known engineering and EPC firms active in mining and aggregates in the regions we serve. Listed for context only — no affiliation, endorsement or commercial relationship is implied.',
    who: [
      ['Canada', 'Hatch · SNC-Lavalin · Stantec · Tetra Tech'],
      ['Australia', 'Lycopodium · Ausenco · Sedgman · Worley'],
      ['South Africa', 'DRA Global · Worley'],
      ['Chile / Peru', 'JRI Ingeniería · Ausenco · Bechtel'],
      ['United Kingdom', 'Wood · SRK Consulting'],
      ['Germany', 'DMT · IBeWa'],
    ],
    howT: 'How to work with us',
    how: [
      ['1. Send the duty', 'Ore type, feed size distribution, target product and capacity. If you have a flowsheet in mind, send it.'],
      ['2. We return a documented selection', 'Stage count, cavity, CSS, unit count and power — with the assumptions and the simulated product curve.'],
      ['3. You audit it', 'Run the same duty through the public tool. The calculation is reproducible; that is the point.'],
      ['4. Vendor listing', 'If the equipment suits the project, we will complete your vendor pre-qualification documentation.'],
    ],
    faq: [
      ['Can we reproduce your calculations independently?', 'Yes, and we encourage it. The simulation is based on published models — Whiten (1972) for the steady-state size distribution and Bond (1952) for specific energy — implemented independently with no proprietary third-party data. The plugin is open source under the MIT licence.'],
      ['Do you provide equipment datasheets for specifications?', 'Yes. Cavity options, CSS ranges, maximum feed size, installed power, weight and outline dimensions for the NH series (9 models) and NS high-speed series (4 models). Tell us the project stage and required format.'],
      ['How do you handle parameters that are not measured?', 'We do not invent them. Unknown fields return null, and literature defaults are explicitly labelled as literature rather than measured. Conflicting sources are presented side by side. For a feasibility study you should calibrate against measured plant data — we provide the calibration workflow.'],
      ['Are you on any approved vendor lists?', 'We are working to be. Send us your pre-qualification package requirements and we will complete them.'],
      ['What is your target project size?', 'From several hundred tonnes per hour in aggregates up to 1,500 t/h and above in metal mines, across the NH and NS ranges.'],
      ['How do we contact your technical team?', 'leif.dai@mackorn.cn · +86 134 8218 0158'],
    ] },
  zh: { lang: 'zh-CN', crumb: '设计院与 EPC',
    title: '致设计院与 EPC 总包 —— 圆锥破选型数据 | MACKORN 美矿',
    desc: '为设计院、咨询公司与 EPC 总包提供液压圆锥破的技术数据、选型方法与可复核计算。基于 Whiten (1972) 与 Bond (1952)，独立实现，无第三方专有数据。',
    h1: '致设计院、咨询公司与 EPC 总包',
    sub: '设备是你们先写进图纸、别人后去买的。我们提供数据和可复核的算法，让您能在可行性研究里选定一台液压圆锥破——并且能守住这个选择。',
    whyT: '为什么单独做这一页',
    whyB: '多数矿业项目的破碎流程，是在可行性研究（FS/PFS）阶段就定下来的——决定者是设计院，不是矿主。进入设计院供应商名录，意味着在采购订单存在之前好几年就被写进方案。而这件事靠的是技术实力，不是价格。所以这一页是写给工程师看的，不是写给采购看的。',
    getT: '我们为设计院提供什么',
    get: [
      ['有据可查的选型方法', '基于 Whiten (1972) 稳态模型与 Bond (1952) 能耗关系做单缸液压圆锥破选型。每条结论都带假设、来源与待确认项——它是用来被检查的，不是用来被信任的。'],
      ['免费的工程工具', '19 个功能的开源插件，覆盖选型、整线配置、粒度仿真、循环负荷、成本估算与 14 节方案框架。用您自己的工况跑，然后审这些数字。'],
      ['技术数据与外形尺寸', 'NH 系列（9 个型号）与 NS 高速系列（4 个型号）：腔型选项、排矿口范围、最大给料粒度、装机功率、重量与外形尺寸。'],
      ['流程仿真', '多段破碎 + 筛分 + 闭路群体平衡迭代：各段 P80、循环负荷与物料平衡。适合方案比选。'],
      ['合规文件', '按您的技术规格书提供设备资料。告知适用标准与项目阶段，我们按要求提供。'],
      ['指定的技术对接人', '项目技术问题的直接对接人——不是通用销售邮箱。'],
    ],
    scopeT: '我们不做什么承诺',
    scope: [
      '本页不报价；商务条件与工程分开处理。',
      '仿真参数默认取公开文献值，必须用现场实测数据标定才能用于设计——我们会明确标注哪些是文献值、哪些是实测值。',
      '查不到的字段返回 null 而不是估算值；多来源冲突并列保留，不取平均。',
    ],
    whoT: '在我们目标市场活跃的设计院与咨询公司',
    whoNote: '以下是公开可查的、在我们服务区域从事矿业与骨料业务的工程与 EPC 公司，仅作背景说明——不表示任何隶属、背书或商业关系。',
    who: [
      ['加拿大', 'Hatch · SNC-Lavalin · Stantec · Tetra Tech'],
      ['澳大利亚', 'Lycopodium · Ausenco · Sedgman · Worley'],
      ['南非', 'DRA Global · Worley'],
      ['智利 / 秘鲁', 'JRI Ingeniería · Ausenco · Bechtel'],
      ['英国', 'Wood · SRK Consulting'],
      ['德国', 'DMT · IBeWa'],
    ],
    howT: '怎么和我们合作',
    how: [
      ['1. 把工况发给我们', '矿石种类、给料筛析、目标产品与产量。如果已有流程设想，一并发来。'],
      ['2. 我们返回有据可查的选型', '段数、腔型、CSS、台数与功率——连同假设和仿真产品曲线。'],
      ['3. 您来审', '用公开工具跑同样的工况。计算是可复现的——这正是重点。'],
      ['4. 进入供应商名录', '如果设备适配项目，我们完成您的供应商准入资料。'],
    ],
    faq: [
      ['我们能独立复现你们的计算吗？', '可以，而且我们鼓励这样做。仿真基于公开发表的模型——Whiten (1972) 稳态粒度分布与 Bond (1952) 比能耗——独立实现，不含任何第三方专有数据。插件以 MIT 协议开源。'],
      ['你们能提供用于规格书的设备数据吗？', '可以。NH 系列（9 型号）与 NS 高速系列（4 型号）的腔型、排矿口范围、最大给料、装机功率、重量与外形尺寸。告知项目阶段与所需格式即可。'],
      ['没有实测数据的参数你们怎么处理？', '我们不会编。查不到的字段返回 null，文献默认值会明确标注为"文献值"而非"实测值"，多来源冲突并列保留。用于可行性研究时应当用现场实测数据标定——我们提供标定流程。'],
      ['你们在哪些合格供应商名录里？', '我们正在推进。把你们的准入资料要求发来，我们完成。'],
      ['你们对应的项目规模？', '从骨料线几百吨每小时，到金属矿山 1500 t/h 以上，覆盖 NH 与 NS 全系列。'],
      ['怎么联系技术团队？', 'leif.dai@mackorn.cn · +86 134 8218 0158'],
    ] },
  de: { lang: 'de', crumb: 'Ingenieurbüros & EPC',
    title: 'Für Ingenieurbüros und EPC-Auftragnehmer — Auslegungsdaten für Kegelbrecher | MACKORN',
    desc: 'Technische Daten, Auslegungsmethodik und nachvollziehbare Berechnungen für Ingenieurbüros, Gutachter und EPC-Auftragnehmer, die hydraulische Kegelbrecher spezifizieren. Auf Basis Whiten (1972) und Bond (1952), unabhängig implementiert.',
    h1: 'Für Ingenieurbüros, Gutachter und EPC-Auftragnehmer',
    sub: 'Sie legen die Ausrüstung fest, lange bevor sie gekauft wird. Wir liefern Ihnen die Daten, die Methodik und die Berechnungen, um einen hydraulischen Kegelbrecher zu spezifizieren — und die Wahl in einer Machbarkeitsstudie zu verteidigen.',
    whyT: 'Warum diese Seite',
    whyB: 'In den meisten Bergbauprojekten wird der Brechkreis in der Machbarkeits- oder Vorstudie festgelegt — vom Ingenieurbüro, nicht vom Bergwerk. Auf einer Herstellerliste eines Planungsbüros zu stehen bedeutet, Jahre vor der Bestellung spezifiziert zu werden. Das geschieht über technische Substanz, nicht über den Preis. Diese Seite ist daher für den Ingenieur geschrieben, nicht für den Einkäufer.',
    getT: 'Was wir Ingenieurbüros bieten',
    get: [
      ['Dokumentierte Auslegungsmethode', 'Auslegung einzylindrischer hydraulischer Kegelbrecher auf Basis des stationären Modells von Whiten (1972) und der Energiebeziehung nach Bond (1952). Jedes Ergebnis führt Annahmen, Quellen und offene Punkte mit — es ist zum Prüfen gebaut, nicht zum Vertrauen.'],
      ['Kostenloses Engineering-Werkzeug', 'Ein Open-Source-Plugin mit 19 Funktionen: Auslegung, Anlagenkonfiguration, Granulometriesimulation, Umlaufbelastung, Kostenschätzung und ein 14-teiliges Angebotsgerüst. Rechnen Sie Ihren eigenen Betriebsfall nach.'],
      ['Datenblätter und Abmessungen', 'NH-Serie (9 Modelle) und NS-Hochleistungsserie (4 Modelle): Kammeroptionen, Spaltweitenbereiche, maximale Aufgabegröße, installierte Leistung, Gewicht und Außenabmessungen.'],
      ['Fließbildsimulation', 'Mehrstufige Zerkleinerung mit Siebung und geschlossenem Kreislauf (Populationsbilanz): P80 je Stufe, Umlaufbelastung und Massenbilanz — geeignet für Variantenvergleiche.'],
      ['Konformitätsdokumentation', 'Maschinendokumentation für Ihre technische Spezifikation. Nennen Sie Norm und Projektphase, wir liefern das Erforderliche.'],
      ['Benannter technischer Ansprechpartner', 'Ein direkter technischer Kontakt für projektspezifische Fragen — kein allgemeines Vertriebspostfach.'],
    ],
    scopeT: 'Was wir nicht behaupten',
    scope: [
      'Auf dieser Seite nennen wir keine Preise; kommerzielle Bedingungen werden getrennt von der Technik behandelt.',
      'Simulationsparameter sind standardmäßig Literaturwerte und müssen gegen Messdaten kalibriert werden — wir kennzeichnen klar, was was ist.',
      'Wo Daten fehlen, geben unsere Werkzeuge null zurück statt einer Schätzung; widersprüchliche Quellen werden nebeneinander geführt, nicht gemittelt.',
    ],
    whoT: 'Ingenieurbüros und Gutachter in unseren Zielmärkten',
    whoNote: 'Nachfolgend öffentlich bekannte Ingenieur- und EPC-Unternehmen im Bergbau und in der Gesteinsindustrie unserer Regionen. Nur zur Einordnung — es besteht keine Verbindung, Empfehlung oder Geschäftsbeziehung.',
    who: [
      ['Kanada', 'Hatch · SNC-Lavalin · Stantec · Tetra Tech'],
      ['Australien', 'Lycopodium · Ausenco · Sedgman · Worley'],
      ['Südafrika', 'DRA Global · Worley'],
      ['Chile / Peru', 'JRI Ingeniería · Ausenco · Bechtel'],
      ['Vereinigtes Königreich', 'Wood · SRK Consulting'],
      ['Deutschland', 'DMT · IBeWa'],
    ],
    howT: 'Zusammenarbeit',
    how: [
      ['1. Betriebsfall senden', 'Erztyp, Aufgabegut-Verteilung, Zielprodukt und Kapazität. Wenn Sie ein Fließbild haben, senden Sie es mit.'],
      ['2. Wir liefern eine dokumentierte Auslegung', 'Stufenzahl, Kammer, CSS, Stückzahl und Leistung — mit Annahmen und simulierter Produktkurve.'],
      ['3. Sie prüfen', 'Rechnen Sie denselben Fall mit dem öffentlichen Werkzeug nach. Die Berechnung ist reproduzierbar — das ist der Punkt.'],
      ['4. Herstellerliste', 'Passt die Ausrüstung zum Projekt, füllen wir Ihre Lieferantenqualifizierung aus.'],
    ],
    faq: [
      ['Können wir Ihre Berechnungen unabhängig nachvollziehen?', 'Ja, und wir ermutigen dazu. Die Simulation beruht auf veröffentlichten Modellen — Whiten (1972) für die stationäre Korngrößenverteilung, Bond (1952) für die spezifische Energie — unabhängig implementiert, ohne proprietäre Daten Dritter. Das Plugin ist MIT-lizenziert.'],
      ['Stellen Sie Datenblätter für Spezifikationen bereit?', 'Ja. Kammeroptionen, CSS-Bereiche, maximale Aufgabegröße, installierte Leistung, Gewicht und Außenabmessungen für NH (9 Modelle) und NS (4 Modelle). Nennen Sie Projektphase und Format.'],
      ['Wie gehen Sie mit nicht gemessenen Parametern um?', 'Wir erfinden sie nicht. Unbekannte Felder geben null zurück, Literaturwerte werden ausdrücklich als Literatur gekennzeichnet. Für eine Machbarkeitsstudie sollten Sie gegen Messdaten kalibrieren — den Kalibrierungsablauf stellen wir bereit.'],
      ['Stehen Sie auf genehmigten Herstellerlisten?', 'Wir arbeiten daran. Senden Sie uns Ihre Anforderungen an die Lieferantenqualifizierung.'],
      ['Welche Projektgröße adressieren Sie?', 'Von einigen hundert Tonnen pro Stunde in der Gesteinsindustrie bis über 1.500 t/h im Metallbergbau, über die NH- und NS-Reihe.'],
      ['Wie erreichen wir Ihr technisches Team?', 'leif.dai@mackorn.cn · +86 134 8218 0158'],
    ] },
};

/* ============================================================
 * 二、补缺国家页：德国 / 土耳其 / 越南
 * ============================================================ */
const CN_MORE = {
  de: { cc: 'de', lang: 'de', name: 'Deutschland', nameZh: '德国',
    h1: 'Kegelbrecher und Verschleißteile für den deutschen und mitteleuropäischen Markt',
    sub: 'Baumaßnahmen, Gesteinsindustrie und Bergbau in Deutschland, Österreich und der Schweiz. Technische Auslegung, dokumentiert und nachvollziehbar.',
    desc: 'MACKORN hydraulische Kegelbrecher und Verschleißteile für Deutschland, Österreich und die Schweiz. Dokumentierte Auslegung auf Basis Whiten (1972) und Bond (1952).',
    commodities: ['Kies und Splitt (Bayern, Baden-Württemberg, Nordrhein-Westfalen)', 'Naturstein (Granit, Basalt, Grauwacke)', 'Kalkstein und Zementrohstoffe', 'Salz- und Kalibergbau', 'Steinkohle (Bestand)'],
    materials: 'Granit · Basalt · Grauwacke · Kalkstein · Diabas · Andesit',
    note: 'Deutschland ist einer der größten Produzenten von Gesteinskörnungen in Europa und Heimat der bauma, der weltweit größten Bergbau- und Baumaschinenmesse. Deutsche Ingenieurbüros sind in vielen Bergbauprojekten weltweit tätig.',
    faq: [
      ['Welche Brecher für deutsche Gesteinskörnungen?', 'Für harte, abrasive Gesteine wie Granit, Basalt und Grauwacke ist ein einzylindrischer hydraulischer Kegelbrecher in der Mittel- und Feinstufe die übliche Wahl — mit grober bis mittlerer Kammer und verschleißfester Futterlegierung.'],
      ['Sind CE-Konformitätsunterlagen verfügbar?', 'Maschinendokumentation wird projektbezogen bereitgestellt. Nennen Sie die geforderte Norm und Projektphase, und wir liefern die erforderlichen Unterlagen.'],
      ['Arbeiten Sie mit deutschen Ingenieurbüros?', 'Ja. Wir stellen Auslegungsdaten und nachvollziehbare Berechnungen für Machbarkeitsstudien bereit.'],
      ['Wo findet man Sie auf Messen?', 'Die bauma in München ist die wichtigste Veranstaltung für diesen Markt; die bauma CHINA in Shanghai ist für uns ebenfalls zentral.'],
    ] },
  tr: { cc: 'tr', lang: 'tr', name: 'Türkiye', nameZh: '土耳其',
    h1: 'Türkiye pazarı için hidrolik konik kırıcılar ve aşınma parçaları',
    sub: 'Agrega, maden ve kırma-eleme tesisleri. Belgelendirilmiş seçim hesabı — Whiten (1972) ve Bond (1952) temelli.',
    desc: 'Türkiye için MACKORN hidrolik konik kırıcı ve aşınma parçaları: granit, bazalt, andezit, mermer ve metal cevherleri. Belgelendirilmiş seçim hesapları.',
    commodities: ['Mermer ve doğal taş (Afyon, Muğla, Balıkesir)', 'Krom (Elazığ, Fethiye)', 'Altın (Bergama, Kışladağ)', 'Bakır', 'Agrega (İstanbul, Ankara, İzmir)', 'Çinko-kurşun'],
    materials: 'Granit · bazalt · andezit · mermer · krom cevheri · bakır cevheri',
    note: 'Türkiye hem büyük bir agrega üreticisi hem de Avrupa ile Asya arasında bir köprü. Kırma-eleme ekipmanı ithalatı yılda 60 milyon doları aşıyor.',
    faq: [
      ['Bazalt için hangi konik kırıcı?', 'Bazalt sert ve aşındırıcıdır: ikincil ve üçüncül kademelerde tek silindirli hidrolik konik kırıcı, kaba-orta boşluk ve aşınmaya dayanıklı astar sınıfı önerilir.'],
      ['Kapasite ve ürün boyutu hesaplanabilir mi?', 'Evet. Eklenti Whiten (1972) kararlı hal modelini ve Bond (1952) enerji hesabını kullanır; kademe sayısı, boşluk, CSS, ünite sayısı ve güç hesaplanır.'],
      ['Türkiye\'de distribütör var mı?', 'Bayi ağımızı genişletiyoruz. Kırma-eleme ekipmanı satıyorsanız bize ulaşın.'],
      ['Aşınma parçası tedarik ediyor musunuz?', 'Evet — NH/NS serileri için manto ve konkav.'],
    ] },
  vi: { cc: 'vn', lang: 'vi', name: 'Việt Nam', nameZh: '越南',
    h1: 'Máy nghiền côn thủy lực và phụ tùng mài mòn cho thị trường Việt Nam',
    sub: 'Cốt liệu, khai khoáng và trạm nghiền sàng. Tính toán chọn máy có tài liệu — dựa trên Whiten (1972) và Bond (1952).',
    desc: 'MACKORN máy nghiền côn thủy lực và phụ tùng mài mòn cho Việt Nam: đá granit, bazan, andesit, quặng sắt. Tính toán chọn máy có thể kiểm chứng.',
    commodities: ['Đá xây dựng (đá vôi, granit, bazan)', 'Quặng sắt (Hà Tĩnh, Lào Cai)', 'Than (Quảng Ninh)', 'Đồng, chì-kẽm', 'Cát nghiền nhân tạo'],
    materials: 'Đá granit · bazan · andesit · đá vôi · quặng sắt',
    note: 'Việt Nam có nhu cầu cốt liệu xây dựng rất lớn và ngành khai khoáng đang mở rộng. Nhập khẩu thiết bị nghiền khoảng 55 triệu USD mỗi năm.',
    faq: [
      ['Máy nghiền côn nào cho đá bazan?', 'Bazan cứng và mài mòn cao: dùng máy nghiền côn thủy lực một xi-lanh ở cấp thứ cấp và cấp ba, với buồng nghiền thô-vừa và mác thép mangan chống mài mòn cao.'],
      ['Có tính được cỡ hạt sản phẩm không?', 'Có. Plugin dùng mô hình ổn định Whiten (1972) và tính năng lượng Bond (1952), trả về P20/P50/P80, tỷ số giảm cấp và năng lượng riêng.'],
      ['Có đại lý tại Việt Nam không?', 'Chúng tôi đang mở rộng mạng lưới đại lý tại Đông Nam Á. Vui lòng liên hệ nếu bạn kinh doanh thiết bị nghiền sàng.'],
      ['Có cung cấp phụ tùng mài mòn không?', 'Có — manto (nón động) và concav (nón tĩnh) cho dòng NH/NS.'],
    ] },
};

function renderEpC(lang, L) {
  const langs = ['en', 'zh', 'de'];
  return `<!DOCTYPE html>
<html lang="${L.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${L.title}</title>
<meta name="description" content="${L.desc}">
<meta name="keywords" content="cone crusher specification,engineering firm,EPC contractor,feasibility study,crushing circuit design,Whiten model,Bond work index,Ingenieurbüro,Kegelbrecher Auslegung,设计院,EPC总包,可行性研究,MACKORN">
<meta name="robots" content="index,follow,max-snippet:-1">
<link rel="canonical" href="${BASE}/engineering-firms/">
${langs.map((l) => `<link rel="alternate" hreflang="${l === 'zh' ? 'zh-CN' : l}" href="${BASE}/engineering-firms/${l === 'en' ? '' : l + '/'}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${BASE}/engineering-firms/">
<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: L.title, description: L.desc, inLanguage: L.lang, url: `${BASE}/engineering-firms/`, about: [{ '@type': 'Thing', name: 'cone crusher specification' }, { '@type': 'Thing', name: 'feasibility study' }, { '@type': 'Thing', name: 'crushing circuit design' }], publisher: { '@type': 'Organization', name: COMPANY.name, url: BASE } }, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: L.lang, mainEntity: L.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }, null, 2)}
</script>
<style>${CSS}</style>
</head>
<body>
<div class="langbar"><div class="wrap">${langs.map((l) => `<a href="/engineering-firms/${l === 'en' ? '' : l + '/'}"${l === lang ? ' style="color:#fff;font-weight:700"' : ''}>${l === 'zh' ? 'zh-CN' : l}</a>`).join('')}</div></div>
<header><div class="wrap">
<div class="crumb"><a href="${BASE}/">MACKORN</a> &rsaquo; <a href="${BASE}/ai/">AI selection plugin</a> &rsaquo; ${L.crumb}</div>
<h1>${L.h1}</h1><p>${L.sub}</p>
</div></header>
<div class="wrap">

<section><h2>${L.whyT}</h2><div class="box hi"><p style="margin:0">${L.whyB}</p></div></section>

<section><h2>${L.getT}</h2>
<div class="grid">${L.get.map(([t, d]) => `<div class="card"><h4>${t}</h4><p>${d}</p></div>`).join('\n')}</div>
</section>

<section><h2>${L.scopeT}</h2><ul>${L.scope.map((x) => `<li>${x}</li>`).join('')}</ul></section>

<section><h2>${L.whoT}</h2>
<p class="muted">${L.whoNote}</p>
<table>${L.who.map(([r, c]) => `<tr><th style="width:26%">${r}</th><td>${c}</td></tr>`).join('\n')}</table>
</section>

<section><h2>${L.howT}</h2>
<table>${L.how.map(([s, d]) => `<tr><th style="width:30%">${s}</th><td>${d}</td></tr>`).join('\n')}</table>
</section>

<section><h2>FAQ</h2>${L.faq.map(([q, a]) => `<h3>${q}</h3>\n<p>${a}</p>`).join('\n')}</section>

<section><h2>Contact</h2>
<div class="box"><strong>${COMPANY.name} ${COMPANY.nameCn}</strong><br>${COMPANY.addr}<br><a href="${BASE}">${BASE}</a> &middot; GMT+8 (09:00-17:30)<br>${COMPANY.emails.join('<br>')}</div>
<p><a class="btn" href="mailto:leif.dai@mackorn.cn?subject=MACKORN%20-%20engineering%20specification%20request">${L.crumb}</a>
<a class="btn ghost" href="${BASE}/ai/">AI selection plugin</a>
<a class="btn ghost" href="${BASE}/distributors/">Distributors</a></p>
</section>
</div>
<footer><div class="wrap"><p style="margin:0 0 8px"><strong>${COMPANY.name}</strong></p>
<p style="margin:0">Open source under the MIT license. Vendor parameter data is copyright of Shanghai Mackorn Minerals Co., Ltd. Process models from published literature (Whiten 1972 / Bond 1952), independently implemented. No pricing on this page.</p></div></footer>
</body></html>`;
}

function renderCountry(c) {
  const langs = { de: 'de', tr: 'tr', vi: 'vi' };
  return `<!DOCTYPE html>
<html lang="${c.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${c.h1} | MACKORN</title>
<meta name="description" content="${c.desc}">
<meta name="keywords" content="${c.name},${c.nameZh},konik kırıcı,máy nghiền côn,Kegelbrecher,cone crusher,hydraulic cone crusher,${c.materials},MACKORN">
<meta name="robots" content="index,follow,max-snippet:-1">
<link rel="canonical" href="${BASE}/markets/${c.cc}/">
<link rel="alternate" hreflang="${c.lang}" href="${BASE}/markets/${c.cc}/">
<link rel="alternate" hreflang="x-default" href="${BASE}/ai/">
<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: c.h1, description: c.desc, inLanguage: c.lang, url: `${BASE}/markets/${c.cc}/`, about: [{ '@type': 'Country', name: c.name }, { '@type': 'Thing', name: 'hydraulic cone crusher' }], publisher: { '@type': 'Organization', name: COMPANY.name, url: BASE } }, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: c.lang, mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }, null, 2)}
</script>
<style>${CSS}</style>
</head>
<body>
<header><div class="wrap">
<div class="crumb"><a href="${BASE}/">MACKORN</a> &rsaquo; <a href="${BASE}/ai/">AI selection plugin</a> &rsaquo; ${c.name}</div>
<h1>${c.h1}</h1><p>${c.sub}</p>
</div></header>
<div class="wrap">
<section>
<p>${c.note}</p>
<h3>${c.lang === 'de' ? 'Wichtigste Rohstoffe' : c.lang === 'tr' ? 'Başlıca kaynaklar' : 'Tài nguyên chính'}</h3>
<ul>${c.commodities.map((x) => `<li>${x}</li>`).join('')}</ul>
<h3>${c.lang === 'de' ? 'Geeignete Materialien' : c.lang === 'tr' ? 'Uygun malzemeler' : 'Vật liệu phù hợp'}</h3>
<p>${c.materials}</p>
<div class="box">${c.lang === 'de' ? 'Ein Kegelbrecher ist eine Mittel- und Feinstufenmaschine. Aufgabegut über etwa 350 mm erfordert Vorsiebung oder einen Grobbrecher.' : c.lang === 'tr' ? 'Konik kırıcı ikincil/üçüncül bir makinedir. Yaklaşık 350 mm üzeri besleme ön eleme veya primer kırıcı gerektirir.' : 'Máy nghiền côn là máy cấp hai/cấp ba. Cỡ liệu trên khoảng 350 mm cần sàng trước hoặc máy nghiền sơ cấp.'}</div>
</section>
<section><h2>FAQ</h2>${c.faq.map(([q, a]) => `<h3>${q}</h3>\n<p>${a}</p>`).join('\n')}</section>
<section><h2>${c.lang === 'de' ? 'Kontakt' : c.lang === 'tr' ? 'İletişim' : 'Liên hệ'}</h2>
<div class="box"><strong>${COMPANY.name} ${COMPANY.nameCn}</strong><br>${COMPANY.addr}<br><a href="${BASE}">${BASE}</a> &middot; GMT+8 (09:00-17:30)<br>${COMPANY.emails.join('<br>')}</div>
<p><a class="btn" href="${BASE}/ai/">AI selection plugin</a>
<a class="btn ghost" href="${BASE}/ai/parts/en/">Wear parts</a>
<a class="btn ghost" href="${BASE}/distributors/">${c.lang === 'de' ? 'Distributor werden' : c.lang === 'tr' ? 'Bayi olun' : 'Trở thành đại lý'}</a>
<a class="btn ghost" href="${BASE}/engineering-firms/">${c.lang === 'de' ? 'Für Ingenieurbüros' : c.lang === 'tr' ? 'Mühendislik firmaları' : 'Cho đơn vị thiết kế'}</a></p>
</section>
</div>
<footer><div class="wrap"><p style="margin:0 0 8px"><strong>${COMPANY.name}</strong></p>
<p style="margin:0">Open source under the MIT license. Market data from UN Comtrade public API. No pricing on this page.</p></div></footer>
</body></html>`;
}

let n = 0;
// 设计院页
for (const [l, L] of Object.entries(EPC)) {
  const d = l === 'en' ? join(SRC, 'engineering-firms') : join(SRC, 'engineering-firms', l);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'index.html'), renderEpC(l, L), 'utf8');
  console.log('  /engineering-firms/' + (l === 'en' ? '' : l + '/') + '   ' + l);
  n++;
}
// 补缺国家页
for (const [k, c] of Object.entries(CN_MORE)) {
  const d = join(SRC, 'markets', c.cc);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'index.html'), renderCountry(c), 'utf8');
  console.log('  /markets/' + c.cc + '/   ' + c.nameZh + ' (' + c.lang + ')');
  n++;
}
console.log('\n  生成 ' + n + ' 个页面');
