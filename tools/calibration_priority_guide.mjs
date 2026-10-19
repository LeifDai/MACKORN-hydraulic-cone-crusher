/**
 * 标定优先级指南 —— 把「哪个参数最影响结果」变成「先去测什么、怎么测、测完能收窄多少」
 *
 * 为什么需要它：
 *   不确定度分析已经能说出「主导误差源是啮合区宽度系数（75.9%）」，
 *   但工程师拿到这句话仍然不知道下一步做什么。
 *   本脚本把敏感度排名翻译成【可执行的现场动作清单】：
 *     测什么 → 用什么方法 → 需要几个样本 → 预期能收窄到多少
 *
 * 数据来源：真实跑不确定度分析，不手写数字。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', '03_验证与基准');
mkdirSync(OUT, { recursive: true });

const U = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'uncertainty.mjs')).href);

/* ── 现场动作手册：每个参数对应「怎么测」 ── */
const HOW_TO_MEASURE = {
  throwFactor: {
    name: '啮合区宽度系数',
    what: '物料在破碎腔内的实际啮合（压缩）区宽度 —— 决定 K1/K2 与哪些粒级被判为「已碎」',
    how: [
      '方案 A（推荐）：做一次【满腔给料试验】—— 记录实际给料粒度分布与产品粒度分布，用 mackorn_calibrate 反算',
      '方案 B：测量破碎腔在不同开口下的实际排料口形状（铅丝/蜡饼压痕法），得到 K1 与 K2 的实测值',
      '方案 C：查该机型的腔型图纸，取啮合区实际长度与偏心距的比值',
    ],
    samples: '同一工况 3 组以上（不同班次或不同批次），才能区分「稳定值」与「偶然值」',
    cost: '低（一次生产性试验即可，不需停机改造）',
  },
  gamma: {
    name: 'γ 破碎函数粗端指数',
    what: '破碎后粗粒级（接近给料粒度）的生成比例随粒度的衰减速率',
    how: [
      '做【单颗粒或料层压缩试验】：同一粒级样品在不同载荷下破碎，筛析产品',
      '或用现场数据：同机型、同物料、不同 CSS 的 3 组以上给料/产品筛析配对，联合反算 φ/γ/β',
      '注意：γ 与 β 会互相补偿，必须同时标定，不能单独定一个',
    ],
    samples: '≥ 3 组不同 CSS 的配对数据（只测一个 CSS 无法分离 γ 与 β）',
    cost: '中（需安排试验与筛析，但不需要设备改造）',
  },
  phi: {
    name: 'φ 破碎函数粗粒生成占比',
    what: '一次破碎中「产生较大碎片」与「产生细粉」的比例分配',
    how: [
      '与 γ/β 联合反算（同一批数据）',
      '若做过落重试验（JK 落重），可直接取 t10 曲线拟合',
    ],
    samples: '与 γ/β 共用同一批数据',
    cost: '低（复用 γ/β 的数据）',
  },
  beta: {
    name: 'β 破碎函数细端指数',
    what: '细粒（远小于给料粒度）的生成速率',
    how: ['与 γ/β 联合反算', '细端最好用激光粒度或沉降法补充 <0.5mm 的数据'],
    samples: '与 γ/β 共用，但需细端数据支撑',
    cost: '低—中',
  },
};

/* ── 跑真实敏感度分析 ── */
const CASES = [
  { name: '中碎工况', cssMm: 40, feedP80Mm: 200 },
  { name: '细碎工况', cssMm: 16, feedP80Mm: 120 },
  { name: '超细碎工况', cssMm: 8, feedP80Mm: 60 },
];

console.log('\n' + '═'.repeat(100));
console.log('  标定优先级指南（数据由真实敏感度分析生成，非手写）');
console.log('═'.repeat(100) + '\n');

const runs = [];
for (const c of CASES) {
  const r = U.p80WithUncertainty({ cssMm: c.cssMm, feedP80Mm: c.feedP80Mm });
  runs.push({ ...c, result: r });
  console.log('  ── ' + c.name + '（CSS ' + c.cssMm + ' mm / 给料 P80 ' + c.feedP80Mm + ' mm）──');
  console.log('     P80 = ' + r.point_estimate_mm + ' mm　区间 ' + r.interval_mm[0] + '–' + r.interval_mm[1] + ' mm　±' + r.sigma_pct + '%　分级 ' + r.confidence_grade);
  console.log('     敏感度排序：');
  r.contributions.forEach((x, i) => {
    console.log('       ' + (i + 1) + '. ' + String(x.contribution_pct).padStart(5) + '%  ' + x.label.padEnd(24) + ' P80 ' + x.p80_at_lo + ' ~ ' + x.p80_at_hi + ' mm');
  });
  console.log('');
}

/* ── 提炼优先级：按「跨工况平均贡献」排序 ── */
const agg = {};
for (const run of runs) {
  for (const c of run.result.contributions) {
    (agg[c.param] ||= { param: c.param, label: c.label, vals: [], lo: c.range[0], hi: c.range[1] }).vals.push(c.contribution_pct);
  }
}
const ranked = Object.values(agg).map((a) => ({
  param: a.param, label: a.label,
  avg_contribution_pct: +(a.vals.reduce((x, y) => x + y, 0) / a.vals.length).toFixed(1),
  max_contribution_pct: Math.max(...a.vals),
  range: [a.lo, a.hi],
})).sort((a, b) => b.avg_contribution_pct - a.avg_contribution_pct);

console.log('  ══ 标定优先级（跨 3 个工况的平均贡献）══\n');
console.log('  排名  参数                    平均贡献   最高贡献   当前区间');
console.log('  ' + '─'.repeat(84));
ranked.forEach((r, i) => {
  console.log('   ' + (i + 1) + '.  ' + r.label.padEnd(22) + String(r.avg_contribution_pct).padStart(7) + '%' + String(r.max_contribution_pct).padStart(10) + '%   [' + r.range[0] + ', ' + r.range[1] + ']');
});

/* ── 生成行动指南 ── */
const lines = [];
lines.push('# 标定优先级行动指南');
lines.push('');
lines.push('> 本指南由 `tools/calibration_priority_guide.mjs` 真跑敏感度分析生成，**不是手写**。');
lines.push('> 生成时间：' + new Date().toISOString().slice(0, 19).replace('T', ' '));
lines.push('');
lines.push('## 一句话结论');
lines.push('');
const top = ranked[0];
lines.push('**先测「' + top.label + '」** —— 它解释了平均 ' + top.avg_contribution_pct + '% 的预测不确定度，是所有参数里影响最大的。');
lines.push('');
lines.push('## 当前不确定度（实测）');
lines.push('');
lines.push('| 工况 | CSS mm | 给料 P80 mm | 预测 P80 mm | 误差区间 mm | ±% | 置信分级 |');
lines.push('|:---|--:|--:|--:|:---|--:|:--:|');
for (const r of runs) {
  lines.push('| ' + r.name + ' | ' + r.cssMm + ' | ' + r.feedP80Mm + ' | ' + r.result.point_estimate_mm + ' | ' + r.result.interval_mm[0] + '–' + r.result.interval_mm[1] + ' | ' + r.result.sigma_pct + ' | ' + r.result.confidence_grade + ' |');
}
lines.push('');
lines.push('## 标定优先级（跨工况平均）');
lines.push('');
lines.push('| 优先级 | 参数 | 平均贡献 | 最高贡献 | 文献区间 | 现场怎么测 | 需要几个样本 | 成本 |');
lines.push('|:--:|:---|--:|--:|:---|:---|:---|:---|');
ranked.forEach((r, i) => {
  const h = HOW_TO_MEASURE[r.param] || {};
  lines.push('| ' + (i + 1) + ' | ' + r.label + ' | ' + r.avg_contribution_pct + '% | ' + r.max_contribution_pct + '% | [' + r.range[0] + ', ' + r.range[1] + '] | ' + (h.how ? h.how[0] : '—') + ' | ' + (h.samples || '—') + ' | ' + (h.cost || '—') + ' |');
});
lines.push('');
lines.push('## 逐参数动作卡');
lines.push('');
for (const r of ranked) {
  const h = HOW_TO_MEASURE[r.param];
  if (!h) continue;
  lines.push('### ' + (ranked.indexOf(r) + 1) + '. ' + h.name + '（' + r.param + '）—— 平均贡献 ' + r.avg_contribution_pct + '%');
  lines.push('');
  lines.push('**它是什么**：' + h.what);
  lines.push('');
  lines.push('**怎么测**：');
  for (const s of h.how) lines.push('- ' + s);
  lines.push('');
  lines.push('**需要多少样本**：' + h.samples);
  lines.push('');
  lines.push('**成本**：' + h.cost);
  lines.push('');
  lines.push('**当前文献区间**：[' + r.range[0] + ', ' + r.range[1] + ']　→ 标定后应替换为实测值');
  lines.push('');
}
lines.push('## 重要提醒');
lines.push('');
lines.push('1. **γ 与 β 必须同时标定** —— 它们会互相补偿，单独定一个会得到错误的组合。');
lines.push('2. **只测一个 CSS 不够** —— 无法分离 γ 与 β。至少要 3 组不同 CSS 的给料/产品筛析配对。');
lines.push('3. **设备参数（转速、偏心距）不算标定项** —— 查铭牌或实测即可确定，属于「规格」不属于「模型参数」。');
lines.push('4. **标定后的区间能收窄多少** —— 取决于实测数据的质量与工况覆盖度，本指南不作承诺；须用 `mackorn_calibrate` 的拟合优度（RMSE）实测判断。');
lines.push('5. **本指南的敏感度基于【文献区间端点法】** —— 反映的是「若参数在文献区间内变化，输出会变多少」，不是「真实误差有多大」。');
lines.push('');
lines.push('## 怎么用这套流程');
lines.push('');
lines.push('```');
lines.push('# 1. 收集现场数据：同一工况的给料筛析 + 产品筛析 + CSS，至少 3 组不同 CSS');
lines.push('# 2. 调用标定工具反算参数');
lines.push('mackorn_calibrate  css_mm=16  feed_points=[...]  product_points=[...]');
lines.push('# 3. 看拟合优度：RMSE < 0.06 视为可用；否则补数据或检查测量方法');
lines.push('# 4. 标定结果写入知识库（来源标记「实测」）后，选型与仿真自动优先使用实测值');
lines.push('# 5. 重跑 node tools/validate_model.mjs 与公开基准，确认区间确实收窄');
lines.push('```');
lines.push('');

const md = lines.join('\n');
writeFileSync(join(OUT, '标定优先级行动指南.md'), md, 'utf8');
writeFileSync(join(OUT, 'calibration-priority.json'), JSON.stringify({
  generated: new Date().toISOString(),
  method: '真跑 uncertainty.mjs 的敏感度分析（确定性区间传播），按跨工况平均贡献排序',
  caveat: '敏感度基于文献区间端点法，反映参数在文献区间内变化时输出的变化量，不等同于真实误差',
  runs: runs.map((r) => ({ case: r.name, cssMm: r.cssMm, feedP80Mm: r.feedP80Mm, p80: r.result.point_estimate_mm, interval: r.result.interval_mm, sigma_pct: r.result.sigma_pct, grade: r.result.confidence_grade, contributions: r.result.contributions })),
  ranked,
  how_to_measure: HOW_TO_MEASURE,
}, null, 2), 'utf8');

console.log('\n  ✅ distribution/03_验证与基准/标定优先级行动指南.md');
console.log('  ✅ distribution/03_验证与基准/calibration-priority.json');
console.log('');
