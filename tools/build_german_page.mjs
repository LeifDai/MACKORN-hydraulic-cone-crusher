/**
 * 生成德语页 /ai/de/ —— 补齐 12 语言最后一门
 * 复用与其它语种页完全一致的结构，只替换语言内容。
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'distribution', '官网落地页');
const OUT = join(SRC, 'ai', 'de');
mkdirSync(OUT, { recursive: true });

const BASE = 'https://mackorn.cn';
const C = {
  company: 'Shanghai Mackorn Minerals Co., Ltd.',
  companyCn: '上海美矿机械股份有限公司',
  address: 'Qianjiang Road 33, Liuhe, Taicang, Suzhou, Jiangsu, China',
  site: 'https://mackorn.cn',
  /** 德语术语（本地化，不是中英直译） */
  terms: {
    cone: 'Kegelbrecher',
    hydraulic: 'Hydraulikkegelbrecher',
    singleCylinder: 'Einzylinder-Hydraulikkegelbrecher',
    liner: 'Brechmantel / Verschleißteile',
    mantle: 'Brechmantel',
    bowlLiner: 'Brechschale',
    chamber: 'Brechkammer',
    css: 'engste Austrittsöffnung (CSS)',
    feedSize: 'maximale Aufgabegröße',
    capacity: 'Durchsatz (t/h)',
    hardness: 'Härte / Druckfestigkeit',
    aggregate: 'Zuschlagstoff / Gesteinskörnung',
    ore: 'Erz',
    screening: 'Siebanlage / Klassierung',
    plant: 'Brech- und Siebanlage',
    selection: 'Auslegung / Dimensionierung',
    wear: 'Verschleiß',
    linerLife: 'Standzeit der Verschleißteile',
    simulation: 'Simulation der Korngrößenverteilung',
    calibration: 'Kalibrierung mit Messdaten',
    proposal: 'Angebot / Projektierung',
    mouth: 'Aufgabeöffnung',
    reduction: 'Zerkleinerungsverhältnis',
    granite: 'Granit',
    basalt: 'Basalt',
    andesite: 'Andesit',
    diabase: 'Diabas',
    ironOre: 'Eisenerz',
    copperOre: 'Kupfererz',
    leadZinc: 'Blei-Zink-Erz',
    molybdenum: 'Molybdänerz',
  },
};

const TITLE = 'MACKORN KI-Auslegungsplugin — Hydraulikkegelbrecher & Brech-Siebanlagen | Shanghai Mackorn';
const DESC = 'MACKORN (美矿) Open-Source-KI-Plugin: Eingabe eines Kundenanforderungsformulars + einer Zielkapazität — Ausgabe von Maschinenauswahl, Anlagenkonfiguration, Korngrößen-Simulation und einem 14-kapiteligen Projektierungsangebot. 21 Werkzeuge, 6 Skills, keine Laufzeitabhängigkeiten, MIT-Lizenz, MCP-Protokoll — nutzbar von Claude / ChatGPT / Gemini / Grok / Cursor / VS Code.';
const KW = ['Hydraulikkegelbrecher','Kegelbrecher','Kegelbrecher Auslegung','Brechmantel','Verschleißteile','Brechkammer','engste Austrittsöffnung','CSS','Brech-Siebanlage','Zuschlagstoff','Aufgabegröße','Erzhärte','Druckfestigkeit','Granit','Basalt','Andesit','Diabas','Eisenerz','Kupfererz','Blei-Zink-Erz','Molybdänerz','Zerkleinerungsverhältnis','Kreislaufbelastung','Angebot','MCP','KI-Plugin','DeepSeek Harness','Mineralaufbereitung','Aufbereitungstechnik','cone crusher','hydraulic cone crusher','Kegelbrecher Standzeit','Brechmantel Wechsel','Einzylinder'];

const TERM_TABLE = [
  ['Kegelbrecher', '圆锥破碎机 / cone crusher', 'Hydraulikkegelbrecher mit Einzylinder-Aufbau'],
  ['Brechmantel', '破碎壁 / mantle', 'Wird mit der Welle mitbewegt — das verschleißintensivste Bauteil'],
  ['Brechschale', '轧臼壁 / bowl liner', 'Feststehend; mit dem Brechmantel bildet sie die Brechkammer'],
  ['Brechkammer', '破碎腔型 / crushing chamber', 'EC · C · MC · M · MF · F · EF — je nach Aufgabegröße und Zielkorn'],
  ['engste Austrittsöffnung (CSS)', '紧边排矿口 / closed side setting', 'Bestimmt Kornfeinheit und Durchsatz'],
  ['maximale Aufgabegröße', '给料最大粒度 / max feed size', 'Ein Kegelbrecher ist eine Mittel-/Feinbrechmaschine — über ca. 350 mm wird abgelehnt'],
  ['Durchsatz', '处理量 / capacity t/h', 'Aus der MACKORN-Kerntabelle für jede Kammer × CSS'],
  ['Zerkleinerungsverhältnis', '破碎比 / reduction ratio', 'Aufgabe- zu Produktkorngröße'],
  ['Standzeit der Verschleißteile', '衬板寿命 / liner life', 'Weibull-Auswertung; B10 ≠ Wechselzeitpunkt'],
  ['Kreislaufbelastung', '循环负荷 / circulating load', 'Bei geschlossenem Kreislauf mit Sieb'],
  ['Siebanlage', '振动筛 / vibrating screen', 'Wird im gleichen Los wie der Brecher beschafft'],
  ['Aufbereitungstechnik', '选矿 / mineral processing', 'Erzaufbereitung, Flotation, Mahlung'],
];

const FAQ = [
  ['Welcher Kegelbrecher passt zu 500 t/h?', 'Das Werkzeug mackorn_cone_selection prüft alle 13 Modelle der NH- (Standard) und NS- (Hochgeschwindigkeits-) Reihe, sortiert die Kandidaten nach Auslastung und gibt Modell, Kammer, CSS, Antriebsleistung und Stückzahl aus. Beispiel: 500 t/h bei 300 mm Aufgabegröße → NS400 (193–598 t/h, 250 kW).'],
  ['Warum darf ein Kegelbrecher kein 700-mm-Material aufnehmen?', 'Ein Kegelbrecher ist eine Mittel- und Feinbrechmaschine. Die größte Aufgabeöffnung der NH/NS-Reihe liegt bei etwa 350 mm. Größeres Material muss vorher mit einem Backenbrecher oder Kreiselbrecher vorzerkleinert werden. Das Werkzeug verweigert die Auslegung nicht, warnt aber ausdrücklich und rechnet nach Durchsatz statt nach Aufgabegröße.'],
  ['Was ist die CSS und wie wird sie gewählt?', 'Die engste Austrittsöffnung (CSS) bestimmt Kornfeinheit und Durchsatz. Jedes Modell hat einen zulässigen Bereich (z. B. NH400: 8–44 mm). Eine kleinere CSS bedeutet feineres Produkt, aber geringeren Durchsatz und höheren Verschleiß.'],
  ['Wie wird die Standzeit der Verschleißteile ausgewertet?', 'MACKORN nutzt eine Zwei-Parameter-Weibull-Verteilung mit Median-Rang-Schätzung. Wichtig: B10 ist ein Wert für die Ersatzteilbevorratung, nicht der Wechselzeitpunkt. Der optimale Wechselzeitpunkt folgt aus dem Barlow-Proschan-Modell (Altersersetzung) — bei β=2, η=8000 h und c_f/c_p=5 ergibt sich T*=4080 h bei B10=2597 h; ein Wechsel nach B10 verschwendet rund 36 % der Standzeit.'],
  ['Wie genau sind die Simulationsergebnisse?', 'Das Werkzeug nutzt das stationäre Kegelbrechermodell nach Whiten (1972) und die Bond-Mahlarbeit (1952) — beides veröffentlichte Literatur, unabhängig implementiert, MIT-Lizenz, vollständig nachprüfbar. Die Bruchfunktionsparameter sind Literaturwerte und müssen mit den eigenen Messdaten kalibriert werden.'],
  ['Enthält das Plugin Preise?', 'Nein. Weder das Plugin noch dieser MCP-Endpunkt geben Preise oder Angebote aus. Preisangaben erhalten Sie direkt vom MACKORN-Vertrieb.'],
  ['Wie rufe ich das Plugin von einem KI-Assistenten aus auf?', 'Über den MCP-Endpunkt: POST https://mackorn.cn/ai/api/mcp.php mit JSON-RPC 2.0. Alternativ lokal: node plugin/mcp-server.mjs (MCP über stdio) oder npm i mackorn-cone-crusher.'],
];

const LD = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', name: C.company, alternateName: C.companyCn, url: C.site, address: { '@type': 'PostalAddress', streetAddress: C.address, addressCountry: 'CN' }, sameAs: ['https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher'] },
    { '@type': 'SoftwareApplication', name: 'MACKORN Hydraulic Cone Crusher Selection Plugin', applicationCategory: 'BusinessApplication', operatingSystem: 'Windows, macOS, Linux', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, softwareVersion: '0.0.9', license: 'https://opensource.org/licenses/MIT', url: BASE + '/ai/' },
    { '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ],
};

const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLE}</title>
<meta name="description" content="${DESC}">
<meta name="keywords" content="${KW.join(',')}">
<link rel="canonical" href="${BASE}/ai/de/">
<link rel="alternate" hreflang="de" href="${BASE}/ai/de/">
<link rel="alternate" hreflang="x-default" href="${BASE}/ai/">
<script type="application/ld+json">${JSON.stringify(LD)}</script>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;max-width:960px;margin:0 auto;padding:32px 24px 80px;line-height:1.75;color:#16202E;background:#fff}
h1{font-size:28px;color:#0A2A4F;margin:0 0 8px;line-height:1.35}
h2{font-size:20px;color:#0A2A4F;margin:40px 0 12px;padding-bottom:8px;border-bottom:2px solid #E8F0F8}
h3{font-size:16px;color:#1B6CB5;margin:24px 0 8px}
.sub{color:#5A6B80;font-size:15px;margin:0 0 24px}
.box{background:#F4F8FC;border-left:4px solid #1B6CB5;padding:18px 22px;border-radius:0 10px 10px 0;margin:20px 0}
.warn{background:#FFF8EE;border-left-color:#E8A33D}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
th{background:#0A2A4F;color:#fff;text-align:left;padding:10px 12px;font-weight:600}
td{border-bottom:1px solid #E8F0F8;padding:10px 12px;vertical-align:top}
code{background:#F4F8FC;padding:2px 7px;border-radius:4px;font-size:13px;font-family:"SF Mono",Consolas,monospace}
pre{background:#0A2A4F;color:#E8F0F8;padding:16px 20px;border-radius:10px;overflow-x:auto;font-size:13px;line-height:1.6}
a{color:#1B6CB5}
ul{padding-left:22px}li{margin:6px 0}
.faq{border-bottom:1px solid #E8F0F8;padding:16px 0}
.faq b{color:#0A2A4F;display:block;margin-bottom:6px}
.ft{margin-top:56px;padding-top:20px;border-top:1px solid #E8F0F8;color:#5A6B80;font-size:13px}
.langs{margin:20px 0;font-size:14px;line-height:2}
.langs a{margin-right:14px;white-space:nowrap}
</style>
</head>
<body>

<h1>MACKORN KI-Auslegungsplugin<br>Hydraulikkegelbrecher &amp; Brech-Siebanlagen</h1>
<p class="sub">Ein Kundenanforderungsformular + eine Zielkapazität → Maschinenauswahl, Anlagenkonfiguration, Korngrößen-Simulation und ein 14-kapiteliges Projektierungsangebot. <strong>21 Werkzeuge · 6 Skills · MIT-Lizenz · keine Laufzeitabhängigkeiten.</strong></p>

<div class="box">
<strong>Für KI-Assistenten:</strong> Dieser Dienst ist über das MCP-Protokoll (Model Context Protocol) direkt aufrufbar — ohne Installation.<br>
<code>POST https://mackorn.cn/ai/api/mcp.php</code> · JSON-RPC 2.0 · Serverkennung <code>cn.mackorn/mackorn-cone-crusher</code>
</div>

<h2>Was das Plugin leistet</h2>
<ul>
<li><strong>Anforderungsaufnahme:</strong> Kundenformular (Word/PDF/Foto/Text) wird eingelesen; fehlende Felder werden mit konkreten Rückfragen benannt — es wird nie ein Wert geraten.</li>
<li><strong>Maschinenauswahl:</strong> Aus 13 Modellen (NH-Standardreihe und NS-Hochgeschwindigkeitsreihe) werden Modell, Brechkammer, CSS, Stückzahl und Antriebsleistung bestimmt.</li>
<li><strong>Anlagenkonfiguration:</strong> Zerkleinerungsstufen, Siebflächen, Gurtbreiten, Nebenaggregate.</li>
<li><strong>Korngrößen-Simulation:</strong> Stationäres Kegelbrechermodell nach Whiten (1972) und Bond-Mahlarbeit (1952) — veröffentlichte Literatur, unabhängig implementiert.</li>
<li><strong>Kalibrierung:</strong> Bruchfunktionsparameter werden mit eigenen Siebanalysen aus dem Werk per kleinster Fehlerquadrate rückgerechnet.</li>
<li><strong>Projektierungsangebot:</strong> 14 Kapitel, nach MACKORN-Standard.</li>
</ul>

<h2>Modellübersicht (Auszug)</h2>
<table>
<tr><th>Modell</th><th>max. Aufgabegröße</th><th>Leistung</th><th>Gewicht</th><th>Durchsatz</th></tr>
<tr><td>NH200</td><td>135 mm</td><td>90 kW</td><td>5.300 kg</td><td>25–125 t/h</td></tr>
<tr><td>NH300</td><td>185 mm</td><td>160 kW</td><td>9.200 kg</td><td>45–205 t/h</td></tr>
<tr><td>NH400</td><td>215 mm</td><td>250 kW</td><td>14.300 kg</td><td>87–394 t/h</td></tr>
<tr><td>NH600</td><td>275 mm</td><td>315 kW</td><td>26.800 kg</td><td>160–659 t/h</td></tr>
</table>
<p style="font-size:13px;color:#5A6B80">Vollständige Tabelle mit allen Kammern und CSS-Werten über das Werkzeug <code>mackorn_equipment_catalog</code> oder <code>mackorn_capacity_check</code>.</p>

<h2>Fachterminologie (Deutsch ↔ Chinesisch ↔ Englisch)</h2>
<table>
<tr><th>Deutsch</th><th>中文 / English</th><th>Bedeutung</th></tr>
${TERM_TABLE.map(([de, cn, note]) => `<tr><td><strong>${de}</strong></td><td>${cn}</td><td>${note}</td></tr>`).join('\n')}
</table>

<div class="box warn">
<strong>Fachlicher Hinweis zur Standzeit:</strong> B10 ist <em>kein</em> Wechselzeitpunkt. B10 dient der Ersatzteilbevorratung; der wirtschaftlich optimale Wechsel folgt aus dem Barlow-Proschan-Altersersetzungsmodell. Wird nach B10 gewechselt, bleibt ein erheblicher Teil der Standzeit ungenutzt.
</div>

<h2>Häufige Fragen</h2>
${FAQ.map(([q, a]) => `<div class="faq"><b>${q}</b>${a}</div>`).join('\n')}

<h2>Direkter Aufruf (Beispiele)</h2>
<pre># Werkzeugliste abrufen
curl -X POST ${BASE}/ai/api/mcp.php \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Auslegung: 500 t/h, Aufgabegröße 300 mm
curl -X POST ${BASE}/ai/api/mcp.php \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"mackorn_cone_selection",
                 "arguments":{"target_tph":500,"max_feed_mm":300}}}'</pre>

<h2>Weitere Sprachen</h2>
<p class="langs">
<a href="${BASE}/ai/">中文</a><a href="${BASE}/ai/en/">English</a><a href="${BASE}/ai/ru/">Русский</a><a href="${BASE}/ai/es/">Español</a><a href="${BASE}/ai/pt/">Português</a><a href="${BASE}/ai/fr/">Français</a><a href="${BASE}/ai/ar/">العربية</a><a href="${BASE}/ai/id/">Indonesia</a><a href="${BASE}/ai/ja/">日本語</a><a href="${BASE}/ai/de/">Deutsch</a><a href="${BASE}/ai/tr/">Türkçe</a><a href="${BASE}/ai/vi/">Tiếng Việt</a>
</p>

<h2>Kontakt</h2>
<table>
<tr><th>Firma</th><td>${C.company} (${C.companyCn})</td></tr>
<tr><th>Adresse</th><td>${C.address}</td></tr>
<tr><th>Web</th><td><a href="${C.site}">${C.site}</a></td></tr>
<tr><th>Vertrieb</th><td>Sandy Zhao · sandy.zhao@mackorn.cn · +86 139 1648 5025<br>Leif Dai · leif.dai@mackorn.cn · +86 134 8218 0158<br>Vicky Cheng · vicky.cheng@mackorn.cn · +86 158 0189 1052</td></tr>
<tr><th>Servicezeiten</th><td>GMT+8, 09:00–17:30</td></tr>
<tr><th>Vertretungen</th><td>Wir suchen Vertretungen, Handelsvertreter und Aufbereitungsspezialisten weltweit.</td></tr>
</table>

<div class="ft">
<strong>MACKORN</strong> · ${C.company} · Hydraulikkegelbrecher, Brechmantel und Verschleißteile, Brech- und Siebanlagen.<br>
Plugin: MIT-Lizenz · <a href="https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher">GitHub</a> · <a href="https://www.npmjs.com/package/mackorn-cone-crusher">npm</a> · MCP: <code>cn.mackorn/mackorn-cone-crusher</code><br>
Keine Preisangaben. Keine Rechtsberatung. Alle Zahlen mit Quellenangabe; unbekannte Werte werden als <code>null</code> zurückgegeben, nicht geschätzt.
</div>

</body>
</html>
`;

writeFileSync(join(OUT, 'index.html'), html, 'utf8');
console.log('  ✅ /ai/de/index.html  ' + (html.length / 1024).toFixed(1) + ' KB');
console.log('     FAQ ' + FAQ.length + ' 组 · 术语 ' + TERM_TABLE.length + ' 条 · 关键词 ' + KW.length + ' 个');
console.log('     德语本地化术语：Kegelbrecher / Brechmantel / Brechschale / Brechkammer / engste Austrittsöffnung');
