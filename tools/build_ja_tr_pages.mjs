/**
 * 补齐日语 /ai/ja/ 与土耳其语 /ai/tr/ 页面 —— 让"12 语言"名副其实
 *
 * 现状核查：语言页只有 ar en es fr id pt ru vi（8 个）+ de（本轮）= 9
 *           缺 ja 与 tr —— 但术语表/关键词表都声称 12 语言。这是不一致。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'distribution', '官网落地页');
const BASE = 'https://mackorn.cn';

const C = {
  company: 'Shanghai Mackorn Minerals Co., Ltd.',
  companyCn: '上海美矿机械股份有限公司',
  address: 'Qianjiang Road 33, Liuhe, Taicang, Suzhou, Jiangsu, China',
  contacts: 'Sandy Zhao · sandy.zhao@mackorn.cn · +86 139 1648 5025<br>Leif Dai · leif.dai@mackorn.cn · +86 134 8218 0158<br>Vicky Cheng · vicky.cheng@mackorn.cn · +86 158 0189 1052',
};

const LANGS = {
  en: 'English', ru: 'Русский', es: 'Español', pt: 'Português', fr: 'Français',
  ar: 'العربية', id: 'Indonesia', ja: '日本語', de: 'Deutsch', tr: 'Türkçe',
  vi: 'Tiếng Việt', zh: '中文',
};
const langBar = () => Object.entries(LANGS).map(([k, v]) =>
  `<a href="${BASE}/ai/${k === 'zh' ? '' : k + '/'}">${v}</a>`).join('');

const CSS = `body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Yu Gothic","Meiryo","Hiragino Kaku Gothic ProN",sans-serif;max-width:960px;margin:0 auto;padding:32px 24px 80px;line-height:1.8;color:#16202E;background:#fff}
h1{font-size:28px;color:#0A2A4F;margin:0 0 8px;line-height:1.4}
h2{font-size:20px;color:#0A2A4F;margin:40px 0 12px;padding-bottom:8px;border-bottom:2px solid #E8F0F8}
.sub{color:#5A6B80;font-size:15px;margin:0 0 24px}
.box{background:#F4F8FC;border-left:4px solid #1B6CB5;padding:18px 22px;border-radius:0 10px 10px 0;margin:20px 0}
.warn{background:#FFF8EE;border-left-color:#E8A33D}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
th{background:#0A2A4F;color:#fff;text-align:left;padding:10px 12px;font-weight:600}
td{border-bottom:1px solid #E8F0F8;padding:10px 12px;vertical-align:top}
code{background:#F4F8FC;padding:2px 7px;border-radius:4px;font-size:13px;font-family:"SF Mono",Consolas,monospace}
pre{background:#0A2A4F;color:#E8F0F8;padding:16px 20px;border-radius:10px;overflow-x:auto;font-size:13px;line-height:1.6}
a{color:#1B6CB5}ul{padding-left:22px}li{margin:6px 0}
.faq{border-bottom:1px solid #E8F0F8;padding:16px 0}.faq b{color:#0A2A4F;display:block;margin-bottom:6px}
.ft{margin-top:56px;padding-top:20px;border-top:1px solid #E8F0F8;color:#5A6B80;font-size:13px}
.langs{margin:20px 0;font-size:14px;line-height:2}.langs a{margin-right:14px;white-space:nowrap}`;

/* ─────────────────────────── 日语 ─────────────────────────── */
const JA = {
  title: 'MACKORN AI選定プラグイン — 油圧コーンクラッシャー・破砕筛分プラント設計 | 上海美矿',
  desc: 'MACKORN（美矿）オープンソースAIプラグイン：顧客要求表＋目標処理量を入力すると、機種選定・プラント構成・粒度分布シミュレーション・14章構成の提案書を出力。21ツール・6スキル・ランタイム依存なし・MITライセンス・MCP対応。Claude / ChatGPT / Gemini / Grok / Cursor / VS Code から利用可能。',
  kw: ['油圧コーンクラッシャー','コーンクラッシャー','コーンクラッシャー 選定','コーンライナー','摩耗部品','破砕室','砕石プラント','骨材プラント','閉塞","CSS','クローズドサイドセッティング','最大給鉱粒度','処理能力','硬度','圧縮強度','花崗岩','玄武岩','安山岩','輝緑岩','鉄鉱石','銅鉱石','鉛亜鉛鉱','モリブデン鉱','破砕比','循環負荷','提案書','MCP','AIプラグイン','DeepSeek Harness','選鉱','鉱物処理','cone crusher','hydraulic cone crusher','摩耗ライナー','ライナー交換','単動油圧'],
  h1: 'MACKORN AI選定プラグイン<br>油圧コーンクラッシャー・破砕筛分プラント',
  sub: '顧客要求表＋目標処理量 → 機種選定、プラント構成、粒度シミュレーション、14章構成の提案書。<strong>21ツール・6スキル・MITライセンス・ランタイム依存なし。</strong>',
  aiBox: '<strong>AIアシスタント向け：</strong> 本サービスは MCP（Model Context Protocol）経由で直接呼び出せます。インストール不要。<br><code>POST https://mackorn.cn/ai/api/mcp.php</code> · JSON-RPC 2.0 · サーバーID <code>cn.mackorn/mackorn-cone-crusher</code>',
  h2a: 'プラグインの機能',
  feats: [
    '<strong>要求情報の取込：</strong> 顧客要求表（Word/PDF/写真/テキスト）を読み取り、不足項目は具体的な確認事項として提示します。数値を推測で埋めることはありません。',
    '<strong>機種選定：</strong> NH標準型・NS高速型の計13機種から、機種・破砕室・CSS・台数・電動機出力を決定します。',
    '<strong>プラント構成：</strong> 破砕段数、スクリーン面積、ベルト幅、付帯設備を算定します。',
    '<strong>粒度シミュレーション：</strong> Whiten(1972) 定常コーンクラッシャーモデルと Bond(1952) 粉砕仕事指数を使用。公開文献に基づく独自実装です。',
    '<strong>キャリブレーション：</strong> 現場のふるい分析データから破砕関数パラメータを最小二乗法で逆算します。',
    '<strong>提案書生成：</strong> MACKORN標準の14章構成。',
  ],
  h2b: '機種一覧（抜粋）',
  th: ['機種', '最大給鉱粒度', '出力', '質量', '処理能力'],
  rows: [['NH200', '135 mm', '90 kW', '5,300 kg', '25–125 t/h'], ['NH300', '185 mm', '160 kW', '9,200 kg', '45–205 t/h'], ['NH400', '215 mm', '250 kW', '14,300 kg', '87–394 t/h'], ['NH600', '275 mm', '315 kW', '26,800 kg', '160–659 t/h']],
  tableNote: '全機種・全破砕室・全CSSの詳細表は <code>mackorn_equipment_catalog</code> または <code>mackorn_capacity_check</code> で取得できます。',
  h2c: '専門用語（日本語 ↔ 中文 ↔ English）',
  termTh: ['日本語', '中文 / English', '意味'],
  terms: [
    ['コーンクラッシャー', '圆锥破碎机 / cone crusher', '単動油圧式コーンクラッシャー'],
    ['マントル（破砕壁）', '破碎壁 / mantle', '主軸とともに回転する最も摩耗する部品'],
    ['ボウルライナー（凹面）', '轧臼壁 / bowl liner', '固定側。マントルとともに破砕室を形成'],
    ['破砕室（キャビティ）', '破碎腔型 / crushing chamber', 'EC · C · MC · M · MF · F · EF — 給鉱粒度と製品粒度で選定'],
    ['CSS（閉塞側排鉱口）', '紧边排矿口 / closed side setting', '製品粒度と処理能力を決定'],
    ['最大給鉱粒度', '给料最大粒度 / max feed size', 'コーンクラッシャーは中・細砕機です。約350mm超は適用外'],
    ['処理能力', '处理量 / capacity t/h', 'MACKORN 破砕室×CSS 詳細表から取得'],
    ['破砕比', '破碎比 / reduction ratio', '給鉱粒度 ÷ 製品粒度'],
    ['ライナー寿命', '衬板寿命 / liner life', 'ワイブル解析。B10 ≠ 交換時期'],
    ['循環負荷', '循环负荷 / circulating load', 'スクリーンとの閉回路時'],
    ['振動ふるい', '振动筛 / vibrating screen', '破砕機と同一案件で調達されることが多い'],
    ['選鉱', '选矿 / mineral processing', '鉱石処理、浮選、粉砕'],
  ],
  h2d: 'よくある質問',
  faq: [
    ['500 t/h にはどのコーンクラッシャーが適しますか？', 'ツール mackorn_cone_selection が NH/NS 全13機種を照合し、稼働率順に候補を並べ、機種・破砕室・CSS・出力・台数を出力します。例：500 t/h、給鉱300mm → NS400（193–598 t/h、250 kW）。'],
    ['なぜ700mmの給鉱を受け入れられないのですか？', 'コーンクラッシャーは中・細砕機です。NH/NS の最大給鉱は約350mmです。それより粗い場合はジョークラッシャーやジャイレトリクラッシャーで粗砕してください。ツールは選定を拒否せず、明確に警告した上で処理能力から逆算します。'],
    ['CSS とは何で、どう決めますか？', 'CSS（閉塞側排鉱口）は製品粒度と処理能力を決めます。機種ごとに許容範囲があります（例：NH400 は 8–44 mm）。CSS を小さくすると製品は細かくなりますが、処理能力は下がり摩耗は増えます。'],
    ['ライナー寿命はどう評価しますか？', '2パラメータワイブル分布とメディアンランク法を使用します。重要：B10 は交換時期ではありません。B10 はスペア部品の保有数決めに使う値です。最適交換時期は Barlow-Proschan の年齢交換モデルから求めます。β=2、η=8000h、c_f/c_p=5 の場合、T*=4080h に対し B10=2597h で、B10 で交換すると寿命の約36%を無駄にします。'],
    ['シミュレーション結果の精度は？', 'Whiten(1972) の定常モデルと Bond(1952) の粉砕仕事指数を用いています。いずれも公開文献であり、独自実装・MITライセンス・完全に検証可能です。破砕関数パラメータは文献値であり、自社の実測データでキャリブレーションが必要です。'],
    ['価格は含まれますか？', 'いいえ。プラグインも本 MCP エンドポイントも価格・見積を出力しません。価格は MACKORN 営業へ直接お問い合わせください。'],
    ['AIアシスタントからどう呼び出しますか？', 'MCP エンドポイント経由：<code>POST https://mackorn.cn/ai/api/mcp.php</code>（JSON-RPC 2.0）。ローカル実行も可能：<code>node plugin/mcp-server.mjs</code> または <code>npm i mackorn-cone-crusher</code>。'],
  ],
  warnTitle: 'ライナー寿命に関する重要注意：',
  warn: 'B10 は交換時期<em>ではありません</em>。B10 はスペア部品の保有数決めに使う値です。経済的に最適な交換時期は Barlow-Proschan の年齢交換モデルから求めます。B10 で交換すると、かなりの寿命が未使用のまま残ります。',
  h2e: '直接呼び出しの例',
  h2f: 'その他の言語',
  h2g: 'お問い合わせ',
  ct: ['会社', '所在地', 'ウェブ', '営業', '営業時間', '代理店'],
  cv: [C.company + '（' + C.companyCn + '）', C.address, '<a href="' + BASE + '">' + BASE + '</a>', C.contacts, 'GMT+8 09:00–17:30', '世界各国の代理店・販売代理店・選鉱技術者を募集しています。'],
  ft: '<strong>MACKORN</strong> · ' + C.company + ' · 油圧コーンクラッシャー、マントル・摩耗部品、破砕筛分プラント。<br>プラグイン：MITライセンス · <a href="https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher">GitHub</a> · <a href="https://www.npmjs.com/package/mackorn-cone-crusher">npm</a> · MCP: <code>cn.mackorn/mackorn-cone-crusher</code><br>価格の提示は行いません。法的助言ではありません。すべての数値に出典を付し、不明値は <code>null</code> を返し推測しません。',
  code: `# ツール一覧を取得
curl -X POST ${BASE}/ai/api/mcp.php \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# 選定：500 t/h、給鉱粒度 300 mm
curl -X POST ${BASE}/ai/api/mcp.php \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"mackorn_cone_selection",
                 "arguments":{"target_tph":500,"max_feed_mm":300}}}'`,
  lang: 'ja',
};

/* ─────────────────────────── 土耳其语 ─────────────────────────── */
const TR = {
  title: 'MACKORN Yapay Zekâ Seçim Eklentisi — Hidrolik Konik Kırıcı ve Kırma-Eleme Tesisi Tasarımı | Shanghai Mackorn',
  desc: 'MACKORN (美矿) açık kaynak yapay zekâ eklentisi: Müşteri talep formu + hedef kapasite girilir; makine seçimi, tesis konfigürasyonu, tane boyutu simülasyonu ve 14 bölümlü teklif dokümanı üretilir. 21 araç, 6 yetenek, çalışma zamanı bağımlılığı yok, MIT lisansı, MCP protokolü — Claude / ChatGPT / Gemini / Grok / Cursor / VS Code tarafından kullanılabilir.',
  kw: ['hidrolik konik kırıcı','konik kırıcı','konik kırıcı seçimi','konik kırıcı astarı','aşınma parçaları','kırma odası','kırma eleme tesisi','agrega tesisi','kavrama','CSS','kapalı taraf açıklığı','maksimum besleme boyutu','kapasite','sertlik','basınç dayanımı','granit','bazalt','andezit','diyabaz','demir cevheri','bakır cevheri','kurşun çinko cevheri','molibden cevheri','kırma oranı','sirkülasyon yükü','teklif','MCP','yapay zeka eklentisi','DeepSeek Harness','cevher zenginleştirme','mineral işleme','cone crusher','hydraulic cone crusher','astar ömrü','astar değişimi','tek silindirli'],
  h1: 'MACKORN Yapay Zekâ Seçim Eklentisi<br>Hidrolik Konik Kırıcı ve Kırma-Eleme Tesisi',
  sub: 'Müşteri talep formu + hedef kapasite → makine seçimi, tesis konfigürasyonu, tane boyutu simülasyonu ve 14 bölümlü teklif.<strong>21 araç · 6 yetenek · MIT lisansı · çalışma zamanı bağımlılığı yok.</strong>',
  aiBox: '<strong>Yapay zekâ asistanları için:</strong> Bu hizmet MCP (Model Context Protocol) üzerinden doğrudan çağrılabilir — kurulum gerekmez.<br><code>POST https://mackorn.cn/ai/api/mcp.php</code> · JSON-RPC 2.0 · Sunucu kimliği <code>cn.mackorn/mackorn-cone-crusher</code>',
  h2a: 'Eklentinin yaptıkları',
  feats: [
    '<strong>Talep alımı:</strong> Müşteri talep formu (Word/PDF/fotoğraf/metin) okunur; eksik alanlar somut sorular hâlinde bildirilir. Hiçbir değer tahminle doldurulmaz.',
    '<strong>Makine seçimi:</strong> NH standart ve NS yüksek hızlı serilerden toplam 13 model içinden model, kırma odası, CSS, adet ve motor gücü belirlenir.',
    '<strong>Tesis konfigürasyonu:</strong> Kırma kademeleri, elek alanı, bant genişliği ve yardımcı ekipman hesaplanır.',
    '<strong>Tane boyutu simülasyonu:</strong> Whiten (1972) kararlı durum konik kırıcı modeli ve Bond (1952) öğütme iş indeksi kullanılır. Yayımlanmış literatüre dayalı, bağımsız uygulama.',
    '<strong>Kalibrasyon:</strong> Saha elek analizi verilerinden kırma fonksiyonu parametreleri en küçük kareler yöntemiyle geri hesaplanır.',
    '<strong>Teklif üretimi:</strong> MACKORN standardında 14 bölüm.',
  ],
  h2b: 'Model listesi (özet)',
  th: ['Model', 'Maks. besleme', 'Güç', 'Ağırlık', 'Kapasite'],
  rows: [['NH200', '135 mm', '90 kW', '5.300 kg', '25–125 t/s'], ['NH300', '185 mm', '160 kW', '9.200 kg', '45–205 t/s'], ['NH400', '215 mm', '250 kW', '14.300 kg', '87–394 t/s'], ['NH600', '275 mm', '315 kW', '26.800 kg', '160–659 t/s']],
  tableNote: 'Tüm modeller, tüm kırma odaları ve tüm CSS değerleri için <code>mackorn_equipment_catalog</code> veya <code>mackorn_capacity_check</code> araçlarını kullanın.',
  h2c: 'Teknik terimler (Türkçe ↔ 中文 ↔ English)',
  termTh: ['Türkçe', '中文 / English', 'Anlamı'],
  terms: [
    ['Konik kırıcı', '圆锥破碎机 / cone crusher', 'Tek silindirli hidrolik konik kırıcı'],
    ['Manto (kırma konisi)', '破碎壁 / mantle', 'Ana mille birlikte döner; en çok aşınan parça'],
    ['Kırma çanağı (konkav)', '轧臼壁 / bowl liner', 'Sabit taraf; manto ile kırma odasını oluşturur'],
    ['Kırma odası (kavite)', '破碎腔型 / crushing chamber', 'EC · C · MC · M · MF · F · EF — besleme ve ürün boyutuna göre'],
    ['CSS (kapalı taraf açıklığı)', '紧边排矿口 / closed side setting', 'Ürün inceliğini ve kapasiteyi belirler'],
    ['Maksimum besleme boyutu', '给料最大粒度 / max feed size', 'Konik kırıcı orta/ince kırıcıdır; ~350 mm üzeri kabul edilmez'],
    ['Kapasite', '处理量 / capacity t/h', 'MACKORN kavite × CSS tablosundan alınır'],
    ['Kırma oranı', '破碎比 / reduction ratio', 'Besleme boyutu ÷ ürün boyutu'],
    ['Astar ömrü', '衬板寿命 / liner life', 'Weibull analizi; B10 ≠ değişim zamanı'],
    ['Sirkülasyon yükü', '循环负荷 / circulating load', 'Elek ile kapalı devre hâlinde'],
    ['Titreşimli elek', '振动筛 / vibrating screen', 'Genellikle kırıcı ile aynı ihalede alınır'],
    ['Cevher zenginleştirme', '选矿 / mineral processing', 'Cevher işleme, flotasyon, öğütme'],
  ],
  h2d: 'Sık sorulan sorular',
  faq: [
    ['500 t/s için hangi konik kırıcı uygundur?', 'mackorn_cone_selection aracı NH/NS serilerinin 13 modelini tarar, adayları doluluk oranına göre sıralar ve model, kırma odası, CSS, güç ile adet bilgisini verir. Örnek: 500 t/s, 300 mm besleme → NS400 (193–598 t/s, 250 kW).'],
    ['Neden 700 mm besleme kabul edilmiyor?', 'Konik kırıcı orta ve ince kırma makinesidir. NH/NS serisinin en büyük besleme açıklığı yaklaşık 350 mm\'dir. Daha kaba malzeme önce çeneli veya döner kırıcı ile ön kırma yapılmalıdır. Araç seçimi reddetmez; açıkça uyarır ve kapasiteye göre geri hesaplar.'],
    ['CSS nedir ve nasıl seçilir?', 'CSS (kapalı taraf açıklığı) ürün inceliğini ve kapasiteyi belirler. Her modelin izin verilen aralığı vardır (örn. NH400: 8–44 mm). Daha küçük CSS daha ince ürün verir ancak kapasiteyi düşürür ve aşınmayı artırır.'],
    ['Astar ömrü nasıl değerlendirilir?', 'İki parametreli Weibull dağılımı ve medyan rank yöntemi kullanılır. Önemli: B10 değişim zamanı değildir. B10 yedek parça stok seviyesi içindir. Ekonomik olarak en uygun değişim zamanı Barlow-Proschan yaş değiştirme modelinden bulunur. β=2, η=8000 sa, c_f/c_p=5 için T*=4080 sa iken B10=2597 sa\'dir; B10\'a göre değiştirmek ömrün yaklaşık %36\'sını boşa harcar.'],
    ['Simülasyon sonuçları ne kadar doğru?', 'Whiten (1972) kararlı durum modeli ve Bond (1952) iş indeksi kullanılır. Her ikisi de yayımlanmış literatürdür; bağımsız uygulanmış, MIT lisanslı ve tamamen denetlenebilirdir. Kırma fonksiyonu parametreleri literatür değerleridir ve kendi ölçüm verilerinizle kalibre edilmelidir.'],
    ['Fiyat bilgisi var mı?', 'Hayır. Ne eklenti ne de bu MCP uç noktası fiyat veya teklif üretir. Fiyat için doğrudan MACKORN satış ile iletişime geçin.'],
    ['Bir yapay zekâ asistanından nasıl çağırırım?', 'MCP uç noktası üzerinden: <code>POST https://mackorn.cn/ai/api/mcp.php</code> (JSON-RPC 2.0). Yerel çalıştırma: <code>node plugin/mcp-server.mjs</code> veya <code>npm i mackorn-cone-crusher</code>.'],
  ],
  warnTitle: 'Astar ömrü hakkında önemli uyarı:',
  warn: 'B10 değişim zamanı <em>değildir</em>. B10 yedek parça stok seviyesi için kullanılır. Ekonomik olarak en uygun değişim zamanı Barlow-Proschan yaş değiştirme modelinden bulunur. B10\'a göre değiştirmek, ömrün önemli bir kısmını kullanılmadan bırakır.',
  h2e: 'Doğrudan çağrı örnekleri',
  h2f: 'Diğer diller',
  h2g: 'İletişim',
  ct: ['Şirket', 'Adres', 'Web', 'Satış', 'Çalışma saatleri', 'Bayilik'],
  cv: [C.company + ' (' + C.companyCn + ')', C.address, '<a href="' + BASE + '">' + BASE + '</a>', C.contacts, 'GMT+8 09:00–17:30', 'Dünya genelinde bayilik, temsilcilik ve cevher zenginleştirme uzmanı arıyoruz.'],
  ft: '<strong>MACKORN</strong> · ' + C.company + ' · Hidrolik konik kırıcı, manto ve aşınma parçaları, kırma-eleme tesisi.<br>Eklenti: MIT lisansı · <a href="https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher">GitHub</a> · <a href="https://www.npmjs.com/package/mackorn-cone-crusher">npm</a> · MCP: <code>cn.mackorn/mackorn-cone-crusher</code><br>Fiyat verilmez. Hukuki tavsiye değildir. Tüm sayılar kaynaklıdır; bilinmeyen değerler tahmin edilmez, <code>null</code> döndürülür.',
  code: `# Araç listesini al
curl -X POST ${BASE}/ai/api/mcp.php \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Seçim: 500 t/s, besleme 300 mm
curl -X POST ${BASE}/ai/api/mcp.php \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"mackorn_cone_selection",
                 "arguments":{"target_tph":500,"max_feed_mm":300}}}'`,
  lang: 'tr',
};

function build(L) {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: C.company, alternateName: C.companyCn, url: BASE, address: { '@type': 'PostalAddress', streetAddress: C.address, addressCountry: 'CN' }, sameAs: ['https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher'] },
      { '@type': 'SoftwareApplication', name: 'MACKORN Hydraulic Cone Crusher Selection Plugin', applicationCategory: 'BusinessApplication', operatingSystem: 'Windows, macOS, Linux', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, softwareVersion: '0.0.9', license: 'https://opensource.org/licenses/MIT', url: BASE + '/ai/' },
      { '@type': 'FAQPage', mainEntity: L.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) },
    ],
  };
  return `<!DOCTYPE html>
<html lang="${L.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${L.title}</title>
<meta name="description" content="${L.desc}">
<meta name="keywords" content="${L.kw.join(',')}">
<link rel="canonical" href="${BASE}/ai/${L.lang}/">
<link rel="alternate" hreflang="${L.lang}" href="${BASE}/ai/${L.lang}/">
<link rel="alternate" hreflang="x-default" href="${BASE}/ai/">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${CSS}</style>
</head>
<body>

<h1>${L.h1}</h1>
<p class="sub">${L.sub}</p>

<div class="box">${L.aiBox}</div>

<h2>${L.h2a}</h2>
<ul>${L.feats.map((f) => '<li>' + f + '</li>').join('')}</ul>

<h2>${L.h2b}</h2>
<table>
<tr>${L.th.map((h) => '<th>' + h + '</th>').join('')}</tr>
${L.rows.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('\n')}
</table>
<p style="font-size:13px;color:#5A6B80">${L.tableNote}</p>

<h2>${L.h2c}</h2>
<table>
<tr>${L.termTh.map((h) => '<th>' + h + '</th>').join('')}</tr>
${L.terms.map(([t, cn, note]) => `<tr><td><strong>${t}</strong></td><td>${cn}</td><td>${note}</td></tr>`).join('\n')}
</table>

<div class="box warn">
<strong>${L.warnTitle}</strong> ${L.warn}
</div>

<h2>${L.h2d}</h2>
${L.faq.map(([q, a]) => `<div class="faq"><b>${q}</b>${a}</div>`).join('\n')}

<h2>${L.h2e}</h2>
<pre>${L.code}</pre>

<h2>${L.h2f}</h2>
<p class="langs">${langBar()}</p>

<h2>${L.h2g}</h2>
<table>
${L.ct.map((h, i) => `<tr><th>${h}</th><td>${L.cv[i]}</td></tr>`).join('\n')}
</table>

<div class="ft">${L.ft}</div>

</body>
</html>
`;
}

for (const [code, L] of [['ja', JA], ['tr', TR]]) {
  const dir = join(SRC, 'ai', code);
  mkdirSync(dir, { recursive: true });
  const html = build(L);
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
  console.log('  ✅ /ai/' + code + '/index.html  ' + (html.length / 1024).toFixed(1) + ' KB  ·  FAQ ' + L.faq.length + ' 组 · 术语 ' + L.terms.length + ' 条 · 关键词 ' + L.kw.length + ' 个');
}
