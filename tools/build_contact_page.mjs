/**
 * 生成联系方式页 /contact/（多语言 + 二维码）
 *
 * 用户要求：
 *   "增加一个服务的二维码，在联系方式上……二维码在网站联系方式一页，
 *    可以把联系方式一页做成二维码，喜欢扫码的人，一扫就清楚了。"
 *
 * 所以这一页同时做两件事：
 *   ① 展示全部联系方式 + 微信二维码（扫码直接加微信）
 *   ② 页面自身带二维码（扫这个码 = 拿到这一页的全部信息）
 *
 * 语言：EN / ZH / RU / ES / PT / FR（覆盖主要目标市场）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qrSvg } from './gen_qr_svg.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'distribution', '官网落地页');
const BASE = 'https://mackorn.cn';

/* 联系方式（原文保留，不翻译公司名/地址/电话/邮箱） */
const COMPANY = {
  name: 'Shanghai Mackorn Minerals Co., Ltd.',
  nameCn: '上海美矿机械股份有限公司',
  addr: 'No.33 Qianjiang Road, Liuhe, Taicang, Suzhou, Jiangsu, China',
  addrCn: '江苏省苏州市太仓市浏河镇钱江路 33 号',
  web: 'https://mackorn.cn',
  hours: 'GMT+8 · 09:00–17:30 (Mon–Sat)',
  people: [
    { name: 'Sandy Zhao', email: 'sandy.zhao@mackorn.cn', tel: '+86 139 1648 5025' },
    { name: 'Leif Dai', email: 'leif.dai@mackorn.cn', tel: '+86 134 8218 0158' },
    { name: 'Vicky Cheng', email: 'vicky.cheng@mackorn.cn', tel: '+86 158 0189 1052' },
  ],
};

const T = {
  en: { lang: 'en', crumb: 'Contact',
    title: 'Contact MACKORN — Hydraulic Cone Crushers & Crushing Plant | WeChat QR',
    desc: 'Contact Shanghai Mackorn Minerals: hydraulic cone crusher selection, crushing and screening plant design, wear parts, financing lease and toll-processing. Scan the QR code to reach us directly.',
    h1: 'Contact MACKORN',
    sub: 'Hydraulic cone crushers · crushing and screening plant design · wear parts · production operations · financing lease and toll-processing. Scan either code below and reach a person, not a form.',
    scanTitle: 'Scan to reach us',
    scanNote: 'The left code opens this contact page on your phone. The right code is our WeChat — scan it to add us directly.',
    pageQr: 'This contact page',
    wechatQr: 'WeChat / 微信',
    infoTitle: 'Contact details',
    hqTitle: 'Head office & works',
    hours: 'Service hours',
    teamTitle: 'Direct contacts',
    partnerTitle: 'Partner with us',
    partnerBody: 'We are recruiting distributors, agents and service partners across Latin America, Central Asia, Africa, Southeast Asia and the Middle East.',
    whatTitle: 'What we do',
    what: [
      ['Cone crusher selection', 'NH series (9 models) and NS high-speed series (4 models). Documented selection with cavity, CSS, unit count and power.'],
      ['Crushing & screening plant design', 'Stage split, screen area, belt width, auxiliaries, flowsheet and a 14-section proposal.'],
      ['Manufacturing & installation', 'Equipment manufacturing, supervised installation, commissioning and performance testing.'],
      ['Wear parts supply', 'Mantles, bowl liners and matching wear parts — with liner life management.'],
      ['Production operations', 'We can operate the plant for you, or supply against a toll-processing fee.'],
      ['Financing lease', 'Financing lease and toll-processing settlement to lower the entry barrier.'],
    ],
    freeTitle: 'Free engineering tool',
    freeBody: 'Our open-source selection plugin runs 20 functions in 12 languages and is indexed on the official MCP Registry, so any AI assistant can call it directly. Your engineers can reproduce every calculation.',
    faqTitle: 'FAQ',
    faq: [
      ['How do I contact MACKORN?', 'Scan the WeChat QR code on this page, email sandy.zhao@mackorn.cn or leif.dai@mackorn.cn, or call +86 139 1648 5025. Service hours are 09:00–17:30 GMT+8.'],
      ['Where is MACKORN located?', 'Head office and works: No.33 Qianjiang Road, Liuhe, Taicang, Suzhou, Jiangsu, China — about 60 km from Shanghai, close to Taicang and Shanghai ports.'],
      ['What does MACKORN supply?', 'Single-cylinder hydraulic cone crushers (NH and NS series), complete crushing and screening plants, wear parts, production operations, and financing lease or toll-processing arrangements.'],
      ['Do you speak my language?', 'Our technical team works in Chinese and English; our AI selection plugin answers in 12 languages including Spanish, Russian, Portuguese, French, Arabic and Indonesian.'],
      ['How do I ask for a selection?', 'Send ore type, maximum feed size, target product size and capacity. We will return a documented selection with assumptions and risks stated.'],
    ],
    linksTitle: 'More',
  },
  zh: { lang: 'zh-CN', crumb: '联系方式',
    title: '联系 MACKORN 美矿 —— 液压圆锥破与破碎筛分生产线 | 微信二维码',
    desc: '联系上海美矿机械股份有限公司：液压圆锥破碎机选型、破碎筛分生产线设计、衬板耐磨件、生产运营托管、融资租赁与加工费结算。扫码直达微信。',
    h1: '联系 MACKORN 美矿',
    sub: '液压圆锥破碎机 · 破碎筛分生产线设计 · 衬板耐磨件 · 生产运营托管 · 融资租赁与加工费结算。扫下面任一二维码，直接联系到人，不是表单。',
    scanTitle: '扫码联系我们',
    scanNote: '左边二维码用手机打开本联系方式页；右边是我们的微信 —— 扫码直接加好友。',
    pageQr: '本联系方式页',
    wechatQr: '微信',
    infoTitle: '联系方式',
    hqTitle: '总部与工厂',
    hours: '服务时间',
    teamTitle: '直接联系人',
    partnerTitle: '合作与代理',
    partnerBody: '我们在拉美、中亚、非洲、东南亚和中东招募代理商、经销商与服务伙伴。',
    whatTitle: '我们做什么',
    what: [
      ['圆锥破选型', 'NH 系列（9 型号）与 NS 高速系列（4 型号）。附腔型、排矿口、台数与功率的选型依据。'],
      ['破碎筛分生产线设计', '分段、筛分面积、带宽、辅机、流程图与 14 节方案书。'],
      ['制造与安装', '设备制造、安装指导、调试与性能考核。'],
      ['衬板耐磨件供应', '破碎壁、轧臼壁及配套耐磨件 —— 含衬板寿命管理。'],
      ['生产运营', '可代客户运营，或按加工费结算模式供货。'],
      ['融资租赁', '融资租赁与加工费结算，降低客户进入门槛。'],
    ],
    freeTitle: '免费工程工具',
    freeBody: '我们的开源选型插件有 20 个功能、12 种语言，已收录进官方 MCP 注册表，任何 AI 助手都能直接调用。您的工程师可以复核每一项计算。',
    faqTitle: '常见问题',
    faq: [
      ['怎么联系美矿？', '扫本页微信二维码，或发邮件到 sandy.zhao@mackorn.cn / leif.dai@mackorn.cn，或致电 +86 139 1648 5025。服务时间 GMT+8 09:00–17:30。'],
      ['美矿在哪里？', '总部与工厂：江苏省苏州市太仓市浏河镇钱江路 33 号 —— 距上海约 60 公里，近太仓港与上海港。'],
      ['美矿提供什么？', '单缸液压圆锥破（NH 与 NS 系列）、整条破碎筛分生产线、衬板耐磨件、生产运营托管，以及融资租赁或加工费结算。'],
      ['你们说我的语言吗？', '技术团队使用中英文；AI 选型插件支持 12 种语言，含西班牙语、俄语、葡萄牙语、法语、阿拉伯语、印尼语。'],
      ['怎么要选型？', '把矿石种类、最大给料粒度、目标成品粒度和产量发给我们。我们会返回带假设与风险的选型结论。'],
    ],
    linksTitle: '更多',
  },
  ru: { lang: 'ru', crumb: 'Контакты',
    title: 'Контакты MACKORN — гидравлические конусные дробилки | QR-код WeChat',
    desc: 'Свяжитесь с Shanghai Mackorn Minerals: подбор конусных дробилок, проектирование ДСК, футеровка, эксплуатация, финансовый лизинг и переработка по тарифу.',
    h1: 'Связаться с MACKORN',
    sub: 'Гидравлические конусные дробилки · проектирование ДСК · футеровка · эксплуатация · финансовый лизинг и переработка по тарифу. Отсканируйте код и свяжитесь с человеком, а не с формой.',
    scanTitle: 'Отсканируйте, чтобы связаться',
    scanNote: 'Левый код открывает эту страницу на телефоне. Правый — наш WeChat: отсканируйте, чтобы добавить нас.',
    pageQr: 'Эта страница контактов', wechatQr: 'WeChat',
    infoTitle: 'Контактные данные', hqTitle: 'Головной офис и завод', hours: 'Часы работы', teamTitle: 'Прямые контакты',
    partnerTitle: 'Стать партнёром', partnerBody: 'Мы набираем дистрибьюторов, агентов и сервисных партнёров в Латинской Америке, Центральной Азии, Африке, Юго-Восточной Азии и на Ближнем Востоке.',
    whatTitle: 'Что мы делаем',
    what: [
      ['Подбор конусных дробилок', 'Серия NH (9 моделей) и высокоскоростная NS (4 модели). С обоснованием камеры, CSS, числа единиц и мощности.'],
      ['Проектирование ДСК', 'Разбивка по стадиям, площадь грохочения, ширина ленты, вспомогательное оборудование, схема и предложение из 14 разделов.'],
      ['Изготовление и монтаж', 'Изготовление, шеф-монтаж, пусконаладка и приёмочные испытания.'],
      ['Поставка футеровки', 'Броня конуса, футеровка чаши и сопутствующие части — с управлением ресурсом.'],
      ['Эксплуатация', 'Можем эксплуатировать производство за вас или поставлять по тарифу за переработку.'],
      ['Финансовый лизинг', 'Лизинг и расчёты по тарифу переработки для снижения порога входа.'],
    ],
    freeTitle: 'Бесплатный инженерный инструмент',
    freeBody: 'Наш открытый плагин подбора содержит 20 функций на 12 языках и включён в официальный реестр MCP — любой ИИ-ассистент может его вызвать. Ваши инженеры могут проверить каждый расчёт.',
    faqTitle: 'Частые вопросы',
    faq: [
      ['Как связаться с MACKORN?', 'Отсканируйте QR-код WeChat на этой странице, напишите на sandy.zhao@mackorn.cn или leif.dai@mackorn.cn, либо позвоните +86 139 1648 5025. Часы работы 09:00–17:30 GMT+8.'],
      ['Где находится MACKORN?', 'Головной офис и завод: No.33 Qianjiang Road, Liuhe, Taicang, Suzhou, Jiangsu, China — около 60 км от Шанхая, рядом с портами Тайцан и Шанхай.'],
      ['Что поставляет MACKORN?', 'Одноцилиндровые гидравлические конусные дробилки (серии NH и NS), комплектные ДСК, футеровку, эксплуатацию, а также лизинг или расчёты по тарифу переработки.'],
      ['Говорите ли вы на моём языке?', 'Техническая команда работает на китайском и английском; плагин подбора отвечает на 12 языках, включая русский.'],
      ['Как запросить подбор?', 'Пришлите тип руды, максимальную крупность питания, целевой продукт и производительность. Мы вернём обоснованный подбор с указанием допущений и рисков.'],
    ],
    linksTitle: 'Ещё',
  },
  es: { lang: 'es', crumb: 'Contacto',
    title: 'Contacto MACKORN — Trituradoras de cono y plantas de trituración | QR WeChat',
    desc: 'Contacte con Shanghai Mackorn Minerals: selección de trituradoras de cono, diseño de plantas de trituración, piezas de desgaste, operación, arrendamiento financiero y maquila.',
    h1: 'Contacte con MACKORN',
    sub: 'Trituradoras de cono hidráulicas · diseño de plantas · piezas de desgaste · operación · arrendamiento financiero y maquila. Escanee cualquiera de los códigos y llegue a una persona, no a un formulario.',
    scanTitle: 'Escanee para contactarnos',
    scanNote: 'El código izquierdo abre esta página en su teléfono. El derecho es nuestro WeChat: escanéelo para añadirnos.',
    pageQr: 'Esta página de contacto', wechatQr: 'WeChat',
    infoTitle: 'Datos de contacto', hqTitle: 'Oficina central y fábrica', hours: 'Horario de servicio', teamTitle: 'Contactos directos',
    partnerTitle: 'Sea nuestro socio', partnerBody: 'Buscamos distribuidores, agentes y socios de servicio en Latinoamérica, Asia Central, África, Sudeste Asiático y Oriente Medio.',
    whatTitle: 'Qué hacemos',
    what: [
      ['Selección de trituradoras de cono', 'Serie NH (9 modelos) y serie rápida NS (4 modelos). Con cámara, CSS, número de unidades y potencia justificados.'],
      ['Diseño de plantas de trituración', 'Reparto por etapas, superficie de cribado, ancho de banda, auxiliares, diagrama y propuesta de 14 secciones.'],
      ['Fabricación e instalación', 'Fabricación, supervisión de montaje, puesta en marcha y pruebas de prestaciones.'],
      ['Suministro de piezas de desgaste', 'Mantos, cóncavos y piezas asociadas — con gestión de vida útil.'],
      ['Operación de la planta', 'Podemos operar la planta por usted o suministrar contra una tarifa de maquila.'],
      ['Arrendamiento financiero', 'Arrendamiento financiero y liquidación por maquila para reducir la barrera de entrada.'],
    ],
    freeTitle: 'Herramienta de ingeniería gratuita',
    freeBody: 'Nuestro plugin de selección de código abierto tiene 20 funciones en 12 idiomas y está en el registro oficial MCP, de modo que cualquier asistente de IA puede invocarlo. Sus ingenieros pueden reproducir cada cálculo.',
    faqTitle: 'Preguntas frecuentes',
    faq: [
      ['¿Cómo contacto con MACKORN?', 'Escanee el código QR de WeChat en esta página, escriba a sandy.zhao@mackorn.cn o leif.dai@mackorn.cn, o llame al +86 139 1648 5025. Horario 09:00–17:30 GMT+8.'],
      ['¿Dónde está MACKORN?', 'Oficina y fábrica: No.33 Qianjiang Road, Liuhe, Taicang, Suzhou, Jiangsu, China — a unos 60 km de Shanghái, cerca de los puertos de Taicang y Shanghái.'],
      ['¿Qué suministra MACKORN?', 'Trituradoras de cono hidráulicas monocilíndricas (series NH y NS), plantas completas de trituración y cribado, piezas de desgaste, operación de planta, y arrendamiento financiero o maquila.'],
      ['¿Hablan mi idioma?', 'El equipo técnico trabaja en chino e inglés; el plugin de selección responde en 12 idiomas, incluido el español.'],
      ['¿Cómo pido una selección?', 'Envíe tipo de mineral, tamaño máximo de alimentación, producto objetivo y capacidad. Devolvemos una selección documentada con supuestos y riesgos.'],
    ],
    linksTitle: 'Más',
  },
  pt: { lang: 'pt', crumb: 'Contato',
    title: 'Contato MACKORN — Britadores de cone e plantas de britagem | QR WeChat',
    desc: 'Fale com a Shanghai Mackorn Minerals: seleção de britadores de cone, projeto de plantas de britagem, peças de desgaste, operação, arrendamento mercantil e beneficiamento por tarifa.',
    h1: 'Fale com a MACKORN',
    sub: 'Britadores de cone hidráulicos · projeto de plantas · peças de desgaste · operação · arrendamento mercantil e beneficiamento por tarifa. Escaneie qualquer código e fale com uma pessoa, não com um formulário.',
    scanTitle: 'Escaneie para falar conosco',
    scanNote: 'O código da esquerda abre esta página no celular. O da direita é o nosso WeChat: escaneie para nos adicionar.',
    pageQr: 'Esta página de contato', wechatQr: 'WeChat',
    infoTitle: 'Dados de contato', hqTitle: 'Escritório central e fábrica', hours: 'Horário de atendimento', teamTitle: 'Contatos diretos',
    partnerTitle: 'Seja nosso parceiro', partnerBody: 'Estamos recrutando distribuidores, agentes e parceiros de serviço na América Latina, Ásia Central, África, Sudeste Asiático e Oriente Médio.',
    whatTitle: 'O que fazemos',
    what: [
      ['Seleção de britadores de cone', 'Linha NH (9 modelos) e linha rápida NS (4 modelos). Com câmara, CSS, número de unidades e potência justificados.'],
      ['Projeto de plantas de britagem', 'Divisão por estágios, área de peneiramento, largura de correia, auxiliares, fluxograma e proposta de 14 seções.'],
      ['Fabricação e instalação', 'Fabricação, supervisão de montagem, comissionamento e testes de desempenho.'],
      ['Fornecimento de peças de desgaste', 'Mantas, côncavos e peças associadas — com gestão de vida útil.'],
      ['Operação da planta', 'Podemos operar a planta para você ou fornecer contra uma tarifa de beneficiamento.'],
      ['Arrendamento mercantil', 'Arrendamento mercantil e liquidação por tarifa para reduzir a barreira de entrada.'],
    ],
    freeTitle: 'Ferramenta de engenharia gratuita',
    freeBody: 'Nosso plugin de seleção de código aberto tem 20 funções em 12 idiomas e está no registro oficial MCP, então qualquer assistente de IA pode chamá-lo. Seus engenheiros podem reproduzir cada cálculo.',
    faqTitle: 'Perguntas frequentes',
    faq: [
      ['Como falo com a MACKORN?', 'Escaneie o QR do WeChat nesta página, escreva para sandy.zhao@mackorn.cn ou leif.dai@mackorn.cn, ou ligue +86 139 1648 5025. Horário 09:00–17:30 GMT+8.'],
      ['Onde fica a MACKORN?', 'Escritório e fábrica: No.33 Qianjiang Road, Liuhe, Taicang, Suzhou, Jiangsu, China — cerca de 60 km de Xangai, perto dos portos de Taicang e Xangai.'],
      ['O que a MACKORN fornece?', 'Britadores de cone hidráulicos monocilíndricos (linhas NH e NS), plantas completas de britagem e peneiramento, peças de desgaste, operação de planta e arrendamento mercantil ou beneficiamento por tarifa.'],
      ['Vocês falam meu idioma?', 'A equipe técnica trabalha em chinês e inglês; o plugin de seleção responde em 12 idiomas, incluindo português.'],
      ['Como peço uma seleção?', 'Envie o tipo de minério, tamanho máximo de alimentação, produto desejado e capacidade. Retornamos uma seleção documentada com premissas e riscos.'],
    ],
    linksTitle: 'Mais',
  },
  fr: { lang: 'fr', crumb: 'Contact',
    title: 'Contact MACKORN — Concasseurs à cône et installations de concassage | QR WeChat',
    desc: 'Contactez Shanghai Mackorn Minerals : sélection de concasseurs à cône, conception d\'installations, pièces d\'usure, exploitation, crédit-bail et façonnage à la tonne.',
    h1: 'Contacter MACKORN',
    sub: 'Concasseurs à cône hydrauliques · conception d\'installations · pièces d\'usure · exploitation · crédit-bail et façonnage à la tonne. Scannez l\'un des codes et joignez une personne, pas un formulaire.',
    scanTitle: 'Scannez pour nous joindre',
    scanNote: 'Le code de gauche ouvre cette page sur votre téléphone. Celui de droite est notre WeChat : scannez-le pour nous ajouter.',
    pageQr: 'Cette page de contact', wechatQr: 'WeChat',
    infoTitle: 'Coordonnées', hqTitle: 'Siège et usine', hours: 'Heures de service', teamTitle: 'Contacts directs',
    partnerTitle: 'Devenir partenaire', partnerBody: 'Nous recrutons des distributeurs, agents et partenaires de service en Amérique latine, Asie centrale, Afrique, Asie du Sud-Est et au Moyen-Orient.',
    whatTitle: 'Ce que nous faisons',
    what: [
      ['Sélection de concasseurs à cône', 'Série NH (9 modèles) et série rapide NS (4 modèles). Chambre, CSS, nombre d\'unités et puissance justifiés.'],
      ['Conception d\'installations', 'Répartition par étages, surface de criblage, largeur de bande, auxiliaires, schéma et proposition en 14 sections.'],
      ['Fabrication et installation', 'Fabrication, supervision du montage, mise en service et essais de performance.'],
      ['Fourniture de pièces d\'usure', 'Manteaux, bols et pièces associées — avec gestion de la durée de vie.'],
      ['Exploitation', 'Nous pouvons exploiter l\'installation pour vous, ou fournir contre un tarif de façonnage.'],
      ['Crédit-bail', 'Crédit-bail et règlement au façonnage pour abaisser la barrière d\'entrée.'],
    ],
    freeTitle: 'Outil d\'ingénierie gratuit',
    freeBody: 'Notre plugin de sélection open source propose 20 fonctions en 12 langues et figure au registre officiel MCP : toute IA peut l\'appeler. Vos ingénieurs peuvent reproduire chaque calcul.',
    faqTitle: 'Questions fréquentes',
    faq: [
      ['Comment contacter MACKORN ?', 'Scannez le QR WeChat de cette page, écrivez à sandy.zhao@mackorn.cn ou leif.dai@mackorn.cn, ou appelez le +86 139 1648 5025. Horaires 09:00–17:30 GMT+8.'],
      ['Où se trouve MACKORN ?', 'Siège et usine : No.33 Qianjiang Road, Liuhe, Taicang, Suzhou, Jiangsu, Chine — à environ 60 km de Shanghai, près des ports de Taicang et Shanghai.'],
      ['Que fournit MACKORN ?', 'Concasseurs à cône hydrauliques monocylindres (séries NH et NS), installations complètes de concassage-criblage, pièces d\'usure, exploitation, et crédit-bail ou façonnage à la tonne.'],
      ['Parlez-vous ma langue ?', 'L\'équipe technique travaille en chinois et anglais ; le plugin de sélection répond en 12 langues, dont le français.'],
      ['Comment demander une sélection ?', 'Envoyez le type de minerai, la granulométrie maximale, le produit visé et la capacité. Nous renvoyons une sélection documentée avec hypothèses et risques.'],
    ],
    linksTitle: 'Plus',
  },
};

const LANGS = Object.keys(T);
const CONTACT_QR = qrSvg(`${BASE}/contact/`, 260, 'H');

function render(lang, L) {
  return `<!DOCTYPE html>
<html lang="${L.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${L.title}</title>
<meta name="description" content="${L.desc}">
<meta name="keywords" content="contact MACKORN,mackorn contact,Shanghai Mackorn Minerals,crusher supplier contact,WeChat,微信,联系方式,контакты,contacto,contato,contact,cone crusher supplier,hydraulic cone crusher">
<meta name="robots" content="index,follow,max-snippet:-1">
<link rel="canonical" href="${BASE}/contact/">
${LANGS.map((l) => `<link rel="alternate" hreflang="${T[l].lang}" href="${BASE}/contact/${l === 'en' ? '' : l + '/'}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${BASE}/contact/">
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Organization',
    name: COMPANY.name, alternateName: COMPANY.nameCn, url: COMPANY.web,
    address: { '@type': 'PostalAddress', streetAddress: 'No.33 Qianjiang Road, Liuhe, Taicang', addressLocality: 'Suzhou', addressRegion: 'Jiangsu', addressCountry: 'CN' },
    contactPoint: COMPANY.people.map((p) => ({ '@type': 'ContactPoint', contactType: 'sales', name: p.name, email: p.email, telephone: p.tel, availableLanguage: ['zh-CN', 'en'] })),
    description: L.desc,
  }, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: L.lang,
    mainEntity: L.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }, null, 2)}
</script>
<style>
:root{--navy:#0A2A4F;--blue:#1B6CB5;--light:#F4F8FC;--line:#D9E5F2;--muted:#5A6B80}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,"Segoe UI","Microsoft YaHei",Roboto,sans-serif;color:#16202E;line-height:1.8}
.wrap{max-width:960px;margin:0 auto;padding:0 24px}
header{background:linear-gradient(140deg,#08213E,var(--blue));color:#fff;padding:52px 0 42px}
header .crumb{font-size:13px;opacity:.8;margin-bottom:12px}
header .crumb a{color:#BFE0FF;text-decoration:none}
header h1{margin:0 0 12px;font-size:clamp(22px,3.2vw,30px);line-height:1.35}
header p{margin:0;opacity:.94;max-width:800px;font-size:15.5px}
section{padding:38px 0;border-bottom:1px solid var(--line)}
h2{font-size:20px;color:var(--navy);margin:0 0 16px;border-bottom:2px solid var(--blue);display:inline-block;padding-bottom:8px}
h3{font-size:16px;color:var(--navy);margin:22px 0 8px}
.qrrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;margin:20px 0}
.qrcard{background:#fff;border:2px solid var(--blue);border-radius:14px;padding:20px;text-align:center}
.qrcard svg,.qrcard img{display:block;margin:0 auto;max-width:100%;height:auto;border-radius:6px}
.qrcard h4{margin:12px 0 4px;font-size:15px;color:var(--navy)}
.qrcard p{margin:0;font-size:13px;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px;margin:20px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.card h4{margin:0 0 8px;font-size:15px;color:var(--navy)}
.card p{margin:0;font-size:14px;color:var(--muted)}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14.5px}
th,td{border:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}
th{background:var(--light);color:var(--navy)}
.box{background:var(--light);border-left:4px solid var(--blue);padding:16px 20px;border-radius:0 10px 10px 0;margin:18px 0}
.box.hi{background:#EAF7EE;border-left-color:#2E9E5B}
.muted{color:var(--muted);font-size:14px}
a{color:var(--blue)}
.btn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;margin:6px 10px 6px 0;font-weight:600;font-size:15px}
.btn.ghost{background:#fff;color:var(--blue);border:2px solid var(--blue)}
footer{background:#08213E;color:#B8CEE3;padding:30px 0;font-size:13.5px}
.langbar{background:#08213E;padding:10px 0;font-size:13px}
.langbar a{color:#9CC7EE;margin:0 8px;text-decoration:none}
@media print{header{background:#0A2A4F!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<div class="langbar"><div class="wrap">${LANGS.map((l) => `<a href="/contact/${l === 'en' ? '' : l + '/'}"${l === lang ? ' style="color:#fff;font-weight:700"' : ''}>${T[l].lang}</a>`).join('')}</div></div>

<header><div class="wrap">
<div class="crumb"><a href="${BASE}/">MACKORN</a> &rsaquo; <a href="${BASE}/ai/">AI plugin</a> &rsaquo; ${L.crumb}</div>
<h1>${L.h1}</h1><p>${L.sub}</p>
</div></header>

<div class="wrap">

<section>
<h2>${L.scanTitle}</h2>
<p class="muted">${L.scanNote}</p>
<div class="qrrow">
  <div class="qrcard">
    ${CONTACT_QR}
    <h4>${L.pageQr}</h4>
    <p>${BASE}/contact/</p>
  </div>
  <div class="qrcard">
    <img src="/ai/wechat-qr.jpg" alt="MACKORN WeChat QR" width="260" height="260">
    <h4>${L.wechatQr}</h4>
    <p>sandy.zhao@mackorn.cn</p>
  </div>
</div>
</section>

<section>
<h2>${L.infoTitle}</h2>
<table>
<tr><th style="width:32%">${L.hqTitle}</th><td><strong>${COMPANY.name}</strong><br>${COMPANY.nameCn}<br>${COMPANY.addr}<br>${COMPANY.addrCn}</td></tr>
<tr><th>${L.hours}</th><td>${COMPANY.hours}</td></tr>
<tr><th>Web</th><td><a href="${COMPANY.web}">${COMPANY.web}</a></td></tr>
<tr><th>Email</th><td>${COMPANY.people.map((p) => `<a href="mailto:${p.email}">${p.email}</a>`).join('<br>')}</td></tr>
<tr><th>Tel / WhatsApp</th><td>${COMPANY.people.map((p) => p.tel).join('<br>')}</td></tr>
</table>
<h3>${L.teamTitle}</h3>
<table>
<tr><th>Name</th><th>Email</th><th>Tel / WhatsApp</th></tr>
${COMPANY.people.map((p) => `<tr><td>${p.name}</td><td><a href="mailto:${p.email}">${p.email}</a></td><td>${p.tel}</td></tr>`).join('\n')}
</table>
</section>

<section>
<h2>${L.whatTitle}</h2>
<div class="grid">${L.what.map(([t, d]) => `<div class="card"><h4>${t}</h4><p>${d}</p></div>`).join('\n')}</div>
<div class="box hi"><strong>${L.freeTitle}</strong><p style="margin:6px 0 0">${L.freeBody}</p></div>
<p><a class="btn" href="${BASE}/ai/">${L.freeTitle}</a>
<a class="btn ghost" href="${BASE}/engineering-firms/">Engineering firms</a></p>
</section>

<section>
<h2>${L.partnerTitle}</h2>
<p>${L.partnerBody}</p>
<p><a class="btn" href="${BASE}/distributors/">${L.partnerTitle}</a></p>
</section>

<section>
<h2>${L.faqTitle}</h2>
${L.faq.map(([q, a]) => `<h3>${q}</h3>\n<p>${a}</p>`).join('\n')}
</section>

<section>
<h2>${L.linksTitle}</h2>
<p>
<a class="btn ghost" href="${BASE}/ai/">AI plugin</a>
<a class="btn ghost" href="${BASE}/ai/parts/en/">Wear parts</a>
<a class="btn ghost" href="${BASE}/markets/">Markets</a>
<a class="btn ghost" href="${BASE}/distributors/">Distributors</a>
<a class="btn ghost" href="${BASE}/engineering-firms/">Engineering firms</a>
<a class="btn ghost" href="https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher">GitHub</a>
</p>
</section>

</div>
<footer><div class="wrap">
<p style="margin:0 0 8px"><strong>${COMPANY.name} ${COMPANY.nameCn}</strong></p>
<p style="margin:0">${COMPANY.addr} · ${COMPANY.addrCn} · ${COMPANY.web}</p>
<p style="margin:8px 0 0">Open source under the MIT license. Vendor parameter data is copyright of Shanghai Mackorn Minerals Co., Ltd.</p>
</div></footer>
</body>
</html>
`;
}

/* 生成 6 语言 + 主页 */
mkdirSync(join(SRC, 'contact'), { recursive: true });
writeFileSync(join(SRC, 'contact', 'index.html'), render('en', T.en), 'utf8');
console.log('  /contact/            en');
for (const l of ['zh', 'ru', 'es', 'pt', 'fr']) {
  const d = join(SRC, 'contact', l);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'index.html'), render(l, T[l]), 'utf8');
  console.log('  /contact/' + l + '/          ' + l);
}
/* 二维码文件也存盘（供其它页面引用/印刷） */
writeFileSync(join(SRC, 'contact-qr.svg'), CONTACT_QR, 'utf8');
console.log('  /contact-qr.svg      （本页二维码，可自行取用）');
console.log('  生成完成（6 个语言版本）');
