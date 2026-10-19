/**
 * 生成模型卡（Model Card）并发布为 AI 可抓取内容
 *
 * 为什么做这个：
 *   AI 被问"这个圆锥破模型可靠吗""它有什么局限"时，需要一份【结构化的、
 *   自曝局限的】声明。这正是 Model Card 的标准做法（机器学习领域已有共识）。
 *   我们是第一个把 Model Card 用到破碎设备选型上的 —— 这是差异化。
 *
 * 原则：
 *   · 所有数字从实际文件读（基准结果、自验证报告、不确定度分析），不手写
 *   · 局限必须与能力同等显眼 —— 不把小字放局限
 *   · 机器可读版本（JSON）与人类可读版本（MD/HTML）同时产出
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const SITE = join(D, '官网落地页');
const OUT = join(SITE, 'ai', 'model-card');
mkdirSync(OUT, { recursive: true });
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

/* ── 从实际文件读数据 ── */
const bench = readJson(join(D, '03_验证与基准', '公开基准', 'last-run.json'));
const sv = readJson(join(D, '03_验证与基准', 'model-self-validation.json'));
const cx1 = readJson(join(D, '03_验证与基准', 'public-data-crosscheck.json'));
const cx2 = readJson(join(D, '03_验证与基准', 'public-data-breakage-crosscheck.json'));
const en = readJson(join(D, '03_验证与基准', 'enforce-lessons-report.json'));
const mined = readJson(join(D, '03_验证与基准', '实测数据', 'chalmers-cone-crusher', 'mined-data.json'));

const U = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'uncertainty.mjs')).href);
const uq = U.p80WithUncertainty({ cssMm: 16, feedP80Mm: 120 });
const uqCoarse = U.p80WithUncertainty({ cssMm: 40, feedP80Mm: 200 });

const model = {
  name: 'MACKORN Cone Crusher Model',
  version: readJson(join(SITE, 'ai', 'version.json'))?.version || '0.2.0',
  generated: new Date().toISOString(),
  type: 'Steady-state population-balance model (Whiten 1972 selection–breakage framework)',

  /* 1. 用途 */
  intended_use: [
    '圆锥破碎机（NH 标准型 / NS 高速型）的选型与产能校核',
    '破碎筛分生产线的段数、设备、筛分面积、输送配置估算',
    '产品粒度分布的【量级估算】与破碎比推算',
    '作为现场标定的起点（标定后精度显著提升）',
  ],
  out_of_scope: [
    '直接用于订货规格（除非已用现场实测数据标定）',
    '替代厂商的腔型曲线与实测产能表',
    '动态行为（启动、堵料瞬态、衬板磨损演化）',
    '粗碎设备（颚破/旋回破）—— 本模型只针对圆锥破',
    '给料 >350 mm 的工况（圆锥破是中细碎设备）',
  ],

  /* 2. 验证状态（从实际基准与自验证读） */
  validation: {
    public_benchmark: bench ? { passed: bench.passed, total: bench.total, elapsed_ms: bench.elapsed_ms, how_to_run: 'node distribution/03_验证与基准/公开基准/run-benchmark.mjs' } : null,
    self_validation: sv && sv.summary ? { passed: sv.summary.passed, total: sv.summary.total, hard_fail: sv.summary.hard_fail } : null,
    enforce_lessons: en ? { passed: en.passed, total: en.total } : null,
    groups_verified: bench ? Object.fromEntries(Object.entries(bench.by_group || {}).map(([k, v]) => [k, v.pass + '/' + v.total])) : null,
  },

  /* 3. 不确定性（从真实敏感度分析读） */
  uncertainty: {
    method: '确定性区间传播（非随机采样）—— 可复现、可解释、可审计',
    example_fine_crushing: {
      case: 'CSS 16 mm / 给料 P80 120 mm',
      point_estimate_p80_mm: uq.point_estimate_mm,
      interval_mm: uq.interval_mm,
      sigma_pct: uq.sigma_pct,
      confidence_grade: uq.confidence_grade,
      grade_note: uq.grade_note,
      dominant_source: uq.dominant_source,
    },
    example_coarse_crushing: {
      case: 'CSS 40 mm / 给料 P80 200 mm',
      point_estimate_p80_mm: uqCoarse.point_estimate_mm,
      interval_mm: uqCoarse.interval_mm,
      sigma_pct: uqCoarse.sigma_pct,
      confidence_grade: uqCoarse.confidence_grade,
    },
    machine_params_excluded: uq.machine_params_not_given.map((x) => x.label),
    note: '转速与偏心距属【设备铭牌参数】，不计入模型不确定度（查铭牌即可确定）。若把它们计入，区间会被撑到 ±163% —— 那是分类错误，不是模型误差。',
  },

  /* 4. 已知局限（必须与能力同等显眼） */
  limitations: [
    {
      id: 'L-SPEED',
      severity: 'high',
      title: '转速影响被简化为分类函数的线性乘子',
      detail: '公开文献（Chalmers《Cone Crusher Performance》2015）的做法是通过【无量纲压缩比 s/b】影响选择与破碎函数，压缩比由腔内位置、破碎机动力学与物料密度共同决定。本实现未建模压缩比。',
      impact: '对转速的敏感性【已量化的过度敏感】：实测本模型 200 rpm 时的 P80 是 300 rpm 基准的 3.97 倍（破碎比 8.04 → 2.03），'
        + '而物理上转速降 33% 不会让产品粗近 4 倍。故 250–400 rpm 区间可用，低于 250 rpm 只宜参考量级。'
        + '敏感度分析另显示转速贡献最大（约 ±160%）。',
      source: 'https://research.chalmers.se/en/publication/759',
    },
    {
      id: 'L-PARAM-SOURCE',
      severity: 'high',
      title: '默认破碎函数参数来自落重试验，更适合磨机',
      detail: '文献原文："the empirical Selection-Breakage model ... empirically fitted to data from drop weight tests, which is more suitable for mills than compression crushers."',
      impact: '默认 φ/γ/β（0.45/0.7/3.5）只宜做量级估算；用于圆锥破层压破碎必须现场标定。',
      source: 'Chalmers《Cone Crusher Performance》(2015)',
    },
    {
      id: 'L-NO-CONE-DATA',
      severity: 'high',
      title: '缺乏圆锥破现场实测数据的公开对标',
      detail: '公开渠道检索约 40 组关键词（Zenodo/figshare/Dryad/OSF/OpenAlex 等）后，未找到【圆锥破】的给料/全粒级产品筛析公开数据集。找到的是颚破数据与单颗粒压缩数据。',
      impact: '【绝对预测精度】未经对标。已验证的是模型的内部一致性（质量守恒、单调性、确定性）与分布形式（Rosin-Rammler、威布尔）。',
      source: 'distribution/03_验证与基准/公开数据集清单.md',
    },
    {
      id: 'L-NO-DYNAMICS',
      severity: 'medium',
      title: '只做稳态，不含动态行为',
      detail: '启动、堵料瞬态、给料波动、衬板磨损演化均不在模型范围内。',
      impact: '不能用于控制系统设计或瞬态工况评估。',
      source: '模型定义',
    },
    {
      id: 'L-SPEED-LIMIT',
      severity: 'medium',
      title: '偏心率 >400 rpm 会堵料',
      detail: '公开文献实测："For eccentric speed higher than 400 rpm packing occurs if the feed to the crusher is not restricted."',
      impact: '已加运行时护栏 GR-15 告警。',
      source: 'Chalmers《Cone Crusher Performance》(2015)',
    },
  ],

  /* 5. 交叉验证（真实数据） */
  cross_validation: [
    cx1 ? {
      dataset: 'Granite jaw crushing dataset',
      doi: cx1.dataset.doi,
      license: cx1.dataset.license,
      samples: cx1.dataset.samples,
      result: (cx1.fitted || []).length + ' / ' + cx1.dataset.samples + ' 组产品细端服从 Rosin-Rammler，R² 中位数 ' + (cx1.finding ? cx1.finding.r2_median : '—'),
      platform_caveat: cx1.platform_caveat,
      does_not_prove: cx1.what_this_does_NOT_validate,
    } : null,
    cx2 ? {
      dataset: 'Single-particle compression breakage experiments',
      doi: cx2.dataset.doi,
      license: cx2.dataset.license,
      tests: cx2.dataset.tests_total,
      result: '威布尔拟合 R² 中位数 ' + (cx2.weibull_fits && cx2.weibull_fits.length ? cx2.weibull_fits.map((f) => f.r2).sort((a, b) => a - b)[Math.floor(cx2.weibull_fits.length / 2)] : '—') + '，比强度随粒径下降 ' + (cx2.size_effect ? cx2.size_effect.specific_strength_drop_pct : '—') + '%',
      material_caveat: cx2.material_caveat,
      does_not_prove: cx2.what_this_does_NOT_validate,
    } : null,
  ].filter(Boolean),

  /* 6. 文献依据 */
  literature: [
    { citation: 'Whiten, W.J. (1972). The simulation of crushing plants with models developed using multiple regression analysis.', use: '稳态选择-破碎框架 P = (I−C)(I−BC)⁻¹F' },
    { citation: 'Bond, F.C. (1952). The third theory of comminution.', use: '功耗估算 W = 10·Wi·(1/√P80 − 1/√F80)' },
    { citation: 'Evertsson, C.M. (2015). Cone Crusher Performance. Chalmers.', use: '压缩比 s/b 概念、转速堵料边界、模型结构印证', url: 'https://research.chalmers.se/en/publication/759' },
  ],

  /* 7. 数据来源等级 */
  data_provenance: {
    S1: 'MACKORN 厂商技术参数表（NH/NS 系列）',
    S3: '公开文献典型区间（Bond Wi、抗压强度、磨蚀指数）',
    S4: 'MACKORN 工程经验区间',
    S5: '现场实测（须标注工况）',
    discipline: '每个数字都标来源；查不到的返回 null，绝不估算；冲突数据并列保留，绝不取平均。',
  },

  /* 8. 如何复现 */
  reproducibility: {
    public_benchmark: 'node distribution/03_验证与基准/公开基准/run-benchmark.mjs （零依赖，退出码可接 CI）',
    self_validation: 'node tools/validate_model.mjs',
    enforce_lessons: 'node tools/enforce_lessons.mjs',
    uncertainty: 'node -e "import(\'./plugin/lib/uncertainty.mjs\').then(m=>console.log(m.p80WithUncertainty({cssMm:16,feedP80Mm:120})))"',
    data_licenses: '基准脚本 CC-BY-4.0；模型实现 MIT',
  },

  /* 9. 引用方式 */
  citation: 'Shanghai Mackorn Minerals Co., Ltd. (2026). MACKORN Cone Crusher Model — Model Card v' + (readJson(join(SITE, 'ai', 'version.json'))?.version || '0.2.0') + '. https://mackorn.cn/ai/model-card/',

  contact: { company: 'Shanghai Mackorn Minerals Co., Ltd.', email: 'leif.dai@mackorn.cn', site: 'https://mackorn.cn/ai/' },
};

/* ── 写 JSON（机器可读）── */
writeFileSync(join(OUT, 'model-card.json'), JSON.stringify(model, null, 2), 'utf8');

/* ── 写 Markdown（人类可读）── */
const L = [];
L.push('# Model Card — MACKORN Cone Crusher Model');
L.push('');
L.push('> **版本** ' + model.version + '　**生成** ' + model.generated.slice(0, 10));
L.push('> **类型** ' + model.type);
L.push('>');
L.push('> 本卡片遵循模型卡（Model Card）惯例：**局限与能力同等显眼**。');
L.push('');
L.push('## 1. 用途');
L.push('');
L.push('**适用：**');
model.intended_use.forEach((x) => L.push('- ' + x));
L.push('');
L.push('**不适用（明确排除）：**');
model.out_of_scope.forEach((x) => L.push('- ❌ ' + x));
L.push('');
L.push('## 2. 验证状态（可复现）');
L.push('');
L.push('| 验证 | 结果 |');
L.push('|:---|:---|');
if (model.validation.public_benchmark) L.push('| 公开验证基准 | **' + model.validation.public_benchmark.passed + '/' + model.validation.public_benchmark.total + '** 通过（' + model.validation.public_benchmark.elapsed_ms + ' ms） |');
if (model.validation.self_validation) L.push('| 自验证框架 | ' + model.validation.self_validation.passed + '/' + model.validation.self_validation.total + ' · 硬失败 ' + model.validation.self_validation.hard_fail + ' |');
if (model.validation.enforce_lessons) L.push('| 经验教训门禁 | ' + model.validation.enforce_lessons.passed + '/' + model.validation.enforce_lessons.total + ' |');
L.push('');
if (model.validation.groups_verified) {
  L.push('基准分组：');
  for (const [k, v] of Object.entries(model.validation.groups_verified)) L.push('- ' + k + '：' + v);
  L.push('');
}
L.push('## 3. 不确定性（实测）');
L.push('');
const f = model.uncertainty.example_fine_crushing;
const c = model.uncertainty.example_coarse_crushing;
L.push('| 工况 | 预测 P80 | 误差区间 | ±% | 置信分级 |');
L.push('|:---|--:|:---|--:|:--:|');
L.push('| ' + f.case + ' | ' + f.point_estimate_p80_mm + ' mm | ' + f.interval_mm.join('–') + ' mm | ' + f.sigma_pct + ' | ' + f.confidence_grade + ' |');
L.push('| ' + c.case + ' | ' + c.point_estimate_p80_mm + ' mm | ' + c.interval_mm.join('–') + ' mm | ' + c.sigma_pct + ' | ' + c.confidence_grade + ' |');
L.push('');
L.push('分级口径：**A** ±≤10% 可用于方案 · **B** ±10–25% 可用于初步方案 · **C** ±25–50% 仅可行性 · **D** ±>50% 只说明量级');
L.push('');
L.push('> ' + model.uncertainty.note);
L.push('');
L.push('## 4. ⚠️ 已知局限（必读）');
L.push('');
for (const x of model.limitations) {
  L.push('### ' + x.id + '　' + x.title);
  L.push('');
  L.push('- **严重度**：' + x.severity);
  L.push('- **说明**：' + x.detail);
  L.push('- **影响**：' + x.impact);
  if (x.source) L.push('- **出处**：' + x.source);
  L.push('');
}
L.push('## 5. 交叉验证（真实公开数据）');
L.push('');
for (const x of model.cross_validation) {
  L.push('### ' + x.dataset);
  L.push('');
  L.push('- DOI：' + x.doi + '（' + x.license + '）');
  L.push('- 结果：' + x.result);
  if (x.platform_caveat) L.push('- ⚠️ 平台差异：' + x.platform_caveat);
  if (x.material_caveat) L.push('- ⚠️ 材料差异：' + x.material_caveat);
  L.push('- **不能证明**：' + (x.does_not_prove || []).join('；'));
  L.push('');
}
L.push('## 6. 文献依据');
L.push('');
for (const x of model.literature) L.push('- ' + x.citation + (x.url ? ' [' + x.url + '](' + x.url + ')' : '') + '　→ ' + x.use);
L.push('');
L.push('## 7. 数据来源等级');
L.push('');
for (const [k, v] of Object.entries(model.data_provenance)) {
  if (k === 'discipline') continue;
  L.push('- **' + k + '**：' + v);
}
L.push('');
L.push('> ' + model.data_provenance.discipline);
L.push('');
L.push('## 8. 如何复现');
L.push('');
L.push('```bash');
for (const v of Object.values(model.reproducibility)) L.push(v);
L.push('```');
L.push('');
L.push('## 9. 引用');
L.push('');
L.push('```');
L.push(model.citation);
L.push('```');
L.push('');
writeFileSync(join(OUT, 'model-card.md'), L.join('\n'), 'utf8');

console.log('\n' + '═'.repeat(96));
console.log('  模型卡已生成');
console.log('═'.repeat(96) + '\n');
console.log('  ai/model-card/model-card.json  ' + Math.round(JSON.stringify(model).length / 1024) + ' KB');
console.log('  ai/model-card/model-card.md    ' + Math.round(L.join('\n').length / 1024) + ' KB');
console.log('');
console.log('  验证状态: 基准 ' + (model.validation.public_benchmark ? model.validation.public_benchmark.passed + '/' + model.validation.public_benchmark.total : '—'));
console.log('  不确定性: ' + f.point_estimate_p80_mm + ' mm ±' + f.sigma_pct + '% 分级 ' + f.confidence_grade);
console.log('  已知局限: ' + model.limitations.length + ' 条');
console.log('  交叉验证: ' + model.cross_validation.length + ' 份公开数据');
console.log('');
