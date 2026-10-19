/**
 * 生成 SVG 二维码（用 npm 自带 qrcode 编码器，无外部依赖）
 *
 * 为什么用 SVG：
 *   纯文本、无损缩放、体积极小（几 KB）、可直接内联进 HTML，不依赖任何图床或第三方 API。
 *
 * 用途：
 *   把 /contact/ 联系方式页做成二维码 —— 客户一扫就看到全部联系方式与微信。
 *
 * 用法：node tools/gen_qr_svg.mjs "<内容>" "<输出文件>" [像素尺寸]
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const require_ = createRequire(import.meta.url);

/* 复用 npm CLI 自带的 QR 编码器（vendor 目录，无外部依赖） */
const VENDOR = join(ROOT, 'distribution', '_npmcli', 'node_modules', 'npm', 'node_modules', 'qrcode-terminal', 'vendor', 'QRCode');
const QRCode = require_(VENDOR);
const QRErrorCorrectLevel = require_(join(VENDOR, 'QRErrorCorrectLevel'));

/**
 * @param {string} text 编码内容
 * @param {number} [size] 输出边长像素
 * @param {'L'|'M'|'Q'|'H'} [level] 纠错级别（H 最抗损，适合印刷）
 * @returns {string} SVG 字符串
 */
export function qrSvg(text, size = 240, level = 'M') {
  const qr = new QRCode(-1, QRErrorCorrectLevel[level] ?? QRErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;                      // 静默区（QR 规范要求 ≥4 模块）
  const total = n + quiet * 2;
  const s = size / total;
  const cells = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        const x = ((c + quiet) * s).toFixed(2);
        const y = ((r + quiet) * s).toFixed(2);
        cells.push(`<rect x="${x}" y="${y}" width="${(s + 0.02).toFixed(2)}" height="${(s + 0.02).toFixed(2)}"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code: ${text.replace(/[<>&"]/g, '')}"><rect width="${size}" height="${size}" fill="#ffffff"/><g fill="#111111">${cells.join('')}</g></svg>`;
}

/* 直接运行时：命令行生成 */
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [text, out, sizeArg] = process.argv.slice(2);
  if (!text || !out) {
    console.log('用法: node tools/gen_qr_svg.mjs "<内容>" "<输出.svg>" [像素]');
    process.exit(1);
  }
  const svg = qrSvg(text, Number(sizeArg) || 240, 'M');
  writeFileSync(out, svg, 'utf8');
  console.log('  ✅ ' + out + '  (' + svg.length + ' 字节, 内容: ' + text + ')');
}
