/**
 * 补齐重点国家测试发现的缺口
 *   ① 缺词：d'or · phosphate · uranium · beneficiation · erdenet · الذهب · الركام
 *   ② 越南（vi）语言页缺失
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');
const BASE = 'https://mackorn.cn';

/* ── ① 补缺词到关键词门禁 ── */
const GATE = join(ROOT, 'tools', 'keyword_gate.mjs');
let g = readFileSync(GATE, 'utf8');
const adds = [
  // 西语/法语：金矿说法
  ['  fr: [', null],  // 占位，下面按组插入
];
// 在对应语言组末尾追加
function addTo(lang, words) {
  const re = new RegExp("(\\n\\s{4}" + lang.replace('-', '\\-') + ": \\[[\\s\\S]*?)(\\],)");
  const m = g.match(re);
  if (!m) { console.log('  ⚠ 未找到语言组 ' + lang); return false; }
  const add = '\n    ' + words.map((w) => "'" + w.replace(/'/g, "\\'") + "'").join(', ') + ',';
  g = g.replace(m[0], m[1] + add + m[2]);
  return true;
}
let n = 0;
if (addTo('fr', ["mine d'or", 'or', 'phosphate', 'uranium', 'beneficiation', 'usine de traitement'])) n++;
if (addTo('es', ['oro', 'planta concentradora', 'beneficio de minerales'])) n++;
if (addTo('ar', ['الذهب', 'الركام', 'معالجة الخام'])) n++;
if (addTo('en', ['Erdenet', 'Oyu Tolgoi', 'beneficiation', 'ore dressing', 'concentrator'])) n++;
if (addTo('pt', ['ouro', 'beneficiamento', 'usina de beneficiamento'])) n++;
if (addTo('id', ['emas', 'pengolahan bijih', 'pabrik pengolahan'])) n++;
if (addTo('ru', ['золото', 'обогатительная фабрика', 'переработка руды'])) n++;
if (addTo('vi', ['vàng', 'tuyển quặng', 'nhà máy tuyển'])) n++;
writeFileSync(GATE, g, 'utf8');
console.log('  ✅ 关键词补强 ' + n + ' 个语言组（金矿/磷酸盐/铀/选矿/矿区名）');

/* ── ② 越南语言页 ── */
const VI = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Máy nghiền côn thủy lực &amp; Dây chuyền nghiền sàng | MACKORN</title>
<meta name="description" content="MACKORN (Thượng Hải Mackorn Minerals) — nhà sản xuất máy nghiền côn thủy lực và dây chuyền nghiền sàng. Lựa chọn model, khoang nghiền, khe xả (CSS), số lượng máy và công suất; sàng rung; phụ tùng mài mòn. Công cụ chọn máy mã nguồn mở (21 công cụ MCP).">
<meta name="keywords" content="máy nghiền côn,máy nghiền côn thủy lực,nghiền côn,máy nghiền hàm,sàng rung,dây chuyền nghiền đá,nghiền sàng,phụ tùng mài mòn,nón nghiền,lót chảo,khe xả,CSS,tỷ số nghiền,tải tuần hoàn,quặng sắt,quặng đồng,đá bazan,đá granit,lựa chọn,tính chọn,báo giá,MACKORN,美矿">
<meta name="robots" content="index,follow,max-snippet:-1">
<meta property="og:type" content="website">
<meta property="og:title" content="Máy nghiền côn thủy lực &amp; Dây chuyền nghiền sàng | MACKORN">
<meta property="og:description" content="Lựa chọn máy nghiền côn, thiết kế dây chuyền nghiền sàng, phụ tùng mài mòn.">
<meta property="og:url" content="${BASE}/vi/">
<link rel="canonical" href="${BASE}/vi/">
<link rel="alternate" hreflang="vi" href="${BASE}/vi/">
<link rel="alternate" type="application/json" href="${BASE}/.well-known/keywords.json">
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'WebPage', inLanguage: 'vi',
  name: 'Máy nghiền côn thủy lực MACKORN',
  description: 'Lựa chọn máy nghiền côn, thiết kế dây chuyền nghiền sàng, phụ tùng mài mòn.',
  url: `${BASE}/vi/`,
  publisher: { '@type': 'Organization', name: 'Shanghai Mackorn Minerals Co., Ltd.', url: BASE },
}, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: 'vi',
  mainEntity: [
    ['Máy nghiền côn là thiết bị nghiền gì?', 'Máy nghiền côn là thiết bị nghiền trung và nghiền mịn (cấp hai / cấp ba). Không thể tiếp nhận liệu có kích thước lớn hơn khoảng 350 mm — cần sàng trước hoặc dùng máy nghiền thô.'],
    ['Cần bao nhiêu cấp nghiền?', 'Số cấp do tổng tỷ số nghiền quyết định. Đến khoảng 6:1 dùng một cấp; đến 25:1 dùng hai cấp; đến 100:1 dùng ba cấp (phổ biến nhất); trên 100:1 dùng bốn cấp.'],
    ['Sàng rung và máy nghiền côn có liên quan gì?', 'Hai thiết bị tạo thành mạch kín: sản phẩm máy nghiền vào sàng để phân cấp, vật liệu trên sàng quay lại máy nghiền. Do đó sàng phải được chọn theo lưu lượng qua sàng (không phải theo liệu mới) — tải tuần hoàn thường 200-300%, lưu lượng qua sàng gấp 3-4 lần liệu mới.'],
    ['Làm sao chọn khoang nghiền?', 'Từ thô đến mịn: EC, C, MC (điểm khởi đầu phổ biến), M, MF, F, EF. Liệu càng thô chọn khoang càng về đầu danh sách; sản phẩm càng mịn chọn càng về cuối.'],
    ['Có công cụ tính toán không?', 'Có. Plugin mã nguồn mở MACKORN cung cấp 21 công cụ MCP: lựa chọn máy nghiền côn, thiết kế dây chuyền, mô phỏng cỡ hạt (Whiten 1972), năng lượng (Bond 1952), tuổi thọ lót, chi phí.'],
  ].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
}, null, 2)}
</script>
<style>
:root{--navy:#0A2A4F;--blue:#1B6CB5;--light:#F4F8FC;--line:#D9E5F2;--muted:#5A6B80}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#16202E;line-height:1.8}
.wrap{max-width:940px;margin:0 auto;padding:0 24px}
header{background:linear-gradient(140deg,#08213E,var(--blue));color:#fff;padding:48px 0 38px}
header h1{margin:0 0 12px;font-size:clamp(21px,3vw,28px);line-height:1.35}
header p{margin:0;opacity:.94;max-width:800px;font-size:15.5px}
section{padding:32px 0;border-bottom:1px solid var(--line)}
h2{font-size:20px;color:var(--navy);margin:0 0 16px;border-bottom:2px solid var(--blue);display:inline-block;padding-bottom:8px}
h3{font-size:16px;color:var(--navy);margin:20px 0 8px}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}
th,td{border:1px solid var(--line);padding:9px 11px;text-align:left;vertical-align:top}
th{background:var(--light);color:var(--navy)}
.box{background:var(--light);border-left:4px solid var(--blue);padding:15px 19px;border-radius:0 10px 10px 0;margin:17px 0}
.box.warn{background:#FFF8EE;border-left-color:#E8A33D}
a{color:var(--blue)}code{background:var(--light);padding:2px 5px;border-radius:3px;font-size:13px}
.btn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;margin:6px 10px 6px 0;font-weight:600;font-size:14.5px}
.btn.ghost{background:#fff;color:var(--blue);border:2px solid var(--blue)}
footer{background:#08213E;color:#B8CEE3;padding:26px 0;font-size:13.5px}
</style>
</head>
<body>
<header><div class="wrap">
<h1>Máy nghiền côn thủy lực &amp; Dây chuyền nghiền sàng</h1>
<p>MACKORN 美矿 (Thượng Hải Mackorn Minerals Co., Ltd.) — nhà sản xuất máy nghiền côn thủy lực một xi-lanh dòng NH/NS
và dây chuyền nghiền sàng hoàn chỉnh. Chọn máy, thiết kế dây chuyền, phụ tùng mài mòn, dịch vụ toàn vòng đời.</p>
</div></header>
<div class="wrap">

<section>
<h2>Máy nghiền côn — nguyên tắc chọn máy</h2>
<div class="box warn">
<strong>Máy nghiền côn là thiết bị nghiền trung và nghiền mịn.</strong>
Không thể tiếp nhận liệu lớn hơn khoảng <strong>350 mm</strong> — vượt quá giới hạn bảng khoang nghiền,
cần sàng trước hoặc máy nghiền thô (máy nghiền hàm / máy nghiền quay).
</div>
<table>
<tr><th>Cấp nghiền</th><th>Liệu vào (mm)</th><th>Sản phẩm (mm)</th><th>Tỷ số nghiền</th></tr>
<tr><td>Nghiền thô</td><td>800–1200</td><td>100–200</td><td>6–8 : 1</td></tr>
<tr><td>Nghiền trung (khoang thô)</td><td>150–300</td><td>40–70</td><td>4–6 : 1</td></tr>
<tr><td>Nghiền trung (khoang vừa)</td><td>75–200</td><td>20–50</td><td>3–5 : 1</td></tr>
<tr><td>Nghiền mịn</td><td>30–80</td><td>8–20</td><td>3–4 : 1</td></tr>
<tr><td>Làm cát</td><td>30–50</td><td>0–5</td><td>6–10 : 1</td></tr>
</table>
<p><strong>Số cấp do tổng tỷ số nghiền quyết định:</strong> ≤6 → 1 cấp · ≤25 → 2 cấp · ≤100 → 3 cấp (phổ biến nhất) · &gt;100 → 4 cấp</p>
</section>

<section>
<h2>Khoang nghiền</h2>
<table>
<tr><th>Mã</th><th>Tên</th><th>Ứng dụng</th></tr>
<tr><td>EC</td><td>Extra Coarse — rất thô</td><td>Chuẩn bị liệu cấp 1/2</td></tr>
<tr><td>C</td><td>Coarse — thô</td><td>Sản phẩm thô</td></tr>
<tr><td>MC</td><td>Medium Coarse — vừa thô</td><td><strong>Điểm khởi đầu phổ biến</strong></td></tr>
<tr><td>M</td><td>Medium — vừa</td><td>Bắt đầu nghiền mịn</td></tr>
<tr><td>MF</td><td>Medium Fine — vừa mịn</td><td>Nghiền vừa-mịn</td></tr>
<tr><td>F</td><td>Fine — mịn</td><td>Nghiền mịn</td></tr>
<tr><td>EF</td><td>Extra Fine — rất mịn</td><td>Trước làm cát</td></tr>
</table>
</section>

<section>
<h2>Sàng rung — cùng gói thầu với máy nghiền</h2>
<div class="box">
Máy nghiền và sàng tạo thành <strong>mạch kín</strong>. Vì vậy chúng thường nằm trong
<strong>cùng một gói thầu</strong>, và thông số giao diện (phân bố cỡ liệu, tải tuần hoàn,
kích thước lỗ sàng) phải được thiết kế thống nhất.
<br><br>
<strong>Điểm quan trọng:</strong> sàng phải chọn theo <strong>lưu lượng qua sàng</strong>,
không phải theo liệu mới. Khi mạch kín, tải tuần hoàn thường 200–300%,
lưu lượng qua sàng <strong>gấp 3–4 lần</strong> liệu mới.
<br><br>
Công thức: <code>Q = A × q × k1 × k2 × k3 × k4</code> (phương pháp VSMA / Karra).
</div>
</section>

<section>
<h2>Dây chuyền hoàn chỉnh</h2>
<div class="box">
Máy cấp liệu rung → <strong>Máy nghiền hàm (thô)</strong> → <strong>Máy tách từ</strong> (bắt buộc, giữa nghiền thô và trung) →
Sàng rung (sàng trước) → <strong>Máy nghiền côn thủy lực (trung)</strong> → Sàng rung (mạch kín) →
<strong>Máy nghiền côn thủy lực (mịn)</strong> → Sàng rung (sàng thành phẩm) →
Máy nghiền cát VSI (tùy chọn) → Băng tải → Kho thành phẩm
<br><br>
<strong>MACKORN cung cấp trọn dây chuyền</strong>, thông số giao diện giữa nghiền và sàng được thiết kế thống nhất.
</div>
</section>

<section>
<h2>Công cụ tính toán mã nguồn mở (21 công cụ MCP)</h2>
<table>
<tr><th>Công cụ</th><th>Chức năng</th></tr>
<tr><td><code>mackorn_cone_selection</code></td><td>Chọn model, khoang, CSS, số máy, công suất</td></tr>
<tr><td><code>mackorn_plant_design</code></td><td>Thiết kế dây chuyền: số cấp, diện tích sàng, bề rộng băng tải</td></tr>
<tr><td><code>mackorn_crusher_curve</code></td><td>Đường cong cỡ hạt (Whiten 1972) + năng lượng (Bond 1952)</td></tr>
<tr><td><code>mackorn_simulate_flowsheet</code></td><td>Mô phỏng nhiều cấp + sàng + mạch kín</td></tr>
<tr><td><code>mackorn_calibrate</code></td><td>Hiệu chuẩn mô hình bằng dữ liệu sàng thực tế</td></tr>
<tr><td><code>mackorn_wear_design</code></td><td>Tuổi thọ và độ đồng đều mài mòn của lót</td></tr>
<tr><td><code>mackorn_cost_estimate</code></td><td>Điện năng, chi phí lót, chi phí lắp đặt mỗi tấn</td></tr>
</table>
<p><a class="btn" href="${BASE}/ai/">Plugin chọn máy (21 công cụ)</a>
<a class="btn ghost" href="${BASE}/glossary/">Thuật ngữ 12 ngôn ngữ</a>
<a class="btn ghost" href="${BASE}/contact/">Liên hệ</a></p>
</section>

<section>
<h2>Câu hỏi thường gặp</h2>
<h3>Máy nghiền côn là thiết bị nghiền gì?</h3><p>Thiết bị nghiền trung và nghiền mịn (cấp hai / cấp ba). Không thể tiếp nhận liệu lớn hơn khoảng 350 mm.</p>
<h3>Cần bao nhiêu cấp nghiền?</h3><p>Do tổng tỷ số nghiền quyết định: đến 6:1 một cấp; 25:1 hai cấp; 100:1 ba cấp; trên 100:1 bốn cấp.</p>
<h3>Sàng rung và máy nghiền côn có liên quan gì?</h3><p>Mạch kín. Sàng chọn theo lưu lượng qua sàng (không theo liệu mới) — tải tuần hoàn 200-300%, lưu lượng gấp 3-4 lần.</p>
<h3>Làm sao chọn khoang nghiền?</h3><p>EC → C → MC → M → MF → F → EF, từ thô đến mịn. Liệu thô chọn về đầu; sản phẩm mịn chọn về cuối.</p>
<h3>Có công cụ tính toán không?</h3><p>Có — plugin MACKORN mã nguồn mở, 21 công cụ MCP.</p>
</section>

</div>
<footer><div class="wrap">
<p style="margin:0 0 6px"><strong>Shanghai Mackorn Minerals Co., Ltd. · 上海美矿机械股份有限公司</strong></p>
<p style="margin:0">Dữ liệu thông số nhà sản xuất thuộc bản quyền Shanghai Mackorn Minerals Co., Ltd. Mô hình tính toán dựa trên tài liệu công bố (Whiten 1972 / Bond 1952). Trang này không có báo giá.</p>
</div></footer>
</body></html>`;

mkdirSync(join(SITE, 'vi'), { recursive: true });
writeFileSync(join(SITE, 'vi', 'index.html'), VI, 'utf8');
console.log('  ✅ 越南语言页 /vi/ 已建（' + (VI.length / 1024).toFixed(1) + ' KB）');

/* ── ③ sitemap ── */
const sm = join(SITE, 'sitemap.xml');
if (existsSync(sm)) {
  let t = readFileSync(sm, 'utf8');
  if (!t.includes('/vi/')) {
    t = t.replace(/\s*<\/urlset>/, '\n\n  <url>\n    <loc>' + BASE + '/vi/</loc>\n    <lastmod>2026-10-03</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n\n</urlset>');
    writeFileSync(sm, t, 'utf8');
  }
  console.log('  sitemap ' + [...t.matchAll(/<loc>/g)].length + ' URL');
}

/* ══════════════════════════════════════════════════════════════════
 * R33 追加（教训 L-28）：本脚本会改 .mjs 源码 —— 必须验证"改没改成"。
 * 文本替换的锚点不存在会【静默失败】；R31 事故就是这么把
 * plugin/index.mjs 的 22 行引号插坏、整个文件无法解析，而门禁全绿。
 * ══════════════════════════════════════════════════════════════════ */
try {
  const { verifyAfterWrite } = await import('./verify_after_write.mjs');
  verifyAfterWrite();
} catch (e) {
  console.log('  ⚠ 改完自检未能执行: ' + String(e.message).slice(0, 60));
}
