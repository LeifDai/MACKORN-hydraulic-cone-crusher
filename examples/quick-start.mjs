/**
 * 最小可运行示例 —— 30 秒看懂怎么用
 *
 * 运行：
 *     node examples/quick-start.mjs
 *
 * 零依赖，直接 import 引擎函数。
 * 想看 MCP 调用方式（给 AI 用的），见 examples/mcp-client.mjs。
 *
 * ⚠️ 参数名是【驼峰】（targetTph / maxFeedMm / targetProductMm），
 *    与 MCP 工具层的下划线形式不同 —— 两者命名风格不同，别混。
 */
import { selectConeCrusher, checkCapacity, sizePlant } from '../plugin/lib/engine.mjs';

const line = (s) => console.log('\n' + '═'.repeat(78) + '\n  ' + s + '\n' + '═'.repeat(78));
const rng = (a) => (Array.isArray(a) ? a[0] + '–' + a[1] : String(a));
const showA = (o) => {
  const a = o.assumptions || [];
  if (!a.length) return;
  console.log('\n  📌 假设（' + a.length + ' 条）—— 这个项目最重要的习惯就是读它们：');
  for (const x of a.slice(0, 5)) console.log('    · [' + (x.source || '?') + '] ' + (x.assumption || x.text || x));
};
const showW = (o) => {
  const w = o.warnings || [];
  if (!w.length) return;
  console.log('\n  ⚠️ 警告（' + w.length + ' 条）：');
  for (const x of w.slice(0, 5)) console.log('    · ' + (typeof x === 'string' ? x : (x.text || JSON.stringify(x))));
};

/* ══════════════════════════════════════════════════════════════════
 * 例 1：给一个产量，选机型 + 腔型 + CSS
 * ══════════════════════════════════════════════════════════════════ */
line('例 1 · 选型：300 t/h 花岗岩中碎，给料最大 200 mm');

const sel = selectConeCrusher({
  targetTph: 300,
  maxFeedMm: 200,
  ore: '花岗岩 f=12-14',
  stage: '中碎',
});

console.log('  推荐台数：' + sel.recommended_units + ' 台 × ' + sel.per_unit_tph + ' t/h');
console.log('  腔型池：' + JSON.stringify(sel.recommended_cavity_pool));
console.log('  池的依据：' + (sel.cavity_pool_basis || '—'));

if (sel.top_pick) {
  const t = sel.top_pick;
  console.log('\n  首选：' + t.model + ' / ' + t.cavity + ' 腔 / CSS ' + t.css_mm + ' mm');
  console.log('    产能区间：' + rng(t.capacity_tph) + ' t/h（保守值 ' + t.capacity_conservative_tph + '）');
  console.log('    P80 估计：' + rng(t.p80_estimate_mm) + ' mm');
  console.log('    功率：' + t.power_kw + ' kW · 重量：' + (t.weight_t ?? '?') + ' t');
  console.log('    CSS 取值依据：' + (t.css_basis || '—'));
}
if (Array.isArray(sel.candidates) && sel.candidates.length) {
  console.log('\n  候选（前 3）：');
  for (const c of sel.candidates.slice(0, 3)) {
    console.log('    · ' + c.model + ' ' + c.cavity + ' 腔 @ CSS ' + c.css_mm + 'mm'
      + '  →  ' + rng(c.capacity_tph) + ' t/h'
      + '  ' + (c.capacity_ok ? '✅ 达标' : '⚠ 不足'));
  }
}
showA(sel);
showW(sel);

/* ══════════════════════════════════════════════════════════════════
 * 例 2：复核一台既有设备的产能
 * ══════════════════════════════════════════════════════════════════ */
line('例 2 · 复核：现场一台 NH400 配 EC 腔，CSS 开在 16 mm，能出多少？');

const cap = checkCapacity({ model: 'NH400', cavity: 'EC', css: 16 });

console.log('  ' + cap.model + ' / ' + cap.cavity + ' 腔 / CSS ' + cap.css + ' mm');
console.log('  产能区间：' + cap.capacity_min_tph + ' – ' + cap.capacity_rated_tph + ' t/h');
console.log('  电机功率：' + cap.power_kw + ' kW');
console.log('  最大给料：' + cap.max_feed_mm + ' mm');
console.log('  排矿口范围：' + JSON.stringify(cap.css_range_mm));
console.log('  重量：' + cap.weight_kg + ' kg');
console.log('  依据：' + cap.basis);
showA(cap);
showW(cap);
console.log('\n  💡 算不出的字段返回 null，绝不估算 —— 这是设计如此。');

/* ══════════════════════════════════════════════════════════════════
 * 例 2b：哨兵值防护（真实案例）
 * ══════════════════════════════════════════════════════════════════ */
line('例 2b · 数据防护：C 腔 CSS 16mm 那一格（参数表里是哨兵值）');

const sus = checkCapacity({ model: 'NH400', cavity: 'C', css: 16 });
console.log('  工具给出：' + sus.capacity_rated_tph + ' t/h');
console.log('  而 NH400 机型上限约 500 t/h —— 显然不合理。');
if (sus.warnings && sus.warnings.length) {
  console.log('\n  ✅ 工具没有静默输出，而是告警了：');
  for (const w of sus.warnings) console.log('    · ' + w);
}
console.log('\n  💡 这一格已报给 MACKORN 核对纸质参数表。');
console.log('     「宁可告警，也不要把可疑数字当真实值输出。」');

/* ══════════════════════════════════════════════════════════════════
 * 例 3：把一条线配出来
 * ══════════════════════════════════════════════════════════════════ */
line('例 3 · 整线：500 t/h 砂石骨料线，原矿最大 600 mm，成品 20 mm 以下');

const plant = sizePlant({
  targetTph: 500,
  maxFeedMm: 600,
  targetProductMm: 20,
  closedCircuit: true,
});

console.log('  返回字段：');
console.log('    ' + Object.keys(plant).join(', '));
for (const [k, v] of Object.entries(plant)) {
  if (v == null) continue;
  if (Array.isArray(v) || typeof v === 'object') {
    console.log('\n  ' + k + '：');
    console.log('    ' + JSON.stringify(v).slice(0, 300));
  } else {
    console.log('  ' + k + ' = ' + v);
  }
}
showA(plant);
showW(plant);

/* ══════════════════════════════════════════════════════════════════ */
line('三条硬规矩（它们比结果本身更重要）');
console.log('  ① 未知 → null，绝不估算');
console.log('  ② 每个结论带来源等级（S1 厂商 / S2 标准 / S3 文献 / S4 经验 / S5 手册）');
console.log('  ③ 冲突数据并列保留，绝不取平均');
console.log('');
console.log('  完整文档：https://mackorn.cn/ai/');
console.log('  许可证：MIT');
console.log('');
