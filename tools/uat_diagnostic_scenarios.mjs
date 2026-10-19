/**
 * UAT 第三批 —— 技术诊断类问法
 *
 * 目标：继续系统找"不回答用户真实问题"的缺口。
 * 这批针对【设备已运行、用户想知道怎么办】的场景 —— 这是复购与技术服务的主战场：
 *   UAT-14 给料级配：我的给料级配行不行
 *   UAT-15 衬板寿命：衬板多久换一次
 *   UAT-16 粒度分布：这台机打出来什么粒度
 *   UAT-17 流程仿真：这条线最终出料多细、循环负荷多少
 *   UAT-18 冷却/堵塞：产品里细粉太多怎么办（用孔隙率工具）
 */
import { pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const m = await import(pathToFileURL(join(ROOT, 'plugin', 'index.mjs')).href);
const T = Object.fromEntries(m.toolDefinitions.map((d) => [d.name, d]));

const SC = [
  {
    id: 'UAT-14', title: '给料级配：我的给料级配行不行',
    ask: '我的圆锥破给料筛余（累积）是 100/88/70/52/38/26/15/8，给料最大 60mm，目标 12mm，帮我看看给料有没有问题',
    run: async () => ({ mcfm: await T.mackorn_mcfm_analysis.execute({ cumulative_retained: [100, 88, 70, 52, 38, 26, 15, 8], feed_top_mm: 60, target_product_mm: 12 }) }),
    judge: (r) => {
      const x = r.mcfm;
      const s = JSON.stringify(x);
      return [
        ['算出模数 M', /mcfm|模数|M\s*=/i.test(s)],
        ['给出是否在最优窗口的判断', /optimal|最优|窗口|4\.0|4\.5/i.test(s)],
        ['给出可执行调整建议', /建议|调整|advice/i.test(s)],
      ];
    },
  },
  {
    id: 'UAT-15', title: '衬板寿命：衬板多久换一次',
    ask: '我的圆锥破衬板磨损很快，怎么设计能延长寿命',
    run: async () => ({ wear: await T.mackorn_wear_design.execute({ sections: 5 }) }),
    judge: (r) => {
      const x = r.wear;
      const s = JSON.stringify(x);
      return [
        ['给出磨损均匀度', /uniformity|均匀度/i.test(s)],
        ['给出分区硬度设计', /hardness|硬度|梯度/i.test(s)],
        ['说明数据来源（合成或实测）', /合成|实测|synthetic|measured|示例/i.test(s)],
      ];
    },
  },
  {
    id: 'UAT-16', title: '粒度分布：这台机打出来什么粒度',
    ask: 'CSS 16mm，给料 P80 是 120mm，打出来产品粒度大概多少',
    run: async () => ({ curve: await T.mackorn_crusher_curve.execute({ css_mm: 16, feed_p80_mm: 120, ore: '花岗岩' }) }),
    judge: (r) => {
      const x = r.curve;
      return [
        ['给出产品 P80', Number.isFinite(x.product_p80_mm)],
        ['给出破碎比', Number.isFinite(x.reduction_ratio)],
        ['给出误差区间', !!(x.uncertainty && x.uncertainty.interval_mm)],
        ['自报质量守恒', !!(x.mass_balance && (x.mass_balance.sum_error != null))],
      ];
    },
  },
  {
    id: 'UAT-17', title: '流程仿真：这条线最终出料多细、循环负荷多少',
    ask: '中碎 CSS 40mm + 筛 20mm + 细碎 CSS 12mm 这条闭路，最终 P80 多少，循环负荷多少',
    run: async () => ({ flow: await T.mackorn_simulate_flowsheet.execute({ feed_p80_mm: 300, stages: [{ type: 'crusher', name: '中碎', css_mm: 40 }, { type: 'screen', name: '检查筛', aperture_mm: 20 }, { type: 'crusher', name: '细碎', css_mm: 12 }] }) }),
    judge: (r) => {
      const x = r.flow;
      return [
        ['给出最终 P80', Number.isFinite(x.final_p80_mm)],
        ['给出循环负荷', !!(x.circulating_load != null || JSON.stringify(x).match(/circulat|循环/i))],
        ['给出各段结果', Array.isArray(x.stages) && x.stages.length >= 2],
        ['给出不确定性', !!(x.uncertainty && x.uncertainty.sigma_pct != null)],
      ];
    },
  },
  {
    id: 'UAT-18', title: '细粉太多：产品里细粉多怎么办',
    ask: '我的产品里细粉太多，是不是给料级配有问题',
    run: async () => ({
      gp: await T.mackorn_grading_porosity.execute({ coarse_frac: 0.25, mid_frac: 0.25, fine_frac: 0.5 }),
    }),
    judge: (r) => {
      const s = JSON.stringify(r.gp);
      return [
        ['给出孔隙率', /porosity|孔隙率|φ/i.test(s)],
        ['对比最优配比', /optimal|最优|窗口|0\.28/i.test(s)],
        ['给出改进方向', /建议|调整|改善|advice/i.test(s)],
      ];
    },
  },
];

console.log('\n' + '═'.repeat(102));
console.log('  UAT 第三批 —— 技术诊断类问法（设备已运行场景）');
console.log('═'.repeat(102) + '\n');

let total = 0, pass = 0;
for (const sc of SC) {
  console.log('  ── ' + sc.id + '　' + sc.title + ' ──');
  let r = null, err = null;
  const t0 = Date.now();
  try { r = await sc.run(); } catch (e) { err = e; }
  const ms = Date.now() - t0;
  if (err) { console.log('     ❌ 执行失败: ' + String(err.message).slice(0, 80)); console.log(''); continue; }
  const checks = sc.judge(r);
  const okN = checks.filter(([, ok]) => ok).length;
  total += checks.length; pass += okN;
  checks.forEach(([n, ok]) => console.log('       ' + (ok ? '✅' : '❌') + ' ' + n));
  console.log('     ' + (okN === checks.length ? '✅' : '⚠️') + ' ' + okN + '/' + checks.length + '　' + ms + ' ms');
  console.log('');
}
console.log('═'.repeat(102));
console.log('  第三批 UAT 合计 ' + pass + '/' + total + (pass === total ? '  ✅' : '  ⚠️ 有缺口'));
console.log('');
process.exit(pass === total ? 0 : 1);
