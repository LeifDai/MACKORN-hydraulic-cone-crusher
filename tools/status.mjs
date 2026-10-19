/**
 * 状态面板 —— 一眼看到"现在在干什么、卡在哪、离目标多远"
 *
 * 解决的问题：界面看不出智能体是卡住了还是在推进。
 * 这个脚本把所有运行状态聚合成一张面板。
 *
 * 用法：node tools/status.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync, openSync, closeSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const jread = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

const C = { r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m', g: '\x1b[32m', y: '\x1b[33m', rd: '\x1b[31m', c: '\x1b[36m' };
const bar = (pct, w = 22) => {
  const n = Math.round(Math.max(0, Math.min(100, pct)) / 100 * w);
  return '█'.repeat(n) + '░'.repeat(w - n);
};
const ago = (iso) => {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return s + ' 秒前';
  if (s < 3600) return Math.round(s / 60) + ' 分钟前';
  return Math.round(s / 3600) + ' 小时前';
};

console.log('\n' + C.b + '═'.repeat(80) + C.r);
console.log(C.b + '  MACKORN 全球交付 · 实时状态面板' + C.r + C.dim + '   ' + new Date().toLocaleString('zh-CN') + C.r);
console.log(C.b + '═'.repeat(80) + C.r);

/* ─── 1. 持续编排器 ─── */
console.log('\n' + C.b + '【1】持续编排器' + C.r);
const os_ = jread(join(D, '_orchestrator-status.json'));
if (!os_) {
  console.log('  ' + C.y + '○ 未启动' + C.r + C.dim + '  （node tools/orchestrate.mjs 启动）' + C.r);
} else {
  const icon = os_.ready ? C.g + '● 已通过' : C.y + '● 进行中';
  console.log('  ' + icon + C.r + '   阶段 ' + C.b + (os_.phase || '-') + C.r +
    '   轮次 ' + (os_.round || 0) + '/' + (os_.maxRounds || '-') +
    '   更新于 ' + ago(os_.updated));
  if (os_.score != null && os_.score > 0) console.log('  自检总分 ' + bar(os_.score) + ' ' + os_.score + '/100');
  if (os_.gaps?.length) {
    console.log('  ' + C.rd + '未达标 ' + os_.gaps.length + ' 项：' + C.r);
    for (const g of os_.gaps.slice(0, 8)) console.log('    ' + C.rd + '✗' + C.r + ' [' + g.dim + '] ' + g.item + '  ' + C.dim + g.detail + C.r);
  }
}

/* ─── 2. 海关数据抓取 ─── */
console.log('\n' + C.b + '【2】全球海关数据抓取' + C.r);
const tg = jread(join(D, 'trade-global.json'));
if (!tg) console.log('  ' + C.y + '尚无数据文件' + C.r);
else {
  const cs = Object.values(tg.countries || {});
  const w23 = cs.filter((c) => c.hs?.['847420']?.years?.['2023']?.usd != null);
  const wp = cs.filter((c) => c.hs?.['847490']?.years?.['2023']?.usd != null);
  const TARGET = 100;
  console.log('  国家进度   ' + bar(cs.length / 173 * 100) + ' ' + cs.length + '/173');
  console.log('  有 2023 破碎数据  ' + bar(w23.length / TARGET * 100) + ' ' + w23.length + '/' + TARGET +
    (w23.length >= TARGET ? '  ' + C.g + '✓ 达标' + C.r : '  ' + C.y + '差 ' + (TARGET - w23.length) + ' 国' + C.r));
  console.log('  有 2023 零件数据  ' + bar(wp.length / 50 * 100) + ' ' + wp.length + '/50' +
    (wp.length >= 50 ? '  ' + C.g + '✓' + C.r : ''));
  const top = w23.slice().sort((a, b) => b.hs['847420'].years['2023'].usd - a.hs['847420'].years['2023'].usd).slice(0, 8);
  if (top.length) {
    console.log('  ' + C.dim + '  前 8 大市场：' + top.map((c) => (c.zh || c.en) + ' $' + (c.hs['847420'].years['2023'].usd / 1e6).toFixed(0) + 'M').join(' · ') + C.r);
  }
}

/* ─── 3. 智能体团队 ─── */
console.log('\n' + C.b + '【3】智能体团队分工' + C.r);
const TASKS = [
  ['task-1', 'geology-mine', '地质与矿区', 'distribution/地质与矿区'],
  ['task-2', 'talent-hr', '人才与组织', 'distribution/人才与组织'],
  ['task-3', 'finance-lifecycle', '金融与全生命周期', 'distribution/金融与全生命周期'],
  ['task-4', 'logistics-export', '物流与交付', 'distribution/物流与交付'],
];
for (const [id, who, name, dir] of TASKS) {
  const full = join(ROOT, dir);
  let files = 0, bytes = 0;
  if (existsSync(full)) {
    const walk = (p) => { for (const e of readdirSync(p, { withFileTypes: true })) { const q = join(p, e.name); if (e.isDirectory()) walk(q); else { files++; bytes += statSync(q).size; } } };
    walk(full);
  }
  const st = files === 0 ? C.dim + '○ 未产出' : C.g + '● 产出中';
  console.log('  ' + st + C.r + '  ' + C.b + name.padEnd(16) + C.r + C.dim + who.padEnd(20) + C.r +
    (files ? files + ' 文件 / ' + (bytes / 1024).toFixed(0) + ' KB' : ''));
}

/* ─── 4. 五维自检 ─── */
console.log('\n' + C.b + '【4】五维自检（当前快照）' + C.r);
let auditOut = '';
try {
  const tmp = join(ROOT, '.status-audit.txt');
  const fd = openSync(tmp, 'w');
  spawnSync(process.execPath, [join(ROOT, 'tools', 'self_audit.mjs')], { cwd: ROOT, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  auditOut = read(tmp);
} catch (e) { auditOut = ''; }
if (!auditOut) console.log('  ' + C.y + '自检未运行' + C.r);
else {
  for (const m of auditOut.matchAll(/(外贸专家|网络专家|AI量化专家|计算机专家|渠道专家)\s+[█░]+\s+(\d+)\s*分\s+(.{0,30})/g)) {
    const sc = Number(m[2]);
    const col = sc >= 80 ? C.g : (sc >= 60 ? C.y : C.rd);
    console.log('  ' + m[1].padEnd(12) + col + bar(sc) + C.r + ' ' + String(sc).padStart(3) + ' 分  ' + C.dim + m[3].trim() + C.r);
  }
  const tot = auditOut.match(/总分\s+(\d+)\s*\/\s*100\s+判定：(.+)/);
  if (tot) {
    const sc = Number(tot[1]);
    console.log('  ' + '─'.repeat(70));
    console.log('  ' + C.b + '总分 ' + sc + '/100' + C.r + '   判定：' + (sc >= 85 ? C.g : C.rd) + tot[2].replace(/[✅❌]\s*/, '') + C.r);
  }
}

/* ─── 5. 官网与分发 ─── */
console.log('\n' + C.b + '【5】官网与分发通道' + C.r);
const SRC = join(D, '官网落地页');
let pages = 0; const langs = new Set();
if (existsSync(SRC)) {
  const walk = (p) => { for (const e of readdirSync(p, { withFileTypes: true })) { const q = join(p, e.name); if (e.isDirectory()) walk(q); else if (e.name === 'index.html') { pages++; const l = read(join(dirname(q), 'index.html')).match(/<html lang="([^"]+)"/); if (l) langs.add(l[1]); } } };
  walk(SRC);
}
const smN = (read(join(SRC, 'sitemap.xml')).match(/<loc>/g) || []).length;
const zipP = join(D, '官网部署包.zip');
console.log('  站点页面   ' + pages + ' 页 · ' + langs.size + ' 种语言 · sitemap ' + smN + ' URL');
console.log('  部署包     ' + (existsSync(zipP) ? (statSync(zipP).size / 1024).toFixed(0) + ' KB' + C.dim + '  （待人工上传）' + C.r : C.rd + '未生成' + C.r));

/* ─── 6. 下一步 ─── */
console.log('\n' + C.b + '【6】下一步（自动判定）' + C.r);
const steps = [];
if (!os_) steps.push('启动持续编排器：node tools/orchestrate.mjs');
else if (!os_.ready) {
  const dataGaps = (os_.gaps || []).filter((g) => /国家|数据量|破碎数据|零件数据|覆盖国家/.test(g.item));
  if (dataGaps.length) steps.push('继续抓取海关数据（还差 ' + dataGaps.map((g) => g.detail).join('；') + '）');
  const structGaps = (os_.gaps || []).filter((g) => !dataGaps.includes(g));
  for (const g of structGaps) steps.push('补齐结构性缺口：[' + g.dim + '] ' + g.item);
} else steps.push(C.g + '自检已通过 → 生成部署包，提交人工上传' + C.r);
if (steps.length) for (const s of steps) console.log('  → ' + s);
else console.log('  ' + C.dim + '无待办' + C.r);

console.log('\n' + C.b + '═'.repeat(80) + C.r + '\n');
