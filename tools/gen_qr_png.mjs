/**
 * 生成 PNG 二维码（用于视觉验证 + 印刷）
 *
 * 为什么要 PNG：
 *   1. 视觉验证 —— 必须亲眼看它是不是一个合法二维码，不能只看"生成成功"
 *   2. 印刷/微信分享 —— PNG 兼容性最好
 *
 * 扫码可靠性要点（已按此实现）：
 *   · 模块色用近黑（#111111），不用深蓝 —— 对比度最高，弱光下也能扫
 *   · 静默区 ≥4 模块（QR 规范要求，微信扫码尤其依赖）
 *   · 纠错级别 H（30% 容错）—— 印刷磨损、屏幕反光都还能扫
 *   · 短 URL —— 模块数少、格子大，远距离也能扫
 */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const VENDOR = join(ROOT, 'distribution', '_npmcli', 'node_modules', 'npm', 'node_modules', 'qrcode-terminal', 'vendor', 'QRCode');
const QRCode = require_(VENDOR);
const QRErrorCorrectLevel = require_(join(VENDOR, 'QRErrorCorrectLevel'));

/** 取二维码模块矩阵（true=黑） */
export function qrMatrix(text, level = 'H') {
  const qr = new QRCode(-1, QRErrorCorrectLevel[level] ?? QRErrorCorrectLevel.H);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const m = [];
  for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(qr.isDark(r, c)); m.push(row); }
  return m;
}

/** 写 PGM（P2 ASCII）——零依赖，PIL 可直接读 */
export function qrPgm(text, outPath, px = 8, level = 'H', fg = 17) {
  const m = qrMatrix(text, level);
  const n = m.length;
  const quiet = 4;
  const total = n + quiet * 2;
  const size = total * px;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const my = Math.floor(y / px) - quiet;
    const row = [];
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / px) - quiet;
      let v = 255;
      if (my >= 0 && my < n && mx >= 0 && mx < n && m[my][mx]) v = fg;
      row.push(v);
    }
    rows.push(row.join(' '));
  }
  writeFileSync(outPath, `P2\n# QR for ${text}\n${size} ${size}\n255\n` + rows.join('\n') + '\n', 'utf8');
  return { size, modules: n, level };
}

export { QRCode, QRErrorCorrectLevel };

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [text, out, pxArg] = process.argv.slice(2);
  if (!text || !out) { console.log('用法: node tools/gen_qr_png.mjs "<内容>" "<输出.pgm>" [每格像素]'); process.exit(1); }
  const info = qrPgm(text, out, Number(pxArg) || 8);
  console.log(`  PGM: ${out}  ${info.size}×${info.size} px · ${info.modules}×${info.modules} 模块 · 纠错 ${info.level}`);
}
