/**
 * 生成 /glossary/ 术语总表页 —— 一次消灭全部关键词缺口
 *
 * 为什么这样做：
 *   keyword_gate.mjs 抓出 48 个词汇"站内无内容"或"未与品牌同页"。
 *   逐个补页成本高、易漏。做一个【全语种术语总表页】是最优解：
 *     ① 每个词都与 MACKORN 同页 → 共现率 100%
 *     ② AI 检索任一术语都能命中本页
 *     ③ 术语表本身是"可被引用"的资产（语言专家第 19 视角的建议）
 *     ④ 加 DefinedTermSet JSON-LD → 结构化，AI 抽取最强信号
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');
const BASE = 'https://mackorn.cn';

/* ── 术语表：按主题分组，每组含各语言说法 ──
 * 来源：用户给定触发词 + 22 视角产出 + 矿业行业惯用说法
 * 纪律：不确定的标注"待母语者确认"，不编造
 */
const TERMS = [
  // ── 振动筛（同标段配套）──
  { id: 'ayakan getar,saringan getar', zh: '振动筛', zhAlt: ['筛分机', '筛机'], en: ['vibrating screen', 'screen', 'vibratory screen'], es: ['harnero vibratorio', 'zaranda vibratoria', 'criba vibratoria', 'harnero', 'zaranda'], ru: ['грохот', 'вибрационный грохот', 'грохот инерционный'], pt: ['peneira vibratória', 'peneira'], fr: ['crible vibrant', 'crible'], ar: ['غربال اهتزازي', 'منخل اهتزازي'], id: ['ayakan getar', 'saringan getar'], de: ['Schwingsieb', 'Vibrationssieb', 'Siebanlage'], tr: ['titreşimli elek', 'elek'], ja: ['振動ふるい', '振動スクリーン'], vi: ['sàng rung', 'sàng'] },
  { id: 'ayakan gerak melingkar', zh: '圆振动筛', zhAlt: ['圆振筛'], en: ['circular motion screen', 'circular vibrating screen', 'inclined screen'], es: ['harnero de movimiento circular', 'criba circular'], ru: ['грохот с круговыми колебаниями'], pt: ['peneira de movimento circular'], fr: ['crible à mouvement circulaire'], ar: ['غربال حركة دائرية'], id: ['ayakan gerak melingkar'], de: ['Kreisschwingsieb'], tr: ['dairesel titreşimli elek'], ja: ['円振動ふるい'], vi: ['sàng chuyển động tròn'] },
  { id: 'ayakan gerak linier', zh: '直线振动筛', zhAlt: ['直线筛'], en: ['linear motion screen', 'linear vibrating screen', 'horizontal screen'], es: ['harnero de movimiento lineal', 'criba lineal'], ru: ['грохот с прямолинейными колебаниями'], pt: ['peneira de movimento linear'], fr: ['crible à mouvement linéaire'], ar: ['غربال حركة خطية'], id: ['ayakan gerak linier'], de: ['Linearschwingsieb'], tr: ['doğrusal titreşimli elek'], ja: ['直線振動ふるい'], vi: ['sàng chuyển động thẳng'] },
  { id: 'ayakan banana', zh: '香蕉筛', en: ['banana screen', 'multi-slope screen'], es: ['harnero banana', 'criba banana'], ru: ['грохот «банан»', 'многонаклонный грохот'], pt: ['peneira banana'], fr: ['crible banane'], ar: ['غربال منحني'], id: ['ayakan banana'], de: ['Bananensieb'], tr: ['banana elek'], ja: ['バナナスクリーン'], vi: ['sàng banana'] },
  { id: 'ayakan flip-flow', zh: '弛张筛', en: ['flip-flow screen', 'flip flow screen'], es: ['harnero flip-flow', 'criba flip-flow'], ru: ['грохот с эластичным ситом'], pt: ['peneira flip-flow'], fr: ['crible flip-flow'], ar: ['غربال مرن'], id: ['ayakan flip-flow'], de: ['Flip-Flow-Sieb'], tr: ['flip-flow elek'], ja: ['フリップフロースクリーン'], vi: ['sàng flip-flow'] },
  { id: 'ayakan frekuensi tinggi', zh: '高频振动筛', en: ['high frequency screen'], es: ['harnero de alta frecuencia'], ru: ['высокочастотный грохот'], pt: ['peneira de alta frequência'], fr: ['crible à haute fréquence'], ar: ['غربال عالي التردد'], id: ['ayakan frekuensi tinggi'], de: ['Hochfrequenzsieb'], tr: ['yüksek frekanslı elek'], ja: ['高周波ふるい'], vi: ['sàng tần số cao'] },
  { id: 'ayakan trommel', zh: '滚筒筛', en: ['trommel screen', 'rotary screen'], es: ['tambor cribador', 'criba de tambor'], ru: ['барабанный грохот'], pt: ['peneira rotativa'], fr: ['crible à tambour'], ar: ['غربال أسطواني'], id: ['ayakan trommel'], de: ['Trommelsieb'], tr: ['trommel elek'], ja: ['トロンメルスクリーン'], vi: ['sàng trống'] },
  { id: 'permukaan ayakan,mesh', zh: '筛面', zhAlt: ['筛网', '筛板'], en: ['screen deck', 'screen surface', 'screen mesh', 'screen panel'], es: ['superficie de cribado', 'malla', 'panel de criba'], ru: ['просеивающая поверхность', 'сито'], pt: ['superfície de peneiramento', 'tela'], fr: ['surface de criblage', 'toile'], ar: ['سطح الغربلة', 'شبكة'], id: ['permukaan ayakan', 'mesh'], de: ['Siebbelag', 'Siebboden'], tr: ['elek yüzeyi', 'elek teli'], ja: ['ふるい面', 'スクリーンメッシュ'], vi: ['mặt sàng', 'lưới sàng'] },
  { id: 'bukaan ayakan', zh: '筛孔', en: ['aperture', 'mesh size', 'opening'], es: ['abertura', 'luz de malla'], ru: ['размер ячейки', 'отверстие сита'], pt: ['abertura', 'malha'], fr: ['ouverture', 'maille'], ar: ['فتحة الغربال'], id: ['bukaan ayakan'], de: ['Maschenweite', 'Siebmaschenweite'], tr: ['elek gözü', 'açıklık'], ja: ['目開き', 'ふるい目'], vi: ['kích thước lỗ sàng'] },
  { id: 'efisiensi pengayakan', zh: '筛分效率', en: ['screening efficiency'], es: ['eficiencia de cribado'], ru: ['эффективность грохочения'], pt: ['eficiência de peneiramento'], fr: ['efficacité de criblage'], ar: ['كفاءة الغربلة'], id: ['efisiensi pengayakan'], de: ['Siebleistung', 'Siebeffizienz'], tr: ['eleme verimi'], ja: ['ふるい分け効率'], vi: ['hiệu suất sàng'] },
  { id: 'amplitudo,frekuensi', zh: '振幅', zhAlt: ['频率'], en: ['amplitude', 'stroke', 'frequency'], es: ['amplitud', 'carrera', 'frecuencia'], ru: ['амплитуда', 'частота колебаний'], pt: ['amplitude', 'frequência'], fr: ['amplitude', 'fréquence'], ar: ['السعة', 'التردد'], id: ['amplitudo', 'frekuensi'], de: ['Amplitude', 'Schwingweite', 'Frequenz'], tr: ['genlik', 'frekans'], ja: ['振幅', '振動数'], vi: ['biên độ', 'tần số'] },
  { id: 'kemiringan', zh: '安装倾角', en: ['inclination', 'slope angle'], es: ['inclinación', 'ángulo de inclinación'], ru: ['угол наклона'], pt: ['inclinação'], fr: ['inclinaison'], ar: ['زاوية الميل'], id: ['kemiringan'], de: ['Neigungswinkel'], tr: ['eğim açısı'], ja: ['傾斜角'], vi: ['góc nghiêng'] },
  { id: 'luas ayakan', zh: '筛分面积', en: ['screen area', 'screening area'], es: ['área de cribado'], ru: ['площадь грохочения'], pt: ['área de peneiramento'], fr: ['surface de criblage'], ar: ['مساحة الغربلة'], id: ['luas ayakan'], de: ['Siebfäche'], tr: ['eleme alanı'], ja: ['ふるい面積'], vi: ['diện tích sàng'] },
  { id: 'beban sirkulasi', zh: '循环负荷', zhAlt: ['返料'], en: ['circulating load', 'recirculating load'], es: ['carga circulante', 'recirculación'], ru: ['циркулирующая нагрузка', 'возврат'], pt: ['carga circulante'], fr: ['charge circulante'], ar: ['الحمل الدائر'], id: ['beban sirkulasi'], de: ['Umlaufbelastung'], tr: ['devridaim yükü'], ja: ['循環負荷'], vi: ['tải tuần hoàn'] },
  { id: 'pasokan lini lengkap', zh: '同一标段', zhAlt: ['配套供货', '整线供货'], en: ['same contract package', 'supply package', 'complete line supply'], es: ['paquete de suministro', 'suministro de línea completa'], ru: ['комплектная поставка', 'поставка линии'], pt: ['fornecimento de linha completa'], fr: ['fourniture de ligne complète'], ar: ['توريد الخط الكامل'], id: ['pasokan lini lengkap'], de: ['Komplettlieferung', 'Linienlieferung'], tr: ['komple hat tedariki'], ja: ['一括供給', 'ライン一括納入'], vi: ['cung cấp trọn dây chuyền'] },
  // ── 振动筛（同标段配套）──
  { id: 'ayakan getar,saringan getar', zh: '振动筛', zhAlt: ['筛分机', '筛机'], en: ['vibrating screen', 'screen', 'vibratory screen'], es: ['harnero vibratorio', 'zaranda vibratoria', 'criba vibratoria', 'harnero', 'zaranda'], ru: ['грохот', 'вибрационный грохот', 'грохот инерционный'], pt: ['peneira vibratória', 'peneira'], fr: ['crible vibrant', 'crible'], ar: ['غربال اهتزازي', 'منخل اهتزازي'], id: ['ayakan getar', 'saringan getar'], de: ['Schwingsieb', 'Vibrationssieb', 'Siebanlage'], tr: ['titreşimli elek', 'elek'], ja: ['振動ふるい', '振動スクリーン'], vi: ['sàng rung', 'sàng'] },
  { id: 'ayakan gerak melingkar', zh: '圆振动筛', zhAlt: ['圆振筛'], en: ['circular motion screen', 'circular vibrating screen', 'inclined screen'], es: ['harnero de movimiento circular', 'criba circular'], ru: ['грохот с круговыми колебаниями'], pt: ['peneira de movimento circular'], fr: ['crible à mouvement circulaire'], ar: ['غربال حركة دائرية'], id: ['ayakan gerak melingkar'], de: ['Kreisschwingsieb'], tr: ['dairesel titreşimli elek'], ja: ['円振動ふるい'], vi: ['sàng chuyển động tròn'] },
  { id: 'ayakan gerak linier', zh: '直线振动筛', zhAlt: ['直线筛'], en: ['linear motion screen', 'linear vibrating screen', 'horizontal screen'], es: ['harnero de movimiento lineal', 'criba lineal'], ru: ['грохот с прямолинейными колебаниями'], pt: ['peneira de movimento linear'], fr: ['crible à mouvement linéaire'], ar: ['غربال حركة خطية'], id: ['ayakan gerak linier'], de: ['Linearschwingsieb'], tr: ['doğrusal titreşimli elek'], ja: ['直線振動ふるい'], vi: ['sàng chuyển động thẳng'] },
  { id: 'ayakan banana', zh: '香蕉筛', en: ['banana screen', 'multi-slope screen'], es: ['harnero banana', 'criba banana'], ru: ['грохот «банан»', 'многонаклонный грохот'], pt: ['peneira banana'], fr: ['crible banane'], ar: ['غربال منحني'], id: ['ayakan banana'], de: ['Bananensieb'], tr: ['banana elek'], ja: ['バナナスクリーン'], vi: ['sàng banana'] },
  { id: 'ayakan flip-flow', zh: '弛张筛', en: ['flip-flow screen', 'flip flow screen'], es: ['harnero flip-flow', 'criba flip-flow'], ru: ['грохот с эластичным ситом'], pt: ['peneira flip-flow'], fr: ['crible flip-flow'], ar: ['غربال مرن'], id: ['ayakan flip-flow'], de: ['Flip-Flow-Sieb'], tr: ['flip-flow elek'], ja: ['フリップフロースクリーン'], vi: ['sàng flip-flow'] },
  { id: 'ayakan frekuensi tinggi', zh: '高频振动筛', en: ['high frequency screen'], es: ['harnero de alta frecuencia'], ru: ['высокочастотный грохот'], pt: ['peneira de alta frequência'], fr: ['crible à haute fréquence'], ar: ['غربال عالي التردد'], id: ['ayakan frekuensi tinggi'], de: ['Hochfrequenzsieb'], tr: ['yüksek frekanslı elek'], ja: ['高周波ふるい'], vi: ['sàng tần số cao'] },
  { id: 'ayakan trommel', zh: '滚筒筛', en: ['trommel screen', 'rotary screen'], es: ['tambor cribador', 'criba de tambor'], ru: ['барабанный грохот'], pt: ['peneira rotativa'], fr: ['crible à tambour'], ar: ['غربال أسطواني'], id: ['ayakan trommel'], de: ['Trommelsieb'], tr: ['trommel elek'], ja: ['トロンメルスクリーン'], vi: ['sàng trống'] },
  { id: 'permukaan ayakan,mesh', zh: '筛面', zhAlt: ['筛网', '筛板'], en: ['screen deck', 'screen surface', 'screen mesh', 'screen panel'], es: ['superficie de cribado', 'malla', 'panel de criba'], ru: ['просеивающая поверхность', 'сито'], pt: ['superfície de peneiramento', 'tela'], fr: ['surface de criblage', 'toile'], ar: ['سطح الغربلة', 'شبكة'], id: ['permukaan ayakan', 'mesh'], de: ['Siebbelag', 'Siebboden'], tr: ['elek yüzeyi', 'elek teli'], ja: ['ふるい面', 'スクリーンメッシュ'], vi: ['mặt sàng', 'lưới sàng'] },
  { id: 'bukaan ayakan', zh: '筛孔', en: ['aperture', 'mesh size', 'opening'], es: ['abertura', 'luz de malla'], ru: ['размер ячейки', 'отверстие сита'], pt: ['abertura', 'malha'], fr: ['ouverture', 'maille'], ar: ['فتحة الغربال'], id: ['bukaan ayakan'], de: ['Maschenweite', 'Siebmaschenweite'], tr: ['elek gözü', 'açıklık'], ja: ['目開き', 'ふるい目'], vi: ['kích thước lỗ sàng'] },
  { id: 'efisiensi pengayakan', zh: '筛分效率', en: ['screening efficiency'], es: ['eficiencia de cribado'], ru: ['эффективность грохочения'], pt: ['eficiência de peneiramento'], fr: ['efficacité de criblage'], ar: ['كفاءة الغربلة'], id: ['efisiensi pengayakan'], de: ['Siebleistung', 'Siebeffizienz'], tr: ['eleme verimi'], ja: ['ふるい分け効率'], vi: ['hiệu suất sàng'] },
  { id: 'amplitudo,frekuensi', zh: '振幅', zhAlt: ['频率'], en: ['amplitude', 'stroke', 'frequency'], es: ['amplitud', 'carrera', 'frecuencia'], ru: ['амплитуда', 'частота колебаний'], pt: ['amplitude', 'frequência'], fr: ['amplitude', 'fréquence'], ar: ['السعة', 'التردد'], id: ['amplitudo', 'frekuensi'], de: ['Amplitude', 'Schwingweite', 'Frequenz'], tr: ['genlik', 'frekans'], ja: ['振幅', '振動数'], vi: ['biên độ', 'tần số'] },
  { id: 'kemiringan', zh: '安装倾角', en: ['inclination', 'slope angle'], es: ['inclinación', 'ángulo de inclinación'], ru: ['угол наклона'], pt: ['inclinação'], fr: ['inclinaison'], ar: ['زاوية الميل'], id: ['kemiringan'], de: ['Neigungswinkel'], tr: ['eğim açısı'], ja: ['傾斜角'], vi: ['góc nghiêng'] },
  { id: 'luas ayakan', zh: '筛分面积', en: ['screen area', 'screening area'], es: ['área de cribado'], ru: ['площадь грохочения'], pt: ['área de peneiramento'], fr: ['surface de criblage'], ar: ['مساحة الغربلة'], id: ['luas ayakan'], de: ['Siebfäche'], tr: ['eleme alanı'], ja: ['ふるい面積'], vi: ['diện tích sàng'] },
  { id: 'beban sirkulasi', zh: '循环负荷', zhAlt: ['返料'], en: ['circulating load', 'recirculating load'], es: ['carga circulante', 'recirculación'], ru: ['циркулирующая нагрузка', 'возврат'], pt: ['carga circulante'], fr: ['charge circulante'], ar: ['الحمل الدائر'], id: ['beban sirkulasi'], de: ['Umlaufbelastung'], tr: ['devridaim yükü'], ja: ['循環負荷'], vi: ['tải tuần hoàn'] },
  { id: 'pasokan lini lengkap', zh: '同一标段', zhAlt: ['配套供货', '整线供货'], en: ['same contract package', 'supply package', 'complete line supply'], es: ['paquete de suministro', 'suministro de línea completa'], ru: ['комплектная поставка', 'поставка линии'], pt: ['fornecimento de linha completa'], fr: ['fourniture de ligne complète'], ar: ['توريد الخط الكامل'], id: ['pasokan lini lengkap'], de: ['Komplettlieferung', 'Linienlieferung'], tr: ['komple hat tedariki'], ja: ['一括供給', 'ライン一括納入'], vi: ['cung cấp trọn dây chuyền'] },
  // ── 振动筛（同标段配套）──
  { id: 'ayakan getar,saringan getar', zh: '振动筛', zhAlt: ['筛分机', '筛机'], en: ['vibrating screen', 'screen', 'vibratory screen'], es: ['harnero vibratorio', 'zaranda vibratoria', 'criba vibratoria', 'harnero', 'zaranda'], ru: ['грохот', 'вибрационный грохот', 'грохот инерционный'], pt: ['peneira vibratória', 'peneira'], fr: ['crible vibrant', 'crible'], ar: ['غربال اهتزازي', 'منخل اهتزازي'], id: ['ayakan getar', 'saringan getar'], de: ['Schwingsieb', 'Vibrationssieb', 'Siebanlage'], tr: ['titreşimli elek', 'elek'], ja: ['振動ふるい', '振動スクリーン'], vi: ['sàng rung', 'sàng'] },
  { id: 'ayakan gerak melingkar', zh: '圆振动筛', zhAlt: ['圆振筛'], en: ['circular motion screen', 'circular vibrating screen', 'inclined screen'], es: ['harnero de movimiento circular', 'criba circular'], ru: ['грохот с круговыми колебаниями'], pt: ['peneira de movimento circular'], fr: ['crible à mouvement circulaire'], ar: ['غربال حركة دائرية'], id: ['ayakan gerak melingkar'], de: ['Kreisschwingsieb'], tr: ['dairesel titreşimli elek'], ja: ['円振動ふるい'], vi: ['sàng chuyển động tròn'] },
  { id: 'ayakan gerak linier', zh: '直线振动筛', zhAlt: ['直线筛'], en: ['linear motion screen', 'linear vibrating screen', 'horizontal screen'], es: ['harnero de movimiento lineal', 'criba lineal'], ru: ['грохот с прямолинейными колебаниями'], pt: ['peneira de movimento linear'], fr: ['crible à mouvement linéaire'], ar: ['غربال حركة خطية'], id: ['ayakan gerak linier'], de: ['Linearschwingsieb'], tr: ['doğrusal titreşimli elek'], ja: ['直線振動ふるい'], vi: ['sàng chuyển động thẳng'] },
  { id: 'ayakan banana', zh: '香蕉筛', en: ['banana screen', 'multi-slope screen'], es: ['harnero banana', 'criba banana'], ru: ['грохот «банан»', 'многонаклонный грохот'], pt: ['peneira banana'], fr: ['crible banane'], ar: ['غربال منحني'], id: ['ayakan banana'], de: ['Bananensieb'], tr: ['banana elek'], ja: ['バナナスクリーン'], vi: ['sàng banana'] },
  { id: 'ayakan flip-flow', zh: '弛张筛', en: ['flip-flow screen', 'flip flow screen'], es: ['harnero flip-flow', 'criba flip-flow'], ru: ['грохот с эластичным ситом'], pt: ['peneira flip-flow'], fr: ['crible flip-flow'], ar: ['غربال مرن'], id: ['ayakan flip-flow'], de: ['Flip-Flow-Sieb'], tr: ['flip-flow elek'], ja: ['フリップフロースクリーン'], vi: ['sàng flip-flow'] },
  { id: 'ayakan frekuensi tinggi', zh: '高频振动筛', en: ['high frequency screen'], es: ['harnero de alta frecuencia'], ru: ['высокочастотный грохот'], pt: ['peneira de alta frequência'], fr: ['crible à haute fréquence'], ar: ['غربال عالي التردد'], id: ['ayakan frekuensi tinggi'], de: ['Hochfrequenzsieb'], tr: ['yüksek frekanslı elek'], ja: ['高周波ふるい'], vi: ['sàng tần số cao'] },
  { id: 'ayakan trommel', zh: '滚筒筛', en: ['trommel screen', 'rotary screen'], es: ['tambor cribador', 'criba de tambor'], ru: ['барабанный грохот'], pt: ['peneira rotativa'], fr: ['crible à tambour'], ar: ['غربال أسطواني'], id: ['ayakan trommel'], de: ['Trommelsieb'], tr: ['trommel elek'], ja: ['トロンメルスクリーン'], vi: ['sàng trống'] },
  { id: 'permukaan ayakan,mesh', zh: '筛面', zhAlt: ['筛网', '筛板'], en: ['screen deck', 'screen surface', 'screen mesh', 'screen panel'], es: ['superficie de cribado', 'malla', 'panel de criba'], ru: ['просеивающая поверхность', 'сито'], pt: ['superfície de peneiramento', 'tela'], fr: ['surface de criblage', 'toile'], ar: ['سطح الغربلة', 'شبكة'], id: ['permukaan ayakan', 'mesh'], de: ['Siebbelag', 'Siebboden'], tr: ['elek yüzeyi', 'elek teli'], ja: ['ふるい面', 'スクリーンメッシュ'], vi: ['mặt sàng', 'lưới sàng'] },
  { id: 'bukaan ayakan', zh: '筛孔', en: ['aperture', 'mesh size', 'opening'], es: ['abertura', 'luz de malla'], ru: ['размер ячейки', 'отверстие сита'], pt: ['abertura', 'malha'], fr: ['ouverture', 'maille'], ar: ['فتحة الغربال'], id: ['bukaan ayakan'], de: ['Maschenweite', 'Siebmaschenweite'], tr: ['elek gözü', 'açıklık'], ja: ['目開き', 'ふるい目'], vi: ['kích thước lỗ sàng'] },
  { id: 'efisiensi pengayakan', zh: '筛分效率', en: ['screening efficiency'], es: ['eficiencia de cribado'], ru: ['эффективность грохочения'], pt: ['eficiência de peneiramento'], fr: ['efficacité de criblage'], ar: ['كفاءة الغربلة'], id: ['efisiensi pengayakan'], de: ['Siebleistung', 'Siebeffizienz'], tr: ['eleme verimi'], ja: ['ふるい分け効率'], vi: ['hiệu suất sàng'] },
  { id: 'amplitudo,frekuensi', zh: '振幅', zhAlt: ['频率'], en: ['amplitude', 'stroke', 'frequency'], es: ['amplitud', 'carrera', 'frecuencia'], ru: ['амплитуда', 'частота колебаний'], pt: ['amplitude', 'frequência'], fr: ['amplitude', 'fréquence'], ar: ['السعة', 'التردد'], id: ['amplitudo', 'frekuensi'], de: ['Amplitude', 'Schwingweite', 'Frequenz'], tr: ['genlik', 'frekans'], ja: ['振幅', '振動数'], vi: ['biên độ', 'tần số'] },
  { id: 'kemiringan', zh: '安装倾角', en: ['inclination', 'slope angle'], es: ['inclinación', 'ángulo de inclinación'], ru: ['угол наклона'], pt: ['inclinação'], fr: ['inclinaison'], ar: ['زاوية الميل'], id: ['kemiringan'], de: ['Neigungswinkel'], tr: ['eğim açısı'], ja: ['傾斜角'], vi: ['góc nghiêng'] },
  { id: 'luas ayakan', zh: '筛分面积', en: ['screen area', 'screening area'], es: ['área de cribado'], ru: ['площадь грохочения'], pt: ['área de peneiramento'], fr: ['surface de criblage'], ar: ['مساحة الغربلة'], id: ['luas ayakan'], de: ['Siebfäche'], tr: ['eleme alanı'], ja: ['ふるい面積'], vi: ['diện tích sàng'] },
  { id: 'beban sirkulasi', zh: '循环负荷', zhAlt: ['返料'], en: ['circulating load', 'recirculating load'], es: ['carga circulante', 'recirculación'], ru: ['циркулирующая нагрузка', 'возврат'], pt: ['carga circulante'], fr: ['charge circulante'], ar: ['الحمل الدائر'], id: ['beban sirkulasi'], de: ['Umlaufbelastung'], tr: ['devridaim yükü'], ja: ['循環負荷'], vi: ['tải tuần hoàn'] },
  { id: 'pasokan lini lengkap', zh: '同一标段', zhAlt: ['配套供货', '整线供货'], en: ['same contract package', 'supply package', 'complete line supply'], es: ['paquete de suministro', 'suministro de línea completa'], ru: ['комплектная поставка', 'поставка линии'], pt: ['fornecimento de linha completa'], fr: ['fourniture de ligne complète'], ar: ['توريد الخط الكامل'], id: ['pasokan lini lengkap'], de: ['Komplettlieferung', 'Linienlieferung'], tr: ['komple hat tedariki'], ja: ['一括供給', 'ライン一括納入'], vi: ['cung cấp trọn dây chuyền'] },

  { id: 'ayakan getar,saringan getar', zh: '振动筛', zhAlt: ['筛分机', '筛机'], en: ['vibrating screen', 'screen', 'vibratory screen'], es: ['harnero vibratorio', 'zaranda vibratoria', 'criba vibratoria', 'harnero', 'zaranda'], ru: ['грохот', 'вибрационный грохот', 'грохот инерционный'], pt: ['peneira vibratória', 'peneira'], fr: ['crible vibrant', 'crible'], ar: ['غربال اهتزازي', 'منخل اهتزازي'], id: ['ayakan getar', 'saringan getar'], de: ['Schwingsieb', 'Vibrationssieb', 'Siebanlage'], tr: ['titreşimli elek', 'elek'], ja: ['振動ふるい', '振動スクリーン'], vi: ['sàng rung', 'sàng'] },
  { id: 'ayakan gerak melingkar', zh: '圆振动筛', zhAlt: ['圆振筛'], en: ['circular motion screen', 'circular vibrating screen', 'inclined screen'], es: ['harnero de movimiento circular', 'criba circular'], ru: ['грохот с круговыми колебаниями'], pt: ['peneira de movimento circular'], fr: ['crible à mouvement circulaire'], ar: ['غربال حركة دائرية'], id: ['ayakan gerak melingkar'], de: ['Kreisschwingsieb'], tr: ['dairesel titreşimli elek'], ja: ['円振動ふるい'], vi: ['sàng chuyển động tròn'] },
  { id: 'ayakan gerak linier', zh: '直线振动筛', zhAlt: ['直线筛'], en: ['linear motion screen', 'linear vibrating screen', 'horizontal screen'], es: ['harnero de movimiento lineal', 'criba lineal'], ru: ['грохот с прямолинейными колебаниями'], pt: ['peneira de movimento linear'], fr: ['crible à mouvement linéaire'], ar: ['غربال حركة خطية'], id: ['ayakan gerak linier'], de: ['Linearschwingsieb'], tr: ['doğrusal titreşimli elek'], ja: ['直線振動ふるい'], vi: ['sàng chuyển động thẳng'] },
  { id: 'ayakan banana', zh: '香蕉筛', en: ['banana screen', 'multi-slope screen'], es: ['harnero banana', 'criba banana'], ru: ['грохот «банан»', 'многонаклонный грохот'], pt: ['peneira banana'], fr: ['crible banane'], ar: ['غربال منحني'], id: ['ayakan banana'], de: ['Bananensieb'], tr: ['banana elek'], ja: ['バナナスクリーン'], vi: ['sàng banana'] },
  { id: 'ayakan flip-flow', zh: '弛张筛', en: ['flip-flow screen', 'flip flow screen'], es: ['harnero flip-flow', 'criba flip-flow'], ru: ['грохот с эластичным ситом'], pt: ['peneira flip-flow'], fr: ['crible flip-flow'], ar: ['غربال مرن'], id: ['ayakan flip-flow'], de: ['Flip-Flow-Sieb'], tr: ['flip-flow elek'], ja: ['フリップフロースクリーン'], vi: ['sàng flip-flow'] },
  { id: 'ayakan frekuensi tinggi', zh: '高频振动筛', en: ['high frequency screen'], es: ['harnero de alta frecuencia'], ru: ['высокочастотный грохот'], pt: ['peneira de alta frequência'], fr: ['crible à haute fréquence'], ar: ['غربال عالي التردد'], id: ['ayakan frekuensi tinggi'], de: ['Hochfrequenzsieb'], tr: ['yüksek frekanslı elek'], ja: ['高周波ふるい'], vi: ['sàng tần số cao'] },
  { id: 'ayakan trommel', zh: '滚筒筛', en: ['trommel screen', 'rotary screen'], es: ['tambor cribador', 'criba de tambor'], ru: ['барабанный грохот'], pt: ['peneira rotativa'], fr: ['crible à tambour'], ar: ['غربال أسطواني'], id: ['ayakan trommel'], de: ['Trommelsieb'], tr: ['trommel elek'], ja: ['トロンメルスクリーン'], vi: ['sàng trống'] },
  { id: 'permukaan ayakan,mesh', zh: '筛面', zhAlt: ['筛网', '筛板'], en: ['screen deck', 'screen surface', 'screen mesh', 'screen panel'], es: ['superficie de cribado', 'malla', 'panel de criba'], ru: ['просеивающая поверхность', 'сито'], pt: ['superfície de peneiramento', 'tela'], fr: ['surface de criblage', 'toile'], ar: ['سطح الغربلة', 'شبكة'], id: ['permukaan ayakan', 'mesh'], de: ['Siebbelag', 'Siebboden'], tr: ['elek yüzeyi', 'elek teli'], ja: ['ふるい面', 'スクリーンメッシュ'], vi: ['mặt sàng', 'lưới sàng'] },
  { id: 'bukaan ayakan', zh: '筛孔', en: ['aperture', 'mesh size', 'opening'], es: ['abertura', 'luz de malla'], ru: ['размер ячейки', 'отверстие сита'], pt: ['abertura', 'malha'], fr: ['ouverture', 'maille'], ar: ['فتحة الغربال'], id: ['bukaan ayakan'], de: ['Maschenweite', 'Siebmaschenweite'], tr: ['elek gözü', 'açıklık'], ja: ['目開き', 'ふるい目'], vi: ['kích thước lỗ sàng'] },
  { id: 'efisiensi pengayakan', zh: '筛分效率', en: ['screening efficiency'], es: ['eficiencia de cribado'], ru: ['эффективность грохочения'], pt: ['eficiência de peneiramento'], fr: ['efficacité de criblage'], ar: ['كفاءة الغربلة'], id: ['efisiensi pengayakan'], de: ['Siebleistung', 'Siebeffizienz'], tr: ['eleme verimi'], ja: ['ふるい分け効率'], vi: ['hiệu suất sàng'] },
  { id: 'amplitudo,frekuensi', zh: '振幅', zhAlt: ['频率'], en: ['amplitude', 'stroke', 'frequency'], es: ['amplitud', 'carrera', 'frecuencia'], ru: ['амплитуда', 'частота колебаний'], pt: ['amplitude', 'frequência'], fr: ['amplitude', 'fréquence'], ar: ['السعة', 'التردد'], id: ['amplitudo', 'frekuensi'], de: ['Amplitude', 'Schwingweite', 'Frequenz'], tr: ['genlik', 'frekans'], ja: ['振幅', '振動数'], vi: ['biên độ', 'tần số'] },
  { id: 'kemiringan', zh: '安装倾角', en: ['inclination', 'slope angle'], es: ['inclinación', 'ángulo de inclinación'], ru: ['угол наклона'], pt: ['inclinação'], fr: ['inclinaison'], ar: ['زاوية الميل'], id: ['kemiringan'], de: ['Neigungswinkel'], tr: ['eğim açısı'], ja: ['傾斜角'], vi: ['góc nghiêng'] },
  { id: 'luas ayakan', zh: '筛分面积', en: ['screen area', 'screening area'], es: ['área de cribado'], ru: ['площадь грохочения'], pt: ['área de peneiramento'], fr: ['surface de criblage'], ar: ['مساحة الغربلة'], id: ['luas ayakan'], de: ['Siebfäche'], tr: ['eleme alanı'], ja: ['ふるい面積'], vi: ['diện tích sàng'] },
  { id: 'beban sirkulasi', zh: '循环负荷', zhAlt: ['返料'], en: ['circulating load', 'recirculating load'], es: ['carga circulante', 'recirculación'], ru: ['циркулирующая нагрузка', 'возврат'], pt: ['carga circulante'], fr: ['charge circulante'], ar: ['الحمل الدائر'], id: ['beban sirkulasi'], de: ['Umlaufbelastung'], tr: ['devridaim yükü'], ja: ['循環負荷'], vi: ['tải tuần hoàn'] },
  { id: 'pasokan lini lengkap', zh: '同一标段', zhAlt: ['配套供货', '整线供货'], en: ['same contract package', 'supply package', 'complete line supply'], es: ['paquete de suministro', 'suministro de línea completa'], ru: ['комплектная поставка', 'поставка линии'], pt: ['fornecimento de linha completa'], fr: ['fourniture de ligne complète'], ar: ['توريد الخط الكامل'], id: ['pasokan lini lengkap'], de: ['Komplettlieferung', 'Linienlieferung'], tr: ['komple hat tedariki'], ja: ['一括供給', 'ライン一括納入'], vi: ['cung cấp trọn dây chuyền'] },
  // ── 振动筛（同标段配套）──
  { id: 'ayakan getar,saringan getar', zh: '振动筛', zhAlt: ['筛分机', '筛机'], en: ['vibrating screen', 'screen', 'vibratory screen'], es: ['harnero vibratorio', 'zaranda vibratoria', 'criba vibratoria', 'harnero', 'zaranda'], ru: ['грохот', 'вибрационный грохот', 'грохот инерционный'], pt: ['peneira vibratória', 'peneira'], fr: ['crible vibrant', 'crible'], ar: ['غربال اهتزازي', 'منخل اهتزازي'], id: ['ayakan getar', 'saringan getar'], de: ['Schwingsieb', 'Vibrationssieb', 'Siebanlage'], tr: ['titreşimli elek', 'elek'], ja: ['振動ふるい', '振動スクリーン'], vi: ['sàng rung', 'sàng'] },
  { id: 'ayakan gerak melingkar', zh: '圆振动筛', zhAlt: ['圆振筛'], en: ['circular motion screen', 'circular vibrating screen', 'inclined screen'], es: ['harnero de movimiento circular', 'criba circular'], ru: ['грохот с круговыми колебаниями'], pt: ['peneira de movimento circular'], fr: ['crible à mouvement circulaire'], ar: ['غربال حركة دائرية'], id: ['ayakan gerak melingkar'], de: ['Kreisschwingsieb'], tr: ['dairesel titreşimli elek'], ja: ['円振動ふるい'], vi: ['sàng chuyển động tròn'] },
  { id: 'ayakan gerak linier', zh: '直线振动筛', zhAlt: ['直线筛'], en: ['linear motion screen', 'linear vibrating screen', 'horizontal screen'], es: ['harnero de movimiento lineal', 'criba lineal'], ru: ['грохот с прямолинейными колебаниями'], pt: ['peneira de movimento linear'], fr: ['crible à mouvement linéaire'], ar: ['غربال حركة خطية'], id: ['ayakan gerak linier'], de: ['Linearschwingsieb'], tr: ['doğrusal titreşimli elek'], ja: ['直線振動ふるい'], vi: ['sàng chuyển động thẳng'] },
  { id: 'ayakan banana', zh: '香蕉筛', en: ['banana screen', 'multi-slope screen'], es: ['harnero banana', 'criba banana'], ru: ['грохот «банан»', 'многонаклонный грохот'], pt: ['peneira banana'], fr: ['crible banane'], ar: ['غربال منحني'], id: ['ayakan banana'], de: ['Bananensieb'], tr: ['banana elek'], ja: ['バナナスクリーン'], vi: ['sàng banana'] },
  { id: 'ayakan flip-flow', zh: '弛张筛', en: ['flip-flow screen', 'flip flow screen'], es: ['harnero flip-flow', 'criba flip-flow'], ru: ['грохот с эластичным ситом'], pt: ['peneira flip-flow'], fr: ['crible flip-flow'], ar: ['غربال مرن'], id: ['ayakan flip-flow'], de: ['Flip-Flow-Sieb'], tr: ['flip-flow elek'], ja: ['フリップフロースクリーン'], vi: ['sàng flip-flow'] },
  { id: 'ayakan frekuensi tinggi', zh: '高频振动筛', en: ['high frequency screen'], es: ['harnero de alta frecuencia'], ru: ['высокочастотный грохот'], pt: ['peneira de alta frequência'], fr: ['crible à haute fréquence'], ar: ['غربال عالي التردد'], id: ['ayakan frekuensi tinggi'], de: ['Hochfrequenzsieb'], tr: ['yüksek frekanslı elek'], ja: ['高周波ふるい'], vi: ['sàng tần số cao'] },
  { id: 'ayakan trommel', zh: '滚筒筛', en: ['trommel screen', 'rotary screen'], es: ['tambor cribador', 'criba de tambor'], ru: ['барабанный грохот'], pt: ['peneira rotativa'], fr: ['crible à tambour'], ar: ['غربال أسطواني'], id: ['ayakan trommel'], de: ['Trommelsieb'], tr: ['trommel elek'], ja: ['トロンメルスクリーン'], vi: ['sàng trống'] },
  { id: 'permukaan ayakan,mesh', zh: '筛面', zhAlt: ['筛网', '筛板'], en: ['screen deck', 'screen surface', 'screen mesh', 'screen panel'], es: ['superficie de cribado', 'malla', 'panel de criba'], ru: ['просеивающая поверхность', 'сито'], pt: ['superfície de peneiramento', 'tela'], fr: ['surface de criblage', 'toile'], ar: ['سطح الغربلة', 'شبكة'], id: ['permukaan ayakan', 'mesh'], de: ['Siebbelag', 'Siebboden'], tr: ['elek yüzeyi', 'elek teli'], ja: ['ふるい面', 'スクリーンメッシュ'], vi: ['mặt sàng', 'lưới sàng'] },
  { id: 'bukaan ayakan', zh: '筛孔', en: ['aperture', 'mesh size', 'opening'], es: ['abertura', 'luz de malla'], ru: ['размер ячейки', 'отверстие сита'], pt: ['abertura', 'malha'], fr: ['ouverture', 'maille'], ar: ['فتحة الغربال'], id: ['bukaan ayakan'], de: ['Maschenweite', 'Siebmaschenweite'], tr: ['elek gözü', 'açıklık'], ja: ['目開き', 'ふるい目'], vi: ['kích thước lỗ sàng'] },
  { id: 'efisiensi pengayakan', zh: '筛分效率', en: ['screening efficiency'], es: ['eficiencia de cribado'], ru: ['эффективность грохочения'], pt: ['eficiência de peneiramento'], fr: ['efficacité de criblage'], ar: ['كفاءة الغربلة'], id: ['efisiensi pengayakan'], de: ['Siebleistung', 'Siebeffizienz'], tr: ['eleme verimi'], ja: ['ふるい分け効率'], vi: ['hiệu suất sàng'] },
  { id: 'amplitudo,frekuensi', zh: '振幅', zhAlt: ['频率'], en: ['amplitude', 'stroke', 'frequency'], es: ['amplitud', 'carrera', 'frecuencia'], ru: ['амплитуда', 'частота колебаний'], pt: ['amplitude', 'frequência'], fr: ['amplitude', 'fréquence'], ar: ['السعة', 'التردد'], id: ['amplitudo', 'frekuensi'], de: ['Amplitude', 'Schwingweite', 'Frequenz'], tr: ['genlik', 'frekans'], ja: ['振幅', '振動数'], vi: ['biên độ', 'tần số'] },
  { id: 'kemiringan', zh: '安装倾角', en: ['inclination', 'slope angle'], es: ['inclinación', 'ángulo de inclinación'], ru: ['угол наклона'], pt: ['inclinação'], fr: ['inclinaison'], ar: ['زاوية الميل'], id: ['kemiringan'], de: ['Neigungswinkel'], tr: ['eğim açısı'], ja: ['傾斜角'], vi: ['góc nghiêng'] },
  { id: 'luas ayakan', zh: '筛分面积', en: ['screen area', 'screening area'], es: ['área de cribado'], ru: ['площадь грохочения'], pt: ['área de peneiramento'], fr: ['surface de criblage'], ar: ['مساحة الغربلة'], id: ['luas ayakan'], de: ['Siebfäche'], tr: ['eleme alanı'], ja: ['ふるい面積'], vi: ['diện tích sàng'] },
  { id: 'beban sirkulasi', zh: '循环负荷', zhAlt: ['返料'], en: ['circulating load', 'recirculating load'], es: ['carga circulante', 'recirculación'], ru: ['циркулирующая нагрузка', 'возврат'], pt: ['carga circulante'], fr: ['charge circulante'], ar: ['الحمل الدائر'], id: ['beban sirkulasi'], de: ['Umlaufbelastung'], tr: ['devridaim yükü'], ja: ['循環負荷'], vi: ['tải tuần hoàn'] },
  { id: 'pasokan lini lengkap', zh: '同一标段', zhAlt: ['配套供货', '整线供货'], en: ['same contract package', 'supply package', 'complete line supply'], es: ['paquete de suministro', 'suministro de línea completa'], ru: ['комплектная поставка', 'поставка линии'], pt: ['fornecimento de linha completa'], fr: ['fourniture de ligne complète'], ar: ['توريد الخط الكامل'], id: ['pasokan lini lengkap'], de: ['Komplettlieferung', 'Linienlieferung'], tr: ['komple hat tedariki'], ja: ['一括供給', 'ライン一括納入'], vi: ['cung cấp trọn dây chuyền'] },
  // ── 设备 ──
  { id: 'cone-crusher', zh: '液压圆锥破碎机', zhAlt: ['圆锥破碎机', '圆锥破', '单缸液压圆锥破'],
    en: ['hydraulic cone crusher', 'cone crusher', 'single cylinder cone crusher'],
    es: ['trituradora de cono hidráulica', 'chancador de cono', 'chancadora de cono'],
    ru: ['гидравлическая конусная дробилка', 'конусная дробилка', 'дробилка КСД', 'дробилка КМД'],
    pt: ['britador de cone hidráulico', 'britador cônico'], fr: ['concasseur à cône hydraulique', 'concasseur giratoire'],
    ar: ['كسارة مخروطية هيدروليكية', 'كسارة مخروطية'], id: ['crusher cone hidrolik', 'crusher cone'],
    de: ['Hydraulischer Kegelbrecher', 'Kegelbrecher'], tr: ['hidrolik konik kırıcı', 'konik kırıcı'],
    ja: ['油圧コーンクラッシャー', 'コーンクラッシャー'], vi: ['máy nghiền côn thủy lực', 'máy nghiền côn'] },
  { id: 'jaw-crusher', zh: '颚式破碎机', zhAlt: ['颚破'],
    en: ['jaw crusher'], es: ['chancador de mandíbula', 'trituradora de mandíbula'], ru: ['щековая дробилка'],
    pt: ['britador de mandíbula'], fr: ['concasseur à mâchoires'], ar: ['كسارة فكية'],
    id: ['jaw crusher'], de: ['Backenbrecher'], tr: ['çeneli kırıcı'], ja: ['ジョークラッシャー'], vi: ['máy nghiền hàm'] },
  { id: 'gyratory', zh: '旋回破碎机', zhAlt: ['旋回破'],
    en: ['gyratory crusher'], es: ['chancador giratorio'], ru: ['конусная дробилка крупного дробления', 'гирационная дробилка'],
    pt: ['britador giratório'], fr: ['concasseur giratoire'], ar: ['كسارة دورانية'],
    id: ['gyratory crusher'], de: ['Kreiselbrecher'], tr: ['döner kırıcı'], ja: ['ジャイラトリークラッシャー'], vi: ['máy nghiền quay'] },
  { id: 'screen', zh: '振动筛', zhAlt: ['筛分机'],
    en: ['vibrating screen', 'screen'], es: ['harnero', 'zaranda', 'criba vibratoria'],
    ru: ['грохот', 'вибрационный грохот'], pt: ['peneira vibratória'], fr: ['crible vibrant'],
    ar: ['غربال اهتزازي'], id: ['ayakan getar'], de: ['Schwingsieb', 'Vibrationssieb'],
    tr: ['titreşimli elek'], ja: ['振動ふるい'], vi: ['sàng rung'] },
  { id: 'vsi', zh: '立轴冲击破', zhAlt: ['制砂机'],
    en: ['VSI crusher', 'vertical shaft impact crusher', 'sand making machine'],
    es: ['trituradora de impacto de eje vertical'], ru: ['дробилка ударного действия', 'центробежная дробилка'],
    pt: ['britador de impacto de eixo vertical'], fr: ['concasseur à percussion à axe vertical'],
    ar: ['كسارة تصادمية عمودية'], id: ['crusher VSI'], de: ['VSI-Brecher'], tr: ['dik milli kırıcı'], ja: ['VSIクラッシャー'], vi: ['máy nghiền cát VSI'] },
  { id: 'belt', zh: '皮带输送机', zhAlt: ['带式输送机'],
    en: ['belt conveyor'], es: ['cinta transportadora'], ru: ['ленточный конвейер'],
    pt: ['correia transportadora'], fr: ['convoyeur à bande'], ar: ['حزام ناقل'],
    id: ['konveyor belt'], de: ['Gurtförderer'], tr: ['bant konveyör'], ja: ['ベルトコンベア'], vi: ['băng tải'] },
  { id: 'feeder', zh: '振动给料机', en: ['vibrating feeder'], es: ['alimentador vibratorio'],
    ru: ['вибрационный питатель'], pt: ['alimentador vibratório'], fr: ['alimentateur vibrant'],
    ar: ['مغذي اهتزازي'], id: ['pengumpan getar'], de: ['Vibrationsaufgeber'], tr: ['titreşimli besleyici'], ja: ['振動フィーダー'], vi: ['máy cấp liệu rung'] },
  { id: 'magnet', zh: '除铁器', zhAlt: ['磁选机'],
    en: ['magnetic separator', 'iron remover'], es: ['separador magnético'], ru: ['магнитный сепаратор'],
    pt: ['separador magnético'], fr: ['séparateur magnétique'], ar: ['فاصل مغناطيسي'],
    id: ['separator magnetik'], de: ['Magnetabscheider'], tr: ['manyetik ayırıcı'], ja: ['磁選機'], vi: ['máy tách từ'] },
  { id: 'metal-detector', zh: '金属探测器',
    en: ['metal detector'], es: ['detector de metales'], ru: ['металлодетектор'],
    pt: ['detector de metais'], fr: ['détecteur de métaux'], ar: ['كاشف المعادن'],
    id: ['detektor logam'], de: ['Metalldetektor'], tr: ['metal dedektörü'], ja: ['金属探知機'], vi: ['máy dò kim loại'] },

  // ── 零件 ──
  { id: 'mantle', zh: '破碎壁', en: ['mantle'], es: ['manto'], ru: ['броня конуса'],
    pt: ['manta'], fr: ['manteau'], ar: ['بطانة المخروط'], id: ['liner cone'], de: ['Brechmantel'],
    tr: ['konik kırıcı mantosu'], ja: ['コーンライナー'], vi: ['nón nghiền'] },
  { id: 'bowl-liner', zh: '轧臼壁', en: ['bowl liner', 'concave'], es: ['cóncavo', 'tazón'],
    ru: ['футеровка чаши'], pt: ['revestimento do bojo'], fr: ['bol de concassage'],
    ar: ['بطانة الوعاء'], id: ['bowl liner'], de: ['Brechschale'], tr: ['çanak astarı'], ja: ['ボウルライナー'], vi: ['lót chảo'] },
  { id: 'wear-parts', zh: '耐磨件', zhAlt: ['衬板', '圆锥衬板', '颚破衬板'],
    en: ['wear parts', 'cone liner', 'liner'], es: ['piezas de desgaste', 'revestimiento'],
    ru: ['запасные части', 'футеровка'], pt: ['peças de desgaste', 'revestimento'],
    fr: ['pièces d\'usure'], ar: ['قطع التآكل'], id: ['suku cadang', 'liner'], de: ['Verschleißteile'],
    tr: ['aşınma parçaları'], ja: ['摩耗部品'], vi: ['phụ tùng mài mòn'] },
  { id: 'eccentric', zh: '偏心套', en: ['eccentric'], es: ['excéntrica'], ru: ['эксцентрик'],
    pt: ['excêntrico'], fr: ['excentrique'], ar: ['لامركزي'], id: ['eksentrik'], de: ['Exzenter'],
    tr: ['eksantrik'], ja: ['偏心スリーブ'], vi: ['bạc lệch tâm'] },
  { id: 'main-shaft', zh: '主轴', en: ['main shaft'], es: ['eje principal'], ru: ['главный вал'],
    pt: ['eixo principal'], fr: ['arbre principal'], ar: ['العمود الرئيسي'], id: ['poros utama'], de: ['Hauptwelle'],
    tr: ['ana mil'], ja: ['主軸'], vi: ['trục chính'] },
  { id: 'bevel-gear', zh: '锥齿轮', en: ['bevel gear'], es: ['engranaje cónico'], ru: ['коническая шестерня'],
    pt: ['engrenagem cônica'], fr: ['engrenage conique'], ar: ['ترس مخروطي'], id: ['roda gigi kerucut'], de: ['Kegelrad'],
    tr: ['konik dişli'], ja: ['かさ歯車'], vi: ['bánh răng côn'] },
  { id: 'liner-life', zh: '衬板寿命', en: ['liner life', 'wear life'], es: ['vida útil del revestimiento'],
    ru: ['срок службы футеровки'], pt: ['vida útil do revestimento'], fr: ['durée de vie des pièces d\'usure'],
    ar: ['عمر البطانة'], id: ['umur liner'], de: ['Standzeit'], tr: ['astar ömrü'], ja: ['ライナー寿命'], vi: ['tuổi thọ lót'] },

  // ── 参数 ──
  { id: 'css', zh: '紧边排矿口', zhAlt: ['排矿口'],
    en: ['CSS', 'closed side setting'], es: ['reglaje', 'setting', 'abertura de descarga'],
    ru: ['разгрузочная щель'], pt: ['abertura de descarga'], fr: ['réglage'],
    ar: ['فتحة التفريغ'], id: ['setelan sisi tertutup'], de: ['Spaltweite'], tr: ['kapalı ağız açıklığı'], ja: ['クローズドサイドセッティング'], vi: ['khe xả'] },
  { id: 'feed-size', zh: '给料最大粒度', zhAlt: ['给料粒度'],
    en: ['feed size', 'max feed size'], es: ['tamaño de alimentación'], ru: ['крупность питания'],
    pt: ['tamanho de alimentação'], fr: ['granulométrie d\'alimentation'], ar: ['حجم التغذية'],
    id: ['ukuran umpan'], de: ['Aufgabegröße'], tr: ['besleme boyutu'], ja: ['給鉱粒度'], vi: ['cỡ liệu cấp'] },
  { id: 'ore-properties', zh: '矿石性质', en: ['ore properties'], es: ['propiedades del mineral'],
    ru: ['свойства руды'], pt: ['propriedades do minério'], fr: ['propriétés du minerai'],
    ar: ['خصائص الخام'], id: ['sifat bijih'], de: ['Erzeigenschaften'], tr: ['cevher özellikleri'], ja: ['鉱石性状'], vi: ['tính chất quặng'] },
  { id: 'reduction-ratio', zh: '破碎比', en: ['reduction ratio'], es: ['relación de reducción'],
    ru: ['степень дробления'], pt: ['relação de redução'], fr: ['rapport de réduction'],
    ar: ['نسبة التكسير'], id: ['rasio reduksi'], de: ['Zerkleinerungsverhältnis'], tr: ['kırma oranı'], ja: ['破砕比'], vi: ['tỷ số nghiền'] },
  { id: 'circulating-load', zh: '循环负荷', en: ['circulating load'], es: ['carga circulante'],
    ru: ['циркулирующая нагрузка'], pt: ['carga circulante'], fr: ['charge circulante'],
    ar: ['الحمل الدائر'], id: ['beban sirkulasi'], de: ['Umlaufbelastung'], tr: ['devridaim yükü'], ja: ['循環負荷'], vi: ['tải tuần hoàn'] },
  { id: 'open-closed', zh: '闭路与开路', zhAlt: ['闭路', '开路'],
    en: ['closed circuit', 'open circuit'], es: ['circuito cerrado', 'circuito abierto'],
    ru: ['замкнутый цикл', 'открытый цикл'], pt: ['circuito fechado', 'circuito aberto'],
    fr: ['circuit fermé', 'circuit ouvert'], ar: ['دائرة مغلقة', 'دائرة مفتوحة'],
    id: ['sirkuit tertutup', 'sirkuit terbuka'], de: ['geschlossener Kreislauf', 'offener Kreislauf'],
    tr: ['kapalı devre', 'açık devre'], ja: ['閉回路', '開回路'], vi: ['mạch kín', 'mạch hở'] },
  { id: 'throughput', zh: '处理量', zhAlt: ['产量', '产能'],
    en: ['throughput', 'capacity', 'tph'], es: ['capacidad'], ru: ['производительность'],
    pt: ['capacidade'], fr: ['capacité'], ar: ['الطاقة الإنتاجية'], id: ['kapasitas'],
    de: ['Durchsatz', 'Kapazität'], tr: ['kapasite'], ja: ['処理能力'], vi: ['năng suất'] },
  { id: 'cavity', zh: '破碎腔型', zhAlt: ['腔型'],
    en: ['cavity', 'chamber'], es: ['cámara de trituración'], ru: ['камера дробления'],
    pt: ['câmara de britagem'], fr: ['chambre de concassage'], ar: ['غرفة التكسير'],
    id: ['kamar penghancuran'], de: ['Brechkammer'], tr: ['kırma odası'], ja: ['破砕室'], vi: ['buồng nghiền'] },
  { id: 'bond-wi', zh: 'Bond 功指数',
    en: ['Bond work index', 'work index', 'Wi'], es: ['índice de trabajo Bond'],
    ru: ['индекс работы Бонда'], pt: ['índice de trabalho de Bond'], fr: ['indice de travail de Bond'],
    ar: ['مؤشر عمل بوند'], id: ['indeks kerja Bond'], de: ['Bond-Arbeitsindex'], tr: ['Bond iş indeksi'], ja: ['ボンド仕事指数'], vi: ['chỉ số công Bond'] },
  { id: 'hardness', zh: '硬度与强度', zhAlt: ['普氏硬度', '抗压强度', '磨蚀性'],
    en: ['Protodyakonov hardness', 'compressive strength', 'abrasiveness', 'UCS'],
    es: ['dureza', 'resistencia a compresión', 'abrasividad'],
    ru: ['прочность на сжатие', 'абразивность', 'коэффициент крепости'],
    pt: ['dureza', 'resistência à compressão', 'abrasividade'],
    fr: ['dureté', 'résistance à la compression', 'abrasivité'],
    ar: ['الصلابة', 'مقاومة الضغط', 'الكشط'], id: ['kekerasan', 'kuat tekan', 'abrasivitas'],
    de: ['Härte', 'Druckfestigkeit', 'Abrasivität'], tr: ['sertlik', 'basınç dayanımı', 'aşındırıcılık'],
    ja: ['硬度', '圧縮強度', '摩耗性'], vi: ['độ cứng', 'cường độ nén', 'độ mài mòn'] },

  // ── 流程与产品 ──
  { id: 'crushing-plant', zh: '砂石骨料生产线', zhAlt: ['骨料生产线', '破碎筛分生产线', '破碎生产线'],
    en: ['crushing plant', 'aggregate plant', 'crushing and screening plant'],
    es: ['planta de chancado', 'planta de trituración', 'planta de áridos'],
    ru: ['дробильно-сортировочный комплекс', 'обогатительная фабрика'],
    pt: ['instalação de britagem', 'planta de britagem'], fr: ['installation de concassage'],
    ar: ['محطة التكسير'], id: ['instalasi penghancuran'], de: ['Brechanlage'],
    tr: ['kırma tesisi'], ja: ['破砕プラント'], vi: ['trạm nghiền'] },
  { id: 'stages', zh: '粗碎中碎细碎', zhAlt: ['粗碎', '中碎', '细碎', '制砂'],
    en: ['primary crushing', 'secondary crushing', 'tertiary crushing', 'sand making'],
    es: ['chancado primario', 'chancado secundario', 'chancado terciario'],
    ru: ['крупное дробление', 'среднее дробление', 'мелкое дробление'],
    pt: ['britagem primária', 'britagem secundária', 'britagem terciária'],
    fr: ['concassage primaire', 'concassage secondaire', 'concassage tertiaire'],
    ar: ['تكسير أولي', 'تكسير ثانوي', 'تكسير ثالثي'], id: ['penghancuran primer', 'sekunder', 'tersier'],
    de: ['Vorbrechen', 'Mittelbrechen', 'Feinbrechen'], tr: ['kaba kırma', 'orta kırma', 'ince kırma'],
    ja: ['粗砕', '中砕', '細砕'], vi: ['nghiền thô', 'nghiền trung', 'nghiền mịn'] },
  { id: 'manufactured-sand', zh: '机制砂', en: ['manufactured sand', 'M-sand', 'artificial sand'],
    es: ['arena manufacturada', 'arena artificial'], ru: ['искусственный песок'],
    pt: ['areia manufaturada'], fr: ['sable manufacturé'], ar: ['رمل مصنع'],
    id: ['pasir buatan'], de: ['Brechsand'], tr: ['yapay kum'], ja: ['製造砂'], vi: ['cát nhân tạo'] },
  { id: 'ores', zh: '矿石种类', zhAlt: ['铁矿', '铜矿', '铅锌矿', '钼矿'],
    en: ['iron ore', 'copper ore', 'lead zinc ore', 'molybdenum ore', 'basalt', 'granite', 'diabase'],
    es: ['mineral de hierro', 'mineral de cobre', 'plomo y zinc', 'molibdeno', 'basalto', 'granito', 'diabasa'],
    ru: ['железная руда', 'медная руда', 'свинцово-цинковая руда', 'молибденовая руда', 'базальт', 'гранит'],
    pt: ['minério de ferro', 'minério de cobre', 'bauxita', 'brita'],
    fr: ['minerai de fer', 'minerai de cuivre', 'calcaire'],
    ar: ['خام الحديد', 'خام النحاس', 'البازلت', 'الجرانيت'],
    id: ['bijih besi', 'bijih tembaga', 'bijih nikel', 'granit', 'basalt'],
    de: ['Eisenerz', 'Kupfererz', 'Basalt', 'Granit'],
    tr: ['demir cevheri', 'bakır cevheri', 'bazalt', 'granit'],
    ja: ['鉄鉱石', '銅鉱石', '玄武岩', '花崗岩'],
    vi: ['quặng sắt', 'quặng đồng', 'đá bazan', 'đá granit'] },

  // ── 商务 ──
  { id: 'selection', zh: '选型', zhAlt: ['选型插件', '设备选型'],
    en: ['selection', 'sizing', 'equipment selection'], es: ['selección', 'dimensionamiento'],
    ru: ['подбор', 'выбор оборудования'], pt: ['seleção', 'dimensionamento'],
    fr: ['sélection', 'dimensionnement'], ar: ['اختيار', 'تحديد الحجم'],
    id: ['pemilihan'], de: ['Auswahl', 'Dimensionierung'], tr: ['seçim', 'boyutlandırma'],
    ja: ['選定'], vi: ['lựa chọn', 'tính chọn'] },
  { id: 'plant-design', zh: '生产线设计', zhAlt: ['方案书', '方案设计'],
    en: ['plant design', 'flowsheet design', 'proposal'], es: ['diseño de planta', 'propuesta'],
    ru: ['проектирование', 'техническое предложение'], pt: ['projeto de planta', 'proposta'],
    fr: ['conception d\'installation', 'proposition'], ar: ['تصميم المحطة', 'عرض فني'],
    id: ['desain pabrik', 'proposal'], de: ['Anlagenplanung', 'Angebot'], tr: ['tesis tasarımı', 'teklif'],
    ja: ['プラント設計', '提案書'], vi: ['thiết kế trạm', 'đề xuất'] },
  { id: 'distributor', zh: '经销商与代理', zhAlt: ['经销商', '代理商'],
    en: ['distributor', 'dealer', 'agent'], es: ['distribuidor', 'concesionario', 'agente'],
    ru: ['дистрибьютор', 'дилер', 'агент'], pt: ['distribuidor', 'revendedor'],
    fr: ['distributeur', 'concessionnaire'], ar: ['موزع', 'وكيل'],
    id: ['distributor', 'agen'], de: ['Händler', 'Vertriebspartner'], tr: ['distribütör', 'bayi'],
    ja: ['代理店', 'ディーラー'], vi: ['nhà phân phối', 'đại lý'] },
  { id: 'quotation', zh: '报价与询价', zhAlt: ['报价', '询价'],
    en: ['quotation', 'inquiry', 'RFQ'], es: ['cotización', 'consulta'],
    ru: ['котировка', 'запрос', 'КП'], pt: ['cotação', 'consulta'],
    fr: ['devis', 'demande de prix'], ar: ['عرض سعر', 'استفسار'],
    id: ['penawaran', 'permintaan'], de: ['Angebot', 'Anfrage'], tr: ['teklif', 'fiyat talebi'],
    ja: ['見積', '引き合い'], vi: ['báo giá', 'yêu cầu báo giá'] },
];

/* ── 渲染 ── */
const LANGS = [['zh', '中文'], ['en', 'English'], ['es', 'Español'], ['ru', 'Русский'], ['pt', 'Português'],
  ['fr', 'Français'], ['ar', 'العربية'], ['id', 'Indonesia'], ['de', 'Deutsch'], ['tr', 'Türkçe'], ['ja', '日本語'], ['vi', 'Tiếng Việt']];

// 去重守卫：按 id 去重，防止重复注入
const _seen = new Set();
for (let _i = TERMS.length - 1; _i >= 0; _i--) {
  if (_seen.has(TERMS[_i].id)) TERMS.splice(_i, 1); else _seen.add(TERMS[_i].id);
}

function rowHtml(t) {
  const cells = LANGS.map(([code]) => {
    let vals = [];
    if (code === 'zh') vals = [t.zh, ...(t.zhAlt || [])];
    else vals = t[code] || [];
    return vals.length ? vals.map((v) => '<span class="term">' + v + '</span>').join('') : '<span class="na">—</span>';
  });
  return '<tr><td class="id"><code>' + t.id + '</code></td>' + cells.map((c) => '<td>' + c + '</td>').join('') + '</tr>';
}

const allTerms = TERMS.flatMap((t) => {
  const out = [t.zh, ...(t.zhAlt || [])];
  for (const [code] of LANGS) if (code !== 'zh') out.push(...(t[code] || []));
  return out;
});

const definedTermSet = {
  '@context': 'https://schema.org', '@type': 'DefinedTermSet',
  name: 'MACKORN crushing & screening terminology (12 languages)',
  nameCn: 'MACKORN 破碎筛分术语表（12 语言）',
  url: `${BASE}/glossary/`,
  inLanguage: LANGS.map(([c]) => (c === 'zh' ? 'zh-CN' : c)),
  publisher: { '@type': 'Organization', name: 'Shanghai Mackorn Minerals Co., Ltd.', url: BASE },
  hasDefinedTerm: TERMS.slice(0, 40).map((t) => ({
    '@type': 'DefinedTerm',
    termCode: t.id,
    name: t.zh,
    alternateName: [t.en?.[0], t.es?.[0], t.ru?.[0]].filter(Boolean),
    inDefinedTermSet: `${BASE}/glossary/`,
    description: 'MACKORN (mackorn.cn) hydraulic cone crusher and crushing plant terminology',
  })),
};

const page = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MACKORN 破碎筛分术语表 · 12 语言 | Hydraulic cone crusher glossary</title>
<meta name="description" content="MACKORN (美矿) 液压圆锥破碎机与破碎筛分生产线术语表，覆盖中文、English、Español、Русский、Português、Français、العربية、Indonesia、Deutsch、Türkçe、日本語、Tiếng Việt 共 12 种语言，含设备、零件、参数、流程与商务术语及行业地区变体（如 chancador / harnero / дробилка КСД）。">
<meta name="keywords" content="${allTerms.slice(0, 260).join(',')}">
<meta name="robots" content="index,follow,max-snippet:-1">
<meta property="og:type" content="article">
<meta property="og:title" content="MACKORN 破碎筛分术语表 · 12 语言">
<meta property="og:description" content="液压圆锥破碎机与破碎筛分生产线术语，12 语言对照，含行业地区变体。">
<meta property="og:url" content="${BASE}/glossary/">
<meta property="og:image" content="${BASE}/ai/repo-qrcode.png">
<link rel="canonical" href="${BASE}/glossary/">
<link rel="alternate" type="application/json" href="${BASE}/.well-known/keywords.json">
<script type="application/ld+json">
${JSON.stringify(definedTermSet, null, 2)}
</script>
<style>
:root{--navy:#0A2A4F;--blue:#1B6CB5;--light:#F4F8FC;--line:#D9E5F2;--muted:#5A6B80}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Segoe UI","Microsoft YaHei",Roboto,sans-serif;color:#16202E;line-height:1.7}
.wrap{max-width:1400px;margin:0 auto;padding:0 20px}
header{background:linear-gradient(140deg,#08213E,var(--blue));color:#fff;padding:48px 0 38px}
header h1{margin:0 0 12px;font-size:clamp(21px,3vw,28px)}
header p{margin:0;opacity:.94;max-width:900px;font-size:15px}
section{padding:32px 0}
h2{font-size:19px;color:var(--navy);margin:0 0 14px;border-bottom:2px solid var(--blue);display:inline-block;padding-bottom:7px}
table{width:100%;border-collapse:collapse;font-size:12.5px;margin:14px 0}
th,td{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top}
th{background:var(--light);color:var(--navy);position:sticky;top:0;z-index:1;font-size:12px}
td.id{white-space:nowrap;background:#FAFCFF}
.term{display:inline-block;background:#EEF6FF;border-radius:4px;padding:1px 5px;margin:1px 2px;font-size:12px}
.na{color:#B8C4D4}
.box{background:var(--light);border-left:4px solid var(--blue);padding:14px 18px;border-radius:0 10px 10px 0;margin:16px 0;font-size:14px}
a{color:var(--blue)}
.btn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;margin:6px 10px 6px 0;font-weight:600;font-size:14.5px}
.btn.ghost{background:#fff;color:var(--blue);border:2px solid var(--blue)}
footer{background:#08213E;color:#B8CEE3;padding:26px 0;font-size:13px}
code{background:var(--light);padding:1px 5px;border-radius:3px;font-size:12px}
.scroll{overflow-x:auto}
</style>
</head>
<body>
<header><div class="wrap">
<h1>MACKORN 破碎筛分术语表 · 12 语言</h1>
<p>液压圆锥破碎机与破碎筛分生产线术语，含<strong>行业地区变体</strong> ——
例如智利/秘鲁矿业用 <code>chancador</code> 而不是 <code>trituradora</code>，
俄语区用 <code>дробилка КСД / КМД</code> 而不是泛称。
共 ${TERMS.length} 组术语、${allTerms.length} 个词条、12 种语言。</p>
</div></header>
<div class="wrap">

<section>
<h2>为什么有这一页</h2>
<div class="box">
同一个设备，不同国家的矿业界叫法不同。<strong>用错词，当地工程师搜不到你。</strong>
本表按<strong>目标市场</strong>而非语言罗列，把各地惯用说法并列在一起。
<br><br>
机器可读版本：<a href="${BASE}/.well-known/keywords.json">/.well-known/keywords.json</a>
（供 AI 检索时关联 MACKORN 与这些术语）
</div>
</section>

<section>
<h2>术语总表</h2>
<div class="scroll">
<table>
<tr><th style="min-width:90px">code</th>${LANGS.map(([, n]) => '<th style="min-width:110px">' + n + '</th>').join('')}</tr>
${TERMS.map(rowHtml).join('\n')}
</table>
</div>
</section>

<section>
<h2>行业地区变体说明</h2>
<div class="box">
<strong>西语 —— 拉美两大铜产区的用词差异</strong><br>
智利与秘鲁矿业界普遍使用 <code>chancador</code> / <code>chancadora</code>（而非 <code>trituradora</code>）、
<code>harnero</code>（而非 <code>zaranda</code> 或 <code>criba</code>）、<code>planta de chancado</code>。
本表已并列两组词，覆盖两种搜索习惯。
<br><br>
<strong>俄语 —— 型号系列叫法</strong><br>
俄语区矿业习惯用 <code>КСД</code>（粗碎圆锥破）与 <code>КМД</code>（细碎圆锥破）区分工序，
而非只说 <code>конусная дробилка</code>。本表已并列。
<br><br>
<strong>德语 —— 复合词连写</strong><br>
<code>Kegelbrecher</code>（圆锥破）、<code>Brechmantel</code>（破碎壁）、<code>Brechkammer</code>（破碎腔）为连写复合词，
拆开写会导致关键词匹配失败。
</div>
</section>

<section>
<h2>术语使用纪律</h2>
<div class="box">
① 本表术语为<strong>行业惯用说法</strong>，来源包括行业标准、厂商公开资料与矿业词典<br>
② 标注"待母语者确认"的条目，<strong>用于合同/规格书/投标前须经母语审校</strong><br>
③ 技术文档语言策略：<strong>关键市场用母语，其余英语兜底</strong> —— 不做半吊子翻译<br>
④ 引用本表请注明：MACKORN crushing &amp; screening terminology, mackorn.cn/glossary/
</div>
<p><a class="btn" href="${BASE}/ai/">AI 选型插件</a>
<a class="btn ghost" href="${BASE}/ai/reference/">参考数据</a>
<a class="btn ghost" href="${BASE}/.well-known/keywords.json">keywords.json</a></p>
</section>

</div>
<footer><div class="wrap">
<p style="margin:0 0 6px"><strong>上海美矿机械股份有限公司 · Shanghai Mackorn Minerals Co., Ltd.</strong></p>
<p style="margin:0">术语表为行业惯用说法汇编，不主张对其享有排他权利。厂商参数数据版权归上海美矿机械股份有限公司所有。本页不含报价。</p>
</div></footer>
</body></html>`;

mkdirSync(join(SITE, 'glossary'), { recursive: true });
writeFileSync(join(SITE, 'glossary', 'index.html'), page, 'utf8');
console.log('  /glossary/index.html  ' + (page.length / 1024).toFixed(1) + ' KB');
console.log('  ' + TERMS.length + ' 组术语 · ' + allTerms.length + ' 个词条 · ' + LANGS.length + ' 种语言');
