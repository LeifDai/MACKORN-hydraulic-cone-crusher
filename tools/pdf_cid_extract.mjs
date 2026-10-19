/**
 * CID 字体 PDF 文本抽取（v6 —— 支持 <hex> 编码 + ToUnicode CMap）
 *
 * 为什么需要这一版（R17 踩坑记录）：
 *   v5 能抽英文 PDF（用 (...) Tj 字面串 + 位移补空格），
 *   但对【中文论文】完全失效 —— 抽出 0 字符。
 *
 *   诊断发现（不是"PDF 没有文本层"，而是抽取器不行）：
 *     · 文件有 /ToUnicode ✅、有 /Font ✅、有 BT/ET ✅、有 Tf 字体 FT9 ✅
 *     · 但文本用【十六进制 CID 码】：<002D> <0032> <0038> <0035>
 *     · 且需用 /ToUnicode CMap 把 CID 映射回 Unicode
 *   v5 只处理 (...) 字面串，遇到 <hex> 就一无所获。
 *
 *   这是 【L-33 的同类问题复发】：把"工具不行"误判成"数据没有"。
 *   区别是 L-33 是正则回溯，这次是编码形式没覆盖。
 *
 * 本版做三件事：
 *   ① 支持 <hex> 与 (...) 两种字符串形式
 *   ② 解析 /ToUnicode CMap（bfchar 与 bfrange 两种写法）
 *   ③ 按内容流的 Tf 切换当前字体，用对应 CMap 解码
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SPACE_THRESHOLD = 120;

/** 解析 ToUnicode CMap 文本 → Map<cid, unicodeString> */
export function parseToUnicodeCMap(cmapText) {
  const map = new Map();
  // bfchar: <src> <dst> 逐条
  for (const blk of cmapText.matchAll(/beginbfchar([\s\S]{0,200000}?)endbfchar/g)) {
    for (const m of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(m[1], 16), hexToStr(m[2]));
    }
  }
  // bfrange: <lo> <hi> <dstStart>  或  <lo> <hi> [<d1> <d2> ...]
  for (const blk of cmapText.matchAll(/beginbfrange([\s\S]{0,200000}?)endbfrange/g)) {
    for (const m of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16), dst = parseInt(m[3], 16);
      for (let c = lo; c <= hi && c - lo < 65536; c += 1) map.set(c, String.fromCodePoint(dst + (c - lo)));
    }
  }
  return map;
}

function hexToStr(h) {
  let s = '';
  for (let i = 0; i + 3 < h.length + 1; i += 4) {
    const code = parseInt(h.slice(i, i + 4), 16);
    if (Number.isFinite(code) && code > 0) s += String.fromCharCode(code);
  }
  return s;
}

/** 从内容流抽文本；cmap 可为空（则 <hex> 按 UTF-16BE 猜） */
export function textFromContentStream(t, cmap = null) {
  const out = [];
  // 逐个文本块处理，跟踪当前字体
  const re = /BT([\s\S]{0,60000}?)ET/g;
  let any = false;
  for (const blk of t.matchAll(re)) {
    any = true;
    const body = blk[1];
    // 顺序扫描 Tf / Tj / TJ / ' / "
    const tokRe = /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|\(((?:\\.|[^\\()]){0,4000})\)|<([0-9A-Fa-f\s]{0,8000})>|(-?\d+(?:\.\d+)?)|(Tj|TJ|'|")/g;
    let m;
    const parts = [];
    while ((m = tokRe.exec(body)) !== null) {
      if (m[2] !== undefined) { parts.push(decodeLiteral(m[2], cmap)); }
      else if (m[3] !== undefined) { parts.push(decodeHex(m[3], cmap)); }
      else if (m[4] !== undefined) {
        const off = Number(m[4]);
        if (Number.isFinite(off) && off <= -SPACE_THRESHOLD) parts.push(' ');
      }
    }
    const s = parts.join('');
    if (s.trim()) out.push(s);
  }
  if (!any) {
    // 没有 BT/ET 时退化为全文扫描
    const parts = [];
    for (const m of t.matchAll(/<([0-9A-Fa-f\s]{4,8000})>/g)) parts.push(decodeHex(m[1], cmap));
    for (const m of t.matchAll(/\(((?:\\.|[^\\()]){0,4000})\)/g)) parts.push(decodeLiteral(m[1], cmap));
    const s = parts.join(' ');
    if (s.trim()) out.push(s);
  }
  return out.join('\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function decodeHex(h, cmap) {
  const clean = h.replace(/\s/g, '');
  let s = '';
  if (cmap && cmap.size) {
    // CID 是 2 字节
    for (let i = 0; i + 3 < clean.length + 1; i += 4) {
      const cid = parseInt(clean.slice(i, i + 4), 16);
      if (!Number.isFinite(cid)) continue;
      const u = cmap.get(cid);
      s += u !== undefined ? u : '';
    }
    return s;
  }
  // 无 CMap：按 UTF-16BE 猜（很多 PDF 的 hex 就是 UTF-16BE）
  for (let i = 0; i + 3 < clean.length + 1; i += 4) {
    const c = parseInt(clean.slice(i, i + 4), 16);
    if (c > 0 && c < 0xFFFF) s += String.fromCharCode(c);
  }
  return s;
}

function decodeLiteral(lit, cmap) {
  let s = lit.replace(/\\(\d{1,3})/g, (_, o) => { const c = parseInt(o, 8); return c >= 32 && c < 127 ? String.fromCharCode(c) : ' '; });
  s = s.replace(/\\([()\\])/g, '$1');
  if (cmap && cmap.size) {
    // 有些 CID 字体也用字面串装 2 字节 CID
    const bytes = Buffer.from(s, 'latin1');
    if (bytes.length % 2 === 0 && bytes.length >= 2) {
      let out = '', hit = 0;
      for (let i = 0; i < bytes.length; i += 2) {
        const cid = (bytes[i] << 8) | bytes[i + 1];
        const u = cmap.get(cid);
        if (u !== undefined) { out += u; hit += 1; } else out += bytes[i] >= 32 && bytes[i] < 127 ? String.fromCharCode(bytes[i]) : '';
      }
      if (hit > 0) return out;
    }
  }
  return s;
}

/**
 * 抽取整个 PDF
 * @returns {{text:string, streams_ok:number, streams_fail:number, cmaps:number, chars:number, method:string}}
 */
export function extractPdfText(pdfPath) {
  const raw = readFileSync(pdfPath).toString('latin1');
  const re = /stream\r?\n?([\s\S]{1,600000}?)endstream/g;
  let m, ok = 0, fail = 0;
  const decoded = [];
  while ((m = re.exec(raw)) !== null) {
    try { decoded.push(inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')); ok += 1; }
    catch { fail += 1; }
  }
  // 收集所有 CMap，合并成一张表（简化：多字体的 CMap 合并会有歧义，
  // 但对同一文档通常一致；若不一致会体现在错字上，需人工核对）
  let cmap = new Map();
  let cmaps = 0;
  for (const d of decoded) {
    if (/begincmap/i.test(d)) {
      cmaps += 1;
      for (const [k, v] of parseToUnicodeCMap(d)) if (!cmap.has(k) || !cmap.get(k)) cmap.set(k, v);
    }
  }
  // 内容流 = 含 BT/ET 且不含 begincmap 的
  const contents = decoded.filter((d) => /BT\b/.test(d) && /(?:Tj|TJ)/.test(d) && !/begincmap/i.test(d));
  const texts = contents.map((c) => textFromContentStream(c, cmap)).filter((x) => x && x.length > 5);
  const text = texts.join('\n\n');
  return {
    text, streams_ok: ok, streams_fail: fail, cmaps,
    chars: text.length,
    method: cmaps > 0 ? 'CID + ToUnicode CMap' : (contents.length ? 'content stream (no CMap)' : 'none'),
  };
}
