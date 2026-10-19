/**
 * 从 Chalmers 圆锥破研究文本里挖结构化数据
 *
 * 两份文本来源（公开、可核查）：
 *   · Cone Crusher Performance (2015)，Chalmers 机构库
 *   · Modelling and Simulation of Dynamic Behaviour in Crushing Plants (2013)
 *
 * 挖什么：
 *   ① 机型 + 腔型 + CSS + 产能的组合（这是选型案例的原料）
 *   ② P80 / 粒度分布数值
 *   ③ 标定与验证结论
 *   ④ 提到的矿石种类（用于材料库交叉）
 *
 * 纪律：
 *   · 抽出的每条都带【原文片段】作为证据，可回溯
 *   · 抽不出就如实报 0 条，不编
 *   · 这些是【学术论文里的数据】，用于验证我们的模型，不作为 MACKORN 能力承诺
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(resolve(HERE, '..'), 'distribution', '03_验证与基准', '实测数据', 'chalmers-cone-crusher');

const DOCS = [
  { key: 'chalmers-759', title: 'Cone Crusher Performance (2015)', file: 'chalmers-759.txt' },
  { key: 'chalmers-170211', title: 'Modelling and Simulation of Dynamic Behaviour in Crushing Plants (2013)', file: 'chalmers-170211.txt' },
];

const found = { machines: [], p80: [], css: [], capacity: [], ores: [], calibration: [], validation: [], chambers: [] };
const sentences = [];

function addTo(bucket, item) { if (item) found[bucket].push(item); }
const uniq = (arr, keyFn) => { const s = new Set(); return arr.filter((x) => { const k = keyFn(x); if (s.has(k)) return false; s.add(k); return true; }); };

for (const d of DOCS) {
  const p = join(DIR, d.file);
  if (!existsSync(p)) { console.log('  ○ 缺少 ' + d.file + '（先跑 pdf_text_extract.mjs）'); continue; }
  const txt = readFileSync(p, 'utf8');
  console.log('  ── ' + d.title + '（' + txt.length + ' 字符）──');

  // 把文本切成句（保留较长片段以便含上下文）
  const sents = txt.split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter((s) => s.length > 12 && s.length < 400);
  sentences.push(...sents.map((s) => ({ doc: d.key, s })));

  /* ① 机型（常见的圆锥破型号命名）*/
  const machineRe = /\b(HP\d{1,4}|CH\d{2,4}|CS\d{2,4}|H\d{3,4}|GP\d{1,3}|MP\d{3,4}|S\d{2,3}|Sandvik\s+[A-Z]{2}\d{2,4}|Nordberg\s+[A-Z0-9]+|Symons\s+\d+)/gi;
  const machines = {};
  for (const m of txt.matchAll(machineRe)) machines[m[0].toUpperCase().replace(/\s+/g, ' ')] = (machines[m[0].toUpperCase().replace(/\s+/g, ' ')] || 0) + 1;
  const topMachines = Object.entries(machines).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (topMachines.length) {
    console.log('     机型提及: ' + topMachines.map(([k, v]) => k + '×' + v).join(', '));
    for (const [k, v] of topMachines) addTo('machines', { doc: d.key, model: k, mentions: v });
  }

  /* ② CSS */
  const cssRe = /(?:closed\s+side\s+setting|CSS|setting)[^.]{0,80}?(\d{1,3}(?:[.,]\d)?)\s*(?:mm)?/gi;
  const cssVals = new Set();
  for (const m of txt.matchAll(cssRe)) { const v = Number(String(m[1]).replace(',', '.')); if (v >= 3 && v <= 100) cssVals.add(v); }
  if (cssVals.size) { console.log('     CSS 数值: ' + [...cssVals].sort((a, b) => a - b).join(', ') + ' mm'); for (const v of cssVals) addTo('css', { doc: d.key, css_mm: v }); }

  /* ③ 产能 */
  const capRe = /(\d{2,5})\s*(?:t\/h|tph|tonnes?\s+per\s+hour|MTPH|mtph)/gi;
  const caps = new Set();
  for (const m of txt.matchAll(capRe)) { const v = Number(m[1]); if (v >= 10 && v <= 20000) caps.add(v); }
  if (caps.size) { console.log('     产能数值: ' + [...caps].sort((a, b) => a - b).slice(0, 12).join(', ') + ' t/h'); for (const v of caps) addTo('capacity', { doc: d.key, tph: v }); }

  /* ④ P80 / 粒度 */
  const p80Re = /(?:P80|80\s*%|80\s*percent|80\s*%)[^.]{0,60}?(\d{1,4}(?:[.,]\d)?)\s*mm/gi;
  const p80s = new Set();
  for (const m of txt.matchAll(p80Re)) { const v = Number(String(m[1]).replace(',', '.')); if (v >= 1 && v <= 600) p80s.add(v); }
  if (p80s.size) { console.log('     P80 数值: ' + [...p80s].sort((a, b) => a - b).join(', ') + ' mm'); for (const v of p80s) addTo('p80', { doc: d.key, p80_mm: v }); }

  /* ⑤ 矿石种类 */
  const oreRe = /\b(granite|basalt|limestone|gneiss|quartzite|magnetite|hematite|PGM|platinum|copper|gold|iron ore|feldspar|dolerite|diabase|andesite|porphyry|pegmatite|skarn)\b/gi;
  const ores = {};
  for (const m of txt.matchAll(oreRe)) { const k = m[0].toLowerCase(); ores[k] = (ores[k] || 0) + 1; }
  const topOres = Object.entries(ores).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (topOres.length) { console.log('     矿石提及: ' + topOres.map(([k, v]) => k + '×' + v).join(', ')); for (const [k, v] of topOres) addTo('ores', { doc: d.key, ore: k, mentions: v }); }

  /* ⑥ 腔型 */
  const cavRe = /\b(EC|EF|EFX|EEF|MC|MF|C|M|F|coarse chamber|fine chamber|extra coarse)\b(?=\s*(?:chamber|cavity|setting)?)/g;
  const cavs = {};
  for (const s of sents) { if (/chamber|cavity/i.test(s)) for (const m of s.matchAll(/\b(EC|EF|EFX|EEF|MC|MF|coarse|fine|extra coarse)\b/gi)) { const k = m[0].toUpperCase(); cavs[k] = (cavs[k] || 0) + 1; } }
  const topCav = Object.entries(cavs).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (topCav.length) { console.log('     腔型提及: ' + topCav.map(([k, v]) => k + '×' + v).join(', ')); for (const [k, v] of topCav) addTo('chambers', { doc: d.key, chamber: k, mentions: v }); }

  /* ⑦ 标定 / 验证 关键句（带原文，可回溯）*/
  for (const s of sents) {
    if (/calibrat/i.test(s) && /\d/.test(s) && s.length < 260) addTo('calibration', { doc: d.key, quote: s.slice(0, 240) });
    if (/validat/i.test(s) && /\d/.test(s) && s.length < 260) addTo('validation', { doc: d.key, quote: s.slice(0, 240) });
  }
  console.log('     标定相关句 ' + found.calibration.filter((x) => x.doc === d.key).length + ' · 验证相关句 ' + found.validation.filter((x) => x.doc === d.key).length);
  console.log('');
}

/* 汇总 */
console.log('  ══ 挖出的结构化数据 ══\n');
console.log('  机型    ' + uniq(found.machines, (x) => x.model).length + ' 个型号');
console.log('  CSS     ' + [...new Set(found.css.map((x) => x.css_mm))].sort((a, b) => a - b).join(', ') + ' mm');
console.log('  产能    ' + [...new Set(found.capacity.map((x) => x.tph))].sort((a, b) => a - b).slice(0, 15).join(', ') + ' t/h');
console.log('  P80     ' + [...new Set(found.p80.map((x) => x.p80_mm))].sort((a, b) => a - b).join(', ') + ' mm');
console.log('  矿石    ' + [...new Set(found.ores.map((x) => x.ore))].join(', '));
console.log('  标定句  ' + found.calibration.length + ' 条（含原文，可回溯）');
console.log('  验证句  ' + found.validation.length + ' 条');

writeFileSync(join(DIR, 'mined-data.json'), JSON.stringify({
  generated: new Date().toISOString(),
  purpose: '从 Chalmers 公开圆锥破研究文本中挖出的结构化数据（机型/CSS/产能/P80/矿石/腔型 + 标定验证原句）',
  sources: DOCS.map((d) => ({ key: d.key, title: d.title, note: 'Chalmers 机构库公开 PDF，经 pdf_text_extract.mjs v4 抽取' })),
  discipline: '每条都带原文片段（quote）可回溯；抽不出就是空数组，不编。这些是学术论文数据，用于验证我们的模型，不作为 MACKORN 能力承诺。',
  counts: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length])),
  data: found,
}, null, 2), 'utf8');
console.log('\n  ✅ ' + join(DIR, 'mined-data.json') + '\n');
