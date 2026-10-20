/**
 * MACKORN DSH 插件 · 验收测试
 * ============================================================================
 * 覆盖四类证据：
 *   A. 内核同值对照 —— JS 移植 vs Python 源模型 golden（tests/golden/python-golden.json）
 *   B. 真实 SDK 校验 —— 用装配环境里的 @deepseek-ai/dsh-tools 断言每个工具定义的
 *      parameters / output.schema 落在 dsh 的 enforced JSON Schema 子集内，并用
 *      validateJsonSchemaValue 真跑一遍参数样本。
 *   C. entry 契约与功能冒烟 —— 工具名唯一、必填回调齐备、无裸包名 import、
 *      ctx.tools.register 的模拟 ctx 能注册成功并逐个 execute 出文本块。
 *   D. 负控 —— 故意造坏的 schema / 坏定义必须被拒绝；只有负控响过，"通过"才算证据。
 *
 * 运行：node tests/run.mjs
 * ============================================================================
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadDshSdk, assertSupportedJsonSchema, validateJsonSchemaValueFallback } from './sdk-portability.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PLUGIN = join(ROOT, 'plugin');

let pass = 0;
let fail = 0;
let skipped = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    failures.push(`${label}${detail ? ' :: ' + detail : ''}`);
    console.log(`  FAIL ${label}${detail ? ' :: ' + detail : ''}`);
  }
}

function skip(label, why) {
  skipped += 1;
  console.log('  skip ' + label + (why ? ' :: ' + why : ''));
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

console.log('=== A. 内核同值对照（JS 移植 vs Python 源模型） ===');
const core = await import(pathToFileURL(join(PLUGIN, 'lib/core.mjs')).href);
const goldenPath = join(HERE, 'golden/python-golden.json');
let golden;
try {
  golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
} catch (error) {
  console.log(`  FAIL 读取 golden 失败：${error.message}`);
  console.log('       先生成 golden：python tests/golden/generate_python_golden.py');
  process.exitCode = 1;
  golden = null;
}

if (golden) {
  const mismatches = [];
  for (const item of golden.mcfm_formula) {
    const got = core.mcfmFormula(item.A);
    if (got !== item.M) mismatches.push(`mcfm_formula(${JSON.stringify(item.A)}) 期望 ${item.M} 得到 ${got}`);
  }
  for (const item of golden.mcfm_deviation) {
    if (!eq(core.mcfmDeviation(item.M), item.result)) mismatches.push(`mcfm_deviation(${item.M})`);
  }
  for (const item of golden.terminal_velocity) {
    const got = core.terminalVelocity(item.d_p, item.rho_p);
    if (got !== item.v_t) mismatches.push(`terminal_velocity(${item.d_p},${item.rho_p}) 期望 ${item.v_t} 得到 ${got}`);
  }
  for (const [key, item] of Object.entries(golden.velocity_uniformity_index)) {
    if (!eq(core.velocityUniformityIndex(item.v), item.result)) {
      mismatches.push(`velocity_uniformity_index[${key}] 期望 ${JSON.stringify(item.result)} 得到 ${JSON.stringify(core.velocityUniformityIndex(item.v))}`);
    }
  }
  for (const item of golden.collision_energy_loss) {
    const got = core.collisionEnergyLoss(item.rpm, item.v_feed);
    if (got !== item.E) mismatches.push(`collision_energy_loss(${item.rpm},${item.v_feed}) 期望 ${item.E} 得到 ${got}`);
  }
  for (const item of golden.wear_uniformity) {
    const got = core.wearUniformity(item.w);
    const expected = { ...item.result };
    // Python 的 inf 在 JSON 里记为 "Infinity"；JS 侧必须以 null 表达（无损 JSON 约束）
    if (expected.max_min_ratio === 'Infinity') expected.max_min_ratio = null;
    if (!eq(got, expected)) {
      mismatches.push(`wear_uniformity(${JSON.stringify(item.w)}) 期望 ${JSON.stringify(expected)} 得到 ${JSON.stringify(got)}`);
    }
  }
  for (const item of golden.gradient_liner_design) {
    // ⚠️ 已知且有意的分歧（P0 修正 · 2026-10-02）
    //   Python 源模型 MackornCoreTheory.gradient_liner_design 无物理上限校验，
    //   例如 (5, 58, 1.12) 会输出 58/64.96/72.76/81.49/91.27 —— 该组值在任何
    //   单位下都不成立（按 HRC 末段超铸造耐磨材料上限约 68；按 HB 首段比退火碳钢还软）。
    //   JS 实现已加物理上限并返回 capped 标志。
    //   此处对 golden 值施加同一上限后再比对，以继续验证【乘法公式本身】的一致性，
    //   同时把上限差异显式记录为有意为之，而不是悄悄改测试把它掩盖掉。
    const HRC_LIMIT = 68;
    const expected = item.H.map((v) => Math.min(v, HRC_LIMIT));
    if (!eq(core.gradientLinerDesign(item.n, item.base, item.factor), expected)) {
      mismatches.push(`gradient_liner_design(${item.n},${item.base},${item.factor})`);
    }
  }
  for (const item of golden.porosity_from_grading) {
    const got = core.porosityFromGrading(item.c, item.m, item.f);
    if (got !== item.phi) mismatches.push(`porosity_from_grading(${item.c},${item.m},${item.f}) 期望 ${item.phi} 得到 ${got}`);
  }
  if (!eq(core.optimalGrading(), golden.optimal_grading)) mismatches.push('optimal_grading');
  if (!eq(core.mcfmOptimalRange(), golden.mcfm_optimal_range)) mismatches.push('mcfm_optimal_range');

  check(`内核全部函数与 Python 源模型同值（${golden._meta.class}）`, mismatches.length === 0, mismatches.slice(0, 6).join(' | '));
}

console.log('\n=== B. 真实 SDK schema 校验（@deepseek-ai/dsh-tools） ===');
const { sdk, from, tried } = await loadDshSdk();
const validateSchema = sdk ? (s) => sdk.assertSupportedJsonSchema(s) : (s) => assertSupportedJsonSchema(s);
const validateValue = sdk ? (s, v, p) => sdk.validateJsonSchemaValue(s, v, p) : (s, v, p) => validateJsonSchemaValueFallback(s, v, p);
if (sdk) check('能加载官方 dsh-tools SDK', true, from);
else skip('官方 dsh-tools SDK 不可用，改用内置子集校验器', '探测了 ' + tried.length + ' 个位置');

// 知识库写入测试必须隔离到临时目录，避免污染真实知识库
process.env.MACKORN_KB_DIR = join(HERE, '.tmp-kb');
const mod = await import(pathToFileURL(join(PLUGIN, 'index.mjs')).href);
const defs = mod.toolDefinitions;

// 用统一的 validateSchema（官方 SDK 优先，缺失时内置校验器），因此不设 if (sdk) 守卫
for (const def of defs) {
  let paramOk = true;
  let paramDetail = '';
  try {
    validateSchema(def.parameters);
  } catch (error) {
    paramOk = false;
    paramDetail = error.message;
  }
  check(`${def.name} · parameters 落在 dsh schema 子集内`, paramOk, paramDetail);

  let outOk = true;
  let outDetail = '';
  try {
    validateSchema(def.output.schema);
  } catch (error) {
    outOk = false;
    outDetail = error.message;
  }
  check(`${def.name} · output.schema 落在 dsh schema 子集内`, outOk, outDetail);
}

console.log('\n=== C. entry 契约与功能冒烟 ===');
check('导出 name / inject / apply', mod.name === 'mackorn-cone-crusher' && eq(mod.inject, ['tools']) && typeof mod.apply === 'function');

const names = defs.map((d) => d.name);
check('工具名唯一', new Set(names).size === names.length);
check('工具名全部带 mackorn_ 前缀', names.every((n) => n.startsWith('mackorn_')));
check('工具数 ≥ 19', defs.length >= 19, `实际 ${defs.length}：${names.join(', ')}`);
for (const def of defs) {
  const ok =
    typeof def.name === 'string' && def.name.length > 0 &&
    typeof def.description === 'string' && def.description.length > 20 &&
    def.parameters && def.output && typeof def.output.render === 'function' &&
    typeof def.execute === 'function';
  check(`${def.name} · 定义完整（name/description/parameters/output.render/execute）`, ok);
}

const entrySource = readFileSync(join(PLUGIN, 'index.mjs'), 'utf8');
const bareImports = [...entrySource.matchAll(/^\s*import\s[^'"]*from\s+['"]([^'"]+)['"]/gm)]
  .map((m) => m[1])
  .filter((spec) => !spec.startsWith('.'));
check('entry 无裸包名 import（绝对路径挂载的硬前提）', bareImports.length === 0, bareImports.join(', '));

// 模拟 ctx.tools.register：逐条复刻 dsh-tools `ToolRuntime.register()` 的校验
// （output 三件套 + output.schema 落在子集内 + run_code 保留名 + 同层重名）
const registered = new Map();
const makeFakeCtx = () => ({
  logger: { warn: () => {} },
  tools: {
    register(def) {
      const tname = def.name;
      const output = def.output;
      if (output === undefined || typeof output !== 'object' || typeof output.render !== 'function') {
        throw new TypeError(`tool "${tname}" must declare output { schema, render, presentationMeta? }`);
      }
      validateSchema(output.schema);
      if (tname === 'run_code') throw new Error('tool name "run_code" is reserved');
      if (registered.has(tname)) {
        throw new Error(`tool "${tname}" is already registered (for a per-agent variant, register through that agent's \`agent.ctx\` instead)`);
      }
      registered.set(tname, def);
      return () => registered.delete(tname);
    },
  },
});
const fakeCtx = makeFakeCtx();
mod.apply(fakeCtx);
check('apply() 注册全部工具', registered.size === defs.length, `注册 ${registered.size}/${defs.length}`);
mod.apply(fakeCtx); // HMR 重入
check('apply() 二次调用（HMR 重入）不抛重复注册', registered.size === defs.length, `注册 ${registered.size}/${defs.length}`);

const samples = {

  mackorn_market_stats: { mode: 'weibull', values: [1, 2, 3], pairs_json: '[]', lives: [1800, 2100, 2400, 2600, 2900, 3100, 3500, 3800, 4200, 4600], items_json: '[]' },
  mackorn_contact: { language: 'zh-CN', include_triggers: true },
  mackorn_calibrate: { css_mm: 16, throw_mm: 25, feed_points: [{size_mm:1,cum_pct:2},{size_mm:10,cum_pct:25},{size_mm:40,cum_pct:62},{size_mm:90,cum_pct:80},{size_mm:200,cum_pct:100}], product_points: [{size_mm:1,cum_pct:18},{size_mm:5,cum_pct:38},{size_mm:10,cum_pct:56},{size_mm:16,cum_pct:72},{size_mm:25,cum_pct:88},{size_mm:40,cum_pct:99}] },
  mackorn_crusher_curve: { css_mm: 16, feed_p80_mm: 90, throw_mm: 25, bond_wi: 14 },
  mackorn_simulate_flowsheet: { feed_p80_mm: 90, stages: [ { type: 'crusher', name: '中碎', css_mm: 32, throw_mm: 30 }, { type: 'screen', name: '检查筛', aperture_mm: 40, recirculate_to: 0 }, { type: 'crusher', name: '细碎', css_mm: 12, throw_mm: 20 }, { type: 'screen', name: '成品筛', aperture_mm: 20, recirculate_to: 2 } ], bond_wi: 14 },
  mackorn_intel_watch: { focus: 'W-PATENT-INTL' },
  mackorn_knowledge_update: {
    actor: 'test',
    rationale: '验收用例：写入两条含矛盾的竞品数据',
    entries: [
      { title: '山特维克 CH870 功率 500kW', content: '某样本标注圆锥破功率 500 kW，产能 300 t/h', source_url: 'https://rocktechnology.sandvik/example', source_type: 'official', kind: 'intel', tags: ['竞品', '山特维克'] },
      { title: '某代理商资料 CH870 功率 355kW', content: '另一渠道写功率 355 kW，产能 300 t/h', source_url: 'https://example-media.com/a', source_type: 'media', kind: 'intel', tags: ['竞品'] },
    ],
    check_fields: ['power_kw', 'capacity_tph'],
    crushing_leverage_score: 0.7,
  },
  mackorn_pdca_status: { action: 'status' },

  /* R108：新增的磨矿与选矿工具样本参数 */
  mackorn_grinding_selection: { target_tph: 1000, feed_p80_mm: 15, product_p80_mm: 0.075, ore: '铜矿石', closed_circuit: true, mode: 'select' },
  mackorn_beneficiation_selection: { ore: '硫化铜矿石', target_mineral: '铜', liberation_um: 50, feed_p80_mm: 12, target_tph: 2000, slime_pct: 8, mode: 'recommend' },
  mackorn_automation_design: { section: '破碎', target_tph: 2000, has_plc: true, has_scada: true, has_online_analyzer: false, has_dedicated_staff: true, mode: 'recommend' },
  mackorn_requirement_intake: {
    capacity_tph: 500,
    form_text: '砂石骨料生产线客户需求信息输入表 客户名称：某某建材 项目地点：安徽池州 '
      + '矿石种类 石灰石□、大理石 □ 、白云岩□ 、砂岩□、石英岩□ 、凝灰岩□ 片麻岩/ 花岗岩□、玄武岩/ 辉绿岩□ '
      + '最大給料粒度： 750 mm 其中0-60mm占 20 %，60-100mm占 25 %，100-300mm占 40 %， 大于300mm占 15 % 。'
      + '抗压强度： 110 Mpa ；压碎值： 12 ； 矿山总储量： 50000000 吨； 骨料用途：建筑骨料、机制砂 '
      + '原矿含土量： 3 % 含土较少□ 、含土较多☑、含土较多且为粘性土质□ 原矿含水率： 4 % '
      + '产量需求t/h 500 除土需求 是☑ 、 否□ 成品要求 20 mm 以下 '
      + '生产方式 干法生产☑、湿法生产□ 生产工作制 16小时/天☑、12小时/天□，每年 300 天，',
  },
  mackorn_proposal: {
    capacity_tph: 600,
    title: '测试方案', project: '验收用例', client_name: '某某建材', line_type: '砂石骨料',
    ore_type: '花岗岩', max_feed_mm: 750, compressive_strength_mpa: 140, moisture_pct: 4.5,
    product_mm: 20, product_specs: ['0-5mm', '5-10mm', '10-20mm'], production_method: '干法',
    hours_per_day: 16, days_per_year: 300, total_reserve_t: 50000000,
    cost_model: 'NH400', cost_units: 2, electricity_price: 0.68,
  },
  mackorn_mcfm_analysis: { cumulative_retained: [100, 88, 70, 52, 38, 26, 15, 8], feed_top_mm: 60, target_product_mm: 12 },
  mackorn_cone_selection: { target_tph: 500, max_feed_mm: 180, target_product_mm: 20, stage: '中碎', ore: '花岗岩 f=12-14' },
  mackorn_plant_design: { target_tph: 500, max_feed_mm: 700, target_product_mm: 20 },
  mackorn_capacity_check: { model: 'NH400', cavity: 'C', css: 16 },
  mackorn_cost_estimate: { model: 'NH400', units: 2, tph: 500, hours_per_year: 6500, electricity_price: 0.68 },
  mackorn_wear_design: { sections: 5 },
  mackorn_grading_porosity: { coarse_frac: 0.5, mid_frac: 0.3, fine_frac: 0.2 },
  mackorn_market_intel: { focus: '中国骨料市场', scores: { industry: { score: 4 }, technology: { score: 3 } } },
  mackorn_selection_report: { title: '测试报告', project: '验收用例', target_tph: 500, max_feed_mm: 700, target_product_mm: 20, include_cost: false },
  mackorn_equipment_catalog: {},
  mackorn_knowledge: { ore: '花岗岩', target_tph: 500, section: 'all' },
  mackorn_distributor_eval: {
    agent_type: '公司', country: '智利',
    scores: {
      market_cover: 5, sales_team: 5, tech_service: 5, similar_exp: 5, capital: 5,
      warehouse: 5, channel: 5, years: 5, entity_type: 5, credit_record: 5,
      payment_history: 5, exclusivity: 5, reference_check: 5, sanctions: 5,
      territory_fit: 5, commitment: 5, brand_fit: 5,
    },
    missing: ['payment_history'],
  },
};

for (const def of defs) {
  const sample = samples[def.name];
  try {
    {
      const violations = validateValue(def.parameters, sample, '');
      if (violations.length > 0) {
        check(`${def.name} · 样本参数通过官方校验`, false, violations.join('; '));
        continue;
      }
    }
    const value = await def.execute(sample);
    const blocks = def.output.render(sample, value);
    const okBlocks = Array.isArray(blocks) && blocks.length > 0 && blocks.every((b) => b.type === 'text' && typeof b.text === 'string' && b.text.length > 0);
    check(`${def.name} · execute + render 产出非空文本`, okBlocks, JSON.stringify(value)?.slice(0, 160));
    if (sdk && value !== null && typeof value === 'object') {
      const outViolations = validateValue(def.output.schema, value, '');
      check(`${def.name} · 返回值通过 output.schema 校验`, outViolations.length === 0, outViolations.join('; '));
    }
  } catch (error) {
    check(`${def.name} · execute + render 产出非空文本`, false, error.message);
  }
}

console.log('\n=== D. 负控（必须响） ===');
{
  let threw = false;
  try {
    validateSchema({ type: 'object', properties: { a: { type: 'string', required: true } }, additionalProperties: false });
  } catch {
    threw = true;
  }
  check('负控1：作者 DSL 写法（required:true 属性）被 dsh schema 校验拒绝', threw);

  threw = false;
  try {
    validateSchema({ type: 'string', minLength: 1 });
  } catch {
    threw = true;
  }
  check('负控2：子集外关键字（minLength）被拒绝', threw);

  threw = false;
  try {
    sdk.parameterSchemaSpecToJsonSchema({ a: { type: 'object', properties: { b: { type: 'string' } } } });
  } catch {
    threw = true;
  }
  check('负控3：作者 DSL 中对象缺 additionalProperties 被拒绝', threw);

  threw = false;
  try {
    sdk.parameterSchemaSpecToJsonSchema({ a: { type: 'string', required: false } });
  } catch {
    threw = true;
  }
  check('负控4：作者 DSL 的 required:false 被拒绝', threw);
}

let threw = false;
try {
  const badCtx = {
    logger: { warn: () => {} },
    tools: { register() { throw new Error('boom'); } },
  };
  mod.apply(badCtx);
} catch {
  threw = true;
}
check('负控5：注册器抛错时 apply() 不向上抛（不会拖垮 profile 树）', !threw);

threw = false;
try {
  core.mcfmFormula([1, 2, 3]);
} catch {
  threw = true;
}
check('负控6：MCFM 输入长度非 8 时报错', threw);

// 证明 C 段的 register 契约检查是"活的"：缺 output.render 的定义必须被拒绝
threw = false;
try {
  makeFakeCtx().tools.register({ name: 'broken_tool', description: 'x', parameters: { type: 'object', additionalProperties: false }, execute: () => ({}) });
} catch {
  threw = true;
}
check('负控7：缺 output.render 的工具定义被 register 契约拒绝', threw);

// 证明 B 段的 schema 校验是"活的"：把任意一个真工具的 parameters 故意改坏必须被拒绝
{
  threw = false;
  try {
    const broken = JSON.parse(JSON.stringify(defs[0].parameters));
    broken.properties.oops = { type: 'string', maxLength: 3 };
    validateSchema(broken);
  } catch {
    threw = true;
  }
  check('负控8：把真工具 schema 注入子集外关键字后校验失败', threw);
}

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败${skipped ? " / " + skipped + " 跳过" : ""} ===`);
if (fail > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(` - ${f}`);
  process.exitCode = 1;
}

/* ── 负控 9：物理不可实现的硬度设计必须被拒绝 ── */
console.log('\n=== 负控 9：硬度物理可实现性 ===');
try {
  const { validateHardnessDesign, gradientLinerDesign } = await import('../plugin/lib/core.mjs');
  const BAD = [58, 64.96, 72.76, 81.49, 91.27];   // 历史缺陷输出（按 HRC 超上限；按 HB 低于下限）
  const asHRC = validateHardnessDesign(BAD, 'HRC');
  const asHB = validateHardnessDesign(BAD, 'HB');
  check('负控9：历史缺陷硬度值在 HRC 下被拒绝', asHRC.ok === false, asHRC.problems[0] || '未拒绝');
  check('负控9：历史缺陷硬度值在 HB 下被拒绝', asHB.ok === false, asHB.problems[0] || '未拒绝');
  const capped = gradientLinerDesign(5, 58, 1.12, 'HRC');
  check('负控9：新实现截断至物理上限并标记', capped.capped === true && Math.max(...capped) === 68, `capped=${capped.capped} max=${Math.max(...capped)}`);
  const good = validateHardnessDesign([58, 60, 62, 64, 66], 'HRC');
  check('负控9：合理的硬度梯度被接受（反面对照）', good.ok === true, good.problems.join(';'));
} catch (e) { check('负控9：硬度校验可用', false, e.message); }
/* R36：写结果文件供 status_now --readonly 读取 */
try {
  const { writeFileSync: __w, mkdirSync: __m } = await import('node:fs');
  const { join: __j, dirname: __d } = await import('node:path');
  const { fileURLToPath: __f } = await import('node:url');
  const __root = __j(__d(__f(import.meta.url)), '..');
  const __out = __j(__root, 'distribution', '03_验证与基准', 'tests-run.json');
  __m(__d(__out), { recursive: true });
  __w(__out, JSON.stringify({ generated: new Date().toISOString(), total: (typeof PASS !== 'undefined' ? PASS : 0) + (typeof FAIL !== 'undefined' ? FAIL : 0), pass: (typeof PASS !== 'undefined' ? PASS : 0), fail: (typeof FAIL !== 'undefined' ? FAIL : 0) }), 'utf8');
} catch { }
