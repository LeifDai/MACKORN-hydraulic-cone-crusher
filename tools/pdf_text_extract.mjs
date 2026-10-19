/**
 * PDF 文本抽取 v4 —— 修正 v3 的扫描器 bug，并做分页重建
 *
 * ══ 四轮踩坑全记录（每一条都真实发生，如实保留 —— 这就是"把教训编程进程序"）══
 *   v1  靠 `endstream` 字符串找边界 → 二进制里有假 endstream，534 个流解压失败
 *   v2  改用 `/Length N` 精确切流 → 解压对了，但【正则灾难性回溯】把脚本挂死：
 *       模式 `\[((?:[^[\]]|\\.)*)\]` 在长内容流上指数回溯
 *   v3  改手写线性扫描器 → 不挂了，但【抽到 0 字符】（扫描器状态机有 bug）
 *   v4  回到有界正则（`{1,}` 量词限定 + 只对已确认是内容流的流做匹配）→ 成功
 *
 * 关键教训：v3 失败后我差点得出"这份 PDF 没有文本层"的结论 ——
 *          实际上文本一直都在，是我的抽取器错了。
 *          **"查不到"之前必须先排除"我查的方法不对"**（这条要编进教训）。
 *
 * ⚠️ 局限（如实）：不做坐标重排，文本顺序按内容流出现顺序；
 *    用于找关键数字与表格，不用于逐字引用原文。
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = process.argv[2] || join(resolve(HERE, '..'), 'distribution', '03_验证与基准', '实测数据', 'chalmers-cone-crusher');

/* ── 解压全部 FlateDecode 流 ── */
function inflateAll(buf) {
  const raw = buf.toString('latin1');
  const re = /\/Length\s+(\d+)([\s\S]{0,300}?)stream\r?\n/g;
  const out = [];
  let m, ok = 0, fail = 0, image = 0;
  while ((m = re.exec(raw)) !== null) {
    const len = Number(m[1]);
    const start = m.index + m[0].length;
    if (/\/DCTDecode|\/JPXDecode|\/CCITTFaxDecode|\/JBIG2Decode/.test(m[2])) { image += 1; re.lastIndex = start + len; continue; }
    if (!(len > 0 && len < 40 * 1024 * 1024)) { fail += 1; re.lastIndex = start + len; continue; }
    const body = Buffer.from(raw.slice(start, start + len), 'latin1');
    let d = null;
    try { d = inflateSync(body, { maxOutputLength: 64 * 1024 * 1024 }); } catch { }
    if (d && d.length) { ok += 1; out.push(d.toString('latin1')); } else fail += 1;
    re.lastIndex = start + len;
  }
  return { streams: out, ok, fail, image };
}

/* ── 从单个内容流抽文本（有界正则，无回溯风险）── */
/**
 * TJ 数组里的数字是【位移量】，单位是 1/1000 em。
 * PDF 规范规定：数组中的数值从当前文本位置中【减去】，因此
 *   负值 = 向右移动 = 词间空格（这是排版 PDF 最常见的情况）
 *   正值 = 向左移动 = 字距收紧
 * v4 早期版本把数字全丢了 → 抽出 "HESISFORTHE" 而不是 "HESIS FOR THE"。
 * v5 按位移量补回空格：|offset| ≥ 阈值 视为一个空格。
 */
const SPACE_THRESHOLD = 120;   // 1/1000 em。经验值：词间空格的位移通常 ≥ 150；字距微调通常 < 100

function textOfStream(t) {
  const parts = [];
  // Tj：单串
  for (const m of t.matchAll(/\(((?:\\.|[^\\()]){1,4000})\)\s*Tj/g)) parts.push(m[1]);
  // TJ：数组，需解析数字位移补空格
  for (const m of t.matchAll(/\[((?:[^\[\]]){1,20000})\]\s*TJ/g)) {
    const arr = m[1];
    // 按顺序扫描：字符串 → 文本；数字 → 按位移量决定是否补空格
    for (const tok of arr.matchAll(/\(((?:\\.|[^\\()]){0,4000})\)|(-?\d+(?:\.\d+)?)/g)) {
      if (tok[1] !== undefined) parts.push(tok[1]);
      else {
        const off = Number(tok[2]);
        if (Number.isFinite(off) && off <= -SPACE_THRESHOLD) parts.push(' ');
      }
    }
  }
  // ' 与 " 操作符（换行后显示）
  for (const m of t.matchAll(/\(((?:\\.|[^\\()]){1,4000})\)\s*['"]/g)) parts.push(' ' + m[1]);
  let text = parts.join('');
  text = text.replace(/\\(\d{1,3})/g, (_, o) => { const c = parseInt(o, 8); return c >= 32 && c < 127 ? String.fromCharCode(c) : ' '; });
  text = text.replace(/\\([()\\])/g, '$1');
  // 合并多余空格
  text = text.replace(/[ \t]{2,}/g, ' ');
  return text;
}

/** 判断是否像内容流 */
const isContent = (t) => /BT[\s\S]{0,400}?ET/.test(t) && /\/[A-Za-z0-9+]+\s+[\d.]+\s+Tf/.test(t);

/* ⚠️ R65：原来只接受【目录】（readdirSync(DIR)）—— 直接传一个 .pdf 文件会崩
 *    （ENOTDIR: scandir ...pdf）。这恰恰是 L-33 教训的实例：
 *      "查不到"之前必须先排除"我查的方法不对"——工具不能因为只会处理目录，
 *      就把"传进来一个文件"变成一句崩溃，更不该让人以为"这个 PDF 没有内容"。
 *    现在：参数是文件就只处理它；是目录就扫目录。 */
let files = [];
let baseDir = DIR;
try {
  const st = statSync(DIR);
  if (st.isFile()) { files = [basename(DIR)]; baseDir = dirname(DIR); }
  else files = readdirSync(DIR).filter((f) => /\.pdf$/i.test(f));
} catch (e) {
  /* ⚠️ R65 教训（本会话真实踩到）：这段 catch 最初吞掉了 ReferenceError
   *    （statSync 忘了 import），却打印"路径不存在"——把【我的方法错】
   *    说成了【对象不存在】。这正是 L-33 的教训本身。
   *    所以：区分错误类型，别把所有异常都说成"路径不存在"。 */
  const msg = String(e && e.message || e);
  if (/ENOENT|not exist/i.test(msg)) console.error('  ❌ 路径不存在：' + DIR);
  else if (/ENOTDIR/i.test(msg)) console.error('  ❌ 路径类型不符：' + DIR);
  else console.error('  ❌ 读取失败（不是路径问题，是脚本自身出错）：' + msg.slice(0, 120));
  process.exit(2);
}
console.log('\n' + '═'.repeat(100));
console.log('  PDF 文本抽取 v4（有界正则 + 内容流判定）');
console.log('═'.repeat(100) + '\n');

const KW = ['sieve', 'cumulative', 'passing', 'P80', 'closed side', 'throughput', 'capacity', 't/h', 'calibrat', 'validat', 'chamber', 'eccentric', 'throw', 'css', 'whiten', 'stroke', 'crushing'];
const report = [];

for (const f of files) {
  const buf = readFileSync(join(baseDir, f));
  const t0 = Date.now();
  const { streams, ok, fail, image } = inflateAll(buf);
  const contentStreams = streams.filter(isContent);
  const texts = contentStreams.map(textOfStream).filter((x) => x.trim().length);
  const full = texts.join('\n');
  const ms = Date.now() - t0;

  console.log('  ── ' + f + '（' + Math.round(buf.length / 1024) + ' KB）──');
  console.log('     流: 解压 ' + ok + ' · 失败 ' + fail + ' · 图像跳过 ' + image);
  console.log('     内容流 ' + contentStreams.length + ' · 有文本的 ' + texts.length);
  console.log('     抽取文本 ' + full.length + ' 字符 · 耗时 ' + ms + ' ms');

  const hits = KW.filter((k) => new RegExp('\\b' + k, 'i').test(full));
  console.log('     命中关键词: ' + (hits.join(', ') || '无'));

  const printable = full ? (full.match(/[\x20-\x7E]/g) || []).length / full.length : 0;
  let status = 'failed';
  if (full.length > 300 && printable > 0.85) {
    status = 'ok';
    writeFileSync(join(baseDir, f.replace(/\.pdf$/i, '.txt')), full, 'utf8');
    console.log('     ✅ 已写 ' + f.replace(/\.pdf$/i, '.txt'));
    // 找含 mm / % / t/h 的句子
    const sents = full.split(/(?<=[.!?])\s+/).filter((s) => /[\d.]+\s*(?:mm|%|t\/h)/i.test(s) && s.length < 220).slice(0, 5);
    if (sents.length) { console.log('     数值片段：'); sents.forEach((s) => console.log('       · ' + s.trim().slice(0, 130))); }
  } else {
    console.log('     ❌ 仍抽不出可读文本（printable ' + (printable * 100).toFixed(0) + '%）—— 如实报告');
  }
  report.push({ file: f, kb: Math.round(buf.length / 1024), streams_ok: ok, streams_fail: fail, image_streams: image, content_streams: contentStreams.length, texts_found: texts.length, text_chars: full.length, printable_ratio: +printable.toFixed(3), keywords: hits, status, ms });
  console.log('');
}

writeFileSync(join(baseDir, 'extraction-report.json'), JSON.stringify({
  generated: new Date().toISOString(),
  tool: 'pdf_text_extract.mjs v4',
  source: 'Chalmers 机构库公开 PDF（Cone Crusher Performance 2015 / Dynamic Behaviour in Crushing Plants 2013）',
  lesson: 'v3 失败后差点断言"该 PDF 没有文本层"——实际是抽取器有 bug。查不到之前必须先排除"我查的方法不对"。',
  files: report,
}, null, 2), 'utf8');
console.log('  报告: ' + join(baseDir, 'extraction-report.json') + '\n');
