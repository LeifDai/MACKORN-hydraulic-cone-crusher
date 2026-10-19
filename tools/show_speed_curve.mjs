/**
 * 查看转速敏感性曲线（CLI）
 *
 * 用法：
 *   node tools/show_speed_curve.mjs
 *   node tools/show_speed_curve.mjs --css 40 --feed 200 --ore 玄武岩
 *
 * 用途：现场工程师拿这台机的工况跑一下，对照自己调速后的实际变化，
 *       判断本模型的转速响应在自己的工况下可不可信。
 */
import { speedSensitivity } from '../plugin/lib/speed-curve.mjs';

const argv = process.argv.slice(2);
const get = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const css = Number(get('css', 16));
const feed = Number(get('feed', 120));
const ore = get('ore', '花岗岩');
const throwMm = Number(get('throw', 25));

const r = speedSensitivity({ css_mm: css, feed_p80_mm: feed, ore, throw_mm: throwMm, speed_rpm: 300 });

console.log('\n' + '='.repeat(96));
console.log('  转速敏感性曲线 · CSS ' + css + ' mm · 给料 P80 ' + feed + ' mm · ' + ore);
console.log('='.repeat(96) + '\n');
console.log('  基准转速 ' + r.base_speed_rpm + ' rpm → 基准 P80 ' + r.base_p80_mm + ' mm\n');
console.log('  转速 rpm   P80 mm   相对基准   破碎比   能耗 kWh/t   说明');
console.log('  ' + '-'.repeat(78));
for (const x of r.rows) {
  const note = x.rpm > 400 ? '← 外推（文献实测会堵料）' : (x.rpm < 250 ? '← 低转速区不可信' : (x.rpm === r.base_speed_rpm ? '← 基准' : ''));
  console.log('  ' + String(x.rpm).padStart(6) + '   ' +
    (x.p80 != null ? x.p80.toFixed(2) : '  —').padStart(8) + '   ' +
    (x.p80_vs_base != null ? x.p80_vs_base.toFixed(3) : '  —').padStart(7) + '   ' +
    (x.reduction_ratio != null ? x.reduction_ratio.toFixed(2) : '—').padStart(6) + '   ' +
    (x.power_kwh_t != null ? x.power_kwh_t.toFixed(2) : '—').padStart(10) + '   ' + note);
}
console.log('');
console.log('  全区间 P80 变化: ' + r.span_pct_across_range + '%');
console.log('  可信区间: ' + (r.reliable_range ? r.reliable_range.from + '–' + r.reliable_range.to + ' rpm（' + r.reliable_range.count + ' 点）' : '—'));
console.log('  外推区间: ' + (r.extrapolated_range ? r.extrapolated_range.from + '–' + r.extrapolated_range.to + ' rpm（' + r.extrapolated_range.count + ' 点）' : '无'));
console.log('');
console.log('  ── 必读声明 ──');
console.log('  · ' + r.what_this_shows);
console.log('  · ' + r.known_limitation);
console.log('  · ' + r.boundary);
console.log('');
console.log('  ── 怎么用 ──');
console.log('  ' + r.how_to_use);
console.log('');
console.log('  出处: ' + r.source);
console.log('');
