/**
 * 独立验证：用 Evertsson/Chalmers 论文的真实实验参数跑我们的模型
 *
 * 数据来源（S3 文献）：
 *   Evertsson C.M., "Cone Crusher Performance", Chalmers thesis 759
 *   → eccentric speed 269 rpm
 *   → CSS varies with 1 mm steps between 8 and 16 mm
 *
 * 纪律：Evertsson 用他自己的模型，我们的是 Whiten(1972)，不是同一套 ——
 *   因此只做【量级与趋势】一致性判断，不做逐点数值比对。
 *   真正的逐点验证需要 MACKORN 现场筛析数据（S5）。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');

const mod = await import(pathToFileURL(join(ROOT, 'plugin', 'index.mjs')).href);
const defs = mod.toolDefinitions || [];
const curve = defs.find((t) => t.name === 'mackorn_crusher_curve');
if (!curve) { console.log('  ❌ 找不到 mackorn_crusher_curve'); process.exit(1); }

const SPEED = 269;
const CSS_LIST = [8, 9, 10, 11, 12, 13, 14, 15, 16];
const rows = [];

console.log('');
console.log('  ══ 独立验证：Evertsson 真实参数（269 rpm, CSS 8-16mm）跑我们的 Whiten 模型 ══');
console.log('');
console.log('  CSS   P80(mm)  破碎比  比能耗(kWh/t)');

for (const css of CSS_LIST) {
  let r = null;
  try {
    r = await curve.execute({ css_mm: css, feed_p80_mm: 40, speed_rpm: SPEED, throw_mm: 25 });
  } catch (e) { rows.push({ css, ok: false, err: String(e.message).slice(0, 50) }); continue; }
  const p80 = r.p80_mm ?? r.product_p80_mm ?? r.p80 ?? null;
  const ratio = r.reduction_ratio ?? null;
  const energy = r.energy_kwh_t ?? r.specific_energy_kwh_t ?? null;
  rows.push({ css, ok: p80 != null, p80: p80 == null ? null : Number(Number(p80).toFixed(2)), ratio: ratio == null ? null : Number(Number(ratio).toFixed(2)), energy: energy == null ? null : Number(Number(energy).toFixed(2)) });
  const last = rows[rows.length - 1];
  console.log('  ' + String(css).padStart(3) + '   ' + String(last.p80 ?? '—').padStart(7) + '  ' + String(last.ratio ?? '—').padStart(6) + '  ' + String(last.energy ?? '—').padStart(10));
}
console.log('');

const good = rows.filter((r) => r.ok && r.p80 != null);
const findings = [];
if (good.length >= 3) {
  const s = [...good].sort((a, b) => a.css - b.css);
  let mono = true;
  for (let i = 1; i < s.length; i += 1) if (s[i].p80 < s[i - 1].p80) mono = false;
  findings.push({ check: 'CSS 增大 → 产品变粗（单调）', pass: mono, note: mono ? '与 Chalmers 定性结论一致' : '⚠ 违反定性预期' });

  const ratios = s.map((r) => r.p80 / r.css);
  const lo = Math.min(...ratios), hi = Math.max(...ratios);
  findings.push({ check: 'P80/CSS 落在 0.8–4 倍', pass: lo > 0.8 && hi < 4, note: '实测 ' + lo.toFixed(2) + '–' + hi.toFixed(2) + '（圆锥破文献典型区间）' });

  const e = s.filter((r) => r.energy != null);
  if (e.length >= 3) {
    const eOk = e[0].energy >= e[e.length - 1].energy;
    findings.push({ check: 'CSS 减小 → 比能耗增大', pass: eOk, note: eOk ? '与 Bond 理论一致' : '⚠ 违反预期' });
  }
}
console.log('  ── 一致性判断 ──');
for (const f of findings) console.log('  ' + (f.pass ? '✅' : '⚠️') + ' ' + f.check.padEnd(28) + f.note);
console.log('');

mkdirSync(D, { recursive: true });
writeFileSync(join(D, '独立验证-Evertsson参数.json'), JSON.stringify({
  generated: new Date().toISOString(),
  purpose: '用 Evertsson/Chalmers 论文的真实实验参数（269 rpm, CSS 8-16mm）独立验证我们的 Whiten 实现',
  source: 'S3 文献 — Evertsson C.M., Cone Crusher Performance, Chalmers thesis 759',
  source_params: { eccentric_speed_rpm: 269, css_range_mm: [8, 16], feed_note: '0-250mm 经粗碎' },
  results: rows,
  findings,
  discipline_note: 'Evertsson 用他自己的模型，我们是 Whiten(1972)，不是同一套 —— 只做量级与趋势一致性判断，不做逐点比对。逐点验证需 MACKORN 现场筛析数据（S5）',
}, null, 2), 'utf8');
console.log('  已写 distribution/03_验证与基准/独立验证-Evertsson参数.json');
console.log('');
